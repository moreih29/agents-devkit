<!-- tags: orchestration, gate, tags, agents, skills, consult, rules -->
# Orchestration

## Tag System

Gate hook의 `UserPromptSubmit` 이벤트에서 사용자 프롬프트의 태그를 감지하여 모드를 활성화한다. 태그 없는 메시지는 기본 오케스트레이션으로 동작.

### 명시적 태그

| 태그 | 동작 |
|------|------|
| `[consult]` | nx-consult 스킬 로딩. 기존 consult.json 있으면 세션 이어감, 없으면 새 세션 시작. **조사 강제 프롬프트 주입** |
| `[d]` | consult.json 유무로 분기: 있으면 nx_consult_decide, 없으면 nx_decision_add |

### 자연어 패턴 (NATURAL_PATTERNS)

consult만 등록: `상담`, `어떻게 하면 좋을까`, `뭐가 좋을까`, `방법을 찾아` 등.

### 오탐 방지

- 에러/버그 맥락 (fix, bug, error + primitive 이름) → 스킵
- 질문 맥락 ("consult가 뭐야") → 스킵
- 인용 맥락 (`` `consult` ``, `"consult"`) → 스킵

## Gate Hook 동작

gate.ts 단일 모듈이 7개 이벤트를 처리. 이벤트 판별: `process.env.NEXUS_EVENT`로 SessionStart/SubagentStart/Stop 구분, 그 외는 필드 존재 여부(tool_name→PreToolUse, prompt→UserPromptSubmit, 없음→Stop).

### CLAUDE.md 자동 동기화 (UserPromptSubmit 시)

`$CLAUDE_PLUGIN_ROOT/templates/nexus-section.md`와 CLAUDE.md 마커 내용을 콘텐츠 비교:
- 글로벌 `~/.claude/CLAUDE.md`: 다르면 자동 교체
- 프로젝트 `./CLAUDE.md`: 다르면 1회 알림 (`.nexus/claudemd-notified` 플래그)

### SessionStart 이벤트
NEXUS_EVENT=SessionStart. `sessions/{sessionId}/` 세션 디렉토리 생성 + agent-tracker.json 초기화. `current-session` 파일에 sessionId 기록. "Session started." 컨텍스트 반환.

### SubagentStart 이벤트
NEXUS_EVENT=SubagentStart. `sessions/{parentSessionId}/agent-tracker.json`에 에이전트 추가 (agent_type, agent_id, started_at, status: running).

### SubagentStop 이벤트
NEXUS_EVENT=SubagentStop. `sessions/{parentSessionId}/agent-tracker.json`에서 해당 에이전트 상태 업데이트 (status: completed, last_message, stopped_at).

### Stop 이벤트
`tasks.json`에 pending 태스크가 있으면 `continue: true`로 종료 차단 (nonstop). 모두 completed이면 `nx_task_close` 강제.

### PreToolUse 이벤트

`Edit`/`Write` 도구 호출 시:
- isNexusInternalPath → 허용
- `tasks.json` 없음 → 차단 (nx_task_add 필수)
- all completed / 빈 배열 → 차단 (nx_task_close 필수)
- **edit-tracker**: 같은 파일 3회 수정 시 경고, 5회 시 차단. 에스컬레이션: Director → Lead → 사용자.

`Agent` 도구 호출 시:
- Explore agent → 항상 허용
- `team_name` 있음 → 허용
- 그 외 → 허용

`nx_task_update` MCP 도구 호출 시:
- **reopen-tracker**: status가 "pending"(reopen)이면 해당 태스크 reopen 횟수 카운팅. 3회 경고, 5회 차단. Circuit Breaker 패턴.

`nx_task_close` MCP 도구 호출 시:
- **Check 경고**: edit-tracker 파일 3개+ AND `sessions/{currentSession}/agent-tracker.json`에 qa/reviewer 없음 → 경고 (block 아님). "Check agent가 스폰되지 않았습니다."

### UserPromptSubmit 이벤트

태그 정규식: `/\[(consult)\]/i`.

`[consult]` 감지 시:
- consult.json 존재 여부 분기 (세션 이어감 / 새 세션 시작)
- **조사 강제**: 기존 세션·신규 세션 모두 Explore+researcher 병렬 스폰 강제. 조사 완료 전 nx_consult_start/논의 금지.

`[d]` 감지 시:
- postDecisionRules 주입 (결정만 기록, 구현 시 task 파이프라인 필수)
- consult.json 유무로 nx_consult_decide / nx_decision_add 분기

태그 없음 fallback (기본 오케스트레이션):
- tasks.json 없음 → TASK_PIPELINE + Branch Guard + **Lead 직접 실행 조건** ("3조건 모두 충족 시에만 직접 실행: 정확한 변경 지시 + 단일 파일 + 코드 구조 이해 불필요. 그 외 → How agent(Architect/Postdoc/Strategist) 먼저 스폰.")
- tasks.json 있음 + pending → 스마트 resume ("nx_task_list 확인. stale 판단 → close/재등록 또는 이어가기.")
- tasks.json 있음 + all completed → nx_task_close 안내

