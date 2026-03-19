// AST MCP 도구 — ast-grep 기반 구조 검색
import { z } from 'zod';
import { resolve } from 'path';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

let astGrep: any = null;
let astGrepAvailable: boolean | null = null;

function loadAstGrep(): boolean {
  if (astGrepAvailable !== null) return astGrepAvailable;
  try {
    astGrep = require('@ast-grep/napi');
    astGrepAvailable = true;
    return true;
  } catch {
    astGrepAvailable = false;
    return false;
  }
}

const LANG_MAP: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'Tsx',
  js: 'JavaScript',
  jsx: 'Jsx',
  py: 'Python',
  rs: 'Rust',
  go: 'Go',
  java: 'Java',
  c: 'C',
  cpp: 'Cpp',
};

function findProjectRoot(): string {
  let dir = process.cwd();
  while (dir !== '/') {
    if (existsSync(resolve(dir, '.git'))) return dir;
    dir = resolve(dir, '..');
  }
  return process.cwd();
}

function collectFiles(dir: string, ext: string, maxDepth = 5, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...collectFiles(full, ext, maxDepth, depth + 1));
      } else if (entry.name.endsWith(`.${ext}`)) {
        files.push(full);
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return files;
}

export function registerAstTools(server: McpServer): void {
  server.tool(
    'lat_ast_search',
    'Search code by structural pattern using ast-grep (tree-sitter)',
    {
      pattern: z.string().describe('ast-grep pattern (e.g., "function $NAME($$$) { $$$ }")'),
      language: z.string().optional().describe('Language: typescript, javascript, python, rust, go. Auto-detected if omitted.'),
      path: z.string().optional().describe('Directory or file to search. Defaults to project root.'),
    },
    async ({ pattern, language, path: searchPath }) => {
      if (!loadAstGrep()) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: '@ast-grep/napi not installed',
              install: 'npm install @ast-grep/napi',
              note: 'AST search requires the @ast-grep/napi package. Install it in the project or globally.',
            }),
          }],
        };
      }

      try {
        const root = findProjectRoot();
        const targetPath = searchPath ? resolve(root, searchPath) : root;

        // 언어 결정
        let lang = language?.toLowerCase() ?? 'typescript';
        const ext = Object.entries(LANG_MAP).find(([, v]) => v.toLowerCase() === lang)?.[0] ?? lang;
        const astLang = LANG_MAP[ext];
        if (!astLang) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: `Unsupported language: ${lang}`, supported: Object.values(LANG_MAP) }),
            }],
          };
        }

        // 파일 수집
        const isFile = existsSync(targetPath) && statSync(targetPath).isFile();
        const files = isFile ? [targetPath] : collectFiles(targetPath, ext);

        const matches: Array<{ file: string; line: number; text: string }> = [];
        const sgLang = astGrep.Lang[astLang];

        for (const file of files) {
          try {
            const source = readFileSync(file, 'utf-8');
            const sgRoot = astGrep.parse(sgLang, source).root();
            const nodes = sgRoot.findAll(pattern);

            for (const node of nodes) {
              matches.push({
                file: file.replace(root + '/', ''),
                line: node.range().start.line + 1,
                text: node.text().slice(0, 200),
              });
            }
          } catch { /* skip parse errors */ }
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ matches, count: matches.length, pattern, language: astLang }),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
      }
    }
  );
}
