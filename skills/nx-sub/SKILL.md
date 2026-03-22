---
name: nx-sub
description: Lightweight execution — Lead analyzes directly and spawns Builder subagents via direct spawn (no team).
triggers: ["sub"]
---
# Sub

경량 실행 스킬. Lead가 직접 분석 후 Builder 서브에이전트를 direct spawn하여 실행한다.

## Trigger

- Explicit tag: `[sub]`
- Direct invocation: `/nexus:nx-sub`

## What It Does

1-3개 태스크 수준의 단순 작업을 Lead가 직접 분석하고 Builder를 스폰하여 처리. team 스킬 대비 합의 루프/tasks.json/Gate Stop 없음.

## Workflow: analyze → spawn → verify → done

### Phase 1: Analyze (Lead 직접)

- Lead가 직접 코드/knowledge 읽기, 분석 수행 (Analyst/Architect 스폰 없음)
- 분석/코드 도구 사용 허용 (Read, Grep, LSP, AST 등)
- 1-3개 태스크 수준인지 판단
- 4개 이상 서브태스크 또는 cross-cutting concerns가 있으면 사용자에게 [team] 전환 제안
- 분석 완료 후 TodoWrite로 할일 목록 생성 (각 항목 status: "pending")
- 사용자에게 계획을 시각적으로 보여준 뒤 Spawn 단계로 진입

### Phase 2: Spawn (Builder direct spawn)

- `Agent({ subagent_type: "nexus:builder", prompt: "..." })` — team_name 없이 direct spawn
- 독립 태스크는 병렬 스폰 가능
- Agent() 호출이 완료까지 blocking이므로 Lead가 직접 결과를 확인한다
- TeamCreate, team_name 사용 금지
- Builder 완료 후 Lead가 TodoWrite로 해당 항목을 "completed"로 갱신

### Phase 3: Verify (조건부)

Guard 스폰 기준 (하나라도 해당 시):
- 변경 파일 3개 이상
- 기존 테스트가 있는 모듈을 수정한 경우
- Lead가 판단하기에 검증이 필요한 경우

해당 없으면 Lead가 직접 결과 확인으로 충분.

### Phase 4: Done

- 모든 항목을 "completed"로 확인 후 결과 보고
- 결과 요약 후 사용자에게 직접 보고
- 아카이브 없음 (tasks.json 미사용)

## Key Principles

1. **Lead = 분석 + 조율 + 실행 판단** — 분석/코드 도구 사용 허용 (team과 다름)
2. **합의 없음** — Analyst/Architect 스폰 없음, Lead가 직접 판단
3. **tasks.json 없음** — Gate Stop 미적용
4. **direct spawn** — Agent() blocking 호출, Lead가 결과 직접 수신
5. **복잡도 가드레일** — 4+ 서브태스크 또는 cross-cutting concerns → [team] 전환 제안
6. **TodoWrite 진행 추적** — 분석 후 할일 목록 생성, Builder 완료마다 갱신

## State Management

상태 파일 없이 동작한다. tasks.json, decisions.json 미사용.

## Deactivation

Phase 4 완료 후 자연스럽게 종료. 아카이브 없음.
