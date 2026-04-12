// generate-from-nexus-core.mjs
// Entry point: reads @moreih29/nexus-core assets and writes claude-nexus
// agents/*.md, skills/*/SKILL.md, src/data/tags.json.
// Invoked from esbuild.config.mjs after the main esbuild pass (activation
// line is commented out during Commit 1; uncomment in Commit 2).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  CLAUDE_NEXUS_ROOT,
  NEXUS_CORE_ROOT,
  loadManifest,
  verifyManifestVersion,
  indexCapabilities,
  loadTagsVocab,
  verifyTagDrift,
  verifyBodyHash,
  transformAgent,
  transformSkill,
  transformTags,
  loadPluginName,
  writeGenerated,
} from './generate-from-nexus-core.lib.mjs';

async function main() {
  const manifest = loadManifest();
  verifyManifestVersion(manifest);

  const gateSrcPath = join(CLAUDE_NEXUS_ROOT, 'src/hooks/gate.ts');
  const tagsVocab = loadTagsVocab();
  verifyTagDrift(tagsVocab, gateSrcPath);

  const capsMap = indexCapabilities();
  const pluginName = loadPluginName();

  let agentCount = 0;
  for (const agentEntry of manifest.agents) {
    const metaPath = join(NEXUS_CORE_ROOT, 'agents', agentEntry.id, 'meta.yml');
    const bodyPath = join(NEXUS_CORE_ROOT, 'agents', agentEntry.id, 'body.md');
    const meta = parseYaml(readFileSync(metaPath, 'utf8'));
    const body = readFileSync(bodyPath, 'utf8');
    verifyBodyHash(body, agentEntry.body_hash, `agents/${agentEntry.id}/body.md`);
    const out = transformAgent(meta, body, capsMap, `agents/${agentEntry.id}`);
    writeGenerated(join(CLAUDE_NEXUS_ROOT, 'agents', `${agentEntry.id}.md`), out);
    agentCount++;
  }

  let skillCount = 0;
  for (const skillEntry of manifest.skills) {
    const metaPath = join(NEXUS_CORE_ROOT, 'skills', skillEntry.id, 'meta.yml');
    const bodyPath = join(NEXUS_CORE_ROOT, 'skills', skillEntry.id, 'body.md');
    const meta = parseYaml(readFileSync(metaPath, 'utf8'));
    const body = readFileSync(bodyPath, 'utf8');
    verifyBodyHash(body, skillEntry.body_hash, `skills/${skillEntry.id}/body.md`);
    const out = transformSkill(meta, body, pluginName, skillEntry, `skills/${skillEntry.id}`);
    writeGenerated(join(CLAUDE_NEXUS_ROOT, 'skills', skillEntry.id, 'SKILL.md'), out);
    skillCount++;
  }

  const tags = transformTags(tagsVocab);
  writeGenerated(
    join(CLAUDE_NEXUS_ROOT, 'src/data/tags.json'),
    JSON.stringify(tags, null, 2) + '\n'
  );

  console.log(
    `Generated from @moreih29/nexus-core@${manifest.nexus_core_version}: ` +
    `${agentCount} agents, ${skillCount} skills, ${tags.length} tags`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
