## Nexus Agent Orchestration

**Default: DELEGATE** — route code work, analysis, and multi-file changes to agents.

Lead는 사용자와 직접 대화하는 메인 에이전트. tasks.json에서 `owner: "lead"`는 Lead가 직접 처리.

Before starting work, check `.nexus/memory/` and `.nexus/context/` for project-specific knowledge.

### .nexus/ Structure

- `memory/` — lessons learned, references (`[m]`)
- `context/` — design principles, architecture philosophy (`[sync]`)
- `rules/` — project custom rules (`[rule]`)
- `state/` — plan.json, tasks.json (runtime)

### Agent Routing

병렬 작업이나 다른 관점이 필요할 때 에이전트를 활용하라.

| 이름 | Category | Task | Agent |
|------|----------|------|-------|
| 아키텍트 | HOW | Architecture, technical design, code review | architect |
| 디자이너 | HOW | UI/UX design, interaction patterns, user experience | designer |
| 포닥 | HOW | Research methodology, evidence synthesis | postdoc |
| 전략가 | HOW | Business strategy, market analysis, competitive positioning | strategist |
| 엔지니어 | DO | Code implementation, edits, debugging | engineer |
| 리서처 | DO | Web search, independent investigation | researcher |
| 라이터 | DO | Technical writing, documentation, presentations | writer |
| 리뷰어 | CHECK | Content verification, fact-checking, grammar review | reviewer |
| 테스터 | CHECK | Testing, verification, security review | tester |

단순 작업(파일 1-2개 읽기/수정)은 직접 처리하라.

### Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| nx-init | /claude-nexus:nx-init | Full project onboarding: scan codebase, establish project mission and essentials, generate context knowledge |
| nx-plan | [plan] | Structured planning — subagent-based analysis, deliberate decisions, produce execution plan |
| nx-run | [run] | Execution — user-directed agent composition |
| nx-setup | /claude-nexus:nx-setup | Configure Nexus interactively |
| nx-sync | [sync] | Synchronize .nexus/context/ design documents with current project state |

### Tags

| Tag | Purpose |
|-----|---------|
| [plan] | Activates nx-plan skill for structured multi-perspective analysis and decision recording |
| [run] | Activates nx-run skill for task execution with subagent composition |
| [sync] | Activates nx-sync skill for .nexus/context/ knowledge synchronization |
| [d] | Records a decision during an active plan session |
| [m] | Stores a lesson or reference to .nexus/memory/ |
| [m:gc] | Garbage-collects .nexus/memory/ by merging or removing stale entries |
| [rule] | Stores a project rule to .nexus/rules/. [rule:*] supports tag parameter. |
