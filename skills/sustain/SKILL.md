# Sustain

Persistent execution mode — prevents Claude from stopping until the task is complete.

## Trigger
- User says: "sustain", "keep going", "don't stop", "멈추지 마"
- Explicit tag: `[sustain]`
- Direct invocation: `/lattice:sustain`

## What It Does

1. Activates Sustain state via `lat_state_write`
2. Gate hook blocks Stop events while active
3. You continue working until the task is truly complete
4. When done, deactivate via `lat_state_clear`

## Activation

Call the MCP tool to activate:
```
lat_state_write({
  key: "sustain",
  value: {
    active: true,
    maxIterations: 100,
    currentIteration: 0,
    startedAt: "<current ISO timestamp>",
    reason: "<what you're working on>"
  }
})
```

## During Sustain

- The Gate hook will block Stop events and remind you to continue
- After each meaningful step, increment `currentIteration` via `lat_state_write`
- Check your progress against the original goal
- If blocked or stuck, report to the user instead of looping forever

## Deactivation

When the task is complete OR you've hit an unresolvable blocker:
```
lat_state_clear({ key: "sustain" })
```

Then report what was accomplished.

## Safety Limits

- **maxIterations**: 100 (default). If reached, Sustain auto-deactivates.
- **User cancel**: User can say "stop", "cancel", or invoke `/lattice:cancel` at any time.
- **Error loop**: If the same error occurs 3 times, stop and report.

## Cancel

To cancel Sustain manually:
```
lat_state_clear({ key: "sustain" })
```
