# claude-nexus

[![npm version](https://img.shields.io/npm/v/claude-nexus)](https://www.npmjs.com/package/claude-nexus)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/moreih29/claude-nexus/blob/main/LICENSE)

> 🌏 [한국어](README.md)

Nexus agent orchestration plugin for Claude Code. Registers the canonical agents, skills, and MCP server from [nexus-core](https://github.com/moreih29/nexus-core) into the Claude harness.

## What's inside

- **10 agents**: architect · designer · engineer · **lead** · postdoc · researcher · reviewer · strategist · tester · writer
- **3 skills**: `nx-auto-plan` · `nx-plan` · `nx-run` — activated by `[plan]` · `[auto-plan]` · `[run]` tags
- **`nexus-core` MCP server**: 13 state management tools for planning, tasks, history, and artifacts (`nx_plan_*` · `nx_task_*` · `nx_history_search` · `nx_artifact_write`)
- **2 hooks**:
  - `SessionStart` — ensures the `.nexus/` folder layout and whitelist `.gitignore`
  - `UserPromptSubmit` — routes six tags (`[plan]` · `[auto-plan]` · `[run]` · `[m]` · `[m:gc]` · `[d]`)
- Ships with `settings.json` that makes `lead` the main-thread agent when the plugin is active

### Required setting

Claude Code does not honor `env` from a plugin's `settings.json`, so subagent resume (via `SendMessage`) only works when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set in your own `~/.claude/settings.json` or project `.claude/settings.json`:

```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
}
```

## Install

From inside Claude Code, use the plugin marketplace.

```
/plugin marketplace add moreih29/claude-nexus
/plugin install claude-nexus@nexus
```

## Usage

With the plugin enabled, each new Claude Code session runs the `lead` agent as the main thread. Prefix a request with a tag to activate a skill.

| Tag | Effect |
|---|---|
| `[plan]` | `nx-plan` — multi-perspective structured planning |
| `[auto-plan]` | `nx-auto-plan` — auto-decompose the request into a plan |
| `[run]` | `nx-run` — execute the current plan's tasks |
| `[m] <body>` | Store a lesson or reference under `.nexus/memory/` |
| `[m:gc]` | Garbage-collect `.nexus/memory/` |
| `[d] <decision>` | Record a decision on the active plan issue |

## Optional: statusline

The plugin ships a two-line statusline script. Line one shows `◆Nexus vX.Y.Z`, the model, the project, and the git branch with staged/unstaged counts. Line two shows context-window usage plus 5-hour and 7-day Claude usage gauges with the time until each resets. The usage gauges require a Claude Pro or Max OAuth session; `~/.claude/.usage_cache` is shared across local sessions so concurrent Claude Code windows never re-fetch.

Claude Code does not let a plugin auto-configure the user's `statusLine`, so register the `claude-nexus-statusline` CLI (shipped with the same npm package) from your own `~/.claude/settings.json`.

### bunx or npx (no install)

```json
{
  "statusLine": {
    "type": "command",
    "command": "bunx claude-nexus-statusline"
  }
}
```

`npx -y claude-nexus-statusline` works the same way. The first call downloads the package to the local cache; subsequent calls run from that cache.

### Global install (fastest startup)

```bash
bun add -g claude-nexus    # or npm i -g claude-nexus
```

```json
{
  "statusLine": {
    "type": "command",
    "command": "claude-nexus-statusline"
  }
}
```

Update with a single `bun update -g claude-nexus` (or `npm update -g claude-nexus`).

## Requirements

- Claude Code (latest)
- Node.js 20 or later at runtime

## License

MIT
