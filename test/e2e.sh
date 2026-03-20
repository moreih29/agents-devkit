#!/bin/bash
# Nexus E2E 검증 스크립트
# MCP 도구 + 훅 + Code Intelligence 자동 테스트
# Code Intelligence(LSP/AST)는 백그라운드에서 병렬 실행하여 속도 최적화

set -e
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
MCP="bridge/mcp-server.cjs"

# 현재 세션 백업 (테스트 후 복원)
ORIG_SESSION=""
if [ -f .nexus/state/current-session.json ]; then
  ORIG_SESSION=$(cat .nexus/state/current-session.json)
fi

green() { echo -e "\033[32m✔ $1\033[0m"; }
red() { echo -e "\033[31m✘ $1\033[0m"; }

check() {
  local name="$1" expected="$2" actual="$3"
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

mcp_call() {
  local method="$1" params="$2"
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}'
  local initialized='{"jsonrpc":"2.0","method":"notifications/initialized"}'
  local call="{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$method\",\"arguments\":$params}}"
  echo -e "$init\n$initialized\n$call" | node "$MCP" 2>/dev/null | tail -1
}

# ============================================================================
# Group A: Code Intelligence (백그라운드 — LSP 초기화가 가장 느림)
# ============================================================================
CI_RESULT=$(mktemp)
(
  CI_PASS=0
  CI_FAIL=0

  ci_check() {
    local name="$1" expected="$2" actual="$3"
    local unescaped
    unescaped=$(echo "$actual" | sed 's/\\"/"/g; s/\\n/\n/g')
    if echo "$unescaped" | grep -q "$expected"; then
      echo -e "\033[32m✔ $1\033[0m"
      CI_PASS=$((CI_PASS + 1))
    else
      echo -e "\033[31m✘ $1 — expected '$expected', got: $actual\033[0m"
      CI_FAIL=$((CI_FAIL + 1))
    fi
  }

  ci_mcp_call() {
    local method="$1" params="$2"
    local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}'
    local initialized='{"jsonrpc":"2.0","method":"notifications/initialized"}'
    local call="{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$method\",\"arguments\":$params}}"
    echo -e "$init\n$initialized\n$call" | node "$MCP" 2>/dev/null | tail -1
  }

  echo ""
  echo "=== Code Intelligence (background) ==="

  # LSP: 단일 MCP 세션에서 모든 호출 배치 (초기화 1회)
  if command -v npx &>/dev/null; then
    INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}'
    NOTIF='{"jsonrpc":"2.0","method":"notifications/initialized"}'
    LSP1='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"nx_lsp_hover","arguments":{"file":"src/shared/session.ts","line":9,"character":17}}}'
    LSP2='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nx_lsp_goto_definition","arguments":{"file":"src/hooks/gate.ts","line":4,"character":40}}}'
    LSP3='{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"nx_lsp_find_references","arguments":{"file":"src/shared/session.ts","line":9,"character":17}}}'
    lsp_results=$(echo -e "$INIT\n$NOTIF\n$LSP1\n$LSP2\n$LSP3" | node "$MCP" 2>/dev/null)
    lsp_hover=$(echo "$lsp_results" | grep '"id":2')
    lsp_goto=$(echo "$lsp_results" | grep '"id":3')
    lsp_refs=$(echo "$lsp_results" | grep '"id":4')
    ci_check "LSP/hover" 'hover' "$lsp_hover"
    ci_check "LSP/goto_definition" 'definitions' "$lsp_goto"
    ci_check "LSP/find_references" 'references' "$lsp_refs"
  else
    echo "  (LSP tests skipped: npx not available)"
  fi

  # AST: 단일 MCP 세션에서 모든 호출 배치
  INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}'
  NOTIF='{"jsonrpc":"2.0","method":"notifications/initialized"}'
  AST1='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"nx_ast_search","arguments":{"pattern":"function $NAME($$$) { $$$BODY }","language":"typescript","path":"src/shared"}}}'
  AST2='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nx_ast_search","arguments":{"pattern":"def $NAME($$$):","language":"python","path":"test/fixtures/python"}}}'
  AST3='{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"nx_ast_search","arguments":{"pattern":"fn $NAME($$$) -> $RET { $$$BODY }","language":"rust","path":"test/fixtures/rust"}}}'
  AST4='{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"nx_ast_search","arguments":{"pattern":"func $NAME($$$) $RET { $$$BODY }","language":"go","path":"test/fixtures/go"}}}'
  AST5='{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"nx_ast_replace","arguments":{"pattern":"def greet($$$):","replacement":"def hello($$$):","language":"python","path":"test/fixtures/python","dryRun":true}}}'
  ast_results=$(echo -e "$INIT\n$NOTIF\n$AST1\n$AST2\n$AST3\n$AST4\n$AST5" | node "$MCP" 2>/dev/null)
  ast_line2=$(echo "$ast_results" | sed -n '2p')
  if echo "$ast_line2" | sed 's/\\"/"/g' | grep -q '"error".*not installed'; then
    echo "  (ast-grep not installed, skipping all AST tests)"
  else
    ci_check "AST/search (TypeScript)" 'matches' "$ast_line2"
    ci_check "AST/search (Python)" 'matches' "$(echo "$ast_results" | sed -n '3p')"
    ci_check "AST/search (Rust)" 'matches' "$(echo "$ast_results" | sed -n '4p')"
    ci_check "AST/search (Go)" 'matches' "$(echo "$ast_results" | sed -n '5p')"
    ci_check "AST/replace (dryRun)" 'changes' "$(echo "$ast_results" | sed -n '6p')"
  fi

  echo "${CI_PASS} ${CI_FAIL}" > "$CI_RESULT"
) &
CI_PID=$!

