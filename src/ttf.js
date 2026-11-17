// Embed a TrueType font in a PDF, cut down to the WinAnsi characters Rekindle
// draws. Viewers built on pdf.js (Campfire's included) show nothing for text in
// a font that isn't embedded, so every Rekindle PDF carries its own.
//
// The fonts are Liberation Sans (SIL Open Font License, assets/fonts), which
// has the same character widths as Helvetica, so the layout is unchanged.
// Subsetting keeps glyph numbers as they are and empties the glyphs not
// needed: the font stays valid and each PDF grows by tens of KB, not 400.
import { readFileSync } from 'node:fs';

// WinAnsi codes 0x80–0x9F → Unicode; every other code in 32–255 is itself.
const WIN_80 = [0x20ac, 0, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0, 0x17d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0, 0x17e, 0x178];
export const winAnsiToUnicode = (code) => (code >= 0x80 && code <= 0x9f ? WIN_80[code - 0x80] : code);

const KEEP = ['OS/2', 'cmap', 'cvt ', 'fpgm', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post', 'prep'];

function tables(buf) {
  const n = buf.readUInt16BE(4);
  const out = {};
  for (let i = 0; i < n; i += 1) {
    const r = 12 + i * 16;
    out[buf.toString('latin1', r, r + 4)] = buf.subarray(buf.readUInt32BE(r + 8), buf.readUInt32BE(r + 8) + buf.readUInt32BE(r + 12));
  }
  return out;
}

// Unicode → glyph id, from the (3,1) format 4 cmap.
function cmapLookup(cmap) {
  const n = cmap.readUInt16BE(2);
  let sub = null;
  for (let i = 0; i < n; i += 1) {
    const r = 4 + i * 8;
    if (cmap.readUInt16BE(r) === 3 && cmap.readUInt16BE(r + 2) === 1) { sub = cmap.readUInt32BE(r + 4); break; }
  }
  if (sub === null || cmap.readUInt16BE(sub) !== 4) throw new Error('font has no Unicode cmap');
  const segX2 = cmap.readUInt16BE(sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  return (u) => {
    for (let s = 0; s < segX2; s += 2) {
      const end = cmap.readUInt16BE(ends + s);
      if (u > end) continue;
      const start = cmap.readUInt16BE(starts + s);
      if (u < start) return 0;
      const delta = cmap.readInt16BE(deltas + s);
      const ro = cmap.readUInt16BE(ranges + s);
      if (!ro) return (u + delta) & 0xffff;
      const g = cmap.readUInt16BE(ranges + s + ro + (u - start) * 2);
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
}

const pad4 = (b) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4))]) : b);
function checksum(b) {
  const p = pad4(b);
  let sum = 0;
  for (let i = 0; i < p.length; i += 4) sum = (sum + p.readUInt32BE(i)) >>> 0;
  return sum;
}

export function embedFont(path) {
  const buf = readFileSync(path);
  const t = tables(buf);
  const head = t.head;
  const unitsPerEm = head.readUInt16BE(18);
  const longLoca = head.readInt16BE(50) === 1;
  const numGlyphs = t.maxp.readUInt16BE(4);
  const numH = t.hhea.readUInt16BE(34);
  const advance = (g) => t.hmtx.readUInt16BE(Math.min(g, numH - 1) * 4);
  const loca = (g) => (longLoca ? t.loca.readUInt32BE(g * 4) : t.loca.readUInt16BE(g * 2) * 2);
  const glyph = cmapLookup(t.cmap);

  // Glyphs to keep: .notdef, every WinAnsi character, and the parts of composites.
  const keep = new Set([0]);
  const widths = [];
  for (let code = 32; code <= 255; code += 1) {
    const u = winAnsiToUnicode(code);
    const g = u ? glyph(u) : 0;
    if (g) keep.add(g);
    widths.push(Math.round((advance(g) * 1000) / unitsPerEm));
  }
  const queue = [...keep];
  while (queue.length) {
    const g = queue.pop();
    const start = loca(g);
    if (loca(g + 1) === start || t.glyf.readInt16BE(start) >= 0) continue;
    let p = start + 10;
    for (;;) {
      const flags = t.glyf.readUInt16BE(p);
      const part = t.glyf.readUInt16BE(p + 2);
      if (!keep.has(part)) { keep.add(part); queue.push(part); }
      p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
      if (!(flags & 0x20)) break;
    }
  }

  // New glyf/loca (long offsets) with only the kept glyphs' outlines.
  const parts = [];
  const offsets = Buffer.alloc((numGlyphs + 1) * 4);
  let at = 0;
  for (let g = 0; g < numGlyphs; g += 1) {
    offsets.writeUInt32BE(at, g * 4);
    if (keep.has(g)) {
      const data = pad4(t.glyf.subarray(loca(g), loca(g + 1)));
      parts.push(data);
      at += data.length;
    }
  }
  offsets.writeUInt32BE(at, numGlyphs * 4);
  const newHead = Buffer.from(head);
  newHead.writeInt16BE(1, 50);
  newHead.writeUInt32BE(0, 8);
  const out = { ...t, head: newHead, glyf: Buffer.concat(parts), loca: offsets };

  // Write the font file.
  const tags = KEEP.filter((k) => out[k]);
  const n = tags.length;
  const pow = 2 ** Math.floor(Math.log2(n));
  const header = Buffer.alloc(12 + n * 16);
  header.writeUInt32BE(0x00010000, 0);
  header.writeUInt16BE(n, 4);
  header.writeUInt16BE(pow * 16, 6);
  header.writeUInt16BE(Math.log2(pow), 8);
  header.writeUInt16BE(n * 16 - pow * 16, 10);
  let offset = header.length;
  const bodies = [];
  tags.forEach((tag, i) => {
    const data = out[tag];
    const r = 12 + i * 16;
    header.write(tag, r, 'latin1');
    header.writeUInt32BE(checksum(data), r + 4);
    header.writeUInt32BE(offset, r + 8);
    header.writeUInt32BE(data.length, r + 12);
    bodies.push(pad4(data));
    offset += pad4(data).length;
  });
  const file = Buffer.concat([header, ...bodies]);
  const headAt = header.readUInt32BE(12 + tags.indexOf('head') * 16 + 8);
  file.writeUInt32BE((0xb1b0afba - checksum(file)) >>> 0, headAt + 8);

  const scale = (v) => Math.round((v * 1000) / unitsPerEm);
  const os2 = t['OS/2'];
  return {
    file,
    widths,
    bbox: [head.readInt16BE(36), head.readInt16BE(38), head.readInt16BE(40), head.readInt16BE(42)].map(scale),
    ascent: scale(t.hhea.readInt16BE(4)),
    descent: scale(t.hhea.readInt16BE(6)),
    capHeight: os2 && os2.readUInt16BE(0) >= 2 ? scale(os2.readInt16BE(88)) : scale(t.hhea.readInt16BE(4)),
    glyphs: keep.size,
  };
}
