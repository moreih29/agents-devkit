<!-- tags: architecture, structure, entry-points, data-paths, build -->
# Architecture

Claude Code 플러그인. 3개 런타임 진입점이 esbuild로 번들되어 동작한다.

## Entry Points

| 진입점 | 소스 | 빌드 산출물 | 역할 |
|--------|------|-------------|------|
| MCP Server | `src/mcp/server.ts` | `bridge/mcp-server.cjs` | 도구 제공 (knowledge, rules, task, decision, consult, LSP, AST) |
| Gate Hook | `src/hooks/gate.ts` | `scripts/gate.cjs` | 이벤트 처리 (Stop, PreToolUse, UserPromptSubmit) + CLAUDE.md 자동 동기화 |
| Statusline | `src/statusline/statusline.ts` | `scripts/statusline.cjs` | 상태바 (모델, 브랜치, 사용량) |

## Directory Structure

```
src/
├── hooks/gate.ts          ← 유일한 훅 모듈 (3개 이벤트 + CLAUDE.md 동기화)
├── mcp/
│   ├── server.ts          ← McpServer 인스턴스 + 도구 등록
│   └── tools/             ← 도구별 모듈 (markdown-store, context, task, decision, artifact, consult, lsp, ast)
├── shared/
│   ├── paths.ts           ← PROJECT_ROOT, KNOWLEDGE_ROOT, BRANCH_ROOT, getBranchRoot(), findProjectRoot(), getCurrentBranch() 등 경로
│   ├── hook-io.ts         ← readStdin/respond/pass — 훅 I/O 프로토콜
│   ├── mcp-utils.ts       ← textResult() — MCP 응답 헬퍼
│   ├── tasks.ts           ← readTasksSummary() — tasks.json 읽기 유틸
│   └── version.ts         ← VERSION 파일 읽기
├── data/
│   └── tags.json          ← 태그 메타데이터 (빌드 시 템플릿 생성용)
├── code-intel/            ← LSP 클라이언트, 언어 감지 (lsp.ts에서 import)
└── statusline/            ← 상태바 렌더링

templates/
└── nexus-section.md       ← 빌드 시 자동 생성 (agents/skills/tags → CLAUDE.md Nexus 섹션)

generate-template.mjs      ← 템플릿 생성 스크립트 (esbuild 후 실행)
```

## Plugin Manifest

- `.claude-plugin/plugin.json` — 메타데이터 (name, version, skills, mcpServers)
- `hooks/hooks.json` — 훅 등록 (PreToolUse:Edit/Write/Agent, Stop:*, UserPromptSubmit:*)
- `.mcp.json` — MCP 서버 경로
- `agents/*.md` — 에이전트 정의 (7개, frontmatter에 task 필드 포함)
- `skills/*/SKILL.md` — 스킬 정의 (5개, frontmatter에 trigger_display/purpose 필드 포함)

## Data Paths

| 경로 | 추적 | 용도 |
|------|------|------|
| `.claude/nexus/knowledge/` | git | 장기 프로젝트 지식 |
| `.claude/nexus/rules/` | git | 팀 커스텀 행동 규칙 (사용자 요청 시 nx_rules_write로 생성) |
| `.claude/nexus/config.json` | git | Nexus 설정 |
| `.nexus/branches/{branch}/` | gitignore | 런타임 상태 (tasks.json, decisions.json, consult.json, history.json, artifacts/) |
| `.nexus/sync-state.json` | gitignore | 마지막 sync 커밋 |
| `templates/nexus-section.md` | git | CLAUDE.md Nexus 섹션 템플릿 (빌드 산출물) |

## Build Pipeline

```
esbuild (TS → CJS 번들)
  ↓
generate-template.mjs (agents/skills/tags.json → templates/nexus-section.md + CLAUDE.md 마커 갱신)
  ↓
dev-sync.mjs (빌드 산출물 → 플러그인 캐시/마켓플레이스 동기화, semver 정렬)
```

## Key Design Decisions

- **Gate 단일 모듈**: Stop/PreToolUse/UserPromptSubmit을 하나의 gate.ts에서 처리. 이벤트 구분은 필드 존재 여부로 판별 (tool_name → PreToolUse, prompt → UserPromptSubmit, 없음 → Stop).
- **브랜치 격리**: 런타임 상태는 `.nexus/branches/{sanitized-branch}/` 하위에 격리. 레거시 `.nexus/{branch}/` 경로는 자동 마이그레이션.
- **동적 브랜치 감지**: MCP 도구는 `getBranchRoot()` 함수로 호출 시마다 현재 브랜치를 감지. MCP 서버가 장기 프로세스이므로 정적 상수 대신 동적 해결.
- **CLAUDE.md 자동 동기화**: gate.ts가 세션 시작 시 `templates/nexus-section.md`와 글로벌 CLAUDE.md를 콘텐츠 비교하여 자동 갱신. 프로젝트 CLAUDE.md는 stale 시 알림만.
- **esbuild CJS 번들**: 플러그인 런타임이 `node`로 실행되므로 CJS 포맷. `@ast-grep/napi`는 네이티브 모듈이라 external 처리.
- **git fallback `_default`**: `getCurrentBranch()`는 `git rev-parse --abbrev-ref HEAD` → 실패 시 `git symbolic-ref --short HEAD`(커밋 없는 저장소 대응) → 여전히 실패 시 `'_default'` 반환. `.nexus/branches/_default/`에 런타임 상태 저장. 기존 `_unknown` 경로는 자동 마이그레이션.
- **[consult] 세션 유지**: [consult] 태그 사용 시 기존 consult.json 있으면 세션 이어감. gate.ts가 consult.json 존재 여부를 체크하여 기존 세션 확인/이어가기 안내 또는 새 세션 시작 안내를 분기. cleanupConsult() 제거됨.
- **통합 아카이브**: nx_task_close가 consult+decisions+tasks를 history.json에 통합 아카이브. 소스 파일(consult.json, decisions.json, tasks.json) 삭제. decision-archives.json 폐기됨.
- **gate.ts 핸들러 맵**: handleUserPromptSubmit을 PRIMITIVE_HANDLERS 맵 기반 dispatch로 분해. 모드별 핸들러 함수로 분리. TASK_PIPELINE 공통 상수로 파이프라인 규칙 통합.
- **모드 안내는 additionalContext만**: mode.json 제거됨. [dev]/[research] 태그 시 UserPromptSubmit additionalContext로 안내. hard block 없이 넛지만 — 파이프라인 강제는 tasks.json PreToolUse 차단이 담당.
- **코드 중복 제거**: registerMarkdownStore 팩토리로 knowledge/rules 통합, textResult() 헬퍼, readTasksSummary() 유틸, findProjectRoot/getCurrentBranch 단일 export.