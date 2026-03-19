import { build } from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  external: ['@ast-grep/napi'],
};

// MCP 서버 번들
await build({
  ...shared,
  entryPoints: ['src/mcp/server.ts'],
  outfile: 'bridge/mcp-server.cjs',
});

// 훅 스크립트 번들
const hooks = ['gate', 'pulse', 'tracker'];
await Promise.all(
  hooks.map((name) =>
    build({
      ...shared,
      entryPoints: [`src/hooks/${name}.ts`],
      outfile: `scripts/${name}.cjs`,
    })
  )
);

console.log('Build complete: bridge/mcp-server.cjs, scripts/{gate,pulse,tracker}.cjs');
