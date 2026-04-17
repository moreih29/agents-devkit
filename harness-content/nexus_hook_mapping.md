# Nexus Hook Mapping

This file is the consumer-owned canonical record mapping the eight Claude Code hook APIs to the eight conceptual events defined in nexus-core §9. It is injected into the nx-run skill context at build time via the `nexus_hook_mapping` token.

| Hook (Claude Code) | Fires when | §9 event | Notes |
|--------------------|------------|----------|-------|
| SessionStart | Claude Code session initializes | session_start | Initializes agent-tracker.json and tool-log.jsonl. nexus-core v0.11.0 §9 recognizes SessionStart as the SHOULD location for agent-tracker init, superseding Stop-time deletion. |
| UserPromptSubmit | User submits a prompt | user_message | Branches on seven tags ([plan], [run], [d], [m], [m:gc], [rule], [sync]) and auto-merges planReminder, tasksReminder, and claudeMdNotice via withNotices. The three guide items (plan/task/knowledge counts) are formally incorporated as SHOULD range in v0.11.0 §9. |
| SubagentStart | A subagent is spawned | subagent_spawn | Upserts agent-tracker.json and injects the Core Knowledge Index only. TASK format, tool mapping, and skill doc refs were DROP candidates; structured task context is now canonical in the nx-run skill contract ("Structured Delegation" section). |
| SubagentStop | A subagent completes | subagent_complete | Updates agent-tracker.json status, extracts files_touched from tool-log.jsonl, and injects an incomplete-task warning if the agent's owned tasks remain pending. The incomplete-task warning is a P2 SHOULD bullet in v0.11.0 §9 (3-of-3 empirical). |
| PreToolUse | Before a tool call executes (Edit, Write, NotebookEdit) | pre_tool_use | In [run] mode, blocks Edit/Write when all tasks are completed and passes a block reason as a prompt fragment to the LLM — pattern canonicalized as P1 SHOULD note in v0.11.0 §9. Per-agent capability restrictions are handled by disallowedTools in agents/*.md frontmatter at the Claude Code runtime layer, not here. |
| PostToolUse | After a tool call completes (Edit, Write, NotebookEdit, Read) | post_tool_use | Appends to tool-log.jsonl for Edit/Write/NotebookEdit. Tracks memory-access.jsonl for Read events targeting .nexus/memory/. Memory-access tracking adopted from nexus-core v0.10.0 canonical policy. |
| Stop | Main agent finishes a response (session end) | session_end | Injects incomplete-task warning, all-tasks-completed close prompt (P7 SHOULD in v0.11.0 §9 session_end), and sync nudge after 3+ idle cycles (MAY, harness-local, 1-of-3). agent-tracker.json deletion moved to SessionStart; Stop no longer deletes it. |
| PostCompact | Context compaction completes (PreCompact is pass() with no action) | context_compact | Injects a session snapshot (Mode, Tasks, Plan, Knowledge counts, Agents) as compensatory context after compaction. This harness uses PostCompact rather than PreCompact — a timing choice recognized by nexus-core v0.11.0 as "harness-native timing discretion" (SHOULD). hooks.json registration is a separate verification item (see claude-nexus issue #22). |

## Implementation references

The following line ranges in `src/hooks/gate.ts` correspond to each hook handler. Line numbers are stable reference points for grep.

- `handleSessionStart` — gate.ts:571-580
- `handleUserPromptSubmit` — gate.ts:382-496
- `handleSubagentStart` — gate.ts:582-614
- `handleSubagentStop` — gate.ts:616-676
- `handlePreToolUse` — gate.ts:145-177
- `handlePostToolUse` — gate.ts:545-567
- `handleStop` — gate.ts:97-128
- `handlePostCompact` — gate.ts:680-748

## Notes on canonicalization

The eight handlers span three compliance tiers defined in nexus-core v0.11.0 §9. Four behaviors are MUST or P1 SHOULD (block reason as prompt fragment in PreToolUse, incomplete-task warning in SubagentStop, all-tasks-completed close prompt in Stop, and session snapshot in PostCompact). Three are SHOULD with empirical backing across two or more harnesses (SessionStart init, UserPromptSubmit guide items, sync nudge eligibility). One is MAY and harness-local: the sync nudge in Stop, observed in 1-of-3 known harnesses. The PostCompact timing choice (compensate after compaction rather than before) is a DROP from any MUST obligation and is classified as harness-native discretion. No behavior in this mapping was invented outside source material; all grades trace to nexus-core v0.11.0 MIGRATIONS documentation or gate.ts implementation evidence.
