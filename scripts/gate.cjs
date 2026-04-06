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
var CORE_ROOT = (0, import_path.join)(NEXUS_ROOT, "core");
var STATE_ROOT = (0, import_path.join)(NEXUS_ROOT, "state");
function ensureDir(dir) {
  if (!(0, import_fs.existsSync)(dir)) {
    (0, import_fs.mkdirSync)(dir, { recursive: true });
  }
}
var GITIGNORE_CONTENT = `# Nexus: whitelist tracked files, ignore everything else
*
!.gitignore
!core/
!core/**
!config.json
!history.json
!rules/
!rules/**
`;
function ensureNexusStructure() {
  ensureDir(NEXUS_ROOT);
  ensureDir(STATE_ROOT);
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
  if (/[\\/]\.nexus[\\/]config\.json$/.test(filePath)) return true;
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
var EXPLICIT_TAGS = {
  plan: { primitive: "plan", skill: "claude-nexus:nx-plan" },
  "plan:auto": { primitive: "plan", skill: "claude-nexus:nx-plan" },
  run: { primitive: "run", skill: "claude-nexus:nx-run" }
};
var NATURAL_PATTERNS = [
  {
    patterns: [
      /\bplan\b/i,
      /계획/,
      /설계/,
      /분석해/,
      /검토해/,
      /어떻게\s*하면\s*좋을까/,
      /뭐가\s*좋을까/,
      /방법을?\s*찾아/
    ],
    match: { primitive: "plan", skill: "claude-nexus:nx-plan" }
  }
];
var ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
var PRIMITIVE_NAMES = /\b(plan|run)\b/i;
function isPrimitiveMention(prompt) {
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  if (/[`"'](?:plan)[`"']/i.test(prompt)) return true;
  return false;
}
function detectKeywords(prompt) {
  const tagMatch = prompt.match(/\[(plan(?::auto)?|run)\]/i);
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
var CORE_LAYERS = ["identity", "codebase", "reference", "memory"];
function buildCoreIndex() {
  const coreRoot = (0, import_path3.join)(process.cwd(), ".nexus", "core");
  if (!(0, import_fs3.existsSync)(coreRoot)) return "";
  const layerLines = [];
  for (const layer of CORE_LAYERS) {
    const layerDir = (0, import_path3.join)(coreRoot, layer);
    if (!(0, import_fs3.existsSync)(layerDir)) continue;
    let files;
    try {
      files = (0, import_fs3.readdirSync)(layerDir).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }
    if (files.length === 0) continue;
    const entries = [];
    for (const file of files) {
      const name = (0, import_path3.basename)(file, ".md");
      const filePath = (0, import_path3.join)(layerDir, file);
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
    layerLines.push(`${layer}: ${entries.join(", ")}`);
  }
  if (layerLines.length === 0) return "";
  const header = "[Core Knowledge] (call nx_core_read for details)";
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
2. Save to .nexus/rules/{name}.md via nx_rules_write(name, content).
Rules are git-tracked and auto-delivered to agents via nx_briefing hint tag filtering.
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
  let base;
  if (hasExistingSession) {
    base = `<nexus>Plan mode \u2014 existing session found.
STEP 1: Check current status with nx_plan_status.
STEP 2: Spawn Explore+researcher subagents in parallel for additional code+external research.
STEP 3: Lead synthesizes multi-perspective analysis based on research results. Spawn HOW subagents (architect, strategist, etc.) for independent analysis if needed.
STEP 4: Present comparison table with pros/cons/recommendation. Record decisions with [d].</nexus>`;
  } else {
    base = `<nexus>Plan mode.
STEP 1: Spawn researcher+Explore subagents in parallel for code+external research.
STEP 2: Call nx_plan_start with findings to organize issues.
Do not call nx_plan_start before research is complete.
STEP 3: Lead synthesizes multi-perspective analysis. Spawn HOW subagents for independent analysis if complex.
STEP 4: Present comparison table \u2192 user decides \u2192 [d] to record. Suggest follow-up issues if decisions create new questions.</nexus>`;
  }
  if (isAuto) {
    base += "\n<nexus>AUTO MODE: Skip user confirmation. For each issue, select the recommended option and decide automatically. Output plan document (tasks.json) directly.</nexus>";
  }
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
  const coreIndex = buildCoreIndex();
  const coreSection = coreIndex ? `
${coreIndex}` : "";
  const base = `<nexus>Run mode \u2014 full pipeline execution requested.
MANDATORY: Invoke Skill tool with skill="claude-nexus:nx-run" to load the full orchestration pipeline.
Do NOT skip any phases. Do NOT attempt direct execution. Follow nx-run SKILL.md strictly.
For multi-task work, spawn subagents in parallel (one per task). Do NOT handle multi-task work as Lead solo.</nexus>${coreSection}`;
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
        additionalContext: withNotices(`<nexus>Decision tag detected in plan mode. Use nx_plan_decide(issue_id, summary) to record.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, planReminder)
      });
    } else {
      respond({
        continue: true,
        additionalContext: withNotices(`<nexus>[d]\uB294 plan \uC138\uC158 \uC548\uC5D0\uC11C\uB9CC \uC720\uD6A8\uD569\uB2C8\uB2E4. [plan] \uD0DC\uADF8\uB85C \uD50C\uB798\uB2DD\uC744 \uBA3C\uC800 \uC2DC\uC791\uD558\uC138\uC694.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, null)
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
function handleSessionStart(_event) {
  ensureNexusStructure();
  (0, import_fs3.writeFileSync)((0, import_path3.join)(STATE_ROOT, "agent-tracker.json"), "[]");
  pass();
}
function handleSubagentStart(event) {
  const agentType = String(event.agent_type ?? "");
  const agentId = String(event.agent_id ?? "");
  const trackerPath = (0, import_path3.join)(STATE_ROOT, "agent-tracker.json");
  let tracker = [];
  if ((0, import_fs3.existsSync)(trackerPath)) {
    try {
      tracker = JSON.parse((0, import_fs3.readFileSync)(trackerPath, "utf-8"));
    } catch {
    }
  }
  tracker.push({ agent_type: agentType, agent_id: agentId, started_at: (/* @__PURE__ */ new Date()).toISOString(), status: "running" });
  ensureDir(STATE_ROOT);
  (0, import_fs3.writeFileSync)(trackerPath, JSON.stringify(tracker, null, 2));
  pass();
}
function handleSubagentStop(event) {
  const agentId = String(event.agent_id ?? "");
  const agentType = String(event.agent_type ?? "");
  const lastMsg = String(event.last_assistant_message ?? event.last_message ?? "");
  const trackerPath = (0, import_path3.join)(STATE_ROOT, "agent-tracker.json");
  if ((0, import_fs3.existsSync)(trackerPath)) {
    try {
      const tracker = JSON.parse((0, import_fs3.readFileSync)(trackerPath, "utf-8"));
      const entry = tracker.find((a) => a.agent_id === agentId);
      if (entry) {
        entry.status = "completed";
        entry.last_message = lastMsg;
        entry.stopped_at = (/* @__PURE__ */ new Date()).toISOString();
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
  const coreRoot = (0, import_path3.join)(process.cwd(), ".nexus", "core");
  if ((0, import_fs3.existsSync)(coreRoot)) {
    try {
      let totalFiles = 0;
      for (const layer of CORE_LAYERS) {
        const layerDir = (0, import_path3.join)(coreRoot, layer);
        if ((0, import_fs3.existsSync)(layerDir)) {
          totalFiles += (0, import_fs3.readdirSync)(layerDir).filter((f) => f.endsWith(".md")).length;
        }
      }
      if (totalFiles > 0) {
        lines.push(`[Core]: ${totalFiles} files across ${CORE_LAYERS.length} layers`);
      }
    } catch {
    }
  }
  const trackerPath = (0, import_path3.join)(STATE_ROOT, "agent-tracker.json");
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
//# sourceMappingURL=gate.cjs.map
