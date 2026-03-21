# Plan: feature/reference-analysis

## 목표
omc와 omo를 심층 분석하고, Nexus 오케스트레이션 시스템의 구체적이고 자세한 설계를 완성한다.

## 완료 조건
- [x] omc 심층 분석 문서 10개 작성
- [x] omo 심층 분석 문서 10개 작성
- [x] 두 시스템 심층 비판적 분석 (`01-deep-critique.md`)
- [x] Nexus 시스템 설계 제안서 (`02-new-system-design.md`)
- [x] 설계 논의 및 비판적 검토 (4차 반복)
  - 이중 저장소 아키텍처 (git 추적 vs gitignore)
  - 컨텍스트 주입 수준 (minimal/standard/full)
  - 훅 격리 전략의 기술적 실현 가능성
  - 에이전트 수 YAGNI 원칙
  - 키워드 감지 UX
  - plans 브랜치 기반 관리
- [x] Nexus knowledge 구조 초기화
  - knowledge/architecture.md
  - knowledge/conventions.md
  - knowledge/decisions/ (5개 ADR)
- [x] 현재 브랜치 plan 작성
- [x] 최종 설계 문서 일관성 점검
- [x] 부트스트래핑 전략 문서화 (knowledge/decisions/bootstrapping.md)
- [ ] 커밋 및 PR

## 현재 상태
설계 문서 작성 및 비판적 검토가 완료되었고, Nexus 자체 규칙에 따른 knowledge/plans 구조를 초기화했다.

## 산출물 목록

### 레퍼런스 분석 (.claude/contexts/resources/)
| 파일 | 내용 |
|------|------|
| `omc/00-overview.md` ~ `omc/09-build-distribution.md` | omc 심층 분석 10개 |
| `omo/00-overview.md` ~ `omo/09-build-distribution.md` | omo 심층 분석 10개 |
| `design-rationale.md` | 설계 근거 요약 (비판 + 설계를 통합 요약) |

### Nexus 지식 베이스 (.claude/nexus/)
| 파일 | 내용 |
|------|------|
| `knowledge/architecture.md` | 시스템 아키텍처 요약 |
| `knowledge/conventions.md` | 개발 컨벤션, Zod 스키마, 패키지 구조 |
| `knowledge/agents-catalog.md` | 에이전트 전체 카탈로그 (15개, Phase별 추가 계획) |
| `knowledge/workflows.md` | 3 프리미티브, 조합 패턴, 키워드 감지 |
| `knowledge/mcp-tools.md` | MCP 도구 API 상세 (파라미터, 사용 예시) |
| `knowledge/hook-modules.md` | 5개 훅 모듈 상세, Whisper 패턴 |
| `knowledge/decisions/dual-repository.md` | ADR: 이중 저장소 |
| `knowledge/decisions/context-levels.md` | ADR: 컨텍스트 수준 |
| `knowledge/decisions/hook-isolation-strategy.md` | ADR: 훅 격리 전략 |
| `knowledge/decisions/workflow-primitives.md` | ADR: 워크플로우 프리미티브 |
| `knowledge/decisions/bootstrapping.md` | ADR: 부트스트래핑 전략 |
| `plans/feature--reference-analysis.md` | 이 파일 |

## 다음 브랜치 예정
`feature/nexus-phase1` — Nexus MVP 구현:
1. `.claude-plugin/` 매니페스트
2. `hooks.json` (Gate 모듈)
3. MCP 서버 (Core 도구)
4. 에이전트 5개 (Lead, Builder, Finder, Architect, Guard)
5. 스킬 1개 (Nonstop)

### 전환 전략
- omc를 글로벌에서 삭제하지 않음
- 프로젝트 `.claude/settings.json`에서 omc 비활성화 + Nexus 활성화
- 다른 프로젝트에서는 omc 그대로 사용 가능
- 문제 발생 시 settings 변경만으로 omc 복귀 가능
- **확인 필요**: Claude Code가 프로젝트 레벨에서 글로벌 플러그인 훅을 완전히 비활성화하는지 (Phase 1 구현 시 테스트)
