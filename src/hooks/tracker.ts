// Tracker 훅: SubagentStart/Stop, SessionStart/End — 에이전트/세션 추적
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync, writeFileSync, readdirSync, unlinkSync, rmdirSync, rmSync, statSync } from 'fs';
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

  const branchDir = branch.replace(/\//g, '--');
  const planFile = join(KNOWLEDGE_ROOT, 'plans', `${branchDir}.md`);
  const hasPlan = existsSync(planFile);
  const planDirPath = join(KNOWLEDGE_ROOT, 'plans', branchDir);
  const hasPlanDir = existsSync(planDirPath);

  const workflowPath = join(sessionDir(sid), 'workflow.json');
  const hasWorkflow = existsSync(workflowPath);

  if (hasPlanDir && !hasWorkflow) {
    respond({
      continue: true,
      additionalContext: `[NEXUS] Session ${sid} started. Branch: ${branch}. Mode: planning. Plan directory found.
DECISION CAPTURE: You are in multi-turn planning mode. When the user makes decisions (confirmatory expressions like "이걸로 하자", "삭제하자", "이렇게 바꾸자", or [d] tag), record them in .claude/nexus/plans/${branchDir}/plan.md under the decisions section.
When the user says "구현하자" or requests implementation, generate tasks.json from the accumulated decisions.`,
    });
  } else {
    respond({
      continue: true,
      additionalContext: `[NEXUS] Session ${sid} started. Branch: ${branch}. Plan: ${hasPlan ? 'found' : 'none'}.`,
    });
  }
}

// --- Session End ---

function handleSessionEnd(): void {
  const sid = getSessionId();

  // 세션 요약 리포트 생성
  const summary = generateSessionSummary(sid);

  cleanupSessionState(sid);

  if (summary) {
    respond({ continue: true, additionalContext: summary });
  } else {
    pass();
  }
}

/** 세션 종료 시 활동 요약 텍스트를 반환 */
function generateSessionSummary(sid: string): string | null {
  const dir = sessionDir(sid);
  if (!existsSync(dir)) return null;

  try {
    const parts: string[] = [`Session ${sid} summary:`];
    let hasActivity = false;

    // 에이전트 이력
    const agentsPath = join(dir, 'agents.json');
    if (existsSync(agentsPath)) {
      const record: AgentRecord = JSON.parse(readFileSync(agentsPath, 'utf-8'));
      if (record.history.length > 0) {
        hasActivity = true;
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
      if (t.toolCallCount > 0) { hasActivity = true; parts.push(`Tools: ${t.toolCallCount} calls`); }
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

    if (!hasActivity) return null;

    return parts.join('\n');
  } catch { return null; }
}

/** 모든 세션의 워크플로우 상태 정리 + 오래된 빈 세션 삭제 (SessionStart 시 호출) */
function cleanupAllSessionStates(): void {
  const sessionsDir = join(RUNTIME_ROOT, 'state', 'sessions');
  if (!existsSync(sessionsDir)) return;
  try {
    const dirs = readdirSync(sessionsDir);
    for (const dir of dirs) {
      cleanupSessionState(dir);
    }
    // 빈 세션 디렉토리 정리 (최근 10개 유지)
    if (dirs.length > 10) {
      const sorted = dirs
        .filter(d => !d.startsWith('e2e'))
        .map(d => ({ name: d, mtime: statSync(join(sessionsDir, d)).mtimeMs }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const s of sorted.slice(10)) {
        const sdir = join(sessionsDir, s.name);
        try {
          const files = readdirSync(sdir);
          if (files.length === 0) {
            rmdirSync(sdir);
          }
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
}

/** 세션 디렉토리 전체 삭제 */
function cleanupSessionState(sid: string): void {
  const dir = sessionDir(sid);
  if (!existsSync(dir)) return;

  try { rmSync(dir, { recursive: true, force: true }); } catch { /* skip */ }
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

/** SubagentStop 시 workflow.json의 parallel 태스크를 자동 완료 처리 */
function updateParallelOnAgentStop(sid: string, agentName: string): void {
  const path = join(sessionDir(sid), 'workflow.json');
  if (!existsSync(path)) return;

  try {
    const state = JSON.parse(readFileSync(path, 'utf-8'));
    if (state.mode !== 'parallel' || !state.parallel || !Array.isArray(state.parallel.tasks)) return;

    let updated = false;
    for (const task of state.parallel.tasks) {
      // running 상태인 해당 에이전트의 태스크를 done으로 변경
      if (task.agent === agentName && task.status === 'running') {
        task.status = 'done';
        updated = true;
        break; // 한 번에 하나만 완료 (동일 에이전트 복수 태스크 시 순차)
      }
    }

    if (updated) {
      state.parallel.completedCount = state.parallel.tasks.filter((t: { status: string }) => t.status === 'done').length;
      writeFileSync(path, JSON.stringify(state, null, 2));

      // 모든 태스크 완료 시 자동 해제
      if (state.parallel.completedCount >= state.parallel.totalCount && state.parallel.totalCount > 0) {
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
