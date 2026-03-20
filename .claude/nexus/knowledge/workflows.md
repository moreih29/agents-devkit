# Nexus 워크플로우 시스템

## 3가지 프리미티브

### Nonstop (지속)
- **기능**: Stop 이벤트를 차단하고 작업을 계속하게 함
- **키워드**: nonstop, keep going, don't stop, 멈추지 마
- **상태 파일**: `.nexus/state/sessions/{id}/nonstop.json`
```json
{
  "active": true,
  "maxIterations": 100,
  "currentIteration": 0,
  "startedAt": "...",
  "sessionId": "..."
}
```

### Parallel (병렬)
- **기능**: 독립 태스크를 여러 에이전트에 동시 배분
- **키워드**: parallel, concurrent, 동시에, 병렬로
- **상태 파일**: `.nexus/state/sessions/{id}/parallel.json`

### Pipeline (파이프라인)
- **기능**: 정의된 단계를 순서대로 실행
- **키워드**: pipeline, 순서대로
- **상태 파일**: `.nexus/state/sessions/{id}/pipeline.json`

## 복합 워크플로우 = 프리미티브 조합

```yaml
# 예시: skills/auto/SKILL.md의 워크플로우 정의
workflow:
  type: pipeline
  nonstop: true      # 각 단계에서 Nonstop 활성화
  stages:
    - name: analyze
      agent: analyst
      tier: high
    - name: plan
      agent: strategist
      tier: high
    - name: implement
      type: parallel  # 이 단계는 병렬 실행
      agent: builder
      tier: medium
    - name: verify
      agent: guard
      tier: medium
    - name: review
      type: parallel
      agents: [reviewer, guard]
```

### omc 모드와의 매핑
| omc 모드 | Nexus 프리미티브 조합 |
|----------|----------------------|
| autopilot | Pipeline + Nonstop + Parallel |
| ralph | Nonstop |
| ultrawork | Parallel |
| ultraqa | Nonstop + (test→fix 반복) |
| swarm | Parallel (다수 에이전트) |
| team | Parallel + 외부 워커 |

## 키워드 감지

자연어 감지를 기본으로 하되, `[nonstop]` 같은 명시적 태그도 지원.

```javascript
// 1차: 명시적 태그 (있으면 확정)
const explicit = prompt.match(/\[(\w+)\]/g);
if (explicit) return resolveExplicit(explicit);

// 2차: 자연어 패턴 (3그룹만 관리)
const implicit = detectNaturalKeywords(prompt);
```

프리미티브가 3개뿐이므로 omc의 14개 패턴보다 오탐 확률이 훨씬 낮다.

## 대화형 워크플로우

### Consult (상담)
- **기능**: 적응형 깊이 + 차원 추적을 통해 사용자의 진짜 의도를 파악하고 구조화된 선택지를 제공
- **키워드**: consult, 상담, 어떻게 하면 좋을까, 뭐가 좋을까, 방법을 찾아
- **상태 파일 없음** — 대화형이므로 Gate 차단 불필요, 컨텍스트 주입만
- **적응형 깊이**: 불명확 차원 0-1개 → lightweight, 2개 이상 → deep
- **차원 추적**: Goal / Constraints / Criteria / Context (✅/⚠️/❌ 정성 평가, 숫자 점수 없음)
- **Brownfield/Greenfield 자동 감지** → 탐색 방식 분기
- 워크플로우: explore → assess → (clarify) → diverge → propose → converge → crystallize → execute bridge

### Plan (계획)
- **기능**: 합의 루프 기반 구현 계획 수립. 규모별 적응형 형식성
- **키워드**: plan, 계획 세워/짜/수립, 설계해, 어떻게 구현, plan this
- **상태 파일 없음** — 대화형, 컨텍스트 주입만
- **합의 루프**: Strategist(초안) → Architect(구조 검토) → Reviewer(비판), 최대 3회 반복
- **적응형 형식성**: 소규모(Strategist 단독) / 중규모(+Architect) / 대규모(3자 합의 + ADR)
- **Pre-Execution Gate**: auto/nonstop 요청 시 구체성 신호 없으면 plan 사용 제안 (`force:`로 우회 가능)
- 워크플로우: analyze → draft → [review loop] → persist → execute bridge

### Init (온보딩)
- **기능**: 기존 프로젝트에 Nexus 도입 시 기존 문서를 트리아지하여 knowledge 자동 생성
- **키워드**: init, 온보딩, nexus 설정, 프로젝트 초기화
- **상태 파일 없음** — 대화형 one-shot 프로세스
- 워크플로우: SCAN → TRIAGE → PROPOSE → GENERATE → VERIFY
