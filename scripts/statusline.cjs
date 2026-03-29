#!/usr/bin/env node
"use strict";

// src/statusline/statusline.ts
var import_fs3 = require("fs");
var import_path3 = require("path");
var import_child_process = require("child_process");

// src/shared/version.ts
var import_fs = require("fs");
var import_path = require("path");
function getCurrentVersion() {
  try {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    const versionFile = pluginRoot ? (0, import_path.join)(pluginRoot, "VERSION") : (0, import_path.join)(__dirname, "..", "VERSION");
    if ((0, import_fs.existsSync)(versionFile)) return (0, import_fs.readFileSync)(versionFile, "utf-8").trim();
  } catch {
  }
  return "";
}

// src/shared/paths.ts
var import_path2 = require("path");
var import_fs2 = require("fs");
function findProjectRoot(startDir) {
  let dir = startDir ?? process.cwd();
  while (dir !== "/") {
    if ((0, import_fs2.existsSync)((0, import_path2.join)(dir, ".git"))) return dir;
    dir = (0, import_path2.resolve)(dir, "..");
  }
  return startDir ?? process.cwd();
}
var PROJECT_ROOT = findProjectRoot();
var NEXUS_ROOT = process.env.NEXUS_RUNTIME_ROOT || (0, import_path2.join)(PROJECT_ROOT, ".nexus");
var CORE_ROOT = (0, import_path2.join)(NEXUS_ROOT, "core");
var STATE_ROOT = (0, import_path2.join)(NEXUS_ROOT, "state");

