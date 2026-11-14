// Tests der Lagerstädte und Kriegsgefangenen: node tests/camps.js [filter]
'use strict';
const fs = require('fs');
const path = require('path');
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
// „Sitzkrieg": Krieg auf dem Papier (für Gefangene), aber keine Heerzüge gegen die Städte der Gegenseite – sonst erobert
// das (seit 9.10 starke) Regime den Gegner, bevor der Test fertig ist. sim._sitz = [Reich-ID, …]
function run(sim, n) {
  for (let i = 0; i < n; i++) {
    sim.tick();
    if (sim._sitz && (sim.state.tick % 5) === 0) for (const u of sim.state.units) {
      if (u.dead || !u.order || u.order.city == null) continue;
      const c = sim._cities.get(u.order.city);
      if (c && sim._sitz.indexOf(c.kingdomId) >= 0 && sim._sitz.indexOf(u.kingdomId) >= 0) { u.order = null; u.path = null; u.breach = -1; }
    }
  }
}
const LAWS = { govChanges: false, wars: false, disasters: false, newRealms: false, events: false };
const TPY = WW.CONFIG.TPY;
// Zufallsereignisse nur dort, wo sie geprüft werden (sonst tauschen sich Testgefangene aus oder brechen zufällig aus)
const RAND = { EXCHANGE: WW.CAMPS.EXCHANGE, BREAKOUT: WW.CAMPS.BREAKOUT, RIOT: WW.CAMPS.RIOT, UPRISE: WW.CAMPS.UPRISE, ESCAPE: WW.CAMPS.ESCAPE };
for (const k in RAND) WW.CAMPS[k] = 0;
const campCities = (sim) => sim.state.cities.filter((c) => !c.dead && c.kind === 'camp');
const seeds = (sim) => sim.state.structs.filter((s) => !s.dead && s.type === 'laborcamp');
const prisoners = (sim) => sim.state.units.filter((u) => !u.dead && u.role === 'prisoner');
const structsOf = (sim, c, type) => sim.state.structs.filter((s) => !s.dead && s.cityId === c.id && s.type === type);
const evs = (sim, re) => sim.state.events.filter((e) => re.test(e.type));

// Eine Stadt mit gemischten Völkern auf Stadtgröße
function city(gov, o) {
  o = o || {};
  const sim = WW.Sim.create({ seed: o.seed || 9, width: 96, height: 64, populate: 1, govs: [gov], races: ['human'], animals: false, laws: Object.assign({}, LAWS, o.laws || {}) });
  sim._throwErrors = true;
  run(sim, 100);
  const c = sim.state.cities[0];
  for (const r of ['human', 'dwarf', 'orc', 'gnome']) sim.actions.spawnSettlers(c.cx + 2, c.cy + 2, 6, null, r);
  if (o.unhappy) WW.Mods.add(c, { key: 'happiness', add: -30, source: 'test', name: 'Test: Missstimmung' });
  return { sim, c, k: sim._kingdoms.get(c.kingdomId) };
}
function years(o, n, until) {
  for (let y = 0; y < n; y++) {
    if (o.c.pop < 24) o.sim.actions.spawnSettlers(o.c.cx + 2, o.c.cy + 2, 8, null, 'human');
    run(o.sim, TPY);
    if (until && until()) return y + 1;
  }
  return n;
}
// Lagerstadt erzwingen (Keimzelle setzen und fertigstellen), dann n Ticks laufen
function forceCamp(sim, k, n) {
  const have = campCities(sim).find((c) => c.kingdomId === k.id);
  if (have) { run(sim, n == null ? 130 : n); return have; }
  const s = seeds(sim).find((x) => x.campK === k.id) || WW.Camps.found(sim, k, null, true);
  assert(s, 'keine Keimzelle gesetzt');
  WW.Structs.complete(sim, s);
  run(sim, n == null ? 130 : n);
  const camp = campCities(sim).find((c) => c.kingdomId === k.id);
  assert(camp, 'Keimzelle wurde keine Lagerstadt');
  return camp;
}
// Zwei Reiche (Regime gov und Gegner other) im Krieg; Lagerstadt beim Regime fertig gebaut
function warWorld(gov, other, o) {
  o = o || {};
  const sim = WW.Sim.create({ seed: o.seed || 6, width: 128, height: 80, populate: 2, govs: [gov, other], races: ['human'], animals: false, laws: Object.assign({}, LAWS, { camps: false }) });
  sim._throwErrors = true;
  run(sim, 200);
  const [ca, cb] = sim.state.cities;
  for (const c of [ca, cb]) sim.actions.spawnSettlers(c.cx + 2, c.cy + 2, 26, null, 'human');
  run(sim, 1200);
  const A = sim._kingdoms.get(ca.kingdomId), B = sim._kingdoms.get(cb.kingdomId);
  if (o.sitz !== false) sim._sitz = [A.id, B.id];
  sim.actions.setLaw('camps', true);
  let camp = null;
  if (o.camp !== false && WW.CAMPS.GOVS[A.gov]) {
    camp = forceCamp(sim, A, 130);
    for (let i = 0; i < 40 && camp.wall.state !== 'done'; i++) run(sim, 120);
  }
  return { sim, A, B, ca, cb, camp };
}
// n Soldaten des Reichs home bei (x, y) aufstellen und von einem Soldaten von holder gefangen nehmen lassen
function takePows(sim, holder, home, n, frac) {
  const fr = frac == null ? 0.5 : frac;   // Ort des Gefechts zwischen den Hauptstädten (0 = Heimat, 1 = Halter)
  const hc = sim._cities.get(home.capitalId), ac = sim._cities.get(holder.capitalId);
  const att = WW.Units.create(sim, { x: hc.cx + (ac.cx - hc.cx) * fr, y: hc.cy + (ac.cy - hc.cy) * fr + 1, role: 'soldier', kingdomId: holder.id, cityId: ac.id, race: 'human' });
  const list = [];
  for (let i = 0; i < n; i++) {
    // Gefecht auf halbem Weg zwischen den Hauptstädten (Feldschlacht)
    const W0 = sim.state.W, f = WW.Path.nearestFree(sim, Math.floor(hc.cy + (ac.cy - hc.cy) * fr) * W0 + Math.floor(hc.cx + (ac.cx - hc.cx) * fr) + (i % 3), home.id, 8);
    const t = WW.Units.create(sim, { x: (f % W0) + 0.5, y: Math.floor(f / W0) + 0.5, role: 'soldier', kingdomId: home.id, cityId: hc.id, race: ['human', 'dwarf', 'orc', 'elf'][i % 4] });
    if (WW.Camps.capture(sim, att, t, { surrender: true })) list.push(t);
  }
  return list;
}
// Dichtigkeit des Zauns: Flutfüllung vom Lager aus (Zaun und Tor sperren wie für Fremde) erreicht den Kartenrand nicht
function fenceTight(sim, camp) {
  const st = sim.state, W = st.W, H = st.H, N = W * H;
  const seen = new Uint8Array(N), q = [camp.cy * W + camp.cx];
  seen[q[0]] = 1;
  const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
  const block = (i) => sim.block[i] > 0 || WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0;
  while (q.length) {
    const i = q.pop(), x = i % W, y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return false;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d], ny = y + DY[d], n = ny * W + nx;
      if (seen[n] || block(n)) continue;
      if (d >= 4 && (block(y * W + nx) || block(ny * W + x))) continue;   // kein Durchschlüpfen diagonal
      seen[n] = 1; q.push(n);
    }
  }
  return true;
}

