<!-- tags: mcp, tools, lsp, ast, knowledge, tasks, consult -->
<!-- tags: mcp, tools, lsp, ast, knowledge, tasks, consult -->
# MCP Tools

MCP 서버(`bridge/mcp-server.cjs`)가 제공하는 도구 목록. 소스: `src/mcp/tools/`.

## Core

| 도구 | 소스 | 저장 경로 | 용도 |
|------|------|-----------|------|
| `nx_knowledge_read` | knowledge.ts | `.claude/nexus/knowledge/{topic}.md` | knowledge 읽기 (topic 지정 또는 태그 검색) |
| `nx_knowledge_write` | knowledge.ts | `.claude/nexus/knowledge/{topic}.md` | knowledge 쓰기 (tags 옵션) |
| `nx_context` | context.ts | `.nexus/branches/{branch}/tasks.json`, `decisions.json` 참조 | 현재 브랜치, 팀 모드, 태스크 요약, 결정 사항 조회 |
| `nx_task_list` | task.ts | `.nexus/branches/{branch}/tasks.json` | 태스크 목록 + summary + ready 태스크 |
| `nx_task_add` | task.ts | `.nexus/branches/{branch}/tasks.json` | 태스크 추가 (caller=director만 허용) |
| `nx_task_update` | task.ts | `.nexus/branches/{branch}/tasks.json` | 태스크 상태 변경 (pending/in_progress/completed) |
| `nx_task_clear` | task.ts | `.nexus/branches/{branch}/tasks.json` | tasks.json 삭제 (nonstop 해제) |
| `nx_decision_add` | decision.ts | `.nexus/branches/{branch}/decisions.json` | 결정 기록 추가 |
| `nx_artifact_write` | artifact.ts | `.nexus/branches/{branch}/artifacts/{filename}` | 팀 산출물 저장 (report, synthesis 등) |
| `nx_consult_start` | consult.ts | `.nexus/branches/{branch}/consult.json` | 상담 세션 시작 (토픽 + 논점 목록 등록) |
| `nx_consult_status` | consult.ts | `.nexus/branches/{branch}/consult.json` | 현재 상담 상태 조회 (논점 목록/상태) |
| `nx_consult_decide` | consult.ts | `.nexus/branches/{branch}/consult.json` + `decisions.json` | 논점 결정 처리 (consult.json 갱신 + decisions.json 기록, 모두 decided 시 자동 삭제) |

## Code Intelligence

| 도구 | 소스 | 용도 |
|------|------|------|
| `nx_lsp_hover` | lsp.ts | 심볼 타입 정보 |
| `nx_lsp_goto_definition` | lsp.ts | 정의 위치 이동 |
| `nx_lsp_find_references` | lsp.ts | 참조 목록 |
| `nx_lsp_diagnostics` | lsp.ts | 컴파일러/린터 에러 |
| `nx_lsp_rename` | lsp.ts | 프로젝트 전체 심볼 리네임 |
| `nx_lsp_code_actions` | lsp.ts | 자동 수정/리팩토링 제안 |
| `nx_lsp_document_symbols` | lsp.ts | 파일 내 심볼 목록 |
| `nx_lsp_workspace_symbols` | lsp.ts | 프로젝트 전체 심볼 검색 |
| `nx_ast_search` | ast.ts | AST 패턴 검색 (tree-sitter via @ast-grep/napi) |
| `nx_ast_replace` | ast.ts | AST 패턴 치환 (dryRun 지원) |

## 특이사항

- `nx_task_add`는 `caller: "director"` 검증이 하드코딩됨. director 외 에이전트 호출 시 에러 반환.
- LSP: 프로젝트 언어 자동 감지 (tsconfig.json → TypeScript 등). 언어별 LSP 클라이언트 맵으로 관리.
- AST: `@ast-grep/napi`가 optional — 플러그인 캐시 또는 프로젝트 node_modules에서 동적 로드.
- knowledge_write의 topic 파라미터가 파일명이 됨 (`knowledge/{topic}.md`). 하위 디렉토리 생성은 지원하지 않음.
- MCP 도구는 `getBranchRoot()` 동적 함수로 경로를 해결. MCP 서버는 장기 프로세스이므로 정적 `BRANCH_ROOT` 대신 호출 시마다 현재 브랜치를 감지.
- `nx_consult_decide`는 consult.json + decisions.json을 동시 갱신. 모든 issues decided 시 consult.json 자동 삭제.