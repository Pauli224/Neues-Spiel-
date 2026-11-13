// Tests der Wildnis (Tiere, Monster, Orte, Kräfte): node tests/wild.js [filter]
'use strict';
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
const isNum = (v) => typeof v === 'number' && isFinite(v);
function counts(sim) { const c = {}; for (const a of sim.state.animals) if (!a.dead) c[a.kind] = (c[a.kind] || 0) + 1; return c; }
const HERB = ['sheep', 'cow', 'chicken', 'rabbit', 'deer'];

function checkInvariants(sim, where) {
  const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
  for (const u of st.units) {
    if (u.dead) continue;
    assert(isNum(u.x) && isNum(u.y) && isNum(u.hp), where + ': Einheit ' + u.id + ' NaN');
    assert(u.x >= 0 && u.y >= 0 && u.x < W && u.y < H, where + ': Einheit außerhalb');
    const i = Math.floor(u.y) * W + Math.floor(u.x);
    assert(LUT.walk[st.terrain[i]] > 0, where + ': Einheit ' + u.id + ' (' + u.role + ') auf ' + WW.TERRAIN[st.terrain[i]].key);
    assert(sim._units.get(u.id) === u, where + ': Einheiten-Index');
  }
  for (const a of st.animals) {
    if (a.dead) continue;
    assert(isNum(a.x) && isNum(a.y) && isNum(a.hp) && isNum(a.food), where + ': Tier ' + a.id + ' (' + a.kind + ') NaN');
    assert(a.x >= 0 && a.y >= 0 && a.x < W && a.y < H, where + ': Tier außerhalb');
    const cr = WW.CREATURES[a.kind];
    assert(cr, where + ': unbekannte Art ' + a.kind);
    const i = Math.floor(a.y) * W + Math.floor(a.x);
    assert(WW.Creatures.canEnter(sim, cr, i), where + ': ' + a.kind + ' ' + a.id + ' auf verbotener Kachel ' + WW.TERRAIN[st.terrain[i]].key + ' block ' + sim.block[i]);
    assert(sim._animals.get(a.id) === a, where + ': Tier-Index');
  }
  assert(st.animals.length <= WW.Creatures.maxAnimals(sim) + 45, where + ': zu viele Tiere ' + st.animals.length);
  for (const s of st.structs) {
    if (s.dead) continue;
    assert(isNum(s.hp), where + ': Bauwerk NaN');
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) assert(st.structAt[(s.y + dy) * W + s.x + dx] === s.id, where + ': structAt passt nicht zu ' + s.type);
    if (s.type === 'lair') assert(WW.LAIRS[s.kind], where + ': Ort ohne kind');
  }
  for (const c of st.cities) for (const r of ['food', 'wood', 'stone', 'gold']) assert(isNum(WW.Cities.stock(sim, c)[r]) && WW.Cities.stock(sim, c)[r] >= 0, where + ': Lager ' + r);
  for (const e of st.wild.effects) assert(isNum(e.x) && isNum(e.y) && isNum(e.t), where + ': Effekt kaputt');
  for (const p of st.aircraft) assert(isNum(p.x) && isNum(p.y) && isNum(p.ttl) && isNum(p.angle), where + ': Flugzeug kaputt');
  for (let i = 0; i < W * H; i += 97) assert(WW.TERRAIN[st.terrain[i]], where + ': Gelände-ID kaputt');
}

// Testwiese mit Wald, Strand, Wasser, Wüste, Schnee, Kristall (alle Habitate)
function testWorld(W, H) {
  const T = WW.T, N = W * H;
  const terrain = new Uint8Array(N), height = new Uint8Array(N), variant = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, e = Math.min(x, y, W - 1 - x, H - 1 - y);
    let t = T.GRASS, h = 130;
    if (e < 2) { t = T.WATER; h = 80; } else if (e < 3) { t = T.SAND; h = 102; }
    else if (x < W * 0.25) t = (y % 9 < 6) ? T.FOREST : T.GRASS;
    else if (x > W * 0.8 && y < H * 0.3) t = T.SNOWFIELD;
    else if (x > W * 0.8 && y > H * 0.7) t = T.DESERT;
    else if (x > W * 0.45 && x < W * 0.52 && y > H * 0.6) t = T.CRYSTAL;
    else if (x > W * 0.45 && x < W * 0.52 && y < H * 0.3) { t = T.SHALLOW; h = 97; }
    else if (x > W * 0.6 && x < W * 0.7 && y > H * 0.45 && y < H * 0.55) { t = T.HILL; h = 180; }
    terrain[i] = t; height[i] = h; variant[i] = (x * 31 + y * 17) & 255;
  }
  return { W, H, terrain, height, variant, startSpots: [{ x: W >> 1, y: H >> 1 }], name: 'Wildwiese' };
}
function tileOf(sim, pred) {
  const st = sim.state;
  for (let i = 0; i < st.W * st.H; i++) if (pred(st.terrain[i], i)) return { x: (i % st.W) + 0.5, y: Math.floor(i / st.W) + 0.5, i };
  return null;
}

