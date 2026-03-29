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
  const summary = readTasksSummary(STATE_ROOT);
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
          reason: `[NEXUS] Circuit breaker: task "${taskId}" has been reopened ${count} times. BLOCKED. Report to Lead via SendMessage: describe the task, blocking issue, and attempts made.`
        });
        return;
      }
      if (count >= 3) {
        respond({
          decision: "approve",
          additionalContext: `[NEXUS] Warning: task "${taskId}" has been reopened ${count} times. Possible loop detected. Consider reporting to Lead via SendMessage before continuing.`
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
          reason: `[NEXUS] Loop detected: "${filePath}" has been modified ${count} times. BLOCKED. Report to Lead via SendMessage: describe the file, error pattern, and approaches tried. Wait for Lead or Architect guidance before continuing.`
        });
        return;
      }
      if (count >= 3) {
        respond({
          decision: "approve",
          additionalContext: `[NEXUS] Warning: "${filePath}" has been modified ${count} times. Possible loop detected. Consider reporting to Lead via SendMessage before continuing. Describe what you're trying to fix and why previous attempts failed.`
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
    return `[NEXUS] ${summary.pending} pending tasks. Complete work \u2192 nx_task_update(id, "completed") for each done task. Archive with nx_task_close when all complete.`;
  }
  return `[NEXUS] All ${summary.total} tasks completed but not archived. MANDATORY: Call nx_task_close to archive this cycle.`;
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
    return `[NEXUS] Consult: "${data.topic}" | ${current} | ${pending.length} pending
Present comparison table with pros/cons/recommendation. Record decisions with [d].`;
  } catch {
    return null;
  }
}
function withNotices(base, tasksReminder, claudeMdNotice, consultReminder) {
  return [consultReminder, tasksReminder, base, claudeMdNotice].filter(Boolean).join("\n");
}
function handleRuleMode({ tasksReminder, claudeMdNotice, ruleTags }) {
  const tagInfo = ruleTags ? `Tags: [${ruleTags.join(", ")}] \u2014 \uADDC\uCE59 \uD30C\uC77C \uC0C1\uB2E8\uC5D0 <!-- tags: ${ruleTags.join(", ")} --> \uD615\uC2DD\uC73C\uB85C \uD3EC\uD568.` : "Tags: \uC5C6\uC74C \u2014 \uADDC\uCE59 \uB0B4\uC6A9\uC5D0 \uB9DE\uB294 \uC801\uC808\uD55C \uD0DC\uADF8\uB97C \uD310\uB2E8\uD558\uC5EC \uCD94\uAC00.";
  const base = `[NEXUS] Rule mode \u2014 \uC0AC\uC6A9\uC790 \uC9C0\uC2DC\uB97C \uD504\uB85C\uC81D\uD2B8 \uADDC\uCE59\uC73C\uB85C \uC800\uC7A5.
${tagInfo}
1. \uC0AC\uC6A9\uC790 \uBA54\uC2DC\uC9C0\uC5D0\uC11C \uADDC\uCE59 \uB0B4\uC6A9 \uCD94\uCD9C/\uC815\uB9AC.
2. nx_rules_write(name, content)\uB85C .nexus/rules/{name}.md\uC5D0 \uC800\uC7A5.
\uADDC\uCE59\uC740 git-tracked\uC774\uBA70 nx_briefing\uC758 hint \uD0DC\uADF8 \uD544\uD130\uB9C1\uC73C\uB85C \uC5D0\uC774\uC804\uD2B8\uC5D0\uAC8C \uC790\uB3D9 \uC804\uB2EC\uB429\uB2C8\uB2E4.
Task pipeline \uBD88\uD544\uC694 \u2014 \uC9C1\uC811 \uC800\uC7A5\uD558\uC138\uC694.`;
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
    base = `[NEXUS] Consult mode \u2014 \uAE30\uC874 \uC138\uC158 \uBC1C\uACAC.
STEP 1: nx_consult_status\uB85C \uD604\uC7AC \uC0C1\uD0DC \uD655\uC778.
STEP 2: Explore+researcher \uBCD1\uB82C \uC2A4\uD3F0\uD558\uC5EC \uCF54\uB4DC+\uC678\uBD80 \uCD94\uAC00 \uD0D0\uC0C9.
STEP 3: \uC870\uC0AC \uACB0\uACFC \uBC14\uD0D5\uC73C\uB85C \uB17C\uC758 \uC9C4\uD589. \uC870\uC0AC \uC644\uB8CC \uC804 \uAE08\uC9C0.`;
  } else {
    base = `[NEXUS] Consult mode.
STEP 1: researcher \uC2A4\uD3F0\uD558\uC5EC \uCF54\uB4DC+\uC678\uBD80 \uD0D0\uC0C9. Explore agent\uB85C \uCF54\uB4DC\uBCA0\uC774\uC2A4 \uD0D0\uC0C9 \uBCD1\uD589.
STEP 2: \uC870\uC0AC \uACB0\uACFC \uBC14\uD0D5\uC73C\uB85C nx_consult_start \uD638\uCD9C\uD558\uC5EC \uC774\uC288 \uC815\uB9AC.
\uC870\uC0AC \uC644\uB8CC \uC804 nx_consult_start \uD638\uCD9C \uAE08\uC9C0.`;
  }
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice, null)
  });
}
function handleRunMode({ tasksReminder, claudeMdNotice }) {
  const consultReminder = getConsultReminder();
  const base = `[NEXUS] Run mode \u2014 full pipeline execution requested.
MANDATORY: Invoke Skill tool with skill="claude-nexus:nx-run" to load the full orchestration pipeline.
Do NOT skip any phases. Do NOT attempt direct execution. Follow nx-run SKILL.md strictly.`;
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
        additionalContext: withNotices(`[NEXUS] Decision tag detected in consult mode. Use nx_consult_decide(issue_id, summary) to record \u2014 updates consult.json + decisions.json simultaneously.${postDecisionRules}`, tasksReminder, claudeMdNotice, consultReminder)
      });
    } else {
      respond({
        continue: true,
        additionalContext: withNotices(`[NEXUS] Decision tag detected. Record this decision using nx_decision_add tool.${postDecisionRules}`, tasksReminder, claudeMdNotice, null)
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
    const BUG_FIX_PATTERN = /안\s*된다|안\s*돼|안\s*되|버그|에러|오류|수정해|고쳐|고장|fix\b|bug\b|error\b|broken|not\s+work/i;
    const isBugFix = BUG_FIX_PATTERN.test(prompt);
    let orchestrationHint;
    if (isBugFix) {
      orchestrationHint = `[NEXUS] Bug/fix request detected \u2014 investigation required.
SOLO ROUTE FORBIDDEN: Lead must NOT attempt direct file modifications for bug/fix requests.
1. Spawn How agent (Architect) to diagnose root cause.
2. After diagnosis, register tasks via nx_task_add.
3. Dispatch Do agent (Engineer) for implementation.
Repeated solo attempts without diagnosis waste cycles. Escalate immediately.${branchGuard}`;
    } else {
      orchestrationHint = `[NEXUS] No active tasks. Refer to nx-run SKILL.md for orchestration guidance.
- Direct execution only if ALL 3 conditions met: exact change instruction + single file + no code structure understanding needed.
- Otherwise: spawn How agent (Architect/Postdoc/Strategist) for design consultation, then Do agents for execution.${branchGuard}
IMPORTANT: For multi-file or complex tasks, Lead creates tasks via nx_task_add after consulting How agents. Spawn How agents first for design before dispatching Do agents.`;
    }
    respond({
      continue: true,
      additionalContext: withNotices(taskPipelineMessage(orchestrationHint), null, claudeMdNotice, consultReminder)
    });
    return;
  }
  if (summary.pending > 0) {
    respond({
      continue: true,
      additionalContext: withNotices(`[NEXUS] Existing tasks detected (${summary.pending} pending). Smart resume: Review existing tasks with nx_task_list. For each pending task: verify if already implemented/documented. If stale \u2192 nx_task_close + fresh nx_task_add. If genuine \u2192 continue execution.`, tasksReminder, claudeMdNotice, consultReminder)
    });
    return;
  }
  respond({
    continue: true,
    additionalContext: withNotices(`[NEXUS] Stale tasks.json detected from previous cycle. MANDATORY: Call nx_task_close to archive before starting new work.`, tasksReminder, claudeMdNotice, consultReminder)
  });
}
function handleSessionStart(_event) {
  ensureNexusStructure();
  (0, import_fs3.writeFileSync)((0, import_path3.join)(STATE_ROOT, "agent-tracker.json"), "[]");
  respond({
    continue: true,
    additionalContext: "[NEXUS] Session started."
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
