#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "=== VoiceBridge Launcher ==="

# Kill old processes
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "vite --strictPort" 2>/dev/null || true
pkill -9 -f "app/node_modules/.bin/electron" 2>/dev/null || true
sleep 1

# Start API server
echo "[1/3] Starting API server..."
# Export .env vars so uvicorn sees them regardless of working dir
set -a; source "$ROOT/.env"; set +a
cd "$ROOT/server"
nohup "$ROOT/.venv/bin/python" -m uvicorn main:app \
  --host 127.0.0.1 --port 8000 \
  > /tmp/vb-server.log 2>&1 &
SERVER_PID=$!
disown $SERVER_PID

# Wait for server
for i in $(seq 1 10); do
  sleep 1
  curl -sf http://127.0.0.1:8000/ > /dev/null 2>&1 && break || true
done
echo "    Server PID: $SERVER_PID"

# Start Vite
echo "[2/3] Starting Vite..."
cd "$ROOT/app"
nohup node node_modules/.bin/vite --strictPort \
  > /tmp/vb-vite.log 2>&1 &
VITE_PID=$!
disown $VITE_PID

# Wait for Vite
for i in $(seq 1 10); do
  sleep 1
  curl -sf http://127.0.0.1:5173/ > /dev/null 2>&1 && break || true
done
echo "    Vite PID: $VITE_PID"

# Start Electron
echo "[3/3] Starting Electron..."
nohup node node_modules/.bin/electron . \
  > /tmp/vb-electron.log 2>&1 &
ELECTRON_PID=$!
disown $ELECTRON_PID
echo "    Electron PID: $ELECTRON_PID"

echo ""
echo "=== All services started ==="
echo "  API:      http://127.0.0.1:8000  (log: /tmp/vb-server.log)"
echo "  Vite:     http://127.0.0.1:5173  (log: /tmp/vb-vite.log)"
echo "  Electron: (log: /tmp/vb-electron.log)"
