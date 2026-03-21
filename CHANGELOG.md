# Changelog

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
