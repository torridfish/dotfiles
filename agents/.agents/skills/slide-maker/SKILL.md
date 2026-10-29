---
name: slide-maker
description: Turn a Markdown file into the user's research slides (weekly Progress Report, lab meeting sections, paper reading pages, talks) and export them as PDF and PPTX, with Marp and the slide-maker theme; also produce the pictures that go on them — pseudocode rendered from LaTeX with the local TeX Live and architecture diagrams exported from draw.io sources. Use this skill whenever the user asks for slides, a deck, a progress report, a 週報 / 投影片 / 簡報, a section for a shared lab deck, or to rebuild, restyle or re-export existing slides, even if they do not name the tool.
---

# slide-maker

A deck is one Markdown file. `scripts/slides.sh` renders it with Marp in the slide-maker theme and exports a vector PDF and a PPTX of pictures (for reading, not editing). The theme CSS is the only definition of the look; `references/marp-decks.md` is the catalogue of what a deck can say. Run `scripts/setup.sh` once per machine.

```bash
<skill-dir>/scripts/slides.sh 2026-11-05/deck.md --pdf --pptx     # deck.pdf + deck.pptx next to deck.md
<skill-dir>/scripts/slides.sh 2026-11-05/deck.md --pdf --watch    # rebuild on every save
<skill-dir>/scripts/slides.sh 2026-11-05/deck.md --pdf -o out/    # another output folder
```

## Write the deck

Read `references/marp-decks.md` before writing: the front matter, the slide types, and every layout, table and code feature with its syntax. Write the slide list straight into the Markdown; it is the reviewable plan and the source at once. Ask for whatever content is missing (run IDs, numbers, figure files) rather than inventing it; a placeholder on a research slide is worse than a shorter deck.

Use what the catalogue offers. When a slide needs a layout or a mark it does not have, say so and add it to the theme and the catalogue (a class in `assets/marp/slide-maker.css`, a line in `references/marp-decks.md`, a page in `assets/marp/gallery.md`) instead of improvising a one-off `<style scoped>` that the next deck cannot reuse. `<style scoped>` is for nudging one slide, not for new components.

## Writing conventions

- A weekly deck runs title page → (section page → content slides)* → TODO, twelve to twenty-five content slides, one message per slide. A slide that cannot be named by a title and a subtitle is two slides.
- The title (`##`) is the category of the slide, a noun phrase in Title Case: Experiment, Benchmark, Setup, Analysis, Research, Review, Related Work, Known Issue, Current Problem, Next Step, TODO, Appendix, or a project name on a reading page. The subtitle (`###`) says what this slide is about, in sentence case. Neither ends with a period.
- The lead (`>`) states the claim or the question in one or two sentences; bold the one term the slide turns on.
- Name runs by their ID and use it as a noun: 2-92, 4-00, 4-03. A run ID above a figure is the image title (`![](f.png "4-03")`); one called out in text is `[4-03]{.callout}`.
- Footnotes carry caveats, references and links, with the URL written out (arXiv, GitHub issues, source lines). A paper's reading page quotes it in your own words in two to five lines, shows one to three of its figures, and links it in a footnote.
- Prose is English. Notes to self, blockers and findings may be in Traditional Chinese; urgent ones are `[…]{.alert}`. No emoji on slides (✅ ❌ only inside Chinese working notes); arrows are typed: → for "becomes", ⤷ before a run ID, ➔ for a consequence.
- Dates read "Nov. 5, 2026": abbreviated month with a period, no leading zero.

## Pictures

Equations are LaTeX in the Markdown (`$…$`, `$$…$$`), typeset by KaTeX; the macros in `assets/tex/preamble-math.tex` (`\LLM`, `\BCE`, `\Dice`, `\Lloss{LM}`, `\tok{OBJ}`, `\argmax`) work there too, so add a `\newcommand` there when a deck keeps repeating a symbol. Pseudocode is an ```` ```algo ```` fence holding an `algorithm2e` body, rendered by `scripts/tex2img.sh` (800 dpi, transparent). Code is a fenced block, drawn by the theme. None of these leave the machine.

Architecture diagrams are drawn in draw.io from `assets/diagram-kit.drawio` and exported with `scripts/drawio-export.sh figure.drawio -o figures/figure` (PNG at scale 2, placed at 1:1 by the theme); never shapes on the slide, never a screenshot of the editor. The kit's vocabulary and colours: `references/diagrams.md`. If the user already has `.drawio` sources, export those rather than redrawing. `tex2img.sh` also makes a standalone picture of a formula when one is wanted outside a deck (`--display`, `--math`, `--body`).

## Check and hand back

Render, then read every PDF page as the audience would: Marp does not warn when a body is too tall, so an overflow, a clipped table or a figure that shrank too far is only visible there. Fix the Markdown (split the slide, move a block) before reaching for `<style scoped>`.

Hand back the Markdown, the PDF and the PPTX, with figure sources beside their exports, in one folder named by the deck date (`2026-11-05/`). Say which slides are placeholders for content the user still owes.

## Files in this skill

- `scripts/slides.sh` — Markdown → PDF / PPTX / HTML / PNG with Marp; `scripts/marp.config.js` (KaTeX with local fonts, local files on); `scripts/marp-engine.js` (theme registration, math macros, per-slide footnotes, figure rows at 1:1, table roles, algo / prompt / code fences)
- `assets/marp/slide-maker.css` — the theme: layout variables at the top, then every slide type and component
- `assets/marp/gallery.md` — one slide per slide type and component; render it after changing the theme and compare
- `references/marp-decks.md` — the authoring catalogue; `references/diagrams.md` — the draw.io kit's vocabulary and colours
- `scripts/tex2img.sh` (LaTeX → transparent PNG / SVG), `scripts/drawio-export.sh` (draw.io → PNG / SVG); `assets/tex/*.tex` preambles; `assets/diagram-kit.drawio` / `.png`; `assets/cover-temple-night.jpg`
- `scripts/setup.sh` — one-time setup: npm packages under `scripts/`, and a report of the tools below

Dependencies: Node 18+; Chrome or Chromium (Marp renders through it; `CHROME_PATH` picks one); TeX Live with `standalone` and `algorithm2e`, plus `dvisvgm`; poppler's `pdftocairo`; Python 3 with Pillow; the draw.io desktop app for diagrams. The skill lives in the user's dotfiles (`agents/.agents/skills/slide-maker`) and is linked into `~/.agents/skills`, `~/.claude/skills` and `~/.codex/skills`.
