# Pipeline

Execute a sequence of stages in order, with optional Sustain and Parallel within each stage.

## Trigger
- User says: "pipeline", "auto", "자동으로", "순서대로"
- Explicit tag: `[pipeline]`
- Direct invocation: `/lattice:pipeline`

## What It Does

1. Decomposes the user's request into ordered stages
2. Executes each stage sequentially with the appropriate agent
3. Passes outputs from one stage to the next
4. Blocks Stop events between stages via Gate hook

## Activation

Analyze the request and define stages. Then activate:
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
      { "name": "analyze", "agent": "scout", "status": "pending" },
      { "name": "implement", "agent": "artisan", "status": "pending" },
      { "name": "verify", "agent": "sentinel", "status": "pending" }
    ],
    currentStage: "analyze",
    currentStageIndex: 0,
    totalStages: 3
  }
})
```

## Stage Execution

For each stage:

1. Update state to mark the stage as `running`:
```
lat_state_write({
  key: "pipeline",
  value: { ...currentState, currentStage: "implement", currentStageIndex: 1,
           stages: [...with status: "running"] }
})
```

2. Invoke the assigned agent:
```
Agent({ subagent_type: "lattice:artisan", prompt: "Stage: implement\nContext from previous stage: ...\nTask: ..." })
```

3. On completion, mark stage as `done` and advance:
```
lat_state_write({
  key: "pipeline",
  value: { ...currentState, currentStageIndex: 2, currentStage: "verify",
           stages: [...with status: "done", result: "..."] }
})
```

4. If a stage fails, decide: retry, skip, or abort pipeline.

## Stage Types

A stage can optionally use other primitives:

- **sustain stage**: Activate Sustain within a stage for long-running work
  ```
  lat_state_write({ key: "sustain", value: { active: true, ... } })
  // ... do work ...
  lat_state_clear({ key: "sustain" })
  ```

- **parallel stage**: Use Parallel within a stage for concurrent subtasks
  ```
  lat_state_write({ key: "parallel", value: { active: true, tasks: [...], ... } })
  // ... spawn agents ...
  lat_state_clear({ key: "parallel" })
  ```

## Common Stage Patterns

```
analyze → plan → implement → verify              # standard
analyze → implement (parallel) → verify → review  # with parallel
plan → implement → test → fix → test (loop)       # with retry
```

## Context Passing

Each stage receives the results of previous stages. Include relevant context in the agent prompt:
- What was decided/found in prior stages
- Key artifacts (file paths, function names, test results)
- Constraints or requirements from earlier analysis

## Deactivation

When all stages complete OR pipeline is aborted:
```
lat_state_clear({ key: "pipeline" })
```
Then report the final result summarizing all stage outcomes.

## Safety Limits

- **maxIterations**: 100 (default). If reached, auto-deactivates.
- **Stage failure**: If a stage fails 3 times, abort pipeline and report.
- **User cancel**: User can say "stop" or invoke `lat_state_clear({ key: "pipeline" })`.
