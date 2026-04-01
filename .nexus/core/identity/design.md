<!-- tags: identity, design, roles, tags, harness, information, context -->
# Design

## Role Structure

### Lead (Main)

Interprets user instructions, coordinates agents, and communicates results. Agent delegation is the default.

**Default behavior**: Messages without tags are delegated to agents per the CLAUDE.md Agent Routing table. The [run] tag activates the full pipeline.

**Direct execution**: The user decides scope. Simple tasks are handled directly by Lead per CLAUDE.md instructions.

**References**: Core information (codebase, memory, etc.) and user instructions. Fact-checking is allowed; analysis and judgment are delegated to agents.

**Coordination rules**:
- Parallelization: parallel if no file overlap, sequential if overlap exists
- QA role separation: Lead = build + E2E, QA = code quality
- Execute user instructions + own tasks + manage team

### Agents (9)

| Role | Function | Category | Model |
|------|----------|----------|-------|
| **Architect** | Technical feasibility, code design, plan validation gate | How | opus |
| **Postdoc** | Methodology, evidence evaluation, synthesis, plan validation gate | How | opus |
| **Designer** | UI/UX design, interaction patterns, user experience | How | opus |
| **Strategist** | Business strategy, market analysis, competitive positioning | How | opus |
| **Engineer** | Code implementation, debugging, immediate codebase/ doc updates | Do | sonnet |
| **Researcher** | Web research, experiments, immediate reference/ recording | Do | sonnet |
| **Writer** | Technical docs, presentations, external communication artifacts | Do | sonnet |
| **QA** | Code verification, testing, security review | Check | sonnet |
| **Reviewer** | Content verification, source checking, grammar/format correction | Check | sonnet |

**Categories**: How / Do / Check — 3 categories (Decide is handled by Lead).

**2 pipelines**:
- Code: Architect/Designer → Engineer → QA
- Content: Postdoc/Strategist → Researcher/Writer → Reviewer

**Parallelism limits by category**:
- How: max 4 (judgment + consensus required)
- Do: unlimited (independent execution)
- Check: unlimited (independent verification)

**Evidence Requirement**: Common to all How/Do/Check agents. Evidence must be cited for all analysis and judgment.

## Tag System

| Tag | Mode | Description |
|-----|------|-------------|
| `[meet]` | Meet | Team meeting — convene agents, deliberate, and decide before executing |
| `[d]` | Record | Log a decision (meet session only) |
| `[run]` | Execute | Force full pipeline |
| `[rule]` | Rule | Save a rule. Domain can be specified with [rule:tag] format. |

Messages without tags = CLAUDE.md Agent Routing-based delegation.

Overrides like "deploy the full team" are communicated to Lead in natural language (User Sovereignty).

## Information Management

```
.nexus/
├── core/            ← information (nexus-managed, git-tracked)
│   ├── identity/    ← philosophy, mission, design principles, roadmap
│   ├── codebase/    ← code structure, architecture, tools (Engineer updates immediately)
│   ├── reference/   ← external research results (Researcher records immediately)
│   └── memory/      ← past lessons, failure patterns (auto-extracted on task_close)
├── rules/           ← instructions (nexus-managed, domain-custom, git-tracked)
├── config.json      ← nexus config (git-tracked)
├── history.json     ← cycle archive (git-tracked)
└── state/           ← runtime state (git-ignored)
```

| Layer | Updated by | Reviewed by | Source of truth |
|-------|-----------|-------------|-----------------|
| identity | Nexus asks user | User | User |
| codebase | Engineer immediately | Lead | Project code |
| reference | Researcher immediately | Lead | External world |
| memory | Automatic on task_close | Lead | Past experience |

Memory criterion: "Would we repeat the same mistake without this information?" — mistake prevention + self-improvement mechanism.

## Context Engineering

### Per-Role Briefing Matrix

The `nx_briefing(role, hint?)` tool auto-collects needed information from the 4 layers based on a per-role matrix.

| Role | identity | codebase | reference | memory |
|------|----------|----------|-----------|--------|
| Architect | full | full | full | full |
| Postdoc | full | full | full | full |
| Designer | full | full | full | full |
| Strategist | full | full | full | full |
| Engineer | — | full (hint filter) | — | full (hint filter) |
| Researcher | full | — | full | full |
| Writer | — | full (hint filter) | — | full (hint filter) |
| QA | full | full (hint filter) | — | full |
| Reviewer | full | full | — | full |

### Structured Delegation Format

Lead uses a 4-section format when delegating tasks to agents:

```
## TASK
What needs to be done

## CONTEXT
Relevant background (nx_briefing + in-session wisdom)

## CONSTRAINTS
What not to do, scope limits

## ACCEPTANCE
Completion criteria
```

### In-Session Learning

Lead extracts lessons from task completion reports → includes in the next agent briefing. Passed in-memory without file recording. Long-term memory is written to memory/ on task_close.

## Phase Pipeline

Activated only with the [run] tag. Tasks without the tag are handled via CLAUDE.md routing.

5-step execution structure:

| Phase | Name | Owner | Description |
|-------|------|-------|-------------|
| 1 | Intake | Lead | Clarify user instructions, scope confirmation |
| 2 | Design | How agents | Design and planning |
| 3 | Execute | Do agents | Implementation, research, writing |
| 4 | Verify | Check agents | Verification, quality assurance |
| 5 | Complete | Lead | Close task, record memory |

**Rollback rules**:
- Phase 4 (Verify) finds code issue → back to Phase 3 (Execute)
- Phase 4 (Verify) finds design issue → back to Phase 2 (Design)

## Harness Mechanisms

### Task Pipeline

Edit/Write are blocked without tasks.json. Structurally enforces a plan-then-execute pipeline.

**nx_task_add**: Lead-owned exclusively. disallowedTools forces blocking for How/Do/Check agents.

### 2-Stage Verification

- **Lead**: Intent verification (always)
- **QA/Reviewer**: Output verification (Lead discretion + auto-spawn conditions)

QA auto-spawn conditions (any one triggers):
- 3 or more files changed
- Existing test files modified
- External API/DB access code changed
- Failure history for that area exists in memory

### Loop/Failure Detection and Escalation

Agents handle loop prevention via prompt-level rules. Lead escalates to user when needed.

Escalation chain: agent stops → Lead → user (User Sovereignty).

### Smart Resume

Team session initialized on SessionStart. If tasks.json exists with pending tasks, staleness of each task is assessed → close/re-register or continue.

### Cycle Archival

nx_task_close archives the cycle to history.json.

### Declarative disallowedTools Management

Agent-level MCP tool blocking at the platform level.
- How/Do/Check agents: nx_task_add blocked (Lead-only task ownership)
- How agents: nx_task_update also blocked
- Lead: delegation based on CLAUDE.md Agent Routing table

### Automatic Memory Recording

Cycle lessons auto-extracted on task_close (.nexus/history.json → memory/).

**history.json**: Project level (`.nexus/history.json`, git-tracked). Accumulates history across sessions.

## Meet Principles

1. **Active intent discovery** — Actively uncover what the user has not made explicit.
2. **Proactive exploration** — Explicit [meet] tag causes gate.ts to inject a forced investigation prompt. Explore + researcher spawned in parallel; no proposals until research is complete.
3. **Hypothesis-based questions** — Form hypotheses grounded in exploration results, then confirm with the user rather than asking open-ended questions.
4. **Progressive Depth** — Meeting depth auto-adjusts to request complexity.
5. **Objective pushback** — Actively push back when evidence supports a counter-argument. Nexus is not a yes-machine.
