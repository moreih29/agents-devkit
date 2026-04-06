// Gate 훅: Stop (Task 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { STATE_ROOT, ensureDir, getCurrentBranch, ensureNexusStructure } from '../shared/paths.js';
import { readTasksSummary } from '../shared/tasks.js';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

const TASK_PIPELINE = `
TASK PIPELINE (mandatory for all file modifications):
1. Check plan.json issues for prior decisions — reference relevant plan_issue IDs in nx_task_add(plan_issue=N).
2. Decompose work into discrete tasks → call nx_task_add for EACH task.
3. Edit/Write tools are BLOCKED without tasks.json.
4. As each task completes → nx_task_update(id, "completed").
5. All tasks done → ask user "close할까요?" (team mode) or nx_task_close directly (Lead solo).`;

function taskPipelineMessage(modeSpecific: string): string {
  // Insert TASK_PIPELINE before the closing </nexus> tag
  return modeSpecific.replace('</nexus>', `${TASK_PIPELINE}</nexus>`);
}

// --- CLAUDE.md 자동 동기화 ---

const MARKER_START = '<!-- NEXUS:START -->';
const MARKER_END = '<!-- NEXUS:END -->';
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT ?? '';

function extractMarkerContent(fileContent: string): string | null {
  const startIdx = fileContent.indexOf(MARKER_START);
  const endIdx = fileContent.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1) return null;
  return fileContent.slice(startIdx + MARKER_START.length, endIdx).trim();
}

function replaceMarkerContent(fileContent: string, newContent: string): string {
  const startIdx = fileContent.indexOf(MARKER_START);
  const endIdx = fileContent.indexOf(MARKER_END);
  return fileContent.slice(0, startIdx + MARKER_START.length) + '\n' + newContent + '\n' + fileContent.slice(endIdx);
}

function handleClaudeMdSync(): string | null {
  // Read template
  const templatePath = join(PLUGIN_ROOT, 'templates', 'nexus-section.md');
  if (!PLUGIN_ROOT || !existsSync(templatePath)) return null;
  const template = readFileSync(templatePath, 'utf-8').trim();

  // --- Global CLAUDE.md auto-update ---
  const globalClaudeMd = join(homedir(), '.claude', 'CLAUDE.md');
  if (existsSync(globalClaudeMd)) {
    const globalContent = readFileSync(globalClaudeMd, 'utf-8');
    const globalMarker = extractMarkerContent(globalContent);
    if (globalMarker !== null && globalMarker !== template) {
      const updated = replaceMarkerContent(globalContent, template);
      writeFileSync(globalClaudeMd, updated);
    }
  }

  // --- Project CLAUDE.md auto-sync ---
  const projectClaudeMd = join(process.cwd(), 'CLAUDE.md');

  if (existsSync(projectClaudeMd)) {
    const projectContent = readFileSync(projectClaudeMd, 'utf-8');
    const projectMarker = extractMarkerContent(projectContent);

    if (projectMarker !== null && projectMarker !== template) {
      const updated = replaceMarkerContent(projectContent, template);
      writeFileSync(projectClaudeMd, updated);
    }
  }

  return null;
}

// --- Stop 이벤트 처리 ---

/** 마지막 nx-sync 이후 N사이클 경과 시 동기화 넛지 반환 */
function getSyncNudge(): string | null {
  const historyPath = join(process.cwd(), '.nexus', 'history.json');
  if (!existsSync(historyPath)) return null;
  try {
    const history = JSON.parse(readFileSync(historyPath, 'utf-8'));
    const cycles = history.cycles ?? [];
    if (cycles.length === 0) return null;
    // 마지막 sync 사이클 찾기
    const lastSyncIdx = cycles.findLastIndex((c: { topics?: string[] }) =>
      c.topics?.some((t: string) => /sync/i.test(t))
    );
    const cyclesSinceSync = lastSyncIdx === -1 ? cycles.length : cycles.length - 1 - lastSyncIdx;
    if (cyclesSinceSync >= 3) {
      return `<nexus>Core knowledge may be outdated (${cyclesSinceSync} cycles since last sync). Consider running /claude-nexus:nx-sync.</nexus>`;
    }
  } catch {}
  return null;
}

