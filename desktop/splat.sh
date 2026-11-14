#!/usr/bin/env bash
# =============================================================================
#  splat.sh — one camera  →  Gaussian splat (.ply)  on an Apple Silicon Mac
#
#  Usage:
#     ~/Documents/Splat/splat.sh <video file | folder of photos> [output folder]
#     (results land in ~/Documents/Splat/scans/<name>/<name>.ply)
#
#  Examples:
#     ~/Documents/Splat/splat.sh ~/Documents/Splat/captures/stump.mov
#     ~/Documents/Splat/splat.sh ~/Documents/Splat/captures/cairn_photos
#     FPS=3 STEPS=15000 ~/Documents/Splat/splat.sh captures/stump.mov   # quick test
#
#  One-time setup:  bash ~/Documents/Splat/install.sh
#     (Homebrew, ffmpeg, COLMAP, and Brush into ~/Documents/Splat/bin)
#     Optional alternative trainer: OpenSplat (TRAINER=opensplat).
#
#  Settings (environment variables):
#     FPS=2          frames per second pulled from a video (aim for 150–300 frames)
#     MAX_SIZE=1600  long edge in px fed to COLMAP + training
#     STEPS=30000    training steps (15000 for a quick look)
#     TRAINER=brush  brush | opensplat
#     VIEWER=1       open Brush's live viewer while it trains (0 = headless)
#
#  ---------------------------------------------------------------------------
#  CAPTURE — one camera, still subject (this decides 90% of the quality)
#  ---------------------------------------------------------------------------
#   • Subject must not move at all. A person can work if they're braced and
#     you're fast, but start with objects: a stump, a bust, a boot, a cairn.
#   • Lock everything: manual exposure, manual WB, fixed focus/zoom, no IS
#     crop changes. Changing exposure between frames = floaty, blotchy splats.
#   • Soft, even light (overcast or open shade). Hard sun moves as you orbit
#     your own shadow, and specular highlights become fog.
#   • Stop down (f/8–f/11) — you want everything sharp. Blur is added later.
#   • Walk 2–3 full rings: one at subject height, one ~30° above looking down,
#     one low looking up. Keep the subject a similar size in frame.
#   • 70–80% overlap between neighbouring frames. Stills: a frame every 5–10°.
#     Video: walk slowly, 4K, 1/250s+ shutter to kill motion blur.
#   • Include a bit of the surroundings with texture — COLMAP needs features.
#     Plain white walls and shiny/glass surfaces don't reconstruct.
#   • You can only "re-photograph" from where you captured. Want a low angle
#     or a close-up later? Shoot that ring now.
# =============================================================================
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
export PATH="$HERE/bin:/opt/homebrew/bin:$PATH"

IN="${1:-}"
[[ -z "$IN" ]] && { sed -n '2,20p' "$0"; exit 1; }
[[ -e "$IN" ]] || { echo "✗ Not found: $IN"; exit 1; }

NAME="$(basename "${IN%.*}")"
OUT="${2:-$HERE/scans/${NAME}}"
FPS="${FPS:-2}"; MAX_SIZE="${MAX_SIZE:-1600}"; STEPS="${STEPS:-30000}"
TRAINER="${TRAINER:-brush}"; VIEWER="${VIEWER:-1}"

say(){ printf "\n\033[1;31m▸\033[0m \033[1m%s\033[0m\n" "$*"; }
# machine-readable progress for the app:  @@progress <stage 1-6> <done> <total> <label>
prog(){ echo "@@progress $1 $2 $3 $4"; }
# stream a command's output, turning tool-specific counters into progress lines
#   $1 stage  $2 total (or 0)  $3 label  $4 regex with one or two capture groups (done[/total])  then: command…
track(){ local st="$1" tot="$2" lab="$3" re="$4"; shift 4
  "$@" 2>&1 | perl -pe 'BEGIN{$|=1} s/\r/\n/g' | while IFS= read -r l; do
    echo "$l"
    if [[ "$l" =~ $re ]]; then local d="${BASH_REMATCH[1]}" t="${BASH_REMATCH[2]:-}"; [[ "$t" =~ ^[0-9]+$ ]] || t="$tot"; [[ -n "$t" && "$t" != 0 ]] && prog "$st" "$d" "$t" "$lab"; fi
    :
  done; }
# stop child tools too when the app cancels
trap 'pkill -P $$ 2>/dev/null; exit 143' TERM INT
need(){ command -v "$1" >/dev/null 2>&1 || { echo "✗ '$1' not found. $2"; exit 1; }; }
need colmap "Run: bash $HERE/install.sh"
need ffmpeg "Run: bash $HERE/install.sh"
if [[ "$TRAINER" == brush ]]; then need brush "Run: bash $HERE/install.sh"
else need opensplat "Build from https://github.com/pierotofy/OpenSplat"; fi

