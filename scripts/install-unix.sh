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

if ! command -v ollama >/dev/null 2>&1; then
  echo "ollama is required for Local LLM v1 extraction. Install ollama first."
  exit 1
fi

echo "Installing dependencies..."
npm install

echo "Building project..."
npm run build

echo "Running tests..."
npm run test

echo "Ensuring local model is available..."
ollama pull "${LOCAL_LLM_MODEL:-llama3.2:3b}"

echo "Installation complete."
echo "Next steps:"
echo "  1) npm run start:web"
echo "  2) npm run demo:seed"
echo "  3) npm run start:worker:loop"
echo ""
echo "Optional persistent service:"
echo "  npm run service:install:unix"
