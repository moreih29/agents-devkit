# ADR: 3가지 워크플로우 프리미티브

## 상태
확정 (2026-03-19)

## 맥락
omc는 10개의 실행 모드를 가지고 있다 (autopilot, ralph, ultrawork, ultraqa, swarm, ultrapilot, pipeline, team, ralplan, deep-interview). 각 모드가 독립적인 상태 파일, Stop 차단 로직, 키워드를 가져서 persistent-mode.cjs에 9단계 우선순위가 필요하다.

## 결정
10개 모드를 3가지 프리미티브로 분해한다:
1. **Nonstop** (지속): Stop 차단, 작업 계속
2. **Parallel** (병렬): 독립 태스크 동시 실행
3. **Pipeline** (파이프라인): 단계별 순차 실행

복합 워크플로우 = 프리미티브 조합:
- autopilot = Pipeline + Nonstop + Parallel
- ralph = Nonstop
- ultrawork = Parallel
- ultraqa = Nonstop + (test→fix 반복)

## 근거
- 3개 프리미티브만 관리하면 상태 파일 3개, Stop 로직 1개로 충분
- 새 워크플로우 = 기존 프리미티브의 새 조합 (코드 추가 불필요)
- 키워드 감지도 3그룹만 관리하면 되므로 오탐 확률 대폭 감소
- 9단계 Stop 우선순위 → 단일 우선순위로 단순화

## 대안
1. **모드별 독립 구현** (omc 방식) → 복잡도 폭발, persistent-mode 9단계. 기각.
2. **단일 모드** (Nonstop만) → 병렬/파이프라인 표현 불가. 기각.
3. **4개 이상 프리미티브** → 3개로 충분히 표현 가능. YAGNI. 기각.
