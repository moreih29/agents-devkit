<!-- tags: identity, context, format, standard, prompt, xml, language -->
<!-- tags: identity, context, format, standard, prompt, xml, language -->
# Context Standard

Standard for all LLM-facing context in Nexus: agent prompts, skill documents, gate messages, and briefings.

## Language

All internal context is written in **English**. User-facing output language is controlled by the Claude Code platform (`# Language` setting), not by Nexus.

## Section Order

All structured context follows this order. Sections are optional but order is fixed.

1. **Role** — Identity and purpose
2. **Constraints** — NEVER/MUST rules, hard boundaries (primacy position)
3. **Context** — Background information, state, references
4. **Guidelines** — How to perform the task, processes, patterns
5. **Examples** — Few-shot demonstrations (optional)

No double-placement needed — Nexus contexts are under 6K tokens, so Lost in the Middle risk is low.

## Format by Context Type

### Agent Prompts (agents/*.md)

Markdown body with XML section tags. No full-document XML wrapping.

```markdown
---
(YAML frontmatter)
---

<role>
One-paragraph identity and purpose.
</role>

<constraints>
- NEVER do X
- MUST always do Y
</constraints>

<guidelines>
## Section Heading
Content...

## Another Section
Content...
</guidelines>
```

### Skill Documents (skills/*/SKILL.md)

Markdown body with XML section tags. Same order as agents.

```markdown
---
(YAML frontmatter)
---

<role>
Skill purpose and trigger description.
</role>

<constraints>
- NEVER do X
- MUST always do Y
</constraints>

<guidelines>
## Step 1: ...
## Step 2: ...
</guidelines>
```

### Gate Messages (additionalContext)

Short dynamic messages wrapped in a single XML tag.

```
<nexus>Task pipeline required. Register tasks with nx_task_add before editing files.</nexus>
```

### Briefing Output (nx_briefing)

Collected data — order follows the 4-layer structure (identity → codebase → reference → memory). No XML section tags needed; briefing is data, not instruction.

## Tag Naming

Use consistent, descriptive tag names. Recommended tags:

| Tag | Purpose |
|-----|---------|
| `<role>` | Identity and purpose |
| `<constraints>` | Hard rules, boundaries |
| `<context>` | Background, state, references |
| `<guidelines>` | Processes, patterns, how-to |
| `<examples>` | Few-shot demonstrations |
| `<nexus>` | Gate dynamic messages |

Tags are lowercase. Content inside tags uses Markdown formatting.
