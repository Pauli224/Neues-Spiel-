// Tests der Mauerstufen 1–6 und Verteidigungsgeräte: node tests/walls.js [filter]
'use strict';
const fs = require('fs');
const path = require('path');
const WW = require('./load.js').load();

const filter = process.argv[2] || '';
const results = [];
function log() { console.log('    ' + Array.prototype.join.call(arguments, ' ').replace(/\n/g, '\n    ')); }
function assert(cond, msg) { if (!cond) throw new Error('Annahme verletzt: ' + msg); }
function test(name, fn) {
  if (filter && name.toLowerCase().indexOf(filter.toLowerCase()) < 0) return;
  console.log('\n=== ' + name);
  const t0 = Date.now();
  try { fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log('  BESTANDEN (' + (Date.now() - t0) + ' ms)'); }
  catch (e) { results.push({ name, ok: false, ms: Date.now() - t0, err: e }); console.log('  FEHLGESCHLAGEN: ' + (e && e.stack || e)); }
}
function makeSim(o) { const sim = WW.Sim.create(o); sim._throwErrors = true; return sim; }
function run(sim, n, every, fn) { for (let i = 1; i <= n; i++) { sim.tick(); if (every && i % every === 0 && fn && fn(i) === true) return i; } return n; }

// Hilfen aus tests/run.js übernehmen (gleiche Testwiese, gleiche Dichtheitsprüfung)
const SRC = fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8');
function grab(name) {
  const i = SRC.indexOf('function ' + name + '(');
  const j = SRC.indexOf('\n}\n', i);
  return SRC.slice(i, j + 2);
}
const meadowWorld = new Function('WW', grab('meadowWorld') + '\nreturn meadowWorld;')(WW);
const leaks = new Function('WW', grab('leaks') + '\nreturn leaks;')(WW);

function wallPieces(sim, c) {
  const st = sim.state, out = [];
  for (const t of c.wall.plan || []) { const s = sim._structs.get(st.structAt[t]); if (s && s.cityId === c.id && WW.Structs.isWallish(s)) out.push(s); }
  return out;
}
function feed(sim, c) {
  const sk = WW.Cities.stock(sim, c);
  sk.food = Math.max(sk.food, 400); sk.wood = Math.max(sk.wood, 400); sk.stone = Math.max(sk.stone, 400); sk.gold = Math.max(sk.gold, 300);
}

// Stadt einer Regierung bis zur höchsten Mauerstufe hochziehen (viel Vorrat, Zuzug)
const BUILT = {};
function buildUp(gk) {
  if (BUILT[gk]) return BUILT[gk];
  const world = meadowWorld(110, 80, { hills: true, spots: [{ x: 50, y: 40 }] });
  const sim = makeSim({ seed: 'stufen-' + gk, world: world, populate: 1, govs: [gk], races: ['human'], animals: false, laws: { disasters: false, wars: false } });
  const c = sim.state.cities[0];
  sim.actions.setGovLocked(c.kingdomId, true);
  const g = WW.GOVERNMENTS[gk];
  const seen = [];
  let tight = true, saveMid = null, upgrading = 0;
  run(sim, 60000, 100, (i) => {
    feed(sim, c);
    if (c.pop < 90 && i % 600 === 0) sim.actions.spawnSettlers(c.cx + 0.5, c.cy + 0.5, 12, null, 'human');
    const lv = c.wall.level || 0;
    if (lv && seen.indexOf(lv) < 0) {
      seen.push(lv);
      if (leaks(sim, c).leak && !g.barricades) tight = false;
    }
    if (c.wall.state === 'upgrading') {
      upgrading++;
      if (c.wall.target >= 4 && !saveMid) saveMid = sim.serialize();
      if (upgrading % 20 === 0 && !g.barricades && leaks(sim, c).leak) tight = false;
    }
    return lv >= g.wallMax && c.wall.state === 'done';
  });
  return (BUILT[gk] = { sim, c, g, seen, tight, saveMid });
}

