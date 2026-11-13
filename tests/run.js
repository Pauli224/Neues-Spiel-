// Testsuite der Simulation: node tests/run.js [filter]
'use strict';
const WW = require('./load.js').load();
const ASCII = require('./ascii.js');

const filter = process.argv[2] || '';
const results = [];
let currentLog = [];
function log() { const s = Array.prototype.join.call(arguments, ' '); currentLog.push(s); console.log('    ' + s.replace(/\n/g, '\n    ')); }
function assert(cond, msg) { if (!cond) throw new Error('Annahme verletzt: ' + msg); }

function test(name, fn) {
  if (filter && name.toLowerCase().indexOf(filter.toLowerCase()) < 0) return;
  console.log('\n=== ' + name);
  currentLog = [];
  const t0 = Date.now();
  try {
    fn();
    results.push({ name: name, ok: true, ms: Date.now() - t0 });
    console.log('  BESTANDEN (' + (Date.now() - t0) + ' ms)');
  } catch (e) {
    results.push({ name: name, ok: false, ms: Date.now() - t0, err: e });
    console.log('  FEHLGESCHLAGEN: ' + (e && e.stack || e));
  }
}

// --------------------------------------------------------------------------
// Hilfen
// --------------------------------------------------------------------------
function makeSim(o) { const sim = WW.Sim.create(o); sim._throwErrors = true; return sim; }
function run(sim, n, every, fn) {
  for (let i = 1; i <= n; i++) {
    sim.tick();
    if (every && i % every === 0 && fn && fn(i) === true) return i;
  }
  return n;
}
function isNum(v) { return typeof v === 'number' && isFinite(v); }

// Invarianten: keine NaN, alle im Raster, niemand auf Sperrkachel, Lager nie negativ
function checkInvariants(sim, where) {
  const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
  for (const u of st.units) {
    if (u.dead) continue;
    assert(isNum(u.x) && isNum(u.y) && isNum(u.hp) && isNum(u.age), where + ': Einheit ' + u.id + ' hat NaN');
    assert(u.x >= 0 && u.y >= 0 && u.x < W && u.y < H, where + ': Einheit ' + u.id + ' außerhalb (' + u.x + ',' + u.y + ')');
    const i = Math.floor(u.y) * W + Math.floor(u.x);
    assert(LUT.walk[st.terrain[i]] > 0, where + ': Einheit ' + u.id + ' (' + u.role + ') auf unbegehbarem Gelände ' + WW.TERRAIN[st.terrain[i]].key);
    const s = sim._structs.get(st.structAt[i]);
    if (s && s.built && (s.type === 'wall' || s.type === 'tower')) assert(false, where + ': Einheit ' + u.id + ' steht auf ' + s.type);
    if (s && s.built && s.type === 'gate') assert(WW.Path.passable(sim, i, u.kingdomId), where + ': Einheit ' + u.id + ' steht auf feindlichem Tor');
    assert(sim._units.get(u.id) === u, where + ': Einheiten-Index kaputt');
  }
  for (const a of st.animals) {
    if (a.dead) continue;
    assert(isNum(a.x) && isNum(a.y) && a.x >= 0 && a.y >= 0 && a.x < W && a.y < H, where + ': Tier ' + a.id + ' kaputt');
  }
  const stocks = [];
  for (const c of st.cities) stocks.push(['Stadt ' + c.name, c.stock]);
  for (const k of st.kingdoms) if (k.stock) stocks.push(['Reich ' + k.name, k.stock]);
  for (const p of stocks) for (const r of ['food', 'wood', 'stone', 'gold']) {
    assert(isNum(p[1][r]) && p[1][r] >= 0, where + ': ' + p[0] + ' Lager ' + r + ' = ' + p[1][r]);
  }
  for (const c of st.cities) assert(isNum(c.happiness) && isNum(c.pop), where + ': Stadtwerte NaN');
  for (const s of st.structs) {
    if (s.dead) continue;
    assert(isNum(s.hp) && isNum(s.progress), where + ': Bauwerk NaN');
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) assert(st.structAt[(s.y + dy) * W + s.x + dx] === s.id, where + ': structAt passt nicht zu ' + s.type + ' ' + s.id);
  }
  for (const k of st.kingdoms) for (const id of k.cityIds) assert(sim._cities.get(id) && sim._cities.get(id).kingdomId === k.id, where + ': Reich/Stadt-Zuordnung kaputt');
}

// Große Wiese mit Wald und Hügeln am Rand (für Mauer- und Kriegstests)
function meadowWorld(W, H, opt) {
  opt = opt || {};
  const T = WW.T, N = W * H;
  const terrain = new Uint8Array(N), variant = new Uint8Array(N), height = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    let t = T.GRASS;
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e < 2) t = T.WATER; else if (e < 3) t = T.SAND;
    else if ((x * 7 + y * 13) % 97 < 3 && e > 6) t = T.FOREST;
    if (e >= 3 && e < 7 && ((x + y) % 5 < 3)) t = T.FOREST;
    // Wald- und Hügelflecken um jeden Startplatz (wie bei echten Startplätzen: Holz und Stein in Reichweite)
    for (const sp of (opt.spots || [{ x: W >> 1, y: H >> 1 }])) {
      const fx = x - sp.x + 14, fy = y - sp.y - 6; if (fx * fx + fy * fy < 16 + ((x * 13 + y * 7) % 5)) t = T.FOREST;
      const gx = x - sp.x - 4, gy = y - sp.y + 15; if (gx * gx + gy * gy < 12) t = T.FOREST;
      const hx = x - sp.x - 13, hy = y - sp.y + 7; if (hx * hx + hy * hy < 10) t = T.HILL;
    }
    if (opt.hills && e >= 3 && e < 6 && x > W * 0.6) t = T.HILL;
    if (opt.river && x === Math.floor(W * 0.5) + (y % 7 < 3 ? 1 : 0) && e >= 2) t = T.RIVER;
    terrain[i] = t; variant[i] = (x * 31 + y * 17) & 255; height[i] = 130;
  }
  return { W: W, H: H, terrain: terrain, variant: variant, height: height, startSpots: opt.spots || [{ x: W >> 1, y: H >> 1 }], name: 'Testwiese' };
}

