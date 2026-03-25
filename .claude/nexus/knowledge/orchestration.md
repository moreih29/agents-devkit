<!-- tags: orchestration, gate, tags, agents, skills, consult -->
<!-- tags: orchestration, gate, tags, agents, skills, consult -->
# Orchestration

## Tag System

Gate hook의 `UserPromptSubmit` 이벤트에서 사용자 프롬프트의 태그를 감지하여 모드를 활성화한다.

### 명시적 태그 (EXPLICIT_TAGS)

| 태그 | primitive | 스킬 |
|------|-----------|------|
| `[consult]` | consult | nx-consult |
| `[consult:new]` | consult | nx-consult (기존 상담 초기화 후 새 토픽) |
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
`tasks.json`에 pending 태스크가 있으면 `continue: true`로 종료 차단 (nonstop). 모두 completed이면 pass.

### PreToolUse 이벤트
`Agent` 도구 호출 시:
- Explore agent → 항상 허용
- `team_name` 있음 → 허용 (TeamCreate 기반 teammate)
- `tasks.json` 존재 + `team_name` 없음 → 차단 (팀 모드에서 직접 Agent() 금지)

### UserPromptSubmit 이벤트
태그 감지 → 모드별 `additionalContext` 주입:
- consult: 구조화된 8단계 상담 절차 (논점 분해, 비교 테이블, 추천 불렛 등)
- dev: Sub/Team 판단 가이드
- dev!: 팀 모드 강제 + 상세 워크플로우
- research: Sub/Team 판단 가이드
- research!: 팀 모드 강제 + 상세 워크플로우

### 모드 전환 시 Cleanup
dev/dev!/research/research! 활성화 시 `cleanupConsult()` 호출 → consult.json 삭제.

## Agent Catalog (7개)

### Dev Team
| Agent | Model | MaxTurns | 제한 | 역할 |
|-------|-------|----------|------|------|
| director | opus | 25 | Edit, Write, NotebookEdit 불가 | Why/What, 태스크 소유, nx_task_add 권한 |
| architect | opus | 25 | Edit, Write, NotebookEdit 불가 | How, 기술 자문, 읽기 전용 |
| engineer | sonnet | 20 | 제한 없음 | 코드 구현, 디버깅 |
| qa | sonnet | 20 | 제한 없음 | 테스트, 검증, 보안 리뷰 |

### Research Team
| Agent | Model | MaxTurns | 제한 | 역할 |
|-------|-------|----------|------|------|
| principal | opus | 25 | Edit, Write, Bash, NotebookEdit 불가 | 리서치 방향, 확증편향 방지 |
| postdoc | opus | 25 | Edit, Bash, NotebookEdit 불가 | 방법론 설계, synthesis 문서 작성 |
| researcher | sonnet | 20 | 제한 없음 | 웹 검색, 독립 조사 (3회 실패 시 탈출) |

## Skill Catalog (5개)

| 스킬 | 트리거 | Sub Path | Team Path |
|------|--------|----------|-----------|
| nx-consult | [consult]/[consult:new] | 구조화된 5단계 상담 (탐색→논점도출→선택지→결정→완료) + consult.json 추적 | — |
| nx-dev | [dev]/[dev!] | Lead 분석→Engineer 스폰 (decisions.json 참조) | Director+Architect 합의→Engineer+QA 실행 (decisions.json 참조) |
| nx-research | [research]/[research!] | Lead 분석→Researcher 스폰 (decisions.json 참조) | Principal+Postdoc 스코프→Researcher 조사→Postdoc synthesis (decisions.json 참조) |
| nx-setup | /claude-nexus:nx-setup | 대화형 설정 마법사 (templates/nexus-section.md에서 Nexus 섹션 읽기) | — |
| nx-sync | /claude-nexus:nx-sync | git diff 기반 drift 감지+수정 (첫 실행=자동 생성, --reset=초기화, Phase 0.5=CLAUDE.md 체크) | — |