# Oh My OpenCode (OMO) - Architecture Overview

## 프로젝트 개요

oh-my-opencode (OMO)는 OpenCode AI 코딩 에이전트를 위한 "batteries-included" 플러그인이다. "oh-my-zsh for OpenCode"를 표방하며, multi-model orchestration, parallel background agents, LSP/AST 도구를 제공한다.

- **패키지명**: `oh-my-opencode` (npm)
- **버전**: 3.0.1
- **저자**: YeonGyu-Kim (code-yeongyu)
- **라이선스**: SUL-1.0
- **런타임**: Bun (빌드, 테스트, 실행 모두)
- **핵심 의존성**: `@opencode-ai/plugin`, `@opencode-ai/sdk`

## 핵심 아키텍처

### Plugin 기반 아키텍처

OMO는 `@opencode-ai/plugin`의 `Plugin` 타입을 구현하는 단일 async 함수(`OhMyOpenCodePlugin`)로 진입한다. 이 함수가 OpenCode의 lifecycle hook들에 대한 핸들러를 반환하는 구조:

```typescript
// src/index.ts (601줄)
const OhMyOpenCodePlugin: Plugin = async (ctx) => {
  // ctx.directory: 프로젝트 루트
  // ctx.client: OpenCode SDK 클라이언트 (session, app 등 API)
  return {
    tool: { ... },              // 커스텀 도구 등록
    "chat.message": ...,        // 메시지 전/후처리
    "experimental.chat.messages.transform": ...,  // 메시지 스트림 변환
    config: ...,                // 에이전트/MCP/명령어 설정 제공
    event: ...,                 // 세션 이벤트 핸들러
    "tool.execute.before": ..., // 도구 실행 전 인터셉트
    "tool.execute.after": ...,  // 도구 실행 후 결과 변환
  };
};
```

### 디렉토리 구조

```
oh-my-opencode/
├── src/
│   ├── index.ts              # Plugin 진입점 (601줄) - 모든 컴포넌트 조립
│   ├── plugin-config.ts      # 설정 로드/병합 (JSONC 지원)
│   ├── plugin-state.ts       # 모델 캐시 상태
│   ├── plugin-handlers/      # config 핸들러 (에이전트/MCP/명령어 등록)
│   ├── agents/               # 10개 AI 에이전트 정의
│   ├── hooks/                # 31개 lifecycle 훅
│   ├── tools/                # 20+ 도구 (LSP, AST-Grep, delegation 등)
│   ├── features/             # Background agents, Claude Code 호환, boulder state
│   ├── shared/               # 50개 cross-cutting 유틸리티
│   ├── config/               # Zod 스키마, 타입
│   ├── mcp/                  # 빌트인 MCP (websearch, context7, grep_app)
│   └── cli/                  # CLI 설치, doctor
├── packages/                 # 7개 플랫폼별 바이너리
├── script/                   # 빌드 스크립트
└── dist/                     # 빌드 출력 (ESM + .d.ts)
```

## OpenCode Plugin 통합 방식

### Plugin Context (`ctx`)

OpenCode는 plugin에 `ctx` 객체를 주입한다:
- `ctx.directory`: 프로젝트 루트 디렉토리
- `ctx.client`: OpenCode SDK 클라이언트 (세션 생성/관리, 메시지, 프롬프트, 에이전트 목록 등)

### Plugin Return 핸들러

| 핸들러 | 용도 |
|--------|------|
| `tool` | 커스텀 도구 등록 (LSP, AST-grep, delegate_task 등) |
| `chat.message` | 메시지 전/후처리 (키워드 감지, Ralph Loop, auto-slash-command) |
| `experimental.chat.messages.transform` | 메시지 스트림 변환 (context injection, thinking block) |
| `config` | 에이전트/MCP/명령어 설정을 OpenCode에 제공 |
| `event` | 세션 생성/삭제, 에러 복구, idle 감지, context window 모니터링 |
| `tool.execute.before` | 도구 실행 전 인터셉트 (권한 가드, 프롬프트 주입) |
| `tool.execute.after` | 도구 실행 후 결과 변환 (truncation, verification reminder) |

## 설정 시스템

### Multi-level Config

1. **User-level**: `~/.config/opencode/oh-my-opencode.json[c]`
2. **Project-level**: `.opencode/oh-my-opencode.json[c]` (프로젝트가 user를 오버라이드)

JSONC(주석 지원 JSON) 파싱 -> Zod v4 검증 -> deepMerge로 병합.

