<!-- tags: omc, omo, competitor, orchestration, agents, comparison -->
# Competitor Project Comparative Analysis

Research date: 2026-03-29.

## Project Overview

| | OMC (oh-my-claudecode) | OMO (oh-my-openagent) | Nexus |
|--|----------------------|---------------------|-------|
| Agent count | 29+ (19 built-in + aliases) | 8–10 | 9 |
| Orchestrator | Lead (system prompt) | Sisyphus (iterative) + Atlas (large-scale) | Lead only |
| Team structure | tmux + git worktree physical isolation | BackgroundManager async | TeamCreate logical team |
| Pipeline | plan→prd→exec→verify→fix 5 stages | Intent Gate→Exploration→Implementation→Completion | Intake→Design→Execute→Complete 4 stages |
| Harness | SubagentStart/Stop hooks, verify-deliverables | Phase 2C (3 attempts → escalation), recursive delegation block | gate.ts task pipeline |
| Information management | 5-tier (Notepad~Tags), 50+ files in team/ | Wisdom Accumulation (in-session learning) | 4-layer core/ (identity/codebase/reference/memory) |

## OMC Key Patterns

- **Lane separation**: Build Lane + Analysis Lane + Review Lane. Explicit per-role pipeline.
- **19 agents in detail**: explore(haiku), analyst(opus), planner(opus), architect(opus), debugger(sonnet), executor(sonnet), verifier(sonnet), tracer(sonnet), security-reviewer(sonnet), code-reviewer(opus), test-engineer(sonnet), designer(sonnet), writer(haiku), qa-tester(sonnet), scientist(sonnet), git-master(sonnet), code-simplifier(opus), critic(opus), document-specialist(sonnet)
- **SubagentStart/Stop hooks**: agent lifecycle tracking → active agent counting.
- **Lesson**: Over-specialization of agents → high management overhead. 10+ deprecated aliases are evidence of complexity.

## OMO Key Patterns

- **Dynamic prompt building**: prompts composed dynamically based on available resources (buildDynamicSisyphusPrompt).
- **6-Section delegation prompt (MANDATORY)**: TASK / EXPECTED OUTCOME / REQUIRED TOOLS / MUST DO / MUST NOT DO / CONTEXT.
- **Phase 2C failure recovery**: 3 failures → STOP → REVERT → Oracle escalation.
- **Recursive delegation block**: delegate_task tool blocked for Sisyphus-Junior.
- **Metis + Momus**: plan gap analysis (Metis) + plan review (Momus) two-stage validation.
- **Wisdom Accumulation**: Conventions/Successes/Failures/Gotchas/Commands accumulated → in-session learning.
- **Session continuity**: context preservation + token savings via session_id resume.

## Borrowable Implementation Patterns

### OMC State Management

- **Atomic write**: tmp + rename to prevent partial writes.
- **Session staleness TTL**: sessions idle more than 2 hours are marked stale → Stop block lifted.
- **Cancel signal 30-second TTL**: persistent-mode immediately permitted upon Cancel input.
- **Circuit breaker thresholds**: team pipeline max 20, replan max 30 + TTL-based auto-release.

### OMC Context Protection

- **suppressOutput pattern**: all hook responses return `{ continue: true, suppressOutput: true }` → prevents system-reminder injection (resolves context pollution).
- **Context guard thresholds**: at 72% context usage, heavy tools blocked in PreToolUse; at 95%, Stop is permitted.

### OMC Verification Intensity Automation

- **Verification tier selector**: automatic selection based on change size.
  - Lightweight: <5 files, <100 lines
  - Standard: default
  - Thorough: >20 files
- **Skill protection tiers (3 levels)**: light (5-min TTL / 3 attempts), medium (15-min / 5), heavy (30-min / 10) — differentiated Stop hook intensity.

### OMO Completion Detection + Concurrency

- **BackgroundManager triple completion check**: (1) session.idle event, (2) 500ms polling (up to 10 min), (3) stability detection (3 consecutive identical message counts + MIN_STABILITY_TIME 10s).
- **ConcurrencyManager**: concurrency slot control per provider/model. defaultConcurrency: 2, anthropic: 3.

### OMO Plan Validation

- **Prometheus 5-stage pipeline**: Interview → Metis Consultation (MANDATORY) → Plan Generation → Self-Review (CRITICAL/MINOR/AMBIGUOUS) → Momus Loop until OKAY → Delete draft → /start-work.
- **Momus quantitative approval criteria**: 100% file reference verification, ≥80% reference sources, ≥90% acceptance criteria.
- **7 intent classifications**: Trivial / Refactoring / Build from Scratch / Mid-sized / Collaborative / Architecture / Research — different strategy per intent.

### OMO Agent Design

- **Cost classification system**: `AgentCost: "FREE" | "CHEAP" | "EXPENSIVE"` + `AgentCategory: "exploration" | "specialist" | "advisor" | "utility"` — cost-aware agent selection principle.
- **Dynamic prompt builder structure**: `categorizeTools()` → `buildKeyTriggersSection()`, `buildToolSelectionTable()`, `buildDelegationTable()` — section-by-section generation.

### OMO Claude Code Compatibility

- **5 compatibility layers**: MCP Loader (.mcp.json → OpenCode conversion), Agent Loader (.claude/agents/), Command Loader, Session State (mainSessionID tracking), Plugin Loader — OpenCode-based while fully absorbing the Claude Code ecosystem.

## Nexus Structural Gaps (vs. Competitors)

1. **No input/output contracts** — natural language SendMessage vs. OMO mandatory 6-Section format.
2. **No agent-level harness** — file-level task pipeline only. No agent failure tracking / Circuit Breaker / recursive delegation block.
3. **No plan validation layer** — Lead handles both planning and validation, vs. OMO's separate Metis + Momus.
4. **No in-session learning** — memory = cross-session learning only. OMO Wisdom = immediate in-session propagation.

## Nexus Unique Strengths (vs. Competitors)

1. **Minimal complexity** — 9 agents, single gate.ts. Significantly simpler than OMC's 29+/50+ files.
2. **Centralized harness** — single gate.ts module. Better traceability than OMO's distributed guardrails.
3. **4-layer information architecture** — clear identity/codebase/reference/memory classification. Cleaner than OMC's 5-tier.
4. **Bootstrap (dogfooding)** — developed using itself. Quality feedback loop absent in OMC/OMO.
