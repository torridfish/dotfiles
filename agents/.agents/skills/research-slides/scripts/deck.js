// Research Slides deck builder — pptxgenjs helpers that place every element at the
// design system's anchors (references/design-system/README.md, "Slide anatomy").
// All positions are inches on a 10 x 5.625 in slide. Colours are the tokens' hex values.
//
//   const RS = require('<skill>/scripts/deck.js');
//   const deck = RS.create({ title: 'Progress Report 2026-11-05' });
//   deck.cover({ title: 'Progress Report', project: 'Woven Anypoint Project', date: 'Nov. 5, 2026' });
//   const s = deck.content({ title: 'Experiment', topic: 'Category C: KV cache', lead: ['Will KV cache help?'],
//                            footnotes: [[RS.marker('*1'), ' Link: ', RS.link('https://…')]] });
//   deck.figure(s, { path: 'fig.png', x: 2.2, y: 1.82, w: 5.6, h: 3.42, runLabel: '4-01' });
//   await deck.save('out/2026-11-05.pptx');
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const pptxgen = require('pptxgenjs');

const T = { // tokens
  ink: '000000', inkMuted: '595959', inkFaint: '9E9E9E', inkCode: '2B3038', surfaceCode: 'F4F4F4',
  amber: '9C6B1E', link: '0000EE', codeGreen: '188038', codeBlue: '1155CC', codeOrange: 'B45F06',
  alert: 'FF0000', alertDeep: 'CC0000', markOrange: 'F9CB9C', markBlue: 'C9DAF8', markYellow: 'FFF2CC',
  surfaceHead: 'D9D9D9', surfaceHeadBlue: 'D1E0F9', bandBlue: 'CFE2F3', bandOrange: 'FCE5CD',
  overlayPeach: 'FFDC9F', overlayPink: 'FFACAC',
};
const F = { sans: 'Arial', serif: 'Times New Roman', mono: 'Courier New' };
const INS = 7.2, INS_BODY = 5.4; // text insets in points: space-2 (0.1in) and inset-body (0.075in)
const L = { // layout anchors (in)
  margin: 0.33, headerLeft: 0.40, titleTop: 0.20, topicTop: 0.63, ruleTop: 1.00, leadTop: 1.02, bodyTop: 1.55,
  bodyBottom: 5.20, tableTop: 1.14, tableLeft: 0.56, colW: 4.55, col2Left: 5.12, dividerTop: 2.57, footTop: 5.24,
  numberLeft: 9.31, width: 10, height: 5.625,
};
const ASSETS = path.join(__dirname, '..', 'assets');

// ---- run helpers: build rich-text arrays for pptxgenjs ----
const marker = (n) => ({ text: n, options: { bold: true, underline: { style: 'sng' } } });
const link = (url, text) => ({ text: text || url, options: { hyperlink: { url }, color: T.link, underline: { style: 'sng' } } });
const bold = (text) => ({ text, options: { bold: true } });
const chip = (text) => ({ text, options: { fontFace: F.mono, fontSize: 8, color: T.inkCode, highlight: T.surfaceCode } });
const callout = (runId) => ({ text: '⤷ ' + runId, options: { highlight: T.markOrange } });
const wip = (text) => ({ text, options: { highlight: T.markYellow } });
const alert = (text) => ({ text, options: { bold: true, color: T.alertDeep } });
const faint = (text) => ({ text, options: { color: T.inkFaint } });
const formula = (text) => ({ text, options: { bold: true, color: T.alertDeep } });
const br = (run) => { const r = typeof run === 'string' ? { text: run, options: {} } : run; r.options = Object.assign({}, r.options, { breakLine: true }); return r; };
const norm = (parts) => parts.map((p) => (typeof p === 'string' ? { text: p } : p));

