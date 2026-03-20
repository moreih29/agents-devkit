#!/bin/bash
# Nexus Phase 1 E2E 검증 스크립트
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

# 1. nx_state_write
result=$(mcp_call "nx_state_write" '{"key":"test-nonstop","value":{"active":true,"maxIterations":10,"currentIteration":0},"sessionId":"e2e-test"}')
check "nx_state_write" '"success":true' "$result"

# 2. nx_state_read
result=$(mcp_call "nx_state_read" '{"key":"test-nonstop","sessionId":"e2e-test"}')
check "nx_state_read" '"exists":true' "$result"
check "nx_state_read (active)" '"active":true' "$result"

# 3. nx_state_clear
result=$(mcp_call "nx_state_clear" '{"key":"test-nonstop","sessionId":"e2e-test"}')
check "nx_state_clear" '"cleared":true' "$result"

# 4. nx_state_read (cleared)
result=$(mcp_call "nx_state_read" '{"key":"test-nonstop","sessionId":"e2e-test"}')
check "nx_state_read (cleared)" '"exists":false' "$result"

# 5. nx_knowledge_read (existing file)
result=$(mcp_call "nx_knowledge_read" '{"topic":"architecture"}')
check "nx_knowledge_read" 'Nexus' "$result"

# 6. nx_knowledge_read (list all)
result=$(mcp_call "nx_knowledge_read" '{}')
check "nx_knowledge_read (list)" '"topics"' "$result"

# 7. nx_memo_write
result=$(mcp_call "nx_memo_write" '{"content":"E2E test memo","ttl":"session","tags":["test"]}')
check "nx_memo_write" '"success":true' "$result"

# 8. nx_memo_read
result=$(mcp_call "nx_memo_read" '{"tags":["test"]}')
check "nx_memo_read" 'E2E test memo' "$result"

# 9. nx_context
result=$(mcp_call "nx_context" '{}')
check "nx_context" '"branch"' "$result"
check "nx_context (sessionId)" '"sessionId"' "$result"

# --- 훅 테스트 ---
echo ""
echo "=== 훅 ==="

# 훅 테스트용 클린 세션 설정 (활성 auto/nonstop 등의 간섭 방지)
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

# Gate: Stop (no nonstop) → pass
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (no nonstop)" '"continue":true' "$result"

# Gate: Stop (nonstop active) → block
echo '{"active":true,"maxIterations":10,"currentIteration":2}' > .nexus/state/sessions/e2e-hook/nonstop.json
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (nonstop active)" '"decision":"block"' "$result"
check "Gate/Stop (iteration)" 'SUSTAIN 3/10' "$result"

# Gate: UserPromptSubmit (nonstop keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"nonstop mode on"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (nonstop)" 'nonstop mode ACTIVATED' "$result"

# Gate: UserPromptSubmit (parallel keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"이거 병렬로 처리해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (parallel)" 'parallel mode ACTIVATED' "$result"

# Gate: UserPromptSubmit (pipeline keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[pipeline] 자동으로 진행"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (pipeline tag)" 'pipeline mode ACTIVATED' "$result"

# Gate: UserPromptSubmit (nonstop keyword with error context → 오탐 방지)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"nonstop 에러 수정해"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (nonstop mention → routing)" 'debugger' "$result"

