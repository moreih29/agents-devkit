// Gate 훅: Stop (Task 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { BRANCH_ROOT, RUNTIME_ROOT, CURRENT_BRANCH, getSessionRoot, CURRENT_SESSION_FILE } from '../shared/paths.js';
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

  // nx_task_update(pending) → reopen-tracker circuit breaker
  if (toolName === 'mcp__plugin_claude-nexus_nx__nx_task_update') {
    const toolInput = event.tool_input as Record<string, unknown> | undefined;
    const taskId = String(toolInput?.id ?? toolInput?.task_id ?? '');
    const status = String(toolInput?.status ?? '');
    if (status === 'pending' && taskId) {
      const reopenTrackerPath = join(BRANCH_ROOT, 'reopen-tracker.json');
      let tracker: Record<string, number> = {};
      if (existsSync(reopenTrackerPath)) {
        try { tracker = JSON.parse(readFileSync(reopenTrackerPath, 'utf-8')); } catch {}
      }
      const count = (tracker[taskId] ?? 0) + 1;
      tracker[taskId] = count;
      if (!existsSync(BRANCH_ROOT)) {
        mkdirSync(BRANCH_ROOT, { recursive: true });
      }
      writeFileSync(reopenTrackerPath, JSON.stringify(tracker, null, 2));

      if (count >= 5) {
        respond({
          decision: 'block',
          reason: `[NEXUS] Circuit breaker: task "${taskId}" has been reopened ${count} times. BLOCKED. Report to Lead via SendMessage: describe the task, blocking issue, and attempts made.`,
        });
        return;
      }

      if (count >= 3) {
        respond({
          decision: 'approve',
          additionalContext: `[NEXUS] Warning: task "${taskId}" has been reopened ${count} times. Possible loop detected. Consider reporting to Lead via SendMessage before continuing.`,
        });
        return;
      }
    }
    pass();
    return;
  }

  // nx_task_close: QA/Reviewer 없이 3개 이상 파일 수정 시 경고
  if (toolName === 'mcp__plugin_claude-nexus_nx__nx_task_close') {
    const editTrackerPath = join(BRANCH_ROOT, 'edit-tracker.json');

    let editTracker: Record<string, number> = {};
    if (existsSync(editTrackerPath)) {
      try { editTracker = JSON.parse(readFileSync(editTrackerPath, 'utf-8')); } catch {}
    }
    const modifiedFileCount = Object.keys(editTracker).length;

    // 현재 세션 ID로 agent-tracker 경로 조회
    let hasCheckAgent = false;
    if (existsSync(CURRENT_SESSION_FILE)) {
      try {
        const sessionId = readFileSync(CURRENT_SESSION_FILE, 'utf-8').trim();
        if (sessionId) {
          const agentTrackerPath = join(getSessionRoot(sessionId), 'agent-tracker.json');
          if (existsSync(agentTrackerPath)) {
            const agents = JSON.parse(readFileSync(agentTrackerPath, 'utf-8')) as Array<Record<string, unknown>>;
            hasCheckAgent = agents.some((a) => {
              const type = String(a.agent_type ?? '').toLowerCase();
              return type.includes('qa') || type.includes('reviewer');
            });
          }
        }
      } catch {}
    }

    if (modifiedFileCount >= 3 && !hasCheckAgent) {
      respond({
        decision: 'approve',
        additionalContext: `WARNING: ${modifiedFileCount} files were modified but no Check agent (QA/Reviewer) was spawned. QA spawn conditions may apply: 3+ files changed. Consider spawning QA before closing the cycle.`,
      });
      return;
    }

    pass();
    return;
  }

  // Edit/Write 도구: tasks.json 없으면 차단 (Nexus 내부 경로 제외)
  if (toolName === 'Edit' || toolName === 'Write') {
    const toolInput = event.tool_input as Record<string, unknown> | undefined;
    const filePath = (toolInput?.file_path ?? '') as string;

    if (!isNexusInternalPath(filePath)) {
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

      // edit-tracker: 파일 수정 횟수 추적
      const editTrackerPath = join(BRANCH_ROOT, 'edit-tracker.json');
      let tracker: Record<string, number> = {};
      if (existsSync(editTrackerPath)) {
        try { tracker = JSON.parse(readFileSync(editTrackerPath, 'utf-8')); } catch {}
      }
      const count = (tracker[filePath] ?? 0) + 1;
      tracker[filePath] = count;
      // BRANCH_ROOT 디렉토리 확인
      if (!existsSync(BRANCH_ROOT)) {
        mkdirSync(BRANCH_ROOT, { recursive: true });
      }
      writeFileSync(editTrackerPath, JSON.stringify(tracker, null, 2));

      if (count >= 5) {
        respond({
          decision: 'block',
          reason: `[NEXUS] Loop detected: "${filePath}" has been modified ${count} times. BLOCKED. Report to Lead via SendMessage: describe the file, error pattern, and approaches tried. Wait for Lead or Architect guidance before continuing.`,
        });
        return;
      }

      if (count >= 3) {
        respond({
          decision: 'approve',
          additionalContext: `[NEXUS] Warning: "${filePath}" has been modified ${count} times. Possible loop detected. Consider reporting to Lead via SendMessage before continuing. Describe what you're trying to fix and why previous attempts failed.`,
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
  primitive: 'consult';
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  consult: { primitive: 'consult', skill: 'claude-nexus:nx-consult' },
};

const NATURAL_PATTERNS: Array<{ patterns: RegExp[]; match: KeywordMatch }> = [
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: 'consult', skill: 'claude-nexus:nx-consult' },
  },
];

// 프리미티브 이름이 에러/버그 맥락에서 언급되면 활성화가 아닌 "대화" — 오탐 방지
const ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
const PRIMITIVE_NAMES = /\b(consult)\b/i;

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
  const tagMatch = prompt.match(/\[(consult)\]/i);
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

function getConsultReminder(): string | null {
  const consultPath = join(BRANCH_ROOT, 'consult.json');
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
    return `[NEXUS] Consult: "${data.topic}" | ${current} | ${pending.length} pending\nPresent comparison table with pros/cons/recommendation. Record decisions with [d].`;
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

function handleConsultMode({ tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  const consultFile = join(BRANCH_ROOT, 'consult.json');
  const hasExistingSession = existsSync(consultFile);
  let base: string;
  if (hasExistingSession) {
    base = `[NEXUS] Consult mode — 기존 세션 발견.
STEP 1: nx_consult_status로 현재 상태 확인.
STEP 2: Explore+researcher 병렬 스폰하여 코드+외부 추가 탐색.
STEP 3: 조사 결과 바탕으로 논의 진행. 조사 완료 전 금지.`;
  } else {
    base = `[NEXUS] Consult mode.
STEP 1: researcher 스폰하여 코드+외부 탐색. Explore agent로 코드베이스 탐색 병행.
STEP 2: 조사 결과 바탕으로 nx_consult_start 호출하여 이슈 정리.
조사 완료 전 nx_consult_start 호출 금지.`;
  }
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice, null),
  });
}

const PRIMITIVE_HANDLERS: Record<string, PrimitiveHandler> = {
  consult: handleConsultMode,
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
    const postDecisionRules = `\n\nAfter recording the decision:\n1. Record the decision ONLY. Do NOT execute or implement unless the user explicitly requests it.\n2. If the user explicitly requests implementation: nx_task_add (decisions=[] or relevant IDs) → perform work → nx_task_close (history archive). Follow this pipeline even for simple edits. Edit/Write will be BLOCKED without tasks.json.`;
    const consultFile = join(BRANCH_ROOT, 'consult.json');
    if (existsSync(consultFile)) {
      respond({
        continue: true,
        additionalContext: withNotices(`[NEXUS] Decision tag detected in consult mode. Use nx_consult_decide(issue_id, summary) to record — updates consult.json + decisions.json simultaneously.${postDecisionRules}`, tasksReminder, claudeMdNotice, consultReminder),
      });
    } else {
      respond({
        continue: true,
        additionalContext: withNotices(`[NEXUS] Decision tag detected. Record this decision using nx_decision_add tool.${postDecisionRules}`, tasksReminder, claudeMdNotice, null),
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

  // 태그 없음 + tasks.json 없음 → 파이프라인 선제 안내 + 기본 오케스트레이션 주입
  const summary = readTasksSummary(BRANCH_ROOT);
  if (!summary.exists) {
    const branchGuard = /^(main|master)$/.test(CURRENT_BRANCH)
      ? '\nBranch Guard: You are on main/master. Create a feature branch before making changes.'
      : '';
    const orchestrationHint = `[NEXUS] No active tasks. Refer to nx-run SKILL.md for orchestration guidance.
- Direct execution only if ALL 3 conditions met: exact change instruction + single file + no code structure understanding needed.
- Otherwise: spawn How agent (Architect/Postdoc/Strategist) for design consultation, then Do agents for execution.${branchGuard}
IMPORTANT: For multi-file or complex tasks, Lead creates tasks via nx_task_add after consulting How agents. Spawn How agents first for design before dispatching Do agents.`;
    respond({
      continue: true,
      additionalContext: withNotices(taskPipelineMessage(orchestrationHint), null, claudeMdNotice, consultReminder),
    });
    return;
  }

  // tasks.json 있음 + pending → 스마트 resume
  if (summary.pending > 0) {
    respond({
      continue: true,
      additionalContext: withNotices(`[NEXUS] Existing tasks detected (${summary.pending} pending). Smart resume: Review existing tasks with nx_task_list. For each pending task: verify if already implemented/documented. If stale → nx_task_close + fresh nx_task_add. If genuine → continue execution.`, tasksReminder, claudeMdNotice, consultReminder),
    });
    return;
  }

  // tasks.json 있음 + all completed → stale cycle 감지
  respond({
    continue: true,
    additionalContext: withNotices(`[NEXUS] Stale tasks.json detected from previous cycle. MANDATORY: Call nx_task_close to archive before starting new work.`, tasksReminder, claudeMdNotice, consultReminder),
  });
}

// --- 세션 이벤트 핸들러 ---

function handleSessionStart(event: Record<string, unknown>): void {
  const sessionId = String(event.session_id ?? '');
  if (sessionId) {
    // 세션 디렉토리 생성 + agent-tracker 초기화
    const sessionRoot = getSessionRoot(sessionId);
    mkdirSync(sessionRoot, { recursive: true });
    writeFileSync(join(sessionRoot, 'agent-tracker.json'), '[]');
    // 현재 세션 ID 기록
    const runtimeDir = RUNTIME_ROOT;
    if (!existsSync(runtimeDir)) {
      mkdirSync(runtimeDir, { recursive: true });
    }
    writeFileSync(CURRENT_SESSION_FILE, sessionId);
  }

  respond({
    continue: true,
    additionalContext: `[NEXUS] Session started.`,
  });
}

function handleSubagentStart(event: Record<string, unknown>): void {
  const agentType = String(event.agent_type ?? event.subagent_type ?? '');
  const agentId = String(event.agent_id ?? event.session_id ?? '');
  const parentSessionId = String(event.parent_session_id ?? event.session_id ?? '');

  // 세션 경로에 기록
  if (parentSessionId) {
    const sessionRoot = getSessionRoot(parentSessionId);
    const trackerPath = join(sessionRoot, 'agent-tracker.json');
    let tracker: Record<string, unknown>[] = [];
    if (existsSync(trackerPath)) {
      try { tracker = JSON.parse(readFileSync(trackerPath, 'utf-8')); } catch {}
    }
    tracker.push({ agent_type: agentType, agent_id: agentId, started_at: new Date().toISOString(), status: 'running' });
    mkdirSync(sessionRoot, { recursive: true });
    writeFileSync(trackerPath, JSON.stringify(tracker, null, 2));
  }
  pass();
}

function handleSubagentStop(event: Record<string, unknown>): void {
  const agentId = String(event.agent_id ?? event.session_id ?? '');
  const lastMsg = String(event.last_message ?? event.stop_reason ?? '');
  const parentSessionId = String(event.parent_session_id ?? event.session_id ?? '');

  // 세션 경로에서 업데이트
  if (parentSessionId) {
    const trackerPath = join(getSessionRoot(parentSessionId), 'agent-tracker.json');
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
