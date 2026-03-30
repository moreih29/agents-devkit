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
var NEXUS_ROOT = process.env.NEXUS_RUNTIME_ROOT || (0, import_path.join)(PROJECT_ROOT, ".nexus");
var CORE_ROOT = (0, import_path.join)(NEXUS_ROOT, "core");
var STATE_ROOT = (0, import_path.join)(NEXUS_ROOT, "state");
function ensureDir(dir) {
  if (!(0, import_fs.existsSync)(dir)) {
    (0, import_fs.mkdirSync)(dir, { recursive: true });
  }
}
function getCurrentBranch() {
  try {
    return (0, import_child_process.execSync)("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {
    try {
      return (0, import_child_process.execSync)("git symbolic-ref --short HEAD", { encoding: "utf8" }).trim();
    } catch {
      return "_default";
    }
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
1. Check decisions.json for prior decisions \u2014 reference relevant IDs in nx_task_add(decisions=[...]).
2. Decompose work into discrete tasks \u2192 call nx_task_add for EACH task.
3. Edit/Write tools are BLOCKED without tasks.json.
4. As each task completes \u2192 nx_task_update(id, "completed").
5. All tasks done \u2192 nx_task_close (archives consult+decisions+tasks \u2192 history.json).`;
function taskPipelineMessage(modeSpecific) {
  return `${modeSpecific}${TASK_PIPELINE}`;
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
  const notifiedFlag = (0, import_path3.join)(NEXUS_ROOT, "claudemd-notified");
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
        return "<nexus>Project CLAUDE.md Nexus section is out of date. Run /claude-nexus:nx-sync to update.</nexus>";
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
  const summary = readTasksSummary(STATE_ROOT);
  if (!summary.exists) {
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
  respond({
    continue: true,
    additionalContext: `<nexus>All ${summary.total} tasks completed. MANDATORY: Call nx_task_close to archive this cycle (consult+decisions+tasks \u2192 history.json) before finishing.</nexus>`
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
  if (toolName === "mcp__plugin_claude-nexus_nx__nx_task_update") {
    const toolInput2 = event.tool_input;
    const taskId = String(toolInput2?.id ?? toolInput2?.task_id ?? "");
    const status = String(toolInput2?.status ?? "");
    if (status === "pending" && taskId) {
      const reopenTrackerPath = (0, import_path3.join)(STATE_ROOT, "reopen-tracker.json");
      let tracker = {};
      if ((0, import_fs3.existsSync)(reopenTrackerPath)) {
        try {
          tracker = JSON.parse((0, import_fs3.readFileSync)(reopenTrackerPath, "utf-8"));
        } catch {
        }
      }
      const count = (tracker[taskId] ?? 0) + 1;
      tracker[taskId] = count;
      ensureDir(STATE_ROOT);
      (0, import_fs3.writeFileSync)(reopenTrackerPath, JSON.stringify(tracker, null, 2));
      if (count >= 5) {
        respond({
          decision: "block",
          reason: `<nexus>Circuit breaker: task "${taskId}" has been reopened ${count} times. BLOCKED. Report to Lead via SendMessage: describe the task, blocking issue, and attempts made.</nexus>`
        });
        return;
      }
      if (count >= 3) {
        respond({
          decision: "approve",
          additionalContext: `<nexus>Warning: task "${taskId}" has been reopened ${count} times. Possible loop detected. Consider reporting to Lead via SendMessage before continuing.</nexus>`
        });
        return;
      }
    }
    pass();
    return;
  }
  if (toolName === "mcp__plugin_claude-nexus_nx__nx_task_close") {
    const editTrackerPath = (0, import_path3.join)(STATE_ROOT, "edit-tracker.json");
    let editTracker = {};
    if ((0, import_fs3.existsSync)(editTrackerPath)) {
      try {
        editTracker = JSON.parse((0, import_fs3.readFileSync)(editTrackerPath, "utf-8"));
      } catch {
      }
    }
    const modifiedFileCount = Object.keys(editTracker).length;
    const agentTrackerPath = (0, import_path3.join)(STATE_ROOT, "agent-tracker.json");
    let hasCheckAgent = false;
    if ((0, import_fs3.existsSync)(agentTrackerPath)) {
      try {
        const agents = JSON.parse((0, import_fs3.readFileSync)(agentTrackerPath, "utf-8"));
        hasCheckAgent = agents.some((a) => {
          const type = String(a.agent_type ?? "").toLowerCase();
          return type.includes("qa") || type.includes("reviewer");
        });
      } catch {
      }
    }
    if (modifiedFileCount >= 3 && !hasCheckAgent) {
      respond({
        decision: "approve",
        additionalContext: `WARNING: ${modifiedFileCount} files were modified but no Check agent (QA/Reviewer) was spawned. QA spawn conditions may apply: 3+ files changed. Consider spawning QA before closing the cycle.`
      });
      return;
    }
    pass();
    return;
  }
  if (toolName === "Edit" || toolName === "Write") {
    const toolInput2 = event.tool_input;
    const filePath = toolInput2?.file_path ?? "";
    if (!isNexusInternalPath(filePath)) {
      const summary = readTasksSummary(STATE_ROOT);
      if (!summary.exists) {
        respond({
          decision: "block",
          reason: "<nexus>No tasks.json found. Register tasks with nx_task_add before editing files. Pipeline: consult \u2192 decisions \u2192 tasks \u2192 execute.</nexus>"
        });
        return;
      }
      if (summary.allCompleted || summary.total === 0) {
        respond({
          decision: "block",
          reason: "<nexus>All tasks completed. Call nx_task_close to archive this cycle.</nexus>"
        });
        return;
      }
      const editTrackerPath = (0, import_path3.join)(STATE_ROOT, "edit-tracker.json");
      let tracker = {};
      if ((0, import_fs3.existsSync)(editTrackerPath)) {
        try {
          tracker = JSON.parse((0, import_fs3.readFileSync)(editTrackerPath, "utf-8"));
        } catch {
        }
      }
      const count = (tracker[filePath] ?? 0) + 1;
      tracker[filePath] = count;
      ensureDir(STATE_ROOT);
      (0, import_fs3.writeFileSync)(editTrackerPath, JSON.stringify(tracker, null, 2));
      if (count >= 5) {
        respond({
          decision: "block",
          reason: `<nexus>Loop detected: "${filePath}" has been modified ${count} times. BLOCKED. Report to Lead via SendMessage: describe the file, error pattern, and approaches tried. Wait for Lead or Architect guidance before continuing.</nexus>`
        });
        return;
      }
      if (count >= 3) {
        respond({
          decision: "approve",
          additionalContext: `<nexus>Warning: "${filePath}" has been modified ${count} times. Possible loop detected. Consider reporting to Lead via SendMessage before continuing. Describe what you're trying to fix and why previous attempts failed.</nexus>`
        });
        return;
      }
    }
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
  pass();
}
var EXPLICIT_TAGS = {
  consult: { primitive: "consult", skill: "claude-nexus:nx-consult" },
  run: { primitive: "run", skill: "claude-nexus:nx-run" }
};
var NATURAL_PATTERNS = [
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: "consult", skill: "claude-nexus:nx-consult" }
  }
];
var ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
var PRIMITIVE_NAMES = /\b(consult|run)\b/i;
function isPrimitiveMention(prompt) {
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  if (/[`"'](?:consult)[`"']/i.test(prompt)) return true;
  return false;
}
function detectKeywords(prompt) {
  const tagMatch = prompt.match(/\[(consult|run)\]/i);
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
function getConsultReminder() {
  const consultPath = (0, import_path3.join)(STATE_ROOT, "consult.json");
  if (!(0, import_fs3.existsSync)(consultPath)) return null;
  try {
    const data = JSON.parse((0, import_fs3.readFileSync)(consultPath, "utf-8"));
    const issues = data.issues ?? [];
    const discussing = issues.find((i) => i.status === "discussing");
    const pending = issues.filter((i) => i.status === "pending");
    const current = discussing ? `Current: #${discussing.id} "${discussing.title}"` : pending.length > 0 ? `Next: #${pending[0].id} "${pending[0].title}"` : "All issues decided.";
    return `<nexus>Consult: "${data.topic}" | ${current} | ${pending.length} pending
Present comparison table with pros/cons/recommendation. Record decisions with [d].</nexus>`;
  } catch {
    return null;
  }
}
function withNotices(base, tasksReminder, claudeMdNotice, consultReminder) {
  return [consultReminder, tasksReminder, base, claudeMdNotice].filter(Boolean).join("\n");
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
function handleConsultMode({ tasksReminder, claudeMdNotice }) {
  const consultFile = (0, import_path3.join)(STATE_ROOT, "consult.json");
  const hasExistingSession = (0, import_fs3.existsSync)(consultFile);
  let base;
  if (hasExistingSession) {
    base = `<nexus>Consult mode \u2014 existing session found.
STEP 1: Check current status with nx_consult_status.
STEP 2: Spawn Explore+researcher in parallel for additional code+external research.
STEP 3: Proceed with discussion based on research results. Do not discuss before research is complete.</nexus>`;
  } else {
    base = `<nexus>Consult mode.
STEP 1: Spawn researcher for code+external research. Run Explore agent in parallel for codebase exploration.
STEP 2: Call nx_consult_start with findings to organize issues.
Do not call nx_consult_start before research is complete.</nexus>`;
  }
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice, null)
  });
}
function handleRunMode({ tasksReminder, claudeMdNotice }) {
  const consultReminder = getConsultReminder();
  const base = `<nexus>Run mode \u2014 full pipeline execution requested.
MANDATORY: Invoke Skill tool with skill="claude-nexus:nx-run" to load the full orchestration pipeline.
Do NOT skip any phases. Do NOT attempt direct execution. Follow nx-run SKILL.md strictly.</nexus>`;
  respond({
    continue: true,
    additionalContext: withNotices(taskPipelineMessage(base), tasksReminder, claudeMdNotice, consultReminder)
  });
}
var PRIMITIVE_HANDLERS = {
  consult: handleConsultMode,
  run: handleRunMode
};
function handleUserPromptSubmit(event) {
  const claudeMdNotice = handleClaudeMdSync();
  const tasksReminder = getTasksReminder();
  const consultReminder = getConsultReminder();
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
2. If the user explicitly requests implementation: nx_task_add (decisions=[] or relevant IDs) \u2192 perform work \u2192 nx_task_close (history archive). Follow this pipeline even for simple edits. Edit/Write will be BLOCKED without tasks.json.`;
    const consultFile = (0, import_path3.join)(STATE_ROOT, "consult.json");
    if ((0, import_fs3.existsSync)(consultFile)) {
      respond({
        continue: true,
        additionalContext: withNotices(`<nexus>Decision tag detected in consult mode. Use nx_consult_decide(issue_id, summary) to record \u2014 updates consult.json + decisions.json simultaneously.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, consultReminder)
      });
    } else {
      respond({
        continue: true,
        additionalContext: withNotices(`<nexus>Decision tag detected. Record this decision using nx_decision_add tool.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, null)
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
  if (!summary.exists) {
    const branchGuard = /^(main|master)$/.test(getCurrentBranch()) ? "\nBranch Guard: You are on main/master. Create a feature branch before making changes." : "";
    respond({
      continue: true,
      additionalContext: withNotices(taskPipelineMessage(`<nexus>No active tasks.${branchGuard}</nexus>`), null, claudeMdNotice, consultReminder)
    });
    return;
  }
  if (summary.pending > 0) {
    respond({
      continue: true,
      additionalContext: withNotices(`<nexus>Existing tasks detected (${summary.pending} pending). Smart resume: Review existing tasks with nx_task_list. For each pending task: verify if already implemented/documented. If stale \u2192 nx_task_close + fresh nx_task_add. If genuine \u2192 continue execution.</nexus>`, tasksReminder, claudeMdNotice, consultReminder)
    });
    return;
  }
  respond({
    continue: true,
    additionalContext: withNotices(`<nexus>Stale tasks.json detected from previous cycle. MANDATORY: Call nx_task_close to archive before starting new work.</nexus>`, tasksReminder, claudeMdNotice, consultReminder)
  });
}
function handleSessionStart(_event) {
  ensureNexusStructure();
  (0, import_fs3.writeFileSync)((0, import_path3.join)(STATE_ROOT, "agent-tracker.json"), "[]");
  respond({
    continue: true,
    additionalContext: "<nexus>Session started.</nexus>"
  });
}
function handleSubagentStart(event) {
  const agentType = String(event.agent_type ?? event.subagent_type ?? "");
  const agentId = String(event.agent_id ?? event.session_id ?? "");
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
  const agentId = String(event.agent_id ?? event.session_id ?? "");
  const lastMsg = String(event.last_message ?? event.stop_reason ?? "");
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
  pass();
}
async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const nexusEvent = process.env.NEXUS_EVENT ?? "";
  if (nexusEvent === "SessionStart") {
    handleSessionStart(event);
    return;
  }
  if (nexusEvent === "SubagentStart") {
    handleSubagentStart(event);
    return;
  }
  if (nexusEvent === "SubagentStop") {
    handleSubagentStop(event);
    return;
  }
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
