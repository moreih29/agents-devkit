# OMO Tools 분석

## 도구 아키텍처

`@opencode-ai/plugin`의 `tool()` 빌더로 정의. description + Zod args + async execute.

### 빌트인 도구 (`src/tools/index.ts`)
```typescript
export const builtinTools = {
  lsp_goto_definition, lsp_find_references, lsp_symbols,
  lsp_diagnostics, lsp_prepare_rename, lsp_rename,
  ast_grep_search, ast_grep_replace, grep, glob,
  session_list, session_read, session_search, session_info,
}
// 동적 생성: backgroundTools, delegate_task, skill, skill_mcp, slashcommand, etc.
```

## LSP Tools (`src/tools/lsp/client.ts`, 596줄)

### LSPClient - JSON-RPC 구현
```typescript
class LSPClient {
  private proc: Subprocess<"pipe", "pipe", "pipe"> | null = null
  private buffer: Uint8Array = new Uint8Array(0)
  private pending = new Map<number, { resolve, reject }>()
  private diagnosticsStore = new Map<string, Diagnostic[]>()

  async start() {
    this.proc = spawn(this.server.command, { stdin: "pipe", stdout: "pipe", stderr: "pipe" })
  }
  async initialize() {
    await this.send("initialize", { capabilities: { textDocument: {...}, workspace: {...} } })
    this.notify("initialized")
  }
  // definition, references, documentSymbols, workspaceSymbols, diagnostics, prepareRename, rename
}
```

### LSPServerManager (Singleton)
- refCount 기반 클라이언트 관리, IDLE_TIMEOUT(5분) 후 자동 정리
- `warmupClient()`: 비동기 사전 초기화
- `cleanupTempDirectoryClients()`: /tmp/ 클라이언트 정리
- 프로세스 종료 시 모든 LSP 서버 shutdown

### Content-Length 파싱
CRLF/LF 모두 지원. `publishDiagnostics` notification은 diagnosticsStore에 저장.

## AST-Grep Tools (`src/tools/ast-grep/`)
`@ast-grep/napi` 네이티브 바인딩. `ast_grep_search`(검색) + `ast_grep_replace`(변환, dryRun 지원).

## Delegate Task (`src/tools/delegate-task/tools.ts`, 1039줄)

### 핵심 도구
```typescript
tool({
  args: {
    load_skills: array(string()),      // 스킬 주입 (필수)
    description: string(),              // 짧은 설명
    prompt: string(),                   // 상세 프롬프트
    run_in_background: boolean(),       // true=async, false=sync
    category: string().optional(),      // MUTUALLY EXCLUSIVE
    subagent_type: string().optional(), // with category
    session_id: string().optional(),    // resume용
  },
})
```

### 실행 흐름
1. session_id -> 기존 세션 resume
2. category -> resolveCategoryConfig() -> Sisyphus-Junior 스폰
3. subagent_type -> 특정 에이전트 직접 호출
4. 스킬 해결 -> system 콘텐츠로 주입

### Category Config Resolution
```typescript
function resolveCategoryConfig(categoryName, { userCategories, inheritedModel, systemDefault }) {
  // 모델 우선순위: user override > category default > system default
  return { config, promptAppend, model }
}
```

기본 카테고리: visual-engineering, ultrabrain, artistry, quick, unspecified-low/high, writing

### Unstable Agent 처리
Gemini 또는 `is_unstable_agent: true` -> 자동 background 모드 전환 + 폴링.

### Sync 모드 폴링
```typescript
POLL_INTERVAL_MS = 500, MAX_POLL_TIME_MS = 10분
MIN_STABILITY_TIME_MS = 10초, STABILITY_POLLS_REQUIRED = 3
// session status idle + 3회 메시지 수 안정 -> 완료
```

## Background Task Tools
`background_output`: 결과 조회, `background_cancel`: 취소 (개별/전체)

## Session Manager Tools
session_list, session_read, session_search, session_info

## Interactive Bash (`src/tools/interactive-bash/`)
Tmux 기반 인터랙티브 bash. 백그라운드에서 Tmux 가용성 체크.

## Call OMO Agent
delegate_task와 달리 카테고리 없이 에이전트 직접 호출.

## Look At
Multimodal Looker를 통해 PDF/이미지/다이어그램 분석.

## 우리 프로젝트에의 시사점
1. LSP Client: Bun spawn + JSON-RPC. refCount + idle timeout 리소스 관리
2. delegate_task: category/agent 이분법. session_id resume으로 70%+ 토큰 절약
3. Polling Pattern: MIN_STABILITY + STABILITY_POLLS로 false positive 방지
4. Unstable Agent: 자동 background 전환 안전장치
5. Tool Restrictions: `tools: { task: false }` 패턴으로 에이전트별 역할 제한
