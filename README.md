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

특화된 에이전트가 각각의 역할을 담당합니다.

### 개발 팀 (4개)

| 에이전트 | 호출 | 역할 | 모델 |
|----------|------|------|------|
| **Director** | `claude-nexus:director` | 프로젝트 방향, 스코프, 우선순위 판단 | opus |
| **Architect** | `claude-nexus:architect` | 기술 설계, 아키텍처 리뷰 (읽기 전용) | opus |
| **Engineer** | `claude-nexus:engineer` | 코드 구현, 디버깅 | sonnet |
| **QA** | `claude-nexus:qa` | 검증, 테스트, 보안 리뷰 | sonnet |

### 리서치 팀 (3개)

| 에이전트 | 호출 | 역할 | 모델 |
|----------|------|------|------|
| **Principal** | `claude-nexus:principal` | 리서치 방향, 아젠다, 확증편향 방지 | opus |
| **Postdoc** | `claude-nexus:postdoc` | 방법론 설계, 증거 평가, synthesis 문서 작성 | opus |
| **Researcher** | `claude-nexus:researcher` | 웹 검색, 독립 조사, 출처 보고 | sonnet |

## 스킬

대화형 워크플로우를 통해 복잡한 작업을 단계별로 진행합니다.

| 스킬 | 트리거 | 설명 |
|------|--------|------|
| **nx-consult** | `[consult]` 또는 "어떻게 하면 좋을까" | 원칙 기반 상담 + [d] 자기강화 루프 — 실행 전 의도 파악 |
| **nx-dev** | `[dev]` / `[dev!]` | Sub/Team 자동 판단. Director가 태스크 소유, nonstop 실행 |
| **nx-research** | `[research]` / `[research!]` | 리서치 팀(principal+postdoc+researcher) 구성 및 조사 실행 |
| **nx-init** | `[init]` 또는 "온보딩" | 프로젝트를 Nexus에 온보드 - 기존 문서 스캔하여 지식 생성 |
| **nx-setup** | `[setup]` 또는 "nexus 설정" | Nexus 대화형 설정 마법사 |
| **nx-sync** | `[sync]` 또는 "지식 동기화" | 소스 코드와 지식 문서 간 불일치 감지 및 수정 |

## MCP 도구

Claude가 직접 호출하는 도구입니다.

### Core (5개)

| 도구 | 용도 |
|------|------|
| `nx_knowledge_read/write` | 프로젝트 지식 관리 (git 추적) |
| `nx_context` | 현재 세션 상태 조회 |
| `nx_task_list/add/update/clear` | tasks.json 기반 태스크 관리 |
| `nx_decision_add` | 아키텍처 결정 기록 |

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

## Hook

Gate 단일 모듈로 동작합니다 (v2에서 3개 → 1개로 통합).

| 이벤트 | 역할 |
|--------|------|
| `UserPromptSubmit` | 프롬프트 전처리 및 컨텍스트 주입 |
| `Stop` | 세션 종료 후처리 |

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

`.nexus/` 디렉토리에 런타임 상태가 저장됩니다. gitignore 대상입니다.

```
.nexus/
├── branches/               ← 브랜치별 격리
│   └── {branch}/
│       ├── tasks.json      ← 태스크 목록
│       ├── decisions.json  ← 아키텍처 결정 목록
│       └── reports/        ← 리서치 산출물
└── sync-state.json         ← 마지막 sync 커밋
```
