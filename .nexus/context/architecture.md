<!-- tags: plugin, integration, context-delivery -->
# Plugin Architecture

Claude Code와 3개 진입점으로 통합:
- **Gate Hook** — 이벤트 기반 인터셉터. 태그 감지 → 모드 라우팅 → 컨텍스트 주입
- **MCP Server** — 도구 등록 게이트웨이. 태스크, 플랜, 코드 인텔리전스 등 구조화된 오퍼레이션 노출
- **Statusline** — 실시간 상태 표시. 브랜치, 태스크 수, 플랜 상태

## 핵심 설계 원칙

**단계별 컨텍스트 전달 (Staged Context Delivery)**: 컨텍스트는 정적이 아님. 런타임 상태(tasks.json, plan.json, .nexus/ 파일)에서 계산되어 결정 시점에 주입됨.

- SessionStart: 구조 초기화
- SubagentStart: .nexus/ 지식 인덱스 lazy-load
- UserPromptSubmit: 태그 감지 → 모드별 가이던스 주입
- PostCompact: 세션 상태 스냅샷 복원

**비차단 가이던스 (Non-blocking Guidance)**: gate.ts는 additionalContext로 "넛지"를 전달. 하드 에러가 아닌 스마트 기본값 제공. 사용자는 무시할 수 있음.

**빌드 파이프라인**: src/ → esbuild 단일 번들 → bridge/mcp-server.cjs + scripts/{gate,statusline}.cjs. 템플릿(nexus-section.md)은 generate-template.mjs가 agents/, skills/, tags.json 메타데이터에서 자동 생성.

esbuild 번들 직후 `generate-from-nexus-core.mjs`가 실행됨 (esbuild.config.mjs ~41번째 줄):

- **Input**: `node_modules/@moreih29/nexus-core/` (devDependency, build-time only)
- **Output**: `agents/*.md` (9개) + `skills/*/SKILL.md` (nexus-core 4개, nx-setup은 consumer-owned) + `src/data/tags.json`
- **harness-local 변환**:
  - `CAPABILITY_TOOL_MAP` — nexus-core semantic capabilities → Claude Code tool names (harness_mapping 제거 대응)
  - `harness_docs_refs` 주입 — manifest skill entry의 harness_docs_refs 키 → `harness-content/{ref}.md` 파일 body 끝에 append
  - **Spec γ 매크로 확장 (v0.8.0)** — `invocation-map.yml` 규칙 기반으로 body.md의 `{{primitive_id ...}}` 토큰을 Claude Code tool 호출 문법으로 확장. 4 primitive × concrete syntax 매핑: `skill_activation` → `Skill(...)`, `subagent_spawn` → `Agent(...)` (built-in role은 `claude-nexus:` prefix 없음), `task_register` → `TaskCreate`/`TaskUpdate`, `user_question` → `AskUserQuestion`. heredoc (`prompt=>>IDENT` ~ `<<IDENT`) multi-line value 지원. primitive enum은 nexus-core `vocabulary/invocations.yml`에서 로드 — unknown primitive는 build 실패.
- **검증 단계**:
  - `manifest.nexus_core_version` vs package.json 의존성 버전 cross-check
  - 각 body.md sha256 vs `manifest.agents[].body_hash` (불일치 시 fail-fast)
  - gate.ts `HANDLED_TAG_IDS` export 상수 ↔ nexus-core `vocabulary/tags.yml` tag id set drift detection (`verifyTagDrift()`)
- **Conformance**: `test/conformance.mjs`가 nexus-core `conformance/` fixtures (state-schemas, tool, scenario)를 동적 로딩하여 검증. TOOL_MAP은 neutral fixture 도구명(`artifact_write`, `history_search` 등) → MCP prefix(`nx_artifact_write`, `nx_history_search`) 매핑. PATH_REMAPS는 fixture의 common-schema 경로(`.nexus/state/artifacts/`)를 consumer의 harness-local 경로(`state/claude-nexus/artifacts/`)로 리매핑.
- `generate-template.mjs`는 generate-from-nexus-core.mjs의 **다운스트림** — agents + skills + tags.json 메타에서 CLAUDE.md의 Nexus 섹션을 렌더링

## Release Pipeline

- **로컬 `release.mjs`**: pre-flight → semver 결정 (conventional commit 기반) → version bump (package.json + plugin.json + marketplace.json + VERSION) → CHANGELOG 자동 생성 → build → e2e → git commit (소스 + 빌드 산출물 bridge/, scripts/) → git tag + push main + push tag
- 로컬에서 npm publish를 직접 호출하지 않음
- Tag push가 `.github/workflows/publish-npm.yml` GitHub Actions 워크플로우를 자동 트리거
- **CI 단계**: Bun 1.3 + Node 24 (registry-url 없음, npm 11+ 필수) → bun install --frozen-lockfile → bun run build:types → version match check (git tag vs package.json) → bash test/e2e.sh → npm pack --dry-run → `npm publish --provenance --access public`
- **인증**: OIDC Trusted Publishing only — npm tokens 없음, NODE_AUTH_TOKEN 없음, 2FA OTP 없음
- **결과**: SLSA v1 provenance attestation이 npm 패키지에 첨부됨

## Nexus Ecosystem Position

> **내부 아키텍처 문서 전용.** 외부 README/마케팅에 이 프레임 사용 금지 — `.nexus/memory/nexus-ecosystem-primer.md` §7 참조.

3층위 모델:

- **Authoring layer**: `@moreih29/nexus-core` — prompt body, neutral metadata, vocabulary. claude-nexus는 build-time read-only consumer.
- **Execution layer**:
  - **claude-nexus** (this project) — Claude Code 하네스 대상
  - **opencode-nexus** — OpenCode 하네스 대상 (sibling, 동등한 consumer, 수직 관계 아님)
- **Supervision layer**: `nexus-code` — 외부 host-of-hosts (Pro/Max 구독제 호환 ProcessSupervisor 패턴). 이 프로젝트에서는 interact 없음.

관련 제약:
- Agent SDK 경로 배제 (`.nexus/memory/agent-sdk-constraint.md` 참조)
- ACP 통합 경로 현재 Claude Code 쪽 구독제 호환 불가
- nexus-code가 이 세션을 외부 감독할 때 AgentHost 인터페이스를 통함 — claude-nexus는 해당 로직 자체 구현 안 함
