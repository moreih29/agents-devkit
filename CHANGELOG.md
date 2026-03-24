# Changelog

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
