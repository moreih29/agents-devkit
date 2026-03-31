<!-- tags: orchestration, gate, tags, agents, skills, consult, rules -->
# Orchestration

## Tag System

The `UserPromptSubmit` event in the gate hook detects tags in the user prompt and activates modes. Messages without tags use default orchestration.

### Explicit Tags

| Tag | Behavior |
|-----|----------|
| `[consult]` | Loads nx-consult skill. Continues existing session if consult.json exists, otherwise starts a new session. **Forces investigation prompt injection** |
| `[d]` | Branches on consult.json presence: calls nx_consult_decide if exists, nx_decision_add otherwise |
| `[run]` | Execution — full pipeline via nx-run SKILL.md |
| `[rule]` | Rule — save rule to .nexus/rules/. Supports [rule:tags] format |

### Natural Language Patterns (NATURAL_PATTERNS)

Consult only: `상담`, `어떻게 하면 좋을까`, `뭐가 좋을까`, `방법을 찾아`, etc.

### False Positive Prevention

- Error/bug context (fix, bug, error + primitive name) → skip
- Question context ("what is consult") → skip
- Quoted context (`` `consult` ``, `"consult"`) → skip

## Gate Hook Behavior

A single gate.ts module handles 6 events. Event discrimination: `process.env.NEXUS_EVENT` distinguishes SessionStart/SubagentStart/Stop; otherwise field presence (tool_name → PreToolUse, prompt → UserPromptSubmit, neither → Stop).

### CLAUDE.md Auto-Sync (on UserPromptSubmit)

Compares content between `$CLAUDE_PLUGIN_ROOT/templates/nexus-section.md` and CLAUDE.md marker content:
- Global `~/.claude/CLAUDE.md`: auto-replace if different
- Project `./CLAUDE.md`: one-time notification if different (`.nexus/claudemd-notified` flag)

### SessionStart Event
NEXUS_EVENT=SessionStart. Initializes `STATE_ROOT/agent-tracker.json`. Returns "Session started." context.

### SubagentStart Event
NEXUS_EVENT=SubagentStart. Adds agent to `.nexus/state/agent-tracker.json` (agent_type, agent_id, started_at, status: running).

### SubagentStop Event
NEXUS_EVENT=SubagentStop. Updates the agent's status in `.nexus/state/agent-tracker.json` (status: completed, last_message, stopped_at).

### Stop Event
If `tasks.json` has pending tasks, blocks exit with `continue: true` (nonstop). If all completed, forces `nx_task_close`.

### PreToolUse Event

On `Edit`/`Write` tool calls:
- isNexusInternalPath → allow
- No `tasks.json` → block (nx_task_add required)
- All completed / empty array → block (nx_task_close required)

On `Agent` tool calls:
- Explore agent → always allow (standalone subagent)
- Has `team_name` → allow (teammate mode)
- [run] mode (tasks.json exists, consult.json absent) → block without team_name
- Otherwise → allow (subagent mode for [consult] and other contexts)

On `nx_task_update` MCP tool calls: status is processed normally.

On `nx_task_close` MCP tool calls: proceeds to archival.

### Spawn Strategy Matrix

| Mode | Spawn Method | Enforcement | Rationale |
|------|-------------|-------------|-----------|
| `[consult]` | Subagent (no team) | Instructional (SKILL.md) | Independent exploration — Explore/researcher don't need coordination. Hub-and-spoke sufficient. |
| `[run]` | Team (team_name required) | Structural (gate blocks without team_name) | Coordinated execution — SendMessage, shared task list, escalation patterns required. |
| `[run]` default | Engineer only | Instructional (SKILL.md lean start) | Cost optimization — How/Check agents join on escalation or trigger conditions, not pre-spawned. |
| Explore | Always subagent | Structural (gate always allows) | Fast codebase search — no coordination needed. |
| nx-sync | Subagent | Instructional | One-off documentation tasks — independent layer updates. |

**[run] mode detection**: `tasks.json` exists AND `consult.json` absent → team_name enforcement active.

**Team size cap**: 3 active agents (Lead excluded). Based on MultiAgentBench finding that 3 is optimal team size.

**Escalation-based scaling**: Engineer reports scope expansion → Lead spawns How agent. Check agent spawns on 4 trigger conditions (3+ files, test changes, external API, failure history).

### UserPromptSubmit Event

Tag regex: `/\[(consult|run)\]/i`.