// Flutfüllung vom Zentrum: Mauern, Türme, Tore (auch Baustellen von Toren nicht) und unbegehbares Gelände sperren,
// Diagonale nur, wenn beide Nachbarn frei sind. true = Kartenrand erreicht (undicht)
function leaks(sim, city) {
  const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
  const blocked = (i) => {
    if (LUT.walk[st.terrain[i]] <= 0 || LUT.water[st.terrain[i]] && st.terrain[i] !== WW.T.RIVER) return true;
    const s = sim._structs.get(st.structAt[i]);
    if (s && s.built && (s.type === 'wall' || s.type === 'tower' || s.type === 'gate')) return true;
    if (s && (s.type === 'wall' || s.type === 'tower' || s.type === 'gate') && s.built) return true;
    return LUT.water[st.terrain[i]] === 1 && st.terrain[i] !== WW.T.RIVER;
  };
  const seen = new Uint8Array(W * H);
  const start = city.cy * W + city.cx;
  const q = [start]; seen[start] = 1;
  const DX = WW.Path.DX, DY = WW.Path.DY;
  let n = 0;
  while (q.length) {
    const i = q.pop(); n++;
    const x = i % W, y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) return { leak: true, n: n, at: [x, y] };
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (seen[j] || blocked(j)) continue;
      if (d >= 4 && (blocked(y * W + nx) || blocked(ny * W + x))) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return { leak: false, n: n };
}

// Weg Zentrum -> weit draußen für das eigene Reich?
function pathOut(sim, city) {
  const st = sim.state, W = st.W;
  sim._pathBudget = 1e9;
  const from = city.cy * W + city.cx;
  // Ziel: begehbare Kachel weit außerhalb des Rings
  let goal = -1, bd = -1;
  for (let i = 0; i < W * st.H; i++) {
    if (st.inRing[i] !== -1 || WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0 || sim.block[i]) continue;
    const x = i % W, y = (i - x) / W;
    const d = Math.abs(x - city.cx) + Math.abs(y - city.cy);
    if (d > 16 && d < 30 && (bd < 0 || d < bd)) { bd = d; goal = i; }
  }
  if (goal < 0) return null;
  return WW.Path.find(sim, from, goal, { k: city.kingdomId, race: city.race, limit: 1e6 });
}

function countEvents(sim, type, kid) {
  return sim.state.events.filter(e => e.type === type && (kid == null || e.kingdomId === kid)).length;
}

// --------------------------------------------------------------------------
// 1. Dauerlauf
// --------------------------------------------------------------------------
test('1 Dauerlauf (30 000 Ticks, 3 Stämme)', function () {
  const sim = makeSim({ seed: 'dauerlauf-7', size: 'medium', populate: 3 });
  log('Welt', sim.state.W + '×' + sim.state.H, '"' + sim.state.worldName + '"', 'Reiche:', sim.state.kingdoms.map(k => k.name + ' (' + k.race + ')').join(', '));
  const t0 = Date.now();
  let maxU = 0;
  run(sim, 30000, 250, (i) => { checkInvariants(sim, 'Tick ' + i); maxU = Math.max(maxU, sim.state.units.length); });
  const ms = (Date.now() - t0) / 30000;
  const st = sim.state;
  log('Jahr', st.year, '· Einheiten', st.units.length, '(max ' + maxU + ') · Städte', st.cities.length, '· Reiche', st.kingdoms.length, '· Tiere', st.animals.length, '· Ereignisse', st.eventSeq, '·', ms.toFixed(3), 'ms/Tick');
  const types = {};
  for (const e of st.events) types[e.type] = (types[e.type] || 0) + 1;
  log('Ereignisse (letzte 400):', Object.keys(types).map(k => k + ':' + types[k]).join(' '));
  log('Todesursachen:', JSON.stringify(sim._deaths || {}));
  for (const c of st.cities) log('  ' + c.name.padEnd(18), WW.GOVERNMENTS[sim._kingdoms.get(c.kingdomId).gov].name.padEnd(16), 'Einw.', String(c.pop).padStart(3), 'Wohnr.', String(c.housing).padStart(3), 'Mauer', c.wall.style, c.wall.state, c.wall.built + '/' + c.wall.total);
  assert(st.units.length > 20, 'Bevölkerung ist (fast) ausgestorben');
  assert(st.cities.length >= 2, 'zu wenige Städte');
});

