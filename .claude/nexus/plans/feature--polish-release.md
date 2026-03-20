# Plan: feature/polish-release

## 목표
Code Intel 확장 + Pulse 최적화 + v0.2.0 릴리즈 준비.

## 완료 조건
- [x] LSP document_symbols + workspace_symbols 추가
- [x] Pulse 선택적 스킵 (워크플로우 비활성 시 fast path)
- [x] 버전 0.2.0 + CHANGELOG.md
- [x] knowledge 문서 동기화
- [x] E2E 테스트 확장
- [x] 빌드 + 캐시 동기화

## Unit 1: LSP 도구 확장 (+2)

### nx_lsp_document_symbols
파일 내 모든 심볼 목록 (함수, 클래스, 인터페이스 등).
```typescript
nx_lsp_document_symbols({ file: "src/hooks/gate.ts" })
→ [{ name: "handleStop", kind: "Function", line: 15 }, ...]
```

### nx_lsp_workspace_symbols
프로젝트 전체에서 심볼 검색.
```typescript
nx_lsp_workspace_symbols({ query: "Context" })
→ [{ name: "ContextMessage", file: "src/hooks/pulse.ts", line: 70 }, ...]
```

## Unit 2: Pulse fast path
워크플로우 비활성 + 에이전트 비활성 시 상태 파일 읽기 생략.

```typescript
// fast path: 세션 디렉토리에 상태 파일이 하나도 없으면 즉시 pass
const sessionPath = sessionDir(sid);
if (!existsSync(sessionPath)) { pass(); return; }
```

추가로 guidance 메시지만 있고 workflow 메시지가 없는 경우,
adaptive threshold 이전이면 guidance만 빠르게 반환.

## Unit 3: 릴리즈 준비
- package.json: version 0.1.0 → 0.2.0
- CHANGELOG.md 생성
- architecture.md: Code Intel 섹션을 "별도 패키지"에서 "통합"으로 업데이트
- README.md: Code Intel 사용법 추가
