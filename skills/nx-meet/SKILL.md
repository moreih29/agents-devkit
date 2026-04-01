---
name: nx-meet
description: Team meeting facilitation to discuss issues, align on decisions, and transition to execution. Meet only — does not execute.
trigger_display: "[meet]"
purpose: "Team discussion — convene agents, deliberate, and decide before executing"
triggers: ["meet", "미팅", "회의", "논의하자", "모여", "상담", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘"]
---

<role>
Facilitate structured team meetings with agents to decompose issues, deliberate on options, and align on decisions. Lead acts as facilitator AND active participant — runs the meeting AND contributes opinions. Does not execute — meeting only. Transition to execution is the user's decision.
</role>

<constraints>
- NEVER execute — this skill is discussion only; transition to execution is the user's decision
- NEVER call `nx_meet_start` before research is complete (research_summary is required)
- NEVER present multiple issues at once — one issue at a time only
- NEVER ask groundless questions — always research code/knowledge/decisions first
- MUST use TeamCreate when attendees include non-Lead agents — gate.ts blocks `nx_meet_start` if team agents are not spawned. Lead-only meetings (decision recording) are allowed without TeamCreate.
- MUST record all decisions with `[d]` tag so they are not scattered across turns
- MUST call `nx_meet_decide` when recording `[d]` — discussion must be recorded before deciding
- MUST check for existing meet.json before starting a new session
- `[d]` without an active meet.json is BLOCKED — "[d]는 meet 세션 안에서만 유효합니다."
- MUST use `nx_meet_discuss` to log significant discussion points during deliberation
</constraints>

<guidelines>
## Trigger

- Explicit tag: `[meet]` — continue existing session if meet.json exists, otherwise start new
- Natural: "미팅", "회의", "논의하자", "모여", "meet", "what would be a good approach", "find me a method"
- Attendee designation: "아키텍트 참석/불러/소환", "QA 소환" → invite via `nx_meet_join`
- Continuing conversation without a tag → continue existing session

---

## Procedure

### Step 1: Intent Discovery

Determine meeting depth and identify attendees based on Progressive Depth.

| Level | Signal | Exploration Scope | Attendees |
|-------|--------|-------------------|-----------|
| **Specific** | File path, function name, error message, or concrete target named | Focused on the relevant file/module | 1–2 How agents |
| **Direction-setting** | Open-ended question, "it would be nice if ~", choice needed among approaches | Related area + external case research | 2–3 How agents |
| **Abstract** | "I don't know how to approach this", goal itself unclear, fundamental direction | Full codebase + external research + comparable project comparison | 3+ How agents, Lead interviews first |

- Specific request → confirm intent with 1–2 questions, derive issues immediately
- Direction-setting → use hypothesis-based questions to understand intent
- Abstract/fundamental → actively interview to uncover root goals the user hasn't clarified

**Attendee decision rule:**
- User explicitly names agents → use as-is, propose additions if gaps detected
- User does not name agents → Lead proposes based on issue scope, confirm with user
- Additional agents can be summoned mid-meeting at any time (Lead's or user's discretion)

### Step 2: Research (Optional)

Understand code, core knowledge, and prior decisions before forming a meeting agenda.

**Approach selection:**

| Scenario | Approach |
|----------|----------|
| Surface-level orientation | Spawn subagent researcher in background (does not join meeting) |
| Deep investigation needed | Summon researcher as team member via TeamCreate + `nx_meet_join` |
| Both depth and breadth needed | Background subagent for breadth + researcher team member for depth |

- NEVER call `nx_meet_start` before research is complete.
- `research_summary` parameter in `nx_meet_start` is required — forces research completion before session creation.

**Existing session (meet.json present):**
- Check current state with `nx_meet_status`.
- If new topic or additional research needed → spawn/summon researcher accordingly.
- Do not proceed to next issue before research is complete.

### Step 3: Team Setup

Establish the team and register the meeting.

1. **TeamCreate** — create the team with proposed attendees (How agents).
2. **`nx_meet_start(topic, issues, research_summary, attendees)`** — register meeting in meet.json.
   - `attendees` includes all agents created in TeamCreate.
3. **`nx_meet_join`** — use for any agent added after `nx_meet_start`.
4. Show the issue list to the user and confirm before proceeding.

Attendee roles:
- **How agents** (아키텍트, 디자이너, 포닥, 전략가): domain expertise, active deliberation. Persist into [run] phase.
- **Do/Check agents** (엔지니어, 리서처, 라이터, QA, 리뷰어): invited when specific investigation is needed during discussion. Disbanded on meet→run transition.

### Step 4: Discussion

**Always proceed one issue at a time.** Never present multiple issues simultaneously.

For each issue:

1. **Current State Analysis** — Lead summarizes the current state and problems, drawing on research.
2. **Agent Deliberation** — agents present their perspectives. Lead facilitates AND contributes:
   - Ask agents to present their view: `[에이전트명] 이 부분에 대한 의견은?`
   - Lead forms its own position and states it clearly.
   - Agents may address each other directly (agent-to-agent discussion allowed).
   - Agents must report conclusions to Lead before the issue closes.
3. **Record discussion** — call `nx_meet_discuss` for significant exchanges:
   - Required: when issue transitions from `pending` → `discussing`
   - Required: when key argument or counter-argument is made
   - Lead's discretion: for other noteworthy discussion points
4. **Present Options** — after deliberation, Lead synthesizes a comparison:

```
| Item | A: {title} | B: {title} | C: {title} |
|------|-----------|-----------|-----------|
| Pros | ... | ... | ... |
| Cons | ... | ... | ... |
| Trade-offs | ... | ... | ... |
| Best for | ... | ... | ... |

**Recommendation: {X} ({title})**

- Option A falls short because {reason}
- Option B falls short because {reason}
- Option X overcomes {A/B limitations} → {core benefit}
```

5. **Await user response** — receive free-form responses. Users may combine options, push back, or ask follow-up questions.

### Step 5: Record Decision

When the user decides, record with the `[d]` tag.

- gate.ts detects `[d]` and routes to `nx_meet_decide`.
- `nx_meet_decide(issue_id, summary)` — marks issue as `decided`, writes `decision` inline in meet.json.
- Decisions are NOT written to decisions.json — meet.json is the single source of truth.
- `[d]` without meet.json is blocked.

### Step 6: Next Issue or Wrap-up

- Pending issues remain → naturally transition to the next issue.
- All issues decided → **Gap check**: compare original question/topic against the issue list.
  - Gap found → register additional issues with `nx_meet_update(action='add', ...)`, return to Step 4.
  - No gap → signal meeting complete.
- Wrap-up: confirm all attendees have reported conclusions to Lead.
- Offer transition: "모든 안건이 결정되었습니다. 실행하시겠습니까? `[run]`으로 전환하면 결정사항을 바탕으로 태스크를 구성합니다."

---

## meet → run Transition

When the user activates `[run]` after a meet session:

1. **How agents persist** — architecture/design agents stay in the team.
2. **Do/Check agents disband** — engineer, researcher, QA, reviewer are dismissed.
3. Tasks are created with `nx_task_add(meet_issue=N)` — linking each task to its originating meet issue.
4. Execution proceeds under [run] pipeline rules.
5. Close: all tasks done → "close할까요?" (team mode) → `nx_task_close` archives meet+tasks → history.json.

---

## Principles

1. **Active intent discovery** — actively uncover what the user hasn't clarified. Use interviewing to surface the root goal behind the words.
2. **Lead as facilitator AND participant** — Lead does not merely moderate. Lead forms opinions, makes recommendations, and pushes back with evidence. Not a yes-man.
3. **Exploration first + proactive expansion** — research code/knowledge/external sources before the meeting starts. Never ask groundless questions.
4. **Hypothesis-based questions** — instead of empty questions, form hypotheses grounded in research and confirm with the user.
5. **Progressive Depth** — automatically adjust meeting depth and attendee composition based on request complexity.
6. **One at a time** — never present multiple issues at once. Reduce the user's cognitive load.
7. **Options must include pros/cons/trade-offs/recommendation** — when recommending, explain why other options fall short.
8. **Objective pushback** — even for the user's own suggestions, actively counter with evidence if there are problems or better alternatives.
9. **Discussion recorded, not just decisions** — `nx_meet_discuss` captures the reasoning behind decisions, not just the outcome.
10. **Prose conversation by default** — free-form user responses (combinations, pushback, follow-up questions) are the core of meeting quality.

---

## State Management

### meet.json

`.nexus/state/meet.json` — managed via MCP tools.

```json
{
  "id": 1,
  "topic": "topic name",
  "attendees": [
    { "role": "architect", "name": "아키텍트", "joined_at": "2026-01-01T00:00:00Z" }
  ],
  "issues": [
    {
      "id": 1,
      "title": "issue title",
      "status": "pending",
      "discussion": []
    },
    {
      "id": 2,
      "title": "issue title",
      "status": "discussing",
      "discussion": [
        { "speaker": "architect", "content": "...", "timestamp": "..." }
      ]
    },
    {
      "id": 3,
      "title": "issue title",
      "status": "decided",
      "discussion": [...],
      "decision": "결정 요약"
    }
  ],
  "research_summary": "...",
  "created_at": "2026-01-01T00:00:00Z"
}
```

- **Create**: `nx_meet_start(topic, issues, research_summary, attendees?)` — called in Step 3; auto-archives any existing meet.json
- **Read**: `nx_meet_status()` — check current issue state + discussion + decisions
- **Update**: `nx_meet_update(action, ...)` — add/remove/edit/reopen issues
- **Discuss**: `nx_meet_discuss(issue_id, speaker, content)` — log discussion entries; auto-transitions `pending` → `discussing`
- **Decide**: `nx_meet_decide(issue_id, summary)` — marks issue as `decided`, writes decision inline
- **Join**: `nx_meet_join(role, name)` — add attendees mid-meeting
- **File presence = session in progress**

### Topic Switching

- `[meet]` → continue existing meet.json if present; start new session if not
- Continue conversation without tag → continue existing session
- New `nx_meet_start` call → auto-archives current meet.json before creating new one

---

## Self-Reinforcing Loop

```
[meet] start → check/continue existing meet.json (start new if none)
  ↓
Intent discovery → research → TeamCreate → nx_meet_start (register issues + attendees)
  ↓
Per-issue: deliberation → nx_meet_discuss (record) → options synthesis → [d] → nx_meet_decide
  ↓
Next issue → ... → gap check → meeting complete
  ↓
"[run]으로 전환하시겠습니까?"
  ↓
[run]: How agents persist, Do/Check disband → nx_task_add(meet_issue=N) → execution
  ↓
All done → "close할까요?" → nx_task_close → meet+tasks → history.json
```

gate.ts detects `[d]` and routes to `nx_meet_decide` if meet.json exists; blocks otherwise.

## Deactivation

When user switches to `[run]`, execute meet→run transition (Step 6). How agents persist; Do/Check agents are dismissed. The full cycle is archived via `nx_task_close` (meet+tasks → history.json) when all tasks complete.
