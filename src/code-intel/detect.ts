// 프로젝트 언어 감지 + LSP 서버 매핑
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

export type Language = 'typescript' | 'python' | 'rust' | 'go';

export interface LspServerConfig {
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

// 바이너리를 찾을 수 없을 때 시도할 common paths
const COMMON_PATHS: Record<string, string[]> = {
  'rust-analyzer': [`${process.env.HOME}/.cargo/bin/rust-analyzer`],
  'gopls': [`${process.env.HOME}/go/bin/gopls`, '/usr/local/go/bin/gopls'],
  'pyright-langserver': [`${process.env.HOME}/.local/bin/pyright-langserver`],
};

/** 커맨드를 PATH 또는 common paths에서 탐색 */
function resolveCommand(command: string): string {
  // npx는 그대로 사용
  if (command === 'npx') return command;

  // PATH에서 찾기
  try {
    const resolved = execSync(`which ${command}`, { encoding: 'utf-8', timeout: 3000 }).trim();
    if (resolved) return resolved;
  } catch { /* not in PATH */ }

  // common paths fallback
  const paths = COMMON_PATHS[command] ?? [];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }

  // 못 찾으면 원래 커맨드 반환 (실행 시 에러 발생)
  return command;
}

const DETECT_FILES: Array<{ file: string; language: Language }> = [
  { file: 'tsconfig.json', language: 'typescript' },
  { file: 'jsconfig.json', language: 'typescript' },
  { file: 'pyproject.toml', language: 'python' },
  { file: 'setup.py', language: 'python' },
  { file: 'Cargo.toml', language: 'rust' },
  { file: 'go.mod', language: 'go' },
];

const EXT_TO_LANGUAGE: Record<string, Language> = {
  ts: 'typescript', tsx: 'typescript', js: 'typescript', jsx: 'typescript',
  py: 'python',
  rs: 'rust',
  go: 'go',
};

/** 프로젝트 루트에서 주 언어 감지 */
export function detectLanguage(projectRoot: string): Language | null {
  for (const { file, language } of DETECT_FILES) {
    if (existsSync(join(projectRoot, file))) {
      return language;
    }
  }
  return null;
}

/** 파일 확장자로 언어 판별 */
export function getLanguageFromExt(filePath: string): Language | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TO_LANGUAGE[ext] ?? null;
}

/** LSP 서버 설정 반환 (커맨드 경로 자동 탐색) */
export function getLspConfig(language: Language): LspServerConfig {
  const config = LSP_SERVERS[language];
  return {
    ...config,
    command: resolveCommand(config.command),
  };
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
