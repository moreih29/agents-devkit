<!-- tags: architecture, structure, entry-points, data-paths, build -->
<!-- tags: architecture, structure, entry-points, data-paths, build -->
# Architecture

Claude Code plugin. Three runtime entry points are bundled by esbuild.

## Entry Points

| Entry Point | Source | Build Output | Role |
|-------------|--------|--------------|------|
| MCP Server | `src/mcp/server.ts` | `bridge/mcp-server.cjs` | Tool provision (core, rules, context, task, plan, artifact, LSP, AST) |
| Gate Hook | `src/hooks/gate.ts` | `scripts/gate.cjs` | Event handling (Stop, PreToolUse, UserPromptSubmit, SessionStart, SubagentStart/Stop, PreCompact, PostCompact) + CLAUDE.md auto-sync |
| Statusline | `src/statusline/statusline.ts` | `scripts/statusline.cjs` | Status bar (model, branch, usage) |

## Directory Structure

```
src/
├── hooks/gate.ts          ← single hook module (8 events + CLAUDE.md sync)
├── mcp/
│   ├── server.ts          ← McpServer instance + tool registration
│   └── tools/             ← per-tool modules (core-store, markdown-store, context, task, plan, artifact, lsp, ast)
├── shared/
│   ├── paths.ts           ← PROJECT_ROOT, NEXUS_ROOT, STATE_ROOT, CORE_ROOT, LAYERS, corePath(), coreLayerDir(), findProjectRoot(), getCurrentBranch() etc.
│   ├── hook-io.ts         ← readStdin/respond/pass — hook I/O protocol
│   ├── matrix.ts          ← MATRIX (role→layer policy), extractRole(), getAllowedLayers()
│   ├── mcp-utils.ts       ← textResult() — MCP response helper
│   ├── tasks.ts           ← readTasksSummary() — tasks.json read utility
│   └── version.ts         ← VERSION file reader
├── data/
│   └── tags.json          ← tag metadata (used for template generation at build time)
├── code-intel/            ← LSP client, language detection (imported by lsp.ts)
└── statusline/            ← status bar rendering

templates/
└── nexus-section.md       ← auto-generated at build time (agents/skills/tags → CLAUDE.md Nexus section)

generate-template.mjs      ← template generation script (runs after esbuild)
```

## Plugin Manifest

- `.claude-plugin/plugin.json` — metadata (name, version, skills, mcpServers)
- `hooks/hooks.json` — hook registration (PreToolUse:Edit/Write/nx_task_update/nx_task_close, Stop:*, UserPromptSubmit:*, SessionStart:*, SubagentStart:*, SubagentStop:*, PreCompact:*, PostCompact:*)
- `.mcp.json` — MCP server path
- `agents/*.md` — agent definitions (9 agents, frontmatter includes task/disallowedTools fields)
- `skills/*/SKILL.md` — skill definitions (5 skills: nx-run, nx-plan, nx-init, nx-setup, nx-sync)

## Data Paths

| Path | Tracked | Purpose |
|------|---------|---------|
| `.nexus/core/` | git | 4-layer knowledge store (identity/codebase/reference/memory) |
| `.nexus/rules/` | git | Team custom behavior rules (created via nx_rules_write on user request) |
| `.nexus/config.json` | git | Nexus configuration |
| `.nexus/history.json` | git | Full cycle archive (project-level, includes branch field) |
| `.nexus/state/` | gitignore | Runtime state (tasks.json, plan.json, agent-tracker.json, artifacts/) |
| `templates/nexus-section.md` | git | CLAUDE.md Nexus section template (build output) |

## Build Pipeline

```
esbuild (TS → CJS bundle)
  ↓
generate-template.mjs (agents/skills/tags.json → templates/nexus-section.md + CLAUDE.md marker update)
  ↓
dev-sync.mjs (build output → plugin cache/marketplace sync, semver sort)
```

## Key Design Decisions

- **Single gate module**: Stop/PreToolUse/UserPromptSubmit/SessionStart/SubagentStart/Stop/PreCompact/PostCompact all handled in one gate.ts. Event discrimination: `hook_event_name` field (switch dispatch). PreCompact passes through (no-op); PostCompact injects a session state snapshot into `additionalContext`.
- **Flat state structure**: Runtime state consolidated under `.nexus/state/`. Branch-agnostic single path. Referenced via `STATE_ROOT` constant.
- **CLAUDE.md auto-sync**: gate.ts compares `templates/nexus-section.md` content against global CLAUDE.md at session start and auto-updates. Project CLAUDE.md triggers auto-update when stale (same as global).
- **esbuild CJS bundle**: Plugin runtime executes via `node`, so CJS format is required. `@ast-grep/napi` is a native module and handled as external.
- **git fallback**: `getCurrentBranch()` tries `git rev-parse --abbrev-ref HEAD` → on failure `git symbolic-ref --short HEAD` → still fails → returns `'_default'`. Branch name is used as context only (no effect on state paths).
- **[plan] session persistence**: On [plan] tag, continues existing session if plan.json is present. gate.ts checks plan.json existence to branch between resume/start guidance. Also detects stale tasks.json (all completed) and blocks plan entry until nx_task_close is called.
- **Unified archive**: nx_task_close archives plan+tasks to `.nexus/history.json` (project-level). cycle includes branch field and plan key. Auto-migrates legacy per-branch history.json. Deletes source files (plan.json, tasks.json).
- **agent-tracker**: Records to `.nexus/state/agent-tracker.json` on SubagentStart/Stop events. Initialized by SessionStart.
- **Lead owns tasks**: 9 agents (How 4 + Do 3 + Check 2). Task ownership managed by Lead.
- **gate.ts handler map**: handleUserPromptSubmit decomposed into PRIMITIVE_HANDLERS map-based dispatch. Separated into per-mode handler functions. TASK_PIPELINE unified as a shared constant for pipeline rules.
- **Tag-based guidance via additionalContext**: Tags ([plan], [d], [run], [rule]) detected in UserPromptSubmit and routed to handlers. Pipeline enforcement is handled by the tasks.json PreToolUse block.
- **buildCoreIndex**: Called on [plan] and [run] mode entry. Scans .nexus/core/ and builds a compact topic index with tags. Injected into additionalContext to orient Lead before research or execution begins.
- **stop_hook_active flag**: Platform-provided boolean on the Stop event. When true on second fire (all-completed case), gate passes through to prevent infinite loop. Replaces the retired stop-warned file.
- **core-store separation**: The core/ 4-layer uses 3-level navigation (layer→list→file), semantically distinct from markdown-store (2-level). Implemented as a separate core-store.ts module. Layer validated with z.enum (prevents path traversal).
- **Code deduplication**: registerMarkdownStore factory for rules management, textResult() helper, readTasksSummary() utility, findProjectRoot/getCurrentBranch single export.
- **plan.json decisions inline**: Decisions are stored directly inside PlanIssue.decision field. nx_task_close archives plan.json (with inline decisions) into history.json.
