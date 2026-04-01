// Gate 훅: Stop (Task 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { STATE_ROOT, ensureDir, getCurrentBranch, ensureNexusStructure } from '../shared/paths.js';
import { readTasksSummary } from '../shared/tasks.js';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const TASK_PIPELINE = `
TASK PIPELINE (mandatory for all file modifications):
1. Check meet.json issues for prior decisions — reference relevant meet_issue IDs in nx_task_add(meet_issue=N).
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

  // all completed → 1회만 차단 후 해제 (무한 루프 방지)
  const stopWarnedPath = join(STATE_ROOT, 'stop-warned');
  if (existsSync(stopWarnedPath)) {
    // 2회차: 이미 경고함 → 종료 허용. 다음 세션에서 stale cycle로 정리됨.
    unlinkSync(stopWarnedPath);
    pass();
    return;
  }
  // 1회차: 경고 + 차단
  writeFileSync(stopWarnedPath, '');
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

  // Edit/Write 도구: tasks.json 없으면 차단 (Nexus 내부 경로 제외)
  if (toolName === 'Edit' || toolName === 'Write') {
    const toolInput = event.tool_input as Record<string, unknown> | undefined;
    const filePath = (toolInput?.file_path ?? '') as string;

    if (!isNexusInternalPath(filePath)) {
      const summary = readTasksSummary(STATE_ROOT);
      if (!summary.exists) {
        respond({
          decision: 'block',
          reason: '<nexus>No tasks.json found. Register tasks with nx_task_add before editing files. Pipeline: meet → decisions → tasks → execute.</nexus>',
        });
        return;
      }
      // 빈 배열 또는 all completed → nx_task_close 강제 호출
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

  // nx_meet_start: attendees에 비-Lead 에이전트가 있으면 팀 에이전트 존재 확인
  if (toolName === 'mcp__plugin_claude-nexus_nx__nx_meet_start') {
    const toolInput = event.tool_input as Record<string, unknown> | undefined;
    const attendees = toolInput?.attendees as Array<{ role: string }> | undefined;
    const hasNonLeadAttendees = attendees?.some(a => a.role !== 'lead' && a.role !== 'user');

    if (hasNonLeadAttendees) {
      const trackerPath = join(STATE_ROOT, 'agent-tracker.json');
      let hasTeamAgents = false;
      if (existsSync(trackerPath)) {
        try {
          const tracker = JSON.parse(readFileSync(trackerPath, 'utf-8')) as Record<string, unknown>[];
          hasTeamAgents = tracker.some(a => a.team_name && (a.status === 'running' || a.status === 'team-spawning'));
        } catch {}
      }
      if (!hasTeamAgents) {
        respond({
          decision: 'block',
          reason: 'Attendees에 에이전트가 포함되어 있지만 TeamCreate로 팀이 생성되지 않았습니다. TeamCreate + Agent(team_name=...) 으로 에이전트를 먼저 스폰하세요.',
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

  // team_name이 있으면 TeamCreate 기반 teammate 생성 — tracker에 기록 후 허용
  if (toolInput?.team_name) {
    const trackerPath = join(STATE_ROOT, 'agent-tracker.json');
    let tracker: Record<string, unknown>[] = [];
    if (existsSync(trackerPath)) {
      try { tracker = JSON.parse(readFileSync(trackerPath, 'utf-8')); } catch {}
    }
    tracker.push({
      agent_type: String(toolInput.subagent_type ?? ''),
      team_name: String(toolInput.team_name),
      status: 'team-spawning',
      started_at: new Date().toISOString(),
    });
    ensureDir(STATE_ROOT);
    writeFileSync(trackerPath, JSON.stringify(tracker, null, 2));
    pass();
    return;
  }

  // [run] 모드 판별: tasks.json 있고 meet.json 없으면 팀 강제
  const tasksPath = join(STATE_ROOT, 'tasks.json');
  const meetPath = join(STATE_ROOT, 'meet.json');
  const isRunMode = existsSync(tasksPath) && !existsSync(meetPath);

  if (isRunMode) {
    respond({
      decision: 'block',
      reason: 'In [run] mode, agents must be spawned as teammates. Add team_name parameter to the Agent call, or create a team with TeamCreate first.',
    });
    return;
  }

  pass();
}

// --- UserPromptSubmit 이벤트 처리: 키워드 감지 ---

interface KeywordMatch {
  primitive: 'meet' | 'run';
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  meet: { primitive: 'meet', skill: 'claude-nexus:nx-meet' },
  run: { primitive: 'run', skill: 'claude-nexus:nx-run' },
};

const NATURAL_PATTERNS: Array<{ patterns: RegExp[]; match: KeywordMatch }> = [
  {
    patterns: [
      /\bmeet\b/i, /미팅/, /회의/, /논의하자/, /모여/,
      /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/,
    ],
    match: { primitive: 'meet', skill: 'claude-nexus:nx-meet' },
  },
];

// 참석자 소환 패턴: "아키텍트 불러", "QA 소환", "엔지니어 참석" 등
const ATTENDEE_PATTERNS = /(?:참석|불러|소환)\s*$/;

// 프리미티브 이름이 에러/버그 맥락에서 언급되면 활성화가 아닌 "대화" — 오탐 방지
const ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
const PRIMITIVE_NAMES = /\b(meet|run)\b/i;

/** 프리미티브 이름이 에러/버그 맥락과 함께 등장하거나, 단순 질문/인용 맥락인지 판별 */
function isPrimitiveMention(prompt: string): boolean {
  // 에러/버그 맥락
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  // 질문 맥락: "what is meet" 등
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  // 인용 맥락: "meet"
  if (/[`"'](?:meet)[`"']/i.test(prompt)) return true;
  return false;
}