### 핵심 설정 항목 (`src/config/schema.ts`)

- `agents`: 에이전트별 오버라이드 (모델, 프롬프트, 권한, variant)
- `categories`: delegate_task 카테고리 커스텀 (모델, temperature, prompt_append)
- `disabled_hooks/agents/skills/commands`: 선택적 비활성화
- `claude_code`: Claude Code 호환 레이어 제어 (mcp, commands, skills, hooks, plugins)
- `ralph_loop`: 반복 실행 루프 설정
- `background_task`: 동시성, stale 타임아웃
- `tmux`: Tmux subagent 통합
- `experimental`: aggressive truncation, dynamic context pruning
- `git_master`: 커밋 메시지 footer, co-authored-by
- `browser_automation_engine`: playwright vs agent-browser 선택

## 핵심 디자인 패턴

### 1. Factory Pattern
모든 에이전트, 훅, 도구가 `createXXX()` 팩토리로 생성.

### 2. Conditional Hook Initialization
```typescript
const isHookEnabled = (hookName: HookName) => !disabledHooks.has(hookName);
const hook = isHookEnabled("hook-name") ? createHook(ctx) : null;
// event handler에서: await hook?.event(input);
```

### 3. Dynamic Prompt Building
에이전트 프롬프트가 사용 가능한 에이전트/도구/스킬에 따라 동적 생성.

### 4. Claude Code Compatibility Layer
- `src/features/claude-code-mcp-loader/`: .mcp.json 로드 + `${VAR}` 환경변수 확장
- `src/features/claude-code-agent-loader/`: .claude/agents/ 에이전트 로드
- `src/features/claude-code-command-loader/`: 명령어 호환
- `src/features/claude-code-session-state/`: 세션 상태 관리
- `src/features/claude-code-plugin-loader/`: 플러그인 로드

### 5. Background Agent Architecture
```
Parent Session -> delegate_task(run_in_background=true) -> BackgroundManager.launch()
  -> 새 OpenCode 세션 생성 -> 동시성 제어 (provider/model별)
  -> 폴링 + session.idle로 완료 감지 -> 부모 세션에 system-reminder 주입
```

## 에이전트 모델 라우팅

| Agent | Model | 용도 |
|-------|-------|------|
| Sisyphus | anthropic/claude-opus-4-5 | 주 오케스트레이터 |
| Atlas | anthropic/claude-opus-4-5 | 마스터 오케스트레이터 |
| Oracle | openai/gpt-5.2 | 컨설테이션, 디버깅 |
| Librarian | opencode/big-pickle | 문서, GitHub 검색 |
| Explore | opencode/gpt-5-nano | 빠른 코드 검색 |
| Multimodal Looker | google/gemini-3-flash | PDF/이미지 분석 |
| Prometheus | anthropic/claude-opus-4-5 | 전략적 계획 |
| Sisyphus-Junior | anthropic/claude-sonnet-4-5 | 작업 실행 (카테고리 기반) |

## 복잡도 핫스팟

| 파일 | 줄수 | 설명 |
|------|------|------|
| `src/features/background-agent/manager.ts` | 1335 | Task lifecycle, 동시성 |
| `src/features/builtin-skills/skills.ts` | 1203 | Skill 정의 |
| `src/agents/prometheus-prompt.ts` | 1196 | Planning 에이전트 |
| `src/tools/delegate-task/tools.ts` | 1039 | Category delegation |
| `src/hooks/atlas/index.ts` | 773 | 오케스트레이터 훅 |
| `src/index.ts` | 601 | 메인 진입점 |
| `src/tools/lsp/client.ts` | 596 | LSP JSON-RPC |
| `src/agents/atlas.ts` | 572 | Atlas 에이전트 |

## 우리 프로젝트에의 시사점

1. **Plugin 구조**: `Plugin` 타입의 async factory 패턴이 Claude Code의 Hook 시스템과 유사
2. **Config Handler**: 에이전트/MCP/명령어를 동적으로 등록하는 패턴이 핵심
3. **Background Agent**: 병렬 에이전트 실행을 위한 세션 기반 관리
4. **Claude Code Compatibility**: .mcp.json, CLAUDE.md 등을 변환하는 어댑터 레이어
5. **Dynamic Prompt**: 사용 가능한 리소스에 따라 프롬프트 동적 생성
6. **Conditional Hooks**: `isHookEnabled()` + optional chaining으로 모듈식 기능 토글