// --------------------------------------------------------------------------
test('1 Tabellen: Stufen, Namen, Geräte', function () {
  for (const gk of WW.GOV_KEYS) {
    const g = WW.GOVERNMENTS[gk];
    assert(g.wallMax === (gk === 'tribe' || gk === 'anarchy' ? 4 : 6), gk + ': wallMax ' + g.wallMax);
    assert(g.wallLevels && g.wallLevels.length === g.wallMax, gk + ': wallLevels');
    for (const l of g.wallLevels) assert(l.name && l.hpMul > 0, gk + ': Stufe ohne Namen');
    assert(g.wallLevels.some((l) => l.device && WW.WALL_DEVICES[l.device]), gk + ': kein Gerät');
  }
  for (const k of WW.WALL_DEVICE_KEYS) assert(WW.WALL_DEVICES[k].name && WW.WALL_DEVICES[k].desc, k + ': Name/Text');
  assert(WW.GOVERNMENTS.communism.wallLevels[4].device === 'selfshot', 'Kommunismus Stufe 5 ohne Selbstschussanlage');
  log(WW.GOV_KEYS.map((k) => k + ': ' + WW.GOVERNMENTS[k].wallLevels.map((l) => l.name + (l.device ? ' [' + l.device + ']' : '')).join(' › ')).join('\n'));
});

test('2 Jede Regierung erreicht ihre höchste Stufe, Ring bleibt dicht', function () {
  const rows = [];
  for (const gk of WW.GOV_KEYS) {
    const r = buildUp(gk);
    const devs = wallPieces(r.sim, r.c).filter((s) => s.device).map((s) => s.device);
    rows.push(gk.padEnd(10) + ' Stufen ' + r.seen.join(',') + ' · ' + r.c.wall.name + ' · Jahr ' + r.sim.state.year + ' · Geräte ' + devs.length + (devs[0] ? ' (' + devs[0] + ')' : '') + ' · dicht ' + r.tight);
  }
  for (const r of rows) log(r);
  for (const gk of WW.GOV_KEYS) {
    const r = BUILT[gk];
    assert(r.c.wall.level === r.g.wallMax, gk + ' erreicht Stufe ' + r.c.wall.level + ' statt ' + r.g.wallMax);
    assert(r.tight, gk + ': Ring undicht beim Ausbau');
    assert(wallPieces(r.sim, r.c).some((s) => s.device), gk + ': keine Geräte auf der Mauer');
    assert(wallPieces(r.sim, r.c).every((s) => s.level === r.g.wallMax || !s.built), gk + ': Stücke nicht auf höchster Stufe');
  }
});

test('3 Geräte treffen (Selbstschuss, MG-Nest, Balliste, Kanone, …)', function () {
  const rows = [];
  for (const gk of WW.GOV_KEYS) {
    const { sim, c } = buildUp(gk);
    const st = sim.state;
    const devPieces = wallPieces(sim, c).filter((s) => s.device);
    // Räuber vor jedes vierte Gerät stellen
    let placed = 0;
    for (let k = 0; k < devPieces.length && placed < 6; k += 3) {
      const s = devPieces[k];
      for (const d of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const x = s.x + d[0], y = s.y + d[1];
        if (x < 0 || y < 0 || x >= st.W || y >= st.H) continue;
        const i = y * st.W + x;
        if (st.inRing[i] === c.id || !WW.Path.passable(sim, i, -1)) continue;
        placed += sim.actions.spawnBandits(x + 0.5, y + 0.5, 1); break;
      }
    }
    for (const s of devPieces) s.devShots = 0;
    c.wAlarm = st.tick + 2000;
    run(sim, 400, 50, () => { c.wAlarm = st.tick + 2000; feed(sim, c); });
    const shots = devPieces.reduce((n, s) => n + (s.devShots || 0), 0);
    rows.push(gk.padEnd(10) + ' ' + (devPieces[0] ? devPieces[0].device : '-').padEnd(9) + ' Räuber ' + placed + ' · Schüsse ' + shots + ' · Räuber übrig ' + st.units.filter((u) => u.role === 'bandit').length);
    if (['communism', 'fascism', 'monarchy', 'republic'].indexOf(gk) >= 0) assert(shots > 0, gk + ': Gerät trifft nicht');
  }
  for (const r of rows) log(r);
});

