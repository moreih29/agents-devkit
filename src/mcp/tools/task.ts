import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { KNOWLEDGE_ROOT, ensureDir } from '../../shared/paths.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const TASKS_DIR = join(KNOWLEDGE_ROOT, 'tasks');

interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done' | 'blocked';
  description?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

async function loadTask(id: string): Promise<Task | null> {
  const path = join(TASKS_DIR, `${id}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(await readFile(path, 'utf-8')); } catch { return null; }
}

async function saveTask(task: Task): Promise<void> {
  ensureDir(TASKS_DIR);
  await writeFile(join(TASKS_DIR, `${task.id}.json`), JSON.stringify(task, null, 2));
}

async function loadAllTasks(): Promise<Task[]> {
  if (!existsSync(TASKS_DIR)) return [];
  const tasks: Task[] = [];
  for (const file of (await readdir(TASKS_DIR)).filter(f => f.endsWith('.json'))) {
    try {
      tasks.push(JSON.parse(await readFile(join(TASKS_DIR, file), 'utf-8')));
    } catch { /* skip corrupt */ }
  }
  return tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function registerTaskTools(server: McpServer): void {
  server.tool(
    'nx_task_create',
    'Create a task for tracking work across sessions',
    {
      title: z.string().describe('Task title'),
      description: z.string().optional().describe('Detailed description'),
      tags: z.array(z.string()).optional().describe('Tags for filtering'),
    },
    async ({ title, description, tags }) => {
      const task: Task = {
        id: randomUUID().slice(0, 8),
        title,
        status: 'todo',
        description,
        tags,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveTask(task);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, task }) }] };
    }
  );

  server.tool(
    'nx_task_list',
    'List tasks with optional filtering by status or tags',
    {
      status: z.enum(['todo', 'in_progress', 'done', 'blocked']).optional().describe('Filter by status'),
      tags: z.array(z.string()).optional().describe('Filter by tags (any match)'),
    },
    async ({ status, tags }) => {
      let tasks = await loadAllTasks();
      if (status) tasks = tasks.filter(t => t.status === status);
      if (tags && tags.length > 0) {
        tasks = tasks.filter(t => t.tags?.some(tag => tags.includes(tag)));
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ count: tasks.length, tasks }) }] };
    }
  );

  server.tool(
    'nx_task_update',
    'Update a task (status, title, description, tags)',
    {
      id: z.string().describe('Task ID'),
      status: z.enum(['todo', 'in_progress', 'done', 'blocked']).optional().describe('New status'),
      title: z.string().optional().describe('New title'),
      description: z.string().optional().describe('New description'),
      tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
    },
    async ({ id, status, title, description, tags }) => {
      const task = await loadTask(id);
      if (!task) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Task not found', id }) }] };
      }

      if (status) task.status = status;
      if (title) task.title = title;
      if (description !== undefined) task.description = description;
      if (tags) task.tags = tags;
      task.updatedAt = new Date().toISOString();
      if (status === 'done') task.completedAt = new Date().toISOString();

      await saveTask(task);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, task }) }] };
    }
  );

  server.tool(
    'nx_task_summary',
    'Get task summary: counts by status + in-progress list',
    {},
    async () => {
      const tasks = await loadAllTasks();
      const counts = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
      for (const t of tasks) counts[t.status]++;

      const inProgress = tasks
        .filter(t => t.status === 'in_progress')
        .map(t => ({ id: t.id, title: t.title, tags: t.tags }));

      const blocked = tasks
        .filter(t => t.status === 'blocked')
        .map(t => ({ id: t.id, title: t.title, tags: t.tags }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ total: tasks.length, counts, inProgress, blocked }),
        }],
      };
    }
  );
}
