# Persistence Surface Theory

**날짜**: 2026-04-10
**출처**: plan 세션 — resume_tier 스킴 도입 의사결정 과정에서 postdoc이 도입한 통합 프레임

## 핵심 명제

서브에이전트의 영속성(resume) 정책은 **두 표면**의 구분으로 설명된다:

| 표면 | 정의 | 복원 방법 |
|-----|------|---------|
| **Reasoning surface** | 에이전트 컨텍스트에만 존재 (기각된 대안, 가설 트리, 의도의 근거, 편집 중 누적된 AST 이해) | resume으로만 복원 가능 |
| **Artifact surface** | 파일 시스템에 persist (코드, 문서, 보고서, 테스트 결과) | Read로 완전 복원 가능 |

## 함의

- **Resume 가치는 reasoning surface가 작업 본질일 때만 발생** — artifact surface가 지배적이면 resume 효용 낮음 (Read로 복원 가능)
- **역할(category: HOW/DO/CHECK)과 영속성(resume_tier)은 독립 축** — 한 축으로 강제 매핑하면 예외 발생. researcher가 `category:do`이지만 `resume_tier:persistent`인 이유는 본질이 reasoning surface(가설 탐색, 검색 전략, source tier 판정)이기 때문.
- **검증(CHECK)에서 resume = 구조적 해악** — independence가 품질 지표일 때 reasoning 누적은 inter-rater reliability를 훼손. anchoring bias 방어 불가.

## 새 에이전트 분류 판단 절차

새 에이전트를 추가할 때 `resume_tier` 결정:

1. **검증/독립성이 품질 지표인가?** → yes → `ephemeral` (예: tester, reviewer)
2. **artifact surface 작동이 지배적인가?** (파일 수정이 본질, 작업 종료 시 산출물이 file에 영구화) → yes → `bounded` (같은 artifact 조건만)
3. **reasoning surface 작동이 지배적인가?** (의견/분석/전략이 본질, 종료 후 추론 체인이 휘발) → yes → `persistent`

## 적용

resume_tier 3-tier 스킴(persistent/bounded/ephemeral)의 이론 근거. agents/*.md frontmatter 매핑, nx-plan/nx-run SKILL.md의 Resume Policy/Dispatch Rule 표는 모두 이 프레임에서 도출됨.

## 관련 기록

- `.nexus/memory/subagent-resume.md` — 기술 메커니즘 검증 (SendMessage agentId, prompt cache)
- `skills/nx-plan/SKILL.md` Resume Policy 섹션 — 정책 표
- `skills/nx-run/SKILL.md` Resume Dispatch Rule — 디스패치 알고리즘
