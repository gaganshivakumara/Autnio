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

export AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-AKIA2FO3A4DMIEIHDECX}"
export AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-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}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-us-east-1}"

echo "Starting Open Interpreter server on http://localhost:8000"
echo "Using profile: ${PROFILE_PATH}"

interpreter --server --profile "${PROFILE_PATH}"
