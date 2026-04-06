---
name: nx-run
description: Execution — user-directed agent composition.
trigger_display: "nx-run"
purpose: "Execution — user-directed agent composition"
triggers: ["실행", "개발", "구현", "연구", "조사"]
---

<role>
Execution norm that Lead follows when the user invokes the [run] tag. Composes subagents dynamically based on user direction and drives the full execution pipeline from intake to completion.
</role>

<constraints>
- NEVER modify files via Bash (sed, echo >, cat <<EOF, tee, etc.) — always use Edit/Write tools (Gate enforced)
- NEVER terminate while pending tasks remain (Gate Stop nonstop)
- NEVER spawn a new branch without checking for main/master first
- MUST check tasks.json before executing — if absent, write the plan first
- MUST spawn subagents per-task based on owner field — Do not handle multi-task work as Lead solo when task count ≥ 2 or target files ≥ 2
- MUST NOT spawn parallel Engineers if their target files overlap — serialize instead
- MUST NOT auto-shutdown How subagents mid-session unless the session ends
- How subagents cap: maximum 4
</constraints>

<guidelines>
## Flow

### Step 1: Intake (Lead)

- **User specifies agents/direction** → follow the instruction as given.
- **[run] only (no direction)** → confirm direction with user before proceeding.
- User decides scope and composition. Lead fills in what is not specified.
- **Branch Guard**: if on main/master, create a branch appropriate to the task type before proceeding (prefix: `feat/`, `fix/`, `chore/`, `research/`, etc. — Lead's judgment). Auto-create without user confirmation.
- Check for `tasks.json`:
  - **Exists** → read it and proceed to Step 2.
  - **Absent** → inform the user: "계획서가 없습니다. [plan:auto]로 자동 계획을 생성하거나, [plan]으로 대화형 플래닝을 시작하세요." If the user chooses `[plan:auto]`, invoke `nx-plan` skill in auto mode via Skill tool. After plan generation, proceed to Step 2.
- If tasks.json exists, check prior decisions with `nx_plan_status`.

### Step 2: Execute (Do subagents)

- Read tasks from tasks.json. Register tasks with `nx_task_add`.
- For each task, spawn a subagent matching the `owner` field, passing the task's context, approach, and acceptance as the prompt.
- **Delegation criteria** — decide per task:

| 상황 | 처리 방식 |
|------|----------|
| 단일 파일, 작은 변경 | Lead 직접 |
| 단일 파일, 큰 변경 | 서브에이전트 위임 |
| 여러 파일, 독립적 | 서브에이전트 병렬 스폰 |
| 같은 파일, 순차 의존 | Lead 순차 처리 또는 deps로 순서 강제 |

- **File conflict prevention**: 같은 파일을 수정하는 태스크들을 동시에 서브에이전트로 위임하지 마라. Overlapping target files → serialize execution.
- **SubagentStop gate**: when a subagent stops, Lead checks tasks.json. If the subagent's task is not in `done` status, Lead emits a warning and either re-spawns or handles the task before proceeding.

### Step 3: Verify (Lead + Check subagent)

- Lead: confirm build + E2E pass/fail only.
- QA/Reviewer: verify quality, intent alignment, edge cases, security (spawn Check subagent when conditions are met).
- Check subagent spawn conditions (any one triggers):
  - 3 or more files changed
  - Existing test files modified
  - External API/DB access code changed
  - Failure history for this area exists in memory
- If issues found: code problems → Step 2 rework (reopen task); design problems → re-run nx-plan before re-executing.

### Step 4: Complete

- Invoke /claude-nexus:nx-sync to synchronize core knowledge with changes made in this cycle.
- Call `nx_task_close` → archive to history.json. Check `memoryHint` in the return value.
- Report final result to user.

---

## Reference Framework

| Phase | Owner | Content |
|-------|-------|---------|
| 1. Intake | Lead | Clarify intent, confirm direction, Branch Guard, check tasks.json / invoke nx-plan if absent |
| 2. Execute | Do subagents | Spawn per-task by owner, delegation criteria, parallel where safe |
| 3. Verify | Lead + Check subagent | Build check, quality verification |
| 4. Complete | Lead | nx-sync, nx_task_close, report |

---

## Dynamic Composition

Compose subagents according to user direction. Lead fills in unspecified areas.

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

How subagent cap: **4**. Do/Check subagents: unlimited (scaled to goal).

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

When Lead delegates tasks to subagents, structure the prompt in this format:

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

1. **Lead = interpret user direction + coordinate + own tasks**
2. **User decides scope and composition**
3. **tasks.json is the single source of state** — produced by nx-plan, read at Step 1, updated as tasks complete
4. **Do subagents = execute per owner** — Lead spawns one subagent per task based on the `owner` field. Engineers focus on code changes. Doc updates are done in bulk by Writer in Step 4. Researcher records to reference/ immediately.
5. **Check subagents = verify** — Lead's discretion + 4 conditions
6. **SubagentStop gate** — when a subagent stops, Lead validates task completion before moving forward
7. **Gate Stop nonstop** — cannot terminate while pending tasks exist
8. **Plan first** — if tasks.json is absent, nx-plan must run before Step 2
9. **No file modification via Bash** — sed, echo >, cat <<EOF, tee, and similar Bash-based file edits are prohibited. Always use Edit/Write tools (Gate enforced)
10. **Lean start** — default composition is Engineer only. How subagent joins on escalation or user request. Check subagent joins on trigger conditions. Do not pre-spawn subagents "just in case."

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

## Subagent Spawn Examples

```
// Step 1: Invoke nx-plan in auto mode when tasks.json is absent
Skill({ skill: "claude-nexus:nx-plan", args: "auto" })

// Step 2: Spawn Do subagents per task owner (parallel for independent tasks)
Agent({ subagent_type: "claude-nexus:engineer", prompt: "TASK: ...\nCONTEXT: ...\nACCEPTANCE: ..." })
Agent({ subagent_type: "claude-nexus:researcher", prompt: "TASK: ...\nCONTEXT: ...\nACCEPTANCE: ..." })

// Step 3: Spawn Check subagent when conditions are met
Agent({ subagent_type: "claude-nexus:qa", prompt: nx_briefing("qa") })
// If issues found: code problems → Step 2 rework, design problems → re-run nx-plan

// Step 4: Spawn Writer only for needed documentation layers
Agent({ subagent_type: "claude-nexus:writer", prompt: nx_briefing("writer") })
```

Note: `TaskCreate` is the Claude Code task creation tool. Subagents are spawned with `Agent(...)` — no team required.

## State Management

`.nexus/state/tasks.json` — produced by nx-plan, managed via `nx_task_add`/`nx_task_update`. Gate Stop enforcement.
On cycle end, archive plan+tasks to `.nexus/history.json` via `nx_task_close`.
