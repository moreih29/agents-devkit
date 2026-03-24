# Nexus 시스템 아키텍처

## 프로젝트 정체성

**Nexus**는 Claude Code를 위한 에이전트 오케스트레이션 플러그인이다.
oh-my-claudecode(omc)와 oh-my-opencode(omo)의 심층 분석을 기반으로, 두 시스템의 장점을 살리고 단점을 보완하여 설계되었다.

- **npm 패키지:** `claude-nexus`
- **플러그인명:** `nexus`
- **CLI:** `nx`
- **MCP 서버명:** `nx`

## 핵심 설계 원칙

### 1. 선택적 격리
- 모든 훅은 hooks.json 기반 별도 프로세스 (Claude Code 플러그인 아키텍처 제약)
- Phase별 최적화 전략: 경량 스크립트(P1) → 선택적 등록(P2) → 상주 데몬(P3, 필요 시)
- omc의 이중 스폰(`run.cjs → spawnSync → target.mjs`)을 단일 CJS 스크립트로 개선

### 2. 컨텍스트가 곧 오케스트레이션
- 에이전트 오케스트레이션의 본질 = 최적화된 컨텍스트를 역할에 맞게 주입
- 이중 저장소: `.claude/nexus/` (git, 공유 지식) + `.nexus/` (gitignore, 런타임)

### 3. 기능 기반 네이밍
- 신화/메타포 없이 역할을 직접 서술하는 이름
- Engineer(구현+디버깅), Architect(설계), QA(검증), Director(방향/우선순위) 등

### 4. 점진적 복잡성
- 6가지 워크플로우 스킬: consult, dev, research, init, setup, sync
- 에이전트 위임은 LLM이 결정 (게이트 키워드 감지 + 적응형 라우팅)
- 에이전트는 필요성 입증 후 추가 (YAGNI)

## 이중 저장소 구조

```
.claude/nexus/           ← git 추적 (프로젝트 공유 지식)
├── knowledge/             ← 장기 프로젝트 지식
│   ├── architecture.md    ← 이 파일
│   ├── conventions.md     ← 코딩 컨벤션
│   └── decisions/         ← 아키텍처 결정 근거 (ADR)
└── plans/                 ← 브랜치별 구현 계획

.nexus/                  ← .gitignore (휘발성 런타임)
├── branches/              ← 브랜치별 격리
│   └── {branch}/
│       ├── tasks.json     ← 태스크 목록
│       ├── decisions.json ← 아키텍처 결정 목록
│       └── reports/       ← 리서치 산출물
└── sync-state.json        ← 마지막 sync 커밋
```

## 플러그인 구조

```
claude-nexus/
├── .claude-plugin/
│   ├── plugin.json        ← 플러그인 매니페스트
│   └── marketplace.json   ← 마켓플레이스 메타데이터
├── .mcp.json              ← MCP 서버 설정
├── agents/                ← 마크다운 에이전트 정의
├── skills/                ← 워크플로우 스킬
├── hooks/hooks.json       ← 훅 등록
├── scripts/               ← 훅 실행 스크립트 (CJS)
├── bridge/mcp-server.cjs  ← MCP 서버 번들
├── src/                   ← TypeScript 소스
└── package.json
```

## 기술 스택

| 항목 | 선택 |
|------|------|
| 런타임 | Node.js >= 20 |
| 빌드 | esbuild |
| 테스트 | bash E2E (test/e2e.sh) |
| 스키마 | Zod (strict) |
| MCP | @modelcontextprotocol/sdk |
| 패키지 | bun |

## 에이전트 시스템

### 개발 팀 (4개)
| 이름 | 역할 | model |
|------|------|-------|
| Director | 프로젝트 방향/스코프/우선순위 (태스크 소유자) | opus |
| Architect | 아키텍처 설계 + 코드 리뷰 | opus |
| Engineer | 코드 구현 + 디버깅 | sonnet |
| QA | 검증/테스트/보안 | sonnet |

### 리서치 팀 (3개)
| 이름 | 역할 | model |
|------|------|-------|
| Principal | 리서치 방향/아젠다/확증편향 방지 (태스크 소유자) | opus |
| Postdoc | 방법론 설계/증거 종합/synthesis 작성 | opus |
| Researcher | 웹 검색/독립 조사/데이터 분석 | sonnet |

## 훅 모듈 (1 스크립트 + MCP)

| 모듈 | 실행 방식 | 담당 이벤트 | 역할 |
|------|-----------|-------------|------|
| Gate | hooks.json (별도 프로세스) | Stop, PreToolUse, UserPromptSubmit | tasks.json pending 체크 → Stop 차단, team 모드 Agent 직접 호출 차단, 키워드 감지 (consult/dev/research/[d]) |
| Memory | MCP 도구 (nx_* 호출 시) | — | knowledge, task, decision CRUD (훅이 아닌 MCP 도구 그룹) |

## MCP 도구 (Core + Code Intel)

### Core
`nx_knowledge_read/write`, `nx_context`, `nx_task_list/add/update/clear`, `nx_decision_add`

### Code Intelligence (nx 서버 통합)
- LSP: `nx_lsp_hover`, `nx_lsp_goto_definition`, `nx_lsp_find_references`, `nx_lsp_diagnostics`, `nx_lsp_rename`, `nx_lsp_code_actions`, `nx_lsp_document_symbols`, `nx_lsp_workspace_symbols`
- AST: `nx_ast_search`, `nx_ast_replace` (@ast-grep/napi, tree-sitter 기반)
- 다언어 지원: TypeScript, Python, Rust, Go (자동 감지)
- LSP 멀티 클라이언트 (언어별 lazy init + persistent connection)
- LSP 서버 common paths 자동 탐색 (~/.cargo/bin, ~/go/bin, ~/.local/bin)

## 스킬 시스템

| 스킬 | 유형 | 설명 |
|------|------|------|
| Consult | 대화형 | 원칙 기반 프라이머 + [d] 자기강화 루프. 상담 전용, 실행 없음 |
| Dev | 실행형 | [dev] 태그: Lead 자율 판단(sub 또는 team). [dev!] 태그: 반드시 팀 구성. Director가 태스크 소유 |
| Research | 실행형 | [research] 태그: Lead 자율 판단. [research!] 태그: 반드시 팀 구성. Principal이 태스크 소유 |
| Init | 온보딩 | 기존 프로젝트에 Nexus 도입 시 knowledge 자동 생성 |
| Setup | 유틸리티 | 플러그인 초기 설정 |
| Sync | 유틸리티 | git diff 기반 소스 변경점 감지, knowledge drift 탐지 및 수정 (STALE/MISSING/ORPHAN) |

## 참조 문서

- `.claude/contexts/resources/omc/` — oh-my-claudecode 레퍼런스 분석 10개
- `.claude/contexts/resources/omo/` — oh-my-opencode 레퍼런스 분석 10개
- `.claude/contexts/resources/design-rationale.md` — 설계 근거 요약 (omc/omo 비판 + 설계 결정 맥락)
