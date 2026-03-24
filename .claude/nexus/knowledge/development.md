<!-- tags: development, build, conventions, testing -->
# Development

## Tech Stack

- **언어**: TypeScript (strict, ES2022)
- **런타임**: bun (빌드/테스트/패키지 관리 모두)
- **번들러**: esbuild → CJS (node20 타겟)
- **의존성**: `@modelcontextprotocol/sdk`, `zod`, `@ast-grep/napi` (optional)
- **빌드 산출물**: `bridge/mcp-server.cjs`, `scripts/gate.cjs`, `scripts/statusline.cjs`

## Dev Cycle

```
src/ 수정 → bun run dev (빌드 + 플러그인 캐시 동기화) → nexus-test 프로젝트에서 검증
```

- `bun run dev` = `node esbuild.config.mjs && node dev-sync.mjs`
- `dev-sync.mjs`가 빌드 산출물 + agents + skills + hooks 등을 `~/.claude/plugins/cache/nexus/` 에 동기화
- E2E 테스트: `bash test/e2e.sh` (33개 테스트)

## Conventions

- Hook I/O: stdin으로 JSON 수신 → `readStdin()` 파싱 → `respond(obj)` 또는 `pass()`로 응답
- MCP 도구: `server.tool(name, description, schema, handler)` 패턴. zod 스키마.
- 경로: `src/shared/paths.ts`에서 중앙 관리. `PROJECT_ROOT`, `KNOWLEDGE_ROOT`, `BRANCH_ROOT`.
- 에이전트 정의: `agents/{name}.md` frontmatter에 model, maxTurns, disallowedTools 등 명시.
- 스킬 정의: `skills/{name}/SKILL.md` frontmatter에 name, description, triggers, disable-model-invocation 등.

## Release

- `release.mjs`: version bump → CHANGELOG → build → test → commit → tag → push → npm publish → gh release
- 프로젝트 로컬 deploy 스킬 (`.claude/skills/deploy/`): pre-release 검증 + release.mjs 실행
