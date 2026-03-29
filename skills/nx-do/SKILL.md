---
name: nx-do
description: Execution — Lead+Director 상시 팀 + 동적 에이전트 구성.
trigger_display: "[do] / [do!]"
purpose: "Execution — dynamic agent composition based on goal"
triggers: ["do", "do!", "실행", "개발", "구현", "연구", "조사"]
---
# Do

Lead가 의도를 정리하고 Director 주도로 팀을 구성하여 실행한다.

## Trigger

- `[do]` — Lead 자율 판단 (Director 경유 또는 직접 실행)
- `[do!]` — Director 팀 강제 (Lead 직접 실행 금지, Director 추천 구속력)
- Direct invocation: `/claude-nexus:nx-do`

---

## Lead 직접 실행 조건

다음 3조건을 **모두** 충족할 때만 Lead가 직접 실행한다. 하나라도 불충족 시 Phase 2로.

1. 사용자가 정확한 변경 지시를 했다 (명확한 위치 + 내용)
2. 단일 파일 수정으로 완결된다
3. 코드 구조 이해가 불필요하다 (오타, 린트 에러, 상수 변경 등)

`[do!]`는 이 조건을 무효화한다 — 반드시 Director 경유.

---

## Flow

### Phase 1: Intake (Lead)

- 사용자 요청 의도 정리
- **Branch Guard**: main/master 브랜치면 작업 성격에 맞는 브랜치를 생성하고 진행 (prefix: `feat/`, `fix/`, `chore/`, `research/` 등 Lead 판단). 사용자 확인 없이 자동 생성. 생성 직후 `nx_branch_migrate(from_branch)` 호출하여 이전 브랜치의 consult/decisions 상태를 이동.
- `nx_rules_read`로 팀 rules 확인. 목표와 관련된 태그를 Lead가 판단. 있으면 스킬 기본 원칙보다 우선 적용.
- decisions.json이 있으면 `nx_context`로 기존 결정 사항 확인.
- **3조건 충족 시**: `nx_task_add` → Edit → `nx_task_close` → 사용자에게 결과 보고. Phase 2 생략.
- **그 외**: Phase 2로.

### Phase 2: Design (Director + How agent)

- Lead가 `nx_briefing("director", hint?)` 호출 → Director briefing 수집
- How agent 결정 (Lead 판단): 코드 → Architect, 조사 → Postdoc, 혼합 → 둘 다
- 기존 Director 팀 확인:
  - 있으면: SendMessage로 목표 + briefing 전달
  - 없으면: TeamCreate + Director 스폰 (briefing 포함), How agent 동시 스폰

```
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "claude-nexus:director", name: "director", team_name: "<project>",
  prompt: "목표/맥락 분석 → Why/What 관점 정리. How agent와 SendMessage로 토론 후 합의. 합의 완료 후 nx_task_add()로 태스크 확정. Lead에게 에이전트 구성 추천 + 태스크 목록 보고. 브리핑: {briefing}" })
// 목표에 따라 How agent 선택:
Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "<project>",
  prompt: "코드/기술 현황 분석 → How 관점 정리. director와 SendMessage로 토론 후 합의. 브리핑: {briefing}" })
// 또는
Agent({ subagent_type: "claude-nexus:postdoc", name: "postdoc", team_name: "<project>",
  prompt: "조사 방법론/소스 현황 분석 → How 관점 정리. director와 SendMessage로 토론 후 합의. 브리핑: {briefing}" })
```

- Director + How agent: SendMessage로 토론 → 합의
- Director가 `nx_task_add()`로 태스크 확정 (task 소유권 = director)
- Director가 Lead에게 보고: 에이전트 구성 추천 + 태스크 목록

Gate Stop이 tasks.json 감시 → 등록 즉시 nonstop 시작.

### Phase 3: Execute (Do agent + QA 조건부)

- Lead가 Director 추천대로 Do agent 스폰 (`nx_briefing(role, hint?)` 호출하여 briefing 포함)
- `[do!]`: Director 추천 구속력. Lead 직접 실행 금지.
- `[do]`: Director 추천 참고. Lead가 조정 가능.

```
// 목표에 따라 Do agent 선택:
Agent({ subagent_type: "claude-nexus:engineer", name: "engineer-1", team_name: "<project>",
  prompt: "태스크 T1 구현. nx_task_update(in_progress) 착수, 완료 후 nx_task_update(completed) 호출. 완료 후 director에게 SendMessage 보고. 기술 문제는 architect에게 에스컬레이션. 브리핑: {briefing}" })
// 또는
Agent({ subagent_type: "claude-nexus:researcher", name: "researcher-1", team_name: "<project>",
  prompt: "태스크 T1 조사. nx_task_update(in_progress) 착수, 완료 후 nx_task_update(completed) 호출. 완료 후 director에게 SendMessage 보고. 방법론 문제는 postdoc에게 에스컬레이션. 브리핑: {briefing}" })
```

