<!-- tags: orchestration, gate, tags, agents, skills, meet, rules -->
# Orchestration

## Tag System

The `UserPromptSubmit` event in the gate hook detects tags in the user prompt and activates modes. Messages without tags use default orchestration.

### Explicit Tags

| Tag | Behavior |
|-----|----------|
| `[meet]` | Loads nx-meet skill. Continues existing session if meet.json exists, otherwise starts a new session. **Forces TeamCreate + Explore+researcher injection** |
| `[d]` | Branches on meet.json presence: calls nx_meet_decide if exists, otherwise instructs to start a meet session first |
| `[run]` | Execution — full pipeline via nx-run SKILL.md |
| `[rule]` | Rule — save rule to .nexus/rules/. Supports [rule:tags] format |

### Natural Language Patterns (NATURAL_PATTERNS)

Meet only: `meet`, `미팅`, `회의`, `논의하자`, `모여`, `상담`, `어떻게 하면 좋을까`, `뭐가 좋을까`, `방법을 찾아`, etc.

### False Positive Prevention

- Error/bug context (fix, bug, error + primitive name) → skip
- Question context ("what is meet") → skip
- Quoted context (`` `meet` ``, `"meet"`) → skip

## Gate Hook Behavior

A single gate.ts module handles 6 events. Event discrimination: `process.env.NEXUS_EVENT` distinguishes SessionStart/SubagentStart/Stop; otherwise field presence (tool_name → PreToolUse, prompt → UserPromptSubmit, neither → Stop).

### CLAUDE.md Auto-Sync (on UserPromptSubmit)

Compares content between `$CLAUDE_PLUGIN_ROOT/templates/nexus-section.md` and CLAUDE.md marker content:
- Global `~/.claude/CLAUDE.md`: auto-replace if different
- Project `./CLAUDE.md`: auto-replace if different (same behavior as global)

### SessionStart Event
NEXUS_EVENT=SessionStart. Initializes `STATE_ROOT/agent-tracker.json`. Returns "Session started." context.

### SubagentStart Event
NEXUS_EVENT=SubagentStart. Matches `team-spawning` entries in agent-tracker by agent_type → updates with agent_id + status: running. If no match, adds new entry (non-team agent).

### SubagentStop Event
NEXUS_EVENT=SubagentStop. Updates the agent's status in `.nexus/state/agent-tracker.json` (status: completed, last_message, stopped_at).

### Stop Event
If `tasks.json` has pending tasks, blocks exit with `continue: true` (nonstop). If all completed, uses 1-shot stop: first attempt blocks with `continue: true` + "Call nx_task_close now" (writes `stop-warned` flag), second attempt releases with `pass()` (deletes flag). Prevents infinite loop when Lead ignores task_close instruction.

### PreToolUse Event

On `Edit`/`Write` tool calls:
- isNexusInternalPath → allow
- No `tasks.json` → block (nx_task_add required)
- All completed / empty array → block (nx_task_close or nx_task_add — user chooses to archive or add more tasks)

On `nx_meet_start` MCP tool calls:
- Inspects tool_input.attendees for non-Lead agents
- If non-Lead attendees present → checks agent-tracker.json for team agents (entries with team_name + status running/team-spawning)
- No team agents found → block ("TeamCreate + Agent(team_name=...) 으로 에이전트를 먼저 스폰하세요")
- Lead-only or no attendees → allow (Lead-only meeting for decision recording)

On `Agent` tool calls:
- Explore agent → always allow (standalone subagent)
- Has `team_name` → **record to agent-tracker with team_name + status: team-spawning**, then allow
- [run] mode (tasks.json exists, meet.json absent) → block without team_name
- Otherwise → allow (subagent mode for [meet] and other contexts)

On `nx_task_update` MCP tool calls: status is processed normally.

On `nx_task_close` MCP tool calls: proceeds to archival.

### Spawn Strategy Matrix

| Mode | Spawn Method | Enforcement | Rationale |
|------|-------------|-------------|-----------|
| `[meet]` | Team (TeamCreate required when attendees include agents) | **Structural** (gate blocks nx_meet_start without team agents in tracker) | Discussion with agents requires real spawns — prevents Lead roleplay. Lead-only meetings allowed. |
| `[run]` | Team (team_name required) | Structural (gate blocks without team_name) | Coordinated execution — SendMessage, shared task list, escalation patterns required. |
| `[run]` default | Engineer only | Instructional (SKILL.md constraint: TeamCreate required for 2+ tasks or 2+ target files) | Cost optimization — How/Check agents join on escalation or trigger conditions, not pre-spawned. |
| Explore | Always subagent | Structural (gate always allows) | Fast codebase search — no coordination needed. |
| nx-sync | Subagent | Instructional | One-off documentation tasks — independent layer updates. |

**[run] mode detection**: `tasks.json` exists AND `meet.json` absent → team_name enforcement active.

**Team size cap**: 3 active agents (Lead excluded). Based on MultiAgentBench finding that 3 is optimal team size.

**Escalation-based scaling**: Engineer reports scope expansion → Lead spawns How agent. Check agent spawns on 4 trigger conditions (3+ files, test changes, external API, failure history).

### UserPromptSubmit Event

Tag regex: `/\[(meet|run)\]/i`.

