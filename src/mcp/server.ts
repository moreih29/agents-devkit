import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getCurrentVersion } from '../shared/version.js';
import { registerMarkdownStore } from './tools/markdown-store.js';
import { registerCoreStore } from './tools/core-store.js';
import { registerContextTool } from './tools/context.js';
import { registerLspTools } from './tools/lsp.js';
import { registerAstTools } from './tools/ast.js';
import { registerTaskTools } from './tools/task.js';
import { registerDecisionTools } from './tools/decision.js';
import { registerArtifactTools } from './tools/artifact.js';
import { registerConsultTools } from './tools/consult.js';
import { registerBranchTools } from './tools/branch.js';
import { registerBriefingTool } from './tools/briefing.js';
import { rulesPath, KNOWLEDGE_ROOT } from '../shared/paths.js';
import { join } from 'path';

const server = new McpServer({
  name: 'nx',
  version: getCurrentVersion() || '0.0.0',
});

registerCoreStore(server);

registerMarkdownStore(server, {
  toolPrefix: 'nx_rules',
  entityName: 'name',
  dirPath: join(KNOWLEDGE_ROOT, 'rules'),
  pathFn: rulesPath,
  listKey: 'rules',
  cache: false,
});

registerContextTool(server);
registerLspTools(server);
registerAstTools(server);
registerTaskTools(server);
registerDecisionTools(server);
registerArtifactTools(server);
registerConsultTools(server);
registerBranchTools(server);
registerBriefingTool(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Nexus MCP server error:', err);
  process.exit(1);
});
