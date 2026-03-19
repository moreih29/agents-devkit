import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { knowledgePath, KNOWLEDGE_ROOT, ensureDir } from '../../shared/paths.js';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

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
        const content = readFileSync(path, 'utf-8');
        return { content: [{ type: 'text' as const, text: content }] };
      }

      // 태그 검색 또는 전체 목록
      if (!existsSync(knowledgeDir)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ topics: [] }) }] };
      }

      const files = readdirSync(knowledgeDir).filter((f) => f.endsWith('.md'));
      const results: Array<{ topic: string; preview: string }> = [];

      for (const file of files) {
        const content = readFileSync(join(knowledgeDir, file), 'utf-8');

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
      writeFileSync(path, body);

      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, topic, path }) }] };
    }
  );
}
