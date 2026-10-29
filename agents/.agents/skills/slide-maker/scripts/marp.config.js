// marp-cli configuration for slide-maker decks: `scripts/slides.sh` passes it with --config-file.
// The engine (marp-engine.js) registers the theme, so a deck only needs `theme: slide-maker`.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
module.exports = {
  engine: require('./marp-engine.js'),
  html: true,              // <hr class="rule">, <div> wrappers for columns
  allowLocalFiles: true,   // figures and the cover photo are local files
  imageScale: 3,           // pptx / png pages at 2880 x 1620; slides.sh --scale N overrides it
  // KaTeX sets math as text in its own fonts, so formulas stay selectable and searchable in the PDF;
  // the fonts come from the local katex package, not a CDN
  options: { math: { lib: 'katex', katexFontPath: pathToFileURL(path.join(__dirname, 'node_modules', 'katex', 'dist', 'fonts')).href + '/' } },
};
