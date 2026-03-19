# claude-lattice

Claude Code용 에이전트 오케스트레이션 플러그인.

## 설치

```bash
claude plugin marketplace add https://github.com/moreih29/agents-devkit.git
claude plugin install claude-lattice@lattice
```

## 에이전트

에이전트는 Claude Code의 Agent 도구로 호출합니다.

| 에이전트 | 호출 | 역할 | 모델 |
|----------|------|------|------|
| **Scout** | `lattice:scout` | 코드 탐색, 파일 검색 | haiku |
| **Artisan** | `lattice:artisan` | 코드 구현, 리팩토링 | sonnet |
| **Sentinel** | `lattice:sentinel` | 검증, 보안 리뷰, 테스트 | sonnet |
| **Tinker** | `lattice:tinker` | 디버깅, 원인 분석 | sonnet |
| **Steward** | `lattice:steward` | 오케스트레이터 (직접 코드 안 씀) | opus |
| **Compass** | `lattice:compass` | 아키텍처 설계 (READ-ONLY) | opus |
| **Strategist** | `lattice:strategist` | 계획 수립 (READ-ONLY) | opus |
| **Lens** | `lattice:lens` | 코드 리뷰 (READ-ONLY) | opus |
| **Analyst** | `lattice:analyst` | 심층 분석, 리서치 (READ-ONLY) | opus |
| **Weaver** | `lattice:weaver` | 테스트 작성, 커버리지 분석 | sonnet |
| **Scribe** | `lattice:scribe` | 문서 작성, knowledge 업데이트 | haiku |

사용 예시:
```
Scout로 이 프로젝트의 API 엔드포인트 전부 찾아줘
Artisan으로 이 함수에 에러 핸들링 추가해줘
Lens로 이번 커밋 리뷰해줘
```

## 워크플로우

키워드를 입력하거나 `[태그]`를 사용하면 자동으로 활성화됩니다.

### Sustain — 멈추지 않고 계속

작업이 완료될 때까지 Claude가 중간에 멈추지 않습니다.

```
[sustain] 이 모듈 전체 리팩토링해줘
sustain mode on, 테스트 전부 통과할 때까지 계속해
멈추지 마, 끝까지 해
```

### Parallel — 병렬 실행

독립적인 태스크를 여러 에이전트에 동시에 배분합니다.

```
[parallel] README와 LICENSE 동시에 만들어줘
이 3개 파일 병렬로 리팩토링해
동시에 처리해줘
```

### Pipeline — 단계별 순차 실행

정의된 단계를 순서대로 실행합니다.

```
[pipeline] 분석→구현→테스트 순서로 진행해
순서대로 해줘
```

### Cruise — 전체 자동화

Pipeline + Sustain 조합. 분석→계획→구현→검증→리뷰를 한 번에 실행합니다.

```
[cruise] 사용자 인증 모듈을 만들어줘
cruise로 이 버그 고쳐줘
end to end로 진행해
```

해제는 자동이거나, 수동으로:
```
lat_state_clear({ key: "cruise" }) 호출해줘
```

## MCP 도구

Claude가 직접 호출하는 도구입니다.

### Core (8개)

| 도구 | 용도 |
|------|------|
| `lat_state_read/write/clear` | 워크플로우 상태 관리 |
| `lat_knowledge_read/write` | 프로젝트 지식 관리 (git 추적) |
| `lat_memo_read/write` | 세션/단기 메모 (휘발성) |
| `lat_context` | 현재 세션 상태 조회 |

### Code Intelligence (10개)

| 도구 | 용도 |
|------|------|
| `lat_lsp_hover` | 심볼 타입 정보 |
| `lat_lsp_goto_definition` | 정의 위치 이동 |
| `lat_lsp_find_references` | 참조 목록 |
| `lat_lsp_diagnostics` | 컴파일러/린터 에러 |
| `lat_lsp_rename` | 프로젝트 전체 심볼 리네임 |
| `lat_lsp_code_actions` | 자동 수정/리팩토링 제안 |
| `lat_lsp_document_symbols` | 파일 내 심볼 목록 |
| `lat_lsp_workspace_symbols` | 프로젝트 전체 심볼 검색 |
| `lat_ast_search` | AST 패턴 검색 (tree-sitter) |
| `lat_ast_replace` | AST 패턴 치환 (dryRun 지원) |

LSP는 프로젝트 언어를 자동 감지합니다 (tsconfig.json → TypeScript 등).
AST는 `@ast-grep/napi` 필요: `npm install @ast-grep/napi`

사용 예시:
```
lat_lsp_hover로 src/index.ts 10번줄 5번째 문자 타입 확인해줘
lat_ast_search로 "async function $NAME($$$)" 패턴 검색해줘
lat_context 호출해서 현재 상태 확인해줘
```

## 프로젝트 지식

`.claude/lattice/knowledge/` 디렉토리에 프로젝트 지식을 저장합니다. git으로 추적되어 팀원과 공유됩니다.

```
.claude/lattice/
├── knowledge/          ← 장기 프로젝트 지식
│   ├── architecture.md
│   ├── conventions.md
│   └── decisions/      ← 아키텍처 결정 근거
└── plans/              ← 브랜치별 구현 계획
```

## 런타임 상태

`.lattice/` 디렉토리에 세션별 상태가 저장됩니다. gitignore 대상입니다.

```
.lattice/
├── state/sessions/     ← 워크플로우 상태
├── memo/               ← 단기 메모
└── logs/               ← 디버깅 로그
```
