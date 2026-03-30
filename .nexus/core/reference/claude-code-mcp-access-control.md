<!-- tags: claude-code, mcp, disallowedTools, agent, access-control -->
<!-- tags: claude-code, mcp, disallowedTools, agent, access-control -->
# Claude Code MCP Tool Access Control

Research date: 2026-03-29. Sources: code.claude.com/docs, GitHub Issues.

## Blocking MCP Tools with disallowedTools — Confirmed Working

Adding MCP tool names to `disallowedTools` in agent frontmatter **blocks them at the platform level**. Blocked tools are completely removed from the model context (they behave as if the tool does not exist).

```yaml
disallowedTools: mcp__plugin_claude-nexus_nx__nx_task_add, mcp__plugin_claude-nexus_nx__nx_core_write
```

Wildcard supported: `mcp__plugin_claude-nexus_nx__*` (blocks entire server).

## tools Whitelist — Unstable

Activating MCP tools via the `tools` field is unreliable for deferred MCP tools (GitHub Issue #25200 OPEN). `disallowedTools` is more stable for blocking.

## MCP Server-Side Caller Identification — Not Implemented

Caller/agent information is not passed when MCP tools are invoked (GitHub Issue #32514 OPEN). Server-side branching per agent is not possible. Client-side `disallowedTools` is the only practical mechanism.

## Limitations

- Lead (main conversation) is not an agent definition, so disallowedTools cannot be applied
- When both `disallowedTools` and `tools` are set, disallowedTools takes precedence
