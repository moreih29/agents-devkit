# Plan: feature/code-intel

## 목표
Code Intelligence MVP — LSP + AST 도구를 기존 lat MCP 서버에 통합.

## 설계 결정

### 별도 패키지 vs 통합
통합 선택. 이유:
- 플러그인은 git clone으로 설치 → 별도 npm 패키지 관리 부담
- MCP 서버가 long-lived → LSP persistent connection 유지 가능
- 도구가 런타임에 deps 체크 → 없으면 graceful error

### LSP 클라이언트 설계
- 범용 LSP 프로토콜 클라이언트 (언어 무관)
- 언어 서버를 child_process.spawn으로 시작, stdio 통신
- 첫 호출 시 lazy initialization → 이후 재사용
- 프로젝트 언어 자동 감지 (tsconfig.json → TypeScript 등)

### AST 설계
- @ast-grep/napi 사용 (tree-sitter 기반, 다언어)
- 미설치 시 설치 안내 메시지 반환

## MVP 범위 (이번 브랜치)
- [x] LSP 클라이언트 (범용)
- [x] LSP 도구 4개: hover, goto_definition, find_references, diagnostics
- [x] AST 도구 1개: search
- [x] TypeScript 자동 감지
- [x] E2E 테스트 (AST: 자동, LSP: 수동 검증 필요)
- [x] 빌드 + 캐시 동기화

## 후속 (별도 브랜치)
- LSP 도구 추가: rename, code_actions, document_symbols, workspace_symbols
- AST replace
- 다언어 지원 (Python, Rust, Go)

## 개발 단위

### Unit 1: LSP 클라이언트
파일: `src/code-intel/lsp-client.ts`

```typescript
class LspClient {
  private process: ChildProcess | null;
  private initialized: boolean;
  private requestId: number;
  private pendingRequests: Map<number, { resolve, reject }>;

  constructor(command: string, args: string[])
  async initialize(rootUri: string): Promise<void>
  async request(method: string, params: object): Promise<any>
  async notify(method: string, params: object): void
  shutdown(): void
}
```

핵심:
- JSON-RPC over stdio (`Content-Length` 헤더 파싱)
- initialize → initialized 핸드셰이크
- textDocument/didOpen 자동 전송 (파일 접근 시)
- 에러 시 자동 재시작

### Unit 2: 언어 감지 + 서버 매핑
파일: `src/code-intel/detect.ts`

```typescript
function detectLanguage(projectRoot: string): 'typescript' | 'python' | 'rust' | 'go' | null
function getLspCommand(language: string): { command: string, args: string[] } | null
```

감지 순서: tsconfig.json → pyproject.toml/setup.py → Cargo.toml → go.mod

LSP 서버 매핑:
- typescript → `npx typescript-language-server --stdio`
- python → `pyright-langserver --stdio`
- rust → `rust-analyzer`
- go → `gopls serve`

### Unit 3: LSP MCP 도구
파일: `src/mcp/tools/lsp.ts`

```typescript
nx_lsp_hover({ file, line, character })
→ textDocument/hover → 타입 정보 반환

nx_lsp_goto_definition({ file, line, character })
→ textDocument/definition → 정의 위치 반환

nx_lsp_find_references({ file, line, character })
→ textDocument/references → 참조 목록 반환

nx_lsp_diagnostics({ file })
→ textDocument/publishDiagnostics → 에러/경고 목록
```

모든 도구가 LspClient 싱글톤을 공유. 첫 호출 시 lazy init.

### Unit 4: AST MCP 도구
파일: `src/mcp/tools/ast.ts`

```typescript
nx_ast_search({ pattern, language?, path? })
→ ast-grep 검색 → 매칭 목록 (파일, 라인, 코드)
```

@ast-grep/napi 미설치 시:
```json
{ "error": "ast-grep not installed. Run: npm install @ast-grep/napi" }
```

### Unit 5: 서버 통합 + 테스트
- `src/mcp/server.ts`에 registerLspTools, registerAstTools 추가
- E2E: Nexus 자체 TypeScript 소스로 테스트
  - hover: `getSessionId` → 타입 정보
  - definition: `statePath` → paths.ts 위치
  - references: `respond` → 사용처 목록
  - diagnostics: 현재 에러 확인
  - ast_search: `function.*handleStop` → 매칭

## 참조
- `.claude/nexus/knowledge/mcp-tools.md` — 도구 설계
- `.claude/nexus/knowledge/architecture.md` — 시스템 아키텍처
- LSP Specification: https://microsoft.github.io/language-server-protocol/
