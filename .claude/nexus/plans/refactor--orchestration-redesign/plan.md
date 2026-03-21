# refactor/orchestration-redesign

오케스트레이션 구조 재설계. 논의 기반으로 결정사항을 누적하고, 이후 계획 수립 및 구현.

## 결정사항

### 1. Lead 에이전트 삭제
- **이유**: Gate 훅이 이미 결정론적 라우팅(10개 카테고리 × 정규식 + 히스토리)을 수행. Lead는 "LLM에게 잘 분배하라"는 모호한 지시만 있어 실질적 역할 없음.
- **Gate 대비 열위**: 패턴 매칭, 히스토리 추적, 오탐 방지 모두 Gate가 코드로 처리. Lead가 추가하는 가치 없음.
- **영향**: agents/lead.md 삭제, Gate 라우팅/Pulse 컨텍스트 수준에서 lead 참조 제거

### 2. force 접두사 제거
- `force:`와 `[force]` 파싱 로직 삭제
- Pre-Execution Gate 우회 수단 제거 — 모호한 요청은 항상 plan으로 리다이렉트

### 3. Init 키워드 감지 제거
- Gate의 자연어 패턴(`/\binit\b/`, `/온보딩/`, `/프로젝트\s*초기화/`)에서 init 제거
- Init은 명시적 스킬 호출(`/nexus:nx-init` 또는 setup 위자드 내)에서만 동작
- **이유**: "init 변수" 등 오탐 가능성 + PRIMITIVE_NAMES에 오탐 방지도 누락되어 있었음

### 4. SessionStart 위임 가이드라인 삭제
- SessionStart의 additionalContext에서 위임 규칙 텍스트 제거
- **이유**: 세션 후반부로 갈수록 희석되어 역할 못함. Pulse의 매 도구 호출 시 enforcement가 더 효과적

### 5. Pulse delegation enforcement 강화
- **strict**: 기존 유지 — routing.json 존재 시 Write/Edit 차단 (`{ decision: "block" }`)
- **warn + routing.json 있음**: 강한 권고로 격상. Gate가 로직으로 에이전트를 매칭한 상태이므로 매우 구체적으로 위임 지시
- **warn + routing.json 없음**: 중간 권고. 현재 "Consider" 수준에서 → 에이전트 위임을 적극 제안하는 형태로 강화
- **off**: 기존 유지 — 아무것도 안 함
- delegation 메시지는 토큰 비용이 들더라도 반복 주입 허용 (MAX_REPEAT 예외)

### 6. SUSTAIN → NONSTOP 이름 통일
- 상태 파일은 `nonstop.json`인데, 주입 메시지는 `[SUSTAIN N/M]`으로 되어있음
- `[NONSTOP N/M]`으로 통일. 프리미티브 이름과 일치시킴

### 7. 프리미티브 키워드 오탐: 설명 맥락 구분
- 문제: 사용자가 프리미티브를 "설명"하는 프롬프트에서 키워드가 감지되어 실제 활성화됨 (예: "[nonstop]이 뭐야?" → nonstop 활성화)
- 현재 `isPrimitiveMention`은 에러/버그 맥락만 필터링. 설명/질문 맥락은 미처리
- 구체적 해결책은 계획 단계에서 탐색 필요 (인용부호 감지, 질문 패턴 필터, 코드블록 내 무시 등)

### 8. 적응형 라우팅 제거 → LLM 판단으로 전환
- Gate의 `detectRouting()`, `ROUTING_RULES`, `routing-history.json`, `detectAgentOverride()` 전부 제거
- routing.json 상태 파일도 제거
- **이유**: 정규식 기반 단일 카테고리 매칭은 LLM보다 열위. 복합 요청 처리 불가, 오분류 가능, 순서 의존적
- **OMC/OMO 참고**: 둘 다 "누구에게 위임할지"는 LLM에게 맡김. 코드로 에이전트를 선택하는 시스템은 Nexus만 유일했음
- **대안**: OMO 방식 — 에이전트 메타데이터(역할, 모델, 적합 상황)를 잘 정리해서 LLM에게 판단 재료 제공. 최종 선택은 LLM
- **Pulse enforcement 영향**: routing.json 제거 시 "warn + routing.json 있음" 단계 소멸. enforcement 방식 재설계 필요 (결정사항 5번과 연동)

### 9. plans/tasks 구조 통합
- 기존: `plans/{branch}.md` + `tasks/*.json` (개별 파일) → 분리되어 연결 약함
- 변경: `plans/{branch}/plan.md` + `plans/{branch}/tasks.json` → 브랜치별 디렉토리
  ```
  .claude/nexus/plans/{branch}/
    ├── plan.md      ← 배경, 결정사항, 논의 (사람용)
    └── tasks.json   ← 태스크 목록, 의존성, 상태 (LLM용)
  ```
