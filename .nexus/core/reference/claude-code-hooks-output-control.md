# Claude Code Hooks — Output & Control Reference

> 실험 검증 완료: 2026-04-06 / Claude Code v2.1.92

훅 스크립트가 stdout으로 반환하는 JSON과 exit code로 Claude Code의 동작을 제어하는 방법.

---

## Exit Code

| Exit Code | 의미 | 효과 |
|-----------|------|------|
| `0` | 성공 | stdout JSON 파싱하여 적용 |
| `2` | 차단 에러 | stderr가 Claude/사용자에게 표시. 동작 차단 |
| 기타 (1, 3, ...) | 비차단 에러 | stderr는 verbose 모드에서만 표시. 동작 계속 |

---

## 공통 출력 필드

모든 이벤트에서 사용 가능한 JSON 필드:

```json
{
  "continue": true,
  "additionalContext": "Claude에게 주입할 텍스트 (최대 10,000자)",
  "decision": "block",
  "reason": "차단 사유 (decision=block일 때)",
  "suppressOutput": false,
  "systemMessage": "사용자에게 표시할 경고 메시지"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `continue` | boolean | `true`면 정상 진행 |
| `additionalContext` | string | Claude 컨텍스트에 주입. **최대 10,000자** — 초과 시 파일로 저장 후 경로 표시 |
| `decision` | string | `"block"` 시 동작 차단 |
| `reason` | string | 차단 사유. decision=block일 때 Claude에게 전달 |
| `suppressOutput` | boolean | `true`면 훅 출력을 숨김 |
| `systemMessage` | string | 사용자 UI에 경고/안내 표시 |

---

## 이벤트별 제어 상세

### PreToolUse — 도구 실행 제어

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "rm -rf는 허용되지 않습니다",
    "updatedInput": {
      "command": "수정된 명령"
    }
  }
}
```

| 필드 | 값 | 효과 |
|------|-----|------|
| `permissionDecision` | `"allow"` | 권한 프롬프트 건너뜀. **주의: deny 규칙은 여전히 우선** |
| | `"deny"` | 도구 호출 차단. `permissionDecisionReason`이 Claude에게 에러로 전달 |
| | `"ask"` | 일반 권한 프롬프트 표시 (기본 동작) |
| | `"defer"` | 비대화형 모드 전용. 프로세스 종료 후 외부에서 재개 |
| `updatedInput` | object | 도구 입력 파라미터 수정. 예: Bash command 변경 |

**실전 패턴 — Nexus gate.ts:**
```js
// tasks.json 없으면 Edit/Write 차단
respond({
  decision: 'block',
  reason: 'No tasks.json found. Register tasks first.',
});
```

### PostToolUse — 사후 처리

```json
{
  "decision": "block",
  "reason": "차단 사유",
  "additionalContext": "Claude에게 추가 정보"
}
```

- `decision: "block"` → 추가 처리 차단
- `additionalContext` → 결과에 덧붙일 정보

### UserPromptSubmit — 프롬프트 제어

```json
{
  "decision": "block",
  "reason": "이 프롬프트는 처리할 수 없습니다"
}
```

또는 컨텍스트 주입만:

```json
{
  "continue": true,
  "additionalContext": "<nexus>Meet mode activated. Start with nx_meet_start.</nexus>"
}
```

**실전 패턴 — Nexus gate.ts:**
```js
// [meet] 태그 감지 시 미팅 모드 컨텍스트 주입
respond({
  continue: true,
  additionalContext: '<nexus>Meet mode — existing session found...</nexus>',
});
```

### Stop — 계속 작업 강제

```json
{
  "continue": true,
  "additionalContext": "아직 3개 태스크가 남아있습니다. 완료해주세요."
}
```

또는 차단 방식:

```json
{
  "decision": "block",
  "reason": "테스트가 실패 중입니다. 계속 작업하세요."
}
```

**무한 루프 방지:**
```js
const event = JSON.parse(stdin);
if (event.stop_hook_active) {
  // 이전 Stop 훅이 continue를 반환하여 다시 Stop됨 → 이번엔 통과
  respond({ continue: true });
  return;
}
```

