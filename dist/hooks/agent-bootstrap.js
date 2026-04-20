// assets/hooks/agent-bootstrap/handler.ts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
var CORE_INDEX_SIZE_LIMIT = 2 * 1024;
function loadValidRoles(cwd) {
  const agentsDir = join(cwd, "assets/agents");
  const roles = [];
  if (existsSync(agentsDir)) {
    for (const entry of readdirSync(agentsDir, { withFileTypes: true })) {
      if (entry.isDirectory())
        roles.push(entry.name);
    }
  }
  return roles;
}
function readFirstLine(path) {
  try {
    const content = readFileSync(path, "utf-8");
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

// ../../../../../tmp/nexus-hook-entry-agent-bootstrap-1776672660252/agent-bootstrap-entry.ts
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
