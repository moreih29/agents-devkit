# OMC Build and Distribution

## 1. 빌드 파이프라인

### package.json scripts

```json
{
  "build": "tsc && node scripts/build-skill-bridge.mjs && node scripts/build-mcp-server.mjs && node scripts/build-bridge-entry.mjs && npm run compose-docs && npm run build:runtime-cli && npm run build:team-server && npm run build:cli",
  "build:bridge": "node scripts/build-skill-bridge.mjs",
  "build:bridge-entry": "node scripts/build-bridge-entry.mjs",
  "build:cli": "node scripts/build-cli.mjs",
  "build:runtime-cli": "node scripts/build-runtime-cli.mjs",
  "build:team-server": "node scripts/build-team-server.mjs",
  "dev": "tsc --watch",
  "prepublishOnly": "npm run build && npm run compose-docs"
}
```

### 빌드 순서

```
1. tsc                        → dist/  (ESM, .js + .d.ts)
2. build-skill-bridge.mjs     → dist/hooks/skill-bridge.cjs
3. build-mcp-server.mjs       → bridge/mcp-server.cjs
4. build-bridge-entry.mjs     → bridge/team-bridge.cjs
5. compose-docs               → docs/ 합성
6. build-runtime-cli.mjs      → bridge/runtime-cli.cjs
7. build-team-server.mjs      → bridge/team-mcp.cjs
8. build-cli.mjs              → bridge/cli.cjs
```

## 2. TypeScript 컴파일

### tsconfig.json 주요 설정 (추정)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "declaration": true,
    "strict": true
  }
}
```

- `type: "module"` (package.json) → ESM 출력
- `dist/` 디렉토리에 .js + .d.ts 생성
- main: `dist/index.js`, types: `dist/index.d.ts`

## 3. esbuild Bridge 번들

모든 bridge 파일은 esbuild로 CJS 번들을 생성한다. 이유:
1. Claude Code plugin은 단일 파일 실행이 안정적
2. Node.js native module은 CJS에서 더 잘 동작
3. `node_modules` 없이 실행 가능해야 함

### build-mcp-server.mjs (대표적 빌드 스크립트)

```javascript
import * as esbuild from 'esbuild';

const banner = `
// Resolve global npm modules for native package imports
try {
  var _cp = require('child_process');
  var _Module = require('module');
  var _globalRoot = _cp.execSync('npm root -g', { encoding: 'utf8', timeout: 5000 }).trim();
  if (_globalRoot) {
    var _sep = process.platform === 'win32' ? ';' : ':';
    process.env.NODE_PATH = _globalRoot + (process.env.NODE_PATH ? _sep + process.env.NODE_PATH : '');
    _Module._initPaths();
  }
} catch (_e) {}
`;