// --------------------------------------------------------------------------
test('1 Dauerlauf mit Wildnis (30 000 Ticks, 3 Reiche, mittlere Karte)', function () {
  const sim = makeSim({ seed: 'wild-dauer', size: 'medium', populate: 3 });
  const st = sim.state;
  let minHerb = 1e9, maxAll = 0;
  const maxKind = {};
  const rows = [];
  run(sim, 30000, 250, (i) => {
    checkInvariants(sim, 'Tick ' + i);
    const c = counts(sim);
    let herb = 0; for (const k of HERB) herb += c[k] || 0;
    minHerb = Math.min(minHerb, herb); maxAll = Math.max(maxAll, st.animals.length);
    for (const k in c) maxKind[k] = Math.max(maxKind[k] || 0, c[k]);
    if (i % 5000 === 0) rows.push('Jahr ' + st.year + ': ' + st.animals.length + ' Tiere ' + JSON.stringify(c) + ' · Einheiten ' + st.units.length + ' · Räuber ' + st.units.filter(u => u.role === 'bandit').length + ' · Orte ' + WW.Wild.lairsOf(sim).length);
  });
  for (const r of rows) log(r);
  const types = {};
  for (const e of st.events) types[e.type] = (types[e.type] || 0) + 1;
  log('Wildnis-Ereignisse (letzte 400):', Object.keys(types).filter(k => WW.TEXTS_WILD[k]).map(k => k + ':' + types[k]).join(' '));
  for (const e of st.events.filter(e => WW.TEXTS_WILD[e.type]).slice(-6)) log('  „' + e.text + '"');
  log('min. Pflanzenfresser', minHerb, '· max. Tiere', maxAll, '· Höchststände', JSON.stringify(maxKind));
  let flora = 0, grazed = 0; for (let i = 0; i < st.flora.length; i++) { if (st.flora[i] === 1 || st.flora[i] === 2) flora++; if (st.graze[i] >= 128) grazed++; }
  log('Beerensträucher', flora, '· abgeweidete Kacheln', grazed);
  assert(minHerb > 5, 'Pflanzenfresser fast ausgestorben');
  for (const k in maxKind) { const cr = WW.CREATURES[k]; if (cr.category === 'animal') assert(maxKind[k] <= cr.max + 10, k + ' explodiert: ' + maxKind[k]); }
  assert(st.cities.length >= 1 && st.units.length > 20, 'Völker gehen an der Wildnis zugrunde');
});

test('1b Leere Welt lebt (populate 0, 20 000 Ticks)', function () {
  const sim = makeSim({ seed: 'leer-lebt', size: 'medium', populate: 0 });
  const st = sim.state;
  const c0 = counts(sim);
  let forest0 = 0; for (let i = 0; i < st.terrain.length; i++) if (WW.TERRAIN_LUT.wood[st.terrain[i]]) forest0++;
  log('Start:', st.animals.length, 'Tiere', JSON.stringify(c0), '· Orte', WW.Wild.lairsOf(sim).map(s => s.kind).join(','));
  let minHerb = 1e9, maxSheep = 0;
  run(sim, 20000, 500, (i) => {
    checkInvariants(sim, 'Tick ' + i);
    const c = counts(sim); let h = 0; for (const k of HERB) h += c[k] || 0;
    minHerb = Math.min(minHerb, h); maxSheep = Math.max(maxSheep, c.sheep || 0);
  });
  let forest1 = 0; for (let i = 0; i < st.terrain.length; i++) if (WW.TERRAIN_LUT.wood[st.terrain[i]]) forest1++;
  log('Ende:', st.animals.length, 'Tiere', JSON.stringify(counts(sim)), '· Wald', forest0, '→', forest1, '· min. Pflanzenfresser', minHerb, '· max. Schafe', maxSheep);
  assert(c0.fish > 0 && (c0.sheep || 0) + (c0.rabbit || 0) > 0 && (c0.wolf || 0) > 0, 'Startwelt nicht bevölkert');
  assert(minHerb > 10, 'leere Welt verödet');
  assert(maxSheep <= WW.CREATURES.sheep.max, 'Schafe fluten die Karte');
  assert(forest1 >= forest0 * 0.95, 'Wald schrumpft ohne Zutun');
});

test('2 Jede Kreatur-Art lässt sich setzen und verhält sich', function () {
  const sim = makeSim({ seed: 'arten', world: testWorld(96, 64), populate: 1, races: ['human'], govs: ['tribe'], animals: false });
  const st = sim.state;
  const placed = {};
  for (const kind of WW.CREATURE_KEYS) {
    const cr = WW.CREATURES[kind];
    assert(cr.name && cr.desc && cr.category && cr.spawnable === true, kind + ': Tabellenfelder fehlen');
    const key = cr.habitat[0];
    const t = tileOf(sim, (tt, i) => WW.TERRAIN[tt].key === key && WW.Creatures.canEnter(sim, cr, i) && st.owner[i] === -1) || tileOf(sim, (tt, i) => WW.Creatures.canEnter(sim, cr, i));
    const id = sim.actions.spawnAnimal(t.x, t.y, kind);
    assert(id != null, kind + ' lässt sich nicht setzen');
    placed[kind] = id;
  }
  // Unsinn
  assert(sim.actions.spawnAnimal(NaN, 3, 'dragon') === null && sim.actions.spawnAnimal(3, 3, 'einhorn') === null, 'Unsinn wird gesetzt');
  // Fisch auf Land landet im Wasser oder gar nicht
  const land = tileOf(sim, (tt) => tt === WW.T.GRASS);
  const fid = sim.actions.spawnAnimal(land.x, land.y, 'fish');
  if (fid != null) { const f = sim.query.animal(fid); assert(WW.TERRAIN_LUT.water[st.terrain[Math.floor(f.y) * st.W + Math.floor(f.x)]], 'Fisch auf Land'); }
  run(sim, 600, 50, (i) => checkInvariants(sim, 'Arten ' + i));
  const alive = WW.CREATURE_KEYS.filter(k => sim.query.animal(placed[k]));
  log('nach 600 Ticks noch da:', alive.join(', '));
  const moved = WW.CREATURE_KEYS.filter(k => { const a = sim.query.animal(placed[k]); return a && a.age >= 0; });
  assert(moved.length >= WW.CREATURE_KEYS.length - 4, 'zu viele Arten sofort verschwunden');
});

