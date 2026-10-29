#!/usr/bin/env bash
# Export a draw.io source to PNG (scale 2) and optionally SVG with the desktop app headless.
#   drawio-export.sh figure.drawio                 # -> figure.png next to it
#   drawio-export.sh figure.drawio -o out/fig      # -> out/fig.png
#   drawio-export.sh figure.drawio --page 2 --svg  # page index (0-based) and an SVG too
# Keep the .drawio beside the export: the design system wants both in assets/Diagrams/.
set -euo pipefail
src=""; out=""; page=""; svg=0; scale=2; border=16
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2;;
    --page) page="$2"; shift 2;;
    --svg) svg=1; shift;;
    --scale) scale="$2"; shift 2;;
    --border) border="$2"; shift 2;;
    *) src="$1"; shift;;
  esac
done
[ -f "$src" ] || { echo "usage: drawio-export.sh <file.drawio> [-o basename] [--page N] [--svg]" >&2; exit 2; }
[ -n "$out" ] || out="${src%.drawio}"
mkdir -p "$(dirname "$out")"
pg=(); [ -n "$page" ] && pg=(--page-index "$page")
# find the draw.io desktop app: PATH first, then the macOS bundle, then the flatpak
DRAWIO=""
for c in drawio draw.io; do command -v "$c" >/dev/null 2>&1 && DRAWIO="$c" && break; done
[ -z "$DRAWIO" ] && [ -x "/Applications/draw.io.app/Contents/MacOS/draw.io" ] && DRAWIO="/Applications/draw.io.app/Contents/MacOS/draw.io"
[ -z "$DRAWIO" ] && command -v flatpak >/dev/null 2>&1 && flatpak info com.jgraph.drawio.desktop >/dev/null 2>&1 && DRAWIO="flatpak run com.jgraph.drawio.desktop"
[ -n "$DRAWIO" ] || { echo "draw.io desktop not found (install it, or put drawio on PATH)" >&2; exit 1; }
log="$($DRAWIO --export --format png --scale "$scale" --border "$border" "${pg[@]}" --output "$out.png" "$src" 2>&1)" || true
[ -f "$out.png" ] || { echo "draw.io export produced no PNG. Its output:" >&2; echo "$log" | grep -v -E 'Gtk-|dbus|Fontconfig|ozone|Vulkan|gpu_persistent|^\s*$' | tail -8 >&2; echo "(a flatpak draw.io cannot write outside your home directory; use a path under \$HOME)" >&2; exit 1; }
echo "$log" | grep -E '\->' || true
if [ "$svg" = 1 ]; then
  $DRAWIO --export --format svg --border "$border" "${pg[@]}" --output "$out.svg" "$src" 2>&1 | grep -E '\->' || true
  # the exporter writes an SVG 1.1 DOCTYPE that some hosts refuse; drop it
  python3 - "$out.svg" <<'PY'
import re,sys; p=sys.argv[1]; s=open(p,encoding='utf-8').read(); open(p,'w',encoding='utf-8').write(re.sub(r'<!DOCTYPE[^>]*>\s*','',s,count=1))
PY
fi
python3 - "$out.png" <<'PY'
import sys; from PIL import Image
im=Image.open(sys.argv[1]); print(f"{sys.argv[1]}  {im.width}x{im.height}px  (scale 2: place at up to {im.width/192:.2f} x {im.height/192:.2f} in for 1:1)")
PY
