#!/usr/bin/env bash
# Render a LaTeX snippet (an equation, an algorithm2e block, or any body) to PNG and SVG
# with the local TeX Live, so nothing leaves the machine and the fonts match the
# draw.io kit's MathJax look (Computer Modern).
#
#   tex2img.sh --math  'a^2 + b^2 = c^2'            -o out/eq1       # inline math, no delimiters
#   tex2img.sh --display 'E = mc^2'                  -o out/eq2       # displaystyle
#   tex2img.sh --algo  algo-body.tex                 -o out/alg1      # an algorithm2e body (\KwIn ... \Return)
#   tex2img.sh --body  body.tex                      -o out/x         # any LaTeX body, your own markup
#   tex2img.sh --math-file eq.txt -o out/eq3                          # math read from a file
# Options: -o <basename> (required)  --dpi N (PNG, default 400 = about 4x of a 12pt slide)  --no-svg
# Output: <basename>.png and <basename>.svg (+ the .tex it compiled, kept for edits).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRE="$HERE/../assets/tex"
mode=""; src=""; out=""; dpi=400; svg=1
while [ $# -gt 0 ]; do
  case "$1" in
    --math|--display|--algo|--body|--math-file) mode="${1#--}"; src="$2"; shift 2;;
    -o) out="$2"; shift 2;;
    --dpi) dpi="$2"; shift 2;;
    --no-svg) svg=0; shift;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
[ -n "$mode" ] && [ -n "$out" ] || { echo "usage: tex2img.sh (--math EXPR | --display EXPR | --math-file F | --algo FILE | --body FILE) -o BASENAME" >&2; exit 2; }
mkdir -p "$(dirname "$out")"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
case "$mode" in
  math)      body="\\( $src \\)";;
  display)   body="\\( \\displaystyle $src \\)";;
  math-file) body="\\( $(cat "$src") \\)";;
  algo)      body="$(cat "$src")";;
  body)      body="$(cat "$src")";;
esac
if [ "$mode" = algo ]; then pre="$PRE/preamble-algo.tex"; else pre="$PRE/preamble-math.tex"; fi
{ cat "$pre"; printf '\n\\begin{document}\n%s\n\\end{document}\n' "$body"; } > "$work/fig.tex"
cp "$work/fig.tex" "$out.tex"
( cd "$work" && latex -interaction=batchmode -halt-on-error fig.tex >/dev/null 2>&1 ) || { echo "latex failed; see $out.log" >&2; cp "$work/fig.log" "$out.log"; exit 1; }
( cd "$work" && pdflatex -interaction=batchmode -halt-on-error fig.tex >/dev/null 2>&1 )
pdftoppm -png -r "$dpi" -singlefile "$work/fig.pdf" "$out"
if [ "$svg" = 1 ]; then dvisvgm --exact-bbox --no-fonts -o "$out.svg" "$work/fig.dvi" >/dev/null 2>&1; fi
python3 - "$out.png" <<'PY'
import sys; from PIL import Image
im=Image.open(sys.argv[1]); print(f"{sys.argv[1]}  {im.width}x{im.height}px  -> at 400dpi place at {im.width/400:.2f} x {im.height/400:.2f} in for 1:1 with 12pt text")
PY
