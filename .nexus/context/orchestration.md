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

`agents/*.md`, `skills/*/SKILL.md`, `src/data/tags.json`은 **build-time generated** from `@moreih29/nexus-core ^0.10.0`.

- 직접 편집 금지 — 수정이 필요하면 upstream nexus-core에서 작업
- Build 시점에 `generate-from-nexus-core.mjs`가 nexus-core manifest.json을 읽어 regenerate
- Body content integrity는 sha256 body_hash로 검증
- harness-local 필드(`model`, `maxTurns`, `disallowedTools`)는 `generate-from-nexus-core.lib.mjs`의 하드코딩 상수(MODEL_TIER_TO_CLAUDE, MAX_TURNS_MAP) 또는 capabilities 유도로 합성
- **Spec γ 매크로 확장 (v0.8.0)**: body.md의 `{{primitive_id key=val ...}}` 토큰은 build 시점에 `invocation-map.yml` 규칙으로 Claude Code tool 호출 문법(`Skill(...)`, `Agent(...)`, `TaskCreate(...)`, `TaskUpdate(...)`, `AskUserQuestion(...)`)으로 확장됨. 4 primitive: `skill_activation`, `subagent_spawn`, `task_register`, `user_question`. heredoc (`prompt=>>IDENT` ... `<<IDENT`) 지원. unknown primitive는 build 실패.
- **예외**: `skills/nx-setup/SKILL.md`는 nexus-core v0.3.0부터 consumer-owned (harness-specific이라 upstream에서 제거됨)
- **예외**: `.claude/skills/deploy/SKILL.md`는 project-local (nexus-core 밖, claude-nexus 자체 release 자동화)

## 태스크 파이프라인

`plan → tasks.json 생성 → run → 에이전트 실행 → task_update → task_close → history.json 아카이브`

- PreToolUse에서 Edit/Write 차단 (tasks.json 있을 때, 태스크 미완료 시)
- Stop에서 종료 차단 (pending 태스크 존재 시)
- 의존성 기반 병렬/직렬 디스패치
- **Tag drift detection**: gate.ts `HANDLED_TAG_IDS` 상수와 nexus-core `vocabulary/tags.yml` tag id set이 build 시점에 cross-check됨. 불일치 시 build 실패. (`verifyTagDrift()` in `generate-from-nexus-core.lib.mjs`)

## Verification auto-pairing

**v0.10.0 canonical** (nexus-core `skills/nx-plan` Step 7): CHECK pair는 조건부로만 생성.

- `engineer` + acceptance에 **runtime behavior** 기준 → **tester** pair
- `writer` + acceptance에 **verifiable deliverable** 기준 → **reviewer** pair
- 제외: `researcher`, 순수 refactor, type-only, docs-adjacent(`.md`/frontmatter). 근거: `tester-artifact-gap.md` — 무조건 pairing이 researcher 산출물을 tester로 오라우팅하던 incident 수정.

**Task-exception catalog** (`vocabulary/task-exceptions.yml`) 4종:

- `docs_only.coherent` — 여러 `.md` 파일이 하나의 coherent 변경을 공유 → 1 writer + 1 reviewer pair, 파일/라인 임계값 waive
- `docs_only.independent` — 각 `.md` 파일이 독립 주제 → 파일당 1 writer + 1 reviewer pair
- `same_file_bundle` — 같은 파일 대상 sub-task는 단일 owner로 merge (파일 충돌 방지)
- `generated_artifacts` — 빌드 산출물(claude-nexus 예: `bridge/`, `scripts/`)은 task count/file count에서 제외. 경로는 하네스 빌드 구성이 정의.

**Dedup Layer 1** (canonical): plan Step 7 task 생성 단계에서 draft task list의 `target_files` 겹침을 스캔하여 `same_file_bundle`로 merge — 정적 머지. Layer 2(wave-time intersection)는 consumer-local.

**Consumer-local 재량** (canonical 아님): in-flight cap 수치, pair-wise streaming 알고리즘, Dedup Layer 2(wave-time), `wave_id` TUI grouping, escalation wave pause/resume, `tool-log.jsonl` recalibration. 프로젝트 cadence에 맞춰 자체 설정.

## 지식 관리 철학

"코드/웹에서 다시 얻을 수 없는 것만 저장한다."

- **memory/**: 프로젝트 고유 경험적 지식. [m] 태그로 축적.
- **context/**: 추상적 설계 원칙. nx-init 생성 + [sync] 갱신.
- **rules/**: 프로젝트 커스텀 규칙. [rule] 태그로 저장.
- **state/**: 런타임 상태. 에페메랄.
  - root: nexus-core 공통 스키마 (`plan.json`, `tasks.json`, `history.json`)
  - `state/claude-nexus/`: harness-local 파일 네임스페이스 (`agent-tracker.json`, `tool-log.jsonl`, `memory-access.jsonl`, `artifacts/`) — nexus-core §Shared filename convention 규칙 준수. agent-tracker.json 엔트리는 harness_id + agent_name 분리 필드로 기록. history.json cycles[]는 schema_version: "0.5" 포함.

**Memory policy v0.10.0 canonical** (`vocabulary/memory_policy.yml`):

- 3 카테고리: `empirical`(관찰·측정) / `external`(상류 제약·인용) / `pattern`(운영 레시피). `primer-` 범주는 context/ 역할과 중복이라 canonical 제외.
- Naming structural contract: lowercase kebab-case `.md`. prefix enumeration은 권고 수준(강제 regex 아님).
- Forgetting: manual gate (`[m:gc]` 호출 시 확인 후 삭제) 기본. P1 자동삭제의 3-signal intersection 구조는 canonical, 구체 수치(일수·사이클·access)는 consumer-local 재량.
- Merge-before-create: 같은 prefix + 토픽 키워드 겹침 시 신규 파일 대신 병합.

**Memory-access observation** (`memory-access.jsonl`): PostToolUse hook이 `.nexus/memory/` Read 이벤트를 catch하여 `.nexus/state/claude-nexus/memory-access.jsonl`에 4-field(`path`/`last_accessed_ts`/`access_count`/`last_agent`) upsert. 실제 read 여부가 memory 유효성 신호 — P4 manual gate의 proposed deletion list 근거.
