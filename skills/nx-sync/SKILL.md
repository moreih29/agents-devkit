---
name: nx-sync
description: "Core knowledge synchronization — scans project state and updates .nexus/core/ layers"
trigger_display: "/claude-nexus:nx-sync"
purpose: "Synchronize core knowledge with current project state"
triggers: ["sync", "동기화", "core 업데이트", "문서 동기화"]
---

<role>
Scans the current project state and synchronizes .nexus/core/ knowledge layers. Uses git diff for codebase changes, history.json for decisions/tasks, and conversation context when available.
</role>

<constraints>
- NEVER delete existing core files — only update or add
- NEVER modify source code — this skill updates documentation only
- NEVER guess information that cannot be confirmed from sources — mark as "needs verification" instead
- MUST preserve existing content structure — update sections, don't rewrite entire files unnecessarily
</constraints>

<guidelines>
## Trigger

- `/claude-nexus:nx-sync` — sync all layers (default)
- `/claude-nexus:nx-sync codebase` — sync specific layer only
- `/claude-nexus:nx-sync identity codebase` — sync multiple specific layers
- Natural language: "sync core", "update docs", "동기화"
- Auto-invoked by Lead in [run] Step 5

## Process

### Step 1: Gather Sources

Collect information from all available sources:

1. **git diff** — run `git diff --name-only {last-sync-commit}..HEAD` (if no last-sync marker, use recent commits)
   - Identifies which source files changed
   - Primary source for codebase/ layer updates
2. **history.json** — read `.nexus/history.json` for recent cycles
   - Decisions made, tasks completed, plan topics
   - Primary source for identity/, reference/, memory/ updates
3. **Conversation context** — if available in current session
   - Supplementary source for all layers

### Step 2: Determine Scope

- If user specified layers → sync only those
- If no layers specified → analyze git diff to determine which core/ layers are affected:
  - **codebase/**: `src/` changes → update architecture, tools, development docs
  - **reference/**: External research added → update reference files
  - **identity/**: Rarely changes — skip unless user explicitly requests
  - **memory/**: Auto-updated on task_close — skip unless memoryHint indicates lessons

Only spawn Writer for layers that have detectable changes. If no changes detected for a layer, report "already current" and skip.

### Step 3: Execute Updates

For each **affected layer only**, spawn Writer agent(s) with `nx_briefing(role: "writer")`:

```
Agent({ subagent_type: "claude-nexus:writer", name: "writer-sync-{layer}",
  prompt: "Update .nexus/core/{layer}/ based on the following changes. Read current files with nx_core_read, then update with nx_core_write. Changes: {change_manifest}" })
```

- Do not spawn Writer for layers with no detectable changes
- Affected layers can be updated in parallel
- Writer reads current content first (nx_core_read), then applies targeted updates (nx_core_write)

### Step 4: Report

Report to user:
- Which layers were scanned
- Which files were updated (and what changed)
- Which layers were already up to date
- Any items marked "needs verification"

## Key Principles

1. **Targeted updates over full rewrites** — only change sections that are actually stale
2. **Evidence-based** — every update must trace to a source (git diff, history entry, or conversation)
3. **Preserve structure** — maintain existing document organization, headings, and format
4. **No speculation** — if a change's impact on docs is unclear, flag it rather than guess

## Layer-Specific Guidance

### identity/
- mission.md: update only if fundamental project direction changed
- design.md: update if architecture, principles, or role definitions changed
- roadmap.md: add new completed items, update current phase
- context-standard.md: update if format conventions changed

### codebase/
- architecture.md: update if file structure, entry points, or data paths changed
- orchestration.md: update if gate behavior, tags, or agent catalog changed
- tools.md: update if MCP tools were added, removed, or modified
- development.md: update if build process, conventions, or workflow changed

### reference/
- Add new research findings from completed research tasks
- Update existing references if new data contradicts or supplements them

### memory/
- Record lessons from cycles with memoryHint indicators
- Format: `## {date} — {topic}\n- lesson item`
</guidelines>
