# Changelog

## [0.32.0] - 2026-04-23

### Changed

- `@moreih29/nexus-core` **v0.19.2 → v0.20.0** 채택. Lead spec과 nx-plan / nx-auto-plan / nx-run 스킬의 대규모 리팩터링 흡수. 핵심: (1) **Lead** — `[Pre-check]` opening scaffold 신규(의사결정·설계·반박 요청 시 응답이 점검 블록으로 시작, 복잡 요청은 축별 아이템 분해), Evidence requirement 신규(Lead 단독 추론 금지 — `researcher`/`explore`/`tester`/`.nexus` 출처 중 하나 필수), context·memory 능동 제안 정책 강화, 실행 흐름·사이클 보고·skill/MCP 카탈로그 섹션 제거(하네스·skill 본문과 중복). (2) **nx-plan** — Absolute Rules 3개(Lead 단독 결정 금지, 비교표 출력 후 강제 stop, 사용자 응답 보수적 해석). (3) **nx-auto-plan** — Absolute Rules 3개(자율 결정, 결정 유도 출력 금지, 안건 사이 멈춤 금지). (4) **nx-run** — 보고 형식 5항목 확장(변경사항·주요결정·다음단계·미해결질문·리스크). 영향받은 sync 산출물: `agents/lead.md`, `skills/nx-plan/SKILL.md`, `skills/nx-auto-plan/SKILL.md`, `skills/nx-run/SKILL.md`.

### Notes

- 사용자가 인지할 동작 변경: Lead의 substantive 응답이 `[Pre-check]` 블록으로 시작하는 것이 기본. 이전 버전과 응답 형식이 다르게 느껴질 수 있으나 정상 동작.
- nx-plan은 결정 시점에 반드시 멈춤(사용자 응답 없이 진행 안 함). nx-auto-plan은 안건 결정 사이에서 절대 멈추지 않음.
- Trigger 태그(`[plan]`, `[auto-plan]`, `[run]`)와 MCP 도구 인터페이스는 동일. 사용자 조치 불필요.

## [0.31.3] - 2026-04-22

### Changed

