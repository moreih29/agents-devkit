<!-- tags: orchestration, identity, harness, prompt-engineering -->
## 2026-03-30 — Identity Redesign: Autonomous → User-Directed

### Autonomous Orchestration Limits
- LLMs are single-turn optimizers — delegation is counter to trained behavior
- Lead repeatedly bypassed orchestration rules to fix things directly
- OMC (29+ agents), OMO (Sisyphus+Atlas), and Nexus all experienced the same "orchestrator does it itself" pattern
- Microsoft Magentic-UI data: HITL improves task completion from 30.3% to 51.9% (+71%)
- Gartner: 40%+ agent AI projects will be cancelled by 2027 due to autonomy limitations
- MAST research (ACL 2025): "Organizational design determines MAS success more than individual model capability"

### Decision: User Orchestration Infrastructure
- Default changed from autonomous orchestration to user-directed
- [run] tag = opt-in full pipeline (Lead gets autonomy within [run])
- Without [run] = user directs, Lead executes
- Tags became core interface: [consult], [d], [run], [rule]

### edit-tracker/reopen-tracker Removed
- Circuit breakers were easily bypassed — Lead simply reset the tracker files
- "Speed bump" with no real stopping power — tokens wasted on error→report→reset cycle
- Prompt-level Loop Prevention in agent prompts is the actual first line of defense
- Structural harness should focus on what it CAN enforce (task pipeline, Stop nonstop)

### Context Engineering Standards Established
- English for all LLM-facing content (4-5x token savings, better instruction following)
- Section order: Role → Constraints → Context → Guidelines → Examples
- Format: Markdown body + XML section tags (Anthropic recommended hybrid)
- Gate messages: <nexus> XML wrapper (matches Claude Code's own <system-reminder> pattern)
- Lost in the Middle: constraints in primacy position (right after role)

### Prompt-Level Control Ceiling
- SKILL.md instructions compete with direct user requests — user request wins
- No amount of prompt rules can force LLM behavior reliably
- What works: structural enforcement (gate blocking Edit without tasks.json)
- What doesn't: advisory text ("spawn Architect before fixing bugs")