test('2b Drache zündet, Zombie steckt an, Schleim teilt sich', function () {
  const sim = makeSim({ seed: 'monster', world: testWorld(96, 64), populate: 1, races: ['human'], govs: ['tribe'], animals: false });
  const st = sim.state;
  // Drache über dem Wald
  const f = tileOf(sim, (t, i) => t === WW.T.FOREST && st.owner[i] === -1 && (i % st.W) > 8 && Math.floor(i / st.W) > 8);
  const did = sim.actions.spawnAnimal(f.x, f.y, 'dragon');
  const d = sim.query.animal(did);
  d.state = 2; d.t = 4; d.cd = 0;
  let fired = false;
  run(sim, 80, 1, () => { if (st.fireCount > 0) { fired = true; return true; } });
  assert(fired, 'Drache zündet nicht');
  log('Drache: Feuer nach Feueratem', st.fireCount);
  // Zombie und ein schwacher Bewohner
  const c = st.cities[0];
  const u = st.units.find(v => !v.dead && v.cityId === c.id);
  const z0 = counts(sim).zombie || 0;
  const zid = sim.actions.spawnAnimal(u.x + 0.6, u.y, 'zombie');
  assert(zid != null, 'Zombie nicht gesetzt');
  u.hp = 1;
  let infected = false;
  run(sim, 400, 4, () => { if ((counts(sim).zombie || 0) > z0 + 1) { infected = true; return true; } });
  assert(infected, 'Zombie steckt nicht an');
  log('Zombies:', counts(sim).zombie);
  // Schleim teilt sich
  const g = tileOf(sim, (t, i) => t === WW.T.GRASS && st.owner[i] === -1 && WW.Creatures.canEnter(sim, WW.CREATURES.slime, i));
  const sid = sim.actions.spawnAnimal(g.x, g.y, 'slime');
  const s = sim.query.animal(sid);
  const before = counts(sim).slime || 0;
  WW.Creatures.hit(sim, s, 9999, null);
  const after = counts(sim).slime || 0;
  log('Schleim:', before, '→', after);
  assert(after === before + 1, 'Schleim teilt sich nicht (' + before + ' → ' + after + ')');
  const kids = st.animals.filter(a => !a.dead && a.kind === 'slime' && a.size === 2);
  assert(kids.length === 2, 'Teilung ergibt keine zwei kleineren Schleime');
  // Sandwurm unter dem Sand ist unverwundbar
  const ds = tileOf(sim, (t) => t === WW.T.DESERT);
  const w = sim.query.animal(sim.actions.spawnAnimal(ds.x, ds.y, 'sandworm'));
  const hp = w.hp; WW.Creatures.hit(sim, w, 50, null);
  assert(w.buried && w.hp === hp, 'Sandwurm unter dem Sand verwundbar');
  run(sim, 100, 10, (i) => checkInvariants(sim, 'Monster ' + i));
});

test('2c Geist passiert Mauer, Bodenmonster nicht', function () {
  const sim = makeSim({ seed: 'mauer-geist', world: testWorld(96, 64), populate: 0, animals: false });
  const st = sim.state;
  // gemalter Mauerring 9×9 um (60,20)
  const x0 = 56, y0 = 16, x1 = 64, y1 = 24;
  for (let x = x0; x <= x1; x++) { sim.actions.strike(x + 0.5, y0 + 0.5, 'wallbrush'); sim.actions.strike(x + 0.5, y1 + 0.5, 'wallbrush'); }
  for (let y = y0; y <= y1; y++) { sim.actions.strike(x0 + 0.5, y + 0.5, 'wallbrush'); sim.actions.strike(x1 + 0.5, y + 0.5, 'wallbrush'); }
  let walls = 0; for (const s of st.structs) if (!s.dead && s.type === 'wall' && s.cityId === -1) walls++;
  assert(walls >= 30, 'Mauer malen setzt keine Mauern (' + walls + ')');
  const inside = 20 * st.W + 60;
  const ids = { ghost: sim.actions.spawnAnimal(50.5, 20.5, 'ghost'), zombie: sim.actions.spawnAnimal(50.5, 21.5, 'zombie'),
    wolf: sim.actions.spawnAnimal(50.5, 19.5, 'wolf'), giantchicken: sim.actions.spawnAnimal(50.5, 22.5, 'giantchicken'), dragon: sim.actions.spawnAnimal(50.5, 18.5, 'dragon') };
  const inBox = (a) => a.x > x0 + 1 && a.x < x1 && a.y > y0 + 1 && a.y < y1;
  const reached = {};
  for (let t = 0; t < 500; t++) {
    for (const k in ids) { const a = sim.query.animal(ids[k]); if (a) { a.tx = inside; a.state = 1; a.foe = -1; } }
    sim.tick();
    for (const k in ids) { const a = sim.query.animal(ids[k]); if (a && inBox(a)) reached[k] = true; }
  }
  log('innerhalb der Mauer angekommen:', Object.keys(reached).join(', ') || '–');
  assert(reached.ghost, 'Geist kommt nicht durch die Mauer');
  assert(reached.dragon, 'Drache fliegt nicht über die Mauer');
  assert(!reached.zombie && !reached.wolf && !reached.giantchicken, 'Bodenmonster durchdringt die Mauer');
  checkInvariants(sim, 'Mauer');
});

