### Slash Command Display (Claude Code)

Claude Code invokes skills via the `/claude-nexus:<skill-id>` slash form.

- Typed by the user in the CLI: `/claude-nexus:nx-init`, `/claude-nexus:nx-setup`
- Programmatic entry from another skill: `Skill({ skill: "claude-nexus:<skill-id>", args: "<optional>" })`
- Tag-triggered entry (for skills with a `triggers` entry): the trigger tag (e.g. `[plan]`, `[run]`, `[sync]`) dispatches via gate.ts without requiring the slash form
- `manual_only: true` skills (e.g. `nx-init`) expose only the slash form — no tag trigger

When docs reference a skill to the user, prefer the slash form. When a skill dispatches another skill internally, prefer the `Skill` tool with the `claude-nexus:` prefix.
