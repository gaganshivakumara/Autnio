#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROFILE_PATH="${PROJECT_ROOT}/interpreter/default.yaml"

if ! command -v interpreter >/dev/null 2>&1; then
  echo "Open Interpreter CLI not found. Install with: pip install open-interpreter"
  exit 1
fi

if [[ ! -f "${PROFILE_PATH}" ]]; then
  echo "Profile not found at ${PROFILE_PATH}"
  exit 1
fi

echo "Starting Open Interpreter server on http://localhost:8000"
echo "Using profile: ${PROFILE_PATH}"

interpreter --server --profile "${PROFILE_PATH}"
