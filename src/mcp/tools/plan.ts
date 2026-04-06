import { z } from 'zod';
import { existsSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { STATE_ROOT, NEXUS_ROOT, ensureDir, getCurrentBranch } from '../../shared/paths.js';
import { textResult } from '../../shared/mcp-utils.js';

/** 개별 안건 */
export interface PlanIssue {
  id: number;          // 단순 숫자 (plan 내 고유)
  title: string;
  status: 'pending' | 'decided';
  decision?: string;   // decided 시 결정 요약
}

/** plan.json 루트 */
export interface PlanFile {
  id: number;             // 단순 숫자 (1부터 증가, history에서 역추적용)
  topic: string;
  issues: PlanIssue[];
  research_summary?: string;
  created_at: string;     // ISO 8601
}

function planPath(): string {
  return join(STATE_ROOT, 'plan.json');
}

export async function readPlan(): Promise<PlanFile | null> {
  const p = planPath();
  if (!existsSync(p)) return null;
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw) as PlanFile;
}

export async function writePlan(data: PlanFile): Promise<void> {
  ensureDir(STATE_ROOT);
  await writeFile(planPath(), JSON.stringify(data, null, 2));
}

export function registerPlanTools(server: McpServer): void {
  // nx_plan_start — 새 plan 세션 생성. 기존 plan.json 있으면 history에 자동 아카이브.
  server.tool(
    'nx_plan_start',
    '새 플래닝 세션 시작 — 기존 plan.json 자동 아카이브',
    {
      topic: z.string().describe('플래닝 주제'),
      issues: z.array(z.string()).describe('안건 목록'),
      research_summary: z.string().describe('사전조사 결과 요약. 리서치 완료를 강제하기 위한 필수 파라미터.'),
    },
    async ({ topic, issues, research_summary }) => {
      // history.json에서 마지막 plan id 추출
      const projectHistoryPath = join(NEXUS_ROOT, 'history.json');
      interface Cycle { completed_at: string; branch: string; meet: PlanFile | null; tasks: never[]; }
      interface HistoryFile { cycles: Cycle[]; }
      let history: HistoryFile = { cycles: [] };
      if (existsSync(projectHistoryPath)) {
        try { history = JSON.parse(await readFile(projectHistoryPath, 'utf-8')) as HistoryFile; } catch {}
      }

      // 마지막 plan id 계산
      let lastPlanId = 0;
      for (const cycle of history.cycles) {
        if (cycle.meet && typeof cycle.meet.id === 'number') {
          lastPlanId = Math.max(lastPlanId, cycle.meet.id);
        }
      }

      // 기존 plan.json 있으면 자동 아카이브
      let previousArchived = false;
      const existingPlan = await readPlan();
      if (existingPlan) {
        history.cycles.push({
          completed_at: new Date().toISOString(),
          branch: getCurrentBranch(),
          meet: existingPlan,
          tasks: [],
        });
        ensureDir(NEXUS_ROOT);
        await writeFile(projectHistoryPath, JSON.stringify(history, null, 2));
        unlinkSync(planPath());
        previousArchived = true;
      }

      const now = new Date().toISOString();
      const newId = lastPlanId + 1;

      const data: PlanFile = {
        id: newId,
        topic,
        issues: issues.map((title, i) => ({
          id: i + 1,
          title,
          status: 'pending' as const,
        })),
        research_summary,
        created_at: now,
      };

      await writePlan(data);
      return textResult({ created: true, plan_id: newId, topic, issueCount: issues.length, previousArchived });
    }
  );

  // nx_plan_status — 현재 플래닝 상태 조회
  server.tool(
    'nx_plan_status',
    '현재 플래닝 상태 조회: 안건, 참석자, 결정사항',
    {},
    async () => {
      const data = await readPlan();
      if (!data) {
        return textResult({ active: false });
      }

      const pending = data.issues.filter(i => i.status === 'pending').length;
      const decided = data.issues.filter(i => i.status === 'decided').length;

      return textResult({
        active: true,
        plan_id: data.id,
        topic: data.topic,
        issues: data.issues,
        research_summary: data.research_summary,
        summary: { total: data.issues.length, pending, decided },
      });
    }
  );

  // nx_plan_update — 안건 추가/삭제/수정/재개
  server.tool(
    'nx_plan_update',
    '안건 관리: 추가, 삭제, 수정, 재개',
    {
      action: z.enum(['add', 'remove', 'edit', 'reopen']).describe('수행할 액션'),
      issue_id: z.number().optional().describe('대상 안건 ID (remove, edit, reopen에 필수)'),
      title: z.string().optional().describe('안건 제목 (add, edit에 필수)'),
    },
    async ({ action, issue_id, title }) => {
      const data = await readPlan();
      if (!data) {
        return textResult({ error: 'No active plan session' });
      }

      if (action === 'add') {
        if (!title) {
          return textResult({ error: 'title is required for add' });
        }
        const maxId = data.issues.reduce((max, i) => Math.max(max, i.id), 0);
        const newIssue: PlanIssue = { id: maxId + 1, title, status: 'pending' };
        data.issues.push(newIssue);
        await writePlan(data);
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
        await writePlan(data);
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
        await writePlan(data);
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
        issue.status = 'pending';
        delete issue.decision;
        await writePlan(data);
        return textResult({ reopened: true, issue });
      }

      return textResult({ error: 'Unknown action' });
    }
  );

  // nx_plan_decide — 안건 결정 기록
  server.tool(
    'nx_plan_decide',
    '안건 결정 기록 — [d] 태그로 트리거',
    {
      issue_id: z.number().describe('결정할 안건 ID'),
      summary: z.string().describe('결정 요약'),
    },
    async ({ issue_id, summary }) => {
      const data = await readPlan();
      if (!data) {
        return textResult({ error: 'No active plan session' });
      }

      const issue = data.issues.find(i => i.id === issue_id);
      if (!issue) {
        return textResult({ error: `Issue ${issue_id} not found` });
      }

      issue.status = 'decided';
      issue.decision = summary;
      await writePlan(data);

      const allComplete = data.issues.every(i => i.status === 'decided');
      if (allComplete) {
        const tasksJsonExists = existsSync(join(STATE_ROOT, 'tasks.json'));
        const message = tasksJsonExists
          ? '새 결정사항에 대한 태스크를 tasks.json에 추가하세요. plan_issue 필드로 기존 태스크와 중복되지 않도록 합니다.'
          : 'Step 7: 결정사항을 바탕으로 계획서(tasks.json)를 생성하세요. nx_task_add(plan_issue=N, approach, acceptance, risk)로 각 태스크를 등록합니다.';
        return textResult({
          decided: true,
          issue: issue.title,
          allComplete: true,
          message,
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
