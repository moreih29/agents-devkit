# Nexus 에이전트 카탈로그

## 네이밍 원칙
기능을 직접 서술하되, 약간의 색채가 있는 이름. "executor"보다 기억에 남지만 "Prometheus"보다 직관적.

## 전체 카탈로그 (최대 15개, YAGNI 원칙에 따라 필요 시 추가)

| 이름 | 역할 | tier | context | 이름 선택 이유 |
|------|------|------|---------|---------------|
| **Lead** | 오케스트레이터 | high | full | "집사/관리인" — 전체를 관리하되 직접 일하지 않음 |
| **Builder** | 코드 구현 | medium | standard | "장인" — 품질에 대한 자부심을 내포 |
| **Finder** | 코드 탐색 | low | minimal | "정찰병" — 빠르게 코드베이스를 탐색 |
| **Architect** | 아키텍처 설계 | high | full | "나침반" — 방향을 제시. READ-ONLY |
| **Guard** | 검증/보안 | medium | standard | "보초" — 결과 검증 + 보안 감시. mode로 구분 |
| **Strategist** | 계획 수립 | high | full | "전략가" — 전략적 계획 수립 |
| **Reviewer** | 코드 리뷰 | high | full | "렌즈" — 코드를 확대하여 세밀하게 관찰 |
| **Analyst** | 심층 분석 | high | full | "분석가" — 이미 직관적이고 보편적인 이름 |
| **Debugger** | 디버거 | medium | standard | "수선공" — 시행착오를 통한 수정 |
| **Critic** | 비평가 | high | full | "비평가" — 품질을 엄격하게 평가 |
| **Tester** | 테스트 엔지니어 | medium | standard | "직조공" — 테스트 안전망을 짜는 행위 |
| **Writer** | 문서 작성 | low | minimal | "서기관" — 기록의 중요성 강조 |
| **Mason** | 코드 단순화 | high | standard | "석공" — 불필요한 부분을 깎아내고 다듬는 장인 |
| **Herald** | git 관리 | medium | standard | "전령" — 변경 사항을 알리고 기록 |
| **Palette** | UI/UX 디자이너 | medium | standard | "팔레트" — 색상과 디자인을 다루는 도구 |

## 에이전트 통합 근거 (omc 19개 → 15개)

1. **verifier + security-reviewer → Guard**: 모두 "검사"가 본질. 프롬프트 내 mode 파라미터로 구분.
2. **qa-tester 제거**: Tester가 QA 역할 포함.
3. **document-specialist 제거**: Writer + Finder 조합으로 커버.
4. **scientist 제거**: Analyst가 데이터 분석/리서치 포함.

## Phase별 추가 계획

| Phase | 에이전트 | 상태 |
|-------|----------|------|
| Phase 1 (MVP) | Lead, Builder, Finder, Architect, Guard | 완료 |
| Phase 2 | + Strategist, Reviewer, Analyst, Debugger | 완료 |
| Phase 3 | + Tester, Writer (부트스트랩 필요) | 완료 |
| Phase 4 | + 나머지 (필요성 입증 후) | 미정 |
