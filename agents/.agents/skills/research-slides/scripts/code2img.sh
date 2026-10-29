#!/usr/bin/env bash
# Render a source file to a Carbon image with the Research Slides preset
# (monokai, Hack 14px, line numbers, window controls, no shadow, 2x, padding on #F7FAFF).
#   code2img.sh response.py -o out/response            # -> out/response.png
#   code2img.sh main.rs --start 10 --end 40 -o out/loop # a line range
#   code2img.sh snippet.txt --lang python -o out/x     # force the language
# Needs Playwright's Chromium once: (cd <skill>/scripts && npx playwright install chromium)
# Carbon renders on carbon.now.sh through a headless browser: the code is sent to that site.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
src=""; out=""; start=""; end=""; lang=""
while [ $# -gt 0 ]; do
  case "$1" in
    -o) out="$2"; shift 2;;
    --start) start="$2"; shift 2;;
    --end) end="$2"; shift 2;;
    --lang) lang="$2"; shift 2;;
    *) src="$1"; shift;;
  esac
done
[ -f "$src" ] || { echo "usage: code2img.sh <file> -o <basename> [--start N --end M] [--lang L]" >&2; exit 2; }
[ -n "$out" ] || out="${src%.*}"
mkdir -p "$(dirname "$out")"
args=(--config "$HERE/../assets/carbon-config.json" --preset research-slides --save-to "$(dirname "$out")" --save-as "$(basename "$out")" --skip-display)
[ -n "$start" ] && args+=(--start "$start"); [ -n "$end" ] && args+=(--end "$end")
[ -n "$lang" ] && args+=(--settings "{\"language\":\"$lang\"}")
"$HERE/node_modules/.bin/carbon-now" "$src" "${args[@]}" 2>&1 | grep -E 'found here|rror' || true
python3 - "$out.png" <<'PY'
import sys; from PIL import Image
im=Image.open(sys.argv[1]); print(f"{sys.argv[1]}  {im.width}x{im.height}px  (2x: place at up to {im.width/192:.2f} x {im.height/192:.2f} in for 1:1)")
PY
