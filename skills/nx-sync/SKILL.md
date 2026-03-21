---
name: nx-sync
description: Detect and fix inconsistencies between Nexus source code and knowledge documents.
triggers: ["sync", "sync knowledge", "지식 동기화", "문서 동기화"]
---

# Sync

Scan Nexus source files and compare against knowledge documents to find and fix inconsistencies.

## Why This Exists

Nexus knowledge documents (architecture.md, agents-catalog.md, hook-modules.md, workflows.md) serve as the shared understanding for all agents. When code changes — new agents added, skills renamed, hook logic updated — these documents can silently drift out of sync. This skill catches that drift before it causes confusion.

## Process

### Phase 1: Scan Source of Truth

Read the actual source files to build the current state:

**Agents** — Glob `agents/*.md`, read each file's frontmatter:
```
For each agent file:
  - name, tier, context, tags
  - disallowedTools (READ-ONLY indicator)
```

**Skills** — Glob `skills/*/SKILL.md`, read each file's trigger section (5 skills: consult, plan, init, setup, sync):
```
For each skill:
  - name (directory name)
  - trigger keywords
```

**Hooks** — Read `src/hooks/gate.ts` and `src/hooks/pulse.ts`:
```
From gate.ts:
  - EXPLICIT_TAGS keys (what keywords are detected)
  - NATURAL_PATTERNS (what natural language triggers exist)
  - handleStop() checks (which primitives block Stop, in what order)

From pulse.ts:
  - What workflow states are injected as context
  - Priority levels used
```

### Phase 2: Scan Knowledge Documents

Read the four knowledge documents:
- `.claude/nexus/knowledge/architecture.md` — agent tables, hook descriptions, skill table
- `.claude/nexus/knowledge/agents-catalog.md` — full agent catalog, phase status
- `.claude/nexus/knowledge/hook-modules.md` — hook module details, keyword lists
- `.claude/nexus/knowledge/workflows.md` — primitives, keyword patterns, composite workflows

### Phase 3: Compare and Report

Check each category for inconsistencies:

**Agents:**
- Agent file exists in `agents/` but not in architecture.md agent tables
- Agent file exists in `agents/` but not in agents-catalog.md catalog table
- Agent listed in docs but no corresponding file in `agents/`
- Agent tier/context/role mismatch between file frontmatter and docs
- Lead's agent routing list missing any implemented agents

**Skills:**
- Skill directory exists in `skills/` but not in architecture.md skill table
- Skill listed in docs but no corresponding directory in `skills/`

**Hooks:**
- Gate keyword detected in gate.ts but not documented in hook-modules.md
- Gate Stop check order in code doesn't match hook-modules.md description
- Pulse context injection in code not reflected in hook-modules.md

**Phase Status:**
- agents-catalog.md phase status doesn't match which agents actually have files

Output the results as a structured report:

```
## Sync Knowledge Report

### Inconsistencies Found: N

#### Agents (X issues)
- [MISSING IN DOCS] agents/debugger.md exists but not in architecture.md Phase 2 table
- [MISMATCH] agents/finder.md has tier=low but architecture.md says medium

#### Skills (X issues)
- [MISSING IN DOCS] skills/sync/ exists but not in architecture.md skill table

#### Hooks (X issues)
- [MISSING IN DOCS] gate.ts detects "consult" keyword but hook-modules.md doesn't mention it

#### Phase Status (X issues)
- [OUTDATED] agents-catalog.md shows Phase 2 as "planned" but all 4 agents are implemented

### No Issues
(list categories with no issues)
```

### Phase 4: Apply Fixes (with user approval)

After presenting the report, ask the user: "Fix these inconsistencies?"

If approved, apply updates using the Edit tool. For each fix:
1. Read the target knowledge document
2. Find the relevant section
3. Apply the minimal edit to resolve the inconsistency
4. Do NOT rewrite entire sections — surgical edits only

Be careful with tables that reference external systems (like the "omc mode" column in workflows.md) — those values refer to the other system's naming, not ours.

## Important Constraints

- This skill only compares source files against knowledge documents. It does not modify source code.
- When in doubt about intent (e.g., is a missing agent intentionally excluded or forgotten?), list it as a finding and let the user decide.
- Do not add information that isn't in the source files. If an agent file doesn't specify a model, don't guess.
