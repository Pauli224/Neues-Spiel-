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
    const gov = WW.GOVERNMENTS[o.gov] ? o.gov : pickGovForRace(sim, race);
    const k = {
      id: st.nextId++, baseName: o.baseName || 'Niemandsland', name: '', race: race,
      colorIndex: o.colorIndex != null ? o.colorIndex : freeColor(sim), bannerPattern: sim.rng.int(8),
      gov: gov, govLocked: !!o.locked, leaderId: -1, leaderName: '', leaderTitle: '',
      cityIds: [], capitalId: -1, relations: {},
      policy: { bonus: null, party: null, until: 0, plan: null, unrest: 0 },
      deity: null, stock: null, dynasty: {}, founded: st.year,
      nextElection: st.year + 2, nextPlan: st.year + 1, lastSham: st.year, govSince: st.year, lowYears: 0
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
      if (u.role === 'child' || u.role === 'rebel' || u.role === 'settler' || u.merc || u.role === 'leader') continue;
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
      k.stock = { food: 0, wood: 0, stone: 0, gold: 0 };
      for (const id of k.cityIds) { const c = sim._cities.get(id); if (!c) continue; for (const r in k.stock) k.stock[r] += c.stock[r]; }
      k.stock.gold = 0;
    } else if (!ng.sharedStock && og.sharedStock && k.stock) {
      let pop = 0;
      for (const id of k.cityIds) { const c = sim._cities.get(id); if (c) pop += Math.max(1, c.pop); }
      for (const id of k.cityIds) {
        const c = sim._cities.get(id); if (!c) continue;
        const f = Math.max(1, c.pop) / Math.max(1, pop);
        for (const r in c.stock) c.stock[r] = k.stock[r] * f;
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
    // Bauwerke umgestalten
    for (const s of st.structs) {
      if (s.dead) continue;
      const c = sim._cities.get(s.cityId);
      if (!c || c.kingdomId !== k.id) continue;
      if (s.type === 'center' || s.type === 'monument') { s.gov = gov; sim.markDirty(s.y * st.W + s.x); }
      if (WW.Structs.isWallish(s)) { const f = s.hp / Math.max(1, s.maxHp); s.maxHp = WW.Structs.maxHpFor(sim, s); s.hp = Math.max(1, Math.round(s.maxHp * f)); }
    }
    // Märkte verschwinden im Kommunismus
    if (ng.noMarket) for (const s of st.structs.slice()) {
      if (s.dead || s.type !== 'market') continue;
      const c = sim._cities.get(s.cityId);
      if (c && c.kingdomId === k.id) WW.Structs.remove(sim, s);
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
      sim.event(o.reason || 'gov', { kingdom: k.name, gov: ng.name, oldGov: og.name, leader: leaderFull(k), deity: k.deity || '' }, atK(sim, k));
    }
    st.pathVersion++;
    return true;
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
    // evtl. spaltet sich eine Stadt ab
    if (k.cityIds.length >= 2 && sim.rng.chance(0.5)) {
      const id = k.cityIds.find(i => i !== k.capitalId);
      const c = sim._cities.get(id);
      if (c) WW.Diplo.secede(sim, c, 'monarchy', claimant);
    }
  }

  function election(sim, k) {
    const st = sim.state;
    const cap = capital(sim, k);
    const n = 2 + sim.rng.int(2);
    const bonuses = sim.rng.shuffle(['bread', 'walls', 'nap', 'trade', 'safety']).slice(0, n);
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
      if (k.gov === 'tribe' && cap && cap.pop >= 24 && st.year - k.govSince >= 6) {
        let ng = pickGovForRace(sim, k.race);
        if (ng === 'tribe') ng = 'monarchy';
        applyGov(sim, k, ng, { lock: false, reason: 'evolve' });
        continue;
      }
      if (k.lowYears >= 4 && st.year - k.govSince >= 5) {
        const opts = k.gov === 'fascism' || k.gov === 'monarchy'
          ? { democracy: 3, communism: 2, anarchy: 2, republic: 1 }
          : { democracy: 1, communism: 1, anarchy: 1, monarchy: 1, republic: 1, theocracy: 1, fascism: 0.6 };
        delete opts[k.gov];
        applyGov(sim, k, sim.rng.weighted(opts), { lock: false, reason: k.gov === 'fascism' ? 'regimeFall' : 'revolution' });
        continue;
      }
      if (WW.Diplo.atWar(sim, k.id) && hap < 35 && (k.gov === 'democracy' || k.gov === 'republic' || k.gov === 'monarchy') && sim.rng.chance(0.04)) {
        applyGov(sim, k, 'fascism', { lock: false, reason: 'coup' });
        continue;
      }
      if (k.gov === 'anarchy' && st.year - k.govSince >= 10 && sim.rng.chance(0.03)) {
        applyGov(sim, k, 'democracy', { lock: false, reason: 'plenumVote' });
      }
    }
  }

  WW.Gov = {
    createKingdom: createKingdom, removeKingdom: removeKingdom, applyGov: applyGov, appointLeader: appointLeader,
    onLeaderDeath: onLeaderDeath, update: update, yearly: yearly, election: election, fiveYearPlan: fiveYearPlan,
    shamElection: shamElection, miracle: miracle, pickGovForRace: pickGovForRace, leaderFull: leaderFull,
    avgHappiness: avgHappiness, kingdomPop: kingdomPop, capital: capital, titleFor: titleFor
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
