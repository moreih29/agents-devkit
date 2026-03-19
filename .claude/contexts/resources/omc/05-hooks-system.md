# OMC Hooks System

## 1. Hook 등록 구조

`hooks/hooks.json`에서 11개 event type에 대한 hook을 등록한다. 모든 hook은 `run.cjs`를 통해 실행된다.

### Hook 실행 체인

```
Claude Code → hooks.json의 command 실행
  → node "$CLAUDE_PLUGIN_ROOT"/scripts/run.cjs "$CLAUDE_PLUGIN_ROOT"/scripts/{hook}.mjs
    → run.cjs가 process.execPath로 target script를 spawnSync
      → target script가 stdin에서 JSON 읽기
      → 처리 후 stdout으로 JSON 응답
```

### Hook I/O 프로토콜

**입력 (stdin):** Claude Code가 JSON을 전달. 포함 필드:
- `tool_name` / `toolName` - 도구 이름 (PreToolUse/PostToolUse)
- `tool_input` / `toolInput` - 도구 입력 파라미터
- `tool_response` / `toolOutput` - 도구 출력 (PostToolUse)
- `cwd` / `directory` - 작업 디렉토리
- `session_id` / `sessionId` - 세션 ID
- `prompt` - 사용자 프롬프트 (UserPromptSubmit)
- `transcript_path` - 대화 기록 파일 경로
- `stop_reason` / `stopReason` - 중단 이유 (Stop)

**출력 (stdout):** JSON 응답. 세 가지 형태:

```json
// 1. Context 주입 (system-reminder로 표시)
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "메시지"
  }
}

// 2. 조용히 통과
{ "continue": true, "suppressOutput": true }

// 3. Stop 차단 (Stop hook에서만)
{ "decision": "block", "reason": "계속 작업하세요" }
```

## 2. UserPromptSubmit Hooks

### keyword-detector.mjs

**목적:** 사용자 프롬프트에서 magic keyword를 감지하여 skill 호출을 유도한다.

**처리 흐름:**
1. `readStdin()` → JSON 파싱
2. `extractPrompt()` - data.prompt 또는 data.message.content 또는 parts에서 텍스트 추출
3. `sanitizeForKeywordDetection()` - 코드 블록, XML 태그, URL, 파일 경로 제거
4. Regex 매칭으로 키워드 감지 (14개 패턴)
5. `resolveConflicts()` - cancel이 감지되면 다른 모든 키워드 무시
6. `activateState()` - ralph/ultrawork/autopilot 등의 state 파일 생성
7. `createSkillInvocation()` 또는 `createMultiSkillInvocation()` - 호출 지시 생성

**State 파일 생성 (activateState):**
```javascript
// 세션 격리 경로
const sessionDir = join(directory, '.omc', 'state', 'sessions', sessionId);
writeFileSync(join(sessionDir, `${stateName}-state.json`), JSON.stringify(state));
```

**Ralph state 예시:**
```json
{
  "active": true,
  "iteration": 1,
  "max_iterations": 100,
  "started_at": "2026-03-19T...",
  "prompt": "fix all tests",
  "session_id": "abc-123",
  "linked_ultrawork": true
}
```

**Anti-Slop 감지 로직:**
```javascript
function isAntiSlopCleanupRequest(text) {
  return ANTI_SLOP_EXPLICIT_PATTERN.test(text) ||        // ai-slop, deslop 등
    (ANTI_SLOP_ACTION_PATTERN.test(text) &&              // cleanup, refactor 등
     ANTI_SLOP_SMELL_PATTERN.test(text));                // duplicate, dead code 등
}
```

### skill-injector.mjs

**목적:** 학습된 skill 파일을 프롬프트 trigger에 기반하여 context에 주입한다.

**Bridge 패턴:** 빌드된 `dist/hooks/skill-bridge.cjs`를 우선 사용하고, 없으면 fallback 구현 사용.

## 3. PreToolUse Hook

### pre-tool-enforcer.mjs

**목적:** 매 도구 실행 전에 contextual reminder를 주입한다.

**주요 기능:**

1. **도구별 리마인더 메시지:**
```javascript
const messages = {
  TodoWrite: 'Mark todos in_progress BEFORE starting, completed IMMEDIATELY after finishing.',
  Bash: 'Use parallel execution for independent tasks. Use run_in_background for long operations.',
  Edit: 'Verify changes work after editing. Test functionality before marking complete.',
  Read: 'Read multiple files in parallel when possible for faster analysis.',
};
```

