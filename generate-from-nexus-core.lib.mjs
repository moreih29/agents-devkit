// generate-from-nexus-core.lib.mjs
// Pure functions for transforming @moreih29/nexus-core assets
// into claude-nexus agents/*.md, skills/*/SKILL.md, src/data/tags.json

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

// ==========================================================================
// Constants (D2.6, D7.4)
// ==========================================================================

/** @type {Record<string, 'opus'|'sonnet'>} */
export const MODEL_TIER_TO_CLAUDE = { high: 'opus', standard: 'sonnet' };

/** @type {Record<string, number>} */
export const MAX_TURNS_MAP = {
  architect: 20, designer: 25, engineer: 25, postdoc: 25,
  researcher: 20, reviewer: 20, strategist: 25, tester: 20, writer: 25,
};

/** Agent frontmatter field order (D3.1). `tags` field deliberately absent (dropped). */
export const FIELD_ORDER = [
  'name', 'description', 'model', 'maxTurns', 'disallowedTools',
  'task', 'alias_ko', 'category', 'resume_tier',
];

/** Skill frontmatter field order (D7.4). `triggers` deliberately absent (dropped). */
export const SKILL_FIELD_ORDER = [
  'name', 'description', 'trigger_display', 'purpose', 'disable-model-invocation',
];

/** Claude Code tool mapping per capability (harness-local, replaces nexus-core harness_mapping). */
export const CAPABILITY_TOOL_MAP = {
  no_file_edit:   ['Edit', 'Write', 'NotebookEdit'],
  no_task_create: ['mcp__plugin_claude-nexus_nx__nx_task_add'],
  no_task_update: ['mcp__plugin_claude-nexus_nx__nx_task_update'],
  no_shell_exec:  ['Bash'],
};

// ==========================================================================
// Path helpers
// ==========================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
export const CLAUDE_NEXUS_ROOT = __dirname;
export const NEXUS_CORE_ROOT = join(__dirname, 'node_modules/@moreih29/nexus-core');

// ==========================================================================
// Loading functions
// ==========================================================================

