#!/usr/bin/env node
// Nexus 상태라인 — Claude Code statusLine.command로 실행
// stdin: Claude Code가 제공하는 JSON (display_name, used_percentage, cwd, transcript_path 등)

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getCurrentVersion } from '../shared/version';
import { findProjectRoot } from '../shared/paths';

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

const PROJECT_ROOT = findProjectRoot(getVal('cwd') || process.cwd());
const KNOWLEDGE_ROOT = join(PROJECT_ROOT, '.claude', 'nexus');

// --- Preset ---

type Preset = 'minimal' | 'full';

function getPreset(): Preset {
  const env = process.env.NEXUS_STATUSLINE || process.env.LATTICE_STATUSLINE;
  if (env === 'minimal' || env === 'full') return env;
  const configFile = join(KNOWLEDGE_ROOT, 'config.json');
  if (existsSync(configFile)) {
    try {
      const data = JSON.parse(readFileSync(configFile, 'utf-8'));
      const p = data.statuslinePreset;
      if (p === 'minimal' || p === 'full') return p;
    } catch { /* skip */ }
  }
  return 'full';
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

// --- Line 1: 모델 + 프로젝트 + 브랜치 + 시간 ---

const VERSION_CACHE_PATH = join(process.env.HOME || '~', '.claude', '.nexus_version_cache');
const VERSION_CACHE_TTL = 86400; // 24시간

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

const USAGE_CACHE_PATH = join(process.env.HOME || '~', '.claude', '.usage_cache');
const CACHE_TTL_DEFAULT = 60;    // 정상 fetch 주기 (초)
const FETCH_BACKOFF = 300;       // 실패 시 백오프 (초)

/** 캐시 파일 원자적 쓰기 (tmp + rename) */
function writeCacheAtomic(content: string): void {
  try {
    require('fs').writeFileSync(USAGE_CACHE_PATH + '.tmp', content);
    require('fs').renameSync(USAGE_CACHE_PATH + '.tmp', USAGE_CACHE_PATH);
  } catch {
    try { require('fs').unlinkSync(USAGE_CACHE_PATH + '.tmp'); } catch { /* skip */ }
  }
}

/**
 * 백그라운드에서 OAuth API 호출 → 캐시 파일에 저장 (non-blocking)
 *
 * 캐시 포맷 (3줄):
 *   {data_timestamp}     ← 데이터가 실제 fetch된 시점 (stale 표시용)
 *   {next_fetch_after}   ← 이 시점 이후에만 다음 fetch 허용 (경합 방지 + 백오프)
 *   {data}               ← JSON 응답
 */
function triggerBackgroundFetch(dataTimestamp: number, cachedData: string): void {
  const now = Math.floor(Date.now() / 1000);

  // 스폰 전에 next_fetch_after를 즉시 갱신 → 다른 세션의 중복 fetch 방지
  if (cachedData) {
    writeCacheAtomic(`${dataTimestamp}\n${now + CACHE_TTL_DEFAULT}\n${cachedData}`);
  }

  try {
    let tokenCmd = '';
    if (process.platform === 'darwin') {
      tokenCmd = 'TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null | grep -o \'"accessToken":"[^"]*"\' | sed \'s/"accessToken":"//;s/"//\')';
    } else {
      const credFile = join(process.env.HOME || '~', '.claude', '.credentials.json');
      tokenCmd = `TOKEN=$(grep -o '"accessToken":"[^"]*"' "${credFile}" 2>/dev/null | sed 's/"accessToken":"//;s/"//')`;
    }

    // 셸 스크립트: 성공 시 새 데이터 + TTL, 실패 시 기존 데이터 + 백오프
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
    require('child_process').spawn('sh', ['-c', script], {
      stdio: 'ignore',
      detached: true,
    }).unref();
  } catch { /* skip */ }
}

const STALE_THRESHOLD = 300; // 5분 이상 미갱신 시에만 stale 표시

function getUsage(): { json: string; stale: boolean; ageSeconds: number } | null {
  const now = Math.floor(Date.now() / 1000);
  let dataTimestamp = 0;
  let nextFetchAfter = 0;
  let cachedData = '';

  // 캐시 읽기 (여러 세션이 같은 캐시 공유)
  if (existsSync(USAGE_CACHE_PATH)) {
    try {
      const lines = readFileSync(USAGE_CACHE_PATH, 'utf-8').split('\n');
      dataTimestamp = parseInt(lines[0]) || 0;
      const line1 = parseInt(lines[1]) || 0;

      // 포맷 감지: line1이 unix timestamp(> 1_000_000)이면 새 포맷, 아니면 구 포맷(ttl)
      if (line1 > 1_000_000) {
        nextFetchAfter = line1;
        cachedData = lines[2] || '';
      } else {
        // 구 포맷 호환: timestamp + ttl → next_fetch_after로 변환
        nextFetchAfter = dataTimestamp + (line1 || CACHE_TTL_DEFAULT);
        cachedData = lines[2] || '';
      }
    } catch { /* skip */ }
  }

  const dataAge = dataTimestamp > 0 ? now - dataTimestamp : 0;

  // fetch 쿨다운 이내: 캐시 반환 (fresh 또는 stale)
  if (cachedData && now < nextFetchAfter) {
    return { json: cachedData, stale: dataAge >= STALE_THRESHOLD, ageSeconds: dataAge };
  }

  // fetch 쿨다운 만료 + 데이터 있음: 백그라운드 갱신 후 stale 반환
  if (cachedData) {
    triggerBackgroundFetch(dataTimestamp, cachedData);
    return { json: cachedData, stale: dataAge >= STALE_THRESHOLD, ageSeconds: dataAge };
  }

  // 캐시 없음 (최초 실행): 동기 호출 1회
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
        writeCacheAtomic(`${now}\n${now + CACHE_TTL_DEFAULT}\n${resp}`);
        return { json: resp, stale: false, ageSeconds: 0 };
      }
    }
  } catch { /* skip */ }

  return null;
}

