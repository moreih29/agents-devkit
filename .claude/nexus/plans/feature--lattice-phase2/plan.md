# Plan: feature/nexus-phase2

## 목표
Nexus 워크플로우 시스템 완성 — Parallel + Pipeline 프리미티브 구현 및 에이전트 확장으로 복합 워크플로우(auto 등) 조합이 가능한 상태 달성.

## 설계 원칙
Claude 자체가 오케스트레이터. 별도 런타임 없이, **스킬 프롬프트 + 상태 파일 + 컨텍스트 주입(Pulse)**으로 워크플로우를 구동.
- Nonstop: Gate가 Stop 차단 → Claude가 계속 작업
- Parallel: 스킬 프롬프트가 Claude에게 태스크 분할 + Agent 도구 병렬 호출 지시
- Pipeline: 스킬 프롬프트가 Claude에게 단계별 순차 실행 지시, Gate가 단계 간 Stop 차단

## 완료 조건
- [x] Parallel 스킬 + 상태 스키마 + Gate 연동
- [x] Pipeline 스킬 + 상태 스키마 + Gate 연동 (기존 스캐폴딩 확장)
- [x] Gate 훅 확장 (Parallel Stop 차단)
- [x] Pulse 훅 확장 (활성 워크플로우 컨텍스트 주입)
- [x] 에이전트 4개 추가 (Strategist, Reviewer, Analyst, Debugger)
- [x] 복합 워크플로우 스킬 1개 (auto = Pipeline + Nonstop + Parallel)
- [x] E2E 테스트 확장 (28개, 전부 통과)
- [x] nexus-test에서 수동 검증
- [x] 빌드 + 캐시 동기화

## 현재 상태 (Phase 1에서 이미 존재)
- Gate: `parallel`/`pipeline` 키워드 감지 → 상태 파일 생성 + additionalContext 주입
- Gate: Pipeline `active` 시 Stop 차단
- State: `activatePrimitive()`가 generic 상태 파일 생성 (`{ active, maxIterations, currentIteration }`)
- Tracker: SubagentStart/Stop 추적 (Parallel 에이전트 모니터링에 활용 가능)

## 개발 단위 (순서)

### Unit 1: Parallel 프리미티브
**범위**: 독립 태스크를 여러 에이전트에 병렬 배분하는 워크플로우.

#### 1a. 상태 스키마 확장
현재 generic 상태 → Parallel 전용 스키마로 확장.

```typescript
// .nexus/state/sessions/{id}/parallel.json
interface ParallelState {
  active: boolean;
  maxIterations: number;
  currentIteration: number;
  startedAt: string;
  sessionId: string;
  // Phase 2 추가
  tasks: Array<{
    id: string;
    description: string;
    agent: string;          // "builder", "finder" 등
    status: 'pending' | 'running' | 'done' | 'failed';
    result?: string;
  }>;
  completedCount: number;
  totalCount: number;
}
```

#### 1b. Gate 훅 확장
- Parallel `active` + `completedCount < totalCount` → Stop 차단
- 모든 태스크 완료 시 자동 해제

```typescript
// gate.ts handleStop() 에 추가
const parallelPath = statePath(sid, 'parallel');
if (existsSync(parallelPath)) {
  const state = JSON.parse(readFileSync(parallelPath, 'utf-8'));
  if (state.active && state.completedCount < state.totalCount) {
    respond({
      decision: 'block',
      reason: `[PARALLEL ${state.completedCount}/${state.totalCount}] 병렬 태스크 진행 중.`,
    });
    return;
  }
}
```

#### 1c. 스킬 정의
파일: `skills/parallel/SKILL.md`

핵심 지시:
1. 사용자 요청을 독립 태스크로 분할
2. 각 태스크를 적절한 에이전트에 배정
3. `nx_state_write`로 Parallel 상태 활성화 (tasks 배열 포함)
4. `Agent` 도구로 에이전트 병렬 호출 (한 메시지에 여러 Agent 호출)
5. 결과 수집 후 `nx_state_write`로 태스크 상태 업데이트
6. 전체 완료 시 `nx_state_clear({ key: "parallel" })`

검증: `[parallel]` 태그 또는 "병렬로" 키워드 → 태스크 분할 → 에이전트 병렬 실행 → Stop 차단 → 완료 후 해제

### Unit 2: Pipeline 프리미티브
**범위**: 정의된 단계를 순서대로 실행하는 워크플로우.

#### 2a. 상태 스키마 확장

```typescript
// .nexus/state/sessions/{id}/pipeline.json
interface PipelineState {
  active: boolean;
  maxIterations: number;
  currentIteration: number;
  startedAt: string;
  sessionId: string;
  // Phase 2 추가
  stages: Array<{
    name: string;
    agent: string;
    status: 'pending' | 'running' | 'done' | 'skipped' | 'failed';
    result?: string;
  }>;
  currentStage: string;
  currentStageIndex: number;
  totalStages: number;
}
```

#### 2b. Gate 훅 확장
기존 Pipeline Stop 차단 로직을 스키마에 맞게 보강:
- `currentStageIndex < totalStages` → 차단 메시지에 현재 단계 표시
- 모든 단계 완료 시 자동 해제

