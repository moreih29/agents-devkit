// 빌드 산출물 + 변경 파일을 플러그인 캐시에 동기화
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';

const version = JSON.parse(readFileSync('.claude-plugin/plugin.json', 'utf-8')).version ?? '0.1.0';
const PLUGIN_HOME = join(process.env.HOME ?? '~', '.claude/plugins');
const CACHE = join(PLUGIN_HOME, `cache/nexus/claude-nexus/${version}`);

// 캐시 디렉토리 없으면 생성
if (!existsSync(CACHE)) {
  mkdirSync(CACHE, { recursive: true });
  console.log(`Created cache: ${CACHE}`);
}

// installed_plugins.json의 installPath를 현재 버전으로 갱신
const installedPath = join(PLUGIN_HOME, 'installed_plugins.json');
if (existsSync(installedPath)) {
  const installed = JSON.parse(readFileSync(installedPath, 'utf-8'));
  const entry = installed.plugins?.['claude-nexus@nexus'];
  if (entry) {
    let updated = false;
    for (const item of entry) {
      if (item.installPath !== CACHE) {
        item.installPath = CACHE;
        item.version = version;
        updated = true;
      }
    }
    if (updated) {
      writeFileSync(installedPath, JSON.stringify(installed, null, 2) + '\n');
      console.log(`Updated installed_plugins.json → v${version}`);
    }
  }
}

const DIRS = ['.claude-plugin', 'bridge', 'scripts', 'hooks', 'agents', 'skills', 'src'];

for (const dir of DIRS) {
  const target = join(CACHE, dir);
  if (existsSync(target)) {
    rmSync(target, { recursive: true });
  }
  if (existsSync(dir)) {
    cpSync(dir, target, { recursive: true });
  }
}

// 단일 파일
for (const file of ['.mcp.json', 'package.json']) {
  if (existsSync(file)) {
    cpSync(file, join(CACHE, file));
  }
}

// 마켓플레이스 클론도 동기화 (로컬 개발용)
const MARKETPLACE = join(PLUGIN_HOME, 'marketplaces/nexus');
if (existsSync(MARKETPLACE)) {
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
  console.log(`Synced marketplace: ${MARKETPLACE}`);
}

console.log(`Synced to ${CACHE}`);
