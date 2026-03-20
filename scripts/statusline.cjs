#!/usr/bin/env node
"use strict";

// src/statusline/statusline.ts
var import_fs = require("fs");
var import_path = require("path");
var import_child_process = require("child_process");
var input = "";
try {
  input = (0, import_fs.readFileSync)(0, "utf-8");
} catch {
}
function getVal(key) {
  const m = input.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, ""));
  return m ? m[1] : "";
}
function getNum(key) {
  const m = input.match(new RegExp(`"${key}"\\s*:\\s*([0-9.]+)`, ""));
  return m ? parseFloat(m[1]) : 0;
}
function findProjectRoot() {
  const cwd = getVal("cwd") || process.cwd();
  let dir = cwd;
  while (dir !== "/") {
    if ((0, import_fs.existsSync)((0, import_path.join)(dir, ".git"))) return dir;
    dir = (0, import_path.join)(dir, "..");
  }
  return cwd;
}
var PROJECT_ROOT = findProjectRoot();
var RUNTIME_ROOT = (0, import_path.join)(PROJECT_ROOT, ".lattice");
var KNOWLEDGE_ROOT = (0, import_path.join)(PROJECT_ROOT, ".claude", "lattice");
function getPreset() {
  const env = process.env.LATTICE_STATUSLINE;
  if (env === "minimal" || env === "standard" || env === "full") return env;
  const presetFile = (0, import_path.join)(RUNTIME_ROOT, "statusline-preset.json");
  if ((0, import_fs.existsSync)(presetFile)) {
    try {
      const data = JSON.parse((0, import_fs.readFileSync)(presetFile, "utf-8"));
      if (data.preset === "minimal" || data.preset === "standard" || data.preset === "full") return data.preset;
    } catch {
    }
  }
  return "standard";
}
var RESET = "\x1B[0m";
var BOLD = "\x1B[1m";
var DIM = "\x1B[2m";
var SEP = `${DIM}\u2502${RESET}`;
var MODEL_COLORS = {
  opus: "\x1B[38;5;168m",
  sonnet: "\x1B[38;5;108m",
  haiku: "\x1B[38;5;67m"
};
function getColor(pct) {
  if (pct > 90) return "\x1B[31m";
  if (pct > 75) return "\x1B[38;5;208m";
  if (pct > 50) return "\x1B[33m";
  return "\x1B[32m";
}
function makeBar(pct, width) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round(clamped * width / 100);
  return "\u2588".repeat(filled) + "\u2591".repeat(Math.max(0, width - filled));
}
function coloredMeter(label, pct, width) {
  const color = getColor(pct);
  const bar = makeBar(pct, width);
  const pctStr = String(Math.round(pct)).padStart(3);
  return `${DIM}${label}${RESET} ${color}${bar} ${pctStr}%${RESET}`;
}
function getSessionId() {
  const sessionFile = (0, import_path.join)(RUNTIME_ROOT, "state", "current-session.json");
  if (!(0, import_fs.existsSync)(sessionFile)) return null;
  try {
    return JSON.parse((0, import_fs.readFileSync)(sessionFile, "utf-8")).sessionId ?? null;
  } catch {
    return null;
  }
}
function buildLine1() {
  const model = getVal("display_name") || "unknown";
  const modelLower = model.toLowerCase();
  const modelColor = Object.entries(MODEL_COLORS).find(([k]) => modelLower.includes(k))?.[1] ?? "\x1B[37m";
  const project = require("path").basename(PROJECT_ROOT);
  let gitPart = `${DIM}\u2014${RESET}`;
  try {
    const branch = (0, import_child_process.execSync)("git rev-parse --abbrev-ref HEAD", { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const staged = (0, import_child_process.execSync)("git diff --cached --numstat", { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim().split("\n").filter(Boolean).length;
    const unstaged = (0, import_child_process.execSync)("git diff --numstat", { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim().split("\n").filter(Boolean).length;
    let dirty = "";
    if (staged > 0) dirty += `\x1B[32m+${staged}${RESET}`;
    if (unstaged > 0) dirty += `\x1B[33m~${unstaged}${RESET}`;
    gitPart = dirty ? `${branch} (${dirty})` : branch;
  } catch {
  }
  const now = /* @__PURE__ */ new Date();
  const timeStr = `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  let sessionTime = "";
  const transcriptPath = getVal("transcript_path");
  if (transcriptPath && (0, import_fs.existsSync)(transcriptPath)) {
    try {
      const mtime = (0, import_fs.statSync)(transcriptPath).mtime;
      const firstLine = (0, import_fs.readFileSync)(transcriptPath, "utf-8").split("\n")[0];
      const tsMatch = firstLine.match(/"timestamp"\s*:\s*"([^"]+)"/);
      if (tsMatch) {
        const start = new Date(tsMatch[1]);
        const elapsed = Math.floor((now.getTime() - start.getTime()) / 1e3);
        const hh = Math.floor(elapsed / 3600);
        const mm = Math.floor(elapsed % 3600 / 60);
        sessionTime = hh > 0 ? `${hh}h${mm}m` : `${mm}m`;
      }
    } catch {
    }
  }
  const timePart = sessionTime ? `${DIM}${timeStr} (${sessionTime})${RESET}` : `${DIM}${timeStr}${RESET}`;
  const latticeTag = "\x1B[38;5;141m\u25C6Lattice\x1B[0m";
  return `${latticeTag}  ${modelColor}${BOLD}${model}${RESET} ${SEP} \x1B[36m${project}${RESET} ${SEP} ${gitPart} ${SEP} ${timePart}`;
}
var USAGE_CACHE_PATH = (0, import_path.join)(process.env.HOME || "~", ".claude", ".usage_cache");
var CACHE_TTL_DEFAULT = 60;
var CACHE_TTL_MAX = 240;
function fetchOAuthUsage() {
  try {
    let credJson = "";
    if (process.platform === "darwin") {
      credJson = (0, import_child_process.execSync)('security find-generic-password -s "Claude Code-credentials" -w', { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    } else {
      const credFile = (0, import_path.join)(process.env.HOME || "~", ".claude", ".credentials.json");
      if ((0, import_fs.existsSync)(credFile)) credJson = (0, import_fs.readFileSync)(credFile, "utf-8");
    }
    const tokenMatch = credJson.match(/"accessToken"\s*:\s*"([^"]+)"/);
    if (!tokenMatch) return null;
    return (0, import_child_process.execSync)(`curl -s --max-time 3 "https://api.anthropic.com/api/oauth/usage" -H "Authorization: Bearer ${tokenMatch[1]}" -H "anthropic-beta: oauth-2025-04-20"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}
function getUsage() {
  const now = Math.floor(Date.now() / 1e3);
  let currentTtl = CACHE_TTL_DEFAULT;
  if ((0, import_fs.existsSync)(USAGE_CACHE_PATH)) {
    try {
      const lines = (0, import_fs.readFileSync)(USAGE_CACHE_PATH, "utf-8").split("\n");
      const cachedAt = parseInt(lines[0]);
      currentTtl = parseInt(lines[1]) || CACHE_TTL_DEFAULT;
      if (now - cachedAt < currentTtl) {
        return { json: lines[2] || "", stale: currentTtl > CACHE_TTL_DEFAULT };
      }
    } catch {
    }
  }
  const resp = fetchOAuthUsage();
  if (resp && resp.includes("five_hour")) {
    const cacheContent = `${now}
${CACHE_TTL_DEFAULT}
${resp}`;
    try {
      require("fs").writeFileSync(USAGE_CACHE_PATH, cacheContent);
    } catch {
    }
    return { json: resp, stale: false };
  }
  if ((0, import_fs.existsSync)(USAGE_CACHE_PATH)) {
    try {
      const lines = (0, import_fs.readFileSync)(USAGE_CACHE_PATH, "utf-8").split("\n");
      const oldData = lines[2] || "";
      const nextTtl = Math.min(currentTtl * 2, CACHE_TTL_MAX);
      const cacheContent = `${now}
${nextTtl}
${oldData}`;
      try {
        require("fs").writeFileSync(USAGE_CACHE_PATH, cacheContent);
      } catch {
      }
      return { json: oldData, stale: true };
    } catch {
    }
  }
  return null;
}
function extractUtil(json, section) {
  const sectionMatch = json.match(new RegExp(`"${section}":\\{[^}]*}`));
  if (!sectionMatch) return 0;
  const utilMatch = sectionMatch[0].match(/"utilization":([0-9.]+)/);
  if (!utilMatch) return 0;
  const val = parseFloat(utilMatch[1]);
  return val > 1 ? val : val * 100;
}
function extractReset(json, section) {
  const sectionMatch = json.match(new RegExp(`"${section}":\\{[^}]*}`));
  if (!sectionMatch) return "";
  const resetMatch = sectionMatch[0].match(/"resets_at":"([^"]+)"/);
  if (!resetMatch) return "";
  try {
    const d = new Date(resetMatch[1]);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}
function isApiMode() {
  return !!process.env.ANTHROPIC_API_KEY;
}
function buildLine2() {
  const ctxPct = Math.round(getNum("used_percentage"));
  const ctx = coloredMeter("ctx", ctxPct, 10);
  if (isApiMode()) {
    return `${ctx} ${SEP} ${DIM}API mode${RESET}`;
  }
  const usage = getUsage();
  if (!usage || !usage.json) return ctx;
  const pct5h = Math.round(extractUtil(usage.json, "five_hour"));
  const pct7d = Math.round(extractUtil(usage.json, "seven_day"));
  const reset5h = extractReset(usage.json, "five_hour");
  const reset7d = extractReset(usage.json, "seven_day");
  const m5h = coloredMeter("5h", pct5h, 10);
  const m7d = coloredMeter("7d", pct7d, 10);
  const r5h = reset5h ? ` ${DIM}~${reset5h}${RESET}` : "";
  const r7d = reset7d ? ` ${DIM}~${reset7d}${RESET}` : "";
  const staleTag = usage.stale ? ` \x1B[33m[stale]\x1B[0m` : "";
  return `${ctx} ${SEP} ${m5h}${r5h} ${SEP} ${m7d}${r7d}${staleTag}`;
}
function buildLine3() {
  const sid = getSessionId();
  const parts = [];
  if (sid) {
    const sessDir = (0, import_path.join)(RUNTIME_ROOT, "state", "sessions", sid);
    if ((0, import_fs.existsSync)(sessDir)) {
      const sustainPath = (0, import_path.join)(sessDir, "sustain.json");
      if ((0, import_fs.existsSync)(sustainPath)) {
        try {
          const s = JSON.parse((0, import_fs.readFileSync)(sustainPath, "utf-8"));
          if (s.active) parts.push(`\u25B6 sustain ${s.currentIteration ?? 0}/${s.maxIterations ?? 100}`);
        } catch {
        }
      }
      const pipelinePath = (0, import_path.join)(sessDir, "pipeline.json");
      if ((0, import_fs.existsSync)(pipelinePath)) {
        try {
          const p = JSON.parse((0, import_fs.readFileSync)(pipelinePath, "utf-8"));
          if (p.active) {
            const stage = p.currentStage ? `${p.currentStage} ${(p.currentStageIndex ?? 0) + 1}/${p.totalStages ?? "?"}` : "init";
            if ((0, import_fs.existsSync)(sustainPath)) {
              parts.length = 0;
              parts.push(`\u25B6 cruise (${stage})`);
            } else {
              parts.push(`\u25B6 pipeline (${stage})`);
            }
          }
        } catch {
        }
      }
      const parallelPath = (0, import_path.join)(sessDir, "parallel.json");
      if ((0, import_fs.existsSync)(parallelPath)) {
        try {
          const p = JSON.parse((0, import_fs.readFileSync)(parallelPath, "utf-8"));
          if (p.active) parts.push(`\u229E parallel ${p.completedCount ?? 0}/${p.totalCount ?? 0}`);
        } catch {
        }
      }
      const agentsPath = (0, import_path.join)(sessDir, "agents.json");
      if ((0, import_fs.existsSync)(agentsPath)) {
        try {
          const record = JSON.parse((0, import_fs.readFileSync)(agentsPath, "utf-8"));
          const active = record.active ?? [];
          if (active.length > 0) {
            const counts = {};
            for (const a of active) counts[a] = (counts[a] ?? 0) + 1;
            const agentStr = Object.entries(counts).map(([name, count]) => count > 1 ? `${name}\xD7${count}` : name).join(" ");
            parts.push(`\u{1F916} ${agentStr}`);
          }
        } catch {
        }
      }
      const trackerPath = (0, import_path.join)(sessDir, "whisper-tracker.json");
      if ((0, import_fs.existsSync)(trackerPath)) {
        try {
          const t = JSON.parse((0, import_fs.readFileSync)(trackerPath, "utf-8"));
          if (t.toolCallCount > 0) parts.push(`\u{1F527} ${t.toolCallCount}`);
        } catch {
        }
      }
    }
  }
  const tasksDir = (0, import_path.join)(KNOWLEDGE_ROOT, "tasks");
  if ((0, import_fs.existsSync)(tasksDir)) {
    try {
      const files = (0, import_fs.readdirSync)(tasksDir).filter((f) => f.endsWith(".json"));
      let inProgress = 0, todo = 0;
      for (const file of files) {
        try {
          const task = JSON.parse((0, import_fs.readFileSync)((0, import_path.join)(tasksDir, file), "utf-8"));
          if (task.status === "in_progress") inProgress++;
          else if (task.status === "todo") todo++;
        } catch {
        }
      }
      const taskParts = [];
      if (inProgress > 0) taskParts.push(`${inProgress} active`);
      if (todo > 0) taskParts.push(`${todo} todo`);
      if (taskParts.length > 0) parts.push(`\u{1F4DD} ${taskParts.join(", ")}`);
    } catch {
    }
  }
  return parts.join(` ${SEP} `);
}
function main() {
  const preset = getPreset();
  const lines = [buildLine1()];
  if (preset === "standard" || preset === "full") {
    lines.push(buildLine2());
  }
  if (preset === "full") {
    const line3 = buildLine3();
    if (line3) lines.push(line3);
  }
  process.stdout.write(lines.join("\n") + "\n");
}
main();
//# sourceMappingURL=statusline.cjs.map
