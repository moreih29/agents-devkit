// Gate 훅: Stop (Task 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { STATE_ROOT, ensureDir, getCurrentBranch, ensureNexusStructure } from '../shared/paths.js';
import { readTasksSummary } from '../shared/tasks.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TASK_PIPELINE = `
TASK PIPELINE (mandatory for all file modifications):
1. Check decisions.json for prior decisions — reference relevant IDs in nx_task_add(decisions=[...]).
2. Decompose work into discrete tasks → call nx_task_add for EACH task.
3. Edit/Write tools are BLOCKED without tasks.json.
4. As each task completes → nx_task_update(id, "completed").
5. All tasks done → nx_task_close (archives consult+decisions+tasks → history.json).`;

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

function handleStop(): void {
  const summary = readTasksSummary(STATE_ROOT);
  if (!summary.exists) {
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

  // all completed → nx_task_close 강제 호출
  respond({
    continue: true,
    additionalContext: `<nexus>All ${summary.total} tasks completed. MANDATORY: Call nx_task_close to archive this cycle (consult+decisions+tasks → history.json) before finishing.</nexus>`,
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

  // Edit/Write 도구: tasks.json 없으면 차단 (Nexus 내부 경로 제외)
  if (toolName === 'Edit' || toolName === 'Write') {
    const toolInput = event.tool_input as Record<string, unknown> | undefined;
    const filePath = (toolInput?.file_path ?? '') as string;

    if (!isNexusInternalPath(filePath)) {
      const summary = readTasksSummary(STATE_ROOT);
      if (!summary.exists) {
        respond({
          decision: 'block',
          reason: '<nexus>No tasks.json found. Register tasks with nx_task_add before editing files. Pipeline: consult → decisions → tasks → execute.</nexus>',
        });
        return;
      }
      // 빈 배열 또는 all completed → nx_task_close 강제 호출
      if (summary.allCompleted || summary.total === 0) {
        respond({
          decision: 'block',
          reason: '<nexus>All tasks completed. Call nx_task_close to archive this cycle.</nexus>',
        });
        return;
      }
    }

    pass();
    return;
  }

  // Agent tool만 체크
  if (toolName !== 'Agent') {
    pass();
    return;
  }

  const toolInput = event.tool_input as Record<string, unknown> | undefined;

  // Explore agent는 항상 허용
  if (toolInput?.subagent_type === 'Explore') {
    pass();
    return;
  }

  // team_name이 있으면 TeamCreate 기반 teammate 생성 — 허용
  if (toolInput?.team_name) {
    pass();
    return;
  }

  pass();
}

// --- UserPromptSubmit 이벤트 처리: 키워드 감지 ---

interface KeywordMatch {
  primitive: 'consult' | 'run';
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  consult: { primitive: 'consult', skill: 'claude-nexus:nx-consult' },
  run: { primitive: 'run', skill: 'claude-nexus:nx-run' },
};

const NATURAL_PATTERNS: Array<{ patterns: RegExp[]; match: KeywordMatch }> = [
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: 'consult', skill: 'claude-nexus:nx-consult' },
  },
];

// 프리미티브 이름이 에러/버그 맥락에서 언급되면 활성화가 아닌 "대화" — 오탐 방지
const ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
const PRIMITIVE_NAMES = /\b(consult|run)\b/i;

/** 프리미티브 이름이 에러/버그 맥락과 함께 등장하거나, 단순 질문/인용 맥락인지 판별 */
function isPrimitiveMention(prompt: string): boolean {
  // 에러/버그 맥락
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  // 질문 맥락: "what is consult" 등
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  // 인용 맥락: "consult"
  if (/[`"'](?:consult)[`"']/i.test(prompt)) return true;
  return false;
}

function detectKeywords(prompt: string): KeywordMatch | null {
  // 1차: 명시적 태그 [consult] — 항상 확정
  const tagMatch = prompt.match(/\[(consult|run)\]/i);
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

function getConsultReminder(): string | null {
  const consultPath = join(STATE_ROOT, 'consult.json');
  if (!existsSync(consultPath)) return null;
  try {
    const data = JSON.parse(readFileSync(consultPath, 'utf-8'));
    const issues = data.issues ?? [];
    const discussing = issues.find((i: { status: string }) => i.status === 'discussing');
    const pending = issues.filter((i: { status: string }) => i.status === 'pending');
    const current = discussing
      ? `Current: #${discussing.id} "${discussing.title}"`
      : pending.length > 0
        ? `Next: #${pending[0].id} "${pending[0].title}"`
        : 'All issues decided.';
    return `<nexus>Consult: "${data.topic}" | ${current} | ${pending.length} pending\nPresent comparison table with pros/cons/recommendation. Record decisions with [d].</nexus>`;
  } catch {
    return null;
  }
}

/** additionalContext에 notices를 자동 병합 */
function withNotices(base: string, tasksReminder: string | null, claudeMdNotice: string | null, consultReminder?: string | null): string {
  return [consultReminder, tasksReminder, base, claudeMdNotice].filter(Boolean).join('\n');
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

function handleConsultMode({ tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  const consultFile = join(STATE_ROOT, 'consult.json');
  const hasExistingSession = existsSync(consultFile);
  let base: string;
  if (hasExistingSession) {
    base = `<nexus>Consult mode — existing session found.
STEP 1: Check current status with nx_consult_status.
STEP 2: Spawn Explore+researcher in parallel for additional code+external research.
STEP 3: Proceed with discussion based on research results. Do not discuss before research is complete.</nexus>`;
  } else {
    base = `<nexus>Consult mode.
STEP 1: Spawn researcher for code+external research. Run Explore agent in parallel for codebase exploration.
STEP 2: Call nx_consult_start with findings to organize issues.
Do not call nx_consult_start before research is complete.</nexus>`;
  }
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice, null),
  });
}

