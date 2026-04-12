# Refactor Carryover — nexus-core consumer transition

**원본 PR**: plan session #4 실행 결과 3-commit refactor
(`31d0822` infra, `94997d1` agents, `7127a33` skills+tags)

**목적**: claude-nexus가 `@moreih29/nexus-core^0.1.2`를 build-time consumer로 전환하면서 남은 이월 작업을 기록. 향후 세션이 이 파일을 참조해 순차적으로 처리한다.

**상태 마커**: `[ ]` pending / `[~]` in progress / `[x]` done (완료 시 체크)

---

## [x] CA-1 — nexus-core tags.yml trigger/id 일관성 validation (nexus-core 이슈)

**심각도**: warning
**트리거**: nexus-core upstream issue filing 후 nexus-core 측 응답
**해결**: nexus-core v0.2.0에서 Gate 11 validation 추가됨 (CHANGELOG "Gate 11 validation for tags.yml consistency"). Upstream issue #2 CLOSED.

**claude-nexus workaround 유지**: `transformTags()`의 bracket-strip은 그대로 둠 (무해하며 방어적).

**Upstream link**: https://github.com/moreih29/nexus-core/issues/2

---

## [x] CA-2 — SKILL_PURPOSE_OVERRIDE upstream 메커니즘 (nexus-core 이슈)

**심각도**: warning
**트리거**: nexus-core upstream issue filing 후 nexus-core 측 응답
**해결**: nexus-core v0.2.0에서 manifest.json skill entries에 `summary` 필드 추가됨. claude-nexus `SKILL_PURPOSE_OVERRIDE` 상수 제거, `transformSkill()`이 `manifestEntry.summary`를 purpose로 사용하도록 전환 완료. Upstream issue #2 CLOSED.

**Upstream link**: https://github.com/moreih29/nexus-core/issues/2

---

## [ ] CA-3 — installed_plugins.json 중복 정리

**심각도**: note (런타임 문제 아님)
**트리거**: 여유 시간 + plugin 재설치 필요한 시점

**현상**:
`~/.claude/plugins/installed_plugins.json`에 `claude-nexus@nexus` 엔트리가 project scope와 user scope 모두 등록되어 있음. 두 엔트리 모두 동일 installPath(`.../cache/nexus/claude-nexus/0.25.0`)를 참조하므로 런타임 동작은 정상이지만, 의도치 않은 중복일 가능성이 높음.

**claude-nexus workaround**: 해당 없음 (런타임 문제 아님, 정리 전까지 무해).

**해결 방향**:
한 scope만 남기도록 수동 정리. 또는 `/plugin uninstall claude-nexus` 후 재설치.

---

## [ ] CA-4 — Claude Code strict-schema 모니터링 (지속 risk)

**심각도**: critical (발생 시) / dormant (평상시)
**트리거**: Claude Code release notes에서 frontmatter schema 변경 언급

**현상**:
현재 9 agents/*.md는 Claude Code 공식 스펙이 아닌 필드 4개를 포함:
- `task`, `alias_ko`, `category`, `resume_tier`

5 skills/*/SKILL.md도 2개:
- `trigger_display`, `purpose`

현재 Claude Code parser는 "lenient"하여 unknown 필드를 무시하고 통과시킨다. 하지만 미래에 strict-schema 정책으로 바뀌면 **9 agents + 5 skills 전부가 로드 실패**.

**claude-nexus workaround**: 해당 없음 (현재는 암묵적으로 lenient parser에 의존하는 dormant risk. 실제 발생 시 아래 "대응 플랜"으로 전환).