// -----------------------------------------------------------------------------
test('1 Gründung nur mit Anlass und nur bei Regimen; Gesetz aus = keine', function () {
  for (const g of ['fascism', 'communism']) {
    const o = city(g, { unhappy: true });
    const y = years(o, 40, () => campCities(o.sim).length > 0);
    const camp = campCities(o.sim)[0];
    log(g, 'Lagerstadt nach', y, 'Jahren:', camp ? camp.name : '-', '| Mutterstadt Stufe', o.c.tier, 'Zufriedenheit', Math.round(o.c.happiness));
    assert(camp, g + ' gründet keine Lagerstadt');
    assert(evs(o.sim, /^campBuilt$/).length && evs(o.sim, /^campFounded$/).length, 'keine Chronik zur Gründung');
    const d = Math.hypot(camp.cx - o.c.cx, camp.cy - o.c.cy);
    assert(d >= WW.CAMPS.MIN_CAP_DIST, 'Lagerstadt zu nah an der Hauptstadt: ' + d.toFixed(1));
  }
  // ohne Anlass (zufriedene Stadt, kein Krieg, keine Rebellen): Kommunismus baut keine Lagerstadt …
  const calm = city('communism');
  WW.Mods.add(calm.c, { key: 'happiness', add: 60, source: 'test', name: 'Test: Feststimmung' });
  years(calm, 20);
  log('zufriedener Kommunismus: Zufriedenheit', Math.round(calm.c.happiness), 'Lagerstädte', campCities(calm.sim).length);
  assert(!campCities(calm.sim).length && !seeds(calm.sim).length, 'Kommunismus: Lagerstadt ohne Anlass');
  // … der Faschismus schon (eager: „wenn sie es können"), sobald Stufe, Platz und Vorräte reichen
  assert(WW.CAMPS.GOVS.fascism.eager && !WW.CAMPS.GOVS.communism.eager, 'Tabelle eager');
  const fx = city('fascism');
  WW.Mods.add(fx.c, { key: 'happiness', add: 60, source: 'test', name: 'Test: Feststimmung' });
  const yf = years(fx, 30, () => campCities(fx.sim).length > 0);
  log('zufriedener Faschismus: Lagerstadt nach', yf, 'Jahren, Zufriedenheit', Math.round(fx.c.happiness), '| Stufe', fx.c.tier);
  assert(campCities(fx.sim).length, 'Faschismus baut ohne Anlass keine Lagerstadt');
  const ins = prisoners(fx.sim);
  assert(ins.every((u) => u.pow >= 0 || u.origK === fx.k.id), 'Insassen falscher Herkunft');
  for (const g of ['tribe', 'democracy', 'monarchy', 'republic', 'theocracy', 'anarchy']) {
    const o = city(g, { unhappy: true });
    years(o, 15);
    assert(!campCities(o.sim).length && !seeds(o.sim).length, g + ' gründet ein Lager');
    assert(!WW.Camps.found(o.sim, o.k, null, true), g + ' kann erzwungen gründen');
  }
  const off = city('fascism', { unhappy: true, laws: { camps: false } });
  years(off, 20);
  assert(!campCities(off.sim).length && !seeds(off.sim).length, 'Gesetz aus, trotzdem Lager');
});

// -----------------------------------------------------------------------------
test('2 Aufbau: Kommandantur, Baracken, Wachtürme, Zaun dicht mit genau einem Tor, Wachen', function () {
  const W = warWorld('fascism', 'democracy', { seed: 6 });
  const camp = W.camp, sim = W.sim, st = sim.state;
  const hq = structsOf(sim, camp, 'camphq'), bar = structsOf(sim, camp, 'barrack'), tw = structsOf(sim, camp, 'watchtower');
  const gates = structsOf(sim, camp, 'gate'), fence = structsOf(sim, camp, 'wall');
  log('Lagerstadt', camp.name, 'bei', camp.cx + '/' + camp.cy, '| Kommandantur', hq.length, 'Baracken', bar.length, '(fertig', bar.filter((s) => s.built).length + ')',
    'Wachtürme', tw.length, 'Zaun', fence.length, 'Tore', gates.length, '| Zaun', camp.wall.state, camp.wall.built + '/' + camp.wall.total, '| Wachen', camp.guards + '/' + camp.guardsWant, 'Plätze', camp.cap);
  assert(camp.kind === 'camp' && camp.centerId === -1 && !structsOf(sim, camp, 'center').length, 'Lagerstadt hat ein Zentrum');
  assert(hq.length === 1 && hq[0].built && hq[0].x === camp.cx - 1 && hq[0].y === camp.cy - 1, 'Kommandantur fehlt/falsch');
  assert(bar.length >= 2 && bar.filter((s) => s.built).length >= 2 && camp.cap >= 8, 'Baracken fehlen');
  assert(tw.length === 2, 'Wachtürme fehlen');
  assert(gates.length === 1 && camp.wall.gates.length === 1, 'nicht genau ein Tor');
  assert(fence.every((s) => s.mat === 'fence' && s.level === 1) && gates[0].mat === 'fence', 'Zaun nicht im Stil fence');
  assert(camp.wall.style === 'fence' && camp.wall.state === 'done', 'Zaun nicht fertig');
  assert(fence.filter((s) => s.built).every((s) => s.maxHp === WW.CAMPS.FENCE_HP) && !fence.some((s) => s.device) && !structsOf(sim, camp, 'tower').length, 'Zaun: Haltbarkeit/Geräte/Türme falsch');
  assert(fenceTight(sim, camp), 'Zaun ist undicht');
  for (const s of hq.concat(bar, tw)) WW.Structs.forTiles(sim, s, (i) => assert(st.inRing[i] === camp.id, 'Bauwerk außerhalb des Zauns'));
  assert(camp.guards >= WW.CAMPS.GUARD_MIN, 'keine Wachen');
  assert(st.units.filter((u) => !u.dead && u.cityId === camp.id).every((u) => u.role === 'soldier'), 'Lagerstadt hat Familien/Bürger');
  // kein natürliches Wachstum, keine Häuser/Felder
  run(sim, TPY * 3);
  assert(!structsOf(sim, camp, 'house').length && !structsOf(sim, camp, 'field').length && !st.units.some((u) => !u.dead && u.cityId === camp.id && u.role === 'child'), 'Lagerstadt wächst wie eine Stadt');
  assert(camp.wall.style === 'fence' && camp.wall.level === 1, 'Zaun wurde ausgebaut');
  assert(evs(sim, /^campFence$/).length, 'keine Chronik zum Zaun');
});

