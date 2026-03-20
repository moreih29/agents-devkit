# Lattice 워크플로우 시스템

## 3가지 프리미티브

### Sustain (지속)
- **기능**: Stop 이벤트를 차단하고 작업을 계속하게 함
- **키워드**: sustain, keep going, don't stop, 멈추지 마
- **상태 파일**: `.lattice/state/sessions/{id}/sustain.json`
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
- **상태 파일**: `.lattice/state/sessions/{id}/parallel.json`

### Pipeline (파이프라인)
- **기능**: 정의된 단계를 순서대로 실행
- **키워드**: pipeline, 순서대로
- **상태 파일**: `.lattice/state/sessions/{id}/pipeline.json`

## 복합 워크플로우 = 프리미티브 조합

```yaml
# 예시: skills/cruise/SKILL.md의 워크플로우 정의
workflow:
  type: pipeline
  sustain: true      # 각 단계에서 Sustain 활성화
  stages:
    - name: analyze
      agent: analyst
      tier: high
    - name: plan
      agent: strategist
      tier: high
    - name: implement
      type: parallel  # 이 단계는 병렬 실행
      agent: artisan
      tier: medium
    - name: verify
      agent: sentinel
      tier: medium
    - name: review
      type: parallel
      agents: [lens, sentinel]
```

### omc 모드와의 매핑
| omc 모드 | Lattice 프리미티브 조합 |
|----------|----------------------|
| autopilot | Pipeline + Sustain + Parallel |
| ralph | Sustain |
| ultrawork | Parallel |
| ultraqa | Sustain + (test→fix 반복) |
| swarm | Parallel (다수 에이전트) |
| team | Parallel + 외부 워커 |

## 키워드 감지

자연어 감지를 기본으로 하되, `[sustain]` 같은 명시적 태그도 지원.

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
- **기능**: 사용자의 진짜 의도를 파악하고 구조화된 선택지를 제공하는 발산→수렴 워크플로우
- **키워드**: consult, 상담, 어떻게 하면 좋을까, 뭐가 좋을까, 방법을 찾아
- **상태 파일 없음** — 대화형이므로 Gate 차단 불필요, 컨텍스트 주입만
- **AskUserQuestion** 도구로 TUI 내 선택지 제공 (preview 지원)
- 워크플로우: explore → diverge → propose → converge → (optional) execute
