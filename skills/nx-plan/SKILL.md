---
name: nx-plan
description: Structured planning with multi-agent consensus loop and adaptive formality.
triggers: ["plan", "계획 세워", "설계해", "어떻게 구현", "plan this"]
---
# Plan

Structured planning workflow — produce a concrete, reviewed plan before execution begins.

> This skill runs a full consensus loop and persists a plan document.

## Trigger
- User says: "plan", "계획 세워", "계획 짜", "설계해", "어떻게 구현", "구현 계획", "plan this"
- Explicit tag: `[plan]`
- Direct invocation: `/nexus:nx-plan`

## What It Does

Produces a reviewed plan document via a multi-agent consensus loop, then proposes an execution path. Unlike consult (which discovers the best approach through dialogue), plan assumes the goal is understood and focuses on *how* to get there.

## Adaptive Formality

규모를 먼저 판단한다. 오버엔지니어링하지 않는다.

| 규모 | 기준 | 형식 | 참여자 |
|------|------|------|--------|
| 소규모 | 단일 관심사, 변경 의도가 명확 | 체크리스트 | Strategist 단독 |
| 대규모 | 복수 관심사 / 설계 결정 필요 | 구조화된 계획 + 리뷰 | Strategist + Architect + Reviewer (합의 루프) |

고위험 작업 자동 감지: `auth`, `migration`, `delete`, `security` 키워드가 있으면 대규모로 상향. 세션 내 동일 주제 반복 질문 시 대규모로 자동 상향.

## Workflow

```
analyze → draft → [review loop] → persist → present
```

### Phase 1: Analyze

요청을 분석해 규모를 판단한다.

- `nx_knowledge_read`, `nx_context`로 프로젝트 컨텍스트 파악
- 기존 코드가 있으면 `nx_lsp_document_symbols`, `nx_ast_search`로 현황 파악
- 현재 브랜치 확인 (계획 문서 경로에 사용)
- 불명확한 부분이 있으면 **한 번에 하나의 질문**으로 해소 후 진행

**Branch Guard:** main/master 브랜치에서는 계획 수립 전에 feature 브랜치를 먼저 생성한다.
1. 사용자 요청을 분석하여 적절한 브랜치명 생성 (예: `feat/setup-recommended-plugins`, `fix/statusline-bug`)
2. `git checkout -b <branch-name>` 실행
3. 이후 계획 워크플로우 진행
계획 문서는 `.nexus/plans/{branch}/`에 저장되므로, main에서의 계획 수립은 허용하지 않는다.

### Phase 2: Draft (Strategist)

```
Agent({
  subagent_type: "nexus:strategist",
  prompt: "다음 작업에 대한 구현 계획 초안을 작성하라. [규모 수준 명시]\n\n요청: {request}\n\n컨텍스트: {context}"
})
```

출력 형식은 규모에 맞게:

**소규모** — 체크리스트:
```
## 계획
- [ ] 변경 파일: src/foo.ts
- [ ] 할 일: X 함수 추가
- [ ] 검증: 기존 테스트 통과 확인
```

**대규모** — 구조화된 계획:
```
## 목표
## 변경 범위
## 단계별 구현
## 리스크
## 테스트 전략
## 완료 기준
```

### Phase 3: Consensus Loop (대규모)

순차 실행 필수 — 병렬화하면 검토 체인이 깨진다.

**Architect 검토 → Reviewer 비판 + 반복 (최대 3회)**
```
Agent({
  subagent_type: "nexus:architect",
  prompt: "다음 계획 초안을 구조적 관점에서 검토하라. 인터페이스 설계, 의존성, 확장성 문제를 중심으로.\n\n초안: {draft}"
})
```

Architect가 수정 사항을 제안하면 Strategist가 반영해 초안을 갱신한다.

```
Agent({
  subagent_type: "nexus:reviewer",
  prompt: "다음 계획을 비판적으로 검토하라. 누락된 리스크, 과잉 복잡도, 잘못된 가정을 지적하라.\n\n계획: {draft}"
})
```

반복 판단 기준:
- Reviewer가 수정 필요라고 판단 → Strategist 재작성 → 루프 재시작
- Reviewer가 승인 → 루프 종료
- 3회 후 미승인 → 마지막 초안에 미해결 이슈를 명시하고 종료

### Phase 4: Persist (MANDATORY — do NOT skip)

계획 문서와 태스크 목록을 반드시 저장한다. 이 단계를 건너뛰면 안 된다.

1. 디렉토리 생성:
```
Bash({ command: "mkdir -p .nexus/plans/{branch-dir}/" })
```

2. plan.md 저장:
```
Write({ file_path: "{project_root}/.nexus/plans/{branch-dir}/plan.md", content: "{final_plan}" })
```

3. tasks.json 저장:
```
Write({ file_path: "{project_root}/.nexus/plans/{branch-dir}/tasks.json", content: "[{\"id\":1,\"title\":\"...\",\"status\":\"pending\"}, ...]" })
```

브랜치명의 `/`는 `--`로 치환 (예: `fix/foo` → `fix--foo`).
Both files MUST exist before proceeding to Phase 5.

### Phase 5: Present

계획 요약을 보여주고 종료한다. 사용자가 다음 단계를 자연스럽게 결정한다.

- 계획의 핵심 항목(목표, 변경 범위, 태스크 수)을 간결히 요약
- "실행해" → 에이전트 위임, 추가 지시 → 계획 수정, 아무것도 안 함 → 종료

## Key Principles

1. **규모 먼저 판단** — 소규모 작업에 합의 루프를 돌리지 않는다
2. **순차 실행** — Strategist → Architect → Reviewer 순서 고정, 병렬화 금지
3. **최대 3회 루프** — 합의에 실패해도 미해결 이슈를 명시하고 계속 진행
4. **컨텍스트 우선** — 코드와 knowledge를 먼저 읽고 계획 수립
5. **고위험 자동 상향** — 보안/마이그레이션 키워드는 무조건 대규모 처리. 세션 내 반복 질문도 대규모로 상향
6. **실행 강요 금지** — 계획 제시 후 사용자에게 결정을 맡긴다

## State Management

Plan은 gate.ts에 의해 workflow.json이 자동 생성됩니다 (mode: "plan", phase: "analyzing" 또는 "branch-setup"). 별도 상태 관리 코드는 불필요합니다.

## Deactivation

Plan은 자연스럽게 종료된다:
- 계획 요약 제시 후 종료
- 별도 `nx_state_clear`는 불필요
