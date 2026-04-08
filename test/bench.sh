#!/bin/bash
# Nexus 성능 벤치마크
# 훅 실행 시간 측정

set -e
cd "$(dirname "$0")/.."

ITERATIONS=10
GATE="scripts/gate.cjs"
MCP="bridge/mcp-server.cjs"

# --- 유틸리티 ---

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

echo "=== Nexus Performance Benchmark ==="
echo "Iterations: $ITERATIONS"
echo ""

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

echo ""
echo "=== Benchmark Complete ==="
