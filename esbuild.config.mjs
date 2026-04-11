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
const hooks = ['gate'];
await Promise.all(
  hooks.map((name) =>
    build({
      ...shared,
      entryPoints: [`src/hooks/${name}.ts`],
      outfile: `scripts/${name}.cjs`,
    })
  )
);

// 상태라인 번들
await build({
  ...shared,
  entryPoints: ['src/statusline/statusline.ts'],
  outfile: 'scripts/statusline.cjs',
});

console.log('Build complete: bridge/mcp-server.cjs, scripts/{gate,statusline}.cjs');

// Commit 2에서 해제: await import('./generate-from-nexus-core.mjs');

// Nexus 섹션 템플릿 생성 (agents/skills/tags → templates/nexus-section.md + CLAUDE.md)
await import('./generate-template.mjs');
