import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { sessionDir, RUNTIME_ROOT } from '../../shared/paths.js';
import { getSessionId } from '../../shared/session.js';
import { execSync } from 'child_process';
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
    'lat_context',
    'Get aggregated context status: active mode, agents, session, branch',
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    {} as Record<string, z.ZodType>,
    async () => {
      const sessionId = getSessionId();
      const dir = sessionDir(sessionId);

      // 활성 모드 감지
      let activeMode: string | null = null;
      const modes = ['sustain', 'parallel', 'pipeline'];
      for (const mode of modes) {
        const stateFile = `${dir}/${mode}.json`;
        if (existsSync(stateFile)) {
          try {
            const data = JSON.parse(await readFile(stateFile, 'utf-8'));
            if (data.active) {
              activeMode = mode;
              break;
            }
          } catch {
            // skip
          }
        }
      }

      // 활성 에이전트 목록
      let agents: string[] = [];
      const agentsFile = `${dir}/agents.json`;
      if (existsSync(agentsFile)) {
        try {
          agents = JSON.parse(await readFile(agentsFile, 'utf-8')).active ?? [];
        } catch {
          // skip
        }
      }

      // 메모 수
      const memoPath = `${RUNTIME_ROOT}/memo`;
      let memoCount = 0;
      if (existsSync(memoPath)) {
        memoCount = (await readdir(memoPath)).filter((f) => f.endsWith('.json')).length;
      }

      const result = {
        sessionId,
        branch: getCurrentBranch(),
        activeMode,
        agents,
        memoCount,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );
}
