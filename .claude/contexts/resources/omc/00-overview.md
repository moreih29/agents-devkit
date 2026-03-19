# OMC (oh-my-claudecode) Architecture Overview

## 1. 프로젝트 개요

oh-my-claudecode(OMC)는 Claude Code를 위한 multi-agent orchestration 시스템이다. npm 패키지명은 `oh-my-claude-sisyphus`이며, v4.8.2 기준으로 분석한다.

**핵심 기능:**
- 19개 specialized agent를 통한 task delegation
- Magic keyword 기반 자동 모드 활성화 (ralph, autopilot, ultrawork 등)
- LSP/AST 기반 IDE-like 코드 분석 도구
- Hook 시스템을 통한 Claude Code lifecycle 개입
- Team orchestration (tmux 기반 multi-CLI worker)
- State management (.omc/ 디렉토리)
- HUD statusline 시스템
- Notification 시스템 (Slack, Telegram 등)

**저장소:** `https://github.com/Yeachan-Heo/oh-my-claudecode`

## 2. Claude Code Plugin 통합 방식

OMC는 Claude Code의 **plugin system**을 통해 통합된다. `.claude-plugin/plugin.json`이 진입점이다.

```json
{
  "name": "oh-my-claudecode",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json"
}
```

plugin.json은 세 가지를 선언한다:
1. **skills** - `skills/` 디렉토리의 slash command 정의들 (28개)
2. **mcpServers** - `.mcp.json`을 통한 MCP 서버 등록
3. **hooks** - `hooks/hooks.json`을 통한 lifecycle hook 등록 (11개 event type)

`$CLAUDE_PLUGIN_ROOT` 환경변수가 plugin cache 경로(`~/.claude/plugins/cache/omc/oh-my-claudecode/{version}/`)를 가리키며, 모든 hook script에서 이를 기준으로 파일을 참조한다.

## 3. 디렉토리 구조

```
oh-my-claudecode/
├── .claude-plugin/          # Plugin manifest
│   ├── plugin.json          # skills, mcpServers 선언
│   └── marketplace.json     # Marketplace 메타데이터
├── agents/                  # Agent prompt 정의 (19개 .md 파일)
│   ├── architect.md         # Opus, READ-ONLY (Write/Edit 차단)
│   ├── executor.md          # Sonnet, 코드 구현
│   ├── explore.md           # Haiku, 빠른 검색
│   └── ...
├── bridge/                  # esbuild 번들 출력 (CJS)
│   ├── mcp-server.cjs       # Standalone MCP 서버 번들
│   ├── team-bridge.cjs      # Team bridge 번들
│   ├── cli.cjs              # omc CLI 엔트리포인트
│   └── runtime-cli.cjs      # Runtime CLI
├── hooks/
│   └── hooks.json           # Hook 등록 정의
├── scripts/                 # Hook 스크립트 구현 (.mjs/.cjs)
│   ├── run.cjs              # Cross-platform hook runner
│   ├── keyword-detector.mjs # Magic keyword 감지 (UserPromptSubmit)
│   ├── skill-injector.mjs   # Learned skill 주입 (UserPromptSubmit)
│   ├── pre-tool-enforcer.mjs# 도구 실행 전 리마인더 (PreToolUse)
│   ├── post-tool-verifier.mjs# 도구 실행 후 검증 (PostToolUse)
│   ├── session-start.mjs    # 세션 시작 시 state 복원 (SessionStart)
│   ├── persistent-mode.cjs  # Stop 방지 - 모드 지속 (Stop)
│   └── subagent-tracker.mjs # Agent 추적 (SubagentStart/Stop)
├── skills/                  # Skill 정의 (28개 디렉토리)
│   ├── ralph/SKILL.md       # 반복 실행 루프
│   ├── autopilot/SKILL.md   # 전체 자율 실행
│   ├── team/SKILL.md        # Multi-agent 팀 조율
│   ├── ultrawork/SKILL.md   # 최대 병렬 실행
│   └── ...
├── src/                     # TypeScript 소스
│   ├── index.ts             # Main entry - createOmcSession()
│   ├── agents/              # Agent 정의, registry, prompt loading
│   ├── config/              # 설정 로더 (JSONC, env vars, model routing)
│   ├── features/            # Feature 모듈들
│   ├── hooks/               # Hook 구현 (TypeScript, 30+ 모듈)
│   ├── hud/                 # HUD statusline 시스템
│   ├── lib/                 # Core 라이브러리 (atomic-write, worktree 등)
│   ├── mcp/                 # MCP 서버 구현
│   ├── notifications/       # 알림 시스템
│   ├── planning/            # Planning artifact 관리
│   ├── team/                # Team orchestration (50+ 파일)
│   ├── tools/               # MCP tool 정의 (LSP, AST, state 등)
│   └── utils/               # 유틸리티
├── dist/                    # tsc 컴파일 출력
└── package.json
```

