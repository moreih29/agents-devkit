import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, writeFile, readdir } from 'fs/promises';
import { rulesPath, KNOWLEDGE_ROOT, ensureDir } from '../../shared/paths.js';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerRulesTools(server: McpServer): void {
  server.tool(
    'nx_rules_read',
    'Read project rules (git-tracked, shared across team)',
    {
      name: z.string().optional().describe('Specific rule name (e.g., "coding-style", "review-checklist")'),
      tags: z.array(z.string()).optional().describe('Filter by tags (searches HTML comment frontmatter)'),
    },
    async ({ name, tags }) => {
      const rulesDir = join(KNOWLEDGE_ROOT, 'rules');

      if (name) {
        const path = rulesPath(name);
        if (!existsSync(path)) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ exists: false, name }) }] };
        }
        const content = await readFile(path, 'utf-8');
        return { content: [{ type: 'text' as const, text: content }] };
      }

      // 태그 검색 또는 전체 목록
      if (!existsSync(rulesDir)) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ rules: [] }) }] };
      }

      const files = (await readdir(rulesDir)).filter((f) => f.endsWith('.md'));
      const results: Array<{ name: string; preview: string }> = [];

      for (const file of files) {
        const filePath = join(rulesDir, file);
        const content = await readFile(filePath, 'utf-8');

        if (tags && tags.length > 0) {
          const lowerContent = content.toLowerCase();
          const matched = tags.some((tag) => lowerContent.includes(tag.toLowerCase()));
          if (!matched) continue;
        }

        const firstLine = content.split('\n').find((l) => l.startsWith('# ')) ?? file;
        results.push({ name: file.replace('.md', ''), preview: firstLine });
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify({ rules: results }) }] };
    }
  );

  server.tool(
    'nx_rules_write',
    'Write project rules (git-tracked). Use for team conventions, guidelines, and checklists.',
    {
      name: z.string().describe('Rule name (becomes filename: rules/{name}.md)'),
      content: z.string().describe('Markdown content to write'),
      tags: z.array(z.string()).optional().describe('Tags for searchability'),
    },
    async ({ name, content, tags }) => {
      const rulesDir = join(KNOWLEDGE_ROOT, 'rules');
      ensureDir(rulesDir);

      let body = content;
      if (tags && tags.length > 0) {
        body = `<!-- tags: ${tags.join(', ')} -->\n${content}`;
      }

      const path = rulesPath(name);
      await writeFile(path, body);

      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, name, path }) }] };
    }
  );
}
