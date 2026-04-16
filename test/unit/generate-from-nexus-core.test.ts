// Unit tests for generate-from-nexus-core.lib.mjs
// Runs via: HOME=/tmp/nx-refactor-home bun test

// @ts-ignore - bun:test types not installed; runtime provides them
import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';

import {
  MODEL_TIER_TO_CLAUDE,
  MAX_TURNS_MAP,
  FIELD_ORDER,
  SKILL_FIELD_ORDER,
  verifyBodyHash,
  deriveDisallowedTools,
  emitYamlValue,
  emitFrontmatter,
  transformAgent,
  transformSkill,
  transformTags,
  deriveSkillTriggerDisplay,
  verifyTagDrift,
  loadHandledTagIdsFromGate,
  // @ts-ignore - .mjs JSDoc import
} from '../../generate-from-nexus-core.lib.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, 'fixtures/nexus-core-sample');

function loadFixtureYaml(relPath: string): any {
  return parseYaml(readFileSync(join(FIXTURE_ROOT, relPath), 'utf8'));
}
function loadFixtureText(relPath: string): string {
  return readFileSync(join(FIXTURE_ROOT, relPath), 'utf8');
}

// Build capsMap from fixture
function buildCapsMap(): Map<string, string[]> {
  const vocab = loadFixtureYaml('vocabulary/capabilities.yml');
  const map = new Map<string, string[]>();
  for (const cap of vocab.capabilities) {
    map.set(cap.id, cap.harness_mapping.claude_code);
  }
  return map;
}

describe('constants', () => {
  test('MODEL_TIER_TO_CLAUDE maps high→opus, standard→sonnet', () => {
    expect(MODEL_TIER_TO_CLAUDE.high).toBe('opus');
    expect(MODEL_TIER_TO_CLAUDE.standard).toBe('sonnet');
  });

  test('MAX_TURNS_MAP has all 9 agents', () => {
    const agents = ['architect', 'designer', 'engineer', 'postdoc', 'researcher', 'reviewer', 'strategist', 'tester', 'writer'];
    for (const a of agents) {
      expect(MAX_TURNS_MAP[a]).toBeGreaterThan(0);
    }
  });

  test('FIELD_ORDER has 9 fields, no tags', () => {
    expect(FIELD_ORDER).toHaveLength(9);
    expect(FIELD_ORDER).not.toContain('tags');
    expect(FIELD_ORDER[0]).toBe('name');
    expect(FIELD_ORDER[1]).toBe('description');
  });

  test('SKILL_FIELD_ORDER has 5 fields, no triggers', () => {
    expect(SKILL_FIELD_ORDER).toHaveLength(5);
    expect(SKILL_FIELD_ORDER).not.toContain('triggers');
  });
});

describe('verifyBodyHash', () => {
  test('accepts matching hash', () => {
    const content = 'hello';
    const hash = 'sha256:' + createHash('sha256').update(content).digest('hex');
    expect(() => verifyBodyHash(content, hash)).not.toThrow();
  });

  test('throws on mismatch', () => {
    expect(() => verifyBodyHash('hello', 'sha256:0000')).toThrow(/body_hash mismatch/);
  });
});

describe('deriveDisallowedTools', () => {
  const capsMap = buildCapsMap();

  test('preserves insertion order across capabilities', () => {
    const result = deriveDisallowedTools(['no_file_edit', 'no_task_create'], capsMap);
    expect(result).toEqual(['Edit', 'Write', 'NotebookEdit', 'mcp__plugin_claude-nexus_nx__nx_task_add']);
  });

  test('deduplicates via Set (if same tool mapped twice)', () => {
    const fakeMap = new Map<string, string[]>([
      ['a', ['Edit', 'Write']],
      ['b', ['Write', 'Read']],
    ]);
    expect(deriveDisallowedTools(['a', 'b'], fakeMap)).toEqual(['Edit', 'Write', 'Read']);
  });

  test('throws on unmapped capability', () => {
    expect(() => deriveDisallowedTools(['no_network'], capsMap)).toThrow(/no_network/);
  });

  test('empty capability array returns empty array', () => {
    expect(deriveDisallowedTools([], capsMap)).toEqual([]);
  });
});

