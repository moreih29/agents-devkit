<!-- tags: plugin, integration, context-delivery -->
# Plugin Architecture

Claude Code와 3개 진입점으로 통합:
- **Gate Hook** — 이벤트 기반 인터셉터. 태그 감지 → 모드 라우팅 → 컨텍스트 주입
- **MCP Server** — 도구 등록 게이트웨이. 태스크, 플랜, 코드 인텔리전스 등 구조화된 오퍼레이션 노출
- **Statusline** — 실시간 상태 표시. 브랜치, 태스크 수, 플랜 상태

## 핵심 설계 원칙

**단계별 컨텍스트 전달 (Staged Context Delivery)**: 컨텍스트는 정적이 아님. 런타임 상태(tasks.json, plan.json, .nexus/ 파일)에서 계산되어 결정 시점에 주입됨.

- SessionStart: 구조 초기화
- SubagentStart: .nexus/ 지식 인덱스 lazy-load
- UserPromptSubmit: 태그 감지 → 모드별 가이던스 주입
- PostCompact: 세션 상태 스냅샷 복원

**비차단 가이던스 (Non-blocking Guidance)**: gate.ts는 additionalContext로 "넛지"를 전달. 하드 에러가 아닌 스마트 기본값 제공. 사용자는 무시할 수 있음.

**빌드 파이프라인**: src/ → esbuild 단일 번들 → bridge/mcp-server.cjs + scripts/{gate,statusline}.cjs. 템플릿(nexus-section.md)은 generate-template.mjs가 agents/, skills/, tags.json 메타데이터에서 자동 생성.