## 4. 핵심 아키텍처 패턴

### 4.1 Dual Entry Point 패턴

**A. Claude Agent SDK 통합 (프로그래매틱)**
```typescript
// src/index.ts
export function createOmcSession(options?: OmcOptions): OmcSession {
  const config = loadConfig();
  const agents = getAgentDefinitions({ config });
  // In-process MCP server: 서버명 "t" → mcp__t__도구명
  const omcToolsServer = createSdkMcpServer({ name: "t", tools: sdkTools });
  return {
    queryOptions: {
      options: { systemPrompt, agents, mcpServers, allowedTools, permissionMode }
    },
    processPrompt, detectKeywords, backgroundTasks, ...
  };
}
```

**B. Claude Code Plugin (실제 사용 방식)**
- hooks.json으로 lifecycle hook 등록
- .mcp.json으로 MCP 도구 서버 등록
- skills/로 slash command 등록

### 4.2 Hook-Driven Architecture

모든 행동 변경은 hook을 통해 이루어진다. Claude Code가 이벤트를 발생시키면, hook script가 stdin으로 JSON을 받아 처리하고 stdout으로 JSON 응답한다.

```
Claude Code Event → node run.cjs hook-script.mjs → stdout JSON
```

Hook 응답 형식 두 가지:
```json
// additionalContext 주입 (system-reminder로 표시됨)
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "message to inject"
  }
}

// Stop 방지 (persistent-mode에서 사용)
{
  "decision": "block",
  "reason": "[RALPH LOOP] Continue working..."
}
```

### 4.3 In-Process MCP Server

`src/mcp/omc-tools-server.ts`에서 Claude Agent SDK의 `createSdkMcpServer`를 사용하여 in-process MCP 서버를 생성한다. 서버 이름이 `"t"`이므로, 도구는 `mcp__t__lsp_hover` 형식으로 Claude Code에 노출된다.

도구 카테고리별로 태깅되어 `OMC_DISABLE_TOOLS` 환경변수로 카테고리 단위 비활성화가 가능하다:
- `lsp` - LSP 도구 12개
- `ast` - AST-grep 도구 2개
- `python` - Python REPL 1개
- `state` - 상태 관리 도구
- `notepad` - 노트패드 도구
- `memory` - 프로젝트 메모리 도구
- `trace` - Flow trace 도구
- `skills` - Skill 관련 도구
- `shared-memory` - 공유 메모리 도구

### 4.4 Agent-as-Markdown 패턴

각 agent는 `agents/{name}.md` 파일로 정의된다. YAML frontmatter에 model, disallowedTools를 선언하고, 본문이 system prompt가 된다.

```markdown
---
name: architect
model: claude-opus-4-6
disallowedTools: Write, Edit
---
<Agent_Prompt>
  <Role>You are Architect...</Role>
</Agent_Prompt>
```

`loadAgentPrompt()` (src/agents/utils.ts)가 빌드 시 `__AGENT_PROMPTS__`로 인라인되거나, 런타임에 파일시스템에서 읽는다. agent name에 대한 path traversal 방지 검증이 포함되어 있다.

## 5. 주요 의존성

| 패키지 | 용도 |
|--------|------|
| `@anthropic-ai/claude-agent-sdk` | Claude Agent SDK 통합, createSdkMcpServer |
| `@modelcontextprotocol/sdk` | MCP 프로토콜 구현 |
| `@ast-grep/napi` | AST 기반 코드 검색/변환 (native module) |
| `better-sqlite3` | Swarm 모드 task DB (native module) |
| `vscode-languageserver-protocol` | LSP 타입 정의 |
| `zod` | Tool parameter schema 정의 |
| `chalk` | 터미널 색상 출력 |
| `commander` | CLI argument 파싱 |
| `jsonc-parser` | JSONC 설정 파일 파싱 |
| `esbuild` (dev) | Bridge CJS 번들 빌드 |
| `vitest` (dev) | 테스트 프레임워크 |

## 6. 설정 계층 (Configuration Hierarchy)

설정은 네 단계로 병합된다 (낮은 우선순위 → 높은 우선순위):

