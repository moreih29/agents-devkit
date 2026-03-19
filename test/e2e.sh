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

# 훅 테스트용 클린 세션 설정 (활성 cruise/sustain 등의 간섭 방지)
mkdir -p .lattice/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .lattice/state/current-session.json

# Gate: Stop (no sustain) → pass
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (no sustain)" '"continue":true' "$result"

# Gate: Stop (sustain active) → block
echo '{"active":true,"maxIterations":10,"currentIteration":2}' > .lattice/state/sessions/e2e-hook/sustain.json
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .lattice/state/current-session.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (sustain active)" '"decision":"block"' "$result"
check "Gate/Stop (iteration)" 'SUSTAIN 3/10' "$result"

# Gate: UserPromptSubmit (sustain keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"sustain mode on"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (sustain)" 'sustain mode ACTIVATED' "$result"

# Gate: UserPromptSubmit (parallel keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"이거 병렬로 처리해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (parallel)" 'parallel mode ACTIVATED' "$result"

# Gate: UserPromptSubmit (pipeline keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[pipeline] 자동으로 진행"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (pipeline tag)" 'pipeline mode ACTIVATED' "$result"

# Gate: UserPromptSubmit (no keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"이 파일 수정해줘"}' | node scripts/gate.cjs 2>/dev/null)
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

# --- Phase 2: Parallel/Pipeline 훅 테스트 ---
echo ""
echo "=== Phase 2 훅 ==="

# Phase 2 테스트 환경 초기화
# Tracker/SessionStart가 createSession()으로 current-session.json을 덮어쓰므로 복원 필요
rm -rf .lattice/state/sessions/e2e-hook
mkdir -p .lattice/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .lattice/state/current-session.json

# Gate: Stop (parallel active, tasks incomplete) → block
echo '{"active":true,"maxIterations":100,"currentIteration":0,"tasks":[{"id":"t1","status":"running"},{"id":"t2","status":"pending"}],"completedCount":0,"totalCount":2}' > .lattice/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (parallel active)" '"decision":"block"' "$result"
check "Gate/Stop (parallel progress)" 'PARALLEL 0/2' "$result"

# Gate: Stop (parallel total=0, tasks not configured) → pass (no block)
echo '{"active":true,"maxIterations":100,"currentIteration":0,"completedCount":0,"totalCount":0}' > .lattice/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (parallel no tasks)" '"continue":true' "$result"

# Gate: Stop (parallel all done) → pass
echo '{"active":true,"maxIterations":100,"currentIteration":0,"tasks":[{"id":"t1","status":"done"},{"id":"t2","status":"done"}],"completedCount":2,"totalCount":2}' > .lattice/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (parallel all done)" '"continue":true' "$result"
rm -f .lattice/state/sessions/e2e-hook/parallel.json

# Gate: Stop (pipeline active with stages) → block with stage info
echo '{"active":true,"maxIterations":100,"currentIteration":0,"stages":[{"name":"analyze","status":"done"},{"name":"implement","status":"running"},{"name":"verify","status":"pending"}],"currentStage":"implement","currentStageIndex":1,"totalStages":3}' > .lattice/state/sessions/e2e-hook/pipeline.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (pipeline active)" '"decision":"block"' "$result"
check "Gate/Stop (pipeline stage info)" 'implement (2/3)' "$result"
rm -f .lattice/state/sessions/e2e-hook/pipeline.json

# Gate: UserPromptSubmit (cruise keyword) → pipeline + sustain 동시 활성화
rm -f .lattice/state/sessions/e2e-hook/pipeline.json .lattice/state/sessions/e2e-hook/sustain.json
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"cruise으로 진행해"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (cruise)" 'cruise mode ACTIVATED' "$result"
# pipeline.json + sustain.json 둘 다 생성됐는지 확인
[ -f .lattice/state/sessions/e2e-hook/pipeline.json ] && [ -f .lattice/state/sessions/e2e-hook/sustain.json ] && green "Gate/cruise (dual state)" && PASS=$((PASS + 1)) || (red "Gate/cruise (dual state)" && FAIL=$((FAIL + 1)))
rm -f .lattice/state/sessions/e2e-hook/pipeline.json .lattice/state/sessions/e2e-hook/sustain.json .lattice/state/sessions/e2e-hook/parallel.json

