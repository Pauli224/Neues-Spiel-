// Tests des Militärs (Arsenal, Panzer, Artillerie, Feldschlachten): node tests/military.js [filter]
// Umgebungsvariable SOAK_SEEDS (Standard 3) = Anzahl Welten im Dauerlauf (Test 9).
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
const LAWS = { govChanges: false, wars: false, disasters: false, newRealms: false, events: false };
const vehicles = (sim, kid) => sim.state.units.filter((u) => !u.dead && u.vehicle && (kid == null || u.kingdomId === kid));

// Flache Testwelt (Wiese) mit Startplätzen; fn(terrain, W, H) darf Gelände malen
function flat(W, H, spots, fn) {
  const terrain = new Uint8Array(W * H).fill(WW.T.GRASS);
  // je Startplatz Wald und Hügel dahinter (Holz und Stein), die Mitte bleibt frei als Schlachtfeld
  for (const sp of spots) {
    const dir = sp.x < W / 2 ? -1 : 1;
    for (let y = sp.y - 12; y <= sp.y + 12; y++) for (let k = 7; k <= 14; k++) {
      const x = sp.x + dir * k;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      terrain[y * W + x] = y < sp.y ? WW.T.FOREST : WW.T.HILL;
    }
  }
  if (fn) fn(terrain, W, H);
  return { W: W, H: H, terrain: terrain, startSpots: spots, name: 'Testfeld' };
}
// Zwei Reiche auf einer Wiese
function duel(govA, govB, o) {
  o = o || {};
  const W = o.W || 120, H = o.H || 60;
  const sim = WW.Sim.create({ seed: o.seed || 7, world: flat(W, H, [{ x: 24, y: 30 }, { x: W - 24, y: 30 }], o.terrain), populate: 2,
    govs: [govA, govB], races: ['human'], animals: false, laws: Object.assign({}, LAWS, o.laws || {}) });
  sim._throwErrors = true;
  const [A, B] = sim.state.kingdoms;
  sim.actions.setGovernment(A.id, govA); sim.actions.setGovernment(B.id, govB);
  return { sim: sim, A: A, B: B, ca: sim.state.cities.find((c) => c.kingdomId === A.id), cb: sim.state.cities.find((c) => c.kingdomId === B.id) };
}
function grow(o, years, pop) {
  for (let y = 0; y < years; y++) {
    for (const c of [o.ca, o.cb]) if (c && c.pop < (pop || 40) && o.sim._cities.get(c.id)) o.sim.actions.spawnSettlers(c.cx + 2, c.cy + 2, 8, null, 'human');
    run(o.sim, 240);
  }
}
function soldier(sim, k, c, x, y) {
  const u = WW.Units.create(sim, { x: x + 0.5, y: y + 0.5, role: 'soldier', kingdomId: k.id, cityId: c.id, race: 'human', age: 25 });
  WW.Units.setRole(sim, u, 'soldier');
  return u;
}
// Fertige Werkstatt (Schmiede) neben die Stadt stellen
function workshop(sim, c) {
  const i = WW.Industry.findSpot(sim, c, 2, 2);
  assert(i >= 0, 'kein Platz für die Schmiede');
  return WW.Structs.create(sim, 'smithy', i % sim.state.W, Math.floor(i / sim.state.W), c.id, { built: true });
}

test('1 Tabelle je Regierung', function () {
  const G = WW.MIL.GOVS;
  assert(G.fascism.tank && G.fascism.artillery && G.fascism.focus === 'tank', 'Faschismus: Panzer + Artillerie, Schwerpunkt Panzer');
  assert(G.communism.tank && G.communism.artillery && G.communism.simple && G.communism.tank.max >= G.fascism.tank.max, 'Kommunismus: viele einfache Panzer');
  for (const g of ['monarchy', 'republic', 'democracy']) assert(G[g] && !G[g].tank && G[g].artillery, g + ': nur Geschütze');
  assert(G.democracy.defensive, 'Demokratie: Verteidigung');
  for (const g of ['theocracy', 'tribe', 'anarchy']) assert(!G[g], g + ' baut Militärgerät');
  const fk = { gov: 'fascism' }, mk = { gov: 'monarchy' }, ck = { gov: 'communism' };
  const f = WW.Military.costOf(fk, 'artillery', false), m = WW.Military.costOf(mk, 'artillery', false), c = WW.Military.costOf(ck, 'tank', false), ft = WW.Military.costOf(fk, 'tank', false);
  log('Geschütz Faschismus', JSON.stringify(f), '| Monarchie', JSON.stringify(m), '| Panzer Faschismus', JSON.stringify(ft), '| Kommunismus', JSON.stringify(c));
  assert(f.iron < m.iron && c.iron < ft.iron, 'Kostenverhältnis falsch');
  assert(WW.Military.costOf(ck, 'tank', true).wood > 0 && WW.Military.costOf(fk, 'tank', true).gold > 0, 'Behelf (Gold bzw. Holz/Stein) fehlt');
  assert(WW.STRUCT_INFO.arsenal && WW.STRUCT_INFO.arsenal.w === 3 && WW.STRUCT_INFO.arsenal.h === 2, 'Arsenal 3×2');
  for (const k of ['milTank', 'milGun', 'milBattle']) assert(WW.POWERS[k] && WW.POWER_KEYS.indexOf(k) >= 0 && typeof WW.POWERS[k].apply === 'function', 'Kraft ' + k + ' fehlt');
});

