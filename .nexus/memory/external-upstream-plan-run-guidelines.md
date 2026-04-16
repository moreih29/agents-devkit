# Upstream Issue Proposal: Plan/Run Quantitative Guidelines

**Date**: 2026-04-16
**Author**: claude-nexus maintainer (Plan session #7)
**Target**: `@moreih29/nexus-core` maintainer
**Status**: Submitted — awaiting nexus-core maintainer response
**Plan session**: #7 (topic: "claude-nexus orchestration 가이드 공백 정리")
**Upstream link**: https://github.com/moreih29/nexus-core/issues/19

<!-- 주: external-* prefix proposal 성격상 일반 80줄 상한 예외 적용 (Plan #7 Issue #3.1) -->

---

## §1 Summary

This proposal asks nexus-core to introduce quantitative guidelines into two skill bodies — `skills/nx-plan/body.md` Step 7 and `skills/nx-run/body.md` Steps 1.5 and 2 — covering task granularity, auto-pairing conditions, parallel dispatch caps, and supporting policies. The current bodies describe orchestration workflows in qualitative terms only. Operators running these skills across sessions experience inconsistent task decomposition and unconstrained parallel dispatch, both of which compound silently across cycles.

The two changes are presented in a single proposal because Issue #1 (task granularity) and Issue #2 (parallel dispatch) are mutually dependent at the auto-pairing boundary: the granularity rule determines which DO tasks receive CHECK pairs, and the dispatch rule determines how those pairs are streamed. Separating the proposals would require each to reference the other's undefined terms. The proposed design introduces one primary metric (artifact-coherence), a small set of hard quantitative thresholds, a conditional auto-pairing policy, an exception catalog, a pair-wise streaming dispatch model with a hard cap of 5 in-flight subagents, and two supporting mechanisms (dedup 2-layer, TUI grouping). Each element traces directly to a decision recorded in Plan session #7.

---

## §2 Background

### §2.1 Current guidance gaps in nx-plan Step 7 and nx-run Steps 1.5 and 2

The current `skills/nx-plan/body.md` Step 7 describes task decomposition in the following terms (paraphrased from the deployed SKILL.md):

- DO/CHECK decomposition principle: "when a task involves multiple independent artifacts, decompose across multiple parallel DO/CHECK subagents rather than bundling them into a single subagent."
- Auto-pairing rule: any task with `owner: "engineer"` + `acceptance` field → pair a tester task; any task with `owner: "writer"` → pair a reviewer task.
- Owner table: six owner categories mapped to work types.

What is absent: any quantitative bound on task size, any threshold for when parallel decomposition is warranted, any cap on simultaneous CHECK tasks relative to DO tasks, and any distinction between task types that warrant auto-pairing versus those that do not.

The current `skills/nx-run/body.md` Step 2 describes parallel execution as: "independent tasks (no overlapping target files, no deps) can be spawned in parallel. Tasks sharing target files must be serialized." Step 1.5 adds: tasks ≤ 10 → per-task TUI registration; tasks > 10 → group by `plan_issue`.

What is absent: any upper bound on concurrent subagents, any algorithm for sequencing DO completion against CHECK spawn (drain vs streaming), and any deduplication pass before spawn to catch plan-time overlap that survived task generation.

The gap is not stylistic. Without quantitative bounds, two Lead instances processing the same plan.json can produce tasks.json files that differ in task count, task size, and CHECK/DO ratio. Without a dispatch cap, a plan with eight independent DO tasks will attempt to hold all eight in flight simultaneously, exceeding documented stability thresholds.

### §2.2 Empirical evidence from claude-nexus cycles

Two incidents from active claude-nexus development motivate this proposal directly.

**cycle-split-pattern.md (2026-04-10)**: During resume_tier Phase 1 (cycle 65), a 17-file documentation-only change and Phase 2 Cycle A (cycle 66), a 4-file gate.ts infrastructure change, were processed as separate cycles with the commit size rule "≤20 files or ≤300 lines per cycle." This pattern emerged empirically — no skill body stated it. The key sub-finding was that when multiple sub-tasks target the same file, assigning them to separate subagents causes file conflicts. The correct resolution was to bundle them under a single owner with a structured prompt. The current Step 7 body says nothing about this case.

**tester-artifact-gap.md (2026-04-10, resolved commit 37cd5d0)**: During a [run] cycle, a researcher task (SubagentStop hook investigation) had its output routed to a tester subagent via the existing auto-pairing rule ("any task with `acceptance` field → tester"). The tester stopped with "artifact not found" because tester is a code-verification agent — it has no basis to verify a text research report. The fix was to narrow auto-pairing to `engineer + acceptance` only. The current Step 7 body still states the broader pairing rule that caused the incident. This proposal corrects it.

### §2.3 Why a single proposal covers both issues

Issue #1 (task granularity) and Issue #2 (parallel dispatch) share the auto-pairing boundary as a coupling point. The granularity rule in §3.3 defines which DO tasks receive a CHECK pair. The dispatch rule in §3.5 defines whether that pair is streamed (DO completes → CHECK spawns immediately) or drained (all DOs complete → CHECK batch). Neither rule is self-contained: the streaming model presupposes 1:1 pairing from the granularity decision; the granularity rule's conditional pairing constraint only matters when the dispatch model can actually stream the pairs.

Additionally, the deduplication mechanism in §3.6 requires both skills to act in concert: plan Step 7 performs a first-pass merge of tasks targeting the same files, and run Step 2 performs a final-pass intersection check before spawn. Splitting the proposal would require each half to reference unspecified behavior in the other.

---

## §3 Proposed Design

### §3.1 Primary metric: artifact-coherence

Task granularity is measured by artifact-coherence: a well-scoped task targets a single artifact or a tightly coupled cluster of artifacts and makes a single coherent change to that cluster.

"Single coherent change" means: (a) the change can be described in one sentence that identifies what changed and why it is complete, (b) reverting the task leaves all other artifacts in a consistent state, and (c) the acceptance criteria can be verified by inspecting the artifacts produced by this task alone, without reference to a parallel task's output.

Artifact-coherence is chosen over token-count or line-count as the primary axis because it is robust to irrelevant-token accumulation: a 10-line change to a core module and a 10-line documentation update are very different sizes of reasoning surface, but a single coherent change to a single artifact is a stable unit regardless of token density. Quantitative thresholds (§3.2) are derived from this primary metric, not substitutes for it.

### §3.2 Quantitative thresholds

The following hard rules apply during Step 7 task generation. "Hard" means they are not overridden by local judgment outside the exception catalog (§3.4).

| Rule | Value | Rationale |
|------|-------|-----------|
| Artifact cluster size | ≤ 3 files per task | Beyond 3 files, coherence claims require explicit justification |
| Modification size | ≤ 150 lines per task | Empirically derived from ≤300-line cycle guideline; task is half a cycle |
| CHECK/DO ratio | CHECK task count ≤ DO task count × 0.5 | CHECK agents are downstream consumers; more CHECK than DO/2 signals over-splitting of DO |
| Parallel decomposition threshold | ≥ 3 independent artifacts | Below this, parallelization overhead exceeds benefit; bundle under one owner |
| HOW decomposition threshold | Only when domain-agent mapping row differs | Same-row sub-concerns belong in a single HOW session; splitting HOW by sub-concern wastes context |

These numbers are recommended starting values subject to recalibration after 6–8 weeks of use. They are not derived from external benchmarks; the rationale is cycle-split-pattern.md empirical data plus the "half a cycle" principle for modification size.

### §3.3 Auto-pairing policy (conditional)

The current body states an unconditional pairing rule. This proposal replaces it with a conditional rule.

**New rule**: auto-generate a CHECK task only for DO tasks whose `acceptance` criteria include runtime behavior change. Specifically:

- `owner: "engineer"` task + `acceptance` contains a runtime behavior criterion → pair a **tester** task.
- `owner: "writer"` task + `acceptance` contains a verifiable deliverable criterion → pair a **reviewer** task.

**Excluded from auto-pairing**:

- Pure refactor tasks (behavior-preserving restructuring, no observable runtime change).
- Type-only changes (TypeScript type annotations, interface additions with no runtime path).
- Docs-adjacent tasks (`.md` files, frontmatter-only changes, non-rendered content). These may receive a reviewer pair via the `docs_only` exception (§3.4), but the trigger is explicit exception classification, not the blanket rule.
- Researcher tasks. The consumer of a researcher output is Lead or a HOW agent, not a CHECK agent. If a researcher output feeds directly into an engineer acceptance criterion, that criterion sits on the engineer task, not the researcher task.

The rationale is tester-artifact-gap.md: the previous unconditional rule routed researcher output to tester, which has no competence to verify text reports. Conditional pairing ensures CHECK agents are only spawned where their specific verification competence applies.

### §3.4 Exception catalog

The quantitative thresholds in §3.2 apply by default. Exceptions require explicit catalog classification at task generation time. Tasks classified under an exception must record the exception type in their `context` field. No exception outside this catalog is permitted on the basis of unspecified "good reasons."

**Exception 1: `docs_only`**

Applies when all files changed by the task are `.md` files or frontmatter-only modifications.

Sub-case `docs_only.coherent`: multiple `.md` files all reflect a common scheme, decision, or structural change (example: updating all agent frontmatter files after a new field is introduced in a spec). These files share a single coherent change. Treatment: bundle into 1 writer task, pair with 1 reviewer task. File count and line count thresholds are waived. The coherence claim must be stated in the task `approach` field.

Sub-case `docs_only.independent`: each `.md` file addresses a distinct topic with no cross-reference dependency (example: separate blog posts, separate proposal drafts). Each file is its own artifact. Treatment: N parallel writer tasks (one per file), each paired with 1 reviewer task. File count threshold is waived per-task; each task still targets 1 artifact.

Disambiguation: if all changed files trace to a single `plan_issue`, that is a signal for `coherent`. If the files are unrelated in subject and would be consumed independently by a reader, that is a signal for `independent`. When ambiguous, prefer `coherent` (fewer tasks, less dispatch overhead).

Tester pairing: skipped by default for `docs_only` tasks. Runtime behavior is not present. If a documentation change is adjacent to a code change in the same cycle, the code change carries its own tester task via the standard conditional rule.

**Exception 2: `same_file_bundle`**

Applies when two or more sub-tasks in the decomposition would each modify the same target file. Assigning them to separate subagents causes file conflicts (evidenced in cycle-split-pattern.md, gate.ts case).

Treatment: merge all sub-tasks into a single task with a structured prompt listing each sub-task's requirements. The merged task counts as 1 task in the task count and 1 artifact cluster in the file count. The 150-line threshold applies to the total modification expected across all sub-tasks combined.

This exception does not apply when sub-tasks are sequenced (the output of sub-task A is the input for sub-task B targeting the same file): those remain separate tasks with a `deps` relationship.

**Exception 3: `generated_artifacts`**

Applies to build output files (example: `bridge/`, `scripts/` in claude-nexus; any path declared as a build output in the harness's build configuration).

Treatment: generated artifact files are excluded from task count, artifact cluster file count, and line count calculations. They are committed as part of the task that triggers their generation (typically an engineer task that modifies source files), but they do not create a separate task entry and do not inflate the artifact cluster size.

Rationale: generated files do not represent independent authoring decisions. Their content is determined by the source task. Counting them inflates metrics without adding decomposition information.

### §3.5 Parallel dispatch

**Hard cap**: in-flight subagent count ≤ 5 at any point during execution. "In-flight" means spawned and not yet returned a result. This cap is absolute; no exception catalog entry permits exceeding it. The value 5 is the upper bound of the officially documented "3–5 teammates" guidance (code.claude.com/docs/en/agent-teams, referenced in Plan session #7 Issue #2 research summary). Empirical reports place system-level collapse at 24 concurrent agents (GitHub issue #15487); the cap is set conservatively well below that threshold.

**Default dispatch model: pair-wise streaming**

When a DO task has a 1:1 CHECK pair (engineer→tester, writer→reviewer), the CHECK task is spawned immediately upon DO completion — it does not wait for all DO tasks to complete. This reduces feedback latency and enables early failure detection: if a tester finds a defect in DO task 3 while DO tasks 4 and 5 are still running, the defect is surfaced before tasks 4 and 5 potentially replicate it.

The cap governs the total in-flight count across all active DO and CHECK tasks combined. If spawning the next pair would exceed cap=5, the spawn waits until at least one in-flight subagent completes.

**Exception: drain wave**

When the acceptance criteria of a CHECK task require it to inspect the combined outputs of multiple DO tasks (N:1 integrated verification), the CHECK task must wait for all N DO tasks to complete before spawning. This is the "drain wave" pattern. It applies only when the CHECK task's prompt explicitly references outputs from more than one DO task. Drain wave tasks must be declared at task generation time in the `approach` field ("drain wave: awaiting tasks #X, #Y before CHECK spawn").

**Owner-homogeneous preference (soft)**

When scheduling a wave of independent DO tasks with no dependency chain among them, prefer grouping tasks by owner type in the same wave (all engineer tasks together, all writer tasks together). This is a soft preference — it does not override dependency ordering or the cap constraint. The benefit is uniform escalation context: if multiple engineer tasks in a wave fail, the HOW diagnosis (architect) can review them together.

**Cap recalibration**

After 3–5 cycles, Lead reviews `tool-log.jsonl` wave size records to assess cap utilization. Upward revision of the cap (above 5) is not permitted by this rule alone — it would require a new proposal. Downward revision is permitted if utilization data shows that waves consistently stay at ≤ 3 in-flight without benefit of the headroom.

### §3.6 Dedup 2-layer

Task deduplication requires two passes because a single pass at either stage has known blind spots.

**Layer 1 — plan Step 7 (first pass)**: during task generation, before writing tasks.json, Lead scans the draft task list for tasks with overlapping `target_files` sets. Overlapping tasks targeting the same file are merged into a single task under one owner using the `same_file_bundle` exception (§3.4). This pass catches decomposition-time overlap.

**Layer 2 — run Step 2 (final pass)**: immediately before spawning each wave of subagents, Lead performs a final intersection check on the target file sets of all tasks in the candidate wave. Any pair of tasks whose target file sets intersect is separated: one proceeds in the current wave, the other is deferred to the next wave. This pass catches overlap that survived task generation — for example, overlap introduced by the `[plan:auto]` mode's HOW-parallel decomposition, where two HOW agents may independently propose tasks targeting the same file.

The two layers are not redundant. Layer 1 operates on a static draft and can perform full merges. Layer 2 operates just before spawn and can only defer — it does not merge tasks after they are registered in tasks.json. Both layers are required.

### §3.7 TUI grouping

The current Step 1.5 rule (≤ 10 tasks → per-task; > 10 tasks → group by `plan_issue`) is extended with a second grouping axis.

Two orthogonal grouping axes apply:

| Condition | Grouping unit | Purpose |
|-----------|---------------|---------|
| Active in-flight subagents > 5 | Group by `wave_id` | Operational visibility — which wave is currently executing |
| Total task count > 10 | Group by `plan_issue` | Semantic grouping — which issue does this cluster of tasks address |

The two axes are independent. A session with 12 total tasks and 4 in-flight subagents uses plan_issue grouping only. A session with 8 total tasks and 6 in-flight subagents (which should not occur under cap=5 hard, but may appear during a brief transition) uses wave_id grouping only. A session with 15 total tasks and an in-flight spike uses both.

Under the cap=5 hard constraint, the `active > 5` condition is nominally unreachable during steady-state execution. It serves as a safety boundary for transient states (e.g., the instant between a spawn and the cap check completing).

### §3.8 Escalation serialization

When a subagent stops with incomplete work (SubagentStop), the HOW diagnosis step is always serial, regardless of the wave model in effect.

Rule: after a SubagentStop event, pause the current wave dispatch. Spawn the relevant HOW agent (engineer failure → architect, writer failure → strategist, researcher failure → postdoc, tester failure → architect). After HOW returns its diagnosis, re-delegate the failed task to a fresh subagent using the adjusted approach. Only then resume wave dispatch.

Rationale: parallel rework on the same artifact by two subagents with different approaches will conflict. HOW diagnosis is a reasoning task, not an artifact task — it consumes no file slots and does not count against the cap. The serialization overhead is bounded to one HOW session per failed task (maximum 1 HOW + 1 re-delegation per task before escalating to user).

---

## §4 Scope of Change in nexus-core

### §4.1 `skills/nx-plan/body.md` Step 7 modification

The relevant section in the current body (extracted from deployed SKILL.md Step 7, "Derive tasks" sub-step) reads:

```
**Verification auto-pairing** — create separate verification tasks:
- Any task with `owner: "engineer"` + `acceptance` field → pair a **tester** task (verify acceptance criteria)
- Any task with `owner: "writer"` → pair a **reviewer** task (verify deliverable)
- Paired verification tasks are linked via `deps` to the original task

**DO/CHECK decomposition principle**: DO category agents (engineer, writer, researcher) and CHECK
category agents (tester, reviewer) operate on artifact-level scope and accumulate less per-task
context than HOW category agents. When a task involves multiple independent artifacts (several
files, several verification targets, multiple research questions), decompose the task across multiple
parallel DO/CHECK subagents rather than bundling them into a single subagent. Single-subagent
bundles risk context exhaustion with no wall-clock benefit over parallel decomposition. HOW agents
benefit from consolidated context and should generally remain as single sessions. Task granularity
is assessed per-task by the plan author, not declared per-agent in meta.yml.
```

Proposed replacement:

```
**Primary metric — artifact-coherence**: a well-scoped task targets a single artifact or a tightly
coupled artifact cluster and makes a single coherent change to that cluster. A change is coherent
when: (a) it can be described in one sentence, (b) reverting it leaves all other artifacts
consistent, and (c) its acceptance criteria can be verified by inspecting its outputs alone.

**Quantitative thresholds** (hard — override requires exception catalog entry):
- 1 task ≈ 1 artifact cluster: ≤ 3 files, ≤ 150 lines modified
- CHECK task count ≤ DO task count × 0.5
- Parallel DO/CHECK decomposition threshold: ≥ 3 independent artifacts
- HOW decomposition: split only when domain-agent mapping row differs

**Verification auto-pairing** (conditional) — create a CHECK task only when the DO task's
`acceptance` field contains a runtime behavior criterion:
- `owner: "engineer"` + runtime behavior acceptance → pair a **tester** task
- `owner: "writer"` + verifiable deliverable acceptance → pair a **reviewer** task
- Excluded: pure refactor, type-only, docs-adjacent (`.md`/frontmatter). Researcher tasks never
  receive an auto-paired CHECK task.
- Paired verification tasks are linked via `deps` to the original task.

**Exception catalog** (thresholds waived only for catalog-matching tasks; record exception type
in `context` field):
- `docs_only.coherent`: all files are `.md`/frontmatter, sharing one common scheme → 1 writer
  task + 1 reviewer pair, file/line thresholds waived.
- `docs_only.independent`: each `.md` file is a distinct topic → N parallel writer tasks, each
  with 1 reviewer pair, file threshold waived per-task.
- `same_file_bundle`: multiple sub-tasks target same file → merge under 1 owner with structured
  prompt, counts as 1 task. (Prevents file conflicts in parallel execution.)
- `generated_artifacts`: build output paths → excluded from task count and file/line calculations.

**Dedup first pass (Layer 1)**: before writing tasks.json, scan the draft task list for overlapping
`target_files` sets. Merge overlapping tasks using `same_file_bundle` rule.
```

### §4.2 `skills/nx-run/body.md` Steps 1.5 and 2 modification

The relevant section in Step 1.5 reads:

```
- **≤ 10 tasks**: register one task-tracking entry per task via the harness's task registration primitive.
- **> 10 tasks**: group by `plan_issue`; register one entry per group.
```

Proposed replacement:

```
- **≤ 10 tasks**: register one task-tracking entry per task via the harness's task registration
  primitive.
- **> 10 tasks**: group by `plan_issue`; register one entry per group.
- **Active in-flight > 5**: additionally group by `wave_id`; register one entry per wave.
  (Under cap=5 hard, this condition is nominally unreachable in steady state — it is a safety
  boundary for transient states.)
- Record `wave_id` metadata on each registered entry (see §5.2 for harness-local labeling).
```

The relevant section in Step 2 ("Parallel execution") reads:

```
- **Parallel execution**: independent tasks (no overlapping target files, no deps) can be spawned
  in parallel. Tasks sharing target files must be serialized.
```

Proposed replacement:

```
**Parallel dispatch**:

- **Hard cap**: in-flight subagent count ≤ 5 at all times. "In-flight" = spawned and not yet
  returned. Do not spawn a new subagent if doing so would bring in-flight count to 6 or above;
  wait for a completion first.
- **Default model — pair-wise streaming**: for 1:1 DO/CHECK pairs, spawn the CHECK task
  immediately upon DO completion. Do not wait for all DO tasks to complete before starting any
  CHECK. This minimizes feedback latency and surfaces failures early.
- **Exception — drain wave**: when a CHECK task must inspect combined output from multiple DO
  tasks (N:1 integrated verification), wait for all N DO tasks to complete before spawning CHECK.
  Declare drain wave in the task `approach` field at generation time.
- **Owner-homogeneous (soft preference)**: when scheduling independent DO tasks with no deps
  among them, prefer grouping by owner type in the same wave. Not a hard constraint.
- **Dedup final pass (Layer 2)**: before spawning each wave, check target file set intersections
  across all wave-candidate tasks. If two tasks' target file sets intersect, defer one to the next
  wave.

**Escalation serialization**: on SubagentStop, pause wave dispatch. Spawn the relevant HOW
subagent for diagnosis (engineer → architect, writer → strategist, researcher → postdoc,
tester → architect). After HOW returns, re-delegate to a fresh subagent. Then resume wave
dispatch. Maximum 1 HOW + 1 re-delegation per failed task before escalating to user.
```

### §4.3 `manifest.json` body_hash recalculation

The `body_hash` fields for `skills/nx-plan` and `skills/nx-run` in `manifest.json` must be recomputed after the body content changes described in §4.1 and §4.2 are applied. The SHA-256 hash is computed on the updated body text (original prose with proposed changes applied). The exact hash values cannot be computed in this proposal — **recalculation required by nexus-core maintainer** after final body content is confirmed.

All other `body_hash` entries in `manifest.json` are unchanged.

### §4.4 `vocabulary/harness_keys.yml` addition (proposed)

If nexus-core accepts this proposal, it may be appropriate to add a new key to `vocabulary/harness_keys.yml` to allow consumer harnesses to inject harness-local parallel dispatch documentation (analogous to the `resume_invocation` key proposed in CA-7).

Proposed addition:

```yaml
  - id: run_parallel_dispatch
    description: >
      Harness-local documentation for parallel dispatch implementation details.
      Consumers may inject harness-specific wave management, subagent spawn primitive syntax,
      or cap enforcement mechanics at this marker.
    max_lines: 40
    max_bytes: 3072
```

This addition is conditional on the harness_keys.yml mechanism (CA-7) being accepted first. If CA-7 is not yet accepted, this entry is deferred.

---

## §5 Reference Implementation (Claude Code harness)

This section describes the local implementation work required on the claude-nexus (Claude Code) harness side to fully realize the spec defined in §3 and §4. nexus-core does not need to reproduce any of this — it is entirely claude-nexus's responsibility. The same behavioral spec can be implemented by opencode-nexus using its own hook system.

### §5.1 Pair-wise dispatch — subagent spawn primitive pattern

In the Claude Code harness, pair-wise streaming is implemented by holding the `agentId` of each DO subagent (returned by `Agent(...)`) and spawning the paired CHECK subagent in a follow-up `Agent(...)` call when the DO agent's result is received.

Abstract pattern (harness-neutral):

```
for each DO task in current wave:
  doAgentId = spawn_subagent_primitive(owner=task.owner, prompt=...)
  store (doAgentId, paired_check_task) in wave registry

on subagent_completion_event(doAgentId):
  if in_flight_count < cap:
    spawn_subagent_primitive(owner=check_task.owner, prompt=..., context=do_result)
  else:
    enqueue(check_task) for next available slot
```

In the Claude Code harness specifically, `spawn_subagent_primitive` maps to `Agent(...)`. The pairing logic runs in Lead's orchestration loop between `Agent()` calls. The `SendMessage(...)` primitive is used for resume dispatch (see SKILL.md Resume Invocation section), not for initial pair spawn.

### §5.2 TaskCreate wave_id metadata labeling

When registering tasks via `TaskCreate(...)` (the Claude Code task registration primitive), include a `wave_id` label in the subject field. This enables the TUI grouping described in §3.7.

Pattern:

```
TaskCreate({ subject: "[wave:1] engineer: update gate.ts dispatch logic" })
TaskCreate({ subject: "[wave:1] tester: verify gate dispatch" })
TaskCreate({ subject: "[wave:2] writer: update orchestration.md" })
```

`wave_id` is assigned at Step 1.5 (task registration), not at Step 2 (spawn). A task's `wave_id` reflects its planned execution wave, which may differ from its actual spawn order if the cap forces deferral.

### §5.3 tool-log.jsonl wave size logging

After each wave completes, Lead writes a structured entry to `.nexus/state/claude-nexus/tool-log.jsonl` recording wave metadata. This data feeds the cap recalibration review described in §3.5.

Entry schema (one JSON object per line):

```json
{
  "event": "wave_complete",
  "cycle": "<cycle_id>",
  "wave_id": 1,
  "wave_size": 3,
  "task_ids": [1, 2, 3],
  "owner_types": ["engineer", "engineer", "tester"],
  "peak_inflight": 3,
  "completed_at": "<iso8601>"
}
```

After 3–5 cycles, Lead reviews these entries to assess whether cap=5 is correctly sized. If `peak_inflight` never exceeds 3 across all waves, a downward cap revision proposal may be warranted.

### §5.4 nx-plan:auto dedup final pass

In `[plan:auto]` mode, HOW subagents decompose tasks in parallel. Two HOW agents may independently produce tasks targeting the same file without knowledge of each other's output. Layer 1 dedup (§3.6) runs after HOW agents complete, before tasks.json is written.

Implementation in nx-plan:auto Step 5 (plan document generation): after collecting all HOW-proposed task lists, merge them into a single candidate list. For each pair of tasks whose `target_files` sets intersect, apply `same_file_bundle`: merge into a single task with the structured prompt pattern from exception §3.4. Record the merge in the merged task's `context` field. Only then write to tasks.json.

This pass is not required in interactive plan mode because Lead synthesizes tasks sequentially and can catch overlaps as it goes. It is mandatory in auto mode where parallel HOW decomposition introduces structural overlap risk.

---

## §6 Questions for nexus-core Maintainer

**(a) Primitive vocabulary for "in-flight count"**: §3.5 defines cap=5 in terms of in-flight subagent count. The neutral body should reference an abstract "subagent spawn primitive" count. Does nexus-core want to define a canonical vocabulary term for "in-flight subagent" in `vocabulary/capabilities.yml` or a new vocabulary file, or should the body use plain prose? A vocabulary term would allow consumer harnesses to resolve it to their specific concurrency primitive (e.g., Claude Code's `Agent()` call count vs opencode-nexus's equivalent).

**(b) Exception catalog placement**: the proposal places the exception catalog inline in `body.md`. An alternative is to define it in a separate vocabulary file (`vocabulary/task_exceptions.yml`) and reference it from the body. Which approach better fits nexus-core's vocabulary architecture? The inline approach is simpler for a first iteration; the vocabulary approach is more extensible if additional exception types are anticipated.

**(c) `same_file_bundle` structured prompt format**: §3.4 states that merged sub-tasks are delivered via "a structured prompt listing each sub-task's requirements." The proposal does not specify the exact format of this structured prompt, as the format is partly harness-dependent (Claude Code uses a TASK/CONTEXT/ACCEPTANCE template in nx-run's Structured Delegation section). Should nexus-core define a canonical structured prompt schema for bundled tasks, or leave it to consumer harnesses?

**(d) Drain wave declaration requirement**: §3.5 requires drain wave tasks to be declared at task generation time in the `approach` field. This places a constraint on plan Step 7 that is not currently enforced by any schema. Should `tasks.json` schema include a `dispatch_mode` field (`"streaming"` | `"drain"`) to make this machine-readable? Or is prose annotation in the `approach` field sufficient for the current iteration?

**(e) Cap recalibration ownership**: §3.5 states that downward revision of cap=5 is permitted after 3–5 cycles of data. Who owns this revision — the nexus-core maintainer (requiring a new upstream proposal and body_hash update) or the consumer harness (local policy)? If the cap is defined in nexus-core's body, any change requires an upstream proposal. If nexus-core provides only the recalibration trigger rule and consumers own the cap value, consumers can adjust without upstream coordination.

**(f) Dedup Layer 1 trigger point in HOW-assisted decomposition**: §3.6 states that Layer 1 dedup runs after HOW agents complete in plan Step 7. In interactive mode, Lead synthesizes HOW proposals sequentially and can catch overlaps during synthesis. In auto mode, HOW agents run in parallel. Should the body specify that Layer 1 is mandatory in auto mode and optional (Lead's judgment) in interactive mode? Or should it be mandatory in both modes for consistency?

**(g) wave_id as tasks.json first-class field**: §5.2 describes `wave_id` as a label in the task registration primitive (Claude Code: `TaskCreate` subject). Should `wave_id` be a first-class field in the `tasks.json` schema, allowing Layer 2 dedup (run Step 2) to reference pre-planned wave assignments? Or should it remain a presentation artifact in the task registration primitive only, keeping tasks.json schema minimal?

---

## §7 Compatibility Notes

### §7.1 Markdown/render impact

All proposed body.md changes are prose additions and table additions to existing sections. No new heading levels are introduced, no existing headings are removed, and no code block syntax changes are made. The changes render correctly in GitHub markdown, VS Code preview, and Claude Code skill display. No consumer-side rendering changes are required.

### §7.2 Sibling release window (opencode-nexus)

opencode-nexus is currently migrating to nexus-core as its base. The proposed body.md changes add normative guidance text that opencode-nexus must implement to comply with the spec. opencode-nexus's implementation schedule is independent: the updated body.md will be visible to opencode-nexus operators as documentation of the intended behavior, and opencode-nexus can implement the cap, dispatch model, and dedup passes on its own schedule.

The proposed `vocabulary/harness_keys.yml` addition in §4.4 (conditional on CA-7) follows the same sibling release window policy as CA-7 §8.2: if nexus-core adds the marker, opencode-nexus receives an invisible HTML comment until it implements the injection. No coordination is required between claude-nexus and opencode-nexus.

### §7.3 body_hash integrity

As noted in §4.3, editing `skills/nx-plan/body.md` and `skills/nx-run/body.md` changes their SHA-256 `body_hash` values. Any consumer pinned to the current nexus-core version will fail `verifyBodyHash` when consuming the updated package. This is a breaking change at the hash-check boundary, per the precedent established in CA-7 §8.4.

The recommended response is a semver major bump of nexus-core accompanied by a `CHANGELOG.md` "Consumer Action Required" section. See §8 for the full assessment.

---

## §8 Breaking Change Assessment

Per nexus-core primer §5.1 (Forward-only schema relaxation — breaking changes are permitted in the 1-person dogfooding phase), editing existing `body.md` files and updating `manifest.json` `body_hash` fields constitutes a breaking change at the integrity-check boundary.

**Files modified**: `skills/nx-plan/body.md`, `skills/nx-run/body.md`, `manifest.json`.

**Nature of break**: any consumer whose build pipeline calls `verifyBodyHash` on the updated package will fail hash verification because the body content has changed. This is the intended behavior of the integrity check — it signals that the deployed skill body has diverged from what the consumer's build last validated.

**Consumer Action Required**:

1. Update pinned `@moreih29/nexus-core` version to the new semver major version.
2. Re-run the consumer's build pipeline (`bun run dev` for claude-nexus). Build will re-verify the new `body_hash` values from the updated `manifest.json`.
3. Review the body changes against any consumer-local overrides or `HARNESS:*` injection content to confirm no conflicts with the new body structure.
4. For opencode-nexus: same steps. If the `run_parallel_dispatch` HARNESS marker (§4.4) is added, the unhandled marker will produce a `[HARNESS] unhandled marker` warning (not a build failure) until opencode-nexus implements the injection.

No schema changes to `plan.json` or `tasks.json` are required by this proposal alone. The `wave_id` field (§6(g)) is a potential future schema addition, not required for the body.md guidance changes.

---

## §9 GitHub Issue Title Candidates

The following are proposed titles for the `gh issue create` command. Lead will select one after review.

1. `feat(skills): quantitative task granularity + parallel dispatch guidelines for nx-plan/nx-run`
2. `proposal: artifact-coherence metric, cap=5 dispatch, and exception catalog for nx-plan Step 7 + nx-run Step 2`
3. `feat: Plan/Run quantitative guidelines — thresholds, pair-wise streaming, dedup 2-layer`
4. `feat(skills/nx-plan,nx-run): conditional auto-pairing, cap=5 hard, pair-wise streaming dispatch`
5. `proposal(body): task decomposition + parallel dispatch quantitative spec (Plan session #7)`

---

*Document version: Plan #7, 2026-04-16. Reviewer verification pending (Task #3). nexus-core response pending.*