# Gate: UserPromptSubmit ([nonstop] 태그는 에러 맥락이어도 항상 활성화)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[nonstop] 이 에러 고쳐줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (nonstop tag in error)" 'nonstop mode ACTIVATED' "$result"

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
result=$(echo '{"hook_event_name":"SubagentStart","agent_name":"builder"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SubagentStart" '"continue":true' "$result"

# --- Phase 2: Parallel/Pipeline 훅 테스트 ---
echo ""
echo "=== Phase 2 훅 ==="

# Phase 2 테스트 환경 초기화
# Tracker/SessionStart가 createSession()으로 current-session.json을 덮어쓰므로 복원 필요
rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

# Gate: Stop (parallel active, tasks incomplete) → block
echo '{"active":true,"maxIterations":100,"currentIteration":0,"tasks":[{"id":"t1","status":"running"},{"id":"t2","status":"pending"}],"completedCount":0,"totalCount":2}' > .nexus/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (parallel active)" '"decision":"block"' "$result"
check "Gate/Stop (parallel progress)" 'PARALLEL 0/2' "$result"

# Gate: Stop (parallel total=0, tasks not configured) → pass (no block)
echo '{"active":true,"maxIterations":100,"currentIteration":0,"completedCount":0,"totalCount":0}' > .nexus/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (parallel no tasks)" '"continue":true' "$result"

# Gate: Stop (parallel all done) → pass
echo '{"active":true,"maxIterations":100,"currentIteration":0,"tasks":[{"id":"t1","status":"done"},{"id":"t2","status":"done"}],"completedCount":2,"totalCount":2}' > .nexus/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (parallel all done)" '"continue":true' "$result"
rm -f .nexus/state/sessions/e2e-hook/parallel.json

# Gate: Stop (pipeline active with stages) → block with stage info
echo '{"active":true,"maxIterations":100,"currentIteration":0,"stages":[{"name":"analyze","status":"done"},{"name":"implement","status":"running"},{"name":"verify","status":"pending"}],"currentStage":"implement","currentStageIndex":1,"totalStages":3}' > .nexus/state/sessions/e2e-hook/pipeline.json
result=$(echo '{"hook_event_name":"Stop"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/Stop (pipeline active)" '"decision":"block"' "$result"
check "Gate/Stop (pipeline stage info)" 'implement (2/3)' "$result"
rm -f .nexus/state/sessions/e2e-hook/pipeline.json

# Gate: UserPromptSubmit (auto keyword) → pipeline + nonstop 동시 활성화
rm -f .nexus/state/sessions/e2e-hook/pipeline.json .nexus/state/sessions/e2e-hook/nonstop.json
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"auto으로 진행해"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (auto)" 'auto mode ACTIVATED' "$result"
# pipeline.json + nonstop.json 둘 다 생성됐는지 확인
[ -f .nexus/state/sessions/e2e-hook/pipeline.json ] && [ -f .nexus/state/sessions/e2e-hook/nonstop.json ] && green "Gate/auto (dual state)" && PASS=$((PASS + 1)) || (red "Gate/auto (dual state)" && FAIL=$((FAIL + 1)))
rm -f .nexus/state/sessions/e2e-hook/pipeline.json .nexus/state/sessions/e2e-hook/nonstop.json .nexus/state/sessions/e2e-hook/parallel.json

# MCP: nx_state_clear("auto") → pipeline + nonstop 동시 해제
# auto 테스트용 상태 파일 생성
mcp_call "nx_state_write" '{"key":"pipeline","value":{"active":true},"sessionId":"e2e-auto"}' > /dev/null
mcp_call "nx_state_write" '{"key":"nonstop","value":{"active":true},"sessionId":"e2e-auto"}' > /dev/null
result=$(mcp_call "nx_state_clear" '{"key":"auto","sessionId":"e2e-auto"}')
check "MCP nx_state_clear (auto)" '"cleared":true' "$result"
check "MCP nx_state_clear (auto keys)" '"clearedKeys"' "$result"

# Pulse: whisper tracker 초기화 (Phase 1 테스트에서 Read 카운트 누적됨)
rm -f .nexus/state/sessions/e2e-hook/whisper-tracker.json

# Pulse: PreToolUse with pipeline active → pipeline context
echo '{"active":true,"currentStage":"verify","currentStageIndex":2,"totalStages":3}' > .nexus/state/sessions/e2e-hook/pipeline.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Read"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/PreToolUse (pipeline)" 'PIPELINE stage: verify' "$result"
rm -f .nexus/state/sessions/e2e-hook/pipeline.json

# Pulse: PreToolUse with parallel active → parallel context
echo '{"active":true,"completedCount":1,"totalCount":3}' > .nexus/state/sessions/e2e-hook/parallel.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Read"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/PreToolUse (parallel)" 'PARALLEL 1/3 done' "$result"
rm -f .nexus/state/sessions/e2e-hook/parallel.json

# --- Tracker-Parallel 연동 테스트 ---
echo ""
echo "=== Tracker-Parallel 연동 ==="

# 환경 복원
rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

# Parallel 상태 세팅: builder 2개 태스크
echo '{"active":true,"maxIterations":100,"currentIteration":0,"tasks":[{"id":"t1","description":"task1","agent":"builder","status":"running"},{"id":"t2","description":"task2","agent":"builder","status":"running"}],"completedCount":0,"totalCount":2}' > .nexus/state/sessions/e2e-hook/parallel.json

# SubagentStop(builder) → 첫 번째 태스크 done
result=$(echo '{"hook_event_name":"SubagentStop","agent_name":"builder"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SubagentStop (parallel update)" '"continue":true' "$result"

# parallel.json에서 completedCount 확인
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

# SubagentStop(builder) 다시 → 두 번째 태스크 done → 자동 해제
result=$(echo '{"hook_event_name":"SubagentStop","agent_name":"builder"}' | node scripts/tracker.cjs 2>/dev/null)
if [ -f .nexus/state/sessions/e2e-hook/parallel.json ]; then
  red "Parallel auto-clear (file should be deleted)" && FAIL=$((FAIL + 1))
else
  green "Parallel auto-clear (all done)" && PASS=$((PASS + 1))
fi

# --- Pulse 컨텍스트 수준 테스트 ---
echo ""
echo "=== Pulse 컨텍스트 수준 ==="

rm -f .nexus/state/sessions/e2e-hook/whisper-tracker.json

# Pulse: minimal agent (finder) → guidance 메시지 생략
echo '{"active":["finder"],"history":[]}' > .nexus/state/sessions/e2e-hook/agents.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/minimal (no guidance)" '"continue":true' "$result"
# minimal에서는 guidance 메시지(parallel execution)가 없어야 함
if echo "$result" | grep -q 'parallel execution'; then
  red "Pulse/minimal (guidance leaked)" && FAIL=$((FAIL + 1))
else
  green "Pulse/minimal (guidance filtered)" && PASS=$((PASS + 1))
fi

rm -f .nexus/state/sessions/e2e-hook/whisper-tracker.json

# Pulse: standard agent (builder) → guidance 메시지 포함
echo '{"active":["builder"],"history":[]}' > .nexus/state/sessions/e2e-hook/agents.json
result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' | node scripts/pulse.cjs 2>/dev/null)
check "Pulse/standard (has guidance)" 'parallel execution' "$result"

rm -f .nexus/state/sessions/e2e-hook/agents.json .nexus/state/sessions/e2e-hook/whisper-tracker.json

# --- 태스크 관리 테스트 ---
echo ""
echo "=== 태스크 관리 ==="

# nx_task_create
result=$(mcp_call "nx_task_create" '{"title":"E2E test task","description":"Testing task CRUD","tags":["test","e2e"]}')
check "nx_task_create" '"success":true' "$result"
TASK_ID=$(echo "$result" | sed 's/\\"/"/g' | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//;s/"//')

# nx_task_list
result=$(mcp_call "nx_task_list" '{"status":"todo"}')
check "nx_task_list (todo)" 'E2E test task' "$result"

# nx_task_list (by tags)
result=$(mcp_call "nx_task_list" '{"tags":["e2e"]}')
check "nx_task_list (tags)" 'E2E test task' "$result"

# nx_task_update
result=$(mcp_call "nx_task_update" "{\"id\":\"$TASK_ID\",\"status\":\"in_progress\"}")
check "nx_task_update" '"success":true' "$result"

# nx_task_summary
result=$(mcp_call "nx_task_summary" '{}')
check "nx_task_summary" '"in_progress":' "$result"

# nx_task_update (done)
result=$(mcp_call "nx_task_update" "{\"id\":\"$TASK_ID\",\"status\":\"done\"}")
check "nx_task_update (done)" '"completedAt"' "$result"

# Cleanup task files
rm -rf .claude/nexus/tasks/*e2e* 2>/dev/null
# Find and remove the test task by ID
[ -n "$TASK_ID" ] && rm -f ".claude/nexus/tasks/${TASK_ID}.json" 2>/dev/null

# --- 세션 상태 정리 테스트 ---
echo ""
echo "=== 세션 상태 정리 ==="

# Setup: 이전 세션에 잔존 상태 생성
mkdir -p .nexus/state/sessions/e2e-prev
echo '{"active":true,"maxIterations":100,"currentIteration":5}' > .nexus/state/sessions/e2e-prev/nonstop.json
echo '{"active":true,"stages":[]}' > .nexus/state/sessions/e2e-prev/pipeline.json
echo '{"sessionId":"e2e-prev","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

# SessionStart should cleanup previous session state
result=$(echo '{"hook_event_name":"SessionStart"}' | node scripts/tracker.cjs 2>/dev/null)
check "Tracker/SessionStart (cleanup)" 'LATTICE.*Session' "$result"

# Verify previous session state files are cleaned up
if [ -f .nexus/state/sessions/e2e-prev/nonstop.json ] || [ -f .nexus/state/sessions/e2e-prev/pipeline.json ]; then
  red "SessionStart (prev state not cleaned)" && FAIL=$((FAIL + 1))
else
  green "SessionStart (prev state cleaned)" && PASS=$((PASS + 1))
fi

# SessionEnd should cleanup current session state
# First setup a session with active state
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

# SessionStart: 여러 세션의 잔존 상태 동시 정리 (resume 시나리오)
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

# --- Gate init 테스트 ---
echo ""
echo "=== Init ==="

# 훅 테스트 환경 복원
rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

# Gate: UserPromptSubmit (init tag)
result=$(echo '{"prompt":"[init] 프로젝트 온보딩"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (init tag)" 'Init mode' "$result"

# Gate: UserPromptSubmit (init natural)
result=$(echo '{"prompt":"온보딩 진행해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (init natural)" 'Init mode' "$result"

# Init should NOT create state files
if [ -f .nexus/state/sessions/e2e-hook/init.json ]; then
  red "Init (no state file expected)" && FAIL=$((FAIL + 1))
else
  green "Init (no state file)" && PASS=$((PASS + 1))
fi

# --- Gate consult 테스트 ---
echo ""
echo "=== Consult ==="

# 훅 테스트 환경 복원
rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

# Gate: UserPromptSubmit (consult keyword)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"[consult] 어떤 구조가 좋을까"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (consult tag)" 'Consult mode' "$result"

# Gate: UserPromptSubmit (consult natural language)
result=$(echo '{"hook_event_name":"UserPromptSubmit","prompt":"어떻게 하면 좋을까"}' | node scripts/gate.cjs 2>/dev/null)
check "Gate/UserPromptSubmit (consult natural)" 'Consult mode' "$result"

# Consult should NOT create state files (unlike nonstop)
if [ -f .nexus/state/sessions/e2e-hook/consult.json ]; then
  red "Consult (no state file expected)" && FAIL=$((FAIL + 1))
else
  green "Consult (no state file)" && PASS=$((PASS + 1))
fi

# --- 적응형 라우팅 테스트 ---
echo ""
echo "=== 적응형 라우팅 ==="

# 환경 복원
rm -rf .nexus/state/sessions/e2e-hook
mkdir -p .nexus/state/sessions/e2e-hook
echo '{"sessionId":"e2e-hook","createdAt":"2026-01-01T00:00:00Z"}' > .nexus/state/current-session.json

# 버그 수정 → debugger + nonstop 추천
result=$(echo '{"prompt":"이 버그 고쳐줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (bug fix)" 'debugger' "$result"
check "Routing (bug fix workflow)" 'nonstop' "$result"

# 코드 리뷰 → reviewer 추천
result=$(echo '{"prompt":"이 코드 리뷰해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (review)" 'reviewer' "$result"

# 테스트 → tester 추천
result=$(echo '{"prompt":"테스트 추가해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (test)" 'tester' "$result"

# 탐색 → finder 추천
result=$(echo '{"prompt":"이 함수 어디에 있어?"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (search)" 'finder' "$result"

# 대규모 구현 → auto 추천
result=$(echo '{"prompt":"새로운 기능 구현해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (implement)" 'auto' "$result"

# 에이전트 직접 언급 → override
result=$(echo '{"prompt":"Builder으로 이 함수 수정해줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (agent override)" 'builder' "$result"
check "Routing (override format)" 'LATTICE' "$result"

# 명시적 키워드는 라우팅보다 우선 ([nonstop] 태그)
result=$(echo '{"prompt":"[nonstop] 이 버그 고쳐줘"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (keyword priority)" 'nonstop mode ACTIVATED' "$result"

# 매칭 없음 → pass
result=$(echo '{"prompt":"안녕"}' | node scripts/gate.cjs 2>/dev/null)
check "Routing (no match)" '"continue":true' "$result"

# --- 라우팅 히스토리 테스트 ---
echo ""
echo "=== 라우팅 히스토리 ==="

# 히스토리 파일 초기화
rm -f .nexus/routing-history.json

# override 2회 기록 → 히스토리 반영 확인
echo '{"prompt":"Builder으로 이 버그 고쳐줘"}' | node scripts/gate.cjs 2>/dev/null > /dev/null
echo '{"prompt":"Builder으로 이 에러 수정해"}' | node scripts/gate.cjs 2>/dev/null > /dev/null
result=$(echo '{"prompt":"이 버그 고쳐줘"}' | node scripts/gate.cjs 2>/dev/null)
check "History (learned override)" 'builder' "$result"
check "History (hint)" '히스토리' "$result"

rm -f .nexus/routing-history.json

# --- 태스크 자연어 연동 테스트 ---
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

# --- Code Intelligence 테스트 ---
echo ""
echo "=== Code Intelligence ==="

# LSP 테스트 (typescript-language-server 초기화에 시간 소요, 전체 E2E 시간 증가)
if command -v npx &>/dev/null; then
  result=$(mcp_call "nx_lsp_hover" '{"file":"src/shared/session.ts","line":9,"character":17}')
  check "LSP/hover" 'hover' "$result"

  result=$(mcp_call "nx_lsp_goto_definition" '{"file":"src/hooks/gate.ts","line":4,"character":40}')
  check "LSP/goto_definition" 'definitions' "$result"

  result=$(mcp_call "nx_lsp_find_references" '{"file":"src/shared/session.ts","line":9,"character":17}')
  check "LSP/find_references" 'references' "$result"
else
  echo "  (LSP tests skipped: npx not available)"
fi

# AST: search (@ast-grep/napi가 있을 때만)
result=$(mcp_call "nx_ast_search" '{"pattern":"function $NAME($$$) { $$$BODY }","language":"typescript","path":"src/shared"}')
if echo "$result" | sed 's/\\"/"/g' | grep -q '"error".*not installed'; then
  echo "  (ast-grep not installed, skipping all AST tests)"
else
  check "AST/search (TypeScript)" 'matches' "$result"

  # AST: 다언어 — Python
  result=$(mcp_call "nx_ast_search" '{"pattern":"def $NAME($$$):","language":"python","path":"test/fixtures/python"}')
  check "AST/search (Python)" 'matches' "$result"

  # AST: 다언어 — Rust
  result=$(mcp_call "nx_ast_search" '{"pattern":"fn $NAME($$$) -> $RET { $$$BODY }","language":"rust","path":"test/fixtures/rust"}')
  check "AST/search (Rust)" 'matches' "$result"

  # AST: 다언어 — Go
  result=$(mcp_call "nx_ast_search" '{"pattern":"func $NAME($$$) $RET { $$$BODY }","language":"go","path":"test/fixtures/go"}')
  check "AST/search (Go)" 'matches' "$result"

  # AST: replace (dry run)
  result=$(mcp_call "nx_ast_replace" '{"pattern":"def greet($$$):","replacement":"def hello($$$):","language":"python","path":"test/fixtures/python","dryRun":true}')
  check "AST/replace (dryRun)" 'changes' "$result"
fi

# Cleanup
rm -rf .nexus/state/sessions/e2e-hook .nexus/state/current-session.json .nexus/memo/*e2e* 2>/dev/null

# --- 결과 ---
echo ""
echo "=== 결과: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && echo "All tests passed!" || exit 1
