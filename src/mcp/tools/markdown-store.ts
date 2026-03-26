import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, writeFile, readdir } from 'fs/promises';
import { ensureDir } from '../../shared/paths.js';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { textResult } from '../../shared/mcp-utils.js';

interface MarkdownStoreConfig {
  toolPrefix: string;       // 'nx_knowledge' | 'nx_rules'
  entityName: string;       // 'topic' | 'name'
  dirPath: string;          // absolute dir path
  pathFn: (key: string) => string;  // knowledgePath | rulesPath
  listKey: string;          // 'topics' | 'rules'
  cache: boolean;
}

// 캐시: toolPrefix → (filePath → content)
const caches = new Map<string, Map<string, string>>();

function getCache(prefix: string): Map<string, string> {
  if (!caches.has(prefix)) caches.set(prefix, new Map());
  return caches.get(prefix)!;
}

async function readMaybeCached(prefix: string, path: string, useCache: boolean): Promise<string> {
  const content = await readFile(path, 'utf-8');
  if (!useCache) return content;
  const cache = getCache(prefix);
  const cached = cache.get(path);
  if (cached === content) return cached;
  cache.set(path, content);
  return content;
}

function invalidateCache(prefix: string, path: string): void {
  getCache(prefix).delete(path);
}

export function registerMarkdownStore(server: McpServer, config: MarkdownStoreConfig): void {
  const { toolPrefix, entityName, dirPath, pathFn, listKey, cache } = config;

  const readDesc =
    toolPrefix === 'nx_knowledge'
      ? 'Read project knowledge (git-tracked, shared across team)'
      : 'Read project rules (git-tracked, shared across team)';

  const writeDesc =
    toolPrefix === 'nx_knowledge'
      ? 'Write project knowledge (git-tracked). Use for long-term, team-shared information.'
      : 'Write project rules (git-tracked). Use for team conventions, guidelines, and checklists.';

  const readEntityDesc =
    toolPrefix === 'nx_knowledge'
      ? 'Specific topic name (e.g., "architecture", "conventions")'
      : 'Specific rule name (e.g., "coding-style", "review-checklist")';

  const tagDesc =
    toolPrefix === 'nx_knowledge'
      ? 'Filter by tags (searches frontmatter)'
      : 'Filter by tags (searches HTML comment frontmatter)';

  const writeEntityDesc =
    toolPrefix === 'nx_knowledge'
      ? 'Topic name (becomes filename: knowledge/{topic}.md)'
      : 'Rule name (becomes filename: rules/{name}.md)';

  // READ tool
  server.tool(
    `${toolPrefix}_read`,
    readDesc,
    {
      [entityName]: z.string().optional().describe(readEntityDesc),
      tags: z.array(z.string()).optional().describe(tagDesc),
    },
    async (params: Record<string, unknown>) => {
      const key = params[entityName] as string | undefined;
      const tags = params.tags as string[] | undefined;

      if (key) {
        const path = pathFn(key);
        if (!existsSync(path)) {
          return textResult({ exists: false, [entityName]: key });
        }
        const content = await readMaybeCached(toolPrefix, path, cache);
        return { content: [{ type: 'text' as const, text: content }] };
      }

      // 태그 검색 또는 전체 목록
      if (!existsSync(dirPath)) {
        return textResult({ [listKey]: [] });
      }

      const files = (await readdir(dirPath)).filter((f) => f.endsWith('.md'));
      const results: Array<Record<string, string>> = [];

      for (const file of files) {
        const filePath = join(dirPath, file);
        const content = await readMaybeCached(toolPrefix, filePath, cache);

        if (tags && tags.length > 0) {
          const lowerContent = content.toLowerCase();
          const matched = tags.some((tag) => lowerContent.includes(tag.toLowerCase()));
          if (!matched) continue;
        }

        const firstLine = content.split('\n').find((l) => l.startsWith('# ')) ?? file;
        results.push({ [entityName]: file.replace('.md', ''), preview: firstLine });
      }

      return textResult({ [listKey]: results });
    }
  );

  // WRITE tool
  server.tool(
    `${toolPrefix}_write`,
    writeDesc,
    {
      [entityName]: z.string().describe(writeEntityDesc),
      content: z.string().describe('Markdown content to write'),
      tags: z.array(z.string()).optional().describe('Tags for searchability'),
    },
    async (params: Record<string, unknown>) => {
      const key = params[entityName] as string;
      const content = params.content as string;
      const tags = params.tags as string[] | undefined;

      ensureDir(dirPath);

      let body = content;
      if (tags && tags.length > 0) {
        body = `<!-- tags: ${tags.join(', ')} -->\n${content}`;
      }

      const path = pathFn(key);
      await writeFile(path, body);
      if (cache) invalidateCache(toolPrefix, path);

      return textResult({ success: true, [entityName]: key, path });
    }
  );
}
