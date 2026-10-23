---
name: github-math
description: This skill should be used when writing or editing mathematical expressions in Markdown that will be rendered on GitHub — READMEs, issues, PR descriptions, discussions, gists, wikis, or release notes. Activates when the user asks about LaTeX math in .md files, GitHub math rendering problems (raw $...$, "macros are not allowed", "Unable to render expression"), choosing between ```math fences, $`...`$ inline math, and portable $...$/$$...$$ delimiters, or making formulas render correctly across GitHub, VS Code, Obsidian, and pandoc.
---

# Math that renders on GitHub

GitHub does not run LaTeX. Your formula goes through a pipeline, and each stage can break it in a way that looks like dead code to the reader: raw `$...$`, a half-italic equation, a red "macros are not allowed" box, or "Unable to render expression". Knowing the pipeline lets you predict failures instead of memorizing them.

## The pipeline (why things break)

1. **Markdown runs first.** GitHub's Markdown parser (cmark-gfm with a private math extension) processes your text *before* the math renderer sees it. Inside `$...$` and `$$...$$`, ordinary Markdown still applies: `_` and `*` can pair into `<em>` (pairing is paragraph-wide, so an opener in one formula can close in the next), a backslash before punctuation is an escape (`\{` becomes `{`, `\,` becomes `,`), `[a](b)` becomes a link, `<` glued to a character opens an HTML tag, a backtick opens a code span, a line starting with `-` or `*` starts a list, `~` can start strikethrough. If an HTML tag ends up inside the span, MathJax skips the whole span. Two syntaxes bypass this stage because they are *code* syntaxes: the fenced ```` ```math ```` block and the inline `` $`...`$ `` form. Their content reaches MathJax verbatim.
2. **MathJax 3.2 runs in the browser** with a trimmed package set. Loaded: base, ams, amscd, boldsymbol, braket, bussproofs, cancel, cases, centernot, color, empheq, enclose, extpfeil, gensymb, mathtools, mhchem, noundefined, textcomp, textmacros, unicode, upgreek, verb. Removed: `newcommand` (no `\newcommand`, `\def`, `\let`, `\renewcommand`, `\newenvironment`), `html` (no `\href`, `\class`, `\style`, `\cssId`), `bbox`, `action`, `require` (so no `\require{physics}` or any on-demand package), `colortbl`, `noerrors` (syntax errors show a red error box). An undefined macro renders as red text and the rest of the block survives. Anything that is LaTeX-but-not-MathJax (`tabular`, TikZ, `\usepackage`, `\includegraphics`, `\label`/`\ref` across blocks, `\cite`) never worked in Markdown math anywhere.
3. **GitHub adds its own guards.** A macro blocklist replaces the *entire* expression with "The following macros are not allowed: …". `\operatorname` and `\operatorname*` are confirmed members; `\phantom`/`\hphantom`/`\vphantom`, `\DeclareMathOperator`, `\definecolor`, `\colorbox`, `\fcolorbox` and `\DeclarePairedDelimiter` have been reported. Size limits produce "Unable to render expression": roughly 1000 braces or macros in one expression, 50 or more `\color` calls in one block, `\rule`, and very many heavy expressions on one page.

Everything below is the practical consequence of those three facts.

## Step 1: pick a mode

Ask where the text will be *read*, not where it is stored.

**GitHub-only mode (default)** — issue/PR/discussion bodies and comments, review comments, gists, wiki pages, release notes, and any `.md` the user says is only read on github.com. Use the code-style delimiters; they are the most reliable thing GitHub offers (about 60% on a community torture test versus 40% for `$`).

**Portable mode** — a README or docs `.md` that people also open in VS Code, Obsidian, pandoc, MkDocs/Hugo, Jupyter or a paper pipeline; or the user asks for "standard LaTeX"; or the file already uses `$`/`$$` throughout and you are editing a small part. Use `$...$` and `$$...$$` but steer around the Markdown hazards below. The `` $`...`$ `` form shows literal backticks in other renderers, so avoid it here. A ```` ```math ```` fence degrades gracefully everywhere (other renderers show a readable code block with the TeX source), so it stays acceptable for a display block whose hazards cannot be rewritten away.

If a repo `.md` could go either way and the user is present, ask once. If nobody is there to ask, default README/docs to portable and everything else to GitHub-only, and say which you chose.

## Step 2: write with the right delimiters

### GitHub-only mode

Display math: a fenced block with the `math` info string, on its own lines, blank line before and after.

````markdown
```math
\mathcal{L}(\theta) = -\sum_{i=1}^{N} \log p_\theta(y_i \mid x_i)
```
````

Inline math: dollar, backtick, content, backtick, dollar — the backticks hug the `$` signs, not the content.

```markdown
The gradient $`\nabla_\theta \mathcal{L}`$ vanishes when $`\{x : f(x) = 0\}`$ is empty.
```

Inside these two forms you may use `\{`, `\}`, `\,`, `\;`, `_` after `}`, mid-line `\\`, `*`, `~`, `[...]`, `<` and `>` freely; Markdown never sees them. Three things still matter: escape a literal dollar as `\$`; inside a Markdown table cell you cannot use a fence and must still write `\|`, `\vert` or `\mid` instead of a bare `|`, because the table splitter runs before anything else; and a fence inside a list item must be indented to the item's content column or it ends the list.

### Portable mode

Inline: `$...$` with the dollars hugging the content (`$x$`, never `$ x $`). The closing `$` must not be followed by a letter or digit — write `$n$-th`, not `$n$th` — and `$5 and $10` is currency, not math. Display: `$$` alone on a line, the content on its own lines, `$$` alone on a line, with a blank line before the block (GitHub requires the line break in `.md` files), after it, and between two consecutive blocks (otherwise GitHub merges them). GitHub recognizes only dollar delimiters: `\(...\)` and `\[...\]` are not math on GitHub.

Then avoid the hazards. Each row is a pattern that breaks on GitHub and a rewrite that is still standard LaTeX:

| Hazard inside `$...$` or `$$...$$` | Why it dies | Portable rewrite |
|---|---|---|
| `_` right after `}` `)` `]` or a space: `\mathbf{F}_{AB}`, `\hat{x}_k`, `(x+y)_i` | CommonMark lets `_` open emphasis after punctuation; any later `x_{...}` in the paragraph can close it | Keep `_` after a letter or digit: drop braces around single tokens (`\mathbf F_{AB}`, `\hat x_k`, `\boldsymbol\mu_k`), or name the base first (`u = x+y`, then `u_i`), or move that block into a ```` ```math ```` fence |
| bare `*`: `A^*B^*`, `x*y` | `*` opens and closes emphasis even inside a word | `\ast`: `A^{\ast}B^{\ast}`, `x \ast y` |
| `\{` `\}` | backslash-escape of punctuation is consumed | `\lbrace` `\rbrace` |
| `\,` `\;` `\:` `\!`, and `\\[6pt]` row spacing | same (`\[` is an escape too) | `\thinspace` `\medspace` `\thickspace` `\negthinspace`, `\quad`, or `\ ` (backslash-space is safe); plain `\\` for rows |
| the TeX double-bar command (backslash followed by a pipe) | same | `\Vert`, or `\lVert ... \rVert` |
| `\_` | becomes `_` before MathJax sees it and turns into a subscript | avoid literal underscores: `\text{INT LITERAL}` with a space or hyphen, or a fence |
| `\\` in the middle of a source line | consumed; only a line-final `\\` survives | one matrix or `aligned` row per source line, `\\` at the end of the line |
| `a<b`, `x<-1` | `<` followed by a non-space opens an HTML tag | `a < b` with spaces, or `\lt` `\gt` |
| `]` directly followed by `(`: `[a,b](c)` | parsed as a link | `[a,b]\ (c)` or `\left[a,b\right] (c)` |
| backtick inside math | opens a code span | `\texttt{...}` or avoid |
| `~` as a non-breaking space | GFM strikethrough accepts single tildes | `\ ` or `\quad` |
| a continuation line in `$$` starting with `-` `+` `*` `>` `#` | starts a list, quote or heading and splits the block | end the previous line with the operator, or begin the line with `&` or `\quad` |
| a literal `$` in prose on the same line as math | confuses GitHub's dollar pairing | wrap it: `<span>$</span>5` |
| a bare pipe character inside inline math in a table cell | the table splitter runs first and splits the cell | `\vert`, `\mid`, `\lvert x \rvert` |

