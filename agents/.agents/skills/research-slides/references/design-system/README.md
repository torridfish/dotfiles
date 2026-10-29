Research Slides is the slide language of one researcher's decks: the weekly progress reports of the Woven Anypoint Project (3D grounding with an LLM backbone), the researcher's own section of the shared latent-reasoning lab deck, and every research talk built from the same parts. A slide is a white sheet with one category word, one amber topic line, one hairline, and then the evidence: a figure, a table, a reading note or a block of prose. Nothing is decorated; every architecture figure is drawn in draw.io and exported, every equation and algorithm is rendered from LaTeX, every code block is a Carbon image, and none of them is sketched or typed on the slide.

## Content fundamentals

- One topic per slide. `slide-title` is the category of the slide, a single noun phrase in Title Case: Experiment, Benchmark, Setup, Analysis, Research, Review, Related Work, Known Issue, Current Problem, Next Step, TODO, Appendix, or the project name on a reading page (Backbone sharing, Faithfulness measurement). `topic` says what this slide specifically is about, in sentence case: "Category C: LLM backbone as its own proposer", "Hybrid: A+B", "Different settings across papers", a paper's title on a reading page. Keep both to one line and never end either with a period.
- State the claim or the question in `lead`, one or two serif sentences directly under the rule: "Will KV cache benefit downstream tasks?" Bold (`lead-strong`) the one term the slide turns on. A page that argues rather than shows sets its text in `prose`, the serif 13pt that fills the body of a discussion page.
- Name runs by their ID and use the ID as a noun: 2-92, 4-00, 4-03. A run ID above a figure is `run-label`; a run ID called out in prose sits on `mark-orange` after a ⤷.
- Prose is English. Notes to self, blockers, discussion points and findings may be in Traditional Chinese in the same styles, numbered "1. k63 能量尖峰不見了" when they are findings. Urgent notes (disk full, machine under maintenance) are bold `alert-deep`; so is the one formula a discussion page turns on.
- Footnotes carry caveats, references and links. Number them *1, *2 … with the marker bold and underlined in `caption`, and reuse the marker inline in the body where the claim is made; links are `link`, underlined, the URL written out (arXiv, GitHub issue and source-line links are the norm).
- A reading page quotes a paper in the researcher's words: two to five typed-dash lines of what it does and what differs from ours, one to three of its figures, and the arXiv link in *1.
- No emoji on slides; ✅ and ❌ are allowed only inside Chinese working notes. Inside draw.io diagrams, ❄️ marks frozen weights and 🔥 trainable ones, and nothing else is an emoji. Arrows are typed characters: → for "becomes", ⤷ before a run ID, ➔ as the bullet for a consequence.
- A photo section slide introduces a block of slides with a short noun phrase or a question. In a shared deck, a plain divider with the presenter's name in `slide-title`, centred mid-slide, opens their section; sub-sections inside it are plain dividers too.

## Color

- Ground every slide in `surface`. Set titles, body, leads, prose, tables, the rules and the table grid in `ink`. `ink-muted` is for the cover subtitle and the numbered notes under a table; `ink-faint` only for a tentative aside in a discussion page, never for anything the room must read.
- `amber` is the signature: the `topic` line, and the title of a TODO page; nothing else. Never reuse it for emphasis, bullets or table tints.
- Links are `link`, underlined. Nothing else in prose is blue.
- Inline code and paths sit in `ink-code` on a `surface-code` chip. Inside code blocks, program source is `code-orange`, special tokens such as `<OBJxxx>` and dataset paths are `code-green`, and the words of a system prompt are `code-blue`; a bold run name may be `run-blue` (kept from the decks, 2.7:1; prefer `code-blue` on new slides).
- Highlights behind text: `mark-orange` for a run-ID callout, `mark-blue` for chat-template control tokens, `mark-yellow` for a WIP label. Always `ink` on them.
- Red means attention: `alert-deep` for text and the key formula, `alert` for the `outline` rectangle drawn over a figure. Never red as a table tint.
- Results tables: `surface-head` for the header row and the reference run, `band-blue` for the first comparison group, `band-orange` for the second. Settings and literature tables: `surface-head-blue` on a bold header row and no bands. Blue and orange, never green and red; a third group gets no tint.
- Over a screenshot or an image-rendered table, point with `overlay-peach` and `overlay-pink` rectangles; they are 50% translucent so the content under them stays readable.
- The cover photo always lies under `veil`; the title is `ink` and the subtitle `ink-muted` on it.
- Inside draw.io diagrams use only the `fig-` tokens, each fill with its named stroke: `fig-llm` for the backbone slab (label `fig-llm-label`), `fig-decoder` for mask decoders, `fig-head` for small heads, `fig-text-decoder` for text and output heads, `fig-module` for external or frozen modules and the stage frame, `fig-layer` for a repeated layer frame, `fig-projector` for projectors, `fig-frozen` and `fig-trainable` for LoRA badges and token chips, `fig-state`, `fig-obj`, `fig-query` and `fig-lat` for token cells, `fig-grid` with `fig-voxel-1` … `fig-voxel-8` for scene grids, `fig-note` for notes and loss boxes, `fig-stroke` for plain strokes, `fig-attn-red` for attention annotations, `fig-dot-blue` / `fig-dot-orange` / `fig-dot-red` for query-to-mask links.

