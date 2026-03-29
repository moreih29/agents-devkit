<!-- tags: mcp, session_id, claude-code, lifecycle, environment-variables, CLAUDE_ENV_FILE -->
# MCP 서버의 Claude Code session_id 접근 가능성

**조사일**: 2026-03-29

## 핵심 결론

Claude Code의 MCP 서버(특히 stdio 장기 프로세스)가 현재 세션의 session_id를 런타임에 알 수 있는 **공식 메커니즘은 현재 없다**.

## 주요 사실

### 생명주기
- stdio MCP 서버는 세션 시작 시 **SessionStart 훅보다 먼저** 기동된다
- stdio: 클라이언트 1개당 프로세스 1개 (no shared state)
- HTTP/Streamable HTTP: 원격 서버는 여러 세션이 공유하는 독립 프로세스
- MCP 서버는 /clear, session resume, compaction 시 재시작되지 않음
- `/reload-plugins` 실행 또는 Claude Code 완전 재시작 시에만 재spawn

### session_id 전달 메커니즘 부재
- `$CLAUDE_SESSION_ID` 환경변수: **미구현** (Feature request #25642 OPEN)
- MCP initialize 핸드셰이크 `clientInfo`: name/version만 포함, session_id 없음
- `CLAUDE_ENV_FILE`: Bash 커맨드에만 적용됨 — 이미 실행 중인 MCP 프로세스에 전파 안 됨
- 정적 `--env` 플래그: spawn 시점에 session_id 동적 생성이라 사전 알 수 없음

### MCP 프로토콜 세션 메커니즘
- `Mcp-Session-Id` 헤더: HTTP 트랜스포트에서 서버→클라이언트 방향으로 부여하는 MCP 커넥션 ID. Claude Code session_id와 별개 개념
- stdio: 프로토콜 레벨 세션 없음
- SEP-1359 (protocol-level sessions for stdio) — dormant, closed

### CLAUDE_ENV_FILE 정확한 정의
> "Path to a shell script that Claude Code sources before each **Bash command**."
SessionStart/CwdChanged/FileChanged 훅에서만 사용 가능. MCP 서버 프로세스와 무관.

## 우회책
1. SessionStart 훅에서 session_id를 파일 기록 → MCP 서버가 폴링
2. MCP 툴 호출 시 argument로 session_id 명시 전달 (Claude가 session_id를 알아야 함)
3. Issue #25642 구현 대기

## 핵심 소스
- Feature request #25642: https://github.com/anthropics/claude-code/issues/25642
- Claude Code env-vars docs: https://code.claude.com/docs/en/env-vars
- Claude Code hooks docs: https://code.claude.com/docs/en/hooks
- MCP Lifecycle spec (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- MCP Transports spec (2025-06-18): https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- SEP-1359: https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1359
- Orphaned processes bug #1935: https://github.com/anthropics/claude-code/issues/1935
