import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export function getCurrentVersion(): string {
  try {
    // CLAUDE_PLUGIN_ROOT가 있으면 항상 정확한 플러그인 루트 기준으로 찾음
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    const versionFile = pluginRoot
      ? join(pluginRoot, 'VERSION')
      : join(__dirname, '..', 'VERSION');
    if (existsSync(versionFile)) return readFileSync(versionFile, 'utf-8').trim();
  } catch { /* skip */ }
  return '';
}
