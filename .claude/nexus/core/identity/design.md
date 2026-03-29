<!-- tags: identity, design, roles, tags, harness, information, context -->
# Design

## 역할 구조

### Lead (메인)

의도 발굴(Discovery) + 조율 + 사용자 소통. 에이전트 위임이 기본값.

**기본 동작**: 최소 Director 스폰. SessionStart 훅에서 1회 주입. 이 비용은 넥서스를 선택한 이상 감당하는 비용.

**Lead 직접 실행 조건** (모두 충족 시만):
1. 사용자가 정확한 변경 지시를 했다
2. 단일 파일 수정으로 완결된다
3. 코드 구조 이해가 불필요하다 (오타, 린트 에러, 상수 변경 등)

**판단 참조**: codebase knowledge, memory, 요청 텍스트 복잡도 신호. 코드 직접 읽기/LSP/웹 검색은 금지 (분석은 에이전트의 몫).

**판단 원칙**: 의심스러우면 높은 레벨로. 과소 판단 비용 >> 과대 판단 비용.

### 에이전트 (10개)

| 역할 | 기능 | 카테고리 | 모델 |
|------|------|----------|------|
| **Director** | 의도 대변(Advocacy) + Why/What + task 소유 | Decide | opus |
| **Architect** | 기술적 실현 가능성, 코드 설계, 계획 검증 gate | How | opus |
| **Postdoc** | 방법론, 증거 평가, synthesis, 계획 검증 gate | How | opus |
| **Designer** | UI/UX 설계, 인터랙션 패턴, 사용자 경험 | How | opus |
| **Strategist** | 비즈니스 전략, 시장 분석, 경쟁 포지셔닝 | How | opus |
| **Engineer** | 코드 구현, 디버깅, codebase/ 문서 즉시 갱신 | Do | sonnet |
| **Researcher** | 웹 조사, 실험, reference/ 즉시 기록 | Do | sonnet |
| **Writer** | 기술 문서, 프레젠테이션, 외부 소통 산출물 | Do | sonnet |
| **QA** | 코드 검증, 테스트, 보안 리뷰 | Check | sonnet |
| **Reviewer** | 콘텐츠 검증, 출처 확인, 문법/포맷 교정 | Check | sonnet |

**핵심 구분**: 의도 발굴(Lead) vs 의도 대변(Director). Lead는 사용자와 직접 대화하여 의도를 발굴하고, Director는 팀 내부에서 그 의도를 지키는 수호자.

**2 파이프라인**:
- 코드: Architect/Designer → Engineer → QA
- 콘텐츠: Postdoc/Strategist/Director → Researcher/Writer → Reviewer

**카테고리별 병렬 상한**:
- How: 최대 4 (판단+합의 필요)
- Do: 무제한 (독립 실행)
- Check: 무제한 (독립 검증)

## 태그 체계

| 태그 | 모드 | 설명 |
|------|------|------|
| `[consult]` | 상담 | 의도 발굴. task 파이프라인 없이 대화. 명시적 태그 시 조사 강제 주입 |
| `[d]` | 기록 | 결정 기록 |

태그 없는 메시지 = 기본 오케스트레이션. Lead→Director→동적 에이전트 구성.

"풀팀 동원" 같은 오버라이드는 자연어로 Lead에게 전달 (User Sovereignty).

## 정보 관리 체계

```
.claude/nexus/
├── core/            ← 정보 (넥서스 관리)
│   ├── identity/    ← 철학, 미션, 설계 원칙, 로드맵
│   ├── codebase/    ← 코드 구조, 아키텍처, 도구 (Engineer 즉시 갱신 + Director 검토)
│   ├── reference/   ← 외부 조사 결과 (Researcher 즉시 기록 + Director 검토)
│   └── memory/      ← 과거 교훈, 실패 패턴 (task_close 시 자동 추출)
├── rules/           ← 지시 (넥서스 관리, 도메인별 커스텀)
└── config.json
```

| 계층 | 갱신 주체 | 검토 주체 | source of truth |
|------|----------|----------|----------------|
| identity | 넥서스가 사용자에게 물어서 | 사용자 | 사용자 |
| codebase | Engineer 즉시 갱신 | Director | 프로젝트 코드 |
| reference | Researcher 즉시 기록 | Director | 외부 세계 |
| memory | task_close 시 자동 | Director | 과거 경험 |

**4계층 일관 패턴**: Do가 즉시 기록 + Director가 품질 관리.

