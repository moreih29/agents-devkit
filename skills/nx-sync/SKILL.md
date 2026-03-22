---
name: nx-sync
description: Detect and fix drift between source code changes and knowledge documents.
triggers: ["sync", "sync knowledge", "지식 동기화", "문서 동기화"]
---

# Sync

소스 코드 변경점을 감지하고 knowledge 문서와의 불일치를 찾아 수정한다.

## Why This Exists

`.claude/nexus/knowledge/` 문서들은 에이전트의 공유 기억이다. 코드가 바뀌면 — 모듈 추가, 의존성 변경, 구조 리팩토링 — 이 문서들이 실제 코드와 어긋날 수 있다. 이 스킬은 그 drift를 잡아낸다.

## Prerequisites

- **git repository** 필수. git이 없으면 변경점 추적이 불가능하므로 sync를 실행할 수 없다.
- `.claude/nexus/knowledge/`에 knowledge 파일이 2개 이상 존재해야 한다.

## Process

### Phase 0: Context Detection

knowledge 파일 존재 여부로 실행 모드를 결정한다.

```
knowledge_files = Glob(".claude/nexus/knowledge/*.md")
# decisions/ 하위는 ADR이므로 sync 대상에서 제외

IF knowledge_files 개수 < 2:
  → 사용자에게 안내:
    "knowledge 파일이 부족합니다. `/nexus:nx-init`을 실행하면
     프로젝트 분석을 기반으로 knowledge가 자동 생성됩니다."
  → 종료
ELSE:
  → DIFF SCAN 모드로 Phase 1 진행
```

### Phase 1: Detect Changes (소스 변경점 감지)

#### Step 1-1: base 커밋 결정

```
IF .nexus/sync-state.json 존재:
  base = sync-state.json의 lastSyncCommit
  git rev-parse --verify {base} 로 유효성 확인
  유효하지 않으면 → Step 1-1 fallback

ELSE (fallback):
  base = HEAD~20  # sync-state 없을 때의 안전한 기본값
```

#### Step 1-2: 변경 파일 목록 수집

```bash
git diff --name-status {base}..HEAD
```

결과를 파싱하여 변경 목록을 만든다:
- `A` (Added) → 새 파일
- `M` (Modified) → 수정된 파일
- `D` (Deleted) → 삭제된 파일
- `R` (Renamed) → 이름 변경

#### Step 1-3: 영향도 분류

변경 파일 목록을 아래 기준으로 분류한다. **High/Medium만 후속 Phase에서 처리한다.**

| 영향도 | 기준 | 예시 |
|--------|------|------|
| **High** | 새 디렉토리/모듈 생성, 설정 파일 변경, 의존성 변경, 진입점 변경 | 새 `src/auth/` 디렉토리, `package.json` 변경, `main.ts` 변경 |
| **Medium** | 주요 소스 파일의 export/인터페이스/타입 변경, 파일 삭제/이름 변경 | 함수 시그니처 변경, 파일명 변경 |
| **Low** | 내부 구현만 변경, 테스트 파일만 변경, 스타일/포맷 변경 | 함수 내부 로직, `*.test.ts` |

**판단 방법:**
1. 파일 경로로 1차 분류 (설정 파일, 소스 디렉토리, 테스트 등)
2. 경로만으로 판단이 어려우면 `git diff {base}..HEAD -- {file}` 로 변경 내용을 읽어서 판단
3. **의심스러우면 Medium 이상으로 분류** (놓치는 것보다 과탐이 낫다)

변경 파일이 없으면:
```
"마지막 sync 이후 변경사항이 없습니다. (base: {base})"
→ 종료
```

### Phase 2: Scan Knowledge (knowledge 현황 파악)

`.claude/nexus/knowledge/*.md` 파일을 모두 읽는다. `decisions/` 하위 ADR 파일은 제외한다.

각 파일에서 다음을 추출한다:
1. **태그** — `<!-- tags: ... -->` HTML 코멘트가 있으면 파싱
2. **헤더 구조** — `#`/`##` 헤더를 목록으로 수집
3. **소스 참조** — 파일 내에 언급된 소스 파일 경로 (코드 블록, 인라인 코드 등)

이 정보로 각 knowledge 파일의 **커버리지 영역**을 파악한다.

예:
```
architecture.md → tags: [architecture, modules], 참조 경로: [src/hooks/, bridge/, agents/]
conventions.md → tags: [conventions, style], 참조 경로: 없음 (규칙 기술)
```

### Phase 3: Compare and Report

Phase 1의 High/Medium 변경 파일과 Phase 2의 knowledge 커버리지를 대조한다.

#### Step 3-1: 매칭

각 변경 파일에 대해:
1. knowledge 파일들의 **소스 참조**에 해당 경로가 포함되어 있는지 확인
2. knowledge 파일들의 **태그/헤더**가 해당 변경 영역과 관련되는지 판단
3. 매칭된 knowledge 파일의 해당 섹션을 읽어 **실제 내용이 변경 사항과 일치하는지** 확인

