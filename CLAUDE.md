# claude-nexus

Claude Code용 에이전트 오케스트레이션 플러그인. 이 프로젝트는 Nexus 자체를 사용하여 개발한다 (부트스트랩).

- omc는 이 프로젝트에서 비활성화. Nexus 에이전트/스킬만 사용.
- 설계 문서: `.claude/nexus/knowledge/`
- 브랜치 계획: `.claude/nexus/plans/`
- 개발 사이클: `src/ 수정 → bun run dev (빌드+캐시동기화) → nexus-test에서 검증`
- E2E 테스트: `bash test/e2e.sh`
- 런타임: npm/node 대신 **bun** 사용 (`bun run`, `bun install`, `bun test` 등)

## Agent Delegation
- When [NEXUS] routing context is injected, delegate to the recommended agent via `Agent({ subagent_type: "nexus:<agent>", prompt: "<task>" })`.
- Handle directly: single-file lookups, simple questions, trivial edits.
- Delegate: multi-file changes, debugging, reviews, tests, analysis.
