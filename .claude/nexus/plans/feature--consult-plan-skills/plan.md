# Plan: Consult 강화 + Plan 스킬 신규

## 배경

omc의 deep-interview, ralplan 스킬을 분석하여 Nexus에 적용할 부분을 정리.
단순 복제가 아니라 omc의 과잉 설계를 제거하고 Nexus만의 개선점을 추가하는 방향.

### 분석 원본 (참고용)
- omc deep-interview: `~/.claude/plugins/marketplaces/omc/skills/deep-interview/SKILL.md` (612줄)
- omc ralplan: `~/.claude/plugins/marketplaces/omc/skills/ralplan/SKILL.md` (134줄)
- 현재 consult: `skills/consult/SKILL.md` (103줄)

## 완료 조건
- [ ] consult SKILL.md 강화 (적응형 깊이 + 차원 추적 + 실행 브릿지)
- [ ] plan SKILL.md 신규 작성 (합의 루프 + Pre-Execution Gate)
- [ ] Gate 훅에 plan 키워드 감지 추가
- [ ] Gate 훅에 Pre-Execution Gate 로직 통합
- [ ] knowledge 문서 동기화
- [ ] E2E 테스트 추가

---

## Unit 1: Consult 강화

### 현재 consult 유지할 것
- 103줄의 간결함 (deep-interview 612줄 대비). 강화 후에도 200줄 이내 목표
- 5가지 핵심 원칙 (구체적 질문, 진짜 다른 선택지, 컨텍스트 우선 파악, 2라운드 수렴, 실행 강요 금지)
- AskUserQuestion 기반 구조화된 선택지
- nonstop 없이 동작하는 대화형 구조
- memo 기반 경량 상태 관리

### deep-interview에서 가져올 것

#### 1. 한 번에 하나의 질문
현재 consult는 Phase별로 묶어서 진행하지만, 탐색 단계에서 사용자에게 질문할 때 한 번에 하나만 던지는 원칙 추가.
```
❌ "목표가 뭔가요? 제약조건은요? 기존 코드에 영향이?"
✅ "가장 중요한 목표가 뭔가요?" → (답변 후) → "제약조건이 있나요?"
```

#### 2. Brownfield/Greenfield 구분
기존 코드 수정(brownfield)과 신규 개발(greenfield)에 따라 explore 단계 행동 변경:
- **Brownfield**: 코드베이스 먼저 탐색 → 기존 패턴/제약 파악 → 그 위에 질문
- **Greenfield**: 사용자 의도 중심 질문 → 기술 선택지 제시
- 자동 감지: 관련 파일/디렉토리가 이미 있으면 brownfield

#### 3. 차원별 정성 추적 (점수 아님)
deep-interview의 4차원을 가져오되 **숫자 점수 없이** 정성적으로 추적:
```
[Goal: ✅ 명확] [Constraints: ⚠️ 불명확] [Criteria: ❌ 미정의] [Context: ✅ 파악됨]
```
- 가장 약한 차원을 다음 질문 대상으로 선택
- 점수 매기지 않음. LLM이 자기 이해도를 0.65 vs 0.70으로 평가하는 건 가짜 정밀도
- 모든 차원이 ✅가 되면 자연스럽게 수렴

#### 4. 관점 전환 (자연스럽게)
deep-interview의 Challenge Agent는 고정 라운드(4,6,8)에서 발동하는데, 이건 기계적.
대신 대화 흐름에 따라 자연스럽게 전환:
- 사용자가 한 방향에만 집중할 때: "반대 입장에서 보면..."
- 요구사항이 과도하게 복잡할 때: "가장 단순하게 줄이면..."
- 핵심 개념이 불명확할 때: "이 시스템의 본질적인 문제는..."
- 별도 "에이전트"나 "모드"로 부르지 않음. 그냥 좋은 상담의 기술

#### 5. 조기 종료 + 리스크 투명 공개
사용자가 "됐어, 이 정도면 시작하자"라고 하면:
- 차단하지 않음 (사용자 자율성)
- 단, 불명확한 차원이 있으면 투명하게 알림: "Constraints가 아직 불명확합니다. 진행하면 X 리스크가 있을 수 있어요."