WORK="$OUT/work"; IMG="$WORK/images"; DATA="$OUT/dataset"
mkdir -p "$OUT"
# keep a full log next to the scan (so crashes can be diagnosed later)
exec > >(tee -a "$OUT/build.log") 2>&1
echo "=== $(date) — splat.sh $IN"
export RUST_BACKTRACE=1
mkdir -p "$IMG"
[[ -f "$WORK/.frames_done" ]] || find "$IMG" -type f -delete 2>/dev/null || true
if [[ -f "$WORK/.frames_done" && -n "$(ls -A "$IMG" 2>/dev/null)" ]]; then
  echo "  (reusing $(ls "$IMG" | wc -l | tr -d ' ') frames already in $IMG — delete it to re-extract)"
else
  # ------------------------------------------------------------- 1. frames
  if [[ -f "$IN" ]]; then
    MODE=video
    say "1/4  Pulling frames from video at ${FPS} fps"
    DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN" 2>/dev/null | cut -d. -f1); DUR=${DUR:-60}
    EXP=$(( DUR*FPS > 0 ? DUR*FPS : 1 ))
    prog 1 0 "$EXP" "Extracting frames"
    ffmpeg -nostdin -hide_banner -loglevel error -i "$IN" \
      -vf "fps=${FPS},scale='if(gte(iw,ih),min(iw,${MAX_SIZE}),-2)':'if(gte(iw,ih),-2,min(ih,${MAX_SIZE}))'" \
      -q:v 2 "$IMG/f_%05d.jpg" & FP=$!
    while kill -0 $FP 2>/dev/null; do n=$(ls "$IMG" | wc -l | tr -d ' '); prog 1 "$((n<EXP?n:EXP))" "$EXP" "Extracting frames"; sleep 1; done
    wait $FP
    prog 1 "$EXP" "$EXP" "Extracting frames"
  else
    MODE=photos
    say "1/4  Converting photos (HEIC/RAW-JPEG/PNG/TIFF → ${MAX_SIZE}px JPEG)"
    shopt -s nullglob nocaseglob
    i=0
    for f in "$IN"/*.{jpg,jpeg,png,heic,tif,tiff}; do
      i=$((i+1)); sips -s format jpeg -Z "$MAX_SIZE" "$f" --out "$IMG/p_$(printf %05d $i).jpg" >/dev/null
    done
    shopt -u nullglob nocaseglob
  fi
fi
rm -f "$IMG"/._* 2>/dev/null || true
touch "$WORK/.frames_done"
[[ -f "$IN" ]] && MODE=video || MODE=photos
COUNT=$(ls "$IMG" | wc -l | tr -d ' ')
echo "  $COUNT images"
(( COUNT < 30 )) && echo "  ⚠ Under 30 images — expect a weak reconstruction. Aim for 150–300."

# --------------------------------------------------------------- 2. COLMAP
say "2/4  Solving camera positions (COLMAP)"
DB="$WORK/colmap.db"; SPARSE="$WORK/sparse"
if [[ ! -f "$SPARSE/0/cameras.bin" ]]; then
  rm -rf "$DB" "$SPARSE"; mkdir -p "$SPARSE"
  prog 2 0 "$COUNT" "Finding features"
  track 2 "$COUNT" "Finding features" 'Processed file \[([0-9]+)/([0-9]+)\]' \
    colmap feature_extractor --database_path "$DB" --image_path "$IMG" \
    --ImageReader.single_camera 1 --ImageReader.camera_model OPENCV
  prog 3 0 "$COUNT" "Matching frames"
  if [[ "$MODE" == video ]]; then
    track 3 "$COUNT" "Matching frames" 'Matching image \[([0-9]+)/([0-9]+)\]' \
      colmap sequential_matcher --database_path "$DB" --SequentialMatching.overlap 15
  else
    track 3 0 "Matching frames" 'Matching block \[([0-9]+)/([0-9]+)' \
      colmap exhaustive_matcher --database_path "$DB"
  fi
  prog 4 0 "$COUNT" "Solving camera positions"
  track 4 "$COUNT" "Solving camera positions" 'Registering image #[0-9]+ \(([0-9]+)\)' \
    colmap mapper --database_path "$DB" --image_path "$IMG" --output_path "$SPARSE"
fi
# use the biggest model if COLMAP split the scene
BEST=""; BESTN=0
for m in "$SPARSE"/*/; do
  n=$(colmap model_analyzer --path "$m" 2>&1 | awk -F': ' '/Registered images/{print $2+0}' | tail -1); n=${n:-1}
  (( n > BESTN )) && { BEST="$m"; BESTN=$n; }
done
[[ -z "$BEST" ]] && { echo "✗ COLMAP couldn't solve any cameras. More overlap / texture / sharper frames."; exit 1; }
echo "  Registered $BESTN of $COUNT images (model: $BEST)"
(( BESTN * 100 / COUNT < 60 )) && echo "  ⚠ Less than 60% of frames registered — gaps will show as holes/fog."