// --------------------------------------------------------------------------
// 2. Mauern
// --------------------------------------------------------------------------
test('2 Mauern (Ring geplant, gebaut, dicht, Tore, Steinausbau)', function () {
  const world = meadowWorld(110, 80, { hills: true, river: true, spots: [{ x: 40, y: 40 }] });
  const sim = makeSim({ seed: 'mauer', world: world, populate: 1, govs: ['monarchy'], races: ['human'], animals: false });
  const city = sim.state.cities[0];
  const k = sim._kingdoms.get(city.kingdomId);
  const gov = WW.GOVERNMENTS[k.gov];
  let tPlan = -1, tDone = -1, tStone = -1, tStoneDone = -1;
  run(sim, 40000, 10, (i) => {
    const w = city.wall;
    if (tPlan < 0 && w.state !== 'none') { tPlan = i; log('Ring geplant bei Tick', i, '(' + (i / 600).toFixed(1) + ' min), Einwohner', city.pop, 'Schwelle', gov.wallThreshold, 'Stücke', w.total, 'Tore', w.gates.length, 'Türme', w.towers.length); }
    if (tDone < 0 && w.level >= 1) {
      tDone = i;
      log('Ring fertig bei Tick', i, '(' + (i / 600).toFixed(1) + ' min)');
      log(ASCII.cityView(sim, city));
      const lk = leaks(sim, city);
      assert(!lk.leak, 'Ring ist undicht, Flut erreicht Rand bei ' + JSON.stringify(lk.at));
      log('Flutfüllung innen:', lk.n, 'Kacheln, kein Leck');
      assert(w.gates.length >= 1, 'kein Tor');
      const p = pathOut(sim, city);
      assert(p && p.length > 0, 'kein eigener Weg vom Zentrum nach draußen');
      log('Weg Zentrum → draußen:', p.length, 'Schritte; Tore:', w.gates.length);
    }
    if (tStone < 0 && w.state === 'upgrading' && w.target >= 2) { tStone = i; log('Steinausbau begonnen bei Tick', i, '(' + (i / 600).toFixed(1) + ' min)'); }
    if (tStoneDone < 0 && w.level >= 2) {
      tStoneDone = i; log('Steinmauer fertig bei Tick', i, '(' + (i / 600).toFixed(1) + ' min)');
      log(ASCII.cityView(sim, city));
      const lk = leaks(sim, city);
      assert(!lk.leak, 'Steinring ist undicht');
      return true;
    }
    if (i % 2000 === 0) checkInvariants(sim, 'Tick ' + i);
  });
  assert(tPlan > 0, 'Ring wurde nie geplant (Einwohner ' + city.pop + ')');
  assert(tDone > 0, 'Ring wurde nie fertig (' + city.wall.built + '/' + city.wall.total + ')');
  assert(tStoneDone > 0, 'kein Steinausbau (Stand: ' + city.wall.state + ', Stufe ' + city.wall.level + ', Stein ' + Math.round(city.stock.stone) + ')');
  // Regierung mit Barrikaden: Lücken gewollt, aber Plan entsteht
  log('Tempo-Ziele (1× = 600 Ticks/min): Palisade begonnen', (tPlan / 600).toFixed(1), 'min, Stein begonnen', (tStone / 600).toFixed(1), 'min');
});

test('2b Mauern bei allen Regierungen und Völkern', function () {
  const rows = [];
  for (const gk of WW.GOV_KEYS) {
    const race = WW.RACE_KEYS[WW.GOV_KEYS.indexOf(gk) % WW.RACE_KEYS.length];
    const world = meadowWorld(100, 76, { hills: true, spots: [{ x: 50, y: 38 }] });
    const sim = makeSim({ seed: 'm2-' + gk, world: world, populate: 1, govs: [gk], races: [race], animals: false });
    const city = sim.state.cities[0];
    sim._kingdoms.get(city.kingdomId).govLocked = true;
    let tPlan = -1, tDone = -1;
    run(sim, 24000, 20, (i) => {
      if (tPlan < 0 && city.wall.state !== 'none') tPlan = i;
      if (tDone < 0 && city.wall.level >= 1) { tDone = i; return true; }
    });
    const lk = tDone > 0 ? leaks(sim, city) : { leak: null };
    const g = WW.GOVERNMENTS[gk];
    rows.push(gk.padEnd(10) + ' ' + race.padEnd(6) + ' geplant ' + (tPlan > 0 ? (tPlan / 600).toFixed(1) + ' min' : '—').padEnd(9) + ' fertig ' + (tDone > 0 ? (tDone / 600).toFixed(1) + ' min' : '—').padEnd(9) + ' Stil ' + city.wall.style.padEnd(9) + ' dicht ' + (lk.leak === null ? '?' : (!lk.leak)) + ' Einw. ' + city.pop);
    assert(tPlan > 0, gk + ': kein Ring geplant');
    assert(tDone > 0, gk + ': Ring nicht fertig (' + city.wall.built + '/' + city.wall.total + ')');
    if (!g.barricades) assert(!lk.leak, gk + ': Ring undicht');
    else assert(city.wall.gaps.length > 0, 'Barrikaden ohne Lücken');
  }
  for (const r of rows) log(r);
});

