#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLIST_PATH="${HOME}/Library/LaunchAgents/com.autnio.computeruse.oi.plist"

if [[ "${OSTYPE:-}" != darwin* ]]; then
  echo "launchd setup is macOS-only."
  exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents"

cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.autnio.computeruse.oi</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PROJECT_ROOT}/scripts/start-oi.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${PROJECT_ROOT}/scripts/launchd-oi.out.log</string>
  <key>StandardErrorPath</key>
  <string>${PROJECT_ROOT}/scripts/launchd-oi.err.log</string>
</dict>
</plist>
EOF

launchctl unload "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl load "${PLIST_PATH}"

echo "Installed and loaded launchd agent:"
echo "  ${PLIST_PATH}"
echo ""
echo "Useful commands:"
echo "  launchctl kickstart -k gui/\$(id -u)/com.autnio.computeruse.oi"
echo "  launchctl unload ${PLIST_PATH}"
