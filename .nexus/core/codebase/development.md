<!-- tags: development, build, conventions, testing -->
<!-- tags: development, build, conventions, testing -->
# Development

## Tech Stack

- **Language**: TypeScript (strict, ES2022)
- **Runtime**: bun (for build/test/package management)
- **Bundler**: esbuild → CJS (node20 target)
- **Dependencies**: `@modelcontextprotocol/sdk`, `zod`, `@ast-grep/napi` (optional)
- **Build outputs**: `bridge/mcp-server.cjs`, `scripts/gate.cjs`, `scripts/statusline.cjs`, `templates/nexus-section.md`

## Dev Cycle

```
Modify src/ → bun run dev (build + template generation + plugin cache sync) → verify in nexus-test project
```

- `bun run dev` = `node esbuild.config.mjs && node dev-sync.mjs`
- `esbuild.config.mjs` bundles TS then calls `generate-template.mjs` to auto-update `templates/nexus-section.md` + CLAUDE.md markers
- `dev-sync.mjs` syncs build outputs + agents + skills + hooks + templates etc. to `~/.claude/plugins/cache/nexus/` (syncs to latest version directory using semver sorting)
- E2E tests: `bash test/e2e.sh` (45 tests)

## Template Generation

`generate-template.mjs` runs automatically at build time:
1. Read `name`, `task` fields from `agents/*.md` frontmatter
2. Read `name`, `trigger_display`, `purpose` fields from `skills/*/SKILL.md` frontmatter
3. Read tag metadata from `src/data/tags.json`
4. Generate `templates/nexus-section.md` (Agent Routing + Skills + Tags tables)
5. Update the content inside `<!-- NEXUS:START/END -->` markers in the project `CLAUDE.md` with the template

## Conventions

- Hook I/O: Receive JSON via stdin → parse with `readStdin()` → respond with `respond(obj)` or `pass()`
- MCP tools: `server.tool(name, description, schema, handler)` pattern. zod schemas. Paths resolved via `STATE_ROOT` constant.
- Paths: Centrally managed in `src/shared/paths.ts`. `PROJECT_ROOT`, `NEXUS_ROOT`, `STATE_ROOT`, `CORE_ROOT`, `LAYERS`, `corePath()`, `coreLayerDir()` (for core layers).
- Agent definitions: `agents/{name}.md` frontmatter specifies model, maxTurns, task, disallowedTools, etc.
- Skill definitions: `skills/{name}/SKILL.md` frontmatter specifies name, description, trigger_display, purpose, triggers, disable-model-invocation, etc.
- Current skills count: 5 (nx-run, nx-plan, nx-init, nx-setup, nx-sync)

## Release

- `release.mjs`: version bump → CHANGELOG → build → test → commit → tag → push → npm publish → gh release
- Project-local deploy skill (`.claude/skills/deploy/`): pre-release validation + run release.mjs
