# oh-my-claudecode (OMC) — 심층 분석 레퍼런스

> 조사 일시: 2026-04-06
> 리포지토리: Yeachan-Heo/oh-my-claudecode (v4.10.2, 11k stars)
> 플랫폼: Claude Code 플러그인

---

## 1. 훅 시스템

### hooks.json 전체 구조

11개 Claude Code 훅 이벤트 사용, 총 ~19개 훅 핸들러:

| 이벤트 | 핸들러 수 | 주요 스크립트 |
|--------|----------|-------------|
| UserPromptSubmit | 2 | keyword-detector.mjs, skill-injector.mjs |
| SessionStart | 3 | session-start.mjs, project-memory-session, setup-init/maintenance |
| PreToolUse | 1 | pre-tool-enforcer.mjs |
| PermissionRequest | 1 | permission-handler.mjs (matcher: "Bash") |
| PostToolUse | 2 | post-tool-verifier.mjs, project-memory-posttool |
| PostToolUseFailure | 1 | post-tool-use-failure.mjs |
| SubagentStart | 1 | subagent-tracker.mjs (start) |
| SubagentStop | 2 | subagent-tracker.mjs (stop), verify-deliverables.mjs |
| PreCompact | 2 | pre-compact.mjs, project-memory-precompact |
| Stop | 3 | context-guard-stop.mjs, persistent-mode.cjs, code-simplifier.mjs |
| SessionEnd | 1 | session-end.mjs |

실행 패턴: `node "$CLAUDE_PLUGIN_ROOT"/scripts/run.cjs "$CLAUDE_PLUGIN_ROOT"/scripts/<name>.mjs`

### 각 훅 상세

#### UserPromptSubmit — keyword-detector.mjs

매직 키워드 감지 → 스킬 자동 로딩. 우선순위 순:

```
cancelomc/stopomc → ralph → autopilot → ultrawork → ccg → ralplan →
deep-interview → ai-slop-cleaner → tdd → code-review → security-review →
ultrathink → deepsearch → analyze
```

**정교한 안전장치:**
- `sanitizeForKeywordDetection()`: XML 태그, URL, 파일경로, 코드블록 제거 후 감지
- `isInformationalKeywordContext()`: "what is ralph?" 같은 질문 맥락(80자 윈도우)이면 무시
- `OMC_TEAM_WORKER` 환경변수 체크: 팀 워커 내에서는 키워드 감지 비활성화 (무한 루프 방지)
- team 키워드는 자동 감지에서 제외 — `/team` 명시적 호출만 허용
- 한국어/일본어/중국어 동의어 지원 (`울트라워크`, `랄프`, `오토파일럿` 등)

출력: `hookSpecificOutput.additionalContext`에 SKILL.md 직접 임베드

#### UserPromptSubmit — skill-injector.mjs

학습된 커스텀 스킬 자동 주입:
- 탐색 위치: `.omc/skills/` (프로젝트), `~/.omc/skills/` (전역), `~/.claude/skills/omc-learned/` (레거시)
- `<mnemosyne>` 태그로 감싸서 최대 5개 주입
- 세션당 중복 주입 방지 캐시

#### PreToolUse — pre-tool-enforcer.mjs

에이전트 모델 티어 런타임 강제:
- `agents/*.md`의 YAML frontmatter에서 `model:` 필드 읽기
- 서브에이전트가 올바른 모델 사용 여부 확인
- 경로 순회 방지: 에이전트 이름에 `/` 포함 시 차단

#### PostToolUse — post-tool-verifier.mjs

- `<remember>` 태그 파싱: `<remember>` (7일), `<remember priority>` (영구) → notepad에 저장
- 에이전트 출력 분석 (12,000자 제한)

#### SubagentStart/Stop — subagent-tracker.mjs

- 서브에이전트 추적, HUD 메트릭 업데이트
- Stop 시 `verify-deliverables.mjs` 실행 → 완료 약속 없이 종료 시 재실행 유도

#### PreCompact — pre-compact.mjs

컨텍스트 압축 전 중요 상태를 notepad/project-memory에 저장

#### Stop — context-guard-stop.mjs

- 컨텍스트 사용량 임계값(기본 75%) 초과 시 `{ decision: "block" }` → 세션 리프레시 권유
- 최대 2회 block (무한루프 방지)
- `context_limit` 이유 stop은 절대 block 안 함

#### Stop — persistent-mode.cjs

- ralph/autopilot/ultrawork/ultraqa/team/pipeline 활성 모드 감지 시 `{ decision: "block" }`
- "The boulder never stops" 메시지로 지속 실행 강제

#### Stop — code-simplifier.mjs

코드 품질 자동 검사 및 간소화

---

## 2. 에이전트 시스템 (29개)

### 에이전트 정의 방식

파일: `agents/*.md`, YAML frontmatter 구조:
```yaml
---
name: executor
description: Focused task executor for implementation work (Sonnet)
model: claude-sonnet-4-6
level: 2
---
```

### 전체 에이전트 목록

