# Claude Code Hooks — Event Reference

> 실험 검증 완료: 2026-04-06 / Claude Code v2.1.92
> 실험 환경: macOS Darwin 25.3.0, Node 20+, `claude -p` CLI 모드

## 공통 필드 (모든 이벤트)

| 필드 | 타입 | 설명 |
|------|------|------|
| `session_id` | `string` (UUID) | 세션 고유 ID. `claude -p` 호출마다 새로 생성됨 |
| `transcript_path` | `string` (절대경로) | 세션 전체 대화 로그 파일 (.jsonl) |
| `cwd` | `string` (절대경로) | 현재 작업 디렉토리. symlink resolved (`/tmp` → `/private/tmp`) |
| `hook_event_name` | `string` | 이벤트 이름. **항상 존재함** (과거 gate.ts:554 주석은 더 이상 유효하지 않음) |

## 공통 필드 (도구/응답 관련 이벤트)

`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`에 추가:

| 필드 | 타입 | 설명 |
|------|------|------|
| `permission_mode` | `string` | 현재 권한 모드. `"default"`, `"plan"`, `"auto"`, `"acceptEdits"`, `"dontAsk"`, `"bypassPermissions"` |

---

## 1. SessionStart

세션이 시작되거나 재개될 때 발생.

| 필드 | 타입 | 값 예시 | 설명 |
|------|------|---------|------|
| `session_id` | string | `"ba6fd6d1-..."` | |
| `transcript_path` | string | `"~/.claude/projects/.../xxx.jsonl"` | |
| `cwd` | string | `"/private/tmp/hook-probe-test"` | |
| `hook_event_name` | string | `"SessionStart"` | |
| `source` | string | `"startup"` | 시작 유형 |

### `source` 값

| 값 | 의미 |
|----|------|
| `startup` | 새 세션 시작 |
| `resume` | 기존 세션 재개 |
| `clear` | `/clear` 명령 후 재시작 |
| `compact` | 컨텍스트 압축 후 재시작 |

### Matcher

`source` 값으로 매칭. `"*"` = 모든 시작 유형.

```json
{"matcher": "startup", "hooks": [...]}
{"matcher": "resume", "hooks": [...]}
```

### 특수 기능: 환경변수 주입

`$CLAUDE_ENV_FILE` 경로에 `export KEY=VALUE` 형식으로 쓰면 세션에 환경변수 주입:

```bash
echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"
```

---

## 2. SessionEnd

세션이 종료될 때 발생.

| 필드 | 타입 | 값 예시 | 설명 |
|------|------|---------|------|
| `session_id` | string | | |
| `transcript_path` | string | | |
| `cwd` | string | | |
| `hook_event_name` | string | `"SessionEnd"` | |
| `reason` | string | `"other"` | 종료 사유 |

### `reason` 값

| 값 | 의미 |
|----|------|
| `clear` | `/clear` 명령 |
| `resume` | 다른 세션으로 전환 |
| `logout` | 인증 만료/로그아웃 |
| `other` | 기타 (CLI 종료, Ctrl+C 등) |

### Matcher

`reason` 값으로 매칭.

### 주의

- `permission_mode` 없음 — SessionEnd 시점에는 이미 세션 컨텍스트 해제됨

---

## 3. UserPromptSubmit

사용자 프롬프트가 제출된 직후, Claude가 처리하기 전에 발생.

| 필드 | 타입 | 값 예시 | 설명 |
|------|------|---------|------|
| `session_id` | string | | |
| `transcript_path` | string | | |
| `cwd` | string | | |
| `permission_mode` | string | `"default"` | |
| `hook_event_name` | string | `"UserPromptSubmit"` | |
| `prompt` | string | `"README.md 파일을 읽고..."` | 사용자가 입력한 전체 프롬프트 |

### 팀 에이전트와 UserPromptSubmit (실험 검증)

팀 에이전트의 `SendMessage`가 메인 세션에 도착하면 **UserPromptSubmit으로 발화됨.** `agent_id`는 포함되지 않음.

