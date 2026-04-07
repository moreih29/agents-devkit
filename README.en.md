# claude-nexus

[![npm version](https://img.shields.io/npm/v/claude-nexus)](https://www.npmjs.com/package/claude-nexus)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/moreih29/claude-nexus/blob/main/LICENSE)

> 🌏 [한국어](README.md)

Agent orchestration plugin for Claude Code.

## Why

Specialized agent teams handle development and research systematically — architect, engineer, tester, researcher, and more. One tag triggers automatic orchestration of complex tasks across the right agents without manual coordination.

## Quick Start

**1. Install**

```bash
claude plugin marketplace add https://github.com/moreih29/claude-nexus.git
claude plugin install claude-nexus@nexus
```

**2. Onboard your project**

Run `/claude-nexus:nx-init` — scans your project and auto-generates structured knowledge under `.nexus/core/`.

**3. Start using**

- **Plan**: `[plan] How should we design the auth system?` — clarify intent and align before executing
- **Run**: `[run] Implement login API` — agent team handles analysis through implementation

## Usage

Tag your message to route it to the right workflow:

| Tag | Action | Example |
|-----|--------|---------|
| `[plan]` | Pre-execution planning | `[plan] Discuss DB migration strategy` |
| `[run]` | Execution (agent team) | `[run] Refactor payment module` |
| `[d]` | Record a decision | `[d] Use PostgreSQL for primary storage` |
| `[rule]` | Save a rule | `[rule] Always use bun instead of npm` |

Typical flow: use `[plan]` to discuss and align → decide → use `[run]` to execute.

## Agents

### How Team (4 agents)

| Agent | Invocation | Role | Model |
|-------|-----------|------|-------|
| **Architect** | `claude-nexus:architect` | Technical design and architecture review | opus |
| **Designer** | `claude-nexus:designer` | UI/UX design and interaction patterns | opus |
| **Postdoc** | `claude-nexus:postdoc` | Research methodology and evidence synthesis | opus |
| **Strategist** | `claude-nexus:strategist` | Business strategy and competitive positioning | opus |

### Do Team (3 agents)

| Agent | Invocation | Role | Model |
|-------|-----------|------|-------|
| **Engineer** | `claude-nexus:engineer` | Code implementation and debugging | sonnet |
| **Researcher** | `claude-nexus:researcher` | Web search, independent investigation | sonnet |
| **Writer** | `claude-nexus:writer` | Technical writing and documentation | sonnet |

### Check Team (2 agents)

| Agent | Invocation | Role | Model |
|-------|-----------|------|-------|
| **Tester** | `claude-nexus:tester` | Verification, testing, and security review | sonnet |
| **Reviewer** | `claude-nexus:reviewer` | Content verification and fact-checking | sonnet |

## Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| **nx-plan** | `[plan]` | Structured planning. Clarify requirements → record decisions (`[d]`) → recommend execution tag |
| **nx-run** | `[run]` | Execution. User-directed agent composition for development, research, and more |
| **nx-init** | `/claude-nexus:nx-init` | Full project onboarding: scan codebase, establish identity, generate core knowledge |
| **nx-setup** | `/claude-nexus:nx-setup` | Interactive setup. Injects agent/skill/tag configuration into CLAUDE.md |
| **nx-sync** | `/claude-nexus:nx-sync` | Core knowledge sync. Reflects source changes into .nexus/core/ docs |

## Advanced

<details>
<summary>MCP Tools</summary>

Claude-callable tools exposed by the Nexus MCP server.

### Core (14 tools)

| Tool | Purpose |
|------|---------|
| `nx_core_read/write` | Project knowledge management (git-tracked) |
| `nx_rules_read/write` | Team custom rules management (git-tracked) |
| `nx_context` | Current session state lookup (branch, tasks, plan) |
| `nx_task_list/add/update/close` | Task management + history.json archiving |
| `nx_artifact_write` | Save team artifacts (branch-isolated) |
| `nx_plan_start` | Start plan session (topic + issues, team verification) |
| `nx_plan_status` | Query plan state |
| `nx_plan_update` | Modify plan issues (add/remove/edit/reopen) |
| `nx_plan_decide` | Record issue decision (plan.json) |

### Code Intelligence (10 tools)

| Tool | Purpose |
|------|---------|
| `nx_lsp_hover` | Symbol type information |
| `nx_lsp_goto_definition` | Jump to definition |
| `nx_lsp_find_references` | List all references |
| `nx_lsp_diagnostics` | Compiler and linter errors |
| `nx_lsp_rename` | Project-wide symbol rename |
| `nx_lsp_code_actions` | Auto-fix and refactoring suggestions |
| `nx_lsp_document_symbols` | Symbols in a file |
| `nx_lsp_workspace_symbols` | Project-wide symbol search |
| `nx_ast_search` | AST pattern search (tree-sitter) |
| `nx_ast_replace` | AST pattern replacement (dryRun supported) |

LSP auto-detects the project language (e.g., `tsconfig.json` → TypeScript).
AST tools require `@ast-grep/napi`: `bun install @ast-grep/napi`

</details>

<details>
<summary>Hook</summary>

Nexus registers a single Gate module as a Claude Code hook.

| Event | Role |
|-------|------|
| `UserPromptSubmit` | Tag detection → mode activation + TASK_PIPELINE injection + additionalContext guidance |
| `PreToolUse` | Edit/Write: blocks when tasks.json missing. nx_plan_start: attendee team verification. Agent: team_name tracking |
| `Stop` | Blocks exit with pending tasks. Forces nx_task_close when all completed |

</details>

<details>
<summary>Project Knowledge</summary>

Project knowledge and rules are stored under `.nexus/` and tracked by git.

```
.nexus/
├── core/               ← Project knowledge (4 layers)
│   ├── identity/       ← Project identity and purpose
│   ├── codebase/       ← Architecture and structure
│   ├── reference/      ← Reference materials
│   └── memory/         ← Session memory and context
├── rules/              ← Team custom rules (created via nx_rules_write)
└── config.json         ← Nexus configuration
```

</details>

<details>
<summary>Runtime State</summary>

Runtime state is stored under `.nexus/state/` and is excluded from git. `history.json` is at `.nexus/` root and git-tracked.

```
.nexus/
├── history.json            ← Cycle archive (git-tracked, created by nx_task_close)
└── state/                  ← Runtime state (git-ignored)
    ├── tasks.json          ← Task list
    ├── plan.json           ← Planning session
    ├── decisions.json      ← Plan decisions
    ├── edit-tracker.json
    ├── reopen-tracker.json
    ├── agent-tracker.json
    └── artifacts/          ← Artifacts
```

</details>