function detectKeywords(prompt: string): KeywordMatch | null {
  // 1차: 명시적 태그 [meet] — 항상 확정
  const tagMatch = prompt.match(/\[(meet|run)\]/i);
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

function getMeetReminder(): string | null {
  const meetFilePath = join(STATE_ROOT, 'meet.json');
  if (!existsSync(meetFilePath)) return null;
  try {
    const data = JSON.parse(readFileSync(meetFilePath, 'utf-8'));
    const issues = data.issues ?? [];
    const discussing = issues.find((i: { status: string }) => i.status === 'discussing');
    const pending = issues.filter((i: { status: string }) => i.status === 'pending');
    const current = discussing
      ? `Current: #${discussing.id} "${discussing.title}"`
      : pending.length > 0
        ? `Next: #${pending[0].id} "${pending[0].title}"`
        : 'All issues decided.';
    return `<nexus>Meet: "${data.topic}" | ${current} | ${pending.length} pending\nPresent comparison table with pros/cons/recommendation. Record decisions with [d].</nexus>`;
  } catch {
    return null;
  }
}

/** additionalContext에 notices를 자동 병합 */
function withNotices(base: string, tasksReminder: string | null, claudeMdNotice: string | null, meetReminder?: string | null): string {
  return [meetReminder, tasksReminder, base, claudeMdNotice].filter(Boolean).join('\n');
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

function handleMeetMode({ tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  const meetFile = join(STATE_ROOT, 'meet.json');
  const hasExistingSession = existsSync(meetFile);
  let base: string;
  if (hasExistingSession) {
    base = `<nexus>Meet mode — existing session found.
STEP 1: Check current status with nx_meet_status.
STEP 2: Spawn Explore+researcher in parallel for additional code+external research.
STEP 3: Proceed with discussion based on research results. Do not discuss before research is complete.
TEAM REQUIRED: Use TeamCreate to spawn teammates. Attendees can be added mid-session with nx_meet_join.</nexus>`;
  } else {
    base = `<nexus>Meet mode.
STEP 1: Spawn researcher for code+external research. Run Explore agent in parallel for codebase exploration.
STEP 2: Call nx_meet_start with findings to organize issues.
Do not call nx_meet_start before research is complete.
TEAM REQUIRED: Use TeamCreate to create a team and spawn How agents (architect, strategist, etc.) for discussion.</nexus>`;
  }
  respond({
    continue: true,
    additionalContext: withNotices(base, tasksReminder, claudeMdNotice, null),
  });
}

function handleRunMode({ tasksReminder, claudeMdNotice }: Parameters<PrimitiveHandler>[0]): void {
  const meetReminder = getMeetReminder();
  // meet→run 전환 시 How 에이전트 유지 / Do·Check 해산 안내
  const meetTransitionHint = existsSync(join(STATE_ROOT, 'meet.json'))
    ? '\nMeet→Run transition: Retain How agents (architect, strategist, etc.). Dismiss Do/Check agents (engineer, qa, etc.). Register tasks with nx_task_add(meet_issue=N).'
    : '';
  const base = `<nexus>Run mode — full pipeline execution requested.
MANDATORY: Invoke Skill tool with skill="claude-nexus:nx-run" to load the full orchestration pipeline.
Do NOT skip any phases. Do NOT attempt direct execution. Follow nx-run SKILL.md strictly.${meetTransitionHint}
TEAM REQUIRED: For tasks involving 2+ tasks or 2+ target files, use TeamCreate and spawn at least one Engineer. Do NOT handle multi-task work as Lead solo.</nexus>`;
  respond({
    continue: true,
    additionalContext: withNotices(taskPipelineMessage(base), tasksReminder, claudeMdNotice, meetReminder),
  });
}

const PRIMITIVE_HANDLERS: Record<string, PrimitiveHandler> = {
  meet: handleMeetMode,
  run: handleRunMode,
};

function handleUserPromptSubmit(event: Record<string, unknown>): void {
  const claudeMdNotice = handleClaudeMdSync();
  const tasksReminder = getTasksReminder();
  const meetReminder = getMeetReminder();

  const raw = event.prompt ?? event.user_prompt ?? '';
  const prompt = typeof raw === 'string' ? raw : String(raw);
  if (!prompt) { pass(); return; }

  // [d] 결정 태그 감지 — meet.json 유무로 도구 분기 + 행동 규칙 주입
  const dTag = prompt.match(/\[d\]/i);
  if (dTag) {
    const postDecisionRules = `\n\nRecord decision only. For implementation, follow task pipeline.`;
    const meetFile = join(STATE_ROOT, 'meet.json');
    if (existsSync(meetFile)) {
      respond({
        continue: true,
        additionalContext: withNotices(`<nexus>Decision tag detected in meet mode. Use nx_meet_decide(issue_id, summary) to record — decision stored inline in meet.json.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, meetReminder),
      });
    } else {
      respond({
        continue: true,
        additionalContext: withNotices(`<nexus>[d]는 meet 세션 안에서만 유효합니다. [meet] 태그로 미팅을 먼저 시작하세요.${postDecisionRules}</nexus>`, tasksReminder, claudeMdNotice, null),
      });
    }
    return;
  }

  // 참석자 소환 패턴 감지
  if (ATTENDEE_PATTERNS.test(prompt)) {
    respond({
      continue: true,
      additionalContext: withNotices(`<nexus>Attendee pattern detected. Use nx_meet_join(role, name) to add a participant to the current meet session.</nexus>`, tasksReminder, claudeMdNotice, meetReminder),
    });
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
      additionalContext: withNotices(taskPipelineMessage(`<nexus>No active tasks.${branchGuard}</nexus>`), null, claudeMdNotice, meetReminder),
    });
    return;
  }

  // tasks.json 있음 + pending → 스마트 resume
  if (summary.pending > 0) {
    respond({
      continue: true,
      additionalContext: withNotices(`<nexus>Existing tasks detected (${summary.pending} pending). Smart resume: Review existing tasks with nx_task_list. For each pending task: verify if already implemented/documented. If stale → nx_task_close + fresh nx_task_add. If genuine → continue execution.</nexus>`, tasksReminder, claudeMdNotice, meetReminder),
    });
    return;
  }

  // tasks.json 있음 + all completed → stale cycle 감지
  respond({
    continue: true,
    additionalContext: withNotices(`<nexus>Stale tasks.json detected from previous cycle. MANDATORY: Call nx_task_close to archive before starting new work.</nexus>`, tasksReminder, claudeMdNotice, meetReminder),
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

  // PreToolUse에서 기록된 team-spawning 엔트리 매칭 → agent_id 업데이트
  const teamEntry = tracker.find((a) => a.agent_type === agentType && a.status === 'team-spawning');
  if (teamEntry) {
    teamEntry.agent_id = agentId;
    teamEntry.status = 'running';
  } else {
    tracker.push({ agent_type: agentType, agent_id: agentId, started_at: new Date().toISOString(), status: 'running' });
  }

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
