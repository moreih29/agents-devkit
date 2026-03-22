<!-- tags: hooks, gate -->
# Nexus 훅 모듈 상세

## 모듈 구성

모든 훅은 hooks.json에 등록된 별도 프로세스. 단일 CJS 스크립트로 실행 (omc의 이중 스폰 제거).

```
scripts/gate.cjs     → Stop, UserPromptSubmit
```

Memory 모듈은 MCP 도구(`nx_*`)이므로 hooks.json에 등록하지 않음.

## Gate 모듈

유일한 훅 모듈. Stop 이벤트 차단과 키워드 감지를 담당.

### Stop 처리 (`handleStop`)
순차 체크:
1. `.nexus/tasks.json`에 pending(todo/in_progress) 태스크가 있으면 block
2. 모든 태스크 completed → 아카이브 지시
3. 그 외 허용

```javascript
// 태스크 pending 시
{ "decision": "block", "reason": "[TASKS] 3 tasks still pending. Complete tasks or archive with nx_plan_archive()." }

// 모든 완료 시
{ "decision": "block", "reason": "[TASKS] All tasks completed. Archive the plan with nx_plan_archive()." }
```

### 키워드 감지 (UserPromptSubmit)
자연어 + 명시적 태그 감지 → 스킬 호출 지시 주입.

감지 우선순위:
1. 스킬 키워드 (`[consult]`/`[team]`/`[init]`/`[setup]` 및 자연어) → 스킬 호출 지시
2. 결정 태그 (`[d]`) → LLM이 decisions.json에 캡처하도록 지시
3. 태스크 자연어 ("진행중인 작업", "다음 할 일", "작업 현황", "막힌 작업") → nx_task_* 호출 안내
4. 적응형 라우팅 → 요청 카테고리 분류 → 에이전트 위임 지시

## Phase별 최적화

| Phase | 전략 | Gate |
|-------|------|------|
| P1 | 경량 스크립트 | 매번 프로세스 |
| P2 | 선택적 등록 | 항상 등록 |
| P3 | 상주 데몬 (필요 시) | 데몬 질의 |

인터페이스(stdin JSON → stdout JSON)는 전략에 무관하게 동일하므로 교체 가능.
