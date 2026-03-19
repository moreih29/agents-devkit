// Gate 훅: Stop (Sustain/Pipeline 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync } from 'fs';
import { statePath } from '../shared/paths.js';
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
        respond({
          decision: 'block',
          reason: `[SUSTAIN ${state.currentIteration + 1}/${state.maxIterations}] 작업이 완료되지 않았습니다. 계속 진행하세요.`,
        });
        return;
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
        respond({
          decision: 'block',
          reason: `[PIPELINE stage: ${state.currentStage ?? '?'}] 파이프라인이 실행 중입니다.`,
        });
        return;
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

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  sustain:  { primitive: 'sustain',  skill: 'lattice:sustain' },
  parallel: { primitive: 'parallel', skill: 'lattice:parallel' },
  pipeline: { primitive: 'pipeline', skill: 'lattice:pipeline' },
};

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
    patterns: [/\bpipeline\b/i, /\bauto\b/i, /자동으로/, /순서대로/],
    match: { primitive: 'pipeline', skill: 'lattice:pipeline' },
  },
];

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

function handleUserPromptSubmit(event: { user_prompt?: string }): void {
  const prompt = event.user_prompt ?? '';
  if (!prompt) { pass(); return; }

  const match = detectKeywords(prompt);
  if (match) {
    respond({
      continue: true,
      additionalContext: `[LATTICE KEYWORD: ${match.primitive}] Invoke /${match.skill} to activate ${match.primitive} mode.`,
    });
    return;
  }

  pass();
}

// --- 메인 ---

async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hookEvent = event.hook_event_name ?? event.type ?? '';

  if (hookEvent === 'Stop') {
    handleStop();
  } else if (hookEvent === 'UserPromptSubmit') {
    handleUserPromptSubmit(event);
  } else {
    pass();
  }
}

main().catch(() => {
  respond({ continue: true });
});
