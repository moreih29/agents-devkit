import { z } from 'zod';
import { existsSync } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CORE_ROOT, LAYERS, coreLayerDir, KNOWLEDGE_ROOT } from '../../shared/paths.js';
import { getBranchRoot } from '../../shared/paths.js';
import { textResult } from '../../shared/mcp-utils.js';

// null = 생략, 'all' = 전체
const MATRIX: Record<string, Record<string, string | null>> = {
  architect:  { identity: 'all', codebase: 'all',  reference: 'all',  memory: 'all' },
  postdoc:    { identity: 'all', codebase: 'all',  reference: 'all',  memory: 'all' },
  engineer:   { identity: null,  codebase: 'all',  reference: null,   memory: 'all' },
  researcher: { identity: 'all', codebase: null,   reference: 'all',  memory: 'all' },
  qa:         { identity: 'all', codebase: 'all',  reference: null,   memory: 'all' },
  designer:   { identity: 'all', codebase: 'all',  reference: 'all',  memory: 'all' },
  strategist: { identity: 'all', codebase: 'all',  reference: 'all',  memory: 'all' },
  writer:     { identity: null,  codebase: 'all',  reference: null,   memory: 'all' },
  reviewer:   { identity: 'all', codebase: 'all',  reference: null,   memory: 'all' },
};

function parseTags(content: string): string[] {
  const match = content.match(/^<!--\s*tags:\s*(.+?)\s*-->/);
  if (!match) return [];
  return match[1].split(',').map((t) => t.trim()).filter(Boolean);
}

async function readLayerFiles(layer: string, hint: string | undefined): Promise<Array<{ filename: string; content: string }>> {
  const layerDir = coreLayerDir(layer);
  if (!existsSync(layerDir)) return [];

  const files = (await readdir(layerDir)).filter((f) => f.endsWith('.md'));
  const results: Array<{ filename: string; content: string }> = [];

  for (const file of files) {
    const filePath = join(layerDir, file);
    const content = await readFile(filePath, 'utf-8');
    results.push({ filename: file, content });
  }

  if (hint && results.length > 0) {
    const hintLower = hint.toLowerCase();
    const matched = results.filter(({ filename, content }) => {
      const tags = parseTags(content);
      return (
        tags.some((t) => t.toLowerCase().includes(hintLower)) ||
        filename.toLowerCase().includes(hintLower)
      );
    });
    if (matched.length > 0) return matched;
  }

  return results;
}

export function registerBriefingTool(server: McpServer): void {
  server.tool(
    'nx_briefing',
    'Assemble a role-specific briefing from the core knowledge store (identity, codebase, reference, memory layers) plus decisions and rules.',
    {
      role: z.enum(['architect', 'postdoc', 'engineer', 'researcher', 'qa', 'designer', 'strategist', 'writer', 'reviewer']).describe('Agent role'),
      hint: z.string().optional().describe('Relevant module/area hint for tag filtering'),
    },
    async (params: Record<string, unknown>) => {
      const role = params.role as string;
      const hint = params.hint as string | undefined;

      const matrix = MATRIX[role];
      if (!matrix) {
        return textResult({ error: `Unknown role: ${role}` });
      }

      const collectedFiles: string[] = [];
      const sections: Record<string, Array<{ filename: string; content: string }>> = {};

      for (const layer of LAYERS) {
        const policy = matrix[layer];
        if (policy === null) continue;

        const files = await readLayerFiles(layer, hint);
        sections[layer] = files;
        for (const f of files) {
          collectedFiles.push(`${layer}/${f.filename}`);
        }
      }

      // decisions.json
      let decisionsSection = '';
      const decisionsPath = join(getBranchRoot(), 'decisions.json');
      if (existsSync(decisionsPath)) {
        const raw = await readFile(decisionsPath, 'utf-8');
        decisionsSection = raw.trim();
      }

      // rules/
      let rulesSection = '';
      const rulesDir = join(KNOWLEDGE_ROOT, 'rules');
      if (existsSync(rulesDir)) {
        const ruleFiles = (await readdir(rulesDir)).filter((f) => f.endsWith('.md'));
        const parts: string[] = [];
        for (const ruleFile of ruleFiles) {
          const content = await readFile(join(rulesDir, ruleFile), 'utf-8');
          parts.push(`### ${ruleFile}\n${content.trim()}`);
        }
        rulesSection = parts.join('\n\n');
      }

      // 조립
      const lines: string[] = [];
      lines.push(`<!-- briefing: role=${role}, hint=${hint ?? 'null'}, files=[${collectedFiles.join(', ')}] -->`);
      lines.push('');

      if (decisionsSection) {
        lines.push('## Decisions');
        lines.push(decisionsSection);
        lines.push('');
      }

      if (rulesSection) {
        lines.push('## Rules');
        lines.push(rulesSection);
        lines.push('');
      }

      for (const layer of LAYERS) {
        const policy = matrix[layer];
        if (policy === null) continue;

        const layerName = layer.charAt(0).toUpperCase() + layer.slice(1);
        lines.push(`## ${layerName}`);

        const files = sections[layer] ?? [];
        if (files.length === 0) {
          lines.push(`No ${layer} files.`);
        } else {
          for (const { filename, content } of files) {
            lines.push(`### ${filename}`);
            lines.push(content.trim());
          }
        }
        lines.push('');
      }

      const markdown = lines.join('\n');
      return { content: [{ type: 'text' as const, text: markdown }] };
    }
  );
}
