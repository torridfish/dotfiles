# Marp decks

A deck is one Markdown file rendered by Marp in the `slide-maker` theme
(`assets/marp/slide-maker.css`, registered by `scripts/marp-engine.js`).

```bash
<skill-dir>/scripts/slides.sh deck.md                  # deck.pdf (vector)
<skill-dir>/scripts/slides.sh deck.md --pdf --pptx     # + deck.pptx, one 2880x1620 picture per slide
<skill-dir>/scripts/slides.sh deck.md --pptx --scale 4  # pictures at 4x the canvas (3840x2160); default 3, PDF is vector
<skill-dir>/scripts/slides.sh deck.md --html           # one self-contained HTML file to present from
<skill-dir>/scripts/slides.sh deck.md --pdf --watch    # rebuild on every save
<skill-dir>/scripts/slides.sh deck.md --pptx -o out/   # another output folder
<skill-dir>/scripts/slides.sh deck.md --thanks         # append a "Thanks for listening." page (off by default)
<skill-dir>/scripts/slides.sh deck.md --thanks-text "Questions?"   # the same page with other words
```

## Front matter

```yaml
---
marp: true
theme: slide-maker
paginate: true        # slide number at the bottom right of every slide
headingDivider: 2     # every # and ## starts a slide, so no --- is needed
toc: true             # a contents slide after the first one ("Outline"; `toc: Contents` names it)
---
```

The contents slide lists every later slide's `##` in bold with its `###` under it, in two columns; a run of
slides under the same `##` is one entry, a part number like `(1/2)` at the end of a `###` is dropped (so
the parts are one line), and every line links to its slide in the PDF.

A run of slides under the same title writes the `##` once: a `###` after another `###` starts the next
slide with the same `##`.

```markdown
## Experiment
### M3 runs minus same-K no-CoT          <- slide 1: Experiment / M3 runs …

| … |

### Exploratory: M3 final vs no-CoT       <- slide 2: Experiment / Exploratory …
```

With `headingDivider: 2` a `---` still forces a break; any Markdown rule (`---`, `***`) is a slide break
in Marp, so a body rule inside a slide is `<hr class="rule">`.

## Slide types

All text is Times New Roman: 24pt titles (30pt on the title page), 14pt subtitles, 11pt leads and body,
9pt tables, 8pt footnotes, line spacing 1.3 (code stays monospace, math is KaTeX). The engine reads each slide's type from the
Markdown:

```markdown
# Progress Report            <- title page: # title + a subtitle paragraph, centred on the photo

LRM Baseline on Math
Oct. 31, 2026

# Does KV cache help?        <- section page: # title alone, on the photo

# 冠霆 {.divider}             <- plain divider: one centred line on white

## Experiment                <- content slide: title (24pt)
### Category C: KV cache     <- subtitle (14pt, amber), with the line under it

> Will KV cache benefit **downstream** tasks?[^kv]    <- lead (11pt); [^kv] becomes a superscript [1]

![](figures/kv.png "4-01")   <- figure; the title is its run label

[^kv]: Proposal should be scene-shared.               <- [1] Proposal … at the foot of this slide

```

A thanks page is a build option, not part of the Markdown: `slides.sh --thanks` appends
`# Thanks for listening.`, and a last slide holding only a `#` line takes the title-page layout.
(Writing that line by hand works the same way.)

Whole-slide classes go in a comment on a content slide: `<!-- _class: columns -->` (body blocks after the
lead fill two columns in order; wrap several blocks in a `<div>` to keep them in one column; a table,
figure row or formula there sits at the body's left edge, its column only as wide as it is, and the other
column takes the rest),
`<!-- _class: prose -->` (body text at 14pt for a discussion page), `<!-- _class: equation -->` (display
math at 1.5x on a slide that is only the equation). Classes combine: `<!-- _class: columns prose -->`.

## Body

