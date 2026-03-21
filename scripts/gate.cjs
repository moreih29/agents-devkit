"use strict";

// src/shared/hook-io.ts
function readStdin() {
  return new Promise((resolve2) => {
    let data = "";
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => resolve2(data));
  });
}
function respond(obj) {
  process.stdout.write(JSON.stringify(obj));
}
function pass() {
  respond({ continue: true });
}

// src/hooks/gate.ts
var import_fs3 = require("fs");

// src/shared/paths.ts
var import_path = require("path");
var import_fs = require("fs");
function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== "/") {
    if ((0, import_fs.existsSync)((0, import_path.join)(dir, ".git"))) return dir;
    dir = (0, import_path.resolve)(dir, "..");
  }
  return process.cwd();
}
var PROJECT_ROOT = findProjectRoot();
var RUNTIME_ROOT = (0, import_path.join)(PROJECT_ROOT, ".nexus");
var KNOWLEDGE_ROOT = (0, import_path.join)(PROJECT_ROOT, ".claude", "nexus");
function sessionDir(sessionId) {
  return (0, import_path.join)(RUNTIME_ROOT, "state", "sessions", sessionId);
}
function ensureDir(dir) {
  if (!(0, import_fs.existsSync)(dir)) {
    (0, import_fs.mkdirSync)(dir, { recursive: true });
  }
}

// src/shared/session.ts
var import_crypto = require("crypto");
var import_fs2 = require("fs");
var import_path2 = require("path");
var SESSION_FILE = (0, import_path2.join)(RUNTIME_ROOT, "state", "current-session.json");
function getSessionId() {
  if ((0, import_fs2.existsSync)(SESSION_FILE)) {
    try {
      const data = JSON.parse((0, import_fs2.readFileSync)(SESSION_FILE, "utf-8"));
      if (data.sessionId && typeof data.sessionId === "string") {
        return data.sessionId;
      }
    } catch {
    }
  }
  return createSession();
}
function createSession() {
  const sessionId = (0, import_crypto.randomUUID)().slice(0, 8);
  ensureDir((0, import_path2.join)(RUNTIME_ROOT, "state"));
  (0, import_fs2.writeFileSync)(SESSION_FILE, JSON.stringify({ sessionId, createdAt: (/* @__PURE__ */ new Date()).toISOString() }));
  return sessionId;
}

