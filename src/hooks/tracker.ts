// Tracker 훅: SubagentStart/Stop, SessionStart/End — 에이전트/세션 추적
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { sessionDir, ensureDir, RUNTIME_ROOT, KNOWLEDGE_ROOT } from '../shared/paths.js';
import { getSessionId, createSession } from '../shared/session.js';
import { join } from 'path';
import { execSync } from 'child_process';

// --- Agent Tracking ---

interface AgentRecord {
  active: string[];
  history: Array<{ name: string; startedAt: string; stoppedAt?: string }>;
}

function normalizeAgentName(name: string): string {
  return name.replace(/^(nexus|claude-nexus):/, '');
}

function loadAgents(sid: string): AgentRecord {
  const path = join(sessionDir(sid), 'agents.json');
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { /* fallthrough */ }
  }
  return { active: [], history: [] };
}

function saveAgents(sid: string, record: AgentRecord): void {
  const dir = sessionDir(sid);
  ensureDir(dir);
  writeFileSync(join(dir, 'agents.json'), JSON.stringify(record, null, 2));
}

// --- Session Start ---

function handleSessionStart(): void {
  // 모든 세션의 잔존 워크플로우 상태 정리 (resume, 비정상 종료, 벤치마크 잔존 등 방어)
  cleanupAllSessionStates();

  const sid = createSession();
  const dir = sessionDir(sid);
  ensureDir(dir);

  // 현재 브랜치의 plan 존재 확인
  let branch = 'unknown';
  try { branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim(); } catch { /* skip */ }

  const planFile = join(KNOWLEDGE_ROOT, 'plans', `${branch.replace(/\//g, '--')}.md`);
  const hasPlan = existsSync(planFile);

  // 만료된 메모 정리
  const memoPath = join(RUNTIME_ROOT, 'memo');
  if (existsSync(memoPath)) {
    for (const file of readdirSync(memoPath).filter((f) => f.endsWith('.json'))) {
      try {
        const entry = JSON.parse(readFileSync(join(memoPath, file), 'utf-8'));
        const ttlMs = entry.ttl === 'week' ? 7 * 86400000 : 86400000;
        if (Date.now() - new Date(entry.createdAt).getTime() > ttlMs) {
          unlinkSync(join(memoPath, file));
        }
      } catch { /* skip corrupt files */ }
    }
  }

  // 완료된 task 중 7일 이상 경과한 것 삭제
  const tasksPath = join(KNOWLEDGE_ROOT, 'tasks');
  if (existsSync(tasksPath)) {
    const DONE_TTL = 7 * 86400000; // 7일
    for (const file of readdirSync(tasksPath).filter((f) => f.endsWith('.json'))) {
      try {
        const task = JSON.parse(readFileSync(join(tasksPath, file), 'utf-8'));
        if (task.status === 'done' && task.completedAt) {
          if (Date.now() - new Date(task.completedAt).getTime() > DONE_TTL) {
            unlinkSync(join(tasksPath, file));
          }
        }
      } catch { /* skip */ }
    }
  }

  respond({
    continue: true,
    additionalContext: `[NEXUS] Session ${sid} started. Branch: ${branch}. Plan: ${hasPlan ? 'found' : 'none'}. When [NEXUS] routing context is injected, delegate to the recommended agent via Agent({ subagent_type: "nexus:<agent>", prompt: "<task>" }). Handle directly: single-file lookups, simple questions, trivial edits. Delegate: multi-file changes, debugging, reviews, tests, analysis.`,
  });
}

// --- Session End ---

function handleSessionEnd(): void {
  const sid = getSessionId();

  // 세션 요약 리포트 생성
  generateSessionSummary(sid);

  cleanupSessionState(sid);
  pass();
}

/** 세션 종료 시 활동 요약을 memo에 저장 */
function generateSessionSummary(sid: string): void {
  const dir = sessionDir(sid);
  if (!existsSync(dir)) return;

  try {
    const parts: string[] = [`Session ${sid} summary:`];

    // 에이전트 이력
    const agentsPath = join(dir, 'agents.json');
    if (existsSync(agentsPath)) {
      const record: AgentRecord = JSON.parse(readFileSync(agentsPath, 'utf-8'));
      if (record.history.length > 0) {
        const agentCounts: Record<string, number> = {};
        for (const h of record.history) agentCounts[h.name] = (agentCounts[h.name] ?? 0) + 1;
        const agentStr = Object.entries(agentCounts).map(([n, c]) => `${n}×${c}`).join(', ');
        parts.push(`Agents: ${record.history.length} total (${agentStr})`);
      }
    }

    // 도구 호출 수
    const trackerPath = join(dir, 'whisper-tracker.json');
    if (existsSync(trackerPath)) {
      const t = JSON.parse(readFileSync(trackerPath, 'utf-8'));
      if (t.toolCallCount > 0) parts.push(`Tools: ${t.toolCallCount} calls`);
    }

    // 세션 시간
    const sessionFile = join(RUNTIME_ROOT, 'state', 'current-session.json');
    if (existsSync(sessionFile)) {
      const sessionData = JSON.parse(readFileSync(sessionFile, 'utf-8'));
      if (sessionData.createdAt) {
        const elapsed = Math.floor((Date.now() - new Date(sessionData.createdAt).getTime()) / 1000);
        const hh = Math.floor(elapsed / 3600);
        const mm = Math.floor((elapsed % 3600) / 60);
        parts.push(`Duration: ${hh > 0 ? `${hh}h${mm}m` : `${mm}m`}`);
      }
    }

    if (parts.length <= 1) return; // 활동 없으면 생략

    // memo에 저장
    const memoPath = join(RUNTIME_ROOT, 'memo');
    if (!existsSync(memoPath)) { try { require('fs').mkdirSync(memoPath, { recursive: true }); } catch { return; } }
    const memoId = `${Date.now()}-summary`;
    const memo = {
      content: parts.join('\n'),
      ttl: 'day',
      tags: ['session-summary'],
      createdAt: new Date().toISOString(),
    };
    writeFileSync(join(memoPath, `${memoId}.json`), JSON.stringify(memo, null, 2));
  } catch { /* skip */ }
}

