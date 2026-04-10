# Auto-pairing 미스매치 — researcher task의 tester 라우팅 오류

**날짜**: 2026-04-10
**상태**: 해결됨 (commit 37cd5d0)

## 사건

Cycle 65 Phase 1 [run] 사이클에서 researcher task(SubagentStop hook 조사)의 보고서를 tester가 검증하려다 실패. tester가 "보고서 artifact를 찾을 수 없음"으로 중단 → Lead spot check로 우회.

## 근본 원인

~~artifact 파일 부재~~ → **auto-pairing 미스매치**.

nx-plan SKILL Step 7의 "Task with acceptance → tester" 규칙이 researcher task도 tester에 라우팅. tester는 코드 검증 전문 — researcher 텍스트 보고서는 역할 밖. researcher 결과의 소비자는 Lead/HOW이지 tester/reviewer가 아님.

## 해결

auto-pairing을 `engineer + acceptance → tester`로 범위 축소. researcher에 대해 명시 안 함(Lead 재량 — 내부 조사면 Lead 직접 평가, 블로그/논문이면 소비자 쪽 CHECK가 자연 연결).

## History GC 정책

history.json GC 기준: **500 cycles 또는 2MB 초과 시 검토**. 현재 69 cycles / ~350KB로 당장 문제 없음.
