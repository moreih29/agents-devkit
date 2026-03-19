# OMO Source Code Deep Dive

## Shared Utilities (`src/shared/`, 50+ 파일)

### 핵심 유틸리티

| 파일 | 용도 |
|------|------|
| `logger.ts` | `log()` 함수 - 디버그 로깅 |
| `deep-merge.ts` | 객체 깊은 병합 (config 용) |
| `jsonc-parser.ts` | JSONC(주석 JSON) 파싱 (`jsonc-parser` 라이브러리) |
| `case-insensitive.ts` | 대소문자 무시 비교/검색 |
| `file-utils.ts` | 파일 유틸리티 |
| `snake-case.ts` | 스네이크케이스 변환 |
| `tool-name.ts` | 도구 이름 유틸리티 |

### 에이전트 관련
| 파일 | 용도 |
|------|------|
| `agent-variant.ts` | 에이전트 variant 해결/적용 |
| `agent-display-names.ts` | 에이전트 표시 이름 |
| `agent-tool-restrictions.ts` | 에이전트별 도구 제한 매핑 |
| `first-message-variant.ts` | 첫 메시지에서만 variant 오버라이드 |
| `permission-compat.ts` | 도구 차단/허용 유틸리티 |

### 모델 관련
| 파일 | 용도 |
|------|------|
| `model-resolver.ts` | 모델 해결 (fallback chain) |
| `model-availability.ts` | 사용 가능 모델 조회 |
| `model-requirements.ts` | 카테고리별 모델 요구사항 |
| `model-sanitizer.ts` | 모델 ID 정규화 |

### 설정/경로
| 파일 | 용도 |
|------|------|
| `claude-config-dir.ts` | Claude Code 설정 디렉토리 |
| `opencode-config-dir.ts` | OpenCode 설정 디렉토리 |
| `data-path.ts` | 데이터 경로 관리 |
| `config-errors.ts` | 설정 로드 에러 추적 |
| `migration.ts` | 설정 파일 마이그레이션 |

### 세션/커서
| 파일 | 용도 |
|------|------|
| `session-cursor.ts` | 세션 메시지 커서 관리 |
| `session-utils.ts` | 세션 유틸리티 (isCallerOrchestrator 등) |

### 기타
| 파일 | 용도 |
|------|------|
| `dynamic-truncator.ts` | 동적 텍스트 트런케이션 |
| `pattern-matcher.ts` | 패턴 매칭 (picomatch) |
| `frontmatter.ts` | YAML frontmatter 파싱 |
| `system-directive.ts` | 시스템 디렉티브 생성/파싱 |
| `external-plugin-detector.ts` | 외부 플러그인 감지 (알림 충돌 방지) |
| `shell-env.ts` | 쉘 환경 감지 |
| `opencode-version.ts` | OpenCode 버전 확인 |
| `zip-extractor.ts` | ZIP 파일 추출 |
| `file-reference-resolver.ts` | 파일 참조 해결 |
| `command-executor.ts` | 명령어 실행 |
| `hook-disabled.ts` | 훅 비활성화 유틸리티 |

### Tmux 유틸리티 (`src/shared/tmux/`)
```typescript
export function isInsideTmux(): boolean
export function getTmuxSessionName(): string | null
// Tmux 관련 상수, 유틸리티, 타입
```

## Config System (`src/config/`)

### Zod Schema (`src/config/schema.ts`)

모든 설정이 Zod v4로 정의:

