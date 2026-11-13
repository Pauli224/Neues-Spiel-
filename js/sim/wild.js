// =============================================================================
// Wuselwelt – Wildnis (Stufe 3): Orte in der Wildnis, Räuber, Alarm und Ausrücken der Städte, Besiedlung der
// Welt mit Tieren, Gelände-Helfer für Kräfte (Höhe -> Gelände), Göttliche Hand. DOM-frei, deterministisch.
// Lädt nach js/sim/creatures.js. Daten: js/core/config-wild.js (WW.WILD), Texte: js/data/texts-wild.js.
// =============================================================================
//
// ERGÄNZUNGEN DER SCHNITTSTELLE (nur Ergänzungen; alles Übrige wie im Kopf von js/sim/sim.js)
//
// LADEREIHENFOLGE: js/core/config-wild.js direkt nach js/core/config.js, js/data/texts-wild.js direkt nach
//   js/data/texts.js, js/sim/wild.js direkt nach js/sim/creatures.js.
//
// ERZEUGEN: opts.animals !== false besiedelt die Welt: Tiere passend zum Biom (Herden, Rudel, Fische, Krabben),
//   Orte in der Wildnis (fern der Startplätze), wenige Biom-Monster (Yeti, Sandwurm, Baumhirte, Golem, Schleim).
//   animals: false = nichts davon.
//
// ZUSTAND (sim.state, alles gespeichert)
//   Raster (Uint8, Länge W*H): flora (0 nichts | 1 Beerenstrauch reif | 2 Beerenstrauch abgeerntet | 3 Asche wächst
//     zu Wiese | 5 frische Lava, kühlt ab), graze (Wiese: 0 frisch … 255 kahl, ab 128 sichtbar abgeweidet; bei flora
//     3/5 Fortschritt), fallout (0..255, Atom-Fallout, klingt ab; > 0: nichts wächst, Leute werden krank),
//     crack (0..255 Erdbebenriss, verblasst)
//   wild { effects[], held, lastEv{}, seq, off (true = mit animals: false erzeugt, keine Einwanderung) }
//     effects[]: laufende Kräfte { id, type, x, y, t (Rest-Ticks), r, … } – type: 'tornado' {vx,vy}, 'acidrain',
//       'flood' {level}, 'frost', 'volcano' {heads}, 'blackhole', 'cluster' {pts} (Darstellung liest x, y, r, type)
//     held: { what: 'unit'|'animal', data: { … } } | null – von der Göttlichen Hand gehalten (nicht in units/animals)
//   scars[]: { x, y (Kachel, Mitte), kind: 'crater_m' (3×3) | 'crater_l' (5×5) | 'crack', ttl (Rest-Ticks) } – große
//     Narben für die Darstellung (t_crater_m, t_crater_l), verblassen; höchstens 200. Kleine Krater/Brandspuren bleiben
//     im Raster mark (100..199 Krater, 1..99 verkohlt), Risse je Kachel im Raster crack. Fallout: Raster fallout > 0
//     -> Überlagerung t_fallout.
//   aircraft[]: { id, kind: 'gunship'|'bomber'|'rocket', x, y, angle (Bogenmaß, 0 = nach rechts), tx, ty, ttl, … }
//     Flugzeuge/Raketen; x/y dürfen knapp außerhalb der Karte liegen (Ein-/Ausflug). Sprite a_<kind>_0/1.
//   structs: Typ 'lair' (1×1, begehbar, cityId -1) mit kind ∈ WW.LAIR_KEYS (wolfden, bearcave, dragonhoard,
//     banditcamp, treasure, ore, goldvein), loot { food, gold }, spawnT, raidT, amount (Adern), found. Sprite s_lair_<kind>.
//   Mauerstücke ohne Stadt (Kraft 'wallbrush'): type 'wall', cityId -1, mat 'stone', level 2.
//   animals[] zusätzlich: food 0..100 (Sättigung), home (Ort-ID | -1), size (Schleim 1..3), state/t (Drache: 0 ruht,
//     1 fliegt hin, 2 speit, 3 kehrt heim), buried (Sandwurm unter dem Sand: unsichtbar, unverwundbar), mad (Tick, bis
//     zu dem das Tier wahnsinnig ist), fleeing
//   units[] zusätzlich: role 'bandit' (Räuber: kingdomId -1, cityId -1, wHome = Lager-ID, task 'camp'|'raid'|'back'|'roam',
//     carrying 'food'|'gold'), wMad (Tick: wahnsinnig; während dessen kingdomId/cityId -1, Original in wMadK/wMadC),
//     wClear (Ort-ID, den der Soldat ausräumen soll), wClearT
//   cities[] zusätzlich: wAlarm (Tick, bis zu dem Alarm herrscht)
//
// KREATUREN (WW.CREATURES[kind], Daten in WW.WILD.CREATURES): name, plural, desc, category ('animal'|'monster'),
//   spawnable, hp, speed, hostile, ai, move ('land'|'water'|'sand'|'air'|'ghost'), flying, ghost, aquatic, habitat, …
//   Tiere:   sheep, cow, chicken, rabbit, deer, wolf, bear, crab, fish
//   Monster: dragon (flying), zombie, skeleton, slime (size), ghost (ghost: durch Mauern), demon, giantchicken, yeti,
//            sandworm (buried), treant, golem
//   Sprites a_<kind>_0/1. Fliegende und Geister ignorieren Gelände und Mauern; Bodenmonster werden von Mauern und
//   Toren aufgehalten, Türme schießen auf alle feindlichen Kreaturen, Räuber und Wahnsinnige.
// ORTE: WW.LAIRS[kind] { name, desc, category 'place', spawnable, resident, … }
//
// FX (sim.drainFx), zusätzlich: explosion {r}, flash {r}, shockwave {r}, mushroom, tracer {x2,y2}, firebreath {x2,y2},
//   fishjump, sandburst, snowball {x2,y2}, fling {x2,y2}, roof, quake {x2,y2}, eruption, lava, steam, laser,
//   debris {x2,y2}, bang {r}, hearts {r}, goldrain {r}, heal {r}, breeze {r}, acidrain {r}, frost {r}, drought {r},
//   flood {r}, seeds {r}, raise {r}, lower {r}, wreck, alarm, egg, split, zombify, grab, drop, scare, bombfall, napalm {r}
//
// EREIGNISTYPEN (WW.Texts.EVENTS, Varianten in js/data/texts-wild.js)
//   Wildnis: wolvesSheep, beastAttack, alarmBeasts, alarmMonster, alarmBandits, alarmMad, banditRaid, banditTheft,
//     banditTrader, lairCleared, campCleared, treasureFound, veinFound, veinEmpty, dragonRaid, dragonSlain, dragonHatch,
//     zombieBite, zombieOutbreak, ghostHaunt, demonFire, giantChickenField, monsterAttack, monsterSlain, treantAngry,
//     falloutSick, godHand
//   Kräfte: godRaise, godLower, godSeeds, godQuake, godVolcano, godVolcanoWild, godTornado, godAcid, godFlood, godFrost,
//     godDrought, godBreeze, godBomb, godCluster, godNapalm, godRocket, godBomber, godGunship, godNuke, godNukeWild,
//     godTsar, godTsarWild, godLaser, godBlackhole, godBlackholeWild, godMadness, godLove, godGold, godHeal, godWreck
//
// AKTIONEN (sim.actions.*, werfen nie)
//   strike(x, y, kind, { dx, dy }?) – alle Schlüssel aus WW.POWERS; dx/dy = Ziehrichtung (bomber, earthquake)
//   grab(id) -> bool (Einheit oder Tier aufnehmen), drop(x, y) -> id | null (absetzen), held() -> { what, kind|role, id } | null
//   aimAircraft(id, x, y) -> bool (Kanonenflieger nachführen)
//   placeLair(x, y, kind) -> structId | null, spawnBandits(x, y, n) -> Anzahl
//
// KRÄFTE (WW.POWERS[key]: key, name, desc, category, radius, duration, brush, dir, aim, apply; Icon i_<key>)
//   terrain:     raise, lower, seeds
//   nature:      lightning, fire, rain, meteor, earthquake, volcano, tornado, acidrain, flood, frost, drought, breeze
//   destruction: bomb, clusterbomb, napalm, rocket, bomber, gunship, nuke, tsar, orbitallaser, blackhole
//   life:        plague, bless, madness, love, goldrain, heal
//   meddle:      wrecker, wallbrush, hand
//   Kategorien mit Namen: WW.WILD.POWER_CATEGORIES; Kreatur-Kategorien: WW.WILD.CREATURE_CATEGORIES
// =============================================================================
(function (WW) { 'use strict';

  function CFG() { return WW.WILD.CFG; }
  const RASTERS = ['flora', 'graze', 'fallout', 'crack'];

  // fehlende Zustandsteile ergänzen (neue Welt, ältere Spielstände)
  function defaults(st) {
    const N = st.W * st.H;
    for (const r of RASTERS) if (!(st[r] instanceof Uint8Array) || st[r].length !== N) st[r] = new Uint8Array(N);
    const w = st.wild = st.wild || {};
    w.effects = Array.isArray(w.effects) ? w.effects : [];
    w.held = w.held || null;
    w.lastEv = w.lastEv || {};
    w.seq = w.seq | 0;
    st.aircraft = Array.isArray(st.aircraft) ? st.aircraft : [];
    st.scars = Array.isArray(st.scars) ? st.scars : [];
  }
  function ensure(sim) { const st = sim.state; if (!st.wild || !st.scars || !st.aircraft || !st.crack) defaults(st); }

  // Große Narben für die Darstellung: Krater 3×3 / 5×5 und Erdbebenrisse (verblassen nach ttl Ticks)
  function addScar(sim, x, y, kind, ttl) {
    const st = sim.state;
    if (!st.scars) st.scars = [];
    if (st.scars.length >= 200) st.scars.shift();
    st.scars.push({ x: Math.floor(x), y: Math.floor(y), kind: kind, ttl: ttl || WW.CONFIG.TPY * 4 });
  }
  function updateScars(sim) {
    const st = sim.state;
    if (!st.scars.length) return;
    for (const s of st.scars) s.ttl -= 20;
    if (st.scars.some((s) => !(s.ttl > 0))) st.scars = st.scars.filter((s) => s.ttl > 0);
  }

  // ---------------------------------------------------------------------------
  // Höhe und Gelände
  // ---------------------------------------------------------------------------
  function sea() { return (WW.WorldGen && WW.WorldGen.SEA_LEVEL) || 100; }
  // Höhenband = rank des passenden Geländes (0 Tiefsee … 7 Schneegipfel)
  function bandOf(h) {
    const S = sea();
    if (h < S - 40) return 0;
    if (h < S - 10) return 1;
    if (h < S) return 2;
    if (h < S + 4) return 3;
    if (h >= 238) return 7;
    if (h >= 205) return 6;
    if (h >= 175) return 5;
    return 4;
  }
  function terrainForBand(b) {
    const T = WW.T;
    return [T.DEEP, T.WATER, T.SHALLOW, T.SAND, T.GRASS, T.HILL, T.MOUNTAIN, T.SNOW][b];
  }
  function terrainFromHeight(h) {
    if (WW.WorldGen && WW.WorldGen.terrainFromHeight) return WW.WorldGen.terrainFromHeight(h);
    return terrainForBand(bandOf(h));
  }

  // Gelände einer Kachel setzen, mit allen Folgen für Bauwerke, Feuer und Spuren (wie paintTerrain)
  function setTerrain(sim, i, t) {
    const st = sim.state, LUT = WW.TERRAIN_LUT;
    if (st.terrain[i] === t) return false;
    st.terrain[i] = t;
    sim.markDirty(i);
    if (LUT.water[t]) { WW.Env.extinguish(sim, i); if (st.mark[i]) WW.Env.setMark(sim, i, 0); }
    if (st.flora[i] && t !== WW.T.ASH && t !== WW.T.LAVA) { st.flora[i] = 0; st.graze[i] = 0; }
    const s = sim._structs.get(st.structAt[i]);
    if (s) {
      const c = sim._cities.get(s.cityId);
      const race = c ? c.race : 'human';
      if (t === WW.T.LAVA) { if (s.type === 'center') WW.Structs.destroy(sim, s); else WW.Structs.remove(sim, s); }
      else if (WW.Structs.isWallish(s)) { if (LUT.walk[t] <= 0) WW.Structs.remove(sim, s); }
      else if (s.type === 'field') { if (LUT.fertile[t] <= 0 || !WW.Structs.terrainBuildable(sim, i, race)) WW.Structs.remove(sim, s); }
      else if (s.type === 'ruin' || s.type === 'lair') { if (LUT.walk[t] <= 0) WW.Structs.remove(sim, s); }
      else if (!WW.Structs.terrainBuildable(sim, i, race)) {
        if (s.type === 'center') WW.Structs.remove(sim, s); else WW.Structs.destroy(sim, s);
      }
    }
    return true;
  }

  // Höhe setzen; wechselt das Höhenband, passt sich das Gelände an. Rückgabe: Gelände geändert
  function setHeight(sim, i, h) {
    const st = sim.state;
    h = Math.max(0, Math.min(255, Math.round(h)));
    const oh = st.height[i];
    if (h === oh) return false;
    st.height[i] = h;
    const ob = bandOf(oh), nb = bandOf(h);
    if (ob === nb) return false;
    const T = WW.T, t = st.terrain[i], rank = WW.TERRAIN_LUT.rank[t];
    if (rank === nb) return false;
    // Fluss bleibt Fluss, solange er nicht zu Hügel wird oder versinkt
    if (t === T.RIVER && nb >= 2 && nb <= 4) return false;
    let nt = nb === 4 ? (rank === 4 ? t : T.GRASS) : terrainForBand(nb);
    if (nb === 4 && rank < 3) nt = T.GRASS;
    return setTerrain(sim, i, nt);
  }
  // nach Geländeänderungen einmal aufrufen
  function finishTerrain(sim) {
    sim.terrainChanged();
    WW.Cities.refreshAllLists(sim);
  }

  // Baum pflanzen (Baumhirte, Saat): Wiese -> Wald, Savanne -> Dschungel, Tundra -> Nadelwald, Asche -> Wiese
  const PLANT = {};
  function plantMap() {
    if (PLANT.done) return PLANT;
    const T = WW.T;
    PLANT[T.GRASS] = T.FOREST; PLANT[T.FLOWERS] = T.FOREST; PLANT[T.SAVANNA] = T.JUNGLE; PLANT[T.TUNDRA] = T.TAIGA; PLANT[T.ASH] = T.GRASS;
    PLANT.done = true;
    return PLANT;
  }
  function plantTree(sim, x, y) {
    const st = sim.state;
    if (x < 0 || y < 0 || x >= st.W || y >= st.H) return false;
    const i = y * st.W + x, to = plantMap()[st.terrain[i]];
    if (to === undefined || st.structAt[i] !== -1 || st.inRing[i] !== -1 || st.fallout[i] || st.fire[i]) return false;
    st.terrain[i] = to; st.flora[i] = 0; st.graze[i] = 0; sim.markDirty(i);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Obergrenzen je Art (aus Habitatfläche, alle 240 Ticks neu gezählt; abgeleitet, nicht gespeichert)
  // ---------------------------------------------------------------------------
  function habitat(sim) {
    const st = sim.state;
    if (sim._hab && sim._habTick === Math.floor(st.tick / 240)) return sim._hab;
    const n = new Int32Array(WW.TERRAIN.length);
    for (let i = 0; i < st.terrain.length; i++) n[st.terrain[i]]++;
    const hab = {};
    for (const k in WW.CREATURES) {
      let s = 0;
      for (const key of WW.CREATURES[k].habitat || []) if (WW.TERRAIN_BY_KEY[key]) s += n[WW.TERRAIN_BY_KEY[key].id];
      hab[k] = s;
    }
    sim._hab = hab; sim._habTick = Math.floor(st.tick / 240);
    return hab;
  }
  function capOf(sim, kind) {
    const cr = WW.CREATURES[kind];
    if (!cr) return 0;
    if (cr.category === 'monster') return cr.max;
    return Math.max(2, Math.min(cr.max, Math.floor(habitat(sim)[kind] / cr.area)));
  }

  // ---------------------------------------------------------------------------
  // Chronik mit Sperrfrist (gleiche Meldung je Schlüssel höchstens alle gap Ticks)
  // ---------------------------------------------------------------------------
  function chron(sim, type, vars, at, key, gap) {
    ensure(sim);
    const st = sim.state, w = st.wild;
    const k = type + ':' + (key == null ? '' : key);
    const last = w.lastEv[k];
    gap = gap == null ? CFG().CHRONICLE_GAP : gap;
    if (last != null && st.tick - last < gap) return null;
    w.lastEv[k] = st.tick;
    return sim.event(type, vars, at);
  }
  // Stadt an/nahe einer Stelle
  function cityNear(sim, x, y, r) {
    const st = sim.state;
    const fx = Math.floor(x), fy = Math.floor(y);
    if (fx >= 0 && fy >= 0 && fx < st.W && fy < st.H) {
      const i = fy * st.W + fx;
      const c = sim._cities.get(st.inRing[i]) || sim._cities.get(st.owner[i]);
      if (c) return c;
    }
    let best = null, bd = (r || 12) * (r || 12);
    for (const c of st.cities) { const dx = c.cx + 0.5 - x, dy = c.cy + 0.5 - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } }
    return best;
  }
  function crName(kind) { const c = WW.CREATURES[kind]; return c ? c.name : 'Etwas'; }

  // ---------------------------------------------------------------------------
  // Erschrecken und Fliehen (Umgehung ohne Eingriff in die Einheiten-KI: die Einheit „bringt ihre Sachen heim",
  // d. h. sie läuft zum Zentrum bzw. Tor; siehe Bericht: Haken order { kind: 'flee' } gewünscht)
  // ---------------------------------------------------------------------------
  function scare(sim, u, fx, fy, ghostly) {
    if (!u || u.dead) return false;
    const st = sim.state;
    if (u.role === 'soldier' || u.role === 'bandit' || u.role === 'settler' || u.wMad > st.tick) return false;
    if (!u.bubble || u.bubble.icon !== 'exclaim') WW.Units.bubble(u, 'exclaim', 25);
    const c = sim._cities.get(u.cityId);
    if (!c) return false;
    if (ghostly) c.happiness = Math.max(0, c.happiness - 0.4);
    if (st.inRing[Math.floor(u.y) * st.W + Math.floor(u.x)] === c.id) return false;
    if (u.role === 'child' || u.role === 'trader' || u.role === 'leader') return false;
    if (!u.carrying) { u.carrying = 'food'; u.carryAmt = 0; }
    u.phase = 0; u.target = -1; u.task = null; u.path = null;
    return true;
  }

  // Soldaten einer Stadt zu einer Stelle schicken
  function sendSoldiers(sim, c, x, y, max) {
    const st = sim.state, W = st.W;
    const goal0 = Math.max(0, Math.min(st.H - 1, Math.floor(y))) * W + Math.max(0, Math.min(W - 1, Math.floor(x)));
    let n = 0;
    for (const u of c._members || []) {
      if (n >= max) break;
      if (u.dead || u.role !== 'soldier' || u.order || u.wClear) continue;
      const dx = u.x - x, dy = u.y - y;
      if (dx * dx + dy * dy < 9) { n++; continue; }
      if (dx * dx + dy * dy > 30 * 30) continue;
      const g = WW.Path.nearestFree(sim, goal0, u.kingdomId, 3);
      if (g < 0) break;
      const r = WW.Units.goTo(sim, u, g, { limit: 900 });
      if (r === true) { u.wait = 48; n++; }
      else if (r === false) break;   // Wegsuche-Budget leer: nächstes Mal
    }
    return n;
  }

  // ---------------------------------------------------------------------------
  // Orte in der Wildnis
  // ---------------------------------------------------------------------------
  function placeLair(sim, x, y, kind) {
    const L = WW.LAIRS[kind];
    const st = sim.state;
    if (!L) return null;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= st.W || y >= st.H) return null;
    const i = y * st.W + x;
    if (WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0 || st.structAt[i] !== -1 || sim.block[i]) return null;
    const s = WW.Structs.create(sim, 'lair', x, y, -1, { built: true });
    if (!s) return null;
    s.kind = kind; s.maxHp = s.hp = L.hp;
    s.loot = { food: 0, gold: L.gold || 0 };
    s.spawnT = 0; s.raidT = 500 + sim.rng.int(700);
    if (L.amount) s.amount = L.amount;
    return s;
  }
  function lairsOf(sim) {
    const out = [];
    for (const s of sim.state.structs) if (!s.dead && s.type === 'lair' && WW.LAIRS[s.kind]) out.push(s);
    return out;
  }
  function spawnResident(sim, s, L) {
    if (L.resident === 'bandit') return spawnBandit(sim, s.x + 0.5, s.y + 0.5, s.id) ? 1 : 0;
    const a = WW.Creatures.spawn(sim, L.resident, s.x + 0.5 + sim.rng.range(-1, 1), s.y + 0.5 + sim.rng.range(-1, 1), { home: s.id, age: 1 });
    if (!a) return 0;
    if (L.resident === 'dragon') { a.state = 0; a.t = 600 + sim.rng.int(900); }
    return 1;
  }

  // alle 30 Ticks: Brutstätten erzeugen nach, Schätze werden gefunden
  function updateLairs(sim) {
    const st = sim.state;
    const lairs = lairsOf(sim);
    if (!lairs.length) return;
    const res = {};
    for (const a of st.animals) if (!a.dead && a.home >= 0) res[a.home] = (res[a.home] || 0) + 1;
    for (const u of st.units) if (!u.dead && u.role === 'bandit' && u.wHome >= 0) res[u.wHome] = (res[u.wHome] || 0) + 1;
    for (const s of lairs) {
      const L = WW.LAIRS[s.kind];
      if (L.resident) {
        if (s.spawnT > 0) s.spawnT -= 30;
        else if ((res[s.id] || 0) < L.max) {
          const n = spawnResident(sim, s, L);
          s.spawnT = L.respawn;
          if (n && s.kind === 'dragonhoard' && s.hatched) {
            const c = cityNear(sim, s.x, s.y, 40);
            chron(sim, 'dragonHatch', { city: c ? c.name : 'der Gegend' }, { x: s.x + 0.5, y: s.y + 0.5, cityId: c ? c.id : -1, kingdomId: c ? c.kingdomId : -1 }, s.id, 0);
          }
          s.hatched = 1;
        }
      }
      if (s.kind === 'banditcamp') banditPlan(sim, s, res[s.id] || 0);
      if (s.kind === 'treasure') {
        let finder = null;
        WW.Units.forNear(sim, s.x + 0.5, s.y + 0.5, 1.7, false, (u) => { if (!finder && u.cityId >= 0 && u.role !== 'settler') finder = u; });
        if (finder) {
          const c = sim._cities.get(finder.cityId);
          const gold = Math.round((s.loot && s.loot.gold) || 40);
          if (c) {
            WW.Cities.addStock(sim, c, 'gold', gold);
            sim.event('treasureFound', { city: c.name, name: finder.name, n: gold }, { kingdomId: c.kingdomId, cityId: c.id, x: s.x + 0.5, y: s.y + 0.5 });
          }
          WW.Units.bubble(finder, 'note', 40);
          sim.fx({ type: 'sparkle', x: s.x + 0.5, y: s.y + 0.5 });
          const x = s.x, y = s.y;
          WW.Structs.remove(sim, s);
          const r = WW.Structs.create(sim, 'ruin', x, y, -1, { built: true, ruinOf: 'lair' });
          if (r) r.age = 0;
        }
      }
    }
  }

  // ein Ort fällt durch Soldaten
  function lairCleared(sim, s, c) {
    const L = WW.LAIRS[s.kind];
    if (c && s.loot) {
      if (s.loot.gold) WW.Cities.addStock(sim, c, 'gold', s.loot.gold);
      if (s.loot.food) WW.Cities.addStock(sim, c, 'food', s.loot.food);
    }
    if (c) sim.event(s.kind === 'banditcamp' ? 'campCleared' : 'lairCleared', { city: c.name, place: L ? L.name : 'Ort' },
      { kingdomId: c.kingdomId, cityId: c.id, x: s.x + 0.5, y: s.y + 0.5 });
  }

  // jährlich: Adern werfen ab, Städte räumen nahe Lager aus
  function yearlyLairs(sim) {
    const st = sim.state;
    for (const s of lairsOf(sim)) {
      const L = WW.LAIRS[s.kind];
      if (L.yield) {
        const i = s.y * st.W + s.x;
        const c = sim._cities.get(st.inRing[i]) || sim._cities.get(st.owner[i]);
        if (!c) continue;
        if (!s.found) { s.found = c.id; sim.event('veinFound', { city: c.name, place: L.name }, { kingdomId: c.kingdomId, cityId: c.id, x: s.x + 0.5, y: s.y + 0.5 }); }
        for (const r in L.yield) { WW.Cities.addStock(sim, c, r, L.yield[r]); s.amount -= L.yield[r]; }
        if (s.amount <= 0) {
          sim.event('veinEmpty', { city: c.name, place: L.name }, { kingdomId: c.kingdomId, cityId: c.id, x: s.x + 0.5, y: s.y + 0.5 });
          WW.Structs.remove(sim, s);
        }
      }
    }
    // Ausräumen
    const lairs = lairsOf(sim).filter((s) => WW.LAIRS[s.kind].hostile);
    if (!lairs.length) return;
    for (const c of st.cities) {
      const sold = (c._members || []).filter((u) => !u.dead && u.role === 'soldier' && !u.order && !u.wClear);
      if (sold.length < 2) continue;
      const R = Math.min(30, WW.Cities.territoryRadius(c, sim) + CFG().CLEAR_RANGE);
      let best = null, bd = R * R;
      for (const s of lairs) { const dx = s.x - c.cx, dy = s.y - c.cy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = s; } }
      if (!best) continue;
      const n = Math.min(sold.length, 5);
      for (let k = 0; k < n; k++) { sold[k].wClear = best.id; sold[k].wClearT = st.tick + WW.CONFIG.TPY * 2; sold[k].path = null; }
    }
  }

  // Soldat räumt einen Ort aus (alle 8 Ticks)
  function clearThink(sim, u) {
    const st = sim.state, W = st.W;
    const s = sim._structs.get(u.wClear);
    if (!s || s.dead || s.type !== 'lair' || st.tick > u.wClearT || u.order) { delete u.wClear; delete u.wClearT; return; }
    if (u.foe >= 0) return;                 // kämpft gerade (Einheiten-KI)
    u.wait = 40;
    const dx = s.x + 0.5 - u.x, dy = s.y + 0.5 - u.y;
    if (dx * dx + dy * dy <= 3.2) {
      u.path = null;
      if (s.kind === 'treasure') return;    // Schatz wird beim nächsten Lager-Durchgang gefunden
      if (u.cd <= 0) {
        u.cd = 8;
        if (WW.Structs.damage(sim, s, WW.Units.damageOf(sim, u), 'hit')) {
          lairCleared(sim, s, sim._cities.get(u.cityId));
          delete u.wClear; delete u.wClearT; u.wait = 0;
        }
      }
      return;
    }
    if (!u.path) {
      const g = WW.Path.approachTile(sim, s.y * W + s.x, u.kingdomId, Math.floor(u.y) * W + Math.floor(u.x));
      const r = g >= 0 ? WW.Units.goTo(sim, u, g, { limit: 2500 }) : null;
      if (r === null) { delete u.wClear; delete u.wClearT; u.wait = 0; }
    }
  }

  // ---------------------------------------------------------------------------
  // Räuber (Einheiten mit Rolle 'bandit', ohne Reich)
  // ---------------------------------------------------------------------------
  function spawnBandit(sim, x, y, home) {
    const st = sim.state;
    const fx = Math.floor(x), fy = Math.floor(y);
    if (!(fx >= 0 && fy >= 0 && fx < st.W && fy < st.H)) return null;
    const t = WW.Path.nearestFree(sim, fy * st.W + fx, -1, 3);
    if (t < 0) return null;
    const race = sim.rng.pick(['human', 'human', 'orc', 'gnome', 'dwarf']);
    const u = WW.Units.create(sim, { x: (t % st.W) + 0.5, y: Math.floor(t / st.W) + 0.5, role: 'bandit', kingdomId: -1, cityId: -1, race: race });
    if (!u) return null;
    u.wHome = home == null ? -1 : home; u.task = 'camp'; u.wait = 30;
    return u;
  }

  // Lager plant einen Überfall
  function banditPlan(sim, s, n) {
    const st = sim.state;
    if (s.raidT > 0) { s.raidT -= 30; return; }
    s.raidT = 700 + sim.rng.int(900);
    if (n < 2) return;
    // Ziel: Händler in der Nähe, sonst Felder oder das Zentrum einer unbefestigten Stadt
    let target = -1, city = null;
    let trader = null;
    WW.Units.forNear(sim, s.x + 0.5, s.y + 0.5, 24, false, (u) => { if (!trader && u.role === 'trader') trader = u; });
    if (trader) target = trader.id;
    else {
      let bd = 40 * 40;
      for (const c of st.cities) { const dx = c.cx - s.x, dy = c.cy - s.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; city = c; } }
      if (!city) return;
      const open = !(city.wall && city.wall.level >= 1);
      if (open && sim.rng.chance(0.5)) target = city.centerId;
      else {
        const fields = (city.fields || []).map((id) => sim._structs.get(id)).filter((f) => f && !f.dead && f.growth >= 1);
        if (fields.length) target = sim.rng.pick(fields).id; else if (open) target = city.centerId;
      }
    }
    if (target < 0) return;
    for (const u of st.units) if (!u.dead && u.role === 'bandit' && u.wHome === s.id && u.task === 'camp') { u.task = 'raid'; u.target = target; u.tt = 0; u.path = null; }
  }

  function outlawFight(sim, u) {
    // Soldaten, Anführer und Miliz in Reichweite schlagen zu, der Räuber/Wahnsinnige wehrt sich
    let foe = null;
    WW.Units.forNear(sim, u.x, u.y, 1.5, false, (v) => {
      if (v === u || v.dead || v.kingdomId < 0 || u.dead) return;
      const k = sim._kingdoms.get(v.kingdomId);
      const militia = k && WW.GOVERNMENTS[k.gov] && WW.GOVERNMENTS[k.gov].militia && v.role !== 'child';
      if (v.role !== 'soldier' && v.role !== 'leader' && !militia) return;
      if (v.cd <= 0) { v.cd = 8; WW.Units.hitUnit(sim, v, u, WW.Units.damageOf(sim, v)); }
      if (!foe) foe = v;
    });
    if (foe && !u.dead && u.cd <= 0) { u.cd = 8; WW.Units.hitUnit(sim, { id: u.id, kingdomId: -1 }, foe, 6); }
    return !!foe;
  }

  function banditThink(sim, u) {
    const st = sim.state, W = st.W;
    u.wait = 30;                                      // hält die Einheiten-KI vom Umherschlendern ab
    if (outlawFight(sim, u)) { u.path = null; return; }
    const home = u.wHome >= 0 ? sim._structs.get(u.wHome) : null;
    if (u.wHome >= 0 && (!home || home.dead)) { u.wHome = -1; u.task = 'roam'; }
    const cur = Math.floor(u.y) * W + Math.floor(u.x);
    const go = (goal, lim) => WW.Units.goTo(sim, u, goal, { limit: lim || 1500 });
    if (u.task === 'raid') {
      u.tt = (u.tt || 0) + 8;
      const tgt = WW.Units.entity(sim, u.target) || sim._structs.get(u.target);
      if (!tgt || tgt.dead || u.tt > 900) { u.task = home ? 'back' : 'roam'; u.path = null; return; }
      const tx = tgt.role !== undefined ? tgt.x : tgt.x + tgt.w / 2, ty = tgt.role !== undefined ? tgt.y : tgt.y + tgt.h / 2;
      const dx = tx - u.x, dy = ty - u.y;
      if (dx * dx + dy * dy <= (tgt.type === 'center' ? 6 : 2.6)) {
        u.path = null;
        if (tgt.role !== undefined) {                         // Händler
          if (u.cd <= 0) { u.cd = 8; WW.Units.hitUnit(sim, { id: u.id, kingdomId: -1 }, tgt, 6); WW.Units.bubble(tgt, 'exclaim', 25); }
          if (tgt.dead || sim.rng.chance(0.3)) {
            u.carrying = 'gold'; u.carryAmt = 6; u.task = home ? 'back' : 'roam';
            const c = sim._cities.get(tgt.cityId);
            if (c) chron(sim, 'banditTrader', { city: c.name, name: tgt.name }, WW.Cities.atCity(c), c.id);
          }
        } else if (tgt.type === 'field') {
          if (tgt.growth > 0) { u.carrying = 'food'; u.carryAmt = 3 + tgt.growth * 2; tgt.growth = 0; tgt.gprog = 0; sim.markDirty(tgt.y * W + tgt.x); }
          const c = sim._cities.get(tgt.cityId);
          if (c) chron(sim, 'banditRaid', { city: c.name }, WW.Cities.atCity(c), c.id);
          u.task = home ? 'back' : 'roam';
        } else {                                               // Zentrum einer offenen Stadt: Lager plündern
          const c = sim._cities.get(tgt.cityId);
          if (c) {
            const sk = WW.Cities.stock(sim, c);
            const f = Math.min(sk.food * 0.15, 10), g = Math.min(sk.gold * 0.25, 10);
            sk.food -= f; sk.gold -= g;
            u.carrying = g > f ? 'gold' : 'food'; u.carryAmt = f + g;
            chron(sim, 'banditTheft', { city: c.name, n: Math.round(f + g) }, WW.Cities.atCity(c), c.id);
          }
          u.task = home ? 'back' : 'roam';
        }
        return;
      }
      if (!u.path) {
        let goal = Math.floor(ty) * W + Math.floor(tx);
        if (tgt.type === 'center') goal = WW.Cities.centerTile(sim, sim._cities.get(tgt.cityId) || { cx: tgt.x + 1, cy: tgt.y + 1 }, u.id);
        const r = go(goal, 2500);
        if (r === null) { u.task = home ? 'back' : 'roam'; }
      }
      return;
    }
    if (u.task === 'back') {
      if (!home) { u.task = 'roam'; return; }
      const dx = home.x + 0.5 - u.x, dy = home.y + 0.5 - u.y;
      if (dx * dx + dy * dy <= 4) {
        if (u.carrying) { home.loot = home.loot || { food: 0, gold: 0 }; home.loot[u.carrying === 'gold' ? 'gold' : 'food'] += u.carryAmt; u.carrying = null; u.carryAmt = 0; }
        u.task = 'camp'; u.path = null; return;
      }
      if (!u.path) {
        const g = WW.Path.approachTile(sim, home.y * W + home.x, -1, cur);
        if (g < 0 || go(g, 2500) === null) u.task = 'camp';
      }
      return;
    }
    // am Lager herumlungern oder (ohne Lager) umherziehen
    if (!u.path && sim.rng.chance(0.3)) {
      const px = home ? home.x : u.x, py = home ? home.y : u.y, r = home ? 3 : 7;
      const x = Math.floor(px + sim.rng.range(-r, r)), y = Math.floor(py + sim.rng.range(-r, r));
      if (x >= 0 && y >= 0 && x < W && y < st.H && WW.Path.passable(sim, y * W + x, -1)) go(y * W + x, 300);
      if (sim.rng.chance(0.08)) WW.Units.bubble(u, sim.rng.pick(['note', 'angry', 'zzz']), 30);
    }
    if (!home && sim.rng.chance(0.01)) {
      // heimatlose Räuber versuchen ab und zu ihr Glück an einem Feld
      let f = null;
      for (const c of st.cities) { const dx = c.cx - u.x, dy = c.cy - u.y; if (dx * dx + dy * dy < 900 && c.fields && c.fields.length) { f = sim._structs.get(sim.rng.pick(c.fields)); break; } }
      if (f) { u.task = 'raid'; u.target = f.id; u.tt = 0; u.path = null; }
    }
  }

  // ---------------------------------------------------------------------------
  // Wahnsinn (Einheiten)
  // ---------------------------------------------------------------------------
  function makeMad(sim, u, ticks) {
    if (!u || u.dead) return false;
    const st = sim.state;
    if (!(u.wMad > st.tick)) { u.wMadK = u.kingdomId; u.wMadC = u.cityId; }
    u.wMad = st.tick + ticks;
    u.kingdomId = -1; u.cityId = -1; u.order = null; u.breach = -1; u.path = null; u.foe = -1; u.wait = 30;
    if (u.carrying) { u.carrying = null; u.carryAmt = 0; }
    WW.Units.bubble(u, 'angry', 60);
    return true;
  }
  function endMad(sim, u) {
    const k = sim._kingdoms.get(u.wMadK);
    let c = sim._cities.get(u.wMadC);
    if (c && c.kingdomId !== u.wMadK) c = null;
    if (!c && k && k.cityIds.length) c = sim._cities.get(k.cityIds[0]);
    delete u.wMad;
    if (c) {
      u.kingdomId = c.kingdomId; u.cityId = c.id;
      const kk = sim._kingdoms.get(c.kingdomId);
      if (u.role === 'leader' && kk && kk.leaderId !== u.id) WW.Units.setRole(sim, u, 'farmer');
      WW.Units.bubble(u, 'question', 40);
    } else {
      // keine Heimat mehr: wird Räuber
      u.kingdomId = -1; u.cityId = -1;
      WW.Units.setRole(sim, u, 'bandit'); u.wHome = -1; u.task = 'roam';
    }
    delete u.wMadK; delete u.wMadC;
    u.wait = 0; u.path = null; u.foe = -1;
  }
  function madThink(sim, u) {
    const st = sim.state, W = st.W;
    if (!(u.wMad > st.tick)) { endMad(sim, u); return; }
    u.wait = 30;
    if (outlawFight(sim, u)) { u.path = null; return; }
    let t = null, bd = 49;
    WW.Units.forNear(sim, u.x, u.y, 7, false, (v, d2) => { if (v !== u && d2 < bd) { bd = d2; t = v; } });
    WW.Units.forNear(sim, u.x, u.y, 7, true, (a, d2) => { if (d2 < bd - 1) { bd = d2; t = a; } });
    if (!t) { if (!u.path && sim.rng.chance(0.3)) { const x = Math.floor(u.x + sim.rng.range(-5, 5)), y = Math.floor(u.y + sim.rng.range(-5, 5)); if (x >= 0 && y >= 0 && x < W && y < st.H && WW.Path.passable(sim, y * W + x, -1)) WW.Units.goTo(sim, u, y * W + x, { limit: 300 }); } return; }
    if (bd <= 1.7) {
      u.path = null;
      if (u.cd <= 0) {
        u.cd = 8;
        const dmg = WW.Units.damageOf(sim, u) * 1.5 + 2;
        if (t.role !== undefined) WW.Units.hitUnit(sim, { id: u.id, kingdomId: -1 }, t, dmg); else WW.Creatures.hit(sim, t, dmg, u);
        if (sim.rng.chance(0.3)) WW.Units.bubble(u, 'angry', 25);
      }
    } else if (!u.path || sim.rng.chance(0.3)) WW.Units.goTo(sim, u, Math.floor(t.y) * W + Math.floor(t.x), { limit: 400 });
  }

  // ---------------------------------------------------------------------------
  // Alarm: Städte sehen Gefahren, Bewohner fliehen, Soldaten rücken aus
  // ---------------------------------------------------------------------------
  function cityAlarm(sim, c) {
    const st = sim.state;
    const R = Math.min(22, WW.Cities.territoryRadius(c, sim) + 3);
    const px = c.cx + 0.5, py = c.cy + 0.5;
    let threat = null, td = R * R;
    WW.Units.forNear(sim, px, py, R, true, (a, d2) => {
      const cr = WW.CREATURES[a.kind];
      if (!cr || !(cr.hostile || a.mad > st.tick) || (cr.burrow && a.buried)) return;
      // einzelne Raubtiere erst, wenn sie näher kommen
      if (cr.category === 'animal' && d2 > R * R * 0.4) return;
      if (d2 < td) { td = d2; threat = a; }
    });
    WW.Units.forNear(sim, px, py, R, false, (u, d2) => { if ((u.role === 'bandit' || u.wMad > st.tick) && d2 < td) { td = d2; threat = u; } });
    if (!threat) return;
    const fresh = !(c.wAlarm > st.tick);
    c.wAlarm = st.tick + CFG().ALARM_TICKS;
    let type, foe;
    if (threat.role !== undefined) { type = threat.role === 'bandit' ? 'alarmBandits' : 'alarmMad'; foe = threat.name; }
    else { const cr = WW.CREATURES[threat.kind]; type = cr.category === 'monster' ? 'alarmMonster' : 'alarmBeasts'; foe = cr.name; }
    if (fresh) {
      sim.fx({ type: 'alarm', x: px, y: py });
      chron(sim, type, { city: c.name, foe: foe }, WW.Cities.atCity(c), c.id, WW.CONFIG.TPY * 2);
    }
    let n = 0;
    const fr = type === 'alarmBeasts' ? 6 : 10;
    for (const u of c._members || []) {
      if (n >= 14) break;
      const dx = u.x - threat.x, dy = u.y - threat.y;
      if (dx * dx + dy * dy < fr * fr && scare(sim, u, threat.x, threat.y, false)) n++;
    }
    sendSoldiers(sim, c, threat.x, threat.y, CFG().SORTIE_MAX);
  }

  // ---------------------------------------------------------------------------
  // Rückmeldungen aus creatures.js
  // ---------------------------------------------------------------------------
  function atC(c, x, y) { return { kingdomId: c.kingdomId, cityId: c.id, x: x, y: y }; }
  function onCreatureDeath(sim, a, cr, killer) {
    if (a.kind === 'dragon') {
      const home = a.home >= 0 ? sim._structs.get(a.home) : null;
      const c = (killer && sim._cities.get(killer.cityId)) || cityNear(sim, a.x, a.y, 30);
      if (c) sim.event('dragonSlain', { city: c.name, name: killer && killer.name ? killer.name : 'Jemand' }, atC(c, a.x, a.y));
      // der Hort wird zum Schatz
      if (home && home.kind === 'dragonhoard') { home.kind = 'treasure'; home.loot = { food: 0, gold: Math.max(80, (home.loot && home.loot.gold) || 0) }; home.spawnT = 1e6; sim.markDirty(home.y * sim.state.W + home.x); }
      return;
    }
    if (cr.boss && killer && killer.role !== undefined) {
      const c = sim._cities.get(killer.cityId);
      if (c) chron(sim, 'monsterSlain', { city: c.name, foe: cr.name, name: killer.name }, atC(c, a.x, a.y), c.id + ':' + a.kind);
    }
  }
  function onPreyKilled(sim, a, prey) {
    const c = cityNear(sim, prey.x, prey.y, 14);
    if (!c) return;
    if (prey.role !== undefined) chron(sim, 'beastAttack', { city: c.name, foe: crName(a.kind), name: prey.name }, atC(c, prey.x, prey.y), c.id);
    else if (a.kind === 'wolf' && (prey.kind === 'sheep' || prey.kind === 'chicken')) chron(sim, 'wolvesSheep', { city: c.name, foe: crName(prey.kind) }, atC(c, prey.x, prey.y), c.id, WW.CONFIG.TPY * 2);
  }
  function onZombieBite(sim, a, x, y, isUnit) {
    if (isUnit) { const c = cityNear(sim, x, y, 14); if (c) chron(sim, 'zombieBite', { city: c.name }, atC(c, x, y), c.id); }
    if ((sim._animalCount.zombie || 0) >= 12) { const c = cityNear(sim, x, y, 30); chron(sim, 'zombieOutbreak', { city: c ? c.name : 'der Wildnis', n: sim._animalCount.zombie }, c ? atC(c, x, y) : { x: x, y: y }, 'w', WW.CONFIG.TPY * 3); }
  }
  function onHaunt(sim, a) { const c = cityNear(sim, a.x, a.y, 6); if (c) chron(sim, 'ghostHaunt', { city: c.name }, atC(c, a.x, a.y), c.id); }
  function hauntTarget(sim, a) {
    const c = cityNear(sim, a.x, a.y, 40);
    return c ? (c.cy * sim.state.W + c.cx) : -1;
  }
  function onDemonFire(sim, a, x, y) { const c = cityNear(sim, x, y, 4); if (c) chron(sim, 'demonFire', { city: c.name }, atC(c, x, y), c.id); }
  function onTrample(sim, a, f) { const c = sim._cities.get(f.cityId); if (c) chron(sim, 'giantChickenField', { city: c.name }, atC(c, a.x, a.y), c.id); }
  function onBossAttack(sim, a) { const c = cityNear(sim, a.x, a.y, 10); if (c) chron(sim, 'monsterAttack', { city: c.name, foe: crName(a.kind) }, atC(c, a.x, a.y), c.id + ':' + a.kind); }
  function onTreantAngry(sim, a, u) { const c = sim._cities.get(u.cityId); if (c) chron(sim, 'treantAngry', { city: c.name }, atC(c, a.x, a.y), c.id); }
  // Ziel des Drachenflugs: { i, cityId }
  function dragonTarget(sim, a) {
    const st = sim.state;
    const home = a.home >= 0 ? sim._structs.get(a.home) : null;
    const px = home ? home.x + 0.5 : a.x, py = home ? home.y + 0.5 : a.y;
    if (sim.rng.chance(home ? 0.35 : 0.3)) {
      let best = null, bd = (home ? 40 : 30) ** 2;
      for (const c of st.cities) { const dx = c.cx - px, dy = c.cy - py, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } }
      if (best) {
        const x = Math.max(0, Math.min(st.W - 1, best.cx + sim.rng.irange(-4, 4))), y = Math.max(0, Math.min(st.H - 1, best.cy + sim.rng.irange(-4, 4)));
        chron(sim, 'dragonRaid', { city: best.name }, WW.Cities.atCity(best), best.id, WW.CONFIG.TPY);
        return { i: y * st.W + x, cityId: best.id };
      }
    }
    const x = Math.floor(px + sim.rng.range(-20, 20)), y = Math.floor(py + sim.rng.range(-20, 20));
    if (x < 0 || y < 0 || x >= st.W || y >= st.H) return null;
    return { i: y * st.W + x, cityId: -1 };
  }

  // ---------------------------------------------------------------------------
  // Besiedeln (beim Erzeugen) und Einwandern (jährlich)
  // ---------------------------------------------------------------------------
  function farFromPeople(sim, x, y, d) {
    const st = sim.state, d2 = d * d;
    for (const c of st.cities) { const dx = c.cx - x, dy = c.cy - y; if (dx * dx + dy * dy < d2) return false; }
    // ohne Städte: die ersten Startplätze des Weltgenerators freihalten (dort siedelt der Spieler zuerst)
    if (!st.cities.length) for (const s of (sim._startSpots || []).slice(0, 4)) { const dx = s.x - x, dy = s.y - y; if (dx * dx + dy * dy < d2) return false; }
    return true;
  }
  function randomHabitatTile(sim, cr, minDist, tries) {
    const st = sim.state, W = st.W, N = W * st.H;
    for (let n = 0; n < (tries || 40); n++) {
      const i = sim.rng.int(N);
      if (st.owner[i] !== -1 || !WW.Creatures.habitatOk(sim, cr, i) || !WW.Creatures.canEnter(sim, cr, i)) continue;
      if (minDist && !farFromPeople(sim, i % W, Math.floor(i / W), minDist)) continue;
      return i;
    }
    return -1;
  }
  function spawnGroup(sim, kind, n, minDist) {
    const cr = WW.CREATURES[kind], st = sim.state, W = st.W;
    const i = randomHabitatTile(sim, cr, minDist, 60);
    if (i < 0) return 0;
    let k = 0;
    for (let g = 0; g < n; g++) {
      const a = WW.Creatures.spawn(sim, kind, (i % W) + 0.5 + sim.rng.range(-1.5, 1.5), Math.floor(i / W) + 0.5 + sim.rng.range(-1.5, 1.5), { age: 1 + sim.rng.int(4), food: 60 + sim.rng.int(30) });
      if (a) k++;
    }
    return k;
  }
  function placeLairs(sim) {
    const st = sim.state, W = st.W, H = st.H, N = W * H;
    const placed = [];
    const near = (x, y, keys, r) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        if (keys[st.terrain[yy * W + xx]]) return true;
      }
      return false;
    };
    const MT = {}; MT[WW.T.MOUNTAIN] = 1; MT[WW.T.SNOW] = 1;
    for (const kind of WW.LAIR_KEYS) {
      const L = WW.LAIRS[kind];
      let want = Math.floor(N / L.area + sim.rng.next());
      if (kind === 'dragonhoard' && N < 9000) want = 0;
      const hab = new Uint8Array(WW.TERRAIN.length);
      for (const k of L.habitat) if (WW.TERRAIN_BY_KEY[k]) hab[WW.TERRAIN_BY_KEY[k].id] = 1;
      for (let tries = 0; want > 0 && tries < 600; tries++) {
        const i = sim.rng.int(N), x = i % W, y = (i - x) / W;
        if (!hab[st.terrain[i]] || WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0 || st.structAt[i] !== -1 || st.owner[i] !== -1) continue;
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
        if (!farFromPeople(sim, x, y, tries < 250 ? L.minDist : Math.round(L.minDist * 0.7))) continue;
        if (L.nearMountain && !near(x, y, MT, 2)) continue;
        let ok = true;
        for (const p of placed) { const dx = p.x - x, dy = p.y - y; if (dx * dx + dy * dy < 64) { ok = false; break; } }
        if (!ok) continue;
        const s = placeLair(sim, x, y, kind);
        if (!s) continue;
        placed.push(s); want--;
        if (L.resident) { const m = Math.min(L.max, kind === 'dragonhoard' ? 1 : L.max - 1); for (let k = 0; k < m; k++) spawnResident(sim, s, L); s.spawnT = L.respawn; s.hatched = 1; }
      }
    }
  }
  function populate(sim) {
    const st = sim.state;
    habitat(sim);
    // Pflanzenfresser zuerst, dann Räuber
    const order = ['fish', 'crab', 'rabbit', 'sheep', 'deer', 'cow', 'chicken', 'wolf', 'bear'];
    for (const kind of order) {
      const cr = WW.CREATURES[kind];
      if (!cr) continue;
      let left = Math.round(capOf(sim, kind) * (cr.diet === 'meat' ? 0.5 : 0.65));
      if (left < 2 && (habitat(sim)[kind] || 0) < 20) continue;
      for (let g = 0; left > 0 && g < 60; g++) {
        const n = Math.min(left, cr.group[0] + sim.rng.int(cr.group[1] - cr.group[0] + 1));
        left -= Math.max(1, spawnGroup(sim, kind, n, cr.hostile ? 14 : 6));
      }
    }
    placeLairs(sim);
    natives(sim, 1);
    for (const c of st.cities) c.wAlarm = 0;
  }
  // Biom-Monster: Yeti im Schnee, Sandwurm in der Wüste, Baumhirte im Wald, Golem im Kristallfeld, Schleim im Sumpf
  function natives(sim, p) {
    const hab = habitat(sim);
    const C = WW.WILD;
    for (const kind of C.NATIVES) {
      const cr = WW.CREATURES[kind];
      if (!cr) continue;
      const want = Math.min(C.NATIVE_MAX, Math.floor(hab[kind] / C.NATIVE_AREA[kind]));
      let have = 0;
      for (const a of sim.state.animals) if (!a.dead && a.kind === kind && a.home < 0) have++;
      if (have < want && sim.rng.chance(p)) spawnGroup(sim, kind, kind === 'slime' ? 2 : 1, 16);
    }
  }
  function immigrate(sim) {
    const cnt = sim._animalCount || {};
    for (const kind of WW.CREATURE_KEYS) {
      const cr = WW.CREATURES[kind];
      if (cr.category !== 'animal') continue;
      const cap = capOf(sim, kind);
      if ((habitat(sim)[kind] || 0) < 30) continue;
      const n = cnt[kind] || 0;
      if (n >= Math.max(2, cap * 0.2)) continue;
      if (cr.diet === 'meat') {
        let prey = 0;
        for (const p of cr.prey) prey += cnt[p] || 0;
        if (prey < 10) continue;
      }
      spawnGroup(sim, kind, cr.group[0] + 1, 10);
    }
    natives(sim, 0.35);
  }

  // ---------------------------------------------------------------------------
  // Göttliche Hand und weitere Aktionen
  // ---------------------------------------------------------------------------
  function grab(sim, id) {
    ensure(sim);
    const st = sim.state;
    if (st.wild.held || id == null) return false;
    const u = sim._units.get(id);
    if (u && !u.dead) {
      const k = st.units.indexOf(u);
      if (k >= 0) st.units.splice(k, 1);
      sim._units.delete(u.id);
      u.path = null; u.pi = 0; u.moving = false; u.foe = -1; u.order = null; u.breach = -1;
      st.wild.held = { what: 'unit', data: u };
      sim.fx({ type: 'grab', x: u.x, y: u.y });
      return true;
    }
    const a = sim._animals.get(id);
    if (a && !a.dead) {
      const k = st.animals.indexOf(a);
      if (k >= 0) st.animals.splice(k, 1);
      sim._animals.delete(a.id);
      if (sim._animalCount && sim._animalCount[a.kind]) sim._animalCount[a.kind]--;
      a.tx = -1; a.moving = false; a.foe = -1;
      st.wild.held = { what: 'animal', data: a };
      sim.fx({ type: 'grab', x: a.x, y: a.y });
      return true;
    }
    return false;
  }
  function drop(sim, x, y) {
    ensure(sim);
    const st = sim.state, W = st.W;
    const h = st.wild.held;
    if (!h || !WW.SimUtil.isNum(x) || !WW.SimUtil.isNum(y) || x < 0 || y < 0 || x >= W || y >= st.H) return null;
    const i = Math.floor(y) * W + Math.floor(x);
    const o = h.data;
    if (h.what === 'unit') {
      if (st.units.length >= WW.CONFIG.MAX_UNITS) return null;
      const t = WW.Path.nearestFree(sim, i, o.kingdomId, 6);
      if (t < 0) return null;
      o.x = (t % W) + 0.5; o.y = Math.floor(t / W) + 0.5; o.path = null; o.wait = 0;
      st.units.push(o); sim._units.set(o.id, o);
      const k = sim._kingdoms.get(o.kingdomId);
      if (o.role === 'leader' && (!k || k.leaderId !== o.id)) WW.Units.setRole(sim, o, 'farmer');
      const c = cityNear(sim, o.x, o.y, 0.1);
      if (c && c.id !== o.cityId && o.cityId >= 0) chron(sim, 'godHand', { name: o.name, city: c.name }, WW.Cities.atCity(c), c.id, 60);
    } else {
      const cr = WW.CREATURES[o.kind];
      if (!cr) { st.wild.held = null; return null; }
      const t = WW.Creatures.nearestFor(sim, cr, i, 4);
      if (t < 0) return null;
      o.x = (t % W) + 0.5; o.y = Math.floor(t / W) + 0.5; o.tx = -1; o.wait = 16;
      st.animals.push(o); sim._animals.set(o.id, o);
      if (sim._animalCount) sim._animalCount[o.kind] = (sim._animalCount[o.kind] || 0) + 1;
    }
    st.wild.held = null;
    sim.fx({ type: 'drop', x: o.x, y: o.y });
    return o.id;
  }

  function actions(sim, safe) {
    const st = () => { ensure(sim); return sim.state; };
    const isNum = WW.SimUtil.isNum;
    const inMap = (x, y) => isNum(x) && isNum(y) && x >= 0 && y >= 0 && x < st().W && y < st().H;
    return {
      grab: safe(function (id) { return grab(sim, id); }),
      drop: safe(function (x, y) { return drop(sim, x, y); }),
      held: safe(function () {
        const h = st().wild.held;
        return h ? { what: h.what, id: h.data.id, kind: h.data.kind || null, role: h.data.role || null, name: h.data.name || null } : null;
      }),
      aimAircraft: safe(function (id, x, y) {
        if (!inMap(x, y)) return false;
        for (const p of st().aircraft) if (p.id === id && p.kind === 'gunship') { p.tx = x; p.ty = y; return true; }
        return false;
      }),
      placeLair: safe(function (x, y, kind) {
        if (!inMap(x, y) || !WW.LAIRS[kind]) return null;
        const s = placeLair(sim, x, y, kind);
        if (!s) return null;
        const L = WW.LAIRS[kind];
        if (L.resident) { spawnResident(sim, s, L); s.spawnT = L.respawn; s.hatched = 1; }
        return s.id;
      }),
      spawnBandits: safe(function (x, y, n) {
        if (!inMap(x, y)) return 0;
        n = isNum(n) ? Math.max(1, Math.min(10, Math.floor(n))) : 3;
        let k = 0;
        for (let j = 0; j < n; j++) { const u = spawnBandit(sim, x + sim.rng.range(-1, 1), y + sim.rng.range(-1, 1), -1); if (u) { u.task = 'roam'; k++; } }
        return k;
      })
    };
  }

  // ---------------------------------------------------------------------------
  // Takt
  // ---------------------------------------------------------------------------
  function update(sim) {
    ensure(sim);
    const st = sim.state, tick = st.tick;
    if (tick % 20 === 9) updateScars(sim);
    if (WW.Powers.update) WW.Powers.update(sim);
    // Einheiten mit Wildnis-Aufgaben (gleiche Phase wie die Einheiten-KI)
    const units = st.units;
    for (let n = 0; n < units.length; n++) {
      const u = units[n];
      if (u.dead) continue;
      const ph = (tick + u.id) & 15;
      if ((ph & 7) !== 0) continue;
      if (u.role === 'bandit') banditThink(sim, u);
      else if (u.wMad !== undefined) madThink(sim, u);
      else if (u.wClear !== undefined) clearThink(sim, u);
      if (ph === 0 && !u.dead) {
        const i = Math.floor(u.y) * st.W + Math.floor(u.x);
        if (st.fallout[i] > 30 && !u.sick && sim.rng.chance(0.2)) {
          u.sick = true;
          const c = sim._cities.get(u.cityId);
          if (c) chron(sim, 'falloutSick', { city: c.name }, WW.Cities.atCity(c), c.id, WW.CONFIG.TPY * 2);
        }
      }
    }
    // Alarm (gestaffelt je Stadt)
    const S = CFG().ALARM_SCAN;
    for (const c of st.cities) if ((tick + c.id) % S === 0) cityAlarm(sim, c);
    if (tick % 30 === 17) updateLairs(sim);
  }
  function yearly(sim) {
    ensure(sim);
    const st = sim.state;
    yearlyLairs(sim);
    if (!st.wild.off) immigrate(sim);
    // heimatlose Räuber ziehen manchmal weiter
    for (const u of st.units) if (!u.dead && u.role === 'bandit' && u.wHome < 0 && sim.rng.chance(0.15)) WW.Units.kill(sim, u, 'gone');
    // alte Sperrfristen vergessen
    const w = st.wild;
    for (const k in w.lastEv) if (st.tick - w.lastEv[k] > WW.CONFIG.TPY * 5) delete w.lastEv[k];
  }

  WW.Wild = {
    defaults: defaults, ensure: ensure, addScar: addScar, RASTERS: RASTERS, bandOf: bandOf, terrainForBand: terrainForBand, terrainFromHeight: terrainFromHeight,
    setTerrain: setTerrain, setHeight: setHeight, finishTerrain: finishTerrain, plantTree: plantTree, capOf: capOf, habitat: habitat,
    chron: chron, cityNear: cityNear, scare: scare, sendSoldiers: sendSoldiers, placeLair: placeLair, lairsOf: lairsOf,
    spawnBandit: spawnBandit, makeMad: makeMad, populate: populate, immigrate: immigrate, grab: grab, drop: drop,
    actions: actions, update: update, yearly: yearly,
    onCreatureDeath: onCreatureDeath, onPreyKilled: onPreyKilled, onZombieBite: onZombieBite, onHaunt: onHaunt,
    hauntTarget: hauntTarget, onDemonFire: onDemonFire, onTrample: onTrample, onBossAttack: onBossAttack,
    onTreantAngry: onTreantAngry, dragonTarget: dragonTarget
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
