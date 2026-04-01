---
name: nx-run
description: Execution — user-directed agent composition.
trigger_display: "nx-run"
purpose: "Execution — user-directed agent composition"
triggers: ["실행", "개발", "구현", "연구", "조사"]
---

<role>
Execution norm that Lead follows when the user invokes the [run] tag. Composes agents dynamically based on user direction and drives the full execution pipeline from intake to completion.
</role>

<constraints>
- NEVER modify files via Bash (sed, echo >, cat <<EOF, tee, etc.) — always use Edit/Write tools (Gate enforced)
- NEVER terminate while pending tasks remain (Gate Stop nonstop)
- NEVER spawn a new branch without checking for main/master first
- MUST use TeamCreate and spawn at least one Engineer when task count ≥ 2 or target files ≥ 2 — do NOT handle multi-task work as Lead solo
- MUST use nx_task_add before spawning Do agents — tasks.json is the single source of state
- MUST use nx_briefing(role, hint?) when spawning agents to include briefing
- MUST NOT spawn parallel Engineers if their target files overlap — serialize instead
- MUST NOT auto-shutdown How agents — they have session lifetime
- How agents cap: maximum 4
- Active team size cap: maximum 3 (Lead excluded). Prioritize reuse over spawning.
</constraints>

<guidelines>
## Flow

### Step 1: Intake (Lead)

