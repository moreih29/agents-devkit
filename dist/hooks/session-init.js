// assets/hooks/session-init/handler.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

// src/shared/paths.ts
function getParentPid() {
  const testOverride = parseInt(process.env["NEXUS_TEST_PPID"] ?? "");
  return testOverride || process.ppid;
}
var byPpidCache = new Map;

// assets/hooks/session-init/handler.ts
var handler = async (input) => {
  if (input.hook_event_name !== "SessionStart")
    return;
  const safeSid = basename(input.session_id);
  if (!safeSid || safeSid.startsWith(".") || safeSid.includes("/")) {
    process.stderr.write(`[session-init] invalid session_id: ${input.session_id}
`);
    return;
  }
  const sessionDir = join(input.cwd, ".nexus/state", safeSid);
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, "agent-tracker.json"), "[]");
  writeFileSync(join(sessionDir, "tool-log.jsonl"), "");
  const ppid = getParentPid();
  const byPpidDir = join(input.cwd, ".nexus/state/runtime/by-ppid");
  mkdirSync(byPpidDir, { recursive: true });
  writeFileSync(join(byPpidDir, `${ppid}.json`), JSON.stringify({ session_id: input.session_id, updated_at: new Date().toISOString(), cwd: input.cwd }));
};
var handler_default = handler;

// ../../../../../tmp/nexus-hook-entry-session-init-1776690665653/session-init-entry.ts
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
