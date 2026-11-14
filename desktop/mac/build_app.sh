#!/usr/bin/env bash
# Builds "Splat Darkroom.app" from main.swift and pins it to the Dock.
# Usage: bash ~/Documents/Splat/mac/build_app.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"          # …/Splat/mac
SPLAT="$(dirname "$HERE")"
APP="$HOME/Applications/Splat Darkroom.app"
say(){ printf "\n\033[1;31m▸\033[0m \033[1m%s\033[0m\n" "$*"; }

if ! xcrun --find swiftc >/dev/null 2>&1; then
  say "Installing Apple's command line tools (a dialog will appear — click Install, then re-run this)"
  xcode-select --install || true
  exit 1
fi

say "Compiling Splat Darkroom"
BUILD="$(mktemp -d)"
xcrun swiftc -O -o "$BUILD/SplatDarkroom" "$HERE/main.swift" 2>"$BUILD/err.txt" || {
  echo "✗ Compile failed:"; cat "$BUILD/err.txt"; echo; echo "Copy the error above to Claude."; exit 1; }

say "Assembling app bundle"
rm -rf "$APP"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$HOME/Applications"
cp "$BUILD/SplatDarkroom" "$APP/Contents/MacOS/SplatDarkroom"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Splat Darkroom</string>
  <key>CFBundleDisplayName</key><string>Splat Darkroom</string>
  <key>CFBundleIdentifier</key><string>com.modernnegative.splatdarkroom</string>
  <key>CFBundleExecutable</key><string>SplatDarkroom</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.photography</string>
</dict></plist>
PLIST

# icon
if [[ -f "$HERE/icon.png" ]]; then
  IS="$BUILD/AppIcon.iconset"; mkdir -p "$IS"
  for s in 16 32 64 128 256 512; do
    sips -z $s $s "$HERE/icon.png" --out "$IS/icon_${s}x${s}.png" >/dev/null
    sips -z $((s*2)) $((s*2)) "$HERE/icon.png" --out "$IS/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$IS" -o "$APP/Contents/Resources/AppIcon.icns" || true
fi
codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
mkdir -p "$SPLAT/frames" "$SPLAT/exports"
if [[ -f "$SPLAT/.update/splat.sh.next" ]] && ! pgrep -f "Splat/splat.sh" >/dev/null 2>&1; then cp "$SPLAT/.update/splat.sh.next" "$SPLAT/splat.sh" && mv "$SPLAT/.update/splat.sh.next" "$SPLAT/.update/splat.sh.applied"; fi

# pin to Dock (once)
if ! defaults read com.apple.dock persistent-apps 2>/dev/null | grep -q "Splat%20Darkroom.app"; then
  say "Adding to the Dock"
  defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>file://${APP// /%20}/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>"
  killall Dock || true
fi
rm -rf "$BUILD"
say "Done → $APP"
[[ "${1:-}" == "--no-open" ]] || open "$APP"
