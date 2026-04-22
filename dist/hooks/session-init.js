// src/hooks/session-init.ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

// src/hooks/session-init.ts
var GITIGNORE = `# Nexus: whitelist tracked files, ignore everything else
*
!.gitignore
!context/
!context/**
!memory/
!memory/**
!history.json
`;
async function main() {
  const payload = await readStdin();
  const cwd = typeof payload.cwd === "string" ? payload.cwd : process.cwd();
  const root = join(cwd, ".nexus");
  mkdirSync(join(root, "context"), { recursive: true });
  mkdirSync(join(root, "memory"), { recursive: true });
  const ignorePath = join(root, ".gitignore");
  if (!existsSync(ignorePath)) {
    writeFileSync(ignorePath, GITIGNORE, "utf8");
  }
}
main().catch((err) => {
  console.error(`[session-init] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(0);
});
