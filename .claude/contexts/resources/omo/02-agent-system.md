# OMO Agent System 분석

## 에이전트 아키텍처

10개 빌트인 에이전트. 각각 `createXXXAgent()` 팩토리로 `AgentConfig` 반환.

### 타입 시스템 (`src/agents/types.ts`)
```typescript
export type AgentCategory = "exploration" | "specialist" | "advisor" | "utility"
export type AgentCost = "FREE" | "CHEAP" | "EXPENSIVE"
export interface AgentPromptMetadata {
  category: AgentCategory; cost: AgentCost
  triggers: DelegationTrigger[]; useWhen?: string[]; avoidWhen?: string[]
  keyTrigger?: string; promptAlias?: string
}
export type BuiltinAgentName =
  | "sisyphus" | "oracle" | "librarian" | "explore"
  | "multimodal-looker" | "metis" | "momus" | "atlas"
```

GPT 모델 호환: `isGptModel()` -> thinking 대신 reasoningEffort 사용.

## Sisyphus - 주 오케스트레이터 (`src/agents/sisyphus.ts`)

"시시포스처럼 매일 돌을 굴린다. 시니어 엔지니어와 구별 불가능한 코드를 작성."

### 동적 프롬프트 빌딩
```typescript
function createSisyphusAgent(model, availableAgents?, toolNames?, skills?, categories?) {
  const prompt = buildDynamicSisyphusPrompt(availableAgents, tools, skills, categories)
  return { mode: "primary", model, maxTokens: 64000, prompt,
    thinking: { type: "enabled", budgetTokens: 32000 },
    permission: { question: "allow", call_omo_agent: "deny" } }
}
```

### Phase 기반 프롬프트
- **Phase 0 - Intent Gate**: 스킬 체크(BLOCKING), 요청 분류, 위임 체크 (기본: DELEGATE)
- **Phase 1 - Codebase Assessment**: Disciplined/Transitional/Legacy/Greenfield 분류
- **Phase 2A - Exploration**: explore/librarian 항상 background + 병렬
- **Phase 2B - Implementation**: Category+Skills delegation, session_id resume
- **Phase 2C - Failure Recovery**: 3회 실패 -> STOP -> REVERT -> Oracle
- **Phase 3 - Completion**: todo 완료, diagnostics, build, background 취소

### Dynamic Prompt Builder (`src/agents/dynamic-agent-prompt-builder.ts`)
`categorizeTools()`가 도구를 lsp/ast/search/session/command/other로 분류. `buildKeyTriggersSection()`, `buildToolSelectionTable()`, `buildDelegationTable()` 등으로 섹션별 동적 생성.

## Atlas - 마스터 오케스트레이터 (`src/agents/atlas.ts`, 572줄)

"지휘자이지 연주자가 아니다. DELEGATE, COORDINATE, VERIFY."