// -----------------------------------------------------------------------------
test('3 Kriegsgefangene: Regime -> Lagerstadt (Zwangsarbeit), andere -> Gefangenenlager; ohne Strecke zu Fuß', function () {
  const W = warWorld('fascism', 'democracy', { seed: 6 });
  const sim = W.sim;
  sim.actions.setLaw('industry', false);   // keine Bahn: hier wird marschiert (Bahn: Test 11)
  sim.actions.setRelation(W.A.id, W.B.id, 'war');
  const p1 = takePows(sim, W.A, W.B, 5, 0.8);   // Faschismus nimmt gefangen (Gefecht nahe der eigenen Hauptstadt)
  const p2 = takePows(sim, W.B, W.A, 4);   // Demokratie nimmt gefangen
  assert(p1.length === 5 && p2.length === 4, 'Gefangennahme fehlgeschlagen');
  assert(p1.every((u) => u.camp === W.camp.id && u.pow === W.B.id && u.campState === 'march'), 'Kriegsgefangene des Regimes nicht zur Lagerstadt');
  const stk = sim._structs.get(p2[0].camp);
  assert(stk && stk.type === 'stockade' && sim._cities.get(stk.cityId).kingdomId === W.B.id && p2.every((u) => u.camp === stk.id && u.pow === W.A.id), 'Demokratie hält nicht im Gefangenenlager');
  assert(!WW.Units.hostile(sim, W.cb && { id: -9, role: 'soldier', kingdomId: W.B.id, dead: false }, p1[0]), 'Gefangene sind Angriffsziel');
  // sie marschieren (keine Teleportation): Weg wird Schritt für Schritt zurückgelegt
  const x0 = p1.map((u) => [u.x, u.y]);
  // Erlaubt: normale Schritte (< 0,5 Kacheln) und der Tor-Durchgang (ein Sprung über genau ein Tor, ≤ 3 Kacheln)
  let maxStep = 0, gateJumps = 0, badJump = 0;
  const Wd = sim.state.W;
  for (let t = 0; t < 40; t++) {
    const prev = p1.map((u) => [u.x, u.y]);
    sim.tick();
    p1.forEach((u, i) => {
      const d = Math.hypot(u.x - prev[i][0], u.y - prev[i][1]);
      if (d < 0.5) { maxStep = Math.max(maxStep, d); return; }
      // Sprung: liegt auf der Strecke ein Tor?
      let gate = false;
      for (let f = 0.1; f < 1; f += 0.1) { const s = sim._structs.get(sim.state.structAt[Math.floor(prev[i][1] + (u.y - prev[i][1]) * f) * Wd + Math.floor(prev[i][0] + (u.x - prev[i][0]) * f)]); if (s && s.type === 'gate' && s.built) gate = true; }
      if (gate && d <= 3) gateJumps++; else { badJump++; maxStep = Math.max(maxStep, d); }
    });
  }
  const moved = p1.filter((u, i) => Math.hypot(u.x - x0[i][0], u.y - x0[i][1]) > 0.3).length;
  log('nach 40 Ticks unterwegs', moved, '/ 5, größter Schritt', maxStep.toFixed(2), 'Kacheln, Tor-Durchgänge', gateJumps, ', andere Sprünge', badJump);
  assert(moved >= 4 && badJump === 0, 'Gefangene marschieren nicht zu Fuß');
  // sichtbare Begleitwache: echte Soldaten des Regimes laufen mit
  const escIds = [...new Set(p1.map((u) => u.escort).filter(Boolean))];
  const escs = escIds.map((id) => sim._units.get(id));
  log('Begleitwachen', escs.length, escs.map((e) => e.role + '/' + e.ind + '/Reich ' + e.kingdomId).join(', '));
  assert(escs.length >= 1 && escs.length <= 2 && escs.every((e) => e.role === 'soldier' && e.ind === 'escort' && e.kingdomId === W.A.id), 'keine Begleitwache');
  const e0 = escs.map((e) => [e.x, e.y]);
  let t = 0;
  for (; t < 3000 && !p1.every((u) => u.campState === 'held'); t += 20) run(sim, 20);
  log('Begleitwachen nach Ankunft:', escs.map((e, i) => (e.dead ? 'tot' : e.ind || 'frei') + ' ' + Math.round(Math.hypot(e.x - e0[i][0], e.y - e0[i][1])) + ' Kacheln gelaufen').join(', '));
  assert(escs.every((e) => e.dead || (e.ind !== 'escort' && e.role === 'soldier')), 'Begleitwache bleibt hängen');
  if (!p1.every((u) => u.campState === 'held')) log('Stand:', p1.map((u) => [u.dead ? 'tot' : u.role, u.campState, u.x.toFixed(1), u.y.toFixed(1), u.fails, u.path ? u.path.length : '-'].join(' ')).join(' | '), 'Lager', W.camp.cx, W.camp.cy, W.camp.kind, '| Chronik', evs(sim, /^(pow|camp|peace|god)/).map((e) => e.year + ':' + e.type).join(','), '| B lebt', !!sim._kingdoms.get(W.B.id));
  log('angekommen nach', t, 'Ticks; Insassen', W.camp.inmates, 'davon Kriegsgefangene', W.camp.pows, '| Herkunft', JSON.stringify(W.camp.powFrom));
  assert(p1.every((u) => u.campState === 'held' && (u.work >= 0 || sim.state.inRing[Math.floor(u.y) * sim.state.W + Math.floor(u.x)] === W.camp.id)), 'nicht im Lager angekommen');
  run(sim, 130);
  log('Kennzahlen: Lager', W.camp.pows, JSON.stringify(W.camp.powFrom), '| A hält', W.A.powsHeld, 'verliert', W.A.powsLost, '| B hält', W.B.powsHeld, 'verliert', W.B.powsLost);
  assert(W.camp.pows >= 5 && W.camp.powFrom[W.B.id] >= 5 && W.A.powsHeld >= 5 && W.B.powsLost >= 5 && W.B.powsHeld >= 4 && W.A.powsLost >= 4, 'Kennzahlen falsch');
  assert(p2.every((u) => !u.dead && Math.hypot(u.x - stk.x - 1, u.y - stk.y - 1) < 3), 'Gefangene im Gefangenenlager laufen davon');
  // Frieden (sonst erobert das Regime im erzwungenen Krieg bald den Gegner); das Regime behält zwei Drittel im Lager
  sim.actions.setRelation(W.A.id, W.B.id, 'peace');
  const keptP = prisoners(sim).filter((u) => u.camp === W.camp.id && u.powUntil > 0);
  assert(keptP.length >= 3, 'Regime behält keine Kriegsgefangenen');
  // Zwangsarbeit: Ertrag geht in die Mutterstadt, niemand stirbt, Insassen bleiben im Zaun
  const home = sim._cities.get(W.camp.campHome);
  const sum = () => { const s = WW.Cities.stock(sim, home); return s.stone + s.wood; };
  const outOf = () => W.camp.campOut.stone + W.camp.campOut.wood + (W.camp.campOut.rail || 0) * 10;
  const s0 = sum(), out0 = outOf();
  run(sim, 1200);
  const out1 = outOf();
  log('Zwangsarbeit: Ertrag im Lager', out0, '->', out1, '| Lager der Mutterstadt', Math.round(s0), '->', Math.round(sum()));
  if (!(out1 > out0 + 5)) log('  Insassen:', keptP.map((u) => [u.campState, u.work, u.workT, (u.tx - u.x).toFixed(1), (u.ty - u.y).toFixed(1), u.moving ? 1 : 0, sim.state.inRing[Math.floor(u.y) * sim.state.W + Math.floor(u.x)] === W.camp.id ? 'in' : 'out', u.camp === W.camp.id].join(':')).join(' '), W.camp.kind, JSON.stringify(W.camp.campOut));
  assert(out1 > out0 + 5, 'keine Zwangsarbeit');
  assert(keptP.every((u) => !u.dead && u.role === 'prisoner'), 'Gefangene gestorben');
  assert(keptP.every((u) => u.work >= 0 || sim.state.inRing[Math.floor(u.y) * sim.state.W + Math.floor(u.x)] === W.camp.id), 'Insasse läuft aus dem Zaun');
  assert(evs(sim, /^campPow$/).length && evs(sim, /^powTaken$/).length, 'keine Chronik zu Kriegsgefangenen');
});

