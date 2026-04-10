#!/bin/bash
# Nexus E2E 검증 스크립트
# MCP 도구 + 훅 + Code Intelligence 자동 테스트
# Code Intelligence(LSP/AST)는 백그라운드에서 병렬 실행하여 속도 최적화

set -e
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
MCP="bridge/mcp-server.cjs"

# 임시 디렉토리 사용 — 실제 .nexus는 건드리지 않음
E2E_TMP=$(mktemp -d)
export NEXUS_RUNTIME_ROOT="$E2E_TMP"
# gate.cjs는 STATE_ROOT(.nexus/state/)에서 tasks.json을 읽음
E2E_STATE="$E2E_TMP/state"
mkdir -p "$E2E_STATE"
# MCP 도구 테스트용 context 파일 생성
mkdir -p "$E2E_TMP/context"
echo '# Architecture' > "$E2E_TMP/context/architecture.md"

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
    LSP1='{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"nx_lsp_hover","arguments":{"file":"src/shared/paths.ts","line":5,"character":17}}}'
    LSP2='{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"nx_lsp_goto_definition","arguments":{"file":"src/hooks/gate.ts","line":4,"character":40}}}'
    LSP3='{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"nx_lsp_find_references","arguments":{"file":"src/shared/paths.ts","line":5,"character":17}}}'
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
# Group B: MCP 도구 + 훅 (포그라운드 — 순차 실행)
# ============================================================================

echo "=== MCP 도구 ==="

result=$(mcp_call "nx_context" '{}')
check "nx_context" '"branch"' "$result"
check "nx_context (branch)" '"branch"' "$result"

# --- 훅 테스트 ---
echo ""
echo "=== 훅 ==="

# Stop: tasks.json 없음 → pass
rm -f "$E2E_STATE/tasks.json"
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (no tasks.json)" '"continue":true' "$result"

# Stop: tasks.json에 완료된 태스크만 → pass
echo '{"tasks":[{"id":"t1","title":"done","status":"completed"}]}' > "$E2E_STATE/tasks.json"
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (all tasks completed)" '"continue":true' "$result"
rm -f "$E2E_STATE/tasks.json"

# Stop: tasks.json에 미완료 태스크 → continue:true (nonstop, block 아님)
echo '{"tasks":[{"id":"t1","title":"pending task","status":"pending"},{"id":"t2","title":"done","status":"completed"}]}' > "$E2E_STATE/tasks.json"
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (pending tasks)" '"continue":true' "$result"
check "Gate/Stop (pending tasks count)" '1 tasks pending' "$result"
rm -f "$E2E_STATE/tasks.json"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"이 파일 수정해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (no keyword)" '"continue":true' "$result"

# [d] 태그 감지 — plan.json 없는 상태에서는 안내 메시지
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[d] 이거 결정"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit ([d] tag)" 'plan' "$result"

# --- Plan ---
echo ""
echo "=== Plan ==="

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[plan] UI 구조 설계하자"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (plan tag)" 'nx-plan' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"계획 세우자"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (natural ignored)" '"continue":true' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[plan] 인증 모듈 설계"}' | node scripts/gate.cjs 2>/dev/null)
check "Plan (skill invoke)" 'Invoke Skill' "$result"
check "Plan (skill name)" 'nx-plan' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[plan:auto] 인증 모듈 설계"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (plan:auto tag)" 'nx-plan' "$result"
check "Plan:auto (auto mode args)" 'auto' "$result"

# --- Default (Free Mode) ---
echo ""
echo "=== Default (Free Mode) ==="

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"API 인증 모듈 구현해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (free mode)" '"continue":true' "$result"

# --- Edit/Write Gating ---
echo ""
echo "=== Edit/Write Gating ==="

# Edit without tasks.json → allowed (free mode)
rm -f "$E2E_STATE/tasks.json"
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"/tmp/test.ts"}}' | node scripts/gate.cjs 2>/dev/null)
check "PreToolUse/Edit (no tasks.json = free)" '"continue":true' "$result"

# Edit with tasks.json (pending tasks) → allowed
echo '{"goal":"test","decisions":[],"tasks":[{"id":1,"title":"t","context":"c","status":"pending","deps":[]}]}' > "$E2E_STATE/tasks.json"
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"/tmp/test.ts"}}' | node scripts/gate.cjs 2>/dev/null)
check "PreToolUse/Edit (tasks pending = allowed)" '"continue":true' "$result"

