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

  respond({
    continue: true,
    additionalContext: `[LATTICE] Session ${sid} started. Branch: ${branch}. Plan: ${hasPlan ? 'found' : 'none'}.`,
  });
}

// --- Session End ---

function handleSessionEnd(): void {
  const sid = getSessionId();
  cleanupSessionState(sid);
  pass();
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

  const workflowKeys = ['sustain', 'pipeline', 'parallel'];
  for (const key of workflowKeys) {
    const path = join(dir, `${key}.json`);
    if (existsSync(path)) {
      try { unlinkSync(path); } catch { /* skip */ }
    }
  }
}

// --- Subagent Start ---

function handleSubagentStart(event: { agent_name?: string }): void {
  const sid = getSessionId();
  const record = loadAgents(sid);
  const name = event.agent_name ?? 'unknown';

  if (!record.active.includes(name)) {
    record.active.push(name);
  }
  record.history.push({ name, startedAt: new Date().toISOString() });
  saveAgents(sid, record);

  pass();
}

// --- Subagent Stop ---

function handleSubagentStop(event: { agent_name?: string }): void {
  const sid = getSessionId();
  const record = loadAgents(sid);
  const name = event.agent_name ?? 'unknown';

  record.active = record.active.filter((a) => a !== name);

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