say "3/4  Undistorting"
rm -rf "$DATA"
prog 5 0 1 "Undistorting"
colmap image_undistorter --image_path "$IMG" --input_path "$BEST" --output_path "$DATA" --output_type COLMAP >/dev/null
prog 5 1 1 "Undistorting"
mkdir -p "$DATA/sparse/0"; mv "$DATA"/sparse/*.bin "$DATA/sparse/0/" 2>/dev/null || true

# --------------------------------------------------------------- 3. train
say "4/4  Training splats ($TRAINER, $STEPS steps)"
mkdir -p "$OUT"
# Brush's GPU backend (cubecl) writes its kernel/autotune cache relative to the working
# directory. Launched from the Dock that is "/" (read-only) and Brush panics — so run it
# from a writable folder and pre-create every cache location it may use.
mkdir -p "$HERE/.cache" "$HERE/.cache/target" "$HOME/.cache/cubecl" "$HOME/Library/Caches/cubecl" 2>/dev/null || true
cd "$HERE/.cache"; mkdir -p .cubecl target
export XDG_CACHE_HOME="$HERE/.cache"
if [[ "$TRAINER" == brush ]]; then
  HELP="$(brush --help 2>&1 || true)"
  CMD=(brush)
  # Brush only prints its progress bar to a terminal; give it a pseudo-terminal so we see steps
  if [[ "$(uname)" == Darwin ]] && command -v script >/dev/null; then CMD=(script -q /dev/null brush); fi
  grep -qE '^\s+train\b' <<<"$HELP" && CMD+=(train)
  CMD+=("$DATA")
  # Brush's flag names have changed between releases — use whatever this build has
  for f in --total-train-steps --total-steps --max-steps; do grep -q -- "$f" <<<"$HELP" && { CMD+=("$f" "$STEPS"); break; }; done
  grep -q -- '--export-every' <<<"$HELP" && CMD+=(--export-every 5000)
  grep -q -- '--export-path'  <<<"$HELP" && CMD+=(--export-path "$OUT")
  [[ "$VIEWER" == 1 ]] && grep -q -- '--with-viewer' <<<"$HELP" && CMD+=(--with-viewer)
  # (checkpoints every 5000 steps, so a late crash still leaves a usable scan)
  echo "  ${CMD[*]}"
  prog 6 0 "$STEPS" "Preparing GPU — the first run can take a few minutes"
  T0=$SECONDS; OK=1
  track 6 "$STEPS" "Training splats" "([0-9]+) ?/ ?${STEPS}([^0-9]|$)" "${CMD[@]}" || OK=0
  if [[ $OK == 0 && "${CMD[0]}" == script && $((SECONDS-T0)) -lt 20 ]]; then
    echo "⚠ pseudo-terminal wrapper failed — running Brush directly"; CMD=("${CMD[@]:3}"); OK=1
    track 6 "$STEPS" "Training splats" "([0-9]+) ?/ ?${STEPS}([^0-9]|$)" "${CMD[@]}" || OK=0
  fi
  if [[ $OK == 0 ]]; then
    echo "⚠ Brush crashed — retrying once with lighter GPU settings"
    LIGHT=()
    grep -q -- '--max-splats' <<<"$HELP"      && LIGHT+=(--max-splats 1000000)
    grep -q -- '--max-resolution' <<<"$HELP"  && LIGHT+=(--max-resolution 1080)
    grep -q -- '--sh-degree' <<<"$HELP"       && LIGHT+=(--sh-degree 2)
    echo "  ${CMD[*]} ${LIGHT[*]}"
    prog 6 0 "$STEPS" "Training splats (lighter retry)"
    track 6 "$STEPS" "Training splats (lighter retry)" "([0-9]+) ?/ ?${STEPS}([^0-9]|$)" "${CMD[@]}" "${LIGHT[@]}" || {
      echo "✗ Brush crashed again. Full log: $OUT/build.log"; exit 3; }
  fi
  prog 6 "$STEPS" "$STEPS" "Training splats"
else
  prog 6 0 "$STEPS" "Preparing GPU — the first run can take a few minutes"
  track 6 "$STEPS" "Training splats" 'Step ([0-9]+)' opensplat "$DATA" -n "$STEPS" -o "$OUT/${NAME}.ply"
fi

PLY="$(ls -t "$OUT"/*.ply 2>/dev/null | head -1 || true)"
if [[ -n "$PLY" ]]; then
  [[ "$PLY" != "$OUT/${NAME}.ply" ]] && cp "$PLY" "$OUT/${NAME}.ply"
  say "Done → $OUT/${NAME}.ply"
  echo "  Open Splat Darkroom → Scene → Load scan, then set Up axis to 'Y down' if it's upside-down."
else
  echo "✗ No .ply found in $OUT. If Brush's viewer is open, export from its UI, or run: brush --help"
fi
