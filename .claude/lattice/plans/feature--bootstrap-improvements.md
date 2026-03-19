# Plan: feature/bootstrap-improvements

## 목표
부트스트랩 개발에 필요한 즉시 개선 사항 구현.

## 완료 조건
- [x] Pulse 컨텍스트 수준 분기 (minimal/standard/full)
- [x] workflows.md auto 키워드 정리
- [x] E2E 테스트 확장 (36개 통과)
- [x] E2E 테스트 격리 개선 (활성 세션 간섭 방지)
- [x] 빌드 + 캐시 동기화

## Unit 1: Pulse 컨텍스트 수준 분기

### 설계 결정: 최고 수준 우선 전략
병렬 실행 시 어떤 에이전트가 특정 PreToolUse를 트리거했는지 구분 불가.
→ 활성 에이전트 중 **가장 높은 context 수준**을 적용.

- full 에이전트 활성 → 모든 메시지 주입
- standard만 활성 → safety + workflow + guidance
- minimal만 활성 → safety + workflow만 (guidance 생략)
- 에이전트 없음 (메인 세션) → standard 취급

### 구현
1. 에이전트→context 매핑 상수 추가 (`AGENT_CONTEXT_LEVELS`)
2. `agents.json`에서 활성 에이전트 조회
3. 최고 context 수준 결정
4. `buildMessages()`에서 수준별 메시지 필터링

### 영향 범위
- `src/hooks/pulse.ts` 수정
- `test/e2e.sh` 테스트 추가

## Unit 2: workflows.md 정리
- Pipeline 키워드에서 `auto` 제거 (gate.ts에서 이미 제거됨)
- `.claude/lattice/knowledge/workflows.md` 수정

## 참조
- `src/hooks/pulse.ts` — Pulse 현재 구현
- `src/hooks/tracker.ts` — 에이전트 추적 (agents.json)
- `.claude/lattice/knowledge/architecture.md` — context 수준 설계