| Markdown | Renders as |
| --- | --- |
| paragraphs | body text, 11pt, no paragraph spacing |
| `- item` / `1. item` | round bullets, numbers, `a.` for a nested ordered list; markers line up with paragraph text and wrapped lines with the item's text; each level two characters further in |
| `➔ consequence` (a paragraph) | drawn as →; wrapped lines start after the arrow; right after a list it lines up with the list's text |
| a paragraph of only images | one centred figure row, 0.25in apart; each picture at 1:1 (a 2x export at px/192 in), shrunk only when the row or the body is too small |
| `![w:300](f.png)` | Marp's size keywords still work for one picture |
| `$x_i$`, `$$ … $$`, ```` ```math ```` | KaTeX, Computer Modern, selectable and searchable in the PDF; inline math at the body size, display math centred at 1.2x the body |
| `\begin{equation} … \end{equation}` inside `$$` | numbered (1), (2) … in order through the deck, the number at the right edge; `align` / `gather` number each row (`\notag` skips one), the starred forms and plain `$$` are unnumbered, `\tag{A.1}` sets a number by hand |
| `\LLM`, `\Lloss{LM}`, `\tok{OBJ}`, `\argmax` … | expanded from `assets/tex/preamble-math.tex`; add a `\newcommand` there to add one |
| ` ```algo ` | an `algorithm2e` body rendered by `tex2img.sh` (800 dpi, transparent; `{scale=1.3}` resizes) |
| ` ```latex {.render} ` | any LaTeX body rendered the same way |
| ` ```python ` (any language) | monokai on a dark rounded box with line numbers; a box as wide as its code, centred, at 9pt (smaller only when the longest line would not fit) |
| ` ```python {path="human_eval/execution.py" start=98} ` | the same, with the path in white at the top of the box (a label only: nothing is read from it) and numbering from 98 |
| ` ```prompt ` | prompt template as text: `System:` bold, `{placeholder}` bold red, `<\|im_start\|>` on mark-blue |
| a table | results table, centred and compact (1px cell padding): bold header on gray, 9pt, hairline grid |
| a `role` column (`ref`, `a`, `b`) | row tints (reference gray, group blue, group orange); the column is not shown |
| a table, a blank line, `{.settings}` | settings / literature table: blue header, left-aligned, short columns centred |
| `<hr class="rule">` | body rule splitting the page |
| `<!-- text -->` | speaker notes |

Inline: `**bold**`, `` `chip` ``, `[link](url)`, `==WIP==`, `[4-03]{.callout}` (⤷ on orange),
`[disk full]{.alert}`, `[the formula]{.formula}`, `[aside]{.faint}`, `[<|im_end|>]{.token}`.

## Tweaking one slide

Inline HTML is on, so a one-off adjustment stays in the Markdown:

```markdown
<style scoped>
p.figures { flex: 1 1 0; } p.figures img { height: 100%; width: auto; }   /* fill the body on this slide */
table { font-size: 10.67px; }           /* an 8pt table on a crowded slide */
</style>
```

`<style scoped>` applies to its own slide only.

## Layout variables

Every anchor is a CSS variable in `:root` at the top of `assets/marp/slide-maker.css` (px on the
960 x 540 canvas); change the theme there, not per slide. One slide can also override them:
`<style scoped>section { --rule-top: 84px; --body-top: 88px; }</style>`.

| Variable | Default | What it places |
| --- | --- | --- |
| `--title-size`, `--subtitle-size`, `--body-size`, `--table-size`, `--note-size` | 24, 14, 11, 9, 8 pt | the type sizes |
| `--cover-title-size`, `--code-size`, `--leading`, `--indent` | 30 pt, 9 pt, 1.3, 2em | title-page title; code; line spacing; one list level |
| `--mark-w`, `--arrow-w` | 1.5em, 1.25em | a list marker's slot; the slot of the → opening a consequence line |
| `--bound` | 4 (3pt) | space around a table, figure or formula placed left in a column |
| `--title-top`, `--title-height` | 22, 46 | the title box (text sits on its bottom) |
| `--subtitle-top`, `--subtitle-height` | 68, 30 | the subtitle box (text centred in it) |
| `--rule-top` | 98 | the line under the subtitle |
| `--body-top` | 106 | the lead, or the body when there is no lead |
| `--lead-bottom` | 150 | where the body starts under a lead, at the earliest (not when a table, figure, formula or code comes right after it: then the usual gap) |
| `--body-bottom` | 504 | the bottom of the body box; footnotes sit below it |
| `--margin-x`, `--header-inset` | 32, 4 | side margin of header, line and body; title text inset |
| `--column-width`, `--column-gap` | 437, 22 | the two columns |
| `--run-label-height` | 22 | space a run label takes above its figure |
| `--footnote-width` | 916 | widest a footnote line runs, from the left edge |
| `--block-top` | 8 | extra room above a table, figure, code or formula that comes right under the line |
| `--number-right`, `--number-top`, `--number-height` | 16, 508, 28 | the slide number, right-aligned |
| `--cover-title-*`, `--cover-sub-*` | | title-page title and subtitle (centred) |
| `--section-title-*`, `--divider-*` | | section-page title; plain divider line |

Moving the rule means moving `--body-top` and `--lead-bottom` with it, so the lead stays under the rule.

## Notes

- Render caches: TeX renders live in `~/.cache/slide-maker/tex/`, keyed by content.
- Footnotes are numbered [1], [2] per slide in the order they are cited; a citation is a superscript [1] that links to its footnote in the PDF. A definition nobody cites (a caveat or link for the whole slide) goes, after the cited ones, to the slide whose source it sits in.
- Marp does not warn about overflow: read the PDF pages before handing a deck over.
- Local images need no flag: `slides.sh` runs Marp with local file access on.
