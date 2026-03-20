# Lattice 훅 모듈 상세

## 모듈 구성

모든 훅은 hooks.json에 등록된 별도 프로세스. 단일 CJS 스크립트로 실행 (omc의 이중 스폰 제거).

```
scripts/gate.cjs     → Stop, UserPromptSubmit
scripts/pulse.cjs    → PreToolUse, PostToolUse (Guard 내장)
scripts/tracker.cjs  → SubagentStart/Stop, SessionStart/End
```

Memory 모듈은 MCP 도구(`lat_*`)이므로 hooks.json에 등록하지 않음.

## Gate 모듈

가장 중요한 모듈. Stop 이벤트 차단과 키워드 감지를 담당.

### Stop 처리
```javascript
// Sustain 활성 시
{ "decision": "block", "reason": "[SUSTAIN iteration 3/100] 작업이 완료되지 않았습니다." }

// Sustain 비활성 시
{ "continue": true }
```

omc의 9단계 우선순위 → Lattice는 **프리미티브별 순차 체크**로 단순화:
1. Sustain이 active이면 block
2. Pipeline이 active이면 block (stage 정보 표시)
3. Parallel이 active이고 `totalCount > 0 && completedCount < totalCount`이면 block
4. 그 외 허용

### 키워드 감지 (UserPromptSubmit)
자연어 + 명시적 태그 감지 → 해당 프리미티브 상태 파일 생성 → 스킬 호출 지시 주입.

감지 우선순위:
1. Cruise (`[cruise]`, "cruise", "end to end") → pipeline + sustain 동시 활성화
2. 프리미티브 (`[sustain]`, `[parallel]`, `[pipeline]` 및 자연어 패턴) → 단일 활성화
3. Consult (`[consult]`, "consult", "상담", "어떻게 하면 좋을까") → 상태 파일 없이 컨텍스트 주입만

## Pulse 모듈

PreToolUse/PostToolUse에서 컨텍스트 주입. Guard 기능 내장.

### Whisper 패턴
중복 방지 + 적응적 상세도를 위해 파일 기반 tracker 사용:

```
.lattice/state/sessions/{id}/whisper-tracker.json
{
  "injections": { "Bash:parallel_reminder": 2, "Edit:verify_reminder": 1 },
  "toolCallCount": 15
}
```

- 메시지별 주입 횟수 추적, 3회 초과 시 건너뜀
- 도구 호출 횟수로 context 사용량 휴리스틱 추정
- 60% 초과 시 minimal 모드 (핵심 메시지만)

### 워크플로우 상태 주입 (Phase 2)
활성 워크플로우의 진행 상태를 컨텍스트에 주입:
- `[SUSTAIN N/M]` — 지속 모드 진행 상황
- `[PIPELINE stage: X (N/M)]` — 현재 파이프라인 단계
- `[PARALLEL N/M done]` — 병렬 태스크 완료 현황

### 에이전트별 컨텍스트 수준 분기
Tracker의 `agents.json`에서 활성 에이전트를 조회하고, 에이전트의 context 수준에 따라 메시지 필터링:
- `minimal` (Scout, Scribe): safety + workflow만 주입, guidance 생략
- `standard` (Artisan, Sentinel, Tinker, Weaver): safety + workflow + guidance
- `full` (Steward, Compass, Strategist, Lens, Analyst): 전부 주입
- 복수 에이전트 활성 시 최고 수준 적용

### 우선순위
안전(Guard) > 워크플로우(Sustain/Pipeline/Parallel 리마인더) > 가이던스(도구별 팁) > 정보(상태 알림)

## Tracker 모듈

서브에이전트 시작/종료 추적 + 세션 라이프사이클 관리.

### SessionStart
- 이전 세션의 잔존 워크플로우 상태 정리 (비정상 종료 대비, sustain/pipeline/parallel)
- 현재 브랜치의 plan 존재 확인
- knowledge 파일 목록 캐시
- 이전 세션의 만료된 메모 정리 (TTL 체크)

### SessionEnd
- 현재 세션의 활성 워크플로우 상태 파일 정리 (sustain/pipeline/parallel)

### SubagentStart/Stop
- `.lattice/state/sessions/{id}/agents.json`에 활성 에이전트 기록
- 완료 시 결과 요약 기록

## Phase별 최적화

| Phase | 전략 | Gate | Pulse | Tracker |
|-------|------|------|-------|---------|
| P1 | 경량 스크립트 | 매번 프로세스 | 매번 프로세스 | 매번 프로세스 |
| P2 | 선택적 등록 | 항상 등록 | 모드 활성 시만 | 항상 등록 |
| P3 | 상주 데몬 (필요 시) | 데몬 질의 | 데몬 질의 | 데몬 질의 |

인터페이스(stdin JSON → stdout JSON)는 전략에 무관하게 동일하므로 교체 가능.
