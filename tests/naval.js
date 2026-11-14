// Tests der Seefahrt (Häfen, Schiffe, Handel, Überfahrt, Landungen, Seegefechte): node tests/naval.js [filter]
// Umgebungsvariable SOAK_TICKS (Standard 40000) = Länge des Dauerlaufs auf einer Inselwelt (Test 12).
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
const T = WW.T;
const LAWS = { govChanges: false, wars: false, disasters: false, newRealms: false, events: false };
const isNum = (v) => typeof v === 'number' && isFinite(v);

// Inselwelt: Tiefsee, je Kasten eine Insel aus Wiese mit Flachwasser-Saum; Wald und Hügel westlich der Inselmitte
function islands(W, H, boxes) {
  const ter = new Uint8Array(W * H).fill(T.DEEP);
  for (const b of boxes) {
    for (let y = b.y0 - 3; y <= b.y1 + 3; y++) for (let x = b.x0 - 3; x <= b.x1 + 3; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) ter[i] = T.GRASS; else if (ter[i] === T.DEEP) ter[i] = T.SHALLOW;
    }
    const cx = (b.x0 + b.x1) >> 1, cy = (b.y0 + b.y1) >> 1;
    for (let y = cy - 12; y <= cy + 12; y++) for (let k = 7; k <= 13; k++) {
      const x = cx - k;
      if (x >= b.x0) ter[y * W + x] = y < cy ? T.FOREST : T.HILL;
    }
  }
  return ter;
}
const W2 = 130, H2 = 70;
const BOX_A = { x0: 6, y0: 12, x1: 38, y1: 58 }, BOX_B = { x0: 88, y0: 12, x1: 120, y1: 58 };
const SPOT_A = { x: 22, y: 36 }, SPOT_B = { x: 104, y: 36 };
function twoIslands(o) {
  o = o || {};
  const spots = o.spots || [SPOT_A, SPOT_B];
  const world = { W: W2, H: H2, terrain: islands(W2, H2, [BOX_A, BOX_B]), startSpots: spots, name: 'Inseltest' };
  const sim = WW.Sim.create({ seed: o.seed || 5, world: world, populate: spots.length, govs: o.govs || ['monarchy', 'monarchy'],
    races: ['human'], animals: false, laws: Object.assign({}, LAWS, o.laws || {}) });
  sim._throwErrors = true;
  for (let i = 0; i < sim.state.kingdoms.length; i++) sim.actions.setGovernment(sim.state.kingdoms[i].id, (o.govs || ['monarchy', 'monarchy'])[i]);
  return sim;
}
function grow(sim, years, pop, cities) {
  for (let y = 0; y < years; y++) {
    for (const c of (cities || sim.state.cities)) if (sim._cities.get(c.id) && c.pop < (pop || 40)) sim.actions.spawnSettlers(c.cx + 2, c.cy + 2, 6, null, 'human');
    run(sim, 240);
  }
}
function compAt(sim, x, y) { if (sim._compDirty) WW.Path.updateComponents(sim); return sim.comp[Math.floor(y) * sim.state.W + Math.floor(x)]; }
function harbor(sim, c) { return WW.Naval.harborOf(sim, c.id); }
function ships(sim, kid, kind) { return sim.state.ships.filter((s) => !s.dead && (kid == null || s.kingdomId === kid) && (!kind || s.kind === kind)); }
function runUntil(sim, max, fn, step) { step = step || 40; for (let t = 0; t < max; t += step) { run(sim, step); if (fn()) return true; } return false; }

