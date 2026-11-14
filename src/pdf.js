// A small PDF writer: text in Helvetica / Helvetica-Bold, lines, filled
// rectangles, rotated text. No libraries. Coordinates are in points from the
// TOP-LEFT of a US Letter page (612 × 792), which is easier to lay out with.
import { deflateSync } from 'node:zlib';

export const PAGE = { width: 612, height: 792 };

// Helvetica glyph widths (1/1000 em) for ASCII 32–126, from the standard AFM metrics.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELV_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

// Characters outside ASCII that WinAnsi can show: [byte, Helvetica width, Bold width].
const EXTRA = {
  '–': [0x96, 556, 556], '—': [0x97, 1000, 1000], '‘': [0x91, 222, 278], '’': [0x92, 222, 278],
  '“': [0x93, 333, 500], '”': [0x94, 333, 500], '•': [0x95, 350, 350], '·': [0xb7, 278, 278],
  '…': [0x85, 1000, 1000], '×': [0xd7, 584, 584], '→': [0x3e, 584, 584], 'é': [0xe9, 556, 556],
  'è': [0xe8, 556, 556], 'ü': [0xfc, 556, 611], 'ñ': [0xf1, 556, 611], '°': [0xb0, 400, 400],
};

const FONTS = { regular: { key: 'F1', widths: HELV, extra: 1 }, bold: { key: 'F2', widths: HELV_BOLD, extra: 2 } };

export function textWidth(str, size, font = 'regular') {
  const f = FONTS[font];
  let units = 0;
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) units += f.widths[c - 32];
    else if (EXTRA[ch]) units += EXTRA[ch][f.extra];
    else units += 556;
  }
  return (units * size) / 1000;
}

// Encode a string as a PDF literal, WinAnsi bytes; anything unknown becomes '?'.
function pdfString(str) {
  let out = '';
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    let byte;
    if (c >= 32 && c <= 126) byte = c;
    else if (EXTRA[ch]) byte = EXTRA[ch][0];
    else byte = 63;
    if (byte === 40 || byte === 41 || byte === 92) out += '\\' + String.fromCharCode(byte);
    else if (byte > 126) out += '\\' + byte.toString(8).padStart(3, '0');
    else out += String.fromCharCode(byte);
  }
  return `(${out})`;
}

function rgb(hex) {
  const h = String(hex || '#000000').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(' ');
}
const num = (v) => (Math.round(v * 100) / 100).toString();

// Break text into lines that fit a width.
export function wrap(str, width, size, font = 'regular') {
  const words = String(str ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (textWidth(next, size, font) <= width || !line) line = next;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

// Shorten text with an ellipsis so it fits a width.
export function fit(str, width, size, font = 'regular') {
  let s = String(str ?? '');
  if (textWidth(s, size, font) <= width) return s;
  while (s.length && textWidth(s + '…', size, font) > width) s = s.slice(0, -1);
  return s + '…';
}

class Page {
  constructor() { this.ops = []; }
  y(top) { return PAGE.height - top; }

  text(x, top, str, { size = 10, font = 'regular', color = '#1C1B19', align = 'left' } = {}) {
    const w = textWidth(str, size, font);
    const left = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    this.ops.push(`BT /${FONTS[font].key} ${num(size)} Tf ${rgb(color)} rg ${num(left)} ${num(this.y(top))} Td ${pdfString(str)} Tj ET`);
    return w;
  }

  rotatedText(cx, cy, str, { size = 80, font = 'bold', color = '#EEEEEE', angle = 35 } = {}) {
    const a = (angle * Math.PI) / 180;
    const w = textWidth(str, size, font);
    const cos = Math.cos(a), sin = Math.sin(a);
    // Center the text on (cx, cy).
    const x = cx - (w / 2) * cos + (size / 3) * sin;
    const y = this.y(cy) - (w / 2) * sin - (size / 3) * cos;
    this.ops.push(`q BT /${FONTS[font].key} ${num(size)} Tf ${rgb(color)} rg ${cos.toFixed(4)} ${sin.toFixed(4)} ${(-sin).toFixed(4)} ${cos.toFixed(4)} ${num(x)} ${num(y)} Tm ${pdfString(str)} Tj ET Q`);
  }

  line(x1, t1, x2, t2, { color = '#E6E2DC', width = 0.75 } = {}) {
    this.ops.push(`q ${rgb(color)} RG ${num(width)} w ${num(x1)} ${num(this.y(t1))} m ${num(x2)} ${num(this.y(t2))} l S Q`);
  }

  rect(x, top, w, h, { fill = null, stroke = null, width = 0.75 } = {}) {
    const parts = ['q'];
    if (fill) parts.push(`${rgb(fill)} rg`);
    if (stroke) parts.push(`${rgb(stroke)} RG ${num(width)} w`);
    parts.push(`${num(x)} ${num(this.y(top + h))} ${num(w)} ${num(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`);
    this.ops.push(parts.join(' '));
  }
}

export class Pdf {
  constructor({ title = 'Document', author = '' } = {}) {
    this.pages = [];
    this.title = title;
    this.author = author;
  }

  addPage() {
    const p = new Page();
    this.pages.push(p);
    return p;
  }

  toBuffer() {
    const objs = [];
    const add = (body) => { objs.push(body); return objs.length; };
    const catalog = add(null);
    const pagesId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = [];
    for (const p of this.pages) {
      const data = deflateSync(Buffer.from(p.ops.join('\n'), 'latin1'));
      const content = add({ dict: `<< /Length ${data.length} /Filter /FlateDecode >>`, stream: data });
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${content} 0 R >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    const info = add(`<< /Title ${pdfString(this.title)} /Author ${pdfString(this.author)} /Producer (Rekindle) >>`);

    const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
    let offset = chunks[0].length;
    const offsets = [];
    objs.forEach((o, i) => {
      offsets.push(offset);
      const head = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
      const body = typeof o === 'string'
        ? Buffer.from(`${o}\n`, 'latin1')
        : Buffer.concat([Buffer.from(`${o.dict}\nstream\n`, 'latin1'), o.stream, Buffer.from('\nendstream\n', 'latin1')]);
      const tail = Buffer.from('endobj\n', 'latin1');
      chunks.push(head, body, tail);
      offset += head.length + body.length + tail.length;
    });
    const xref = [`xref\n0 ${objs.length + 1}\n`, '0000000000 65535 f \n', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
    chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(chunks);
  }
}
