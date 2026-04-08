import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getCurrentVersion } from '../shared/version.js';
import { registerContextTool } from './tools/context.js';
import { registerLspTools } from './tools/lsp.js';
import { registerAstTools } from './tools/ast.js';
import { registerTaskTools } from './tools/task.js';
import { registerArtifactTools } from './tools/artifact.js';
import { registerPlanTools } from './tools/plan.js';

const server = new McpServer({
  name: 'nx',
  version: getCurrentVersion() || '0.0.0',
});

registerContextTool(server);
registerLspTools(server);
registerAstTools(server);
registerTaskTools(server);
registerArtifactTools(server);
registerPlanTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Nexus MCP server error:', err);
  process.exit(1);
});