// src/statusline/statusline.ts
var input = "";
try {
  input = (0, import_fs3.readFileSync)(0, "utf-8");
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
var PROJECT_ROOT2 = findProjectRoot(getVal("cwd") || process.cwd());
var NEXUS_ROOT2 = (0, import_path3.join)(PROJECT_ROOT2, ".nexus");
function getPreset() {
  const env = process.env.NEXUS_STATUSLINE || process.env.LATTICE_STATUSLINE;
  if (env === "minimal" || env === "full") return env;
  const configFile = (0, import_path3.join)(NEXUS_ROOT2, "config.json");
  if ((0, import_fs3.existsSync)(configFile)) {
    try {
      const data = JSON.parse((0, import_fs3.readFileSync)(configFile, "utf-8"));
      const p = data.statuslinePreset;
      if (p === "minimal" || p === "full") return p;
    } catch {
    }
  }
  return "full";
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
var VERSION_CACHE_PATH = (0, import_path3.join)(process.env.HOME || "~", ".claude", ".nexus_version_cache");
var VERSION_CACHE_TTL = 86400;
function checkUpdateAvailable(currentVersion) {
  if (!currentVersion) return false;
  const now = Math.floor(Date.now() / 1e3);
  if ((0, import_fs3.existsSync)(VERSION_CACHE_PATH)) {
    try {
      const lines = (0, import_fs3.readFileSync)(VERSION_CACHE_PATH, "utf-8").split("\n");
      const cachedAt = parseInt(lines[0]);
      const latestVersion = lines[1]?.trim() || "";
      if (now - cachedAt < VERSION_CACHE_TTL && latestVersion) {
        return latestVersion !== currentVersion && latestVersion > currentVersion;
      }
    } catch {
    }
  }
  try {
    const script = `RESP=$(curl -s --max-time 3 "https://api.github.com/repos/moreih29/claude-nexus/releases/latest" 2>/dev/null); VER=$(echo "$RESP" | grep -o '"tag_name":"[^"]*"' | sed 's/"tag_name":"v\\{0,1\\}//;s/"//'); [ -n "$VER" ] && printf '%s\\n%s\\n' "$(date +%s)" "$VER" > "${VERSION_CACHE_PATH}.tmp" && mv "${VERSION_CACHE_PATH}.tmp" "${VERSION_CACHE_PATH}"`;
    require("child_process").spawn("sh", ["-c", script], { stdio: "ignore", detached: true }).unref();
  } catch {
  }
  if ((0, import_fs3.existsSync)(VERSION_CACHE_PATH)) {
    try {
      const lines = (0, import_fs3.readFileSync)(VERSION_CACHE_PATH, "utf-8").split("\n");
      const latestVersion = lines[1]?.trim() || "";
      if (latestVersion) return latestVersion !== currentVersion && latestVersion > currentVersion;
    } catch {
    }
  }
  return false;
}
function buildLine1() {
  const model = getVal("display_name") || "unknown";
  const modelLower = model.toLowerCase();
  const modelColor = Object.entries(MODEL_COLORS).find(([k]) => modelLower.includes(k))?.[1] ?? "\x1B[37m";
  const project = require("path").basename(PROJECT_ROOT2);
  let gitPart = `${DIM}\u2014${RESET}`;
  try {
    const branch = (0, import_child_process.execSync)("git rev-parse --abbrev-ref HEAD", { cwd: PROJECT_ROOT2, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const staged = (0, import_child_process.execSync)("git diff --cached --numstat", { cwd: PROJECT_ROOT2, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim().split("\n").filter(Boolean).length;
    const unstaged = (0, import_child_process.execSync)("git diff --numstat", { cwd: PROJECT_ROOT2, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim().split("\n").filter(Boolean).length;
    let dirty = "";
    if (staged > 0) dirty += `\x1B[32m+${staged}${RESET}`;
    if (unstaged > 0) dirty += `\x1B[33m~${unstaged}${RESET}`;
    gitPart = dirty ? `${branch} (${dirty})` : branch;
  } catch {
  }
  const version = getCurrentVersion();
  const updateAvailable = version ? checkUpdateAvailable(version) : false;
  const versionStr = version ? ` v${version}` : "";
  const updateTag = updateAvailable ? ` \x1B[33m\u2191${RESET}` : "";
  const nexusTag = `\x1B[38;5;141m\u25C6Nexus${versionStr}${RESET}${updateTag}`;
  return `${nexusTag} ${SEP} ${modelColor}${BOLD}${model}${RESET} ${SEP} \x1B[36m${project}${RESET} ${SEP} ${gitPart}`;
}
var USAGE_CACHE_PATH = (0, import_path3.join)(process.env.HOME || "~", ".claude", ".usage_cache");
var CACHE_TTL_DEFAULT = 60;
var FETCH_BACKOFF = 300;
function writeCacheAtomic(content) {
  try {
    require("fs").writeFileSync(USAGE_CACHE_PATH + ".tmp", content);
    require("fs").renameSync(USAGE_CACHE_PATH + ".tmp", USAGE_CACHE_PATH);
  } catch {
    try {
      require("fs").unlinkSync(USAGE_CACHE_PATH + ".tmp");
    } catch {
    }
  }
}
function triggerBackgroundFetch(dataTimestamp, cachedData) {
  const now = Math.floor(Date.now() / 1e3);
  if (cachedData) {
    writeCacheAtomic(`${dataTimestamp}
${now + CACHE_TTL_DEFAULT}
${cachedData}`);
  }
  try {
    let tokenCmd = "";
    if (process.platform === "darwin") {
      tokenCmd = `TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | grep -o '"accessToken":"[^"]*"' | sed 's/"accessToken":"//;s/"//')`;
    } else {
      const credFile = (0, import_path3.join)(process.env.HOME || "~", ".claude", ".credentials.json");
      tokenCmd = `TOKEN=$(grep -o '"accessToken":"[^"]*"' "${credFile}" 2>/dev/null | sed 's/"accessToken":"//;s/"//')`;
    }
    const script = `
      ${tokenCmd}
      [ -z "$TOKEN" ] && exit 1
      RESP=$(curl -s --max-time 3 "https://api.anthropic.com/api/oauth/usage" -H "Authorization: Bearer $TOKEN" -H "anthropic-beta: oauth-2025-04-20" 2>/dev/null)
      NOW=$(date +%s)
      if echo "$RESP" | grep -q "five_hour"; then
        printf '%s\\n%s\\n%s\\n' "$NOW" "$((NOW + ${CACHE_TTL_DEFAULT}))" "$RESP" > "${USAGE_CACHE_PATH}.tmp" && mv "${USAGE_CACHE_PATH}.tmp" "${USAGE_CACHE_PATH}"
      else
        OLD_TS=$(head -1 "${USAGE_CACHE_PATH}" 2>/dev/null)
        OLD_DATA=$(sed -n '3p' "${USAGE_CACHE_PATH}" 2>/dev/null)
        [ -n "$OLD_DATA" ] && printf '%s\\n%s\\n%s\\n' "$OLD_TS" "$((NOW + ${FETCH_BACKOFF}))" "$OLD_DATA" > "${USAGE_CACHE_PATH}.tmp" && mv "${USAGE_CACHE_PATH}.tmp" "${USAGE_CACHE_PATH}"
      fi
    `;
    require("child_process").spawn("sh", ["-c", script], {
      stdio: "ignore",
      detached: true
    }).unref();
  } catch {
  }
}
var STALE_THRESHOLD = 300;
function getUsage() {
  const now = Math.floor(Date.now() / 1e3);
  let dataTimestamp = 0;
  let nextFetchAfter = 0;
  let cachedData = "";
  if ((0, import_fs3.existsSync)(USAGE_CACHE_PATH)) {
    try {
      const lines = (0, import_fs3.readFileSync)(USAGE_CACHE_PATH, "utf-8").split("\n");
      dataTimestamp = parseInt(lines[0]) || 0;
      const line1 = parseInt(lines[1]) || 0;
      if (line1 > 1e6) {
        nextFetchAfter = line1;
        cachedData = lines[2] || "";
      } else {
        nextFetchAfter = dataTimestamp + (line1 || CACHE_TTL_DEFAULT);
        cachedData = lines[2] || "";
      }
    } catch {
    }
  }
  const dataAge = dataTimestamp > 0 ? now - dataTimestamp : 0;
  if (cachedData && now < nextFetchAfter) {
    return { json: cachedData, stale: dataAge >= STALE_THRESHOLD, ageSeconds: dataAge };
  }
  if (cachedData) {
    triggerBackgroundFetch(dataTimestamp, cachedData);
    return { json: cachedData, stale: dataAge >= STALE_THRESHOLD, ageSeconds: dataAge };
  }
  try {
    let credJson = "";
    if (process.platform === "darwin") {
      credJson = (0, import_child_process.execSync)('security find-generic-password -s "Claude Code-credentials" -w', { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    } else {
      const credFile = (0, import_path3.join)(process.env.HOME || "~", ".claude", ".credentials.json");
      if ((0, import_fs3.existsSync)(credFile)) credJson = (0, import_fs3.readFileSync)(credFile, "utf-8");
    }
    const tokenMatch = credJson.match(/"accessToken"\s*:\s*"([^"]+)"/);
    if (tokenMatch) {
      const resp = (0, import_child_process.execSync)(`curl -s --max-time 2 "https://api.anthropic.com/api/oauth/usage" -H "Authorization: Bearer ${tokenMatch[1]}" -H "anthropic-beta: oauth-2025-04-20"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
      if (resp && resp.includes("five_hour")) {
        writeCacheAtomic(`${now}
${now + CACHE_TTL_DEFAULT}
${resp}`);
        return { json: resp, stale: false, ageSeconds: 0 };
      }
    }
  } catch {
  }
  return null;
}
function extractUtil(parsed, section) {
  if (!parsed) return 0;
  const sectionData = parsed[section];
  return Number(sectionData?.utilization) || 0;
}
function extractResetInfo(parsed, section) {
  const empty = { timeStr: "", remaining: "", remainingCoarse: "", dayStr: "" };
  if (!parsed) return empty;
  const sectionData = parsed[section];
  const resetAt = sectionData?.resets_at;
  if (!resetAt) return empty;
  try {
    const d = new Date(resetAt);
    const now = /* @__PURE__ */ new Date();
    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const diffMs = d.getTime() - now.getTime();
    let remaining = "";
    let remainingCoarse = "";
    if (diffMs > 0) {
      const diffMin = Math.floor(diffMs / 6e4);
      const hh = Math.floor(diffMin / 60);
      const mm = diffMin % 60;
      remaining = hh > 0 ? `${hh}h${mm}m` : `${mm}m`;
      const dd = Math.floor(hh / 24);
      const hhRem = hh % 24;
      remainingCoarse = dd > 0 ? `${dd}d${hhRem}h` : `${hh}h`;
    }
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayStr = days[d.getDay()];
    return { timeStr, remaining, remainingCoarse, dayStr };
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
  const BAR_WIDTH = 6;
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
  const noData = (label) => `${DIM}${label} ${"\u2591".repeat(BAR_WIDTH)} --%${RESET}`;
  const usage = getUsage();
  if (!usage || !usage.json) {
    return `${ctx} ${SEP} ${noData("5h")} ${SEP} ${noData("7d")}`;
  }
  let usageParsed = null;
  try {
    usageParsed = JSON.parse(usage.json);
  } catch {
  }
  if (!usageParsed) {
    return `${ctx} ${SEP} ${noData("5h")} ${SEP} ${noData("7d")}`;
  }
  const pct5h = Math.round(extractUtil(usageParsed, "five_hour"));
  const pct7d = Math.round(extractUtil(usageParsed, "seven_day"));
  const { remaining: remain5h } = extractResetInfo(usageParsed, "five_hour");
  const { remainingCoarse: remain7d } = extractResetInfo(usageParsed, "seven_day");
  const m5h = coloredMeter("5h", pct5h, BAR_WIDTH);
  const m7d = coloredMeter("7d", pct7d, BAR_WIDTH);
  const r5h = remain5h ? ` ${DIM}\u21BB${remain5h}${RESET}` : "";
  const r7d = remain7d ? ` ${DIM}\u21BB${remain7d}${RESET}` : "";
  let stalePart = "";
  if (usage.stale) {
    const ageMin = Math.floor(usage.ageSeconds / 60);
    const hh = Math.floor(ageMin / 60);
    const mm = ageMin % 60;
    const ageStr = hh > 0 ? `${hh}h${mm}m` : `${mm}m`;
    stalePart = ` ${SEP} \x1B[33m${ageStr} ago\x1B[0m`;
  }
  return `${ctx} ${SEP} ${m5h}${r5h} ${SEP} ${m7d}${r7d}${stalePart}`;
}
function main() {
  const preset = getPreset();
  const lines = [buildLine1()];
  if (preset === "full") {
    lines.push(buildLine2());
  }
  process.stdout.write(lines.join("\n") + "\n");
}
main();
//# sourceMappingURL=statusline.cjs.map
