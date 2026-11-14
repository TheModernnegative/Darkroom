#!/usr/bin/env bash
# Splat toolkit installer for Apple Silicon Macs.
# Run in Terminal:   bash ~/Documents/Splat/install.sh
# Installs: Homebrew (if missing) → ffmpeg + COLMAP → Brush (splat trainer, into ./bin)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="$HERE/bin"; mkdir -p "$BIN" "$HERE/captures" "$HERE/scans"
say(){ printf "\n\033[1;31m▸\033[0m \033[1m%s\033[0m\n" "$*"; }

[[ "$(uname -m)" == arm64 ]] || echo "⚠ This Mac isn't Apple Silicon — training will be very slow."

# ---------------------------------------------------------------- Homebrew
if ! command -v brew >/dev/null 2>&1; then
  [[ -x /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv)"
fi
if ! command -v brew >/dev/null 2>&1; then
  say "Installing Homebrew (it will ask for your Mac password)"
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
  grep -q 'brew shellenv' ~/.zprofile 2>/dev/null || echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
fi

# ---------------------------------------------------------------- ffmpeg + COLMAP
say "Installing ffmpeg and COLMAP"
brew install ffmpeg colmap

# ---------------------------------------------------------------- Brush
# NOTE: `brew install brush` is a DIFFERENT program (a shell). Brush the splat trainer
# comes from github.com/ArthurBrussee/brush releases — fetched here.
if [[ -x "$BIN/brush" ]]; then
  say "Brush already installed ($BIN/brush)"
else
  say "Downloading Brush (Gaussian splat trainer)"
  JSON="$(curl -fsSL https://api.github.com/repos/ArthurBrussee/brush/releases/latest)"
  URL="$(printf '%s' "$JSON" | /usr/bin/python3 -c '
import json,sys
d=json.load(sys.stdin); a=[x["browser_download_url"] for x in d.get("assets",[])]
def score(u):
    l=u.lower(); s=0
    if any(k in l for k in ("mac","darwin","apple","osx")): s+=10
    if any(k in l for k in ("aarch64","arm64","universal")): s+=5
    if "x86_64" in l and "universal" not in l: s-=3
    if l.endswith((".sha256",".sig",".txt")): s-=50
    return s
a=sorted(a,key=score,reverse=True)
print(a[0] if a and score(a[0])>=10 else "")
')"
  if [[ -z "$URL" ]]; then
    echo "✗ Couldn't find a macOS build on the latest Brush release."
    echo "  Download it by hand from https://github.com/ArthurBrussee/brush/releases"
    echo "  and copy the brush binary to: $BIN/brush"
    exit 1
  fi
  echo "  $URL"
  TMP="$(mktemp -d)"; F="$TMP/$(basename "$URL")"
  curl -fL --progress-bar -o "$F" "$URL"
  case "$F" in
    *.zip)            unzip -q "$F" -d "$TMP/x" ;;
    *.tar.gz|*.tgz|*.tar.xz) mkdir -p "$TMP/x"; tar -xf "$F" -C "$TMP/x" ;;
    *.dmg)            MNT="$(hdiutil attach -nobrowse -readonly "$F" | awk -F'\t' 'END{print $NF}')"; mkdir -p "$TMP/x"; cp -R "$MNT"/. "$TMP/x/"; hdiutil detach -quiet "$MNT" ;;
    *)                mkdir -p "$TMP/x"; cp "$F" "$TMP/x/" ;;
  esac
  # find the executable (plain binary, or inside an .app bundle)
  EXE="$(find "$TMP/x" -type f -perm -u+x \( -iname 'brush*' -o -path '*.app/Contents/MacOS/*' \) | grep -vi '\.dylib$' | head -1)"
  [[ -z "$EXE" ]] && EXE="$(find "$TMP/x" -type f -iname 'brush*' | head -1)"
  [[ -z "$EXE" ]] && { echo "✗ No brush executable in the download ($TMP)"; exit 1; }
  APP="$(echo "$EXE" | grep -o '^.*\.app' || true)"
  if [[ -n "$APP" ]]; then
    rm -rf "$BIN/Brush.app"; cp -R "$APP" "$BIN/Brush.app"
    ln -sf "$BIN/Brush.app/Contents/MacOS/$(basename "$EXE")" "$BIN/brush"
  else
    cp "$EXE" "$BIN/brush"
  fi
  chmod +x "$BIN/brush"
  xattr -dr com.apple.quarantine "$BIN" 2>/dev/null || true
  rm -rf "$TMP"
fi

chmod +x "$HERE/splat.sh"
if [[ -f "$HERE/mac/main.swift" ]]; then
  bash "$HERE/mac/build_app.sh" || echo "  ⚠ App build failed — the scan tools still work. Send Claude the error above."
fi
say "Checking"
for t in ffmpeg colmap; do printf "  %-7s %s\n" "$t" "$(command -v $t)"; done
printf "  %-7s %s\n" brush "$BIN/brush"
"$BIN/brush" --help >/dev/null 2>&1 && echo "  brush runs ✓" || echo "  ⚠ brush didn't start — if macOS blocked it: System Settings → Privacy & Security → Open Anyway, then re-run this installer."

say "Ready."
echo "  1. Put a video or a folder of photos in:  $HERE/captures"
echo "  2. Run:   $HERE/splat.sh \"$HERE/captures/<your capture>\""
echo "  3. Open Splat Darkroom from the Dock → 3D Scan → Open scan (or use 'New scan from video / photos' and skip step 2)"