test('3 Jede Kraft: Unsinn, Stadt, Wasser, Kartenrand', function () {
  const sim = makeSim({ seed: 'kraefte', size: 'small', populate: 3 });
  const st = sim.state;
  const junk = [NaN, -1, 1e9, Infinity, -Infinity, null, undefined, 'x', {}, [], -0.0001];
  const water = tileOf(sim, (t) => t === WW.T.WATER) || { x: 1, y: 1 };
  const deep = tileOf(sim, (t) => t === WW.T.DEEP) || water;
  const rows = [];
  for (const key of WW.POWER_KEYS) {
    const p = WW.POWERS[key];
    assert(p.name && p.desc && p.category && isNum(p.radius) && typeof p.apply === 'function', key + ': Tabellenfelder fehlen');
    for (const a of junk) for (const b of [3, a]) assert(sim.actions.strike(a, b, key) === false || sim.actions.strike(a, b, key) === null, key + ' nimmt Unsinn an');
    assert(sim.actions.strike(3, 3, key, 'quatsch') !== null, key + ' wirft bei Unsinn-Optionen');
    const c = st.cities[0] || { cx: st.W >> 1, cy: st.H >> 1 };
    const spots = [[c.cx + 0.5, c.cy + 0.5], [water.x, water.y], [deep.x, deep.y], [0, 0], [st.W - 0.01, st.H - 0.01], [0, st.H - 1], [st.W - 1, 0]];
    for (const s of spots) {
      sim.actions.strike(s[0], s[1], key, { dx: 1, dy: 0.5 });
      if (sim._lastError) throw new Error(key + ' wirft intern: ' + (sim._lastError.stack || sim._lastError));
      if (key === 'hand') sim.actions.strike(s[0] + 3, s[1], key);
    }
    run(sim, 40, 20, (i) => checkInvariants(sim, key + ' ' + i));
    rows.push(key + '(' + p.category + ')');
  }
  run(sim, 600, 50, (i) => checkInvariants(sim, 'Nachlauf ' + i));
  log('geprüft:', rows.join(' '));
  const cats = {}; for (const k of WW.POWER_KEYS) cats[WW.POWERS[k].category] = (cats[WW.POWERS[k].category] || 0) + 1;
  log('Kategorien:', JSON.stringify(cats));
  for (const k of ['bomb', 'clusterbomb', 'napalm', 'rocket', 'bomber', 'gunship', 'nuke', 'tsar', 'orbitallaser', 'blackhole']) assert(WW.POWERS[k] && WW.POWERS[k].category === 'destruction', k + ' fehlt in Zerstörung');
  assert(st.aircraft.length === 0, 'Flugzeuge bleiben hängen');
  assert(st.wild.effects.every(e => e.type === 'frost'), 'Effekte laufen nicht aus: ' + st.wild.effects.map(e => e.type).join(','));
});

