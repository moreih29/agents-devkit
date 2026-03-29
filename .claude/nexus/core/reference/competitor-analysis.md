<!-- tags: omc, omo, competitor, orchestration, agents, comparison -->
<!-- tags: omc, omo, competitor, orchestration, agents, comparison -->
# 경쟁 프로젝트 비교 분석

조사일: 2026-03-29. 상세 코드 분석: .claude/contexts/resources/omc/, .claude/contexts/resources/omo/

## 프로젝트 개요

| | OMC (oh-my-claudecode) | OMO (oh-my-openagent) | Nexus |
|--|----------------------|---------------------|-------|
| 에이전트 수 | 29+ (19 빌트인 + 별칭) | 8~10 | 6 |
| 오케스트레이터 | Lead (system prompt) | Sisyphus(반복) + Atlas(대규모) | Lead + Director |
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

## Nexus 구조적 갭 (외부 대비)

1. **입출력 계약 부재** — 자연어 SendMessage vs OMO 6-Section 강제
2. **에이전트 수준 하네스 부재** — 파일 수준(edit-tracker)만. 에이전트 실패 추적 / Circuit Breaker / 재귀 위임 차단 없음
3. **계획 검증 레이어 부재** — Director가 수립+검증 겸임 vs OMO Metis+Momus 분리
4. **세션 내 학습 부재** — memory = 세션 간 학습만. OMO Wisdom = 세션 내 즉시 전달

## Nexus 고유 강점 (외부 대비)

1. **최소 복잡도** — 6 에이전트, 단일 gate.ts. OMC 29+/50+ 파일 대비 현저히 단순
2. **중앙집중 하네스** — gate.ts 단일 모듈. OMO 분산 가드레일 대비 추적성 우위
3. **4계층 정보체계** — identity/codebase/reference/memory 분류 명확. OMC 5-tier 대비 깔끔
4. **부트스트랩(dogfooding)** — 자기 자신으로 개발. OMC/OMO에 없는 품질 피드백 루프
