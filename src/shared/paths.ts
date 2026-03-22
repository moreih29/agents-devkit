import { resolve, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/** 프로젝트 루트 (.git이 있는 디렉토리) */
function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (existsSync(join(dir, '.git'))) return dir;
    dir = resolve(dir, '..');
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

/** .nexus/ — gitignore, 런타임 상태 */
export const RUNTIME_ROOT = join(PROJECT_ROOT, '.nexus');

/** .claude/nexus/ — git 추적, 공유 지식 */
export const KNOWLEDGE_ROOT = join(PROJECT_ROOT, '.claude', 'nexus');

/** 지식 파일 경로 */
export function knowledgePath(topic: string): string {
  return join(KNOWLEDGE_ROOT, 'knowledge', `${topic}.md`);
}

/** 디렉토리 생성 (재귀) */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

