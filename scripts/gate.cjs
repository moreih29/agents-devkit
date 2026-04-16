"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/hooks/gate.ts
var gate_exports = {};
__export(gate_exports, {
  HANDLED_TAG_IDS: () => HANDLED_TAG_IDS
});
module.exports = __toCommonJS(gate_exports);

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
function findProjectRoot(startDir) {
  let dir = startDir ?? process.cwd();
  while (dir !== "/") {
    if ((0, import_fs.existsSync)((0, import_path.join)(dir, ".git"))) return dir;
    dir = (0, import_path.resolve)(dir, "..");
  }
  return startDir ?? process.cwd();
}
var PROJECT_ROOT = findProjectRoot();
var NEXUS_ROOT = process.env.NEXUS_RUNTIME_ROOT || (0, import_path.join)(PROJECT_ROOT, ".nexus");
var STATE_ROOT = (0, import_path.join)(NEXUS_ROOT, "state");
var HARNESS_ID = "claude-nexus";
var HARNESS_STATE_ROOT = (0, import_path.join)(STATE_ROOT, HARNESS_ID);
var MEMORY_ROOT = (0, import_path.join)(NEXUS_ROOT, "memory");
var CONTEXT_ROOT = (0, import_path.join)(NEXUS_ROOT, "context");
function ensureDir(dir) {
  if (!(0, import_fs.existsSync)(dir)) {
    (0, import_fs.mkdirSync)(dir, { recursive: true });
  }
}
var GITIGNORE_CONTENT = `# Nexus: whitelist tracked files, ignore everything else
*
!.gitignore
!memory/
!memory/**
!context/
!context/**
!history.json
!rules/
!rules/**
`;
function ensureNexusStructure() {
  ensureDir(NEXUS_ROOT);
  ensureDir(STATE_ROOT);
  ensureDir(HARNESS_STATE_ROOT);
  const gitignorePath = (0, import_path.join)(NEXUS_ROOT, ".gitignore");
  if (!(0, import_fs.existsSync)(gitignorePath)) {
    (0, import_fs.writeFileSync)(gitignorePath, GITIGNORE_CONTENT);
  }
}

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

// src/shared/matrix.ts
var AGENT_ROLES = [
  "architect",
  "postdoc",
  "designer",
  "strategist",
  "engineer",
  "researcher",
  "writer",
  "tester",
  "reviewer"
];
function extractRole(agentType) {
  const prefix = "claude-nexus:";
  if (!agentType.startsWith(prefix)) return null;
  const role = agentType.slice(prefix.length);
  return AGENT_ROLES.includes(role) ? role : null;
}

