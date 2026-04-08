# claude-nexus

[![npm version](https://img.shields.io/npm/v/claude-nexus)](https://www.npmjs.com/package/claude-nexus)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/moreih29/claude-nexus/blob/main/LICENSE)

> 🌏 [English](README.en.md)

Claude Code를 위한 에이전트 오케스트레이션 플러그인.

## Why

복잡한 개발/리서치 작업을 혼자 처리하는 대신, 전문화된 에이전트 팀이 역할을 나눠 체계적으로 수행합니다. 태그 하나로 상담, 개발, 리서치 워크플로우가 자동 오케스트레이션됩니다.

## Quick Start

**설치**

```bash
claude plugin marketplace add https://github.com/moreih29/claude-nexus.git
claude plugin install claude-nexus@nexus
```

**온보딩**

`/claude-nexus:nx-init`을 처음 실행하면 프로젝트를 스캔해 `.nexus/`에 지식을 자동 생성합니다.

> **Important**: 하나의 워크스페이스에서 동시에 여러 Claude Code 세션을 실행하는 것은 지원되지 않습니다. 상태 파일 충돌이 발생할 수 있습니다.

**첫 사용**

- **플랜**: `[plan] 인증 시스템 어떻게 설계하면 좋을까?`
- **결정 기록**: (plan 중) `응 그 방향으로 [d]`
- **실행**: `[run] 로그인 API 구현`

## 사용법

| 태그 | 동작 | 예시 |
|------|------|------|
| `[plan]` | 플랜 모드 활성화 | `[plan] DB 마이그레이션 전략 논의` |
| `[d]` | 결정 기록 (plan 세션 내) | `응 그 방향으로 [d]` |
| `[run]` | 실행 (서브에이전트 구성) | `[run] 결제 모듈 리팩토링` |
| `[rule]` | 규칙 저장 | `[rule] npm 대신 bun 사용` |
| `[m]` | 메모 추가 | `[m] 이 패턴은 나중에 참고` |
| `[m:gc]` | 메모 정리 | `[m:gc]` |
| `[sync]` | context/ 동기화 | `[sync]` |

## 에이전트

| 카테고리 | 에이전트 | 역할 | 모델 |
|----------|----------|------|------|
| **How** | Architect | 기술 설계, 아키텍처 리뷰 | opus |
| **How** | Designer | UI/UX 설계, 인터랙션 패턴 | opus |
| **How** | Postdoc | 방법론 설계, 증거 평가 | opus |
| **How** | Strategist | 콘텐츠 전략, 방향 설정 | opus |
| **Do** | Engineer | 코드 구현, 디버깅 | sonnet |
| **Do** | Researcher | 웹 검색, 독립 조사 | sonnet |
| **Do** | Writer | 기술 문서, 프레젠테이션 | sonnet |
| **Check** | Tester | 코드 검증, 테스트, 보안 | sonnet |
| **Check** | Reviewer | 콘텐츠 검증, 출처 확인 | sonnet |

## 스킬

| 스킬 | 트리거 | 설명 |
|------|--------|------|
| **nx-plan** | `[plan]` | 구조화된 플랜. 요구사항 정리 → 결정 기록 |
| **nx-run** | `[run]` | 동적 에이전트 구성 실행 |
| **nx-init** | `/claude-nexus:nx-init` | 프로젝트 온보딩. 코드 스캔 → 지식 생성 |
| **nx-setup** | `/claude-nexus:nx-setup` | 대화형 설정 |
| **nx-sync** | `/claude-nexus:nx-sync` | context/ 동기화. 소스 변경사항을 .nexus/context/ 문서에 반영 |

## 고급 기능

<details>
<summary>MCP 도구</summary>

Claude가 직접 호출하는 도구입니다.

### Core (12개)

| 도구 | 용도 |
|------|------|
| `nx_context` | 현재 세션 상태 조회 (브랜치, 태스크, 플랜) |
| `nx_task_list/add/update/close` | `.nexus/state/tasks.json` 기반 태스크 관리 + `.nexus/history.json` 아카이브 |
| `nx_artifact_write` | 팀 산출물 저장 (`.nexus/state/artifacts/`) |
| `nx_plan_start` | 플랜 세션 시작 (토픽 + 논점 + 리서치 요약 등록) |
| `nx_plan_status` | 플랜 상태 조회 |
| `nx_plan_update` | 플랜 논점 수정 (add/remove/edit/reopen) |
| `nx_plan_decide` | 논점 결정 처리 (plan.json) |

### Code Intelligence (10개)

| 도구 | 용도 |
|------|------|
| `nx_lsp_hover` | 심볼 타입 정보 |
| `nx_lsp_goto_definition` | 정의 위치 이동 |
| `nx_lsp_find_references` | 참조 목록 |
| `nx_lsp_diagnostics` | 컴파일러/린터 에러 |
| `nx_lsp_rename` | 프로젝트 전체 심볼 리네임 |
| `nx_lsp_code_actions` | 자동 수정/리팩토링 제안 |
| `nx_lsp_document_symbols` | 파일 내 심볼 목록 |
| `nx_lsp_workspace_symbols` | 프로젝트 전체 심볼 검색 |
| `nx_ast_search` | AST 패턴 검색 (tree-sitter) |
| `nx_ast_replace` | AST 패턴 치환 (dryRun 지원) |

LSP는 프로젝트 언어를 자동 감지합니다 (tsconfig.json → TypeScript 등).
AST는 `@ast-grep/napi` 필요: `bun install @ast-grep/napi`

</details>

<details>
<summary>Hook</summary>

Gate 단일 모듈로 동작합니다.

| 이벤트 | 역할 |
|--------|------|
| `SessionStart` | `.nexus/` 구조 초기화, agent-tracker 리셋 |
| `UserPromptSubmit` | 태그 감지 → 모드 활성화 + TASK_PIPELINE 주입 + additionalContext 안내 |
| `PreToolUse` | Edit/Write: tasks.json 미완료 시 차단 |
| `SubagentStart` | 에이전트 역할별 코어 지식 인덱스 자동 주입 (lazy-read) |
| `SubagentStop` | 에이전트 완료 기록. 미완료 태스크 경고 |
| `Stop` | pending 태스크 있으면 종료 차단. all completed면 nx_task_close 강제 |
| `PostCompact` | 세션 상태 스냅샷 (모드, 플랜, 에이전트 현황) |

</details>

<details>
<summary>프로젝트 지식</summary>

`.nexus/`에 프로젝트 지식과 런타임 상태를 저장합니다.

```
.nexus/
  memory/    — 학습한 교훈, 참고 자료
  context/   — 설계 원칙, 아키텍처 철학
  state/     — plan.json, tasks.json
  rules/     — 프로젝트 커스텀 규칙
  history.json
```

- `memory/`, `context/`, `rules/` — git 추적.
- `state/` — 런타임 상태. git 무시.
- `history.json` — 사이클 아카이브. git 추적.

</details>

<details>
<summary>런타임 상태</summary>

`.nexus/state/` 디렉토리에 런타임 상태가 저장됩니다. `.nexus/.gitignore`의 화이트리스트에 의해 자동 무시됩니다.

```
.nexus/state/
├── tasks.json          ← 태스크 목록 ([run] 사이클)
├── plan.json           ← 플랜 세션 ([plan] 사이클)
├── agent-tracker.json  ← 서브에이전트 라이프사이클
└── artifacts/          ← 산출물
```

</details>
