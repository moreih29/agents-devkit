#!/bin/bash
# claude-nexus smoke test — nexus-core 래퍼 정체성 기반 (v0.28.0+)
# 검증 범위: sync 산출물 존재, .mcp.json 경로 유효, statusline.mjs 실행 가능, plugin manifest 유효

set -e
cd "$(dirname "$0")/.."

PASS=0
FAIL=0

green() { echo -e "\033[32m✔ $1\033[0m"; PASS=$((PASS + 1)); }
red() { echo -e "\033[31m✘ $1\033[0m"; FAIL=$((FAIL + 1)); }

echo "=== Managed 산출물 존재 ==="

# agents: 10개 (lead 포함)
for agent in architect designer engineer lead postdoc researcher reviewer strategist tester writer; do
  f="agents/$agent.md"
  if [ -f "$f" ] && head -1 "$f" | grep -q '^---$'; then
    green "agents/$agent.md"
  else
    red "agents/$agent.md 부재 또는 frontmatter 누락"
  fi
done

# skills: 4개 upstream + 1 consumer-owned(nx-setup)
for skill in nx-init nx-plan nx-run nx-setup nx-sync; do
  f="skills/$skill/SKILL.md"
  if [ -f "$f" ] && head -1 "$f" | grep -q '^---$'; then
    green "skills/$skill/SKILL.md"
  else
    red "skills/$skill/SKILL.md 부재 또는 frontmatter 누락"
  fi
done

# hooks.json + dist/hooks 컴파일 결과
[ -f hooks/hooks.json ] && green "hooks/hooks.json" || red "hooks/hooks.json 부재"
for handler in session-init agent-bootstrap agent-finalize prompt-router; do
  f="dist/hooks/$handler.js"
  [ -f "$f" ] && green "dist/hooks/$handler.js" || red "dist/hooks/$handler.js 부재"
done

# settings.json (primary agent fragment)
if [ -f settings.json ] && grep -q '"agent"' settings.json; then
  green "settings.json primary agent 필드 존재"
else
  red "settings.json 부재 또는 agent 필드 누락"
fi

# claude-only statusline
[ -f scripts/statusline.mjs ] && green "scripts/statusline.mjs" || red "scripts/statusline.mjs 부재"

echo ""
echo "=== .mcp.json 경로 유효성 ==="

MCP_PATH=$(node -e "const c=require('./.mcp.json'); const p=c.mcpServers.nx.args[0]; console.log(p.replace('\${CLAUDE_PLUGIN_ROOT}', '.'))")
if [ -f "$MCP_PATH" ]; then
  green ".mcp.json args 경로 실존: $MCP_PATH"
else
  red ".mcp.json args 경로 부재: $MCP_PATH"
fi

echo ""
echo "=== statusline.mjs 실행 ==="

statusline_out=$(echo '{"session_id":"test","cwd":"'$(pwd)'"}' | node scripts/statusline.mjs 2>&1 || true)
if [ -n "$statusline_out" ]; then
  green "statusline.mjs 1행 출력: $statusline_out"
else
  red "statusline.mjs 출력 없음"
fi

echo ""
echo "=== Plugin manifest 유효성 ==="

# plugin.json JSON 유효 + version 필드 존재
if node -e "const p=require('./.claude-plugin/plugin.json'); if(!p.name||!p.version)process.exit(1)"; then
  green ".claude-plugin/plugin.json 유효 (name+version)"
else
  red ".claude-plugin/plugin.json 무효"
fi

# marketplace.json JSON 유효 + plugins 배열
if node -e "const m=require('./.claude-plugin/marketplace.json'); if(!Array.isArray(m.plugins))process.exit(1)"; then
  green ".claude-plugin/marketplace.json 유효 (plugins 배열)"
else
  red ".claude-plugin/marketplace.json 무효"
fi

echo ""
echo "=== nexus-core validate ==="

if bun run validate 2>&1 | grep -q "no errors"; then
  green "nexus-core validate 통과"
else
  red "nexus-core validate 실패"
fi

echo ""
echo "=== 결과: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "All smoke tests passed!" || exit 1
