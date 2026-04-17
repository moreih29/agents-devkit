---
name: nx-run
description: Execution — user-directed agent composition.
trigger_display: "[run]"
purpose: "Execution — user-directed agent composition"
---

## Role

Execution norm that Lead follows when the user invokes the [run] tag. Composes subagents dynamically based on user direction and drives the full execution pipeline from intake to completion.

## Constraints

- NEVER modify files via shell commands (sed, echo redirection, heredoc, tee, etc.) — always use the harness's dedicated file-editing primitives (gate enforced)
- NEVER terminate while pending tasks remain (Gate Stop nonstop)
- NEVER spawn a new branch without checking for main/master first
- MUST check tasks.json before executing — if absent, generate the plan first
- MUST spawn subagents per-task based on owner field — Do not handle multi-task work as Lead solo when task count ≥ 2 or target files ≥ 2
- MUST NOT spawn parallel Engineers if their target files overlap — serialize instead
- MUST call nx_task_close before completing the cycle — archive plan+tasks to history.json

## Guidelines

## Flow

### Step 1: Intake (Lead)

- **User specifies agents/direction** → follow the instruction as given.
- **[run] only (no direction)** → confirm direction with user before proceeding.
- User decides scope and composition. Lead fills in what is not specified.
- **Branch Guard**: if on main/master, create a branch appropriate to the task type before proceeding (prefix: `feat/`, `fix/`, `chore/`, `research/`, etc. — Lead's judgment). Auto-create without user confirmation.
- Check for `tasks.json`:
  - **Exists** → read it and proceed to Step 2.
  - **Absent** → auto-invoke `Skill({ skill: "claude-nexus:nx-plan", args: "auto" })` to generate tasks.json. Do NOT ask — `[run]` implies execution intent. After plan generation, proceed to Step 2.
- If tasks.json exists, check prior decisions with `nx_plan_status`.

### Step 1.5: TUI Progress

Register tasks for visual progress tracking (Ctrl+T):

- **≤ 10 tasks**: `TaskCreate({ subject: "<per-task label>" })` per task
- **> 10 tasks**: group by `plan_issue`, `TaskCreate({ subject: "<group label>" })` per group
- Update the registered entry via `TaskUpdate({ taskId: <id>, status: "in_progress" })` / `TaskUpdate({ taskId: <id>, status: "completed" })` as execution proceeds
- **Skip only if**: non-TTY environment (VSCode, headless)
- **Known issue**: TUI may freeze during auto-compact (#27919) — task data on disk remains correct

### Step 2: Execute

- **Present tasks.json** to the user — show task list with owner, deps, approach summary. Proceed immediately without asking for confirmation.
- Execute tasks based on `owner` field:
  - `owner: "lead"` → Lead handles directly
  - `owner: "engineer"`, `"researcher"`, `"writer"`, etc. → spawn subagent matching the owner role
  - `owner: "architect"`, `"tester"`, `"reviewer"`, etc. → spawn corresponding HOW/CHECK subagent
- For each subagent, pass the task's `context`, `approach`, and `acceptance` as the prompt.
- **Parallel execution**: independent tasks (no overlapping target files, no deps) can be spawned in parallel. Tasks sharing target files must be serialized.
- **SubagentStop escalation chain**: when a subagent stops with incomplete work:
  1. **Do/Check failed** → spawn the relevant HOW agent (e.g., Engineer failed → Architect) to diagnose the failure, review the approach, and suggest adjustments.
  2. **Re-delegate** → apply HOW's adjusted approach and re-delegate to a new Do/Check agent.
  3. **HOW also failed** → Lead reports the failure to the user with diagnosis details and asks for direction.
  - Maximum: 1 HOW diagnosis + 1 re-delegation per task. After that, escalate to user.
  - Relevant HOW mapping: Engineer→Architect, Writer→Strategist, Researcher→Postdoc, Tester→Architect.

### Resume Dispatch Rule

For each task, Lead chooses between fresh spawn and resume based on the `owner`'s `resume_tier`:

1. Lookup `resume_tier` from `agents/{owner}.md` frontmatter (if absent → treat as `ephemeral`).
2. If `ephemeral` → fresh spawn. Stop.
3. If `bounded` → check tasks.json history: did the same `owner` previously work on overlapping target files? If yes AND no intervening edits by other agents → resume candidate. Otherwise fresh. Always include "re-read target files before any modification" instruction in the resume prompt.
4. If `persistent` → resume by default if the same agent worked earlier in this run. Cross-task reuse allowed.
5. Before attempting any resume, verify the harness's resume mechanism is available. If unavailable, fall back to fresh spawn silently — do NOT throw an error.

### Step 3: Verify (Lead + Check subagents)

**Lead**: confirm build + E2E pass/fail.

**Tester — acceptance criteria verification**:
- Tester reads each completed task's `acceptance` field from tasks.json
- Verifies each criterion with PASS/FAIL judgment
- All criteria must pass for the task to be considered done
- If any criterion fails → Step 2 rework (reopen task)
- Tester spawn conditions (any one triggers):
  - tasks.json contains at least 1 task with an `acceptance` field
  - 3 or more files changed
  - Existing test files modified
  - External API/DB access code changed
  - Failure history for this area exists in memory

**Reviewer — writer deliverable verification**:
- Whenever Writer produced a deliverable in Step 2, Reviewer MUST verify it
- Writer → Reviewer is a mandatory pairing, not optional
- Reviewer checks: factual accuracy, source consistency, grammar/format

- If issues found: code problems → Step 2 rework; design problems → re-run nx-plan before re-executing.

### Step 4: Complete

Execute in order:

1. **nx-sync**: invoke `Skill({ skill: "claude-nexus:nx-sync" })` if code changes were made in this cycle. Best effort — failure does not block cycle completion.
2. **nx_task_close**: call to archive plan+tasks to history.json. This updates `.nexus/history.json`.
3. **git commit**: stage and commit source changes, build artifacts (`bridge/`, `scripts/`), `.nexus/history.json`, and any modified `.nexus/memory/` or `.nexus/context/`. Use explicit `git add` with paths (not `git add -A`) and a HEREDOC commit message with `Co-Authored-By`. This ensures the cycle's history archive lands in the same commit as the code changes, giving a 1:1 cycle-commit mapping.
4. **Report**: summarize to user — changed files, key decisions applied, and suggested next steps. Merge/push is the user's decision and outside this skill's scope.

---

## Reference Framework

| Phase | Owner | Content |
|-------|-------|---------|
| 1. Intake | Lead | Clarify intent, confirm direction, Branch Guard, check tasks.json / invoke nx-plan if absent |
| 2. Execute | Do subagents | Spawn per-task by owner, delegation criteria, parallel where safe |
| 3. Verify | Lead + Check subagent | Build check, quality verification |
| 4. Complete | Lead | nx-sync, nx_task_close, git commit, report |

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
6. **SubagentStop escalation** — when a subagent stops with incomplete work, escalate through HOW diagnosis → re-delegation → user report. Max 1 cycle per task.
7. **Gate Stop nonstop** — cannot terminate while pending tasks exist
8. **Plan first** — if tasks.json is absent, nx-plan must run before Step 2
9. **No file modification via shell commands** — sed, echo redirection, heredoc, tee, and similar shell-based file edits are prohibited. Always use the harness's dedicated file-editing primitives (gate enforced)
## State Management

`.nexus/state/tasks.json` — produced by nx-plan, managed via `nx_task_add`/`nx_task_update`. Gate Stop enforcement.
On cycle end, archive plan+tasks to `.nexus/history.json` via `nx_task_close`.


---

### Resume Invocation (Claude Code)

Resume a completed subagent via `SendMessage({to: "<agentId>", message: "..."})`.
- `to` MUST be the agentId (UUID) returned by the original `Agent()` call — NOT the agent `name`. Name-based send reaches only running teammates and cannot revive a completed session.
- agentId is persisted in plan.json `how_agent_ids` (plan sessions) or tasks.json `owner_agent_id` (run sessions).
- Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. If unset, resume silently falls back to fresh spawn — no error.
- The resumed agent reopens with the full prior transcript intact; include a brief delta in the message explaining why it was re-invoked.


---

# Nexus Hook Mapping

This file is the consumer-owned canonical record mapping the eight Claude Code hook APIs to the eight conceptual events defined in nexus-core §9. It is injected into the nx-run skill context at build time via the `nexus_hook_mapping` token.

| Hook (Claude Code) | Fires when | §9 event | Notes |
|--------------------|------------|----------|-------|
| SessionStart | Claude Code session initializes | session_start | Initializes agent-tracker.json and tool-log.jsonl. nexus-core v0.11.0 §9 recognizes SessionStart as the SHOULD location for agent-tracker init, superseding Stop-time deletion. |
| UserPromptSubmit | User submits a prompt | user_message | Branches on seven tags ([plan], [run], [d], [m], [m:gc], [rule], [sync]) and auto-merges planReminder, tasksReminder, and claudeMdNotice via withNotices. The three guide items (plan/task/knowledge counts) are formally incorporated as SHOULD range in v0.11.0 §9. |
| SubagentStart | A subagent is spawned | subagent_spawn | Upserts agent-tracker.json and injects the Core Knowledge Index only. TASK format, tool mapping, and skill doc refs were DROP candidates; structured task context is now canonical in the nx-run skill contract ("Structured Delegation" section). |
| SubagentStop | A subagent completes | subagent_complete | Updates agent-tracker.json status, extracts files_touched from tool-log.jsonl, and injects an incomplete-task warning if the agent's owned tasks remain pending. The incomplete-task warning is a P2 SHOULD bullet in v0.11.0 §9 (3-of-3 empirical). |
| PreToolUse | Before a tool call executes (Edit, Write, NotebookEdit) | pre_tool_use | In [run] mode, blocks Edit/Write when all tasks are completed and passes a block reason as a prompt fragment to the LLM — pattern canonicalized as P1 SHOULD note in v0.11.0 §9. Per-agent capability restrictions are handled by disallowedTools in agents/*.md frontmatter at the Claude Code runtime layer, not here. |
| PostToolUse | After a tool call completes (Edit, Write, NotebookEdit, Read) | post_tool_use | Appends to tool-log.jsonl for Edit/Write/NotebookEdit. Tracks memory-access.jsonl for Read events targeting .nexus/memory/. Memory-access tracking adopted from nexus-core v0.10.0 canonical policy. |
| Stop | Main agent finishes a response (session end) | session_end | Injects incomplete-task warning, all-tasks-completed close prompt (P7 SHOULD in v0.11.0 §9 session_end), and sync nudge after 3+ idle cycles (MAY, harness-local, 1-of-3). agent-tracker.json deletion moved to SessionStart; Stop no longer deletes it. |
| PostCompact | Context compaction completes (PreCompact is pass() with no action) | context_compact | Injects a session snapshot (Mode, Tasks, Plan, Knowledge counts, Agents) as compensatory context after compaction. This harness uses PostCompact rather than PreCompact — a timing choice recognized by nexus-core v0.11.0 as "harness-native timing discretion" (SHOULD). hooks.json registration is a separate verification item (see claude-nexus issue #22). |

## Implementation references

The following line ranges in `src/hooks/gate.ts` correspond to each hook handler. Line numbers are stable reference points for grep.

- `handleSessionStart` — gate.ts:571-580
- `handleUserPromptSubmit` — gate.ts:382-496
- `handleSubagentStart` — gate.ts:582-614
- `handleSubagentStop` — gate.ts:616-676
- `handlePreToolUse` — gate.ts:145-177
- `handlePostToolUse` — gate.ts:545-567
- `handleStop` — gate.ts:97-128
- `handlePostCompact` — gate.ts:680-748

## Notes on canonicalization

The eight handlers span three compliance tiers defined in nexus-core v0.11.0 §9. Four behaviors are MUST or P1 SHOULD (block reason as prompt fragment in PreToolUse, incomplete-task warning in SubagentStop, all-tasks-completed close prompt in Stop, and session snapshot in PostCompact). Three are SHOULD with empirical backing across two or more harnesses (SessionStart init, UserPromptSubmit guide items, sync nudge eligibility). One is MAY and harness-local: the sync nudge in Stop, observed in 1-of-3 known harnesses. The PostCompact timing choice (compensate after compaction rather than before) is a DROP from any MUST obligation and is classified as harness-native discretion. No behavior in this mapping was invented outside source material; all grades trace to nexus-core v0.11.0 MIGRATIONS documentation or gate.ts implementation evidence.
