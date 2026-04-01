# claude-nexus

Claude Code용 에이전트 오케스트레이션 플러그인. 이 프로젝트는 Nexus 자체를 사용하여 개발한다 (부트스트랩).

- omc는 이 프로젝트에서 비활성화. Nexus 에이전트/스킬만 사용.
- 설계 문서: `.nexus/core/`
- 개발 사이클: `src/ 수정 → bun run dev (빌드+캐시동기화) → nexus-test에서 검증`
- E2E 테스트: `bash test/e2e.sh`
- 런타임: npm/node 대신 **bun** 사용 (`bun run`, `bun install`, `bun test` 등)

<!-- NEXUS:START -->
## Nexus Agent Orchestration

**Default: DELEGATE** — route code work, analysis, and multi-file changes to agents.

### Agent Routing

병렬 작업이나 다른 관점이 필요할 때 에이전트를 활용하라.

| 이름 | Category | Task | Agent |
|------|----------|------|-------|
| 아키텍트 | HOW | Architecture, technical design, code review | architect |
| 디자이너 | HOW | UI/UX design, interaction patterns, user experience | designer |
| 포닥 | HOW | Research methodology, evidence synthesis | postdoc |
| 전략가 | HOW | Business strategy, market analysis, competitive positioning | strategist |
| 엔지니어 | DO | Code implementation, edits, debugging | engineer |
| 리서처 | DO | Web search, independent investigation | researcher |
| 라이터 | DO | Technical writing, documentation, presentations | writer |
| QA | CHECK | Testing, verification, security review | qa |
| 리뷰어 | CHECK | Content verification, fact-checking, grammar review | reviewer |

단순 작업(파일 1-2개 읽기/수정)은 직접 처리하라.

### Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| nx-init | /claude-nexus:nx-init | Full project onboarding: scan codebase, establish identity, generate core knowledge |
| nx-meet | [meet] | Team discussion — convene agents, deliberate, and decide before executing |
| nx-run | nx-run | Execution — user-directed agent composition |
| nx-setup | /claude-nexus:nx-setup | Configure Nexus interactively |
| nx-sync | /claude-nexus:nx-sync | Synchronize core knowledge with current project state |

### Tags

| Tag | Purpose |
|-----|---------|
| [meet] | 미팅 — 팀 소집, 논의, 결정 후 실행 |
| [d] | 결정 기록 (meet 세션 내 nx_meet_decide 호출) |
| [run] | 실행 — nx-run 풀 파이프라인 강제 |
| [rule] | 규칙 저장 — [rule:태그] 형식 지원 |
<!-- NEXUS:END -->
