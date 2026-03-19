# OMC MCP Tools

## 1. MCP 서버 아키텍처

OMC는 두 가지 MCP 서버 방식을 사용한다:

### 1.1 In-Process MCP Server (주요)

`src/mcp/omc-tools-server.ts`에서 Claude Agent SDK의 `createSdkMcpServer`를 사용:

```typescript
import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";

const sdkTools = enabledTools.map(t =>
  tool(t.name, t.description, t.schema, async (args) => await t.handler(args))
);

export const omcToolsServer = createSdkMcpServer({
  name: "t",        // 서버 이름 → mcp__t__도구명
  version: "1.0.0",
  tools: sdkTools
});
```

서버 이름이 `"t"`이므로 모든 도구는 `mcp__t__{tool_name}` 형식으로 노출된다.

### 1.2 Standalone MCP Server (bridge/mcp-server.cjs)

Plugin 배포용 standalone 번들. `src/mcp/standalone-server.ts`를 esbuild로 CJS 번들링:

```javascript
// bridge/mcp-server.cjs 상단 banner
try {
  var _globalRoot = _cp.execSync('npm root -g', { encoding: 'utf8' }).trim();
  process.env.NODE_PATH = _globalRoot + (process.env.NODE_PATH ? _sep + process.env.NODE_PATH : '');
  _Module._initPaths();  // NODE_PATH 재로드
} catch (_e) {}
```

Native module (@ast-grep/napi, better-sqlite3)은 external로 처리되어 global npm에서 resolve된다.

## 2. Tool 카테고리 시스템

도구를 카테고리별로 태깅하여 `OMC_DISABLE_TOOLS` 환경변수로 카테고리 단위 비활성화가 가능하다:

```typescript
// src/constants/index.ts
export const TOOL_CATEGORIES = {
  LSP: 'lsp', AST: 'ast', PYTHON: 'python',
  STATE: 'state', NOTEPAD: 'notepad', MEMORY: 'memory',
  TRACE: 'trace', SKILLS: 'skills', INTEROP: 'interop',
  SHARED_MEMORY: 'shared-memory', CODEX: 'codex', GEMINI: 'gemini',
};

// 사용: OMC_DISABLE_TOOLS=lsp,python-repl,project-memory
```

## 3. LSP Tools (12개)

`src/tools/lsp-tools.ts` - 실제 Language Server Protocol 클라이언트를 사용:

### lsp_hover
```typescript
schema: {
  file: z.string(),
  line: z.number().int().min(1),      // 1-indexed
  character: z.number().int().min(0),  // 0-indexed
}
```
파일의 특정 위치에서 타입 정보, 문서, 시그니처를 반환한다.

### lsp_goto_definition
심볼의 정의 위치로 이동. file, line, character 입력.

### lsp_find_references
심볼의 모든 참조 위치를 찾는다.

### lsp_document_symbols
파일 내의 함수/클래스/변수 outline을 반환한다.

### lsp_workspace_symbols
워크스페이스 전체에서 이름으로 심볼을 검색한다.

### lsp_diagnostics
단일 파일에 대한 타입 에러 검사 (tsc --noEmit 상당).

### lsp_diagnostics_directory
프로젝트 전체 타입 체크. `src/tools/diagnostics/index.ts` 참조.

### lsp_rename
심볼 이름 변경 (LSP rename protocol 사용).

### lsp_prepare_rename
rename 가능 여부와 범위를 사전 확인.

### lsp_code_actions
파일 위치에서 가능한 code action (quick fix 등) 목록.

### lsp_code_action_resolve
특정 code action을 실행하여 workspace edit을 반환.

### lsp_servers
사용 가능한 language server 목록을 반환.

### LSP Client Manager

`src/tools/lsp/index.ts`의 `lspClientManager`가 language server 라이프사이클을 관리:
- 파일 타입별 서버 매핑
- idle eviction (미사용 서버 정리)
- `runWithClientLease()` - 작업 중 서버가 evict되지 않도록 보호

```typescript
async function withLspClient<T>(filePath, operation, fn) {
  const serverConfig = getServerForFile(filePath);
  if (!serverConfig) return { isError: true, content: [{ text: 'No language server available...' }] };
  return lspClientManager.runWithClientLease(filePath, async (client) => fn(client));
}
```

## 4. AST Tools (2개)

`src/tools/ast-tools.ts` - `@ast-grep/napi`를 사용한 구조적 코드 검색/변환:

### ast_grep_search
```typescript
schema: {
  pattern: z.string(),      // AST 패턴 ($VAR, $$$ 메타변수)
  language: z.string(),     // javascript, typescript, python, go, rust 등 17개
  path: z.string().optional(), // 검색 경로 (기본: cwd)
}
```

지원 언어: JavaScript, TypeScript, TSX, Python, Ruby, Go, Rust, Java, Kotlin, Swift, C, C++, C#, HTML, CSS, JSON, YAML

### ast_grep_replace
```typescript
schema: {
  pattern: z.string(),
  replacement: z.string(),
  language: z.string(),
  path: z.string().optional(),
  dryRun: z.boolean().default(true),  // 기본: dry run
}
```

