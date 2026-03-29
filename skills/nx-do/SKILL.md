---
name: nx-do
description: Execution — sub-agent or team mode with dynamic agent composition.
trigger_display: "[do] / [do!]"
purpose: "Execution — dynamic agent composition based on goal"
triggers: ["do", "do!", "실행", "개발", "구현", "연구", "조사"]
---
# Do

Lead가 요청 복잡도를 판단해 Sub Path 또는 Team Path로 실행한다.

## Trigger

- `[do]` — Lead 자율 판단 (sub 또는 team)
- `[do!]` — Team Path 강제
- Direct invocation: `/claude-nexus:nx-do`

---

## Dynamic Composition

Lead가 목표를 분석하여 에이전트를 구성한다. 도메인 고정 조합이 아닌 목표 기반 자유 구성.

### 판단 기준

- **코드 변경이 주 산출물** → Engineer + Architect (+ QA 조건부)
- **정보 수집이 주 산출물** → Researcher + Postdoc
- **혼합** → 목표에 맞게 자유 구성 (예: Engineer + Researcher 병렬)

### Sub Path: 에이전트 직접 스폰

- 코드 → `Agent({ subagent_type: "claude-nexus:engineer", ... })`
- 조사 → `Agent({ subagent_type: "claude-nexus:researcher", ... })`

### Team Path: Director 항상 포함

- Director: 항상 (task 소유)
- How agent: Architect(코드) / Postdoc(조사) / 둘 다(혼합)
- Do agent: Engineer(코드) / Researcher(조사) / 혼합
- QA: 코드 변경 시 조건부 (변경 파일 3+, 테스트 수정 시)

---

## Sub Path

`[do]` + Lead가 단순하다 판단 시 (1-3개 태스크 수준, cross-cutting concerns 없음).

**[do] Lead 판단: 도구 0회, 요청 텍스트만으로 직감 추정. 4+ 서브태스크 또는 cross-cutting concerns 감지 시 Team Path. 판단 결과를 근거와 함께 1줄로 표시 (예: "sub-path로 진행합니다 — task 2개, cross-cutting 없음").**

### Phase 1: Analyze (Lead 직접)

- 사용자에게 모드 고지 + 판단 근거: "[do] sub-path로 진행합니다 — {판단 근거}"
- **Branch Guard**: main/master 브랜치면 작업 성격에 맞는 브랜치를 생성하고 진행 (prefix: `feat/`, `fix/`, `chore/`, `research/` 등 Lead 판단). 사용자 확인 없이 자동 생성. 생성 직후 `nx_branch_migrate(from_branch)` 호출하여 이전 브랜치의 consult/decisions 상태를 이동.
- Lead가 직접 분석 도구 사용 (Read, Grep, LSP, AST, WebSearch 등) — team path와 다름
- decisions.json이 있으면 `nx_context`로 기존 결정 사항을 확인하고 맥락에 반영
- `nx_rules_read`로 팀 rules 확인. Lead가 목표와 관련된 태그를 판단. 있으면 스킬 기본 원칙보다 우선 적용.
- TodoWrite로 할일 목록 생성 (status: "pending") + **반드시 `nx_task_add`로 동일 태스크 등록** (history 아카이브용)
- 계획을 사용자에게 보여준 뒤 Spawn으로 진입

### Phase 2: Spawn

```
Agent({ subagent_type: "claude-nexus:engineer", prompt: "..." })   // 코드 변경 시
Agent({ subagent_type: "claude-nexus:researcher", prompt: "..." }) // 정보 수집 시
// team_name 없이 direct spawn
```

- 독립 태스크 병렬 스폰 가능
- Agent() blocking — Lead가 결과 직접 수신
- 완료마다 TodoWrite 갱신

### Phase 3: Verify (조건부)

변경 파일 3개 이상, 기존 테스트 모듈 수정, 또는 Lead 판단 시 QA 스폰. 아니면 Lead 직접 확인.

### Phase 4: Done

- TodoWrite 전체 "completed" 확인
- `nx_task_close` 호출 → consult+decisions+tasks를 history.json에 아카이브 후 삭제
- 사용자에게 결과 보고

---

## Team Path

`[do!]` 또는 `[do]` + Lead가 복잡하다 판단 시.

Phase: **intake → design → execute → complete**

### Phase 1: Intake (Lead)

사용자 요청/의도/맥락만 정리. **분석/코드 도구 호출 금지.**

- 사용자에게 모드 고지 + 판단 근거: "[do] team-path로 진행합니다 — {판단 근거}"
- 목표, 범위, 의도 정리 → briefing 작성
- decisions.json이 있으면 기존 결정 사항을 briefing에 포함 (`nx_context`로 조회)
- `nx_rules_read`로 팀 rules 조회. Lead가 목표와 관련된 태그를 판단. 있으면 briefing에 포함하여 팀원에게 전달, 스킬 기본 원칙보다 우선.
- **Branch Guard**: main/master 브랜치면 작업 성격에 맞는 브랜치를 생성하고 진행 (prefix: `feat/`, `fix/`, `chore/`, `research/` 등 Lead 판단). 사용자 확인 없이 자동 생성. 생성 직후 `nx_branch_migrate(from_branch)` 호출하여 이전 브랜치의 consult/decisions 상태를 이동.
- TeamCreate + director + How agent 병렬 스폰

