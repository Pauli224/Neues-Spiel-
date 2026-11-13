// Tests für Modifikatoren, Reichsgesetze und Ereignisse: node tests/events.js [filter]
'use strict';
const WW = require('./load.js').load();

const filter = process.argv[2] || '';
const results = [];
function log() { console.log('    ' + Array.prototype.join.call(arguments, ' ')); }
function assert(cond, msg) { if (!cond) throw new Error('Annahme verletzt: ' + msg); }
function test(name, fn) {
  if (filter && !filter.toLowerCase().split(',').some(f => name.toLowerCase().indexOf(f) >= 0)) return;
  console.log('\n=== ' + name);
  const t0 = Date.now();
  try { fn(); results.push({ name: name, ok: true }); console.log('  BESTANDEN (' + (Date.now() - t0) + ' ms)'); }
  catch (e) { results.push({ name: name, ok: false }); console.log('  FEHLGESCHLAGEN: ' + (e && e.stack || e)); }
}
function makeSim(o) { const sim = WW.Sim.create(o); sim._throwErrors = true; return sim; }
function run(sim, n) { for (let i = 0; i < n; i++) sim.tick(); }
const near = (a, b) => Math.abs(a - b) < 1e-9;

// Zustand ohne Chronik (für Wirkungsnachweis)
function core(sim) {
  const o = JSON.parse(sim.serialize());
  delete o.events; delete o.eventSeq; delete o.rng; delete o.usedNames;
  for (const k of o.kingdoms) delete k.evcd;
  return JSON.stringify(o);
}

let baseSim = null;
function base() {
  if (baseSim) return baseSim;
  baseSim = makeSim({ seed: 4242, size: 'small', populate: 5, govs: 'mixed' });
  run(baseSim, 2400);
  return baseSim;
}

test('Modifikatoren rechnen und laufen ab', function () {
  const sim = makeSim({ seed: 7, width: 64, height: 48, populate: 1 });
  const k = sim.state.kingdoms[0], c = sim.state.cities[0];
  assert(WW.Mods.value(sim, k, c, 'work', 1) === 1, 'ohne Mods = Basis');
  WW.Mods.add(k, { key: 'work', mul: 1.5, until: 0, source: 'a' });
  WW.Mods.add(c, { key: 'work', add: 0.5, mul: 2, until: sim.state.tick + 30, source: 'b' });
  assert(near(WW.Mods.value(sim, k, c, 'work', 1), (1 + 0.5) * 1.5 * 2), 'Rechnung (base+add)×mul');
  assert(near(WW.Mods.value(sim, k, null, 'work', 1), 1.5), 'nur Reich');
  WW.Mods.add(k, { key: 'happiness', add: 8, until: 0, source: 'a' });
  assert(WW.Mods.value(sim, k, c, 'happiness', 50) === 58, 'additiv');
  WW.Mods.add(k, { key: 'nature', flag: 'care', until: 0, source: 'n' });
  assert(WW.Mods.flag(sim, k, 'nature') === 'care', 'Schalter');
  assert(WW.Mods.list(k, sim).length === 2, 'Liste je Quelle');
  run(sim, 40);
  assert(c.mods.length === 0, 'abgelaufen entfernt');
  assert(near(WW.Mods.value(sim, k, c, 'work', 1), 1.5), 'nach Ablauf');
  WW.Mods.remove(k, 'a');
  assert(WW.Mods.value(sim, k, c, 'work', 1) === 1 && WW.Mods.value(sim, k, c, 'happiness', 50) === 50, 'entfernt');
  // Geschwindigkeit
  WW.Mods.add(k, { key: 'food', mul: 1.1, until: 0, source: 'x' });
  const t0 = process.hrtime.bigint();
  let s = 0;
  for (let i = 0; i < 1e6; i++) s += WW.Mods.value(sim, k, c, 'food', 1);
  const ns = Number(process.hrtime.bigint() - t0) / 1e6;
  log('Mods.value: ' + ns.toFixed(1) + ' ns je Aufruf');
  assert(s > 0 && ns < 400, 'schnell genug');
});

