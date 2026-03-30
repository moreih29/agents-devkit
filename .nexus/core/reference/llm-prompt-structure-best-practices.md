<!-- tags: prompt-engineering, XML, markdown, LLM, agent-prompts, instruction-following, context-formatting -->
# LLM 프롬프트 구조화 모범 사례 — 조사 결과

**조사일**: 2026-03-29
**조사자**: Researcher
**용도**: Nexus 에이전트 프롬프트 설계 개선

---

## 1. XML 태그 vs 다른 구조화 포맷

### 핵심 발견: 모델별 차이가 크다

arxiv:2411.10541 ("Does Prompt Formatting Have Any Impact on LLM Performance?", 2024) 연구:
- GPT-3.5-turbo는 코드 번역 작업에서 포맷에 따라 최대 40% 성능 차이 발생
- GPT-3.5-turbo는 JSON 선호, GPT-4는 Markdown 선호
- 대형 모델(GPT-4)은 포맷 변화에 더 강건(robust)함
- **어떤 단일 포맷도 모든 태스크/모델에서 우월하지 않다**

[Source: arxiv.org/abs/2411.10541]

### XML 태그의 장점

- "XML tags are the best way to structure prompts and separate sections for an LLM. It is the only format that all models from Anthropic, Google and OpenAI encourage."
- 토크나이제이션 문제 회피: 공백/들여쓰기 기반 구분은 토크나이저에서 신뢰할 수 없음
- XML 태그는 멀티라인 경계를 명확히 표시
- 복잡한 태스크에서 섹션 간 혼동 방지
- Claude에서 특히 효과적 — Anthropic이 명시적으로 권장

[Sources: cloud-authority.com/xml-is-making-a-comeback, platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags]

### Markdown의 장점

- 토큰 효율성 높음 (XML 태그 오버헤드 없음)
- 가독성 우수 (사람이 읽기 쉬움)
- GPT-4.1 공식 가이드에서 Markdown을 기본 구조화 포맷으로 권장
- "Use markdown titles for major sections and subsections (H4+ depth), inline backticks for code, numbered/bulleted lists"

[Source: cookbook.openai.com/examples/gpt4-1_prompting_guide]

### 혼합 포맷 (Markdown + XML) — 실무 권장

- Anthropic 공식 문서: XML 태그를 multishot 프롬프팅(`<examples>`)이나 chain-of-thought(`<thinking>`, `<answer>`)와 결합하면 "super-structured, high-performance prompts" 구성 가능
- 실무에서 가장 많이 사용되는 패턴: Markdown으로 섹션 구분 + XML로 데이터/예시 경계 표시

[Source: platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags]

### 중첩 데이터 포맷 비교 (1,000 쿼리 GPT-5-nano 기준)

- YAML: 62.1% 정확도 (최고)
- XML: 44.4%
- TOON: 43.1%
- JSON: 중간 수준

주의: 이 수치는 "중첩 데이터 전달" 태스크 한정이며, 프롬프트 구조화 전반에는 적용되지 않음

[Source: improvingagents.com/blog/best-nested-data-format/]

---

## 2. 섹션 이름 (태그/헤딩 이름)

### Anthropic 공식 입장

"There are no canonical 'best' XML tags, although tag names should make sense with the information they surround, and you should use the same tag names throughout your prompts."

즉, 특정 이름이 더 효과적이라는 공식 벤치마크는 없다. 일관성과 의미론적 명확성이 핵심.

[Source: platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags]

### 실무에서 자주 쓰이는 섹션 이름

| 섹션 유형 | 일반적 이름 | Claude/Anthropic 권장 이름 |
|-----------|------------|--------------------------|
| 역할/정체성 | role, persona, identity | (시스템 프롬프트 자체로 처리) |
| 지시사항 | instructions, rules, guidelines | `<instructions>` |
| 맥락/배경 | context, background, information | `<context>` |
| 입력 데이터 | input, data, content | `<input>` |
| 예시 | examples, samples | `<examples>`, `<example>` |
| 출력 형식 | output_format, format, response | `<formatting>` |
| 사고 과정 | reasoning, thinking | `<thinking>` |

[Sources: platform.claude.com/docs/, prompthub.us/blog/prompt-engineering-for-ai-agents]

### guidelines vs rules vs instructions 뉘앙스

직접적인 벤치마크 비교 데이터는 발견되지 않았다. 실무 커뮤니티의 관찰:
- "instructions"와 "rules" — 금지/허용 명령에 더 강한 어조
- "guidelines" — 더 유연한 지시로 해석될 가능성
- 일관성이 특정 이름보다 중요함