2. **Agent Spawn 시 정보 주입:**
- agent type, model, description 표시
- Active agents 수 표시
- Team routing 강제: team 활성 시 team_name 없는 Task 호출 차단

3. **Context Guard:**
```javascript
const PREFLIGHT_CONTEXT_THRESHOLD = 72; // %
if (contextPercent >= PREFLIGHT_CONTEXT_THRESHOLD) {
  return { decision: 'block', reason: 'Preflight context guard: N% used...' };
}
```
transcript 파일에서 context_window/input_tokens를 추출하여 context 사용량 추정.

4. **Skill Active State 기록:**
Skill tool 호출 시 `skill-active-state.json`을 생성하여 Stop hook에서 skill 실행 중 중단을 방지.

5. **OMC_QUIET 레벨:**
- 0: 모든 메시지 표시
- 1: Bash, Edit, Write, Read, Grep, Glob 메시지 생략
- 2: TodoWrite, agent spawn 메시지도 생략

## 4. PostToolUse Hook

### post-tool-verifier.mjs

**목적:** 도구 실행 결과를 분석하고 contextual guidance를 제공한다.

**주요 기능:**

1. **Bash 실패 감지:**
```javascript
export function detectBashFailure(output) {
  const errorPatterns = [
    /error:/i, /failed/i, /cannot/i, /permission denied/i,
    /command not found/i, /no such file/i, /fatal:/i, /abort/i,
  ];
  return errorPatterns.some(pattern => pattern.test(cleaned));
}
```

