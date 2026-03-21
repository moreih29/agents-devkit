# claude-nexus

[![npm version](https://img.shields.io/npm/v/claude-nexus)](https://www.npmjs.com/package/claude-nexus)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/moreih29/claude-nexus/blob/main/LICENSE)

Claude Code를 위한 에이전트 오케스트레이션 플러그인. 전문화된 에이전트와 스킬을 통해 코드, 분석, 설계, 테스트, 문서화를 체계적으로 관리합니다.

## 설치

```bash
claude plugin marketplace add https://github.com/moreih29/claude-nexus.git
claude plugin install claude-nexus@nexus
```

## 에이전트

10개의 특화된 에이전트가 각각의 역할을 담당합니다.

| 에이전트 | 호출 | 역할 | 모델 |
|----------|------|------|------|
| **Finder** | `nexus:finder` | 코드 탐색, 파일 검색 | haiku |
| **Builder** | `nexus:builder` | 코드 구현, 리팩토링 | sonnet |
| **Debugger** | `nexus:debugger` | 디버깅, 원인 분석 | sonnet |
| **Tester** | `nexus:tester` | 테스트 작성, 커버리지 분석 | sonnet |
| **Guard** | `nexus:guard` | 검증, 보안 리뷰 | sonnet |
| **Writer** | `nexus:writer` | 문서 작성, 지식 관리 | haiku |
| **Analyst** | `nexus:analyst` | 심층 분석, 리서치 | opus |
| **Architect** | `nexus:architect` | 아키텍처 설계 (읽기 전용) | opus |
| **Strategist** | `nexus:strategist` | 계획 수립 (읽기 전용) | opus |
| **Reviewer** | `nexus:reviewer` | 코드 리뷰 (읽기 전용) | opus |

## 스킬

대화형 워크플로우를 통해 복잡한 작업을 단계별로 진행합니다.

| 스킬 | 트리거 | 설명 |
|------|--------|------|
| **nx-consult** | `[consult]` 또는 "어떻게 하면 좋을까" | 사용자 의도를 파악하고 최적의 접근 방식을 탐색 |
| **nx-plan** | `[plan]` 또는 "계획 세워" | 다중 에이전트 합의 루프로 검토된 계획 생성 |
| **nx-init** | `[init]` 또는 "온보딩" | 프로젝트를 Nexus에 온보드 - 기존 문서 스캔하여 지식 생성 |
| **nx-setup** | `[setup]` 또는 "nexus 설정" | Nexus 대화형 설정 마법사 |
| **nx-sync** | `[sync]` 또는 "지식 동기화" | 소스 코드와 지식 문서 간 불일치 감지 및 수정 |

## MCP 도구

Claude가 직접 호출하는 도구입니다.

### Core (4개)

| 도구 | 용도 |
|------|------|
| `nx_state_read/write/clear` | 워크플로우 상태 관리 |
| `nx_knowledge_read/write` | 프로젝트 지식 관리 (git 추적) |
| `nx_context` | 현재 세션 상태 조회 |

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

## 프로젝트 지식

`.claude/nexus/knowledge/` 디렉토리에 팀이 공유하는 장기 프로젝트 지식을 저장합니다. git으로 추적됩니다.

```
.claude/nexus/
├── knowledge/              ← 공유 지식 (git 추적)
│   ├── architecture.md
│   ├── agents-catalog.md
│   ├── conventions.md
│   ├── workflows.md
│   ├── hook-modules.md
│   ├── mcp-tools.md
│   ├── dev-workflow.md
│   └── decisions/          ← 아키텍처 결정 기록
├── config.json             ← Nexus 설정
└── plans/                  ← 브랜치별 구현 계획
    └── feature--*/
        └── plan.md
```

## 런타임 상태

`.nexus/` 디렉토리에 세션별 상태가 저장됩니다. gitignore 대상입니다.

```
.nexus/
├── state/
│   ├── current-session.json
│   └── sessions/{sessionId}/
│       ├── workflow.json
│       ├── agents.json
│       ├── codebase-profile.json
│       └── whisper-tracker.json
└── plans/                  ← 브랜치별 실행 계획
    └── {branch}/
        ├── plan.md
        └── tasks.json
```