- **User specifies agents/direction** → follow the instruction as given.
- **[run] only (no direction)** → confirm direction with user before proceeding.
- User decides scope and composition. Lead fills in what is not specified.
- **Branch Guard**: if on main/master, create a branch appropriate to the task type before proceeding (prefix: `feat/`, `fix/`, `chore/`, `research/`, etc. — Lead's judgment). Auto-create without user confirmation.
- If meet.json exists, check prior decisions with `nx_meet_status`.
- Team rules are auto-included when `nx_briefing(hint)` is called (hint tag filtering).

### Step 2: Design (Lead + How agent)

**Default: skip.** How agent is spawned only when:
- Engineer escalates scope (reports expanded scope via SendMessage)
- User explicitly requests design review
- Lead judges the task requires architectural decisions (multiple modules, new patterns)

When triggered:
- Create team with `TeamCreate` (if not already created).
- Determine How agent based on goal (code → Architect, content → Strategist/Postdoc, mixed → both).
- Spawn How agent with `nx_briefing(role, hint?)` for briefing.
- Lead ↔ How agent discussion via SendMessage → reach consensus on approach.

### Step 3: Execute (Do agents)

- Register tasks with `nx_task_add` based on Design consensus or user direction.
- Spawn Do agents with `nx_briefing(role, hint?)` for briefing.
- For independent tasks (no deps) with non-overlapping target files, spawn Engineers in parallel. Overlapping files → serialize.

### Step 4: Verify (Lead + Check agent)

- Lead: confirm build + E2E pass/fail only.
- QA/Reviewer: verify quality, intent alignment, edge cases, security (spawn Check agent when conditions are met).
- Check agent spawn conditions (any one triggers):
  - 3 or more files changed
  - Existing test files modified
  - External API/DB access code changed
  - Failure history for this area exists in memory
- If issues found: code problems → Step 3 rework (reopen task); design problems → Step 2 (even if Step 2 was originally skipped — design issues require Design phase).

### Step 5: Complete

- Invoke /claude-nexus:nx-sync to synchronize core knowledge with changes made in this cycle.
- Call `nx_task_close` → archive to history.json. Check `memoryHint` in the return value.
- Shutdown Do/Check/Writer(doc) agents individually (How agents have session lifetime — keep them).
- Report final result to user.

---

## Reference Framework

| Phase | Owner | Content |
|-------|-------|---------|
| 1. Intake | Lead | Clarify intent, confirm direction, Branch Guard |
| 2. Design | Lead + How agent | Team composition, consensus, approach |
| 3. Execute | Do agent | Register tasks, implement / research / write |
| 4. Verify | Lead + Check agent | Build check, quality verification |
| 5. Complete | Lead | nx-sync, nx_task_close, shutdown, report |

---

## Dynamic Composition

Compose agents according to user direction. Lead fills in unspecified areas.

### Agent Catalog

| Category | Agent | Role |
|----------|-------|------|
| **How** | Architect | Code/technical structure design |
| **How** | Designer | UI/UX, visual design |
| **How** | Postdoc | Research methodology, source evaluation |
| **How** | Strategist | Content strategy, direction setting |
| **Do** | Engineer | Code implementation, bug fixes |
| **Do** | Researcher | Web research, information gathering |
| **Do** | Writer | Content writing, document generation |
| **Check** | QA | Code verification, testing |
| **Check** | Reviewer | Content review, quality verification |

How agent cap: **4**. Do/Check agents: unlimited (scaled to goal).

### Pipeline Combinations

**Code Pipeline**
```
How: Architect (+ Designer optional)
Do:  Engineer (parallel possible)
Check: QA
```

**Content Pipeline**
```
How: Postdoc + Strategist
Do:  Researcher + Writer (parallel possible)
Check: Reviewer
```

### Decision Criteria

- **Code change is primary output** → How: Architect, Do: Engineer, Check: QA
- **Information gathering is primary output** → How: Postdoc, Do: Researcher
- **Content creation is primary output** → How: Strategist, Do: Researcher + Writer, Check: Reviewer
- **Mixed** → compose freely to match the goal (e.g., Engineer + Researcher in parallel)

---

## Structured Delegation

When Lead delegates tasks to agents, structure the message in this format:

```
TASK: {specific deliverable}

CONTEXT:
- Current state: {relevant code/doc locations}
- Dependencies: {results from prior tasks}
- Prior decisions: {relevant decisions}
- Target files: {file path list}

CONSTRAINTS:
- {constraint 1}
- {constraint 2}

ACCEPTANCE:
- {completion criterion 1}
- {completion criterion 2}
```

---

## Key Principles

1. **Lead = interpret user direction + coordinate + communicate + own tasks**
2. **User decides scope and composition**
3. **Do agents = execute** — Lead decides. Engineers focus on code changes. Doc updates are done in bulk by Writer in Step 5. Researcher records to reference/ immediately.
4. **Check agents = verify** — Lead's discretion + 4 conditions
5. **Reuse idle teammates first** — assign via SendMessage to idle agents before spawning new ones
6. **tasks.json is the single source of state**
7. **Gate Stop nonstop** — cannot terminate while pending tasks exist
8. **Design = consensus** (Lead + How agent discussion via SendMessage)
9. **No file modification via Bash** — sed, echo >, cat <<EOF, tee, and similar Bash-based file edits are prohibited. Always use Edit/Write tools (Gate enforced)
10. **Lean start** — default composition is Engineer only. How agent joins on escalation or user request. Check agent joins on trigger conditions. Do not pre-spawn agents "just in case."

## Rules Template (Reference)

When team custom rules are needed, create them in `.nexus/rules/` with `nx_rules_write`.

```markdown
<!-- tags: dev -->
# Dev Rules

## Coding Conventions
(project-specific style, naming, patterns)

## Test Policy
(coverage criteria, test types, QA requirements)

## Commit/PR Rules
(message format, PR size, review criteria)
```

## Lead Awaiting Pattern

- Idle teammate → assign new work via SendMessage
- Timeout: if expected time is exceeded, check in with that teammate for status

## Teammate Spawn Examples

```
// Step 2: Create team + spawn How agent (if needed)
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "<project>", prompt: "..." })

// Step 3: After Lead↔How agent discussion, register tasks, bring in Do agents
Agent({ subagent_type: "claude-nexus:engineer", name: "engineer-1", team_name: "<project>", prompt: "..." })

// Step 4: Bring in Check agent when conditions are met
Agent({ subagent_type: "claude-nexus:qa", name: "qa", team_name: "<project>", prompt: "..." })
// If issues found: code problems → Step 3 rework, design problems → Step 2

// Step 5: After Check passes, spawn Writer (only for needed layers)
Agent({ subagent_type: "claude-nexus:writer", name: "writer-doc", team_name: "<project>", prompt: "..." })

// Step 5: Exit Do/Check/Writer(doc) (How agents have session lifetime)
SendMessage({ to: "engineer-1", message: { type: "shutdown_request", reason: "task complete" } })
SendMessage({ to: "qa", message: { type: "shutdown_request", reason: "task complete" } })
SendMessage({ to: "writer-doc", message: { type: "shutdown_request", reason: "documentation complete" } })
// How agents have session lifetime — do not shutdown
```

Note: `TaskCreate` is the Claude Code task creation tool. Teammate spawning must use `Agent({ team_name: ... })`.

## Team Teardown (Session end only)

Only when the user explicitly ends the session or there is no more work:

```
// Shutdown all + delete team
SendMessage({ to: "*", message: { type: "shutdown_request", reason: "session end" } })
TeamDelete()
```

## State Management

`.nexus/state/tasks.json` — managed via `nx_task_add`/`nx_task_update`. Gate Stop enforcement.
On cycle end, archive meet+tasks to `.nexus/history.json` via `nx_task_close`.
