---
name: nx-team
description: Team-driven orchestration with task lifecycle and nonstop execution.
triggers: ["team", "팀 구성", "팀으로", "team this"]
---
# Team

팀을 구성하고, 합의 기반으로 태스크를 생성하고, 완료할 때까지 실행한다.

## Trigger
- User says: "team", "팀 구성", "팀으로", "team this"
- Explicit tag: `[team]`
- Direct invocation: `/nexus:nx-team`

## 워크플로우: intake → analyze → plan → execute → complete

### Phase 1: Intake (Lead)

사용자 요청/의도/대화 맥락만 정리한다. **분석/코드 도구 호출 금지.**

- 사용자 요청에서 목표, 범위, 의도를 정리
- 대화 맥락(이전 메시지, 제공된 정보)을 브리핑으로 요약
- 불명확하면 **AskUserQuestion 1-2회**로 해소 후 진행
- 오케스트레이션 도구만 사용 (TeamCreate, Agent, SendMessage, AskUserQuestion)
- **nx_knowledge_read, nx_context, LSP, AST 등 분석/코드 도구 호출 금지**

**Branch Guard:** main/master 브랜치에서는 실행 전에 feature 브랜치를 먼저 생성한다.
1. 사용자 요청을 바탕으로 적절한 브랜치명 생성 (예: `feat/add-login`, `fix/null-crash`)
2. `git checkout -b <branch-name>` 실행
3. 이후 워크플로우 진행

**TodoWrite 초기화:**
팀 구성 후, 현재 파악된 목표를 TodoWrite로 초기 체크리스트를 생성한다 (status: "pending"). 이후 팀원이 SendMessage로 진행 보고를 할 때마다 갱신한다.

**팀 구성 + Analyst/Architect 스폰:**
```
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "nexus:analyst", name: "analyst", team_name: "<project>",
  prompt: "심층 분석을 수행하라. nx_knowledge_read, nx_context, LSP, AST를 활용해 프로젝트 현황을 파악하고 구현 분석서를 작성하라. 불명확한 점은 Lead에게 SendMessage로 질의하라. 분석 완료 후 architect에게 SendMessage로 분석서를 전달하라.\n\n브리핑: {briefing}" })
Agent({ subagent_type: "nexus:architect", name: "architect", team_name: "<project>",
  prompt: "analyst의 분석서를 구조적으로 검토하라. 문제 발견 시 analyst에게 SendMessage로 수정 요청. 합의 완료 후 analyst에게 최종 확정 지시." })
```

### Phase 2: Analyze (Analyst)

Analyst가 직접 분석 도구를 사용해 심층 분석을 수행한다.

- `nx_knowledge_read`, `nx_context`로 프로젝트 컨텍스트 파악
- `decisions.json`이 있으면 참고 (`.nexus/decisions.json`)
- 기존 코드가 있으면 `nx_lsp_document_symbols`, `nx_ast_search`로 현황 파악
- 불명확하면 **Lead에게 SendMessage로 질의** → Lead가 AskUserQuestion으로 사용자에게 전달 → 답변을 다시 Analyst에게 전달
- 분석 결과를 구현 분석서로 정리 후 Architect에게 SendMessage로 전달

**Lead의 질의 중계 역할:**
Analyst가 Lead에게 질문을 보내면, Lead는 AskUserQuestion으로 사용자에게 질문한다. 답변을 받으면 SendMessage로 Analyst에게 전달한다.

### Phase 3: Plan (Analyst + Architect 합의)

Analyst의 분석서가 Architect에게 전달되면서 합의 루프가 시작된다.

**합의 루프:**
- Analyst가 분석서 작성 → Architect에게 SendMessage
- Architect가 구조 검토 (비판적 검토 포함) → 문제 있으면 Analyst에게 수정 요청
- 2자 합의 도달 → **Analyst가 nx_task_add()로 태스크를 확정**

**합의 결과 형식 (Analyst가 태스크 확정 시 반영):**
- 목표
- 변경 범위
- 단계별 구현
- 리스크
- 태스크 목록 + 의존성 + 병렬 가능 여부

**Lead는 nx_task_add()를 호출하지 않는다.** Analyst가 태스크 소유자.

Gate Stop이 tasks.json을 감시 → 등록 즉시 nonstop 시작.

필요시 `nx_decision_add()`로 중요한 설계 결정을 기록한다.

### Phase 4: Execute (Builder, Guard)

태스크를 실행한다. Analyst가 일차 조율, Lead가 보조한다.

**Teammate 재활용 규칙:**
1. **idle teammate 확인 → SendMessage로 새 업무 배정 우선**
2. **모두 busy일 때만 새 teammate 스폰**

