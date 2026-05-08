#!/usr/bin/env sh
set -eu

SERVICE_NAME="opencause-worker"

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now "$SERVICE_NAME" >/dev/null 2>&1 || true
  rm -f "$HOME/.config/systemd/user/${SERVICE_NAME}.service"
  systemctl --user daemon-reload
  echo "Removed systemd user service: $SERVICE_NAME"
  exit 0
fi

if [ "$(uname -s)" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
  PLIST_PATH="$HOME/Library/LaunchAgents/com.opencause.worker.plist"
  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
  rm -f "$PLIST_PATH"
  echo "Removed launchd agent: com.opencause.worker"
  exit 0
fi

echo "No supported service manager detected."
exit 1
