<!-- tags: identity, roadmap, phases -->
# Roadmap

Stabilize each phase before moving to the next. Completed phases are kept as historical record.

## Phase 7 — Identity Redesign

- [x] Autonomous orchestrator → User orchestration infrastructure
- [x] Lead default: autonomous → user-directed
- [x] [run] tag for opt-in full pipeline
- [x] Context standard (English, XML section tags)
- [x] edit-tracker/reopen-tracker removed
- [x] Agent category frontmatter

## Phase 0 — Foundation Documentation

- [x] Establish identity documents (mission.md, design.md, roadmap.md)
- [x] Reflect Intent-First in consult skill (SKILL.md update, no code changes)

## Phase 1 — Information Structure + Agent Integration

Introduce the core/ 4-layer structure and merge Director+Principal, reflecting the new philosophy in agent prompts.

**Goals**:
- [x] Layer directory structure under `.nexus/core/` working
- [x] nx-sync auto-manages only the codebase/ scope
- [x] MCP tools support subdirectories
- [x] rules/ domain classification system working
- [x] Director+Principal merged (7→6 agents)
- [x] Agent prompts reflect new philosophy
- [x] All agents operating under new role definitions (Decide/How/Do/Check)
- [x] Free composition without team boundaries

## Phase 2 — Tag + Skill Integration

Merge [dev]/[research] into [do] and consolidate execution into a single skill.

**Goals**:
- [x] [consult]/[do]/[do!]/[d] tag system working
- [x] Single execution skill (nx-do) with dynamic composition working
- [x] Revisit consult skill "no execution → recommend appropriate tag" ([do] alone makes recommendation pointless)

## Phase 3 — Execution Improvements

Invert Lead's default behavior and introduce automatic system briefing and 2-stage verification.

**Goals**:
- [x] Lead+Director always-on team — Phase 2 Lead intuitive judgment → Director always-on team structure (Lead direct execution only when 3 conditions met)
- [x] SubagentStart lazy-read index injection — role-based MATRIX-filtered core+rules index auto-injected on spawn, agents read on demand
- [x] 2-stage verification — Director intent verification + QA output verification (Director discretion + 4 conditions)

## Phase 4 — Harness Hardening

Introduce loop detection, staged escalation, and automatic memory recording.

**Goals**:
- [x] Automatic detection + escalation chain on agent repeated failures
- [x] Lessons auto-extracted to memory/ on task_close
- [x] Memory reflected in next session's agent briefing for self-improvement mechanism

## Phase 5 — Structural Redesign

Full redesign after comprehensive review. Research external references (OMC/OMO/blog), implement 22 decisions.

**Goals**:
- [x] Deprecate [do]/[do!] tags → default orchestration (messages without tags = Lead→Director→dynamic composition)
- [x] 10-agent system (6→10: +Designer, Strategist, Writer, Reviewer)
- [x] 2 pipelines: code (Architect/Designer→Engineer→QA) + content (Postdoc/Strategist→Researcher/Writer→Reviewer)
- [x] nx-do → nx-run (promoted to default behavior), nx-sync → nx-init (full onboarding)
- [x] SessionStart hook spawns Director once
- [x] SubagentStart/Stop hooks track agent lifecycle
- [x] MCP matcher Circuit Breaker (nx_task_update reopen 3 warnings / 5 blocks)
- [x] Smart resume (tasks.json staleness assessment)
- [x] [consult] tag forces investigation context injection
- [x] Structured delegation format (TASK/CONTEXT/CONSTRAINTS/ACCEPTANCE)
- [x] Do immediate recording + Director review pattern (codebase: Engineer, reference: Researcher)
- [x] Director in-memory in-session learning

## Phase 6 — State File Management + Director Removal

Merge Director role into Lead and reorganize state file structure.

**Goals**:
- [x] Director removed (10→9 agents, Decide category abolished → 3 categories: How/Do/Check)
- [x] Lead assumes Decide+Orchestration (absorbs Director's intent representation role)
- [x] agent-tracker (.nexus/state/agent-tracker.json)
- [x] history.json → .nexus/history.json moved to project level
- [x] reopen-tracker removed from task_close
- [x] nx_task_add caller parameter removed (Lead-only, enforced via disallowedTools)
- [x] Phase 6-step pipeline redesign: Intake→Design→Execute→Check→Document→Complete
- [x] Phase 4 (Check) rollback rules: code issue→Phase 3, design issue→Phase 2
- [x] Phase 5 (Document): Writer updates core layers in parallel
- [x] [consult] forced investigation: Explore+researcher spawned in parallel, blocked until research complete
- [x] Evidence Requirement applied to all agents (How/Do/Check)
- [x] Lead coordination rules codified: parallelization (file overlap basis), QA role separation
- [x] Lead "fact-checking allowed, analysis/judgment delegated" principle established
- [x] Team session lifecycle management, team members spawned/shutdown as needed
