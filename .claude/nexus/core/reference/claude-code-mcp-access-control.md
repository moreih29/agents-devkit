<!-- tags: claude-code, mcp, disallowedTools, agent, access-control -->
<!-- tags: claude-code, mcp, disallowedTools, agent, access-control -->
# Claude Code MCP 도구 접근 제어

조사일: 2026-03-29. 출처: code.claude.com/docs, GitHub Issues.

## disallowedTools로 MCP 도구 차단 — 작동 확인

Agent frontmatter의 `disallowedTools`에 MCP 도구 이름을 넣으면 **플랫폼 수준에서 차단**됨. 차단된 도구는 모델 컨텍스트에서 완전 제거 (도구가 존재하지 않는 것처럼 동작).

```yaml
disallowedTools: mcp__plugin_claude-nexus_nx__nx_task_add, mcp__plugin_claude-nexus_nx__nx_core_write
```

와일드카드 지원: `mcp__plugin_claude-nexus_nx__*` (서버 전체 차단).

## tools 화이트리스트 — 불안정

`tools` 필드로 MCP 도구 활성화는 deferred MCP 도구에서 신뢰성 낮음 (GitHub Issue #25200 OPEN). 차단에는 `disallowedTools`가 더 안정적.

## MCP 서버 사이드 caller 식별 — 미구현

MCP 도구 호출 시 caller/agent 정보가 전달되지 않음 (GitHub Issue #32514 OPEN). 서버 사이드에서 에이전트별 로직 분기 불가. 클라이언트 사이드 `disallowedTools`가 유일한 현실적 수단.

## 제한사항

- Lead(메인 대화)는 에이전트 정의가 아니므로 disallowedTools 적용 불가
- `disallowedTools`와 `tools` 동시 설정 시 disallowedTools가 먼저 적용
