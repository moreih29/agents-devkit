import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface TasksSummary {
  exists: boolean;
  total: number;
  completed: number;
  pending: number;
  allCompleted: boolean;
}

export function readTasksSummary(branchRoot: string): TasksSummary {
  const tasksPath = join(branchRoot, 'tasks.json');
  if (!existsSync(tasksPath)) return { exists: false, total: 0, completed: 0, pending: 0, allCompleted: false };
  try {
    const data = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    const tasks: Array<{ status: string }> = data.tasks ?? [];
    const completed = tasks.filter(t => t.status === 'completed').length;
    const pending = tasks.length - completed;
    return {
      exists: true,
      total: tasks.length,
      completed,
      pending,
      allCompleted: tasks.length > 0 && pending === 0,
    };
  } catch {
    return { exists: false, total: 0, completed: 0, pending: 0, allCompleted: false };
  }
}
