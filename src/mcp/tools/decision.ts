import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBranchRoot, ensureDir } from '../../shared/paths.js';

interface DecisionsFile {
  decisions: string[];
}

function decisionsPath(): string {
  return join(getBranchRoot(), 'decisions.json');
}

async function readDecisions(): Promise<DecisionsFile> {
  const p = decisionsPath();
  if (!existsSync(p)) {
    return { decisions: [] };
  }
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw) as DecisionsFile;
}

async function writeDecisions(data: DecisionsFile): Promise<void> {
  const root = getBranchRoot();
  ensureDir(root);
  await writeFile(join(root, 'decisions.json'), JSON.stringify(data, null, 2));
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
