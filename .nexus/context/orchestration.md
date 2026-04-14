<!-- tags: agents, skills, tags, tasks -->
# Orchestration Model

## 에이전트 3계층 (HOW / DO / CHECK)

- **HOW** (architect, designer, postdoc, strategist) — 의사결정, 설계, 방법론. 읽기 전용, 파일 수정 불가.
- **DO** (engineer, researcher, writer) — 실행, 구현, 조사. 파일 수정 가능.
- **CHECK** (tester, reviewer) — 검증, 품질 보증. 읽기 전용, 조언만.

**Lead = 유일한 합성자**: 스코프 결정, 태스크 관리, 결정 기록은 Lead만 가능. 에이전트는 역할에 고정됨.

## 영속성 축 (resume_tier)

`category`(역할)와 독립된 영속성 축. 각 에이전트의 frontmatter `resume_tier` 필드로 명시.

| Tier | 정책 | 에이전트 |
|------|------|---------|
| **persistent** | 같은 이슈/컨텍스트 내 default-resume, 이슈 간 Lead opt-in, 반증/번복/재검토 강제 fresh, experimental flag 미감지 시 fresh fallback | architect, designer, postdoc, strategist, researcher |
| **bounded** | 같은 artifact(파일/문서) 연속 작업 시 conditional-resume, 대상 재Read 강제, loop prevention/feedback 사이클은 강제 fresh | engineer, writer |
| **ephemeral** | Forced fresh, 예외 없음 (Lead opt-in도 불허) | tester, reviewer |

**이론 근거**: Persistence Surface Theory — reasoning surface(에이전트 컨텍스트) vs artifact surface(파일 시스템). reasoning이 작업 본질이면 resume 가치 높음, artifact가 본질이면 Read로 복원 가능, 검증 작업은 independence가 품질 지표라 reasoning 누적이 해악. 자세한 내용은 `.nexus/memory/persistence-surface-theory.md`.

**핵심**: researcher의 `category:do` + `resume_tier:persistent` 조합처럼 두 축이 독립되어 있어 예외 없는 매핑이 가능. 새 에이전트 추가 시 두 축을 독립적으로 결정.

운영 정책 표/디스패치 알고리즘은 `skills/nx-plan/SKILL.md`(Resume Policy)와 `skills/nx-run/SKILL.md`(Resume Dispatch Rule) 참조.

## 스킬 라이프사이클

태그 감지 → 스킬 로드 → 워크플로우 실행 → 종료 조건 충족 → 아카이브.

- **[plan]**: 이슈별 다관점 분석 → 비교 테이블 → 결정 기록 → plan.json
- **[run]**: tasks.json 기반 에이전트 디스패치 → 병렬 실행 → 검증 → nx_task_close
- **[sync]**: git diff → context/ 대상 갱신 → 보고
- **[m]**: 사용자 입력 압축 → .nexus/memory/ 저장
- **[rule]**: 규칙 추출 → .nexus/rules/ 저장

**필수 스킬 호출 (Mandatory Skill Invocation)**: gate.ts가 plan/run 실행 전에 스킬 로드를 강제. 구조화된 심의를 우회하는 "비구조적 실행" 방지.

## Source of Truth

`agents/*.md`, `skills/*/SKILL.md`, `src/data/tags.json`은 **build-time generated** from `@moreih29/nexus-core ^0.6.0`.

- 직접 편집 금지 — 수정이 필요하면 upstream nexus-core에서 작업
- Build 시점에 `generate-from-nexus-core.mjs`가 nexus-core manifest.json을 읽어 regenerate
- Body content integrity는 sha256 body_hash로 검증
- harness-local 필드(`model`, `maxTurns`, `disallowedTools`)는 `generate-from-nexus-core.lib.mjs`의 하드코딩 상수(MODEL_TIER_TO_CLAUDE, MAX_TURNS_MAP) 또는 capabilities 유도로 합성
- **예외**: `skills/nx-setup/SKILL.md`는 nexus-core v0.3.0부터 consumer-owned (harness-specific이라 upstream에서 제거됨)
- **예외**: `.claude/skills/deploy/SKILL.md`는 project-local (nexus-core 밖, claude-nexus 자체 release 자동화)

## 태스크 파이프라인

`plan → tasks.json 생성 → run → 에이전트 실행 → task_update → task_close → history.json 아카이브`

- PreToolUse에서 Edit/Write 차단 (tasks.json 있을 때, 태스크 미완료 시)
- Stop에서 종료 차단 (pending 태스크 존재 시)
- 의존성 기반 병렬/직렬 디스패치
- **Tag drift detection**: gate.ts `HANDLED_TAG_IDS` 상수와 nexus-core `vocabulary/tags.yml` tag id set이 build 시점에 cross-check됨. 불일치 시 build 실패. (`verifyTagDrift()` in `generate-from-nexus-core.lib.mjs`)

## 지식 관리 철학

"코드/웹에서 다시 얻을 수 없는 것만 저장한다."

- **memory/**: 프로젝트 고유 경험적 지식. [m] 태그로 축적.
- **context/**: 추상적 설계 원칙. nx-init 생성 + [sync] 갱신.
- **rules/**: 프로젝트 커스텀 규칙. [rule] 태그로 저장.
- **state/**: 런타임 상태. 에페메랄.
  - root: nexus-core 공통 스키마 (`plan.json`, `tasks.json`, `history.json`, `agent-tracker.json`)
  - `state/claude-nexus/`: harness-local 파일 네임스페이스 (`tool-log.jsonl`, `artifacts/`) — nexus-core 0.6.0 §Harness-local State Extension 규칙 준수. agent-tracker.json 엔트리는 harness_id + agent_name 분리 필드로 기록. history.json cycles[]는 schema_version: "0.5" 포함.
