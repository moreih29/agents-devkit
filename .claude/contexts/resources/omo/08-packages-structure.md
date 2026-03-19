# OMO Monorepo and Packages 분석

## 패키지 구조

### 7개 플랫폼별 바이너리 패키지

```
packages/
├── darwin-arm64/       # macOS ARM64 (Apple Silicon)
├── darwin-x64/         # macOS x64 (Intel)
├── linux-x64/          # Linux x64 (glibc)
├── linux-arm64/        # Linux ARM64 (glibc)
├── linux-x64-musl/     # Linux x64 (musl - Alpine 등)
├── linux-arm64-musl/   # Linux ARM64 (musl)
└── windows-x64/        # Windows x64
```

### Optional Dependencies 패턴

`package.json`에서 각 플랫폼 패키지를 optionalDependencies로 선언:
```json
{
  "optionalDependencies": {
    "oh-my-opencode-darwin-arm64": "3.0.1",
    "oh-my-opencode-darwin-x64": "3.0.1",
    "oh-my-opencode-linux-arm64": "3.0.1",
    "oh-my-opencode-linux-arm64-musl": "3.0.1",
    "oh-my-opencode-linux-x64": "3.0.1",
    "oh-my-opencode-linux-x64-musl": "3.0.1",
    "oh-my-opencode-windows-x64": "3.0.1"
  }
}
```

npm은 현재 플랫폼에 맞는 optional dependency만 설치. 나머지는 무시.

### Postinstall 검증 (`postinstall.mjs`)

```javascript
import { getPlatformPackage, getBinaryPath } from "./bin/platform.js";

function main() {
  const { platform, arch } = process;
  const libcFamily = getLibcFamily();  // Linux: glibc vs musl 감지
  const pkg = getPlatformPackage({ platform, arch, libcFamily });
  const binPath = getBinaryPath(pkg, platform);
  require.resolve(binPath);  // 바이너리 존재 확인
}
```

`detect-libc` 라이브러리로 Linux의 libc 종류(glibc/musl) 감지.

### CLI 바이너리 (`bin/oh-my-opencode.js`)

플랫폼별 바이너리를 찾아 실행하는 launcher 스크립트:
```json
{
  "bin": {
    "oh-my-opencode": "./bin/oh-my-opencode.js"
  }
}
```

## 빌드 시스템

### 바이너리 빌드 (`script/build-binaries.ts`)

Bun의 `--compile` 옵션으로 standalone 바이너리 생성:

```typescript
const PLATFORMS: PlatformTarget[] = [
  { dir: "darwin-arm64", target: "bun-darwin-arm64", binary: "oh-my-opencode" },
  { dir: "darwin-x64", target: "bun-darwin-x64", binary: "oh-my-opencode" },
  { dir: "linux-x64", target: "bun-linux-x64", binary: "oh-my-opencode" },
  // ... 7개 플랫폼
  { dir: "windows-x64", target: "bun-windows-x64", binary: "oh-my-opencode.exe" },
]

async function buildPlatform(platform) {
  await $`bun build --compile --minify --sourcemap --bytecode \
    --target=${platform.target} ${ENTRY_POINT} --outfile=${outfile}`;
}
```

빌드 옵션:
- `--compile`: standalone 바이너리
- `--minify`: 코드 축소
- `--sourcemap`: 소스맵 포함
- `--bytecode`: 바이트코드 사전 컴파일
- `--target`: 타겟 플랫폼 (bun-{os}-{arch})

진입점: `src/cli/index.ts`

### 메인 빌드 (`package.json` scripts)

```json
{
  "build": "bun build src/index.ts --outdir dist --target bun --format esm --external @ast-grep/napi && tsc --emitDeclarationOnly && bun build src/cli/index.ts --outdir dist/cli --target bun --format esm --external @ast-grep/napi && bun run build:schema",
  "build:schema": "bun run script/build-schema.ts",
  "build:binaries": "bun run script/build-binaries.ts",
  "build:all": "bun run build && bun run build:binaries"
}
```

빌드 단계:
1. `src/index.ts` -> `dist/index.js` (ESM, @ast-grep/napi external)
2. `tsc --emitDeclarationOnly` -> `dist/*.d.ts` (타입 선언)
3. `src/cli/index.ts` -> `dist/cli/index.js` (CLI ESM)
4. `build:schema` -> JSON Schema 생성

### JSON Schema 생성 (`script/build-schema.ts`)

```typescript
import { OhMyOpenCodeConfigSchema } from "../src/config/schema"
const jsonSchema = z.toJSONSchema(OhMyOpenCodeConfigSchema, {
  io: "input", target: "draft-7"
})
await Bun.write("assets/oh-my-opencode.schema.json", JSON.stringify(finalSchema))
```

Zod v4의 `toJSONSchema()`로 자동 JSON Schema 생성 -> IDE 자동완성 지원.

## 배포

### npm 배포 구조

```json
{
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist", "bin", "postinstall.mjs"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./schema.json": "./dist/oh-my-opencode.schema.json"
  }
}
```

### GitHub Actions 배포
```bash
gh workflow run publish -f bump=patch  # 패치 버전 업
# 절대 직접 bun publish 금지
```

## Trusted Dependencies

```json
{
  "trustedDependencies": [
    "@ast-grep/cli",
    "@ast-grep/napi",
    "@code-yeongyu/comment-checker"
  ]
}
```

이 패키지들의 postinstall 스크립트 실행을 허용.

## 우리 프로젝트에의 시사점

1. **Optional Dependencies**: 플랫폼별 바이너리를 optional deps로 배포하는 패턴
2. **Bun Compile**: `bun build --compile`로 standalone 바이너리 생성 (Node.js 불필요)
3. **libc 감지**: Alpine Linux 등 musl 환경 자동 감지
4. **JSON Schema**: Zod -> JSON Schema 자동 생성으로 IDE 지원
5. **External Native**: @ast-grep/napi를 external로 처리 (네이티브 바인딩)
