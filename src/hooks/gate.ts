// Gate 훅: Stop (Nonstop/Pipeline 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { statePath, sessionDir, ensureDir, RUNTIME_ROOT } from '../shared/paths.js';
import { getSessionId } from '../shared/session.js';
import { join } from 'path';

// --- Stop 이벤트 처리 ---

interface SustainState {
  active: boolean;
  maxIterations: number;
  currentIteration: number;
}

function handleStop(): void {
  const sid = getSessionId();

  // Nonstop 체크
  const sustainPath = statePath(sid, 'nonstop');
  if (existsSync(sustainPath)) {
    try {
      const state: SustainState = JSON.parse(readFileSync(sustainPath, 'utf-8'));
      if (state.active && state.currentIteration < state.maxIterations) {
        // iteration 증가
        state.currentIteration++;
        writeFileSync(sustainPath, JSON.stringify(state, null, 2));

        respond({
          decision: 'block',
          reason: `[SUSTAIN ${state.currentIteration}/${state.maxIterations}] 작업이 완료되지 않았습니다. 계속 진행하세요. 작업이 정말 끝났다면 nx_state_clear({ key: "nonstop" })를 호출하여 nonstop을 해제하세요.`,
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
        // total=0 (태스크 미설정) 또는 전부 완료: Nonstop이 차단을 담당
      }
    } catch {
      // 파싱 실패 시 통과
    }
  }

  pass();
}

// --- UserPromptSubmit 이벤트 처리: 키워드 감지 ---

interface KeywordMatch {
  primitive: 'nonstop' | 'parallel' | 'pipeline' | 'consult' | 'init' | 'plan';
  skill: string;
}

interface CruiseMatch {
  primitives: string[];
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  nonstop:  { primitive: 'nonstop',  skill: 'nexus:nonstop' },
  parallel: { primitive: 'parallel', skill: 'nexus:parallel' },
  pipeline: { primitive: 'pipeline', skill: 'nexus:pipeline' },
  auto:   { primitive: 'pipeline', skill: 'nexus:auto' },
  consult:  { primitive: 'consult',  skill: 'nexus:consult' },
  init:     { primitive: 'init',     skill: 'nexus:init' },
  plan:     { primitive: 'plan',     skill: 'nexus:plan' },
};

const AUTO_PATTERNS: RegExp[] = [/\bauto\b/i, /\bcruise\b/i, /자동으로\s*전부/, /end\s*to\s*end/i];

const NATURAL_PATTERNS: Array<{ patterns: RegExp[]; match: KeywordMatch }> = [
  {
    patterns: [/\bnonstop\b/i, /\bsustain\b/i, /\bkeep\s+going\b/i, /\bdon'?t\s+stop\b/i, /멈추지\s*마/],
    match: { primitive: 'nonstop', skill: 'nexus:nonstop' },
  },
  {
    patterns: [/\bparallel\b/i, /\bconcurrent\b/i, /동시에/, /병렬로/],
    match: { primitive: 'parallel', skill: 'nexus:parallel' },
  },
  {
    patterns: [/\bpipeline\b/i, /순서대로/],
    match: { primitive: 'pipeline', skill: 'nexus:pipeline' },
  },
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: 'consult', skill: 'nexus:consult' },
  },
  {
    patterns: [/\binit\b/i, /온보딩/, /nexus\s*설정/, /프로젝트\s*초기화/],
    match: { primitive: 'init', skill: 'nexus:init' },
  },
  {
    patterns: [/계획\s*(세워|짜|수립)/, /\bplan\b/i, /구현\s*계획/, /설계해/, /어떻게\s*구현/, /plan\s*this/i],
    match: { primitive: 'plan', skill: 'nexus:plan' },
  },
];

// 프리미티브 이름이 에러/버그 맥락에서 언급되면 활성화가 아닌 "대화" — 오탐 방지
// "nonstop 에러 수정해" → 오탐, "멈추지 마" + "에러" → 정상 (프리미티브 이름 아님)
const ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
const PRIMITIVE_NAMES = /\b(nonstop|parallel|pipeline|auto|plan)\b/i;

/** 프리미티브 이름이 에러/버그 맥락과 함께 등장하는지 (오탐 판별) */
function isPrimitiveMention(prompt: string): boolean {
  return PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt);
}

