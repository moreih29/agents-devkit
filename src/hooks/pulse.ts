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

const MAX_REPEAT = 1; // guidance는 1회만 주입 (토큰 절감)
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

  // 오류 복구 가이드: sustain iteration이 80% 이상이면 경고
  if (existsSync(sustainPath)) {
    try {
      const state = JSON.parse(readFileSync(sustainPath, 'utf-8'));
      if (state.active && state.currentIteration >= (state.maxIterations ?? 100) * 0.8) {
        messages.push({
          key: 'recovery:sustain_limit',
          priority: 'safety',
          text: `[WARNING] Sustain iteration ${state.currentIteration}/${state.maxIterations}에 근접. 작업이 막혀있다면: 1) 현재 접근 방식을 재검토하세요. 2) lat_state_clear({ key: "sustain" })로 해제 후 다른 전략을 시도하세요.`,
        });
      }
    } catch { /* skip */ }
  }

  // 오류 복구 가이드: pipeline에서 같은 stage에 오래 머물면 경고
  if (existsSync(pipelinePath)) {
    try {
      const state = JSON.parse(readFileSync(pipelinePath, 'utf-8'));
      if (state.active && state.currentIteration >= 10) {
        messages.push({
          key: 'recovery:pipeline_stuck',
          priority: 'safety',
          text: `[WARNING] Pipeline "${state.currentStage ?? 'unknown'}" 단계에서 ${state.currentIteration}회 반복 중. 막혀있다면: 1) 현재 단계를 skip하고 다음으로 진행하세요. 2) lat_state_clear({ key: "pipeline" })로 해제하세요.`,
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

    // 중복 방지: MAX_REPEAT 초과 시 건너뜀
    const count = tracker.injections[msg.key] ?? 0;
    if (count >= MAX_REPEAT) continue;

    tracker.injections[msg.key] = count + 1;
    filtered.push(msg.text);
  }

  // 프로그레스 알림: 매 20회마다 진행 상태 요약
  const PROGRESS_INTERVAL = 20;
  if (tracker.toolCallCount > 0 && tracker.toolCallCount % PROGRESS_INTERVAL === 0) {
    const progressParts: string[] = [`[PROGRESS ${tracker.toolCallCount} tools]`];

    // 워크플로우 상태
    try {
      const sustainP = statePath(sid, 'sustain');
      const pipelineP = statePath(sid, 'pipeline');
      if (existsSync(pipelineP) && existsSync(sustainP)) {
        const p = JSON.parse(readFileSync(pipelineP, 'utf-8'));
        if (p.active && p.currentStage) progressParts.push(`cruise: ${p.currentStage} ${(p.currentStageIndex ?? 0) + 1}/${p.totalStages ?? '?'}`);
      } else if (existsSync(sustainP)) {
        const s = JSON.parse(readFileSync(sustainP, 'utf-8'));
        if (s.active) progressParts.push(`sustain: ${s.currentIteration ?? 0}/${s.maxIterations ?? 100}`);
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
