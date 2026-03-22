<!-- tags: workflows, skills, gate -->
# Nexus 워크플로우 시스템

## 실행 모델

스킬은 Gate의 키워드 감지를 통해 자동으로 활성화되거나 직접 호출한다. 에이전트 위임은 LLM이 직접 결정한다.

## 스킬

### Consult (상담)
- **기능**: 4단계 워크플로우로 사용자의 진짜 의도를 파악하고 구조화된 선택지를 제공. 상담 전용, 실행 없음
- **키워드**: consult, 상담, 어떻게 하면 좋을까, 뭐가 좋을까, 방법을 찾아
- **단계**: Explore → Clarify → Propose → Converge

### Team (계획)
- **기능**: Lead가 직접 초안 작성. tasks.json 중심으로 태스크 관리. 항상 Agent Teams 활용
- **키워드**: team, 계획 세워/짜/수립, 설계해, 어떻게 구현, plan this
- **결정 캡처**: `[d]` 태그로 아키텍처 결정 명시 → nx_decision_add로 decisions.json에 기록
- 워크플로우: analyze → draft → persist(tasks.json) → [review loop] → execute bridge

### Init (온보딩)
- **기능**: 기존 프로젝트에 Nexus 도입 시 기존 문서를 트리아지하여 knowledge 자동 생성
- **키워드**: init, 온보딩, nexus 설정, 프로젝트 초기화
- 워크플로우: SCAN → TRIAGE → PROPOSE → GENERATE → VERIFY

### Setup (설정)
- **기능**: 플러그인 초기 설정 (hooks.json 등록, MCP 설정)
- **키워드**: setup, nexus setup, 플러그인 설정

### Sync (지식 동기화)
- **기능**: 소스 코드와 knowledge 문서 간 불일치 탐지 및 수정
- **직접 호출만 지원**: `/nexus:nx-sync` (gate.ts의 자동 감지 없음)

## Stop 차단

`.nexus/tasks.json`에 pending 태스크가 있으면 Stop을 차단:

```javascript
// tasks.json에 pending 태스크가 있으면 block
{ "decision": "block", "reason": "[TASKS] 3 tasks still pending. Complete tasks or archive with nx_plan_archive()." }

// 모든 태스크 완료 시
{ "decision": "block", "reason": "[TASKS] All tasks completed. Archive the plan with nx_plan_archive()." }
```

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

1. 스킬 키워드 (`[consult]`/`[team]`/`[init]`/`[setup]` 및 자연어) → 스킬 호출 지시
2. 결정 태그 (`[d]`) → LLM이 nx_decision_add로 decisions.json에 캡처
3. 태스크 자연어 ("진행중인 작업", "다음 할 일", "작업 현황") → nx_task_* 호출 안내
4. 적응형 라우팅 → 요청 카테고리 분류 → 에이전트 위임 지시