[Inference: 복수 실무 소스 종합; 직접 벤치마크 없음]

---

## 3. 섹션 순서의 중요성

### Lost in the Middle 연구 (Liu et al., 2023 — Stanford/ACL 2024)

- 다중 문서 QA와 key-value 검색 태스크에서 실험
- **핵심 발견**: 관련 정보가 컨텍스트 처음이나 끝에 있을 때 성능이 가장 높음
- 중간에 있을 때 성능이 30% 이상 하락
- 원인: Rotary Position Embedding(RoPE)의 long-term decay effect — 처음과 끝 토큰에 attention 편향

[Source: arxiv.org/abs/2307.03172, aclanthology.org/2024.tacl-1.9/]

### 실무 권장 순서

**Anthropic (Claude) 권장:**
1. Task context / Role (역할 및 태스크 정의)
2. Tone context (어조 설정)
3. Background data / Documents (배경 데이터 — 긴 문서는 쿼리보다 위에)
4. Instructions
5. Examples
6. Input (처리할 실제 데이터)

대규모 문서(20k+ 토큰)는 프롬프트 상단에 배치 권장.

[Source: platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices]

**OpenAI GPT-4.1 권장 구조:**
1. Role and Objective
2. Instructions (세부 하위 카테고리 포함)
3. Reasoning Steps
4. Output Format
5. Examples
6. Context
7. Final Instructions ("think step by step" 등)

[Source: cookbook.openai.com/examples/gpt4-1_prompting_guide]

**에이전트 시스템 실무 권장:**
- "Start with identity + safety in the first 3 lines"
- "Put role context first — it sets the interpretation frame for everything that follows"
- "Claude processes system prompt content with positional weighting — content near the top has stronger influence on base behavior"
- 가장 중요한 제약 조건은 끝에도 반복 배치

[Source: unpromptedmind.com/system-prompts-claude-agents-best-practices/]

### 중요 지시사항 배치 전략

- 처음과 끝 양쪽에 가장 중요한 지시 배치 (primacy + recency 효과 활용)
- "Repeating the most important 1-2 instructions twice in the prompt can help reinforce them"
- 마지막 지시가 직전 컨텍스트로 작동하여 높은 우선순위 가짐

[Source: docs.treasuredata.com/products/customer-data-platform/ai-agent-foundry/ai-agent/system-prompt-best-practices]

---

## 4. 프롬프트 구조화 베스트 프랙티스 (2025-2026)

### Anthropic 공식 권장사항 요약

1. XML 태그로 섹션 명확히 분리 (`<instructions>`, `<context>`, `<input>`)
2. 태그 이름은 일관되게 유지
3. 중첩 태그 사용 가능 (계층적 콘텐츠)
4. XML 태그 + multishot prompting + chain of thought 결합 권장
5. 중요 지시는 처음에, 긴 문서는 쿼리 위에 배치

[Source: platform.claude.com/docs/en/build-with-claude/prompt-engineering/]

### OpenAI 공식 권장사항 요약

1. Markdown을 기본 구조화 포맷으로 사용 (H1-H4 계층)
2. XML도 효과적 ("improved adherence to information in XML format")
3. "Put critical rules first, specify the full execution order when tool use or side effects matter"
4. 구조적 스캐폴딩: 번호 매기기, 결정 규칙, "do the action" vs "report the action" 분리

[Source: cookbook.openai.com/examples/gpt4-1_prompting_guide, platform.openai.com/docs/guides/prompt-engineering]

### 에이전트 프롬프트 토큰 예산

- 시스템 프롬프트 텍스트: 1,500–6,000 토큰 권장
- 툴 정의가 5,000–15,000 토큰 추가
- 6K 초과 시 on-demand 로딩으로 지식 분리 권장

[Source: unpromptedmind.com/system-prompts-claude-agents-best-practices/]

---

## 5. 에이전트 프롬프트 특화 패턴

### 멀티에이전트 시스템 구조

오케스트레이터 프롬프트 권장 포함 요소:
- 각 전문 에이전트를 언제 호출할지 명확한 설명
- 일관된 응답 패턴 (모든 전문 에이전트가 동일 포맷으로 반환)
- Agents-as-Tools 패턴: 전문 에이전트를 호출 가능한 함수로 래핑

[Source: dev.to/aws/build-multi-agent-systems-using-the-agents-as-tools-pattern-jce]

