# Plan: feature/phase3-agents

## 목표
부트스트랩에 필요한 Phase 3 에이전트 2개 추가 + auto clear 정리.

## 완료 조건
- [x] Tester 에이전트 (테스트 엔지니어)
- [x] Writer 에이전트 (문서 작성)
- [x] Lead 라우팅 업데이트
- [x] Pulse AGENT_CONTEXT_LEVELS 업데이트
- [x] auto clear에서 auto.json 탐색 제거 (pipeline + nonstop만)
- [x] E2E 테스트
- [x] knowledge 문서 반영

## Unit 1: Tester 에이전트
파일: `agents/tester.md`
- tier: medium, context: standard, model: sonnet
- 역할: 테스트 작성, 테스트 수정, 커버리지 분석
- E2E/unit/integration 테스트 전반 담당

## Unit 2: Writer 에이전트
파일: `agents/writer.md`
- tier: low, context: minimal, model: haiku
- 역할: 문서 작성, knowledge 업데이트, README/CLAUDE.md 관리
- READ-ONLY 아님 (문서 파일은 직접 수정)

## Unit 3: 시스템 연동
- `agents/lead.md` 라우팅에 Tester, Writer 추가
- `src/hooks/pulse.ts` AGENT_CONTEXT_LEVELS에 tester: standard, writer: minimal 추가
- `src/mcp/tools/state.ts` auto clear에서 auto.json 제거 (pipeline + nonstop만)

## Unit 4: 테스트 + 문서
- `test/e2e.sh` — Pulse 컨텍스트 수준 테스트에 writer(minimal) 케이스 추가
- knowledge 문서 — sync-knowledge 스킬로 불일치 탐지 후 수정