// -----------------------------------------------------------------------------
test('4 Frieden: Demokratie gibt alle zurück, Regime nur einen Teil (Kriegsgrund), Rest nach Jahren; Heimkehr', function () {
  const W = warWorld('fascism', 'democracy', { seed: 6 });
  const sim = W.sim;
  sim.actions.setRelation(W.A.id, W.B.id, 'war');
  const p1 = takePows(sim, W.A, W.B, 6), p2 = takePows(sim, W.B, W.A, 4);
  run(sim, 600);
  const hB = WW.Mods.value(sim, W.B, W.cb, 'happiness', 50);
  // alle Kriegsgefangenen (auch die aus echten Gefechten während des Laufs)
  const heldBy = (k, home) => prisoners(sim).filter((u) => u.pow === home.id && u.campState !== 'home' && (WW.Camps.holdOf(sim, u) || {}).id != null);
  const allB = heldBy(W.A, W.B), allA = heldBy(W.B, W.A);
  sim.actions.setRelation(W.A.id, W.B.id, 'peace');
  const homeA = allA.filter((u) => u.campState === 'home').length, homeB = allB.filter((u) => u.campState === 'home').length;
  const kept = allB.filter((u) => u.powUntil > 0);
  log('Frieden: Demokratie lässt', homeA, '/', allA.length, 'frei; Regime lässt', homeB, '/', allB.length, 'frei, behält', kept.length, 'bis Jahr', kept.length ? kept[0].powUntil : '-');
  assert(allA.length >= 4 && homeA === allA.length, 'Demokratie gibt nicht alle zurück');
  assert(homeB >= 1 && homeB < allB.length && kept.length === allB.length - homeB && homeB <= Math.ceil(allB.length * 0.4), 'Regime gibt nicht nur einen Teil zurück');
  assert(W.B.relations[W.A.id].grievance === 'liberation', 'kein Kriegsgrund „Befreiung"');
  assert(evs(sim, /^powReturn$/).length && evs(sim, /^powKept$/).length, 'keine Chronik zur Rückgabe');
  // Heimkehr: laufen heim, werden wieder Soldaten der Heimat, Heimat freut sich
  let t = 0;
  for (; t < 6000 && allA.concat(allB.filter((u) => !(u.powUntil > 0))).some((u) => u.role === 'prisoner'); t += 40) run(sim, 40);
  const back = allA.filter((u) => !u.dead && u.role !== 'prisoner' && u.kingdomId === W.A.id).length;
  const backB = allB.filter((u) => !u.dead && u.role !== 'prisoner' && u.kingdomId === W.B.id).length;
  log('heimgekehrt nach', t, 'Ticks:', back, '/', allA.length, 'nach', W.ca.name + ',', backB, '/', homeB, 'nach', W.cb.name);
  assert(back === allA.length && backB === homeB, 'Kriegsgefangene kommen nicht heim');
  const hB2 = WW.Mods.value(sim, W.B, W.cb, 'happiness', 50);
  if (!(hB2 > hB)) log('  Mods Heimat', W.cb.name, (W.cb.mods || []).map((m) => m.source + ':' + m.key + ':' + (m.add || m.mul) + ':' + m.until).join(' '), '| Tick', sim.state.tick, '| Reich', (W.B.mods || []).length);
  // (der Gesamtwert schwankt mit anderen Mods – Verschmutzung, Kultur, Garnison –, daher den Heimkehr-Mod selbst prüfen)
  assert(((W.cb.mods || []).some((m) => m.source === 'powhome' && m.key === 'happiness' && m.add > 0 && (!m.until || m.until > sim.state.tick))), 'Heimat freut sich nicht');
  void hB2;
  // Rest nach Vertrag
  run(sim, TPY * (WW.CAMPS.KEEP_YEARS + 1));
  for (let i = 0; i < 60 && kept.some((u) => u.role === 'prisoner'); i++) run(sim, 100);
  log('nach', WW.CAMPS.KEEP_YEARS, 'Jahren: noch gefangen', kept.filter((u) => u.role === 'prisoner').length);
  assert(kept.every((u) => u.dead || u.role !== 'prisoner'), 'Rest wird nicht nach Jahren frei');
  assert(evs(sim, /^powHome$/).length, 'keine Chronik zur Heimkehr');
});

