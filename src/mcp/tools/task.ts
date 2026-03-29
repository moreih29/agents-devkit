import { z } from 'zod';
import { existsSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBranchRoot, RUNTIME_ROOT, getCurrentBranch, ensureDir } from '../../shared/paths.js';
import { readConsult, type ConsultFile } from './consult.js';
import { readDecisions, type DecisionEntry } from './decision.js';
import { textResult } from '../../shared/mcp-utils.js';

function tasksPath(): string {
  return join(getBranchRoot(), 'tasks.json');
}

interface Task {
  id: number;
  title: string;
  context: string;
  status: 'pending' | 'in_progress' | 'completed';
  deps: number[];
  decisions: number[];
  owner?: string;
  created_at?: string;
}

interface TasksFile {
  goal: string;
  tasks: Task[];
}

async function readTasks(): Promise<TasksFile | null> {
  const p = tasksPath();
  if (!existsSync(p)) return null;
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw) as TasksFile;
}

async function writeTasks(data: TasksFile): Promise<void> {
  const root = getBranchRoot();
  ensureDir(root);
  await writeFile(join(root, 'tasks.json'), JSON.stringify(data, null, 2));
}

function computeSummary(tasks: Task[]) {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const pending = tasks.filter((t) => t.status === 'pending').length;
  const blocked = tasks.filter((t) => t.status === 'in_progress').length;

  const completedIds = new Set(tasks.filter((t) => t.status === 'completed').map((t) => t.id));
  const ready = tasks
    .filter((t) => t.status === 'pending' && (t.deps ?? []).every((d) => completedIds.has(d)))
    .map((t) => t.id);

  return { total, completed, pending, blocked, ready };
}

export function registerTaskTools(server: McpServer): void {
  server.tool(
    'nx_task_list',
    'List tasks from .nexus/tasks.json with summary and ready tasks',
    {},
    async () => {
      const data = await readTasks();
      if (!data) {
        return textResult({ exists: false });
      }
      const summary = computeSummary(data.tasks);
      return textResult({ goal: data.goal, tasks: data.tasks, summary });
    }
  );

  server.tool(
    'nx_task_add',
    'Add a new task to .nexus/tasks.json',
    {
      title: z.string().describe('Task title'),
      context: z.string().describe('Task context or description'),
      deps: z.array(z.number()).optional().describe('IDs of tasks this task depends on'),
      decisions: z.array(z.number()).describe('IDs of decisions that informed this task. Pass [] if none.'),
      goal: z.string().optional().describe('Set or update the goal for this task list'),
      owner: z.string().optional().describe('Assignee agent name for this task'),
    },
    async ({ title, context, deps, decisions, goal, owner }) => {
      let data = await readTasks();
      if (!data) {
        data = { goal: '', tasks: [] };
      }

      if (goal) {
        data.goal = goal;
      }

      const maxId = data.tasks.reduce((max, t) => Math.max(max, t.id), 0);
      const newTask: Task = {
        id: maxId + 1,
        title,
        context,
        status: 'pending',
        deps: deps ?? [],
        decisions,
        owner,
        created_at: new Date().toISOString(),
      };

      data.tasks.push(newTask);
      await writeTasks(data);

      return textResult({ task: newTask });
    }
  );

  server.tool(
    'nx_task_update',
    'Update the status of a task in .nexus/tasks.json',
    {
      id: z.number().describe('Task ID to update'),
      status: z
        .enum(['pending', 'in_progress', 'completed'])
        .describe('New status for the task'),
    },
    async ({ id, status }) => {
      const data = await readTasks();
      if (!data) {
        return textResult({ error: 'tasks.json not found' });
      }

      const task = data.tasks.find((t) => t.id === id);
      if (!task) {
        return textResult({ error: `Task id ${id} not found` });
      }

      task.status = status;
      await writeTasks(data);

      return textResult({ task });
    }
  );

  server.tool(
    'nx_task_close',
    'Close the current cycle: archive consult+decisions+tasks into history.json, then delete source files',
    {},
    async () => {
      const root = getBranchRoot();
      const projectHistoryPath = join(RUNTIME_ROOT, 'history.json');
      const consultJsonPath = join(root, 'consult.json');
      const decisionsJsonPath = join(root, 'decisions.json');
      const reopenTrackerPath = join(root, 'reopen-tracker.json');

      // Read current state (only what exists)
      const consult: ConsultFile | null = await readConsult();
      const decisionsData = await readDecisions();
      const decisions: DecisionEntry[] = decisionsData.decisions;
      const tasksData = await readTasks();
      const tasks: Task[] = tasksData?.tasks ?? [];

      const branch = getCurrentBranch();

      // Read or initialize project-level history.json
      interface Cycle {
        completed_at: string;
        branch: string;
        consult: ConsultFile | null;
        decisions: DecisionEntry[];
        tasks: Task[];
      }
      interface HistoryFile {
        cycles: Cycle[];
      }

      let history: HistoryFile = { cycles: [] };

      // 기존 브랜치별 history.json 마이그레이션
      const branchHistoryPath = join(root, 'history.json');
      if (existsSync(branchHistoryPath)) {
        try {
          const raw = await readFile(branchHistoryPath, 'utf-8');
          const branchHistory = JSON.parse(raw) as { cycles: Array<Record<string, unknown>> };
          if (branchHistory.cycles && branchHistory.cycles.length > 0) {
            // 기존 사이클에 branch 필드가 없으면 추가
            const migratedCycles = branchHistory.cycles.map((c) => ({
              branch,
              ...c,
            }));
            if (existsSync(projectHistoryPath)) {
              const projectRaw = await readFile(projectHistoryPath, 'utf-8');
              history = JSON.parse(projectRaw) as HistoryFile;
            }
            history.cycles.push(...(migratedCycles as Cycle[]));
          }
          unlinkSync(branchHistoryPath);
        } catch {}
      } else if (existsSync(projectHistoryPath)) {
        const raw = await readFile(projectHistoryPath, 'utf-8');
        history = JSON.parse(raw) as HistoryFile;
      }

      // Create new cycle and append
      const cycle: Cycle = {
        completed_at: new Date().toISOString(),
        branch,
        consult,
        decisions,
        tasks,
      };
      history.cycles.push(cycle);

      // Write project-level history.json
      ensureDir(RUNTIME_ROOT);
      await writeFile(projectHistoryPath, JSON.stringify(history, null, 2));

      // memoryHint 계산
      const editTrackerPath = join(root, 'edit-tracker.json');
      let hadLoopDetection = false;
      if (existsSync(editTrackerPath)) {
        try {
          const trackerData = JSON.parse(await readFile(editTrackerPath, 'utf-8')) as Record<string, number>;
          hadLoopDetection = Object.values(trackerData).some((count) => count >= 3);
        } catch {}
      }

      const memoryHint = {
        taskCount: tasks.length,
        decisionCount: decisions.length,
        hadLoopDetection,
        cycleTopics: [consult?.topic, tasksData?.goal].filter(Boolean) as string[],
      };

      // Delete source files (reopen-tracker 포함)
      const deleted: string[] = [];
      for (const p of [consultJsonPath, decisionsJsonPath, tasksPath(), editTrackerPath, reopenTrackerPath]) {
        if (existsSync(p)) {
          unlinkSync(p);
          deleted.push(p.split('/').pop()!);
        }
      }

      return textResult({
        closed: true,
        cycle: cycle.completed_at,
        branch,
        archived: { consult: consult !== null, decisions: decisions.length, tasks: tasks.length },
        deleted,
        total_cycles: history.cycles.length,
        memoryHint,
      });
    }
  );
}