// Explicit boxes, not layout placeholders: pptxgenjs placeholder shapes lose their link to the layout
// (no <p:ph> on the slide), so LibreOffice and Google Slides drop them at the top-left corner. Every text
// box below carries its own geometry and style, so the deck renders the same everywhere.
const BOX = {
  title: { x: L.headerLeft, y: L.titleTop, w: 9.2, h: 0.45, fontSize: 22, bold: false, fontFace: F.sans, color: T.ink, align: 'left', valign: 'top', margin: 0, isTextBox: true, objectName: 'Title' },
  topic: { x: L.headerLeft, y: L.topicTop, w: 9.2, h: 0.30, fontSize: 12.5, fontFace: F.sans, color: T.amber, align: 'left', valign: 'top', margin: 0, isTextBox: true, objectName: 'Topic' },
  lead: { x: L.margin, y: L.leadTop, w: 9.33, h: 0.61, fontSize: 12, fontFace: F.serif, color: T.ink, align: 'left', valign: 'top', margin: INS, isTextBox: true, objectName: 'Lead' },
  foot: { x: 0, y: L.footTop, w: 8.6, h: 0.39, fontSize: 8, fontFace: F.sans, color: T.ink, align: 'left', valign: 'middle', margin: INS, isTextBox: true, objectName: 'Footnote' },
  coverTitle: { x: 0.34, y: 1.84, w: 9.32, h: 1.94, fontSize: 26, bold: true, fontFace: F.sans, color: T.ink, align: 'left', valign: 'middle', margin: 0, isTextBox: true, objectName: 'Cover title' },
  coverSub: { x: 0.36, y: 4.34, w: 9.32, h: 1.0, fontSize: 14, bold: true, fontFace: F.serif, color: T.inkMuted, align: 'left', valign: 'middle', margin: 0, isTextBox: true, objectName: 'Cover subtitle' },
  divider: { x: L.margin, y: L.dividerTop, w: 9.33, h: 0.48, fontSize: 22, bold: false, fontFace: F.sans, color: T.ink, align: 'center', valign: 'top', margin: 2.7, isTextBox: true, objectName: 'Divider' },
};

