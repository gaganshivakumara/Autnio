#!/usr/bin/env bash
# Autnio Computer Agent — one-shot launcher
# Usage: bash computer-use/start.sh
# Run from anywhere inside the repo.

set -euo pipefail

# ── Resolve repo root & script dir ────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/.venv"
REQUIREMENTS="$SCRIPT_DIR/scripts/requirements.txt"
AGENT="$SCRIPT_DIR/scripts/run-agent.py"

# ── Colors ────────────────────────────────────────────────────────────────────
GRN="\033[0;32m"; YLW="\033[0;33m"; RST="\033[0m"
info()  { echo -e "${GRN}▶${RST} $*"; }
warn()  { echo -e "${YLW}⚠${RST}  $*"; }

# ── Python check ──────────────────────────────────────────────────────────────
PYTHON=""
for cmd in python3 python; do
  if command -v "$cmd" &>/dev/null; then
    ver=$("$cmd" -c 'import sys; print(sys.version_info[:2] >= (3,10))' 2>/dev/null)
    if [[ "$ver" == "True" ]]; then
      PYTHON="$cmd"; break
    fi
  fi
done

if [[ -z "$PYTHON" ]]; then
  echo "ERROR: Python 3.10+ not found. Install it from https://python.org" >&2
  exit 1
fi

# ── Create venv if missing ─────────────────────────────────────────────────────
if [[ ! -f "$VENV/bin/python" ]]; then
  info "Creating virtual environment at $VENV …"
  "$PYTHON" -m venv "$VENV"
fi

VENV_PY="$VENV/bin/python"
VENV_PIP="$VENV/bin/pip"

# ── Install / upgrade dependencies ────────────────────────────────────────────
info "Checking dependencies …"
"$VENV_PIP" install --quiet --upgrade pip
"$VENV_PIP" install --quiet -r "$REQUIREMENTS"
info "Dependencies ready."

# ── macOS permissions reminder ────────────────────────────────────────────────
if [[ "$(uname)" == "Darwin" ]]; then
  warn "macOS: make sure Terminal has the following permissions:"
  warn "  System Settings → Privacy & Security → Screen Recording  (for screenshots)"
  warn "  System Settings → Privacy & Security → Accessibility     (for mouse/keyboard)"
  warn "  System Settings → Privacy & Security → Microphone        (for voice input)"
  echo ""
fi

# ── AWS credentials check ─────────────────────────────────────────────────────
if [[ -z "${AWS_ACCESS_KEY_ID:-}" && ! -f "$HOME/.aws/credentials" ]]; then
  warn "No AWS credentials detected. Set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY"
  warn "or configure a profile in ~/.aws/credentials"
  echo ""
fi

# ── Launch ────────────────────────────────────────────────────────────────────
info "Starting Autnio Computer Agent …"
echo ""
exec "$VENV_PY" "$AGENT" "$@"
