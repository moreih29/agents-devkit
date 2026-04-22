// src/hooks/_stdin.ts
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw)
    return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

// src/hooks/prompt-router.ts
var DIRECTIVES = {
  plan: "Activate the nx-plan skill for structured multi-perspective planning.",
  "auto-plan": "Activate the nx-auto-plan skill to auto-decompose the request into a plan.",
  run: "Activate the nx-run skill to execute the current plan's tasks.",
  m: "Store the following body as a lesson in .nexus/memory/.",
  "m:gc": "Garbage-collect .nexus/memory/ by merging or removing stale entries.",
  d: "Record a decision for the active plan session's current issue via nx_plan_decide."
};
var TAG_PATTERN = /^\s*\[([a-z:-]+)\]/;
function parseTag(prompt) {
  const match = TAG_PATTERN.exec(prompt);
  if (!match)
    return null;
  const tag = match[1];
  return tag in DIRECTIVES ? tag : null;
}
async function main() {
  const payload = await readStdin();
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const tag = parseTag(prompt);
  if (!tag)
    return;
  const output = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: DIRECTIVES[tag]
    }
  };
  process.stdout.write(JSON.stringify(output));
}
main().catch((err) => {
  console.error(`[prompt-router] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(0);
});