test('4 Land heben/senken ändert Gelände konsistent', function () {
  const sim = makeSim({ seed: 'heben', size: 'small', populate: 2 });
  const st = sim.state, N = st.W * st.H;
  const t0 = Uint8Array.from(st.terrain), h0 = Uint8Array.from(st.height);
  const land = tileOf(sim, (t, i) => t === WW.T.GRASS && st.owner[i] === -1) || { x: 20, y: 20 };
  const sea = tileOf(sim, (t) => t === WW.T.WATER) || { x: 1, y: 1 };
  for (let k = 0; k < 10; k++) sim.actions.strike(land.x, land.y, 'raise');
  const ci = Math.floor(land.y) * st.W + Math.floor(land.x);
  log('Wiese nach 10× heben:', WW.TERRAIN[st.terrain[ci]].name, 'Höhe', h0[ci], '→', st.height[ci]);
  assert(WW.TERRAIN_LUT.rank[st.terrain[ci]] >= 5, 'Heben macht keinen Berg/Hügel');
  for (let k = 0; k < 8; k++) sim.actions.strike(sea.x, sea.y, 'raise');
  const si = Math.floor(sea.y) * st.W + Math.floor(sea.x);
  log('Meer nach 8× heben:', WW.TERRAIN[st.terrain[si]].name, 'Höhe', h0[si], '→', st.height[si]);
  assert(!WW.TERRAIN_LUT.water[st.terrain[si]], 'Heben macht aus Meer kein Land');
  for (let k = 0; k < 20; k++) sim.actions.strike(land.x + 1, land.y, 'lower');
  log('Berg nach 20× senken:', WW.TERRAIN[st.terrain[ci]].name, 'Höhe', st.height[ci]);
  assert(WW.TERRAIN_LUT.water[st.terrain[ci]], 'Senken bringt kein Wasser');
  let bad = 0, changed = 0;
  const band = WW.Wild.bandOf;
  for (let i = 0; i < N; i++) {
    if (st.height[i] === h0[i] && st.terrain[i] === t0[i]) continue;
    changed++;
    if (band(st.height[i]) === band(h0[i])) { if (st.terrain[i] !== t0[i] && !WW.TERRAIN_LUT.water[st.terrain[i]] === !WW.TERRAIN_LUT.water[t0[i]] && WW.TERRAIN_LUT.rank[st.terrain[i]] !== band(st.height[i])) bad++; continue; }
    const r = WW.TERRAIN_LUT.rank[st.terrain[i]], b = band(st.height[i]);
    if (r !== b && !(st.terrain[i] === WW.T.RIVER && b >= 2 && b <= 4)) bad++;
  }
  log('geänderte Kacheln', changed, '· unpassend', bad);
  assert(changed > 20 && bad === 0, 'Gelände passt nicht zur Höhe (' + bad + ')');
  // Bauwerke auf Wasser?
  for (const s of st.structs) if (!s.dead && s.type !== 'wall' && s.type !== 'gate' && s.type !== 'tower') {
    WW.Structs.forTiles(sim, s, (i) => assert(WW.TERRAIN_LUT.walk[st.terrain[i]] > 0, s.type + ' steht nach Senken im Wasser'));
  }
  run(sim, 300, 50, (i) => checkInvariants(sim, 'Heben ' + i));
});

test('5 Fuzz (3000 zufällige Aktionen)', function () {
  const sim = WW.Sim.create({ seed: 'wild-fuzz', size: 'small', populate: 3 });
  const r = WW.RNG.create('wild-fuzz-aktionen');
  const W = sim.state.W, H = sim.state.H;
  const junk = [NaN, -1, 1e9, Infinity, null, undefined, 'x', {}, [], 0.5];
  const coord = (m) => r.chance(0.1) ? r.pick(junk) : r.range(-3, m + 3);
  const powers = WW.POWER_KEYS.concat(['nix', null, 'toString', '__proto__']);
  const kinds = WW.CREATURE_KEYS.concat(['drache', null]);
  const lairs = WW.LAIR_KEYS.concat(['burg', null]);
  const anyId = () => { const s = sim.state; const pool = s.units.concat(s.animals).concat(s.aircraft); return r.chance(0.1) ? r.pick(junk) : (pool.length ? r.pick(pool).id : 1); };
  const counts2 = {};
  for (let n = 0; n < 3000; n++) {
    const a = r.int(10);
    let name;
    switch (a) {
      case 0: case 1: case 2: name = 'strike'; sim.actions.strike(coord(W), coord(H), r.pick(powers), r.chance(0.5) ? { dx: coord(3) - 1, dy: coord(3) - 1 } : r.pick(junk)); break;
      case 3: name = 'spawnAnimal'; sim.actions.spawnAnimal(coord(W), coord(H), r.pick(kinds)); break;
      case 4: name = 'grab'; sim.actions.grab(anyId()); break;
      case 5: name = 'drop'; sim.actions.drop(coord(W), coord(H)); break;
      case 6: name = 'aimAircraft'; sim.actions.aimAircraft(anyId(), coord(W), coord(H)); break;
      case 7: name = 'placeLair'; sim.actions.placeLair(coord(W), coord(H), r.pick(lairs)); break;
      case 8: name = 'spawnBandits'; sim.actions.spawnBandits(coord(W), coord(H), r.chance(0.2) ? r.pick(junk) : r.irange(1, 5)); break;
      default: name = 'paintTerrain'; sim.actions.paintTerrain(coord(W), coord(H), r.irange(1, 3), r.int(WW.TERRAIN.length)); break;
    }
    counts2[name] = (counts2[name] || 0) + 1;
    if (sim._lastError) throw new Error('Aktion ' + name + ' hat intern geworfen: ' + (sim._lastError.stack || sim._lastError));
    const t = r.irange(0, 5);
    for (let i = 0; i < t; i++) sim.tick();
    if (n % 50 === 0) { checkInvariants(sim, 'Fuzz ' + n); sim.drainFx(); sim.drainDirtyTiles(); }
  }
  run(sim, 1500, 150, (i) => checkInvariants(sim, 'Nachlauf ' + i));
  const D = WW.Sim.load(sim.serialize());
  assert(D && D.serialize() === sim.serialize(), 'Spielstand nach Fuzz nicht stabil');
  log('Aktionen:', JSON.stringify(counts2), '· Tiere', sim.state.animals.length, '· Einheiten', sim.state.units.length);
});

