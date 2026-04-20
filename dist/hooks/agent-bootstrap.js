// src/shared/json-store.js
import fs from "node:fs/promises";
import { constants as fsConstants, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
var inProcessQueues = new Map;
async function runWithInProcessLock(filePath, action) {
  const previous = inProcessQueues.get(filePath) ?? Promise.resolve();
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const entry = previous.then(() => gate);
  inProcessQueues.set(filePath, entry);
  await previous;
  try {
    return await action();
  } finally {
    release();
    entry.finally(() => {
      if (inProcessQueues.get(filePath) === entry) {
        inProcessQueues.delete(filePath);
      }
    });
  }
}
var LOCK_RETRY_INTERVAL_MS = 100;
var LOCK_MAX_RETRIES = 50;
var LOCK_STALE_MS = 30000;
function lockPath(filePath) {
  return `${filePath}.lock`;
}
async function acquireFsLock(filePath) {
  const lp = lockPath(filePath);
  for (let attempt = 0;attempt <= LOCK_MAX_RETRIES; attempt++) {
    try {
      const fd = await fs.open(lp, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL);
      await fd.close();
      return;
    } catch (err) {
      const e = err;
      if (e.code !== "EEXIST")
        throw err;
      try {
        const stat = await fs.stat(lp);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > LOCK_STALE_MS) {
          await fs.unlink(lp).catch(() => {
            return;
          });
          continue;
        }
      } catch {
        continue;
      }
      if (attempt === LOCK_MAX_RETRIES) {
        throw new Error(`Failed to acquire lock for "${filePath}" after ${LOCK_MAX_RETRIES} retries`);
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
    }
  }
}
async function releaseFsLock(filePath) {
  await fs.unlink(lockPath(filePath)).catch(() => {
    return;
  });
}
async function readJsonFile(filePath, defaultValue) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (err) {
    const e = err;
    if (e.code === "ENOENT")
      return defaultValue;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}
async function writeJsonFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${randomUUID()}`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2) + `
`, "utf8");
  await fs.rename(tmpPath, filePath);
}
async function updateJsonFileLocked(filePath, defaultValue, updater) {
  return runWithInProcessLock(filePath, async () => {
    await acquireFsLock(filePath);
    try {
      const current = await readJsonFile(filePath, defaultValue);
      const next = await updater(current);
      await writeJsonFile(filePath, next);
      return next;
    } finally {
      await releaseFsLock(filePath);
    }
  });
}
var APPEND_SIZE_WARN_THRESHOLD = 4 * 1024;

// assets/hooks/agent-bootstrap/handler.ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
var CORE_INDEX_SIZE_LIMIT = 2 * 1024;
function loadValidRoles(cwd) {
  const inlined = globalThis.__NEXUS_INLINE_AGENT_ROLES__;
  if (Array.isArray(inlined))
    return inlined;
  const agentsDir = join(cwd, "assets/agents");
  if (!existsSync(agentsDir))
    return [];
  return readdirSync(agentsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}
function readFirstLine(path2) {
  try {
    const content = readFileSync(path2, "utf-8");
    const firstNonEmpty = content.split(`
`).find((l) => l.trim().length > 0) ?? "";
    return firstNonEmpty.replace(/^#+\s*/, "").slice(0, 80);
  } catch {
    return "";
  }
}
function buildCoreIndex(cwd) {
  const entries = [];
  for (const sub of [".nexus/memory", ".nexus/context"]) {
    const absDir = join(cwd, sub);
    if (!existsSync(absDir))
      continue;
    for (const f of readdirSync(absDir, { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith(".md"))
        continue;
      const full = join(absDir, f.name);
      entries.push({
        path: `${sub}/${f.name}`,
        mtime: statSync(full).mtimeMs,
        line: readFirstLine(full)
      });
    }
  }
  entries.sort((a, b) => b.mtime - a.mtime);
  const lines = [];
  let bytes = 0;
  for (const e of entries) {
    const formatted = `- ${e.path}: ${e.line}`;
    if (bytes + formatted.length + 1 > CORE_INDEX_SIZE_LIMIT)
      break;
    lines.push(formatted);
    bytes += formatted.length + 1;
  }
  return lines.length > 0 ? `Available memory/context:
` + lines.join(`
`) : "";
}
function getResumeCount(cwd, sessionId, agentId) {
  const trackerPath = join(cwd, ".nexus/state", sessionId, "agent-tracker.json");
  if (!existsSync(trackerPath))
    return 0;
  try {
    const tracker = JSON.parse(readFileSync(trackerPath, "utf-8"));
    const entry = Array.isArray(tracker) ? tracker.find((e) => e.agent_id === agentId) : null;
    return entry?.resume_count ?? 0;
  } catch {
    return 0;
  }
}
var handler = async (input) => {
  if (input.hook_event_name !== "SubagentStart")
    return;
  const { cwd, session_id, agent_type, agent_id } = input;
  const resumeCount = getResumeCount(cwd, session_id, agent_id);
  if (resumeCount > 0)
    return;
  const validRoles = loadValidRoles(cwd);
  if (!validRoles.includes(agent_type))
    return;
  const trackerPath = join(cwd, ".nexus/state", session_id, "agent-tracker.json");
  await updateJsonFileLocked(trackerPath, [], (tracker) => {
    const list = Array.isArray(tracker) ? tracker : [];
    if (list.find((e) => e["agent_id"] === agent_id))
      return list;
    list.push({
      agent_id,
      agent_type,
      started_at: new Date().toISOString(),
      status: "running"
    });
    return list;
  });
  const parts = [];
  const coreIndex = buildCoreIndex(cwd);
  if (coreIndex) {
    parts.push(`<system-notice>
${coreIndex}
</system-notice>`);
  }
  const rulePath = join(cwd, ".nexus/rules", `${agent_type}.md`);
  if (existsSync(rulePath)) {
    const ruleContent = readFileSync(rulePath, "utf-8").trim();
    if (ruleContent) {
      parts.push(`<system-notice>
Custom rule for ${agent_type}:
${ruleContent}
</system-notice>`);
    }
  }
  if (parts.length === 0)
    return;
  return { additional_context: parts.join(`

`) };
};
var handler_default = handler;

// ../../../../../tmp/nexus-hook-entry-agent-bootstrap-1776690665703/agent-bootstrap-entry.ts
import { readFileSync as readFileSync2 } from "node:fs";
globalThis.__NEXUS_INLINE_AGENT_ROLES__ = ["architect", "designer", "engineer", "reviewer", "strategist", "researcher", "postdoc", "lead", "tester", "writer"];
async function main() {
  let raw = "";
  try {
    raw = readFileSync2(0, "utf-8");
  } catch {}
  const input = raw ? JSON.parse(raw) : {};
  const result = await handler_default(input);
  if (result != null && result !== undefined) {
    process.stdout.write(JSON.stringify(result));
  }
}
main().then(() => process.exit(0), (err) => {
  process.stderr.write(String(err?.stack ?? err) + `
`);
  process.exit(1);
});
