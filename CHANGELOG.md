# Changelog

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
