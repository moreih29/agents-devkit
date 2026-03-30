---
name: nx-run
description: Execution — user-directed agent composition.
trigger_display: "nx-run"
purpose: "Execution — user-directed agent composition"
triggers: ["실행", "개발", "구현", "연구", "조사"]
---
# Run

사용자의 [run] 태그 호출 시 Lead가 따라야 할 실행 규범.

---

## 기본 동작

- **사용자가 에이전트/방향을 지시** → 지시에 따른다.
- **[run]만 (추가 지시 없음)** → 사용자에게 방향 확인 후 진행.
- 사용자가 범위와 구성을 결정한다. 지시 없는 영역은 Lead가 보충.

---

## Flow

### Step 1: Intake (Lead)

- 사용자 요청 의도 정리 + 방향 확인 (필요 시)
- **Branch Guard**: main/master 브랜치면 작업 성격에 맞는 브랜치 생성 후 진행 (prefix: `feat/`, `fix/`, `chore/`, `research/` 등 Lead 판단). 사용자 확인 없이 자동 생성.
- decisions.json이 있으면 `nx_context`로 기존 결정 사항 확인.
- 팀 rules는 `nx_briefing(hint)` 호출 시 자동 포함 (hint 태그 필터링).

### Step 2: Execute (Do agents)

- 사용자 지시에 따라 에이전트를 구성. 지시가 없는 영역은 Lead가 보충.
- `nx_task_add`로 태스크 확정 → Do agent 스폰 (`nx_briefing(role, hint?)` 호출하여 briefing 포함)
- 독립 태스크(deps 없음)의 수정 대상 파일이 겹치지 않으면 병렬 Engineer 스폰. 겹치면 순차 처리.

### Step 3: Verify (Lead + Check agent)

- Lead: 빌드+E2E 확인 (통과/실패 여부만 판단)
- QA/Reviewer: 품질/의도 정합성/엣지 케이스/보안 검증 (Check agent 조건 충족 시 스폰)
- Check agent 스폰 조건 (하나라도 해당):
  - 변경 파일 3개 이상
  - 기존 테스트 파일 수정
  - 외부 API/DB 접근 코드 변경
  - memory에 해당 영역 실패 이력 존재
- 문제 발견 시: 코드 문제 → Do agent 재작업, 설계 문제 → How agent 재설계

### Step 4: Complete

- Phase 5(Document) 필요 시: Writer 스폰하여 knowledge 갱신
- `nx_task_close` 호출 → history.json 아카이브. 반환값의 `memoryHint` 확인.
- Do/Check/Writer(doc) 에이전트 개별 shutdown (How agents는 세션 수명 — 유지)
- 사용자에게 최종 결과 보고

---

## 참고 프레임워크

| Phase | 담당 | 내용 |
|-------|------|------|
| 1. Intake | Lead | 의도 정리, Branch Guard, context 확인 |
| 2. Design | Lead + How agent | 구조 설계, 합의, 태스크 확정 |
| 3. Execute | Do agent | 구현/조사/작성 |
| 4. Check | Lead + Check agent | 빌드 확인, 품질 검증 |
| 5. Document | Lead + Writer | knowledge 갱신, 교훈 기록 |
| 6. Complete | Lead | nx_task_close, 에이전트 shutdown, 보고 |

---

## Dynamic Composition

사용자 지시에 따라 에이전트를 구성. 지시가 없는 영역은 Lead가 보충.

### 에이전트 카탈로그

| 카테고리 | 에이전트 | 역할 |
|----------|----------|------|
| **How** | Architect | 코드/기술 구조 설계 |
| **How** | Designer | UI/UX, 시각 설계 |
| **How** | Postdoc | 리서치 방법론, 소스 평가 |
| **How** | Strategist | 콘텐츠 전략, 방향 설정 |
| **Do** | Engineer | 코드 구현, 버그 수정 |
| **Do** | Researcher | 웹 조사, 정보 수집 |
| **Do** | Writer | 콘텐츠 작성, 문서 생성 |
| **Check** | QA | 코드 검증, 테스트 |
| **Check** | Reviewer | 콘텐츠 검토, 품질 검증 |

How 에이전트 상한: **4명**. Do/Check 에이전트: 무제한 (목표 규모에 따라).

### 파이프라인 조합

**코드 파이프라인**
```
How: Architect (+ Designer 선택적)
Do:  Engineer (병렬 가능)
Check: QA
```

**콘텐츠 파이프라인**
```
How: Postdoc + Strategist
Do:  Researcher + Writer (병렬 가능)
Check: Reviewer
```

### 판단 기준

