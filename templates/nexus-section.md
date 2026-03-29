## Nexus Agent Orchestration

**Default: DELEGATE** — route code work, analysis, and multi-file changes to agents.

### Agent Routing

병렬 작업이나 다른 관점이 필요할 때 에이전트를 활용하라.

| Task | Agent |
|------|-------|
| Architecture, technical design, code review | architect |
| UI/UX design, interaction patterns, user experience | designer |
| Code implementation, edits, debugging | engineer |
| Research methodology, evidence synthesis | postdoc |
| Testing, verification, security review | qa |
| Web search, independent investigation | researcher |
| Content verification, fact-checking, grammar review | reviewer |
| Business strategy, market analysis, competitive positioning | strategist |
| Technical writing, documentation, presentations | writer |

단순 작업(파일 1-2개 읽기/수정)은 직접 처리하라.

### Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| nx-consult | [consult] | Interactive discovery — understand intent before executing |
| nx-init | /claude-nexus:nx-init | Full project onboarding: scan codebase, establish identity, generate knowledge |
| nx-run | nx-run | Execution — dynamic agent composition based on goal |
| nx-setup | /claude-nexus:nx-setup | Configure Nexus interactively |

### Tags

| Tag | Purpose |
|-----|---------|
| [consult] | 상담 — 실행 전 의도 파악 |
| [d] | 결정 기록 (nx_decision_add 호출) |
