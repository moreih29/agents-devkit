# Nexus 설계 근거 요약

이 문서는 omc/omo 분석을 거쳐 Nexus 설계에 도달한 과정의 요약이다.
상세 설계는 `.claude/nexus/knowledge/`에, 레퍼런스 분석은 `omc/`, `omo/`에 있다.

---

## omc 핵심 장점 (Nexus가 채택한 것)
- **Claude Code 네이티브 플러그인 포맷**: plugin.json, hooks.json, agents/*.md, skills/, .mcp.json
- **Agent-as-Markdown**: 선언적 에이전트 정의. frontmatter + 본문 프롬프트
- **세션 격리 상태 관리**: 세션 ID별 상태 파일 분리, staleness TTL
- **Hook I/O 프로토콜**: stdin/stdout JSON 표준. 언어 무관

## omc 핵심 단점 (Nexus가 해결한 것)
- **이중 프로세스 스폰 오버헤드** → 단일 CJS 스크립트 + Phase별 최적화 전략
- **10개 실행 모드의 복잡성** → 3 프리미티브(Sustain/Parallel/Pipeline) 조합
- **네이밍 혼란 (ralph, boulder, Sisyphus)** → 기능 기반 이름 (Lead, Builder 등)
- **context 오염 (system-reminder 폭탄)** → Whisper 패턴 (중복 방지 + 적응적 상세도)
- **장기 지식 소실 (.omc/ gitignore)** → 이중 저장소 (.claude/nexus/ git 추적)

## omo 핵심 장점 (Nexus가 참고한 것)
- **팩토리 패턴 일관성**: `createXXX()` 패턴
- **Zod 스키마 설정 검증**: 런타임 검증 + 타입 추론 + JSON Schema
- **Atlas 오케스트레이터**: 직접 코드 작성 방지, delegation 강제
- **Multi-model 지원**: 다양한 모델 프로바이더 활용

## omo 핵심 단점 (Nexus가 회피한 것)
- **OpenCode 종속성** → Claude Code 네이티브로 구축
- **그리스 신화 네이밍** → 기능 기반 네이밍
- **단일 파일 복잡성 집중 (1000줄+)** → 모듈 분리
- **Bun 전용** → Node.js 기반

## 핵심 설계 결정 요약

| 결정 | 선택 | 근거 (상세: knowledge/decisions/) |
|------|------|----------------------------------|
| 저장소 분리 | git + gitignore 이중 구조 | 장기 지식은 공유, 세션 상태는 휘발 |
| 컨텍스트 수준 | minimal/standard/full | 역할별 최적화된 컨텍스트 주입 |
| 훅 격리 | 별도 프로세스 + Phase별 최적화 | Claude Code 제약, 성능은 점진적 개선 |
| 워크플로우 | 3 프리미티브 조합 | 10개 모드의 본질을 3가지로 분해 |
| 부트스트래핑 | omc 비활성화 → Nexus 활성화 | 프로젝트 레벨 설정으로 양방향 전환 |

---

*이 문서는 설계 과정의 기록이다. 실행 가능한 설계 상세는 `.claude/nexus/knowledge/`를 참조.*