// --------------------------------------------------------------------------
// 3. Regierungen
// --------------------------------------------------------------------------
test('3 Regierungen (Werte, Zentrum, Titel, Wahl, Erbfolge, Sperre, Anarchie)', function () {
  const sim = makeSim({ seed: 'gov-1', size: 'medium', populate: 3 });
  run(sim, 600);
  const k = sim.state.kingdoms[0];
  const city = sim._cities.get(k.cityIds[0]);
  for (const gk of WW.GOV_KEYS) {
    assert(sim.actions.setGovernment(k.id, gk, { lock: true }), 'setGovernment ' + gk);
    run(sim, 30);
    const g = WW.GOVERNMENTS[gk];
    const ctr = sim._structs.get(city.centerId);
    assert(k.gov === gk && k.govLocked, gk + ': Regierung/Sperre nicht gesetzt');
    assert(ctr && (ctr.restyle || ctr.style) === gk, gk + ': Zentrum wird nicht im Stil ' + gk + ' gebaut (' + (ctr && ctr.style) + ')');
    // Umbau: Zentrum ist sofort Baustelle und wird von Baumeistern fertig gestellt
    run(sim, 600, 20, () => !ctr.restyle);
    assert(ctr.style === gk && !ctr.restyle, gk + ': Zentrum nach 600 Ticks nicht umgebaut');
    const g2 = WW.GOVERNMENTS[gk];
    for (const s of sim.state.structs) {
      if (s.dead || s.cityId !== city.id) continue;
      if (s.type === 'market') assert(g2.build.market.max > 0, gk + ': Markt nicht umgewidmet');
      if (s.type === 'barracks') assert(g2.build.barracks.max > 0, gk + ': Kaserne nicht umgewidmet');
      if (s.type === 'tower') assert(g2.build.towerSpacing > 0, gk + ': Turm in Regierung ohne Türme');
      assert(s.style === gk || s.restyle === gk, gk + ': ' + s.type + ' ohne neuen Stil');
    }
    if (g.noLeader) assert(k.leaderId === -1 && k.leaderTitle === '', gk + ': Anarchie hat Anführer');
    else {
      const l = sim._units.get(k.leaderId);
      assert(l && l.role === 'leader', gk + ': kein Anführer');
      assert(k.leaderTitle === (l.female ? g.titleF : g.titleM), gk + ': Titel ' + k.leaderTitle);
    }
    assert(k.name.indexOf(g.realm) === 0, gk + ': Reichsname ' + k.name);
    assert(!!WW.Cities.stock(sim, city) === true, 'Lager');
    if (g.sharedStock) assert(k.stock && WW.Cities.stock(sim, city) === k.stock, 'Kommunismus ohne gemeinsames Lager');
    else assert(!k.stock, gk + ': gemeinsames Lager übrig');
    log(gk.padEnd(10), 'Zentrum', ctr.style, '(' + g.centerName + ')', '· Anführer', (k.leaderTitle + ' ' + k.leaderName).trim(), '· Mauer ab', g.wallThreshold, '· Soldatenanteil', g.soldierShare);
  }

  // Demokratie: Wahl innerhalb von 7 Jahren
  sim.actions.setGovernment(k.id, 'democracy');
  const y0 = sim.state.year, e0 = countEvents(sim, 'election', k.id);
  run(sim, 7 * WW.CONFIG.TPY, 60, () => countEvents(sim, 'election', k.id) > e0);
  assert(countEvents(sim, 'election', k.id) > e0, 'keine Wahl innerhalb von 7 Jahren');
  const ev = sim.state.events.filter(e => e.type === 'election' && e.kingdomId === k.id).pop();
  log('Wahl nach', sim.state.year - y0, 'Jahren:', ev.text);

  // Monarchie: Erbfolge
  sim.actions.setGovernment(k.id, 'monarchy');
  run(sim, 30);
  const old = sim._units.get(k.leaderId);
  assert(old, 'kein König');
  const oldName = k.leaderName;
  const s0 = countEvents(sim, 'succession', k.id);
  WW.Units.kill(sim, old, 'age');
  run(sim, 40);
  assert(countEvents(sim, 'succession', k.id) > s0, 'keine Erbfolge-Meldung');
  assert(k.leaderId !== old.id && sim._units.get(k.leaderId), 'kein Nachfolger');
  log('Erbfolge:', oldName, '→', k.leaderName, '·', sim.state.events.filter(e => e.type === 'succession').pop().text);

  // Gesperrt + Gesetz aus: bleibt 20 000 Ticks
  sim.actions.setLaw('govChanges', false);
  sim.actions.setGovernment(k.id, 'fascism', { lock: true });
  const others = sim.state.kingdoms.filter(o => o !== k);
  for (const o of others) sim.actions.setGovernment(o.id, 'anarchy', { lock: true });
  let anarchyWar = 0;
  run(sim, 20000, 200, () => {
    checkInvariants(sim, 'Sperrlauf');
    assert(k.dead || k.gov === 'fascism', 'Regierung hat sich trotz Sperre geändert: ' + k.gov);
  });
  for (const e of sim.state.events) {
    if ((e.type === 'war' || e.type === 'holyWar') && others.some(o => o.id === e.kingdomId)) anarchyWar++;
  }
  log('Nach 20 000 Ticks gesperrt:', k.dead ? '(Reich untergegangen)' : k.gov, '· Kriegserklärungen von Anarchien:', anarchyWar);
  assert(anarchyWar === 0, 'Anarchie hat Krieg erklärt');
});

test('3b Regierungen fühlen sich verschieden an', function () {
  const rows = [];
  const stats = {};
  for (const gk of WW.GOV_KEYS) {
    const world = meadowWorld(100, 76, { hills: true, spots: [{ x: 50, y: 38 }] });
    const sim = makeSim({ seed: 'feel', world: world, populate: 1, govs: [gk], races: ['human'], animals: false });
    const k = sim.state.kingdoms[0];
    k.govLocked = true;
    run(sim, 12 * WW.CONFIG.TPY);
    const c = sim._cities.get(k.cityIds[0]);
    const types = {};
    for (const e of sim.state.events) if (e.kingdomId === k.id) types[e.type] = (types[e.type] || 0) + 1;
    stats[gk] = { pop: c.pop, sold: c.jobs.soldier || 0, hap: c.happiness, gold: WW.Cities.stock(sim, c).gold, wall: c.wall.level, types: types, traders: c.jobs.trader || 0 };
    rows.push(gk.padEnd(10) + ' Einw. ' + String(c.pop).padStart(3) + ' Soldaten ' + String(c.jobs.soldier || 0).padStart(2) + ' Laune ' + String(Math.round(c.happiness)).padStart(3) + ' Gold ' + String(Math.round(WW.Cities.stock(sim, c).gold)).padStart(4) + ' Mauer ' + c.wall.style + '/' + c.wall.level + ' Händler ' + (c.jobs.trader || 0) + ' · ' + Object.keys(types).filter(t => !/found|tier|firstHouse|wall/.test(t)).map(t => t + '×' + types[t]).join(' '));
  }
  for (const r of rows) log(r);
  assert(stats.fascism.sold > stats.democracy.sold, 'Faschismus hat nicht mehr Soldaten als Demokratie');
  assert(stats.democracy.hap > stats.fascism.hap + 15, 'Demokratie nicht deutlich glücklicher als Faschismus');
  assert(stats.republic.gold > stats.monarchy.gold, 'Handelsrepublik nicht reicher als Monarchie');
  assert(stats.communism.gold === 0, 'Kommunismus hat Gold');
  assert(stats.democracy.types.election > 0, 'keine Wahl');
  assert(stats.communism.types.fiveYearPlan > 0, 'kein Fünfjahresplan');
  assert(stats.fascism.types.shamElection > 0 || stats.fascism.types.paranoia > 0, 'Faschismus ohne eigene Ereignisse');
  assert(stats.anarchy.sold === 0, 'Anarchie hat Soldaten');
});