## Type

- Arial is for the title tier only: `cover-title`, `slide-title`, `topic`, `cover-subtitle` and the centred line of a plain divider. Times New Roman is every other word on the slide: `lead`, `prose`, `body`, `caption`, `table`, `table-dense`, `run-label` and `slide-number`. Courier New is code typed on the slide (prompt templates, inline chips). Do not add a fourth slide family; a pasted link in Meiryo is reset to the style of the text around it. Rendered pictures bring their own faces: Hack inside Carbon code images, Computer Modern inside rendered math and pseudocode.
- The scale in PowerPoint points. Arial: `cover-title` 26 bold, `slide-title` 22, `topic` 12.5 in amber, `cover-subtitle` 14 bold. Times New Roman: `prose` 13, `lead` 12, `body` 12, `run-label` 11.5, `table` 9, `caption` 8, `table-dense` 8. Courier New: `code` 10, `code-inline` 8. Nothing on a slide is smaller than 8pt; a tree, a log or a table note that wants 6 or 7pt becomes a screenshot, a footnote link or an 8pt note.
- `slide-title` is regular weight, `cover-title` is bold. Bold inside `body`, `prose`, `lead` and `code` marks the claim, the role label or the variable, never a whole paragraph.
- Left-align everything except table cells, the slide number and the text of a plain divider, which are centred. Justify nothing. Line spacing 100%, paragraph spacing 0; add 12pt before a paragraph only to separate two blocks inside one text box.
- Lists: a typed dash for flat observations and the lines of a reading page (a second level is two spaces and a dash), ➔ for consequences, 1. for ordered steps and findings with a. for sub-steps, and ● with ○ beneath it only for the nested outline of a review page; each level indents one `space-6`.

## Slide anatomy

The slide is 10 × 5.625 in (960 × 540 px at 96 px/in). Place by these anchors, never by eye.

| Element | Box (in) | Box (px) | Style |
| --- | --- | --- | --- |
| Slide title | x 0.40, y 0.20, 9.2 × 0.45 | 38, 19, 883 × 43 | `slide-title`, no inset |
| Topic | x 0.40, y 0.63, 9.2 × 0.30 | 38, 60, 883 × 29 | `topic`, no inset |
| Rule | x 0.40 → 9.60, y 1.00 | 38 → 921, 96 | `rule` (1pt) in `ink` |
| Lead, notes or prose | x 0.33, y 1.02, 9.33 wide | 32, 98, 896 | `lead` / `body` / `prose`, inset `space-2` or `inset-body` |
| Body and figures | y 1.55 → 5.20 (from 1.02 with no lead) | 149 → 499 | — |
| Table without a lead | x 0.56, y 1.14 | 54, 109 | `table` or `table-dense` |
| Two columns | x 0.33 and 5.12, each 4.55 wide | 32 and 491, 437 each | `code` or `body`, inset `space-2` |
| Body rule | x 0.33 → 9.66, at the split | 32 → 927 | `rule` in `ink` |
| Footnote | x 0, y 5.24, up to 8.6 wide | 0, 503, up to 830 | `caption`, inset `space-2` |
| Slide number | x 9.31, y 5.28, 0.89 × 0.30 | 894, 507, 85 × 29 | `slide-number`, centred |
| Plain divider | x 0.33, y 2.57, 9.33 × 0.48 | 32, 247, 896 × 46 | `slide-title`, centred |
| Cover title | x 0.34, y 1.84, 9.32 × 1.94, middle-anchored | 33, 177, 895 × 186 | `cover-title` |
| Cover subtitle | x 0.36, y 4.34, 9.32 × 1.0, middle-anchored | 35, 417, 895 × 96 | `cover-subtitle` |

