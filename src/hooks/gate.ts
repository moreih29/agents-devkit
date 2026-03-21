// Gate 훅: Stop (Workflow 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { sessionDir, ensureDir, RUNTIME_ROOT } from '../shared/paths.js';
import { getSessionId } from '../shared/session.js';
import { join } from 'path';

// --- Workflow State ---

interface WorkflowState {
  mode: 'auto' | 'parallel' | 'consult' | 'plan' | 'idle';
  phase?: string;
  nonstop?: { active: boolean; iteration: number; max: number };
  parallel?: { tasks: any[]; completedCount: number; totalCount: number };
  startedAt: string;
}

function activateMode(mode: string, sid: string, extra?: Partial<WorkflowState>): void {
  const dir = sessionDir(sid);
  ensureDir(dir);
  const state: WorkflowState = {
    mode: mode as WorkflowState['mode'],
    startedAt: new Date().toISOString(),
    ...extra,
  };
  writeFileSync(join(dir, 'workflow.json'), JSON.stringify(state, null, 2));
}

// --- Stop 이벤트 처리 ---

function handleStop(): void {
  const sid = getSessionId();
  const workflowPath = join(sessionDir(sid), 'workflow.json');
  if (!existsSync(workflowPath)) { pass(); return; }

  try {
    const state: WorkflowState = JSON.parse(readFileSync(workflowPath, 'utf-8'));

    // Auto mode: nonstop blocking
    if (state.mode === 'auto' && state.nonstop?.active) {
      state.nonstop.iteration++;
      if (state.nonstop.iteration < state.nonstop.max) {
        writeFileSync(workflowPath, JSON.stringify(state, null, 2));
        respond({
          decision: 'block',
          reason: `[NONSTOP ${state.nonstop.iteration}/${state.nonstop.max}] 작업이 완료되지 않았습니다. 계속 진행하세요. 작업이 정말 끝났다면 nx_state_clear({ key: "auto" })를 호출하여 해제하세요.`,
        });
        return;
      }
      // max reached, auto-disable nonstop
      state.nonstop.active = false;
      writeFileSync(workflowPath, JSON.stringify(state, null, 2));
    }

    // Auto mode: pipeline stage blocking (even without nonstop)
    if (state.mode === 'auto' && state.phase) {
      respond({
        decision: 'block',
        reason: `[AUTO stage: ${state.phase}] Auto 파이프라인이 실행 중입니다. 현재 단계를 완료하고 다음으로 진행하세요.`,
      });
      return;
    }

    // Parallel mode blocking
    if (state.mode === 'parallel' && state.parallel) {
      const { completedCount = 0, totalCount = 0 } = state.parallel;
      if (totalCount > 0 && completedCount < totalCount) {
        respond({
          decision: 'block',
          reason: `[PARALLEL ${completedCount}/${totalCount}] 병렬 태스크가 진행 중입니다.`,
        });
        return;
      }
    }
  } catch { /* parse error, allow stop */ }

  pass();
}

// --- UserPromptSubmit 이벤트 처리: 키워드 감지 ---

interface KeywordMatch {
  primitive: 'parallel' | 'consult' | 'init' | 'plan' | 'setup';
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  parallel: { primitive: 'parallel', skill: 'nexus:parallel' },
  consult:  { primitive: 'consult',  skill: 'nexus:consult' },
  init:     { primitive: 'init',     skill: 'nexus:init' },
  plan:     { primitive: 'plan',     skill: 'nexus:plan' },
  setup:    { primitive: 'setup',   skill: 'nexus:setup' },
};

const AUTO_PATTERNS: RegExp[] = [/\bauto\b/i, /\bcruise\b/i, /자동으로\s*전부/, /end\s*to\s*end/i];

const NATURAL_PATTERNS: Array<{ patterns: RegExp[]; match: KeywordMatch }> = [
  {
    patterns: [/\bparallel\b/i, /\bconcurrent\b/i, /동시에/, /병렬로/],
    match: { primitive: 'parallel', skill: 'nexus:parallel' },
  },
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: 'consult', skill: 'nexus:consult' },
  },
  {
    patterns: [/계획\s*(세워|짜|수립)/, /\bplan\b/i, /구현\s*계획/, /설계해/, /어떻게\s*구현/, /plan\s*this/i],
    match: { primitive: 'plan', skill: 'nexus:plan' },
  },
  {
    patterns: [/\bsetup\b/i, /nexus\s*설정/, /nexus\s*세팅/, /setup\s*nexus/i],
    match: { primitive: 'setup', skill: 'nexus:setup' },
  },
];

// 프리미티브 이름이 에러/버그 맥락에서 언급되면 활성화가 아닌 "대화" — 오탐 방지
const ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
const PRIMITIVE_NAMES = /\b(parallel|auto|plan|setup|init|consult)\b/i;

