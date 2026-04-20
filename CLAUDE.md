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

### Release protocol

claude-nexus는 **수동 버전 bump + 서술형 CHANGELOG**를 쓴다. auto-bump / auto-CHANGELOG 스크립트는 패턴(Consumer Action Required 상세 기술)과 맞지 않아 폐기함. publish는 tag push로 `.github/workflows/publish-npm.yml`이 OIDC Trusted Publishing으로 처리한다.

1. fix/* 또는 feat/* 브랜치에서 작업 + commit
2. 4곳 버전 수동 bump (모두 같은 X.Y.Z):
   - `package.json` "version"
   - `.claude-plugin/plugin.json` "version"
   - `.claude-plugin/marketplace.json` plugins[0] "version"
   - `VERSION` (단일 행)
3. `CHANGELOG.md`에 `## [X.Y.Z] - YYYY-MM-DD` entry 수동 작성. consumer action 있으면 `### Consumer Action Required` 섹션 명시
4. `bun run sync && bun run validate && bash test/e2e.sh` 통과 확인
5. commit → PR → review/merge to main
6. main 동기화 후 태깅:
   ```bash
   git checkout main && git pull
   git tag v<X.Y.Z> && git push origin v<X.Y.Z>
   ```
7. GitHub Release (notes는 CHANGELOG 해당 섹션 추출):
   ```bash
   gh release create v<X.Y.Z> --title "v<X.Y.Z>" \
     --notes "$(awk '/^## \[<X.Y.Z>\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md)"
   ```
8. publish 워크플로우 감시 + npm 확인:
   ```bash
   gh run watch $(gh run list --workflow=publish-npm.yml --limit 1 --json databaseId --jq ".[0].databaseId") --exit-status
   npm view claude-nexus version   # → X.Y.Z
   ```
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
