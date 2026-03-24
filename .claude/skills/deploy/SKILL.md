---
name: deploy
description: Release automation for claude-nexus — pre-release drift checks + release.mjs execution. Use when deploying a new version.
disable-model-invocation: true
---

# Deploy

claude-nexus 프로젝트 배포 자동화. Pre-release 검증 후 release.mjs를 실행한다.

## Trigger

- `/deploy` — 수동 호출

## Phase 1: Pre-release 검증

순서대로 실행. 각 단계에서 수정이 발생하면 즉시 커밋.

### 1-1. Sync (knowledge drift)

`/claude-nexus:nx-sync` 워크플로우 실행.

- knowledge 문서와 소스 코드 간 불일치 탐지 + 수정
- 수정사항 있으면: `git add` → `git commit -m "docs: sync knowledge"`

### 1-2. CLAUDE.md drift

현재 에이전트/스킬/태그와 CLAUDE.md Nexus 섹션 대조.

검사 항목:
1. `agents/*.md` 파일 목록의 name 필드 → CLAUDE.md Agent Routing 테이블
2. `skills/*/SKILL.md` frontmatter name/triggers → CLAUDE.md Skills 테이블
3. `src/hooks/gate.ts` EXPLICIT_TAGS 키 → CLAUDE.md Tags 테이블

불일치 시:
- 프로젝트 `CLAUDE.md`의 `<!-- NEXUS:START -->` ~ `<!-- NEXUS:END -->` 섹션 수정
- 글로벌 `~/.claude/CLAUDE.md`도 동일하게 동기화
- `git commit -m "docs: sync CLAUDE.md"`

### 1-3. 스킬 spec 하드코딩 검사

`skills/*/SKILL.md` + `.claude/nexus/knowledge/*.md` 내용에서 구명칭 잔존 검사.

방법:
1. `agents/*.md`에서 현재 에이전트 이름 목록 추출
2. `gate.ts` EXPLICIT_TAGS에서 현재 태그 목록 추출
3. 스킬/knowledge 파일에서 이 목록에 없는 에이전트/태그/스킬 이름 grep
4. CHANGELOG, `.claude/contexts/resources/` (레퍼런스 원본)은 검사 제외

불일치 시 수정 + `git commit -m "docs: fix stale references in skills"`

### 1-4. README.md 검사

README의 에이전트/스킬/MCP 도구/런타임 구조 테이블이 현행과 일치하는지 대조.

불일치 시 수정 + `git commit -m "docs: update README"`

## Phase 2: Release

### 2-1. Dry-run

```bash
node release.mjs --dry-run
```

출력에서 자동 결정된 버전(patch/minor/major)을 확인한다.

### 2-2. 버전 판단

Phase 1에서 추가된 docs 커밋을 고려하여 버전이 적절한지 판단:
- Phase 1 커밋만 있고 기능 변경 없으면: dry-run 결과 수용
- 기능 커밋(feat)이 있는데 patch로 결정됐으면: `node release.mjs minor`로 오버라이드
- breaking change가 있는데 minor로 결정됐으면: `node release.mjs major`로 오버라이드

### 2-3. 실행

```bash
node release.mjs [patch|minor|major]
```

인자 없으면 자동 결정 사용. 승인 게이트 없이 바로 실행.

## Phase 3: 실패 핸들링 + Post-release

| 상황 | 대응 |
|------|------|
| E2E 실패 | 실패 내용 분석, 사용자에게 보고, 배포 중단 |
| 워킹 트리 dirty | Phase 1 커밋 누락 확인 → 커밋 후 재시도 |
| npm 2FA 필요 | `! npm publish` 실행 안내 |
| gh 없음 | CHANGELOG에서 해당 버전 섹션 추출 → 릴리스 타이틀 + 본문 생성하여 사용자가 복사 가능하도록 출력 |

## 완료 보고

배포 결과 요약:
- 버전: vX.Y.Z
- Phase 1 수정 내역 (있으면)
- npm 배포 상태
- GitHub release 상태
- 필요한 수동 작업 (있으면)
