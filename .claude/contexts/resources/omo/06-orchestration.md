# OMO Multi-Agent Orchestration 분석

## BackgroundManager (`src/features/background-agent/manager.ts`, 1335줄)

가장 복잡한 단일 파일. 백그라운드 에이전트 작업의 전체 lifecycle 관리.

### 핵심 상태
```typescript
class BackgroundManager {
  private tasks: Map<string, BackgroundTask>
  private notifications: Map<string, BackgroundTask[]>
  private pendingByParent: Map<string, Set<string>>  // 부모별 pending 추적
  private queuesByKey: Map<string, QueueItem[]>       // 동시성 키별 큐
  private processingKeys: Set<string>                  // 처리 중인 키
  private concurrencyManager: ConcurrencyManager
}
```

### Task Lifecycle

```
launch() -> pending -> [queue] -> startTask() -> running
  -> [session.idle / polling stability] -> tryCompleteTask() -> completed
  -> notifyParentSession() -> [5분 후 메모리 삭제]
```

### launch()
```typescript
async launch(input: LaunchInput): Promise<BackgroundTask> {
  // 1. pending 상태로 task 생성
  const task = { id: `bg_${uuid}`, status: "pending", ... }
  // 2. 동시성 키별 큐에 추가
  const key = getConcurrencyKeyFromInput(input)  // "provider/model" 또는 agent
  queue.push({ task, input })
  // 3. processKey() fire-and-forget
  this.processKey(key)
  return task
}
```

### processKey() - 동시성 제어
```typescript
private async processKey(key: string) {
  while (queue.length > 0) {
    await this.concurrencyManager.acquire(key)  // 동시성 슬롯 획득
    await this.startTask(item)                    // 실제 실행
    queue.shift()
  }
}
```

### startTask() - 실제 세션 생성
```typescript
private async startTask(item) {
  // 1. 부모 세션의 directory 상속
  const parentDirectory = parentSession?.data?.directory ?? this.directory
  // 2. 새 세션 생성 (parentID 연결)
  const sessionID = await client.session.create({ parentID, title, directory })
  // 3. task 상태 업데이트 (running, sessionID)
  // 4. 폴링 시작
  // 5. prompt() fire-and-forget (agent, model, system, tools, parts)
  client.session.prompt({
    body: {
      agent: input.agent,
      model: input.model,
      system: input.skillContent,
      tools: { task: false, delegate_task: false, call_omo_agent: true },
      parts: [{ type: "text", text: input.prompt }],
    },
  }).catch(error => { /* error 처리 */ })
}
```

### 완료 감지 (3가지 경로)

1. **session.idle 이벤트**: `handleEvent()` -> `validateSessionHasOutput()` -> `tryCompleteTask()`
2. **폴링**: `pollRunningTasks()` -> session status idle + 메시지 안정성
3. **안정성 감지**: 3회 연속 메시지 수 동일 + session status recheck

### 완료 검증
```typescript
private async validateSessionHasOutput(sessionID): Promise<boolean> {
  // assistant/tool 메시지 존재 확인
  // text, reasoning, tool, tool_result 중 실제 콘텐츠 확인
  // 빈 메시지만 있으면 false (완료 아님)
}
```

### Todo 체크
```typescript
private async checkSessionTodos(sessionID): Promise<boolean> {
  // 미완료 todo가 있으면 true -> 완료 지연
}
```

### 부모 세션 알림
```typescript
private async notifyParentSession(task) {
  // 개별 완료: "[BACKGROUND TASK COMPLETED]" (noReply: true)
  // 전체 완료: "[ALL BACKGROUND TASKS COMPLETE]" (noReply: false -> 응답 유도)
  await client.session.prompt({
    body: {
      noReply: !allComplete,
      agent, model,  // 부모 세션의 에이전트/모델 유지
      parts: [{ type: "text", text: notification }],
    },
  })
}
```

### Stale Task 처리
```typescript
private async checkAndInterruptStaleTasks() {
  // DEFAULT_STALE_TIMEOUT_MS = 180_000 (3분)
  // MIN_RUNTIME_BEFORE_STALE_MS = 30_000 (30초)
  // 조건 충족 시 session.abort() + "cancelled" 상태
}
```

