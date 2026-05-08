#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node 20+ first."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install npm first."
  exit 1
fi

echo "Installing dependencies..."
npm install

echo "Building project..."
npm run build

echo "Running tests..."
npm run test

echo "Installation complete."
echo "Next steps:"
echo "  1) npm run start:web"
echo "  2) npm run demo:seed"
echo "  3) npm run start:worker:loop"
echo ""
echo "Optional persistent service:"
echo "  npm run service:install:unix"
