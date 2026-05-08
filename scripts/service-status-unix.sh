#!/usr/bin/env sh
set -eu

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user status opencause-worker
  exit 0
fi

if [ "$(uname -s)" = "Darwin" ] && command -v launchctl >/dev/null 2>&1; then
  launchctl list | grep com.opencause.worker || true
  exit 0
fi

echo "No supported service manager detected."
exit 1
