---
name: nx-research
description: Research execution — sub-agent or team mode based on Lead's judgment.
trigger_display: "[research] / [research!]"
purpose: "Research execution — principal+postdoc+researcher team"
triggers: ["research", "research!", "연구", "조사"]
---
# Research

Lead가 요청 복잡도를 판단해 Sub Path 또는 Team Path로 실행한다.

## Trigger

- `[research]` — Lead 자율 판단 (sub 또는 team)
- `[research!]` — Team Path 강제
- Direct invocation: `/claude-nexus:nx-research`

---

## Sub Path

`[research]` + Lead가 단순하다 판단 시 (1-3개 조사 항목, 단일 도메인).

**[research] Lead 판단: 도구 0회, 요청 텍스트만으로 직감 추정. 4+ 서브태스크 또는 복수 도메인/소스 필요 시 Team Path.**

### Phase 1: Analyze (Lead 직접)

- 사용자에게 모드 고지: "[research] sub-agent 모드로 처리합니다"
- **Branch Guard**: main/master 브랜치면 작업 성격에 맞는 브랜치를 생성하고 진행 (prefix: `research/`, `feat/`). 사용자 확인 없이 자동 생성.
- Lead가 직접 분석 도구 사용 (Read, Grep, WebSearch, WebFetch 등) — team path와 다름
- decisions.json이 있으면 `nx_context`로 기존 결정 사항을 확인하고 맥락에 반영
- `nx_rules_read(tags: ["research"])`로 팀 rules 확인. 있으면 스킬 기본 원칙보다 우선 적용.
- TodoWrite로 할일 목록 생성 (status: "pending") + **반드시 `nx_task_add`로 동일 태스크 등록** (history 아카이브용)
- 계획을 사용자에게 보여준 뒤 Spawn으로 진입

### Phase 2: Spawn

```
Agent({ subagent_type: "claude-nexus:researcher", prompt: "..." })  // team_name 없이 direct spawn
```

- 독립 조사 항목 병렬 스폰 가능
- Agent() blocking — Lead가 결과 직접 수신
- 완료마다 TodoWrite 갱신

### Phase 3: Done

- TodoWrite 전체 "completed" 확인
- **리포트 생성하지 않음.**
- `nx_task_close` 호출 → consult+decisions+tasks를 history.json에 아카이브 후 삭제
- 사용자에게 결과 보고

---

## Team Path

`[research!]` 또는 `[research]` + Lead가 복잡하다 판단 시.

Phase: **intake → scope → investigate → converge → complete**

### Phase 1: Intake (Lead)

사용자 요청/의도/맥락만 정리. **분석/코드 도구 호출 금지.**

- 사용자에게 모드 고지: "[research] 팀을 구성합니다"
- 목표, 범위, 의도 정리 → briefing 작성
- decisions.json이 있으면 기존 결정 사항을 briefing에 포함 (`nx_context`로 조회)
- `nx_rules_read(tags: ["research"])`로 팀 rules 조회. 있으면 briefing에 포함하여 팀원에게 전달, 스킬 기본 원칙보다 우선.
- **Branch Guard**: main/master 브랜치면 작업 성격에 맞는 브랜치를 생성하고 진행 (prefix: `research/`, `feat/`). 사용자 확인 없이 자동 생성.
- TeamCreate + principal/postdoc 병렬 스폰

```
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "claude-nexus:principal", name: "principal", team_name: "<project>",
  prompt: "research 맥락/배경 분석 → Why/What 관점 정리. postdoc와 SendMessage로 범위 토론 후 합의. 합의 완료 후 nx_task_add()로 조사 태스크 확정. 브리핑: {briefing}" })
Agent({ subagent_type: "claude-nexus:postdoc", name: "postdoc", team_name: "<project>",
  prompt: "조사 방법론/소스 현황 분석 → How 관점 정리. principal와 SendMessage로 토론 후 합의. 기술 이슈 발생 시 researcher에게 에스컬레이션 받아 처리." })
```

### Phase 2: Scope (Principal + Postdoc 병렬 → 합의)

- Principal: knowledge/decisions/프로젝트 맥락 → Why/What
- Postdoc: 조사 방법론/소스 → How
- SendMessage로 토론 → 합의
- Principal이 `nx_task_add()`로 조사 태스크 확정 (task 소유권 = principal)

Gate Stop이 tasks.json 감시 → 등록 즉시 nonstop 시작.

### Phase 3: Investigate (Researcher)

**Teammate 재활용 우선:** idle 확인 → SendMessage 배정. 모두 busy일 때만 신규 스폰.