test('4 Selbstschussanlage trifft auch mal ein Schaf', function () {
  const { sim, c } = buildUp('communism');
  const st = sim.state;
  const s = wallPieces(sim, c).find((p) => p.device === 'selfshot');
  let sheep = 0;
  for (const d of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [-2, 1]]) {
    const x = s.x + d[0], y = s.y + d[1], i = y * st.W + x;
    if (st.inRing[i] !== c.id && sim.actions.spawnAnimal(x + 0.5, y + 0.5, 'sheep') != null) sheep++;
  }
  const n0 = st.animals.filter((a) => a.kind === 'sheep').length;
  let hit = false;
  for (let k = 0; k < 40 && !hit; k++) {
    sim.actions.spawnBandits(s.x + 2.5, s.y + 0.5, 1);
    c.wAlarm = st.tick + 2000;
    run(sim, 100);
    hit = st.animals.filter((a) => a.kind === 'sheep').length < n0 || st.events.some((e) => e.type === 'selfshotSheep');
  }
  const ev = st.events.filter((e) => e.type === 'selfshotSheep').pop();
  log('Schafe gesetzt', sheep, '· getroffen', hit, ev ? '· „' + ev.text + '"' : '');
  assert(hit, 'Selbstschussanlage trifft nie ein Schaf');
});

