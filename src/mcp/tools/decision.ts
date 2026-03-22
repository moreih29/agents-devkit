import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, writeFile, readdir, rm } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RUNTIME_ROOT, ensureDir } from '../../shared/paths.js';

const DECISIONS_PATH = join(RUNTIME_ROOT, 'decisions.json');
const TASKS_PATH = join(RUNTIME_ROOT, 'tasks.json');
const ARCHIVES_DIR = join(RUNTIME_ROOT, 'archives');

interface DecisionsFile {
  decisions: string[];
}

interface Task {
  id: number;
  title: string;
  context: string;
  status: 'pending' | 'in_progress' | 'completed';
  deps: number[];
}

interface TasksFile {
  goal: string;
  tasks: Task[];
}

async function readDecisions(): Promise<DecisionsFile> {
  if (!existsSync(DECISIONS_PATH)) {
    return { decisions: [] };
  }
  const raw = await readFile(DECISIONS_PATH, 'utf-8');
  return JSON.parse(raw) as DecisionsFile;
}

async function writeDecisions(data: DecisionsFile): Promise<void> {
  ensureDir(RUNTIME_ROOT);
  await writeFile(DECISIONS_PATH, JSON.stringify(data, null, 2));
}

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function nextArchiveNumber(): Promise<number> {
  if (!existsSync(ARCHIVES_DIR)) return 1;
  const files = await readdir(ARCHIVES_DIR);
  let max = 0;
  for (const file of files) {
    const match = file.match(/^(\d+)-/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

export function registerDecisionTools(server: McpServer): void {
  server.tool(
    'nx_decision_add',
    'Add a decision to .nexus/decisions.json',
    {
      summary: z.string().describe('Decision summary to record'),
    },
    async ({ summary }) => {
      const data = await readDecisions();
      data.decisions.push(summary);
      await writeDecisions(data);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ decisions: data.decisions }),
          },
        ],
      };
    }
  );

  server.tool(
    'nx_plan_archive',
    'Archive current plan: generate markdown summary, save to .nexus/archives/, delete tasks.json and decisions.json',
    {},
    async () => {
      if (!existsSync(TASKS_PATH)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ error: 'tasks.json not found' }),
            },
          ],
        };
      }

      const tasksRaw = await readFile(TASKS_PATH, 'utf-8');
      const tasksData = JSON.parse(tasksRaw) as TasksFile;

      const decisionsData = await readDecisions();

      const decisionsSection =
        decisionsData.decisions.length > 0
          ? decisionsData.decisions.map((d, i) => `- D${i + 1}: ${d}`).join('\n')
          : '(none)';

      const completedTasks = tasksData.tasks.filter((t) => t.status === 'completed');
      const incompleteTasks = tasksData.tasks.filter((t) => t.status !== 'completed');

      const tasksSection =
        tasksData.tasks.length > 0
          ? tasksData.tasks
              .map((t) => {
                const check = t.status === 'completed' ? 'x' : ' ';
                return `- [${check}] Task ${t.id}: ${t.title}`;
              })
              .join('\n')
          : '(none)';

      const totalTasks = tasksData.tasks.length;
      const totalDecisions = decisionsData.decisions.length;
      const completedAt = new Date().toISOString();

      const descriptionLines: string[] = [];
      if (completedTasks.length > 0) {
        descriptionLines.push(`Completed: ${completedTasks.map((t) => t.title).join(', ')}`);
      }
      if (incompleteTasks.length > 0) {
        descriptionLines.push(`Incomplete: ${incompleteTasks.map((t) => t.title).join(', ')}`);
      }
      const description = descriptionLines.length > 0 ? descriptionLines.join(' | ') : '(no tasks)';

      const markdown = `# ${tasksData.goal}

## Description
${description}

Archived at: ${completedAt}

## Decisions
${decisionsSection}

## Tasks
${tasksSection}

## Summary
Total: ${totalTasks} tasks, ${totalDecisions} decisions
Completed: ${completedTasks.length}/${totalTasks}
`;

      ensureDir(ARCHIVES_DIR);

      const num = await nextArchiveNumber();
      const paddedNum = String(num).padStart(2, '0');
      const goalSlug = tasksData.goal.trim();
      const slug = goalSlug ? toKebabCase(goalSlug).slice(0, 50) : 'untitled';
      const filename = `${paddedNum}-${slug || 'untitled'}.md`;
      const archivePath = join(ARCHIVES_DIR, filename);

      await writeFile(archivePath, markdown);

      await rm(TASKS_PATH);
      if (existsSync(DECISIONS_PATH)) {
        await rm(DECISIONS_PATH);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ archived: archivePath }),
          },
        ],
      };
    }
  );
}
