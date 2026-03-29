<!-- tags: omc, omo, competitor, orchestration, agents, comparison -->
# 경쟁 프로젝트 비교 분석

조사일: 2026-03-29.

## 프로젝트 개요

| | OMC (oh-my-claudecode) | OMO (oh-my-openagent) | Nexus |
|--|----------------------|---------------------|-------|
| 에이전트 수 | 29+ (19 빌트인 + 별칭) | 8~10 | 9 |
| 오케스트레이터 | Lead (system prompt) | Sisyphus(반복) + Atlas(대규모) | Lead 단독 |
| 팀 구조 | tmux + git worktree 물리 격리 | BackgroundManager 비동기 | TeamCreate 논리 팀 |
| 파이프라인 | plan→prd→exec→verify→fix 5단계 | Intent Gate→Exploration→Implementation→Completion | Intake→Design→Execute→Complete 4단계 |
| 하네스 | SubagentStart/Stop 훅, verify-deliverables | Phase 2C(3회→에스컬레이션), 재귀 위임 차단 | gate.ts edit-tracker, task pipeline |
| 정보 관리 | 5-tier (Notepad~Tags), 50+ 파일 team/ | Wisdom Accumulation (세션 내 학습) | 4계층 core/ (identity/codebase/reference/memory) |

## OMC 주요 패턴

- **Lane 분리**: Build Lane + Analysis Lane + Review Lane. 역할별 명시적 파이프라인
- **19 에이전트 상세**: explore(haiku), analyst(opus), planner(opus), architect(opus), debugger(sonnet), executor(sonnet), verifier(sonnet), tracer(sonnet), security-reviewer(sonnet), code-reviewer(opus), test-engineer(sonnet), designer(sonnet), writer(haiku), qa-tester(sonnet), scientist(sonnet), git-master(sonnet), code-simplifier(opus), critic(opus), document-specialist(sonnet)
- **SubagentStart/Stop 훅**: 에이전트 라이프사이클 추적 → Active agents 카운팅
- **교훈**: 에이전트 과잉 분화 → 관리 비용 높음. deprecated alias 10+개가 복잡도 증거

## OMO 주요 패턴

- **동적 프롬프트 빌딩**: 사용 가능 리소스에 따라 프롬프트 동적 조합 (buildDynamicSisyphusPrompt)
- **6-Section 위임 프롬프트 (MANDATORY)**: TASK / EXPECTED OUTCOME / REQUIRED TOOLS / MUST DO / MUST NOT DO / CONTEXT
- **Phase 2C 실패 복구**: 3회 실패 → STOP → REVERT → Oracle 에스컬레이션
- **재귀 위임 차단**: Sisyphus-Junior에게 delegate_task 도구 차단
- **Metis + Momus**: 계획 갭 분석(Metis) + 계획 리뷰(Momus) 2단계 검증
- **Wisdom Accumulation**: Conventions/Successes/Failures/Gotchas/Commands 누적 → 세션 내 학습
- **세션 연속성**: session_id resume으로 컨텍스트 보존 + 토큰 절약

## 구현 차용 가능 패턴

### OMC 상태 관리

- **Atomic write**: tmp + rename으로 partial write 방지
- **Session staleness TTL**: 2시간 초과 시 이전 세션 state를 stale로 판정 → Stop 차단 해제
- **Cancel signal 30초 TTL**: Cancel 입력 시 persistent-mode 즉시 허용
- **Circuit breaker 수치**: team pipeline 20회, ralplan 30회 max + TTL 기반 자동 해제

### OMC Context 보호

- **suppressOutput 패턴**: 모든 hook 응답에 `{ continue: true, suppressOutput: true }` → system-reminder 주입 방지 (context 오염 해결)
- **Context guard 수치**: 72% 컨텍스트 사용 시 PreToolUse에서 heavy 도구 차단, 95% 시 Stop 허용

### OMC 검증 강도 자동화

- **Verification tier selector**: 변경 규모 기반 자동 선택
  - Lightweight: <5파일, <100줄
  - Standard: 기본
  - Thorough: >20파일
- **Skill 보호 등급 3단계**: light(5분 TTL/3회), medium(15분/5회), heavy(30분/10회) — Stop hook 강도 차별화

### OMO 완료 감지 + 동시성

- **BackgroundManager 완료 감지 3중 체크**: (1) session.idle 이벤트, (2) 500ms 폴링 (최대 10분), (3) 안정성 감지 (3회 연속 메시지 수 동일 + MIN_STABILITY_TIME 10초)
- **ConcurrencyManager**: provider/model별 동시성 슬롯 제어. defaultConcurrency: 2, anthropic: 3

### OMO 계획 검증

- **Prometheus 5단계 파이프라인**: Interview → Metis Consultation(MANDATORY) → Plan Generation → Self-Review(CRITICAL/MINOR/AMBIGUOUS) → Momus Loop until OKAY → Delete draft → /start-work
- **Momus 정량적 승인 기준**: 100% 파일 참조 검증, ≥80% reference sources, ≥90% acceptance criteria
- **7가지 Intent 분류**: Trivial / Refactoring / Build from Scratch / Mid-sized / Collaborative / Architecture / Research — 각 intent별 다른 전략

### OMO 에이전트 설계

- **비용 분류 시스템**: `AgentCost: "FREE" | "CHEAP" | "EXPENSIVE"` + `AgentCategory: "exploration" | "specialist" | "advisor" | "utility"` — 에이전트 선택 시 비용 인지 원칙
- **동적 프롬프트 빌더 구조**: `categorizeTools()` → `buildKeyTriggersSection()`, `buildToolSelectionTable()`, `buildDelegationTable()`로 섹션별 생성

### OMO Claude Code 호환

- **호환 레이어 5종**: MCP Loader(.mcp.json→OpenCode 변환), Agent Loader(.claude/agents/), Command Loader, Session State(mainSessionID 추적), Plugin Loader — OpenCode 기반이면서 Claude Code 생태계 완전 흡수

## Nexus 구조적 갭 (외부 대비)

1. **입출력 계약 부재** — 자연어 SendMessage vs OMO 6-Section 강제
2. **에이전트 수준 하네스 부재** — 파일 수준(edit-tracker)만. 에이전트 실패 추적 / Circuit Breaker / 재귀 위임 차단 없음
3. **계획 검증 레이어 부재** — Lead가 수립+검증 겸임 vs OMO Metis+Momus 분리
4. **세션 내 학습 부재** — memory = 세션 간 학습만. OMO Wisdom = 세션 내 즉시 전달

## Nexus 고유 강점 (외부 대비)

1. **최소 복잡도** — 9 에이전트, 단일 gate.ts. OMC 29+/50+ 파일 대비 현저히 단순
2. **중앙집중 하네스** — gate.ts 단일 모듈. OMO 분산 가드레일 대비 추적성 우위
3. **4계층 정보체계** — identity/codebase/reference/memory 분류 명확. OMC 5-tier 대비 깔끔
4. **부트스트랩(dogfooding)** — 자기 자신으로 개발. OMC/OMO에 없는 품질 피드백 루프
