import { z } from 'zod';
import { existsSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBranchRoot, ensureDir } from '../../shared/paths.js';

function tasksPath(): string {
  return join(getBranchRoot(), 'tasks.json');
}

interface Task {
  id: number;
  title: string;
  context: string;
  status: 'pending' | 'in_progress' | 'completed';
  deps: number[];
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
        return { content: [{ type: 'text' as const, text: JSON.stringify({ exists: false }) }] };
      }
      const summary = computeSummary(data.tasks);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ goal: data.goal, tasks: data.tasks, summary }),
          },
        ],
      };
    }
  );

  server.tool(
    'nx_task_add',
    'Add a new task to .nexus/tasks.json',
    {
      caller: z.string().describe('Your agent name'),
      title: z.string().describe('Task title'),
      context: z.string().describe('Task context or description'),
      deps: z.array(z.number()).optional().describe('IDs of tasks this task depends on'),
      goal: z.string().optional().describe('Set or update the goal for this task list'),
      owner: z.string().optional().describe('Assignee agent name for this task'),
    },
    async ({ caller, title, context, deps, goal, owner }) => {
      if (caller !== 'director') {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Only director can create tasks. You are: ${caller}` }) }] };
      }

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
        owner,
        created_at: new Date().toISOString(),
      };

      data.tasks.push(newTask);
      await writeTasks(data);

      return { content: [{ type: 'text' as const, text: JSON.stringify({ task: newTask }) }] };
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
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ error: 'tasks.json not found' }) },
          ],
        };
      }

      const task = data.tasks.find((t) => t.id === id);
      if (!task) {
        return {
          content: [
            { type: 'text' as const, text: JSON.stringify({ error: `Task id ${id} not found` }) },
          ],
        };
      }

      task.status = status;
      await writeTasks(data);

      return { content: [{ type: 'text' as const, text: JSON.stringify({ task }) }] };
    }
  );

  server.tool(
    'nx_task_clear',
    'Delete .nexus/tasks.json to abort the current plan and release the nonstop block',
    {},
    async () => {
      if (!existsSync(tasksPath())) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ cleared: false, reason: 'tasks.json not found' }) }] };
      }
      try {
        unlinkSync(tasksPath());
        return { content: [{ type: 'text' as const, text: JSON.stringify({ cleared: true }) }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ cleared: false, reason: String(e) }) }] };
      }
    }
  );
}
