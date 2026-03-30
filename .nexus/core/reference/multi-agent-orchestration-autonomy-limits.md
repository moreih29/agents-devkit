<!-- tags: multi-agent, orchestration, autonomy, LLM, research, nexus-design, human-in-the-loop, CrewAI, LangGraph, AutoGen -->
# Multi-Agent Orchestration: Autonomy Limits and Success Patterns

**Research date**: 2026-03-29
**Purpose**: Evidence gathering to inform Nexus (Claude Code agent orchestration plugin) design decisions

---

## 1. Autonomous Orchestration in Existing Frameworks: User Experience

### Key Frameworks Status (2024–2025)

**AutoGen / AG2 (Microsoft)**
- Debugging is difficult in production. Infinite loops occur when termination conditions for autonomous loops are not clearly specified.
- Specification/Role violation is the most frequent failure pattern.
- [Source: DataCamp comparison, https://www.datacamp.com/tutorial/crewai-vs-langgraph-vs-autogen]

**CrewAI**
- Logging is painful ("logging is a huge pain"). print/log functions do not work properly inside tasks.
- Fine-grained control is difficult in complex systems. Real developer reports indicate agent pipelines work only 60% of the time in autonomous mode; the remaining 40% results in hallucination, infinite loops, or silent failures.
- [Source: Aaron Yu Medium comparison, https://aaronyuqi.medium.com/first-hand-comparison-of-langgraph-crewai-and-autogen-30026e60b563]
- [Source: DEV Community reliability article, https://dev.to/custodiaadmin/why-crewai-autogen-and-langgraph-agents-need-screenshots-context-drift-prevention-5em0]

**LangGraph**
- Steep learning curve and high operational overhead.
- Strong for complex cyclic workflows, but implementing HITL patterns requires separate design investment.
- [Source: Latenode comparison, https://latenode.com/blog/platform-comparisons-alternatives/automation-platform-comparisons/langgraph-vs-autogen-vs-crewai-complete-ai-agent-framework-comparison-architecture-analysis-2025]

**Common pattern**:
> "Going from prototype to production is not easy. Watch out for loops, tool misuse, and cost explosions." — common warning across multiple comparison documents
> "Open-source agent frameworks excel at prototyping but are dangerously incomplete in terms of reliability, governance, and production deployment. This is where 90% of open-source projects fail to generate ROI." — DEV Community 2026

---

## 2. Academic Research: Why Do Multi-Agent LLM Systems Fail?

### MAST Paper (arXiv 2503.13657, March 2025)

**Paper**: "Why Do Multi-Agent LLM Systems Fail?" (Cemri, Pan, Yang et al.)
**Methodology**: 1600+ traces collected from 7 frameworks including AutoGen and ChatDev; 150 traces analyzed with expert annotators; inter-annotator agreement (kappa) 0.88.

**14 Failure Modes (3 categories)**:

| Category | Mode count | Key failure types |
|----------|-----------|------------------|
| FC1: Specification & System Design Failures | 5 | Role violations, step repetitions, lost conversation history, unrecognized termination conditions |
| FC2: Inter-Agent Alignment Failures | 6 | Conversation resets, failed clarification requests, task derailment, information monopolization, ignoring other agents, reasoning-action inconsistency |
| FC3: Task Verification & Termination Failures | 3 | Premature termination, incomplete verification, inaccurate verification |

**Key findings**:
- No single category dominates — failure distribution is broad.
- AG2 shows many FC1 (specification failures); ChatDev shows many FC2 (inter-agent alignment) failures.
- **Weak or insufficient verification is the most significant contributing factor to failure**.
- Tactical fixes (e.g., prompt improvements) have limited effect — only +14% improvement in ChatDev.
- **"Many MAS failures stem not from the limitations of individual agents but from the difficulty of agent-to-agent interaction."**

**Conclusion**: Organizational design determines multi-agent system success more strongly than individual model capability.
[Source: arXiv 2503.13657, https://arxiv.org/abs/2503.13657]

---

## 3. Benchmarks: Real-World Performance of Autonomous Coding Agents

### SWE-bench Results (2024–2025)

| Benchmark | Top performance | Notes |
|-----------|----------------|-------|
| SWE-bench Verified | 74.4% (Refact.ai + Claude 3.7 Sonnet) | Controlled single-issue resolution |
| SWE-bench Lite | 19% (AutoCodeRover, early 2024) | Early agent performance |
| SWE-Bench Pro (long-horizon tasks) | 23% (Opus 4.1, GPT-5) | Complex real-world tasks |

**Key gap**: SWE-bench Verified 70%+ → SWE-Bench Pro 23%. A 50+ percentage point gap between controlled environments and real complex tasks.
**Interpretation**: Benchmark results underestimate the complexity of real production environments.
[Source: Refact.ai blog, https://refact.ai/blog/2025/1-agent-on-swe-bench-verified-using-claude-4-sonnet/]
[Source: SWE-Bench Pro paper, https://arxiv.org/html/2509.16941]

### Performance Collapse in Async Environments
Synchronous agent success rate 47% vs. async setting 11%. Success rate collapses when tool use, state tracking, and long-horizon recovery are combined.
[Source: agentic AI academic survey, https://arxiv.org/html/2601.12560v1]

---

## 4. ChatDev vs MetaGPT: Lessons from Hardcoded Pipelines

| Item | MetaGPT (SOP-based hardcoded) | ChatDev (dynamic collaboration) |
|------|------------------------------|--------------------------------|
| Executability score | 3.9 | 2.1 |
| Code quality score | 0.1523 | 0.3953 |
| FC1/FC2 failures | 60–68% fewer | More |
| FC3 (verification failures) | 1.56x more | Fewer |

**Implications**: Hardcoding roles and procedures reduces executability and design failures, but falls behind dynamic collaboration in code quality and verification. Both approaches succeed only partially.
[Source: MAST paper analysis, https://arxiv.org/html/2503.13657v1]

---

## 5. Human-in-the-Loop (HITL) Orchestration Success Cases

### Magentic-UI (Microsoft Research, 2025)

**Paper**: arXiv 2507.22358 "Magentic-UI: Towards Human-in-the-loop Agentic Systems"

**Design principle**: "Minimize interruptions to the user, but request intervention only when strictly necessary."

**6 interaction mechanisms**:
1. Co-planning: collaborative step-by-step plan authoring and approval before execution
2. Co-tasking: direct intervention and direction correction during execution
3. Action guards: explicit user approval for sensitive actions
4. Answer verification: result verification after completion
5. Memory: storing and reusing successful task plans
6. Multi-tasking: parallel task supervision

**Quantitative results (GAIA validation set)**:
- Fully autonomous mode: 30.3% task completion
- Simulated user intervention with information: 51.9% completion (+71% improvement)
- Rate at which the system requests help: 10% of all tasks

**Conclusion**: "Current agents have yet to reach human-level performance in most domains. The autonomy-safety gap can be bridged cost-effectively with HITL."
[Source: Magentic-UI paper, https://arxiv.org/html/2507.22358v1]

---

## 6. Claude Code Agent Teams Documentation (Anthropic, 2025–2026)

Anthropic's official documentation states:

**Recommended scale**: 3–5 team members; 5–6 tasks per member is the production-validated optimum.
**Coordination overhead**: above 5 members, parallelization benefits are offset by coordination costs.
**Experimental feature**: disabled by default (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` required).

**Known limitations**:
- Cannot restore in-process team members on session resume
- Task status delays (dependency blocking due to incomplete completion marking)
- No nested teams (team members cannot create sub-teams)
- Only one team can be managed at a time

**Important design guidance**: "Leaving a team unsupervised for too long increases the risk of wasted effort."
[Source: Anthropic Claude Code Docs, https://code.claude.com/docs/en/agent-teams]

---

## 7. Industry Landscape Analysis

### Gartner Prediction (June 2025)

- **Over 40% of agentic AI projects will be canceled by end of 2027** — due to rising costs, unclear business value, and insufficient risk controls.
- Primary cause: "Current models lack the maturity to autonomously achieve complex business goals or follow nuanced instructions over time."
- **"Agent Washing"**: among thousands of agentic AI vendors, only approximately 130 have genuine agentic capabilities.
- [Source: Gartner press release, https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027]

### IBM Expert Assessment

> "You've renamed orchestration, but now it's called agents, because that's the cool word. But orchestration is something that we've been doing in programming forever." — IBM expert

- Agents inherit the limitations of their underlying models, and those limitations are **amplified** when systems are allowed to act.
- The cognitive burden of supervising agents, interpreting their choices, and correcting biases is not eliminated by automation — it is **shifted** to employees.
- [Source: IBM AI agents expectations vs reality, https://www.ibm.com/think/insights/ai-agents-2025-expectations-vs-reality]

---

## 8. "User as Orchestrator" Pattern: Industry Trends

**Microsoft Azure Architecture Guide**: HITL pattern inserts human judgment at critical decision points for safety and reliability.
**Google Cloud Architecture**: HITL formally classified as an official design pattern option for agentic systems.
**LangGraph**: HITL capabilities (pause execution, approve, guide) emphasized as a key differentiator.
[Source: Microsoft Azure Architecture Center, https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns]
[Source: Google Cloud Architecture, https://docs.cloud.google.com/architecture/choose-design-pattern-agentic-ai-system]

**Expert recommendation**: "Do not pursue full autonomy from the start. Ship narrowly scoped, well-orchestrated agents with guardrails and evaluation."
[Source: Skywork AI, https://skywork.ai/blog/agentic-ai-examples-workflow-patterns-2025/]

---

## 9. Future Outlook: Can Model Advances Close the Gap?

**Near-term predictions**:
- As agents advance, single agents will handle more roles, then cycle back to multi-agent — a recurring pattern is predicted.
- "Single-purpose agents → orchestrated specialist agent teams" is the 2025 trend.

**Academic views on fundamental limits**:
- MAST paper: multi-agent failures are attributed to **organizational design**, not model capability.
- Even as models become more powerful, inter-agent interaction, verification, and role consistency issues require separate structural solutions.

**Optimistic indicator**: Gartner predicts that by 2028, 15% of daily work decisions will be made autonomously by agents (currently 0%).

---

## Implications for Nexus Design

1. **"User as orchestrator" is a realistic positioning**: Magentic-UI (+71% performance improvement), Claude Code official recommendations, and Gartner/IBM industry analysis all support this.

2. **The core problem of dynamic autonomous orchestration is unsolved**: FC2 (inter-agent alignment) failures cannot be resolved through prompt improvements — structural redesign is required.

3. **Hardcoded vs. dynamic trade-off**: The MetaGPT approach (SOP) improves executability but reduces flexibility. A hybrid (user-defined pipeline + agent execution) is a realistic balance.

4. **Verification is the weakest point**: Verification failures are the most significant cause of failure in autonomous orchestration. Nexus must design explicit verification stages for each agent output.

5. **3–5 agent scale**: Both Anthropic's own recommendations and practical experience identify this range as optimal. A constrained specialist-role team is more effective than unlimited dynamic composition.

6. **Making user orchestration "efficient" is the core value**: HITL systems that maintain control while minimizing interruptions (Magentic-UI's co-planning, action guards, etc.) improve user satisfaction.

---

## Search Log (including null results)

- Success: "Why Do Multi-Agent LLM Systems Fail" arxiv 2503.13657
- Success: Magentic-UI Microsoft human-in-the-loop agentic system
- Success: SWE-bench multi-agent performance results 2024 2025
- Success: Gartner 40% agentic AI projects canceled 2027
- Success: ChatDev MetaGPT hardcoded pipeline vs dynamic orchestration
- Success: Claude code agent teams documentation (direct page fetch)
- Partial: "judgment gap" autonomous agent — no direct use of the term found in research; conceptual synonyms confirmed in multiple sources
- Partial: Reddit/HN direct user quotes — only secondary summary articles found, no direct citations
