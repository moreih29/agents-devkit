# OMC State Management

## 1. .omc/ 디렉토리 구조

프로젝트 루트에 생성되는 `.omc/` 디렉토리가 모든 상태를 저장한다:

```
.omc/
├── state/
│   ├── sessions/{sessionId}/        # 세션 격리 상태
│   │   ├── ralph-state.json         # Ralph 루프 상태
│   │   ├── ultrawork-state.json     # Ultrawork 모드 상태
│   │   ├── autopilot-state.json     # Autopilot 상태
│   │   ├── team-state.json          # Team 모드 상태
│   │   ├── ultraqa-state.json       # UltraQA 상태
│   │   ├── ralplan-state.json       # Ralplan 상태
│   │   ├── omc-teams-state.json     # OMC Teams 상태
│   │   ├── skill-active-state.json  # 현재 활성 skill
│   │   ├── cancel-signal-state.json # 취소 신호 (30초 TTL)
│   │   ├── team-pipeline-stop-breaker.json  # Circuit breaker
│   │   ├── ralplan-stop-breaker.json
│   │   └── idle-notif-cooldown.json # Idle 알림 쿨다운
│   ├── subagent-tracking.json       # Agent spawn 추적
│   ├── agent-replay-{sessionId}.jsonl # Flow trace
│   ├── mission-state.json           # Mission board 상태
│   └── swarm-summary.json           # Swarm 요약 (legacy)
├── notepad.md                       # 세션 지속 노트
├── project-memory.json              # 프로젝트 지식
├── plans/                           # Planning 산출물
│   ├── ralplan-*.md
│   └── autopilot-impl.md
├── prd.json                         # Ralph PRD
├── todos.json                       # 로컬 todo 추적
├── skills/                          # 프로젝트 레벨 learned skills
└── teams/                           # Team 작업 공간
    └── {team-name}/
        ├── tasks/
        ├── workers/
        └── audit.log
```

## 2. 세션 격리 (Session Isolation)

### 세션 격리 원칙

모든 mode state는 세션 ID 기반으로 격리된다:

```
세션 격리 경로: .omc/state/sessions/{sessionId}/{mode}-state.json
레거시 경로:   .omc/state/{mode}-state.json
```

**세션 ID 검증:**
```javascript
const SESSION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,255}$/;
function isValidSessionId(sessionId) {
  return typeof sessionId === 'string' && SESSION_ID_PATTERN.test(sessionId);
}
```

### 읽기 전략

`readStateFileWithSession()` (persistent-mode.cjs):

1. 세션 ID가 있으면 → 세션 경로에서 읽기
2. 세션 경로에 없으면 → 모든 세션 디렉토리 스캔하여 session_id 필드 매칭
3. 레거시 경로에서 session_id 필드가 매칭되면 사용
4. 세션 ID가 없으면 → 레거시 경로 사용 (하위 호환)

### 쓰기 전략

```javascript
function activateState(directory, prompt, stateName, sessionId) {
  if (sessionId && SESSION_ID_PATTERN.test(sessionId)) {
    const sessionDir = join(directory, '.omc', 'state', 'sessions', sessionId);
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, `${stateName}-state.json`), ...);
  } else {
    // 레거시 fallback
    writeFileSync(join(directory, '.omc', 'state', `${stateName}-state.json`), ...);
  }
}
```

## 3. Mode State 파일 형식

### Ralph State
```json
{
  "active": true,
  "iteration": 3,
  "max_iterations": 100,
  "started_at": "2026-03-19T10:00:00Z",
  "prompt": "fix all failing tests",
  "session_id": "abc-123",
  "project_path": "/path/to/project",
  "linked_ultrawork": true,
  "linked_team": false,
  "last_checked_at": "2026-03-19T10:15:00Z"
}
```

### Ultrawork State
```json
{
  "active": true,
  "started_at": "2026-03-19T10:00:00Z",
  "original_prompt": "refactor auth module",
  "session_id": "abc-123",
  "project_path": "/path/to/project",
  "reinforcement_count": 5,
  "max_reinforcements": 50,
  "last_checked_at": "2026-03-19T10:10:00Z"
}
```