```
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "claude-nexus:director", name: "director", team_name: "<project>",
  prompt: "목표/맥락 분석 → Why/What 관점 정리. How agent와 SendMessage로 토론 후 합의. 합의 완료 후 nx_task_add()로 태스크 확정. 브리핑: {briefing}" })
// 목표에 따라 How agent 선택:
Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "<project>",
  prompt: "코드/기술 현황 분석 → How 관점 정리. director와 SendMessage로 토론 후 합의." })
// 또는
Agent({ subagent_type: "claude-nexus:postdoc", name: "postdoc", team_name: "<project>",
  prompt: "조사 방법론/소스 현황 분석 → How 관점 정리. director와 SendMessage로 토론 후 합의." })
```

### Phase 2: Design (Director + How agent 병렬 → 합의)

- Director: 목표/맥락/decisions → Why/What
- How agent: 기술/방법론 현황 → How
- SendMessage로 토론 → 합의
- Director가 `nx_task_add()`로 태스크 확정 (task 소유권 = director)

Gate Stop이 tasks.json 감시 → 등록 즉시 nonstop 시작.

### Phase 3: Execute (Do agent + QA 조건부)

**Teammate 재활용 우선:** idle 확인 → SendMessage 배정. 모두 busy일 때만 신규 스폰.

```
// 목표에 따라 Do agent 선택:
Agent({ subagent_type: "claude-nexus:engineer", name: "engineer-1", team_name: "<project>",
  prompt: "태스크 T1 구현. nx_task_update(in_progress) 착수, 완료 후 nx_task_update(completed) 호출. 완료 후 director에게 SendMessage 보고. 기술 문제는 architect에게 에스컬레이션." })
// 또는
Agent({ subagent_type: "claude-nexus:researcher", name: "researcher-1", team_name: "<project>",
  prompt: "태스크 T1 조사. nx_task_update(in_progress) 착수, 완료 후 nx_task_update(completed) 호출. 완료 후 director에게 SendMessage 보고. 방법론 문제는 postdoc에게 에스컬레이션." })
// QA — 코드 변경 시 조건부 (변경 파일 3+, 테스트 수정 시):
Agent({ subagent_type: "claude-nexus:qa", name: "qa", team_name: "<project>",
  prompt: "태스크별 검증. 문제 발견 시 director에게 SendMessage 보고." })
```

- 미흡/문제 발견 → director가 nx_task_add/nx_task_update로 태스크 추가/재오픈

### Phase 4: Complete

1. all tasks completed → Gate Stop pass → 자연스럽게 종료
2. `nx_task_close` 호출 → consult+decisions+tasks를 history.json에 아카이브 후 삭제
3. 팀 종료: 전 팀원에게 shutdown 요청 → 전원 종료 확인 → `TeamDelete`
4. 사용자에게 결과 보고

---

## Key Principles

1. **Lead = 조율 + 사용자 소통** — Team Path에서 분석 도구 금지
2. **Director = Why/What + task 소유** — nx_task_add/nx_task_update 권한
3. **How agents (Architect/Postdoc) = How + 자문** — Do agent 에스컬레이션 수신
4. **Do agents (Engineer/Researcher) → director에게 보고** (기본), How agent에게 에스컬레이션 (기술/방법론 문제)
5. **Teammate 재활용 우선** — idle에 SendMessage 배정 먼저
6. **tasks.json이 유일한 상태** (Team Path)
7. **Gate Stop nonstop** — pending 태스크 있으면 종료 불가
8. **Design = 합의** (Director + How agent SendMessage 토론)
9. **[do] 판단: 도구 0회** — 요청 텍스트만으로 직감 추정

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

## Lead Awaiting Pattern (Team Path)

- idle teammate → SendMessage로 새 업무 배정
- Director 질의 수신 → AskUserQuestion으로 사용자에게 전달
- 타임아웃: 예상 소요 시간 초과 시 해당 팀원에게 진행 상황 확인

## Teammate 스폰 예시

```
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "claude-nexus:director", name: "director", team_name: "<project>", prompt: "..." })
// 목표에 따라:
Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "claude-nexus:engineer", name: "engineer-1", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "claude-nexus:qa", name: "qa", team_name: "<project>", prompt: "..." })
// 또는:
Agent({ subagent_type: "claude-nexus:postdoc", name: "postdoc", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "claude-nexus:researcher", name: "researcher-1", team_name: "<project>", prompt: "..." })
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
