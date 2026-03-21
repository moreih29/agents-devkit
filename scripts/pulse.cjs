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
function isContext7Available() {
  const paths = [
    (0, import_path3.join)(process.cwd(), ".claude", "settings.json"),
    (0, import_path3.join)(process.env.HOME || "~", ".claude", "settings.json")
  ];
  for (const p of paths) {
    try {
      if ((0, import_fs3.existsSync)(p)) {
        const settings = JSON.parse((0, import_fs3.readFileSync)(p, "utf-8"));
        if (settings.enabledPlugins?.["context7@claude-plugins-official"] === true) return true;
      }
    } catch {
    }
  }
  return false;
}
var _context7Cached = null;
function hasContext7() {
  if (_context7Cached === null) _context7Cached = isContext7Available();
  return _context7Cached;
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
  if (hookEvent === "PreToolUse" && toolName === "Agent") {
    messages.push({
      key: "Agent:six_section_format",
      priority: "guidance",
      text: `[NEXUS DELEGATION FORMAT] Structure your agent prompt with these 6 sections:
1. TASK: Exact work item
2. EXPECTED OUTCOME: Files changed, behavior verified
3. REQUIRED TOOLS: Tools the agent should use
4. MUST DO: Mandatory requirements
5. MUST NOT DO: Prohibited actions
6. CONTEXT: Background info, dependencies, related files`
    });
    if (hasContext7()) {
      messages.push({
        key: "Agent:context7_hint",
        priority: "guidance",
        text: "[CONTEXT7] Library docs available via MCP: resolve-library-id \u2192 query-docs. Use when working with external libraries/frameworks to check up-to-date API usage, examples, and best practices."
      });
    }
  }
  const workflowPath = (0, import_path3.join)(sessionDir(sid), "workflow.json");
  if ((0, import_fs3.existsSync)(workflowPath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(workflowPath, "utf-8"));
      if (Array.isArray(state.failures) && state.failures.length > 0) {
        const count = state.failures.length;
        if (count < 3) {
          messages.push({
            key: "recovery:failure_detected",
            priority: "workflow",
            text: `[RECOVERY ${count}/3] Previous attempt failed. Analyze the failure, adjust approach, and retry. After 3 failures, stop and report to user.`
          });
        } else {
          messages.push({
            key: "recovery:max_failures",
            priority: "safety",
            text: `[RECOVERY ${count}/3] Maximum retry limit reached. STOP retrying. Report failures to the user and ask for guidance.`
          });
        }
      }
    } catch {
    }
  }
  if (hookEvent === "PreToolUse" && /^(Write|Edit|write|edit)$/.test(toolName)) {
    const enforcement = getDelegationEnforcement();
    if (enforcement !== "off") {
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
  if (hookEvent === "PreToolUse" && toolName === "AskUserQuestion") {
    updateWorkflowPhase(sid, "waiting");
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
