#!/usr/bin/env node
// Prüfskript für den Weltgenerator (Plan 5.3): node tools/worldgen-check.js [anzahlSeeds]
// Prüft Determinismus, gültige IDs, Meer am Rand, Landanteil folgt dem Regler, Startplätze,
// Fluss-Regeln, Relief-Regeln und misst die Zeiten.
'use strict';
const path = require('path');
require(path.join(__dirname, '../js/core/terrain.js'));
require(path.join(__dirname, '../js/sim/worldgen.js'));
const WW = globalThis.WW, G = WW.WorldGen, T = WW.T, LUT = WW.TERRAIN_LUT;

const SEEDS = +process.argv[2] || 50;
let fails = 0, checks = 0;
function check(ok, msg) { checks++; if (!ok) { fails++; if (fails <= 40) console.log('  FEHLER: ' + msg); } return ok; }
function now() { const t = process.hrtime(); return t[0] * 1000 + t[1] / 1e6; }
const tplKeys = G.TEMPLATES.map(t => t.key);
const real = tplKeys.filter(k => k !== 'random');

// ---------------------------------------------------------------- Schnittstelle
console.log('Schnittstelle');
check(Array.isArray(G.SIZES) && G.SIZES.length === 4, 'SIZES');
const sz = Object.fromEntries(G.SIZES.map(s => [s.key, s]));
check(sz.small.w === 96 && sz.small.h === 64 && sz.medium.w === 144 && sz.medium.h === 96 &&
  sz.large.w === 192 && sz.large.h === 128 && sz.huge.w === 256 && sz.huge.h === 160, 'Größen');
check(G.TEMPLATES.length >= 7 && tplKeys.includes('random'), 'mindestens 7 Vorlagen inkl. random');
check(G.TEMPLATES.every(t => t.key && t.name && t.desc), 'Vorlagen mit key, name, desc');
for (const k of ['seed', 'size', 'template', 'land', 'mountains', 'forests', 'rivers', 'temperature', 'moisture', 'magic'])
  check(k in G.DEFAULTS, 'DEFAULTS.' + k);
check(typeof G.SEA_LEVEL === 'number', 'SEA_LEVEL');
check(typeof G.preview === 'function' && typeof G.terrainFromHeight === 'function', 'preview / terrainFromHeight');
console.log('  Vorlagen: ' + G.TEMPLATES.map(t => t.key + ' (' + t.name + ')').join(', '));