// --------------------------------------------------------------------------
// 3c. Regierungen selbst wählen
// --------------------------------------------------------------------------
test('3c Reiche wählen ihre Regierung selbst (6 Stämme, 40 000 Ticks)', function () {
  const sim = makeSim({ seed: 'selbstwahl-2', size: 'medium', populate: 6 });
  assert(sim.state.kingdoms.every(k => k.gov === 'tribe'), 'Startreiche sind nicht alle Stämme');
  const seen = {};
  run(sim, 40000, 500, () => { for (const k of sim.state.kingdoms) seen[k.gov] = (seen[k.gov] || 0) + 1; if (sim.state.tick % 5000 === 0) checkInvariants(sim, 'Selbstwahl'); });
  const kinds = Object.keys(seen).filter(g => g !== 'tribe');
  const evs = sim.state.events.filter(e => /govChoice|revolution|regimeFall|coup|strongman|reform|collapse|plenumVote/.test(e.type));
  for (const e of evs.slice(-6)) log('  [' + e.year + '] ' + e.type + ': ' + e.text);
  log('Von selbst entstandene Regierungsformen:', kinds.join(', '), '· Wechsel-Ereignisse (letzte 400):', evs.length);
  assert(kinds.length >= 3, 'nur ' + kinds.length + ' Regierungsformen entstanden');
});

// --------------------------------------------------------------------------
// 4. Krieg
// --------------------------------------------------------------------------
// Zwei Reiche auf einer Wiese, Vorlauf ohne Krieg, bis beide ummauert sind
function warSetup(seed, govA, govB, raceA, raceB, minLevelB) {
  const world = meadowWorld(120, 70, { hills: true, spots: [{ x: 32, y: 35 }, { x: 88, y: 35 }] });
  const sim = makeSim({ seed: seed, world: world, populate: 2, govs: [govA, govB], races: [raceA, raceB], animals: false });
  const [a, b] = sim.state.kingdoms;
  a.govLocked = b.govLocked = true;
  sim.actions.setLaw('wars', false);
  sim.actions.setLaw('disasters', false);
  const ca = sim._cities.get(a.cityIds[0]), cb = sim._cities.get(b.cityIds[0]);
  const lvB = minLevelB || 1;
  // fertig = Ring geschlossen auf Stufe lvB (ein laufender Ausbau auf die nächste Stufe lässt alle Stücke stehen)
  const ready = (c, lv) => c.wall.level >= lv && (c.wall.state === 'done' || c.wall.state === 'upgrading');
  run(sim, 60 * WW.CONFIG.TPY, 120, () => ready(ca, 1) && ready(cb, lvB) && sim.state.year >= 8);
  return { sim: sim, a: a, b: b, ca: ca, cb: cb };
}

test('4 Krieg (Marsch, Angriff auf Mauer/Tor, Kampf, Ende)', function () {
  const { sim, a, b, ca, cb } = warSetup('krieg', 'fascism', 'monarchy', 'orc', 'human');
  sim.actions.setLaw('wars', true);
  log('Vor dem Krieg (Jahr ' + sim.state.year + '):', a.name, ca.pop, 'Einw.,', ca.jobs.soldier || 0, 'Soldaten, Mauer', ca.wall.style + '/' + ca.wall.level, '|', b.name, cb.pop, 'Einw.,', cb.jobs.soldier || 0, 'Soldaten, Mauer', cb.wall.style + '/' + cb.wall.level);
  assert(ca.wall.level >= 1 && cb.wall.level >= 1, 'Vorlauf: Städte nicht ummauert');
  assert(sim.actions.setRelation(a.id, b.id, 'war'), 'setRelation war');
  assert(a.relations[b.id].status === 'war' && b.relations[a.id].status === 'war', 'Status nicht Krieg');
  const d0 = (sim._deaths && sim._deaths.battle) || 0, e0 = sim.state.eventSeq;
  let wallHits = 0, ended = -1, firstHit = -1;
  const origDamage = WW.Structs.damage;
  WW.Structs.damage = function (sim2, s, amt, fx) { if (WW.Structs.isWallish(s) && fx === 'hit') { wallHits++; if (firstHit < 0) firstHit = sim2.state.tick; } return origDamage(sim2, s, amt, fx); };
  const t0 = sim.state.tick;
  try {
    run(sim, 60000, 50, (i) => {
      if (i % 1000 === 0) checkInvariants(sim, 'Krieg ' + i);
      const ra = a.relations[b.id];
      if (a.dead || b.dead || !ra || ra.status !== 'war') { ended = i; return true; }
    });
  } finally { WW.Structs.damage = origDamage; }
  const battle = ((sim._deaths && sim._deaths.battle) || 0) - d0;
  const evs = sim.state.events.filter(e => e.id > e0 && /war|peace|conquest|fallen|armyMarch|wallBreach|buyPeace|mobilize|occupation/.test(e.type));
  for (const e of evs.slice(0, 10)) log('  [' + e.year + '] ' + e.text);
  log('Gefallene:', battle, '· Treffer an Mauern/Toren:', wallHits, '(erster nach', firstHit > 0 ? ((firstHit - t0) / WW.CONFIG.TPY).toFixed(1) + ' Jahren)' : '–)', '· Ende nach', ended > 0 ? (ended / WW.CONFIG.TPY).toFixed(1) + ' Jahren' : 'nie');
  assert(evs.some(e => e.type === 'armyMarch'), 'kein Heer ist ausgezogen');
  assert(battle > 0, 'keine Kämpfe');
  assert(wallHits > 0, 'Mauern nahmen keinen Schaden');
  assert(ended > 0, 'Krieg endet nicht');
});

