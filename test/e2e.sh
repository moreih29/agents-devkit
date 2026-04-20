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
echo "=== Hook invocation side-effect ==="
# nexus-core #39/#46 regression class 차단 — 번들이 존재만 하는 게 아니라 handler가 실제 호출되는지 검증

HOOK_TMP=$(mktemp -d -t nexus-hook-e2e.XXXXXX)
trap 'rm -rf "$HOOK_TMP"' EXIT

# session-init: .nexus/state/<sid>/agent-tracker.json 생성 side-effect
SI_DIR="$HOOK_TMP/si"
mkdir -p "$SI_DIR"
SI_OUT=$(echo '{"hook_event_name":"SessionStart","session_id":"e2e-si","cwd":"'$SI_DIR'"}' \
  | node dist/hooks/session-init.js 2>&1; echo "exit=$?")
if echo "$SI_OUT" | grep -q '^exit=0$' && [ -f "$SI_DIR/.nexus/state/e2e-si/agent-tracker.json" ]; then
  green "session-init.js → .nexus/state/<sid>/ 생성"
else
  red "session-init.js handler no-op (output: $SI_OUT)"
fi

# prompt-router: [run] 태그 → stdout에 <system-notice> 포함
PR_DIR="$HOOK_TMP/pr"
mkdir -p "$PR_DIR"
PR_OUT=$(echo '{"hook_event_name":"UserPromptSubmit","session_id":"e2e-pr","cwd":"'$PR_DIR'","prompt":"[run] smoke"}' \
  | node dist/hooks/prompt-router.js 2>/dev/null || true)
if echo "$PR_OUT" | grep -q '<system-notice>'; then
  green "prompt-router.js → [run] tag dispatch (<system-notice> emit)"
else
  red "prompt-router.js tag dispatch 실패 (output: $PR_OUT)"
fi

# agent-bootstrap + agent-finalize: handler invocation만 검증 (exit 0)
AB_DIR="$HOOK_TMP/ab"
mkdir -p "$AB_DIR/.nexus/state/e2e-ab"
if echo '{"hook_event_name":"SubagentStart","session_id":"e2e-ab","cwd":"'$AB_DIR'","subagent_type":"engineer","transcript_path":"/dev/null"}' \
    | node dist/hooks/agent-bootstrap.js >/dev/null 2>&1; then
  green "agent-bootstrap.js handler invoke exit 0"
else
  red "agent-bootstrap.js handler invoke 실패"
fi

AF_DIR="$HOOK_TMP/af"
mkdir -p "$AF_DIR/.nexus/state/e2e-af"
echo '[]' > "$AF_DIR/.nexus/state/e2e-af/agent-tracker.json"
if echo '{"hook_event_name":"SubagentStop","session_id":"e2e-af","cwd":"'$AF_DIR'","subagent_type":"engineer","transcript_path":"/dev/null","stop_hook_active":false}' \
    | node dist/hooks/agent-finalize.js >/dev/null 2>&1; then
  green "agent-finalize.js handler invoke exit 0"
else
  red "agent-finalize.js handler invoke 실패"
fi

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
