import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerStateTools } from './tools/state.js';
import { registerKnowledgeTools } from './tools/knowledge.js';
import { registerMemoTools } from './tools/memo.js';
import { registerContextTool } from './tools/context.js';
import { registerLspTools } from './tools/lsp.js';
import { registerAstTools } from './tools/ast.js';

const server = new McpServer({
  name: 'lat',
  version: '0.2.0',
});

registerStateTools(server);
registerKnowledgeTools(server);
registerMemoTools(server);
registerContextTool(server);
registerLspTools(server);
registerAstTools(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Lattice MCP server error:', err);
  process.exit(1);
});
