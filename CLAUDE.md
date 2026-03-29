# claude-nexus

Claude Code용 에이전트 오케스트레이션 플러그인. 이 프로젝트는 Nexus 자체를 사용하여 개발한다 (부트스트랩).

- omc는 이 프로젝트에서 비활성화. Nexus 에이전트/스킬만 사용.
- 설계 문서: `.claude/nexus/knowledge/`
- 개발 사이클: `src/ 수정 → bun run dev (빌드+캐시동기화) → nexus-test에서 검증`
- E2E 테스트: `bash test/e2e.sh`
- 런타임: npm/node 대신 **bun** 사용 (`bun run`, `bun install`, `bun test` 등)

<!-- NEXUS:START -->
## Nexus Agent Orchestration

**Default: DELEGATE** — route code work, analysis, and multi-file changes to agents.

### Agent Routing

병렬 작업이나 다른 관점이 필요할 때 에이전트를 활용하라.

| Task | Agent |
|------|-------|
| Architecture, technical design, code review | architect |
| Project direction, scope, priorities | director |
| Code implementation, edits, debugging | engineer |
| Research methodology, evidence synthesis | postdoc |
| Testing, verification, security review | qa |
| Web search, independent investigation | researcher |

단순 작업(파일 1-2개 읽기/수정)은 직접 처리하라.

### Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| nx-consult | [consult] | Interactive discovery — understand intent before executing |
| nx-do | [do] / [do!] | Execution — dynamic agent composition based on goal |
| nx-setup | /claude-nexus:nx-setup | Configure Nexus interactively |
| nx-sync | /claude-nexus:nx-sync | Sync knowledge docs with source files (first run = auto-generate) |

### Tags

| Tag | Purpose |
|-----|---------|
| [consult] | 상담 — 실행 전 의도 파악 |
| [do] | 실행 — Lead 자율 판단 (sub 또는 team) |
| [do!] | 실행 팀 강제 — 반드시 팀 구성 |
| [d] | 결정 기록 (nx_decision_add 호출) |
<!-- NEXUS:END -->
