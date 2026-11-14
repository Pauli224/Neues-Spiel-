// Städte: Gründung, Gebiet, Lager, Wirtschaft, Wachstum, Berufe, Bauplanung, Tochterstädte, Verfall.
(function (WW) { 'use strict';

  const WORKERS = { farmer: 1, lumberjack: 1, miner: 1, builder: 1, soldier: 1 };
  const HOUSE_CAP = [3, 5, 8, 16, 28];   // Stufe 4/5: Wohnblöcke der Megastadt (megaHousing)
  // 16 Richtungen als feste Tabelle (kein sin/cos in der Simulation)
  const DIRS16 = [[1, 0], [0.924, 0.383], [0.707, 0.707], [0.383, 0.924], [0, 1], [-0.383, 0.924], [-0.707, 0.707], [-0.924, 0.383],
    [-1, 0], [-0.924, -0.383], [-0.707, -0.707], [-0.383, -0.924], [0, -1], [0.383, -0.924], [0.707, -0.707], [0.924, -0.383]];

  function gov(sim, city) {
    const k = sim._kingdoms.get(city.kingdomId);
    return WW.GOVERNMENTS[(k && k.gov) || 'tribe'];
  }
  function kingdomOf(sim, city) { return sim._kingdoms.get(city.kingdomId); }

  // Lager der Stadt (Kommunismus: gemeinsames Reichslager)
  function stock(sim, city) {
    const k = sim._kingdoms.get(city.kingdomId);
    if (k && WW.GOVERNMENTS[k.gov].sharedStock && k.stock) return k.stock;
    return city.stock;
  }
  function addStock(sim, city, res, amount) {
    const s = stock(sim, city);
    if (!(res in s) || !WW.SimUtil.isNum(amount)) return;
    s[res] = Math.min(stockCap(sim, city, res), Math.max(0, s[res] + amount));
  }
  // leeres Lager mit allen Rohstoffen (WW.RESOURCES)
  function emptyStock() { const s = {}; for (const r of WW.RESOURCE_KEYS) s[r] = 0; return s; }
  function fillStock(s) { if (s) for (const r of WW.RESOURCE_KEYS) if (typeof s[r] !== 'number') s[r] = 0; return s; }
  // Lagergrenze (verhindert absurde Vorräte; Gold unbegrenzt bis 9999)
  function stockCap(sim, city, res) {
    if (res === 'gold') return 9999;
    const k = sim._kingdoms.get(city.kingdomId);
    let pop = city.pop;
    if (k && k.stock && WW.GOVERNMENTS[k.gov].sharedStock) { pop = 0; for (const id of k.cityIds) { const c = sim._cities.get(id); if (c) pop += c.pop; } }
    return 300 + pop * 15;
  }
  function canPay(sim, city, cost) {
    const s = stock(sim, city);
    return s.wood >= cost.wood && s.stone >= cost.stone && s.gold >= cost.gold && s.food >= (cost.food || 0);
  }
  function pay(sim, city, cost) {
    if (!canPay(sim, city, cost)) return false;
    const s = stock(sim, city);
    s.wood -= cost.wood; s.stone -= cost.stone; s.gold -= cost.gold; s.food -= (cost.food || 0);
    return true;
  }

  // city.cx/cy = mittlere Kachel des Zentrums (Zentrum liegt bei cx - ox, cy - oy)
  function centerOff() { const i = WW.STRUCT_INFO.center; return { ox: (i.w - 1) >> 1, oy: (i.h - 1) >> 1, w: i.w, h: i.h }; }
  function centerPt(city) { return { x: city.cx + 0.5, y: city.cy + 0.5 }; }
  // eine Kachel der Zentrumsfläche (salt verteilt die Leute)
  function centerTile(sim, city, salt) {
    const W = sim.state.W, o = centerOff();
    const n = Math.abs(salt | 0) % (o.w * o.h);
    return (city.cy - o.oy + Math.floor(n / o.w)) * W + city.cx - o.ox + (n % o.w);
  }

  // Suchradius für Bauplätze = Reichweite der Landnahme (Fluren, siehe growth.js)
  function territoryRadius(city, sim) {
    if (sim && WW.Growth) return Math.max(9, Math.round(WW.Growth.reach(sim, city) + 2));
    return WW.CONFIG.TERRITORY_BASE + city.tier * 2;
  }

  // Gebiet in Fluren: Anfangsgebiet (weitere Fluren nimmt WW.Growth bei Bedarf)
  function claimTerritory(sim, city) { WW.Growth.claimInitial(sim, city); }
  function releaseTerritory(sim, city) { WW.Growth.releaseCity(sim, city); }

  // Neue Stadt mit fertigem Zentrum, (x, y) = mittlere Kachel des Zentrums
  function found(sim, x, y, kingdomId, race, name, culture) {
    const st = sim.state, W = st.W;
    const k = sim._kingdoms.get(kingdomId);
    if (!k) return null;
    const o = centerOff();
    if (x - o.ox < 1 || y - o.oy < 1 || x - o.ox + o.w >= st.W || y - o.oy + o.h >= st.H) return null;
    // Platz räumen (Felder, Ruinen, Hütten) inklusive Gasse
    for (let dy = -1; dy <= o.h; dy++) for (let dx = -1; dx <= o.w; dx++) {
      const s = sim._structs.get(st.structAt[(y - o.oy + dy) * W + x - o.ox + dx]);
      if (s) { if (s.type === 'field' || s.type === 'ruin' || s.type === 'lumber' || s.type === 'quarry') WW.Structs.remove(sim, s); else return null; }
    }
    race = race || k.race || 'human';
    // Kultur aus Volk + Gelände (oder vorgegeben), danach der Name in ihrem Stil
    const cul = WW.Culture.valid(culture) ? culture : WW.Culture.pick(sim, x, y, race);
    const city = {
      id: st.nextId++, name: name || WW.Names.place(cul, sim.rng, WW.TERRAIN[st.terrain[y * W + x]].key, sim._usedNames),
      kingdomId: kingdomId, race: race, culture: cul,
      cx: x, cy: y, centerId: -1, tier: 0, pop: 0, adults: 0, children: 0, housing: 4,
      stock: emptyStock(), happiness: 60,
      wall: WW.Walls.emptyWall(),
      founded: st.year, jobs: {}, sites: [], fields: [], drops: [], houses: 0,
      hasBarracks: false, hasMarket: false, hasMonument: false,
      hungry: false, starve: 0, unhappyYears: 0, lastSettlers: st.year, blessUntil: 0,
      noSpace: false, empty: 0, centerOk: true, centerLost: 0, revolt: false, propaganda: 0, sick: 0,
      loyalty: 80, joinedYear: st.year, flurs: 0, needLand: false, governor: null,
      occupied: null, garrison: 0, garrisonWant: 0, garrisonSet: null   // 9.10
    };
    sim._usedNames.add(city.name);
    WW.Culture.setCity(sim, city, cul);
    city.kind = 'town';   // [industry] 'town' | 'camp' (Lagerstadt, js/sim/camps.js)
    st.cities.push(city);
    sim._cities.set(city.id, city);
    const c = WW.Structs.create(sim, 'center', x - o.ox, y - o.oy, city.id, { built: true, style: k.gov, stage: 0 });
    city.centerId = c ? c.id : -1;
    k.cityIds.push(city.id);
    if (k.capitalId < 0) k.capitalId = city.id;
    claimTerritory(sim, city);
    WW.Growth.makeGovernor(sim, city);
    refreshLists(sim, city);
    return city;
  }

  // Kann hier ein Zentrum stehen? (x, y) = Mitte; minDist = Mindestabstand zu anderen Städten
  // ownKingdom: Land von Städten dieses Reichs darf überbaut werden (Tochterstadt auf eigenem Reichsland)
  function canFoundAt(sim, x, y, race, minDist, ownKingdom) {
    const st = sim.state, W = st.W, H = st.H;
    const o = centerOff();
    const x0 = x - o.ox, y0 = y - o.oy;
    if (x0 < 2 || y0 < 2 || x0 + o.w + 2 > W || y0 + o.h + 2 > H) return false;
    const md = minDist == null ? WW.CONFIG.CITY_MIN_DIST : minDist;
    for (const c of st.cities) {
      const dx = c.cx - x, dy = c.cy - y;
      if (dx * dx + dy * dy < md * md) return false;
    }
    for (let dy = -1; dy <= o.h; dy++) for (let dx = -1; dx <= o.w; dx++) {
      const i = (y0 + dy) * W + x0 + dx;
      if (st.inRing[i] !== -1) return false;
      if (st.owner[i] !== -1) { const oc = ownKingdom == null ? null : sim._cities.get(st.owner[i]); if (!oc || oc.kingdomId !== ownKingdom) return false; }
      const s = sim._structs.get(st.structAt[i]);
      if (s && s.type !== 'ruin' && s.type !== 'field') return false;
      if (dx < 0 || dy < 0 || dx >= o.w || dy >= o.h) continue;
      if (!WW.Structs.terrainBuildable(sim, i, race)) return false;
    }
    return true;
  }

  // Listen der Stadt aus den Bauwerken (Baustellen, Felder, Abladestellen, Wohnraum)
  function refreshAllLists(sim) {
    const st = sim.state;
    for (const c of st.cities) {
      c.sites = []; c.fields = []; c.drops = []; c._houses = 0; c._bh = 0; c._cap = 0; c._barr = false; c._mark = false; c._mon = false; c._center = null;
    }
    for (const s of st.structs) {
      if (s.dead || s.cityId < 0) continue;
      const c = sim._cities.get(s.cityId);
      if (!c) continue;
      tallyStruct(sim, c, s);
    }
    for (const c of st.cities) finishLists(sim, c);
  }
  function tallyStruct(sim, c, s) {
    if (WW.Structs.needsWork(s)) c.sites.push(s.id);
    if (s.type === 'field') c.fields.push(s.id);
    else if ((s.type === 'lumber' || s.type === 'quarry') && s.built) c.drops.push(s.id);
    else if (s.type === 'house') {
      c._houses++;
      if (s.built) c._bh++;
      if (s.built) c._cap += (s.level === 0 ? WW.STRUCT_INFO.house.tent.cap : HOUSE_CAP[Math.max(0, Math.min(4, s.level - 1))]) + (WW.RACES[c.race] || WW.RACES.human).housingBonus;
    } else if (s.type === 'barracks') c._barr = true;
    else if (s.type === 'market') { c._mark = true; if (s.built) c._markets = (c._markets || 0) + 1; }
    else if (s.type === 'monument') c._mon = true;
    else if (s.type === 'center') c._center = s;
  }
  function finishLists(sim, c) {
    c.houses = c._houses; c.builtHouses = c._bh;
    c.hasBarracks = c._barr; c.hasMarket = c._mark; c.hasMonument = c._mon; c.markets = c._markets || 0; delete c._markets;
    const ctr = c._center;
    c.centerId = ctr ? ctr.id : -1;
    c.centerOk = !!(ctr && ctr.built);
    c.housing = (c.centerOk ? 4 : 1) + c._cap;
    delete c._houses; delete c._bh; delete c._cap; delete c._barr; delete c._mark; delete c._mon; delete c._center;
  }
  function refreshLists(sim, city) {
    city.sites = []; city.fields = []; city.drops = []; city._houses = 0; city._bh = 0; city._cap = 0;
    city._barr = false; city._mark = false; city._mon = false; city._center = null;
    for (const s of sim.state.structs) if (!s.dead && s.cityId === city.id) tallyStruct(sim, city, s);
    finishLists(sim, city);
  }

  // Zählung der Bewohner je Stadt, Arbeiter je Baustelle
  function stats(sim) {
    const st = sim.state;
    for (const c of st.cities) {
      c.pop = 0; c.adults = 0; c.children = 0; c.sick = 0; c.jobs = {}; c._members = []; c._rebels = 0; c._soldiers = 0;
    }
    for (const s of st.structs) s.workers = 0;
    for (const u of st.units) {
      if (u.dead) continue;
      if (u.target >= 0 && (u.role === 'builder' || u.role === 'farmer')) {
        const s = sim._structs.get(u.target);
        if (s) s.workers++;
      }
      const c = sim._cities.get(u.cityId);
      if (!c) continue;
      if (u.role === 'settler') continue;
      c.pop++;
      if (u.role === 'child') c.children++; else c.adults++;
      if (u.sick) c.sick++;
      c.jobs[u.role] = (c.jobs[u.role] || 0) + 1;
      if (u.role === 'rebel') c._rebels++;
      if (u.role === 'soldier') c._soldiers++;
      c._members.push(u);
    }
  }

  // Wunschverteilung der Berufe und behutsames Umverteilen
  function assignJobs(sim, city) {
    const g = gov(sim, city);
    const k = kingdomOf(sim, city);
    const race = WW.RACES[city.race] || WW.RACES.human;
    const workers = city._members.filter(u => WORKERS[u.role] && !u.merc && !u.order && !u.garrison);   // Garnison arbeitet nicht
    const n = workers.length;
    if (!n) return;
    const st = stock(sim, city);
    const want = { farmer: 0, lumberjack: 0, miner: 0, builder: 0, soldier: 0 };
    const atWar = k && WW.Diplo.atWar(sim, k.id);
    let soldierShare = WW.SimUtil.mod(sim, k, city, 'soldiers', g.soldierShare);
    if (k && k.policy && k.policy.bonus === 'safety') soldierShare += 0.06;
    if (atWar) soldierShare = g.war === 'mass' ? Math.min(0.55, soldierShare * 2) : soldierShare * 1.6 + (g.soldierShare > 0 ? 0.06 : 0);
    if (city._rebels > 0 && g.soldierShare > 0) soldierShare += 0.1;
    // Garnisonssoldaten (9.10) zählen zum Soldatenanteil, arbeiten aber nicht mit
    let garr = 0;
    for (const u of city._members) if (u.garrison != null && u.role === 'soldier') garr++;
    want.soldier = n >= 4 ? Math.max(0, Math.round((n + garr) * Math.min(0.55, soldierShare)) - garr) : 0;
    if (g.soldierShare > 0 && n >= 6 && want.soldier < 1 && !garr) want.soldier = 1;
    const sites = city.sites.length;
    // offener Materialbedarf der Baustellen
    let needWood = 0, needStone = 0;
    for (const id of city.sites) {
      const s = sim._structs.get(id);
      if (!s || s.paid) continue;
      const c = WW.Structs.siteCost(sim, s, city.id);
      needWood += c.wood; needStone += c.stone;
    }
    needWood = Math.max(0, needWood - st.wood);
    needStone = Math.max(0, needStone - st.stone);
    if (sites > 0) {
      want.builder = Math.max(1, Math.min(Math.ceil(sites / 5) + 1, Math.floor(n * 0.4)));
      if (sites >= 8 && n >= 5) want.builder = Math.max(want.builder, 2);
    }
    // Nahrung
    const need = city.pop * WW.CONFIG.FOOD_PER_YEAR;
    const perFarmer = 11 * race.yields.food * g.workMul;
    let farmers = Math.ceil(need / perFarmer * 1.1);
    if (st.food < city.pop * 1.5) farmers += 1;
    if (st.food < city.pop * 0.5) farmers += 1;
    if (st.food > city.pop * 4 + 30) farmers -= 1;
    if (st.food > city.pop * 8 + 60) farmers -= 1;
    const plan = k && k.policy && k.policy.plan;
    if (plan && plan.focus === 'food') farmers += 1;
    // reife Felder, die niemand erntet, brauchen mehr Hände
    let ripe = 0;
    for (const id of city.fields) { const f = sim._structs.get(id); if (f && f.growth >= 3) ripe++; }
    if (st.food < city.pop * 3 && ripe > 2) farmers = Math.max(farmers, Math.ceil(ripe / 2));
    want.farmer = Math.max(1, farmers);
    // Stein: nach Bedarf (Baustellen, Mauerausbau, Hausausbau)
    if (city.hasStone && n >= 5) {
      const wantsStone = (city.wall.level >= 1 && g.wallMax >= 2 && !g.barricades) || city.tier >= 2;
      let m = needStone > 0 ? Math.ceil(needStone / 25) : 0;
      if (wantsStone && st.stone < 60) m = Math.max(m, 1 + (n >= 14 ? 1 : 0));
      if (plan && plan.focus === 'stone') m += 1;
      want.miner = Math.min(m, Math.ceil(n * 0.18));
    }
    // Holz: Mindestens einer, mehr bei Bedarf
    if (city.hasWood) {
      let l = 1 + Math.ceil(needWood / 20);
      if (st.wood < 15) l++;
      if (st.wood > 120) l = 1;
      if (plan && plan.focus === 'wood') l += 1;
      want.lumberjack = Math.min(l, Math.ceil(n * 0.45));
    }
    let rest = n - want.soldier - want.builder - want.farmer - want.miner - want.lumberjack;
    if (rest < 0) {
      // Kürzung: erst Steinmetze, dann Holzfäller bis auf einen, Baumeister bis auf einen, Soldaten, Bauern
      const minSold = Math.floor(want.soldier * (g.war === 'mass' ? 0.8 : 0.3));
      const order = [['miner', 0], ['builder', sites >= 8 && n >= 5 ? 2 : (sites ? 1 : 0)], ['soldier', minSold], ['lumberjack', 1], ['builder', sites ? 1 : 0], ['lumberjack', 0], ['farmer', 1], ['soldier', 0]];
      for (const o of order) { while (rest < 0 && want[o[0]] > o[1]) { want[o[0]]--; rest++; } }
    }
    // Überschuss: Holz, wenn knapp, sonst Felder; Kommunismus mit Plan-Schwerpunkt
    while (rest > 0) {
      if (city.hasWood && (st.wood < 80 || needWood > 0)) want.lumberjack++;
      else if (city.hasStone && st.stone < 40 && n >= 8) want.miner++;
      else want.farmer++;
      rest--;
    }
    // Umverteilen: höchstens drei Wechsel pro Runde
    const have = { farmer: 0, lumberjack: 0, miner: 0, builder: 0, soldier: 0 };
    for (const u of workers) have[u.role]++;
    let changes = 0;
    const roles = ['builder', 'soldier', 'farmer', 'miner', 'lumberjack'];
    for (const r of roles) {
      while (have[r] < want[r] && changes < 3) {
        // Spender: Rolle mit dem größten Überschuss
        let donor = null, surplus = 0;
        for (const d of roles) { const sp = have[d] - want[d]; if (d !== r && sp > surplus) { surplus = sp; donor = d; } }
        if (!donor) break;
        let pick = null;
        for (const u of workers) if (u.role === donor && !u.carrying) { pick = u; break; }
        if (!pick) for (const u of workers) if (u.role === donor) { pick = u; break; }
        if (!pick) break;
        WW.Units.setRole(sim, pick, r);
        have[donor]--; have[r]++; changes++;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Platzsuche. Jedes Gebäude (außer Feldern untereinander) hält eine Gasse von
  // mindestens einer freien Kachel zu allen anderen Bauwerken und zur Mauer.
  // --------------------------------------------------------------------------
  function sAt(sim, i) { return sim._structs.get(sim.state.structAt[i]); }

  // Grundfläche (x, y, w, h) prüfen. o = { area: fn(i) -> bool für Fläche+Gasse, fieldOk, race, cityId }
  // Rückgabe: Anzahl Kerngebäude, die direkt an die Gasse grenzen (für dichtes Packen), oder -1
  function footprintOk(sim, x, y, w, h, o) {
    const st = sim.state, W = st.W, H = st.H;
    if (x < 1 || y < 1 || x + w + 1 > W || y + h + 1 > H) return -1;
    for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) {
      const i = (y + dy) * W + x + dx;
      const inner = dx >= 0 && dy >= 0 && dx < w && dy < h;
      if (!o.area(i, inner)) return -1;
      const sid = st.structAt[i];
      if (sid !== -1) {
        const s = sim._structs.get(sid);
        if (!s) return -1;
        // eigene Felder und Ruinen dürfen weichen
        if (!((s.type === 'field' && o.fieldOk && s.cityId === o.cityId) || s.type === 'ruin')) return -1;
      }
      if (inner && !WW.Structs.terrainBuildable(sim, i, o.race)) return -1;
      if (!inner && WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0 && o.needWalkBorder) return -1;
    }
    // Nachbarschaft im Abstand 2 zählen (Gasse genau eine Kachel breit = schönes Raster)
    let n = 0;
    for (let dy = -2; dy <= h + 1; dy++) for (let dx = -2; dx <= w + 1; dx++) {
      if (dx > -2 && dy > -2 && dx < w + 1 && dy < h + 1) continue;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const s = sAt(sim, yy * W + xx);
      if (s && WW.STRUCT_INFO[s.type] && WW.STRUCT_INFO[s.type].core && s.cityId === o.cityId) n++;
    }
    return n;
  }

  // Bereich räumen (Felder/Ruinen auf Fläche und Gasse) und Bauwerk anlegen
  function placeStruct(sim, city, type, x, y, opt) {
    const st = sim.state, W = st.W;
    const inf = WW.STRUCT_INFO[type];
    for (let dy = -1; dy <= inf.h; dy++) for (let dx = -1; dx <= inf.w; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= st.H) continue;
      const s = sAt(sim, yy * W + xx);
      if (s && (s.type === 'ruin' || (s.type === 'field' && s.cityId === city.id))) WW.Structs.remove(sim, s);
    }
    const s = WW.Structs.create(sim, type, x, y, city.id, opt || {});
    if (s) {
      for (let dy = 0; dy < inf.h; dy++) for (let dx = 0; dx < inf.w; dx++) {
        const i = (y + dy) * W + x + dx;
        if (st.owner[i] === -1) { st.owner[i] = city.id; sim.markDirty(i); }
      }
    }
    return s;
  }

  // Bauplatz für Kerngebäude (Häuser, Kaserne, Markt, Denkmal): innen bzw. dicht am Bestand
  function findCoreSpot(sim, city, type) {
    const st = sim.state, W = st.W;
    const inf = WW.STRUCT_INFO[type || 'house'];
    const w = inf.w, h = inf.h;
    const ringed = !!(city.wall.plan && city.wall.state !== 'none');
    // Megastadt (9.10): ist der Ring voll, entstehen Wohnblöcke auch in Vorstädten vor der Mauer
    const suburb = ringed && type === 'house' && city.noSpace && city.tier >= 3 && !!gov(sim, city).megaHousing;
    const r = Math.min(suburb ? 34 : 26, territoryRadius(city, sim));
    const px = city.cx + 0.5, py = city.cy + 0.5;
    const owner = st.owner, inRing = st.inRing, id = city.id;
    const area = suburb
      ? (i) => inRing[i] === id || (owner[i] === id && inRing[i] === -1 && !(sAt(sim, i) && WW.Structs.isWallish(sAt(sim, i))))
      : ringed
      ? (i) => inRing[i] === id
      : (i) => owner[i] === id && inRing[i] === -1 && !(sAt(sim, i) && WW.Structs.isWallish(sAt(sim, i)));
    const o = { area: area, fieldOk: !suburb, race: city.race, cityId: id, needWalkBorder: true };
    let best = -1, bs = -1e9;
    const x0 = Math.max(1, Math.floor(px - r)), x1 = Math.min(W - 2 - w, Math.ceil(px + r));
    const y0 = Math.max(1, Math.floor(py - r)), y1 = Math.min(st.H - 2 - h, Math.ceil(py + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const mx = x + w / 2, my = y + h / 2;
      const d = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
      if (d > r - 1) continue;
      const nb = footprintOk(sim, x, y, w, h, o);
      if (nb < 0) continue;
      // ohne Mauer: dicht am Bestand bleiben
      if (!ringed && nb === 0) continue;
      if (suburb && inRing[y * W + x] !== id && nb === 0) {   // Vorstadt wächst am Bestand oder an der Mauer entlang
        let nearRing = false;
        for (let dy = -4; dy <= h + 3 && !nearRing; dy++) for (let dx = -4; dx <= w + 3; dx++) { const yy = y + dy, xx = x + dx; if (xx >= 0 && yy >= 0 && xx < W && yy < st.H && inRing[yy * W + xx] === id) { nearRing = true; break; } }
        if (!nearRing) continue;
      }
      let score = -d + nb * 0.9 + sim._hashNoise(y * W + x) * 0.6;
      if (WW.TERRAIN_LUT.wood[st.terrain[y * W + x]]) score -= 0.8;
      if (score > bs) { bs = score; best = y * W + x; }
    }
    return best;
  }

  // Feldplatz: fruchtbar, außerhalb der (künftigen) Mauer; Felder dürfen aneinander grenzen
  function findFieldSpot(sim, city) {
    const i = findFieldSpotMin(sim, city, 0.55);
    return i >= 0 ? i : findFieldSpotMin(sim, city, 0.15);
  }
  function findFieldSpotMin(sim, city, minFert) {
    const st = sim.state, W = st.W, H = st.H;
    const r = Math.min(26, territoryRadius(city, sim) + 1);
    const px = city.cx + 0.5, py = city.cy + 0.5;
    const ringed = !!city.wall.plan;
    const minD = ringed ? 0 : WW.CONFIG.WALL_RESERVE + WW.CONFIG.WALL_MARGIN + 1.2;
    const irr = !!WW.Culture.info(city.culture).irrigation;   // sahel/nil: Bewässerung im Sand
    let best = -1, bs = -1e9;
    for (let y = Math.max(1, Math.floor(py - r)); y <= Math.min(H - 2, Math.ceil(py + r)); y++) {
      for (let x = Math.max(1, Math.floor(px - r)); x <= Math.min(W - 2, Math.ceil(px + r)); x++) {
        const i = y * W + x;
        // eigenes Land oder herrenloses Land direkt am Rand (das Feld nimmt die Flur dann in Besitz)
        if (st.owner[i] !== city.id && !(st.owner[i] === -1 && WW.Growth.claimableAt(sim, city, x, y))) continue;
        if (st.structAt[i] !== -1 || st.inRing[i] !== -1) continue;
        const t = st.terrain[i];
        const fert = irr ? WW.Culture.fieldFert(sim, city, i) : WW.TERRAIN_LUT.fertile[t];
        if (fert < minFert || !WW.Structs.terrainBuildable(sim, i, city.race)) continue;
        if (WW.TERRAIN_LUT.wood[t] && fert < 0.75) continue;
        const d = Math.sqrt((x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py));
        if (d < minD) continue;
        // Gasse zu allem, was kein Feld ist; nicht direkt an Mauer oder Innenfläche
        let bad = false, fieldN = 0;
        for (let dy = -1; dy <= 1 && !bad; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const j = (y + dy) * W + x + dx;
          if (st.inRing[j] !== -1) { bad = true; break; }
          const s = sAt(sim, j);
          if (!s) continue;
          if (s.type === 'field') fieldN++; else { bad = true; break; }
        }
        if (bad) continue;
        // vor der Mauer: Abstand zu Kerngebäuden halten, damit der Ring Platz hat
        if (!ringed) {
          let near = false;
          for (let dy = -3; dy <= 3 && !near; dy++) for (let dx = -3; dx <= 3; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const s = sAt(sim, yy * W + xx);
            if (s && s.cityId === city.id && WW.STRUCT_INFO[s.type].core) { near = true; break; }
          }
          if (near) continue;
        }
        const score = -d + fert * 5 + fieldN * 0.7 + sim._hashNoise(i) * 0.5;
        if (score > bs) { bs = score; best = i; }
      }
    }
    return best;
  }

  // Platz für Holzfällerhütte/Steinbruch nahe am Rohstoff, außerhalb der Mauer
  function findDropSpot(sim, city, res, type) {
    const st = sim.state, W = st.W, H = st.H;
    const inf = WW.STRUCT_INFO[type];
    const r = Math.min(24, territoryRadius(city, sim) + 3);
    const px = city.cx + 0.5, py = city.cy + 0.5;
    const LUT = WW.TERRAIN_LUT;
    const owner = st.owner, inRing = st.inRing, id = city.id;
    const o = {
      area: (i, inner) => (owner[i] === id || (!inner && owner[i] === -1)) && inRing[i] === -1 && !(inner && LUT[res][st.terrain[i]]),
      fieldOk: false, race: city.race, cityId: id, needWalkBorder: false
    };
    const minD = (city.wall.plan ? 0 : WW.CONFIG.WALL_RESERVE) + WW.CONFIG.WALL_MARGIN + 2;
    let best = -1, bs = -1e9;
    for (let y = Math.max(1, Math.floor(py - r)); y <= Math.min(H - 2 - inf.h, Math.ceil(py + r)); y++) {
      for (let x = Math.max(1, Math.floor(px - r)); x <= Math.min(W - 2 - inf.w, Math.ceil(px + r)); x++) {
        const mx = x + inf.w / 2, my = y + inf.h / 2;
        const d = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
        if (d < minD || d > r) continue;
        // Rohstoff im Umkreis zählen (billig, vor der genauen Prüfung)
        let n = 0;
        for (let dy = -2; dy <= inf.h + 1; dy++) for (let dx = -2; dx <= inf.w + 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (LUT[res][st.terrain[yy * W + xx]]) n++;
        }
        if (n < 4) continue;
        // Abstand zu Kerngebäuden (Ring-Puffer)
        let near = false;
        for (let dy = -3; dy <= inf.h + 2 && !near; dy++) for (let dx = -3; dx <= inf.w + 2; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const s = sAt(sim, yy * W + xx);
          if (s && (WW.Structs.isWallish(s) || (s.cityId === id && WW.STRUCT_INFO[s.type].core))) { near = true; break; }
        }
        if (near) continue;
        if (footprintOk(sim, x, y, inf.w, inf.h, o) < 0) continue;
        const score = Math.min(n, 14) * 0.5 - d * 0.6 + sim._hashNoise(y * W + x) * 0.3;
        if (score > bs) { bs = score; best = y * W + x; }
      }
    }
    return best;
  }

  function countSites(sim, city, filterWall) {
    let n = 0;
    for (const id of city.sites) {
      const s = sim._structs.get(id);
      if (!s) continue;
      if (filterWall && WW.Structs.isWallish(s)) continue;
      if (filterWall && s.built && s.restyle && !s.upgradeTo) continue;
      if (filterWall && (s.type === 'rail' || s.type === 'station')) continue;   // Bahnbau zählt nicht gegen die Stadtplanung
      n++;
    }
    return n;
  }

  // Bauplanung (alle 3 s)
  function planBuildings(sim, city) {
    const st = sim.state, W = st.W;
    const g = gov(sim, city);
    const sk = stock(sim, city);
    const k = kingdomOf(sim, city);
    // Zentrum fehlt ganz -> neue Baustelle
    if (city.centerId < 0) {
      const o = centerOff();
      if (canFoundAtOwn(sim, city, city.cx - o.ox, city.cy - o.oy)) {
        const s = WW.Structs.create(sim, 'center', city.cx - o.ox, city.cy - o.oy, city.id, { built: false, style: k ? k.gov : 'tribe', stage: 0 });
        if (s) { city.centerId = s.id; city.sites.push(s.id); }
      }
      return;
    }
    if (!city.centerOk) return;
    // Zentrum ausbauen: Lager -> Dorfhalle (ab Dorf) -> Regierungssitz (ab Stadt)
    const ctr0 = sim._structs.get(city.centerId);
    if (ctr0 && ctr0.built && !ctr0.upgrading && !ctr0.restyle && (ctr0.stage || 0) < 2) {
      const need = WW.STRUCT_INFO.center.stageTier[ctr0.stage || 0];
      if (city.tier >= need && st.year - city.founded >= WW.STRUCT_INFO.center.stageMinYears[ctr0.stage || 0]) {
        ctr0.upgrading = true; ctr0.progress = 0; ctr0.paid = false;
        city.sites.push(ctr0.id);
        sim.event((ctr0.stage || 0) === 0 ? 'hallStart' : 'seatStart', { city: city.name }, atCity(city));
      }
    }
    const ctrStage = ctr0 ? (ctr0.stage || 0) : 0;
    // hängende Ausbauten (seit Jahren unbezahlt) aufgeben
    for (const id of city.sites) {
      const o = sim._structs.get(id);
      if (o && o.type === 'house' && o.upgradeTo && !o.paid && o.built && st.year - (o.siteYear == null ? st.year : o.siteYear) >= 4) { o.upgradeTo = 0; o.progress = 1; o.towerOnUpgrade = false; }
    }
    const open = countSites(sim, city, true);
    const maxOpen = 2 + city.tier;
    // Häuser
    const houseCap = 2 + Math.floor((city.flurs || 1) * (g.housesPerFlur || WW.CONFIG.HOUSES_PER_FLUR));
    // Megastadt (9.10): dicht bauen – zuerst aufstocken (Wohnblöcke), dann neu bauen
    if (g.megaHousing && city.tier >= 3 && open < maxOpen && city.pop + 4 >= city.housing && sim.rng.chance(0.6)) upgradeHouse(sim, city, sk);
    if (open < maxOpen && city.pop + 2 >= city.housing && city.houses >= houseCap) {
      // wer wachsen will, muss Land nehmen; bis dahin Häuser aufstocken
      city.needLand = true;
      // kein Land mehr zu holen: dann wird die Mauer erweitert (die neue Ringfläche bringt Fluren mit)
      if (city.landFull && city.wall.plan) city.noSpace = true;
      upgradeHouse(sim, city, sk);
    } else if (open < maxOpen && city.pop + 2 >= city.housing && st.units.length < WW.CONFIG.MAX_UNITS) {
      const cost = WW.Structs.costFor(sim, 'house', 1, city.id);
      if (sk.wood >= cost.wood || open === 0) {
        const i = findCoreSpot(sim, city, 'house');
        if (i >= 0) {
          // im Lager entstehen Zelte (Haus-Stufe 0), ab Dorfhalle richtige Häuser
          const s = placeStruct(sim, city, 'house', i % W, Math.floor(i / W), { built: false, level: ctrStage === 0 ? 0 : 1 });
          if (s) { city.sites.push(s.id); city.houses++; }
          city.noSpace = false;
        } else {
          if (city.wall.plan) city.noSpace = true; else city.needLand = true;
          // Platz schaffen: Häuser aufstocken
          upgradeHouse(sim, city, sk);
        }
      }
    } else if (city.tier >= 1 && city.pop + 1 >= city.housing && sk.stone >= 8 && open < maxOpen) {
      upgradeHouse(sim, city, sk);
    } else if (ctrStage >= 1 && open < maxOpen && sim.rng.chance(0.3)) {
      // Zelte nach und nach zu Hütten aufwerten
      let tent = null;
      for (const s of st.structs) if (!s.dead && s.cityId === city.id && s.type === 'house' && s.built && s.level === 0 && !s.upgradeTo) { tent = s; break; }
      if (tent) upgradeHouse(sim, city, sk);
    }
    // Felder
    const plan = k && k.policy && k.policy.plan;
    let fsum = 0;
    for (const id of city.fields) { const f = sim._structs.get(id); if (f) fsum += Math.max(0.2, WW.Culture.fieldFert(sim, city, f.y * W + f.x)); }
    const avgF = city.fields.length ? fsum / city.fields.length : 1;
    const wantFields = Math.max(2, Math.ceil(city.pop / 2.3 / Math.max(0.4, avgF))) + (plan && plan.focus === 'food' ? 2 : 0);
    if (city.fields.length < wantFields) {
      const i = findFieldSpot(sim, city);
      if (i >= 0) {
        const s = WW.Structs.create(sim, 'field', i % W, Math.floor(i / W), city.id, { built: true });
        if (s && WW.TERRAIN_LUT.fertile[st.terrain[i]] < 0.6 && WW.Culture.irrigable(sim, city, i)) {
          s.irrigated = true;   // Bewässerungsfeld (Darstellung: Gräben)
          if (!city.irrigated) { city.irrigated = true; sim.event('irrigation', { city: city.name }, atCity(city)); }
        }
        if (s) {
          city.fields.push(s.id);
          if (st.owner[i] === -1) { WW.Growth.setFlur(sim, WW.Growth.flurAt(st, i % W, Math.floor(i / W)), city.id); city.flurs = (city.flurs || 0) + 1; }
        }
      } else city.needLand = true;
    }
    if (open >= maxOpen) return;
    // Holzfällerhütte / Steinbruch
    let hasLumber = false, hasQuarry = false;
    for (const id of city.drops) { const s = sim._structs.get(id); if (s && s.type === 'lumber') hasLumber = true; if (s && s.type === 'quarry') hasQuarry = true; }
    for (const id of city.sites) { const s = sim._structs.get(id); if (s && s.type === 'lumber') hasLumber = true; if (s && s.type === 'quarry') hasQuarry = true; }
    const dropTry = !(city.dropTry > st.tick);
    if (!hasLumber && dropTry && (city.jobs.lumberjack || 0) >= 2 && sk.wood >= 4 && city.pop >= 7 && sim.rng.chance(0.5)) {
      city.dropTry = st.tick + 150;   // teure Platzsuche höchstens alle 15 s
      const i = findDropSpot(sim, city, 'wood', 'lumber');
      if (i < 0) city.needLand = true;
      if (i >= 0) { const s = placeStruct(sim, city, 'lumber', i % W, Math.floor(i / W), {}); if (s) { city.sites.push(s.id); return; } }
    }
    if (!hasQuarry && dropTry && (city.jobs.miner || 0) >= 1 && sk.wood >= 4 && city.pop >= 10 && sim.rng.chance(0.5)) {
      city.dropTry = st.tick + 150;
      const i = findDropSpot(sim, city, 'stone', 'quarry');
      if (i < 0) city.needLand = true;
      if (i >= 0) { const s = placeStruct(sim, city, 'quarry', i % W, Math.floor(i / W), {}); if (s) { city.sites.push(s.id); return; } }
    }
    // Kaserne, Markt, Denkmal: Bauprogramm der Regierung (WW.GOVERNMENTS[gov].build)
    const have = { barracks: 0, market: 0, monument: 0 };
    for (const s of st.structs) if (!s.dead && s.cityId === city.id && s.type in have) have[s.type]++;
    const gk = g.key;
    const order = gk === 'fascism' ? ['barracks', 'monument', 'market'] : gk === 'theocracy' ? ['monument', 'market', 'barracks']
      : gk === 'republic' || gk === 'democracy' ? ['market', 'monument', 'barracks'] : ['barracks', 'market', 'monument'];
    for (const type of order) {
      if (type === 'market' && g.noMarket) continue;
      if (have[type] >= WW.govBuildCount(gk, type, city.pop)) continue;
      const cost = WW.Structs.costFor(sim, type, 1, city.id);
      if (!canPay(sim, city, cost)) continue;
      const i = findCoreSpot(sim, city, type);
      if (i < 0) { if (city.wall.plan) city.noSpace = true; break; }
      const s = placeStruct(sim, city, type, i % W, Math.floor(i / W), { style: gk });
      if (s) {
        city.sites.push(s.id);
        if (type === 'monument') sim.event(gk === 'theocracy' && have.monument > 0 ? 'shrine' : 'monument', { city: city.name, monument: g.monumentName, deity: (k && k.deity) || '' }, atCity(city));
        if (type === 'barracks') { city.hasBarracks = true; if (have.barracks > 0) sim.event('barracks', { city: city.name, n: have.barracks + 1 }, atCity(city)); }
        if (type === 'market') { city.hasMarket = true; if (have.market > 0) sim.event('market', { city: city.name, n: have.market + 1 }, atCity(city)); }
        if (type === 'monument') city.hasMonument = true;
      }
      break;
    }
  }

  // Megastadt (9.10): stehen Vorstädte vor der Mauer, wird der Ring rechtzeitig erweitert (vor weiteren Mauerstufen),
  // sodass ein großer Ring Kern und Vorstädte umschließt. Nutzt WW.Walls.plan (expanding); scheitert es (Nachbar zu nah),
  // bleibt es bei Vorstädten (wall.maxed).
  function megaRing(sim, city) {
    const w = city.wall, st = sim.state;
    if (!w.plan || (w.state !== 'done' && w.state !== 'upgrading') || w.maxed || !city.noSpace || city.tier < 3 || !gov(sim, city).megaHousing) return;   // Erweiterung geht vor weiteren Mauerstufen
    if (st.year - (w.plannedYear || 0) < 3) return;
    let out = 0;
    for (const s of st.structs) if (!s.dead && s.cityId === city.id && s.type === 'house' && st.inRing[s.y * st.W + s.x] !== city.id) out++;
    if (out < 3) return;
    const before = w.plan.length;
    if (!WW.Walls.plan(sim, city, WW.CONFIG.WALL_MARGIN, Math.max(1, w.level), true)) { w.plannedYear = st.year; w.maxed = true; return; }   // [walls]
    if (w.plan.length > before) sim.event('wallExpand', { city: city.name, kingdom: (sim._kingdoms.get(city.kingdomId) || {}).name || '' }, atCity(city));
  }

  function upgradeHouse(sim, city, sk) {
    const megaOk = !!gov(sim, city).megaHousing;
    const ctr = sim._structs.get(city.centerId);
    const stage = ctr ? (ctr.stage || 0) : 0;
    let best = null;
    for (const s of sim.state.structs) {
      if (s.dead || s.cityId !== city.id || s.type !== 'house' || !s.built || s.upgradeTo) continue;
      if (s.level >= 3 && !(megaOk && (s.level === 3 ? city.tier >= 3 : (s.level === 4 && city.tier >= 4)))) continue;   // Wohnblöcke ab Großstadt/Metropole
      if (s.level === 0 && stage < 1) continue;          // Zelte erst mit der Dorfhalle aufwerten
      if (s.level >= 1 && city.tier < 1) continue;
      if (s.level === 2 && city.tier < 2) continue;
      if (!best || s.level < best.level) best = s;
    }
    if (!best) return false;
    const cost = WW.Structs.costFor(sim, 'house', best.level + 1, city.id);
    if (!canPay(sim, city, cost)) return false;
    // nicht mehrere Ausbauten gleichzeitig beginnen, die das Lager nicht trägt
    let unpaid = 0;
    for (const id of city.sites) { const o = sim._structs.get(id); if (o && o.type === 'house' && o.upgradeTo && !o.paid) unpaid++; }
    if (unpaid >= (megaOk && city.tier >= 3 ? 3 : 1)) return false;
    best.upgradeTo = best.level + 1; best.progress = 0; best.paid = false; best.siteYear = sim.state.year;
    city.sites.push(best.id);
    return true;
  }

  // Zentrums-Fläche (x, y = linke obere Ecke) für den Wiederaufbau räumen
  function canFoundAtOwn(sim, city, x, y) {
    const st = sim.state, W = st.W;
    const o = centerOff();
    if (x < 0 || y < 0 || x + o.w > W || y + o.h > st.H) return false;
    for (let dy = 0; dy < o.h; dy++) for (let dx = 0; dx < o.w; dx++) {
      const i = (y + dy) * W + x + dx;
      if (WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0) return false;
      const s = sAt(sim, i);
      if (s && !(s.type === 'ruin' || s.type === 'field' || (s.cityId === city.id && !WW.Structs.isWallish(s) && s.type !== 'center'))) return false;
    }
    for (let dy = 0; dy < o.h; dy++) for (let dx = 0; dx < o.w; dx++) {
      const s = sAt(sim, (y + dy) * W + x + dx);
      if (s) WW.Structs.remove(sim, s);
    }
    return true;
  }

  function atCity(city) { return { kingdomId: city.kingdomId, cityId: city.id, x: city.cx + 0.5, y: city.cy + 0.5 }; }

  // Happiness-Ziel
  function happinessTarget(sim, city) {
    const g = gov(sim, city);
    const k = kingdomOf(sim, city);
    const sk = stock(sim, city);
    let h = 55 + g.happiness;
    if (city.hungry) h -= 30;
    else if (sk.food > city.pop * 2) h += 5;
    if (city.pop > city.housing) h -= Math.min(15, (city.pop - city.housing) * 2);
    if (k && WW.Diplo.atWar(sim, k.id)) h -= 8;
    if (city.nature != null && city.nature < 30) h -= (WW.RACES[city.race] && WW.RACES[city.race].nature === 'care') ? 10 : 4;   // kahle Umgebung
    if (city.occupiedUntil && sim.state.year < city.occupiedUntil) h -= (g.war === 'mass' ? 22 : 10);
    if (city.hasMonument) h += (k && k.gov === 'theocracy') ? 14 : 5;
    if (WW.Resources) h += WW.Resources.happiness(sim, city, sk);   // Wolle (Kälte), Kristall
    h += WW.Culture.happiness(sim, city);                             // Pyramide (Kultur nil)
    if (k && k.gov === 'fascism') h += Math.min(25, city.propaganda || 0);
    if (sim.state.tick < city.blessUntil) h += 20;
    if (k && k.policy && k.policy.bonus === 'nap') h += 8;
    if (k && k.policy && k.policy.unrest && sim.state.year < k.policy.unrest) h -= 15;
    if (city.pop > 0) h -= 20 * (city.sick / city.pop);
    if (g.taxes > 0) h -= 2;
    const race = WW.RACES[city.race];
    const t = sim.state.terrain[city.cy * sim.state.W + city.cx];
    if (race && race.favTerrain.indexOf(WW.TERRAIN[t].key) >= 0) h += 4;
    return WW.SimUtil.clamp(WW.SimUtil.mod(sim, k, city, 'happiness', h), 0, 100);
  }

  // Wirtschaft je Sekunde
  function economy(sim, city) {
    const st = sim.state;
    const g = gov(sim, city);
    const k = kingdomOf(sim, city);
    const sk = stock(sim, city);
    const secPerYear = WW.CONFIG.TPY / WW.CONFIG.TPS;
    // Essen
    if (st.laws.hunger) {
      let eat = city.pop * WW.CONFIG.FOOD_PER_YEAR / secPerYear;
      // Fisch wird zuerst gegessen (bis zur Hälfte des Bedarfs)
      if (sk.fish > 0) { const f = Math.min(sk.fish, eat * 0.5); sk.fish -= f; eat -= f; }
      if (sk.food >= eat) { sk.food -= eat; city.hungry = false; city.starve = 0; }
      else {
        sk.food = 0;
        if (city.pop > 0) {
          if (!city.hungry && st.year - (city.famineYear == null ? -99 : city.famineYear) >= 3) { city.famineYear = st.year; sim.event('famine', { city: city.name }, atCity(city)); }
          city.hungry = true; city.starve++;
          if (city.starve >= 10 && city.starve % 6 === 0 && city._members.length) {
            const u = city._members[sim.rng.int(city._members.length)];
            WW.Units.kill(sim, u, 'hunger');
          }
        }
      }
    } else { city.hungry = false; city.starve = 0; }
    // Gold (ohne Goldwirtschaft bleibt die Kasse leer, auch wenn Ereignisse Gold bringen)
    if (g.goldMul <= 0) sk.gold = 0;
    if (g.goldMul > 0) {
      let gold = 0;
      const tax = WW.SimUtil.mod(sim, k, city, 'taxes', g.taxes);
      if (tax > 0) gold += city.pop * tax;
      if (city.markets) gold += city.markets * (0.05 + city.pop * 0.005);
      gold = WW.SimUtil.mod(sim, k, city, 'gold', gold * g.goldMul);
      if (k && k.policy && k.policy.bonus === 'trade') gold *= 1.5;
      sk.gold += gold;
    }
    // Zufriedenheit nähert sich dem Ziel
    const target = happinessTarget(sim, city);
    const d = target - city.happiness;
    city.happiness = WW.SimUtil.clamp(city.happiness + Math.max(-2, Math.min(2, d * 0.15)), 0, 100);
    if (city.propaganda > 0) city.propaganda = Math.max(0, city.propaganda - 0.15);
    // Geburten
    if (city.pop < city.housing && st.units.length < WW.CONFIG.MAX_UNITS && city.centerOk) {
      const race = WW.RACES[city.race] || WW.RACES.human;
      let p = WW.CONFIG.BIRTH_RATE * city.adults * WW.SimUtil.mod(sim, k, city, 'growth', g.growthMul) * race.fertility;
      if (g.megaGrowth && city.tier >= 3) p *= g.megaGrowth;   // Megastadt (9.10)
      if (city.pop >= WW.CONFIG.CITY_POP_MAX) p = 0;           // Obergrenze je Stadt (Leistung)
      if (sk.food < city.pop * 0.6) p *= 0.15;
      if (city.happiness < 30) p *= 0.4;
      if (city.hungry) p = 0;
      if (sim.rng.next() < p) {
        const W = st.W;
        const ci = centerTile(sim, city, sim.rng.int(2));
        const u = WW.Units.create(sim, {
          x: (ci % W) + 0.5, y: Math.floor(ci / W) + 0.5, role: 'child', kingdomId: city.kingdomId, cityId: city.id,
          race: city.race, age: 0
        });
        if (u) { u.bubble = { icon: 'heart', ttl: 40 }; city.pop++; city.children++; }
      }
    }
    // Stadtstufe
    let tier = 0;
    const tgk = (kingdomOf(sim, city) || { gov: 'tribe' }).gov;
    for (let i = 0; i < WW.CITY_TIERS.length; i++) if (city.pop >= WW.CITY_TIERS[i].minPop && WW.tierAllowed(i, tgk)) tier = i;
    if (!WW.tierAllowed(city.tier, tgk)) city.tier = tier;   // Regierung kennt die Megastufen nicht (mehr)
    if (tier > city.tier) {
      city.tier = tier;
      claimTerritory(sim, city);
      sim.event('tier', { city: city.name, tier: WW.CITY_TIERS[tier].name, tierA: WW.CITY_TIERS[tier].nameA }, atCity(city));
    } else if (tier < city.tier - 1) city.tier = tier + 1;
    // Kommunismus: Stadt zeigt eine Kopie des Reichslagers
    if (sk !== city.stock) { for (const r of WW.RESOURCE_KEYS) city.stock[r] = sk[r] || 0; }
  }

  // Rohstoffe in Reichweite? (einmal je Jahr)
  function scanResources(sim, city) {
    const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
    const r = Math.min(30, territoryRadius(city, sim) + 5);
    const px = city.cx, py = city.cy;
    let wood = 0, stone = 0, water = 0;
    const tw = WW.Culture.resTab(city, 'wood'), ts = WW.Culture.resTab(city, 'stone');   // Lehmbau der Wüstenkulturen
    for (let y = Math.max(0, py - r); y <= Math.min(H - 1, py + r); y++) for (let x = Math.max(0, px - r); x <= Math.min(W - 1, px + r); x++) {
      const t = st.terrain[y * W + x];
      if (tw[t]) wood++;
      if (ts[t]) stone++;
      if (LUT.water[t]) water++;
    }
    city.hasWood = wood > 0; city.hasStone = stone > 0; city.hasWater = water > 0;
  }

  // Ort für eine Tochterstadt
  function findSettleSite(sim, city) {
    const st = sim.state, W = st.W, H = st.H;
    const px = city.cx + 0.5, py = city.cy + 0.5;
    const race = WW.RACES[city.race] || WW.RACES.human;
    if (sim._compDirty) WW.Path.updateComponents(sim);
    const myComp = sim.comp[city.cy * W + city.cx];
    let best = null, bs = -1e9;
    for (let n = 0; n < 50; n++) {
      const dir = DIRS16[sim.rng.int(16)];
      const dist = WW.CONFIG.SETTLER_DIST_MIN + sim.rng.next() * (WW.CONFIG.SETTLER_DIST_MAX - WW.CONFIG.SETTLER_DIST_MIN);
      const x = Math.round(px + dir[0] * dist), y = Math.round(py + dir[1] * dist);
      if (x < 3 || y < 3 || x >= W - 4 || y >= H - 4) continue;
      if (!canFoundAt(sim, x, y, city.race, WW.CONFIG.DAUGHTER_MIN_DIST, city.kingdomId)) continue;
      if (sim.comp[y * W + x] !== myComp) continue;
      let free = 0, owned = 0, fav = 0;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const i = (y + dy) * W + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        if (st.owner[i] !== -1) { const oc = sim._cities.get(st.owner[i]); if (oc && oc.kingdomId !== city.kingdomId) owned += 3; }
        if (WW.TERRAIN_LUT.build[st.terrain[i]]) free++;
        if (race.favTerrain.indexOf(WW.TERRAIN[st.terrain[i]].key) >= 0) fav++;
      }
      if (owned > 30 || free < 60) continue;
      const score = free + fav * 0.5 - owned * 2 - dist * 0.5;
      if (score > bs) { bs = score; best = { x: x, y: y }; }
    }
    return best;
  }

  function sendSettlers(sim, city) {
    const st = sim.state;
    const k = kingdomOf(sim, city);
    if (!k || k.cityIds.length >= WW.Growth.cityLimit(sim, k) + 2) return;
    if (WW.govNoSettle(k.gov)) return;   // Faschismus gründet keine Dörfer (9.10)
    const site = findSettleSite(sim, city);
    city.lastSettlers = st.year;
    if (!site) return;
    const group = st.nextId++;
    let n = 0;
    const want = 6 + sim.rng.int(5);
    for (const u of city._members) {
      if (n >= want) break;
      if (u.role === 'leader' || u.role === 'child' || u.role === 'rebel' || u.role === 'soldier' || u.merc || u.order) continue;
      WW.Units.setRole(sim, u, 'settler');
      u.group = group; u.site = site.y * st.W + site.x; u.fails = 0;
      n++;
    }
    if (n) sim.event('settlersLeave', { city: city.name, n: n }, atCity(city));
  }

  // Stadt aufgeben (keine Bewohner mehr)
  function destroyCity(sim, city, reason) {
    const st = sim.state;
    if (city.dead) return;
    city.dead = true;
    const k = kingdomOf(sim, city);
    WW.Walls.demolishAll(sim, city);
    for (const s of st.structs.slice()) {
      if (s.dead || s.cityId !== city.id) continue;
      const type = s.type;
      WW.Structs.remove(sim, s);
      if (type !== 'field' && type !== 'ruin') WW.Structs.ruinize(sim, s);
    }
    releaseTerritory(sim, city);
    for (const u of st.units) if (!u.dead && u.cityId === city.id) {
      // Überlebende ziehen zur nächsten Stadt des Reiches
      const other = k && k.cityIds.find(id => id !== city.id);
      if (other != null) { u.cityId = other; u.path = null; } else u.cityId = -1;
    }
    if (k) {
      k.cityIds = k.cityIds.filter(id => id !== city.id);
      if (k.capitalId === city.id) k.capitalId = k.cityIds.length ? k.cityIds[0] : -1;
    }
    st.cities = st.cities.filter(c => c !== city);
    sim._cities.delete(city.id);
    if (reason) sim.event(reason, { city: city.name, kingdom: k ? k.name : '' }, { kingdomId: k ? k.id : -1, cityId: -1, x: city.cx + 0.5, y: city.cy + 0.5 });
  }

  // Stadt wechselt das Reich (Eroberung, Abspaltung)
  function transferCity(sim, city, newKingdomId) {
    const old = kingdomOf(sim, city);
    const nk = sim._kingdoms.get(newKingdomId);
    if (!nk || old === nk) return;
    city.joinedYear = sim.state.year;
    WW.Growth.makeGovernor(sim, city);
    if (old) {
      // Kommunismus: Anteil am Reichslager mitnehmen
      if (WW.GOVERNMENTS[old.gov].sharedStock && old.stock) {
        const share = 1 / Math.max(1, old.cityIds.length);
        for (const r of WW.RESOURCE_KEYS) { const v = (old.stock[r] || 0) * share; old.stock[r] = (old.stock[r] || 0) - v; city.stock[r] = v; }
      }
      old.cityIds = old.cityIds.filter(id => id !== city.id);
      if (old.capitalId === city.id) old.capitalId = old.cityIds.length ? old.cityIds[0] : -1;
    }
    if (WW.GOVERNMENTS[nk.gov].sharedStock && nk.stock) {
      for (const r of WW.RESOURCE_KEYS) { nk.stock[r] = (nk.stock[r] || 0) + (city.stock[r] || 0); }
    }
    city.kingdomId = nk.id;
    nk.cityIds.push(city.id);
    if (nk.capitalId < 0) nk.capitalId = city.id;
    for (const u of sim.state.units) if (!u.dead && u.cityId === city.id) {
      if (old && u.id === old.leaderId) { u.role = 'farmer'; old.leaderId = -1; }
      u.kingdomId = nk.id; u.path = null; u.order = null; u.task = null;
      if (u.role === 'rebel') u.role = 'farmer';
      if (u.garrison != null) delete u.garrison;   // alte Garnison dient nicht dem neuen Herrn
    }
    city.occupied = null; city.garrisonSet = null;   // Besatzung setzt nur die Eroberung (Diplo.tryCapture)
    WW.Gov.restyleCity(sim, city, nk.gov);
    for (const s of sim.state.structs) if (!s.dead && s.cityId === city.id) {
      if (WW.Structs.isWallish(s)) { s.maxHp = WW.Structs.maxHpFor(sim, s); s.hp = Math.min(s.hp, s.maxHp); }
      sim.markDirty(s.y * sim.state.W + s.x);
    }
    city.revolt = false; city.unhappyYears = 0;
    for (let i = 0; i < sim.state.owner.length; i++) if (sim.state.owner[i] === city.id) sim.markDirty(i);
    sim.state.pathVersion++;
  }

  // Alle 10 Ticks
  function updateAll(sim) {
    const st = sim.state;
    stats(sim);
    refreshAllLists(sim);
    const slot = (st.tick / 10) | 0;
    for (const city of st.cities.slice()) {
      if (city.dead) continue;
      if (city.kind === 'camp' && WW.Camps) { WW.Camps.cityUpdate(sim, city); continue; }   // [industry] Lagerstadt: eigene Regeln
      if (city.pop === 0) {
        city.empty++;
        if (city.empty >= 20) { destroyCity(sim, city, 'cityAbandoned'); continue; }
      } else city.empty = 0;
      if (city.hasWood === undefined) scanResources(sim, city);
      economy(sim, city);
      if ((slot + city.id) % 2 === 0) assignJobs(sim, city);
      if ((slot + city.id) % 3 === 0) { planBuildings(sim, city); megaRing(sim, city); WW.Walls.update(sim, city); }
    }
  }

  // Einmal im Jahr
  function yearly(sim) {
    const st = sim.state;
    for (const city of st.cities.slice()) {
      if (city.dead) continue;
      if (city.kind === 'camp') continue;   // [industry] Lagerstadt: keine Tochterstädte, kein Unmut-Zähler
      scanResources(sim, city);
      const g = gov(sim, city);
      // Unzufriedenheit zählt für Aufstände
      const limit = g.key === 'fascism' ? 28 : 20;
      if (city.happiness < limit) city.unhappyYears++; else city.unhappyYears = Math.max(0, city.unhappyYears - 1);
      // Tochterstadt: genug Erwachsene, Frieden, Anführer lebt
      const k = kingdomOf(sim, city);
      const leaderOk = k && (g.noLeader || (sim._units.get(k.leaderId) && !sim._units.get(k.leaderId).dead));
      // Tochterstädte erst, wenn die Mutterstadt Stadt ist und ihre Reichweite ausgeschöpft hat (das Reich wächst zuerst flächig)
      const landDone = city.landFull || (city.flurs || 0) >= WW.Growth.flurTarget(sim, city) * 0.75;
      if (city.tier >= 2 && landDone && !g.build.noSettle && city.adults >= WW.CONFIG.DAUGHTER_ADULTS && leaderOk && !WW.Diplo.atWar(sim, k.id) && st.year - city.lastSettlers >= 4 && city.centerOk) sendSettlers(sim, city);   // Faschismus: keine Dörfer (9.10)
    }
  }

  WW.Cities = {
    found: found, canFoundAt: canFoundAt, stock: stock, addStock: addStock, canPay: canPay, pay: pay,
    centerPt: centerPt, centerTile: centerTile, territoryRadius: territoryRadius, claimTerritory: claimTerritory,
    releaseTerritory: releaseTerritory, refreshLists: refreshLists, refreshAllLists: refreshAllLists, stats: stats,
    updateAll: updateAll, yearly: yearly, destroyCity: destroyCity, transferCity: transferCity, atCity: atCity,
    findCoreSpot: findCoreSpot, findFieldSpot: findFieldSpot, findDropSpot: findDropSpot, placeStruct: placeStruct,
    centerOff: centerOff, emptyStock: emptyStock, fillStock: fillStock, footprintOk: footprintOk, DIRS16: DIRS16, happinessTarget: happinessTarget, scanResources: scanResources,
    sendSettlers: sendSettlers, findSettleSite: findSettleSite, HOUSE_CAP: HOUSE_CAP, countSites: countSites,
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));

// ============================================================================
// Kulturen (Ausbau 9): Zuweisung, Boni über WW.Mods, Bewässerung, Sonderbauten, Karawanen
//   Daten: WW.CULTURES (js/core/config.js). Schnittstelle: Kopfkommentar js/sim/sim.js, Abschnitt AUSBAU 9.
// ============================================================================
(function (WW) { 'use strict';

  const COLD = { snow: 1, tundra: 1, snowfield: 1, taiga: 1 };
  const DRY = { desert: 1, savanna: 1 };

  function info(key) { return WW.CULTURES[key] || WW.CULTURES.mitte; }
  function valid(key) { return typeof key === 'string' && !!WW.CULTURES[key]; }
  // Kultur eines Volkes ohne Gelände (Fantasievölker: eigene, Menschen: mitte)
  function ofRace(race) { return race && race !== 'human' && WW.CULTURES[race] ? race : 'mitte'; }
  function of(o) { return o && valid(o.culture) ? o.culture : ofRace(o && o.race); }

  function riverNear(st, x, y, r) {
    const W = st.W, H = st.H, R = WW.T.RIVER;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      if (st.terrain[yy * W + xx] === R) return true;
    }
    return false;
  }

  // Kultur bei der Gründung aus Volk + Gelände im Umkreis 5 um (x, y)
  function pick(sim, x, y, race) {
    if (race && race !== 'human') return ofRace(race);
    const st = sim.state, W = st.W, H = st.H;
    x = Math.floor(x); y = Math.floor(y);
    let cold = 0, dry = 0, desert = 0, land = 0;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const t = WW.TERRAIN[st.terrain[yy * W + xx]];
      if (t.water) continue;
      land++;
      if (COLD[t.key]) cold++;
      if (DRY[t.key]) dry++;
      if (t.key === 'desert') desert++;
    }
    if (!land) return 'mitte';
    if (cold >= land * 0.35) return 'nord';
    if (desert >= land * 0.22 || dry >= land * 0.45) return riverNear(st, x, y, WW.CULTURES.nil.needRiver || 6) ? 'nil' : 'sahel';
    return 'mitte';
  }

  // Boni als dauerhafte Mods an der Stadt (source 'culture'); ohne mods.js greift WW.SimUtil.mod direkt
  function applyMods(city) {
    if (!WW.Mods || !city) return;
    const c = info(city.culture);
    WW.Mods.remove(city, 'culture');
    for (const key in c.bonus) WW.Mods.add(city, { key: key, mul: c.bonus[key], until: 0, source: 'culture', name: 'Kultur: ' + c.name });
  }
  // Anzeigenamen der Mod-Schlüssel für Rohstoffe ergänzen (Mods-Liste der Oberfläche)
  if (WW.Mods && WW.Mods.KEY_NAMES) {
    const KN = WW.Mods.KEY_NAMES;
    if (!KN.fish) KN.fish = 'Fischertrag';
    if (!KN.wool) KN.wool = 'Wollertrag';
    if (!KN.crystal) KN.crystal = 'Kristallhandel';
    for (const r of ['iron', 'coal']) if (!KN[r]) KN[r] = (WW.Resources && WW.Resources.RES_NAME && WW.Resources.RES_NAME[r]) || r;
  }

  function setCity(sim, city, key) {
    city.culture = valid(key) ? key : ofRace(city.race);
    applyMods(city);
  }

  // ältere Spielstände: Kulturen nachrüsten (Menschen mitte, sonst Volksschlüssel)
  function defaults(st) {
    for (const c of st.cities) {
      if (!valid(c.culture)) { c.culture = ofRace(c.race); applyMods(c); }
      else if (WW.Mods && !(c.mods || []).some(m => m.source === 'culture') && Object.keys(info(c.culture).bonus).length) applyMods(c);
    }
    const byId = new Map(st.cities.map(c => [c.id, c]));
    for (const k of st.kingdoms) if (!valid(k.culture)) { const cap = byId.get(k.capitalId) || byId.get(k.cityIds[0]); k.culture = cap ? cap.culture : ofRace(k.race); }
    for (const u of st.units) if (!valid(u.culture)) { const c = byId.get(u.cityId); u.culture = c && c.race === u.race ? c.culture : ofRace(u.race); }
  }

  // ---------------------------------------------------------------- Felder: Bewässerung und Flussfelder
  // sim._wet (Laufzeit): -1 unbekannt, sonst Bit0 = Wasser im Umkreis 3, Bit1 = Fluss im Umkreis 2; verworfen bei Geländeänderung
  function wet(sim, i) {
    const st = sim.state, N = st.W * st.H;
    if (!sim._wet || sim._wet.length !== N || sim._wetVer !== st.pathVersion) {
      if (!sim._wet || sim._wet.length !== N) sim._wet = new Int8Array(N);
      sim._wet.fill(-1); sim._wetVer = st.pathVersion;
    }
    let v = sim._wet[i];
    if (v >= 0) return v;
    v = 0;
    const W = st.W, x = i % W, y = (i - x) / W, LUT = WW.TERRAIN_LUT, R = WW.T.RIVER;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= st.H) continue;
      const t = st.terrain[yy * W + xx];
      if (LUT.water[t]) { v |= 1; if (t === R && Math.abs(dx) <= 2 && Math.abs(dy) <= 2) v |= 2; }
    }
    sim._wet[i] = v;
    return v;
  }
  const IRRIGABLE = () => [WW.T.DESERT, WW.T.SAND, WW.T.SAVANNA];
  // Darf hier bewässert werden? (Kultur mit irrigation, Wüste/Sand/Savanne, Wasser im Umkreis 3)
  function irrigable(sim, city, i) {
    if (!city || !info(city.culture).irrigation) return false;
    const t = sim.state.terrain[i];
    if (IRRIGABLE().indexOf(t) < 0) return false;
    return (wet(sim, i) & 1) === 1;
  }
  // wirksame Fruchtbarkeit einer Feldkachel (Bewässerung hebt Wüste/Sand auf 0,6)
  function fieldFert(sim, city, i) {
    const f = WW.TERRAIN_LUT.fertile[sim.state.terrain[i]];
    if (f < 0.6 && irrigable(sim, city, i)) return 0.6;
    return f;
  }
  // Ertragsfaktor eines Feldes nach Kultur (nil: Flussfelder ×1,5)
  function fieldMul(sim, city, i) {
    const c = city ? info(city.culture) : null;
    if (c && c.riverFields && (wet(sim, i) & 2)) return c.riverFields;
    return 1;
  }

  // ---------------------------------------------------------------- Lehmbau (sahel, nil): Rohstoff-Tabellen je Kultur
  // wood zusätzlich aus Savanne (Akazien, Dumpalmen; Kachel bleibt stehen), stone zusätzlich aus Wüste (Lehmziegel)
  const TABS = {};
  function resTab(city, res) {
    const c = city && city.culture ? WW.CULTURES[city.culture] : null;
    if (!c || !c.loam || (res !== 'wood' && res !== 'stone')) return WW.TERRAIN_LUT[res];
    let t = TABS[res];
    if (!t) { t = TABS[res] = Uint8Array.from(WW.TERRAIN_LUT[res]); if (res === 'wood') t[WW.T.SAVANNA] = 1; else t[WW.T.DESERT] = 1; }
    return t;
  }

  // ---------------------------------------------------------------- Zufriedenheit (Pyramide)
  function happiness(sim, city) {
    const lv = city.pyramidLv | 0;   // 0 = keine fertige Pyramide, sonst Stufe 1..3 (gespeichert)
    return lv ? 3 + 2 * Math.min(2, lv - 1) : 0;
  }

  // ---------------------------------------------------------------- Sonderbauten und Karawanen (alle 40 Ticks)
  function update(sim) {
    const st = sim.state;
    // Reichskultur folgt der Hauptstadt
    for (const k of st.kingdoms) {
      const cap = sim._cities.get(k.capitalId) || sim._cities.get(k.cityIds[0]);
      if (cap && cap.culture && k.culture !== cap.culture) k.culture = cap.culture;
    }
    // Mitglieder frisch aus st.units (city._members ist nach dem Laden noch leer)
    const mem = new Map();
    for (const u of st.units) { if (u.dead || u.cityId < 0) continue; let l = mem.get(u.cityId); if (!l) { l = []; mem.set(u.cityId, l); } l.push(u); }
    const sp = new Map();
    for (const s of st.structs) {
      if (s.dead || s.cityId < 0) continue;
      if (s.type === 'caravanserai' || s.type === 'pyramid') sp.set(s.cityId + ':' + s.type, s);
    }
    for (const city of st.cities) {
      if (city.dead) continue;
      const c = info(city.culture);
      const pyr = sp.get(city.id + ':pyramid') || null;
      const plv = pyr && pyr.built ? (pyr.level || 1) : 0;
      if ((city.pyramidLv | 0) !== plv) city.pyramidLv = plv;
      if (pyr) {
        const stg = Math.max(0, Math.min(2, (pyr.level || 1) - 1));
        if (pyr.stage !== stg) { const up = pyr.stage != null && stg > pyr.stage; pyr.stage = stg; if (up) sim.event('pyramidStage', { city: city.name }, WW.Cities.atCity(city)); WW.Structs.forTiles(sim, pyr, (i) => sim.markDirty(i)); }
      }
      const cs = sp.get(city.id + ':caravanserai') || null;
      if (c.special && city.centerOk && city.pop >= 18 && st.units.length < WW.CONFIG.MAX_UNITS) {
        const have = c.special === 'pyramid' ? pyr : cs;
        if (!have && WW.Cities.countSites(sim, city, true) < 2 + city.tier) {
          const cost = WW.Structs.costFor(sim, c.special, 1, city.id);
          if (WW.Cities.canPay(sim, city, cost) && !(city.specialTry > st.tick)) {
            city.specialTry = st.tick + 400;
            let i = WW.Cities.findCoreSpot(sim, city, c.special);
            if (i < 0 && c.special === 'caravanserai' && WW.Resources) { const o = WW.Resources.findSpot(sim, city, 'smithy', null); i = o ? o.i : -1; }   // vor dem Tor
            if (i >= 0) {
              const k = sim._kingdoms.get(city.kingdomId);
              const s = WW.Cities.placeStruct(sim, city, c.special, i % st.W, Math.floor(i / st.W), { style: k ? k.gov : 'tribe' });
              if (s) {
                city.sites.push(s.id);
                if (c.special === 'pyramid') s.stage = 0;
                sim.event(c.special === 'pyramid' ? 'pyramid' : 'caravanserai', { city: city.name }, WW.Cities.atCity(city));
              }
            }
          }
        } else if (pyr && pyr.built && !pyr.upgradeTo && (pyr.level || 1) < 3 && city.tier >= (pyr.level || 1) + 1) {
          // nächste Stufe als Baustelle anlegen; bezahlt wird, sobald der Stein da ist (Steinmetze richten sich nach dem Bedarf)
          if (WW.Cities.countSites(sim, city, true) < 2 + city.tier && city.sites.indexOf(pyr.id) < 0) {
            pyr.upgradeTo = (pyr.level || 1) + 1; pyr.progress = 0; pyr.paid = false; pyr.siteYear = st.year;
            city.sites.push(pyr.id);
          }
        }
      }
      // Karawanen der Karawanserei
      const members = mem.get(city.id) || [];
      if (cs && cs.built) {
        const want = Math.min(3, 1 + Math.floor(city.pop / 40));
        let have = 0;
        for (const u of members) if (u.role === 'caravan') have++;
        if (have < want && partners(sim, city).length) {
          for (const u of members) {
            if (u.role === 'farmer' && !u.carrying && !u.order) { WW.Units.setRole(sim, u, 'caravan'); break; }
          }
        }
      } else {
        for (const u of members) if (u.role === 'caravan') WW.Units.setRole(sim, u, 'farmer');
      }
    }
  }

  // befreundete Ziel-Städte einer Karawane: eigene Städte, Bündnis, Frieden mit Meinung ≥ 0
  function partners(sim, city) {
    const k = sim._kingdoms.get(city.kingdomId);
    const out = [];
    if (!k) return out;
    for (const id of k.cityIds) if (id !== city.id) out.push(id);
    for (const oid in k.relations) {
      const r = k.relations[oid];
      if (!(r.status === 'alliance' || (r.status === 'peace' && r.opinion >= 0))) continue;
      const ok = sim._kingdoms.get(+oid);
      if (ok) for (const id of ok.cityIds) { const c = sim._cities.get(id); if (c && Math.abs(c.cx - city.cx) + Math.abs(c.cy - city.cy) < 90) out.push(id); }
    }
    return out;
  }

  WW.Culture = {
    info: info, valid: valid, ofRace: ofRace, of: of, pick: pick, setCity: setCity, applyMods: applyMods, defaults: defaults,
    resTab: resTab, wet: wet, irrigable: irrigable, fieldFert: fieldFert, fieldMul: fieldMul, happiness: happiness, update: update, partners: partners
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
