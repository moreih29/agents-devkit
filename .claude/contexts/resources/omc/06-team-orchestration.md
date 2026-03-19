# OMC Team Orchestration

## 1. 개요

Team orchestration은 OMC에서 가장 복잡한 서브시스템으로, `src/team/` 디렉토리에 50개 이상의 파일이 있다. Claude Code의 native team 기능과 tmux 기반 multi-CLI worker를 모두 지원한다.

## 2. 아키텍처

```
/team 3:executor "fix TypeScript errors"
       ↓
[Team Skill - skills/team/SKILL.md]
       ↓
[TEAM ORCHESTRATOR (Lead)]
  ├── TeamCreate("fix-ts-errors")     # Claude Code native team 생성
  ├── Analyze & decompose task        # explore/architect로 subtask 분해
  ├── TaskCreate x N                  # subtask별 task 생성
  ├── TaskUpdate x N                  # worker 할당
  ├── Monitor progress                # 진행 상태 모니터링
  └── Merge results                   # 결과 통합
```

## 3. Team Pipeline

5단계 파이프라인 (canonical staged pipeline):

```
team-plan → team-prd → team-exec → team-verify → team-fix (loop)
```

| Stage | 설명 | 전환 조건 |
|-------|------|----------|
| `team-plan` | Task 분해, 계획 수립 | → team-prd: 계획 완료 |
| `team-prd` | Acceptance criteria, 범위 명시 | → team-exec: 기준 확정 |
| `team-exec` | 실제 구현 실행 | → team-verify: 모든 task 완료 |
| `team-verify` | 검증 | → team-fix / complete / failed |
| `team-fix` | 수정 사항 적용 | → team-exec / team-verify / complete / failed |

**Terminal states:** `complete`, `failed`, `cancelled`
**Fix loop bound:** max attempts 초과 시 `failed`로 전환

## 4. src/team/ 주요 모듈

### 4.1 Core Operations

**task-file-ops.ts** - Task 파일 CRUD:
```typescript
export { readTask, updateTask, findNextTask, areBlockersResolved,
  writeTaskFailure, readTaskFailure, listTaskIds };
```

**team-ops.ts** - Team 기본 연산

**phase-controller.ts** - 파이프라인 단계 제어:
```typescript
export type TeamPhase = 'team-plan' | 'team-prd' | 'team-exec' |
  'team-verify' | 'team-fix' | 'complete' | 'failed' | 'cancelled';
export function inferPhase(tasks: PhaseableTask[]): TeamPhase;
export function isTerminalPhase(phase: string): boolean;
```

### 4.2 Communication

**inbox-outbox.ts** - Worker 간 메시지 전달:
```typescript
export { appendOutbox, readNewInboxMessages, readAllInboxMessages,
  clearInbox, writeShutdownSignal, checkShutdownSignal,
  writeDrainSignal, checkDrainSignal, cleanupWorkerFiles };
```

파일 기반 메시지 큐: 각 worker는 inbox/outbox 파일을 통해 통신한다.

**message-router.ts** - 메시지 라우팅:
```typescript
export function routeMessage(message, workers): RouteResult;
export function broadcastToTeam(message, workers): BroadcastResult;
```

**tmux-comm.ts** - tmux를 통한 직접 통신:
```typescript
export { sendTmuxTrigger, queueInboxInstruction,
  queueDirectMessage, queueBroadcastMessage, readMailbox };
```

### 4.3 Worker Management

**worker-bootstrap.ts** - Worker 초기화:
```typescript
export { generateWorkerOverlay, composeInitialInbox, appendToInbox,
  getWorkerEnv, ensureWorkerStateDir, writeWorkerOverlay };
```

Worker overlay: 각 worker에게 주입되는 CLAUDE.md 오버레이 생성.

**worker-health.ts** - Worker 건강 상태 체크:
```typescript
export function getWorkerHealthReports(teamDir): WorkerHealthReport[];
export function checkWorkerHealth(report): 'healthy' | 'warning' | 'critical';
```

**worker-restart.ts** - Worker 재시작 정책:
```typescript
export { shouldRestart, recordRestart, readRestartState, clearRestartState };
```

**heartbeat.ts** - Worker heartbeat:
```typescript
export { writeHeartbeat, readHeartbeat, listHeartbeats,
  isWorkerAlive, deleteHeartbeat, cleanupTeamHeartbeats };
```

### 4.4 tmux Session Management

**tmux-session.ts** - tmux 세션 관리:
```typescript
export { validateTmux, sanitizeName, sessionName,
  createSession, killSession, isSessionAlive,
  listActiveSessions, spawnBridgeInSession, injectToLeaderPane };
```

**model-contract.ts** - CLI agent 타입별 계약:
```typescript
export type CliAgentType = 'claude' | 'codex' | 'gemini';
export interface CliAgentContract {
  binary: string;       // 실행 파일 경로
  launchArgs: string[]; // 시작 인자
  // ...
}
export function getContract(agentType: CliAgentType): CliAgentContract;
export function buildWorkerCommand(config: WorkerLaunchConfig): string;
```

**cli-detection.ts** - CLI 도구 감지:
```typescript
export function detectCli(type: CliAgentType): CliInfo | null;
export function detectAllClis(): Map<CliAgentType, CliInfo>;
```

### 4.5 Task Routing & Scaling

**task-router.ts** - Task를 적절한 worker에게 배분:
```typescript
export function routeTasks(tasks, workers): TaskRoutingDecision[];
```

**capabilities.ts** - Worker 능력 평가:
```typescript
export function getDefaultCapabilities(agentType): WorkerCapability[];
export function scoreWorkerFitness(worker, task): number;
export function rankWorkersForTask(workers, task): Worker[];
```