### Resume
```typescript
async resume(input: ResumeInput): Promise<BackgroundTask> {
  // 기존 task 찾기 -> 동시성 재획득 -> running 상태
  // startedAt 리셋 (MIN_IDLE_TIME_MS 체크용)
  // prompt() fire-and-forget
}
```

### 프로세스 정리
- SIGINT, SIGTERM, SIGBREAK(Windows), beforeExit, exit 시 모든 매니저 shutdown
- shutdown(): 폴링 중지, 동시성 해제, 상태 초기화

## ConcurrencyManager (`src/features/background-agent/concurrency.ts`)

provider/model별 동시성 제어:
```typescript
class ConcurrencyManager {
  async acquire(key: string): Promise<void>  // 슬롯 획득 (대기)
  release(key: string): void                  // 슬롯 반환
  clear(): void                               // 모든 대기자 해제
}
```

설정:
```jsonc
{
  "background_task": {
    "defaultConcurrency": 2,
    "providerConcurrency": { "anthropic": 3 },
    "modelConcurrency": { "anthropic/claude-sonnet-4-5": 2 }
  }
}
```

## Boulder State (`src/features/boulder-state/`)

장기 작업 추적을 위한 파일 기반 상태:
```typescript
interface BoulderState {
  plan_name: string
  active_plan: string       // .sisyphus/plans/{name}.md 경로
  session_ids: string[]     // 관련 세션 ID 목록
}

function readBoulderState(directory: string): BoulderState | null
function appendSessionId(directory: string, sessionId: string): void
function getPlanProgress(planPath: string): { total, completed, isComplete }
```

`getPlanProgress()`가 마크다운 체크박스를 파싱하여 진행률 계산:
- `- [ ]`: 미완료
- `- [x]`: 완료

## Tmux Subagent (`src/features/tmux-subagent/`)

Tmux 기반 멀티 에이전트 시각화:
```typescript
class TmuxSessionManager {
  async onSessionCreated({ sessionID, parentID, title }): Promise<void>
  async onSessionDeleted({ sessionID }): Promise<void>
}
```

설정:
```jsonc
{
  "tmux": {
    "enabled": false,
    "layout": "main-vertical",    // main-horizontal, tiled, even-*
    "main_pane_size": 60           // 주 패인 크기 (%)
  }
}
```

## Task Toast Manager (`src/features/task-toast-manager/`)

작업 진행 상태를 OpenCode UI에 토스트로 표시:
```typescript
function initTaskToastManager(client)
toastManager.addTask({ id, description, agent, isBackground, ... })
toastManager.updateTask(taskId, status)
toastManager.showCompletionToast({ id, description, duration })
```

## 오케스트레이션 흐름 예시

### 1. Sisyphus가 delegate_task 호출
```
Sisyphus -> delegate_task(category="quick", load_skills=["git-master"], ...)
```

### 2. Sync 모드 (run_in_background=false)
```
새 세션 생성 -> Sisyphus-Junior 에이전트 프롬프트
-> 폴링 (500ms 간격, 최대 10분)
-> session idle + 메시지 안정 -> 결과 추출
-> "Task completed in Xm Ys.\nSession ID: ses_xxx\n---\n{결과}"
```

### 3. Background 모드 (run_in_background=true)
```
BackgroundManager.launch() -> 큐 추가 -> 동시성 대기
-> 세션 생성 -> prompt fire-and-forget
-> 폴링으로 완료 감지 -> 부모 세션에 알림 주입
-> "background_output(task_id=...)" 로 결과 조회
```

### 4. Atlas 오케스트레이션
```
/start-work -> Atlas 에이전트 활성화
-> .sisyphus/plans/{name}.md 읽기 -> task 분석
-> delegate_task() 반복 (각 task에 6-Section 프롬프트)
-> 매 완료 후: lsp_diagnostics + build + test 검증
-> 실패 시: session_id로 resume (최대 3회)
-> 모든 task 완료 -> 최종 보고
```

## 우리 프로젝트에의 시사점

1. **BackgroundManager**: 세션 기반 비동기 작업 관리의 완전한 구현체
2. **동시성 제어**: provider/model별 슬롯 관리로 API 제한 준수
3. **완료 감지**: session.idle + 폴링 + 안정성 3중 체크
4. **Stale 감지**: 활동 없는 작업 자동 취소
5. **Boulder State**: 파일 기반 장기 작업 추적 (체크박스 파싱)
6. **부모 세션 알림**: 개별/전체 완료 구분 + noReply 제어
