---
name: nx-dev
description: Development execution — sub-agent or team mode based on Lead's judgment.
trigger_display: "[dev] / [dev!]"
purpose: "Development execution — sub-agent or team mode"
triggers: ["dev", "dev!", "개발", "구현"]
---
# Dev

Lead가 요청 복잡도를 판단해 Sub Path 또는 Team Path로 실행한다.

## Trigger

- `[dev]` — Lead 자율 판단 (sub 또는 team)
- `[dev!]` — Team Path 강제
- Direct invocation: `/claude-nexus:nx-dev`

---

## Sub Path

`[dev]` + Lead가 단순하다 판단 시 (1-3개 태스크 수준, cross-cutting concerns 없음).

**[dev] Lead 판단: 도구 0회, 요청 텍스트만으로 직감 추정. 4+ 서브태스크 또는 cross-cutting concerns 감지 시 Team Path.**

### Phase 1: Analyze (Lead 직접)

- 사용자에게 모드 고지: "[dev] sub-agent 모드로 처리합니다"
- Lead가 직접 분석 도구 사용 (Read, Grep, LSP, AST 등) — team path와 다름
- decisions.json이 있으면 `nx_context`로 기존 결정 사항을 확인하고 맥락에 반영
- `nx_rules_read(tags: ["dev"])`로 팀 rules 확인. 있으면 스킬 기본 원칙보다 우선 적용.
- TodoWrite로 할일 목록 생성 (status: "pending") + **반드시 `nx_task_add`로 동일 태스크 등록** (history 아카이브용)
- 계획을 사용자에게 보여준 뒤 Spawn으로 진입

### Phase 2: Spawn

```
Agent({ subagent_type: "claude-nexus:engineer", prompt: "..." })  // team_name 없이 direct spawn
```

- 독립 태스크 병렬 스폰 가능
- Agent() blocking — Lead가 결과 직접 수신
- 완료마다 TodoWrite 갱신

### Phase 3: Verify (조건부)

변경 파일 3개 이상, 기존 테스트 모듈 수정, 또는 Lead 판단 시 QA 스폰. 아니면 Lead 직접 확인.

### Phase 4: Done

- TodoWrite 전체 "completed" 확인
- `nx_task_close` 호출 → consult+decisions+tasks를 history.json에 아카이브 후 삭제
- 사용자에게 결과 보고

---

## Team Path

`[dev!]` 또는 `[dev]` + Lead가 복잡하다 판단 시.

Phase: **intake → design → execute → complete**

### Phase 1: Intake (Lead)

사용자 요청/의도/맥락만 정리. **분석/코드 도구 호출 금지.**

- 사용자에게 모드 고지: "[dev] 팀을 구성합니다"
- 목표, 범위, 의도 정리 → briefing 작성
- decisions.json이 있으면 기존 결정 사항을 briefing에 포함 (`nx_context`로 조회)
- `nx_rules_read(tags: ["dev"])`로 팀 rules 조회. 있으면 briefing에 포함하여 팀원에게 전달, 스킬 기본 원칙보다 우선.
- Branch Guard: main/master면 feature 브랜치 생성
- TeamCreate + director/architect 병렬 스폰

```
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "claude-nexus:director", name: "director", team_name: "<project>",
  prompt: "knowledge/decisions/프로젝트 맥락 분석 → Why/What 관점 정리. architect와 SendMessage로 토론 후 합의. 합의 완료 후 nx_task_add()로 태스크 확정. 브리핑: {briefing}" })
Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "<project>",
  prompt: "코드/기술 현황 분석 → How 관점 정리. director와 SendMessage로 토론 후 합의. 기술 이슈 발생 시 engineer에게 에스컬레이션 받아 처리." })
```

### Phase 2: Design (Director + Architect 병렬 → 합의)

- Director: knowledge/decisions/프로젝트 맥락 → Why/What
- Architect: 코드/기술 현황 → How
- SendMessage로 토론 → 합의
- Director가 `nx_task_add()`로 태스크 확정 (task 소유권 = director)

Gate Stop이 tasks.json 감시 → 등록 즉시 nonstop 시작.

### Phase 3: Execute (Engineer + QA)

**Teammate 재활용 우선:** idle 확인 → SendMessage 배정. 모두 busy일 때만 신규 스폰.

```
Agent({ subagent_type: "claude-nexus:engineer", name: "engineer-1", team_name: "<project>",
  prompt: "태스크 T1 구현. nx_task_update(in_progress) 착수, 완료 후 nx_task_update(completed) 호출. 완료 후 director에게 SendMessage 보고. 기술 문제는 architect에게 에스컬레이션." })
Agent({ subagent_type: "claude-nexus:qa", name: "qa", team_name: "<project>",
  prompt: "태스크별 검증. 문제 발견 시 director에게 SendMessage 보고." })
```

- QA 문제 발견 → director가 nx_task_add/nx_task_update로 태스크 추가/재오픈

### Phase 4: Complete

- all tasks completed → Gate Stop pass → 자연스럽게 종료
- `nx_task_close` 호출 → consult+decisions+tasks를 history.json에 아카이브 후 삭제
- 사용자에게 결과 보고

---

## Key Principles

1. **Lead = 조율 + 사용자 소통** — Team Path에서 분석 도구 금지
2. **Director = Why/What + task 소유** — nx_task_add/nx_task_update 권한
3. **Architect = How + 기술 자문** — engineer 에스컬레이션 수신
4. **Engineer/QA → director에게 보고** (기본), architect에게 에스컬레이션 (기술 문제)
5. **Teammate 재활용 우선** — idle에 SendMessage 배정 먼저
6. **tasks.json이 유일한 상태** (Team Path)
7. **Gate Stop nonstop** — pending 태스크 있으면 종료 불가
8. **Design = 합의** (Director + Architect SendMessage 토론)
9. **[dev] 판단: 도구 0회** — 요청 텍스트만으로 직감 추정

## Rules Template (참고)

팀 커스텀 규칙이 필요할 때 `nx_rules_write`로 `.claude/nexus/rules/`에 생성. 태그에 `["dev"]` 포함 시 Phase 1에서 자동 로드.

```markdown
<!-- tags: dev -->
# Dev Rules

## 코딩 컨벤션
(프로젝트 고유 스타일, 네이밍, 패턴)

## 테스트 정책
(커버리지 기준, 테스트 유형, QA 요구사항)

## 커밋/PR 규칙
(메시지 포맷, PR 크기, 리뷰 기준)
```

## Lead Awaiting Pattern (Team Path)

- idle teammate → SendMessage로 새 업무 배정
- Director 질의 수신 → AskUserQuestion으로 사용자에게 전달
- 타임아웃: 예상 소요 시간 초과 시 해당 팀원에게 진행 상황 확인

## Teammate 스폰 예시

```
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "claude-nexus:director", name: "director", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "claude-nexus:architect", name: "architect", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "claude-nexus:engineer", name: "engineer-1", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "claude-nexus:qa", name: "qa", team_name: "<project>", prompt: "..." })
```

주의: `TaskCreate`는 Claude Code 태스크 생성 도구. teammate 스폰은 반드시 `Agent({ team_name: ... })`.

## State Management

`.nexus/{branch}/tasks.json` — `nx_task_add`/`nx_task_update`로 관리. Gate Stop 감시.
사이클 종료 시 `nx_task_close`로 consult+decisions+tasks를 history.json에 아카이브.