### Consult 경량 컨텍스트 주입 (consultReminder)

consult.json이 존재하는 동안, 태그 없는 멀티턴에서도 매 UserPromptSubmit마다 경량 주입:
- 주제명 + 현재 논점 + remaining 수
- withNotices()에 통합

### 사이클 종료 (nx_task_close)
모든 태스크 완료 후 호출 → consult+decisions+tasks를 history.json에 아카이브 → 소스 파일 삭제.

## Agent Catalog (9개)

| Agent | Model | MaxTurns | 제한 | 카테고리 | 역할 |
|-------|-------|----------|------|----------|------|
| architect | opus | 25 | Edit, Write, NotebookEdit, nx_task_add, nx_task_update 불가 | How | 기술 자문, 계획 검증 gate |
| postdoc | opus | 25 | Edit, Bash, NotebookEdit, nx_task_add, nx_task_update 불가 | How | 방법론 설계, synthesis, 계획 검증 gate |
| designer | opus | 25 | Edit, Write, NotebookEdit, nx_task_add, nx_task_update 불가 | How | UI/UX 설계, 인터랙션 패턴 |
| strategist | opus | 25 | Edit, Write, NotebookEdit, nx_task_add, nx_task_update 불가 | How | 비즈니스 전략, 시장 분석 |
| engineer | sonnet | 25 | nx_task_add 불가 | Do | 코드 구현, 디버깅, codebase/ 즉시 갱신 |
| researcher | sonnet | 20 | nx_task_add 불가 | Do | 웹 검색, 독립 조사, reference/ 즉시 기록 |
| writer | sonnet | 25 | nx_task_add 불가 | Do | 기술 문서, 프레젠테이션 |
| qa | sonnet | 20 | nx_task_add 불가 | Check | 코드 검증, 테스트, 보안 리뷰 |
| reviewer | sonnet | 20 | nx_task_add 불가 | Check | 콘텐츠 검증, 출처 확인, 문법/포맷 교정 |

### 카테고리별 병렬 상한
- How: 최대 4
- Do/Check: 무제한

### 2 파이프라인
- 코드: Architect/Designer → Engineer → QA
- 콘텐츠: Postdoc/Strategist → Researcher/Writer → Reviewer

## Skill Catalog (4개)

| 스킬 | 트리거 | 설명 |
|------|--------|------|
| nx-consult | [consult] | 구조화된 5단계 상담. [consult] 태그 시 조사 강제 주입. |
| nx-run | (기본 동작) | 동적 구성 실행. Lead 3조건 직접 실행 또는 How agent 경유. 9개 에이전트 + 2 파이프라인. 구조화된 위임 포맷(TASK/CONTEXT/CONSTRAINTS/ACCEPTANCE). |
| nx-init | /claude-nexus:nx-init | 풀 온보딩: 프로젝트 스캔 → identity 수립 → codebase 생성 → rules 설정. --reset, --cleanup 지원. |
| nx-setup | /claude-nexus:nx-setup | 대화형 config.json 설정 마법사. |

### 하네스 메커니즘 요약
- **Task Pipeline**: tasks.json 없으면 Edit/Write 차단
- **edit-tracker**: 파일 수준 루프 감지 (3경고/5차단)
- **reopen-tracker**: 태스크 수준 Circuit Breaker (3경고/5차단)
- **agent-tracker**: SubagentStart/Stop 훅으로 세션별(`sessions/{sessionId}/`) 에이전트 생명주기 추적
- **Check 경고**: nx_task_close 시 파일 3개+ AND QA/Reviewer 없으면 경고
- **SessionStart**: 세션 디렉토리 생성 + agent-tracker 초기화 + current-session 기록
- **Stop nonstop**: pending 태스크 시 종료 차단
- **스마트 Resume**: tasks.json 존재 시 stale 판단 프롬프트

### Memory 자동 기록
- nx_task_close 시 memoryHint 반환 (taskCount, decisionCount, hadLoopDetection, cycleTopics)
- Lead가 memoryHint 기반으로 교훈 추출 → nx_core_write(layer: "memory") 기록

### 정보 기록 패턴 (4계층 일관)
- codebase/: Engineer 즉시 갱신
- reference/: Researcher 즉시 기록
- memory/: task_close 자동

### disallowedTools 선언적 관리
플랫폼 수준에서 에이전트별 MCP 도구 차단. `mcp__plugin_claude-nexus_nx__nx_task_add` 등. How/Do/Check 에이전트는 nx_task_add 차단. How 에이전트는 nx_task_update도 차단.
