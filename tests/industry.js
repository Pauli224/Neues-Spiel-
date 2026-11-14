// Tests der Industrie und Umweltverschmutzung: node tests/industry.js [filter]
'use strict';
const WW = require('./load.js').load();

const filter = process.argv[2] || '';
const results = [];
function log() { console.log('    ' + Array.prototype.join.call(arguments, ' ')); }
function assert(cond, msg) { if (!cond) throw new Error('Annahme verletzt: ' + msg); }
function test(name, fn) {
  if (filter && name.toLowerCase().indexOf(filter.toLowerCase()) < 0) return;
  console.log('\n=== ' + name);
  const t0 = Date.now();
  try { fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log('  BESTANDEN (' + (Date.now() - t0) + ' ms)'); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, err: e }); console.log('  FEHLGESCHLAGEN: ' + (e && e.stack || e)); }
}
function run(sim, n) { for (let i = 0; i < n; i++) sim.tick(); }
// Ereignisse aus: die Tests prüfen Industrie isoliert (der Dauerlauf läuft mit allen Gesetzen)
const LAWS = { govChanges: false, wars: false, disasters: false, newRealms: false, events: false };
const facs = (sim, c) => WW.Industry.factories(sim, c);
function sumPol(sim) { let s = 0; for (const v of sim.state.pollution) s += v; return s; }
function woodNear(sim, c, r) {
  const st = sim.state; let n = 0;
  for (let y = Math.max(0, c.cy - r); y <= Math.min(st.H - 1, c.cy + r); y++) for (let x = Math.max(0, c.cx - r); x <= Math.min(st.W - 1, c.cx + r); x++)
    if (WW.TERRAIN_LUT.wood[st.terrain[y * st.W + x]]) n++;
  return n;
}

// Eine Stadt mit Regierung gov; Siedler dazu, damit Arbeiter da sind; n fertige Fabriken direkt gesetzt
function factoryCity(gov, o) {
  o = o || {};
  const sim = WW.Sim.create({ seed: o.seed || 11, width: 96, height: 64, populate: 1, govs: [gov], races: [o.race || 'human'], animals: o.animals,
    laws: Object.assign({}, LAWS, o.laws || {}) });
  sim._throwErrors = true;
  run(sim, 200);
  const c = sim.state.cities[0];
  sim.actions.spawnSettlers(c.cx + 2, c.cy + 2, o.settlers || 30, null, o.race || 'human');
  run(sim, 41);
  if (o.waitWall) for (let i = 0; i < 3000 && !(c.wall.plan && c.wall.plan.length); i++) sim.tick();
  const list = [];
  for (let i = 0; i < (o.n == null ? 1 : o.n); i++) {
    const s = WW.Industry.tryBuild(sim, c, true);
    if (s) { WW.Structs.complete(sim, s); list.push(s); }
  }
  WW.Cities.refreshLists(sim, c);
  return { sim, c, k: sim._kingdoms.get(c.kingdomId), list };
}

