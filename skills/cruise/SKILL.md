# Cruise

Fully autonomous execution from analysis to verified completion — combines Pipeline + Sustain + Parallel.

## Trigger
- User says: "cruise", "자동으로 전부 해줘", "end to end"
- Explicit tag: `[cruise]`
- Direct invocation: `/lattice:cruise`

## What It Does

Runs a full Pipeline with Sustain active at each stage:

```
analyze → plan → implement (parallel) → verify → review
```

Each stage uses the most appropriate agent. The implement stage runs subtasks in parallel when possible.

## Activation

1. Activate Pipeline with predefined stages:
```
lat_state_write({
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
      { "name": "implement", "agent": "artisan", "status": "pending" },
      { "name": "verify", "agent": "sentinel", "status": "pending" },
      { "name": "review", "agent": "lens", "status": "pending" }
    ],
    currentStage: "analyze",
    currentStageIndex: 0,
    totalStages: 5
  }
})
```

2. Activate Sustain to prevent premature stopping:
```
lat_state_write({
  key: "sustain",
  value: {
    active: true,
    maxIterations: 100,
    currentIteration: 0,
    startedAt: "<current ISO timestamp>",
    reason: "cruise mode"
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

### 3. Implement (Artisan, parallel if possible)
- If the plan has independent units, activate Parallel:
  ```
  lat_state_write({ key: "parallel", value: { active: true, tasks: [...], ... } })
  ```
- Spawn Artisan agents for each independent unit
- After all complete: `lat_state_clear({ key: "parallel" })`
- Output: Implemented changes

### 4. Verify (Sentinel)
- Run tests, type-check, lint
- Verify the implementation matches the plan
- If issues found: loop back to implement stage (max 3 retries)
- Output: Verification report

### 5. Review (Lens)
- Final code review of all changes
- If critical issues found: loop back to implement
- Output: Review summary

## Stage Transitions

After each stage:
1. Update pipeline state (mark stage done, advance index)
2. Pass stage results as context to the next stage
3. If a stage fails after 3 retries, abort and report

## Deactivation

When all stages complete or pipeline aborts:
```
lat_state_clear({ key: "cruise" })
```
This single call clears both pipeline and sustain state at once.
Report the full outcome: what was analyzed, planned, implemented, verified, and reviewed.

## Safety Limits

- **maxIterations**: 100 per primitive
- **Stage retries**: Max 3 per stage
- **User cancel**: User can say "stop" at any time
- If stuck in a loop, abort and report what was accomplished
