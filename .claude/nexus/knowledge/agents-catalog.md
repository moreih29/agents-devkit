# Nexus 에이전트 카탈로그

## 네이밍 원칙
기능을 직접 서술하되, 약간의 색채가 있는 이름. "executor"보다 기억에 남지만 "Prometheus"보다 직관적.

## 전체 카탈로그 (최대 15개, YAGNI 원칙에 따라 필요 시 추가)

| 이름 | 역할 | tier | context | 비고 |
|------|------|------|---------|------|
| **Lead** | 오케스트레이터 | high | full | 직접 코드 안 씀, 위임만 |
| **Builder** | 코드 구현 | medium | standard | 구현, 리팩토링 |
| **Finder** | 코드 탐색 | low | minimal | READ-ONLY |
| **Architect** | 아키텍처 설계 | high | full | READ-ONLY, Bash 제외 |
| **Guard** | 검증/보안 | medium | standard | READ-ONLY |
| **Strategist** | 계획 수립 | high | full | READ-ONLY |
| **Reviewer** | 코드 리뷰 | high | full | READ-ONLY |
| **Analyst** | 심층 분석 | high | full | READ-ONLY |
| **Debugger** | 디버거 | medium | standard | |
| **Tester** | 테스트 엔지니어 | medium | standard | |
| **Writer** | 문서 작성 | low | minimal | |

### Phase 4 후보 (미구현)
| 이름 | 역할 | 비고 |
|------|------|------|
| Critic | 품질 비평 | 필요성 입증 후 |
| Mason | 코드 단순화 | 필요성 입증 후 |
| Herald | git 관리 | 필요성 입증 후 |
| Palette | UI/UX 디자인 | 필요성 입증 후 |

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