// -----------------------------------------------------------------------------
test('1 Wer baut Fabriken (von selbst ab Stadtgröße) – und wer nie', function () {
  const govs = ['communism', 'fascism', 'republic', 'democracy', 'tribe', 'anarchy', 'theocracy', 'communism'];
  const races = ['human', 'human', 'human', 'human', 'human', 'human', 'human', 'elf'];
  const sim = WW.Sim.create({ seed: 7, size: 'medium', populate: 8, govs, races, laws: LAWS });
  sim._throwErrors = true;
  const firstAt = {};
  const tb = WW.Industry.tryBuild;
  let placed = 0;
  WW.Industry.tryBuild = function (s, c, f) {
    const r = tb(s, c, f);
    if (r) { placed++; WW.Structs.forTiles(s, r, (i) => assert(s.state.inRing[i] === -1, 'Fabrik im Mauerring geplant')); }
    return r;
  };
  try {
  for (let t = 1; t <= 36000; t++) {
    sim.tick();
    if (t % 480 === 0) for (const s of sim.state.structs) if (!s.dead && s.type === 'factory') {
      const c = sim._cities.get(s.cityId); const k = c && sim._kingdoms.get(c.kingdomId);
      if (k && firstAt[k.id] == null) { firstAt[k.id] = { year: sim.state.year, tier: c.tier, pop: c.pop, gov: k.gov, race: c.race }; }
    }
  }
  } finally { WW.Industry.tryBuild = tb; }
  log('geplante Fabriken', placed, '(alle außerhalb des Rings)');
  const byGov = {};
  for (const k of sim.state.kingdoms) {
    const cs = k.cityIds.map((id) => sim._cities.get(id)).filter(Boolean);
    const nf = cs.reduce((a, c) => a + facs(sim, c).length, 0);
    const maxTier = cs.reduce((a, c) => Math.max(a, c.tier), 0);
    log(k.gov.padEnd(10), k.race.padEnd(6), 'Städte', cs.length, 'max. Stufe', maxTier, 'Fabriken', nf, firstAt[k.id] ? 'erste im Jahr ' + firstAt[k.id].year + ' (Stufe ' + firstAt[k.id].tier + ')' : '');
    const key = k.gov + (k.race === 'elf' ? '/elf' : '');
    byGov[key] = byGov[key] || { nf: 0, tier: 0 };
    byGov[key].nf += nf; byGov[key].tier = Math.max(byGov[key].tier, maxTier);
    if (firstAt[k.id]) assert(firstAt[k.id].tier >= 2, 'Fabrik vor Stadtgröße bei ' + k.gov);
    if (!WW.INDUSTRY.GOVS[k.gov] || k.race === 'elf') assert(nf === 0, k.gov + '/' + k.race + ' baut Fabriken');
  }
  let built = 0;
  for (const g of ['communism', 'fascism', 'republic']) if (byGov[g] && byGov[g].tier >= 2) { assert(byGov[g].nf > 0, g + ' (Stadt) ohne Fabrik'); built++; }
  assert(built >= 2, 'zu wenige Industrie-Reiche wurden Stadt: ' + built);
  // erzwungen: nie bei Stamm, Anarchie, Theokratie, Elfen, Froschlingen
  for (const g of ['tribe', 'anarchy', 'theocracy']) assert(!factoryCity(g, { n: 1 }).list.length, g + ' baut erzwungen');
  assert(!factoryCity('communism', { race: 'elf', n: 1 }).list.length, 'Elfen bauen');
  assert(!factoryCity('fascism', { race: 'frog', n: 1 }).list.length, 'Froschlinge bauen');
  const ev = sim.state.events.filter((e) => /^ind/.test(e.type));
  for (const e of ev.slice(0, 6)) log('Chronik:', e.text, '[' + e.effectText + ']');
});

