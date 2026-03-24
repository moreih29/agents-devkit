---
name: nx-setup
description: Interactive project setup wizard for Nexus configuration.
disable-model-invocation: true
---
# Setup

Interactive project setup wizard — configure Nexus for a new project with minimal token cost.

## Trigger
- Direct invocation: `/claude-nexus:nx-setup`

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
      { label: "User (Global)", description: "모든 프로젝트에 적용 (~/.claude/CLAUDE.md, ~/.claude/settings.json 상태라인)" },
      { label: "Project", description: "이 프로젝트에만 적용 (CLAUDE.md, .claude/settings.local.json, .claude/nexus/config.json)" }
    ]
  }]
})
```

선택에 따라 이후 모든 파일 쓰기 경로가 결정됨:
- User: `~/.claude/CLAUDE.md`, `~/.claude/settings.json` (상태라인 래퍼)
- Project: `./CLAUDE.md`, `./.claude/nexus/config.json`

### Step 2: Statusline Preset

```
AskUserQuestion({
  questions: [{
    question: "상태라인 표시 수준을 선택하세요.",
    header: "Statusline",
    multiSelect: false,
    options: [
      { label: "Full (Recommended)", description: "2줄: 모델+브랜치, 태스크+사용량" },
      { label: "Minimal", description: "1줄: 모델+브랜치만" },
      { label: "Skip", description: "상태라인 설정 건너뛰기" }
    ]
  }]
})
```

**래퍼 스크립트 생성** (Full/Minimal 공통, Bash 도구로 실행):
```bash
mkdir -p ~/.claude/hooks
cat > ~/.claude/hooks/nexus-statusline.sh << 'EOF'
#!/bin/bash
SCRIPT=$(ls -1d "$HOME/.claude/plugins/cache/nexus/claude-nexus"/*/scripts/statusline.cjs 2>/dev/null | sort -V | tail -1)
[ -n "$SCRIPT" ] && exec node "$SCRIPT"
EOF
chmod +x ~/.claude/hooks/nexus-statusline.sh
```

**선택 시 scope에 따라:**

**(1) User scope:**
- 래퍼 스크립트 생성 (위 단계 실행)
- `~/.claude/settings.json`에 `statusLine` 필드가 **없으면**: statusLine 설정 바로 추가:
  ```json
  { "statusLine": { "type": "command", "command": "bash $HOME/.claude/hooks/nexus-statusline.sh" } }
  ```
- `~/.claude/settings.json`에 `statusLine` 필드가 **이미 있으면**: 래퍼만 생성하고 settings.json은 수정하지 않음 — Step 4의 "OMC Statusline 공존 처리"에서 교체/유지 여부를 결정

**(2) Project scope:**
- 래퍼 스크립트 생성 (위 단계 실행)
- `.claude/settings.local.json`에 `statusLine` 필드가 **없으면**: statusLine 설정 바로 추가:
  ```json
  { "statusLine": { "type": "command", "command": "bash $HOME/.claude/hooks/nexus-statusline.sh" } }
  ```
- `.claude/settings.local.json`에 `statusLine` 필드가 **이미 있으면**: 래퍼만 생성하고 settings.local.json은 수정하지 않음 — Step 4의 "OMC Statusline 공존 처리"에서 교체/유지 여부를 결정
- `.claude/nexus/config.json`의 `statuslinePreset` 필드에도 선택값 저장 (기존 유지)

**(3) Skip:**
- 래퍼 생성도, settings.json 수정도 하지 않음.

### Step 3: CLAUDE.md Nexus Section

Generate the Nexus section in CLAUDE.md using `<!-- NEXUS:START -->` / `<!-- NEXUS:END -->` markers.

If a Nexus section already exists, replace the content between markers. Content outside the markers is preserved unchanged.

Write location depends on scope selected in Step 1.

Section content:

```markdown
<!-- NEXUS:START -->
## Nexus Agent Orchestration

**Default: DELEGATE** — route code work, analysis, and multi-file changes to agents.

### Agent Routing

병렬 작업이나 다른 관점이 필요할 때 에이전트를 활용하라.

| Task | Agent |
|------|-------|
| Project direction, scope, priorities | director |
| Architecture, technical design, code review | architect |
| Code implementation, edits, debugging | engineer |
| Testing, verification, security review | qa |
| Research direction, agenda, bias prevention | principal |
| Research methodology, evidence synthesis | postdoc |
| Web search, independent investigation | researcher |

단순 작업(파일 1-2개 읽기/수정)은 직접 처리하라.

### Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| nx-consult | [consult] | Interactive discovery — understand intent before executing |
| nx-dev | [dev] / [dev!] | Development execution — sub-agent or team mode |
| nx-research | [research] / [research!] | Research execution — principal+postdoc+researcher team |
| nx-init | /claude-nexus:nx-init | Onboard project — generate knowledge from existing docs |
| nx-setup | /claude-nexus:nx-setup | Configure Nexus interactively |
| nx-sync | /claude-nexus:nx-sync | Sync knowledge docs with source files |

### Tags

| Tag | Purpose |
|-----|---------|
| [consult] | 상담 — 실행 전 의도 파악 |
| [dev] | 개발 — Lead 자율 판단 (sub 또는 team) |
| [dev!] | 개발 팀 강제 — 반드시 팀 구성 |
| [research] | 리서치 — Lead 자율 판단 (sub 또는 team) |
| [research!] | 리서치 팀 강제 — 반드시 팀 구성 |
| [d] | 결정 기록 (nx_decision_add 호출) |
<!-- NEXUS:END -->
```

### Step 4: OMC Conflict Detection

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

**OMC Statusline 공존 처리:**

Step 2에서 settings.json 수정을 보류한 경우(기존 statusLine이 감지되어 래퍼만 생성한 경우)에만 실행.
Step 2에서 statusLine 설정을 이미 적용했으면 이 하위 단계는 건너뜀.

구체적으로, Step 2 실행 시점에 다음 조건 중 하나라도 해당하면 기존 statusline 설정이 있는 것으로 판단:
- `~/.claude/hooks/statusline.sh` 파일이 존재
- 또는 scope에 따른 settings.json(`~/.claude/settings.json` 또는 `.claude/settings.local.json`)에 `statusLine` 필드가 이미 존재

감지 시:

```
AskUserQuestion({
  questions: [{
    question: "기존 상태라인 설정이 감지되었습니다. Nexus 상태라인으로 교체할까요?",
    header: "Statusline",
    multiSelect: false,
    options: [
      { label: "Replace (Recommended)", description: "Nexus 상태라인으로 교체 (래퍼 스크립트 설정)" },
      { label: "Keep Existing", description: "기존 상태라인 유지. Nexus 래퍼는 생성하되 settings.json은 수정하지 않음." }
    ]
  }]
})
```

- Replace (Recommended) 선택: scope에 따른 settings.json의 statusLine을 Nexus 래퍼로 교체 (래퍼 스크립트는 Step 2에서 이미 생성됨)
- Keep Existing 선택: settings.json의 statusLine은 기존 설정을 유지 (래퍼 스크립트는 Step 2에서 이미 생성됨 — 사용자가 나중에 수동 전환 가능)

기존 statusline 설정이 감지되지 않으면 이 하위 단계는 건너뜀.

### Step 5: Recommended Plugin

Check if `context7@claude-plugins-official` is in `enabledPlugins` (global or project settings.json).

**이미 설치됨:**

설치 상태를 알리고 건너뜀:
```
"추천 플러그인이 설치되어 있습니다: context7 ✓"
```

**미설치:**

```
AskUserQuestion({
  questions: [{
    question: "context7 플러그인을 설치할까요? 에이전트가 라이브러리 문서를 실시간 조회할 수 있습니다.",
    header: "Plugin",
    multiSelect: false,
    options: [
      { label: "Install (Recommended)", description: "context7 — 라이브러리 문서 실시간 조회 (Upstash Context7)" },
      { label: "Skip", description: "추천 플러그인 설치 건너뛰기" }
    ]
  }]
})
```

**Install 선택 시:**
scope에 따른 settings.json (`~/.claude/settings.json` 또는 `.claude/settings.local.json`)의 `enabledPlugins`에 추가:
```json
{
  "context7@claude-plugins-official": true
}
```
Claude Code가 다음 세션 시작 시 자동으로 플러그인을 설치합니다.

**Skip 선택 시:** 다음 단계로 진행.

참고: `enabledPlugins`에 추가하면 Claude Code가 다음 세션 시작 시 자동으로 플러그인을 설치합니다.

### Step 6: Knowledge Init

```
AskUserQuestion({
  questions: [{
    question: "프로젝트 knowledge를 자동 생성할까요?",
    header: "Init",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "기존 문서(README, CLAUDE.md 등)를 분석해 .claude/nexus/knowledge/ 생성" },
      { label: "Skip", description: "나중에 /claude-nexus:nx-init으로 직접 실행" }
    ]
  }]
})
```

Yes 선택 시: init 스킬 워크플로우 실행 (SCAN → TRIAGE → PROPOSE → GENERATE → VERIFY).
Skip 시: 다음 단계로.

### Step 7: Complete

설정 완료 메시지 출력:
- 적용된 설정 요약
- 사용 가능한 스킬/에이전트 간략 소개
- "시작하려면 작업을 말하거나 [consult]로 상담, [dev]로 개발, [research]로 리서치하세요"

## Key Principles

1. **모든 단계는 AskUserQuestion** — 자유 텍스트 입력 없음
2. **토큰 최소화** — 각 단계를 구체적 선택지로 한정하여 불필요한 탐색 방지
3. **Skip 옵션 항상 제공** — 강제 없음
4. **확장 가능한 구조** — 추천 플러그인 단계 포함, 향후 카테고리 확장 가능

## State Management

setup은 상태 파일 없이 순차 AskUserQuestion으로 동작.
설정 결과는 각 단계에서 즉시 `.claude/nexus/config.json`에 기록 (Project scope의 경우).
