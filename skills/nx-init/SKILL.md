---
name: nx-init
description: "Project onboarding — scan, identity, codebase generation"
trigger_display: "/claude-nexus:nx-init"
purpose: "Full project onboarding: scan codebase, establish identity, generate core knowledge"
triggers: ["/claude-nexus:nx-init"]
---

<role>
Scans the project and builds the Nexus core knowledge. On first run, performs a 5-step full onboarding sequence.
</role>

<constraints>
- NEVER modify source code. Slimming down CLAUDE.md is not this skill's responsibility.
- NEVER infer or guess information that cannot be confirmed from code — do not write it to core.
- NEVER store secrets (API keys, credentials, etc.) in knowledge files.
- NEVER overwrite existing files without `--reset`. On resume, preserve existing files.
- `identity/` MUST go through user confirmation — only `codebase/` is auto-generated.
</constraints>

<guidelines>
## Trigger

- `/claude-nexus:nx-init` — full onboarding (or resume)
- `/claude-nexus:nx-init --reset` — back up existing `core/` and re-onboard
- `/claude-nexus:nx-init --reset --cleanup` — show backup list + selective deletion

---

## Modes

### First Run (no `core/`)

Automatically runs the 5-step full onboarding.

### Resume (`core/` partially exists)

Check existing state and resume from the first incomplete step.

### Reset (`--reset`)

Back up existing `.nexus/core/` to `.nexus/core.bak.{timestamp}/`, then enter First Run.

### Cleanup (`--reset --cleanup`)

Show backup directory list, let user select backups to delete.

---

## Process

### Phase 0: Mode Detection

```
IF --reset --cleanup flag:
  Show list of .nexus/core.bak.*/ directories
  AskUserQuestion({
    questions: [{
      question: "Select a backup to delete (or cancel)",
      options: [...backup list..., { label: "Cancel", description: "Exit without changes" }]
    }]
  })
  Delete selected backup and exit

ELSE IF --reset flag:
  Move existing .nexus/core/ → .nexus/core.bak.{timestamp}/
  Inform: "Existing core/ has been backed up to core.bak.{timestamp}/. Starting re-onboarding."
  → Enter First Run

ELSE IF .nexus/core/ exists:
  → Enter Resume (check existing steps and resume)

ELSE:
  → Enter First Run (from Step 1)
```

---

## Steps

### Step 1: Project Scan

Auto-detect code structure and tech stack. If `.nexus/` structure does not exist, create it automatically.

Collected items:
- **Directory structure**: top-level layout, major modules/packages
- **Tech stack**: language, framework, runtime (package.json, Cargo.toml, pyproject.toml, go.mod, build.gradle, etc.)
- **Build/test system**: scripts, CI configuration
- **Existing docs**: CLAUDE.md, README.md, docs/, .cursorrules, etc.
- **git context**: recent commits, branch structure, contributors

Output: scan summary (language, framework, structure overview)

For large projects (10+ top-level directories or 100+ files), consider spawning an Explore subagent for parallel scanning to reduce Lead context usage.

### Step 2: Identity Establishment (Interactive)

Confirm the core direction of the project together with the user.

Ask the following 3 items sequentially via AskUserQuestion:

1. **Mission** — the problem this project solves and its goals
2. **Design** — design **principles and philosophy** only (why these choices, not implementation details)
3. **Roadmap** — current priorities and near-term direction

For each item, present a draft based on the Step 1 scan results for the user to revise/confirm.

**design.md scope**: Only design principles (role category philosophy, tag system rationale, information management intent). Implementation specifics (pipeline details, agent model table, file structure, rollback rules, disallowedTools mapping) belong in `codebase/`, NOT in `identity/design.md`.

Save confirmed content via `nx_core_write(layer: "identity")`:
- `identity/mission.md` — project purpose and goals
- `identity/design.md` — design principles and philosophy (not implementation specs)
- `identity/roadmap.md` — current priorities

### Step 3: Codebase Knowledge Auto-Generation

Analyze Step 1 scan results to generate codebase knowledge.

Principles:
- File names, structure, and hierarchy are decided freely based on project characteristics. No hardcoded templates.
- Existing docs are information sources only — do not replicate their structure.
- Do not guess content that cannot be confirmed from code.

Generation targets (adjusted per project):
- Architecture overview (module relationships, data flow)
- Tech stack and key dependencies
- Core entry points/modules
- Development workflow (build, test, deploy)
- Conventions (naming, code style)
- Implementation specs from design decisions (pipeline details, agent model configuration, file structure, tool restrictions — anything that was too specific for identity/design.md)

For large projects, spawn Writer subagents per topic (e.g., one for architecture, one for tools) to generate codebase knowledge in parallel. Lead coordinates and reviews outputs.

Create files via `nx_core_write(layer: "codebase")`.

On completion: "codebase knowledge N files generated"

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
- .nexus/core/identity/: mission.md, design.md, roadmap.md
- .nexus/core/codebase/: {list of generated files}
- .nexus/rules/: {generated files or "none (skipped)"}

### Next Steps
- [plan] — research, analyze, and plan before execution
- [run] — execute from a plan
- /claude-nexus:nx-init --reset — re-run onboarding (existing core/ will be backed up)
```
</guidelines>
