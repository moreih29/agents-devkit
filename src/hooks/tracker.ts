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
  pass();
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
  pass();
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
