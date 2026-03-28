---
name: nx-sync
description: Sync knowledge documents with the current state of the codebase. On first run, scans and generates knowledge from scratch.
trigger_display: "/claude-nexus:nx-sync"
purpose: "Sync knowledge docs with source files (first run = auto-generate)"
triggers: ["sync", "sync knowledge", "지식 동기화", "문서 동기화"]
---

# Sync

core/codebase/ 문서를 코드베이스 현황과 동기화한다. 처음 실행 시 프로젝트를 스캔하여 codebase knowledge를 자동 생성한다.

> **범위**: core/codebase/만 관리. identity(사용자 소유), reference(에이전트/사용자 수동), memory(task_close 시 자동)는 nx-sync의 책임이 아니다. 이 계층의 파일을 수정하거나 덮어쓰지 않는다.

## Trigger

- `/claude-nexus:nx-sync` — knowledge 동기화
- `/claude-nexus:nx-sync --reset` — knowledge 초기화 후 재생성

## Modes

### First Run (knowledge 0개)

프로젝트 전체 스캔 → knowledge 자동 생성 + CLAUDE.md 슬림화. 사용자 승인 없이 자동 진행한다.

### Sync (knowledge 존재)

git diff 기반으로 drift를 감지 → 리포트 출력 → 사용자 승인 후 수정.

### Reset (`--reset` 플래그)

기존 knowledge를 삭제 → First Run으로 재진입. 사용자 확인 후 진행.

---

## Process

### Phase 0: Mode Detection

```
IF --reset 플래그:
  AskUserQuestion({
    questions: [{
      question: "기존 knowledge 파일이 모두 삭제됩니다. 진행할까요?",
      options: [
        { label: "Yes", description: "기존 knowledge 삭제 후 처음부터 재생성" },
        { label: "No", description: "취소" }
      ]
    }]
  })
  No 선택 시 → 종료
  Yes 선택 시 → 기존 knowledge 파일 전부 삭제 → First Run 진입

ELSE IF .claude/nexus/core/codebase/ 에 .md 파일 0개:
  → First Run 진입

ELSE:
  → Sync 진입
```

### Phase 0.5: CLAUDE.md Nexus Section Check

프로젝트 CLAUDE.md의 Nexus 섹션(`<!-- NEXUS:START/END -->` 마커)이 최신 템플릿과 일치하는지 확인한다.

1. 플러그인 캐시의 `templates/nexus-section.md` 읽기
2. 프로젝트 `./CLAUDE.md`에서 마커 내부 콘텐츠 추출
3. 비교:
   - **일치** → 스킵
   - **불일치** → 마커 내부를 템플릿으로 교체, 안내 출력: "CLAUDE.md Nexus 섹션을 최신 버전으로 갱신했습니다"
   - **마커 없음** → 파일 끝에 마커 + 템플릿 추가
4. 프리앰블(마커 바깥)은 수정하지 않는다.

### Phase 1: Scan

#### First Run 모드

다음 항목을 수집한다:

- **프로젝트 구조**: 최상위 디렉토리, 언어/프레임워크(package.json, Cargo.toml, pyproject.toml, go.mod 등), 빌드/테스트 시스템
- **기존 문서**: CLAUDE.md, README.md, docs/, .cursorrules, .github/copilot-instructions.md 등 존재하는 모든 문서
- **git 컨텍스트**: 최근 커밋 메시지, 브랜치 구조

**중요: 기존 문서의 구조나 파일명을 따르지 않는다. 수집한 정보를 바탕으로 어떤 knowledge 파일이 필요한지, 어떤 구조와 계층이 적합한지 LLM이 독자적으로 판단한다. 기존 문서는 정보 소스일 뿐이다.**

#### Sync 모드

- `.nexus/sync-state.json`이 있으면 `lastSyncCommit`을 base로 사용. 없으면 `HEAD~20` 사용.
- `git diff --name-status {base}..HEAD` 로 변경 파일 목록 수집
- 변경 파일을 영향도로 분류 (High/Medium만 후속 처리, Low 스킵):

| 영향도 | 기준 |
|--------|------|
| **High** | 새 디렉토리/모듈, 설정 파일, 의존성, 진입점 변경 |
| **Medium** | export/인터페이스/타입 변경, 파일 삭제/이름 변경 |
| **Low** | 내부 구현만, 테스트 파일만, 스타일/포맷 변경 |

판단이 애매하면 Medium 이상으로 분류한다. 변경 파일이 없으면 안내 후 종료.

### Phase 2: Analyze & Generate

#### First Run 모드

