---
name: paper-annotate
description: Turn an academic paper into one annotated HTML page for close reading, with the original text, a plain-English restatement in Simplified Technical English (ASD-STE100), five-color highlights for the argument (thesis, concept, evidence, concession, method), a per-paragraph annotation column, and an argument map at the end, then publish it as an Artifact. Use whenever the user asks to read a paper closely, to annotate a paper, for a 批注 / 精讀 / 逐段 version, or for an HTML reading page of a paper, even if they do not name the format.
---

# paper-annotate

The page is a two-column reading view. The left column shows each paragraph of the paper with its argument parts highlighted, then a restatement of that paragraph in plain English. The right column shows an annotation card for that paragraph. The page ends with an argument map of the whole paper.

The idea comes from a prompt that circulates for a Chinese bilingual version. This skill keeps the layout and replaces the translation with an ASD-STE100 restatement, because the user reads English and needs the argument made explicit, not translated.

## 1. Get the paper

Follow the user's global rule for papers:

1. arXiv: fetch the LaTeX source from `https://arxiv.org/src/<id>` into a new empty folder in the scratchpad, extract it, and read the `.tex` files. Resolve `\input` from `main.tex`. Read the table files too: the annotations cite real numbers from them.
2. No source: fetch the HTML (`https://arxiv.org/html/<id>`), or the publisher page.
3. PDF last. A local PDF goes through the `convert-documents-to-markdown` skill.

Record the title, authors and year from the source, not from memory.

### Check the venue

A conference template in the LaTeX is not evidence of acceptance. The template can be from a workshop, from a rejected submission, or from an earlier venue. Run the check for every paper:

```bash
uv run --no-project <skill-dir>/scripts/venue_check.py --arxiv <id>
uv run --no-project <skill-dir>/scripts/venue_check.py --title "<title>" --first-author <family name>
```

The script asks arXiv, OpenReview, Crossref, OpenAlex and Semantic Scholar, and prints one line per fact. Read the lines this way:

| Line | Meaning | Write in the title band |
|---|---|---|
| `PUBLISHED: … <proceedings> …, DOI …` | The paper is in the proceedings. This is the strongest evidence. | The venue and year, for example "ECCV 2026" |
| `OPENREVIEW: <venue> Poster / Spotlight / Oral -> accepted (…)` | Accepted, with the presentation type | "ICLR 2026 (Spotlight)". A workshop stays a workshop: "CVPR 2026 Workshop (OpenSUN3D)" |
| `OPENREVIEW: Submitted to <venue> -> submitted` | Under review, or rejected with no public decision. The record does not say which. | "arXiv preprint" and tell the user about the record |
| `OPENREVIEW: … -> withdrawn / rejected / desk rejected` | That submission did not end in acceptance | "arXiv preprint" and tell the user about the record |
| `ARXIV journal-ref` or a venue in `ARXIV comment` | The authors' own statement | The venue, unless a stronger line disagrees |
| `NO VENUE EVIDENCE` | No public record | "arXiv preprint" |
| `NO ANSWER from: …` | A source did not reply | Run the script again before you conclude |

When two lines name different venues (a workshop poster and a later main-conference paper), the title band names the archival publication, and the report to the user names both.

Limits that you must state, not hide:

- Only venues that run on OpenReview with public records show a review status. ICLR and TMLR show every submission. NeurIPS shows accepted papers and the rejected papers whose authors agreed. CVPR, ICCV, ECCV, ICML and ACL keep submissions private: for them the public facts are "accepted" or "no record", never "under review" or "rejected".
- The presentation type (poster, oral, highlight) comes from OpenReview or from the conference's own program page. Crossref does not record it. When no source states it, do not write one.
- A title match is not an identity match. The script compares the first author's family name on Crossref records. For a common title, open the OpenReview or DOI link and compare the author list.
- Proceedings records appear weeks or months after the decision. For a recent paper with no record, check the project page, the code repository README and the conference's accepted-paper list by hand, and name the page that you relied on.

Never write a venue that has no line of evidence. Never write "(unconfirmed)" in the title band: either there is evidence and you name the venue, or there is none and the paper is an arXiv preprint.

## 2. Agree on the scope

Default scope: Abstract, Introduction, Method, the main results paragraphs of Experiments (datasets and metrics in one line, each headline result as its own paragraph), Limitations, Conclusion. Skip Related Work, Acknowledgements and the Appendix. The nav lists only the sections that are on the page, with the paper's own section numbers. Say which sections were skipped in a small note beside the next section heading, and in the report to the user.