### Tool Use 지시 포맷

- 모든 파라미터에 설명(description) 추가 — LLM이 정확한 tool call 구성 가능
- "Clear, action-oriented tool definitions help the model invoke them correctly and recover gracefully from errors"
- Tool 사용 로직을 독립 섹션으로 분리 (예: `## Tool Usage` or `<tool_instructions>`)

[Source: docs.treasuredata.com/, medium.com/google-cloud/boldly-prompting]

### 제약 조건 전달 포맷

- NEVER/MUST 등 강한 어조 사용
- 중요 제약은 프롬프트 앞 3줄 + 끝에 반복
- "Highlight critical steps by adding emphasis markers"
- 간단한 불릿 리스트보다 몇 가지 구체적 예시가 더 효과적

[Source: unpromptedmind.com/system-prompts-claude-agents-best-practices/, docs.treasuredata.com/]

### Few-Shot 예시 구조

- `<examples>` 태그로 감싸서 지시와 명확히 분리
- 각 예시는 `<example>` 태그로 분리
- 예시는: 관련성(실제 유스케이스 반영) + 다양성(엣지 케이스 포함) 충족
- Claude: 예시 마지막에 `### New Input` 등으로 실제 태스크 전환 신호 제공
- GPT: `### Role`, `### Examples`, `### Task` 등 Markdown 섹션으로 명확 구분

[Sources: promptingguide.ai/techniques/fewshot, comet.com/site/blog/few-shot-prompting/]

---

## 핵심 결론

### 현재 XML 태그 접근 평가

**긍정적 측면:**
- Anthropic이 Claude에 대해 명시적으로 권장하는 방식
- 섹션 경계가 토크나이저 독립적으로 명확함
- 복잡한 다중 섹션 프롬프트에서 혼동 방지
- Nexus처럼 구조화된 에이전트 시스템에 적합

**개선 가능 영역:**
- 섹션 순서: 역할/정체성을 최상단, 중요 제약은 최하단에도 반복
- 토큰 예산: 6K 초과 시 온디맨드 분리 고려
- 가장 중요한 1-2개 지시를 프롬프트 앞뒤 양쪽에 배치

### 권장사항 (Nexus 적용)

1. XML 태그 유지 (Claude 최적화된 방식)
2. 구조 순서: `<role>` → `<context>` → `<guidelines>` → `<tools>` → `<examples>` → 핵심 제약 반복
3. 중요 NEVER/MUST 제약은 프롬프트 첫 3줄과 마지막에 양쪽 배치
4. 툴 파라미터에 모두 description 추가
5. Few-shot 예시는 `<examples><example>...</example></examples>` 패턴

---

## 검색어 기록

1. "XML tags vs markdown headings LLM prompt structure effectiveness 2025"
2. "Anthropic Claude prompt engineering guide XML tags sections structure 2025"
3. "lost in the middle problem LLM context position importance research"
4. "prompt engineering section names guidelines vs rules vs instructions LLM instruction following effectiveness"
5. "OpenAI prompt engineering best practices structure sections order 2025"
6. "multi-agent system prompt structure tool use instructions format best practices 2025"
7. "arxiv prompt formatting XML markdown JSON YAML comparison benchmark results 2024"
8. "Claude agent prompt structure role persona identity guidelines best practices agentic"
9. "GPT-4.1 prompting guide markdown structure system prompt organization OpenAI cookbook"
10. "prompt section order instruction following beginning end middle placement LLM attention"
11. "reverse-engineering Claude Code system prompt structure analysis agent markdown XML"

## Null Results

- "guidelines" vs "rules" vs "instructions" 섹션 이름의 직접 성능 비교 벤치마크: 발견되지 않음
- "role" vs "persona" vs "identity" 태그 이름 효과 비교: 발견되지 않음
- 섹션 순서 자체(XML 내 순서)에 대한 통제된 실험: 발견되지 않음 (Lost in the Middle은 문서 검색 태스크 한정)

## 주요 소스

- arxiv.org/abs/2411.10541 — Does Prompt Formatting Have Any Impact on LLM Performance? (2024)
- arxiv.org/abs/2307.03172 — Lost in the Middle: How Language Models Use Long Contexts (Liu et al., 2023)
- platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags
- platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- cookbook.openai.com/examples/gpt4-1_prompting_guide
- platform.openai.com/docs/guides/prompt-engineering
- unpromptedmind.com/system-prompts-claude-agents-best-practices/
- improvingagents.com/blog/best-nested-data-format/