### deep-interview에서 버릴 것
- **수학적 모호성 점수** — `ambiguity = 1 - (goal*0.40 + constraints*0.30 + criteria*0.30)` 같은 공식. 가중치(40/30/30)는 검증된 적 없고, LLM 자기 평가에 숫자를 씌운 것
- **온톨로지 추출 + 안정성 비율** — 엔티티 매칭, 퍼지 비교, stability_ratio. "같은 얘기를 계속 한다"는 직관으로 충분
- **Challenge "에이전트" 명명** — 한 줄 프롬프트 주입을 에이전트라 부르는 건 과장
- **temperature 0.1 지시** — Claude Code에서 스킬이 temperature 제어 불가
- **20라운드 하드캡** — 현실적으로 5라운드 넘기면 이미 문제. 현재의 "2라운드 수렴" 원칙 유지하되 복잡한 경우 연장 가능

### Nexus만의 개선점 (omc에 없는 것)

#### 1. 적응형 깊이 (Progressive Depth)
모든 상담을 12라운드 인터뷰로 만들지 않음:
```
요청 복잡도 판단 → lightweight(현재 consult 수준) or deep(강화 모드)
```
- **Lightweight** (기본): 2라운드 수렴, 선택지 제시 중심
- **Deep** (자동 전환): 차원 추적 활성화, 관점 전환 포함
- 전환 조건: 첫 탐색에서 불명확 차원이 2개 이상이면 deep으로

#### 2. 코드 인텔리전스 연동
LSP/AST 도구로 코드 현실에 기반한 질문:
```
"src/auth/middleware.ts의 현재 구조를 보면 세션 토큰을 메모리에 저장하고 있는데,
이걸 변경하려는 건가요 아니면 새로운 인증 방식을 추가하려는 건가요?"
```
- explore 단계에서 nx_lsp_document_symbols, nx_ast_search 활용
- "코드를 봤더니 X인데 맞나요?" 형태의 근거 있는 질문

#### 3. 실행 브릿지 (2-3 선택지)
수렴 후 실행 전환 시 AskUserQuestion으로 선택지 제공:
```
options:
  - "Auto로 전체 자동화 (Recommended)" — 분석→계획→구현→검증→리뷰
  - "Pipeline으로 단계별 진행" — 각 단계에서 확인 후 다음으로
  - "계획만 정리하고 직접 진행" — 계획 문서 생성 후 종료
```
- deep-interview의 5개(너무 많음)가 아니라 2-3개
- 추천 마크 포함

### 변경될 워크플로우
```
현재:  explore → diverge → propose → converge → execute
강화:  explore(코드+사용자, brownfield/greenfield 분기)
       → 차원 추적(adaptive depth: lightweight or deep)
       → diverge + propose (AskUserQuestion)
       → converge (관점 전환 필요시)
       → crystallize (불명확 차원 리스크 고지)
       → execute bridge (2-3 선택지)
```

---

## Unit 2: Plan 스킬 신규

### 핵심 메커니즘

#### 1. 합의 루프
```
Strategist(초안) → Architect(구조 검토) → Reviewer(비판) → 반복 or 승인
```
- 최대 3회 반복 (ralplan은 5회지만 3회면 충분)
- 각 역할은 Nexus 에이전트로 실행 (Agent 도구 사용)
- 순차 실행 필수 — 병렬화하면 검토 체인이 깨짐

#### 2. 적응형 형식성
작업 규모에 따라 출력 형식 자동 조절:
```
소규모 (파일 1-3개 변경 예상):
  → 체크리스트 수준 계획
  → 합의 루프 없이 Strategist 단독

중규모 (모듈 수준 변경):
  → 구조화된 실행 계획 (단계, 파일, 테스트)
  → Strategist + Architect 2자 합의

대규모 (아키텍처 변경, 보안, 마이그레이션):
  → 전체 ADR + 리스크 분석 + 대안 비교
  → 3자 합의 루프
  → 고위험 작업 자동 감지: auth, migration, delete, security 키워드
```

#### 3. Pre-Execution Gate (Gate 훅 통합)
모호한 실행 요청이 auto/nonstop으로 가기 전에 시스템 수준에서 차단:

**Gate 훅에 통합** (별도 스킬이 아님):
```typescript
// gate.ts의 UserPromptSubmit에서
// auto 또는 nonstop 활성화 요청 시, 구체성 검사
if (detectedPrimitive && !hasConcreteSignals(prompt)) {
  // "구체적인 계획이 없습니다. plan으로 먼저 계획을 세울까요?" 제안
  return { additionalContext: "..." };
}
```

