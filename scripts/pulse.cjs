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
var RUNTIME_ROOT = (0, import_path.join)(PROJECT_ROOT, ".lattice");
var KNOWLEDGE_ROOT = (0, import_path.join)(PROJECT_ROOT, ".claude", "lattice");
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
var MAX_REPEAT = 3;
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
  const sustainPath = statePath(sid, "sustain");
  if ((0, import_fs3.existsSync)(sustainPath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(sustainPath, "utf-8"));
      if (state.active) {
        messages.push({
          key: "workflow:sustain_active",
          priority: "workflow",
          text: `[SUSTAIN ${state.currentIteration ?? 0}/${state.maxIterations ?? 100}] Sustain mode is active. Continue working until the task is complete.`
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
  return messages;
}
async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hookEvent = event.hook_event_name ?? event.type ?? "";
  const toolName = event.tool_name ?? "";
  const sid = getSessionId();
  const tracker = loadTracker(sid);
  tracker.toolCallCount++;
  const minimalMode = tracker.toolCallCount > ADAPTIVE_THRESHOLD;
  const messages = buildMessages(toolName, hookEvent, sid);
  const filtered = [];
  for (const msg of messages) {
    if (minimalMode && msg.priority !== "safety" && msg.priority !== "workflow") continue;
    const count = tracker.injections[msg.key] ?? 0;
    if (count >= MAX_REPEAT) continue;
    tracker.injections[msg.key] = count + 1;
    filtered.push(msg.text);
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