// Flutfüllung vom Zentrum (Mauern, Türme, Tore, Wasser, Unbegehbares sperren; Diagonale nur, wenn beide Nachbarn frei):
// verlässt sie die Innenfläche des Rings, ist der Ring undicht
function ringLeak(sim, city) {
  const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
  const blocked = (i) => {
    if (LUT.walk[st.terrain[i]] <= 0 || (LUT.water[st.terrain[i]] && st.terrain[i] !== T.RIVER)) return true;
    const s = sim._structs.get(st.structAt[i]);
    return !!(s && s.built && (s.type === 'wall' || s.type === 'tower' || s.type === 'gate'));
  };
  const plan = new Set(city.wall.plan || []);
  const seen = new Uint8Array(W * H), start = city.cy * W + city.cx, q = [start];
  seen[start] = 1;
  const DX = WW.Path.DX, DY = WW.Path.DY;
  while (q.length) {
    const i = q.pop(), x = i % W, y = (i - x) / W;
    if (st.inRing[i] !== city.id && !plan.has(i)) return { leak: true, at: [x, y] };
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (seen[j] || blocked(j)) continue;
      if (d >= 4 && (blocked(y * W + nx) || blocked(ny * W + x))) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return { leak: false };
}
function invariants(sim, where) {
  const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
  for (const u of st.units) {
    if (u.dead) continue;
    assert(isNum(u.x) && isNum(u.y) && u.x >= 0 && u.y >= 0 && u.x < W && u.y < H, where + ': Einheit ' + u.id + ' kaputt');
    assert(LUT.walk[st.terrain[Math.floor(u.y) * W + Math.floor(u.x)]] > 0, where + ': Einheit ' + u.id + ' (' + u.role + ', sea ' + u.sea + ' ' + u.seaS + ') auf unbegehbarem Gelände');
  }
  for (const s of st.ships) {
    if (s.dead) continue;
    assert(isNum(s.x) && isNum(s.y) && isNum(s.hp) && s.x >= 0 && s.y >= 0 && s.x < W && s.y < H, where + ': Schiff ' + s.id + ' kaputt');
    assert(WW.Naval.isSea(st.terrain[Math.floor(s.y) * W + Math.floor(s.x)]) || s.t === 'sink', where + ': Schiff ' + s.id + ' (' + s.kind + ', ' + s.t + ') auf Land');
    assert(s.dir >= 0 && s.dir <= 3, where + ': Schiff ' + s.id + ' Richtung ' + s.dir);
    for (const id of s.passengers) { const u = sim._units.get(id); assert(!u || u.dead || u.sea === s.id, where + ': Passagier ' + id + ' gehört nicht zum Schiff'); }
  }
  for (const c of st.cities) for (const r of ['food', 'wood', 'stone', 'gold']) assert(isNum(c.stock[r]) && c.stock[r] >= -1e-6, where + ': Lager ' + c.name + ' ' + r + ' = ' + c.stock[r]);
}

// ---------------------------------------------------------------------------------------------------------------
test('1 Tabelle je Regierung (Stamm nur Kanus, Dampfer nur mit Kohle schneller)', function () {
  const G = WW.NAVAL.GOVS;
  for (const g of WW.GOV_KEYS || Object.keys(WW.GOVERNMENTS)) assert(G[g], 'Regierung ' + g + ' fehlt in WW.NAVAL.GOVS');
  assert(G.tribe.look === 'canoe' && G.tribe.trade === 0 && G.tribe.war === 0, 'Stamm: nur Kanus (Fischer, kleine Überfahrt)');
  assert(G.fascism.look === 'steam' && G.communism.look === 'steam', 'Faschismus/Kommunismus: Dampfschiffe');
  for (const g of ['monarchy', 'democracy', 'theocracy', 'republic', 'anarchy']) assert(G[g].look === 'sail', g + ': Segelschiffe');
  assert(G.republic.trade > G.monarchy.trade && G.republic.minTier < G.monarchy.minTier, 'Handelsrepublik: früher und mehr Handel');
  assert(!G.anarchy.invade && G.anarchy.war === 0, 'Anarchie: keine Landungen, keine Kriegsschiffe');
  const sp = (look, coal) => WW.Naval.speedOf(null, { look: look, coal: coal, mission: null });
  log('Tempo Kanu', sp('canoe'), 'Segel', sp('sail'), 'Dampf ohne Kohle', sp('steam', false), 'Dampf mit Kohle', sp('steam', true));
  assert(sp('steam', true) > sp('sail') && sp('steam', false) <= sp('sail') && sp('canoe') < sp('sail'), 'Tempo-Reihenfolge falsch');
  assert(WW.STRUCT_INFO.harbor && WW.STRUCT_INFO.harbor.w === 2 && WW.STRUCT_INFO.harbor.h === 2, 'Hafen 2×2');
  for (const k of ['navHarbor', 'navShip']) assert(WW.POWERS[k] && WW.POWER_KEYS.indexOf(k) >= 0 && typeof WW.POWERS[k].apply === 'function', 'Kraft ' + k + ' fehlt');
  // gebaute Schiffe: Aussehen nach Regierung; Dampfer verbrauchen Kohle
  const sim = twoIslands({ govs: ['tribe', 'fascism'] });
  const [A, B] = sim.state.kingdoms;
  const ca = sim.state.cities.find((c) => c.kingdomId === A.id), cb = sim.state.cities.find((c) => c.kingdomId === B.id);
  const hA = WW.Naval.harborOf(sim, ca.id) || WW.Naval.placeHarbor(sim, ca, WW.Naval.findHarborSpot(sim, ca), true);
  const hB = WW.Naval.harborOf(sim, cb.id) || WW.Naval.placeHarbor(sim, cb, WW.Naval.findHarborSpot(sim, cb), true);
  assert(hA && hB, 'Testhäfen');
  const t = WW.Naval.spawnShip(sim, hA, 'transport', A.id, ca.id), f = WW.Naval.spawnShip(sim, hB, 'warship', B.id, cb.id);
  assert(t.look === 'canoe' && f.look === 'steam', 'Aussehen: ' + t.look + ' / ' + f.look);
  assert(WW.Naval.capOf(t) < WW.NAVAL.KINDS.transport.cap, 'Kanu fasst weniger');
  for (const kind of ['trader', 'warship']) assert(WW.Naval.quota(sim, Object.assign({}, ca, { tier: 5 }), A, kind) === 0, 'Stamm baut ' + kind);
  const sk = WW.Cities.stock(sim, cb);
  sk.coal = 0;
  run(sim, 400);
  const out1 = ships(sim, B.id).find((s) => s.t !== 'dock' && s.look === 'steam');
  const coal1 = out1 ? out1.coal : null;
  assert(coal1 !== true, 'Dampfer fährt ohne Kohle im Lager mit Kohle');
  sk.coal = 50;
  const coal0 = sk.coal;
  run(sim, 600);
  log('Kohle vorher', coal0, 'nachher', sk.coal.toFixed(1), out1 ? 'Fahrt ohne Kohle: coal=' + coal1 : '');
  assert(sk.coal < coal0, 'Dampfer haben keine Kohle verbraucht');
});

test('2 Küstenstadt baut Hafen, Binnenstadt nicht; Mauerring bleibt dicht', function () {
  const W = 150, H = 80;
  const ter = new Uint8Array(W * H).fill(T.GRASS);
  for (let y = 0; y < H; y++) for (let x = 108; x < W; x++) ter[y * W + x] = x < 111 ? T.SHALLOW : T.DEEP;
  // Holz und Stein bei beiden Städten
  for (const sp of [{ x: 22, y: 40 }, { x: 92, y: 40 }]) for (let y = sp.y - 12; y <= sp.y + 12; y++) for (let k = 7; k <= 13; k++) ter[y * W + sp.x - k] = y < sp.y ? T.FOREST : T.HILL;
  const sim = WW.Sim.create({ seed: 9, world: { W: W, H: H, terrain: ter, startSpots: [{ x: 22, y: 40 }, { x: 92, y: 40 }], name: 'Küste' },
    populate: 2, govs: ['monarchy', 'monarchy'], races: ['human'], animals: false, laws: LAWS });
  sim._throwErrors = true;
  const st = sim.state;
  for (const k of st.kingdoms) sim.actions.setGovernment(k.id, 'monarchy');
  const inland = st.cities.find((c) => c.cx < 50), coast = st.cities.find((c) => c.cx > 50);
  assert(inland && coast, 'Städte');
  // Dichtheit je Stadt prüfen, sobald ihr Ring vollständig steht (später laufen Ausbauten, dann fehlen kurz Stücke)
  const leak = {};
  let done = false;
  for (let y = 0; y < 40 && !done; y++) {
    for (let q = 0; q < 6; q++) {
      run(sim, 40);
      for (const c of [coast, inland]) if (y >= 8 && leak[c.id] == null && c.wall.plan && c.wall.total > 0 && c.wall.built >= c.wall.total) leak[c.id] = ringLeak(sim, c);
    }
    grow(sim, 1, 40);
    const h = harbor(sim, coast);
    done = !!(h && h.built && leak[coast.id] && leak[inland.id]);
  }
  const h = harbor(sim, coast);
  log('Jahr', st.year, 'Küstenstadt Stufe', coast.tier, 'Hafen', h ? h.x + ',' + h.y + ' dock ' + (h.dock % W) + ',' + Math.floor(h.dock / W) + (h.built ? ' fertig' : ' Baustelle') : '-',
    '| Ring Küste', coast.wall.built + '/' + coast.wall.total, '| Ring Binnen', inland.wall.built + '/' + inland.wall.total);
  assert(h && h.built, 'Küstenstadt hat keinen fertigen Hafen');
  assert(!harbor(sim, inland), 'Binnenstadt hat einen Hafen');
  assert(WW.Naval.isSea(st.terrain[h.dock]), 'Anlegestelle liegt nicht im Wasser');
  const plan = new Set(coast.wall.plan || []);
  for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
    const i = (h.y + dy) * W + h.x + dx;
    assert(!plan.has(i) || WW.Naval.isSea(st.terrain[i]), 'Hafen oder Gasse liegt auf dem Mauerring');
  }
  const r0 = st.inRing[h.y * W + h.x];
  assert([1, W, W + 1].every((d) => st.inRing[h.y * W + h.x + d] === r0), 'Hafen halb im Ring');
  for (const c of [coast, inland]) {
    const lk = leak[c.id];
    assert(lk, c.name + ': Ring nie vollständig');
    assert(!lk.leak, c.name + ': Ring undicht bei ' + lk.at);
  }
  assert(ships(sim, coast.kingdomId, 'fishboat').length >= 1, 'kein Fischerboot');
});