On `[consult]` detection:
- Branch on consult.json existence (continue session / start new session)
- **Force investigation**: both existing and new sessions force parallel Explore+researcher spawn. nx_consult_start/discussion forbidden until investigation completes.

On `[d]` detection:
- Inject postDecisionRules (record decision only; task pipeline required for implementation)
- Branch on consult.json presence: nx_consult_decide / nx_decision_add

No-tag fallback (default orchestration):
- No tasks.json → TASK_PIPELINE + Branch Guard (How agent first for complex work; Lead may handle simple single-file changes directly)
- tasks.json exists + pending → smart resume ("Check nx_task_list. Evaluate staleness → close/re-register or continue.")
- tasks.json exists + all completed → guide nx_task_close

### Consult Lightweight Context Injection (consultReminder)

While consult.json exists, lightweight context is injected on every UserPromptSubmit even in tag-free multi-turn:
- Topic name + current discussion point + remaining count
- Integrated into withNotices()

### Cycle End (nx_task_close)
Called after all tasks complete → archives consult+decisions+tasks to history.json → deletes source files.

## Agent Catalog (9 agents)

| Agent | Model | MaxTurns | Restrictions | Category | Role |
|-------|-------|----------|--------------|----------|------|
| architect | opus | 25 | Edit, Write, NotebookEdit, nx_task_add, nx_task_update blocked | How | Technical advisory, plan validation gate |
| postdoc | opus | 25 | Edit, Bash, NotebookEdit, nx_task_add, nx_task_update blocked | How | Methodology design, synthesis, plan validation gate |
| designer | opus | 25 | Edit, Write, NotebookEdit, nx_task_add, nx_task_update blocked | How | UI/UX design, interaction patterns |
| strategist | opus | 25 | Edit, Write, NotebookEdit, nx_task_add, nx_task_update blocked | How | Business strategy, market analysis |
| engineer | sonnet | 25 | nx_task_add blocked | Do | Code implementation, debugging, immediate codebase/ update |
| researcher | sonnet | 20 | nx_task_add blocked | Do | Web search, independent investigation, immediate reference/ recording |
| writer | sonnet | 25 | nx_task_add blocked | Do | Technical documentation, presentations |
| qa | sonnet | 20 | nx_task_add blocked | Check | Code verification, testing, security review |
| reviewer | sonnet | 20 | nx_task_add blocked | Check | Content verification, source checking, grammar/format correction |

### Parallel Limits by Category
- How: max 4
- Do/Check: unlimited

### 2 Pipelines
- Code: Architect/Designer → Engineer → QA
- Content: Postdoc/Strategist → Researcher/Writer → Reviewer

## Skill Catalog (5 skills)

| Skill | Trigger | Description |
|-------|---------|-------------|
| nx-consult | [consult] | Structured 5-step consultation. Forces investigation injection on [consult] tag. |
| nx-run | (default behavior) | User-Directed Composition execution. How agent routing or Lead direct handling. 9 agents + 2 pipelines. Structured delegation format (TASK/CONTEXT/CONSTRAINTS/ACCEPTANCE). |
| nx-init | /claude-nexus:nx-init | Full onboarding: project scan → identity → codebase generation → rules setup. Supports --reset, --cleanup. |
| nx-setup | /claude-nexus:nx-setup | Interactive config.json setup wizard. |
| nx-sync | /claude-nexus:nx-sync | Core knowledge synchronization — scans project state and updates .nexus/core/ layers. |

### Harness Mechanism Summary
- **Task Pipeline**: blocks Edit/Write without tasks.json
- **agent-tracker**: tracks agent lifecycle in `.nexus/state/agent-tracker.json` via SubagentStart/Stop hooks
- **SessionStart**: initializes `STATE_ROOT/agent-tracker.json`
- **Stop nonstop**: blocks exit on pending tasks
- **Smart Resume**: stale evaluation prompt when tasks.json exists

### Memory Auto-Recording
- nx_task_close returns memoryHint (taskCount, decisionCount, hadLoopDetection, cycleTopics)
- Lead extracts lessons from memoryHint → records via nx_core_write(layer: "memory")

### Information Recording Patterns (4-layer consistent)
- codebase/: Engineer updates immediately
- reference/: Researcher records immediately
- memory/: auto on task_close

### disallowedTools Declarative Management
Platform-level MCP tool blocking per agent. e.g. `mcp__plugin_claude-nexus_nx__nx_task_add`. How/Do/Check agents block nx_task_add. How agents also block nx_task_update.
