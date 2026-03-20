import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, writeFile, readdir, unlink } from 'fs/promises';
import { memoDir, ensureDir } from '../../shared/paths.js';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const TTL_VALUES = ['session', 'day', 'week'] as const;

interface MemoEntry {
  content: string;
  ttl: (typeof TTL_VALUES)[number];
  tags: string[];
  createdAt: string;
}

/** TTL에 따른 만료 시간 (ms) */
function ttlMs(ttl: MemoEntry['ttl']): number {
  switch (ttl) {
    case 'session': return 24 * 60 * 60 * 1000;  // 24h (세션 근사치)
    case 'day':     return 24 * 60 * 60 * 1000;
    case 'week':    return 7 * 24 * 60 * 60 * 1000;
  }
}

/** 만료된 메모인지 확인 */
function isExpired(entry: MemoEntry): boolean {
  const age = Date.now() - new Date(entry.createdAt).getTime();
  return age > ttlMs(entry.ttl);
}

export function registerMemoTools(server: McpServer): void {
  server.tool(
    'nx_memo_read',
    'Read session memos (volatile, gitignored). For short-term progress tracking.',
    {
      ttl: z.enum(TTL_VALUES).optional().describe('Filter by TTL'),
      tags: z.array(z.string()).optional().describe('Filter by tags'),
    },
    async ({ ttl, tags }) => {
      const dir = memoDir();
      if (!existsSync(dir)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ memos: [] }) }] };
      }

      const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
      const memos: Array<MemoEntry & { id: string }> = [];

      for (const file of files) {
        try {
          const entry: MemoEntry = JSON.parse(await readFile(join(dir, file), 'utf-8'));

          if (isExpired(entry)) {
            await unlink(join(dir, file));
            continue;
          }

          if (ttl && entry.ttl !== ttl) continue;
          if (tags && tags.length > 0) {
            const matched = tags.some((t) => entry.tags.includes(t));
            if (!matched) continue;
          }

          memos.push({ ...entry, id: file.replace('.json', '') });
        } catch {
          // 파싱 실패한 파일은 건너뜀
        }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ memos }) }] };
    }
  );

  server.tool(
    'nx_memo_write',
    'Write a session memo (volatile). Use for progress notes, temporary context.',
    {
      content: z.string().describe('Memo content'),
      ttl: z.enum(TTL_VALUES).default('session').describe('Time-to-live: session (24h), day, week'),
      tags: z.array(z.string()).default([]).describe('Tags for filtering'),
    },
    async ({ content, ttl, tags }) => {
      const dir = memoDir();
      ensureDir(dir);

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const entry: MemoEntry = {
        content,
        ttl,
        tags,
        createdAt: new Date().toISOString(),
      };

      await writeFile(join(dir, `${id}.json`), JSON.stringify(entry, null, 2));

      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, id, ttl }) }] };
    }
  );
}
