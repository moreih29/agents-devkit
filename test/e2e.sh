#!/bin/bash
# Lattice Phase 1 E2E 검증 스크립트
# MCP 도구 + 훅 동작을 자동 테스트

set -e
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
MCP="bridge/mcp-server.cjs"

green() { echo -e "\033[32m✔ $1\033[0m"; }
red() { echo -e "\033[31m✘ $1\033[0m"; }

check() {
  local name="$1" expected="$2" actual="$3"
  # JSON 이스케이프된 문자열도 매칭 (\" → ")
  local unescaped
  unescaped=$(echo "$actual" | sed 's/\\"/"/g; s/\\n/\n/g')
  if echo "$unescaped" | grep -q "$expected"; then
    green "$name"
    PASS=$((PASS + 1))
  else
    red "$name — expected '$expected', got: $actual"
    FAIL=$((FAIL + 1))
  fi
}

# --- MCP 도구 테스트 ---
echo "=== MCP 도구 ==="

# 헬퍼: JSON-RPC 호출 (initialize + call + close)
mcp_call() {
  local method="$1" params="$2"
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}'
  local initialized='{"jsonrpc":"2.0","method":"notifications/initialized"}'
  local call="{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$method\",\"arguments\":$params}}"
  echo -e "$init\n$initialized\n$call" | node "$MCP" 2>/dev/null | tail -1
}

# 1. lat_state_write
result=$(mcp_call "lat_state_write" '{"key":"test-sustain","value":{"active":true,"maxIterations":10,"currentIteration":0},"sessionId":"e2e-test"}')
check "lat_state_write" '"success":true' "$result"

# 2. lat_state_read
result=$(mcp_call "lat_state_read" '{"key":"test-sustain","sessionId":"e2e-test"}')
check "lat_state_read" '"exists":true' "$result"
check "lat_state_read (active)" '"active":true' "$result"

# 3. lat_state_clear
result=$(mcp_call "lat_state_clear" '{"key":"test-sustain","sessionId":"e2e-test"}')
check "lat_state_clear" '"cleared":true' "$result"

# 4. lat_state_read (cleared)
result=$(mcp_call "lat_state_read" '{"key":"test-sustain","sessionId":"e2e-test"}')
check "lat_state_read (cleared)" '"exists":false' "$result"

# 5. lat_knowledge_read (existing file)
result=$(mcp_call "lat_knowledge_read" '{"topic":"architecture"}')
check "lat_knowledge_read" 'Lattice' "$result"

# 6. lat_knowledge_read (list all)
result=$(mcp_call "lat_knowledge_read" '{}')
check "lat_knowledge_read (list)" '"topics"' "$result"

# 7. lat_memo_write
result=$(mcp_call "lat_memo_write" '{"content":"E2E test memo","ttl":"session","tags":["test"]}')
check "lat_memo_write" '"success":true' "$result"

# 8. lat_memo_read
result=$(mcp_call "lat_memo_read" '{"tags":["test"]}')
check "lat_memo_read" 'E2E test memo' "$result"

# 9. lat_context
result=$(mcp_call "lat_context" '{}')
check "lat_context" '"branch"' "$result"
check "lat_context (sessionId)" '"sessionId"' "$result"

# --- 훅 테스트 ---
echo ""
echo "=== 훅 ==="

# Gate: Stop (no sustain) → pass
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (no sustain)" '"continue":true' "$result"

# Gate: Stop (sustain active) → block
mkdir -p .lattice/state/sessions/e2e-hook
echo '{"active":true,"maxIterations":10,"currentIteration":2}' > .lattice/state/sessions/e2e-hook/sustain.json
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .lattice/state/current-session.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (sustain active)" '"decision":"block"' "$result"
check "Gate/Stop (iteration)" 'SUSTAIN 3/10' "$result"

# Gate: UserPromptSubmit (sustain keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","user_prompt":"sustain mode on"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (sustain)" 'sustain mode ACTIVATED' "$result"

# Gate: UserPromptSubmit (parallel keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","user_prompt":"이거 병렬로 처리해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (parallel)" 'parallel mode ACTIVATED' "$result"

# Gate: UserPromptSubmit (pipeline keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","user_prompt":"[pipeline] 자동으로 진행"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (pipeline tag)" 'pipeline mode ACTIVATED' "$result"

# Gate: UserPromptSubmit (no keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","user_prompt":"이 파일 수정해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (no keyword)" '"continue":true' "$result"

# Pulse: PreToolUse
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/PreToolUse (Bash)" 'parallel execution' "$result"

# Tracker: SessionStart
result=$(echo '{"hook_event_name":"SessionStart"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SessionStart" 'LATTICE.*Session' "$result"

# Tracker: SubagentStart
result=$(echo '{"hook_event_name":"SubagentStart","agent_name":"artisan"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SubagentStart" '"continue":true' "$result"

# Cleanup
rm -rf .lattice/state/sessions/e2e-hook .lattice/state/current-session.json .lattice/memo/*e2e* 2>/dev/null

# --- 결과 ---
echo ""
echo "=== 결과: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "All tests passed!" || exit 1
