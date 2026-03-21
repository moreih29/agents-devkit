---
name: setup
description: Interactive project setup wizard for Nexus configuration.
triggers: ["setup", "nexus 설정", "nexus 세팅"]
---
# Setup

Interactive project setup wizard — configure Nexus for a new project with minimal token cost.

## Trigger
- User says: "setup", "nexus 설정", "nexus 세팅", "setup nexus"
- Explicit tag: `[setup]`
- Direct invocation: `/nexus:nx-setup`

## What It Does

Step-by-step wizard using `AskUserQuestion` at each step. Designed for minimal token usage — every step is a concrete choice, no open-ended exploration.

## Steps

### Step 1: Scope Selection

```
AskUserQuestion({
  questions: [{
    question: "Nexus 설정을 어느 범위에 적용할까요?",
    header: "Scope",
    multiSelect: false,
    options: [
      { label: "User (Global)", description: "모든 프로젝트에 적용 (~/.claude/CLAUDE.md, ~/.nexus/config.json)" },
      { label: "Project", description: "이 프로젝트에만 적용 (CLAUDE.md, .nexus/config.json)" }
    ]
  }]
})
```

선택에 따라 이후 모든 파일 쓰기 경로가 결정됨:
- User: `~/.claude/CLAUDE.md`, `~/.nexus/config.json`
- Project: `./CLAUDE.md`, `./.nexus/config.json`

### Step 2: Statusline Preset

```
AskUserQuestion({
  questions: [{
    question: "상태라인 표시 수준을 선택하세요.",
    header: "Statusline",
    multiSelect: false,
    options: [
      { label: "Full (Recommended)", description: "3줄: 모델+브랜치, 사용량, 워크플로우+에이전트+태스크" },
      { label: "Standard", description: "2줄: 모델+브랜치, 사용량" },
      { label: "Minimal", description: "1줄: 모델+브랜치만" },
      { label: "Skip", description: "상태라인 설정 건너뛰기" }
    ]
  }]
})
```

선택 시 scope에 따라 `config.json`의 `statuslinePreset` 필드에 저장.
Skip이면 아무것도 하지 않음 (기본값 standard 유지).

### Step 3: Delegation Enforcement

```
AskUserQuestion({
  questions: [{
    question: "에이전트 위임 강제 수준을 선택하세요.",
    header: "Delegation",
    multiSelect: false,
    options: [
      { label: "Warn (Recommended)", description: "Write/Edit 시 위임 리마인더 주입. 실행은 허용." },
      { label: "Strict", description: "Write/Edit 시 도구 차단. 반드시 에이전트에 위임해야 함." },
      { label: "Off", description: "위임 안내 없음. 자유롭게 직접 작업." },
      { label: "Skip", description: "위임 강제 설정 건너뛰기 (기본값 warn)" }
    ]
  }]
})
```

선택 시 scope에 따라 `config.json`에 `{"delegationEnforcement": "<선택>"}` 저장.
Skip이면 아무것도 하지 않음 (기본값 warn 유지).

### Step 4: CLAUDE.md Delegation Table

Generate the Nexus section in CLAUDE.md using `<!-- NEXUS:START -->` / `<!-- NEXUS:END -->` markers.

If a Nexus section already exists, replace the content between markers. Content outside the markers is preserved unchanged.

Write location depends on scope selected in Step 1.

Section content (in English):

```markdown
<!-- NEXUS:START -->
## Nexus Agent Orchestration

**Default: DELEGATE** — route code work, analysis, and multi-file changes to agents.

### Agent Routing

| Task | Agent |
|------|-------|
| Code implementation, edits | executor |
| Architecture, design decisions | architect |
| Debugging, tracing issues | debugger |
| Code review, quality check | code-reviewer |
| Test writing, coverage | test-engineer |
| Research, documentation | document-specialist |
| Planning, decomposition | planner |

### 6-Section Response Format

Agents use structured responses: Context → Plan → Implementation → Verification → Risks → Next Steps.

### Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| consult | [consult] | Interactive discovery — understand intent before executing |
| plan | [plan] | Generate structured implementation plan |
| init | [init] | Onboard project — generate knowledge from existing docs |
| setup | [setup] | Configure Nexus interactively |
| sync | [sync] | Sync knowledge docs with source files |
<!-- NEXUS:END -->
```

### Step 5: OMC Conflict Detection

Check if the omc or oh-my-claudecode plugin is active:
- Look for `oh-my-claudecode` or `omc` in `.claude/settings.json` plugins list
- Look for OMC configuration in `~/.claude/CLAUDE.md`

If found:

```
AskUserQuestion({
  questions: [{
    question: "oh-my-claudecode (OMC) 플러그인이 감지되었습니다. Nexus와 충돌할 수 있습니다.",
    header: "OMC Conflict",
    multiSelect: false,
    options: [
      { label: "Disable OMC", description: ".claude/settings.json에서 OMC 비활성화. Nexus만 사용." },
      { label: "Keep Both", description: "두 플러그인을 함께 유지. 충돌 위험은 사용자 책임." }
    ]
  }]
})
```

