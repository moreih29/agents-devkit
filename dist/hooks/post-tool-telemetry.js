// src/shared/json-store.js
import { constants as fsConstants, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
var inProcessQueues = new Map;
var APPEND_SIZE_WARN_THRESHOLD = 4 * 1024;
function appendJsonLine(filePath, record) {
  const line = JSON.stringify(record) + `
`;
  if (line.length > APPEND_SIZE_WARN_THRESHOLD) {
    console.error(`[json-store] appendJsonLine line exceeds ${APPEND_SIZE_WARN_THRESHOLD} bytes ` + `(${line.length}) — write may not be atomic on some filesystems. path=${filePath}`);
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  appendFileSync(filePath, line);
}

// assets/hooks/post-tool-telemetry/handler.ts
import { join, resolve, relative } from "node:path";
var EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "ApplyPatch", "NotebookEdit"]);
function isWithinMemory(filePath, projectRoot) {
  const memRoot = resolve(projectRoot, ".nexus/memory");
  const abs = resolve(filePath);
  return abs.startsWith(memRoot + "/") || abs === memRoot;
}
var handler = async (input) => {
  if (input.hook_event_name !== "PostToolUse")
    return;
  const { cwd, session_id, tool_name, agent_id } = input;
  const toolInput = input.tool_input ?? {};
  if (tool_name === "Read") {
    const filePath = toolInput.file_path;
    if (filePath && isWithinMemory(filePath, cwd)) {
      appendJsonLine(join(cwd, ".nexus/memory-access.jsonl"), {
        path: relative(cwd, resolve(filePath)),
        accessed_at: new Date().toISOString(),
        agent: agent_id ?? null
      });
    }
  }
  if (EDIT_TOOLS.has(tool_name) && agent_id) {
    const filePath = toolInput.file_path ?? toolInput.notebook_path;
    if (filePath) {
      appendJsonLine(join(cwd, ".nexus/state", session_id, "tool-log.jsonl"), {
        ts: new Date().toISOString(),
        agent_id,
        tool: tool_name,
        file: relative(cwd, resolve(filePath)),
        status: "ok"
      });
    }
  }
};
var handler_default = handler;

// ../../../../../tmp/nexus-hook-entry-post-tool-telemetry-1776690665643/post-tool-telemetry-entry.ts
import { readFileSync } from "node:fs";
async function main() {
  let raw = "";
  try {
    raw = readFileSync(0, "utf-8");
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
