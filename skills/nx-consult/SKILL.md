---
name: nx-consult
description: Structured consultation to clarify requirements and align on direction. Consult only — does not execute.
triggers: ["consult", "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"]
---
# Consult

사용자와 구조화된 상담으로 요구사항을 정리하고 방향을 합의한다. 실행하지 않는다.

## Trigger

- User says: "consult", "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"
- Explicit tag: `[consult]`
- Direct invocation: `/claude-nexus:nx-consult`

## What It Does

요구사항이 불명확하거나 설계/전략 논의가 필요할 때 상담으로 정리한다. 실행은 하지 않으며, 준비되면 적절한 실행 태그를 추천한다.

## Principles

1. **탐색 우선** — 질문하기 전에 코드, knowledge, decisions를 먼저 파악. 근거 있는 질문을 한다.
2. **AskUserQuestion은 선택적 도구** — 명확한 선택지가 있을 때 사용. 열린 토론이 필요하면 자연어 대화. 최종 확정 시 사용하면 효과적.
3. **결정은 [d]로 기록** — 결정이 나오면 사용자에게 [d] 태그 기록을 제안한다. 멀티턴에서 결정사항이 흩어지지 않도록.
4. **다음 주제로 자연스럽게 이어감** — 한 주제의 결정이 나면 다음 논의할 주제를 제안하여 상담 흐름을 유지한다.
5. **실행 안 함** — 상담 후 가용한 실행 태그 중 적절한 것을 추천 (CLAUDE.md Tags 테이블 참조). 전환은 사용자가 결정.
6. **필요시 에이전트 소환** — 특화된 분석이 필요하면 에이전트를 자율적으로 스폰하여 정보를 수집할 수 있다.

## 상담 패턴

### 빠른 결정 (단일 주제, 명확한 선택지)

1. 컨텍스트 파악 (코드/knowledge 탐색)
2. AskUserQuestion으로 선택지 제시 (2-3개, pros/cons/effort 포함, 추천에 "(Recommended)" 표기)
3. 선택 확정 → [d] 기록 제안

### 심층 토론 (복수 주제, 탐색적)

1. 컨텍스트 파악
2. 자연어 대화로 주제별 순차 탐색
3. 각 주제마다 합의 → [d] 기록 제안 → 다음 주제로 이어감
4. 모든 주제 합의 후 실행 태그 추천

## 자기강화 루프

```
[consult] 시작
  ↓
탐색 → 토론 → 결정 → [d] 기록 (gate.ts 리마인더 재주입) → 다음 주제 제안 → 토론 → ...
  ↓
실행 태그 추천 (예: [dev])
```

[d] 태그가 gate.ts를 통해 리마인더를 재주입하므로, 긴 대화에서도 상담 맥락이 자연스럽게 유지된다.

## State Management

상태 파일 없이 동작한다. [d] 태그와 대화 컨텍스트만으로 상담 모드를 유지.

## Deactivation

사용자가 실행 태그 (예: [dev])로 전환하면 자연스럽게 종료. 별도 정리 작업 없음.
