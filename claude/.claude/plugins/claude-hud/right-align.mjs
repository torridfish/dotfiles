// Post-processes claude-hud's compact output: splits the first line at its last
// " | " separator and pads the gap so the trailing segment (model badge +
// context bar) sits flush against the right edge. Falls back to the untouched
// line whenever the width is unknown or there is no room to pad.
const SEP = ' | ';

// Strip OSC-8 hyperlink wrappers (ST- or BEL-terminated) and CSI sequences so
// only printable content is measured.
function visibleWidth(text) {
  const plain = text
    .replace(/\x1b\]8;;.*?(?:\x1b\\|\x07)/g, '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

  let width = 0;
  for (const ch of plain) {
    const cp = ch.codePointAt(0);
    if (cp === 0x200b || (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0xfe00 && cp <= 0xfe0f)) continue;
    const wide =
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f64f) ||
      (cp >= 0x1f900 && cp <= 0x1f9ff);
    width += wide ? 2 : 1;
  }
  return width;
}

const columns = Number.parseInt(process.env.COLUMNS ?? '', 10);

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const lines = input.split('\n');

  if (Number.isFinite(columns) && columns > 0 && lines.length > 0) {
    const first = lines[0];
    const index = first.lastIndexOf(SEP);
    if (index > 0) {
      const left = first.slice(0, index);
      const right = first.slice(index + SEP.length);
      const gap = columns - visibleWidth(left) - visibleWidth(right);
      if (gap >= 1) {
        lines[0] = `${left}${' '.repeat(gap)}${right}`;
      }
    }
  }

  process.stdout.write(lines.join('\n'));
});
