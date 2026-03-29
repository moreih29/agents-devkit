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

/** .nexus/core/ — 4계층 구조 루트 */
export const CORE_ROOT = join(NEXUS_ROOT, 'core');

/** .nexus/state/ — 런타임 상태 파일 */
export const STATE_ROOT = join(NEXUS_ROOT, 'state');

export const LAYERS = ['identity', 'codebase', 'reference', 'memory'] as const;
export type Layer = typeof LAYERS[number];

/** core 계층 내 특정 토픽 파일 경로 */
export function corePath(layer: string, topic: string): string {
  return join(CORE_ROOT, layer, `${topic}.md`);
}

/** core 계층 디렉토리 경로 */
export function coreLayerDir(layer: string): string {
  return join(CORE_ROOT, layer);
}

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
!core/
!core/**
!config.json
!history.json
!rules/
!rules/**
`;

export function ensureNexusStructure(): void {
  ensureDir(NEXUS_ROOT);
  ensureDir(STATE_ROOT);
  const gitignorePath = join(NEXUS_ROOT, '.gitignore');
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, GITIGNORE_CONTENT);
  }
}
