# Cycle 단위 분할 + 단일 commit 패턴

**날짜**: 2026-04-10
**출처**: resume_tier Phase 1 (cycle 65, 12파일 문서) + Phase 2 Cycle A (cycle 66, gate.ts 인프라). 둘 다 회귀 0 + 단일 [run] + fast-forward 머지로 성공.

## 원칙

대규모 변경을 **의미 있는 가치 단위** 사이클로 분할. 각 사이클은:
- 하나의 [plan] + [run] + `nx_task_close` 세트로 처리
- 단일 commit + main fast-forward 머지
- 독립 회귀 검증 가능
- 사이클 단위 rollback 가능

## 분할 기준 (사이클 자격 요건)

1. **독립 가치**: 단독으로 어떤 기능/가치를 제공 — 후속 사이클이 없어도 useful
2. **격리된 테스트**: 해당 사이클만으로 회귀 검증 가능
3. **의존성 직선**: 다음 사이클에 필요한 데이터/인터페이스만 제공 (순환 의존 금지)
4. **commit 크기**: 대체로 20 파일 이하 또는 300 lines 이하

## 실증 사례

### Phase 1 (resume_tier 스킴 도입, cycle 65)
- 17파일 변경 (agents ×9 + SKILL.md ×2 + memory ×3 + orchestration ×1 + CLAUDE.md + history)
- **코드 0줄** — 문서/frontmatter만
- 가치: Lead가 의도적 resume 선택 가능 (80% 가치 확보)
- 단일 commit `b8df6ac`

### Phase 2 Cycle A (gate.ts 인프라, cycle 66)
- 4파일 변경 (gate.ts +76 lines + 빌드산출물 + CLAUDE.md)
- gate.ts 단일 파일 수정이라 **한 engineer에 4 sub-task 묶음** (토큰 효율 + 일관성)
- 가치: runtime.json + tool-log.jsonl + resume_count/files_touched 추적 자동화
- 단일 commit `ae1b53b`, tester 5/5 PASS

## 반사례 (지양)

- **단일 대형 사이클**: 전체 Phase를 한 [run]으로 → 회귀 시 부분 revert 불가, 원인 특정 어려움
- **미세 분할**: 각 함수 변경마다 별도 사이클 → 단독으로 무가치한 commit 다수, 검증 피로

## 같은 파일 내 복수 task 묶기

Cycle A처럼 한 파일에 여러 sub-task가 있을 때, 각 sub-task를 별도 engineer에게 주면 파일 충돌 발생. **한 engineer에게 전부 묶어** structured prompt로 전달하는 것이 권장. 이는 `feedback_run_delegate.md`의 "태스크 2+/파일 2+이면 엔지니어 스폰 필수"와 충돌하지 않음 — 스폰 **필수** 규칙이지 **N:N** 규칙이 아님.

## 적용 가이드

1. Phase 구상 시 사이클 경계를 먼저 설정 (의존성 그래프 직선화)
2. 각 사이클을 plan → run → close 단위로 구현
3. nx_task_close가 자연스러운 사이클 경계 역할 (history.json에 archive)
4. Phase당 2-4 사이클이 적정
