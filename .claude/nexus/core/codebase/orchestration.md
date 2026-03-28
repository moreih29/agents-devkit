<!-- tags: orchestration, gate, tags, agents, skills, consult, rules -->
# Orchestration

## Tag System

Gate hook의 `UserPromptSubmit` 이벤트에서 사용자 프롬프트의 태그를 감지하여 모드를 활성화한다.

### 명시적 태그 (EXPLICIT_TAGS)

| 태그 | primitive | 스킬 |
|------|-----------|------|
| `[consult]` | consult | nx-consult (기존 consult.json 있으면 세션 이어감, 없으면 새 세션 시작) |
| `[dev]` | dev | nx-dev |
| `[dev!]` | dev! | nx-dev |
| `[research]` | research | nx-research |
| `[research!]` | research! | nx-research |
| `[d]` | — | consult.json 유무로 분기: 있으면 nx_consult_decide, 없으면 nx_decision_add |

### 자연어 패턴 (NATURAL_PATTERNS)

consult만 등록: `상담`, `어떻게 하면 좋을까`, `뭐가 좋을까`, `방법을 찾아` 등.
dev/research는 오탐 위험으로 자연어 패턴 없음 — 태그 전용.

### 오탐 방지

- 에러/버그 맥락 (fix, bug, error + primitive 이름) → 스킵
- 질문 맥락 ("dev가 뭐야", "explain consult") → 스킵
- 인용 맥락 (`` `dev` ``, `"research"`) → 스킵

## Gate Hook 동작

### CLAUDE.md 자동 동기화 (UserPromptSubmit 시)

`$CLAUDE_PLUGIN_ROOT/templates/nexus-section.md`와 CLAUDE.md 마커 내용을 콘텐츠 비교:
- 글로벌 `~/.claude/CLAUDE.md`: 다르면 자동 교체
- 프로젝트 `./CLAUDE.md`: 다르면 1회 알림 (`.nexus/claudemd-notified` 플래그)

### Stop 이벤트
`tasks.json`에 pending 태스크가 있으면 `continue: true`로 종료 차단 (nonstop). 모두 completed이면 `nx_task_close` 강제 (아카이브 없이 종료 불가).

### PreToolUse 이벤트

`Edit`/`Write` 도구 호출 시:
- isNexusInternalPath → 허용
- `tasks.json` 없음 → 차단 (nx_task_add 필수)
- all completed / 빈 배열 → 차단 (nx_task_close 필수)

`Agent` 도구 호출 시:
- Explore agent → 항상 허용
- `team_name` 있음 → 허용 (TeamCreate 기반 teammate)
- 그 외 → 허용

### UserPromptSubmit 이벤트

태그 정규식: `/\[(consult|dev!?|research!?)\]/i` — Nexus 태그만 직접 검색 (이미지 `[Image #n]` 등에 간섭 방지).

`PRIMITIVE_HANDLERS` 맵 기반 dispatch → 모드별 핸들러 함수 호출:
- consult: consult.json 존재 여부 체크 → 있으면 세션 이어감, 없으면 새 세션 시작 안내.
- dev/research: TASK_PIPELINE 주입 + Sub/Team 판단 가이드 + main/master 브랜치 경고 조건부 주입
- dev!/research!: GUIDELINES (소프트 가이드) + 워크플로우 요약 + Spawn example 주입 + main/master 브랜치 경고 조건부 주입. "BLOCKED" 아닌 "Avoid" 톤.

태그 없음 fallback:
- tasks.json 없음 → TASK_PIPELINE 선제 주입
- tasks.json 있음 → stale cycle 경고

`[d]` 태그: postDecisionRules 주입 (결정만 기록, 구현 시 task 파이프라인 필수).

### Consult 세션 규칙

- `[consult]` 태그 사용 시 consult.json 존재 여부로 분기:
  - 있으면: nx_consult_status 확인 후 nx_consult_update(add)로 논점 추가 안내
  - 없으면: MANDATORY nx_consult_start 호출 + SKILL.md 참조 안내 (gate.ts에서 간소화된 지시)
- 세션은 nx_task_close 호출 시 history.json에 아카이브되어 종료됨.
- cleanupConsult() 제거됨 — 모드 전환(dev/research 등) 시 consult.json을 삭제하지 않음.