test('2 Arsenal nur bei den richtigen Regierungen, verbraucht Eisen und Kohle (sonst langsamer Behelf)', function () {
  const built = {};
  for (const g of WW.GOV_KEYS) {
    const o = duel(g, 'tribe', { seed: 11 });
    grow(o, 12, 44);
    const c = o.ca;
    workshop(o.sim, c);
    const sk = WW.Cities.stock(o.sim, c);
    sk.iron = 60; sk.coal = 60; sk.gold = Math.max(sk.gold, 50); sk.wood = Math.max(sk.wood, 80); sk.stone = Math.max(sk.stone, 80);
    let y = 0;
    for (; y < 20; y++) {
      for (let q = 0; q < 6; q++) { const s3 = WW.Cities.stock(o.sim, c); s3.iron = Math.max(s3.iron || 0, 60); s3.coal = Math.max(s3.coal || 0, 60); s3.wood = Math.max(s3.wood, 150); s3.stone = Math.max(s3.stone, 150); run(o.sim, 40); }
      const done = o.sim.state.structs.filter((s) => s.type === 'arsenal' && s.built);
      if (done.length && vehicles(o.sim, o.A.id).length) {
        if (done.some((s) => s.lastPay === 'res')) break;
        for (const u of vehicles(o.sim, o.A.id)) WW.Units.kill(o.sim, u, 'test');   // vor dem Auffüllen per Behelf gebaut: nochmal
      }
      if (c.pop < 30) o.sim.actions.spawnSettlers(c.cx + 2, c.cy + 2, 8, null, 'human');
    }
    const ars = o.sim.state.structs.filter((s) => s.type === 'arsenal');
    const v = vehicles(o.sim, o.A.id);
    built[g] = ars.length + '/' + v.map((u) => u.role[0]).join('');
    if (WW.MIL.GOVS[g]) {
      assert(ars.some((s) => s.built), g + ': kein fertiges Arsenal (Stufe ' + c.tier + ', ' + c.pop + ' Einw., Baustellen ' + ars.map((s) => Math.round(s.progress * 100) + '%').join(',') + ', Werkstatt ' + o.sim.state.structs.some((s) => s.cityId === c.id && s.built && (s.type === 'smithy' || s.type === 'factory')) + ', Holz/Stein ' + Math.round(WW.Cities.stock(o.sim, c).wood) + '/' + Math.round(WW.Cities.stock(o.sim, c).stone) + ')');
      const s = ars[0];
      WW.Structs.forTiles(o.sim, s, (i) => assert(o.sim.state.inRing[i] === -1, 'Arsenal im Mauerring'));
      assert(v.length > 0, g + ': kein Fahrzeug gebaut');
      for (const u of v) assert(WW.MIL.GOVS[g][u.role], g + ' baut ' + u.role);
      assert(ars.some((s) => s.lastPay === 'res'), g + ': nicht mit Eisen/Kohle gebaut');
      assert(o.sim.state.events.some((e) => e.type === 'arsenal'), 'keine Chronik zum Arsenal');
    } else assert(!ars.length && !v.length, g + ' baut Arsenal/Fahrzeuge');
  }
  log('Arsenale/Fahrzeuge je Regierung:', JSON.stringify(built));
  // Behelf ohne Rohstoffe: langsamer, kostet Gold
  const o = duel('fascism', 'tribe', { seed: 12 });
  grow(o, 10, 40);
  const s = o.sim.state.structs.find((x) => x.type === 'arsenal' && x.cityId === o.ca.id) || WW.Military.tryArsenal(o.sim, o.ca, true);
  assert(s, 'Arsenal nicht erzwungen');
  if (!s.built) WW.Structs.complete(o.sim, s);
  for (const x of o.sim.state.structs) if (x.type === 'smithy' || x.type === 'factory') WW.Structs.remove(o.sim, x);
  for (const u of vehicles(o.sim, o.A.id)) WW.Units.kill(o.sim, u, 'test');
  run(o.sim, 1);
  // Verbrauch genau nach Tabelle
  const cost = WW.Military.costOf(o.A, 'tank', false);
  let sk = WW.Cities.stock(o.sim, o.ca);
  sk.iron = 30; sk.coal = 30; s.prod = null;
  WW.Military.production(o.sim);
  sk = WW.Cities.stock(o.sim, o.ca);
  log('Panzer-Auftrag:', s.prod, 'Eisen 30 ->', sk.iron, 'Kohle 30 ->', sk.coal, '(Kosten', JSON.stringify(cost) + ')');
  assert(s.prod === 'tank' && sk.iron === 30 - cost.iron && sk.coal === 30 - cost.coal, 'Eisen/Kohle nicht nach Tabelle verbraucht');
  s.prod = null; s.prog = 0;
  sk.iron = 0; sk.coal = 0; sk.gold = 500;
  delete sk.iron;   // fehlendes Feld darf nichts brechen
  let t = 0;
  while (!vehicles(o.sim, o.A.id).length && t < 240 * 12) { run(o.sim, 40); t += 40; }
  log('Behelfsbau:', t, 'Ticks, Bauart', s.lastPay);
  assert(vehicles(o.sim, o.A.id).length && s.lastPay === 'alt', 'kein Behelfsbau mit Gold');
  assert(t > WW.MIL.COST.tank.work / WW.MIL.GOVS.fascism.speedMul * 1.5, 'Behelf nicht langsamer');
});

