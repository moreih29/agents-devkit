<!-- tags: multi-agent, subagent, agent-team, claude-code, orchestration, token-cost, MAST, MultiAgentBench -->
# Reference: Subagent vs Agent Team — Multi-Agent Orchestration Patterns

**Date researched**: 2026-03-31  
**Full findings**: `.nexus/state/artifacts/findings_subagent_vs_team.md`

---

## Key Sources

- Claude Code Agent Teams docs: https://code.claude.com/docs/en/agent-teams
- Claude Code Subagents docs: https://code.claude.com/docs/en/sub-agents
- MAST paper (NeurIPS 2025): https://arxiv.org/abs/2503.13657
- MultiAgentBench (ACL 2025): https://arxiv.org/abs/2503.01935
- Magentic-One: https://www.microsoft.com/en-us/research/articles/magentic-one-a-generalist-multi-agent-system-for-solving-complex-tasks/
- LatentMAS: https://arxiv.org/abs/2511.20639

---

## Critical Facts

### Claude Code Technical Difference
- **Subagent**: fire-and-forget; isolated context; reports result to main agent only; no inter-agent messaging; cannot spawn subagents; resumable via SendMessage.
- **Agent Team**: persistent sessions; shared task list with file-lock claiming; direct peer-to-peer messaging (message/broadcast); TeammateIdle/TaskCreated/TaskCompleted hooks; experimental, opt-in via env var.
- Both: each agent has its own context window. Lead's conversation history does NOT carry over to teammates or subagents.

### Token Cost
- Official Claude Code docs: agent team = ~3-4x tokens vs single session doing same work sequentially.
- Anthropic observation (2nd-hand via voltagent.dev): multi-agent runs use ~15x more tokens than single-agent chat on same task.
- Long context cost multiplier: 128K context at 80% capacity = 4-6x cost vs 16K context (factory.ai).
- Input token prices dropped ~85% since 2023 mid; output still 3-5x more expensive than input.

### Quality
- MultiAgentBench (ACL 2025): graph mesh topology > star (hub-and-spoke) > tree > chain for research tasks. 3 agents better than 1; beyond 3, diminishing returns set in.
- Magentic-One: multi-agent vastly outperforms single GPT-4 on GAIA/AssistantBench/WebArena (7-16% single → SOTA level multi-agent).
- LatentMAS: +14.6% accuracy, 70-83% output token reduction vs single-model baselines.
- MAST: failures stem from coordination system design, not model limits. 14 failure modes across 3 categories (system design, inter-agent misalignment, task verification).

### Industry Patterns
- LangGraph: graph routing, built-in checkpointing — closest to persistent state.
- CrewAI: role-based sequential crew — structured delegation.
- AutoGen/AG2: GroupChat conversational — shared conversation, selector picks next speaker.
- OpenAI Agents SDK: Agent + handoff — ephemeral context variables, production-ready (March 2026).
- Magentic-One: Orchestrator hub + 4 specialist agents, dual-loop (Task Ledger outer + Progress Ledger inner).

### Null Results
- No direct MAST data on hub-and-spoke vs peer-to-peer comparison.
- No explicit Magentic-One cross-task agent persistence documentation.
- Official Claude Code detailed cost page not fetched (https://code.claude.com/docs/en/costs#agent-team-token-costs).
- "67% token reduction via subagent isolation" claim: source unverified.
