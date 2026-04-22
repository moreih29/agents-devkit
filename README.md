# claude-nexus

[![npm version](https://img.shields.io/npm/v/claude-nexus)](https://www.npmjs.com/package/claude-nexus)
[![license](https://img.shields.io/badge/license-MIT-blue)](https://github.com/moreih29/claude-nexus/blob/main/LICENSE)

> 🌏 [English](README.en.md)

Claude Code용 Nexus 에이전트 오케스트레이션 플러그인. [nexus-core](https://github.com/moreih29/nexus-core)의 canonical 에이전트·스킬·MCP 서버를 Claude 하네스에 등록한다.

## 무엇이 들어 있나

- **에이전트 10종**: architect · designer · engineer · **lead** · postdoc · researcher · reviewer · strategist · tester · writer
- **스킬 3종**: `nx-auto-plan` · `nx-plan` · `nx-run` — `[plan]`·`[auto-plan]`·`[run]` 태그로 활성화
- **MCP 서버 `nexus-core`**: 플래닝·태스크·이력·아티팩트 상태 관리 도구 13종 (`nx_plan_*`·`nx_task_*`·`nx_history_search`·`nx_artifact_write`)
- **훅 2종**:
  - `SessionStart` — `.nexus/` 폴더 구조와 화이트리스트 `.gitignore` 보장
  - `UserPromptSubmit` — 태그 6종 (`[plan]`·`[auto-plan]`·`[run]`·`[m]`·`[m:gc]`·`[d]`) 라우팅
- 활성화 시 `lead` 에이전트가 메인 스레드가 되도록 `settings.json` 기본 포함

### 필요 설정

서브에이전트 resume(SendMessage) 기능을 쓰려면 Claude Code 세션에 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 환경 변수가 필요하다 (Claude Code가 플러그인 `settings.json`의 `env`는 적용하지 않으므로 사용자가 설정). `~/.claude/settings.json` 또는 프로젝트 `.claude/settings.json`에 추가:

```json
{
  "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
}
```

## 설치

Claude Code 안에서 플러그인 마켓플레이스로 설치한다.

```
/plugin marketplace add moreih29/claude-nexus
/plugin install claude-nexus@nexus
```

## 사용

설치 후 새 Claude Code 세션을 열면 `lead` 에이전트가 메인 스레드로 실행된다. 요청 앞에 태그를 붙여 스킬을 활성화한다.

| 태그 | 동작 |
|---|---|
| `[plan]` | `nx-plan` 스킬 — 다관점 분석과 결정 정렬 기반 실행 계획 |
| `[auto-plan]` | `nx-auto-plan` 스킬 — 요청을 자동 분해해 계획 |
| `[run]` | `nx-run` 스킬 — 현재 계획의 태스크 실행 |
| `[m] <본문>` | `.nexus/memory/`에 교훈·참조 저장 |
| `[m:gc]` | `.nexus/memory/` 정리 |
| `[d] <결정>` | 활성 plan 세션 현재 안건에 대한 결정 기록 |

## 선택: statusline

플러그인은 2줄 statusline 스크립트를 함께 배포한다. 첫 줄은 `◆Nexus vX.Y.Z`·모델·프로젝트·git 브랜치(staged/unstaged), 둘째 줄은 컨텍스트 사용률과 5h/7d 사용 한도 게이지(리셋까지 남은 시간). Claude Pro·Max OAuth 세션에서만 5h/7d가 표시되며, 로컬의 여러 Claude 세션이 `~/.claude/.usage_cache`를 공유하므로 API 중복 호출 없이 경합이 방지된다.

Claude Code는 플러그인이 사용자 `statusLine`을 자동 등록하는 걸 허용하지 않으므로, 별도 CLI로 배포된 `claude-nexus-statusline`을 본인의 `~/.claude/settings.json`에 등록한다.

### bunx 또는 npx (설치 불필요)

```json
{
  "statusLine": {
    "type": "command",
    "command": "bunx claude-nexus-statusline"
  }
}
```

`npx -y claude-nexus-statusline`도 동일하게 동작한다. 최초 호출 1회만 패키지를 로컬 캐시에 받고, 이후 호출은 캐시에서 즉시 실행된다.

### 전역 설치 (가장 빠른 시작 시간)

```bash
bun add -g claude-nexus    # 또는 npm i -g claude-nexus
```

```json
{
  "statusLine": {
    "type": "command",
    "command": "claude-nexus-statusline"
  }
}
```

업데이트는 `bun update -g claude-nexus`(또는 `npm update -g claude-nexus`) 한 번으로 끝난다.

## 요구 사항

- Claude Code (최신)
- Node.js 20 이상 (훅·MCP 서버 실행)

## 라이선스

MIT
