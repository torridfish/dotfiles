# Deck recipes

Complete `scripts/deck.js` calls for every component in the design system. All coordinates are inches on the 10 × 5.625 in slide; `L` holds the anchors (`L.margin` 0.33, `L.leadTop` 1.02, `L.bodyTop` 1.55, `L.bodyBottom` 5.20, `L.tableLeft` 0.56, `L.tableTop` 1.14, `L.colW` 4.55, `L.col2Left` 5.12). `scripts/build-template.js` is the full worked example that produces `assets/research-slides-template.pptx`.

```js
const path = require('path');
const SKILL = process.env.RESEARCH_SLIDES_SKILL || '<skill-dir>';   // the folder SKILL.md lives in
const RS = require(path.join(SKILL, 'scripts/deck.js'));
const { marker, link, bold, chip, callout, alert, faint, formula, role, placeholder, chatToken, sysWords } = RS;
const deck = RS.create({ title: 'Progress Report 2026-11-05', author: 'torridfish' });
```

## Cover, sections, dividers

```js
deck.cover({ title: 'Progress Report', project: 'Woven Anypoint Project', date: 'Nov. 5, 2026' });
deck.section({ title: 'Experiment: Does KV cache help?', footnotes: [[marker('*1'), ' Link: ', link('https://github.com/torridfish/just3d/issues/17')]] });
deck.divider('冠霆');                       // the presenter's block in a shared deck
deck.divider('Flow-based Latent Reasoning (FLaRe)');   // a sub-section
```

## FigureSlide (header + lead + picture + footnote)

```js
const s = deck.content({ title: 'Experiment', topic: 'LLM backbone as its own proposer',
  lead: ['Will KV cache benefit downstream tasks?', 'Will this architecture close the gap between real score and oracle grounding score?'],
  footnotes: [[marker('*1'), ' Proposal should be scene-shared, so KV cache ', bold('reuse'), ' here might not be the main proposal.']] });
deck.figure(s, { path: 'figures/proposer.png', x: 2.2, y: 1.82, w: 5.6, h: 3.42 });
```

Two figures side by side with run labels, plus an outline and overlays on a screenshot:

```js
deck.figure(s, { path: 'figures/4-00.png', x: 0.48, y: 2.14, w: 5.45, h: 2.36, runLabel: '4-00' });
deck.figure(s, { path: 'figures/4-01.png', x: 6.18, y: 2.14, w: 3.17, h: 2.36, runLabel: '4-01', outline: { x: 6.3, y: 3.9, w: 1.5, h: 0.3 } });
deck.overlay(s, { x: 0.17, y: 2.66, w: 9.67, h: 0.42 });                 // peach: rows to look at
deck.overlay(s, { x: 3.9, y: 3.95, w: 3.1, h: 0.2, tone: 'pink' });      // pink: the problem row
```

Figure sizing: keep the aspect ratio; width ≤ 9.33 in, bottom ≤ `L.bodyBottom`. A draw.io export at scale 2 is 1:1 at `px/192` in; a 400-dpi TeX render at `px/400` in; a 2× Carbon image at `px/192` in.

## TableSlide / ResultsTable

```js
const t = deck.content({ title: 'Benchmark', topic: 'ScanRefer',
  footnotes: [[marker('*1'), " 2-92 is last week's reference; 4-00 is this week's run, 4-03 the best of the category C setups."]] });
deck.resultsTable(t, {
  header: ['Name', 'Acc@0.25', 'Acc@0.50', 'Multiple Acc@0.25', 'Multiple Acc@0.50', 'Unique Acc@0.25', 'Unique Acc@0.50'],
  rows: [
    { role: 'ref', cells: ['2-92', '0.5505', '0.4969', '0.4685', '0.4215', '0.8911', '0.8103'] },
    { role: 'a',   cells: ['4-00', '0.5186', '0.4708', '0.4319', '0.3925', '0.8786', '0.7957'] },
    { role: '',    cells: ['4-02', '0.4562', '0.3170', '0.3745', '0.2354', '0.7957', '0.6558'] },
    { role: 'b',   cells: ['4-03', '0.4915', '0.3482', '0.4139', '0.2684', '0.8136', '0.6797'], best: [1] },
  ],
  w: 7.6, colW: [0.9, 1.0, 1.0, 1.25, 1.25, 1.1, 1.1] });
```

More than ten columns: `fontSize: 8`. More than fourteen rows: a second slide.

## SettingsTable (papers, models, representations)

```js
const u = deck.content({ title: 'Appendix: Reasoning representation', topic: 'Previous work' });
deck.settingsTable(u, {
  header: ['representation', 'space', 'samplable', 'interpretable', 'examples'],
  rows: [['Discrete language', 'Native vocab', 'v', 'v', 'C3oT, CoT-Valve'], ['Continuous hidden state', 'Model residual stream', '–', 'v 1', 'Coconut, CODI, LOTUS']],
  centerCols: [2, 3], colW: [1.8, 1.7, 0.9, 1.0, 3.3],
  notes: ['1 Recoverable to text through an auxiliary decoder, not directly readable.'] });
```

## TextSlide (lead + list) and TodoSlide