**대응 플랜**:
1. 감지 시 `generate-from-nexus-core.lib.mjs`의 `FIELD_ORDER`/`SKILL_FIELD_ORDER`에서 unknown 필드 제거
2. `generate-template.mjs`가 `task`/`purpose` 같은 CLAUDE.md 렌더링용 필드를 agents/*.md frontmatter가 아닌 **`manifest.json` 또는 별도 JSON**에서 읽도록 재배선
3. 재빌드 후 전체 재생성

예상 수정 범위: lib.mjs 20줄 + generate-template.mjs 20줄

**모니터링 지점**: Claude Code release notes + https://code.claude.com/docs/en/sub-agents 공식 문서 변경 추적

---

## [x] CA-5 — nx-init 동작 변화 CHANGELOG 기재 (2026-04-11, v0.25.1 release)

**심각도**: user-facing
**트리거**: VERSION 0.25.1 bump PR 작성 시점

**현상**:
refactor 이후 `skills/nx-init/SKILL.md`에 `disable-model-invocation: true` 필드가 추가되었다. 이전에는 Claude가 "이 프로젝트 setup해줘" 같은 ambiguous 프롬프트에서 nx-init skill을 자동 활성화할 수 있었지만, **이제는 명시적으로 `/claude-nexus:nx-init`를 타이핑해야** 한다.

**claude-nexus workaround**: 해당 없음 (의도된 drift repair. nexus-core canonical `manual_only: true`와 정합).

**필요 조치**:
0.25.1 CHANGELOG entry에 다음 명시:
```
### Changed
- **nx-init** is now manual-only (`disable-model-invocation: true`).
  Invoke explicitly with `/claude-nexus:nx-init`. Previously Claude could
  auto-trigger it on ambiguous "project setup" prompts. This aligns with
  nexus-core canonical metadata (manual_only: true).
```

---

## [ ] CA-6 — Pre-commit tag drift hook

**심각도**: low
**트리거**: 첫 drift가 commit에 포함돼 발견되는 시점 (deferred 무기한)

**현상**:
Tag drift detection은 `bun run build` 시점에 `verifyTagDrift()`가 throw. 하지만 개발자가 `src/hooks/gate.ts` 또는 `generate-from-nexus-core.lib.mjs`를 편집한 뒤 build 없이 commit + push하면 drift가 detection 없이 ship 가능.

**claude-nexus workaround**: 해당 없음 (현재는 개발자 규율에 의존. `bun run build` 또는 CI에서 실행 시 감지).

**해결 방향**:
`.git/hooks/pre-commit` 스크립트 추가:
```sh
#!/bin/sh
if git diff --cached --name-only | grep -qE '^(src/hooks/gate\.ts|generate-from-nexus-core\..+\.mjs)$'; then
  bun run build:types || exit 1
  bun run build --dry-run 2>&1 | grep -q "Tag drift" && exit 1
fi
exit 0
```

우선순위 낮음 — drift가 실제로 commit에 들어간 적이 1회라도 생긴 시점에 도입.

---

## [x] CA-7 — harness extension point upstream proposal (HARNESS:* marker convention)

**심각도**: enhancement
**트리거**: nexus-core maintainer 응답 (issue #4)
**해결**: nexus-core v0.2.0에서 `harness_docs_refs` 필드가 skill manifest에 추가됨 (nx-plan, nx-run 모두 `["resume_invocation"]`). Issue #4 CLOSED. 마커 삽입(HARNESS:*) 대신 메타데이터 참조 방식을 채택 — consumer가 `harness_docs_refs`를 읽어 로컬 콘텐츠를 주입하는 구현은 별도 cycle로 진행.

**Upstream link**: https://github.com/moreih29/nexus-core/issues/4

**잔여 consumer 구현 (별도 cycle)**:
1. `harness-content/resume_invocation.md` 파일 배치 (subagent resume syntax 본문)
2. `transformSkill()`에서 `harness_docs_refs` 읽어 body 끝에 harness-content 주입
3. e2e 테스트 추가

---

## 관련 파일/커밋 참조

- **Plan session**: `.nexus/history.json`의 plan #4 (topic: "claude-nexus를 nexus-core consumer로 전환")
- **Refactor commits**: `31d0822`, `94997d1`, `7127a33` (main branch)
- **Production cache**: `~/.claude/plugins/cache/nexus/claude-nexus/0.25.0/` (post-refactor)
- **Pre-refactor backup**: `/tmp/nx-0.25.0-backup/` (48시간 유지, CA-5 VERSION bump 시점에 삭제)
- **Upstream issue draft**: `.nexus/memory/upstream-issue-draft.md` (다른 writer가 병렬 작성 중)
