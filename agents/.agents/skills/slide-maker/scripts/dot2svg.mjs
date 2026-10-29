// Graphviz DOT on stdin -> SVG on stdout, with the WASM build of Graphviz (no system install).
// Used by marp-engine.js for ```dot / ```graphviz fences.
import { Graphviz } from '@hpcc-js/wasm-graphviz';

let src = '';
for await (const chunk of process.stdin) src += chunk;
const graphviz = await Graphviz.load();
process.stdout.write(graphviz.dot(src));
