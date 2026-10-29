#!/usr/bin/env bash
# Render a Markdown deck in the slide-maker theme with Marp.
#   slides.sh deck.md                    # -> deck.pdf next to deck.md
#   slides.sh deck.md --pdf --pptx       # PDF (vector) and PPTX (one 2880x1620 picture per slide)
#   slides.sh deck.md --pptx --scale 4   # PPTX / PNG pictures at 4x the 960x540 canvas (default 3; PDF is vector)
#   slides.sh deck.md --html             # one HTML file to present from: ← →, click, l laser, d pen, u undo, e erase, ? keys
#   slides.sh deck.md --serve            # present at http://localhost:8080/deck.md, re-rendered on every reload
#                                        # (--port N for another port; Marp's overview needs http, not file://)
#   slides.sh deck.md --pdf --watch      # rebuild on every save
#   slides.sh deck.md --pptx -o out/     # write into another folder
#   slides.sh deck.md --thanks           # close with a "Thanks for listening." page (--thanks-text T for other words)
# The deck's front matter needs: marp: true, theme: slide-maker (paginate: true, headingDivider: 2
# recommended). Syntax: references/marp-decks.md. Chrome or Chromium is found by marp-cli; set
# CHROME_PATH to pick one.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARP="$HERE/node_modules/.bin/marp"
[ -x "$MARP" ] || { echo "marp-cli missing: run $HERE/setup.sh" >&2; exit 1; }
src=""; outdir=""; watch=(); formats=(); thanks=""; scale=(); serve=""; port=8080
while [ $# -gt 0 ]; do
  case "$1" in
    --pdf|--pptx|--html|--png) formats+=("${1#--}"); shift;;
    --watch|-w) watch=(--watch); shift;;
    -o) outdir="$2"; shift 2;;
    --scale) scale=(--image-scale "$2"); shift 2;;
    --thanks) thanks="${thanks:-Thanks for listening.}"; shift;;
    --thanks-text) thanks="$2"; shift 2;;
    --serve) serve=1; shift;;
    --port) port="$2"; shift 2;;
    -h|--help) sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) src="$1"; shift;;
  esac
done
[ -f "$src" ] || { echo "usage: slides.sh deck.md [--pdf] [--pptx] [--html] [--watch | --serve [--port N]] [--thanks | --thanks-text T] [--scale N] [-o DIR]" >&2; exit 2; }
[ ${#formats[@]} -gt 0 ] || formats=(pdf)
[ -n "$outdir" ] || outdir="$(dirname "$src")"
mkdir -p "$outdir"
stem="$(basename "${src%.*}")"
# the engine sizes figures at 1:1 and resolves their paths against the deck
export RS_DECK_DIR="$(cd "$(dirname "$src")" && pwd)"
# the engine appends the thanks page when this is set
export RS_THANKS="$thanks"
if [ -n "$serve" ]; then
  # Marp's server renders the deck's folder on request, as HTML with the presenting tools
  echo "presenting at http://localhost:$port/$(basename "$src") (Ctrl-C to stop)"
  export RS_FORMAT=html PORT="$port"
  exec "$MARP" --no-stdin --config-file "$HERE/marp.config.js" --server --input-dir "$RS_DECK_DIR"
fi
if [ ${#watch[@]} -gt 0 ] && [ ${#formats[@]} -gt 1 ]; then echo "--watch takes one format" >&2; exit 2; fi
for f in "${formats[@]}"; do
  case "$f" in
    pdf)  flag=(--pdf);  ext=pdf;;
    pptx) flag=(--pptx); ext=pptx;;
    html) flag=(--html); ext=html;;
    png)  flag=(--images png); ext=png;;
  esac
  export RS_FORMAT="$f"   # the engine adds the presenting tools to html, a <video> instead of a poster frame
  "$MARP" --no-stdin --config-file "$HERE/marp.config.js" "${flag[@]}" "${scale[@]}" "${watch[@]}" -o "$outdir/$stem.$ext" -- "$src"
done
