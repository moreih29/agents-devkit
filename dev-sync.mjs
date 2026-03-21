// 빌드 산출물 + 변경 파일을 플러그인 캐시에 동기화
import { cpSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

const version = JSON.parse(readFileSync('.claude-plugin/plugin.json', 'utf-8')).version ?? '0.1.0';
const CACHE = join(
  process.env.HOME ?? '~',
  `.claude/plugins/cache/nexus/claude-nexus/${version}`
);

if (!existsSync(CACHE)) {
  console.error(`Cache not found: ${CACHE}`);
  console.error('Run: claude plugin install claude-nexus@nexus');
  process.exit(1);
}

const DIRS = ['bridge', 'scripts', 'hooks', 'agents', 'skills', 'src'];

for (const dir of DIRS) {
  if (existsSync(dir)) {
    cpSync(dir, join(CACHE, dir), { recursive: true });
  }
}

// 단일 파일
for (const file of ['.mcp.json', 'package.json']) {
  if (existsSync(file)) {
    cpSync(file, join(CACHE, file));
  }
}

console.log(`Synced to ${CACHE}`);
