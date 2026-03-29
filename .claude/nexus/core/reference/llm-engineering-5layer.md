<!-- tags: blog, framework, prompt, context, tools, orchestration, harness -->
<!-- tags: blog, framework, prompt, context, tools, orchestration, harness -->
# LLM 엔지니어링 5-Layer 프레임워크

출처: moreih29.github.io/posts/llm-eng-{1~5}

## 5 Layers

| Layer | 정의 | Nexus 대응 |
|-------|------|-----------|
| L1 Prompt | 단일 프롬프트 최적화 | agents/*.md 정적 프롬프트 + gate.ts additionalContext |
| L2 Context | 적절한 정보를 적절한 시점에 | nx_briefing 매트릭스 + hint 필터 |
| L3 Tools | 도구 설계 + 프로토콜 | MCP 도구 30+ (core, task, decision, consult, LSP, AST) |
| L4 Orchestration | 멀티 에이전트 조율 | Lead+Director 상시 팀 + Dynamic Composition |
| L5 Harness | 구조적 제약으로 품질 보장 | gate.ts (Stop/PreToolUse/UserPromptSubmit) + edit-tracker |

## 핵심 통계/원칙

- **조정 실패가 전체 실패의 36.94%** — 최대 원인. 입출력 계약 구조화가 핵심
- **하네스 개선만으로 +13.7pt 상승** — 구조적 투자의 ROI가 높음
- **워커 2~4개 권장** — "동시 활성" 기준. 총 역할 정의 수와 다름
- **Circuit Breaker + 지수적 백오프 + Human-in-the-Loop** 3계층 권장
- **스킬 점진적 로딩**: 메타데이터 → 전체 지시 → 리소스 (3단계)

## Nexus에의 시사점

1. **L2(Context)가 상대적으로 약함** — null/all 2단계. "정보 양 제어"에 집중, "정보 구조 제어" 부재
2. **L5(Harness)가 파일 수준에 국한** — 에이전트 수준 실패 추적 / Circuit Breaker 없음
3. **L1(Prompt)이 정적** — OMO처럼 Phase별 프롬프트 변형이 없음. additionalContext는 "추가"일 뿐 구조 변경 아님