`prompt` 필드에 `<teammate-message>` 태그로 감싸져 도착:

```
<teammate-message teammate_id="explorer" color="blue">
README.md 파일을 찾아서 읽었습니다.
파일 내용: # Hook Probe Test
</teammate-message>
```

추가로 idle 알림, shutdown 응답도 동일 형식:
```
<teammate-message teammate_id="explorer" color="blue">
{"type":"idle_notification","from":"explorer"}
</teammate-message>
```

```
<teammate-message teammate_id="explorer" color="blue">
{"type":"shutdown_approved","requestId":"shutdown-...@explorer"}
</teammate-message>
```

**중요:** 팀 모드에서는 단일 사용자 프롬프트에 대해 UserPromptSubmit이 여러 번 발생할 수 있음 (실험에서 5회 관측). 훅에서 `<teammate-message>` 태그 유무로 사용자 입력과 팀 메시지를 구분할 수 있음.

### 제어 가능 동작

- `decision: "block"` + `reason` → 프롬프트 처리 차단
- `additionalContext` → Claude에게 추가 컨텍스트 주입 (최대 10,000자)

### Matcher

Notification 타입 문자열. 일반적으로 `"*"` 사용.

---

## 4. PreToolUse

도구가 실행되기 직전에 발생. **에이전트 내부 도구 호출에도 발생.**

| 필드 | 타입 | 값 예시 | 설명 |
|------|------|---------|------|
| `session_id` | string | | |
| `transcript_path` | string | | |
| `cwd` | string | | |
| `permission_mode` | string | `"default"` | |
| `hook_event_name` | string | `"PreToolUse"` | |
| `tool_name` | string | `"Read"`, `"Bash"`, `"Agent"` | 도구 이름 |
| `tool_input` | object | `{"file_path": "..."}` | 도구에 전달되는 입력 파라미터 |
| `tool_use_id` | string | `"toolu_01Dgh..."` | 도구 호출 고유 ID |
| `agent_id` | string? | `"ad388359154fe765c"` | **에이전트 내부 호출 시에만 존재** |
| `agent_type` | string? | `"Explore"` | **에이전트 내부 호출 시에만 존재** |

### 에이전트 컨텍스트 동작 (핵심)

```
메인 세션에서 Agent 도구 호출:
  → PreToolUse { tool_name: "Agent", agent_id: 없음 }

에이전트 내부에서 Bash 호출:
  → PreToolUse { tool_name: "Bash", agent_id: "ad388...", agent_type: "Explore" }

에이전트 내부에서 Glob 호출:
  → PreToolUse { tool_name: "Glob", agent_id: "ad388...", agent_type: "Explore" }

팀 에이전트 내부��서 Glob 호출:
  → PreToolUse { tool_name: "Glob", agent_id: "a391d...", agent_type: "explorer" }
  (agent_type = Agent 도구의 name 파라미터 값. team_name은 미포함)

팀 에이전트가 SendMessage로 메인에 보고:
  → PreToolUse { tool_name: "SendMessage", agent_id: "a391d...", agent_type: "explorer" }

메인 세션에서 팀 에이전트에게 SendMessage:
  → PreToolUse { tool_name: "SendMessage", agent_id: 없음 }
```

### 서브에이전트 vs 팀 에이��트 차이 (PreToolUse 관점)

| 항목 | 서브에이전트 | 팀 에이전트 |
|------|-------------|------------|
| `agent_type` 값 | `subagent_type` 값 (예: `"Explore"`) | `name` 파라미터 값 (예: `"explorer"`) |
| `team_name` 필드 | 없음 | **없음** (훅에 전달 안 됨) |
| 내부 도구 | Read, Bash, Glob 등 | 동일 + `SendMessage` |
| 메인 통신 | Agent PostToolUse로 결과 반환 | `SendMessage` → `UserPromptSubmit`로 도착 |

### tool_input 예시 (도구별)

**Read:**
```json
{"file_path": "/private/tmp/hook-probe-test/README.md"}
```

**Bash:**
```json
{"command": "echo hello", "description": "Print hello"}
```

