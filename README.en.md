# claude-nexus

[![npm version](https://img.shields.io/npm/v/claude-nexus)](https://www.npmjs.com/package/claude-nexus)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/moreih29/claude-nexus/blob/main/LICENSE)

> 🌏 [한국어](README.md)

Agent orchestration plugin for Claude Code.

## Why

Specialized agent teams handle development and research systematically — director, architect, engineer, QA for development; principal, postdoc, researcher for research. One tag triggers automatic orchestration of complex tasks across the right agents without manual coordination.

## Quick Start

**1. Install**

```bash
claude plugin marketplace add https://github.com/moreih29/claude-nexus.git
claude plugin install claude-nexus@nexus
```

**2. Onboard your project**

Run `/claude-nexus:nx-sync` — on first run it scans your project and auto-generates structured knowledge under `.claude/nexus/knowledge/`.

**3. Start using**

- **Consult**: `[consult] How should we design the auth system?` — clarify intent and align before executing
- **Develop**: `[dev] Implement login API` — agent team handles analysis through implementation
- **Research**: `[research] React vs Svelte performance comparison` — independent investigation with synthesis report

## Usage

Tag your message to route it to the right workflow:

| Tag | Action | Example |
|-----|--------|---------|
| `[consult]` | Pre-execution consultation | `[consult] Discuss DB migration strategy` |
| `[dev]` | Development (auto Sub/Team) | `[dev] Refactor payment module` |
| `[dev!]` | Force team mode | `[dev!] Overhaul auth system` |
| `[research]` | Research execution | `[research] Compare caching strategies` |
| `[research!]` | Force research team | `[research!] Investigate competitor tech stacks` |

Typical flow: use `[consult]` to discuss and align → decide → use `[dev]` or `[research]` to execute.

## Agents

### Dev Team (4 agents)

| Agent | Invocation | Role | Model |
|-------|-----------|------|-------|
| **Director** | `claude-nexus:director` | Project direction, scope, and priority decisions | opus |
| **Architect** | `claude-nexus:architect` | Technical design and architecture review (read-only) | opus |
| **Engineer** | `claude-nexus:engineer` | Code implementation and debugging | sonnet |
| **QA** | `claude-nexus:qa` | Verification, testing, and security review | sonnet |

### Research Team (3 agents)

| Agent | Invocation | Role | Model |
|-------|-----------|------|-------|
| **Principal** | `claude-nexus:principal` | Research direction, agenda, and confirmation bias prevention | opus |
| **Postdoc** | `claude-nexus:postdoc` | Methodology design, evidence evaluation, synthesis documents | opus |
| **Researcher** | `claude-nexus:researcher` | Web search, independent investigation, source reporting | sonnet |

## Skills

| Skill | Trigger | Description |
|-------|---------|-------------|
| **nx-consult** | `[consult]` | Structured consultation. Clarify requirements → record decisions (`[d]`) → recommend execution tag |
| **nx-dev** | `[dev]` / `[dev!]` | Development execution. Auto-selects solo or team (Director→Architect→Engineer→QA) based on complexity |
| **nx-research** | `[research]` / `[research!]` | Research execution. Auto-selects solo or team (Principal→Postdoc→Researcher) based on complexity |
| **nx-setup** | `/claude-nexus:nx-setup` | Interactive setup. Injects agent/skill/tag configuration into CLAUDE.md |
| **nx-sync** | `/claude-nexus:nx-sync` | Auto-generates knowledge on first run, then detects and fixes drift with source changes. --reset for re-initialization |

## Advanced

<details>
<summary>MCP Tools</summary>

Claude-callable tools exposed by the Nexus MCP server.

### Core (14 tools)

| Tool | Purpose |
|------|---------|
| `nx_knowledge_read/write` | Project knowledge management (git-tracked) |
| `nx_rules_read/write` | Team custom rules management (git-tracked) |
| `nx_context` | Current session state lookup (branch, tasks, decisions) |
| `nx_task_list/add/update/close` | Task management + history.json archiving |
| `nx_decision_add` | Record architecture decisions |
| `nx_artifact_write` | Save team artifacts (branch-isolated) |
| `nx_consult_start` | Start consultation session (topic + issues) |
| `nx_consult_status` | Query consultation state (with decisions join) |
| `nx_consult_decide` | Record issue decision (consult.json + decisions.json) |
| `nx_consult_update` | Modify consultation issues (add/remove/edit/reopen) |
| `nx_branch_migrate` | Migrate state files (consult/decisions) across branches |

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
| `PreToolUse` | Edit/Write: blocks when tasks.json missing. Nexus internal paths exempted |
| `Stop` | Blocks exit with pending tasks. Forces nx_task_close when all completed |

</details>

<details>
<summary>Project Knowledge</summary>

Project knowledge and rules are stored under `.claude/nexus/` and tracked by git.

- `knowledge/` — Project knowledge. Auto-generated on first `nx-sync` run (structure is not fixed)
- `rules/` — Team custom rules. Created via `nx_rules_write` on user request
- `config.json` — Nexus configuration

</details>

<details>
<summary>Runtime State</summary>

Runtime state is stored under `.nexus/` and is excluded from git.

```
.nexus/
├── branches/               ← Per-branch isolation
│   └── {branch}/
│       ├── tasks.json      ← Task list
│       ├── decisions.json  ← Architecture decision list
│       ├── consult.json    ← Consultation issue tracker
│       ├── history.json    ← Cycle archive (created by nx_task_close)
│       └── artifacts/      ← Team artifacts
└── sync-state.json         ← Last sync commit
```

</details>