function extractUtil(parsed: Record<string, unknown> | null, section: string): number {
  if (!parsed) return 0;
  const sectionData = parsed[section] as Record<string, unknown> | undefined;
  // API는 퍼센트 값 반환 (2.0 = 2%, 56.0 = 56%)
  return Number(sectionData?.utilization) || 0;
}

function extractResetInfo(parsed: Record<string, unknown> | null, section: string): { timeStr: string; remaining: string; remainingCoarse: string; dayStr: string } {
  const empty = { timeStr: '', remaining: '', remainingCoarse: '', dayStr: '' };
  if (!parsed) return empty;
  const sectionData = parsed[section] as Record<string, unknown> | undefined;
  const resetAt = sectionData?.resets_at as string | undefined;
  if (!resetAt) return empty;
  try {
    const d = new Date(resetAt);
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

  const noData = (label: string) => `${DIM}${label} ${'░'.repeat(BAR_WIDTH)} --%${RESET}`;

  const usage = getUsage();
  if (!usage || !usage.json) {
    return `${ctx} ${SEP} ${noData('5h')} ${SEP} ${noData('7d')}`;
  }

  let usageParsed: Record<string, unknown> | null = null;
  try { usageParsed = JSON.parse(usage.json); } catch { /* skip */ }

  if (!usageParsed) {
    return `${ctx} ${SEP} ${noData('5h')} ${SEP} ${noData('7d')}`;
  }

  const pct5h = Math.round(extractUtil(usageParsed, 'five_hour'));
  const pct7d = Math.round(extractUtil(usageParsed, 'seven_day'));
  const { remaining: remain5h } = extractResetInfo(usageParsed, 'five_hour');
  const { remainingCoarse: remain7d } = extractResetInfo(usageParsed, 'seven_day');

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

// --- 메인 ---

function main() {
  const preset = getPreset();
  const lines: string[] = [buildLine1()];

  if (preset === 'full') {
    lines.push(buildLine2());
  }

  process.stdout.write(lines.join('\n') + '\n');
}

main();
