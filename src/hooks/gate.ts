// Gate 훅: Stop (Workflow 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { sessionDir, ensureDir, updateWorkflowPhase } from '../shared/paths.js';
import { getSessionId } from '../shared/session.js';
import { join } from 'path';

// --- Workflow State ---

interface WorkflowState {
  mode: 'consult' | 'plan' | 'idle';
  phase?: string;
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
  const sessDir = sessionDir(sid);

  // Check active workflow mode
  const workflowPath = join(sessDir, 'workflow.json');
  if (existsSync(workflowPath)) {
    try {
      const state = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      if ((state.mode === 'consult' || state.mode === 'plan') && state.phase) {
        respond({
          decision: 'block',
          reason: `[${state.mode.toUpperCase()}: ${state.phase}] Workflow is active. Complete the current phase or clear with nx_state_clear({ key: "${state.mode}" }).`,
        });
        return;
      }
    } catch { /* skip */ }
  }

  // Check active agents
  const agentsPath = join(sessDir, 'agents.json');
  if (existsSync(agentsPath)) {
    try {
      const record = JSON.parse(readFileSync(agentsPath, 'utf-8'));
      if (record.active && record.active.length > 0) {
        respond({
          decision: 'block',
          reason: `[AGENTS: ${record.active.join(', ')}] Agents are still working. Wait for completion.`,
        });
        return;
      }
    } catch { /* skip */ }
  }

  pass();
}

// --- UserPromptSubmit 이벤트 처리: 키워드 감지 ---

interface KeywordMatch {
  primitive: 'consult' | 'init' | 'plan' | 'setup';
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  consult:  { primitive: 'consult',  skill: 'nexus:nx-consult' },
  init:     { primitive: 'init',     skill: 'nexus:nx-init' },
  plan:     { primitive: 'plan',     skill: 'nexus:nx-plan' },
  setup:    { primitive: 'setup',   skill: 'nexus:nx-setup' },
};

const NATURAL_PATTERNS: Array<{ patterns: RegExp[]; match: KeywordMatch }> = [
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: 'consult', skill: 'nexus:nx-consult' },
  },
  {
    patterns: [/계획\s*(세워|짜|수립)/, /\bplan\b/i, /구현\s*계획/, /설계해/, /어떻게\s*구현/, /plan\s*this/i],
    match: { primitive: 'plan', skill: 'nexus:nx-plan' },
  },
  {
    patterns: [/\bsetup\b/i, /nexus\s*설정/, /nexus\s*세팅/, /setup\s*nexus/i],
    match: { primitive: 'setup', skill: 'nexus:nx-setup' },
  },
];

// 프리미티브 이름이 에러/버그 맥락에서 언급되면 활성화가 아닌 "대화" — 오탐 방지
const ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
const PRIMITIVE_NAMES = /\b(plan|setup|init|consult)\b/i;