function handleRunMode({ tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  const consultReminder = getConsultReminder();
  const base = `<nexus>Run mode — full pipeline execution requested.
MANDATORY: Invoke Skill tool with skill="claude-nexus:nx-run" to load the full orchestration pipeline.
Do NOT skip any phases. Do NOT attempt direct execution. Follow nx-run SKILL.md strictly.</nexus>`;
  respond({
    continue: true,
    additionalContext: withNotices(taskPipelineMessage(base), tasksReminder, claudeMdNotice, consultReminder),
  });
}

const PRIMITIVE_HANDLERS: Record<string, PrimitiveHandler> = {
  consult: handleConsultMode,
  run: handleRunMode,
};

function handleUserPromptSubmit(event: Record<string, unknown>): void {
  const claudeMdNotice = handleClaudeMdSync();
  const tasksReminder = getTasksReminder();
  const consultReminder = getConsultReminder();

  const raw = event.prompt ?? event.user_prompt ?? '';
  const prompt = typeof raw === 'string' ? raw : String(raw);
  if (!prompt) { pass(); return; }

  // [d] 결정 태그 감지 — consult.json 유무로 도구 분기 + 행동 규칙 주입
  const dTag = prompt.match(/\[d\]/i);
  if (dTag) {
    const postDecisionRules = `\n\nRecord decision only. For implementation, follow task pipeline.`;
    const consultFile = join(STATE_ROOT, 'consult.json');
    if (existsSync(consultFile)) {
      respond({
        continue: true,
        additionalContext: withNotices(`<nexus>Decision tag detected in consult mode. Use nx_consult_decide(issue_id, summary) to record — updates consult.json + decisions.json simultaneously.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, consultReminder),
      });
    } else {
      respond({
        continue: true,
        additionalContext: withNotices(`<nexus>Decision tag detected. Record this decision using nx_decision_add tool.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, null),
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

  // 태그 없음 + tasks.json 없음 → task pipeline 안내
  const summary = readTasksSummary(STATE_ROOT);
  if (!summary.exists) {
    const branchGuard = /^(main|master)$/.test(getCurrentBranch())
      ? '\nBranch Guard: You are on main/master. Create a feature branch before making changes.'
      : '';

    respond({
      continue: true,
      additionalContext: withNotices(taskPipelineMessage(`<nexus>No active tasks.${branchGuard}</nexus>`), null, claudeMdNotice, consultReminder),
    });
    return;
  }

  // tasks.json 있음 + pending → 스마트 resume
  if (summary.pending > 0) {
    respond({
      continue: true,
      additionalContext: withNotices(`<nexus>Existing tasks detected (${summary.pending} pending). Smart resume: Review existing tasks with nx_task_list. For each pending task: verify if already implemented/documented. If stale → nx_task_close + fresh nx_task_add. If genuine → continue execution.</nexus>`, tasksReminder, claudeMdNotice, consultReminder),
    });
    return;
  }

  // tasks.json 있음 + all completed → stale cycle 감지
  respond({
    continue: true,
    additionalContext: withNotices(`<nexus>Stale tasks.json detected from previous cycle. MANDATORY: Call nx_task_close to archive before starting new work.</nexus>`, tasksReminder, claudeMdNotice, consultReminder),
  });
}

// --- 세션 이벤트 핸들러 ---

function handleSessionStart(_event: Record<string, unknown>): void {
  ensureNexusStructure();
  writeFileSync(join(STATE_ROOT, 'agent-tracker.json'), '[]');
  pass();
}

function handleSubagentStart(event: Record<string, unknown>): void {
  const agentType = String(event.agent_type ?? event.subagent_type ?? '');
  const agentId = String(event.agent_id ?? event.session_id ?? '');

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
  const agentId = String(event.agent_id ?? event.session_id ?? '');
  const lastMsg = String(event.last_message ?? event.stop_reason ?? '');

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
  pass();
}

// --- 메인 ---

async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);

  // NEXUS_EVENT 환경변수로 세션/서브에이전트 이벤트 처리
  const nexusEvent = process.env.NEXUS_EVENT ?? '';
  if (nexusEvent === 'SessionStart') {
    handleSessionStart(event);
    return;
  }
  if (nexusEvent === 'SubagentStart') {
    handleSubagentStart(event);
    return;
  }
  if (nexusEvent === 'SubagentStop') {
    handleSubagentStop(event);
    return;
  }

  // Claude Code는 hook_event_name을 보내지 않을 수 있음.
  // PreToolUse는 tool_name 필드가 있고, UserPromptSubmit은 prompt 필드가 있고, Stop은 없음.
  const hasToolName = 'tool_name' in event;
  const hasPrompt = 'prompt' in event || 'user_prompt' in event;

  if (hasToolName) {
    handlePreToolUse(event);
  } else if (hasPrompt) {
    handleUserPromptSubmit(event);
  } else {
    handleStop();
  }
}

main().catch(() => {
  respond({ continue: true });
});
