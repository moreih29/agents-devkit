import { z } from 'zod';
import { existsSync, unlinkSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { STATE_ROOT, NEXUS_ROOT, ensureDir, getCurrentBranch } from '../../shared/paths.js';
import { textResult } from '../../shared/mcp-utils.js';

/** 논의 기록 — 에이전트 간 대화 또는 Lead 요약 */
export interface DiscussionEntry {
  speaker: string;    // 에이전트 이름 또는 'lead', 'user'
  content: string;    // 발언 내용 (요약)
  timestamp: string;  // ISO 8601
}

/** 참석자 */
export interface MeetAttendee {
  role: string;       // 에이전트 역할명: 'architect', 'engineer', 'qa' 등
  name: string;       // 팀 내 에이전트 이름 (teammate name)
  joined_at: string;  // ISO 8601
}

/** 개별 안건 */
export interface MeetIssue {
  id: number;                                     // 단순 숫자 (meet 내 고유)
  title: string;
  status: 'pending' | 'discussing' | 'decided';
  discussion: DiscussionEntry[];                  // 논의 과정 기록
  decision?: string;                              // decided 시 결정 요약
}

/** meet.json 루트 */
export interface MeetFile {
  id: number;             // 단순 숫자 (1부터 증가, history에서 역추적용)
  topic: string;
  attendees: MeetAttendee[];
  issues: MeetIssue[];
  research_summary?: string;
  created_at: string;     // ISO 8601
}

function meetPath(): string {
  return join(STATE_ROOT, 'meet.json');
}

export async function readMeet(): Promise<MeetFile | null> {
  const p = meetPath();
  if (!existsSync(p)) return null;
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw) as MeetFile;
}

export async function writeMeet(data: MeetFile): Promise<void> {
  ensureDir(STATE_ROOT);
  await writeFile(meetPath(), JSON.stringify(data, null, 2));
}