// -----------------------------------------------------------------------------
test('5 Gefangenenaustausch im Krieg', function () {
  const W = warWorld('fascism', 'democracy', { seed: 6 });
  const sim = W.sim;
  sim.actions.setRelation(W.A.id, W.B.id, 'war');
  const p1 = takePows(sim, W.A, W.B, 3), p2 = takePows(sim, W.B, W.A, 3);
  const old = WW.CAMPS.EXCHANGE;
  WW.CAMPS.EXCHANGE = 1;   // sicher auslösen
  try { run(sim, TPY + 10); } finally { WW.CAMPS.EXCHANGE = old; }
  const a = p1.filter((u) => u.campState === 'home' || u.role === 'soldier').length, b = p2.filter((u) => u.campState === 'home' || u.role === 'soldier').length;
  log('ausgetauscht (von den Testgefangenen)', a, 'gegen', b, '| Chronik', evs(sim, /^powExchange$/).map((e) => e.text).join(' / '));
  assert(a >= 2 && b >= 2 && evs(sim, /^powExchange$/).length, 'kein Austausch');
});

// -----------------------------------------------------------------------------
test('6 Lageraufstand bei zu wenigen Wachen: freie Stadt mit eigenem Reich, niemand stirbt', function () {
  WW.CAMPS.UPRISE = RAND.UPRISE; WW.CAMPS.RIOT = RAND.RIOT;
  try { uprisingCase(); } finally { WW.CAMPS.UPRISE = 0; WW.CAMPS.RIOT = 0; }
});
function uprisingCase() {
  const o = city('communism', { unhappy: true });
  years(o, 4);
  const camp = forceCamp(o.sim, o.k, 130);
  const sim = o.sim;
  for (let i = 0; i < 40 && camp.wall.state !== 'done'; i++) run(sim, 120);
  const cand = sim.state.units.filter((u) => !u.dead && u.cityId === o.c.id && u.role === 'farmer').slice(0, 10);
  for (const u of cand) WW.Camps.intern(sim, u, camp);
  // Wachen abziehen (an die Front) und keine neuen schicken
  const guards = () => sim.state.units.filter((u) => !u.dead && u.cityId === camp.id && u.role === 'soldier');
  const n0 = sim.state.units.filter((u) => !u.dead).length;
  let nk = null;
  for (let y = 0; y < 8 && !nk; y++) {
    for (let t = 0; t < TPY; t += 10) { for (const g of guards()) { g.cityId = o.c.id; g.order = { kind: 'home' }; } run(sim, 10); }
    if (camp.kind !== 'camp') nk = sim._kingdoms.get(camp.kingdomId);
  }
  const free = cand.filter((u) => !u.dead && u.role !== 'prisoner').length;   // (wer vorher beim Aufruhr entkam, ist auch frei)
  const stay = cand.filter((u) => !u.dead && u.role !== 'prisoner' && u.cityId === camp.id).length;
  log('Aufstand:', camp.name, 'ist', camp.kind, '| Reich', nk ? nk.name + ' (' + nk.gov + ')' : '-', '| frei', free, '/', cand.length + ', davon Bürger der neuen Stadt', stay, '| Einheiten', n0, '->', sim.state.units.filter((u) => !u.dead).length);
  assert(nk && nk.id !== o.k.id, 'kein eigenes Reich');
  assert(nk.gov === 'democracy' || nk.gov === 'anarchy', 'falsche Regierung: ' + nk.gov);
  assert(camp.kind === 'town' && camp.centerId >= 0 && !sim.state.structs.some((s) => !s.dead && s.cityId === camp.id && s.mat === 'fence'), 'Lager nicht zur Stadt geworden');
  if (!(free === cand.length && stay >= 3)) log('  Stand:', cand.map((u) => [u.dead ? 'tot' : u.role, u.campState, u.cityId, u.camp, (WW.Camps.holdOf(sim, u) || {}).type || (WW.Camps.holdOf(sim, u) || {}).kind].join('/')).join(' '));
  assert(cand.length >= 5 && free === cand.length && stay >= 3, 'Insassen nicht frei');
  assert(sim.state.structs.some((s) => !s.dead && s.type === 'memorial'), 'kein Mahnmal');
  assert(evs(sim, /^campUprising$/).length, 'keine Chronik zum Aufstand');
  assert(!sim._deaths || !(sim._deaths.camp > 0), 'Todesfälle im Lager');
}

// -----------------------------------------------------------------------------
function liberationCase(how) {
  const W = warWorld('fascism', 'democracy', { seed: 6 });
  const sim = W.sim, camp = W.camp, st = sim.state;
  sim.actions.setRelation(W.A.id, W.B.id, 'war');
  const pows = takePows(sim, W.A, W.B, 4);
  run(sim, 300);   // (nicht bis zur Ankunft warten: im erzwungenen Krieg erobert das Regime sonst womöglich den Gegner)
  assert(!W.B.dead && sim._kingdoms.get(W.B.id), 'Gegner untergegangen');
  const home = sim._cities.get(camp.campHome);
  const pol = st.units.filter((u) => !u.dead && u.cityId === home.id && u.role === 'farmer').slice(0, 3);
  for (const u of pol) WW.Camps.intern(sim, u, camp);
  const hHome = WW.Mods.value(sim, W.B, W.cb, 'happiness', 50);
  if (how === 'conquest') WW.Cities.transferCity(sim, camp, W.B.id);
  else if (how === 'gov') sim.actions.setGovernment(W.A.id, 'democracy');
  else sim.actions.setLaw('camps', false);
  run(sim, 130);
  const owner = sim._kingdoms.get(camp.kingdomId);
  const goingHome = pows.filter((u) => u.campState === 'home' || (u.role === 'soldier' && u.kingdomId === W.B.id)).length;
  const citizens = pol.filter((u) => !u.dead && u.role !== 'prisoner' && u.cityId === camp.id).length;
  const mem = st.structs.find((s) => !s.dead && s.type === 'memorial');
  log(how + ':', camp.name, 'ist', camp.kind, '(' + (owner ? owner.gov : '-') + ') | Kriegsgefangene auf dem Heimweg', goingHome, '/ 4 | politische Gefangene frei', citizens, '/ 3 | Mahnmal', mem ? mem.campName : '-');
  assert(camp.kind === 'town' && camp.centerId >= 0, 'Lagerstadt nicht zur Stadt geworden (' + how + ')');
  assert(!st.structs.some((s) => !s.dead && s.cityId === camp.id && (s.type === 'barrack' || s.type === 'camphq' || s.type === 'watchtower' || s.mat === 'fence')), 'Lagerbauten bleiben stehen');
  assert(mem && mem.cityId === -1 && mem.campName === camp.name, 'kein Mahnmal');
  assert(goingHome === 4 || how === 'conquest', 'Kriegsgefangene gehen nicht heim');
  if (how === 'conquest') assert(pows.every((u) => u.role !== 'prisoner' || u.campState === 'home'), 'Kriegsgefangene bei Eroberung nicht frei');
  if (citizens !== pol.length) log('  politische:', pol.map((u) => [u.dead ? 'tot' : u.role, u.cityId, u.kingdomId, u.campState].join('/')).join(' '), 'Stadt', camp.id);
  assert(pol.length >= 2 && citizens === pol.length, 'politische Gefangene nicht frei');
  assert(evs(sim, /^campLiberated$/).length, 'keine Chronik zur Befreiung');
  // Frieden schließen, damit der Heimweg nicht vom weiterlaufenden Krieg (Eroberungen) gestört wird
  if (sim._kingdoms.get(W.A.id) && W.A.relations[W.B.id]) sim.actions.setRelation(W.A.id, W.B.id, 'peace');
  for (let t = 0; t < 8000 && pows.some((u) => u.role === 'prisoner'); t += 50) run(sim, 50);
  const back = pows.filter((u) => u.role !== 'prisoner' && u.kingdomId === W.B.id).length;   // (daheim dürfen sie wieder in den Krieg ziehen)
  log('  heimgekehrt', back, '/ 4 | Zufriedenheit-Mod Heimat', hHome.toFixed(1), '->', WW.Mods.value(sim, W.B, W.cb, 'happiness', 50).toFixed(1));
  if (back !== 4) log('  Kriegsgefangene:', pows.map((u) => [u.dead ? 'tot' : u.role, u.kingdomId, u.cityId, u.campState, u.x.toFixed(0) + '/' + u.y.toFixed(0)].join(' ')).join(' | '), 'B', W.B.id);
  assert(back === 4, 'Heimkehr fehlt (' + how + ')');
  assert(((W.cb.mods || []).some((m) => m.source === 'powhome' && m.key === 'happiness' && m.add > 0 && (!m.until || m.until > sim.state.tick))), 'Heimat freut sich nicht');
  const k = W.A;
  assert(!WW.Camps.campsOf(sim, k).length && !(sim._cities.get(k.capitalId).mods || []).some((m) => m.source === 'camp'), 'Folgen des Lagers bleiben');
}
test('7a Befreiung durch Eroberung: Heimkehr, freie Bürger, Mahnmal', function () { liberationCase('conquest'); });
test('7b Befreiung durch Regierungswechsel', function () { liberationCase('gov'); });
test('7c Befreiung durch Gesetz „Arbeitslager" aus', function () { liberationCase('law'); });

