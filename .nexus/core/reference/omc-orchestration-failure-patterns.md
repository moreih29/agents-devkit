<!-- tags: omc, oh-my-claudecode, orchestration, autonomous-agent, failure-patterns, ralph, autopilot, multi-agent -->
# OMC Autonomous Orchestration Failure Patterns — Reference

**Searched**: 2026-03-29
**Repository**: https://github.com/Yeachan-Heo/oh-my-claudecode (author: Yeachan-Heo)
**Full findings**: `.nexus/state/artifacts/omc-orchestration-failures.md`

## Core Conclusion

OMC also clearly exhibits the pattern of "Lead making solo judgments that lead to failure." Six failure types have been independently and repeatedly confirmed in GitHub Issues.

## Failure Pattern List

| Pattern | Issue | Key content |
|---------|-------|-------------|
| Inescapable loop | #1797, #1795 | Stop hook remains active after state_clear; false positive keyword forces loop entry |
| Race condition orchestration disconnect | #1930 | Consensus loop mid-session termination due to stale subagent count |
| Incorrect routing (silent) | #1989 | OMC_ROUTING_FORCE_INHERIT ignored; wrong model used without error |
| Hook overrides user config | #1895 | Hardcoded directives in 8 files ignore CLAUDE_SPAWN_BACKEND=tmux |
| Leader-Worker communication disconnect | #1872 | worker_not_found; user must read tmux directly |
| Documentation-implementation mismatch | #1926 | Documented as "fully automated"; actually requires manual intervention at every step |
| Observability absence | #1901 | 40+ silent .catch(() => {}); orchestration failures are invisible |
| State pollution | #1814, Bug#5/301 | ralph state propagates to other windows; undefined sessionId causes cross-session contamination |

## Structural Acknowledgment (Official Documentation)

ARCHITECTURE.md: "The system does not auto-recover from fundamental misunderstandings; human intervention remains necessary for scope misalignment."

## Stress Test Results (Issue #301)

Date: 2026-02-02, v3.9.5, Claude Code Opus 4.5 automated run
Result: 15 bugs (Critical 4, High 6, Medium 5)
Critical bugs include: SubagentStop always returns 'failed', ConcurrencyManager race condition, ralph state structure corruption, token statistics 89% undercounted

## Key URLs

- Issues: https://github.com/Yeachan-Heo/oh-my-claudecode/issues
- Releases: https://github.com/Yeachan-Heo/oh-my-claudecode/releases
- Architecture doc: https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/ARCHITECTURE.md
- Stress test issue: https://github.com/Yeachan-Heo/oh-my-claudecode/issues/301
- Claude Code upstream issue (ralph orphan): https://github.com/anthropics/claude-code/issues/18860
