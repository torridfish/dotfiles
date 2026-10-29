---
name: research-slides
description: Build and revise research presentation decks (weekly Progress Report, lab meeting sections, paper reading pages, talks) in the user's "Research Slides" design system, and produce every figure that goes on them — equations and pseudocode rendered from LaTeX with the local TeX Live, code screenshots from Carbon with the fixed no-shadow preset, architecture diagrams exported from draw.io sources. Use this skill whenever the user asks for slides, a deck, a progress report, a 週報 / 投影片 / 簡報, a section for a shared lab deck, or for one slide-ready picture of a formula, an algorithm, a code snippet or an architecture, even if they do not name the design system; also when they ask to restyle old slides onto it.
---

# Research Slides

One slide language for every research deck: a white sheet with one category word, one amber topic line, one 1pt rule, and then the evidence. This skill carries a copy of the design system (`references/design-system/`), a deck builder that places things at its anchors (`scripts/deck.js`), and the three figure pipelines the system requires. The published system is canonical: https://claude.ai/code/artifact/96543532-eecf-4e12-a26e-07b9c95eff31 — when it and the local copy disagree, trust the artifact and run `scripts/sync-design-system.sh`.

## Before building anything

Read `references/design-system/README.md` once per session (about 2,500 words). It is the brand book: which category words exist, how a topic line is phrased, the exact anchors in inches, which table tint means what, when a page is two pages. Everything below assumes you know it. `references/design-system/tokens.json` has the values; `references/deck-recipes.md` has worked slide recipes with the builder.

## Plan the deck first

Write the slide list before touching code, as a table: slide type, title (category word), topic line, lead, evidence (figure / table / list / image), footnotes. A weekly deck runs Cover → (Section or Divider → content slides)* → TODO, twelve to twenty-five content slides, one message per slide. Ask for whatever content is missing (run IDs, numbers, the figure files) rather than inventing it; placeholders on a research slide are worse than a shorter deck.

Then choose, per slide, the component from the system:

| Evidence | Component | Builder call |
| --- | --- | --- |
| a picture, a diagram export | FigureSlide / FigureFrame | `content` + `figure` (+ `overlay`) |
| results of our runs | TableSlide / ResultsTable | `content` + `resultsTable` |
| settings, papers, models | SettingsTable | `content` + `settingsTable` |
| one question or claim + bullets | TextSlide / Bullets | `content({lead})` + `notes` |
| argument in prose | DiscussionSlide | `content` + `prose` (+ `bodyRule`) |
| a paper | PaperSlide | `content` + `notes` + `figure` × 1–3 + arXiv footnote |
| program source, model answers | CodeCompare | `content` + `image` × n (Carbon images) |
| an equation, a derivation | Equation | `content` + `image` (tex2img) |
| an algorithm | Pseudocode | `content` + `image` (tex2img --algo) |
| prompt template | PromptBlock | `content` + `promptBlock` (slide text, not an image) |
| closing list | TodoSlide | `content({title:'TODO'})` + `notes` |

## Markdown first: Marp renders the deck

The default for a deck is one Markdown file rendered with Marp in the system's theme: `##` category title, `###` topic, `>` lead, then the evidence (images, `$$` equations, tables, `[^1]` footnotes). The file is the reviewable plan and the source at once, and a layout tweak is a class or one line of CSS in it, not code.

```bash
<skill-dir>/scripts/slides.sh 2026-11-05/deck.md --pdf --pptx     # vector PDF + PPTX of 2880x1620 pictures
<skill-dir>/scripts/slides.sh 2026-11-05/deck.md --pdf --watch    # rebuild on every save
```

Math is KaTeX (Computer Modern, inline and display, selectable text in the PDF, fonts from the local katex package, the preamble's macros expanded); ```` ```algo ```` fences go through `tex2img.sh`; other code fences are monokai on a dark rounded box with line numbers, drawn by CSS (nothing leaves the machine; `{path="pkg/mod.py" start=42}` labels the block and sets the first line number). The PPTX is for reading, not editing. After rendering, look at the PDF pages as the audience would: Marp does not warn when a body is too tall, so an overflow is only visible there. Syntax, slide classes and the front matter: `references/marp-decks.md`. Use the builder below only when someone needs an editable .pptx.

## Build the deck with the builder

`scripts/deck.js` wraps pptxgenjs with the five layouts (COVER, SECTION, DIVIDER, CONTENT, CONTENT_LEAD) and one helper per component, every box already at the design system's anchors. Write a short Node script next to the output, run it with `node`. First run `scripts/setup.sh` once per machine (it installs pptxgenjs and carbon-now-cli under `scripts/`, fetches Playwright's Chromium, and reports which of TeX, pdftoppm, draw.io and LibreOffice are missing). `<skill-dir>` below is the folder this SKILL.md lives in: resolve it to a real path when you write the script, or export `RESEARCH_SLIDES_SKILL`:

