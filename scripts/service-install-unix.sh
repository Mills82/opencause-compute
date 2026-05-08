#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SERVICE_NAME="opencause-worker"
COORDINATOR_URL="${COORDINATOR_URL:-http://localhost:3000}"
WORKER_INTERVAL_MS="${WORKER_INTERVAL_MS:-5000}"

if command -v systemctl >/dev/null 2>&1; then
  UNIT_DIR="$HOME/.config/systemd/user"
  UNIT_PATH="$UNIT_DIR/${SERVICE_NAME}.service"
  mkdir -p "$UNIT_DIR"

  cat > "$UNIT_PATH" <<UNIT
[Unit]
Description=OpenCause Compute Worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
Environment=COORDINATOR_URL=$COORDINATOR_URL
Environment=WORKER_INTERVAL_MS=$WORKER_INTERVAL_MS
ExecStart=/usr/bin/env npm run start -w @opencause/worker -- loop --server $COORDINATOR_URL --interval-ms $WORKER_INTERVAL_MS
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT

  systemctl --user daemon-reload
  systemctl --user enable --now "$SERVICE_NAME"
  echo "Installed and started systemd user service: $SERVICE_NAME"
  echo "Status: systemctl --user status $SERVICE_NAME"
  exit 0
fi

if [ "$(uname -s)" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
  PLIST_DIR="$HOME/Library/LaunchAgents"
  PLIST_PATH="$PLIST_DIR/com.opencause.worker.plist"
  mkdir -p "$PLIST_DIR"

  cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.opencause.worker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd '$ROOT_DIR' && COORDINATOR_URL='$COORDINATOR_URL' WORKER_INTERVAL_MS='$WORKER_INTERVAL_MS' npm run start -w @opencause/worker -- loop --server '$COORDINATOR_URL' --interval-ms '$WORKER_INTERVAL_MS'</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$HOME/.opencause-compute/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>$HOME/.opencause-compute/launchd.err.log</string>
</dict>
</plist>
PLIST

  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
  launchctl load "$PLIST_PATH"
  echo "Installed and started launchd agent: com.opencause.worker"
  echo "Status: launchctl list | grep com.opencause.worker"
  exit 0
fi

echo "No supported service manager detected (systemd user or launchd)."
exit 1