test('6 Speichern/Laden und Determinismus (auch mitten im Überflug)', function () {
  const mk = () => makeSim({ seed: 'wild-det', size: 'small', populate: 2 });
  const act = (s) => {
    const c = s.state.cities[0];
    const x = c ? c.cx + 3 : 30, y = c ? c.cy + 3 : 30;
    s.actions.strike(x, y, 'gunship'); s.actions.strike(x, y, 'bomber', { dx: 0.3, dy: 1 }); s.actions.strike(x, y, 'rocket');
    s.actions.strike(x - 8, y, 'tornado'); s.actions.strike(x + 8, y, 'flood'); s.actions.strike(x, y + 8, 'volcano');
    s.actions.strike(x - 6, y - 6, 'blackhole'); s.actions.strike(x + 6, y - 6, 'frost'); s.actions.strike(x, y - 10, 'nuke');
    s.actions.spawnAnimal(x, y, 'dragon'); s.actions.spawnBandits(x - 4, y, 3);
    const u = s.state.units.find(v => !v.dead && v.cityId >= 0);
    if (u) s.actions.grab(u.id);
  };
  const A = mk(), B = mk();
  assert(A.hash() === B.hash(), 'Startzustand verschieden');
  run(A, 1690); run(B, 1690); act(A); act(B);
  run(A, 1310); run(B, 1310);
  assert(A.hash() === B.hash(), 'gleicher Seed, gleiche Aktionen -> verschiedene Zustände');
  const C = mk();
  run(C, 1690); act(C); run(C, 10);
  assert(C.state.aircraft.length > 0 && C.state.wild.effects.length > 0, 'nichts im Flug beim Speichern');
  log('beim Speichern: Flugzeuge', C.state.aircraft.map(p => p.kind).join(','), '· Effekte', C.state.wild.effects.map(e => e.type).join(','), '· gehalten', JSON.stringify(C.actions.held()));
  const save = C.serialize();
  const D = WW.Sim.load(save);
  assert(D, 'Laden fehlgeschlagen');
  D._throwErrors = true;
  assert(D.serialize() === save, 'serialize(load(x)) != x');
  run(C, 1300); run(D, 1300);
  assert(C.hash() === D.hash(), 'nach Laden weitergelaufen: Zustand weicht ab');
  assert(C.hash() === A.hash(), 'mit Unterbrechung anders als ohne');
  assert(D.actions.drop(10, 10) != null || D.actions.held() === null, 'Absetzen nach Laden geht nicht');
  log('Hash gleich:', A.hash(), '· Spielstand', (save.length / 1024).toFixed(0), 'KiB');
});

test('7 Fallout klingt ab, Flugzeuge verschwinden, Krater senken height', function () {
  const sim = makeSim({ seed: 'fallout', size: 'small', populate: 1 });
  const st = sim.state;
  const p = tileOf(sim, (t, i) => t === WW.T.GRASS && st.owner[i] === -1 && (i % st.W) > 15 && (i % st.W) < st.W - 15 && Math.floor(i / st.W) > 15 && Math.floor(i / st.W) < st.H - 15);
  const h0 = st.height[p.i];
  sim.actions.strike(p.x, p.y, 'nuke');
  let fall = 0; for (let i = 0; i < st.fallout.length; i++) if (st.fallout[i]) fall++;
  log('Fallout-Kacheln nach Atombombe', fall, '· Höhe Mitte', h0, '→', st.height[p.i], WW.TERRAIN[st.terrain[p.i]].name);
  assert(fall > 100 && st.height[p.i] < h0, 'Atombombe ohne Fallout/Krater');
  sim.actions.strike(p.x, p.y, 'gunship');
  sim.actions.strike(5, 5, 'bomber', { dx: 1, dy: 1 });
  sim.actions.strike(p.x, p.y, 'rocket');
  assert(st.aircraft.length === 3, 'Flugzeuge nicht gestartet');
  const id = st.aircraft[0].id;
  assert(sim.actions.aimAircraft(id, p.x + 3, p.y) === true && sim.actions.aimAircraft(id, NaN, 2) === false, 'aimAircraft');
  let gone = -1;
  run(sim, 600, 1, (i) => { if (st.aircraft.length === 0) { gone = i; return true; } });
  log('Flugzeuge weg nach', gone, 'Ticks');
  assert(gone > 0, 'Flugzeuge verschwinden nicht');
  run(sim, 2200, 200, (i) => checkInvariants(sim, 'Fallout ' + i));
  fall = 0; for (let i = 0; i < st.fallout.length; i++) if (st.fallout[i]) fall++;
  log('Fallout-Kacheln nach 2200+ Ticks', fall);
  assert(fall === 0, 'Fallout klingt nicht ab');
  // Großer Rumms an der Küste: Krater unter Meeresspiegel läuft voll
  const coast = tileOf(sim, (t, i) => t === WW.T.SAND);
  let w0 = 0; for (let i = 0; i < st.terrain.length; i++) if (WW.TERRAIN_LUT.water[st.terrain[i]]) w0++;
  sim.actions.strike(coast.x, coast.y, 'tsar');
  let w1 = 0; for (let i = 0; i < st.terrain.length; i++) if (WW.TERRAIN_LUT.water[st.terrain[i]]) w1++;
  log('Wasserkacheln vor/nach Großem Rumms an der Küste', w0, '→', w1);
  assert(w1 > w0, 'Großer Rumms reißt die Küste nicht auf');
  run(sim, 200, 50, (i) => checkInvariants(sim, 'Rumms ' + i));
});

