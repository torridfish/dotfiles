// Builds the design system's sample deck (every component once) — also the worked example for deck.js.
//   node build-template.js <design-system project dir> <out.pptx>
'use strict';
const path = require('path');
const RS = require('./deck.js');
const { marker, link, bold, chip, callout, alert, faint, formula, role, placeholder, chatToken, sysWords } = RS;
const [,, PROJ, OUT] = process.argv;
if (!PROJ || !OUT) { console.error('usage: node build-template.js <project dir> <out.pptx>'); process.exit(2); }
const A = (p) => path.join(PROJ, 'assets', p);
const RT = process.env.RUN_TABLE_PNG || ''; // optional screenshot for the overlay sample

(async () => {
  const deck = RS.create({ title: 'Research Slides template', author: 'torridfish', subject: 'Research progress decks' });
  deck.pres.addSection({ title: 'Templates' });
  // 1 cover
  deck.cover({ title: 'Progress Report', project: 'Woven Anypoint Project', date: 'Oct. 28, 2026',
    notes: 'CoverSlide: photo under veil (78% white), cover-title 26pt bold, cover-subtitle 14pt bold Times New Roman in ink-muted. Date form: Oct. 28, 2026. No slide number.' });
  // 2 photo section
  deck.section({ title: 'Experiment: Does KV cache help?', footnotes: [[marker('*1'), ' Link: ', link('https://github.com/torridfish/just3d/issues/17')]],
    notes: 'SectionSlide: the cover without the subtitle; title is the section question; optional footnote link to the tracking issue.' });
  // 3 plain divider
  deck.divider('冠霆', { notes: 'SectionPlain: a white divider with one centred line of slide-title at 2.57in and the slide number. The presenter name at the head of a block in a shared deck, or a sub-section name.' });
  // 4 figure slide
  let s = deck.content({ title: 'Experiment', topic: 'LLM backbone as its own proposer',
    lead: ['Will KV cache benefit downstream tasks?', 'Will this architecture close the gap between real score and oracle grounding score?'],
    footnotes: [[marker('*1'), ' Proposal should be scene-shared, so KV cache ', bold('reuse'), ' here might not be the main proposal.']],
    notes: 'FigureSlide: ContentHeader + LeadParagraph + FigureFrame + Footnote. The figure is a draw.io export; it sits between body-top (1.55in) and body-bottom (5.20in), no border.' });
  deck.figure(s, { path: A('Figures/diagram-proposer.png'), x: 2.2, y: 1.82, w: 5.6, h: 3.42, name: 'Figure: LLM backbone as its own proposer (draw.io export)' });
  // 5 diagram kit
  s = deck.content({ title: 'Setup', topic: 'draw.io diagram kit', lead: ['Every architecture figure is drawn in draw.io from this kit, exported at scale 2, and placed as a picture.'],
    footnotes: [[marker('*1'), ' Source: assets/Diagrams/research-slides-diagram-kit.drawio — export with the research-slides skill: scripts/drawio-export.sh']],
    notes: 'DiagramPalette: copy elements from the kit, keep the style string, change the label, export, place with FigureFrame. fig- tokens only; labels Times New Roman; ❄️ frozen / 🔥 trainable are the only emoji.' });
  deck.figure(s, { path: A('Diagrams/research-slides-diagram-kit.png'), x: 0.9, y: 1.62, w: 8.2, h: 3.62, name: 'Research Slides diagram kit (draw.io export)' });
  // 6 results table
  s = deck.content({ title: 'Benchmark', topic: 'ScanRefer', footnotes: [[marker('*1'), " 2-92 is last week's reference; 4-00 is this week's run, 4-03 the best of the category C setups."]],
    notes: 'TableSlide / ResultsTable at (0.56, 1.14)in, 9pt, 0.75pt grid; header and reference row D9D9D9, group one CFE2F3, group two FCE5CD; bold the best number.' });
  const R = [['ref','2-92','0.5505','0.4969','0.4685','0.4215','0.8911','0.8103'],['a','4-00','0.5186','0.4708','0.4319','0.3925','0.8786','0.7957'],['','4-02','0.4562','0.3170','0.3745','0.2354','0.7957','0.6558'],['b','4-03','0.4915','0.3482','0.4139','0.2684','0.8136','0.6797'],['','4-04','0.4686','0.3295','0.3869','0.2449','0.8076','0.6808'],['','4-05','0.4300','0.3014','0.3433','0.2188','0.7897','0.6444'],['','4-06','0.4676','0.3295','0.3882','0.2506','0.7973','0.6575'],['','4-07','0.4322','0.2974','0.3473','0.2141','0.7848','0.6434'],['','4-08','0.4713','0.3345','0.3903','0.2500','0.8076','0.6851'],['','4-09','0.4164','0.2803','0.3330','0.1978','0.7626','0.6228'],['','4-10','0.4247','0.2939','0.3407','0.2118','0.7734','0.6347'],['','4-11','0.4553','0.3254','0.3711','0.2430','0.8049','0.6678'],['','4-12','0.4633','0.3318','0.3775','0.2481','0.8195','0.6797']];
  deck.resultsTable(s, { header: ['Name', 'Acc@0.25', 'Acc@0.50', 'Multiple Acc@0.25', 'Multiple Acc@0.50', 'Unique Acc@0.25', 'Unique Acc@0.50'],
    rows: R.map((r) => ({ role: r[0], cells: r.slice(1), best: r[1] === '4-03' ? [1] : [] })), w: 7.6, colW: [0.9, 1.0, 1.0, 1.25, 1.25, 1.1, 1.1], name: 'ScanRefer results' });
  // 7 settings table
  s = deck.content({ title: 'Appendix: Reasoning representation', topic: 'Previous work', footnotes: [[marker('*1'), ' ', link('https://github.com/torridfish/lrm/issues/6')]],
    notes: 'SettingsTable: one row per paper/model, bold header on D1E0F9, 8pt, no bands; checks as the letter v; numbered notes in 8pt 595959 directly under the table.' });
  deck.settingsTable(s, { header: ['representation', 'space', 'samplable', 'interpretable', 'examples'],
    rows: [['Discrete language', 'Native vocab', 'v', 'v', 'C3oT, CoT-Valve, Markovian Transformers'], ['Continuous hidden state', 'Model residual stream', '–', 'v 1', 'Coconut, CODI, LOTUS'], ['Learned latent tokens', 'Auxiliary codebook', 'v 2', 'v 3', 'Heima, CoLaR 4'], ['Flow / diffusion latents', 'VAE latent space', 'v', '–', 'LaDiR, FLaRe']],
    centerCols: [2, 3], colW: [1.8, 1.7, 0.9, 1.0, 3.3], noteY: 3.35,
    notes: ['1 Recoverable to text through an auxiliary decoder (VQ-VAE / VAE decoder, SAE features), not directly readable.', '2 No native thought distribution; sampling can be bolted on afterwards.', '3 Heima ships an explainer that partially decodes its thinking tokens.', '4 CoLaR: latent head predicts a distribution over compressed embeddings.'] });
  // 8 paper slide
  s = deck.content({ title: 'Backbone sharing', topic: 'Transfusion', footnotes: [[marker('*1'), ' ', link('https://arxiv.org/pdf/2408.11039')]],
    notes: "PaperSlide: area as title, paper as topic, typed-dash notes in Arial 12pt with a 0.075in inset, the paper's own figures in the body, arXiv link as *1. Figures never climb beside the title." });
  deck.notes(s, ['Share the transformer backbone between', ['- ', bold('autoregressive text generation')], ['- ', bold('image generation (denoising)'), ', modality-specific layers only at the input and output'], '- Our analogue: one backbone for the answer tokens and the latent thought, a head per modality'], { h: 1.2 });
  deck.figure(s, { path: A('Diagrams/anchorseg_arch.png'), x: 0.33, y: 2.45, w: 4.2, h: 2.75, name: 'Paper figure 1 (stand-in: draw.io export)' });
  deck.figure(s, { path: A('Diagrams/qwen_3d_architecture.png'), x: 4.78, y: 2.78, w: 4.88, h: 2.42, name: 'Paper figure 2 (stand-in: draw.io export)' });
  // 9 discussion slide
  s = deck.content({ title: 'Reasoning quality', topic: 'Helpfulness (WIP)', footnotes: [[marker('*1'), ' ', link('https://arxiv.org/abs/2505.05470')]],
    notes: 'DiscussionSlide: 13pt Times New Roman prose fills the body; the key formula bold CC0000; a tentative aside 9E9E9E; one body rule splits the prose from a notes block and a figure. Left-aligned, never justified.' });
  deck.prose(s, [
    [bold('Helpfulness: '), 'the reasoning model (RM) should generate a good z = RM(P) such that ', bold('delta'), ' can be maximised, where ', formula('delta = log p_AM(Y* | P, decode(z)) − log p_AM(Y* | P)')],
    [bold('Reasoning consistency: '), 'AM should read z and decode(z) in the same way to produce the same output: ', formula('log p_AM(Y* | P, z) ↔ log p_AM(Y* | P, decode(z))')],
    [faint("Other detailed regularization is required (to prevent leakage); I'll check later, the data is only stored on the machine.")],
  ]);
  deck.bodyRule(s, 3.08);
  deck.notes(s, ['Logical consistency', '- Currently no good idea about this part', '- Might need another judge model; too many axes to tune'], { y: 3.16, h: 1.0, w: 4.55 });
  deck.figure(s, { path: A('Diagrams/anchorseg_arch.png'), x: 5.12, y: 3.25, w: 4.55, h: 1.9, name: 'Figure from last week (draw.io export)' });
  // 10 code compare (Carbon images)
  s = deck.content({ title: 'Coding evaluation pipeline', topic: 'HumanEval', footnotes: [[marker('*1'), ' ', link('https://github.com/torridfish/lrm/issues/6')]],
    notes: 'CodeCompare: every block is a Carbon image (monokai, Hack 14px, line numbers, no shadow, 2x) rendered by the research-slides skill; a 13pt serif label above each; responses in the two 4.55in columns.' });
  const lbl = (txt, x, y, w) => s.addText(txt, { x, y, w, h: 0.3, fontSize: 13, fontFace: 'Times New Roman', color: '000000', margin: 0, isTextBox: true, objectName: 'Label' });
  lbl('Prompt:', 0.4, 1.06, 3);
  deck.image(s, { path: A('Code/humaneval-prompt.png'), x: 0.33, y: 1.36, w: 5.0, h: 5.0 * 660 / 1350, name: 'HumanEval prompt (Carbon)' });
  lbl('Response: (Qwen3-8B-Base)', 0.4, 3.9, 4.4);
  deck.image(s, { path: A('Code/response-qwen3-8b.png'), x: 0.33, y: 4.2, w: 2.0 * 1030 / 516 * 0.5, h: 1.0, name: 'Response A (Carbon)' });
  lbl('Response: (stopgrad-shallow-u-detach)', 5.19, 3.9, 4.4);
  deck.image(s, { path: A('Code/response-stopgrad.png'), x: 5.12, y: 4.2, w: 1.0 * 1110 / 516, h: 1.0, name: 'Response B (Carbon)' });
  // 11 equation + pseudocode
  s = deck.content({ title: 'Setup', topic: 'Training loss and the two-stage procedure',
    lead: ['The mask loss is averaged over the four decoder outputs; BCE and Dice are weighted 5 each.'],
    footnotes: [[marker('*1'), ' Rendered with the local TeX Live by the research-slides skill (tex2img.sh); sources under assets/Math/.']],
    notes: 'Equation + Pseudocode: LaTeX standalone renders at 400dpi placed at px/400 in (1:1 with 12pt body); algorithm2e ruled, line-numbered, no semicolons. Never typed with the equation editor.' });
  deck.image(s, { path: A('Math/loss-mask.png'), x: 0.43, y: 1.62, w: 1455 / 400, h: 95 / 400, name: 'Mask loss (TeX render)' });
  deck.image(s, { path: A('Math/algorithm-two-stage.png'), x: 0.43, y: 2.15, w: 1954 / 400, h: 749 / 400, name: 'Algorithm 1 (TeX render)' });
  // 12 text slide
  s = deck.content({ title: 'Experiment', topic: 'Category C: Observation',
    lead: ["Loss weight, BCE, negative oversampling only adjust the threshold, doesn't improve the performance much.", 'LM rejection failed. Possible reason might come from that current supervision cannot teach LLM to do so.'],
    notes: 'TextSlide: LeadParagraph + Bullets. Dash for observations, ➔ for consequences; inline code chip 8pt Courier New 2B3038 on F4F4F4; run callout on F9CB9C; urgent note bold CC0000.' });
  deck.notes(s, [
    ['- Union + LM [REJ]: multi-positive over voxels, decision loss on logit margin (', chip('pos_weight 15'), ')'],
    '- Union + head null: softmax over [null, voxels]; no-target samples ×1 (6%) and ×5 (~24%)',
    ['- ', callout('4-03'), ' is the best of the category C setups on ScanRefer Acc@0.25'],
    ['➔ Next: train the ', bold('task-agnostic proposal'), ' part only, benchmark on ScanNet200 against CLASP and Mask3D'],
    ['➔ ', alert('Disk炸滿了，why'), ' — clean ', chip('data/precomputed_voxel_1_5/local'), ' after merging its GT-mask keys'],
  ], { y: 1.75, h: 2.4 });
  // 13 prompt block
  s = deck.content({ title: 'Setup', topic: 'Prompt template', lead: ['Chat-Scene alike: scene info in the user turn, task query after two newlines.'],
    notes: 'PromptBlock: Courier New 10pt slide text; role labels bold; {placeholders} bold FF0000; chat-template tokens on C9DAF8; system prompt words in 1155CC. Not a Carbon image: the marks carry meaning.' });
  deck.promptBlock(s, [
    [role('System: '), "You are a helpful agent for indoor 3D scene understanding tasks. Answer the user's questions about the indoor scene."],
    [role('User: '), placeholder('{Scene info}'), '\\n\\n{Task query}'],
    [role('Assistant: '), '{Task response}'],
    ' ',
    [chatToken('<|im_start|>'), 'system'], [sysWords('You are a helpful assistant.'), chatToken('<|im_end|>')],
    [chatToken('<|im_start|>'), 'user'], [chatToken('<|vision_start|><|pointcloud_pad|><|vision_end|>'), '{target_sentence}', chatToken('<|im_end|>')],
    [chatToken('<|im_start|>'), 'assistant'],
  ]);
  // 14 overlay figure (uses the run-table screenshot if provided, else the kit)
  s = deck.content({ title: 'Experiment', topic: 'Category B setups', footnotes: [[marker('*1'), ' → means the difference from the base run.']],
    notes: 'FigureFrame + OverlayMarker: run-label 11.5pt Times New Roman above the picture; overlay-peach FFDC9F and overlay-pink FFACAC at 50%; outline 1.5pt FF0000 with no fill.' });
  deck.figure(s, { path: RT || A('Diagrams/research-slides-diagram-kit.png'), x: 0.17, y: 1.5, w: 9.67, h: 3.33, runLabel: '4-01', outline: { x: 0.3, y: 4.4, w: 1.5, h: 0.3 }, name: 'Run matrix for the category B setups' });
  deck.overlay(s, { x: 0.17, y: 2.66, w: 9.67, h: 0.42 });
  deck.overlay(s, { x: 3.9, y: 3.95, w: 3.1, h: 0.2, tone: 'pink' });
  // 15 TODO
  s = deck.content({ title: 'TODO', topic: 'Week of Oct. 13', notes: 'TodoSlide: title TODO, a dated dash list in Arial 12pt with a 0.075in inset; bold the blocking item; ➔ for what follows. No figure, no table.' });
  deck.notes(s, ['- 08/31 – 09/03: AMD HPC under maintenance', ['- ', bold('Summarize experiment results of the new VAE')], '    - Does the VAE form a space that is good for the FM model to generate?', '    - Does the backbone use the thoughts to solve the problem?', '- Error-case classification (thought / generated code)', '- Apply the new VAE with the pretrained flow_proj; ablate flow_proj', '➔ Faithfulness interpretability on HumanEval once the machine is back']);
  await deck.save(OUT);
  console.log('built', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
