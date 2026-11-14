// Tests der Eisenbahn: node tests/rail.js [filter]
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
const LONG = { seed: 12, w: 128, h: 80, dist: [52, 70] };   // zwei Städte weit genug auseinander für eine echte Strecke
const LAWS = { govChanges: false, wars: false, disasters: false, newRealms: false, events: false };
const rails = (sim) => sim.state.structs.filter((s) => !s.dead && s.type === 'rail');
const stations = (sim) => sim.state.structs.filter((s) => !s.dead && s.type === 'station');

// Zwei Städte (ab Stufe „Stadt") in einem Reich mit Regierung gov
function twoCities(gov, o) {
  o = o || {};
  const sim = WW.Sim.create({ seed: o.seed || 5, width: o.w || 96, height: o.h || 64, populate: 0, laws: LAWS, animals: false });
  sim._throwErrors = true;
  const spots = [];
  for (let y = 8; y < sim.state.H - 8; y += 2) for (let x = 8; x < sim.state.W - 8; x += 2) if (WW.Cities.canFoundAt(sim, x, y, 'human', 0)) spots.push([x, y]);
  let pa = null, pb = null;
  const d0 = o.dist ? o.dist[0] : 32, d1 = o.dist ? o.dist[1] : 46;
  for (const p of spots) for (const q of spots) { const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (!pa && d >= d0 && d <= d1) { pa = p; pb = q; } }
  assert(pa, 'keine Bauplätze');
  const a = sim.actions.spawnSettlers(pa[0], pa[1], 26, gov, 'human');
  const b = sim.actions.spawnSettlers(pb[0], pb[1], 26, gov, 'human');
  const ca = sim._cities.get(a.cityId), cb = sim._cities.get(b.cityId);
  WW.Cities.transferCity(sim, cb, a.kingdomId);
  const k = sim._kingdoms.get(a.kingdomId);
  return { sim, k, ca, cb };
}
// hält beide Städte auf Stadtgröße (Zuzug per Siedler-Werkzeug)
function topUp(o) { for (const c of [o.ca, o.cb]) if (c.pop < 24 && !c.dead) o.sim.actions.spawnSettlers(c.cx + 1, c.cy + 2, 8, null, 'human'); }
function years(o, n) { for (let y = 0; y < n; y++) { topUp(o); run(o.sim, 240); } }
function untilLine(o, years) {
  for (let y = 0; y < years; y++) {
    topUp(o);
    run(o.sim, 240);
    const l = o.sim.state.rail.lines.find((q) => q.done && o.sim.state.trains.some((t) => t.line === q.id));
    if (l) return l;
  }
  return null;
}

test('1 Strecke wird gebaut, Zug fährt und gleicht Vorräte aus', function () {
  const o = twoCities('fascism', LONG);
  const line = untilLine(o, 60);
  const st = o.sim.state;
  assert(line, 'keine fertige Strecke mit Zug (Bahnhöfe ' + stations(o.sim).length + ', Gleise ' + rails(o.sim).length + ')');
  log('Jahr', st.year, 'Strecke', line.tiles.length, 'Kacheln, Brücken', rails(o.sim).filter((s) => s.bridge).length, 'Bahnhöfe', stations(o.sim).length);
  for (const s of rails(o.sim)) assert(s.mask > 0, 'Gleis ohne Nachbarn (mask)');
  for (const s of [...rails(o.sim), ...stations(o.sim)]) assert(st.inRing[s.y * st.W + s.x] === -1, 'Bahn im Mauerring');
  const A = WW.Cities.stock(o.sim, o.sim._cities.get(o.sim._structs.get(line.a).cityId)), B = WW.Cities.stock(o.sim, o.sim._cities.get(o.sim._structs.get(line.b).cityId));
  A.stone = 260; B.stone = 0;
  let smoke = 0, whistle = 0, moved = 0;
  const tr = st.trains.find((t) => t.line === line.id);
  let px = tr.x;
  for (let i = 0; i < 900; i++) {
    o.sim.tick();
    for (const f of o.sim.drainFx()) { if (f.type === 'trainsmoke') smoke++; if (f.type === 'whistle') whistle++; }
    if (Math.abs(tr.x - px) > 0) moved++; px = tr.x;
  }
  log('Stein A', Math.round(A.stone), 'B', Math.round(B.stone), '| Rauch', smoke, 'Pfiffe', whistle, 'Fahr-Ticks', moved);
  assert(moved > 50 && smoke > 5 && whistle > 0, 'Zug fährt nicht sichtbar');
  assert(B.stone >= 40, 'Vorräte werden nicht ausgeglichen');
  assert(st.events.some((e) => e.type === 'railFirst'), 'keine Chronik zur ersten Fahrt');
  log('Chronik:', st.events.filter((e) => /^rail/.test(e.type)).map((e) => e.text).join(' / '));
});