```typescript
// src/config/loader.ts - loadConfig()
let config = buildDefaultConfig();         // 1. 하드코딩 기본값
config = deepMerge(config, userConfig);    // 2. ~/.config/claude-omc/config.jsonc
config = deepMerge(config, projectConfig); // 3. .claude/omc.jsonc
config = deepMerge(config, envConfig);     // 4. 환경변수 (최우선)
```

주요 환경변수:
- `OMC_MODEL_HIGH/MEDIUM/LOW` - tier별 모델 지정
- `OMC_ROUTING_FORCE_INHERIT` - 모든 agent가 부모 모델 상속
- `OMC_DISABLE_TOOLS` - 특정 tool 카테고리 비활성화
- `OMC_QUIET` - hook 메시지 상세도 조절 (0=전체, 1=기본도구 생략, 2=대부분 생략)
- `DISABLE_OMC` / `OMC_SKIP_HOOKS` - hook 비활성화
- `OMC_TEAM_WORKER` - team worker 내부에서 keyword detection 방지

## 7. Model Routing

Agent별로 3-tier 모델 라우팅:

| Tier | 기본 모델 | Agent 예시 |
|------|-----------|-----------|
| HIGH | opus | architect, planner, critic, analyst, code-reviewer, code-simplifier |
| MEDIUM | sonnet | executor, debugger, verifier, test-engineer, designer, qa-tester, tracer |
| LOW | haiku | explore, writer |

- `forceInherit: true` - 모든 agent가 부모 모델 상속 (non-Claude provider 감지 시 자동 활성화)
- `modelAliases` - tier명을 다른 값에 매핑 (예: `{ haiku: 'inherit' }`)
- `agents.{name}.model` - 개별 agent 모델 오버라이드

non-Claude provider 자동 감지: custom `ANTHROPIC_BASE_URL`, `CLAUDE_CODE_USE_BEDROCK=1`, `CLAUDE_CODE_USE_VERTEX=1` 환경변수가 설정되면 `forceInherit`가 자동으로 활성화된다.

## 8. 전체 데이터 흐름

```
사용자 프롬프트 입력
  ↓
[UserPromptSubmit Hook]
  → keyword-detector.mjs: "ralph" 감지 → state 파일 생성, skill 호출 지시 주입
  → skill-injector.mjs: learned skill 매칭 → context 주입
  ↓
Claude Code가 Skill tool 호출 (매직 키워드 감지 시)
  → skills/ralph/SKILL.md 내용 로드
  ↓
Claude Code가 도구 실행
  ↓
[PreToolUse Hook]
  → pre-tool-enforcer.mjs: todo 상태, agent 추적 정보, 모드별 리마인더 주입
  → context guard: agent-heavy 도구 실행 시 context 사용량 체크 → 초과 시 block
  → skill active state 기록 (Skill tool 호출 시)
  ↓
도구 실행 완료
  ↓
[PostToolUse Hook]
  → post-tool-verifier.mjs: 실패 감지, <remember> 태그 → notepad 기록, bash history 기록
  ↓
Claude Code가 중단 시도
  ↓
[Stop Hook]
  → persistent-mode.cjs: 활성 모드 확인 (우선순위: ralph > autopilot > team > ultrawork)
    → 활성이면 decision: "block" → iteration 증가 → Claude Code 계속 실행
    → context limit stop / user abort이면 즉시 허용
    → cancel signal 감지되면 즉시 허용
  → code-simplifier.mjs: 코드 품질 체크
  ↓
세션 종료
  ↓
[SessionEnd Hook]
  → session-end.mjs: cleanup 수행
```

## 9. 빌드 파이프라인

```bash
npm run build
  → tsc                              # TypeScript → dist/ (ESM)
  → build-skill-bridge.mjs           # Skill bridge CJS 번들
  → build-mcp-server.mjs             # bridge/mcp-server.cjs (standalone MCP)
  → build-bridge-entry.mjs           # bridge/team-bridge.cjs
  → compose-docs                     # 문서 합성
  → build:runtime-cli                # bridge/runtime-cli.cjs
  → build:team-server                # bridge/team-mcp.cjs
  → build:cli                        # bridge/cli.cjs (omc CLI)
```

esbuild 설정 (scripts/build-mcp-server.mjs):
- `platform: 'node'`, `target: 'node18'`, `format: 'cjs'`
- `external: ['@ast-grep/napi', 'better-sqlite3']` (native modules)
- banner에 `npm root -g` 기반 NODE_PATH 설정 삽입
- `mainFields: ['module', 'main']` (ESM 우선)

agent prompt는 빌드 시 `__AGENT_PROMPTS__` define으로 인라인되어, 런타임 파일 읽기 없이 번들에 포함된다.
