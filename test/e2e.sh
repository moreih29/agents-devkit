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

result=$(mcp_call "nx_knowledge_read" '{"topic":"architecture"}')
check "nx_knowledge_read" 'Nexus' "$result"

result=$(mcp_call "nx_knowledge_read" '{}')
check "nx_knowledge_read (list)" '"topics"' "$result"

result=$(mcp_call "nx_context" '{}')
check "nx_context" '"branch"' "$result"
check "nx_context (branch)" '"branch"' "$result"

# --- 훅 테스트 ---
echo ""
echo "=== 훅 ==="

# Stop: tasks.json 없음 → pass
rm -f .nexus/tasks.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (no tasks.json)" '"continue":true' "$result"

# Stop: tasks.json에 완료된 태스크만 → pass
echo '{"tasks":[{"id":"t1","title":"done","status":"completed"}]}' > .nexus/tasks.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (all tasks completed)" '"continue":true' "$result"
rm -f .nexus/tasks.json

# Stop: tasks.json에 미완료 태스크 → block
echo '{"tasks":[{"id":"t1","title":"pending task","status":"pending"},{"id":"t2","title":"done","status":"completed"}]}' > .nexus/tasks.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (pending tasks)" '"decision":"block"' "$result"
check "Gate/Stop (pending tasks count)" '1 tasks remaining' "$result"
rm -f .nexus/tasks.json

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"이 파일 수정해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (no keyword)" '"continue":true' "$result"

# [d] 태그 감지
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[d] 이거 결정"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit ([d] tag)" 'Decision tag' "$result"

# --- Consult ---
echo ""
echo "=== Consult ==="

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[consult] 어떤 구조가 좋을까"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (consult tag)" 'Consult mode' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"어떻게 하면 좋을까"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (consult natural)" 'Consult mode' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[consult] 인증 모듈 설계"}' | node scripts/gate.cjs 2>/dev/null)
check "Consult (EXPLORE step)" 'EXPLORE' "$result"
check "Consult (brownfield)" 'brownfield' "$result"
check "Consult (advisory only)" 'advisory only' "$result"

# --- Team ---
echo ""
echo "=== Team ==="

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[team] API 인증 모듈 설계"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (team tag)" 'Team mode' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"팀 구성해서 게이트 훅 리팩토링"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (team natural)" 'Team mode' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"team this"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (team natural 2)" 'Team mode' "$result"

result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[team] 인증 모듈 설계"}' | node scripts/gate.cjs 2>/dev/null)
check "Team (nx_task_add)" 'nx_task_add' "$result"
check "Team (tasks.json)" 'tasks.json' "$result"

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

# Cleanup — 테스트 세션 제거 + 원본 세션 복원
rm -rf .nexus/state/sessions/e2e-hook .nexus/state/sessions/e2e-test .nexus/state/sessions/e2e-prev .nexus/state/sessions/e2e-old1 .nexus/state/sessions/e2e-old2 2>/dev/null
rm -f .nexus/tasks.json 2>/dev/null
if [ -n "$ORIG_SESSION" ]; then
  echo "$ORIG_SESSION" > .nexus/state/current-session.json
else
  rm -f .nexus/state/current-session.json
fi

# --- 결과 ---
echo ""
echo "=== 결과: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "All tests passed!" || exit 1