2. **Non-zero exit with valid output 감지 (issue #960):**
`gh pr checks`가 exit 8 (pending)을 반환하지만 유효한 CI 상태를 출력하는 경우 등을 처리.

3. **Agent output 트렁케이션:**
```javascript
const AGENT_OUTPUT_ANALYSIS_LIMIT = 12000; // chars
// 초과 시 트렁케이션하고 context safety 경고 추가
```

4. **`<remember>` 태그 처리:**
```javascript
// <remember>content</remember> → Working Memory에 추가
// <remember priority>content</remember> → Priority Context에 설정
const priorityRegex = /<remember\s+priority>([\s\S]*?)<\/remember>/gi;
const regularRegex = /<remember>([\s\S]*?)<\/remember>/gi;
```

5. **Bash history 기록:**
Bash 도구 실행 명령어를 `~/.bash_history`에 추가 (Unix만, 설정으로 비활성화 가능).

6. **세션 통계 업데이트:**
`~/.claude/.session-stats.json`에 도구별 호출 횟수 기록.

## 5. Stop Hook

### persistent-mode.cjs

**목적:** 활성 모드가 있으면 Claude Code의 중단을 차단하여 작업을 계속하게 한다. **가장 중요한 hook.**

**우선순위 기반 처리 (9단계):**

```
Priority 1: Ralph Loop (명시적 persistence)
  → iteration 증가, block 반환
  → max_iterations 도달 시 10회씩 자동 연장
Priority 2: Autopilot (최대 20회 reinforcement)
Priority 2.5: Team Pipeline (circuit breaker: 20회, 5분 TTL)
Priority 2.6: Ralplan (circuit breaker: 30회, 45분 TTL)
Priority 3: Ultrapilot (최대 20회)
Priority 4: Swarm (최대 15회)
Priority 5: Pipeline (최대 15회)
Priority 6: Team (fallback, 최대 20회)
Priority 6.5: OMC Teams (tmux workers, 최대 20회)
Priority 7: UltraQA (cycle 증가)
Priority 8: Ultrawork (최대 50회, 이후 비활성화)
Priority 9: Skill Active State (protection level별 reinforcement)
```

**즉시 허용하는 경우 (block 안 함):**
1. Context limit stop (context_limit, token_limit 등)
2. Context 사용량 95% 이상 (transcript에서 추정)
3. User abort (Ctrl+C, cancel)
4. Authentication error (401, 403, token expired)
5. Cancel signal 감지 (cancel-signal-state.json, 30초 TTL)

**Staleness 체크:**
```javascript
const STALE_STATE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2시간
function isStaleState(state) {
  const mostRecent = Math.max(last_checked_at, started_at);
  return Date.now() - mostRecent > STALE_STATE_THRESHOLD_MS;
}
```
2시간 이상 업데이트되지 않은 state는 비활성으로 간주하여 새 세션에서 stale state가 block을 유발하지 않도록 한다.

**Session 격리:**
```javascript
function isSessionMatch(state, sessionId) {
  if (sessionId) return state.session_id === sessionId;  // 정확한 매칭
  return !state.session_id;  // legacy: session_id 없는 state만 매칭
}
```

**Stop Breaker (Circuit Breaker):**
Team pipeline과 Ralplan에는 circuit breaker가 있어 무한 block을 방지:
```javascript
const TEAM_PIPELINE_STOP_BLOCKER_MAX = 20;
const TEAM_PIPELINE_STOP_BLOCKER_TTL_MS = 5 * 60 * 1000;
// count가 max를 초과하면 breaker가 trip되어 stop 허용
```

### context-guard-stop.mjs
Context 사용량 체크를 Stop event에서도 수행.

### code-simplifier.mjs
Stop 시 코드 품질 체크를 수행.

## 6. SessionStart Hook

### session-start.mjs

**목적:** 세션 시작 시 상태를 복원하고 각종 초기화를 수행한다.

**수행 작업:**
1. **Version drift 감지** - plugin, npm, CLAUDE.md 버전 불일치 경고
2. **npm 업데이트 확인** - 24시간 캐시로 registry 확인
3. **HUD 설치 상태 확인** - 미설치 시 안내 메시지
4. **Ultrawork/Ralph 상태 복원** - 세션 격리하여 이전 상태 복원 (재개 유도가 아닌 "context only" 알림)
5. **미완료 todo 감지** - 프로젝트 로컬 todo만 (글로벌 ~/.claude/todos/ 무시)
6. **Notepad Priority Context 주입** - `.omc/notepad.md`의 Priority Context를 주입
7. **Plugin cache 정리** - 오래된 버전을 symlink로 대체 (최신 2개 유지)
8. **세션 시작 알림** (fire-and-forget)
9. **Reply listener daemon 시작** (알림 시스템)

### project-memory-session.mjs
프로젝트 메모리 초기화/업데이트.

### setup-init.mjs (matcher: "init")
초기 설정 수행 (최초 실행 시).

### setup-maintenance.mjs (matcher: "maintenance")
유지보수 작업 (60초 timeout).

## 7. SubagentStart/Stop Hooks

### subagent-tracker.mjs

**목적:** Agent spawn/완료를 추적하여 `.omc/state/subagent-tracking.json`에 기록한다.

```javascript
// start: processSubagentStart(data)
// stop: processSubagentStop(data)
// → dist/hooks/subagent-tracker/index.js에서 구현
```

**추적 데이터:**
```json
{
  "agents": [{ "agent_type": "oh-my-claudecode:executor", "status": "running", ... }],
  "total_spawned": 5,
  "total_completed": 3,
  "total_failed": 1
}
```

### verify-deliverables.mjs (SubagentStop)
Agent 완료 시 산출물 검증.

## 8. PreCompact Hook

### pre-compact.mjs
Compact 전에 중요 상태를 보존한다.

### project-memory-precompact.mjs
Compact 전에 프로젝트 메모리를 저장한다.

## 9. SessionEnd Hook

### session-end.mjs
세션 종료 시 cleanup 수행 (10초 timeout).

## 10. PermissionRequest Hook

### permission-handler.mjs (matcher: "Bash")
Bash 도구의 권한 요청을 처리한다.

## 11. PostToolUseFailure Hook

### post-tool-use-failure.mjs
도구 실행 실패 시 처리.

## 12. "The Boulder Never Stops" 패턴

OMC의 핵심 persistence 메커니즘:

```
keyword-detector → state 파일 생성 (ralph-state.json: active=true)
  ↓
pre-tool-enforcer → "The boulder never stops. Continue until all tasks complete."
  ↓
Claude Code가 작업 수행
  ↓
Claude Code가 stop 시도
  ↓
persistent-mode.cjs → state 확인 → active=true
  → decision: "block", reason: "[RALPH LOOP - ITERATION 2/100] Work is NOT done."
  → iteration++ , last_checked_at 업데이트
  ↓
Claude Code가 block을 받고 계속 작업
  ↓
(반복)
  ↓
/oh-my-claudecode:cancel 실행
  → state_clear() → cancel-signal-state.json 생성 (30초 TTL)
  → state 파일 삭제
  ↓
persistent-mode.cjs → cancel signal 감지 → continue: true (stop 허용)
```
