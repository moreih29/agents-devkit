# Changelog

## 0.25.1 (2026-04-11)

### Refactoring
- regenerate skills + tags.json from nexus-core
- regenerate agents from nexus-core (activate generator)

## 0.25.0 (2026-04-10)

### Features
- nx-run SKILL Step 4 — integrate git commit into cycle complete
- add nx_history_search tool + fix auto-pairing scope
- resume_tier Phase 2 Cycle C — e2e tier scenario (Phase 2 complete)
- resume_tier Phase 2 Cycle B — MCP signature extension
- resume_tier Phase 2 Cycle A — gate.ts infrastructure
- introduce resume_tier scheme for subagent persistence (Phase 1)

## 0.24.1 (2026-04-09)

### Refactoring
- add [sync] handler, simplify nx-setup, drop config.json
- nx-init essentials + flatten .nexus/ structure on disk

### Other
- merge: chore/nx-init-essentials — nx-init essentials redesign, .nexus/core/ removal

## 0.24.0 (2026-04-08)

### Refactoring
- redesign context management — flatten .nexus/ structure, remove 4 MCP tools

### Other
- merge: feat/context-management-redesign — context management redesign, flat .nexus/ structure

## 0.23.1 (2026-04-08)

### Other
- merge: feat/agent-spec-enhancement — agent spec common structure + reinforcement

## 0.23.0 (2026-04-08)

### Features
- restructure plan/run skills — HOW opt-out, auto quality, escalation chain, language unification

### Fixes
- remove execution details from plan SKILL.md to enforce run skill loading

### Other
- merge: feat/skill-structural-improvements — plan/run/init/sync/setup skill restructuring
- merge: fix/plan-run-transition — enforce run skill loading by removing plan execution details

## 0.22.0 (2026-04-07)

### Features
- replace nx_briefing with SubagentStart lazy-read index injection

### Other
- merge: feat/briefing-lazy-read — SubagentStart lazy-read index injection

## 0.21.0 (2026-04-06)

### Features
- deterministic skill loading — BLOCKING invoke, trigger tags, pre-checks

## 0.20.0 (2026-04-06)

### Features
- TUI progress default + archive review cycles
- task close enforcement + plan document auto-generation
- hook gap analysis — PostCompact, core index injection, stop_hook_active, discuss removal
- owner delegation in plan Step 7, lead role definition
- agent definitions refinement — tester, acceptance verification, role boundaries
- skill spec refinements — plan:auto, delegation criteria, comparison tables
- redesign v0.20 — subagent architecture, plan-then-execute

## 0.19.0 (2026-04-01)

### Features
- consult → meet 스킬 전면 재설계

### Fixes
- meet 스킬 에이전트 스폰 강제 + gate 동작 개선

## 0.18.0 (2026-03-31)

### Features
- 에이전트 스폰 전략 — [run] 팀 강제 + lean start + 에스컬레이션 기반 확대
- nx-consult 리서치 강제 + Progressive Depth 판별 + 비교표 필수화

### Fixes
- Stop 훅 all completed 무한 루프 방지 — 1회 차단 후 해제

### Other
- Merge branch 'feat/agent-instruction-refinement'
- Merge branch 'feat/consult-skill-tuning'

## 0.17.0 (2026-03-30)

### Features
- nx-sync 스킬 신규 + nx-run Step 5 연동
- [rule] 태그 추가 + consult allComplete 메시지 수정
- Lead 단독 실행 제어 강화 + [run] 태그 + Bash 수정 금지
- briefing rules hint 태그 필터링
- Phase 6단계 재설계 + 코어 문서 갱신 체계 + 52개 stale 참조 해소
- 전 에이전트 Evidence Requirement + Lead 조율 규칙
- 상태파일 관리 개선 + Director 제거
- 구조 재설계 Phase 5 — 10개 에이전트, 기본 오케스트레이션, 하네스 강화
- 하네스 강화 — 루프 감지 + 에스컬레이션 + Memory 자동 기록 (Phase 4)
- 실행 개선 — Lead+Director 상시 팀, nx_briefing, 2단계 검증 (Phase 3)
- 태그+스킬 통합 — [dev]/[research] → [do]/[do!], nx-do 단일 스킬 (Phase 2)
- 에이전트 통합 — Director+Principal 병합 (7→6) (Phase 1b)
- core/ 4계층 구조 도입 (Phase 1a)
- consult 스킬 Intent-First 반영 (Phase 0 완료)

### Refactoring
- 스킬 명세 검토 결정사항 구현
- 에이전트 프롬프트 정비 + category frontmatter
- 컨텍스트 포맷 표준 적용 — 전 문서 영어화 + XML 섹션 태그 통일
- 아이덴티티 재정의 — 자율 오케스트레이터 → 사용자 오케스트레이션 인프라
- .nexus/ 폴더 단일화 + 내부 구조 재설계