// ---------------------------------------------------------------- Einzelwelt-Prüfungen
function inspect(w, label) {
  const { W, H, terrain: ter } = w, N = W * H;
  check(ter instanceof Uint8Array && ter.length === N, label + ': terrain-Länge');
  check(w.variant instanceof Uint8Array && w.variant.length === N, label + ': variant');
  check(w.height instanceof Uint8Array && w.height.length === N, label + ': height');
  check(typeof w.name === 'string' && w.name.length > 2, label + ': name');
  let badId = 0, lava = 0;
  for (let i = 0; i < N; i++) { if (ter[i] >= WW.TERRAIN.length) badId++; if (ter[i] === T.LAVA) lava++; }
  check(badId === 0, label + ': ungültige IDs ' + badId);
  check(lava === 0, label + ': Lava erzeugt');
  // Rand ist Meer
  let edge = 0;
  for (let x = 0; x < W; x++) { if (!isSea(ter[x])) edge++; if (!isSea(ter[(H - 1) * W + x])) edge++; }
  for (let y = 0; y < H; y++) { if (!isSea(ter[y * W])) edge++; if (!isSea(ter[y * W + W - 1])) edge++; }
  check(edge === 0, label + ': Rand nicht Meer (' + edge + ')');
  // Höhe passt zum Meeresspiegel
  let hBad = 0;
  for (let i = 0; i < N; i++) {
    const water = !!LUT.water[ter[i]] && ter[i] !== T.RIVER;
    if (water !== (w.height[i] < G.SEA_LEVEL)) hBad++;
  }
  check(hBad === 0, label + ': Höhe/Meeresspiegel passt nicht (' + hBad + ')');
  // Flüsse: 1 Kachel breit (kein 2×2), jeder Flusslauf erreicht Meer oder See
  let blocks = 0;
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
    const i = y * W + x;
    if (ter[i] === T.RIVER && ter[i + 1] === T.RIVER && ter[i + W] === T.RIVER && ter[i + W + 1] === T.RIVER) blocks++;
  }
  check(blocks === 0, label + ': Fluss 2×2 breit (' + blocks + ')');
  const rc = comps(ter, W, H, t => t === T.RIVER);
  let dry = 0;
  for (const c of rc) {
    let mouth = false;
    for (const i of c) { const x = i % W; for (const j of [i - 1, i + 1, i - W, i + W]) { if (j < 0 || j >= N || Math.abs(j % W - x) > 1) continue; const t = ter[j]; if (t === T.WATER || t === T.SHALLOW || t === T.DEEP) mouth = true; } if (mouth) break; }
    if (!mouth) dry++;
  }
  check(dry === 0, label + ': Flusslauf ohne Mündung (' + dry + ')');
  // Längste schnurgerade Flussstrecke
  let straight = 0;
  for (let y = 0; y < H; y++) { let run = 0; for (let x = 0; x < W; x++) { run = ter[y * W + x] === T.RIVER ? run + 1 : 0; if (run > straight) straight = run; } }
  for (let x = 0; x < W; x++) { let run = 0; for (let y = 0; y < H; y++) { run = ter[y * W + x] === T.RIVER ? run + 1 : 0; if (run > straight) straight = run; } }
  stat.straight = Math.max(stat.straight, straight);
  // Schneegipfel ringsum von Gebirge/Schnee umgeben
  let snowOpen = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (ter[i] !== T.SNOW) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = ter[i + dy * W + dx]; if (t !== T.SNOW && t !== T.MOUNTAIN) { snowOpen++; dy = 2; break; } }
  }
  check(snowOpen === 0, label + ': Schneegipfel nicht von Gebirge umgeben (' + snowOpen + ')');
  // Relief-Sprenkel: Gebirge/Hügel-Flächen (4er-Komponenten aus rank ≥ 5) kleiner als 4 Kacheln
  const up = comps(ter, W, H, t => LUT.rank[t] >= 5);
  const tiny = up.filter(c => c.length < 4).length;
  stat.reliefSpecks += tiny;
  // Mini-Seen
  const lakes = comps(ter, W, H, t => t === T.WATER || t === T.SHALLOW || t === T.DEEP).filter(c => !c.some(i => i % W === 0 || i < W));
  stat.tinyLakes += lakes.filter(c => c.length < 4).length;
  // Startplätze
  const sp = w.startSpots;
  check(Array.isArray(sp) && sp.length <= 12, label + ': startSpots');
  for (let a = 0; a < sp.length; a++) {
    const s = sp[a];
    check(s.x >= 0 && s.y >= 0 && s.x < W && s.y < H && LUT.build[ter[s.y * W + s.x]], label + ': Startplatz nicht bebaubar');
    check(typeof s.score === 'number' && typeof s.biome === 'string', label + ': Startplatz-Felder');
    if (a > 0) check(sp[a - 1].score >= s.score, label + ': Startplätze nicht sortiert');
    for (let b = a + 1; b < sp.length; b++) { const dx = s.x - sp[b].x, dy = s.y - sp[b].y; check(dx * dx + dy * dy >= 14 * 14, label + ': Startplätze < 14 Kacheln'); }
  }
  return sp.length;
}
function isSea(t) { return t === T.DEEP || t === T.WATER || t === T.SHALLOW; }
function comps(ter, W, H, pred) {
  const N = W * H, seen = new Uint8Array(N), out = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || !pred(ter[s])) continue;
    const c = [s], st = [s]; seen[s] = 1;
    while (st.length) {
      const i = st.pop(), x = i % W;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i < N - W ? i + W : -1];
      for (const j of nb) if (j >= 0 && !seen[j] && pred(ter[j])) { seen[j] = 1; c.push(j); st.push(j); }
    }
    out.push(c);
  }
  return out;
}
const stat = { straight: 0, reliefSpecks: 0, tinyLakes: 0 };

// ---------------------------------------------------------------- Determinismus
console.log('Determinismus');
for (const o of [{ seed: 7 }, { seed: 'Hallo Welt', template: 'random', size: 'small' }, { seed: 123456, template: 'archipelago', magic: 1, rivers: 1 }]) {
  const a = G.generate(o), b = G.generate(Object.assign({}, o));
  check(a.W === b.W && a.name === b.name && a.terrain.every((v, i) => v === b.terrain[i]) &&
    a.height.every((v, i) => v === b.height[i]) && a.variant.every((v, i) => v === b.variant[i]) &&
    JSON.stringify(a.startSpots) === JSON.stringify(b.startSpots), 'nicht deterministisch: ' + JSON.stringify(o));
}
{
  const a = G.generate({ seed: 'abc' }), b = G.generate({ seed: 'abd' });
  check(!a.terrain.every((v, i) => v === b.terrain[i]), 'verschiedene Seeds → gleiche Welt');
  const c = G.generate({ seed: 42 }), d = G.generate({ seed: '42' });
  check(c.terrain.every((v, i) => v === d.terrain[i]), 'Seed 42 und "42" sollten gleich sein');
}