# ============================================================================
# Group B: MCP 도구 + 훅 + 스킬 (포그라운드 — 순차 실행)
# ============================================================================

echo "=== MCP 도구 ==="

result=$(mcp_call "nx_state_write" '{"key":"test-nonstop","value":{"active":true,"maxIterations":10,"currentIteration":0},"sessionId":"e2e-test"}')
check "nx_state_write" '"success":true' "$result"

result=$(mcp_call "nx_state_read" '{"key":"test-nonstop","sessionId":"e2e-test"}')
check "nx_state_read" '"exists":true' "$result"
check "nx_state_read (active)" '"active":true' "$result"

result=$(mcp_call "nx_state_clear" '{"key":"test-nonstop","sessionId":"e2e-test"}')
check "nx_state_clear" '"cleared":true' "$result"

result=$(mcp_call "nx_state_read" '{"key":"test-nonstop","sessionId":"e2e-test"}')
check "nx_state_read (cleared)" '"exists":false' "$result"

result=$(mcp_call "nx_knowledge_read" '{"topic":"architecture"}')
check "nx_knowledge_read" 'Nexus' "$result"

result=$(mcp_call "nx_knowledge_read" '{}')
check "nx_knowledge_read (list)" '"topics"' "$result"

result=$(mcp_call "nx_memo_write" '{"content":"E2E test memo","ttl":"session","tags":["test"]}')
check "nx_memo_write" '"success":true' "$result"

result=$(mcp_call "nx_memo_read" '{"tags":["test"]}')
check "nx_memo_read" 'E2E test memo' "$result"

result=$(mcp_call "nx_context" '{}')
check "nx_context" '"branch"' "$result"
check "nx_context (sessionId)" '"sessionId"' "$result"

# --- 훅 테스트 ---
echo ""
echo "=== 훅 ==="

mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (no nonstop)" '"continue":true' "$result"

echo '{"active":true,"maxIterations":10,"currentIteration":2}' > .nexus/state/sessions/e2e-hook/nonstop.json
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (nonstop active)" '"decision":"block"' "$result"
check "Gate/Stop (iteration)" 'SUSTAIN 3/10' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"nonstop mode on"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (nonstop)" 'nonstop mode ACTIVATED' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"이거 병렬로 처리해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (parallel)" 'parallel mode ACTIVATED' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[pipeline] 자동으로 진행"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (pipeline tag)" 'pipeline mode ACTIVATED' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"nonstop 에러 수정해"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (nonstop mention → routing)" 'debugger' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[nonstop] 이 에러 고쳐줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (nonstop tag in error)" 'nonstop mode ACTIVATED' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"이 파일 수정해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (no keyword)" '"continue":true' "$result"