test('8 Völker: Alarm, Räuber, Ausräumen, Hand', function () {
  const sim = makeSim({ seed: 'raeuber', world: testWorld(96, 64), populate: 1, races: ['human'], govs: ['fascism'], animals: false });
  const st = sim.state;
  const c = st.cities[0];
  run(sim, 2400);
  const camp = sim.actions.placeLair(c.cx + 22, c.cy + 2, 'banditcamp');
  assert(camp != null, 'Räuberlager nicht gesetzt');
  sim.actions.placeLair(c.cx - 22, c.cy + 4, 'wolfden');
  const counts = {};
  const orig = sim.event;
  sim.event = function (type) { counts[type] = (counts[type] || 0) + 1; return orig.apply(this, arguments); };
  let maxB = 0;
  run(sim, 6000, 100, (i) => { maxB = Math.max(maxB, st.units.filter(u => u.role === 'bandit').length); if (i % 500 === 0) checkInvariants(sim, 'Räuber ' + i); });
  log('Räuber max', maxB, '· Soldaten', c.jobs.soldier || 0, '· Ereignisse', JSON.stringify(counts));
  assert(maxB >= 1 && (maxB >= 2 || counts.campCleared), 'Lager erzeugt keine Räuber (und wurde nicht ausgeräumt)');
  assert((counts.alarmBandits || 0) + (counts.banditRaid || 0) + (counts.banditTheft || 0) + (counts.campCleared || 0) + (counts.alarmBeasts || 0) >= 1, 'Räuber/Wölfe lösen nichts aus');
  // Göttliche Hand
  const u = st.units.find(v => !v.dead && v.cityId === c.id);
  const n0 = st.units.length;
  assert(sim.actions.grab(u.id) === true && st.units.length === n0 - 1, 'grab');
  assert(sim.actions.grab(u.id) === false, 'doppelt greifen');
  run(sim, 20);
  assert(sim.actions.drop(NaN, 1) === null, 'drop Unsinn');
  const id = sim.actions.drop(c.cx + 8.5, c.cy + 0.5);
  assert(id === u.id && sim.query.unit(id), 'drop');
  checkInvariants(sim, 'Hand');
});

test('8b Junge Siedlungen überleben die Wildnis (10 Seeds, je 4 Gruppen, 6000 Ticks)', function () {
  // Vergleich: dieselben Seeds ohne Tierwelt (Kriege und Hunger gibt es auch ohne Wildnis)
  const res = { true: 0, false: 0 };
  const rows = [];
  for (const animals of [true, false]) for (let k = 0; k < 10; k++) {
    const sim = makeSim({ seed: 'jung-' + k, size: 'medium', populate: 0, animals: animals });
    const spots = (sim._startSpots || []).slice();
    const founded = [];
    for (const sp of spots) {
      if (founded.length >= 4) break;
      const r = sim.actions.spawnSettlers(sp.x + 0.5, sp.y + 0.5, 6, null, 'human');
      if (r && founded.indexOf(r.cityId) < 0) founded.push(r.cityId);
    }
    run(sim, 6000, 1000, (i) => checkInvariants(sim, 'Seed ' + k + ' Tick ' + i));
    const alive = founded.filter((id) => { const c = sim.query.city(id); return c && c.pop > 0; }).length;
    if (alive === founded.length && founded.length >= 3) res[animals]++;
    if (animals) rows.push('jung-' + k + ': ' + alive + '/' + founded.length + ' Siedlungen, ' + sim.state.animals.length + ' Tiere, ' + sim.state.units.length + ' Einheiten, Tode ' + JSON.stringify(sim._deaths || {}));
  }
  for (const r of rows) log(r);
  log('Seeds, in denen alle Siedlungen leben: mit Wildnis', res.true, 'von 10 · ohne Tiere', res.false, 'von 10');
  assert(res.true >= Math.min(9, res.false) - 1, 'junge Siedlungen gehen an der Wildnis unter');
});

