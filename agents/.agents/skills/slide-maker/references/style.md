# Deck style: templates and recipes

The syntax itself is in `md2s --skill`; this file is what the user's decks usually look like.

## Front matter and skeleton

```markdown
---
marp: true
paginate: true
headingDivider: 2
toc: true
---

<!-- Progress Report 2026-11-05 — what this week covers.
     Source: issue / gist links.  Build: md2s 2026-11-05.md --pdf --pptx -->

# Progress Report

Project Name
Nov. 5, 2026

# The question the first block answers

[^s1]: Tracking issue: <https://github.com/owner/repo/issues/16>

## Setup
### What was run

> The claim or the question, with the **one term** the slide turns on.

- …

### The next setup slide under the same title

- …

## Experiment
### Results table

| role | Run | Metric A | Metric B |
| --- | --- | --- | --- |
| ref | 2-92 | 0.5505 | **0.4969** |
| a | 4-00 | **0.5186** | 0.4708 |
| b | 4-03 | 0.4915 | 0.3482 |

- What the table says, one line per finding

## TODO
### Week of Nov. 10

- **The one thing that matters most**
- …
```

## Layouts these decks use most

| Slide | Layout |
| --- | --- |
| A results table with two or three findings | no layout: table, then the list under it |
| A wide table with notes beside it | `<!-- _layout: fit-left -->`, the table in `a`, the notes in `b` |
| A figure with its reading | `<!-- _layout: img-left -->`, the figure (with its run ID as title) in `a`, the list in `b` |
| Two runs side by side | a paragraph of two images: one figure row, each with its run label |
| Code and the prompt it fills | `<!-- _layout: two -->`, the code in `a`, the ```` ```prompt ```` in `b` |
| A derivation | display math with `\begin{equation}` for the lines the talk refers back to |
| A caveat that must not be missed | `> [!WARNING] …` under the body, not in a footnote |
| A slide that runs over | `---` and the rest; md2s repeats the title and numbers the parts |
