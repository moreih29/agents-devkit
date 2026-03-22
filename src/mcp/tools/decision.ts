import { z } from 'zod';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile, readdir, rm } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const DECISIONS_PATH = join(process.cwd(), '.nexus', 'decisions.json');
const TASKS_PATH = join(process.cwd(), '.nexus', 'tasks.json');
const PLANS_DIR = join(process.cwd(), '.nexus', 'plans');

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

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

async function readDecisions(): Promise<DecisionsFile> {
  if (!existsSync(DECISIONS_PATH)) {
    return { decisions: [] };
  }
  const raw = await readFile(DECISIONS_PATH, 'utf-8');
  return JSON.parse(raw) as DecisionsFile;
}

async function writeDecisions(data: DecisionsFile): Promise<void> {
  ensureDir(join(process.cwd(), '.nexus'));
  await writeFile(DECISIONS_PATH, JSON.stringify(data, null, 2));
}

function toKebabCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function nextPlanNumber(): Promise<number> {
  if (!existsSync(PLANS_DIR)) return 1;
  const files = await readdir(PLANS_DIR);
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
    'Archive current plan: generate markdown summary, save to .nexus/plans/, delete tasks.json and decisions.json',
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

      const markdown = `# ${tasksData.goal}

## Decisions
${decisionsSection}

## Tasks
${tasksSection}

## Summary
Total: ${totalTasks} tasks, ${totalDecisions} decisions
`;

      ensureDir(PLANS_DIR);

      const num = await nextPlanNumber();
      const paddedNum = String(num).padStart(2, '0');
      const slug = toKebabCase(tasksData.goal.slice(0, 30));
      const filename = `${paddedNum}-${slug}.md`;
      const archivePath = join(PLANS_DIR, filename);

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
