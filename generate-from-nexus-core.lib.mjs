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
 * @param {any} [invocationMap] - invocation-map.yml for Spec γ macro expansion (optional)
 * @param {Set<string>} [invocationsEnum] - allowed primitive ids (optional)
 * @returns {string}
 */
export function transformAgent(meta, body, capsMap, label = '', invocationMap = null, invocationsEnum = null) {
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
  const expandedBody = expandMacros(body, invocationMap, invocationsEnum);
  const bodyPart = expandedBody.startsWith('\n') ? expandedBody : '\n' + expandedBody;
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
 * @param {any} [invocationMap] - invocation-map.yml for Spec γ macro expansion (optional)
 * @param {Set<string>} [invocationsEnum] - allowed primitive ids (optional)
 * @returns {string}
 */
export function transformSkill(meta, body, pluginName, manifestEntry, label = '', invocationMap = null, invocationsEnum = null) {
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

  const expandedBody = expandMacros(body, invocationMap, invocationsEnum);
  let enrichedBody = expandedBody;
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
// Macro expander — nexus-core v0.8.0 Spec γ primitives
// ==========================================================================

/** @returns {any} parsed invocation-map.yml */
export function loadInvocationMap() {
  const path = join(CLAUDE_NEXUS_ROOT, 'invocation-map.yml');
  return parseYaml(readFileSync(path, 'utf8'));
}

/** @returns {Set<string>} primitive ids declared in nexus-core vocabulary/invocations.yml */
export function loadInvocationsEnum() {
  const path = join(NEXUS_CORE_ROOT, 'vocabulary/invocations.yml');
  const doc = parseYaml(readFileSync(path, 'utf8'));
  return new Set(doc.invocations.map(i => i.id));
}

/**
 * Parse macro params string into a record.
 * Value forms:
 *   bareword        → string
 *   "quoted string" → string (escape `\"` supported)
 *   [a, b]          → inline array string (kept as-is including brackets)
 *   {k: v}          → inline object string (kept as-is including braces)
 *   >>IDENT         → { heredoc: IDENT } sentinel
 * @param {string} raw
 * @returns {Record<string, any>}
 */
export function parseMacroParams(raw) {
  const s = raw.trim();
  const params = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;

    const keyStart = i;
    while (i < s.length && /[\w]/.test(s[i])) i++;
    const key = s.slice(keyStart, i);
    if (!key) throw new Error(`parseMacroParams: expected key at offset ${i} in "${raw}"`);
    if (s[i] !== '=') throw new Error(`parseMacroParams: expected '=' after key "${key}" at offset ${i}`);
    i++;

    let val;
    if (s[i] === '"') {
      let v = '';
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length) { v += s[i + 1]; i += 2; }
        else { v += s[i]; i++; }
      }
      if (s[i] !== '"') throw new Error(`parseMacroParams: unterminated quoted string for "${key}"`);
      i++;
      val = v;
    } else if (s[i] === '[' || s[i] === '{') {
      const open = s[i];
      const close = open === '[' ? ']' : '}';
      let depth = 1;
      const start = i;
      i++;
      while (i < s.length && depth > 0) {
        if (s[i] === '"') {
          i++;
          while (i < s.length && s[i] !== '"') {
            if (s[i] === '\\' && i + 1 < s.length) i += 2;
            else i++;
          }
          i++;
          continue;
        }
        if (s[i] === open) depth++;
        else if (s[i] === close) depth--;
        i++;
      }
      if (depth !== 0) throw new Error(`parseMacroParams: unbalanced ${open}${close} for "${key}"`);
      val = s.slice(start, i);
    } else if (s[i] === '>' && s[i + 1] === '>') {
      i += 2;
      const start = i;
      while (i < s.length && /\w/.test(s[i])) i++;
      val = { heredoc: s.slice(start, i) };
    } else {
      const start = i;
      while (i < s.length && !/\s/.test(s[i])) i++;
      val = s.slice(start, i);
    }

    params[key] = val;
  }
  return params;
}

/**
 * Expand one primitive macro to its Claude Code tool invocation string.
 * Returns bare text (no wrapping backticks) — the caller's surrounding markdown is preserved.
 * @param {string} primitive
 * @param {Record<string, any>} params
 * @param {any} invocationMap
 * @returns {string}
 */