**Agent (서브���이전트):**
```json
{
  "description": "프로젝트 구조 확인",
  "prompt": "이 프로젝트의 파일 목록을 확인해줘",
  "subagent_type": "Explore"
}
```

**Agent (팀 에이전트):**
```json
{
  "description": "Read README.md file",
  "prompt": "README.md 파일을 찾아서 읽어줘",
  "subagent_type": "Explore",
  "name": "explorer",
  "team_name": "probe-team"
}
```

**TeamCreate:**
```json
{
  "team_name": "probe-team",
  "description": "Probe team for reading README.md"
}
```

**SendMessage (에이전트 → 메인):**
```json
{
  "to": "team-lead",
  "summary": "README.md 파일 ��기 완료",
  "message": "파일 내용: # Hook Probe Test"
}
```

**SendMessage (메인 → 에이전트, shutdown):**
```json
{
  "to": "explorer",
  "summary": "Shutdown request",
  "message": {"type": "shutdown_request", "reason": "Task completed"},
  "type": "shutdown_request"
}
```

**Edit:**
```json
{"file_path": "/path/to/file", "old_string": "...", "new_string": "..."}
```

**Write:**
```json
{"file_path": "/path/to/file", "content": "..."}
```

**Glob:**
```json
{"pattern": "**/*"}
```

**Grep:**
```json
{"pattern": "search term", "path": "/some/dir"}
```

**MCP 도구:**
```json
// tool_name: "mcp__plugin_claude-nexus_nx__nx_task_list"
{"status_filter": "pending"}
```

### Matcher

`tool_name` 문자열로 매칭. 정규식 지원.

```json
{"matcher": "Bash", "hooks": [...]}
{"matcher": "Edit|Write", "hooks": [...]}
{"matcher": "mcp__.*", "hooks": [...]}
{"matcher": "", "hooks": [...]}   // 빈 문자열 = 모든 도구
```