test('3 Fischerboot bringt Nahrung', function () {
  const sim = twoIslands({ spots: [SPOT_A], govs: ['monarchy'] });
  const st = sim.state, c = st.cities[0];
  grow(sim, 8, 30);
  assert(runUntil(sim, 240 * 10, () => ships(sim, null, 'fishboat').length > 0), 'kein Fischerboot gebaut');
  const boat = ships(sim, null, 'fishboat')[0];
  const sk = WW.Cities.stock(sim, c);
  // eine ganze Fahrt beobachten: hinaus, fischen, heim
  const seen = {};
  let before = -1, after = -1, maxD = 0;
  for (let t = 0; t < 2400 && after < 0; t++) {
    const prev = boat.t;
    if (prev === 'back' && boat.ri >= boat.route.length - 1 && before < 0) before = sk.fish + sk.food;
    sim.tick();
    seen[boat.t] = 1;
    maxD = Math.max(maxD, Math.abs(boat.x - (boat.home % st.W + 0.5)) + Math.abs(boat.y - (Math.floor(boat.home / st.W) + 0.5)));
    if (prev === 'back' && boat.t === 'dock') after = sk.fish + sk.food;
  }
  log('Zustände', Object.keys(seen).join(','), 'weiteste Fahrt', maxD.toFixed(1), 'Fisch+Nahrung', before.toFixed(1), '->', after.toFixed(1), 'Fang gesamt', st.naval.stats.fish.toFixed(1));
  assert(seen.out && seen.work && seen.back, 'Fahrt unvollständig');
  assert(maxD >= 2, 'Boot ist nicht hinausgefahren');
  assert(after > before + 3, 'kein Fang angekommen');
  assert(st.naval.stats.fish > 0 && typeof sk.fish === 'number', 'Fischstatistik');
});

