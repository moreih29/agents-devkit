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

// src/hooks/gate.ts
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

// src/hooks/gate.ts
function handleStop() {
  const sid = getSessionId();
  const sustainPath = statePath(sid, "sustain");
  if ((0, import_fs3.existsSync)(sustainPath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(sustainPath, "utf-8"));
      if (state.active && state.currentIteration < state.maxIterations) {
        respond({
          decision: "block",
          reason: `[SUSTAIN ${state.currentIteration + 1}/${state.maxIterations}] \uC791\uC5C5\uC774 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uACC4\uC18D \uC9C4\uD589\uD558\uC138\uC694.`
        });
        return;
      }
    } catch {
    }
  }
  const pipelinePath = statePath(sid, "pipeline");
  if ((0, import_fs3.existsSync)(pipelinePath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(pipelinePath, "utf-8"));
      if (state.active) {
        respond({
          decision: "block",
          reason: `[PIPELINE stage: ${state.currentStage ?? "?"}] \uD30C\uC774\uD504\uB77C\uC778\uC774 \uC2E4\uD589 \uC911\uC785\uB2C8\uB2E4.`
        });
        return;
      }
    } catch {
    }
  }
  pass();
}
var EXPLICIT_TAGS = {
  sustain: { primitive: "sustain", skill: "lattice:sustain" },
  parallel: { primitive: "parallel", skill: "lattice:parallel" },
  pipeline: { primitive: "pipeline", skill: "lattice:pipeline" }
};
var NATURAL_PATTERNS = [
  {
    patterns: [/\bsustain\b/i, /\bkeep\s+going\b/i, /\bdon'?t\s+stop\b/i, /멈추지\s*마/],
    match: { primitive: "sustain", skill: "lattice:sustain" }
  },
  {
    patterns: [/\bparallel\b/i, /\bconcurrent\b/i, /동시에/, /병렬로/],
    match: { primitive: "parallel", skill: "lattice:parallel" }
  },
  {
    patterns: [/\bpipeline\b/i, /\bauto\b/i, /자동으로/, /순서대로/],
    match: { primitive: "pipeline", skill: "lattice:pipeline" }
  }
];
function detectKeywords(prompt) {
  const tagMatch = prompt.match(/\[(\w+)\]/);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    if (tag in EXPLICIT_TAGS) return EXPLICIT_TAGS[tag];
  }
  for (const { patterns, match } of NATURAL_PATTERNS) {
    if (patterns.some((p) => p.test(prompt))) return match;
  }
  return null;
}
function activatePrimitive(primitive, sid) {
  const dir = sessionDir(sid);
  ensureDir(dir);
  const state = {
    active: true,
    maxIterations: 100,
    currentIteration: 0,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    sessionId: sid
  };
  (0, import_fs3.writeFileSync)(statePath(sid, primitive), JSON.stringify(state, null, 2));
}
function handleUserPromptSubmit(event) {
  const prompt = event.prompt ?? event.user_prompt ?? "";
  if (!prompt) {
    pass();
    return;
  }
  const match = detectKeywords(prompt);
  if (match) {
    const sid = getSessionId();
    activatePrimitive(match.primitive, sid);
    respond({
      continue: true,
      additionalContext: `[LATTICE] ${match.primitive} mode ACTIVATED (session: ${sid}). Do NOT stop until the task is fully complete. When done, call lat_state_clear({ key: "${match.primitive}" }) to deactivate.`
    });
    return;
  }
  pass();
}
async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hasPrompt = "prompt" in event || "user_prompt" in event;
  if (hasPrompt) {
    handleUserPromptSubmit(event);
  } else {
    handleStop();
  }
}
main().catch(() => {
  respond({ continue: true });
});
//# sourceMappingURL=gate.cjs.map
