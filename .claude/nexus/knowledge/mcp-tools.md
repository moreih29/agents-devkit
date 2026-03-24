# Nexus MCP 도구 API

## Core 도구 (항상 활성)

### 프로젝트 지식 (git 추적, `.claude/nexus/knowledge/`)
```typescript
nx_knowledge_write({
  topic: "api-conventions",     // → knowledge/api-conventions.md
  content: "API는 /v2 네임스페이스, JWT 인증, JSON 응답",
  tags: ["api", "auth"]
})

nx_knowledge_read({
  topic: "api-conventions",     // 특정 주제
  // 또는
  tags: ["api"]                 // 태그 검색
})
```

### 컨텍스트 상태 통합 조회
```typescript
nx_context()
// → { sessionId, branch, pendingTasks, recentDecisions }
```

### 태스크 관리 (`.nexus/branches/{branch}/tasks.json`)
```typescript
nx_task_list({ status?: "pending" | "completed" })
nx_task_add({ title: "인증 모듈 구현", description?: "...", tags?: ["auth"] })
nx_task_update({ id: "eaba793e", status?: "completed" | "cancelled", title?, description?, tags? })
```

### 결정 관리 (`.nexus/branches/{branch}/decisions.json`)
```typescript
nx_decision_add({
  title: "JWT 대신 세션 쿠키 사용",
  rationale: "SSR 환경에서 쿠키가 더 자연스럽다",
  tags: ["auth", "security"]
})
```

## 구분 기준

| 질문 | 도구 | 저장 위치 |
|------|------|-----------|
| "팀원도 알아야 하는가?" | `nx_knowledge_write` | `.claude/nexus/` (git) |
| "현재 작업 태스크인가?" | `nx_task_add/update/clear` | `.nexus/branches/{branch}/tasks.json` |
| "아키텍처 결정인가?" | `nx_decision_add` | `.nexus/branches/{branch}/decisions.json` |

## Code Intelligence (nx 서버 통합)

### LSP 도구
`nx_lsp_hover`, `nx_lsp_goto_definition`, `nx_lsp_find_references`, `nx_lsp_diagnostics`, `nx_lsp_rename`, `nx_lsp_code_actions`, `nx_lsp_document_symbols`, `nx_lsp_workspace_symbols`

### AST 도구
`nx_ast_search`, `nx_ast_replace`
