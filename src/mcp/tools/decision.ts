import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { STATE_ROOT, ensureDir } from '../../shared/paths.js';
import { textResult } from '../../shared/mcp-utils.js';

export interface DecisionEntry {
  id: number;
  summary: string;
  consult: number | null;
  status?: 'active' | 'revoked';
}

export interface DecisionsFile {
  decisions: DecisionEntry[];
}

function decisionsPath(): string {
  return join(STATE_ROOT, 'decisions.json');
}

export async function readDecisions(): Promise<DecisionsFile> {
  const p = decisionsPath();
  if (!existsSync(p)) {
    return { decisions: [] };
  }
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw) as DecisionsFile;
}

export async function writeDecisions(data: DecisionsFile): Promise<void> {
  ensureDir(STATE_ROOT);
  await writeFile(join(STATE_ROOT, 'decisions.json'), JSON.stringify(data, null, 2));
}

export function registerDecisionTools(server: McpServer): void {
  server.tool(
    'nx_decision_add',
    'Add a decision to .nexus/decisions.json',
    {
      summary: z.string().describe('Decision summary to record'),
      consult: z.number().nullable().optional().describe('Consult issue ID this decision relates to (null if not from a consultation)'),
    },
    async ({ summary, consult }) => {
      const data = await readDecisions();
      const maxId = data.decisions.reduce((max, d) => Math.max(max, d.id), 0);
      const entry: DecisionEntry = { id: maxId + 1, summary, consult: consult ?? null };
      data.decisions.push(entry);
      await writeDecisions(data);
      return textResult({ decisions: data.decisions });
    }
  );

}
