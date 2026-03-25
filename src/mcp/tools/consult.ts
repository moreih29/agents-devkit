import { z } from 'zod';
import { existsSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBranchRoot, ensureDir } from '../../shared/paths.js';

interface ConsultIssue {
  id: number;
  title: string;
  status: 'pending' | 'discussing' | 'decided';
}

interface ConsultFile {
  topic: string;
  issues: ConsultIssue[];
}

function consultPath(): string {
  return join(getBranchRoot(), 'consult.json');
}

async function readConsult(): Promise<ConsultFile | null> {
  const p = consultPath();
  if (!existsSync(p)) return null;
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw) as ConsultFile;
}

async function writeConsult(data: ConsultFile): Promise<void> {
  const root = getBranchRoot();
  ensureDir(root);
  await writeFile(join(root, 'consult.json'), JSON.stringify(data, null, 2));
}

// Also need to read/write decisions.json for nx_consult_decide
interface DecisionsFile {
  decisions: string[];
}

function decisionsPath(): string {
  return join(getBranchRoot(), 'decisions.json');
}

async function readDecisions(): Promise<DecisionsFile> {
  const p = decisionsPath();
  if (!existsSync(p)) return { decisions: [] };
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw) as DecisionsFile;
}

async function writeDecisions(data: DecisionsFile): Promise<void> {
  const root = getBranchRoot();
  ensureDir(root);
  await writeFile(join(root, 'decisions.json'), JSON.stringify(data, null, 2));
}

export function registerConsultTools(server: McpServer): void {
  // nx_consult_start — create consult.json with topic and issues
  server.tool(
    'nx_consult_start',
    'Start a new consultation session with topic and issues to discuss',
    {
      topic: z.string().describe('Consultation topic'),
      issues: z.array(z.string()).describe('List of issue titles to discuss'),
    },
    async ({ topic, issues }) => {
      const data: ConsultFile = {
        topic,
        issues: issues.map((title, i) => ({
          id: i + 1,
          title,
          status: 'pending' as const,
        })),
      };
      await writeConsult(data);
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ created: true, topic, issueCount: issues.length }),
        }],
      };
    }
  );

  // nx_consult_status — read current consultation state
  server.tool(
    'nx_consult_status',
    'Get current consultation status: topic, issues, and their statuses',
    {},
    async () => {
      const data = await readConsult();
      if (!data) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ active: false }) }] };
      }
      const pending = data.issues.filter(i => i.status === 'pending').length;
      const discussing = data.issues.filter(i => i.status === 'discussing').length;
      const decided = data.issues.filter(i => i.status === 'decided').length;
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            active: true,
            topic: data.topic,
            issues: data.issues,
            summary: { total: data.issues.length, pending, discussing, decided },
          }),
        }],
      };
    }
  );

  // nx_consult_decide — mark issue as decided + record in decisions.json
  // Auto-deletes consult.json if all issues are decided
  server.tool(
    'nx_consult_decide',
    'Mark a consultation issue as decided and record the decision',
    {
      issue_id: z.number().describe('Issue ID to mark as decided'),
      summary: z.string().describe('Decision summary to record'),
    },
    async ({ issue_id, summary }) => {
      const data = await readConsult();
      if (!data) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No active consultation' }) }] };
      }

      const issue = data.issues.find(i => i.id === issue_id);
      if (!issue) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Issue ${issue_id} not found` }) }] };
      }

      // Mark as decided
      issue.status = 'decided';

      // Record in decisions.json
      const decisions = await readDecisions();
      decisions.decisions.push(summary);
      await writeDecisions(decisions);

      // Check if all decided → auto-delete consult.json
      const allDecided = data.issues.every(i => i.status === 'decided');
      if (allDecided) {
        try { unlinkSync(consultPath()); } catch {}
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              decided: true,
              issue: issue.title,
              allComplete: true,
              message: 'All issues decided. consult.json removed.',
              decisions: decisions.decisions,
            }),
          }],
        };
      }

      await writeConsult(data);
      const remaining = data.issues.filter(i => i.status !== 'decided');
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            decided: true,
            issue: issue.title,
            allComplete: false,
            remaining: remaining.map(i => ({ id: i.id, title: i.title, status: i.status })),
          }),
        }],
      };
    }
  );
}
