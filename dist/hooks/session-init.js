// assets/hooks/session-init/handler.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
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
};
var handler_default = handler;
export {
  handler_default as default
};