#### 실행 계열
| 에이전트 | 모델 | level | 특이사항 |
|---------|------|-------|---------|
| executor | sonnet | 2 | 코드 구현 전담 |
| executor-low | haiku | 1 | 간단한 작업 |
| executor-high | opus | 3 | 복잡한 리팩토링 |

#### 탐색/분석 계열
| 에이전트 | 모델 | level | 특이사항 |
|---------|------|-------|---------|
| explore | haiku | 1 | 읽기 전용, 탐색 특화 |
| explore-high | opus | 2 | 복잡한 탐색 |
| architect | opus | 3 | `disallowedTools: Write, Edit` |
| architect-low | haiku | 1 | 읽기 전용 |
| architect-medium | sonnet | 2 | 읽기 전용 |
| analyst | opus | 3 | `disallowedTools: Write, Edit` — 요구사항 분석 |

#### 계획/검토 계열
| 에이전트 | 모델 | level | 특이사항 |
|---------|------|-------|---------|
| planner | opus | 4 | `.omc/plans/*.md` 생성, 코드 수정 불가 |
| critic | opus | 3 | 플랜 검토 및 반론 |
| verifier | sonnet | 3 | 완료 검증 |

#### 전문 계열
| 에이전트 | 모델 | level | 특이사항 |
|---------|------|-------|---------|
| debugger | sonnet | 3 | 루트 원인 분석 |
| designer / designer-low / designer-high | sonnet/haiku/opus | 1-3 | UI/UX |
| document-specialist | sonnet | 2 | 문서/API 조사 |
| qa-tester | sonnet | 3 | tmux 세션으로 CLI 테스트 |
| security-reviewer / security-reviewer-low | opus/haiku | 1,3 | 보안 검토 |
| code-reviewer | opus | 3 | 코드 리뷰 |
| test-engineer | sonnet | 3 | TDD |
| tracer | sonnet | 3 | 인과관계 추적 |
| scientist / scientist-high | sonnet/opus | 3-4 | 데이터/ML 분석 |
| git-master | sonnet | 2 | Git 작업 |
| writer | haiku | 1 | 문서 작성 |
| code-simplifier | opus | 3 | 코드 간소화 |
| vision | sonnet | 2 | 이미지/다이어그램 분석 |

### 설계 특징

- 같은 역할을 haiku(low)/sonnet(medium)/opus(high)로 **3단계 티어** 제공
- 각 에이전트에 `<Why_This_Matters>`, `<Constraints>`, `<Investigation_Protocol>`, `<Failure_Modes_To_Avoid>` 섹션
- `pre-tool-enforcer`가 frontmatter `model:` 필드 기반으로 런타임 모델 강제
- architect/analyst는 `disallowedTools`로 Write/Edit 완전 차단

---

## 3. MCP 도구

### 서버 설정

`.mcp.json`에서 서버명 `"t"` — **토큰 절약** 목적의 1글자 이름.

### 도구 전체 목록

#### LSP (12개)
`lsp_hover`, `lsp_goto_definition`, `lsp_find_references`, `lsp_document_symbols`, `lsp_workspace_symbols`, `lsp_diagnostics`, `lsp_diagnostics_directory`, `lsp_servers`, `lsp_prepare_rename`, `lsp_rename`, `lsp_code_actions`, `lsp_code_action_resolve`

#### AST (2개, ast-grep 기반)
- `ast_grep_search` — 패턴 매칭 (메타변수 `$VAR`, `$$$` 지원)
- `ast_grep_replace` — 구조적 코드 변환 (dryRun 옵션)

#### 상태 관리 (5개)
`state_read`, `state_write`, `state_clear`, `state_list_active`, `state_get_status`

#### 노트패드 (4개)
`notepad_read`, `notepad_write_priority`, `notepad_write_working`, `notepad_write_manual`

#### 프로젝트 메모리 (4개)
`project_memory_read`, `project_memory_write`, `project_memory_add_note`, `project_memory_add_directive`

#### 스킬 (3개)
`load_omc_skills_local`, `load_omc_skills_global`, `list_omc_skills`

#### 기타
`python_repl`, `session_search`, trace 도구들, shared_memory 도구들, `deepinit_manifest`

### 도구 그룹 비활성화

`OMC_DISABLE_TOOLS` 환경변수: `lsp`, `ast`, `python`, `state`, `notepad`, `memory`, `skills`, `trace`, `shared-memory`, `deepinit`, `interop`

---

## 4. 스킬 (32개)

### 핵심 스킬

| 스킬 | 트리거 키워드 | 용도 |
|------|-------------|------|
| `ralph` | "ralph", "don't stop", "must complete" | PRD 기반 지속 루프. `prd.json`에 user stories 관리, `passes: true`까지 반복 |
| `autopilot` | "autopilot", "build me", "create me" | 전체 자율 실행 파이프라인 |
| `ultrawork` | "ultrawork", "ulw", "uw" | 최대 병렬 실행 |
| `team` | 명시적 `/team`만 | N:에이전트타입 팀 편성 |
| `ralplan` | "ralplan" | 합의 기반 반복 플래닝 |
| `ccg` | "ccg" | Claude+Codex+Gemini 3모델 통합 |
| `deep-interview` | "deep-interview", "ouroboros" | Socratic 요구사항 명확화 |
| `ai-slop-cleaner` | "deslop", "anti-slop" | AI 생성 코드 정리 |

