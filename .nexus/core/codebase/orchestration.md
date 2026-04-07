<!-- tags: orchestration, gate, tags, agents, skills, plan, rules, pipeline -->
<!-- tags: orchestration, gate, tags, agents, skills, plan, rules, pipeline -->
# Orchestration

## Tag System

The `UserPromptSubmit` event in the gate hook detects tags in the user prompt and activates modes. Messages without tags = free mode (Lead's judgment on delegation).

### Explicit Tags

| Tag | Behavior |
|-----|----------|
| `[plan]` | BLOCKING skill invoke → nx-plan. Pre-checks: stale tasks.json (force close), existing plan.json (resume hint). Core index injected. |
| `[d]` | Branches on plan.json presence: calls nx_plan_decide if exists, otherwise instructs to start a plan session first |
| `[run]` | BLOCKING skill invoke → nx-run. Pre-checks: tasks.json absent (hint plan required), exists (task count/status hint). Auto plan:auto when tasks.json absent. |
| `[rule]` | Rule — save rule to .nexus/rules/. Supports [rule:tags] format |

### Natural Language Patterns

Plan: `plan`, `계획`, `설계`, `분석해`, `검토해`, `어떻게 하면 좋을까`, `뭐가 좋을까`, `방법을 찾아`

False positive guards: error/bug context filter, question context filter, quoted mention filter.

## Agent Configuration

### 9 Agents — HOW / DO / CHECK

| Role | Category | Model | disallowedTools |
|------|----------|-------|-----------------|
| architect | HOW | opus | Edit, Write, NotebookEdit, nx_task_add, nx_task_update |
| postdoc | HOW | opus | Edit, Bash, NotebookEdit, nx_task_add, nx_task_update |
| designer | HOW | opus | Edit, Write, NotebookEdit, nx_task_add, nx_task_update |
| strategist | HOW | opus | Edit, Write, NotebookEdit, nx_task_add, nx_task_update |
| engineer | DO | sonnet | nx_task_add |
| researcher | DO | sonnet | nx_task_add |
| writer | DO | sonnet | nx_task_add |
| tester | CHECK | sonnet | Edit, Write, NotebookEdit, nx_task_add |
| reviewer | CHECK | sonnet | Edit, Write, NotebookEdit, nx_task_add |

### Parallelism

- HOW: max 4 parallel (judgment requires focused analysis)
- DO: unlimited parallel (independent execution)
- CHECK: unlimited parallel (independent verification)

### Subagent-Based Architecture

All agents are spawned as **subagents** (not team agents). No TeamCreate/SendMessage.
- Subagents execute independently and return results to Lead
- Multiple subagents can be spawned in parallel
- HOW agents are spawned for independent analysis when needed, not for team discussion

## Pipeline (5 Phases)

Activated only with `[run]` tag. Managed by nx-run skill.

| Phase | Name | Owner | Description |
|-------|------|-------|-------------|
| 1 | Intake | Lead | Verify plan document exists, clarify scope |
| 2 | Design | HOW subagents | Architecture/strategy analysis (optional, Lead judges need) |
| 3 | Execute | DO subagents | Implementation, parallel per task |
| 4 | Verify | CHECK subagents | test/review, cannot edit code |
| 5 | Complete | Lead | Archive cycle, record memory |

### Rollback Rules

- Phase 4 finds code issue → back to Phase 3
- Phase 4 finds design issue → back to Phase 2

### Phase Enforcement

Pipeline phase ordering is guided by skill prompt. Agent behavior is enforced by frontmatter `disallowedTools`:
- HOW/CHECK agents cannot Edit/Write at any phase
- DO agents can Edit/Write only when tasks.json exists ([run] mode)

## Plan Document (tasks.json)

### Schema

```json
{
  "goal": "string",
  "decisions": ["string — decisions from [plan] session"],
  "tasks": [
    {
      "id": 1,
      "title": "string",
      "context": "string",
      "approach": "string (optional) — how to implement",
      "acceptance": "string (optional) — definition of done",
      "risk": "string (optional) — known risks",
      "status": "pending | in_progress | completed",
      "deps": [2, 3],
      "plan_issue": 1,
      "owner": "engineer",
      "created_at": "ISO string"
    }
  ]
}
```

### Lifecycle

- Created during `[plan]` or auto-generated at `[run]` start
- Edit/Write gating active only when tasks.json exists
- Archived to history.json on nx_task_close

## Harness Mechanisms

### Edit/Write Gating (PreToolUse hook)

- tasks.json exists → Edit/Write allowed only if tasks are pending (not all completed)
- tasks.json absent → Edit/Write freely allowed (no [run] mode)
- Nexus internal paths always exempt (.nexus/state/, .nexus/config.json, .claude/settings.json, CLAUDE.md)

### Stop Hook

- Pending tasks → block stop, remind to complete
- All completed → one-time warning to call nx_task_close
- `stop_hook_active=true` on second fire → allow (platform-provided re-entry flag; replaces the retired stop-warned file)
- Sync nudge: if 3+ cycles since last nx-sync → suggest synchronization

### PostCompact Handler

Fired after context compaction. Rebuilds a session state snapshot and injects it as `additionalContext`:
- Current mode and task counts (pending/completed) from tasks.json
- Active plan session topic and issue status from plan.json
- Core knowledge file count across all 4 layers
- Agent tracker summary (agent type + status)

### buildCoreIndex

Called on `[plan]` and `[run]` mode entry. Scans `.nexus/core/` and builds a compact index of all layer/topic files with their first 3 tags. Injected into `additionalContext` to remind Lead of available knowledge before starting research or execution. Output capped at 2000 characters.

### Stale tasks.json Detection (Plan Mode)

When `[plan]` is detected, gate checks whether tasks.json exists with all tasks already completed. If so, it blocks plan mode entry and instructs Lead to call `nx_task_close` first to archive the previous cycle before starting a new plan.

### SubagentStop Verification ([run] mode only)

- On agent stop, check if agent's owned tasks are still pending/in_progress
- If incomplete tasks found → inject warning to Lead

### Tester Auto-Spawn Conditions

Any one triggers Tester verification (Lead discretion):
- 3 or more files changed
- Existing test files modified
- External API/DB access code changed
- Failure history for that area exists in memory

### Cycle Archival

nx_task_close archives plan.json + tasks.json → history.json, then deletes source files.

## Gate Events

gate.ts handles all hook events dispatched via `hook_event_name`:

| Event | Handler | Purpose |
|-------|---------|---------|
| `SessionStart` | handleSessionStart | Initialize agent-tracker.json, ensure .nexus structure |
| `SubagentStart` | handleSubagentStart | Record agent start in agent-tracker.json; inject MATRIX-filtered core+rules index via additionalContext for nexus agents (lazy-read) |
| `SubagentStop` | handleSubagentStop | Record agent stop; warn Lead if owned tasks incomplete |
| `PreToolUse` | handlePreToolUse | Block Edit/Write when tasks completed; guard Agent tool |
| `UserPromptSubmit` | handleUserPromptSubmit | Tag detection, mode routing, additionalContext injection |
| `Stop` | handleStop | Block stop if pending tasks; sync nudge |
| `PreCompact` | — | pass() (no-op) |
| `PostCompact` | handlePostCompact | Inject session state snapshot after compaction |

## State Files

```
.nexus/state/
├── tasks.json            ← plan document (git-ignored)
├── plan.json             ← [plan] session issues/decisions (git-ignored)
└── agent-tracker.json    ← subagent lifecycle tracking (git-ignored)
```
