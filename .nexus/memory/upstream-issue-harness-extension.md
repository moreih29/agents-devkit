# Upstream Issue Proposal: HARNESS:* Extension Point Mechanism

**Date**: 2026-04-11
**Author**: claude-nexus maintainer (Plan #4, session 2)
**Target**: `@moreih29/nexus-core` maintainer
**Status**: Draft — awaiting maintainer decision

---

## §1 Summary

This proposal asks nexus-core to introduce a lightweight extension point mechanism — the `HARNESS:*` marker convention — that allows consumer harnesses (claude-nexus, opencode-nexus) to inject harness-local content into neutral skill body files without violating the `body_hash` integrity guarantee or the harness-neutral authoring principle.

The immediate motivation is a documentation gap: Claude Code's subagent resume invocation syntax (`SendMessage` with `agentId`) is empirically verified and operationally important, but it lives only in claude-nexus's private dev memo because neutral skill bodies cannot reference a Claude Code-specific MCP tool. Operators using nx-run or nx-plan today have no in-skill documentation for resume dispatch.

The proposed mechanism is a single self-closing HTML comment marker (`<!-- HARNESS:resume_invocation -->`) placed in the body at a designated extension point. The consumer replaces it at build time with harness-local content. The pattern directly extends the existing capability abstraction axis (primer §3.4) and the SKILL_PURPOSE_OVERRIDE precedent (CA-2) to the body level.

nexus-core is asked to: (a) evaluate whether the design is acceptable, (b) add `vocabulary/harness_keys.yml` as the marker allowlist, (c) insert one marker into `skills/nx-run/body.md` and one into `skills/nx-plan/body.md`, and (d) recalculate `body_hash` for the two edited files in `manifest.json`.

---

## §2 Background

### §2.1 The resume invocation gap

Claude Code subagent resume is feasible. It has been empirically verified (`.nexus/memory/subagent-resume.md`, 2026-04-09, updated 2026-04-10): a completed subagent can be revived via `SendMessage({to: agentId, ...})`, with full prior transcript intact. The critical detail — that `to` must be the UUID `agentId` returned by `Agent()`, not the agent `name`, and that `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` must be set — is documented only in that private dev memo.

The nx-run and nx-plan skill bodies describe orchestration workflows but say nothing about how Lead should re-invoke a completed subagent. An operator reading the skill body mid-session has no guidance.

### §2.2 Why neutral body cannot hold the answer

nexus-core is harness-agnostic by design (primer §1.1, §3.4). `SendMessage` is a Claude Code MCP bridge concept. Writing `SendMessage({to: agentId, ...})` into a neutral `body.md` would:

1. Introduce a Claude Code-specific tool reference into a document that opencode-nexus and future consumers also consume.
2. Produce incorrect documentation for any harness where `SendMessage` is not the resume mechanism.
3. Violate the neutral authoring principle that is nexus-core's core value proposition.

The gap is therefore structural: the need is real, the neutral body is the wrong place to fill it, and consumer harnesses cannot edit body files directly because `body_hash` in `manifest.json` is a build-time integrity check computed on the original nexus-core content.

### §2.3 Why a structured extension point rather than a workaround

claude-nexus already has a workaround pattern for frontmatter (CA-2: `SKILL_PURPOSE_OVERRIDE` hardcoded table). That workaround is acceptable for a 5-entry flat table. Body-level injection requires a more explicit, auditable contract because:

- The replacement happens inside a structured document (prose, not a metadata field).
- Multiple consumers may inject different content at the same marker.
- The injection must survive schema evolution of the surrounding body.
- Without an allowlist, a typo in a marker name would silently produce a broken document.

A formal extension point with an allowlist and well-defined failure policy is safer and more maintainable than a positional offset or regex-based patch.

---

## §3 Proposed Design

### §3.1 Connection to existing precedents

**Capability abstraction (primer §3.4)**: nexus-core already defines abstract capability strings (`no_file_edit`, `no_task_create`, `no_shell_exec`, etc.) that each harness resolves to its own tool namespace. The harness-neutral body references the abstract string; the harness supplies the concrete meaning. This proposal applies the same axis — neutral key, harness-local resolution — to body content rather than permission strings.

**SKILL_PURPOSE_OVERRIDE (CA-2)**: claude-nexus's `generate-from-nexus-core.lib.mjs` already overrides skill `purpose` frontmatter because the neutral `description` field is too long for harness display. This is the "neutral source + consumer override" pattern at the frontmatter level. This proposal extends the same pattern to the body level with a formal contract instead of a hardcoded table.

The HARNESS:* mechanism is not a new axis — it is a new slice of the same vocabulary abstraction that nexus-core already uses.

### §3.2 Marker convention

**New file**: `vocabulary/harness_keys.yml` — an allowlist of known HARNESS keys, at the same vocabulary layer as `vocabulary/capabilities.yml` and `vocabulary/tags.yml`.

Each key entry schema:

```yaml
# vocabulary/harness_keys.yml
keys:
  - id: resume_invocation
    description: >
      Harness-local syntax for resuming a completed subagent from within a skill body.
      Each consumer replaces this marker with its own tool invocation documentation.
    max_lines: 32
    max_bytes: 2048
```

**Marker form in `body.md`**: A self-closing single-line HTML comment.

```
<!-- HARNESS:resume_invocation -->
```

**Regex for consumer-side detection** (multiline, single-line match only):

```
^<!-- HARNESS:([a-z_][a-z0-9_]*) -->$
```

Block forms such as `<!-- HARNESS:xxx -->...<!-- /HARNESS -->` are explicitly **forbidden**. The marker must resolve to a single replaceable point; block delimiters create ambiguity about what the consumer is allowed to delete.

### §3.3 Failure policy (warn/throw split)

Two distinct failure modes require different responses:

| Scenario | Policy | Rationale |
|---|---|---|
| Key appears in `body.md` but NOT in `vocabulary/harness_keys.yml` | **throw** (build fail) | Almost certainly a typo. Fail fast. |
| Key appears in `body.md` AND in allowlist, but consumer has no content for it | **warn** + pass-through | Consumer may not have implemented this key yet (sibling release window). HTML comment is invisible in rendered markdown. |

Warning format (grep-friendly prefix):

```
[HARNESS] unhandled marker "resume_invocation" in skills/nx-run/SKILL.md
```

This split is important for the sibling release window: when nexus-core adds a new marker, opencode-nexus can publish a release that contains the marker (as an invisible HTML comment) before it implements the injection logic. The warn-only policy means opencode-nexus does not need to ship consumer logic on the same day nexus-core ships the marker.

### §3.4 Five integrity safeguards (consumer-side responsibility)

nexus-core defines the marker convention; consumers are responsible for enforcing these safeguards during their own build-time injection step.

1. **Self-closing single-line marker only.** Only the form `<!-- HARNESS:key -->` on its own line is recognized. Block forms are ignored and treated as unknown.

2. **Add-only, non-marker line preservation.** Consumer injection MUST NOT delete or mutate original non-marker lines. Verification: "the line set after replacement is a superset of the original line set minus the marker line itself."

3. **Injection content size limit.** Injected content must not exceed `max_lines` and `max_bytes` specified for the key in `harness_keys.yml`. Exceeding either limit causes a build failure.

4. **No recursion.** Injected content MUST NOT itself contain a `<!-- HARNESS:* -->` marker. Prevents recursive expansion.

5. **Consumer logs injection range.** Consumer must emit a log entry in the form `[HARNESS] <skill>: injected <key> (+N lines)` for each successful injection. This entry is verified in the consumer's e2e test suite.

### §3.5 Call-site timing in consumer `transformSkill`

The injection step runs **after `verifyBodyHash`** (so the integrity chain on the original nexus-core content is intact) and **before frontmatter assembly** (so the assembled SKILL.md reflects the final injected body). The `body_hash` in `manifest.json` is computed on the original nexus-core body; it is the consumer's responsibility to document that the deployed SKILL.md body diverges from the stored hash by exactly the declared injection.

---

## §4 Scope of Change in nexus-core

This section lists the concrete file additions and edits requested.

### §4.1 New file: `vocabulary/harness_keys.yml`

```yaml
# vocabulary/harness_keys.yml
# Allowlist of HARNESS:* extension point keys.
# Each consumer harness may inject content at these markers in skill body files.
# Keys not listed here are treated as typos and cause a build failure.
keys:
  - id: resume_invocation
    description: >
      Harness-local documentation for resuming a completed subagent.
      Consumers replace this marker with their own tool invocation syntax.
    max_lines: 32
    max_bytes: 2048
```

### §4.2 Edit: `skills/nx-run/body.md`

Inside the "Resume Dispatch Rule" section, add the following as the last line of that section:

```
<!-- HARNESS:resume_invocation -->
```

Exact placement: immediately after the last prose sentence in the Resume Dispatch Rule section, before the next section header. This positions the harness-local resume syntax exactly where an operator would look for it.

### §4.3 Edit: `skills/nx-plan/body.md`

Inside the "Resume Policy" section, add the following as the last line of that section:

```
<!-- HARNESS:resume_invocation -->
```

Same placement rationale as §4.2.

### §4.4 Edit: `manifest.json`

`body_hash` fields for `skills/nx-run` and `skills/nx-plan` must be recalculated after the marker lines are inserted. The SHA-256 hash is computed on the updated body content (original prose + the new marker line). All other hashes are unchanged.

**Note on agent body files**: This proposal does NOT recommend adding markers to any `agents/*/body.md` files. Agent bodies describe the agent's own role and operating constraints; they are not the right location for Lead's orchestration invocation syntax. The Resume Dispatch Rule and Resume Policy sections in nx-run and nx-plan are the canonical location for this information.

---

## §5 Consumer Side Reference (claude-nexus)

This section is provided so the maintainer can see the full design intent. nexus-core does not need to reproduce any of this code — it is entirely claude-nexus's responsibility.

### §5.1 Directory structure

```
harness-content/
  resume_invocation.md   <- content for HARNESS:resume_invocation
  (future keys here)
```

File presence acts as the "implemented" allowlist. No JS constant or registry needed. If a key appears in the body and the corresponding `.md` file does not exist under `harness-content/`, the consumer treats it as unhandled and emits the warning from §3.3.

### §5.2 `injectHarnessMarkers` pseudocode

```js
// Called in transformSkill(), after verifyBodyHash(), before frontmatter assembly
function injectHarnessMarkers(bodyText, skillId) {
  const MARKER_RE = /^<!-- HARNESS:([a-z_][a-z0-9_]*) -->$/gm;
  let result = bodyText;

  for (const match of bodyText.matchAll(MARKER_RE)) {
    const key = match[1];

    // Validate against allowlist (vocabulary/harness_keys.yml, loaded at build start)
    if (!allowedKeys.has(key)) {
      throw new Error(`[HARNESS] unknown key "${key}" in skills/${skillId}/body.md`);
    }

    const contentPath = join(__dirname, 'harness-content', `${key}.md`);
    let content;
    try {
      content = readFileSync(contentPath, 'utf8').trimEnd();
    } catch (e) {
      if (e.code === 'ENOENT') {
        console.warn(`[HARNESS] unhandled marker "${key}" in skills/${skillId}/SKILL.md`);
        continue; // pass-through: HTML comment survives, invisible in rendered output
      }
      throw e;
    }

    // Safeguard 4: no recursion
    if (/<!-- HARNESS:/.test(content)) {
      throw new Error(`[HARNESS] injected content for "${key}" contains a HARNESS marker`);
    }

    // Safeguard 3: size limit (limits from harness_keys.yml entry)
    const lines = content.split('\n');
    const keyMeta = allowedKeys.get(key);
    if (lines.length > keyMeta.max_lines || Buffer.byteLength(content) > keyMeta.max_bytes) {
      throw new Error(`[HARNESS] content for "${key}" exceeds size limit`);
    }

    result = result.replace(match[0], content);
    console.log(`[HARNESS] ${skillId}: injected ${key} (+${lines.length} lines)`);
  }

  // Safeguard 2: non-marker lines preserved
  // (set-inclusion check omitted for brevity — verified in e2e suite)

  return result;
}
```

### §5.3 Call-site in `transformSkill`

```
verifyBodyHash(rawBody, manifest.body_hash)             // 1. integrity check on nexus-core original
const injectedBody = injectHarnessMarkers(rawBody, skillId)  // 2. harness injection
const frontmatter = assembleFrontmatter(meta, injectedBody)  // 3. final assembly
```

---

## §6 Example Injection Content (Claude Code, for reference)

**This content is consumer-supplied and NOT part of nexus-core.** It is included here so the maintainer can evaluate whether the marker placement in §4.2 and §4.3 produces a coherent, useful result when the consumer injection is applied.

If this proposal is accepted, claude-nexus would store the following in `harness-content/resume_invocation.md`:

---

```
Resume a completed subagent via `SendMessage({to: "<agentId>", message: "..."})`.
- `to` MUST be the agentId (UUID) returned by the original `Agent()` call — NOT the agent `name`. Name-based send reaches only running teammates and cannot revive a completed session.
- agentId is persisted in plan.json `how_agent_ids` (plan sessions) or tasks.json `owner_agent_id` (run sessions).
- Requires environment variable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. If unset, resume silently falls back to fresh spawn — no error.
- The resumed agent reopens with the full prior transcript intact; include a brief delta in the message explaining why it was re-invoked.
```

---

The content is 5 lines, well within the proposed `max_lines: 32` / `max_bytes: 2048` limits.

---

## §7 Questions for nexus-core Maintainer

The following are open questions where the proposal requests an explicit decision from the nexus-core maintainer.

**(a) Scope beyond nx-run and nx-plan**: Should `<!-- HARNESS:resume_invocation -->` be added to any skills beyond nx-run and nx-plan? The proposal recommends against agent body files (§4, Note), but are there other skill bodies (nx-init, nx-sync, nx-setup) where a resume extension point would be appropriate? This is the maintainer's call — claude-nexus is not requesting those insertions at this time.

**(b) Schema fit with existing vocabulary files**: Does the proposed `harness_keys.yml` schema (`id`, `description`, `max_lines`, `max_bytes`) fit the conventions of `vocabulary/capabilities.yml` and `vocabulary/tags.yml`? If those files use a different field naming style or top-level structure, the schema should be adjusted to match before the file is committed.

**(c) Size limit defaults**: Are `max_lines: 32` and `max_bytes: 2048` appropriate defaults for the `resume_invocation` key? The current example content (§6) is 5 lines / ~450 bytes, so both limits have significant headroom. If the maintainer expects harness-local resume documentation to remain compact, tighter limits (e.g., `max_lines: 16`, `max_bytes: 1024`) might be preferable. The limit exists primarily to prevent a runaway injection from obscuring the surrounding skill body.

**(d) Recursion-prohibition safeguard**: Safeguard 4 (§3.4) forbids injected content from containing a `<!-- HARNESS:* -->` marker. Is this restriction appropriate, or is there a use case where a nested marker would be legitimate? The proposal treats nested markers as always an error because the consumer-side replacement pass is single-pass and does not recurse. If a future use case requires multi-level injection, the mechanism would need a redesign.

**(e) Throw vs warn boundary**: The proposed failure policy (§3.3) throws on unknown keys and warns on unimplemented keys. Is this split sensible? An alternative is to throw in both cases, which would make the sibling release window harder to manage (opencode-nexus could not ship the marker until it also ships consumer logic). Another alternative is to warn in both cases, which would allow typos to silently pass through. The current split reflects the view that typos and missing implementations are different failure modes.

**(f) Marker syntax alternatives**: The self-closing HTML comment form was chosen because it is invisible in rendered markdown, easy to detect with a single regex, and familiar to most developers. Are there any reasons to prefer a different marker syntax (e.g., a custom YAML frontmatter field, a dedicated placeholder line syntax, or an XML processing instruction)? If the maintainer has a preferred convention, the consumer will adapt.

---

## §8 Compatibility Notes

### §8.1 Markdown invisibility

The marker `<!-- HARNESS:resume_invocation -->` is an HTML comment. In any markdown renderer (GitHub, VS Code preview, Claude Code skill display), it renders as invisible. A consumer that has not implemented the injection step will produce a SKILL.md that is visually identical to the unmodified body — the placeholder simply does not appear. This is the correct behavior for the warn-and-pass-through failure mode.

### §8.2 Sibling release window

opencode-nexus is currently migrating to nexus-core as its base. It does not have consumer-side injection logic at this time. Under the proposed failure policy:

- nexus-core adds markers to `body.md` and updates `manifest.json` hashes
- opencode-nexus consumes the updated nexus-core, warns on unhandled marker, HTML comment passes through, SKILL.md renders correctly
- opencode-nexus implements injection on its own schedule; marker is replaced at that point

No coordination between claude-nexus and opencode-nexus is required. Each consumer ships its injection logic independently.

### §8.3 body_hash integrity chain

The `body_hash` in `manifest.json` is computed on the nexus-core body **including the marker line**. The consumer calls `verifyBodyHash` against this hash before injection. This means:

- The integrity check is on the nexus-core-authored content (marker included).
- The deployed consumer SKILL.md body diverges from the stored hash by exactly the injected content.
- The consumer is responsible for documenting this divergence in its own build output (safeguard 5 log line).

The `body_hash` mechanism continues to serve its original purpose — detecting unintentional drift between nexus-core and the deployed consumer — without modification. No changes to the hash computation or verification logic are requested from nexus-core.

### §8.4 Breaking change assessment

Adding a marker line to an existing `body.md` and updating `body_hash` **will fail `verifyBodyHash` for any consumer pinned to the previous nexus-core version**. This is therefore a breaking change at the integrity-check boundary, even though the injected marker itself is invisible in rendered markdown. Per primer §5.1 (Forward-only schema relaxation — breaking change is permitted in the 1-person dogfooding phase), the recommended response is a **semver major bump of nexus-core + a `CHANGELOG.md` "Consumer Action Required" section** describing (a) which `body.md` files were modified and (b) the new `body_hash` values. Consumers (claude-nexus, opencode-nexus) then update their pinned version in a subsequent release.

---

## §9 GitHub Issue Title Candidates

The following are proposed titles for the `gh issue create` command. Lead will select one.

1. `feat: HARNESS:* extension point for harness-local skill body injection`
2. `proposal: vocabulary/harness_keys.yml + body marker convention for consumer-supplied content`
3. `feat(vocabulary): introduce HARNESS marker allowlist and body extension points for nx-run/nx-plan`

---

*Document version: Plan #4 session 2, 2026-04-11. nexus-core response pending.*
