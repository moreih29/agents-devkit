---
name: auto
description: Fully autonomous execution — combines Pipeline + Nonstop for end-to-end automation.
triggers: ["auto", "자동으로 전부 해줘", "end to end"]
---
# Auto

Fully autonomous execution from analysis to verified completion — combines Pipeline + Nonstop + Parallel.

## Trigger
- User says: "auto", "자동으로 전부 해줘", "end to end"
- Explicit tag: `[auto]`
- Direct invocation: `/nexus:auto`

## What It Does

Runs a full Pipeline with Nonstop active at each stage:

```
analyze → plan → implement (parallel) → verify → review
```

Each stage uses the most appropriate agent. The implement stage runs subtasks in parallel when possible.

## Activation

1. Activate Pipeline with predefined stages:
```
nx_state_write({
  key: "pipeline",
  value: {
    active: true,
    maxIterations: 100,
    currentIteration: 0,
    startedAt: "<current ISO timestamp>",
    sessionId: "<session ID>",
    stages: [
      { "name": "analyze", "agent": "analyst", "status": "pending" },
      { "name": "plan", "agent": "strategist", "status": "pending" },
      { "name": "implement", "agent": "builder", "status": "pending" },
      { "name": "verify", "agent": "guard", "status": "pending" },
      { "name": "review", "agent": "reviewer", "status": "pending" }
    ],
    currentStage: "analyze",
    currentStageIndex: 0,
    totalStages: 5
  }
})
```

2. Activate Nonstop to prevent premature stopping:
```
nx_state_write({
  key: "nonstop",
  value: {
    active: true,
    maxIterations: 100,
    currentIteration: 0,
    startedAt: "<current ISO timestamp>",
    reason: "auto mode"
  }
})
```

## Stage Details

### 1. Analyze (Analyst)
- Understand the codebase and the user's request
- Identify affected files, dependencies, and constraints
- Output: Analysis summary with key findings

### 2. Plan (Strategist)
- Create an implementation plan based on analysis
- Break work into units, identify parallel opportunities
- Output: Ordered task list with agent assignments

### 3. Implement (Builder, parallel if possible)
- If the plan has independent units, activate Parallel:
  ```
  nx_state_write({ key: "parallel", value: { active: true, tasks: [...], ... } })
  ```
- Spawn Builder agents for each independent unit
- After all complete: `nx_state_clear({ key: "parallel" })`
- Output: Implemented changes

### 4. Verify (Guard)
- Run tests, type-check, lint
- Verify the implementation matches the plan
- **If verify fails**: do NOT proceed to Review. Instead:
  1. Analyze failure cause
  2. Go back to Plan (stage 2) — replan with failure context
  3. Re-implement (stage 3)
  4. Re-verify (stage 4)
  - Max 3 replan cycles. After 3 failures, stop and report to user.
- Output: Verification report

### 5. Review (Reviewer)
- Final code review of all changes
- If critical issues found: loop back to implement
- Output: Review summary

## Stage Transitions

After each stage:
1. Update pipeline state (mark stage done, advance index)
2. Pass stage results as context to the next stage
3. If a stage fails after 3 retries, abort and report

### 6. Sync (자동)
- Review 완료 후 knowledge 문서와 소스 코드 간 불일치 탐지
- 불일치 발견 시 자동 수정 (사용자 확인 없이)
- 불일치 없으면 건너뜀

## Deactivation

When all stages complete or pipeline aborts:
```
nx_state_clear({ key: "auto" })
```
This single call clears both pipeline and nonstop state at once.
Report the full outcome: what was analyzed, planned, implemented, verified, reviewed, and synced.

## Safety Limits

- **maxIterations**: 100 per primitive
- **Stage retries**: Max 3 per stage
- **User cancel**: User can say "stop" at any time
- If stuck in a loop, abort and report what was accomplished
