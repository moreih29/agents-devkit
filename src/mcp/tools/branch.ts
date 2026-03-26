import { z } from 'zod';
import { existsSync, renameSync, rmdirSync } from 'fs';
import { join } from 'path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RUNTIME_ROOT, getBranchRoot, ensureDir, sanitizeBranch, getCurrentBranch } from '../../shared/paths.js';
import { textResult } from '../../shared/mcp-utils.js';

const MIGRATE_FILES = ['consult.json', 'decisions.json'];

export function registerBranchTools(server: McpServer): void {
  server.tool(
    'nx_branch_migrate',
    'Migrate state files (consult.json, decisions.json) from another branch folder into the current branch folder',
    {
      from_branch: z.string().describe('Source branch name to migrate files from (e.g. "main")'),
    },
    ({ from_branch }) => {
      const fromDir = join(RUNTIME_ROOT, 'branches', sanitizeBranch(from_branch));
      const toDir = getBranchRoot();

      if (fromDir === toDir) {
        return textResult({ error: 'Source and current branch are the same' });
      }

      if (!existsSync(fromDir)) {
        return textResult({ migrated: [], skipped: [], from: from_branch, to: getCurrentBranch(), message: 'nothing to migrate' });
      }

      ensureDir(toDir);

      const migrated: string[] = [];
      const skipped: string[] = [];

      for (const file of MIGRATE_FILES) {
        const src = join(fromDir, file);
        const dst = join(toDir, file);

        if (!existsSync(src)) continue;

        if (existsSync(dst)) {
          skipped.push(file);
          continue;
        }

        renameSync(src, dst);
        migrated.push(file);
      }

      // Remove source directory if now empty
      try {
        rmdirSync(fromDir);
      } catch {
        // Not empty or other error — ignore
      }

      return textResult({ migrated, skipped, from: from_branch, to: getCurrentBranch() });
    }
  );
}
