# Claude Code Hooks — Captured Examples

> 실험 일시: 2026-04-06 / Claude Code v2.1.92
> 실험 방법: `claude -p` CLI 모드에서 프롬프트 실행, hook-probe.cjs로 stdin JSON 캡처
> 실험 프로젝트: `/tmp/hook-probe-test` (git init된 임시 프로젝트)

---

## 시나리오 A: 기본 툴 호출

**프롬프트:** `"README.md 파일을 읽고, echo hello를 실행해줘"`
**허용 도구:** `Read, Bash`

### 캡처된 이벤트 순서

```
1. SessionStart   (세션 시작)
2. UserPromptSubmit (프롬프트 제출)
3. PreToolUse      (Read 호출 전)
4. PostToolUse     (Read 완료)
5. PreToolUse      (Bash 호출 전)
6. PostToolUse     (Bash 완료)
7. Stop            (응답 완료)
8. SessionEnd      (세션 종료)
```

### SessionStart

```json
{
  "session_id": "ba6fd6d1-be52-4048-ab43-1f429362f965",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/ba6fd6d1-be52-4048-ab43-1f429362f965.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "hook_event_name": "SessionStart",
  "source": "startup"
}
```

**관찰:**
- `cwd`가 symlink resolved 형태 (`/tmp` → `/private/tmp`)
- `transcript_path`에서 프로젝트 경로의 `/`가 `-`로 치환됨

### UserPromptSubmit

```json
{
  "session_id": "ba6fd6d1-be52-4048-ab43-1f429362f965",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/ba6fd6d1-be52-4048-ab43-1f429362f965.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "permission_mode": "default",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "README.md 파일을 읽고, echo hello를 실행해줘"
}
```

**관찰:**
- `prompt`에 사용자 입력 그대로 (인코딩 없음)
- `permission_mode`가 여기서부터 등장

### PreToolUse — Read

```json
{
  "session_id": "ba6fd6d1-be52-4048-ab43-1f429362f965",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/ba6fd6d1-be52-4048-ab43-1f429362f965.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Read",
  "tool_input": {
    "file_path": "/private/tmp/hook-probe-test/README.md"
  },
  "tool_use_id": "toolu_01DghpfSaCNPH2ZuZJc91CtT"
}
```

### PreToolUse — Bash

```json
{
  "session_id": "ba6fd6d1-be52-4048-ab43-1f429362f965",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/ba6fd6d1-be52-4048-ab43-1f429362f965.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "echo hello",
    "description": "Print hello"
  },
  "tool_use_id": "toolu_01KR3wo6AchFLtVB8vcr2zwr"
}
```

**관찰:**
- Bash의 `tool_input`에 `description` 포함 (Claude가 생성한 설명)

### PostToolUse — Read

```json
{
  "session_id": "ba6fd6d1-be52-4048-ab43-1f429362f965",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/ba6fd6d1-be52-4048-ab43-1f429362f965.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "permission_mode": "default",
  "hook_event_name": "PostToolUse",
  "tool_name": "Read",
  "tool_input": {
    "file_path": "/private/tmp/hook-probe-test/README.md"
  },
  "tool_response": {
    "type": "text",
    "file": {
      "filePath": "/private/tmp/hook-probe-test/README.md",
      "content": "# Hook Probe Test\n",
      "numLines": 2,
      "startLine": 1,
      "totalLines": 2
    }
  },
  "tool_use_id": "toolu_01DghpfSaCNPH2ZuZJc91CtT"
}
```

**관찰:**
- `tool_response.file.content`에 파일 전체 내용 포함
- `numLines`와 `totalLines` 차이로 부분 읽기 여부 판별 가능

### PostToolUse — Bash

```json
{
  "session_id": "ba6fd6d1-be52-4048-ab43-1f429362f965",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/ba6fd6d1-be52-4048-ab43-1f429362f965.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "permission_mode": "default",
  "hook_event_name": "PostToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "echo hello",
    "description": "Print hello"
  },
  "tool_response": {
    "stdout": "hello",
    "stderr": "",
    "interrupted": false,
    "isImage": false,
    "noOutputExpected": false
  },
  "tool_use_id": "toolu_01KR3wo6AchFLtVB8vcr2zwr"
}
```