test('Jedes Reichsgesetz wirkt wie versprochen', function () {
  assert(WW.REALM_LAWS.length >= 14, 'mind. 14 Gesetze');
  const sim = makeSim({ seed: 9, width: 64, height: 48, populate: 1 });
  const k = sim.state.kingdoms[0], c = sim.state.cities[0];
  for (const l of WW.REALM_LAWS) {
    const g = l.allowed[0];
    k.gov = g; k.lawGov = g;
    for (const key in k.laws) WW.Events.setRealmLaw(sim, k.id, key, false);
    const before = {};
    for (const e of l.effects) before[e.key] = e.flag ? WW.Mods.flag(sim, k, e.key) : WW.Mods.value(sim, k, c, e.key, 1);
    assert(sim.actions.setRealmLaw(k.id, l.key, true) === true, l.key + ' setzbar');
    assert(k.laws[l.key] != null && k.lawLocks[l.key] === true, l.key + ' gilt und ist fixiert');
    for (const e of l.effects) {
      if (e.flag) { assert(WW.Mods.flag(sim, k, e.key) === e.flag, l.key + ' Schalter ' + e.key); continue; }
      const v = WW.Mods.value(sim, k, c, e.key, 1);
      const want = (1 + (e.add || 0)) * (e.mul == null ? 1 : e.mul);
      assert(near(v, want) && v !== before[e.key], l.key + ': ' + e.key + ' ' + before[e.key] + ' -> ' + v + ' (erwartet ' + want + ')');
    }
    const bad = WW.GOV_KEYS.find(x => l.allowed.indexOf(x) < 0);
    if (bad) {
      k.gov = bad;
      WW.Events.pruneLaws(sim, k);
      assert(k.laws[l.key] == null, l.key + ' fällt bei ' + bad + ' weg');
      assert(sim.actions.setRealmLaw(k.id, l.key, true) === false, l.key + ' unter ' + bad + ' unzulässig');
    }
    sim.actions.setRealmLaw(k.id, l.key, false);
  }
  // Gegensätze
  k.gov = 'democracy'; k.lawGov = 'democracy';
  sim.actions.setRealmLaw(k.id, 'naturschutz', true);
  sim.actions.setRealmLaw(k.id, 'kahlschlagplan', true);
  assert(k.laws.naturschutz == null && k.laws.kahlschlagplan != null, 'Gegensatz verdrängt');
  assert(WW.Mods.flag(sim, k, 'nature') === 'exploit', 'Kahlschlag-Schalter');
  log(WW.REALM_LAWS.length + ' Gesetze geprüft');
});

test('Jedes Ereignis lässt sich erzwingen und wirkt', function () {
  const defs = WW.Events.DEFS;
  log(defs.length + ' Ereignis-Definitionen');
  const sim0 = base();
  const save = sim0.serialize();
  const groups = {};
  let texts = 0;
  for (const d of defs) {
    groups[d.group] = (groups[d.group] || 0) + 1;
    assert(WW.EVENT_GROUPS[d.group], d.key + ': Gruppe ' + d.group);
    const all = (d.texts || []).filter(Boolean).concat(...Object.values(d.textsBy || {}));
    texts += all.length;
    assert(all.length >= 3, d.key + ': mind. 3 Textvarianten');
    const sim = WW.Sim.load(save); sim._throwErrors = true;
    // passendes Reich wählen (Regierung/Gesetz), sonst irgendeins mit Nachbarn
    let k = sim.state.kingdoms.find(x => x.cityIds.length && d.key.endsWith('_' + x.gov)) || sim.state.kingdoms.find(x => x.cityIds.length && Object.keys(x.relations).length);
    const lawKey = /^lx_([a-z]+)/.exec(d.key);
    if (lawKey) { const lk = WW.REALM_LAWS.find(l => l.key.indexOf(lawKey[1]) === 0); if (lk && WW.Events.lawAllowed(k, lk.key)) WW.Events.setRealmLaw(sim, k.id, lk.key, true, { lock: false }); }
    for (const c of sim.state.cities) { c.stock.food = Math.max(c.stock.food, 80); c.stock.wood = Math.max(c.stock.wood, 80); c.stock.stone = Math.max(c.stock.stone, 80); c.stock.gold = Math.max(c.stock.gold, 80); }
    for (const kk of sim.state.kingdoms) if (kk.stock) for (const r in kk.stock) kk.stock[r] = Math.max(kk.stock[r], 80);
    const before = core(sim);
    sim._evMissing = [];
    for (let rep = 0; rep < 3; rep++) {
      const s2 = rep ? WW.Sim.load(save) : sim;
      const ev = WW.Events.fire(s2, d.key, { kingdomId: k.id });
      assert(ev, d.key + ': kein Eintrag');
      assert(!/[{}]|undefined|NaN|null/.test(ev.text), d.key + ': offener Platzhalter in „' + ev.text + '“');
      assert(!(s2._evMissing || []).length, d.key + ': fehlende Variablen ' + (s2._evMissing || []).join(' '));
      assert(ev.text.length > 20, d.key + ': Text zu kurz');
      if (rep === 0) {
        assert(ev.effectText && ev.effectText.length > 2, d.key + ': keine Wirkungsangabe (' + ev.text + ')');
        assert(ev.group === d.group, d.key + ': Gruppe im Eintrag');
        assert(core(sim) !== before, d.key + ': keine nachweisbare Wirkung');
      }
    }
  }
  log('Gruppen: ' + JSON.stringify(groups));
  log('Textvorlagen: ' + texts);
  assert(defs.length >= 40, 'mind. 40 Ereignisse');
});

