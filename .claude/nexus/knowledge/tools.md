<!-- tags: mcp, tools, lsp, ast, knowledge, tasks, consult, rules -->
# MCP Tools

MCP 서버(`bridge/mcp-server.cjs`)가 제공하는 도구 목록. 소스: `src/mcp/tools/`.

## Core

| 도구 | 소스 | 저장 경로 | 용도 |
|------|------|-----------|------|
| `nx_knowledge_read` | markdown-store.ts | `.claude/nexus/knowledge/{topic}.md` | knowledge 읽기 (topic 지정 또는 태그 검색) |
| `nx_knowledge_write` | markdown-store.ts | `.claude/nexus/knowledge/{topic}.md` | knowledge 쓰기 (tags 옵션) |
| `nx_rules_read` | markdown-store.ts | `.claude/nexus/rules/{name}.md` | rules 읽기 (name 지정 또는 태그 검색) |
| `nx_rules_write` | markdown-store.ts | `.claude/nexus/rules/{name}.md` | rules 쓰기 (tags 옵션, HTML 주석 frontmatter) |
| `nx_context` | context.ts | `.nexus/branches/{branch}/tasks.json`, `decisions.json` 참조 | 현재 브랜치, 팀 모드, 태스크 요약, 결정 사항 조회 |
| `nx_task_list` | task.ts | `.nexus/branches/{branch}/tasks.json` | 태스크 목록 + summary + ready 태스크 |
| `nx_task_add` | task.ts | `.nexus/branches/{branch}/tasks.json` | 태스크 추가 (caller=director/lead/principal 허용) |
| `nx_task_update` | task.ts | `.nexus/branches/{branch}/tasks.json` | 태스크 상태 변경 (pending/in_progress/completed) |
| `nx_task_close` | task.ts | `.nexus/branches/{branch}/history.json` | 현재 사이클 종료: consult+decisions+tasks를 history.json에 아카이브 후 소스 파일 삭제 |
| `nx_decision_add` | decision.ts | `.nexus/branches/{branch}/decisions.json` | 결정 기록 추가 (summary + consult 파라미터, consult는 관련 논점 ID 또는 null) |
| `nx_artifact_write` | artifact.ts | `.nexus/branches/{branch}/artifacts/{filename}` | 팀 산출물 저장 (report, synthesis 등) |
| `nx_consult_start` | consult.ts | `.nexus/branches/{branch}/consult.json` | 상담 세션 시작 (토픽 + 논점 목록 등록) |
| `nx_consult_status` | consult.ts | `.nexus/branches/{branch}/consult.json` + `decisions.json` | 현재 상담 상태 조회 (논점 목록/상태 + 결정된 논점의 decisions.json 내용 join) |
| `nx_consult_update` | consult.ts | `.nexus/branches/{branch}/consult.json` | 활성 상담 세션 논점 수정. action: add/remove/edit/reopen |
| `nx_consult_decide` | consult.ts | `.nexus/branches/{branch}/consult.json` + `decisions.json` | 논점 결정 처리 (consult.json 갱신 + decisions.json 기록). 모두 decided 시 완료 시그널 반환 — consult.json 삭제 안 함. |

## nx_consult_update 액션

| action | 필수 파라미터 | 동작 |
|--------|--------------|------|
| `add` | title | 새 논점 추가. max id + 1로 자동 채번. status: pending |
| `remove` | issue_id | 논점 삭제 |
| `edit` | issue_id, title | 논점 제목 수정 |
| `reopen` | issue_id | decided → discussing으로 되돌림. decisions.json에서 `consult === issue_id`인 항목을 soft-delete (`status: "revoked"`) |

## Code Intelligence

| 도구 | 소스 | 용도 |
|------|------|------|
| `nx_lsp_hover` | lsp.ts | 심볼 타입 정보 |
| `nx_lsp_goto_definition` | lsp.ts | 정의 위치 이동 |
| `nx_lsp_find_references` | lsp.ts | 참조 목록 |
| `nx_lsp_diagnostics` | lsp.ts | 컴파일러/린터 에러 |
| `nx_lsp_rename` | lsp.ts | 프로젝트 전체 심볼 리네임 |
| `nx_lsp_code_actions` | lsp.ts | 자동 수정/리팩토링 제안 |
| `nx_lsp_document_symbols` | lsp.ts | 파일 내 심볼 목록 |
| `nx_lsp_workspace_symbols` | lsp.ts | 프로젝트 전체 심볼 검색 |
| `nx_ast_search` | ast.ts | AST 패턴 검색 (tree-sitter via @ast-grep/napi) |
| `nx_ast_replace` | ast.ts | AST 패턴 치환 (dryRun 지원) |

## DecisionEntry 스키마

decisions.json의 각 항목 구조:

```json
{ "id": 1, "summary": "결정 내용", "consult": 2, "status": "active" }
```

- `id`: 자동 채번 (max id + 1)
- `summary`: 결정 내용
- `consult`: 관련 consult 논점 ID (number), 또는 null (직접 결정)
- `status`: `"active"` (기본) 또는 `"revoked"` (reopen 시). optional — 없으면 active로 간주.
- `nx_decision_add`: `consult` 파라미터로 논점 ID 지정. 미지정 시 null
- `nx_consult_decide`: `consult` 필드에 issue_id 자동 기록
- `nx_consult_status`: `d.consult === issue.id` 기반으로 결정 항목 join (revoked 제외)
- `nx_consult_update reopen`: `d.consult === issue_id`인 항목을 soft-delete (`status: "revoked"`)

## history.json 스키마

`nx_task_close` 호출 시 생성/append되는 아카이브 파일:

```json
{
  "cycles": [
    {
      "completed_at": "ISO 타임스탬프",
      "consult": { ... } ,
      "decisions": [ ... ],
      "tasks": [ ... ]
    }
  ]
}
```

- 경로: `.nexus/branches/{branch}/history.json`
- 각 cycle은 consult.json + decisions.json + tasks.json 스냅샷
- 아카이브 후 consult.json, decisions.json, tasks.json 삭제

## 특이사항

- `nx_task_add`는 `allowedCallers: ['director', 'lead', 'principal']` 검증. 허용되지 않은 caller 호출 시 에러 반환.
- LSP: 프로젝트 언어 자동 감지 (tsconfig.json → TypeScript 등). 언어별 LSP 클라이언트 맵으로 관리.
- AST: `@ast-grep/napi`가 optional — 플러그인 캐시 또는 프로젝트 node_modules에서 동적 로드.
- knowledge_write의 topic 파라미터가 파일명이 됨 (`knowledge/{topic}.md`). 하위 디렉토리 생성은 지원하지 않음.
- MCP 도구는 `getBranchRoot()` 동적 함수로 경로를 해결. MCP 서버는 장기 프로세스이므로 정적 `BRANCH_ROOT` 대신 호출 시마다 현재 브랜치를 감지.
- `nx_consult_decide`는 consult.json + decisions.json을 동시 갱신. 모든 issues decided 시 consult.json **삭제하지 않음** — 완료 시그널(`allComplete: true`) 반환.
- `nx_consult_update`의 reopen 액션은 decisions.json에서 `consult === issue_id`인 항목을 soft-delete (`status: "revoked"`)하여 audit trail 보존.
- `nx_consult_status`는 결정된 논점의 decisions.json 항목을 `d.consult === issue.id` 기반으로 join하여 함께 반환.
- `nx_task_close`는 사이클 완료 시 호출. consult+decisions+tasks를 history.json에 아카이브 후 소스 파일(consult.json, decisions.json, tasks.json) 삭제. `nx_task_clear`(구버전) 대체.