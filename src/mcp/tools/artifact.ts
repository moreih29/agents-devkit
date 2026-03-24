import { z } from 'zod';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BRANCH_ROOT, ensureDir } from '../../shared/paths.js';

const ARTIFACTS_DIR = join(BRANCH_ROOT, 'artifacts');

export function registerArtifactTools(server: McpServer): void {
  server.tool(
    'nx_artifact_write',
    'Write a team artifact (report, synthesis, analysis) to the current branch workspace',
    {
      filename: z.string().describe('Filename to write (e.g., "findings.md", "synthesis.md")'),
      content: z.string().describe('File content to write'),
    },
    async ({ filename, content }) => {
      ensureDir(ARTIFACTS_DIR);
      const path = join(ARTIFACTS_DIR, filename);
      await writeFile(path, content);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, path }) }] };
    }
  );
}
