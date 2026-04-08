---
name: nx-sync
description: "Core knowledge synchronization — scans project state and updates .nexus/core/ layers"
trigger_display: "/claude-nexus:nx-sync"
purpose: "Synchronize core knowledge with current project state"
triggers: ["/claude-nexus:nx-sync"]
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
- Auto-invoked by Lead in [run] Step 4

## Process

### Step 1: Gather Sources

Collect information from all available sources:

1. **git diff** — run `git diff --name-only HEAD~10..HEAD` (or use recent commits to identify changed files)
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

For each **affected layer only**, spawn Writer agent(s):

```
Agent({ subagent_type: "claude-nexus:writer", name: "writer-sync-{layer}",
  prompt: "Update .nexus/core/{layer}/ based on the following changes. Read current files with nx_core_read, then update with nx_core_write. Changes: {change_manifest}" })
```

The SubagentStart hook auto-injects the core knowledge index for the writer role.

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

Update files that exist in each layer based on detected changes. Do not assume specific filenames — each project has different core/ structure.

### identity/
- Update only if fundamental project direction, design principles, or priorities changed
- Rarely needs sync — skip unless user explicitly requests or major shifts detected

### codebase/
- Primary sync target — update when source code structure, tools, workflows, or conventions changed
- Match updates to the project's existing documentation files

### reference/
- Add new research findings from completed research tasks
- Update existing references if new data contradicts or supplements them
</guidelines>
