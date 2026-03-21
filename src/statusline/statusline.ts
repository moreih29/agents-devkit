#!/usr/bin/env node
// Nexus 상태라인 — Claude Code statusLine.command로 실행
// stdin: Claude Code가 제공하는 JSON (display_name, used_percentage, cwd, transcript_path 등)

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// --- 입력 파싱 ---

let input = '';
try {
  input = readFileSync(0, 'utf-8');
} catch { /* empty stdin */ }

function getVal(key: string): string {
  const m = input.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`, ''));
  return m ? m[1] : '';
}
function getNum(key: string): number {
  const m = input.match(new RegExp(`"${key}"\\s*:\\s*([0-9.]+)`, ''));
  return m ? parseFloat(m[1]) : 0;
}

// --- 프로젝트 루트 찾기 ---

function findProjectRoot(): string {
  const cwd = getVal('cwd') || process.cwd();
  let dir = cwd;
  while (dir !== '/') {
    if (existsSync(join(dir, '.git'))) return dir;
    dir = join(dir, '..');
  }
  return cwd;
}

const PROJECT_ROOT = findProjectRoot();
const RUNTIME_ROOT = join(PROJECT_ROOT, '.nexus');
const KNOWLEDGE_ROOT = join(PROJECT_ROOT, '.claude', 'nexus');

// --- Preset ---

type Preset = 'minimal' | 'standard' | 'full';

function getPreset(): Preset {
  const env = process.env.NEXUS_STATUSLINE || process.env.LATTICE_STATUSLINE;
  if (env === 'minimal' || env === 'standard' || env === 'full') return env;
  const configFile = join(KNOWLEDGE_ROOT, 'config.json');
  if (existsSync(configFile)) {
    try {
      const data = JSON.parse(readFileSync(configFile, 'utf-8'));
      const p = data.statuslinePreset;
      if (p === 'minimal' || p === 'standard' || p === 'full') return p;
    } catch { /* skip */ }
  }
  return 'standard';
}

// --- 색상 ---

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const SEP = `${DIM}│${RESET}`;

const MODEL_COLORS: Record<string, string> = {
  opus: '\x1b[38;5;168m',
  sonnet: '\x1b[38;5;108m',
  haiku: '\x1b[38;5;67m',
};

function getColor(pct: number): string {
  if (pct > 90) return '\x1b[31m';
  if (pct > 75) return '\x1b[38;5;208m';
  if (pct > 50) return '\x1b[33m';
  return '\x1b[32m';
}

function makeBar(pct: number, width: number): string {
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const filled = Math.round(clamped * width / 100);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
}

function coloredMeter(label: string, pct: number, width: number): string {
  const color = getColor(pct);
  const bar = makeBar(pct, width);
  const pctStr = `${Math.round(pct)}%`;
  return `${DIM}${label}${RESET} ${color}${bar} ${pctStr}${RESET}`;
}

// --- 세션 ID ---

function getSessionId(): string | null {
  const sessionFile = join(RUNTIME_ROOT, 'state', 'current-session.json');
  if (!existsSync(sessionFile)) return null;
  try {
    return JSON.parse(readFileSync(sessionFile, 'utf-8')).sessionId ?? null;
  } catch { return null; }
}

// --- Line 1: 모델 + 프로젝트 + 브랜치 + 시간 ---

const VERSION_CACHE_PATH = join(process.env.HOME || '~', '.claude', '.nexus_version_cache');
const VERSION_CACHE_TTL = 86400; // 24시간

function getCurrentVersion(): string {
  try {
    const pluginJson = join(PROJECT_ROOT, '.claude-plugin', 'plugin.json');
    if (existsSync(pluginJson)) {
      const match = readFileSync(pluginJson, 'utf-8').match(/"version"\s*:\s*"([^"]+)"/);
      if (match) return match[1];
    }
  } catch { /* skip */ }
  return '';
}

function checkUpdateAvailable(currentVersion: string): boolean {
  if (!currentVersion) return false;
  const now = Math.floor(Date.now() / 1000);

  // 캐시 읽기
  if (existsSync(VERSION_CACHE_PATH)) {
    try {
      const lines = readFileSync(VERSION_CACHE_PATH, 'utf-8').split('\n');
      const cachedAt = parseInt(lines[0]);
      const latestVersion = lines[1]?.trim() || '';
      if (now - cachedAt < VERSION_CACHE_TTL && latestVersion) {
        return latestVersion !== currentVersion && latestVersion > currentVersion;
      }
    } catch { /* skip */ }
  }

  // 백그라운드에서 최신 버전 확인
  try {
    const script = `RESP=$(curl -s --max-time 3 "https://api.github.com/repos/moreih29/claude-nexus/releases/latest" 2>/dev/null); VER=$(echo "$RESP" | grep -o '"tag_name":"[^"]*"' | sed 's/"tag_name":"v\\{0,1\\}//;s/"//'); [ -n "$VER" ] && printf '%s\\n%s\\n' "$(date +%s)" "$VER" > "${VERSION_CACHE_PATH}.tmp" && mv "${VERSION_CACHE_PATH}.tmp" "${VERSION_CACHE_PATH}"`;
    require('child_process').spawn('sh', ['-c', script], { stdio: 'ignore', detached: true }).unref();
  } catch { /* skip */ }

  // stale 캐시가 있으면 사용
  if (existsSync(VERSION_CACHE_PATH)) {
    try {
      const lines = readFileSync(VERSION_CACHE_PATH, 'utf-8').split('\n');
      const latestVersion = lines[1]?.trim() || '';
      if (latestVersion) return latestVersion !== currentVersion && latestVersion > currentVersion;
    } catch { /* skip */ }
  }

  return false;
}

function buildLine1(): string {
  const model = getVal('display_name') || 'unknown';
  const modelLower = model.toLowerCase();
  const modelColor = Object.entries(MODEL_COLORS).find(([k]) => modelLower.includes(k))?.[1] ?? '\x1b[37m';

  const project = require('path').basename(PROJECT_ROOT);

  // Git
  let gitPart = `${DIM}—${RESET}`;
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const staged = execSync('git diff --cached --numstat', { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().split('\n').filter(Boolean).length;
    const unstaged = execSync('git diff --numstat', { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().split('\n').filter(Boolean).length;
    let dirty = '';
    if (staged > 0) dirty += `\x1b[32m+${staged}${RESET}`;
    if (unstaged > 0) dirty += `\x1b[33m~${unstaged}${RESET}`;
    gitPart = dirty ? `${branch} (${dirty})` : branch;
  } catch { /* skip */ }

  // Nexus 버전 + 업데이트 확인
  const version = getCurrentVersion();
  const updateAvailable = version ? checkUpdateAvailable(version) : false;
  const versionStr = version ? ` v${version}` : '';
  const updateTag = updateAvailable ? ` \x1b[33m↑${RESET}` : '';
  const nexusTag = `\x1b[38;5;141m◆Nexus${versionStr}${RESET}${updateTag}`;

  return `${nexusTag} ${SEP} ${modelColor}${BOLD}${model}${RESET} ${SEP} \x1b[36m${project}${RESET} ${SEP} ${gitPart}`;
}

// --- Line 2: 컨텍스트 + 사용량 ---

interface UsageCache {
  timestamp: number;
  ttl: number;
  data: string;
}

const USAGE_CACHE_PATH = join(process.env.HOME || '~', '.claude', '.usage_cache');
const CACHE_TTL_DEFAULT = 60;
const CACHE_TTL_MAX = 240;

/** 백그라운드에서 OAuth API 호출 → 캐시 파일에 저장 (non-blocking) */
function triggerBackgroundFetch(): void {
  try {
    let tokenCmd = '';
    if (process.platform === 'darwin') {
      tokenCmd = 'TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | grep -o \'"accessToken":"[^"]*"\' | sed \'s/"accessToken":"//;s/"//\')';
    } else {
      const credFile = join(process.env.HOME || '~', '.claude', '.credentials.json');
      tokenCmd = `TOKEN=$(grep -o '"accessToken":"[^"]*"' "${credFile}" 2>/dev/null | sed 's/"accessToken":"//;s/"//')`;
    }

    // 백그라운드 셸에서 API 호출 → 성공 시 캐시 갱신
    const script = `
      ${tokenCmd}
      [ -z "$TOKEN" ] && exit 1
      RESP=$(curl -s --max-time 3 "https://api.anthropic.com/api/oauth/usage" -H "Authorization: Bearer $TOKEN" -H "anthropic-beta: oauth-2025-04-20" 2>/dev/null)
      echo "$RESP" | grep -q "five_hour" && printf '%s\\n%s\\n%s\\n' "$(date +%s)" "${CACHE_TTL_DEFAULT}" "$RESP" > "${USAGE_CACHE_PATH}.tmp" && mv "${USAGE_CACHE_PATH}.tmp" "${USAGE_CACHE_PATH}"
    `;
    require('child_process').spawn('sh', ['-c', script], {
      stdio: 'ignore',
      detached: true,
    }).unref();
  } catch { /* skip */ }
}

const STALE_THRESHOLD = 300; // 5분 이상 미갱신 시에만 [stale] 표시

function getUsage(): { json: string; stale: boolean; ageSeconds: number } | null {
  const now = Math.floor(Date.now() / 1000);
  let currentTtl = CACHE_TTL_DEFAULT;
  let cachedData = '';
  let cacheAge = 0;

  // 캐시 읽기 (여러 세션이 같은 캐시 공유)
  if (existsSync(USAGE_CACHE_PATH)) {
    try {
      const lines = readFileSync(USAGE_CACHE_PATH, 'utf-8').split('\n');
      const cachedAt = parseInt(lines[0]);
      currentTtl = parseInt(lines[1]) || CACHE_TTL_DEFAULT;
      cachedData = lines[2] || '';
      cacheAge = now - cachedAt;

      // TTL 이내: 캐시 반환 (fresh)
      if (cacheAge < currentTtl) {
        return { json: cachedData, stale: false, ageSeconds: cacheAge };
      }
    } catch { /* skip */ }
  }

  // TTL 만료: 백그라운드에서 갱신 트리거 (non-blocking)
  triggerBackgroundFetch();

  // stale 캐시가 있으면 즉시 반환 (5분 이상일 때만 stale 표시)
  if (cachedData) {
    return { json: cachedData, stale: cacheAge >= STALE_THRESHOLD, ageSeconds: cacheAge };
  }

  // 캐시 없음 (최초 실행): 동기 호출 1회 (어쩔 수 없음)
  try {
    let credJson = '';
    if (process.platform === 'darwin') {
      credJson = execSync('security find-generic-password -s "Claude Code-credentials" -w', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } else {
      const credFile = join(process.env.HOME || '~', '.claude', '.credentials.json');
      if (existsSync(credFile)) credJson = readFileSync(credFile, 'utf-8');
    }
    const tokenMatch = credJson.match(/"accessToken"\s*:\s*"([^"]+)"/);
    if (tokenMatch) {
      const resp = execSync(`curl -s --max-time 2 "https://api.anthropic.com/api/oauth/usage" -H "Authorization: Bearer ${tokenMatch[1]}" -H "anthropic-beta: oauth-2025-04-20"`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      if (resp && resp.includes('five_hour')) {
        const cacheContent = `${now}\n${CACHE_TTL_DEFAULT}\n${resp}`;
        try {
          require('fs').writeFileSync(USAGE_CACHE_PATH + '.tmp', cacheContent);
          require('fs').renameSync(USAGE_CACHE_PATH + '.tmp', USAGE_CACHE_PATH);
        } catch {
          try { require('fs').unlinkSync(USAGE_CACHE_PATH + '.tmp'); } catch { /* skip */ }
        }
        return { json: resp, stale: false, ageSeconds: 0 };
      }
    }
  } catch { /* skip */ }

  return null;
}

function extractUtil(json: string, section: string): number {
  const sectionMatch = json.match(new RegExp(`"${section}":\\{[^}]*}`));
  if (!sectionMatch) return 0;
  const utilMatch = sectionMatch[0].match(/"utilization":([0-9.]+)/);
  if (!utilMatch) return 0;
  const val = parseFloat(utilMatch[1]);
  // utilization이 0-1이면 ×100, 이미 퍼센트(>1)이면 그대로
  return val > 1 ? val : val * 100;
}

function extractResetInfo(json: string, section: string): { timeStr: string; remaining: string; remainingCoarse: string; dayStr: string } {
  const empty = { timeStr: '', remaining: '', remainingCoarse: '', dayStr: '' };
  const sectionMatch = json.match(new RegExp(`"${section}":\\{[^}]*}`));
  if (!sectionMatch) return empty;
  const resetMatch = sectionMatch[0].match(/"resets_at":"([^"]+)"/);
  if (!resetMatch) return empty;
  try {
    const d = new Date(resetMatch[1]);
    const now = new Date();
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    // 남은 시간
    const diffMs = d.getTime() - now.getTime();
    let remaining = '';
    let remainingCoarse = ''; // d/h 단위만 (7d용)
    if (diffMs > 0) {
      const diffMin = Math.floor(diffMs / 60000);
      const hh = Math.floor(diffMin / 60);
      const mm = diffMin % 60;
      remaining = hh > 0 ? `${hh}h${mm}m` : `${mm}m`;
      const dd = Math.floor(hh / 24);
      const hhRem = hh % 24;
      remainingCoarse = dd > 0 ? `${dd}d${hhRem}h` : `${hh}h`;
    }

    // 요일 (7d용)
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayStr = days[d.getDay()];

    return { timeStr, remaining, remainingCoarse, dayStr };
  } catch { return empty; }
}

function isApiMode(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Admin API로 오늘의 비용 조회 (ANTHROPIC_ADMIN_KEY 필요) */
function fetchApiCost(adminKey: string): number | null {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const resp = execSync(
      `curl -s --max-time 3 "https://api.anthropic.com/v1/organizations/cost_report?start_date=${today}&end_date=${today}" -H "x-api-key: ${adminKey}" -H "anthropic-version: 2023-06-01"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    // 응답에서 total_cost 추출
    const costMatch = resp.match(/"total_cost"\s*:\s*([0-9.]+)/);
    return costMatch ? parseFloat(costMatch[1]) : null;
  } catch { return null; }
}

function buildLine2(): string {
  const BAR_WIDTH = 6;
  const ctxPct = Math.round(getNum('used_percentage'));
  const ctx = coloredMeter('ctx', ctxPct, BAR_WIDTH);

  if (isApiMode()) {
    // Admin API 키가 있으면 비용 조회 시도
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
    return `${ctx} ${SEP} ${coloredMeter('5h', 0, BAR_WIDTH)} ${SEP} ${coloredMeter('7d', 0, BAR_WIDTH)}`;
  }

  const pct5h = Math.round(extractUtil(usage.json, 'five_hour'));
  const pct7d = Math.round(extractUtil(usage.json, 'seven_day'));
  const { remaining: remain5h } = extractResetInfo(usage.json, 'five_hour');
  const { remainingCoarse: remain7d } = extractResetInfo(usage.json, 'seven_day');

  const m5h = coloredMeter('5h', pct5h, BAR_WIDTH);
  const m7d = coloredMeter('7d', pct7d, BAR_WIDTH);
  const r5h = remain5h ? ` ${DIM}↻${remain5h}${RESET}` : '';
  const r7d = remain7d ? ` ${DIM}↻${remain7d}${RESET}` : '';

  // 캐시 나이 표시 (5분 이상일 때만)
  let stalePart = '';
  if (usage.stale) {
    const ageMin = Math.floor(usage.ageSeconds / 60);
    const hh = Math.floor(ageMin / 60);
    const mm = ageMin % 60;
    const ageStr = hh > 0 ? `${hh}h${mm}m` : `${mm}m`;
    stalePart = ` ${SEP} \x1b[33m${ageStr} ago\x1b[0m`;
  }

  return `${ctx} ${SEP} ${m5h}${r5h} ${SEP} ${m7d}${r7d}${stalePart}`;
}

// --- Line 3: 워크플로우 + 에이전트 + 태스크 ---

function normalizeAgentName(name: string): string {
  return name.replace(/^(nexus|claude-nexus):/, '');
}

function buildLine3(): string {
  const sid = getSessionId();
  let modeDisplay = `💤 idle`;
  let agentCount = 0;
  let taskStr = '0/0';

  if (sid) {
    const sessDir = join(RUNTIME_ROOT, 'state', 'sessions', sid);

    // workflow.json에서 모드 정보 읽기
    const workflowPath = join(sessDir, 'workflow.json');
    try {
      if (existsSync(workflowPath)) {
        const wf = JSON.parse(readFileSync(workflowPath, 'utf-8'));
        const mode: string = wf.mode ?? 'idle';
        const phase: string = wf.phase ?? '';

        if (mode === 'consult') {
          modeDisplay = phase ? `💬 consult: ${phase}` : `💬 consult`;
        } else if (mode === 'plan') {
          modeDisplay = phase ? `📋 plan: ${phase}` : `📋 plan`;
        } else if (mode === 'idle') {
          modeDisplay = `💤 idle`;
        } else {
          modeDisplay = `💤 idle`;
        }
      }
    } catch { /* skip */ }

    // 에이전트 수
    try {
      const agentsPath = join(sessDir, 'agents.json');
      if (existsSync(agentsPath)) {
        const record = JSON.parse(readFileSync(agentsPath, 'utf-8'));
        const active: string[] = record.active ?? [];
        agentCount = active.length;
      }
    } catch { /* skip */ }
  }

  // planning 모드 감지: workflow.json 없고 plans/{branch} 디렉토리가 존재 (main/master 제외)
  if (modeDisplay === `💤 idle`) {
    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      if (branch !== 'main' && branch !== 'master') {
        const branchDir = branch.replace(/\//g, '--');
        const planDir = join(RUNTIME_ROOT, 'plans', branchDir);
        if (existsSync(planDir)) {
          modeDisplay = `📋 planning`;
        }
      }
    } catch { /* skip */ }
  }

  // 태스크 현황 (브랜치별 plans/{branch}/tasks.json)
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const branchDir = branch.replace(/\//g, '--');
    const tasksFile = join(RUNTIME_ROOT, 'plans', branchDir, 'tasks.json');
    if (existsSync(tasksFile)) {
      const tasks: Array<{ status: string }> = JSON.parse(readFileSync(tasksFile, 'utf-8'));
      const total = tasks.length;
      const done = tasks.filter(t => t.status === 'done').length;
      taskStr = `${done}/${total}`;
    }
  } catch { /* skip */ }

  return `${modeDisplay} ${SEP} 🤖 ${agentCount} ${SEP} 📋 ${taskStr}`;
}

// --- 메인 ---

function main() {
  const preset = getPreset();
  const lines: string[] = [buildLine1()];

  if (preset === 'standard' || preset === 'full') {
    lines.push(buildLine2());
  }

  if (preset === 'full') {
    const line3 = buildLine3();
    lines.push(line3 || `${DIM}— idle${RESET}`);
  }

  process.stdout.write(lines.join('\n') + '\n');
}

main();