function create({ title = 'Research Slides deck', author = '', subject = '' } = {}) {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_16x9';
  pres.theme = { headFontFace: F.sans, bodyFontFace: F.sans };
  pres.title = title; if (author) pres.author = author; if (subject) pres.subject = subject;
  const photo = path.join(ASSETS, 'cover-temple-night.jpg');
  const num = { slideNumber: { x: L.numberLeft, y: 5.28, w: 0.89, h: 0.30, fontSize: 12, fontFace: F.sans, color: T.ink, align: 'center', valign: 'middle', margin: [3.6, 7.2, 3.6, 7.2] } };
  const veil = { rect: { x: 0, y: 0, w: L.width, h: L.height, fill: { color: 'FFFFFF', transparency: 22 }, line: { type: 'none' } } };
  const rule = { line: { x: L.headerLeft, y: L.ruleTop, w: 9.2, h: 0, line: { color: T.ink, width: 1 } } };
  pres.defineSlideMaster({ title: 'COVER', background: { path: photo }, objects: [veil] });
  pres.defineSlideMaster({ title: 'SECTION', background: { path: photo }, objects: [veil], ...num });
  pres.defineSlideMaster({ title: 'DIVIDER', background: { color: 'FFFFFF' }, objects: [], ...num });
  pres.defineSlideMaster({ title: 'CONTENT', background: { color: 'FFFFFF' }, objects: [rule], ...num });
  pres.defineSlideMaster({ title: 'CONTENT_LEAD', background: { color: 'FFFFFF' }, objects: [rule], ...num });

  const lines = (items) => items.flatMap((it, i) => { const runs = norm(Array.isArray(it) ? it : [it]); if (i < items.length - 1) runs[runs.length - 1] = br(runs[runs.length - 1]); return runs; });
  const footnotes = (s, notes) => { if (notes && notes.length) s.addText(lines(notes), BOX.foot); };

  const deck = {
    pres, T, L, F, BOX,
    /** Cover: photo under veil, 26pt bold title, serif project + date lines. */
    cover({ title = 'Progress Report', project, date, notes }) {
      const s = pres.addSlide({ masterName: 'COVER' });
      s.addText(title, BOX.coverTitle);
      s.addText([br(project), { text: date }], BOX.coverSub);
      if (notes) s.addNotes(notes);
      return s;
    },
    /** Photo section slide: the cover without the subtitle; optional footnote (e.g. the tracking issue). */
    section({ title, footnotes: fn, notes }) {
      const s = pres.addSlide({ masterName: 'SECTION' });
      s.addText(title, BOX.coverTitle); footnotes(s, fn); if (notes) s.addNotes(notes);
      return s;
    },
    /** Plain divider: one centred line (a presenter's name in a shared deck, or a sub-section). */
    divider(text, { notes } = {}) {
      const s = pres.addSlide({ masterName: 'DIVIDER' });
      s.addText(text, BOX.divider); if (notes) s.addNotes(notes);
      return s;
    },
    /** Content slide: category title + topic; lead = array of serif sentences (omit for no lead). */
    content({ title, topic, lead, footnotes: fn, notes }) {
      const s = pres.addSlide({ masterName: lead ? 'CONTENT_LEAD' : 'CONTENT' });
      s.addText(title, BOX.title);
      if (topic) s.addText(topic, BOX.topic);
      if (lead) s.addText(lines(lead), BOX.lead);
      footnotes(s, fn); if (notes) s.addNotes(notes);
      return s;
    },
    /** A picture with no border; optional serif run label above its top-left corner and a red outline. */
    figure(s, { path: p, x, y, w, h, runLabel, outline, name }) {
      if (runLabel) s.addText(runLabel, { x: x - 0.1, y: y - 0.38, w: 0.8, h: 0.35, fontSize: 11.5, fontFace: F.serif, color: T.ink, margin: INS, isTextBox: true, objectName: 'Run label' });
      s.addImage({ path: p, x, y, w, h, objectName: name || path.basename(p) });
      if (outline) s.addShape(pres.ShapeType.rect, { x: outline.x, y: outline.y, w: outline.w, h: outline.h, fill: { type: 'none' }, line: { color: T.alert, width: outline.heavy ? 2.25 : 1.5 }, objectName: 'Outline' });
      return s;
    },
    /** Translucent peach ('peach') or pink ('pink') rectangle over part of a picture. */
    overlay(s, { x, y, w, h, tone = 'peach' }) {
      s.addShape(pres.ShapeType.rect, { x, y, w, h, fill: { color: tone === 'pink' ? T.overlayPink : T.overlayPeach, transparency: 50 }, line: { type: 'none' }, objectName: 'Overlay ' + tone });
      return s;
    },
    /** Rendered image of an equation / pseudocode / code (same as figure, named for the notes). */
    image(s, opts) { return deck.figure(s, Object.assign({ name: 'Rendered image' }, opts)); },
    /** Results table: header + rows [{role:'ref'|'a'|'b'|'', cells:[...], best:[colIdx,...]}]. */
    resultsTable(s, { header, rows, x = L.tableLeft, y = L.tableTop, w, colW, fontSize = 9, name = 'Results' }) {
      const FILL = { ref: T.surfaceHead, a: T.bandBlue, b: T.bandOrange };
      const data = [header.map((t) => ({ text: t, options: { bold: true, fill: { color: T.surfaceHead } } }))];
      for (const r of rows) data.push(r.cells.map((t, i) => ({ text: String(t), options: Object.assign({}, FILL[r.role] ? { fill: { color: FILL[r.role] } } : {}, (r.best || []).includes(i) ? { bold: true } : {}) })));
      s.addTable(data, { x, y, w, colW, fontSize, fontFace: F.sans, color: T.ink, align: 'center', valign: 'middle', border: { type: 'solid', pt: 0.75, color: T.ink }, margin: 0.03, objectName: name });
      return s;
    },
    /** Settings / literature table: bold header on blue, 8pt, no bands; numbered notes beneath. */
    settingsTable(s, { header, rows, notes, x = 0.65, y = L.tableTop, w = 8.7, colW, centerCols = [], noteY }) {
      const data = [header.map((t) => ({ text: t, options: { bold: true, fill: { color: T.surfaceHeadBlue }, align: 'left' } }))];
      for (const r of rows) data.push(r.map((t, i) => ({ text: String(t), options: { align: centerCols.includes(i) ? 'center' : 'left' } })));
      s.addTable(data, { x, y, w, colW, fontSize: 8, fontFace: F.sans, color: T.ink, valign: 'middle', border: { type: 'solid', pt: 0.75, color: T.ink }, margin: 0.03, objectName: 'Settings' });
      if (notes && notes.length) s.addText(lines(notes), { x, y: noteY || y + 0.3 * (rows.length + 1) + 0.15, w, h: 0.2 * notes.length + 0.1, fontSize: 8, fontFace: F.sans, color: T.inkMuted, valign: 'top', margin: 0, isTextBox: true, objectName: 'Table notes' });
      return s;
    },
    /** Notes block: 12pt Arial lines (typed dashes / ➔ / 1.) with the body inset; items are strings or run arrays. */
    notes(s, items, { x = L.margin, y = L.leadTop, w = 9.33, h = 2.4 } = {}) {
      s.addText(lines(items), { x, y, w, h, fontSize: 12, fontFace: F.sans, color: T.ink, valign: 'top', margin: INS_BODY, isTextBox: true, objectName: 'Notes' });
      return s;
    },
    /** Prose block: 13pt Times New Roman paragraphs for a discussion page. */
    prose(s, paragraphs, { x = L.margin, y = L.leadTop, w = 9.33, h = 1.9 } = {}) {
      const runs = lines(paragraphs).map((r) => Object.assign({}, r, { options: Object.assign({ fontFace: F.serif, fontSize: 13 }, r.options || {}) }));
      s.addText(runs, { x, y, w, h, color: T.ink, valign: 'top', margin: INS_BODY, isTextBox: true, objectName: 'Prose' });
      return s;
    },
    /** 1pt body rule splitting a page in two. */
    bodyRule(s, y) { s.addShape(pres.ShapeType.line, { x: L.margin, y, w: 9.33, h: 0, line: { color: T.ink, width: 1 }, objectName: 'Body rule' }); return s; },
    /** Prompt template as slide text (its marks carry meaning, so it is not a Carbon image). */
    promptBlock(s, lineRuns, { x = L.margin, y = L.bodyTop + 0.2, w = 9.33, h = 2.6 } = {}) {
      const runs = lines(lineRuns).map((r) => Object.assign({}, r, { options: Object.assign({ fontFace: F.mono, fontSize: 10 }, r.options || {}) }));
      s.addText(runs, { x, y, w, h, color: T.ink, valign: 'top', margin: INS, isTextBox: true, objectName: 'Prompt template' });
      return s;
    },
    /** Write the .pptx and stamp the theme colours. */
    async save(outPath) {
      await pres.writeFile({ fileName: outPath });
      execFileSync('python3', [path.join(__dirname, 'apply-theme.py'), outPath], { stdio: 'inherit' });
      return outPath;
    },
  };
  return deck;
}
// prompt-block run helpers
const role = (t) => ({ text: t, options: { bold: true } });
const placeholder = (t) => ({ text: t, options: { bold: true, color: T.alert } });
const chatToken = (t) => ({ text: t, options: { highlight: T.markBlue } });
const sysWords = (t) => ({ text: t, options: { color: T.codeBlue } });

module.exports = { create, marker, link, bold, chip, callout, wip, alert, faint, formula, br, role, placeholder, chatToken, sysWords, T, L, F };
