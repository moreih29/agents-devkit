# Nexus 훅 모듈 상세

## 모듈 구성

모든 훅은 hooks.json에 등록된 별도 프로세스. 단일 CJS 스크립트로 실행 (omc의 이중 스폰 제거).

```
scripts/gate.cjs     → Stop, UserPromptSubmit
scripts/pulse.cjs    → PreToolUse, PostToolUse (Guard 내장)
scripts/tracker.cjs  → SubagentStart/Stop, SessionStart/End
```

Memory 모듈은 MCP 도구(`nx_*`)이므로 hooks.json에 등록하지 않음.

## Gate 모듈

가장 중요한 모듈. Stop 이벤트 차단과 키워드 감지를 담당.

### Stop 처리
```javascript
// Nonstop 활성 시
{ "decision": "block", "reason": "[SUSTAIN iteration 3/100] 작업이 완료되지 않았습니다." }

// Nonstop 비활성 시
{ "continue": true }
```

omc의 9단계 우선순위 → Nexus는 **프리미티브별 순차 체크**로 단순화:
1. Nonstop이 active이면 block
2. Pipeline이 active이면 block (stage 정보 표시)
3. Parallel이 active이고 `totalCount > 0 && completedCount < totalCount`이면 block
4. 그 외 허용

### 키워드 감지 (UserPromptSubmit)
자연어 + 명시적 태그 감지 → 해당 프리미티브 상태 파일 생성 → 스킬 호출 지시 주입.

감지 우선순위:
1. Auto (`[auto]`, "auto", "end to end") → pipeline + nonstop 동시 활성화
2. 프리미티브 (`[nonstop]`, `[parallel]`, `[pipeline]` 및 자연어 패턴) → 단일 활성화
3. Consult (`[consult]`, "consult", "상담", "어떻게 하면 좋을까") → 상태 파일 없이 컨텍스트 주입만
4. 태스크 자연어 ("진행중인 작업", "다음 할 일", "작업 현황", "막힌 작업") → nx_task_* 호출 안내
5. 적응형 라우팅 (v2) → 요청 카테고리 분류(10개) → 에이전트/워크플로우 제안 (강제 아님)
   - 에이전트 직접 언급 시 override (한글 조사 필수: "Finder로", 또는 대문자 시작, 또는 `nexus:` 접두사)
   - 히스토리 기반: 동일 카테고리에서 2회 이상 같은 에이전트 선택 시 자동 추천
   - 카테고리: 버그수정(debugger), 리뷰(reviewer), 테스트(tester), 리팩토링(builder), 탐색(finder), 설계(architect), 계획(strategist), 분석(analyst), 문서(writer), 대규모구현(auto 제안)

### 오탐 방지 (`isPrimitiveMention`)
프리미티브 이름(nonstop/parallel/pipeline/auto)이 에러/버그 맥락(에러, 버그, fix, error 등)과 함께 등장하면 키워드 활성화를 스킵. "nonstop 에러 수정해" → nonstop 활성화 X, 적응형 라우팅으로 debugger 추천.
명시적 태그(`[nonstop]`)는 항상 우선.

## Pulse 모듈

PreToolUse/PostToolUse에서 컨텍스트 주입. Guard 기능 내장.

### Whisper 패턴
중복 방지 + 적응적 상세도를 위해 파일 기반 tracker 사용:

```
.nexus/state/sessions/{id}/whisper-tracker.json
{
  "injections": { "Bash:parallel_reminder": 2, "Edit:verify_reminder": 1 },
  "toolCallCount": 15
}
```

- 메시지별 주입 횟수 추적, 1회 초과 시 건너뜀 (MAX_REPEAT=1)
- 도구 호출 횟수로 context 사용량 휴리스틱 추정
- 60회 초과 시 adaptive minimal 모드 (핵심 메시지만)
- 워크플로우 상태 diff 기반 주입 (`lastWorkflowHash`): 상태 불변 시 workflow 메시지 스킵

### 워크플로우 상태 주입 (Phase 2)
활성 워크플로우의 진행 상태를 컨텍스트에 주입:
- `[SUSTAIN N/M]` — 지속 모드 진행 상황
- `[PIPELINE stage: X (N/M)]` — 현재 파이프라인 단계
- `[PARALLEL N/M done]` — 병렬 태스크 완료 현황

### 에이전트별 컨텍스트 수준 분기
Tracker의 `agents.json`에서 활성 에이전트를 조회하고, 에이전트의 context 수준에 따라 메시지 필터링:
- `minimal` (Finder, Writer): safety + workflow만 주입, guidance 생략
- `standard` (Builder, Guard, Debugger, Tester): safety + workflow + guidance
- `full` (Lead, Architect, Strategist, Reviewer, Analyst): 전부 주입
- 복수 에이전트 활성 시 최고 수준 적용

### 우선순위
안전(Guard) > 워크플로우(Nonstop/Pipeline/Parallel 리마인더) > 가이던스(도구별 팁) > 정보(상태 알림)

## Tracker 모듈

서브에이전트 시작/종료 추적 + 세션 라이프사이클 관리.

### SessionStart
- **모든 세션**의 잔존 워크플로우 상태 정리 (`cleanupAllSessionStates` — resume, 비정상 종료, 벤치마크 잔존 등 방어)
- 현재 브랜치의 plan 존재 확인
- 이전 세션의 만료된 메모 정리 (TTL 체크)

### SessionEnd
- 현재 세션의 활성 워크플로우 상태 파일 정리 (nonstop/pipeline/parallel)

### SubagentStart/Stop
- `.nexus/state/sessions/{id}/agents.json`에 활성 에이전트 기록
- **SubagentStop 시 Parallel 자동 연동**: parallel.json의 해당 에이전트 태스크를 자동 done 처리, completedCount 증가, 전체 완료 시 자동 해제

## Phase별 최적화

| Phase | 전략 | Gate | Pulse | Tracker |
|-------|------|------|-------|---------|
| P1 | 경량 스크립트 | 매번 프로세스 | 매번 프로세스 | 매번 프로세스 |
| P2 | 선택적 등록 | 항상 등록 | 모드 활성 시만 | 항상 등록 |
| P3 | 상주 데몬 (필요 시) | 데몬 질의 | 데몬 질의 | 데몬 질의 |

인터페이스(stdin JSON → stdout JSON)는 전략에 무관하게 동일하므로 교체 가능.
