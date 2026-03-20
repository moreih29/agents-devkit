#!/usr/bin/env node
// Nexus 상태라인 — Claude Code statusLine.command로 실행
// stdin: Claude Code가 제공하는 JSON (display_name, used_percentage, cwd, transcript_path 등)

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
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
  const env = process.env.LATTICE_STATUSLINE;
  if (env === 'minimal' || env === 'standard' || env === 'full') return env;
  const presetFile = join(RUNTIME_ROOT, 'statusline-preset.json');
  if (existsSync(presetFile)) {
    try {
      const data = JSON.parse(readFileSync(presetFile, 'utf-8'));
      if (data.preset === 'minimal' || data.preset === 'standard' || data.preset === 'full') return data.preset;
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

  // 시간
  const now = new Date();
  const timeStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let sessionTime = '';
  const transcriptPath = getVal('transcript_path');
  if (transcriptPath && existsSync(transcriptPath)) {
    try {
      const mtime = statSync(transcriptPath).mtime;
      // 파일 첫 줄의 timestamp로 세션 시작 시간 추정
      const firstLine = readFileSync(transcriptPath, 'utf-8').split('\n')[0];
      const tsMatch = firstLine.match(/"timestamp"\s*:\s*"([^"]+)"/);
      if (tsMatch) {
        const start = new Date(tsMatch[1]);
        const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000);
        const hh = Math.floor(elapsed / 3600);
        const mm = Math.floor((elapsed % 3600) / 60);
        sessionTime = hh > 0 ? `${hh}h${mm}m` : `${mm}m`;
      }
    } catch { /* skip */ }
  }

  const timePart = sessionTime ? `${DIM}${timeStr} (${sessionTime})${RESET}` : `${DIM}${timeStr}${RESET}`;
  // 버전 읽기
  let version = '';
  try {
    const pkgPath = join(PROJECT_ROOT, 'node_modules', 'claude-nexus', 'package.json');
    const pluginPkgPath = join(__dirname, '..', 'package.json');
    const localPkgPath = join(PROJECT_ROOT, 'package.json');
    for (const p of [pkgPath, pluginPkgPath, localPkgPath]) {
      if (existsSync(p)) {
        const pkg = JSON.parse(readFileSync(p, 'utf-8'));
        if (pkg.name === 'claude-nexus' && pkg.version) { version = pkg.version; break; }
      }
    }
  } catch { /* skip */ }
  const versionStr = version ? ` ${DIM}v${version}${RESET}` : '';
  const nexusTag = `\x1b[38;5;141m◆Nexus${RESET}${versionStr}`;

  return `${nexusTag} ${SEP} ${modelColor}${BOLD}${model}${RESET} ${SEP} \x1b[36m${project}${RESET} ${SEP} ${gitPart} ${SEP} ${timePart}`;
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
      echo "$RESP" | grep -q "five_hour" && printf '%s\\n%s\\n%s\\n' "$(date +%s)" "${CACHE_TTL_DEFAULT}" "$RESP" > "${USAGE_CACHE_PATH}"
    `;
    require('child_process').spawn('sh', ['-c', script], {
      stdio: 'ignore',
      detached: true,
    }).unref();
  } catch { /* skip */ }
}

function getUsage(): { json: string; stale: boolean } | null {
  const now = Math.floor(Date.now() / 1000);
  let currentTtl = CACHE_TTL_DEFAULT;
  let cachedData = '';

  // 캐시 읽기 (여러 세션이 같은 캐시 공유)
  if (existsSync(USAGE_CACHE_PATH)) {
    try {
      const lines = readFileSync(USAGE_CACHE_PATH, 'utf-8').split('\n');
      const cachedAt = parseInt(lines[0]);
      currentTtl = parseInt(lines[1]) || CACHE_TTL_DEFAULT;
      cachedData = lines[2] || '';

      // TTL 이내: 캐시 반환 (fresh)
      if (now - cachedAt < currentTtl) {
        return { json: cachedData, stale: false };
      }
    } catch { /* skip */ }
  }

  // TTL 만료: 백그라운드에서 갱신 트리거 (non-blocking)
  triggerBackgroundFetch();

  // stale 캐시가 있으면 즉시 반환
  if (cachedData) {
    return { json: cachedData, stale: true };
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
        try { require('fs').writeFileSync(USAGE_CACHE_PATH, cacheContent); } catch { /* skip */ }
        return { json: resp, stale: false };
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

function extractResetInfo(json: string, section: string): { timeStr: string; remaining: string; dayStr: string } {
  const empty = { timeStr: '', remaining: '', dayStr: '' };
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
    if (diffMs > 0) {
      const diffMin = Math.floor(diffMs / 60000);
      const hh = Math.floor(diffMin / 60);
      const mm = diffMin % 60;
      remaining = hh > 0 ? `${hh}h${mm}m` : `${mm}m`;
    }

    // 요일 (7d용)
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayStr = days[d.getDay()];

    return { timeStr, remaining, dayStr };
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
  const BAR_WIDTH = 7;
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
  if (!usage || !usage.json) return ctx;

  const pct5h = Math.round(extractUtil(usage.json, 'five_hour'));
  const pct7d = Math.round(extractUtil(usage.json, 'seven_day'));
  const { timeStr: reset5h, remaining: remain5h } = extractResetInfo(usage.json, 'five_hour');
  const { timeStr: reset7d, remaining: remain7d, dayStr: resetDay } = extractResetInfo(usage.json, 'seven_day');

  const m5h = coloredMeter('5h', pct5h, BAR_WIDTH);
  const m7d = coloredMeter('7d', pct7d, BAR_WIDTH);
  const r5h = reset5h ? ` ${DIM}~${reset5h}${remain5h ? ` (${remain5h})` : ''}${RESET}` : '';
  const r7d = reset7d ? ` ${DIM}~${resetDay ? `${resetDay} ` : ''}${reset7d}${remain7d ? ` (${remain7d})` : ''}${RESET}` : '';
  const staleTag = usage.stale ? ` \x1b[33m[stale]\x1b[0m` : '';

  return `${ctx} ${SEP} ${m5h}${r5h} ${SEP} ${m7d}${r7d}${staleTag}`;
}

// --- Line 3: 워크플로우 + 에이전트 + 태스크 + 도구 ---

function buildLine3(): string {
  const sid = getSessionId();
  const workflowParts: string[] = [];
  let agentStr = '';
  let toolCount = 0;
  let taskStr = '';

  if (sid) {
    const sessDir = join(RUNTIME_ROOT, 'state', 'sessions', sid);

    // 워크플로우 상태
    const nonstopPath = join(sessDir, 'nonstop.json');
    const pipelinePath = join(sessDir, 'pipeline.json');
    const parallelPath = join(sessDir, 'parallel.json');

    let nonstopActive = false;
    try {
      if (existsSync(nonstopPath)) {
        const s = JSON.parse(readFileSync(nonstopPath, 'utf-8'));
        if (s.active) { nonstopActive = true; workflowParts.push(`▶ nonstop ${s.currentIteration ?? 0}/${s.maxIterations ?? 100}`); }
      }
    } catch { /* skip */ }

    try {
      if (existsSync(pipelinePath)) {
        const p = JSON.parse(readFileSync(pipelinePath, 'utf-8'));
        if (p.active) {
          const stage = p.currentStage ? `${p.currentStage} ${(p.currentStageIndex ?? 0) + 1}/${p.totalStages ?? '?'}` : 'init';
          if (nonstopActive) {
            workflowParts.length = 0;
            workflowParts.push(`▶ auto (${stage})`);
          } else {
            workflowParts.push(`▶ pipeline (${stage})`);
          }
        }
      }
    } catch { /* skip */ }

    try {
      if (existsSync(parallelPath)) {
        const p = JSON.parse(readFileSync(parallelPath, 'utf-8'));
        if (p.active) workflowParts.push(`🔀 parallel ${p.completedCount ?? 0}/${p.totalCount ?? 0}`);
      }
    } catch { /* skip */ }

    // 에이전트
    try {
      const agentsPath = join(sessDir, 'agents.json');
      if (existsSync(agentsPath)) {
        const record = JSON.parse(readFileSync(agentsPath, 'utf-8'));
        const active: string[] = record.active ?? [];
        if (active.length > 0) {
          const counts: Record<string, number> = {};
          for (const a of active) counts[a] = (counts[a] ?? 0) + 1;
          agentStr = Object.entries(counts).map(([name, count]) => count > 1 ? `${name}×${count}` : name).join(' ');
        }
      }
    } catch { /* skip */ }

    // 도구 호출 수
    try {
      const trackerPath = join(sessDir, 'whisper-tracker.json');
      if (existsSync(trackerPath)) {
        const t = JSON.parse(readFileSync(trackerPath, 'utf-8'));
        toolCount = t.toolCallCount ?? 0;
      }
    } catch { /* skip */ }
  }

  // 태스크 현황
  const tasksDir = join(KNOWLEDGE_ROOT, 'tasks');
  try {
    if (existsSync(tasksDir)) {
      const files = readdirSync(tasksDir).filter(f => f.endsWith('.json'));
      let inProgress = 0, todo = 0;
      for (const file of files) {
        try {
          const task = JSON.parse(readFileSync(join(tasksDir, file), 'utf-8'));
          if (task.status === 'in_progress') inProgress++;
          else if (task.status === 'todo') todo++;
        } catch { /* skip */ }
      }
      const tp: string[] = [];
      if (inProgress > 0) tp.push(`${inProgress} active`);
      if (todo > 0) tp.push(`${todo} todo`);
      if (tp.length > 0) taskStr = tp.join(', ');
    }
  } catch { /* skip */ }

  // 조합: 항상 기본값 표시
  const parts: string[] = [];
  if (workflowParts.length > 0) {
    parts.push(workflowParts.join(' '));
  } else {
    parts.push(`${DIM}— idle${RESET}`);
  }
  parts.push(`🤖 ${agentStr || '0'}`);
  parts.push(`🔧 ${toolCount}`);
  parts.push(`📝 ${taskStr || '0'}`);

  return parts.join(` ${SEP} `);
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
