// Einfacher Rückfall-Weltgenerator (wenn js/sim/worldgen.js nicht geladen ist) und Startplatzsuche.
// Liefert dieselbe Form wie WW.WorldGen.generate: { W, H, terrain, variant, height, startSpots, name }.
(function (WW) { 'use strict';

  function hash2(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function valueNoise(x, y, s) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = hash2(x0, y0, s), b = hash2(x0 + 1, y0, s), c = hash2(x0, y0 + 1, s), d = hash2(x0 + 1, y0 + 1, s);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }
  function fbm(x, y, s, oct) {
    let sum = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < oct; o++) { sum += valueNoise(x * f, y * f, s + o * 101) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  }

  function generate(opts) {
    const T = WW.T;
    const W = Math.max(32, Math.min(512, (opts && opts.width) | 0 || 144));
    const H = Math.max(32, Math.min(512, (opts && opts.height) | 0 || 96));
    const seedNum = WW.RNG.hashSeed(opts && opts.seed != null ? opts.seed : 1);
    const rng = WW.RNG.create('welt:' + seedNum);
    const N = W * H;
    const terrain = new Uint8Array(N), variant = new Uint8Array(N), height = new Uint8Array(N);

    // Inselzentren
    const isl = [];
    const cnt = 4 + rng.int(3);
    for (let i = 0; i < cnt; i++) {
      isl.push({ x: W * (0.15 + 0.7 * rng.next()), y: H * (0.18 + 0.64 * rng.next()),
        rx: W * (0.14 + 0.12 * rng.next()), ry: H * (0.16 + 0.14 * rng.next()) });
    }
    const s1 = seedNum & 0xffff, s2 = (seedNum >>> 16) + 7, s3 = s1 + 999;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let h = 0;
      for (const c of isl) {
        const dx = (x - c.x) / c.rx, dy = (y - c.y) / c.ry;
        const v = 1 - Math.sqrt(dx * dx + dy * dy);
        if (v > h) h = v;
      }
      const n = fbm(x / 14, y / 14, s1, 4);
      h = h * 0.75 + (n - 0.5) * 0.7 + 0.12;
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edge < 6) h -= (6 - edge) * 0.08;
      const hv = Math.max(0, Math.min(1, h));
      const i = y * W + x;
      height[i] = Math.round(hv * 255);
      const m = fbm(x / 9, y / 9, s2, 3);
      const r = fbm(x / 5, y / 5, s3, 2);
      let t;
      if (hv < 0.16) t = T.DEEP;
      else if (hv < 0.25) t = T.WATER;
      else if (hv < 0.29) t = T.SHALLOW;
      else if (hv < 0.33) t = T.SAND;
      else if (hv < 0.58) {
        if (m > 0.6) t = T.FOREST;
        else if (m < 0.3 && hv < 0.4) t = T.SWAMP;
        else if (r > 0.7) t = T.FLOWERS;
        else t = T.GRASS;
      } else if (hv < 0.68) t = m > 0.65 ? T.FOREST : T.HILL;
      else if (hv < 0.8) t = T.MOUNTAIN;
      else t = T.SNOW;
      if (edge < 2) t = T.DEEP;
      terrain[i] = t;
      variant[i] = Math.floor(hash2(x, y, seedNum) * 256);
    }
    const world = { W: W, H: H, seed: opts && opts.seed, terrain: terrain, variant: variant, height: height, name: 'Wuselland' };
    world.startSpots = findStartSpots(terrain, W, H, 12);
    return world;
  }

  // Gute Siedlungsplätze: 2×2 bebaubar, viel bebaubares Land, Holz und Stein in Reichweite
  function findStartSpots(terrain, W, H, max) {
    const LUT = WW.TERRAIN_LUT;
    const cand = [];
    for (let y = 6; y < H - 7; y += 2) for (let x = 6; x < W - 7; x += 2) {
      let ok = true;
      for (let dy = 0; dy < 2 && ok; dy++) for (let dx = 0; dx < 2; dx++) {
        if (!LUT.build[terrain[(y + dy) * W + x + dx]] || LUT.walk[terrain[(y + dy) * W + x + dx]] <= 0) { ok = false; break; }
      }
      if (!ok) continue;
      let build = 0, fert = 0, wood = 0, stone = 0;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const t = terrain[(y + dy) * W + x + dx];
        if (LUT.build[t]) build++;
        if (LUT.fertile[t] > 0.5) fert++;
        if (LUT.wood[t]) wood++;
        if (LUT.stone[t]) stone++;
      }
      if (build < 90) continue;
      const score = build + fert * 0.6 + Math.min(wood, 20) * 1.5 + Math.min(stone, 10) * 1.5;
      cand.push({ x: x, y: y, score: score });
    }
    cand.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
    const out = [];
    for (const c of cand) {
      if (out.length >= max) break;
      let far = true;
      for (const o of out) if (Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 22) { far = false; break; }
      if (far) out.push({ x: c.x, y: c.y, score: Math.round(c.score), biome: WW.TERRAIN[terrain[c.y * W + c.x]].key });
    }
    return out;
  }

  WW.SimWorld = { generate: generate, findStartSpots: findStartSpots };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
