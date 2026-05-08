#!/usr/bin/env sh
set -eu

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user start opencause-worker
  echo "Started systemd user service opencause-worker"
  exit 0
fi

if [ "$(uname -s)" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
  launchctl load "$HOME/Library/LaunchAgents/com.opencause.worker.plist"
  echo "Started launchd agent com.opencause.worker"
  exit 0
fi

echo "No supported service manager detected."
exit 1
