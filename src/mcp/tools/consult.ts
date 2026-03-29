import { z } from 'zod';
import { existsSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { STATE_ROOT, NEXUS_ROOT, ensureDir, getCurrentBranch } from '../../shared/paths.js';
import { readDecisions, writeDecisions, type DecisionEntry } from './decision.js';
import { textResult } from '../../shared/mcp-utils.js';

export interface ConsultIssue {
  id: number;
  title: string;
  status: 'pending' | 'discussing' | 'decided';
}

export interface ConsultFile {
  topic: string;
  issues: ConsultIssue[];
}

function consultPath(): string {
  return join(STATE_ROOT, 'consult.json');
}

export async function readConsult(): Promise<ConsultFile | null> {
  const p = consultPath();
  if (!existsSync(p)) return null;
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw) as ConsultFile;
}

async function writeConsult(data: ConsultFile): Promise<void> {
  ensureDir(STATE_ROOT);
  await writeFile(join(STATE_ROOT, 'consult.json'), JSON.stringify(data, null, 2));
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
      // 기존 consult/decisions가 있으면 자동 아카이빙
      let archived = false;
      const existingConsult = await readConsult();
      const existingDecisions = await readDecisions();
      if (existingConsult || existingDecisions.decisions.length > 0) {
        const projectHistoryPath = join(NEXUS_ROOT, 'history.json');
        interface Cycle { completed_at: string; branch: string; consult: ConsultFile | null; decisions: DecisionEntry[]; tasks: never[]; }
        interface HistoryFile { cycles: Cycle[]; }
        let history: HistoryFile = { cycles: [] };
        if (existsSync(projectHistoryPath)) {
          try { history = JSON.parse(await readFile(projectHistoryPath, 'utf-8')) as HistoryFile; } catch {}
        }
        history.cycles.push({
          completed_at: new Date().toISOString(),
          branch: getCurrentBranch(),
          consult: existingConsult,
          decisions: existingDecisions.decisions,
          tasks: [],
        });
        ensureDir(NEXUS_ROOT);
        await writeFile(projectHistoryPath, JSON.stringify(history, null, 2));
        // 소스 파일 삭제
        const consultJsonPath = join(STATE_ROOT, 'consult.json');
        const decisionsJsonPath = join(STATE_ROOT, 'decisions.json');
        if (existsSync(consultJsonPath)) unlinkSync(consultJsonPath);
        if (existsSync(decisionsJsonPath)) unlinkSync(decisionsJsonPath);
        archived = true;
      }

      const data: ConsultFile = {
        topic,
        issues: issues.map((title, i) => ({
          id: i + 1,
          title,
          status: 'pending' as const,
        })),
      };
      await writeConsult(data);
      return textResult({ created: true, topic, issueCount: issues.length, previousCycleArchived: archived });
    }
  );

  // nx_consult_status — read current consultation state + join decisions
  server.tool(
    'nx_consult_status',
    'Get current consultation status: topic, issues, their statuses, and related decisions',
    {},
    async () => {
      const data = await readConsult();
      if (!data) {
        return textResult({ active: false });
      }

      // Load decisions and find those linked to consult issues
      const decisionsData = await readDecisions();
      const issueIds = new Set(data.issues.map(i => i.id));

      // Build a map from issue_id to decision summary using consult field
      const decisionByIssueId = new Map<number, string>();
      for (const d of decisionsData.decisions) {
        if (d.consult !== null && issueIds.has(d.consult)) {
          decisionByIssueId.set(d.consult, d.summary);
        }
      }

      const pending = data.issues.filter(i => i.status === 'pending').length;
      const discussing = data.issues.filter(i => i.status === 'discussing').length;
      const decided = data.issues.filter(i => i.status === 'decided').length;

      const issuesWithDecisions = data.issues.map(i => {
        const result: Record<string, unknown> = { id: i.id, title: i.title, status: i.status };
        if (i.status === 'decided' && decisionByIssueId.has(i.id)) {
          result.decision = decisionByIssueId.get(i.id);
        }
        return result;
      });

      return textResult({
        active: true,
        topic: data.topic,
        issues: issuesWithDecisions,
        summary: { total: data.issues.length, pending, discussing, decided },
      });
    }
  );

  // nx_consult_update — add/remove/edit/reopen issues
  server.tool(
    'nx_consult_update',
    'Update consultation issues: add, remove, edit title, or reopen a decided issue',
    {
      action: z.enum(['add', 'remove', 'edit', 'reopen']).describe('Action to perform'),
      issue_id: z.number().optional().describe('Issue ID (required for remove, edit, reopen)'),
      title: z.string().optional().describe('Issue title (required for add and edit)'),
    },
    async ({ action, issue_id, title }) => {
      const data = await readConsult();
      if (!data) {
        return textResult({ error: 'No active consultation' });
      }

      if (action === 'add') {
        if (!title) {
          return textResult({ error: 'title is required for add' });
        }
        const maxId = data.issues.reduce((max, i) => Math.max(max, i.id), 0);
        const newIssue: ConsultIssue = { id: maxId + 1, title, status: 'pending' };
        data.issues.push(newIssue);
        await writeConsult(data);
        return textResult({ added: true, issue: newIssue });
      }

      if (action === 'remove') {
        if (issue_id === undefined) {
          return textResult({ error: 'issue_id is required for remove' });
        }
        const idx = data.issues.findIndex(i => i.id === issue_id);
        if (idx === -1) {
          return textResult({ error: `Issue ${issue_id} not found` });
        }
        const [removed] = data.issues.splice(idx, 1);
        await writeConsult(data);
        return textResult({ removed: true, issue: removed });
      }

      if (action === 'edit') {
        if (issue_id === undefined || !title) {
          return textResult({ error: 'issue_id and title are required for edit' });
        }
        const issue = data.issues.find(i => i.id === issue_id);
        if (!issue) {
          return textResult({ error: `Issue ${issue_id} not found` });
        }
        issue.title = title;
        await writeConsult(data);
        return textResult({ edited: true, issue });
      }

      if (action === 'reopen') {
        if (issue_id === undefined) {
          return textResult({ error: 'issue_id is required for reopen' });
        }
        const issue = data.issues.find(i => i.id === issue_id);
        if (!issue) {
          return textResult({ error: `Issue ${issue_id} not found` });
        }
        issue.status = 'discussing';
        await writeConsult(data);

        // Soft-delete: mark corresponding decision as revoked (preserves audit trail)
        const decisions = await readDecisions();
        let changed = false;
        for (const d of decisions.decisions) {
          if (d.consult === issue_id && d.status !== 'revoked') {
            d.status = 'revoked';
            changed = true;
          }
        }
        if (changed) {
          await writeDecisions(decisions);
        }

        return textResult({ reopened: true, issue });
      }

      return textResult({ error: 'Unknown action' });
    }
  );

  // nx_consult_decide — mark issue as decided + record in decisions.json
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
        return textResult({ error: 'No active consultation' });
      }

      const issue = data.issues.find(i => i.id === issue_id);
      if (!issue) {
        return textResult({ error: `Issue ${issue_id} not found` });
      }

      // Mark as decided
      issue.status = 'decided';
      await writeConsult(data);

      // Record in decisions.json with consult = issue_id
      const decisions = await readDecisions();
      const maxId = decisions.decisions.reduce((max, d) => Math.max(max, d.id), 0);
      const entry: DecisionEntry = {
        id: maxId + 1,
        summary,
        consult: issue_id,
      };
      decisions.decisions.push(entry);
      await writeDecisions(decisions);

      // Check if all decided — return completion signal without deleting consult.json
      const allDecided = data.issues.every(i => i.status === 'decided');
      if (allDecided) {
        return textResult({
          decided: true,
          issue: issue.title,
          allComplete: true,
          message: '모든 논점이 결정되었습니다. 실행이 필요하면 [run] 태그를, 규칙으로 저장하려면 [rule] 또는 [rule:태그] 태그를 사용하세요.',
          decisions: decisions.decisions,
        });
      }

      const remaining = data.issues.filter(i => i.status !== 'decided');
      return textResult({
        decided: true,
        issue: issue.title,
        allComplete: false,
        remaining: remaining.map(i => ({ id: i.id, title: i.title, status: i.status })),
      });
    }
  );
}