### SubagentStart — 에이전트 컨텍스트 주입

```json
{
  "continue": true,
  "additionalContext": "이 에이전트는 반드시 TypeScript를 사용해야 합니다."
}
```

### SubagentStop — 에이전트 결과 후처리

```json
{
  "continue": true,
  "additionalContext": "에이전트 결과를 검토해주세요."
}
```

### PermissionRequest — 권한 자동 승인

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedInput": {},
      "updatedPermissions": [
        {
          "type": "addRules",
          "mode": "default",
          "destination": "session"
        }
      ]
    }
  }
}
```

### PermissionDenied — 재시도

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionDenied",
    "retry": true
  }
}
```

---

## 훅 설정 구조

### settings.json / settings.local.json

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "패턴 (정규식)",
        "hooks": [
          {
            "type": "command",
            "command": "스크립트 경로",
            "timeout": 5,
            "async": false,
            "if": "Bash(git *)"
          }
        ]
      }
    ]
  }
}
```

### 플러그인 hooks/hooks.json

```json
{
  "description": "플러그인 설명",
  "hooks": {
    "EventName": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "NEXUS_EVENT=EventName node \"$CLAUDE_PLUGIN_ROOT\"/scripts/gate.cjs",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### 훅 타입

| 타입 | 설명 | stdin | stdout |
|------|------|-------|--------|
| `command` | 셸 스크립트 실행 | JSON | JSON |
| `http` | HTTP POST | JSON body | JSON response |
| `prompt` | LLM 단일 평가 | - | `{"ok": true/false, "reason": "..."}` |
| `agent` | 서브에이전트 검증 | - | `{"ok": true/false, "reason": "..."}` |

### 훅 옵션

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `timeout` | number | - | 타임아웃 (초) |
| `async` | boolean | `false` | `true`면 백그라운드 실행 (블로킹 안 함) |
| `if` | string | - | 세분화 필터. `"Bash(git *)"` → git 명령만 |

---

## Matcher 패턴 참조

### 이벤트별 매칭 대상

| 이벤트 | 매칭 대상 | 예시 |
|--------|----------|------|
| PreToolUse / PostToolUse / PostToolUseFailure | `tool_name` | `"Bash"`, `"Edit\|Write"`, `"mcp__.*"` |
| SessionStart | `source` | `"startup"`, `"resume"`, `"compact"` |
| SessionEnd | `reason` | `"clear"`, `"other"` |
| SubagentStart / SubagentStop | `agent_type` | `"Explore"`, `"Plan"` |
| Notification | `notification_type` | `"permission_prompt"` |
| PreCompact / PostCompact | trigger type | `"manual"`, `"auto"` |
| StopFailure | error type | `"rate_limit"`, `"server_error"` |
| FileChanged | filename (basename) | `".env"`, `".envrc"` |
| ConfigChange | config source | `"user_settings"`, `"project_settings"` |
| InstructionsLoaded | load reason | `"session_start"`, `"compact"` |
| Elicitation / ElicitationResult | MCP server name | `"nexus"` |

### 특수 매칭

| 패턴 | 의미 |
|------|------|
| `""` (빈 문자열) | 모든 값 매칭 |
| `"*"` | 모든 값 매칭 (와일드카드) |
| `"Bash"` | 정확히 "Bash" |
| `"Edit\|Write"` | Edit 또는 Write |
| `"mcp__.*"` | 모든 MCP 도구 (정규식) |
| `"mcp__plugin_claude-nexus_nx__.*"` | Nexus MCP 도구만 |

### MCP 도구 이름 형식

```
mcp__{server}__{tool_name}
```

예시:
```
mcp__plugin_claude-nexus_nx__nx_task_list
mcp__plugin_claude-nexus_nx__nx_meet_start
mcp__plugin_context7_context7__resolve-library-id
mcp__plugin_playwright_playwright__browser_navigate
```

### `if` 필드 (세분화 필터)

v2.1.85+ 지원. matcher + 인자 조합 필터:

```json
{
  "matcher": "Bash",
  "hooks": [{
    "type": "command",
    "if": "Bash(git *)",
    "command": "check-git-policy.sh"
  }]
}
```

→ Bash 도구 중 `git`으로 시작하는 명령만 훅 실행.

---

## 설정 파일 우선순위

| 위치 | 범위 | 공유 가능 |
|------|------|----------|
| `~/.claude/settings.json` | 모든 프로젝트 | 로컬 전용 |
| `.claude/settings.json` | 단일 프로젝트 | git commit 가능 |
| `.claude/settings.local.json` | 단일 프로젝트 | gitignore됨 |
| 플러그인 `hooks/hooks.json` | 플러그인 활성 시 | 플러그인과 함께 배포 |
| 스킬/에이전트 frontmatter | 스킬 활성 중 | 컴포넌트 파일 내 |
| 관리 정책 설정 | 조직 전체 | 관리자 제어 |

**병합 규칙:** 모든 레벨의 훅이 병합되어 실행됨. 동일 이벤트의 훅은 병렬 실행.

---

## 실전 활용 패턴

### 1. 위험 명령 차단 (PreToolUse)

```bash
#!/bin/bash
COMMAND=$(cat | jq -r '.tool_input.command // ""')
if echo "$COMMAND" | grep -qE '^rm -rf|^git push.*--force'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"위험 명령 차단"}}'
  exit 0
fi
echo '{"continue":true}'
```

### 2. 자동 포맷팅 (PostToolUse)

```json
{
  "PostToolUse": [{
    "matcher": "Edit|Write",
    "hooks": [{
      "type": "command",
      "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write",
      "async": true
    }]
  }]
}
```

### 3. 에이전트 추적 (SubagentStart/Stop)

```bash
#!/bin/bash
EVENT=$(cat)
AGENT_ID=$(echo "$EVENT" | jq -r '.agent_id')
AGENT_TYPE=$(echo "$EVENT" | jq -r '.agent_type')
echo "$(date -Iseconds) $AGENT_TYPE $AGENT_ID started" >> /tmp/agent-log.txt
echo '{"continue":true}'
```

### 4. 태스크 완료 강제 (Stop)

```bash
#!/bin/bash
EVENT=$(cat)
STOP_ACTIVE=$(echo "$EVENT" | jq -r '.stop_hook_active')
if [ "$STOP_ACTIVE" = "true" ]; then
  echo '{"continue":true}'
  exit 0
fi
# tasks.json 확인 등 로직...
echo '{"continue":true,"additionalContext":"아직 남은 작업이 있습니다."}'
```

### 5. 컨텍스트 자동 주입 (UserPromptSubmit)

```bash
#!/bin/bash
EVENT=$(cat)
PROMPT=$(echo "$EVENT" | jq -r '.prompt')
if echo "$PROMPT" | grep -q '\[deploy\]'; then
  echo '{"continue":true,"additionalContext":"Deploy checklist: 1. Run tests 2. Build 3. Push"}'
  exit 0
fi
echo '{"continue":true}'
```

---

## 디버깅

### `/hooks` 명령

Claude Code 세션에서 `/hooks` 입력 → 등록된 훅 목록 인터랙티브 확인.

### 모든 훅 비활성화

```json
{
  "disableAllHooks": true
}
```

### 훅 로깅 (hook-probe.cjs)

`test/hook-probe.cjs` 사용:
```bash
# 프로젝트 settings.local.json에 추가 후
claude -p "테스트 명령"
ls /tmp/claude-hook-probe/
```

### 일반적 문제

| 문제 | 해결 |
|------|------|
| 훅 미실행 | `/hooks`로 등록 확인. matcher 대소문자 확인 |
| "command not found" | 절대 경로 사용 또는 `$CLAUDE_PROJECT_DIR` |
| "jq: command not found" | `brew install jq` |
| JSON 파싱 실패 | 셸 프로필의 무조건 `echo` 확인. `if [[ $- == *i* ]]`로 감싸기 |
| Stop 무한 루프 | `stop_hook_active` 체크 추가 |
