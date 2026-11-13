// Kleine Hilfsfunktionen der Simulation (DOM-frei).
(function (WW) { 'use strict';

  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const B64I = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) B64I[B64.charCodeAt(i)] = i;

  function bytesToB64(bytes) {
    let out = '';
    const n = bytes.length;
    let i = 0;
    const parts = [];
    for (; i + 2 < n; i += 3) {
      const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63];
      if (out.length > 8192) { parts.push(out); out = ''; }
    }
    if (i < n) {
      const v = (bytes[i] << 16) | ((i + 1 < n ? bytes[i + 1] : 0) << 8);
      out += B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + (i + 1 < n ? B64[(v >> 6) & 63] : '=') + '=';
    }
    parts.push(out);
    return parts.join('');
  }
  function b64ToBytes(str) {
    str = String(str || '');
    let len = str.length;
    while (len > 0 && str[len - 1] === '=') len--;
    const out = new Uint8Array(Math.floor(len * 3 / 4));
    let o = 0, buf = 0, bits = 0;
    for (let i = 0; i < len; i++) {
      const c = str.charCodeAt(i);
      const v = c < 128 ? B64I[c] : -1;
      if (v < 0) continue;
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; if (o < out.length) out[o++] = (buf >> bits) & 255; }
    }
    return out;
  }
  // Typed Array -> Text und zurück (Little Endian wie alle realen Plattformen)
  function encodeArray(arr) {
    return bytesToB64(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));
  }
  function decodeArray(str, Ctor, n) {
    const bytes = b64ToBytes(str);
    const out = new Ctor(n);
    const view = new Uint8Array(out.buffer);
    view.set(bytes.subarray(0, Math.min(bytes.length, view.length)));
    return out;
  }

  function hashString(s) {
    let h1 = 0x811c9dc5 >>> 0, h2 = 0x01000193 >>> 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c, 2246822519) >>> 0;
    }
    return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
  }

  function roman(n) {
    n = Math.max(1, Math.min(3999, n | 0));
    const v = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
    const s = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
    let out = '';
    for (let i = 0; i < v.length; i++) while (n >= v[i]) { out += s[i]; n -= v[i]; }
    return out;
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  // Zahlwort für kleine Zahlen (Chronik)
  const NUMWORDS = ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];
  function numWord(n, cap) {
    let w = (n >= 0 && n < NUMWORDS.length) ? NUMWORDS[n] : String(n);
    if (n === 1) w = 'ein';
    return cap ? w.charAt(0).toUpperCase() + w.slice(1) : w;
  }
  function ordinalWord(n) {
    const o = ['nullten', 'ersten', 'zweiten', 'dritten', 'vierten', 'fünften', 'sechsten', 'siebten', 'achten', 'neunten', 'zehnten'];
    return n >= 0 && n < o.length ? o[n] : n + '.';
  }

  // Modifikatoren aus js/sim/mods.js (Ereignisse, Reichsgesetze); ohne die Datei bleibt der Basiswert
  function mod(sim, kingdom, city, key, base) {
    return WW.Mods ? WW.Mods.value(sim, kingdom || null, city || null, key, base) : base;
  }
  function modFlag(sim, kingdom, key) {
    return WW.Mods && kingdom ? WW.Mods.flag(sim, kingdom, key) : undefined;
  }

  WW.SimUtil = {
    mod: mod, modFlag: modFlag,
    bytesToB64: bytesToB64, b64ToBytes: b64ToBytes, encodeArray: encodeArray, decodeArray: decodeArray,
    hashString: hashString, roman: roman, clamp: clamp, isNum: isNum, numWord: numWord, ordinalWord: ordinalWord,
    // 8 Nachbarn: dx, dy (zuerst orthogonal)
    DX8: [0, 1, 0, -1, 1, 1, -1, -1],
    DY8: [-1, 0, 1, 0, -1, 1, 1, -1]
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