test('Dauerlauf 40 000 Ticks mit 6 Reichen', function () {
  const sim = makeSim({ seed: 31337, size: 'medium', populate: 6, govs: 'mixed' });
  const keys = new Map(), texts = new Set(), groups = {};
  let lastId = 0, n = 0, laws = 0;
  let tEv = 0n;
  const orig = WW.Events.tick;
  WW.Events.tick = function (s) { const t = process.hrtime.bigint(); orig(s); tEv += process.hrtime.bigint() - t; };
  const origM = WW.Mods.tick;
  WW.Mods.tick = function (s) { const t = process.hrtime.bigint(); origM(s); tEv += process.hrtime.bigint() - t; };
  const t0 = Date.now();
  try {
    for (let i = 0; i < 40000; i++) {
      sim.tick();
      if (i % 200 === 0 || i === 39999) {
        for (const e of sim.state.events) {
          if (e.id <= lastId) continue;
          lastId = e.id;
          if (!e.group) continue;
          n++; texts.add(e.text); groups[e.group] = (groups[e.group] || 0) + 1;
          if (e.evKey) keys.set(e.evKey, (keys.get(e.evKey) || 0) + 1);
          if (e.group === 'laws') laws++;
        }
      }
    }
  } finally { WW.Events.tick = orig; WW.Mods.tick = origM; }
  const years = sim.state.year;
  log('Jahre: ' + years + ', Reiche am Ende: ' + sim.state.kingdoms.length + ', Laufzeit ' + (Date.now() - t0) + ' ms');
  log('Ereignis-Einträge: ' + n + ' (' + (n / years).toFixed(2) + ' je Jahr), davon Gesetze: ' + laws);
  log('verschiedene Ereignisse: ' + keys.size + ', verschiedene Texte: ' + texts.size);
  log('Gruppen: ' + JSON.stringify(groups));
  const lawCount = sim.state.kingdoms.map(k => Object.keys(k.laws || {}).length);
  log('geltende Gesetze je Reich: ' + JSON.stringify(lawCount));
  log('Zeitaufschlag Events+Mods: ' + (Number(tEv) / 1e6 / 40000).toFixed(4) + ' ms je Tick');
  assert(Number(tEv) / 1e6 / 40000 < 0.05, 'Zeitaufschlag < 0,05 ms');
  assert(n / years < 12, 'Chronik läuft nicht über');
  assert(keys.size >= Math.min(60, WW.Events.DEFS.length * 0.4), 'genug verschiedene Ereignisse');
  if (WW.Events.DEFS.length >= 150) { assert(keys.size > 60, '> 60 verschiedene Ereignisse'); assert(texts.size > 300, '> 300 verschiedene Texte'); }
});

test('Speichern, Laden, Determinismus', function () {
  const a = makeSim({ seed: 555, size: 'small', populate: 4, govs: 'mixed' });
  const b = makeSim({ seed: 555, size: 'small', populate: 4, govs: 'mixed' });
  run(a, 3000); run(b, 3000);
  assert(a.hash() === b.hash(), 'gleicher Seed -> gleicher Hash');
  const k = a.state.kingdoms[0];
  WW.Events.fire(a, 'missernte', { kingdomId: k.id });
  WW.Events.fire(b, 'missernte', { kingdomId: k.id });
  const c = WW.Sim.load(a.serialize()); c._throwErrors = true;
  assert(c.hash() === a.hash(), 'Laden erhält Hash');
  run(a, 2500); run(c, 2500); run(b, 2500);
  assert(a.hash() === c.hash(), 'nach Laden gleich weiter');
  assert(a.hash() === b.hash(), 'deterministisch mit Ereignissen');
  assert(a.state.evt && Array.isArray(a.state.kingdoms[0].mods), 'Zustand vorhanden');
});

test('Alte Spielstände ohne mods/laws', function () {
  const a = makeSim({ seed: 77, size: 'small', populate: 3 });
  run(a, 1200);
  const o = JSON.parse(a.serialize());
  delete o.evt; delete o.laws.events;
  for (const k of o.kingdoms) { delete k.mods; delete k.laws; delete k.lawLocks; delete k.evcd; delete k.lawGov; }
  for (const c of o.cities) delete c.mods;
  const b = WW.Sim.load(JSON.stringify(o));
  assert(b, 'lädt');
  b._throwErrors = true;
  assert(b.state.evt && b.state.laws.events === true, 'Ereignis-Zustand ergänzt');
  run(b, 2000);
  assert(b.state.kingdoms.every(k => k.laws && Array.isArray(k.mods)), 'Felder ergänzt');
  for (const k of b.state.kingdoms) if (k.cityIds.length) { assert(WW.Events.fire(b, 'goldader', { kingdomId: k.id }), 'Ereignis feuert'); break; }
});

test('Weltgesetz events aus = keine Ereignisse', function () {
  const a = makeSim({ seed: 12, size: 'small', populate: 4, laws: { events: false } });
  run(a, 6000);
  assert(!a.state.events.some(e => e.group), 'keine Ereignis-Einträge');
});

const bad = results.filter(r => !r.ok);
console.log('\n' + (results.length - bad.length) + '/' + results.length + ' bestanden' + (bad.length ? ' – FEHLER: ' + bad.map(r => r.name).join(', ') : ''));
process.exitCode = bad.length ? 1 : 0;
