# OMO Skills and Commands 분석

## Skills System

스킬은 서브에이전트 프롬프트에 주입되는 특수화된 instruction. `delegate_task(load_skills=["playwright", "git-master"])` 형태로 사용.

### 빌트인 스킬 (`src/features/builtin-skills/skills.ts`, 1203줄)

```typescript
interface BuiltinSkill {
  name: string; description: string; template: string
  mcpConfig?: Record<string, McpServerConfig>  // 스킬 전용 MCP
  allowedTools?: string[]
}
```

#### 1. Playwright 스킬
MCP 서버와 함께 자동 시작. `@playwright/mcp`를 통해 브라우저 자동화.
```typescript
mcpConfig: { playwright: { command: "npx", args: ["@playwright/mcp@latest"] } }
```

#### 2. Agent-Browser 스킬
Vercel `agent-browser` CLI 기반. ref 기반 요소 상호작용(`@e1`, `@e2`). 세션, 프로필, 비디오 녹화, 네트워크 인터셉트.

#### 3. Frontend UI/UX 스킬
디자이너-개발자 역할. Typography(기본폰트 금지), Color(CSS variables), Motion(scroll-triggering). Anti-patterns: 보라색 그라디언트(AI slop).

#### 4. Git-Master 스킬 (~1500줄)
3가지 모드: COMMIT / REBASE / HISTORY SEARCH
핵심: 스타일 자동 감지(Semantic/Plain/Short), 원자적 커밋 강제:
```
3+ files -> 2+ commits, 5+ files -> 3+ commits, 10+ files -> 5+ commits
```

### Browser Provider 선택
```typescript
function createBuiltinSkills({ browserProvider = "playwright" }) {
  const browserSkill = browserProvider === "agent-browser" ? agentBrowserSkill : playwrightSkill
  return [browserSkill, frontendUiUxSkill, gitMasterSkill, devBrowserSkill]
}
```

### 스킬 발견 (`src/features/opencode-skill-loader/`)

| 소스 | 경로 |
|------|------|
| User Claude Skills | `~/.claude/commands/` |
| Global OpenCode Skills | `~/.config/opencode/skills/` |
| Project Claude Skills | `.claude/commands/` |
| Project OpenCode Skills | `.opencode/skills/` |

스킬 파일: Markdown + YAML frontmatter (description, model, allowed-tools 등)

### 스킬 해결 (Runtime)
```typescript
// delegate_task에서 load_skills 처리
const { resolved, notFound } = await resolveMultipleSkillsAsync(args.load_skills, options);
skillContent = Array.from(resolved.values()).join("\n\n");
// system 필드로 서브에이전트에 주입
await client.session.prompt({ body: { system: skillContent, ... } });
```

### Skill MCP Manager (`src/features/skill-mcp-manager/`)
스킬에 포함된 MCP 서버를 세션별로 관리. 세션 삭제 시 자동 연결 해제.

## Commands System

### Builtin Commands
```typescript
BuiltinCommandNameSchema = z.enum(["init-deep", "start-work"])
```

### Slashcommand Tool
명령어와 스킬 모두 `/command-name` 형태로 실행:
```typescript
createSlashcommandTool({ commands, skills: mergedSkills })
```

### Auto Slash Command Hook
메시지에서 슬래시 명령어 패턴 자동 감지.

## 설정에서 스킬 제어
```jsonc
{
  "disabled_skills": ["playwright"],
  "skills": {
    "my-skill": { "description": "...", "from": "path/to/skill.md" },
    "sources": ["./custom-skills/"]
  }
}
```

## 우리 프로젝트에의 시사점
1. Skill = Prompt Injection: 단순하지만 효과적
2. Skill + MCP: 도구와 instruction이 함께 배포
3. Multi-source Discovery: 4개 경로에서 유연한 배포
4. Git-Master: 커밋 스타일 자동 감지 + 원자적 커밋
5. Slash Commands: 스킬과 명령어 통합 접근
