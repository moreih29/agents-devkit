<!-- tags: agents, skills, tags, tasks -->
# Orchestration Model

## 에이전트 3계층 (HOW / DO / CHECK)

- **HOW** (architect, designer, postdoc, strategist) — 의사결정, 설계, 방법론. 읽기 전용, 파일 수정 불가.
- **DO** (engineer, researcher, writer) — 실행, 구현, 조사. 파일 수정 가능.
- **CHECK** (tester, reviewer) — 검증, 품질 보증. 읽기 전용, 조언만.

**Lead = 유일한 합성자**: 스코프 결정, 태스크 관리, 결정 기록은 Lead만 가능. 에이전트는 역할에 고정됨.

## 스킬 라이프사이클

태그 감지 → 스킬 로드 → 워크플로우 실행 → 종료 조건 충족 → 아카이브.

- **[plan]**: 이슈별 다관점 분석 → 비교 테이블 → 결정 기록 → plan.json
- **[run]**: tasks.json 기반 에이전트 디스패치 → 병렬 실행 → 검증 → nx_task_close
- **[sync]**: git diff → context/ 대상 갱신 → 보고
- **[m]**: 사용자 입력 압축 → .nexus/memory/ 저장
- **[rule]**: 규칙 추출 → .nexus/rules/ 저장

**필수 스킬 호출 (Mandatory Skill Invocation)**: gate.ts가 plan/run 실행 전에 스킬 로드를 강제. 구조화된 심의를 우회하는 "비구조적 실행" 방지.

## 태스크 파이프라인

`plan → tasks.json 생성 → run → 에이전트 실행 → task_update → task_close → history.json 아카이브`

- PreToolUse에서 Edit/Write 차단 (tasks.json 있을 때, 태스크 미완료 시)
- Stop에서 종료 차단 (pending 태스크 존재 시)
- 의존성 기반 병렬/직렬 디스패치

## 지식 관리 철학

"코드/웹에서 다시 얻을 수 없는 것만 저장한다."

- **memory/**: 프로젝트 고유 경험적 지식. [m] 태그로 축적.
- **context/**: 추상적 설계 원칙. nx-init 생성 + [sync] 갱신.
- **rules/**: 프로젝트 커스텀 규칙. [rule] 태그로 저장.
- **state/**: 런타임 상태 (plan.json, tasks.json). 에페메랄.
