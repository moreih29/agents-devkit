<!-- tags: mcp, tools, lsp, ast, knowledge, tasks, meet, rules -->
<!-- tags: mcp, tools, lsp, ast, knowledge, tasks, meet, rules -->
# MCP Tools

List of tools provided by the MCP server (`bridge/mcp-server.cjs`). Source: `src/mcp/tools/`.

## Core

| Tool | Source | Storage Path | Purpose |
|------|--------|--------------|---------|
| `nx_core_read` | core-store.ts | `.nexus/core/{layer}/{topic}.md` | Read core knowledge (4 call patterns: full overview / layer listing / layer+topic full content / tags cross-search) |
| `nx_core_write` | core-store.ts | `.nexus/core/{layer}/{topic}.md` | Write core knowledge (layer enum: identity/codebase/reference/memory, tags option) |
| `nx_rules_read` | markdown-store.ts | `.nexus/rules/{name}.md` | Read rules (specify name or search by tag) |
| `nx_rules_write` | markdown-store.ts | `.nexus/rules/{name}.md` | Write rules (tags option, HTML comment frontmatter) |
| `nx_briefing` | briefing.ts | `.nexus/core/{layer}/` + `meet.json` + `rules/` | Assemble role-based briefing. role (9 values: architect/postdoc/designer/strategist/engineer/researcher/writer/qa/reviewer) + hint (optional). Matrix-based layer collection. When hint is provided, filters by tag/filename. Auto-includes meet.json decisions + rules/. Returns a single markdown string. |
| `nx_context` | context.ts | `.nexus/state/tasks.json`, `meet.json` reference | Query current branch, team mode, task summary, and meet decisions |
| `nx_task_list` | task.ts | `.nexus/state/tasks.json` | Task list + summary + ready tasks |
| `nx_task_add` | task.ts | `.nexus/state/tasks.json` | Add a task (title, context, deps, meet_issue, goal, owner parameters). `meet_issue` traces task back to meet session issue. |
| `nx_task_update` | task.ts | `.nexus/state/tasks.json` | Update task status (pending/in_progress/completed) |
| `nx_task_close` | task.ts | `.nexus/history.json` (project-level, git-tracked) | End current cycle: archive meet+tasks to history.json then delete source files. cycle includes branch field and meet key. |
| `nx_artifact_write` | artifact.ts | `.nexus/state/artifacts/{filename}` | Save team artifacts (report, synthesis, etc.) |
| `nx_meet_start` | meet.ts | `.nexus/state/meet.json` | Start a new meet session (register topic + issue list + research_summary + optional attendees). research_summary is required — forces research completion before session creation. Auto-archives existing meet.json to history if present. |
| `nx_meet_status` | meet.ts | `.nexus/state/meet.json` | Query current meet state (issue list/status + attendees + decisions inline) |
| `nx_meet_update` | meet.ts | `.nexus/state/meet.json` | Modify issues in an active meet session. action: add/remove/edit/reopen |
| `nx_meet_discuss` | meet.ts | `.nexus/state/meet.json` | Record discussion entry for an issue. speaker + content. Auto-transitions issue pending → discussing. |
| `nx_meet_decide` | meet.ts | `.nexus/state/meet.json` | Record decision for an issue (issue_id + summary). Stores decision inline in MeetIssue.decision. Returns completion signal when all issues decided. |
| `nx_meet_join` | meet.ts | `.nexus/state/meet.json` | Add an attendee to the current meet session (role + name). |

## nx_core_read Call Patterns

| Parameters | Returns |
|------------|---------|
| (none) | 4-layer overview (file count per layer) |
| `layer` | File listing within that layer + preview (first header) + tags |
| `layer` + `topic` | Full file content (raw markdown) |
| `tags` (no layer) | Cross-layer search across all layers (list of files matching tags) |

tags are parsed from `<!-- tags: ... -->` HTML comment frontmatter. Case-insensitive matching.

## nx_meet_update Actions

| action | Required Parameters | Behavior |
|--------|---------------------|---------|
| `add` | title | Add a new issue. Auto-assigned id as max id + 1. status: pending |
| `remove` | issue_id | Delete an issue |
| `edit` | issue_id, title | Edit issue title |
| `reopen` | issue_id | Revert decided → discussing. Clears decision field. |

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

## MeetFile Schema

Structure of `.nexus/state/meet.json`:

```json
{
  "id": 1,
  "topic": "meeting topic",
  "attendees": [
    { "role": "lead", "name": "lead", "joined_at": "ISO timestamp" }
  ],
  "issues": [
    {
      "id": 1,
      "title": "issue title",
      "status": "pending | discussing | decided",
      "discussion": [
        { "speaker": "architect", "content": "analysis summary", "timestamp": "ISO timestamp" }
      ],
      "decision": "decision summary (only when status=decided)"
    }
  ],
  "research_summary": "prior research findings",
  "created_at": "ISO timestamp"
}
```

- `id`: Auto-assigned (last meet id in history + 1)
- `meet_id` in nx_task_add: traces task back to meet.json issue (via `meet_issue` field)
- Decisions stored inline in `MeetIssue.decision` — no separate decisions.json
- `nx_meet_decide`: sets `issue.status = "decided"` and `issue.decision = summary`
- `nx_meet_update reopen`: sets `issue.status = "discussing"` and clears `issue.decision`

## history.json Schema

Archive file created/appended on `nx_task_close` call:

```json
{
  "cycles": [
    {
      "completed_at": "ISO timestamp",
      "branch": "branch name",
      "meet": { ... },
      "tasks": [ ... ]
    }
  ]
}
```

- Path: `.nexus/history.json` (project-level — git-tracked, full archive regardless of branch)
- Each cycle includes a `branch` field and `meet` key (MeetFile or null)
- After archiving, deletes meet.json, tasks.json from `.nexus/state/`
- decisions.json deprecated — decisions are now stored inline in meet.json issues

## Notes

- `nx_task_add` does not validate caller parameters. How/Do/Check agents are blocked at the platform level via disallowedTools.
- `nx_task_add` `meet_issue` field: optional number linking task to a meet session issue ID. Used for traceability.
- `decisions` field in Task is deprecated — use `meet_issue` instead.
- LSP: Auto-detects project language (tsconfig.json → TypeScript, etc.). Managed via per-language LSP client map.
- AST: `@ast-grep/napi` is optional — dynamically loaded from plugin cache or project node_modules.
- core_write stores to `.nexus/core/{layer}/{topic}.md` via `layer` (enum: identity/codebase/reference/memory) + `topic` parameters. z.enum validation prevents path traversal.
- MCP tools resolve state file paths via the `STATE_ROOT` constant. Single path under `.nexus/state/`.
- `nx_meet_decide` updates meet.json inline. When all issues are decided, returns completion signal (`allComplete: true`) with guidance to use [run] or [rule] tags.
- `nx_meet_start` auto-archives existing meet.json to history.json before creating new session.
- `nx_task_close` is called on cycle completion. Archives meet+tasks to `.nexus/history.json` (project-level) then deletes source files (meet.json, tasks.json). Also deletes `stop-warned`, `edit-tracker.json`, `reopen-tracker.json` if present. Replaces `nx_task_clear` (legacy).
- `nx_decision_add` is deprecated and removed. Use `nx_meet_decide` within a meet session instead.
