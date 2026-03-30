<!-- tags: mcp, tools, lsp, ast, knowledge, tasks, consult, rules -->
# MCP Tools

List of tools provided by the MCP server (`bridge/mcp-server.cjs`). Source: `src/mcp/tools/`.

## Core

| Tool | Source | Storage Path | Purpose |
|------|--------|--------------|---------|
| `nx_core_read` | core-store.ts | `.nexus/core/{layer}/{topic}.md` | Read core knowledge (4 call patterns: full overview / layer listing / layer+topic full content / tags cross-search) |
| `nx_core_write` | core-store.ts | `.nexus/core/{layer}/{topic}.md` | Write core knowledge (layer enum: identity/codebase/reference/memory, tags option) |
| `nx_rules_read` | markdown-store.ts | `.nexus/rules/{name}.md` | Read rules (specify name or search by tag) |
| `nx_rules_write` | markdown-store.ts | `.nexus/rules/{name}.md` | Write rules (tags option, HTML comment frontmatter) |
| `nx_briefing` | briefing.ts | `.nexus/core/{layer}/` + `decisions.json` + `rules/` | Assemble role-based briefing. role (9 values: architect/postdoc/designer/strategist/engineer/researcher/writer/qa/reviewer) + hint (optional). Matrix-based layer collection. When hint is provided, filters by tag/filename. Auto-includes decisions.json + rules/. Returns a single markdown string. |
| `nx_context` | context.ts | `.nexus/state/tasks.json`, `decisions.json` reference | Query current branch, team mode, task summary, and decisions |
| `nx_task_list` | task.ts | `.nexus/state/tasks.json` | Task list + summary + ready tasks |
| `nx_task_add` | task.ts | `.nexus/state/tasks.json` | Add a task (title, context, deps, decisions, goal, owner parameters) |
| `nx_task_update` | task.ts | `.nexus/state/tasks.json` | Update task status (pending/in_progress/completed) |
| `nx_task_close` | task.ts | `.nexus/history.json` (project-level, git-tracked) | End current cycle: archive consult+decisions+tasks to history.json then delete source files. cycle includes branch field. |
| `nx_decision_add` | decision.ts | `.nexus/state/decisions.json` | Add a decision record (summary + consult parameters; consult is related issue ID or null) |
| `nx_artifact_write` | artifact.ts | `.nexus/state/artifacts/{filename}` | Save team artifacts (report, synthesis, etc.) |
| `nx_consult_start` | consult.ts | `.nexus/state/consult.json` | Start a consultation session (register topic + issue list) |
| `nx_consult_status` | consult.ts | `.nexus/state/consult.json` + `decisions.json` | Query current consultation state (issue list/status + join decisions.json entries for decided issues) |
| `nx_consult_update` | consult.ts | `.nexus/state/consult.json` | Modify issues in an active consultation session. action: add/remove/edit/reopen |
| `nx_consult_decide` | consult.ts | `.nexus/state/consult.json` + `decisions.json` | Process issue decision (update consult.json + record in decisions.json). Returns completion signal when all issues decided — does not delete consult.json. |

## nx_core_read Call Patterns

| Parameters | Returns |
|------------|---------|
| (none) | 4-layer overview (file count per layer) |
| `layer` | File listing within that layer + preview (first header) + tags |
| `layer` + `topic` | Full file content (raw markdown) |
| `tags` (no layer) | Cross-layer search across all layers (list of files matching tags) |

tags are parsed from `<!-- tags: ... -->` HTML comment frontmatter. Case-insensitive matching.

## nx_consult_update Actions

| action | Required Parameters | Behavior |
|--------|---------------------|---------|
| `add` | title | Add a new issue. Auto-assigned id as max id + 1. status: pending |
| `remove` | issue_id | Delete an issue |
| `edit` | issue_id, title | Edit issue title |
| `reopen` | issue_id | Revert decided → discussing. Soft-delete entries in decisions.json where `consult === issue_id` (`status: "revoked"`) |

## Code Intelligence

| Tool | Source | Purpose |
|------|--------|---------|
| `nx_lsp_hover` | lsp.ts | Symbol type information |
| `nx_lsp_goto_definition` | lsp.ts | Navigate to definition |
| `nx_lsp_find_references` | lsp.ts | List of references |
| `nx_lsp_diagnostics` | lsp.ts | Compiler/linter errors |
| `nx_lsp_rename` | lsp.ts | Rename symbol across the project |
| `nx_lsp_code_actions` | lsp.ts | Auto-fix/refactoring suggestions |
| `nx_lsp_document_symbols` | lsp.ts | Symbol list within a file |
| `nx_lsp_workspace_symbols` | lsp.ts | Search symbols across the project |
| `nx_ast_search` | ast.ts | AST pattern search (tree-sitter via @ast-grep/napi) |
| `nx_ast_replace` | ast.ts | AST pattern replacement (dryRun supported) |

## DecisionEntry Schema

Structure of each entry in decisions.json:

```json
{ "id": 1, "summary": "decision content", "consult": 2, "status": "active" }
```

- `id`: Auto-assigned (max id + 1)
- `summary`: Decision content
- `consult`: Related consult issue ID (number), or null (direct decision)
- `status`: `"active"` (default) or `"revoked"` (on reopen). Optional — treated as active if absent.
- `nx_decision_add`: Specify issue ID via `consult` parameter. null if not specified
- `nx_consult_decide`: Auto-records issue_id in `consult` field
- `nx_consult_status`: Joins decision entries based on `d.consult === issue.id` (excludes revoked)
- `nx_consult_update reopen`: Soft-deletes entries where `d.consult === issue_id` (`status: "revoked"`) to preserve audit trail

## history.json Schema

Archive file created/appended on `nx_task_close` call:

```json
{
  "cycles": [
    {
      "completed_at": "ISO timestamp",
      "branch": "branch name",
      "consult": { ... },
      "decisions": [ ... ],
      "tasks": [ ... ]
    }
  ]
}
```

- Path: `.nexus/history.json` (project-level — git-tracked, full archive regardless of branch)
- Each cycle includes a `branch` field
- After archiving, deletes consult.json, decisions.json, tasks.json from `.nexus/state/`

## Notes

- `nx_task_add` does not validate caller parameters. How/Do/Check agents are blocked at the platform level via disallowedTools.
- LSP: Auto-detects project language (tsconfig.json → TypeScript, etc.). Managed via per-language LSP client map.
- AST: `@ast-grep/napi` is optional — dynamically loaded from plugin cache or project node_modules.
- core_write stores to `.nexus/core/{layer}/{topic}.md` via `layer` (enum: identity/codebase/reference/memory) + `topic` parameters. z.enum validation prevents path traversal.
- MCP tools resolve state file paths via the `STATE_ROOT` constant. Single path under `.nexus/state/`.
- `nx_consult_decide` updates consult.json + decisions.json simultaneously. When all issues are decided, does **not** delete consult.json — returns completion signal (`allComplete: true`).
- The reopen action of `nx_consult_update` soft-deletes entries where `consult === issue_id` in decisions.json (`status: "revoked"`) to preserve audit trail.
- `nx_consult_status` joins decisions.json entries for decided issues based on `d.consult === issue.id` and returns them together.
- `nx_task_close` is called on cycle completion. Archives consult+decisions+tasks to `.nexus/history.json` (project-level) then deletes source files (consult.json, decisions.json, tasks.json). Replaces `nx_task_clear` (legacy).
