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

omc의 9단계 우선순위 → Lattice는 **3 프리미티브의 단일 우선순위**로 단순화:
- Sustain이 active이면 block
- Pipeline 실행 중이면 block
- 그 외 허용

### 키워드 감지 (UserPromptSubmit)
자연어 + 명시적 태그 감지 → 해당 프리미티브 상태 파일 생성 → 스킬 호출 지시 주입.

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

### 우선순위
안전(Guard) > 워크플로우(Sustain 리마인더) > 가이던스(도구별 팁) > 정보(상태 알림)

## Tracker 모듈

서브에이전트 시작/종료 추적 + 세션 라이프사이클 관리.

### SessionStart
- 현재 브랜치의 plan 존재 확인
- knowledge 파일 목록 캐시
- 이전 세션의 만료된 메모 정리 (TTL 체크)

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
