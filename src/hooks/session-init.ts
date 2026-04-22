import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readStdin } from "./_stdin.ts";

const GITIGNORE = `# Nexus: whitelist tracked files, ignore everything else
*
!.gitignore
!context/
!context/**
!memory/
!memory/**
!history.json
`;

async function main(): Promise<void> {
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

main().catch((err: unknown) => {
  console.error(`[session-init] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(0);
});
