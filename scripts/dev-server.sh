#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/server"

# Merge root API keys into server env
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

export DEV_UNLIMITED_TRIAL="${DEV_UNLIMITED_TRIAL:-true}"
export DEV_SKIP_LICENSE_VERIFY="${DEV_SKIP_LICENSE_VERIFY:-true}"

echo "→ VoiceBridge dev API http://127.0.0.1:8000 (trial bypass ON)"
exec python3 -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