// -----------------------------------------------------------------------------
test('2 Verschmutzung steigt, driftet mit dem Wind, Wolke sinkt nach Stilllegung', function () {
  const { sim, c, k, list } = factoryCity('communism', { n: 2 });
  assert(list.length === 2, 'keine Fabriken gesetzt');
  const st = sim.state, d = WW.Industry.dims(st);
  assert(d.cell === 4 && st.pollution.length === d.pw * d.ph, 'Rastergröße');
  const centroid = () => {
    let sx = 0, sw = 0;
    for (let i = 0; i < st.pollution.length; i++) { const v = st.pollution[i]; sx += ((i % d.pw) + 0.5) * d.cell * v; sw += v; }
    return sw ? sx / sw : 0;
  };
  const fx = list.reduce((a, s) => a + s.x + s.w - 0.5, 0) / list.length;
  const setWind = (dir) => { st.wind.dir = dir; st.wind.dx = WW.Cities.DIRS16[dir][0]; st.wind.dy = WW.Cities.DIRS16[dir][1]; st.wind.str = 1; };
  let smoke = 0;
  for (let i = 0; i < 480; i++) { setWind(0); sim.tick(); for (const f of sim.drainFx()) if (f.type === 'smokeplume') smoke++; }
  assert(list.every((s) => s.active), 'Fabriken nicht aktiv');
  const s1 = sumPol(sim), cE = centroid();
  log('Summe nach 2 Jahren Ostwind', s1, 'Schwerpunkt x', cE.toFixed(1), 'Schlote x', fx.toFixed(1), 'Rauchfahnen', smoke, 'city.pollution', c.pollution);
  assert(s1 > 200, 'Verschmutzung steigt nicht');
  assert(smoke > 20, 'keine smokeplume-Fx');
  assert(cE > fx + 1, 'Wolke driftet nicht nach Osten');
  for (let i = 0; i < 480; i++) { setWind(8); sim.tick(); }
  const cW = centroid();
  log('nach 2 Jahren Westwind: Schwerpunkt x', cW.toFixed(1));
  assert(cW < cE - 2 && cW < fx, 'Wolke driftet nicht nach Westen');
  assert(c.pollution > 0 && k.pollution > 0, 'Kennzahlen fehlen');
  // Stilllegung durch Regierungswechsel
  sim.actions.setGovernment(k.id, 'theocracy');
  run(sim, 80);
  assert(list.every((s) => !s.active && s.closed > 0), 'nicht stillgelegt');
  assert(st.events.some((e) => e.type === 'indClose'), 'keine Chronik zur Stilllegung');
  const s2 = sumPol(sim);
  run(sim, 480);
  const s3 = sumPol(sim);
  log('nach Stilllegung', s2, '-> nach 2 Jahren', s3);
  assert(s3 < s2 * 0.3, 'Luft wird nach Stilllegung nicht sauber');
  let ruins = 0;
  for (let i = 0; i < 240 && !ruins; i++) { sim.tick(); ruins = st.structs.filter((s) => !s.dead && s.type === 'ruin' && s.ruinOf === 'factory').length; }
  assert(list.every((s) => s.dead), 'stillgelegte Fabriken verfallen nicht');
  assert(ruins > 0 && st.events.some((e) => e.type === 'indRuin'), 'keine Ruinen: ' + ruins + ' ' + st.events.filter((e) => /^ind/.test(e.type)).map((e) => e.type));
  log('Ruinen-Kacheln', ruins);
});

// -----------------------------------------------------------------------------
test('3 Regen und Frische Brise reinigen', function () {
  const { sim, list } = factoryCity('fascism', { n: 2 });
  run(sim, 720);
  const st = sim.state, s = list[0];
  const x = s.x + 1, y = s.y + 1;
  const local = () => { let v = 0; for (let dy = -4; dy <= 4; dy += 4) for (let dx = -4; dx <= 4; dx += 4) v += WW.Industry.at(st, x + dx, y + dy); return v; };
  const a = local();
  sim.actions.strike(x, y, 'rain');
  const b = local();
  for (let i = 0; i < 200; i++) sim.tick();
  const c = local();
  sim.actions.strike(x, y, 'breeze');
  const d = local();
  log('vor Regen', a, 'nach Regen', b, 'wieder', c, 'nach Brise', d);
  assert(a > 50 && b < a * 0.5, 'Regen reinigt nicht');
  assert(d < c * 0.25, 'Brise reinigt nicht');
});

// -----------------------------------------------------------------------------
test('4 Waldsterben: verschmutzte Stadt gegen saubere Vergleichsstadt (ohne Kahlschlag)', function () {
  // Vergleich: dieselbe Welt mit einer Regierung ohne Kahlschlag (Monarchie: nature 'use'), Industrie aus
  const A = factoryCity('communism', { seed: 17, n: 3, settlers: 40 });
  const B = factoryCity('monarchy', { seed: 17, n: 3, settlers: 40, laws: { industry: false } });
  assert(A.list.length === 3 && B.list.length === 0, 'Aufbau: ' + A.list.length + '/' + B.list.length);
  // Wald im Umkreis 14 um das Fabrikviertel (in der Vergleichswelt dieselbe Stelle, nur ohne Fabriken)
  const F = { cx: Math.round(A.list.reduce((a, s) => a + s.x, 0) / 3), cy: Math.round(A.list.reduce((a, s) => a + s.y, 0) / 3) };
  const w0 = woodNear(A.sim, F, 14), v0 = woodNear(B.sim, F, 14);
  run(A.sim, 2400); run(B.sim, 2400);
  const w1 = woodNear(A.sim, F, 14), v1 = woodNear(B.sim, F, 14);
  let dead = 0; for (let i = 0; i < A.sim.state.cleared.length; i++) if (A.sim.state.cleared[i] > 0) dead++;
  log('Wald verschmutzt', w0, '->', w1, '| sauber', v0, '->', v1, '| Kacheln mit Stümpfen', dead, '| murk', A.sim.state.industry.murk);
  assert(w1 < v1 * 0.85 && v1 - w1 >= 8, 'Waldanteil sinkt nicht messbar');
  assert(A.sim.state.events.some((e) => e.type === 'indTrees' || e.type === 'indHaze'), 'keine Chronik zu Dunst/Waldsterben');
});

