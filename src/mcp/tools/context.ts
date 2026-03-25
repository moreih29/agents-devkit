import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { getBranchRoot } from '../../shared/paths.js';
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
    'Get context: active team mode, tasks summary, branch',
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {} as Record<string, z.ZodType>,
    async () => {
      // 활성 모드 감지: tasks.json에서 읽기
      let teamStatus: { activeMode: 'team'; goal: string; tasksSummary: { total: number; completed: number; pending: number } } | { activeMode: null } = { activeMode: null };
      const tasksFile = join(getBranchRoot(), 'tasks.json');
      if (existsSync(tasksFile)) {
        try {
          const data = JSON.parse(await readFile(tasksFile, 'utf-8'));
          const tasks: Array<{ status?: string }> = Array.isArray(data.tasks) ? data.tasks : [];
          const total = tasks.length;
          const completed = tasks.filter((t) => t.status === 'completed').length;
          const pending = total - completed;
          teamStatus = {
            activeMode: 'team',
            goal: data.goal ?? '',
            tasksSummary: { total, completed, pending },
          };
        } catch {
          // skip
        }
      }

      const result = {
        branch: getCurrentBranch(),
        ...teamStatus,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );
}
