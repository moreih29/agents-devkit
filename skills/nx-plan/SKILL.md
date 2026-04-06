---
name: nx-plan
description: Structured multi-perspective analysis to decompose issues, align on decisions, and produce an enriched plan before execution. Plan only — does not execute.
trigger_display: "[plan]"
purpose: "Structured planning — subagent-based analysis, deliberate decisions, produce execution plan"
triggers: ["plan", "계획", "설계", "분석하자", "어떻게 하면 좋을까", "뭐가 좋을까", "방법을 찾아줘", "접근법", "어떻게 접근"]
---

<role>
Facilitate structured multi-perspective analysis using subagents to decompose issues, deliberate on options, and align on decisions. Lead acts as synthesizer AND active participant — orchestrates subagent research/analysis AND contributes its own position. Does not execute — planning only. Transition to execution is the user's decision.
</role>

<constraints>
- NEVER execute — this skill is planning only; transition to execution is the user's decision
- NEVER call `nx_plan_start` before research is complete (research_summary is required)
- NEVER present multiple issues at once — one issue at a time only
- NEVER ask groundless questions — always research code/knowledge/decisions first
- NEVER use TeamCreate or SendMessage — subagent parallelism replaces team-based discussion
- MUST record all decisions with `[d]` tag so they are not scattered across turns
- MUST call `nx_plan_decide` when recording `[d]`
- MUST check for existing plan.json before starting a new session
- `[d]` without an active plan.json is BLOCKED — "[d]는 plan 세션 안에서만 유효합니다."
- MUST present a comparison table before asking for a decision — never present options as prose only. Format:

```
| | A: {title} | B: {title} |
|---|---|---|
| 장점 | ... | ... |
| 단점 | ... | ... |
| 추천 | | **(Recommended)** |
```

</constraints>

<guidelines>
## Trigger

- Explicit tag: `[plan]` — continue existing session if plan.json exists, otherwise start new
- Natural: "계획", "설계", "분석하자", "plan", "어떻게 접근", "what would be a good approach", "find me a method"
- Additional analysis needed mid-session: spawn HOW subagents independently via Agent tool
- Continuing conversation without a tag → continue existing session

---

## Auto Mode (`[plan:auto]`)

When triggered with `[plan:auto]`, run the full planning process **without user interaction**:

1. **Research** — spawn researcher+Explore subagents (same as interactive)
2. **Issue derivation** — Lead identifies issues from research
3. **Auto-decide** — for each issue, Lead selects the recommended option without presenting choices to the user. Log each decision via `nx_plan_decide`.
4. **Plan document** — generate tasks.json with all decisions, approaches, acceptance criteria, and risks

Key differences from interactive mode:
- No `AskUserQuestion` or comparison tables — Lead decides autonomously
- No dynamic agenda proposals — Lead handles all derived issues internally
- Output: tasks.json ready for `[run]` execution

This mode is invoked internally by `[run]` when no tasks.json exists, or explicitly by the user with `[plan:auto]`.

---

## Procedure (Interactive Mode)

### Step 1: Intent Discovery

Determine planning depth and identify which HOW subagents to delegate analysis to, based on Progressive Depth.

| Level | Signal | Exploration Scope | HOW Subagents |
|-------|--------|-------------------|---------------|
| **Specific** | File path, function name, error message, or concrete target named | Focused on the relevant file/module | 1–2 HOW agents |
| **Direction-setting** | Open-ended question, "it would be nice if ~", choice needed among approaches | Related area + external case research | 2–3 HOW agents |
| **Abstract** | "I don't know how to approach this", goal itself unclear, fundamental direction | Full codebase + external research + comparable project comparison | 3+ HOW agents, Lead interviews first |

- Specific request → confirm intent with 1–2 questions, derive issues immediately
- Direction-setting → use hypothesis-based questions to understand intent
- Abstract/fundamental → actively interview to uncover root goals the user hasn't clarified

**HOW subagent selection rule:**
- User explicitly names agents → use as-is, propose additions if gaps detected
- User does not name agents → Lead proposes based on issue scope, confirm with user
- Additional HOW subagents can be spawned at any time during analysis (Lead's or user's discretion)

### Step 2: Research

Understand code, core knowledge, and prior decisions before forming a planning agenda.

**Approach selection:**

| Scenario | Approach |
|----------|----------|
| Surface-level orientation | Spawn subagent researcher in parallel (background) |
| Deep investigation needed | Spawn researcher subagent with Explore scope |
| Both depth and breadth needed | Spawn multiple researcher subagents in parallel |

