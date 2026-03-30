<!-- tags: claude-code, hooks, events, platform, team, agent, skills -->
<!-- tags: claude-code, hooks, events, platform, team, agent, skills -->
# Claude Code Platform Reference

Research date: 2026-03-29. Sources: code.claude.com/docs, GitHub Issues.

## Hook Events (25 total)

| Event | Description | Nexus usage |
|-------|-------------|-------------|
| PreToolUse | Before tool execution. Filter by tool name via matcher | **In use** (Edit/Write/Agent/nx_task_update/nx_task_close) |
| PostToolUse | After tool execution. Result analysis possible | Not used |
| Stop | Session stop attempt | **In use** |
| UserPromptSubmit | User prompt submission | **In use** |
| SessionStart | Session start/resume | **In use** (Lead session initialization) |
| SessionEnd | Session end | Not used |
| SubagentStart | When agent is spawned | **In use** (agent tracking) |
| SubagentStop | When agent exits | **In use** (failure tracking) |
| PreCompact | Before context compaction | Not used |
| PostCompact | After context compaction | Not used |
| TeammateIdle | Just before teammate goes idle | Not used |
| TaskCreated | TaskCreate task created | Not used (Claude Code native task) |
| TaskCompleted | TaskCreate task completed | Not used |
| InstructionsLoaded | When CLAUDE.md is loaded | Not used |
| StopFailure | API error distinction matcher supported | Not used |
| WorktreeCreate | Worktree created | Not used |
| WorktreeRemove | Worktree removed | Not used |
| Elicitation | MCP server user input | Not used |
| ElicitationResult | MCP user input result | Not used |

## SubagentStart/Stop Event Data

**SubagentStart**: `agent_id`, `agent_type` (plugin:agent format), `session_id`, `transcript_path`, `cwd`, `permission_mode`

**SubagentStop**: above + `agent_transcript_path`, `last_assistant_message`

Filter by specific agent type using matcher: `"matcher": "claude-nexus:engineer"`

## Teammate Tool Restrictions — Platform Level

**Teammates cannot use Agent, TeamCreate, or TeamDelete.** Platform-level restriction.

| Tool | Standalone subagent | Teammate |
|------|---------------------|----------|
| Agent | ✓ | ✗ |
| TeamCreate | ✓ | ✗ |
| TeamDelete | ✓ | ✗ |
| CronCreate/Delete/List | ✓ | ✗ |
| SendMessage | ✗ | ✓ |
| Other tools (Edit, Bash, etc.) | ✓ | ✓ (except disallowedTools) |

**Exception**: Agent access is possible when using `--teammate-mode tmux` (GitHub Issue #31977, reported as a bug).

## PreToolUse Matcher Patterns

**Regex supported**. Combine with pipe (`|`) for OR logic.

- Built-in tools: `Edit`, `Write`, `Bash`, `Read`, `Glob`, `Grep`, `Agent`, `WebFetch`, `WebSearch`, etc.
- **MCP tool matching supported**: `mcp__<server>__<tool>` pattern
  - Example: `mcp__plugin_claude-nexus_nx__nx_task_update`
  - Wildcard: `mcp__plugin_claude-nexus_nx__.*` (all Nexus MCP tools)

## Skill Frontmatter Official Fields

`name`, `description`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `effort`, `context`, `agent`, `hooks`, `paths`, `shell`

**Non-standard fields** (parsed by Nexus internally): `triggers`, `trigger_display`, `purpose` — used only by generate-template.mjs for CLAUDE.md generation.

**Auto-loading**: `disable-model-invocation` not set (default) → Claude auto-loads when it judges relevance. `user-invocable: false` → hidden from user menu.

Context budget: skill descriptions have a 1% budget of the context window, with a 250-character cap per entry.

## Agent Frontmatter Official Fields

`name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, `isolation`

**Fields ignored for security reasons** (plugin agents): `hooks`, `mcpServers`, `permissionMode`

Agent file count limit: **None** (no explicit limit found).