test('5 Stufe 6 mit Geräten hält länger als Stufe 3, ist aber mit Gerät und Übermacht zu knacken', function () {
  const world = meadowWorld(120, 70, { hills: true, spots: [{ x: 32, y: 35 }, { x: 88, y: 35 }] });
  const base = makeSim({ seed: 'belagerung6', world: world, populate: 2, govs: ['fascism', 'communism'], races: ['orc', 'human'], animals: false, laws: { wars: false, disasters: false, newRealms: false, govChanges: false, camps: false } });
  const [a, b] = base.state.kingdoms;
  a.govLocked = b.govLocked = true;
  const ca = base._cities.get(a.cityIds[0]), cb = base._cities.get(b.cityIds[0]);
  run(base, 80 * WW.CONFIG.TPY, 100, () => { feed(base, cb); return cb.wall.level >= 1 && cb.wall.state === 'done' && base.state.year >= 8; });
  for (const c of base.state.cities.slice()) if (c !== ca && c !== cb) WW.Cities.destroyCity(base, c, null);
  run(base, 20);
  assert(cb.wall.level >= 1 && !ca.dead && !cb.dead && base._kingdoms.get(a.id) && base._kingdoms.get(b.id), 'Vorlauf: keine Mauer oder Reich weg');
  const save = base.serialize();
  const siege = (level) => {
    const sim = WW.Sim.load(save); sim._throwErrors = true; sim._noSiegeEngines = true; sim._noWallUpgrade = true;
    const A = sim._kingdoms.get(a.id), B = sim._kingdoms.get(b.id);
    const CA = sim._cities.get(ca.id), CB = sim._cities.get(cb.id);
    const g = WW.GOVERNMENTS[B.gov];
    for (const s of wallPieces(sim, CB)) {
      s.level = level; s.upgradeTo = 0; s.built = true; s.progress = 1; s.mat = WW.Walls.wallStyle(g, level);
      s.maxHp = WW.Structs.maxHpFor(sim, s); s.hp = s.maxHp; WW.Structs.setBlockAt(sim, s);
    }
    CB.wall.level = CB.wall.target = level; CB.wall.state = 'done'; CB.wall.plannedYear = sim.state.year + 100; CB.noSpace = false;
    WW.Walls.assignDevices(sim, CB, g);
    const made = [];
    for (let n = 0; n < 40; n++) {
      const u = WW.Units.create(sim, { x: CB.cx + 16 + (n % 5), y: CB.cy - 4 + Math.floor(n / 5), role: 'soldier', kingdomId: A.id, cityId: CA.id, race: 'orc', age: 20 });
      if (u) { WW.Units.setRole(sim, u, n < 4 ? 'ram' : (n < 8 ? 'catapult' : 'soldier')); made.push(u); }
    }
    for (const u of made) u.order = { kind: 'march', city: CB.id, k: B.id };
    sim.actions.setLaw('wars', true);
    sim.actions.setRelation(A.id, B.id, 'war');
    let fell = -1, shots = 0;
    const t0 = sim.state.tick;
    for (let i = 1; i <= 24000; i++) {
      sim.tick();
      // die Verteidiger bleiben hinter ihrer Mauer (sonst erobern sie im Gegenzug die Stadt der Angreifer)
      if (i % 5 === 0) for (const u of sim.state.units) if (!u.dead && u.kingdomId === B.id && u.order && u.order.city === CA.id) { u.order = null; u.path = null; }
      if (i % 50 === 0) {
        if (CB.dead || CB.kingdomId !== B.id || B.dead) { fell = i; break; }
        if (A.dead) { console.log('    Angreifer-Reich untergegangen bei Tick', i, sim.state.events.filter((e) => e.kingdomId === A.id || e.cityId === CA.id).slice(-6).map((e) => e.type + ': ' + e.text).join(' | ')); break; }
        const r = A.relations[B.id];
        if (r && r.status !== 'war') sim.actions.setRelation(A.id, B.id, 'war');
        if (r && B.relations[A.id]) { r.weariness = 0; B.relations[A.id].weariness = 0; }
        feed(sim, CA);   // das Heer der Angreifer verhungert nicht (Testaufbau)

        // Verteidiger bleiben zu Hause (reine Belagerung, kein Gegenangriff)
        for (const u of sim.state.units) if (!u.dead && u.kingdomId === B.id && u.order && u.order.kind === 'march') { u.order = null; u.path = null; }
        // Nachschub für die Angreifer (Übermacht)
        if (i % 1500 === 0) for (let n = 0; n < 10; n++) {
          const u = WW.Units.create(sim, { x: CB.cx + 16 + (n % 5), y: CB.cy - 4 + Math.floor(n / 5), role: 'soldier', kingdomId: A.id, cityId: CA.id, race: 'orc', age: 20 });
          if (u) { WW.Units.setRole(sim, u, n < 1 ? 'ram' : (n < 2 ? 'catapult' : 'soldier')); u.order = { kind: 'march', city: CB.id, k: B.id }; }
        }
      }
    }
    for (const s of wallPieces(sim, CB)) shots += s.devShots || 0;
    void t0;
    return { fell, shots };
  };
  const r3 = siege(3), r6 = siege(6);
  const fmt = (r) => (r.fell > 0 ? (r.fell / WW.CONFIG.TPY).toFixed(1) + ' Jahre' : 'hält > 100 Jahre') + ', Geräteschüsse ' + r.shots;
  log('Stufe 3:', fmt(r3), '· Stufe 6:', fmt(r6));
  assert(r3.fell > 0, 'Stufe 3 fällt nicht');
  assert(r6.fell > 0, 'Stufe 6 ist mit Gerät und Übermacht nicht zu knacken');
  assert(r6.fell > r3.fell * 1.3, 'Stufe 6 hält nicht deutlich länger als Stufe 3');
  assert(r6.shots > 0, 'Selbstschussanlagen schießen nicht');
});

