import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { sessionDir, RUNTIME_ROOT } from '../../shared/paths.js';
import { getSessionId } from '../../shared/session.js';
import { execSync } from 'child_process';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** 현재 git 브랜치명 */
function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

export function registerContextTool(server: McpServer): void {
  server.tool(
    'nx_context',
    'Get aggregated context status: active mode, agents, session, branch, codebase profile',
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {} as Record<string, z.ZodType>,
    async () => {
      const sessionId = getSessionId();
      const dir = sessionDir(sessionId);

      // 활성 모드 감지: tasks.json에서 읽기
      let planStatus: { activeMode: 'plan'; goal: string; tasksSummary: { total: number; completed: number; pending: number } } | { activeMode: null } = { activeMode: null };
      const tasksFile = join(RUNTIME_ROOT, 'tasks.json');
      if (existsSync(tasksFile)) {
        try {
          const data = JSON.parse(await readFile(tasksFile, 'utf-8'));
          const tasks: Array<{ status?: string }> = Array.isArray(data.tasks) ? data.tasks : [];
          const total = tasks.length;
          const completed = tasks.filter((t) => t.status === 'done').length;
          const pending = total - completed;
          planStatus = {
            activeMode: 'plan',
            goal: data.goal ?? '',
            tasksSummary: { total, completed, pending },
          };
        } catch {
          // skip
        }
      }

      // 코드베이스 프로파일
      let codebaseType: string | null = null;
      const profileFile = join(dir, 'codebase-profile.json');
      if (existsSync(profileFile)) {
        try {
          const profile = JSON.parse(await readFile(profileFile, 'utf-8'));
          codebaseType = profile.type ?? null;
        } catch {
          // skip
        }
      }

      const result = {
        sessionId,
        branch: getCurrentBranch(),
        ...planStatus,
        codebaseType,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );
}
