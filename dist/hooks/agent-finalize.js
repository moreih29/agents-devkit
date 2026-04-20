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

// assets/hooks/agent-finalize/handler.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
var handler = async (input) => {
  if (input.hook_event_name !== "SubagentStop")
    return;
  const { cwd, session_id, agent_type, agent_id } = input;
  const lastMessage = (input.last_assistant_message ?? "").slice(0, 500);
  const sessionDir = join(cwd, ".nexus/state", session_id);
  const trackerPath = join(sessionDir, "agent-tracker.json");
  const toolLogPath = join(sessionDir, "tool-log.jsonl");
  const tasksPath = join(sessionDir, "tasks.json");
  await updateJsonFileLocked(trackerPath, [], (tracker) => {
    const entry = tracker.find((e) => e["agent_id"] === agent_id);
    if (!entry)
      return tracker;
    entry["status"] = "completed";
    entry["stopped_at"] = new Date().toISOString();
    entry["last_message"] = lastMessage;
    if (existsSync(toolLogPath)) {
      const files = new Set;
      const raw = readFileSync(toolLogPath, "utf-8");
      for (const line of raw.split(`
`)) {
        if (!line.trim())
          continue;
        try {
          const log = JSON.parse(line);
          if (log["agent_id"] === agent_id && typeof log["file"] === "string") {
            files.add(log["file"]);
          }
        } catch {}
      }
      entry["files_touched"] = [...files];
    }
    return tracker;
  });
  if (!existsSync(tasksPath))
    return;
  try {
    const tasksData = JSON.parse(readFileSync(tasksPath, "utf-8"));
    const tasks = Array.isArray(tasksData?.["tasks"]) ? tasksData["tasks"] : [];
    const incomplete = tasks.filter((t) => t["owner"]?.["role"] === agent_type && t["status"] !== "completed");
    if (incomplete.length === 0)
      return;
    const ids = incomplete.map((t) => t["id"]).join(", ");
    return {
      additional_context: `<system-notice>
Subagent "${agent_type}" finished. Tasks still pending with this role: ${ids}. Review status and coordinate remaining subagent delegation.
</system-notice>`
    };
  } catch {
    return;
  }
};
var handler_default = handler;

// ../../../../../tmp/nexus-hook-entry-agent-finalize-1776690665695/agent-finalize-entry.ts
import { readFileSync as readFileSync2 } from "node:fs";
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
