#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "This bootstrap script is for macOS only."
  exit 1
fi

echo "==> macOS Computer Use bootstrap"

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install from https://brew.sh and rerun."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Installing python..."
  brew install python
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Installing node..."
  brew install node
fi

if ! python3 -m pip show open-interpreter >/dev/null 2>&1; then
  echo "Installing open-interpreter..."
  python3 -m pip install --user open-interpreter
fi

echo "Installing web-demo dependencies..."
npm install --prefix "${PROJECT_ROOT}/web-demo"

echo "Installing infra dependencies..."
npm install --prefix "${PROJECT_ROOT}/infra"

echo ""
echo "Bootstrap complete."
echo "Next steps:"
echo "  1) Edit ${PROJECT_ROOT}/interpreter/default.yaml with real Bedrock key/model."
echo "  2) Start OI: ${PROJECT_ROOT}/scripts/start-oi.sh"
echo "  3) Run demo: npm run dev --prefix ${PROJECT_ROOT}/web-demo"
echo ""
echo "macOS permissions required:"
echo "  - System Settings -> Privacy & Security -> Accessibility"
echo "  - System Settings -> Privacy & Security -> Automation"
echo "Grant Terminal (or your app) access for desktop automation workflows."