### 제어 가능 동작

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow|deny|ask|defer",
    "permissionDecisionReason": "이유",
    "updatedInput": {"command": "수정된 명령"}
  }
}
```

| 결정 | 효과 |
|------|------|
| `allow` | 권한 프롬프트 건너뜀 (deny 규칙은 여전히 적용) |
| `deny` | 도구 호출 차단, reason이 Claude에게 전달됨 |
| `ask` | 일반 권한 프롬프트 표시 |
| `defer` | 비대화형 모드 전용; 프로세스 종료 후 외부 재개 |

---

## 5. PostToolUse

도구가 성공적으로 완료된 후 발생.

| 필드 | 타입 | 값 예시 | 설명 |
|------|------|---------|------|
| `session_id` | string | | |
| `transcript_path` | string | | |
| `cwd` | string | | |
| `permission_mode` | string | `"default"` | |
| `hook_event_name` | string | `"PostToolUse"` | |
| `tool_name` | string | `"Read"` | |
| `tool_input` | object | | PreToolUse와 동일 |
| `tool_response` | object | | **도구별 응답 구조** (아래 참조) |
| `tool_use_id` | string | | |

### tool_response 구조 (도구별) — 실제 캡처

**Read 응답:**
```json
{
  "type": "text",
  "file": {
    "filePath": "/private/tmp/hook-probe-test/README.md",
    "content": "# Hook Probe Test\n",
    "numLines": 2,
    "startLine": 1,
    "totalLines": 2
  }
}
```

**Bash 응답:**
```json
{
  "stdout": "hello",
  "stderr": "",
  "interrupted": false,
  "isImage": false,
  "noOutputExpected": false
}
```

**Agent 응답 (PostToolUse에서 Agent 결과):**
```json
{
  "type": "text",
  "text": "에이전트의 최종 텍스트 응답..."
}
```

### Matcher

`tool_name`으로 매칭 (PreToolUse와 동일).

### 주의

- 에이전트 내부 도구 호출의 PostToolUse에도 `agent_id`, `agent_type` 포함 (PreToolUse와 동일)
- `tool_response`는 도구마다 완전히 다른 구조

---

## 6. PostToolUseFailure

도구 실행이 실패했을 때 발생. PostToolUse 대신 이것이 발생.

| 필드 | 타입 | 값 예시 | 설명 |
|------|------|---------|------|
| `session_id` | string | | |
| `transcript_path` | string | | |
| `cwd` | string | | |
| `permission_mode` | string | `"default"` | |
| `hook_event_name` | string | `"PostToolUseFailure"` | |
| `tool_name` | string | `"Read"` | |
| `tool_input` | object | `{"file_path": "..."}` | |
| `tool_use_id` | string | | |
| `error` | string | `"File does not exist. Note: your current working directory is /private/tmp/hook-probe-test."` | 에러 메시지 전체 |
| `is_interrupt` | boolean | `false` | 사용자 인터럽트(Ctrl+C)에 의한 실패인지 여부 |

### PostToolUse와의 차이

- `tool_response` 없음 → 대신 `error` 문자열
- `is_interrupt` 필드 추가
- `tool_input`은 동일하게 포함

### Matcher

`tool_name`으로 매칭.

---

## 7. SubagentStart

에이전트(서브에이전트)가 스폰될 때 발생.

| 필드 | 타입 | 값 예시 | 설명 |
|------|------|---------|------|
| `session_id` | string | `"80a56ee4-..."` | **부모 세션** ID |
| `transcript_path` | string | | 부모 세션 트랜스크립트 |
| `cwd` | string | | |
| `agent_id` | string | `"ad388359154fe765c"` | 에이전트 고유 ID (hex) |
| `agent_type` | string | `"Explore"` | 에이전트 타입명 |
| `hook_event_name` | string | `"SubagentStart"` | |

### 없는 필드

- `permission_mode` 없음
- `tool_input` 없음 — Agent 도구의 입력(prompt, description 등)은 여기 포함 안 됨
- `team_name` 없음 — 팀 에이전트라도 이 이벤트에서는 team_name 미포함 **(실험 검증됨)**

### 서브에이전트 vs 팀 에이전트의 `agent_type` 차이

| 스폰 방식 | `agent_type` 값 | 예시 |
|-----------|-----------------|------|
| 서브에이전트 (`Agent(subagent_type=...)`) | `subagent_type` 값 | `"Explore"`, `"Plan"` |
| 팀 에이전트 (`Agent(name=..., team_name=...)`) | `name` 파라미터 값 | `"explorer"`, `"architect"` |

**주의:** 팀 에이전트에서 `agent_type`이 소문자 `name`을 따르므로, matcher에서 팀 에이전트를 잡으려면 `name` 값을 사용해야 함.

### Matcher

`agent_type` 값으로 매칭.

```json
{"matcher": "Explore", "hooks": [...]}
{"matcher": "claude-nexus:engineer", "hooks": [...]}
{"matcher": "*", "hooks": [...]}
```

### 제어 가능 동작

`additionalContext`로 에이전트에게 추가 지시사항 주입 가능:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SubagentStart",
    "additionalContext": "이 에이전트에게 전달할 추가 지시"
  }
}
```

---

## 8. SubagentStop

에이전트가 완료되었을 때 발생.

| 필드 | 타입 | 값 예시 | 설명 |
|------|------|---------|------|
| `session_id` | string | | 부모 세션 ID |
| `transcript_path` | string | | 부모 세션 트랜스크립트 |
| `cwd` | string | | |
| `permission_mode` | string | `"default"` | |
| `agent_id` | string | `"ad388359154fe765c"` | |
| `agent_type` | string | `"Explore"` | |
| `hook_event_name` | string | `"SubagentStop"` | |
| `stop_hook_active` | boolean | `false` | Stop 훅이 이미 활성 상태인지 |
| `agent_transcript_path` | string | `"~/.claude/projects/.../subagents/agent-ad388...jsonl"` | **에이전트 전용 대화 로그** |
| `last_assistant_message` | string | (에이전트의 마지막 응답 전문) | 에이전트가 부모에게 반환한 최종 메시지 |

