// Pulse 훅: PreToolUse/PostToolUse — Whisper 패턴 컨텍스트 주입 + Guard
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { sessionDir, ensureDir, RUNTIME_ROOT, updateWorkflowPhase } from '../shared/paths.js';
import { getSessionId } from '../shared/session.js';
import { join } from 'path';

// --- Whisper Tracker ---

interface WhisperTracker {
  injections: Record<string, number>;
  toolCallCount: number;
  lastWorkflowHash?: string; // 워크플로우 상태 변경 감지용
}

function loadTracker(sid: string): WhisperTracker {
  const path = join(sessionDir(sid), 'whisper-tracker.json');
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch { /* fallthrough */ }
  }
  return { injections: {}, toolCallCount: 0 };
}

function saveTracker(sid: string, tracker: WhisperTracker): void {
  const dir = sessionDir(sid);
  ensureDir(dir);
  writeFileSync(join(dir, 'whisper-tracker.json'), JSON.stringify(tracker));
}

// --- Agent Context Levels ---

type ContextLevel = 'minimal' | 'standard' | 'full';

const AGENT_CONTEXT_LEVELS: Record<string, ContextLevel> = {
  finder: 'minimal',
  builder: 'standard',
  guard: 'standard',
  debugger: 'standard',
  architect: 'full',
  strategist: 'full',
  reviewer: 'full',
  analyst: 'full',
  tester: 'standard',
  writer: 'minimal',
};

function getActiveContextLevel(sid: string): ContextLevel {
  const agentsPath = join(sessionDir(sid), 'agents.json');
  if (!existsSync(agentsPath)) return 'standard'; // 메인 세션
  try {
    const record = JSON.parse(readFileSync(agentsPath, 'utf-8'));
    const active: string[] = record.active ?? [];
    if (active.length === 0) return 'standard';

    // 활성 에이전트 중 가장 높은 수준 적용
    let highest: ContextLevel = 'minimal';
    for (const name of active) {
      const level = AGENT_CONTEXT_LEVELS[name] ?? 'standard';
      if (level === 'full') return 'full';
      if (level === 'standard') highest = 'standard';
    }
    return highest;
  } catch {
    return 'standard';
  }
}

// --- Delegation Enforcement ---

function getDelegationEnforcement(): 'off' | 'warn' | 'strict' {
  const configPath = join(RUNTIME_ROOT, 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const level = config.delegationEnforcement;
      if (level === 'off' || level === 'warn' || level === 'strict') return level;
    } catch { /* skip */ }
  }
  return 'warn';
}

const ALLOWED_PATHS = ['.nexus/', '.claude/nexus/', '.claude/settings', 'CLAUDE.md', 'test/'];

function isAllowedPath(filePath: string): boolean {
  return ALLOWED_PATHS.some(p => filePath.includes(p));
}

// --- Plugin Detection ---

function isContext7Available(): boolean {
  // 프로젝트 또는 글로벌 settings에서 context7 플러그인 활성화 확인
  const paths = [
    join(process.cwd(), '.claude', 'settings.json'),
    join(process.env.HOME || '~', '.claude', 'settings.json'),
  ];
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        const settings = JSON.parse(readFileSync(p, 'utf-8'));
        if (settings.enabledPlugins?.['context7@claude-plugins-official'] === true) return true;
      }
    } catch { /* skip */ }
  }
  return false;
}

let _context7Cached: boolean | null = null;
function hasContext7(): boolean {
  if (_context7Cached === null) _context7Cached = isContext7Available();
  return _context7Cached;
}

// --- Context Messages ---

interface ContextMessage {
  key: string;
  priority: 'safety' | 'workflow' | 'guidance' | 'info';
  text: string;
}

const MAX_REPEAT = 1; // guidance는 1회만 주입 (토큰 절감)
const ADAPTIVE_THRESHOLD = 60; // tool calls 이후 minimal 모드

function buildMessages(toolName: string, hookEvent: string, sid: string, toolInput?: Record<string, unknown>): ContextMessage[] {
  const messages: ContextMessage[] = [];

  // Guard: 안전 관련 (최우선)
  if (hookEvent === 'PreToolUse' && toolName === 'Bash') {
    messages.push({
      key: 'Bash:parallel_reminder',
      priority: 'guidance',
      text: 'Use parallel execution for independent tasks. Use run_in_background for long operations.',
    });
  }

  if (hookEvent === 'PreToolUse' && toolName === 'Read') {
    messages.push({
      key: 'Read:parallel_reminder',
      priority: 'guidance',
      text: 'Read multiple files in parallel when possible for faster analysis.',
    });
  }

  // 6-Section delegation format — Agent() 호출 시 주입
  if (hookEvent === 'PreToolUse' && toolName === 'Agent') {
    messages.push({
      key: 'Agent:six_section_format',
      priority: 'guidance',
      text: `[NEXUS DELEGATION FORMAT] Structure your agent prompt with these 6 sections:
1. TASK: Exact work item
2. EXPECTED OUTCOME: Files changed, behavior verified
3. REQUIRED TOOLS: Tools the agent should use
4. MUST DO: Mandatory requirements
5. MUST NOT DO: Prohibited actions
6. CONTEXT: Background info, dependencies, related files`,
    });
    // context7 플러그인이 설치된 경우, 에이전트에게 라이브러리 문서 조회 힌트 주입
    if (hasContext7()) {
      messages.push({
        key: 'Agent:context7_hint',
        priority: 'guidance',
        text: '[CONTEXT7] Library docs available via MCP: resolve-library-id → query-docs. Use when working with external libraries/frameworks to check up-to-date API usage, examples, and best practices.',
      });
    }
  }

  // Failure recovery — workflow.json에 failures 존재 시 복구 가이던스
  const workflowPath = join(sessionDir(sid), 'workflow.json');
  if (existsSync(workflowPath)) {
    try {
      const state = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      if (Array.isArray(state.failures) && state.failures.length > 0) {
        const count = state.failures.length;
        if (count < 3) {
          messages.push({
            key: 'recovery:failure_detected',
            priority: 'workflow',
            text: `[RECOVERY ${count}/3] Previous attempt failed. Analyze the failure, adjust approach, and retry. After 3 failures, stop and report to user.`,
          });
        } else {
          messages.push({
            key: 'recovery:max_failures',
            priority: 'safety',
            text: `[RECOVERY ${count}/3] Maximum retry limit reached. STOP retrying. Report failures to the user and ask for guidance.`,
          });
        }
      }
    } catch { /* skip */ }
  }

  // Delegation enforcement: Write/Edit 도구 사용 시 위임 강제
  if (hookEvent === 'PreToolUse' && /^(Write|Edit|write|edit)$/.test(toolName)) {
    const enforcement = getDelegationEnforcement();
    if (enforcement !== 'off') {
      const filePath = (toolInput?.file_path ?? '') as string;
      if (filePath && !isAllowedPath(filePath)) {
        messages.push({
          key: 'delegation:enforce',
          priority: 'safety',
          text: '[NEXUS DELEGATION] You are editing source files directly. Consider delegating to a specialized agent: Builder (implementation), Debugger (bug fixes), Tester (test writing). Use Agent({ subagent_type: \'nexus:<agent>\', prompt: \'<task>\' }).',
        });
      }
    }
  }

  return messages;
}

