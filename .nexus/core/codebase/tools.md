<!-- tags: mcp, tools, lsp, ast, knowledge, tasks, plan, rules -->
<!-- tags: mcp, tools, lsp, ast, knowledge, tasks, plan, rules -->
# MCP Tools

List of tools provided by the MCP server (`bridge/mcp-server.cjs`). Source: `src/mcp/tools/`.

## Core

| Tool | Source | Storage Path | Purpose |
|------|--------|--------------|---------|
| `nx_core_read` | core-store.ts | `.nexus/core/{layer}/{topic}.md` | Read core knowledge (4 call patterns: full overview / layer listing / layer+topic full content / tags cross-search) |
| `nx_core_write` | core-store.ts | `.nexus/core/{layer}/{topic}.md` | Write core knowledge (layer enum: identity/codebase/reference/memory, tags option) |
| `nx_rules_read` | markdown-store.ts | `.nexus/rules/{name}.md` | Read rules (specify name or search by tag) |
| `nx_rules_write` | markdown-store.ts | `.nexus/rules/{name}.md` | Write rules (tags option, HTML comment frontmatter) |
| `nx_briefing` | briefing.ts | `.nexus/core/{layer}/` + `plan.json` + `rules/` | Assemble role-based briefing. role (9 values: architect/postdoc/designer/strategist/engineer/researcher/writer/tester/reviewer) + hint (optional). Matrix-based layer collection. When hint is provided, filters by tag/filename. Auto-includes plan.json decisions + rules/. Returns a single markdown string. |
| `nx_context` | context.ts | `.nexus/state/tasks.json`, `plan.json` reference | Query current branch, team mode, task summary, and plan decisions |
| `nx_task_list` | task.ts | `.nexus/state/tasks.json` | Task list + summary + ready tasks |
| `nx_task_add` | task.ts | `.nexus/state/tasks.json` | Add a task (title, context, deps, plan_issue, goal, owner parameters). `plan_issue` traces task back to plan session issue. |
| `nx_task_update` | task.ts | `.nexus/state/tasks.json` | Update task status (pending/in_progress/completed) |
| `nx_task_close` | task.ts | `.nexus/history.json` (project-level, git-tracked) | End current cycle: archive plan+tasks to history.json then delete source files. cycle includes branch field and plan key. |
| `nx_artifact_write` | artifact.ts | `.nexus/state/artifacts/{filename}` | Save artifacts (report, synthesis, etc.) |

## Plan Tools

| Tool | Source | Purpose |
|------|--------|---------|
| `nx_plan_start` | plan.ts | Start a new plan session (topic + issues + research_summary). Auto-archives existing plan.json to history if present. research_summary is required — forces research completion before session creation. |
| `nx_plan_status` | plan.ts | Query current plan state (issue list/status + decisions inline) |
| `nx_plan_update` | plan.ts | Modify issues in an active plan session. action: add/remove/edit/reopen |
| `nx_plan_decide` | plan.ts | Record decision for an issue (issue_id + summary). Returns completion signal when all issues decided, with guidance to generate tasks.json (Step 7). |

## nx_plan_update Actions

| action | Required Parameters | Behavior |
|--------|---------------------|---------|
| `add` | title | Add a new issue. Auto-assigned id as max id + 1. status: pending |
| `remove` | issue_id | Delete an issue |
| `edit` | issue_id, title | Edit issue title |
| `reopen` | issue_id | Revert decided → pending. Clears decision field. |

## nx_core_read Call Patterns

| Parameters | Returns |
|------------|---------|
| (none) | 4-layer overview (file count per layer) |
| `layer` | File listing within that layer + preview (first header) + tags |
| `layer` + `topic` | Full file content (raw markdown) |
| `tags` (no layer) | Cross-layer search across all layers (list of files matching tags) |

tags are parsed from `<!-- tags: ... -->` HTML comment frontmatter. Case-insensitive matching.

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

## PlanFile Schema

Structure of `.nexus/state/plan.json`:

```json
{
  "id": 1,
  "topic": "plan topic",
  "issues": [
    {
      "id": 1,
      "title": "issue title",
      "status": "pending | decided",
      "decision": "decision summary (only when status=decided)"
    }
  ],
  "research_summary": "prior research findings",
  "created_at": "ISO timestamp"
}
```

- `id`: Auto-assigned (last plan id in history + 1)
- `plan_issue` in nx_task_add: traces task back to plan.json issue (via `plan_issue` field)
- Decisions stored inline in `PlanIssue.decision`
- `nx_plan_decide`: sets `issue.status = "decided"` and `issue.decision = summary`
- `nx_plan_update reopen`: sets `issue.status = "pending"` and clears `issue.decision`

## history.json Schema

Archive file created/appended on `nx_task_close` call:

```json
{
  "cycles": [
    {
      "completed_at": "ISO timestamp",
      "branch": "branch name",
      "plan": { ... },
      "tasks": [ ... ]
    }
  ]
}
```

- Path: `.nexus/history.json` (project-level — git-tracked, full archive regardless of branch)
- Each cycle includes a `branch` field and `plan` key (PlanFile or null)
- After archiving, deletes plan.json, tasks.json from `.nexus/state/`

## Notes

- `nx_task_add` does not validate caller parameters. How/Do/Check agents are blocked at the platform level via disallowedTools.
- `nx_task_add` `plan_issue` field: optional number linking task to a plan session issue ID. Used for traceability.
- LSP: Auto-detects project language (tsconfig.json → TypeScript, etc.). Managed via per-language LSP client map.
- AST: `@ast-grep/napi` is optional — dynamically loaded from plugin cache or project node_modules.
- core_write stores to `.nexus/core/{layer}/{topic}.md` via `layer` (enum: identity/codebase/reference/memory) + `topic` parameters. z.enum validation prevents path traversal.
- MCP tools resolve state file paths via the `STATE_ROOT` constant. Single path under `.nexus/state/`.
- `nx_plan_decide` updates plan.json inline. When all issues are decided, returns completion signal (`allComplete: true`) with guidance to generate tasks.json (Step 7: register tasks via nx_task_add with plan_issue=N).
- `nx_plan_start` auto-archives existing plan.json to history.json before creating new session.
- `nx_task_close` is called on cycle completion. Archives plan+tasks to `.nexus/history.json` (project-level) then deletes source files (plan.json, tasks.json). Also deletes `edit-tracker.json`, `reopen-tracker.json` if present.
