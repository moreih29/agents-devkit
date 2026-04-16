# Upstream Issue Proposal: Memory Operational Policy + Access Tracking Spec

**Date**: 2026-04-16
**Author**: claude-nexus maintainer (Plan session #7)
**Target**: `@moreih29/nexus-core` maintainer
**Status**: Submitted — awaiting nexus-core maintainer response
**Plan session**: #7 (topic: "claude-nexus orchestration 가이드 공백 정리")
**Upstream link**: https://github.com/moreih29/nexus-core/issues/20
**Sibling proposal**: Proposal A (Plan/Run Quantitative Guidelines) — [nexus-core#19](https://github.com/moreih29/nexus-core/issues/19)

<!-- 주: external-* prefix proposal 성격상 일반 80줄 상한 예외 적용 (Plan #7 Issue #3.1) -->

---

## §1 Summary

This proposal asks nexus-core to establish two complementary canonical policies for the `.nexus/memory/` layer: a **Memory Operational Policy** (naming conventions, category taxonomy, size limits, merge criteria, and automatic gc triggers) and a **Memory Access Tracking Spec** (which file-read primitives to observe, what fields to persist, and how forgetting is triggered).

The immediate motivation is a structural gap in nexus-core's knowledge-management guidance. The current orchestration primer states only one principle — "store only what cannot be recovered from code or the web" — but provides no naming scheme, no category definitions, no size discipline, and no mechanism for identifying which stored memories have become stale. Consumer harnesses (claude-nexus, opencode-nexus) have been filling this gap locally, creating divergence risk. Canonicalizing both policies in nexus-core ensures all consumers operate on the same memory hygiene model.

nexus-core is asked to: (a) evaluate whether the Memory Operational Policy and Access Tracking Spec designs are acceptable as described in §3 and §4; (b) add `vocabulary/memory_policy.yml` as the canonical machine-readable schema for these policies; (c) optionally reference the schema from relevant skill or orchestration documents at the location specified in §5.2; and (d) discuss whether `manifest.json` should record the sha256 of `memory_policy.yml` as described in §5.3.

---

## §2 Background

### §2.1 Current state of `.nexus/memory/` — ten files, four natural categories

claude-nexus's `.nexus/memory/` directory currently contains ten files that arose organically over approximately sixty development cycles. Reviewing their content reveals four natural groupings:

| Natural category | Example files |
|---|---|
| Empirically verified findings (hook payloads, resume mechanics, theory) | `hook-payload-notebookedit-gotcha.md`, `subagent-resume.md`, `persistence-surface-theory.md` |
| External constraints and upstream references (SDK limits, nexus-core gaps) | `agent-sdk-constraint.md`, `upstream-issue-harness-extension.md`, `nexus-core-validator-upstream-gap.md` |
| Operational patterns (cycle structure, task routing, carryover) | `cycle-split-pattern.md`, `refactor-carryover.md`, `tester-artifact-gap.md` |
| Primer / summary document | `nexus-ecosystem-primer.md` (169 lines — the single session-0 orientation document) |

These categories emerged without guidance. No naming convention was ever specified: files named themselves by whatever the storing agent chose. No size limit was enforced. No merge rule existed. The primer has grown to 169 lines with no upper bound defined. There is no record of when any file was last read, and no mechanism to identify files that have accumulated without ever being consulted again.

### §2.2 The existing principle is necessary but not sufficient

`context/orchestration.md` §"지식 관리 철학" states:

> "코드/웹에서 다시 얻을 수 없는 것만 저장한다." (Store only what cannot be recovered from code or the web.)

This principle is correct and should be preserved. It is, however, a content-admission criterion only. It answers "what is worth saving?" but leaves open:

- How should the file be named so a future agent can predict what it contains?
- What category does this memory belong to, and does a file for this category already exist?
- When should a file be split or merged?
- How large may a single file grow before it imposes context-window cost without proportional benefit?
- When has a memory become stale enough to remove?

Without answers to these questions, the memory layer degrades slowly: files grow unbounded, naming becomes inconsistent across sessions, and stale entries occupy context-window budget in every future [sync] or [m:gc] invocation.

### §2.3 Tag-processing gap: `[m]` and `[m:gc]` operate without policy

The current claude-nexus gate.ts hook (L410–434) processes two memory tags:

- `[m]` injects the instruction: "압축·정제하여 `.nexus/memory/{적절한_토픽}.md`에 Write로 저장하라" (compress, refine, and write to `.nexus/memory/{appropriate_topic}.md`).
- `[m:gc]` injects the instruction: "Glob으로 확인하고 병합/삭제하여 정리하라" (glob, merge or delete to clean up).

Both instructions are directive but policy-free. The `[m]` handler does not specify naming conventions, category prefixes, or size limits. The `[m:gc]` handler does not specify merge criteria, gc trigger thresholds, or how to determine which files are stale. The stored content quality therefore depends entirely on the individual agent's judgment at the moment of saving — which varies across sessions and across agents.

This gap is not a claude-nexus implementation defect. It is an authoring gap in the upstream orchestration spec: nexus-core defines the `[m]` and `[m:gc]` tags in `vocabulary/tags.yml` but does not document what policy the storing agent should follow. Fixing it at the harness level in gate.ts without an upstream canonical definition would create the same divergence problem that Proposal A (Plan/Run guidelines) addresses for `skills/nx-plan/body.md` and `skills/nx-run/body.md`.

### §2.4 Why this should be a nexus-core canonical policy

Three harness-neutral properties make this the right place:

1. **Both known consumers share the `.nexus/memory/` structure.** nexus-core defines this directory in its orchestration model. Both claude-nexus and opencode-nexus inherit it. A naming or merge policy defined only in claude-nexus would silently diverge from whatever opencode-nexus independently develops.

2. **The `[m]` and `[m:gc]` tags are nexus-core vocabulary.** `vocabulary/tags.yml` is nexus-core's authoritative tag registry. The behavioral policy that those tags invoke belongs adjacent to the tag definitions, not buried in consumer hook code.

3. **The access tracking spec describes which observation primitive to use — a harness-neutral concept.** Different harnesses use different hook systems (PostToolUse in Claude Code, an analogous event in opencode), but they observe the same abstract event: "an agent read a memory file." The canonical spec can define the abstract event; each harness maps it to its own primitive. This is the same abstraction axis that `vocabulary/capabilities.yml` uses for tool permissions.

---

## §3 Proposed Design: Memory Operational Policy

### §3.1 Categories

Four categories are proposed. Each category maps to a required filename prefix:

| Prefix | Meaning | Typical content |
|---|---|---|
| `empirical-` | Empirically verified findings | Hook payload field names confirmed by live testing, subagent resume mechanics, behavioral observations that cannot be inferred from documentation alone |
| `external-` | External constraints and upstream references | SDK version constraints, nexus-core upstream proposals (this file), third-party API limits, official documentation quotations |
| `pattern-` | Operational patterns | Cycle split heuristics, task routing decisions, carryover checklists, recurring orchestration recipes |
| `primer-` | Project orientation summary | High-level overview of the project's architecture, decision history, and operating model. Maximum one primer file per project. |

These four categories cover the full range of memory content observed across sixty development cycles in claude-nexus. They are mutually exclusive (a given memory fits exactly one) and collectively sufficient (no observed memory was unclassifiable).

### §3.2 Naming convention

```
{prefix}-{topic-2to4-words}.md
```

- `prefix` is one of the four values in §3.1, lowercase.
- `topic` is 2–4 kebab-case words that describe the subject. Do not include the prefix meaning in the topic (e.g., `empirical-hook-payload-fields.md`, not `empirical-empirical-hook-observation.md`).
- Full filename is lowercase kebab-case throughout.
- No version numbers or dates in filenames. Temporal information belongs inside the file.

Valid examples:
- `empirical-hook-payload-fields.md`
- `external-upstream-harness-extension.md`
- `pattern-cycle-split-heuristics.md`
- `primer-project-overview.md`

### §3.3 Size limits

| File type | Line limit |
|---|---|
| General files (empirical, external, pattern) | 80 lines |
| Primer | 200 lines |

When a file reaches its limit on a `[m]` save, the storing agent must split it into two files before saving new content. Both resulting files must individually satisfy the size limit. The split point should be at a natural topic boundary.

The primer limit is higher because it serves as the project-entry document: compressing it below 200 lines typically loses orientation value. If the primer exceeds 200 lines, it should be split into a shorter primer plus one or more `pattern-` or `empirical-` files that absorb the detailed content.

A maximum of **one** primer file is permitted per project. If a second primer candidate arises, its content must be absorbed into the existing primer (if below limit) or trigger a split that moves detailed content to the appropriate non-primer category.

### §3.4 Merge criteria

When a `[m]` save event occurs, the storing agent must check for merge eligibility before creating a new file:

**Merge default**: If an existing file shares (a) the same prefix and (b) two or more topic keywords with the candidate topic, the agent should merge the new content into the existing file rather than create a new one.

Topic keywords are the individual words in the topic portion of the filename (e.g., `hook`, `payload`, `fields` for `empirical-hook-payload-fields.md`). A two-keyword overlap means two words from the candidate topic appear in the existing filename's topic segment.

If the merge would cause the target file to exceed its size limit (§3.3), the agent splits the merged result before saving.

If no existing file meets the merge threshold, create a new file following the naming convention in §3.2.

### §3.5 Automatic gc triggers

A gc pass (equivalent to a `[m:gc]` invocation) should be triggered automatically when any of the following conditions is met:

| Condition | Threshold |
|---|---|
| File count | More than 15 files in `.nexus/memory/` (i.e., 16 or more) |
| Total directory size | More than 60 KB |
| Cycles since last gc | More than 20 cycles |

"Cycles" refers to the cycle counter in `state/history.json` (each completed plan→run→close sequence increments the counter). Harnesses that track cycle count in `history.json` can detect this trigger at `[m]` time by comparing the current cycle number to the stored last-gc cycle number.

The gc pass should:
1. List all memory files with their line counts and last-accessed dates (from access tracking, §4).
2. Identify candidates for merge (§3.4 criteria) and present them for agent confirmation.
3. Identify candidates for deletion (§4.3 forgetting policy) and present them for agent confirmation.
4. Execute confirmed merges and deletions, recording the operation in the access tracking log (§4.2).

---

## §4 Proposed Design: Access Tracking

### §4.1 Observation scope — file-read events only

Access tracking observes **file-read events** directed at `.nexus/memory/` files. File-write events (creating or updating a memory file) are excluded from access tracking; the `[m]` tag pipeline already records the write event implicitly. Directory-scan events (pattern matching, content search) are also excluded: an agent scanning `.nexus/memory/` with a glob or grep is not confirming the file's content is valid for its purpose — only that the file exists or contains a keyword.

**Rationale (as stated by the project maintainer)**: "실제로 그 파일을 읽었는지가 메모리의 유효성을 나타낸다" — whether an agent actually read the file is the signal that the memory is still being used. A file that has never been fully read since creation, or has not been read in a long time, is a candidate for forgetting regardless of whether it has been mentioned in passing or appeared in a glob result.

File-read observation must be scoped to the `.nexus/memory/` path prefix. Reads of other `.nexus/` subdirectories, source files, or configuration files are not tracked.

### §4.2 Storage schema

Access records are stored in a harness-local JSONL file. The canonical path pattern is:

```
.nexus/state/{harness_id}/memory-access.jsonl
```

where `{harness_id}` is the harness's registered identifier (e.g., `claude-nexus`, `opencode-nexus`). This follows the harness-local namespace convention established in nexus-core 0.8.0 §"Shared filename convention" (same pattern as `agent-tracker.json` and `tool-log.jsonl`).

Each line in the JSONL is one JSON object with the following fields:

| Field | Type | Description |
|---|---|---|
| `path` | string | Absolute path to the memory file that was read |
| `last_accessed_ts` | ISO 8601 string | Timestamp of the most recent read event |
| `access_count` | integer | Total number of read events recorded for this file since tracking began |
| `last_agent` | string | Agent identifier (`agent_id` or agent name) that performed the most recent read |

Records are upserted by `path`: if the file has been read before, the existing record is updated in place rather than a new line appended. The JSONL file therefore contains at most one record per memory file.

### §4.3 Forgetting policy — P4 manual gate + P1 automatic deletion

Two forgetting policies operate together. A file is deleted only when it satisfies **both** policies simultaneously (intersection, not union):

**P4 — Manual gate (`[m:gc]` invocation)**

When `[m:gc]` is invoked, the gc pass reads `memory-access.jsonl` and identifies files with `access_count = 0` (never read since tracking began) or files whose `last_accessed_ts` is older than the P1 threshold. These files are presented to the agent as a "proposed deletion list" with a confirmation prompt: "삭제할까요?" (Shall I delete these?). Deletion does not proceed without agent confirmation.

**P1 — Automatic deletion (all three conditions met simultaneously)**

A memory file is eligible for automatic deletion — without a `[m:gc]` invocation — when all three of the following conditions are true at the same time:

1. The file has not been read for **180 or more days** (based on `last_accessed_ts`, or creation date if no access record exists).
2. The file has not been read in the past **6 or more cycles** (based on cycle counter in `history.json`).
3. The file's `access_count` is **0** (it has never been read since access tracking was enabled for this project).

Condition 3 ensures that files which were actively used before access tracking was introduced are not automatically deleted solely on the basis of age: they lack an access record, but that absence is not evidence of non-use. The automatic deletion path applies only to files that have demonstrably never been read since tracking began.

When P1 triggers, the deletion should be recorded as a git commit (see §6.4 for the commit message pattern). Recovery via `git log` and `git show` is always possible; no separate archive folder is required.

### §4.4 Effect of agent resume on access tracking

When an agent session is resumed via the harness's resume mechanism, the resumed agent reconstructs its working state from the prior conversation transcript rather than by re-reading files. As a result, a resumed agent may use knowledge from a memory file without issuing a new file-read event in the resumed session.

This proposal treats resumed agents conservatively: **a resumed session that does not issue a new file-read event does not increment `access_count` or update `last_accessed_ts`**. The memory file's access record is not updated on the basis of inferred use.

This conservative policy may produce false negatives (treating a memory as unread when it was in fact consulted via the resumed transcript). The tradeoff is accepted: a false negative at worst delays deletion by one gc cycle, whereas a false positive (treating a resumed consultation as a fresh read) would mask stale memories and undermine the forgetting policy's effectiveness.

---

## §5 Scope of Change in nexus-core

### §5.1 New file: `vocabulary/memory_policy.yml`

The following YAML schema is proposed. The top-level structure follows the same pattern as `vocabulary/capabilities.yml` and `vocabulary/tags.yml` (root keys grouping a list of entries, each entry with `id`/`description` fields).

```yaml
# vocabulary/memory_policy.yml
# Canonical memory operational policy for the .nexus/memory/ layer.
# All consumer harnesses that implement [m] and [m:gc] tag handling
# should follow these definitions.

categories:
  - id: empirical
    prefix: empirical-
    description: >
      Empirically verified findings — hook payload structures confirmed by live
      testing, subagent behavioral observations, runtime measurements. Content
      here cannot be recovered from documentation or source code alone.
    size_limit_lines: 80

  - id: external
    prefix: external-
    description: >
      External constraints and upstream references — SDK version requirements,
      upstream nexus-core proposals, third-party API limits, official
      documentation quotations relevant to the project.
    size_limit_lines: 80

  - id: pattern
    prefix: pattern-
    description: >
      Operational patterns — recurring orchestration recipes, cycle split
      heuristics, task routing heuristics, carryover procedures. Content that
      describes how the team works rather than what it has observed.
    size_limit_lines: 80

  - id: primer
    prefix: primer-
    description: >
      Project orientation summary — high-level architecture, decision history,
      and operating model for new sessions. At most one primer file per project.
    size_limit_lines: 200
    max_count: 1

policies:
  naming:
    pattern: "^(empirical|external|pattern|primer)-[a-z0-9]+(-[a-z0-9]+){1,3}\\.md$"
    description: >
      {prefix}-{topic-2to4-words}.md in kebab-case. Topic must be 2–4 words.
      No version numbers or dates in filename.

  merge:
    trigger: same_prefix_and_topic_keywords_gte_2
    description: >
      When a new memory save candidate shares (a) the same category prefix and
      (b) two or more topic keyword matches with an existing file, the default
      action is to merge the new content into the existing file rather than
      create a new file.

  gc_triggers:
    - condition: file_count_gt
      threshold: 15
      description: More than 15 files in .nexus/memory/ triggers a gc pass.
    - condition: total_size_kb_gt
      threshold: 60
      description: Total directory size exceeding 60 KB triggers a gc pass.
    - condition: cycles_since_last_gc_gt
      threshold: 20
      description: >
        More than 20 cycles elapsed since the last gc pass triggers a gc pass.
        Cycle count is read from state/history.json.

access_tracking:
  observation_primitive: file_read
  description: >
    Only file-read events directed at .nexus/memory/ files are tracked.
    File-write events, directory-scan events (glob, content search), and
    reads of other .nexus/ subdirectories are excluded.
  storage:
    path_pattern: ".nexus/state/{harness_id}/memory-access.jsonl"
    format: jsonl
    upsert_key: path
  fields:
    - name: path
      type: string
      description: Absolute path to the memory file that was read.
    - name: last_accessed_ts
      type: iso8601
      description: Timestamp of the most recent read event.
    - name: access_count
      type: integer
      description: Total read events recorded for this file since tracking began.
    - name: last_agent
      type: string
      description: Agent identifier of the most recent reader.
  forgetting:
    p4_manual:
      trigger: m_gc_invocation
      action: >
        Present files with access_count=0 or last_accessed_ts older than P1
        threshold as a proposed deletion list. Require agent confirmation
        before deletion.
    p1_automatic:
      trigger: intersection_of_all_three
      conditions:
        - not_accessed_days_gte: 180
        - not_accessed_cycles_gte: 6
        - access_count_eq: 0
      action: >
        Delete without [m:gc] invocation. Record deletion as a git commit.
        Recovery via git history. No archive folder required.
    resume_policy: >
      A resumed agent session that does not issue a new file-read event does
      not update access_count or last_accessed_ts. Conservative: inferred use
      via resumed transcript is not counted as access.
```

### §5.2 Reference in skill or orchestration documents

If nexus-core maintains a prose orchestration document (analogous to `context/orchestration.md` in consumer projects) that describes the `[m]` and `[m:gc]` tags, this proposal recommends adding a one-line reference to `vocabulary/memory_policy.yml` as the canonical policy source. The reference should appear in the section describing the knowledge management layer.

No skill body edits (`skills/*/body.md`) are required to implement this proposal. The policy is a vocabulary-layer definition, not an inline skill instruction. Consumer harnesses are responsible for translating the vocabulary definitions into their own `[m]`/`[m:gc]` handler instructions.

If nexus-core adds `memory_policy.yml` as a build-time dependency of the skill generation pipeline (e.g., to embed policy summaries into skill bodies via macro expansion), that is a separate decision and is not requested by this proposal.

### §5.3 `manifest.json` impact

Adding `vocabulary/memory_policy.yml` does not affect `body_hash` values in `manifest.json` (vocabulary files are not hashed as part of skill body integrity). However, this proposal raises the question of whether `manifest.json` should record a sha256 of `memory_policy.yml` — analogous to how it currently tracks skill body hashes — so that consumers can detect upstream policy updates at build time.

Recording the hash would allow consumer harnesses to alert maintainers when `memory_policy.yml` changes in a new nexus-core release, prompting them to review whether their `[m]`/`[m:gc]` handler implementations need updating.

This is an open question for the maintainer (see §8(c)).

---

## §6 Reference Implementation (Claude Code harness)

This section describes how claude-nexus would implement the canonical spec from §4 using its own hook system. **This is consumer-supplied logic and is not part of nexus-core.** It is included so the maintainer can evaluate whether the abstract spec in §4 is sufficiently precise to guide a concrete implementation.

opencode-nexus would implement the same spec using its own event system, as discussed in §7.1.

### §6.1 PostToolUse hook extension — Read tool observation

Claude Code's PostToolUse hook fires after every tool call. The following TypeScript pattern detects a `Read` event directed at a `.nexus/memory/` path and upserts the access record:

```typescript
// PostToolUse handler — memory access tracking
// Placed in gate.ts or a dedicated hook module.
//
// Field name reference (from hook-payload-notebookedit-gotcha.md):
//   event.tool_name     — PascalCase tool name: "Read", "Edit", "Write", "NotebookEdit"
//   event.tool_input.file_path — path field for Read, Edit, Write
//   event.tool_input.notebook_path — path field for NotebookEdit (different field!)
//   event.agent_id      — present only in subagent context; absent for Lead direct calls
//
// NotebookEdit uses notebook_path rather than file_path. It is also a write-type
// tool and therefore excluded from memory access tracking by spec (§4.1).

function handleMemoryAccessTracking(event: PostToolUseEvent): void {
  // Only Read events are in scope (§4.1)
  if (event.tool_name !== 'Read') return;

  const filePath: string | undefined = event.tool_input?.file_path;
  if (!filePath) return;

  // Only track reads within .nexus/memory/
  const memoryDir = path.join(projectRoot, '.nexus', 'memory');
  if (!filePath.startsWith(memoryDir)) return;

  // Lead direct reads are also tracked:
  //  agent_id is absent for Lead calls (snake_case, subagent context only).
  //  Memory access validity depends on *actual file reads* regardless of caller
  //  (Plan session #7, Issue #3.2 decision: "실제로 그 파일을 읽었는지가 메모리의 유효성을 나타낸다").
  //  This intentionally diverges from hook-payload-notebookedit-gotcha.md's
  //  canonical pattern (which recommends skip for Edit/Write tracking),
  //  because memory access tracking has different policy goals than file edit logging.
  const agentId: string = event.agent_id ?? 'lead';
  const accessLogPath = path.join(
    projectRoot, '.nexus', 'state', 'claude-nexus', 'memory-access.jsonl'
  );

  // Read existing records, upsert by path
  const records = loadAccessLog(accessLogPath); // Map<path, AccessRecord>
  const existing = records.get(filePath);

  const updated: AccessRecord = {
    path: filePath,
    last_accessed_ts: new Date().toISOString(),
    access_count: (existing?.access_count ?? 0) + 1,
    last_agent: agentId,
  };

  records.set(filePath, updated);
  saveAccessLog(accessLogPath, records);
}
```

`loadAccessLog` reads the JSONL file and builds a `Map<string, AccessRecord>`. `saveAccessLog` rewrites the JSONL file from the map (one JSON object per line). These are standard JSONL upsert helpers.

### §6.2 `[m]` handler extension — automatic gc trigger check

The current `[m]` handler in gate.ts (L410–434) injects a save instruction with no gc awareness. To implement the automatic gc trigger from §3.5, the handler should check gc conditions before injecting the save instruction:

```typescript
// Called inside the [m] handler, before injecting the save context
async function checkGcTriggers(): Promise<string | null> {
  const memoryDir = path.join(projectRoot, '.nexus', 'memory');
  const files = await glob('*.md', { cwd: memoryDir });
  const totalBytes = await sumFileSizes(memoryDir, files);
  const cyclesSinceLastGc = await getCyclesSinceLastGc(); // reads history.json

  if (
    files.length > 15 ||
    totalBytes > 60 * 1024 ||
    cyclesSinceLastGc > 20
  ) {
    return `<nexus>주의: memory gc 트리거 조건 충족 (파일 수: ${files.length}, 총 크기: ${Math.round(totalBytes/1024)}KB, 마지막 gc로부터 ${cyclesSinceLastGc} cycles). 저장 후 [m:gc]를 실행하여 정리를 권장한다.</nexus>`;
  }
  return null;
}
```

The gc trigger hint is prepended to the save instruction so the agent sees it before writing.

### §6.3 `[m:gc]` handler extension — access log reference + deletion approval UX

The current `[m:gc]` handler instructs the agent to "Glob, merge/delete." The extended handler should provide access log data directly:

```
<nexus>Memory GC mode.

1. List all .nexus/memory/ files with: line count, last_accessed_ts, access_count
   (read from .nexus/state/claude-nexus/memory-access.jsonl).

2. Merge candidates: files sharing the same prefix + 2+ topic keyword overlap.
   Present list — ask user to confirm each merge.

3. Deletion candidates (P4 gate): files where access_count = 0 OR
   last_accessed_ts is more than 180 days ago AND cycles since last read ≥ 6.
   Present list as "삭제할까요?" — do NOT delete without user confirmation.

4. Execute confirmed operations. For each deletion, run:
   git rm .nexus/memory/{filename}
   git commit -m "memory(gc): auto-delete stale {filename} [P4 confirmed]"
</nexus>
```

### §6.4 P1 automatic deletion — git commit log pattern

When P1 automatic deletion triggers (all three conditions met simultaneously, §4.3), the deleting operation should record a standardized commit:

```
memory(gc): auto-delete {filename} [P1: {days}d / {cycles}c / access=0]

Deleted by P1 automatic forgetting policy.
- Last accessed: {last_accessed_ts or "never"}
- Days since last access: {days} (threshold: 180)
- Cycles since last access: {cycles} (threshold: 6)
- Access count since tracking enabled: 0

Recovery: git show HEAD:{original_path}
```

The `Recovery:` line ensures any future agent can find the deleted file without knowing the exact commit hash.

---

## §7 Compatibility Notes

### §7.1 opencode-nexus — different hook system, same policy compliance

opencode-nexus uses its own event system rather than Claude Code's PostToolUse hook. The canonical spec in §4 is defined in terms of the abstract "file-read observation primitive" rather than PostToolUse or any Claude Code-specific field name. opencode-nexus can comply with the same spec by:

1. Identifying the equivalent event in its hook system that fires after an agent reads a file.
2. Extracting the file path and agent identifier from that event's payload (field names will differ from Claude Code's `event.tool_input.file_path` and `event.agent_id`).
3. Writing to `.nexus/state/opencode-nexus/memory-access.jsonl` with the same four-field schema.
4. Implementing the same P4/P1 forgetting thresholds when processing `[m:gc]`.

The harness-neutral policy (§3, §4) describes what to observe and what to store. The reference implementation (§6) shows how Claude Code does it. opencode-nexus maps the same contract to its own primitives.

If nexus-core adds a `<!-- HARNESS:memory_access_tracking -->` marker to a relevant skill body in a future release, each harness could inject its own concrete hook invocation syntax at that point — following the same HARNESS:* extension point pattern established by Proposal A (harness-extension proposal, CA-7).

### §7.2 Existing ten claude-nexus memory files — naming migration deferred

The ten existing claude-nexus memory files do not currently follow the `{prefix}-{topic}` naming convention proposed in §3.2. For example, `hook-payload-notebookedit-gotcha.md` would become `empirical-hook-payload-notebookedit.md`, and `cycle-split-pattern.md` would become `pattern-cycle-split-heuristics.md`.

**This renaming is out of scope for this proposal.** It will be handled in a separate migration cycle after this proposal is reviewed and accepted. Renaming before acceptance would create churn if the naming convention changes during review. The existing files continue to operate under their current names until the migration cycle runs.

### §7.3 Primer file migration — deferred

`nexus-ecosystem-primer.md` (169 lines) is currently stored in `.nexus/memory/` but has the character of a `context/` document: it describes the project's architecture and design philosophy rather than empirically derived findings. A future migration cycle will evaluate whether it should be renamed to `primer-project-overview.md` (remaining in `memory/`) or promoted to a `context/` document under a different name.

**This migration is out of scope for this proposal.** The primer file continues to operate in its current form until the migration cycle runs.

---

## §8 Questions for nexus-core Maintainer

**(a) Schema fit with existing vocabulary files**

The proposed `vocabulary/memory_policy.yml` uses root keys `categories:`, `policies:`, and `access_tracking:` with nested lists of entries. Does this top-level structure align with the conventions of `vocabulary/capabilities.yml`, `vocabulary/tags.yml`, and `vocabulary/harness_keys.yml`? If those files use a different structural pattern (e.g., a single flat list under one root key, or a different field naming style such as camelCase rather than snake_case), the schema in §5.1 should be adjusted before the file is committed. The proposal's author does not have current read access to the vocabulary files to cross-check this directly.

**(b) "Maximum one primer file" — harness-neutral or harness-specific?**

The `max_count: 1` constraint on the primer category (§3.1, §3.3) reflects the operating model of a single-team project where one orientation document suffices. Is this constraint appropriate as a nexus-core canonical rule, or should it be a per-harness configuration? A multi-team deployment of nexus-core might legitimately want multiple primer files (one per team or one per workstream). If the rule should be configurable, `memory_policy.yml` could express it as a default (`max_count: 1`) with a harness-override mechanism, similar to how harness capabilities override the capability defaults.

**(c) Access tracking spec: canonical vocabulary entry or auxiliary document?**

Should the access tracking spec (§4, §5.1 `access_tracking:` section) be part of `vocabulary/memory_policy.yml`, or should it be a separate auxiliary document (e.g., `vocabulary/memory_access_tracking.yml` or a prose document alongside the tags)? The spec is behavioral rather than purely definitional, which may make it a better fit for an operational guide than a vocabulary entry. The maintainer's preference on where behavioral specs live in the nexus-core repository would determine which file structure is correct.

**(d) P1 threshold values — appropriate defaults?**

The P1 automatic deletion thresholds (180 days / 6 cycles / access_count = 0) are proposed based on the claude-nexus operating cadence (~2–4 cycles per week). They are intended as defaults subject to re-calibration after 3 cycles of observation. Are these values appropriate as nexus-core canonical defaults, or should they be expressed as harness-configurable fields in `memory_policy.yml` with suggested defaults? For projects with faster or slower cycle cadences, a fixed 180-day threshold may be too aggressive or too conservative.

**(e) Relationship to `docs_only` exception in Proposal A**

Proposal A (Plan/Run quantitative guidelines) introduces a `docs_only` exception category for task decomposition — a task that touches only `.md` or frontmatter files may exceed the standard ≤3-file/≤150-line limits. Memory files in `.nexus/memory/` are `.md` files and would fall under `docs_only` by filename extension. Should the `docs_only` exception explicitly exclude `.nexus/memory/` files from its scope (since they are managed by the memory policy, not the task decomposition policy), or does the exception intentionally apply to memory file edits as well? Keeping the two policies in separate vocabulary files makes them independently versioned but creates a potential interpretive gap at the boundary.

---

## §9 GitHub Issue Title Candidates

The following are proposed titles for the `gh issue create` command. Lead will select one before submission.

1. `feat(vocabulary): memory_policy.yml — naming, categories, size limits, merge criteria, gc triggers`
2. `proposal: canonical memory operational policy + access tracking spec for .nexus/memory/`
3. `feat: introduce vocabulary/memory_policy.yml with 4-category taxonomy, size limits, and file-read access tracking`
4. `proposal(memory): operational policy + access tracking spec — Proposal B from Plan session #7`
5. `feat(vocabulary): memory_policy.yml — categorical naming, gc thresholds, and harness-neutral access tracking spec`

---

*Document version: Plan #7, 2026-04-16. nexus-core response pending.*
*Sibling: Proposal A (external-upstream-plan-run-guidelines.md) — Plan/Run quantitative guidelines.*