test('4 Handel zwischen zwei Häfen bringt Gold', function () {
  const sim = twoIslands({ govs: ['republic', 'monarchy'] });
  const st = sim.state, [A, B] = st.kingdoms;
  sim.actions.setRelation(A.id, B.id, 'alliance');
  grow(sim, 10, 34);
  const ok = runUntil(sim, 240 * 20, () => st.naval.stats.trades >= 4, 120);
  const ca = st.cities.find((c) => c.kingdomId === A.id), cb = st.cities.find((c) => c.kingdomId === B.id);
  log('Jahr', st.year, 'Handelsfahrten', st.naval.stats.trades, 'Handelsschiffe', ships(sim, A.id, 'trader').length + '/' + ships(sim, B.id, 'trader').length,
    'Gold aus Seehandel', JSON.stringify(st.naval.ledger), 'Meinung', A.relations[B.id].opinion.toFixed(0));
  assert(ok, 'zu wenig Handelsfahrten');
  assert((st.naval.ledger[ca.id] || 0) > 0 && (st.naval.ledger[cb.id] || 0) > 0, 'nicht beide Städte haben Gold bekommen');
  assert(ships(sim, A.id, 'trader').length >= ships(sim, B.id, 'trader').length, 'Handelsrepublik hat nicht mehr Handelsschiffe');
});

test('5 Transporter gründet eine Stadt auf der zweiten Insel', function () {
  const sim = twoIslands({ spots: [SPOT_A], govs: ['monarchy'] });
  const st = sim.state, k = st.kingdoms[0], c = st.cities[0];
  const homeC = compAt(sim, c.cx, c.cy), otherC = compAt(sim, SPOT_B.x, SPOT_B.y);
  assert(homeC !== otherC, 'Inseln hängen zusammen');
  let colony = null;
  for (let y = 0; y < 40 && !colony; y++) {
    grow(sim, 1, 46, [c]);
    colony = st.cities.find((x) => x.kingdomId === k.id && compAt(sim, x.cx, x.cy) === otherC);
  }
  const ev = st.events.filter((e) => e.type === 'seaColony' || e.type === 'seaColonyLand').map((e) => e.year + ' ' + e.text);
  log(ev.slice(0, 3).join(' | '));
  log('Jahr', st.year, 'Kolonie', colony ? colony.name + ' (' + colony.cx + ',' + colony.cy + ')' : '-', 'Überfahrten', st.naval.stats.colonies);
  assert(colony, 'keine Stadt auf der zweiten Insel');
  assert(st.naval.stats.colonies >= 1, 'Statistik');
  invariants(sim, 'Kolonie');
});