구체성 신호 감지:
- 파일 경로 언급 (`src/`, `.ts`, `.md` 등)
- 함수/클래스명 언급 (camelCase, PascalCase)
- 이슈 번호 (#123)
- 구조화된 단계 (1. 2. 3.)
- 기존 plan 문서 참조

**escape hatch**: `force:` 접두사 또는 `[force]` 태그로 우회

#### 4. 합의 참여자 유연화
고정된 Planner/Architect/Critic이 아니라 작업 성격에 따라 변경:
```
기본: Strategist + Architect + Reviewer
보안 관련: + Guard 참여
테스트 관련: + Tester 참여
성능 관련: + Analyst 참여
```

#### 5. 증분 계획
"한 번 계획 → 실행" 모델이 아니라, 실행 중 발견에 따라 계획 업데이트:
- plan이 `.claude/nexus/plans/{branch}.md`에 저장됨 (기존 인프라 활용)
- auto/pipeline 실행 중 예상과 다른 상황 발견 시 plan 문서 업데이트 가능
- 이건 스킬 자체보다는 에이전트 프롬프트에서 "계획 문서를 참조하고 필요시 갱신하라"는 지시로 구현

### Plan 스킬 트리거
```yaml
keywords:
  explicit: [plan]
  natural: ["계획 세워", "계획 짜", "설계해", "어떻게 구현", "구현 계획", "plan this"]
```

### Plan 스킬 워크플로우
```
1. 요청 분석 → 규모 판단 (소/중/대)
2. 규모별 참여자 결정
3. Strategist 초안 작성
4. (중규모 이상) Architect 구조 검토
5. (대규모) Reviewer 비판 → 반복
6. 최종 계획 문서 생성 (.claude/nexus/plans/{branch}.md)
7. 실행 전환 제안 (auto/pipeline/manual)
```

---

## Unit 3: Gate 훅 변경

### 키워드 감지 추가
```typescript
// gate.ts EXPLICIT_TAGS에 추가
plan: { type: 'plan' }

// NATURAL_PATTERNS에 추가
{ pattern: /계획\s*(세워|짜|수립)/, type: 'plan' },
{ pattern: /\bplan\b/i, type: 'plan' },
{ pattern: /구현\s*계획/, type: 'plan' },
```

### Pre-Execution Gate 로직
```typescript
// auto 또는 nonstop 감지 시, 구체성 검사 추가
function hasConcreteSignals(prompt: string): boolean {
  const signals = [
    /[a-zA-Z\/]+\.[a-z]{1,4}/,           // 파일 경로
    /[a-z]+[A-Z][a-zA-Z]*/,              // camelCase
    /[A-Z][a-z]+[A-Z][a-zA-Z]*/,         // PascalCase
    /#\d+/,                                // 이슈 번호
    /^\s*\d+[\.\)]/m,                      // 번호 매긴 단계
    /plans?\//,                            // plan 문서 참조
  ];
  return signals.some(s => s.test(prompt));
}

// force: 또는 [force]로 우회 가능
```

---

## Unit 4: 테스트

### E2E 추가 항목
```bash
# consult 강화
- consult 트리거 동작 확인 (기존)
- brownfield/greenfield 감지 (신규)

# plan 스킬
- plan 키워드 감지
- plan 자연어 패턴 감지
- Pre-Execution Gate: 모호한 auto 요청 차단
- Pre-Execution Gate: 구체적 auto 요청 통과
- Pre-Execution Gate: force: 우회
- plan 트리거 시 additionalContext에 스킬 호출 지시 포함
```

---

## 구현 순서 권장

1. **plan 스킬 SKILL.md 작성** — 가장 독립적, 다른 변경 없이 가능
2. **Gate 훅에 plan 키워드 추가** — 기존 패턴과 동일한 방식
3. **Gate 훅에 Pre-Execution Gate 추가** — auto/nonstop 감지 로직에 삽입
4. **consult SKILL.md 강화** — 기존 파일 수정, 구조 대폭 변경
5. **E2E 테스트** — 4번까지 완료 후
6. **knowledge 동기화** — /sync-knowledge

## 참고: 구현하지 않는 것

- deepsearch/ultrathink — 현재 우선순위 아님. 추후 Gate 키워드 확장으로 간단 구현 가능
- 온톨로지 추적 — 과잉 설계로 판단, 제외
- 수학적 모호성 점수 — 가짜 정밀도로 판단, 제외
- Challenge Agent 모드 — 자연스러운 관점 전환으로 대체
