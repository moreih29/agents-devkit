# Nexus 에이전트 카탈로그

## 네이밍 원칙
기능을 직접 서술하되, 약간의 색채가 있는 이름. "executor"보다 기억에 남지만 "Prometheus"보다 직관적.

## 전체 카탈로그 (7개)

| 이름 | 역할 | tier | context | 비고 |
|------|------|------|---------|------|
| **Builder** | 코드 구현 | medium | standard | 구현, 리팩토링 |
| **Architect** | 아키텍처 설계 | high | full | READ-ONLY, Bash 제외 |
| **Guard** | 검증/보안 | medium | standard | READ-ONLY |
| **Reviewer** | 코드 리뷰 | high | full | READ-ONLY |
| **Analyst** | 심층 분석 | high | full | READ-ONLY |
| **Debugger** | 디버거 | medium | standard | |
| **Tester** | 테스트 엔지니어 | medium | standard | |

### 제거된 에이전트
| 이름 | 제거 이유 |
|------|-----------|
| Finder | built-in Explore로 대체 |
| Strategist | Lead가 직접 계획 수립 |
| Writer | 메인이 직접 작성 |

### Phase 4 후보 (미구현)
| 이름 | 역할 | 비고 |
|------|------|------|
| Critic | 품질 비평 | 필요성 입증 후 |
| Mason | 코드 단순화 | 필요성 입증 후 |
| Herald | git 관리 | 필요성 입증 후 |
| Palette | UI/UX 디자인 | 필요성 입증 후 |

## 에이전트 통합 근거

1. **verifier + security-reviewer → Guard**: 모두 "검사"가 본질. 프롬프트 내 mode 파라미터로 구분.
2. **qa-tester 제거**: Tester가 QA 역할 포함.
3. **document-specialist 제거**: Analyst + 메인이 직접 커버.
4. **scientist 제거**: Analyst가 데이터 분석/리서치 포함.
5. **Finder 제거**: Claude Code built-in Explore 기능으로 대체.
6. **Strategist 제거**: Lead가 직접 Team 스킬로 초안 작성.
7. **Writer 제거**: 메인 컨텍스트에서 직접 문서 작성.
