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
function updateWorkflowPhase(sid, phase) {
  const workflowPath = (0, import_path.join)(sessionDir(sid), "workflow.json");
  if (!(0, import_fs.existsSync)(workflowPath)) return;
  try {
    const state = JSON.parse((0, import_fs.readFileSync)(workflowPath, "utf-8"));
    if ((state.mode === "consult" || state.mode === "plan") && state.phase !== phase) {
      state.phase = phase;
      (0, import_fs.writeFileSync)(workflowPath, JSON.stringify(state, null, 2));
    }
  } catch {
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
  const sessDir = sessionDir(sid);
  const workflowPath = (0, import_path3.join)(sessDir, "workflow.json");
  if ((0, import_fs3.existsSync)(workflowPath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(workflowPath, "utf-8"));
      if ((state.mode === "consult" || state.mode === "plan") && state.phase) {
        respond({
          decision: "block",
          reason: `[${state.mode.toUpperCase()}: ${state.phase}] Workflow is active. Complete the current phase or clear with nx_state_clear({ key: "${state.mode}" }).`
        });
        return;
      }
    } catch {
    }
  }
  const agentsPath = (0, import_path3.join)(sessDir, "agents.json");
  if ((0, import_fs3.existsSync)(agentsPath)) {
    try {
      const record = JSON.parse((0, import_fs3.readFileSync)(agentsPath, "utf-8"));
      if (record.active && record.active.length > 0) {
        respond({
          decision: "block",
          reason: `[AGENTS: ${record.active.join(", ")}] Agents are still working. Wait for completion.`
        });
        return;
      }
    } catch {
    }
  }
  pass();
}
var EXPLICIT_TAGS = {
  consult: { primitive: "consult", skill: "nexus:consult" },
  init: { primitive: "init", skill: "nexus:init" },
  plan: { primitive: "plan", skill: "nexus:plan" },
  setup: { primitive: "setup", skill: "nexus:setup" }
};
var NATURAL_PATTERNS = [
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
var PRIMITIVE_NAMES = /\b(plan|setup|init|consult)\b/i;
function isPrimitiveMention(prompt) {
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  if (/[`"'](?:plan|setup|init|consult)[`"']/i.test(prompt)) return true;
  return false;
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
  const sid = getSessionId();
  const workflowPath = (0, import_path3.join)(sessionDir(sid), "workflow.json");
  if ((0, import_fs3.existsSync)(workflowPath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(workflowPath, "utf-8"));
      if (state.phase === "waiting") {
        updateWorkflowPhase(sid, "delegating");
      }
    } catch {
    }
  }
  const dTag = prompt.match(/\[d\]/i);
  if (dTag) {
    let branch = "unknown";
    try {
      branch = require("child_process").execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    } catch {
    }
    const branchDir = branch.replace(/\//g, "--");
    respond({
      continue: true,
      additionalContext: `[NEXUS] Decision tag detected. Record this decision in .nexus/plans/${branchDir}/plan.md under the decisions section.`
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
      activateMode("consult", sid2, { phase: "exploring" });
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
8. EXECUTE BRIDGE: Offer options via AskUserQuestion: Execute (Recommended) / Plan only / Skip.
   When the user chooses "Execute" or "Plan only", MUST invoke the plan skill: use Skill({ skill: "claude-nexus:plan" }). Pass the converged approach summary as args. The plan skill handles both planning and execution handoff.
   "Skip" ends the consult without further action.
Key: One question at a time. Specific choices, not vague "what do you think?". Respect user autonomy.
If a plan directory exists for the current branch, record decisions from user selections in the plan.md file.`
      });
      return;
    }
    if (match.primitive === "plan") {
      let currentBranch = "unknown";
      try {
        currentBranch = require("child_process").execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
      } catch {
      }
      const onMain = currentBranch === "main" || currentBranch === "master";
      const sid2 = getSessionId();
      activateMode("plan", sid2, { phase: onMain ? "branch-setup" : "analyzing" });
      const branchInstruction = onMain ? `
IMPORTANT: You are on the ${currentBranch} branch. Planning on main is NOT allowed.
Auto-create a feature branch BEFORE planning:
1. Analyze the user's request to generate a descriptive branch name (e.g., feat/phase-auto-tracking, fix/statusline-bug).
2. Check existing branches with: git branch --list '<candidate>'. If it exists, append a suffix (-2, -3, etc.).
3. Run: git checkout -b <branch-name>
4. Create plan directory: mkdir -p .nexus/plans/<branch-dir>/ (replace / with -- in branch name).
5. Then proceed with the plan workflow. Do NOT ask the user to choose a branch name \u2014 decide it yourself.` : "";
      respond({
        continue: true,
        additionalContext: `[NEXUS] Plan mode activated. Follow the plan workflow:${branchInstruction}
1. ANALYZE: Analyze the request. Determine scale \u2014 small (1-3 files), medium (module-level), large (architecture/security/migration). Auto-escalate to large if request mentions auth, migration, delete, or security.
2. DRAFT: Spawn Agent({ subagent_type: "nexus:strategist", prompt: "<full request context>" }) to create initial plan.
3. REVIEW (medium+): Spawn Agent({ subagent_type: "nexus:architect", prompt: "Review this plan: <strategist output>" }) for structural review.
4. CRITIQUE (large only): Spawn Agent({ subagent_type: "nexus:reviewer", prompt: "Critique this plan: <architect output>" }). If critical issues, loop back to DRAFT (max 3 iterations).
5. PERSIST (MANDATORY \u2014 do NOT skip): Save plan to .nexus/plans/{branch}/plan.md using Write tool. Generate tasks.json in the same directory with task list. Both files MUST exist before proceeding to step 6.
6. EXECUTE BRIDGE: Offer 2-3 options via AskUserQuestion: Execute with delegation (Recommended) / Plan only / Skip.
Key: This is the standalone Plan skill \u2014 not the plan stage within auto. Scale determines formality. Small tasks need only a checklist, not a full ADR. Plans persist across sessions at .nexus/plans/ \u2014 do NOT delete them after merge.
`
      });
      return;
    }
    if (match.primitive === "setup") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Setup wizard activated. Guide the user through these steps IN ORDER using AskUserQuestion for each:
1. SCOPE: Ask configuration scope \u2014 User (all projects, ~/.claude/CLAUDE.md) or Project (this project only, CLAUDE.md). This determines write paths for all subsequent steps.
2. STATUSLINE: Ask preset choice (Full recommended / Standard / Minimal / Skip).
3. DELEGATION: Ask enforcement level (Warn recommended / Strict / Off / Skip).
4. CLAUDE.MD: Generate Nexus delegation section in CLAUDE.md using <!-- NEXUS:START --> / <!-- NEXUS:END --> markers. Content in English: delegation rules, agent routing table, 6-Section format guide, skill list. Preserve existing content outside markers.
5. OMC CHECK: Check if oh-my-claudecode (omc) plugin is active. If found, warn about conflicts and offer: Disable omc (recommended) / Keep both / Skip. If Disable chosen, set {"enabledPlugins":{"omc":false}} in .claude/settings.json.
6. INIT: Ask whether to run knowledge init (Yes recommended / Skip).
7. COMPLETE: Show summary of applied settings.
Key: Use AskUserQuestion for every step. Always offer Skip option.`
      });
      return;
    }
  }
  pass();
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