function handleStop(event: Record<string, unknown>): void {
  const summary = readTasksSummary(STATE_ROOT);
  if (!summary.exists) {
    // 동기화 넛지만 확인
    const syncNudge = getSyncNudge();
    if (syncNudge) {
      respond({ continue: true, additionalContext: syncNudge });
      return;
    }
    pass();
    return;
  }

  if (summary.pending > 0) {
    respond({
      continue: true,
      additionalContext: `<nexus>${summary.pending} tasks pending in tasks.json. Before stopping:\n1. Review each pending task — verify if work is actually done.\n2. Done → nx_task_update(id, "completed").\n3. Not done → complete the work first.\n4. When all completed → nx_task_close to archive.</nexus>`,
    });
    return;
  }

  // all completed → 1회만 차단 후 해제 (무한 루프 방지)
  // stop_hook_active: 플랫폼이 제공하는 재진입 플래그 — true면 이미 경고 후 재시도
  if (event.stop_hook_active) {
    pass();
    return;
  }
  respond({
    continue: true,
    additionalContext: `<nexus>All tasks completed. Call nx_task_close now.</nexus>`,
  });
}

// --- PreToolUse 이벤트 처리: Agent 직접 호출 차단 + Edit/Write 태스크 강제 ---

/** 예외 경로: Nexus 내부 파일 및 setup/sync 대상 파일은 tasks.json 없이도 수정 허용 */
function isNexusInternalPath(filePath: string): boolean {
  // .nexus/state/ 런타임 상태 — task 없이 수정 허용
  if (/[\\/]\.nexus[\\/]state[\\/]/.test(filePath)) return true;
  // .nexus/config.json — setup 스킬 대상
  if (/[\\/]\.nexus[\\/]config\.json$/.test(filePath)) return true;
  // .claude/settings.json — setup 스킬 대상
  if (/[\\/]\.claude[\\/]settings\.json$/.test(filePath)) return true;
  // CLAUDE.md — sync 스킬 대상
  if (/[\\/]CLAUDE\.md$/.test(filePath)) return true;
  return false;
}

function handlePreToolUse(event: Record<string, unknown>): void {
  const toolName = (event.tool_name ?? '') as string;

  // Edit/Write 도구: [run] 모드(tasks.json 존재)에서만 차단 (Nexus 내부 경로 제외)
  if (toolName === 'Edit' || toolName === 'Write') {
    const tasksPath = join(STATE_ROOT, 'tasks.json');
    if (!existsSync(tasksPath)) {
      // tasks.json 없음 = [run] 모드가 아님 → 자유 수정 허용
      pass();
      return;
    }

    const toolInput = event.tool_input as Record<string, unknown> | undefined;
    const filePath = (toolInput?.file_path ?? '') as string;

    if (!isNexusInternalPath(filePath)) {
      const summary = readTasksSummary(STATE_ROOT);
      // [run] 모드: 모든 태스크 완료 시 nx_task_close 강제
      if (summary.allCompleted || summary.total === 0) {
        respond({
          decision: 'block',
          reason: '<nexus>All tasks completed. Call nx_task_close to archive, or nx_task_add to register additional tasks.</nexus>',
        });
        return;
      }
    }

    pass();
    return;
  }

  pass();
}

// --- UserPromptSubmit 이벤트 처리: 키워드 감지 ---

interface KeywordMatch {
  primitive: 'plan' | 'run';
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  plan: { primitive: 'plan', skill: 'claude-nexus:nx-plan' },
  'plan:auto': { primitive: 'plan', skill: 'claude-nexus:nx-plan' },
  run: { primitive: 'run', skill: 'claude-nexus:nx-run' },
};

const NATURAL_PATTERNS: Array<{ patterns: RegExp[]; match: KeywordMatch }> = [
  {
    patterns: [
      /\bplan\b/i, /계획/, /설계/, /분석해/, /검토해/,
      /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/,
    ],
    match: { primitive: 'plan', skill: 'claude-nexus:nx-plan' },
  },
];

// 프리미티브 이름이 에러/버그 맥락에서 언급되면 활성화가 아닌 "대화" — 오탐 방지
const ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
const PRIMITIVE_NAMES = /\b(plan|run)\b/i;