Context hazards apply to both modes: math inside link text, footnotes, headings, `**bold**` or `*italic*` runs, or raw HTML blocks (`<div>`, `<p>`, `<td>`) is not rendered or renders partially. A `$$` block inside `<details>` fails while ```` ```math ```` and inline forms work. A multi-line `$$` block inside a list item is unreliable; use an indented ```` ```math ```` fence there.

## Step 3: use only macros GitHub has

These substitutions are needed in **both** modes.

| You would write in LaTeX | On GitHub | Write instead |
|---|---|---|
| `\operatorname{softmax}`, `\operatorname*{argmax}_x` | blocked; the whole expression becomes an error box | `\mathrm{softmax}` for an upright word; `\mathop{\mathrm{softmax}}` when operator spacing matters; `\mathop{\mathrm{argmax}}\limits_{x}` or `\underset{x}{\mathrm{argmax}}` for limits; `\arg\max_x`, `\arg\min_x`, `\max`, `\min`, `\sup`, `\inf`, `\lim`, `\det`, `\exp`, `\log`, `\dim`, `\ker`, `\Pr` are built in |
| `\DeclareMathOperator`, `\newcommand`, `\def`, `\let`, `\renewcommand`, `\newenvironment` | not available | expand every use by hand; macros cannot be defined on GitHub |
| `\phantom{x}`, `\hphantom`, `\vphantom` | reported blocked | `\hspace{1em}`, `\quad`, `\mathstrut`, or restructure the alignment |
| `\definecolor`, `\colorbox`, `\fcolorbox` | reported blocked | `\color{red}{...}` or `\textcolor{#1f77b4}{...}` with named or hex colors |
| `\DeclarePairedDelimiter`, `\abs`, `\norm` | not available | `\left\lvert x \right\rvert`, `\left\lVert x \right\rVert` |
| `\bm{x}` | not a MathJax macro at all | `\boldsymbol{x}` (or `\mathbf{x}` for upright bold) |
| physics package: `\dv`, `\pdv`, `\qty`, `\vb`, `\ev`, `\mel`, `\comm`, `\order` | `\require` is disabled | `\frac{d f}{d x}`, `\frac{\partial f}{\partial x}`, `\left( \right)`, `\mathbf{v}`, `\langle A \rangle`, `\langle a \vert B \vert c \rangle`, `[A, B]`, `\mathcal{O}(n)` |
| `\mathbbm{1}`, `\mathds{1}` | bbm/dsfont cannot be loaded | `\mathbb{1}` or `\mathbf{1}` |
| `\llbracket ... \rrbracket` | stmaryrd not available | `[\![ ... ]\!]` inside a fence, or the Unicode characters ⟦ ⟧ directly |
| `\href`, `\class`, `\style`, `\bbox`, `\require`, `\toggle`, `\texttip` | removed | put links and styling in the surrounding Markdown |
| `\label` with `\ref` or `\eqref` | labels do not survive across blocks | number by hand with `\tag{1}` and say "(1)" in prose |
| `\begin{tabular}`, TikZ, `\includegraphics`, `\usepackage`, `\cite` | not math; never supported | a Markdown table, an image, or `\begin{array}{cc}` |