```
Agent({ subagent_type: "claude-nexus:researcher", name: "researcher-1", team_name: "<project>",
  prompt: "태스크 T1 조사. nx_task_update(in_progress) 착수, 완료 후 nx_task_update(completed) 호출. 완료 후 principal에게 SendMessage 보고. 방법론 문제는 postdoc에게 에스컬레이션." })
```

- 미흡한 결과 발견 → principal이 nx_task_add/nx_task_update로 태스크 추가/재오픈

### Phase 4: Converge (Principal + Postdoc)

**리포트 필수** — Team Path는 반드시 최종 리포트를 생성한다.

- 수집된 조사 결과를 principal이 종합
- postdoc와 SendMessage로 결론 검증
- 최종 인사이트/권고사항 도출
- 보완 내역 기록: 보완일, 사유, 변경 항목. Lead가 팀 완료 후 내부 교정 요약 1-2줄 보고.

### Phase 5: Complete

1. all tasks completed → Gate Stop pass → 자연스럽게 종료
2. `nx_task_close` 호출 → consult+decisions+tasks를 history.json에 아카이브 후 삭제
3. 팀 종료: 전 팀원에게 shutdown 요청 → 전원 종료 확인 → `TeamDelete`
4. 사용자에게 결과 보고

---

## Key Principles

1. **Lead = 조율 + 사용자 소통** — Team Path에서 분석 도구 금지
2. **Principal = Why/What + task 소유** — nx_task_add/nx_task_update 권한
3. **Postdoc = How + 방법론 자문** — researcher 에스컬레이션 수신
4. **Researcher → principal에게 보고** (기본), postdoc에게 에스컬레이션 (방법론 문제)
5. **Teammate 재활용 우선** — idle에 SendMessage 배정 먼저
6. **tasks.json이 유일한 상태** (Team Path)
7. **Gate Stop nonstop** — pending 태스크 있으면 종료 불가
8. **Scope = 합의** (Principal + Postdoc SendMessage 토론)
9. **[research] 판단: 도구 0회** — 요청 텍스트만으로 직감 추정

## Rules Template (참고)

팀 커스텀 규칙이 필요할 때 `nx_rules_write`로 `.claude/nexus/rules/`에 생성. 태그에 `["research"]` 포함 시 Phase 1에서 자동 로드.

```markdown
<!-- tags: research -->
# Research Rules

## 출처/검증 기준
(소스 등급 분류, 교차 검증 수준, 표기 방식)

## 리포트 양식
(필수 구조, 네이밍, 저장 위치)

## 산출물 변환 규칙
(리포트→최종 산출물 톤, 깊이, 분량)

## 에셋 정책
(이미지/다이어그램 제작 기준, 저장 경로)
```

## Lead Awaiting Pattern (Team Path)

- idle teammate → SendMessage로 새 업무 배정
- Principal 질의 수신 → AskUserQuestion으로 사용자에게 전달
- 타임아웃: 예상 소요 시간 초과 시 해당 팀원에게 진행 상황 확인

## Teammate 스폰 예시

```
TeamCreate({ team_name: "<project>", description: "..." })
Agent({ subagent_type: "claude-nexus:principal", name: "principal", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "claude-nexus:postdoc", name: "postdoc", team_name: "<project>", prompt: "..." })
Agent({ subagent_type: "claude-nexus:researcher", name: "researcher-1", team_name: "<project>", prompt: "..." })
```

주의: `TaskCreate`는 Claude Code 태스크 생성 도구. teammate 스폰은 반드시 `Agent({ team_name: ... })`.

## 팀 종료 예시

```
// 1. 전 팀원에게 shutdown 요청
SendMessage({ to: "*", message: { type: "shutdown_request", reason: "전체 태스크 완료" } })

// 2. 전원 종료 확인 후 팀 삭제
TeamDelete()
```

## 기본 범위

research 기본 범위는 조사+리포트. 산출물 생성이 필요하면 `rules/`로 변환 규칙을 정의하여 확장. 빌드 검증은 별도 스킬 조합 패턴 권장.

## 방법론 원칙

- **출처 계층화**: 신뢰도별 등급 분류
- **교차 검증**: 복수 출처 대조
- **출처 기록**: 인라인 근거 포함

원칙만 내장. 구체적 분류 기준(T1/T2/T3 정의, 리포트 양식 등)은 `rules/`에서 프로젝트별 정의.

## State Management

`.nexus/{branch}/tasks.json` — `nx_task_add`/`nx_task_update`로 관리. Gate Stop 감시.
사이클 종료 시 `nx_task_close`로 consult+decisions+tasks를 history.json에 아카이브.