test('6 Truppenlandung im Krieg erreicht die feindliche Insel', function () {
  const sim = twoIslands({ govs: ['fascism', 'theocracy'] });
  const st = sim.state, [A, B] = st.kingdoms;
  const cb = st.cities.find((c) => c.kingdomId === B.id);
  // Testaufbau: der Angreifer bekommt Bauholz (die Testinsel hat wenig Wald, Faschismus holzt ihn schnell ab)
  const ca = st.cities.find((c) => c.kingdomId === A.id);
  for (let y = 0; y < 18; y++) { grow(sim, 1, 44); if (y % 3 === 2) { const sk = WW.Cities.stock(sim, ca); sk.wood += 60; sk.stone += 20; } }
  const tr = ships(sim, A.id, 'transport');
  log('Jahr', st.year, 'Schiffe A', ships(sim, A.id).map((s) => s.kind).join(','), '| B', ships(sim, B.id).map((s) => s.kind).join(','));
  assert(tr.length >= 1, 'Angreifer hat keinen Transporter');
  sim.actions.setRelation(A.id, B.id, 'war');
  const bComp = compAt(sim, cb.cx, cb.cy);
  let landed = 0;
  const ok = runUntil(sim, 240 * 12, () => {
    landed = st.units.filter((u) => !u.dead && u.kingdomId === A.id && !u.sea && u.role === 'soldier' && compAt(sim, u.x, u.y) === bComp).length;
    if (process.env.NAVDBG && st.tick % 240 === 0) console.log('   dbg', st.year, ships(sim, A.id, 'transport').map((s) => s.t + ':' + (s.mission ? s.mission.kind : '-') + ' p' + s.passengers.length + ' @' + s.x.toFixed(0) + ',' + s.y.toFixed(0)).join(' '), 'inv', JSON.stringify(st.naval.invade));
    return landed >= 3;
  }, 20);
  const ev = st.events.filter((e) => /^sea/.test(e.type)).map((e) => e.year + ' ' + e.type + (e.type === 'seaLanding' ? '@' + e.x.toFixed(0) + ',' + e.y.toFixed(0) + ' comp ' + compAt(sim, e.x, e.y) + '/' + bComp + ' ' + e.text : ''));
  log('Ereignisse', ev.join(', '));
  log('Soldaten von A auf der Insel von B', landed, 'Landungen', st.naval.stats.landings);
  assert(ok, 'keine Truppen auf der feindlichen Insel');
  assert(st.events.some((e) => e.type === 'seaInvasion') && st.events.some((e) => e.type === 'seaLanding'), 'Chronik der Landung fehlt');
  // Landestellen liegen außerhalb jedes Mauerrings
  for (const e of st.events) if (e.type === 'seaLanding') assert(st.inRing[Math.floor(e.y) * st.W + Math.floor(e.x)] === -1, 'Landung im Mauerring');
  invariants(sim, 'Landung');
});

test('7 Seegefecht: Wrack, gerettete Besatzung, niemand ertrinkt', function () {
  const sim = twoIslands({ govs: ['monarchy', 'fascism'] });
  const st = sim.state, [A, B] = st.kingdoms, W = st.W;
  const ca = st.cities.find((c) => c.kingdomId === A.id), cb = st.cities.find((c) => c.kingdomId === B.id);
  grow(sim, 4, 26);
  sim.actions.setRelation(A.id, B.id, 'war');
  // Flachwasser vor der Ostküste von Insel A
  const sx = BOX_A.x1 + 2, sy = 30;
  assert(st.terrain[sy * W + sx] === T.SHALLOW, 'Testkachel ist kein Flachwasser');
  const war = sim.actions.placeShip(sx + 0.5, sy + 4.5, 'warship', B.id);
  const tid = sim.actions.placeShip(sx + 0.5, sy + 0.5, 'transport', A.id);
  assert(war && tid, 'Schiffe nicht gesetzt');
  const t = sim.query.ship(tid), w = sim.query.ship(war);
  assert(t && w && w.kingdomId === B.id && t.kingdomId === A.id, 'Schiffe falsch');
  t.wait = 100000; w.wait = 100000;   // beide bleiben liegen
  // Passagiere an Bord
  const crew = [];
  for (let i = 0; i < 4; i++) {
    const u = WW.Units.create(sim, { x: ca.cx + 0.5, y: ca.cy + 0.5, role: 'farmer', kingdomId: A.id, cityId: ca.id, race: 'human' });
    u.sea = t.id; u.seaS = 'aboard'; t.passengers.push(u.id); crew.push(u);
  }
  const drown0 = (sim._deaths && sim._deaths.drown) || 0;
  const wr0 = st.wrecks.filter((x) => x.kind === 'ship').length;
  sim.drainFx();
  const fxSeen = new Set();
  let swimSeen = 0;
  const ok = runUntil(sim, 2000, () => {
    for (const f of sim.drainFx()) fxSeen.add(f.type);
    swimSeen = Math.max(swimSeen, crew.filter((u) => u.seaS === 'swim').length);
    return !sim.query.ship(tid);
  }, 1);
  log('Transporter versenkt', ok, 'Kriegsschiff hp', w.hp + '/' + w.maxHp);
  assert(ok, 'Seegefecht ohne Ergebnis');
  const wrecks = st.wrecks.filter((x) => x.kind === 'ship');
  assert(wrecks.length > wr0, 'kein Wrack im Flachwasser');
  const wk = wrecks[wrecks.length - 1];
  log('Wrack', JSON.stringify(wk));
  assert(wk.ship === 'transport' && WW.Naval.isSea(st.terrain[Math.floor(wk.y) * W + Math.floor(wk.x)]), 'Wrack falsch');
  run(sim, 450);
  for (const f of sim.drainFx()) fxSeen.add(f.type);
  assert(swimSeen === 4 && fxSeen.has('swim'), 'Passagiere sind nicht geschwommen (' + swimSeen + ')');
  for (const k of ['shipfire', 'shipsink', 'splash']) assert(fxSeen.has(k), 'Fx ' + k + ' fehlt');
  for (const u of crew) {
    assert(!u.dead, 'Passagier gestorben');
    assert(!u.sea && WW.TERRAIN_LUT.walk[st.terrain[Math.floor(u.y) * W + Math.floor(u.x)]] > 0, 'Passagier nicht an Land');
  }
  assert(((sim._deaths && sim._deaths.drown) || 0) === drown0, 'jemand ist ertrunken');
  const ev = st.events.find((e) => e.type === 'seaBattle');
  assert(ev && ev.popup === 'battle', 'Chronik des Seegefechts fehlt');
  log(ev.text);
  log('Fx', Array.from(fxSeen).join(','));
  invariants(sim, 'Seegefecht');
});

