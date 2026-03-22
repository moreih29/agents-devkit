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
        reason: `[PLAN] ${pending.length} tasks remaining. Continue working on pending tasks. Use nx_task_update to mark completed tasks.`,
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

// --- UserPromptSubmit 이벤트 처리: 키워드 감지 ---

interface KeywordMatch {
  primitive: 'consult' | 'plan';
  skill: string;
}

const EXPLICIT_TAGS: Record<string, KeywordMatch> = {
  consult: { primitive: 'consult', skill: 'nexus:nx-consult' },
  plan:    { primitive: 'plan',    skill: 'nexus:nx-plan' },
};

const NATURAL_PATTERNS: Array<{ patterns: RegExp[]; match: KeywordMatch }> = [
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: 'consult', skill: 'nexus:nx-consult' },
  },
  {
    patterns: [/계획\s*(세워|짜|수립)/, /\bplan\b/i, /구현\s*계획/, /설계해/, /어떻게\s*구현/, /plan\s*this/i],
    match: { primitive: 'plan', skill: 'nexus:nx-plan' },
  },
];

// 프리미티브 이름이 에러/버그 맥락에서 언급되면 활성화가 아닌 "대화" — 오탐 방지
const ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
const PRIMITIVE_NAMES = /\b(plan|consult)\b/i;

/** 프리미티브 이름이 에러/버그 맥락과 함께 등장하거나, 단순 질문/인용 맥락인지 판별 */
function isPrimitiveMention(prompt: string): boolean {
  // 에러/버그 맥락
  if (PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt)) return true;
  // 질문 맥락: "plan이 뭐야", "what is consult" 등
  if (PRIMITIVE_NAMES.test(prompt) && /뭐야|뭔가요|what\s+is|what\s+does|설명해|explain/i.test(prompt)) return true;
  // 인용 맥락: `plan`, "consult"
  if (/[`"'](?:plan|consult)[`"']/i.test(prompt)) return true;
  return false;
}

function detectKeywords(prompt: string): KeywordMatch | null {
  // 1차: 명시적 태그 [consult], [plan] — 항상 확정
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

    if (match.primitive === 'plan') {
      // main/master 브랜치에서는 feature 브랜치 생성 먼저 유도
      let currentBranch = 'unknown';
      try { currentBranch = require('child_process').execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim(); } catch {}
      const onMain = currentBranch === 'main' || currentBranch === 'master';

      const branchInstruction = onMain
        ? `\nIMPORTANT: You are on the ${currentBranch} branch. Planning on main is NOT allowed.
Auto-create a feature branch BEFORE planning:
1. Analyze the user's request to generate a descriptive branch name (e.g., feat/phase-auto-tracking, fix/statusline-bug).
2. Check existing branches with: git branch --list '<candidate>'. If it exists, append a suffix (-2, -3, etc.).
3. Run: git checkout -b <branch-name>
4. Create plan directory: mkdir -p .nexus/plans/<branch-dir>/ (replace / with -- in branch name).
5. Then proceed with the plan workflow. Do NOT ask the user to choose a branch name — decide it yourself.`
        : '';

      respond({
        continue: true,
        additionalContext: `[NEXUS] Plan mode activated. Follow the plan workflow:${branchInstruction}
1. ANALYZE: Determine what needs to be done. If unclear, ask 1-2 clarifying questions via AskUserQuestion.
2. DRAFT: Write the plan yourself (do NOT delegate to Strategist). If decisions.json exists, read it for context.
3. REVIEW (large tasks only): Spawn Architect for structural review, then Reviewer for critique.
4. PERSIST: Use nx_task_add() to create tasks in .nexus/tasks.json. Each task needs title, context, and optional deps.
5. EXECUTE: For small tasks, use subagents. For large tasks, use TeamCreate + TaskCreate for Agent Teams.
Key: Gate Stop will block until all tasks are completed. Use nx_task_update() to mark progress.
`,
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
  // UserPromptSubmit은 prompt 필드가 있고, Stop은 없음.
  const hasPrompt = 'prompt' in event || 'user_prompt' in event;

  if (hasPrompt) {
    handleUserPromptSubmit(event);
  } else {
    handleStop();
  }
}

main().catch(() => {
  respond({ continue: true });
});