// Belagerung: gleicher Angriff auf dieselbe Stadt. mode: 'stone' | 'palisade' | 'none'; engines: Rammböcke/Katapulte dabei
function siege(save, mode, engines, maxTicks) {
  const sim = WW.Sim.load(save); sim._throwErrors = true;
  sim._noSiegeEngines = true;   // Gerät nur, wenn der Test es ausdrücklich mitgibt
  const [a, b] = sim.state.kingdoms;
  const ca = sim._cities.get(a.cityIds[0]), cb = sim._cities.get(b.cityIds[0]);
  if (mode === 'none') WW.Walls.demolishAll(sim, cb);
  if (mode === 'palisade') {
    // dieselbe Mauer, aber nur als Palisade
    for (const s of sim.state.structs) if (!s.dead && s.cityId === cb.id && WW.Structs.isWallish(s)) {
      s.level = 1; s.mat = 'palisade'; s.upgradeTo = 0; s.maxHp = WW.Structs.maxHpFor(sim, s); s.hp = s.maxHp;
    }
    cb.wall.level = 1; cb.wall.target = 1; cb.wall.state = 'done'; cb.wall.style = 'palisade';
    cb.noSpace = false; cb.wall.plannedYear = sim.state.year + 100;
  }
  if (mode === 'stone') { cb.wall.plannedYear = sim.state.year + 100; }
  const made = [];
  for (let n = 0; n < 24; n++) {
    const u = WW.Units.create(sim, { x: cb.cx + 16 + (n % 4), y: cb.cy - 3 + Math.floor(n / 4), role: 'soldier', kingdomId: a.id, cityId: ca.id, race: 'orc', age: 20 });
    if (u) { WW.Units.setRole(sim, u, engines && n < 2 ? 'ram' : (engines && n < 4 ? 'catapult' : 'soldier')); made.push(u); }
  }
  for (const u of made) u.order = { kind: 'march', city: cb.id, k: b.id };
  sim.actions.setLaw('wars', true);
  sim.actions.setRelation(a.id, b.id, 'war');
  const t0 = sim.state.tick;
  let fell = -1;
  for (let i = 1; i <= (maxTicks || 30000); i++) {
    sim.tick();
    if (i % 50 === 0) {
      if (cb.dead || cb.kingdomId !== b.id || b.dead) { fell = sim.state.tick - t0; break; }
      if (a.dead) break;
      const r = a.relations[b.id];
      if (r && r.status !== 'war') sim.actions.setRelation(a.id, b.id, 'war');
      if (r && b.relations[a.id]) { r.weariness = 0; b.relations[a.id].weariness = 0; }   // Belagerung ohne Friedensschluss
      if (i % 1000 === 0) checkInvariants(sim, 'Belagerung');
    }
  }
  return { sim: sim, fell: fell, city: cb, att: a, def: b };
}

test('4b Belagerung: Mauer hält länger, Stein länger als Palisade, mit Gerät machbar', function () {
  const { sim, cb } = warSetup('belagerung', 'fascism', 'monarchy', 'orc', 'dwarf', 2);
  log('Verteidiger:', cb.name, 'Mauer', cb.wall.style + '/' + cb.wall.level, cb.wall.state, cb.wall.built + '/' + cb.wall.total, 'Türme', cb.wall.towers.length, '· Jahr', sim.state.year);
  assert(cb.wall.level >= 2 && (cb.wall.state === 'done' || cb.wall.state === 'upgrading') && !leaks(sim, cb).leak, 'Vorlauf: keine fertige, dichte Steinmauer (' + cb.wall.state + ' Stufe ' + cb.wall.level + ')');
  const save = sim.serialize();
  const LIM = 24000;
  const open = siege(save, 'none', false, LIM);
  const stoneNo = siege(save, 'stone', false, LIM);
  const stoneEng = siege(save, 'stone', true, LIM);
  const palEng = siege(save, 'palisade', true, LIM);
  const fmt = (r) => r.fell > 0 ? (r.fell / WW.CONFIG.TPY).toFixed(1) + ' Jahre' : 'hält > ' + (LIM / WW.CONFIG.TPY).toFixed(0) + ' Jahre';
  log('Ohne Mauer:', fmt(open), '· Palisade mit Gerät:', fmt(palEng), '· Stein mit Gerät:', fmt(stoneEng), '· Stein ohne Gerät:', fmt(stoneNo));
  assert(open.fell > 0, 'Stadt ohne Mauer fällt nicht');
  assert(stoneEng.fell > 0, 'Steinstadt fällt auch mit Belagerungsgerät nicht');
  assert(palEng.fell > 0 && stoneEng.fell > palEng.fell * 1.3, 'Stein hält nicht deutlich länger als Palisade');
  assert(stoneNo.fell < 0 || stoneNo.fell > stoneEng.fell * 2, 'ohne Gerät fast genauso schnell wie mit');
  assert(stoneEng.fell > open.fell, 'Mauer bringt keinen Vorteil');
  // (c) Eroberte Stadt gehört dem Sieger und läuft stabil weiter
  const r = stoneEng, c = r.city;
  assert(!c.dead && c.kingdomId === r.att.id, 'eroberte Stadt gehört nicht dem Sieger');
  log('Erobert:', c.name, 'gehört jetzt', r.att.name, '· Loyalität', Math.round(c.loyalty));
  r.sim.actions.setRelation(r.att.id, r.def.id, 'peace');
  run(r.sim, 6000, 500, (i) => { checkInvariants(r.sim, 'nach Eroberung ' + i); });
  assert(r.sim._cities.get(c.id), 'eroberte Stadt ist danach verschwunden');
  log('6000 Ticks nach der Eroberung:', c.name, c.pop, 'Einw., Reich', (r.sim._kingdoms.get(c.kingdomId) || {}).name);
});

