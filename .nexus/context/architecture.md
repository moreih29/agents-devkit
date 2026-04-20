<!-- tags: plugin, integration, context-delivery -->
# Plugin Architecture

Claude Code와 2개 경로로 통합:
- **nexus-core upstream** — `bun run sync`가 agents/·skills/·hooks/·settings.json·dist/hooks/*.js 를 nexus-core에서 pull. 이 산출물들은 Managed — 직접 편집 금지, 수정은 upstream에서.
- **claude-only 고유** — `scripts/statusline.mjs` 단일 Node ESM 파일. 빌드 0 (번들러 없음, 런타임 직접 실행). claude-nexus가 자체 소유하며 자유롭게 편집 가능.

MCP 서버는 nexus-core가 제공하는 `nexus-mcp` stdio 바이너리를 그대로 사용. `.mcp.json`이 해당 바이너리 경로를 참조하며, claude-nexus는 서버 코드를 자체 구현하지 않는다.

## 핵심 설계 원칙

**단계별 컨텍스트 전달 (Staged Context Delivery)**: 컨텍스트는 정적이 아님. nexus-core가 정의한 5개 캐노니컬 훅을 통해 런타임 상태(tasks.json, plan.json, .nexus/ 파일)에서 계산되어 결정 시점에 주입됨.

- `session-init`: 세션 시작 시 구조 초기화 및 .nexus/ 지식 인덱스 로드
- `agent-bootstrap`: 서브에이전트 스폰 시 역할별 컨텍스트 주입
- `agent-finalize`: 서브에이전트 종료 시 상태 기록
- `post-tool-telemetry`: 도구 호출 결과를 런타임 상태에 반영
- `prompt-router`: 사용자 입력에서 태그를 감지하고 모드별 additional_context 주입

훅 dispatch 주체는 nexus-core upstream이며, claude-nexus는 `hooks.json`(Managed 산출물)을 통해 등록 참조만 제공한다. consumer가 훅 로직을 직접 구현하지 않는다.

**비차단 가이던스 (Non-blocking Guidance)**: `prompt-router` 훅이 태그를 감지하면 additional_context로 "넛지"를 전달한다. 하드 에러가 아닌 스마트 기본값 제공. 사용자는 무시할 수 있음.

**sync 파이프라인**: nexus-core upstream → sync → Managed 산출물 + Template 산출물 + claude-only 고유 파일.

```
nexus-core sync
  ├── Managed (직접 편집 금지, sync로 덮어씀)
  │     ├── agents/*.md
  │     ├── skills/*/
  │     ├── hooks/
  │     ├── settings.json fragment
  │     └── dist/hooks/*.js
  ├── Template (최초 1회 생성 후 consumer 소유)
  │     └── .claude-plugin/*.json
  └── claude-only (nexus-core 무관, 자체 편집 가능)
        └── scripts/statusline.mjs
```

**Managed vs Template 2-class 정책**:
- **Managed**: sync 실행마다 nexus-core upstream 내용으로 덮어씀. consumer 수정 불가. 변경 의도가 있으면 upstream PR.
- **Template**: 최초 1회 scaffold 후 consumer가 자유롭게 커스터마이즈. 이후 sync는 해당 파일을 건드리지 않음.

**flat 출력**: sync 산출물은 harness prefix 없이 flat 경로로 출력됨. `agents/engineer.md`, `skills/nx-plan/body.md` 등 중간 네임스페이스 없음.

## Release Pipeline

`release.mjs`는 다음 순서로 실행된다:

1. **semver 결정** — conventional commit 기반으로 major/minor/patch 결정
2. **버전 파일 bump** — `package.json`, `plugin.json`, `marketplace.json`, `VERSION` 4개 파일에 0.X.Y 버전 기록
3. **CHANGELOG 자동 생성** — conventional commit 로그에서 CHANGELOG 갱신
4. **`bun run sync` 호출** — nexus-core upstream에서 Managed 산출물(agents/·skills/·hooks/·dist/hooks·settings.json) 갱신
5. **git commit** — sync 산출물 + CHANGELOG 포함, `src/` 소스 파일 없음 (빌드 산출물이 아닌 sync 산출물 커밋)
6. **git tag + push** — tag push가 CI 트리거

CI는 tag push를 트리거로:
- Bun 설치 → `bun install --frozen-lockfile` → version match check (git tag vs package.json) → 통합 테스트 → `npm publish --provenance --access public`
- **인증**: OIDC Trusted Publishing only — npm tokens 없음, NODE_AUTH_TOKEN 없음, 2FA OTP 없음
- **결과**: SLSA v1 provenance attestation이 npm 패키지에 첨부됨

기준 문서: [plugin-guide.md](https://github.com/moreih29/nexus-core/blob/main/docs/plugin-guide.md), 기준 계약: [harness-io.md §4-1](https://github.com/moreih29/nexus-core/blob/main/docs/contract/harness-io.md).

## Nexus Ecosystem Position

> **내부 아키텍처 문서 전용.** 외부 README/마케팅에 이 프레임 사용 금지 — `.nexus/context/ecosystem.md` §7 참조.

3층위 모델:

- **Authoring layer**: `@moreih29/nexus-core` — prompt body, neutral metadata, vocabulary. 에이전트·스킬·훅의 실질적 정의를 소유.
- **Execution layer**:
  - **claude-nexus** (this project) — nexus-core의 Claude Code 래퍼. nexus-core가 제공하는 자산(agents·skills·hooks·MCP)을 sync로 수용하고, Claude Code 하네스 고유 기능(statusline·marketplace 등록·version bump·release)만 자체 소유. nexus-core upstream에 종속되며, 래퍼 역할 이상의 로직을 자체 구현하지 않는다.
  - **opencode-nexus** — OpenCode 하네스 래퍼 (sibling, 동등한 consumer, 수직 관계 아님)
- **Supervision layer**: `nexus-code` — 외부 host-of-hosts (Pro/Max 구독제 호환 ProcessSupervisor 패턴). 이 프로젝트에서는 interact 없음.

관련 제약:
- Agent SDK 경로 배제 (`.nexus/memory/external-agent-sdk-constraint.md` 참조)
- ACP 통합 경로 현재 Claude Code 쪽 구독제 호환 불가
- nexus-code가 이 세션을 외부 감독할 때 AgentHost 인터페이스를 통함 — claude-nexus는 해당 로직 자체 구현 안 함
