# OMC Skills System

## 1. Skill 정의 방식

Skill은 `skills/{name}/SKILL.md` 파일로 정의된다. Agent와 달리, skill은 현재 대화의 behavior를 수정하는 **instruction protocol**이다.

```
skills/
├── ralph/SKILL.md          # 반복 실행 루프
├── autopilot/SKILL.md      # 전체 자율 실행
├── team/SKILL.md           # Multi-agent 팀
├── ultrawork/SKILL.md      # 최대 병렬 실행
├── ultraqa/SKILL.md        # QA 사이클
├── plan/SKILL.md           # 전략적 계획
├── ralplan/SKILL.md        # 합의 기반 계획
├── ccg/SKILL.md            # Claude-Codex-Gemini 삼중 모델
├── deep-interview/SKILL.md # Socratic 인터뷰
├── cancel/SKILL.md         # 모드 취소
├── ai-slop-cleaner/SKILL.md# AI 코드 정리
├── trace/SKILL.md          # Agent flow 추적
├── hud/SKILL.md            # HUD 설정
├── omc-setup/SKILL.md      # OMC 초기 설정
├── omc-doctor/SKILL.md     # 설치 진단
├── learner/SKILL.md        # Skill 학습
├── configure-notifications/SKILL.md
├── project-session-manager/SKILL.md
├── writer-memory/SKILL.md
└── ... (28개 총)
```

### SKILL.md 구조

```markdown
---
name: ralph
description: Self-referential loop until task completion
aliases: []
---

# Skill Content

<Purpose>...</Purpose>
<Use_When>...</Use_When>
<Do_Not_Use_When>...</Do_Not_Use_When>
<Steps>...</Steps>
```

## 2. Skill 활성화 메커니즘

### 2.1 명시적 호출 (Slash Command)

사용자가 직접 호출:
```
/oh-my-claudecode:ralph "fix all tests"
/oh-my-claudecode:team 3:executor "refactor auth"
```

Claude Code가 Skill tool을 호출하면, 해당 `SKILL.md` 내용이 context에 주입된다.

### 2.2 Magic Keyword 자동 감지

`scripts/keyword-detector.mjs`가 `UserPromptSubmit` hook에서 사용자 프롬프트의 키워드를 감지하여 자동으로 Skill tool 호출을 유도한다.

감지 흐름:
```
사용자: "ralph fix all tests"
  ↓
keyword-detector.mjs:
  1. stdin에서 JSON 읽기
  2. prompt 추출 (extractPrompt)
  3. 코드 블록/URL/파일경로 제거 (sanitizeForKeywordDetection)
  4. 정규식으로 키워드 매칭
  5. 충돌 해결 (resolveConflicts)
  6. state 파일 생성 (activateState)
  7. additionalContext로 skill 호출 지시 주입
  ↓
출력:
{
  "continue": true,
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "[MAGIC KEYWORD: RALPH]\n\nYou MUST invoke the skill using the Skill tool:\nSkill: oh-my-claudecode:ralph\n..."
  }
}
```

### 2.3 Keyword 우선순위

```javascript
const priorityOrder = [
  'cancel',        // 최우선: 모든 모드 취소
  'ralph',         // 반복 실행 루프
  'autopilot',     // 자율 실행
  'ultrawork',     // 병렬 실행
  'ccg',           // 삼중 모델
  'ralplan',       // 합의 계획
  'deep-interview',// Socratic 인터뷰
  'ai-slop-cleaner', // AI 코드 정리
  'tdd',           // TDD 모드
  'code-review',   // 코드 리뷰
  'security-review',// 보안 리뷰
  'ultrathink',    // 확장 추론
  'deepsearch',    // 코드베이스 검색
  'analyze'        // 분석 모드
];
```

### 2.4 Keyword → Regex 매핑

| Skill | Regex 패턴 |
|-------|-----------|
| cancel | `\b(cancelomc\|stopomc)\b` |
| ralph | `\b(ralph\|don't stop\|must complete\|until done)\b` |
| autopilot | `\b(autopilot\|auto pilot\|autonomous\|full auto)\b` + "build me an app" 패턴 |
| ultrawork | `\b(ultrawork\|ulw\|uw)\b` |
| tdd | `\b(tdd)\b` + `\btest\s+first\b` |
| ai-slop-cleaner | explicit패턴 OR (action패턴 AND smell패턴) |

### 2.5 Mode vs. Context 키워드

일부 키워드는 skill을 호출하는 대신 **context message만 주입**한다:

```javascript
// 이들은 skill이 아니라 context 메시지만 주입
['ultrathink', ULTRATHINK_MESSAGE],  // <think-mode> 주입
['analyze', ANALYZE_MESSAGE],         // <analyze-mode> 주입
['tdd', TDD_MESSAGE],                 // <tdd-mode> 주입
['code-review', CODE_REVIEW_MESSAGE],
['security-review', SECURITY_REVIEW_MESSAGE],
```

## 3. 주요 Workflow Skills 상세

### 3.1 Ralph - 반복 실행 루프

**목적:** PRD 기반 persistence loop. 모든 user story가 passes: true이고 reviewer 검증될 때까지 반복.

