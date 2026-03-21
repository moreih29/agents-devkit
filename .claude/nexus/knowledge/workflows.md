# Nexus 워크플로우 시스템

## 실행 모델

스킬은 Gate의 키워드 감지를 통해 자동으로 활성화되거나 직접 호출한다. 활성화된 스킬은 `workflow.json`에 상태를 기록하며, 에이전트 위임은 LLM이 직접 결정한다.

## 스킬

### Consult (상담)
- **기능**: 적응형 깊이 + 차원 추적을 통해 사용자의 진짜 의도를 파악하고 구조화된 선택지를 제공
- **키워드**: consult, 상담, 어떻게 하면 좋을까, 뭐가 좋을까, 방법을 찾아
- **상태 파일**: `.nexus/state/sessions/{id}/workflow.json` (`mode: "consult"`)
- **적응형 깊이**: 불명확 차원 0-1개 → lightweight, 2개 이상 → deep
- **차원 추적**: Goal / Constraints / Criteria / Context (✅/⚠️/❌ 정성 평가, 숫자 점수 없음)
- **Brownfield/Greenfield 자동 감지** → 탐색 방식 분기
- 워크플로우: explore → assess → (clarify) → diverge → propose → converge → crystallize → execute bridge

### Plan (계획)
- **기능**: 합의 루프 기반 구현 계획 수립. 규모별 적응형 형식성
- **키워드**: plan, 계획 세워/짜/수립, 설계해, 어떻게 구현, plan this
- **상태 파일**: `.nexus/state/sessions/{id}/workflow.json` (`mode: "plan"`)
- **합의 루프**: Strategist(초안) → Architect(구조 검토) → Reviewer(비판), 최대 3회 반복
- **적응형 형식성**: 소규모(Strategist 단독) / 중규모(+Architect) / 대규모(3자 합의 + ADR)
- **결정 캡처**: `[d]` 태그로 아키텍처 결정 명시 → planning 모드에서 LLM 자동 감지
- 워크플로우: analyze → draft → [review loop] → persist → execute bridge

### Init (온보딩)
- **기능**: 기존 프로젝트에 Nexus 도입 시 기존 문서를 트리아지하여 knowledge 자동 생성
- **키워드**: init, 온보딩, nexus 설정, 프로젝트 초기화
- **상태 파일 없음** — 대화형 one-shot 프로세스
- 워크플로우: SCAN → TRIAGE → PROPOSE → GENERATE → VERIFY

### Setup (설정)
- **기능**: 플러그인 초기 설정 (hooks.json 등록, MCP 설정)
- **키워드**: setup, nexus setup, 플러그인 설정

### Sync (지식 동기화)
- **기능**: 소스 코드와 knowledge 문서 간 불일치 탐지 및 수정
- **키워드**: sync, sync knowledge, 지식 동기화

## Stop 차단

활성 워크플로우 모드(consult/plan)나 활성 에이전트가 있으면 Stop을 차단:

```javascript
// workflow.json에 mode와 phase가 있으면 block
{ "decision": "block", "reason": "[PLAN: draft] Workflow is active." }

// agents.json에 활성 에이전트가 있으면 block
{ "decision": "block", "reason": "[AGENTS] Builder is still active." }
```

## 실패 복구 (Pulse)

`workflow.json`의 `failures` 배열에 실패 이력 기록, 최대 3회 재시도:

```json
{
  "mode": "plan",
  "phase": "draft",
  "failures": [
    { "phase": "review", "reason": "timeout", "at": "..." }
  ]
}
```

3회 초과 시 워크플로우 중단 + 사용자에게 상태 보고.

## 에이전트 위임 형식 (6-Section)

에이전트 프롬프트에 주입되는 위임 요청의 표준 형식:

```
## Task
[무엇을 해야 하는지]

## Context
[관련 배경 정보]

## Constraints
[제약 조건]

## Expected Output
[기대 결과물 형식]

## Resources
[참조할 파일/도구]

## Decision Points
[결정이 필요한 사항 — [d] 태그로 표시]
```

## 키워드 감지

Gate가 UserPromptSubmit에서 감지하는 키워드 우선순위:

1. 스킬 키워드 (`[consult]`/`[plan]`/`[init]`/`[setup]` 및 자연어) → workflow.json 생성 + 스킬 호출 지시
2. 결정 태그 (`[d]`) → planning 모드에서 LLM이 ADR 캡처
3. 태스크 자연어 ("진행중인 작업", "다음 할 일", "작업 현황") → nx_task_* 호출 안내
4. 적응형 라우팅 → 요청 카테고리 분류 → 에이전트 위임 지시
