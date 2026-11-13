#!/usr/bin/env node
// Erzeugt app/build/icon.ico (16–256 px) und app/build/icon.png aus icons/icon-512.png.
// Nur Node-Bordmittel (zlib): PNG lesen, verkleinern, PNG schreiben, in ICO verpacken.
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, '..', 'icons', 'icon-512.png');
const OUT = path.join(__dirname, 'build');
const SIZES = [256, 128, 64, 48, 32, 16];

// --- PNG lesen (8 Bit RGBA oder RGB, ohne Interlace) ---
function readPng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('keine PNG-Datei');
  let pos = 8, w = 0, h = 0, type = 0, depth = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), name = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || (type !== 6 && type !== 2) || interlace) throw new Error('PNG-Format nicht unterstützt');
  const ch = type === 6 ? 4 : 3, stride = w * ch;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), off = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[off++], line = Buffer.from(raw.subarray(off, off + stride)); off += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = (line[x] + p) & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      px[o] = line[x * ch]; px[o + 1] = line[x * ch + 1]; px[o + 2] = line[x * ch + 2]; px[o + 3] = ch === 4 ? line[x * ch + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px };
}

// --- Verkleinern: Flächenmittel mit vormultipliziertem Alpha ---
function resize(img, s) {
  const out = Buffer.alloc(s * s * 4), fx = img.w / s, fy = img.h / s;
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let yy = Math.floor(y * fy); yy < Math.floor((y + 1) * fy); yy++)
      for (let xx = Math.floor(x * fx); xx < Math.floor((x + 1) * fx); xx++) {
        const o = (yy * img.w + xx) * 4, al = img.px[o + 3];
        r += img.px[o] * al; g += img.px[o + 1] * al; b += img.px[o + 2] * al; a += al; n++;
      }
    const o = (y * s + x) * 4;
    out[o] = a ? Math.round(r / a) : 0; out[o + 1] = a ? Math.round(g / a) : 0; out[o + 2] = a ? Math.round(b / a) : 0; out[o + 3] = Math.round(a / n);
  }
  return { w: s, h: s, px: out };
}

// --- PNG schreiben ---
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(name, data) {
  const len = Buffer.alloc(4), crc = Buffer.alloc(4), nd = Buffer.concat([Buffer.from(name, 'ascii'), data]);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(nd));
  return Buffer.concat([len, nd, crc]);
}
function writePng(img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.w, 0); ihdr.writeUInt32BE(img.h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((img.w * 4 + 1) * img.h);
  for (let y = 0; y < img.h; y++) img.px.copy(raw, y * (img.w * 4 + 1) + 1, y * img.w * 4, (y + 1) * img.w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// --- ICO mit eingebetteten PNGs (ab Windows Vista üblich) ---
function writeIco(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + i * 16;
    head[e] = size >= 256 ? 0 : size; head[e + 1] = size >= 256 ? 0 : size;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += data.length;
  });
  return Buffer.concat([head].concat(pngs.map(p => p.data)));
}

const img = readPng(fs.readFileSync(SRC));
const pngs = SIZES.map(size => ({ size, data: writePng(resize(img, size)) }));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon.ico'), writeIco(pngs));
fs.copyFileSync(SRC, path.join(OUT, 'icon.png'));
console.log('app/build/icon.ico', SIZES.join('/') + ' px', (fs.statSync(path.join(OUT, 'icon.ico')).size / 1024).toFixed(0) + ' KB');
