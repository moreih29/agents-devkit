# Phase 자동 추적 개선

## 목표
statusline 3번째 줄의 workflow phase가 초기값에 머물러 있는 문제 해결. LLM 의존 → 훅 기반 자동 추적으로 전환.

## Phase 모델 (7-8개 → 3개)

| Phase | 의미 | 트리거 |
|-------|------|--------|
| `exploring` / `analyzing` | 초기 상태, 코드/컨텍스트 읽는 중 | gate.ts: 워크플로우 활성화 시 |
| `delegating` | 에이전트 spawn됨, 작업 위임 중 | tracker.ts: SubagentStart |
| `waiting` | AskUserQuestion 호출, 사용자 응답 대기 | pulse.ts: PreToolUse |

## 자동 전환 규칙

```
[키워드 감지] → exploring/analyzing
      ↓ (SubagentStart)
  delegating ←──────────────┐
      ↓ (AskUserQuestion)   │
   waiting                   │
      ↓ (UserPromptSubmit)   │
  delegating ────────────────┘
      ↓ (SubagentStop, active=0)
  exploring/analyzing (base로 복귀)
```

## 변경 범위

### 1. `src/shared/paths.ts` — 공유 헬퍼 추가
- `updateWorkflowPhase(sid, phase)` 함수 추가
- sessionDir, existsSync, readFileSync, writeFileSync 이미 사용 가능

### 2. `src/hooks/tracker.ts` — SubagentStart/Stop에서 phase 갱신
- `handleSubagentStart`: workflow 활성 시 → `delegating`
- `handleSubagentStop`: active agents가 0이 되면 → base phase로 복귀 (exploring/analyzing)

### 3. `src/hooks/pulse.ts` — AskUserQuestion 감지
- `PreToolUse` + `AskUserQuestion` 조합 시 → `waiting`

### 4. `src/hooks/gate.ts` — waiting→active 전환 + 지시문 정리
- `handleUserPromptSubmit` 시작: waiting phase면 → `delegating`
- 초기 phase명 변경: `explore` → `exploring`, `analyze` → `analyzing`
- consult/plan 지시문에서 `PHASE TRACKING: ...` 줄 제거

### 5. `src/statusline/statusline.ts` — 표시 업데이트 (최소 변경)
- 기존 로직이 phase 값을 그대로 표시하므로 큰 변경 불필요

## 설계 결정
- `nx_state_write`로 수동 phase 변경은 계속 동작 (자연스러운 오버라이드)
- atomic write는 현재 파일 크기에서 불필요 (statusline 읽기 실패 시 fallback 있음)
- 완료 상태는 별도 phase 없이 `workflow.json` 삭제 = idle

## 완료 기준
- [ ] consult 시작 → `exploring` 표시
- [ ] Agent spawn → `delegating` 표시
- [ ] AskUserQuestion → `waiting` 표시
- [ ] 사용자 응답 → `delegating` 복귀
- [ ] 마지막 에이전트 종료 → base phase 복귀
- [ ] 기존 nx_state_write 호환 유지
- [ ] E2E 테스트 통과
