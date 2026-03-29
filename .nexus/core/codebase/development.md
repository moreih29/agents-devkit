<!-- tags: development, build, conventions, testing -->
# Development

## Tech Stack

- **언어**: TypeScript (strict, ES2022)
- **런타임**: bun (빌드/테스트/패키지 관리 모두)
- **번들러**: esbuild → CJS (node20 타겟)
- **의존성**: `@modelcontextprotocol/sdk`, `zod`, `@ast-grep/napi` (optional)
- **빌드 산출물**: `bridge/mcp-server.cjs`, `scripts/gate.cjs`, `scripts/statusline.cjs`, `templates/nexus-section.md`

## Dev Cycle

```
src/ 수정 → bun run dev (빌드 + 템플릿 생성 + 플러그인 캐시 동기화) → nexus-test 프로젝트에서 검증
```

- `bun run dev` = `node esbuild.config.mjs && node dev-sync.mjs`
- `esbuild.config.mjs`가 TS 번들 후 `generate-template.mjs`를 호출하여 `templates/nexus-section.md` + CLAUDE.md 마커 자동 갱신
- `dev-sync.mjs`가 빌드 산출물 + agents + skills + hooks + templates 등을 `~/.claude/plugins/cache/nexus/` 에 동기화 (semver 정렬로 최신 버전 디렉토리에 동기화)
- E2E 테스트: `bash test/e2e.sh` (32개 테스트)

## Template Generation

`generate-template.mjs`가 빌드 시 자동 실행:
1. `agents/*.md` frontmatter에서 `name`, `task` 필드 읽기
2. `skills/*/SKILL.md` frontmatter에서 `name`, `trigger_display`, `purpose` 필드 읽기
3. `src/data/tags.json`에서 태그 메타데이터 읽기
4. `templates/nexus-section.md` 생성 (Agent Routing + Skills + Tags 테이블)
5. 프로젝트 `CLAUDE.md`의 `<!-- NEXUS:START/END -->` 마커 내부를 템플릿으로 갱신

## Conventions

- Hook I/O: stdin으로 JSON 수신 → `readStdin()` 파싱 → `respond(obj)` 또는 `pass()`로 응답
- MCP 도구: `server.tool(name, description, schema, handler)` 패턴. zod 스키마. 경로는 `STATE_ROOT` 상수로 해결.
- 경로: `src/shared/paths.ts`에서 중앙 관리. `PROJECT_ROOT`, `NEXUS_ROOT`, `STATE_ROOT`, `CORE_ROOT`, `LAYERS`, `corePath()`, `coreLayerDir()`(core 계층용).
- 에이전트 정의: `agents/{name}.md` frontmatter에 model, maxTurns, task, disallowedTools 등 명시.
- 스킬 정의: `skills/{name}/SKILL.md` frontmatter에 name, description, trigger_display, purpose, triggers, disable-model-invocation 등.

## Release

- `release.mjs`: version bump → CHANGELOG → build → test → commit → tag → push → npm publish → gh release
- 프로젝트 로컬 deploy 스킬 (`.claude/skills/deploy/`): pre-release 검증 + release.mjs 실행