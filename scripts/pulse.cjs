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
function statePath(sessionId, key) {
  return (0, import_path.join)(sessionDir(sessionId), `${key}.json`);
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
  lead: "full",
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
var MAX_REPEAT = 1;
var ADAPTIVE_THRESHOLD = 60;
function buildMessages(toolName, hookEvent, sid) {
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
  const sustainPath = statePath(sid, "nonstop");
  if ((0, import_fs3.existsSync)(sustainPath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(sustainPath, "utf-8"));
      if (state.active) {
        messages.push({
          key: "workflow:sustain_active",
          priority: "workflow",
          text: `[SUSTAIN ${state.currentIteration ?? 0}/${state.maxIterations ?? 100}] Nonstop mode is active. Continue working until the task is complete.`
        });
      }
    } catch {
    }
  }
  const pipelinePath = statePath(sid, "pipeline");
  if ((0, import_fs3.existsSync)(pipelinePath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(pipelinePath, "utf-8"));
      if (state.active) {
        const stageInfo = state.currentStage ? `${state.currentStage} (${(state.currentStageIndex ?? 0) + 1}/${state.totalStages ?? "?"})` : "initializing";
        messages.push({
          key: "workflow:pipeline_active",
          priority: "workflow",
          text: `[PIPELINE stage: ${stageInfo}] Pipeline is active. Complete the current stage, then advance to the next.`
        });
      }
    } catch {
    }
  }
  const parallelPath = statePath(sid, "parallel");
  if ((0, import_fs3.existsSync)(parallelPath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(parallelPath, "utf-8"));
      if (state.active) {
        const completed = state.completedCount ?? 0;
        const total = state.totalCount ?? 0;
        messages.push({
          key: "workflow:parallel_active",
          priority: "workflow",
          text: `[PARALLEL ${completed}/${total} done] Parallel tasks are active. Ensure all tasks complete before finishing.`
        });
      }
    } catch {
    }
  }
  if ((0, import_fs3.existsSync)(sustainPath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(sustainPath, "utf-8"));
      if (state.active && state.currentIteration >= (state.maxIterations ?? 100) * 0.8) {
        messages.push({
          key: "recovery:sustain_limit",
          priority: "safety",
          text: `[WARNING] Nonstop iteration ${state.currentIteration}/${state.maxIterations}\uC5D0 \uADFC\uC811. \uC791\uC5C5\uC774 \uB9C9\uD600\uC788\uB2E4\uBA74: 1) \uD604\uC7AC \uC811\uADFC \uBC29\uC2DD\uC744 \uC7AC\uAC80\uD1A0\uD558\uC138\uC694. 2) nx_state_clear({ key: "nonstop" })\uB85C \uD574\uC81C \uD6C4 \uB2E4\uB978 \uC804\uB7B5\uC744 \uC2DC\uB3C4\uD558\uC138\uC694.`
        });
      }
    } catch {
    }
  }
  if ((0, import_fs3.existsSync)(pipelinePath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(pipelinePath, "utf-8"));
      if (state.active && state.currentIteration >= 10) {
        messages.push({
          key: "recovery:pipeline_stuck",
          priority: "safety",
          text: `[WARNING] Pipeline "${state.currentStage ?? "unknown"}" \uB2E8\uACC4\uC5D0\uC11C ${state.currentIteration}\uD68C \uBC18\uBCF5 \uC911. \uB9C9\uD600\uC788\uB2E4\uBA74: 1) \uD604\uC7AC \uB2E8\uACC4\uB97C skip\uD558\uACE0 \uB2E4\uC74C\uC73C\uB85C \uC9C4\uD589\uD558\uC138\uC694. 2) nx_state_clear({ key: "pipeline" })\uB85C \uD574\uC81C\uD558\uC138\uC694.`
        });
      }
    } catch {
    }
  }
  return messages;
}
async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hookEvent = event.hook_event_name ?? event.type ?? "";
  const toolName = event.tool_name ?? "";
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
  const messages = buildMessages(toolName, hookEvent, sid);
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
    if (count >= MAX_REPEAT) continue;
    tracker.injections[msg.key] = count + 1;
    filtered.push(msg.text);
  }
  const PROGRESS_INTERVAL = 20;
  if (tracker.toolCallCount > 0 && tracker.toolCallCount % PROGRESS_INTERVAL === 0) {
    const progressParts = [`[PROGRESS ${tracker.toolCallCount} tools]`];
    try {
      const sustainP = statePath(sid, "nonstop");
      const pipelineP = statePath(sid, "pipeline");
      if ((0, import_fs3.existsSync)(pipelineP) && (0, import_fs3.existsSync)(sustainP)) {
        const p = JSON.parse((0, import_fs3.readFileSync)(pipelineP, "utf-8"));
        if (p.active && p.currentStage) progressParts.push(`auto: ${p.currentStage} ${(p.currentStageIndex ?? 0) + 1}/${p.totalStages ?? "?"}`);
      } else if ((0, import_fs3.existsSync)(sustainP)) {
        const s = JSON.parse((0, import_fs3.readFileSync)(sustainP, "utf-8"));
        if (s.active) progressParts.push(`nonstop: ${s.currentIteration ?? 0}/${s.maxIterations ?? 100}`);
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