test('3 Panzer: gepanzert, bricht Mauer, überrollt Barrikade, meidet Gebirge/Wasser, nicht unbesiegbar', function () {
  const o = duel('fascism', 'monarchy', { seed: 21 });
  run(o.sim, 240);
  const sim = o.sim, st = sim.state, W = st.W;
  const tab = sim._tables.tank || (WW.Military.spawnVehicle(sim, 'tank', o.A, 50, 30, o.ca.id), sim._tables.tank);
  assert(tab.cost[WW.T.MOUNTAIN] === 0 && tab.cost[WW.T.WATER] === 0 && tab.cost[WW.T.DEEP] === 0, 'Panzer fährt durch Gebirge/Wasser');
  assert(tab.speed[WW.T.FOREST] < 0.5 && tab.speed[WW.T.HILL] < 0.5 && tab.speed[WW.T.GRASS] === 1, 'Gelände bremst nicht');
  for (const u of vehicles(sim)) WW.Units.kill(sim, u, 'test');
  sim.actions.setRelation(o.A.id, o.B.id, 'war');
  // Mauer aus Stein vor dem Panzer
  const wx = 60, wy = 30;
  const wall = WW.Structs.create(sim, 'wall', wx, wy, o.cb.id, { built: true, level: 2, mat: 'stone' });
  const tank = WW.Military.spawnVehicle(sim, 'tank', o.A, wx - 0.5, wy + 0.5, o.ca.id);
  tank.x = wx - 0.5; tank.y = wy + 0.5;
  tank.order = { kind: 'march', city: o.cb.id, k: o.B.id }; tank.breach = wall.id;
  const hp0 = wall.hp;
  let t = 0;
  while (wall.built && t < 2000) { run(sim, 10); t += 10; tank.order = { kind: 'march', city: o.cb.id, k: o.B.id }; if (wall.built && tank.breach < 0) { tank.breach = wall.id; tank.x = wx - 0.5; tank.y = wy + 0.5; } }
  log('Steinmauer', hp0, 'LP fällt nach', t, 'Ticks');
  assert(!wall.built, 'Panzer bricht die Mauer nicht');
  assert(st.events.some((e) => e.type === 'tankBreach'), 'keine Chronik zum Mauerbruch');
  // Barrikade: sofort
  const bar = WW.Structs.create(sim, 'wall', wx, wy + 4, o.cb.id, { built: true, level: 1, mat: 'barricade' });
  tank.x = wx - 0.5; tank.y = wy + 4.5; tank.breach = bar.id; tank.cd = 0; tank.path = null;
  run(sim, 16);
  assert(!bar.built, 'Barrikade nicht überrollt');
  // Panzerung: Soldat richtet wenig aus, Geschütz und schwere Mauergeräte viel
  const sol = soldier(sim, o.B, o.cb, 70, 40);
  const dS = WW.Military.armor(sim, sol, tank, 10), dG = WW.Military.armor(sim, { id: 1, vehicle: true, role: 'artillery' }, tank, 10);
  const dDevH = WW.Military.armor(sim, { id: -1, kingdomId: o.B.id }, tank, 26), dDevL = WW.Military.armor(sim, { id: -1, kingdomId: o.B.id }, tank, 4);
  log('Schaden 10 -> Soldat', dS.toFixed(1), '| Geschütz', dG.toFixed(1), '| Kanone 26 ->', dDevH.toFixed(1), '| MG 4 ->', dDevL.toFixed(1));
  assert(dS < 3 && dG > 15 && dDevH > 26 && dDevL < 2, 'Panzerung falsch');
  // nicht unbesiegbar: 16 Soldaten gegen einen Panzer im Feld
  WW.Units.kill(sim, sol, 'test');
  const t2 = WW.Military.spawnVehicle(sim, 'tank', o.A, 40, 15, o.ca.id);
  const crowd = [];
  for (let i = 0; i < 16; i++) { const s = soldier(sim, o.B, o.cb, 38 + (i % 4), 12 + Math.floor(i / 4) * 2); s.foe = t2.id; crowd.push(s); }
  let tt = 0;
  while (!t2.dead && tt < 2400) { run(sim, 8); tt += 8; for (const s of crowd) if (!s.dead) { s.foe = t2.id; s.order = null; } }
  const alive = crowd.filter((s) => !s.dead).length;
  log('Panzer gegen 16 Soldaten:', t2.dead ? 'zerstört nach ' + tt + ' Ticks' : 'hält stand (' + Math.round(t2.hp) + ' LP)', '| übrig', alive, 'Soldaten');
  assert(t2.dead, 'Panzer unbesiegbar gegen 16 Soldaten');
  assert(alive < 16, 'Panzer richtet nichts aus');
  assert(st.wrecks.some((w) => w.kind === 'tank'), 'kein Wrack');
});