test('2 Zerstörtes Gleis stoppt den Zug, Reparatur lässt ihn weiterfahren', function () {
  const o = twoCities('communism', LONG);
  const line = untilLine(o, 60);
  assert(line, 'keine Strecke');
  const st = o.sim.state, tr = st.trains.find((t) => t.line === line.id);
  const mid = line.tiles[Math.min(line.tiles.length - 1, Math.max(1, Math.floor(line.tiles.length / 2)))];
  const s = o.sim._structs.get(st.structAt[mid]);
  WW.Structs.destroy(o.sim, s);
  let blocked = false;
  for (let i = 0; i < 400 && !blocked; i++) { o.sim.tick(); blocked = tr.t === 'blocked'; }
  // Reparatur verhindern und prüfen, dass er wirklich steht
  const p0 = tr.pos;
  log('Zug blockiert:', blocked, 'bei', p0.toFixed(1), 'von', line.tiles.length);
  assert(blocked, 'Zug hält nicht an der Lücke');
  let fixed = false;
  const rebuilt = () => { const r = o.sim._structs.get(st.structAt[mid]); return !!(r && r.type === 'rail' && r.built); };
  for (let i = 0; i < 4800 && !fixed; i++) { o.sim.tick(); fixed = rebuilt() && tr.t !== 'blocked'; }
  assert(fixed, 'Strecke wird nicht repariert / Zug fährt nicht weiter');
  assert(st.events.some((e) => e.type === 'railBroken') && st.events.some((e) => e.type === 'railRepaired'), 'Chronik fehlt');
});

test('3 Stamm und Demokratie bauen keine Bahn (Tabelle WW.RAIL.GOVS)', function () {
  for (const g of ['tribe', 'democracy']) {
    assert(!WW.RAIL.GOVS[g], g + ' in der Tabelle');
    const o = twoCities(g);
    years(o, 12);
    log(g, 'Bahnhöfe', stations(o.sim).length, 'Gleise', rails(o.sim).length, 'Stufen', o.ca.tier, o.cb.tier);
    assert(!stations(o.sim).length && !rails(o.sim).length && !o.sim.state.trains.length, g + ' baut Bahn');
  }
});

test('4 Speichern/Laden mit Zug, Determinismus, alte Spielstände, Zeitaufschlag', function () {
  const mk = () => { const o = twoCities('fascism', LONG); untilLine(o, 60); return o; };
  const A = mk(), B = mk();
  assert(A.sim.hash() === B.sim.hash(), 'nicht deterministisch');
  assert(A.sim.state.trains.length, 'kein Zug');
  { const sv = A.sim.serialize(); assert(WW.Sim.load(sv).serialize() === sv, 'Laden ist nicht formstabil'); }
  const L = WW.Sim.load(A.sim.serialize());
  assert(L && L.state.trains.length === A.sim.state.trains.length, 'Züge nicht gespeichert');
  run(A.sim, 700); run(L, 700);
  assert(A.sim.hash() === L.hash(), 'Laden und Weiterlaufen weicht ab');
  const o = JSON.parse(B.sim.serialize());
  delete o.rail; delete o.trains;
  o.structs = o.structs.filter((s) => s.type !== 'rail' && s.type !== 'station');
  const O = WW.Sim.load(JSON.stringify(o));
  assert(O, 'alter Spielstand lädt nicht');
  O._throwErrors = true;
  WW.Cities.refreshAllLists(O);
  run(O, 600);
  assert(Array.isArray(O.state.trains) && O.state.rail && Array.isArray(O.state.rail.lines), 'Felder fehlen');
  // Zeitaufschlag der Bahn
  const orig = WW.Rail.tick;
  let ns = 0n;
  WW.Rail.tick = function (s) { const t0 = process.hrtime.bigint(); orig(s); ns += process.hrtime.bigint() - t0; };
  try { run(A.sim, 4000); } finally { WW.Rail.tick = orig; }
  const ms = Number(ns) / 1e6 / 4000;
  log('Bahn-Anteil', ms.toFixed(4), 'ms/Tick');
  assert(ms < 0.05, 'Bahn zu langsam');
});