- Margins are `space-4` left and right; the header alone (title, topic, rule) starts at `header-left`, 0.07in further in, with no text inset. Figures side by side are `space-3` apart; stacked blocks are `space-6` apart. Leave the band below `body-bottom` to the footnote and the number.
- Every content slide carries the title, the topic and the rule, even when the body is one full-width figure. A slide that cannot be captioned by a category word and a topic is two slides.
- A page that holds two things (a review and its figure, a list and its table) splits them with one body rule at the split, never with a box.

## Imagery

- Figures are the body: most content slides are one to three pictures. Place them with no border, shadow or rounded corner (`radius-0`); scale to fit the body box, keep the aspect ratio, leave `space-3` between two, and never let one climb into the header band beside the title. Rendered equations, pseudocode and code images are placed the same way.
- A paper's own figures go on its reading page as they are, with the paper's name in the topic and the link in the footnote; annotate them with `outline` in `alert` when the talk points at one part.
- Screenshots and image-rendered tables are allowed; annotate them with `overlay-peach` and `overlay-pink` rectangles and an `outline` in `alert`. Set a figure's run ID in `run-label` just above its top-left corner.
- Plots keep their tool's styling; give the two series that matter `fig-voxel-1` and `fig-voxel-4`.

## Diagrams

- Every architecture figure is drawn in draw.io, kept as a `.drawio` source next to its export under `assets/Diagrams/`, and placed on the slide as the exported PNG (scale 2) or SVG. Never redraw an architecture on the slide with shapes, and never paste a screenshot of the editor. Export headless with:

```
drawio --export --format png --scale 2 --border 16 --output figure.png figure.drawio
# (the flatpak build: flatpak run com.jgraph.drawio.desktop …; the research-slides skill's drawio-export.sh finds whichever is installed)
```

- Start from `assets/Diagrams/research-slides-diagram-kit.drawio`: it holds one styled instance of every element. Copy the element, keep its style string, change the label.
- The vocabulary, left to right as data flows: a scene or voxel grid (`fig-grid` cells, occupied cells in `fig-voxel-n` with a `fig-stroke` outline, a cube outline for point clouds), token stacks (a white rounded column with an `ink` stroke holding 16px rounded cells: `fig-state` for hidden states, `fig-obj` for question and object tokens, `fig-query` with a white label for decoder queries, `fig-lat` for latents), the backbone as one tall `fig-llm` slab labelled in `fig-llm-label` Times New Roman 18, LoRA badges on the slab (`fig-frozen` with ❄️, `fig-trainable` with 🔥, Times New Roman 11), modules as rounded boxes (`fig-module` for encoders and attention blocks, `fig-decoder` for the mask decoder, `fig-head` for query MLPs and splits, `fig-projector` for projectors, `fig-text-decoder` for text and output heads), special tokens as `fig-trainable` chips (<OBJxxx>, <SEG>), repeated layers as dashed `fig-layer` frames, a whole stage as a dashed `fig-module` frame at 35% opacity, and notes or losses in a `fig-note` box.
- Lines: data arrows in `ink` at 1.2pt with a classic head, orthogonal; attention masks and "Bi-direction Attn" in dashed `fig-attn-red`; query-to-mask correspondences as dotted oval-ended curves in `fig-dot-blue`, `fig-dot-orange`, `fig-dot-red`. Corners `radius-fig` (rounded=1) on every box, badge and cell; grid cells stay square.
- Labels are Times New Roman: 11 on badges, 15 for small labels and quoted inputs (Q: "Where is the chair?" in italic), 17 on boxes, 18 on the backbone, 19 inside a decoder layer. Equations are LaTeX in \( … \) with math enabled on the page; loss terms under a box are `fig-stroke` at 15.
- One diagram answers one question: a pipeline, a decoder, a comparison of variants side by side with a title over each. A comparison is one page with one column per variant, exported once, not three slides.

## Tables

