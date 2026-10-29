#!/usr/bin/env bash
# Refresh the skill's copy of the Research Slides design system from the local source bundle.
# The published artifact is canonical: https://claude.ai/code/artifact/96543532-eecf-4e12-a26e-07b9c95eff31
# Run after the design system changes (new tokens, new rules, new template) so decks built offline match it.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; SK="$HERE/.."
SRC="${1:-${RESEARCH_SLIDES_DS:-$HOME/Downloads/slides/research-slides}}"
[ -d "$SRC/project" ] || { echo "no design-system bundle at $SRC: pass its path, or export RESEARCH_SLIDES_DS=<bundle dir>" >&2; exit 1; }
mkdir -p "$SK/references/design-system" "$SK/assets"
cp "$SRC/project/README.md"            "$SK/references/design-system/README.md"
cp "$SRC/project/migration.md"         "$SK/references/design-system/migration.md"
cp "$SRC/project/tokens.json"          "$SK/references/design-system/tokens.json"
cp "$SRC/project/assets/Diagrams/research-slides-diagram-kit.drawio" "$SK/assets/diagram-kit.drawio"
cp "$SRC/project/assets/Diagrams/research-slides-diagram-kit.png"    "$SK/assets/diagram-kit.png"
cp "$SRC/project/assets/Backgrounds/cover-temple-night.jpg"          "$SK/assets/cover-temple-night.jpg"
[ -f "$SRC/research-slides-template.pptx" ] && cp "$SRC/research-slides-template.pptx" "$SK/assets/research-slides-template.pptx"
date -u +"synced %Y-%m-%dT%H:%M:%SZ from $SRC" | tee "$SK/references/design-system/SYNCED"