// -----------------------------------------------------------------------------
test('5 Filter halbieren den Ausstoß', function () {
  const mk = (filt) => { const o = factoryCity('republic', { seed: 31, n: 2 }); for (const s of o.list) s.filtered = filt; return o; };
  const A = mk(false), B = mk(true);
  assert(WW.Industry.emission(B.list[0]) * 2 === WW.Industry.emission(A.list[0]), 'Ausstoß nicht halbiert');
  run(A.sim, 720); run(B.sim, 720);
  const a = sumPol(A.sim), b = sumPol(B.sim);
  log('ohne Filter', a, 'mit Filter', b, 'Verhältnis', (b / a).toFixed(2));
  assert(b < a * 0.65 && b > a * 0.3, 'Filterwirkung falsch');
  // Demokratie beschließt Filter bei hoher Verschmutzung von selbst (oder mit Naturschutzgesetz)
  const C = factoryCity('democracy', { seed: 31, n: 2 });
  C.k.pollution = 40;
  run(C.sim, 1200);
  assert(C.list.some((s) => s.filtered), 'Demokratie baut keine Filter');
  assert(C.sim.state.events.some((e) => e.type === 'indFilter'), 'keine Chronik zum Filter');
  log('Filter:', C.sim.state.events.filter((e) => /indFilter/.test(e.type)).map((e) => e.text).join(' / '));
});

// -----------------------------------------------------------------------------
test('6 Wirkung über Mods: Gold/Stärke höher, Zufriedenheit/Ernte niedriger, Kranke, Säureregen, Nachbarn', function () {
  const M = WW.Mods;
  const R = factoryCity('republic', { n: 2 });
  run(R.sim, 120);
  const g = M.value(R.sim, R.k, R.c, 'gold', 1);
  const F = factoryCity('fascism', { n: 2 });
  run(F.sim, 120);
  const s = M.value(F.sim, F.k, F.c, 'strength', 1), so = M.value(F.sim, F.k, F.c, 'soldiers', 0.1);
  log('Gold ×', g.toFixed(2), '| Stärke ×', s.toFixed(2), '| Soldatenanteil', so.toFixed(2));
  assert(g > 1.2 && s > 1.1 && so > 0.1, 'Ertrags-Mods fehlen');
  // starke Verschmutzung: Kommunismus mit 4 Kombinaten
  const K = factoryCity('communism', { seed: 41, n: 4, settlers: 45 });
  let acid = 0;
  const st = K.sim.state;
  for (let i = 0; i < 4800; i++) { K.sim.tick(); for (const f of K.sim.drainFx()) if (f.type === 'acidrain') acid++; }
  const h = M.value(K.sim, K.k, K.c, 'happiness', 50), fo = M.value(K.sim, K.k, K.c, 'food', 1);
  const sick = st.units.filter((u) => !u.dead && u.sick).length;
  log('Kombinate', K.list.length, 'city.pollution', K.c.pollution, 'Zufriedenheit 50 ->', h.toFixed(1), 'Ernte ×', fo.toFixed(2), 'Kranke', sick, 'Säureregen-Fx', acid);
  assert(K.c.pollution >= 30, 'zu wenig Verschmutzung');
  assert(h < 45 && fo < 0.9, 'Folgen-Mods fehlen');
  assert(st.events.some((e) => e.type === 'indSick') || sick > 0, 'niemand wird krank');
  log('Chronik:', st.events.filter((e) => /^ind/.test(e.type)).map((e) => e.type).join(', '));
  // Nachbarn: zwei Reiche nah beieinander, eines qualmt
  const sim = WW.Sim.create({ seed: 5, width: 96, height: 64, populate: 0, laws: LAWS, animals: false });
  sim._throwErrors = true;
  const spots = [];
  for (let y = 8; y < 56 && spots.length < 400; y += 2) for (let x = 8; x < 88; x += 2) if (WW.Cities.canFoundAt(sim, x, y, 'human', 0)) spots.push([x, y]);
  let pa = null, pb = null;
  for (const p of spots) for (const q of spots) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (!pa && d >= 26 && d <= 40) { pa = p; pb = q; } }
  assert(pa, 'keine zwei Bauplätze');
  const a = sim.actions.spawnSettlers(pa[0], pa[1], 30, 'communism', 'human');
  const b = sim.actions.spawnSettlers(pb[0], pb[1], 10, 'monarchy', 'elf');
  assert(a && b, 'Siedler');
  run(sim, 300);
  const ka = sim._kingdoms.get(a.kingdomId), kb = sim._kingdoms.get(b.kingdomId);
  const r0 = kb.relations[ka.id] ? kb.relations[ka.id].opinion : null;
  ka.pollution = 60;
  const save = WW.Industry.tick;
  // Kennzahl festhalten: nur die jährliche Nachbarprüfung soll zählen
  WW.Industry.tick = function (s) { save(s); ka.pollution = 60; };
  try { run(sim, 480); } finally { WW.Industry.tick = save; }
  const r1 = kb.relations[ka.id] ? kb.relations[ka.id].opinion : null;
  log('Meinung der Elfen über das Qualmreich', r0, '->', r1);
  assert(r0 != null && r1 < r0 - 5, 'Elfen nehmen es nicht übel');
});

