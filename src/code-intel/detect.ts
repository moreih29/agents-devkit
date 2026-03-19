// 프로젝트 언어 감지 + LSP 서버 매핑
import { existsSync } from 'fs';
import { join } from 'path';

export type Language = 'typescript' | 'python' | 'rust' | 'go';

interface LspServerConfig {
  command: string;
  args: string[];
  languageId: string;
}

const LSP_SERVERS: Record<Language, LspServerConfig> = {
  typescript: {
    command: 'npx',
    args: ['typescript-language-server', '--stdio'],
    languageId: 'typescript',
  },
  python: {
    command: 'pyright-langserver',
    args: ['--stdio'],
    languageId: 'python',
  },
  rust: {
    command: 'rust-analyzer',
    args: [],
    languageId: 'rust',
  },
  go: {
    command: 'gopls',
    args: ['serve'],
    languageId: 'go',
  },
};

const DETECT_FILES: Array<{ file: string; language: Language }> = [
  { file: 'tsconfig.json', language: 'typescript' },
  { file: 'jsconfig.json', language: 'typescript' },
  { file: 'pyproject.toml', language: 'python' },
  { file: 'setup.py', language: 'python' },
  { file: 'Cargo.toml', language: 'rust' },
  { file: 'go.mod', language: 'go' },
];

export function detectLanguage(projectRoot: string): Language | null {
  for (const { file, language } of DETECT_FILES) {
    if (existsSync(join(projectRoot, file))) {
      return language;
    }
  }
  return null;
}

export function getLspConfig(language: Language): LspServerConfig {
  return LSP_SERVERS[language];
}

export function getLanguageId(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    py: 'python',
    rs: 'rust',
    go: 'go',
  };
  return map[ext] ?? 'plaintext';
}