export function registerMeetTools(server: McpServer): void {
  // nx_meet_start — 새 meet 세션 생성. 기존 meet.json 있으면 history에 자동 아카이브.
  server.tool(
    'nx_meet_start',
    '새 미팅 세션 시작 — 기존 meet.json 자동 아카이브',
    {
      topic: z.string().describe('미팅 주제'),
      issues: z.array(z.string()).describe('안건 목록'),
      research_summary: z.string().describe('사전조사 결과 요약. 리서치 완료를 강제하기 위한 필수 파라미터.'),
      attendees: z.array(z.object({
        role: z.string(),
        name: z.string(),
      })).optional().describe('초기 참석자 목록. 생략 시 Lead만 기본 등록.'),
    },
    async ({ topic, issues, research_summary, attendees }) => {
      // history.json에서 마지막 meet id 추출
      const projectHistoryPath = join(NEXUS_ROOT, 'history.json');
      interface Cycle { completed_at: string; branch: string; meet: MeetFile | null; tasks: never[]; }
      interface HistoryFile { cycles: Cycle[]; }
      let history: HistoryFile = { cycles: [] };
      if (existsSync(projectHistoryPath)) {
        try { history = JSON.parse(await readFile(projectHistoryPath, 'utf-8')) as HistoryFile; } catch {}
      }

      // 마지막 meet id 계산
      let lastMeetId = 0;
      for (const cycle of history.cycles) {
        if (cycle.meet && typeof cycle.meet.id === 'number') {
          lastMeetId = Math.max(lastMeetId, cycle.meet.id);
        }
      }

      // 기존 meet.json 있으면 자동 아카이브
      let previousArchived = false;
      const existingMeet = await readMeet();
      if (existingMeet) {
        history.cycles.push({
          completed_at: new Date().toISOString(),
          branch: getCurrentBranch(),
          meet: existingMeet,
          tasks: [],
        });
        ensureDir(NEXUS_ROOT);
        await writeFile(projectHistoryPath, JSON.stringify(history, null, 2));
        unlinkSync(meetPath());
        previousArchived = true;
      }

      const now = new Date().toISOString();
      const newId = lastMeetId + 1;

      const initialAttendees: MeetAttendee[] = attendees
        ? attendees.map(a => ({ role: a.role, name: a.name, joined_at: now }))
        : [{ role: 'lead', name: 'lead', joined_at: now }];

      const data: MeetFile = {
        id: newId,
        topic,
        attendees: initialAttendees,
        issues: issues.map((title, i) => ({
          id: i + 1,
          title,
          status: 'pending' as const,
          discussion: [],
        })),
        research_summary,
        created_at: now,
      };

      await writeMeet(data);
      return textResult({ created: true, meet_id: newId, topic, issueCount: issues.length, previousArchived });
    }
  );

  // nx_meet_status — 현재 미팅 상태 조회
  server.tool(
    'nx_meet_status',
    '현재 미팅 상태 조회: 안건, 참석자, 결정사항',
    {},
    async () => {
      const data = await readMeet();
      if (!data) {
        return textResult({ active: false });
      }

      const pending = data.issues.filter(i => i.status === 'pending').length;
      const discussing = data.issues.filter(i => i.status === 'discussing').length;
      const decided = data.issues.filter(i => i.status === 'decided').length;

      return textResult({
        active: true,
        meet_id: data.id,
        topic: data.topic,
        attendees: data.attendees,
        issues: data.issues,
        research_summary: data.research_summary,
        summary: { total: data.issues.length, pending, discussing, decided },
      });
    }
  );

  // nx_meet_update — 안건 추가/삭제/수정/재개
  server.tool(
    'nx_meet_update',
    '안건 관리: 추가, 삭제, 수정, 재개',
    {
      action: z.enum(['add', 'remove', 'edit', 'reopen']).describe('수행할 액션'),
      issue_id: z.number().optional().describe('대상 안건 ID (remove, edit, reopen에 필수)'),
      title: z.string().optional().describe('안건 제목 (add, edit에 필수)'),
    },
    async ({ action, issue_id, title }) => {
      const data = await readMeet();
      if (!data) {
        return textResult({ error: 'No active meet session' });
      }

      if (action === 'add') {
        if (!title) {
          return textResult({ error: 'title is required for add' });
        }
        const maxId = data.issues.reduce((max, i) => Math.max(max, i.id), 0);
        const newIssue: MeetIssue = { id: maxId + 1, title, status: 'pending', discussion: [] };
        data.issues.push(newIssue);
        await writeMeet(data);
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
        await writeMeet(data);
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
        await writeMeet(data);
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
        delete issue.decision;
        await writeMeet(data);
        return textResult({ reopened: true, issue });
      }

      return textResult({ error: 'Unknown action' });
    }
  );

  // nx_meet_discuss — 논의 내용 기록
  server.tool(
    'nx_meet_discuss',
    '안건에 논의 내용 기록',
    {
      issue_id: z.number().describe('안건 ID'),
      speaker: z.string().describe('발언자 (에이전트명 또는 user/lead)'),
      content: z.string().describe('발언 내용 요약'),
    },
    async ({ issue_id, speaker, content }) => {
      const data = await readMeet();
      if (!data) {
        return textResult({ error: 'No active meet session' });
      }

      // speaker 검증: attendees에 등록된 role 또는 lead/user만 허용
      const allowedSpeakers = ['lead', 'user'];
      const attendeeRoles = data.attendees.map(a => a.role);
      if (!allowedSpeakers.includes(speaker) && !attendeeRoles.includes(speaker)) {
        return textResult({
          error: `Speaker '${speaker}' is not a registered attendee. Registered: ${attendeeRoles.join(', ')}. Use nx_meet_join to add attendees first.`,
        });
      }

      const issue = data.issues.find(i => i.id === issue_id);
      if (!issue) {
        return textResult({ error: `Issue ${issue_id} not found` });
      }

      const entry: DiscussionEntry = {
        speaker,
        content,
        timestamp: new Date().toISOString(),
      };
      issue.discussion.push(entry);

      // pending → discussing 자동 전환
      if (issue.status === 'pending') {
        issue.status = 'discussing';
      }

      await writeMeet(data);
      return textResult({ recorded: true, issue_id, discussionCount: issue.discussion.length });
    }
  );

  // nx_meet_decide — 안건 결정 기록
  server.tool(
    'nx_meet_decide',
    '안건 결정 기록 — [d] 태그로 트리거',
    {
      issue_id: z.number().describe('결정할 안건 ID'),
      summary: z.string().describe('결정 요약'),
    },
    async ({ issue_id, summary }) => {
      const data = await readMeet();
      if (!data) {
        return textResult({ error: 'No active meet session' });
      }

      const issue = data.issues.find(i => i.id === issue_id);
      if (!issue) {
        return textResult({ error: `Issue ${issue_id} not found` });
      }

      issue.status = 'decided';
      issue.decision = summary;
      await writeMeet(data);

      const allComplete = data.issues.every(i => i.status === 'decided');
      if (allComplete) {
        return textResult({
          decided: true,
          issue: issue.title,
          allComplete: true,
          message: '모든 안건이 결정되었습니다. 실행이 필요하면 [run] 태그를, 규칙으로 저장하려면 [rule] 또는 [rule:태그] 태그를 사용하세요.',
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

  // nx_meet_join — 참석자 추가
  server.tool(
    'nx_meet_join',
    '미팅에 참석자 추가',
    {
      role: z.string().describe('에이전트 역할 (architect, engineer 등)'),
      name: z.string().describe('팀 내 에이전트 이름'),
    },
    async ({ role, name }) => {
      const data = await readMeet();
      if (!data) {
        return textResult({ error: 'No active meet session' });
      }

      const duplicate = data.attendees.find(a => a.name === name);
      if (duplicate) {
        return textResult({ error: `Attendee '${name}' already joined`, attendee: duplicate });
      }

      const attendee: MeetAttendee = {
        role,
        name,
        joined_at: new Date().toISOString(),
      };
      data.attendees.push(attendee);
      await writeMeet(data);
      return textResult({ joined: true, attendee, totalAttendees: data.attendees.length });
    }
  );
}
