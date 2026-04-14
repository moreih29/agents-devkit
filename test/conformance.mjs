#!/usr/bin/env node
/**
 * Conformance test for claude-nexus MCP tools against nexus-core fixtures.
 * Validates state schemas and tool behaviour using declarative JSON fixtures.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Output helpers
// ─────────────────────────────────────────────────────────────────────────────
const green = (msg) => console.log(`\x1b[32m✔ ${msg}\x1b[0m`);
const red   = (msg) => console.log(`\x1b[31m✘ ${msg}\x1b[0m`);

let PASS = 0;
let FAIL = 0;

function pass(name) { green(name); PASS++; }
function fail(name, reason) { red(`${name} — ${reason}`); FAIL++; }

// ─────────────────────────────────────────────────────────────────────────────
// Locate nexus-core (installed or sibling)
// ─────────────────────────────────────────────────────────────────────────────
function findNexusCore() {
  const installed = join(PROJECT_ROOT, 'node_modules', '@moreih29', 'nexus-core');
  if (existsSync(installed)) return installed;
  // Sibling repo layout (development)
  const sibling = resolve(PROJECT_ROOT, '..', 'nexus-core');
  if (existsSync(sibling)) return sibling;
  throw new Error('nexus-core not found (looked in node_modules/@moreih29/nexus-core and ../nexus-core)');
}

const CORE = findNexusCore();

// ─────────────────────────────────────────────────────────────────────────────
// Load schemas and fixtures
// ─────────────────────────────────────────────────────────────────────────────
const SCHEMAS = {
  plan:         JSON.parse(readFileSync(join(CORE, 'conformance/state-schemas/plan.schema.json'), 'utf-8')),
  tasks:        JSON.parse(readFileSync(join(CORE, 'conformance/state-schemas/tasks.schema.json'), 'utf-8')),
  history:      JSON.parse(readFileSync(join(CORE, 'conformance/state-schemas/history.schema.json'), 'utf-8')),
  agentTracker: JSON.parse(readFileSync(join(CORE, 'conformance/state-schemas/agent-tracker.schema.json'), 'utf-8')),
};

// Load all tool fixtures dynamically from conformance/tools/
const TOOL_FIXTURES = {};
for (const f of readdirSync(join(CORE, 'conformance/tools')).filter(f => f.endsWith('.json'))) {
  TOOL_FIXTURES[f.replace('.json', '')] = JSON.parse(readFileSync(join(CORE, 'conformance/tools', f), 'utf-8'));
}

const SCENARIOS = [
  JSON.parse(readFileSync(join(CORE, 'conformance/scenarios/full-plan-cycle.json'), 'utf-8')),
  JSON.parse(readFileSync(join(CORE, 'conformance/scenarios/task-deps-ordering.json'), 'utf-8')),
];

// ─────────────────────────────────────────────────────────────────────────────
// Tool name mapping
// ─────────────────────────────────────────────────────────────────────────────
const TOOL_MAP = {
  plan_start:     'nx_plan_start',
  plan_decide:    'nx_plan_decide',
  plan_status:    'nx_plan_status',
  plan_update:    'nx_plan_update',
  task_add:       'nx_task_add',
  task_update:    'nx_task_update',
  task_list:      'nx_task_list',
  task_close:     'nx_task_close',
  artifact_write: 'nx_artifact_write',
  history_search: 'nx_history_search',
  context:        'nx_context',
};

// ─────────────────────────────────────────────────────────────────────────────
// MCP call via JSON-RPC pipe
// ─────────────────────────────────────────────────────────────────────────────
function mcpCall(toolName, params, stateDir) {
  const mcpTool = TOOL_MAP[toolName] || toolName;
  const init = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'conformance', version: '0.1.0' } }
  });
  const initialized = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const call = JSON.stringify({
    jsonrpc: '2.0', id: 2, method: 'tools/call',
    params: { name: mcpTool, arguments: params }
  });

  // Trailing newline required: StdioServerTransport reads line-by-line and
  // only processes the last message when the line is complete (terminated by \n).
  const input = `${init}\n${initialized}\n${call}\n`;

  // Write to a temp file and redirect — avoids shell escaping issues with
  // content strings that contain literal \n sequences (which `echo` would
  // misinterpret as real newlines, breaking the JSON).
  const inputFile = join(stateDir, '__mcp_input__.txt');
  writeFileSync(inputFile, input);

  try {
    const out = execSync(`node bridge/mcp-server.cjs < ${inputFile}`, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, NEXUS_RUNTIME_ROOT: stateDir },
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const lines = out.trim().split('\n').filter(Boolean);
    const last = JSON.parse(lines[lines.length - 1]);
    if (last.error) {
      return { __rpc_error: last.error };
    }
    const text = last.result?.content?.[0]?.text;
    if (text) {
      try { return JSON.parse(text); } catch {
        if (/^MCP error|^Error/i.test(text)) return { __rpc_error: true, __raw: text };
        return { __raw: text };
      }
    }
    return last;
  } catch (err) {
    // execSync throws on non-zero exit; also parse any output
    const out = (err.stdout || '') + (err.stderr || '');
    // If it's an MCP error response (tool schema validation failure), that's
    // an "error" result — return marker so callers can detect it.
    if (out.includes('"error"')) {
      return { __rpc_error: true, __raw: out };
    }
    return { __exec_error: err.message, __raw: out };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini JSON Schema validator (draft 2020-12 subset)
// ─────────────────────────────────────────────────────────────────────────────
function validateSchema(value, schema, defs, path = '$') {
  if (!schema) return null;

  // Resolve $ref
  if (schema.$ref) {
    const refPath = schema.$ref.replace(/^#\/\$defs\//, '');
    const resolved = (defs || {})[refPath];
    if (!resolved) return `${path}: unresolved $ref ${schema.$ref}`;
    return validateSchema(value, resolved, defs, path);
  }

  // oneOf — try each, return null if any passes
  if (schema.oneOf) {
    const passing = schema.oneOf.filter((s) => validateSchema(value, s, defs, path) === null);
    if (passing.length === 0) return `${path}: does not match any oneOf`;
    return null;
  }

  // type check
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    if (!types.includes(actualType)) {
      return `${path}: expected type ${types.join('|')}, got ${actualType}`;
    }
  }

  // null shortcircuit after type check
  if (value === null) return null;

  // enum
  if (schema.enum !== undefined) {
    if (!schema.enum.includes(value)) {
      return `${path}: expected enum [${schema.enum.join(', ')}], got ${JSON.stringify(value)}`;
    }
  }

  // minimum (number)
  if (schema.minimum !== undefined && typeof value === 'number') {
    if (value < schema.minimum) return `${path}: ${value} < minimum ${schema.minimum}`;
  }

  // minLength (string)
  if (schema.minLength !== undefined && typeof value === 'string') {
    if (value.length < schema.minLength) return `${path}: string length ${value.length} < minLength ${schema.minLength}`;
  }

  // format: date-time
  if (schema.format === 'date-time' && typeof value === 'string') {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(value)) {
      return `${path}: not a valid date-time: ${value}`;
    }
  }

  // array
  if (Array.isArray(value)) {
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        const err = validateSchema(value[i], schema.items, defs, `${path}[${i}]`);
        if (err) return err;
      }
    }
    return null;
  }

  // object
  if (typeof value === 'object') {
    // required
    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in value)) return `${path}: missing required property "${key}"`;
      }
    }
    // additionalProperties: false
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) return `${path}: unexpected property "${key}"`;
      }
    }
    // properties
    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          const err = validateSchema(value[key], propSchema, defs, `${path}.${key}`);
          if (err) return err;
        }
      }
    }
    // additionalProperties as schema (for object additionalProperties: { type: string })
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object' && schema.properties) {
      for (const [key, val] of Object.entries(value)) {
        if (!(key in schema.properties)) {
          const err = validateSchema(val, schema.additionalProperties, defs, `${path}.${key}`);
          if (err) return err;
        }
      }
    }
  }

  return null;
}

function validateAgainstSchema(data, schema) {
  const defs = schema.$defs || {};
  return validateSchema(data, schema, defs, '$');
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini JSONPath evaluator
// ─────────────────────────────────────────────────────────────────────────────
function jsonPath(obj, path) {
  if (!path.startsWith('$')) throw new Error(`Invalid path: ${path}`);
  const parts = path.slice(1).split('.').filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    // Handle array access: e.g. "arr[0]", "arr[-1]", "arr[0]" within a segment
    const arrMatch = part.match(/^([^\[]*)\[(-?\d+)\]$/);
    if (arrMatch) {
      const key = arrMatch[1];
      const idx = parseInt(arrMatch[2], 10);
      if (key) {
        cur = cur[key];
        if (!Array.isArray(cur)) return undefined;
      }
      cur = idx < 0 ? cur[cur.length + idx] : cur[idx];
    } else if (part === 'length') {
      cur = Array.isArray(cur) ? cur.length : (typeof cur === 'string' ? cur.length : undefined);
    } else {
      cur = cur[part];
    }
  }
  return cur;
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertion matcher
// ─────────────────────────────────────────────────────────────────────────────
function assertValue(actual, expected, label) {
  if (expected === null) {
    if (actual !== null && actual !== undefined) {
      return `${label}: expected null, got ${JSON.stringify(actual)}`;
    }
    return null;
  }
  if (typeof expected === 'object' && !Array.isArray(expected)) {
    // Type assertion object
    if (expected.type === 'number') {
      if (typeof actual !== 'number') return `${label}: expected number, got ${typeof actual}`;
      if (expected.min !== undefined && actual < expected.min) return `${label}: ${actual} < min ${expected.min}`;
      return null;
    }
    if (expected.type === 'string') {
      if (typeof actual !== 'string') return `${label}: expected string, got ${typeof actual}`;
      if (expected.minLength !== undefined && actual.length < expected.minLength) {
        return `${label}: string too short (${actual.length} < ${expected.minLength})`;
      }
      if (expected.pattern !== undefined && !new RegExp(expected.pattern).test(actual)) {
        return `${label}: does not match pattern ${expected.pattern}: ${actual}`;
      }
      return null;
    }
    if (expected.type === 'iso8601') {
      if (typeof actual !== 'string') return `${label}: expected ISO8601 string, got ${typeof actual}`;
      if (!/^\d{4}-\d{2}-\d{2}T/.test(actual)) return `${label}: not ISO8601: ${actual}`;
      return null;
    }
    return `${label}: unknown assertion type: ${JSON.stringify(expected)}`;
  }
  // Exact match
  if (actual !== expected) {
    return `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// State file helpers
// ─────────────────────────────────────────────────────────────────────────────
// Maps logical paths like ".nexus/state/plan.json" to actual temp dir paths.
// NEXUS_RUNTIME_ROOT = stateDir (the temp dir); within it:
//   .nexus/state/plan.json      → stateDir/state/plan.json
//   .nexus/history.json         → stateDir/history.json
//   .nexus/state/artifacts/...  → stateDir/state/claude-nexus/artifacts/... (harness-local)
const HARNESS_REMAP = [
  { from: '.nexus/state/artifacts/', to: 'state/claude-nexus/artifacts/' },
];
function resolveStatePath(stateDir, logicalPath) {
  // Harness-local remap: fixture logical paths → actual namespaced paths
  for (const { from, to } of HARNESS_REMAP) {
    if (logicalPath.startsWith(from)) {
      return join(stateDir, to + logicalPath.slice(from.length));
    }
  }
  // Strip leading ".nexus/"
  const rel = logicalPath.replace(/^\.nexus\//, '');
  return join(stateDir, rel);
}

function setupStateFiles(stateDir, stateFiles) {
  if (!stateFiles) return;
  for (const [logicalPath, content] of Object.entries(stateFiles)) {
    const absPath = resolveStatePath(stateDir, logicalPath);
    if (content === null) {
      // Must NOT exist — delete if present
      if (existsSync(absPath)) unlinkSync(absPath);
    } else {
      // Write the content
      const dir = absPath.substring(0, absPath.lastIndexOf('/'));
      mkdirSync(dir, { recursive: true });
      writeFileSync(absPath, JSON.stringify(content, null, 2));
    }
  }
}

function checkStateFiles(stateDir, stateFiles, testId) {
  if (!stateFiles) return;
  for (const [logicalPath, assertions] of Object.entries(stateFiles)) {
    const absPath = resolveStatePath(stateDir, logicalPath);
    if (assertions === null) {
      // Must NOT exist
      if (existsSync(absPath)) {
        fail(`${testId} [state ${logicalPath}]`, `file should not exist but does`);
      } else {
        pass(`${testId} [state ${logicalPath} absent]`);
      }
      continue;
    }
    // File must exist and match assertions
    if (!existsSync(absPath)) {
      fail(`${testId} [state ${logicalPath}]`, `file does not exist`);
      continue;
    }
    const assertionEntries = Object.entries(assertions);
    if (assertionEntries.length === 0) {
      // Empty assertions object: file-exists check only
      pass(`${testId} [state ${logicalPath}]`);
      continue;
    }
    let data;
    try {
      data = JSON.parse(readFileSync(absPath, 'utf-8'));
    } catch (e) {
      fail(`${testId} [state ${logicalPath}]`, `JSON parse error: ${e.message}`);
      continue;
    }
    for (const [path, expected] of assertionEntries) {
      const actual = jsonPath(data, path);
      const err = assertValue(actual, expected, `${logicalPath} ${path}`);
      if (err) {
        fail(`${testId} [state ${logicalPath} ${path}]`, err);
      } else {
        pass(`${testId} [state ${logicalPath} ${path}]`);
      }
    }
  }
}

function checkReturnValue(returnVal, assertions, testId) {
  if (!assertions) return;
  for (const [path, expected] of Object.entries(assertions)) {
    const actual = jsonPath(returnVal, path);
    const err = assertValue(actual, expected, path);
    if (err) {
      fail(`${testId} [return ${path}]`, err);
    } else {
      pass(`${testId} [return ${path}]`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: State schema validation
// ─────────────────────────────────────────────────────────────────────────────
function runStateSchemaValidation(stateDir) {
  console.log('\n=== State Schema Validation ===');

  // plan.json after plan_start
  setupStateFiles(stateDir, { '.nexus/state/plan.json': null });
  const planResult = mcpCall('plan_start', {
    topic: 'Schema validation test',
    issues: ['Issue one', 'Issue two'],
    research_summary: 'Testing schema conformance with state files.'
  }, stateDir);

  const planPath = resolveStatePath(stateDir, '.nexus/state/plan.json');
  if (existsSync(planPath)) {
    const planData = JSON.parse(readFileSync(planPath, 'utf-8'));
    const err = validateAgainstSchema(planData, SCHEMAS.plan);
    if (err) {
      fail('schema/plan.json', err);
    } else {
      pass('schema/plan.json validates');
    }
  } else {
    fail('schema/plan.json', 'plan.json not created');
  }

  // tasks.json after task_add
  setupStateFiles(stateDir, { '.nexus/state/tasks.json': null });
  mcpCall('task_add', {
    title: 'Schema test task',
    context: 'Validating tasks schema conformance',
    deps: [],
    goal: 'Schema test goal',
    decisions: ['Decision one']
  }, stateDir);

  const tasksPath = resolveStatePath(stateDir, '.nexus/state/tasks.json');
  if (existsSync(tasksPath)) {
    const tasksData = JSON.parse(readFileSync(tasksPath, 'utf-8'));
    const err = validateAgainstSchema(tasksData, SCHEMAS.tasks);
    if (err) {
      fail('schema/tasks.json', err);
    } else {
      pass('schema/tasks.json validates');
    }
  } else {
    fail('schema/tasks.json', 'tasks.json not created');
  }

  // history.json after task_close
  mcpCall('task_close', {}, stateDir);
  const historyPath = resolveStatePath(stateDir, '.nexus/history.json');
  if (existsSync(historyPath)) {
    const histData = JSON.parse(readFileSync(historyPath, 'utf-8'));
    const err = validateAgainstSchema(histData, SCHEMAS.history);
    if (err) {
      fail('schema/history.json', err);
    } else {
      pass('schema/history.json validates');
    }
  } else {
    fail('schema/history.json', 'history.json not created');
  }

  // agent-tracker.json — synthesize a valid array and validate schema
  const trackerSample = [
    {
      harness_id: 'claude-nexus',
      agent_name: 'engineer',
      agent_id: 'abc123',
      started_at: new Date().toISOString(),
      resume_count: 0,
      status: 'running',
    }
  ];
  const tErr = validateAgainstSchema(trackerSample, SCHEMAS.agentTracker);
  if (tErr) {
    fail('schema/agent-tracker.json (sample)', tErr);
  } else {
    pass('schema/agent-tracker.json (sample) validates');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Tool fixture tests
// ─────────────────────────────────────────────────────────────────────────────
function runToolFixtures(stateDir) {
  console.log('\n=== Tool Fixtures ===');

  for (const [fixtureName, fixtures] of Object.entries(TOOL_FIXTURES)) {
    for (const fixture of fixtures) {
      const { test_id, precondition, action, postcondition } = fixture;

      // Setup precondition
      if (precondition?.state_files) {
        setupStateFiles(stateDir, precondition.state_files);
      }

      // Execute action
      const result = mcpCall(action.tool, action.params || {}, stateDir);

      // Check postcondition
      if (postcondition?.error) {
        // Expect an error of some kind
        const isError = result?.__rpc_error || result?.__exec_error || result?.error !== undefined;
        if (isError) {
          pass(`${test_id} [expected error]`);
        } else {
          fail(`${test_id} [expected error]`, `expected error but got: ${JSON.stringify(result)}`);
        }
      } else {
        // Check return value assertions
        if (postcondition?.return_value) {
          checkReturnValue(result, postcondition.return_value, test_id);
        }
        // Check state file assertions
        if (postcondition?.state_files) {
          checkStateFiles(stateDir, postcondition.state_files, test_id);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Scenario tests
// ─────────────────────────────────────────────────────────────────────────────
function runScenarios(stateDir) {
  console.log('\n=== Scenarios ===');

  for (const scenario of SCENARIOS) {
    const { test_id, precondition, steps } = scenario;

    // Reset state for each scenario with its own sub-dir
    const scenarioDir = join(stateDir, 'scenarios', test_id);
    mkdirSync(join(scenarioDir, 'state'), { recursive: true });

    // Setup precondition
    if (precondition?.state_files) {
      setupStateFiles(scenarioDir, precondition.state_files);
    }

    console.log(`  [${test_id}]`);

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepId = `${test_id}/step${i + 1}`;

      const result = mcpCall(step.action.tool, step.action.params || {}, scenarioDir);

      // assert_return
      if (step.assert_return) {
        checkReturnValue(result, step.assert_return, stepId);
      }

      // assert_state
      if (step.assert_state) {
        checkStateFiles(scenarioDir, step.assert_state, stepId);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
function main() {
  const stateDir = join(tmpdir(), `nx-conformance-${Date.now()}`);
  mkdirSync(join(stateDir, 'state'), { recursive: true });
  mkdirSync(join(stateDir, 'context'), { recursive: true });
  // Provide a minimal context file so nx_context passes
  writeFileSync(join(stateDir, 'context', 'architecture.md'), '# Architecture\n');

  try {
    runStateSchemaValidation(stateDir);
    runToolFixtures(stateDir);
    runScenarios(stateDir);
  } finally {
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n=== Conformance: ${PASS} passed, ${FAIL} failed ===`);
  process.exit(FAIL > 0 ? 1 : 0);
}

main();