### Fixes
- KeywordMatch primitive type union — add 'run'
- gate.ts 프롬프트 검토 결정사항 — 트래커 삭제 + 메시지 정비
- stale 상태 정리 — isNexusInternalPath 범위 축소 + consult_start 자동 아카이빙
- ensureNexusStructure() SessionStart 호출 연결

### Other
- merge: phase-4/harness-reinforcement — 루프 감지 + Memory 자동 기록
- merge: phase-3/execution-improvement — Lead+Director 상시 팀 + nx_briefing + 2단계 검증
- merge: phase-2/tag-skill-unification — [do] 통합 + nx-do 단일 스킬
- merge: phase-1b/agent-consolidation — Director+Principal 병합 (7→6)
- merge: phase-1a/core-structure — core/ 4계층 구조 도입
- merge: phase-0/consult-intent-first — Phase 0 완료
- merge: roadmap — Nexus 재설계 철학/설계/로드맵 수립

## 0.16.0 (2026-03-26)

### Features
- add nx_branch_migrate tool and sub/team path reasoning display

### Other
- merge: feat/branch-state-migrate — nx_branch_migrate 도구 및 판단 근거 표시

## 0.15.2 (2026-03-26)

### Fixes
- improve branch detection and add Branch Guard to dev/research skills

### Other
- merge: fix/branch-detection — 브랜치 인식 개선 및 Branch Guard 추가

## 0.15.1 (2026-03-26)

### Refactoring
- Nexus 구조 점검 — 성능/정합성/안정성 개선

### Other
- merge: chore/full-review — Nexus 구조 점검 개선

## 0.15.0 (2026-03-26)

### Refactoring
- mode.json 제거 + additionalContext 복원

## 0.14.1 (2026-03-26)

### Fixes
- CLAUDE.md 미존재 경로 제거 + consult 스킬 예외 조항 삭제

## 0.14.0 (2026-03-26)

### Features
- tasks.json 파이프라인 강제 — PreToolUse 차단 + UserPromptSubmit 리마인드

### Refactoring
- 구조 리팩토링 — 파이프라인 강제 + 코드 중복 제거 + gate.ts 분해

### Fixes
- 스킬 트리거 강제 — 태그 정규식 수정 + mode.json path 기반 제어

## 0.13.1 (2026-03-25)

### Fixes
- [d] 태그에 행동 규칙 additionalContext 추가
- team-path 팀 종료 예시 추가 (shutdown + TeamDelete)
- sub/team path에서 nx_task_add 필수 + nx_task_close 자동 호출 명시

## 0.13.0 (2026-03-25)

### Features
- 라이프사이클 재설계 + rules 시스템 + 통합 아카이브

## 0.12.0 (2026-03-25)

### Features
- consult 스킬 개선 — 구조화된 상담 절차 + consult.json 상태 관리
- CLAUDE.md 자동 관리 + MCP 동적 브랜치 감지

## 0.11.0 (2026-03-24)

### Features
- nx_artifact_write MCP 도구 추가 — 팀 산출물 브랜치 경로 강제

## 0.10.0 (2026-03-24)

### Refactoring
- init 삭제, sync로 통합 — knowledge 하드코딩 제거, First Run/Reset 모드 추가

## 0.9.0 (2026-03-24)

### Features
- deploy 스킬 추가 — pre-release 검증 + release.mjs 자동화

### Refactoring
- nx-setup Step 3 — 하드코딩 제거, CLAUDE.md에서 런타임 읽기

## 0.8.0 (2026-03-24)

### Features
- 리서치 팀 추가: principal/postdoc/researcher 에이전트 + nx-research 스킬
- 에이전트 시스템 전면 개편: 4인 체제 (director/architect/engineer/qa) + [dev] 통합 스킬
- consult 스킬 경량화: 원칙 기반 프라이머 + [d] 자기강화 루프

### Improvements
- BRANCH_ROOT에 branches/ 세그먼트 추가 + 레거시 마이그레이션
- context.ts RUNTIME_ROOT→BRANCH_ROOT 버그 수정
- 에이전트 프롬프트 영문 통일
- Team Path TodoWrite 지시 제거 (Lead idle 시 불필요)

### Removed
- state/ 세션 데이터 의존성 제거 (수동 정리 가능)

## 0.7.0 (2026-03-23)

### Features
- team TodoWrite 진행 표시 + statusline 사용량 캐시 개선

## 0.6.0 (2026-03-22)

### Features
- nx-sync 범용 재설계 + knowledge 정합성 수정

## 0.5.0 (2026-03-22)

### Features
- [sub] 경량 실행 스킬 + setup 보완 + sync 정합성 수정

## 0.4.0 (2026-03-22)

### Features
- Nexus v2 — setup/team 스킬 재정의 + statusline 래퍼
- Nexus v2 — Team-driven orchestration redesign
- Nexus v2 — Team-driven orchestration redesign
- plan tasks 갱신 리마인더 + stop 훅 debounce
- README 배지 + VERSION 유틸 추출 + statusline E2E 테스트 추가

### Fixes
- plan 스킬 범위 판단 2단계화 + Execute Bridge 제거

