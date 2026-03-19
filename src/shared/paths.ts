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

/** .lattice/ — gitignore, 런타임 상태 */
export const RUNTIME_ROOT = join(PROJECT_ROOT, '.lattice');

/** .claude/lattice/ — git 추적, 공유 지식 */
export const KNOWLEDGE_ROOT = join(PROJECT_ROOT, '.claude', 'lattice');

/** 세션별 상태 디렉토리 */
export function sessionDir(sessionId: string): string {
  return join(RUNTIME_ROOT, 'state', 'sessions', sessionId);
}

/** 상태 파일 경로 */
export function statePath(sessionId: string, key: string): string {
  return join(sessionDir(sessionId), `${key}.json`);
}

/** 지식 파일 경로 */
export function knowledgePath(topic: string): string {
  return join(KNOWLEDGE_ROOT, 'knowledge', `${topic}.md`);
}

/** 메모 디렉토리 */
export function memoDir(): string {
  return join(RUNTIME_ROOT, 'memo');
}

/** 디렉토리 생성 (재귀) */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
