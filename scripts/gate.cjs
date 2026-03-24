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

// src/shared/paths.ts
var import_path = require("path");
var import_fs = require("fs");
var import_child_process = require("child_process");
function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== "/") {
    if ((0, import_fs.existsSync)((0, import_path.join)(dir, ".git"))) return dir;
    dir = (0, import_path.resolve)(dir, "..");
  }
  return process.cwd();
}
var PROJECT_ROOT = findProjectRoot();
var RUNTIME_ROOT = process.env.NEXUS_RUNTIME_ROOT || (0, import_path.join)(PROJECT_ROOT, ".nexus");
var KNOWLEDGE_ROOT = (0, import_path.join)(PROJECT_ROOT, ".claude", "nexus");
function ensureDir(dir) {
  if (!(0, import_fs.existsSync)(dir)) {
    (0, import_fs.mkdirSync)(dir, { recursive: true });
  }
}
function getCurrentBranch() {
  try {
    return (0, import_child_process.execSync)("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "_unknown";
  }
}
function sanitizeBranch(branch) {
  if (branch === "HEAD") {
    try {
      const hash = (0, import_child_process.execSync)("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
      return `_detached-${hash}`;
    } catch {
      return "_detached";
    }
  }
  return branch.replace(/[/\\:*?"<>|]/g, "-");
}
var CURRENT_BRANCH = getCurrentBranch();
function migrateLegacyBranchDir(branchName) {
  const sanitized = sanitizeBranch(branchName);
  const legacyPath = (0, import_path.join)(RUNTIME_ROOT, sanitized);
  const newPath = (0, import_path.join)(RUNTIME_ROOT, "branches", sanitized);
  if ((0, import_fs.existsSync)(legacyPath) && !(0, import_fs.existsSync)(newPath)) {
    ensureDir((0, import_path.join)(RUNTIME_ROOT, "branches"));
    (0, import_fs.renameSync)(legacyPath, newPath);
  }
}
migrateLegacyBranchDir(CURRENT_BRANCH);
var BRANCH_ROOT = (0, import_path.join)(RUNTIME_ROOT, "branches", sanitizeBranch(CURRENT_BRANCH));

// src/hooks/gate.ts
var import_fs2 = require("fs");
var import_path2 = require("path");
function handleStop() {
  const tasksPath = (0, import_path2.join)(BRANCH_ROOT, "tasks.json");
  if (!(0, import_fs2.existsSync)(tasksPath)) {
    pass();
    return;
  }
  try {
    const data = JSON.parse((0, import_fs2.readFileSync)(tasksPath, "utf-8"));
    const tasks = data.tasks ?? [];
    const pending = tasks.filter((t) => t.status !== "completed");
    if (pending.length > 0) {
      respond({
        continue: true,
        additionalContext: `[NEXUS] ${pending.length} tasks remaining in tasks.json. Complete all tasks before stopping.`
      });
      return;
    }
    pass();
    return;
  } catch {
    pass();
    return;
  }
}
function handlePreToolUse(event) {
  const toolName = event.tool_name ?? "";
  if (toolName !== "Agent") {
    pass();
    return;
  }
  const toolInput = event.tool_input;
  if (toolInput?.subagent_type === "Explore") {
    pass();
    return;
  }
  if (toolInput?.team_name) {
    pass();
    return;
  }
  const tasksPath = (0, import_path2.join)(BRANCH_ROOT, "tasks.json");
  if (!(0, import_fs2.existsSync)(tasksPath)) {
    pass();
    return;
  }
  respond({
    decision: "block",
    reason: "[TEAM] Direct Agent() calls are blocked in team mode. Use TeamCreate + TaskCreate to spawn teammates, or SendMessage to communicate with existing teammates."
  });
}
var EXPLICIT_TAGS = {
  consult: { primitive: "consult", skill: "claude-nexus:nx-consult" },
  dev: { primitive: "dev", skill: "claude-nexus:nx-dev" },
  "dev!": { primitive: "dev!", skill: "claude-nexus:nx-dev" },
  research: { primitive: "research", skill: "claude-nexus:nx-research" },
  "research!": { primitive: "research!", skill: "claude-nexus:nx-research" }
};
var NATURAL_PATTERNS = [
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: "consult", skill: "claude-nexus:nx-consult" }
  }
];
var ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
var PRIMITIVE_NAMES = /\b(dev|consult|research)\b/i;
function isPrimitiveMention(prompt) {
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  if (/[`"'](?:dev|consult|research)[`"']/i.test(prompt)) return true;
  return false;
}
function detectKeywords(prompt) {
  const tagMatch = prompt.match(/\[(\w+!?)\]/);
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
  const dTag = prompt.match(/\[d\]/i);
  if (dTag) {
    respond({
      continue: true,
      additionalContext: "[NEXUS] Decision tag detected. Record this decision using nx_decision_add tool."
    });
    return;
  }
  const match = detectKeywords(prompt);
  if (match) {
    if (match.primitive === "consult") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Consult mode activated. Principles:
1. Explore first \u2014 read code, knowledge, and decisions before asking questions.
2. AskUserQuestion for clear choices, natural dialogue for open discussion.
3. When a decision is reached, suggest recording it with [d] tag.
4. After each decision, naturally transition to the next topic.
5. Do NOT execute. When ready, recommend an appropriate execution tag from CLAUDE.md Tags table.
6. Spawn agents if specialized analysis is needed.`
      });
      return;
    }
    if (match.primitive === "dev") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Dev mode activated. Assess the request and choose your approach:
- Simple (1-3 files, clear scope): Use direct Agent() spawns freely with any agent (director, architect, engineer, qa)
- Complex (4+ files, design decisions needed): Use TeamCreate + full team workflow (director+architect design \u2192 engineer+qa execute)
[dev!] forces team mode. Otherwise, use your judgment \u2014 no need to over-analyze.`
      });
      return;
    }
    if (match.primitive === "dev!") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Dev team mode activated (forced). Follow the team workflow:
CRITICAL RULES \u2014 VIOLATION OF THESE IS A SYSTEM ERROR:
1. Direct Agent() calls are BLOCKED (except Explore and team_name agents).
2. Lead MUST NEVER call nx_task_add() or nx_task_update(). ONLY director can create/modify tasks.
3. Lead MUST NEVER write code, edit files, or create plans. ALL work goes through teammates.
4. Lead uses ONLY orchestration tools (TeamCreate, Agent, SendMessage, AskUserQuestion). No analysis or code tools.
5. If you need tasks created, tell director via SendMessage. Do NOT call nx_task_add yourself \u2014 even with a caller parameter.

1. INTAKE: Summarize user request/context. TeamCreate + spawn director and architect simultaneously via Agent({ team_name: ... }).
2. ANALYZE+PLAN: director investigates using nx_knowledge_read, nx_context, LSP, AST tools. If unclear, director sends question to Lead via SendMessage \u2014 Lead forwards to user via AskUserQuestion, then relays answer back to director. director and architect then enter consensus loop (director \u2194 architect via SendMessage). director finalizes tasks via nx_task_add() after consensus.
3. PERSIST: director registers all tasks in tasks.json via nx_task_add(). Gate Stop watches this file \u2014 nonstop execution begins immediately.
4. EXECUTE: Assign tasks \u2014 reuse idle teammates first (SendMessage to assign new work), spawn new teammates only if all are busy.
   - Any teammate can be spawned in parallel (e.g. engineer-1, engineer-2, qa-1, qa-2) when workload demands it.
   - engineer calls nx_task_update(id, "completed") when done, then SendMessage to director to report completion.
   - qa validates each task result, then SendMessage to director with the result (pass or issues found).
   - On issues found, qa reports to director via SendMessage. director updates tasks (nx_task_add or nx_task_update).
5. COMPLETE: When all tasks done, Gate Stop unblocks automatically.

Teammate spawn example:
  TeamCreate({ team_name: "proj", description: "..." })
  Agent({ subagent_type: "claude-nexus:director", name: "director", team_name: "proj", prompt: "..." })
  Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "proj", prompt: "..." })

Key: Plan = consensus (director + architect), Execute = atomic by default \u2014 but director may add tasks (nx_task_add) or reopen tasks (nx_task_update) based on qa reports. Tasks are persisted in tasks.json. Gate Stop reminds until all nx_task tasks are completed. When reminded by Gate Stop, use SendMessage to check teammate progress or assign idle teammates instead of attempting the work yourself.
Escalation: engineer/qa report to director by default. Escalate to architect for design/architecture questions.`
      });
      return;
    }
    if (match.primitive === "research") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Research mode activated. Assess the request and choose your approach:
- Simple (1-3 topics, single domain): Use direct Agent() spawns freely with any agent (principal, postdoc, researcher)
- Complex (4+ topics, multiple domains/sources needed): Use TeamCreate + full team workflow (principal+postdoc scope \u2192 researcher investigate \u2192 converge)
[research!] forces team mode. Otherwise, use your judgment \u2014 no need to over-analyze.`
      });
      return;
    }
    if (match.primitive === "research!") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Research team mode activated (forced). Follow the team workflow:
CRITICAL RULES \u2014 VIOLATION OF THESE IS A SYSTEM ERROR:
1. Direct Agent() calls are BLOCKED (except Explore and team_name agents).
2. Lead MUST NEVER call nx_task_add() or nx_task_update(). ONLY principal can create/modify tasks.
3. Lead MUST NEVER conduct research, read sources, or create plans. ALL work goes through teammates.
4. Lead uses ONLY orchestration tools (TeamCreate, Agent, SendMessage, AskUserQuestion). No analysis or research tools.
5. If you need tasks created, tell principal via SendMessage. Do NOT call nx_task_add yourself \u2014 even with a caller parameter.

1. INTAKE: Summarize user request/context. TeamCreate + spawn principal and postdoc simultaneously via Agent({ team_name: ... }).
2. SCOPE: principal investigates background/context. If unclear, principal sends question to Lead via SendMessage \u2014 Lead forwards to user via AskUserQuestion, then relays answer back to principal. principal and postdoc then enter consensus loop (principal \u2194 postdoc via SendMessage). principal finalizes tasks via nx_task_add() after consensus.
3. PERSIST: principal registers all tasks in tasks.json via nx_task_add(). Gate Stop watches this file \u2014 nonstop execution begins immediately.
4. INVESTIGATE: Assign tasks \u2014 reuse idle teammates first (SendMessage to assign new work), spawn new teammates only if all are busy.
   - Any teammate can be spawned in parallel (e.g. researcher-1, researcher-2) when workload demands it.
   - researcher calls nx_task_update(id, "completed") when done, then SendMessage to principal to report completion.
   - On insufficient results, principal updates tasks (nx_task_add or nx_task_update).