### Consult 경량 컨텍스트 주입 (consultReminder)

consult.json이 존재하는 동안, 태그 없는 멀티턴 대화에서도 매 UserPromptSubmit마다 경량 컨텍스트를 주입:
- 주제명 + 현재 논점(discussing 또는 next pending) + remaining 수
- 최소 가이드: "comparison table + pros/cons, [d]로 기록"
- withNotices()에 통합되어 모든 additionalContext에 자동 병합

### Rules 커스터마이징 흐름

사용자가 커스텀 규칙/원칙을 요청할 때:
1. `nx_rules_read`로 기존 rules 확인
2. 대화로 내용 구체화
3. `nx_rules_write`로 `.claude/nexus/rules/{name}.md`에 저장

규칙은 자동으로 승격되지 않음 — 사용자가 명시적으로 요청할 때만 생성.

### 사이클 종료 (nx_task_close)
모든 태스크 완료 후 `nx_task_close` 호출 → consult+decisions+tasks를 history.json에 아카이브 → 소스 파일 삭제. 모드 전환 시 consult.json은 유지됨 (자동 삭제 없음).

## Agent Catalog (6개)

| Agent | Model | MaxTurns | 제한 | 카테고리 | 역할 |
|-------|-------|----------|------|----------|------|
| director | opus | 30 | Edit, Write, NotebookEdit 불가 | Decide | Why/What, 태스크 소유, nx_task_add 권한 |
| architect | opus | 25 | Edit, Write, NotebookEdit 불가 | How | 기술 자문, 읽기 전용 |
| postdoc | opus | 25 | Edit, Bash, NotebookEdit 불가 | How | 방법론 설계, synthesis 문서 작성 |
| engineer | sonnet | 20 | 제한 없음 | Do | 코드 구현, 디버깅 |
| researcher | sonnet | 20 | 제한 없음 | Do | 웹 검색, 독립 조사 (3회 실패 시 탈출) |
| qa | sonnet | 20 | 제한 없음 | Check | 테스트, 검증, 보안 리뷰 |

## Skill Catalog (5개)

| 스킬 | 트리거 | Sub Path | Team Path |
|------|--------|----------|-----------|
| nx-consult | [consult] | 구조화된 5단계 상담 (탐색→논점도출→선택지→결정→완료). consult.json 필수. 사용자 요청 시 nx_rules_write로 커스텀 rules 생성 안내. | — |
| nx-dev | [dev]/[dev!] | Lead 분석→Engineer 스폰. nx_task_add/close 사용. Phase 1에서 nx_rules_read(tags: ["dev"])로 팀 rules 확인 후 우선 적용. Branch Guard: main/master면 자동 브랜치 생성 (feat/, fix/, chore/) + nx_branch_migrate로 상태 이동. 모드 고지 + 판단 근거 표시. | Director+Architect 합의→Engineer+QA 실행. Phase 1 briefing에 nx_rules_read(tags: ["dev"]) 결과 포함. Branch Guard + nx_branch_migrate 포함. 모드 고지 + 판단 근거 표시. |
| nx-research | [research]/[research!] | Lead 분석→Researcher 스폰. nx_task_add/close 사용. Phase 1에서 nx_rules_read(tags: ["research"])로 팀 rules 확인 후 우선 적용. Branch Guard: main/master면 자동 브랜치 생성 (research/, feat/) + nx_branch_migrate로 상태 이동. 모드 고지 + 판단 근거 표시. 리포트 없음. | Director+Postdoc 스코프→Researcher 조사→Converge. Phase 1 briefing에 nx_rules_read(tags: ["research"]) 결과 포함. Branch Guard + nx_branch_migrate 포함. 리포트 필수. 모드 고지 + 판단 근거 표시. |
| nx-setup | /claude-nexus:nx-setup | 대화형 설정 마법사 (templates/nexus-section.md에서 Nexus 섹션 읽기) | — |
| nx-sync | /claude-nexus:nx-sync | git diff 기반 drift 감지+수정 (첫 실행=자동 생성, --reset=초기화, Phase 0.5=CLAUDE.md 체크) | — |