- Build results tables as real tables in `table` (9pt), with a `hairline` grid in `ink`, cell padding `space-2`, text centred, the run ID or method name in the first column. The header row sits on `surface-head` in bold; the reference run (last week's baseline) also sits on `surface-head`, directly under the header. Tint whole rows, never cells: `band-blue` for group one, `band-orange` for group two; bold the single best number in a column.
- Build settings and literature tables (one row per paper, model or representation) in `table-dense` (8pt) with a bold header on `surface-head-blue` and no bands; put a check mark as the letter v, and explain a cell with a numbered note in `caption` and `ink-muted` directly under the table, one line per number.
- A table that has no lead starts at `table-top`; above ten columns drop to `table-dense`, never lower. A table deeper than fourteen rows is two slides.

## Code and prompts

- Program source and a model's code answer are Carbon images, never typed on the slide: monokai window on a `surface-carbon` pad, Hack 14px (`code-figure`), 133% leading, line numbers, window controls, 20px padding, no drop shadow, exported at 2×. The code image is the one dark block a slide may carry; place it like a figure (no added border, shadow or radius) with a `prose` label above it ("Prompt:", "Response: (Qwen3-8B-Base)"). Two answers are compared in the two columns of `column-w`.
- Prompt templates stay slide text, because their marks carry meaning that syntax highlighting cannot: `code` blocks with role labels (System:, User:, Assistant:) in `code-role`, placeholders such as {Scene info} bold in `alert`, chat-template tokens (<|im_start|>) on `mark-blue`, the system prompt's own words in `code-blue`.
- Config keys, paths and filenames inside prose or table cells are `code-inline` on a `surface-code` chip; paths inside a prompt block are `code-green`.

## Math and pseudocode

- Equations are rendered from LaTeX with the local TeX Live (`standalone`, 10pt Computer Modern, `equation` style) and placed as pictures at 1:1 with the 12pt body, up to 1.5× on a slide that is only the equation; never typed with the slide's equation editor or a web renderer. The source `.tex` stays beside the `.png` under `assets/Math/`. Notation is shared: `\LLM`, `\BCE`, `\Dice`, `\Lloss{LM}`, `\tok{OBJ}`, `\argmax`.
- Inside prose, a short formula may still be typed in `prose` and, when it is the one the page turns on, bold in `alert-deep`; anything with fractions, sums or subscripts of subscripts is rendered.
- Pseudocode is `algorithm2e`: ruled, line-numbered, semicolons hidden, `\Input` / `\Output` lines, right-aligned `\Comment*` notes (`pseudocode` style), one algorithm per slide under a lead that says what it decides. Rendered and placed like an equation.
- Computer Modern in rendered math matches the MathJax equations inside draw.io diagrams, so a formula on the slide and the same formula in a figure look alike.

## Cover and sections

- The cover is `assets/Backgrounds/cover-temple-night.jpg` stretched to the slide under `veil`, the title "Progress Report" in `cover-title`, and the `cover-subtitle` on two lines: the project name, then the date written "Oct. 28, 2026".
- A photo section slide is the cover without the subtitle; its title is the section's question. It may carry a footnote with the link to the tracking issue.
- A plain divider is a white slide with one line of `slide-title` centred at `divider-top` and the slide number: the presenter's name at the head of their section in a shared deck ("冠霆"), or a sub-section's name ("Flow-based Latent Reasoning (FLaRe)"). It carries nothing else.
- No slide number on the cover; section slides and dividers keep theirs.

## Iconography

None on slides. The system uses no icon set and no pictograms; direction and status are typed characters (→ ⤷ ➔ ✅ ❌) in the running text style. The only pictographs are ❄️ and 🔥 beside LoRA badges inside draw.io diagrams. Do not introduce icons.

## Building a deck

- Google Slides or PowerPoint, 16:9 at 10 × 5.625 in, theme fonts Arial for headings and Times New Roman for body, colors as in `tokens.json`.
- Start from the template layouts Cover, Section, Divider, Content and Content + lead in `research-slides-template.pptx`: duplicate the sample slide that matches the component you need and replace its content; figures, tables, columns and prose are composed on the Content layouts at the anchors above.
- To have an agent build a deck, give it this system's link and, per slide, the category word, the topic line, the lead and the figure or table; it reads this README, places by the anchors, and draws every architecture figure from the kit in `assets/Diagrams/` before exporting it.
- Before placing a figure: edit or copy its `.drawio`, export with the command under Diagrams, put the PNG on the slide and keep the source beside it. Equations, pseudocode and code go the same way through the `research-slides` skill's `tex2img.sh` and `code2img.sh`, source beside export under `assets/Math/` and `assets/Code/`.
- A deck runs Cover → (Section → content slides)* → Next steps, twelve to twenty-five content slides a week, one message per slide. In a shared deck the researcher's block runs Divider → content slides → TODO.
