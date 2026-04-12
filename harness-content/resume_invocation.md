### Resume Invocation (Claude Code)

Resume a completed subagent via `SendMessage({to: "<agentId>", message: "..."})`.
- `to` MUST be the agentId (UUID) returned by the original `Agent()` call — NOT the agent `name`. Name-based send reaches only running teammates and cannot revive a completed session.
- agentId is persisted in plan.json `how_agent_ids` (plan sessions) or tasks.json `owner_agent_id` (run sessions).
- Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. If unset, resume silently falls back to fresh spawn — no error.
- The resumed agent reopens with the full prior transcript intact; include a brief delta in the message explaining why it was re-invoked.
