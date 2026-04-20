<!-- PROJECT:START -->
## claude-nexus

Claude Code용 에이전트 오케스트레이션 플러그인. Nexus 자체를 사용하여 개발한다 (부트스트랩).

### Essentials
- 런타임: **bun** 사용 (npm/node 대신) — `bun run`, `bun install`, `bun test`
- 빌드: `bun run sync` (nexus-core CLI 호출 — agents·skills·hooks·settings.json·dist/hooks/ 리포 루트 flat 출력)
- 테스트: `bash test/e2e.sh`
- 플러그인 구조: nexus-core sync Managed 산출물(agents·skills·hooks·settings.json·dist/hooks/) + claude-only 고유(scripts/statusline.mjs)
- Managed 산출물(agents/·skills/·hooks/·settings.json·dist/hooks/)은 nexus-core sync가 관리 — 직접 편집 금지, 수정은 upstream(@moreih29/nexus-core)에서

### @moreih29/nexus-core upgrade protocol

When `@moreih29/nexus-core` version in `package.json` changes:

1. `bun install` 실행
2. `bun run sync` 실행 (Managed 산출물 갱신)
3. `bun run validate` 통과 확인
4. `bunx @moreih29/nexus-core list` 로 제공 에이전트·스킬·훅 개수 재확인
5. CHANGELOG 확인 후 consumer action 필요 항목 식별

기준 문서: `https://github.com/moreih29/nexus-core/blob/main/docs/plugin-guide.md`
<!-- PROJECT:END -->

<!-- NEXUS:START -->
## Nexus Agent Orchestration

**Default: DELEGATE** — route code work, analysis, and multi-file changes to agents.

Lead는 사용자와 직접 대화하는 메인 에이전트. tasks.json에서 `owner: "lead"`는 Lead가 직접 처리.

Before starting work, check `.nexus/memory/` and `.nexus/context/` for project-specific knowledge.

### .nexus/ Structure

- `memory/` — lessons learned, references (`[m]`)
- `context/` — design principles, architecture philosophy (`[sync]`)
- `rules/` — project custom rules (`[rule]`)
- `state/` — plan.json, tasks.json (runtime)

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
| 리뷰어 | CHECK | Content verification, fact-checking, grammar review | reviewer |
| 테스터 | CHECK | Testing, verification, security review | tester |

단순 작업(파일 1-2개 읽기/수정)은 직접 처리하라.

### Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| nx-init | /claude-nexus:nx-init | Project onboarding — scan, mission, essentials, context generation |
| nx-plan | [plan] | Structured planning — subagent-based analysis, deliberate decisions, produce execution plan |
| nx-run | [run] | Execution — user-directed agent composition |
| nx-setup | /claude-nexus:nx-setup | Interactive Nexus configuration wizard |
| nx-sync | [sync] | Context knowledge synchronization |

### Tags

| Tag | Purpose |
|-----|---------|
| [plan] | Activates nx-plan skill for structured multi-perspective analysis and decision recording |
| [run] | Activates nx-run skill for task execution with subagent composition |
| [sync] | Activates nx-sync skill for .nexus/context/ knowledge synchronization |
| [d] | Records a decision during an active plan session |
| [m] | Stores a lesson or reference to .nexus/memory/ |
| [m:gc] | Garbage-collects .nexus/memory/ by merging or removing stale entries |
| [rule] | Stores a project rule to .nexus/rules/. [rule:*] supports tag parameter. |
<!-- NEXUS:END -->
