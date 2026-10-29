---
name: slide-maker
description: Write the user's research slides (weekly Progress Report, lab meeting sections, paper reading pages, talks) as one Markdown file and render them with md2s to PDF, PPTX or a presentable HTML deck, in the user's house style; also make the pictures that go on them — pseudocode from LaTeX and architecture diagrams from draw.io sources. Use this skill whenever the user asks for slides, a deck, a progress report, a 週報 / 投影片 / 簡報, a section for a shared lab deck, or to rebuild, restyle or re-export existing slides, even if they do not name the tool.
---

# slide-maker

The decks are plain Markdown rendered by **md2s** (the user's tool, `~/Code/md2s`, on the PATH as `md2s`). md2s owns the syntax and the look: its default theme is this house style. This skill owns how the user's decks are written: structure, wording, notation and pictures.

**Before writing, run `md2s --skill` and read it.** It lists the CLI, the front matter, every slide type, layout, callout, table, code, diagram and media feature with its syntax. If `md2s` is missing, run `npm install && npm link` in `~/Code/md2s`; `md2s --check` reports the optional tools (TeX, ffmpeg, draw.io).

```bash
md2s 2026-11-05/deck.md --pdf --pptx     # deck.pdf + deck.pptx next to deck.md
md2s 2026-11-05/deck.md --pdf --watch    # rebuild on every save
md2s 2026-11-05/deck.md --serve          # present at http://localhost:8080/deck.md (l laser, d pen, ? keys)
md2s 2026-11-05/deck.md --pdf --thanks   # close with a "Thanks for listening." page
```

## Write the deck

Start from the front matter and skeleton in `references/style.md`, then write the slide list straight into the Markdown; it is the reviewable plan and the source at once. Ask for whatever content is missing (run IDs, numbers, figure files) rather than inventing it; a placeholder on a research slide is worse than a shorter deck.

Use what md2s offers. When a slide needs a layout or a mark it does not have, say so and add it to md2s (`themes/default.css`, `src/engine.js`, `docs/agent.md`, a page in `examples/gallery.md`) instead of improvising a one-off `<style scoped>` that the next deck cannot reuse. `<style scoped>` is for nudging one slide, not for new components.

## Writing conventions

- A weekly deck runs title page → (section page → content slides)* → TODO, twelve to twenty-five content slides, one message per slide. Add a closing thanks page at build time with `md2s --thanks` when the talk wants one; it is not written in the Markdown. A slide that cannot be named by a title and a subtitle is two slides.
- Slides that share a title write the `##` once and start each slide with its `###`; a subsection that runs over continues after a `---`, which repeats the `##` and `###` and numbers the parts (1/2), (2/2). Set `toc: true` for a contents slide after the title page.
- The title (`##`) is the category of the slide, a noun phrase in Title Case: Experiment, Benchmark, Setup, Analysis, Research, Review, Related Work, Known Issue, Current Problem, Next Step, TODO, Appendix, or a project name on a reading page. The subtitle (`###`) says what this slide is about, in sentence case. Neither ends with a period.
- The lead (`>`) states the claim or the question in one or two sentences; bold the one term the slide turns on.
- Name runs by their ID and use it as a noun: 2-92, 4-00, 4-03. A run ID above a figure is the image title (`![](f.png "4-03")`); one called out in text is `[4-03]{.callout}`. Tables of runs use the `role` column (`ref`, `a`, `b`) to tint the reference and the two groups.
- Footnotes carry caveats, references and links, with the URL written out (arXiv, GitHub issues, source lines). A paper's reading page quotes it in your own words in two to five lines, shows one to three of its figures, and links it in a footnote.
- Prose is English. Notes to self, blockers and findings may be in Traditional Chinese; urgent ones are `[…]{.alert}`. No emoji on slides (✅ ❌ only inside Chinese working notes); arrows are typed: → for "becomes", ⤷ before a run ID, ➔ for a consequence.
- Dates read "Nov. 5, 2026": abbreviated month with a period, no leading zero.

## Notation and pictures

- Equations are LaTeX (`$…$`, `$$…$$`). The research notation (`\LLM`, `\BCE`, `\Dice`, `\Lloss{LM}`, `\tok{OBJ}`) lives in `macros.tex` here, linked to `~/.config/md2s/macros.tex`; add a `\newcommand` there when a deck keeps repeating a symbol. Number an equation the deck refers back to with `\begin{equation}`.
- Pseudocode is an ```` ```algo ```` fence holding an `algorithm2e` body. Small flowcharts can be ```` ```mermaid ```` or ```` ```dot ````.
- Architecture diagrams are drawn in draw.io from `assets/diagram-kit.drawio` and exported with `md2s drawio figure.drawio -o figures/figure` (PNG at scale 2, placed at 1:1); never shapes on the slide, never a screenshot of the editor. The kit's vocabulary and colours: `references/diagrams.md`. If the user already has `.drawio` sources, export those rather than redrawing. `md2s tex2img --display '…' -o eq` makes a standalone formula picture when one is wanted outside a deck.

## Check and hand back

Render, then read every PDF page as the audience would: Marp does not warn when a body is too tall, so an overflow, a clipped table or a figure that shrank too far is only visible there. Fix the Markdown (split the slide with `---`, move a block, pick a `_layout`) before reaching for `<style scoped>`.

Hand back the Markdown, the PDF and the PPTX, with figure sources beside their exports, in one folder named by the deck date (`2026-11-05/`). Say which slides are placeholders for content the user still owes.

## Files in this skill

- `references/style.md` — front matter, the weekly-deck skeleton, and the layouts these decks use most
- `references/diagrams.md`, `assets/diagram-kit.drawio` / `.png` — the draw.io kit: vocabulary, colours, one styled instance of every element
- `macros.tex` — the research notation for KaTeX and LaTeX fences (linked to `~/.config/md2s/macros.tex`)

The skill lives in the user's dotfiles (`agents/.agents/skills/slide-maker`) and is linked into `~/.agents/skills`, `~/.claude/skills` and `~/.codex/skills`; md2s is a separate repo at `~/Code/md2s`.
