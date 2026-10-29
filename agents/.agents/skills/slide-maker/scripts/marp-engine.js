// Marp engine for slide-maker decks (used by scripts/marp.config.js). On top of Marp it adds:
//   - the slide-maker theme, with the cover photo resolved to this skill's copy
//   - the math preamble's macros (\LLM, \Lloss{LM}, \tok{OBJ}, \argmax …) expanded inside $…$ / $$…$$;
//     ```math fences as display math; equation / align / gather numbered (1), (2) … across the deck
//   - footnotes numbered [1], [2] per slide and set at the foot of the slide that cites them; a citation is a
//     superscript [1] linking to its footnote
//   - a slide type as a class on every slide: title, section, divider (see the theme's header)
//   - a paragraph of images becomes one centred figure row; a picture is placed at 1:1 (px/2 CSS px: 2x
//     exports at 192 px/in) unless Marp's w:/h: keywords size it; an image title ![](f.png "4-01") is its run label
//   - tables: a `role` column (ref / a / b) tints rows and is dropped; {.settings} after a table
//   - fences: ```algo (algorithm2e) and ```latex {.render} rendered by tex2img.sh, ```prompt marked up,
//     every other fence monokai on a dark box with line numbers ({path="pkg/mod.py"} labels it,
//     {start=42} sets the first line number)
//   - inline marks: ==WIP==, [text]{.callout|.alert|.formula|.faint|.token}, # Name {.divider}
//   - a ### may leave out a ## that repeats the previous slide's; front matter `toc: true` adds a contents
//     slide after the first one, listing every ## with its ### (part numbers like (1/2) dropped)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');

const SKILL = path.join(__dirname, '..');
const TEX = path.join(SKILL, 'assets', 'tex');
const DPI = 800;
const CACHE = path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'slide-maker', 'tex');

// ---------- theme ----------
function theme() {
  const css = fs.readFileSync(path.join(SKILL, 'assets', 'marp', 'slide-maker.css'), 'utf8');
  return css.replaceAll('__COVER_URL__', pathToFileURL(path.join(SKILL, 'assets', 'cover-temple-night.jpg')).href);
}

