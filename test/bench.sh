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

# --- 2. MCP 도구 응답 시간 ---
echo ""
echo "=== 2. MCP 도구 응답 시간 (ms) ==="

mcp_call() {
  local method="$1" params="$2"
  local init='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"bench","version":"0.1.0"}}}'
  local initialized='{"jsonrpc":"2.0","method":"notifications/initialized"}'
  local call="{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$method\",\"arguments\":$params}}"
  echo -e "$init\n$initialized\n$call" | node "$MCP" 2>/dev/null | tail -1
}

t1=$(measure_ms "mcp_call nx_core_read '{\"layer\":\"codebase\",\"topic\":\"architecture\"}'")
echo "nx_core_read (cold):        ${t1}ms"
echo "(참고: 벤치마크는 매번 새 프로세스. 실사용 시 MCP 서버 상주로 캐시 효과 있음)"

echo ""
echo "=== Benchmark Complete ==="
