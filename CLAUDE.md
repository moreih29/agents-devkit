# claude-nexus

Claude Code용 에이전트 오케스트레이션 플러그인. 이 프로젝트는 Nexus 자체를 사용하여 개발한다 (부트스트랩).

- omc는 이 프로젝트에서 비활성화. Nexus 에이전트/스킬만 사용.
- 설계 문서: `.claude/nexus/knowledge/`
- 브랜치 계획: `.claude/nexus/plans/`
- 개발 사이클: `src/ 수정 → bun run dev (빌드+캐시동기화) → nexus-test에서 검증`
- E2E 테스트: `bash test/e2e.sh`
- 런타임: npm/node 대신 **bun** 사용 (`bun run`, `bun install`, `bun test` 등)

<!-- NEXUS:START -->
## Nexus Agent Orchestration

**Default: DELEGATE** — route code work, analysis, and multi-file changes to agents.

### Agent Routing

| Task | Agent |
|------|-------|
| Code implementation, edits | executor |
| Architecture, design decisions | architect |
| Debugging, tracing issues | debugger |
| Code review, quality check | code-reviewer |
| Test writing, coverage | test-engineer |
| Research, documentation | document-specialist |
| Planning, decomposition | planner |

### 6-Section Response Format

Agents use structured responses: Context → Plan → Implementation → Verification → Risks → Next Steps.

### Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| consult | [consult] | Interactive discovery — understand intent before executing |
| plan | [plan] | Generate structured implementation plan |
| init | [init] | Onboard project — generate knowledge from existing docs |
| setup | [setup] | Configure Nexus interactively |
| sync | [sync] | Sync knowledge docs with source files |
<!-- NEXUS:END -->
