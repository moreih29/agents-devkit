# 이슈 트리아지: upstream(nexus-core) vs local(claude-nexus)

**원칙**: 문제가 발생하면 **원인을 먼저 확정**한 뒤, 소스에 따라 처리 경로를 나눈다.

## 판단 기준

| 원인 위치 | 처리 |
|---|---|
| `@moreih29/nexus-core` canonical(스킬 본문, 에이전트 본문, MCP 도구 계약, vocabulary) | **nexus-core 리포에 이슈 등록** — `gh issue create -R moreih29/nexus-core …`. 여기서 직접 수정 금지. sync로만 수용. |
| claude-nexus 자체(플러그인 shell, hook 런타임, 빌드 파이프라인, `.claude-plugin/*`, `dist/*` 래핑, `test/e2e.sh`, 프로젝트 문서, `.nexus/`) | **직접 수정 + 커밋**. |
| 양쪽 걸침(예: canonical 계약 변경을 이 플러그인이 먼저 요구) | nexus-core 이슈로 제안 먼저 → 수용되면 sync로 반영. 우회가 급하면 플러그인 내부에 **임시 주석**과 함께 shim, 단 canonical 복구 시 제거 의무. |

## 원인 확정 절차 (흔한 함정 회피)

1. 증상이 나타난 파일의 **provenance**를 먼저 확인한다:
   - 스킬/에이전트/MCP 본문에 문제가 있으면 `git log`로 해당 파일이 sync 산출물인지 로컬 작성물인지 본다. sync 산출물이면 upstream.
   - `skills/*/SKILL.md`, `agents/*.md` (lead 제외), `dist/mcp/*` → 대부분 nexus-core sync 결과물.
   - `agents/lead.md`, `.claude-plugin/*`, `hooks/*`, `scripts/*`, `test/*`, `README*`, `CHANGELOG.md`, `.nexus/*` → 로컬.
2. v0.27.0 같은 과거 버전에서 동작했던 기능이 현재 깨졌다면 `git show v0.27.0:<path>`로 **diff 근거**를 확보한 뒤 이슈 본문에 인용한다.
3. Claude Code 하네스 자체의 도구 설명과 실제 동작이 엇갈리는 경우가 있다(예: SendMessage `never by UUID` 문구 vs 실측). 실측을 우선 신뢰하되, 이슈 본문에 두 소스를 모두 제시한다.

## 이슈 본문 구성(nexus-core로 올릴 때)

- **Summary** — 증상 한 단락.
- **Where** — 정확한 파일/라인 + 문제 문구 인용.
- **Empirical evidence** — 재현 표, 환경 전제(예: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`).
- **Impact** — 다운스트림 스킬/경로가 어떻게 조용히 실패하는지.
- **Suggested fix** — 최소 침습 수정안. 선택적으로 한 줄 주석 제안.
- 영어로 작성(nexus-core 컨벤션).

## 선례

- 2026-04-22: `skills/nx-plan/SKILL.md` Step 4.3의 `(or the name the Lead assigned)` 문구가 Lead에게 `SendMessage` resume 대상으로 name 저장을 유도해 resume이 조용히 실패하던 문제. v0.27.0 empirical 메모리에 기록된 UUID-only 규칙과 상충. 플러그인 로컬 수정 금지(스킬은 sync 산출물), nexus-core 이슈 #58로 등록.
