# Nexus 에이전트 카탈로그

## 네이밍 원칙
기능을 직접 서술하되, 약간의 색채가 있는 이름. "executor"보다 기억에 남지만 "Prometheus"보다 직관적.

## 전체 카탈로그 (5개)

| 이름 | 역할 | tier | context | 비고 |
|------|------|------|---------|------|
| **Builder** | 코드 구현 | medium | standard | 구현, 리팩토링 |
| **Architect** | 아키텍처 설계 + 코드 리뷰 | high | full | READ-ONLY, Bash 제외 |
| **Guard** | 검증/테스트/보안 | medium | standard | 테스트 작성/실행 포함 |
| **Analyst** | 심층 분석/리서치 | high | full | READ-ONLY, 태스크 소유자 |
| **Debugger** | 디버거 | medium | standard | |

### 통합된 에이전트 (archives/)
| 이름 | 통합 대상 | 이유 |
|------|-----------|------|
| Reviewer | Architect | 코드 리뷰 = 구조적 비판 시각, 역할 중복 |
| Tester | Guard | 테스트 = 검증의 일부, 파이프라인 단순화 |

### 제거된 에이전트
| 이름 | 제거 이유 |
|------|-----------|
| Finder | built-in Explore로 대체 |
| Strategist | Analyst가 분석+태스크 소유, Lead는 조율만 |
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
2. **Reviewer → Architect**: 코드 리뷰는 구조적 비판 시각과 본질이 같음. Architect가 비판적 검토 역할 흡수.
3. **Tester → Guard**: 테스트 작성/실행은 검증 파이프라인의 일부. Guard가 테스트 모드 추가.
4. **qa-tester 제거**: Tester(→Guard)가 QA 역할 포함.
5. **document-specialist 제거**: Analyst + 메인이 직접 커버.
6. **scientist 제거**: Analyst가 데이터 분석/리서치 포함.
7. **Finder 제거**: Claude Code built-in Explore 기능으로 대체.
8. **Strategist 제거**: Analyst가 분석+태스크 소유. Lead는 조율+사용자 소통만.
9. **Writer 제거**: 메인 컨텍스트에서 직접 문서 작성.
