// Gate 훅: Stop (Task 차단) + UserPromptSubmit (키워드 감지)
import { readStdin, respond, pass } from '../shared/hook-io.js';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// --- Stop 이벤트 처리 ---

function handleStop(): void {
  const tasksPath = join(process.cwd(), '.nexus', 'tasks.json');
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
        decision: 'block',
        reason: `[TEAM] ${pending.length} tasks remaining. Continue working on pending tasks. Use nx_task_update to mark completed tasks.`,
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
  const tasksPath = join(process.cwd(), '.nexus', 'tasks.json');
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
  primitive: 'consult' | 'team';
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  consult: { primitive: 'consult', skill: 'nexus:nx-consult' },
  team:    { primitive: 'team',    skill: 'nexus:nx-team' },
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

    if (match.primitive === 'team') {
      const branchInstruction = '';
      respond({
        continue: true,
        additionalContext: `[NEXUS] Team mode activated. Follow the team workflow:${branchInstruction}
IMPORTANT: Direct Agent() calls are BLOCKED in team mode. You MUST use TeamCreate + TaskCreate.

1. ANALYZE: Determine what needs to be done. If unclear, ask 1-2 clarifying questions via AskUserQuestion. If decisions.json exists, read it for context.
2. DRAFT: Write the plan yourself.
3. REVIEW: Use TeamCreate to create a team, then use TaskCreate to add Architect and Reviewer as teammates for plan review.
4. PERSIST: Use nx_task_add() to create tasks in .nexus/tasks.json. Each task needs title, context, and optional deps.
5. EXECUTE: Use TaskCreate to add Builder, Debugger, Tester, Guard as teammates. Assign tasks via TaskUpdate with owner parameter.
6. VERIFY: Guard teammate verifies completed work. Use nx_task_update() to mark task progress.

Example team setup:
  TeamCreate({ team_name: "project-x", description: "..." })
  TaskCreate({ team_name: "project-x", subagent_type: "nexus:architect", name: "architect", prompt: "..." })
  TaskCreate({ team_name: "project-x", subagent_type: "nexus:builder", name: "builder", prompt: "..." })

Key: Gate Stop blocks until all nx_task tasks are completed. Use nx_task_update() to mark progress. nx_plan_archive() to finish.`,
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