### 유틸리티 스킬

| 스킬 | 용도 |
|------|------|
| `cancel` | 모든 활성 모드 취소 |
| `learner` | 세션에서 재사용 가능한 패턴 추출 |
| `omc-setup` | 설치 마법사 |
| `hud` | HUD/상태바 설정 |
| `deepinit` | 계층적 AGENTS.md 생성 |
| `omc-plan` | 플래닝 워크플로우 |
| `project-session-manager` | worktree + tmux 환경 관리 |
| `trace` | 증거 기반 추적 레인 |
| `ultraqa` | QA 집중 모드 |
| `self-improve` | 자기 개선 모드 |
| `release` | 릴리즈 자동화 |
| `omc-doctor` | 설치 진단 |

---

## 5. 설정 및 구조

### 디렉토리 구조

```
oh-my-claudecode/
├── .claude-plugin/plugin.json     # 플러그인 메타
├── .mcp.json                      # MCP 서버 (서버명 "t")
├── CLAUDE.md                      # 오케스트레이션 지침 자동 주입
├── AGENTS.md                      # 에이전트 카탈로그
├── agents/*.md                    # 에이전트 정의 (29개)
├── hooks/hooks.json               # 훅 설정
├── scripts/*.mjs                  # 훅 스크립트
├── skills/*/SKILL.md              # 스킬 (32개)
├── src/mcp/                       # MCP 서버 구현
├── src/tools/                     # 도구 구현
├── src/hooks/                     # 훅 로직
├── src/team/                      # 팀 런타임
└── bridge/mcp-server.cjs          # 컴파일된 MCP 번들
```

### 상태 저장 경로

```
.omc/state/                          # 모드 상태 파일
.omc/state/sessions/{sessionId}/     # 세션 스코프 상태
.omc/notepad.md                      # 노트패드 (priority/working/manual)
.omc/project-memory.json             # 프로젝트 메모리
.omc/plans/                          # 플랜 파일
.omc/skills/                         # 프로젝트 학습 스킬
~/.omc/skills/                       # 전역 학습 스킬
```

### CLAUDE.md 주입 내용

`<!-- OMC:START -->` ~ `<!-- OMC:END -->` 블록:
- 오케스트레이션 원칙 (`<operating_principles>`)
- 위임 규칙 (`<delegation_rules>`)
- 모델 라우팅 (`<model_routing>`)
- 에이전트 카탈로그 (`<agent_catalog>`)
- MCP 도구 목록 (`<tools>`)
- 스킬 + 키워드 트리거 (`<skills>`)
- 팀 파이프라인 (`<team_pipeline>`)
- 커밋 프로토콜 (`<commit_protocol>`) — Git trailer 규약

### 환경변수

| 변수 | 용도 |
|------|------|
| `DISABLE_OMC=1` | 모든 OMC 훅 비활성화 |
| `OMC_SKIP_HOOKS` | 쉼표 구분 개별 훅 비활성화 |
| `OMC_STATE_DIR` | 중앙화 상태 디렉토리 |
| `OMC_CONTEXT_GUARD_THRESHOLD` | 컨텍스트 경고 임계값 (기본 75%) |
| `OMC_QUIET` | 출력 억제 레벨 |
| `OMC_TEAM_WORKER` | 팀 워커 마킹 (키워드 감지 비활성화) |
| `OMC_DISABLE_TOOLS` | MCP 도구 그룹 비활성화 |
| `OMC_LSP_TIMEOUT_MS` | LSP 타임아웃 (기본 15000ms) |

---

## 6. 특별한 패턴

### 키워드 감지 안전장치
XML/URL/코드블록 제거 후 감지, 질문 맥락 무시, 팀 워커 내 비활성화, 다국어 동의어 지원

### SKILL.md 직접 임베드
`Skill` 도구 대신 파일 내용을 `additionalContext`에 직접 삽입. 플러그인 시스템 무관하게 동작.

### 에이전트 티어 시스템
같은 역할 haiku/sonnet/opus 3단계. pre-tool-enforcer가 런타임 강제.

### 무한루프 방지
- team 키워드 자동감지 제거 (워커 재귀 스폰 방지)
- `OMC_TEAM_WORKER` 환경변수
- context_limit Stop은 block 불가
- context-guard-stop 최대 2회 block

### PRD 기반 ralph 루프
`prd.json`에 user stories 관리, `passes: true`까지 반복. `--critic=architect|critic|codex` 검증자 선택.

### 다중 AI 제공자 통합
`omc team N:codex`, `omc team N:gemini`으로 tmux에 Codex/Gemini CLI 워커 스폰. `/ccg`로 3모델 종합.
