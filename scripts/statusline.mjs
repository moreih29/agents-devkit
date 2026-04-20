#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

function getBranch() {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function readStdinJSON() {
  try {
    const raw = readFileSync(0, "utf-8");
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function readJSON(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function getTaskStats(stateDir) {
  const tasksPath = join(stateDir, "tasks.json");
  if (!existsSync(tasksPath)) return null;
  const data = readJSON(tasksPath);
  if (!data) return null;

  const items = Array.isArray(data) ? data : Array.isArray(data.tasks) ? data.tasks : null;
  if (!items) return null;

  const total = items.length;
  const pending = items.filter(
    (t) => t.status === "pending" || t.status === "in_progress"
  ).length;
  const completed = items.filter((t) => t.status === "completed").length;
  return { total, pending, completed };
}

function getPlanStats(stateDir) {
  const planPath = join(stateDir, "plan.json");
  if (!existsSync(planPath)) return null;
  const data = readJSON(planPath);
  if (!data) return null;

  const issues = Array.isArray(data.issues) ? data.issues : [];
  const pending = issues.filter(
    (i) => i.status !== "decided" && i.status !== "closed"
  ).length;
  const decided = issues.filter((i) => i.status === "decided").length;
  return { total: issues.length, pending, decided };
}

function getState(sessionId, cwd) {
  const candidates = [];

  if (sessionId) {
    candidates.push(join(cwd, ".nexus", "state", sessionId));
  }
  candidates.push(join(cwd, ".nexus", "state"));

  for (const dir of candidates) {
    const tasks = getTaskStats(dir);
    const plan = getPlanStats(dir);
    if (tasks || plan) return { tasks, plan };
  }
  return { tasks: null, plan: null };
}

function formatLine({ branch, tasks, plan, context }) {
  const parts = [];

  if (branch) parts.push(`[${branch}]`);

  if (tasks && tasks.total > 0) {
    parts.push(`tasks ${tasks.completed}/${tasks.total}`);
  }

  if (plan && plan.total > 0) {
    const label = plan.pending > 0 ? `plan ${plan.decided}/${plan.total}` : `plan done`;
    parts.push(label);
  }

  if (context != null) {
    parts.push(`ctx ${context}%`);
  }

  return parts.join("  ") || "nexus";
}

function main() {
  const input = readStdinJSON();
  const cwd = input.cwd || input.workspace?.current_dir || process.cwd();
  const sessionId = input.session_id || process.env.CLAUDE_SESSION_ID || null;
  const context =
    input.context_window?.used_percentage != null
      ? Math.floor(input.context_window.used_percentage)
      : null;

  const branch = getBranch();
  const { tasks, plan } = getState(sessionId, cwd);

  const line = formatLine({ branch, tasks, plan, context });
  process.stdout.write(line + "\n");
}

try {
  main();
} catch {
  process.stdout.write("nexus\n");
}
