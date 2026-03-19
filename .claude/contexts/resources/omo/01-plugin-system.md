# OMO Plugin System 분석

## 진입점: `src/index.ts` (601줄)

### Plugin 초기화 흐름

```typescript
const OhMyOpenCodePlugin: Plugin = async (ctx) => {
  // 1. Tmux 백그라운드 체크
  startTmuxCheck();
  // 2. 설정 로드 (user + project JSONC)
  const pluginConfig = loadPluginConfig(ctx.directory, ctx);
  // 3. 30+ 훅 조건부 초기화 (isHookEnabled 체크)
  // 4. BackgroundManager, TmuxSessionManager 생성
  // 5. 도구 생성 (delegate_task, skill, background 등)
  // 6. 스킬 발견 및 병합 (4개 소스 병렬 로드)
  // 7. 핸들러 반환
  return { tool, "chat.message", event, config, ... };
};
```

### 핵심 반환 구조

#### `tool` - 도구 등록
```typescript
tool: {
  ...builtinTools,           // lsp_*, ast_grep_*, grep, glob, session_*
  ...backgroundTools,        // background_output, background_cancel
  call_omo_agent,            // 에이전트 직접 호출
  look_at,                   // multimodal 파일 분석 (Gemini)
  delegate_task,             // 카테고리/에이전트 기반 delegation
  skill, skill_mcp,          // 스킬 로드/실행
  slashcommand,              // 슬래시 명령어
  interactive_bash,          // Tmux 기반 인터랙티브 bash
}
```

#### `event` - 이벤트 핸들러
핵심 이벤트 처리 체인 (순서대로 모든 훅에 전파):
- `session.created`: 메인 세션 설정, Tmux pane 생성
- `session.deleted`: 상태 정리, MCP 연결 해제, LSP 클린업
- `session.error`: 복구 가능 에러 시 자동 "continue" 프롬프트 주입
- `session.idle`: Atlas boulder state 체크, 작업 계속 진행
- `message.updated`: 세션 에이전트 추적

#### `tool.execute.before` - 실행 전 인터셉트
- Claude Code 훅, non-interactive env, comment checker
- Directory agents/readme injection, rules injection
- Atlas 오케스트레이터 가드
- task 도구에 delegate_task/call_omo_agent 차단
- Ralph loop 슬래시 명령어 처리

#### `tool.execute.after` - 실행 후 변환
- Tool output truncation, context window monitor
- Empty task response 감지, edit error recovery
- Atlas 검증 reminder, task resume info 주입

#### `chat.message` - 메시지 핸들러
- 세션 에이전트 추적, agent variant 적용 (첫 메시지에만)
- 키워드 감지, Claude Code 훅, 자동 슬래시 명령어
- Ralph Loop 템플릿 감지 및 시작/취소

## Plugin Config Handler

`createConfigHandler()`가 OpenCode에 에이전트, MCP, 명령어를 등록:
```typescript
config: {
  agent: {
    sisyphus: createSisyphusAgent(model, agents, tools, skills, categories),
    atlas: createAtlasAgent({ model, availableAgents, availableSkills }),
    oracle: createOracleAgent(oracleModel),
    // ... 모든 에이전트 + Claude Code 호환 에이전트
  },
  mcp: {
    ...createBuiltinMcps(disabledMcps),  // websearch, context7, grep_app
    ...claudeCodeMcps,                    // .mcp.json 호환
    ...skillMcps,                          // 스킬 내장 MCP
  },
  command: { ...builtinCommands, ...claudeCodeCommands },
}
```

## 설정 로드: `src/plugin-config.ts`

### JSONC 파싱 + Zod 검증
```typescript
function loadConfigFromPath(configPath, ctx): OhMyOpenCodeConfig | null {
  const rawConfig = parseJsonc(fs.readFileSync(configPath, "utf-8"));
  migrateConfigFile(configPath, rawConfig);  // 이전 포맷 마이그레이션
  const result = OhMyOpenCodeConfigSchema.safeParse(rawConfig);
  if (!result.success) { addConfigLoadError(...); return null; }
  return result.data;
}
```

### 다중 레벨 병합
```typescript
function loadPluginConfig(directory, ctx): OhMyOpenCodeConfig {
  let config = loadConfigFromPath(userConfigPath, ctx) ?? {};
  const projectConfig = loadConfigFromPath(projectConfigPath, ctx);
  if (projectConfig) config = mergeConfigs(config, projectConfig);
  return config;
}

function mergeConfigs(base, override) {
  // agents, categories: deepMerge
  // disabled_*: Set union
  // claude_code: deepMerge
}
```

## Claude Code 호환 레이어

### MCP Loader (`src/features/claude-code-mcp-loader/`)
- `.mcp.json` -> OpenCode MCP 설정 변환
- 환경변수 확장: `${API_KEY}` -> `process.env.API_KEY`
- 범위: 프로젝트(`.mcp.json`) + 사용자(`~/.claude/.mcp.json`)

### Session State (`src/features/claude-code-session-state/`)
```typescript
export const subagentSessions = new Set<string>();
let mainSessionID: string | undefined;
export function setMainSession(id): void
export function getMainSessionID(): string | undefined
export function setSessionAgent(sessionId, agent): void
export function getSessionAgent(sessionId): string | undefined
```

## 스킬 발견 및 병합

4가지 소스에서 병렬 발견:
- `~/.claude/commands/` (User Claude Skills)
- `~/.config/opencode/skills/` (Global OpenCode Skills)
- `.claude/commands/` (Project Claude Skills)
- `.opencode/skills/` (Project OpenCode Skills)

빌트인 스킬은 시스템 MCP 충돌 방지 필터링:
```typescript
builtinSkills.filter(skill => {
  if (skill.mcpConfig) {
    for (const mcpName of Object.keys(skill.mcpConfig))
      if (systemMcpNames.has(mcpName)) return false;
  }
  return true;
});
```

## 우리 프로젝트에의 시사점

1. **Plugin 구조**: async factory -> 핸들러 반환 패턴이 효과적
2. **Hook 체인**: before/after 패턴으로 도구 실행 인터셉트
3. **Config 병합**: User -> Project multi-level + JSONC + Zod
4. **Claude Code 호환**: .mcp.json, .claude/ 어댑터 레이어
5. **Conditional Hooks**: `isHookEnabled()` + optional chaining
6. **세션 상태 관리**: mainSession, subagentSessions 추적
