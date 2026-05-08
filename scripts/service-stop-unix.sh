#!/usr/bin/env sh
set -eu

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user stop opencause-worker
  echo "Stopped systemd user service opencause-worker"
  exit 0
fi

if [ "$(uname -s)" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
  launchctl unload "$HOME/Library/LaunchAgents/com.opencause.worker.plist"
  echo "Stopped launchd agent com.opencause.worker"
  exit 0
fi

echo "No supported service manager detected."
exit 1
