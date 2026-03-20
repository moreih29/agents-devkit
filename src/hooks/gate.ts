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
  primitive: 'sustain' | 'parallel' | 'pipeline' | 'consult';
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
  cruise:   { primitive: 'pipeline', skill: 'lattice:cruise' },
  consult:  { primitive: 'consult',  skill: 'lattice:consult' },
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
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: 'consult', skill: 'lattice:consult' },
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
    // consult는 대화형 — 상태 파일 불필요, 컨텍스트 주입만
    if (match.primitive === 'consult') {
      respond({
        continue: true,
        additionalContext: `[LATTICE] Consult mode activated. Follow the consult workflow:
1. EXPLORE: Read relevant code, knowledge (lat_knowledge_read), and context (lat_context)
2. DIVERGE: Generate 2-4 genuinely different approaches
3. PROPOSE: Present options using AskUserQuestion with preview for concrete comparisons
4. CONVERGE: Elaborate on chosen approach, ask follow-up if needed, produce concrete plan
5. (OPTIONAL) EXECUTE: Offer to transition to cruise/pipeline/manual
Key: Ask specific questions with real choices, not vague "what do you think?". Max 2 rounds of questions.`,
      });
      return;
    }

    const sid = getSessionId();
    activatePrimitive(match.primitive, sid);

    respond({
      continue: true,
      additionalContext: `[LATTICE] ${match.primitive} mode ACTIVATED (session: ${sid}). Do NOT stop until the task is fully complete. IMPORTANT: Before finishing your response, you MUST call lat_state_clear({ key: "${match.primitive}" }) to deactivate. Do NOT attempt to stop without clearing state first.`,
    });
    return;
  }

  // 적응형 라우팅: 명시적 키워드 없을 때 요청 분류 → 에이전트/워크플로우 제안
  const routing = detectRouting(prompt);
  if (routing) {
    respond({
      continue: true,
      additionalContext: routing,
    });
    return;
  }

  pass();
}

// --- 적응형 라우팅 ---

const AGENT_NAMES = [
  'scout', 'artisan', 'sentinel', 'tinker', 'steward', 'compass',
  'strategist', 'lens', 'analyst', 'weaver', 'scribe',
];

interface RoutingRule {
  category: string;
  patterns: RegExp[];
  agent?: string;
  workflow?: string;
}

const ROUTING_RULES: RoutingRule[] = [
  {
    category: '버그 수정',
    patterns: [/버그/, /고쳐/, /\bfix\b/i, /에러/, /\berror\b/i, /안\s*돼/, /안\s*됨/, /\bbug\b/i, /오류/, /문제.*해결/],
    agent: 'tinker',
    workflow: 'sustain',
  },
  {
    category: '코드 리뷰',
    patterns: [/리뷰/, /\breview\b/i, /봐\s*줘/, /검토/, /코드\s*확인/],
    agent: 'lens',
  },
  {
    category: '테스트',
    patterns: [/테스트/, /\btest\b/i, /커버리지/, /\bcoverage\b/i, /검증\s*코드/],
    agent: 'weaver',
    workflow: 'sustain',
  },
  {
    category: '리팩토링',
    patterns: [/리팩토링/, /\brefactor\b/i, /정리/, /개선/, /클린\s*업/, /\bclean\s*up\b/i],
    agent: 'artisan',
    workflow: 'sustain',
  },
  {
    category: '탐색/검색',
    patterns: [/찾아/, /어디/, /\bsearch\b/i, /\bfind\b/i, /검색/, /위치/],
    agent: 'scout',
  },
  {
    category: '설계/아키텍처',
    patterns: [/설계/, /아키텍처/, /구조/, /\bdesign\b/i, /\barchitect/i],
    agent: 'compass',
  },
  {
    category: '계획 수립',
    patterns: [/계획/, /\bplan\b/i, /어떻게\s*진행/, /단계/, /로드맵/],
    agent: 'strategist',
  },
  {
    category: '분석',
    patterns: [/분석/, /\banalyze?\b/i, /왜\s/, /원인/, /조사/, /\binvestigat/i],
    agent: 'analyst',
    workflow: 'sustain',
  },
  {
    category: '문서',
    patterns: [/문서/, /\bREADME\b/i, /\bdocs?\b/i, /가이드/, /주석/],
    agent: 'scribe',
  },
  {
    category: '대규모 구현',
    patterns: [/구현/, /만들어/, /추가/, /\bimplement\b/i, /\bcreate\b/i, /새로운?\s*기능/],
    workflow: 'cruise',
  },
];

function detectRouting(prompt: string): string | null {
  // 사용자가 에이전트를 직접 언급하면 해당 에이전트만 제안 (override)
  const agentOverride = detectAgentOverride(prompt);
  if (agentOverride) {
    return `[LATTICE] 에이전트 지정: lattice:${agentOverride}`;
  }

  // 카테고리 분류
  for (const rule of ROUTING_RULES) {
    if (rule.patterns.some((p) => p.test(prompt))) {
      if (rule.agent && rule.workflow) {
        return `[LATTICE] ${rule.category} → lattice:${rule.agent} + ${rule.workflow} 추천`;
      } else if (rule.agent) {
        return `[LATTICE] ${rule.category} → lattice:${rule.agent} 추천`;
      } else if (rule.workflow === 'cruise') {
        return `[LATTICE] ${rule.category} → cruise 워크플로우 추천 (대규모 작업 시)`;
      }
    }
  }

  return null;
}

function detectAgentOverride(prompt: string): string | null {
  const lower = prompt.toLowerCase();
  for (const name of AGENT_NAMES) {
    // "Scout로", "artisan으로", "Lens에게" 등 에이전트명 + 조사 패턴
    if (new RegExp(`\\b${name}\\b`, 'i').test(lower)) {
      return name;
    }
  }
  return null;
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
