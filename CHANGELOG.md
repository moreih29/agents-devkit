# Changelog

## 0.2.0 (2026-03-19)

### Features
- **Code Intelligence**: LSP 6도구 + AST search
  - `lat_lsp_hover`, `lat_lsp_goto_definition`, `lat_lsp_find_references`
  - `lat_lsp_diagnostics`, `lat_lsp_document_symbols`, `lat_lsp_workspace_symbols`
  - `lat_ast_search` (ast-grep, tree-sitter 기반 다언어)
  - TypeScript/Python/Rust/Go 자동 감지
- **Workflow**: Parallel, Pipeline, Auto 프리미티브
  - Auto = Pipeline + Nonstop 복합 워크플로우
  - `lat_state_clear({ key: "auto" })` 단일 해제
- **Agents**: 11개 (Phase 1~3)
  - Phase 2: Strategist, Reviewer, Analyst, Debugger
  - Phase 3: Tester, Writer
- **Pulse**: 에이전트별 컨텍스트 수준 분기 (minimal/standard/full)
- **Skills**: sync-knowledge (소스↔문서 불일치 탐지)

### Performance
- Pulse fast path: 워크플로우 비활성 시 상태 파일 I/O 생략

### Bug Fixes
- Parallel 0/0 무한 차단 수정 (totalCount=0 시 통과)
- Auto clear 시 불필요한 auto.json 탐색 제거
- AST search: 프로젝트 node_modules fallback 추가
- E2E 테스트 격리 (활성 세션 간섭 방지)

## 0.1.0 (2026-03-19)

### Features
- **Core MCP**: lat_state_read/write/clear, lat_knowledge_read/write, lat_memo_read/write, lat_context
- **Agents**: Lead, Builder, Finder, Architect, Guard (Phase 1)
- **Workflow**: Nonstop (Stop 차단, 지속 실행)
- **Hooks**: Gate (Stop/키워드 감지), Pulse (컨텍스트 주입), Tracker (에이전트/세션 추적)
- **Skill**: Nonstop
- E2E 21개 테스트