#### Step 3-2: 불일치 판정

| 유형 | 조건 | 예시 |
|------|------|------|
| **STALE** | knowledge가 기술하는 내용이 코드에서 변경됨 | architecture.md에 "모듈 3개"라고 적혀있는데 실제로 4개 |
| **MISSING** | 새 모듈/구조가 추가됐는데 어떤 knowledge에도 기록 없음 | 새 `src/auth/` 디렉토리가 추가됐지만 architecture.md에 미기재 |
| **ORPHAN** | knowledge가 기술하는 대상이 코드에서 삭제됨 | architecture.md에 `src/legacy/` 설명이 있는데 해당 디렉토리 삭제됨 |

**확신이 없으면 리포트에 포함하되 `[UNCERTAIN]` 표시.** LLM이 추측으로 판정하지 않는다.

#### Step 3-3: 리포트 출력

```
## Sync Report

### Changes Detected
- base: {base_commit} ({date})
- Files changed: N (High: X, Medium: Y, Low: Z skipped)

### Issues Found: N

#### STALE (X)
- architecture.md §"디렉토리 구조" — src/auth/ 모듈이 추가됐지만 미기재
- conventions.md §"네이밍" — 함수 접두사가 create→make로 변경됨

#### MISSING (X)
- 새 모듈 src/payments/ — 어떤 knowledge에도 미기록

#### ORPHAN (X)
- architecture.md §"레거시 모듈" — src/legacy/ 삭제됨

#### UNCERTAIN (X)
- architecture.md §"의존성" — package.json 변경됐으나 주요 의존성 변경인지 불확실

### No Issues
- conventions.md — 관련 변경 없음
```

### Phase 4: Apply Fixes (사용자 승인 후)

리포트를 제시한 뒤: **"이 불일치를 수정할까요?"**

사용자가 승인하면:

#### 수정 규칙

1. **surgical edit만** — 변경된 부분만 수정. 전체 섹션을 다시 쓰지 않는다
2. **기존 스타일 유지** — 해당 knowledge 파일의 기존 형식(테이블, 리스트, 코드 블록 등)을 따른다
3. **소스에 있는 정보만** — 코드에서 확인할 수 없는 내용을 추측해서 쓰지 않는다
4. **UNCERTAIN은 건드리지 않는다** — 리포트에만 남기고 사용자가 직접 판단하도록 한다

#### 수정 절차

각 이슈별로:
1. 대상 knowledge 파일의 해당 섹션을 Read
2. Edit으로 최소 범위 수정 적용
3. MISSING의 경우: 관련 knowledge 파일이 있으면 해당 파일에 섹션 추가, 없으면 새 파일 생성을 제안 (사용자 확인 후)
4. ORPHAN의 경우: 해당 섹션/항목을 삭제

#### sync-state 갱신

모든 수정 완료 후 `.nexus/sync-state.json`을 갱신한다:
```json
{
  "lastSyncCommit": "{현재 HEAD 커밋 해시}",
  "lastSyncDate": "{현재 ISO 8601 날짜}"
}
```

`.nexus/` 디렉토리가 없으면 생성한다.

## What Belongs in Knowledge (장기 기억 기준)

sync가 MISSING을 판정할 때, 모든 새 코드가 knowledge에 기록될 필요는 없다. 아래 기준으로 판단한다:

### 기록해야 하는 것
- 아키텍처: 디렉토리 구조, 모듈 간 관계, 데이터 흐름
- 컨벤션: 네이밍 규칙, 코드 스타일, 패턴
- 기술 스택: 언어, 프레임워크, 주요 의존성, 빌드/테스트 도구
- 핵심 설계 결정: 왜 X를 선택했는지, 트레이드오프
- 진입점/핵심 모듈: main 파일, 라우팅, DB 스키마
- 개발 워크플로우: 빌드, 테스트, 배포 명령

### 기록하지 않는 것
- 구현 디테일 (함수 내부 로직) — 코드가 source of truth
- API 스키마 — 타입 정의에서 직접 확인 가능
- TODO/진행 상황 — tasks.json이 담당
- 자동 조회 가능한 정보 — LSP/AST로 실시간 확인
- 비밀 정보 — 보안 위험

**판단 휴리스틱**: "이 정보가 없으면 에이전트가 코드베이스를 처음 보는 것처럼 느낄 것인가?" → Yes면 MISSING으로 보고.

## Important Constraints

- knowledge 문서만 수정한다. 소스 코드는 수정하지 않는다.
- 확실하지 않은 변경은 리포트에 [UNCERTAIN]으로 포함하고, 수정하지 않는다.
- 소스 코드에서 확인할 수 없는 정보를 추측하여 knowledge에 쓰지 않는다.
- knowledge 파일에 새 섹션을 추가할 때는 기존 파일의 스타일/구조를 따른다.
- git이 없는 프로젝트에서는 동작하지 않는다.