**관찰:**
- `stdout`/`stderr` 분리됨
- `interrupted`: 사용자 Ctrl+C 여부
- `isImage`: 이미지 출력 여부 (screenshot 등)

### Stop

```json
{
  "session_id": "ba6fd6d1-be52-4048-ab43-1f429362f965",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/ba6fd6d1-be52-4048-ab43-1f429362f965.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "permission_mode": "default",
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "완료했습니다.\n\n- **README.md**: `# Hook Probe Test` 한 줄로 구성된 파일입니다.\n- **echo hello**: `hello`가 정상 출력되었습니다."
}
```

**관찰:**
- `last_assistant_message`에 마크다운 포함
- `stop_hook_active: false` — 첫 Stop 이벤트

### SessionEnd

```json
{
  "session_id": "ba6fd6d1-be52-4048-ab43-1f429362f965",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/ba6fd6d1-be52-4048-ab43-1f429362f965.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "hook_event_name": "SessionEnd",
  "reason": "other"
}
```

**관찰:**
- `claude -p` 종료 시 reason은 `"other"`
- `permission_mode` 없음

---

## 시나리오 B: Agent 스폰 + 내부 툴 호출

**프롬프트:** `"Explore 에이전트를 사용해서 이 프로젝트의 파일 목록을 확인해줘"`
**허용 도구:** `Agent, Read, Glob, Grep, Bash`

### 캡처된 이벤트 순서

```
1. SessionStart
2. UserPromptSubmit
3. PreToolUse        (Agent 호출 — 메인 세션)
4. SubagentStart     (Explore 에이전트 스폰)
5. PreToolUse        (Bash — 에이전트 내부, agent_id 포함)
6. PreToolUse        (Glob — 에이전트 내부, agent_id 포함)
7. PostToolUse       (Bash — 에이전트 내부)
8. PostToolUse       (Glob — 에이전트 내부)
9. SubagentStop      (Explore 완료)
10. PostToolUse      (Agent 완료 — 메인 세션)
11. Stop
12. SessionEnd
```

### PreToolUse — Agent 도구 (메인 세션)

```json
{
  "session_id": "80a56ee4-ec89-487d-83f0-0bf7fca6fe1b",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/80a56ee4-ec89-487d-83f0-0bf7fca6fe1b.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Agent",
  "tool_input": {
    "description": "프로젝트 파일 구조 탐색",
    "prompt": "이 프로젝트의 전체 파일 목록을 확인해줘. 디렉토리 구조와 파일 내용을 파악해.",
    "subagent_type": "Explore"
  },
  "tool_use_id": "toolu_01TtSGiPFwNpvSfKcvJPPPPb"
}
```

**관찰:**
- `agent_id` 없음 — Agent 도구를 호출하는 시점에는 아직 에이전트가 생성 전
- `tool_input`에 `description`, `prompt`, `subagent_type` 포함

### SubagentStart

```json
{
  "session_id": "80a56ee4-ec89-487d-83f0-0bf7fca6fe1b",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/80a56ee4-ec89-487d-83f0-0bf7fca6fe1b.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "agent_id": "ad388359154fe765c",
  "agent_type": "Explore",
  "hook_event_name": "SubagentStart"
}
```

**관찰:**
- `permission_mode` 없음
- `agent_id`는 hex 문자열 (17자)
- `tool_input`/`prompt` 없음 — Agent 도구의 입력은 PreToolUse에서만 접근 가능

### PreToolUse — Bash (에이전트 내부)

```json
{
  "session_id": "80a56ee4-ec89-487d-83f0-0bf7fca6fe1b",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/80a56ee4-ec89-487d-83f0-0bf7fca6fe1b.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "find . -not -path './.git/*' -type f | sort",
    "description": "List all files in the project"
  },
  "tool_use_id": "toolu_016fvahQUvGFKhFVJZqjR5HL",
  "agent_id": "ad388359154fe765c",
  "agent_type": "Explore"
}
```

**핵심 발견:**
- `agent_id`: `"ad388359154fe765c"` — SubagentStart와 동일한 ID
- `agent_type`: `"Explore"` — 어떤 종류의 에이전트가 호출했는지 식별 가능
- `session_id`: 부모 세션 ID와 동일 (에이전트 자체 session_id 아님)

### PreToolUse — Glob (에이전트 내부)

```json
{
  "session_id": "80a56ee4-ec89-487d-83f0-0bf7fca6fe1b",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/80a56ee4-ec89-487d-83f0-0bf7fca6fe1b.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Glob",
  "tool_input": {
    "pattern": "**/*"
  },
  "tool_use_id": "toolu_01JRXNqjxVkywkiSvKSqeEdq",
  "agent_id": "ad388359154fe765c",
  "agent_type": "Explore"
}
```

### SubagentStop

```json
{
  "session_id": "80a56ee4-ec89-487d-83f0-0bf7fca6fe1b",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/80a56ee4-ec89-487d-83f0-0bf7fca6fe1b.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "permission_mode": "default",
  "agent_id": "ad388359154fe765c",
  "agent_type": "Explore",
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/80a56ee4-ec89-487d-83f0-0bf7fca6fe1b/subagents/agent-ad388359154fe765c.jsonl",
  "last_assistant_message": "프로젝트의 전체 파일 목록을 정리한 결과입니다:\n\n## 파일 구조\n\n**루트 디렉토리:**\n- `.gitignore` - Git 무시 파일\n- `README.md` - 프로젝트 문서\n\n..."
}
```

**관찰:**
- `agent_transcript_path`: 에이전트 전용 대화 로그 경로
  - 형식: `{부모 transcript 디렉토리}/{부모 session_id}/subagents/agent-{agent_id}.jsonl`
- `last_assistant_message`: 에이전트의 마지막 응답 전문 (마크다운 포함)
- `stop_hook_active`: Stop 훅과 동일한 무한루프 방지 필드

---

## 시나리오 C: 도구 실패 (PostToolUseFailure)

**프롬프트:** `"존재하지 않는 /tmp/hook-probe-test/nonexistent.txt 파일을 Read로 읽어줘"`
**허용 도구:** `Read`

### 캡처된 이벤트 순서

```
1. SessionStart
2. UserPromptSubmit
3. PreToolUse          (Read 호출 전)
4. PostToolUseFailure  (Read 실패 — PostToolUse 대신)
5. Stop
6. SessionEnd
```

### PostToolUseFailure

```json
{
  "session_id": "475731a3-9e82-4818-814c-04d448652f88",
  "transcript_path": "/Users/kih/.claude/projects/-private-tmp-hook-probe-test/475731a3-9e82-4818-814c-04d448652f88.jsonl",
  "cwd": "/private/tmp/hook-probe-test",
  "permission_mode": "default",
  "hook_event_name": "PostToolUseFailure",
  "tool_name": "Read",
  "tool_input": {
    "file_path": "/tmp/hook-probe-test/nonexistent.txt"
  },
  "tool_use_id": "toolu_011x2sfucbvzWoRoBWuMzPnY",
  "error": "File does not exist. Note: your current working directory is /private/tmp/hook-probe-test.",
  "is_interrupt": false
}
```

**관찰:**
- `error` 문자열에 Claude Code의 친절한 힌트 메시지 포함
- `is_interrupt: false` — Ctrl+C가 아닌 정상 에러
- `tool_input.file_path`는 symlink resolve 안 됨 (`/tmp/...` 그대로)
  → `cwd`는 resolve 되지만, `tool_input`의 경로는 Claude가 입력한 그대로

---

## 시나리오 D: 팀 에이전트 (TeamCreate)

**프롬프트:** `"TeamCreate로 'probe-team' 팀 생성 후 Explore 에이전트를 team_name='probe-team'으로 스폰하여 README.md 읽기"`
**허용 도구:** `TeamCreate, TeamDelete, Agent, SendMessage, Read, Glob, Bash`

### 캡처된 이벤트 순서

```
1.  SessionStart
2.  UserPromptSubmit     (사용자 프롬프트)
3.  PreToolUse           (ToolSearch — 메인)
4.  PostToolUse          (ToolSearch 완료)
5.  PreToolUse           (TeamCreate — 메인)
6.  PostToolUse          (TeamCreate 완료)
7.  PreToolUse           (Agent with team_name — 메인)
8.  SubagentStart        (explorer 에이전트 스폰)
9.  PreToolUse           (Glob — 에이전트 내부, agent_id 포함)
10. PostToolUse          (Glob 완료)
11. PreToolUse           (Read — 에이전트 내부)
12. PostToolUse          (Read 완료)
13. PreToolUse           (SendMessage — 에이전트→team-lead)
14. PostToolUse          (SendMessage 완료)
15. SubagentStop         (explorer 완료)
16. PostToolUse          (Agent 완료 — 메인)
17. Stop                 (리드 중간 응답)
18. UserPromptSubmit     (<teammate-message> 도착)
19. PreToolUse           (SendMessage — 메인→explorer shutdown)
20. PostToolUse          
21. SubagentStart        (explorer 재스폰 for shutdown 처리)
22. PreToolUse           (SendMessage — 에이전트 shutdown 응답)
23. PostToolUse
24. UserPromptSubmit     (<teammate-message> idle 알림)
25. UserPromptSubmit     (system-reminder)
26. UserPromptSubmit     (<teammate-message> shutdown 승인)
27. PreToolUse           (ToolSearch — TeamDelete 조회)
28. PostToolUse
29. PreToolUse           (TeamDelete)
30. PostToolUse
31. Stop                 (최종 응답)
32. SessionEnd
```

**서브에이전트(12 이벤트) vs 팀 에이전트(37 이벤트)** — 이벤트 수 3배 차이.

### TeamCreate (메인 세션)

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "TeamCreate",
  "tool_input": {
    "team_name": "probe-team",
    "description": "Probe team for reading README.md"
  },
  "tool_use_id": "toolu_...",
  "session_id": "826790cc-...",
  "permission_mode": "default"
}
```

