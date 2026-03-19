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
        state.currentIteration++;
        (0, import_fs3.writeFileSync)(sustainPath, JSON.stringify(state, null, 2));
        respond({
          decision: "block",
          reason: `[SUSTAIN ${state.currentIteration}/${state.maxIterations}] \uC791\uC5C5\uC774 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uACC4\uC18D \uC9C4\uD589\uD558\uC138\uC694. \uC791\uC5C5\uC774 \uC815\uB9D0 \uB05D\uB0AC\uB2E4\uBA74 lat_state_clear({ key: "sustain" })\uB97C \uD638\uCD9C\uD558\uC5EC sustain\uC744 \uD574\uC81C\uD558\uC138\uC694.`
        });
        return;
      }
      if (state.active && state.currentIteration >= state.maxIterations) {
        state.active = false;
        (0, import_fs3.writeFileSync)(sustainPath, JSON.stringify(state, null, 2));
      }
    } catch {
    }
  }
  const pipelinePath = statePath(sid, "pipeline");
  if ((0, import_fs3.existsSync)(pipelinePath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(pipelinePath, "utf-8"));
      if (state.active) {
        const stageInfo = state.currentStage ? `${state.currentStage} (${(state.currentStageIndex ?? 0) + 1}/${state.totalStages ?? "?"})` : "?";
        respond({
          decision: "block",
          reason: `[PIPELINE stage: ${stageInfo}] \uD30C\uC774\uD504\uB77C\uC778\uC774 \uC2E4\uD589 \uC911\uC785\uB2C8\uB2E4. \uD604\uC7AC \uB2E8\uACC4\uB97C \uC644\uB8CC\uD558\uACE0 \uB2E4\uC74C \uB2E8\uACC4\uB85C \uC9C4\uD589\uD558\uC138\uC694.`
        });
        return;
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
        if (total > 0 && completed < total) {
          respond({
            decision: "block",
            reason: `[PARALLEL ${completed}/${total}] \uBCD1\uB82C \uD0DC\uC2A4\uD06C\uAC00 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4. \uBAA8\uB4E0 \uD0DC\uC2A4\uD06C\uAC00 \uC644\uB8CC\uB420 \uB54C\uAE4C\uC9C0 \uACC4\uC18D\uD558\uC138\uC694.`
          });
          return;
        }
      }
    } catch {
    }
  }
  pass();
}
var EXPLICIT_TAGS = {
  sustain: { primitive: "sustain", skill: "lattice:sustain" },
  parallel: { primitive: "parallel", skill: "lattice:parallel" },
  pipeline: { primitive: "pipeline", skill: "lattice:pipeline" },
  cruise: { primitive: "pipeline", skill: "lattice:cruise" }
};
var CRUISE_PATTERNS = [/\bcruise\b/i, /자동으로\s*전부/, /end\s*to\s*end/i];
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
    patterns: [/\bpipeline\b/i, /순서대로/],
    match: { primitive: "pipeline", skill: "lattice:pipeline" }
  }
];
function detectCruise(prompt) {
  const tagMatch = prompt.match(/\[(\w+)\]/);
  if (tagMatch && tagMatch[1].toLowerCase() === "cruise") return true;
  return CRUISE_PATTERNS.some((p) => p.test(prompt));
}
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
  if (detectCruise(prompt)) {
    const sid = getSessionId();
    activatePrimitive("pipeline", sid);
    activatePrimitive("sustain", sid);
    respond({
      continue: true,
      additionalContext: `[LATTICE] cruise mode ACTIVATED (session: ${sid}). Pipeline + Sustain enabled.
Execute these stages IN ORDER:
1. Analyze \u2014 understand the codebase and request
2. Plan \u2014 break into actionable steps
3. Implement \u2014 write code (use parallel Agent calls for independent tasks)
4. Verify \u2014 run tests, type-check
5. Review \u2014 review your own changes for correctness
Update pipeline state with lat_state_write as you progress through stages.
IMPORTANT: Before finishing, call lat_state_clear({ key: "cruise" }) to deactivate all state at once. Do NOT stop without clearing state first.`
    });
    return;
  }
  const match = detectKeywords(prompt);
  if (match) {
    const sid = getSessionId();
    activatePrimitive(match.primitive, sid);
    respond({
      continue: true,
      additionalContext: `[LATTICE] ${match.primitive} mode ACTIVATED (session: ${sid}). Do NOT stop until the task is fully complete. IMPORTANT: Before finishing your response, you MUST call lat_state_clear({ key: "${match.primitive}" }) to deactivate. Do NOT attempt to stop without clearing state first.`
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