/** 프리미티브 이름이 에러/버그 맥락과 함께 등장하거나, 단순 질문/인용 맥락인지 판별 */
function isPrimitiveMention(prompt: string): boolean {
  // 에러/버그 맥락
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  // 질문 맥락: "auto가 뭐야", "what is parallel" 등
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  // 인용 맥락: `parallel`, "auto", 'plan'
  if (/[`"'](?:parallel|auto|plan|setup|init|consult)[`"']/i.test(prompt)) return true;
  return false;
}

function detectAuto(prompt: string): boolean {
  // 명시적 태그 — 항상 확정
  const tagMatch = prompt.match(/\[(\w+)\]/);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    if (tag === 'auto' || tag === 'nonstop' || tag === 'pipeline') return true;
  }
  // 프리미티브 이름 + 에러 맥락 → 단순 언급이므로 스킵
  if (isPrimitiveMention(prompt)) return false;
  return AUTO_PATTERNS.some((p) => p.test(prompt));
}

function detectKeywords(prompt: string): KeywordMatch | null {
  // 1차: 명시적 태그 [parallel], [consult] 등 — 항상 확정
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

function handleUserPromptSubmit(event: Record<string, unknown>): void {
  const prompt = (event.prompt ?? event.user_prompt ?? '') as string;
  if (!prompt) { pass(); return; }

  // auto: nonstop + pipeline 동시 활성화
  if (detectAuto(prompt)) {
    if (!hasConcreteSignals(prompt)) {
      respond({
        continue: true,
        additionalContext: `[NEXUS] The request lacks concrete signals (file paths, identifiers, issue numbers, or structured steps). Redirecting to Plan mode first. You MUST invoke: Skill({ skill: "nexus:plan" }) to create a detailed plan before execution.`,
      });
      return;
    }

    const sid = getSessionId();
    activateMode('auto', sid, {
      phase: 'analyze',
      nonstop: { active: true, iteration: 0, max: 100 },
    });

    respond({
      continue: true,
      additionalContext: `[NEXUS] auto mode ACTIVATED (session: ${sid}). Auto mode enabled.
Execute these stages IN ORDER:
1. Analyze — understand the codebase and request
2. Plan — break into actionable steps. Read task list from .claude/nexus/plans/{branch}/tasks.json if it exists. Update task status as you progress. Track progress by updating plans/{branch}/tasks.json as you complete each unit.
3. Implement — use parallel Agent calls for independent tasks.
4. Verify — run tests, type-check. IF VERIFY FAILS: go back to step 2 (replan) with failure context. Max 3 replan cycles.
5. Review — review your own changes for correctness
6. Sync — run /nexus:sync to detect and auto-fix knowledge doc inconsistencies (skip if none)
Update workflow state with nx_state_write({ key: "workflow", value: { mode: "auto", phase: "<stage>", nonstop: {...} } }) as you progress through stages.
REPLAN LOOP: If verify (step 4) fails, do NOT proceed to review. Instead: analyze failure → replan (step 2) → re-implement (step 3) → re-verify (step 4). Track replan count. After 3 failed cycles, stop and report failures to user.
IMPORTANT: Before finishing, call nx_state_clear({ key: "auto" }) to deactivate all state at once. Do NOT stop without clearing state first.`,
    });
    return;
  }

  const match = detectKeywords(prompt);
  if (match) {
    // init는 대화형 — 상태 파일 불필요, 컨텍스트 주입만
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
      const sid = getSessionId();
      activateMode('consult', sid, { phase: 'explore' });
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
Key: One question at a time. Specific choices, not vague "what do you think?". Respect user autonomy.
PHASE TRACKING: Update phase as you progress: nx_state_write({ key: "workflow", value: { mode: "consult", phase: "<current_phase>" } }). Clear when done: nx_state_clear({ key: "consult" }).
If a plan directory exists for the current branch, record decisions from user selections in the plan.md file.`,
      });
      return;
    }

    if (match.primitive === 'plan') {
      const sid = getSessionId();
      activateMode('plan', sid, { phase: 'analyze' });
      respond({
        continue: true,
        additionalContext: `[NEXUS] Plan mode activated. Follow the plan workflow:
1. ANALYZE: Analyze the request. Determine scale — small (1-3 files), medium (module-level), large (architecture/security/migration). Auto-escalate to large if request mentions auth, migration, delete, or security.
2. DRAFT: Spawn Agent({ subagent_type: "nexus:strategist", prompt: "<full request context>" }) to create initial plan.
3. REVIEW (medium+): Spawn Agent({ subagent_type: "nexus:architect", prompt: "Review this plan: <strategist output>" }) for structural review.
4. CRITIQUE (large only): Spawn Agent({ subagent_type: "nexus:reviewer", prompt: "Critique this plan: <architect output>" }). If critical issues, loop back to DRAFT (max 3 iterations).
5. PERSIST: Save plan to .claude/nexus/plans/{branch}/plan.md. Generate .claude/nexus/plans/{branch}/tasks.json with task list including dependencies.
6. EXECUTE BRIDGE: Offer 2-3 options via AskUserQuestion: Auto (recommended) / Pipeline / Plan only.
Key: This is the standalone Plan skill — not the plan stage within auto. Scale determines formality. Small tasks need only a checklist, not a full ADR.
PHASE TRACKING: Update phase as you progress: nx_state_write({ key: "workflow", value: { mode: "plan", phase: "<current_phase>" } }). Clear when done: nx_state_clear({ key: "plan" }).`,
      });
      return;
    }

    if (match.primitive === 'setup') {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Setup wizard activated. Guide the user through these steps IN ORDER using AskUserQuestion for each:
1. STATUSLINE: Ask preset choice (Full recommended / Standard / Minimal / Skip). If chosen, write {"preset":"<choice>"} to .nexus/statusline-preset.json.
2. DELEGATION: Ask enforcement level (Warn recommended / Strict / Off / Skip). If chosen, write {"delegationEnforcement":"<choice>"} to .nexus/config.json.
3. AUTO MODE: Ask whether to enable Auto Mode (Off recommended / On / Skip). If On, add {"autoMode":true} to .nexus/config.json. If Off, add {"autoMode":false}.
4. INIT: Ask whether to run knowledge init (Yes recommended / Skip). If Yes, run the init workflow (SCAN→TRIAGE→PROPOSE→GENERATE→VERIFY).
5. COMPLETE: Show summary of applied settings and brief intro to available skills/agents.
Key: Use AskUserQuestion for every step. Keep it lightweight. Always offer Skip option.`,
      });
      return;
    }

    const sid = getSessionId();

    if (match.primitive === 'parallel') {
      activateMode('parallel', sid);
      respond({
        continue: true,
        additionalContext: `[NEXUS] parallel mode ACTIVATED (session: ${sid}). IMPORTANT: You MUST immediately update the parallel state with a task list:
nx_state_write({ key: "workflow", value: { mode: "parallel", parallel: { tasks: [{ id: "t1", description: "...", agent: "builder", status: "running" }, ...], completedCount: 0, totalCount: N } } })
Then spawn Agent() calls for each task simultaneously (multiple Agent calls in one message).
Before finishing, call nx_state_clear({ key: "parallel" }) to deactivate.`,
      });
      return;
    }

    respond({
      continue: true,
      additionalContext: `[NEXUS] ${match.primitive} mode ACTIVATED (session: ${sid}). Do NOT stop until the task is fully complete. IMPORTANT: Before finishing your response, you MUST call nx_state_clear({ key: "${match.primitive}" }) to deactivate. Do NOT attempt to stop without clearing state first.`,
    });
    return;
  }

  // Auto Mode: 키워드 매칭 없을 때 자동으로 auto 활성화
  if (isAutoModeEnabled()) {
    const sid = getSessionId();
    activateMode('auto', sid, {
      phase: 'analyze',
      nonstop: { active: true, iteration: 0, max: 100 },
    });
    respond({
      continue: true,
      additionalContext: `[NEXUS] auto mode ACTIVATED (Auto Mode: on). Auto mode enabled.
Execute these stages IN ORDER:
1. Analyze — understand the codebase and request
2. Plan — break into actionable steps. Read task list from .claude/nexus/plans/{branch}/tasks.json if it exists. Update task status as you progress. Track progress by updating plans/{branch}/tasks.json as you complete each unit.
3. Implement — use parallel Agent calls for independent tasks.
4. Verify — run tests, type-check. IF VERIFY FAILS: go back to step 2 (replan) with failure context. Max 3 replan cycles.
5. Review — review your own changes for correctness
6. Sync — run /nexus:sync to detect and auto-fix knowledge doc inconsistencies (skip if none)
Update workflow state with nx_state_write({ key: "workflow", value: { mode: "auto", phase: "<stage>", nonstop: {...} } }) as you progress through stages.
REPLAN LOOP: If verify (step 4) fails, do NOT proceed to review. Instead: analyze failure → replan (step 2) → re-implement (step 3) → re-verify (step 4). Track replan count. After 3 failed cycles, stop and report failures to user.
IMPORTANT: Before finishing, call nx_state_clear({ key: "auto" }) to deactivate all state at once.`,
    });
    return;
  }
  pass();
}

function isAutoModeEnabled(): boolean {
  const configPath = join(RUNTIME_ROOT, 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      return config.autoMode === true;
    } catch { /* skip */ }
  }
  return false;
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