// --- Main ---

async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hookEvent = event.hook_event_name ?? event.type ?? '';
  const toolName = event.tool_name ?? '';
  const toolInput = (event.tool_input ?? undefined) as Record<string, unknown> | undefined;

  const sid = getSessionId();

  // fast path: 세션 디렉토리 없으면 워크플로우/에이전트 비활성 → 상태 I/O 생략
  const sessDir = sessionDir(sid);
  if (!existsSync(sessDir)) {
    pass();
    return;
  }

  // Phase 자동 전환: AskUserQuestion 호출 → waiting
  if (hookEvent === 'PreToolUse' && toolName === 'AskUserQuestion') {
    updateWorkflowPhase(sid, 'waiting');
  }

  const tracker = loadTracker(sid);
  const contextLevel = getActiveContextLevel(sid);

  tracker.toolCallCount++;

  // adaptive 모드: 일정 도구 호출 이후 핵심 메시지만
  const adaptiveMinimal = tracker.toolCallCount > ADAPTIVE_THRESHOLD;

  const messages = buildMessages(toolName, hookEvent, sid, toolInput);

  // 워크플로우 상태 변경 감지: 변경 없으면 workflow 메시지 스킵
  const workflowMessages = messages.filter(m => m.priority === 'workflow');
  const workflowHash = workflowMessages.map(m => m.key).sort().join('|');
  const workflowChanged = workflowHash !== (tracker.lastWorkflowHash ?? '');
  if (workflowChanged) tracker.lastWorkflowHash = workflowHash;

  const filtered: string[] = [];

  for (const msg of messages) {
    // adaptive 모드에서는 safety/workflow만
    if (adaptiveMinimal && msg.priority !== 'safety' && msg.priority !== 'workflow') continue;

    // context level 분기:
    // minimal → safety + workflow만
    // standard → safety + workflow + guidance
    // full → 전부
    if (contextLevel === 'minimal' && msg.priority !== 'safety' && msg.priority !== 'workflow') continue;

    // 워크플로우 메시지는 상태가 변경된 경우에만 주입
    if (msg.priority === 'workflow' && !workflowChanged) continue;

    // 중복 방지: MAX_REPEAT 초과 시 건너뜀 (delegation:enforce safety는 매번 주입)
    const count = tracker.injections[msg.key] ?? 0;
    if (count >= MAX_REPEAT && msg.key !== 'delegation:enforce') continue;

    tracker.injections[msg.key] = count + 1;
    filtered.push(msg.text);
  }

  // 프로그레스 알림: 매 20회마다 진행 상태 요약
  const PROGRESS_INTERVAL = 20;
  if (tracker.toolCallCount > 0 && tracker.toolCallCount % PROGRESS_INTERVAL === 0) {
    const progressParts: string[] = [`[PROGRESS ${tracker.toolCallCount} tools]`];

    // 에이전트 이력 수
    try {
      const agentsPath = join(sessionDir(sid), 'agents.json');
      if (existsSync(agentsPath)) {
        const record = JSON.parse(readFileSync(agentsPath, 'utf-8'));
        if (record.history?.length > 0) progressParts.push(`agents: ${record.history.length} spawned`);
      }
    } catch { /* skip */ }

    filtered.push(progressParts.join(' | '));
  }

  saveTracker(sid, tracker);

  // strict 모드: delegation 경고가 포함된 Write/Edit를 차단
  const hasDelegationWarning = messages.some(m => m.key === 'delegation:enforce');
  if (hasDelegationWarning && getDelegationEnforcement() === 'strict') {
    respond({
      decision: 'block',
      reason: '[NEXUS] Direct file editing is blocked. Delegate to a specialized agent.',
    });
    return;
  }

  if (filtered.length > 0) {
    respond({
      continue: true,
      additionalContext: filtered.join('\n'),
    });
  } else {
    pass();
  }
}

main().catch(() => {
  respond({ continue: true });
});
