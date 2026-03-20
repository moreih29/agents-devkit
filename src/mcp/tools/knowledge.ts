import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, writeFile, readdir } from 'fs/promises';
import { knowledgePath, KNOWLEDGE_ROOT, ensureDir } from '../../shared/paths.js';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// --- 메모리 캐시 ---

const knowledgeCache = new Map<string, { content: string; mtime: number }>();

async function readKnowledgeCached(path: string): Promise<string> {
  const cached = knowledgeCache.get(path);
  // 파일 존재 여부는 호출 전에 체크됨
  const content = await readFile(path, 'utf-8');
  // 내용이 같으면 캐시 히트로 간주 (mtime 체크 대신 간단한 길이 비교)
  if (cached && cached.content.length === content.length && cached.content === content) {
    return cached.content;
  }
  knowledgeCache.set(path, { content, mtime: Date.now() });
  return content;
}

export function registerKnowledgeTools(server: McpServer): void {
  server.tool(
    'lat_knowledge_read',
    'Read project knowledge (git-tracked, shared across team)',
    {
      topic: z.string().optional().describe('Specific topic name (e.g., "architecture", "conventions")'),
      tags: z.array(z.string()).optional().describe('Filter by tags (searches frontmatter)'),
    },
    async ({ topic, tags }) => {
      const knowledgeDir = join(KNOWLEDGE_ROOT, 'knowledge');

      if (topic) {
        const path = knowledgePath(topic);
        if (!existsSync(path)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ exists: false, topic }) }] };
        }
        const content = await readKnowledgeCached(path);
        return { content: [{ type: 'text' as const, text: content }] };
      }

      // 태그 검색 또는 전체 목록
      if (!existsSync(knowledgeDir)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ topics: [] }) }] };
      }

      const files = (await readdir(knowledgeDir)).filter((f) => f.endsWith('.md'));
      const results: Array<{ topic: string; preview: string }> = [];

      for (const file of files) {
        const filePath = join(knowledgeDir, file);
        const content = await readKnowledgeCached(filePath);

        if (tags && tags.length > 0) {
          const lowerContent = content.toLowerCase();
          const matched = tags.some((tag) => lowerContent.includes(tag.toLowerCase()));
          if (!matched) continue;
        }

        const firstLine = content.split('\n').find((l) => l.startsWith('# ')) ?? file;
        results.push({ topic: file.replace('.md', ''), preview: firstLine });
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ topics: results }) }] };
    }
  );

  server.tool(
    'lat_knowledge_write',
    'Write project knowledge (git-tracked). Use for long-term, team-shared information.',
    {
      topic: z.string().describe('Topic name (becomes filename: knowledge/{topic}.md)'),
      content: z.string().describe('Markdown content to write'),
      tags: z.array(z.string()).optional().describe('Tags for searchability'),
    },
    async ({ topic, content, tags }) => {
      const knowledgeDir = join(KNOWLEDGE_ROOT, 'knowledge');
      ensureDir(knowledgeDir);

      let body = content;
      if (tags && tags.length > 0) {
        body = `<!-- tags: ${tags.join(', ')} -->\n${content}`;
      }

      const path = knowledgePath(topic);
      await writeFile(path, body);
      // 캐시 무효화
      knowledgeCache.delete(path);

      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, topic, path }) }] };
    }
  );
}
