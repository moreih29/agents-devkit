// Gate 훅: Stop (Task 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { BRANCH_ROOT, RUNTIME_ROOT } from '../shared/paths.js';
import { readTasksSummary } from '../shared/tasks.js';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

const TASK_PIPELINE = `
TASK PIPELINE (mandatory for all file modifications):
1. Check decisions.json for prior decisions — reference relevant IDs in nx_task_add(decisions=[...]).
2. Decompose work into discrete tasks → call nx_task_add for EACH task.
3. Edit/Write tools are BLOCKED without tasks.json.
4. As each task completes → nx_task_update(id, "completed").
5. All tasks done → nx_task_close (archives consult+decisions+tasks → history.json).`;

function taskPipelineMessage(modeSpecific: string): string {
  return `${modeSpecific}${TASK_PIPELINE}`;
}

const DEV_TEAM_NUDGE = `[NEXUS] Dev team mode activated (forced).
CRITICAL RULES:
1. Lead MUST NOT use analysis tools, task tools, or code tools directly.
2. Only director creates/modifies tasks via nx_task_add/nx_task_update.
3. Use ONLY orchestration tools: TeamCreate, Agent, SendMessage, AskUserQuestion.
Follow the Team Path procedure in SKILL.md.`;

const RESEARCH_TEAM_NUDGE = `[NEXUS] Research team mode activated (forced).
CRITICAL RULES:
1. Lead MUST NOT use research tools, task tools, or code tools directly.
2. Only principal creates/modifies tasks via nx_task_add/nx_task_update.
3. Use ONLY orchestration tools: TeamCreate, Agent, SendMessage, AskUserQuestion.
Follow the Team Path procedure in SKILL.md.`;

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

  // --- Project CLAUDE.md stale notification ---
  const projectClaudeMd = join(process.cwd(), 'CLAUDE.md');
  const notifiedFlag = join(RUNTIME_ROOT, 'claudemd-notified');

  if (existsSync(projectClaudeMd)) {
    const projectContent = readFileSync(projectClaudeMd, 'utf-8');
    const projectMarker = extractMarkerContent(projectContent);

    if (projectMarker !== null && projectMarker !== template) {
      // Stale — notify once
      if (!existsSync(notifiedFlag)) {
        const notifiedDir = dirname(notifiedFlag);
        if (!existsSync(notifiedDir)) {
          mkdirSync(notifiedDir, { recursive: true });
        }
        writeFileSync(notifiedFlag, '');
        return '[NEXUS] 프로젝트 CLAUDE.md의 Nexus 섹션이 최신 버전과 다릅니다. /claude-nexus:nx-sync로 갱신하세요.';
      }
    } else if (projectMarker !== null && projectMarker === template) {
      // Up to date — reset flag
      if (existsSync(notifiedFlag)) {
        try { unlinkSync(notifiedFlag); } catch {}
      }
    }
  }

  return null;
}

// --- Stop 이벤트 처리 ---

function handleStop(): void {
  const summary = readTasksSummary(BRANCH_ROOT);
  if (!summary.exists) {
    pass();
    return;
  }

  if (summary.pending > 0) {
    respond({
      continue: true,
      additionalContext: `[NEXUS] ${summary.pending} tasks pending in tasks.json. Before stopping:\n1. Review each pending task — verify if work is actually done.\n2. Done → nx_task_update(id, "completed").\n3. Not done → complete the work first.\n4. When all completed → nx_task_close to archive.`,
    });
    return;
  }

  // all completed → nx_task_close 강제 호출
  respond({
    continue: true,
    additionalContext: `[NEXUS] All ${summary.total} tasks completed. MANDATORY: Call nx_task_close to archive this cycle (consult+decisions+tasks → history.json) before finishing.`,
  });
}

// --- mode.json 헬퍼 ---

function writeMode(mode: string, path: 'sub' | 'team'): void {
  const modePath = join(BRANCH_ROOT, 'mode.json');
  const modeDir = dirname(modePath);
  if (!existsSync(modeDir)) mkdirSync(modeDir, { recursive: true });
  writeFileSync(modePath, JSON.stringify({ mode, path }));
}

function readMode(): { mode: string; path: string } | null {
  const modePath = join(BRANCH_ROOT, 'mode.json');
  if (!existsSync(modePath)) return null;
  try {
    return JSON.parse(readFileSync(modePath, 'utf-8'));
  } catch { return null; }
}

function updateModePath(newPath: 'sub' | 'team'): void {
  const current = readMode();
  if (current) writeMode(current.mode, newPath);
}

// --- PreToolUse 이벤트 처리: Agent 직접 호출 차단 + Edit/Write 태스크 강제 ---