test('6 Regierungswechsel baut um (Stufe und Geräte)', function () {
  const { sim, c } = buildUp('monarchy');
  const k = sim._kingdoms.get(c.kingdomId);
  assert(sim.actions.setGovernment(k.id, 'tribe'), 'setGovernment');
  run(sim, 400, 50, () => feed(sim, c));
  const ps = wallPieces(sim, c);
  log('nach Wechsel zu Stamm: Stufe', c.wall.level, c.wall.name, '· Geräte', [...new Set(ps.filter((s) => s.device).map((s) => s.device))].join(','), '· im Umbau', ps.filter((s) => s.restyle).length);
  assert(c.wall.level <= 4 && ps.every((s) => s.level <= 4), 'Stufe über Stamm-Maximum');
  assert(ps.every((s) => !s.device || s.device === 'spikes'), 'Geräte nicht umgestellt');
  assert(!leaks(sim, c).leak, 'Ring nach Wechsel undicht');
  assert(sim.actions.setGovernment(k.id, 'communism'), 'setGovernment 2');
  run(sim, 400, 50, () => feed(sim, c));
  log('nach Wechsel zu Kommunismus: Stufe', c.wall.level, c.wall.name);
});

test('7 Speichern/Laden mitten im Ausbau, alte Spielstände', function () {
  const { saveMid } = buildUp('communism');
  assert(saveMid, 'kein Spielstand mitten im Ausbau');
  // einmal normalisieren (andere Module ergänzen beim Laden eigene Felder, z. B. city.mods)
  const norm = WW.Sim.load(saveMid).serialize();
  const A = WW.Sim.load(norm), B = WW.Sim.load(norm);
  assert(A && A.serialize() === norm, 'serialize(load(x)) != x');
  assert(A.state.cities.some((c) => c.wall.state === 'upgrading'), 'Stand nicht mitten im Ausbau');
  run(A, 1500); run(B, 1500);
  assert(A.hash() === B.hash(), 'nach Laden nicht deterministisch');
  // alter Spielstand: ohne Geräte, Stufenname, Gerätelisten
  const o = JSON.parse(saveMid);
  for (const s of o.structs) { delete s.device; delete s.devCd; delete s.devShots; if (s.level > 3) s.level = 3; if (s.upgradeTo > 3) s.upgradeTo = 3; }
  for (const c of o.cities) if (c.wall) { delete c.wall.devices; delete c.wall.devGov; delete c.wall.devLevel; delete c.wall.name; if (c.wall.level > 3) c.wall.level = 3; if (c.wall.target > 3) c.wall.target = 3; }
  const old = WW.Sim.load(JSON.stringify(o));
  assert(old, 'alter Spielstand lädt nicht');
  old._throwErrors = true;
  run(old, 3000);
  log('alter Stand nach 3000 Ticks: Mauerstufe', old.state.cities[0].wall.level, old.state.cities[0].wall.name);
});

test('8 Zeitaufschlag der Geräte', function () {
  const { sim, c } = buildUp('fascism');
  let tDev = 0n;
  const orig = WW.Env.updateDevices;
  // Wrapper: updateDevices wird über WW.Env aufgerufen? Nein (intern) – daher direkt messen
  const T = 2000;
  c.wAlarm = sim.state.tick + 1e6;
  for (let k = 0; k < 6; k++) sim.actions.spawnBandits(c.cx + 12.5, c.cy + k, 1);
  for (let i = 0; i < T; i++) {
    sim.tick();
    const a = process.hrtime.bigint();
    orig(sim);
    tDev += process.hrtime.bigint() - a;
  }
  const ms = Number(tDev) / 1e6 / T;
  log('Geräte (Dauer-Alarm, ' + (c.wall.devices || []).length + ' Geräte):', ms.toFixed(4), 'ms je Aufruf, läuft alle 3 Ticks →', (ms / 3).toFixed(4), 'ms/Tick; ohne Krieg/Alarm fast 0');
  assert(ms / 3 < 0.05, 'Geräte zu teuer');
});


