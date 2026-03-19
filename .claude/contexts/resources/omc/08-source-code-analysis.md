# OMC Source Code Deep Dive

## 1. src/index.ts - Main Entry Point

`createOmcSession()`이 핵심 API. Claude Agent SDK와 통합하기 위한 모든 설정을 준비한다:

```typescript
export function createOmcSession(options?: OmcOptions): OmcSession {
  // 1. 설정 로드
  const config = loadConfig();  // user + project + env 병합

  // 2. Context 파일 로드 (AGENTS.md, CLAUDE.md)
  const contextFiles = findContextFiles(workingDirectory);
  const contextAddition = loadContextFromFiles(contextFiles);

  // 3. System prompt 조립
  let systemPrompt = omcSystemPrompt;
  systemPrompt += continuationSystemPromptAddition;  // continuation enforcement
  systemPrompt += contextAddition;

  // 4. Agent registry 생성
  const agents = getAgentDefinitions({ config });

  // 5. MCP 서버 설정
  const externalMcpServers = getDefaultMcpServers({ enableExa, enableContext7 });
  // In-process MCP server (서버명 "t")
  const omcTools = getOmcToolNames({ includeLsp, includeAst, includePython });

  // 6. 허용 도구 목록
  const allowedTools = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'Task', 'TodoWrite',
    'Bash', 'Edit', 'Write', ...mcpToolNames, ...omcTools];

  // 7. Magic keyword processor
  const processPrompt = createMagicKeywordProcessor(config.magicKeywords);

  // 8. Background task manager
  const backgroundTaskManager = createBackgroundTaskManager(state, config);

  return { queryOptions, state, config, processPrompt, detectKeywords, backgroundTasks };
}
```

### OmcSession 인터페이스

```typescript
export interface OmcSession {
  queryOptions: {
    options: {
      systemPrompt: string;
      agents: Record<string, AgentDef>;
      mcpServers: Record<string, McpServerConfig>;
      allowedTools: string[];
      permissionMode: string;  // 'acceptEdits'
    };
  };
  state: SessionState;
  config: PluginConfig;
  processPrompt: (prompt: string) => string;
  detectKeywords: (prompt: string) => string[];
  backgroundTasks: BackgroundTaskManager;
  shouldRunInBackground: (command: string) => TaskExecutionDecision;
}
```

## 2. src/config/ - Configuration System

### config/loader.ts

설정 로딩의 핵심. 네 계층 병합:

```typescript
export function loadConfig(): PluginConfig {
  let config = buildDefaultConfig();              // 하드코딩 기본값
  const userConfig = loadJsoncFile(paths.user);   // ~/.config/claude-omc/config.jsonc
  const projectConfig = loadJsoncFile(paths.project); // .claude/omc.jsonc
  const envConfig = loadEnvConfig();              // 환경변수

  config = deepMerge(config, userConfig);
  config = deepMerge(config, projectConfig);
  config = deepMerge(config, envConfig);

  // non-Claude provider 감지 시 forceInherit 자동 활성화
  if (isNonClaudeProvider()) config.routing.forceInherit = true;

  return config;
}
```

### config/models.ts

3-tier 모델 매핑:

```typescript
export function getDefaultTierModels(): { LOW: string; MEDIUM: string; HIGH: string } {
  return {
    HIGH: process.env.OMC_MODEL_HIGH || 'opus',
    MEDIUM: process.env.OMC_MODEL_MEDIUM || 'sonnet',
    LOW: process.env.OMC_MODEL_LOW || 'haiku',
  };
}

export function isNonClaudeProvider(): boolean {
  // ANTHROPIC_BASE_URL, CLAUDE_CODE_USE_BEDROCK, CLAUDE_CODE_USE_VERTEX 체크
}
```

### config/plan-output.ts

계획 산출물 경로 설정.

### compactOmcStartupGuidance()

SessionStart 시 AGENTS.md/CLAUDE.md에서 OMC guidance 섹션을 자동 compact:
- `<agent_catalog>`, `<skills>`, `<team_compositions>` 섹션을 제거
- 이미 context에 있는 정보의 중복 주입을 방지

## 3. src/features/ - Feature Modules

### features/magic-keywords.ts

SDK 통합용 magic keyword 처리. 4개 built-in 키워드:
- `ultrawork` - 병렬 실행 모드 (가장 큰 프롬프트 주입)
- `search` - 검색 최대화 (다국어 패턴 지원: 한/일/중/베트남어)
- `analyze` - 분석 모드 (다국어)
- `ultrathink` - 확장 추론

```typescript
export function createMagicKeywordProcessor(config?): (prompt: string) => string;
export function detectMagicKeywords(prompt: string, config?): string[];
```

