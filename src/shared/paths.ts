import { resolve, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

/** 프로젝트 루트 (.git이 있는 디렉토리) */
export function findProjectRoot(startDir?: string): string {
  let dir = startDir ?? process.cwd();
  while (dir !== '/') {
    if (existsSync(join(dir, '.git'))) return dir;
    dir = resolve(dir, '..');
  }
  return startDir ?? process.cwd();
}

const PROJECT_ROOT = findProjectRoot();

/** .nexus/ — 런타임 상태 */
export const NEXUS_ROOT = process.env.NEXUS_RUNTIME_ROOT || join(PROJECT_ROOT, '.nexus');

/** .nexus/state/ — 런타임 상태 파일 */
export const STATE_ROOT = join(NEXUS_ROOT, 'state');

/** harness identifier (npm package name의 마지막 세그먼트) */
export const HARNESS_ID = 'claude-nexus';

/** .nexus/state/claude-nexus/ — harness-local 상태 파일 */
export const HARNESS_STATE_ROOT = join(STATE_ROOT, HARNESS_ID);

/** .nexus/memory/ — 에이전트 공유 메모리 */
export const MEMORY_ROOT = join(NEXUS_ROOT, 'memory');

/** .nexus/context/ — 프로젝트 컨텍스트 */
export const CONTEXT_ROOT = join(NEXUS_ROOT, 'context');

/** 룰 파일 경로 */
export function rulesPath(name: string): string {
  return join(NEXUS_ROOT, 'rules', `${name}.md`);
}

/** 디렉토리 생성 (재귀) */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** 현재 git 브랜치명 반환. git 없으면 '_default' */
export function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
  } catch {
    try {
      return execSync('git symbolic-ref --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return '_default';
    }
  }
}

const GITIGNORE_CONTENT = `# Nexus: whitelist tracked files, ignore everything else
*
!.gitignore
!memory/
!memory/**
!context/
!context/**
!history.json
!rules/
!rules/**
`;

export function ensureNexusStructure(): void {
  ensureDir(NEXUS_ROOT);
  ensureDir(STATE_ROOT);
  ensureDir(HARNESS_STATE_ROOT);
  const gitignorePath = join(NEXUS_ROOT, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, GITIGNORE_CONTENT);
  }
}