result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/PreToolUse (Bash)" 'parallel execution' "$result"

result=$(echo '{"hook_event_name":"SessionStart"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SessionStart" 'NEXUS.*Session' "$result"
check "Tracker/SessionStart (delegation rule)" 'routing.*delegate' "$result"

result=$(echo '{"hook_event_name":"SubagentStart","agent_type":"builder"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SubagentStart" '"continue":true' "$result"

# Tracker: SubagentStart 중복 push + 이름 정규화
rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json
echo '{"hook_event_name":"SubagentStart","agent_type":"nexus:builder"}' | node scripts/tracker.cjs >/dev/null 2>&1
echo '{"hook_event_name":"SubagentStart","agent_type":"nexus:builder"}' | node scripts/tracker.cjs >/dev/null 2>&1
active_count=$(node -e "try{const a=JSON.parse(require('fs').readFileSync('.nexus/state/sessions/e2e-hook/agents.json','utf-8')).active;console.log(a.filter(x=>x==='builder').length)}catch{console.log(0)}")
if [ "$active_count" -ge 2 ]; then
  green "Tracker/SubagentStart (duplicate push)" && PASS=$((PASS + 1))
else
  red "Tracker/SubagentStart (duplicate push) — expected >=2, got: $active_count" && FAIL=$((FAIL + 1))
fi
echo '{"hook_event_name":"SubagentStop","agent_type":"nexus:builder"}' | node scripts/tracker.cjs >/dev/null 2>&1
active_count=$(node -e "try{const a=JSON.parse(require('fs').readFileSync('.nexus/state/sessions/e2e-hook/agents.json','utf-8')).active;console.log(a.filter(x=>x==='builder').length)}catch{console.log(0)}")
if [ "$active_count" -ge 1 ]; then
  green "Tracker/SubagentStop (splice one)" && PASS=$((PASS + 1))
else
  red "Tracker/SubagentStop (splice one) — expected >=1, got: $active_count" && FAIL=$((FAIL + 1))
fi

# --- Phase 2 훅 ---
echo ""
echo "=== Phase 2 훅 ==="

rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

echo '{"active":true,"maxIterations":100,"currentIteration":0,"tasks":[{"id":"t1","status":"running"},{"id":"t2","status":"pending"}],"completedCount":0,"totalCount":2}' > .nexus/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (parallel active)" '"decision":"block"' "$result"
check "Gate/Stop (parallel progress)" 'PARALLEL 0/2' "$result"

echo '{"active":true,"maxIterations":100,"currentIteration":0,"completedCount":0,"totalCount":0}' > .nexus/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (parallel no tasks)" '"continue":true' "$result"

echo '{"active":true,"maxIterations":100,"currentIteration":0,"tasks":[{"id":"t1","status":"done"},{"id":"t2","status":"done"}],"completedCount":2,"totalCount":2}' > .nexus/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (parallel all done)" '"continue":true' "$result"
rm -f .nexus/state/sessions/e2e-hook/parallel.json

echo '{"active":true,"maxIterations":100,"currentIteration":0,"stages":[{"name":"analyze","status":"done"},{"name":"implement","status":"running"},{"name":"verify","status":"pending"}],"currentStage":"implement","currentStageIndex":1,"totalStages":3}' > .nexus/state/sessions/e2e-hook/pipeline.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (pipeline active)" '"decision":"block"' "$result"
check "Gate/Stop (pipeline stage info)" 'implement (2/3)' "$result"
rm -f .nexus/state/sessions/e2e-hook/pipeline.json

rm -f .nexus/state/sessions/e2e-hook/pipeline.json .nexus/state/sessions/e2e-hook/nonstop.json
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"auto으로 src/hooks/gate.ts 리팩토링 진행해"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (auto)" 'auto mode ACTIVATED' "$result"
[ -f .nexus/state/sessions/e2e-hook/pipeline.json ] && [ -f .nexus/state/sessions/e2e-hook/nonstop.json ] && green "Gate/auto (dual state)" && PASS=$((PASS + 1)) || (red "Gate/auto (dual state)" && FAIL=$((FAIL + 1)))
rm -f .nexus/state/sessions/e2e-hook/pipeline.json .nexus/state/sessions/e2e-hook/nonstop.json .nexus/state/sessions/e2e-hook/parallel.json

mcp_call "nx_state_write" '{"key":"pipeline","value":{"active":true},"sessionId":"e2e-auto"}' > /dev/null
mcp_call "nx_state_write" '{"key":"nonstop","value":{"active":true},"sessionId":"e2e-auto"}' > /dev/null
result=$(mcp_call "nx_state_clear" '{"key":"auto","sessionId":"e2e-auto"}')
check "MCP nx_state_clear (auto)" '"cleared":true' "$result"
check "MCP nx_state_clear (auto keys)" '"clearedKeys"' "$result"

rm -f .nexus/state/sessions/e2e-hook/whisper-tracker.json

echo '{"active":true,"currentStage":"verify","currentStageIndex":2,"totalStages":3}' > .nexus/state/sessions/e2e-hook/pipeline.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Read"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/PreToolUse (pipeline)" 'PIPELINE stage: verify' "$result"
rm -f .nexus/state/sessions/e2e-hook/pipeline.json

echo '{"active":true,"completedCount":1,"totalCount":3}' > .nexus/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Read"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/PreToolUse (parallel)" 'PARALLEL 1/3 done' "$result"
rm -f .nexus/state/sessions/e2e-hook/parallel.json

# --- Tracker-Parallel 연동 ---
echo ""
echo "=== Tracker-Parallel 연동 ==="

rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

echo '{"active":true,"maxIterations":100,"currentIteration":0,"tasks":[{"id":"t1","description":"task1","agent":"builder","status":"running"},{"id":"t2","description":"task2","agent":"builder","status":"running"}],"completedCount":0,"totalCount":2}' > .nexus/state/sessions/e2e-hook/parallel.json

result=$(echo '{"hook_event_name":"SubagentStop","agent_type":"builder"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SubagentStop (parallel update)" '"continue":true' "$result"

if [ -f .nexus/state/sessions/e2e-hook/parallel.json ]; then
  completed=$(python3 -c "import json; print(json.load(open('.nexus/state/sessions/e2e-hook/parallel.json')).get('completedCount',0))")
  if [ "$completed" = "1" ]; then
    green "Parallel auto-update (1/2 done)" && PASS=$((PASS + 1))
  else
    red "Parallel auto-update — expected 1, got $completed" && FAIL=$((FAIL + 1))
  fi
else
  red "Parallel auto-update (file missing)" && FAIL=$((FAIL + 1))
fi

result=$(echo '{"hook_event_name":"SubagentStop","agent_type":"builder"}' | node scripts/tracker.cjs 2>/dev/null)
if [ -f .nexus/state/sessions/e2e-hook/parallel.json ]; then
  red "Parallel auto-clear (file should be deleted)" && FAIL=$((FAIL + 1))
else
  green "Parallel auto-clear (all done)" && PASS=$((PASS + 1))
fi

# --- Pulse 컨텍스트 수준 ---
echo ""
echo "=== Pulse 컨텍스트 수준 ==="

rm -f .nexus/state/sessions/e2e-hook/whisper-tracker.json

echo '{"active":["finder"],"history":[]}' > .nexus/state/sessions/e2e-hook/agents.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/minimal (no guidance)" '"continue":true' "$result"
if echo "$result" | grep -q 'parallel execution'; then
  red "Pulse/minimal (guidance leaked)" && FAIL=$((FAIL + 1))
else
  green "Pulse/minimal (guidance filtered)" && PASS=$((PASS + 1))
fi

rm -f .nexus/state/sessions/e2e-hook/whisper-tracker.json

echo '{"active":["builder"],"history":[]}' > .nexus/state/sessions/e2e-hook/agents.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/standard (has guidance)" 'parallel execution' "$result"

rm -f .nexus/state/sessions/e2e-hook/agents.json .nexus/state/sessions/e2e-hook/whisper-tracker.json

# --- 태스크 관리 ---
echo ""
echo "=== 태스크 관리 ==="

result=$(mcp_call "nx_task_create" '{"title":"E2E test task","description":"Testing task CRUD","tags":["test","e2e"]}')
check "nx_task_create" '"success":true' "$result"
TASK_ID=$(echo "$result" | sed 's/\\"/"/g' | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')

result=$(mcp_call "nx_task_list" '{"status":"todo"}')
check "nx_task_list (todo)" 'E2E test task' "$result"

result=$(mcp_call "nx_task_list" '{"tags":["e2e"]}')
check "nx_task_list (tags)" 'E2E test task' "$result"

result=$(mcp_call "nx_task_update" "{\"id\":\"$TASK_ID\",\"status\":\"in_progress\"}")
check "nx_task_update" '"success":true' "$result"

result=$(mcp_call "nx_task_summary" '{}')
check "nx_task_summary" '"in_progress":' "$result"

result=$(mcp_call "nx_task_update" "{\"id\":\"$TASK_ID\",\"status\":\"done\"}")
check "nx_task_update (done)" '"completedAt"' "$result"

rm -rf .claude/nexus/tasks/*e2e* 2>/dev/null
[ -n "$TASK_ID" ] && rm -f ".claude/nexus/tasks/${TASK_ID}.json" 2>/dev/null

# --- 세션 상태 정리 ---
echo ""
echo "=== 세션 상태 정리 ==="

mkdir -p .nexus/state/sessions/e2e-prev
echo '{"active":true,"maxIterations":100,"currentIteration":5}' > .nexus/state/sessions/e2e-prev/nonstop.json
echo '{"active":true,"stages":[]}' > .nexus/state/sessions/e2e-prev/pipeline.json
echo '{"sessionId":"e2e-prev","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

result=$(echo '{"hook_event_name":"SessionStart"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SessionStart (cleanup)" 'NEXUS.*Session' "$result"

if [ -f .nexus/state/sessions/e2e-prev/nonstop.json ] || [ -f .nexus/state/sessions/e2e-prev/pipeline.json ]; then
  red "SessionStart (prev state not cleaned)" && FAIL=$((FAIL + 1))
else
  green "SessionStart (prev state cleaned)" && PASS=$((PASS + 1))
fi

NEW_SID=$(cat .nexus/state/current-session.json | grep -o '"sessionId":"[^"]*"' | sed 's/"sessionId":"//;s/"//')
mkdir -p ".nexus/state/sessions/${NEW_SID}"
echo '{"active":true,"maxIterations":100,"currentIteration":0}' > ".nexus/state/sessions/${NEW_SID}/nonstop.json"
result=$(echo '{"hook_event_name":"SessionEnd"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SessionEnd (cleanup)" '"continue":true' "$result"

if [ -f ".nexus/state/sessions/${NEW_SID}/nonstop.json" ]; then
  red "SessionEnd (state not cleaned)" && FAIL=$((FAIL + 1))
else
  green "SessionEnd (state cleaned)" && PASS=$((PASS + 1))
fi

mkdir -p .nexus/state/sessions/e2e-old1 .nexus/state/sessions/e2e-old2
echo '{"active":true}' > .nexus/state/sessions/e2e-old1/nonstop.json
echo '{"active":true}' > .nexus/state/sessions/e2e-old2/pipeline.json
echo '{"sessionId":"e2e-old1","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json
result=$(echo '{"hook_event_name":"SessionStart"}' | node scripts/tracker.cjs 2>/dev/null)
if [ -f .nexus/state/sessions/e2e-old1/nonstop.json ] || [ -f .nexus/state/sessions/e2e-old2/pipeline.json ]; then
  red "SessionStart (multi-session cleanup)" && FAIL=$((FAIL + 1))
else
  green "SessionStart (multi-session cleanup)" && PASS=$((PASS + 1))
fi

# --- Init ---
echo ""
echo "=== Init ==="

rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

result=$(echo '{"prompt":"[init] 프로젝트 온보딩"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (init tag)" 'Init mode' "$result"

result=$(echo '{"prompt":"온보딩 진행해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (init natural)" 'Init mode' "$result"

if [ -f .nexus/state/sessions/e2e-hook/init.json ]; then
  red "Init (no state file expected)" && FAIL=$((FAIL + 1))
else
  green "Init (no state file)" && PASS=$((PASS + 1))
fi

# --- Consult ---
echo ""
echo "=== Consult ==="

rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[consult] 어떤 구조가 좋을까"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (consult tag)" 'Consult mode' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"어떻게 하면 좋을까"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (consult natural)" 'Consult mode' "$result"

if [ -f .nexus/state/sessions/e2e-hook/consult.json ]; then
  red "Consult (no state file expected)" && FAIL=$((FAIL + 1))
else
  green "Consult (no state file)" && PASS=$((PASS + 1))
fi

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[consult] 인증 모듈 설계"}' | node scripts/gate.cjs 2>/dev/null)
check "Consult (ASSESS step)" 'ASSESS' "$result"
check "Consult (brownfield)" 'brownfield' "$result"
check "Consult (EXECUTE BRIDGE)" 'EXECUTE BRIDGE' "$result"
check "Consult (dimension tracking)" 'Goal' "$result"

# --- Setup ---
echo ""
echo "=== Setup ==="

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[setup] nexus 세팅하자"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (setup tag)" 'Setup wizard' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"nexus 설정해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (setup natural)" 'Setup wizard' "$result"

if [ -f .nexus/state/sessions/e2e-hook/setup.json ]; then
  red "Setup (no state file expected)" && FAIL=$((FAIL + 1))
else
  green "Setup (no state file)" && PASS=$((PASS + 1))
fi

check "Setup (STATUSLINE step)" 'STATUSLINE' "$result"
check "Setup (INIT step)" 'INIT' "$result"
check "Setup (AskUserQuestion)" 'AskUserQuestion' "$result"

# --- Plan ---
echo ""
echo "=== Plan ==="

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[plan] API 인증 모듈 설계"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (plan tag)" 'Plan mode' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"계획 세워줘 게이트 훅 리팩토링"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (plan natural)" 'Plan mode' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"어떻게 구현할지 계획 짜줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (plan natural 2)" 'Plan mode' "$result"

if [ -f .nexus/state/sessions/e2e-hook/plan.json ]; then
  red "Plan (no state file expected)" && FAIL=$((FAIL + 1))
else
  green "Plan (no state file)" && PASS=$((PASS + 1))
fi

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[plan] 인증 모듈 설계"}' | node scripts/gate.cjs 2>/dev/null)
check "Plan (consensus - strategist)" 'strategist' "$result"
check "Plan (consensus - architect)" 'architect' "$result"
check "Plan (EXECUTE BRIDGE)" 'EXECUTE BRIDGE' "$result"
check "Plan (scale detection)" 'small' "$result"

# --- Pre-Execution Gate ---
echo ""
echo "=== Pre-Execution Gate ==="

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"auto 해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate (vague auto → plan suggestion)" 'plan' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"auto으로 src/hooks/gate.ts 수정해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate (concrete auto → activated)" 'ACTIVATED' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"force: auto 해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate (force: bypass)" 'ACTIVATED' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[force] auto 해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate ([force] bypass)" 'ACTIVATED' "$result"

# --- 위임 강제 ---
echo ""
echo "=== 위임 강제 ==="

rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

# routing.json이 있을 때 Write 도구 → 위임 리마인더
echo '{"agent":"builder","issuedAt":1700000000}' > .nexus/state/sessions/e2e-hook/routing.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"src/foo.ts"}}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/delegation (routing active + Write)" 'DELEGATION' "$result"

# 허용 경로는 경고 안 함
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":".nexus/config.json"}}' | node scripts/pulse.cjs 2>/dev/null)
if echo "$result" | grep -q 'DELEGATION'; then
  red "Pulse/delegation (allowed path leaked)" && FAIL=$((FAIL + 1))
else
  green "Pulse/delegation (allowed path OK)" && PASS=$((PASS + 1))
fi

# SubagentStart → routing.json 해제
echo '{"hook_event_name":"SubagentStart","agent_type":"nexus:builder"}' | node scripts/tracker.cjs >/dev/null 2>&1
if [ -f .nexus/state/sessions/e2e-hook/routing.json ]; then
  red "Tracker/SubagentStart (routing not cleared)" && FAIL=$((FAIL + 1))
else
  green "Tracker/SubagentStart (routing cleared)" && PASS=$((PASS + 1))
fi

# SessionStart에 model 금지 지시 포함 확인
result=$(echo '{"hook_event_name":"SessionStart"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SessionStart (model prohibition)" 'NEVER.*model' "$result"

rm -f .nexus/state/sessions/e2e-hook/routing.json

# --- 적응형 라우팅 ---
echo ""
echo "=== 적응형 라우팅 ==="

rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

result=$(echo '{"prompt":"이 버그 고쳐줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (bug fix)" 'debugger' "$result"
check "Routing (bug fix workflow)" 'nonstop' "$result"

result=$(echo '{"prompt":"이 코드 리뷰해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (review)" 'reviewer' "$result"

result=$(echo '{"prompt":"테스트 추가해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (test)" 'tester' "$result"

result=$(echo '{"prompt":"이 함수 어디에 있어?"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (search)" 'finder' "$result"

result=$(echo '{"prompt":"새로운 기능 구현해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (implement)" 'auto' "$result"

result=$(echo '{"prompt":"Builder으로 이 함수 수정해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (agent override)" 'builder' "$result"
check "Routing (override format)" 'NEXUS' "$result"

result=$(echo '{"prompt":"[nonstop] 이 버그 고쳐줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (keyword priority)" 'nonstop mode ACTIVATED' "$result"

result=$(echo '{"prompt":"안녕"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (no match)" '"continue":true' "$result"

# --- 라우팅 히스토리 ---
echo ""
echo "=== 라우팅 히스토리 ==="

rm -f .nexus/routing-history.json

echo '{"prompt":"Builder으로 이 버그 고쳐줘"}' | node scripts/gate.cjs 2>/dev/null > /dev/null
echo '{"prompt":"Builder으로 이 에러 수정해"}' | node scripts/gate.cjs 2>/dev/null > /dev/null
result=$(echo '{"prompt":"이 버그 고쳐줘"}' | node scripts/gate.cjs 2>/dev/null)
check "History (learned override)" 'builder' "$result"
check "History (hint)" 'history-based' "$result"

rm -f .nexus/routing-history.json

# --- 태스크 자연어 ---
echo ""
echo "=== 태스크 자연어 ==="

result=$(echo '{"prompt":"진행 중인 작업 뭐야?"}' | node scripts/gate.cjs 2>/dev/null)
check "Task (in_progress)" 'nx_task_list' "$result"

result=$(echo '{"prompt":"다음 할 일 알려줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Task (todo)" 'nx_task_list' "$result"

result=$(echo '{"prompt":"작업 현황 보여줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Task (summary)" 'nx_task_summary' "$result"

result=$(echo '{"prompt":"막힌 작업 있어?"}' | node scripts/gate.cjs 2>/dev/null)
check "Task (blocked)" 'nx_task_list' "$result"

# ============================================================================
# 백그라운드 Code Intelligence 대기
# ============================================================================
echo ""
echo "=== Code Intelligence 대기... ==="
wait $CI_PID
CI_EXIT=$?

if [ -f "$CI_RESULT" ]; then
  read CI_P CI_F < "$CI_RESULT"
  PASS=$((PASS + CI_P))
  FAIL=$((FAIL + CI_F))
fi
rm -f "$CI_RESULT"

# Cleanup — 테스트 세션 제거 + 원본 세션 복원
rm -rf .nexus/state/sessions/e2e-hook .nexus/state/sessions/e2e-auto .nexus/state/sessions/e2e-test .nexus/state/sessions/e2e-prev .nexus/state/sessions/e2e-old1 .nexus/state/sessions/e2e-old2 .nexus/memo/*e2e* 2>/dev/null
if [ -n "$ORIG_SESSION" ]; then
  echo "$ORIG_SESSION" > .nexus/state/current-session.json
else
  rm -f .nexus/state/current-session.json
fi

# --- 결과 ---
echo ""
echo "=== 결과: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "All tests passed!" || exit 1