**Ultrawork 메시지의 Planner 분기:**
`isPlannerAgent()` 체크 후, planner agent에게는 "구현하지 말고 계획만 하라"는 별도 지시를 주입한다.

### features/background-tasks.ts

Background task 관리:
```typescript
export function createBackgroundTaskManager(state, config): BackgroundTaskManager;
export function shouldRunInBackground(command, runningCount, maxTasks): TaskExecutionDecision;
export const LONG_RUNNING_PATTERNS = [/* npm install, build, test 등 */];
```

### features/continuation-enforcement.ts

System prompt에 추가되는 continuation 강제 메시지.

### features/boulder-state/

"Boulder state" (Sisyphus 테마) 관리:
- `.omc/` 디렉토리 경로 상수
- Boulder state 읽기/쓰기
- Plan progress 추적

```typescript
export const BOULDER_DIR = '.omc';
export const BOULDER_FILE = 'boulder-state.json';
export function readBoulderState(directory): BoulderState | null;
export function writeBoulderState(directory, state): void;
```

### features/context-injector/

Context 수집 및 주입 시스템:
```typescript
export class ContextCollector {
  register(source, content, options): void;
  collect(): ContextEntry[];
}
export function injectPendingContext(text, collector): InjectionResult;
```

### features/state-manager/

상태 관리 유틸리티.

### features/model-routing/

모델 라우팅 로직.

### features/delegation-routing/

외부 모델 provider (Codex, Gemini)로의 delegation routing:

```typescript
export interface DelegationRoutingConfig {
  enabled?: boolean;
  defaultProvider?: 'claude' | 'codex' | 'gemini';
  roles?: Record<string, DelegationRoute>;
}
```

### features/auto-update.ts

자동 업데이트 체크:
```typescript
export function checkForUpdates(currentVersion): Promise<UpdateCheckResult>;
export function performUpdate(version): Promise<UpdateResult>;
export function compareVersions(a, b): number;
```

### features/session-history-search/

세션 히스토리 검색 기능.

## 4. src/hooks/ - Hook Implementation (TypeScript)

`scripts/` 디렉토리의 hook이 런타임 실행 스크립트라면, `src/hooks/`는 TypeScript로 구현된 hook 로직이다. 빌드 후 `dist/hooks/`로 출력되어 스크립트에서 import된다.

### 주요 하위 모듈 (30+개)

| 모듈 | 역할 |
|------|------|
| `mode-registry/` | 실행 모드 등록 및 관리 (5개 모드) |
| `notepad/` | Notepad 읽기/쓰기 구현 |
| `project-memory/` | Project memory 관리 |
| `subagent-tracker/` | Agent 추적, flow trace, session replay |
| `persistent-mode/` | Stop hook 로직 (TypeScript 버전) |
| `keyword-detector/` | 키워드 감지 (TypeScript 버전) |
| `autopilot/` | Autopilot 모드 관련 |
| `ralph/` | Ralph 루프 관련 |
| `ultrawork/` | Ultrawork 모드 관련 |
| `ultraqa/` | UltraQA 모드 관련 |
| `team-pipeline/` | Team pipeline 관련 |
| `learner/` | Skill 학습 |
| `factcheck/` | 팩트 체크 |
| `code-simplifier/` | 코드 단순화 |
| `think-mode/` | Think mode 처리 |
| `pre-compact/` | Compact 전처리 |
| `recovery/` | 에러 복구 |
| `codebase-map.ts` | 코드베이스 맵 생성 |
| `agents-overlay.ts` | Agent overlay 생성 |
| `skill-state/` | Skill 활성 상태 관리 |
| `todo-continuation/` | Todo 기반 continuation |

### mode-registry/

```typescript
export type ExecutionMode = 'autopilot' | 'team' | 'ralph' | 'ultrawork' | 'ultraqa';
export const MODE_CONFIGS: Record<ExecutionMode, ModeConfig>;
export function isModeActive(mode, directory, sessionId): boolean;
export function getActiveModes(directory, sessionId): ExecutionMode[];
export function clearModeState(mode, directory, sessionId): void;
```

## 5. src/hud/ - HUD Statusline

Claude Code의 statusline에 OMC 상태를 표시하는 시스템.

### 핵심 흐름
```
Claude Code → stdin JSON → HUD main()
  → parseTranscript() - 대화 기록 분석
  → readHudState() - HUD 상태 읽기
  → readRalphStateForHud() - Ralph 상태
  → readUltraworkStateForHud() - Ultrawork 상태
  → getUsage() - API 사용량
  → render(context) - 렌더링
  → stdout → Claude Code statusline
```

