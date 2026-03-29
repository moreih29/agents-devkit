---
name: nx-run
description: Execution — dynamic agent composition based on goal.
trigger_display: "nx-run"
purpose: "Execution — dynamic agent composition based on goal"
triggers: ["실행", "개발", "구현", "연구", "조사"]
---
# Run

Lead가 의도를 정리하고 How agent와 직접 협업하여 팀을 구성한다.

---

## Lead 직접 실행 조건

다음 3조건을 **모두** 충족할 때만 Lead가 직접 실행한다. 하나라도 불충족 시 Phase 2로.

1. 사용자가 정확한 변경 지시를 했다 (명확한 위치 + 내용)
2. 단일 파일 수정으로 완결된다
3. 코드 구조 이해가 불필요하다 (오타, 린트 에러, 상수 변경 등)

---

## Flow

### Phase 1: Intake (Lead)

- 사용자 요청 의도 정리
- **Branch Guard**: main/master 브랜치면 작업 성격에 맞는 브랜치를 생성하고 진행 (prefix: `feat/`, `fix/`, `chore/`, `research/` 등 Lead 판단). 사용자 확인 없이 자동 생성.
- decisions.json이 있으면 `nx_context`로 기존 결정 사항 확인.
- 팀 rules는 `nx_briefing(hint)` 호출 시 자동 포함 (hint 태그 필터링). Lead가 별도 확인 불필요.
- **3조건 충족 시**: `nx_task_add` → Edit → `nx_task_close` → 사용자에게 결과 보고. Phase 2 생략.
- **그 외**: Phase 2로.

### Phase 2: Design (Lead + How agent)

- How agent 결정 (Lead 판단):
  - 코드 변경이 주 산출물 → **Architect**
  - 콘텐츠/문서 생성이 주 산출물 → **Strategist** 또는 **Postdoc**
  - 혼합 → 둘 다
- Lead가 `nx_briefing(role, hint?)` 호출 → How agent briefing 수집
- 팀 구성:

```
TeamCreate({ team_name: "<project>", description: "..." })
// 코드 파이프라인 — How:
Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "<project>",
  prompt: "코드/기술 현황 분석 → How 관점 정리. Lead와 SendMessage로 토론 후 합의. 브리핑: {briefing}" })
// 콘텐츠 파이프라인 — How:
Agent({ subagent_type: "claude-nexus:strategist", name: "strategist", team_name: "<project>",
  prompt: "콘텐츠 전략/방향 분석 → How 관점 정리. Lead와 SendMessage로 토론 후 합의. 브리핑: {briefing}" })
// 리서치 기반:
Agent({ subagent_type: "claude-nexus:postdoc", name: "postdoc", team_name: "<project>",
  prompt: "조사 방법론/소스 현황 분석 → How 관점 정리. Lead와 SendMessage로 토론 후 합의. 브리핑: {briefing}" })
```

- Lead + How agent: SendMessage로 토론 → 합의
- Lead가 `nx_task_add()`로 태스크 확정
- Lead가 에이전트 구성 결정 + 태스크 목록 확인

Gate Stop이 tasks.json 감시 → 등록 즉시 nonstop 시작.

### Phase 3: Execute (Do agent)

- Lead가 판단한 Do agent 스폰 (`nx_briefing(role, hint?)` 호출하여 briefing 포함)

```
// 코드 파이프라인 — Do:
Agent({ subagent_type: "claude-nexus:engineer", name: "engineer-1", team_name: "<project>",
  prompt: "태스크 T1 구현. nx_task_update(in_progress) 착수, 완료 후 nx_task_update(completed) 호출. 코드 수정에 집중. Lead에게 SendMessage 보고. 기술 문제는 architect에게 에스컬레이션. 브리핑: {briefing}" })

// 콘텐츠 파이프라인 — Do:
Agent({ subagent_type: "claude-nexus:researcher", name: "researcher-1", team_name: "<project>",
  prompt: "태스크 T1 조사. nx_task_update(in_progress) 착수, 완료 후 nx_task_update(completed) 호출. reference/에 결과를 즉시 기록하고 Lead에게 SendMessage 보고. 방법론 문제는 postdoc에게 에스컬레이션. 브리핑: {briefing}" })
Agent({ subagent_type: "claude-nexus:writer", name: "writer-1", team_name: "<project>",
  prompt: "태스크 T2 작성. researcher 결과 기반으로 콘텐츠 작성. 완료 후 Lead에게 SendMessage 보고. 브리핑: {briefing}" })
```

**병렬화 규칙**: 독립 태스크(deps 없음)의 수정 대상 파일이 겹치지 않으면 병렬 Engineer 스폰. 겹치면 순차 처리.

- Do agent → Lead에게 완료 보고
- Lead: 인메모리 세션 내 학습 — 같은 실수 반복 방지, 패턴 누적
- Phase 4로 진입

### Phase 4: Check (Lead + Check agent)

**QA 역할 분리**:
- Lead: 빌드+E2E 확인 (사실 확인 — 통과/실패 여부만 판단)
- QA/Reviewer: 품질/의도 정합성/엣지 케이스/보안 검증 (분석 — Check agent 조건 충족 시 스폰)
- 파일 3개 이상 변경 시: Lead 빌드 확인 후 QA 스폰 필수. Lead가 직접 검증으로 QA 대체 금지.