/** 모든 세션의 워크플로우 상태 정리 (SessionStart 시 호출) */
function cleanupAllSessionStates(): void {
  const sessionsDir = join(RUNTIME_ROOT, 'state', 'sessions');
  if (!existsSync(sessionsDir)) return;
  try {
    for (const dir of readdirSync(sessionsDir)) {
      cleanupSessionState(dir);
    }
  } catch { /* skip */ }
}

/** 세션 디렉토리의 활성 워크플로우 상태 파일 정리 */
function cleanupSessionState(sid: string): void {
  const dir = sessionDir(sid);
  if (!existsSync(dir)) return;

  const workflowKeys = ['nonstop', 'pipeline', 'parallel'];
  for (const key of workflowKeys) {
    const path = join(dir, `${key}.json`);
    if (existsSync(path)) {
      try { unlinkSync(path); } catch { /* skip */ }
    }
  }
}

// --- Subagent Start ---

function handleSubagentStart(event: { agent_name?: string; agent_type?: string }): void {
  const sid = getSessionId();
  if (!sid) { pass(); return; }
  const record = loadAgents(sid);
  const name = normalizeAgentName(event.agent_type ?? event.agent_name ?? 'unknown');

  record.active.push(name);
  record.history.push({ name, startedAt: new Date().toISOString() });
  saveAgents(sid, record);

  pass();
}

// --- Subagent Stop ---

function handleSubagentStop(event: { agent_name?: string; agent_type?: string }): void {
  const sid = getSessionId();
  if (!sid) { pass(); return; }
  const record = loadAgents(sid);
  const name = normalizeAgentName(event.agent_type ?? event.agent_name ?? 'unknown');

  const idx = record.active.indexOf(name);
  if (idx >= 0) record.active.splice(idx, 1);

  // 마지막 history 항목에 종료 시간 기록
  for (let i = record.history.length - 1; i >= 0; i--) {
    if (record.history[i].name === name && !record.history[i].stoppedAt) {
      record.history[i].stoppedAt = new Date().toISOString();
      break;
    }
  }

  saveAgents(sid, record);

  // Parallel 상태 자동 연동: 에이전트 완료 시 해당 태스크 done 처리
  updateParallelOnAgentStop(sid, name);

  pass();
}

/** SubagentStop 시 parallel.json의 해당 에이전트 태스크를 자동 완료 처리 */
function updateParallelOnAgentStop(sid: string, agentName: string): void {
  const path = join(sessionDir(sid), 'parallel.json');
  if (!existsSync(path)) return;

  try {
    const state = JSON.parse(readFileSync(path, 'utf-8'));
    if (!state.active || !Array.isArray(state.tasks)) return;

    let updated = false;
    for (const task of state.tasks) {
      // running 상태인 해당 에이전트의 태스크를 done으로 변경
      if (task.agent === agentName && task.status === 'running') {
        task.status = 'done';
        updated = true;
        break; // 한 번에 하나만 완료 (동일 에이전트 복수 태스크 시 순차)
      }
    }

    if (updated) {
      state.completedCount = state.tasks.filter((t: { status: string }) => t.status === 'done').length;
      writeFileSync(path, JSON.stringify(state, null, 2));

      // 모든 태스크 완료 시 자동 해제
      if (state.completedCount >= state.totalCount && state.totalCount > 0) {
        try { unlinkSync(path); } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
}

// --- Main ---

async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hookEvent = event.hook_event_name ?? event.type ?? '';

  switch (hookEvent) {
    case 'SessionStart':    handleSessionStart(); break;
    case 'SessionEnd':      handleSessionEnd(); break;
    case 'SubagentStart':   handleSubagentStart(event); break;
    case 'SubagentStop':    handleSubagentStop(event); break;
    default:                pass();
  }
}

main().catch(() => {
  respond({ continue: true });
});
