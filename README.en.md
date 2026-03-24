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

Run `/claude-nexus:nx-init` to scan existing docs and generate structured knowledge under `.claude/nexus/knowledge/`.

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
| **nx-init** | `/claude-nexus:nx-init` | Project onboarding. Scans existing docs to auto-generate knowledge files |
| **nx-setup** | `/claude-nexus:nx-setup` | Interactive setup. Injects agent/skill/tag configuration into CLAUDE.md |
| **nx-sync** | `/claude-nexus:nx-sync` | Detects and fixes drift between source code changes and knowledge docs |

## Advanced

<details>
<summary>MCP Tools</summary>

Claude-callable tools exposed by the Nexus MCP server.

### Core (5 tools)

| Tool | Purpose |
|------|---------|
| `nx_knowledge_read/write` | Project knowledge management (git-tracked) |
| `nx_context` | Current session state lookup |
| `nx_task_list/add/update/clear` | Task management backed by tasks.json |
| `nx_decision_add` | Record architecture decisions |

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
| `UserPromptSubmit` | Prompt preprocessing and context injection |
| `Stop` | Post-session cleanup |

</details>

<details>
<summary>Project Knowledge</summary>

Project knowledge is stored under `.claude/nexus/knowledge/` and tracked by git.

- `nx-init` auto-generates knowledge files tailored to your project (structure is not fixed)
- Nexus configuration is stored in `config.json`

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
│       └── reports/        ← Research outputs
└── sync-state.json         ← Last sync commit
```

</details>
