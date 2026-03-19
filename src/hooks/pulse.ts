// Pulse 훅: PreToolUse/PostToolUse — Whisper 패턴 컨텍스트 주입 + Guard
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { sessionDir, ensureDir, statePath } from '../shared/paths.js';
import { getSessionId } from '../shared/session.js';
import { join } from 'path';

// --- Whisper Tracker ---

interface WhisperTracker {
  injections: Record<string, number>;
  toolCallCount: number;
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
  scout: 'minimal',
  artisan: 'standard',
  sentinel: 'standard',
  tinker: 'standard',
  steward: 'full',
  compass: 'full',
  strategist: 'full',
  lens: 'full',
  analyst: 'full',
  weaver: 'standard',
  scribe: 'minimal',
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

// --- Context Messages ---

interface ContextMessage {
  key: string;
  priority: 'safety' | 'workflow' | 'guidance' | 'info';
  text: string;
}

const MAX_REPEAT = 3;
const ADAPTIVE_THRESHOLD = 60; // tool calls 이후 minimal 모드

function buildMessages(toolName: string, hookEvent: string, sid: string): ContextMessage[] {
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

  // Workflow: Sustain 리마인더
  const sustainPath = statePath(sid, 'sustain');
  if (existsSync(sustainPath)) {
    try {
      const state = JSON.parse(readFileSync(sustainPath, 'utf-8'));
      if (state.active) {
        messages.push({
          key: 'workflow:sustain_active',
          priority: 'workflow',
          text: `[SUSTAIN ${state.currentIteration ?? 0}/${state.maxIterations ?? 100}] Sustain mode is active. Continue working until the task is complete.`,
        });
      }
    } catch { /* skip */ }
  }

  // Workflow: Pipeline 리마인더
  const pipelinePath = statePath(sid, 'pipeline');
  if (existsSync(pipelinePath)) {
    try {
      const state = JSON.parse(readFileSync(pipelinePath, 'utf-8'));
      if (state.active) {
        const stageInfo = state.currentStage
          ? `${state.currentStage} (${(state.currentStageIndex ?? 0) + 1}/${state.totalStages ?? '?'})`
          : 'initializing';
        messages.push({
          key: 'workflow:pipeline_active',
          priority: 'workflow',
          text: `[PIPELINE stage: ${stageInfo}] Pipeline is active. Complete the current stage, then advance to the next.`,
        });
      }
    } catch { /* skip */ }
  }

  // Workflow: Parallel 리마인더
  const parallelPath = statePath(sid, 'parallel');
  if (existsSync(parallelPath)) {
    try {
      const state = JSON.parse(readFileSync(parallelPath, 'utf-8'));
      if (state.active) {
        const completed = state.completedCount ?? 0;
        const total = state.totalCount ?? 0;
        messages.push({
          key: 'workflow:parallel_active',
          priority: 'workflow',
          text: `[PARALLEL ${completed}/${total} done] Parallel tasks are active. Ensure all tasks complete before finishing.`,
        });
      }
    } catch { /* skip */ }
  }

  return messages;
}

// --- Main ---

async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hookEvent = event.hook_event_name ?? event.type ?? '';
  const toolName = event.tool_name ?? '';

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

  const messages = buildMessages(toolName, hookEvent, sid);
  const filtered: string[] = [];

  for (const msg of messages) {
    // adaptive 모드에서는 safety/workflow만
    if (adaptiveMinimal && msg.priority !== 'safety' && msg.priority !== 'workflow') continue;

    // context level 분기:
    // minimal → safety + workflow만
    // standard → safety + workflow + guidance
    // full → 전부
    if (contextLevel === 'minimal' && msg.priority !== 'safety' && msg.priority !== 'workflow') continue;

    // 중복 방지: MAX_REPEAT 초과 시 건너뜀
    const count = tracker.injections[msg.key] ?? 0;
    if (count >= MAX_REPEAT) continue;

    tracker.injections[msg.key] = count + 1;
    filtered.push(msg.text);
  }

  saveTracker(sid, tracker);

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
