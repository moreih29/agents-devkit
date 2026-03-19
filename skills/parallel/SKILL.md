# Parallel

Execute independent tasks concurrently across multiple agents.

## Trigger
- User says: "parallel", "concurrent", "동시에", "병렬로"
- Explicit tag: `[parallel]`
- Direct invocation: `/lattice:parallel`

## What It Does

1. Decomposes the user's request into independent subtasks
2. Assigns each subtask to the most appropriate agent
3. Launches all agents in parallel using the Agent tool
4. Collects results and reports completion

## Activation

Analyze the request and break it into independent tasks. Then activate:
```
lat_state_write({
  key: "parallel",
  value: {
    active: true,
    maxIterations: 100,
    currentIteration: 0,
    startedAt: "<current ISO timestamp>",
    sessionId: "<session ID>",
    tasks: [
      { "id": "task-1", "description": "...", "agent": "artisan", "status": "pending" },
      { "id": "task-2", "description": "...", "agent": "artisan", "status": "pending" }
    ],
    completedCount: 0,
    totalCount: 2
  }
})
```

## Agent Selection

| Agent | Use For |
|-------|---------|
| Scout (haiku) | File lookups, code search, quick reads |
| Artisan (sonnet) | Implementation, bug fixes, refactoring |
| Sentinel (sonnet) | Verification, testing, security review |
| Analyst (opus) | Deep analysis, research |
| Tinker (sonnet) | Debugging, root cause analysis |

## Execution

1. Send ALL agent calls in a **single message** to maximize parallelism:
```
Agent({ subagent_type: "lattice:artisan", prompt: "Task 1: ..." })
Agent({ subagent_type: "lattice:artisan", prompt: "Task 2: ..." })
Agent({ subagent_type: "lattice:scout", prompt: "Task 3: ..." })
```
2. As each agent completes, update state:
```
lat_state_write({
  key: "parallel",
  value: { ...currentState, tasks: [...updated], completedCount: N }
})
```
3. If a task fails, decide: retry with a different agent, or report failure.

## Task Decomposition Rules

- Each task must be **independent** — no shared state, no ordering dependency
- If tasks have dependencies, use Pipeline instead
- Prefer fewer, well-scoped tasks over many tiny ones
- Each task description must be self-contained (the agent has no context from other tasks)

## Deactivation

When all tasks are done OR an unresolvable blocker occurs:
```
lat_state_clear({ key: "parallel" })
```
Then synthesize results from all tasks and report to the user.

## Safety Limits

- **maxIterations**: 100 (default). If reached, auto-deactivates.
- **Task failure**: If the same task fails 3 times, mark it as failed and continue others.
- **User cancel**: User can say "stop" or invoke `lat_state_clear({ key: "parallel" })`.
