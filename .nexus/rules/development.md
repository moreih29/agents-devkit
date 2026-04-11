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
- `agents/*.md`, `skills/*/SKILL.md`, `src/data/tags.json`은 `@moreih29/nexus-core` build-time 생성물 — 직접 수정 금지, 수정은 upstream `agents/*/body.md`, `skills/*/body.md`, `vocabulary/tags.yml`에서 (세부: `.nexus/context/architecture.md`)
- `templates/nexus-section.md`와 CLAUDE.md의 `<!-- NEXUS:START -->`~`<!-- NEXUS:END -->` 블록은 `generate-template.mjs`가 자동 생성 — 직접 수정 금지
- README는 한국어(README.md) + 영어(README.en.md) 동시 유지

## Release
- 배포 전 /deploy 스킬로 pre-release 검증 필수
