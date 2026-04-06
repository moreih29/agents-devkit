<!-- tags: identity, design, philosophy, principles -->
# Design Principles

## Role Structure Philosophy

### Why HOW / DO / CHECK

Three categories separate concerns clearly:
- **HOW** (judgment): Architects, strategists, designers, postdocs — analyze and advise, never modify code
- **DO** (execution): Engineers, researchers, writers — implement, investigate, produce artifacts
- **CHECK** (verification): QA, reviewers — validate independently, never modify what they check

This prevents agents from both creating and approving their own work.

### Lead's Role

Lead interprets user instructions, coordinates agents, and communicates results. Agent delegation is the default for non-trivial work.

Lead can do: fact-checking, simple edits, orchestration.
Lead delegates: analysis, judgment, multi-file implementation, verification.

## Tag System Philosophy

Tags are **explicit user signals**, not auto-detected modes. This ensures User Sovereignty — the user decides the execution depth, not the system.

| Tag | Purpose |
|-----|---------|
| `[plan]` | Research → multi-perspective analysis → decisions → plan document |
| `[run]` | Execute from plan document → verify → complete |
| `[d]` | Record a decision (within plan session) |
| `[rule]` | Save a project rule |

Messages without tags = Lead's judgment on delegation depth.

The `[plan]` → `[run]` flow embodies **plan-then-execute**: deliberate before acting.

## Plan Principles

1. **Active intent discovery** — Actively uncover what the user has not made explicit.
2. **Research before analysis** — Subagents gather evidence first; no proposals until research is complete.
3. **Hypothesis-based questions** — Form hypotheses grounded in research, then confirm with the user.
4. **Progressive Depth** — Planning depth auto-adjusts to request complexity.
5. **Objective pushback** — Push back when evidence supports a counter-argument. Nexus is not a yes-machine.
6. **Dynamic issue suggestion** — After each decision, propose follow-up issues that the decision creates.

## Information Management Intent

### 4-Layer Structure

```
identity/   — WHY: philosophy, mission, design principles (changes rarely)
codebase/   — HOW: code structure, architecture, implementation specs (changes with code)
reference/  — WHAT: external research, benchmarks, competitor analysis (changes with world)
memory/     — WHEN: past lessons, failure patterns (grows over time)
```

**identity/** is the stable foundation. **codebase/** is the living documentation that tracks implementation reality. Separating them prevents implementation drift from corrupting design principles.

### Per-Role Briefing

`nx_briefing(role, hint?)` auto-assembles context from the 4 layers based on what each role needs. HOW agents get full access; DO agents get focused context.

## Harness Philosophy

Quality is guaranteed **structurally** through hooks and platform constraints, not prompt instructions.

Structural enforcement:
- Edit/Write gating in `[run]` mode (PreToolUse hook)
- Agent tool restrictions (frontmatter `disallowedTools`)
- Stop hook for task completion (prevents premature exit)
- SubagentStop verification (detects incomplete agent work)

What remains prompt-guided (by design):
- Pipeline phase ordering (skill instructions)
- Agent selection (Lead judgment)
- Delegation depth (user tags or Lead judgment)