```js
const x = deck.content({ title: 'Experiment', topic: 'Category C: Observation',
  lead: ["Loss weight, BCE, negative oversampling only adjust the threshold.", 'LM rejection failed.'] });
deck.notes(x, [
  ['- Union + LM [REJ]: decision loss on logit margin (', chip('pos_weight 15'), ')'],
  '- Union + head null: softmax over [null, voxels]',
  [callout('4-03'), ' is the best of the category C setups'],
  ['➔ Next: train the ', bold('task-agnostic proposal'), ' part only'],
  [alert('Disk炸滿了，why'), ' — clean ', chip('data/precomputed_voxel_1_5/local')],
], { y: 1.75, h: 2.4 });

const todo = deck.content({ title: 'TODO', topic: 'Week of Nov. 10' });
deck.notes(todo, ['- 11/10 – 11/12: AMD HPC under maintenance', ['- ', bold('Summarize the new VAE results')], '➔ Faithfulness on HumanEval once the machine is back']);
```

## DiscussionSlide (prose, formula, aside, body rule)

```js
const d = deck.content({ title: 'Reasoning quality', topic: 'Helpfulness (WIP)', footnotes: [[marker('*1'), ' ', link('https://arxiv.org/abs/2505.05470')]] });
deck.prose(d, [
  [bold('Helpfulness: '), 'the reasoning model should generate z = RM(P) such that ', bold('delta'), ' is maximised, where ', formula('delta = log p_AM(Y* | P, decode(z)) − log p_AM(Y* | P)')],
  [faint("Other regularization is required (to prevent leakage); I'll check later.")],
]);
deck.bodyRule(d, 3.08);
deck.notes(d, ['Logical consistency', '- Currently no good idea about this part'], { y: 3.16, h: 1.0, w: 4.55 });
deck.figure(d, { path: 'figures/last-week.png', x: 5.12, y: 3.25, w: 4.55, h: 1.9 });
```

Anything with fractions, sums or nested subscripts is rendered instead (Equation below); `formula()` is for the one short expression a page turns on.

## PaperSlide

```js
const p = deck.content({ title: 'Backbone sharing', topic: 'Transfusion', footnotes: [[marker('*1'), ' ', link('https://arxiv.org/pdf/2408.11039')]] });
deck.notes(p, ['Share the transformer backbone between', ['- ', bold('autoregressive text generation')], ['- ', bold('image generation (denoising)'), ', modality-specific layers at the input and output'], '- Our analogue: one backbone for the answer tokens and the latent thought'], { h: 1.2 });
deck.figure(p, { path: 'papers/transfusion-fig1.png', x: 0.33, y: 2.45, w: 4.2, h: 2.75 });
deck.figure(p, { path: 'papers/transfusion-fig2.png', x: 4.78, y: 2.78, w: 4.88, h: 2.42 });
```

## CodeCompare (Carbon images)

```bash
scripts/code2img.sh prompt.py -o 2026-11-05/code/prompt
scripts/code2img.sh resp_a.py -o 2026-11-05/code/resp_a
```

```js
const c = deck.content({ title: 'Coding evaluation pipeline', topic: 'HumanEval', footnotes: [[marker('*1'), ' ', link('https://github.com/torridfish/lrm/issues/6')]] });
c.addText('Prompt:', { x: 0.4, y: 1.06, w: 3, h: 0.3, fontSize: 13, fontFace: 'Times New Roman', margin: 0, isTextBox: true });
deck.image(c, { path: 'code/prompt.png', x: 0.33, y: 1.36, w: 5.0, h: 2.44 });
c.addText('Response: (Qwen3-8B-Base)', { x: 0.4, y: 3.88, w: 4.4, h: 0.3, fontSize: 13, fontFace: 'Times New Roman', margin: 0, isTextBox: true });
deck.image(c, { path: 'code/resp_a.png', x: 0.33, y: 4.18, w: 4.2, h: 2.1 * 4.2 / 4.2 });
```

Height follows the image's aspect ratio (`h = w * png_h / png_w`). Keep the bottom above `L.bodyBottom`; trim the snippet rather than shrinking the text below a 12pt line height.

## Equation and Pseudocode (TeX renders)

```bash
scripts/tex2img.sh --display '\Lloss{} = \Lloss{LM} + \Lloss{ptr} + \tfrac{1}{4}\sum_{i=0}^{3}\big[\,5\,\BCE(M_i,G) + 5\,\Dice(M_i,G)\big]' -o 2026-11-05/math/loss
scripts/tex2img.sh --algo two-stage.body.tex -o 2026-11-05/math/two-stage
```

```js
const m = deck.content({ title: 'Setup', topic: 'Training loss and the two-stage procedure',
  lead: ['The mask loss is averaged over the four decoder outputs; BCE and Dice are weighted 5 each.'] });
deck.image(m, { path: 'math/loss.png', x: 0.43, y: 1.6, w: 3.64, h: 0.24 });            // px/400 in: 1:1 with 12pt
deck.image(m, { path: 'math/two-stage.png', x: 0.43, y: 2.1, w: 4.88, h: 1.87 });
```

## PromptBlock (slide text, not an image)

```js
const q = deck.content({ title: 'Setup', topic: 'Prompt template', lead: ['Chat-Scene alike: scene info in the user turn, task query after two newlines.'] });
deck.promptBlock(q, [
  [role('System: '), "You are a helpful agent for indoor 3D scene understanding tasks."],
  [role('User: '), placeholder('{Scene info}'), '\\n\\n{Task query}'],
  [role('Assistant: '), '{Task response}'],
  [chatToken('<|im_start|>'), 'system'], [sysWords('You are a helpful assistant.'), chatToken('<|im_end|>')],
]);
```

## Save and check

```js
await deck.save('2026-11-05/2026-11-05.pptx');
```

Then `python3 <skill-dir>/scripts/check-deck.py out/deck.pptx --render` and read the rendered PNGs once as the audience would.
