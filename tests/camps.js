// Tests der Arbeitslager: node tests/camps.js [filter]
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
function run(sim, n) { for (let i = 0; i < n; i++) sim.tick(); }
const LAWS = { govChanges: false, wars: false, disasters: false, newRealms: false, events: false };
const camps = (sim) => sim.state.structs.filter((s) => !s.dead && s.type === 'laborcamp');
const prisoners = (sim) => sim.state.units.filter((u) => !u.dead && u.role === 'prisoner');

// Eine Stadt mit gemischten Völkern; hält sie auf Stadtgröße
function city(gov, o) {
  o = o || {};
  const sim = WW.Sim.create({ seed: o.seed || 9, width: 96, height: 64, populate: 1, govs: [gov], races: ['human'], animals: false, laws: Object.assign({}, LAWS, o.laws || {}) });
  sim._throwErrors = true;
  run(sim, 100);
  const c = sim.state.cities[0];
  for (const r of ['human', 'dwarf', 'orc', 'gnome']) sim.actions.spawnSettlers(c.cx + 2, c.cy + 2, 6, null, r);
  return { sim, c, k: sim._kingdoms.get(c.kingdomId) };
}
function years(o, n, until) {
  for (let y = 0; y < n; y++) {
    if (o.c.pop < 24) o.sim.actions.spawnSettlers(o.c.cx + 2, o.c.cy + 2, 8, null, 'human');
    run(o.sim, 240);
    if (until && until()) return y + 1;
  }
  return n;
}
function builtCamp(o) { return camps(o.sim).find((s) => s.built); }

test('1 Lager nur unter Faschismus und Kommunismus; Gesetz aus = keine', function () {
  for (const g of ['fascism', 'communism']) {
    const o = city(g);
    const y = years(o, 25, () => !!builtCamp(o));
    log(g, 'Lager nach', y, 'Jahren:', camps(o.sim).length, 'Stufe', o.c.tier, 'Zufriedenheit', Math.round(o.c.happiness));
    assert(builtCamp(o), g + ' baut kein Lager');
    const s = builtCamp(o), st = o.sim.state;
    WW.Structs.forTiles(o.sim, s, (i) => assert(st.inRing[i] === -1, 'Lager im Mauerring'));
    assert(st.events.some((e) => e.type === 'campBuilt'), 'keine Chronik');
  }
  for (const g of ['tribe', 'democracy', 'monarchy', 'republic', 'theocracy', 'anarchy']) {
    const o = city(g);
    years(o, 15);
    assert(!camps(o.sim).length, g + ' baut ein Lager');
  }
  const off = city('fascism', { laws: { camps: false } });
  years(off, 20);
  assert(!camps(off.sim).length, 'Gesetz aus, trotzdem Lager');
});

test('2 Insassen: nie nach Volk, nie Angriffsziel, Zwangsarbeit; Folgen über Mods', function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'sim', 'camps.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert(!/\.race\b|races?\[/.test(src), 'camps.js liest das Volk');
  const o = city('fascism');
  years(o, 25, () => !!builtCamp(o));
  const s = builtCamp(o);
  assert(s, 'kein Lager');
  const M = WW.Mods;
  const h0 = M.value(o.sim, o.k, o.c, 'happiness', 50), l0 = M.value(o.sim, o.k, o.c, 'loyalty', 50);
  // Abholung bei Unzufriedenheit (mehrere Jahre)
  const pre = new Map(o.sim.state.units.map((u) => [u.id, u.race]));
  years(o, 8);
  const ps = prisoners(o.sim);
  const races = new Set(ps.map((u) => pre.get(u.id) || u.race));
  log('Zufriedenheit-Mod 50 ->', h0.toFixed(1), '| Loyalität 50 ->', l0.toFixed(1), '| Insassen', ps.length, 'Völker', [...races].join(','));
  assert(h0 < 45 && l0 < 45, 'Lager drückt Zufriedenheit/Loyalität nicht');
  assert(ps.length > 0 || o.sim.state.events.some((e) => e.type === 'campBreakout' || e.type === 'campRiot'), 'niemand interniert');
  // erzwungen internieren und prüfen
  const cand = o.sim.state.units.filter((u) => !u.dead && u.cityId === o.c.id && u.role === 'farmer').slice(0, 4);
  for (const u of cand) WW.Camps.intern(o.sim, u, s);
  const foe = { id: -5, role: 'soldier', kingdomId: 999, dead: false };
  for (const u of cand) assert(!WW.Units.hostile(o.sim, foe, u) && !WW.Units.hostile(o.sim, u, foe), 'Insasse ist Angriffsziel');
  const stone0 = WW.Cities.stock(o.sim, o.c).stone + WW.Cities.stock(o.sim, o.c).wood;
  run(o.sim, 600);
  const stone1 = WW.Cities.stock(o.sim, o.c).stone + WW.Cities.stock(o.sim, o.c).wood;
  for (const u of cand) if (!u.dead && u.role === 'prisoner') {
    assert(u.cityId === -1 && u.ind === 'camp', 'Insasse falsch gebunden');
    assert(Math.hypot(u.x - s.x - 1, u.y - s.y - 1) < 18, 'Insasse läuft davon');
  }
  log('Zwangsarbeit Stein+Holz', Math.round(stone0), '->', Math.round(stone1));
  log('Chronik:', o.sim.state.events.filter((e) => /^camp/.test(e.type)).map((e) => e.text).slice(0, 4).join(' / '));
});

