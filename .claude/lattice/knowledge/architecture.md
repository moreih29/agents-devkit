# Lattice 시스템 아키텍처

## 프로젝트 정체성

**Lattice**는 Claude Code를 위한 에이전트 오케스트레이션 플러그인이다.
oh-my-claudecode(omc)와 oh-my-opencode(omo)의 심층 분석을 기반으로, 두 시스템의 장점을 살리고 단점을 보완하여 설계되었다.

- **npm 패키지:** `claude-lattice`
- **플러그인명:** `lattice`
- **CLI:** `lat`
- **MCP 서버명:** `lat`

## 핵심 설계 원칙

### 1. 선택적 격리
- 모든 훅은 hooks.json 기반 별도 프로세스 (Claude Code 플러그인 아키텍처 제약)
- Phase별 최적화 전략: 경량 스크립트(P1) → 선택적 등록(P2) → 상주 데몬(P3, 필요 시)
- omc의 이중 스폰(`run.cjs → spawnSync → target.mjs`)을 단일 CJS 스크립트로 개선

### 2. 컨텍스트가 곧 오케스트레이션
- 에이전트 오케스트레이션의 본질 = 최적화된 컨텍스트를 역할에 맞게 주입
- 이중 저장소: `.claude/lattice/` (git, 공유 지식) + `.lattice/` (gitignore, 런타임)
- 에이전트별 context 수준: minimal / standard / full

### 3. 기능 기반 네이밍
- 신화/메타포 없이 역할을 직접 서술하는 이름
- Steward(오케스트레이터), Artisan(구현), Scout(탐색), Compass(설계) 등

### 4. 점진적 복잡성
- 3가지 워크플로우 프리미티브: Sustain + Parallel + Pipeline
- omc의 10개 모드를 프리미티브 조합으로 표현
- 에이전트는 필요성 입증 후 추가 (YAGNI)

## 이중 저장소 구조

```
.claude/lattice/           ← git 추적 (프로젝트 공유 지식)
├── knowledge/             ← 장기 프로젝트 지식
│   ├── architecture.md    ← 이 파일
│   ├── conventions.md     ← 코딩 컨벤션
│   └── decisions/         ← 아키텍처 결정 근거 (ADR)
└── plans/                 ← 브랜치별 구현 계획

.lattice/                  ← .gitignore (휘발성 런타임)
├── state/sessions/        ← 세션별 워크플로우 상태
├── memo/                  ← 단기 메모 (session/day/week)
├── cache/                 ← 임시 캐시
└── logs/                  ← 디버깅 로그
```

## 플러그인 구조

```
claude-lattice/
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
| 빌드 | tsc + esbuild |
| 테스트 | Vitest |
| 스키마 | Zod (strict) |
| MCP | @modelcontextprotocol/sdk |
| 패키지 | npm |

## 에이전트 시스템

### context 수준별 주입
```
[minimal] 1. 에이전트 프롬프트 → 2. appendPrompt
[standard] + 3. knowledge → 4. plans/{branch} → 5. 세션 메모 → 6. 워크플로우 상태
[full] + 7. knowledge/decisions
```

### Phase 1 에이전트 (MVP)
| 이름 | 역할 | tier | context |
|------|------|------|---------|
| Steward | 오케스트레이터 | high (opus) | full |
| Artisan | 코드 구현 | medium (sonnet) | standard |
| Scout | 코드 탐색 | low (haiku) | minimal |
| Compass | 아키텍처 설계 | high (opus) | full |
| Sentinel | 검증/보안 | medium (sonnet) | standard |

### Phase 2 에이전트
| 이름 | 역할 | tier | context |
|------|------|------|---------|
| Strategist | 계획 수립 | high (opus) | full |
| Lens | 코드 리뷰 | high (opus) | full |
| Analyst | 심층 분석/리서치 | high (opus) | full |
| Tinker | 디버거 | medium (sonnet) | standard |

### Phase 3 에이전트
| 이름 | 역할 | tier | context |
|------|------|------|---------|
| Weaver | 테스트 엔지니어 | medium (sonnet) | standard |
| Scribe | 문서 작성 | low (haiku) | minimal |

## 훅 모듈 (5개)

| 모듈 | 실행 방식 | 담당 이벤트 | 역할 |
|------|-----------|-------------|------|
| Gate | hooks.json (별도 프로세스) | Stop, UserPromptSubmit | Sustain/Parallel/Pipeline Stop 차단, 키워드 감지 (sustain/parallel/pipeline/cruise) |
| Pulse | hooks.json (별도 프로세스) | PreToolUse, PostToolUse | 컨텍스트 주입 (Whisper 패턴 + 활성 워크플로우 상태 + 에이전트별 수준 분기), Guard 내장 |
| Memory | MCP 도구 (lat_* 호출 시) | 에이전트의 도구 호출 | knowledge, memo, state CRUD |
| Tracker | hooks.json (별도 프로세스) | SubagentStart/Stop, Session | 에이전트/세션 추적 |
| Guard | Pulse 내장 + lat_context | PreToolUse (Pulse 경유) | Context window 모니터링 |

## MCP 도구 (8개 Core + 10개 Code Intel)

### Core
`lat_state_read/write/clear`, `lat_knowledge_read/write`, `lat_memo_read/write`, `lat_context`

### Code Intelligence (lat 서버 통합)
- LSP: `lat_lsp_hover`, `lat_lsp_goto_definition`, `lat_lsp_find_references`, `lat_lsp_diagnostics`, `lat_lsp_rename`, `lat_lsp_code_actions`, `lat_lsp_document_symbols`, `lat_lsp_workspace_symbols`
- AST: `lat_ast_search`, `lat_ast_replace` (@ast-grep/napi, tree-sitter 기반)
- 다언어 지원: TypeScript, Python, Rust, Go (자동 감지)
- LSP 멀티 클라이언트 (언어별 lazy init + persistent connection)
- LSP 서버 common paths 자동 탐색 (~/.cargo/bin, ~/go/bin, ~/.local/bin)

## 스킬 시스템

| 스킬 | 프리미티브 | 설명 |
|------|-----------|------|
| Sustain | Sustain | Stop 차단, 지속 실행 |
| Parallel | Parallel | 독립 태스크 병렬 배분 |
| Pipeline | Pipeline | 단계별 순차 실행 |
| Cruise | Pipeline + Sustain | 분석→계획→구현→검증→리뷰 전체 자동화 |
| Sync Knowledge | — (유틸리티) | 소스 코드와 knowledge 문서 간 불일치 탐지 및 수정 |

## 참조 문서

- `.claude/contexts/resources/omc/` — oh-my-claudecode 레퍼런스 분석 10개
- `.claude/contexts/resources/omo/` — oh-my-opencode 레퍼런스 분석 10개
- `.claude/contexts/resources/design-rationale.md` — 설계 근거 요약 (omc/omo 비판 + 설계 결정 맥락)
