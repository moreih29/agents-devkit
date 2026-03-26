import { z } from 'zod';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getBranchRoot, ensureDir } from '../../shared/paths.js';
import { textResult } from '../../shared/mcp-utils.js';

export function registerArtifactTools(server: McpServer): void {
  server.tool(
    'nx_artifact_write',
    'Write a team artifact (report, synthesis, analysis) to the current branch workspace',
    {
      filename: z.string().describe('Filename to write (e.g., "findings.md", "synthesis.md")'),
      content: z.string().describe('File content to write'),
    },
    async ({ filename, content }) => {
      const artifactsDir = join(getBranchRoot(), 'artifacts');
      ensureDir(artifactsDir);
      const path = join(artifactsDir, filename);
      await writeFile(path, content);
      return textResult({ success: true, path });
    }
  );
}