**scaling.ts** - 동적 worker 스케일링:
```typescript
export function isScalingEnabled(): boolean;
export function scaleUp(config): ScaleUpResult;
export function scaleDown(options): ScaleDownResult;
```

### 4.6 Git Worktree

**git-worktree.ts** - Worker별 격리된 git worktree:
```typescript
export { createWorkerWorktree, removeWorkerWorktree,
  listTeamWorktrees, cleanupTeamWorktrees };
```

각 worker가 별도의 git worktree에서 작업하여 충돌을 방지한다.

### 4.7 Merge Coordination

**merge-coordinator.ts** - Worker 브랜치 병합:
```typescript
export function checkMergeConflicts(workerBranch, baseBranch): MergeResult;
export function mergeWorkerBranch(workerBranch, baseBranch): MergeResult;
export function mergeAllWorkerBranches(workers, baseBranch): MergeResult[];
```

### 4.8 Governance & Contracts

**governance.ts** - Team 거버넌스 정책:
```typescript
export { DEFAULT_TEAM_TRANSPORT_POLICY, DEFAULT_TEAM_GOVERNANCE,
  normalizeTeamTransportPolicy, normalizeTeamGovernance, normalizeTeamManifest };
```

**contracts.ts** - Team 상수 및 상태 전환 규칙:
```typescript
export const TEAM_TASK_STATUSES = ['pending', 'claimed', 'in_progress',
  'blocked', 'review', 'approved', 'done', 'failed', 'cancelled'];
export const TEAM_TERMINAL_TASK_STATUSES = ['done', 'failed', 'cancelled'];
export function canTransitionTeamTaskStatus(from, to): boolean;
```

## 5. Bridge 파일

### bridge/team-bridge.cjs

esbuild 번들. `src/team/bridge-entry.ts`를 엔트리포인트로 사용. 주요 export:
- `validateConfigPath()` - 설정 경로 검증

### bridge/team-mcp.cjs

Team MCP 서버 번들. Worker가 사용하는 team-specific MCP 도구를 제공.

### bridge/team.js

Team 실행 스크립트.

## 6. Runtime

**runtime.ts** - Team 실행 엔진:
```typescript
export function startTeam(config: TeamConfig): TeamRuntime;
export function monitorTeam(runtime: TeamRuntime): TeamSnapshot;
export function assignTask(runtime, taskId, workerId): void;
export function shutdownTeam(runtime): void;
export function resumeTeam(config): TeamRuntime;
export function watchdogCliWorkers(runtime): WatchdogCompletionEvent;
```

**runtime-v2.ts** - 차세대 runtime (개발 중 추정)

**runtime-cli.ts** - CLI 기반 runtime

## 7. Team State 관리

State 파일: `.omc/state/sessions/{sessionId}/team-state.json`
```json
{
  "active": true,
  "team_name": "fix-ts-errors",
  "current_phase": "team-exec",
  "session_id": "abc-123",
  "started_at": "...",
  "reinforcement_count": 0,
  "agent_count": 3
}
```

### State 경로 관리

**state-paths.ts:**
```typescript
export class TeamPaths {
  static teamDir(root: string, teamName: string): string;
  static workerDir(root: string, teamName: string, workerName: string): string;
  static taskFile(root: string, teamName: string, taskId: string): string;
  // ...
}
export function teamStateRoot(root: string): string;
```

## 8. Team + Ralph 합성

Team은 Ralph와 합성될 수 있다:

```
/team ralph "build REST API"
```

이 경우:
1. keyword-detector가 ralph + team 모두 감지
2. 양쪽 state 파일 생성
3. `linkRalphTeam()` - 상호 참조 설정
4. Ralph가 외부 루프, Team이 내부 실행 담당
5. Team pipeline이 실패하면 Ralph가 재시도

## 9. Hooks 연동

### pre-tool-enforcer.mjs의 Team Routing

Team 활성 상태에서 team_name 없이 Task를 호출하면 차단:

```javascript
const teamState = getActiveTeamState(directory, sessionId);
if (teamState && !toolInput.team_name) {
  return '[TEAM ROUTING REQUIRED] Team "name" is active but you are spawning ' +
    'a regular subagent without team_name...';
}
```

### persistent-mode.cjs의 Team Pipeline 처리

Team pipeline은 Priority 2.5에서 처리:
- Circuit breaker: 20회 max, 5분 TTL
- Terminal phase 감지 시 breaker 리셋
- Cancel 요청 시 즉시 허용

### team-dispatch-hook.ts, team-leader-nudge-hook.ts

`src/hooks/` 내의 team 관련 hook 모듈:
- dispatch hook: team task 배분 결정
- leader nudge hook: leader가 stale할 때 알림

## 10. API Interop

**api-interop.ts** - Worker가 사용할 수 있는 team API:
```typescript
export const TEAM_API_OPERATIONS = ['claim_task', 'update_task', 'send_message',
  'get_status', 'list_tasks', 'heartbeat', /* ... */];
export function resolveTeamApiOperation(envelope: TeamApiEnvelope): TeamApiOperation;
export function executeTeamApiOperation(op: TeamApiOperation): Promise<unknown>;
```

## 11. Usage Tracking & Reporting

**usage-tracker.ts:**
```typescript
export function recordTaskUsage(teamName, taskId, workerId, metrics): void;
export function generateUsageReport(teamName): TeamUsageReport;
```

**summary-report.ts:**
```typescript
export function generateTeamReport(teamName): string;
export function saveTeamReport(teamName, report): void;
```

**activity-log.ts:**
```typescript
export function getActivityLog(teamDir): ActivityEntry[];
export function formatActivityTimeline(entries): string;
```

**audit-log.ts:**
```typescript
export function logAuditEvent(teamDir, event: AuditEvent): void;
export function readAuditLog(teamDir): AuditEvent[];
```