test('3 Befreiung bei Regierungswechsel: Insassen frei, Mahnmal, Freude', function () {
  const o = city('communism');
  years(o, 25, () => !!builtCamp(o));
  const s = builtCamp(o);
  assert(s, 'kein Lager');
  const cand = o.sim.state.units.filter((u) => !u.dead && u.cityId === o.c.id && u.role === 'farmer').slice(0, 5);
  for (const u of cand) WW.Camps.intern(o.sim, u, s);
  const ids = cand.map((u) => u.id);
  o.sim.actions.setGovernment(o.k.id, 'democracy');
  run(o.sim, 240);
  const st = o.sim.state;
  assert(!camps(o.sim).length, 'Lager nicht aufgelöst');
  assert(st.structs.some((x) => !x.dead && x.type === 'ruin' && x.ruinOf === 'laborcamp'), 'kein Mahnmal');
  for (const id of ids) { const u = o.sim._units.get(id); if (u && !u.dead) assert(u.role !== 'prisoner' && u.cityId === o.c.id && !u.ind, 'Insasse nicht frei'); }
  const h = WW.Mods.value(o.sim, o.k, o.c, 'happiness', 50);
  log('Zufriedenheit-Mod nach Befreiung 50 ->', h.toFixed(1));
  assert(h > 55, 'Befreiung hebt Zufriedenheit nicht');
  assert(st.events.some((e) => e.type === 'campLiberated'), 'keine Chronik zur Befreiung');
  log(st.events.filter((e) => e.type === 'campLiberated').map((e) => e.text + ' [' + e.effectText + ']').join(' / '));
});

test('4 Speichern/Laden, Determinismus, alte Spielstände, Zeitaufschlag', function () {
  const mk = () => { const o = city('fascism'); years(o, 25, () => !!builtCamp(o)); const s = builtCamp(o); if (s) for (const u of o.sim.state.units.filter((u) => !u.dead && u.cityId === o.c.id && u.role === 'farmer').slice(0, 3)) WW.Camps.intern(o.sim, u, s); return o; };
  const A = mk(), B = mk();
  assert(A.sim.hash() === B.sim.hash(), 'nicht deterministisch');
  assert(prisoners(A.sim).length, 'keine Insassen');
  const L = WW.Sim.load(A.sim.serialize());
  run(A.sim, 900); run(L, 900);
  assert(A.sim.hash() === L.hash(), 'Laden und Weiterlaufen weicht ab');
  const o = JSON.parse(B.sim.serialize());
  o.structs = o.structs.filter((s) => s.type !== 'laborcamp');
  for (const u of o.units) if (u.role === 'prisoner') { u.role = 'farmer'; delete u.ind; delete u.camp; u.cityId = B.c.id; }
  delete o.laws.camps;
  const O = WW.Sim.load(JSON.stringify(o));
  assert(O, 'alter Spielstand lädt nicht');
  O._throwErrors = true;
  run(O, 600);
  assert(O.state.laws.camps === true, 'Gesetz nicht ergänzt');
  const orig = WW.Camps.tick, ou = WW.Camps.unit;
  let ns = 0n;
  WW.Camps.tick = function (s) { const t0 = process.hrtime.bigint(); orig(s); ns += process.hrtime.bigint() - t0; };
  WW.Camps.unit = function (s, u) { const t0 = process.hrtime.bigint(); const r = ou(s, u); ns += process.hrtime.bigint() - t0; return r; };
  try { run(A.sim, 4000); } finally { WW.Camps.tick = orig; WW.Camps.unit = ou; }
  const ms = Number(ns) / 1e6 / 4000;
  log('Lager-Anteil', ms.toFixed(4), 'ms/Tick');
  assert(ms < 0.05, 'Lager zu langsam');
});

console.log('\n--- Ergebnis');
for (const r of results) console.log('  ' + (r.ok ? 'ok    ' : 'FEHLER') + '  ' + r.name + '  (' + (r.ms / 1000).toFixed(1) + ' s)' + (r.ok ? '' : '  -> ' + (r.err && r.err.message)));
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? '\n' + bad + ' Test(s) fehlgeschlagen.' : '\nAlle ' + results.length + ' Tests bestanden.');
process.exit(bad ? 1 : 0);