```typescript
export const OhMyOpenCodeConfigSchema = z.object({
  $schema: z.string().optional(),
  disabled_mcps: z.array(AnyMcpNameSchema).optional(),
  disabled_agents: z.array(BuiltinAgentNameSchema).optional(),
  disabled_skills: z.array(BuiltinSkillNameSchema).optional(),
  disabled_hooks: z.array(HookNameSchema).optional(),
  agents: AgentOverridesSchema.optional(),
  categories: CategoriesConfigSchema.optional(),
  claude_code: ClaudeCodeConfigSchema.optional(),
  sisyphus_agent: SisyphusAgentConfigSchema.optional(),
  comment_checker: CommentCheckerConfigSchema.optional(),
  experimental: ExperimentalConfigSchema.optional(),
  skills: SkillsConfigSchema.optional(),
  ralph_loop: RalphLoopConfigSchema.optional(),
  background_task: BackgroundTaskConfigSchema.optional(),
  tmux: TmuxConfigSchema.optional(),
  // ...
})
```

### 주요 스키마 타입

**CategoryConfig**: 카테고리별 모델/temperature/thinking/tools 설정
```typescript
CategoryConfigSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  thinking: z.object({ type: z.enum(["enabled","disabled"]), budgetTokens: z.number().optional() }).optional(),
  reasoningEffort: z.enum(["low","medium","high","xhigh"]).optional(),
  is_unstable_agent: z.boolean().optional(),
  prompt_append: z.string().optional(),
})
```

**AgentOverrideConfig**: 에이전트 오버라이드
```typescript
AgentOverrideConfigSchema = z.object({
  model: z.string().optional(), variant: z.string().optional(),
  temperature: z.number().optional(), top_p: z.number().optional(),
  prompt_append: z.string().optional(), disable: z.boolean().optional(),
  permission: AgentPermissionSchema.optional(),
})
```

## MCP System (`src/mcp/`)

### 3-tier MCP

1. **빌트인**: websearch (Exa), context7 (docs), grep_app (GitHub)
2. **Claude Code 호환**: .mcp.json with `${VAR}` expansion
3. **스킬 내장**: YAML frontmatter의 mcpConfig

```typescript
// src/mcp/index.ts
const allBuiltinMcps: Record<McpName, RemoteMcpConfig> = {
  websearch,  // Exa 검색
  context7,   // 라이브러리 문서
  grep_app,   // GitHub 코드 검색
}

export function createBuiltinMcps(disabledMcps = []) {
  // disabled 목록에 없는 MCP만 반환
}
```

빌트인 MCP는 모두 `type: "remote"` (URL 기반).

## Context Injector (`src/features/context-injector/`)

### ContextCollector
```typescript
class ContextCollector {
  register(entry: ContextEntry): void   // 훅이 context 등록
  getPending(): PendingContext[]         // 미주입 context 목록
}
```

### Injector
`experimental.chat.messages.transform` 핸들러에서 등록된 context를 메시지 스트림에 주입.

## Hook Message Injector (`src/features/hook-message-injector/`)

메시지 파일 시스템에서 세션 메시지의 agent, model 정보를 추출:
```typescript
export const MESSAGE_STORAGE = "..." // 메시지 저장 경로
export function findNearestMessageWithFields(messageDir): { agent?, model? }
export function findFirstMessageWithAgent(messageDir): string | null
```

이 정보는 delegate_task에서 부모 세션의 에이전트/모델을 유지하는 데 사용.

## Plugin State (`src/plugin-state.ts`)

```typescript
export interface ModelCacheState {
  modelContextLimitsCache: Map<string, number>
  anthropicContext1MEnabled: boolean
}
export function getModelLimit(state, providerID, modelID): number | undefined
```

Anthropic 1M 컨텍스트 활성화 시 sonnet 모델의 한도를 1M으로 반환.

## 우리 프로젝트에의 시사점

1. **Shared 유틸리티**: 50+ 파일의 cross-cutting 유틸리티가 코드 재사용 극대화
2. **Zod Schema**: 타입 안전 설정 + JSON Schema 자동 생성
3. **3-tier MCP**: 빌트인 + Claude Code 호환 + 스킬 내장의 유연한 MCP 관리
4. **Context Injection**: 훅이 등록하고 transform에서 주입하는 2단계 패턴
5. **Message Injector**: 세션 메시지에서 agent/model 정보 추출로 상태 추적
