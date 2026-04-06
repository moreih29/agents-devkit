# Claude Code Hooks — Control & Performance Experiments

> 실험 일시: 2026-04-06 / Claude Code v2.1.92
> 실험 환경: macOS, `claude -p` CLI 모드, `/tmp/hook-probe-test` 프로젝트

---

## A. 훅 제어 동작 검증

### A1. updatedInput — 도구 입력 수정

**실험:** PreToolUse 훅에서 Bash `echo hello` → `echo MODIFIED_BY_HOOK`로 command 변경

**훅 출력:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "updatedInput": {
      "command": "echo MODIFIED_BY_HOOK",
      "description": "Modified by hook"
    }
  }
}
```

**결과: 성공.** Claude가 `echo hello`를 요청했지만 실제 실행은 `echo MODIFIED_BY_HOOK`. Claude도 출력이 변경된 것을 인지함.

**활용:**
- 위험 명령 자동 수정 (예: `rm -rf /` → 차단 대신 안전한 명령으로 치환)
- 경로 자동 리라이트
- 도구 파라미터 강제 주입 (예: Bash에 항상 `--dry-run` 추가)

---

### A2. permissionDecision: "allow" — 자동 승인

**실험:** PreToolUse 훅에서 Bash 도구 자동 승인

**훅 출력:**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "Auto-allowed by test hook"
  }
}
```

**결과: 성공.** 권한 프롬프트 없이 `touch /tmp/hook-test-file.txt` 실행 완료. `permission_denials: []`.

**주의:** deny 규칙은 allow보다 우선. 훅이 allow해도 settings의 deny 규칙이 있으면 차단됨.

---

### A3. Stop block — 첫 Stop 차단 후 추가 작업 강제

**실험:** 첫 Stop에서 `decision: "block"` + reason으로 추가 작업 지시. 두 번째 Stop에서 `stop_hook_active: true` 확인 후 통과.

**결과: 성공.**
- Claude가 `echo START` 실행 후 Stop 시도 → 훅이 차단
- Claude가 추가 지시(echo HOOK_CONTINUATION_CONFIRMED) 수행 → 두 번째 Stop
- `stop_hook_active` 플로우: `false` (1회차, 차단) → `true` (2회차, 통과)
- 총 4 turns (원래 2 turns에서 2 turns 추가)

**무한 루프 방지 패턴 검증:**
```
Stop #1: stop_hook_active=false → block → Claude 추가 작업
Stop #2: stop_hook_active=true  → pass  → 세션 종료
```

---

### A4. additionalContext 전달

**실험:** UserPromptSubmit 훅에서 `additionalContext` 필드로 문자열 주입

**결과: 부분 성공.**
- `--include-hook-events --verbose` 스트림에서 `additionalContext: "INJECTED_CONTEXT_HERE"` 정상 반환 확인
- 그러나 Claude에게 "이 문자열이 보이냐?"고 물으면 인식하지 못함
- **additionalContext는 시스템 컨텍스트로 주입되지만, Claude가 명시적으로 참조할 수 있는 형태가 아닌 것으로 추정**
- Nexus gate.ts의 `<nexus>...</nexus>` 태그는 interactive 모드에서 작동하므로, `-p` 모드 특유의 한계일 수 있음

**`--include-hook-events` 스트림 데이터:**
```json
{
  "type": "system",
  "subtype": "hook_response",
  "hook_name": "UserPromptSubmit",
  "hook_event": "UserPromptSubmit",
  "output": "{\"continue\":true,\"additionalContext\":\"INJECTED_CONTEXT_HERE\"}",
  "exit_code": 0,
  "outcome": "success"
}
```

---

## B. 미실험 이벤트

### PermissionRequest / PermissionDenied

**실험:** `-p` 모드에서 위험 명령(`rm -rf`) 실행 시도

**결과: 이벤트 미발생.**
- `-p` 모드에서 Claude는 위험 명령을 아예 시도하지 않음 (사전 필터링)
- `--permission-mode dontAsk`에서도 Bash 거부 시 PermissionDenied 이벤트 미캡처
- **PermissionRequest/Denied는 interactive 모드의 권한 다이얼로그에서만 발생하는 것으로 추정**

### `-p` 모드에서 캡처 불가능한 이벤트

| 이벤트 | 이유 |
|--------|------|
| PermissionRequest | 권한 다이얼로그 없음 (비대화형) |
| PermissionDenied | auto 모드 classifier 미동작 |
| Notification | idle/permission 알림 없음 |
| CwdChanged | `cd`가 Bash 서브셸에서만 실행되어 cwd 변경 안 됨 |
| ConfigChange | 세션 중 설정 파일 수동 변경 필요 (자동화 어려움) |
| PreCompact / PostCompact | 짧은 대화에서 압축 미발생 |

---

## C. 성능/아키텍처 실험