await esbuild.build({
  entryPoints: ['src/mcp/standalone-server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile: 'bridge/mcp-server.cjs',
  banner: { js: banner },
  mainFields: ['module', 'main'],  // ESM 우선
  external: [
    // Node.js built-ins
    'fs', 'path', 'os', 'util', 'stream', 'events', 'buffer', 'crypto',
    'http', 'https', 'url', 'child_process', 'assert', 'module', 'net',
    'tls', 'dns', 'readline', 'tty', 'worker_threads',
    // Native modules (번들 불가)
    '@ast-grep/napi',
    'better-sqlite3',
  ],
});
```

### Banner의 역할

```javascript
var _globalRoot = _cp.execSync('npm root -g', { encoding: 'utf8' }).trim();
process.env.NODE_PATH = _globalRoot + ':' + process.env.NODE_PATH;
_Module._initPaths();  // NODE_PATH 변경을 Module 시스템에 반영
```

Plugin cache에서 실행될 때 `@ast-grep/napi` 같은 native module이 global npm에 설치되어 있으면 찾을 수 있도록 한다.

### Agent Prompt 인라인

빌드 스크립트에서 `__AGENT_PROMPTS__` define을 사용하여 agent markdown 파일을 번들에 인라인:

```javascript
// build-cli.mjs (추정)
esbuild.build({
  define: {
    '__AGENT_PROMPTS__': JSON.stringify(agentPromptsMap)
  }
});
```

이렇게 하면 런타임에 파일시스템 읽기 없이 agent prompt에 접근할 수 있다.

## 4. 출력 파일

### bridge/ 디렉토리 (CJS 번들)

| 파일 | 엔트리포인트 | 용도 |
|------|-------------|------|
| `mcp-server.cjs` | `src/mcp/standalone-server.ts` | Standalone MCP 서버 |
| `team-bridge.cjs` | `src/team/bridge-entry.ts` | Team bridge |
| `team-mcp.cjs` | team MCP 서버 | Team worker용 MCP |
| `cli.cjs` | CLI 엔트리 | `omc` CLI 명령어 |
| `runtime-cli.cjs` | runtime CLI | Runtime 관리 |

### dist/ 디렉토리 (ESM)

TypeScript 컴파일 출력. 구조가 `src/`를 미러링:
```
dist/
├── index.js + index.d.ts
├── agents/
├── config/
├── features/
├── hooks/
├── hud/
├── lib/
├── mcp/
├── notifications/
├── planning/
├── team/
├── tools/
└── utils/
```

## 5. npm 배포

### package.json files 배열

```json
{
  "files": [
    "dist",          # TypeScript 컴파일 출력
    "agents",        # Agent markdown 정의
    "bridge",        # esbuild 번들
    "commands",      # CLI 명령어
    "hooks",         # hooks.json
    "scripts",       # Hook 스크립트
    "skills",        # Skill 정의
    "templates",     # 템플릿
    "docs",          # 문서
    ".claude-plugin",# Plugin manifest
    ".mcp.json",     # MCP 서버 설정
    "README.md",
    "LICENSE"
  ]
}
```

### bin 필드

```json
{
  "bin": {
    "oh-my-claudecode": "bridge/cli.cjs",
    "omc": "bridge/cli.cjs",
    "omc-cli": "bridge/cli.cjs"
  }
}
```

3개의 명령어가 모두 `bridge/cli.cjs`를 가리킨다.

### Engine 요구사항

```json
{
  "engines": { "node": ">=20.0.0" }
}
```

## 6. Plugin Packaging

### .claude-plugin 형식

Claude Code plugin은 `.claude-plugin/` 디렉토리를 포함하는 npm 패키지:

```
.claude-plugin/
├── plugin.json       # skills, mcpServers 경로 선언
└── marketplace.json  # Marketplace 메타데이터
```

Claude Code가 plugin을 설치하면:
1. npm에서 패키지 다운로드
2. `~/.claude/plugins/cache/{publisher}/{package}/{version}/`에 설치
3. `$CLAUDE_PLUGIN_ROOT` 환경변수 설정
4. hooks.json 등록
5. skills/ 디렉토리 스캔하여 slash command 등록
6. .mcp.json으로 MCP 서버 등록

### Plugin Cache 구조

```
~/.claude/plugins/cache/omc/oh-my-claudecode/
├── 4.8.2/          # 현재 버전 (실제 디렉토리)
├── 4.8.1 -> 4.8.2  # symlink (session-start에서 관리)
└── 4.8.0 -> 4.8.2  # symlink
```

최신 2개 버전만 실제 디렉토리로 유지하고, 나머지는 최신 버전으로의 symlink로 대체된다.

## 7. 테스트

### vitest 설정

```json
{
  "test": "vitest",
  "test:run": "vitest run",
  "test:coverage": "vitest run --coverage",
  "test:ui": "vitest --ui"
}
```

테스트 파일: `src/**/__tests__/` 디렉토리와 `tests/` 디렉토리

### 벤치마크

```json
{
  "bench:prompts": "tsx benchmarks/run-all.ts",
  "bench:prompts:save": "tsx benchmarks/run-all.ts --save-baseline",
  "bench:prompts:compare": "tsx benchmarks/run-all.ts --compare"
}
```

프롬프트 품질 벤치마크 시스템.

## 8. 기타 빌드 스크립트

| 스크립트 | 용도 |
|---------|------|
| `compose-docs.mjs` | 문서 합성 |
| `release.ts` | 릴리스 자동화 (tsx 실행) |
| `sync-metadata.ts` | 메타데이터 동기화 |
| `generate-featured-contributors.ts` | 기여자 목록 생성 |
| `plugin-setup.mjs` | Plugin 설치 후 설정 |
| `cleanup-orphans.mjs` | 고아 프로세스 정리 |

## 9. 개발 워크플로우

```bash
# 개발 시
npm run dev          # tsc --watch (ESM 출력만)

# 전체 빌드
npm run build        # tsc + 모든 bridge 번들

# 테스트
npm test             # vitest (watch mode)
npm run test:run     # vitest run (single pass)

# 린트/포맷
npm run lint         # eslint src
npm run format       # prettier --write src/**/*.ts

# 릴리스
npm run release      # 릴리스 스크립트
```

## 10. 외부 도구 의존성 (런타임)

OMC가 정상 동작하려면 다음 도구가 시스템에 설치되어야 한다:

| 도구 | 용도 | 필수 여부 |
|------|------|----------|
| Node.js >= 20 | 런타임 | 필수 |
| npm | 패키지 관리 | 필수 |
| git | worktree, merge | Team 기능 필수 |
| tmux | Team worker 관리 | Team 기능 필수 |
| @ast-grep/napi (global) | AST 도구 | 선택 (graceful degradation) |
| better-sqlite3 (global) | Swarm DB | 선택 (graceful degradation) |
| Codex CLI | Codex worker | /team codex 사용 시 |
| Gemini CLI | Gemini worker | /team gemini 사용 시 |
