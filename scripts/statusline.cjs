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
var RUNTIME_ROOT = (0, import_path.join)(PROJECT_ROOT, ".nexus");
var KNOWLEDGE_ROOT = (0, import_path.join)(PROJECT_ROOT, ".claude", "nexus");
function getPreset() {
  const env = process.env.NEXUS_STATUSLINE || process.env.LATTICE_STATUSLINE;
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
  const pctStr = `${Math.round(pct)}%`;
  return `${DIM}${label}${RESET} ${color}${bar} ${pctStr}${RESET}`;
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
  const nexusTag = `\x1B[38;5;141m\u25C6Nexus${RESET}`;
  return `${nexusTag} ${SEP} ${modelColor}${BOLD}${model}${RESET} ${SEP} \x1B[36m${project}${RESET} ${SEP} ${gitPart}`;
}
var USAGE_CACHE_PATH = (0, import_path.join)(process.env.HOME || "~", ".claude", ".usage_cache");
var CACHE_TTL_DEFAULT = 60;
function triggerBackgroundFetch() {
  try {
    let tokenCmd = "";
    if (process.platform === "darwin") {
      tokenCmd = `TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | grep -o '"accessToken":"[^"]*"' | sed 's/"accessToken":"//;s/"//')`;
    } else {
      const credFile = (0, import_path.join)(process.env.HOME || "~", ".claude", ".credentials.json");
      tokenCmd = `TOKEN=$(grep -o '"accessToken":"[^"]*"' "${credFile}" 2>/dev/null | sed 's/"accessToken":"//;s/"//')`;
    }
    const script = `
      ${tokenCmd}
      [ -z "$TOKEN" ] && exit 1
      RESP=$(curl -s --max-time 3 "https://api.anthropic.com/api/oauth/usage" -H "Authorization: Bearer $TOKEN" -H "anthropic-beta: oauth-2025-04-20" 2>/dev/null)
      echo "$RESP" | grep -q "five_hour" && printf '%s\\n%s\\n%s\\n' "$(date +%s)" "${CACHE_TTL_DEFAULT}" "$RESP" > "${USAGE_CACHE_PATH}.tmp" && mv "${USAGE_CACHE_PATH}.tmp" "${USAGE_CACHE_PATH}"
    `;
    require("child_process").spawn("sh", ["-c", script], {
      stdio: "ignore",
      detached: true
    }).unref();
  } catch {
  }
}
function getUsage() {
  const now = Math.floor(Date.now() / 1e3);
  let currentTtl = CACHE_TTL_DEFAULT;
  let cachedData = "";
  if ((0, import_fs.existsSync)(USAGE_CACHE_PATH)) {
    try {
      const lines = (0, import_fs.readFileSync)(USAGE_CACHE_PATH, "utf-8").split("\n");
      const cachedAt = parseInt(lines[0]);
      currentTtl = parseInt(lines[1]) || CACHE_TTL_DEFAULT;
      cachedData = lines[2] || "";
      if (now - cachedAt < currentTtl) {
        return { json: cachedData, stale: false };
      }
    } catch {
    }
  }
  triggerBackgroundFetch();
  if (cachedData) {
    return { json: cachedData, stale: true };
  }
  try {
    let credJson = "";
    if (process.platform === "darwin") {
      credJson = (0, import_child_process.execSync)('security find-generic-password -s "Claude Code-credentials" -w', { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    } else {
      const credFile = (0, import_path.join)(process.env.HOME || "~", ".claude", ".credentials.json");
      if ((0, import_fs.existsSync)(credFile)) credJson = (0, import_fs.readFileSync)(credFile, "utf-8");
    }
    const tokenMatch = credJson.match(/"accessToken"\s*:\s*"([^"]+)"/);
    if (tokenMatch) {
      const resp = (0, import_child_process.execSync)(`curl -s --max-time 2 "https://api.anthropic.com/api/oauth/usage" -H "Authorization: Bearer ${tokenMatch[1]}" -H "anthropic-beta: oauth-2025-04-20"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
      if (resp && resp.includes("five_hour")) {
        const cacheContent = `${now}
${CACHE_TTL_DEFAULT}
${resp}`;
        try {
          require("fs").writeFileSync(USAGE_CACHE_PATH + ".tmp", cacheContent);
          require("fs").renameSync(USAGE_CACHE_PATH + ".tmp", USAGE_CACHE_PATH);
        } catch {
          try {
            require("fs").unlinkSync(USAGE_CACHE_PATH + ".tmp");
          } catch {
          }
        }
        return { json: resp, stale: false };
      }
    }
  } catch {
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
function extractResetInfo(json, section) {
  const empty = { timeStr: "", remaining: "", dayStr: "" };
  const sectionMatch = json.match(new RegExp(`"${section}":\\{[^}]*}`));
  if (!sectionMatch) return empty;
  const resetMatch = sectionMatch[0].match(/"resets_at":"([^"]+)"/);
  if (!resetMatch) return empty;
  try {
    const d = new Date(resetMatch[1]);
    const now = /* @__PURE__ */ new Date();
    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const diffMs = d.getTime() - now.getTime();
    let remaining = "";
    if (diffMs > 0) {
      const diffMin = Math.floor(diffMs / 6e4);
      const hh = Math.floor(diffMin / 60);
      const mm = diffMin % 60;
      remaining = hh > 0 ? `${hh}h${mm}m` : `${mm}m`;
    }
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayStr = days[d.getDay()];
    return { timeStr, remaining, dayStr };
  } catch {
    return empty;
  }
}
function isApiMode() {
  return !!process.env.ANTHROPIC_API_KEY;
}
function fetchApiCost(adminKey) {
  try {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const resp = (0, import_child_process.execSync)(
      `curl -s --max-time 3 "https://api.anthropic.com/v1/organizations/cost_report?start_date=${today}&end_date=${today}" -H "x-api-key: ${adminKey}" -H "anthropic-version: 2023-06-01"`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    const costMatch = resp.match(/"total_cost"\s*:\s*([0-9.]+)/);
    return costMatch ? parseFloat(costMatch[1]) : null;
  } catch {
    return null;
  }
}
function buildLine2() {
  const BAR_WIDTH = 7;
  const ctxPct = Math.round(getNum("used_percentage"));
  const ctx = coloredMeter("ctx", ctxPct, BAR_WIDTH);
  if (isApiMode()) {
    const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
    if (adminKey) {
      const cost = fetchApiCost(adminKey);
      if (cost !== null) {
        return `${ctx} ${SEP} ${DIM}API${RESET} ${getColor(0)}$${cost.toFixed(2)} today${RESET}`;
      }
    }
    return `${ctx} ${SEP} ${DIM}API mode${RESET}`;
  }
  const usage = getUsage();
  if (!usage || !usage.json) {
    return `${ctx} ${SEP} ${coloredMeter("5h", 0, BAR_WIDTH)} ${SEP} ${coloredMeter("7d", 0, BAR_WIDTH)}`;
  }
  const pct5h = Math.round(extractUtil(usage.json, "five_hour"));
  const pct7d = Math.round(extractUtil(usage.json, "seven_day"));
  const { timeStr: reset5h, remaining: remain5h } = extractResetInfo(usage.json, "five_hour");
  const { timeStr: reset7d, remaining: remain7d, dayStr: resetDay } = extractResetInfo(usage.json, "seven_day");
  const m5h = coloredMeter("5h", pct5h, BAR_WIDTH);
  const m7d = coloredMeter("7d", pct7d, BAR_WIDTH);
  const r5h = reset5h ? ` ${DIM}~${reset5h}${remain5h ? ` (${remain5h})` : ""}${RESET}` : "";
  const r7d = reset7d ? ` ${DIM}~${resetDay ? `${resetDay} ` : ""}${reset7d}${remain7d ? ` (${remain7d})` : ""}${RESET}` : "";
  const staleTag = usage.stale ? ` \x1B[33m[stale]\x1B[0m` : "";
  return `${ctx} ${SEP} ${m5h}${r5h} ${SEP} ${m7d}${r7d}${staleTag}`;
}
function buildLine3() {
  const sid = getSessionId();
  let modeDisplay = `\u{1F4A4} idle`;
  let agentCount = 0;
  let taskStr = "0/0";
  if (sid) {
    const sessDir = (0, import_path.join)(RUNTIME_ROOT, "state", "sessions", sid);
    const workflowPath = (0, import_path.join)(sessDir, "workflow.json");
    try {
      if ((0, import_fs.existsSync)(workflowPath)) {
        const wf = JSON.parse((0, import_fs.readFileSync)(workflowPath, "utf-8"));
        const mode = wf.mode ?? "idle";
        const phase = wf.phase ?? "";
        if (mode === "consult") {
          modeDisplay = phase ? `\u{1F4AC} consult: ${phase}` : `\u{1F4AC} consult`;
        } else if (mode === "plan") {
          modeDisplay = phase ? `\u{1F4CB} plan: ${phase}` : `\u{1F4CB} plan`;
        } else if (mode === "idle") {
          modeDisplay = `\u{1F4A4} idle`;
        } else {
          modeDisplay = `\u{1F4A4} idle`;
        }
      }
    } catch {
    }
    try {
      const agentsPath = (0, import_path.join)(sessDir, "agents.json");
      if ((0, import_fs.existsSync)(agentsPath)) {
        const record = JSON.parse((0, import_fs.readFileSync)(agentsPath, "utf-8"));
        const active = record.active ?? [];
        agentCount = active.length;
      }
    } catch {
    }
  }
  if (modeDisplay === `\u{1F4A4} idle`) {
    try {
      const branch = (0, import_child_process.execSync)("git rev-parse --abbrev-ref HEAD", { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
      const branchDir = branch.replace(/\//g, "--");
      const planDir = (0, import_path.join)(KNOWLEDGE_ROOT, "plans", branchDir);
      if ((0, import_fs.existsSync)(planDir)) {
        modeDisplay = `\u{1F4CB} planning`;
      }
    } catch {
    }
  }
  try {
    const branch = (0, import_child_process.execSync)("git rev-parse --abbrev-ref HEAD", { cwd: PROJECT_ROOT, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const branchDir = branch.replace(/\//g, "--");
    const tasksFile = (0, import_path.join)(KNOWLEDGE_ROOT, "plans", branchDir, "tasks.json");
    if ((0, import_fs.existsSync)(tasksFile)) {
      const tasks = JSON.parse((0, import_fs.readFileSync)(tasksFile, "utf-8"));
      const total = tasks.length;
      const done = tasks.filter((t) => t.status === "done").length;
      taskStr = `${done}/${total}`;
    }
  } catch {
  }
  return `${modeDisplay} ${SEP} \u{1F916} ${agentCount} ${SEP} \u{1F4CB} ${taskStr}`;
}
function main() {
  const preset = getPreset();
  const lines = [buildLine1()];
  if (preset === "standard" || preset === "full") {
    lines.push(buildLine2());
  }
  if (preset === "full") {
    const line3 = buildLine3();
    lines.push(line3 || `${DIM}\u2014 idle${RESET}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
}
main();
//# sourceMappingURL=statusline.cjs.map
