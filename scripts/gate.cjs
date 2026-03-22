"use strict";

// src/shared/hook-io.ts
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => resolve(data));
  });
}
function respond(obj) {
  process.stdout.write(JSON.stringify(obj));
}
function pass() {
  respond({ continue: true });
}

// src/hooks/gate.ts
var import_fs = require("fs");
var import_path = require("path");
function handleStop() {
  const tasksPath = (0, import_path.join)(process.cwd(), ".nexus", "tasks.json");
  if (!(0, import_fs.existsSync)(tasksPath)) {
    pass();
    return;
  }
  try {
    const data = JSON.parse((0, import_fs.readFileSync)(tasksPath, "utf-8"));
    const tasks = data.tasks ?? [];
    const pending = tasks.filter((t) => t.status !== "completed");
    if (pending.length > 0) {
      respond({
        decision: "block",
        reason: `[TEAM] ${pending.length} tasks remaining. Continue working on pending tasks. Use nx_task_update to mark completed tasks.`
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
  const tasksPath = (0, import_path.join)(process.cwd(), ".nexus", "tasks.json");
  if (!(0, import_fs.existsSync)(tasksPath)) {
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
      const branchInstruction = "";
      respond({
        continue: true,
        additionalContext: `[NEXUS] Team mode activated. Follow the team workflow:${branchInstruction}
IMPORTANT: Direct Agent() calls are BLOCKED in team mode. You MUST use TeamCreate + TaskCreate.

1. ANALYZE: Determine what needs to be done. If unclear, ask 1-2 clarifying questions via AskUserQuestion. If decisions.json exists, read it for context.
2. DRAFT: Write the plan yourself.
3. REVIEW: Use TeamCreate to create a team, then use TaskCreate to add Architect and Reviewer as teammates for plan review.
4. PERSIST: Use nx_task_add() to create tasks in .nexus/tasks.json. Each task needs title, context, and optional deps.
5. EXECUTE: Use TaskCreate to add Builder, Debugger, Tester, Guard as teammates. Assign tasks via TaskUpdate with owner parameter.
6. VERIFY: Guard teammate verifies completed work. Use nx_task_update() to mark task progress.

Example team setup:
  TeamCreate({ team_name: "project-x", description: "..." })
  TaskCreate({ team_name: "project-x", subagent_type: "nexus:architect", name: "architect", prompt: "..." })
  TaskCreate({ team_name: "project-x", subagent_type: "nexus:builder", name: "builder", prompt: "..." })

Key: Gate Stop blocks until all nx_task tasks are completed. Use nx_task_update() to mark progress. nx_plan_archive() to finish.`
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
