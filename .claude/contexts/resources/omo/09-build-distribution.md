# OMO Build and Distribution 분석

## 빌드 시스템

### Bun 기반 빌드

OMO는 전적으로 Bun에 의존: 빌드, 테스트, 런타임 모두 Bun.

```json
{
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --target bun --format esm --external @ast-grep/napi && tsc --emitDeclarationOnly && bun build src/cli/index.ts --outdir dist/cli --target bun --format esm --external @ast-grep/napi && bun run build:schema",
    "build:all": "bun run build && bun run build:binaries",
    "build:binaries": "bun run script/build-binaries.ts",
    "build:schema": "bun run script/build-schema.ts",
    "clean": "rm -rf dist",
    "typecheck": "tsc --noEmit",
    "test": "bun test",
    "prepublishOnly": "bun run clean && bun run build"
  }
}
```

### 빌드 단계 상세

#### 1단계: 메인 번들 (ESM)
```bash
bun build src/index.ts --outdir dist --target bun --format esm --external @ast-grep/napi
```
- `--target bun`: Bun 런타임 최적화
- `--format esm`: ES Modules 출력
- `--external @ast-grep/napi`: 네이티브 바인딩은 번들에서 제외

#### 2단계: 타입 선언
```bash
tsc --emitDeclarationOnly
```
TypeScript 컴파일러로 `.d.ts` 파일만 생성. `tsconfig.json` 설정에 따라.

#### 3단계: CLI 번들
```bash
bun build src/cli/index.ts --outdir dist/cli --target bun --format esm --external @ast-grep/napi
```
CLI는 별도 번들. 플러그인과 분리.

#### 4단계: JSON Schema
```typescript
// script/build-schema.ts
const jsonSchema = z.toJSONSchema(OhMyOpenCodeConfigSchema, {
  io: "input", target: "draft-7"
})
```
Zod v4의 `toJSONSchema()`로 Draft-7 JSON Schema 자동 생성.

### 플랫폼 바이너리 빌드

```typescript
// script/build-binaries.ts
const PLATFORMS = [
  { dir: "darwin-arm64", target: "bun-darwin-arm64", binary: "oh-my-opencode" },
  { dir: "darwin-x64", target: "bun-darwin-x64", binary: "oh-my-opencode" },
  { dir: "linux-x64", target: "bun-linux-x64", binary: "oh-my-opencode" },
  { dir: "linux-arm64", target: "bun-linux-arm64", binary: "oh-my-opencode" },
  { dir: "linux-x64-musl", target: "bun-linux-x64-musl", binary: "oh-my-opencode" },
  { dir: "linux-arm64-musl", target: "bun-linux-arm64-musl", binary: "oh-my-opencode" },
  { dir: "windows-x64", target: "bun-windows-x64", binary: "oh-my-opencode.exe" },
]

// 각 플랫폼에 대해:
await $`bun build --compile --minify --sourcemap --bytecode \
  --target=${platform.target} src/cli/index.ts --outfile=packages/${dir}/bin/${binary}`
```

## TypeScript 설정

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "types": ["bun-types"],     // @types/node 대신 bun-types
    "declaration": true,
    "declarationDir": "dist",
    "outDir": "dist",
    "strict": true,
    "skipLibCheck": true
  }
}
```

핵심: `bun-types` 사용 (@types/node 금지).

## npm 배포

### exports 구성
```json
{
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./schema.json": "./dist/oh-my-opencode.schema.json"
  },
  "files": ["dist", "bin", "postinstall.mjs"]
}
```

### Postinstall
```javascript
// postinstall.mjs
import { getPlatformPackage, getBinaryPath } from "./bin/platform.js";
// 플랫폼 감지 -> 바이너리 존재 확인 -> 경고 메시지
```

`detect-libc`로 Linux glibc/musl 감지.

### CI/CD

GitHub Actions workflow_dispatch로만 배포:
```bash
gh workflow run publish -f bump=patch
```
- 직접 `bun publish` 금지
- 로컬 버전 범프 금지
- CI가 버전 관리

## 의존성

### Runtime Dependencies
```json
{
  "@ast-grep/cli": "^0.40.0",          // AST 검색 CLI
  "@ast-grep/napi": "^0.40.0",         // AST 네이티브 바인딩
  "@clack/prompts": "^0.11.0",         // CLI 프롬프트
  "@code-yeongyu/comment-checker": "^0.6.1",  // AI 슬롭 댓글 체크
  "@modelcontextprotocol/sdk": "^1.25.1",     // MCP SDK
  "@opencode-ai/plugin": "^1.1.19",    // OpenCode 플러그인 SDK
  "@opencode-ai/sdk": "^1.1.19",       // OpenCode SDK
  "commander": "^14.0.2",              // CLI 프레임워크
  "detect-libc": "^2.0.0",             // libc 감지
  "js-yaml": "^4.1.1",                 // YAML 파싱
  "jsonc-parser": "^3.3.1",            // JSONC 파싱
  "picocolors": "^1.1.1",              // 터미널 색상
  "picomatch": "^4.0.2",               // 글롭 패턴
  "zod": "^4.1.8"                      // 스키마 검증
}
```

### Dev Dependencies
```json
{
  "@types/js-yaml": "^4.0.9",
  "@types/picomatch": "^3.0.2",
  "bun-types": "latest",
  "typescript": "^5.7.3"
}
```

## 테스트

```bash
bun test  # 95개 테스트 파일
```

테스트 파일: `*.test.ts` (소스 파일 옆에 위치)
BDD 댓글: `#given`, `#when`, `#then`

## 코드 컨벤션 (AGENTS.md)

- 패키지 매니저: Bun only
- 타입: bun-types (NEVER @types/node)
- 빌드: `bun build` (ESM) + `tsc --emitDeclarationOnly`
- 내보내기: Barrel pattern via index.ts
- 네이밍: kebab-case 디렉토리, `createXXXHook`/`createXXXTool` 팩토리
- Temperature: 0.1 (코드 에이전트), max 0.3
- 안티패턴: `as any`, `@ts-ignore`, 빈 catch, Sequential 에이전트 호출

## 우리 프로젝트에의 시사점

1. **Bun 전용**: 빌드/테스트/런타임 통일이 DX 향상
2. **ESM + Declaration**: `bun build` + `tsc --emitDeclarationOnly` 조합
3. **JSON Schema 자동 생성**: Zod -> JSON Schema로 IDE 지원
4. **플랫폼 바이너리**: optional deps + postinstall 검증 패턴
5. **External Native**: 네이티브 바인딩을 --external로 번들에서 제외
6. **CI-only Publish**: 로컬 배포 방지로 일관된 버전 관리
