# NotebookEdit 함정 — file_path가 아닌 notebook_path

**날짜**: 2026-04-10
**출처**: resume_tier Phase 2 Cycle A — PostToolUse 필드명 sanity check (researcher Task)

## 핵심

Claude Code의 Edit/Write 도구는 `tool_input.file_path`를 사용하지만, **NotebookEdit만 `tool_input.notebook_path`를 사용한다**. 추측으로 모든 도구에 `file_path`를 쓰면 NotebookEdit 케이스에서 조용히 null이 되어 파일 추적 누락. 런타임 에러도 발생하지 않는 silent 버그.

## 확정 사실 (2026-04-10 실측)

- agent 식별 필드명: `event.agent_id` (snake_case, 공식 문서 확인)
- `tool_name` 값: PascalCase 그대로 — `"Edit"`, `"Write"`, `"NotebookEdit"`
- 파일 경로 위치:
  - Edit/Write → `event.tool_input.file_path`
  - **NotebookEdit → `event.tool_input.notebook_path`** (다른 필드명)
- `agent_id`는 서브에이전트 컨텍스트에서만 존재 (Lead 직접 편집 시 부재 → skip)

## 올바른 코드 패턴

```typescript
function handlePostToolUse(event: any) {
  const agentId = event.agent_id;
  if (!agentId) return;  // Lead direct edit, skip
  if (!['Edit', 'Write', 'NotebookEdit'].includes(event.tool_name)) return;
  const filePath = event.tool_name === 'NotebookEdit'
    ? event.tool_input?.notebook_path
    : event.tool_input?.file_path;
  if (!filePath) return;
  // ... append to log
}
```

## 1차 자료

- 공식 hooks 문서: https://code.claude.com/docs/en/hooks
- 공식 tools-reference: https://code.claude.com/docs/en/tools-reference.md
- Piebald-AI/claude-code-system-prompts: tool-description-notebookedit.md
- bgauryy gist: Claude Code internal tool definitions

## 교훈

PostToolUse/PreToolUse 페이로드 구조 **추측 금지**. 도구마다 필드명이 다를 수 있다. 새로운 hook 핸들러 구현 전 researcher가 복수 1차 자료 교차검증으로 필드명을 확정하는 것이 필수. Cycle A는 이 sanity check를 첫 task로 통합하여 silent bug를 예방했다.