- `@moreih29/nexus-core` **v0.19.1 → v0.19.2** 채택 (upstream PR #65, "fix(plan): make resume macro explicit in planning skills"). `nx-plan` / `nx-auto-plan` Step 4.2에서 resume 분기가 자연어 "continue with the existing session"에서 하네스 구체 매크로 `SendMessage({ to: "<id>", message: "<resume prompt>" })`로 교체. Lead가 resume 경로를 고를 때 실제 호출 형태를 문서가 직접 보여주므로 `name` 혼동의 두 번째 경로도 차단됨. 영향받은 sync 산출물: `skills/nx-plan/SKILL.md`, `skills/nx-auto-plan/SKILL.md`.

## [0.31.2] - 2026-04-22

### Changed

- `@moreih29/nexus-core` **v0.19.0 → v0.19.1** 채택 (upstream PR #61, "fix(plan): require spawn agent id for resume records"). claude-nexus 이슈 #58 upstream 반영분. Lead가 종료된 서브에이전트를 resume할 때 `SendMessage({ to: <name> })`는 동작하지 않고 spawn 도구가 반환한 agent id(UUID) 필수라는 실측을 canonical 가이드가 명확히 반영. 영향받은 sync 산출물: `agents/lead.md`, `skills/nx-plan/SKILL.md`, `skills/nx-auto-plan/SKILL.md`. upstream PR #60(opencode skill frontmatter)·PR #62(codex nx launcher)는 다른 하네스 대상이라 본 플러그인에 영향 없음.

## [0.31.1] - 2026-04-22

### Fixed

- 플러그인 MCP 서버가 같은 이름(`nexus-core`)으로 **이중 등록**되어 `/mcp`에서 "Failed to reconnect to nexus-core"가 반복되던 문제. 원인은 플러그인 루트의 `.mcp.json`이 (1) 플러그인 manifest로 로드되는 경로와 (2) cwd가 플러그인 레포일 때 project-scoped MCP로도 로드되는 경로에서 동시에 읽혔기 때문. project-scoped 경로는 `${CLAUDE_PLUGIN_ROOT}` 변수를 치환하지 않아 `MODULE_NOT_FOUND`로 실패하며 재시도를 누적시킴. MCP 선언을 `.claude-plugin/plugin.json`의 인라인 `mcpServers` 필드로 이전하고 루트 `.mcp.json`을 제거해 이중 로드 경로 자체를 제거.

## [0.31.0] - 2026-04-22

### Changed

- `@moreih29/nexus-core` **v0.18.2 → v0.19.0** 채택 (upstream PR #56, "fix(plan): make nx_plan_decide decision-only"). MCP 번들(`dist/mcp/server.js`)과 sync 산출물(`skills/nx-plan/SKILL.md`, `skills/nx-auto-plan/SKILL.md`) Step 5 가이드가 새 계약에 맞춰 갱신됨.

### Breaking (upstream MCP contract passthrough)

- `nx_plan_decide` input 스키마에서 `how_agents` / `how_summary` / `how_agent_ids` 3개 필드 제거. 최종 결정 텍스트·상태만 저장하며 `issue.analysis`는 변형하지 않음.
- `issue.analysis`는 이제 **append-only** — HOW 기여 기록은 오직 `nx_plan_analysis_add(issue_id, role, agent_id?, summary)`를 통해 Step 4에서 쌓아야 함. Step 7 task 분해는 그 누적 기록을 참조.

### Consumer Action Required

- MCP 도구를 **직접** 호출해 `nx_plan_decide`에 `how_*` 필드를 넣고 있던 외부 소비자는 해당 필드를 제거해야 함. Lead 최종 synthesis는 `decision` 필드로만 전달.
- HOW 분석은 계속 `nx_plan_analysis_add`로 기록 유지. 사후에 HOW를 추가 실행해야 하면 재spawn/resume 후 analysis 엔트리를 새로 append.
- Nexus 스킬(`[plan]` / `[auto-plan]`)을 정상 경로로 사용하는 경우에는 사용자측 조치 없음 — 갱신된 SKILL 가이드가 자동으로 새 계약을 준수.

## [0.30.1] - 2026-04-22

### Fixed

- `bin` 이름을 `claude-nexus-statusline` → **`claude-nexus`**로 변경. v0.30.0 README의 `bunx claude-nexus-statusline`은 bunx/npx가 해당 이름의 npm 패키지를 찾으려 시도해 404로 깨지는 문제. package 이름과 bin 이름을 일치시켜 `bunx claude-nexus` · `bun add -g claude-nexus && claude-nexus` 양쪽 모두 동일 명령으로 동작.

### Consumer Action Required

v0.30.0에서 이미 `statusLine`을 설정한 사용자는 `~/.claude/settings.json`의 `statusLine.command`를 `claude-nexus-statusline` → `claude-nexus`(또는 `bunx claude-nexus`)로 수정.

## [0.30.0] - 2026-04-22

### Reset

v0.29.0 구현을 전면 폐기하고 nexus-core canonical 스펙에만 맞춰 재설계.

### Added

- nexus-core v0.18.2 canonical 에이전트 10종 (`nexus-sync` 생성)
- canonical 스킬 3종: `nx-auto-plan`, `nx-plan`, `nx-run`
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` self-marketplace
- `nexus-core` MCP 서버 번들 (`dist/mcp/server.js`) — 마켓플레이스 설치 시 `node_modules` 불필요
- `SessionStart` 훅 — `.nexus/` 구조와 화이트리스트 `.gitignore` 보장
- `UserPromptSubmit` 훅 — 태그 6종 (`[plan]`·`[auto-plan]`·`[run]`·`[m]`·`[m:gc]`·`[d]`) 라우팅
- `settings.json`: `agent: "lead"` + `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 활성
- `scripts/statusline.mjs` + `bin.claude-nexus-statusline` — 2줄 statusline CLI (v0.27.0에서 복구). 라인1: `◆Nexus vX.Y.Z` + 모델 + 프로젝트 + git 브랜치(staged/unstaged 카운트). 라인2: ctx + 5h + 7d 게이지(리셋 남은 시간, OAuth usage API, `~/.claude/.usage_cache`로 로컬 세션 간 캐시 공유). 사용자는 `bunx claude-nexus-statusline` 또는 전역 설치 후 `claude-nexus-statusline` 명령을 `~/.claude/settings.json`의 `statusLine.command`에 지정.

### Removed (consumer action required)

`@moreih29/nexus-core`에 canonical로 정의되지 않은 것은 모두 제거. v0.29.0 이하 사용자가 의존했다면 upstream 이슈로 제안해야 함.

- 스킬: `nx-init`, `nx-sync`, `nx-setup`
- 훅: `SubagentStart`, `SubagentStop`, `PostToolUse`(Edit 텔레메트리)
- 태그: `[sync]`, `[rule]`
- `VERSION` 파일 — 버전은 `package.json` + `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` 3곳 동기로 단순화
- `CLAUDE.md`의 `<!-- NEXUS:START/END -->` 마커 관례
