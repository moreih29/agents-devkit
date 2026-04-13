import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { STATE_ROOT, getCurrentBranch } from '../../shared/paths.js';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '../../shared/mcp-utils.js';

export function registerContextTool(server: McpServer): void {
  server.tool(
    'nx_context',
    'Get context: tasks summary, decisions, branch',
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {} as Record<string, z.ZodType>,
    async () => {
      // 활성 모드 감지: tasks.json에서 읽기
      let teamStatus: { activeMode: 'team'; goal: string; tasksSummary: { total: number; completed: number; pending: number } } | { activeMode: null } = { activeMode: null };
      let decisions: string[] = [];
      const tasksFile = join(STATE_ROOT, 'tasks.json');
      if (existsSync(tasksFile)) {
        try {
          const data = JSON.parse(await readFile(tasksFile, 'utf-8'));
          const tasks: Array<{ status?: string }> = Array.isArray(data.tasks) ? data.tasks : [];
          const total = tasks.length;
          const completed = tasks.filter((t) => t.status === 'completed').length;
          const pending = tasks.filter((t) => t.status === 'pending').length;
          teamStatus = {
            activeMode: 'team',
            goal: data.goal ?? '',
            tasksSummary: { total, completed, pending },
          };
          decisions = Array.isArray(data.decisions) ? data.decisions : [];
        } catch {
          // skip
        }
      }

      const result = {
        branch: getCurrentBranch(),
        ...teamStatus,
        decisions,
      };

      return textResult(result);
    }
  );
}
