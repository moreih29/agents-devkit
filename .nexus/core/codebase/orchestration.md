<!-- tags: orchestration, gate, tags, agents, skills, plan, rules, pipeline -->
# Orchestration

## Tag System

The `UserPromptSubmit` event in the gate hook detects tags in the user prompt and activates modes. Messages without tags = free mode (Lead's judgment on delegation).

### Explicit Tags

| Tag | Behavior |
|-----|----------|
| `[plan]` | BLOCKING skill invoke → nx-plan. Pre-checks: stale tasks.json (force close), existing plan.json (resume hint). Core index injected. |
| `[d]` | Branches on plan.json presence: calls nx_plan_decide if exists, otherwise instructs to start a plan session first |
| `[run]` | BLOCKING skill invoke → nx-run. Pre-checks: tasks.json absent (hint plan required), exists (task count/status hint). Auto plan:auto when tasks.json absent. |
| `[rule]` | Rule — save rule to .nexus/rules/. Supports [rule:tags] format |

## Agent Configuration

### 9 Agents — HOW / DO / CHECK

| Role | Category | Model | disallowedTools |
|------|----------|-------|-----------------|
| architect | HOW | opus | Edit, Write, NotebookEdit, nx_task_add, nx_task_update |
| postdoc | HOW | opus | Edit, Bash, NotebookEdit, nx_task_add, nx_task_update |
| designer | HOW | opus | Edit, Write, NotebookEdit, nx_task_add, nx_task_update |
| strategist | HOW | opus | Edit, Write, NotebookEdit, nx_task_add, nx_task_update |
| engineer | DO | sonnet | nx_task_add |
| researcher | DO | sonnet | nx_task_add |
| writer | DO | sonnet | nx_task_add |
| tester | CHECK | sonnet | Edit, Write, NotebookEdit, nx_task_add |
| reviewer | CHECK | sonnet | Edit, Write, NotebookEdit, nx_task_add |

### Parallelism

- DO: unlimited parallel (independent execution)
- CHECK: unlimited parallel (independent verification)

### Subagent-Based Architecture

All agents are spawned as **subagents** (not team agents). No TeamCreate/SendMessage.
- Subagents execute independently and return results to Lead
- Multiple subagents can be spawned in parallel
- HOW agents are spawned for independent analysis when needed, not for team discussion

## Agent Roles and Specializations

### HOW Agents

**Architect** — technical design authority
- 리뷰 프로세스 5단계: Analyze current state → Clarify requirements → Evaluate approach → Propose design → Document trade-offs
- ADR (Architecture Decision Record) 형식으로 산출물 작성: Context / Decision / Consequences / Trade-offs / Findings(by severity)
- 안티패턴 체크리스트 7개: God object, Tight coupling, Premature optimization, Leaky abstraction, Shotgun surgery, Implicit global state, Missing error boundaries
- Planning Gate: Lead가 실행 태스크 확정 전 기술적 승인 필요

**Designer** — UX/UI design authority
- Nielsen 10 Usability Heuristics 체크리스트 적용 (리뷰 시 위반 항목 명시)
- 시나리오 분석 프로세스 5단계: Identify users → Derive scenarios → Map current flow → Identify problems → Propose improvements
- 산출물 형식: User perspective → Problem identification → Recommendation → Trade-offs → Risks
- 리뷰 판정: Approved / Approved with concerns / Needs revision

**Postdoc** — research methodology authority
- 방법론 설계, 증거 품질 평가, 합성 문서 작성
- Planning Gate: Lead가 리서치 태스크 확정 전 방법론 승인 필요
- Completion Report: 완료 후 Lead에게 SendMessage (태스크 ID, 산출물, 증거 품질 등급, 주요 한계)
- Escalation Protocol: 답변 불가 질문, 잘못된 질문 발견, 방어 불가능한 합성 상황 시 에스컬레이션

**Strategist** — business/market authority
- 분석 프레임워크 선택 가이드 (상황별):
  - 신규 시장 진입/제품 출시 → SWOT + Porter's 5 Forces
  - 경쟁 차별화 평가 → Porter's 5 Forces (경쟁, 대체재, 신규 진입)
  - 가치 창출/소실 진단 → Value Chain Analysis
  - 기존 제품의 PMF 평가 → Jobs-to-be-Done
  - 불확실성 하에서 전략 우선순위 → 2x2 matrix
- 정량 근거 요구: 시장 규모, 성장률, 경쟁사 역량 등 시장 주장은 데이터/인용 출처 필수
- Completion Report: Subject / Key Findings / Strategic Recommendation / Open Questions

### DO Agents

**Engineer** — code implementation
- Build Gate (완료 보고 전 자체 검증): `bun run build` 통과 + 타입 체크 통과 + 신규 lint 경고 없음
- Build Gate 범위: 컴파일·정적 분석만. 기능 검증(테스트 작성·실행·정확성 판단)은 Tester 전담
- Output Format: Task ID / Modified Files / Implementation Summary / Caveats
- Escalation: 동일 파일/문제 3회 반복 시 즉시 중단 → Lead에 보고

**Researcher** — web research
- Report Gate (보고서 발송 전 자체 검증):
  - 모든 사실 주장에 출처 tier 태그 첨부
  - Null results 명시 (묵시적 생략 금지)
  - 반증 증거 전용 섹션 존재
  - Tertiary 출처만 있는 발견 사항 명시
  - 검색어 목록 포함
  - 추론은 `[Inference: ...]` 레이블
- 출처 품질 3등급:
  - Primary `[P]`: 공식 문서, 동료 검토 논문, RFC, 변경 로그, 1차 데이터셋
  - Secondary `[S]`: 뉴스, 기술 블로그, 저명한 저널리즘, 큐레이션 튜토리얼
  - Tertiary `[T]`: 포럼, 댓글, Reddit, 미검증 위키
- Completion Report: RESEARCH COMPLETE 형식 (조사 질문 수, 각 요약, 아티팩트, 플래그)

**Writer** — technical writing
- Structure Gate (Reviewer 발송 전 자체 검증): 선택 템플릿의 모든 섹션 존재·비어있지 않음 + 형식 일관성 + 모든 사실 주장이 명시된 출처와 연결 + placeholder/TODO 없음
- Structure Gate 범위: 구조·형식·인용 확인만. 사실 정확성(원본 출처와의 대조)은 Reviewer 전담
- Completion Report: File / Audience / Sources / Gaps (SendMessage to Lead)
- 산출물 저장: 항상 `nx_artifact_write` 사용 (Write/Edit 직접 사용 금지)

### CHECK Agents

**Tester** — code verification
- 정량 기준 (프로젝트별 조정 가능):
  - 커버리지(신규 코드): ≥ 80% line coverage
  - 순환 복잡도: < 15 per function
  - 테스트 피라미드: unit 70% / integration 20% / e2e 10%
- 테스트 유형별 가이드: Unit (단일 동작, 고립 실행) / Integration (모듈 간 상호작용) / E2E (완전한 사용자 시나리오, 최소화)
- 회귀 테스트: 버그 수정 시 필수 — 수정 전 실패, 수정 후 통과하는 테스트 작성
- Completion Report: Task ID / Checks / Verdict / Issues found / Recommendations

**Reviewer** — content verification
- 검증 프로세스 4단계 (주요 주장 각각): Extract → Locate → Match → Record
- 승인/반려 기준:
  - **APPROVED**: CRITICAL 0개 + WARNING 0개. 전달 가능.
  - **REVISION_REQUIRED**: CRITICAL 0개 + WARNING 1개 이상. Writer로 반환 후 전달.
  - **BLOCKED**: CRITICAL 1개 이상. 해결 및 재검토 전까지 전달 중단.
- Completion Report: Document / Checks performed / Issues found / Final verdict / Artifact

## Common Agent Sections (All Agents)

모든 에이전트는 다음 3개 공통 섹션을 포함한다:

1. **Output Format** — 완료 보고 시 포함할 필드 (역할별 커스텀)
2. **Completion Report** — 작업 완료 후 Lead에게 SendMessage 전송
3. **Escalation Protocol** — 루프 방지, 기술적 차단, 범위 확장 등 에스컬레이션 조건

도메인 특화 규칙 (프로젝트별 프레임워크, 코딩 스타일, 테스트 전략 등)은 Nexus 관여 없음 — `.claude/rules/`에 위임.

## Pipeline (4 Steps)

Activated only with `[run]` tag. Managed by nx-run skill.

| Step | Name | Owner | Description |
|------|------|-------|-------------|
| 1 | Intake | Lead | Verify tasks.json exists, clarify scope, Branch Guard |
| 2 | Execute | Do subagents | Spawn per task by owner, parallel where safe |
| 3 | Verify | Lead + Check subagents | Build check, acceptance criteria verification |
| 4 | Complete | Lead | nx-sync, nx_task_close, report |

### Rollback Rules

- Step 3 finds code issue → back to Step 2
- Step 3 finds design issue → re-run nx-plan before re-executing

### Phase Enforcement

Pipeline phase ordering is guided by skill prompt. Agent behavior is enforced by frontmatter `disallowedTools`:
- HOW/CHECK agents cannot Edit/Write at any phase
- DO agents can Edit/Write only when tasks.json exists ([run] mode)

## Plan Document (tasks.json)

### Schema

```json
{
  "goal": "string",
  "decisions": ["string — decisions from [plan] session"],
  "tasks": [
    {
      "id": 1,
      "title": "string",
      "context": "string",
      "approach": "string (optional) — how to implement",
      "acceptance": "string (optional) — definition of done",
      "risk": "string (optional) — known risks",
      "status": "pending | in_progress | completed",
      "deps": [2, 3],
      "plan_issue": 1,
      "owner": "engineer",
      "created_at": "ISO string"
    }
  ]
}
```

### Lifecycle

- Created during `[plan]` or auto-generated at `[run]` start
- Edit/Write gating active only when tasks.json exists
- Archived to history.json on nx_task_close

## Harness Mechanisms

### Edit/Write Gating (PreToolUse hook)

- tasks.json exists → Edit/Write allowed only if tasks are pending (not all completed)
- tasks.json absent → Edit/Write freely allowed (no [run] mode)
- Nexus internal paths always exempt (.nexus/state/, .nexus/config.json, .claude/settings.json, CLAUDE.md)

### Stop Hook

- Pending tasks → block stop, remind to complete
- All completed → one-time warning to call nx_task_close
- `stop_hook_active=true` on second fire → allow (platform-provided re-entry flag; replaces the retired stop-warned file)
- Sync nudge: if 3+ cycles since last nx-sync → suggest synchronization

### PostCompact Handler

Fired after context compaction. Rebuilds a session state snapshot and injects it as `additionalContext`:
- Current mode and task counts (pending/completed) from tasks.json
- Active plan session topic and issue status from plan.json
- Core knowledge file count across all 4 layers
- Agent tracker summary (agent type + status)

### buildCoreIndex

Called on `[plan]` and `[run]` mode entry. Scans `.nexus/core/` and builds a compact index of all layer/topic files with their first 3 tags. Injected into `additionalContext` to remind Lead of available knowledge before starting research or execution. Output capped at 2000 characters.

### Stale tasks.json Detection (Plan Mode)

When `[plan]` is detected, gate checks whether tasks.json exists with all tasks already completed. If so, it blocks plan mode entry and instructs Lead to call `nx_task_close` first to archive the previous cycle before starting a new plan.

### SubagentStop Escalation Chain ([run] mode only)

When a subagent stops with incomplete work:
1. Do/Check failed → spawn relevant HOW to diagnose (Engineer→Architect, Writer→Strategist, Researcher→Postdoc, Tester→Architect)
2. Re-delegate with HOW's adjusted approach
3. HOW also failed → Lead reports to user
- Max 1 HOW diagnosis + 1 re-delegation per task

### Tester Auto-Spawn Conditions

Any one triggers Tester verification (Lead discretion):
- tasks.json contains at least 1 task with an `acceptance` field
- 3 or more files changed
- Existing test files modified
- External API/DB access code changed
- Failure history for that area exists in memory

### Cycle Archival

nx_task_close archives plan.json + tasks.json → history.json, then deletes source files.

## Gate Events

gate.ts handles all hook events dispatched via `hook_event_name`:

| Event | Handler | Purpose |
|-------|---------|---------|
| `SessionStart` | handleSessionStart | Initialize agent-tracker.json, ensure .nexus structure |
| `SubagentStart` | handleSubagentStart | Record agent start in agent-tracker.json; inject MATRIX-filtered core+rules index via additionalContext for nexus agents (lazy-read) |
| `SubagentStop` | handleSubagentStop | Record agent stop; warn Lead if owned tasks incomplete |
| `PreToolUse` | handlePreToolUse | Block Edit/Write when tasks completed; guard Agent tool |
| `UserPromptSubmit` | handleUserPromptSubmit | Tag detection, mode routing, additionalContext injection |
| `Stop` | handleStop | Block stop if pending tasks; sync nudge |
| `PreCompact` | — | pass() (no-op) |
| `PostCompact` | handlePostCompact | Inject session state snapshot after compaction |

## State Files

```
.nexus/state/
├── tasks.json            ← plan document (git-ignored)
├── plan.json             ← [plan] session issues/decisions (git-ignored)
└── agent-tracker.json    ← subagent lifecycle tracking (git-ignored)
```
