# ADR: 에이전트 context 수준 시스템

## 상태
확정 (2026-03-19)

## 맥락
모든 에이전트에 동일한 양의 컨텍스트를 주입하면 두 가지 문제가 발생한다:
1. 소형 모델의 context window를 배경지식으로 낭비
2. 단순 작업 에이전트에게 아키텍처 결정 근거까지 주입하는 것은 비효율

## 결정
에이전트 정의에 `context: minimal | standard | full` 필드를 추가한다.

### 주입 계층
```
[minimal] 에이전트 프롬프트 + appendPrompt (~200 토큰)
[standard] + knowledge + plans/{branch} + 세션 메모 + 워크플로우 상태 (~2,000 토큰)
[full] + knowledge/decisions (~3,000+ 토큰)
```

### 에이전트 매핑
- standard: Engineer, QA (작업에 프로젝트 맥락 필요)
- full: Architect, Director (전체 그림 필요)

## 근거
- "최대한의 컨텍스트"가 아닌 "최적화된 컨텍스트" 주입이 원칙
- tier(모델 크기)와 context(주입량)는 상관관계가 있지만 독립적 설정 — 설정으로 오버라이드 가능
- 세션 메모는 standard에 포함 (이전 에이전트의 진행 상황을 알아야 작업 이어갈 수 있으므로)

## 대안
1. **모두 full** → context window 낭비, haiku 에이전트에서 심각. 기각.
2. **tier 기반 자동** (high=full, medium=standard, low=minimal) → 대부분 맞지만 예외 불가. 기각.
3. **동적 계산** (매번 필요한 컨텍스트를 계산) → 구현 복잡도 과잉. 기각.
