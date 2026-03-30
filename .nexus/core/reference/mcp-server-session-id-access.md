<!-- tags: mcp, session_id, claude-code, lifecycle, environment-variables, CLAUDE_ENV_FILE -->
# MCP Server Access to Claude Code session_id

**Research date**: 2026-03-29

## Core Conclusion

There is currently **no official mechanism** by which a Claude Code MCP server (particularly a stdio long-running process) can learn the current session's session_id at runtime.

## Key Facts

### Lifecycle
- stdio MCP servers start **before the SessionStart hook** when the session begins
- stdio: one process per client (no shared state)
- HTTP/Streamable HTTP: remote servers are independent processes shared by multiple sessions
- MCP servers are not restarted on /clear, session resume, or compaction
- Only restarted on `/reload-plugins` or full Claude Code restart

### No session_id Delivery Mechanism
- `$CLAUDE_SESSION_ID` environment variable: **not implemented** (Feature request #25642 OPEN)
- MCP initialize handshake `clientInfo`: contains name/version only, no session_id
- `CLAUDE_ENV_FILE`: applies to Bash commands only — not propagated to already-running MCP processes
- Static `--env` flag: session_id is generated dynamically at spawn time, so it cannot be known in advance

### MCP Protocol Session Mechanism
- `Mcp-Session-Id` header: an MCP connection ID assigned by the server to the client on HTTP transport. Separate concept from Claude Code session_id
- stdio: no protocol-level session
- SEP-1359 (protocol-level sessions for stdio) — dormant, closed

### Precise Definition of CLAUDE_ENV_FILE
> "Path to a shell script that Claude Code sources before each **Bash command**."
Available only in SessionStart/CwdChanged/FileChanged hooks. Unrelated to MCP server processes.

## Workarounds
1. Write session_id to a file in the SessionStart hook → MCP server polls it
2. Pass session_id explicitly as an argument when invoking MCP tools (requires Claude to know the session_id)
3. Wait for Issue #25642 to be implemented

## Key Sources
- Feature request #25642: https://github.com/anthropics/claude-code/issues/25642
- Claude Code env-vars docs: https://code.claude.com/docs/en/env-vars
- Claude Code hooks docs: https://code.claude.com/docs/en/hooks
- MCP Lifecycle spec (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- MCP Transports spec (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- SEP-1359: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1359
- Orphaned processes bug #1935: https://github.com/anthropics/claude-code/issues/1935
