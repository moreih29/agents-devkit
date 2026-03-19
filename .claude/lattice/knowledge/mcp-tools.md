# Lattice MCP 도구 API

## Core 도구 (8개, 항상 활성)

### 상태 관리 (런타임, `.lattice/state/`)
```typescript
lat_state_read({ key: "sustain", sessionId: "..." })
lat_state_write({ key: "sustain", value: { active: true, ... }, sessionId: "..." })
lat_state_clear({ key: "sustain", sessionId: "..." })
```

### 프로젝트 지식 (git 추적, `.claude/lattice/knowledge/`)
```typescript
lat_knowledge_write({
  topic: "api-conventions",     // → knowledge/api-conventions.md
  content: "API는 /v2 네임스페이스, JWT 인증, JSON 응답",
  tags: ["api", "auth"]
})

lat_knowledge_read({
  topic: "api-conventions",     // 특정 주제
  // 또는
  tags: ["api"]                 // 태그 검색
})
```

### 세션 메모 (휘발성, `.lattice/memo/`)
```typescript
lat_memo_write({
  content: "현재 auth 모듈 리팩토링 중, 3/5 파일 완료",
  ttl: "session",               // session | day | week
  tags: ["progress"]
})

lat_memo_read({
  ttl: "session",               // TTL 필터 (선택)
  tags: ["progress"]            // 태그 필터 (선택)
})
```

### 컨텍스트 상태 통합 조회
```typescript
lat_context()
// → { activeMode, agents, contextUsageEstimate, sessionId, branch }
```

## 구분 기준

| 질문 | 도구 | 저장 위치 |
|------|------|-----------|
| "팀원도 알아야 하는가?" | `lat_knowledge_write` | `.claude/lattice/` (git) |
| "이 세션/며칠만 기억하면 되는가?" | `lat_memo_write` | `.lattice/` (gitignore) |
| "런타임 워크플로우 상태인가?" | `lat_state_write` | `.lattice/state/` (gitignore) |

## Code Intelligence (별도 패키지: claude-lattice-code-intel)

`npm install claude-lattice-code-intel`로 opt-in.

### LSP 도구
`lat_lsp_hover`, `lat_lsp_goto_definition`, `lat_lsp_find_references`, `lat_lsp_diagnostics`, `lat_lsp_rename`, `lat_lsp_code_actions`, `lat_lsp_document_symbols`, `lat_lsp_workspace_symbols`

### AST 도구
`lat_ast_search`, `lat_ast_replace`