test('4 Artillerie trifft auf Distanz, macht Krater, ist im Nahkampf wehrlos', function () {
  const o = duel('monarchy', 'fascism', { seed: 31 });
  run(o.sim, 240);
  const sim = o.sim, st = sim.state;
  sim.actions.setRelation(o.A.id, o.B.id, 'war');
  const gun = WW.Military.spawnVehicle(sim, 'artillery', o.A, 50.5, 20.5, o.ca.id);
  gun.x = 50.5; gun.y = 20.5;
  const foes = [];
  for (let i = 0; i < 5; i++) { const s = soldier(sim, o.B, o.cb, 58 + (i % 2), 20 + (i >> 1)); s.wait = 99999; foes.push(s); }
  const hp0 = foes.reduce((a, s) => a + s.hp, 0);
  let shells = 0, maxD = 0;
  const marks0 = st.mark.filter((m) => m >= 100).length;
  for (let i = 0; i < 600; i++) {
    for (const s of foes) if (!s.dead) { s.x = Math.floor(s.x) + 0.5; s.path = null; s.foe = -1; }   // bleiben stehen
    sim.tick();
    for (const f of sim.drainFx()) if (f.type === 'shell') { shells++; maxD = Math.max(maxD, Math.hypot(f.x1 - f.x0, f.y1 - f.y0)); }
  }
  const hp1 = foes.reduce((a, s) => a + (s.dead ? 0 : s.hp), 0);
  const craters = st.mark.filter((m) => m >= 100).length - marks0;
  log('Granaten', shells, 'größte Distanz', maxD.toFixed(1), '| Leben der Gruppe', hp0, '->', Math.round(hp1), '| Krater', craters);
  assert(shells >= 5 && maxD >= 6.5, 'schießt nicht auf Distanz');
  assert(hp1 < hp0 * 0.6, 'trifft nicht');
  assert(craters > 0, 'keine Krater');
  assert(WW.MIL.GUN.range >= 8 && WW.MIL.GUN.range <= 10, 'Reichweite nicht 8–10');
  // Nahkampf: wehrlos
  const g2 = WW.Military.spawnVehicle(sim, 'artillery', o.A, 30.5, 45.5, o.ca.id);
  g2.x = 30.5; g2.y = 45.5;
  const near = soldier(sim, o.B, o.cb, 31, 45);
  near.x = 31.2; near.y = 45.5;
  let fired = 0;
  for (let i = 0; i < 120; i++) {
    near.x = g2.x + 0.7; near.y = g2.y; near.path = null;
    sim.tick();
    for (const f of sim.drainFx()) if (f.type === 'shell' && Math.abs(f.x0 - g2.x) < 0.01 && Math.abs(f.y0 - (g2.y - 0.3)) < 0.01) fired++;
  }
  log('Schüsse mit Feind in Nahkampfweite:', fired, '| Geschütz-LP', Math.round(g2.hp), '/', g2.maxHp);
  assert(fired === 0, 'Geschütz schießt im Nahkampf');
  // Mauern auf Distanz
  const w = WW.Structs.create(sim, 'wall', 80, 10, o.cb.id, { built: true, level: 2, mat: 'stone' });
  o.cb.wall.plan = (o.cb.wall.plan || []).concat([10 * st.W + 80]);   // gehört zum Ring der Stadt
  const g3 = WW.Military.spawnVehicle(sim, 'artillery', o.A, 72.5, 10.5, o.ca.id);
  g3.x = 72.5; g3.y = 10.5;
  const w0 = w.hp;
  for (let i = 0; i < 400; i++) { g3.order = { kind: 'march', city: o.cb.id, k: o.B.id }; g3.x = 72.5; g3.y = 10.5; sim.tick(); }
  log('Mauer unter Beschuss:', w0, '->', w.built ? Math.round(w.hp) : 'Bresche');
  assert(!w.built || w.hp < w0, 'Geschütz trifft keine Mauer');
});

// Feldschlacht-Szenario: Faschismus mit Panzern gegen Monarchie
function battleWorld(seed) {
  const o = duel('fascism', 'monarchy', { seed: seed });
  grow(o, 14, 44);
  for (let i = 0; i < 2; i++) o.sim.actions.placeVehicle(o.ca.cx + 8, o.ca.cy, 'tank');
  o.sim.actions.placeVehicle(o.cb.cx - 8, o.cb.cy, 'artillery');
  assert(o.sim.actions.orderBattle(o.A.id, o.B.id), 'Schlacht befehlen schlägt fehl');
  return o;
}

