#!/usr/bin/env bash
# start-demo.sh — starts the OI server and web demo in one command
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}"

# ── Colours ──────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${CYAN}[autnio]${NC} $*"; }
ok()   { echo -e "${GREEN}[autnio]${NC} $*"; }
warn() { echo -e "${YELLOW}[autnio]${NC} $*"; }
err()  { echo -e "${RED}[autnio]${NC} $*"; }

# ── Cleanup on exit ───────────────────────────────────────────────────────
OI_PID=""
VITE_PID=""
cleanup() {
  echo ""
  log "Shutting down…"
  [[ -n "${OI_PID}" ]]   && kill "${OI_PID}"   2>/dev/null || true
  [[ -n "${VITE_PID}" ]] && kill "${VITE_PID}" 2>/dev/null || true
  ok "Done."
}
trap cleanup EXIT INT TERM

# ── Activate Python venv ──────────────────────────────────────────────────
VENV_DIR="${PROJECT_ROOT}/.venv"
if [[ ! -d "${VENV_DIR}" ]]; then
  err "No .venv found at ${VENV_DIR}"
  err "Run: python3.12 -m venv .venv && source .venv/bin/activate && pip install open-interpreter[server] setuptools boto3"
  exit 1
fi

log "Activating Python venv…"
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

# ── AWS credentials ───────────────────────────────────────────────────────
export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-AKIA2FO3A4DMIEIHDECX}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-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}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

# ── Check interpreter is available ───────────────────────────────────────
if ! command -v interpreter >/dev/null 2>&1; then
  err "Open Interpreter not found in venv."
  err "Run: pip install open-interpreter[server] setuptools boto3"
  exit 1
fi

# ── Start Open Interpreter server ────────────────────────────────────────
OI_PROFILE="${PROJECT_ROOT}/computer-use/interpreter/default.yaml"
if [[ ! -f "${OI_PROFILE}" ]]; then
  err "OI profile not found: ${OI_PROFILE}"
  exit 1
fi

log "Starting Open Interpreter server (port 8000)…"
interpreter --server --profile "${OI_PROFILE}" \
  > /tmp/autnio-oi.log 2>&1 &
OI_PID=$!

# Wait for OI to be ready
log "Waiting for OI server to come up…"
for i in $(seq 1 30); do
  if curl -sf -o /dev/null -X OPTIONS http://localhost:8000/openai/chat/completions 2>/dev/null; then
    ok "Open Interpreter is ready at http://localhost:8000"
    break
  fi
  if ! kill -0 "${OI_PID}" 2>/dev/null; then
    err "OI process died. Last output:"
    tail -20 /tmp/autnio-oi.log
    exit 1
  fi
  sleep 1
done

# ── Install web-demo deps if needed ──────────────────────────────────────
WEB_DEMO_DIR="${PROJECT_ROOT}/computer-use/web-demo"
if [[ ! -d "${WEB_DEMO_DIR}/node_modules" ]]; then
  log "Installing web-demo dependencies…"
  npm install --prefix "${WEB_DEMO_DIR}" --silent
fi

# ── Start Vite dev server ─────────────────────────────────────────────────
log "Starting web demo (Vite)…"
npm run dev --prefix "${WEB_DEMO_DIR}" \
  > /tmp/autnio-vite.log 2>&1 &
VITE_PID=$!

# Wait for Vite to be ready
log "Waiting for Vite to come up…"
for i in $(seq 1 20); do
  if curl -sf -o /dev/null http://localhost:5174 2>/dev/null; then
    ok "Web demo is ready at http://localhost:5174"
    break
  fi
  if ! kill -0 "${VITE_PID}" 2>/dev/null; then
    err "Vite process died. Last output:"
    tail -20 /tmp/autnio-vite.log
    exit 1
  fi
  sleep 1
done

# ── Open browser ─────────────────────────────────────────────────────────
if command -v open >/dev/null 2>&1; then
  open http://localhost:5174
fi

echo ""
ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "  Autnio demo is running"
ok "  Web UI:  http://localhost:5174"
ok "  OI API:  http://localhost:8000"
ok "  Logs:    /tmp/autnio-oi.log"
ok "           /tmp/autnio-vite.log"
ok "  Press Ctrl+C to stop"
ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Keep alive ────────────────────────────────────────────────────────────
wait "${OI_PID}" "${VITE_PID}"