**Teammate 스폰 (병렬 가능):**
독립 태스크(deps 없음)는 teammate를 병렬 스폰. 의존성 있으면 선행 완료 후 순차.
```
Agent({ subagent_type: "nexus:builder", name: "builder-1", team_name: "<project>",
  prompt: "태스크 T1을 구현하라.\n\n컨텍스트: {task.context}\n\n착수 즉시 Lead에게 SendMessage로 예상 소요 시간을 보고하라 (예: '~3분 예상'). 완료 후 Analyst에게 SendMessage로 태스크 완료를 보고하라." })
Agent({ subagent_type: "nexus:builder", name: "builder-2", team_name: "<project>",
  prompt: "태스크 T2를 구현하라.\n\n컨텍스트: {task.context}\n\n착수 즉시 Lead에게 SendMessage로 예상 소요 시간을 보고하라 (예: '~3분 예상'). 완료 후 Analyst에게 SendMessage로 태스크 완료를 보고하라." })
```
- Builder는 nx_task_update(id, "in_progress") 착수, 구현 완료 후 nx_task_update(id, "completed") 호출, 이후 **Analyst에게 SendMessage로 태스크 완료를 보고**
- Lead는 팀원으로부터 SendMessage 보고를 수신할 때마다 TodoWrite로 태스크 진행 상황을 갱신한다 (착수 → "in_progress", 완료 → "completed", 검증 실패 → "pending" 재오픈)
- Analyst는 보고를 수신하면 tasks.json 상태를 확인하고 다음 단계를 조율

**Guard 검증 (태스크별):**
Builder 완료 보고마다 Guard가 해당 태스크 검증. CRITICAL이면 Builder에게 수정 지시.
Guard가 문제를 발견하면 **Analyst에게 SendMessage로 보고**. Analyst가 `nx_task_add()`로 새 태스크를 추가하거나 `nx_task_update()`로 기존 태스크를 재오픈한다. Guard는 태스크를 직접 생성/수정하지 않는다.
검증이 통과되면 **Analyst에게 SendMessage로 검증 완료를 보고**한다.
```
Agent({ subagent_type: "nexus:guard", name: "guard", team_name: "<project>",
  prompt: "태스크 T1 검증. 변경 파일: {files}. 타입체크/테스트/빌드/스펙 일치. 검증 완료(통과 또는 문제 발견) 후 Analyst에게 SendMessage로 결과를 보고하라." })
```

**Debugger (조건부):** 빌드/테스트 실패 시에만 스폰.

### Phase 5: Complete (Lead)

Gate Stop이 all tasks completed를 감지하면 아카이브를 지시한다.

1. `nx_plan_archive()` 호출 → `.nexus/archives/NN-title.md` 생성 + `tasks.json`/`decisions.json` 삭제
2. 자연스럽게 종료

## Key Principles

1. **Lead = 조율 + 사용자 소통** — 오케스트레이션 도구만 사용 (TeamCreate, Agent, SendMessage, AskUserQuestion). 분석/코드 도구 호출 금지
2. **Analyst = 분석 + 태스크 소유** — nx_knowledge_read/nx_context/LSP/AST로 심층 분석. nx_task_add/nx_task_update 권한 보유
3. **Teammate 재활용 우선** — idle teammate에 SendMessage로 배정 먼저, 모두 busy일 때만 새 스폰
4. **단일 팀** — review/exec 팀 분리 금지
5. **tasks.json이 유일한 상태** — 이 파일로 모든 것 추적, 별도 plan.md 없음
6. **Gate Stop nonstop** — pending 태스크가 있으면 종료 불가
7. **Plan = 합의 (Analyst + Architect), Execute = atomic** — Plan phase는 2자 합의로 수렴, Execute phase는 확정된 태스크를 실행. 단, Guard 검증 결과에 따라 Analyst가 태스크 추가/재오픈 가능
8. **Guard 태스크별 검증** — 완료 즉시 검증, 문제 발견 시 Analyst에게 보고
9. **Debugger 조건부** — 에러 시에만
10. **Lead TodoWrite 진행 표시** — Lead는 팀원의 SendMessage 보고를 받을 때마다 TodoWrite로 태스크 진행 상황을 갱신한다. tasks.json은 Gate Stop용으로 유지하고, TodoWrite는 사용자 가시성 전용이다.

## Lead Awaiting Pattern

Lead가 대기 중일 때:

- **idle teammate 확인:** SendMessage로 새 업무 배정
- **모두 busy:** 새 teammate 스폰
- **Analyst 질의 수신:** AskUserQuestion으로 사용자에게 전달 → 답변을 SendMessage로 Analyst에게 중계
- **Plan phase 대기:** Analyst ↔ Architect 합의를 기다림. SendMessage로 진행 상황 확인 가능
- **에러 보고 수신:** Debugger 스폰 후 해당 builder에게 연결
- **직접 작업 금지:** Lead는 코드를 직접 작성하거나 파일을 수정하지 않는다
- **타임아웃 체크:** 팀원이 보고한 예상 소요 시간을 초과했는데 보고가 없으면, 해당 팀원에게 SendMessage로 진행 상황을 확인한다

## Teammate 스폰 예시 (정확한 API)

```
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "nexus:analyst", name: "analyst", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "nexus:architect", name: "architect", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "nexus:builder", name: "builder-1", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "nexus:guard", name: "guard", team_name: "<project>", prompt: "..." })
```

주의: `TaskCreate`는 Claude Code 태스크 생성 도구이지 teammate 스폰이 아님. teammate 스폰은 반드시 `Agent({ team_name: ... })`를 사용하라.

## State Management

`.nexus/tasks.json` — `nx_task_add`/`nx_task_update` MCP tool로 관리. Gate Stop이 감시. 별도 workflow.json 없음.

## Deactivation

All tasks completed → `nx_plan_archive()` → 자연스럽게 종료.
