import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { sessionDir } from '../../shared/paths.js';
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

      // 활성 모드 감지: workflow.json에서 직접 읽기
      let activeMode: string | null = null;
      const workflowFile = join(dir, 'workflow.json');
      if (existsSync(workflowFile)) {
        try {
          const data = JSON.parse(await readFile(workflowFile, 'utf-8'));
          if (data.mode && data.mode !== 'idle') {
            activeMode = data.mode;
          }
        } catch {
          // skip
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
        activeMode,
        agents,
        codebaseType,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );
}
