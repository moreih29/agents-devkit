# refactor/skill-system-redesign

스킬 시스템 재설계. auto/nonstop/pipeline의 관계 재정의 및 스킬 목록 정리.

## 핵심 문제

현재 `auto = pipeline + nonstop`으로 정의되어 있지만:
- **nonstop**은 auto에 포함되는 게 자연스럽다 (완료될 때까지 자동 진행)
- **pipeline**은 auto와 별개일 수 있다 (단계별 진행은 auto가 아닌 다른 실행 모드에서도 유용)
- LLM이 상황에 따라 자동으로 판단해야 하는 것들이 있다: pipeline을 탈지, 단순 수정할지, consult/plan/sync를 할지 등

## 결정사항

### 1. nonstop/pipeline 스킬 삭제
- `skills/nonstop/`, `skills/pipeline/` 디렉토리 삭제
- nonstop은 auto 내부 메커니즘으로만 존재 (Stop 차단)
- pipeline은 독립 모드로 불필요 — 사용자가 단계를 직접 정의하는 경우 거의 없음. 순차 실행은 LLM이 알아서 판단
- 스킬 목록: auto, parallel, consult, plan, init, setup, sync (7개)

### 2. Intent Gate 재설계
- 기존 라우팅(코드 기반 카테고리 매칭) 삭제 후 공백 상태
- OMO Phase 0 참고: 스킬 체크, 요청 분류, 위임 여부 판단을 LLM이 수행하도록
- Gate에서 결정론적 키워드 감지(consult, plan, [d]) 이외의 판단은 LLM에게 위임

### 3. 코드베이스 상태 분석 추가
- OMO Phase 1 참고: 코드베이스를 규율/전환/레거시/그린필드로 분류
- 현재 consult에만 brownfield/greenfield 감지가 있음 → 기본 동작으로 확장
- SessionStart 또는 첫 요청 시 자동 분석 → LLM 판단 재료로 제공

### 4. 실패 자동 복구 추가
- 현재 auto의 replan 루프(verify 실패 → 재계획, max 3회)를 기본 동작으로 전환
- auto 전용이 아닌, 에이전트 위임 실패 시 항상 적용되는 메커니즘으로

### 5. auto 스킬 제거
- 1~4번(Intent Gate + 코드베이스 분석 + 실패 복구)이 기본 동작으로 내장되면 auto는 불필요
- nonstop(Stop 차단)도 LLM이 작업 중이면 자동 적용 → 별도 모드 불필요
- 최종 스킬 목록: consult, plan, init, setup, sync (5개)

### 6. CLAUDE.md에 위임 판단 테이블 추가
- setup 스킬 실행 시 CLAUDE.md에 Nexus 섹션 자동 생성 (로컬/글로벌 선택)
- "기본: DELEGATE" 어조로 강한 위임 가이드
- 에이전트 목록은 Claude Code가 이미 제공하므로, "언제 어떤 에이전트를 쓸지" 판단 기준만 작성
- OMO 참고: 위임 판단 테이블 (요청 유형 → 에이전트 매핑)

### 7. 6-Section 위임 프롬프트 형식 — Pulse 주입
- Agent() 호출 시 Pulse(PreToolUse)에서 6-Section 템플릿 리마인더 주입
- 형식: TASK / EXPECTED OUTCOME / REQUIRED TOOLS / MUST DO / MUST NOT DO / CONTEXT
- CLAUDE.md에도 형식 가이드 포함하되, 실제 프롬프트에 주입되는 Pulse가 더 강제력 있음
- OMO Atlas 참고: 6-Section은 MANDATORY로 취급

### 8. Setup 스킬 재설계
- **설정 범위(scope) 선택 추가**: user scope (~/.claude/) vs project scope (.claude/)
  - user: 모든 프로젝트에 적용. ~/.claude/CLAUDE.md에 작성
  - project: 해당 프로젝트만. {project}/.claude/ 또는 CLAUDE.md에 작성
- **auto on/off 제거**: auto 스킬 자체가 삭제되므로 설정 불필요
- **설정 파일 단일화**: .nexus/config.json 하나로 통합. scope에 따라 위치 달라짐 (user: ~/.nexus/config.json, project: .nexus/config.json)
- **CLAUDE.md 작성 규칙**:
  - 기존 내용 훼손 금지 — `<!-- NEXUS:START -->` `<!-- NEXUS:END -->` 블록 마커로 Nexus 영역만 관리 (OMC 방식 참고)
  - 위임 지시 및 에이전트 가이드는 **영문**으로 작성 (LLM이 영문 지시를 더 잘 따름)
  - scope에 따라 작성 위치 분기: user → ~/.claude/CLAUDE.md, project → {project}/CLAUDE.md
- **기존 auto mode, statusline preset 단계**: auto 제거, statusline은 유지
- **OMC 충돌 감지**: setup 시 omc 플러그인 활성 여부 확인. 발견 시 충돌 경고 + omc 비활성화 옵션 제공 (AskUserQuestion). 사용자가 충돌 감안하고 같이 쓰겠다는 선택도 허용

## 실행 태스크 (1차)

### Wave 0
- [x] t1: nonstop/pipeline/auto/parallel 스킬 삭제

### Wave 1 (t1 이후, 병렬)
- [x] t2a: gate.ts — auto/parallel/nonstop/pipeline 감지 로직 제거
- [x] t9: setup SKILL.md 재설계
- [x] t11: consult SKILL.md 업데이트
- [x] t13: init/sync SKILL.md 업데이트

### Wave 2 (t2a 이후, 병렬)
- [x] t2b: gate.ts — handleStop 재설계
- [x] t2c: gate.ts — handleUserPromptSubmit 정리 + [d]
- [x] t3a: pulse.ts — 워크플로우 리마인더 제거
- [x] t4: tracker.ts — parallel 제거 + 코드베이스 분석
- [x] t6: state.ts — MODE_KEYS 축소
- [x] t8: statusline.ts — auto/parallel 표시 제거

### Wave 3
- [x] t3b: pulse.ts — 6-Section 주입 (t3a 이후)
- [x] t5: pulse.ts — 실패 복구 (t2a+t3a 이후)
- [x] t7: context.ts — 코드베이스 프로필 (t2a+t4 이후)
- [x] t10: gate.ts — setup 주입 업데이트 (t2c+t9 이후)
- [x] t12: plan SKILL.md + gate plan 주입 (t1+t2c 이후)

### Wave 4
- [x] t14: knowledge 문서 업데이트
- [x] t15: E2E 테스트 재작성

### Wave 5
- [x] t16: 빌드 + 검증

## 배경

- 이전 리디자인(refactor/orchestration-redesign)에서 모드 기반 워크플로우로 전환 완료
- nonstop/pipeline을 auto 내부 메커니즘으로 흡수했지만, 독립 모드로 남겨야 할 수도 있음
- 스킬 SKILL.md 파일들이 새 workflow.json 모델과 불일치
