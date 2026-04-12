<!-- tags: code, test, docs, release -->
# Development Rules

## Code
- Edit/Write 도구만 사용하여 파일 수정 (Bash로 sed, echo > 등 금지)
- src/ 수정 후 반드시 `bun run dev`로 빌드 확인
- 타입 에러 남기지 않기 — `bun run build:types` 통과 필수

## Test
- 소스 변경 시 `bash test/e2e.sh` 통과 확인
- 기존 테스트 삭제 금지 — 수정만 허용

## Documentation
- `agents/*.md`, `skills/*/SKILL.md`, `src/data/tags.json`은 `@moreih29/nexus-core` build-time 생성물 — 직접 수정 금지, 수정은 upstream에서 (세부: `.nexus/context/architecture.md`)
- **예외**: `skills/nx-setup/SKILL.md`는 nexus-core v0.3.0부터 consumer-owned — 직접 수정 가능
- `templates/nexus-section.md`와 CLAUDE.md의 `<!-- NEXUS:START -->`~`<!-- NEXUS:END -->` 블록은 `generate-template.mjs`가 자동 생성 — 직접 수정 금지
- README는 한국어(README.md) + 영어(README.en.md) 동시 유지

## Upstream (@moreih29/nexus-core)
- **기준 문서**: https://github.com/moreih29/nexus-core/blob/main/CONSUMING.md — 항상 이 문서를 참조하여 업그레이드 진행
- `package.json`의 `@moreih29/nexus-core` 버전 변경 감지 시:
  1. `node_modules/@moreih29/nexus-core/manifest.json` 읽기
  2. WebFetch `https://github.com/moreih29/nexus-core/blob/v{새버전}/CONSUMING.md` → Upgrade Protocol 따르기
  3. CHANGELOG의 `<!-- nx-car:v{X.Y.Z}:start -->` 마커로 breaking changes 확인
  4. MIGRATIONS/ 디렉토리에 마이그레이션 가이드 있으면 참조

## Release
- 배포 전 /deploy 스킬로 pre-release 검증 필수
