# Setup

Interactive project setup wizard — configure Nexus for a new project with minimal token cost.

## Trigger
- User says: "setup", "nexus 설정", "nexus 세팅", "setup nexus"
- Explicit tag: `[setup]`
- Direct invocation: `/nexus:setup`

## What It Does

Step-by-step wizard using `AskUserQuestion` at each step. Designed for minimal token usage — every step is a concrete choice, no open-ended exploration.

## Steps

### Step 1: Statusline Preset

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

선택 시 `.nexus/statusline-preset.json`에 `{"preset": "<선택>"}` 저장.
Skip이면 아무것도 하지 않음 (기본값 standard 유지).

### Step 2: Delegation Enforcement

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

선택 시 `.nexus/config.json`에 `{"delegationEnforcement": "<선택>"}` 저장.
Skip이면 아무것도 하지 않음 (기본값 warn 유지).

### Step 3: Default Mode

```
AskUserQuestion({
  questions: [{
    question: "기본 실행 모드를 선택하세요.",
    header: "Mode",
    multiSelect: false,
    options: [
      { label: "Off (Recommended)", description: "키워드 없으면 일반 모드. 필요 시 [auto], [nonstop] 등 직접 지정." },
      { label: "Auto", description: "모든 작업에 자동으로 auto 모드 적용 (분석→계획→구현→검증→리뷰)" },
      { label: "Nonstop", description: "모든 작업에 자동으로 nonstop 적용 (중단 없이 완료까지)" },
      { label: "Skip", description: "기본 모드 설정 건너뛰기 (기본값 off)" }
    ]
  }]
})
```

선택 시 `.nexus/config.json`에 `{"defaultMode": "<선택>"}` 추가.
- `auto`: 키워드 없어도 매 프롬프트에서 auto 활성화 (Pre-Execution Gate는 유지)
- `nonstop`: 키워드 없어도 매 프롬프트에서 nonstop 활성화
- `off`/Skip: 기본 동작 (키워드 감지 시에만 모드 활성화)

### Step 4: Knowledge Init

```
AskUserQuestion({
  questions: [{
    question: "프로젝트 knowledge를 자동 생성할까요?",
    header: "Init",
    multiSelect: false,
    options: [
      { label: "Yes (Recommended)", description: "기존 문서(README, CLAUDE.md 등)를 분석해 .claude/nexus/knowledge/ 생성" },
      { label: "Skip", description: "나중에 /nexus:init으로 직접 실행" }
    ]
  }]
})
```

Yes 선택 시: init 스킬 워크플로우 실행 (SCAN → TRIAGE → PROPOSE → GENERATE → VERIFY).
Skip 시: 다음 단계로.

### Step 5: Complete

설정 완료 메시지 출력:
- 적용된 설정 요약
- 사용 가능한 스킬/에이전트 간략 소개
- "시작하려면 작업을 말하거나 [consult]로 상담하세요"

## Key Principles

1. **모든 단계는 AskUserQuestion** — 자유 텍스트 입력 없음
2. **경량 모델 사용** — 토큰 소비 최소화
3. **Skip 옵션 항상 제공** — 강제 없음
4. **확장 가능한 구조** — 향후 외부 MCP 추천 등 단계 추가 가능

## State Management

setup은 상태 파일 없이 순차 AskUserQuestion으로 동작.
설정 결과는 각 단계에서 즉시 파일에 기록 (preset → `.nexus/statusline-preset.json`).
