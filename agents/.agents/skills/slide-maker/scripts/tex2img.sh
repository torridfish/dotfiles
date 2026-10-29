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
# Options: -o <basename> (required)  --dpi N (PNG, default 800)  --opaque (white ground instead of
#          transparent)  --preamble F (replace the theme preamble)  --no-svg
# Output: <basename>.png with a transparent ground, <basename>.svg (+ the .tex it compiled, kept for edits).
# Placement: px/dpi inches is 1:1 with 12pt body text.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRE="$HERE/../assets/tex"
mode=""; src=""; out=""; dpi=800; svg=1; transp=1; pre_override=""
while [ $# -gt 0 ]; do
  case "$1" in
    --math|--display|--algo|--body|--math-file) mode="${1#--}"; src="$2"; shift 2;;
    -o) out="$2"; shift 2;;
    --dpi) dpi="$2"; shift 2;;
    --no-svg) svg=0; shift;;
    --opaque) transp=0; shift;;
    --preamble) pre_override="$2"; shift 2;;
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
if [ -n "$pre_override" ]; then pre="$pre_override"
elif [ "$mode" = algo ]; then pre="$PRE/preamble-algo.tex"; else pre="$PRE/preamble-math.tex"; fi
{ cat "$pre"; printf '\n\\begin{document}\n%s\n\\end{document}\n' "$body"; } > "$work/fig.tex"
cp "$work/fig.tex" "$out.tex"
( cd "$work" && latex -interaction=batchmode -halt-on-error fig.tex >/dev/null 2>&1 ) || { echo "latex failed; see $out.log" >&2; cp "$work/fig.log" "$out.log"; exit 1; }
( cd "$work" && pdflatex -interaction=batchmode -halt-on-error fig.tex >/dev/null 2>&1 )
if [ "$transp" = 1 ]; then pdftocairo -png -transp -r "$dpi" -singlefile "$work/fig.pdf" "$out"
else pdftocairo -png -r "$dpi" -singlefile "$work/fig.pdf" "$out"; fi
if [ "$svg" = 1 ]; then dvisvgm --exact-bbox --no-fonts -o "$out.svg" "$work/fig.dvi" >/dev/null 2>&1; fi
python3 - "$out.png" "$dpi" <<'PY'
import sys; from PIL import Image
im=Image.open(sys.argv[1]); d=int(sys.argv[2]); print(f"{sys.argv[1]}  {im.width}x{im.height}px {im.mode}  -> at {d}dpi place at {im.width/d:.2f} x {im.height/d:.2f} in for 1:1 with 12pt text")
PY