```js
const path = require('path');
const SKILL = process.env.RESEARCH_SLIDES_SKILL || '<skill-dir>';
const RS = require(path.join(SKILL, 'scripts/deck.js'));
const deck = RS.create({ title: 'Progress Report 2026-11-05', author: 'torridfish' });
deck.cover({ title: 'Progress Report', project: 'Woven Anypoint Project', date: 'Nov. 5, 2026' });
deck.section({ title: 'Experiment: Does KV cache help?', footnotes: [[RS.marker('*1'), ' Link: ', RS.link('https://github.com/torridfish/just3d/issues/17')]] });
const s = deck.content({ title: 'Experiment', topic: 'Category C: KV cache ablation',
  lead: ['Will KV cache benefit downstream tasks?'],
  footnotes: [[RS.marker('*1'), ' Proposal should be scene-shared, so KV cache ', RS.bold('reuse'), ' is not the main proposal.']] });
deck.figure(s, { path: 'figures/kv_ablation.png', x: 2.2, y: 1.82, w: 5.6, h: 3.42, runLabel: '4-01' });
await deck.save('out/2026-11-05.pptx');
```

Rules the builder cannot enforce for you:
- Dates on the cover read "Nov. 5, 2026": abbreviated month with a period, no leading zero.
- A figure sits between `L.bodyTop` (1.55 in, or 1.02 in with no lead) and `L.bodyBottom` (5.20 in), keeps its aspect ratio, and never climbs beside the title. Two figures are 0.25 in apart.
- Tables: `resultsTable` rows carry a `role`: `'ref'` (last week's reference, gray), `'a'` (our group, blue), `'b'` (baselines, orange) or `''`; mark the best number per column with `best: [colIdx]`. Fourteen rows at 9pt fill the body; more is two slides.
- Text inside `notes` / `prose` / `footnotes` is an array of lines; each line is a string or an array of runs built with `RS.bold`, `RS.chip` (a path or config key), `RS.callout('4-03')` (a run called out), `RS.alert('…')` (a blocker), `RS.formula('…')` (the one formula a discussion page turns on), `RS.link(url)`, `RS.marker('*1')`.
- Chinese working notes go in the same styles; the reply to the user follows their language.
- After saving, run `scripts/check-deck.py out/deck.pptx --render`: the structural pass (python-pptx) flags shapes off the slide, text under 8pt, empty placeholders and an over-wide footnote; `--render` uses LibreOffice headless to turn every slide into a PNG, and you then read those pictures as the audience would, which is the only way to catch an overflowing text box or a figure that collided with the header. Fix and rebuild until both are clean. Speaker notes may name the component used on each slide (`notes:` on every call); they help the next revision.

Revising an existing deck built this way: edit the script and rebuild. Restyling an old deck: rebuild it slide by slide with the builder (the old free text boxes cannot be re-anchored in place), following `references/design-system/migration.md` for what each old pattern becomes.

## Figures: four pipelines, nothing drawn by hand on the slide

All four write the picture next to its source; keep both (the design system's `assets/Diagrams`, `assets/Math`, `assets/Code` show the convention). Place every result with `deck.figure` / `deck.image` — no border, no shadow, no rounded corners added on the slide.

**Equations** — `scripts/tex2img.sh --display 'E = \tfrac{1}{2} m v^2' -o out/eq1` renders with the local TeX Live (nothing leaves the machine; Computer Modern, matching the draw.io kit's MathJax). `--math` for inline style, `--math-file f.txt` for a long expression, `--body f.tex` for aligned environments or anything with its own markup. The preamble in `assets/tex/preamble-math.tex` already defines `\LLM`, `\BCE`, `\Dice`, `\Lloss{LM}`, `\tok{OBJ}`, `\argmax`; add a macro there when a deck keeps repeating a symbol. Output: `.png` at 800 dpi on a transparent ground (`pdftocairo -transp`; `--dpi N`, `--opaque` for white, `--preamble F` for another preamble; place at `px/800` in for 1:1 with 12pt body text, 1.2–1.5× that on a slide that is only the equation) and `.svg`.

**Pseudocode** — write the `algorithm2e` body (from `\begin{algorithm}[H]` to `\end{algorithm}`; `\Input`, `\Output`, `\For{}{}`, `\Comment*[r]{}` for a right-aligned note, `\Return`) to a file and run `scripts/tex2img.sh --algo body.tex -o out/alg1`. Ruled, line-numbered, semicolons hidden. One algorithm per slide, under a lead that says what it decides.

**Code** — `scripts/code2img.sh file.py -o out/snippet` makes a Carbon image with the system's preset: monokai, Hack 14px, 133% leading, line numbers, window controls, padding 20px on #F7FAFF, no drop shadow, 2× export. `--start/--end` cut a range, `--lang` forces a language. Place a prompt as one image under the lead and model responses as two images in the two 4.55 in columns (CodeCompare). The code is rendered by carbon.now.sh in a headless browser, so do not send anything the user would not paste into a website; for private code, say so and offer the `PromptBlock`-style slide text instead. Prompt templates with semantic marks (red placeholders, blue chat tokens) stay slide text via `deck.promptBlock`.

**Architecture diagrams** — never shapes on the slide, never a screenshot of an editor. Copy elements from `assets/diagram-kit.drawio` (every box, badge, token stack, frame and arrow kind in the `fig-` tokens; keep the style string, change the label), save the new `.drawio`, then `scripts/drawio-export.sh figure.drawio -o out/figure` (PNG at scale 2; `--svg` too; `--page N` for a multi-page file). The kit's vocabulary and colours are in the README's Diagrams section. If the user already has `.drawio` sources, export those rather than redrawing.

## Deliverables

Hand back the `.pptx`, the build script, and the figure sources beside their exports, all under one folder named by the deck date (`2026-11-05/`). Say which slides are placeholders for content the user still owes. If the design system itself needed a new rule or component to express the deck, say so instead of improvising on the slide: the system changes first, in the artifact, then the deck.

## Files in this skill

- `references/design-system/README.md`, `tokens.json`, `migration.md` — the system (synced copy; `SYNCED` has the date)
- `references/deck-recipes.md` — complete builder recipes for every component
- `scripts/deck.js` — the builder; `scripts/apply-theme.py` — theme colours (called by `save`); `scripts/check-deck.py` — structural checks and LibreOffice rendering; `scripts/setup.sh` — one-time machine setup
- `scripts/slides.sh` — Markdown → PDF / PPTX / HTML with Marp; `scripts/marp.config.js`, `scripts/marp-engine.js` (theme, macros, per-slide footnotes, figure rows, table roles, algo / prompt / code fences); `assets/marp/research-slides.css` — the theme; syntax in `references/marp-decks.md`
- `scripts/tex2img.sh`, `scripts/code2img.sh`, `scripts/drawio-export.sh` — the figure pipelines
- `scripts/sync-design-system.sh` — refresh the copy from the local bundle (`RESEARCH_SLIDES_DS` or the first argument says where it is)
- `assets/research-slides-template.pptx` — the same layouts as a hand-editable file; `assets/diagram-kit.drawio` / `.png`; `assets/cover-temple-night.jpg`; `assets/tex/*.tex` preambles; `assets/carbon-config.json`

Dependencies (`scripts/setup.sh` checks them): TeX Live with `standalone`, `algorithm2e`, `dvisvgm`; poppler's `pdftoppm`; Python 3 with Pillow (and python-pptx for the checker); Chrome or Chromium for Marp (`CHROME_PATH` picks one); Node 18+ (`setup.sh` runs `npm install --ignore-scripts` in `scripts/` and `npx playwright install chromium`); the draw.io desktop app (`drawio` on PATH, the macOS app, or the flatpak); LibreOffice for rendering. The skill lives in the user's dotfiles and is linked into `~/.agents/skills`, `~/.claude/skills` and `~/.codex/skills`, so one copy serves every agent.
