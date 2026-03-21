import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, writeFile, unlink } from 'fs/promises';
import { statePath, ensureDir, sessionDir } from '../../shared/paths.js';
import { getSessionId } from '../../shared/session.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { join } from 'path';

const MODE_KEYS = new Set(['consult', 'plan', 'workflow']);

export function registerStateTools(server: McpServer): void {
  server.tool(
    'nx_state_read',
    'Read runtime workflow state (e.g., workflow, consult, plan)',
    {
      key: z.string().describe('State key (e.g., "workflow", "consult", "plan"). Use "workflow" to read the unified workflow state.'),
      sessionId: z.string().optional().describe('Session ID. Uses current session if omitted.'),
    },
    async ({ key, sessionId }) => {
      const sid = sessionId ?? getSessionId();

      // mode keys all read from workflow.json
      const path = MODE_KEYS.has(key)
        ? join(sessionDir(sid), 'workflow.json')
        : statePath(sid, key);

      if (!existsSync(path)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ exists: false, key, sessionId: sid }) }] };
      }

      const data = JSON.parse(await readFile(path, 'utf-8'));
      return { content: [{ type: 'text' as const, text: JSON.stringify({ exists: true, key, sessionId: sid, value: data }) }] };
    }
  );

  server.tool(
    'nx_state_write',
    'Write runtime workflow state',
    {
      key: z.string().describe('State key. Use "workflow" to write the unified workflow state.'),
      value: z.record(z.unknown()).describe('State value (JSON object)'),
      sessionId: z.string().optional().describe('Session ID. Uses current session if omitted.'),
    },
    async ({ key, value, sessionId }) => {
      const sid = sessionId ?? getSessionId();
      const dir = sessionDir(sid);
      ensureDir(dir);

      // mode keys all write to workflow.json
      const path = MODE_KEYS.has(key)
        ? join(dir, 'workflow.json')
        : statePath(sid, key);

      await writeFile(path, JSON.stringify(value, null, 2));

      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, key, sessionId: sid }) }] };
    }
  );

  server.tool(
    'nx_state_clear',
    'Clear runtime workflow state',
    {
      key: z.string().describe('State key to clear. Mode keys (consult, plan, workflow) all clear workflow.json.'),
      sessionId: z.string().optional().describe('Session ID. Uses current session if omitted.'),
    },
    async ({ key, sessionId }) => {
      const sid = sessionId ?? getSessionId();

      // mode keys all clear workflow.json
      if (MODE_KEYS.has(key)) {
        const workflowPath = join(sessionDir(sid), 'workflow.json');
        if (existsSync(workflowPath)) {
          await unlink(workflowPath);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ cleared: true, key, clearedFile: 'workflow.json', sessionId: sid }) }] };
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ cleared: false, key, sessionId: sid, reason: 'not found' }) }] };
      }

      const path = statePath(sid, key);

      if (existsSync(path)) {
        await unlink(path);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ cleared: true, key, sessionId: sid }) }] };
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ cleared: false, key, sessionId: sid, reason: 'not found' }) }] };
    }
  );
}
