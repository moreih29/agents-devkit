# OMC Agent System

## 1. Agent 정의 방식

Agent는 `agents/{name}.md` 파일로 정의된다. YAML frontmatter + Markdown 본문 구조:

```markdown
---
name: executor
description: Focused task executor for implementation work (Sonnet)
model: claude-sonnet-4-6
---
<Agent_Prompt>
  <Role>You are Executor...</Role>
  <Success_Criteria>...</Success_Criteria>
  <Constraints>...</Constraints>
</Agent_Prompt>
```

### Frontmatter 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `name` | string | Agent 식별자 |
| `description` | string | Agent 설명 (Claude Code에 표시) |
| `model` | string | 기본 모델 (예: `claude-opus-4-6`, `claude-sonnet-4-6`) |
| `disallowedTools` | string | 차단할 도구 목록 (쉼표 구분) |

### Frontmatter 파싱

`src/agents/utils.ts`의 `parseDisallowedTools()`:

```typescript
export function parseDisallowedTools(agentName: string): string[] | undefined {
  // agent name 보안 검증: path traversal 방지
  if (!/^[a-z0-9-]+$/i.test(agentName)) return undefined;
  
  const content = readFileSync(agentPath, 'utf-8');
  const match = content.match(/^---[\s\S]*?---/);
  const disallowedMatch = match[0].match(/^disallowedTools:\s*(.+)/m);
  return disallowedMatch[1].split(',').map(t => t.trim()).filter(Boolean);
}
```

## 2. Agent 로딩 메커니즘

### loadAgentPrompt() - 이중 로딩 전략

```typescript
// src/agents/utils.ts
export function loadAgentPrompt(agentName: string): string {
  // 1. 보안: agent name 검증
  if (!/^[a-z0-9-]+$/i.test(agentName)) throw new Error('Invalid agent name');

  // 2. 빌드 타임: __AGENT_PROMPTS__ (CJS 번들에서 esbuild define으로 주입됨)
  if (typeof __AGENT_PROMPTS__ !== 'undefined') {
    const prompt = __AGENT_PROMPTS__[agentName];
    if (prompt) return prompt;
  }

  // 3. 런타임: 파일시스템에서 읽기 (dev/test 환경)
  const agentPath = join(getPackageDir(), 'agents', `${agentName}.md`);
  // path traversal 방지: resolved path가 agents 디렉토리 내부인지 확인
  const resolvedPath = resolve(agentPath);
  const rel = relative(resolvedAgentsDir, resolvedPath);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Path traversal detected');
  
  const content = readFileSync(agentPath, 'utf-8');
  return stripFrontmatter(content);  // YAML frontmatter 제거
}
```

### getPackageDir() - 패키지 루트 탐색

CJS 번들과 ESM 환경 모두 지원:
- CJS 번들: `__dirname`이 `bridge/`이면 한 단계 위
- ESM: `import.meta.url`에서 `src/agents/` 또는 `dist/agents/`를 거슬러 올라감

## 3. Agent Registry - getAgentDefinitions()

`src/agents/definitions.ts`가 모든 agent를 registry에 등록한다:

```typescript
export function getAgentDefinitions(options?: {
  overrides?: Partial<Record<string, Partial<AgentConfig>>>;
  config?: PluginConfig;
}): Record<string, { description, prompt, tools?, disallowedTools?, model?, defaultModel? }> {
  
  const agents: Record<string, AgentConfig> = {
    // Build/Analysis Lane
    explore: exploreAgent,
    analyst: analystAgent,
    planner: plannerAgent,
    architect: architectAgent,
    debugger: debuggerAgent,
    executor: executorAgent,
    verifier: verifierAgent,
    
    // Review Lane
    'security-reviewer': securityReviewerAgent,
    'code-reviewer': codeReviewerAgent,
    
    // Domain Specialists
    'test-engineer': testEngineerAgent,
    designer: designerAgent,
    writer: writerAgent,
    'qa-tester': qaTesterAgent,
    scientist: scientistAgent,
    tracer: tracerAgent,
    'git-master': gitMasterAgent,
    'code-simplifier': codeSimplifierAgent,
    
    // Coordination
    critic: criticAgent,
    
    // Backward Compatibility
    'document-specialist': documentSpecialistAgent
  };
  
  // config에서 모델 오버라이드 적용
  for (const [name, agentConfig] of Object.entries(agents)) {
    const configuredModel = getConfiguredAgentModel(name, resolvedConfig);
    const resolvedModel = override?.model ?? configuredModel ?? agentConfig.model;
    // ...
  }
}
```

### Agent Config Key 매핑

Agent name(kebab-case)을 config key(camelCase)로 매핑:

```typescript
const AGENT_CONFIG_KEY_MAP = {
  explore: 'explore',
  'security-reviewer': 'securityReviewer',
  'code-reviewer': 'codeReviewer',
  'test-engineer': 'testEngineer',
  // ...
};
```

## 4. 19개 Agent 상세

### Build/Analysis Lane