test('5 Feldschlacht: erkannt, Sieger, Ort, Gräben, Wracks; Rückzug oder Aufgabe', function () {
  const seen = { retreat: 0, surrender: 0, win: 0, draw: 0 };
  let sites = 0, trench = 0, starts = 0, maxTrench = 0;
  const texts = [];
  for (const seed of [7, 8, 9]) {
    const o = battleWorld(seed);
    const st = o.sim.state;
    let maxN = 0;
    for (let i = 0; i < 240 * 8; i++) {
      o.sim.tick();
      for (const b of st.battles) maxN = Math.max(maxN, b.nA + b.nB);
      maxTrench = Math.max(maxTrench, st.mil.trenchN);
      if (i % 40 === 0) for (const k of [o.A, o.B]) for (const c of st.cities) if (c.kingdomId === k.id && c.pop < 20 && st.year < 30) o.sim.actions.spawnSettlers(c.cx + 2, c.cy + 2, 6, null, 'human');
    }
    for (const s of st.sites) { seen[s.how]++; assert(s.kind === 'battlefield' && /^(\S+ )?Schlacht /.test(s.name) && s.losses && s.year >= 0, 'Ort unvollständig'); }
    sites += st.sites.length; trench = Math.max(trench, st.mil.trenchN);
    starts += st.events.filter((e) => e.type === 'battleStart').length;
    const ev = st.events.filter((e) => e.type === 'battle');
    assert(ev.length === st.sites.length || st.sites.length >= WW.MIL.MAX_SITES, 'Chronik und Orte passen nicht');
    for (const e of ev) { assert(e.popup === 'battle' && e.group === 'war' && st.sites.some((s) => s.id === e.siteId), 'Chronik-Eintrag ohne Pop-up/Ort'); }
    if (ev[0]) texts.push(ev[0].text);
    log('Seed', seed, '| Schlachten', st.sites.length, '| größte', maxN, 'Kämpfer | Gräben', st.mil.trenchN, '| Wracks', st.wrecks.length, '| Sieger', st.sites.map((s) => s.winner === o.A.id ? 'F' : (s.winner === o.B.id ? 'M' : '-')).join(''));
  }
  log('Ausgänge', JSON.stringify(seen), '| Beispiel:', texts[0]);
  assert(starts > 0 && sites > 0, 'keine Feldschlacht erkannt');
  assert(seen.win + seen.retreat + seen.surrender > 0, 'keine Schlacht mit Sieger');
  assert(seen.retreat + seen.surrender > 0, 'nie Rückzug oder Aufgabe');
  assert(maxTrench > 0, 'keine Gräben');
  // Gräben und Trichter wachsen zu, Wracks rosten
  const o = battleWorld(7);
  run(o.sim, 240 * 4);
  const st = o.sim.state;
  const tr = st.trench.reduce((a, v) => a + v, 0);
  const w = WW.Military.spawnVehicle(o.sim, 'tank', o.A, 60, 50, o.ca.id);
  WW.Units.kill(o.sim, w, 'test');
  o.sim.actions.setRelation(o.A.id, o.B.id, 'peace');
  run(o.sim, 240 * 12);
  const tr2 = st.trench.reduce((a, v) => a + v, 0);
  const wr = st.wrecks.find((x) => x.k === o.A.id && x.year <= st.year - 12);
  log('Gräben', tr, '->', tr2, 'nach 12 Jahren Frieden | Wrack rostet:', wr ? wr.rust : '-');
  assert(tr2 < tr || tr === 0, 'Gräben wachsen nicht zu');
  assert(wr && wr.rust >= 1, 'Wrack rostet nicht');
});

test('6 Marschgruppen fangen einander ab (Feldschlacht statt Vorbeilaufen)', function () {
  const o = duel('monarchy', 'monarchy', { seed: 41 });
  grow(o, 12, 44);
  const sim = o.sim, st = sim.state;
  sim.actions.setRelation(o.A.id, o.B.id, 'war');
  const W = st.W;
  // zwei Heere auf Parallelwegen, die sich nur auf 6 Kacheln nahekommen
  const ga = [], gb = [];
  for (let i = 0; i < 8; i++) { const u = soldier(sim, o.A, o.ca, 50, 24 + (i % 2)); u.order = { kind: 'march', city: o.cb.id, k: o.B.id }; ga.push(u); }
  for (let i = 0; i < 8; i++) { const u = soldier(sim, o.B, o.cb, 70, 30 + (i % 2)); u.order = { kind: 'march', city: o.ca.id, k: o.A.id }; gb.push(u); }
  let met = false, t = 0;
  for (; t < 600 && !met; t++) { sim.tick(); met = st.battles.length > 0 || st.events.some((e) => e.type === 'battleStart'); }
  log('Feldschlacht nach', t, 'Ticks:', met, '| gebundene Kämpfer', ga.concat(gb).filter((u) => !u.dead && u.foe >= 0).length);
  assert(met, 'Heere laufen aneinander vorbei');
  void W;
});

