---
name: nx-init
description: "Project onboarding — scan, philosophy, context generation"
trigger_display: "/claude-nexus:nx-init"
purpose: "Full project onboarding: scan codebase, establish project philosophy, generate context knowledge"
triggers: ["/claude-nexus:nx-init"]
---

<role>
Scans the project and builds Nexus knowledge in the flat .nexus/ structure. On first run, performs a 5-step full onboarding sequence.
</role>

<constraints>
- NEVER modify source code. Slimming down CLAUDE.md beyond the project philosophy section is not this skill's responsibility.
- NEVER infer or guess information that cannot be confirmed from code — do not write it to context/.
- NEVER store secrets (API keys, credentials, etc.) in knowledge files.
- NEVER overwrite existing files without `--reset`. On resume, preserve existing files.
- Project philosophy in CLAUDE.md MUST go through user confirmation before writing.
- NEVER use nx_core_write — use the Write tool directly for all file creation.
- NEVER reference or create identity/, codebase/, reference/, or core/ paths.
</constraints>

<guidelines>
## Trigger

- `/claude-nexus:nx-init` — full onboarding (or resume)
- `/claude-nexus:nx-init --reset` — back up existing `.nexus/` knowledge and re-onboard
- `/claude-nexus:nx-init --reset --cleanup` — show backup list + selective deletion

---

## Modes

### First Run (no `.nexus/` flat structure)

Automatically runs the 5-step full onboarding.

Detection: `.nexus/context/`, `.nexus/memory/`, `.nexus/state/`, `.nexus/rules/` do not exist.

### Resume (`.nexus/` partially exists)

Check existing state and resume from the first incomplete step.

### Reset (`--reset`)

Back up existing `.nexus/` knowledge directories to `.nexus/bak.{timestamp}/`, then enter First Run.

### Cleanup (`--reset --cleanup`)

Show backup directory list, let user select backups to delete.

---

## Process

### Phase 0: Mode Detection

```
IF --reset --cleanup flag:
  Show list of .nexus/bak.*/ directories
  AskUserQuestion({
    questions: [{
      question: "Select a backup to delete (or cancel)",
      options: [...backup list..., { label: "Cancel", description: "Exit without changes" }]
    }]
  })
  Delete selected backup and exit

ELSE IF --reset flag:
  Move .nexus/{memory,context,state,rules}/ → .nexus/bak.{timestamp}/
  Inform: "Existing knowledge has been backed up to .nexus/bak.{timestamp}/. Starting re-onboarding."
  → Enter First Run

ELSE IF .nexus/context/ exists:
  → Enter Resume (check existing steps and resume)

ELSE:
  → Enter First Run (from Step 1)
```

---

## Steps

### Step 1: Project Scan

Auto-detect code structure and tech stack. Create the flat `.nexus/` directory structure if it does not exist.

Create directories (using Bash mkdir):
- `.nexus/memory/`
- `.nexus/context/`
- `.nexus/state/`
- `.nexus/rules/`

Collected items:
- **Directory structure**: top-level layout, major modules/packages
- **Tech stack**: language, framework, runtime (package.json, Cargo.toml, pyproject.toml, go.mod, build.gradle, etc.)
- **Build/test system**: scripts, CI configuration
- **Existing docs**: CLAUDE.md, README.md, docs/, .cursorrules, etc.
- **git context**: recent commits, branch structure, contributors

Output: scan summary (language, framework, structure overview)

For large projects (10+ top-level directories or 100+ files), consider spawning an Explore subagent for parallel scanning to reduce Lead context usage.

### Step 2: Project Philosophy (Interactive)

Confirm the core direction of the project together with the user, then write it into CLAUDE.md.

Ask the following 2 items sequentially via AskUserQuestion:

1. **Mission** — the problem this project solves and its goals
2. **Design philosophy** — design **principles only** (why these choices were made, not implementation details)

For each item, present a draft based on the Step 1 scan results for the user to revise/confirm.

**Scope**: Only high-level principles belong here. Implementation specifics (pipeline details, agent configuration, file structure, tool restrictions) belong in `context/`, not in CLAUDE.md.

After confirmation, write the philosophy into CLAUDE.md inside markers using the Edit tool:

```
<!-- PROJECT:START -->
## Project Philosophy

### Mission
{confirmed mission text}

### Design Philosophy
{confirmed design philosophy text}
<!-- PROJECT:END -->
```

If CLAUDE.md already contains `<!-- PROJECT:START -->` markers, replace the content between them. If CLAUDE.md does not exist, create it with the markers.

### Step 3: Context Knowledge Auto-Generation

Analyze Step 1 scan results to generate context knowledge documents in `.nexus/context/`.

Principles:
- File names and content are decided freely based on project characteristics. No fixed templates.
- Existing docs are information sources only — do not replicate their structure verbatim.
- Do not guess content that cannot be confirmed from code.
- Typically 1-3 files are sufficient. More files are not better.

Generation targets (select and name based on what the project actually needs):
- Development stack (languages, frameworks, runtimes, key dependencies, build/test/deploy workflow)
- Design and architecture (module relationships, data flow, core entry points, conventions)
- Implementation specifics (pipeline details, configuration patterns, file structure conventions, tool restrictions — anything too specific for CLAUDE.md philosophy)

Use the Write tool to create files at `.nexus/context/{chosen-name}.md`.

For large projects, spawn Writer subagents per topic to generate context knowledge in parallel. Lead coordinates and reviews outputs.

On completion: "context knowledge N files generated"

### Step 4: Rules Initial Setup (Optional)

Check whether team custom rules are needed.

```
AskUserQuestion({
  questions: [{
    question: "Do you want to set up development rules now?",
    options: [
      { label: "Set up", description: "Coding conventions, test policy, commit rules, etc." },
      { label: "Skip", description: "Can be added later via nx_rules_write" }
    ]
  }]
})
```

If "Set up": present a draft based on scan results → user confirms → save via `nx_rules_write`.

If "Skip": inform and proceed to Step 5.

### Step 5: Completion Summary

Output a summary of the onboarding results.

```
## Nexus Initialization Complete

### Generated Files
- CLAUDE.md: project philosophy section (<!-- PROJECT:START/END -->)
- .nexus/context/: {list of generated files}
- .nexus/rules/: {generated files or "none (skipped)"}

### Next Steps
- [plan] — research, analyze, and plan before execution
- [run] — execute from a plan
- /claude-nexus:nx-init --reset — re-run onboarding (existing knowledge will be backed up)
```
</guidelines>