// -----------------------------------------------------------------------------
test('7 Speichern/Laden, Determinismus, alte Spielstände', function () {
  const mk = () => factoryCity('communism', { seed: 13, n: 2 });
  const A = mk(), B = mk();
  run(A.sim, 900); run(B.sim, 900);
  assert(A.sim.hash() === B.sim.hash(), 'nicht deterministisch');
  assert(sumPol(A.sim) > 0, 'keine Verschmutzung');
  { const sv = A.sim.serialize(); assert(WW.Sim.load(sv).serialize() === sv, 'Laden ist nicht formstabil'); }
  const L = WW.Sim.load(A.sim.serialize());
  assert(L, 'Laden fehlgeschlagen');
  assert(L.state.pollution.length === A.sim.state.pollution.length && L.state.pollution.every((v, i) => v === A.sim.state.pollution[i]), 'Raster pollution nicht gespeichert');
  assert(L.state.murk.length === L.state.W * L.state.H, 'murk');
  assert(L.state.wind.dir === A.sim.state.wind.dir, 'Wind');
  run(A.sim, 1200); run(L, 1200);
  assert(A.sim.hash() === L.hash(), 'Laden und Weiterlaufen weicht ab');
  // alter Spielstand ohne Industrie-Felder
  const o = JSON.parse(B.sim.serialize());
  delete o.rasters.pollution; delete o.rasters.murk; delete o.rasters.barren; delete o.wind; delete o.industry; delete o.laws.industry;
  o.structs = o.structs.filter((s) => s.type !== 'factory');
  for (const c of o.cities) { delete c.pollution; delete c.indActive; delete c.indNext; c.mods = (c.mods || []).filter((m) => !/^industry/.test(m.source)); }
  for (const k of o.kingdoms) delete k.pollution;
  const O = WW.Sim.load(JSON.stringify(o));
  assert(O, 'alter Spielstand lädt nicht');
  O._throwErrors = true;
  WW.Structs.rebuildBlock && WW.Structs.rebuildBlock(O);
  run(O, 600);
  assert(O.state.laws.industry === true && O.state.pollution instanceof Uint8Array && O.state.cities.every((c) => typeof c.pollution === 'number'), 'Felder nicht ergänzt');
});

