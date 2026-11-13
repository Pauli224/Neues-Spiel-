// Weltgenerator: eigenständig (eigener Zufall, eigenes Rauschen), DOM-frei, deterministisch.
// Hängt nur von js/core/terrain.js ab. Nur Grundrechenarten + sqrt/floor (keine sin/exp/pow),
// damit jede JS-Engine bitgenau dieselbe Welt erzeugt.
(function (WW) { 'use strict';

  const TT = WW.T;
  const LUT = WW.TERRAIN_LUT;
  const NT = WW.TERRAIN.length;
  const SEA_LEVEL = 100;

  // ---------------------------------------------------------------- Zufall
  function hashString(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }
  function mix32(a, b) {
    let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return (h ^ (h >>> 15)) >>> 0;
  }
  function Rng(seed) { this.s = seed | 0; }
  Rng.prototype.next = function () {
    const a = (this.s = (this.s + 0x6D2B79F5) | 0);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  Rng.prototype.int = function (n) { return Math.floor(this.next() * n); };
  Rng.prototype.pick = function (arr) { return arr[this.int(arr.length)]; };
  // Eigener Zufallsstrom je Arbeitsschritt: Regler verschieben nie die Würfe anderer Schritte.
  function stream(seed, name) { return new Rng(mix32(seed, hashString(name))); }
  function randDir(r) {
    for (;;) {
      const a = r.next() * 2 - 1, b = r.next() * 2 - 1, l = a * a + b * b;
      if (l > 0.04 && l <= 1) { const s = Math.sqrt(l); return [a / s, b / s]; }
    }
  }

  // ---------------------------------------------------------------- Rauschen
  // Gradientenrauschen mit 16 festen Richtungen (Tabelle statt sin/cos).
  const G16 = [1, 0, 0.92388, 0.38268, 0.70711, 0.70711, 0.38268, 0.92388, 0, 1, -0.38268, 0.92388,
    -0.70711, 0.70711, -0.92388, 0.38268, -1, 0, -0.92388, -0.38268, -0.70711, -0.70711, -0.38268, -0.92388,
    0, -1, 0.38268, -0.92388, 0.70711, -0.70711, 0.92388, -0.38268];
  function Noise(seed) {
    const r = new Rng(seed), p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = r.int(i + 1), t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512); this.gx = new Float32Array(512); this.gy = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const v = p[i & 255]; this.perm[i] = v;
      this.gx[i] = G16[(v & 15) * 2]; this.gy[i] = G16[(v & 15) * 2 + 1];
    }
  }
  Noise.prototype.n2 = function (x, y) {
    const fx = Math.floor(x), fy = Math.floor(y);
    const xf = x - fx, yf = y - fy, xi = fx & 255, yi = fy & 255;
    const P = this.perm, GX = this.gx, GY = this.gy;
    const a = P[xi] + yi, b = P[xi + 1] + yi;
    const i00 = P[a], i01 = P[a + 1], i10 = P[b], i11 = P[b + 1];
    const d00 = GX[i00] * xf + GY[i00] * yf;
    const d10 = GX[i10] * (xf - 1) + GY[i10] * yf;
    const d01 = GX[i01] * xf + GY[i01] * (yf - 1);
    const d11 = GX[i11] * (xf - 1) + GY[i11] * (yf - 1);
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const x1 = d00 + u * (d10 - d00), x2 = d01 + u * (d11 - d01);
    return (x1 + v * (x2 - x1)) * 1.45;
  };
  Noise.prototype.fbm = function (x, y, oct, gain) {
    let s = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      s += amp * this.n2(x * f + o * 17.13, y * f + o * 31.71);
      norm += amp; amp *= gain; f *= 2.03;
    }
    return s / norm;
  };
  // Kammrauschen: scharfe Grate, die sich zu Zügen verbinden.
  Noise.prototype.ridged = function (x, y, oct) {
    let s = 0, amp = 1, norm = 0, f = 1, w = 1;
    for (let o = 0; o < oct; o++) {
      let n = 1 - Math.abs(this.n2(x * f + o * 13.7, y * f + o * 7.3));
      n *= n; n *= w;
      w = n * 1.8; if (w > 1) w = 1;
      s += n * amp; norm += amp; amp *= 0.5; f *= 2.03;
    }
    return s / norm;
  };

  // ---------------------------------------------------------------- Hilfen
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth01(v) { v = clamp01(v); return v * v * (3 - 2 * v); }

  function quantile(vals, mask, q) {
    let n = 0;
    if (mask) { for (let i = 0; i < vals.length; i++) if (mask[i]) n++; } else n = vals.length;
    if (n === 0) return 0;
    const a = new Float32Array(n);
    if (mask) { let k = 0; for (let i = 0; i < vals.length; i++) if (mask[i]) a[k++] = vals[i]; } else a.set(vals);
    a.sort();
    let idx = Math.floor(q * (n - 1)); if (idx < 0) idx = 0; if (idx > n - 1) idx = n - 1;
    return a[idx];
  }

  // Chamfer-Abstandsfeld zur nächsten Zelle mit src[i] != 0.
  function distField(src, W, H) {
    const N = W * H, d = new Float32Array(N), INF = 1e6, D = 1.41421;
    for (let i = 0; i < N; i++) d[i] = src[i] ? 0 : INF;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let v = d[i]; if (v === 0) continue;
      if (x > 0 && d[i - 1] + 1 < v) v = d[i - 1] + 1;
      if (y > 0) {
        if (d[i - W] + 1 < v) v = d[i - W] + 1;
        if (x > 0 && d[i - W - 1] + D < v) v = d[i - W - 1] + D;
        if (x < W - 1 && d[i - W + 1] + D < v) v = d[i - W + 1] + D;
      }
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; let v = d[i]; if (v === 0) continue;
      if (x < W - 1 && d[i + 1] + 1 < v) v = d[i + 1] + 1;
      if (y < H - 1) {
        if (d[i + W] + 1 < v) v = d[i + W] + 1;
        if (x < W - 1 && d[i + W + 1] + D < v) v = d[i + W + 1] + D;
        if (x > 0 && d[i + W - 1] + D < v) v = d[i + W - 1] + D;
      }
      d[i] = v;
    }
    return d;
  }

  // 4-zusammenhängende Komponenten von Zellen mit sel[i] != 0. Liefert { lab, sizes, touchBorder }.
  function components(sel, W, H) {
    const N = W * H, lab = new Int32Array(N).fill(-1), stack = new Int32Array(N);
    const sizes = [], border = [];
    for (let s = 0; s < N; s++) {
      if (!sel[s] || lab[s] >= 0) continue;
      const id = sizes.length; let sp = 0, cnt = 0, tb = false;
      stack[sp++] = s; lab[s] = id;
      while (sp) {
        const i = stack[--sp]; cnt++;
        const x = i % W, y = (i - x) / W;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) tb = true;
        if (x > 0 && sel[i - 1] && lab[i - 1] < 0) { lab[i - 1] = id; stack[sp++] = i - 1; }
        if (x < W - 1 && sel[i + 1] && lab[i + 1] < 0) { lab[i + 1] = id; stack[sp++] = i + 1; }
        if (y > 0 && sel[i - W] && lab[i - W] < 0) { lab[i - W] = id; stack[sp++] = i - W; }
        if (y < H - 1 && sel[i + W] && lab[i + W] < 0) { lab[i + W] = id; stack[sp++] = i + W; }
      }
      sizes.push(cnt); border.push(tb);
    }
    return { lab, sizes, touchBorder: border };
  }

  function boxBlur(src, W, H, r) {
    const N = W * H, tmp = new Float32Array(N), out = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      const row = y * W;
      for (let x = 0; x < W; x++) {
        let s = 0, c = 0;
        for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += src[row + xx]; c++; } }
        tmp[row + x] = s / c;
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s += tmp[yy * W + x]; c++; } }
      out[y * W + x] = s / c;
    }
    return out;
  }

  function Heap(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  Heap.prototype.push = function (key, val) {
    const K = this.k, V = this.v; let i = this.n++;
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= key) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = key; V[i] = val;
  };
  Heap.prototype.pop = function () {
    const K = this.k, V = this.v, top = V[0], n = --this.n;
    if (n === 0) return top;
    const key = K[n], val = V[n]; let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= n) break;
      if (c + 1 < n && K[c + 1] < K[c]) c++;
      if (K[c] >= key) break;
      K[i] = K[c]; V[i] = V[c]; i = c;
    }
    K[i] = key; V[i] = val; return top;
  };

  // Summierte Flächentabelle für schnelle Fenstersummen.
  function sat(vals, W, H) {
    const S = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) { row += vals[y * W + x]; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; }
    }
    return S;
  }
  function satSum(S, W, H, x0, y0, x1, y1) {
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 > W - 1) x1 = W - 1; if (y1 > H - 1) y1 = H - 1;
    const w1 = W + 1;
    return S[(y1 + 1) * w1 + x1 + 1] - S[y0 * w1 + x1 + 1] - S[(y1 + 1) * w1 + x0] + S[y0 * w1 + x0];
  }

  // ---------------------------------------------------------------- Konfiguration
  const SIZES = [
    { key: 'small', name: 'Klein', w: 96, h: 64 },
    { key: 'medium', name: 'Mittel', w: 144, h: 96 },
    { key: 'large', name: 'Groß', w: 192, h: 128 },
    { key: 'huge', name: 'Riesig', w: 256, h: 160 }
  ];
  const TEMPLATES = [
    { key: 'continents', name: 'Kontinente', desc: 'Zwei bis vier große Landmassen, getrennt durch offenes Meer.' },
    { key: 'pangaea', name: 'Urkontinent', desc: 'Ein einziges riesiges Festland mit tiefen Buchten und Binnenmeer.' },
    { key: 'archipelago', name: 'Inselreich', desc: 'Inselketten und Eilande, verstreut über einen weiten Ozean.' },
    { key: 'twins', name: 'Zwillinge', desc: 'Zwei ähnliche Kontinente, die sich über eine Meerenge anschauen.' },
    { key: 'ringsea', name: 'Ringmeer', desc: 'Ein Ring aus Land umschließt ein Binnenmeer mit Inseln.' },
    { key: 'lakeland', name: 'Seenland', desc: 'Weites Land voller Seen, Flüsse und Sümpfe.' },
    { key: 'coast', name: 'Küstenland', desc: 'Ein Festland an einer Seite, davor offenes Meer mit Inseln.' },
    { key: 'shards', name: 'Scherbenland', desc: 'Ein zersprungener Kontinent, durchzogen von schmalen Meeresarmen.' },
    { key: 'highlands', name: 'Gipfelreich', desc: 'Ein Kontinent um ein mächtiges Zentralgebirge, Flüsse strahlen nach außen.' },
    { key: 'random', name: 'Zufall', desc: 'Der Würfel wählt eine der Vorlagen aus.' }
  ];
  const DEFAULTS = Object.freeze({
    seed: 1, size: 'medium', template: 'continents', land: 0.5, mountains: 0.5,
    forests: 0.5, rivers: 0.5, temperature: 0.5, moisture: 0.5, magic: 0.3
  });
  const SLIDERS = ['land', 'mountains', 'forests', 'rivers', 'temperature', 'moisture', 'magic'];

  function seedToInt(seed) {
    if (typeof seed === 'number' && isFinite(seed)) {
      if (Math.floor(seed) === seed && seed >= 0 && seed < 4294967296) return seed >>> 0;
      return hashString(String(seed));
    }
    const s = String(seed == null ? '' : seed).trim();
    if (/^\d{1,9}$/.test(s)) return parseInt(s, 10) >>> 0;
    return hashString(s);
  }

  function normalizeOpts(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    for (const k of SLIDERS) {
      let v = +o[k]; if (!isFinite(v)) v = DEFAULTS[k];
      o[k] = clamp01(v);
    }
    let size = SIZES.find(s => s.key === o.size);
    if (!size) { size = SIZES[1]; o.size = size.key; }
    let W = size.w, H = size.h;
    if (opts && opts.w > 0 && opts.h > 0) { W = Math.max(32, Math.min(512, opts.w | 0)); H = Math.max(32, Math.min(512, opts.h | 0)); }
    if (!TEMPLATES.some(t => t.key === o.template)) o.template = DEFAULTS.template;
    o.W = W; o.H = H;
    return o;
  }

  // Themenwelten für „Alles würfeln“: Vorlagen und Regelbereiche mit Charakter.
  const THEMES = [
    { key: 'ice', name: 'Eiswelt', tpl: ['continents', 'pangaea', 'archipelago', 'coast'], s: { temperature: [0, 0.14], moisture: [0.35, 0.8], mountains: [0.3, 0.8], forests: [0.2, 0.6] } },
    { key: 'desert', name: 'Wüstenwelt', tpl: ['pangaea', 'continents', 'twins', 'coast'], s: { temperature: [0.82, 1], moisture: [0.06, 0.2], forests: [0.05, 0.3], rivers: [0.4, 0.8] } },
    { key: 'jungle', name: 'Dschungelwelt', tpl: ['continents', 'archipelago', 'lakeland', 'shards'], s: { temperature: [0.82, 1], moisture: [0.8, 1], forests: [0.75, 1], rivers: [0.5, 0.9] } },
    { key: 'swamp', name: 'Sumpfwelt', tpl: ['lakeland', 'pangaea', 'coast'], s: { temperature: [0.45, 0.7], moisture: [0.92, 1], mountains: [0, 0.25], rivers: [0.7, 1], forests: [0.3, 0.6] } },
    { key: 'magic', name: 'Zauberwelt', tpl: ['ringsea', 'archipelago', 'shards', 'continents'], s: { magic: [0.85, 1], moisture: [0.5, 0.9], forests: [0.4, 0.8] } },
    { key: 'peaks', name: 'Gebirgswelt', tpl: ['highlands', 'shards', 'pangaea'], s: { mountains: [0.88, 1], rivers: [0.5, 0.9], temperature: [0.2, 0.5] } },
    { key: 'ocean', name: 'Wasserwelt', tpl: ['archipelago'], s: { land: [0, 0.15], mountains: [0.2, 0.6], temperature: [0.5, 0.8] } },
    { key: 'wildwood', name: 'Urwald-Kontinent', tpl: ['pangaea', 'lakeland'], s: { land: [0.75, 1], forests: [0.9, 1], moisture: [0.6, 0.85], temperature: [0.35, 0.65] } },
    { key: 'steppe', name: 'Steppe mit Flussoasen', tpl: ['pangaea', 'continents', 'coast'], s: { temperature: [0.65, 0.85], moisture: [0.05, 0.22], rivers: [0.85, 1], forests: [0, 0.15], mountains: [0.3, 0.6] } }
  ];
  // Rohe Zufallswahl (ohne Startplatz-Prüfung): etwa jede dritte Welt ist eine Themenwelt.
  function randomPick(seedInt, attempt) {
    const r = stream(seedInt, 'randomOpts:' + attempt);
    const real = TEMPLATES.filter(t => t.key !== 'random').map(t => t.key);
    const o = { seed: mix32(seedInt, 7777 + attempt) % 1000000000, theme: 'mixed', themeName: 'Wilde Mischung' };
    // Regler über den ganzen Bereich (leicht zur Mitte gezogen, Ränder bleiben erreichbar)
    const wide = (a, b) => { const u = (r.next() + r.next() + r.next() * 0.6) / 2.6; return a + (b - a) * (r.next() < 0.3 ? r.next() : u); };
    o.template = r.pick(real);
    o.land = wide(0.1, 0.95); o.mountains = wide(0.05, 1); o.forests = wide(0.05, 1); o.rivers = wide(0.1, 1);
    o.temperature = wide(0.08, 0.92); o.moisture = wide(0.08, 0.92); o.magic = r.next() < 0.25 ? r.range(0.5, 1) : r.range(0, 0.45);
    if (r.next() < 0.34) {
      const th = r.pick(THEMES);
      o.theme = th.key; o.themeName = th.name; o.template = r.pick(th.tpl);
      for (const k in th.s) o[k] = r.range(th.s[k][0], th.s[k][1]);
    }
    for (const k of SLIDERS) o[k] = Math.round(o[k] * 100) / 100;
    return o;
  }
  // Vollständig gewürfelte Einstellungen, deterministisch aus seed; mindestens 4 Startplätze.
  // base (optional) gibt Werte vor, die nicht gewürfelt werden (z. B. size).
  function randomOpts(seed, base) {
    const si = seedToInt(seed == null ? 0 : seed);
    let o = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      o = Object.assign(randomPick(si, attempt), base && base.size ? { size: base.size } : null);
      const w = generate(o);
      if (w.startSpots.length >= 4) break;
    }
    return o;
  }
  function resolveTemplate(key, seed) {
    if (key !== 'random') return key;
    return randomPick(seed, 0).template; // gleiche Logik wie „Alles würfeln“
  }

  // ---------------------------------------------------------------- Vorlagen
  function mkBlob(r, x, y, rx, ry) { const d = randDir(r); return { x, y, rx, ry, c: d[0], s: d[1] }; }
  function blob(x, y, b) {
    const dx = x - b.x, dy = y - b.y;
    const u = (dx * b.c + dy * b.s) / b.rx, v = (dy * b.c - dx * b.s) / b.ry;
    return 1 - Math.sqrt(u * u + v * v);
  }
  function maxBlobs(x, y, list) {
    let m = -9;
    for (let k = 0; k < list.length; k++) { const v = blob(x, y, list[k]) * (list[k].w || 1); if (v > m) m = v; }
    return m;
  }
  // Meerenge zwischen den zwei nächsten Zentren: 1 auf der Mittelsenkrechten, 0 ab Abstand w.
  function straitAt(x, y, list, n, w) {
    let a = -1, b = -1, da = 1e9, db = 1e9;
    for (let k = 0; k < n; k++) {
      const dx = x - list[k].x, dy = y - list[k].y, d = dx * dx + dy * dy;
      if (d < da) { db = da; b = a; da = d; a = k; } else if (d < db) { db = d; b = k; }
    }
    if (b < 0) return 0;
    const ex = list[b].x - list[a].x, ey = list[b].y - list[a].y, L = Math.sqrt(ex * ex + ey * ey);
    const g = 1 - (db - da) / (2 * L) / w;
    return g > 0 ? g : 0;
  }
  function placeSpread(r, n, x0, x1, y0, y1, minD) {
    const pts = [];
    for (let tries = 0; pts.length < n && tries < 400; tries++) {
      const d = minD * (1 - tries / 500);
      const x = r.range(x0, x1), y = r.range(y0, y1);
      if (pts.every(p => (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y) >= d * d)) pts.push([x, y]);
    }
    return pts;
  }

  // Kapsel (Strecke mit von r0 nach r1 verjüngtem Radius): 1 auf der Achse, 0 am Rand, darunter negativ.
  function capsule(x, y, c) {
    const ex = c.x1 - c.x0, ey = c.y1 - c.y0, L2 = ex * ex + ey * ey || 1e-9;
    let t = ((x - c.x0) * ex + (y - c.y0) * ey) / L2; if (t < 0) t = 0; else if (t > 1) t = 1;
    const dx = x - c.x0 - ex * t, dy = y - c.y0 - ey * t;
    return 1 - Math.sqrt(dx * dx + dy * dy) / (c.r0 + (c.r1 - c.r0) * t);
  }
  // Gebogener Arm aus mehreren Kapseln (Halbinsel, Fjord, Riss).
  function arm(r, x, y, dirX, dirY, len, r0, r1, bend, out) {
    const n = 3;
    let px = x, py = y, dx = dirX, dy = dirY;
    for (let k = 0; k < n; k++) {
      const a = r.range(-bend, bend); // seitliches Abknicken (ohne Winkelfunktionen)
      let nx = dx - a * dy, ny = dy + a * dx; const l = Math.sqrt(nx * nx + ny * ny); nx /= l; ny /= l; dx = nx; dy = ny;
      const sl = len / n, qx = px + dx * sl, qy = py + dy * sl;
      out.push({ x0: px, y0: py, x1: qx, y1: qy, r0: r0 + (r1 - r0) * k / n, r1: r0 + (r1 - r0) * (k + 1) / n });
      px = qx; py = qy;
    }
  }
  // Gelappte Landmasse: Kern, Lappen, Halbinseln, Buchten, vorgelagerte Inseln.
  function lobedMass(r, S, cx, cy, R, o) {
    o = o || {}; R *= o.ls || 1;
    const asp = r.range(0.75, 1.35);
    S.pos.push(mkBlob(r, cx, cy, R * Math.sqrt(asp) * 0.85, R / Math.sqrt(asp) * 0.62));
    const nl = (o.lobes || 3) + r.int(3);
    for (let k = 0; k < nl; k++) {
      const d = randDir(r), dist = R * r.range(0.4, 0.75), s = R * r.range(0.28, 0.5);
      S.pos.push(Object.assign(mkBlob(r, cx + d[0] * dist, cy + d[1] * dist * 0.62, s * r.range(1, 1.5), s * r.range(0.55, 0.9)), { w: r.range(0.85, 1) }));
    }
    const np = (o.pen || 1) + r.int(3);
    for (let k = 0; k < np; k++) {
      const d = randDir(r), st = R * r.range(0.55, 0.8);
      arm(r, cx + d[0] * st, cy + d[1] * st * 0.62, d[0], d[1] * 0.7, R * r.range(0.5, 1.0), R * r.range(0.12, 0.18), R * r.range(0.03, 0.06), 0.5, S.cap);
    }
    const nb = (o.bays || 1) + r.int(3);
    for (let k = 0; k < nb; k++) {
      const d = randDir(r), dist = R * r.range(0.7, 1.0), s = R * r.range(0.18, 0.36);
      S.neg.push(Object.assign(mkBlob(r, cx + d[0] * dist, cy + d[1] * dist * 0.62, s * r.range(1, 1.8), s), { k: r.range(1.5, 2.5) }));
    }
    const ni = o.isl === undefined ? r.int(4) : o.isl;
    for (let k = 0; k < ni; k++) {
      const d = randDir(r), dist = R * r.range(1.1, 1.5), s = R * r.range(0.07, 0.15);
      S.pos.push(Object.assign(mkBlob(r, cx + d[0] * dist, cy + d[1] * dist * 0.62, s * r.range(1, 1.8), s), { w: 0.9 }));
    }
  }
  function shapeMask(S) {
    return (x, y) => {
      let m = -9;
      for (let k = 0; k < S.pos.length; k++) { const v = blob(x, y, S.pos[k]) * (S.pos[k].w || 1); if (v > m) m = v; }
      for (let k = 0; k < S.cap.length; k++) { const v = capsule(x, y, S.cap[k]) * 0.85; if (v > m) m = v; }
      for (let k = 0; k < S.neg.length; k++) { const b = blob(x, y, S.neg[k]); if (b > 0) m -= b * S.neg[k].k; }
      for (let k = 0; k < S.cut.length; k++) { const c = capsule(x, y, S.cut[k]); if (c > 0) m -= (0.6 + c) * 2.5; }
      if (S.extra) m = S.extra(x, y, m);
      return m < -1.5 ? -1.5 : m;
    };
  }

  // Jede Vorlage liefert eine Maske (positiv = Land wahrscheinlich) und ihren Landanteil-Bereich.
  function makeTemplate(key, r, A, land) {
    const LS = 0.84 + 0.32 * land; // Formen wachsen mit dem Landregler mit, statt nur das Rauschen aufzufüllen
    const P = { lo: 0.25, hi: 0.55, mw: 1, nw: 0.5, freq: 1, mirror: false, mtnCenter: null };
    const S = { pos: [], neg: [], cap: [], cut: [], extra: null };
    const nz = new Noise(r.int(2147483647));
    if (key === 'continents') {
      // verschieden große Landmassen, Gruppe aus der Mitte gerückt → Meere unterschiedlich breit
      const K = 2 + r.int(4);
      const big = r.range(0.16, 0.32);
      const sizes = [big, big * r.range(0.35, 0.95), r.range(0.07, 0.16), r.range(0.06, 0.12), r.range(0.05, 0.1)].slice(0, K);
      const gx = A * 0.5 + r.range(-0.12, 0.12) * A, gy = 0.5 + r.range(-0.06, 0.06);
      const placed = [];
      for (let k = 0; k < K; k++) {
        const R = sizes[k];
        for (let t = 0; t < 600; t++) {
          const x = k === 0 ? gx + r.range(-0.2, 0.2) * A : r.range(R + 0.04, A - R - 0.04), y = r.range(0.15 + R * 0.5, 0.85 - R * 0.5);
          const gap = r.range(0.02, 0.14) * (1 - t / 700);
          if (placed.every(p => { const dx = p[0] - x, dy = (p[1] - y) * 1.2; const need = (p[2] + R) * 1.45 + gap; return dx * dx + dy * dy >= need * need; })) { placed.push([x, y, R]); break; }
        }
      }
      for (const p of placed) lobedMass(r, S, p[0], p[1], p[2], { ls: LS, lobes: 2, pen: 1, bays: 1, isl: r.int(3) });
      P.lo = 0.18; P.hi = 0.44; P.nw = 0.45;
    } else if (key === 'pangaea') {
      // riesige zerlappte Masse mit Binnenmeer
      const cx = A * r.range(0.38, 0.62), cy = r.range(0.45, 0.55), R = r.range(0.3, 0.4);
      lobedMass(r, S, cx, cy, R, { ls: LS, lobes: 4, pen: 2, bays: 3, isl: 1 + r.int(3) });
      const d = randDir(r);
      const sea = mkBlob(r, cx + d[0] * 0.06, cy + d[1] * 0.05, r.range(0.12, 0.17), r.range(0.07, 0.1));
      S.neg.push(Object.assign(sea, { k: 3.5 }));
      if (r.next() < 0.6) { const e = randDir(r); arm(r, sea.x, sea.y, e[0], e[1], 0.42, 0.025, 0.035, 0.4, S.cut); }
      P.lo = 0.22; P.hi = 0.48; P.nw = 0.4;
    } else if (key === 'archipelago') {
      const list = [];
      const chains = 2 + r.int(8), isz = r.range(0.7, 1.5);
      for (let c = 0; c < chains; c++) {
        let x = r.range(A * 0.15, A * 0.85), y = r.range(0.2, 0.8);
        const d = randDir(r), n = 3 + r.int(4);
        for (let k = 0; k < n; k++) {
          const rr = r.range(0.03, 0.075) * (k === 0 ? 1.4 : 1) * isz;
          list.push(mkBlob(r, x, y, rr * r.range(1, 1.7), rr));
          x += d[0] * r.range(0.07, 0.11) + r.range(-0.03, 0.03);
          y += d[1] * r.range(0.07, 0.11) + r.range(-0.03, 0.03);
        }
      }
      const scat = 3 + r.int(14);
      for (let k = 0; k < scat; k++) { const rr = r.range(0.03, 0.1); list.push(mkBlob(r, r.range(0.1, A - 0.1), r.range(0.12, 0.88), rr * r.range(1, 1.6), rr)); }
      S.pos = list;
      P.lo = 0.1; P.hi = 0.34; P.nw = 0.45; P.mw = 1.1; P.freq = 1.5;
    } else if (key === 'twins') {
      // zwei ähnliche Massen, dazwischen ein geschwungener, unterschiedlich breiter Meeresarm
      const yo = r.range(-0.06, 0.06), R = r.range(0.27, 0.32);
      const rs = r.int(2147483647);
      lobedMass(new Rng(rs), S, A * 0.27, 0.5 + yo, R, { ls: LS, lobes: 3, pen: 2, bays: 2, isl: 1 });
      // Zwilling: gleiche Würfe, um den Kartenmittelpunkt gedreht, leicht verwackelt
      const S2 = { pos: [], neg: [], cap: [], cut: [] };
      lobedMass(new Rng(rs), S2, A * 0.27, 0.5 + yo, R, { ls: LS, lobes: 3, pen: 2, bays: 2, isl: 1 });
      for (const b of S2.pos) S.pos.push(Object.assign({}, b, { x: A - b.x + r.range(-0.02, 0.02), y: 1 - b.y + r.range(-0.02, 0.02), rx: b.rx * r.range(0.85, 1.15) }));
      for (const b of S2.neg) S.neg.push(Object.assign({}, b, { x: A - b.x, y: 1 - b.y }));
      for (const c of S2.cap) S.cap.push({ x0: A - c.x0, y0: 1 - c.y0, x1: A - c.x1, y1: 1 - c.y1, r0: c.r0, r1: c.r1 });
      const amp = r.range(0.05, 0.1), ph = r.range(0, 50);
      S.extra = (x, y, m) => {
        const cxl = A * 0.5 + amp * nz.fbm(y * 2.2 + ph, 3.3, 2, 0.5) * 2;
        const w = 0.03 + 0.045 * (0.5 + nz.fbm(y * 3.1 + ph, 7.7, 2, 0.5));
        const g = 1 - Math.abs(x - cxl) / w;
        return g > 0 ? m - g * 2.2 - 0.3 : m;
      };
      P.lo = 0.22; P.hi = 0.48; P.nw = 0.4;
    } else if (key === 'ringsea') {
      const cx = A * 0.5 + r.range(-0.06, 0.06), cy = 0.5 + r.range(-0.04, 0.04);
      const r0 = r.range(0.56, 0.64), w = r.range(0.15, 0.22);
      const gaps = []; const ng = 1 + r.int(2);
      for (let k = 0; k < ng; k++) gaps.push(randDir(r));
      const isl = [];
      if (r.next() < 0.8) isl.push(mkBlob(r, cx + r.range(-0.04, 0.04), cy + r.range(-0.03, 0.03), r.range(0.06, 0.1), r.range(0.05, 0.08)));
      const ni = 2 + r.int(3);
      for (let k = 0; k < ni; k++) { const d = randDir(r); isl.push(Object.assign(mkBlob(r, cx + d[0] * A * 0.16, cy + d[1] * 0.16, 0.035, 0.03), { w: 0.85 })); }
      const ph = r.range(0, 50);
      S.extra = (x, y) => {
        const dx = (x - cx) / (A * 0.5), dy = (y - cy) / 0.5, d = Math.sqrt(dx * dx + dy * dy);
        const ww = w * (0.7 + 0.6 * (0.5 + nz.fbm(dx * 2 + ph, dy * 2, 2, 0.5))); // Ring verschieden breit
        let m = 1 - Math.abs(d - r0) / ww;
        if (d > 0.001) for (let k = 0; k < gaps.length; k++) {
          const cs = (dx * gaps[k][0] + dy * gaps[k][1]) / d;
          if (cs > 0.975) m -= (cs - 0.975) / 0.025 * 1.6;
        }
        if (isl.length) m = Math.max(m, maxBlobs(x, y, isl));
        return m;
      };
      P.lo = 0.22; P.hi = 0.48; P.mw = 1.1; P.nw = 0.45;
    } else if (key === 'lakeland') {
      const cx = A * r.range(0.4, 0.6), cy = r.range(0.46, 0.54);
      lobedMass(r, S, cx, cy, 0.34, { ls: LS, lobes: 5, pen: 2, bays: 2, isl: r.int(3) });
      const holes = [];
      const nh = 5 + r.int(16);
      for (let t = 0; holes.length < nh && t < 300; t++) {
        const x = cx + r.range(-0.3, 0.3) * A, y = cy + r.range(-0.28, 0.28);
        if (holes.some(h => (h.x - x) * (h.x - x) + (h.y - y) * (h.y - y) < 0.022)) continue;
        const rr = r.range(0.03, 0.065);
        holes.push(mkBlob(r, x, y, rr * r.range(1, 2.2), rr));
      }
      S.extra = (x, y, m) => {
        if (m < 0.15) return m;
        for (let k = 0; k < holes.length; k++) { const b = blob(x, y, holes[k]); if (b > 0) m -= 1.6 + b * 4; }
        return m;
      };
      P.lo = 0.26; P.hi = 0.5; P.mw = 1.2; P.nw = 0.4;
    } else if (key === 'coast') {
      // Festland füllt eine ganze Kartenseite; zerklüftete Küste mit Halbinseln, davor Inseln
      const side = r.pick(['W', 'E']);
      const pos = r.range(0.38, 0.48), sg = side === 'W' ? 1 : -1;
      const tx = t => side === 'W' ? t * A : (1 - t) * A;
      for (let k = 0, np = 2 + r.int(3); k < np; k++) {
        const y = r.range(0.15, 0.85);
        arm(r, tx(pos - 0.05), y, sg, r.range(-0.5, 0.5), r.range(0.15, 0.32) * A, r.range(0.04, 0.07), r.range(0.015, 0.03), 0.6, S.cap);
      }
      for (let k = 0, nb = 1 + r.int(3); k < nb; k++) {
        const s = r.range(0.07, 0.13);
        S.neg.push(Object.assign(mkBlob(r, tx(pos + r.range(-0.08, 0.02)), r.range(0.15, 0.85), s * r.range(1, 1.8), s), { k: r.range(1.6, 2.4) }));
      }
      for (let k = 0, ni = 4 + r.int(5); k < ni; k++) {
        const rr = r.range(0.03, 0.075);
        S.pos.push(Object.assign(mkBlob(r, tx(r.range(pos + 0.12, 0.88)), r.range(0.12, 0.88), rr * r.range(1, 1.8), rr), { w: 0.9 }));
      }
      const ph = r.range(0, 50);
      S.extra = (x, y, m) => {
        const t = side === 'W' ? x / A : 1 - x / A;
        const p = pos + 0.08 * nz.fbm(y * 2.5 + ph, 1.7, 3, 0.5);
        return Math.max(m, Math.min((p - t) * 3.5, 1.2));
      };
      P.open = side; P.lo = 0.27; P.hi = 0.52; P.nw = 0.45; P.mw = 1.2;
    } else if (key === 'shards') {
      // zersprungener Kontinent: lange Fjorde von der Küste, Risse quer hindurch
      const cx = A * r.range(0.42, 0.58), cy = r.range(0.47, 0.53), R = 0.32;
      lobedMass(r, S, cx, cy, R, { ls: LS, lobes: 3, pen: 1, bays: 0, isl: 2 + r.int(3) });
      for (let k = 0, nf = 6 + r.int(5); k < nf; k++) {
        const d = randDir(r), st = R * r.range(1.0, 1.25);
        arm(r, cx + d[0] * st * A * 0.9, cy + d[1] * st * 0.85, -d[0] + r.range(-0.4, 0.4), -d[1] + r.range(-0.4, 0.4), R * r.range(0.6, 1.1), r.range(0.022, 0.035), 0.006, 0.45, S.cut);
      }
      for (let k = 0, nc = 1 + r.int(2); k < nc; k++) {
        const d = randDir(r);
        arm(r, cx - d[0] * 0.75, cy - d[1] * 0.6, d[0], d[1] * 0.8, 1.5, 0.018, 0.028, 0.35, S.cut);
      }
      P.lo = 0.22; P.hi = 0.46; P.nw = 0.4; P.mw = 1.1;
    } else if (key === 'highlands') {
      // sternförmiges Hochland: rundes Zentralmassiv, strahlenförmige Rücken, schmaler Küstensaum
      const cx = A * r.range(0.45, 0.55), cy = r.range(0.46, 0.54);
      S.pos.push(mkBlob(r, cx, cy, 0.26, 0.24));
      const ns = 5 + r.int(3), a0 = r.next();
      const dirs = [];
      for (let k = 0; k < ns; k++) {
        // gleichmäßig verteilte Richtungen aus einer Tabelle (16er-Kreis), leicht verwackelt
        const idx = Math.floor((k + a0) / ns * 16 + r.range(-0.4, 0.4)) & 15;
        const dx = G16[idx * 2], dy = G16[idx * 2 + 1];
        dirs.push([dx, dy]);
        arm(r, cx + dx * 0.15, cy + dy * 0.15, dx, dy, r.range(0.3, 0.45), r.range(0.09, 0.12), r.range(0.03, 0.05), 0.35, S.cap);
      }
      for (let k = 0, ni = 2 + r.int(3); k < ni; k++) { const d = randDir(r); S.pos.push(Object.assign(mkBlob(r, cx + d[0] * 0.5, cy + d[1] * 0.42, r.range(0.03, 0.06), r.range(0.025, 0.04)), { w: 0.85 })); }
      P.mtnCenter = { x: cx, y: cy, rx: 0.2, ry: 0.19, spokes: dirs };
      P.lo = 0.22; P.hi = 0.46; P.nw = 0.4; P.mw = 1.2;
    }
    P.mask = S.extra && !S.pos.length && !S.cap.length ? (x, y) => { const m = S.extra(x, y, -9); return m < -1.5 ? -1.5 : m; } : shapeMask(S);
    return P;
  }

  // ---------------------------------------------------------------- Biomwahl
  // Klima → Biom (ohne Wald); t, m etwa 0..1.
  function classifyBiome(t, m) {
    if (t < 0.07) return TT.SNOWFIELD;
    if (t < 0.22) return TT.TUNDRA;
    if (t < 0.7) return TT.GRASS;
    if (m < 0.22 && t > 0.74) return TT.DESERT;
    if (m < 0.4) return TT.SAVANNA;
    return TT.GRASS;
  }

  // Hilfe für Kräfte „Land heben/senken": Höhe (0..255) → Geländetyp. climate optional { t, m } (0..1).
  function terrainFromHeight(h, climate) {
    if (h < SEA_LEVEL - 40) return TT.DEEP;
    if (h < SEA_LEVEL - 10) return TT.WATER;
    if (h < SEA_LEVEL) return TT.SHALLOW;
    if (h < SEA_LEVEL + 4) return TT.SAND;
    if (h >= 238) return TT.SNOW;
    if (h >= 205) return TT.MOUNTAIN;
    if (h >= 175) return TT.HILL;
    if (climate) return classifyBiome(climate.t, climate.m);
    return TT.GRASS;
  }

  // ---------------------------------------------------------------- Namen
  const NAME_A = ['Wusel', 'Krümel', 'Brummel', 'Schnuffel', 'Wackel', 'Puschel', 'Knödel', 'Mampf', 'Schnurr',
    'Plüsch', 'Zipfel', 'Bummel', 'Kuddel', 'Rumpel', 'Pimpel', 'Schlummer', 'Trödel', 'Klecks', 'Fussel',
    'Hoppel', 'Schmatz', 'Grummel', 'Murmel', 'Quengel', 'Wuschel', 'Klimper', 'Schnodder', 'Bröckel', 'Gackel', 'Nuschel'];
  const NAME_B = ['land', 'heim', 'au', 'tal', 'reich', 'mark', 'furt', 'ingen', 'hausen', 'stein', 'bach',
    'wald', 'ien', 'onien', 'stadt', 'hofen', 'ia', 'burg', 'see', 'gau'];
  const NAME_PRE = ['', '', '', 'Groß-', 'Neu-', 'Ober-', 'Klein-', 'Alt-', 'Unter-'];
  const NAME_POST = ['', '', '', ' am Meer', ' der Tausend Pfützen', ' hinterm Horizont', ' im Nebel',
    ' unter dem Kuchenmond', ' am Weltenrand', ' der Wackelzähne', ' auf Zehenspitzen', ' im Glück'];
  function makeName(seed, tpl) {
    const r = stream(seed, 'name');
    const core = r.pick(NAME_A) + r.pick(NAME_B);
    const pre = r.pick(NAME_PRE), post = r.pick(NAME_POST);
    if (tpl === 'archipelago' && r.next() < 0.6) return 'Die ' + core + 'er Inseln' + post;
    if (tpl === 'twins' && r.next() < 0.5) return 'Ober- und Unter-' + core;
    return pre + (pre ? core.toLowerCase().replace(/^./, c => c.toUpperCase()) : core) + post;
  }

  // ---------------------------------------------------------------- Generator
  function generate(opts) {
    const o = normalizeOpts(opts);
    const W = o.W, H = o.H, N = W * H, A = W / H;
    const seed = seedToInt(o.seed);
    const tplKey = resolveTemplate(o.template, seed);
    const P = makeTemplate(tplKey, stream(seed, 'tpl:' + tplKey), A, o.land);
    const areaScale = N / (144 * 96);

    const nWarp = new Noise(mix32(seed, 101)), nBase = new Noise(mix32(seed, 102));
    const nRidge = new Noise(mix32(seed, 103)), nMisc = new Noise(mix32(seed, 104));
    const nClim = new Noise(mix32(seed, 105)), nVeg = new Noise(mix32(seed, 106));

    const rs = stream(seed, 'shape');
    const warp = rs.range(0.15, 0.4);
    const sizeF = Math.sqrt(Math.sqrt(H / 96));
    const F = rs.range(1.8, 3.3) * P.freq * sizeF;
    P.nw *= rs.range(0.7, 1.4); P.mw *= rs.range(0.85, 1.2); // jede Welt etwas anders gewichtet
    const oct = H > 120 ? 6 : 5;

    // 1) Grundform: verzerrtes Rauschen + Vorlagenmaske − Randabfall
    const h0 = new Float32Array(N), QX = new Float32Array(N), QY = new Float32Array(N);
    // Die Vorlagenmaske bestimmt die große Form; das Rauschen nur Küstendetails. Der Rand drückt
    // nur in einem schmalen Saum (verrauscht), damit man den Kartenrahmen der Form nicht ansieht.
    const MW = 1.0, NW = 0.75, DW = 0.16;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, ax = (x + 0.5) / H, ay = (y + 0.5) / H;
      let qx = ax + warp * nWarp.fbm(ax * 1.5, ay * 1.5, 3, 0.5);
      let qy = ay + warp * nWarp.fbm(ax * 1.5 + 57.3, ay * 1.5 + 21.1, 3, 0.5);
      qx += 0.03 * nWarp.n2(ax * 5 + 13.1, ay * 5); qy += 0.03 * nWarp.n2(ax * 5, ay * 5 + 71.3);
      const n = nBase.fbm(qx * F, qy * F, oct, 0.58);
      const m = P.mask(qx, qy);
      let dx0 = x + 0.5, dx1 = W - x - 0.5;
      if (P.open === 'W') dx0 = 9 * H; else if (P.open === 'E') dx1 = 9 * H; // offene Seite: Land bis an den Rand
      const e = Math.min(dx0, dx1, y + 0.5, H - y - 0.5) / H + 0.025 * nWarp.fbm(ax * 4 + 9, ay * 4, 2, 0.5);
      const edgeW = 0.1;
      let pen = 0; if (e < edgeW) { const t = (edgeW - e) / edgeW; pen = t * t * 3; }
      const det = nMisc.fbm(qx * F * 3.1 + 77, qy * F * 3.1, 2, 0.55);
      h0[i] = m * P.mw * MW + n * P.nw * NW + det * DW - pen;
      QX[i] = qx; QY[i] = qy;
    }

    // 2) Meeresspiegel über Quantil → Landanteil folgt dem Regler genau
    const landFrac = P.lo + (P.hi - P.lo) * o.land;
    const th = quantile(h0, null, 1 - landFrac);
    let land = new Uint8Array(N);
    for (let i = 0; i < N; i++) land[i] = h0[i] > th ? 1 : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) land[y * W + x] = 0;
    }
    cleanLand(land, W, H, h0, 6);

    // 3) Vulkaninseln (Magie)
    const volcanoes = [];
    {
      const rv = stream(seed, 'volcano');
      const dLand0 = distField(land, W, H);
      const want = o.magic * 1.5 * areaScale;
      const n = Math.floor(want + rv.next() * (o.magic > 0 ? 1 : 0) * 0.999);
      for (let k = 0; k < n; k++) {
        for (let t = 0; t < 80; t++) {
          const x = Math.round(W * 0.12) + rv.int(Math.round(W * 0.76)), y = Math.round(H * 0.14) + rv.int(Math.round(H * 0.72)), i = y * W + x;
          if (land[i] || dLand0[i] < 6 || dLand0[i] > 22) continue; // vor der Küste, nicht mitten im Nichts
          if (volcanoes.some(v => (v.x - x) * (v.x - x) + (v.y - y) * (v.y - y) < 400)) continue;
          const rad = rv.range(2.3, 3.4) * Math.sqrt(Math.sqrt(areaScale));
          volcanoes.push({ x, y, r: rad });
          const R = Math.ceil(rad + 1);
          for (let yy = y - R; yy <= y + R; yy++) for (let xx = x - R; xx <= x + R; xx++) {
            const dx = xx - x, dy = yy - y, d = Math.sqrt(dx * dx + dy * dy);
            if (d <= rad + 0.7 * nMisc.n2(xx * 0.7 + 9, yy * 0.7)) land[yy * W + xx] = 1;
          }
          break;
        }
      }
    }

    // 4) Ozean vs. Seen, Abstandsfelder
    const notLand = new Uint8Array(N); for (let i = 0; i < N; i++) notLand[i] = land[i] ? 0 : 1;
    const ocean = floodOcean(land, W, H);
    const lake = new Uint8Array(N); for (let i = 0; i < N; i++) lake[i] = (!land[i] && !ocean[i]) ? 1 : 0;
    let dWater = distField(notLand, W, H);
    const dLand = distField(land, W, H);

    // 5) Relief: Plattengrenzen + Kammrauschen → Gebirgszüge
    const rp = stream(seed, 'plates');
    const K = 4 + rp.int(14); // Zahl der Platten → Zahl und Richtung der Gebirgszüge
    const sx = new Float64Array(K), sy = new Float64Array(K), vx = new Float64Array(K), vy = new Float64Array(K);
    for (let k = 0; k < K; k++) {
      sx[k] = rp.range(-0.1, A + 0.1); sy[k] = rp.range(-0.1, 1.1);
      const d = randDir(rp), sp = rp.range(0.2, 1); vx[k] = d[0] * sp; vy[k] = d[1] * sp;
    }
    const pw = rp.range(0.035, 0.075), massW = rp.range(0.2, 0.9), mVar = rp.range(0.7, 1.4);
    const R = new Float32Array(N), base = new Float32Array(N);
    const mc = P.mtnCenter;
    for (let i = 0; i < N; i++) {
      if (!land[i]) continue;
      const qx = QX[i], qy = QY[i];
      const px = qx + 0.08 * nRidge.fbm(qx * 2.5 + 100, qy * 2.5, 2, 0.5);
      const py = qy + 0.08 * nRidge.fbm(qx * 2.5, qy * 2.5 + 100, 2, 0.5);
      let i1 = 0, i2 = 1, d1 = 1e9, d2 = 1e9;
      for (let k = 0; k < K; k++) {
        const dx = px - sx[k], dy = py - sy[k], d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; i2 = i1; d1 = d; i1 = k; } else if (d < d2) { d2 = d; i2 = k; }
      }
      const ex = sx[i2] - sx[i1], ey = sy[i2] - sy[i1], L = Math.sqrt(ex * ex + ey * ey) + 1e-9;
      const dB = (d2 - d1) / (2 * L);
      const conv = ((vx[i1] - vx[i2]) * ex + (vy[i1] - vy[i2]) * ey) / L;
      let strength = 0;
      const pm = 1 - dB / pw;
      if (pm > 0) strength = smooth01(pm) * clamp01(0.3 + conv * 0.7);
      const rn = nRidge.ridged(px * 4.2, py * 4.2, 3);
      const massif = clamp01(nMisc.fbm(qx * 1.2 + 300, qy * 1.2, 2, 0.5) * 2.2 - 0.15);
      let mtn = strength * (0.45 + 0.7 * rn) + massW * massif * rn * rn;
      if (mc) {
        const dx = (px - mc.x) / mc.rx, dy = (py - mc.y) / mc.ry, d = Math.sqrt(dx * dx + dy * dy);
        const c = 1 - d; if (c > 0) mtn += smooth01(c * 1.6) * (0.3 + 0.9 * rn);
        // strahlenförmige Rücken vom Massiv nach außen (Täler dazwischen sammeln die Flüsse)
        if (mc.spokes) for (const sp of mc.spokes) {
          const ox = px - mc.x, oy = py - mc.y, along = ox * sp[0] + oy * sp[1];
          if (along < 0.05 || along > 0.4) continue;
          const side = Math.abs(ox * sp[1] - oy * sp[0]);
          const k = 1 - side / 0.035; if (k > 0) mtn += k * (1 - along / 0.45) * (0.4 + 0.6 * rn);
        }
      }
      const dc = dWater[i];
      const b = dc / (dc + 0.07 * H);
      const cf = 0.3 + 0.7 * Math.min(1, dc / 4);
      base[i] = b;
      R[i] = mtn * cf + 0.12 * b + 0.05 * nMisc.fbm(qx * 8, qy * 8, 2, 0.5);
    }
    const sM = o.mountains;
    const hb = P.mtnCenter ? 1.7 : 1;
    const mFrac = (0.004 + 0.07 * sM + 0.11 * sM * sM) * hb * mVar;
    const hFrac = (0.03 + 0.11 * sM) * (P.mtnCenter ? 1.3 : 1);
    const thM = quantile(R, land, 1 - mFrac);
    const thH = quantile(R, land, 1 - mFrac - hFrac);
    let rMax = 0; for (let i = 0; i < N; i++) if (land[i] && R[i] > rMax) rMax = R[i];
    const relief = new Uint8Array(N); // 0 Tiefland, 1 Hügel, 2 Gebirge
    for (let i = 0; i < N; i++) {
      if (!land[i]) continue;
      if (R[i] >= thM) relief[i] = 2;
      else if (R[i] >= thH) relief[i] = 1;
      else if (dWater[i] >= 2 && nMisc.fbm(QX[i] * 4.5 + 500, QY[i] * 4.5, 2, 0.5) > 0.4) relief[i] = 1; // Hügelinseln (Stein überall)
    }
    shapeRelief(relief, land, W, H, nMisc, sM, areaScale);
    const E = new Float32Array(N);
    for (let i = 0; i < N; i++) if (land[i]) E[i] = 0.3 * base[i] + R[i] + 0.09 * (nMisc.fbm(QX[i] * 4 + 800, QY[i] * 4, 3, 0.5) + 0.5);

    // 6) Entwässerung: Priority-Flood vom Ozean aus (4er-Nachbarschaft → Flüsse 4-zusammenhängend)
    const Ed = new Float32Array(N);
    for (let i = 0; i < N; i++) Ed[i] = land[i] ? E[i] + 0.012 * nMisc.n2(QX[i] * 14, QY[i] * 14) + 0.06 * nMisc.fbm(QX[i] * 3.2 + 2000, QY[i] * 3.2, 3, 0.5) : (lake[i] ? -0.01 : 0);
    const flatCost = new Float32Array(N);
    for (let i = 0; i < N; i++) { if (ocean[i]) continue; const v = 0.5 + 0.5 * nMisc.n2(QX[i] * 9 + 1200, QY[i] * 9); flatCost[i] = 2e-5 + 4e-4 * v * v; }
    const Fill = new Float32Array(N), parent = new Int32Array(N).fill(-1), dl = new Int32Array(N);
    const order = new Int32Array(N); let orderN = 0;
    {
      const heap = new Heap(N), seen = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (ocean[i]) { seen[i] = 1; Fill[i] = -1; }
      for (let i = 0; i < N; i++) {
        if (!ocean[i]) continue;
        const x = i % W, y = (i - x) / W;
        if ((x > 0 && !ocean[i - 1]) || (x < W - 1 && !ocean[i + 1]) || (y > 0 && !ocean[i - W]) || (y < H - 1 && !ocean[i + W])) heap.push(-1, i);
      }
      while (heap.n) {
        const c = heap.pop(); order[orderN++] = c;
        const x = c % W, y = (c - x) / W, fc = Fill[c];
        for (let k = 0; k < 4; k++) {
          let nb;
          if (k === 0) { if (x === 0) continue; nb = c - 1; } else if (k === 1) { if (x === W - 1) continue; nb = c + 1; }
          else if (k === 2) { if (y === 0) continue; nb = c - W; } else { if (y === H - 1) continue; nb = c + W; }
          if (seen[nb]) continue;
          seen[nb] = 1;
          const eps = flatCost[nb];
          const f = Ed[nb] > fc + eps ? Ed[nb] : fc + eps;
          Fill[nb] = f; parent[nb] = c; dl[nb] = ocean[c] ? 1 : dl[c] + 1;
          heap.push(f, nb);
        }
      }
    }
    // Abfluss: steilster Abstieg über 8 Nachbarn (folgt der echten Hangrichtung) auf einem leicht
    // verrauschten Feld; nur echt tiefere Nachbarn → kreisfrei. Diagonalen werden beim Nachzeichnen
    // durch eine Zwischenkachel 4-zusammenhängend gemacht.
    {
      const G = new Float32Array(N);
      for (let i = 0; i < N; i++) G[i] = ocean[i] ? -1 : Fill[i] + 0.02 * nMisc.n2(QX[i] * 10 + 1500, QY[i] * 10);
      for (let k = 0; k < orderN; k++) {
        const c = order[k]; if (ocean[c]) continue;
        const x = c % W, y = (c - x) / W, fc = Fill[c];
        let best = parent[c], bv = 0, sea = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const nb = yy * W + xx;
          if (ocean[nb]) { if (!dx || !dy) { if (!sea) { sea = true; best = nb; } } continue; }
          if (sea || Fill[nb] >= fc) continue;
          const v = (G[c] - G[nb]) * (dx && dy ? 0.7071 : 1);
          if (v > bv) { bv = v; best = nb; }
        }
        parent[c] = best;
        dl[c] = ocean[best] ? 1 : dl[best] + 1;
      }
    }
    // Senken → Seen
    {
      const cand = new Uint8Array(N);
      const lakeTh = (0.012 - 0.006 * o.rivers) * stream(seed, 'lakes').range(0.5, 2.2); // mal seenreich, mal kaum Seen
      for (let i = 0; i < N; i++) if (land[i] && relief[i] < 2 && Fill[i] - Ed[i] > lakeTh) cand[i] = 1;
      let cc = components(cand, W, H);
      // zu große Senken nur im tiefsten Teil fluten
      const maxLake = Math.round(40 * areaScale);
      const per = cc.sizes.map(() => []);
      for (let i = 0; i < N; i++) if (cand[i] && cc.sizes[cc.lab[i]] > maxLake) per[cc.lab[i]].push(Fill[i] - Ed[i]);
      const cut = per.map(a => { if (!a.length) return -1; a.sort((p, q) => q - p); return a[maxLake - 1]; });
      for (let i = 0; i < N; i++) if (cand[i] && cut[cc.lab[i]] >= 0 && Fill[i] - Ed[i] < cut[cc.lab[i]]) cand[i] = 0;
      cc = components(cand, W, H);
      const minLake = Math.max(5, Math.round(6 * Math.sqrt(areaScale)));
      for (let i = 0; i < N; i++) if (cand[i] && cc.sizes[cc.lab[i]] >= minLake) { land[i] = 0; lake[i] = 1; relief[i] = 0; }
    }

    // 7) Flüsse: ein Wanderer folgt dem geglätteten Gefälle (mit Schwung und Mäandern) und
    //    wird auf Kacheln 4-zusammenhängend gerastert. Rückfall: Abflusskette der Flutung.
    const river = new Uint8Array(N);
    const riverH = new Float32Array(N);
    {
      const rr = stream(seed, 'rivers');
      const sR = o.rivers;
      const dOcean = distField(ocean, W, H);
      const Pot = new Float32Array(N);
      for (let i = 0; i < N; i++) Pot[i] = ocean[i] ? -0.06 : Fill[i] + 0.004 * dOcean[i] + (relief[i] === 2 ? 0.25 : 0); // Gebirge meiden
      const Ps = boxBlur(boxBlur(Pot, W, H, 2), W, H, 2);
      const samp = (x, y) => {
        x -= 0.5; y -= 0.5;
        if (x < 0) x = 0; if (y < 0) y = 0; if (x > W - 1.001) x = W - 1.001; if (y > H - 1.001) y = H - 1.001;
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * W + x0;
        const a = Ps[i] + (Ps[i + 1] - Ps[i]) * fx, b = Ps[i + W] + (Ps[i + W + 1] - Ps[i + W]) * fx;
        return a + (b - a) * fy;
      };
      const rid = new Int32Array(N).fill(-1);        // welcher Fluss liegt hier
      const own = new Int32Array(N).fill(-1);        // Index im aktuellen Lauf (mit Stempel)
      const stamp = new Int32Array(N).fill(-1);
      let landCount = 0; for (let i = 0; i < N; i++) if (land[i]) landCount++;
      const target = Math.round((0.9 * sR + 2.2 * sR * sR) * landCount / 600);
      const minLen = Math.round(6 + 5 * Math.sqrt(areaScale));
      const thE = quantile(E, land, 0.7);
      const dM = distField(relief.map(v => v === 2 ? 1 : 0), W, H);
      let dMax = 1; for (let i = 0; i < N; i++) if (land[i] && dOcean[i] > dMax) dMax = dOcean[i];
      const cand = [], keys = [];
      for (let i = 0; i < N; i++) {
        if (!land[i] || relief[i] === 2 || dOcean[i] < 5) continue;
        const nearM = dM[i] <= 2;
        if (!(nearM || relief[i] === 1 || E[i] > thE)) continue;
        cand.push(i);
        keys.push(dOcean[i] / dMax + 0.5 * rr.next() + (nearM ? 0.2 : 0));
      }
      const idx = cand.map((_, k) => k).sort((a, b) => keys[b] - keys[a] || a - b);

      const lakeLab = components(lake, W, H).lab;
      let skipLake = -2; // Abfluss: der eigene See zählt nicht als Mündung
      let path = [], status = 0, runDir = 0, runLen = 0, jogSide = 0, laneLock = 0, laneAxis = 0, laneSide = 0; // status: 1 = Mündung (Meer/See), 2 = Zusammenfluss
      let curId = 0;
      const nb4 = (c, k) => {
        const x = c % W;
        if (k === 0) return x > 0 ? c - 1 : -1; if (k === 1) return x < W - 1 ? c + 1 : -1;
        if (k === 2) return c >= W ? c - W : -1; return c < N - W ? c + W : -1;
      };
      const isOwn = t => stamp[t] === curId && own[t] >= 0;
      const truncate = j => { for (let k = j + 1; k < path.length; k++) own[path[k]] = -1; path.length = j + 1; };
      // Kachel betreten; liefert true, wenn der Lauf endet.
      function enter(t, ignoreLake) {
        if (ocean[t] || (lake[t] && lakeLab[t] !== skipLake)) { status = 1; return true; }
        if (lake[t]) return true; // eigener See (Abfluss): abbrechen
        if (river[t]) { status = 2; return true; }
        if (isOwn(t)) { truncate(own[t]); return false; }
        // Schleife abkürzen: berührt die neue Kachel eine ältere eigene Kachel?
        let jmin = -1;
        for (let k = 0; k < 4; k++) { const n = nb4(t, k); if (n >= 0 && isOwn(n) && own[n] < path.length - 1 && (jmin < 0 || own[n] < jmin)) jmin = own[n]; }
        if (jmin >= 0) truncate(jmin);
        stamp[t] = curId; own[t] = path.length; path.push(t);
        if (laneLock > 0) laneLock--;
        if (path.length >= 2) { const d = t - path[path.length - 2]; if (d === runDir) runLen++; else { runDir = d; runLen = 1; jogSide = 0; } }
        for (let k = 0; k < 4; k++) {
          const n = nb4(t, k); if (n < 0) continue;
          if (ocean[n] || (lake[n] && lakeLab[n] !== skipLake)) { status = 1; return true; }
          if (river[n]) { status = 2; return true; }
        }
        return false;
      }
      // Von der letzten Laufkachel bis t in 4er-Schritten gehen (Diagonalen über eine Zwischenkachel).
      function walkTo(t, ignoreLake, px, py, nx, ny) {
        const tx = t % W, ty = (t - tx) / W;
        for (let g = 0; g < 12; g++) {
          const c = path[path.length - 1]; if (c === t) return false;
          const cx = c % W, cy = (c - cx) / W, sx = tx > cx ? 1 : tx < cx ? -1 : 0, sy = ty > cy ? 1 : ty < cy ? -1 : 0;
          let nxt;
          if (sx && sy) {
            const m1 = c + sx, m2 = c + sy * W;
            if (px !== undefined && g === 0) {
              const bx = sx > 0 ? cx + 1 : cx, by = sy > 0 ? cy + 1 : cy;
              const ax = nx !== px ? (bx - px) / (nx - px) : 9, ay = ny !== py ? (by - py) / (ny - py) : 9;
              nxt = ax < ay ? m1 : m2;
            } else nxt = (ocean[m1] || river[m1] || Pot[m1] < Pot[m2]) ? m1 : m2;
          } else nxt = sx ? c + sx : c + sy * W;
          if (enter(nxt, ignoreLake)) return true;
        }
        return false;
      }
      function trace(src, phase, lakeStart) {
        path = []; status = 0; runDir = 0; runLen = 0; laneLock = 0;
        let cur = src;
        stamp[src] = curId; own[src] = 0; path.push(src);
        let px = src % W + 0.5, py = (src - src % W) / W + 0.5;
        let vx = -(samp(px + 0.5, py) - samp(px - 0.5, py)), vy = -(samp(px, py + 0.5) - samp(px, py - 0.5));
        let vl = Math.sqrt(vx * vx + vy * vy) || 1; vx /= vl; vy /= vl;
        let best = Pot[src], since = 0, mode = lakeStart ? 1 : 0, sLen = 0, lakeSteps = lakeStart ? 3 : 0, m1 = 0;
        for (let guard = 0; guard < 8 * (W + H) && !status; guard++) {
          if (mode === 0) {
            let gx = -(samp(px + 0.5, py) - samp(px - 0.5, py)), gy = -(samp(px, py + 0.5) - samp(px, py - 0.5));
            const gl = Math.sqrt(gx * gx + gy * gy);
            if (gl < 1e-9) { gx = vx; gy = vy; } else { gx /= gl; gy /= gl; }
            let m = 2.2 * nMisc.fbm(sLen * 0.085 + phase, phase * 0.37 + 0.5, 2, 0.45);
            let dx = gx - m * gy, dy = gy + m * gx;
            if (runLen >= 3) { // lange Geraden aufbrechen: quer zur Laufachse schieben, bergab bevorzugt
              const k = 0.9 * (runLen - 2);
              const horiz = runDir === 1 || runDir === -1, gp = horiz ? gy : gx;
              if (!jogSide) jogSide = gp > 0.15 ? 1 : gp < -0.15 ? -1 : (m >= 0 ? 1 : -1); // Seite bleibt fest
              const push = jogSide * k * Math.sqrt(dx * dx + dy * dy);
              if (horiz) dy += push; else dx += push;
            }
            const dl2 = Math.sqrt(dx * dx + dy * dy); dx /= dl2; dy /= dl2;
            vx = vx * 0.66 + dx * 0.34; vy = vy * 0.66 + dy * 0.34;
            // nach einem Spurwechsel nicht sofort zurückschwenken (das gäbe einen 2×2-Haken)
            if (laneLock > 0) { if (laneAxis === 0 && vx * laneSide < 0) vx = 0; else if (laneAxis === 1 && vy * laneSide < 0) vy = 0; }
            vl = Math.sqrt(vx * vx + vy * vy) || 1; vx /= vl; vy /= vl;
            let nx = px + vx * 0.4, ny = py + vy * 0.4; sLen += 0.4;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) break;
            const t = Math.floor(ny) * W + Math.floor(nx);
            const last = path[path.length - 1];
            if (t !== last) {
              const hadJog = jogSide, prevDir = runDir;
              if (walkTo(t, false, px, py, nx, ny)) break;
              const now = path[path.length - 1];
              // Spurwechsel festhalten: in die Mitte der neuen Spur rücken, sonst zieht das Gefälle zurück
              if (hadJog && path.length >= 2) {
                const sd = now - path[path.length - 2];
                if ((prevDir === 1 || prevDir === -1) && (sd === W || sd === -W)) { ny = Math.floor(ny) + 0.5; laneAxis = 1; laneSide = sd > 0 ? 1 : -1; laneLock = 5; }
                else if ((prevDir === W || prevDir === -W) && (sd === 1 || sd === -1)) { nx = Math.floor(nx) + 0.5; laneAxis = 0; laneSide = sd > 0 ? 1 : -1; laneLock = 5; }
              }
              if (Pot[now] < best - 1e-7) { best = Pot[now]; since = 0; } else if (++since > 30) mode = 1;
            }
            px = nx; py = ny;
          } else {
            // Rückfall: ein paar Kacheln der Abflusskette folgen (aus Mulden heraus), dann wieder frei
            const last = path[path.length - 1];
            let t = parent[last];
            if (t < 0) break;
            if (runLen >= 4 && t - last === runDir) { // auch hier keine langen Geraden: seitlich ausweichen
              const pp = (runDir === 1 || runDir === -1) ? W : 1, lx = last % W;
              let best = -1;
              for (const c of [last + pp, last - pp]) {
                if (c < 0 || c >= N || (pp === 1 && Math.abs(c % W - lx) !== 1)) continue;
                if (!land[c] || isOwn(c) || Pot[c] > Pot[last] + 0.01) continue;
                if (best < 0 || Pot[c] < Pot[best]) best = c;
              }
              if (best >= 0) t = best;
            }
            if (walkTo(t, lakeSteps > 0)) break;
            const now = path[path.length - 1];
            if (lakeSteps > 0) lakeSteps--;
            if (++m1 >= 6 && lakeSteps === 0) {
              mode = 0; m1 = 0; best = Pot[now]; since = 0;
              const pv = path.length >= 2 ? now - path[path.length - 2] : 0;
              vx = pv === 1 ? 1 : pv === -1 ? -1 : 0; vy = pv === W ? 1 : pv === -W ? -1 : 0;
              if (!vx && !vy) vx = 1;
            }
            px = now % W + 0.5; py = (now - now % W) / W + 0.5;
          }
        }
        return status;
      }
      function commit(id) {
        let h = 1e9;
        for (let k = 0; k < path.length; k++) {
          const t = path[k]; river[t] = 1; rid[t] = id;
          if (E[t] < h) h = E[t];
          riverH[t] = h; // Höhe fällt entlang des Laufs
        }
      }
      const srcs = [], srcD = 13 - 6 * sR;
      let made = 0;
      for (let q = 0; q < idx.length && made < target; q++) {
        const s = cand[idx[q]], sx0 = s % W, sy0 = (s - sx0) / W;
        if (river[s]) continue;
        let ok = true;
        for (let k = 0; k < srcs.length; k++) { const dx = srcs[k][0] - sx0, dy = srcs[k][1] - sy0; if (dx * dx + dy * dy < srcD * srcD) { ok = false; break; } }
        if (!ok || nearRiver(river, W, H, sx0, sy0, sR > 0.7 ? 2 : 3)) continue;
        curId++;
        const st = trace(s, rr.range(0, 200), false);
        if (!st) continue;
        if (path.length < (st === 2 ? Math.round(minLen * 0.6) : minLen)) continue;
        commit(curId); srcs.push([sx0, sy0]); made++;
      }
      // Seen mit Zufluss (oder große Seen) bekommen einen Abfluss
      if (made > 0) {
        const lc = components(lake, W, H);
        const fed = new Uint8Array(lc.sizes.length);
        for (let i = 0; i < N; i++) if (river[i]) for (let k = 0; k < 4; k++) { const n = nb4(i, k); if (n >= 0 && lake[n]) fed[lc.lab[n]] = 1; }
        const done = new Uint8Array(lc.sizes.length);
        for (let i = 0; i < N; i++) {
          if (!lake[i]) continue;
          const L = lc.lab[i]; if (done[L]) continue; done[L] = 1;
          if (!fed[L] && lc.sizes[L] < 40) continue;
          // Auslass: Uferkachel (4er-Nachbar des Sees) mit kleinstem Füllstand
          let c = -1;
          for (let j = 0; j < N; j++) {
            if (!land[j] || river[j] || ocean[j]) continue;
            let adj = false;
            for (let k = 0; k < 4; k++) { const n = nb4(j, k); if (n >= 0 && lake[n] && lc.lab[n] === L) adj = true; }
            if (adj && parent[j] >= 0 && !lake[parent[j]] && (c < 0 || Fill[j] < Fill[c])) c = j;
          }
          if (c < 0) continue;
          curId++; skipLake = L;
          const st = trace(c, rr.range(0, 200), true);
          skipLake = -2;
          if (st && path.length >= 3) commit(curId);
        }
      }
    }

    // 2×2-Flussblöcke (an Zusammenflüssen möglich) auflösen: eine Ecke ohne Außenanschluss weg
    for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
      const q = [y * W + x, y * W + x + 1, (y + 1) * W + x, (y + 1) * W + x + 1];
      if (!river[q[0]] || !river[q[1]] || !river[q[2]] || !river[q[3]]) continue;
      for (let k = 0; k < 4; k++) {
        const c = q[k], cx = c % W; let out = 0;
        for (const n of [cx > 0 ? c - 1 : -1, cx < W - 1 ? c + 1 : -1, c - W, c + W]) {
          if (n < 0 || n >= N || q.includes(n)) continue;
          if (river[n] || ocean[n] || lake[n]) out++;
        }
        if (out === 0) { river[c] = 0; break; }
        if (k === 3) river[q[3]] = 0; // Notlösung; ein abgehängter Rest fällt unten weg
      }
    }
    // Flussläufe ohne Mündung (Meer/See) entfernen
    {
      const rc = components(river, W, H), ok = new Uint8Array(rc.sizes.length);
      for (let i = 0; i < N; i++) {
        if (!river[i]) continue;
        const x = i % W;
        if ((x > 0 && (ocean[i - 1] || lake[i - 1])) || (x < W - 1 && (ocean[i + 1] || lake[i + 1])) ||
          (i >= W && (ocean[i - W] || lake[i - W])) || (i < N - W && (ocean[i + W] || lake[i + W]))) ok[rc.lab[i]] = 1;
      }
      for (let i = 0; i < N; i++) if (river[i] && !ok[rc.lab[i]]) river[i] = 0;
    }

    // 8) Klima
    const rc = stream(seed, 'climate');
    // Klimacharakter der Welt: Lage und Neigung des Wärmegürtels, Grundwärme, Grundfeuchte, Kontrast
    const cm = rc.next();
    let eqY, tilt;
    if (cm < 0.45) { eqY = 0.5 + rc.range(-0.1, 0.1); tilt = rc.range(-0.15, 0.15); }          // zwei Pole
    else if (cm < 0.72) { eqY = rc.next() < 0.5 ? rc.range(-0.05, 0.22) : rc.range(0.78, 1.05); tilt = rc.range(-0.2, 0.2); } // ein kalter Pol
    else { eqY = 0.5 + rc.range(-0.25, 0.25); tilt = rc.range(-0.55, 0.55); }                  // schräger Gürtel
    const latD = Math.max(eqY, 1 - eqY, 0.5);
    const warmB = (rc.next() + rc.next() - 1) * 0.16, wetB = (rc.next() + rc.next() - 1) * 0.2;
    const tCon = rc.range(0.75, 1.3), mCon = rc.range(0.75, 1.35);
    const eqAt = qx => eqY + tilt * (qx / A - 0.5);
    const Tm = new Float32Array(N), Mo = new Float32Array(N);
    const wet = new Uint8Array(N); for (let i = 0; i < N; i++) wet[i] = (!land[i] || river[i]) ? 1 : 0;
    const dWet = distField(wet, W, H);
    for (let i = 0; i < N; i++) if (lake[i]) land[i] = 0;
    for (let i = 0; i < N; i++) notLand[i] = land[i] ? 0 : 1;
    dWater = distField(notLand, W, H);
    // Regen: Luftfeuchte zieht mit dem Wind, regnet sich an Bergen ab (Regenschatten)
    const rainW = new Float32Array(N), rainE = new Float32Array(N);
    const decay = 2.7 / H;
    for (let y = 0; y < H; y++) {
      for (let pass = 0; pass < 2; pass++) {
        const out = pass === 0 ? rainW : rainE;
        let q = 1, pe = 0;
        for (let k = 0; k < W; k++) {
          const x = pass === 0 ? k : W - 1 - k, i = y * W + x;
          if (!land[i]) { q += (1 - q) * 0.3; pe = 0; out[i] = q; continue; }
          const e = E[i], rise = e > pe ? e - pe : 0; pe = e;
          q -= q * (decay + rise * 2.6); if (q < 0.03) q = 0.03;
          out[i] = q;
        }
      }
    }
    const rain = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      const lat = Math.abs((y + 0.5) / H - eqY) / latD;
      const wWest = smooth01((lat - 0.24) / 0.12) * (1 - smooth01((lat - 0.64) / 0.12));
      for (let x = 0; x < W; x++) { const i = y * W + x; rain[i] = wWest * rainW[i] + (1 - wWest) * rainE[i]; }
    }
    const rainB = boxBlur(boxBlur(rain, W, H, 2), W, H, 2);
    const tShift = (o.temperature - 0.5) * 0.9, mShift = (o.moisture - 0.5) * 0.95;
    const absT = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (!land[i]) continue;
      const qx = QX[i], qy = QY[i];
      let lat = Math.abs(qy - eqAt(qx)) / latD + 0.12 * nClim.fbm(qx * 1.8, qy * 1.8, 3, 0.5);
      if (lat < 0) lat = -lat;
      const alt = 0.45 * (E[i] > 0.12 ? E[i] - 0.12 : 0);
      Tm[i] = 1 - lat + 0.07 * nClim.fbm(qx * 4 + 50, qy * 4, 2, 0.5) - alt;
      absT[i] = 1.05 - 1.2 * lat - alt;
      const wp = 3 / (3 + dWet[i]);
      const mn = 0.5 + 0.8 * nClim.fbm(qx * 2.6 + 200, qy * 2.6, 3, 0.5);
      const la = Math.abs(qy - eqAt(qx)) / latD;
      let latAdj = 0;
      if (la < 0.12) latAdj += 0.06 * (1 - la / 0.12);
      const sd = 1 - Math.abs(la - 0.3) / 0.16; if (sd > 0) latAdj -= 0.07 * sd;
      Mo[i] = 0.34 * rainB[i] + 0.14 * wp + 0.52 * mn + latAdj;
    }
    // Teilweise Rang-Normierung (glatte Übergänge, nutzbare Spanne), dazu der Charakter der Welt:
    // Grundwärme, Grundfeuchte und Kontrast verschieben die Anteile je Welt; die Regler verschieben alles.
    const rawM = Mo.slice();
    rankNorm(Tm, land); rankNorm(Mo, land);
    for (let i = 0; i < N; i++) {
      if (!land[i]) continue;
      Tm[i] = (0.35 * Tm[i] + 0.65 * absT[i] - 0.5) * tCon + 0.5 + warmB + tShift;
      Mo[i] = (0.55 * Mo[i] + 0.45 * (rawM[i] - 0.05) - 0.5) * mCon + 0.5 + wetB + mShift;
    }
    // 9) Biome
    const ter = new Uint8Array(N);
    const forestable = new Uint8Array(N), fscore = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (!land[i]) continue;
      if (river[i]) { ter[i] = TT.RIVER; continue; }
      if (relief[i] === 2) { ter[i] = TT.MOUNTAIN; continue; }
      const qx = QX[i], qy = QY[i];
      const dith = 0.035 * nVeg.n2(qx * 11, qy * 11);
      const t = Tm[i] + dith, m = Mo[i] - dith * 0.8;
      if (relief[i] === 1) { ter[i] = TT.HILL; continue; }
      let b = classifyBiome(t, m);
      if (b !== TT.SNOWFIELD && b !== TT.DESERT && b !== TT.SAVANNA && !(b === TT.TUNDRA && m < 0.2)) forestable[i] = 1;
      // Sumpf: nass, tief, nahe Wasser
      if (t >= 0.3 && m > 0.78 && E[i] < 0.22 && dWet[i] <= 4 && nVeg.fbm(qx * 6 + 400, qy * 6, 2, 0.5) > 0.16 - (m - 0.78) * 1.2) { b = TT.SWAMP; forestable[i] = 0; }
      ter[i] = b;
      fscore[i] = 0.25 * m + 0.75 * (0.5 + 0.5 * nVeg.fbm(qx * 3.5 + 700, qy * 3.5, 3, 0.5)) + 0.06 * (3 / (3 + dWet[i]));
    }
    {
      const fFrac = 0.02 + 0.84 * o.forests;
      const thF = quantile(fscore, forestable, 1 - fFrac);
      for (let i = 0; i < N; i++) {
        if (!forestable[i] || fscore[i] < thF) continue;
        const t = Tm[i];
        ter[i] = t < 0.3 ? TT.TAIGA : (t >= 0.72 && Mo[i] >= 0.55) ? TT.JUNGLE : TT.FOREST;
      }
    }
    // Blumenwiesen als Flecken
    for (let i = 0; i < N; i++) {
      if (ter[i] !== TT.GRASS) continue;
      const t = Tm[i];
      if (t < 0.33 || t > 0.78) continue;
      if (nVeg.fbm(QX[i] * 6 + 900, QY[i] * 6, 3, 0.5) > 0.2) ter[i] = TT.FLOWERS;
    }
    // Schneegipfel: nur im Inneren des Gebirges (ringsum Gebirge), kompakt
    {
      const sc = new Uint8Array(N), mr = new Float32Array(N), mm = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (ter[i] === TT.MOUNTAIN) { mm[i] = 1; mr[i] = R[i]; }
      rankNorm(mr, mm);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; if (ter[i] !== TT.MOUNTAIN) continue;
        let inner = true;
        for (let yy = -1; yy <= 1 && inner; yy++) for (let xx = -1; xx <= 1; xx++) if (ter[i + yy * W + xx] !== TT.MOUNTAIN) { inner = false; break; }
        if (!inner) continue;
        if (mr[i] + (0.5 - Tm[i]) * 1.3 > 0.72) sc[i] = 1;
      }
      const cc = components(sc, W, H);
      for (let i = 0; i < N; i++) if (sc[i] && cc.sizes[cc.lab[i]] >= 3) ter[i] = TT.SNOW;
    }

    // 10) Aufräumen: Krümel weg
    modeFilter(ter, land, W, H, 2);

    // 11) Magie: zusammenhängende Flecken Pilzwald/Kristallfeld, Vulkane mit Asche
    const magicSpots = [];
    {
      const rm = stream(seed, 'mushroom');
      const nm = Math.floor(o.magic * 4.5 * areaScale + (o.magic > 0 ? rm.next() : 0));
      const ms = 0.6 + 0.8 * o.magic;
      growPatches(nm, rm, i => (ter[i] === TT.FOREST || ter[i] === TT.JUNGLE || ter[i] === TT.GRASS || ter[i] === TT.FLOWERS || ter[i] === TT.SWAMP) && Mo[i] > 0.45 && dWater[i] >= 2.5,
        TT.MUSHROOM, Math.round(30 * ms * Math.sqrt(areaScale)), Math.round(70 * ms * Math.sqrt(areaScale)));
      const rk = stream(seed, 'crystal');
      const nk = Math.floor(o.magic * 3.6 * areaScale + (o.magic > 0 ? rk.next() : 0));
      growPatches(nk, rk, i => (ter[i] === TT.HILL || ter[i] === TT.TUNDRA || ter[i] === TT.DESERT || ter[i] === TT.SNOWFIELD || ter[i] === TT.GRASS || ter[i] === TT.SAVANNA) && dWater[i] >= 2 && nearType(ter, W, H, i, TT.MOUNTAIN, 4),
        TT.CRYSTAL, Math.round(16 * ms * Math.sqrt(areaScale)), Math.round(38 * ms * Math.sqrt(areaScale)));
    }
    function growPatches(n, r, ok, id, minS, maxS) {
      const cands = [];
      for (let i = 0; i < N; i++) if (land[i] && ok(i)) cands.push(i);
      if (!cands.length) return;
      for (let k = 0; k < n; k++) {
        for (let t = 0; t < 40; t++) {
          const c = cands[r.int(cands.length)];
          if (!ok(c)) continue;
          const cx = c % W, cy = (c - cx) / W;
          if (magicSpots.some(s => (s[0] - cx) * (s[0] - cx) + (s[1] - cy) * (s[1] - cy) < 400)) continue;
          const size = minS + r.int(maxS - minS + 1);
          const heap = new Heap(size * 8 + 16), seenP = new Map();
          heap.push(0, c); seenP.set(c, 1);
          let got = 0;
          while (heap.n && got < size) {
            const i = heap.pop();
            ter[i] = id; got++;
            const x = i % W, y = (i - x) / W;
            const nbs = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
            for (let q = 0; q < 4; q++) {
              const nb = nbs[q]; if (nb < 0 || seenP.has(nb)) continue; seenP.set(nb, 1);
              if (!land[nb] || !ok(nb)) continue;
              const bx = nb % W - cx, by = (nb - nb % W) / W - cy;
              heap.push(Math.sqrt(bx * bx + by * by) + 2.5 * nMisc.n2(nb % W * 0.35 + 70, (nb - nb % W) / W * 0.35), nb);
            }
          }
          magicSpots.push([cx, cy, id]);
          break;
        }
      }
    }
    // Vulkaninseln: Gipfel + Aschefeld
    for (const v of volcanoes) {
      const R2 = Math.ceil(v.r + 2);
      for (let yy = v.y - R2; yy <= v.y + R2; yy++) for (let xx = v.x - R2; xx <= v.x + R2; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = yy * W + xx; if (!land[i] || river[i]) continue;
        const dx = xx - v.x, dy = yy - v.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d > v.r + 1.3) continue; // nur die eigene Insel
        ter[i] = d <= 1.0 ? TT.MOUNTAIN : TT.ASH;
        E[i] = Math.max(E[i], 0.9 - d * 0.18);
      }
      magicSpots.push([v.x, v.y, TT.ASH]);
    }
    // Festland-Vulkan bei viel Magie
    if (o.magic >= 0.6) {
      const ra = stream(seed, 'ashland');
      const n = Math.floor((o.magic - 0.5) * 2 * areaScale + ra.next());
      const mts = []; for (let i = 0; i < N; i++) if (ter[i] === TT.MOUNTAIN && dWater[i] > 4) mts.push(i);
      for (let k = 0; k < n && mts.length; k++) {
        const c = mts[ra.int(mts.length)], cx = c % W, cy = (c - cx) / W;
        if (magicSpots.some(s => (s[0] - cx) * (s[0] - cx) + (s[1] - cy) * (s[1] - cy) < 300)) continue;
        const rad = ra.range(3.5, 5.5) * Math.sqrt(Math.sqrt(areaScale));
        const R2 = Math.ceil(rad + 2);
        for (let yy = cy - R2; yy <= cy + R2; yy++) for (let xx = cx - R2; xx <= cx + R2; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const i = yy * W + xx; const t = ter[i];
          if (!land[i] || t === TT.RIVER || t === TT.MOUNTAIN || t === TT.SNOW) continue;
          const dx = xx - cx, dy = yy - cy;
          if (Math.sqrt(dx * dx + dy * dy) <= rad + 1.2 * nMisc.n2(xx * 0.5 + 3, yy * 0.5)) ter[i] = TT.ASH;
        }
        magicSpots.push([cx, cy, TT.ASH]);
      }
    }

    // Relief-Krümel (von Flüssen abgeschnittene Hügel-/Gebirgsreste) einebnen
    {
      const up = new Uint8Array(N);
      for (let i = 0; i < N; i++) up[i] = LUT.rank[ter[i]] >= 5 ? 1 : 0;
      const cc = components(up, W, H);
      for (let i = 0; i < N; i++) {
        if (!up[i] || cc.sizes[cc.lab[i]] >= 4) continue;
        const x = i % W, y = (i - x) / W; let best = TT.GRASS, bc = 0;
        const cnt = {};
        for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const u = ter[yy * W + xx]; if (LUT.rank[u] !== 4 || u === TT.LAVA) continue;
          cnt[u] = (cnt[u] || 0) + 1; if (cnt[u] > bc) { bc = cnt[u]; best = u; }
        }
        ter[i] = best;
      }
    }

    // 12) Strände
    for (let i = 0; i < N; i++) {
      if (!land[i]) continue;
      const t = ter[i];
      if (t === TT.RIVER || t === TT.MOUNTAIN || t === TT.SNOW || t === TT.HILL || t === TT.SWAMP || t === TT.ASH || t === TT.CRYSTAL || t === TT.MUSHROOM || t === TT.SNOWFIELD) continue;
      const d = dWater[i];
      if (d > 2.5) continue;
      const x = i % W, y = (i - x) / W;
      let oc = false, lk = false;
      for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
        const j = yy * W + xx; if (ocean[j]) oc = true; else if (lake[j]) lk = true;
      }
      if (Tm[i] < 0.24) continue;
      const bn = nMisc.n2(QX[i] * 9 + 33, QY[i] * 9);
      if (oc && bn > -0.3) ter[i] = TT.SAND;
      else if (lk && bn > 0.35) ter[i] = TT.SAND;
      else if (!oc && !lk && d <= 2.01 && bn > 0.55 && (t === TT.DESERT || t === TT.SAVANNA || t === TT.GRASS) && nearOcean(ocean, W, H, x, y, 2)) ter[i] = TT.SAND;
    }

    // 13) Wasser: Tiefsee → Meer → Flachwasser
    let hMin = th;
    for (let i = 0; i < N; i++) if (h0[i] < hMin) hMin = h0[i];
    for (let i = 0; i < N; i++) {
      if (land[i]) continue;
      const d = dLand[i];
      if (lake[i]) { ter[i] = d <= 1.5 ? TT.SHALLOW : TT.WATER; continue; }
      const sh = th - h0[i] + 0.07 * nMisc.fbm(QX[i] * 5 + 61, QY[i] * 5, 2, 0.5);
      if (d <= 1.5 || (d <= 3.5 && sh < 0.03)) ter[i] = TT.SHALLOW;
      else if (d >= 10 || (d >= 4 && sh > 0.13)) ter[i] = TT.DEEP;
      else ter[i] = TT.WATER;
    }
    cleanWaterCrumbs(ter, land, W, H);

    // 14) Höhen
    let eMax = 0; for (let i = 0; i < N; i++) if (land[i] && E[i] > eMax) eMax = E[i];
    const height = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      let h;
      if (land[i]) {
        h = SEA_LEVEL + Math.round(clamp01(E[i] / (eMax + 1e-6)) * (255 - SEA_LEVEL));
        const t = ter[i];
        if (t === TT.MOUNTAIN && h < 205) h = 205 + (h & 15);
        if (t === TT.SNOW && h < 230) h = 230 + (h & 15);
        if (t === TT.HILL && h < 160) h = 160 + (h & 15);
        if (t !== TT.MOUNTAIN && t !== TT.SNOW && t !== TT.HILL && h > 200) h = 200;
      } else if (lake[i]) {
        h = SEA_LEVEL - 3 - Math.round(Math.min(dLand[i], 6) * 3);
      } else {
        const depth = clamp01((th - h0[i]) / (th - hMin + 1e-6)) * 0.6 + clamp01(dLand[i] / 14) * 0.4;
        h = SEA_LEVEL - 1 - Math.round(depth * (SEA_LEVEL - 1));
      }
      height[i] = h < 0 ? 0 : h > 255 ? 255 : h;
    }

    // 15) Aussehen-Variante je Kachel
    const variant = new Uint8Array(N);
    for (let i = 0; i < N; i++) variant[i] = mix32(seed ^ 0x51ed, i) & 255;

    // 16) Startplätze
    const startSpots = findStartSpots(ter, ocean, lake, W, H, areaScale);

    return {
      W, H, seed, opts: o, template: tplKey,
      terrain: ter, variant, height, startSpots,
      name: makeName(seed, tplKey)
    };
  }

  function nearType(ter, W, H, i, id, r) {
    const x = i % W, y = (i - x) / W;
    for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++)
      for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) if (ter[yy * W + xx] === id) return true;
    return false;
  }
  function nearOcean(ocean, W, H, x, y, r) {
    for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++)
      for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) if (ocean[yy * W + xx]) return true;
    return false;
  }
  function nearRiver(river, W, H, x, y, r) {
    for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++)
      for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) if (river[yy * W + xx]) return true;
    return false;
  }

  function floodOcean(land, W, H) {
    const N = W * H, ocean = new Uint8Array(N), st = new Int32Array(N); let sp = 0;
    for (let x = 0; x < W; x++) { for (const y of [0, H - 1]) { const i = y * W + x; if (!land[i] && !ocean[i]) { ocean[i] = 1; st[sp++] = i; } } }
    for (let y = 0; y < H; y++) { for (const x of [0, W - 1]) { const i = y * W + x; if (!land[i] && !ocean[i]) { ocean[i] = 1; st[sp++] = i; } } }
    while (sp) {
      const i = st[--sp], x = i % W, y = (i - x) / W;
      if (x > 0 && !land[i - 1] && !ocean[i - 1]) { ocean[i - 1] = 1; st[sp++] = i - 1; }
      if (x < W - 1 && !land[i + 1] && !ocean[i + 1]) { ocean[i + 1] = 1; st[sp++] = i + 1; }
      if (y > 0 && !land[i - W] && !ocean[i - W]) { ocean[i - W] = 1; st[sp++] = i - W; }
      if (y < H - 1 && !land[i + W] && !ocean[i + W]) { ocean[i + W] = 1; st[sp++] = i + W; }
    }
    return ocean;
  }

  // Inselkrümel und Mini-Seen entfernen, diagonale Schachbrett-Ecken schließen.
  function cleanLand(land, W, H, h0, minSize) {
    for (let pass = 0; pass < 2; pass++) {
      let cc = components(land, W, H);
      for (let i = 0; i < land.length; i++) if (land[i] && cc.sizes[cc.lab[i]] < minSize) land[i] = 0;
      const water = new Uint8Array(land.length); for (let i = 0; i < land.length; i++) water[i] = land[i] ? 0 : 1;
      cc = components(water, W, H);
      for (let i = 0; i < land.length; i++) if (water[i] && !cc.touchBorder[cc.lab[i]] && cc.sizes[cc.lab[i]] < minSize) land[i] = 1;
      for (let y = 2; y < H - 3; y++) for (let x = 2; x < W - 3; x++) {
        const a = y * W + x, b = a + 1, c = a + W, d = a + W + 1;
        if (land[a] === land[d] && land[b] === land[c] && land[a] !== land[b]) {
          if (land[a]) { if (h0[b] > h0[c]) land[b] = 1; else land[c] = 1; }
          else { if (h0[a] > h0[d]) land[a] = 1; else land[d] = 1; }
        }
      }
    }
  }

  // Maske glätten: Mehrheitsfilter, kleine Teile weg, kleine Löcher füllen. allow = darf gesetzt werden.
  function smoothMask(mask, allow, W, H, passes, minPart, maxHole) {
    for (let p = 0; p < passes; p++) {
      const src = mask.slice();
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const c = src[i - W - 1] + src[i - W] + src[i - W + 1] + src[i - 1] + src[i + 1] + src[i + W - 1] + src[i + W] + src[i + W + 1];
        const c4 = src[i - W] + src[i - 1] + src[i + 1] + src[i + W];
        if (src[i]) { if (c <= 2 || c4 <= 1) mask[i] = 0; }
        else if (allow[i] && (c >= 6 || c4 >= 3)) mask[i] = 1;
      }
    }
    let cc = components(mask, W, H);
    for (let i = 0; i < mask.length; i++) if (mask[i] && cc.sizes[cc.lab[i]] < minPart) mask[i] = 0;
    const inv = new Uint8Array(mask.length); for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
    cc = components(inv, W, H);
    for (let i = 0; i < mask.length; i++) if (inv[i] && allow[i] && !cc.touchBorder[cc.lab[i]] && cc.sizes[cc.lab[i]] <= maxHole) mask[i] = 1;
  }

  // Relief zu ruhigen Flächen formen: kompakte Gebirge, Hügelvorland ringsum, keine Sprenkel.
  function shapeRelief(relief, land, W, H, nz, sM, areaScale) {
    const N = W * H, M = new Uint8Array(N), U = new Uint8Array(N);
    for (let i = 0; i < N; i++) M[i] = relief[i] === 2 ? 1 : 0;
    const sa = Math.sqrt(areaScale);
    smoothMask(M, land, W, H, 2, Math.max(6, Math.round(9 * sa)), 10);
    // Gebirge nie direkt an der Küste kleben lassen: Küstenkachel → Hügel
    const dM = distField(M, W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!land[i]) continue;
      if (M[i]) { U[i] = 1; continue; }
      const ring = 1.2 + (0.9 + 0.9 * sM) * (0.5 + 0.5 * nz.n2(x * 0.13 + 41, y * 0.13 + 7));
      if (relief[i] === 1 || dM[i] <= ring) U[i] = 1;
    }
    smoothMask(U, land, W, H, 2, Math.max(8, Math.round(12 * sa)), 14);
    for (let i = 0; i < N; i++) { if (M[i]) U[i] = 1; relief[i] = !land[i] ? 0 : M[i] ? 2 : U[i] ? 1 : 0; }
    // Gebirgskacheln, die direkt an Wasser grenzen, werden Hügel (Steilküste als Vorland)
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (relief[i] !== 2) continue;
      if (!land[i - 1] || !land[i + 1] || !land[i - W] || !land[i + W]) relief[i] = 1;
    }
  }

  // Werte unter mask durch ihren Rang (0..1) ersetzen.
  function rankNorm(vals, mask) {
    let n = 0;
    for (let i = 0; i < vals.length; i++) if (mask[i]) n++;
    if (!n) return;
    const sorted = new Float64Array(n);
    for (let i = 0, k = 0; i < vals.length; i++) if (mask[i]) sorted[k++] = vals[i];
    sorted.sort();
    const d = n - 1 || 1;
    for (let i = 0; i < vals.length; i++) {
      if (!mask[i]) continue;
      const v = vals[i]; let lo = 0, hi = n - 1; // untere Grenze per Binärsuche (gleiche Werte → gleicher Rang)
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < v) lo = mid + 1; else hi = mid; }
      vals[i] = lo / d;
    }
  }

  // Einzelne Biom-Kacheln an die Mehrheit der Nachbarn angleichen.
  function modeFilter(ter, land, W, H, passes) {
    const cnt = new Int16Array(NT);
    for (let p = 0; p < passes; p++) {
      const src = ter.slice();
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; if (!land[i]) continue;
        const t = src[i]; if (LUT.rank[t] !== 4) continue; // nur flache Biome; Relief bleibt
        let same = 0;
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
          if (!xx && !yy) continue;
          const j = i + yy * W + xx; const u = src[j];
          if (u === t) same++;
          if (land[j] && LUT.rank[u] === 4) cnt[u]++;
        }
        if (same < 2) {
          let best = -1, bc = 0;
          for (let k = 0; k < NT; k++) if (cnt[k] > bc && k !== t) { bc = cnt[k]; best = k; }
          if (best >= 0 && bc >= 3) ter[i] = best;
        }
        for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) cnt[src[i + yy * W + xx]] = 0;
      }
    }
  }

  // Einzelne Flachwasser-/Tiefsee-Kacheln glätten.
  function cleanWaterCrumbs(ter, land, W, H) {
    const src = ter.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (land[i]) continue;
      const t = src[i]; if (t === TT.SHALLOW) continue;
      let same = 0, sh = 0, wa = 0, de = 0;
      for (let yy = -1; yy <= 1; yy++) for (let xx = -1; xx <= 1; xx++) {
        if (!xx && !yy) continue;
        const u = src[i + yy * W + xx];
        if (u === t) same++; if (u === TT.SHALLOW) sh++; else if (u === TT.WATER) wa++; else if (u === TT.DEEP) de++;
      }
      if (same <= 1) ter[i] = (t === TT.DEEP) ? TT.WATER : (de > sh ? TT.DEEP : TT.WATER);
    }
  }

  // ---------------------------------------------------------------- Startplätze
  function findStartSpots(ter, ocean, lake, W, H, areaScale) {
    const N = W * H;
    const bld = new Float32Array(N), fer = new Float32Array(N), wood = new Float32Array(N), stone = new Float32Array(N);
    const fresh = new Float32Array(N), hill = new Float32Array(N), walk = new Uint8Array(N), sea = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = ter[i];
      bld[i] = (LUT.build[t] && LUT.walk[t] > 0) ? 1 : 0;
      fer[i] = LUT.fertile[t];
      wood[i] = LUT.wood[t];
      stone[i] = LUT.stone[t];
      fresh[i] = (t === TT.RIVER || lake[i]) ? 1 : 0;
      sea[i] = ocean[i] ? 1 : 0;
      hill[i] = t === TT.HILL ? 1 : 0;
      walk[i] = LUT.walk[t] > 0 && !LUT.water[t] || t === TT.RIVER ? 1 : 0;
    }
    const Sb = sat(bld, W, H), Sf = sat(fer, W, H), Sw = sat(wood, W, H), Ss = sat(stone, W, H);
    const Sr = sat(fresh, W, H), Sh = sat(hill, W, H), Sea = sat(sea, W, H);
    const cc = components(walk, W, H);
    const tiers = [
      { core: 70, space: 205, fert: 0.55, wood: 12, stone: 6, comp: 300 },
      { core: 62, space: 175, fert: 0.45, wood: 6, stone: 3, comp: 200 },
      { core: 52, space: 135, fert: 0.3, wood: 2, stone: 1, comp: 120 },
      { core: 40, space: 90, fert: 0.18, wood: 0, stone: 0, comp: 60 }
    ];
    const scoreArr = new Float32Array(N).fill(-1), tierArr = new Int8Array(N).fill(-1);
    for (let y = 5; y < H - 5; y++) for (let x = 5; x < W - 5; x++) {
      const i = y * W + x, t = ter[i];
      if (!LUT.build[t] || LUT.walk[t] < 0.85 || LUT.fertile[t] < 0.3) continue;
      const core = satSum(Sb, W, H, x - 4, y - 4, x + 4, y + 4);
      if (core < tiers[3].core) continue;
      const space = satSum(Sb, W, H, x - 8, y - 8, x + 8, y + 8);
      const fert = satSum(Sf, W, H, x - 6, y - 6, x + 6, y + 6) / 169;
      const wd = satSum(Sw, W, H, x - 10, y - 10, x + 10, y + 10);
      const st = satSum(Ss, W, H, x - 12, y - 12, x + 12, y + 12);
      const fr = satSum(Sr, W, H, x - 6, y - 6, x + 6, y + 6);
      const se = satSum(Sea, W, H, x - 6, y - 6, x + 6, y + 6);
      const hl = satSum(Sh, W, H, x - 3, y - 3, x + 3, y + 3);
      const comp = cc.sizes[cc.lab[i]];
      let tier = -1;
      for (let k = 0; k < tiers.length; k++) {
        const q = tiers[k];
        if (core >= q.core && space >= q.space && fert >= q.fert && wd >= q.wood && st >= q.stone && comp >= q.comp && hl <= 14) { tier = k; break; }
      }
      if (tier < 0) continue;
      const water = fr > 0 ? 1 : se > 0 ? 0.6 : 0;
      const score = 0.3 * Math.min(1, fert / 0.9) + 0.17 * Math.min(1, wd / 45) + 0.17 * Math.min(1, st / 25) +
        0.16 * (space / 289) + 0.12 * water + 0.08 * Math.min(1, comp / 1500) - 0.08 * tier;
      scoreArr[i] = score; tierArr[i] = tier;
    }
    const cands = [];
    for (let i = 0; i < N; i++) if (scoreArr[i] >= 0) cands.push(i);
    cands.sort((a, b) => (tierArr[a] - tierArr[b]) || (scoreArr[b] - scoreArr[a]) || (a - b));
    let landTiles = 0; for (let i = 0; i < N; i++) if (bld[i]) landTiles++;
    const bigD = Math.max(14, Math.min(34, Math.round(Math.sqrt(landTiles / 11))));
    const picked = [];
    const spacing = [bigD, Math.max(14, Math.round(bigD * 0.75)), 14];
    for (const D of spacing) {
      for (let k = 0; k < cands.length && picked.length < 12; k++) {
        const i = cands[k], x = i % W, y = (i - x) / W;
        let ok = true;
        for (const p of picked) { const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy < D * D) { ok = false; break; } }
        if (ok) picked.push({ x, y, score: Math.round(scoreArr[i] * 1000) / 1000, biome: dominantBiome(ter, W, H, x, y) });
      }
    }
    picked.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
    return picked;
  }
  function dominantBiome(ter, W, H, x, y) {
    const cnt = new Int16Array(NT);
    for (let yy = y - 5; yy <= y + 5; yy++) for (let xx = x - 5; xx <= x + 5; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const t = ter[yy * W + xx]; if (LUT.water[t]) continue; cnt[t]++;
    }
    let best = ter[y * W + x], bc = 0;
    for (let k = 0; k < NT; k++) if (cnt[k] > bc) { bc = cnt[k]; best = k; }
    return WW.TERRAIN[best].key;
  }

  // ---------------------------------------------------------------- Vorschau
  let PAL = null;
  function palette() {
    if (PAL) return PAL;
    PAL = new Uint8Array(NT * 3);
    for (const d of WW.TERRAIN) {
      const c = d.color.replace('#', '');
      PAL[d.id * 3] = parseInt(c.slice(0, 2), 16); PAL[d.id * 3 + 1] = parseInt(c.slice(2, 4), 16); PAL[d.id * 3 + 2] = parseInt(c.slice(4, 6), 16);
    }
    return PAL;
  }
  // Welt (fertig oder neu) als RGBA-Bild. opt: { shade: true, spots: false }
  function render(world, maxW, maxH, opt) {
    opt = opt || {};
    const W = world.W, H = world.H, ter = world.terrain, hgt = world.height, vr = world.variant;
    maxW = maxW || W; maxH = maxH || H;
    let s = Math.min(maxW / W, maxH / H);
    if (s >= 1) s = Math.floor(s);
    const w = Math.max(1, Math.floor(W * s)), h = Math.max(1, Math.floor(H * s));
    const pal = palette(), shade = opt.shade !== false;
    // Grundfarbe je Kachel (mit Relief-Schattierung)
    const col = new Uint8ClampedArray(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, t = ter[i];
      let r = pal[t * 3], g = pal[t * 3 + 1], b = pal[t * 3 + 2];
      if (shade) {
        let f = 1;
        if (!LUT.water[t] || t === TT.RIVER) {
          const hn = (x > 0 && y > 0) ? hgt[i - W - 1] : hgt[i];
          let d = (hgt[i] - hn) * 0.006; if (d > 0.16) d = 0.16; if (d < -0.16) d = -0.16;
          f += d + ((vr[i] & 7) - 3.5) * 0.008;
        } else {
          f += (hgt[i] - SEA_LEVEL * 0.7) * 0.0015;
        }
        r *= f; g *= f; b *= f;
      }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
    }
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let py = 0; py < h; py++) {
      const ty = Math.min(H - 1, Math.floor(py * H / h));
      for (let px = 0; px < w; px++) {
        const tx = Math.min(W - 1, Math.floor(px * W / w)), i = ty * W + tx, o = (py * w + px) * 4;
        rgba[o] = col[i * 3]; rgba[o + 1] = col[i * 3 + 1]; rgba[o + 2] = col[i * 3 + 2]; rgba[o + 3] = 255;
      }
    }
    if (opt.spots) {
      for (const sp of world.startSpots) {
        const cx = (sp.x + 0.5) * w / W, cy = (sp.y + 0.5) * h / H, rad = Math.max(2, 1.6 * w / W);
        for (let py = Math.floor(cy - rad - 1); py <= cy + rad + 1; py++) for (let px = Math.floor(cx - rad - 1); px <= cx + rad + 1; px++) {
          if (px < 0 || py < 0 || px >= w || py >= h) continue;
          const dx = px + 0.5 - cx, dy = py + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy), o = (py * w + px) * 4;
          if (d <= rad - 0.8) { rgba[o] = 255; rgba[o + 1] = 255; rgba[o + 2] = 255; }
          else if (d <= rad + 0.6) { rgba[o] = 20; rgba[o + 1] = 16; rgba[o + 2] = 24; }
        }
      }
    }
    return { w, h, rgba };
  }
  let pcache = null;
  function preview(opts, maxW, maxH, opt) {
    const o = normalizeOpts(opts);
    const key = JSON.stringify([String(o.seed), o.W, o.H, o.template].concat(SLIDERS.map(k => o[k])));
    let world;
    if (pcache && pcache.key === key) world = pcache.world;
    else { world = generate(opts); pcache = { key, world }; }
    const img = render(world, maxW, maxH, opt);
    img.world = world;
    return img;
  }

  WW.WorldGen = {
    SEA_LEVEL, SIZES, TEMPLATES, DEFAULTS, SLIDERS,
    generate, preview, render, terrainFromHeight, classifyBiome, randomOpts, THEMES,
    seedToInt, hashString
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