Available and safe: `\mathbb \mathcal \mathscr \mathfrak \mathrm \mathbf \boldsymbol \mathtt \text`, `\frac \dfrac \tfrac \binom \sqrt[n]{}`, `\sum \prod \int \oint \bigcup`, `\left \right \bigl \Bigr`, `\overset \underset \stackrel \xrightarrow[below]{above} \xleftarrow`, `\substack`, `\begin{cases}`, `aligned`, `gathered`, `pmatrix bmatrix vmatrix Vmatrix smallmatrix array`, `\tag{}`, `\coloneqq` and the other mathtools symbols, `\bra \ket \braket \Braket`, `\ce{H2O}`, `\cancel \bcancel \xcancel`, `\color`, `\enclose`, `\upalpha`, `\unicode{x1D4D0}`, `\mathstrut`, `\mathop \mathrel \mathbin`, `\limits \nolimits`, `\displaystyle`. For multi-line display math prefer `aligned` inside the block over a top-level `align`; it behaves the same on GitHub and also works in KaTeX-based renderers.

## Step 4: keep expressions small

Split a long derivation into several display blocks with prose between them rather than one 40-line block. Use color sparingly (well under 50 `\color` calls per block), avoid `\rule`, and do not nest `\left ... \right` many levels deep. If a page needs dozens of heavy expressions, ask whether some can be prose or code.