// -----------------------------------------------------------------------------
test('9 Dunstglocke, ausgelaugter Boden, Heilung; Filter klar weniger', function () {
  const T = WW.T;
  const A = factoryCity('communism', { seed: 23, n: 3, waitWall: true });
  const st = A.sim.state;
  const ash0 = st.terrain.filter((t) => t === T.ASH).length;
  let maxP = 0;
  const ps = [];
  let coalYears = 0;
  for (let y = 0; y < 10; y++) { run(A.sim, 240); ps.push(A.c.pollution); maxP = Math.max(maxP, A.c.pollution); if (A.list.some((s) => s.coal)) coalYears++; }
  const barrenSum = () => { let n = 0; for (const v of st.barren) n += v; return n; };
  let grey = 0; for (const v of st.barren) if (v >= 64) grey++;
  const ash1 = st.terrain.filter((t) => t === T.ASH).length;
  const b1 = barrenSum();
  // Obergrenze: deutlich, aber nicht gesättigt. Seit es Rohstoffe gibt, fördert die Stadt Kohle; Kohle-Fabriken stoßen
  // ×COAL_EMIT aus (Regel, gewollt) – dann darf der Gipfel entsprechend höher liegen, bleibt aber unter der Sättigung 100.
  const top = coalYears ? Math.min(99, Math.round(90 * WW.INDUSTRY.CFG.COAL_EMIT)) : 90;
  log('city.pollution je Jahr', ps.join(','), '| Jahre mit Kohle', coalYears, '(Obergrenze ' + top + ') | graue Kacheln', grey, '| Aschefeld', ash0, '->', ash1);
  assert(maxP >= 40 && maxP <= top && ps[9] >= 35, 'keine deutliche Dunstglocke');
  assert(grey >= 30, 'Boden wird nicht grau');
  assert(ash1 > ash0, 'kein kahles Land');
  assert(st.events.some((e) => e.type === 'indHaze'), 'keine Chronik zur Dunstglocke');
  // Stilllegen: Luft und Boden heilen
  A.sim.actions.setLaw('industry', false);
  run(A.sim, 240 * 10);
  const b2 = barrenSum();
  log('Boden-Summe', b1, '-> nach 10 sauberen Jahren', b2, '| city.pollution', A.c.pollution);
  assert(A.c.pollution < 10 && b2 < b1 * 0.5, 'Boden/Luft heilen nicht');
  // Filter: klar weniger Dunst
  const mk = (f) => { const o = factoryCity('republic', { seed: 23, n: 3, waitWall: true }); for (const s of o.list) s.filtered = f; let sum = 0; for (let y = 0; y < 8; y++) { run(o.sim, 240); sum += o.c.pollution; } return sum / 8; };
  const pu = mk(false), pf = mk(true);
  log('mittlere city.pollution ohne Filter', pu.toFixed(1), 'mit Filter', pf.toFixed(1));
  assert(pu >= 35 && pf < pu * 0.65, 'Filter wirken nicht klar');
});

// -----------------------------------------------------------------------------
test('10 Flusstrübung nur stromabwärts, ein Stück ins Meer', function () {
  const W = 64, H = 80, N = W * H, T = WW.T;
  const terrain = new Uint8Array(N).fill(T.GRASS), height = new Uint8Array(N).fill(130);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (y >= 56) { terrain[i] = T.WATER; height[i] = 80; }
    else if (x === 30) { terrain[i] = T.RIVER; height[i] = 150 - y; }   // fließt nach Süden ins Meer
    else height[i] = 160 - y;
  }
  const sim = WW.Sim.create({ seed: 2, world: { W, H, terrain, height }, populate: 0, animals: false });
  sim._throwErrors = true;
  const st = sim.state, d = WW.Industry.dims(st);
  for (let t = 0; t < 900; t++) {
    for (let cy = 5; cy <= 6; cy++) for (let cx = 6; cx <= 8; cx++) st.pollution[cy * d.pw + cx] = 150;   // Wolke über y 20..27
    st.industry.any = 1000;
    sim.tick();
  }
  const m = (y) => st.murk[y * W + 30];
  let up = 0, downN = 0, sea = 0, far = 0;
  for (let y = 0; y < 18; y++) up += m(y);
  for (let y = 30; y < 56; y++) if (m(y) > 0) downN++;
  for (let y = 56; y < 60; y++) for (let x = 28; x <= 32; x++) if (st.murk[y * W + x]) sea++;
  for (let y = 70; y < H; y++) for (let x = 0; x < W; x++) far += st.murk[y * W + x];
  log('oberhalb', up, '| trübe Kacheln unterhalb', downN, '/ 26 | Meer an der Mündung', sea, '| fernes Meer', far, '| murk-Zähler', st.industry.murk);
  assert(up === 0, 'Trübung fließt bergauf');
  assert(downN >= 20, 'Trübung kommt nicht stromabwärts an');
  assert(sea > 0 && far === 0, 'Meer an der Mündung nicht/zu weit trüb');
  // ohne Wolke klingt sie ab
  st.pollution.fill(0);
  run(sim, 2400);
  assert(st.industry.murk === 0, 'Trübung klingt nicht ab');
});