### C1. 서브에이전트 병렬 vs 순차 (3개)

**태스크:** README.md 읽기 + .gitignore 읽기 + 디렉토리 구조 확인 (Explore x3)

| | 병렬 | 순차 |
|---|---|---|
| **wall** | **20.2s** | 35.5s |
| **api** | 23.5s | 33.8s |
| **cost** | $0.099 | $0.084 |
| **turns** | 4 | 4 |

**병렬 스폰 타임스탬프:**
```
Start: 07:41:33.866 → 07:41:34.917 → 07:41:35.566  (1.7초 간격으로 3개 스폰)
Stop:  07:41:36.848 → 07:41:37.239 → 07:41:44.191  (거의 동시 완료, 마지막만 8초 지연)
```

**순차 스폰 타임스탬프:**
```
Start: 07:42:11.105 → 07:42:18.530 → 07:42:25.850  (7초 간격으로 1개씩)
```

**분석:**
- **병렬이 43% 빠름** (20.2s vs 35.5s)
- 병렬에서 `api > wall` (23.5s > 20.2s) → 동시 API 호출 확인
- 비용은 병렬이 약간 높음 ($0.099 vs $0.084) — 캐시 히트율 차이
- 병렬 스폰은 완전 동시가 아닌 1.7초 간격으로 시작 (시스템 오버헤드)

---

### C2. `--include-hook-events` 스트림 형식

`--output-format stream-json --verbose --include-hook-events` 사용 시:

**훅 이벤트 JSON 형식:**

```json
// 훅 시작
{
  "type": "system",
  "subtype": "hook_started",
  "hook_id": "uuid",
  "hook_name": "UserPromptSubmit",
  "hook_event": "UserPromptSubmit",
  "session_id": "uuid"
}

// 훅 응답
{
  "type": "system",
  "subtype": "hook_response",
  "hook_id": "uuid",
  "hook_name": "UserPromptSubmit",
  "hook_event": "UserPromptSubmit",
  "output": "{\"continue\":true,\"additionalContext\":\"...\"}",
  "stdout": "{\"continue\":true}",
  "stderr": "",
  "exit_code": 0,
  "outcome": "success",
  "session_id": "uuid"
}
```

**활용:**
- 외부 모니터링 도구에서 훅 실행 상태 실시간 추적 가능
- `hook_id`로 시작/응답 매칭
- `outcome`: `"success"`, `"error"`, `"timeout"` 등
- 여러 훅이 병렬 실행될 때 각각의 `hook_id`로 구분

---

### C3. Agent `model` 파라미터 — 에이전트 모델 오버라이드

**실험:** Explore 에이전트를 기본(haiku) 대신 sonnet으로 강제

| | Explore 기본 (haiku) | Explore + model=sonnet |
|---|---|---|
| **wall 평균** | 12.8s | 12.4s |
| **cost 평균** | $0.064 | $0.048 |
| **리드 모델** | sonnet | sonnet |
| **에이전트 모델** | **haiku** | **sonnet** |
| **모델 사용** | sonnet + haiku | **sonnet만** |

**핵심 발견:**
- `model=sonnet` 지정 시 haiku 사용량 **0** → 에이전트도 완전히 sonnet으로 실행
- 속도 차이 미미 (12.8s vs 12.4s)
- **비용이 오히려 저렴** ($0.064 → $0.048) — haiku의 높은 cache_write 비용이 없어지고, sonnet의 캐시 재사용이 효율적

**실전 의미:**
- Explore의 기본 haiku가 반드시 저렴한 것이 아님
- 캐시 효율이 좋은 모델(sonnet)이 작은 태스크에서 오히려 저렴할 수 있음
- `model` 파라미터로 에이전트 모델 완전 제어 가능

---

## 실험별 요약

| 실험 | 결과 | Nexus 활용 가치 |
|------|------|----------------|
| A1. updatedInput | **성공** — 도구 입력 실시간 수정 | 위험 명령 자동 수정, 경로 리라이트 |
| A2. allow | **성공** — 권한 프롬프트 스킵 | 자동화 파이프라인 |
| A3. Stop block | **성공** — 추가 작업 강제 | 태스크 완료 강제 (이미 gate.ts에서 사용 중) |
| A4. additionalContext | **부분 성공** — 스트림에서 확인되나 Claude 인식 불확실 | 추가 조사 필요 |
| B. Permission events | **`-p` 미지원** — interactive 전용 | 자동화 테스트 불가 |
| C1. 병렬 vs 순차 | 병렬이 **43% 빠름** | nx-run에서 병렬 스폰 권장 |
| C2. stream events | **동작 확인** — hook_started/hook_response | 외부 모니터링 가능 |
| C3. model 파라미터 | **동작 확인** — haiku→sonnet 완전 전환 | 에이전트별 모델 최적화 |