test('8 Kräfte: Hafen setzen, Schiff setzen; Aktionen werfen nie', function () {
  const sim = twoIslands({ govs: ['tribe', 'monarchy'] });
  const st = sim.state, [A, B] = st.kingdoms;
  const ca = st.cities.find((c) => c.kingdomId === A.id);
  const n0 = st.naval.harbors.length;
  assert(sim.actions.strike(BOX_A.x1 - 1, ca.cy + 0.5, 'navHarbor'), 'Hafen setzen');
  assert(st.naval.harbors.length === n0 + 1, 'Hafen fehlt');
  const h = sim._structs.get(st.naval.harbors[st.naval.harbors.length - 1]);
  assert(h.built && h.cityId === ca.id && WW.Naval.isSea(st.terrain[h.dock]), 'Hafen falsch');
  assert(sim.actions.strike(BOX_A.x1 + 3, ca.cy + 0.5, 'navShip'), 'Schiff setzen');
  const s = st.ships[st.ships.length - 1];
  assert(s.kingdomId === A.id && s.look === 'canoe' && s.kind === 'fishboat', 'Stamm bekommt kein Kanu: ' + s.kind + '/' + s.look);
  sim.actions.setRelation(A.id, B.id, 'war');
  const id = sim.actions.placeShip(BOX_B.x0 - 3, 30, null, B.id);
  assert(sim.query.ship(id).kind === 'warship', 'im Krieg: Kriegsschiff');
  // Unsinn
  for (const a of [[NaN, 3], [-5, 2], [1e9, 1e9], [10, 10, 'quatsch'], ['x', 'y']]) { sim.actions.placeShip.apply(null, a); sim.actions.placeHarbor.apply(null, a); }
  assert(sim.actions.placeShip(SPOT_A.x, SPOT_A.y, 'warship') === null, 'Schiff an Land gesetzt');
  assert(sim.query.shipNear(s.x, s.y, 1) === s && sim.query.ships(A.id).length >= 1 && sim.query.harborOf(ca.id), 'Abfragen');
  const ns = sim.query.navalStats(A.id);
  assert(ns.harbors >= 1 && ns.ships.fishboat >= 1, 'navalStats');
  run(sim, 600);
  invariants(sim, 'Kräfte');
});

test('9 Speichern/Laden und Determinismus', function () {
  const mk = () => { const s = twoIslands({ govs: ['republic', 'monarchy'] }); s.actions.setRelation(s.state.kingdoms[0].id, s.state.kingdoms[1].id, 'peace'); return s; };
  const a = mk(), b = mk();
  grow(a, 12, 36); grow(b, 12, 36);
  assert(a.state.ships.length > 0, 'keine Schiffe für den Test');
  assert(a.hash() === b.hash(), 'gleicher Samen, verschiedener Stand');
  // Speichern -> Laden -> Speichern ergibt denselben Text
  const s1 = a.serialize();
  const L = WW.Sim.load(s1);
  assert(L, 'Laden fehlgeschlagen');
  assert(L.serialize() === s1, 'Speichern -> Laden -> Speichern verändert den Text');
  // weiterlaufen: unterbrochen = ununterbrochen (auch mit Krieg und Seegefecht)
  a.actions.setRelation(a.state.kingdoms[0].id, a.state.kingdoms[1].id, 'war');
  L.actions.setRelation(L.state.kingdoms[0].id, L.state.kingdoms[1].id, 'war');
  for (let i = 0; i < 8; i++) {
    run(a, 300); run(L, 300);
    if (a.hash() !== L.hash()) assert(false, 'nach dem Laden auseinandergelaufen (Abschnitt ' + i + ')');
    if (i === 3) { const s2 = L.serialize(); L.__x = 1; const L2 = WW.Sim.load(s2); assert(L2.serialize() === s2, 'zweites Laden'); run(L2, 300); run(L, 300); run(a, 300); assert(L2.hash() === a.hash(), 'zweites Laden läuft auseinander'); }
  }
  log('Schiffe', a.state.ships.length, 'Häfen', a.state.naval.harbors.length, JSON.stringify(a.state.naval.stats));
});

