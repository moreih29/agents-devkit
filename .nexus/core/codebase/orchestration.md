<!-- tags: orchestration, gate, tags, agents, skills, plan, rules, pipeline -->
# Orchestration

## Tag System

The `UserPromptSubmit` event in the gate hook detects tags in the user prompt and activates modes. Messages without tags = free mode (Lead's judgment on delegation).

### Explicit Tags

| Tag | Behavior |
|-----|----------|
| `[plan]` | Loads nx-plan skill. Continues existing session if plan.json exists, otherwise starts new. Spawns researcher+Explore subagents for research, Lead synthesizes analysis. |
| `[d]` | Branches on plan.json presence: calls nx_plan_decide if exists, otherwise instructs to start a plan session first |
| `[run]` | Execution — full pipeline via nx-run SKILL.md. Requires tasks.json (plan document). |
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
- stop_hook_active=true on second fire → allow (infinite loop prevention)
- Sync nudge: if 3+ cycles since last nx-sync → suggest synchronization

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

## State Files

```
.nexus/state/
├── tasks.json            ← plan document (git-ignored)
├── plan.json             ← [plan] session issues/decisions (git-ignored)
├── agent-tracker.json    ← subagent lifecycle tracking (git-ignored)
└── stop-warned           ← infinite loop prevention flag (git-ignored)
```