On `[meet]` detection:
- Branch on meet.json existence (continue session / start new session)
- **Force investigation**: both existing and new sessions force parallel Explore+researcher spawn. nx_meet_start forbidden until investigation completes.
- **TeamCreate required**: spawn How agents (architect, strategist, etc.) for discussion.

On `[run]` detection:
- **TEAM REQUIRED**: For tasks involving 2+ tasks or 2+ target files, TeamCreate + at least one Engineer. Lead solo handling prohibited for multi-task work.

On `[d]` detection:
- Inject postDecisionRules (record decision only; task pipeline required for implementation)
- Branch on meet.json presence: nx_meet_decide(issue_id, summary) / instruct to start meet session first

No-tag fallback (default orchestration):
- No tasks.json → TASK_PIPELINE + Branch Guard (How agent first for complex work; Lead may handle simple single-file changes directly)
- tasks.json exists + pending → smart resume ("Check nx_task_list. Evaluate staleness → close/re-register or continue.")
- tasks.json exists + all completed → guide nx_task_close or nx_task_add

### Meet Lightweight Context Injection (meetReminder)

While meet.json exists, lightweight context is injected on every UserPromptSubmit even in tag-free multi-turn:
- Topic name + current discussing/next pending issue + pending count
- Prompt: "Present comparison table with pros/cons/recommendation. Record decisions with [d]."
- Integrated into withNotices()

### Meet → Run Transition

When [run] is detected and meet.json exists:
- Retain How agents (architect, strategist, etc.)
- Dismiss Do/Check agents (engineer, qa, etc.)
- Register tasks with nx_task_add(meet_issue=N) to trace back to meet decisions

### Cycle End (nx_task_close)
Called after all tasks complete → archives meet+tasks to history.json → deletes source files (meet.json, tasks.json).

## MCP Tool Validation

### nx_meet_discuss speaker verification
- Validates speaker against meet.json attendees array
- Allowed always: "lead", "user"
- Other speakers must match a registered attendee's role
- Unregistered speaker → error with list of valid attendees
- Prevents Lead from simulating agent speech without actual agent spawns

## Agent Catalog (9 agents)

| Agent | Model | MaxTurns | Restrictions | Category | Role |
|-------|-------|----------|--------------|----------|------|
| architect | opus | 25 | Edit, Write, NotebookEdit, nx_task_add, nx_task_update blocked | How | Technical advisory, plan validation gate |
| postdoc | opus | 25 | Edit, Bash, NotebookEdit, nx_task_add, nx_task_update blocked | How | Methodology design, synthesis, plan validation gate |
| designer | opus | 25 | Edit, Write, NotebookEdit, nx_task_add, nx_task_update blocked | How | UI/UX design, interaction patterns |
| strategist | opus | 25 | Edit, Write, NotebookEdit, nx_task_add, nx_task_update blocked | How | Business strategy, market analysis |
| engineer | sonnet | 25 | nx_task_add blocked | Do | Code implementation, debugging, immediate codebase/ update, scope escalation to Lead |
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
| nx-meet | [meet] | Structured meeting session. Gate-enforced TeamCreate when attendees include agents. Lead-only meetings allowed for decision recording. Decisions stored inline in meet.json issues. Speaker validation on nx_meet_discuss. |
| nx-run | (default behavior) | User-Directed Composition execution. SKILL.md constraint: TeamCreate required for 2+ tasks or 2+ files. 9 agents + 2 pipelines. Structured delegation format (TASK/CONTEXT/CONSTRAINTS/ACCEPTANCE). |
| nx-init | /claude-nexus:nx-init | Full onboarding: project scan → identity → codebase generation → rules setup. Supports --reset, --cleanup. |
| nx-setup | /claude-nexus:nx-setup | Interactive config.json setup wizard. |
| nx-sync | /claude-nexus:nx-sync | Core knowledge synchronization — scans project state and updates .nexus/core/ layers. |

### Harness Mechanism Summary
- **Task Pipeline**: blocks Edit/Write without tasks.json
- **agent-tracker**: tracks agent lifecycle in `.nexus/state/agent-tracker.json` via PreToolUse(Agent+team_name)/SubagentStart/Stop hooks. Includes team_name for team agents.
- **SessionStart**: initializes `STATE_ROOT/agent-tracker.json`
- **Stop nonstop**: blocks exit on pending tasks
- **Smart Resume**: stale evaluation prompt when tasks.json exists
- **Meet agent enforcement**: gate blocks nx_meet_start with non-Lead attendees unless team agents exist in tracker
- **Meet speaker validation**: MCP nx_meet_discuss validates speaker against meet.json attendees

### Memory Auto-Recording
- nx_task_close returns memoryHint (taskCount, decisionCount, hadLoopDetection, cycleTopics)
- Lead extracts lessons from memoryHint → records via nx_core_write(layer: "memory")

### Information Recording Patterns (4-layer consistent)
- codebase/: Engineer updates immediately
- reference/: Researcher records immediately
- memory/: auto on task_close

### disallowedTools Declarative Management
Platform-level MCP tool blocking per agent. e.g. `mcp__plugin_claude-nexus_nx__nx_task_add`. How/Do/Check agents block nx_task_add. How agents also block nx_task_update.