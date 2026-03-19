# Lattice 개발 컨벤션

## 코드 스타일

- **언어**: TypeScript (strict mode)
- **모듈**: ESM (`"type": "module"`)
- **브릿지 파일**: esbuild CJS 번들 (Claude Code 호환 필수)
- **포매터**: Prettier
- **린터**: ESLint

## 네이밍 규칙

### 파일/디렉토리
- kebab-case: `mcp-server.ts`, `knowledge-manager.ts`
- 에이전트 정의: `agents/{name}.md` (소문자)
- 스킬 정의: `skills/{name}/SKILL.md`
- 훅 스크립트: `scripts/{module}.cjs` (단일 CJS)

### 코드
- 팩토리 함수: `createXXX()` 패턴 (omo에서 채택)
- 타입 export: barrel pattern (`index.ts`)
- 에이전트 이름: 소문자 (steward, artisan, scout 등)
- MCP 도구: `lat_` 접두사 (`lat_state_read`, `lat_knowledge_write` 등)

## 에이전트 정의 포맷

```markdown
---
name: {name}
tier: high | medium | low
context: minimal | standard | full
disallowedTools: []
tags: [tag1, tag2]
---
<Role>역할 설명</Role>
<Guidelines>작업 지침</Guidelines>
```

## 설정 파일

- 프로젝트: `.claude/lattice.jsonc` (JSONC, 주석 지원)
- 사용자: `~/.claude/lattice.jsonc`
- 검증: Zod strict 모드 (오타 에러 발생)

## 커밋 메시지

```
{type}: {description}

type: feat, fix, refactor, docs, test, chore
scope: agent, hook, mcp, skill, config, build
```

## 테스트

- 프레임워크: Vitest
- 파일: `*.test.ts` (소스 옆에 배치)
- 커버리지: 핵심 모듈(훅, MCP 도구) 필수

## 빌드 규칙

- `tsc` → `dist/` (ESM + 타입 선언)
- `esbuild` → `bridge/mcp-server.cjs` (CJS 번들)
- 네이티브 모듈(`@ast-grep/napi`) → external 처리, 별도 패키지 (`claude-lattice-code-intel`)
- 에이전트 프롬프트 → 빌드 시 인라인 (`__AGENT_PROMPTS__`)

## 설정 스키마 (Zod)

```typescript
import { z } from 'zod';

export const latticeConfigSchema = z.object({
  tiers: z.object({
    high: z.string().default('opus'),
    medium: z.string().default('sonnet'),
    low: z.string().default('haiku'),
  }).default({}),
  agents: z.record(z.string(), z.object({
    tier: z.enum(['high', 'medium', 'low']).optional(),
    context: z.enum(['minimal', 'standard', 'full']).optional(),
    appendPrompt: z.string().optional(),
    disabledTools: z.array(z.string()).optional(),
  })).default({}),
  disabledModules: z.array(
    z.enum(['gate', 'pulse', 'memory', 'tracker', 'guard'])
  ).default([]),
  whisper: z.object({
    maxRepeat: z.number().default(3),
    adaptiveThreshold: z.number().default(60),
  }).default({}),
  codeIntel: z.object({
    lsp: z.boolean().default(false),
    ast: z.boolean().default(false),
  }).default({}),
}).strict();
```

`.strict()`: 미지원 키가 있으면 에러 발생 (오타 방지).

## 패키지 구조

```json
{
  "name": "claude-lattice",
  "type": "module",
  "files": [
    "agents",          // 마크다운 에이전트 정의
    "skills",          // 워크플로우 스킬
    "hooks",           // hooks.json
    "scripts",         // Gate, Pulse, Tracker CJS 스크립트
    "bridge",          // MCP 서버 CJS 번들
    ".claude-plugin",  // 플러그인 매니페스트
    ".mcp.json"        // MCP 서버 설정
  ]
}
```