// -----------------------------------------------------------------------------
test('8 Leitplanken: camps.js liest weder Volk noch Kultur; Auswahl unabhängig von Herkunft', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'sim', 'camps.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert(!/\.race\b|races?\[|\brace\b/.test(src), 'camps.js liest das Volk');
  assert(!/culture/i.test(src), 'camps.js liest die Kultur');
  // gleicher Spielstand zweimal geladen, im zweiten Volk/Kultur aller Einheiten und Städte vertauscht: die Abholung
  // (ein Durchlauf von WW.Camps._yearly) wählt genau dieselben Leute
  const o = city('fascism', { unhappy: true, seed: 13 });
  years(o, 3);
  forceCamp(o.sim, o.k, 130);
  for (let i = 0; i < 40 && !campCities(o.sim).some((c) => c.cap > 0); i++) run(o.sim, 120);
  WW.Mods.add(o.c, { key: 'happiness', add: -80, source: 'test2' });
  run(o.sim, 30);
  const sv = o.sim.serialize();
  const pick = (swap) => {
    const S = WW.Sim.load(sv);
    if (swap) {
      const R = WW.RACE_KEYS || ['human', 'orc'];
      for (const u of S.state.units) { u.race = R[(R.indexOf(u.race) + 1) % R.length]; u.culture = 'x' + (u.culture || ''); }
      for (const c of S.state.cities) { c.culture = 'y' + (c.culture || ''); }
    }
    const old = WW.CAMPS.PICKUP; WW.CAMPS.PICKUP = 1;
    try { WW.Camps._yearly(S); } finally { WW.CAMPS.PICKUP = old; }
    return prisoners(S).map((u) => u.id).sort((x, y) => x - y).join(',');
  };
  const a = pick(false), b = pick(true);
  log('Abgeholte (IDs) normal:', a || '-', '| Volk/Kultur vertauscht:', b || '-');
  assert(a.length > 0, 'niemand abgeholt');
  assert(a === b, 'Auswahl hängt vom Volk oder der Kultur ab');
});

