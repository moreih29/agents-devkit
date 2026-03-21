// 빌드 산출물을 마켓플레이스 경로에 동기화 (개발용)
// - marketplace/nexus → 이 프로젝트 및 마켓플레이스 기반 프로젝트용
// - installed_plugins.json → 안 건드림 (다른 프로젝트 보호)
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const PLUGIN_HOME = join(process.env.HOME ?? '~', '.claude/plugins');
const MARKETPLACE = join(PLUGIN_HOME, 'marketplaces/nexus');

const DIRS = ['.claude-plugin', 'bridge', 'scripts', 'hooks', 'agents', 'skills', 'src'];
const FILES = ['.mcp.json', 'package.json'];

function syncTo(target, label) {
  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true });
  }
  for (const dir of DIRS) {
    const dest = join(target, dir);
    if (existsSync(dest)) rmSync(dest, { recursive: true });
    if (existsSync(dir)) cpSync(dir, dest, { recursive: true });
  }
  for (const file of FILES) {
    if (existsSync(file)) cpSync(file, join(target, file));
  }
  console.log(`Synced to ${label}: ${target}`);
}

syncTo(MARKETPLACE, 'marketplace');