### 구성 요소
- `index.ts` - Main entry point
- `render.ts` - Statusline 렌더링
- `state.ts` - HUD 상태 관리
- `omc-state.ts` - OMC 모드 상태 읽기
- `transcript.ts` - 대화 기록 파싱
- `usage-api.ts` - API 사용량 조회
- `colors.ts` - 색상 정의
- `elements/` - 개별 UI 요소 (api-key-source 등)
- `mission-board.ts` - Mission board 표시
- `custom-rate-provider.ts` - 커스텀 요금 제공자

## 6. src/notifications/ - Notification System

외부 서비스로 알림을 전송하는 시스템.

### 구성 요소
- `index.ts` - `notify()` 함수 export
- `dispatcher.ts` - 알림 디스패처
- `config.ts` - 알림 설정 로드
- `types.ts` - 타입 정의
- `formatter.ts` - 메시지 포맷팅
- `template-engine.ts` - 템플릿 엔진
- `template-variables.ts` - 템플릿 변수
- `redact.ts` - 민감 정보 마스킹
- `validation.ts` - 설정 검증
- `presets.ts` - 사전 설정
- `slack-socket.ts` - Slack WebSocket 통합
- `tmux.ts` - tmux 알림
- `reply-listener.ts` - 알림 응답 리스너 (daemon)
- `session-registry.ts` - 세션 레지스트리

### 알림 이벤트
- `session-start` - 세션 시작
- `session-stop` - 세션 중단 (모드 활성 상태)
- `session-idle` - 세션 유휴
- `ask-user-question` - 사용자 입력 필요

## 7. src/lib/ - Core Libraries

| 모듈 | 역할 |
|------|------|
| `atomic-write.ts` | Atomic JSON 파일 쓰기 (tmp+rename) |
| `worktree-paths.ts` | Git worktree 경로 해석 |
| `session-isolation.ts` | 세션 격리 유틸리티 |
| `mode-state-io.ts` | 모드 상태 I/O |
| `mode-names.ts` | 모드 이름 상수 |
| `payload-limits.ts` | 페이로드 크기 제한 |
| `file-lock.ts` | 파일 잠금 |
| `shared-memory.ts` | 공유 메모리 |
| `version.ts` | 버전 정보 |
| `project-memory-merge.ts` | 프로젝트 메모리 병합 |
| `featured-contributors.ts` | 기여자 관리 |
| `job-state-db.ts` | Job 상태 DB |

## 8. src/utils/ - Utilities

| 모듈 | 역할 |
|------|------|
| `paths.ts` | 경로 유틸리티 |
| `config-dir.ts` | 설정 디렉토리 경로 |
| `jsonc.ts` | JSONC 파싱 (`jsonc-parser` 래퍼) |
| `frontmatter.ts` | YAML frontmatter 파싱 |
| `resolve-node.ts` | Node.js 실행 파일 경로 해석 |
| `skill-pipeline.ts` | Skill 파이프라인 유틸리티 |
| `ssrf-guard.ts` | SSRF 방어 |
| `string-width.ts` | 문자열 너비 계산 (CJK 등) |
| `daemon-module-path.ts` | Daemon 모듈 경로 |

## 9. src/planning/ - Planning Module

### artifacts.ts

Planning artifact 관리:
```typescript
export function readPlanningArtifacts(directory): PlanningArtifacts;
export function isPlanningComplete(artifacts): boolean;
```

Ralph의 ralplan-first gate에서 사용: planning이 완료되지 않으면 구현 시작을 차단한다.

## 10. src/verification/ - Verification System

### tier-selector.ts

검증 강도를 변경 규모에 따라 자동 선택:

```typescript
export function selectVerificationTier(changes): 'lightweight' | 'standard' | 'thorough';
// Small (<5 files, <100 lines) → lightweight
// Standard → standard
// Large (>20 files) → thorough
```

## 11. src/agents/ - Agent Module

### agents/index.ts

모든 agent와 관련 유틸리티를 re-export하는 barrel file.

### agents/types.ts

Agent 관련 타입 확장:
```typescript
export interface AgentPromptMetadata {
  triggers: DelegationTrigger[];
  useWhen?: string[];
  avoidWhen?: string[];
  cost: AgentCost;
  category: AgentCategory;
  promptAlias?: string;
}

export type AgentCost = 'low' | 'medium' | 'high';
export type AgentCategory = 'build' | 'review' | 'specialist' | 'coordination';
```

### agents/preamble.ts

Worker Preamble Protocol - agent가 sub-agent를 spawn하지 않고 직접 작업하도록 보장.

### 개별 agent 파일 (architect.ts, executor.ts 등)

각각 `loadAgentPrompt(name)`을 호출하여 markdown에서 prompt를 로드하고 AgentConfig 객체를 export:

```typescript
export const executorAgent: AgentConfig = {
  name: 'executor',
  description: 'Focused task executor for implementation work (Sonnet).',
  prompt: loadAgentPrompt('executor'),
  model: 'sonnet',
  defaultModel: 'sonnet'
};
```