- NEVER call `nx_plan_start` before research is complete.
- `research_summary` parameter in `nx_plan_start` is required — forces research completion before session creation.
- Researcher subagents are spawned via the Agent tool and return findings to Lead. They do not join the plan session.

**Existing session (plan.json present):**
- Check current state with `nx_plan_status`.
- If new topic or additional research needed → spawn researcher subagent accordingly.
- Do not proceed to next issue before research is complete.

### Step 3: Session Setup

Register the planning session.

1. **`nx_plan_start(topic, issues, research_summary)`** — register plan in plan.json; auto-archives any existing plan.json.
2. Show the issue list to the user and confirm before proceeding.

### Step 4: Analysis

**Always proceed one issue at a time.** Never present multiple issues simultaneously.

For each issue:

1. **Current State Analysis** — Lead summarizes the current state and problems, drawing on research.
2. **Subagent Analysis** — for complex issues, spawn HOW subagents (architect, strategist, etc.) in parallel via Agent tool. Each subagent independently analyzes the issue and returns findings.
   - **Simple issues** (clear answer, no trade-offs): Lead synthesizes directly from research without spawning HOW subagents.
   - **Complex issues** (3+ viable options OR technical trade-offs exist): spawn 1–3 HOW subagents, collect their independent analyses, then synthesize.
   - HOW subagents do NOT communicate with each other — each reports independently to Lead.
   - When in doubt, spawn — the cost of an unnecessary subagent (~$0.05) is lower than the cost of a shallow analysis.
3. **Present Options** — after synthesis, Lead presents a comparison:

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

4. **Await user response** — receive free-form responses. Users may combine options, push back, or ask follow-up questions.

### Step 5: Record Decision

When the user decides, record with the `[d]` tag.

- gate.ts detects `[d]` and routes to `nx_plan_decide`.
- `nx_plan_decide(issue_id, summary)` — marks issue as `decided`, writes `decision` inline in plan.json.
- Decisions are NOT written to decisions.json — plan.json is the single source of truth.
- `[d]` without plan.json is blocked.

**Immediately after each decision**, Lead checks: "Does this decision create follow-up questions or new issues?" If yes, propose adding via `nx_plan_update(action='add')` before moving to the next issue.

### Step 6: Dynamic Agenda + Wrap-up

After each decision, Lead automatically checks for derived issues.

- **Dynamic agenda proposal**: after a decision is recorded, Lead examines whether the decision implies follow-on questions or unresolved sub-issues. If found, propose adding them with `nx_plan_update(action='add', ...)` and confirm with the user before adding.
- Pending issues remain → naturally transition to the next issue.
- All issues decided → **Gap check**: compare original question/topic against the issue list.
  - Gap found → register additional issues with `nx_plan_update(action='add', ...)`, return to Step 4.
  - No gap → signal planning complete.
- Wrap-up: confirm all analysis threads have reported conclusions to Lead.
- Offer transition: "모든 안건이 결정되었습니다. 실행하시겠습니까? `[run]`으로 전환하거나, 계획서를 먼저 생성할 수 있습니다."

### Step 7: Plan Document Generation

After all issues are decided, generate the plan document (tasks.json):

1. **Collect decisions** — gather all `decided` issues from plan.json
2. **Derive tasks** — decompose decisions into concrete, actionable tasks
3. **Enrich each task** with:
   - `approach` — implementation strategy derived from the decision rationale
   - `acceptance` — definition of done, verifiable criteria
   - `risk` — known risks or caveats from the analysis
   - `deps` — task dependencies based on execution order
   - `owner` — assign based on delegation analysis:

   | 작업 성격 | owner | 기준 |
   |----------|-------|------|
   | 단일 파일, 작은 변경 | **lead** | 서브에이전트 오버헤드 > 작업량 |
   | 코드 구현/수정 | **engineer** | 파일 생성, 대규모 수정 |
   | 웹 리서치/외부 조사 | **researcher** | 외부 정보 수집 필요 |
   | 문서/산출물 작성 | **writer** | 비코드 콘텐츠 생산 |
   | 설계 분석/검토 | **architect** 등 HOW | 기술적 트레이드오프 판단 |
   | 코드 검증/테스트 | **tester** | acceptance 기준 검증 |
   | 콘텐츠 검증 | **reviewer** | writer 산출물 검증 |
   | 같은 파일 순차 수정 | **lead** | 서브에이전트 병렬 시 충돌 위험 |
