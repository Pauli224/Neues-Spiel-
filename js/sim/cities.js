// Städte: Gründung, Gebiet, Lager, Wirtschaft, Wachstum, Berufe, Bauplanung, Tochterstädte, Verfall.
(function (WW) { 'use strict';

  const WORKERS = { farmer: 1, lumberjack: 1, miner: 1, builder: 1, soldier: 1 };
  const HOUSE_CAP = [3, 5, 8];
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
  function found(sim, x, y, kingdomId, race, name) {
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
    const city = {
      id: st.nextId++, name: name || WW.Names.town(sim.rng, race, sim._usedNames),
      kingdomId: kingdomId, race: race || k.race || 'human',
      cx: x, cy: y, centerId: -1, tier: 0, pop: 0, adults: 0, children: 0, housing: 4,
      stock: { food: 0, wood: 0, stone: 0, gold: 0 }, happiness: 60,
      wall: WW.Walls.emptyWall(),
      founded: st.year, jobs: {}, sites: [], fields: [], drops: [], houses: 0,
      hasBarracks: false, hasMarket: false, hasMonument: false,
      hungry: false, starve: 0, unhappyYears: 0, lastSettlers: st.year, blessUntil: 0,
      noSpace: false, empty: 0, centerOk: true, centerLost: 0, revolt: false, propaganda: 0, sick: 0,
      loyalty: 80, joinedYear: st.year, flurs: 0, needLand: false, governor: null
    };
    sim._usedNames.add(city.name);
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
  function canFoundAt(sim, x, y, race, minDist) {
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
      if (st.owner[i] !== -1 || st.inRing[i] !== -1) return false;
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
      if (s.built) c._cap += (s.level === 0 ? WW.STRUCT_INFO.house.tent.cap : HOUSE_CAP[Math.max(0, Math.min(2, s.level - 1))]) + (WW.RACES[c.race] || WW.RACES.human).housingBonus;
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
    const workers = city._members.filter(u => WORKERS[u.role] && !u.merc && !u.order);
    const n = workers.length;
    if (!n) return;
    const st = stock(sim, city);
    const want = { farmer: 0, lumberjack: 0, miner: 0, builder: 0, soldier: 0 };
    const atWar = k && WW.Diplo.atWar(sim, k.id);
    let soldierShare = g.soldierShare;
    if (k && k.policy && k.policy.bonus === 'safety') soldierShare += 0.06;
    if (atWar) soldierShare = g.war === 'mass' ? Math.min(0.55, soldierShare * 2) : soldierShare * 1.6 + (g.soldierShare > 0 ? 0.06 : 0);
    if (city._rebels > 0 && g.soldierShare > 0) soldierShare += 0.1;
    want.soldier = n >= 4 ? Math.round(n * Math.min(0.55, soldierShare)) : 0;
    if (g.soldierShare > 0 && n >= 6 && want.soldier < 1) want.soldier = 1;
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
    const r = Math.min(16, territoryRadius(city, sim));
    const px = city.cx + 0.5, py = city.cy + 0.5;
    const owner = st.owner, inRing = st.inRing, id = city.id;
    const area = ringed
      ? (i) => inRing[i] === id
      : (i) => owner[i] === id && inRing[i] === -1 && !(sAt(sim, i) && WW.Structs.isWallish(sAt(sim, i)));
    const o = { area: area, fieldOk: true, race: city.race, cityId: id, needWalkBorder: true };
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
    const r = territoryRadius(city, sim) + 1;
    const px = city.cx + 0.5, py = city.cy + 0.5;
    const ringed = !!city.wall.plan;
    const minD = ringed ? 0 : WW.CONFIG.WALL_RESERVE + WW.CONFIG.WALL_MARGIN + 1.2;
    let best = -1, bs = -1e9;
    for (let y = Math.max(1, Math.floor(py - r)); y <= Math.min(H - 2, Math.ceil(py + r)); y++) {
      for (let x = Math.max(1, Math.floor(px - r)); x <= Math.min(W - 2, Math.ceil(px + r)); x++) {
        const i = y * W + x;
        if (st.owner[i] !== city.id) continue;
        if (st.structAt[i] !== -1 || st.inRing[i] !== -1) continue;
        const t = st.terrain[i];
        const fert = WW.TERRAIN_LUT.fertile[t];
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
    const r = territoryRadius(city, sim) + 3;
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
      if (city.tier >= need) {
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
    const houseCap = 2 + Math.floor((city.flurs || 1) * WW.CONFIG.HOUSES_PER_FLUR);
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
    for (const id of city.fields) { const f = sim._structs.get(id); if (f) fsum += Math.max(0.2, WW.TERRAIN_LUT.fertile[st.terrain[f.y * W + f.x]]); }
    const avgF = city.fields.length ? fsum / city.fields.length : 1;
    const wantFields = Math.max(2, Math.ceil(city.pop / 2.3 / Math.max(0.4, avgF))) + (plan && plan.focus === 'food' ? 2 : 0);
    if (city.fields.length < wantFields) {
      const i = findFieldSpot(sim, city);
      if (i >= 0) {
        const s = WW.Structs.create(sim, 'field', i % W, Math.floor(i / W), city.id, { built: true });
        if (s) city.fields.push(s.id);
      } else city.needLand = true;
    }
    if (open >= maxOpen) return;
    // Holzfällerhütte / Steinbruch
    let hasLumber = false, hasQuarry = false;
    for (const id of city.drops) { const s = sim._structs.get(id); if (s && s.type === 'lumber') hasLumber = true; if (s && s.type === 'quarry') hasQuarry = true; }
    for (const id of city.sites) { const s = sim._structs.get(id); if (s && s.type === 'lumber') hasLumber = true; if (s && s.type === 'quarry') hasQuarry = true; }
    if (!hasLumber && (city.jobs.lumberjack || 0) >= 2 && sk.wood >= 4 && city.pop >= 7 && sim.rng.chance(0.5)) {
      const i = findDropSpot(sim, city, 'wood', 'lumber');
      if (i < 0) city.needLand = true;
      if (i >= 0) { const s = placeStruct(sim, city, 'lumber', i % W, Math.floor(i / W), {}); if (s) { city.sites.push(s.id); return; } }
    }
    if (!hasQuarry && (city.jobs.miner || 0) >= 1 && sk.wood >= 4 && city.pop >= 10 && sim.rng.chance(0.5)) {
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

  function upgradeHouse(sim, city, sk) {
    const ctr = sim._structs.get(city.centerId);
    const stage = ctr ? (ctr.stage || 0) : 0;
    let best = null;
    for (const s of sim.state.structs) {
      if (s.dead || s.cityId !== city.id || s.type !== 'house' || !s.built || s.upgradeTo || s.level >= 3) continue;
      if (s.level === 0 && stage < 1) continue;          // Zelte erst mit der Dorfhalle aufwerten
      if (s.level >= 1 && city.tier < 1) continue;
      if (s.level === 2 && city.tier < 2) continue;
      if (!best || s.level < best.level) best = s;
    }
    if (!best) return false;
    const cost = WW.Structs.costFor(sim, 'house', best.level + 1, city.id);
    if (!canPay(sim, city, cost)) return false;
    // nicht mehrere Ausbauten gleichzeitig beginnen, die das Lager nicht trägt
    for (const id of city.sites) { const o = sim._structs.get(id); if (o && o.type === 'house' && o.upgradeTo && !o.paid) return false; }
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
    if (city.occupiedUntil && sim.state.year < city.occupiedUntil) h -= (g.war === 'mass' ? 22 : 10);
    if (city.hasMonument) h += (k && k.gov === 'theocracy') ? 14 : 5;
    if (k && k.gov === 'fascism') h += Math.min(25, city.propaganda || 0);
    if (sim.state.tick < city.blessUntil) h += 20;
    if (k && k.policy && k.policy.bonus === 'nap') h += 8;
    if (k && k.policy && k.policy.unrest && sim.state.year < k.policy.unrest) h -= 15;
    if (city.pop > 0) h -= 20 * (city.sick / city.pop);
    if (g.taxes > 0) h -= 2;
    const race = WW.RACES[city.race];
    const t = sim.state.terrain[city.cy * sim.state.W + city.cx];
    if (race && race.favTerrain.indexOf(WW.TERRAIN[t].key) >= 0) h += 4;
    return WW.SimUtil.clamp(h, 0, 100);
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
      const eat = city.pop * WW.CONFIG.FOOD_PER_YEAR / secPerYear;
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
    // Gold
    if (g.goldMul > 0) {
      let gold = 0;
      if (g.taxes > 0) gold += city.pop * g.taxes;
      if (city.markets) gold += city.markets * (0.05 + city.pop * 0.005);
      gold *= g.goldMul;
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
      let p = WW.CONFIG.BIRTH_RATE * city.adults * g.growthMul * race.fertility;
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
    for (let i = 0; i < WW.CITY_TIERS.length; i++) if (city.pop >= WW.CITY_TIERS[i].minPop) tier = i;
    if (tier > city.tier) {
      city.tier = tier;
      claimTerritory(sim, city);
      sim.event('tier', { city: city.name, tier: WW.CITY_TIERS[tier].name, tierA: WW.CITY_TIERS[tier].nameA }, atCity(city));
    } else if (tier < city.tier - 1) city.tier = tier + 1;
    // Kommunismus: Stadt zeigt eine Kopie des Reichslagers
    if (sk !== city.stock) { city.stock.food = sk.food; city.stock.wood = sk.wood; city.stock.stone = sk.stone; city.stock.gold = sk.gold; }
  }

  // Rohstoffe in Reichweite? (einmal je Jahr)
  function scanResources(sim, city) {
    const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
    const r = territoryRadius(city, sim) + 5;
    const px = city.cx, py = city.cy;
    let wood = 0, stone = 0, water = 0;
    for (let y = Math.max(0, py - r); y <= Math.min(H - 1, py + r); y++) for (let x = Math.max(0, px - r); x <= Math.min(W - 1, px + r); x++) {
      const t = st.terrain[y * W + x];
      if (LUT.wood[t]) wood++;
      if (LUT.stone[t]) stone++;
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
      if (!canFoundAt(sim, x, y, city.race, WW.CONFIG.DAUGHTER_MIN_DIST)) continue;
      if (sim.comp[y * W + x] !== myComp) continue;
      let free = 0, owned = 0, fav = 0;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const i = (y + dy) * W + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        if (st.owner[i] !== -1) { owned++; const oc = sim._cities.get(st.owner[i]); if (oc && oc.kingdomId !== city.kingdomId) owned += 2; }
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
        for (const r of ['food', 'wood', 'stone', 'gold']) { const v = old.stock[r] * share; old.stock[r] -= v; city.stock[r] = v; }
      }
      old.cityIds = old.cityIds.filter(id => id !== city.id);
      if (old.capitalId === city.id) old.capitalId = old.cityIds.length ? old.cityIds[0] : -1;
    }
    if (WW.GOVERNMENTS[nk.gov].sharedStock && nk.stock) {
      for (const r of ['food', 'wood', 'stone', 'gold']) { nk.stock[r] += city.stock[r]; }
    }
    city.kingdomId = nk.id;
    nk.cityIds.push(city.id);
    if (nk.capitalId < 0) nk.capitalId = city.id;
    for (const u of sim.state.units) if (!u.dead && u.cityId === city.id) {
      if (old && u.id === old.leaderId) { u.role = 'farmer'; old.leaderId = -1; }
      u.kingdomId = nk.id; u.path = null; u.order = null; u.task = null;
      if (u.role === 'rebel') u.role = 'farmer';
    }
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
      if (city.pop === 0) {
        city.empty++;
        if (city.empty >= 20) { destroyCity(sim, city, 'cityAbandoned'); continue; }
      } else city.empty = 0;
      if (city.hasWood === undefined) scanResources(sim, city);
      economy(sim, city);
      if ((slot + city.id) % 2 === 0) assignJobs(sim, city);
      if ((slot + city.id) % 3 === 0) { planBuildings(sim, city); WW.Walls.update(sim, city); }
    }
  }

  // Einmal im Jahr
  function yearly(sim) {
    const st = sim.state;
    for (const city of st.cities.slice()) {
      if (city.dead) continue;
      scanResources(sim, city);
      const g = gov(sim, city);
      // Unzufriedenheit zählt für Aufstände
      const limit = g.key === 'fascism' ? 28 : 20;
      if (city.happiness < limit) city.unhappyYears++; else city.unhappyYears = Math.max(0, city.unhappyYears - 1);
      // Tochterstadt: genug Erwachsene, Frieden, Anführer lebt
      const k = kingdomOf(sim, city);
      const leaderOk = k && (g.noLeader || (sim._units.get(k.leaderId) && !sim._units.get(k.leaderId).dead));
      if (city.adults >= WW.CONFIG.DAUGHTER_ADULTS && leaderOk && !WW.Diplo.atWar(sim, k.id) && st.year - city.lastSettlers >= 4 && city.centerOk) sendSettlers(sim, city);
    }
  }

  WW.Cities = {
    found: found, canFoundAt: canFoundAt, stock: stock, addStock: addStock, canPay: canPay, pay: pay,
    centerPt: centerPt, centerTile: centerTile, territoryRadius: territoryRadius, claimTerritory: claimTerritory,
    releaseTerritory: releaseTerritory, refreshLists: refreshLists, refreshAllLists: refreshAllLists, stats: stats,
    updateAll: updateAll, yearly: yearly, destroyCity: destroyCity, transferCity: transferCity, atCity: atCity,
    findCoreSpot: findCoreSpot, findFieldSpot: findFieldSpot, findDropSpot: findDropSpot, placeStruct: placeStruct,
    centerOff: centerOff, footprintOk: footprintOk, DIRS16: DIRS16, happinessTarget: happinessTarget, scanResources: scanResources,
    sendSettlers: sendSettlers, findSettleSite: findSettleSite, HOUSE_CAP: HOUSE_CAP
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
