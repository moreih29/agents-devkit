import { randomUUID } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { RUNTIME_ROOT, ensureDir } from './paths.js';

const SESSION_FILE = join(RUNTIME_ROOT, 'state', 'current-session.json');

/** 현재 세션 ID를 가져오거나 새로 생성 */
export function getSessionId(): string {
  if (existsSync(SESSION_FILE)) {
    try {
      const data = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'));
      if (data.sessionId && typeof data.sessionId === 'string') {
        return data.sessionId;
      }
    } catch {
      // 파싱 실패 시 새로 생성
    }
  }
  return createSession();
}

/** 현재 저장된 세션 ID를 읽기 (덮어쓰기 전 호출용) */
export function getPreviousSessionId(): string | null {
  if (existsSync(SESSION_FILE)) {
    try {
      const data = JSON.parse(readFileSync(SESSION_FILE, 'utf-8'));
      if (data.sessionId && typeof data.sessionId === 'string') {
        return data.sessionId;
      }
    } catch { /* skip */ }
  }
  return null;
}

/** 새 세션 생성 */
export function createSession(): string {
  const sessionId = randomUUID().slice(0, 8);
  ensureDir(join(RUNTIME_ROOT, 'state'));
  writeFileSync(SESSION_FILE, JSON.stringify({ sessionId, createdAt: new Date().toISOString() }));
  return sessionId;
}
