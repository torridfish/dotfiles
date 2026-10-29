# Marp decks

A deck is one Markdown file rendered by Marp in the `slide-maker` theme
(`assets/marp/slide-maker.css`, registered by `scripts/marp-engine.js`).

```bash
<skill-dir>/scripts/slides.sh deck.md                  # deck.pdf (vector)
<skill-dir>/scripts/slides.sh deck.md --pdf --pptx     # + deck.pptx, one 2880x1620 picture per slide
<skill-dir>/scripts/slides.sh deck.md --html           # one self-contained HTML file to present from
<skill-dir>/scripts/slides.sh deck.md --pdf --watch    # rebuild on every save
<skill-dir>/scripts/slides.sh deck.md --pptx -o out/   # another output folder
```

## Front matter

```yaml
---
marp: true
theme: slide-maker
paginate: true        # slide numbers (never on the cover)
headingDivider: 2     # every # and ## starts a slide, so no --- is needed
---
```

With `headingDivider: 2` a `---` still forces a break; any Markdown rule (`---`, `***`) is a slide break
in Marp, so a body rule inside a slide is `<hr class="rule">`.

## Slide types

The theme reads the type from the Markdown:

```markdown
# Progress Report            <- cover: # title + a subtitle paragraph (photo under the veil, no number)

Woven Anypoint Project
Nov. 5, 2026

# Does KV cache help?        <- photo section slide: # title alone

# 冠霆 {.divider}             <- plain divider

## Experiment                <- content slide: category title
### Category C: KV cache     <- amber topic (the 1pt rule comes with the ##)

> Will KV cache benefit **downstream** tasks?[^kv]    <- lead

![](figures/kv.png "4-01")   <- figure; the title is its run label

[^kv]: Proposal should be scene-shared.               <- footnote *1 at the foot of this slide
```

Whole-slide classes go in a comment on the slide: `<!-- _class: columns -->` (body blocks after the lead
fill two 4.55in columns in order; wrap several blocks in a `<div>` to keep them in one column),
`<!-- _class: prose -->` (13pt prose for a discussion page), `<!-- _class: equation -->` (display math at
1.5x on a slide that is only the equation). Classes combine: `<!-- _class: columns prose -->`.

## Body

| Markdown | Renders as |
| --- | --- |
| paragraphs | body text, 12pt Times, no paragraph spacing |
| `- item` / `1. item` | typed dashes (`- `), numbers, `a.` for a nested ordered list |
| a paragraph of only images | one centred figure row, 0.25in apart; each picture at 1:1 (a 2x export at px/192 in), shrunk only when the row or the body is too small |
| `![w:300](f.png)` | Marp's size keywords still work for one picture |
| `$x_i$`, `$$ … $$` | KaTeX, Computer Modern, selectable and searchable in the PDF; display math left-aligned at 1.2x the body |
| `\LLM`, `\Lloss{LM}`, `\tok{OBJ}`, `\argmax` … | expanded from `assets/tex/preamble-math.tex`; add a `\newcommand` there to add one |
| ` ```algo ` | an `algorithm2e` body rendered by `tex2img.sh` (800 dpi, transparent; `{scale=1.3}` resizes) |
| ` ```latex {.render} ` | any LaTeX body rendered the same way |
| ` ```python ` (any language) | monokai on a dark rounded box with line numbers; 14px, smaller only when the longest line would not fit |
| ` ```python {path="human_eval/execution.py" start=98} ` | the same, with the path shown above the box (a label only: nothing is read from it) and numbering from 98 |
| ` ```prompt ` | prompt template as text: `System:` bold, `{placeholder}` bold red, `<\|im_start\|>` on mark-blue |
| a table | results table, centred and compact (1px cell padding): bold header on gray, 9pt, hairline grid |
| a `role` column (`ref`, `a`, `b`) | row tints (reference gray, group blue, group orange); the column is not shown |
| a table, a blank line, `{.settings}` | settings / literature table: blue header, 8pt, short columns centred |
| `<hr class="rule">` | body rule splitting the page |
| `<!-- text -->` | speaker notes |

Inline: `**bold**`, `` `chip` ``, `[link](url)`, `==WIP==`, `[4-03]{.callout}` (⤷ on orange),
`[disk full]{.alert}`, `[the formula]{.formula}`, `[aside]{.faint}`, `[<|im_end|>]{.token}`.

## Tweaking one slide

Inline HTML is on, so a one-off adjustment stays in the Markdown:

```markdown
<style scoped>
p.figures { flex: 1 1 0; } p.figures img { height: 100%; width: auto; }   /* fill the body on this slide */
table { font-size: 10.67px; }           /* table-dense */
</style>
```

`<style scoped>` applies to its own slide only.

## Layout variables

Every anchor is a CSS variable in `:root` at the top of `assets/marp/slide-maker.css` (px on the
960 x 540 canvas); change the theme there, not per slide. One slide can also override them:
`<style scoped>section { --rule-top: 84px; --body-top: 88px; }</style>`.

| Variable | Default | What it places |
| --- | --- | --- |
| `--title-top`, `--title-height` | 19, 43 | the category title |
| `--topic-top`, `--topic-height` | 60, 29 | the amber topic line |
| `--rule-top` | 96 | the 1pt rule under the header |
| `--body-top` | 98 | the lead, or the body when there is no lead |
| `--lead-bottom` | 149 | where the body starts under a lead |
| `--body-bottom` | 499 | the bottom of the body box |
| `--margin-x`, `--header-left`, `--header-width` | 32, 38, 883 | side margin of the body; left and width of the header |
| `--table-indent`, `--column-width`, `--column-gap` | 22, 437, 22 | table-left offset; the two columns |
| `--run-label-height` | 26 | space a run label takes above its figure |
| `--footnote-width`, `--footnote-height` | 830, 37 | the footnote band at the bottom-left |
| `--number-left`, `--number-top`, `--number-width`, `--number-height` | 894, 507, 85, 29 | the slide number |
| `--cover-title-*`, `--cover-sub-*`, `--divider-*` | | cover title, cover subtitle, plain divider line |

Moving the rule means moving `--body-top` and `--lead-bottom` with it, so the lead stays under the rule.

## Notes

- Render caches: TeX renders live in `~/.cache/slide-maker/tex/`, keyed by content.
- Footnotes are numbered per slide in the order they are cited; a definition nobody cites (a caveat or link for the whole slide) goes, after the cited ones, to the slide whose source it sits in.
- Marp does not warn about overflow: read the PDF pages before handing a deck over.
- Local images need no flag: `slides.sh` runs Marp with local file access on.
