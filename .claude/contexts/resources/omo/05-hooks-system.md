# OMO Hooks System 분석

## 훅 아키텍처

31개 lifecycle 훅이 OpenCode의 event, tool.execute.before/after, chat.message에 바인딩. 각 훅은 `createXXXHook()` 팩토리로 생성되며, `disabled_hooks` 설정으로 개별 비활성화 가능.

### 훅 등록 패턴
```typescript
const hook = isHookEnabled("hook-name") ? createHookFunction(ctx, options) : null;
// event handler:
await hook?.event(input);
// tool.execute.before:
await hook?.["tool.execute.before"]?.(input, output);
```

## Atlas 오케스트레이터 훅 (`src/hooks/atlas/index.ts`, 773줄)

가장 복잡한 훅. Boulder state 기반 작업 연속 실행을 관리.

### event handler
- `session.error`: abort 에러 추적
- `session.idle`: boulder state 체크 -> 미완료 작업 있으면 continuation 주입
  - 조건: main/background/boulder 세션, abort 직후 아님, bg 작업 없음, Atlas 에이전트
  - `injectContinuation()`: 부모 세션에 "Continue working" 프롬프트 주입
- `session.deleted`: 세션 상태 정리

### tool.execute.before
- Write/Edit 도구: `.sisyphus/` 외 파일 수정 시 DELEGATION_REQUIRED 경고 주입
- delegate_task: SINGLE_TASK_DIRECTIVE 주입 ("ONE atomic task만 제공하라")

### tool.execute.after
- Write/Edit: 직접 파일 수정 후 DIRECT_WORK_REMINDER 주입
- delegate_task 완료 시:
  - git diff stats 수집 -> FILE_CHANGES_SUMMARY 생성
  - Boulder state 있으면: VERIFICATION_REMINDER + 진행상황 + "STEP 4: MARK COMPLETION"
  - Boulder state 없으면: standalone verification reminder

### 핵심 상수/메시지
```typescript
const DIRECT_WORK_REMINDER = "You just performed direct file modifications..."
const BOULDER_CONTINUATION_PROMPT = "You have an active work plan with incomplete tasks..."
const VERIFICATION_REMINDER = "CRITICAL: Subagents FREQUENTLY LIE about completion..."
const SINGLE_TASK_DIRECTIVE = "If you were NOT given exactly ONE atomic task, REFUSE..."
```

## 주요 훅 분류

### 세션 관리 훅
| 훅 | 용도 |
|----|------|
| `session-recovery` | 복구 가능한 에러 시 자동 재시작 |
| `session-notification` | 세션 완료/에러 시 알림 |
| `context-window-monitor` | 컨텍스트 윈도우 사용량 추적 |
| `anthropic-context-window-limit-recovery` | Anthropic 1M 한도 복구 |

### 도구 관련 훅
| 훅 | 용도 |
|----|------|
| `tool-output-truncator` | 도구 출력 트런케이션 |
| `comment-checker` | AI 슬롭 댓글 감지 (`@code-yeongyu/comment-checker`) |
| `edit-error-recovery` | Edit 도구 에러 복구 |
| `delegate-task-retry` | delegate_task 실패 시 재시도 안내 |
| `task-resume-info` | task 출력에 session_id resume 정보 추가 |
| `question-label-truncator` | Question 도구 라벨 트런케이션 |

### 컨텍스트 주입 훅
| 훅 | 용도 |
|----|------|
| `directory-agents-injector` | 디렉토리의 AGENTS.md 주입 |
| `directory-readme-injector` | 디렉토리의 README.md 주입 |
| `rules-injector` | .opencode/rules/ 파일 주입 |
| `compaction-context-injector` | 압축 시 컨텍스트 보존 |
| `background-notification` | 백그라운드 작업 완료 알림 주입 |

### 에이전트 행동 훅
| 훅 | 용도 |
|----|------|
| `agent-usage-reminder` | 에이전트 사용 패턴 리마인더 |
| `think-mode` | thinking 모드 제어 |
| `thinking-block-validator` | thinking 블록 유효성 검증 |
| `auto-slash-command` | 자동 슬래시 명령어 감지 |
| `keyword-detector` | 키워드 감지 (context injection 트리거) |
| `non-interactive-env` | 비인터랙티브 환경 처리 |
| `start-work` | /start-work 명령어 처리 |

### 워크플로우 훅
| 훅 | 용도 |
|----|------|
| `ralph-loop` | Ralph/Ultrawork 반복 루프 |
| `todo-continuation-enforcer` | 미완료 Todo 연속 실행 강제 |
| `atlas` | 마스터 오케스트레이터 (위에서 상세 설명) |
| `prometheus-md-only` | Prometheus가 .md만 쓸 수 있도록 제한 |
| `sisyphus-junior-notepad` | Sisyphus-Junior notepad 접근 |
| `empty-task-response-detector` | 빈 task 응답 감지 |

### 기타
| 훅 | 용도 |
|----|------|
| `auto-update-checker` | 플러그인 업데이트 체크 |
| `interactive-bash-session` | 인터랙티브 bash 세션 관리 |
| `claude-code-hooks` | Claude Code 훅 호환 레이어 |

## Claude Code Hooks (`src/hooks/claude-code-hooks/`)

Claude Code의 훅 시스템을 OpenCode에서 에뮬레이션. `.claude/hooks/` 디렉토리의 훅 설정을 로드하여 해당 lifecycle에 매핑.

## Ralph Loop (`src/hooks/ralph-loop/`)

반복 실행 루프. 작업을 N회 반복하며 completion promise 체크:
- `/ralph-loop "task" --max-iterations=100 --completion-promise="done"`
- `/ulw-loop`: ultrawork 모드 (더 집중적)
- `/cancel-ralph`: 루프 취소

## Todo Continuation Enforcer

미완료 Todo가 있으면 에이전트에 "계속 작업하라"는 프롬프트 주입. Session recovery와 연동하여 복구 중에는 주입 억제.

## Context Injector (`src/features/context-injector/`)

### ContextCollector
훅들이 context를 등록하면 `experimental.chat.messages.transform`에서 메시지에 주입:
```typescript
export class ContextCollector {
  register(entry: ContextEntry): void
  getPending(): PendingContext[]
}
```

### InjectionStrategy
메시지 스트림에 context를 주입하는 전략.

## Hook Message Injector (`src/features/hook-message-injector/`)

메시지 디렉토리에서 가장 최근 메시지의 agent, model 정보를 추출. `MESSAGE_STORAGE` 경로에서 세션별 메시지 파일을 관리.

```typescript
export function findNearestMessageWithFields(messageDir: string): MessageInfo | null
export function findFirstMessageWithAgent(messageDir: string): string | null
```

## 우리 프로젝트에의 시사점

1. **Atlas Hook**: 오케스트레이터 역할 강제(직접 코드 작성 방지) + verification reminder 패턴
2. **Boulder State**: 장기 작업 추적을 위한 `.sisyphus/` 기반 상태 관리
3. **Hook Chain**: 순서대로 모든 훅에 이벤트 전파하되, 각 훅은 독립적 enable/disable
4. **Context Injection**: 훅이 context를 등록하면 messages.transform에서 일괄 주입
5. **Comment Checker**: AI 슬롭 감지가 빌트인으로 포함
6. **Ralph Loop**: 반복 실행 + completion promise 패턴