test('4d Reich ohne Stadt verschwindet sauber', function () {
  const sim = makeSim({ seed: 'untergang', size: 'small', populate: 3 });
  run(sim, 1200);
  const k = sim.state.kingdoms[0];
  for (const id of k.cityIds.slice()) WW.Cities.destroyCity(sim, sim._cities.get(id), 'cityAbandoned');
  for (const u of sim.state.units) if (u.kingdomId === k.id) WW.Units.kill(sim, u, 'test');
  run(sim, 100);
  assert(!sim._kingdoms.get(k.id) && sim.state.kingdoms.indexOf(k) < 0, 'Reich existiert noch');
  for (const o of sim.state.kingdoms) assert(!(k.id in o.relations), 'Beziehung zum Untergegangenen übrig');
  assert(sim.state.events.some(e => e.type === 'kingdomGone'), 'keine Chronik-Meldung');
  run(sim, 2000, 500, (i) => checkInvariants(sim, 'nach Untergang ' + i));
  assert(WW.Sim.load(sim.serialize()), 'Spielstand nach Untergang kaputt');
  log('Untergang gemeldet:', sim.state.events.filter(e => e.type === 'kingdomGone').pop().text);
});

// --------------------------------------------------------------------------
// 5. Speichern/Laden + Determinismus
// --------------------------------------------------------------------------
test('5 Speichern/Laden und Determinismus', function () {
  const mk = () => makeSim({ seed: 'det-3', size: 'small', populate: 3 });
  const A = mk(), B = mk();
  assert(A.hash() === B.hash(), 'Startzustand verschieden');
  run(A, 3000); run(B, 3000);
  assert(A.hash() === B.hash(), 'gleicher Seed + gleiche Ticks ergeben verschiedene Zustände');
  log('Hash nach 3000 Ticks gleich:', A.hash());
  // Unterbrechung mit Speichern/Laden
  const C = mk();
  run(C, 1700);
  const save = C.serialize();
  const D = WW.Sim.load(save);
  assert(D, 'Laden fehlgeschlagen');
  D._throwErrors = true;
  assert(D.serialize() === save, 'serialize(load(x)) != x');
  run(C, 1300); run(D, 1300);
  assert(C.hash() === D.hash(), 'nach Laden weitergelaufen: Zustand weicht ab');
  assert(C.hash() === A.hash(), 'mit Unterbrechung anders als ohne');
  log('Spielstand', (save.length / 1024).toFixed(0), 'KiB; nach Laden + 1300 Ticks identisch');
  assert(WW.Sim.load('kaputt') === null && WW.Sim.load('{"a":1}') === null, 'kaputter Spielstand nicht abgelehnt');
  // Abfragen nach dem Laden
  const c = D.state.cities[0];
  assert(D.query.cityAt(c.cx, c.cy) === c, 'cityAt nach Laden');
  assert(D.query.structAt(c.cx, c.cy).type === 'center', 'structAt nach Laden');
});

// --------------------------------------------------------------------------
// 6. Fuzz
// --------------------------------------------------------------------------
test('6 Gotteshandlungen-Fuzz (2000 Aktionen)', function () {
  const sim = WW.Sim.create({ seed: 'fuzz', size: 'small', populate: 3 });
  const r = WW.RNG.create('fuzz-aktionen');
  const W = sim.state.W, H = sim.state.H;
  const junk = [NaN, -1, 1e9, Infinity, -Infinity, null, undefined, 'x', {}, [], 0.5, -0.0001];
  const coord = (m) => r.chance(0.12) ? r.pick(junk) : r.range(-3, m + 3);
  const kid = () => { const ks = sim.state.kingdoms; return r.chance(0.1) ? r.pick(junk) : (ks.length ? r.pick(ks).id : 5); };
  const terr = () => r.chance(0.1) ? r.pick(junk) : r.int(WW.TERRAIN.length);
  const powers = WW.POWER_KEYS.concat(['nix', null]);
  const govs = WW.GOV_KEYS.concat(['kaiserreich', null]);
  const kinds = ['sheep', 'wolf', 'drache', null];
  const counts = {};
  for (let n = 0; n < 2000; n++) {
    const a = r.int(9);
    let name;
    switch (a) {
      case 0: name = 'paintTerrain'; sim.actions.paintTerrain(coord(W), coord(H), r.chance(0.1) ? r.pick(junk) : r.irange(0, 4), terr()); break;
      case 1: name = 'spawnSettlers'; sim.actions.spawnSettlers(coord(W), coord(H), r.chance(0.1) ? r.pick(junk) : r.irange(1, 8), r.pick(govs), r.chance(0.7) ? r.pick(WW.RACE_KEYS) : r.pick(junk)); break;
      case 2: name = 'spawnAnimal'; sim.actions.spawnAnimal(coord(W), coord(H), r.pick(kinds)); break;
      case 3: name = 'setGovernment'; sim.actions.setGovernment(kid(), r.pick(govs), r.chance(0.5) ? { lock: r.chance(0.5) } : r.pick(junk)); break;
      case 4: name = 'setGovLocked'; sim.actions.setGovLocked(kid(), r.chance(0.5)); break;
      case 5: name = 'setRelation'; sim.actions.setRelation(kid(), kid(), r.pick(['war', 'peace', 'alliance', 'quatsch', null])); break;
      case 6: name = 'strike'; sim.actions.strike(coord(W), coord(H), r.pick(powers)); break;
      case 7: name = 'setLaw'; sim.actions.setLaw(r.pick(WW.LAW_INFO).key + (r.chance(0.1) ? 'x' : ''), r.chance(0.5)); break;
      default: name = 'query';
        sim.query.cityAt(coord(W), coord(H)); sim.query.kingdomAt(coord(W), coord(H)); sim.query.unitNear(coord(W), coord(H), r.pick([1, 3, NaN]));
        sim.query.structAt(coord(W), coord(H)); sim.query.city(kid()); sim.query.kingdom(kid()); sim.query.unit(r.int(5000));
    }
    counts[name] = (counts[name] || 0) + 1;
    if (sim._lastError) throw new Error('Aktion ' + name + ' hat intern geworfen: ' + (sim._lastError.stack || sim._lastError));
    const t = r.irange(0, 6);
    for (let i = 0; i < t; i++) sim.tick();
    if (n % 50 === 0) { checkInvariants(sim, 'Fuzz ' + n); sim.drainFx(); sim.drainDirtyTiles(); }
  }
  run(sim, 2000, 200, (i) => checkInvariants(sim, 'Nachlauf ' + i));
  // Speichern/Laden nach dem Chaos
  const D = WW.Sim.load(sim.serialize());
  assert(D && D.serialize() === sim.serialize(), 'Spielstand nach Fuzz nicht stabil');
  log('Aktionen:', JSON.stringify(counts), '· Einheiten', sim.state.units.length, '· Reiche', sim.state.kingdoms.length);
});