Memory 기준: "이 정보가 없으면 같은 실수를 반복할 것인가?" — 실수 방지 + 자기 발전 메커니즘.

## 컨텍스트 엔지니어링

### 역할별 Briefing 매트릭스

`nx_briefing(role, hint?)` 도구가 역할별 매트릭스 기반으로 4계층에서 필요한 정보를 자동 수집.

| 역할 | identity | codebase | reference | memory |
|------|----------|----------|-----------|--------|
| Director | 전체 | 전체 | 전체 | 전체 |
| Architect | 전체 | 전체 | 전체 | 전체 |
| Postdoc | 전체 | 전체 | 전체 | 전체 |
| Designer | 전체 | 전체 | 전체 | 전체 |
| Strategist | 전체 | 전체 | 전체 | 전체 |
| Engineer | — | 전체 (hint 필터) | — | 전체 (hint 필터) |
| Researcher | 전체 | — | 전체 | 전체 |
| Writer | — | 전체 (hint 필터) | — | 전체 (hint 필터) |
| QA | 전체 | 전체 (hint 필터) | — | 전체 |
| Reviewer | 전체 | 전체 | — | 전체 |

### 구조화된 위임 포맷

Director가 Do 에이전트에게 태스크를 위임할 때 4섹션 포맷 사용:

```
## TASK
무엇을 해야 하는가

## CONTEXT
관련 배경 (nx_briefing + 세션 내 wisdom)

## CONSTRAINTS
하지 말아야 할 것, 범위 제한

## ACCEPTANCE
완료 기준
```

### 세션 내 학습

Director가 태스크 완료 보고에서 교훈을 추출 → 다음 에이전트 briefing에 포함. 파일 기록 없이 인메모리 전달. 장기 기억은 task_close 시 memory/에 기록.

## 하네스 메커니즘

### Task Pipeline

tasks.json 없으면 Edit/Write 차단. 계획→수행 파이프라인을 구조적으로 강제.

### 2단계 검증

- **Director**: 의도 검증 (항상 — 상시 스폰)
- **QA/Reviewer**: 산출물 검증 (Director 재량 + 자동 스폰 조건)

QA 자동 스폰 조건 (하나라도 해당 시):
- 변경 파일 3개 이상
- 기존 테스트 파일 수정
- 외부 API/DB 접근 코드 변경
- memory에 해당 영역 실패 이력 존재

### 루프/실패 감지 + 단계적 에스컬레이션

**파일 수준 (edit-tracker)**: 같은 파일 3회→경고, 5회→차단.

**태스크 수준 (reopen-tracker)**: nx_task_update로 태스크 reopen 3회→경고, 5회→차단. MCP matcher로 시스템 수준 감지.

**에이전트 수준 (agent-tracker)**: SubagentStart/Stop 훅으로 에이전트 생명주기 추적.

에스컬레이션 체인: 에이전트 중단 → Director → Lead → 사용자 (User Sovereignty).

### 스마트 Resume

SessionStart 시 Director 스폰 주입. tasks.json 존재 + pending 시 각 태스크의 stale 여부 판단 → close/재등록 또는 이어가기.

### Check 경고

nx_task_close 시 edit-tracker 파일 3개+ AND agent-tracker에 qa/reviewer 없음 → 경고. QA 누락 방지 안전망.

### disallowedTools 선언적 관리

플랫폼 수준에서 에이전트별 MCP 도구 차단. How/Do/Check 에이전트는 nx_task_add 차단 (Director만 task 소유). How 에이전트는 nx_task_update도 차단. Lead는 프롬프트 수준 제한 ("대규모 작업 시 Director에게 위임").

### Memory 자동 기록

task_close 시 사이클 교훈 자동 추출 (history.json → memory/).

## Consult 원칙

1. **적극적 의도 발굴** — 사용자가 명확히 하지 못하는 것을 적극적으로 찾아라.
2. **선제적 탐색 확장** — [consult] 명시 시 gate.ts가 조사 강제 프롬프트를 주입. 추측 기반 제안 금지.
3. **가설 기반 질문** — 빈 질문이 아닌 탐색 결과에 근거한 가설을 세우고 사용자에게 확인.
4. **Progressive Depth** — 요청 복잡도에 따라 상담 깊이 자동 조절.
5. **객관적 반박** — 반론 근거가 있으면 적극 반박. 넥서스는 예스맨이 아니다.
