import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { statePath, ensureDir, sessionDir } from '../../shared/paths.js';
import { getSessionId } from '../../shared/session.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerStateTools(server: McpServer): void {
  server.tool(
    'lat_state_read',
    'Read runtime workflow state (e.g., sustain, parallel, pipeline)',
    {
      key: z.string().describe('State key (e.g., "sustain", "parallel", "pipeline")'),
      sessionId: z.string().optional().describe('Session ID. Uses current session if omitted.'),
    },
    async ({ key, sessionId }) => {
      const sid = sessionId ?? getSessionId();
      const path = statePath(sid, key);

      if (!existsSync(path)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ exists: false, key, sessionId: sid }) }] };
      }

      const data = JSON.parse(readFileSync(path, 'utf-8'));
      return { content: [{ type: 'text' as const, text: JSON.stringify({ exists: true, key, sessionId: sid, value: data }) }] };
    }
  );

  server.tool(
    'lat_state_write',
    'Write runtime workflow state',
    {
      key: z.string().describe('State key'),
      value: z.record(z.unknown()).describe('State value (JSON object)'),
      sessionId: z.string().optional().describe('Session ID. Uses current session if omitted.'),
    },
    async ({ key, value, sessionId }) => {
      const sid = sessionId ?? getSessionId();
      const dir = sessionDir(sid);
      ensureDir(dir);

      const path = statePath(sid, key);
      writeFileSync(path, JSON.stringify(value, null, 2));

      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, key, sessionId: sid }) }] };
    }
  );

  server.tool(
    'lat_state_clear',
    'Clear runtime workflow state',
    {
      key: z.string().describe('State key to clear'),
      sessionId: z.string().optional().describe('Session ID. Uses current session if omitted.'),
    },
    async ({ key, sessionId }) => {
      const sid = sessionId ?? getSessionId();

      // cruise: pipeline + sustain 한 번에 해제
      if (key === 'cruise') {
        const keys = ['pipeline', 'sustain'];
        const cleared: string[] = [];
        for (const k of keys) {
          const p = statePath(sid, k);
          if (existsSync(p)) { unlinkSync(p); cleared.push(k); }
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify({ cleared: true, key: 'cruise', clearedKeys: cleared, sessionId: sid }) }] };
      }

      const path = statePath(sid, key);

      if (existsSync(path)) {
        unlinkSync(path);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ cleared: true, key, sessionId: sid }) }] };
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ cleared: false, key, sessionId: sid, reason: 'not found' }) }] };
    }
  );
}
