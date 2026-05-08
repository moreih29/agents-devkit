import { readStdin } from "./_stdin.ts";

const DIRECTIVES: Record<string, string> = {
  "plan": "Activate the `claude-nexus:nx-plan` skill for structured multi-perspective planning. Pass the fully qualified name to the Skill tool — `nx-plan` alone will fail.",
  "auto-plan": "Activate the `claude-nexus:nx-auto-plan` skill to auto-decompose the request into a plan. Pass the fully qualified name to the Skill tool — `nx-auto-plan` alone will fail.",
  "run": "Activate the `claude-nexus:nx-run` skill to execute the current plan's tasks. Pass the fully qualified name to the Skill tool — `nx-run` alone will fail.",
  "m": "Store the following body as a lesson in .nexus/memory/.",
  "m:gc": "Garbage-collect .nexus/memory/ by merging or removing stale entries.",
  "d": "Record a decision for the active plan session's current issue via nx_plan_decide.",
};

const TAG_PATTERN = /^\s*\[([a-z:-]+)\]/;

function parseTag(prompt: string): string | null {
  const match = TAG_PATTERN.exec(prompt);
  if (!match) return null;
  const tag = match[1];
  return tag in DIRECTIVES ? tag : null;
}

async function main(): Promise<void> {
  const payload = await readStdin();
  const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
  const tag = parseTag(prompt);
  if (!tag) return;

  const output = {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: DIRECTIVES[tag],
    },
  };
  process.stdout.write(JSON.stringify(output));
}

main().catch((err: unknown) => {
  console.error(`[prompt-router] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(0);
});
