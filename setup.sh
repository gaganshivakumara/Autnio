#!/usr/bin/env bash
# setup.sh — one-shot local dev environment bootstrap for Autnio
# Run once after cloning: bash setup.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${CYAN}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[setup]${NC} $*"; }
err()  { echo -e "${RED}[setup]${NC} $*"; exit 1; }
step() { echo -e "\n${CYAN}━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── 1. Python 3.12 ────────────────────────────────────────────────────────────
step "1/6  Python 3.12"

PY=""
for candidate in python3.12 python3 python; do
  if command -v "$candidate" &>/dev/null; then
    version=$("$candidate" -c 'import sys; print(sys.version_info[:2])')
    if [[ "$version" == "(3, 12)" ]]; then
      PY="$candidate"; break
    fi
  fi
done

if [[ -z "$PY" ]]; then
  warn "Python 3.12 not found. Attempting to install via Homebrew…"
  if command -v brew &>/dev/null; then
    brew install python@3.12
    PY="python3.12"
  else
    err "Python 3.12 not found and Homebrew is not available.
Install Python 3.12 from https://www.python.org/downloads/ then re-run this script."
  fi
fi

ok "Using $PY  ($($PY --version))"

# ── 2. Python venv ────────────────────────────────────────────────────────────
step "2/6  Python virtual environment (.venv)"

VENV_DIR="${SCRIPT_DIR}/.venv"
if [[ -d "${VENV_DIR}" ]]; then
  warn ".venv already exists — skipping creation (delete it first to force a rebuild)"
else
  log "Creating .venv with ${PY}…"
  "${PY}" -m venv "${VENV_DIR}"
  ok ".venv created"
fi

# Activate
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"
ok "venv activated  ($(python --version))"

# Upgrade pip silently
pip install --upgrade pip --quiet

log "Installing Python dependencies…"
pip install \
  "open-interpreter[server]" \
  setuptools \
  boto3 \
  "Pillow>=10.0.0" \
  "amazon-transcribe>=0.6.4" \
  "websockets>=12,<13" \
  --quiet

ok "Python dependencies installed"

# Quick smoke check
python -c "
import boto3, PIL, amazon_transcribe, websockets
print('  boto3, Pillow, amazon-transcribe, websockets — OK')
"
interpreter --version | sed 's/^/  OI: /'

# ── 3. AWS credentials ────────────────────────────────────────────────────────
step "3/6  AWS credentials"

AWS_CONFIGURED=false
if aws sts get-caller-identity --region us-east-1 &>/dev/null 2>&1; then
  ACCOUNT=$(aws sts get-caller-identity --region us-east-1 --query 'Account' --output text 2>/dev/null)
  ok "AWS already configured  (account: ${ACCOUNT})"
  AWS_CONFIGURED=true
fi

if [[ "${AWS_CONFIGURED}" == "false" ]]; then
  warn "AWS credentials not found."
  echo ""
  echo "  Enter your AWS credentials (ask the team lead for the keys):"
  echo "  Leave region blank to use the default: us-east-1"
  echo ""
  aws configure
  if aws sts get-caller-identity --region us-east-1 &>/dev/null 2>&1; then
    ok "AWS credentials configured"
  else
    warn "AWS credential check failed — you can still run the app locally but API calls may not work."
  fi
fi

# ── 4. Bedrock Mantle API key (OI config) ─────────────────────────────────────
step "4/6  Open Interpreter / Bedrock config"

OI_CONFIG="${SCRIPT_DIR}/interpreter/default.yaml"
if grep -q "REPLACE_WITH_BEDROCK_API_KEY" "${OI_CONFIG}" 2>/dev/null; then
  warn "interpreter/default.yaml still has the placeholder API key."
  echo ""
  echo "  Open Interpreter is configured to use Bedrock Mantle"
  echo "  (https://bedrock-mantle.us-east-1.api.aws) which requires a separate key."
  echo ""
  read -rp "  Paste your Bedrock Mantle API key (or press Enter to skip): " BEDROCK_KEY
  if [[ -n "${BEDROCK_KEY}" ]]; then
    # Use sed to replace the placeholder
    sed -i.bak "s|REPLACE_WITH_BEDROCK_API_KEY|${BEDROCK_KEY}|g" "${OI_CONFIG}"
    rm -f "${OI_CONFIG}.bak"
    ok "Bedrock API key written to interpreter/default.yaml"
  else
    warn "Skipped — OI relay will not work until you add the key to interpreter/default.yaml"
  fi
else
  ok "interpreter/default.yaml already configured"
fi

# ── 5. Node.js deps ───────────────────────────────────────────────────────────
step "5/6  Node.js dependencies"

if ! command -v node &>/dev/null; then
  err "Node.js not found. Install Node.js 18+ from https://nodejs.org then re-run this script."
fi
ok "Node $(node --version)"

# Web app
log "Installing web app dependencies…"
npm install --prefix "${SCRIPT_DIR}/web" --silent
ok "web/ dependencies installed"

# computer-use web-demo
if [[ -f "${SCRIPT_DIR}/computer-use/web-demo/package.json" ]]; then
  log "Installing computer-use/web-demo dependencies…"
  npm install --prefix "${SCRIPT_DIR}/computer-use/web-demo" --silent
  ok "computer-use/web-demo dependencies installed"
fi

# infra (CDK) — only if needed
if [[ -f "${SCRIPT_DIR}/infra/package.json" ]]; then
  log "Installing CDK infra dependencies…"
  npm install --prefix "${SCRIPT_DIR}/infra" --silent
  ok "infra/ dependencies installed"
fi

# ── 6. Web app env file ───────────────────────────────────────────────────────
step "6/6  Web app environment"

cp "${SCRIPT_DIR}/web/.env.example" "${SCRIPT_DIR}/web/.env"
ok "Copied web/.env.example → web/.env"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ok "  Setup complete!"
ok ""
ok "  Start the local OI relay + web demo:"
ok "    ./start-demo.sh"
ok ""
ok "  Or run just the web app (deployed at CloudFront):"
ok "    cd web && npm run dev"
ok ""
ok "  Live URL:  https://d31acxjmxxrvao.cloudfront.net"
ok "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
