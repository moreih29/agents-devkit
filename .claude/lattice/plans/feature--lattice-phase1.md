# Plan: feature/lattice-phase1

## 목표
Lattice MVP — 플러그인이 설치·인식되고 핵심 기능이 동작하는 최소 구현.

## 완료 조건
- [x] 플러그인 매니페스트 (`plugin.json`, `.mcp.json`)
- [x] 프로젝트 스캐폴딩 (`package.json`, `tsconfig.json`, esbuild 설정)
- [x] Gate 훅 (Stop: Sustain 차단, UserPromptSubmit: 키워드 감지)
- [x] MCP 서버 Core 도구 8개 (state 3 + knowledge 2 + memo 2 + context 1)
- [x] 에이전트 5개 (Steward, Artisan, Scout, Compass, Sentinel)
- [x] Sustain 스킬 1개
- [x] Pulse 훅 (PreToolUse/PostToolUse: Whisper 패턴 컨텍스트 주입)
- [x] Tracker 훅 (SubagentStart/Stop, SessionStart/End)
- [x] 빌드 파이프라인 (tsc → dist/, esbuild → bridge/mcp-server.cjs, scripts/*.cjs)
- [x] 별도 프로젝트에서 설치 및 동작 검증

## 개발 단위 (순서)

### Unit 1: 스캐폴딩 + 플러그인 매니페스트
**범위**: 빈 플러그인이 Claude Code에 인식되는 것까지.

파일:
- `package.json` — name: claude-lattice, type: module, files 목록
- `tsconfig.json` — strict, ESM, target ES2022
- `esbuild.config.mjs` — CJS 번들 설정 (mcp-server, gate, pulse, tracker)
- `.claude-plugin/plugin.json` — 매니페스트
- `.claude-plugin/marketplace.json` — 마켓플레이스 메타데이터
- `.mcp.json` — MCP 서버 설정 (`lat` 서버)
- `hooks/hooks.json` — 빈 훅 등록 (placeholder)
- `agents/` — 빈 디렉토리
- `skills/` — 빈 디렉토리

검증: `npm install` → `npm run build` → 오류 없음

### Unit 2: MCP 서버 Core 도구
**범위**: 8개 Core 도구가 동작하는 MCP 서버.

파일:
- `src/mcp/server.ts` — MCP 서버 엔트리
- `src/mcp/tools/state.ts` — lat_state_read, lat_state_write, lat_state_clear
- `src/mcp/tools/knowledge.ts` — lat_knowledge_read, lat_knowledge_write
- `src/mcp/tools/memo.ts` — lat_memo_read, lat_memo_write
- `src/mcp/tools/context.ts` — lat_context
- `src/shared/paths.ts` — 경로 유틸 (.lattice/, .claude/lattice/)
- `src/shared/session.ts` — 세션 ID 관리
- `bridge/mcp-server.cjs` — esbuild CJS 번들 (빌드 산출물)

스키마: Zod strict 모드로 모든 도구 파라미터 검증

검증: MCP Inspector로 도구 호출 테스트

### Unit 3: Gate 훅
**범위**: Stop 이벤트에서 Sustain 차단 + UserPromptSubmit에서 키워드 감지.

파일:
- `src/hooks/gate.ts` — Gate 로직 (TypeScript 소스)
- `scripts/gate.cjs` — esbuild CJS 번들 (빌드 산출물)
- `hooks/hooks.json` — Gate 이벤트 등록 (Stop, UserPromptSubmit)

동작:
- Stop: `.lattice/state/sessions/{id}/sustain.json` 존재 + active → block + iteration 증가
- Stop: Pipeline 활성 시 → block
- Stop: maxIterations 도달 시 자동 해제
- UserPromptSubmit: 자연어 키워드 감지 → **훅이 직접 상태 파일 생성** + additionalContext로 활성화 통보
- 이벤트 구분: `prompt` 필드 존재 여부로 판별 (hook_event_name 미제공)

검증: E2E 자동 테스트 + lattice-test에서 수동 Sustain 워크플로우 검증 완료

### Unit 4: 에이전트 5개
**범위**: Phase 1 에이전트 마크다운 정의.

파일:
- `agents/steward.md` — 오케스트레이터 (high/full)
- `agents/artisan.md` — 코드 구현 (medium/standard)
- `agents/scout.md` — 코드 탐색 (low/minimal)
- `agents/compass.md` — 아키텍처 설계 (high/full, READ-ONLY)
- `agents/sentinel.md` — 검증/보안 (medium/standard)

포맷: frontmatter (name, tier, context, disallowedTools, tags) + Role/Guidelines 본문

검증: Claude Code에서 `Agent(subagent_type="lattice:artisan")` 호출 가능

### Unit 5: Sustain 스킬
**범위**: 지속 실행 워크플로우 스킬.

파일:
- `skills/sustain/SKILL.md` — 스킬 정의 (프롬프트)

동작:
- MCP lat_state_write로 Sustain 상태 활성화
- Gate 훅이 Stop 차단
- 완료 시 lat_state_clear로 비활성화

검증: `/lattice:sustain` 호출 → Stop 차단 → cancel로 해제

### Unit 6: Pulse + Tracker 훅
**범위**: 컨텍스트 주입 + 에이전트 추적.

파일:
- `src/hooks/pulse.ts` — Whisper 패턴 컨텍스트 주입 + Guard
- `src/hooks/tracker.ts` — 서브에이전트/세션 추적
- `scripts/pulse.cjs` — esbuild CJS 번들
- `scripts/tracker.cjs` — esbuild CJS 번들
- `hooks/hooks.json` — 업데이트 (PreToolUse, PostToolUse, SubagentStart/Stop, SessionStart/End)

검증: PreToolUse 시 additionalContext 주입 확인

### Unit 7: 빌드 + 통합 검증
**범위**: 전체 빌드 파이프라인 + 테스트 프로젝트 설치.

- `bun run build` → bridge/ + scripts/ 생성
- GitHub 마켓플레이스 등록 + `claude plugin install`로 설치
- `~/workspaces/projects/lattice-test/`에서 omc 비활성화 + Lattice 검증
- E2E 자동: `bash test/e2e.sh` (21케이스)
- E2E 수동: Scout 에이전트 호출, lat_context MCP 호출, Sustain 워크플로우 (키워드→차단→해제)

## 기술 결정

### omc와의 차이 (단일 CJS 스크립트)
omc: `node run.cjs scripts/target.mjs` (이중 스폰)
Lattice: `node "$CLAUDE_PLUGIN_ROOT"/scripts/gate.cjs` (단일 CJS, esbuild 번들)

### MCP 서버 이름
`lat` — 짧고 명확. 도구는 `lat_state_read` 등으로 접근.

### hooks.json 구조
```json
{
  "hooks": {
    "Stop": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/gate.cjs", "timeout": 5 }] }],
    "UserPromptSubmit": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/gate.cjs", "timeout": 5 }] }],
    "PreToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/pulse.cjs", "timeout": 3 }] }],
    "PostToolUse": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/pulse.cjs", "timeout": 3 }] }],
    "SubagentStart": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/tracker.cjs", "timeout": 3 }] }],
    "SubagentStop": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/tracker.cjs", "timeout": 3 }] }],
    "SessionStart": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/tracker.cjs", "timeout": 5 }] }],
    "SessionEnd": [{ "matcher": "*", "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PLUGIN_ROOT\"/scripts/tracker.cjs", "timeout": 5 }] }]
  }
}
```

하나의 CJS 스크립트가 이벤트 타입을 stdin JSON에서 읽고 분기 처리.

## 현재 상태
Phase 1 전체 완료 (2026-03-19). main 머지 대기.

## 구현 중 발견한 사항
1. **빌드 산출물 git 포함 필수**: 플러그인은 git clone으로 설치 → bridge/, scripts/*.cjs가 저장소에 있어야 함
2. **훅 I/O**: Claude Code는 `hook_event_name` 미제공, `prompt` 필드로 이벤트 구분
3. **additionalContext는 제안**: 중요 동작(Sustain 활성화)은 훅이 직접 상태 파일 생성해야 함
4. **심링크 불안정**: Claude Code가 캐시 정리 시 심링크 삭제 → `dev-sync.mjs` 복사 방식 사용
5. **marketplace.json**: `$schema`, `description`, `version`은 루트 레벨에서 허용되지 않음

## 참조
- `.claude/lattice/knowledge/` — 전체 설계 문서
- `.claude/lattice/knowledge/dev-workflow.md` — 로컬 개발/테스트 가이드
- `.claude/contexts/resources/omc/` — omc 플러그인 구조 참조