// [walls] Megastadt (Faschismus 9.10 B): Ring für ~600 Einwohner dicht, Tore erreichbar, Planung schnell
test('9 Megastadt: Ring um eine künstlich große Stadt (600 Einwohner) dicht, Tore erreichbar, Planung ≤ 20 ms', function () {
  const world = meadowWorld(220, 160, {});
  const sim = makeSim({ seed: 'mega', world: world, populate: 0, animals: false, laws: { wars: false, disasters: false, newRealms: false, govChanges: false, camps: false } });
  const r = sim.actions.spawnSettlers(110, 80, 30, 'fascism', 'human');
  assert(r, 'keine Stadt');
  const c = sim._cities.get(r.cityId), st = sim.state, W = st.W;
  // dichte Bebauung: Häuser (2×2) im Umkreis 22 um das Zentrum, mit Gassen
  let houses = 0;
  for (let y = c.cy - 22; y <= c.cy + 22; y += 3) for (let x = c.cx - 22; x <= c.cx + 22; x += 3) {
    if (Math.hypot(x - c.cx, y - c.cy) > 22 || Math.abs(x - c.cx) < 3 && Math.abs(y - c.cy) < 3) continue;
    const h = WW.Structs.create(sim, 'house', x, y, c.id, { level: 3, built: true });
    if (h) houses++;
  }
  WW.Growth.claimTiles(sim, c, (() => { const t = []; for (let y = c.cy - 34; y <= c.cy + 34; y++) for (let x = c.cx - 34; x <= c.cx + 34; x++) t.push(y * W + x); return t; })());
  WW.Cities.refreshLists(sim, c);
  c.pop = 600;
  // Planung messen (mehrfach, Mittel und Maximum)
  const times = [];
  for (let n = 0; n < 30; n++) {
    const t0 = process.hrtime.bigint();
    assert(WW.Walls.plan(sim, c, WW.CONFIG.WALL_MARGIN, 1, false), 'Ring nicht geplant');
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const ring = c.wall.plan.length;
  for (const s of st.structs.slice()) if (!s.dead && s.cityId === c.id && WW.Structs.isWallish(s) && !s.built) WW.Structs.complete(sim, s);
  WW.Walls.refreshCounts(sim, c);
  const lk = leaks(sim, c);
  // Tore erreichbar: eigener Weg vom Zentrum weit nach draußen
  const out = (c.cy - 60) * W + c.cx;
  sim._pathBudget = 1e9;
  const p = WW.Path.find(sim, c.cy * W + c.cx, out, { k: c.kingdomId, limit: 200000 });
  // Erweiterung (größerer Ring) ebenfalls schnell
  c.noSpace = true; c.wall.plannedYear = -99; c.wall.state = 'done'; c.wall.level = 1;
  const t1 = process.hrtime.bigint();
  const ex = WW.Walls.plan(sim, c, WW.CONFIG.WALL_MARGIN, 1, true);
  const tEx = Number(process.hrtime.bigint() - t1) / 1e6;
  const warm = times.slice(5).sort((a, b) => a - b), mean = warm[warm.length >> 1], max = warm[Math.floor(warm.length * 0.9)];
  log('Häuser', houses, '· Ringkacheln', ring, '· Tore', c.wall.gates.length, '· dicht', !lk.leak, '(Innenfläche ' + lk.n + ')', '· Weg nach draußen', !!p,
    '· Planung: erste (kalt)', times[0].toFixed(1), 'ms, Median', mean.toFixed(1), 'ms, 90 %', max.toFixed(1), 'ms · Erweiterung', tEx.toFixed(1), 'ms', ex ? '' : '(keine Erweiterung möglich)');
  assert(!lk.leak, 'Ring undicht bei ' + lk.at);
  assert(c.wall.gates.length >= 1 && p, 'Tore nicht erreichbar');
  assert(mean <= 20, 'Ringplanung zu langsam: Median ' + mean.toFixed(1) + ' ms (90 %: ' + max.toFixed(1) + ', Erweiterung ' + tEx.toFixed(1) + ')');
});

console.log('\n===== Ergebnis');
for (const r of results) console.log((r.ok ? '  ok    ' : '  FEHLER') + '  ' + r.name + '  (' + (r.ms / 1000).toFixed(1) + ' s)' + (r.ok ? '' : '  -> ' + r.err.message));
const bad = results.filter(r => !r.ok).length;
console.log(bad ? '\n' + bad + ' von ' + results.length + ' Tests fehlgeschlagen.' : '\nAlle ' + results.length + ' Tests bestanden.');
process.exitCode = bad ? 1 : 0;