| Agent | Model | 역할 | 특이사항 |
|-------|-------|------|---------|
| `explore` | haiku | 코드베이스 검색, 파일/심볼 매핑 | 빠른 패턴 매칭 |
| `analyst` | opus | 요구사항 분석, hidden constraint 발견 | 구현하지 않음 |
| `planner` | opus | Task 분해, 실행 계획, 리스크 식별 | 구현하지 않음 |
| `architect` | opus | 시스템 설계, 디버깅, 아키텍처 | **Write/Edit 차단** (READ-ONLY) |
| `debugger` | sonnet | Root-cause 분석, regression 격리 | 빌드 에러도 담당 |
| `executor` | sonnet | 코드 구현, 리팩토링 | model=opus로 복잡한 작업 가능 |
| `verifier` | sonnet | 완료 증거, 테스트 적절성 검증 | |
| `tracer` | sonnet | Evidence-driven 인과관계 추적 | competing hypotheses 분석 |

### Review Lane

| Agent | Model | 역할 |
|-------|-------|------|
| `security-reviewer` | sonnet | 보안 취약점, trust boundary, authn/authz |
| `code-reviewer` | opus | 종합 코드 리뷰 (API, 성능, 패턴, 품질) |

### Domain Specialists

| Agent | Model | 역할 |
|-------|-------|------|
| `test-engineer` | sonnet | 테스트 전략, 커버리지, flaky test |
| `designer` | sonnet | UI/UX 아키텍처, 인터랙션 디자인 |
| `writer` | haiku | 문서, 마이그레이션 노트 |
| `qa-tester` | sonnet | CLI 런타임 검증 (tmux 사용) |
| `scientist` | sonnet | 데이터 분석, 통계 |
| `git-master` | sonnet | Git 커밋 전략, 히스토리 관리 |
| `document-specialist` | sonnet | 외부 SDK/API 문서 리서치 |
| `code-simplifier` | opus | 코드 단순화, 유지보수성 |

### Coordination

| Agent | Model | 역할 |
|-------|-------|------|
| `critic` | opus | 계획 리뷰, gap analysis, 다관점 조사 |

## 5. Deprecated Agent Aliases

하위 호환성을 위한 별칭:

```
api-reviewer       → code-reviewer
performance-reviewer → code-reviewer
quality-reviewer   → code-reviewer
quality-strategist → code-reviewer
dependency-expert  → document-specialist
researcher         → document-specialist
tdd-guide          → test-engineer
deep-executor      → executor
build-fixer        → debugger
harsh-critic       → critic
```

## 6. Agent Role 구분 체계

높은 tier agent들의 역할이 명확히 분리된다:

```
| Agent     | Role                 | Does                        | Does NOT                          |
|-----------|----------------------|-----------------------------|-----------------------------------|
| architect | code-analysis        | 코드 분석, 디버깅, 검증     | 요구사항, 계획 생성, 계획 리뷰    |
| analyst   | requirements-analysis| 요구사항 gap 발견            | 코드 분석, 계획, 계획 리뷰        |
| planner   | plan-creation        | 작업 계획 생성               | 요구사항, 코드 분석, 계획 리뷰    |
| critic    | plan-review          | 계획 품질 리뷰               | 요구사항, 코드 분석, 계획 생성    |
```

**권장 워크플로우:** explore → analyst → planner → critic → executor → architect (검증)

## 7. OMC System Prompt

`omcSystemPrompt`는 main orchestrator의 system prompt이다 (`src/agents/definitions.ts` 하단):

핵심 원칙:
1. **Relentless Execution** - todo list가 미완료면 절대 멈추지 않음
2. **Delegate Aggressively** - 전문 agent에게 적극 위임
3. **Parallelize Ruthlessly** - 독립 task는 동시 실행
4. **Verify Thoroughly** - 검증 후 검증

Agent 조합 권장:
- **Architect + QA-Tester**: 진단 → 검증 루프 (CLI/서비스 버그에 적합)
- 검증 우선순위: 기존 테스트 > 직접 명령 > QA-Tester (tmux)

Completion Checklist:
- 모든 todo 완료됨
- 요청된 기능 구현됨
- 테스트 통과
- 에러 없음
- 원래 요청 완전히 충족

## 8. Agent 타입 정의

```typescript
// src/shared/types.ts
export interface AgentConfig {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];              // 허용된 도구 (미지정 시 전체)
  disallowedTools?: string[];    // 차단된 도구
  model?: string;                // 사용할 모델
  defaultModel?: string;         // 기본 모델
}
```

## 9. SubagentStart/Stop Hook을 통한 Agent 추적

`scripts/subagent-tracker.mjs`가 `SubagentStart`와 `SubagentStop` event를 처리하여 `.omc/state/subagent-tracking.json`에 agent 상태를 기록한다.

`scripts/verify-deliverables.mjs`가 `SubagentStop` 시 agent의 산출물을 검증한다.

이 추적 데이터는 PreToolUse hook에서 활용되어 "Active agents: N" 정보를 context에 주입한다.

## 10. Claude Code의 subagent_type 매핑

Claude Code에서 `Task(subagent_type="oh-my-claudecode:executor")` 형태로 agent를 호출한다. `oh-my-claudecode:` prefix가 plugin 이름이고, 그 뒤가 agent registry의 key이다.

Hook에서 `SubagentStart` event의 data에 `subagent_type` 필드가 포함되며, 이를 통해 어떤 agent가 spawn되었는지 추적한다.