- Disable OMC 선택 시: `.claude/settings.json`의 plugins 배열에서 omc/oh-my-claudecode 항목 제거
- Keep Both 선택 시: 경고 메모만 남기고 진행

OMC가 감지되지 않으면 이 단계는 건너뜀.

### Step 6: Recommended Plugins

Before presenting options, check the current `enabledPlugins` in both global (`~/.claude/settings.json`) and project (`.claude/settings.json`) to detect already-installed plugins.

Recommended plugins:
| Key | Name | Description |
|-----|------|-------------|
| `context7@claude-plugins-official` | context7 | 라이브러리 문서 실시간 조회 (Upstash Context7) |
| `playwright@claude-plugins-official` | playwright | 브라우저 자동화 & E2E 테스트 (Microsoft Playwright) |
| `skill-creator@claude-plugins-official` | skill-creator | 스킬 생성, 평가, 최적화 도구 |

**Case A: 3개 모두 이미 설치됨**

설치 상태를 알리고 건너뜀:
```
"추천 플러그인이 모두 설치되어 있습니다: context7 ✓, playwright ✓, skill-creator ✓"
```

**Case B: 일부 설치됨**

미설치 항목만 표시. 설치된 항목은 description에 `(설치됨)` 표기:

```
AskUserQuestion({
  questions: [{
    question: "Nexus 추천 플러그인을 설치할까요? (✓ = 이미 설치됨)",
    header: "Plugins",
    multiSelect: false,
    options: [
      { label: "Install remaining (Recommended)", description: "미설치 플러그인만 추가 설치" },
      { label: "Choose", description: "설치할 플러그인을 직접 선택" },
      { label: "Skip", description: "추천 플러그인 설치 건너뛰기" }
    ]
  }]
})
```

**Case C: 하나도 설치 안 됨**

```
AskUserQuestion({
  questions: [{
    question: "Nexus 추천 플러그인을 설치할까요?",
    header: "Plugins",
    multiSelect: false,
    options: [
      { label: "Install All (Recommended)", description: "context7 (라이브러리 문서), playwright (브라우저 테스트), skill-creator (스킬 개발) 모두 설치" },
      { label: "Choose", description: "설치할 플러그인을 직접 선택" },
      { label: "Skip", description: "추천 플러그인 설치 건너뛰기" }
    ]
  }]
})
```

**Install All / Install remaining 선택 시:**
scope에 따른 `settings.json`의 `enabledPlugins`에 미설치 항목만 추가:
```json
{
  "context7@claude-plugins-official": true,
  "playwright@claude-plugins-official": true,
  "skill-creator@claude-plugins-official": true
}
```

**Choose 선택 시:**
미설치 항목만 multiSelect 옵션으로 표시. 설치된 항목은 제외:
```
AskUserQuestion({
  questions: [{
    question: "설치할 플러그인을 선택하세요.",
    header: "Plugins",
    multiSelect: true,
    options: [
      // 미설치 항목만 동적으로 포함
      { label: "context7", description: "라이브러리 문서 실시간 조회 (Upstash Context7)" },
      { label: "playwright", description: "브라우저 자동화 & E2E 테스트 (Microsoft Playwright)" },
      { label: "skill-creator", description: "스킬 생성, 평가, 최적화 도구" }
    ]
  }]
})
```
선택된 플러그인만 `enabledPlugins`에 추가.

**Skip 선택 시:** 다음 단계로 진행.

### Step 7: Knowledge Init

```
AskUserQuestion({
  questions: [{
    question: "프로젝트 knowledge를 자동 생성할까요?",
    header: "Init",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "기존 문서(README, CLAUDE.md 등)를 분석해 .claude/nexus/knowledge/ 생성" },
      { label: "Skip", description: "나중에 /nexus:nx-init으로 직접 실행" }
    ]
  }]
})
```

Yes 선택 시: init 스킬 워크플로우 실행 (SCAN → TRIAGE → PROPOSE → GENERATE → VERIFY).
Skip 시: 다음 단계로.

### Step 8: Complete

설정 완료 메시지 출력:
- 적용된 설정 요약
- 사용 가능한 스킬/에이전트 간략 소개
- "시작하려면 작업을 말하거나 [consult]로 상담하세요"

## Key Principles

1. **모든 단계는 AskUserQuestion** — 자유 텍스트 입력 없음
2. **경량 모델 사용** — 토큰 소비 최소화
3. **Skip 옵션 항상 제공** — 강제 없음
4. **확장 가능한 구조** — 추천 플러그인 단계 포함, 향후 카테고리 확장 가능

## State Management

setup은 상태 파일 없이 순차 AskUserQuestion으로 동작.
설정 결과는 각 단계에서 즉시 `config.json`에 기록.
