import { z } from 'zod';
import { existsSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { STATE_ROOT, NEXUS_ROOT, getCurrentBranch, ensureDir } from '../../shared/paths.js';
import { readPlan, type PlanFile } from './plan.js';
import { textResult } from '../../shared/mcp-utils.js';

function tasksPath(): string {
  return join(STATE_ROOT, 'tasks.json');
}

interface Task {
  id: number;
  title: string;
  context: string;
  approach?: string;
  acceptance?: string;
  risk?: string;
  status: 'pending' | 'in_progress' | 'completed';
  deps: number[];
  plan_issue?: number;
  owner?: string;
  owner_agent_id?: string;                                                       // 추가
  owner_reuse_policy?: 'fresh' | 'resume_if_same_artifact' | 'resume';           // 추가
  created_at?: string;
}

interface TasksFile {
  goal: string;
  decisions: string[];
  tasks: Task[];
}

async function readTasks(): Promise<TasksFile | null> {
  const p = tasksPath();
  if (!existsSync(p)) return null;
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw) as TasksFile;
}

async function writeTasks(data: TasksFile): Promise<void> {
  ensureDir(STATE_ROOT);
  await writeFile(join(STATE_ROOT, 'tasks.json'), JSON.stringify(data, null, 2));
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
      approach: z.string().optional().describe('Implementation approach for this task'),
      acceptance: z.string().optional().describe('Acceptance criteria — what defines done'),
      risk: z.string().optional().describe('Known risks or caveats'),
      plan_issue: z.number().optional().describe('plan issue ID this task originates from — used for tracing back to the plan session'),
      goal: z.string().optional().describe('Set or update the goal for this task list'),
      decisions: z.array(z.string()).optional().describe('Top-level decisions from [plan] session to append'),
      owner: z.string().optional().describe('Assignee agent name for this task'),
      owner_agent_id: z.string().optional().describe('특정 agentId로 resume할 때 지정. 미설정 시 fresh spawn.'),
      owner_reuse_policy: z.enum(['fresh', 'resume_if_same_artifact', 'resume']).optional().describe('resume 판단 정책. fresh=강제 새 스폰, resume_if_same_artifact=이전 owner가 같은 artifact(target file) 만졌을 때만 resume, resume=무조건 resume 시도. bounded tier는 resume_if_same_artifact 권장.'),
    },
    async ({ title, context, deps, approach, acceptance, risk, plan_issue, goal, decisions, owner, owner_agent_id, owner_reuse_policy }) => {
      let data = await readTasks();
      if (!data) {
        data = { goal: '', decisions: [], tasks: [] };
      }

      if (goal) {
        data.goal = goal;
      }
      if (decisions) {
        data.decisions = [...(data.decisions ?? []), ...decisions];
      }

      const maxId = data.tasks.reduce((max, t) => Math.max(max, t.id), 0);
      const newTask: Task = {
        id: maxId + 1,
        title,
        context,
        approach,
        acceptance,
        risk,
        status: 'pending',
        deps: deps ?? [],
        plan_issue,
        owner,
        owner_agent_id,
        owner_reuse_policy,
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
    'Close the current cycle: archive plan+tasks into history.json, then delete source files',
    {},
    async () => {
      const root = STATE_ROOT;
      const projectHistoryPath = join(NEXUS_ROOT, 'history.json');
      const planJsonPath = join(root, 'plan.json');
      const reopenTrackerPath = join(root, 'reopen-tracker.json');

      // Read current state (only what exists)
      const plan: PlanFile | null = await readPlan();
      const tasksData = await readTasks();
      const tasks: Task[] = tasksData?.tasks ?? [];

      const branch = getCurrentBranch();

      // Read or initialize project-level history.json
      interface Cycle {
        schema_version: string;
        completed_at: string;
        branch: string;
        plan: PlanFile | null;
        tasks: Task[];
      }
      interface HistoryFile {
        schema_version?: string;
        cycles: Cycle[];
      }

      let history: HistoryFile = { schema_version: '0.5', cycles: [] };
      if (existsSync(projectHistoryPath)) {
        const raw = await readFile(projectHistoryPath, 'utf-8');
        history = JSON.parse(raw) as HistoryFile;
      }

      // Create new cycle and append
      const cycle: Cycle = {
        schema_version: '0.5',
        completed_at: new Date().toISOString(),
        branch,
        plan,
        tasks,
      };
      history.cycles.push(cycle);

      // Write project-level history.json
      ensureDir(NEXUS_ROOT);
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

      const decisionCount = plan?.issues.filter(i => i.status === 'decided').length ?? 0;
      const memoryHint = {
        taskCount: tasks.length,
        decisionCount,
        hadLoopDetection,
        cycleTopics: [plan?.topic, tasksData?.goal].filter(Boolean) as string[],
      };

      // Delete source files (reopen-tracker 포함)
      const deleted: string[] = [];
      for (const p of [planJsonPath, tasksPath(), editTrackerPath, reopenTrackerPath]) {
        if (existsSync(p)) {
          unlinkSync(p);
          deleted.push(p.split('/').pop()!);
        }
      }

      return textResult({
        closed: true,
        cycle: cycle.completed_at,
        branch,
        archived: { plan: plan !== null, decisions: decisionCount, tasks: tasks.length },
        deleted,
        total_cycles: history.cycles.length,
        memoryHint,
      });
    }
  );

  server.tool(
    'nx_history_search',
    'Search past plan/task cycles in history.json',
    {
      query: z.string().optional().describe('Search term to match against topic, decisions, research_summary'),
      last_n: z.number().optional().describe('Return only the last N cycles (default: 10)'),
    },
    async ({ query, last_n }) => {
      const historyPath = join(NEXUS_ROOT, 'history.json');
      if (!existsSync(historyPath)) return textResult({ cycles: [], total: 0, showing: 0 });
      const raw = await readFile(historyPath, 'utf-8');
      const history = JSON.parse(raw) as { cycles: any[] };
      let cycles = history.cycles || [];

      if (query) {
        const q = query.toLowerCase();
        cycles = cycles.filter((c: any) => JSON.stringify(c).toLowerCase().includes(q));
      }

      const total = cycles.length;
      const limit = last_n || 10;
      const results = cycles.slice(-limit).map((c: any) => ({
        completed_at: c.completed_at,
        branch: c.branch,
        topic: c.plan?.topic,
        decisions: c.plan?.issues
          ?.filter((i: any) => i.status === 'decided')
          .map((i: any) => ({ title: i.title, decision: i.decision })),
        task_count: c.tasks?.length,
      }));

      return textResult({ total, showing: results.length, cycles: results });
    }
  );
}