- 스캔 결과를 분석하여 knowledge 파일을 생성한다.
- 파일명, 구조, 계층은 프로젝트 특성에 맞게 자유 결정. 하드코딩된 템플릿 없음.
- CLAUDE.md 슬림화: 핵심 지시사항만 유지, 나머지는 knowledge로 이동. 원본은 `.claude/nexus/core/codebase/` 에 백업. 사용자 승인은 불필요하지만 "CLAUDE.md를 슬림화합니다" 안내를 출력한다.
- CLAUDE.md 슬림화 시 `.nexus/`, `.claude/nexus/` 등 Nexus 내부 경로를 프리앰블에 남기지 않는다. 이러한 경로 정보는 knowledge에서 관리한다. 프리앰블에는 프로젝트 고유 지시사항(빌드 명령, 코딩 컨벤션 등)만 유지한다.
- `nx_core_write`(layer: "codebase")로 파일 생성.

#### Sync 모드

- `nx_core_read`(layer: "codebase")로 `.claude/nexus/core/codebase/` 하위 모든 .md 파일을 읽는다 (하위 디렉토리 포함, 제외 규칙 없음).
- 각 파일에서 태그(`<!-- tags: ... -->`), 헤더 구조, 소스 참조 경로를 추출하여 커버리지 영역을 파악한다.
- Phase 1의 High/Medium 변경 파일과 knowledge 커버리지를 대조하여 불일치를 판정한다:

| 유형 | 조건 |
|------|------|
| **STALE** | knowledge가 기술하는 내용이 코드에서 변경됨 |
| **MISSING** | 새 모듈/구조가 추가됐는데 어떤 knowledge에도 미기록 |
| **ORPHAN** | knowledge가 기술하는 대상이 코드에서 삭제됨 |

확신이 없으면 `[UNCERTAIN]` 표시. 추측으로 판정하지 않는다.

리포트 형식:

```
## Sync Report

### Changes Detected
- base: {base_commit} ({date})
- Files changed: N (High: X, Medium: Y, Low: Z skipped)

### Issues Found: N

#### STALE (X)
- {파일명} §"{섹션}" — {이유}

#### MISSING (X)
- {대상} — {이유}

#### ORPHAN (X)
- {파일명} §"{섹션}" — {이유}

#### UNCERTAIN (X)
- {파일명} §"{섹션}" — {이유}

### No Issues
- {파일명} — 관련 변경 없음
```

### Phase 3: Apply

#### First Run 모드

자동 적용 (Phase 2에서 이미 생성됨). 완료 안내 출력: "초기 knowledge N개 파일 생성, CLAUDE.md 슬림화 완료"

#### Sync 모드

리포트 출력 후 자동으로 수정을 적용한다.

수정 규칙:
1. **surgical edit만** — 변경된 부분만 수정. 전체 섹션을 재작성하지 않는다.
2. **기존 스타일 유지** — 해당 knowledge 파일의 형식(테이블, 리스트, 코드 블록 등)을 따른다.
3. **소스에 있는 정보만** — 코드에서 확인할 수 없는 내용을 추측하지 않는다.
4. **UNCERTAIN은 건드리지 않는다** — 리포트에만 남기고 사용자가 직접 판단한다.
5. MISSING: 관련 knowledge 파일이 있으면 섹션 추가, 없으면 새 파일 생성.
6. ORPHAN: 해당 섹션/항목 삭제.

### Phase 4: Finalize

`.nexus/sync-state.json` 갱신:
```json
{
  "lastSyncCommit": "{현재 HEAD 커밋 해시}",
  "lastSyncDate": "{현재 ISO 8601 날짜}"
}
```

`.nexus/` 디렉토리가 없으면 생성한다.

---

## What Belongs in Knowledge

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

**판단 휴리스틱**: "이 정보가 없으면 에이전트가 코드베이스를 처음 보는 것처럼 느낄 것인가?" → Yes면 기록 대상.

---

## Important Constraints

- knowledge 문서만 수정한다 (First Run 시에는 생성도 포함). 소스 코드는 수정하지 않는다.
- 확실하지 않은 변경은 [UNCERTAIN]으로 리포트하고 수정하지 않는다.
- 소스에서 확인 불가한 정보를 추측하여 knowledge에 쓰지 않는다.
- 기존 파일 삭제는 `--reset` 시에만 (사용자 확인 후).
- git이 없는 프로젝트: First Run은 가능, Sync는 불가 (안내 후 종료).
- 비밀 정보(API 키 등)를 knowledge에 저장하지 않는다.
