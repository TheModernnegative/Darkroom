#!/usr/bin/env bash
# Makes a self-contained "Splat Darkroom.zip" on your Desktop that you can send to a friend.
# The app inside carries everything (UI, film LUTs, assets); on first launch it sets itself up
# in their ~/Documents/Splat and keeps updating from GitHub like yours does.
# Usage: bash ~/Documents/Splat/mac/package_for_friend.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SPLAT="$(dirname "$HERE")"
OUT="$HOME/Desktop/Splat Darkroom (for friends)"; APP="$OUT/Splat Darkroom.app"
say(){ printf "\n\033[1;31m▸\033[0m \033[1m%s\033[0m\n" "$*"; }
command -v xcrun >/dev/null && xcrun --find swiftc >/dev/null 2>&1 || { echo "Needs Apple's command line tools: run  xcode-select --install"; exit 1; }

say "Compiling for Apple Silicon and Intel"
B="$(mktemp -d)"
xcrun swiftc -O -target arm64-apple-macos13 -o "$B/arm" "$HERE/main.swift"
if xcrun swiftc -O -target x86_64-apple-macos13 -o "$B/x86" "$HERE/main.swift" 2>/dev/null; then lipo -create "$B/arm" "$B/x86" -output "$B/SplatDarkroom"; else cp "$B/arm" "$B/SplatDarkroom"; fi

say "Assembling the app"
rm -rf "$OUT"; mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/Splat"
cp "$B/SplatDarkroom" "$APP/Contents/MacOS/SplatDarkroom"
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
  <key>CFBundleShortVersionString</key><string>$(cat "$SPLAT/VERSION" 2>/dev/null || echo 1.0)</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSPrincipalClass</key><string>NSApplication</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.photography</string>
</dict></plist>
PLIST
# payload: the app UI + film data + assets, the scan scripts and the updater (no scans, no personal data)
R="$APP/Contents/Resources/Splat"
cp -R "$SPLAT/app" "$R/app"; mkdir -p "$R/mac"; cp "$HERE/main.swift" "$HERE/build_app.sh" "$R/mac/"; [[ -f "$HERE/icon.png" ]] && cp "$HERE/icon.png" "$R/mac/"
for f in splat.sh update.sh install.sh VERSION; do [[ -f "$SPLAT/$f" ]] && cp "$SPLAT/$f" "$R/$f"; done
if [[ -f "$HERE/icon.png" ]]; then IS="$B/AppIcon.iconset"; mkdir -p "$IS"
  for s in 16 32 64 128 256 512; do sips -z $s $s "$HERE/icon.png" --out "$IS/icon_${s}x${s}.png" >/dev/null; sips -z $((s*2)) $((s*2)) "$HERE/icon.png" --out "$IS/icon_${s}x${s}@2x.png" >/dev/null; done
  iconutil -c icns "$IS" -o "$APP/Contents/Resources/AppIcon.icns" || true; fi
codesign --force --deep -s - "$APP" >/dev/null 2>&1 || true

cat > "$OUT/READ ME FIRST.txt" <<'TXT'
SPLAT DARKROOM

1. Drag "Splat Darkroom.app" into your Applications folder.
2. The first time, RIGHT-CLICK the app and choose Open, then click Open again.
   (It isn't from the App Store, so macOS asks once. If it still refuses: System Settings →
   Privacy & Security → scroll down → "Open Anyway".)
3. Done — film looks, Studio and the 3D scan viewer work straight away. It updates itself
   (Help → Check for Updates).

Want to MAKE 3D scans from your own videos (Apple Silicon Mac)? Open Terminal and paste:
    bash ~/Documents/Splat/install.sh
It installs ffmpeg, COLMAP and the Brush trainer (about 10 minutes, asks for your password once).
TXT

say "Zipping"
cd "$HOME/Desktop"; rm -f "Splat Darkroom.zip"; ditto -c -k --sequesterRsrc --keepParent "$(basename "$OUT")" "Splat Darkroom.zip"
echo; echo "✓ Ready: ~/Desktop/Splat Darkroom.zip  ($(du -h "Splat Darkroom.zip" | cut -f1)) — send that file."
