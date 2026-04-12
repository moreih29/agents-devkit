# Refactor Carryover — nexus-core consumer transition

**원본 PR**: plan session #4 실행 결과 3-commit refactor
(`31d0822` infra, `94997d1` agents, `7127a33` skills+tags)

**목적**: claude-nexus가 `@moreih29/nexus-core^0.1.2`를 build-time consumer로 전환하면서 남은 이월 작업을 기록. 향후 세션이 이 파일을 참조해 순차적으로 처리한다.

**상태 마커**: `[ ]` pending / `[~]` in progress / `[x]` done (완료 시 체크)

---

## [ ] CA-1 — nexus-core tags.yml trigger/id 일관성 validation (nexus-core 이슈)

**심각도**: warning
**트리거**: nexus-core upstream issue filing 후 nexus-core 측 응답

**현상**:
nexus-core `vocabulary/tags.yml`에서 tag entry의 `id`와 `trigger` 필드가 독립적으로 존재한다. 예를 들어:
- `id: m-gc` (kebab form, schema validation용)
- `trigger: "[m:gc]"` (colon form, 실제 display/invocation 형태)

이 두 필드의 일관성을 validate.ts가 체크하지 않아, 작성자가 실수로 `trigger: "[m_gc]"` 같은 잘못된 값을 입력해도 통과된다.

**claude-nexus workaround**:
`generate-from-nexus-core.lib.mjs`의 `transformTags()`에서 `t.trigger`를 bracket-strip 하여 display form(`m:gc`)을 보존. `t.id`(`m-gc`)를 그대로 쓰면 gate.ts의 `[m:gc]` 정규식과 불일치해 런타임 에러.

**해결 방향**:
nexus-core `validate.ts`에 Gate 11 추가:
- 각 tag entry에 대해 `trigger === "[" + id + "]"` assert, OR
- 명시적 display variant 필드 도입

**Upstream link**: https://github.com/moreih29/nexus-core/issues/2

---

## [ ] CA-2 — SKILL_PURPOSE_OVERRIDE upstream 메커니즘 (nexus-core 이슈)

**심각도**: warning
**트리거**: nexus-core upstream issue filing 후 nexus-core 측 응답

**현상**:
nexus-core `skills/*/meta.yml`은 `description` 한 필드만 제공. consumer(claude-nexus)가 CLAUDE.md 테이블 렌더링에 사용할 **짧고 punchy한 summary 문자열**은 별도로 유지해야 함. 현재 `generate-from-nexus-core.lib.mjs`에 `SKILL_PURPOSE_OVERRIDE` 5-entry 하드코딩 테이블로 처리.

**claude-nexus workaround**:
```js
const SKILL_PURPOSE_OVERRIDE = {
  'nx-init':  'Full project onboarding: scan codebase, establish project mission and essentials, generate context knowledge',
  'nx-plan':  'Structured planning — subagent-based analysis, deliberate decisions, produce execution plan',
  // ... 3 more entries
};
```

upstream nexus-core가 skill meta를 변경하면 이 테이블이 stale해질 위험. 다만 현재 5 entries라 drift 가능성 낮음.

**해결 방향**:
nexus-core `skills/*/meta.yml`에 optional 필드 추가:
- 제안 A: `harness_display.purpose` (harness-specific short label)
- 제안 B: `description_short` (language-neutral summary)

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

## [ ] CA-7 — harness extension point upstream proposal (HARNESS:* marker convention)

**심각도**: enhancement
**트리거**: nexus-core maintainer 응답 (issue #4)

**현상**:
Claude Code subagent resume invocation syntax(`SendMessage({to: agentId, ...})`)가 실제로 작동하지만 nexus-core skill body 어디에도 문서화되어 있지 않음. 유일한 지식은 claude-nexus dev memo `.nexus/memory/subagent-resume.md`(2026-04-09 검증, 2026-04-10 업데이트)에만 존재해 플러그인 사용자는 접근 불가. nx-run "Resume Dispatch Rule"과 nx-plan "Resume Policy" 섹션이 *언제* resume할지는 설명하나 *어떻게* 호출할지는 빠져 있어, Lead가 generated SKILL.md만 보고는 `to: name`(잘못)과 `to: agentId`(올바름)를 구분 못 함.

**claude-nexus workaround**: 해당 없음 — upstream 응답 대기 중. claude-nexus가 generated `skills/*/SKILL.md`를 직접 편집하면 build 시 덮어쓰임(generated 파일 직접 편집 금지 룰).

**해결 방향**:
nexus-core에 `HARNESS:*` extension point 메커니즘 도입 제안. Plan #4(session 2)의 결정 요약:
- `vocabulary/harness_keys.yml` 신설(neutral allowlist, capabilities.yml/tags.yml과 같은 vocabulary 층위) + body에 self-closing `<!-- HARNESS:resume_invocation -->` 마커
- warn(unhandled) / throw(unknown) 분할 — sibling 비동기 릴리스 window 지원, 오타는 fail-fast
- 5개 무결성 안전장치: self-closing single-line marker, add-only non-marker line preservation, max_lines/max_bytes 상한, 재귀 금지, 로깅+e2e unit test
- consumer 측 구현은 `harness-content/<key>.md` 파일 구조(파일 존재 = implemented), transformSkill에서 `verifyBodyHash` 이후 호출

제안 문서: `.nexus/memory/upstream-issue-harness-extension.md`(전체 9 섹션 + 6 open questions)

**Upstream link**: https://github.com/moreih29/nexus-core/issues/4

**후속 작업 (nexus-core 수용 시, 별도 cycle)**:
1. nexus-core가 `vocabulary/harness_keys.yml` + `skills/nx-run/body.md` + `skills/nx-plan/body.md` + `manifest.json` body_hash 갱신 → release (primer §5.1 기준 major bump 권장)
2. claude-nexus `package.json` devDependency bump
3. `generate-from-nexus-core.lib.mjs`에 `injectHarnessMarkers` 함수 추가 (vocabulary/harness_keys.yml 로딩 + 5 안전장치 enforcement)
4. `harness-content/resume_invocation.md` 파일 배치 (Plan #4 Issue #3 결정된 5-line 본문)
5. `bun run build` 후 regenerate된 `skills/nx-run/SKILL.md`와 `skills/nx-plan/SKILL.md`에 resume invocation 본문이 주입됐는지 확인
6. `bash test/e2e.sh` + `injectHarnessMarkers` 단위 테스트 추가

---

## 관련 파일/커밋 참조

- **Plan session**: `.nexus/history.json`의 plan #4 (topic: "claude-nexus를 nexus-core consumer로 전환")
- **Refactor commits**: `31d0822`, `94997d1`, `7127a33` (main branch)
- **Production cache**: `~/.claude/plugins/cache/nexus/claude-nexus/0.25.0/` (post-refactor)
- **Pre-refactor backup**: `/tmp/nx-0.25.0-backup/` (48시간 유지, CA-5 VERSION bump 시점에 삭제)
- **Upstream issue draft**: `.nexus/memory/upstream-issue-draft.md` (다른 writer가 병렬 작성 중)
