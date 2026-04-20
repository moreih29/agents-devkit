# Changelog

## [0.29.0] - 2026-04-20

### Consumer Action Required

없음. `@moreih29/nexus-core` v0.17.0은 consumer 측 추가 작업 없이 `bun run sync` 재실행으로 Managed 산출물이 자동 갱신됩니다.

### Fixed

v0.28.2 릴리스 직후 빈 프로젝트 e2e 검증([#5](https://github.com/moreih29/claude-nexus/issues/5))에서 발견된 4건 regression을 upstream이 [moreih29/nexus-core#50](https://github.com/moreih29/nexus-core/issues/50)에서 일괄 해결 — v0.17.0 채택으로 전부 복구.

- **MCP server session_id wiring (P0)** — MCP 서버가 Claude Code로부터 session_id를 전달받을 채널이 없어 `unknown-<pid>`로 폴백하던 문제. `.nexus/state/` 경로가 hook 쓰는 디렉터리와 MCP 쓰는 디렉터리로 쪼개져 `prompt-router`의 `hasPlan`/`hasTasks`가 항상 false → `[d]` 태그 영구 block, `[run]` 태그 `plan:auto` 우회. upstream이 **parent-PID keyed side-channel**(`.nexus/state/runtime/by-ppid/<process.ppid>.json`)로 해결 — `session-init` hook이 SessionStart 시 기록하고 `paths.ts:getSessionId()`가 `process.ppid` 기반으로 읽음. 병렬 harness 세션도 ppid가 달라 race-free.
- **agent-bootstrap assets lookup (P1)** — `loadValidRoles(cwd)`가 `join(cwd, "assets/agents")` FS lookup에 의존해 consumer 설치에서 항상 `validRoles=[]` early-return, 모든 subagent의 memory/context index 주입이 skip되던 문제. v0.16.1 prompt-router에 적용된 `globalThis.__NEXUS_INLINE_*__` inline 패턴을 `agent-bootstrap` entry에도 확장.
- **agent-tracker populate 주체 부재 (P1)** — `agent-tracker.json`에 running entry를 append 하는 코드 경로가 존재하지 않아 `agent-finalize`의 update가 영구 no-op이던 문제. `agent-bootstrap` SubagentStart 시점에 `updateJsonFileLocked` 기반 idempotent append 추가. 추가로 `post-tool-telemetry` hook의 over-declared capability가 제거되어 `hooks/hooks.json`에 `post-tool-telemetry` 엔트리가 신규 등록되고 `tool-log.jsonl` append가 활성화됨.
- **stale model IDs (P0)** — `agents/*.md` frontmatter의 `model: claude-opus-4` / `claude-sonnet-4` / `claude-haiku-4`가 유효하지 않은 ID여서 subagent spawn이 outright 실패하던 문제. upstream이 alias(`opus` / `sonnet` / `haiku`)로 교체 + `scripts/build-agents.ts:validateClaudeModel()` 빌드타임 gate 도입. 이번 `bun run sync` 결과 10개 `agents/*.md`의 `model` 필드가 모두 alias로 재생성됨.

### Changed

- `@moreih29/nexus-core` devDep `^0.16.1` → `^0.17.0`
- `agents/*.md` — `model` 필드가 alias(`opus` / `sonnet` / `haiku`)로 재생성. 향후 신규 dated model ID 릴리스마다 agent 파일을 업데이트할 필요 없음 (Claude Code latest-in-series resolution에 위임).
- `hooks/hooks.json` — `post-tool-telemetry` PostToolUse 엔트리 신규 등록.
- `dist/hooks/session-init.js` / `agent-bootstrap.js` / `agent-finalize.js` / `prompt-router.js` — Managed 산출물 재생성 (by-ppid side-channel + inline AGENT_ROLES + SubagentStart tracker append 반영).

### Added

- `dist/hooks/post-tool-telemetry.js` — Managed 산출물 신규 추가. `tool-log.jsonl`에 PostToolUse 이벤트를 append해 memory access + file-edit 관측 신호를 제공.

### Notes

- upstream smoke gate에 Case C (session_id side-channel round-trip) + Case D (tracker lifecycle init → bootstrap → finalize) 통합 케이스 2건이 추가되어 이번 class regression은 publish 전 차단됨.
- 이슈 [#5](https://github.com/moreih29/claude-nexus/issues/5) follow-up 중 C3(v0.28.3 patch 문서화)·C4(`.mcp.json` env 조사)는 upstream fix 채택으로 무효화되어 폐기. C2(`test/e2e.sh` regression gate 강화)는 upstream `validateClaudeModel()` + smoke Case C/D가 cover하므로 이번 사이클에서 보류.

## [0.28.2] - 2026-04-20

### Consumer Action Required

**v0.28.0 / v0.28.1 사용자는 즉시 업데이트하십시오.** 이 두 릴리즈 기간 동안 플러그인의 모든 Claude Code 훅(`session-init`, `prompt-router`, `agent-bootstrap`, `agent-finalize`)이 no-op 상태였습니다 — upstream `@moreih29/nexus-core` v0.15.1~v0.16.0의 번들 entrypoint bootstrap 누락(Issue [moreih29/nexus-core#39](https://github.com/moreih29/nexus-core/issues/39)) 및 prompt-router runtime asset lookup 실패(Issue [moreih29/nexus-core#46](https://github.com/moreih29/nexus-core/issues/46)).

**영향 범위**:

- `.nexus/state/<session_id>/` 디렉토리, `agent-tracker.json`, `tool-log.jsonl`이 생성되지 않음
- `[run]` / `[plan]` / `[sync]` / `[d]` / `[m]` / `[rule]` 태그 dispatch 전부 dead
- SubagentStart/Stop 기반 finalization(files_touched 집계, role-specific rule injection 등) 전부 dead
- Claude Code는 모든 훅에 대해 `hook success: OK`만 로그 — 실제 handler는 한 번도 호출되지 않음
- MCP 도구(`nx_task_*`, `nx_plan_*`)는 별도 프로세스라 정상 작동. 훅과 교차 상호작용하는 흐름(task close 리마인더 등)만 영향

**마이그레이션**: 불필요. 이전에 생성되지 않은 상태는 그대로 없음. 이번 업데이트 후 새 세션에서 훅이 정상 작동하여 상태가 자동 생성됩니다.

**업데이트 방법**: Claude Code 플러그인 auto-update 대기 또는 수동 재설치:

```
claude plugin reinstall claude-nexus
```

### Fixed

- upstream `@moreih29/nexus-core` v0.15.1~v0.16.0 훅 번들 regression 2종 복구 (nexus-core #39 / #46). v0.16.1 채택으로 4개 훅 전부 handler 실제 호출 확인.

### Changed

- `@moreih29/nexus-core` `^0.15.1` → `^0.16.1`
- `dist/hooks/session-init.js`, `agent-bootstrap.js`, `agent-finalize.js`, `prompt-router.js` — Managed 산출물 재생성 (bootstrap 주입 + prompt-router는 invocations inline 포함)

### Added

- `test/e2e.sh` — hook-invocation side-effect smoke 섹션. `session-init`은 `.nexus/state/<sid>/agent-tracker.json` 생성 assert, `prompt-router`는 `[run]` 태그에 대한 `<system-notice>` emit assert, `agent-bootstrap`/`agent-finalize`는 exit 0 assert. 27 check → 31 check. upstream smoke-consumer gate와 별개로 consumer 로컬에서도 동일 class regression 차단.

## [0.28.1] - 2026-04-20

### Fixed

- `test/e2e.sh`가 v0.27 레거시 (`bridge/mcp-server.cjs`, `scripts/gate.cjs`, `src/hooks/gate.ts`, `nx_context`, `nx_ast_*`, `test/conformance.mjs` 등 모두 삭제됨)를 참조해 publish workflow E2E 단계에서 실패하던 문제 복구. 래퍼 정체성에 맞게 smoke 수준으로 재작성 — Managed 산출물 존재·`.mcp.json` 경로 유효성·`statusline.mjs` 실행·plugin manifest 유효성·`nexus-core validate` 통과만 검증 (27 check).

## [0.28.0] - 2026-04-20

<!-- nx-car:v0.28.0:start -->

### Consumer Action Required

**1. .mcp.json MCP 서버 경로 변경**

claude-nexus 자체 MCP 서버(`bridge/mcp-server.cjs`)가 폐기되었습니다. `.mcp.json`의 `command` 경로를 nexus-core 배포 바이너리로 교체해야 합니다.

```json
// 변경 전
{ "command": "node", "args": ["bridge/mcp-server.cjs"] }

// 변경 후
{ "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/node_modules/@moreih29/nexus-core/dist/src/mcp/server.js"] }
```

이번 릴리즈에서 claude-nexus 리포 내 `.mcp.json`은 이미 갱신되었습니다. `bun run sync` 실행 시 템플릿 기반으로 자동 적용됩니다.

**2. 상태 파일 경로 per-session 격리**

`.nexus/state/tasks.json` / `.nexus/state/plan.json`(단일 루트)이 `.nexus/state/<session_id>/tasks.json` / `.nexus/state/<session_id>/plan.json`으로 변경되었습니다. 기존 파일은 자동 마이그레이션되지 않습니다.

업그레이드 후 stale 상태 파일이 남아 있으면 수동 삭제하십시오:

```bash
rm -f .nexus/state/tasks.json .nexus/state/plan.json
```

이후 새 세션에서 상태 파일은 `<session_id>` 하위 디렉터리에 자동 생성됩니다.

**3. nx_ast_* / nx_context MCP 도구 제거**

`nx_ast_search`, `nx_ast_replace`, `nx_context` 도구가 claude-nexus MCP 서버 폐기와 함께 사라졌습니다. 대체 방법:

- AST/구조 검색: `Grep` + LSP `nx_lsp_find_references` 조합
- 컨텍스트 요약: `nx_task_list` 호출 또는 `.nexus/state/<session_id>/tasks.json` 직접 `Read`

이 도구들을 참조하는 기존 `.nexus/context/` 문서나 워크플로가 있다면 위 대체 경로로 수동 수정하십시오.

**4. CLAUDE.md auto-sync 상실 — 최초 1회 수동 머지 필요**

기존 플러그인이 global/project CLAUDE.md의 `NEXUS:START` / `NEXUS:END` 블록을 훅을 통해 자동으로 재기입하던 기능이 제거되었습니다.

v0.28.0 설치 직후 다음 단계를 수행하십시오:

1. `bun run sync` 실행 — 최신 템플릿 기반 블록 내용 출력
2. 출력 내용을 global CLAUDE.md(`~/.claude/CLAUDE.md`) 및 project CLAUDE.md의 `NEXUS:START` / `NEXUS:END` 블록 사이에 수동으로 붙여넣기
3. 이후 업그레이드 시에는 `[sync]` 태그 또는 `nx-sync` 스킬이 동일 역할을 담당

**5. PreToolUse Edit/Write task gate 소멸**

`tasks.json`이 존재할 때 `Edit` / `Write` 도구 호출을 차단하던 PreToolUse 훅 게이트가 제거되었습니다. `tasks.json`은 이제 advisory 역할만 합니다(강제 차단 없음). `[run]` 스킬 내부의 task pipeline 가이드는 유지됩니다.

기존에 이 게이트에 의존하는 워크플로가 있다면, `[run]` 스킬 호출을 통한 명시적 task 관리로 전환하십시오.

**6. PostCompact 세션 스냅샷 상실**

컴팩션 이후 Mode / Plan / Knowledge / Agents 상태를 자동 복원하던 PostCompact 훅이 제거되었습니다. 컴팩션 후 상태 확인은 다음 도구로 수동 수행하십시오:

```
nx_plan_status   — 현재 플랜 단계 및 결정 목록 조회
nx_task_list     — 활성 태스크 목록 조회
```

장기 세션에서 컴팩션이 발생하면 상태를 직접 재확인한 후 작업을 재개하십시오.

**7. @ast-grep/napi 네이티브 의존성 제거**

`@ast-grep/napi`가 `package.json`에서 제거되었습니다. 기존 설치에서 업그레이드 시 `bun install`로 자동 정리됩니다:

```bash
bun install
```

<!-- nx-car:v0.28.0:end -->

### Added
- `scripts/statusline.mjs` — 단일 Node ESM statusline (외부 의존성 0, 빌드 불필요)
- nexus-core v0.15.1 sync 기반 빌드 파이프라인 — `agents/`, `skills/`, `hooks/`, `dist/hooks/`, `settings.json` Managed 산출물 자동 생성
- `hooks/hooks.json` v0.15 새 포맷 — 5 캐노니컬 훅(session-init / agent-bootstrap / agent-finalize / post-tool-telemetry / prompt-router) dispatch
- `dist/hooks/*.js` 사전 컴파일된 훅 핸들러 (git-tracked)

### Changed
- **정체성 재정의**: claude-nexus가 nexus-core의 순수 Claude Code 래퍼로 전환. 자체 MCP·hook·build 파이프라인 모두 폐기
- `package.json` scripts 재작성 — `bun run sync`가 build/generate 역할을 모두 대체
- `.claude-plugin/plugin.json` / `marketplace.json` — Template 산출물로 분류. sync가 최초 1회만 생성하며 이후 consumer 소유
- `agents/` 10개(lead primary 포함), `skills/` 4개 — nexus-core upstream 관리 Managed 산출물
- `CLAUDE.md`, `.nexus/context/architecture.md`, `.nexus/rules/development.md` — 래퍼 정체성 반영하여 갱신

### Removed
- `src/` 전체 (17 TS 파일) — 자체 MCP (`src/mcp/`), hook (`src/hooks/`), shared, statusline, code-intel 구현
- `bridge/mcp-server.cjs` — esbuild 번들 산출물
- `scripts/gate.cjs`, `scripts/statusline.cjs` — esbuild 번들 산출물 (`statusline.mjs`로 재작성)
- `esbuild.config.mjs`, `tsconfig.json`, `dev-sync.mjs` — 빌드 파이프라인
- `generate-from-nexus-core.lib.mjs`, `generate-from-nexus-core.mjs`, `generate-template.mjs` — 자체 codegen
- `invocation-map.yml`, `harness-content/`, `templates/` — sync로 대체된 자산
- `test/conformance.mjs`, `test/unit/` — nexus-core upstream 테스트로 대체
- `nx_ast_search`, `nx_ast_replace`, `nx_context` MCP 도구 — 실사용 흔적 0건으로 드랍
- 의존성 제거: `@ast-grep/napi`, `@modelcontextprotocol/sdk`, `zod`, `esbuild`, `typescript`, `@types/node`, `yaml`

### Fixed
- (없음 — 이번 릴리즈는 정체성 재정의, 버그 fix 없음)

## 0.27.0 (2026-04-16)

### Features
- memory-access observation hook — PostToolUse에서 `.nexus/memory/` Read 이벤트를 catch하여 `.nexus/state/claude-nexus/memory-access.jsonl`에 4-field(`path`/`last_accessed_ts`/`access_count`/`last_agent`) upsert. nexus-core v0.10.0 `conformance/state-schemas/memory-access.schema.json` 준수. P4 `[m:gc]` manual gate의 proposed deletion list 근거로 활용 가능.

### Changed
- upgrade `@moreih29/nexus-core` to ^0.10.0 — `skills/nx-plan` Step 7 conditional auto-pairing 재작성(researcher/refactor/type-only/docs-adjacent 제외), `vocabulary/task-exceptions.yml`(4 entries: `docs_only.coherent`/`docs_only.independent`/`same_file_bundle`/`generated_artifacts`), `vocabulary/memory_policy.yml`(5 sections), `vocabulary/invocations.yml`에 `memory_read_observation` primitive 추가, `[m]`/`[m:gc]` tags에 `prose_guidance` 필드 추가. body_hash 재생성 → skills/agents 재빌드.

### Docs
- `.nexus/context/orchestration.md` — conditional auto-pairing + task-exception catalog + Dedup Layer 1 canonical + memory policy 3 카테고리(empirical/external/pattern, primer 제외)·naming contract·manual gate forgetting·merge-before-create + memory-access observation 반영. 거부 항목(cap 수치, streaming, Layer 2 wave-time, wave_id, P1 수치 enforcement)은 consumer-local 재량임을 명기. upstream MIGRATIONS/v0_9_to_v0_10.md 근거.

## 0.26.4 (2026-04-15)

### Fixes
- PostToolUse 훅 등록 — tool-log.jsonl 실전 미기록 버그 수정

### Other
- Merge branch 'fix/posttooluse-hook-registration'
- Merge branch 'chore/nexus-core-0.9.0-sync'

## 0.26.3 (2026-04-15)

### Fixes
- plan alias 제거 — nx-plan 스킬과 built-in Plan 에이전트 구분
- built-in subagent_type 대소문자 alias 매핑 추가

### Other
- Merge branch 'chore/nexus-core-0.8.0-sync'

## 0.26.2 (2026-04-14)

### Other
- Merge branch 'chore/nexus-core-consuming-sync'
- Merge branch 'chore/nexus-core-0.6.0-sync'

## 0.26.1 (2026-04-13)

### Other
- Merge branch 'chore/nexus-core-0.5.0-sync'
- Merge branch 'chore/nexus-core-0.4.0-sync'

## 0.26.0 (2026-04-12)

### Features
- upgrade nexus-core to v0.3.0 — nx-setup consumer transition + body neutralization
- inject harness_docs_refs resume invocation into skill bodies + add upgrade protocol
- upgrade nexus-core to v0.2.0 — local capability map + manifest summary adoption

### Fixes
- align state files with nexus-core conformance schemas + add conformance test runner

## 0.25.1 (2026-04-11)

### Changed
- **nx-init** is now manual-only (`disable-model-invocation: true`). Invoke explicitly with `/claude-nexus:nx-init`. Previously Claude could auto-trigger it on ambiguous "project setup" prompts. This aligns with nexus-core canonical metadata (`manual_only: true`).

### Refactoring
- regenerate skills + tags.json from nexus-core
- regenerate agents from nexus-core (activate generator)
- add generate-from-nexus-core infrastructure: claude-nexus is now a build-time read-only consumer of `@moreih29/nexus-core ^0.1.2`. Agent/skill definitions + `src/data/tags.json` are regenerated from the upstream canonical source on every build, with sha256 body_hash verification and tag drift detection against `gate.ts HANDLED_TAG_IDS`.

### Infrastructure
- migrate npm publish to GitHub Actions OIDC Trusted Publishing. Release flow: `node release.mjs` → local version bump + build + tag push → `.github/workflows/publish-npm.yml` (Node 24, no tokens, SLSA v1 provenance via `npm publish --provenance --access public`).
- context docs (`.nexus/context/architecture.md`, `.nexus/context/orchestration.md`) updated to reflect the new build pipeline, release pipeline, and Nexus 3-layer ecosystem position.

## 0.25.0 (2026-04-10)

### Features
- nx-run SKILL Step 4 — integrate git commit into cycle complete
- add nx_history_search tool + fix auto-pairing scope
- resume_tier Phase 2 Cycle C — e2e tier scenario (Phase 2 complete)
- resume_tier Phase 2 Cycle B — MCP signature extension
- resume_tier Phase 2 Cycle A — gate.ts infrastructure
- introduce resume_tier scheme for subagent persistence (Phase 1)

## 0.24.1 (2026-04-09)

### Refactoring
- add [sync] handler, simplify nx-setup, drop config.json
- nx-init essentials + flatten .nexus/ structure on disk

### Other
- merge: chore/nx-init-essentials — nx-init essentials redesign, .nexus/core/ removal

## 0.24.0 (2026-04-08)

### Refactoring
- redesign context management — flatten .nexus/ structure, remove 4 MCP tools

### Other
- merge: feat/context-management-redesign — context management redesign, flat .nexus/ structure

## 0.23.1 (2026-04-08)

### Other
- merge: feat/agent-spec-enhancement — agent spec common structure + reinforcement

## 0.23.0 (2026-04-08)

### Features
- restructure plan/run skills — HOW opt-out, auto quality, escalation chain, language unification

### Fixes
- remove execution details from plan SKILL.md to enforce run skill loading

### Other
- merge: feat/skill-structural-improvements — plan/run/init/sync/setup skill restructuring
- merge: fix/plan-run-transition — enforce run skill loading by removing plan execution details

## 0.22.0 (2026-04-07)

### Features
- replace nx_briefing with SubagentStart lazy-read index injection

### Other
- merge: feat/briefing-lazy-read — SubagentStart lazy-read index injection

## 0.21.0 (2026-04-06)

### Features
- deterministic skill loading — BLOCKING invoke, trigger tags, pre-checks

## 0.20.0 (2026-04-06)

### Features
- TUI progress default + archive review cycles
- task close enforcement + plan document auto-generation
- hook gap analysis — PostCompact, core index injection, stop_hook_active, discuss removal
- owner delegation in plan Step 7, lead role definition
- agent definitions refinement — tester, acceptance verification, role boundaries
- skill spec refinements — plan:auto, delegation criteria, comparison tables
- redesign v0.20 — subagent architecture, plan-then-execute

## 0.19.0 (2026-04-01)

### Features
- consult → meet 스킬 전면 재설계

### Fixes
- meet 스킬 에이전트 스폰 강제 + gate 동작 개선

## 0.18.0 (2026-03-31)

### Features
- 에이전트 스폰 전략 — [run] 팀 강제 + lean start + 에스컬레이션 기반 확대
- nx-consult 리서치 강제 + Progressive Depth 판별 + 비교표 필수화

### Fixes
- Stop 훅 all completed 무한 루프 방지 — 1회 차단 후 해제

### Other
- Merge branch 'feat/agent-instruction-refinement'
- Merge branch 'feat/consult-skill-tuning'

## 0.17.0 (2026-03-30)

### Features
- nx-sync 스킬 신규 + nx-run Step 5 연동
- [rule] 태그 추가 + consult allComplete 메시지 수정
- Lead 단독 실행 제어 강화 + [run] 태그 + Bash 수정 금지
- briefing rules hint 태그 필터링
- Phase 6단계 재설계 + 코어 문서 갱신 체계 + 52개 stale 참조 해소
- 전 에이전트 Evidence Requirement + Lead 조율 규칙
- 상태파일 관리 개선 + Director 제거
- 구조 재설계 Phase 5 — 10개 에이전트, 기본 오케스트레이션, 하네스 강화
- 하네스 강화 — 루프 감지 + 에스컬레이션 + Memory 자동 기록 (Phase 4)
- 실행 개선 — Lead+Director 상시 팀, nx_briefing, 2단계 검증 (Phase 3)
- 태그+스킬 통합 — [dev]/[research] → [do]/[do!], nx-do 단일 스킬 (Phase 2)
- 에이전트 통합 — Director+Principal 병합 (7→6) (Phase 1b)
- core/ 4계층 구조 도입 (Phase 1a)
- consult 스킬 Intent-First 반영 (Phase 0 완료)

### Refactoring
- 스킬 명세 검토 결정사항 구현
- 에이전트 프롬프트 정비 + category frontmatter
- 컨텍스트 포맷 표준 적용 — 전 문서 영어화 + XML 섹션 태그 통일
- 아이덴티티 재정의 — 자율 오케스트레이터 → 사용자 오케스트레이션 인프라
- .nexus/ 폴더 단일화 + 내부 구조 재설계

### Fixes
- KeywordMatch primitive type union — add 'run'
- gate.ts 프롬프트 검토 결정사항 — 트래커 삭제 + 메시지 정비
- stale 상태 정리 — isNexusInternalPath 범위 축소 + consult_start 자동 아카이빙
- ensureNexusStructure() SessionStart 호출 연결

### Other
- merge: phase-4/harness-reinforcement — 루프 감지 + Memory 자동 기록
- merge: phase-3/execution-improvement — Lead+Director 상시 팀 + nx_briefing + 2단계 검증
- merge: phase-2/tag-skill-unification — [do] 통합 + nx-do 단일 스킬
- merge: phase-1b/agent-consolidation — Director+Principal 병합 (7→6)
- merge: phase-1a/core-structure — core/ 4계층 구조 도입
- merge: phase-0/consult-intent-first — Phase 0 완료
- merge: roadmap — Nexus 재설계 철학/설계/로드맵 수립

## 0.16.0 (2026-03-26)

### Features
- add nx_branch_migrate tool and sub/team path reasoning display

### Other
- merge: feat/branch-state-migrate — nx_branch_migrate 도구 및 판단 근거 표시

## 0.15.2 (2026-03-26)

### Fixes
- improve branch detection and add Branch Guard to dev/research skills

### Other
- merge: fix/branch-detection — 브랜치 인식 개선 및 Branch Guard 추가

## 0.15.1 (2026-03-26)

### Refactoring
- Nexus 구조 점검 — 성능/정합성/안정성 개선

### Other
- merge: chore/full-review — Nexus 구조 점검 개선

## 0.15.0 (2026-03-26)

### Refactoring
- mode.json 제거 + additionalContext 복원

## 0.14.1 (2026-03-26)

### Fixes
- CLAUDE.md 미존재 경로 제거 + consult 스킬 예외 조항 삭제

## 0.14.0 (2026-03-26)

### Features
- tasks.json 파이프라인 강제 — PreToolUse 차단 + UserPromptSubmit 리마인드

### Refactoring
- 구조 리팩토링 — 파이프라인 강제 + 코드 중복 제거 + gate.ts 분해

### Fixes
- 스킬 트리거 강제 — 태그 정규식 수정 + mode.json path 기반 제어

## 0.13.1 (2026-03-25)

### Fixes
- [d] 태그에 행동 규칙 additionalContext 추가
- team-path 팀 종료 예시 추가 (shutdown + TeamDelete)
- sub/team path에서 nx_task_add 필수 + nx_task_close 자동 호출 명시

## 0.13.0 (2026-03-25)

### Features
- 라이프사이클 재설계 + rules 시스템 + 통합 아카이브

## 0.12.0 (2026-03-25)

### Features
- consult 스킬 개선 — 구조화된 상담 절차 + consult.json 상태 관리
- CLAUDE.md 자동 관리 + MCP 동적 브랜치 감지

## 0.11.0 (2026-03-24)

### Features
- nx_artifact_write MCP 도구 추가 — 팀 산출물 브랜치 경로 강제

## 0.10.0 (2026-03-24)

### Refactoring
- init 삭제, sync로 통합 — knowledge 하드코딩 제거, First Run/Reset 모드 추가

## 0.9.0 (2026-03-24)

### Features
- deploy 스킬 추가 — pre-release 검증 + release.mjs 자동화

### Refactoring
- nx-setup Step 3 — 하드코딩 제거, CLAUDE.md에서 런타임 읽기

## 0.8.0 (2026-03-24)

### Features
- 리서치 팀 추가: principal/postdoc/researcher 에이전트 + nx-research 스킬
- 에이전트 시스템 전면 개편: 4인 체제 (director/architect/engineer/qa) + [dev] 통합 스킬
- consult 스킬 경량화: 원칙 기반 프라이머 + [d] 자기강화 루프

### Improvements
- BRANCH_ROOT에 branches/ 세그먼트 추가 + 레거시 마이그레이션
- context.ts RUNTIME_ROOT→BRANCH_ROOT 버그 수정
- 에이전트 프롬프트 영문 통일
- Team Path TodoWrite 지시 제거 (Lead idle 시 불필요)

### Removed
- state/ 세션 데이터 의존성 제거 (수동 정리 가능)

## 0.7.0 (2026-03-23)

### Features
- team TodoWrite 진행 표시 + statusline 사용량 캐시 개선

## 0.6.0 (2026-03-22)

### Features
- nx-sync 범용 재설계 + knowledge 정합성 수정

## 0.5.0 (2026-03-22)

### Features
- [sub] 경량 실행 스킬 + setup 보완 + sync 정합성 수정

## 0.4.0 (2026-03-22)

### Features
- Nexus v2 — setup/team 스킬 재정의 + statusline 래퍼
- Nexus v2 — Team-driven orchestration redesign
- Nexus v2 — Team-driven orchestration redesign
- plan tasks 갱신 리마인더 + stop 훅 debounce
- README 배지 + VERSION 유틸 추출 + statusline E2E 테스트 추가

### Fixes
- plan 스킬 범위 판단 2단계화 + Execute Bridge 제거

### Other
- merge: fix/plan-scope-and-gate → main
- merge: fix/plan-tracking-and-stop-debounce → main
- merge: docs/readme-update → main
- merge: test/plan-skill-validation → main

## 0.3.2 (2026-03-21)

### Fixes
- statusline 버전을 VERSION 파일 + __dirname 상대경로로 참조

## 0.3.1 (2026-03-21)

### Fixes
- statusline 버전 표시 CLAUDE_PLUGIN_ROOT fallback + 릴리즈 노트 개행 깨짐 수정

## 0.3.0 (2026-03-21)

### Features
- 스킬 디렉토리에 nx- 접두사 적용 — 플러그인 네임스페이스 충돌 방지
- 배포 자동화 스크립트 (release.mjs)
- context7 조건부 주입 + setup 추천 플러그인 정리
- statusline 버전 표시 + 사용량 남은시간 ↻ + 캐시 나이 ago 표기

### Refactoring
- dev-sync에서 불필요한 cache 동기화 제거
- plans 저장 경로를 세션 로컬로 이동
- 스킬 nx- 접두사 통일 + dev-sync 격리 + consult→plan 연결 강화

### Fixes
- 위임 강제를 모든 모드에서 동작하도록 변경 + 테스트 업데이트
- delegationEnforcement strict 전환 + pulse 미사용 함수 제거
- dev-sync에 cache 경로 동기화 추가
- nx-plan SKILL.md PERSIST 단계 강화 — MANDATORY + tasks.json 추가
- plans 경로를 세션 독립으로 이동 + PERSIST 강제
- statusline stale → ↻Xm 캐시 나이 표시 + 7d 남은 시간 d/h 단위로 축약
- plan 스킬 main 브랜치 자동 생성 — 사용자 선택 대신 자동 결정
- statusline line2 개선 — 프로그레스바 축소 + 리셋시간 정리 + stale 조건 완화

### Other
- revert: 스킬 nx- 접두사 제거 — 디렉토리명 원복

## 0.2.0 (2026-03-21)

### Features
- **Code Intelligence**: LSP 6도구 + AST search/replace
  - `nx_lsp_hover`, `nx_lsp_goto_definition`, `nx_lsp_find_references`
  - `nx_lsp_diagnostics`, `nx_lsp_document_symbols`, `nx_lsp_workspace_symbols`
  - `nx_ast_search`, `nx_ast_replace` (ast-grep, tree-sitter 기반 다언어)
  - TypeScript/Python/Rust/Go 자동 감지
- **Skills**: consult (대화형 탐색), plan (구조화된 계획), sync (지식문서 동기화)
- **Workflow Phase Tracking**: 훅 기반 자동 상태 전환 (LLM 의존 제거)
- **Agent Model Routing**: 티어별 모델 강제 (Haiku/Sonnet/Opus 선택 기능)
- **Enhanced Setup**: 대화형 설정 위저드, 위임 강제 수준 구성
- **Session Management**: 에이전트 추적, 세션 자동 정리, 오염 방지
- **Knowledge System**: YAML frontmatter 지원, sync 이름 변경, 에이전트별 컨텍스트 수준 분기
- **Pre-Execution Gate**: 명확한 의도 확인 및 강제 이스케이프

### Refactoring
- **Orchestration Redesign**: 모드 기반 워크플로우로 전환 (라우팅 제거)
- **Skill System Redesign**: auto/nonstop/pipeline/parallel 제거, LLM 자율 위임 모델로 전환
- **Configuration**: statusline-preset.json → config.json 통합
- **Testing**: E2E 테스트 3배 속도 향상, 격리 강화
- **Build System**: package-lock.json → bun.lock 전환

### Performance
- Stateless 워크플로우: 훅 기반 phase 추적으로 불필요한 상태 파일 I/O 제거
- 빌드+캐시동기화 최적화: dev-sync에 marketplace 동기화 추가

### Bug Fixes
- 빈 세션 요약 메모 생성 방지
- 상태라인 깜빡임 및 에이전트 추적 불일치 수정
- consult Clarify 단계에서 AskUserQuestion 강제 사용
- AST search: 프로젝트 node_modules fallback 추가

### Breaking Changes
- Removed: auto, nonstop, pipeline, parallel 워크플로우 (mode 기반 설계로 대체)
- Removed: memo 시스템 (진단 목적 제거)
- Renamed: lat_* → nx_* (모든 MCP 도구/상태 키)
- Renamed: sync-knowledge → sync (스킬 간소화)
- Changed: Configuration path consolidation (statusline-preset.json 제거)

## 0.1.0 (2026-03-19)

### Features
- **Core MCP**: nx_state_read/write/clear, nx_knowledge_read/write, nx_context
- **Agents**: Lead, Builder, Finder, Architect, Guard (Phase 1)
- **Workflow**: 기본 상태 추적 및 에이전트 위임
- **Hooks**: Gate (키워드 감지), Pulse (컨텍스트 주입), Tracker (에이전트/세션 추적)
- **Skill**: Default Mode
- E2E 21개 테스트
