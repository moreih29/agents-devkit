---
name: plan
description: Structured planning with multi-agent consensus loop and adaptive formality.
triggers: ["plan", "계획 세워", "설계해", "어떻게 구현", "plan this"]
---
# Plan

Structured planning workflow — produce a concrete, reviewed plan before execution begins.

> This is a standalone Plan skill, not the plan stage within auto. Auto's plan stage is a lightweight internal step; this skill runs a full consensus loop and persists a plan document.

## Trigger
- User says: "plan", "계획 세워", "계획 짜", "설계해", "어떻게 구현", "구현 계획", "plan this"
- Explicit tag: `[plan]`
- Direct invocation: `/nexus:plan`

## What It Does

Produces a reviewed plan document via a multi-agent consensus loop, then proposes an execution path. Unlike consult (which discovers the best approach through dialogue), plan assumes the goal is understood and focuses on *how* to get there.

## Adaptive Formality

규모를 먼저 판단한다. 오버엔지니어링하지 않는다.

| 규모 | 기준 | 형식 | 참여자 |
|------|------|------|--------|
| 소규모 | 파일 1-3개 변경 | 체크리스트 | Strategist 단독 |
| 중규모 | 모듈 수준 변경 | 구조화된 실행 계획 | Strategist + Architect |
| 대규모 | 아키텍처 변경 / 보안 / 마이그레이션 | 전체 ADR + 리스크 분석 | Strategist + Architect + Reviewer (합의 루프) |

고위험 작업 자동 감지: `auth`, `migration`, `delete`, `security` 키워드가 있으면 대규모로 상향.

## Workflow

```
analyze → draft → [review loop] → persist → execute bridge
```

### Phase 1: Analyze

요청을 분석해 규모를 판단한다.

- `nx_knowledge_read`, `nx_context`로 프로젝트 컨텍스트 파악
- 기존 코드가 있으면 `nx_lsp_document_symbols`, `nx_ast_search`로 현황 파악
- 현재 브랜치 확인 (계획 문서 경로에 사용)
- 불명확한 부분이 있으면 **한 번에 하나의 질문**으로 해소 후 진행

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

**중규모** — 구조화된 계획:
```
## 목표
## 변경 범위 (파일 목록)
## 단계별 구현
## 테스트 전략
## 완료 기준
```

**대규모** — ADR 형식:
```
## 컨텍스트
## 결정
## 대안 비교
## 변경 범위
## 리스크 및 완화 방안
## 단계별 구현
## 롤백 계획
## 완료 기준
```

### Phase 3: Consensus Loop (중규모 이상)

순차 실행 필수 — 병렬화하면 검토 체인이 깨진다.

**중규모: Architect 검토**
```
Agent({
  subagent_type: "nexus:architect",
  prompt: "다음 계획 초안을 구조적 관점에서 검토하라. 인터페이스 설계, 의존성, 확장성 문제를 중심으로.\n\n초안: {draft}"
})
```

Architect가 수정 사항을 제안하면 Strategist가 반영해 초안을 갱신한다.

**대규모: Reviewer 비판 + 반복 (최대 3회)**
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

### Phase 4: Persist

계획 문서를 저장한다.

Write 도구로 직접 저장:
```
Write({ file_path: "{project_root}/.claude/nexus/plans/{branch}.md", content: "{final_plan}" })
```

브랜치명을 알 수 없으면 `{task-slug}.md` 형태로 저장.

### Phase 5: Execute Bridge

`AskUserQuestion`으로 실행 전환 선택지 제시:

```
AskUserQuestion({
  questions: [{
    question: "계획이 준비됐습니다. 어떻게 진행할까요?",
    header: "Execution",
    multiSelect: false,
    options: [
      {
        label: "Auto (Recommended)",
        description: "전체 자동화 — 구현→검증→리뷰",
        preview: "auto 스킬이 인계받아 계획대로 실행합니다."
      },
      {
        label: "Pipeline",
        description: "단계별 확인 후 다음으로",
        preview: "각 단계에서 결과를 확인하고 승인 후 진행합니다."
      },
      {
        label: "Manual",
        description: "계획 문서만 생성하고 직접 진행",
        preview: ".claude/nexus/plans/{branch}.md 저장 완료. 직접 실행하세요."
      }
    ]
  }]
})
```

## Key Principles

1. **규모 먼저 판단** — 소규모 작업에 3자 합의 루프를 돌리지 않는다
2. **순차 실행** — Strategist → Architect → Reviewer 순서 고정, 병렬화 금지
3. **최대 3회 루프** — 합의에 실패해도 미해결 이슈를 명시하고 계속 진행
4. **컨텍스트 우선** — 코드와 knowledge를 먼저 읽고 계획 수립
5. **고위험 자동 상향** — 보안/마이그레이션 키워드는 무조건 대규모 처리
6. **실행 강요 금지** — Manual 선택 시 계획 문서만 저장하고 종료

## State Management

Plan은 상태 파일 없이 동작합니다.

## Deactivation

Plan은 자연스럽게 종료된다:
- Execute Bridge에서 선택 후 → auto/pipeline이 인계
- Manual 선택 시 → 계획 문서 저장 후 종료
- 별도 `nx_state_clear`는 불필요
