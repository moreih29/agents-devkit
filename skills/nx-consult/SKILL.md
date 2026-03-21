---
name: nx-consult
description: Interactive discovery workflow with adaptive depth and dimension tracking.
triggers: ["consult", "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"]
---
# Consult

Interactive discovery workflow — understand the user's real intent, explore options, and converge on the best approach before execution.

## Trigger
- User says: "consult", "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"
- Explicit tag: `[consult]`
- Direct invocation: `/nexus:nx-consult`

## What It Does

A structured conversation loop that **discovers** the best approach rather than immediately executing.
Consult keeps the user in the loop at every decision point.

## Adaptive Depth

모든 상담을 12라운드 인터뷰로 만들지 않는다. 첫 탐색에서 복잡도를 판단:

- **Lightweight** (기본): 불명확 차원 0-1개. 기존 consult 수준 — 2라운드 수렴, 선택지 제시 중심.
- **Deep** (자동 전환): 불명확 차원 2개 이상. 차원 추적 활성화, 관점 전환 포함, 라운드 연장 가능.

## Workflow

```
explore → assess → (clarify) → diverge → propose → converge → crystallize → execute bridge
```

### Phase 1: Explore

**Brownfield/Greenfield 자동 감지** 후 행동 분기:
- **Brownfield** (관련 파일/디렉토리가 이미 존재): 코드베이스 먼저 탐색 → 기존 패턴/제약 파악 → 그 위에 질문
- **Greenfield** (새로 만드는 것): 사용자 의도 중심 질문 → 기술 선택지 제시

탐색 수단:
- `nx_knowledge_read`, `nx_context`로 프로젝트 컨텍스트 파악
- Brownfield일 경우 `nx_lsp_document_symbols`, `nx_ast_search`로 기존 코드 구조 파악
- "코드를 봤더니 X인데 맞나요?" 형태의 근거 있는 질문

탐색 후 **차원별 이해도** 초기 평가:
```
[Goal: ?] [Constraints: ?] [Criteria: ?] [Context: ?]
```

### Phase 2: Clarify (대화)

**한 번에 하나의 질문** 원칙. 가장 약한 차원을 다음 질문 대상으로 선택.
**반드시 `AskUserQuestion`을 사용**하여 선택지 형태로 질문. 자유 텍스트 질문 금지.

```
❌ 일반 텍스트로 질문: "성능이란 어떤 의미인가요?"
✅ AskUserQuestion으로 선택지 제시:
AskUserQuestion({
  questions: [{
    question: "어떤 종류의 성능을 의미하나요?",
    header: "Clarify",
    multiSelect: false,
    options: [
      { label: "응답 속도", description: "훅/MCP 프로세스 스폰 오버헤드" },
      { label: "토큰 효율성", description: "컨텍스트 소비, 에이전트 호출 비용" },
      { label: "둘 다", description: "속도와 토큰 효율 모두" }
    ]
  }]
})
```

차원별 정성 추적 (숫자 점수 없음):
```
[Goal: ✅ 명확] [Constraints: ⚠️ 불명확] [Criteria: ❌ 미정의] [Context: ✅ 파악됨]
```

Lightweight: 모든 차원 ✅이면 바로 Phase 3으로. 대부분 1-2 질문이면 충분.
Deep: 불명확 차원이 남아있으면 계속. 단, 대화 흐름에 따라 자연스럽게 **관점 전환**:
- 사용자가 한 방향에만 집중할 때: "반대 입장에서 보면..."
- 요구사항이 과도하게 복잡할 때: "가장 단순하게 줄이면..."
- 핵심 개념이 불명확할 때: "이 시스템의 본질적인 문제는..."

### Phase 3: Diverge (자동)
- 2-4개의 genuinely different 접근 방식 생성
- 각 접근에 pros, cons, effort level 정리
- 기존 패턴, 팀 컨벤션, 확장성 고려

### Phase 4: Propose (사용자 상호작용)

`AskUserQuestion`으로 선택지 제시:
```
AskUserQuestion({
  questions: [{
    question: "어떤 접근 방식이 좋을까요?",
    header: "Approach",
    multiSelect: false,
    options: [
      {
        label: "Option A (Recommended)",
        description: "간단한 설명...",
        preview: "## Option A\n\n구체적인 구현 방향...\n\n**Pros:** ...\n**Cons:** ...\n**Effort:** ..."
      }
    ]
  }]
})
```

- `preview`에 구체적 내용 (코드 스니펫, 파일 구조 등)
- 추천 옵션에 "(Recommended)" 표기
- 라벨은 짧게 (1-5 단어), 상세는 description과 preview에

### Phase 5: Converge (자동 + 상호작용)
- 선택된 접근 방식 구체화
- 필요시 후속 질문 (한 번에 하나씩)
- 구현 계획 작성 (파일, 단계, 테스트 전략)

### Phase 6: Crystallize

계획을 최종 정리하며 **불명확 차원의 리스크를 투명하게 공개**:
```
⚠️ Constraints가 아직 불명확합니다. 진행하면 X 리스크가 있을 수 있어요.
```
사용자가 "됐어, 시작하자"라고 하면 차단하지 않음. 리스크만 알리고 존중.

### Phase 7: Execute Bridge

수렴 후 실행 전환 시 `AskUserQuestion`으로 선택지:
```
options:
  - "Execute with delegation (Recommended)" — Nexus가 에이전트에 위임하여 실행
  - "Plan only" — 계획 문서 생성 후 종료
```

## Key Principles

1. **한 번에 하나의 질문** — 여러 질문을 한꺼번에 던지지 않음
2. **질문은 구체적으로** — "어떻게 할까요?"가 아니라 명확한 선택지 제시
3. **선택지는 진짜 다른 것** — A와 B가 사실상 같으면 의미 없음
4. **컨텍스트를 먼저 파악** — 질문하기 전에 코드와 knowledge를 충분히 탐색
5. **적응형 깊이** — 단순한 건 빠르게, 복잡한 건 깊게
6. **리스크 투명 공개** — 불명확한 부분이 있으면 숨기지 않고 알림
7. **실행 강요 금지** — 사용자가 "아직"이라고 하면 계획만 정리하고 종료

## Dimension Tracking

네 가지 차원을 정성적으로 추적. 숫자 점수 없음 — LLM이 자기 이해도를 0.65 vs 0.70으로 평가하는 건 가짜 정밀도.

| 차원 | 의미 | 예시 질문 |
|------|------|-----------|
| Goal | 무엇을 달성하려는가 | "최종 사용자에게 어떤 변화를 주려는 건가요?" |
| Constraints | 제약조건, 불가능한 것 | "기존 API 호환성을 유지해야 하나요?" |
| Criteria | 성공/실패 판단 기준 | "어떤 상태가 되면 완료라고 볼 수 있나요?" |
| Context | 배경, 기존 시스템, 팀 상황 | "이 모듈을 다른 팀도 사용하나요?" |

상태 표기: ✅ 명확 / ⚠️ 불명확 / ❌ 미정의

## State Management

Consult는 gate.ts에 의해 workflow.json이 자동 생성됩니다 (mode: "consult", phase: "exploring"). 별도 상태 관리 코드는 불필요합니다.

## Deactivation

Consult는 자연스럽게 종료됩니다:
- 실행으로 전환 시 → 에이전트 위임으로 인계
- 계획만 정리 시 → 메모에 기록하고 종료
- 별도 `nx_state_clear`는 불필요
