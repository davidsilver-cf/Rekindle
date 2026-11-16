// Turn a PNG or JPEG into a PDF image XObject (plus a soft mask for PNG
// transparency). Anything else (SVG, WebP, GIF, a broken file) → null, and the
// invoice is drawn without the logo.
import { inflateSync, deflateSync } from 'node:zlib';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function readImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null;
  try {
    if (buf.subarray(0, 8).equals(PNG_SIG)) return readPng(buf);
    if (buf[0] === 0xff && buf[1] === 0xd8) return readJpeg(buf);
  } catch { /* fall through */ }
  return null;
}

function readJpeg(buf) {
  let i = 2;
  let adobe = false;
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xff) { i += 1; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker === 0xee && buf.subarray(i + 4, i + 9).toString('latin1') === 'Adobe') adobe = true;
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      const comps = buf[i + 9];
      const space = comps === 1 ? '/DeviceGray' : comps === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      const decode = comps === 4 && adobe ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
      if (!width || !height) return null;
      return { width, height, dict: `/ColorSpace ${space} /BitsPerComponent 8 /Filter /DCTDecode${decode}`, data: buf, smask: null };
    }
    i += 2 + len;
  }
  return null;
}

function readPng(buf) {
  let i = 8;
  let ihdr = null;
  let palette = null;
  let trns = null;
  const idat = [];
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.subarray(i + 4, i + 8).toString('latin1');
    const data = buf.subarray(i + 8, i + 8 + len);
    if (type === 'IHDR') ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    i += 12 + len;
  }
  if (!ihdr || ihdr.interlace !== 0 || !idat.length) return null;
  const { width, height, depth, color } = ihdr;
  if (width * height > 4_000_000) return null;
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  if (!channels || (color === 3 && !palette)) return null;
  const bpp = Math.max(1, (channels * depth) / 8);
  const stride = Math.ceil((width * channels * depth) / 8);
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const f = raw[y * (stride + 1)];
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let add = 0;
      if (f === 1) add = a;
      else if (f === 2) add = b;
      else if (f === 3) add = (a + b) >> 1;
      else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[x] = (row[x] + add) & 0xff;
    }
    row.copy(px, y * stride);
    prev = row;
  }
  // One sample (0–255) per channel per pixel.
  const sample = (y, idx) => {
    if (depth === 8) return px[y * stride + idx];
    if (depth === 16) return px[y * stride + idx * 2];
    const bit = idx * depth;
    const v = (px[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return color === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  const gray = color === 0 || color === 4;
  const out = Buffer.alloc(width * height * (gray ? 1 : 3));
  const alpha = Buffer.alloc(width * height, 255);
  let hasAlpha = false;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = y * width + x;
      if (color === 3) {
        const k = sample(y, x);
        palette.copy(out, o * 3, k * 3, k * 3 + 3);
        if (trns && k < trns.length) { alpha[o] = trns[k]; hasAlpha = hasAlpha || trns[k] < 255; }
      } else if (gray) {
        out[o] = sample(y, x * channels);
        if (color === 4) { alpha[o] = sample(y, x * 2 + 1); hasAlpha = hasAlpha || alpha[o] < 255; }
      } else {
        for (let c = 0; c < 3; c += 1) out[o * 3 + c] = sample(y, x * channels + c);
        if (color === 6) { alpha[o] = sample(y, x * 4 + 3); hasAlpha = hasAlpha || alpha[o] < 255; }
      }
    }
  }
  return {
    width, height,
    dict: `/ColorSpace /${gray ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /FlateDecode`,
    data: deflateSync(out),
    smask: hasAlpha ? { dict: '/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode', data: deflateSync(alpha) } : null,
  };
}

// Fit (w, h) inside a box, keeping the shape.
export function fitBox(width, height, maxW, maxH) {
  const s = Math.min(maxW / width, maxH / height, 1e9);
  return { w: width * s, h: height * s };
}
