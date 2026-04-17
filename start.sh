#!/bin/bash

set -euo pipefail

FRONTEND_PORT=3000
BACKEND_PORT=4000
BACKEND_LOG_FILE="backend.log"
BACKEND_PID_FILE="backend.pid"

cleanup_port() {
  local port="$1"
  local -a pids=()
  local pid

  while IFS= read -r pid; do
    [ -n "$pid" ] && pids+=("$pid")
  done < <(lsof -t -iTCP:"$port" -sTCP:LISTEN || true)

  if [ "${#pids[@]}" -eq 0 ]; then
    echo "==> Port $port is free."
    return 0
  fi

  echo "==> Port $port is occupied by process(es): ${pids[*]}"

  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      continue
    fi

    echo "==> Stopping process $pid on port $port..."
    if ! kill "$pid" >/dev/null 2>&1; then
      echo "==> Failed to stop process $pid on port $port."
      echo "==> Please stop it manually and rerun ./start.sh"
      return 1
    fi
  done

  sleep 1

  local -a remaining_pids=()
  while IFS= read -r pid; do
    [ -n "$pid" ] && remaining_pids+=("$pid")
  done < <(lsof -t -iTCP:"$port" -sTCP:LISTEN || true)

  if [ "${#remaining_pids[@]}" -gt 0 ]; then
    echo "==> Port $port is still occupied by process(es): ${remaining_pids[*]}"
    echo "==> Please stop them manually and rerun ./start.sh"
    return 1
  fi
}

cleanup() {
  if [ -f "$BACKEND_PID_FILE" ]; then
    local backend_pid
    backend_pid=$(cat "$BACKEND_PID_FILE")
    if kill -0 "$backend_pid" >/dev/null 2>&1; then
      echo
      echo "==> Stopping backend process $backend_pid..."
      kill "$backend_pid" || true
      wait "$backend_pid" 2>/dev/null || true
    fi
    rm -f "$BACKEND_PID_FILE"
  fi
}

trap cleanup EXIT INT TERM

echo "---------------------------------------"
echo "Starting Claude Trace Replay dev stack..."
echo "---------------------------------------"

echo "==> Checking frontend port $FRONTEND_PORT..."
cleanup_port "$FRONTEND_PORT"

echo "==> Checking backend port $BACKEND_PORT..."
cleanup_port "$BACKEND_PORT"

echo "==> Starting backend in the background..."
nohup node server.cjs > "$BACKEND_LOG_FILE" 2>&1 &
echo $! > "$BACKEND_PID_FILE"
sleep 1

echo "==> Backend started. PID: $(cat "$BACKEND_PID_FILE")"
echo "==> Backend log: $BACKEND_LOG_FILE"
echo "==> Backend service: http://localhost:$BACKEND_PORT"
echo "==> Backend health check: http://localhost:$BACKEND_PORT/health"
echo "==> Starting frontend in the foreground..."
echo "==> Open this app in your browser: http://localhost:$FRONTEND_PORT"
echo

npm run dev
