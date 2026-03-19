// Gate 훅: Stop (Sustain/Pipeline 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { statePath, sessionDir, ensureDir } from '../shared/paths.js';
import { getSessionId } from '../shared/session.js';

// --- Stop 이벤트 처리 ---

interface SustainState {
  active: boolean;
  maxIterations: number;
  currentIteration: number;
}

function handleStop(): void {
  const sid = getSessionId();

  // Sustain 체크
  const sustainPath = statePath(sid, 'sustain');
  if (existsSync(sustainPath)) {
    try {
      const state: SustainState = JSON.parse(readFileSync(sustainPath, 'utf-8'));
      if (state.active && state.currentIteration < state.maxIterations) {
        // iteration 증가
        state.currentIteration++;
        writeFileSync(sustainPath, JSON.stringify(state, null, 2));

        respond({
          decision: 'block',
          reason: `[SUSTAIN ${state.currentIteration}/${state.maxIterations}] 작업이 완료되지 않았습니다. 계속 진행하세요. 작업이 정말 끝났다면 lat_state_clear({ key: "sustain" })를 호출하여 sustain을 해제하세요.`,
        });
        return;
      }
      // maxIterations 도달 시 자동 해제
      if (state.active && state.currentIteration >= state.maxIterations) {
        state.active = false;
        writeFileSync(sustainPath, JSON.stringify(state, null, 2));
      }
    } catch {
      // 파싱 실패 시 통과
    }
  }

  // Pipeline 체크
  const pipelinePath = statePath(sid, 'pipeline');
  if (existsSync(pipelinePath)) {
    try {
      const state = JSON.parse(readFileSync(pipelinePath, 'utf-8'));
      if (state.active) {
        const stageInfo = state.currentStage
          ? `${state.currentStage} (${(state.currentStageIndex ?? 0) + 1}/${state.totalStages ?? '?'})`
          : '?';
        respond({
          decision: 'block',
          reason: `[PIPELINE stage: ${stageInfo}] 파이프라인이 실행 중입니다. 현재 단계를 완료하고 다음 단계로 진행하세요.`,
        });
        return;
      }
    } catch {
      // 파싱 실패 시 통과
    }
  }

  // Parallel 체크
  const parallelPath = statePath(sid, 'parallel');
  if (existsSync(parallelPath)) {
    try {
      const state = JSON.parse(readFileSync(parallelPath, 'utf-8'));
      if (state.active) {
        const completed = state.completedCount ?? 0;
        const total = state.totalCount ?? 0;
        if (total > 0 && completed < total) {
          respond({
            decision: 'block',
            reason: `[PARALLEL ${completed}/${total}] 병렬 태스크가 진행 중입니다. 모든 태스크가 완료될 때까지 계속하세요.`,
          });
          return;
        }
        // total=0 (태스크 미설정) 또는 전부 완료: Sustain이 차단을 담당
      }
    } catch {
      // 파싱 실패 시 통과
    }
  }

  pass();
}

// --- UserPromptSubmit 이벤트 처리: 키워드 감지 ---

interface KeywordMatch {
  primitive: 'sustain' | 'parallel' | 'pipeline';
  skill: string;
}

interface CruiseMatch {
  primitives: string[];
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  sustain:  { primitive: 'sustain',  skill: 'lattice:sustain' },
  parallel: { primitive: 'parallel', skill: 'lattice:parallel' },
  pipeline: { primitive: 'pipeline', skill: 'lattice:pipeline' },
  cruise: { primitive: 'pipeline', skill: 'lattice:cruise' },
};

const CRUISE_PATTERNS: RegExp[] = [/\bcruise\b/i, /자동으로\s*전부/, /end\s*to\s*end/i];

const NATURAL_PATTERNS: Array<{ patterns: RegExp[]; match: KeywordMatch }> = [
  {
    patterns: [/\bsustain\b/i, /\bkeep\s+going\b/i, /\bdon'?t\s+stop\b/i, /멈추지\s*마/],
    match: { primitive: 'sustain', skill: 'lattice:sustain' },
  },
  {
    patterns: [/\bparallel\b/i, /\bconcurrent\b/i, /동시에/, /병렬로/],
    match: { primitive: 'parallel', skill: 'lattice:parallel' },
  },
  {
    patterns: [/\bpipeline\b/i, /순서대로/],
    match: { primitive: 'pipeline', skill: 'lattice:pipeline' },
  },
];

function detectCruise(prompt: string): boolean {
  // 명시적 태그
  const tagMatch = prompt.match(/\[(\w+)\]/);
  if (tagMatch && tagMatch[1].toLowerCase() === 'cruise') return true;
  // 자연어 패턴
  return CRUISE_PATTERNS.some((p) => p.test(prompt));
}

function detectKeywords(prompt: string): KeywordMatch | null {
  // 1차: 명시적 태그 [sustain], [parallel], [pipeline]
  const tagMatch = prompt.match(/\[(\w+)\]/);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    if (tag in EXPLICIT_TAGS) return EXPLICIT_TAGS[tag];
  }

  // 2차: 자연어 패턴
  for (const { patterns, match } of NATURAL_PATTERNS) {
    if (patterns.some((p) => p.test(prompt))) return match;
  }

  return null;
}

function activatePrimitive(primitive: string, sid: string): void {
  const dir = sessionDir(sid);
  ensureDir(dir);

  const state = {
    active: true,
    maxIterations: 100,
    currentIteration: 0,
    startedAt: new Date().toISOString(),
    sessionId: sid,
  };
  writeFileSync(statePath(sid, primitive), JSON.stringify(state, null, 2));
}

function handleUserPromptSubmit(event: Record<string, unknown>): void {
  const prompt = (event.prompt ?? event.user_prompt ?? '') as string;
  if (!prompt) { pass(); return; }

  // cruise: pipeline + sustain 동시 활성화
  if (detectCruise(prompt)) {
    const sid = getSessionId();
    activatePrimitive('pipeline', sid);
    activatePrimitive('sustain', sid);

    respond({
      continue: true,
      additionalContext: `[LATTICE] cruise mode ACTIVATED (session: ${sid}). Pipeline + Sustain enabled.
Execute these stages IN ORDER:
1. Analyze — understand the codebase and request
2. Plan — break into actionable steps
3. Implement — write code (use parallel Agent calls for independent tasks)
4. Verify — run tests, type-check
5. Review — review your own changes for correctness
Update pipeline state with lat_state_write as you progress through stages.
IMPORTANT: Before finishing, call lat_state_clear({ key: "cruise" }) to deactivate all state at once. Do NOT stop without clearing state first.`,
    });
    return;
  }

  const match = detectKeywords(prompt);
  if (match) {
    const sid = getSessionId();
    activatePrimitive(match.primitive, sid);

    respond({
      continue: true,
      additionalContext: `[LATTICE] ${match.primitive} mode ACTIVATED (session: ${sid}). Do NOT stop until the task is fully complete. IMPORTANT: Before finishing your response, you MUST call lat_state_clear({ key: "${match.primitive}" }) to deactivate. Do NOT attempt to stop without clearing state first.`,
    });
    return;
  }

  pass();
}

// --- 메인 ---

async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  // Claude Code는 hook_event_name을 보내지 않을 수 있음.
  // UserPromptSubmit은 prompt 필드가 있고, Stop은 없음.
  const hasPrompt = 'prompt' in event || 'user_prompt' in event;

  if (hasPrompt) {
    handleUserPromptSubmit(event);
  } else {
    handleStop();
  }
}

main().catch(() => {
  respond({ continue: true });
});
