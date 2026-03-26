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
function findProjectRoot(startDir) {
  let dir = startDir ?? process.cwd();
  while (dir !== "/") {
    if ((0, import_fs.existsSync)((0, import_path.join)(dir, ".git"))) return dir;
    dir = (0, import_path.resolve)(dir, "..");
  }
  return startDir ?? process.cwd();
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

// src/shared/tasks.ts
var import_fs2 = require("fs");
var import_path2 = require("path");
function readTasksSummary(branchRoot) {
  const tasksPath = (0, import_path2.join)(branchRoot, "tasks.json");
  if (!(0, import_fs2.existsSync)(tasksPath)) return { exists: false, total: 0, completed: 0, pending: 0, allCompleted: false };
  try {
    const data = JSON.parse((0, import_fs2.readFileSync)(tasksPath, "utf-8"));
    const tasks = data.tasks ?? [];
    const completed = tasks.filter((t) => t.status === "completed").length;
    const pending = tasks.length - completed;
    return {
      exists: true,
      total: tasks.length,
      completed,
      pending,
      allCompleted: tasks.length > 0 && pending === 0
    };
  } catch {
    return { exists: false, total: 0, completed: 0, pending: 0, allCompleted: false };
  }
}

// src/hooks/gate.ts
var import_fs3 = require("fs");
var import_path3 = require("path");
var import_os = require("os");
var TASK_PIPELINE = `
TASK PIPELINE (mandatory for all file modifications):
1. Check decisions.json for prior decisions \u2014 reference relevant IDs in nx_task_add(decisions=[...]).
2. Decompose work into discrete tasks \u2192 call nx_task_add for EACH task.
3. Edit/Write tools are BLOCKED without tasks.json.
4. As each task completes \u2192 nx_task_update(id, "completed").
5. All tasks done \u2192 nx_task_close (archives consult+decisions+tasks \u2192 history.json).`;
function taskPipelineMessage(modeSpecific) {
  return `${modeSpecific}${TASK_PIPELINE}`;
}
var DEV_TEAM_NUDGE = `[NEXUS] Dev team mode activated (forced).
CRITICAL RULES:
1. Lead MUST NOT use analysis tools, task tools, or code tools directly.
2. Only director creates/modifies tasks via nx_task_add/nx_task_update.
3. Use ONLY orchestration tools: TeamCreate, Agent, SendMessage, AskUserQuestion.
Follow the Team Path procedure in SKILL.md.`;
var RESEARCH_TEAM_NUDGE = `[NEXUS] Research team mode activated (forced).
CRITICAL RULES:
1. Lead MUST NOT use research tools, task tools, or code tools directly.
2. Only principal creates/modifies tasks via nx_task_add/nx_task_update.
3. Use ONLY orchestration tools: TeamCreate, Agent, SendMessage, AskUserQuestion.
Follow the Team Path procedure in SKILL.md.`;
var MARKER_START = "<!-- NEXUS:START -->";
var MARKER_END = "<!-- NEXUS:END -->";
var PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? "";
function extractMarkerContent(fileContent) {
  const startIdx = fileContent.indexOf(MARKER_START);
  const endIdx = fileContent.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1) return null;
  return fileContent.slice(startIdx + MARKER_START.length, endIdx).trim();
}
function replaceMarkerContent(fileContent, newContent) {
  const startIdx = fileContent.indexOf(MARKER_START);
  const endIdx = fileContent.indexOf(MARKER_END);
  return fileContent.slice(0, startIdx + MARKER_START.length) + "\n" + newContent + "\n" + fileContent.slice(endIdx);
}
function handleClaudeMdSync() {
  const templatePath = (0, import_path3.join)(PLUGIN_ROOT, "templates", "nexus-section.md");
  if (!PLUGIN_ROOT || !(0, import_fs3.existsSync)(templatePath)) return null;
  const template = (0, import_fs3.readFileSync)(templatePath, "utf-8").trim();
  const globalClaudeMd = (0, import_path3.join)((0, import_os.homedir)(), ".claude", "CLAUDE.md");
  if ((0, import_fs3.existsSync)(globalClaudeMd)) {
    const globalContent = (0, import_fs3.readFileSync)(globalClaudeMd, "utf-8");
    const globalMarker = extractMarkerContent(globalContent);
    if (globalMarker !== null && globalMarker !== template) {
      const updated = replaceMarkerContent(globalContent, template);
      (0, import_fs3.writeFileSync)(globalClaudeMd, updated);
    }
  }
  const projectClaudeMd = (0, import_path3.join)(process.cwd(), "CLAUDE.md");
  const notifiedFlag = (0, import_path3.join)(RUNTIME_ROOT, "claudemd-notified");
  if ((0, import_fs3.existsSync)(projectClaudeMd)) {
    const projectContent = (0, import_fs3.readFileSync)(projectClaudeMd, "utf-8");
    const projectMarker = extractMarkerContent(projectContent);
    if (projectMarker !== null && projectMarker !== template) {
      if (!(0, import_fs3.existsSync)(notifiedFlag)) {
        const notifiedDir = (0, import_path3.dirname)(notifiedFlag);
        if (!(0, import_fs3.existsSync)(notifiedDir)) {
          (0, import_fs3.mkdirSync)(notifiedDir, { recursive: true });
        }
        (0, import_fs3.writeFileSync)(notifiedFlag, "");
        return "[NEXUS] \uD504\uB85C\uC81D\uD2B8 CLAUDE.md\uC758 Nexus \uC139\uC158\uC774 \uCD5C\uC2E0 \uBC84\uC804\uACFC \uB2E4\uB985\uB2C8\uB2E4. /claude-nexus:nx-sync\uB85C \uAC31\uC2E0\uD558\uC138\uC694.";
      }
    } else if (projectMarker !== null && projectMarker === template) {
      if ((0, import_fs3.existsSync)(notifiedFlag)) {
        try {
          (0, import_fs3.unlinkSync)(notifiedFlag);
        } catch {
        }
      }
    }
  }
  return null;
}
function handleStop() {
  const summary = readTasksSummary(BRANCH_ROOT);
  if (!summary.exists) {
    pass();
    return;
  }
  if (summary.pending > 0) {
    respond({
      continue: true,
      additionalContext: `[NEXUS] ${summary.pending} tasks pending in tasks.json. Before stopping:
1. Review each pending task \u2014 verify if work is actually done.
2. Done \u2192 nx_task_update(id, "completed").
3. Not done \u2192 complete the work first.
4. When all completed \u2192 nx_task_close to archive.`
    });
    return;
  }
  respond({
    continue: true,
    additionalContext: `[NEXUS] All ${summary.total} tasks completed. MANDATORY: Call nx_task_close to archive this cycle (consult+decisions+tasks \u2192 history.json) before finishing.`
  });
}
function writeMode(mode, path) {
  const modePath = (0, import_path3.join)(BRANCH_ROOT, "mode.json");
  const modeDir = (0, import_path3.dirname)(modePath);
  if (!(0, import_fs3.existsSync)(modeDir)) (0, import_fs3.mkdirSync)(modeDir, { recursive: true });
  (0, import_fs3.writeFileSync)(modePath, JSON.stringify({ mode, path }));
}
function readMode() {
  const modePath = (0, import_path3.join)(BRANCH_ROOT, "mode.json");
  if (!(0, import_fs3.existsSync)(modePath)) return null;
  try {
    return JSON.parse((0, import_fs3.readFileSync)(modePath, "utf-8"));
  } catch {
    return null;
  }
}
function updateModePath(newPath) {
  const current = readMode();
  if (current) writeMode(current.mode, newPath);
}
function isNexusInternalPath(filePath) {
  if (/[\\/]\.nexus[\\/]/.test(filePath)) return true;
  if (/[\\/]\.claude[\\/]nexus[\\/]/.test(filePath)) return true;
  if (/[\\/]\.claude[\\/]settings\.json$/.test(filePath)) return true;
  if (/[\\/]CLAUDE\.md$/.test(filePath)) return true;
  return false;
}
function handlePreToolUse(event) {
  const toolName = event.tool_name ?? "";
  if (toolName === "Edit" || toolName === "Write") {
    const toolInput2 = event.tool_input;
    const filePath = toolInput2?.file_path ?? "";
    if (!isNexusInternalPath(filePath)) {
      const modePath = (0, import_path3.join)(BRANCH_ROOT, "mode.json");
      if ((0, import_fs3.existsSync)(modePath)) {
        respond({
          decision: "block",
          reason: "[NEXUS] Dev/Research mode active. Lead cannot edit files directly. Spawn agents (Agent tool) to perform the work."
        });
        return;
      }
      const summary = readTasksSummary(BRANCH_ROOT);
      if (!summary.exists) {
        respond({
          decision: "block",
          reason: "[NEXUS] No tasks.json found. Register tasks with nx_task_add before editing files. Pipeline: consult \u2192 decisions \u2192 tasks \u2192 execute."
        });
        return;
      }
      if (summary.allCompleted || summary.total === 0) {
        respond({
          decision: "block",
          reason: "[NEXUS] All tasks completed. Call nx_task_close to archive this cycle."
        });
        return;
      }
    }
    pass();
    return;
  }
  if (toolName === "TeamCreate") {
    updateModePath("team");
    pass();
    return;
  }
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
  const modeData = readMode();
  if (modeData?.path === "team") {
    respond({
      decision: "block",
      reason: "[TEAM] Direct Agent() calls are blocked in team mode. Use TeamCreate + Agent({ team_name }) to spawn teammates, or SendMessage to communicate with existing teammates."
    });
    return;
  }
  pass();
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
  const tagMatch = prompt.match(/\[(consult|dev!?|research!?)\]/i);
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
function getTasksReminder() {
  const summary = readTasksSummary(BRANCH_ROOT);
  if (!summary.exists) return null;
  if (summary.pending > 0) {
    return `[NEXUS] ${summary.pending} pending tasks. Complete work \u2192 nx_task_update(id, "completed") for each done task. Archive with nx_task_close when all complete.`;
  }
  return `[NEXUS] All ${summary.total} tasks completed but not archived. MANDATORY: Call nx_task_close to archive this cycle.`;
}
function withNotices(base, tasksReminder, claudeMdNotice) {
  return [tasksReminder, base, claudeMdNotice].filter(Boolean).join("\n");
}
function handleConsultMode({ tasksReminder, claudeMdNotice }) {
  const consultFile = (0, import_path3.join)(BRANCH_ROOT, "consult.json");
  const hasExistingSession = (0, import_fs3.existsSync)(consultFile);
  let base;
  if (hasExistingSession) {
    base = `[NEXUS] Consult mode activated. An existing session was found.
MANDATORY: Call nx_consult_status to review current issues and decisions. Do NOT skip this tool call.
If the new topic is related to the existing session, add issues with nx_consult_update(action="add").
If the new topic is completely unrelated, you may start fresh with nx_consult_start (this overwrites the existing session).`;
  } else {
    base = `[NEXUS] Consult mode activated. Starting a new session.
MANDATORY: Call nx_consult_start to register issues. Do NOT skip this tool call.
1. Explore first \u2014 read code, knowledge, decisions before asking questions.
2. Decompose the topic into discrete issues. Register with nx_consult_start. Present one issue at a time.
3. For each issue: comparison table (keywords) + recommendation bullets (why not others, why this one).
4. Natural dialogue for responses \u2014 allow user's free feedback (combinations, counter-proposals, questions).
5. Record decisions with [d] tag. After each decision, transition to the next issue.
6. After all issues decided: check for missed topics against the original question.
7. Do NOT execute. When ready, recommend an appropriate execution tag from CLAUDE.md Tags table.
8. Spawn agents if specialized analysis is needed.
Note: To continue an existing session, just continue the conversation without using [consult].`;
  }
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice)
  });
}
function handleDevMode({ tasksReminder, claudeMdNotice }) {
  writeMode("dev", "sub");
  const base = taskPipelineMessage(`[NEXUS] Dev mode activated. Assess the request and choose your approach:
- Simple (1-3 files): Use direct Agent() spawns
- Complex (4+ files): Use TeamCreate + full team workflow
[dev!] forces team mode.`);
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice)
  });
}
function handleDevTeamMode({ tasksReminder, claudeMdNotice }) {
  writeMode("dev", "team");
  respond({
    continue: true,
    additionalContext: withNotices(DEV_TEAM_NUDGE, tasksReminder, claudeMdNotice)
  });
}
function handleResearchMode({ tasksReminder, claudeMdNotice }) {
  writeMode("research", "sub");
  const base = taskPipelineMessage(`[NEXUS] Research mode activated. Assess the request and choose your approach:
- Simple (1-3 topics, single domain): Use direct Agent() spawns
- Complex (4+ topics, multiple domains/sources needed): Use TeamCreate + full team workflow
[research!] forces team mode.`);
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice)
  });
}
function handleResearchTeamMode({ tasksReminder, claudeMdNotice }) {
  writeMode("research", "team");
  respond({
    continue: true,
    additionalContext: withNotices(RESEARCH_TEAM_NUDGE, tasksReminder, claudeMdNotice)
  });
}
var PRIMITIVE_HANDLERS = {
  consult: handleConsultMode,
  dev: handleDevMode,
  "dev!": handleDevTeamMode,
  research: handleResearchMode,
  "research!": handleResearchTeamMode
};
function handleUserPromptSubmit(event) {
  const claudeMdNotice = handleClaudeMdSync();
  const tasksReminder = getTasksReminder();
  const raw = event.prompt ?? event.user_prompt ?? "";
  const prompt = typeof raw === "string" ? raw : String(raw);
  if (!prompt) {
    pass();
    return;
  }
  const dTag = prompt.match(/\[d\]/i);
  if (dTag) {
    const postDecisionRules = `

After recording the decision:
1. Record the decision ONLY. Do NOT execute or implement unless the user explicitly requests it.
2. If the user explicitly requests implementation: nx_task_add (decisions=[] or relevant IDs) \u2192 perform work \u2192 nx_task_close (history archive). Follow this pipeline even for simple edits. Edit/Write will be BLOCKED without tasks.json.
3. You may recommend [dev] or [research] tags for execution, but do not execute yourself unless asked.`;
    const consultFile = (0, import_path3.join)(BRANCH_ROOT, "consult.json");
    if ((0, import_fs3.existsSync)(consultFile)) {
      respond({
        continue: true,
        additionalContext: withNotices(`[NEXUS] Decision tag detected in consult mode. Use nx_consult_decide(issue_id, summary) to record \u2014 updates consult.json + decisions.json simultaneously.${postDecisionRules}`, tasksReminder, claudeMdNotice)
      });
    } else {
      respond({
        continue: true,
        additionalContext: withNotices(`[NEXUS] Decision tag detected. Record this decision using nx_decision_add tool.${postDecisionRules}`, tasksReminder, claudeMdNotice)
      });
    }
    return;
  }
  const match = detectKeywords(prompt);
  if (match) {
    const handler = PRIMITIVE_HANDLERS[match.primitive];
    if (handler) {
      handler({ prompt, tasksReminder, claudeMdNotice });
      return;
    }
  }
  const summary = readTasksSummary(BRANCH_ROOT);
  if (!summary.exists) {
    respond({
      continue: true,
      additionalContext: withNotices(taskPipelineMessage(`[NEXUS] No active tasks.`), null, claudeMdNotice)
    });
    return;
  }
  respond({
    continue: true,
    additionalContext: withNotices(`[NEXUS] Stale tasks.json detected from previous cycle. MANDATORY: Call nx_task_close to archive before starting new work.`, tasksReminder, claudeMdNotice)
  });
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