test('7 Sandkasten-Kräfte: Panzer setzen, Geschütz setzen, Schlacht befehlen', function () {
  const o = duel('democracy', 'theocracy', { seed: 51 });
  run(o.sim, 480);
  const sim = o.sim, st = sim.state;
  assert(sim.actions.strike(o.ca.cx + 5, o.ca.cy, 'milTank'), 'Panzer setzen');
  assert(sim.actions.strike(o.cb.cx - 5, o.cb.cy, 'milGun'), 'Geschütz setzen');
  const v = vehicles(sim);
  assert(v.length === 2 && v.some((u) => u.role === 'tank' && u.kingdomId === o.A.id) && v.some((u) => u.role === 'artillery' && u.kingdomId === o.B.id), 'Fahrzeuge falsch gesetzt');
  assert(!sim.actions.strike(-5, 3, 'milTank') && sim.actions.placeVehicle(NaN, 2, 'tank') === null && sim.actions.placeVehicle(5, 5, 'ufo') === null, 'Unsinn nicht abgefangen');
  assert(sim.actions.strike(o.ca.cx, o.ca.cy, 'milBattle'), 'erstes Reich wählen');
  assert(st.mil.pick === o.A.id, 'Auswahl nicht gemerkt');
  assert(sim.actions.strike(o.cb.cx, o.cb.cy, 'milBattle'), 'zweites Reich wählen');
  assert(o.A.relations[o.B.id].status === 'war' && o.A.relations[o.B.id].forced, 'Krieg nicht erzwungen');
  assert(st.units.some((u) => !u.dead && u.order && u.order.kind === 'march' && u.kingdomId === o.A.id) && st.units.some((u) => !u.dead && u.order && u.order.kind === 'march' && u.kingdomId === o.B.id), 'kein Marschziel');
  assert(st.events.some((e) => e.type === 'godBattle') && st.events.some((e) => e.type === 'godTank'), 'keine Chronik');
  assert(sim.actions.orderBattle(o.A.id, o.A.id) === false && sim.actions.orderBattle(999, o.A.id) === false, 'Unsinn bei orderBattle');
  run(sim, 600);
});

test('8 Speichern/Laden, Determinismus, alte Spielstände', function () {
  const A = battleWorld(8), B = battleWorld(8);
  run(A.sim, 700); run(B.sim, 700);
  assert(A.sim.hash() === B.sim.hash(), 'nicht deterministisch');
  // mitten in der Schlacht speichern
  let n = 0;
  while (!A.sim.state.battles.length && n < 3000) { A.sim.tick(); B.sim.tick(); n++; }
  log('Schlacht läuft:', A.sim.state.battles.length, '| Fahrzeuge', vehicles(A.sim).length, '| Gräben', A.sim.state.mil.trenchN);
  const sv = A.sim.serialize();
  assert(WW.Sim.load(sv).serialize() === sv, 'Laden ist nicht formstabil');
  const L = WW.Sim.load(sv);
  L._throwErrors = true;
  run(A.sim, 1500); run(L, 1500); run(B.sim, 1500);
  assert(A.sim.hash() === L.hash(), 'Laden und Weiterlaufen weicht ab');
  assert(A.sim.hash() === B.sim.hash(), 'nicht deterministisch (lang)');
  log('nach Laden gleich: Orte', L.state.sites.length, 'Wracks', L.state.wrecks.length, 'Gräben', L.state.mil.trenchN);
  // alter Spielstand ohne Militär
  const o = JSON.parse(A.sim.serialize());
  delete o.battles; delete o.sites; delete o.wrecks; delete o.mil; delete o.rasters.trench;
  o.units = o.units.filter((u) => !u.vehicle);
  o.structs = o.structs.filter((s) => s.type !== 'arsenal');
  const O = WW.Sim.load(JSON.stringify(o));
  assert(O, 'alter Spielstand lädt nicht');
  O._throwErrors = true;
  run(O, 1200);
  assert(Array.isArray(O.state.battles) && O.state.trench.length === O.state.W * O.state.H && O.state.mil, 'nicht nachgerüstet');
  const s2 = O.serialize();
  assert(WW.Sim.load(s2).serialize() === s2, 'nachgerüsteter Stand nicht formstabil');
});

