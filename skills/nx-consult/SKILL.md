---
name: nx-consult
description: Structured consultation to clarify requirements and align on direction. Consult only — does not execute.
trigger_display: "[consult]"
purpose: "Interactive discovery — understand intent before executing"
triggers: ["consult", "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"]
---

# Consult

사용자와 구조화된 상담으로 논점을 분해하고, 선택지를 제시하며, 방향을 합의한다. 실행하지 않는다.

## Trigger

- Explicit tag: `[consult]` — 기존 세션 있으면 이어서, 없으면 새 세션 시작
- Natural: "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"
- Direct: `/claude-nexus:nx-consult`
- 태그 없이 대화 계속하면 기존 세션 이어감

## Procedure

### Step 0: 의도 발굴

Progressive Depth에 따라 상담 깊이를 결정한다.
- 구체적 요청 → 질문 1~2개로 의도 확인 후 바로 논점 도출
- 방향 설정 → 가설 기반 질문으로 의도 파악
- 추상적/근본적 → 적극적 인터뷰로 사용자도 명확히 하지 못하는 근본적 목표를 발굴

가이드라인: "요청이 구체적이면 가볍게, 추상적이면 깊게." Lead 자율 판단.

### Step 1: 탐색

코드, knowledge, decisions를 먼저 파악한다. 근거 없는 질문을 하지 않는다.

**새 세션** (consult.json 없음):
- STEP 1: researcher 스폰하여 코드+외부 탐색 병행. Explore agent로 코드베이스 탐색 동시 실행.
- STEP 2: 조사 완료 후 결과를 바탕으로 `nx_consult_start` 호출하여 이슈 정리.
- 조사 완료 전 `nx_consult_start` 호출 금지.

**기존 세션** (consult.json 있음):
- STEP 1: `nx_consult_status`로 현재 상태 확인.
- STEP 2: 새 주제/추가 조사 필요 시 Explore+researcher 병렬 스폰하여 탐색.
- STEP 3: 조사 결과 또는 기존 맥락 바탕으로 논의 진행. 조사 완료 전 다음 논점 진행 금지.

탐색 범위는 Progressive Depth의 자연스러운 연장: 깊이가 깊을수록 탐색도 넓어짐

### Step 2: 논점 도출

큰 주제를 세부 논점으로 분해한다.
- 탐색 결과를 바탕으로 논의해야 할 논점 목록을 도출
- `nx_consult_start(topic, issues)`로 consult.json에 등록
- 사용자에게 논점 목록을 보여주고 순서대로 진행할 것을 안내

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
- gate.ts가 `nx_consult_decide` 호출 안내 (consult.json + decisions.json 동시 갱신)

### Step 5: 다음 논점 또는 완료

- pending issues가 남아있으면 → 다음 논점으로 자연스럽게 이어감
- 모든 issues decided → **누락 체크**: 원래 질문/주제와 논점 목록을 대조하여 빠진 부분이 없는지 확인
- 누락 발견 → 추가 논점 등록 후 Step 3으로
- 누락 없음 → 완료 시그널 반환. 사이클 정리는 `nx_task_close`로 일괄 아카이브 (consult+decisions+tasks → history.json)

## Principles

1. **적극적 의도 발굴** — 사용자가 명확히 하지 못하는 것을 적극적으로 찾아라. 말 이면의 근본적 목표를 인터뷰로 발굴한다.
2. **탐색 우선 + 선제적 확장** — 코드/knowledge뿐 아니라 필요 시 외부 자료(웹 검색, 기술 조사)도 선제적으로 수행. 에이전트 소환으로 정보 수집 가능. 근거 없는 질문을 하지 않는다.
3. **가설 기반 질문** — 빈 질문("어떻게 하고 싶으세요?")이 아닌, 탐색 결과에 근거한 가설을 세우고 사용자에게 확인하는 형태로 질문한다.
4. **Progressive Depth** — 요청 복잡도에 따라 상담 깊이를 자동 조절한다. 구체적이면 가볍게, 추상적이면 깊게. 깊이에 따라 탐색 범위도 넓어진다.
5. **한 번에 하나** — 논점을 한 번에 여러 개 제시하지 않는다. 사용자의 인지 부하를 줄인다.
6. **선택지에는 반드시 장단점/트레이드오프/추천** — 추천 시 다른 안이 왜 아닌지와 이 안이 왜 나은지를 모두 설명한다.
7. **객관적 반박** — 사용자의 제안이라도 문제가 있거나 더 나은 대안이 있으면 근거와 함께 적극적으로 반론한다. 동의만 하는 것은 상담이 아니다. 넥서스는 예스맨이 아니다.
8. **줄글 대화 기본** — AskUserQuestion은 최종 확정이나 단순 선택에만. 사용자의 자유 응답(조합, 반론, 추가 질문)이 상담 품질의 핵심.

- 결정은 `[d]`로 기록 — 멀티턴에서 결정사항이 흩어지지 않도록.
- 실행 안 함 — 상담만 수행. 전환은 사용자가 결정.

## State Management

### consult.json

`.nexus/state/consult.json` — MCP 도구로 관리.

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
- **조회**: `nx_consult_status()` — 현재 논점 상태 + 관련 decisions 확인
- **수정**: `nx_consult_update(action, ...)` — 이슈 추가/삭제/제목수정/재오픈
- **결정**: `nx_consult_decide(issue_id, decision_summary)` — issue를 decided로 + decisions.json에 `{id, summary, consult: issue_id}` 포맷으로 기록
- **삭제**: `nx_task_close`로 전체 사이클 아카이브 시 삭제. 모든 issues decided여도 자동 삭제하지 않음
- **파일 유무 = 상담 진행 여부**

### rules (사용자 요청 시)

Lead가 반복 적용 대상이라 판단하면 자동으로 rules에 저장. 사용자가 명시적으로 요청할 때도 생성.

- 일회성 결정: decisions.json에만 기록 (자동)
- 사용자가 커스텀 규칙/원칙 요구 시: `nx_rules_read`로 기존 rules 확인 → 대화로 구체화 → `nx_rules_write`로 저장 안내

### 토픽 전환

- `[consult]` → 기존 consult.json 있으면 세션 이어감. 없으면 새 세션 시작
- 태그 없이 대화 계속 → 기존 세션 이어감

## Rules Template (참고)

도메인 커스텀이 필요하면 `nx_rules_write`로 `.claude/nexus/rules/`에 생성 안내.

**blog.md 예시:**
```markdown
<!-- tags: blog, writing -->
# Blog Rules
## 톤
## 문법
## 출처 형태
```

**api.md 예시:**
```markdown
<!-- tags: api, backend -->
# API Rules
## 에러 처리
## 인증 패턴
## 네이밍 컨벤션
```

## Self-Reinforcing Loop

```
[consult] 시작 → 기존 consult.json 확인/이어가기 (없으면 새 세션)
  ↓
의도 발굴 → 탐색 → 논점 도출 (consult.json 등록) → 논점 하나씩 상담 → [d] 기록 → 다음 논점 → ...
  ↓
누락 체크 → 상담 완료 → nx_task_close로 사이클 아카이브
```

gate.ts가 [d] 감지 시 consult.json 유무로 자동 분기.

## Deactivation

사용자가 실행 태그 (예: [do])로 전환하면 `nx_task_close`로 전체 사이클 정리 (consult+decisions+tasks → history.json) 후 종료.
