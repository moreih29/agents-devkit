---
name: nx-team
description: Team-driven orchestration with task lifecycle and nonstop execution.
triggers: ["team", "팀 구성", "팀으로", "team this"]
---
# Team

팀을 구성하고, 태스크를 생성하고, 완료할 때까지 실행한다.

## Trigger
- User says: "team", "팀 구성", "팀으로", "team this"
- Explicit tag: `[team]`
- Direct invocation: `/nexus:nx-team`

## What It Does

목표를 분석 → 계획 초안 작성 → 리뷰 → tasks.json 생성 → 팀 실행. Gate Stop이 pending tasks를 감시하여 모든 태스크 완료까지 nonstop.

## Workflow

```
analyze → (clarify) → draft → review → persist → execute
```

### Phase 1: Analyze

요청을 분석해 목표와 범위를 파악한다.

- `nx_knowledge_read`, `nx_context`로 프로젝트 컨텍스트 파악
- `decisions.json`이 있으면 참고 (`.nexus/decisions.json`)
- 기존 코드가 있으면 `nx_lsp_document_symbols`, `nx_ast_search`로 현황 파악
- 불명확하면 **AskUserQuestion 1-2회**로 해소 후 진행

**Branch Guard:** main/master 브랜치에서는 실행 전에 feature 브랜치를 먼저 생성한다.
1. 사용자 요청을 분석하여 적절한 브랜치명 생성 (예: `feat/add-login`, `fix/null-crash`)
2. `git checkout -b <branch-name>` 실행
3. 이후 워크플로우 진행

### Phase 2: Draft

Lead(메인)이 직접 계획 초안을 작성한다. Strategist 에이전트를 쓰지 않는다.

구조화된 계획:
```
## 목표
## 변경 범위
## 단계별 구현
## 리스크
## 테스트 전략
## 완료 기준
```

### Phase 3: Review

순차 실행 필수 — 병렬화하면 검토 체인이 깨진다.

**Step 1 — Architect (teammate):** 구조적 관점 검토 (인터페이스 설계, 의존성, 확장성)
```
TeamCreate({ team_name: "review-team", description: "Plan review" })
TaskCreate({ team_name: "review-team", subagent_type: "nexus:architect", name: "architect",
  prompt: "다음 계획 초안을 구조적 관점에서 검토하라.\n\n초안: {draft}" })
```

**Step 2 — Reviewer (teammate):** 비판적 검토, 누락/과잉 지적
```
TaskCreate({ team_name: "review-team", subagent_type: "nexus:reviewer", name: "reviewer",
  prompt: "다음 계획을 비판적으로 검토하라. 누락된 리스크, 과잉 복잡도, 잘못된 가정을 지적하라.\n\n계획: {draft}" })
```

두 검토 결과를 반영해 Lead가 초안을 수정한다.

### Phase 4: Persist (MANDATORY — do NOT skip)

`nx_task_add()`로 각 태스크를 `.nexus/tasks.json`에 등록한다.

각 태스크 필드:
- `title`: 작업 제목
- `context`: 구현에 필요한 맥락
- `deps` (optional): 선행 태스크 ID 목록

Gate Stop이 이 파일을 감시 → 등록 즉시 nonstop 시작.

`decisions.json`에 남길 중요한 설계 결정이 있으면 이 단계에서 함께 기록한다.

### Phase 5: Execute

```
TeamCreate({ team_name: "exec-team", description: "Execution team" })
TaskCreate({ team_name: "exec-team", subagent_type: "nexus:builder", name: "builder", prompt: "..." })
TaskCreate({ team_name: "exec-team", subagent_type: "nexus:tester", name: "tester", prompt: "..." })
TaskCreate({ team_name: "exec-team", subagent_type: "nexus:guard", name: "guard", prompt: "..." })
```

- `TeamCreate`로 팀 구성 후 `TaskCreate`로 각 teammate 스폰 및 태스크 할당
- Teammate들이 작업 완료 시 `nx_task_update()`로 진행 상황 기록
- Guard teammate가 완료된 작업 검증
- `SendMessage`로 teammate 간 소통 (Agent() 직접 호출 금지)

### Completion

Gate Stop이 all tasks completed를 감지하면 아카이브를 지시한다.

1. `nx_plan_archive()` 호출 → `.nexus/plans/NN-title.md` 생성
2. `tasks.json` + `decisions.json` 삭제
3. 자연스럽게 종료

## Key Principles

1. **Lead가 직접 계획** — 컨텍스트 손실 방지, Strategist 에이전트 없음
2. **tasks.json이 유일한 상태** — 이 파일로 모든 것 추적, 별도 plan.md 없음
3. **Gate Stop nonstop** — pending 태스크가 있으면 종료 불가
4. **Architect + Reviewer = 다른 관점** — 순차 실행

## State Management

`.nexus/tasks.json` — `nx_task_add`/`nx_task_update` MCP tool로 관리. Gate Stop이 감시. 별도 workflow.json 없음.

## Deactivation

All tasks completed → `nx_plan_archive()` → 자연스럽게 종료. 별도 `nx_state_clear`는 불필요.
