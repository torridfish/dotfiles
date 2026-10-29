# Migrating the 2026 decks

Rules for bringing a slide built before this system onto it. Each line names the old pattern and the token or style it becomes.

- The hand-placed title box, topic box and connector line (24pt/945200/0.75pt in the 3D decks, 22pt/9C6B1E/1pt in the latent-reasoning pages) → the Content layout's `slide-title`, `topic` and rule; delete the free boxes.
- Section slides set as 45pt text on a blank slide (July–August) → the Section layout: photo under `veil`, title in `cover-title`.
- Lead boxes at y 1.10 in or 1.15 in → `lead-top` (1.08 in).
- Footnote boxes of any width from 4.46 to 9.33 in → one `caption` box no wider than 8.6 in, so it never meets the slide number.
- Roboto Mono (June–August) → `mono`, Courier New.
- Arial body text, footnotes, table cells and slide numbers (every deck through October 2026) → Times New Roman: `body`, `caption`, `table`, `table-dense`, `slide-number`. Arial stays on `cover-title`, `slide-title`, `topic` and the divider line only; the Times New Roman cover subtitle → `cover-subtitle` in Arial.
- Table text at 10, 10.5 or 11pt → `table` (9pt); 7pt and 6pt cells → split the table or use `table-dense`.
- Table tints EA9999, F9CB9C, B6D7A8, D8E5F7, E2E1DA, CCCCCC and EFEFEF → `surface-head`, `band-blue` or `band-orange` by role: header and reference, group one, group two.
- 6pt and 6.2pt text (ASCII trees, axis labels) → a screenshot shown at `body` scale, or a footnote link.
- Red text in FF0000 → `alert-deep`; red outlines stay `alert`.
- The FF8484 overlay at 45% → `overlay-pink`.
- "Eexperiment" → "Experiment"; "Not too much" as a slide title → a real category word, with the status in the `topic` line.
- Slide-number boxes at (9.35, 5.32) in → `number-left`, (9.31, 5.28) in.
- Justified paragraphs → left-aligned.
- Cover dates written "June 03, 2026", "July 15, 2026" or "Sep 23, 2026" → the one form "Oct. 28, 2026": abbreviated month with a period, day without a leading zero.
- The June–October header of the 3D-grounding decks (24pt title at x 0.33 with a 0.04in inset, 14pt topic in 945200, 0.75pt rule at y 1.01 from x 0.31) → the one header: `slide-title` 22pt at `header-left` with no inset, `topic` 12.5pt in `amber` (9C6B1E), `rule` 1pt at `rule-top`; lead and body blocks start at `lead-top` (1.02in).
- Pages pasted from PowerPoint (the Office-theme DEFAULT layout, 13pt body at x 0.45, 10pt serif footnotes) → the Content layout with `prose` and `caption`.
- 7pt numbered notes under a table in 595959 → `caption` in `ink-muted`.
- Links set in Meiryo → the style of the text around them (`caption` in a footnote, `body` in a list).
- Justified paragraphs (435 of them on the latent-reasoning pages) → left-aligned.
- A paper figure parked beside the title at y 0.12 → inside the body box, below the rule.
- Diagram tokens fig-orange, fig-blue, fig-blue-line, fig-pink, fig-green, fig-magenta, fig-teal, fig-ink → fig-llm, fig-module, fig-module-line, fig-decoder, fig-state, fig-llm-label, fig-voxel-4, fig-stroke, read from the draw.io sources instead of the exported pictures.
- Architecture figures drawn with slide shapes or pasted as screenshots → a `.drawio` source under `assets/Diagrams/` and its exported PNG.
- Code typed in Courier New on the slide (HumanEval prompts, model responses) → a Carbon image per block with the no-shadow preset; prompt templates with coloured placeholders stay text.
- Formulas typed in the slide's text (log p_AM(Y* | P, z) …) or pasted from a web renderer → rendered with the local TeX pipeline from a `.tex` kept beside the picture; pseudocode → algorithm2e.
