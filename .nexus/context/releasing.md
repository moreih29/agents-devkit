# Releasing claude-nexus

`claude-nexus`는 npm + Claude Code 플러그인 마켓플레이스 두 채널로 동시 배포된다. 태그 푸시가 OIDC Trusted Publishing으로 npm 공개를 트리거하고, 마켓플레이스 사용자는 `/plugin update`로 새 버전을 받는다.

아래 체크리스트는 배포 1회 기준이다. **구체 파일명·개수·사이즈에 의존하지 않도록 의도적으로 추상화했으므로, 내용물이 바뀌어도 문서는 변경할 필요가 없다**. 단계별로 훑고, 실패 시 PR을 반려해 다시 시작한다.

---

## 1. 버전 정합성

모두 같은 `X.Y.Z`인가:

- [ ] `package.json` `"version"`
- [ ] `.claude-plugin/plugin.json` `"version"`
- [ ] `.claude-plugin/marketplace.json` `plugins[0].version`
- [ ] 푸시할 git 태그 `vX.Y.Z`

Semver 판단은 적절한가:

- [ ] 사용자·컨슈머가 직접 조치해야 하는 변경이 있으면 **major** bump
- [ ] 하위 호환 기능 추가는 **minor** bump
- [ ] 버그 수정·내부 개선만이면 **patch** bump
- [ ] 주요 의존 패키지의 메이저 bump를 흡수했다면 이쪽도 major 고려

---

## 2. 기계적 검증

로컬에서 clean 상태로 통과하는가:

- [ ] `bun run clean`
- [ ] `bun install --frozen-lockfile` — `bun.lock`이 `package.json`과 일치
- [ ] `bun run build` — 실패 없음
- [ ] `bun run typecheck` — 실패 없음
- [ ] `bun run test` — e2e 전부 `ok` (산출물 구조·도구 노출·훅 동작 검증은 e2e가 담당)

CI에서도 통과하는가:

- [ ] `Validate` 워크플로 PR에서 초록불
- [ ] (병합 후) `Publish` 워크플로 태그 푸시에서 초록불

---

## 3. 산출물·배포 경로 위생

플러그인이 `node_modules` 없이 동작하는가:

- [ ] 빌드 산출물(`dist/`, `scripts/` 내 번들)이 전부 최신이고 git에 커밋되어 있다
- [ ] 번들된 CLI 진입점은 shebang + 실행권한 보존
- [ ] `package.json` `files[]`가 실제 ship 대상과 일치 (빠진 디렉터리·불필요한 디렉터리 없음)
- [ ] `package.json` `bin` 엔트리가 존재하는 실행 가능 파일을 가리킨다

경로 치환이 올바른가:

- [ ] 플러그인-scoped config(`.mcp.json`, `hooks/hooks.json`, 기타 support하는 파일)에서만 `${CLAUDE_PLUGIN_ROOT}` 사용
- [ ] 치환된 경로가 배포 트리에 실제 존재
- [ ] 사용자 파일을 읽거나 쓰는 로직은 사용자 프로젝트 디렉터리(stdin `cwd` 등) 기반 — 플러그인 캐시 디렉터리에 쓰지 않는다

---

## 4. 산출물이 이번 릴리스의 의도와 일치

- [ ] 빌드·sync 스크립트를 다시 돌려도 `git status`가 깨끗하다 (이미 최신 상태로 수렴)
- [ ] 이번 릴리스가 의도한 변경이 diff에 전부 반영되어 있다
- [ ] 의도하지 않은 변경이 섞여 있지 않다 (관련 없는 파일 수정·임시 파일·디버그 코드)

---

## 5. 문서·메시징

- [ ] `CHANGELOG.md`에 `## [X.Y.Z] - YYYY-MM-DD` 섹션 추가
- [ ] Consumer action required가 있으면 섹션 제목·본문에 **명시적으로** 표기
- [ ] `README.md`·`README.en.md`가 이번 릴리스의 변경을 반영
- [ ] 예시 출력·명령 스니펫이 실제 동작과 일치
- [ ] `LICENSE` 연도·저작권자 최신

---

## 6. Git 위생

- [ ] `git status`에 `D`·stage되지 않은 수정 없음 — 변경은 전부 commit됨
- [ ] 실수 커밋 방지: 런타임 상태·빌드 부산물·로컬 임시 파일이 staged에 없음
- [ ] HEAD에 stale 파일이 없음 — 마켓플레이스는 GitHub default 브랜치를 클론하므로 지워야 할 파일은 병합 전 반드시 삭제 커밋
- [ ] 현재 브랜치가 `fix/*` 또는 `feat/*` (직접 main에 푸시 금지)
- [ ] PR 설명에 릴리스 의도·주요 변경·리스크가 명시됨

---

## 7. 배포 드라이런 (선택, 리스크 큰 릴리스)

실제 소비자 흐름을 시뮬레이션:

- [ ] `bun pm pack`으로 tarball 생성
- [ ] 빈 임시 디렉터리에서 해당 tarball을 `bun add`로 설치 → bin 엔트리가 정상 등록되는지 확인
- [ ] 플러그인 경로: `claude --plugin-dir .`으로 현재 작업 트리를 로드해 `/plugin`·`/agents`·대표 태그 한두 개를 수동 점검

---

## 8. 태깅·배포

PR이 main으로 병합된 뒤:

- [ ] `git checkout main && git pull`
- [ ] `git log -1 --oneline` — 병합 커밋이 기대한 것 맞는지 확인
- [ ] `git tag vX.Y.Z && git push origin vX.Y.Z`
- [ ] `Publish` 워크플로 초록불 대기
- [ ] `gh release create vX.Y.Z --notes "$(awk '/^## \[X.Y.Z\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md)"`

---

## 9. 배포 후 확인

- [ ] `npm view claude-nexus version` → `X.Y.Z`
- [ ] bin 엔트리를 캐시 비운 상태에서 호출했을 때 새 버전이 표시됨
- [ ] Claude Code에서 `/plugin update claude-nexus` → 정상 설치
- [ ] 설치본에서 대표 진입점(에이전트 목록·플러그인 활성 상태·대표 태그)을 1회씩 smoke
- [ ] 이슈 보고 채널(GitHub Issues) 모니터 1–2일

---

## 10. 롤백 기준

아래 조건이면 즉시 후속 패치 릴리스를 내거나 npm `deprecate`를 고려한다:

- MCP 서버가 부팅 실패 (사용자 사이드에서 `.mcp.json` 등록 에러 리포트 다수)
- 훅이 세션을 차단 (exit non-zero로 세션 시작 불가)
- statusline 또는 기타 bin이 Claude Code 세션을 hang 시키거나 무한 루프
- 표준 워크플로가 작동 불가 (필수 산출물 누락 또는 부팅 실패)
- 사용자 데이터 손상 (`.nexus/` 하위 파일 파괴)

---

참고:

- 공식 npm Trusted Publishing: `publish-npm.yml`이 OIDC로 처리, secret 불필요
- 마켓플레이스 경로: `/plugin marketplace add moreih29/claude-nexus` → `/plugin install claude-nexus@nexus`
- 주요 감사 결과는 PR 본문에 남긴다
