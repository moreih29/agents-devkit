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

// src/hooks/tracker.ts
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

// src/hooks/tracker.ts
var import_path3 = require("path");
var import_child_process = require("child_process");
function loadAgents(sid) {
  const path = (0, import_path3.join)(sessionDir(sid), "agents.json");
  if ((0, import_fs3.existsSync)(path)) {
    try {
      return JSON.parse((0, import_fs3.readFileSync)(path, "utf-8"));
    } catch {
    }
  }
  return { active: [], history: [] };
}
function saveAgents(sid, record) {
  const dir = sessionDir(sid);
  ensureDir(dir);
  (0, import_fs3.writeFileSync)((0, import_path3.join)(dir, "agents.json"), JSON.stringify(record, null, 2));
}
function handleSessionStart() {
  cleanupAllSessionStates();
  const sid = createSession();
  const dir = sessionDir(sid);
  ensureDir(dir);
  let branch = "unknown";
  try {
    branch = (0, import_child_process.execSync)("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
  } catch {
  }
  const planFile = (0, import_path3.join)(KNOWLEDGE_ROOT, "plans", `${branch.replace(/\//g, "--")}.md`);
  const hasPlan = (0, import_fs3.existsSync)(planFile);
  const memoPath = (0, import_path3.join)(RUNTIME_ROOT, "memo");
  if ((0, import_fs3.existsSync)(memoPath)) {
    for (const file of (0, import_fs3.readdirSync)(memoPath).filter((f) => f.endsWith(".json"))) {
      try {
        const entry = JSON.parse((0, import_fs3.readFileSync)((0, import_path3.join)(memoPath, file), "utf-8"));
        const ttlMs = entry.ttl === "week" ? 7 * 864e5 : 864e5;
        if (Date.now() - new Date(entry.createdAt).getTime() > ttlMs) {
          (0, import_fs3.unlinkSync)((0, import_path3.join)(memoPath, file));
        }
      } catch {
      }
    }
  }
  const tasksPath = (0, import_path3.join)(KNOWLEDGE_ROOT, "tasks");
  if ((0, import_fs3.existsSync)(tasksPath)) {
    const DONE_TTL = 7 * 864e5;
    for (const file of (0, import_fs3.readdirSync)(tasksPath).filter((f) => f.endsWith(".json"))) {
      try {
        const task = JSON.parse((0, import_fs3.readFileSync)((0, import_path3.join)(tasksPath, file), "utf-8"));
        if (task.status === "done" && task.completedAt) {
          if (Date.now() - new Date(task.completedAt).getTime() > DONE_TTL) {
            (0, import_fs3.unlinkSync)((0, import_path3.join)(tasksPath, file));
          }
        }
      } catch {
      }
    }
  }
  respond({
    continue: true,
    additionalContext: `[LATTICE] Session ${sid} started. Branch: ${branch}. Plan: ${hasPlan ? "found" : "none"}.`
  });
}
function handleSessionEnd() {
  const sid = getSessionId();
  cleanupSessionState(sid);
  pass();
}
function cleanupAllSessionStates() {
  const sessionsDir = (0, import_path3.join)(RUNTIME_ROOT, "state", "sessions");
  if (!(0, import_fs3.existsSync)(sessionsDir)) return;
  try {
    for (const dir of (0, import_fs3.readdirSync)(sessionsDir)) {
      cleanupSessionState(dir);
    }
  } catch {
  }
}
function cleanupSessionState(sid) {
  const dir = sessionDir(sid);
  if (!(0, import_fs3.existsSync)(dir)) return;
  const workflowKeys = ["sustain", "pipeline", "parallel"];
  for (const key of workflowKeys) {
    const path = (0, import_path3.join)(dir, `${key}.json`);
    if ((0, import_fs3.existsSync)(path)) {
      try {
        (0, import_fs3.unlinkSync)(path);
      } catch {
      }
    }
  }
}
function handleSubagentStart(event) {
  const sid = getSessionId();
  const record = loadAgents(sid);
  const name = event.agent_name ?? "unknown";
  if (!record.active.includes(name)) {
    record.active.push(name);
  }
  record.history.push({ name, startedAt: (/* @__PURE__ */ new Date()).toISOString() });
  saveAgents(sid, record);
  pass();
}
function handleSubagentStop(event) {
  const sid = getSessionId();
  const record = loadAgents(sid);
  const name = event.agent_name ?? "unknown";
  record.active = record.active.filter((a) => a !== name);
  for (let i = record.history.length - 1; i >= 0; i--) {
    if (record.history[i].name === name && !record.history[i].stoppedAt) {
      record.history[i].stoppedAt = (/* @__PURE__ */ new Date()).toISOString();
      break;
    }
  }
  saveAgents(sid, record);
  updateParallelOnAgentStop(sid, name);
  pass();
}
function updateParallelOnAgentStop(sid, agentName) {
  const path = (0, import_path3.join)(sessionDir(sid), "parallel.json");
  if (!(0, import_fs3.existsSync)(path)) return;
  try {
    const state = JSON.parse((0, import_fs3.readFileSync)(path, "utf-8"));
    if (!state.active || !Array.isArray(state.tasks)) return;
    let updated = false;
    for (const task of state.tasks) {
      if (task.agent === agentName && task.status === "running") {
        task.status = "done";
        updated = true;
        break;
      }
    }
    if (updated) {
      state.completedCount = state.tasks.filter((t) => t.status === "done").length;
      (0, import_fs3.writeFileSync)(path, JSON.stringify(state, null, 2));
      if (state.completedCount >= state.totalCount && state.totalCount > 0) {
        try {
          (0, import_fs3.unlinkSync)(path);
        } catch {
        }
      }
    }
  } catch {
  }
}
async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hookEvent = event.hook_event_name ?? event.type ?? "";
  switch (hookEvent) {
    case "SessionStart":
      handleSessionStart();
      break;
    case "SessionEnd":
      handleSessionEnd();
      break;
    case "SubagentStart":
      handleSubagentStart(event);
      break;
    case "SubagentStop":
      handleSubagentStop(event);
      break;
    default:
      pass();
  }
}
main().catch(() => {
  respond({ continue: true });
});
//# sourceMappingURL=tracker.cjs.map