test('10 Alte Spielstände ohne Seefahrt werden nachgerüstet', function () {
  const sim = twoIslands({ spots: [SPOT_A], govs: ['monarchy'] });
  grow(sim, 3, 20);
  const o = JSON.parse(sim.serialize());
  delete o.ships; delete o.naval;
  o.structs = o.structs.filter((s) => s.type !== 'harbor');
  // Bauwerks-Raster passt dann nicht mehr: Hafenkacheln freigeben
  const L0 = WW.Sim.load(JSON.stringify(o));
  assert(L0, 'alter Spielstand lädt nicht');
  for (let i = 0; i < L0.state.structAt.length; i++) if (L0.state.structAt[i] >= 0 && !L0._structs.get(L0.state.structAt[i])) L0.state.structAt[i] = -1;
  assert(Array.isArray(L0.state.ships) && L0.state.naval && Array.isArray(L0.state.naval.harbors), 'Felder nicht nachgerüstet');
  const c = L0.state.cities[0];
  grow(L0, 8, 34);
  log('nach 8 Jahren: Hafen', !!WW.Naval.harborOf(L0, c.id), 'Schiffe', L0.state.ships.length);
  assert(WW.Naval.harborOf(L0, c.id), 'kein Hafen nach dem Nachrüsten');
  const s = L0.serialize();
  assert(WW.Sim.load(s).serialize() === s, 'nachgerüsteter Stand nicht stabil');
});

// Laufzeit der Seefahrt messen (Takt, Einheiten-Haken, Wegsuche, Haken in diplo.js)
function meter() {
  const N = WW.Naval, acc = { t: 0 };
  const wrap = (k) => { const f = N[k]; N[k] = function () { const t0 = process.hrtime.bigint(); try { return f.apply(this, arguments); } finally { acc.t += Number(process.hrtime.bigint() - t0); } }; return () => { N[k] = f; }; };
  const undo = ['tick', 'unit', 'seaWar', 'seaReach'].map(wrap);
  return { ms: () => acc.t / 1e6, reset: () => { acc.t = 0; }, stop: () => undo.forEach((u) => u()) };
}

test('11 Zeitaufschlag unter 0,03 ms je Tick', function () {
  const sim = twoIslands({ govs: ['republic', 'fascism'] });
  grow(sim, 10, 40);
  sim.actions.setRelation(sim.state.kingdoms[0].id, sim.state.kingdoms[1].id, 'war');
  const m = meter();
  try {
    m.reset();
    const t0 = Date.now();
    run(sim, 4000);
    const all = Date.now() - t0;
    const per = m.ms() / 4000;
    log('Schiffe', sim.state.ships.length, '| Seefahrt', per.toFixed(4), 'ms/Tick | ganze Simulation', (all / 4000).toFixed(3), 'ms/Tick');
    assert(per < 0.03, 'Zeitaufschlag ' + per.toFixed(4) + ' ms/Tick');
  } finally { m.stop(); }
});