// -----------------------------------------------------------------------------
test('9 Speichern/Laden, Determinismus, alte Spielstände, Zeitaufschlag', function () {
  const mk = () => {
    const W = warWorld('fascism', 'democracy', { seed: 6 });
    W.sim.actions.setRelation(W.A.id, W.B.id, 'war');
    takePows(W.sim, W.A, W.B, 4); takePows(W.sim, W.B, W.A, 3);
    run(W.sim, 300);
    return W;
  };
  const A = mk(), B = mk();
  assert(A.sim.hash() === B.sim.hash(), 'nicht deterministisch');
  assert(prisoners(A.sim).length >= 4, 'keine Gefangenen');
  const sv = A.sim.serialize();
  assert(WW.Sim.load(sv).serialize() === sv, 'Laden ist nicht formstabil');
  const L = WW.Sim.load(sv);
  L._throwErrors = true; L._sitz = A.sim._sitz;   // (Testaufbau, kein Spielzustand)
  run(A.sim, 900); run(L, 900);
  assert(A.sim.hash() === L.hash(), 'Laden und Weiterlaufen weicht ab');
  // alter Spielstand (Fassung 19): Einzelbau laborcamp mit Insassen, ohne city.kind, ohne Gefangenen-Felder
  const o = city('fascism', { unhappy: true });
  years(o, 3);
  const st = o.sim.state, W = st.W;
  let spot = -1;
  for (let r = 15; r < 30 && spot < 0; r++) for (let d = 0; d < 16 && spot < 0; d++) {
    const D = WW.Cities.DIRS16[d], x = Math.round(o.c.cx + D[0] * r), y = Math.round(o.c.cy + D[1] * r);
    if (WW.Cities.canFoundAt(o.sim, x, y, undefined, 12, o.k.id)) spot = y * W + x;
  }
  assert(spot >= 0, 'kein Platz für das alte Lager');
  const lc = WW.Structs.create(o.sim, 'laborcamp', spot % W - 1, Math.floor(spot / W) - 1, o.c.id, { built: true, style: 'fascism' });
  lc.inmates = 3; lc.cap = 12;
  const old = JSON.parse(o.sim.serialize());
  for (const c of old.cities) delete c.kind;
  const ids = [];
  for (const u of old.units) if (u.cityId === o.c.id && u.role === 'farmer' && ids.length < 3) {
    ids.push(u.id); u.role = 'prisoner'; u.ind = 'camp'; u.camp = lc.id; u.cityId = -1; u.origK = u.kingdomId; u.origC = o.c.id;
  }
  delete old.laws.camps;
  const O = WW.Sim.load(JSON.stringify(old));
  assert(O, 'alter Spielstand lädt nicht');
  O._throwErrors = true;
  assert(O.state.cities.every((c) => c.kind === 'town') && O.state.laws.camps === true, 'Felder nicht nachgerüstet');
  { const s2 = O.serialize(); assert(WW.Sim.load(s2).serialize() === s2, 'nachgerüsteter Stand nicht formstabil'); }
  run(O, 300);
  const camp = campCities(O)[0];
  const inm = ids.map((id) => O._units.get(id)).filter(Boolean);
  log('alter Stand: Einzelbau ->', camp ? 'Lagerstadt ' + camp.name : 'Mahnmal', '| alte Insassen', inm.map((u) => u.role + (u.camp === (camp && camp.id) ? '@Lager' : '')).join(','));
  assert(camp ? inm.every((u) => u.role === 'prisoner' && u.camp === camp.id) : inm.every((u) => u.role !== 'prisoner'), 'alte Insassen hängen in der Luft');
  run(O, 1200);
  // Zeitaufschlag (Krieg mit Gefangenen, Lagerstadt im Bau/Betrieb)
  // Zeitaufschlag ohne Krieg: faschistische Welt mit Lagerstadt (eager), Abholungen, Zwangsarbeit
  {
    const P = city('fascism', { unhappy: true, seed: 17 });
    years(P, 30, () => campCities(P.sim).some((c) => c.cap > 0));
    run(P.sim, 600);
    const ot = WW.Camps.tick, ouu = WW.Camps.unit, oc = WW.Camps.cityUpdate, oe = WW.Camps.escort;
    let q = 0n;
    const wrap = (f) => function () { const t0 = process.hrtime.bigint(); const r = f.apply(this, arguments); q += process.hrtime.bigint() - t0; return r; };
    WW.Camps.tick = wrap(ot); WW.Camps.unit = wrap(ouu); WW.Camps.cityUpdate = wrap(oc); WW.Camps.escort = wrap(oe);
    try { run(P.sim, 4000); } finally { WW.Camps.tick = ot; WW.Camps.unit = ouu; WW.Camps.cityUpdate = oc; WW.Camps.escort = oe; }
    const msP = Number(q) / 1e6 / 4000;
    log('Lager-Anteil ohne Krieg', msP.toFixed(4), 'ms/Tick (Lagerstädte', campCities(P.sim).length + ', Gefangene ' + prisoners(P.sim).length + ', Kriege', WW.Diplo.atWar(P.sim, P.k.id) ? 'ja' : 'nein', ')');
    assert(msP < 0.03, 'Lager ohne Krieg zu langsam: ' + msP.toFixed(4));
  }
  const orig = WW.Camps.tick, ou = WW.Camps.unit, ocu = WW.Camps.cityUpdate;
  let ns = 0n;
  WW.Camps.tick = function (s) { const t0 = process.hrtime.bigint(); orig(s); ns += process.hrtime.bigint() - t0; };
  WW.Camps.unit = function (s, u) { const t0 = process.hrtime.bigint(); const r = ou(s, u); ns += process.hrtime.bigint() - t0; return r; };
  WW.Camps.cityUpdate = function (s, c) { const t0 = process.hrtime.bigint(); ocu(s, c); ns += process.hrtime.bigint() - t0; };
  try { run(A.sim, 4000); } finally { WW.Camps.tick = orig; WW.Camps.unit = ou; WW.Camps.cityUpdate = ocu; }
  const ms = Number(ns) / 1e6 / 4000;
  log('Lager-Anteil', ms.toFixed(4), 'ms/Tick (Lagerstadt, ' + prisoners(A.sim).length + ' Gefangene)');
  assert(ms < 0.05, 'Lager zu langsam');
});

// -----------------------------------------------------------------------------
test('11 Gleisanschluss: Rampe vor dem Tor, Güterzug liefert ab, Gefangenenzug bringt Gefangene, Befreiung unterwegs', function () {
  const W = warWorld('fascism', 'democracy', { seed: 6 });
  const sim = W.sim, camp = W.camp, st = sim.state;
  let line = null, t = 0;
  for (; t < 12000 && !(line = WW.Rail.campLineOf(sim, camp)); t += 120) run(sim, 120);
  const ramp = sim._structs.get(camp.station);
  log('Strecke nach', t, 'Ticks:', line ? line.tiles.length + ' Gleisstücke' : '-', '| Rampe', ramp ? ramp.x + '/' + ramp.y + (ramp.campStation ? ' (campStation)' : '') : '-');
  assert(line && ramp && ramp.campStation && ramp.cityId === camp.id, 'kein Gleisanschluss');
  WW.Structs.forTiles(sim, ramp, (i) => assert(st.inRing[i] === -1 && !camp.wall.plan.includes(i), 'Rampe im Zaun'));
  assert(fenceTight(sim, camp), 'Zaun durch das Gleis undicht');
  // Güterzug: holt den Ertrag ab und liefert in der Mutterstadt ab
  WW.Cities.addStock(sim, camp, 'stone', 40);
  let arrivals = 0;
  for (let i = 0; i < 2400 && !(camp.campShipped > 0 && arrivals > 0); i++) {
    sim.tick();
    if (st.trains.some((tr) => tr.line === line.id && tr.kind === 'freight' && tr.t === 'load' && tr.from === camp.station)) arrivals++;
  }
  log('Güterzug: abgeholt', camp.campShipped, '| Halte am Lager', arrivals);
  assert(camp.campShipped > 0 && arrivals > 0, 'Güterzug holt nichts ab');
  // Gefangenenzug: Abgeholte gehen zum Bahnhof der Mutterstadt, fahren, steigen an der Rampe aus
  const home = sim._cities.get(camp.campHome);
  const take = (n) => st.units.filter((u) => !u.dead && u.cityId === home.id && u.role === 'farmer' && !u.ind && !u.order).slice(0, n);
  const pol = take(4);
  for (const u of pol) WW.Camps.intern(sim, u, camp, { pow: false, march: true });
  assert(pol.every((u) => u.campVia), 'nicht zum Bahnhof geschickt');
  let rode = false, prisonTrain = null;
  for (let i = 0; i < 3000 && !pol.every((u) => u.campState === 'held'); i++) {
    sim.tick();
    const tr = st.trains.find((x) => x.kind === 'prison');
    if (tr) { prisonTrain = prisonTrain || { n: tr.prisoners.length, guards: tr.guards }; if (pol.some((u) => u.campState === 'train' && u.train === tr.id)) rode = true; }
  }
  log('Gefangenenzug:', prisonTrain ? prisonTrain.n + ' an Bord, ' + prisonTrain.guards + ' Wachen' : '-', '| gefahren', rode, '| im Lager', pol.filter((u) => u.campState === 'held').length, '/ 4');
  assert(rode && pol.every((u) => u.campState === 'held' && u.role === 'prisoner'), 'Gefangenenzug bringt niemanden');
  // Befreiung unterwegs: Gleis vor dem Zug zerstört -> Zug bleibt liegen, Insassen frei
  const pol2 = take(3);
  for (const u of pol2) WW.Camps.intern(sim, u, camp, { pow: false, march: true });
  let tr = null;
  for (let i = 0; i < 3000 && !(tr = st.trains.find((x) => x.kind === 'prison' && x.t === 'run')); i++) sim.tick();
  assert(tr, 'zweiter Gefangenenzug fährt nicht');
  // ein echtes Gleisstück (kein Gleistor) kurz vor dem Zug
  let piece = null;
  for (let d = 2; d < line.tiles.length && !piece; d++) {
    const q = Math.round(tr.pos) + tr.fw * d;
    if (q <= 0 || q >= line.tiles.length - 1) break;
    const r = sim._structs.get(st.structAt[line.tiles[q]]);
    if (r && r.type === 'rail' && r.built) piece = r;
  }
  assert(piece, 'kein Gleisstück vor dem Zug');
  const aboard = tr.prisoners.map((id) => sim._units.get(id));
  WW.Structs.destroy(sim, piece);
  run(sim, 200);
  const freed = aboard.filter((u) => !u.dead && u.role !== 'prisoner').length;
  log('Befreiung unterwegs: an Bord', aboard.length, ', frei', freed, '| Chronik', evs(sim, /^campTrain/).map((e) => e.type).join(','));
  assert(aboard.length >= 1 && freed === aboard.length && evs(sim, /^campTrainFreed$/).length, 'Befreiung unterwegs fehlt');
  assert(st.units.every((u) => u.dead || u.role !== 'prisoner' || u.campState !== 'train' || st.trains.some((x) => x.id === u.train)), 'Gefangene in Zug ohne Zug');
});