- tasks.json에 의존성(`depends`) 명시 → 병렬 가능 여부는 실행 시 LLM이 판단
- 기존 `tasks/` 디렉토리 및 `nx_task_*` MCP 도구 제거
- git 추적되어 로컬 간 동기화 유지
- tasks.json 생성 시 plan.md에 `## 실행 태스크` 섹션 추가 (체크박스 목록)
- 태스크 완료 시 tasks.json status 업데이트 + plan.md 체크박스 체크
- plan.md = 사람용 요약 (결정사항 + 체크박스), tasks.json = LLM용 상세 (의존성, 상태)
- **멀티 사이클 지원**: 한 브랜치에서 결정→구현을 여러 번 반복 가능
  - tasks.json: 현재 사이클만 담음. 새 사이클 시 덮어쓰기
  - plan.md: 누적. `## 실행 태스크 (N차)` 섹션이 추가됨
  - 이전 사이클은 plan.md 체크박스 + git 히스토리로 보존

### 11. 워크플로우 개념 재정의 → 모드 기반
- 기존 "3개 프리미티브 조합" 모델 폐기 (nonstop/pipeline/parallel이 대등한 프리미티브)
- **모드 기반**: 사용자는 한 번에 하나의 모드에 있다
  - `idle` — 일반 대화
  - `auto` — 파이프라인 실행 (nonstop은 auto에 흡수, 별도 프리미티브 아님)
  - `parallel` — 독립적 병렬 실행
  - `consult` — 심층 탐색 대화
  - `plan` — 구조화된 계획 수립
  - `planning` — 멀티턴 결정 모드 (plan 디렉토리 존재)
- **auto 내 parallel**: implement 단계에서 병렬 실행 시 부속 정보로 표시
  - 독립 parallel: `⚡ parallel 1/3 │ 🤖 2`
  - auto 내 parallel: `🚀 auto: implement (3/6) ⚡2/3 │ 🤖 3`
- **nonstop 독립 프리미티브 폐지**: auto의 Stop 차단 메커니즘으로만 존재. 단독 사용 제거
- **상태라인 3줄**: 현재 모드 + 진행상황 + 활성 에이전트 수 + 태스크 진행률
- **태스크 표시**: tasks.json 기반 done/total을 항상 표시. 없으면 0/0. 모드 무관
  - `🚀 auto: implement (3/6) │ 🤖 2 │ 📋 2/5`
  - `💤 idle │ 🤖 0 │ 📋 0/0`

### 12. tasks.json 생성 시 plan 스킬 사용
- 결정사항 누적 후 "구현하자" 시점에 `[plan]` 스킬로 tasks.json 생성
- plan의 합의 루프(strategist → architect → reviewer)를 통해 태스크 분해 + 의존성 + 검증
- strategist가 초안, architect가 구조 검토, reviewer가 비판 → 정제된 tasks.json 산출

### 10. 단발성/멀티턴 구분 + 결정 캡처 체계
- **구분 기준**: plan 디렉토리 존재 여부로 자연스럽게 분기
  - plan 없음 + 일반 요청 → 단발성. 에이전트 위임으로 바로 처리
  - plan 있음 → 멀티턴 모드. 결정 누적 가능
- **결정 캡처**:
  - plan 디렉토리 존재 시 LLM이 확정형 표현("삭제하자", "이걸로 하자")을 자동 감지해서 plan.md 기록 시도
  - `[d]` 태그: LLM이 놓칠 때 사용자가 명시적으로 결정 전달하는 보험 수단
  - `[consult]`: 심층 탐색 후 AskUserQuestion 선택 결과를 결정으로 기록
  - 일반 대화: 기록하지 않음
  - 오기록 시 사용자가 "그건 아직 결정 아님"으로 정정 가능
- **구현 전환**: 사용자가 "구현하자"라고 하면 → 결정사항 기반으로 tasks.json 생성 → auto/plan 실행
- **LLM의 plan 제안**: 단발성 요청이라도 복잡하다고 판단되면 "plan을 먼저 세울까요?"를 AskUserQuestion으로 제안

## 실행 태스크 (1차)

### Wave 1 (병렬)
- [x] t1: Lead 에이전트 삭제 및 참조 제거
- [x] t2: force 접두사 파싱 제거
- [x] t3: Init 키워드 자연어 감지 제거
- [x] t4: SessionStart 위임 가이드라인 삭제
- [x] t5: 적응형 라우팅 시스템 제거
- [x] t7: SUSTAIN → NONSTOP 이름 통일
- [x] t8: 프리미티브 키워드 오탐 방지 강화
- [x] t9: plans/tasks 구조 통합 + 기존 태스크 시스템 제거

### Wave 2 (t5,t7,t9 이후)
- [x] t10: 모드 기반 워크플로우 모델 구현

### Wave 3 (t5,t10 이후 / t9,t10 이후 / t9 이후)
- [x] t6: Pulse delegation enforcement 재설계
- [x] t11: 상태라인 3줄 모드 기반 재설계
- [x] t12: 결정 캡처 + 멀티턴 워크플로우 구현

### Wave 4
- [x] t13: E2E 테스트 업데이트 + 통합 검증

## 배경 논의 요약

- 오케스트레이션 시스템의 본질 = 이벤트 인터셉터 + 파일 기반 상태 + LLM 프롬프트 조향(steering)
- 플러그인 레벨에서는 "강제"가 아닌 "조향"만 가능 (포지티브 컨트롤 불가)
- OMO도 동일한 한계 — 정교한 구현이지 더 강한 제어력이 아님
- OAuth 제약으로 호스트 프로그램 코드 레벨 접근 불가
