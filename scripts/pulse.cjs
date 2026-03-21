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

// src/hooks/pulse.ts
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

// src/hooks/pulse.ts
var import_path3 = require("path");
function loadTracker(sid) {
  const path = (0, import_path3.join)(sessionDir(sid), "whisper-tracker.json");
  if ((0, import_fs3.existsSync)(path)) {
    try {
      return JSON.parse((0, import_fs3.readFileSync)(path, "utf-8"));
    } catch {
    }
  }
  return { injections: {}, toolCallCount: 0 };
}
function saveTracker(sid, tracker) {
  const dir = sessionDir(sid);
  ensureDir(dir);
  (0, import_fs3.writeFileSync)((0, import_path3.join)(dir, "whisper-tracker.json"), JSON.stringify(tracker));
}
var AGENT_CONTEXT_LEVELS = {
  finder: "minimal",
  builder: "standard",
  guard: "standard",
  debugger: "standard",
  architect: "full",
  strategist: "full",
  reviewer: "full",
  analyst: "full",
  tester: "standard",
  writer: "minimal"
};
function getActiveContextLevel(sid) {
  const agentsPath = (0, import_path3.join)(sessionDir(sid), "agents.json");
  if (!(0, import_fs3.existsSync)(agentsPath)) return "standard";
  try {
    const record = JSON.parse((0, import_fs3.readFileSync)(agentsPath, "utf-8"));
    const active = record.active ?? [];
    if (active.length === 0) return "standard";
    let highest = "minimal";
    for (const name of active) {
      const level = AGENT_CONTEXT_LEVELS[name] ?? "standard";
      if (level === "full") return "full";
      if (level === "standard") highest = "standard";
    }
    return highest;
  } catch {
    return "standard";
  }
}
function getDelegationEnforcement() {
  const configPath = (0, import_path3.join)(RUNTIME_ROOT, "config.json");
  if ((0, import_fs3.existsSync)(configPath)) {
    try {
      const config = JSON.parse((0, import_fs3.readFileSync)(configPath, "utf-8"));
      const level = config.delegationEnforcement;
      if (level === "off" || level === "warn" || level === "strict") return level;
    } catch {
    }
  }
  return "warn";
}
var ALLOWED_PATHS = [".nexus/", ".claude/nexus/", ".claude/settings", "CLAUDE.md", "test/"];
function isAllowedPath(filePath) {
  return ALLOWED_PATHS.some((p) => filePath.includes(p));
}
function getCurrentMode(sid) {
  const workflowPath = (0, import_path3.join)(sessionDir(sid), "workflow.json");
  if (!(0, import_fs3.existsSync)(workflowPath)) return null;
  try {
    const state = JSON.parse((0, import_fs3.readFileSync)(workflowPath, "utf-8"));
    return state.mode ?? null;
  } catch {
    return null;
  }
}
function isDelegationEnforcementApplicable(sid) {
  const mode = getCurrentMode(sid);
  if (mode === "auto" || mode === "parallel" || mode === "consult" || mode === "plan") return false;
  return true;
}
var MAX_REPEAT = 1;
var ADAPTIVE_THRESHOLD = 60;
function buildMessages(toolName, hookEvent, sid, toolInput) {
  const messages = [];
  if (hookEvent === "PreToolUse" && toolName === "Bash") {
    messages.push({
      key: "Bash:parallel_reminder",
      priority: "guidance",
      text: "Use parallel execution for independent tasks. Use run_in_background for long operations."
    });
  }
  if (hookEvent === "PreToolUse" && toolName === "Read") {
    messages.push({
      key: "Read:parallel_reminder",
      priority: "guidance",
      text: "Read multiple files in parallel when possible for faster analysis."
    });
  }
  const workflowPath = (0, import_path3.join)(sessionDir(sid), "workflow.json");
  if ((0, import_fs3.existsSync)(workflowPath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(workflowPath, "utf-8"));
      if (state.mode === "auto" && state.nonstop?.active) {
        messages.push({
          key: "workflow:nonstop_active",
          priority: "workflow",
          text: `[NONSTOP ${state.nonstop.iteration ?? 0}/${state.nonstop.max ?? 100}] Auto mode (nonstop) is active. Continue working until the task is complete.`
        });
        if (state.nonstop.iteration >= (state.nonstop.max ?? 100) * 0.8) {
          messages.push({
            key: "recovery:nonstop_limit",
            priority: "safety",
            text: `[WARNING] Nonstop ${state.nonstop.iteration}/${state.nonstop.max}\uC5D0 \uADFC\uC811. \uC791\uC5C5\uC774 \uB9C9\uD600\uC788\uB2E4\uBA74: 1) \uD604\uC7AC \uC811\uADFC \uBC29\uC2DD\uC744 \uC7AC\uAC80\uD1A0\uD558\uC138\uC694. 2) nx_state_clear({ key: "auto" })\uB85C \uD574\uC81C \uD6C4 \uB2E4\uB978 \uC804\uB7B5\uC744 \uC2DC\uB3C4\uD558\uC138\uC694.`
          });
        }
      }
      if (state.mode === "auto" && state.phase) {
        messages.push({
          key: "workflow:pipeline_active",
          priority: "workflow",
          text: `[AUTO stage: ${state.phase}] Auto pipeline is active. Complete the current stage, then advance to the next.`
        });
      }
      if (state.mode === "parallel" && state.parallel) {
        const completed = state.parallel.completedCount ?? 0;
        const total = state.parallel.totalCount ?? 0;
        messages.push({
          key: "workflow:parallel_active",
          priority: "workflow",
          text: `[PARALLEL ${completed}/${total} done] Parallel tasks are active. Ensure all tasks complete before finishing.`
        });
      }
    } catch {
    }
  }
  if (hookEvent === "PreToolUse" && /^(Write|Edit|write|edit)$/.test(toolName)) {
    const enforcement = getDelegationEnforcement();
    if (enforcement !== "off" && isDelegationEnforcementApplicable(sid)) {
      const filePath = toolInput?.file_path ?? "";
      if (filePath && !isAllowedPath(filePath)) {
        messages.push({
          key: "delegation:enforce",
          priority: "safety",
          text: "[NEXUS DELEGATION] You are editing source files directly. Consider delegating to a specialized agent: Builder (implementation), Debugger (bug fixes), Tester (test writing). Use Agent({ subagent_type: 'nexus:<agent>', prompt: '<task>' })."
        });
      }
    }
  }
  return messages;
}
async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hookEvent = event.hook_event_name ?? event.type ?? "";
  const toolName = event.tool_name ?? "";
  const toolInput = event.tool_input ?? void 0;
  const sid = getSessionId();
  const sessDir = sessionDir(sid);
  if (!(0, import_fs3.existsSync)(sessDir)) {
    pass();
    return;
  }
  const tracker = loadTracker(sid);
  const contextLevel = getActiveContextLevel(sid);
  tracker.toolCallCount++;
  const adaptiveMinimal = tracker.toolCallCount > ADAPTIVE_THRESHOLD;
  const messages = buildMessages(toolName, hookEvent, sid, toolInput);
  const workflowMessages = messages.filter((m) => m.priority === "workflow");
  const workflowHash = workflowMessages.map((m) => m.key).sort().join("|");
  const workflowChanged = workflowHash !== (tracker.lastWorkflowHash ?? "");
  if (workflowChanged) tracker.lastWorkflowHash = workflowHash;
  const filtered = [];
  for (const msg of messages) {
    if (adaptiveMinimal && msg.priority !== "safety" && msg.priority !== "workflow") continue;
    if (contextLevel === "minimal" && msg.priority !== "safety" && msg.priority !== "workflow") continue;
    if (msg.priority === "workflow" && !workflowChanged) continue;
    const count = tracker.injections[msg.key] ?? 0;
    if (count >= MAX_REPEAT && msg.key !== "delegation:enforce") continue;
    tracker.injections[msg.key] = count + 1;
    filtered.push(msg.text);
  }
  const PROGRESS_INTERVAL = 20;
  if (tracker.toolCallCount > 0 && tracker.toolCallCount % PROGRESS_INTERVAL === 0) {
    const progressParts = [`[PROGRESS ${tracker.toolCallCount} tools]`];
    try {
      const workflowPath = (0, import_path3.join)(sessionDir(sid), "workflow.json");
      if ((0, import_fs3.existsSync)(workflowPath)) {
        const w = JSON.parse((0, import_fs3.readFileSync)(workflowPath, "utf-8"));
        if (w.mode === "auto") {
          if (w.phase) progressParts.push(`auto: ${w.phase}`);
          if (w.nonstop?.active) progressParts.push(`nonstop: ${w.nonstop.iteration ?? 0}/${w.nonstop.max ?? 100}`);
        } else if (w.mode === "parallel" && w.parallel) {
          progressParts.push(`parallel: ${w.parallel.completedCount ?? 0}/${w.parallel.totalCount ?? 0}`);
        }
      }
    } catch {
    }
    try {
      const agentsPath = (0, import_path3.join)(sessionDir(sid), "agents.json");
      if ((0, import_fs3.existsSync)(agentsPath)) {
        const record = JSON.parse((0, import_fs3.readFileSync)(agentsPath, "utf-8"));
        if (record.history?.length > 0) progressParts.push(`agents: ${record.history.length} spawned`);
      }
    } catch {
    }
    filtered.push(progressParts.join(" | "));
  }
  saveTracker(sid, tracker);
  const hasDelegationWarning = messages.some((m) => m.key === "delegation:enforce");
  if (hasDelegationWarning && getDelegationEnforcement() === "strict") {
    respond({
      decision: "block",
      reason: "[NEXUS] Direct file editing is blocked. Delegate to a specialized agent."
    });
    return;
  }
  if (filtered.length > 0) {
    respond({
      continue: true,
      additionalContext: filtered.join("\n")
    });
  } else {
    pass();
  }
}
main().catch(() => {
  respond({ continue: true });
});
//# sourceMappingURL=pulse.cjs.map
