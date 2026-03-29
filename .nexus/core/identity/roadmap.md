<!-- tags: identity, roadmap, phases -->
# Roadmap

Phase 단위로 안정화 후 다음 진행. 완료된 Phase는 이력으로 유지한다.

## Phase 0 — 기반 문서화

- [x] identity 문서 수립 (mission.md, design.md, roadmap.md)
- [x] consult 스킬에 Intent-First 반영 (SKILL.md 수정, 코드 변경 없음)

## Phase 1 — 정보 체계 + 에이전트 통합

core/ 4계층 구조를 도입하고, Director+Principal을 병합하여 에이전트 프롬프트에 새 철학을 반영한다.

**달성 목표**:
- [x] `.nexus/core/` 하위에 계층별 디렉토리 구조 동작
- [x] nx-sync가 codebase/ 범위만 자동 관리
- [x] MCP 도구가 하위 디렉토리를 지원
- [x] rules/ 도메인별 분류 체계 동작
- [x] Director+Principal 병합 (7→6 에이전트)
- [x] 에이전트 프롬프트 새 철학 반영
- [x] 모든 에이전트가 새 역할 정의(Decide/How/Do/Check)에 맞게 동작
- [x] 팀 경계 없이 자유 조합 가능

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

## Phase 5 — 구조 재설계

전면 재검토 기반 재설계. 외부 레퍼런스(OMC/OMO/블로그) 조사 후 22개 결정사항 구현.

**달성 목표**:
- [x] [do]/[do!] 태그 폐지 → 기본 오케스트레이션 (태그 없는 메시지 = Lead→Director→동적 구성)
- [x] 10개 에이전트 체계 (6→10: +Designer, Strategist, Writer, Reviewer)
- [x] 2 파이프라인: 코드(Architect/Designer→Engineer→QA) + 콘텐츠(Postdoc/Strategist→Researcher/Writer→Reviewer)
- [x] nx-do → nx-run (기본 동작 승격), nx-sync → nx-init (풀 온보딩)
- [x] SessionStart 훅으로 Director 스폰 1회 주입
- [x] SubagentStart/Stop 훅으로 에이전트 생명주기 추적
- [x] MCP matcher Circuit Breaker (nx_task_update reopen 3경고/5차단)
- [x] 스마트 resume (tasks.json stale 판단)
- [x] [consult] 태그 시 조사 강제 컨텍스트 주입
- [x] 구조화된 위임 포맷 (TASK/CONTEXT/CONSTRAINTS/ACCEPTANCE)
- [x] Do 즉시 기록 + Director 검토 패턴 (codebase: Engineer, reference: Researcher)
- [x] Director 인메모리 세션 내 학습

## Phase 6 — 상태 파일 관리 + Director 제거

Director 역할을 Lead로 통합하고, 상태 파일 구조를 정비한다.

**달성 목표**:
- [x] Director 제거 (10→9 에이전트, Decide 카테고리 폐지 → 3카테고리: How/Do/Check)
- [x] Lead가 Decide+Orchestration 겸임 (Director의 의도 대변 역할 흡수)
- [x] agent-tracker (.nexus/state/agent-tracker.json)
- [x] history.json → .nexus/history.json 프로젝트 레벨로 이동
- [x] reopen-tracker task_close에서 제거
- [x] nx_task_add caller 파라미터 제거 (Lead 단독, disallowedTools로 강제)
- [x] Phase 6단계 파이프라인 재설계: Intake→Design→Execute→Check→Document→Complete
- [x] Phase 4(Check) 되돌림 규칙: 코드 문제→Phase 3, 설계 문제→Phase 2
- [x] Phase 5(Document): Writer가 코어 계층별 병렬 갱신
- [x] [consult] 조사 강제: Explore+researcher 병렬 스폰, 조사 완료 전 금지
- [x] Evidence Requirement 전 에이전트(How/Do/Check) 공통 적용
- [x] Lead 조율 규칙 명문화: 병렬화(파일 겹침 기준), QA 역할 분리
- [x] Lead "사실 확인 허용, 분석/판단은 위임" 원칙 확립
- [x] 팀 세션 수명 관리, 팀원 필요에 따라 스폰/shutdown

---

## 향후 고려 사항

실사용 피드백을 축적하며 필요 시 Phase로 구체화한다.

- 팀 에이전트 autocompact / 컨텍스트 관리 전략
- 실사용 중 발견되는 하네스 개선점
