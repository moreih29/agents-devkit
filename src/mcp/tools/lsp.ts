// LSP MCP 도구 — hover, goto_definition, find_references, diagnostics
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { LspClient } from '../../code-intel/lsp-client.js';
import { detectLanguage, getLspConfig, getLanguageId } from '../../code-intel/detect.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

let client: LspClient | null = null;
let projectRoot: string | null = null;
const openedFiles = new Set<string>();

function findProjectRoot(): string {
  let dir = process.cwd();
  const { existsSync } = require('fs');
  const { join, resolve: res } = require('path');
  while (dir !== '/') {
    if (existsSync(join(dir, '.git'))) return dir;
    dir = res(dir, '..');
  }
  return process.cwd();
}

async function ensureClient(): Promise<LspClient> {
  if (client?.isReady()) return client;

  projectRoot = findProjectRoot();
  const language = detectLanguage(projectRoot);
  if (!language) {
    throw new Error('No supported language detected. Looked for: tsconfig.json, pyproject.toml, Cargo.toml, go.mod');
  }

  const config = getLspConfig(language);
  client = new LspClient(config.command, config.args);
  await client.initialize(pathToFileURL(projectRoot).href);
  return client;
}

function ensureFileOpen(lsp: LspClient, filePath: string): string {
  const absPath = resolve(projectRoot ?? process.cwd(), filePath);
  const uri = pathToFileURL(absPath).href;

  if (!openedFiles.has(uri)) {
    const text = readFileSync(absPath, 'utf-8');
    const langId = getLanguageId(absPath);
    lsp.notifyDidOpen(uri, langId, text);
    openedFiles.add(uri);
  }

  return uri;
}

function formatLocation(loc: { uri?: string; range?: { start: { line: number; character: number } } }): string {
  const file = loc.uri ? loc.uri.replace(pathToFileURL(projectRoot ?? '').href + '/', '') : 'unknown';
  const line = (loc.range?.start.line ?? 0) + 1;
  const col = (loc.range?.start.character ?? 0) + 1;
  return `${file}:${line}:${col}`;
}

function formatMarkupContent(content: unknown): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && content !== null) {
    const obj = content as Record<string, unknown>;
    if (obj.value) return String(obj.value);
    if (obj.contents) return formatMarkupContent(obj.contents);
  }
  return JSON.stringify(content);
}

