import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerStateTools } from './tools/state.js';
import { registerKnowledgeTools } from './tools/knowledge.js';
import { registerContextTool } from './tools/context.js';
import { registerLspTools } from './tools/lsp.js';
import { registerAstTools } from './tools/ast.js';
import { registerTaskTools } from './tools/task.js';

const server = new McpServer({
  name: 'nx',
  version: '0.2.0', // synced with package.json
});

registerStateTools(server);
registerKnowledgeTools(server);
registerContextTool(server);
registerLspTools(server);
registerAstTools(server);
registerTaskTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Nexus MCP server error:', err);
  process.exit(1);
});
