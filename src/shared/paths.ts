import { resolve, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';

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
export const RUNTIME_ROOT = process.env.NEXUS_RUNTIME_ROOT || join(PROJECT_ROOT, '.nexus');

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

/** 현재 git 브랜치명 반환. 실패 시 '_unknown' */
function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return '_unknown';
  }
}

/** 브랜치명을 파일시스템 안전한 형태로 변환 */
function sanitizeBranch(branch: string): string {
  if (branch === 'HEAD') {
    try {
      const hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
      return `_detached-${hash}`;
    } catch {
      return '_detached';
    }
  }
  return branch.replace(/[/\\:*?"<>|]/g, '-');
}

export const CURRENT_BRANCH = getCurrentBranch();
export const BRANCH_ROOT = join(RUNTIME_ROOT, sanitizeBranch(CURRENT_BRANCH));