Check agent 자동 스폰 조건 (Lead 재량 + 4조건 중 하나라도 해당):
  - 변경 파일 3개 이상
  - 기존 테스트 파일 수정
  - 외부 API/DB 접근 코드 변경
  - memory에 해당 영역 실패 이력 존재

```
// 코드 파이프라인 — Check:
Agent({ subagent_type: "claude-nexus:qa", name: "qa", team_name: "<project>",
  prompt: "태스크별 검증. 문제 발견 시 Lead에게 SendMessage 보고. 브리핑: {briefing}" })

// 콘텐츠 파이프라인 — Check:
Agent({ subagent_type: "claude-nexus:reviewer", name: "reviewer", team_name: "<project>",
  prompt: "콘텐츠 검토 및 품질 검증. 문제 발견 시 Lead에게 SendMessage 보고. 브리핑: {briefing}" })
```

**되돌림 흐름** (QA/Reviewer 보고 기반 — Lead가 판단):
- **코드 문제** (버그, 구현 오류) → Phase 3으로: Do agent 재작업 (`nx_task_update`로 재오픈)
- **설계 문제** (구조적 결함, 방향 오류) → Phase 2로: How agent 재설계 (합의 재개)
- 문제 없음 → Phase 5로

### Phase 5: Document (Lead + Writer)

**Phase 4 통과 후에만 진입.**

- Lead가 변경점 매니페스트 정리:
  - 어떤 결정이 내려졌는가 (decisions 참조)
  - 어떤 코드/콘텐츠가 변경되었는가 (태스크 결과 참조)
- Lead가 갱신이 필요한 knowledge 계층 판단:
  - `identity/` — 프로젝트 정체성/목적 변경 시
  - `codebase/` — 코드 구조/아키텍처 변경 시
  - `reference/` — 외부 참조/리서치 결과 추가 시
  - `memory/` — 교훈/패턴 기록 대상 시 (memoryHint 기준)
- Lead가 **Phase 5 태스크 등록 (의무)**: `nx_task_add`로 Writer 태스크 명시
- 필요한 계층에 Writer를 병렬 스폰:

```
// 코어 계층 갱신 — Writer:
Agent({ subagent_type: "claude-nexus:writer", name: "writer-doc", team_name: "<project>",
  prompt: "변경점 매니페스트 기반으로 {계층}/ knowledge 갱신. nx_core_read로 현재 내용 확인 후 nx_core_write로 업데이트. 완료 후 Lead에게 SendMessage 보고. 매니페스트: {manifest}" })
```

- **교훈 추출** (Lead 판단 — Writer에게 위임 또는 Lead 직접):
  - memoryHint의 taskCount ≥ 3, hadLoopDetection, 또는 decisionCount ≥ 2 → 교훈 기록 대상
  - 기준: "이 정보가 없으면 같은 실수를 반복할 것인가?"
  - 기록: `nx_core_write(layer: "memory", topic: "{영역}", tags: [...])` 로 교훈 append
  - 형식: `## {날짜} — {주제}\n- 교훈 항목`
  - 해당하지 않으면 → 생략 (사소한 작업에 교훈 남기지 않음)
- Writer 완료 보고 → Phase 6으로

### Phase 6: Complete

- `nx_task_close` 호출 → history.json 아카이브. 반환값의 `memoryHint` 확인.
- Do/Check/Writer(doc) 에이전트 개별 shutdown (How agents는 세션 수명 — 유지)
- 사용자에게 최종 결과 보고

---

## Dynamic Composition

Lead 판단으로 에이전트를 구성한다. 도메인 고정 조합이 아닌 목표 기반 자유 구성.

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

1. **Lead = 의도 정리 + 조율 + 사용자 소통 + nx_briefing 호출 + 태스크 소유** — 사실 확인 허용, 분석/판단은 위임
2. **How agents = 자문** — Lead가 목표에 따라 선택. 상한 4명. 세션 수명.
3. **Do agents = 실행** — Lead가 결정. Engineer는 코드 수정에 집중. 문서 갱신은 Phase 5에서 Writer가 일괄 수행. Researcher는 reference/ 즉시 기록.
4. **Check agents = 검증** — Lead 재량 + 4조건
5. **Teammate 재활용 우선** — idle에 SendMessage 배정 먼저
6. **tasks.json이 유일한 상태**
7. **Gate Stop nonstop** — pending 태스크 있으면 종료 불가
8. **Design = 합의** (Lead + How agent SendMessage 토론)

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
// Phase 2: 팀 생성 + How agent 스폰
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "<project>", prompt: "..." })

// Phase 3: Lead↔How agent 토론 후 태스크 확정, Do agent 합류
Agent({ subagent_type: "claude-nexus:engineer", name: "engineer-1", team_name: "<project>", prompt: "..." })

// Phase 4: 조건 충족 시 Check agent 합류
Agent({ subagent_type: "claude-nexus:qa", name: "qa", team_name: "<project>", prompt: "..." })
// 문제 발견 시: 코드 문제 → Phase 3 재진입, 설계 문제 → Phase 2 재진입

// Phase 5: Check 통과 후 Writer 스폰 (필요한 계층만)
Agent({ subagent_type: "claude-nexus:writer", name: "writer-doc", team_name: "<project>", prompt: "..." })

// Phase 6: Do/Check/Writer(doc) 퇴장 (How agents는 세션 수명)
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
