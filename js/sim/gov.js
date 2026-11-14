// Reiche und Regierungen: Anlegen, Regierungswechsel, Anführer und Erbfolge, Wahlen,
// Fünfjahrespläne, Wunder, Plenum, Propaganda, Revolutionen und Putsche.
(function (WW) { 'use strict';

  const U = () => WW.SimUtil;

  function G(k) { return WW.GOVERNMENTS[k.gov] || WW.GOVERNMENTS.tribe; }
  function capital(sim, k) { return sim._cities.get(k.capitalId) || sim._cities.get(k.cityIds[0]) || null; }
  function atK(sim, k) {
    const c = capital(sim, k);
    return { kingdomId: k.id, cityId: c ? c.id : -1, x: c ? c.cx + 0.5 : 0, y: c ? c.cy + 0.5 : 0 };
  }

  function freeColor(sim) {
    const used = new Array(12).fill(0);
    for (const k of sim.state.kingdoms) used[k.colorIndex % 12]++;
    let best = 0;
    for (let i = 0; i < 12; i++) if (used[i] < used[best]) best = i;
    // bei Gleichstand zufällig unter den seltensten
    const cands = [];
    for (let i = 0; i < 12; i++) if (used[i] === used[best]) cands.push(i);
    return cands[sim.rng.int(cands.length)];
  }

  function pickGovForRace(sim, race) {
    const r = WW.RACES[race] || WW.RACES.human;
    return sim.rng.weighted(r.govPrefs);
  }

  // Neues Reich (ohne Stadt)
  function createKingdom(sim, o) {
    const st = sim.state;
    const race = WW.RACES[o.race] ? o.race : 'human';
    const gov = WW.GOVERNMENTS[o.gov] ? o.gov : (o.gov === 'random' ? pickGovForRace(sim, race) : 'tribe');
    const k = {
      id: st.nextId++, baseName: o.baseName || 'Niemandsland', name: '', race: race,
      colorIndex: o.colorIndex != null ? o.colorIndex : freeColor(sim), bannerPattern: sim.rng.int(8),
      gov: gov, govLocked: !!o.locked, leaderId: -1, leaderName: '', leaderTitle: '', leaderTrait: null,
      cityIds: [], capitalId: -1, relations: {},
      policy: { bonus: null, party: null, until: 0, plan: null, unrest: 0 },
      deity: null, stock: null, dynasty: {}, founded: st.year,
      nextElection: st.year + 2, nextPlan: st.year + 1, lastSham: st.year, govSince: st.year, lowYears: 0,
      laws: {}, mods: []   // Reichsgesetze und Modifikatoren (Ereignis-Teil)
    };
    k.name = WW.Names.realm(k.baseName, gov);
    if (gov === 'theocracy') k.deity = WW.Names.deity(sim.rng);
    for (const o2 of st.kingdoms) {
      const op = Math.round(WW.govCompat(gov, o2.gov) * 3 + (o2.race === race ? 5 : 0));
      k.relations[o2.id] = { opinion: op, status: 'peace', since: st.year, weariness: 0, losses: 0, wars: 0 };
      o2.relations[k.id] = { opinion: op, status: 'peace', since: st.year, weariness: 0, losses: 0, wars: 0 };
    }
    st.kingdoms.push(k);
    sim._kingdoms.set(k.id, k);
    return k;
  }

  function removeKingdom(sim, k, silent) {
    const st = sim.state;
    if (k.dead) return;
    k.dead = true;
    for (const o of st.kingdoms) delete o.relations[k.id];
    st.kingdoms = st.kingdoms.filter(x => x !== k);
    sim._kingdoms.delete(k.id);
    for (const u of st.units) if (!u.dead && u.kingdomId === k.id && u.cityId < 0) WW.Units.kill(sim, u, 'gone');
    if (!silent) sim.event('kingdomGone', { kingdom: k.name }, { kingdomId: -1, cityId: -1, x: 0, y: 0 });
  }

  // Name des Anführers nach Regierungsform
  function leaderNameFor(sim, k, u) {
    if (k.gov === 'monarchy') {
      const n = (k.dynasty[u.name] || 0) + 1;
      k.dynasty[u.name] = n;
      const num = n > 1 ? ' ' + U().roman(n) + '.' : '';
      return u.name + num + (u.female ? ' die ' : ' der ') + WW.Names.epithet(sim.rng);
    }
    if (k.gov === 'tribe' && sim.rng.chance(0.5)) return u.name + (u.female ? ' die ' : ' der ') + WW.Names.epithet(sim.rng);
    return u.name;
  }

  function titleFor(k, female) {
    const g = G(k);
    return female ? g.titleF : g.titleM;
  }

  // Neuen Anführer aus der Hauptstadt bestimmen
  function appointLeader(sim, k, preferName) {
    const g = G(k);
    if (g.noLeader) { k.leaderId = -1; k.leaderName = 'Plenum'; k.leaderTitle = ''; return null; }
    const cap = capital(sim, k);
    let best = null, bs = -1e9;
    for (const u of sim.state.units) {
      if (u.dead || u.kingdomId !== k.id) continue;
      if (u.role === 'child' || u.role === 'rebel' || u.role === 'settler' || u.merc || u.role === 'leader' || u.order || WW.Units.isEngine(u.role)) continue;
      let sc = 0;
      if (cap && u.cityId === cap.id) sc += 50;
      if (u.role === 'soldier') sc += (k.gov === 'fascism' ? 20 : -10);
      if (u.role === 'trader') sc += (k.gov === 'republic' ? 20 : -5);
      sc += Math.min(30, u.age) * 0.3 + sim.rng.next() * 8;
      if (sc > bs) { bs = sc; best = u; }
    }
    if (!best) { k.leaderId = -1; k.leaderName = '–'; k.leaderTitle = titleFor(k, false); return null; }
    WW.Units.setRole(sim, best, 'leader');
    if (preferName) best.name = preferName;
    k.leaderId = best.id;
    k.leaderName = leaderNameFor(sim, k, best);
    k.leaderTrait = TRAIT_KEYS[sim.rng.int(TRAIT_KEYS.length)];
    k.leaderTitle = titleFor(k, best.female);
    best.bubble = { icon: 'crown', ttl: 60 };
    return best;
  }

  function leaderFull(k) {
    return (k.leaderTitle ? k.leaderTitle + ' ' : '') + k.leaderName;
  }

  // Regierungswechsel; o = { lock, reason }
  function applyGov(sim, k, gov, o) {
    o = o || {};
    if (!k || !WW.GOVERNMENTS[gov]) return false;
    const st = sim.state;
    const old = k.gov;
    if (o.lock != null) k.govLocked = !!o.lock;
    if (old === gov) return true;
    const og = WW.GOVERNMENTS[old], ng = WW.GOVERNMENTS[gov];
    // Lager zusammenlegen / aufteilen
    if (ng.sharedStock && !og.sharedStock) {
      k.stock = WW.Cities.emptyStock();
      for (const id of k.cityIds) { const c = sim._cities.get(id); if (!c) continue; for (const r in k.stock) k.stock[r] += (c.stock[r] || 0); }
      k.stock.gold = 0;
    } else if (!ng.sharedStock && og.sharedStock && k.stock) {
      let pop = 0;
      for (const id of k.cityIds) { const c = sim._cities.get(id); if (c) pop += Math.max(1, c.pop); }
      for (const id of k.cityIds) {
        const c = sim._cities.get(id); if (!c) continue;
        const f = Math.max(1, c.pop) / Math.max(1, pop);
        for (const r in c.stock) c.stock[r] = (k.stock[r] || 0) * f;
      }
      k.stock = null;
    }
    k.gov = gov;
    k.govSince = st.year;
    k.name = WW.Names.realm(k.baseName, gov);
    k.policy = { bonus: null, party: null, until: 0, plan: null, unrest: 0 };
    k.lowYears = 0;
    if (gov === 'theocracy' && !k.deity) k.deity = WW.Names.deity(sim.rng);
    if (gov === 'democracy') k.nextElection = st.year + 1 + sim.rng.int(2);
    if (gov === 'communism') k.nextPlan = st.year;
    if (gov === 'fascism') k.lastSham = st.year;
    // Umbau: jede Stadt im neuen Stil (Zentrum sofort Baustelle, Rest nach und nach)
    for (const id of k.cityIds) { const c = sim._cities.get(id); if (c) restyleCity(sim, c, gov); }
    for (const s of st.structs) {
      if (s.dead || !WW.Structs.isWallish(s)) continue;
      const c = sim._cities.get(s.cityId);
      if (!c || c.kingdomId !== k.id) continue;
      const f = s.hp / Math.max(1, s.maxHp); s.maxHp = WW.Structs.maxHpFor(sim, s); s.hp = Math.max(1, Math.round(s.maxHp * f));
    }
    // Anführer neu
    const oldLeader = sim._units.get(k.leaderId);
    if (oldLeader && !oldLeader.dead) {
      if (ng.noLeader) { WW.Units.setRole(sim, oldLeader, 'farmer'); k.leaderId = -1; k.leaderName = 'Plenum'; k.leaderTitle = ''; }
      else { k.leaderName = leaderNameFor(sim, k, oldLeader); k.leaderTitle = titleFor(k, oldLeader.female); }
    } else appointLeader(sim, k);
    // Händler/Rebellen aufräumen
    for (const u of st.units) {
      if (u.dead || u.kingdomId !== k.id) continue;
      if (u.role === 'trader' && !ng.traders) WW.Units.setRole(sim, u, 'farmer');
      if (u.role === 'soldier' && ng.soldierShare === 0 && !u.merc) WW.Units.setRole(sim, u, 'farmer');
    }
    for (const id of k.cityIds) {
      const c = sim._cities.get(id);
      if (!c) continue;
      sim.fx({ type: 'govchange', x: c.cx + 0.5, y: c.cy + 0.5, gov: gov });
      if (c.wall && c.wall.plan) c.wall.style = WW.Walls.wallStyle(ng, Math.max(1, c.wall.level || 1));
    }
    if (o.reason !== 'silent') {
      sim.event(o.reason || 'gov', { kingdom: k.name, gov: ng.name, oldGov: og.name, leader: leaderFull(k), deity: k.deity || '', why: o.why || '' }, atK(sim, k));
    }
    st.pathVersion++;
    if (WW.Events && typeof WW.Events.onGovChange === 'function') WW.Events.onGovChange(sim, k);
    return true;
  }

  // Stadt im Stil einer Regierung umbauen. Unbekannte Gebäude werden umgewidmet oder abgerissen.
  const RESTYLE = { center: 1, house: 1, monument: 1, barracks: 1, market: 1, wall: 1, gate: 1, tower: 1 };
  function restyleCity(sim, city, gov) {
    const st = sim.state;
    const g = WW.GOVERNMENTS[gov];
    let monuments = 0;
    const allowedMon = Math.max(1, WW.govBuildCount(gov, 'monument', Math.max(city.pop, 200)));
    let changed = 0, converted = 0;
    for (const s of st.structs) {
      if (s.dead || s.cityId !== city.id) continue;
      // Gebäude, die die neue Regierung nicht kennt
      if ((s.type === 'market' && !g.build.market.max) || (s.type === 'barracks' && !g.build.barracks.max)) {
        s.type = 'house'; s.level = 1; s.upgradeTo = 0; if (s.variant == null) s.variant = sim.rng.int(256);
        s.maxHp = WW.Structs.maxHpFor(sim, s); s.hp = Math.min(s.hp, s.maxHp);
        converted++;
      }
      if (s.type === 'tower' && !g.build.towerSpacing) { s.type = 'wall'; s.maxHp = WW.Structs.maxHpFor(sim, s); s.hp = Math.min(s.hp, s.maxHp); WW.Structs.updateMasksAround(sim, s.x, s.y); }
      if (s.type === 'monument' && ++monuments > allowedMon) { WW.Structs.remove(sim, s); continue; }
      if (s.style === gov && !s.restyle) continue;
      // Lager und Dorfhalle sehen bei allen Regierungen gleich aus: dort nur den Stil merken
      if (!RESTYLE[s.type] || !s.built || (s.type === 'center' && ((s.stage || 0) < 2 || s.upgrading))) { s.style = gov; s.restyle = null; }
      else { s.restyle = gov; if (!s.upgradeTo) { s.progress = 0; s.paid = true; } }
      changed++;
      WW.Structs.forTiles(sim, s, (i) => sim.markDirty(i));
    }
    // Turmdichte der neuen Regierung (ab Steinmauer)
    const w = city.wall;
    if (w && w.plan && w.level >= 2 && g.build.towerSpacing > 0) {
      const W = st.W, sp = g.build.towerSpacing;
      const towers = [], gates = (w.gates || []).map(t => [t % W, Math.floor(t / W)]);
      const pieces = [];
      for (const t of w.plan) { const p = sim._structs.get(st.structAt[t]); if (p && p.cityId === city.id && WW.Structs.isWallish(p)) pieces.push(p); }
      for (const p of pieces) if (p.type === 'tower') towers.push([p.x, p.y]);
      const far = (x, y, list, d) => { for (const o of list) if (Math.max(Math.abs(o[0] - x), Math.abs(o[1] - y)) < d) return false; return true; };
      for (const p of pieces) {
        if (p.type !== 'wall' || !p.built || !far(p.x, p.y, towers, sp) || !far(p.x, p.y, gates, 2)) continue;
        p.type = 'tower'; p.maxHp = WW.Structs.maxHpFor(sim, p); p.restyle = gov; p.progress = 0; p.paid = true;
        towers.push([p.x, p.y]);
        WW.Structs.updateMasksAround(sim, p.x, p.y); sim.markDirty(p.y * W + p.x);
      }
      w.towers = pieces.filter(p => p.type === 'tower').map(p => p.y * W + p.x);
    }
    if (g.barricades) { /* bestehende Mauern bleiben, neue Stücke werden Barrikaden */ }
    else if (city.wall && city.wall.gaps && city.wall.gaps.length) city.wall.gaps = [];   // Lücken werden geschlossen
    if (city.wall && city.wall.plan) city.wall.style = WW.Walls.wallStyle(g, Math.max(1, city.wall.level || 1));
    city.restyleGov = gov;
    WW.Cities.refreshLists(sim, city);
    if (converted) sim.event('repurpose', { city: city.name, gov: g.name, n: converted }, WW.Cities.atCity(city));
    return changed;
  }

  // ----------------------------------------------------------------------------
  // Ereignisse
  // ----------------------------------------------------------------------------
  function onLeaderDeath(sim, k, u, cause) {
    const g = G(k);
    const oldFull = leaderFull(k);
    k.leaderId = -1;
    const nu = appointLeader(sim, k);
    const vars = { kingdom: k.name, old: oldFull, leader: leaderFull(k), city: (capital(sim, k) || {}).name || '' };
    if (k.gov === 'monarchy') {
      sim.event('succession', vars, atK(sim, k));
      if (nu && sim.rng.chance(0.2)) throneFeud(sim, k);
    } else if (k.gov === 'democracy') {
      sim.event('leaderDeath', vars, atK(sim, k));
      k.nextElection = Math.min(k.nextElection, sim.state.year + 1);
    } else if (!g.noLeader) {
      sim.event('leaderDeath', vars, atK(sim, k));
    }
  }

  function throneFeud(sim, k) {
    const st = sim.state;
    const claimant = WW.Names.person(sim.rng, k.race, sim.rng.chance(0.5));
    k.policy.unrest = st.year + 3;
    sim.event('throneFeud', { kingdom: k.name, leader: leaderFull(k), claimant: claimant }, atK(sim, k));
    // Thronstreit kostet Loyalität (Abspaltung über das Loyalitäts-System)
    for (const id of k.cityIds) { const c = sim._cities.get(id); if (c && id !== k.capitalId) c.loyalty = (c.loyalty == null ? 50 : c.loyalty) - 35; }
  }

  function election(sim, k) {
    const st = sim.state;
    const cap = capital(sim, k);
    const n = 2 + sim.rng.int(2);
    const bonuses = sim.rng.shuffle(['bread', 'walls', 'nap', 'trade', 'safety', 'green']).slice(0, n);
    const cands = [];
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const female = sim.rng.chance(0.5);
      const w = 0.4 + sim.rng.next();
      sum += w;
      cands.push({ name: WW.Names.person(sim.rng, k.race, female), female: female, party: WW.Names.party(sim.rng, bonuses[i]), bonus: bonuses[i], w: w });
    }
    let rest = 100;
    for (let i = 0; i < n; i++) {
      cands[i].pct = i === n - 1 ? rest : Math.max(1, Math.round(cands[i].w / sum * 100));
      rest -= cands[i].pct;
    }
    if (cands[n - 1].pct < 1) { cands[n - 1].pct = 1; cands[0].pct -= 1; }
    cands.sort((a, b) => b.pct - a.pct);
    const win = cands[0], lose = cands[1];
    // Sieger übernimmt (alte Regierung tritt zurück)
    const old = sim._units.get(k.leaderId);
    if (old && !old.dead) WW.Units.setRole(sim, old, 'farmer');
    k.leaderId = -1;
    const u = appointLeader(sim, k, win.name);
    if (u) { u.female = win.female; k.leaderTitle = titleFor(k, win.female); k.leaderName = win.name; }
    k.policy.bonus = win.bonus; k.policy.party = win.party; k.policy.until = st.year + 6;
    k.nextElection = st.year + 6;
    const res = cands.map(c => c.name + ' (' + c.party + ') ' + c.pct + ' %').join(', ');
    sim.event('election', {
      city: cap ? cap.name : k.name, kingdom: k.name, winner: win.name, party: win.party, pct: win.pct,
      loser: lose.name, loserParty: lose.party, loserPct: lose.pct, bonus: WW.Names.PARTY_BONUS_NAMES[win.bonus],
      results: res, n: n
    }, atK(sim, k));
    // Wahlkampf-Sprechblasen
    for (const id of k.cityIds) {
      const c = sim._cities.get(id);
      if (!c || !c._members) continue;
      for (let i = 0; i < c._members.length; i += 3) WW.Units.bubble(c._members[i], 'ballot', 40);
    }
  }

  function shamElection(sim, k) {
    const cap = capital(sim, k);
    const pct = sim.rng.pick([104, 108, 112, 112, 117, 121, 99.9]);
    k.lastSham = sim.state.year;
    sim.event('shamElection', { city: cap ? cap.name : k.name, kingdom: k.name, leader: leaderFull(k), pct: pct, party: WW.Names.regimeParty(sim.rng) }, atK(sim, k));
  }

  function fiveYearPlan(sim, k) {
    const st = sim.state;
    const prev = k.policy.plan;
    if (prev) {
      sim.event('planResult', { kingdom: k.name, goal: prev.goal, pct: 100 + sim.rng.int(250) }, atK(sim, k));
    }
    const focus = sim.rng.pick(WW.Names.PLAN_FOCUS);
    const goal = WW.Names.planGoal(sim.rng, focus);
    k.policy.plan = { focus: focus, goal: goal, until: st.year + 5 };
    k.nextPlan = st.year + 5;
    const cap = capital(sim, k);
    sim.event('fiveYearPlan', { kingdom: k.name, city: cap ? cap.name : k.name, goal: goal, focus: WW.Names.PLAN_FOCUS_NAMES[focus] }, atK(sim, k));
  }

  function miracle(sim, k) {
    const st = sim.state;
    const cap = capital(sim, k);
    if (!cap) return;
    if (sim.rng.chance(0.5)) {
      for (const id of k.cityIds) for (const fid of (sim._cities.get(id) || { fields: [] }).fields) {
        const f = sim._structs.get(fid); if (f) { f.growth = 3; f.gprog = 0; sim.markDirty(f.y * st.W + f.x); }
      }
      sim.event('miracleHarvest', { kingdom: k.name, city: cap.name, deity: k.deity }, atK(sim, k));
    } else {
      for (const u of st.units) if (!u.dead && u.kingdomId === k.id) { u.hp = u.maxHp; u.sick = false; }
      sim.event('miracleHeal', { kingdom: k.name, city: cap.name, deity: k.deity }, atK(sim, k));
    }
    sim.fx({ type: 'sparkle', x: cap.cx + 0.5, y: cap.cy + 0.5 });
  }

  function avgHappiness(sim, k) {
    let s = 0, n = 0;
    for (const id of k.cityIds) { const c = sim._cities.get(id); if (c) { s += c.happiness * Math.max(1, c.pop); n += Math.max(1, c.pop); } }
    return n ? s / n : 50;
  }
  function kingdomPop(sim, k) {
    let p = 0;
    for (const id of k.cityIds) { const c = sim._cities.get(id); if (c) p += c.pop; }
    return p;
  }

  // Händler der Handelsrepublik
  function manageTraders(sim, k) {
    const g = G(k);
    if (!g.traders) return;
    let partners = k.cityIds.length - 1;
    for (const oid in k.relations) if (k.relations[oid].status === 'alliance') partners++;
    if (partners <= 0) return;
    for (const id of k.cityIds) {
      const c = sim._cities.get(id);
      if (!c || !c._members || c.pop < 8) continue;
      const want = Math.min(3, 1 + Math.floor(c.pop / 25));
      let have = c.jobs.trader || 0;
      for (const u of c._members) {
        if (have >= want) break;
        if (u.role === 'farmer' || u.role === 'lumberjack') { WW.Units.setRole(sim, u, 'trader'); have++; }
      }
    }
  }

  // alle 20 Ticks
  function update(sim) {
    const st = sim.state;
    for (const k of st.kingdoms.slice()) {
      if (k.dead) continue;
      // verwaiste Reiche entfernen
      if (!k.cityIds.length) {
        let any = false;
        for (const u of st.units) if (!u.dead && u.kingdomId === k.id) { any = true; break; }
        if (!any) { removeKingdom(sim, k); continue; }
      }
      if (k.capitalId < 0 || !sim._cities.get(k.capitalId)) k.capitalId = k.cityIds.length ? k.cityIds[0] : -1;
      const g = G(k);
      if (!g.noLeader) {
        const l = sim._units.get(k.leaderId);
        if (!l || l.dead || l.kingdomId !== k.id) { k.leaderId = -1; if (k.cityIds.length) appointLeader(sim, k); }
      }
      if (k.policy.until && st.year >= k.policy.until) { k.policy.bonus = null; k.policy.party = null; k.policy.until = 0; }
    }
  }

  // jährlich
  function yearly(sim) {
    const st = sim.state;
    for (const k of st.kingdoms.slice()) {
      if (k.dead || !k.cityIds.length) continue;
      const g = G(k);
      const cap = capital(sim, k);
      const vars = { kingdom: k.name, city: cap ? cap.name : k.name, leader: leaderFull(k), deity: k.deity || '' };
      manageTraders(sim, k);
      switch (k.gov) {
        case 'democracy':
          if (st.year >= k.nextElection) election(sim, k);
          break;
        case 'fascism':
          if (st.year - k.lastSham >= 6) shamElection(sim, k);
          for (const id of k.cityIds) {
            const c = sim._cities.get(id);
            if (c && c.hasMonument && (st.year % 3 === 0)) { c.propaganda = 22; if (sim.rng.chance(0.5)) sim.event('propaganda', { city: c.name, kingdom: k.name, leader: leaderFull(k) }, WW.Cities.atCity(c)); }
          }
          if (sim.rng.chance(0.18)) sim.event('paranoia', vars, atK(sim, k));
          break;
        case 'communism':
          if (st.year >= k.nextPlan) fiveYearPlan(sim, k);
          break;
        case 'theocracy':
          if (sim.rng.chance(0.12)) miracle(sim, k);
          else if (sim.rng.chance(0.1)) sim.event('sermon', vars, atK(sim, k));
          break;
        case 'anarchy':
          if (sim.rng.chance(0.25)) sim.event('plenum', Object.assign({ n: WW.SimUtil.ordinalWord(1 + sim.rng.int(9)) }, vars), atK(sim, k));
          break;
        case 'monarchy':
          if (sim.rng.chance(0.08)) sim.event('royalDecree', vars, atK(sim, k));
          break;
        case 'republic':
          if (sim.rng.chance(0.08)) sim.event('council', vars, atK(sim, k));
          break;
        case 'tribe':
          if (sim.rng.chance(0.06)) sim.event('tribeCouncil', vars, atK(sim, k));
          break;
      }
      // Regierungen ändern sich von selbst
      if (!st.laws.govChanges || k.govLocked) { k.lowYears = 0; continue; }
      const hap = avgHappiness(sim, k);
      if (hap < 24) k.lowYears++; else k.lowYears = Math.max(0, k.lowYears - 1);
      const years = st.year - k.govSince;
      const crisis = WW.Diplo.atWar(sim, k.id) || anyHungry(sim, k) || hap < 40;
      // Stamm wählt ab Dorfgröße selbst
      if (k.gov === 'tribe' && cap && cap.tier >= 1 && years >= 2 && sim.rng.chance(0.35)) {
        const ch = chooseGov(sim, k);
        applyGov(sim, k, ch.gov, { lock: false, reason: 'govChoice', why: ch.why });
        continue;
      }
      // Revolution / Sturz des Regimes
      if (k.lowYears >= 3 && years >= 4) {
        const ch = chooseGov(sim, k, { unhappy: true });
        applyGov(sim, k, ch.gov, { lock: false, reason: k.gov === 'fascism' ? 'regimeFall' : 'revolution', why: ch.why });
        continue;
      }
      // Zusammenbruch in Anarchie
      if (k.gov !== 'anarchy' && hap < 18 && k.lowYears >= 2 && years >= 3 && sim.rng.chance(0.2)) {
        applyGov(sim, k, 'anarchy', { lock: false, reason: 'collapse' });
        continue;
      }
      // Putsch im Krieg
      if (WW.Diplo.atWar(sim, k.id) && hap < 35 && (k.gov === 'republic' || k.gov === 'monarchy') && years >= 3 && sim.rng.chance(0.05)) {
        applyGov(sim, k, 'fascism', { lock: false, reason: 'coup' });
        continue;
      }
      // Starker Mann: Demokratie wählt in der Krise einen Diktator
      if (k.gov === 'democracy' && crisis && years >= 4 && sim.rng.chance(0.05)) {
        applyGov(sim, k, 'fascism', { lock: false, reason: 'strongman' });
        continue;
      }
      // Reform: zufriedene, große Monarchie wird Demokratie
      if (k.gov === 'monarchy' && hap > 60 && kingdomPop(sim, k) >= 40 && years >= 12 && sim.rng.chance(0.04)) {
        applyGov(sim, k, 'democracy', { lock: false, reason: 'reform' });
        continue;
      }
      // Reiche Republik oder fromme Stadt: leiser Wandel
      if (k.gov !== 'theocracy' && k.gov !== 'fascism' && years >= 10 && countType(sim, k, 'monument') >= 3 && sim.rng.chance(0.03)) {
        applyGov(sim, k, 'theocracy', { lock: false, reason: 'govChoice', why: 'zu viele Schreine, um sie zu ignorieren' });
        continue;
      }
      if (k.gov === 'anarchy' && years >= 10 && sim.rng.chance(0.03)) {
        applyGov(sim, k, 'democracy', { lock: false, reason: 'plenumVote' });
      }
    }
  }

  function anyHungry(sim, k) {
    for (const id of k.cityIds) { const c = sim._cities.get(id); if (c && c.hungry) return true; }
    return false;
  }
  function countType(sim, k, type) {
    let n = 0;
    for (const s of sim.state.structs) if (!s.dead && s.type === type) { const c = sim._cities.get(s.cityId); if (c && c.kingdomId === k.id) n++; }
    return n;
  }

  // Charakter des Anführers -> Vorliebe
  const TRAITS = {
    pious: { theocracy: 2.5 }, greedy: { republic: 2.5, monarchy: 1.2 }, bossy: { monarchy: 1.8, fascism: 1.6 },
    gentle: { democracy: 2.2, anarchy: 1.3 }, dreamy: { anarchy: 2.2, communism: 1.5 }, stern: { communism: 1.6, fascism: 1.3, monarchy: 1.3 }
  };
  const TRAIT_KEYS = Object.keys(TRAITS);

  // Regierung selbst wählen: Volk, Lage, Charakter des Anführers. Rückgabe { gov, why }
  function chooseGov(sim, k, o) {
    o = o || {};
    const st = sim.state;
    const race = WW.RACES[k.race] || WW.RACES.human;
    const w = {};
    for (const g of WW.GOV_KEYS) w[g] = race.govPrefs[g] || 1;
    delete w.tribe;
    const why = {};
    const bump = (g, f, reason) => { if (w[g] == null) return; w[g] *= f; if (f > 1) why[g] = why[g] || []; if (f > 1) why[g].push(reason); };
    const hap = avgHappiness(sim, k), pop = kingdomPop(sim, k);
    let gold = 0;
    for (const id of k.cityIds) { const c = sim._cities.get(id); if (c) gold += WW.Cities.stock(sim, c).gold; }
    // Bedrohung: Krieg oder feindselige Nachbarn
    let threat = WW.Diplo.atWar(sim, k.id);
    for (const oid in k.relations) if (k.relations[oid].opinion < -40) threat = true;
    if (threat) { bump('monarchy', 2, 'man fühlt sich von den Nachbarn bedroht'); bump('fascism', 2.4, 'die Angst vor den Nachbarn ist groß'); bump('anarchy', 0.4); bump('democracy', 0.7); }
    if (gold > 30) bump('republic', 2.6, 'in den Truhen klimpert erstaunlich viel Gold');
    const mons = countType(sim, k, 'monument');
    if (mons >= 1) bump('theocracy', 1 + mons, 'der Hinkelstein wird inzwischen angebetet');
    if (hap < 40 || anyHungry(sim, k) || o.unhappy) { bump('communism', 2.6, 'die Leute sind arm, hungrig und haben die Nase voll'); bump('fascism', 1.4, 'jemand verspricht, endlich aufzuräumen'); bump('democracy', 0.8); }
    if (pop < 18 && hap > 62) { bump('democracy', 2, 'alle sind zufrieden und wollen mitreden'); bump('anarchy', 1.8, 'man kennt sich und braucht keinen Chef'); }
    const tr = TRAITS[k.leaderTrait];
    if (tr) for (const g in tr) bump(g, tr[g], 'der Anführer will es so, und er hat eine laute Stimme');
    if (o.unhappy && w[k.gov] != null) w[k.gov] *= 0.05;
    if (k.gov !== 'tribe' && w[k.gov] != null) w[k.gov] *= 0.3;
    const gov = sim.rng.weighted(w);
    const reasons = why[gov] || [];
    const text = reasons.length ? reasons[sim.rng.int(reasons.length)] : sim.rng.pick(['die Mehrheit war beim Abendessen dafür', 'das Los hat so entschieden', 'es sieht auf dem Schild gut aus', 'niemand hat widersprochen']);
    return { gov: gov, why: text };
  }

  WW.Gov = {
    createKingdom: createKingdom, removeKingdom: removeKingdom, applyGov: applyGov, appointLeader: appointLeader,
    onLeaderDeath: onLeaderDeath, update: update, yearly: yearly, election: election, fiveYearPlan: fiveYearPlan,
    shamElection: shamElection, miracle: miracle, pickGovForRace: pickGovForRace, leaderFull: leaderFull,
    avgHappiness: avgHappiness, kingdomPop: kingdomPop, capital: capital, titleFor: titleFor, restyleCity: restyleCity,
    chooseGov: chooseGov, TRAITS: TRAITS
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