# Edit with tasks.json (all completed) → blocked
echo '{"goal":"test","decisions":[],"tasks":[{"id":1,"title":"t","context":"c","status":"completed","deps":[]}]}' > "$E2E_STATE/tasks.json"
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Edit","tool_input":{"file_path":"/tmp/test.ts"}}' | node scripts/gate.cjs 2>/dev/null)
check "PreToolUse/Edit (all completed = blocked)" 'block' "$result"
rm -f "$E2E_STATE/tasks.json"

# --- Run Tag ---
echo ""
echo "=== Run Tag ==="

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[run] API 모듈 구현"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit ([run] tag)" 'nx-run' "$result"
check "Run tag (skill invoke)" 'Invoke Skill' "$result"

# --- Rule Tag ---
echo ""
echo "=== Rule Tag ==="

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[rule] 코드 리뷰는 2명 이상"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit ([rule] tag)" 'Rule mode' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[rule:dev,test] 커버리지 80% 이상"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit ([rule:tags] tag)" 'Rule mode' "$result"
check "Rule tag (explicit tags)" 'dev, test' "$result"

# (Edit tracker tests removed — trackers deleted per D9 decision)

# 정리
rm -f "$TRACKER_STATE/edit-tracker.json" "$TRACKER_STATE/tasks.json"

# --- 추가 훅 테스트 ---
echo ""
echo "=== 추가 훅 테스트 ==="