Adjust the scope to the reading purpose when the user gives one:

| Purpose | Change |
|---|---|
| "I want to reimplement it" | Add the full Implementation Details and the appendix sections on hyperparameters and architecture. Trim Introduction to the problem statement and contributions. |
| "I am reviewing it" or "find the weak points" | Add every ablation and every baseline paragraph. Keep Related Work. Make the note field of each annotation name a possible weakness. |
| "I am writing related work" | Keep Introduction and Related Work in full. Reduce Method to its overview paragraph and Experiments to the headline results. |
| "I only need the gist" | Abstract, the contributions list, the method overview, the headline results, Conclusion. |

If the paper is long (more than about 40 paragraphs in scope) tell the user the paragraph count and ask whether to cut before you write.

## 3. Write the content

Work paragraph by paragraph. Keep the paper's own paragraph breaks. A figure or table caption that carries an argument (a comparison of designs, a headline number) is a paragraph too. Equations stay inside their paragraph.

A numbered subsection of the paper (3.1, 4.2) is an `<h3 class="sub">` heading between paragraph rows. A run-in heading of the paper (`\paragraph{…}`, a bold lead-in) stays at the start of its paragraph in bold. The label after the paragraph badge is only for labels that the page adds, such as "Figure 2 caption".

### Figures and tables

Include every figure and table that the in-scope text refers to. Put each one before the paragraph that first refers to it, and after the subsection heading. Make every "Figure N", "Table N" and "P<n>" mention a link to its target.

- **Figures**: convert the source file to WebP at about 1800 px wide and save it in `figures/` next to the page.

  ```bash
  pdftocairo -png -singlefile -scale-to-x 1800 -scale-to-y -1 fig.pdf figures/fig1-name
  magick figures/fig1-name.png -quality 82 figures/fig1-name.webp && rm figures/fig1-name.png
  ```

  Give the image real `width`, `height` and a one-sentence `alt`. Use the paper's caption. When the caption carries an argument, annotate it as a paragraph and let the figure caption say "The caption is annotated below as P<n>."
- **Tables**: transcribe the LaTeX table into an HTML table. Never use an image of a table. Keep the paper's row groups (`tr.grp`), mark the paper's own rows (`tr.ours`), keep the paper's bold, and write column headers in full (CIDEr, not C). Copy numbers from the source file, one cell at a time. A table with several small parts (ablations) is a `.tbl-grid` of small tables inside `<figure class="fig mid">`.
- If the source has no usable figure file (a TikZ picture, a missing PDF), say so in the report and keep a text caption. Do not redraw the figure.

### Original text

Copy the sentences verbatim. Strip LaTeX commands, keep the words. Citations become bracketed short names, `[LLaVA-3D]`, not numbers. Inline math becomes `\( … \)` and display math `\[ … \]` for MathJax.

Highlight with `<mark class="h-…">` on the span that carries the role. Mark phrases, not whole paragraphs: at most about 25 words per span, and less than half of a paragraph in total. One span has one class. The closing period or comma stays outside the mark. A literal token name such as `<REF>` is `<code>`. Rules per class are in `references/annotation-guide.md`. A paragraph with no highlight is allowed.

| Class | Role | Fill | Underline |
|---|---|---|---|
| `h-thesis` | the claim the paper defends, or a section's main claim | yellow | thick solid |
| `h-concept` | a term the paper defines or relies on | coral | dotted |
| `h-evidence` | a number, a benchmark result, an observation | blue | double |
| `h-concession` | a limitation admitted, a counterargument handled, a scope restriction | green | wavy |
| `h-method` | what the authors did: the mechanism, the setup | violet | dashed |

The template draws the fill and the underline, shows the role name in a small tag when the reader hovers or focuses a highlight, and lets the reader select one role in the legend to hide the others. Do not add role names to the text.

### Restatement

Write the paragraph again in plain English under the ASD-STE100 rules (the `asd-ste100` skill, STE-flavored mode): active voice, one idea per sentence, at most 25 words per sentence, no semicolons, no phrasal verbs, no nominalization, simple tenses. Keep every number, every hedge and every scope qualifier. Add nothing the paragraph does not say. Define an acronym on its first use in the restatement even if the paper defined it earlier.