/** 프리미티브 이름이 에러/버그 맥락과 함께 등장하거나, 단순 질문/인용 맥락인지 판별 */
function isPrimitiveMention(prompt: string): boolean {
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  if (/[`"'](?:plan)[`"']/i.test(prompt)) return true;
  return false;
}

function detectKeywords(prompt: string): KeywordMatch | null {
  // 1차: 명시적 태그 [plan] / [plan:auto] — 항상 확정
  const tagMatch = prompt.match(/\[(plan(?::auto)?|run)\]/i);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    if (tag in EXPLICIT_TAGS) return EXPLICIT_TAGS[tag];
  }

  // 2차: 자연어 패턴 (프리미티브 이름 + 에러 맥락일 때만 필터)
  for (const { patterns, match } of NATURAL_PATTERNS) {
    if (patterns.some((p) => p.test(prompt))) {
      if (isPrimitiveMention(prompt)) continue;
      return match;
    }
  }

  return null;
}

function getTasksReminder(): string | null {
  const summary = readTasksSummary(STATE_ROOT);
  if (!summary.exists) return null;
  if (summary.pending > 0) {
    return `<nexus>${summary.pending} pending tasks. Complete work → nx_task_update(id, "completed") for each done task. Archive with nx_task_close when all complete.</nexus>`;
  }
  return `<nexus>All ${summary.total} tasks completed but not archived. MANDATORY: Call nx_task_close to archive this cycle.</nexus>`;
}

function getPlanReminder(): string | null {
  const planFilePath = join(STATE_ROOT, 'plan.json');
  if (!existsSync(planFilePath)) return null;
  try {
    const data = JSON.parse(readFileSync(planFilePath, 'utf-8'));
    const issues = data.issues ?? [];
    const pending = issues.filter((i: { status: string }) => i.status === 'pending');
    const current = pending.length > 0
      ? `Next: #${pending[0].id} "${pending[0].title}"`
      : 'All issues decided.';
    return `<nexus>Plan: "${data.topic}" | ${current} | ${pending.length} pending\nPresent comparison table with pros/cons/recommendation. Record decisions with [d].</nexus>`;
  } catch {
    return null;
  }
}

// --- Core Knowledge 인덱스 빌드 ---

const CORE_LAYERS = ['identity', 'codebase', 'reference', 'memory'] as const;

function buildCoreIndex(): string {
  const coreRoot = join(process.cwd(), '.nexus', 'core');
  if (!existsSync(coreRoot)) return '';

  const layerLines: string[] = [];

  for (const layer of CORE_LAYERS) {
    const layerDir = join(coreRoot, layer);
    if (!existsSync(layerDir)) continue;

    let files: string[];
    try {
      files = readdirSync(layerDir).filter(f => f.endsWith('.md'));
    } catch {
      continue;
    }
    if (files.length === 0) continue;

    const entries: string[] = [];
    for (const file of files) {
      const name = basename(file, '.md');
      const filePath = join(layerDir, file);
      let tags = '';
      try {
        const content = readFileSync(filePath, 'utf-8');
        const tagMatch = content.match(/<!--\s*tags:\s*([^-]+?)\s*-->/);
        if (tagMatch) {
          const tagList = tagMatch[1].split(',').map(t => t.trim()).filter(Boolean);
          // keep only the most distinctive tags (up to 3, skip redundant ones)
          const shortTags = tagList.slice(0, 3).join(', ');
          tags = ` [${shortTags}]`;
        }
      } catch {}
      entries.push(`${name}${tags}`);
    }
    layerLines.push(`${layer}: ${entries.join(', ')}`);
  }

  if (layerLines.length === 0) return '';

  const header = '[Core Knowledge] (call nx_core_read for details)';
  const result = `${header}\n${layerLines.join('\n')}`;
  return result.length <= 2000 ? result : result.slice(0, 1997) + '...';
}

/** additionalContext에 notices를 자동 병합 */
function withNotices(base: string, tasksReminder: string | null, claudeMdNotice: string | null, planReminder?: string | null): string {
  return [planReminder, tasksReminder, base, claudeMdNotice].filter(Boolean).join('\n');
}

// --- 개별 프리미티브 핸들러 ---

type PrimitiveHandler = (params: {
  prompt: string;
  tasksReminder: string | null;
  claudeMdNotice: string | null;
}) => void;

function handleRuleMode({ tasksReminder, claudeMdNotice, ruleTags }: {
  prompt: string;
  tasksReminder: string | null;
  claudeMdNotice: string | null;
  ruleTags: string[] | null;
}): void {
  const tagInfo = ruleTags
    ? `Tags: [${ruleTags.join(', ')}] — include at top of rule file as <!-- tags: ${ruleTags.join(', ')} -->.`
    : 'Tags: none — infer appropriate tags from rule content and add them.';

  const base = `<nexus>Rule mode — saving user instruction as a project rule.
${tagInfo}
1. Extract and clean up rule content from the user message.
2. Save to .nexus/rules/{name}.md via nx_rules_write(name, content).
Rules are git-tracked and auto-delivered to agents via nx_briefing hint tag filtering.
Task pipeline not required — save directly.</nexus>`;

  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice),
  });
}