### Agent with team_name (메인 세션)

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "Agent",
  "tool_input": {
    "description": "Read README.md file",
    "prompt": "README.md 파일을 찾아서 읽어줘...",
    "subagent_type": "Explore",
    "name": "explorer",
    "team_name": "probe-team"
  }
}
```

**관찰:** Agent tool_input에 `name`과 `team_name` 포함. 일반 서브에이전트에는 이 필드 없음.

### SubagentStart (팀 에이전트)

```json
{
  "session_id": "826790cc-...",
  "cwd": "/private/tmp/hook-probe-test",
  "agent_id": "a391da4dbe624ada9",
  "agent_type": "explorer",
  "hook_event_name": "SubagentStart"
}
```

**핵심 차이:**
- `agent_type`: `"explorer"` (소문자) — Agent의 `name` 파라미터 값
- 서브에이전트는 `agent_type`: `"Explore"` (대문자, `subagent_type` 값)
- `team_name` 필드 **없음** — 훅에서 팀 소속 여부 직접 판별 불가

### SendMessage — 에이전트→team-lead (에이전트 내부)

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "SendMessage",
  "tool_input": {
    "to": "team-lead",
    "summary": "README.md 파일 읽기 완료",
    "message": "README.md 파일을 찾아서 읽었습니다.\n\n파일 경로: /private/tmp/hook-probe-test/README.md\n\n파일 내용:\n```\n# Hook Probe Test\n```"
  },
  "agent_id": "a391da4dbe624ada9",
  "agent_type": "explorer"
}
```

### SendMessage — 메인→에이전트 (shutdown 요청)

```json
{
  "hook_event_name": "PreToolUse",
  "tool_name": "SendMessage",
  "tool_input": {
    "to": "explorer",
    "summary": "Shutdown request",
    "message": {"type": "shutdown_request", "reason": "Task completed"},
    "type": "shutdown_request",
    "recipient": "explorer",
    "content": "Task completed"
  }
}
```

**관찰:** 메인 세션의 SendMessage에는 `agent_id` 없음.

### UserPromptSubmit — 팀 메시지 도착

```json
{
  "hook_event_name": "UserPromptSubmit",
  "prompt": "<teammate-message teammate_id=\"explorer\" color=\"blue\">\nREADME.md 파일을 찾아서 읽었습니다.\n\n파일 경로: ...\n</teammate-message>",
  "permission_mode": "default"
}
```

**관찰:**
- `agent_id` 없음 — UserPromptSubmit에서는 팀 메시지인지 사용자 입력인지 `prompt` 문자열로만 구분
- `<teammate-message teammate_id="..." color="...">` 태그로 팀 메시지 식별 가능
- idle, shutdown 응답도 동일 형식으로 도착

### SubagentStop (팀 에이전트)

```json
{
  "agent_id": "a391da4dbe624ada9",
  "agent_type": "explorer",
  "hook_event_name": "SubagentStop",
  "stop_hook_active": false,
  "agent_transcript_path": "~/.claude/projects/.../subagents/agent-a391da4dbe624ada9.jsonl",
  "last_assistant_message": "..."
}
```

### 서브에이전트 vs 팀 에이전트 훅 비교 요약

| 항목 | 서브에이전트 | 팀 에이전트 |
|------|-------------|------------|
| SubagentStart 필드 | 동일 구조 | 동일 구조 (**team_name 없음**) |
| SubagentStop 필드 | 동일 구조 | 동일 구조 |
| `agent_type` 값 | `subagent_type` (예: `"Explore"`) | `name` (예: `"explorer"`) |
| 내부 PreToolUse | `agent_id` + `agent_type` 포함 | 동일 |
| 팀 통신 | 없음 | SendMessage PreToolUse 발생 |
| 결과 전달 | PostToolUse(Agent) | UserPromptSubmit(`<teammate-message>`) |
| 이벤트 수 | 적음 (시나리오 B: 12개) | 많음 (시나리오 D: 37개) |
| Shutdown | 자동 종료 | 명시적 shutdown 프로토콜 필요 |
| 재스폰 | 없음 | shutdown 처리 위해 재스폰 가능 (SubagentStart 2회 관측) |

---

## 환경변수 캡처 결과

모든 이벤트에서 동일하게 접근 가능한 `CLAUDE_*` 환경변수:

```json
{
  "CLAUDE_CODE_ENTRYPOINT": "cli",
  "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",
  "CLAUDE_CODE_EXECPATH": "/Users/kih/.local/share/claude/versions/2.1.92",
  "CLAUDE_PROJECT_DIR": "/Users/kih/workspaces/areas/claude-nexus"
}
```

| 변수 | 설명 |
|------|------|
| `CLAUDE_CODE_ENTRYPOINT` | 실행 방식. `"cli"` (터미널), `"ide"` (VS Code 등) |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` | 에이전트 팀 기능 활성화 여부 |
| `CLAUDE_CODE_EXECPATH` | Claude Code 설치 경로 |
| `CLAUDE_PROJECT_DIR` | 프로젝트 루트 디렉토리 (hooks.json에서 `$CLAUDE_PROJECT_DIR`로 참조) |

### 훅 타입별 추가 환경변수

| 변수 | 사용 가능 이벤트 | 설명 |
|------|-----------------|------|
| `$CLAUDE_PLUGIN_ROOT` | 플러그인 훅 | 플러그인 설치 디렉토리 |
| `$CLAUDE_PLUGIN_DATA` | 플러그인 훅 | 플러그인 영속 데이터 디렉토리 |
| `$CLAUDE_ENV_FILE` | SessionStart, CwdChanged, FileChanged | 환경변수 주입용 파일 경로 |
| `$CLAUDE_CODE_REMOTE` | 웹 환경 | `"true"` (웹에서 실행 시) |

---

## transcript_path 경로 규칙

```
~/.claude/projects/{프로젝트경로-슬래시를-하이픈으로}/{session_id}.jsonl
```

예시:
- 프로젝트: `/private/tmp/hook-probe-test`
- 경로 변환: `-private-tmp-hook-probe-test`
- 결과: `~/.claude/projects/-private-tmp-hook-probe-test/{uuid}.jsonl`

서브에이전트 트랜스크립트:
```
~/.claude/projects/{프로젝트경로}/{session_id}/subagents/agent-{agent_id}.jsonl
```