describe('emitYamlValue', () => {
  test('task field is always double-quoted', () => {
    expect(emitYamlValue('task', 'Code implementation')).toBe('"Code implementation"');
  });

  test('trigger_display is always double-quoted', () => {
    expect(emitYamlValue('trigger_display', '[plan]')).toBe('"[plan]"');
  });

  test('purpose is always double-quoted', () => {
    expect(emitYamlValue('purpose', 'Hello world')).toBe('"Hello world"');
  });

  test('plain string stays unquoted when safe', () => {
    expect(emitYamlValue('name', 'engineer')).toBe('engineer');
  });

  test('array emits flow style', () => {
    expect(emitYamlValue('disallowedTools', ['Edit', 'Write'])).toBe('[Edit, Write]');
  });

  test('number emits bare', () => {
    expect(emitYamlValue('maxTurns', 25)).toBe('25');
  });

  test('boolean emits bare', () => {
    expect(emitYamlValue('disable-model-invocation', true)).toBe('true');
  });
});

describe('transformAgent', () => {
  const capsMap = buildCapsMap();
  const meta = loadFixtureYaml('agents/engineer/meta.yml');
  const body = loadFixtureText('agents/engineer/body.md');

  test('produces frontmatter with fields in FIELD_ORDER', () => {
    const out = transformAgent(meta, body, capsMap, 'agents/engineer');
    const match = out.match(/^---\n([\s\S]*?)\n---/);
    expect(match).not.toBeNull();
    const fmText = match![1];
    const fieldsInOrder = fmText.split('\n').map((l: string) => l.split(':')[0].trim());
    const knownFields = fieldsInOrder.filter((f: string) => FIELD_ORDER.includes(f));
    const expectedSubset = FIELD_ORDER.filter((f: string) => knownFields.includes(f));
    expect(knownFields).toEqual(expectedSubset);
  });

  test('maps model_tier to model correctly', () => {
    const out = transformAgent(meta, body, capsMap);
    expect(out).toContain('model: sonnet');
  });

  test('includes maxTurns for engineer (=25)', () => {
    const out = transformAgent(meta, body, capsMap);
    expect(out).toContain('maxTurns: 25');
  });

  test('derives disallowedTools from capabilities', () => {
    const out = transformAgent(meta, body, capsMap);
    expect(out).toContain('disallowedTools: [mcp__plugin_claude-nexus_nx__nx_task_add]');
  });

  test('body appended after frontmatter', () => {
    const out = transformAgent(meta, body, capsMap);
    expect(out).toContain('## Role');
    expect(out).toContain('## Constraints');
  });

  test('does not emit tags field (dropped)', () => {
    const out = transformAgent(meta, body, capsMap);
    expect(out).not.toContain('\ntags:');
  });
});

describe('deriveSkillTriggerDisplay', () => {
  test('returns bracketed tag when triggers present', () => {
    const meta = { id: 'nx-plan', triggers: ['plan'] };
    expect(deriveSkillTriggerDisplay(meta, 'claude-nexus')).toBe('[plan]');
  });

  test('returns slash command when manual_only is true', () => {
    const meta = { id: 'nx-init', manual_only: true };
    expect(deriveSkillTriggerDisplay(meta, 'claude-nexus')).toBe('/claude-nexus:nx-init');
  });

  test('throws on skill with neither triggers nor manual_only', () => {
    const meta = { id: 'orphan' };
    expect(() => deriveSkillTriggerDisplay(meta, 'claude-nexus')).toThrow();
  });
});

