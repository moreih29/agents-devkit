#!/bin/bash
# Lattice 성능 벤치마크
# 훅 실행 시간 + Pulse 주입 효율 측정

set -e
cd "$(dirname "$0")/.."

ITERATIONS=10
GATE="scripts/gate.cjs"
PULSE="scripts/pulse.cjs"
TRACKER="scripts/tracker.cjs"
MCP="bridge/mcp-server.cjs"

echo "=== Lattice Performance Benchmark ==="
echo "Iterations: $ITERATIONS"
echo ""

# --- 유틸리티 ---

# 밀리초 단위 실행 시간 측정 (macOS date 호환)
measure_ms() {
  local cmd="$1"
  local start end
  start=$(python3 -c 'import time; print(int(time.time()*1000))')
  eval "$cmd" > /dev/null 2>&1
  end=$(python3 -c 'import time; print(int(time.time()*1000))')
  echo $((end - start))
}

avg() {
  local sum=0 count=0
  for v in "$@"; do
    sum=$((sum + v))
    count=$((count + 1))
  done
  echo $((sum / count))
}

# --- 1. 훅 실행 시간 ---
echo "=== 1. 훅 실행 시간 (ms) ==="

# Gate/Stop (워크플로우 비활성)
times=()
for i in $(seq 1 $ITERATIONS); do
  t=$(measure_ms "echo '{\"hook_event_name\":\"Stop\"}' | node $GATE")
  times+=("$t")
done
echo "Gate/Stop (no workflow):     avg $(avg "${times[@]}")ms  [${times[*]}]"

# Gate/UserPromptSubmit (라우팅)
times=()
for i in $(seq 1 $ITERATIONS); do
  t=$(measure_ms "echo '{\"prompt\":\"이 버그 고쳐줘\"}' | node $GATE")
  times+=("$t")
done
echo "Gate/Submit (routing):       avg $(avg "${times[@]}")ms  [${times[*]}]"

# Pulse/PreToolUse (fast path — 세션 디렉토리 없음)
rm -rf .lattice/state/sessions/bench-perf 2>/dev/null
echo '{"sessionId":"bench-perf","createdAt":"2026-01-01T00:00:00Z"}' > .lattice/state/current-session.json
times=()
for i in $(seq 1 $ITERATIONS); do
  t=$(measure_ms "echo '{\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\"}' | node $PULSE")
  times+=("$t")
done
echo "Pulse/PreToolUse (fast):     avg $(avg "${times[@]}")ms  [${times[*]}]"

# Pulse/PreToolUse (워크플로우 활성)
mkdir -p .lattice/state/sessions/bench-perf
echo '{"active":true,"maxIterations":100,"currentIteration":5}' > .lattice/state/sessions/bench-perf/sustain.json
times=()
for i in $(seq 1 $ITERATIONS); do
  t=$(measure_ms "echo '{\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\"}' | node $PULSE")
  times+=("$t")
done
echo "Pulse/PreToolUse (workflow): avg $(avg "${times[@]}")ms  [${times[*]}]"

# Tracker/SessionStart
times=()
for i in $(seq 1 $ITERATIONS); do
  t=$(measure_ms "echo '{\"hook_event_name\":\"SessionStart\"}' | node $TRACKER")
  times+=("$t")
done
echo "Tracker/SessionStart:        avg $(avg "${times[@]}")ms  [${times[*]}]"

# --- 2. Pulse 주입 효율 ---
echo ""
echo "=== 2. Pulse 주입 효율 ==="

# 20번 연속 호출 시 실제 주입 횟수 측정
rm -rf .lattice/state/sessions/bench-inject
mkdir -p .lattice/state/sessions/bench-inject
echo '{"sessionId":"bench-inject","createdAt":"2026-01-01T00:00:00Z"}' > .lattice/state/current-session.json
echo '{"active":true,"maxIterations":100,"currentIteration":5}' > .lattice/state/sessions/bench-inject/sustain.json

injected=0
passed=0
for i in $(seq 1 20); do
  result=$(echo '{"hook_event_name":"PreToolUse","tool_name":"Bash"}' | node $PULSE 2>/dev/null)
  if echo "$result" | grep -q 'additionalContext'; then
    injected=$((injected + 1))
  else
    passed=$((passed + 1))
  fi
done

echo "20 Pulse 호출 → 주입: ${injected}, 스킵: ${passed}"

# tracker 상태 확인
if [ -f .lattice/state/sessions/bench-inject/whisper-tracker.json ]; then
  toolCallCount=$(cat .lattice/state/sessions/bench-inject/whisper-tracker.json | python3 -c "import sys,json; print(json.load(sys.stdin).get('toolCallCount',0))")
  echo "whisper-tracker toolCallCount: $toolCallCount"
fi

# --- 3. MCP 도구 응답 시간 ---
echo ""
echo "=== 3. MCP 도구 응답 시간 (ms) ==="

mcp_call() {
  local method="$1" params="$2"
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"bench","version":"0.1.0"}}}'
  local initialized='{"jsonrpc":"2.0","method":"notifications/initialized"}'
  local call="{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$method\",\"arguments\":$params}}"
  echo -e "$init\n$initialized\n$call" | node "$MCP" 2>/dev/null | tail -1
}

# lat_state_write + read + clear
times=()
for i in $(seq 1 5); do
  t=$(measure_ms "mcp_call lat_state_write '{\"key\":\"bench\",\"value\":{\"x\":1},\"sessionId\":\"bench\"}'")
  times+=("$t")
done
echo "lat_state_write:             avg $(avg "${times[@]}")ms  [${times[*]}]"

times=()
for i in $(seq 1 5); do
  t=$(measure_ms "mcp_call lat_state_read '{\"key\":\"bench\",\"sessionId\":\"bench\"}'")
  times+=("$t")
done
echo "lat_state_read:              avg $(avg "${times[@]}")ms  [${times[*]}]"

# lat_knowledge_read (캐시 효과 측정: 첫 호출 vs 반복)
t1=$(measure_ms "mcp_call lat_knowledge_read '{\"topic\":\"architecture\"}'")
echo "lat_knowledge_read (cold):   ${t1}ms"

# 반복은 별도 프로세스이므로 프로세스 레벨 캐시는 효과 없음
# MCP 서버가 long-lived일 때만 캐시 효과 발생 (실사용 환경)
echo "(참고: 벤치마크는 매번 새 프로세스. 실사용 시 MCP 서버가 상주하므로 캐시 효과 있음)"

# --- Cleanup ---
rm -rf .lattice/state/sessions/bench-perf .lattice/state/sessions/bench-inject .lattice/state/sessions/bench 2>/dev/null

echo ""
echo "=== Benchmark Complete ==="
