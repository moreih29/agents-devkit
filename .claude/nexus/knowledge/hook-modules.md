<!-- tags: hooks, gate, pulse, tracker -->
# Nexus 훅 모듈 상세

## 모듈 구성

모든 훅은 hooks.json에 등록된 별도 프로세스. 단일 CJS 스크립트로 실행 (omc의 이중 스폰 제거).

```
scripts/gate.cjs     → Stop, UserPromptSubmit
scripts/pulse.cjs    → PreToolUse (Guard 내장; PostToolUse는 성능 최적화로 제거됨)
scripts/tracker.cjs  → SubagentStart/Stop, SessionStart/End
```

Memory 모듈은 MCP 도구(`nx_*`)이므로 hooks.json에 등록하지 않음.

## Gate 모듈

가장 중요한 모듈. Stop 이벤트 차단과 키워드 감지를 담당.

### Stop 처리 (`handleStop`)
순차 체크:
1. `workflow.json`에 `mode`(consult/plan)와 `phase`가 있으면 block
2. `agents.json`에 활성 에이전트가 있으면 block
3. 그 외 허용

```javascript
// 워크플로우 활성 시
{ "decision": "block", "reason": "[PLAN: draft] Workflow is active. Complete or clear with nx_state_clear({ key: \"plan\" })." }

// 에이전트 활성 시
{ "decision": "block", "reason": "[AGENTS] Builder is still active." }
```

### 키워드 감지 (UserPromptSubmit)
자연어 + 명시적 태그 감지 → `workflow.json` 생성 → 스킬 호출 지시 주입.

감지 우선순위:
1. 스킬 키워드 (`[consult]`/`[plan]`/`[init]`/`[setup]` 및 자연어) → workflow.json 생성 + 스킬 호출 지시
2. 결정 태그 (`[d]`) → planning 모드에서 LLM이 ADR로 캡처하도록 지시
3. 태스크 자연어 ("진행중인 작업", "다음 할 일", "작업 현황", "막힌 작업") → (planned) nx_task_* 호출 안내
4. 적응형 라우팅 (planned) → 요청 카테고리 분류 → 에이전트 위임 지시

## Pulse 모듈

PreToolUse에서 컨텍스트 주입. Guard 기능 내장. (PostToolUse는 성능 최적화로 제거됨)

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

### 6-Section 에이전트 주입
에이전트에게 위임할 때 표준 6섹션 형식으로 컨텍스트 주입:
TASK / EXPECTED OUTCOME / REQUIRED TOOLS / MUST DO / MUST NOT DO / CONTEXT.
`workflow.json`의 현재 mode/phase를 기반으로 관련 섹션을 채움.

### 실패 복구
`workflow.json`의 `failures` 배열을 감지 → 실패한 단계 재시도 지시 주입:
- 재시도 횟수 < 3: 재시도 지시 + 실패 맥락 주입
- 재시도 횟수 >= 3: 워크플로우 중단 + 사용자 보고 지시

### 위임 강제 (Write/Edit 도구)
Write/Edit 도구 사용 시 일괄 위임 리마인더 주입:
- delegation enforcement 설정 상태(off/warn/strict)에 따라 처리
- strict 모드: 조건부 경로(.nexus/, .claude/nexus/ 등) 외 파일 편집 차단
- warn 모드: 리마인더 주입만 (기본값)
- off 모드: 리마인더 생략

### 에이전트별 컨텍스트 수준 분기
Tracker의 `agents.json`에서 활성 에이전트를 조회하고, 에이전트의 context 수준에 따라 메시지 필터링:
- `minimal` (Finder, Writer): safety + workflow만 주입, guidance 생략
- `standard` (Builder, Guard, Debugger, Tester): safety + workflow + guidance
- `full` (Architect, Strategist, Reviewer, Analyst): 전부 주입
- 복수 에이전트 활성 시 최고 수준 적용

### 우선순위
안전(Guard) > 워크플로우(모드/단계 리마인더) > 가이던스(도구별 팁) > 정보(상태 알림)

## Tracker 모듈

서브에이전트 시작/종료 추적 + 세션 라이프사이클 관리.

### SessionStart
- **모든 세션**의 잔존 워크플로우 상태 정리 (`cleanupAllSessionStates` — resume, 비정상 종료, 벤치마크 잔존 등 방어)
- 현재 브랜치의 plan 존재 확인
- 이전 세션의 만료된 메모 정리 (TTL 체크)
- **코드베이스 분석**: 프로젝트 구조 간략 스캔 → Finder 위임 또는 직접 요약 → 세션 메모에 기록
- **에이전트 위임 규칙 주입** (세션당 1회): `[NEXUS] routing context → delegate` 규칙을 additionalContext로 주입. 어떤 프로젝트에서든 플러그인 활성화만으로 위임 규칙 적용

### SessionEnd
- 현재 세션의 활성 워크플로우 상태 파일 정리 (workflow.json)

### SubagentStart/Stop
- `.nexus/state/sessions/{id}/agents.json`에 활성 에이전트 기록
- **이름 정규화**: `normalizeAgentName()` — `nexus:`/`claude-nexus:` 접두사 제거 후 저장 (canonical form)
- **중복 허용**: 동일 에이전트 복수 spawn 시 active 배열에 중복 push. Stop 시 첫 번째만 splice 제거

## Phase별 최적화

| Phase | 전략 | Gate | Pulse | Tracker |
|-------|------|------|-------|---------|
| P1 | 경량 스크립트 | 매번 프로세스 | 매번 프로세스 | 매번 프로세스 |
| P2 | 선택적 등록 | 항상 등록 | 모드 활성 시만 | 항상 등록 |
| P3 | 상주 데몬 (필요 시) | 데몬 질의 | 데몬 질의 | 데몬 질의 |

인터페이스(stdin JSON → stdout JSON)는 전략에 무관하게 동일하므로 교체 가능.
