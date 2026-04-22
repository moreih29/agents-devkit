#!/usr/bin/env node

// src/statusline/statusline.ts
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
var stdinRaw = "";
try {
  stdinRaw = readFileSync(0, "utf-8");
} catch {}
function getVal(key) {
  const m = stdinRaw.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`));
  return m ? m[1] : "";
}
function getNum(key) {
  const m = stdinRaw.match(new RegExp(`"${key}"\\s*:\\s*([0-9.]+)`));
  return m ? parseFloat(m[1]) : 0;
}
function findProjectRoot(start) {
  let dir = start ?? process.cwd();
  while (dir !== "/") {
    if (existsSync(join(dir, ".git")))
      return dir;
    dir = resolve(dir, "..");
  }
  return start ?? process.cwd();
}
var PROJECT_ROOT = findProjectRoot(getVal("cwd") || process.cwd());
var HOME = homedir();
var PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || "";
function getPluginVersion() {
  if (PLUGIN_ROOT) {
    try {
      const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin/plugin.json"), "utf-8"));
      if (typeof manifest.version === "string")
        return manifest.version;
    } catch {}
  }
  try {
    const scriptDir = dirname(fileURLToPath(import.meta.url));
    const manifest = JSON.parse(readFileSync(join(scriptDir, "..", "package.json"), "utf-8"));
    if (typeof manifest.version === "string")
      return manifest.version;
  } catch {}
  return "";
}
var RESET = "\x1B[0m";
var BOLD = "\x1B[1m";
var DIM = "\x1B[2m";
var SEP = `${DIM}│${RESET}`;
var MODEL_COLORS = {
  opus: "\x1B[38;5;168m",
  sonnet: "\x1B[38;5;108m",
  haiku: "\x1B[38;5;67m"
};
function pctColor(pct) {
  if (pct > 90)
    return "\x1B[31m";
  if (pct > 75)
    return "\x1B[38;5;208m";
  if (pct > 50)
    return "\x1B[33m";
  return "\x1B[32m";
}
function makeBar(pct, width) {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round(clamped * width / 100);
  return "█".repeat(filled) + "░".repeat(Math.max(0, width - filled));
}
function meter(label, pct, width) {
  return `${DIM}${label}${RESET} ${pctColor(pct)}${makeBar(pct, width)} ${Math.round(pct)}%${RESET}`;
}
var VERSION_CACHE_PATH = join(HOME, ".claude", ".nexus_version_cache");
var VERSION_CACHE_TTL = 86400;
function updateAvailable(current) {
  if (!current)
    return false;
  const now = Math.floor(Date.now() / 1000);
  if (existsSync(VERSION_CACHE_PATH)) {
    try {
      const lines = readFileSync(VERSION_CACHE_PATH, "utf-8").split(`
`);
      const cachedAt = parseInt(lines[0]);
      const latest = lines[1]?.trim() || "";
      if (now - cachedAt < VERSION_CACHE_TTL && latest) {
        return latest !== current && latest > current;
      }
    } catch {}
  }
  try {
    const script = `RESP=$(curl -s --max-time 3 "https://api.github.com/repos/moreih29/claude-nexus/releases/latest" 2>/dev/null); VER=$(echo "$RESP" | grep -o '"tag_name":"[^"]*"' | sed 's/"tag_name":"v\\{0,1\\}//;s/"//'); [ -n "$VER" ] && printf '%s\\n%s\\n' "$(date +%s)" "$VER" > "${VERSION_CACHE_PATH}.tmp" && mv "${VERSION_CACHE_PATH}.tmp" "${VERSION_CACHE_PATH}"`;
    spawn("sh", ["-c", script], { stdio: "ignore", detached: true }).unref();
  } catch {}
  if (existsSync(VERSION_CACHE_PATH)) {
    try {
      const lines = readFileSync(VERSION_CACHE_PATH, "utf-8").split(`
`);
      const latest = lines[1]?.trim() || "";
      if (latest)
        return latest !== current && latest > current;
    } catch {}
  }
  return false;
}
function buildLine1() {
  const model = getVal("display_name") || "unknown";
  const modelLower = model.toLowerCase();
  const modelColor = Object.entries(MODEL_COLORS).find(([k]) => modelLower.includes(k))?.[1] ?? "\x1B[37m";
  const project = basename(PROJECT_ROOT);
  let gitPart = `${DIM}—${RESET}`;
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim();
    const staged = execSync("git diff --cached --numstat", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim().split(`
`).filter(Boolean).length;
    const unstaged = execSync("git diff --numstat", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    }).trim().split(`
`).filter(Boolean).length;
    let dirty = "";
    if (staged > 0)
      dirty += `\x1B[32m+${staged}${RESET}`;
    if (unstaged > 0)
      dirty += `\x1B[33m~${unstaged}${RESET}`;
    gitPart = dirty ? `${branch} (${dirty})` : branch;
  } catch {}
  const version = getPluginVersion();
  const canUpdate = version ? updateAvailable(version) : false;
  const versionStr = version ? ` v${version}` : "";
  const updateTag = canUpdate ? ` \x1B[33m↑${RESET}` : "";
  const nexusTag = `\x1B[38;5;141m◆Nexus${versionStr}${RESET}${updateTag}`;
  return `${nexusTag} ${SEP} ${modelColor}${BOLD}${model}${RESET} ${SEP} \x1B[36m${project}${RESET} ${SEP} ${gitPart}`;
}
var USAGE_CACHE_PATH = join(HOME, ".claude", ".usage_cache");
var CACHE_TTL_DEFAULT = 60;
var FETCH_BACKOFF = 300;
var STALE_THRESHOLD = 300;
function writeCacheAtomic(content) {
  try {
    writeFileSync(USAGE_CACHE_PATH + ".tmp", content);
    renameSync(USAGE_CACHE_PATH + ".tmp", USAGE_CACHE_PATH);
  } catch {
    try {
      unlinkSync(USAGE_CACHE_PATH + ".tmp");
    } catch {}
  }
}
function triggerBackgroundFetch(dataTimestamp, cachedData) {
  const now = Math.floor(Date.now() / 1000);
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
      const credFile = join(HOME, ".claude", ".credentials.json");
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
    spawn("sh", ["-c", script], { stdio: "ignore", detached: true }).unref();
  } catch {}
}
function readUsage() {
  const now = Math.floor(Date.now() / 1000);
  let dataTimestamp = 0;
  let nextFetchAfter = 0;
  let cachedData = "";
  if (existsSync(USAGE_CACHE_PATH)) {
    try {
      const lines = readFileSync(USAGE_CACHE_PATH, "utf-8").split(`
`);
      dataTimestamp = parseInt(lines[0]) || 0;
      const line1 = parseInt(lines[1]) || 0;
      if (line1 > 1e6) {
        nextFetchAfter = line1;
        cachedData = lines[2] || "";
      } else {
        nextFetchAfter = dataTimestamp + (line1 || CACHE_TTL_DEFAULT);
        cachedData = lines[2] || "";
      }
    } catch {}
  }
  const age = dataTimestamp > 0 ? now - dataTimestamp : 0;
  if (cachedData && now < nextFetchAfter) {
    return { json: cachedData, stale: age >= STALE_THRESHOLD, ageSeconds: age };
  }
  if (cachedData) {
    triggerBackgroundFetch(dataTimestamp, cachedData);
    return { json: cachedData, stale: age >= STALE_THRESHOLD, ageSeconds: age };
  }
  try {
    let credJson = "";
    if (process.platform === "darwin") {
      credJson = execSync('security find-generic-password -s "Claude Code-credentials" -w', {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"]
      }).trim();
    } else {
      const credFile = join(HOME, ".claude", ".credentials.json");
      if (existsSync(credFile))
        credJson = readFileSync(credFile, "utf-8");
    }
    const tokenMatch = credJson.match(/"accessToken"\s*:\s*"([^"]+)"/);
    if (tokenMatch) {
      const resp = execSync(`curl -s --max-time 2 "https://api.anthropic.com/api/oauth/usage" -H "Authorization: Bearer ${tokenMatch[1]}" -H "anthropic-beta: oauth-2025-04-20"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
      if (resp && resp.includes("five_hour")) {
        writeCacheAtomic(`${now}
${now + CACHE_TTL_DEFAULT}
${resp}`);
        return { json: resp, stale: false, ageSeconds: 0 };
      }
    }
  } catch {}
  return null;
}
function utilPct(parsed, section) {
  if (!parsed)
    return 0;
  const data = parsed[section];
  return Number(data?.utilization) || 0;
}
function resetRemain(parsed, section) {
  const empty = { remaining: "", remainingCoarse: "" };
  if (!parsed)
    return empty;
  const data = parsed[section];
  const resetAt = data?.resets_at;
  if (!resetAt)
    return empty;
  try {
    const d = new Date(resetAt);
    const diffMs = d.getTime() - Date.now();
    if (diffMs <= 0)
      return empty;
    const diffMin = Math.floor(diffMs / 60000);
    const hh = Math.floor(diffMin / 60);
    const mm = diffMin % 60;
    const remaining = hh > 0 ? `${hh}h${mm}m` : `${mm}m`;
    const dd = Math.floor(hh / 24);
    const hhRem = hh % 24;
    const remainingCoarse = dd > 0 ? `${dd}d${hhRem}h` : `${hh}h`;
    return { remaining, remainingCoarse };
  } catch {
    return empty;
  }
}
function isApiMode() {
  return !!process.env.ANTHROPIC_API_KEY;
}
function fetchApiCost(adminKey) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const resp = execSync(`curl -s --max-time 3 "https://api.anthropic.com/v1/organizations/cost_report?start_date=${today}&end_date=${today}" -H "x-api-key: ${adminKey}" -H "anthropic-version: 2023-06-01"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    const m = resp.match(/"total_cost"\s*:\s*([0-9.]+)/);
    return m ? parseFloat(m[1]) : null;
  } catch {
    return null;
  }
}
function buildLine2() {
  const BAR_WIDTH = 6;
  const ctxPct = Math.round(getNum("used_percentage"));
  const ctx = meter("ctx", ctxPct, BAR_WIDTH);
  if (isApiMode()) {
    const adminKey = process.env.ANTHROPIC_ADMIN_KEY;
    if (adminKey) {
      const cost = fetchApiCost(adminKey);
      if (cost !== null) {
        return `${ctx} ${SEP} ${DIM}API${RESET} ${pctColor(0)}$${cost.toFixed(2)} today${RESET}`;
      }
    }
    return `${ctx} ${SEP} ${DIM}API mode${RESET}`;
  }
  const noData = (label) => `${DIM}${label} ${"░".repeat(BAR_WIDTH)} --%${RESET}`;
  const usage = readUsage();
  if (!usage || !usage.json) {
    return `${ctx} ${SEP} ${noData("5h")} ${SEP} ${noData("7d")}`;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(usage.json);
  } catch {}
  if (!parsed) {
    return `${ctx} ${SEP} ${noData("5h")} ${SEP} ${noData("7d")}`;
  }
  const pct5h = Math.round(utilPct(parsed, "five_hour"));
  const pct7d = Math.round(utilPct(parsed, "seven_day"));
  const { remaining: r5h } = resetRemain(parsed, "five_hour");
  const { remainingCoarse: r7d } = resetRemain(parsed, "seven_day");
  const m5h = meter("5h", pct5h, BAR_WIDTH);
  const m7d = meter("7d", pct7d, BAR_WIDTH);
  const tag5h = r5h ? ` ${DIM}↻${r5h}${RESET}` : "";
  const tag7d = r7d ? ` ${DIM}↻${r7d}${RESET}` : "";
  let stalePart = "";
  if (usage.stale) {
    const ageMin = Math.floor(usage.ageSeconds / 60);
    const hh = Math.floor(ageMin / 60);
    const mm = ageMin % 60;
    const ageStr = hh > 0 ? `${hh}h${mm}m` : `${mm}m`;
    stalePart = ` ${SEP} \x1B[33m${ageStr} ago\x1B[0m`;
  }
  return `${ctx} ${SEP} ${m5h}${tag5h} ${SEP} ${m7d}${tag7d}${stalePart}`;
}
function main() {
  process.stdout.write(buildLine1() + `
` + buildLine2() + `
`);
}
try {
  main();
} catch {
  process.stdout.write(`nexus
`);
}