### 워크플로우
1. TodoWrite로 orchestrate-plan 등록
2. 계획(.sisyphus/plans/*.md) 분석 -> 병렬화 맵
3. Notepad 초기화 (.sisyphus/notepads/{plan-name}/)
4. 각 task에 delegate_task() (6-Section 프롬프트 필수)
5. 매 delegation 후 project-level QA
6. 실패 시 session_id resume (최대 3회)

### 6-Section 프롬프트 (MANDATORY)
```
1. TASK: 정확한 체크박스 항목
2. EXPECTED OUTCOME: 파일, 기능, 검증 명령
3. REQUIRED TOOLS: 도구 화이트리스트
4. MUST DO: 필수 요구사항
5. MUST NOT DO: 금지 행위
6. CONTEXT: Notepad, 상속된 지혜, 의존성
```

Tool Restrictions: `task`, `call_omo_agent` 차단 -> delegate_task만 사용.

## Oracle - 읽기 전용 컨설턴트 (`src/agents/oracle.ts`)
- 모델: openai/gpt-5.2 (EXPENSIVE), 차단: write/edit/task/delegate_task
- 용도: 아키텍처 결정, 2+ 실패 후 디버깅, 보안/성능
- Pragmatic minimalism: 가장 단순한 해법 선호
- 노력 추정: Quick(<1h), Short(1-4h), Medium(1-2d), Large(3d+)

## Explore - 코드베이스 검색 (`src/agents/explore.ts`)
- 모델: opencode/gpt-5-nano (FREE), 차단: write/edit/task/delegate_task/call_omo_agent
- 필수 출력: `<analysis>`, `<results>` 블록 (절대 경로)
- 도구: LSP(semantic), ast_grep(structural), grep(text), glob(file), git(history)

## Librarian - 외부 참조 검색 (`src/agents/librarian.ts`)
- 모델: opencode/big-pickle (CHEAP)
- 4가지 요청: CONCEPTUAL(docs) / IMPLEMENTATION(clone+read) / CONTEXT(issues/prs) / COMPREHENSIVE
- Documentation Discovery: websearch -> version check -> sitemap -> targeted fetch
- 모든 주장에 GitHub permalink 필수

## Prometheus - 전략적 계획 (`src/agents/prometheus-prompt.ts`, 1196줄)

핵심 제약: "YOU ARE A PLANNER. NOT AN IMPLEMENTER."

### 인터뷰 모드 (기본)
7가지 Intent별 전략: Trivial, Refactoring, Build from Scratch, Mid-sized, Collaborative, Architecture, Research

### Plan Generation 흐름
```
Interview (매 턴 Clearance Check) -> Metis Consultation (MANDATORY)
-> Plan Generation (.sisyphus/plans/{name}.md)
-> Self-Review (CRITICAL/MINOR/AMBIGUOUS 분류)
-> Choice (Start Work vs High Accuracy)
-> [High Accuracy: Momus Loop until OKAY]
-> Delete draft + /start-work 안내
```

Plan 구조: Context -> Work Objectives -> Verification Strategy -> Task Flow -> TODOs (References + Acceptance Criteria) -> Commit Strategy -> Success Criteria

## Metis - 사전 계획 컨설턴트 (`src/agents/metis.ts`)
"지혜의 여신" - Intent 분류, AI-Slop 패턴 감지(scope inflation, premature abstraction), Directives for Prometheus 출력.

## Momus - 계획 리뷰어 (`src/agents/momus.ts`)
"풍자의 신" - ADHD 작성자 컨텍스트에서 무자비한 리뷰.
- 4기준: Clarity, Verification, Context Completeness, Big Picture
- OKAY: 100% 파일 참조 검증, >=80% reference sources, >=90% acceptance criteria
- 핵심 제약: DOCUMENTATION reviewer, not DESIGN consultant

## Sisyphus-Junior (`src/agents/sisyphus-junior.ts`)
- 차단: task, delegate_task (delegation 불가)
- 허용: call_omo_agent (explore/librarian 스폰)
- 기본 모델: anthropic/claude-sonnet-4-5, temperature: 0.1
- 카테고리별 모델/temperature/prompt_append 오버라이드

## Multimodal Looker (`src/agents/multimodal-looker.ts`)
- 모델: google/gemini-3-flash, 허용 도구: read만
- PDF 추출, 이미지 설명, 다이어그램 해석

## Permission 시스템 (`src/shared/permission-compat.ts`)
```typescript
createAgentToolRestrictions(blockedTools)  // 특정 도구 차단
createAgentToolAllowlist(allowedTools)     // 특정 도구만 허용
```

## 우리 프로젝트에의 시사점
1. Dynamic Prompt Building: 사용 가능 리소스에 따라 프롬프트 동적 조합
2. AgentPromptMetadata: 에이전트 간 관계 명시적 관리
3. Tool Restrictions: 에이전트별 도구 제한으로 역할 경계 강제
4. Planning Pipeline: Prometheus -> Metis -> Plan -> Momus -> Atlas
5. Session Continuity: session_id resume으로 컨텍스트 보존 + 토큰 절약
