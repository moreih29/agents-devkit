# Plan: feature/code-intel-expand

## 목표
Code Intel 다언어 지원 + AST replace + LSP 멀티 클라이언트.

## 완료 조건
- [x] LSP 멀티 클라이언트 (언어별 클라이언트 맵)
- [x] LSP 서버 탐색 강화 (common paths fallback)
- [x] AST replace 도구 추가
- [x] Python/Rust/Go LSP 검증 (nexus-test에서 테스트 프로젝트)
- [x] E2E 테스트 확장
- [x] 빌드 + 캐시 동기화

## Unit 1: LSP 멀티 클라이언트
현재: 싱글톤 LspClient → 프로젝트 첫 감지 언어만 지원.
변경: `Map<Language, LspClient>` → 파일 확장자로 언어 판별 → 해당 클라이언트 자동 선택.

- `lsp.ts`의 `ensureClient()` → `ensureClientForFile(file)` 변경
- 파일 확장자 → Language 매핑 (detect.ts의 `getLanguageFromExt()`)
- 클라이언트가 없으면 새로 생성, 있으면 재사용

## Unit 2: LSP 서버 탐색 강화
`detect.ts`에 `resolveCommand()` 추가:
1. PATH에서 먼저 찾기
2. 없으면 common paths 탐색: `~/go/bin/`, `~/.cargo/bin/`, `~/.local/bin/`
3. 없으면 npx fallback (typescript-language-server)
4. 최종 실패 시 에러 메시지에 설치 명령 안내

## Unit 3: AST replace
`ast.ts`에 `nx_ast_replace` 추가:
```typescript
nx_ast_replace({ pattern, replacement, language?, path?, dryRun? })
→ 매칭 → 치환 → 변경된 파일 목록
```
dryRun=true 시 치환 없이 매칭만 반환.

## Unit 4: 다언어 검증
`~/workspaces/projects/nexus-test/`에 미니 프로젝트 생성:
- `hello.py` + `pyproject.toml` → Python LSP/AST
- `hello.rs` + `Cargo.toml` → Rust LSP/AST
- `hello.go` + `go.mod` → Go LSP/AST
각각 hover, find_references, ast_search 테스트.