export function expandPrimitive(primitive, params, invocationMap) {
  const cfg = invocationMap?.invocation_map?.[primitive];
  if (!cfg) {
    throw new Error(`expandPrimitive: primitive "${primitive}" has no entry in invocation-map.yml`);
  }
  switch (primitive) {
    case 'skill_activation': {
      const { skill, mode } = params;
      if (!skill) throw new Error(`skill_activation: missing required 'skill'`);
      const parts = [`skill: "${cfg.skill_namespace}${skill}"`];
      if (mode) parts.push(`args: "${mode}"`);
      return `${cfg.tool}({ ${parts.join(', ')} })`;
    }
    case 'subagent_spawn': {
      const { target_role, prompt, name } = params;
      if (!target_role) throw new Error(`subagent_spawn: missing required 'target_role'`);
      if (prompt === undefined) throw new Error(`subagent_spawn: missing required 'prompt'`);
      const isBuiltin = Array.isArray(cfg.builtin_roles) && cfg.builtin_roles.includes(target_role);
      const subagentType = isBuiltin ? target_role : `${cfg.role_namespace}${target_role}`;
      const parts = [`subagent_type: "${subagentType}"`];
      if (name) parts.push(`name: "${name}"`);
      const promptStr = typeof prompt === 'string' ? prompt : String(prompt);
      const isMultiline = promptStr.includes('\n');
      parts.push(isMultiline ? `prompt: \`\n${promptStr}\n\`` : `prompt: "${promptStr.replace(/"/g, '\\"')}"`);
      return `${cfg.tool}({ ${parts.join(', ')} })`;
    }
    case 'task_register': {
      const { label, state } = params;
      if (!label) throw new Error(`task_register: missing required 'label'`);
      if (!state) throw new Error(`task_register: missing required 'state'`);
      const tool = cfg.tools?.[state];
      if (!tool) throw new Error(`task_register: unsupported state "${state}"`);
      if (state === 'pending') {
        return `${tool}({ subject: "${label}" })`;
      }
      return `${tool}({ taskId: <id>, status: "${state}" })`;
    }
    case 'user_question': {
      const { question, options } = params;
      if (!question) throw new Error(`user_question: missing required 'question'`);
      if (!options) throw new Error(`user_question: missing required 'options'`);
      return `${cfg.tool}({ question: "${question}", options: ${options} })`;
    }
    default:
      throw new Error(`expandPrimitive: no handler for primitive "${primitive}"`);
  }
}

// Lazy match — inner `{...}` / `[...]` are permitted as long as `}}` only appears at the terminator.
const MACRO_RE = /\{\{(\w+)\s+(.*?)\}\}/g;
const MACRO_RE_SINGLE = /\{\{(\w+)\s+(.*?)\}\}/;

/**
 * Expand Spec γ macro tokens ({{primitive key=val ...}}) in a body string.
 * Heredoc references (`key=>>IDENT` paired with `<<IDENT` on a later line) are resolved
 * before expansion; the heredoc block is consumed and removed from the output.
 * Unknown primitives throw — no silent pass.
 *
 * @param {string} body
 * @param {any} invocationMap
 * @param {Set<string>} invocationsEnum
 * @returns {string}
 */
export function expandMacros(body, invocationMap, invocationsEnum) {
  if (!invocationMap || !invocationsEnum) return body;
  const lines = body.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!MACRO_RE_SINGLE.test(line)) {
      out.push(line);
      i++;
      continue;
    }

    // Detect heredoc reference in the first macro on this line
    let heredocIdent = null;
    const firstMatch = line.match(MACRO_RE_SINGLE);
    if (firstMatch) {
      const p = parseMacroParams(firstMatch[2]);
      for (const v of Object.values(p)) {
        if (v && typeof v === 'object' && typeof v.heredoc === 'string') {
          heredocIdent = v.heredoc;
          break;
        }
      }
    }

    if (heredocIdent) {
      const heredocLines = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== `<<${heredocIdent}`) {
        heredocLines.push(lines[j]);
        j++;
      }
      if (j >= lines.length) {
        throw new Error(`expandMacros: heredoc closure <<${heredocIdent} not found for macro at line ${i + 1}`);
      }
      const heredocContent = heredocLines.join('\n').trim();
      const expanded = line.replace(MACRO_RE_SINGLE, (_match, primitive, raw) => {
        if (!invocationsEnum.has(primitive)) {
          throw new Error(`expandMacros: unknown primitive "${primitive}" at line ${i + 1}`);
        }
        const params = parseMacroParams(raw);
        for (const [k, v] of Object.entries(params)) {
          if (v && typeof v === 'object' && typeof v.heredoc === 'string') {
            params[k] = heredocContent;
          }
        }
        return expandPrimitive(primitive, params, invocationMap);
      });
      out.push(expanded);
      i = j + 1;
      continue;
    }

    const expanded = line.replace(MACRO_RE, (_match, primitive, raw) => {
      if (!invocationsEnum.has(primitive)) {
        throw new Error(`expandMacros: unknown primitive "${primitive}" at line ${i + 1}`);
      }
      const params = parseMacroParams(raw);
      for (const v of Object.values(params)) {
        if (v && typeof v === 'object' && typeof v.heredoc === 'string') {
          throw new Error(`expandMacros: heredoc reference >>${v.heredoc} without closure on line ${i + 1}`);
        }
      }
      return expandPrimitive(primitive, params, invocationMap);
    });
    out.push(expanded);
    i++;
  }
  return out.join('\n');
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
