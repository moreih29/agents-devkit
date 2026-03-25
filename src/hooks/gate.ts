// Gate 훅: Stop (Task 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { BRANCH_ROOT, RUNTIME_ROOT } from '../shared/paths.js';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';

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
  const tasksPath = join(BRANCH_ROOT, 'tasks.json');
  if (!existsSync(tasksPath)) {
    pass();
    return;
  }

  try {
    const data = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    const tasks = data.tasks ?? [];
    const pending = tasks.filter((t: { status: string }) => t.status !== 'completed');

    if (pending.length > 0) {
      respond({
        continue: true,
        additionalContext: `[NEXUS] ${pending.length} tasks remaining in tasks.json. Complete all tasks before stopping.`,
      });
      return;
    }

    // all completed → 더 이상 차단하지 않음
    pass();
    return;
  } catch {
    pass();
    return;
  }
}

// --- PreToolUse 이벤트 처리: Agent 직접 호출 차단 ---

function handlePreToolUse(event: Record<string, unknown>): void {
  const toolName = (event.tool_name ?? '') as string;

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

  // .nexus/<branch>/tasks.json 존재 = team 모드 활성
  const tasksPath = join(BRANCH_ROOT, 'tasks.json');
  if (!existsSync(tasksPath)) {
    pass();
    return;
  }

  // team 모드에서 Agent() 직접 호출 차단
  respond({
    decision: 'block',
    reason: '[TEAM] Direct Agent() calls are blocked in team mode. Use TeamCreate + TaskCreate to spawn teammates, or SendMessage to communicate with existing teammates.',
  });
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
  const tagMatch = prompt.match(/\[([\w:]+!?)\]/);
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

function handleUserPromptSubmit(event: Record<string, unknown>): void {
  const claudeMdNotice = handleClaudeMdSync();

  const prompt = (event.prompt ?? event.user_prompt ?? '') as string;
  if (!prompt) { pass(); return; }

  // [d] 결정 태그 감지 — consult.json 유무로 도구 분기 + 행동 규칙 주입
  const dTag = prompt.match(/\[d\]/i);
  if (dTag) {
    const postDecisionRules = `\n\nAfter recording the decision:\n1. Record the decision ONLY. Do NOT execute or implement unless the user explicitly requests it.\n2. If the user explicitly requests implementation: nx_task_add → perform work → nx_task_close (history archive). Follow this pipeline even for simple edits.\n3. You may recommend [dev] or [research] tags for execution, but do not execute yourself unless asked.`;
    const consultFile = join(BRANCH_ROOT, 'consult.json');
    if (existsSync(consultFile)) {
      respond({
        continue: true,
        additionalContext: `${claudeMdNotice ? claudeMdNotice + '\n' : ''}[NEXUS] Decision tag detected in consult mode. Use nx_consult_decide(issue_id, summary) to record — updates consult.json + decisions.json simultaneously.${postDecisionRules}`,
      });
    } else {
      respond({
        continue: true,
        additionalContext: `${claudeMdNotice ? claudeMdNotice + '\n' : ''}[NEXUS] Decision tag detected. Record this decision using nx_decision_add tool.${postDecisionRules}`,
      });
    }
    return;
  }

  const match = detectKeywords(prompt);
  if (match) {
    if (match.primitive === 'consult') {
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
        additionalContext: `${base}${claudeMdNotice ? '\n' + claudeMdNotice : ''}`,
      });
      return;
    }

    if (match.primitive === 'dev') {
      const base = `[NEXUS] Dev mode activated. Assess the request and choose your approach:
- Simple (1-3 files, clear scope): Use direct Agent() spawns freely with any agent (director, architect, engineer, qa)
- Complex (4+ files, design decisions needed): Use TeamCreate + full team workflow (director+architect design → engineer+qa execute)
[dev!] forces team mode. Otherwise, use your judgment — no need to over-analyze.`;
      respond({
        continue: true,
        additionalContext: `${base}${claudeMdNotice ? '\n' + claudeMdNotice : ''}`,
      });
      return;
    }

    if (match.primitive === 'dev!') {
      const base = `[NEXUS] Dev team mode activated (forced). Follow the team workflow:
CRITICAL RULES — VIOLATION OF THESE IS A SYSTEM ERROR:
1. Direct Agent() calls are BLOCKED (except Explore and team_name agents).
2. Lead MUST NEVER call nx_task_add() or nx_task_update(). ONLY director can create/modify tasks.
3. Lead MUST NEVER write code, edit files, or create plans. ALL work goes through teammates.
4. Lead uses ONLY orchestration tools (TeamCreate, Agent, SendMessage, AskUserQuestion). No analysis or code tools.
5. If you need tasks created, tell director via SendMessage. Do NOT call nx_task_add yourself — even with a caller parameter.

1. INTAKE: Summarize user request/context. TeamCreate + spawn director and architect simultaneously via Agent({ team_name: ... }).
2. ANALYZE+PLAN: director investigates using nx_knowledge_read, nx_context, LSP, AST tools. If unclear, director sends question to Lead via SendMessage — Lead forwards to user via AskUserQuestion, then relays answer back to director. director and architect then enter consensus loop (director ↔ architect via SendMessage). director finalizes tasks via nx_task_add() after consensus.
3. PERSIST: director registers all tasks in tasks.json via nx_task_add(). Gate Stop watches this file — nonstop execution begins immediately.
4. EXECUTE: Assign tasks — reuse idle teammates first (SendMessage to assign new work), spawn new teammates only if all are busy.
   - Any teammate can be spawned in parallel (e.g. engineer-1, engineer-2, qa-1, qa-2) when workload demands it.
   - engineer calls nx_task_update(id, "completed") when done, then SendMessage to director to report completion.
   - qa validates each task result, then SendMessage to director with the result (pass or issues found).
   - On issues found, qa reports to director via SendMessage. director updates tasks (nx_task_add or nx_task_update).
5. COMPLETE: When all tasks done, Gate Stop unblocks automatically.

Teammate spawn example:
  TeamCreate({ team_name: "proj", description: "..." })
  Agent({ subagent_type: "claude-nexus:director", name: "director", team_name: "proj", prompt: "..." })
  Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "proj", prompt: "..." })

Key: Plan = consensus (director + architect), Execute = atomic by default — but director may add tasks (nx_task_add) or reopen tasks (nx_task_update) based on qa reports. Tasks are persisted in tasks.json. Gate Stop reminds until all nx_task tasks are completed. When reminded by Gate Stop, use SendMessage to check teammate progress or assign idle teammates instead of attempting the work yourself.
Escalation: engineer/qa report to director by default. Escalate to architect for design/architecture questions.`;
      respond({
        continue: true,
        additionalContext: `${base}${claudeMdNotice ? '\n' + claudeMdNotice : ''}`,
      });
      return;
    }

    if (match.primitive === 'research') {
      const base = `[NEXUS] Research mode activated. Assess the request and choose your approach:
- Simple (1-3 topics, single domain): Use direct Agent() spawns freely with any agent (principal, postdoc, researcher)
- Complex (4+ topics, multiple domains/sources needed): Use TeamCreate + full team workflow (principal+postdoc scope → researcher investigate → converge)
[research!] forces team mode. Otherwise, use your judgment — no need to over-analyze.`;
      respond({
        continue: true,
        additionalContext: `${base}${claudeMdNotice ? '\n' + claudeMdNotice : ''}`,
      });
      return;
    }

    if (match.primitive === 'research!') {
      const base = `[NEXUS] Research team mode activated (forced). Follow the team workflow:
CRITICAL RULES — VIOLATION OF THESE IS A SYSTEM ERROR:
1. Direct Agent() calls are BLOCKED (except Explore and team_name agents).
2. Lead MUST NEVER call nx_task_add() or nx_task_update(). ONLY principal can create/modify tasks.
3. Lead MUST NEVER conduct research, read sources, or create plans. ALL work goes through teammates.
4. Lead uses ONLY orchestration tools (TeamCreate, Agent, SendMessage, AskUserQuestion). No analysis or research tools.
5. If you need tasks created, tell principal via SendMessage. Do NOT call nx_task_add yourself — even with a caller parameter.

1. INTAKE: Summarize user request/context. TeamCreate + spawn principal and postdoc simultaneously via Agent({ team_name: ... }).
2. SCOPE: principal investigates background/context. If unclear, principal sends question to Lead via SendMessage — Lead forwards to user via AskUserQuestion, then relays answer back to principal. principal and postdoc then enter consensus loop (principal ↔ postdoc via SendMessage). principal finalizes tasks via nx_task_add() after consensus.
3. PERSIST: principal registers all tasks in tasks.json via nx_task_add(). Gate Stop watches this file — nonstop execution begins immediately.
4. INVESTIGATE: Assign tasks — reuse idle teammates first (SendMessage to assign new work), spawn new teammates only if all are busy.
   - Any teammate can be spawned in parallel (e.g. researcher-1, researcher-2) when workload demands it.
   - researcher calls nx_task_update(id, "completed") when done, then SendMessage to principal to report completion.
   - On insufficient results, principal updates tasks (nx_task_add or nx_task_update).
5. CONVERGE: principal synthesizes findings with postdoc via SendMessage. Final insights/recommendations drafted.
6. COMPLETE: When all tasks done, Gate Stop unblocks automatically.

Teammate spawn example:
  TeamCreate({ team_name: "proj", description: "..." })
  Agent({ subagent_type: "claude-nexus:principal", name: "principal", team_name: "proj", prompt: "..." })
  Agent({ subagent_type: "claude-nexus:postdoc", name: "postdoc", team_name: "proj", prompt: "..." })

Key: Scope = consensus (principal + postdoc), Investigate = atomic by default — but principal may add tasks (nx_task_add) or reopen tasks (nx_task_update) based on findings. Tasks are persisted in tasks.json. Gate Stop reminds until all nx_task tasks are completed. When reminded by Gate Stop, use SendMessage to check teammate progress or assign idle teammates instead of attempting the work yourself.
Escalation: researcher reports to principal by default. Escalate to postdoc for methodology/source questions.`;
      respond({
        continue: true,
        additionalContext: `${base}${claudeMdNotice ? '\n' + claudeMdNotice : ''}`,
      });
      return;
    }
  }

  if (claudeMdNotice) {
    respond({ continue: true, additionalContext: claudeMdNotice });
    return;
  }

  pass();
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
