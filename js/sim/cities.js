// Städte: Gründung, Gebiet, Lager, Wirtschaft, Wachstum, Berufe, Bauplanung, Tochterstädte, Verfall.
(function (WW) { 'use strict';

  const WORKERS = { farmer: 1, lumberjack: 1, miner: 1, builder: 1, soldier: 1 };
  const HOUSE_CAP = [3, 5, 8];

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
    s[res] = Math.max(0, s[res] + amount);
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

  function centerPt(city) { return { x: city.cx + 1, y: city.cy + 1 }; }
  function centerTile(sim, city, salt) {
    const W = sim.state.W;
    return (city.cy + 1) * W + city.cx + ((salt | 0) & 1);
  }

  function territoryRadius(city) { return WW.CONFIG.TERRITORY_BASE + city.tier * 2 + (city.wall && city.wall.expansions ? 1 : 0); }

  function claimTerritory(sim, city) {
    const st = sim.state, W = st.W, H = st.H, T = WW.T;
    const r = territoryRadius(city);
    const px = city.cx + 1, py = city.cy + 1;
    for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(H - 1, Math.ceil(py + r)); y++) {
      for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(W - 1, Math.ceil(px + r)); x++) {
        const dx = x + 0.5 - px, dy = y + 0.5 - py;
        if (dx * dx + dy * dy > r * r) continue;
        const i = y * W + x;
        if (st.owner[i] !== -1) continue;
        const t = st.terrain[i];
        if (t === T.DEEP || t === T.WATER) continue;
        st.owner[i] = city.id;
        sim.markDirty(i);
      }
    }
  }

  function releaseTerritory(sim, city) {
    const st = sim.state;
    for (let i = 0; i < st.owner.length; i++) if (st.owner[i] === city.id) { st.owner[i] = -1; sim.markDirty(i); }
  }

  // Neue Stadt mit fertigem Zentrum an (x, y) = linke obere Kachel
  function found(sim, x, y, kingdomId, race, name) {
    const st = sim.state, W = st.W;
    const k = sim._kingdoms.get(kingdomId);
    if (!k) return null;
    // Platz räumen (Felder, Ruinen)
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const s = sim._structs.get(st.structAt[(y + dy) * W + x + dx]);
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
      noSpace: false, empty: 0, centerOk: true, centerLost: 0, revolt: false, propaganda: 0, sick: 0
    };
    sim._usedNames.add(city.name);
    st.cities.push(city);
    sim._cities.set(city.id, city);
    const c = WW.Structs.create(sim, 'center', x, y, city.id, { built: true, gov: k.gov });
    city.centerId = c ? c.id : -1;
    k.cityIds.push(city.id);
    if (k.capitalId < 0) k.capitalId = city.id;
    claimTerritory(sim, city);
    refreshLists(sim, city);
    return city;
  }

  // Kann hier ein Zentrum stehen?
  function canFoundAt(sim, x, y, race) {
    const st = sim.state, W = st.W, H = st.H;
    if (x < 1 || y < 1 || x + 2 >= W || y + 2 >= H) return false;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = (y + dy) * W + x + dx;
      if (st.owner[i] !== -1) return false;
      const s = sim._structs.get(st.structAt[i]);
      if (s && s.type !== 'ruin' && s.type !== 'field') return false;
      const t = st.terrain[i];
      const r = WW.RACES[race];
      const okT = (WW.TERRAIN_LUT.build[t] && WW.TERRAIN_LUT.walk[t] > 0) || (r && r.buildOn && r.buildOn.indexOf(WW.TERRAIN[t].key) >= 0);
      if (!okT) return false;
    }
    return true;
  }

  // Listen der Stadt aus den Bauwerken (Baustellen, Felder, Abladestellen, Wohnraum)
  function refreshAllLists(sim) {
    const st = sim.state;
    for (const c of st.cities) {
      c.sites = []; c.fields = []; c.drops = []; c._houses = 0; c._cap = 0; c._barr = false; c._mark = false; c._mon = false; c._center = null;
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
    if (!s.built || s.upgradeTo) c.sites.push(s.id);
    if (s.type === 'field') c.fields.push(s.id);
    else if ((s.type === 'lumber' || s.type === 'quarry') && s.built) c.drops.push(s.id);
    else if (s.type === 'house') {
      c._houses++;
      if (s.built) c._cap += HOUSE_CAP[Math.max(0, Math.min(2, s.level - 1))] + (WW.RACES[c.race] || WW.RACES.human).housingBonus;
    } else if (s.type === 'barracks') c._barr = true;
    else if (s.type === 'market') c._mark = true;
    else if (s.type === 'monument') c._mon = true;
    else if (s.type === 'center') c._center = s;
  }
  function finishLists(sim, c) {
    c.houses = c._houses;
    c.hasBarracks = c._barr; c.hasMarket = c._mark; c.hasMonument = c._mon;
    const ctr = c._center;
    c.centerId = ctr ? ctr.id : -1;
    c.centerOk = !!(ctr && ctr.built);
    c.housing = (c.centerOk ? 4 : 1) + c._cap;
    delete c._houses; delete c._cap; delete c._barr; delete c._mark; delete c._mon; delete c._center;
  }
  function refreshLists(sim, city) {
    city.sites = []; city.fields = []; city.drops = []; city._houses = 0; city._cap = 0;
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
    const workers = city._members.filter(u => WORKERS[u.role] && !u.merc);
    const n = workers.length;
    if (!n) return;
    const st = stock(sim, city);
    const want = { farmer: 0, lumberjack: 0, miner: 0, builder: 0, soldier: 0 };
    const atWar = k && WW.Diplo.atWar(sim, k.id);
    let soldierShare = g.soldierShare;
    if (k && k.policy && k.policy.bonus === 'safety') soldierShare += 0.06;
    if (atWar) soldierShare = soldierShare * 1.6 + (g.soldierShare > 0 ? 0.06 : 0);
    if (city._rebels > 0 && g.soldierShare > 0) soldierShare += 0.1;
    want.soldier = n >= 4 ? Math.round(n * Math.min(0.55, soldierShare)) : 0;
    if (g.soldierShare > 0 && n >= 6 && want.soldier < 1) want.soldier = 1;
    const sites = city.sites.length;
    if (sites > 0) want.builder = Math.max(1, Math.min(Math.ceil(sites / 3), Math.floor(n * 0.35)));
    // Nahrung
    const need = city.pop * WW.CONFIG.FOOD_PER_YEAR;
    const perFarmer = 9 * race.yields.food * g.workMul;
    let farmers = Math.ceil(need / perFarmer * 1.15);
    if (st.food < city.pop * 1.5) farmers += 1;
    if (st.food < city.pop * 0.5) farmers += 1;
    if (st.food > city.pop * 5 + 30) farmers -= 1;
    want.farmer = Math.max(1, farmers);
    // Stein
    const wantsStone = (city.wall.level >= 1 && g.wallMax >= 2) || city.tier >= 1;
    want.miner = city.hasStone ? (wantsStone ? Math.max(1, Math.round(n * 0.16)) : (st.stone < 10 ? 1 : 0)) : 0;
    if (st.stone > 120) want.miner = Math.min(want.miner, 1);
    // Fünfjahresplan
    const plan = k && k.policy && k.policy.plan;
    if (plan && plan.focus === 'food') want.farmer += 1;
    if (plan && plan.focus === 'stone' && city.hasStone) want.miner += 1;
    let rest = n - want.soldier - want.builder - want.farmer - want.miner;
    if (rest < 0) {
      // Reihenfolge der Kürzung: Steinmetze, Baumeister, Soldaten
      for (const r of ['miner', 'builder', 'soldier']) { while (rest < 0 && want[r] > (r === 'builder' && sites ? 1 : 0)) { want[r]--; rest++; } }
      while (rest < 0 && want.farmer > 1) { want.farmer--; rest++; }
    }
    want.lumberjack = Math.max(0, rest);
    if (!city.hasWood) { want.farmer += want.lumberjack; want.lumberjack = 0; }
    if (st.wood > 150 && want.lumberjack > 1) { const m = want.lumberjack - 1; want.lumberjack = 1; want.farmer += Math.ceil(m / 2); want.miner += city.hasStone ? Math.floor(m / 2) : 0; if (!city.hasStone) want.farmer += Math.floor(m / 2); }
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

  // Bauplatz für Kerngebäude (Häuser usw.)
  function findCoreSpot(sim, city) {
    const st = sim.state, W = st.W, H = st.H;
    const ringed = !!city.wall.plan;
    const r = Math.min(12, territoryRadius(city));
    const px = city.cx + 1, py = city.cy + 1;
    let best = -1, bs = -1e9;
    const sAt = st.structAt;
    const isCore = (i) => { const s = sim._structs.get(sAt[i]); return s && s.cityId === city.id && WW.Walls.CORE[s.type]; };
    const isWallTile = (i) => { const s = sim._structs.get(sAt[i]); return s && WW.Structs.isWallish(s); };
    for (let y = Math.max(1, Math.floor(py - r)); y <= Math.min(H - 2, Math.ceil(py + r)); y++) {
      for (let x = Math.max(1, Math.floor(px - r)); x <= Math.min(W - 2, Math.ceil(px + r)); x++) {
        const i = y * W + x;
        if (ringed) { if (st.inRing[i] !== city.id) continue; }
        else if (st.owner[i] !== city.id) continue;
        let free = st.structAt[i] === -1;
        if (!free) { const s = sim._structs.get(sAt[i]); if (s && s.type === 'field' && ringed && s.cityId === city.id) free = true; }
        if (!free) continue;
        const t = st.terrain[i];
        const race = WW.RACES[city.race];
        if (!((WW.TERRAIN_LUT.build[t] && WW.TERRAIN_LUT.walk[t] > 0) || (race.buildOn && race.buildOn.indexOf(WW.TERRAIN[t].key) >= 0))) continue;
        // Abstand zur Mauer: eine Gasse frei lassen, nicht vor Toren
        let nearWall = false, coreN = 0, coreOrth = 0;
        for (let d = 0; d < 8; d++) {
          const nx = x + WW.Path.DX[d], ny = y + WW.Path.DY[d];
          const n = ny * W + nx;
          if (isWallTile(n)) { nearWall = true; break; }
          if (isCore(n)) { coreN++; if (d < 4) coreOrth++; }
        }
        if (nearWall) continue;
        // ohne Mauer: dicht beim Bestand bleiben
        if (!ringed && coreN === 0) {
          let near = false;
          for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (isCore((y + dy) * W + x + dx)) { near = true; break; }
          if (!near) continue;
        }
        const d = Math.sqrt((x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py));
        let score = -d + coreN * 0.35 - Math.max(0, coreOrth - 1) * 1.2 + (sim._hashNoise(i) * 0.8);
        if (WW.TERRAIN_LUT.wood[t]) score -= 0.8;
        if (score > bs) { bs = score; best = i; }
      }
    }
    return best;
  }

  // Feldplatz: fruchtbar, außerhalb der (künftigen) Mauer
  function findFieldSpot(sim, city) {
    const st = sim.state, W = st.W, H = st.H;
    const r = territoryRadius(city) + 1;
    const px = city.cx + 1, py = city.cy + 1;
    const race = WW.RACES[city.race];
    const minD = city.wall.plan ? 0 : 3.6;
    let best = -1, bs = -1e9;
    for (let y = Math.max(1, Math.floor(py - r)); y <= Math.min(H - 2, Math.ceil(py + r)); y++) {
      for (let x = Math.max(1, Math.floor(px - r)); x <= Math.min(W - 2, Math.ceil(px + r)); x++) {
        const i = y * W + x;
        const o = st.owner[i];
        if (o !== city.id && o !== -1) continue;
        if (st.structAt[i] !== -1 || st.inRing[i] !== -1) continue;
        const t = st.terrain[i];
        const fert = WW.TERRAIN_LUT.fertile[t];
        if (fert <= 0 || WW.TERRAIN_LUT.walk[t] <= 0) continue;
        if (!WW.TERRAIN_LUT.build[t] && !(race.buildOn && race.buildOn.indexOf(WW.TERRAIN[t].key) >= 0)) continue;
        if (WW.TERRAIN_LUT.wood[t] && fert < 0.75) continue;
        // Abstand zu Kerngebäuden (Mauerring-Puffer)
        let tooClose = false, fieldN = 0, wallN = false;
        for (let dy = -3; dy <= 3 && !tooClose; dy++) for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const s = sim._structs.get(st.structAt[ny * W + nx]);
          if (!s) continue;
          if (WW.Walls.CORE[s.type] && s.cityId === city.id && dx * dx + dy * dy < minD * minD) { tooClose = true; break; }
          if (s.type === 'field' && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) fieldN++;
          if (WW.Structs.isWallish(s) && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) wallN = true;
        }
        if (tooClose || wallN) continue;
        const d = Math.sqrt((x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py));
        const score = -d + fert * 2 + fieldN * 0.6 + sim._hashNoise(i) * 0.5;
        if (score > bs) { bs = score; best = i; }
      }
    }
    return best;
  }

  // Platz für Holzfällerhütte/Steinbruch nahe am Rohstoff, außerhalb der Mauer
  function findDropSpot(sim, city, res) {
    const st = sim.state, W = st.W, H = st.H;
    const r = territoryRadius(city) + 3;
    const px = city.cx + 1, py = city.cy + 1;
    const LUT = WW.TERRAIN_LUT;
    let best = -1, bs = -1e9;
    for (let y = Math.max(1, Math.floor(py - r)); y <= Math.min(H - 2, Math.ceil(py + r)); y++) {
      for (let x = Math.max(1, Math.floor(px - r)); x <= Math.min(W - 2, Math.ceil(px + r)); x++) {
        const i = y * W + x;
        const o = st.owner[i];
        if (o !== city.id && o !== -1) continue;
        if (st.structAt[i] !== -1 || st.inRing[i] !== -1) continue;
        if (!WW.Structs.canBuildTile(sim, i, city.race)) continue;
        if (LUT[res][st.terrain[i]]) continue;
        let n = 0, bad = false;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const j = (y + dy) * W + x + dx;
          if (LUT[res][st.terrain[j]]) n++;
          const s = sim._structs.get(st.structAt[j]);
          if (s && (WW.Structs.isWallish(s) || (WW.Walls.CORE[s.type] && Math.abs(dx) <= 1 && Math.abs(dy) <= 1))) bad = true;
        }
        if (bad || n < 4) continue;
        const d = Math.sqrt((x + 0.5 - px) * (x + 0.5 - px) + (y + 0.5 - py) * (y + 0.5 - py));
        if (d < 4) continue;
        const score = n * 0.5 - d * 0.6;
        if (score > bs) { bs = score; best = i; }
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
      const ok = canFoundAtOwn(sim, city, city.cx, city.cy);
      if (ok) {
        const s = WW.Structs.create(sim, 'center', city.cx, city.cy, city.id, { built: false, gov: k ? k.gov : 'tribe' });
        if (s) { city.centerId = s.id; city.sites.push(s.id); }
      }
      return;
    }
    if (!city.centerOk) return;
    const open = countSites(sim, city, true);
    const maxOpen = 2 + city.tier;
    // Häuser
    if (open < maxOpen && city.pop + 2 >= city.housing && st.units.length < WW.CONFIG.MAX_UNITS) {
      const cost = WW.Structs.costFor(sim, 'house', 1, city.id);
      if (sk.wood >= cost.wood || open === 0) {
        const i = findCoreSpot(sim, city);
        if (i >= 0) {
          const old = sim._structs.get(st.structAt[i]);
          if (old) WW.Structs.remove(sim, old);
          const s = WW.Structs.create(sim, 'house', i % W, Math.floor(i / W), city.id, { built: false });
          if (s) { city.sites.push(s.id); if (city.houses === 0) sim.event('firstHouse', { city: city.name }, atCity(city)); city.houses++; }
          city.noSpace = false;
        } else if (city.wall.plan) {
          city.noSpace = true;
          // Platz schaffen: Häuser aufstocken
          upgradeHouse(sim, city, sk);
        }
      }
    } else if (city.tier >= 1 && city.pop + 1 >= city.housing && sk.stone >= 8 && open < maxOpen) {
      upgradeHouse(sim, city, sk);
    }
    // Felder
    const wantFields = Math.max(2, Math.ceil(city.pop / 2.3));
    if (city.fields.length < wantFields) {
      const i = findFieldSpot(sim, city);
      if (i >= 0) {
        const s = WW.Structs.create(sim, 'field', i % W, Math.floor(i / W), city.id, { built: true });
        if (s) { city.fields.push(s.id); if (st.owner[i] === -1) { st.owner[i] = city.id; sim.markDirty(i); } }
      }
    }
    if (open >= maxOpen) return;
    // Holzfällerhütte / Steinbruch
    const hasLumber = city.drops.some(id => { const s = sim._structs.get(id); return s && s.type === 'lumber'; });
    const hasQuarry = city.drops.some(id => { const s = sim._structs.get(id); return s && s.type === 'quarry'; });
    if (!hasLumber && (city.jobs.lumberjack || 0) >= 2 && sk.wood >= 4 && city.pop >= 7) {
      const i = findDropSpot(sim, city, 'wood');
      if (i >= 0) { const s = WW.Structs.create(sim, 'lumber', i % W, Math.floor(i / W), city.id, {}); if (s) { city.sites.push(s.id); return; } }
    }
    if (!hasQuarry && (city.jobs.miner || 0) >= 1 && sk.wood >= 4 && city.pop >= 10) {
      const i = findDropSpot(sim, city, 'stone');
      if (i >= 0) { const s = WW.Structs.create(sim, 'quarry', i % W, Math.floor(i / W), city.id, {}); if (s) { city.sites.push(s.id); return; } }
    }
    // Kaserne, Markt, Denkmal
    const extra = [];
    if (!city.hasBarracks && g.soldierShare >= 0.1 && city.pop >= 14) extra.push('barracks');
    if (!city.hasMarket && !g.noMarket && city.pop >= 16) extra.push('market');
    if (!city.hasMonument && city.pop >= 22) extra.push('monument');
    for (const type of extra) {
      const cost = WW.Structs.costFor(sim, type, 1, city.id);
      if (!canPay(sim, city, cost)) continue;
      const i = findCoreSpot(sim, city);
      if (i < 0) { if (city.wall.plan) city.noSpace = true; break; }
      const old = sim._structs.get(st.structAt[i]);
      if (old) WW.Structs.remove(sim, old);
      const s = WW.Structs.create(sim, type, i % W, Math.floor(i / W), city.id, { gov: k ? k.gov : 'tribe' });
      if (s) {
        city.sites.push(s.id);
        if (type === 'monument') sim.event('monument', { city: city.name, monument: g.monumentName, deity: (k && k.deity) || '' }, atCity(city));
        if (type === 'barracks') city.hasBarracks = true;
        if (type === 'market') city.hasMarket = true;
        if (type === 'monument') city.hasMonument = true;
      }
      break;
    }
  }

  function upgradeHouse(sim, city, sk) {
    if (city.tier < 1) return false;
    let best = null;
    for (const s of sim.state.structs) {
      if (s.dead || s.cityId !== city.id || s.type !== 'house' || !s.built || s.upgradeTo || s.level >= 3) continue;
      if (s.level === 2 && city.tier < 2) continue;
      if (!best || s.level < best.level) best = s;
    }
    if (!best) return false;
    const cost = WW.Structs.costFor(sim, 'house', best.level + 1, city.id);
    if (sk.stone < cost.stone || sk.wood < cost.wood) return false;
    best.upgradeTo = best.level + 1; best.progress = 0; best.paid = false;
    city.sites.push(best.id);
    return true;
  }

  function canFoundAtOwn(sim, city, x, y) {
    const st = sim.state, W = st.W;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = (y + dy) * W + x + dx;
      if (WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0) return false;
      const s = sim._structs.get(st.structAt[i]);
      if (s) { if (s.type === 'ruin' || s.type === 'field') WW.Structs.remove(sim, s); else return false; }
    }
    return true;
  }

  function atCity(city) { return { kingdomId: city.kingdomId, cityId: city.id, x: city.cx + 1, y: city.cy + 1 }; }

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
          if (!city.hungry) sim.event('famine', { city: city.name }, atCity(city));
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
      if (city.hasMarket) gold += 0.08;
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
      sim.event('tier', { city: city.name, tier: WW.CITY_TIERS[tier].name }, atCity(city));
    } else if (tier < city.tier - 1) city.tier = tier + 1;
    // Kommunismus: Stadt zeigt eine Kopie des Reichslagers
    if (sk !== city.stock) { city.stock.food = sk.food; city.stock.wood = sk.wood; city.stock.stone = sk.stone; city.stock.gold = sk.gold; }
  }

  // Rohstoffe in Reichweite? (einmal je Jahr)
  function scanResources(sim, city) {
    const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
    const r = territoryRadius(city) + 5;
    const px = city.cx + 1, py = city.cy + 1;
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
    const px = city.cx + 1, py = city.cy + 1;
    const race = WW.RACES[city.race] || WW.RACES.human;
    if (sim._compDirty) WW.Path.updateComponents(sim);
    const myComp = sim.comp[(city.cy + 1) * W + city.cx];
    let best = null, bs = -1e9;
    for (let n = 0; n < 50; n++) {
      const ang = sim.rng.next() * Math.PI * 2;
      const dist = WW.CONFIG.SETTLER_DIST_MIN + sim.rng.next() * (WW.CONFIG.SETTLER_DIST_MAX - WW.CONFIG.SETTLER_DIST_MIN);
      const x = Math.round(px + Math.cos(ang) * dist), y = Math.round(py + Math.sin(ang) * dist);
      if (x < 3 || y < 3 || x >= W - 4 || y >= H - 4) continue;
      if (!canFoundAt(sim, x, y, city.race)) continue;
      if (sim.comp[y * W + x] !== myComp) continue;
      let free = 0, owned = 0, fav = 0;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const i = (y + dy) * W + x + dx;
        if (x + dx < 0 || y + dy < 0 || x + dx >= W || y + dy >= H) continue;
        if (st.owner[i] !== -1) owned++;
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
    if (!k || k.cityIds.length >= 8) return;
    const site = findSettleSite(sim, city);
    city.lastSettlers = st.year;
    if (!site) return;
    const group = st.nextId++;
    let n = 0;
    for (const u of city._members) {
      if (n >= 5) break;
      if (u.role === 'leader' || u.role === 'child' || u.role === 'rebel' || u.role === 'soldier' || u.merc) continue;
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
      const x = s.x, y = s.y, type = s.type;
      WW.Structs.remove(sim, s);
      if (type !== 'field') WW.Structs.create(sim, 'ruin', x, y, -1, { built: true, ruinOf: type });
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
    if (reason) sim.event(reason, { city: city.name, kingdom: k ? k.name : '' }, { kingdomId: k ? k.id : -1, cityId: -1, x: city.cx + 1, y: city.cy + 1 });
  }

  // Stadt wechselt das Reich (Eroberung, Abspaltung)
  function transferCity(sim, city, newKingdomId) {
    const old = kingdomOf(sim, city);
    const nk = sim._kingdoms.get(newKingdomId);
    if (!nk || old === nk) return;
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
    const ctr = sim._structs.get(city.centerId);
    if (ctr) { ctr.gov = nk.gov; sim.markDirty(ctr.y * sim.state.W + ctr.x); }
    for (const s of sim.state.structs) if (!s.dead && s.cityId === city.id) {
      if (s.type === 'monument') s.gov = nk.gov;
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
      if ((city.tier >= 2 || city.pop >= 26) && city.adults >= 14 && st.year - city.lastSettlers >= 7 && city.centerOk) sendSettlers(sim, city);
    }
  }

  WW.Cities = {
    found: found, canFoundAt: canFoundAt, stock: stock, addStock: addStock, canPay: canPay, pay: pay,
    centerPt: centerPt, centerTile: centerTile, territoryRadius: territoryRadius, claimTerritory: claimTerritory,
    releaseTerritory: releaseTerritory, refreshLists: refreshLists, refreshAllLists: refreshAllLists, stats: stats,
    updateAll: updateAll, yearly: yearly, destroyCity: destroyCity, transferCity: transferCity, atCity: atCity,
    findCoreSpot: findCoreSpot, findFieldSpot: findFieldSpot, happinessTarget: happinessTarget, scanResources: scanResources,
    sendSettlers: sendSettlers, findSettleSite: findSettleSite, HOUSE_CAP: HOUSE_CAP
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