5. CONVERGE: principal synthesizes findings with postdoc via SendMessage. Final insights/recommendations drafted.
6. COMPLETE: When all tasks done, Gate Stop unblocks automatically.

Teammate spawn example:
  TeamCreate({ team_name: "proj", description: "..." })
  Agent({ subagent_type: "claude-nexus:principal", name: "principal", team_name: "proj", prompt: "..." })
  Agent({ subagent_type: "claude-nexus:postdoc", name: "postdoc", team_name: "proj", prompt: "..." })

Key: Scope = consensus (principal + postdoc), Investigate = atomic by default \u2014 but principal may add tasks (nx_task_add) or reopen tasks (nx_task_update) based on findings. Tasks are persisted in tasks.json. Gate Stop reminds until all nx_task tasks are completed. When reminded by Gate Stop, use SendMessage to check teammate progress or assign idle teammates instead of attempting the work yourself.
Escalation: researcher reports to principal by default. Escalate to postdoc for methodology/source questions.`
      });
      return;
    }
  }
  pass();
}
async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hasToolName = "tool_name" in event;
  const hasPrompt = "prompt" in event || "user_prompt" in event;
  if (hasToolName) {
    handlePreToolUse(event);
  } else if (hasPrompt) {
    handleUserPromptSubmit(event);
  } else {
    handleStop();
  }
}
main().catch(() => {
  respond({ continue: true });
});
//# sourceMappingURL=gate.cjs.map
