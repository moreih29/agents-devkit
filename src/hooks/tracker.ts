// Tracker 훅: SubagentStart/Stop, SessionStart/End — 에이전트/세션 추적
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync, writeFileSync, readdirSync, rmdirSync, rmSync, statSync } from 'fs';
import { sessionDir, ensureDir, RUNTIME_ROOT, KNOWLEDGE_ROOT, updateWorkflowPhase, getBasePhase } from '../shared/paths.js';
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

type CodebaseType = 'disciplined' | 'transitional' | 'legacy' | 'greenfield';

interface CodebaseProfile {
  type: CodebaseType;
  description: string;
  hasLinter: boolean;
  hasTests: boolean;
  hasCI: boolean;
  hasSrc: boolean;
  fileCount: number;
}

function analyzeCodebase(cwd: string): CodebaseProfile {
  let fileCount = 0;
  try {
    const entries = readdirSync(cwd);
    fileCount = entries.length;
  } catch { /* skip */ }

  const has = (names: string[]): boolean => names.some(n => existsSync(join(cwd, n)));

  const hasLinter = has(['.eslintrc', '.eslintrc.js', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml', 'eslint.config.js', 'eslint.config.ts', 'eslint.config.mjs', '.prettierrc', '.prettierrc.js', '.prettierrc.json', '.prettierrc.yml']);
  const hasTests = has(['test', 'tests', '__tests__', 'spec']);
  const hasCI = has(['.github', '.circleci']);
  const hasSrc = has(['src']);

  let type: CodebaseType;
  let description: string;

  if (fileCount < 20 && !hasLinter && !hasTests) {
    type = 'greenfield';
    description = 'Few files, no established patterns yet';
  } else if (hasLinter && hasTests && hasCI) {
    type = 'disciplined';
    description = 'Has linter, tests, and CI — follow existing conventions strictly';
  } else if (hasSrc) {
    type = 'transitional';
    description = 'Has src/ but missing some tooling — introduce patterns incrementally';
  } else {
    type = 'legacy';
    description = 'Large codebase without modern tooling — be conservative with changes';
  }

  return { type, description, hasLinter, hasTests, hasCI, hasSrc, fileCount };
}

function handleSessionStart(): void {
  // 모든 세션의 잔존 워크플로우 상태 정리 (resume, 비정상 종료, 벤치마크 잔존 등 방어)
  cleanupAllSessionStates();

  const sid = createSession();
  const dir = sessionDir(sid);
  ensureDir(dir);

  // 현재 브랜치의 plan 존재 확인
  let branch = 'unknown';
  let cwd = process.cwd();
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    cwd = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch { /* skip */ }

  const branchDir = branch.replace(/\//g, '--');
  const planDirPath = join(RUNTIME_ROOT, 'plans', branchDir);
  const hasPlanDir = existsSync(planDirPath);
  const planFile = join(planDirPath, 'plan.md');
  const hasPlan = existsSync(planFile);

  const workflowPath = join(sessionDir(sid), 'workflow.json');
  const hasWorkflow = existsSync(workflowPath);

  // Codebase analysis
  const profile = analyzeCodebase(cwd);
  try {
    writeFileSync(join(dir, 'codebase-profile.json'), JSON.stringify(profile, null, 2));
  } catch { /* skip */ }

  const codebaseCtx = `Codebase: ${profile.type}. ${profile.description}`;

  const isMainBranch = branch === 'main' || branch === 'master';

  if (hasPlanDir && !hasWorkflow && !isMainBranch) {
    respond({
      continue: true,
      additionalContext: `[NEXUS] Session ${sid} started. Branch: ${branch}. Mode: planning. Plan directory found. ${codebaseCtx}
DECISION CAPTURE: You are in multi-turn planning mode. When the user makes decisions (confirmatory expressions like "이걸로 하자", "삭제하자", "이렇게 바꾸자", or [d] tag), record them in .nexus/plans/${branchDir}/plan.md under the decisions section.
When the user says "구현하자" or requests implementation, generate tasks.json from the accumulated decisions.`,
    });
  } else {
    respond({
      continue: true,
      additionalContext: `[NEXUS] Session ${sid} started. Branch: ${branch}. Plan: ${hasPlan ? 'found' : 'none'}. ${codebaseCtx}`,
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

  // Phase 자동 전환: 에이전트 spawn → delegating
  updateWorkflowPhase(sid, 'delegating');

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

  // Phase 자동 전환: 마지막 에이전트 종료 → base phase로 복귀
  if (record.active.length === 0) {
    const base = getBasePhase(sid);
    if (base) updateWorkflowPhase(sid, base);
  }

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