// ---------------------------------------------------------------- 50 Seeds × alle Vorlagen
console.log('Welten: ' + SEEDS + ' Seeds × ' + tplKeys.length + ' Vorlagen (mittel, Standardwerte)');
const perTpl = {};
let minSpots = 99, worlds = 0, genMs = 0;
for (const tk of tplKeys) {
  let few = 0, sum = 0, mn = 99;
  for (let s = 0; s < SEEDS; s++) {
    const t0 = now();
    const w = G.generate({ seed: s * 7919 + 13, template: tk });
    genMs += now() - t0; worlds++;
    const n = inspect(w, tk + '#' + s);
    sum += n; if (n < mn) mn = n; if (n < 6) few++;
  }
  perTpl[tk] = { avg: (sum / SEEDS).toFixed(1), min: mn, few };
  if (mn < minSpots) minSpots = mn;
  check(few === 0, tk + ': ' + few + ' Welten mit weniger als 6 Startplätzen');
}
for (const k in perTpl) console.log('  ' + k.padEnd(12) + ' Startplätze Ø ' + perTpl[k].avg + ', min ' + perTpl[k].min);
console.log('  längste schnurgerade Flussstrecke: ' + stat.straight + ' Kacheln; Relief-Sprenkel (<4): ' + stat.reliefSpecks + '; Mini-Seen (<4): ' + stat.tinyLakes);
check(stat.straight <= 9, 'Flüsse mit zu langen Geraden (' + stat.straight + ')');

// ---------------------------------------------------------------- Regler
console.log('Regler (Landanteil folgt dem Regler, jeder Regler wirkt)');
function share(w, pred) { let c = 0, l = 0; for (const t of w.terrain) { const isL = !isSea(t); if (isL) l++; if (pred(t, isL)) c++; } return { c, l, N: w.terrain.length }; }
for (const tk of real) {
  let mono = true; const fr = [];
  for (let s = 0; s < 4; s++) {
    let prev = -1;
    for (const v of [0, 0.25, 0.5, 0.75, 1]) {
      const r = share(G.generate({ seed: 500 + s, template: tk, land: v, size: 'small' }), (t, l) => l);
      const f = r.l / r.N; if (s === 0) fr.push(Math.round(f * 100));
      if (f <= prev) mono = false; prev = f;
    }
  }
  check(mono, tk + ': Landanteil steigt nicht mit dem Regler');
  console.log('  ' + tk.padEnd(12) + ' Land bei 0/25/50/75/100 %: ' + fr.join(' / ') + ' %');
}
const sliderTests = [
  ['mountains', t => t === T.MOUNTAIN || t === T.SNOW || t === T.HILL, 'Gebirge+Hügel'],
  ['forests', t => t === T.FOREST || t === T.JUNGLE || t === T.TAIGA, 'Wälder'],
  ['rivers', t => t === T.RIVER, 'Flüsse'],
  ['temperature', t => t === T.DESERT || t === T.SAVANNA || t === T.JUNGLE, 'heiße Biome'],
  ['temperature', t => t === T.SNOWFIELD || t === T.TUNDRA || t === T.TAIGA, 'kalte Biome', true],
  ['moisture', t => t === T.SWAMP || t === T.JUNGLE || t === T.FOREST || t === T.TAIGA, 'feuchte Biome'],
  ['moisture', t => t === T.DESERT || t === T.SAVANNA, 'trockene Biome', true],
  ['magic', t => t === T.MUSHROOM || t === T.CRYSTAL || t === T.ASH, 'Magie-Biome']
];
for (const [k, pred, name, inverse] of sliderTests) {
  const vals = [0, 0.5, 1].map(v => {
    let c = 0, l = 0;
    for (let s = 0; s < 8; s++) { const r = share(G.generate({ seed: 900 + s, template: real[s % real.length], [k]: v }), pred); c += r.c; l += r.l; }
    return 100 * c / l;
  });
  const ok = inverse ? vals[0] > vals[1] && vals[1] > vals[2] : vals[0] < vals[1] && vals[1] < vals[2];
  const spread = Math.abs(vals[2] - vals[0]);
  check(ok && spread > 2, k + ': ' + name + ' reagiert nicht deutlich');
  console.log('  ' + (k + ' → ' + name).padEnd(30) + vals.map(v => v.toFixed(1) + ' %').join(' / ') + '  (Regler 0 / 0,5 / 1)');
}

// ---------------------------------------------------------------- Zeiten
console.log('Zeiten');
function timeIt(fn, n) { fn(); const t0 = now(); for (let i = 0; i < n; i++) fn(i); return (now() - t0) / n; }
const tM = timeIt(i => G.generate({ seed: 3000 + (i | 0), size: 'medium' }), 10);
const tH = timeIt(i => G.generate({ seed: 4000 + (i | 0), size: 'huge' }), 5);
const tP = timeIt(i => G.preview({ seed: 5000 + (i | 0), size: 'medium' }, 288, 192), 10);
console.log('  generate mittel: ' + tM.toFixed(1) + ' ms (Ziel < 300)');
console.log('  generate riesig: ' + tH.toFixed(1) + ' ms (Ziel < 1500)');
console.log('  preview  mittel: ' + tP.toFixed(1) + ' ms (Ziel < 60)');
console.log('  Ø über ' + worlds + ' Prüfwelten: ' + (genMs / worlds).toFixed(1) + ' ms');
check(tM < 300, 'generate mittel zu langsam');
check(tH < 1500, 'generate riesig zu langsam');
check(tP < 60, 'preview mittel zu langsam');

console.log('');
console.log(fails ? 'FEHLGESCHLAGEN: ' + fails + ' von ' + checks + ' Prüfungen' : 'BESTANDEN: alle ' + checks + ' Prüfungen');
process.exit(fails ? 1 : 0);