// -----------------------------------------------------------------------------
test('12 Begleitwache besiegt: die Gefangenen sind frei; niemand stirbt bei Auflösung des haltenden Reichs', function () {
  const W = warWorld('fascism', 'democracy', { seed: 6 });
  const sim = W.sim;
  sim.actions.setLaw('industry', false);
  sim.actions.setRelation(W.A.id, W.B.id, 'war');
  const p = takePows(sim, W.A, W.B, 3);
  const esc = sim._units.get(p[0].escort);
  assert(esc && esc.ind === 'escort', 'keine Begleitwache');
  run(sim, 30);
  WW.Units.kill(sim, esc, 'battle');   // die Wache fällt im Gefecht
  run(sim, 20);
  const freed = p.filter((u) => u.escort !== 0 || u.role !== 'prisoner' || u.campState === 'home');
  log('Wache gefallen: frei', p.filter((u) => u.role !== 'prisoner' || u.campState === 'home').length, '/ 3 | Chronik', evs(sim, /^campEscortBeaten$/).length);
  assert(p.filter((u) => u.escort === esc.id || (u.role === 'prisoner' && u.campState !== 'home')).every((u) => u.escort !== esc.id), 'Gefangene hängen an toter Wache');
  assert(p.filter((u) => u.escort === 0).every((u) => u.role !== 'prisoner' || u.campState === 'home') || p.some((u) => u.escort && u.escort !== esc.id), 'Gefangene nicht frei');
  assert(evs(sim, /^campEscortBeaten$/).length, 'keine Chronik zur geschlagenen Wache');
  void freed;
  // haltendes Reich wird aufgelöst: Insassen (auch im Lager) überleben und kommen frei
  const p2 = takePows(sim, W.A, W.B, 3);
  run(sim, 200);
  const alive0 = p2.filter((u) => !u.dead).length;
  WW.Gov.removeKingdom(sim, W.A, true);
  run(sim, 260);
  log('Reich aufgelöst: Gefangene lebend', p2.filter((u) => !u.dead).length, '/', alive0, '| noch gefangen', p2.filter((u) => !u.dead && u.role === 'prisoner' && u.campState !== 'home').length);
  assert(p2.filter((u) => !u.dead).length === alive0, 'Gefangene sterben mit dem Reich');
  assert(p2.every((u) => u.dead || u.role !== 'prisoner' || u.campState === 'home'), 'Gefangene nach Auflösung nicht frei');
});

// -----------------------------------------------------------------------------
test('10 Dauerlauf mit Krieg: keine Ausnahme, Invarianten', function () {
  for (const k in RAND) WW.CAMPS[k] = RAND[k];
  const sim = WW.Sim.create({ seed: 21, size: 'medium', populate: 5, govs: ['fascism', 'communism', 'democracy', 'monarchy', 'fascism'], races: ['human'] });
  sim._throwErrors = true;
  let maxP = 0, maxC = 0;
  for (let t = 1; t <= 24000; t++) {
    sim.tick();
    if (t % 2400 === 0) {
      const ps = prisoners(sim);
      maxP = Math.max(maxP, ps.length); maxC = Math.max(maxC, campCities(sim).length);
      for (const u of ps) {
        assert(u.cityId === -1 && u.ind === 'camp', 'Gefangener falsch gebunden');
        assert(u.campState === 'home' || WW.Camps.holdOf(sim, u), 'Gefangener ohne Haftort');
      }
      for (const c of campCities(sim)) assert(sim._kingdoms.get(c.kingdomId) && WW.CAMPS.GOVS[sim._kingdoms.get(c.kingdomId).gov], 'Lagerstadt bei Nicht-Regime');
    }
  }
  const ev = evs(sim, /^(camp|pow)/);
  const by = {};
  for (const e of ev) by[e.type] = (by[e.type] || 0) + 1;
  log('Jahre', sim.state.year, '| höchstens', maxP, 'Gefangene,', maxC, 'Lagerstädte | Chronik', JSON.stringify(by));
});

console.log('\n--- Ergebnis');
for (const r of results) console.log('  ' + (r.ok ? 'ok    ' : 'FEHLER') + '  ' + r.name + '  (' + (r.ms / 1000).toFixed(1) + ' s)' + (r.ok ? '' : '  -> ' + (r.err && r.err.message)));
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? '\n' + bad + ' Test(s) fehlgeschlagen.' : '\nAlle ' + results.length + ' Tests bestanden.');
process.exit(bad ? 1 : 0);
