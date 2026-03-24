import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRANCH_ROOT, ensureDir } from '../../shared/paths.js';

const DECISIONS_PATH = join(BRANCH_ROOT, 'decisions.json');

interface DecisionsFile {
  decisions: string[];
}

async function readDecisions(): Promise<DecisionsFile> {
  if (!existsSync(DECISIONS_PATH)) {
    return { decisions: [] };
  }
  const raw = await readFile(DECISIONS_PATH, 'utf-8');
  return JSON.parse(raw) as DecisionsFile;
}

async function writeDecisions(data: DecisionsFile): Promise<void> {
  ensureDir(BRANCH_ROOT);
  await writeFile(DECISIONS_PATH, JSON.stringify(data, null, 2));
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
}
