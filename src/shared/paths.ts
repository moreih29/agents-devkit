import { resolve, join } from 'path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

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

/** 세션별 플랜 디렉토리 (.nexus/state/sessions/{sid}/plans/) */
export function plansDir(sessionId: string): string {
  return join(sessionDir(sessionId), 'plans');
}

/** 디렉토리 생성 (재귀) */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/** workflow.json의 phase를 갱신 (consult/plan 모드일 때만) */
export function updateWorkflowPhase(sid: string, phase: string): void {
  const workflowPath = join(sessionDir(sid), 'workflow.json');
  if (!existsSync(workflowPath)) return;
  try {
    const state = JSON.parse(readFileSync(workflowPath, 'utf-8'));
    if ((state.mode === 'consult' || state.mode === 'plan') && state.phase !== phase) {
      state.phase = phase;
      writeFileSync(workflowPath, JSON.stringify(state, null, 2));
    }
  } catch { /* skip */ }
}

/** 현재 워크플로우의 base phase 반환 (consult→exploring, plan→analyzing) */
export function getBasePhase(sid: string): string | null {
  const workflowPath = join(sessionDir(sid), 'workflow.json');
  if (!existsSync(workflowPath)) return null;
  try {
    const state = JSON.parse(readFileSync(workflowPath, 'utf-8'));
    if (state.mode === 'consult') return 'exploring';
    if (state.mode === 'plan') return 'analyzing';
  } catch { /* skip */ }
  return null;
}
