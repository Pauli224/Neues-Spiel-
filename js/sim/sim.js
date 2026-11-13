// =============================================================================
// Wuselwelt – Simulation (Teil A). DOM-frei, deterministisch (nur WW.RNG, kein Math.random/Date).
// Schnittstelle ist EINGEFROREN: ab hier nur noch Ergänzungen, keine Umbenennungen.
// =============================================================================
//
// LADEREIHENFOLGE (klassische Skripte, alle mit dem WW-Wrapper):
//   js/core/terrain.js, js/core/rng.js, js/core/config.js, js/data/names.js, js/data/texts.js,
//   js/sim/util.js, js/sim/world.js, js/sim/worldgen.js (Agent D, optional), js/sim/path.js,
//   js/sim/structs.js, js/sim/walls.js, js/sim/cities.js, js/sim/units.js, js/sim/gov.js,
//   js/sim/diplo.js, js/sim/creatures.js, js/sim/env.js, js/sim/powers.js, js/sim/sim.js
//
// ERZEUGEN
//   const sim = WW.Sim.create(opts)          opts (alle optional):
//     seed        Zahl oder Text (Standard 1)
//     world       fertige Welt { W, H, terrain, variant?, height?, startSpots?, name? } (z. B. WW.WorldGen.generate)
//     size        'small'|'medium'|'large'|'huge'  (nur ohne world; an WW.WorldGen weitergereicht)
//     width,height  feste Größe (nur ohne world)
//     worldOpts   weitere Optionen für WW.WorldGen.generate (template, land, …)
//     populate    Anzahl Startreiche 0..8 (true = 3, false = 0, Standard 3)
//     races       Liste von Volks-Schlüsseln (zyklisch) – sonst passend zum Gelände gewürfelt
//     govs        Liste von Regierungs-Schlüsseln (zyklisch) | 'mixed' (verschiedene, nach Volk gewichtet)
//                 | weglassen = alle starten als 'tribe' und wählen ab Dorfgröße selbst   [ABWEICHUNG Plan 2.1]
//     animals     false = keine Schafe/Wölfe
//     laws        { key: bool } Startwerte der Weltgesetze
//   Ohne world: WW.WorldGen.generate({ seed, size | w,h, ...worldOpts }) falls geladen, sonst WW.SimWorld.generate.
//   WW.Sim.load(string) -> sim | null (null bei kaputtem/fremdem Spielstand)
//
// LAUFEN
//   sim.tick()            ein fester Schritt; 10 Ticks = 1 s bei 1×; WW.CONFIG.TPY = 240 Ticks = 1 Jahr
//   sim.serialize()       -> JSON-Text (Felder version, game:'wuselwelt'; Raster Base64)
//   sim.hash()            -> Hash des Spielstands (Determinismus-Prüfung)            [Ergänzung]
//   sim.drainDirtyTiles() -> Int32Array Kachel-Indizes (Gelände, Bauwerk, Feuer, Marke, Stil geändert)
//   sim.drainFx()         -> Array von Effekten (siehe FX), danach leer (max. 600 gepuffert)
//
// GOTTESHANDLUNGEN (sim.actions.*; prüfen Eingaben selbst, werfen nie, Rückgabe false/null bei Unsinn)
//   paintTerrain(x, y, radius, terrainId) -> bool   radius 1 = 1 Kachel, 2 = 3×3, 3 = Ø5 (UI-Pinsel 1/3/5 -> 1/2/3)
//        Bauwerke auf unpassendem Gelände werden zerstört (Mauer nur, wenn unbegehbar); Leute auf Wasser retten sich/ertrinken
//   spawnSettlers(x, y, count, govKeyOrNull, raceKey?) -> { kingdomId, cityId } | null
//        im Gebiet einer Stadt: schließen sich ihr an; sonst neues Reich (Abstand ≥ 12 zu Städten, Suche r ≤ 5),
//        zu nah: nächste Stadt (≤ 18). govKeyOrNull = null -> 'tribe', wählt selbst; Schlüssel ≠ 'tribe' -> govLocked.
//        raceKey fehlt -> 'human'.
//   spawnAnimal(x, y, kind) -> animalId | null      kind aus WW.CREATURES ('sheep', 'wolf')
//   setGovernment(kingdomId, govKey, { lock: true }) -> bool   (lock Standard true; startet Umbau, siehe unten)
//   setGovLocked(kingdomId, bool) -> bool
//   setRelation(kingdomA, kingdomB, 'war'|'peace'|'alliance') -> bool   (Chronik: godWar/godPeace/godAlliance)
//   strike(x, y, kind) -> bool    kind aus WW.POWERS: lightning, fire, rain, meteor, plague, bless
//   setLaw(key, bool) -> bool     Schlüssel aus WW.LAW_INFO: govChanges, wars, hunger, aging, disasters (alle Standard an)
//
// ABFRAGEN (sim.query.*; null bei nichts)
//   cityAt(x,y) (Mauerinneres, Gebiet oder Bauwerk), kingdomAt(x,y), unitNear(x,y,r=1.5), animalNear(x,y,r=1.5),
//   structAt(x,y), city(id), kingdom(id), unit(id), animal(id), struct(id),
//   kingdomStats(id) -> { pop, cities, soldiers, happiness, atWar }, worldStats() -> { pop, kingdoms, cities, animals, year }
//
// ZUSTAND sim.state (reine Daten; Felder mit '_' sind Laufzeit und werden nicht gespeichert)
//   seed, W, H, tick, year, nextId (gemeinsamer ID-Zähler), worldName, laws{}, pathVersion (zählt bei Sperr-/Geländeänderung),
//   eventSeq, fireCount, markCount
//   Raster (Länge W*H, Index y*W+x): terrain Uint8 (WW.TERRAIN-ID), variant Uint8, height Uint8 (0..255),
//     owner Int32 (Stadt-ID | -1, Gebiet), structAt Int32 (Bauwerk-ID | -1), fire Uint8 (0 = kein Feuer, sonst Restdauer),
//     inRing Int32 (Stadt-ID, deren Mauer-Innenfläche die Kachel ist | -1), mark Uint8 (1..99 verkohlt, 100..199 Krater; zählt herunter)
//   structs[]: { id, type, x, y, w, h (aus WW.STRUCT_INFO), cityId (-1 = niemand), level, hp, maxHp, built, progress 0..1,
//     style (Regierungsschlüssel des Aussehens), restyle (Ziel-Regierung eines laufenden Umbaus | null),
//     mask (Mauer/Tor/Turm: Nachbarn Bit0 N, Bit1 O, Bit2 S, Bit3 W), mat (Mauer/Tor/Turm: 'palisade'|'stone'|'fortress'|'barricade'),
//     orient (Tor: 'h' Mauer waagerecht | 'v'), growth 0..3 + gprog (Feld), upgradeTo (Ausbau auf Stufe | 0), paid, workers,
//     ruinOf (Ruine: Typ des Vorgängers), age (Ruine), towerSpot, skipUntil, siegeT/siegeN, siteYear }
//     Baustelle = !built; Ausbau = built && upgradeTo; Umbau = built && restyle (Gerüst zeigen). Gebäude sind begehbar,
//     nur fertige wall/tower sperren, fertige gate sperren Feinde. Ruinen sind 1×1 (große Gebäude hinterlassen mehrere).
//     [ABWEICHUNG] center hat kein Feld gov mehr: Aussehen über style (gilt für alle Bauwerke).
//   units[]: { id, x, y (Kachelkoord., Fließkomma; Kachel = floor), dir (-1 links | 1 rechts), role, race, kingdomId, cityId,
//     age (Jahre), life, hp, maxHp, moving, carrying ('food'|'wood'|'stone'|null), carryAmt, female, name,
//     bubble { icon, ttl } | null, sick, merc (Söldner), order ({ kind:'march', city, k } | { kind:'home' } | null),
//     foe, breach, group, site, Pfad-/KI-Felder path, pi, goal, task, phase, tt, target, fails, cd, wait, wtry }
//   animals[]: { id, kind, x, y, dir, hp, maxHp, moving, tx, wait, foe, cd, age }
//   cities[]: { id, name, kingdomId, race, cx, cy (MITTLERE Kachel des 3×3-Zentrums; Zentrum liegt bei cx-1, cy-1),
//     centerId, centerOk, tier (Index in WW.CITY_TIERS), pop, adults, children, housing, stock { food, wood, stone, gold }
//     (Kommunismus: Kopie des Reichslagers), happiness 0..100, jobs { role: n }, houses, builtHouses, markets,
//     hasBarracks, hasMarket, hasMonument, hungry, revolt, sick, noSpace, founded, occupiedUntil, prevKingdomId, agitated,
//     wall { level 0..3 (fertige Stufe), target, total, built, style ('none'|'palisade'|'stone'|'fortress'|'barricade'),
//            state 'none'|'building'|'done'|'upgrading'|'expanding', plan [Kachel-Indizes des Rings inkl. natürlicher Barrieren],
//            gates [Indizes], towers [Indizes], gaps [Barrikaden-Lücken], old [abzutragender alter Ring], expansions,
//            plannedYear, inside (Anzahl Innenkacheln), maxed }, sites[], fields[], drops[] (IDs), … }
//   kingdoms[]: { id, name, baseName, race, colorIndex 0..11, bannerPattern 0..7, gov, govLocked, leaderId, leaderName,
//     leaderTitle, leaderTrait ('pious'|'greedy'|'bossy'|'gentle'|'dreamy'|'stern'), cityIds[], capitalId,
//     relations { [id]: { opinion -100..100, status 'peace'|'war'|'alliance', since, weariness, losses, wars } },
//     policy { bonus ('bread'|'walls'|'nap'|'trade'|'safety'|null), party, until, plan { focus, goal, until } | null, unrest },
//     deity (Theokratie), stock (nur Kommunismus: gemeinsames Lager), nextElection, nextPlan, govSince, founded }
//   events[] (letzte 400): { id (= eventSeq), year, tick, type, text (deutsch), kingdomId, cityId, x, y (-1 = ohne Ort) }
//
// EREIGNISTYPEN (WW.Texts.EVENTS hat je Typ mehrere Varianten)
//   Städte: found, joinCity, firstHouse, tier, famine, settlersLeave, daughter, cityAbandoned, monument, shrine, barracks,
//     market, repurpose
//   Mauern: wallPlan, barricadePlan, wallDone, barricadeDone, wallStone, wallStoneDone, wallFortress, wallFortressDone,
//     wallExpand, wallExpandDone, wallBreach
//   Regierung: gov, govSet (Spieler), govChoice (selbst gewählt, mit Begründung), evolve, revolution, regimeFall, coup,
//     strongman, reform, collapse, plenumVote, succession, leaderDeath, throneFeud, election, shamElection, fiveYearPlan,
//     planResult, miracleHarvest, miracleHeal, sermon, plenum, royalDecree, council, tribeCouncil, propaganda, paranoia
//   Diplomatie/Krieg: war, holyWar, godWar, peace, godPeace, buyPeace, alliance, godAlliance, allianceEnd, allyJoins,
//     royalWedding, mobilize, armyMarch, raid, conquest, occupation, conversion, liberation, uprisingLiberation, fallen,
//     kingdomGone, mercs, revolt, resistance, revoltCrushed, revoltCalm, revoltFizzle, secede, agitation
//   Kräfte: randomLightning, randomPlague, godLightning, godFire, godRain, godMeteor, godPlague, godBless
//
// FX (sim.drainFx): { type, x, y, … }  – Koordinaten in Kacheln (Fließkomma)
//   arrow {x2,y2}, bolt, meteor, rain {r}, plague {r}, sparkle {r?}, smoke, dust (Bau fertig), hit (Treffer an Bauwerk),
//   spark (Blitz trifft Bauwerk), poof (Tod), splash (ertrunken), govchange {gov}, restyle {gov} (Umbau eines Bauwerks fertig)
//
// REGIERUNGEN (Daten in WW.GOVERNMENTS[key]): Werte wie wallThreshold, wallMax, soldierShare …, dazu
//   war ('raid'|'knights'|'defend'|'mass'|'agitate'|'holy'|'mercs'|'militia'), build { barracks|market|monument:
//   { first, per, max }, towerSpacing }, looks { center, wall, house, monument } (Text für UI). WW.govBuildCount(gov, type, pop).
//   Regierungswechsel = Umbau: Zentrum sofort restyle (Baumeister-Vorrang), danach Mauern/Häuser/Denkmal; unbekannte
//   Gebäude werden zu Häusern umgewidmet (Markt/Kaserne), Türme ohne Turmrecht zu Mauern. Mauern bleiben dabei dicht.
// VÖLKER: WW.RACES[key] (speed, hp, strength, lifespan, fertility, yields, wallMul, housingBonus, favTerrain, govPrefs, …)
// KREATUREN: WW.CREATURES[kind] + Verhalten WW.CreatureAI[ai]; KRÄFTE: WW.POWERS[kind].apply(sim, x, y)
// =============================================================================
(function (WW) { 'use strict';

  const VERSION = 2;
  const U = () => WW.SimUtil;

  // ---------------------------------------------------------------------------
  // Hilfen
  // ---------------------------------------------------------------------------
  function mix(a, b) {
    let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return (h ^ (h >>> 15)) >>> 0;
  }
  // Kleiner Würfel aus einem Hash: Chronik-Varianten verbrauchen keinen Sim-Zufall
  function picker(seed) {
    let s = seed >>> 0;
    return { int: function (n) { s = mix(s, 0x51ed270b); return n > 0 ? s % n : 0; } };
  }
  function strHash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h;
  }

  // Höhe 0..255 aus dem Gelände (für gemalte Kacheln)
  function heightFor(t) {
    const sea = (WW.WorldGen && WW.WorldGen.SEA_LEVEL) || 100;
    const rank = WW.TERRAIN_LUT.rank[t];
    if (rank <= 0) return Math.max(0, sea - 50);
    if (rank === 1) return sea - 20;
    if (rank === 2) return sea - 3;
    if (rank === 3) return sea + 2;
    if (rank === 4) return sea + 30;
    if (rank === 5) return sea + 80;
    if (rank === 6) return Math.min(255, sea + 120);
    return 250;
  }

  // ---------------------------------------------------------------------------
  // Laufzeit (nicht gespeichert, aus dem Zustand ableitbar)
  // ---------------------------------------------------------------------------
  function Sim(state, rngState) {
    this.state = state;
    this.rng = rngState ? WW.RNG.fromState(rngState) : WW.RNG.create(state.seed);
    const N = state.W * state.H;
    this._units = new Map(); this._animals = new Map(); this._structs = new Map();
    this._cities = new Map(); this._kingdoms = new Map();
    for (const u of state.units) this._units.set(u.id, u);
    for (const a of state.animals) this._animals.set(a.id, a);
    for (const s of state.structs) this._structs.set(s.id, s);
    for (const c of state.cities) this._cities.set(c.id, c);
    for (const k of state.kingdoms) this._kingdoms.set(k.id, k);
    this._usedNames = new Set(state.usedNames || []);
    delete state.usedNames;
    this.block = new Uint8Array(N);
    this._dirtyFlag = new Uint8Array(N);
    this._dirty = [];
    this._allDirty = false;
    this._fx = [];
    this._pathBudget = WW.CONFIG.PATH_BUDGET;
    this._animalCount = {};
    this._seedHash = WW.RNG.hashSeed(state.seed);
    WW.Path.init(this);
    WW.Structs.rebuildBlock(this);
    this._unitsDirty = this._animalsDirty = this._structsDirty = false;
    const sim = this;
    this.actions = makeActions(sim);
    this.query = makeQuery(sim);
  }

  Sim.prototype.markDirty = function (i) {
    if (this._dirtyFlag[i]) return;
    this._dirtyFlag[i] = 1;
    if (this._dirty.length < this.state.W * this.state.H) this._dirty.push(i); else this._allDirty = true;
  };
  Sim.prototype.drainDirtyTiles = function () {
    const out = Int32Array.from(this._dirty);
    for (let k = 0; k < this._dirty.length; k++) this._dirtyFlag[this._dirty[k]] = 0;
    this._dirty.length = 0;
    this._allDirty = false;
    return out;
  };
  Sim.prototype.fx = function (f) {
    if (this._fx.length < 600) this._fx.push(f);
  };
  Sim.prototype.drainFx = function () { const f = this._fx; this._fx = []; return f; };
  Sim.prototype.terrainChanged = function () { this._compDirty = true; this.state.pathVersion++; };
  Sim.prototype._hashNoise = function (i) { return mix(i, this._seedHash) / 4294967296; };

  // Chronik-Eintrag. at = { kingdomId, cityId, x, y }
  Sim.prototype.event = function (type, vars, at) {
    const st = this.state;
    st.eventSeq++;
    const p = picker(mix(this._seedHash ^ strHash(type), st.eventSeq));
    let text = '';
    try { text = WW.Texts ? WW.Texts.format(type, vars || {}, p) : type; } catch (e) { text = type; }
    at = at || {};
    const ev = {
      id: st.eventSeq, year: st.year, tick: st.tick, type: type, text: text,
      kingdomId: at.kingdomId == null ? -1 : at.kingdomId, cityId: at.cityId == null ? -1 : at.cityId,
      x: U().isNum(at.x) ? at.x : -1, y: U().isNum(at.y) ? at.y : -1
    };
    st.events.push(ev);
    if (st.events.length > WW.CONFIG.MAX_EVENTS) st.events.splice(0, st.events.length - WW.CONFIG.MAX_EVENTS);
    return ev;
  };

  function compact(sim) {
    const st = sim.state;
    if (sim._unitsDirty) {
      st.units = st.units.filter(u => { if (u.dead) { sim._units.delete(u.id); return false; } return true; });
      sim._unitsDirty = false;
    }
    if (sim._animalsDirty) {
      st.animals = st.animals.filter(a => { if (a.dead) { sim._animals.delete(a.id); return false; } return true; });
      sim._animalsDirty = false;
    }
    if (sim._structsDirty) {
      st.structs = st.structs.filter(s => !s.dead);
      sim._structsDirty = false;
    }
  }

  // Ein fester Schritt
  Sim.prototype.tick = function () {
    const st = this.state;
    const TPY = WW.CONFIG.TPY;
    st.tick++;
    this._pathBudget = WW.CONFIG.PATH_BUDGET;
    compact(this);
    WW.Cities.stats(this);
    WW.Units.buildBuckets(this);
    WW.Units.updateAll(this);
    WW.Creatures.updateAll(this);
    WW.Env.update(this);
    if (st.tick % 10 === 0) WW.Cities.updateAll(this);
    if (st.tick % 20 === 5) WW.Gov.update(this);
    if (st.tick % 40 === 15) WW.Diplo.update(this);
    if (st.tick % 30 === 20) WW.Growth.update(this);
    if (st.tick % 40 === 25) WW.Growth.updatePlots(this);
    if (st.tick % TPY === 0) {
      st.year++;
      WW.Units.yearly(this);
      WW.Creatures.yearly(this);
      WW.Cities.stats(this);
      WW.Cities.yearly(this);
      WW.Gov.yearly(this);
      WW.Diplo.yearly(this);
      WW.Growth.yearly(this);
      WW.Env.yearly(this);
    }
    compact(this);
  };

  // ---------------------------------------------------------------------------
  // Speichern / Laden
  // ---------------------------------------------------------------------------
  const RASTERS = [['terrain', Uint8Array], ['variant', Uint8Array], ['height', Uint8Array], ['owner', Int32Array],
    ['structAt', Int32Array], ['fire', Uint8Array], ['inRing', Int32Array], ['mark', Uint8Array]];

  function replacer(key, value) {
    if (key && key.charCodeAt(0) === 95) return undefined;   // '_' = Laufzeit
    return value;
  }
  Sim.prototype.serialize = function () {
    const st = this.state;
    const o = {};
    for (const k in st) {
      if (k.charCodeAt(0) === 95 || k === 'version' || k === 'game' || k === 'rng' || k === 'usedNames' || k === 'flur') continue;
      let isR = false;
      for (const r of RASTERS) if (r[0] === k) isR = true;
      if (isR) continue;
      o[k] = st[k];
    }
    o.units = st.units.filter(u => !u.dead);
    o.animals = st.animals.filter(a => !a.dead);
    o.structs = st.structs.filter(s => !s.dead);
    o.usedNames = Array.from(this._usedNames);
    o.rng = this.rng.getState();
    o.version = VERSION;
    o.game = 'wuselwelt';
    o.rasters = {};
    for (const r of RASTERS) o.rasters[r[0]] = U().encodeArray(st[r[0]]);
    if (st.flur) o.rasters.flur = U().encodeArray(st.flur);
    return JSON.stringify(o, replacer);
  };
  Sim.prototype.hash = function () { return U().hashString(this.serialize()); };

  function load(str) {
    let o;
    try { o = typeof str === 'string' ? JSON.parse(str) : str; } catch (e) { return null; }
    if (!o || o.game !== 'wuselwelt' || !o.rasters || !(o.W > 0) || !(o.H > 0)) return null;
    if ((o.version | 0) > VERSION) return null;
    const N = o.W * o.H;
    const st = {};
    for (const k in o) if (k !== 'rasters' && k !== 'rng' && k !== 'game' && k !== 'version') st[k] = o[k];
    for (const r of RASTERS) st[r[0]] = U().decodeArray(o.rasters[r[0]] || '', r[1], N);
    if (o.rasters.flur) st.flur = U().decodeArray(o.rasters.flur, Int32Array, Math.ceil(o.W / 6) * Math.ceil(o.H / 6));
    if (!o.rasters.owner) st.owner.fill(-1);
    if (!o.rasters.structAt) st.structAt.fill(-1);
    if (!o.rasters.inRing) st.inRing.fill(-1);
    defaults(st);
    const sim = new Sim(st, o.rng);
    WW.Growth.ensure(sim);
    return sim;
  }

  // fehlende Felder (ältere Spielstände) ergänzen
  function defaults(st) {
    st.units = st.units || []; st.animals = st.animals || []; st.structs = st.structs || [];
    st.cities = st.cities || []; st.kingdoms = st.kingdoms || []; st.events = st.events || [];
    st.laws = Object.assign({}, WW.LAW_DEFAULTS, st.laws || {});
    st.tick = st.tick | 0; st.year = st.year | 0; st.nextId = st.nextId || 1;
    st.pathVersion = st.pathVersion | 0; st.fireCount = st.fireCount | 0; st.markCount = st.markCount | 0;
    st.eventSeq = st.eventSeq | 0;
    st.plots = st.plots || [];
    st.worldName = st.worldName || 'Wuselwelt';
  }

  // ---------------------------------------------------------------------------
  // Erzeugen
  // ---------------------------------------------------------------------------
  function makeWorld(opts) {
    if (opts.world && opts.world.terrain && opts.world.W > 0 && opts.world.H > 0) return opts.world;
    const wopts = Object.assign({}, opts.worldOpts || {}, { seed: opts.seed });
    if (opts.width > 0 && opts.height > 0) { wopts.w = opts.width | 0; wopts.h = opts.height | 0; }
    else if (opts.size) wopts.size = opts.size;
    if (WW.WorldGen && typeof WW.WorldGen.generate === 'function') {
      try { return WW.WorldGen.generate(wopts); } catch (e) { /* Rückfall unten */ }
    }
    return WW.SimWorld.generate({ seed: opts.seed, width: wopts.w || 144, height: wopts.h || 96 });
  }

  function create(opts) {
    opts = opts || {};
    const seed = opts.seed == null ? 1 : opts.seed;
    const world = makeWorld(Object.assign({}, opts, { seed: seed }));
    const W = world.W, H = world.H, N = W * H;
    const st = {
      seed: seed, W: W, H: H, tick: 0, year: 0, nextId: 1, worldName: world.name || 'Wuselwelt',
      terrain: new Uint8Array(N), variant: new Uint8Array(N), height: new Uint8Array(N),
      owner: new Int32Array(N).fill(-1), structAt: new Int32Array(N).fill(-1), fire: new Uint8Array(N),
      inRing: new Int32Array(N).fill(-1), mark: new Uint8Array(N),
      structs: [], units: [], animals: [], cities: [], kingdoms: [], events: [],
      laws: Object.assign({}, WW.LAW_DEFAULTS, opts.laws || {}),
      pathVersion: 0, fireCount: 0, markCount: 0, eventSeq: 0, plots: []
    };
    const nT = WW.TERRAIN.length;
    for (let i = 0; i < N; i++) {
      const t = world.terrain[i];
      st.terrain[i] = t < nT ? t : WW.T.GRASS;
      st.variant[i] = world.variant ? world.variant[i] : (mix(i, 7) & 255);
      st.height[i] = world.height ? world.height[i] : heightFor(st.terrain[i]);
    }
    for (const k in st.laws) if (!(k in WW.LAW_DEFAULTS)) delete st.laws[k];
    const sim = new Sim(st, null);
    WW.Growth.ensure(sim);
    sim._startSpots = (world.startSpots || []).slice();

    // Startreiche
    let n = (opts.populate === true || opts.populate == null) ? 3 : (opts.populate === false ? 0 : (opts.populate | 0));
    n = Math.max(0, Math.min(8, n));
    if (n > 0) populate(sim, n, opts);
    if (opts.animals !== false) {
      const area = W * H;
      WW.Creatures.populate(sim, Math.round(area / 260), Math.round(area / 2600));
    }
    // ein Schritt Statistik, damit Abfragen sofort stimmen
    WW.Cities.stats(sim);
    WW.Cities.refreshAllLists(sim);
    return sim;
  }

  // Startplätze: Weltgenerator-Plätze, Mindestabstand, sonst eigene Suche
  function pickStarts(sim, n) {
    const st = sim.state;
    const cand = sim._startSpots.slice();
    for (const c of WW.SimWorld.findStartSpots(st.terrain, st.W, st.H, 16)) cand.push(c);
    const out = [];
    const md = WW.CONFIG.CITY_MIN_DIST + 4;
    for (const pass of [md, WW.CONFIG.CITY_MIN_DIST, 14]) {
      for (const c of cand) {
        if (out.length >= n) break;
        let ok = true;
        for (const o of out) { const dx = o.x - c.x, dy = o.y - c.y; if (dx * dx + dy * dy < pass * pass) { ok = false; break; } }
        if (!ok) continue;
        // Platz suchen, an dem das Zentrum wirklich passt
        let spot = null;
        for (let r = 0; r <= 4 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (WW.Cities.canFoundAt(sim, c.x + dx, c.y + dy, 'human', 0)) spot = { x: c.x + dx, y: c.y + dy };
        }
        if (!spot) continue;
        for (const o of out) { const dx = o.x - spot.x, dy = o.y - spot.y; if (dx * dx + dy * dy < pass * pass) { ok = false; break; } }
        if (ok) out.push(spot);
      }
      if (out.length >= n) break;
    }
    return out;
  }

  function populate(sim, n, opts) {
    const spots = pickStarts(sim, n);
    const races = Array.isArray(opts.races) ? opts.races : null;
    const govs = Array.isArray(opts.govs) ? opts.govs : null;
    const usedGov = {};
    for (let i = 0; i < spots.length; i++) {
      let race = races && WW.RACES[races[i % races.length]] ? races[i % races.length] : null;
      if (!race) {
        // Volk passend zum Gelände
        const t = WW.TERRAIN[sim.state.terrain[spots[i].y * sim.state.W + spots[i].x]].key;
        const w = {};
        for (const rk of WW.RACE_KEYS) w[rk] = (rk === 'human' ? 2.2 : 1) + (WW.RACES[rk].favTerrain.indexOf(t) >= 0 ? 2 : 0);
        race = sim.rng.weighted(w);
      }
      let gov = govs && WW.GOVERNMENTS[govs[i % govs.length]] ? govs[i % govs.length] : null;
      if (!gov && opts.govs === 'mixed') {
        // verschiedene Regierungen, nach Volks-Vorlieben gewichtet
        const pref = Object.assign({}, WW.RACES[race].govPrefs);
        for (const g in usedGov) if (Object.keys(usedGov).length < 8) pref[g] = 0;
        gov = sim.rng.weighted(pref);
      }
      if (!gov) gov = 'tribe';   // Standard: Stamm, wählt ab Dorfgröße selbst
      usedGov[gov] = 1;
      foundKingdom(sim, spots[i].x, spots[i].y, 6, gov, race, false);
    }
  }

  // Neues Reich mit Stadt und Siedlern
  function foundKingdom(sim, x, y, count, gov, race, locked) {
    const st = sim.state;
    const name = WW.Names.town(sim.rng, race, sim._usedNames);
    const k = WW.Gov.createKingdom(sim, { race: race, gov: gov, baseName: name, locked: locked });
    const city = WW.Cities.found(sim, x, y, k.id, race, name);
    if (!city) { WW.Gov.removeKingdom(sim, k, true); return null; }
    const ss = WW.CONFIG.START_STOCK;
    city.stock = { food: ss.food, wood: ss.wood, stone: ss.stone, gold: ss.gold };
    if (WW.GOVERNMENTS[k.gov].sharedStock) k.stock = { food: ss.food, wood: ss.wood, stone: ss.stone, gold: 0 };
    spawnPeople(sim, city, x + 0.5, y + 0.5, count, race);
    WW.Cities.stats(sim);
    WW.Gov.appointLeader(sim, k);
    sim.event('found', { city: city.name, kingdom: k.name, n: count, gov: WW.GOVERNMENTS[k.gov].name }, WW.Cities.atCity(city));
    return { kingdomId: k.id, cityId: city.id };
  }

  function spawnPeople(sim, city, x, y, count, race) {
    const st = sim.state, W = st.W;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const fx = Math.floor(x + sim.rng.range(-1.5, 1.5)), fy = Math.floor(y + sim.rng.range(-1.5, 1.5));
      let t = fy * W + fx;
      if (fx < 0 || fy < 0 || fx >= W || fy >= st.H || !WW.Path.passable(sim, t, city.kingdomId)) t = WW.Path.nearestFree(sim, WW.Cities.centerTile(sim, city, i), city.kingdomId, 6);
      if (t < 0) continue;
      const u = WW.Units.create(sim, {
        x: (t % W) + 0.5, y: Math.floor(t / W) + 0.5, role: 'farmer', kingdomId: city.kingdomId, cityId: city.id,
        race: race || city.race, age: WW.CONFIG.ADULT_AGE + 4 + sim.rng.int(16)
      });
      if (u) n++;
    }
    return n;
  }

  // ---------------------------------------------------------------------------
  // Gotteshandlungen
  // ---------------------------------------------------------------------------
  function makeActions(sim) {
    const isNum = (v) => U().isNum(v);
    const inMap = (x, y) => isNum(x) && isNum(y) && x >= 0 && y >= 0 && x < sim.state.W && y < sim.state.H;
    function safe(fn) {
      return function () {
        try { return fn.apply(null, arguments); } catch (e) {
          if (sim._throwErrors) throw e;
          sim._lastError = e;
          return null;
        }
      };
    }

    function paintTerrain(x, y, radius, terrainId) {
      if (!inMap(x, y)) return false;
      terrainId = terrainId | 0;
      if (!(terrainId >= 0 && terrainId < WW.TERRAIN.length)) return false;
      const st = sim.state, W = st.W, H = st.H;
      let r = isNum(radius) ? Math.max(1, Math.min(12, Math.floor(radius))) : 1;
      const cx = Math.floor(x), cy = Math.floor(y);
      const lim = (r - 1) * (r - 1) + (r - 1);
      const LUT = WW.TERRAIN_LUT;
      let changed = 0;
      for (let dy = -r + 1; dy <= r - 1; dy++) for (let dx = -r + 1; dx <= r - 1; dx++) {
        if (dx * dx + dy * dy > lim) continue;
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = yy * W + xx;
        if (st.terrain[i] === terrainId) continue;
        st.terrain[i] = terrainId;
        st.height[i] = heightFor(terrainId);
        changed++;
        sim.markDirty(i);
        if (LUT.water[terrainId]) WW.Env.extinguish(sim, i);
        const s = sim._structs.get(st.structAt[i]);
        if (s) {
          const c = sim._cities.get(s.cityId);
          const race = c ? c.race : 'human';
          if (WW.Structs.isWallish(s)) { if (LUT.walk[terrainId] <= 0) WW.Structs.remove(sim, s); }
          else if (s.type === 'field') { if (LUT.fertile[terrainId] <= 0 || !WW.Structs.terrainBuildable(sim, i, race)) WW.Structs.remove(sim, s); }
          else if (s.type === 'ruin') { if (LUT.walk[terrainId] <= 0) WW.Structs.remove(sim, s); }
          else if (!WW.Structs.terrainBuildable(sim, i, race)) {
            if (s.type === 'center') WW.Structs.remove(sim, s); else WW.Structs.destroy(sim, s);
          }
        }
        if (st.mark[i] && LUT.water[terrainId]) WW.Env.setMark(sim, i, 0);
      }
      if (changed) { sim.terrainChanged(); WW.Cities.refreshAllLists(sim); }
      return changed > 0;
    }

    function spawnSettlers(x, y, count, govKey, raceKey) {
      if (!inMap(x, y)) return null;
      const st = sim.state, W = st.W;
      count = isNum(count) ? Math.max(1, Math.min(30, Math.floor(count))) : 6;
      const gov = WW.GOVERNMENTS[govKey] ? govKey : null;
      const race = WW.RACES[raceKey] ? raceKey : 'human';
      const tx = Math.floor(x), ty = Math.floor(y), i = ty * W + tx;
      // in bestehendem Gebiet: der Stadt anschließen
      let city = sim._cities.get(st.inRing[i]) || sim._cities.get(st.owner[i]);
      if (!city) {
        const md = WW.CONFIG.PLAYER_CITY_MIN_DIST;
        let spot = null;
        for (let r = 0; r <= 5 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (WW.Cities.canFoundAt(sim, tx + dx, ty + dy, race, md)) spot = { x: tx + dx, y: ty + dy };
        }
        if (spot) {
          if (sim._compDirty) WW.Path.updateComponents(sim);
          const res = foundKingdom(sim, spot.x, spot.y, count, gov, race, !!(gov && gov !== 'tribe'));
          if (res) WW.Cities.refreshAllLists(sim);
          return res;
        }
        // zu nah an einer Stadt: dort anschließen
        let bd = 18 * 18;
        for (const c of st.cities) { const d = (c.cx - tx) * (c.cx - tx) + (c.cy - ty) * (c.cy - ty); if (d < bd) { bd = d; city = c; } }
        if (!city) return null;
      }
      if (WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0) { x = city.cx + 0.5; y = city.cy + 0.5; }
      const n = spawnPeople(sim, city, x, y, count, race);
      if (!n) return null;
      sim.event('joinCity', { city: city.name, n: n }, WW.Cities.atCity(city));
      return { kingdomId: city.kingdomId, cityId: city.id };
    }

    function spawnAnimal(x, y, kind) {
      if (!inMap(x, y) || !WW.CREATURES[kind]) return null;
      const a = WW.Creatures.spawn(sim, kind, x, y);
      return a ? a.id : null;
    }

    function setGovernment(kingdomId, govKey, o) {
      const k = sim._kingdoms.get(kingdomId);
      if (!k || !WW.GOVERNMENTS[govKey]) return false;
      const lock = !(o && o.lock === false);
      if (k.gov === govKey) { k.govLocked = lock; return true; }
      return WW.Gov.applyGov(sim, k, govKey, { lock: lock, reason: 'govSet' });
    }

    function setGovLocked(kingdomId, v) {
      const k = sim._kingdoms.get(kingdomId);
      if (!k) return false;
      k.govLocked = !!v;
      return true;
    }

    function setRelation(a, b, status) {
      const ka = sim._kingdoms.get(a), kb = sim._kingdoms.get(b);
      if (!ka || !kb || ka === kb) return false;
      if (status !== 'war' && status !== 'peace' && status !== 'alliance') return false;
      const r = ka.relations[kb.id];
      if (!r) return false;
      if (r.status === status) return true;
      if (status === 'war') return WW.Diplo.declareWar(sim, ka, kb, 'godWar');
      if (status === 'peace') return WW.Diplo.makePeace(sim, ka, kb, 'godPeace');
      return WW.Diplo.makeAlliance(sim, ka, kb, 'godAlliance');
    }

    function strike(x, y, kind) {
      if (!inMap(x, y)) return false;
      return WW.Powers.strike(sim, x, y, kind, false);
    }

    function setLaw(key, value) {
      if (!(key in WW.LAW_DEFAULTS)) return false;
      sim.state.laws[key] = !!value;
      return true;
    }

    return {
      paintTerrain: safe(paintTerrain), spawnSettlers: safe(spawnSettlers), spawnAnimal: safe(spawnAnimal),
      setGovernment: safe(setGovernment), setGovLocked: safe(setGovLocked), setRelation: safe(setRelation),
      strike: safe(strike), setLaw: safe(setLaw)
    };
  }

  // ---------------------------------------------------------------------------
  // Abfragen
  // ---------------------------------------------------------------------------
  function makeQuery(sim) {
    const tile = (x, y) => {
      const st = sim.state;
      if (!U().isNum(x) || !U().isNum(y)) return -1;
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= st.W || y >= st.H) return -1;
      return y * st.W + x;
    };
    function cityAt(x, y) {
      const i = tile(x, y);
      if (i < 0) return null;
      const st = sim.state;
      return sim._cities.get(st.inRing[i]) || sim._cities.get(st.owner[i]) ||
        (function () { const s = sim._structs.get(st.structAt[i]); return s ? sim._cities.get(s.cityId) || null : null; })();
    }
    function kingdomAt(x, y) { const c = cityAt(x, y); return c ? sim._kingdoms.get(c.kingdomId) || null : null; }
    function unitNear(x, y, r) {
      if (!U().isNum(x) || !U().isNum(y)) return null;
      r = U().isNum(r) ? r : 1.5;
      let best = null, bd = r * r;
      for (const u of sim.state.units) {
        if (u.dead) continue;
        const dx = u.x - x, dy = u.y - y, d = dx * dx + dy * dy;
        if (d <= bd) { bd = d; best = u; }
      }
      return best;
    }
    function animalNear(x, y, r) {
      if (!U().isNum(x) || !U().isNum(y)) return null;
      r = U().isNum(r) ? r : 1.5;
      let best = null, bd = r * r;
      for (const a of sim.state.animals) {
        if (a.dead) continue;
        const dx = a.x - x, dy = a.y - y, d = dx * dx + dy * dy;
        if (d <= bd) { bd = d; best = a; }
      }
      return best;
    }
    function structAt(x, y) { const i = tile(x, y); return i < 0 ? null : sim._structs.get(sim.state.structAt[i]) || null; }
    function kingdomStats(id) {
      const k = sim._kingdoms.get(id);
      if (!k) return null;
      let pop = 0, soldiers = 0, happy = 0;
      for (const cid of k.cityIds) { const c = sim._cities.get(cid); if (c) { pop += c.pop; soldiers += (c.jobs.soldier || 0); happy += c.happiness * c.pop; } }
      return { pop: pop, cities: k.cityIds.length, soldiers: soldiers, happiness: pop ? happy / pop : 0, atWar: WW.Diplo.atWar(sim, id) };
    }
    function worldStats() {
      const st = sim.state;
      let pop = 0;
      for (const u of st.units) if (!u.dead) pop++;
      return { pop: pop, kingdoms: st.kingdoms.length, cities: st.cities.length, animals: st.animals.length, year: st.year };
    }
    return {
      cityAt: cityAt, kingdomAt: kingdomAt, unitNear: unitNear, animalNear: animalNear, structAt: structAt,
      city: (id) => sim._cities.get(id) || null, kingdom: (id) => sim._kingdoms.get(id) || null,
      unit: (id) => sim._units.get(id) || null, animal: (id) => sim._animals.get(id) || null,
      struct: (id) => sim._structs.get(id) || null, kingdomStats: kingdomStats, worldStats: worldStats
    };
  }

  WW.Sim = { create: create, load: load, VERSION: VERSION, heightFor: heightFor };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
