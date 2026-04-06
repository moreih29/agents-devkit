# oh-my-openagent (OMO) — 심층 분석 레퍼런스

> 조사 일시: 2026-04-06
> 리포지토리: code-yeongyu/oh-my-openagent (구 oh-my-opencode)
> 플랫폼: OpenCode (https://opencode.ai) 플러그인
> 런타임: TypeScript/Bun

---

## 1. 훅 시스템

### OpenCode 플랫폼 훅 이벤트

Claude Code와 **이름 체계가 다름:**

| OpenCode 이벤트 | Claude Code 대응 |
|----------------|-----------------|
| `tool.execute.before` | PreToolUse |
| `tool.execute.after` | PostToolUse |
| `session.created` | SessionStart |
| `session.compacted` | PreCompact/PostCompact |
| `session.deleted` | SessionEnd |
| `session.idle` | (해당 없음) |
| `session.error` | StopFailure |
| `permission.asked` | PermissionRequest |
| `permission.replied` | PermissionDenied (+ allow) |
| `file.edited` | FileChanged |
| `todo.updated` | TaskCompleted |
| `tui.prompt.command.execute` | UserPromptSubmit (부분) |
| `lsp.client.diagnostics` | (해당 없음) |

추가 OpenCode 전용 이벤트: `message.part.removed`, `message.updated`, `tui.prompt.append`, `tui.toast.show`, `lsp.updated`, `installation.updated`, `server.connected`, `shell.env`

### omo 자체 훅 아키텍처 — 52개, 7계층 티어

| 티어 | 개수 | 역할 | 예시 |
|------|------|------|------|
| Tier 1: Pre-Processing | ~4 | 초기 메시지 검증, 모드 감지 | keyword-detector |
| Tier 2: Transform | ~5 | API 호출 전 컨텍스트 변환 | context-window-monitor |
| Tier 3: Params | ~2 | API 파라미터 조정 | model-fallback |
| Tier 4: Error Recovery | ~4 | API 실패/재시도 | anthropic-context-window-limit-recovery |
| Tier 5: Pre-Tool | ~10 | 도구 실행 전 검증 | hashline-edit-validator |
| Tier 6: Post-Tool | ~13 | 도구 출력 검증/변환 | comment-checker |
| Tier 7: Session | ~5 | 세션 라이프사이클 | session-recovery |

구조: Core(43) + Continuation(7) + Skill(2) = **52개**

### 주요 훅 상세

| 훅 | 티어 | 역할 |
|----|------|------|
| `todo-continuation-enforcer` | 5 | Boulder 메커니즘 — TODO 미완료 시 에이전트 복귀 강제 |
| `context-window-monitor` | 2 | 컨텍스트 창 사용량 모니터링 |
| `preemptive-compaction` | 2 | 선제적 컨텍스트 압축 |
| `session-recovery` | 7 | 세션 장애 복구 |
| `anthropic-context-window-limit-recovery` | 4 | Anthropic API 컨텍스트 한계 복구 |
| `comment-checker` | 6 | AI 생성 주석 자동 제거 |
| `hashline-read-enhancer` | 5 | Hashline 읽기 시 해시 앵커 주입 |
| `hashline-edit-validator` | 5 | Hashline 편집 시 해시 검증 |
| `model-fallback` | 3 | API 실패 시 자동 대체 모델 전환 |
| `keyword-detector` | 1 | ultrawork 등 키워드 감지 |
| `claude-code-hooks` | - | **Claude Code 호환 레이어** — CC 설정 그대로 작동 |
| `ralph-loop` | 7 | Ralph 지속 실행 루프 |

### Claude Code 훅과의 비교

| 항목 | Claude Code | OpenCode/omo |
|------|-------------|-------------|
| 이벤트명 | PreToolUse, PostToolUse 등 | tool.execute.before/after 등 |
| 이벤트 수 (플랫폼) | ~26 | ~20 |
| 자체 훅 수 | 플러그인 의존 | **52개** (7계층 티어) |
| 설정 파일 | hooks.json (JSON) | opencode.json (JSON) |
| 호환 레이어 | - | `claude-code-hooks` 훅으로 CC 설정 지원 |

---

## 2. 에이전트 시스템 (11개)

### 에이전트 목록

| 에이전트 | 역할 | 기본 모델 | 모드 | 도구 제한 |
|---------|------|---------|------|----------|
| **Sisyphus** | 메인 오케스트레이터 | Opus 4.6 / Kimi K2.5 | all | 읽기/위임만 |
| **Hephaestus** | 자율 심층 작업 실행 | GPT-5.4 medium | all | 전체 편집 |
| **Prometheus** | 전략적 계획 수립 | Opus 4.6 | 계획 전용 | 계획 도구만 |
| **Oracle** | 아키텍처/디버깅 컨설턴트 | GPT-5.4 high | subagent | 읽기만 |
| **Librarian** | 외부 문서/코드 검색 | minimax-m2.7 | subagent | 검색 도구만 |
| **Explore** | 코드베이스 탐색 | grok-code-fast-1 | subagent | grep/AST만 |
| **Atlas** | 다단계 할일 조율 | — | 내부 전용 | 작업 도구 |
| **Metis** | 사전 분석 컨설턴트 | — | — | 읽기만 |
| **Momus** | 계획 검토자 | — | — | 읽기만 |
| **Multimodal-Looker** | PDF/이미지 분석 | — | — | 비전 도구 |
| **Sisyphus-Junior** | 범주별 자동 실행자 | 범주 기반 | — | 범주 제한 |

### 오케스트레이션 방식

**위임 도구 2가지:**
1. `task()` / `delegate_task` — 카테고리 기반 (visual-engineering, deep, ultrabrain 등)
2. `call_omo_agent()` — 특정 에이전트 직접 지명

**에이전트 모드:**
- `primary`: UI에서 선택된 모델 사용
- `subagent`: 자체 폴백 체인 사용
- `all`: 양쪽 모두

**모델 해석 4단계:** override → category-default → provider-fallback → system-default

### 시스템 프롬프트 설계

- Claude 계열: **mechanics-driven** (체크리스트형, ~1,100줄)
- GPT 계열: **principle-driven** (원칙 기반, ~121줄)
- 모델 교체 시 프롬프트 자동 전환

### 계층적 컨텍스트 (AGENTS.md)

```
/init-deep 커맨드로 생성
project/
├── AGENTS.md          (프로젝트 전체)
├── src/AGENTS.md      (src 전용)
└── components/AGENTS.md (컴포넌트 전용)
```

---

## 3. 도구 (26개)

### 작업 관리
`task_create`, `task_list`, `task_get`, `task_update`

### 위임/실행
`delegate_task`, `call_omo_agent`, `background_task`, `background_output`, `background_cancel`

### LSP
`lsp_goto_definition`, `lsp_find_references`, `lsp_rename`, `lsp_diagnostics`

### 코드 검색
`ast_grep_search`, `ast_grep_replace`, `grep`, `glob`

### 편집
- **`hashline_edit`** — 각 줄에 콘텐츠 해시 앵커 부여. 파일 변경 시 해시 검증으로 손상 방지.
  - **성과:** Grok Code Fast 기준 편집 성공률 6.7% → 68.3% (10배 향상)
- `look_at` — 파일 미리보기

### 시스템
`interactive_bash` (tmux 기반), `skill`

---

## 4. 스킬 (6개 내장 + 확장)

### 내장 스킬

| 스킬 | 용도 |
|------|------|
| `git-master` | 원자적 커밋, 리베이스, 히스토리 분석 |
| `playwright` | Playwright MCP 브라우저 자동화 |
| `playwright-cli` | Playwright CLI 자동화 |
| `agent-browser` | Vercel agent-browser CLI |
| `dev-browser` | 상태 유지 브라우저 스크립팅 |
| `frontend-ui-ux` | 디자이너 관점 UI/UX 개발 |

### Copilot 포트 추가 스킬
`handoff`, `ralph-loop`, `init-deep`, `start-work`, `stop-continuation`, `refactor`

### 스킬 구조

```
.opencode/skills/[skill-name]/SKILL.md
~/.config/opencode/skills/[skill-name]/SKILL.md
```

특징: 스킬별 **자체 MCP 서버를 온디맨드로 실행** 가능

---

## 5. 아키텍처

### 플러그인 초기화 파이프라인

```
loadPluginConfig() → createManagers() → createTools() → createHooks() → createPluginInterface()
```

진입점: `src/index.ts`의 `OhMyOpenCodePlugin` 함수

### 핵심 매니저 4개

| 매니저 | 역할 |
|--------|------|
| BackgroundManager | 비동기 작업 라이프사이클 + 동시성 제어 |
| SkillMcpManager | 세션당 MCP 서버 온디맨드 실행 |
| TmuxSessionManager | 터미널 격리 (interactive_bash) |
| ConfigHandler | 6단계 설정 로딩/병합 |

### 설정 체계

```
opencode.json                                # 플러그인 등록
oh-my-openagent.jsonc                        # 프로젝트 설정 (JSONC, 주석 허용)
~/.config/opencode/oh-my-openagent.jsonc     # 전역 설정
```

병합 규칙:
- 깊은 병합: `agents`, `categories`, `claude_code` 객체
- 합집합: `disabled_*` 배열
- 덮어쓰기: 기타 필드

### MCP 3계층

1. 기본 제공: Exa 웹 검색, Context7 문서, grep.app GitHub 검색
2. Claude Code MCPs: OpenCode 생태계 호환
3. 스킬 임베드 MCPs: 스킬 정의 내 자체 MCP

### 배경 작업 동시성 제어

```json
{
  "background_task": {
    "providerConcurrency": { "anthropic": 3, "openai": 3 },
    "modelConcurrency": { "anthropic/claude-opus-4-6": 2 }
  }
}
```

---

## 6. Claude Code 생태계와의 비교

| 항목 | Claude Code (Nexus) | omo (OpenCode) |
|------|---------------------|----------------|
| 플랫폼 | Claude Code CLI | OpenCode (다중 제공자) |
| 훅 이벤트명 | PreToolUse 등 | tool.execute.before 등 |
| 자체 훅 수 | 플러그인 의존 | 52개 (7계층 티어) |
| 모델 지원 | Claude 전용 | Claude, GPT, Gemini, Grok, Kimi 등 |
| 에이전트 수 | 9개 (Nexus) / 29개 (omc) | 11개 |
| 백그라운드 실행 | 없음 (순차) | BackgroundManager 병렬 비동기 |
| 편집 도구 | 표준 Edit | **Hashline** (해시 앵커 검증) |
| 터미널 | 기본 bash | **Tmux 기반** interactive_bash |
| 설정 형식 | JSON | **JSONC** (주석 허용) |
| 스킬 MCP | 없음 | 스킬별 **온디맨드 MCP** |
| CC 호환 | - | `claude-code-hooks` 호환 레이어 |

### omo 독창적 기능

1. **Hashline 편집** — 해시 앵커로 에디트 성공률 10배 향상
2. **Ralph Loop** — 완료까지 자기참조 루프 (Boulder 메커니즘)
3. **IntentGate** — 요청 의도 사전 분류 → 추론 수준 자동 조정
4. **모델별 이중 프롬프트** — Claude: 체크리스트형(1,100줄), GPT: 원칙형(121줄)
5. **카테고리 기반 위임** — 작업 성격별 모델 자동 라우팅
6. **Claude Code 호환 레이어** — CC 설정/훅을 OpenCode에서 그대로 사용
7. **배경 작업 동시성 제어** — 제공자/모델별 동시 실행 수 제한
