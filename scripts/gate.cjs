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

// src/hooks/gate.ts
var import_fs2 = require("fs");
var import_path2 = require("path");
function handleStop() {
  const tasksPath = (0, import_path2.join)(RUNTIME_ROOT, "tasks.json");
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
    respond({
      continue: true,
      additionalContext: "[NEXUS] All tasks completed. Run nx_plan_archive() to archive this plan, then report results to the user."
    });
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
  const tasksPath = (0, import_path2.join)(RUNTIME_ROOT, "tasks.json");
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
  consult: { primitive: "consult", skill: "nexus:nx-consult" },
  team: { primitive: "team", skill: "nexus:nx-team" }
};
var NATURAL_PATTERNS = [
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: "consult", skill: "nexus:nx-consult" }
  },
  {
    patterns: [/팀\s*(구성|으로)/, /\bteam\b/i, /team\s*this/i],
    match: { primitive: "team", skill: "nexus:nx-team" }
  }
];
var ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
var PRIMITIVE_NAMES = /\b(team|consult)\b/i;
function isPrimitiveMention(prompt) {
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  if (/[`"'](?:team|consult)[`"']/i.test(prompt)) return true;
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
        additionalContext: `[NEXUS] Consult mode activated. Follow the consult workflow:
1. EXPLORE: Read code and knowledge first. Auto-detect brownfield vs greenfield.
2. CLARIFY: Use AskUserQuestion with concrete options. One question at a time. 1-2 rounds max.
3. PROPOSE: Present 2-3 genuinely different approaches with pros/cons/effort via AskUserQuestion.
4. CONVERGE: Summarize the chosen direction. Do NOT execute. Consult is advisory only.
Key: No execution. User decides next steps. [d] tags can record decisions during consult.`
      });
      return;
    }
    if (match.primitive === "team") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Team mode activated. Follow the team workflow:
CRITICAL RULES \u2014 VIOLATION OF THESE IS A SYSTEM ERROR:
1. Direct Agent() calls are BLOCKED (except Explore and team_name agents).
2. Lead MUST NEVER call nx_task_add() or nx_task_update(). ONLY Analyst can create/modify tasks.
3. Lead MUST NEVER write code, edit files, or create plans. ALL work goes through teammates.
4. Lead uses ONLY orchestration tools (TeamCreate, Agent, SendMessage, AskUserQuestion). No analysis or code tools.
5. If you need tasks created, tell Analyst via SendMessage. Do NOT call nx_task_add yourself \u2014 even with a caller parameter.

1. INTAKE: Summarize user request/context. Branch Guard (create feature branch if on main/master). TeamCreate + spawn Analyst and Architect simultaneously via Agent({ team_name: ... }).
2. ANALYZE+PLAN: Analyst investigates using nx_knowledge_read, nx_context, LSP, AST tools. If unclear, Analyst sends question to Lead via SendMessage \u2014 Lead forwards to user via AskUserQuestion, then relays answer back to Analyst. Analyst and Architect then enter consensus loop (Analyst \u2194 Architect via SendMessage). Analyst finalizes tasks via nx_task_add() after consensus.
3. PERSIST: Analyst registers all tasks in tasks.json via nx_task_add(). Gate Stop watches this file \u2014 nonstop execution begins immediately.
4. EXECUTE: Assign tasks \u2014 reuse idle teammates first (SendMessage to assign new work), spawn new teammates only if all are busy.
   - Any teammate can be spawned in parallel (e.g. builder-1, builder-2, guard-1, guard-2) when workload demands it.
   - Builder calls nx_task_update(id, "completed") when done, then SendMessage to Analyst to report completion.
   - Guard validates each task result, then SendMessage to Analyst with the result (pass or issues found).
   - On issues found, Guard reports to Analyst via SendMessage. Analyst updates tasks (nx_task_add or nx_task_update).
   - Debugger is for errors only \u2014 spawn on demand when a teammate hits a blocking issue.
5. COMPLETE: When all tasks done, call nx_plan_archive().

Teammate spawn example:
  TeamCreate({ team_name: "proj", description: "..." })
  Agent({ subagent_type: "nexus:analyst", name: "analyst", team_name: "proj", prompt: "..." })
  Agent({ subagent_type: "nexus:architect", name: "architect", team_name: "proj", prompt: "..." })

Key: Plan = consensus (Analyst + Architect), Execute = atomic by default \u2014 but Analyst may add tasks (nx_task_add) or reopen tasks (nx_task_update) based on Guard reports. Tasks are persisted in tasks.json. Gate Stop reminds until all nx_task tasks are completed. Do NOT use TaskCreate to spawn teammates \u2014 use Agent with team_name.
When reminded by Gate Stop, use SendMessage to check teammate progress or assign idle teammates instead of attempting the work yourself.`
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
