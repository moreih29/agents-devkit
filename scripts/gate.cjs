"use strict";

// src/shared/hook-io.ts
function readStdin() {
  return new Promise((resolve2) => {
    let data = "";
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => resolve2(data));
  });
}
function respond(obj) {
  process.stdout.write(JSON.stringify(obj));
}
function pass() {
  respond({ continue: true });
}

// src/hooks/gate.ts
var import_fs3 = require("fs");

// src/shared/paths.ts
var import_path = require("path");
var import_fs = require("fs");
function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== "/") {
    if ((0, import_fs.existsSync)((0, import_path.join)(dir, ".git"))) return dir;
    dir = (0, import_path.resolve)(dir, "..");
  }
  return process.cwd();
}
var PROJECT_ROOT = findProjectRoot();
var RUNTIME_ROOT = (0, import_path.join)(PROJECT_ROOT, ".nexus");
var KNOWLEDGE_ROOT = (0, import_path.join)(PROJECT_ROOT, ".claude", "nexus");
function sessionDir(sessionId) {
  return (0, import_path.join)(RUNTIME_ROOT, "state", "sessions", sessionId);
}
function statePath(sessionId, key) {
  return (0, import_path.join)(sessionDir(sessionId), `${key}.json`);
}
function ensureDir(dir) {
  if (!(0, import_fs.existsSync)(dir)) {
    (0, import_fs.mkdirSync)(dir, { recursive: true });
  }
}

// src/shared/session.ts
var import_crypto = require("crypto");
var import_fs2 = require("fs");
var import_path2 = require("path");
var SESSION_FILE = (0, import_path2.join)(RUNTIME_ROOT, "state", "current-session.json");
function getSessionId() {
  if ((0, import_fs2.existsSync)(SESSION_FILE)) {
    try {
      const data = JSON.parse((0, import_fs2.readFileSync)(SESSION_FILE, "utf-8"));
      if (data.sessionId && typeof data.sessionId === "string") {
        return data.sessionId;
      }
    } catch {
    }
  }
  return createSession();
}
function createSession() {
  const sessionId = (0, import_crypto.randomUUID)().slice(0, 8);
  ensureDir((0, import_path2.join)(RUNTIME_ROOT, "state"));
  (0, import_fs2.writeFileSync)(SESSION_FILE, JSON.stringify({ sessionId, createdAt: (/* @__PURE__ */ new Date()).toISOString() }));
  return sessionId;
}

