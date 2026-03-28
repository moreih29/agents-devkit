import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CORE_ROOT, LAYERS, corePath, coreLayerDir, ensureDir } from '../../shared/paths.js';
import { textResult } from '../../shared/mcp-utils.js';

const LayerEnum = z.enum(['identity', 'codebase', 'reference', 'memory']);

// 캐시: filePath → content
const cache = new Map<string, string>();

function invalidateCache(filePath: string): void {
  cache.delete(filePath);
}

async function readCached(filePath: string): Promise<string> {
  const content = await readFile(filePath, 'utf-8');
  cache.set(filePath, content);
  return content;
}

function parseTags(content: string): string[] {
  const match = content.match(/^<!--\s*tags:\s*(.+?)\s*-->/);
  if (!match) return [];
  return match[1].split(',').map((t) => t.trim()).filter(Boolean);
}

export function registerCoreStore(server: McpServer): void {
  // nx_core_read
  server.tool(
    'nx_core_read',
    'Read from the core knowledge store (4-layer: identity, codebase, reference, memory)',
    {
      layer: LayerEnum.optional().describe('Layer to read from'),
      topic: z.string().optional().describe('Specific topic name within the layer'),
      tags: z.array(z.string()).optional().describe('Filter by tags (cross-layer search when no layer given)'),
    },
    async (params: Record<string, unknown>) => {
      const layer = params.layer as string | undefined;
      const topic = params.topic as string | undefined;
      const tags = params.tags as string[] | undefined;

      // Case 3: layer + topic → full file content
      if (layer && topic) {
        const filePath = corePath(layer, topic);
        if (!existsSync(filePath)) {
          return textResult({ exists: false, layer, topic });
        }
        const content = await readCached(filePath);
        return { content: [{ type: 'text' as const, text: content }] };
      }

      // Case 2: layer only → file list with preview + tags
      if (layer) {
        const layerDir = coreLayerDir(layer);
        if (!existsSync(layerDir)) {
          return textResult({ layer, files: [] });
        }
        const files = (await readdir(layerDir)).filter((f) => f.endsWith('.md'));
        const results: Array<{ topic: string; preview: string; tags: string[] }> = [];
        for (const file of files) {
          const filePath = join(layerDir, file);
          const content = await readCached(filePath);
          const firstLine = content.split('\n').find((l) => l.startsWith('# ')) ?? file;
          results.push({ topic: file.replace('.md', ''), preview: firstLine, tags: parseTags(content) });
        }
        return textResult({ layer, files: results });
      }

      // Case 4: tags only (no layer) → cross-layer tag search
      if (tags && tags.length > 0) {
        const results: Array<{ layer: string; topic: string; preview: string; tags: string[] }> = [];
        for (const l of LAYERS) {
          const layerDir = coreLayerDir(l);
          if (!existsSync(layerDir)) continue;
          const files = (await readdir(layerDir)).filter((f) => f.endsWith('.md'));
          for (const file of files) {
            const filePath = join(layerDir, file);
            const content = await readCached(filePath);
            const fileTags = parseTags(content);
            const matched = tags.some((tag) =>
              fileTags.some((ft) => ft.toLowerCase() === tag.toLowerCase())
            );
            if (!matched) continue;
            const firstLine = content.split('\n').find((l) => l.startsWith('# ')) ?? file;
            results.push({ layer: l, topic: file.replace('.md', ''), preview: firstLine, tags: fileTags });
          }
        }
        return textResult({ results });
      }

      // Case 1: no params → overview of all layers
      const layers: Array<{ name: string; count: number }> = [];
      for (const l of LAYERS) {
        const layerDir = coreLayerDir(l);
        if (!existsSync(layerDir)) {
          layers.push({ name: l, count: 0 });
          continue;
        }
        const files = (await readdir(layerDir)).filter((f) => f.endsWith('.md'));
        layers.push({ name: l, count: files.length });
      }
      return textResult({ layers });
    }
  );

  // nx_core_write
  server.tool(
    'nx_core_write',
    'Write to the core knowledge store (4-layer: identity, codebase, reference, memory)',
    {
      layer: LayerEnum.describe('Target layer'),
      topic: z.string().describe('Topic name (becomes filename: core/{layer}/{topic}.md)'),
      content: z.string().describe('Markdown content to write'),
      tags: z.array(z.string()).optional().describe('Tags for searchability'),
    },
    async (params: Record<string, unknown>) => {
      const layer = params.layer as string;
      const topic = params.topic as string;
      const content = params.content as string;
      const tags = params.tags as string[] | undefined;

      const layerDir = coreLayerDir(layer);
      ensureDir(layerDir);

      let body = content;
      if (tags && tags.length > 0) {
        body = `<!-- tags: ${tags.join(', ')} -->\n${content}`;
      }

      const filePath = corePath(layer, topic);
      await writeFile(filePath, body);
      invalidateCache(filePath);

      return textResult({ success: true, layer, topic, path: filePath });
    }
  );
}
