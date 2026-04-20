<!-- tags: code, test, docs, release -->
# Development Rules

## Code
- Edit/Write 도구만 사용하여 파일 수정 (Bash로 sed, echo > 등 금지)
- Managed 산출물(`agents/`, `skills/`, `hooks/`, `dist/hooks/`, `settings.json`) 직접 편집 금지 — 수정은 upstream nexus-core에서
- sync 후 `bun run validate` 통과 확인

## Test
- 소스 변경 시 `bash test/e2e.sh` 통과 확인 (smoke 수준)
- 기존 테스트 삭제 금지 — 수정만 허용

## Documentation
- `agents/`, `skills/`, `hooks/`, `dist/hooks/`, `settings.json`은 nexus-core sync Managed 산출물 — 직접 수정 금지, 수정은 upstream에서 (세부: `.nexus/context/architecture.md`)
- `.claude-plugin/plugin.json`·`marketplace.json`은 Template 산출물 — 최초 1회 sync가 생성 후 consumer 소유, 자유 편집 가능
- README는 한국어(README.md) + 영어(README.en.md) 동시 유지

## Upstream (@moreih29/nexus-core)
- **기준 문서**: https://github.com/moreih29/nexus-core/blob/main/docs/plugin-guide.md
- **기준 계약**: https://github.com/moreih29/nexus-core/blob/main/docs/contract/harness-io.md (Claude §4-1)
- `package.json`의 `@moreih29/nexus-core` 버전 변경 감지 시:
  1. `bun install`
  2. `bun run sync`
  3. `bun run validate` 통과 확인
  4. `bunx @moreih29/nexus-core list`로 제공 자산 개수 확인
  5. CHANGELOG 확인 후 consumer action 필요 항목 식별

## Release
- release.mjs 실행 전 git status clean + `bun run validate` 통과 필수