**상태 파일:** `.omc/state/sessions/{id}/ralph-state.json`
```json
{
  "active": true,
  "iteration": 1,
  "max_iterations": 100,
  "started_at": "...",
  "prompt": "...",
  "linked_ultrawork": true
}
```

**실행 흐름:**
1. PRD Setup: `prd.json` 생성/읽기 (user stories + acceptance criteria)
2. Story-by-story 실행
3. 각 story 완료 후 passes 업데이트
4. 모든 story 통과 시 reviewer (기본: architect) 검증
5. Stop hook이 매 iteration마다 block하여 루프 유지

### 3.2 Autopilot - 전체 자율 실행

**목적:** 아이디어 → 작동하는 코드까지 전체 lifecycle 자동화.

**5단계 파이프라인:**
1. **Phase 0 - Expansion**: Analyst + Architect가 spec 생성
2. **Phase 1 - Planning**: Architect가 계획, Critic이 검증
3. **Phase 2 - Execution**: Ralph + Ultrawork로 병렬 구현
4. **Phase 3 - QA**: UltraQA 모드로 테스트 사이클 (최대 5회)
5. **Phase 4 - Validation**: 다관점 검증 (code-reviewer, security-reviewer 등)

ralplan 합의 계획이 이미 존재하면 Phase 0, 1을 건너뛴다.

### 3.3 Team - Multi-Agent 팀 조율

**목적:** N개의 coordinated agent가 shared task list에서 작업.

**사용법:**
```
/team 3:executor "fix all TypeScript errors"
/team ralph "build REST API"           # Ralph로 감싸서 실행
/team 2:codex "review architecture"    # Codex CLI workers
```

**아키텍처:**
```
[TEAM ORCHESTRATOR (Lead)]
  → TeamCreate("team-name")
  → Analyze & decompose task
  → TaskCreate x N (subtask별)
  → TaskUpdate x N (worker 할당)
  → Monitor progress
  → Merge results
```

**파이프라인:** `team-plan → team-prd → team-exec → team-verify → team-fix (loop)`

### 3.4 Ultrawork - 최대 병렬 실행

**목적:** 가능한 모든 것을 병렬로 실행.

**특징:**
- explore/document-specialist agent를 background로 10+ 동시 실행
- 항상 plan agent를 먼저 사용
- 검증 보증: 증거 없이는 완료 불가
- Scope 축소 금지: demo/skeleton/simplified 버전 금지

### 3.5 Ralplan - 합의 기반 계획

**목적:** Planner + Architect + Critic 3자 합의 loop.

**흐름:**
1. Planner가 계획 초안 작성
2. Architect가 기술적 리뷰
3. Critic이 gap analysis
4. 합의 도달까지 반복
5. 산출물: `.omc/plans/ralplan-*.md`

### 3.6 Cancel - 모드 취소

모든 활성 모드의 state 파일을 삭제:
```javascript
clearStateFiles(directory, ['ralph', 'autopilot', 'ultrawork', 'swarm', 'ralplan'], sessionId);
```

## 4. Learned Skill 주입 (skill-injector.mjs)

`UserPromptSubmit` hook에서 학습된 skill을 자동으로 context에 주입한다.

### Skill 파일 형식
```markdown
---
name: My Custom Skill
triggers:
  - "database migration"
  - "schema change"
---

When doing database migrations, always...
```

### 검색 경로 (우선순위 순)
1. 프로젝트: `.omc/skills/*.md`
2. 글로벌: `~/.omc/skills/*.md`
3. 사용자: `~/.claude/skills/omc-learned/*.md`

### 매칭 로직
- trigger 문자열이 프롬프트에 포함되면 score += 10
- score 내림차순 정렬
- 세션당 최대 5개 skill 주입
- 이미 주입된 skill은 중복 주입 안 함

### 주입 형식
```xml
<mnemosyne>
## Relevant Learned Skills

### Skill Name (project)
<skill-metadata>{"path":"...","triggers":[...],"score":10}</skill-metadata>

Skill content here...
</mnemosyne>
```

## 5. Skill + State 연동

keyword-detector가 skill을 감지하면:
1. **State 파일 생성**: `activateState(directory, prompt, stateName, sessionId)`
2. **Flow trace 기록**: `tracer.recordKeywordDetected(directory, sessionId, match.name)`
3. **Ralph + Ultrawork 연동**: ralph 감지 시 ultrawork state도 자동 생성

pre-tool-enforcer에서 Skill tool 호출 시:
4. **skill-active-state.json 생성**: protection level에 따라 Stop hook 강도 조절

```javascript
const SKILL_PROTECTION_MAP = {
  autopilot: 'none', ralph: 'none', ultrawork: 'none', // 자체 persistence 있음
  tdd: 'light',           // 3회 reinforcement, 5분 TTL
  'code-review': 'medium', // 5회, 15분
  deepinit: 'heavy',       // 10회, 30분
};
```

## 6. Team Keyword는 명시적 전용

Team은 keyword 자동 감지에서 **제외**되었다 (`// Team keyword detection removed`). 이유:
- Worker가 "team"이 포함된 프롬프트를 받으면 다시 team skill을 호출하는 무한 루프 발생
- `/team` slash command로만 명시적 호출 가능
