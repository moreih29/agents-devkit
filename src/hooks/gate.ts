// Gate 훅: Stop (Task 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { RUNTIME_ROOT } from '../shared/paths.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// --- Stop 이벤트 처리 ---

function handleStop(): void {
  const tasksPath = join(RUNTIME_ROOT, 'tasks.json');
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

    // all completed → archive 지시
    respond({
      continue: true,
      additionalContext: '[NEXUS] All tasks completed. Run nx_plan_archive() to archive this plan, then report results to the user.',
    });
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

  // .nexus/tasks.json 존재 = team 모드 활성
  const tasksPath = join(RUNTIME_ROOT, 'tasks.json');
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
  primitive: 'consult' | 'team' | 'sub';
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  consult: { primitive: 'consult', skill: 'nexus:nx-consult' },
  team:    { primitive: 'team',    skill: 'nexus:nx-team' },
  sub:     { primitive: 'sub',     skill: 'nexus:nx-sub' },
};

const NATURAL_PATTERNS: Array<{ patterns: RegExp[]; match: KeywordMatch }> = [
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: 'consult', skill: 'nexus:nx-consult' },
  },
  {
    patterns: [/팀\s*(구성|으로)/, /\bteam\b/i, /team\s*this/i],
    match: { primitive: 'team', skill: 'nexus:nx-team' },
  },
];

// 프리미티브 이름이 에러/버그 맥락에서 언급되면 활성화가 아닌 "대화" — 오탐 방지
const ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
const PRIMITIVE_NAMES = /\b(team|consult)\b/i;

/** 프리미티브 이름이 에러/버그 맥락과 함께 등장하거나, 단순 질문/인용 맥락인지 판별 */
function isPrimitiveMention(prompt: string): boolean {
  // 에러/버그 맥락
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  // 질문 맥락: "plan이 뭐야", "what is consult" 등
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  // 인용 맥락: `team`, "consult"
  if (/[`"'](?:team|consult)[`"']/i.test(prompt)) return true;
  return false;
}

function detectKeywords(prompt: string): KeywordMatch | null {
  // 1차: 명시적 태그 [consult], [team] — 항상 확정
  const tagMatch = prompt.match(/\[(\w+)\]/);
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
  const prompt = (event.prompt ?? event.user_prompt ?? '') as string;
  if (!prompt) { pass(); return; }

  // [d] 결정 태그 감지
  const dTag = prompt.match(/\[d\]/i);
  if (dTag) {
    respond({
      continue: true,
      additionalContext: '[NEXUS] Decision tag detected. Record this decision using nx_decision_add tool.',
    });
    return;
  }

  const match = detectKeywords(prompt);
  if (match) {
    if (match.primitive === 'consult') {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Consult mode activated. Follow the consult workflow:
1. EXPLORE: Read code and knowledge first. Auto-detect brownfield vs greenfield.
2. CLARIFY: Use AskUserQuestion with concrete options. One question at a time. 1-2 rounds max.
3. PROPOSE: Present 2-3 genuinely different approaches with pros/cons/effort via AskUserQuestion.
4. CONVERGE: Summarize the chosen direction. Do NOT execute. Consult is advisory only.
Key: No execution. User decides next steps. [d] tags can record decisions during consult.`,
      });
      return;
    }

    if (match.primitive === 'sub') {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Sub mode activated. Lightweight execution — you handle analysis directly.

RULES:
1. You ARE allowed to use analysis and code tools (Read, Grep, LSP, AST, etc.) — unlike team mode.
2. Analyze the request yourself. Do NOT spawn Analyst or Architect.
3. If the task requires 4+ subtasks or cross-cutting concerns, STOP and suggest [team] to the user.
4. Spawn Builder subagents via Agent({ subagent_type: "nexus:builder" }) WITHOUT team_name (direct spawn, no team).
   Do NOT use TeamCreate or team_name — sub mode has no team.
5. Guard: spawn if changed files >= 3, or modified module has existing tests, or verification is warranted.
6. No tasks.json, no Gate Stop, no archive. Report results directly to the user.
7. Use TodoWrite after analysis to create a checklist of tasks (status: "pending"). Update each to "completed" after Builder finishes.

Workflow: analyze → TodoWrite (create checklist) → spawn builders (direct spawn) → update TodoWrite → (conditional) verify → report to user.`,
      });
      return;
    }

    if (match.primitive === 'team') {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Team mode activated. Follow the team workflow:
CRITICAL RULES — VIOLATION OF THESE IS A SYSTEM ERROR:
1. Direct Agent() calls are BLOCKED (except Explore and team_name agents).
2. Lead MUST NEVER call nx_task_add() or nx_task_update(). ONLY Analyst can create/modify tasks.
3. Lead MUST NEVER write code, edit files, or create plans. ALL work goes through teammates.
4. Lead uses ONLY orchestration tools (TeamCreate, Agent, SendMessage, AskUserQuestion). No analysis or code tools.
5. If you need tasks created, tell Analyst via SendMessage. Do NOT call nx_task_add yourself — even with a caller parameter.

1. INTAKE: Summarize user request/context. Branch Guard (create feature branch if on main/master). TeamCreate + spawn Analyst and Architect simultaneously via Agent({ team_name: ... }).
2. ANALYZE+PLAN: Analyst investigates using nx_knowledge_read, nx_context, LSP, AST tools. If unclear, Analyst sends question to Lead via SendMessage — Lead forwards to user via AskUserQuestion, then relays answer back to Analyst. Analyst and Architect then enter consensus loop (Analyst ↔ Architect via SendMessage). Analyst finalizes tasks via nx_task_add() after consensus.
3. PERSIST: Analyst registers all tasks in tasks.json via nx_task_add(). Gate Stop watches this file — nonstop execution begins immediately.
4. EXECUTE: Assign tasks — reuse idle teammates first (SendMessage to assign new work), spawn new teammates only if all are busy.
   - Any teammate can be spawned in parallel (e.g. builder-1, builder-2, guard-1, guard-2) when workload demands it.
   - Builder calls nx_task_update(id, "completed") when done, then SendMessage to Analyst to report completion.
   - Guard validates each task result, then SendMessage to Analyst with the result (pass or issues found).
   - On issues found, Guard reports to Analyst via SendMessage. Analyst updates tasks (nx_task_add or nx_task_update).
   - Debugger is for errors only — spawn on demand when a teammate hits a blocking issue.
5. COMPLETE: When all tasks done, call nx_plan_archive().

Teammate spawn example:
  TeamCreate({ team_name: "proj", description: "..." })
  Agent({ subagent_type: "nexus:analyst", name: "analyst", team_name: "proj", prompt: "..." })
  Agent({ subagent_type: "nexus:architect", name: "architect", team_name: "proj", prompt: "..." })

Key: Plan = consensus (Analyst + Architect), Execute = atomic by default — but Analyst may add tasks (nx_task_add) or reopen tasks (nx_task_update) based on Guard reports. Tasks are persisted in tasks.json. Gate Stop reminds until all nx_task tasks are completed. Do NOT use TaskCreate to spawn teammates — use Agent with team_name.
When reminded by Gate Stop, use SendMessage to check teammate progress or assign idle teammates instead of attempting the work yourself.`,
      });
      return;
    }
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