**dryRun이 기본 true** - 실제 변경 전에 미리보기를 강제한다.

### Native Module 로딩

`@ast-grep/napi`는 native module이므로 이중 로딩 전략:
```typescript
async function getSgModule() {
  // 1차: createRequire()로 CJS 스타일 resolve (NODE_PATH 존중)
  const require = createRequire(import.meta.url);
  sgModule = require("@ast-grep/napi");
  // 2차 fallback: dynamic import (ESM 환경)
  sgModule = await import("@ast-grep/napi");
}
```

## 5. State Tools

`src/tools/state-tools.ts` - 모드 상태 관리:

### state_read
모드 상태 파일을 읽는다.

### state_write
모드 상태 파일을 쓴다. 세션 격리 경로 지원.

### state_clear
모드 상태를 삭제한다. cancel signal 생성 (30초 TTL):
```json
{ "expires_at": "...", "reason": "cancel", "mode": "ralph" }
```
persistent-mode Stop hook이 이 신호를 감지하면 block을 중단한다.

### state_list_active
현재 활성 모드 목록을 반환한다.

### state_get_status
특정 모드의 상세 상태를 반환한다.

지원 모드: `autopilot`, `team`, `ralph`, `ultrawork`, `ultraqa`, `ralplan`, `omc-teams`, `deep-interview`

## 6. Notepad Tools

`src/tools/notepad-tools.ts` - 세션 지속 노트:

### notepad_read
노트패드 내용 읽기. 섹션 지정 가능: `all`, `priority`, `working`, `manual`

### notepad_write_priority
Priority Context 섹션에 쓰기. 세션 시작 시 자동으로 context에 주입된다.

### notepad_write_working
Working Memory 섹션에 항목 추가. 7일 후 자동 expire.

### notepad_write_manual
MANUAL 섹션에 영구 항목 추가.

### notepad_prune
오래된 Working Memory 항목을 정리한다.

### notepad_stats
노트패드 통계 (항목 수, 크기 등).

노트패드 파일 경로: `.omc/notepad.md`

## 7. Memory Tools

`src/tools/memory-tools.ts` - 프로젝트 메모리:

### project_memory_read
프로젝트 메모리 읽기. 섹션: `all`, `techStack`, `build`, `conventions`, `structure`, `notes`, `directives`

### project_memory_write
프로젝트 메모리 전체 쓰기 (merge 지원).

### project_memory_add_note
사용자 정의 노트 추가.

### project_memory_add_directive
사용자 지시사항 추가.

메모리 파일 경로: `.omc/project-memory.json`

## 8. Trace Tools

`src/tools/trace-tools.ts` - Agent flow 추적:

### trace_timeline
시간순 agent turn, mode event, tool 호출 timeline을 반환한다.

### trace_summary
집계 통계: turn 수, 타이밍, token 사용량.

### session_search
세션 히스토리에서 검색 (별도의 `src/tools/session-history-tools.ts`).

데이터 소스: `.omc/state/agent-replay-{sessionId}.jsonl`

## 9. Python REPL Tool

`src/tools/python-repl/index.ts` - Python 코드 실행:

### python_repl
Python 코드를 실행하고 결과를 반환한다.

## 10. Skills Tools

`src/tools/skills-tools.ts` - Skill 관련 도구.

## 11. Shared Memory Tools

`src/tools/shared-memory-tools.ts` - Team worker 간 공유 메모리.

## 12. External MCP Servers

`src/mcp/servers.ts`에서 외부 MCP 서버 설정을 정의:

```typescript
export function getDefaultMcpServers(options?) {
  // Exa: AI 웹 검색 (npx exa-mcp-server)
  // Context7: 공식 문서 조회 (npx @upstash/context7-mcp)
  // Playwright: 브라우저 자동화 (npx @playwright/mcp@latest)
  // Memory: 영구 지식 그래프 (npx @modelcontextprotocol/server-memory)
}
```

기본 활성화: Exa, Context7
옵션 활성화: Playwright, Memory

## 13. Tool Schema 패턴

모든 도구는 Zod schema를 사용하여 입력을 정의한다:

```typescript
// src/tools/types.ts
export interface ToolDefinition<T extends z.ZodRawShape> {
  name: string;
  description: string;
  schema: T;
  handler: (args: z.infer<z.ZodObject<T>>) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;
}
```

SDK의 `tool()` 헬퍼에 전달할 때 ZodRawShape을 직접 전달한다 (z.object()로 감싸지 않음).

## 14. OMC_DISABLE_TOOLS 환경변수

카테고리 이름 → ToolCategory 매핑:

```typescript
export const DISABLE_TOOLS_GROUP_MAP = {
  'lsp': 'lsp',
  'ast': 'ast',
  'python': 'python', 'python-repl': 'python',
  'trace': 'trace',
  'state': 'state',
  'notepad': 'notepad',
  'memory': 'memory', 'project-memory': 'memory',
  'skills': 'skills',
  'interop': 'interop',
  'shared-memory': 'shared-memory',
};
```

사용 예: `OMC_DISABLE_TOOLS=lsp,python-repl` → LSP 도구 12개 + Python REPL 비활성화
