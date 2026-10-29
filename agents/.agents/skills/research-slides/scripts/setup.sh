#!/usr/bin/env bash
# One-time setup on a machine: Node deps for the deck builder and Carbon, Playwright's Chromium,
# and a report of the external tools the figure pipelines need. Safe to re-run.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"
echo "== node packages (pptxgenjs, carbon-now-cli) =="
command -v node >/dev/null || { echo "node not found: install Node 18+ first" >&2; exit 1; }
# carbon-now-cli's postinstall wants sudo for browser deps; skip it and fetch Chromium ourselves
npm install --ignore-scripts --no-audit --no-fund >/dev/null && echo "ok: scripts/node_modules"
echo "== playwright chromium (for Carbon) =="
npx --yes playwright install chromium >/dev/null 2>&1 && echo "ok: chromium" || echo "warn: playwright chromium download failed; code2img.sh will not work until it succeeds"
echo "== external tools =="
miss=0
chk() { if command -v "$1" >/dev/null 2>&1; then echo "ok: $1"; else echo "MISSING: $1 — $2"; miss=1; fi; }
chk latex "TeX Live (tex2img.sh)"; chk dvisvgm "TeX Live (SVG output)"; chk pdftoppm "poppler-utils (PNG output, check-deck.py --render)"
python3 -c 'import PIL' 2>/dev/null && echo "ok: Pillow" || { echo "MISSING: Pillow — pip install pillow"; miss=1; }
python3 -c 'import pptx' 2>/dev/null && echo "ok: python-pptx" || echo "note: python-pptx missing — check-deck.py structural checks need it (pip install python-pptx, or uv run --with python-pptx)"
kpsewhich algorithm2e.sty >/dev/null 2>&1 && echo "ok: algorithm2e" || { echo "MISSING: algorithm2e (tlmgr install algorithm2e)"; miss=1; }
kpsewhich standalone.cls >/dev/null 2>&1 && echo "ok: standalone" || { echo "MISSING: standalone (tlmgr install standalone)"; miss=1; }
if command -v drawio >/dev/null || command -v draw.io >/dev/null || [ -x /Applications/draw.io.app/Contents/MacOS/draw.io ] || (command -v flatpak >/dev/null && flatpak info com.jgraph.drawio.desktop >/dev/null 2>&1); then echo "ok: draw.io desktop"; else echo "MISSING: draw.io desktop — https://github.com/jgraph/drawio-desktop/releases"; miss=1; fi
if command -v soffice >/dev/null || command -v libreoffice >/dev/null || ls /opt/libreoffice*/program/soffice >/dev/null 2>&1 || ls /usr/bin/libreoffice* >/dev/null 2>&1 || [ -x /Applications/LibreOffice.app/Contents/MacOS/soffice ] || (command -v flatpak >/dev/null && flatpak info org.libreoffice.LibreOffice >/dev/null 2>&1); then echo "ok: LibreOffice (rendering)"; else echo "note: LibreOffice missing — check-deck.py --render will be skipped"; fi
[ $miss = 0 ] && echo "all required tools present" || echo "some tools are missing; install them before using the matching pipeline"
