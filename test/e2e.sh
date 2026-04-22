#!/usr/bin/env bash
# E2E smoke test for the claude-nexus plugin.
# Asserts the built plugin exposes the expected shape and components work in isolation.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail=0
pass() { echo "  ok — $1"; }
fail() { echo "  FAIL — $1" >&2; fail=1; }

echo "[1/5] plugin shape"
for f in \
  .claude-plugin/plugin.json \
  .claude-plugin/marketplace.json \
  hooks/hooks.json \
  settings.json \
  dist/mcp/server.js \
  dist/hooks/session-init.js \
  dist/hooks/prompt-router.js ; do
  [ -f "$f" ] && pass "$f" || fail "$f missing"
done

node -e "const p=require('./.claude-plugin/plugin.json');if(!p.mcpServers||!p.mcpServers['nexus-core'])process.exit(1)" \
  && pass ".claude-plugin/plugin.json declares mcpServers.nexus-core" \
  || fail ".claude-plugin/plugin.json missing mcpServers.nexus-core"

for dir_name in architect designer engineer lead postdoc researcher reviewer strategist tester writer ; do
  [ -f "agents/${dir_name}.md" ] && pass "agents/${dir_name}.md" || fail "agents/${dir_name}.md missing"
done

for skill in nx-auto-plan nx-plan nx-run ; do
  [ -f "skills/${skill}/SKILL.md" ] && pass "skills/${skill}/SKILL.md" || fail "skills/${skill}/SKILL.md missing"
done

[ -f "scripts/statusline.mjs" ] && pass "scripts/statusline.mjs" || fail "scripts/statusline.mjs missing"

head -1 scripts/statusline.mjs | grep -q '^#!' && pass "statusline.mjs has shebang" || fail "statusline.mjs missing shebang"
[ -x "scripts/statusline.mjs" ] && pass "statusline.mjs executable" || fail "statusline.mjs not executable"
node -p "require('./package.json').bin['claude-nexus']" | grep -q "statusline.mjs" && pass "package.json exposes claude-nexus bin" || fail "bin missing in package.json"

echo
echo "[2/5] MCP server initialize"
mcp_stdin=$(printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"e2e","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}')

mcp_out=$(
  { echo "$mcp_stdin"; sleep 1; } | node dist/mcp/server.js 2>/dev/null || true
)

echo "$mcp_out" | grep -q '"nx_plan_start"' && pass "MCP exposes nx_plan_start" || fail "MCP did not expose nx_plan_start"
echo "$mcp_out" | grep -q '"nx_task_add"' && pass "MCP exposes nx_task_add" || fail "MCP did not expose nx_task_add"

echo
echo "[3/5] session-init hook"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "{\"hook_event_name\":\"SessionStart\",\"cwd\":\"$tmp\"}" | node dist/hooks/session-init.js
[ -d "$tmp/.nexus/context" ] && pass ".nexus/context created" || fail ".nexus/context not created"
[ -d "$tmp/.nexus/memory" ] && pass ".nexus/memory created" || fail ".nexus/memory not created"
[ -f "$tmp/.nexus/.gitignore" ] && pass ".nexus/.gitignore created" || fail ".nexus/.gitignore not created"

echo
echo "[4/5] prompt-router hook"
out=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[plan] decompose the auth refactor"}' | node dist/hooks/prompt-router.js)
echo "$out" | grep -q 'nx-plan skill' && pass "[plan] → nx-plan directive" || fail "[plan] routing broken: $out"

out=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[auto-plan] quick task"}' | node dist/hooks/prompt-router.js)
echo "$out" | grep -q 'nx-auto-plan' && pass "[auto-plan] → nx-auto-plan directive" || fail "[auto-plan] routing broken: $out"

out=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"no tag at all"}' | node dist/hooks/prompt-router.js)
[ -z "$out" ] && pass "no tag → silent" || fail "non-tag prompt emitted output: $out"

echo
echo "[5/5] statusline"
out=$(echo '{"cwd":"'"$ROOT"'","display_name":"Opus 4.7","context_window":{"used_percentage":37}}' | CLAUDE_PLUGIN_ROOT="$ROOT" node scripts/statusline.mjs)
echo "$out" | grep -q '◆Nexus' && pass "statusline emits ◆Nexus tag" || fail "statusline missing ◆Nexus: $out"
echo "$out" | grep -q 'ctx' && pass "statusline includes ctx" || fail "statusline missing ctx: $out"

echo
if [ "$fail" -eq 0 ]; then
  echo "e2e: all checks passed"
else
  echo "e2e: FAILED" >&2
  exit 1
fi
