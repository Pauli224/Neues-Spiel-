// Deterministischer Zufall (sfc32). Zustand ist ein Array aus vier uint32 und wird mitgespeichert.
(function (WW) { 'use strict';

  // Text oder Zahl -> uint32 (FNV-1a für Text)
  function hashSeed(seed) {
    if (typeof seed === 'number' && isFinite(seed)) {
      let h = Math.floor(Math.abs(seed)) >>> 0;
      h ^= Math.floor(seed / 4294967296) >>> 0;
      return h >>> 0;
    }
    const s = String(seed == null ? '' : seed);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function splitmix(x) {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return [x, (z ^ (z >>> 16)) >>> 0];
  }

  function RNG(seed) {
    let x = hashSeed(seed);
    const out = [];
    for (let i = 0; i < 4; i++) { const r = splitmix(x); x = r[0]; out.push(r[1]); }
    this.a = out[0]; this.b = out[1]; this.c = out[2]; this.d = out[3] | 1;
    for (let i = 0; i < 12; i++) this.u32();
  }

  RNG.prototype.u32 = function () {
    let a = this.a, b = this.b, c = this.c, d = this.d;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t;
  };
  // [0, 1)
  RNG.prototype.next = function () { return this.u32() / 4294967296; };
  // ganze Zahl 0..n-1
  RNG.prototype.int = function (n) { return n > 0 ? Math.floor(this.next() * n) : 0; };
  // ganze Zahl a..b (inklusive)
  RNG.prototype.irange = function (a, b) { return a + this.int(b - a + 1); };
  RNG.prototype.range = function (a, b) { return a + this.next() * (b - a); };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.pick = function (arr) { return arr && arr.length ? arr[this.int(arr.length)] : undefined; };
  // gewichtete Auswahl aus { key: gewicht }
  RNG.prototype.weighted = function (obj) {
    let sum = 0; const keys = Object.keys(obj);
    for (const k of keys) sum += Math.max(0, obj[k]);
    if (sum <= 0) return keys[0];
    let r = this.next() * sum;
    for (const k of keys) { r -= Math.max(0, obj[k]); if (r < 0) return k; }
    return keys[keys.length - 1];
  };
  RNG.prototype.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  };
  RNG.prototype.getState = function () { return [this.a, this.b, this.c, this.d]; };
  RNG.prototype.setState = function (s) {
    if (!s || s.length !== 4) return;
    this.a = s[0] >>> 0; this.b = s[1] >>> 0; this.c = s[2] >>> 0; this.d = s[3] >>> 0;
  };

  WW.RNG = {
    create: function (seed) { return new RNG(seed); },
    fromState: function (s) { const r = new RNG(0); r.setState(s); return r; },
    hashSeed: hashSeed
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