### Team State
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

### Skill Active State
```json
{
  "active": true,
  "skill_name": "code-review",
  "session_id": "abc-123",
  "started_at": "...",
  "last_checked_at": "...",
  "reinforcement_count": 0,
  "max_reinforcements": 5,
  "stale_ttl_ms": 900000
}
```

### Cancel Signal State
```json
{
  "expires_at": "2026-03-19T10:00:30Z",
  "reason": "cancel",
  "mode": "ralph"
}
```
30초 TTL - persistent-mode.cjs가 이를 감지하면 즉시 stop 허용.

## 4. Notepad System

파일: `.omc/notepad.md`

### 구조
```markdown
## Priority Context
<!-- 세션 시작 시 자동 주입됨 -->
현재 프로젝트의 핵심 컨텍스트...

## Working Memory
<!-- 7일 후 자동 expire -->
- [2026-03-19] auth 모듈 리팩토링 진행 중
- [2026-03-18] DB 마이그레이션 완료

## MANUAL
<!-- 영구 보존 -->
프로젝트 컨벤션: 모든 API는 REST로...
```

### 3개 섹션

| 섹션 | 용도 | 수명 | 주입 시점 |
|------|------|------|----------|
| Priority Context | 핵심 컨텍스트 | 영구 (수동 교체) | SessionStart hook |
| Working Memory | 작업 노트 | 7일 자동 expire | 수동 / `<remember>` 태그 |
| MANUAL | 영구 메모 | 영구 | 수동 |

### `<remember>` 태그 처리

`post-tool-verifier.mjs`에서 Task agent 출력의 `<remember>` 태그를 파싱:

```javascript
// <remember>content</remember> → Working Memory에 추가
// <remember priority>content</remember> → Priority Context 설정
```

### MCP Tools 연동

```
notepad_read(section?)         → 내용 읽기
notepad_write_priority(content) → Priority Context 설정
notepad_write_working(content)  → Working Memory 항목 추가
notepad_write_manual(content)   → MANUAL 항목 추가
notepad_prune()                → 오래된 항목 정리
notepad_stats()                → 통계
```

## 5. Project Memory System

파일: `.omc/project-memory.json`

### 구조
```json
{
  "techStack": {
    "language": "TypeScript",
    "framework": "Next.js",
    "packageManager": "npm"
  },
  "build": {
    "command": "npm run build",
    "testCommand": "npm test"
  },
  "conventions": {
    "naming": "camelCase for variables, PascalCase for types",
    "imports": "ES modules"
  },
  "structure": {
    "src": "Source code",
    "tests": "Test files"
  },
  "customNotes": [
    { "note": "사용자 메모", "addedAt": "..." }
  ],
  "userDirectives": [
    { "directive": "모든 함수에 JSDoc 추가", "addedAt": "..." }
  ]
}
```

### 자동 수집

`project-memory-session.mjs` (SessionStart)와 `project-memory-posttool.mjs` (PostToolUse)에서 프로젝트 환경을 자동으로 감지하여 메모리에 기록한다.

### MCP Tools

```
project_memory_read(section?)       → 메모리 읽기
project_memory_write(data)          → 전체 쓰기 (merge 지원)
project_memory_add_note(note)       → 사용자 노트 추가
project_memory_add_directive(dir)   → 사용자 지시사항 추가
```

## 6. Flow Trace (Agent Replay)

파일: `.omc/state/agent-replay-{sessionId}.jsonl`

### JSONL 이벤트 형식
```json
{"t": 0.5, "event": "agent_start", "agent": "executor", "data": {...}}
{"t": 1.2, "event": "tool_start", "tool": "Bash", "data": {...}}
{"t": 2.0, "event": "tool_end", "tool": "Bash", "data": {...}}
{"t": 3.5, "event": "agent_stop", "agent": "executor", "data": {...}}
{"t": 0.1, "event": "keyword_detected", "keyword": "ralph", "data": {...}}
{"t": 0.2, "event": "mode_change", "from": "none", "to": "ralph", "data": {...}}
{"t": 0.3, "event": "skill_activated", "skill": "ralph", "data": {...}}
```

