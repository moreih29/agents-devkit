<!-- tags: claude-code, hooks, settings, lifecycle, automation -->
# Claude Code Hooks 전체 스펙

조사일: 2026-04-06
출처: https://code.claude.com/docs/en/hooks, https://code.claude.com/docs/en/hooks-guide

## 핵심 요약

- 총 25개 hook 이벤트 존재
- 4가지 핸들러 타입: `command`, `http`, `prompt`, `agent`
- stdin으로 JSON 입력, stdout JSON + exit code로 제어
- exit 2 = 블로킹 차단, exit 0 + JSON = 구조화된 제어

## 전체 이벤트 목록

SessionStart, InstructionsLoaded, UserPromptSubmit, PreToolUse, PermissionRequest, PermissionDenied, PostToolUse, PostToolUseFailure, Notification, SubagentStart, SubagentStop, TaskCreated, TaskCompleted, Stop, StopFailure, TeammateIdle, PreCompact, PostCompact, Elicitation, ElicitationResult, ConfigChange, CwdChanged, FileChanged, WorktreeCreate, WorktreeRemove, SessionEnd

## 매처 지원 여부

- 툴 이름 매처: PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, PermissionDenied
- 기타 매처: SessionStart(source), SessionEnd(reason), Notification(type), SubagentStart/Stop(agent type), PreCompact/PostCompact(trigger), ConfigChange(source), StopFailure(error type), InstructionsLoaded(reason), Elicitation/ElicitationResult(MCP server), FileChanged(filename)
- 매처 없음(항상 발동): UserPromptSubmit, Stop, TeammateIdle, TaskCreated, TaskCompleted, WorktreeCreate, WorktreeRemove, CwdChanged

## 핵심 차이점

PreToolUse: 실행 전 차단/수정 가능, updatedInput으로 인자 수정
PostToolUse: 실행 후, 취소 불가, tool_response 접근 가능
Stop: 메인 Claude 응답 완료 시
SubagentStop: 서브에이전트 완료 시, agent_transcript_path 제공

## 중요 제약

- PreToolUse deny는 bypassPermissions 모드에서도 작동
- PreToolUse allow는 settings deny 규칙을 우회할 수 없음
- PermissionRequest는 non-interactive 모드(-p)에서 발동 안 함
- stop_hook_active 필드로 Stop hook 무한루프 방지 필수
- 출력 컨텍스트 10,000자 제한

## 상세 문서 위치

`.nexus/state/artifacts/claude-code-hooks-spec.md`
