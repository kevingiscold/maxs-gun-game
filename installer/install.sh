#!/bin/bash
# Max's Gun Game — macOS installer.
#   curl -fsSL https://github.com/__REPO__/releases/latest/download/install.sh | bash
# Downloads the app for this Mac's chip, puts it in Applications and opens it.
# (Files fetched with curl carry no quarantine flag, so macOS doesn't block the
# unsigned app the way it does a browser download.)
set -euo pipefail
REPO="__REPO__"

if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then ARCH=arm64; else ARCH=x64; fi
URL="https://github.com/$REPO/releases/latest/download/MaxsGunGame-mac-$ARCH.zip"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading Max's Gun Game ($ARCH)..."
curl -fL --progress-bar "$URL" -o "$TMP/game.zip"
ditto -x -k "$TMP/game.zip" "$TMP/x"

DEST=/Applications
if [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi
APP="$DEST/Maxs Gun Game.app"
pkill -f "Maxs Gun Game.app/Contents/MacOS" 2>/dev/null || true
rm -rf "$APP"
ditto "$TMP/x/Maxs Gun Game.app" "$APP"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo "Installed to $APP"
echo "Opening it now. Next time, find \"Maxs Gun Game\" in Launchpad or Applications."
open "$APP"