/** @returns {any} manifest.json parsed object */
export function loadManifest() {
  const path = join(NEXUS_CORE_ROOT, 'manifest.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Cross-check manifest.nexus_core_version vs node_modules/@moreih29/nexus-core/package.json version.
 * Throws if mismatch.
 * @param {any} manifest
 */
export function verifyManifestVersion(manifest) {
  const pkgPath = join(NEXUS_CORE_ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (manifest.nexus_core_version !== pkg.version) {
    throw new Error(
      `manifest.nexus_core_version (${manifest.nexus_core_version}) !== ` +
      `package.json version (${pkg.version})`
    );
  }
}

/**
 * Index capabilities: capability id → tool name array.
 * Returns entries from CAPABILITY_TOOL_MAP directly (harness-local mapping).
 * @returns {Map<string, string[]>}
 */
export function indexCapabilities() {
  const map = new Map();
  for (const [id, tools] of Object.entries(CAPABILITY_TOOL_MAP)) {
    map.set(id, tools);
  }
  return map;
}

// ==========================================================================
// Hash verification (D2.3)
// ==========================================================================

/**
 * Verify content sha256 matches expected "sha256:<hex>" prefix. Throws on mismatch.
 * @param {string} content
 * @param {string} expectedHashPrefixed e.g. "sha256:abc123..."
 * @param {string} [label]
 */
export function verifyBodyHash(content, expectedHashPrefixed, label = '') {
  const actual = 'sha256:' + createHash('sha256').update(content).digest('hex');
  if (actual !== expectedHashPrefixed) {
    throw new Error(
      `body_hash mismatch${label ? ` for ${label}` : ''}:\n` +
      `  expected: ${expectedHashPrefixed}\n` +
      `  actual:   ${actual}`
    );
  }
}

// ==========================================================================
// Derive disallowedTools (D3.3)
// ==========================================================================

/**
 * Derive disallowedTools array from capability ids.
 * Preserves insertion order, dedupes via Set, throws on unmapped capability.
 * @param {string[]} capabilityIds
 * @param {Map<string, string[]>} capsMap
 * @returns {string[]}
 */
export function deriveDisallowedTools(capabilityIds, capsMap) {
  const seen = new Set();
  const result = [];
  for (const capId of capabilityIds ?? []) {
    const tools = capsMap.get(capId);
    if (!tools) {
      throw new Error(
        `Capability "${capId}" has no entry in CAPABILITY_TOOL_MAP. ` +
        `Add the mapping to generate-from-nexus-core.lib.mjs.`
      );
    }
    for (const tool of tools) {
      if (!seen.has(tool)) {
        seen.add(tool);
        result.push(tool);
      }
    }
  }
  return result;
}

// ==========================================================================
// YAML emission (D3.1 11 rules + D7.4 skill variant)
// ==========================================================================

/**
 * Emit a single YAML value per D3.1/D7.4 rules.
 * @param {string} field - field name (to apply task-always-quote rule etc.)
 * @param {string|number|boolean|string[]} value
 * @returns {string} The value portion only (no "field: " prefix)
 */
export function emitYamlValue(field, value) {
  if (Array.isArray(value)) {
    // flow style: [a, b, c] with space after comma
    return `[${value.join(', ')}]`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  // string
  const s = String(value);
  // Fields that are always double-quoted:
  if (field === 'task' || field === 'trigger_display' || field === 'purpose') {
    // escape inner double quotes
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  // Other strings: unquoted unless contains YAML special chars
  if (/[:#\[\]{},&*!|>'"%@`]/.test(s) || /^\s|\s$/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * Build frontmatter block "---\n<fields>\n---\n".
 * Omits fields absent from fieldMap.
 * @param {Map<string, any>} fieldMap
 * @param {string[]} fieldOrder
 * @returns {string}
 */
export function emitFrontmatter(fieldMap, fieldOrder) {
  const lines = ['---'];
  for (const field of fieldOrder) {
    if (!fieldMap.has(field)) continue;
    const val = fieldMap.get(field);
    lines.push(`${field}: ${emitYamlValue(field, val)}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}

// ==========================================================================
// Transform functions
// ==========================================================================

/**
 * Normalize a multi-line folded description to a single line.
 * @param {string} s
 * @returns {string}
 */
function collapseDescription(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

/**
 * Transform one agent's meta + body to complete agents/{id}.md content.
 * @param {any} meta - parsed meta.yml object
 * @param {string} body - raw body.md content (already sha256-verified by caller)
 * @param {Map<string, string[]>} capsMap
 * @param {string} [label]
 * @returns {string}
 */
export function transformAgent(meta, body, capsMap, label = '') {
  const fm = new Map();
  fm.set('name', meta.name);
  fm.set('description', collapseDescription(meta.description));
  const model = MODEL_TIER_TO_CLAUDE[meta.model_tier];
  if (!model) {
    throw new Error(`Unknown model_tier "${meta.model_tier}" for ${label || meta.id}`);
  }
  fm.set('model', model);
  const maxTurns = MAX_TURNS_MAP[meta.id];
  if (maxTurns === undefined) {
    throw new Error(`No MAX_TURNS_MAP entry for agent "${meta.id}"`);
  }
  fm.set('maxTurns', maxTurns);
  const disallowed = deriveDisallowedTools(meta.capabilities, capsMap);
  if (disallowed.length > 0) {
    fm.set('disallowedTools', disallowed);
  }
  if (meta.task) fm.set('task', meta.task);
  if (meta.alias_ko) fm.set('alias_ko', meta.alias_ko);
  fm.set('category', meta.category);
  fm.set('resume_tier', meta.resume_tier);

  const frontmatter = emitFrontmatter(fm, FIELD_ORDER);
  // ensure body starts with blank line after frontmatter (--- + \n + \n + body)
  const bodyPart = body.startsWith('\n') ? body : '\n' + body;
  return frontmatter + bodyPart;
}

/**
 * Derive skill trigger_display per D7.2.
 * @param {any} meta
 * @param {string} pluginName
 * @returns {string}
 */
export function deriveSkillTriggerDisplay(meta, pluginName) {
  if (Array.isArray(meta.triggers) && meta.triggers.length > 0) {
    return `[${meta.triggers[0]}]`;
  }
  if (meta.manual_only === true) {
    return `/${pluginName}:${meta.id}`;
  }
  throw new Error(
    `Skill "${meta.id}" has neither triggers nor manual_only — ambiguous invocation`
  );
}

/**
 * Transform one skill's meta + body to complete skills/{id}/SKILL.md content.
 * @param {any} meta
 * @param {string} body - already verified
 * @param {string} pluginName
 * @param {any} manifestEntry - manifest.json skill entry object (provides summary field)
 * @param {string} [label]
 * @returns {string}
 */
export function transformSkill(meta, body, pluginName, manifestEntry, label = '') {
  const fm = new Map();
  fm.set('name', meta.name);
  fm.set('description', collapseDescription(meta.description));
  fm.set('trigger_display', deriveSkillTriggerDisplay(meta, pluginName));
  const purpose = manifestEntry?.summary ?? collapseDescription(meta.description);
  fm.set('purpose', purpose);
  if (meta.manual_only === true) {
    fm.set('disable-model-invocation', true);
  }

  const frontmatter = emitFrontmatter(fm, SKILL_FIELD_ORDER);

  // Inject harness-local docs referenced by harness_docs_refs
  let enrichedBody = body;
  const refs = manifestEntry?.harness_docs_refs;
  if (Array.isArray(refs) && refs.length > 0) {
    for (const ref of refs) {
      const contentPath = join(CLAUDE_NEXUS_ROOT, 'harness-content', `${ref}.md`);
      if (existsSync(contentPath)) {
        const content = readFileSync(contentPath, 'utf8').trim();
        enrichedBody += '\n\n---\n\n' + content + '\n';
      }
    }
  }

  const bodyPart = enrichedBody.startsWith('\n') ? enrichedBody : '\n' + enrichedBody;
  return frontmatter + bodyPart;
}

/**
 * Transform vocabulary tags to src/data/tags.json format.
 * Uses t.trigger bracket-strip (D5.1) to preserve display form like "m:gc".
 * @param {any} tagsVocab - parsed vocabulary/tags.yml { tags: [...] }
 * @returns {Array<{tag: string, purpose: string}>}
 */
export function transformTags(tagsVocab) {
  return tagsVocab.tags.map(t => ({
    tag: t.trigger.replace(/^\[|\]$/g, ''),
    purpose: t.description,
  }));
}

/**
 * Load plugin name from .claude-plugin/plugin.json (1-time cache in memory).
 * @returns {string}
 */
let _pluginNameCache = null;
export function loadPluginName() {
  if (_pluginNameCache !== null) return _pluginNameCache;
  const path = join(CLAUDE_NEXUS_ROOT, '.claude-plugin/plugin.json');
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  _pluginNameCache = pkg.name;
  return _pluginNameCache;
}

/**
 * Load vocabulary/tags.yml for tag drift checking (also used by transformTags).
 * @returns {any}
 */
export function loadTagsVocab() {
  const path = join(NEXUS_CORE_ROOT, 'vocabulary/tags.yml');
  return parseYaml(readFileSync(path, 'utf8'));
}

// ==========================================================================
// Tag drift detection (D5.3)
// ==========================================================================

/**
 * Extract HANDLED_TAG_IDS array from gate.ts source via targeted regex.
 * @param {string} gateSrcPath
 * @returns {string[]}
 */
export function loadHandledTagIdsFromGate(gateSrcPath) {
  const src = readFileSync(gateSrcPath, 'utf8');
  const m = src.match(
    /export\s+const\s+HANDLED_TAG_IDS\s*=\s*\[([^\]]+)\]\s*as\s+const\s*;/
  );
  if (!m) {
    throw new Error(
      `HANDLED_TAG_IDS constant not found in ${gateSrcPath}. ` +
      `Expected "export const HANDLED_TAG_IDS = [...] as const;"`
    );
  }
  return m[1]
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/**
 * Verify that gate.ts HANDLED_TAG_IDS set-equals nexus-core vocabulary/tags.yml ids.
 * @param {any} tagsVocab - parsed vocabulary/tags.yml
 * @param {string} gateSrcPath
 */
export function verifyTagDrift(tagsVocab, gateSrcPath) {
  const fromVocab = new Set(tagsVocab.tags.map(t => t.id));
  const fromGate = new Set(loadHandledTagIdsFromGate(gateSrcPath));
  const missingInGate = [...fromVocab].filter(x => !fromGate.has(x));
  const extraInGate = [...fromGate].filter(x => !fromVocab.has(x));
  if (missingInGate.length > 0 || extraInGate.length > 0) {
    throw new Error(
      `Tag drift detected:\n` +
      (missingInGate.length ? `  Missing in gate.ts: [${missingInGate.join(', ')}]\n` : '') +
      (extraInGate.length ? `  Extra in gate.ts (not in vocab): [${extraInGate.join(', ')}]\n` : '')
    );
  }
}

// ==========================================================================
// File writing
// ==========================================================================

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

/**
 * Write file content, creating parent directories as needed. LF only.
 * @param {string} dst - absolute path
 * @param {string} content
 */
export function writeGenerated(dst, content) {
  const dir = dirname(dst);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(dst, content, 'utf8');
}
