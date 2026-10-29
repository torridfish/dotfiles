#!/usr/bin/env bash
# One-time setup on a machine: npm packages for slides.sh (Marp, markdown-it plugins), and a report of the
# external tools the pipelines need. Safe to re-run.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
echo "== node packages (marp-cli, markdown-it plugins) =="
command -v node >/dev/null || { echo "node not found: install Node 18+ first" >&2; exit 1; }
npm install --ignore-scripts --no-audit --no-fund >/dev/null && echo "ok: scripts/node_modules"
echo "== external tools =="
miss=0
chk() { if command -v "$1" >/dev/null 2>&1; then echo "ok: $1"; else echo "MISSING: $1 — $2"; miss=1; fi; }
if [ -n "${CHROME_PATH:-}" ] || command -v google-chrome >/dev/null || command -v chromium >/dev/null || command -v chromium-browser >/dev/null || [ -d "/Applications/Google Chrome.app" ]; then echo "ok: Chrome / Chromium (slides.sh)"; else echo "MISSING: Chrome or Chromium — slides.sh renders through it (or set CHROME_PATH)"; miss=1; fi
chk latex "TeX Live (tex2img.sh: algo fences)"; chk dvisvgm "TeX Live (tex2img.sh SVG output)"; chk pdftocairo "poppler-utils (tex2img.sh transparent PNG)"
python3 -c 'import PIL' 2>/dev/null && echo "ok: Pillow" || { echo "MISSING: Pillow — tex2img.sh reports sizes with it"; miss=1; }
kpsewhich algorithm2e.sty >/dev/null 2>&1 && echo "ok: algorithm2e" || { echo "MISSING: algorithm2e (tlmgr install algorithm2e)"; miss=1; }
kpsewhich standalone.cls >/dev/null 2>&1 && echo "ok: standalone" || { echo "MISSING: standalone (tlmgr install standalone)"; miss=1; }
if command -v drawio >/dev/null || command -v draw.io >/dev/null || [ -x /Applications/draw.io.app/Contents/MacOS/draw.io ] || (command -v flatpak >/dev/null && flatpak info com.jgraph.drawio.desktop >/dev/null 2>&1); then echo "ok: draw.io desktop"; else echo "MISSING: draw.io desktop (drawio-export.sh) — https://github.com/jgraph/drawio-desktop/releases"; miss=1; fi
[ $miss = 0 ] && echo "all required tools present" || echo "some tools are missing; install them before using the matching pipeline"