- Do agent → Director에게 완료 보고
- Director 의도 검증 + QA 스폰 판단
- QA 자동 스폰 조건 (Director 재량 + 4조건 중 하나라도 해당):
  - 변경 파일 3개 이상
  - 기존 테스트 파일 수정
  - 외부 API/DB 접근 코드 변경
  - memory에 해당 영역 실패 이력 존재

```
// QA — Director 재량 + 4조건 중 하나라도 해당 시:
Agent({ subagent_type: "claude-nexus:qa", name: "qa", team_name: "<project>",
  prompt: "태스크별 검증. 문제 발견 시 director에게 SendMessage 보고. 브리핑: {briefing}" })
```

- 미흡/문제 발견 → Director가 `nx_task_add`/`nx_task_update`로 태스크 추가/재오픈

### Phase 4: Complete

- Director가 모든 태스크 검증 완료 → Lead에게 최종 보고
- `nx_task_close` 호출 → consult+decisions+tasks를 history.json에 아카이브 후 삭제
- 팀 종료: 전 팀원에게 shutdown 요청 → 전원 종료 확인 → `TeamDelete`
- 사용자에게 결과 보고

---

## Dynamic Composition

Director 추천 + Lead 판단으로 에이전트를 구성한다. 도메인 고정 조합이 아닌 목표 기반 자유 구성.

### 판단 기준

- **코드 변경이 주 산출물** → How: Architect, Do: Engineer (+ QA 조건부)
- **정보 수집이 주 산출물** → How: Postdoc, Do: Researcher
- **혼합** → 목표에 맞게 자유 구성 (예: Engineer + Researcher 병렬)

**Lead가 How agent 결정** (목표 기반): 코드 → Architect, 조사 → Postdoc, 혼합 → 둘 다.
**Director가 Do agent + QA 추천** (설계 결과 기반): Phase 2 Design 완료 후 Lead에게 보고.

---

## Key Principles

1. **Lead = 의도 정리 + 조율 + 사용자 소통 + nx_briefing 호출** — 분석 도구 직접 사용 금지
2. **Director = 상시 팀원. 분석 + 에이전트 구성 추천 + task 소유 + 의도 검증** — nx_task_add/nx_task_update 권한
3. **How agents (Architect/Postdoc) = 자문** — Lead가 목표에 따라 선택
4. **Do agents (Engineer/Researcher) = 실행** — Director가 추천
5. **QA = 검증** — Director 재량 + 4조건
6. **Teammate 재활용 우선** — idle에 SendMessage 배정 먼저
7. **tasks.json이 유일한 상태**
8. **Gate Stop nonstop** — pending 태스크 있으면 종료 불가
9. **Design = 합의** (Director + How agent SendMessage 토론)

## Rules Template (참고)

팀 커스텀 규칙이 필요할 때 `nx_rules_write`로 `.claude/nexus/rules/`에 생성.

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
- Director 질의 수신 → AskUserQuestion으로 사용자에게 전달
- 타임아웃: 예상 소요 시간 초과 시 해당 팀원에게 진행 상황 확인

## Teammate 스폰 예시

```
// 1. 팀 생성 + Director + How agent 동시 스폰
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "claude-nexus:director", name: "director", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "<project>", prompt: "..." })

// 2. Design 완료 후 Director 추천대로 Do agent 합류
Agent({ subagent_type: "claude-nexus:engineer", name: "engineer-1", team_name: "<project>", prompt: "..." })

// 3. 조건 충족 시 QA 합류
Agent({ subagent_type: "claude-nexus:qa", name: "qa", team_name: "<project>", prompt: "..." })

// 4. 완료 후 팀 퇴장
SendMessage({ to: "*", message: { type: "shutdown_request", reason: "전체 태스크 완료" } })
TeamDelete()
```

주의: `TaskCreate`는 Claude Code 태스크 생성 도구. teammate 스폰은 반드시 `Agent({ team_name: ... })`.

## 팀 종료 예시

```
// 1. 전 팀원에게 shutdown 요청
SendMessage({ to: "*", message: { type: "shutdown_request", reason: "전체 태스크 완료" } })

// 2. 전원 종료 확인 후 팀 삭제
TeamDelete()
```

## State Management

`.nexus/{branch}/tasks.json` — `nx_task_add`/`nx_task_update`로 관리. Gate Stop 감시.
사이클 종료 시 `nx_task_close`로 consult+decisions+tasks를 history.json에 아카이브.
