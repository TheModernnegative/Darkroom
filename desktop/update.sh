#!/usr/bin/env bash
# Splat Darkroom updater. Pulls the latest desktop build from GitHub (TheModernnegative/Darkroom, desktop/).
#   bash update.sh check   → prints  UP_TO_DATE <v>  or  AVAILABLE <local> <remote>
#   bash update.sh apply   → installs it; prints REBUILD if the native shell changed, then UPDATED <v>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="TheModernnegative/Darkroom"; BR="main"
MODE="${1:-check}"
LOCAL="$(cat "$HERE/VERSION" 2>/dev/null || echo 0)"
REMOTE="$(curl -fsSL "https://raw.githubusercontent.com/$REPO/$BR/desktop/VERSION?$(date +%s)" | tr -d '[:space:]')" || { echo "ERROR could not reach GitHub"; exit 2; }
if [[ "$MODE" == check ]]; then
  if [[ "$REMOTE" == "$LOCAL" ]]; then echo "UP_TO_DATE $LOCAL"; else echo "AVAILABLE $LOCAL $REMOTE"; fi
  exit 0
fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "Downloading $REMOTE…"
curl -fsSL "https://codeload.github.com/$REPO/tar.gz/refs/heads/$BR" -o "$TMP/src.tgz"
tar xzf "$TMP/src.tgz" -C "$TMP"
SRC="$(ls -d "$TMP"/*/desktop | head -1)"
[[ -d "$SRC/app" ]] || { echo "ERROR bad download"; exit 3; }
sum(){ shasum "$1" 2>/dev/null | cut -c1-40 || true; }
OLD_SWIFT="$(sum "$HERE/mac/main.swift")"
cp -R "$SRC/app/." "$HERE/app/"
mkdir -p "$HERE/mac"; cp -R "$SRC/mac/." "$HERE/mac/"
cp "$SRC/install.sh" "$HERE/install.sh" 2>/dev/null || true
cp "$SRC/update.sh" "$HERE/update.sh.new" && mv "$HERE/update.sh.new" "$HERE/update.sh"
# splat.sh must not be overwritten while a scan is building (bash reads it as it runs)
if pgrep -f "Splat/splat.sh" >/dev/null 2>&1; then cp "$SRC/splat.sh" "$HERE/.update/splat.sh.next" 2>/dev/null || { mkdir -p "$HERE/.update"; cp "$SRC/splat.sh" "$HERE/.update/splat.sh.next"; }; echo "NOTE scan running — new splat.sh queued"
else cp "$SRC/splat.sh" "$HERE/splat.sh.new" && mv "$HERE/splat.sh.new" "$HERE/splat.sh"; fi
echo "$REMOTE" > "$HERE/VERSION"
if [[ "$OLD_SWIFT" != "$(sum "$HERE/mac/main.swift")" ]]; then
  echo "REBUILD"
  bash "$HERE/mac/build_app.sh" --no-open || { echo "ERROR rebuild failed"; exit 4; }
fi
echo "UPDATED $REMOTE"