export function registerLspTools(server: McpServer): void {
  server.tool(
    'lat_lsp_hover',
    'Get type information for a symbol at a specific position',
    {
      file: z.string().describe('File path (relative to project root)'),
      line: z.number().describe('Line number (1-based)'),
      character: z.number().describe('Column number (1-based)'),
    },
    async ({ file, line, character }) => {
      try {
        const lsp = await ensureClient();
        const uri = ensureFileOpen(lsp, file);
        const result = await lsp.request('textDocument/hover', {
          textDocument: { uri },
          position: { line: line - 1, character: character - 1 },
        }) as { contents?: unknown } | null;

        if (!result) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ hover: null, file, line, character }) }] };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              hover: formatMarkupContent(result.contents),
              file,
              line,
              character,
            }),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
      }
    }
  );

  server.tool(
    'lat_lsp_goto_definition',
    'Jump to the definition of a symbol',
    {
      file: z.string().describe('File path (relative to project root)'),
      line: z.number().describe('Line number (1-based)'),
      character: z.number().describe('Column number (1-based)'),
    },
    async ({ file, line, character }) => {
      try {
        const lsp = await ensureClient();
        const uri = ensureFileOpen(lsp, file);
        const result = await lsp.request('textDocument/definition', {
          textDocument: { uri },
          position: { line: line - 1, character: character - 1 },
        });

        const locations = Array.isArray(result) ? result : result ? [result] : [];
        const formatted = locations.map((loc: any) => formatLocation(loc));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ definitions: formatted, file, line, character }),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
      }
    }
  );

  server.tool(
    'lat_lsp_find_references',
    'Find all references to a symbol',
    {
      file: z.string().describe('File path (relative to project root)'),
      line: z.number().describe('Line number (1-based)'),
      character: z.number().describe('Column number (1-based)'),
      includeDeclaration: z.boolean().optional().describe('Include the declaration itself'),
    },
    async ({ file, line, character, includeDeclaration }) => {
      try {
        const lsp = await ensureClient();
        const uri = ensureFileOpen(lsp, file);
        const result = await lsp.request('textDocument/references', {
          textDocument: { uri },
          position: { line: line - 1, character: character - 1 },
          context: { includeDeclaration: includeDeclaration ?? true },
        });

        const locations = Array.isArray(result) ? result : [];
        const formatted = locations.map((loc: any) => formatLocation(loc));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ references: formatted, count: formatted.length, file, line, character }),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
      }
    }
  );

  server.tool(
    'lat_lsp_diagnostics',
    'Get compiler/linter errors and warnings for a file',
    {
      file: z.string().describe('File path (relative to project root)'),
    },
    async ({ file }) => {
      try {
        const lsp = await ensureClient();
        ensureFileOpen(lsp, file);

        // diagnostics는 서버가 push하는 방식. 짧게 대기 후 수집.
        const diagnostics: Array<{ severity: number; message: string; range: any }> = [];

        const uri = pathToFileURL(resolve(projectRoot ?? process.cwd(), file)).href;

        const handler = (params: { uri: string; diagnostics: any[] }) => {
          if (params.uri === uri) {
            diagnostics.push(...params.diagnostics);
          }
        };

        lsp.on('textDocument/publishDiagnostics', handler);

        // 파일을 다시 열어서 diagnostics 트리거
        const text = readFileSync(resolve(projectRoot ?? process.cwd(), file), 'utf-8');
        const langId = getLanguageId(file);
        lsp.notify('textDocument/didClose', { textDocument: { uri } });
        openedFiles.delete(uri);
        lsp.notifyDidOpen(uri, langId, text);
        openedFiles.add(uri);

        // 서버가 diagnostics를 보낼 시간을 줌
        await new Promise((r) => setTimeout(r, 2000));
        lsp.removeListener('textDocument/publishDiagnostics', handler);

        const severityMap: Record<number, string> = { 1: 'error', 2: 'warning', 3: 'info', 4: 'hint' };
        const formatted = diagnostics.map((d) => ({
          severity: severityMap[d.severity] ?? 'unknown',
          message: d.message,
          line: (d.range?.start?.line ?? 0) + 1,
          character: (d.range?.start?.character ?? 0) + 1,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ diagnostics: formatted, count: formatted.length, file }),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
      }
    }
  );

  const symbolKindMap: Record<number, string> = {
    1: 'File', 2: 'Module', 3: 'Namespace', 4: 'Package', 5: 'Class',
    6: 'Method', 7: 'Property', 8: 'Field', 9: 'Constructor', 10: 'Enum',
    11: 'Interface', 12: 'Function', 13: 'Variable', 14: 'Constant',
    15: 'String', 16: 'Number', 17: 'Boolean', 18: 'Array', 19: 'Object',
    20: 'Key', 21: 'Null', 22: 'EnumMember', 23: 'Struct', 24: 'Event',
    25: 'Operator', 26: 'TypeParameter',
  };

  server.tool(
    'lat_lsp_document_symbols',
    'List all symbols (functions, classes, interfaces, etc.) in a file',
    {
      file: z.string().describe('File path (relative to project root)'),
    },
    async ({ file }) => {
      try {
        const lsp = await ensureClient();
        const uri = ensureFileOpen(lsp, file);
        const result = await lsp.request('textDocument/documentSymbol', {
          textDocument: { uri },
        });

        const symbols = Array.isArray(result) ? result : [];
        const flatten = (items: any[], depth = 0): any[] => {
          const out: any[] = [];
          for (const s of items) {
            out.push({
              name: s.name,
              kind: symbolKindMap[s.kind] ?? 'Unknown',
              line: (s.range?.start?.line ?? s.location?.range?.start?.line ?? 0) + 1,
              depth,
            });
            if (s.children) out.push(...flatten(s.children, depth + 1));
          }
          return out;
        };

        const formatted = flatten(symbols);
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ symbols: formatted, count: formatted.length, file }),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
      }
    }
  );

  server.tool(
    'lat_lsp_workspace_symbols',
    'Search for symbols across the entire project',
    {
      query: z.string().describe('Symbol name or partial name to search'),
    },
    async ({ query }) => {
      try {
        const lsp = await ensureClient();
        const result = await lsp.request('workspace/symbol', { query });

        const symbols = Array.isArray(result) ? result : [];
        const formatted = symbols.map((s: any) => ({
          name: s.name,
          kind: symbolKindMap[s.kind] ?? 'Unknown',
          location: formatLocation(s.location),
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ symbols: formatted, count: formatted.length, query }),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
      }
    }
  );
}
