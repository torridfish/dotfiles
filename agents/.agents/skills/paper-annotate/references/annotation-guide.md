# Annotation guide

## Highlight classes

Mark the span that does the work, usually a clause or a noun phrase. A whole paragraph in one color tells the reader nothing. Two to four marks per paragraph is typical. Zero is fine for a transition paragraph.

Keep a mark under about 25 words. When a whole sentence carries the role, mark its core clause and leave the framing ("We hypothesize that", "As shown in Table 2,") outside. Keep the total under half of the paragraph: when most of a paragraph is marked, the marks stop pointing at anything. End the mark before the closing period or comma.

### `h-thesis` (yellow): claims

- The sentence the paper exists to defend. Usually in the abstract and the last paragraph of the introduction, and again in the conclusion.
- A section's main claim: "X outperforms Y by Z" in a results paragraph is a claim when the paragraph goes on to support it, and evidence when it is the support.
- "We argue that …", "We show that …", "Our results suggest …".

Not a thesis: a description of what the paper does ("we introduce X"). That is method.

### `h-concept` (red): terms

- A term the paper defines, on the sentence that defines it.
- A term the paper borrows and relies on, on its first use only.
- A named baseline or benchmark on its first use in a section, when the reader must remember what it is.

Not a concept: every later use of the term. Mark it once.

### `h-evidence` (blue): support

- A number with its unit and its benchmark: "62.2 Acc@25 on ScanRefer".
- A qualitative observation the authors present as support: "the model runs out of memory without voxel pooling".
- A reference to a table or figure that the claim rests on.

Not evidence: a number that describes the setup (batch size, learning rate). That is method.

### `h-concession` (green): objections handled

- A limit the authors admit: "we assume the scene is static".
- A counterargument they raise and answer: "one could argue …, however …".
- A scope restriction: "among LMM-based models", "on in-domain benchmarks".
- A caveat on a comparison: "whose weights are not released", "numbers taken from prior work".

The scope restriction case matters most. A claim that is true only inside a restriction reads as a general claim when the restriction is not visible.

### `h-method` (purple): what they did

- The mechanism: the architecture change, the loss, the data flow.
- The setup: datasets, metrics, hardware, training length.
- The experimental design of an ablation: what was varied.

## Annotation fields

### Function

One label from this list, then a half sentence of what specifically:

states the problem, motivates, defines a term, states the claim, describes the method, reports evidence, compares to prior work, handles an objection, admits a limit, concludes.

Example: "Reports evidence: the headline grounding numbers against every baseline class."

### Role

Say what the paragraph depends on and what depends on it. Use the paragraph ids.

Example: "Supports the claim in p6. The ablation in p24 tests whether this component is the cause."

### Note

A technique, a gap, or one of each. Each one is a separate block that starts with its tag (Technique or Gap).

Technique worth copying:
- A comparison that isolates one variable.
- A claim stated with its scope restriction in the same sentence.
- A limitation stated before the reviewer finds it.
- A figure that contrasts the design against the alternatives.

Gap:
- A number without variance, seeds, or a confidence interval.
- A comparison across different backbones, data, or compute without saying so.
- A baseline missing because its code is not public, with no substitute.
- A claim in the text that is stronger than the number in the table.
- A term whose meaning shifts between sections.
- A causal explanation for a result that the experiments do not test ("we attribute this to …").
- An ablation on a subset (50 scenes) used to support a claim about the full benchmark.
- "Comparable" or "closely matches" used for a gap the table shows as a loss.

Do not write a note that applies to any paper. If the note does not name a paragraph, a table, a number or a term, rewrite it.

## Argument map

Skeleton tiles, each one or two lines:

- Problem: what fails today and why it matters.
- Claim: what the authors say fixes it.
- Method: the mechanism in one line.
- Evidence: the two or three numbers that carry the claim, with their benchmarks.
- Objections: what the authors concede or exclude.
- Conclusion: what the authors say the reader should take away.

Core claim in one sentence: the thing the reader is asked to believe, with the main number, with the scope restriction included.

Strongest point: the one place where the evidence and the claim fit best. Name the paragraph or table.

Weakest point: the one place where the claim outruns the evidence, or an assumption that the experiments do not test. Name the paragraph or table. Say what evidence would close the gap.