// src/hooks/gate.ts
var import_path3 = require("path");
function handleStop() {
  const sid = getSessionId();
  const sustainPath = statePath(sid, "nonstop");
  if ((0, import_fs3.existsSync)(sustainPath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(sustainPath, "utf-8"));
      if (state.active && state.currentIteration < state.maxIterations) {
        state.currentIteration++;
        (0, import_fs3.writeFileSync)(sustainPath, JSON.stringify(state, null, 2));
        respond({
          decision: "block",
          reason: `[SUSTAIN ${state.currentIteration}/${state.maxIterations}] \uC791\uC5C5\uC774 \uC644\uB8CC\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4. \uACC4\uC18D \uC9C4\uD589\uD558\uC138\uC694. \uC791\uC5C5\uC774 \uC815\uB9D0 \uB05D\uB0AC\uB2E4\uBA74 nx_state_clear({ key: "nonstop" })\uB97C \uD638\uCD9C\uD558\uC5EC nonstop\uC744 \uD574\uC81C\uD558\uC138\uC694.`
        });
        return;
      }
      if (state.active && state.currentIteration >= state.maxIterations) {
        state.active = false;
        (0, import_fs3.writeFileSync)(sustainPath, JSON.stringify(state, null, 2));
      }
    } catch {
    }
  }
  const pipelinePath = statePath(sid, "pipeline");
  if ((0, import_fs3.existsSync)(pipelinePath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(pipelinePath, "utf-8"));
      if (state.active) {
        const stageInfo = state.currentStage ? `${state.currentStage} (${(state.currentStageIndex ?? 0) + 1}/${state.totalStages ?? "?"})` : "?";
        respond({
          decision: "block",
          reason: `[PIPELINE stage: ${stageInfo}] \uD30C\uC774\uD504\uB77C\uC778\uC774 \uC2E4\uD589 \uC911\uC785\uB2C8\uB2E4. \uD604\uC7AC \uB2E8\uACC4\uB97C \uC644\uB8CC\uD558\uACE0 \uB2E4\uC74C \uB2E8\uACC4\uB85C \uC9C4\uD589\uD558\uC138\uC694.`
        });
        return;
      }
    } catch {
    }
  }
  const parallelPath = statePath(sid, "parallel");
  if ((0, import_fs3.existsSync)(parallelPath)) {
    try {
      const state = JSON.parse((0, import_fs3.readFileSync)(parallelPath, "utf-8"));
      if (state.active) {
        const completed = state.completedCount ?? 0;
        const total = state.totalCount ?? 0;
        if (total > 0 && completed < total) {
          respond({
            decision: "block",
            reason: `[PARALLEL ${completed}/${total}] \uBCD1\uB82C \uD0DC\uC2A4\uD06C\uAC00 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4. \uBAA8\uB4E0 \uD0DC\uC2A4\uD06C\uAC00 \uC644\uB8CC\uB420 \uB54C\uAE4C\uC9C0 \uACC4\uC18D\uD558\uC138\uC694.`
          });
          return;
        }
      }
    } catch {
    }
  }
  pass();
}
var EXPLICIT_TAGS = {
  nonstop: { primitive: "nonstop", skill: "nexus:nonstop" },
  parallel: { primitive: "parallel", skill: "nexus:parallel" },
  pipeline: { primitive: "pipeline", skill: "nexus:pipeline" },
  auto: { primitive: "pipeline", skill: "nexus:auto" },
  consult: { primitive: "consult", skill: "nexus:consult" },
  init: { primitive: "init", skill: "nexus:init" },
  plan: { primitive: "plan", skill: "nexus:plan" }
};
var AUTO_PATTERNS = [/\bauto\b/i, /\bcruise\b/i, /자동으로\s*전부/, /end\s*to\s*end/i];
var NATURAL_PATTERNS = [
  {
    patterns: [/\bnonstop\b/i, /\bsustain\b/i, /\bkeep\s+going\b/i, /\bdon'?t\s+stop\b/i, /멈추지\s*마/],
    match: { primitive: "nonstop", skill: "nexus:nonstop" }
  },
  {
    patterns: [/\bparallel\b/i, /\bconcurrent\b/i, /동시에/, /병렬로/],
    match: { primitive: "parallel", skill: "nexus:parallel" }
  },
  {
    patterns: [/\bpipeline\b/i, /순서대로/],
    match: { primitive: "pipeline", skill: "nexus:pipeline" }
  },
  {
    patterns: [/\bconsult\b/i, /상담/, /어떻게\s*하면\s*좋을까/, /뭐가\s*좋을까/, /방법을?\s*찾아/],
    match: { primitive: "consult", skill: "nexus:consult" }
  },
  {
    patterns: [/\binit\b/i, /온보딩/, /nexus\s*설정/, /프로젝트\s*초기화/],
    match: { primitive: "init", skill: "nexus:init" }
  },
  {
    patterns: [/계획\s*(세워|짜|수립)/, /\bplan\b/i, /구현\s*계획/, /설계해/, /어떻게\s*구현/, /plan\s*this/i],
    match: { primitive: "plan", skill: "nexus:plan" }
  }
];
var ERROR_CONTEXT = /에러|버그|오류|\bfix\b|\bbug\b|\berror\b|이슈|\bissue\b/i;
var PRIMITIVE_NAMES = /\b(nonstop|parallel|pipeline|auto|plan)\b/i;
function isPrimitiveMention(prompt) {
  return PRIMITIVE_NAMES.test(prompt) && ERROR_CONTEXT.test(prompt);
}
function detectAuto(prompt) {
  const tagMatch = prompt.match(/\[(\w+)\]/);
  if (tagMatch && tagMatch[1].toLowerCase() === "auto") return true;
  if (isPrimitiveMention(prompt)) return false;
  return AUTO_PATTERNS.some((p) => p.test(prompt));
}
function detectKeywords(prompt) {
  const tagMatch = prompt.match(/\[(\w+)\]/);
  if (tagMatch) {
    const tag = tagMatch[1].toLowerCase();
    if (tag in EXPLICIT_TAGS) return EXPLICIT_TAGS[tag];
  }
  for (const { patterns, match } of NATURAL_PATTERNS) {
    if (patterns.some((p) => p.test(prompt))) {
      if (isPrimitiveMention(prompt)) continue;
      return match;
    }
  }
  return null;
}
function activatePrimitive(primitive, sid) {
  const dir = sessionDir(sid);
  ensureDir(dir);
  const state = {
    active: true,
    maxIterations: 100,
    currentIteration: 0,
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    sessionId: sid
  };
  (0, import_fs3.writeFileSync)(statePath(sid, primitive), JSON.stringify(state, null, 2));
}
function handleUserPromptSubmit(event) {
  const prompt = event.prompt ?? event.user_prompt ?? "";
  if (!prompt) {
    pass();
    return;
  }
  const isForced = /^force:\s*|^\[force\]\s*/i.test(prompt.trim());
  const cleanPrompt = isForced ? prompt.trim().replace(/^force:\s*|^\[force\]\s*/i, "") : prompt;
  if (detectAuto(cleanPrompt)) {
    if (!isForced && !hasConcreteSignals(cleanPrompt)) {
      respond({
        continue: true,
        additionalContext: `[NEXUS] The request lacks concrete signals (file paths, identifiers, issue numbers, or structured steps). Consider using [plan] to create a detailed plan first, or prefix with "force:" to proceed anyway.`
      });
      return;
    }
    const sid = getSessionId();
    activatePrimitive("pipeline", sid);
    activatePrimitive("nonstop", sid);
    respond({
      continue: true,
      additionalContext: `[NEXUS] auto mode ACTIVATED (session: ${sid}). Pipeline + Nonstop enabled.
Execute these stages IN ORDER:
1. Analyze \u2014 understand the codebase and request
2. Plan \u2014 break into actionable steps
3. Implement \u2014 write code (use parallel Agent calls for independent tasks)
4. Verify \u2014 run tests, type-check
5. Review \u2014 review your own changes for correctness
Update pipeline state with nx_state_write as you progress through stages.
IMPORTANT: Before finishing, call nx_state_clear({ key: "auto" }) to deactivate all state at once. Do NOT stop without clearing state first.`
    });
    return;
  }
  const match = detectKeywords(cleanPrompt);
  if (match) {
    if (match.primitive === "init") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Init mode activated. Follow the init workflow:
1. SCAN: Read project structure (top-level dirs, config files), CLAUDE.md, README.md, docs/, .claude/, and other .md files. Use git log for recent activity.
2. TRIAGE: Classify each doc as Essential (\u2192 knowledge/), Useful (\u2192 knowledge/ condensed), Redundant (Nexus handles better), or Outdated (skip).
3. PROPOSE: Present triage results to user via AskUserQuestion. Ask about CLAUDE.md slimming strategy and which knowledge files to generate.
4. GENERATE: Create .claude/nexus/knowledge/ files (architecture.md, conventions.md, project-context.md). Backup original CLAUDE.md. Slim CLAUDE.md per user choice.
5. VERIFY: Confirm generated files are readable via nx_knowledge_read. Report summary.
IMPORTANT: Always backup before modifying. Never delete without user approval.`
      });
      return;
    }
    if (match.primitive === "consult") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Consult mode activated. Follow the consult workflow:
1. EXPLORE: Read code (nx_lsp_document_symbols, nx_ast_search for brownfield), knowledge (nx_knowledge_read), context (nx_context). Auto-detect brownfield vs greenfield.
2. ASSESS: Evaluate 4 dimensions \u2014 [Goal: ?] [Constraints: ?] [Criteria: ?] [Context: ?]. Mark each \u2705/\u26A0\uFE0F/\u274C. If \u22641 unclear \u2192 lightweight mode. If \u22652 unclear \u2192 deep mode.
3. CLARIFY (if unclear dimensions exist; 1-2 questions in lightweight, extended in deep): Ask ONE question at a time targeting the weakest dimension. Use perspective shifts naturally when needed.
4. DIVERGE: Generate 2-4 genuinely different approaches with pros/cons/effort.
5. PROPOSE: Present options via AskUserQuestion with preview for concrete comparisons.
6. CONVERGE: Elaborate chosen approach, follow-up if needed, produce concrete plan.
7. CRYSTALLIZE: Finalize plan. If unclear dimensions remain, disclose risks transparently \u2014 but never block the user.
8. EXECUTE BRIDGE: Offer 2-3 options via AskUserQuestion: Auto (recommended) / Pipeline / Plan only.
Key: One question at a time. Specific choices, not vague "what do you think?". Respect user autonomy.`
      });
      return;
    }
    if (match.primitive === "plan") {
      respond({
        continue: true,
        additionalContext: `[NEXUS] Plan mode activated. Follow the plan workflow:
1. ANALYZE: Analyze the request. Determine scale \u2014 small (1-3 files), medium (module-level), large (architecture/security/migration). Auto-escalate to large if request mentions auth, migration, delete, or security.
2. DRAFT: Spawn Agent({ subagent_type: "nexus:strategist", prompt: "<full request context>" }) to create initial plan.
3. REVIEW (medium+): Spawn Agent({ subagent_type: "nexus:architect", prompt: "Review this plan: <strategist output>" }) for structural review.
4. CRITIQUE (large only): Spawn Agent({ subagent_type: "nexus:reviewer", prompt: "Critique this plan: <architect output>" }). If critical issues, loop back to DRAFT (max 3 iterations).
5. PERSIST: Save plan to .claude/nexus/plans/{branch}.md. Present summary to user.
6. EXECUTE BRIDGE: Offer 2-3 options via AskUserQuestion: Auto (recommended) / Pipeline / Plan only.
Key: This is the standalone Plan skill \u2014 not the plan stage within auto. Scale determines formality. Small tasks need only a checklist, not a full ADR.`
      });
      return;
    }
    const sid = getSessionId();
    activatePrimitive(match.primitive, sid);
    respond({
      continue: true,
      additionalContext: `[NEXUS] ${match.primitive} mode ACTIVATED (session: ${sid}). Do NOT stop until the task is fully complete. IMPORTANT: Before finishing your response, you MUST call nx_state_clear({ key: "${match.primitive}" }) to deactivate. Do NOT attempt to stop without clearing state first.`
    });
    return;
  }
  const taskQuery = detectTaskQuery(cleanPrompt);
  if (taskQuery) {
    respond({
      continue: true,
      additionalContext: taskQuery
    });
    return;
  }
  const routing = detectRouting(cleanPrompt);
  if (routing) {
    respond({
      continue: true,
      additionalContext: routing
    });
    return;
  }
  pass();
}
function hasConcreteSignals(prompt) {
  const signals = [
    /[a-zA-Z\/]+\.[a-z]{1,4}/,
    // 파일 경로
    /\b[a-z]+[A-Z][a-zA-Z]*\b/,
    // camelCase
    /\b[A-Z][a-z]+[A-Z][a-zA-Z]*\b/,
    // PascalCase
    /#\d+/,
    // 이슈 번호
    /^\s*\d+[\.\)]/m,
    // 번호 매긴 단계
    /plans?\//
    // plan 문서 참조
  ];
  return signals.some((s) => s.test(prompt));
}
var AGENT_NAMES = [
  "finder",
  "builder",
  "guard",
  "debugger",
  "lead",
  "architect",
  "strategist",
  "reviewer",
  "analyst",
  "tester",
  "writer"
];
var ROUTING_RULES = [
  {
    category: "\uBC84\uADF8 \uC218\uC815",
    patterns: [/버그/, /고쳐/, /\bfix\b/i, /에러/, /\berror\b/i, /안\s*돼/, /안\s*됨/, /\bbug\b/i, /오류/, /문제.*해결/],
    agent: "debugger",
    workflow: "nonstop"
  },
  {
    category: "\uCF54\uB4DC \uB9AC\uBDF0",
    patterns: [/리뷰/, /\breview\b/i, /봐\s*줘/, /검토/, /코드\s*확인/],
    agent: "reviewer"
  },
  {
    category: "\uD14C\uC2A4\uD2B8",
    patterns: [/테스트/, /\btest\b/i, /커버리지/, /\bcoverage\b/i, /검증\s*코드/],
    agent: "tester",
    workflow: "nonstop"
  },
  {
    category: "\uB9AC\uD329\uD1A0\uB9C1",
    patterns: [/리팩토링/, /\brefactor\b/i, /정리/, /개선/, /클린\s*업/, /\bclean\s*up\b/i],
    agent: "builder",
    workflow: "nonstop"
  },
  {
    category: "\uD0D0\uC0C9/\uAC80\uC0C9",
    patterns: [/찾아/, /어디/, /\bsearch\b/i, /\bfind\b/i, /검색/, /위치/],
    agent: "finder"
  },
  {
    category: "\uC124\uACC4/\uC544\uD0A4\uD14D\uCC98",
    patterns: [/설계/, /아키텍처/, /구조/, /\bdesign\b/i, /\barchitect/i],
    agent: "architect"
  },
  {
    category: "\uACC4\uD68D \uC218\uB9BD",
    patterns: [/계획/, /\bplan\b/i, /어떻게\s*진행/, /단계/, /로드맵/],
    agent: "strategist"
  },
  {
    category: "\uBD84\uC11D",
    patterns: [/분석/, /\banalyze?\b/i, /왜\s/, /원인/, /조사/, /\binvestigat/i],
    agent: "analyst",
    workflow: "nonstop"
  },
  {
    category: "\uBB38\uC11C",
    patterns: [/문서/, /\bREADME\b/i, /\bdocs?\b/i, /가이드/, /주석/],
    agent: "writer"
  },
  {
    category: "\uB300\uADDC\uBAA8 \uAD6C\uD604",
    patterns: [/구현/, /만들어/, /추가/, /\bimplement\b/i, /\bcreate\b/i, /새로운?\s*기능/],
    workflow: "auto"
  }
];
var HISTORY_PATH = (0, import_path3.join)(RUNTIME_ROOT, "routing-history.json");
function loadHistory() {
  if ((0, import_fs3.existsSync)(HISTORY_PATH)) {
    try {
      return JSON.parse((0, import_fs3.readFileSync)(HISTORY_PATH, "utf-8"));
    } catch {
    }
  }
  return { overrides: {} };
}
function saveHistory(history) {
  ensureDir(RUNTIME_ROOT);
  (0, import_fs3.writeFileSync)(HISTORY_PATH, JSON.stringify(history, null, 2));
}
function getPreferredAgent(history, category) {
  const counts = history.overrides[category];
  if (!counts) return null;
  let best = null;
  let bestCount = 0;
  for (const [agent, count] of Object.entries(counts)) {
    if (count > bestCount) {
      best = agent;
      bestCount = count;
    }
  }
  return bestCount >= 2 ? best : null;
}
function recordOverride(category, agent) {
  const history = loadHistory();
  if (!history.overrides[category]) history.overrides[category] = {};
  history.overrides[category][agent] = (history.overrides[category][agent] ?? 0) + 1;
  saveHistory(history);
}
function detectRouting(prompt) {
  const agentOverride = detectAgentOverride(prompt);
  if (agentOverride) {
    for (const rule of ROUTING_RULES) {
      if (rule.patterns.some((p) => p.test(prompt))) {
        recordOverride(rule.category, agentOverride);
        break;
      }
    }
    return `[NEXUS] Agent specified: nexus:${agentOverride}. Delegate via Agent({ subagent_type: "nexus:${agentOverride}", prompt: "<task>" }).`;
  }
  const history = loadHistory();
  for (const rule of ROUTING_RULES) {
    if (rule.patterns.some((p) => p.test(prompt))) {
      const preferred = getPreferredAgent(history, rule.category);
      const agent = preferred ?? rule.agent;
      const workflow = rule.workflow;
      if (agent && workflow) {
        const hint = preferred ? " (history-based)" : "";
        return `[NEXUS] Delegate to nexus:${agent} for ${rule.category}. Use Agent({ subagent_type: "nexus:${agent}", prompt: "<task>" }). Workflow: ${workflow}.${hint ? ` ${hint}` : ""}`;
      } else if (agent) {
        const hint = preferred ? " (history-based)" : "";
        return `[NEXUS] Delegate to nexus:${agent} for ${rule.category}. Use Agent({ subagent_type: "nexus:${agent}", prompt: "<task>" }).${hint ? ` ${hint}` : ""}`;
      } else if (workflow === "auto") {
        return `[NEXUS] Large-scale implementation detected. Consider [auto] mode or delegate via Agent({ subagent_type: "nexus:builder", prompt: "<task>" }).`;
      }
    }
  }
  return null;
}
var AGENT_SUFFIXES = /(?:로|으로|에게|한테|가|이|를|을|의|도|만|부터|까지)/;
function detectAgentOverride(prompt) {
  for (const name of AGENT_NAMES) {
    if (new RegExp(`nexus:${name}`, "i").test(prompt)) return name;
    if (new RegExp(`\\b${name}\\b${AGENT_SUFFIXES.source}`, "i").test(prompt)) return name;
    if (new RegExp(`\\b${name[0].toUpperCase()}${name.slice(1)}\\b`).test(prompt)) return name;
  }
  return null;
}
var TASK_PATTERNS = [
  {
    patterns: [/진행\s*중.*작업/, /현재\s*작업/, /지금\s*뭐/, /하고\s*있는\s*일/, /\bin.?progress\b/i],
    tool: 'nx_task_list({ status: "in_progress" })',
    description: "\uC9C4\uD589 \uC911\uC778 \uD0DC\uC2A4\uD06C \uBAA9\uB85D"
  },
  {
    patterns: [/다음\s*(할\s*일|계획|작업)/, /\btodo\b/i, /할\s*일\s*목록/, /남은\s*작업/],
    tool: 'nx_task_list({ status: "todo" })',
    description: "TODO \uD0DC\uC2A4\uD06C \uBAA9\uB85D"
  },
  {
    patterns: [/작업\s*현황/, /태스크\s*요약/, /\btask.*summary\b/i, /전체\s*진행/, /작업\s*상태/],
    tool: "nx_task_summary()",
    description: "\uD0DC\uC2A4\uD06C \uC804\uCCB4 \uC694\uC57D"
  },
  {
    patterns: [/막힌\s*작업/, /블로커/, /\bblocked?\b/i],
    tool: 'nx_task_list({ status: "blocked" })',
    description: "\uBE14\uB85C\uD0B9\uB41C \uD0DC\uC2A4\uD06C \uBAA9\uB85D"
  }
];
function detectTaskQuery(prompt) {
  for (const { patterns, tool, description } of TASK_PATTERNS) {
    if (patterns.some((p) => p.test(prompt))) {
      return `[NEXUS] ${description}\uC744 \uD655\uC778\uD558\uB824\uBA74 ${tool}\uC744 \uD638\uCD9C\uD558\uC138\uC694.`;
    }
  }
  return null;
}
async function main() {
  const input = await readStdin();
  const event = JSON.parse(input);
  const hasPrompt = "prompt" in event || "user_prompt" in event;
  if (hasPrompt) {
    handleUserPromptSubmit(event);
  } else {
    handleStop();
  }
}
main().catch(() => {
  respond({ continue: true });
});
//# sourceMappingURL=gate.cjs.map