test('5 Lange Strecke zwischen zwei Städten (20–60 Kacheln), Zug kommt an, Vorräte gleichen sich aus, Kohle', function () {
  const o = twoCities('fascism', LONG);
  const line = untilLine(o, 70);
  const st = o.sim.state;
  log('alle Strecken:', st.rail.lines.map((l) => l.tiles.length + (l.done ? ' fertig' : '')).join(', '));
  assert(line, 'keine fertige Strecke (Bahnhöfe ' + stations(o.sim).length + ', Gleise ' + rails(o.sim).length + ')');
  const A = o.sim._structs.get(line.a), B = o.sim._structs.get(line.b);
  log('Strecke', line.tiles.length, 'Kacheln zwischen', o.sim._cities.get(A.cityId).name, 'und', o.sim._cities.get(B.cityId).name);
  assert(A.cityId !== B.cityId, 'Strecke innerhalb einer Stadt');
  assert(line.tiles.length >= 18 && line.tiles.length <= 90, 'Streckenlänge ' + line.tiles.length);
  assert(!st.rail.lines.some((l) => l.tiles.length < WW.RAIL.MIN_LEN), 'Mini-Strecke');
  const tr = st.trains.find((t) => t.line === line.id);
  const SA = WW.Cities.stock(o.sim, o.sim._cities.get(A.cityId)), SB = WW.Cities.stock(o.sim, o.sim._cities.get(B.cityId));
  SA.stone = 300; SB.stone = 0;
  let arrivals = 0, last = tr.to, whistle = 0, smoke = 0, coalRuns = 0, moved = 0, lastT = tr.t;
  // Kohle: erst ohne Feld, dann 0, dann vorhanden – nichts darf brechen
  delete SA.coal; delete SB.coal;
  for (let i = 0; i < 2400; i++) {
    if (i === 800) { SA.coal = 0; SB.coal = 0; }
    if (i === 1600) { SA.coal = 200; SB.coal = 200; }
    o.sim.tick();
    for (const f of o.sim.drainFx()) { if (f.type === 'whistle') whistle++; if (f.type === 'trainsmoke') smoke++; }
    if (tr.to !== last) { arrivals++; last = tr.to; }
    if (tr.coal) coalRuns++;
    if (tr.t === 'run' && lastT === 'load') moved += tr.cargo.stone + tr.cargo.food + tr.cargo.wood;
    lastT = tr.t;
  }
  log('Ankünfte', arrivals, 'Pfiffe', whistle, 'Rauch', smoke, 'Stein A/B', Math.round(SA.stone), '/', Math.round(SB.stone), 'beförderte Güter', Math.round(moved), 'Ticks mit Kohle', coalRuns);
  assert(arrivals >= 2 && whistle >= 2 && smoke > 20, 'Zug fährt nicht regelmäßig');
  assert(moved >= 60, 'Vorräte gleichen sich nicht aus');
  assert(coalRuns > 0 && SA.coal < 200 + 1, 'Kohle wird nicht genutzt');
});

console.log('\n--- Ergebnis');
for (const r of results) console.log('  ' + (r.ok ? 'ok    ' : 'FEHLER') + '  ' + r.name + '  (' + (r.ms / 1000).toFixed(1) + ' s)' + (r.ok ? '' : '  -> ' + (r.err && r.err.message)));
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? '\n' + bad + ' Test(s) fehlgeschlagen.' : '\nAlle ' + results.length + ' Tests bestanden.');
process.exit(bad ? 1 : 0);
