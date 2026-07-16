#!/usr/bin/env bash
# One-command installer for Androg. Sets up the app only — your OpenRouter API key is
# never handled by this script; you paste your own into the web UI's setup screen on
# first run, so nobody's key ever ends up hardcoded or committed anywhere.
set -euo pipefail

REPO_URL="https://github.com/Emmagit999/Auto-assistance-.git"
INSTALL_DIR="${ANDROG_DIR:-$HOME/androg}"

echo "==> Androg installer"

# Never let apt/dpkg stop to ask about modified config files (sources.list, bash.bashrc,
# etc.) when this script is piped through `curl | bash` — stdin isn't a terminal there,
# so a prompt means an instant "end of file on stdin" failure instead of an upgrade.
export DEBIAN_FRONTEND=noninteractive
CONF_FLAGS=(-o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)

if command -v pkg >/dev/null 2>&1; then
  echo "==> Detected Termux, installing system packages..."
  # Self-heal from a previous interrupted run (e.g. a conffile prompt that got EOF'd and
  # left dpkg mid-configure) before doing anything else.
  dpkg --configure -a "${CONF_FLAGS[@]}" 2>/dev/null || true
  # `pkg update` refreshes package lists (rarely prompts); we deliberately skip a full
  # `pkg upgrade` of every installed package since that's what touches already-customized
  # conffiles like bash.bashrc and is what breaks non-interactively. Installing/upgrading
  # just the 3 packages we need is enough and far less likely to hit a conffile conflict.
  pkg update -y
  pkg install -y "${CONF_FLAGS[@]}" nodejs git clang
elif command -v apt-get >/dev/null 2>&1; then
  echo "==> Detected Debian/Ubuntu, installing system packages (sudo may prompt for your password)..."
  sudo -E apt-get update -y
  sudo -E apt-get install -y "${CONF_FLAGS[@]}" nodejs npm git clang
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