# MCP: lat_state_clear("cruise") → pipeline + sustain 동시 해제
# cruise 테스트용 상태 파일 생성
mcp_call "lat_state_write" '{"key":"pipeline","value":{"active":true},"sessionId":"e2e-cruise"}' > /dev/null
mcp_call "lat_state_write" '{"key":"sustain","value":{"active":true},"sessionId":"e2e-cruise"}' > /dev/null
result=$(mcp_call "lat_state_clear" '{"key":"cruise","sessionId":"e2e-cruise"}')
check "MCP lat_state_clear (cruise)" '"cleared":true' "$result"
check "MCP lat_state_clear (cruise keys)" '"clearedKeys"' "$result"

# Pulse: whisper tracker 초기화 (Phase 1 테스트에서 Read 카운트 누적됨)
rm -f .lattice/state/sessions/e2e-hook/whisper-tracker.json

# Pulse: PreToolUse with pipeline active → pipeline context
echo '{"active":true,"currentStage":"verify","currentStageIndex":2,"totalStages":3}' > .lattice/state/sessions/e2e-hook/pipeline.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Read"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/PreToolUse (pipeline)" 'PIPELINE stage: verify' "$result"
rm -f .lattice/state/sessions/e2e-hook/pipeline.json

# Pulse: PreToolUse with parallel active → parallel context
echo '{"active":true,"completedCount":1,"totalCount":3}' > .lattice/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Read"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/PreToolUse (parallel)" 'PARALLEL 1/3 done' "$result"
rm -f .lattice/state/sessions/e2e-hook/parallel.json

# --- Pulse 컨텍스트 수준 테스트 ---
echo ""
echo "=== Pulse 컨텍스트 수준 ==="

rm -f .lattice/state/sessions/e2e-hook/whisper-tracker.json

# Pulse: minimal agent (scout) → guidance 메시지 생략
echo '{"active":["scout"],"history":[]}' > .lattice/state/sessions/e2e-hook/agents.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/minimal (no guidance)" '"continue":true' "$result"
# minimal에서는 guidance 메시지(parallel execution)가 없어야 함
if echo "$result" | grep -q 'parallel execution'; then
  red "Pulse/minimal (guidance leaked)" && FAIL=$((FAIL + 1))
else
  green "Pulse/minimal (guidance filtered)" && PASS=$((PASS + 1))
fi

rm -f .lattice/state/sessions/e2e-hook/whisper-tracker.json

# Pulse: standard agent (artisan) → guidance 메시지 포함
echo '{"active":["artisan"],"history":[]}' > .lattice/state/sessions/e2e-hook/agents.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/standard (has guidance)" 'parallel execution' "$result"

rm -f .lattice/state/sessions/e2e-hook/agents.json .lattice/state/sessions/e2e-hook/whisper-tracker.json

# --- Code Intelligence 테스트 ---
echo ""
echo "=== Code Intelligence ==="

# LSP 테스트는 pipe 기반 E2E와 비호환 (long-lived 서버 필요)
# → Claude Code 내에서 MCP 직접 호출로 수동 검증
echo "  (LSP: pipe E2E 비호환, MCP 직접 호출로 검증)"

# AST: search (@ast-grep/napi가 있을 때만)
result=$(mcp_call "lat_ast_search" '{"pattern":"function $NAME($$$) { $$$BODY }","language":"typescript","path":"src/shared"}')
if echo "$result" | grep -q '"error".*not installed'; then
  echo "  (ast-grep not installed, skipping)"
else
  check "AST/search" 'matches' "$result"
fi

# Cleanup
rm -rf .lattice/state/sessions/e2e-hook .lattice/state/current-session.json .lattice/memo/*e2e* 2>/dev/null

# --- 결과 ---
echo ""
echo "=== 결과: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "All tests passed!" || exit 1