describe('transformSkill', () => {
  const meta = loadFixtureYaml('skills/nx-plan/meta.yml');
  const body = loadFixtureText('skills/nx-plan/body.md');

  test('emits nx-plan skill with bracketed trigger_display', () => {
    const out = transformSkill(meta, body, 'claude-nexus', { summary: 'Structured planning' }, 'skills/nx-plan');
    expect(out).toContain('trigger_display: "[plan]"');
    expect(out).toContain('purpose: "Structured planning"');
    expect(out).not.toContain('disable-model-invocation');
  });

  test('emits disable-model-invocation: true for manual_only skill', () => {
    const fakeMeta = { id: 'nx-init', name: 'nx-init', description: 'desc', manual_only: true };
    const out = transformSkill(fakeMeta, '## Role\n\nfoo\n', 'claude-nexus');
    expect(out).toContain('disable-model-invocation: true');
    expect(out).toContain('trigger_display: "/claude-nexus:nx-init"');
  });

  test('uses manifestEntry.summary as purpose', () => {
    const fakeMeta = { id: 'nx-unknown', name: 'nx-unknown', description: 'fallback desc', triggers: ['unknown'] };
    const out = transformSkill(fakeMeta, '## Role\n\nfoo\n', 'claude-nexus', { summary: 'Custom purpose' });
    expect(out).toContain('purpose: "Custom purpose"');
  });

  test('falls back to description when manifestEntry is absent', () => {
    const fakeMeta = { id: 'nx-unknown', name: 'nx-unknown', description: 'fallback desc', triggers: ['unknown'] };
    const out = transformSkill(fakeMeta, '## Role\n\nfoo\n', 'claude-nexus');
    expect(out).toContain('purpose: "fallback desc"');
  });
});

describe('transformTags', () => {
  test('strips brackets from trigger field and preserves m:gc display', () => {
    const vocab = loadFixtureYaml('vocabulary/tags.yml');
    const result = transformTags(vocab);
    const mGc = result.find((t: any) => t.tag === 'm:gc');
    expect(mGc).toBeDefined();
    expect(mGc.tag).toBe('m:gc');
    const plan = result.find((t: any) => t.tag === 'plan');
    expect(plan).toBeDefined();
  });
});

describe('verifyTagDrift', () => {
  test('throws when gate.ts HANDLED_TAG_IDS is missing from fixture tags (diff detected)', () => {
    // Fixture has 2 tags (plan, m-gc); real gate.ts has 7 (plan, run, sync, d, m, m-gc, rule)
    const fixtureVocab = loadFixtureYaml('vocabulary/tags.yml');
    const gateSrcPath = join(__dirname, '../..', 'src/hooks/gate.ts');
    expect(() => verifyTagDrift(fixtureVocab, gateSrcPath)).toThrow(/drift/i);
  });

  test('passes when sets match (synthetic)', () => {
    const syntheticVocab = {
      tags: [
        { id: 'plan', trigger: '[plan]', description: 'plan' },
        { id: 'run', trigger: '[run]', description: 'run' },
        { id: 'sync', trigger: '[sync]', description: 'sync' },
        { id: 'd', trigger: '[d]', description: 'd' },
        { id: 'm', trigger: '[m]', description: 'm' },
        { id: 'm-gc', trigger: '[m:gc]', description: 'gc' },
        { id: 'rule', trigger: '[rule]', description: 'rule' },
      ],
    };
    const gateSrcPath = join(__dirname, '../..', 'src/hooks/gate.ts');
    expect(() => verifyTagDrift(syntheticVocab, gateSrcPath)).not.toThrow();
  });
});

describe('loadHandledTagIdsFromGate', () => {
  test('extracts 7 tag ids from real gate.ts', () => {
    const gateSrcPath = join(__dirname, '../..', 'src/hooks/gate.ts');
    const ids = loadHandledTagIdsFromGate(gateSrcPath);
    expect(ids.sort()).toEqual(['d', 'm', 'm-gc', 'plan', 'rule', 'run', 'sync']);
  });
});