## Step 5: self-check before posting

Run these over the drafted Markdown and read every hit.

```bash
# Macro rows: a hit anywhere in math is a bug in every mode.
grep -nE '\\operatorname|\\DeclareMathOperator|\\newcommand|\\renewcommand|\\def\b|\\let\b|\\bm\{|\\href|\\phantom|\\hphantom|\\vphantom|\\definecolor|\\colorbox|\\require|\\dv\b|\\pdv|\\abs\{|\\norm\{|\\mathbbm|\\label|\\eqref' FILE
# Markdown-hazard rows: a hit inside $...$ or $$...$$ is a bug; hits inside ```math fences, $`...`$ or prose are fine.
grep -nE '[})\] ]_[{A-Za-z0-9\\]|\\[{},;:!_|]|\^\*|[A-Za-z0-9})]\*[A-Za-z0-9\\(]|<[A-Za-z0-9\\-]|\]\(|~' FILE
# Delimiter hygiene for $...$.
grep -nE '\$ [^$ ]|[^$ ] \$|\$[^$ ]+\$[A-Za-z0-9]' FILE
```

Then read the draft as the GitHub parser would: can any `_` or `*` pair up across the paragraph? Is any `\` followed by punctuation outside a fence? Is any `<` glued to the next character? Is any math inside a link, footnote, heading or bold run? Is any `|` in a table cell unescaped? Is the blank line before each `$$` block present?

## Debugging a formula that already fails

| Symptom on GitHub | Likely cause | Fix |
|---|---|---|
| raw `$...$` shown as text | a delimiter rule was violated (space after `$`, letter or digit after the closing `$`, math inside a link, footnote or HTML block), or emphasis formed inside the span | fix the spacing; move it out of the link; switch to `` $`...`$ `` |
| part of the formula is italic, or a subscript vanished | `_` or `*` emphasis formed inside `$` or `$$` | rewrite per the hazard table, or use a ```` ```math ```` fence |
| set braces or spacing commands disappeared | backslash-punctuation escapes consumed | `\lbrace` `\rbrace`, `\thinspace`, or a fence |
| matrix rows collapsed into one line | a mid-line `\\` was consumed | one row per source line with `\\` at the end, or a fence |
| "The following macros are not allowed: X" | GitHub's blocklist | substitute per Step 3 |
| a red macro name inside the formula | macro not in GitHub's MathJax package set | substitute per Step 3 |
| "Unable to render expression" | size limit, `\rule`, or too many `\color` | split the block, remove `\rule`, reduce color |
| renders on the web but not in the GitHub mobile app or in email | those surfaces have no math renderer | nothing to fix; keep the prose readable without the formula |

## Worked example

Request: "Add the stable log-softmax derivation to the issue."

GitHub-only output:

````markdown
Let $`z \in \mathbb{R}^K`$, $`p = \mathrm{softmax}(z)`$ and $`m = \max_k z_k`$. Then

```math
\log p_i
  = z_i - \log \sum_{k=1}^{K} e^{z_k}
  = (z_i - m) - \log \sum_{k=1}^{K} e^{z_k - m},
```

and every exponent is now $`\le 0`$, so the sum cannot overflow in fp16.
````

The portable version keeps the same structure and swaps delimiters: `$z \in \mathbb{R}^K$`, `$p = \mathrm{softmax}(z)$`, `$m = \max_k z_k$`, and a `$$` block with a blank line before it. Two choices made this safe in both modes: `\mathrm{softmax}` instead of the blocked `\operatorname{softmax}`, and naming `p` so that the subscript is `p_i` (underscore after a letter) rather than `\mathrm{softmax}(z)_i` (underscore after `)`, which could pair with the `_` in `\sum_{k=1}` and italicize half the line).
