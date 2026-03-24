---
name: nx-research
description: Research execution — sub-agent or team mode based on Lead's judgment.
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

- Lead가 직접 분석 도구 사용 (Read, Grep, WebSearch, WebFetch 등) — team path와 다름
- TodoWrite로 할일 목록 생성 (status: "pending")
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
- 사용자에게 결과 보고. tasks.json/아카이브 없음.

---

## Team Path

`[research!]` 또는 `[research]` + Lead가 복잡하다 판단 시.

Phase: **intake → scope → investigate → converge → complete**

### Phase 1: Intake (Lead)

사용자 요청/의도/맥락만 정리. **분석/코드 도구 호출 금지.**

- 목표, 범위, 의도 정리 → briefing 작성
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

- 수집된 조사 결과를 principal이 종합
- postdoc와 SendMessage로 결론 검증
- 최종 인사이트/권고사항 도출

### Phase 5: Complete

- all tasks completed → Gate Stop pass → 자연스럽게 종료
- tasks.json/decisions.json 삭제 안 함 (resume용)
- 정리는 사용자 명시적 요청 시 `nx_task_clear`

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

## State Management

`.nexus/{branch}/tasks.json` — `nx_task_add`/`nx_task_update`로 관리. Gate Stop 감시. Sub Path는 상태 파일 없음.
