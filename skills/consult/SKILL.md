# Consult

Interactive discovery workflow — understand the user's real intent, explore options, and converge on the best approach before execution.

## Trigger
- User says: "consult", "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"
- Explicit tag: `[consult]`
- Direct invocation: `/lattice:consult`

## What It Does

A structured conversation loop that **discovers** the best approach rather than immediately executing:

```
explore → diverge → propose → converge → (optional) execute
```

Unlike cruise which runs autonomously, consult keeps the user in the loop at every decision point.

## Workflow

### Phase 1: Explore (자동)
- Read the user's request carefully
- Scan relevant code, knowledge, and project context using `lat_knowledge_read` and `lat_context`
- Identify the core problem/goal behind the request
- Note ambiguities, assumptions, and trade-offs

### Phase 2: Diverge (자동)
- Generate 2-4 distinct approaches to solve the problem
- Each approach should be genuinely different (not just variations)
- Consider: simplicity, scalability, existing patterns, team conventions
- For each approach, note pros, cons, and effort level

### Phase 3: Propose (사용자 상호작용)
Present options to the user using `AskUserQuestion`:

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
      },
      // ... 2-4 options with previews
    ]
  }]
})
```

Guidelines for proposals:
- Use `preview` to show concrete details (code snippets, architecture diagrams, file structures)
- Put the recommended option first with "(Recommended)" suffix
- Keep labels short (1-5 words), details in description and preview
- If there are sub-decisions, ask them as separate questions (max 4 per round)

### Phase 4: Converge (자동 + 상호작용)
Based on the user's selection:
- Elaborate on the chosen approach
- If needed, ask follow-up questions for details the chosen approach requires
- Produce a concrete plan (files to change, implementation steps, test strategy)
- Present the plan summary to the user for final confirmation

### Phase 5: Execute (선택적)
If the user approves:
- Offer to transition into execution mode (cruise, pipeline, or manual)
- Ask: "바로 실행할까요? (cruise/pipeline/직접)"
- If cruise: activate cruise with the plan context
- If pipeline: activate pipeline with custom stages from the plan
- If manual: just present the plan and let the user drive

## Key Principles

1. **질문은 구체적으로** — "어떻게 할까요?"가 아니라 명확한 선택지를 제시
2. **선택지는 진짜 다른 것** — A와 B가 사실상 같으면 의미 없음
3. **컨텍스트를 먼저 파악** — 질문하기 전에 코드와 knowledge를 충분히 탐색
4. **2라운드 이내 수렴** — 질문이 3번 이상 반복되면 사용자가 지침
5. **실행 강요 금지** — 사용자가 "아직"이라고 하면 계획만 정리하고 종료

## State Management

Consult는 sustain 없이 동작합니다. 대화형이므로 Gate 차단이 필요 없습니다.
진행 상태 추적이 필요하면 `lat_memo_write`로 메모:

```
lat_memo_write({
  content: "Consult: auth 모듈 설계 - Option B (JWT) 선택, 구현 대기 중",
  tags: ["consult"],
  ttl: "day"
})
```

## Deactivation

Consult는 자연스럽게 종료됩니다:
- 실행으로 전환 시 → cruise/pipeline이 인계
- 계획만 정리 시 → 메모에 기록하고 종료
- 별도 `lat_state_clear`는 불필요