The restatement is shorter than the original but not a summary. A reader who reads only the restatements should still follow the whole argument.

Run the linter on the restatements before you publish:

```bash
python3 -I ~/.claude/skills/asd-ste100/scripts/ste-lint.py restatements.txt
```

Fix hard violations. Advisory findings (passive voice where the actor is unknown, a compound tense that carries a hedge) may stay.

### Annotation card

Three fields, each one or two sentences, in the same STE style:

- **Function**: what the paragraph does in the text. Pick from: states the problem, motivates, defines a term, states the claim, describes the method, reports evidence, compares to prior work, handles an objection, admits a limit, concludes.
- **Role**: where the paragraph sits in the chain problem → claim → method → evidence → objection → conclusion, and what it depends on or supports.
- **Note**: one technique the authors use that is worth copying, or one gap, or one of each. Each is its own `<p>` that starts with `<span class="pill tech">Technique</span>` or `<span class="pill gap">Gap</span>`. Name the gap precisely: a missing baseline, a number without a confidence interval, a claim that the table does not support, a definition that shifts. Do not write "the paper could be clearer".

Refer to other paragraphs by id and link them: `<a class="pref" href="#p33">P33</a>`.

### Argument map

The last section of the page, in this order:

1. **Skeleton**: six tiles, Problem, Claim, Method, Evidence, Objections, Conclusion, each with one or two lines.
2. **Core claim in one sentence**: what the authors ask the reader to believe, with the main number.
3. **Strongest point** and **Weakest point**, one card each, each with the reason and a pointer to the paragraph or table it rests on.

## 4. Build the page

Start from `references/template.html`. It has the tokens, the layout, the highlight classes, the card styles, dark mode and the phone layout. Copy its `<style>` and structure, replace the sample content. Do not restyle it: the page's value is that every paper reads the same way.

Rules the template follows and the page must keep:

- Fonts: Lora for the original text, IBM Plex Sans for everything else, both from Google Fonts with fallbacks.
- Math: MathJax 3 SVG output from cdnjs (`tex-svg.js`). SVG output needs no font files, which the Artifact sandbox blocks. Do not use KaTeX.
- Title band: the paper title, then the authors on one line, and on the next line the venue followed by the links: the paper (arXiv, plus the DOI when the venue check found a published version) and, if the paper has one, the project page. The items on that line are two spaces apart, with no dots. Nothing else: no affiliation, no reading purpose, no scope.
- Sticky bar: the section links on the left, the five-role legend on the right. Each legend item is an "Aa" sample in the highlight style of that role.
- Every paragraph is one `<article class="para" id="p<n>">` grid row with `.orig`, `.plain` and `.note` cells. The annotation card stays in view while its paragraph scrolls on wide screens and follows the paragraph on phones.
- Section headings are `<h2 id="s<n>">` and appear in the sticky nav. Subsection headings are `<h3 class="sub">`.
- Keep the script at the end of the template. It makes highlights focusable, runs the legend filter and marks the current section.
- Colors come from tokens on `:root` with dark values under both dark selectors.

The page file is an Artifact fragment: no doctype, images as relative `figures/…` paths. Save it as `page.html` next to the paper source with its `figures/` folder.

1. Publish `page.html` with the Artifact tool (icon `book`, description "Annotated reading page for <paper title>"). Pass the folder as `root` and each image in `files`, so the images are served beside the page.
2. Make the single-file local copy, which adds the document skeleton and inlines the images:

   ```bash
   python3 <skill-dir>/scripts/standalone.py page.html -o annotated.html
   ```

Tell the user the Artifact link and the path of `annotated.html`.

## 5. Hand back

Report in a few lines:

- Scope: which sections are in and which were skipped, and the paragraph count.
- The core claim in one sentence, as written in the argument map.
- The weakest point, so the user knows where to look first.
- The venue and the evidence line that supports it, plus any other record that the check found (a workshop version, a withdrawn submission).
- Anything you could not verify (a number the source did not contain, a figure you could not read).

## Files in this skill

- `references/template.html`: the page skeleton with tokens, layout, the legend and filter script, and samples of a paragraph row, a figure, a table and the argument map.
- `scripts/standalone.py`: makes the single-file local copy of a page.
- `scripts/venue_check.py`: collects public evidence for the venue and the review status of a paper.
- `references/annotation-guide.md`: when to use each highlight class, how to write the three annotation fields, a list of common argument gaps.