test('12 Dauerlauf Inselwelt (gemischte Regierungen) ohne Ausnahme', function () {
  const ticks = +(process.env.SOAK_TICKS || 40000);
  const sim = WW.Sim.create({ seed: 2024, size: 'medium', worldOpts: { template: 'archipelago' }, populate: 6, govs: 'mixed' });
  sim._throwErrors = true;
  const st = sim.state;
  const m = meter();
  const t0 = Date.now();
  let maxShips = 0, maxPer = 0, sumMs = 0, sumCpu = 0, sumWall = 0, maxCpuPer = 0;
  try {
    for (let t = 0; t < ticks; t += 1000) {
      m.reset();
      const c0 = process.cpuUsage(), w0 = process.hrtime.bigint();
      run(sim, 1000);
      const wall = Number(process.hrtime.bigint() - w0) / 1e6, cu = process.cpuUsage(c0), cpu = (cu.user + cu.system) / 1000;
      // Anteil der Seefahrt an der Wanduhr × CPU-Zeit des Abschnitts: weniger empfindlich für einen ausgelasteten Rechner
      const cpuNav = wall > 0 ? m.ms() / wall * Math.min(cpu, wall) : m.ms();
      maxPer = Math.max(maxPer, m.ms() / 1000); sumMs += m.ms(); sumCpu += cpuNav; sumWall += wall;
      maxCpuPer = Math.max(maxCpuPer, cpuNav / 1000);
      maxShips = Math.max(maxShips, st.ships.length);
      if (t % 5000 === 0) invariants(sim, 'Tick ' + st.tick);
      // gelegentlich Unruhe stiften, damit auch Krieg über das Meer vorkommt
      if (t % 8000 === 4000) {
        const ks = st.kingdoms.filter((k) => k.cityIds.length);
        if (ks.length >= 2) sim.actions.setRelation(ks[0].id, ks[ks.length - 1].id, 'war');
      }
    }
  } finally { m.stop(); }
  invariants(sim, 'Ende');
  if (sim._compDirty) WW.Path.updateComponents(sim);
  // Inseln = Landmassen mit mindestens 40 Kacheln
  const size = new Map();
  for (let i = 0; i < st.W * st.H; i++) { const c = sim.comp[i]; if (c >= 0) size.set(c, (size.get(c) || 0) + 1); }
  const isl = Array.from(size.values()).filter((n) => n >= 40).length;
  const settled = new Set(st.cities.map((c) => sim.comp[c.cy * st.W + c.cx]));
  const ev = {};
  for (const e of st.events) if (/^sea|harbor|Ship|bigCatch|shipwreck/.test(e.type)) ev[e.type] = (ev[e.type] || 0) + 1;
  log('Welt', st.W + '×' + st.H, 'Jahr', st.year, 'Laufzeit', ((Date.now() - t0) / 1000).toFixed(1) + ' s', '| Reiche', st.kingdoms.length, 'Städte', st.cities.length);
  log('Inseln (≥ 40 Kacheln)', isl, '| besiedelt', settled.size, '| Häfen', st.naval.harbors.length, '| Schiffe jetzt', st.ships.length, 'höchstens', maxShips);
  log('Statistik', JSON.stringify(st.naval.stats), '| Wracks', st.wrecks.filter((w) => w.kind === 'ship').length);
  log('Chronik (letzte 400)', JSON.stringify(ev));
  log('Seefahrt (Wanduhr) im Mittel', (sumMs / ticks).toFixed(4), 'ms/Tick, schlechtester Abschnitt', maxPer.toFixed(4), 'ms/Tick (je 1000 Ticks); Anteil', (100 * sumMs / sumWall).toFixed(1) + ' %');
  log('Seefahrt (CPU-geschätzt) im Mittel', (sumCpu / ticks).toFixed(4), 'ms/Tick, schlechtester Abschnitt', maxCpuPer.toFixed(4), 'ms/Tick');
  assert(sumCpu / ticks < 0.03, 'Zeitaufschlag im Dauerlauf ' + (sumCpu / ticks).toFixed(4) + ' ms/Tick');
  assert(st.naval.harbors.length > 0 && st.naval.stats.built > 0, 'keine Seefahrt im Dauerlauf');
  const s = sim.serialize();
  assert(WW.Sim.load(s).serialize() === s, 'Endstand nicht stabil speicherbar');
});

test('13 Faschismus: keine Siedler über das Meer (noSettle); Garnisonen bleiben daheim', function () {
  const noS = !!(WW.GOVERNMENTS.fascism.build && WW.GOVERNMENTS.fascism.build.noSettle);
  log('Marke noSettle am Faschismus:', noS);
  const sim = twoIslands({ spots: [SPOT_A], govs: ['fascism'] });
  const st = sim.state, c = st.cities[0];
  const otherC = compAt(sim, SPOT_B.x, SPOT_B.y);
  for (let y = 0; y < 26; y++) { grow(sim, 1, 46, [c]); const sk = WW.Cities.stock(sim, c); sk.wood += 30; sk.stone += 10; }
  const colony = st.cities.find((x) => compAt(sim, x.cx, x.cy) === otherC);
  log('Jahr', st.year, 'Transporter', ships(sim, null, 'transport').length, 'Überfahrten', st.naval.stats.colonies, 'Stadt auf Insel B', !!colony);
  if (noS) assert(!colony && st.naval.stats.colonies === 0 && !st.events.some((e) => e.type === 'seaColony'), 'Faschismus siedelt über das Meer');
  // Garnison: sind alle Soldaten stationiert, wird niemand eingeschifft
  const sim2 = twoIslands({ govs: ['monarchy', 'theocracy'] });
  const [A, B] = sim2.state.kingdoms;
  grow(sim2, 14, 44);
  for (const u of sim2.state.units) if (u.kingdomId === A.id) u.garrison = u.cityId;
  const idle = sim2.state.units.filter((u) => !u.dead && u.kingdomId === A.id && u.role === 'soldier' && !u.order);
  sim2.actions.setRelation(A.id, B.id, 'war');
  const ok = WW.Naval.seaWar(sim2, A, B, idle, 0);
  assert(!ok && !sim2.state.units.some((u) => u.kingdomId === A.id && u.sea), 'Garnisonssoldaten eingeschifft');
});

console.log('\n--- Ergebnis');
let ok = 0;
for (const r of results) { console.log((r.ok ? '  ok   ' : '  FEHL ') + r.name + ' (' + r.ms + ' ms)'); if (r.ok) ok++; }
console.log(ok + ' von ' + results.length + ' bestanden');
process.exitCode = ok === results.length ? 0 : 1;
