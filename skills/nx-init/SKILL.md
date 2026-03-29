---
name: nx-init
description: "Project onboarding — scan, identity, codebase generation"
trigger_display: "/claude-nexus:nx-init"
purpose: "Full project onboarding: scan codebase, establish identity, generate knowledge"
triggers: ["init", "onboard", "온보딩", "초기화", "프로젝트 설정"]
---

# Init

프로젝트를 스캔하고 Nexus 지식 베이스를 구축한다. 처음 실행 시 5단계 풀 온보딩을 진행한다.

## Trigger

- `/claude-nexus:nx-init` — 풀 온보딩 (또는 재개)
- `/claude-nexus:nx-init --reset` — 기존 core/ 백업 후 재온보딩
- `/claude-nexus:nx-init --reset --cleanup` — 백업 목록 표시 + 선택적 삭제

---

## Modes

### First Run (core/ 없음)

5단계 풀 온보딩 자동 진행.

### Resume (core/ 일부 존재)

기존 상태를 확인하고 미완료 단계부터 재개.

### Reset (`--reset`)

기존 `.nexus/core/`를 `.nexus/core.bak.{timestamp}/`로 백업 후 First Run 진입.

### Cleanup (`--reset --cleanup`)

백업 디렉토리 목록 표시 → 사용자가 선택한 백업 삭제.

---

## Process

### Phase 0: Mode Detection

```
IF --reset --cleanup 플래그:
  .nexus/core.bak.*/ 디렉토리 목록 표시
  AskUserQuestion({
    questions: [{
      question: "삭제할 백업을 선택하세요 (없으면 취소)",
      options: [...백업 목록..., { label: "취소", description: "변경 없이 종료" }]
    }]
  })
  선택된 백업 삭제 후 종료

ELSE IF --reset 플래그:
  기존 .nexus/core/ → .nexus/core.bak.{timestamp}/ 로 이동
  안내: "기존 core/를 core.bak.{timestamp}/로 백업했습니다. 재온보딩을 시작합니다."
  → First Run 진입

ELSE IF .nexus/core/ 가 존재:
  → Resume 진입 (기존 단계 확인 후 재개)

ELSE:
  → First Run 진입 (Step 1부터)
```

---

## Steps

### Step 1: 프로젝트 스캔

코드 구조와 기술 스택을 자동 감지한다. `.nexus/` 구조가 없으면 자동 생성됩니다.

수집 항목:
- **디렉토리 구조**: 최상위 레이아웃, 주요 모듈/패키지
- **기술 스택**: 언어, 프레임워크, 런타임 (package.json, Cargo.toml, pyproject.toml, go.mod, build.gradle 등)
- **빌드/테스트 시스템**: 스크립트, CI 설정
- **기존 문서**: CLAUDE.md, README.md, docs/, .cursorrules 등
- **git 컨텍스트**: 최근 커밋, 브랜치 구조, 기여자

출력: 스캔 요약 (언어, 프레임워크, 구조 개요)

### Step 2: Identity 수립 (대화형)

프로젝트의 핵심 방향을 사용자와 함께 확인한다.

다음 3가지를 AskUserQuestion으로 순차 확인:

1. **Mission** — 이 프로젝트가 해결하는 문제와 목표
2. **Design** — 핵심 아키텍처 결정 및 기술 선택 이유
3. **Roadmap** — 현재 우선순위와 단기 방향

각 항목은 Step 1 스캔 결과를 바탕으로 초안을 제시하고 사용자가 수정/확인한다.

확정된 내용은 `nx_core_write(layer: "identity")`로 저장:
- `identity/mission.md` — 프로젝트 목적과 목표
- `identity/design.md` — 아키텍처 결정 및 트레이드오프
- `identity/roadmap.md` — 현재 우선순위

### Step 3: Codebase Knowledge 자동 생성

Step 1 스캔 결과를 분석하여 codebase knowledge를 생성한다.

원칙:
- 파일명, 구조, 계층은 프로젝트 특성에 맞게 자유 결정. 하드코딩된 템플릿 없음.
- 기존 문서는 정보 소스일 뿐 — 구조를 그대로 따르지 않는다.
- 코드에서 확인 불가한 내용은 추측하지 않는다.

생성 대상 (프로젝트에 따라 조정):
- 아키텍처 개요 (모듈 간 관계, 데이터 흐름)
- 기술 스택 및 주요 의존성
- 핵심 진입점/모듈
- 개발 워크플로우 (빌드, 테스트, 배포)
- 컨벤션 (네이밍, 코드 스타일)

`nx_core_write(layer: "codebase")`로 파일 생성.

완료 시 안내: "codebase knowledge N개 파일 생성 완료"

### Step 4: Rules 초기 설정 (선택적)

팀 커스텀 규칙이 필요한지 확인한다.

```
AskUserQuestion({
  questions: [{
    question: "개발 규칙을 지금 설정할까요?",
    options: [
      { label: "설정", description: "코딩 컨벤션, 테스트 정책, 커밋 규칙 등" },
      { label: "건너뜀", description: "나중에 nx_rules_write로 직접 추가 가능" }
    ]
  }]
})
```

설정 선택 시: 프로젝트 스캔 결과를 바탕으로 초안 제시 → 사용자 확인 → `nx_rules_write`로 저장.

건너뜀 선택 시: 안내 후 Step 5로.

### Step 5: 완료 안내

온보딩 결과를 요약하여 출력한다.

```
## Nexus 초기화 완료

### 생성된 파일
- .nexus/core/identity/: mission.md, design.md, roadmap.md
- .nexus/core/codebase/: {생성된 파일 목록}
- .nexus/rules/: {생성된 파일 또는 "없음 (건너뜀)"}

### 다음 단계
- [consult] — 작업 시작 전 요건 정리
- /claude-nexus:nx-run — 에이전트 팀으로 실행
- /claude-nexus:nx-init --reset — 온보딩 재실행 (기존 core/ 백업됨)
```

---

## Important Constraints

- codebase/만 자동 생성한다. identity/는 반드시 사용자 확인을 거친다.
- 소스 코드는 수정하지 않는다. CLAUDE.md 슬림화도 이 스킬의 책임이 아니다.
- 코드에서 확인 불가한 정보를 추측하여 knowledge에 쓰지 않는다.
- 비밀 정보(API 키 등)를 knowledge에 저장하지 않는다.
- `--reset` 없이 기존 파일을 덮어쓰지 않는다. Resume 시 기존 파일 유지.
