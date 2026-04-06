<!-- tags: blog, framework, prompt, context, tools, orchestration, harness -->
<!-- tags: blog, framework, prompt, context, tools, orchestration, harness -->
# LLM Engineering 5-Layer Framework

Source: moreih29.github.io/posts/llm-eng-{1~5}

## 5 Layers

| Layer | Definition | Nexus Mapping |
|-------|------------|---------------|
| L1 Prompt | Single prompt optimization | agents/*.md static prompts + gate.ts additionalContext |
| L2 Context | Right information at the right time | nx_briefing matrix + hint filter |
| L3 Tools | Tool design + protocol | MCP tools 30+ (core, task, plan, rules, LSP, AST) |
| L4 Orchestration | Multi-agent coordination | Lead permanent team + User-Directed Composition |
| L5 Harness | Quality assurance via structural constraints | gate.ts (Stop/PreToolUse/UserPromptSubmit) + task pipeline |

## Key Statistics / Principles

- **Coordination failure accounts for 36.94% of all failures** — the leading cause. Structuring input/output contracts is critical.
- **Harness improvements alone yield +13.7pt gain** — high ROI from structural investment.
- **2–4 workers recommended** — "concurrently active" basis; distinct from total number of defined roles.
- **Circuit Breaker + exponential backoff + Human-in-the-Loop** — three-tier approach recommended.
- **Incremental skill loading**: metadata → full instructions → resources (3 stages).

## Implications for Nexus

1. **L2 (Context) is relatively weak** — only two levels: null/all. Focus is on "controlling information volume," not "controlling information structure."
2. **L5 (Harness) is limited to the file level** — no agent-level failure tracking or Circuit Breaker.
3. **L1 (Prompt) is static** — no per-phase prompt variation like OMO. additionalContext is additive only, not structural.
