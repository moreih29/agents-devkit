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

# --- 태스크 관리 테스트 ---
echo ""
echo "=== 태스크 관리 ==="

# lat_task_create
result=$(mcp_call "lat_task_create" '{"title":"E2E test task","description":"Testing task CRUD","tags":["test","e2e"]}')
check "lat_task_create" '"success":true' "$result"
TASK_ID=$(echo "$result" | sed 's/\\"/"/g' | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')

# lat_task_list
result=$(mcp_call "lat_task_list" '{"status":"todo"}')
check "lat_task_list (todo)" 'E2E test task' "$result"

# lat_task_list (by tags)
result=$(mcp_call "lat_task_list" '{"tags":["e2e"]}')
check "lat_task_list (tags)" 'E2E test task' "$result"

# lat_task_update
result=$(mcp_call "lat_task_update" "{\"id\":\"$TASK_ID\",\"status\":\"in_progress\"}")
check "lat_task_update" '"success":true' "$result"

# lat_task_summary
result=$(mcp_call "lat_task_summary" '{}')
check "lat_task_summary" '"in_progress":' "$result"

# lat_task_update (done)
result=$(mcp_call "lat_task_update" "{\"id\":\"$TASK_ID\",\"status\":\"done\"}")
check "lat_task_update (done)" '"completedAt"' "$result"

# Cleanup task files
rm -rf .lattice/tasks/*e2e* 2>/dev/null
# Find and remove the test task by ID
[ -n "$TASK_ID" ] && rm -f ".lattice/tasks/${TASK_ID}.json" 2>/dev/null

# --- 세션 상태 정리 테스트 ---
echo ""
echo "=== 세션 상태 정리 ==="

# Setup: 이전 세션에 잔존 상태 생성
mkdir -p .lattice/state/sessions/e2e-prev
echo '{"active":true,"maxIterations":100,"currentIteration":5}' > .lattice/state/sessions/e2e-prev/sustain.json
echo '{"active":true,"stages":[]}' > .lattice/state/sessions/e2e-prev/pipeline.json
echo '{"sessionId":"e2e-prev","createdAt":"2026-01-01T00:00:00Z"}' > .lattice/state/current-session.json

# SessionStart should cleanup previous session state
result=$(echo '{"hook_event_name":"SessionStart"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SessionStart (cleanup)" 'LATTICE.*Session' "$result"

# Verify previous session state files are cleaned up
if [ -f .lattice/state/sessions/e2e-prev/sustain.json ] || [ -f .lattice/state/sessions/e2e-prev/pipeline.json ]; then
  red "SessionStart (prev state not cleaned)" && FAIL=$((FAIL + 1))
else
  green "SessionStart (prev state cleaned)" && PASS=$((PASS + 1))
fi

# SessionEnd should cleanup current session state
# First setup a session with active state
NEW_SID=$(cat .lattice/state/current-session.json | grep -o '"sessionId":"[^"]*"' | sed 's/"sessionId":"//;s/"//')
mkdir -p ".lattice/state/sessions/${NEW_SID}"
echo '{"active":true,"maxIterations":100,"currentIteration":0}' > ".lattice/state/sessions/${NEW_SID}/sustain.json"
result=$(echo '{"hook_event_name":"SessionEnd"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SessionEnd (cleanup)" '"continue":true' "$result"

if [ -f ".lattice/state/sessions/${NEW_SID}/sustain.json" ]; then
  red "SessionEnd (state not cleaned)" && FAIL=$((FAIL + 1))
else
  green "SessionEnd (state cleaned)" && PASS=$((PASS + 1))
fi

# --- Gate consult 테스트 ---
echo ""
echo "=== Consult ==="

# 훅 테스트 환경 복원
rm -rf .lattice/state/sessions/e2e-hook
mkdir -p .lattice/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .lattice/state/current-session.json

# Gate: UserPromptSubmit (consult keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[consult] 어떤 구조가 좋을까"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (consult tag)" 'Consult mode' "$result"

# Gate: UserPromptSubmit (consult natural language)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"어떻게 하면 좋을까"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (consult natural)" 'Consult mode' "$result"

# Consult should NOT create state files (unlike sustain)
if [ -f .lattice/state/sessions/e2e-hook/consult.json ]; then
  red "Consult (no state file expected)" && FAIL=$((FAIL + 1))
else
  green "Consult (no state file)" && PASS=$((PASS + 1))
fi

# --- Code Intelligence 테스트 ---
echo ""
echo "=== Code Intelligence ==="

# LSP 테스트 (typescript-language-server 초기화에 시간 소요, 전체 E2E 시간 증가)
if command -v npx &>/dev/null; then
  result=$(mcp_call "lat_lsp_hover" '{"file":"src/shared/session.ts","line":9,"character":17}')
  check "LSP/hover" 'hover' "$result"

  result=$(mcp_call "lat_lsp_goto_definition" '{"file":"src/hooks/gate.ts","line":4,"character":40}')
  check "LSP/goto_definition" 'definitions' "$result"

  result=$(mcp_call "lat_lsp_find_references" '{"file":"src/shared/session.ts","line":9,"character":17}')
  check "LSP/find_references" 'references' "$result"
else
  echo "  (LSP tests skipped: npx not available)"
fi

# AST: search (@ast-grep/napi가 있을 때만)
result=$(mcp_call "lat_ast_search" '{"pattern":"function $NAME($$$) { $$$BODY }","language":"typescript","path":"src/shared"}')
if echo "$result" | sed 's/\\"/"/g' | grep -q '"error".*not installed'; then
  echo "  (ast-grep not installed, skipping all AST tests)"
else
  check "AST/search (TypeScript)" 'matches' "$result"

  # AST: 다언어 — Python
  result=$(mcp_call "lat_ast_search" '{"pattern":"def $NAME($$$):","language":"python","path":"test/fixtures/python"}')
  check "AST/search (Python)" 'matches' "$result"

  # AST: 다언어 — Rust
  result=$(mcp_call "lat_ast_search" '{"pattern":"fn $NAME($$$) -> $RET { $$$BODY }","language":"rust","path":"test/fixtures/rust"}')
  check "AST/search (Rust)" 'matches' "$result"

  # AST: 다언어 — Go
  result=$(mcp_call "lat_ast_search" '{"pattern":"func $NAME($$$) $RET { $$$BODY }","language":"go","path":"test/fixtures/go"}')
  check "AST/search (Go)" 'matches' "$result"

  # AST: replace (dry run)
  result=$(mcp_call "lat_ast_replace" '{"pattern":"def greet($$$):","replacement":"def hello($$$):","language":"python","path":"test/fixtures/python","dryRun":true}')
  check "AST/replace (dryRun)" 'changes' "$result"
fi

# Cleanup
rm -rf .lattice/state/sessions/e2e-hook .lattice/state/current-session.json .lattice/memo/*e2e* 2>/dev/null

# --- 결과 ---
echo ""
echo "=== 결과: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "All tests passed!" || exit 1