// -----------------------------------------------------------------------------
test('11 Kohle: fehlt, 0 oder vorhanden – Fabriken laufen mit Kohle stärker', function () {
  const o = factoryCity('republic', { seed: 11, n: 2 });
  const sk = WW.Cities.stock(o.sim, o.c);
  delete sk.coal; run(o.sim, 120);
  const g0 = WW.Mods.value(o.sim, o.k, o.c, 'gold', 1);
  sk.coal = 0; run(o.sim, 120);
  const g1 = WW.Mods.value(o.sim, o.k, o.c, 'gold', 1);
  sk.coal = 100; run(o.sim, 120);
  const g2 = WW.Mods.value(o.sim, o.k, o.c, 'gold', 1);
  log('Gold × ohne Feld', g0.toFixed(2), '| coal 0', g1.toFixed(2), '| mit Kohle', g2.toFixed(2), '| Kohle übrig', sk.coal);
  assert(g0 > 1 && Math.abs(g0 - g1) < 1e-9, 'ohne Kohle anders');
  assert(g2 > g1 * 1.05 && sk.coal < 100 && o.list.some((s) => s.coal), 'Kohle wirkt nicht');
});

// -----------------------------------------------------------------------------
test('8 Dauerlauf 40 000 Ticks (gemischte Regierungen) und Zeitaufschlag', function () {
  const sim = WW.Sim.create({ seed: 3, size: 'small', populate: 5, govs: ['communism', 'fascism', 'republic', 'democracy', 'monarchy'] });
  sim._throwErrors = true;
  const orig = WW.Industry.tick;
  let ns = 0n;
  WW.Industry.tick = function (s) { const t0 = process.hrtime.bigint(); orig(s); ns += process.hrtime.bigint() - t0; };
  const t0 = Date.now();
  let maxF = 0, maxP = 0;
  try {
    for (let t = 1; t <= 40000; t++) {
      sim.tick();
      if (t % 1000 === 0) {
        const st = sim.state;
        let nf = 0;
        for (const s of st.structs) if (!s.dead && s.type === 'factory') {
          nf++;
          WW.Structs.forTiles(sim, s, (i) => assert(st.structAt[i] === s.id, 'structAt Fabrik'));
          assert(WW.INDUSTRY.KINDS[s.kind], 'kind');
        }
        maxF = Math.max(maxF, nf);
        for (const c of st.cities) { assert(c.pollution >= 0 && c.pollution <= 100, 'city.pollution'); maxP = Math.max(maxP, c.pollution); }
        for (const k of st.kingdoms) assert(k.pollution >= 0 && k.pollution <= 100, 'kingdom.pollution');
        assert(isFinite(st.wind.dx) && isFinite(st.wind.dy), 'Wind');
        sim.drainFx(); sim.drainDirtyTiles();
      }
    }
  } finally { WW.Industry.tick = orig; }
  const ms = Number(ns) / 1e6 / 40000;
  log('Jahre', sim.state.year, 'max. Fabriken', maxF, 'max. city.pollution', maxP, 'Laufzeit', ((Date.now() - t0) / 1000).toFixed(1) + ' s',
    'Industrie-Anteil', ms.toFixed(4), 'ms/Tick');
  assert(maxF > 0, 'keine Fabriken im Dauerlauf');
  assert(ms < 0.1, 'Zeitaufschlag zu hoch: ' + ms.toFixed(4) + ' ms/Tick');
});

