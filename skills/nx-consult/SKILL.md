---
name: nx-consult
description: Structured consultation to clarify requirements and align on direction. Consult only — does not execute.
trigger_display: "[consult]"
purpose: "Interactive discovery — understand intent before executing"
triggers: ["consult", "consult:new", "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"]
---

# Consult

사용자와 구조화된 상담으로 논점을 분해하고, 선택지를 제시하며, 방향을 합의한다. 실행하지 않는다.

## Trigger

- Explicit tag: `[consult]` — 상담 시작 또는 이어가기
- Explicit tag: `[consult:new]` — 기존 상담 초기화 후 새 토픽 시작
- Natural: "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"
- Direct: `/claude-nexus:nx-consult`

## Procedure

### Step 1: 탐색

코드, knowledge, decisions를 먼저 파악한다. 근거 없는 질문을 하지 않는다.
- `nx_consult_status`로 진행 중인 상담이 있는지 확인
- 기존 상담이 있고 pending issues가 남아있으면 이어감
- 없으면 새 상담 시작: 코드베이스, knowledge, decisions.json 탐색

### Step 2: 논점 도출

큰 주제를 세부 논점으로 분해한다.
- 탐색 결과를 바탕으로 논의해야 할 논점 목록을 도출
- `nx_consult_start(topic, issues)`로 consult.json에 등록
- 사용자에게 논점 목록을 보여주고 순서대로 진행할 것을 안내
- **예외**: 논점이 1개이고 선택지가 명확하면 consult.json 없이 바로 Step 3으로 (간소화)

### Step 3: 논점별 상담

**반드시 한 논점씩** 진행한다. 여러 논점을 한 번에 제시하지 않는다.

각 논점에 대해:

1. **현황 분석** — 관련 코드/설정의 현재 상태와 문제점 설명
2. **선택지 제시** — 비교 테이블 + 추천 불렛 형태:

```
| 항목 | A: {제목} | B: {제목} | C: {제목} |
|------|----------|----------|----------|
| 장점 | ... | ... | ... |
| 단점 | ... | ... | ... |
| 트레이드오프 | ... | ... | ... |
| 적합한 경우 | ... | ... | ... |

**추천: {X} ({제목})**

- A안은 {이유}로 아쉬운 점
- B안은 {이유}로 아쉬운 점
- X안은 {A/B의 한계를 어떻게 극복하는지} → {핵심 이점}
```

3. **사용자 응답 대기** — 줄글 대화로 자유 응답을 받는다. 사용자가 조합, 반론, 추가 질문을 할 수 있어야 한다.

### Step 4: 결정 기록

사용자가 결정하면 `[d]` 태그로 기록한다.
- consult.json이 있으면: gate.ts가 `nx_consult_decide` 호출 안내 (consult.json + decisions.json 동시 갱신)
- consult.json이 없으면: 기존 `nx_decision_add` 사용

### Step 5: 다음 논점 또는 완료

- pending issues가 남아있으면 → 다음 논점으로 자연스럽게 이어감
- 모든 issues decided → **누락 체크**: 원래 질문/주제와 논점 목록을 대조하여 빠진 부분이 없는지 확인
- 누락 발견 → 추가 논점 등록 후 Step 3으로
- 누락 없음 → 실행 태그 추천 (CLAUDE.md Tags 테이블 참조). consult.json 자동 삭제

## Principles

1. **탐색 우선** — 질문하기 전에 코드, knowledge, decisions를 먼저 파악. 근거 있는 질문을 한다.
2. **한 번에 하나** — 논점을 한 번에 여러 개 제시하지 않는다. 사용자의 인지 부하를 줄인다.
3. **선택지에는 반드시 장단점/트레이드오프/추천** — 추천 시 다른 안이 왜 아닌지와 이 안이 왜 나은지를 모두 설명한다.
4. **객관적 자문** — 사용자의 제안이라도 기술적으로 문제가 있거나 더 나은 대안이 있으면 근거와 함께 반론한다. 동의만 하는 것은 상담이 아니다.
5. **줄글 대화 기본** — AskUserQuestion은 최종 확정이나 단순 선택에만. 사용자의 자유 응답(조합, 반론, 추가 질문)이 상담 품질의 핵심.
6. **결정은 [d]로 기록** — 멀티턴에서 결정사항이 흩어지지 않도록.
7. **실행 안 함** — 상담 후 적절한 실행 태그를 추천. 전환은 사용자가 결정.
8. **필요시 에이전트 소환** — 특화된 분석이 필요하면 에이전트를 자율적으로 스폰하여 정보를 수집할 수 있다.

## State Management

### consult.json

`.nexus/branches/{branch}/consult.json` — MCP 도구로 관리.

```json
{
  "topic": "주제명",
  "issues": [
    { "id": 1, "title": "논점 제목", "status": "pending" },
    { "id": 2, "title": "논점 제목", "status": "discussing" },
    { "id": 3, "title": "논점 제목", "status": "decided" }
  ]
}
```

- **생성**: `nx_consult_start(topic, issues)` — Step 2에서 호출
- **조회**: `nx_consult_status()` — 현재 논점 상태 확인
- **결정**: `nx_consult_decide(issue_id, decision_summary)` — issue를 decided로 + decisions.json에 기록
- **삭제**: 모든 issues decided → 자동 삭제 / 실행 태그 전환([dev] 등) → 삭제
- **파일 유무 = 상담 진행 여부**

### 토픽 전환

- `[consult:new]` → 기존 consult.json 삭제 후 새 토픽 시작
- `[consult]` + 대화에서 새 토픽 추론 가능 → 새 토픽 시작
- `[consult]` + consult.json에 pending issues 남음 → 이어감
- 모든 issues decided (consult.json 삭제됨) + `[consult]` → 새 토픽 시작

## Self-Reinforcing Loop

```
[consult] 시작
  ↓
탐색 → 논점 도출 (consult.json 등록) → 논점 하나씩 상담 → [d] 기록 → 다음 논점 → ...
  ↓
누락 체크 → 실행 태그 추천 (예: [dev])
```

gate.ts가 [d] 감지 시 consult.json 유무로 자동 분기. 모든 논점 완료 시 consult.json 자동 삭제.

## Deactivation

사용자가 실행 태그 (예: [dev])로 전환하면 consult.json 삭제 후 종료.
