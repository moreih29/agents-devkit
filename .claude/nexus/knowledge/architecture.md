<!-- tags: architecture, structure, entry-points, data-paths -->
# Architecture

Claude Code 플러그인. 3개 런타임 진입점이 esbuild로 번들되어 동작한다.

## Entry Points

| 진입점 | 소스 | 빌드 산출물 | 역할 |
|--------|------|-------------|------|
| MCP Server | `src/mcp/server.ts` | `bridge/mcp-server.cjs` | 도구 제공 (knowledge, task, decision, LSP, AST) |
| Gate Hook | `src/hooks/gate.ts` | `scripts/gate.cjs` | 이벤트 처리 (Stop, PreToolUse, UserPromptSubmit) |
| Statusline | `src/statusline/statusline.ts` | `scripts/statusline.cjs` | 상태바 (모델, 브랜치, 사용량) |

## Directory Structure

```
src/
├── hooks/gate.ts          ← 유일한 훅 모듈 (3개 이벤트 통합 처리)
├── mcp/
│   ├── server.ts          ← McpServer 인스턴스 + 도구 등록
│   └── tools/             ← 도구별 모듈 (knowledge, context, task, decision, artifact, lsp, ast)
├── shared/
│   ├── paths.ts           ← PROJECT_ROOT, KNOWLEDGE_ROOT, BRANCH_ROOT 등 경로
│   ├── hook-io.ts         ← readStdin/respond/pass — 훅 I/O 프로토콜
│   └── version.ts         ← VERSION 파일 읽기
├── code-intel/            ← LSP 클라이언트, 언어 감지 (lsp.ts에서 import)
└── statusline/            ← 상태바 렌더링
```

## Plugin Manifest

- `.claude-plugin/plugin.json` — 메타데이터 (name, version, skills, mcpServers)
- `hooks/hooks.json` — 훅 등록 (PreToolUse:Agent, Stop:*, UserPromptSubmit:*)
- `.mcp.json` — MCP 서버 경로
- `agents/*.md` — 에이전트 정의 (7개)
- `skills/*/SKILL.md` — 스킬 정의 (5개)

## Data Paths

| 경로 | 추적 | 용도 |
|------|------|------|
| `.claude/nexus/knowledge/` | git | 장기 프로젝트 지식 |
| `.claude/nexus/config.json` | git | Nexus 설정 |
| `.nexus/branches/{branch}/` | gitignore | 런타임 상태 (tasks.json, decisions.json, artifacts/) |
| `.nexus/sync-state.json` | gitignore | 마지막 sync 커밋 |

## Key Design Decisions

- **Gate 단일 모듈**: Stop/PreToolUse/UserPromptSubmit을 하나의 gate.ts에서 처리. 이벤트 구분은 필드 존재 여부로 판별 (tool_name → PreToolUse, prompt → UserPromptSubmit, 없음 → Stop).
- **브랜치 격리**: 런타임 상태는 `.nexus/branches/{sanitized-branch}/` 하위에 격리. 레거시 `.nexus/{branch}/` 경로는 자동 마이그레이션.
- **esbuild CJS 번들**: 플러그인 런타임이 `node`로 실행되므로 CJS 포맷. `@ast-grep/napi`는 네이티브 모듈이라 external 처리.