# PostCompact 스냅샷: pending 태스크 포함 tasks.json → restored 응답
echo '{"tasks":[{"id":1,"title":"pending task","status":"pending"}]}' > "$E2E_STATE/tasks.json"
result=$(echo '{"hook_event_name":"PostCompact"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/PostCompact (snapshot restored)" 'restored' "$result"
rm -f "$E2E_STATE/tasks.json"

# stop_hook_active pass: stop_hook_active=true + all-completed tasks → continue:true (not blocked)
echo '{"tasks":[{"id":1,"title":"done","status":"completed"}]}' > "$E2E_STATE/tasks.json"
result=$(echo '{"hook_event_name":"Stop","stop_hook_active":true}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (stop_hook_active pass)" '"continue":true' "$result"
rm -f "$E2E_STATE/tasks.json"

# buildCoreIndex in plan mode: context/ 파일이 있으므로 인덱스 생성
rm -f "$E2E_STATE/tasks.json"
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[plan] 분석하자"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (plan core index)" 'context' "$result"

# stale tasks.json on plan entry: all-completed → nx_task_close 요구
echo '{"tasks":[{"id":1,"title":"done","status":"completed"}]}' > "$E2E_STATE/tasks.json"
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[plan] 새 계획"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (stale tasks on plan)" 'nx_task_close' "$result"
rm -f "$E2E_STATE/tasks.json"

# PreCompact pass: 빈 stdout (continue:true)
result=$(echo '{"hook_event_name":"PreCompact"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/PreCompact (pass)" '"continue":true' "$result"

# --- Resume Tier (Phase 2) ---
echo ""
echo "=== Resume Tier ==="

# (a) SessionStart → runtime.json 생성 + teams_enabled 필드
rm -f "$E2E_STATE/runtime.json" "$E2E_STATE/tool-log.jsonl"
echo '{"hook_event_name":"SessionStart"}' | node scripts/gate.cjs 2>/dev/null >/dev/null
check "SessionStart (runtime.json created)" "teams_enabled" "$(cat "$E2E_STATE/runtime.json" 2>/dev/null || echo '')"

# (b) SessionStart → tool-log.jsonl 초기화 (파일 존재)
check "SessionStart (tool-log.jsonl initialized)" "tool-log.jsonl" "$(ls "$E2E_STATE/" 2>/dev/null)"

# (c) PostToolUse (Edit + agent_id) → tool-log append
: > "$E2E_STATE/tool-log.jsonl"
echo '{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"/tmp/foo.ts"},"agent_id":"agent-test-1"}' | node scripts/gate.cjs 2>/dev/null >/dev/null
check "PostToolUse (Edit logs agent_id)" "agent-test-1" "$(cat "$E2E_STATE/tool-log.jsonl" 2>/dev/null || echo '')"
check "PostToolUse (Edit logs file_path)" "/tmp/foo.ts" "$(cat "$E2E_STATE/tool-log.jsonl" 2>/dev/null || echo '')"

# (d) PostToolUse (no agent_id) → skip
: > "$E2E_STATE/tool-log.jsonl"
echo '{"hook_event_name":"PostToolUse","tool_name":"Edit","tool_input":{"file_path":"/tmp/bar.ts"}}' | node scripts/gate.cjs 2>/dev/null >/dev/null
line_count=$(wc -l < "$E2E_STATE/tool-log.jsonl" 2>/dev/null | tr -d ' ')
check "PostToolUse (no agent_id skipped)" "^0$" "$line_count"

# (e) PostToolUse (Read tool) → skip
: > "$E2E_STATE/tool-log.jsonl"
echo '{"hook_event_name":"PostToolUse","tool_name":"Read","tool_input":{"file_path":"/tmp/baz.ts"},"agent_id":"agent-test-2"}' | node scripts/gate.cjs 2>/dev/null >/dev/null
line_count=$(wc -l < "$E2E_STATE/tool-log.jsonl" 2>/dev/null | tr -d ' ')
check "PostToolUse (Read tool skipped)" "^0$" "$line_count"

# (f) SubagentStart (new agent_id) → new entry
echo '[]' > "$E2E_STATE/agent-tracker.json"
echo '{"hook_event_name":"SubagentStart","agent_id":"agent-abc","agent_type":"claude-nexus:engineer"}' | node scripts/gate.cjs 2>/dev/null >/dev/null
check "SubagentStart (new entry added)" "agent-abc" "$(cat "$E2E_STATE/agent-tracker.json" 2>/dev/null || echo '')"

# (g) SubagentStart (duplicate agent_id) → resume_count++
echo '{"hook_event_name":"SubagentStart","agent_id":"agent-abc","agent_type":"claude-nexus:engineer"}' | node scripts/gate.cjs 2>/dev/null >/dev/null
check "SubagentStart (resume_count incremented)" "resume_count" "$(cat "$E2E_STATE/agent-tracker.json" 2>/dev/null || echo '')"

# (h) SubagentStop → files_touched 주입
echo '{"ts":"2026-04-10T00:00:00.000Z","agent_id":"agent-abc","tool":"Edit","file":"/tmp/x.ts"}' > "$E2E_STATE/tool-log.jsonl"
echo '{"hook_event_name":"SubagentStop","agent_id":"agent-abc"}' | node scripts/gate.cjs 2>/dev/null >/dev/null
check "SubagentStop (files_touched injected)" "files_touched" "$(cat "$E2E_STATE/agent-tracker.json" 2>/dev/null || echo '')"
check "SubagentStop (tool-log file present)" "/tmp/x.ts" "$(cat "$E2E_STATE/agent-tracker.json" 2>/dev/null || echo '')"

# Resume Tier cleanup
rm -f "$E2E_STATE/runtime.json" "$E2E_STATE/tool-log.jsonl"
echo '[]' > "$E2E_STATE/agent-tracker.json"

# --- 추가 MCP 도구 테스트 (plan/task 흐름) ---
echo ""
echo "=== 추가 MCP 도구 테스트 ==="

# plan/task 테스트용 격리된 임시 디렉토리
PLAN_TMP=$(mktemp -d)
PLAN_TMP_ORIG="$NEXUS_RUNTIME_ROOT"
export NEXUS_RUNTIME_ROOT="$PLAN_TMP"
mkdir -p "$PLAN_TMP/state" "$PLAN_TMP/context"
echo '# Architecture' > "$PLAN_TMP/context/architecture.md"

result=$(mcp_call "nx_plan_start" '{"topic":"E2E Test","issues":["issue1"],"research_summary":"test"}')
check "nx_plan_start" 'created' "$result"

result=$(mcp_call "nx_plan_decide" '{"issue_id":1,"summary":"Test decision"}')
check "nx_plan_decide" 'decided' "$result"

result=$(mcp_call "nx_task_add" '{"title":"Test task","context":"Testing","goal":"e2e"}')
check "nx_task_add" 'task' "$result"

result=$(mcp_call "nx_task_update" '{"id":1,"status":"completed"}')
check "nx_task_update" 'completed' "$result"

result=$(mcp_call "nx_task_close" '{}')
check "nx_task_close" 'closed' "$result"

# plan/task 임시 디렉토리 정리 및 원래 상태 복원
rm -rf "$PLAN_TMP"
export NEXUS_RUNTIME_ROOT="$PLAN_TMP_ORIG"

# --- Statusline ---
echo ""
echo "=== Statusline ==="

STATUSLINE_VERSION=$(cat VERSION 2>/dev/null | tr -d '[:space:]')
statusline_out=$(echo '{"display_name":"claude-sonnet","used_percentage":10}' | node scripts/statusline.cjs 2>/dev/null)
check "Statusline/version (vX.Y.Z present)" "v${STATUSLINE_VERSION}" "$statusline_out"
check "Statusline/nexus tag" "Nexus" "$statusline_out"

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

# Cleanup — 임시 디렉토리 제거
rm -rf "$E2E_TMP"

# --- 결과 ---
echo ""
echo "=== 결과: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "All tests passed!" || exit 1