// ---------- math macros from the LaTeX preamble ----------
function readMacros(file) {
  const src = fs.readFileSync(file, 'utf8');
  const macros = {};
  for (const m of src.matchAll(/\\newcommand\{\\(\w+)\}(?:\[(\d)\])?\{((?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g)) macros[m[1]] = { n: Number(m[2] || 0), body: m[3] };
  for (const m of src.matchAll(/\\DeclareMathOperator(\*?)\{\\(\w+)\}\{([^}]*)\}/g)) macros[m[2]] = { n: 0, body: `\\operatorname${m[1]}{${m[3]}}` };
  return macros;
}
function expand(tex, macros, depth = 0) {
  if (depth > 8) return tex;
  let out = '', i = 0, changed = false;
  while (i < tex.length) {
    const m = tex.slice(i).match(/^\\([A-Za-z]+)/);
    if (!m || !macros[m[1]]) { out += m ? m[0] : tex[i]; i += m ? m[0].length : 1; continue; }
    i += m[0].length;
    const { n, body } = macros[m[1]];
    const args = [];
    for (let k = 0; k < n; k++) {
      while (tex[i] === ' ') i++;
      if (tex[i] === '{') { let d = 0, j = i; for (; j < tex.length; j++) { if (tex[j] === '{') d++; else if (tex[j] === '}' && --d === 0) break; } args.push(tex.slice(i + 1, j)); i = j + 1; }
      else { args.push(tex[i] || ''); i++; }
    }
    out += body.replace(/#(\d)/g, (_, d) => args[d - 1] ?? '');
    changed = true;
  }
  return changed ? expand(out, macros, depth + 1) : out;
}
/** Split a math body at its top-level \\ (not those inside a nested \begin … \end). */
function splitRows(body) {
  const rows = [];
  let depth = 0, last = 0;
  for (const m of body.matchAll(/\\begin\{|\\end\{|\\\\/g)) {
    if (m[0] === '\\begin{') depth++;
    else if (m[0] === '\\end{') depth--;
    else if (depth === 0) { rows.push(body.slice(last, m.index)); last = m.index + 2; }
  }
  rows.push(body.slice(last));
  return rows;
}
/** Number a display formula the LaTeX way, deck-wide: equation gets one number, align / gather one per
    row; the starred forms, \tag{…}, \notag and \nonumber opt out. KaTeX would restart at (1) per formula. */
function numberEquations(tex, next) {
  return tex.replace(/\\begin\{(equation|align|gather)\}([\s\S]*?)\\end\{\1\}/g, (_, env, body) => {
    const tag = (row) => (/\\(tag|notag|nonumber)\b/.test(row) || !row.trim() ? row.replace(/\\(notag|nonumber)\b/g, '') : `${row} \\tag{${next()}}`);
    if (env === 'equation') return tag(body);
    return `\\begin{${env}*}${splitRows(body).map(tag).join('\\\\')}\\end{${env}*}`;
  });
}
function mathMacros(md) {
  const macros = readMacros(path.join(TEX, 'preamble-math.tex'));
  md.core.ruler.after('inline', 'rs_math_macros', (state) => {
    let n = 0;
    const next = () => ++n;
    for (const t of state.tokens) {
      // a ```math fence is display math, the same as $$ … $$
      if (t.type === 'fence' && t.info.trim().split(/\s+/)[0] === 'math') Object.assign(t, { type: 'marp_math_block', tag: 'math', markup: '$$', info: '' });
      if (t.type === 'marp_math_block') t.content = numberEquations(expand(t.content, macros), next);
      if (t.type === 'inline') for (const c of t.children || []) if (c.type === 'marp_math_inline') c.content = expand(c.content, macros);
    }
  });
}

// ---------- figures: image-only paragraphs, 1:1 size, run labels ----------
/** Pixel size of a local PNG or JPEG, or null. */
function imageSize(file) {
  let b;
  try { b = fs.readFileSync(file); } catch { return null; }
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}
/** 1:1 width in CSS px for a local figure (exports are 2x: 192 px per inch on a 96 px/in canvas). */
function naturalSize(src) {
  if (!src || /^[a-z]+:/i.test(src)) return null;
  const size = imageSize(path.resolve(process.env.RS_DECK_DIR || process.cwd(), decodeURI(src)));
  return size ? { w: size.w / 2, h: size.h / 2 } : null;
}

function figures(md) {
  md.core.ruler.after('inline', 'rs_figures', (state) => {
    const toks = state.tokens;
    for (let i = 0; i < toks.length - 1; i++) {
      if (toks[i].type !== 'paragraph_open' || toks[i + 1].type !== 'inline') continue;
      const kids = toks[i + 1].children || [];
      const imgs = kids.filter((c) => c.type === 'image');
      if (imgs.length && kids.every((c) => c.type === 'image' || c.type === 'softbreak' || (c.type === 'text' && !c.content.trim()))) {
        if (imgs.some((c) => /^bg\b/.test(c.content))) continue; // Marp backgrounds
        toks[i].attrJoin('class', 'figures');
      }
    }
  });
  const image = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const t = tokens[idx];
    if (!/\b(w|h|width|height):/.test(t.content || '')) {      // Marp size keywords win
      // --fig-w / --fig-r let a column size the picture from the body's height (the theme's columns rules)
      const n = naturalSize(t.attrGet('src'));
      if (n) t.attrJoin('style', `width:${n.w.toFixed(0)}px;--fig-w:${n.w.toFixed(0)}px;--fig-r:${(n.w / n.h).toFixed(4)}`);
    }
    const label = t.attrGet('title');
    if (!label) return image(tokens, idx, options, env, self);
    t.attrs = t.attrs.filter(([k]) => k !== 'title');
    return `<span class="figure"><span class="run-label">${md.utils.escapeHtml(label)}</span>${image(tokens, idx, options, env, self)}</span>`;
  };
}

// ---------- tables: role column, settings variant ----------
function tables(md) {
  md.core.ruler.push('rs_tables', (state) => {
    const toks = state.tokens;
    const drop = new Set();
    for (let i = 0; i < toks.length; i++) {
      if (toks[i].type !== 'table_open') continue;
      let end = i; while (toks[end].type !== 'table_close') end++;
      const rows = []; // [{ open, close, cells: [{ open, inline, close }] }]
      for (let j = i; j < end; j++) {
        if (toks[j].type === 'tr_open') rows.push({ open: j, cells: [] });
        if (toks[j].type === 'tr_close') rows[rows.length - 1].close = j;
        if (toks[j].type === 'th_open' || toks[j].type === 'td_open') rows[rows.length - 1].cells.push({ open: j, inline: j + 1, close: j + 2 });
      }
      const text = (c) => toks[c.inline].content.trim();
      // `{.settings}` right under the table: GFM made it a last row whose cell took the class
      const last = rows[rows.length - 1];
      if (rows.length > 2 && last.cells.every((c) => !text(c)) && last.cells.some((c) => toks[c.open].attrGet('class'))) {
        for (const c of last.cells) { const cls = toks[c.open].attrGet('class'); if (cls) toks[i].attrJoin('class', cls); }
        for (let k = last.open; k <= last.close; k++) drop.add(k);
        if (toks[last.open - 1].type === 'tbody_open' && toks[last.close + 1].type === 'tbody_close' && rows.length === 2) { drop.add(last.open - 1); drop.add(last.close + 1); }
        rows.pop();
      }
      const ri = rows[0].cells.findIndex((c) => text(c).toLowerCase() === 'role');
      if (ri >= 0) rows.forEach((r, k) => {
        const c = r.cells[ri];
        if (k > 0 && text(c)) toks[r.open].attrJoin('class', text(c));
        for (const x of [c.open, c.inline, c.close]) drop.add(x);
      });
      if ((toks[i].attrGet('class') || '').includes('settings')) {
        const body = rows.slice(1);
        rows[0].cells.forEach((_, col) => {
          if (col === ri || !body.length) return;
          if (body.every((r) => text(r.cells[col]).length <= 3)) for (const r of body) toks[r.cells[col].open].attrJoin('class', 'c');
        });
      }
      i = end;
    }
    if (drop.size) state.tokens = toks.filter((_, k) => !drop.has(k));
  });
}

// ---------- fences ----------
function texImage(kind, body, scale) {
  const pre = fs.readFileSync(path.join(TEX, kind === 'algo' ? 'preamble-algo.tex' : 'preamble-math.tex'), 'utf8');
  const h = crypto.createHash('sha1').update([kind, body, pre, DPI].join('\0')).digest('hex').slice(0, 12);
  const base = path.join(CACHE, `${kind}-${h}`);
  if (!fs.existsSync(base + '.png')) {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(base + '.body.tex', body + '\n');
    try {
      execFileSync(path.join(__dirname, 'tex2img.sh'), [kind === 'algo' ? '--algo' : '--body', base + '.body.tex', '-o', base, '--dpi', String(DPI), '--no-svg'], { stdio: 'pipe' });
    } catch (e) {
      const log = fs.existsSync(base + '.log') ? fs.readFileSync(base + '.log', 'utf8').split('\n').filter((l) => /^!|^l\.\d+/.test(l)).slice(0, 4).join(' ') : String(e.message);
      return `<pre class="prompt" style="color:#CC0000">LaTeX failed (${kind}): ${log.replace(/</g, '&lt;')}</pre>`;
    }
  }
  const png = fs.readFileSync(base + '.png');
  const w = png.readUInt32BE(16); // PNG IHDR width
  return `<img class="${kind}" src="data:image/png;base64,${png.toString('base64')}" style="width:${((w / DPI) * 96 * scale).toFixed(1)}px">`;
}

function promptHtml(text, esc) {
  return text.split('\n').map((line) => {
    let out = '';
    const m = line.match(/^(System|User|Assistant|Human|AI):/);
    if (m) { out += `<span class="role">${m[0]}</span>`; line = line.slice(m[0].length); }
    for (const part of line.split(/(\{[^{}]+\}|<\|[^|]+\|>)/)) {
      if (!part) continue;
      if (/^\{.*\}$/.test(part)) out += `<span class="placeholder">${esc(part)}</span>`;
      else if (/^<\|.*\|>$/.test(part)) out += `<span class="token">${esc(part)}</span>`;
      else out += esc(part);
    }
    return out;
  }).join('\n');
}

/** Wrap highlighted code in per-line spans, closing and reopening spans that cross a newline. */
function numberLines(html) {
  const lines = [];
  let cur = '', open = [];
  for (const piece of html.split(/(<[^>]+>|\n)/)) {
    if (piece === '\n') { lines.push(cur + '</span>'.repeat(open.length)); cur = open.join(''); continue; }
    if (/^<span\b/.test(piece)) open.push(piece);
    else if (piece === '</span>') open.pop();
    cur += piece;
  }
  if (cur.replace(/<[^>]+>/g, '').length || !lines.length) lines.push(cur + '</span>'.repeat(open.length));
  return lines.map((l) => `<span class="line">${l || ' '}</span>`).join('');
}

function fences(md) {
  const fence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const t = tokens[idx];
    const lang = (t.info || '').trim().split(/\s+/)[0].toLowerCase();
    const cls = t.attrGet('class') || '';
    const scale = Number(t.attrGet('scale')) || 1;
    if (lang === 'algo' || lang === 'algorithm') return texImage('algo', t.content.replace(/\n$/, ''), scale) + '\n';
    if ((lang === 'latex' || lang === 'tex') && /\brender\b/.test(cls)) return texImage('tex', t.content.replace(/\n$/, ''), scale) + '\n';
    if (lang === 'prompt') return `<pre class="prompt">${promptHtml(t.content.replace(/\n$/, ''), md.utils.escapeHtml)}</pre>\n`;
    const label = t.attrGet('path');
    const start = Math.max(1, parseInt(t.attrGet('start'), 10) || 1);
    t.attrs = (t.attrs || []).filter(([k]) => !['path', 'start', 'scale'].includes(k));
    const src = t.content.replace(/\n$/, '').split('\n');
    const digits = String(start + src.length - 1).length;
    const longest = Math.max(...src.map((l) => l.replace(/\t/g, '    ').length));
    const counter = `counter-reset: line ${start - 1}; --ln-w: ${digits}ch`;
    const html = fence(tokens, idx, options, env, self)
      .replace(/<pre\b/, `<pre style="--code-cols: ${(longest + digits + 1.6).toFixed(1)}"`)
      .replace(/(<code[^>]*)>([\s\S]*?)(<\/code>)/, (_, a, body, c) => `${a} style="${counter}">${numberLines(body.replace(/\n$/, ''))}${c}`);
    return '<div class="code"><div class="code-box">' + (label ? `<div class="code-path">${md.utils.escapeHtml(label)}</div>` : '') + html + '</div></div>\n';
  };
}

// ---------- lists and consequence arrows ----------
// List markers are drawn by the theme from a counter, so an ordered list that resumes (3. after a paragraph)
// starts its counter here. ➔ is drawn as a plain →; a paragraph opening with it hangs its wrapped lines
// after the arrow, and right after a list it lines up with the list's text.
function marks(md) {
  md.core.ruler.after('inline', 'rs_marks', (state) => {
    const toks = state.tokens;
    toks.forEach((t, i) => {
      if (t.type === 'ordered_list_open') {
        const start = parseInt(t.attrGet('start'), 10);
        if (start > 1) t.attrJoin('style', `counter-reset: item ${start - 1}`);
      }
      if (t.type !== 'inline') return;
      const kids = t.children || [];
      const open = toks[i - 1];
      if (open && open.type === 'paragraph_open' && !open.hidden && kids[0] && kids[0].type === 'text' && /^➔\s*/.test(kids[0].content)) {
        kids[0].content = kids[0].content.replace(/^➔\s*/, '');
        const mark = new state.Token('html_inline', '', 0);
        mark.content = '<span class="then-mark">→</span>';
        kids.unshift(mark);
        open.attrJoin('class', 'then');
      }
      for (const c of kids) if (c.type === 'text') c.content = c.content.replaceAll('➔', '→');
    });
  });
}

// ---------- source rewrites: repeated titles, table of contents, thanks page ----------
const DIVIDED = /^\s*headingDivider:\s*[1-6]|<!--\s*headingDivider:\s*[1-6]/m;

/** Walk the Markdown lines outside the front matter, fences and HTML comments, calling fn(line, i). */
function eachLine(lines, fn) {
  let i = 0, fence = null, comment = false;
  if (lines[0] === '---') { i = lines.indexOf('---', 1) + 1; if (i === 0) i = lines.length; }
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (fence) { if (l.trim().startsWith(fence)) fence = null; continue; }
    if (comment) { if (l.includes('-->')) comment = false; continue; }
    const f = l.match(/^\s*(```+|~~~+)/);
    if (f) { fence = f[1]; continue; }
    if (/^\s*<!--/.test(l) && !l.includes('-->')) { comment = true; continue; }
    fn(l, i);
  }
}

/** A ### that opens a new slide may leave out its ## when the title stays the same: the previous ## is
    repeated before it. With headingDivider that is a ### following another ### under one ##; without it,
    a ### on a slide (after ---) that has no ## of its own. */
function repeatTitles(src) {
  const lines = src.split('\n');
  const divided = DIVIDED.test(src);
  const insert = [];
  let h2 = null, hasH2 = false, seenH3 = false;
  eachLine(lines, (l, i) => {
    if (/^\s*(---|\*\*\*|___)\s*$/.test(l)) { hasH2 = false; seenH3 = false; return; }
    const h = l.match(/^(#{1,3})\s+(.*)$/);
    if (!h) return;
    if (h[1] === '#') { h2 = null; hasH2 = false; seenH3 = false; }
    else if (h[1] === '##') { h2 = h[2]; hasH2 = true; seenH3 = false; }
    else {
      if (h2 && (divided ? seenH3 : !hasH2)) { insert.push([i, `## ${h2}`]); hasH2 = true; }
      seenH3 = true;
    }
  });
  for (const [i, line] of insert.reverse()) lines.splice(i, 0, line, '');
  return lines.join('\n');
}

/** front matter `toc: true` (or `toc: Title`): a contents slide after the first slide, filled in by tocs() */
function insertToc(src) {
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  const m = fm && fm[1].match(/^toc:\s*(.+?)\s*$/m);
  if (!m || /^(false|no|off)$/i.test(m[1])) return src;
  const title = /^(true|yes|on)$/i.test(m[1]) ? 'Outline' : m[1];
  const lines = src.split('\n');
  const divided = DIVIDED.test(src);
  let started = false, at = -1;
  eachLine(lines, (l, i) => {
    if (at >= 0) return;
    const brk = /^\s*(---|\*\*\*|___)\s*$/.test(l) || (divided && /^#{1,2}\s/.test(l));
    if (started && brk) at = i;
    else if (/^#{1,6}\s/.test(l) || (l.trim() && !/^\s*<!--.*-->\s*$/.test(l))) started = true;
  });
  const slide = `## ${title}\n\n<div class="toc"></div>\n`;
  if (at < 0) return `${src.replace(/\s*$/, '')}\n\n${divided ? '' : '---\n\n'}${slide}`;
  lines.splice(at, 0, ...(divided ? [slide] : ['---', '', slide]));
  return lines.join('\n');
}

/** Fill the contents slide: every later slide's ## with its ### under it, a run of slides with the same ##
    as one entry, (1/2)-style part numbers dropped, each entry linking to its first slide. */
function tocs(md) {
  md.core.ruler.after('marpit_slide', 'rs_toc', (state) => {
    const toks = state.tokens;
    const at = toks.findIndex((t) => t.type === 'html_block' && /<div class="toc"><\/div>/.test(t.content));
    if (at < 0) return;
    const groups = [];
    let slide = 0, tocSlide = 0;
    toks.forEach((t, i) => {
      if (t.type === 'marpit_slide_open') slide++;
      if (i === at) tocSlide = slide;
      if (t.type !== 'heading_open' || !['h1', 'h2', 'h3'].includes(t.tag) || !tocSlide || slide <= tocSlide) return;
      const text = toks[i + 1].content.replace(/\s*\{[^}]*\}\s*$/, '');
      if (t.tag === 'h1') { groups.push(null); return; }    // a section page ends the run of a title
      const last = groups[groups.length - 1];
      if (t.tag === 'h2') { if (!last || last.title !== text || last.slideEnd !== slide - 1) groups.push({ title: text, slide, slideEnd: slide, subs: [] }); else last.slideEnd = slide; return; }
      if (!last) return;
      last.slideEnd = slide;
      const sub = text.replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, '');
      if (!last.subs.some((x) => x.title === sub)) last.subs.push({ title: sub, slide });
    });
    const inline = (x) => state.md.renderInline(x, state.env);
    const li = (g) => `<li><a href="#${g.slide}">${inline(g.title)}</a>` +
      (g.subs.length ? `<ul>${g.subs.map((x) => `<li><a href="#${x.slide}">${inline(x.title)}</a></li>`).join('')}</ul>` : '') + '</li>';
    toks[at].content = `<div class="toc"><ul>${groups.filter(Boolean).map(li).join('')}</ul></div>\n`;
  });
}

// ---------- footnotes: per slide ----------
// Cited definitions go to the slides that cite them, numbered in citing order. A definition nobody cites
// (a caveat or a link for the whole slide) goes to the slide its source line sits in.
function footnotes(md) {
  // markdown-it-footnote drops uncited definitions in footnote_tail, so record every one before that
  md.core.ruler.before('footnote_tail', 'rs_footnote_defs', (state) => {
    const all = (state.env.rsFootnoteDefs = []);
    let cur = null;
    for (const t of state.tokens) {
      if (t.type === 'footnote_reference_open') cur = { label: t.meta.label, line: null, children: [] };
      else if (t.type === 'footnote_reference_close') { all.push(cur); cur = null; }
      else if (cur) {
        if (cur.line == null && t.map) cur.line = t.map[0];
        if (t.type === 'inline') cur.children.push(...t.children);
      }
    }
  });
  md.core.ruler.after('marpit_slide', 'rs_footnotes', (state) => {
    const toks = state.tokens;
    const defs = {}; // footnote id -> inline children
    let id = null;
    const keep = [];
    let inBlock = false;
    for (const t of toks) {
      if (t.type === 'footnote_block_open') { inBlock = true; continue; }
      if (t.type === 'footnote_block_close') { inBlock = false; continue; }
      if (!inBlock) { keep.push(t); continue; }
      if (t.type === 'footnote_open') id = t.meta.id;
      else if (t.type === 'inline' && id != null) (defs[id] = defs[id] || []).push(...t.children.filter((c) => c.type !== 'footnote_anchor'));
    }
    const cited = new Set(((state.env.footnotes && state.env.footnotes.list) || []).map((f) => f.label));
    const uncited = (state.env.rsFootnoteDefs || []).filter((d) => !cited.has(d.label));
    const starts = keep.filter((t) => t.type === 'marpit_slide_open').map((t) => (t.map ? t.map[0] : 0));
    const slideOf = (line) => { let k = 0; starts.forEach((st, i) => { if (st <= line) k = i; }); return k; };
    const out = [];
    let slide = null; // { ids: [], n }
    let n = -1;
    for (const t of keep) {
      if (t.type === 'marpit_slide_open') { n++; slide = { ids: [] }; }
      if (t.type === 'inline' && slide) for (const c of t.children || []) {
        if (c.type !== 'footnote_ref') continue;
        if (!slide.ids.includes(c.meta.id)) slide.ids.push(c.meta.id);
        c.meta.rsSlide = n;
        c.meta.rsNumber = slide.ids.indexOf(c.meta.id) + 1;
      }
      if (t.type === 'marpit_slide_close' && slide) {
        const items = slide.ids.map((fid, k) => ({ number: k + 1, children: defs[fid] || [] }));
        for (const d of uncited.filter((d) => slideOf(d.line ?? 0) === n)) items.push({ number: items.length + 1, children: d.children });
        if (items.length) {
          const ft = new state.Token('rs_footnotes', 'div', 0);
          ft.block = true;
          ft.meta = { items, slide: n };
          out.push(ft);
        }
      }
      out.push(t);
    }
    state.tokens = out;
  });
  md.renderer.rules.footnote_ref = (tokens, idx) => {
    const { rsSlide, rsNumber, id } = tokens[idx].meta;
    const k = rsNumber || id + 1;
    return `<sup class="fn-ref"><a href="#fn-${rsSlide ?? 0}-${k}">[${k}]</a></sup>`;
  };
  // uncited definitions were taken before text_join, so escapes (\*) are still text_special tokens
  const joinText = (children) => children.map((c) => (c.type === 'text_special' ? Object.assign(Object.create(Object.getPrototypeOf(c)), c, { type: 'text' }) : c));
  md.renderer.rules.rs_footnotes = (tokens, idx, options, env, self) =>
    '<div class="footnotes">' + tokens[idx].meta.items.map((it) => `<div id="fn-${tokens[idx].meta.slide}-${it.number}">[${it.number}] ${self.renderInline(joinText(it.children), options, env)}</div>`).join('') + '</div>\n';
}

// ---------- slide types: title, section, divider as a class on the slide ----------
// # + a subtitle paragraph is the title page; a last slide holding only a # line is the thanks page (same
// layout); # alone elsewhere is a section page; # Name {.divider} is a plain divider.
function slideTypes(md) {
  md.core.ruler.after('marpit_directives_apply', 'rs_slide_types', (state) => {
    const slides = [];
    let cur = null, depth = 0;
    for (const t of state.tokens) {
      if (t.type === 'marpit_slide_open') { cur = { open: t, h1: null, para: false, other: false }; slides.push(cur); depth = 0; continue; }
      if (t.type === 'marpit_slide_close') { cur = null; continue; }
      if (!cur || /^marpit_/.test(t.type)) continue;
      if (depth === 0 && !['html_block', 'front_matter', 'rs_footnotes', 'heading_close', 'paragraph_close', 'inline'].includes(t.type)) {
        if (t.type === 'heading_open' && t.tag === 'h1' && !cur.h1) cur.h1 = t;
        else if (t.type === 'paragraph_open') cur.para = true;
        else cur.other = true;
      }
      depth += t.nesting;
    }
    slides.forEach((sl, i) => {
      if (!sl.h1) return;
      let type = 'section';
      if (/\bdivider\b/.test(sl.h1.attrGet('class') || '')) type = 'divider';
      else if (!sl.other && (sl.para || i === slides.length - 1)) type = 'title';
      sl.open.attrJoin('class', type);
    });
  });
}

module.exports = ({ marp }) => {
  marp.themeSet.add(theme());
  // slides.sh --thanks: close the deck with a thanks page (the title-page layout); off by default
  // with headingDivider the # line starts its own slide; a --- as well would leave an empty slide between
  const thanks = (src) => (process.env.RS_THANKS ? `${src.replace(/\s*$/, '')}\n\n${DIVIDED.test(src) ? '' : '---\n\n'}# ${process.env.RS_THANKS}\n` : src);
  const parse = marp.markdown.parse.bind(marp.markdown);
  marp.markdown.parse = (src, env) => parse(thanks(insertToc(repeatTitles(src))), env);
  return marp
    .use(require('markdown-it-footnote'))
    .use(require('markdown-it-mark'))
    .use(require('markdown-it-bracketed-spans'))
    .use(require('markdown-it-attrs'), { allowedAttributes: ['class', 'style', 'scale', 'path', 'start'] })
    .use(mathMacros)
    .use(figures)
    .use(tables)
    .use(fences)
    .use(marks)
    .use(tocs)
    .use(footnotes)
    .use(slideTypes);
};
module.exports.expand = expand;
module.exports.readMacros = readMacros;
