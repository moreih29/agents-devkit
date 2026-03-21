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
function getBasePhase(sid) {
  const workflowPath = (0, import_path.join)(sessionDir(sid), "workflow.json");
  if (!(0, import_fs.existsSync)(workflowPath)) return null;
  try {
    const state = JSON.parse((0, import_fs.readFileSync)(workflowPath, "utf-8"));
    if (state.mode === "consult") return "exploring";
    if (state.mode === "plan") return "analyzing";
  } catch {
  }
  return null;
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
function normalizeAgentName(name) {
  return name.replace(/^(nexus|claude-nexus):/, "");
}
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
function analyzeCodebase(cwd) {
  let fileCount = 0;
  try {
    const entries = (0, import_fs3.readdirSync)(cwd);
    fileCount = entries.length;
  } catch {
  }
  const has = (names) => names.some((n) => (0, import_fs3.existsSync)((0, import_path3.join)(cwd, n)));
  const hasLinter = has([".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml", "eslint.config.js", "eslint.config.ts", "eslint.config.mjs", ".prettierrc", ".prettierrc.js", ".prettierrc.json", ".prettierrc.yml"]);
  const hasTests = has(["test", "tests", "__tests__", "spec"]);
  const hasCI = has([".github", ".circleci"]);
  const hasSrc = has(["src"]);
  let type;
  let description;
  if (fileCount < 20 && !hasLinter && !hasTests) {
    type = "greenfield";
    description = "Few files, no established patterns yet";
  } else if (hasLinter && hasTests && hasCI) {
    type = "disciplined";
    description = "Has linter, tests, and CI \u2014 follow existing conventions strictly";
  } else if (hasSrc) {
    type = "transitional";
    description = "Has src/ but missing some tooling \u2014 introduce patterns incrementally";
  } else {
    type = "legacy";
    description = "Large codebase without modern tooling \u2014 be conservative with changes";
  }
  return { type, description, hasLinter, hasTests, hasCI, hasSrc, fileCount };
}
function handleSessionStart() {
  cleanupAllSessionStates();
  const sid = createSession();
  const dir = sessionDir(sid);
  ensureDir(dir);
  let branch = "unknown";
  let cwd = process.cwd();
  try {
    branch = (0, import_child_process.execSync)("git rev-parse --abbrev-ref HEAD", { encoding: "utf-8" }).trim();
    cwd = (0, import_child_process.execSync)("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
  } catch {
  }
  const branchDir = branch.replace(/\//g, "--");
  const planDirPath = (0, import_path3.join)(sessionDir(sid), "plans", branchDir);
  const hasPlanDir = (0, import_fs3.existsSync)(planDirPath);
  const planFile = (0, import_path3.join)(planDirPath, "plan.md");
  const hasPlan = (0, import_fs3.existsSync)(planFile);
  const workflowPath = (0, import_path3.join)(sessionDir(sid), "workflow.json");
  const hasWorkflow = (0, import_fs3.existsSync)(workflowPath);
  const profile = analyzeCodebase(cwd);
  try {
    (0, import_fs3.writeFileSync)((0, import_path3.join)(dir, "codebase-profile.json"), JSON.stringify(profile, null, 2));
  } catch {
  }
  const codebaseCtx = `Codebase: ${profile.type}. ${profile.description}`;
  const isMainBranch = branch === "main" || branch === "master";
  if (hasPlanDir && !hasWorkflow && !isMainBranch) {
    respond({
      continue: true,
      additionalContext: `[NEXUS] Session ${sid} started. Branch: ${branch}. Mode: planning. Plan directory found. ${codebaseCtx}
DECISION CAPTURE: You are in multi-turn planning mode. When the user makes decisions (confirmatory expressions like "\uC774\uAC78\uB85C \uD558\uC790", "\uC0AD\uC81C\uD558\uC790", "\uC774\uB807\uAC8C \uBC14\uAFB8\uC790", or [d] tag), record them in .nexus/state/sessions/${sid}/plans/${branchDir}/plan.md under the decisions section.
When the user says "\uAD6C\uD604\uD558\uC790" or requests implementation, generate tasks.json from the accumulated decisions.`
    });
  } else {
    respond({
      continue: true,
      additionalContext: `[NEXUS] Session ${sid} started. Branch: ${branch}. Plan: ${hasPlan ? "found" : "none"}. ${codebaseCtx}`
    });
  }
}
function handleSessionEnd() {
  const sid = getSessionId();
  const summary = generateSessionSummary(sid);
  cleanupSessionState(sid);
  if (summary) {
    respond({ continue: true, additionalContext: summary });
  } else {
    pass();
  }
}
function generateSessionSummary(sid) {
  const dir = sessionDir(sid);
  if (!(0, import_fs3.existsSync)(dir)) return null;
  try {
    const parts = [`Session ${sid} summary:`];
    let hasActivity = false;
    const agentsPath = (0, import_path3.join)(dir, "agents.json");
    if ((0, import_fs3.existsSync)(agentsPath)) {
      const record = JSON.parse((0, import_fs3.readFileSync)(agentsPath, "utf-8"));
      if (record.history.length > 0) {
        hasActivity = true;
        const agentCounts = {};
        for (const h of record.history) agentCounts[h.name] = (agentCounts[h.name] ?? 0) + 1;
        const agentStr = Object.entries(agentCounts).map(([n, c]) => `${n}\xD7${c}`).join(", ");
        parts.push(`Agents: ${record.history.length} total (${agentStr})`);
      }
    }
    const trackerPath = (0, import_path3.join)(dir, "whisper-tracker.json");
    if ((0, import_fs3.existsSync)(trackerPath)) {
      const t = JSON.parse((0, import_fs3.readFileSync)(trackerPath, "utf-8"));
      if (t.toolCallCount > 0) {
        hasActivity = true;
        parts.push(`Tools: ${t.toolCallCount} calls`);
      }
    }
    const sessionFile = (0, import_path3.join)(RUNTIME_ROOT, "state", "current-session.json");
    if ((0, import_fs3.existsSync)(sessionFile)) {
      const sessionData = JSON.parse((0, import_fs3.readFileSync)(sessionFile, "utf-8"));
      if (sessionData.createdAt) {
        const elapsed = Math.floor((Date.now() - new Date(sessionData.createdAt).getTime()) / 1e3);
        const hh = Math.floor(elapsed / 3600);
        const mm = Math.floor(elapsed % 3600 / 60);
        parts.push(`Duration: ${hh > 0 ? `${hh}h${mm}m` : `${mm}m`}`);
      }
    }
    if (!hasActivity) return null;
    return parts.join("\n");
  } catch {
    return null;
  }
}
function cleanupAllSessionStates() {
  const sessionsDir = (0, import_path3.join)(RUNTIME_ROOT, "state", "sessions");
  if (!(0, import_fs3.existsSync)(sessionsDir)) return;
  try {
    const dirs = (0, import_fs3.readdirSync)(sessionsDir);
    for (const dir of dirs) {
      cleanupSessionState(dir);
    }
    if (dirs.length > 10) {
      const sorted = dirs.filter((d) => !d.startsWith("e2e")).map((d) => ({ name: d, mtime: (0, import_fs3.statSync)((0, import_path3.join)(sessionsDir, d)).mtimeMs })).sort((a, b) => b.mtime - a.mtime);
      for (const s of sorted.slice(10)) {
        const sdir = (0, import_path3.join)(sessionsDir, s.name);
        try {
          const files = (0, import_fs3.readdirSync)(sdir);
          if (files.length === 0) {
            (0, import_fs3.rmdirSync)(sdir);
          }
        } catch {
        }
      }
    }
  } catch {
  }
}
function cleanupSessionState(sid) {
  const dir = sessionDir(sid);
  if (!(0, import_fs3.existsSync)(dir)) return;
  try {
    (0, import_fs3.rmSync)(dir, { recursive: true, force: true });
  } catch {
  }
}
function handleSubagentStart(event) {
  const sid = getSessionId();
  if (!sid) {
    pass();
    return;
  }
  const record = loadAgents(sid);
  const name = normalizeAgentName(event.agent_type ?? event.agent_name ?? "unknown");
  record.active.push(name);
  record.history.push({ name, startedAt: (/* @__PURE__ */ new Date()).toISOString() });
  saveAgents(sid, record);
  updateWorkflowPhase(sid, "delegating");
  pass();
}
function handleSubagentStop(event) {
  const sid = getSessionId();
  if (!sid) {
    pass();
    return;
  }
  const record = loadAgents(sid);
  const name = normalizeAgentName(event.agent_type ?? event.agent_name ?? "unknown");
  const idx = record.active.indexOf(name);
  if (idx >= 0) record.active.splice(idx, 1);
  for (let i = record.history.length - 1; i >= 0; i--) {
    if (record.history[i].name === name && !record.history[i].stoppedAt) {
      record.history[i].stoppedAt = (/* @__PURE__ */ new Date()).toISOString();
      break;
    }
  }
  saveAgents(sid, record);
  if (record.active.length === 0) {
    const base = getBasePhase(sid);
    if (base) updateWorkflowPhase(sid, base);
  }
  pass();
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