// src/hooks/gate.ts
var import_fs3 = require("fs");
var import_path3 = require("path");
var import_os = require("os");
var TASK_PIPELINE = `
TASK PIPELINE (mandatory for all file modifications):
1. Check plan.json issues for prior decisions \u2014 reference relevant plan_issue IDs in nx_task_add(plan_issue=N).
2. Decompose work into discrete tasks \u2192 call nx_task_add for EACH task.
3. Edit/Write tools are BLOCKED without tasks.json.
4. As each task completes \u2192 nx_task_update(id, "completed").
5. All tasks done \u2192 ask user "close\uD560\uAE4C\uC694?" (team mode) or nx_task_close directly (Lead solo).`;
function taskPipelineMessage(modeSpecific) {
  return modeSpecific.replace("</nexus>", `${TASK_PIPELINE}</nexus>`);
}
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
  if ((0, import_fs3.existsSync)(projectClaudeMd)) {
    const projectContent = (0, import_fs3.readFileSync)(projectClaudeMd, "utf-8");
    const projectMarker = extractMarkerContent(projectContent);
    if (projectMarker !== null && projectMarker !== template) {
      const updated = replaceMarkerContent(projectContent, template);
      (0, import_fs3.writeFileSync)(projectClaudeMd, updated);
    }
  }
  return null;
}
function getSyncNudge() {
  const historyPath = (0, import_path3.join)(process.cwd(), ".nexus", "history.json");
  if (!(0, import_fs3.existsSync)(historyPath)) return null;
  try {
    const history = JSON.parse((0, import_fs3.readFileSync)(historyPath, "utf-8"));
    const cycles = history.cycles ?? [];
    if (cycles.length === 0) return null;
    const lastSyncIdx = cycles.findLastIndex(
      (c) => c.topics?.some((t) => /sync/i.test(t))
    );
    const cyclesSinceSync = lastSyncIdx === -1 ? cycles.length : cycles.length - 1 - lastSyncIdx;
    if (cyclesSinceSync >= 3) {
      return `<nexus>Core knowledge may be outdated (${cyclesSinceSync} cycles since last sync). Consider running /claude-nexus:nx-sync.</nexus>`;
    }
  } catch {
  }
  return null;
}
function handleStop(event) {
  const summary = readTasksSummary(STATE_ROOT);
  if (!summary.exists) {
    const syncNudge = getSyncNudge();
    if (syncNudge) {
      respond({ continue: true, additionalContext: syncNudge });
      return;
    }
    pass();
    return;
  }
  if (summary.pending > 0) {
    respond({
      continue: true,
      additionalContext: `<nexus>${summary.pending} tasks pending in tasks.json. Before stopping:
1. Review each pending task \u2014 verify if work is actually done.
2. Done \u2192 nx_task_update(id, "completed").
3. Not done \u2192 complete the work first.
4. When all completed \u2192 nx_task_close to archive.</nexus>`
    });
    return;
  }
  if (event.stop_hook_active) {
    pass();
    return;
  }
  respond({
    continue: true,
    additionalContext: `<nexus>All tasks completed. Call nx_task_close now.</nexus>`
  });
}
function isNexusInternalPath(filePath) {
  if (/[\\/]\.nexus[\\/]state[\\/]/.test(filePath)) return true;
  if (/[\\/]\.claude[\\/]settings\.json$/.test(filePath)) return true;
  if (/[\\/]CLAUDE\.md$/.test(filePath)) return true;
  return false;
}
function handlePreToolUse(event) {
  const toolName = event.tool_name ?? "";
  if (toolName === "Edit" || toolName === "Write") {
    const tasksPath = (0, import_path3.join)(STATE_ROOT, "tasks.json");
    if (!(0, import_fs3.existsSync)(tasksPath)) {
      pass();
      return;
    }
    const toolInput = event.tool_input;
    const filePath = toolInput?.file_path ?? "";
    if (!isNexusInternalPath(filePath)) {
      const summary = readTasksSummary(STATE_ROOT);
      if (summary.allCompleted || summary.total === 0) {
        respond({
          decision: "block",
          reason: "<nexus>All tasks completed. Call nx_task_close to archive, or nx_task_add to register additional tasks.</nexus>"
        });
        return;
      }
    }
    pass();
    return;
  }
  pass();
}
var HANDLED_TAG_IDS = ["plan", "run", "sync", "d", "m", "m-gc", "rule"];
var EXPLICIT_TAGS = {
  plan: { primitive: "plan", skill: "claude-nexus:nx-plan" },
  "plan:auto": { primitive: "plan", skill: "claude-nexus:nx-plan" },
  run: { primitive: "run", skill: "claude-nexus:nx-run" }
};
function detectKeywords(prompt) {
  const tagMatch = prompt.match(/\[(plan(?::auto)?|run)\]/i);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    if (tag in EXPLICIT_TAGS) return EXPLICIT_TAGS[tag];
  }
  return null;
}
function getTasksReminder() {
  const summary = readTasksSummary(STATE_ROOT);
  if (!summary.exists) return null;
  if (summary.pending > 0) {
    return `<nexus>${summary.pending} pending tasks. Complete work \u2192 nx_task_update(id, "completed") for each done task. Archive with nx_task_close when all complete.</nexus>`;
  }
  return `<nexus>All ${summary.total} tasks completed but not archived. MANDATORY: Call nx_task_close to archive this cycle.</nexus>`;
}
function getPlanReminder() {
  const planFilePath = (0, import_path3.join)(STATE_ROOT, "plan.json");
  if (!(0, import_fs3.existsSync)(planFilePath)) return null;
  try {
    const data = JSON.parse((0, import_fs3.readFileSync)(planFilePath, "utf-8"));
    const issues = data.issues ?? [];
    const pending = issues.filter((i) => i.status === "pending");
    const current = pending.length > 0 ? `Next: #${pending[0].id} "${pending[0].title}"` : "All issues decided.";
    return `<nexus>Plan: "${data.topic}" | ${current} | ${pending.length} pending
Present comparison table with pros/cons/recommendation. Record decisions with [d].</nexus>`;
  } catch {
    return null;
  }
}
function scanFolderEntries(folderPath) {
  if (!(0, import_fs3.existsSync)(folderPath)) return [];
  let files;
  try {
    files = (0, import_fs3.readdirSync)(folderPath).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
  const entries = [];
  for (const file of files) {
    const name = (0, import_path3.basename)(file, ".md");
    const filePath = (0, import_path3.join)(folderPath, file);
    let tags = "";
    try {
      const content = (0, import_fs3.readFileSync)(filePath, "utf-8");
      const tagMatch = content.match(/<!--\s*tags:\s*([^-]+?)\s*-->/);
      if (tagMatch) {
        const tagList = tagMatch[1].split(",").map((t) => t.trim()).filter(Boolean);
        const shortTags = tagList.slice(0, 3).join(", ");
        tags = ` [${shortTags}]`;
      }
    } catch {
    }
    entries.push(`${name}${tags}`);
  }
  return entries;
}
function buildCoreIndex() {
  const nexusRoot = (0, import_path3.join)(process.cwd(), ".nexus");
  const rulesRoot = (0, import_path3.join)(nexusRoot, "rules");
  const layerLines = [];
  const memoryEntries = scanFolderEntries(MEMORY_ROOT);
  if (memoryEntries.length > 0) {
    layerLines.push(`memory: ${memoryEntries.join(", ")}`);
  }
  const contextEntries = scanFolderEntries(CONTEXT_ROOT);
  if (contextEntries.length > 0) {
    layerLines.push(`context: ${contextEntries.join(", ")}`);
  }
  const rulesEntries = scanFolderEntries(rulesRoot);
  if (rulesEntries.length > 0) {
    layerLines.push(`rules: ${rulesEntries.join(", ")}`);
  }
  if (layerLines.length === 0) return "";
  const header = "[.nexus Knowledge]";
  const result = `${header}
${layerLines.join("\n")}`;
  return result.length <= 2e3 ? result : result.slice(0, 1997) + "...";
}
function withNotices(base, tasksReminder, claudeMdNotice, planReminder) {
  return [planReminder, tasksReminder, base, claudeMdNotice].filter(Boolean).join("\n");
}
function handleRuleMode({ tasksReminder, claudeMdNotice, ruleTags }) {
  const tagInfo = ruleTags ? `Tags: [${ruleTags.join(", ")}] \u2014 include at top of rule file as <!-- tags: ${ruleTags.join(", ")} -->.` : "Tags: none \u2014 infer appropriate tags from rule content and add them.";
  const base = `<nexus>Rule mode \u2014 saving user instruction as a project rule.
${tagInfo}
1. Extract and clean up rule content from the user message.
2. Save to .nexus/rules/{name}.md via the Write tool.
Rules are git-tracked and auto-delivered to agents via SubagentStart hook index injection.
Task pipeline not required \u2014 save directly.</nexus>`;
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice)
  });
}
function handlePlanMode({ prompt, tasksReminder, claudeMdNotice }) {
  const staleSummary = readTasksSummary(STATE_ROOT);
  if (staleSummary.exists && staleSummary.allCompleted) {
    respond({
      continue: true,
      additionalContext: `<nexus>\u26A0 Previous cycle not closed \u2014 tasks.json exists with all tasks completed. Call nx_task_close first to archive before starting a new plan.</nexus>`
    });
    return;
  }
  const isAuto = /\[plan:auto\]/i.test(prompt);
  const planFile = (0, import_path3.join)(STATE_ROOT, "plan.json");
  const hasExistingSession = (0, import_fs3.existsSync)(planFile);
  let hints = "";
  if (hasExistingSession) {
    hints = "\nExisting plan session detected \u2014 check nx_plan_status to resume.";
  }
  if (isAuto) {
    hints += '\nAuto mode requested \u2014 pass args: "auto" to the skill.';
  }
  const base = `<nexus>BLOCKING: Invoke Skill tool with skill="claude-nexus:nx-plan"${isAuto ? ', args: "auto"' : ""} BEFORE any other action. Do NOT attempt planning without loading the skill first.${hints}</nexus>`;
  const coreIndex = buildCoreIndex();
  const coreSection = coreIndex ? `
${coreIndex}
Check core/reference/ BEFORE web searching for known topics.` : "";
  respond({
    continue: true,
    additionalContext: withNotices(base + coreSection, tasksReminder, claudeMdNotice, null)
  });
}
function handleRunMode({ tasksReminder, claudeMdNotice }) {
  const planReminder = getPlanReminder();
  const tasksSummary = readTasksSummary(STATE_ROOT);
  let hints = "";
  if (!tasksSummary.exists) {
    hints = "\ntasks.json absent \u2014 plan required before execution. Suggest [plan:auto] or [plan].";
  } else {
    hints = `
tasks.json: ${tasksSummary.pending} pending, ${tasksSummary.total - tasksSummary.pending} completed of ${tasksSummary.total} tasks.`;
  }
  const coreIndex = buildCoreIndex();
  const coreSection = coreIndex ? `
${coreIndex}` : "";
  const base = `<nexus>BLOCKING: Invoke Skill tool with skill="claude-nexus:nx-run" BEFORE any other action. Do NOT attempt execution without loading the skill first.${hints}</nexus>${coreSection}`;
  respond({
    continue: true,
    additionalContext: withNotices(taskPipelineMessage(base), tasksReminder, claudeMdNotice, planReminder)
  });
}
var PRIMITIVE_HANDLERS = {
  plan: handlePlanMode,
  run: handleRunMode
};
function handleUserPromptSubmit(event) {
  const claudeMdNotice = handleClaudeMdSync();
  const tasksReminder = getTasksReminder();
  const planReminder = getPlanReminder();
  const raw = event.prompt ?? event.user_prompt ?? "";
  const prompt = typeof raw === "string" ? raw : String(raw);
  if (!prompt) {
    pass();
    return;
  }
  const dTag = prompt.match(/\[d\]/i);
  if (dTag) {
    const postDecisionRules = `

Record decision only. For implementation, use [run].`;
    const planFile = (0, import_path3.join)(STATE_ROOT, "plan.json");
    if ((0, import_fs3.existsSync)(planFile)) {
      respond({
        continue: true,
        additionalContext: withNotices(`<nexus>Decision tag detected in plan mode. Use nx_plan_decide(issue_id, decision) to record.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, planReminder)
      });
    } else {
      respond({
        continue: true,
        additionalContext: withNotices(`<nexus>[d]\uB294 plan \uC138\uC158 \uC548\uC5D0\uC11C\uB9CC \uC720\uD6A8\uD569\uB2C8\uB2E4. [plan] \uD0DC\uADF8\uB85C \uD50C\uB798\uB2DD\uC744 \uBA3C\uC800 \uC2DC\uC791\uD558\uC138\uC694.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, null)
      });
    }
    return;
  }
  const mTag = prompt.match(/\[m(?::([^\]]*))?\]/i);
  if (mTag) {
    const subCmd = mTag[1]?.trim().toLowerCase();
    if (subCmd === "gc") {
      respond({
        continue: true,
        additionalContext: withNotices(
          `<nexus>Memory GC mode \u2014 \uAE30\uC874 .nexus/memory/ \uD30C\uC77C\uC744 Glob\uC73C\uB85C \uD655\uC778\uD558\uACE0, \uAD00\uB828 \uBA54\uBAA8\uB97C \uBCD1\uD569/\uC0AD\uC81C\uD558\uC5EC \uC815\uB9AC\uD558\uB77C. Write \uB3C4\uAD6C\uB85C \uC800\uC7A5.</nexus>`,
          tasksReminder,
          claudeMdNotice
        )
      });
    } else {
      const userContent = prompt.replace(/\[m(?::([^\]]*))?\]/i, "").trim();
      respond({
        continue: true,
        additionalContext: withNotices(
          `<nexus>Memory save mode \u2014 \uB2E4\uC74C \uB0B4\uC6A9\uC744 \uC555\uCD95\xB7\uC815\uC81C\uD558\uC5EC .nexus/memory/{\uC801\uC808\uD55C_\uD1A0\uD53D}.md\uC5D0 Write\uB85C \uC800\uC7A5\uD558\uB77C. \uAE30\uC874 \uD30C\uC77C \uC911 \uAD00\uB828\uB41C \uAC83\uC774 \uC788\uC73C\uBA74 \uC5C5\uB370\uC774\uD2B8\uD558\uACE0, \uC5C6\uC73C\uBA74 \uC0C8 \uD30C\uC77C \uC0DD\uC131. \uC6D0\uBB38: ${userContent}</nexus>`,
          tasksReminder,
          claudeMdNotice
        )
      });
    }
    return;
  }
  const ruleMatch = prompt.match(/\[rule(?::([^\]]+))?\]/i);
  if (ruleMatch) {
    const rawTags = ruleMatch[1];
    const ruleTags = rawTags ? rawTags.split(",").map((t) => t.trim()).filter(Boolean) : null;
    handleRuleMode({ prompt, tasksReminder, claudeMdNotice, ruleTags });
    return;
  }
  if (/\[sync\]/i.test(prompt)) {
    respond({
      continue: true,
      additionalContext: withNotices(
        `<nexus>BLOCKING: Invoke Skill tool with skill="claude-nexus:nx-sync" [before any other action].</nexus>`,
        tasksReminder,
        claudeMdNotice
      )
    });
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
  const summary = readTasksSummary(STATE_ROOT);
  if (summary.exists && summary.pending > 0) {
    respond({
      continue: true,
      additionalContext: withNotices(`<nexus>Active [run] session detected (${summary.pending} pending tasks). Resume execution or use nx_task_close to archive.</nexus>`, tasksReminder, claudeMdNotice, planReminder)
    });
    return;
  }
  if (summary.exists && (summary.allCompleted || summary.total === 0)) {
    respond({
      continue: true,
      additionalContext: withNotices(`<nexus>Stale tasks.json from previous [run]. Call nx_task_close to archive.</nexus>`, tasksReminder, claudeMdNotice, planReminder)
    });
    return;
  }
  const notices = [planReminder, claudeMdNotice].filter(Boolean).join("\n");
  if (notices) {
    respond({ continue: true, additionalContext: notices });
  } else {
    pass();
  }
}
function handleMemoryAccessTracking(event) {
  try {
    if (event.tool_name !== "Read") return;
    const filePath = event.tool_input?.file_path;
    if (!filePath || !filePath.startsWith(MEMORY_ROOT)) return;
    const logPath = (0, import_path3.join)(HARNESS_STATE_ROOT, "memory-access.jsonl");
    const records = /* @__PURE__ */ new Map();
    if ((0, import_fs3.existsSync)(logPath)) {
      const content = (0, import_fs3.readFileSync)(logPath, "utf-8");
      for (const line of content.split("\n")) {
        if (!line) continue;
        try {
          const rec = JSON.parse(line);
          records.set(rec.path, rec);
        } catch {
        }
      }
    }
    const existing = records.get(filePath);
    records.set(filePath, {
      path: filePath,
      last_accessed_ts: (/* @__PURE__ */ new Date()).toISOString(),
      access_count: (existing?.access_count ?? 0) + 1,
      last_agent: event.agent_id ?? "lead"
    });
    ensureDir(HARNESS_STATE_ROOT);
    const output = Array.from(records.values()).map((r) => JSON.stringify(r)).join("\n") + "\n";
    (0, import_fs3.writeFileSync)(logPath, output);
  } catch (e) {
  }
}
function handlePostToolUse(event) {
  handleMemoryAccessTracking(event);
  try {
    const agentId = event.agent_id;
    if (!agentId) return;
    if (!["Edit", "Write", "NotebookEdit"].includes(event.tool_name)) return;
    const filePath = event.tool_name === "NotebookEdit" ? event.tool_input?.notebook_path : event.tool_input?.file_path;
    if (!filePath) return;
    const line = JSON.stringify({
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      agent_id: agentId,
      tool: event.tool_name,
      file: filePath
    }) + "\n";
    (0, import_fs3.appendFileSync)((0, import_path3.join)(HARNESS_STATE_ROOT, "tool-log.jsonl"), line);
  } catch (e) {
  }
}
function handleSessionStart(_event) {
  ensureNexusStructure();
  (0, import_fs3.writeFileSync)((0, import_path3.join)(HARNESS_STATE_ROOT, "agent-tracker.json"), "[]");
  try {
    (0, import_fs3.writeFileSync)((0, import_path3.join)(HARNESS_STATE_ROOT, "tool-log.jsonl"), "");
  } catch (e) {
  }
  pass();
}
function handleSubagentStart(event) {
  const agentType = String(event.agent_type ?? "");
  const agentId = String(event.agent_id ?? "");
  const trackerPath = (0, import_path3.join)(HARNESS_STATE_ROOT, "agent-tracker.json");
  let tracker = [];
  if ((0, import_fs3.existsSync)(trackerPath)) {
    try {
      tracker = JSON.parse((0, import_fs3.readFileSync)(trackerPath, "utf-8"));
    } catch {
    }
  }
  const existingIdx = tracker.findIndex((e) => e.agent_id === agentId);
  if (existingIdx !== -1) {
    const entry = tracker[existingIdx];
    entry.resume_count = (entry.resume_count || 0) + 1;
    entry.last_resumed_at = (/* @__PURE__ */ new Date()).toISOString();
    entry.status = "running";
  } else {
    tracker.push({ harness_id: HARNESS_ID, agent_name: agentType, agent_id: agentId, started_at: (/* @__PURE__ */ new Date()).toISOString(), resume_count: 0, status: "running" });
  }
  ensureDir(HARNESS_STATE_ROOT);
  (0, import_fs3.writeFileSync)(trackerPath, JSON.stringify(tracker, null, 2));
  const role = extractRole(agentType);
  if (role !== null) {
    const index = buildCoreIndex();
    if (index !== "") {
      respond({ continue: true, additionalContext: index });
      return;
    }
  }
  pass();
}
function handleSubagentStop(event) {
  const agentId = String(event.agent_id ?? "");
  const agentType = String(event.agent_type ?? "");
  const lastMsg = String(event.last_assistant_message ?? event.last_message ?? "");
  const trackerPath = (0, import_path3.join)(HARNESS_STATE_ROOT, "agent-tracker.json");
  if ((0, import_fs3.existsSync)(trackerPath)) {
    try {
      const tracker = JSON.parse((0, import_fs3.readFileSync)(trackerPath, "utf-8"));
      const entry = tracker.find((a) => a.agent_id === agentId);
      if (entry) {
        entry.status = "completed";
        entry.last_message = lastMsg;
        entry.stopped_at = (/* @__PURE__ */ new Date()).toISOString();
      }
      try {
        const toolLogPath = (0, import_path3.join)(HARNESS_STATE_ROOT, "tool-log.jsonl");
        if ((0, import_fs3.existsSync)(toolLogPath)) {
          const lines = (0, import_fs3.readFileSync)(toolLogPath, "utf-8").split("\n").filter(Boolean);
          const filesSet = /* @__PURE__ */ new Set();
          for (const line of lines) {
            try {
              const logEntry = JSON.parse(line);
              if (logEntry.agent_id === agentId && logEntry.file) {
                filesSet.add(logEntry.file);
              }
            } catch (e) {
            }
          }
          if (entry) {
            entry.files_touched = Array.from(filesSet);
          }
        }
      } catch (e) {
      }
      (0, import_fs3.writeFileSync)(trackerPath, JSON.stringify(tracker, null, 2));
    } catch {
    }
  }
  const tasksPath = (0, import_path3.join)(STATE_ROOT, "tasks.json");
  if ((0, import_fs3.existsSync)(tasksPath)) {
    try {
      const tasksData = JSON.parse((0, import_fs3.readFileSync)(tasksPath, "utf-8"));
      const tasks = tasksData.tasks ?? [];
      const ownedPending = tasks.filter(
        (t) => t.owner === agentType && (t.status === "pending" || t.status === "in_progress")
      );
      if (ownedPending.length > 0) {
        const ids = ownedPending.map((t) => `#${t.id}`).join(", ");
        respond({
          continue: true,
          additionalContext: `<nexus>Agent "${agentType}" stopped but has ${ownedPending.length} incomplete task(s): ${ids}. Re-spawn the agent or complete the work manually.</nexus>`
        });
        return;
      }
    } catch {
    }
  }
  pass();
}
function handlePostCompact(_event) {
  const lines = ["Session restored after compaction."];
  const summary = readTasksSummary(STATE_ROOT);
  if (summary.exists) {
    lines.push(`[Mode]: run (${summary.pending} pending / ${summary.completed} completed tasks)`);
  }
  const planFilePath = (0, import_path3.join)(STATE_ROOT, "plan.json");
  if ((0, import_fs3.existsSync)(planFilePath)) {
    try {
      const data = JSON.parse((0, import_fs3.readFileSync)(planFilePath, "utf-8"));
      const issues = data.issues ?? [];
      const discussing = issues.find((i) => i.status === "discussing");
      const pending = issues.filter((i) => i.status === "pending");
      let issueInfo;
      if (discussing) {
        issueInfo = `issue #${discussing.id} discussing, ${pending.length > 0 ? `#${pending.map((i) => i.id).join("-#")} pending` : "none pending"}`;
      } else if (pending.length > 0) {
        issueInfo = `#${pending.map((i) => i.id).join("-#")} pending`;
      } else {
        issueInfo = "all issues decided";
      }
      lines.push(`[Plan]: "${data.topic}" \u2014 ${issueInfo}`);
    } catch {
    }
  }
  try {
    const nexusRoot = (0, import_path3.join)(process.cwd(), ".nexus");
    const rulesRoot = (0, import_path3.join)(nexusRoot, "rules");
    const folders = [
      ["memory", MEMORY_ROOT],
      ["context", CONTEXT_ROOT],
      ["rules", rulesRoot]
    ];
    const folderCounts = [];
    let totalFiles = 0;
    for (const [label, folderPath] of folders) {
      if ((0, import_fs3.existsSync)(folderPath)) {
        const count = (0, import_fs3.readdirSync)(folderPath).filter((f) => f.endsWith(".md")).length;
        if (count > 0) {
          folderCounts.push(`${count} ${label}`);
          totalFiles += count;
        }
      }
    }
    if (totalFiles > 0) {
      lines.push(`[Knowledge]: ${folderCounts.join(", ")}`);
    }
  } catch {
  }
  const trackerPath = (0, import_path3.join)(HARNESS_STATE_ROOT, "agent-tracker.json");
  if ((0, import_fs3.existsSync)(trackerPath)) {
    try {
      const tracker = JSON.parse((0, import_fs3.readFileSync)(trackerPath, "utf-8"));
      if (tracker.length > 0) {
        const agentParts = tracker.map((a) => `${a.agent_type ?? "unknown"} (${a.status ?? "unknown"})`);
        lines.push(`[Agents]: ${agentParts.join(", ")}`);
      }
    } catch {
    }
  }
  const snapshot = `<nexus>
${lines.join("\n")}
</nexus>`;
  respond({ continue: true, additionalContext: snapshot });
}
async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const eventName = event.hook_event_name ?? "";
  switch (eventName) {
    case "SessionStart":
      handleSessionStart(event);
      break;
    case "SubagentStart":
      handleSubagentStart(event);
      break;
    case "SubagentStop":
      handleSubagentStop(event);
      break;
    case "PreToolUse":
      handlePreToolUse(event);
      break;
    case "PostToolUse":
      handlePostToolUse(event);
      break;
    case "UserPromptSubmit":
      handleUserPromptSubmit(event);
      break;
    case "Stop":
      handleStop(event);
      break;
    case "PreCompact":
      pass();
      break;
    case "PostCompact":
      handlePostCompact(event);
      break;
    default:
      pass();
  }
}
main().catch(() => {
  respond({ continue: true });
});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  HANDLED_TAG_IDS
});
//# sourceMappingURL=gate.cjs.map