4. **Write tasks.json** via `nx_task_add`:
   - Set `goal` from the plan topic
   - Set `decisions` from plan.json decided summaries
   - Call `nx_task_add(plan_issue=N, approach, acceptance, risk, owner)` for each task
5. **Present plan document** — show the user the generated tasks.json summary for review

**Incremental mode**: if tasks.json already exists (e.g., after adding follow-up issues), only add tasks for new decisions. Check `plan_issue` field to avoid duplicating tasks for already-covered issues.

---

## plan → run Transition

When the user activates `[run]` after a plan session:

1. Tasks are created with `nx_task_add(plan_issue=N)` — linking each task to its originating plan issue.
2. Each task is enriched with `approach`, `acceptance`, and `risk` fields derived from decisions.
3. The `decisions` array in tasks.json is populated from plan.json decisions.
4. Execution proceeds under [run] pipeline rules.
5. Close: all tasks done → "close할까요?" → `nx_task_close` archives plan+tasks → history.json.

---

## Principles

1. **Active intent discovery** — actively uncover what the user hasn't clarified. Use interviewing to surface the root goal behind the words.
2. **Lead as synthesizer AND participant** — Lead does not merely relay subagent findings. Lead forms its own position, makes recommendations, and pushes back with evidence. Not a yes-man.
3. **Exploration first + proactive expansion** — research code/knowledge/external sources before planning starts. Never ask groundless questions.
4. **Hypothesis-based questions** — instead of empty questions, form hypotheses grounded in research and confirm with the user.
5. **Progressive Depth** — automatically adjust planning depth and HOW subagent composition based on request complexity.
6. **One at a time** — never present multiple issues at once. Reduce the user's cognitive load.
7. **Options must include pros/cons/trade-offs/recommendation** — when recommending, explain why other options fall short.
8. **Objective pushback** — even for the user's own suggestions, actively counter with evidence if there are problems or better alternatives.
9. **Prose conversation by default** — free-form user responses (combinations, pushback, follow-up questions) are the core of planning quality.
10. **Dynamic agenda** — decisions create new questions. Lead proactively surfaces derived issues rather than waiting for the user to notice gaps.
11. **Subagents are independent analysts** — HOW subagents each analyze independently and report to Lead. Lead synthesizes; subagents do not debate each other.

---

## State Management

### plan.json

`.nexus/state/plan.json` — managed via MCP tools.

```json
{
  "id": 1,
  "topic": "topic name",
  "issues": [
    {
      "id": 1,
      "title": "issue title",
      "status": "pending"
    },
    {
      "id": 2,
      "title": "issue title",
      "status": "decided",
      "decision": "결정 요약"
    }
  ],
  "research_summary": "...",
  "created_at": "2026-01-01T00:00:00Z"
}
```

- **Create**: `nx_plan_start(topic, issues, research_summary)` — called in Step 3; auto-archives any existing plan.json
- **Read**: `nx_plan_status()` — check current issue state + decisions
- **Update**: `nx_plan_update(action, ...)` — add/remove/edit/reopen issues
- **Decide**: `nx_plan_decide(issue_id, summary)` — marks issue as `decided`, writes decision inline
- **File presence = session in progress**

### Topic Switching

- `[plan]` → continue existing plan.json if present; start new session if not
- Continue conversation without tag → continue existing session
- New `nx_plan_start` call → auto-archives current plan.json before creating new one

---

## Self-Reinforcing Loop

```
[plan] start → check/continue existing plan.json (start new if none)
  ↓
Intent discovery → research (parallel subagents) → nx_plan_start (register issues)
  ↓
Per-issue: HOW subagent analysis (parallel, independent) → Lead synthesis
  → options comparison → [d] → nx_plan_decide
  → dynamic agenda check → propose derived issues if found
  ↓
Next issue → ... → gap check → planning complete
  ↓
"[run]으로 전환하시겠습니까?"
  ↓
[run]: nx_task_add(plan_issue=N, approach, acceptance, risk) → execution
  ↓
All done → "close할까요?" → nx_task_close → plan+tasks → history.json
```

gate.ts detects `[d]` and routes to `nx_plan_decide` if plan.json exists; blocks otherwise.

## Deactivation

When user switches to `[run]`, execute plan→run transition (Step 6). Tasks are enriched with approach/acceptance/risk from plan decisions. The full cycle is archived via `nx_task_close` (plan+tasks → history.json) when all tasks complete.
