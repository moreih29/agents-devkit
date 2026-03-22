---
name: nx-consult
description: Structured consultation to clarify requirements and align on direction. Consult only — does not execute.
triggers: ["consult", "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"]
---
# Consult

구조화된 상담으로 사용자의 요구사항을 정리하고 방향을 합의한다. 실행하지 않는다.

## Trigger

- User says: "consult", "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"
- Explicit tag: `[consult]`
- Direct invocation: `/nexus:nx-consult`

## What It Does

요구사항이 불명확할 때 구조화된 상담으로 정리한다. 선택지를 제시하고 방향을 합의하는 것이 전부다. 실행은 하지 않으며, 사용자가 `[team]`으로 전환하여 실행을 시작한다.

## Workflow

```
explore → clarify → propose → converge
```

### Phase 1: Explore

**Brownfield/Greenfield 자동 감지** 후 행동 분기:

- **Brownfield** (관련 파일/디렉토리가 이미 존재): 코드베이스 먼저 탐색 → 기존 패턴/제약 파악 → 그 위에 질문
- **Greenfield** (새로 만드는 것): 사용자 의도 중심으로 질문 → 기술 선택지 제시

탐색 수단:
- `nx_knowledge_read`, `nx_context`로 프로젝트 컨텍스트 파악
- Brownfield일 경우 `nx_lsp_document_symbols`, `nx_ast_search`로 기존 코드 구조 파악
- "코드를 봤더니 X인데 맞나요?" 형태의 근거 있는 질문

### Phase 2: Clarify

**한 번에 하나의 질문** 원칙. 반드시 `AskUserQuestion`을 사용하여 선택지 형태로 질문한다. 자유 텍스트 질문 금지. 1-2회면 충분하다.

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

### Phase 3: Propose

2-3개의 genuinely different 접근 방식을 `AskUserQuestion`으로 제시한다.

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
        preview: "## Option A\n\n구체적인 방향...\n\n**Pros:** ...\n**Cons:** ...\n**Effort:** ..."
      }
    ]
  }]
})
```

- 각 선택지에 pros, cons, effort 정리
- 추천 옵션에 "(Recommended)" 표기
- `preview`에 구체적 내용 포함

### Phase 4: Converge

선택된 방향을 정리하고 종료한다. 실행으로 이어지지 않는다.

- 선택된 접근 방식과 그 근거를 요약
- 다음 단계로 `[team]`을 제안 (전환은 사용자가 결정)
- `[d]`로 결정 사항 기록 가능 (`nx_decision_add`)

## Key Principles

1. **한 번에 하나의 질문** — 여러 질문을 한꺼번에 던지지 않음
2. **선택지는 진짜 다른 것** — A와 B가 사실상 같으면 의미 없음
3. **컨텍스트를 먼저 파악** — 질문하기 전에 코드와 knowledge를 충분히 탐색
4. **실행 안 함** — 상담 후 사용자가 `[team]`으로 전환을 결정

## State Management

상태 파일 없이 동작한다. `workflow.json` 생성이나 `nx_state_*` 호출 불필요.

## Deactivation

Converge 후 자연스럽게 종료된다. 별도 정리 작업 없음.
