<!-- tags: claude-code, hooks, events, platform, team, agent, skills -->
<!-- tags: claude-code, hooks, events, platform, team, agent, skills -->
# Claude Code 플랫폼 레퍼런스

조사일: 2026-03-29. 출처: code.claude.com/docs, GitHub Issues.

## 훅 이벤트 (25개)

| 이벤트 | 설명 | Nexus 활용 |
|--------|------|-----------|
| PreToolUse | 도구 실행 전. matcher로 도구명 필터 | **사용 중** (Edit/Write/Agent/nx_task_update/nx_task_close) |
| PostToolUse | 도구 실행 후. 결과 분석 가능 | 미사용 |
| Stop | 세션 종료 시도 | **사용 중** |
| UserPromptSubmit | 사용자 프롬프트 제출 | **사용 중** |
| SessionStart | 세션 시작/resume | **사용 중** (Director 스폰) |
| SessionEnd | 세션 종료 | 미사용 |
| SubagentStart | 에이전트 스폰 시 | **사용 중** (에이전트 추적) |
| SubagentStop | 에이전트 종료 시 | **사용 중** (실패 추적) |
| PreCompact | 컨텍스트 압축 전 | 미사용 |
| PostCompact | 컨텍스트 압축 후 | 미사용 |
| TeammateIdle | 팀원 idle 전환 직전 | 미사용 |
| TaskCreated | TaskCreate 태스크 생성 | 미사용 (Claude Code 네이티브 태스크) |
| TaskCompleted | TaskCreate 태스크 완료 | 미사용 |
| InstructionsLoaded | CLAUDE.md 로드 시 | 미사용 |
| StopFailure | API 에러 구분 매처 지원 | 미사용 |
| WorktreeCreate | 워크트리 생성 | 미사용 |
| WorktreeRemove | 워크트리 삭제 | 미사용 |
| Elicitation | MCP 서버 사용자 입력 | 미사용 |
| ElicitationResult | MCP 사용자 입력 결과 | 미사용 |

## SubagentStart/Stop 이벤트 데이터

**SubagentStart**: `agent_id`, `agent_type` (plugin:agent 형식), `session_id`, `transcript_path`, `cwd`, `permission_mode`

**SubagentStop**: 위 + `agent_transcript_path`, `last_assistant_message`

matcher로 특정 에이전트 타입 필터 가능: `"matcher": "claude-nexus:engineer"`

## 팀원(Teammate) 도구 제한 — 플랫폼 수준

**팀원은 Agent, TeamCreate, TeamDelete 사용 불가.** 플랫폼 수준 제한.

| 도구 | 독립 서브에이전트 | 팀원 |
|------|----------------|------|
| Agent | ✓ | ✗ |
| TeamCreate | ✓ | ✗ |
| TeamDelete | ✓ | ✗ |
| CronCreate/Delete/List | ✓ | ✗ |
| SendMessage | ✗ | ✓ |
| 기타 도구 (Edit, Bash 등) | ✓ | ✓ (disallowedTools 제외) |

**예외**: `--teammate-mode tmux` 사용 시 Agent 접근 가능 (GitHub Issue #31977, 버그로 보고됨).

## PreToolUse matcher 패턴

**regex 지원**. 파이프(`|`)로 OR 조합.

- 내장 도구: `Edit`, `Write`, `Bash`, `Read`, `Glob`, `Grep`, `Agent`, `WebFetch`, `WebSearch` 등
- **MCP 도구 매칭 가능**: `mcp__<server>__<tool>` 패턴
  - 예: `mcp__plugin_claude-nexus_nx__nx_task_update`
  - 와일드카드: `mcp__plugin_claude-nexus_nx__.*` (넥서스 전체 MCP 도구)

## 스킬 frontmatter 공식 필드

`name`, `description`, `argument-hint`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`, `effort`, `context`, `agent`, `hooks`, `paths`, `shell`

**비표준 필드** (Nexus 자체 파싱용): `triggers`, `trigger_display`, `purpose` — generate-template.mjs에서 CLAUDE.md 생성용으로만 사용.

**자동 로딩**: `disable-model-invocation` 미설정(기본) → Claude가 관련성 판단 시 자동 로드. `user-invocable: false` → 사용자 메뉴에서 숨김.

컨텍스트 예산: 스킬 설명은 컨텍스트 윈도우의 1% 예산, 항목당 250자 상한.

## 에이전트 frontmatter 공식 필드

`name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, `isolation`

**보안상 무시되는 필드** (플러그인 에이전트): `hooks`, `mcpServers`, `permissionMode`

에이전트 파일 수 제한: **없음** (명시적 제한 미발견).