test('9 Zeitaufschlag ohne Krieg und Dauerlauf mit Kriegen', function () {
  // Zeitaufschlag: normale Welt, Frieden (Gesetz Kriege aus), mit Fahrzeugen im Park
  const sim = WW.Sim.create({ seed: 5, size: 'small', populate: 4, govs: ['fascism', 'communism', 'democracy', 'monarchy'], laws: { wars: false } });
  sim._throwErrors = true;
  run(sim, 240 * 20);
  for (const k of sim.state.kingdoms) { const c = sim._cities.get(k.capitalId); if (c) { sim.actions.placeVehicle(c.cx + 4, c.cy, 'tank', k.id); sim.actions.placeVehicle(c.cx - 4, c.cy, 'artillery', k.id); } }
  const M = WW.Military, keys = ['tick', 'unit', 'armor', 'onKill'], orig = {};
  let ns = 0n;
  for (const k of keys) { orig[k] = M[k]; M[k] = function () { const t0 = process.hrtime.bigint(); const r = orig[k].apply(null, arguments); ns += process.hrtime.bigint() - t0; return r; }; }
  const T = 4000;
  const t0 = process.hrtime.bigint();
  try { run(sim, T); } finally { for (const k of keys) M[k] = orig[k]; }
  const all = Number(process.hrtime.bigint() - t0) / 1e6 / T;
  const ms = Number(ns) / 1e6 / T;
  log('Militär-Anteil ohne Krieg', ms.toFixed(4), 'ms/Tick (gesamt', all.toFixed(3), 'ms/Tick,', vehicles(sim).length, 'Fahrzeuge)');
  assert(ms < 0.05, 'Militär zu langsam');
  // Dauerlauf: gemischte Regierungen, Kriege erzwungen und von selbst
  const seeds = +(process.env.SOAK_SEEDS || 3);
  const TICKS = 40000;
  const dist = { moreVehiclesWon: 0, moreVehiclesLost: 0, equalGear: 0, draws: 0, tankRealmWins: 0, otherWins: 0 };
  const ends = [];
  for (let s = 0; s < seeds; s++) {
    const seed = 100 + s * 17;
    const w = WW.Sim.create({ seed: seed, size: 'small', populate: 6, govs: ['fascism', 'democracy', 'communism', 'monarchy', 'theocracy', 'republic'] });
    w._throwErrors = true;
    const st = w.state;
    const tankK = new Set();
    let maxV = 0, battles = 0;
    const t1 = Date.now();
    for (let i = 0; i < TICKS; i++) {
      w.tick();
      if (i % 2400 === 1200) {
        // ab und zu einen Krieg erzwingen (zwischen zufälligen Nachbarn)
        const ks = st.kingdoms.filter((k) => k.cityIds.length);
        if (ks.length >= 2) { const a = ks[(i / 2400 | 0) % ks.length], b = ks[((i / 2400 | 0) + 1) % ks.length]; if (a !== b) w.actions.setRelation(a.id, b.id, 'war'); }
      }
      if (i % 240 === 0) {
        for (const k of st.kingdoms) if (WW.MIL.GOVS[k.gov] && WW.MIL.GOVS[k.gov].tank) tankK.add(k.id);
        maxV = Math.max(maxV, vehicles(w).length);
        for (const u of st.units) {
          if (u.dead || !u.vehicle) continue;
          const ti = Math.floor(u.y) * st.W + Math.floor(u.x);
          assert(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp), 'NaN am Fahrzeug');
          assert(WW.TERRAIN_LUT.walk[st.terrain[ti]] > 0, 'Fahrzeug auf Wasser/Gebirge');
        }
        for (const c of st.cities) for (const r of ['iron', 'coal', 'gold']) { const sk = WW.Cities.stock(w, c); assert(!(sk[r] < -0.001), 'Lager negativ: ' + r); }
      }
    }
    for (const site of st.sites) {
      const va = site.vehicles ? site.vehicles.a : 0, vb = site.vehicles ? site.vehicles.b : 0;
      if (site.winner < 0) { dist.draws++; continue; }
      if (va === vb) dist.equalGear++;
      else if ((va > vb) === (site.winner === site.a)) dist.moreVehiclesWon++; else dist.moreVehiclesLost++;
      if (tankK.has(site.winner)) dist.tankRealmWins++; else dist.otherWins++;
    }
    battles = st.sites.length;
    // Anteil der Städte, die Panzer-Reiche am Ende halten
    let tc = 0;
    for (const c of st.cities) { const k = w._kingdoms.get(c.kingdomId); if (k && WW.MIL.GOVS[k.gov] && WW.MIL.GOVS[k.gov].tank) tc++; }
    const share = st.cities.length ? tc / st.cities.length : 0;
    ends.push(share);
    const govs = {};
    for (const k of st.kingdoms) govs[k.gov] = (govs[k.gov] || 0) + k.cityIds.length;
    log('Seed', seed, '|', ((Date.now() - t1) / TICKS).toFixed(3), 'ms/Tick | Jahr', st.year, '| Schlachtfelder', battles, '| Wracks', st.wrecks.length, '| max. Fahrzeuge', maxV,
      '| Städte je Regierung', JSON.stringify(govs), '| Panzer-Reiche halten', Math.round(share * 100) + ' %');
  }
  log('Sieger der Schlachten:', JSON.stringify(dist));
  assert(!(ends.length >= 2 && ends.every((s) => s > 0.85)), 'Panzer-Reiche überrennen jede Welt');
});

