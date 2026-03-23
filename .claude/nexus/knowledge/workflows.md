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
- **기능**: Lead가 팀을 구성하고 사용자 소통을 담당. Analyst가 심층 분석 + 태스크 소유. Analyst ↔ Architect 합의 기반 계획. tasks.json 중심으로 태스크 관리. Agent Teams 활용
- **키워드**: team, team this, 팀 구성/으로
- **결정 캡처**: `[d]` 태그로 아키텍처 결정 명시 → nx_decision_add로 decisions.json에 기록
- **진행 표시**: Lead가 팀원 SendMessage 보고 수신 시 TodoWrite로 태스크 진행 상황 갱신 (tasks.json은 Gate Stop용, TodoWrite는 가시성용)
- **타임아웃**: Builder가 착수 시 예상 소요 시간 보고 → 초과 시 Lead가 확인 ping
- 워크플로우: Intake(Lead) → Analyze(Analyst) → Plan(Analyst+Architect 합의) → Execute(Builder/Guard) → Complete(Lead)

### Sub (경량 실행)
- **기능**: Lead가 직접 분석 후 Builder 서브에이전트를 direct spawn. 합의 루프/tasks.json/Gate Stop 없음. 1-3개 태스크 수준 단순 작업 전용
- **키워드**: [sub] 태그만 (자연어 감지 없음)
- **단계**: Analyze(Lead 직접) → Spawn(Builder direct spawn) → Verify(조건부 Guard) → Done
- **Guard 조건**: 변경 파일 3개 이상, 기존 테스트 모듈 수정, 또는 Lead 판단
- **복잡도 가드**: 4+ 서브태스크 또는 cross-cutting concerns → [team] 전환 제안

### Init (온보딩)
- **기능**: 기존 프로젝트에 Nexus 도입 시 기존 문서를 트리아지하여 knowledge 자동 생성
- **직접 호출만 지원**: `/nexus:nx-init` (gate.ts의 자동 감지 없음)
- 워크플로우: SCAN → TRIAGE → PROPOSE → GENERATE → VERIFY

### Setup (설정)
- **기능**: 플러그인 초기 설정 (hooks.json 등록, MCP 설정)
- **직접 호출만 지원**: `/nexus:nx-setup` (gate.ts의 자동 감지 없음)

### Sync (지식 동기화)
- **기능**: git diff 기반 소스 변경점 감지 → knowledge 문서 drift 탐지 및 수정 (STALE/MISSING/ORPHAN)
- **Prerequisites**: git repository 필수, `.claude/nexus/knowledge/`에 파일 2개 이상
- **단계**: Phase 0(Context Detection) → 1(Detect Changes) → 2(Scan Knowledge) → 3(Compare & Report) → 4(Apply Fixes)
- **직접 호출만 지원**: `/nexus:nx-sync` (gate.ts의 자동 감지 없음)

## Stop 차단

`.nexus/tasks.json`에 pending 태스크가 있으면 Stop을 차단:

```javascript
// tasks.json에 pending 태스크가 있으면 — continue:true + 리마인더
{ "continue": true, "additionalContext": "[NEXUS] N tasks remaining in tasks.json. Complete all tasks before stopping." }

// 모든 태스크 완료 시 — continue:true + 아카이브 지시
{ "continue": true, "additionalContext": "[NEXUS] All tasks completed. Run nx_plan_archive() to archive this plan, then report results to the user." }
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

1. 결정 태그 (`[d]`) → LLM이 nx_decision_add로 decisions.json에 캡처
2. 스킬 키워드 (`[consult]`/`[team]`/`[sub]` 및 자연어) → 스킬 호출 지시
   - `[sub]`는 명시적 태그만 지원 (자연어 감지 없음)