// src/hooks/gate.ts
var import_path3 = require("path");
function activateMode(mode, sid, extra) {
  const dir = sessionDir(sid);
  ensureDir(dir);
  const state = {
    mode,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...extra
  };
  (0, import_fs3.writeFileSync)((0, import_path3.join)(dir, "workflow.json"), JSON.stringify(state, null, 2));
}
function handleStop() {
  const sid = getSessionId();
  const workflowPath = (0, import_path3.join)(sessionDir(sid), "workflow.json");
  if (!(0, import_fs3.existsSync)(workflowPath)) {
    pass();
    return;
  }
  try {
    const state = JSON.parse((0, import_fs3.readFileSync)(workflowPath, "utf-8"));
    if (state.mode === "auto" && state.nonstop?.active) {
      state.nonstop.iteration++;
      if (state.nonstop.iteration < state.nonstop.max) {
        (0, import_fs3.writeFileSync)(workflowPath, JSON.stringify(state, null, 2));
        respond({
          decision: "block",
          reason: `[NONSTOP ${state.nonstop.iteration}/${state.nonstop.max}] \uC791\uC5C5\uC774 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uACC4\uC18D \uC9C4\uD589\uD558\uC138\uC694. \uC791\uC5C5\uC774 \uC815\uB9D0 \uB05D\uB0AC\uB2E4\uBA74 nx_state_clear({ key: "auto" })\uB97C \uD638\uCD9C\uD558\uC5EC \uD574\uC81C\uD558\uC138\uC694.`
        });
        return;
      }
      state.nonstop.active = false;
      (0, import_fs3.writeFileSync)(workflowPath, JSON.stringify(state, null, 2));
    }
    if (state.mode === "auto" && state.phase) {
      respond({
        decision: "block",
        reason: `[AUTO stage: ${state.phase}] Auto \uD30C\uC774\uD504\uB77C\uC778\uC774 \uC2E4\uD589 \uC911\uC785\uB2C8\uB2E4. \uD604\uC7AC \uB2E8\uACC4\uB97C \uC644\uB8CC\uD558\uACE0 \uB2E4\uC74C\uC73C\uB85C \uC9C4\uD589\uD558\uC138\uC694.`
      });
      return;
    }
    if (state.mode === "parallel" && state.parallel) {
      const { completedCount = 0, totalCount = 0 } = state.parallel;
      if (totalCount > 0 && completedCount < totalCount) {
        respond({
          decision: "block",
          reason: `[PARALLEL ${completedCount}/${totalCount}] \uBCD1\uB82C \uD0DC\uC2A4\uD06C\uAC00 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4.`
        });
        return;
      }
    }
  } catch {
  }
  pass();
}
var EXPLICIT_TAGS = {
  parallel: { primitive: "parallel", skill: "nexus:parallel" },
  consult: { primitive: "consult", skill: "nexus:consult" },
  init: { primitive: "init", skill: "nexus:init" },
  plan: { primitive: "plan", skill: "nexus:plan" },
  setup: { primitive: "setup", skill: "nexus:setup" }
};
var AUTO_PATTERNS = [/\bauto\b/i, /\bcruise\b/i, /자동으로\s*전부/, /end\s*to\s*end/i];
var NATURAL_PATTERNS = [
  {
    patterns: [/\bparallel\b/i, /\bconcurrent\b/i, /동시에/, /병렬로/],
    match: { primitive: "parallel", skill: "nexus:parallel" }
  },
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: "consult", skill: "nexus:consult" }
  },
  {
    patterns: [/계획\s*(세워|짜|수립)/, /\bplan\b/i, /구현\s*계획/, /설계해/, /어떻게\s*구현/, /plan\s*this/i],
    match: { primitive: "plan", skill: "nexus:plan" }
  },
  {
    patterns: [/\bsetup\b/i, /nexus\s*설정/, /nexus\s*세팅/, /setup\s*nexus/i],
    match: { primitive: "setup", skill: "nexus:setup" }
  }
];
var ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
var PRIMITIVE_NAMES = /\b(parallel|auto|plan|setup|init|consult)\b/i;
function isPrimitiveMention(prompt) {
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  if (/[`"'](?:parallel|auto|plan|setup|init|consult)[`"']/i.test(prompt)) return true;
  return false;
}
function detectAuto(prompt) {
  const tagMatch = prompt.match(/\[(\w+)\]/);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    if (tag === "auto" || tag === "nonstop" || tag === "pipeline") return true;
  }
  if (isPrimitiveMention(prompt)) return false;
  return AUTO_PATTERNS.some((p) => p.test(prompt));
}
function detectKeywords(prompt) {
  const tagMatch = prompt.match(/\[(\w+)\]/);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    if (tag in EXPLICIT_TAGS) return EXPLICIT_TAGS[tag];
  }
  for (const { patterns, match } of NATURAL_PATTERNS) {
    if (patterns.some((p) => p.test(prompt))) {
      if (isPrimitiveMention(prompt)) continue;
      return match;
    }
  }
  return null;
}
function handleUserPromptSubmit(event) {
  const prompt = event.prompt ?? event.user_prompt ?? "";
  if (!prompt) {
    pass();
    return;
  }
  if (detectAuto(prompt)) {
    if (!hasConcreteSignals(prompt)) {
      respond({
        continue: true,
        additionalContext: `[NEXUS] The request lacks concrete signals (file paths, identifiers, issue numbers, or structured steps). Redirecting to Plan mode first. You MUST invoke: Skill({ skill: "nexus:plan" }) to create a detailed plan before execution.`
      });
      return;
    }
    const sid = getSessionId();
    activateMode("auto", sid, {
      phase: "analyze",
      nonstop: { active: true, iteration: 0, max: 100 }
    });
    respond({
      continue: true,
      additionalContext: `[NEXUS] auto mode ACTIVATED (session: ${sid}). Auto mode enabled.
Execute these stages IN ORDER:
1. Analyze \u2014 understand the codebase and request
2. Plan \u2014 break into actionable steps. Read task list from .claude/nexus/plans/{branch}/tasks.json if it exists. Update task status as you progress. Track progress by updating plans/{branch}/tasks.json as you complete each unit.
3. Implement \u2014 use parallel Agent calls for independent tasks.
4. Verify \u2014 run tests, type-check. IF VERIFY FAILS: go back to step 2 (replan) with failure context. Max 3 replan cycles.
5. Review \u2014 review your own changes for correctness
6. Sync \u2014 run /nexus:sync to detect and auto-fix knowledge doc inconsistencies (skip if none)
Update workflow state with nx_state_write({ key: "workflow", value: { mode: "auto", phase: "<stage>", nonstop: {...} } }) as you progress through stages.
REPLAN LOOP: If verify (step 4) fails, do NOT proceed to review. Instead: analyze failure \u2192 replan (step 2) \u2192 re-implement (step 3) \u2192 re-verify (step 4). Track replan count. After 3 failed cycles, stop and report failures to user.
IMPORTANT: Before finishing, call nx_state_clear({ key: "auto" }) to deactivate all state at once. Do NOT stop without clearing state first.`
    });
    return;
  }
  const match = detectKeywords(prompt);
  if (match) {
    if (match.primitive === "init") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Init mode activated. Follow the init workflow:
1. SCAN: Read project structure (top-level dirs, config files), CLAUDE.md, README.md, docs/, .claude/, and other .md files. Use git log for recent activity.
2. TRIAGE: Classify each doc as Essential (\u2192 knowledge/), Useful (\u2192 knowledge/ condensed), Redundant (Nexus handles better), or Outdated (skip).
3. PROPOSE: Present triage results to user via AskUserQuestion. Ask about CLAUDE.md slimming strategy and which knowledge files to generate.
4. GENERATE: Create .claude/nexus/knowledge/ files (architecture.md, conventions.md, project-context.md). Backup original CLAUDE.md. Slim CLAUDE.md per user choice.
5. VERIFY: Confirm generated files are readable via nx_knowledge_read. Report summary.
IMPORTANT: Always backup before modifying. Never delete without user approval.`
      });
      return;
    }
    if (match.primitive === "consult") {
      const sid2 = getSessionId();
      activateMode("consult", sid2, { phase: "explore" });
      respond({
        continue: true,
        additionalContext: `[NEXUS] Consult mode activated. Follow the consult workflow:
1. EXPLORE: Read code (nx_lsp_document_symbols, nx_ast_search for brownfield), knowledge (nx_knowledge_read), context (nx_context). Auto-detect brownfield vs greenfield.
2. ASSESS: Evaluate 4 dimensions \u2014 [Goal: ?] [Constraints: ?] [Criteria: ?] [Context: ?]. Mark each \u2705/\u26A0\uFE0F/\u274C. If \u22641 unclear \u2192 lightweight mode. If \u22652 unclear \u2192 deep mode.
3. CLARIFY (if unclear dimensions exist; 1-2 questions in lightweight, extended in deep): MUST use AskUserQuestion with concrete options \u2014 never ask as plain text. One question at a time targeting the weakest dimension.
4. DIVERGE: Generate 2-4 genuinely different approaches with pros/cons/effort.
5. PROPOSE: Present options via AskUserQuestion with preview for concrete comparisons.
6. CONVERGE: Elaborate chosen approach, follow-up if needed, produce concrete plan.
7. CRYSTALLIZE: Finalize plan. If unclear dimensions remain, disclose risks transparently \u2014 but never block the user.
8. EXECUTE BRIDGE: Offer 2-3 options via AskUserQuestion: Auto (recommended) / Pipeline / Plan only.
Key: One question at a time. Specific choices, not vague "what do you think?". Respect user autonomy.
PHASE TRACKING: Update phase as you progress: nx_state_write({ key: "workflow", value: { mode: "consult", phase: "<current_phase>" } }). Clear when done: nx_state_clear({ key: "consult" }).
If a plan directory exists for the current branch, record decisions from user selections in the plan.md file.`
      });
      return;
    }
    if (match.primitive === "plan") {
      const sid2 = getSessionId();
      activateMode("plan", sid2, { phase: "analyze" });
      respond({
        continue: true,
        additionalContext: `[NEXUS] Plan mode activated. Follow the plan workflow:
1. ANALYZE: Analyze the request. Determine scale \u2014 small (1-3 files), medium (module-level), large (architecture/security/migration). Auto-escalate to large if request mentions auth, migration, delete, or security.
2. DRAFT: Spawn Agent({ subagent_type: "nexus:strategist", prompt: "<full request context>" }) to create initial plan.
3. REVIEW (medium+): Spawn Agent({ subagent_type: "nexus:architect", prompt: "Review this plan: <strategist output>" }) for structural review.
4. CRITIQUE (large only): Spawn Agent({ subagent_type: "nexus:reviewer", prompt: "Critique this plan: <architect output>" }). If critical issues, loop back to DRAFT (max 3 iterations).
5. PERSIST: Save plan to .claude/nexus/plans/{branch}/plan.md. Generate .claude/nexus/plans/{branch}/tasks.json with task list including dependencies.
6. EXECUTE BRIDGE: Offer 2-3 options via AskUserQuestion: Auto (recommended) / Pipeline / Plan only.
Key: This is the standalone Plan skill \u2014 not the plan stage within auto. Scale determines formality. Small tasks need only a checklist, not a full ADR.
PHASE TRACKING: Update phase as you progress: nx_state_write({ key: "workflow", value: { mode: "plan", phase: "<current_phase>" } }). Clear when done: nx_state_clear({ key: "plan" }).`
      });
      return;
    }
    if (match.primitive === "setup") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Setup wizard activated. Guide the user through these steps IN ORDER using AskUserQuestion for each:
1. STATUSLINE: Ask preset choice (Full recommended / Standard / Minimal / Skip). If chosen, write {"preset":"<choice>"} to .nexus/statusline-preset.json.
2. DELEGATION: Ask enforcement level (Warn recommended / Strict / Off / Skip). If chosen, write {"delegationEnforcement":"<choice>"} to .nexus/config.json.
3. AUTO MODE: Ask whether to enable Auto Mode (Off recommended / On / Skip). If On, add {"autoMode":true} to .nexus/config.json. If Off, add {"autoMode":false}.
4. INIT: Ask whether to run knowledge init (Yes recommended / Skip). If Yes, run the init workflow (SCAN\u2192TRIAGE\u2192PROPOSE\u2192GENERATE\u2192VERIFY).
5. COMPLETE: Show summary of applied settings and brief intro to available skills/agents.
Key: Use AskUserQuestion for every step. Keep it lightweight. Always offer Skip option.`
      });
      return;
    }
    const sid = getSessionId();
    if (match.primitive === "parallel") {
      activateMode("parallel", sid);
      respond({
        continue: true,
        additionalContext: `[NEXUS] parallel mode ACTIVATED (session: ${sid}). IMPORTANT: You MUST immediately update the parallel state with a task list:
nx_state_write({ key: "workflow", value: { mode: "parallel", parallel: { tasks: [{ id: "t1", description: "...", agent: "builder", status: "running" }, ...], completedCount: 0, totalCount: N } } })
Then spawn Agent() calls for each task simultaneously (multiple Agent calls in one message).
Before finishing, call nx_state_clear({ key: "parallel" }) to deactivate.`
      });
      return;
    }
    respond({
      continue: true,
      additionalContext: `[NEXUS] ${match.primitive} mode ACTIVATED (session: ${sid}). Do NOT stop until the task is fully complete. IMPORTANT: Before finishing your response, you MUST call nx_state_clear({ key: "${match.primitive}" }) to deactivate. Do NOT attempt to stop without clearing state first.`
    });
    return;
  }
  if (isAutoModeEnabled()) {
    const sid = getSessionId();
    activateMode("auto", sid, {
      phase: "analyze",
      nonstop: { active: true, iteration: 0, max: 100 }
    });
    respond({
      continue: true,
      additionalContext: `[NEXUS] auto mode ACTIVATED (Auto Mode: on). Auto mode enabled.
Execute these stages IN ORDER:
1. Analyze \u2014 understand the codebase and request
2. Plan \u2014 break into actionable steps. Read task list from .claude/nexus/plans/{branch}/tasks.json if it exists. Update task status as you progress. Track progress by updating plans/{branch}/tasks.json as you complete each unit.
3. Implement \u2014 use parallel Agent calls for independent tasks.
4. Verify \u2014 run tests, type-check. IF VERIFY FAILS: go back to step 2 (replan) with failure context. Max 3 replan cycles.
5. Review \u2014 review your own changes for correctness
6. Sync \u2014 run /nexus:sync to detect and auto-fix knowledge doc inconsistencies (skip if none)
Update workflow state with nx_state_write({ key: "workflow", value: { mode: "auto", phase: "<stage>", nonstop: {...} } }) as you progress through stages.
REPLAN LOOP: If verify (step 4) fails, do NOT proceed to review. Instead: analyze failure \u2192 replan (step 2) \u2192 re-implement (step 3) \u2192 re-verify (step 4). Track replan count. After 3 failed cycles, stop and report failures to user.
IMPORTANT: Before finishing, call nx_state_clear({ key: "auto" }) to deactivate all state at once.`
    });
    return;
  }
  pass();
}
function isAutoModeEnabled() {
  const configPath = (0, import_path3.join)(RUNTIME_ROOT, "config.json");
  if ((0, import_fs3.existsSync)(configPath)) {
    try {
      const config = JSON.parse((0, import_fs3.readFileSync)(configPath, "utf-8"));
      return config.autoMode === true;
    } catch {
    }
  }
  return false;
}
function hasConcreteSignals(prompt) {
  const signals = [
    /[a-zA-Z\/]+\.[a-z]{1,4}/,
    // 파일 경로
    /\b[a-z]+[A-Z][a-zA-Z]*\b/,
    // camelCase
    /\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/,
    // PascalCase
    /#\d+/,
    // 이슈 번호
    /^\s*\d+[\.\)]/m,
    // 번호 매긴 단계
    /plans?\//
    // plan 문서 참조
  ];
  return signals.some((s) => s.test(prompt));
}
async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hasPrompt = "prompt" in event || "user_prompt" in event;
  if (hasPrompt) {
    handleUserPromptSubmit(event);
  } else {
    handleStop();
  }
}
main().catch(() => {
  respond({ continue: true });
});
//# sourceMappingURL=gate.cjs.map
