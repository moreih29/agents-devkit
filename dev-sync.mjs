// 빌드 산출물을 마켓플레이스 클론에만 동기화 (개발용)
// - marketplace/nexus → nexus 개발 프로젝트가 읽는 경로 (dev)
// - cache/nexus/claude-nexus/<version> → 다른 프로젝트가 읽는 경로 (안 건드림)
// - installed_plugins.json → 다른 프로젝트 설정 (안 건드림)
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const PLUGIN_HOME = join(process.env.HOME ?? '~', '.claude/plugins');
const MARKETPLACE = join(PLUGIN_HOME, 'marketplaces/nexus');

if (!existsSync(MARKETPLACE)) {
  mkdirSync(MARKETPLACE, { recursive: true });
  console.log(`Created marketplace: ${MARKETPLACE}`);
}

const DIRS = ['.claude-plugin', 'bridge', 'scripts', 'hooks', 'agents', 'skills', 'src'];

for (const dir of DIRS) {
  const target = join(MARKETPLACE, dir);
  if (existsSync(target)) {
    rmSync(target, { recursive: true });
  }
  if (existsSync(dir)) {
    cpSync(dir, target, { recursive: true });
  }
}

for (const file of ['.mcp.json', 'package.json']) {
  if (existsSync(file)) {
    cpSync(file, join(MARKETPLACE, file));
  }
}

console.log(`Synced to ${MARKETPLACE}`);
