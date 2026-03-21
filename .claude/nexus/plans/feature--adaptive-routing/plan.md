# Plan: feature/adaptive-routing

## 목표
사용자가 에이전트/워크플로우를 명시하지 않아도, 요청을 분석하여 최적 조합을 자동 제안하는 적응형 라우팅 시스템 구현 (v1: 규칙 기반).

## 설계 원칙
- **제안, 강제 아님**: additionalContext로 추천만. 사용자가 명시 지정하면 무조건 override.
- **기존 키워드 감지와 공존**: [nonstop], [auto] 등 명시적 태그/키워드가 있으면 기존 로직 우선.
- **에이전트 이름 직접 언급도 override**: "Finder로 찾아줘" → Finder 확정, 라우팅 생략.

## 분류 체계

### 요청 카테고리 → 에이전트 + 워크플로우 매핑

| 카테고리 | 패턴 예시 | 추천 에이전트 | 추천 워크플로우 |
|----------|-----------|--------------|----------------|
| 버그 수정 | "버그", "고쳐", "fix", "에러", "안 돼" | Debugger | nonstop |
| 코드 리뷰 | "리뷰", "review", "봐줘", "검토" | Reviewer | — |
| 테스트 | "테스트", "test", "커버리지" | Tester | nonstop |
| 리팩토링 | "리팩토링", "refactor", "정리", "개선" | Builder | nonstop |
| 탐색/검색 | "찾아", "어디", "search", "find" | Finder | — |
| 설계/아키텍처 | "설계", "아키텍처", "구조", "design" | Architect | — |
| 계획 수립 | "계획", "plan", "어떻게 진행" | Strategist | — |
| 분석 | "분석", "왜", "원인", "analyze" | Analyst | nonstop |
| 문서 | "문서", "README", "docs" | Writer | — |
| 대규모 구현 | "구현", "만들어", "추가", "implement" | — (메인) | auto 제안 |

### 라우팅 우선순위
```
1. 명시적 워크플로우 ([auto], [nonstop] 등) → 기존 로직
2. 명시적 에이전트 ("Finder로", "Builder으로" 등) → 해당 에이전트 확정
3. 적응형 라우팅 → 카테고리 분류 → 제안 주입
4. 매칭 없음 → 제안 없이 pass
```

## 완료 조건
- [x] Gate에 적응형 라우팅 로직 추가 (10개 카테고리)
- [x] 에이전트 명시 언급 감지 (override)
- [x] 라우팅 제안 additionalContext 주입
- [x] E2E 테스트 확장 (62개 통과, 라우팅 10개 추가)
- [x] 빌드 + 캐시 동기화

## Unit 1: Gate 적응형 라우팅

### handleUserPromptSubmit 흐름 변경
```
기존: auto 감지 → 키워드 감지 → pass
변경: auto 감지 → 키워드 감지 → 에이전트 override 감지 → 적응형 라우팅 → pass
```

파일: `src/hooks/gate.ts`

### 에이전트 override 감지
```typescript
// "Finder로", "Builder으로", "Reviewer로" 등
const AGENT_NAMES = ['finder','builder','guard','debugger','lead','architect','strategist','reviewer','analyst','tester','writer'];
function detectAgentOverride(prompt: string): string | null {
  for (const name of AGENT_NAMES) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(prompt)) return name;
  }
  return null;
}
```

### 카테고리 분류
```typescript
interface RoutingSuggestion {
  agent?: string;
  workflow?: string;
  reason: string;
}

const ROUTING_RULES: Array<{ patterns: RegExp[]; suggestion: RoutingSuggestion }> = [
  { patterns: [/버그|고쳐|fix|에러|error|안\s*돼/i], suggestion: { agent: 'debugger', workflow: 'nonstop', reason: '버그 수정' } },
  { patterns: [/리뷰|review|봐\s*줘|검토/i], suggestion: { agent: 'reviewer', reason: '코드 리뷰' } },
  // ...
];
```

### additionalContext 형식
```
[LATTICE SUGGESTION] 이 요청은 "버그 수정"으로 분류됩니다.
추천: Debugger 에이전트 + nonstop 모드.
이 추천을 따르려면 Agent 도구로 nexus:debugger를 호출하세요.
다른 접근을 원하면 무시하세요.
```

## Unit 2: E2E 테스트 + 빌드

- 적응형 라우팅 매칭 테스트 (버그, 리뷰, 테스트 등)
- 명시적 에이전트 override 테스트
- 명시적 워크플로우 우선순위 테스트
- 빌드 + 캐시 동기화
