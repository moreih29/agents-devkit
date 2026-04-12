---
name: deploy
description: Release automation for claude-nexus — pre-release checks + release.mjs execution.
disable-model-invocation: true
---

# Deploy

claude-nexus 프로젝트 배포 자동화. Pre-release 검증 후 release.mjs를 실행한다.

## Trigger

- `/deploy` — 수동 호출

## Phase 1: Pre-release 검증

순서대로 실행. 실패 시 수정 후 커밋하고 다음 단계로 진행.

### 1-1. Build + Test

```bash
bun run build && bun run build:types && bash test/e2e.sh
```

build는 다음을 포함:
- esbuild (bridge/mcp-server.cjs, scripts/*.cjs)
- nexus-core 기반 재생성 (agents/*.md, skills/*/SKILL.md, src/data/tags.json)
- 템플릿 + CLAUDE.md Nexus 섹션 동기화

실패 시 원인 수정 후 재실행. 이 단계를 통과하면 생성물과 코드가 정합.

### 1-2. Context knowledge 동기화 (권장)

코드 구조/설계 변경이 포함된 배포에서만 실행:

```
Skill({ skill: "claude-nexus:nx-sync" })
```

`.nexus/context/` 문서와 소스 코드 간 불일치를 탐지 + 수정.
수정사항 있으면: `git commit -m "docs: sync context knowledge"`

단순 버그 수정이나 의존성 업데이트만 있는 경우 건너뛸 수 있다.

### 1-3. README 검사 (권장)

README.md / README.en.md의 에이전트/스킬/MCP 도구 테이블이 현행과 일치하는지 대조.
불일치 시 수정 + `git commit -m "docs: update README"`

### 1-4. 워킹 트리 클린 확인

```bash
git status --porcelain
```

커밋되지 않은 변경이 있으면 Phase 2 진행 불가. 정리 후 진행.

## Phase 2: Release

### 2-1. Dry-run

```bash
node release.mjs --dry-run
```

자동 결정된 버전(patch/minor/major)과 예상 변경사항을 확인한다.

### 2-2. 버전 판단

커밋 히스토리 기반으로 버전 적절성 판단:

| 변경 내용 | 예상 버전 |
|-----------|-----------|
| 버그 수정, 의존성 업데이트, 문서 수정 | patch |
| 새 기능, 스킬 추가/변경, MCP 도구 변경 | minor |
| Breaking change (스키마, 프로토콜 변경) | major |

dry-run 결과가 부적절하면 오버라이드:
```bash
node release.mjs [patch|minor|major]
```

### 2-3. 실행

```bash
node release.mjs [patch|minor|major]
```

인자 없으면 자동 결정 사용. release.mjs 수행 내용:
version bump → build → e2e → git commit → git tag → `git push origin main` + `git push origin v{version}`

**npm publish는 직접 호출하지 않는다** — tag push가 GitHub Actions OIDC workflow를 트리거.

### 2-4. CI 완료 대기

```bash
gh run watch $(gh run list --workflow=publish-npm.yml --limit 1 --json databaseId --jq ".[0].databaseId") --exit-status
```

예상 소요: 30초-1분. `.github/workflows/publish-npm.yml`이 OIDC Trusted Publishing으로 npm publish.

## Phase 3: 실패 핸들링

| 상황 | 대응 |
|------|------|
| Build/E2E 실패 | 원인 수정 → Phase 1 재실행 |
| 워킹 트리 dirty | 커밋 누락 확인 → 정리 후 재시도 |
| CI workflow 실패 | `gh run view <run_id> --log`로 원인 분석: version mismatch, type-check 실패, OIDC 설정 오류 등 |
| gh CLI 없음 | CHANGELOG에서 릴리스 본문 추출 → 수동 GitHub release 안내 |

## 완료 보고

배포 결과 요약:
- 버전: vX.Y.Z
- Pre-release 수정 내역 (있으면)
- npm 배포 상태 (CI 결과)
- 후속 작업 (있으면)