function detectAuto(prompt: string): boolean {
  // 명시적 태그 — 항상 확정
  const tagMatch = prompt.match(/\[(\w+)\]/);
  if (tagMatch && tagMatch[1].toLowerCase() === 'auto') return true;
  // 프리미티브 이름 + 에러 맥락 → 단순 언급이므로 스킵
  if (isPrimitiveMention(prompt)) return false;
  return AUTO_PATTERNS.some((p) => p.test(prompt));
}

function detectKeywords(prompt: string): KeywordMatch | null {
  // 1차: 명시적 태그 [nonstop], [parallel], [pipeline] — 항상 확정
  const tagMatch = prompt.match(/\[(\w+)\]/);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    if (tag in EXPLICIT_TAGS) return EXPLICIT_TAGS[tag];
  }

  // 2차: 자연어 패턴 (프리미티브 이름 + 에러 맥락일 때만 필터)
  for (const { patterns, match } of NATURAL_PATTERNS) {
    if (patterns.some((p) => p.test(prompt))) {
      if (isPrimitiveMention(prompt)) continue;
      return match;
    }
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

  const isForced = /^force:\s*|^\[force\]\s*/i.test(prompt.trim());
  const cleanPrompt = isForced ? prompt.trim().replace(/^force:\s*|^\[force\]\s*/i, '') : prompt;

  // auto: pipeline + nonstop 동시 활성화
  if (detectAuto(cleanPrompt)) {
    if (!isForced && !hasConcreteSignals(cleanPrompt)) {
      respond({
        continue: true,
        additionalContext: `[NEXUS] The request lacks concrete signals (file paths, identifiers, issue numbers, or structured steps). Consider using [plan] to create a detailed plan first, or prefix with "force:" to proceed anyway.`,
      });
      return;
    }

    const sid = getSessionId();
    activatePrimitive('pipeline', sid);
    activatePrimitive('nonstop', sid);

    respond({
      continue: true,
      additionalContext: `[NEXUS] auto mode ACTIVATED (session: ${sid}). Pipeline + Nonstop enabled.
Execute these stages IN ORDER:
1. Analyze — understand the codebase and request
2. Plan — break into actionable steps
3. Implement — write code (use parallel Agent calls for independent tasks)
4. Verify — run tests, type-check
5. Review — review your own changes for correctness
Update pipeline state with nx_state_write as you progress through stages.
IMPORTANT: Before finishing, call nx_state_clear({ key: "auto" }) to deactivate all state at once. Do NOT stop without clearing state first.`,
    });
    return;
  }

  const match = detectKeywords(cleanPrompt);
  if (match) {
    // consult/init/plan는 대화형 — 상태 파일 불필요, 컨텍스트 주입만
    if (match.primitive === 'init') {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Init mode activated. Follow the init workflow:
1. SCAN: Read project structure (top-level dirs, config files), CLAUDE.md, README.md, docs/, .claude/, and other .md files. Use git log for recent activity.
2. TRIAGE: Classify each doc as Essential (→ knowledge/), Useful (→ knowledge/ condensed), Redundant (Nexus handles better), or Outdated (skip).
3. PROPOSE: Present triage results to user via AskUserQuestion. Ask about CLAUDE.md slimming strategy and which knowledge files to generate.
4. GENERATE: Create .claude/nexus/knowledge/ files (architecture.md, conventions.md, project-context.md). Backup original CLAUDE.md. Slim CLAUDE.md per user choice.
5. VERIFY: Confirm generated files are readable via nx_knowledge_read. Report summary.
IMPORTANT: Always backup before modifying. Never delete without user approval.`,
      });
      return;
    }

    if (match.primitive === 'consult') {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Consult mode activated. Follow the consult workflow:
1. EXPLORE: Read code (nx_lsp_document_symbols, nx_ast_search for brownfield), knowledge (nx_knowledge_read), context (nx_context). Auto-detect brownfield vs greenfield.
2. ASSESS: Evaluate 4 dimensions — [Goal: ?] [Constraints: ?] [Criteria: ?] [Context: ?]. Mark each ✅/⚠️/❌. If ≤1 unclear → lightweight mode. If ≥2 unclear → deep mode.
3. CLARIFY (if unclear dimensions exist; 1-2 questions in lightweight, extended in deep): MUST use AskUserQuestion with concrete options — never ask as plain text. One question at a time targeting the weakest dimension.
4. DIVERGE: Generate 2-4 genuinely different approaches with pros/cons/effort.
5. PROPOSE: Present options via AskUserQuestion with preview for concrete comparisons.
6. CONVERGE: Elaborate chosen approach, follow-up if needed, produce concrete plan.
7. CRYSTALLIZE: Finalize plan. If unclear dimensions remain, disclose risks transparently — but never block the user.
8. EXECUTE BRIDGE: Offer 2-3 options via AskUserQuestion: Auto (recommended) / Pipeline / Plan only.
Key: One question at a time. Specific choices, not vague "what do you think?". Respect user autonomy.`,
      });
      return;
    }

    if (match.primitive === 'plan') {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Plan mode activated. Follow the plan workflow:
1. ANALYZE: Analyze the request. Determine scale — small (1-3 files), medium (module-level), large (architecture/security/migration). Auto-escalate to large if request mentions auth, migration, delete, or security.
2. DRAFT: Spawn Agent({ subagent_type: "nexus:strategist", prompt: "<full request context>" }) to create initial plan.
3. REVIEW (medium+): Spawn Agent({ subagent_type: "nexus:architect", prompt: "Review this plan: <strategist output>" }) for structural review.
4. CRITIQUE (large only): Spawn Agent({ subagent_type: "nexus:reviewer", prompt: "Critique this plan: <architect output>" }). If critical issues, loop back to DRAFT (max 3 iterations).
5. PERSIST: Save plan to .claude/nexus/plans/{branch}.md. Present summary to user.
6. EXECUTE BRIDGE: Offer 2-3 options via AskUserQuestion: Auto (recommended) / Pipeline / Plan only.
Key: This is the standalone Plan skill — not the plan stage within auto. Scale determines formality. Small tasks need only a checklist, not a full ADR.`,
      });
      return;
    }

    const sid = getSessionId();
    activatePrimitive(match.primitive, sid);

    respond({
      continue: true,
      additionalContext: `[NEXUS] ${match.primitive} mode ACTIVATED (session: ${sid}). Do NOT stop until the task is fully complete. IMPORTANT: Before finishing your response, you MUST call nx_state_clear({ key: "${match.primitive}" }) to deactivate. Do NOT attempt to stop without clearing state first.`,
    });
    return;
  }

  // 태스크 자연어 연동: "진행중인 작업", "다음 할 일" 등
  const taskQuery = detectTaskQuery(cleanPrompt);
  if (taskQuery) {
    respond({
      continue: true,
      additionalContext: taskQuery,
    });
    return;
  }

  // 적응형 라우팅: 명시적 키워드 없을 때 요청 분류 → 에이전트/워크플로우 제안
  const routing = detectRouting(cleanPrompt);
  if (routing) {
    respond({
      continue: true,
      additionalContext: routing,
    });
    return;
  }

  pass();
}

function hasConcreteSignals(prompt: string): boolean {
  const signals = [
    /[a-zA-Z\/]+\.[a-z]{1,4}/,           // 파일 경로
    /\b[a-z]+[A-Z][a-zA-Z]*\b/,          // camelCase
    /\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/,     // PascalCase
    /#\d+/,                                // 이슈 번호
    /^\s*\d+[\.\)]/m,                      // 번호 매긴 단계
    /plans?\//,                            // plan 문서 참조
  ];
  return signals.some(s => s.test(prompt));
}

// --- 적응형 라우팅 ---

const AGENT_NAMES = [
  'finder', 'builder', 'guard', 'debugger', 'lead', 'architect',
  'strategist', 'reviewer', 'analyst', 'tester', 'writer',
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
    agent: 'debugger',
    workflow: 'nonstop',
  },
  {
    category: '코드 리뷰',
    patterns: [/리뷰/, /\breview\b/i, /봐\s*줘/, /검토/, /코드\s*확인/],
    agent: 'reviewer',
  },
  {
    category: '테스트',
    patterns: [/테스트/, /\btest\b/i, /커버리지/, /\bcoverage\b/i, /검증\s*코드/],
    agent: 'tester',
    workflow: 'nonstop',
  },
  {
    category: '리팩토링',
    patterns: [/리팩토링/, /\brefactor\b/i, /정리/, /개선/, /클린\s*업/, /\bclean\s*up\b/i],
    agent: 'builder',
    workflow: 'nonstop',
  },
  {
    category: '탐색/검색',
    patterns: [/찾아/, /어디/, /\bsearch\b/i, /\bfind\b/i, /검색/, /위치/],
    agent: 'finder',
  },
  {
    category: '설계/아키텍처',
    patterns: [/설계/, /아키텍처/, /구조/, /\bdesign\b/i, /\barchitect/i],
    agent: 'architect',
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
    workflow: 'nonstop',
  },
  {
    category: '문서',
    patterns: [/문서/, /\bREADME\b/i, /\bdocs?\b/i, /가이드/, /주석/],
    agent: 'writer',
  },
  {
    category: '대규모 구현',
    patterns: [/구현/, /만들어/, /추가/, /\bimplement\b/i, /\bcreate\b/i, /새로운?\s*기능/],
    workflow: 'auto',
  },
];

// --- 라우팅 히스토리 ---

const HISTORY_PATH = join(RUNTIME_ROOT, 'routing-history.json');

interface RoutingHistory {
  // category → { agent → 선택 횟수 }
  overrides: Record<string, Record<string, number>>;
}

function loadHistory(): RoutingHistory {
  if (existsSync(HISTORY_PATH)) {
    try { return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8')); } catch { /* skip */ }
  }
  return { overrides: {} };
}

function saveHistory(history: RoutingHistory): void {
  ensureDir(RUNTIME_ROOT);
  writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
}

/** 히스토리에서 카테고리별 선호 에이전트 조회 */
function getPreferredAgent(history: RoutingHistory, category: string): string | null {
  const counts = history.overrides[category];
  if (!counts) return null;
  let best: string | null = null;
  let bestCount = 0;
  for (const [agent, count] of Object.entries(counts)) {
    if (count > bestCount) { best = agent; bestCount = count; }
  }
  // 최소 2회 이상 선택된 패턴만 적용
  return bestCount >= 2 ? best : null;
}

/** 사용자가 에이전트를 직접 지정했을 때, 해당 카테고리의 히스토리 업데이트 */
function recordOverride(category: string, agent: string): void {
  const history = loadHistory();
  if (!history.overrides[category]) history.overrides[category] = {};
  history.overrides[category][agent] = (history.overrides[category][agent] ?? 0) + 1;
  saveHistory(history);
}

function detectRouting(prompt: string): string | null {
  // 사용자가 에이전트를 직접 언급하면 해당 에이전트만 제안 (override)
  const agentOverride = detectAgentOverride(prompt);
  if (agentOverride) {
    // 카테고리 매칭 시 히스토리에 기록
    for (const rule of ROUTING_RULES) {
      if (rule.patterns.some((p) => p.test(prompt))) {
        recordOverride(rule.category, agentOverride);
        break;
      }
    }
    return `[NEXUS] Agent specified: nexus:${agentOverride}. Delegate via Agent({ subagent_type: "nexus:${agentOverride}", prompt: "<task>" }).`;
  }

  // 카테고리 분류
  const history = loadHistory();
  for (const rule of ROUTING_RULES) {
    if (rule.patterns.some((p) => p.test(prompt))) {
      // 히스토리에서 선호 에이전트 확인
      const preferred = getPreferredAgent(history, rule.category);
      const agent = preferred ?? rule.agent;
      const workflow = rule.workflow;

      if (agent && workflow) {
        const hint = preferred ? ' (history-based)' : '';
        return `[NEXUS] Delegate to nexus:${agent} for ${rule.category}. Use Agent({ subagent_type: "nexus:${agent}", prompt: "<task>" }). Workflow: ${workflow}.${hint ? ` ${hint}` : ''}`;
      } else if (agent) {
        const hint = preferred ? ' (history-based)' : '';
        return `[NEXUS] Delegate to nexus:${agent} for ${rule.category}. Use Agent({ subagent_type: "nexus:${agent}", prompt: "<task>" }).${hint ? ` ${hint}` : ''}`;
      } else if (workflow === 'auto') {
        return `[NEXUS] Large-scale implementation detected. Consider [auto] mode or delegate via Agent({ subagent_type: "nexus:builder", prompt: "<task>" }).`;
      }
    }
  }

  return null;
}

// 에이전트 이름 뒤에 한글 조사가 오거나, "nexus:" 접두사가 있을 때만 override
// "Finder로 찾아줘", "nexus:builder으로 해줘", "Debugger에게 맡겨"
const AGENT_SUFFIXES = /(?:로|으로|에게|한테|가|이|를|을|의|도|만|부터|까지)/;

function detectAgentOverride(prompt: string): string | null {
  for (const name of AGENT_NAMES) {
    // 1. "nexus:agent" 형태 (확정)
    if (new RegExp(`nexus:${name}`, 'i').test(prompt)) return name;
    // 2. 에이전트명 + 한글 조사 (한국어 맥락에서 확정)
    if (new RegExp(`\\b${name}\\b${AGENT_SUFFIXES.source}`, 'i').test(prompt)) return name;
    // 3. 대문자 시작 에이전트명 (영문 맥락에서 고유명사로 사용)
    if (new RegExp(`\\b${name[0].toUpperCase()}${name.slice(1)}\\b`).test(prompt)) return name;
  }
  return null;
}

// --- 태스크 자연어 연동 ---

const TASK_PATTERNS: Array<{ patterns: RegExp[]; tool: string; description: string }> = [
  {
    patterns: [/진행\s*중.*작업/, /현재\s*작업/, /지금\s*뭐/, /하고\s*있는\s*일/, /\bin.?progress\b/i],
    tool: 'nx_task_list({ status: "in_progress" })',
    description: '진행 중인 태스크 목록',
  },
  {
    patterns: [/다음\s*(할\s*일|계획|작업)/, /\btodo\b/i, /할\s*일\s*목록/, /남은\s*작업/],
    tool: 'nx_task_list({ status: "todo" })',
    description: 'TODO 태스크 목록',
  },
  {
    patterns: [/작업\s*현황/, /태스크\s*요약/, /\btask.*summary\b/i, /전체\s*진행/, /작업\s*상태/],
    tool: 'nx_task_summary()',
    description: '태스크 전체 요약',
  },
  {
    patterns: [/막힌\s*작업/, /블로커/, /\bblocked?\b/i],
    tool: 'nx_task_list({ status: "blocked" })',
    description: '블로킹된 태스크 목록',
  },
];

function detectTaskQuery(prompt: string): string | null {
  for (const { patterns, tool, description } of TASK_PATTERNS) {
    if (patterns.some((p) => p.test(prompt))) {
      return `[NEXUS] ${description}을 확인하려면 ${tool}을 호출하세요.`;
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
