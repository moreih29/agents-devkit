---
name: nx-setup
description: Interactive project setup wizard for Nexus configuration.
trigger_display: "/claude-nexus:nx-setup"
purpose: "Configure Nexus interactively"
disable-model-invocation: true
---

<role>
Interactive project setup wizard — configure Nexus for a new project with minimal token cost. Every step is a concrete choice via `AskUserQuestion`, with no open-ended exploration.
</role>

<constraints>
- NEVER accept free-text input — every step must use `AskUserQuestion` with explicit options.
- NEVER skip the "Skip" option — all steps are optional.
- NEVER modify files outside the selected scope without explicit user confirmation.
- NEVER overwrite an existing `statusLine` field in settings.json without explicit user confirmation.
</constraints>

<guidelines>
## Trigger
- Direct invocation: `/claude-nexus:nx-setup`

---

## Steps

### Step 1: Scope Selection

```
AskUserQuestion({
  questions: [{
    question: "Where should the Nexus configuration be applied?",
    header: "Scope",
    multiSelect: false,
    options: [
      { label: "User (Global)", description: "Apply to all projects (~/.claude/CLAUDE.md, ~/.claude/settings.json statusline)" },
      { label: "Project", description: "Apply to this project only (CLAUDE.md, .claude/settings.local.json, .nexus/config.json)" }
    ]
  }]
})
```

All file write paths for subsequent steps are determined by this selection:
- User: `~/.claude/CLAUDE.md`, `~/.claude/settings.json` (statusline wrapper)
- Project: `./CLAUDE.md`, `./.nexus/config.json`

### Step 2: Statusline Preset

```
AskUserQuestion({
  questions: [{
    question: "Select the statusline display level.",
    header: "Statusline",
    multiSelect: false,
    options: [
      { label: "Full (Recommended)", description: "2 lines: model+branch, task+usage" },
      { label: "Minimal", description: "1 line: model+branch only" },
      { label: "Skip", description: "Skip statusline configuration" }
    ]
  }]
})
```

**Create wrapper script** (for Full/Minimal, run via Bash tool):
```bash
mkdir -p ~/.claude/hooks
cat > ~/.claude/hooks/nexus-statusline.sh << 'EOF'
#!/bin/bash
SCRIPT=$(ls -1d "$HOME/.claude/plugins/cache/nexus/claude-nexus"/*/scripts/statusline.cjs 2>/dev/null | sort -V | tail -1)
[ -n "$SCRIPT" ] && exec node "$SCRIPT"
EOF
chmod +x ~/.claude/hooks/nexus-statusline.sh
```

**On selection, depending on scope:**

**(1) User scope:**
- Create wrapper script (run step above)
- If `statusLine` field is **absent** in `~/.claude/settings.json`: add statusLine setting directly:
  ```json
  { "statusLine": { "type": "command", "command": "bash $HOME/.claude/hooks/nexus-statusline.sh" } }
  ```
- If `statusLine` field **already exists** in `~/.claude/settings.json`: create wrapper only, do not modify settings.json — ask user to confirm replacement (see "Statusline coexistence handling" below)

**(2) Project scope:**
- Create wrapper script (run step above)
- If `statusLine` field is **absent** in `.claude/settings.local.json`: add statusLine setting directly:
  ```json
  { "statusLine": { "type": "command", "command": "bash $HOME/.claude/hooks/nexus-statusline.sh" } }
  ```
- If `statusLine` field **already exists** in `.claude/settings.local.json`: create wrapper only, do not modify settings.local.json — ask user to confirm replacement (see "Statusline coexistence handling" below)
- Also save the selected value to the `statuslinePreset` field in `.nexus/config.json` (preserve existing values)

**(3) Skip:**
- Do not create wrapper or modify settings.json.

**Statusline coexistence handling:**

Run only if settings.json modification was deferred above (i.e., wrapper was created but existing statusLine was detected).
If statusLine settings were already applied above, skip this sub-step.

