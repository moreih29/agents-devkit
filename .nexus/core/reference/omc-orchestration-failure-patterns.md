<!-- tags: omc, oh-my-claudecode, orchestration, autonomous-agent, failure-patterns, ralph, autopilot, multi-agent -->
# OMC 자율 오케스트레이션 실패 패턴 — Reference

**Searched**: 2026-03-29  
**Repository**: https://github.com/Yeachan-Heo/oh-my-claudecode (author: Yeachan-Heo)  
**Full findings**: `.nexus/state/artifacts/omc-orchestration-failures.md`

## 핵심 결론

OMC도 "Lead가 혼자 판단하다 실패"하는 패턴을 명확히 겪고 있음. 6개 실패 유형이 GitHub Issues에서 독립적으로 반복 확인됨.

## 실패 패턴 목록

| 패턴 | 이슈 | 핵심 내용 |
|------|------|-----------|
| 탈출 불가 루프 | #1797, #1795 | state_clear 후에도 stop hook이 active 상태 유지, false positive keyword가 루프 강제 진입 |
| Race condition 오케스트레이션 단절 | #1930 | stale subagent count로 consensus loop 중간 세션 종료 |
| 잘못된 라우팅 (silent) | #1989 | OMC_ROUTING_FORCE_INHERIT 무시, 에러 없이 wrong model 사용 |
| hook이 사용자 설정 override | #1895 | 8개 파일의 하드코딩 지시문이 CLAUDE_SPAWN_BACKEND=tmux 무시 |
| Leader-Worker 통신 단절 | #1872 | worker_not_found, 사용자가 tmux 직접 읽어야 함 |
| 문서-구현 불일치 | #1926 | "fully automated" 문서화, 실제론 매 단계 수동 개입 필요 |
| Observability 부재 | #1901 | 40+ silent .catch(() => {}), 오케스트레이션 실패가 invisible |
| 상태 오염 | #1814, Bug#5/301 | ralph 상태가 다른 창으로 전파, undefined sessionId cross-session 오염 |

## 구조적 인정 (공식 문서)

ARCHITECTURE.md: "The system does not auto-recover from fundamental misunderstandings; human intervention remains necessary for scope misalignment."

## 스트레스 테스트 결과 (Issue #301)

날짜: 2026-02-02, v3.9.5, Claude Code Opus 4.5 자동 실행  
결과: 15개 버그 (Critical 4, High 6, Medium 5)  
Critical 포함: SubagentStop이 항상 'failed' 반환, ConcurrencyManager race condition, ralph state 구조 오염, 토큰 통계 89% 과소집계

## Key URLs

- Issues: https://github.com/Yeachan-Heo/oh-my-claudecode/issues
- Releases: https://github.com/Yeachan-Heo/oh-my-claudecode/releases
- Architecture doc: https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/docs/ARCHITECTURE.md
- Stress test issue: https://github.com/Yeachan-Heo/oh-my-claudecode/issues/301
- Claude Code upstream issue (ralph orphan): https://github.com/anthropics/claude-code/issues/18860