#### 2c. 스킬 정의
파일: `skills/pipeline/SKILL.md`

핵심 지시:
1. 사용자 요청을 순차 단계로 분해 (analyze → plan → implement → verify)
2. `nx_state_write`로 Pipeline 상태 활성화 (stages 배열 포함)
3. 각 단계마다: 적절한 에이전트 호출 → 결과를 state에 기록 → 다음 단계 진행
4. 단계 내에서 Nonstop/Parallel 중첩 가능
5. 전체 완료 시 `nx_state_clear({ key: "pipeline" })`

검증: `[pipeline]` 태그 → 단계 정의 → 순차 실행 → 단계 간 Stop 차단 → 완료 후 해제

### Unit 3: Pulse 훅 확장
**범위**: 활성 워크플로우 상태를 PreToolUse 컨텍스트에 주입.

현재 Pulse는 기본 Whisper 패턴만 주입. Phase 2에서:
- 활성 Parallel 상태 → `[PARALLEL 3/5 tasks done]` 컨텍스트 주입
- 활성 Pipeline 상태 → `[PIPELINE stage: implement (3/4)]` 컨텍스트 주입
- 에이전트별 context 수준(minimal/standard/full) 구분은 Phase 3로 연기 (YAGNI)

파일: `src/hooks/pulse.ts` 수정

### Unit 4: 에이전트 4개 추가
**범위**: Phase 2 에이전트 마크다운 정의.

| 파일 | 이름 | 역할 | tier | context | model |
|------|------|------|------|---------|-------|
| `agents/strategist.md` | Strategist | 계획 수립 | high | full | opus |
| `agents/reviewer.md` | Reviewer | 코드 리뷰 | high | full | opus |
| `agents/analyst.md` | Analyst | 심층 분석/리서치 | high | full | opus |
| `agents/debugger.md` | Debugger | 디버거 | medium | standard | sonnet |

각 에이전트는 Phase 1과 동일한 포맷: frontmatter + Role/Guidelines.
Pipeline/Parallel 스킬에서 에이전트를 참조할 수 있도록 역할이 명확해야 함.

### Unit 5: 복합 워크플로우 스킬 (auto)
**범위**: Pipeline + Nonstop + Parallel 조합 스킬.

파일: `skills/auto/SKILL.md`

워크플로우:
```yaml
stages:
  - name: analyze
    agent: analyst
    nonstop: true
  - name: plan
    agent: strategist
    nonstop: true
  - name: implement
    type: parallel       # 이 단계는 병렬
    agent: builder
    nonstop: true
  - name: verify
    agent: guard
    nonstop: true
  - name: review
    agent: reviewer
```

스킬 프롬프트가 이 패턴을 Claude에게 지시:
1. Pipeline 상태 활성화
2. 각 단계마다 Nonstop 활성화 → 에이전트 호출 → 완료 후 Nonstop 해제 → 다음 단계
3. implement 단계는 Parallel로 태스크 분배
4. 전체 완료 후 Pipeline + Nonstop 모두 해제

### Unit 6: E2E 테스트 확장 + 빌드
**범위**: Phase 2 기능 테스트 + 빌드 파이프라인.

- `test/e2e.sh` 확장: Parallel/Pipeline 상태 CRUD, Gate 차단 시나리오
- `bun run build` → `bun run dev` → nexus-test 수동 검증
- 수동 검증: auto 스킬 실행 → 단계별 진행 확인

## 구현 순서 요약

```
Unit 1 (Parallel) → Unit 2 (Pipeline) → Unit 3 (Pulse) → Unit 4 (에이전트) → Unit 5 (auto) → Unit 6 (테스트)
```

Unit 1, 2는 순차 (Gate 훅 공유). Unit 3, 4는 독립이므로 Unit 2 이후 병렬 가능.

## 기술 결정

### 오케스트레이션 런타임 없음
별도 orchestrator 프로세스 없이, Claude 자신이 스킬 프롬프트에 따라 태스크 분할/단계 전이를 수행.
장점: 구현 단순, Claude의 판단력 활용, 추가 인프라 불필요.
단점: Claude가 프롬프트를 무시할 수 있음 → Gate Stop 차단으로 보완.

### 상태 스키마 확장 vs 새 도구
기존 `nx_state_write/read/clear`로 충분. Parallel/Pipeline 전용 도구는 만들지 않음.
스킬 프롬프트가 올바른 스키마로 state를 쓰도록 지시.

### 에이전트 context 수준 분기는 Phase 3
Phase 1 Pulse는 모든 에이전트에 동일 컨텍스트 주입. minimal/standard/full 분기는 복잡도 대비 효용이 Phase 2에서는 낮음.

## 참조
- `.claude/nexus/plans/feature--nexus-phase1.md` — Phase 1 계획 (완료)
- `.claude/nexus/knowledge/workflows.md` — 3 프리미티브 설계
- `.claude/nexus/knowledge/agents-catalog.md` — 에이전트 카탈로그
- `src/hooks/gate.ts` — 기존 Gate 구현 (키워드 감지 + Stop 차단)
