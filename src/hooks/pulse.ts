// Pulse 훅: PreToolUse/PostToolUse — Whisper 패턴 컨텍스트 주입 + Guard
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { sessionDir, ensureDir, RUNTIME_ROOT } from '../shared/paths.js';
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

function getCurrentMode(sid: string): string | null {
  const workflowPath = join(sessionDir(sid), 'workflow.json');
  if (!existsSync(workflowPath)) return null;
  try {
    const state = JSON.parse(readFileSync(workflowPath, 'utf-8'));
    return state.mode ?? null;
  } catch {
    return null;
  }
}

function isDelegationEnforcementApplicable(sid: string): boolean {
  const mode = getCurrentMode(sid);
  // enforcement only applies when idle (no active workflow mode)
  if (mode === 'auto' || mode === 'parallel' || mode === 'consult' || mode === 'plan') return false;
  return true;
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

  // Workflow: workflow.json에서 상태 읽기
  const workflowPath = join(sessionDir(sid), 'workflow.json');
  if (existsSync(workflowPath)) {
    try {
      const state = JSON.parse(readFileSync(workflowPath, 'utf-8'));

      // Auto mode: nonstop 리마인더
      if (state.mode === 'auto' && state.nonstop?.active) {
        messages.push({
          key: 'workflow:nonstop_active',
          priority: 'workflow',
          text: `[NONSTOP ${state.nonstop.iteration ?? 0}/${state.nonstop.max ?? 100}] Auto mode (nonstop) is active. Continue working until the task is complete.`,
        });

        // 80% 근접 경고
        if (state.nonstop.iteration >= (state.nonstop.max ?? 100) * 0.8) {
          messages.push({
            key: 'recovery:nonstop_limit',
            priority: 'safety',
            text: `[WARNING] Nonstop ${state.nonstop.iteration}/${state.nonstop.max}에 근접. 작업이 막혀있다면: 1) 현재 접근 방식을 재검토하세요. 2) nx_state_clear({ key: "auto" })로 해제 후 다른 전략을 시도하세요.`,
          });
        }
      }

      // Auto mode: pipeline stage 리마인더
      if (state.mode === 'auto' && state.phase) {
        messages.push({
          key: 'workflow:pipeline_active',
          priority: 'workflow',
          text: `[AUTO stage: ${state.phase}] Auto pipeline is active. Complete the current stage, then advance to the next.`,
        });
      }

      // Parallel mode 리마인더
      if (state.mode === 'parallel' && state.parallel) {
        const completed = state.parallel.completedCount ?? 0;
        const total = state.parallel.totalCount ?? 0;
        messages.push({
          key: 'workflow:parallel_active',
          priority: 'workflow',
          text: `[PARALLEL ${completed}/${total} done] Parallel tasks are active. Ensure all tasks complete before finishing.`,
        });
      }
    } catch { /* skip */ }
  }

  // Delegation enforcement: Write/Edit 도구 사용 시 위임 강제
  if (hookEvent === 'PreToolUse' && /^(Write|Edit|write|edit)$/.test(toolName)) {
    const enforcement = getDelegationEnforcement();
    if (enforcement !== 'off' && isDelegationEnforcementApplicable(sid)) {
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

    // 워크플로우 상태
    try {
      const workflowPath = join(sessionDir(sid), 'workflow.json');
      if (existsSync(workflowPath)) {
        const w = JSON.parse(readFileSync(workflowPath, 'utf-8'));
        if (w.mode === 'auto') {
          if (w.phase) progressParts.push(`auto: ${w.phase}`);
          if (w.nonstop?.active) progressParts.push(`nonstop: ${w.nonstop.iteration ?? 0}/${w.nonstop.max ?? 100}`);
        } else if (w.mode === 'parallel' && w.parallel) {
          progressParts.push(`parallel: ${w.parallel.completedCount ?? 0}/${w.parallel.totalCount ?? 0}`);
        }
      }
    } catch { /* skip */ }

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