// -----------------------------------------------------------------------------
test('12 Kachel-Meldungen nur bei sichtbarer Änderung (barren 0/85/170, murk 8er, soot an/aus)', function () {
  const A = factoryCity('communism', { seed: 23, n: 3, waitWall: true });
  const sim = A.sim, st = sim.state, N = st.W * st.H, h = WW.INDUSTRY.CFG.BARREN_HYST;
  run(sim, 240 * 3);
  // Ruß liegt an den Fabriken
  assert(st.soot && st.industry.soot > 0, 'keine Rußschicht');
  const lv = (v) => v > 170 ? 3 : v > 85 ? 2 : v > 0 ? 1 : 0;
  const vis = (i) => lv(st.barren[i]) | ((st.murk[i] >> 3) << 2) | ((st.soot[i] > 0 ? 1 : 0) << 10);
  // „gezeichneter" Stand: wird nur bei Meldung aufgefrischt (wie der Renderer)
  sim.drainDirtyTiles();
  const drawn = new Int32Array(N); for (let i = 0; i < N; i++) drawn[i] = vis(i);
  const ch = new Set(), marked = new Set(), ter0 = st.terrain.slice();
  let pb = st.barren.slice(), pm = st.murk.slice();
  // nur Meldungen der Industrie zählen (andere Quellen: Bauten, Feuer …)
  const md = sim.markDirty, it = WW.Industry.tick; let inInd = false;
  sim.markDirty = function (i) { if (inInd) marked.add(i); return md.call(this, i); };
  WW.Industry.tick = function (s) { inInd = true; try { return it(s); } finally { inInd = false; } };
  try {
  for (let t = 0; t < 400; t++) {
    sim.tick();
    for (const i of sim.drainDirtyTiles()) drawn[i] = vis(i);
    for (let i = 0; i < N; i++) if (st.barren[i] !== pb[i] || st.murk[i] !== pm[i]) ch.add(i);
    pb.set(st.barren); pm.set(st.murk);
  }
  } finally { WW.Industry.tick = it; delete sim.markDirty; }
  // Geländewechsel (Bäume sterben, Aschefeld) sind echte Änderungen und zählen nicht mit
  for (const i of [...marked]) if (st.terrain[i] !== ter0[i]) marked.delete(i);
  let stale = 0, bad = 0;
  for (let i = 0; i < N; i++) {
    if (drawn[i] === vis(i)) continue;
    stale++;
    const v = st.barren[i], near = Math.abs(v - 85) <= h + 1 || Math.abs(v - 170) <= h + 1;
    if (!near || (drawn[i] & ~3) !== (vis(i) & ~3)) bad++;
  }
  log('Kacheln mit geänderten Werten', ch.size, '| von der Industrie gemeldet', marked.size, '| veraltet gezeichnet', stale, 'davon außerhalb der Hysterese', bad);
  assert(ch.size > 40, 'zu wenig Bewegung für die Messung');
  assert(marked.size < ch.size * 0.6, 'zu viele Meldungen');
  assert(bad === 0, 'sichtbare Änderung nicht gemeldet');
  // Ruß speichern/laden, alte Stände ohne soot
  const txt = sim.serialize(), B = WW.Sim.load(txt);
  assert(B && B.serialize() === txt && B.state.soot.some((v) => v > 0), 'Ruß nicht gespeichert');
  const o = JSON.parse(txt); delete o.rasters.soot; if (o.industry) delete o.industry.soot;
  const O = WW.Sim.load(JSON.stringify(o));
  assert(O && O.state.soot instanceof Uint8Array && O.state.soot.length === N, 'alter Stand ohne Ruß-Raster');
  run(O, 240);
  assert(O.state.industry.soot > 0, 'Ruß entsteht nach dem Laden nicht neu');
  // stillgelegt: Ruß klingt ab
  sim.actions.setLaw('industry', false);
  run(sim, 240 * 14);
  assert(st.industry.soot === 0 && !st.soot.some((v) => v > 0), 'Ruß klingt nicht ab');
});

// -----------------------------------------------------------------------------
console.log('\n--- Ergebnis');
for (const r of results) console.log('  ' + (r.ok ? 'ok    ' : 'FEHLER') + '  ' + r.name + '  (' + (r.ms / 1000).toFixed(1) + ' s)' + (r.ok ? '' : '  -> ' + (r.err && r.err.message)));
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? '\n' + bad + ' Test(s) fehlgeschlagen.' : '\nAlle ' + results.length + ' Tests bestanden.');
process.exit(bad ? 1 : 0);