Specifically, treat an existing statusline setting as detected if any of the following are true:
- `~/.claude/hooks/statusline.sh` file exists
- Or the scope-appropriate settings.json (`~/.claude/settings.json` or `.claude/settings.local.json`) already has a `statusLine` field

If detected:

```
AskUserQuestion({
  questions: [{
    question: "An existing statusline configuration was detected. Replace it with the Nexus statusline?",
    header: "Statusline",
    multiSelect: false,
    options: [
      { label: "Replace (Recommended)", description: "Replace with Nexus statusline (wrapper script configuration)" },
      { label: "Keep Existing", description: "Keep existing statusline. Nexus wrapper is created but settings.json is not modified." }
    ]
  }]
})
```

- "Replace (Recommended)": replace the `statusLine` in the scope-appropriate settings.json with the Nexus wrapper (wrapper script already created above)
- "Keep Existing": keep the existing `statusLine` in settings.json (wrapper script already created above — user can switch manually later)

If no existing statusline configuration is detected, skip this sub-step.

### Step 3: CLAUDE.md Nexus Section

Write the Nexus section in CLAUDE.md using `<!-- NEXUS:START -->` / `<!-- NEXUS:END -->` markers.

If a Nexus section already exists, replace the content between markers. Content outside the markers is preserved unchanged.

Write location depends on scope selected in Step 1.

**Section content is read from the plugin's template file at runtime:**

1. **Read `$CLAUDE_PLUGIN_ROOT/templates/nexus-section.md`** — this file is auto-generated at build time from agents/skills/tags source files
2. **If not found:** Error — "Nexus section template not found. Please verify that the plugin is installed correctly."

Write the template content wrapped in `<!-- NEXUS:START -->` / `<!-- NEXUS:END -->` markers to the target CLAUDE.md (respecting scope from Step 1).

### Step 4: Recommended Plugin

Check if `context7@claude-plugins-official` is in `enabledPlugins` (global or project settings.json).

**Already installed:**

Notify and skip:
```
"Recommended plugin already installed: context7 ✓"
```

**Not installed:**

```
AskUserQuestion({
  questions: [{
    question: "Install the context7 plugin? It enables agents to look up library docs in real time.",
    header: "Plugin",
    multiSelect: false,
    options: [
      { label: "Install (Recommended)", description: "context7 — real-time library documentation lookup (Upstash Context7)" },
      { label: "Skip", description: "Skip recommended plugin installation" }
    ]
  }]
})
```

**If "Install":**
Add to `enabledPlugins` in the scope-appropriate settings.json (`~/.claude/settings.json` or `.claude/settings.local.json`):
```json
{
  "context7@claude-plugins-official": true
}
```
Claude Code will automatically install the plugin at the start of the next session.

**If "Skip":** proceed to the next step.

Note: Once added to `enabledPlugins`, Claude Code automatically installs the plugin at the start of the next session.

### Step 5: Knowledge Init

```
AskUserQuestion({
  questions: [{
    question: "Auto-generate project core knowledge?",
    header: "Init",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "Analyze existing docs (README, CLAUDE.md, etc.) to generate .nexus/core/codebase/" },
      { label: "Skip", description: "Run manually later with /claude-nexus:nx-init" }
    ]
  }]
})
```

If "Yes": invoke `Skill({ skill: "claude-nexus:nx-init" })`.
If "Skip": proceed to next step.

### Step 6: Complete

Output a setup completion message:
- Summary of applied settings
- Brief introduction to available skills/agents
- "To get started, describe a task, or use [plan] for planning, [run] for execution, [rule] for saving rules"

---

## Key Principles

1. **Every step uses AskUserQuestion** — no free-text input
2. **Minimize tokens** — limit each step to concrete choices to prevent unnecessary exploration
3. **Always provide a Skip option** — nothing is forced
4. **Extensible structure** — includes recommended plugin step, expandable to additional categories in the future

## State Management

Setup operates via sequential AskUserQuestion calls with no state file.
Configuration results are written immediately to `.nexus/config.json` at each step (for Project scope).
</guidelines>