### SubagentStart와 비교

| 필드 | Start | Stop |
|------|-------|------|
| `permission_mode` | X | O |
| `stop_hook_active` | X | O |
| `agent_transcript_path` | X | O |
| `last_assistant_message` | X | O |

### `agent_transcript_path` 경로 형식

```
{부모 transcript 디렉토리}/subagents/agent-{agent_id}.jsonl
```

이 파일을 읽으면 에이전트가 어떤 도구를 호출했는지, 무슨 대화를 했는지 전체 추적 가능.

### Matcher

`agent_type` 값으로 매칭 (SubagentStart와 동일).

---

## 9. Stop

Claude가 응답을 완료했을 때 발생.

| 필드 | 타입 | 값 예시 | 설명 |
|------|------|---------|------|
| `session_id` | string | | |
| `transcript_path` | string | | |
| `cwd` | string | | |
| `permission_mode` | string | `"default"` | |
| `hook_event_name` | string | `"Stop"` | |
| `stop_hook_active` | boolean | `false` | 이전 Stop 훅이 continue를 반환하여 다시 Stop된 경우 `true` |
| `last_assistant_message` | string | (Claude의 마지막 응답 전문) | 마크다운 포함 |

### 무한 루프 방지

Stop 훅이 `continue: true`를 반환하면 Claude가 다시 작업 → 다시 Stop → 다시 훅... 무한 루프 위험.
`stop_hook_active: true`일 때는 pass하여 루프 방지:

```js
if (event.stop_hook_active) {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}
```

### 제어 가능 동작

- `decision: "block"` → Claude가 멈추지 않고 계속 작업하도록 강제
- `additionalContext` → 추가 지시 주입

---

## 10. Notification

Claude Code가 알림을 보낼 때 발생. (미실험 — 문서 기반)

| 필드 | 타입 | 설명 |
|------|------|------|
| `session_id` | string | |
| `transcript_path` | string | |
| `cwd` | string | |
| `hook_event_name` | string | `"Notification"` |
| `message` | string | 알림 본문 |
| `title` | string | 알림 제목 |
| `notification_type` | string | 알림 유형 |

### Matcher

`notification_type` 값으로 매칭:
- `permission_prompt` — 권한 승인 대기
- `idle_prompt` — 입력 대기
- `auth_success` — 인증 성공

---

## 11. PreCompact / PostCompact

컨텍스트 압축 전후에 발생. (미실험 — 문서 기반)

| 필드 | 타입 | 설명 |
|------|------|------|
| `session_id` | string | |
| `transcript_path` | string | |
| `cwd` | string | |
| `hook_event_name` | string | `"PreCompact"` 또는 `"PostCompact"` |

### Matcher

트리거 유형: `"manual"` (사용자 `/compact`), `"auto"` (자동 압축).

### 특수 기능

SessionStart와 마찬가지로 `$CLAUDE_ENV_FILE`에 환경변수 주입 가능.

---

## 미실험 이벤트 (문서 기반)

| Event | Matcher 대상 | 주요 필드 |
|-------|-------------|----------|
| `InstructionsLoaded` | load reason (`session_start`, `nested_traversal`, `include`, `compact`) | |
| `PermissionRequest` | tool_name | `tool_name`, `tool_input`, `permission_suggestions` |
| `PermissionDenied` | tool_name | `tool_name`, `tool_input` |
| `StopFailure` | error type (`rate_limit`, `authentication_failed`, `server_error`) | |
| `CwdChanged` | 없음 | `previous_cwd` |
| `FileChanged` | filename (basename) | `file_path`, `file_name`, `change_type` |
| `ConfigChange` | config source | `config_source`, `config_path` |
| `TaskCreated` | 없음 | |
| `TaskCompleted` | 없음 | |
| `TeammateIdle` | 없음 | |
| `Elicitation` | MCP server name | `mcp_server_name`, `tool_name`, `form_fields` |
| `ElicitationResult` | MCP server name | |
| `WorktreeCreate` | 없음 | |
| `WorktreeRemove` | 없음 | |