function handlePlanMode({ prompt, tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  // 2차 안전망: 이전 사이클의 stale tasks.json 감지
  const staleSummary = readTasksSummary(STATE_ROOT);
  if (staleSummary.exists && staleSummary.allCompleted) {
    respond({
      continue: true,
      additionalContext: `<nexus>⚠ Previous cycle not closed — tasks.json exists with all tasks completed. Call nx_task_close first to archive before starting a new plan.</nexus>`,
    });
    return;
  }

  const isAuto = /\[plan:auto\]/i.test(prompt);
  const planFile = join(STATE_ROOT, 'plan.json');
  const hasExistingSession = existsSync(planFile);

  let hints = '';
  if (hasExistingSession) {
    hints = '\nExisting plan session detected — check nx_plan_status to resume.';
  }
  if (isAuto) {
    hints += '\nAuto mode requested — pass args: "auto" to the skill.';
  }

  const base = `<nexus>BLOCKING: Invoke Skill tool with skill="claude-nexus:nx-plan"${isAuto ? ', args: "auto"' : ''} BEFORE any other action. Do NOT attempt planning without loading the skill first.${hints}</nexus>`;
  const coreIndex = buildCoreIndex();
  const coreSection = coreIndex
    ? `\n${coreIndex}\nCheck core/reference/ BEFORE web searching for known topics.`
    : '';
  respond({
    continue: true,
    additionalContext: withNotices(base + coreSection, tasksReminder, claudeMdNotice, null),
  });
}

function handleRunMode({ tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  const planReminder = getPlanReminder();
  const tasksSummary = readTasksSummary(STATE_ROOT);

  let hints = '';
  if (!tasksSummary.exists) {
    hints = '\ntasks.json absent — plan required before execution. Suggest [plan:auto] or [plan].';
  } else {
    hints = `\ntasks.json: ${tasksSummary.pending} pending, ${tasksSummary.total - tasksSummary.pending} completed of ${tasksSummary.total} tasks.`;
  }

  const coreIndex = buildCoreIndex();
  const coreSection = coreIndex ? `\n${coreIndex}` : '';
  const base = `<nexus>BLOCKING: Invoke Skill tool with skill="claude-nexus:nx-run" BEFORE any other action. Do NOT attempt execution without loading the skill first.${hints}</nexus>${coreSection}`;
  respond({
    continue: true,
    additionalContext: withNotices(taskPipelineMessage(base), tasksReminder, claudeMdNotice, planReminder),
  });
}

const PRIMITIVE_HANDLERS: Record<string, PrimitiveHandler> = {
  plan: handlePlanMode,
  run: handleRunMode,
};

function handleUserPromptSubmit(event: Record<string, unknown>): void {
  const claudeMdNotice = handleClaudeMdSync();
  const tasksReminder = getTasksReminder();
  const planReminder = getPlanReminder();

  const raw = event.prompt ?? event.user_prompt ?? '';
  const prompt = typeof raw === 'string' ? raw : String(raw);
  if (!prompt) { pass(); return; }

  // [d] 결정 태그 감지 — plan.json 유무로 도구 분기 + 행동 규칙 주입
  const dTag = prompt.match(/\[d\]/i);
  if (dTag) {
    const postDecisionRules = `\n\nRecord decision only. For implementation, use [run].`;
    const planFile = join(STATE_ROOT, 'plan.json');
    if (existsSync(planFile)) {
      respond({
        continue: true,
        additionalContext: withNotices(`<nexus>Decision tag detected in plan mode. Use nx_plan_decide(issue_id, summary) to record.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, planReminder),
      });
    } else {
      respond({
        continue: true,
        additionalContext: withNotices(`<nexus>[d]는 plan 세션 안에서만 유효합니다. [plan] 태그로 플래닝을 먼저 시작하세요.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, null),
      });
    }
    return;
  }

  // [rule] 규칙 저장 태그 감지
  const ruleMatch = prompt.match(/\[rule(?::([^\]]+))?\]/i);
  if (ruleMatch) {
    const rawTags = ruleMatch[1];
    const ruleTags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : null;
    handleRuleMode({ prompt, tasksReminder, claudeMdNotice, ruleTags });
    return;
  }

  const match = detectKeywords(prompt);
  if (match) {
    const handler = PRIMITIVE_HANDLERS[match.primitive];
    if (handler) {
      handler({ prompt, tasksReminder, claudeMdNotice });
      return;
    }
  }

  // 태그 없음 — 자유 모드
  const summary = readTasksSummary(STATE_ROOT);

  // tasks.json 있음(=[run] 진행 중) + pending → 스마트 resume
  if (summary.exists && summary.pending > 0) {
    respond({
      continue: true,
      additionalContext: withNotices(`<nexus>Active [run] session detected (${summary.pending} pending tasks). Resume execution or use nx_task_close to archive.</nexus>`, tasksReminder, claudeMdNotice, planReminder),
    });
    return;
  }

  // tasks.json 있음 + all completed → stale cycle
  if (summary.exists && (summary.allCompleted || summary.total === 0)) {
    respond({
      continue: true,
      additionalContext: withNotices(`<nexus>Stale tasks.json from previous [run]. Call nx_task_close to archive.</nexus>`, tasksReminder, claudeMdNotice, planReminder),
    });
    return;
  }

  // tasks.json 없음 = 자유 모드. 최소한의 컨텍스트만 주입.
  const notices = [planReminder, claudeMdNotice].filter(Boolean).join('\n');
  if (notices) {
    respond({ continue: true, additionalContext: notices });
  } else {
    pass();
  }
}

// --- 세션 이벤트 핸들러 ---

function handleSessionStart(_event: Record<string, unknown>): void {
  ensureNexusStructure();
  writeFileSync(join(STATE_ROOT, 'agent-tracker.json'), '[]');
  pass();
}

function handleSubagentStart(event: Record<string, unknown>): void {
  const agentType = String(event.agent_type ?? '');
  const agentId = String(event.agent_id ?? '');

  const trackerPath = join(STATE_ROOT, 'agent-tracker.json');
  let tracker: Record<string, unknown>[] = [];
  if (existsSync(trackerPath)) {
    try { tracker = JSON.parse(readFileSync(trackerPath, 'utf-8')); } catch {}
  }

  tracker.push({ agent_type: agentType, agent_id: agentId, started_at: new Date().toISOString(), status: 'running' });

  ensureDir(STATE_ROOT);
  writeFileSync(trackerPath, JSON.stringify(tracker, null, 2));
  pass();
}

function handleSubagentStop(event: Record<string, unknown>): void {
  const agentId = String(event.agent_id ?? '');
  const agentType = String(event.agent_type ?? '');
  const lastMsg = String(event.last_assistant_message ?? event.last_message ?? '');

  const trackerPath = join(STATE_ROOT, 'agent-tracker.json');
  if (existsSync(trackerPath)) {
    try {
      const tracker = JSON.parse(readFileSync(trackerPath, 'utf-8')) as Record<string, unknown>[];
      const entry = tracker.find((a) => a.agent_id === agentId);
      if (entry) {
        entry.status = 'completed';
        entry.last_message = lastMsg;
        entry.stopped_at = new Date().toISOString();
      }
      writeFileSync(trackerPath, JSON.stringify(tracker, null, 2));
    } catch {}
  }

  // [run] 모드: 에이전트의 담당 태스크가 미완료면 경고
  const tasksPath = join(STATE_ROOT, 'tasks.json');
  if (existsSync(tasksPath)) {
    try {
      const tasksData = JSON.parse(readFileSync(tasksPath, 'utf-8'));
      const tasks = tasksData.tasks ?? [];
      const ownedPending = tasks.filter((t: { owner?: string; status: string }) =>
        t.owner === agentType && (t.status === 'pending' || t.status === 'in_progress')
      );
      if (ownedPending.length > 0) {
        const ids = ownedPending.map((t: { id: number }) => `#${t.id}`).join(', ');
        respond({
          continue: true,
          additionalContext: `<nexus>Agent "${agentType}" stopped but has ${ownedPending.length} incomplete task(s): ${ids}. Re-spawn the agent or complete the work manually.</nexus>`,
        });
        return;
      }
    } catch {}
  }

  pass();
}

// --- PostCompact 이벤트 처리: 컴팩션 후 세션 상태 복원 ---

function handlePostCompact(_event: Record<string, unknown>): void {
  const lines: string[] = ['Session restored after compaction.'];

  // Mode + tasks
  const summary = readTasksSummary(STATE_ROOT);
  if (summary.exists) {
    lines.push(`[Mode]: run (${summary.pending} pending / ${summary.completed} completed tasks)`);
  }

  // Plan
  const planFilePath = join(STATE_ROOT, 'plan.json');
  if (existsSync(planFilePath)) {
    try {
      const data = JSON.parse(readFileSync(planFilePath, 'utf-8'));
      const issues = data.issues ?? [];
      const discussing = issues.find((i: { status: string }) => i.status === 'discussing');
      const pending = issues.filter((i: { status: string }) => i.status === 'pending');
      let issueInfo: string;
      if (discussing) {
        issueInfo = `issue #${discussing.id} discussing, ${pending.length > 0 ? `#${pending.map((i: { id: number }) => i.id).join('-#')} pending` : 'none pending'}`;
      } else if (pending.length > 0) {
        issueInfo = `#${pending.map((i: { id: number }) => i.id).join('-#')} pending`;
      } else {
        issueInfo = 'all issues decided';
      }
      lines.push(`[Plan]: "${data.topic}" — ${issueInfo}`);
    } catch {}
  }

  // Core knowledge file count
  const coreRoot = join(process.cwd(), '.nexus', 'core');
  if (existsSync(coreRoot)) {
    try {
      let totalFiles = 0;
      for (const layer of CORE_LAYERS) {
        const layerDir = join(coreRoot, layer);
        if (existsSync(layerDir)) {
          totalFiles += readdirSync(layerDir).filter(f => f.endsWith('.md')).length;
        }
      }
      if (totalFiles > 0) {
        lines.push(`[Core]: ${totalFiles} files across ${CORE_LAYERS.length} layers`);
      }
    } catch {}
  }

  // Agents
  const trackerPath = join(STATE_ROOT, 'agent-tracker.json');
  if (existsSync(trackerPath)) {
    try {
      const tracker = JSON.parse(readFileSync(trackerPath, 'utf-8')) as Array<{ agent_type?: string; status?: string }>;
      if (tracker.length > 0) {
        const agentParts = tracker.map(a => `${a.agent_type ?? 'unknown'} (${a.status ?? 'unknown'})`);
        lines.push(`[Agents]: ${agentParts.join(', ')}`);
      }
    } catch {}
  }

  const snapshot = `<nexus>\n${lines.join('\n')}\n</nexus>`;
  respond({ continue: true, additionalContext: snapshot });
}

// --- 메인 ---

async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);

  const eventName = event.hook_event_name ?? '';

  switch (eventName) {
    case 'SessionStart':
      handleSessionStart(event);
      break;
    case 'SubagentStart':
      handleSubagentStart(event);
      break;
    case 'SubagentStop':
      handleSubagentStop(event);
      break;
    case 'PreToolUse':
      handlePreToolUse(event);
      break;
    case 'UserPromptSubmit':
      handleUserPromptSubmit(event);
      break;
    case 'Stop':
      handleStop(event);
      break;
    case 'PreCompact':
      pass();
      break;
    case 'PostCompact':
      handlePostCompact(event);
      break;
    default:
      pass();
  }
}

main().catch(() => {
  respond({ continue: true });
});
