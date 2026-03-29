<!-- tags: identity, roadmap, phases, migration -->
# Roadmap

설계 결정을 점진적으로 구현한다. 한 번에 너무 많이 하지 않는다. Phase 단위로 안정화 후 다음 진행.

## Phase 0 — 기반 문서화

- [x] identity 문서 수립 (mission.md, design.md, roadmap.md)
- [x] consult 스킬에 Intent-First 반영 (SKILL.md 수정, 코드 변경 없음)

## Phase 1a — 정보 체계

core/ 4계층(identity/codebase/reference/memory) 디렉토리 구조를 도입하고, 기존 knowledge를 마이그레이션한다.

**달성 목표**:
- `.claude/nexus/core/` 하위에 계층별 디렉토리 구조 동작
- nx-sync가 codebase/ 범위만 자동 관리
- MCP 도구가 하위 디렉토리를 지원
- rules/ 도메인별 분류 체계 동작

## Phase 1b — 에이전트 통합

Director+Principal을 병합하고, 에이전트 프롬프트에 새 철학을 반영한다.

**달성 목표**:
- [x] Director+Principal 병합 (7→6 에이전트)
- [x] 에이전트 프롬프트 새 철학 반영
- 모든 에이전트가 새 역할 정의(Decide/How/Do/Check)에 맞게 동작
- 팀 경계 없이 자유 조합 가능

## Phase 2 — 태그 + 스킬 통합

[dev]/[research]를 [do]로 통합하고, 실행 스킬을 하나로 만든다.

**달성 목표**:
- [x] [consult]/[do]/[do!]/[d] 태그 체계 동작
- [x] 단일 실행 스킬(nx-do) 동적 구성 동작
- [x] consult 스킬의 "실행 안 함 → 적절한 태그 추천" 재검토 ([do]밖에 없으면 추천이 무의미)

## Phase 3 — 실행 개선

Lead의 기본값을 역전하고, 시스템 자동 briefing과 2단계 검증을 도입한다.

**달성 목표**:
- [x] Lead+Director 상시 팀 동작 — Phase 2의 Lead 직감 판단 → Director 상시 팀 구조로 전환 (3조건 충족 시만 Lead 직접 실행)
- [x] nx_briefing 자동 briefing 동작 — 역할별 auto-briefing 수집 (core/ 4계층 매트릭스 기반, hint 선택적 필터)
- [x] 2단계 검증 동작 — Director 의도 검증 + QA 산출물 검증 (Director 재량 + 4조건)

## Phase 4 — 하네스 강화

루프 감지, 단계적 에스컬레이션, Memory 자동 기록을 도입한다.

**달성 목표**:
- [x] 에이전트 반복 실패 시 자동 감지 + 에스컬레이션 체인 동작
- [x] task_close 시 교훈이 memory/에 자동 추출
- [x] memory가 다음 세션의 에이전트 briefing에 반영되어 자기 발전 메커니즘 동작