/** 예외 경로: Nexus 내부 파일 및 setup/sync 대상 파일은 tasks.json 없이도 수정 허용 */
function isNexusInternalPath(filePath: string): boolean {
  // .nexus/ 런타임 상태
  if (/[\\/]\.nexus[\\/]/.test(filePath)) return true;
  // .claude/nexus/ 지식 저장소
  if (/[\\/]\.claude[\\/]nexus[\\/]/.test(filePath)) return true;
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
      // mode.json 존재 시 Lead Edit/Write 차단 (dev/research 모드)
      const modePath = join(BRANCH_ROOT, 'mode.json');
      if (existsSync(modePath)) {
        respond({
          decision: 'block',
          reason: '[NEXUS] Dev/Research mode active. Lead cannot edit files directly. Spawn agents (Agent tool) to perform the work.',
        });
        return;
      }

      const summary = readTasksSummary(BRANCH_ROOT);
      if (!summary.exists) {
        respond({
          decision: 'block',
          reason: '[NEXUS] No tasks.json found. Register tasks with nx_task_add before editing files. Pipeline: consult → decisions → tasks → execute.',
        });
        return;
      }
      // 빈 배열 또는 all completed → nx_task_close 강제 호출
      if (summary.allCompleted || summary.total === 0) {
        respond({
          decision: 'block',
          reason: '[NEXUS] All tasks completed. Call nx_task_close to archive this cycle.',
        });
        return;
      }
    }

    pass();
    return;
  }

  // TeamCreate → mode.json path를 "team"으로 전환
  if (toolName === 'TeamCreate') {
    updateModePath('team');
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

  // mode.json path === "team" 일 때만 Agent() 직접 호출 차단
  const modeData = readMode();
  if (modeData?.path === 'team') {
    respond({
      decision: 'block',
      reason: '[TEAM] Direct Agent() calls are blocked in team mode. Use TeamCreate + Agent({ team_name }) to spawn teammates, or SendMessage to communicate with existing teammates.',
    });
    return;
  }

  pass();
}

// --- UserPromptSubmit 이벤트 처리: 키워드 감지 ---

interface KeywordMatch {
  primitive: 'consult' | 'dev' | 'dev!' | 'research' | 'research!';
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  consult:     { primitive: 'consult',    skill: 'claude-nexus:nx-consult' },
  dev:         { primitive: 'dev',        skill: 'claude-nexus:nx-dev' },
  'dev!':      { primitive: 'dev!',       skill: 'claude-nexus:nx-dev' },
  research:    { primitive: 'research',   skill: 'claude-nexus:nx-research' },
  'research!': { primitive: 'research!',  skill: 'claude-nexus:nx-research' },
};

const NATURAL_PATTERNS: Array<{ patterns: RegExp[]; match: KeywordMatch }> = [
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: 'consult', skill: 'claude-nexus:nx-consult' },
  },
];

// 프리미티브 이름이 에러/버그 맥락에서 언급되면 활성화가 아닌 "대화" — 오탐 방지
const ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
const PRIMITIVE_NAMES = /\b(dev|consult|research)\b/i;

/** 프리미티브 이름이 에러/버그 맥락과 함께 등장하거나, 단순 질문/인용 맥락인지 판별 */
function isPrimitiveMention(prompt: string): boolean {
  // 에러/버그 맥락
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  // 질문 맥락: "dev가 뭐야", "what is consult" 등
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  // 인용 맥락: `dev`, "consult", `research`
  if (/[`"'](?:dev|consult|research)[`"']/i.test(prompt)) return true;
  return false;
}

function detectKeywords(prompt: string): KeywordMatch | null {
  // 1차: 명시적 태그 [consult], [dev], [dev!], [research], [research!] — 항상 확정
  const tagMatch = prompt.match(/\[(consult|dev!?|research!?)\]/i);
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
  const summary = readTasksSummary(BRANCH_ROOT);
  if (!summary.exists) return null;
  if (summary.pending > 0) {
    return `[NEXUS] ${summary.pending} pending tasks. Complete work → nx_task_update(id, "completed") for each done task. Archive with nx_task_close when all complete.`;
  }
  return `[NEXUS] All ${summary.total} tasks completed but not archived. MANDATORY: Call nx_task_close to archive this cycle.`;
}

/** additionalContext에 tasksReminder와 claudeMdNotice를 자동 병합 */
function withNotices(base: string, tasksReminder: string | null, claudeMdNotice: string | null): string {
  return [tasksReminder, base, claudeMdNotice].filter(Boolean).join('\n');
}

// --- 개별 프리미티브 핸들러 ---

type PrimitiveHandler = (params: {
  prompt: string;
  tasksReminder: string | null;
  claudeMdNotice: string | null;
}) => void;

function handleConsultMode({ tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  const consultFile = join(BRANCH_ROOT, 'consult.json');
  const hasExistingSession = existsSync(consultFile);
  let base: string;
  if (hasExistingSession) {
    base = `[NEXUS] Consult mode activated. An existing session was found.
MANDATORY: Call nx_consult_status to review current issues and decisions. Do NOT skip this tool call.
If the new topic is related to the existing session, add issues with nx_consult_update(action="add").
If the new topic is completely unrelated, you may start fresh with nx_consult_start (this overwrites the existing session).`;
  } else {
    base = `[NEXUS] Consult mode activated. Starting a new session.
MANDATORY: Call nx_consult_start to register issues. Do NOT skip this tool call.
1. Explore first — read code, knowledge, decisions before asking questions.
2. Decompose the topic into discrete issues. Register with nx_consult_start. Present one issue at a time.
3. For each issue: comparison table (keywords) + recommendation bullets (why not others, why this one).
4. Natural dialogue for responses — allow user's free feedback (combinations, counter-proposals, questions).
5. Record decisions with [d] tag. After each decision, transition to the next issue.
6. After all issues decided: check for missed topics against the original question.
7. Do NOT execute. When ready, recommend an appropriate execution tag from CLAUDE.md Tags table.
8. Spawn agents if specialized analysis is needed.
Note: To continue an existing session, just continue the conversation without using [consult].`;
  }
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice),
  });
}

