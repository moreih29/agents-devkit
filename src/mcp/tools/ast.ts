// AST MCP 도구 — ast-grep 기반 구조 검색
import { z } from 'zod';
import { resolve } from 'path';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

let astGrep: any = null;
let astGrepAvailable: boolean | null = null;

function loadAstGrep(): boolean {
  if (astGrepAvailable !== null) return astGrepAvailable;

  // 1. 플러그인 캐시의 node_modules
  try {
    astGrep = require('@ast-grep/napi');
    astGrepAvailable = true;
    return true;
  } catch { /* fallthrough */ }

  // 2. 프로젝트 루트의 node_modules (dev-sync가 node_modules를 복사하지 않으므로)
  try {
    const projectRoot = findProjectRoot();
    astGrep = require(resolve(projectRoot, 'node_modules', '@ast-grep', 'napi'));
    astGrepAvailable = true;
    return true;
  } catch { /* fallthrough */ }

  astGrepAvailable = false;
  return false;
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
    'nx_ast_search',
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

  server.tool(
    'nx_ast_replace',
    'Replace code by structural pattern using ast-grep (tree-sitter). Use dryRun=true to preview changes.',
    {
      pattern: z.string().describe('ast-grep pattern to match'),
      replacement: z.string().describe('Replacement pattern (use $NAME to reference captures)'),
      language: z.string().optional().describe('Language: typescript, javascript, python, rust, go'),
      path: z.string().optional().describe('Directory or file. Defaults to project root.'),
      dryRun: z.boolean().optional().describe('Preview only, no file changes (default: true)'),
    },
    async ({ pattern, replacement, language, path: searchPath, dryRun }) => {
      if (!loadAstGrep()) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              error: '@ast-grep/napi not installed',
              install: 'npm install @ast-grep/napi',
            }),
          }],
        };
      }

      const isDryRun = dryRun ?? true; // 기본 dry run (안전)

      try {
        const root = findProjectRoot();
        const targetPath = searchPath ? resolve(root, searchPath) : root;

        let lang = language?.toLowerCase() ?? 'typescript';
        const ext = Object.entries(LANG_MAP).find(([, v]) => v.toLowerCase() === lang)?.[0] ?? lang;
        const astLang = LANG_MAP[ext];
        if (!astLang) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: `Unsupported language: ${lang}` }),
            }],
          };
        }

        const isFile = existsSync(targetPath) && statSync(targetPath).isFile();
        const files = isFile ? [targetPath] : collectFiles(targetPath, ext);
        const sgLang = astGrep.Lang[astLang];

        const changes: Array<{ file: string; line: number; original: string; replaced: string }> = [];

        for (const file of files) {
          try {
            const source = readFileSync(file, 'utf-8');
            const sgRoot = astGrep.parse(sgLang, source).root();
            const nodes = sgRoot.findAll(pattern);

            if (nodes.length === 0) continue;

            let newSource = source;
            // 뒤에서부터 치환 (오프셋 유지)
            const sorted = [...nodes].sort((a: any, b: any) => b.range().start.index - a.range().start.index);

            for (const node of sorted) {
              const range = node.range();
              const original = node.text();
              const replaced = node.replace(replacement)?.text?.() ?? replacement;

              changes.push({
                file: file.replace(root + '/', ''),
                line: range.start.line + 1,
                original: original.slice(0, 100),
                replaced: replaced.slice(0, 100),
              });

              if (!isDryRun) {
                newSource = newSource.slice(0, range.start.index) + replaced + newSource.slice(range.end.index);
              }
            }

            if (!isDryRun && newSource !== source) {
              const { writeFileSync } = require('fs');
              writeFileSync(file, newSource);
            }
          } catch { /* skip */ }
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              changes,
              count: changes.length,
              dryRun: isDryRun,
              pattern,
              replacement,
              language: astLang,
            }),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: String(err) }) }] };
      }
    }
  );
}