// --------------------------------------------------------------------------
// 8. Wachstum
// --------------------------------------------------------------------------
test('8 Wachstum (Stufen, Stadterweiterung, Tochterstädte, 40 000 Ticks)', function () {
  const sim = makeSim({ seed: 'wachstum-1', size: 'medium', populate: 3 });
  const counts = {};
  const orig = sim.event;
  sim.event = function (type) { counts[type] = (counts[type] || 0) + 1; return orig.apply(this, arguments); };
  const pop0 = sim.state.units.length;
  const rows = [];
  let maxTier = 0, maxCities = 0;
  run(sim, 40000, 4000, (i) => {
    for (const c of sim.state.cities) maxTier = Math.max(maxTier, c.tier);
    for (const k of sim.state.kingdoms) maxCities = Math.max(maxCities, k.cityIds.length);
    rows.push('Jahr ' + String(sim.state.year).padStart(3) + ': ' + sim.state.units.length + ' Einwohner, ' + sim.state.cities.length + ' Städte, ' + sim.state.kingdoms.length + ' Reiche, größtes Reich ' + Math.max(0, ...sim.state.kingdoms.map(k => k.cityIds.length)) + ' Städte');
  });
  for (const r of rows) log(r);
  log('Ereignisse gesamt: Tochterstädte', counts.daughter || 0, '· Stadterweiterungen begonnen', counts.wallExpand || 0, 'fertig', counts.wallExpandDone || 0, '· Stufenaufstiege', counts.tier || 0, '· Steinmauern', counts.wallStoneDone || 0);
  const pop1 = sim.state.units.length;
  log('Bevölkerung', pop0, '→', pop1, '· höchste Stadtstufe', WW.CITY_TIERS[maxTier].name, '· meiste Städte in einem Reich', maxCities);
  assert(pop1 >= pop0 * 4, 'Bevölkerung kaum gewachsen');
  assert(maxCities >= 2, 'kein Reich mit mehr als einer Stadt');
  assert((counts.daughter || 0) >= 1, 'keine Tochterstadt');
  assert((counts.wallExpandDone || 0) >= 1, 'keine abgeschlossene Stadterweiterung');
  assert(maxTier >= 3, 'keine Großstadt');
});

// --------------------------------------------------------------------------
// 7. Leistung
// --------------------------------------------------------------------------
test('7 Leistung (~800 Einheiten auf 144×96)', function () {
  const sim = makeSim({ seed: 'leistung', size: 'medium', populate: 8 });
  run(sim, 3000);
  // auffüllen bis ~800 Einheiten
  let guard = 0;
  while (sim.state.units.length < 800 && guard++ < 400) {
    const c = sim.state.cities[guard % sim.state.cities.length];
    if (!c) break;
    sim.actions.spawnSettlers(c.cx + 0.5, c.cy + 0.5, 10, null, c.race);
  }
  run(sim, 200);
  const n0 = sim.state.units.length;
  const t0 = process.hrtime.bigint();
  const T = 2000;
  let worst = 0;
  for (let i = 0; i < T; i++) {
    const a = process.hrtime.bigint();
    sim.tick();
    const d = Number(process.hrtime.bigint() - a) / 1e6;
    if (d > worst) worst = d;
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / T;
  log('Einheiten', n0, '→', sim.state.units.length, '· Städte', sim.state.cities.length, '·', ms.toFixed(3), 'ms/Tick im Mittel · schlechtester Tick', worst.toFixed(2), 'ms');
  globalThis.__perf = ms;
  assert(ms < 1.5, 'zu langsam: ' + ms.toFixed(3) + ' ms/Tick');
});

// --------------------------------------------------------------------------
console.log('\n===== Ergebnis');
for (const r of results) console.log((r.ok ? '  ok    ' : '  FEHLER') + '  ' + r.name + '  (' + (r.ms / 1000).toFixed(1) + ' s)' + (r.ok ? '' : '  -> ' + r.err.message));
const bad = results.filter(r => !r.ok).length;
console.log(bad ? '\n' + bad + ' von ' + results.length + ' Tests fehlgeschlagen.' : '\nAlle ' + results.length + ' Tests bestanden.');
process.exitCode = bad ? 1 : 0;