test('8c Vom Spieler gesetzter Drache tobt sich aus, natürlicher verschont junge Städte', function () {
  const res = {};
  for (const byPlayer of [true, false]) {
    const sim = makeSim({ seed: 'drache-jung', world: testWorld(96, 64), populate: 1, races: ['human'], govs: ['tribe'], animals: false });
    const st = sim.state, c = st.cities[0];
    run(sim, 300);
    const x = c.cx + 14.5, y = c.cy + 0.5;
    let id;
    if (byPlayer) id = sim.actions.spawnAnimal(x, y, 'dragon');
    else { const a = WW.Creatures.spawn(sim, 'dragon', x, y); id = a && a.id; }
    assert(id != null, 'Drache nicht gesetzt');
    assert(!!sim.query.animal(id).byPlayer === byPlayer, 'Kennzeichen byPlayer falsch');
    let fires = 0, hp0 = 0;
    for (const s of st.structs) if (!s.dead && s.cityId === c.id) hp0 += s.hp;
    const pop0 = st.units.filter(u => !u.dead && u.cityId === c.id).length;
    run(sim, 900, 5, () => { for (let i = 0; i < st.fire.length; i++) if (st.fire[i]) { const dx = (i % st.W) - c.cx, dy = Math.floor(i / st.W) - c.cy; if (dx * dx + dy * dy < 144) fires++; } });
    let hp1 = 0; for (const s of st.structs) if (!s.dead && s.cityId === c.id) hp1 += s.hp;
    const pop1 = st.units.filter(u => !u.dead && u.cityId === c.id).length;
    res[byPlayer] = { fires, lost: Math.round(hp0 - hp1), died: pop0 - pop1 };
    checkInvariants(sim, 'Drache ' + byPlayer);
  }
  log('gesetzt:', JSON.stringify(res.true), '· natürlich:', JSON.stringify(res.false));
  assert(res.true.fires > 0, 'gesetzter Drache greift die junge Stadt nicht an');
  assert(res.false.fires === 0, 'natürlicher Drache brennt eine junge Stadt nieder');
  // Vererbung
  const sim = makeSim({ seed: 'erbe', world: testWorld(96, 64), populate: 0, animals: false });
  const sl = sim.query.animal(sim.actions.spawnAnimal(40.5, 30.5, 'slime'));
  WW.Creatures.hit(sim, sl, 9999, null);
  const kids = sim.state.animals.filter(a => !a.dead && a.kind === 'slime');
  assert(kids.length === 2 && kids.every(a => a.byPlayer), 'Schleim-Teile erben byPlayer nicht');
  assert(sim.actions.spawnBandits(40, 30, 2) === 2 && sim.state.units.filter(u => u.role === 'bandit').every(u => u.byPlayer), 'gesetzte Räuber ohne byPlayer');
  const D = WW.Sim.load(sim.serialize());
  assert(D.state.animals.filter(a => a.kind === 'slime').every(a => a.byPlayer), 'byPlayer nicht gespeichert');
});

test('9 ms/Tick-Aufschlag der Wildnis (mittlere Karte, ~800 Einheiten)', function () {
  const sim = makeSim({ seed: 'leistung', size: 'medium', populate: 8 });
  run(sim, 3000);
  let guard = 0;
  while (sim.state.units.length < 800 && guard++ < 400) {
    const c = sim.state.cities[guard % sim.state.cities.length];
    if (!c) break;
    sim.actions.spawnSettlers(c.cx + 0.5, c.cy + 0.5, 10, null, c.race);
  }
  run(sim, 200);
  // Zeit der Wildnis-Teile messen: Kreaturen-KI, Wildnis-Takt (Orte, Räuber, Alarm, Kräfte); Natur-Schleife separat
  let tCr = 0n, tWild = 0n, tEnv = 0n;
  const oc = WW.Creatures.updateAll, ow = WW.Wild.update, oe = WW.Env.update;
  WW.Creatures.updateAll = function (s) { const a = process.hrtime.bigint(); oc(s); tCr += process.hrtime.bigint() - a; };
  WW.Wild.update = function (s) { const a = process.hrtime.bigint(); ow(s); tWild += process.hrtime.bigint() - a; };
  WW.Env.update = function (s) { const a = process.hrtime.bigint(); oe(s); tEnv += process.hrtime.bigint() - a; };
  const T = 2000;
  const t0 = process.hrtime.bigint();
  try { run(sim, T); } finally { WW.Creatures.updateAll = oc; WW.Wild.update = ow; WW.Env.update = oe; }
  const all = Number(process.hrtime.bigint() - t0) / 1e6 / T;
  const cr = Number(tCr) / 1e6 / T, wi = Number(tWild) / 1e6 / T, en = Number(tEnv) / 1e6 / T - wi;
  // Natur-Schleife einzeln (ohne Feuer/Felder/Türme)
  const t1 = process.hrtime.bigint();
  for (let i = 0; i < T; i++) { sim.state.tick++; WW.Env.update(sim); }
  log('Einheiten', sim.state.units.length, '· Tiere', sim.state.animals.length, '· gesamt', all.toFixed(3), 'ms/Tick');
  log('Kreaturen', cr.toFixed(3), '· Wildnis-Takt', wi.toFixed(3), '· Umwelt inkl. Natur-Schleife', en.toFixed(3), 'ms/Tick');
  log('Aufschlag Wildnis (Kreaturen + Wildnis-Takt):', (cr + wi).toFixed(3), 'ms/Tick');
  globalThis.__wildPerf = cr + wi;
  void t1;
  assert(cr + wi < 0.4, 'Wildnis zu teuer: ' + (cr + wi).toFixed(3) + ' ms/Tick');
});

console.log('\n===== Ergebnis');
for (const r of results) console.log((r.ok ? '  ok    ' : '  FEHLER') + '  ' + r.name + '  (' + (r.ms / 1000).toFixed(1) + ' s)' + (r.ok ? '' : '  -> ' + r.err.message));
const bad = results.filter(r => !r.ok).length;
console.log(bad ? '\n' + bad + ' von ' + results.length + ' Tests fehlgeschlagen.' : '\nAlle ' + results.length + ' Tests bestanden.');
process.exitCode = bad ? 1 : 0;