- **코드 변경이 주 산출물** → How: Architect, Do: Engineer, Check: QA
- **정보 수집이 주 산출물** → How: Postdoc, Do: Researcher
- **콘텐츠 생성이 주 산출물** → How: Strategist, Do: Researcher + Writer, Check: Reviewer
- **혼합** → 목표에 맞게 자유 구성 (예: Engineer + Researcher 병렬)

---

## Structured Delegation

Lead가 에이전트에게 태스크를 위임할 때 다음 포맷으로 구조화한다:

```
TASK: {구체적 산출물}

CONTEXT:
- 현재 상태: {관련 코드/문서 위치}
- 의존성: {선행 태스크 결과}
- 기존 결정: {relevant decisions}
- 수정 대상 파일: {파일 경로 목록}

CONSTRAINTS:
- {제약 조건 1}
- {제약 조건 2}

ACCEPTANCE:
- {완료 기준 1}
- {완료 기준 2}
```

---

## Key Principles

1. **Lead = 사용자 지시 해석 + 조율 + 소통 + 태스크 소유**
2. **사용자가 범위와 구성을 결정**
3. **Do agents = 실행** — Lead가 결정. Engineer는 코드 수정에 집중. 문서 갱신은 Phase 5에서 Writer가 일괄 수행. Researcher는 reference/ 즉시 기록.
4. **Check agents = 검증** — Lead 재량 + 4조건
5. **Teammate 재활용 우선** — idle에 SendMessage 배정 먼저
6. **tasks.json이 유일한 상태**
7. **Gate Stop nonstop** — pending 태스크 있으면 종료 불가
8. **Design = 합의** (Lead + How agent SendMessage 토론)
9. **Bash 파일 수정 금지** — sed, echo >, cat <<EOF, tee 등 Bash를 통한 파일 수정 금지. 반드시 Edit/Write 도구 사용 (Gate 감시 대상)

## Rules Template (참고)

팀 커스텀 규칙이 필요할 때 `nx_rules_write`로 `.nexus/rules/`에 생성.

```markdown
<!-- tags: dev -->
# Dev Rules

## 코딩 컨벤션
(프로젝트 고유 스타일, 네이밍, 패턴)

## 테스트 정책
(커버리지 기준, 테스트 유형, QA 요구사항)

## 커밋/PR 규칙
(메시지 포맷, PR 크기, 리뷰 기준)
```

## Lead Awaiting Pattern

- idle teammate → SendMessage로 새 업무 배정
- 타임아웃: 예상 소요 시간 초과 시 해당 팀원에게 진행 상황 확인

## Teammate 스폰 예시

```
// Step 2: 팀 생성 + How agent 스폰 (필요 시)
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "<project>", prompt: "..." })

// Step 2: Lead↔How agent 토론 후 태스크 확정, Do agent 합류
Agent({ subagent_type: "claude-nexus:engineer", name: "engineer-1", team_name: "<project>", prompt: "..." })

// Step 3: 조건 충족 시 Check agent 합류
Agent({ subagent_type: "claude-nexus:qa", name: "qa", team_name: "<project>", prompt: "..." })
// 문제 발견 시: 코드 문제 → Do agent 재작업, 설계 문제 → How agent 재설계

// Step 4: Check 통과 후 Writer 스폰 (필요한 계층만)
Agent({ subagent_type: "claude-nexus:writer", name: "writer-doc", team_name: "<project>", prompt: "..." })

// Step 4: Do/Check/Writer(doc) 퇴장 (How agents는 세션 수명)
SendMessage({ to: "engineer-1", message: { type: "shutdown_request", reason: "태스크 완료" } })
SendMessage({ to: "qa", message: { type: "shutdown_request", reason: "태스크 완료" } })
SendMessage({ to: "writer-doc", message: { type: "shutdown_request", reason: "문서화 완료" } })
// How agents는 세션 수명 — shutdown하지 않음
```

주의: `TaskCreate`는 Claude Code 태스크 생성 도구. teammate 스폰은 반드시 `Agent({ team_name: ... })`.

## 팀 종료 (세션 종료 시에만)

사용자가 명시적으로 세션을 종료하거나 더 이상 작업이 없을 때만:

```
// 전원 shutdown + 팀 삭제
SendMessage({ to: "*", message: { type: "shutdown_request", reason: "세션 종료" } })
TeamDelete()
```

## State Management

`.nexus/state/tasks.json` — `nx_task_add`/`nx_task_update`로 관리. Gate Stop 감시.
사이클 종료 시 `nx_task_close`로 consult+decisions+tasks를 `.nexus/history.json`에 아카이브.