test('10 Regime bekommen rechtzeitig Fahrzeuge, im Krieg eine sichtbare Truppe', function () {
  const firsts = [], late = [];
  for (const seed of [1, 2, 6, 7]) {
    const sim = WW.Sim.create({ seed: seed, size: 'small', populate: 4, govs: ['fascism', 'communism', 'fascism', 'communism'], laws: { govChanges: false } });
    sim._throwErrors = true;
    const st = sim.state, first = {};
    for (let y = 1; y <= 30; y++) {
      run(sim, 240);
      for (const k of st.kingdoms) if (first[k.id] == null && vehicles(sim, k.id).length) first[k.id] = y;
    }
    for (const k of st.kingdoms) {
      if (!WW.MIL.GOVS[k.gov] || !WW.MIL.GOVS[k.gov].tank) continue;
      const cs = k.cityIds.map((id) => sim._cities.get(id));
      const pop = cs.reduce((a, c) => a + c.pop, 0);
      if (first[k.id] != null) firsts.push(first[k.id]);
      else if (pop >= 30 && cs.some((c) => c.tier >= 2)) late.push(seed + ':' + k.gov + ':' + pop);
    }
  }
  firsts.sort((a, b) => a - b);
  log('erstes Fahrzeug nach Jahren:', firsts.join(', '), '| ohne Fahrzeug trotz Stadt ≥ 30 Einw.:', late.join(' ') || '-');
  assert(firsts.length >= 4 && firsts[Math.floor(firsts.length / 2)] <= 25, 'erste Fahrzeuge zu spät/zu selten');
  assert(late.length <= 1, 'Regime mit Stadt ohne Fahrzeug: ' + late.join(' '));
  // Krieg: Truppe in der Größenordnung 1 je 25–30 Einwohner
  const o = duel('fascism', 'monarchy', { seed: 61 });
  grow(o, 12, 70);
  o.sim.actions.setRelation(o.A.id, o.B.id, 'war');
  const pop = () => o.A.cityIds.reduce((a, id) => a + (o.sim._cities.get(id) || { pop: 0 }).pop, 0);
  const made = () => o.sim.state.structs.filter((s) => s.type === 'arsenal' && o.A.cityIds.indexOf(s.cityId) >= 0).reduce((a, s) => a + (s.made | 0), 0);
  let y = 0;
  for (; y < 14 && made() < Math.max(2, Math.floor(pop() / 30)); y++) grow(o, 1, 70);
  const n = made();
  log('Krieg: Faschismus mit', pop(), 'Einw. hat nach', 12 + y, 'Jahren', n, 'Fahrzeuge gebaut,', vehicles(o.sim, o.A.id).length, 'im Dienst (Obergrenze', WW.Military.capOf(o.sim, o.A, 'tank', true) + '+' + WW.Military.capOf(o.sim, o.A, 'artillery', true) + ')');
  assert(n >= Math.floor(pop() / 30) && n >= 2, 'keine sichtbare Truppe im Krieg');
});

test('11 Schlachtnamen abwechslungsreich, Aufgebende kämpfen nicht mehr', function () {
  const o = duel('fascism', 'monarchy', { seed: 71, terrain: (t, W, H) => { for (let y = 0; y < H; y++) { t[y * W + 44] = WW.T.RIVER; t[y * W + 60] = WW.T.RIVER; } } });
  run(o.sim, 240);
  const names = [];
  for (let i = 0; i < 9; i++) { const px = i < 5 ? 40 : 58, nm = WW.Military.battleName(o.sim, px, 30); names.push(nm.name); o.sim.state.sites.push({ id: -1 - i, kind: 'battlefield', name: nm.name, base: nm.base, x: px, y: 30, r: 10, year: 0, a: o.A.id, b: o.B.id, winner: -1, losses: { a: 0, b: 0 }, pows: 0, how: 'draw' }); }
  log('Namen:', names.join(' | '));
  assert(new Set(names).size === names.length, 'Namen doppelt');
  assert(names.filter((n) => /^(Zweite|Dritte|Vierte|Fünfte|Sechste) /.test(n)).length <= 1, 'zu früh mit Zählwort');
  assert(names.some((n) => /Fluss|Furt/.test(n)) && names.some((n) => /vor /.test(n)), 'Fluss/Gelände fehlen im Namen');
  o.sim.state.sites.length = 0;
  // Aufgabe: Heimgeschickte sind weder Angreifer noch Ziel
  o.sim.actions.setRelation(o.A.id, o.B.id, 'war');
  const a = soldier(o.sim, o.A, o.ca, 50, 30), b = soldier(o.sim, o.B, o.cb, 51, 30);
  assert(WW.Units.hostile(o.sim, a, b), 'Vorlauf: nicht verfeindet');
  b.parole = o.sim.state.tick + 100;
  assert(!WW.Units.hostile(o.sim, a, b) && !WW.Units.hostile(o.sim, b, a), 'Aufgebender ist noch Ziel/Angreifer');
  const hp = b.hp;
  for (let i = 0; i < 60; i++) { b.x = 51.5; b.y = 30.5; a.x = 50.5; a.y = 30.5; o.sim.tick(); }
  assert(b.hp >= hp && !b.dead, 'Aufgebender wird angegriffen');
});

console.log('\n--- Ergebnis');
for (const r of results) console.log('  ' + (r.ok ? 'ok    ' : 'FEHLER') + '  ' + r.name + '  (' + (r.ms / 1000).toFixed(1) + ' s)' + (r.ok ? '' : '  -> ' + (r.err && r.err.message)));
const bad = results.filter((r) => !r.ok).length;
console.log(bad ? '\n' + bad + ' Test(s) fehlgeschlagen.' : '\nAlle ' + results.length + ' Tests bestanden.');
process.exit(bad ? 1 : 0);
