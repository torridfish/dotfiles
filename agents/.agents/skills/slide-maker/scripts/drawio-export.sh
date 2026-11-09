#!/usr/bin/env bash
# Export a draw.io source with the desktop app, headless: an SVG (vector; md2s places it at its own size),
# and a PNG at scale 2 too with --png (md2s places that at 1:1 as well).
#   drawio-export.sh figure.drawio                 # -> figure.svg next to it
#   drawio-export.sh figure.drawio -o out/fig      # -> out/fig.svg
#   drawio-export.sh figure.drawio --page 2 --png  # page index (0-based), and a PNG too
# Keep the .drawio beside the export.
set -euo pipefail
src=""; out=""; page=""; png=0; scale=2; border=16
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2;;
    --page) page="$2"; shift 2;;
    --png) png=1; shift;;
    --scale) scale="$2"; shift 2;;
    --border) border="$2"; shift 2;;
    *) src="$1"; shift;;
  esac
done
[ -f "$src" ] || { echo "usage: drawio-export.sh <file.drawio> [-o basename] [--page N] [--png] [--scale N]" >&2; exit 2; }
[ -n "$out" ] || out="${src%.drawio}"
mkdir -p "$(dirname "$out")"
pg=(); [ -n "$page" ] && pg=(--page-index "$page")
# find the draw.io desktop app: PATH first, then the macOS bundle, then the flatpak
DRAWIO=""
for c in drawio draw.io; do command -v "$c" >/dev/null 2>&1 && DRAWIO="$c" && break; done
[ -z "$DRAWIO" ] && [ -x "/Applications/draw.io.app/Contents/MacOS/draw.io" ] && DRAWIO="/Applications/draw.io.app/Contents/MacOS/draw.io"
[ -z "$DRAWIO" ] && command -v flatpak >/dev/null 2>&1 && flatpak info com.jgraph.drawio.desktop >/dev/null 2>&1 && DRAWIO="flatpak run com.jgraph.drawio.desktop"
[ -n "$DRAWIO" ] || { echo "draw.io desktop not found (install it, or put drawio on PATH)" >&2; exit 1; }
fail() { echo "draw.io export produced no $1. Its output:" >&2; echo "$2" | grep -v -E 'Gtk-|dbus|Fontconfig|ozone|Vulkan|gpu_persistent|^\s*$' | tail -8 >&2; echo "(a flatpak draw.io cannot write outside your home directory; use a path under \$HOME)" >&2; exit 1; }
log="$($DRAWIO --export --format svg --border "$border" "${pg[@]}" --output "$out.svg" "$src" 2>&1)" || true
[ -f "$out.svg" ] || fail SVG "$log"
# the exporter writes an SVG 1.1 DOCTYPE that some hosts refuse; drop it
python3 - "$out.svg" <<'PY'
import re,sys; p=sys.argv[1]; s=open(p,encoding='utf-8').read(); open(p,'w',encoding='utf-8').write(re.sub(r'<!DOCTYPE[^>]*>\s*','',s,count=1))
PY
echo "$out.svg"
if [ "$png" = 1 ]; then
  log="$($DRAWIO --export --format png --scale "$scale" --border "$border" "${pg[@]}" --output "$out.png" "$src" 2>&1)" || true
  [ -f "$out.png" ] || fail PNG "$log"
  echo "$out.png"
fi