### Other
- merge: fix/plan-scope-and-gate → main
- merge: fix/plan-tracking-and-stop-debounce → main
- merge: docs/readme-update → main
- merge: test/plan-skill-validation → main

## 0.3.2 (2026-03-21)

### Fixes
- statusline 버전을 VERSION 파일 + __dirname 상대경로로 참조

## 0.3.1 (2026-03-21)

### Fixes
- statusline 버전 표시 CLAUDE_PLUGIN_ROOT fallback + 릴리즈 노트 개행 깨짐 수정

## 0.3.0 (2026-03-21)

### Features
- 스킬 디렉토리에 nx- 접두사 적용 — 플러그인 네임스페이스 충돌 방지
- 배포 자동화 스크립트 (release.mjs)
- context7 조건부 주입 + setup 추천 플러그인 정리
- statusline 버전 표시 + 사용량 남은시간 ↻ + 캐시 나이 ago 표기

### Refactoring
- dev-sync에서 불필요한 cache 동기화 제거
- plans 저장 경로를 세션 로컬로 이동
- 스킬 nx- 접두사 통일 + dev-sync 격리 + consult→plan 연결 강화

### Fixes
- 위임 강제를 모든 모드에서 동작하도록 변경 + 테스트 업데이트
- delegationEnforcement strict 전환 + pulse 미사용 함수 제거
- dev-sync에 cache 경로 동기화 추가
- nx-plan SKILL.md PERSIST 단계 강화 — MANDATORY + tasks.json 추가
- plans 경로를 세션 독립으로 이동 + PERSIST 강제
- statusline stale → ↻Xm 캐시 나이 표시 + 7d 남은 시간 d/h 단위로 축약
- plan 스킬 main 브랜치 자동 생성 — 사용자 선택 대신 자동 결정
- statusline line2 개선 — 프로그레스바 축소 + 리셋시간 정리 + stale 조건 완화

### Other
- revert: 스킬 nx- 접두사 제거 — 디렉토리명 원복

## 0.2.0 (2026-03-21)

### Features
- **Code Intelligence**: LSP 6도구 + AST search/replace
  - `nx_lsp_hover`, `nx_lsp_goto_definition`, `nx_lsp_find_references`
  - `nx_lsp_diagnostics`, `nx_lsp_document_symbols`, `nx_lsp_workspace_symbols`
  - `nx_ast_search`, `nx_ast_replace` (ast-grep, tree-sitter 기반 다언어)
  - TypeScript/Python/Rust/Go 자동 감지
- **Skills**: consult (대화형 탐색), plan (구조화된 계획), sync (지식문서 동기화)
- **Workflow Phase Tracking**: 훅 기반 자동 상태 전환 (LLM 의존 제거)
- **Agent Model Routing**: 티어별 모델 강제 (Haiku/Sonnet/Opus 선택 기능)
- **Enhanced Setup**: 대화형 설정 위저드, 위임 강제 수준 구성
- **Session Management**: 에이전트 추적, 세션 자동 정리, 오염 방지
- **Knowledge System**: YAML frontmatter 지원, sync 이름 변경, 에이전트별 컨텍스트 수준 분기
- **Pre-Execution Gate**: 명확한 의도 확인 및 강제 이스케이프

### Refactoring
- **Orchestration Redesign**: 모드 기반 워크플로우로 전환 (라우팅 제거)
- **Skill System Redesign**: auto/nonstop/pipeline/parallel 제거, LLM 자율 위임 모델로 전환
- **Configuration**: statusline-preset.json → config.json 통합
- **Testing**: E2E 테스트 3배 속도 향상, 격리 강화
- **Build System**: package-lock.json → bun.lock 전환

### Performance
- Stateless 워크플로우: 훅 기반 phase 추적으로 불필요한 상태 파일 I/O 제거
- 빌드+캐시동기화 최적화: dev-sync에 marketplace 동기화 추가

### Bug Fixes
- 빈 세션 요약 메모 생성 방지
- 상태라인 깜빡임 및 에이전트 추적 불일치 수정
- consult Clarify 단계에서 AskUserQuestion 강제 사용
- AST search: 프로젝트 node_modules fallback 추가

### Breaking Changes
- Removed: auto, nonstop, pipeline, parallel 워크플로우 (mode 기반 설계로 대체)
- Removed: memo 시스템 (진단 목적 제거)
- Renamed: lat_* → nx_* (모든 MCP 도구/상태 키)
- Renamed: sync-knowledge → sync (스킬 간소화)
- Changed: Configuration path consolidation (statusline-preset.json 제거)

## 0.1.0 (2026-03-19)

### Features
- **Core MCP**: nx_state_read/write/clear, nx_knowledge_read/write, nx_context
- **Agents**: Lead, Builder, Finder, Architect, Guard (Phase 1)
- **Workflow**: 기본 상태 추적 및 에이전트 위임
- **Hooks**: Gate (키워드 감지), Pulse (컨텍스트 주입), Tracker (에이전트/세션 추적)
- **Skill**: Default Mode
- E2E 21개 테스트
