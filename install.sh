#!/usr/bin/env bash
# One-command installer for Androg. Sets up the app only — your OpenRouter API key is
# never handled by this script; you paste your own into the web UI's setup screen on
# first run, so nobody's key ever ends up hardcoded or committed anywhere.
set -euo pipefail

REPO_URL="https://github.com/Emmagit999/Auto-assistance-.git"
INSTALL_DIR="${ANDROG_DIR:-$HOME/androg}"

echo "==> Androg installer"

if command -v pkg >/dev/null 2>&1; then
  echo "==> Detected Termux, installing system packages..."
  pkg update -y && pkg upgrade -y
  pkg install -y nodejs git clang
elif command -v apt-get >/dev/null 2>&1; then
  echo "==> Detected Debian/Ubuntu, installing system packages (sudo may prompt)..."
  sudo apt-get update -y
  sudo apt-get install -y nodejs npm git clang
else
  echo "No supported package manager (pkg/apt-get) found. Install Node.js 18+ and git manually, then re-run this script." >&2
  exit 1
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "==> Existing install found at $INSTALL_DIR, pulling latest..."
  git -C "$INSTALL_DIR" pull
else
  echo "==> Cloning Androg into $INSTALL_DIR..."
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
npm install

[ -f .env ] || cp .env.example .env

echo
echo "==> Setup complete."
echo "1. Start it:  cd $INSTALL_DIR && npm start"
echo "2. Open the web UI it prints (default http://localhost:3000) and paste a free"
echo "   OpenRouter key from https://openrouter.ai/keys into the setup screen."
echo "3. Scan the WhatsApp QR code that prints in the terminal (Linked Devices) to link WhatsApp."