function handleDevMode({ tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  writeMode('dev', 'sub');
  const base = taskPipelineMessage(`[NEXUS] Dev mode activated. Assess the request and choose your approach:
- Simple (1-3 files): Use direct Agent() spawns
- Complex (4+ files): Use TeamCreate + full team workflow
[dev!] forces team mode.`);
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice),
  });
}

function handleDevTeamMode({ tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  writeMode('dev', 'team');
  respond({
    continue: true,
    additionalContext: withNotices(DEV_TEAM_NUDGE, tasksReminder, claudeMdNotice),
  });
}

function handleResearchMode({ tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  writeMode('research', 'sub');
  const base = taskPipelineMessage(`[NEXUS] Research mode activated. Assess the request and choose your approach:
- Simple (1-3 topics, single domain): Use direct Agent() spawns
- Complex (4+ topics, multiple domains/sources needed): Use TeamCreate + full team workflow
[research!] forces team mode.`);
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice),
  });
}

function handleResearchTeamMode({ tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  writeMode('research', 'team');
  respond({
    continue: true,
    additionalContext: withNotices(RESEARCH_TEAM_NUDGE, tasksReminder, claudeMdNotice),
  });
}

const PRIMITIVE_HANDLERS: Record<string, PrimitiveHandler> = {
  consult:     handleConsultMode,
  dev:         handleDevMode,
  'dev!':      handleDevTeamMode,
  research:    handleResearchMode,
  'research!': handleResearchTeamMode,
};

function handleUserPromptSubmit(event: Record<string, unknown>): void {
  const claudeMdNotice = handleClaudeMdSync();
  const tasksReminder = getTasksReminder();

  const raw = event.prompt ?? event.user_prompt ?? '';
  const prompt = typeof raw === 'string' ? raw : String(raw);
  if (!prompt) { pass(); return; }

  // [d] 결정 태그 감지 — consult.json 유무로 도구 분기 + 행동 규칙 주입
  const dTag = prompt.match(/\[d\]/i);
  if (dTag) {
    const postDecisionRules = `\n\nAfter recording the decision:\n1. Record the decision ONLY. Do NOT execute or implement unless the user explicitly requests it.\n2. If the user explicitly requests implementation: nx_task_add (decisions=[] or relevant IDs) → perform work → nx_task_close (history archive). Follow this pipeline even for simple edits. Edit/Write will be BLOCKED without tasks.json.\n3. You may recommend [dev] or [research] tags for execution, but do not execute yourself unless asked.`;
    const consultFile = join(BRANCH_ROOT, 'consult.json');
    if (existsSync(consultFile)) {
      respond({
        continue: true,
        additionalContext: withNotices(`[NEXUS] Decision tag detected in consult mode. Use nx_consult_decide(issue_id, summary) to record — updates consult.json + decisions.json simultaneously.${postDecisionRules}`, tasksReminder, claudeMdNotice),
      });
    } else {
      respond({
        continue: true,
        additionalContext: withNotices(`[NEXUS] Decision tag detected. Record this decision using nx_decision_add tool.${postDecisionRules}`, tasksReminder, claudeMdNotice),
      });
    }
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

  // 태그 없음 + tasks.json 없음 → 파이프라인 선제 안내
  const summary = readTasksSummary(BRANCH_ROOT);
  if (!summary.exists) {
    respond({
      continue: true,
      additionalContext: withNotices(taskPipelineMessage(`[NEXUS] No active tasks.`), null, claudeMdNotice),
    });
    return;
  }

  // tasks.json 있음 → stale cycle 감지
  respond({
    continue: true,
    additionalContext: withNotices(`[NEXUS] Stale tasks.json detected from previous cycle. MANDATORY: Call nx_task_close to archive before starting new work.`, tasksReminder, claudeMdNotice),
  });
}

// --- 메인 ---

async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
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
