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

`/claude-nexus:nx-sync`를 처음 실행하면 프로젝트를 스캔해 `.claude/nexus/knowledge/`에 지식을 자동 생성합니다.

**첫 사용**

- **상담**: `[consult] 인증 시스템 어떻게 설계하면 좋을까?` — 실행 전 의도 파악, 설계 상담
- **개발**: `[dev] 로그인 API 구현해줘` — 에이전트 팀이 분석부터 구현까지 실행
- **리서치**: `[research] React vs Svelte 성능 비교` — 독립 조사 후 synthesis 문서 작성

## 사용법

| 태그 | 동작 | 예시 |
|------|------|------|
| `[consult]` | 실행 전 상담, 의도 파악 | `[consult] DB 마이그레이션 전략 논의` |
| `[dev]` | 개발 실행 (Sub/Team 자동 판단) | `[dev] 결제 모듈 리팩토링` |
| `[dev!]` | 팀 모드 강제 | `[dev!] 인증 시스템 전면 개편` |
| `[research]` | 리서치 실행 (Sub/Team 자동 판단) | `[research] 캐싱 전략 비교 분석` |
| `[research!]` | 리서치 팀 강제 | `[research!] 경쟁사 기술 스택 조사` |

흐름: `[consult]`로 방향을 잡은 뒤 `[dev]` 또는 `[research]`로 실행합니다.

## 에이전트

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

| 스킬 | 트리거 | 설명 |
|------|--------|------|
| **nx-consult** | `[consult]` | 구조화된 상담. 요구사항 정리 → 결정 기록(`[d]`) → 실행 태그 추천 |
| **nx-dev** | `[dev]` / `[dev!]` | 개발 실행. 복잡도에 따라 단독 또는 팀(Director→Architect→Engineer→QA) 자동 편성 |
| **nx-research** | `[research]` / `[research!]` | 리서치 실행. 복잡도에 따라 단독 또는 팀(Principal→Postdoc→Researcher) 자동 편성 |
| **nx-setup** | `/claude-nexus:nx-setup` | 대화형 설정. CLAUDE.md에 에이전트/스킬/태그 설정 주입 |
| **nx-sync** | `/claude-nexus:nx-sync` | 첫 실행 시 knowledge 자동 생성, 이후 소스 변경과의 불일치 감지 및 수정. --reset으로 초기화 가능 |

## 고급 기능

<details>
<summary>MCP 도구</summary>

Claude가 직접 호출하는 도구입니다.

### Core (9개)

| 도구 | 용도 |
|------|------|
| `nx_knowledge_read/write` | 프로젝트 지식 관리 (git 추적) |
| `nx_context` | 현재 세션 상태 조회 (브랜치, 태스크, 결정) |
| `nx_task_list/add/update/clear` | tasks.json 기반 태스크 관리 |
| `nx_decision_add` | 아키텍처 결정 기록 |
| `nx_artifact_write` | 팀 산출물 저장 (브랜치별 격리) |
| `nx_consult_start` | 상담 세션 시작 (토픽 + 논점 등록) |
| `nx_consult_status` | 상담 상태 조회 |
| `nx_consult_decide` | 논점 결정 처리 (consult.json + decisions.json) |

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
| `UserPromptSubmit` | 프롬프트 전처리 및 컨텍스트 주입 |
| `Stop` | 세션 종료 후처리 |

</details>

<details>
<summary>프로젝트 지식</summary>

`.claude/nexus/knowledge/`에 프로젝트 지식을 저장합니다. git으로 추적됩니다.

- `nx-sync` 첫 실행 시 프로젝트에 맞는 knowledge 파일을 자동 생성합니다 (구조 고정 아님)
- `config.json`에 Nexus 설정이 저장됩니다

</details>

<details>
<summary>런타임 상태</summary>

`.nexus/` 디렉토리에 런타임 상태가 저장됩니다. gitignore 대상입니다.

```
.nexus/
├── branches/               ← 브랜치별 격리
│   └── {branch}/
│       ├── tasks.json      ← 태스크 목록
│       ├── decisions.json  ← 아키텍처 결정 목록
│       ├── consult.json   ← 상담 논점 추적 (상담 중에만 존재)
│       └── artifacts/      ← 팀 산출물
└── sync-state.json         ← 마지막 sync 커밋
```

</details>