### 이벤트 타입
- `agent_start` / `agent_stop` - Agent 생명주기
- `tool_start` / `tool_end` - 도구 실행
- `file_touch` - 파일 수정
- `keyword_detected` - 키워드 감지
- `skill_activated` / `skill_invoked` - Skill 활성화
- `mode_change` - 모드 변경
- `hook_fire` / `hook_result` - Hook 실행

### MCP Tools로 조회

```
trace_timeline(sessionId?, limit?) → 시간순 이벤트 목록
trace_summary(sessionId?)          → 집계 통계
session_search(query, since?)      → 세션 히스토리 검색
```

## 7. Subagent Tracking

파일: `.omc/state/subagent-tracking.json`

```json
{
  "agents": [
    {
      "agent_type": "oh-my-claudecode:executor",
      "status": "running",
      "started_at": "...",
      "task_description": "Fix auth module"
    }
  ],
  "total_spawned": 10,
  "total_completed": 7,
  "total_failed": 1
}
```

PreToolUse hook에서 이 데이터를 읽어 "Active agents: N" 정보를 context에 주입한다.

## 8. Staleness 관리

### Mode State Staleness

```javascript
const STALE_STATE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2시간
function isStaleState(state) {
  const lastChecked = new Date(state.last_checked_at).getTime();
  const startedAt = new Date(state.started_at).getTime();
  const mostRecent = Math.max(lastChecked, startedAt);
  return Date.now() - mostRecent > STALE_STATE_THRESHOLD_MS;
}
```

2시간 이상 업데이트되지 않은 state는 stale로 간주. 새 세션에서 이전 세션의 stale state가 stop을 차단하지 않도록 한다.

### Skill Active State Staleness

Skill별로 다른 TTL:
```javascript
const SKILL_PROTECTION_CONFIGS = {
  light:  { staleTtlMs: 5 * 60 * 1000 },   // 5분
  medium: { staleTtlMs: 15 * 60 * 1000 },   // 15분
  heavy:  { staleTtlMs: 30 * 60 * 1000 },   // 30분
};
```

### Stop Breaker TTL

Circuit breaker 파일에도 TTL:
```javascript
const TEAM_PIPELINE_STOP_BLOCKER_TTL_MS = 5 * 60 * 1000;  // 5분
const RALPLAN_STOP_BLOCKER_TTL_MS = 45 * 60 * 1000;        // 45분
```

## 9. Atomic Write 패턴

`src/lib/atomic-write.ts`:

```typescript
export function atomicWriteJsonSync(filePath: string, data: unknown): void {
  const tmpPath = filePath + '.tmp.' + process.pid + '.' + Date.now();
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmpPath, filePath);
}
```

tmp 파일에 먼저 쓰고 rename으로 교체하여 partial write를 방지한다. 여러 hook script에서도 동일한 패턴 사용:

```javascript
const tmpFile = `${STATE_FILE}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}`;
writeFileSync(tmpFile, JSON.stringify(stats, null, 2));
renameSync(tmpFile, STATE_FILE);
```

## 10. Worktree 경로 해석

`src/lib/worktree-paths.ts`:

Git worktree 환경에서 올바른 `.omc/` 경로를 해석한다. 주요 함수:
- `resolveToWorktreeRoot()` - worktree 루트 경로 해석
- `getOmcRoot()` - .omc/ 디렉토리 경로
- `resolveStatePath()` - state 파일 경로
- `resolveSessionStatePath()` - 세션별 state 경로
- `getWorktreeNotepadPath()` - notepad 경로
- `getWorktreeProjectMemoryPath()` - project memory 경로
- `validateWorkingDirectory()` - 작업 디렉토리 검증