/** 프리미티브 이름이 에러/버그 맥락과 함께 등장하거나, 단순 질문/인용 맥락인지 판별 */
function isPrimitiveMention(prompt: string): boolean {
  // 에러/버그 맥락
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  // 질문 맥락: "plan이 뭐야", "what is consult" 등
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  // 인용 맥락: `plan`, "consult", 'setup'
  if (/[`"'](?:plan|setup|init|consult)[`"']/i.test(prompt)) return true;
  return false;
}

function detectKeywords(prompt: string): KeywordMatch | null {
  // 1차: 명시적 태그 [consult], [plan] 등 — 항상 확정
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

  // Phase 자동 전환: waiting → delegating (사용자가 응답함)
  const sid = getSessionId();
  const workflowPath = join(sessionDir(sid), 'workflow.json');
  if (existsSync(workflowPath)) {
    try {
      const state = JSON.parse(readFileSync(workflowPath, 'utf-8'));
      if (state.phase === 'waiting') {
        updateWorkflowPhase(sid, 'delegating');
      }
    } catch { /* skip */ }
  }

  // [d] 결정 태그 감지 — plan 디렉토리 존재 시 결정 기록 지시
  const dTag = prompt.match(/\[d\]/i);
  if (dTag) {
    let branch = 'unknown';
    try { branch = require('child_process').execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim(); } catch {}
    const branchDir = branch.replace(/\//g, '--');
    respond({
      continue: true,
      additionalContext: `[NEXUS] Decision tag detected. Record this decision in the plan.md file under the current session's plans directory (.nexus/state/sessions/{sessionId}/plans/${branchDir}/plan.md).`,
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
      activateMode('consult', sid, { phase: 'exploring' });
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
8. EXECUTE BRIDGE: Offer options via AskUserQuestion: Execute (Recommended) / Plan only / Skip.
   When the user chooses "Execute" or "Plan only", MUST invoke the nx-plan skill: use Skill({ skill: "claude-nexus:nx-plan" }). Pass the converged approach summary as args. The plan skill handles both planning and execution handoff.
   "Skip" ends the consult without further action.
Key: One question at a time. Specific choices, not vague "what do you think?". Respect user autonomy.
If a plan directory exists for the current branch, record decisions from user selections in the plan.md file.`,
      });
      return;
    }

    if (match.primitive === 'plan') {
      // main/master 브랜치에서는 feature 브랜치 생성 먼저 유도
      let currentBranch = 'unknown';
      try { currentBranch = require('child_process').execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim(); } catch {}
      const onMain = currentBranch === 'main' || currentBranch === 'master';

      const sid = getSessionId();
      activateMode('plan', sid, { phase: onMain ? 'branch-setup' : 'analyzing' });

      const branchInstruction = onMain
        ? `\nIMPORTANT: You are on the ${currentBranch} branch. Planning on main is NOT allowed.
Auto-create a feature branch BEFORE planning:
1. Analyze the user's request to generate a descriptive branch name (e.g., feat/phase-auto-tracking, fix/statusline-bug).
2. Check existing branches with: git branch --list '<candidate>'. If it exists, append a suffix (-2, -3, etc.).
3. Run: git checkout -b <branch-name>
4. Create plan directory: mkdir -p .nexus/state/sessions/{sessionId}/plans/<branch-dir>/ (replace / with -- in branch name).
5. Then proceed with the plan workflow. Do NOT ask the user to choose a branch name — decide it yourself.`
        : '';

      respond({
        continue: true,
        additionalContext: `[NEXUS] Plan mode activated. Follow the plan workflow:${branchInstruction}
1. ANALYZE: Analyze the request. Determine scale — small (1-3 files), medium (module-level), large (architecture/security/migration). Auto-escalate to large if request mentions auth, migration, delete, or security.
2. DRAFT: Spawn Agent({ subagent_type: "nexus:strategist", prompt: "<full request context>" }) to create initial plan.
3. REVIEW (medium+): Spawn Agent({ subagent_type: "nexus:architect", prompt: "Review this plan: <strategist output>" }) for structural review.
4. CRITIQUE (large only): Spawn Agent({ subagent_type: "nexus:reviewer", prompt: "Critique this plan: <architect output>" }). If critical issues, loop back to DRAFT (max 3 iterations).
5. PERSIST: Save plan to .nexus/state/sessions/{sessionId}/plans/{branch}/plan.md. Generate tasks.json in the same directory with task list including dependencies.
6. EXECUTE BRIDGE: Offer 2-3 options via AskUserQuestion: Execute with delegation (Recommended) / Plan only / Skip.
Key: This is the standalone Plan skill — not the plan stage within auto. Scale determines formality. Small tasks need only a checklist, not a full ADR.
`,
      });
      return;
    }

    if (match.primitive === 'setup') {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Setup wizard activated. Guide the user through these steps IN ORDER using AskUserQuestion for each:
1. SCOPE: Ask configuration scope — User (all projects, ~/.claude/CLAUDE.md) or Project (this project only, CLAUDE.md). This determines write paths for all subsequent steps.
2. STATUSLINE: Ask preset choice (Full recommended / Standard / Minimal / Skip).
3. DELEGATION: Ask enforcement level (Warn recommended / Strict / Off / Skip).
4. CLAUDE.MD: Generate Nexus delegation section in CLAUDE.md using <!-- NEXUS:START --> / <!-- NEXUS:END --> markers. Content in English: delegation rules, agent routing table, 6-Section format guide, skill list. Preserve existing content outside markers.
5. OMC CHECK: Check if oh-my-claudecode (omc) plugin is active. If found, warn about conflicts and offer: Disable omc (recommended) / Keep both / Skip. If Disable chosen, set {"enabledPlugins":{"omc":false}} in .claude/settings.json.
6. INIT: Ask whether to run knowledge init (Yes recommended / Skip).
7. COMPLETE: Show summary of applied settings.
Key: Use AskUserQuestion for every step. Always offer Skip option.`,
      });
      return;
    }
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
