// Diplomatie: Meinungen, Krieg, Frieden, Bündnis, Heere, Eroberung, Aufstände, Abspaltung, Söldner.
(function (WW) { 'use strict';

  function rel(k, oid) { return k && k.relations[oid]; }

  function atWar(sim, kid) {
    const k = sim._kingdoms.get(kid);
    if (!k) return false;
    for (const oid in k.relations) if (k.relations[oid].status === 'war') return true;
    return false;
  }

  function strength(sim, k) {
    let s = 0;
    for (const id of k.cityIds) {
      const c = sim._cities.get(id);
      if (!c) continue;
      s += c.pop * 0.5 + (c.jobs.soldier || 0) * 2 + (c.wall.level || 0) * 3;
    }
    if (WW.Military) s += WW.Military.strength(sim, k);   // [mil] Panzer und Geschütze zählen mit
    return s;
  }

  function capitalPt(sim, k) {
    const c = sim._cities.get(k.capitalId) || sim._cities.get(k.cityIds[0]);
    return c ? { x: c.cx + 0.5, y: c.cy + 0.5, c: c } : null;
  }

  function nearestCities(sim, a, b) {
    let best = null, bd = 1e9;
    for (const ia of a.cityIds) {
      const ca = sim._cities.get(ia); if (!ca) continue;
      for (const ib of b.cityIds) {
        const cb = sim._cities.get(ib); if (!cb) continue;
        const d = Math.abs(ca.cx - cb.cx) + Math.abs(ca.cy - cb.cy);
        if (d < bd) { bd = d; best = { a: ca, b: cb, d: d }; }
      }
    }
    return best;
  }

  function sameLand(sim, ca, cb) {
    if (sim._compDirty) WW.Path.updateComponents(sim);
    const W = sim.state.W;
    return sim.comp[ca.cy * W + ca.cx] === sim.comp[cb.cy * W + cb.cx];
  }

  function setStatus(sim, a, b, status) {
    const ra = rel(a, b.id), rb = rel(b, a.id);
    if (!ra || !rb) return false;
    const st = sim.state;
    for (const r of [ra, rb]) {
      if (status === 'war' && r.status !== 'war') { r.wars = (r.wars || 0) + 1; r.weariness = 0; r.losses = 0; }
      r.status = status; r.since = st.year;
      if (status !== 'war' && r.forced) r.forced = false;   // erzwungener Krieg endet nur durch Sieg oder den Spieler
      if (status === 'peace') r.opinion = Math.min(100, r.opinion + 10);
      if (status === 'alliance') r.opinion = Math.max(r.opinion, 40);
      if (status === 'war') r.opinion = Math.min(r.opinion, -30);
    }
    if (status !== 'war') {
      for (const u of st.units) if (!u.dead && u.order && ((u.kingdomId === a.id && u.order.k === b.id) || (u.kingdomId === b.id && u.order.k === a.id))) { u.order = null; u.breach = -1; u.path = null; }
    }
    st.pathVersion++;
    return true;
  }

  const WAR_REASONS = 6;
  function declareWar(sim, a, b, type) {
    if (!setStatus(sim, a, b, 'war')) return false;
    if (WW.GOVERNMENTS[a.gov].war === 'mass') {
      const pa0 = capitalPt(sim, a);
      sim.event('mobilize', { kingdom: a.name, leader: WW.Gov.leaderFull(a) }, { kingdomId: a.id, cityId: pa0 ? pa0.c.id : -1, x: pa0 ? pa0.x : 0, y: pa0 ? pa0.y : 0 });
    }
    callAllies(sim, a, b);
    const pa = capitalPt(sim, a), pb = capitalPt(sim, b);
    if (type !== 'silent') sim.event(type || 'war', {
      kingdom: a.name, other: b.name, city: pa ? pa.c.name : a.name, otherCity: pb ? pb.c.name : b.name,
      deity: a.deity || '', otherDeity: b.deity || ''
    }, { kingdomId: a.id, cityId: pa ? pa.c.id : -1, x: pa ? pa.x : 0, y: pa ? pa.y : 0 });
    return true;
  }
  function makePeace(sim, a, b, type, extra) {
    if (!setStatus(sim, a, b, 'peace')) return false;
    const pa = capitalPt(sim, a);
    if (type !== 'silent') sim.event(type || 'peace', Object.assign({ kingdom: a.name, other: b.name }, extra || {}), { kingdomId: a.id, cityId: pa ? pa.c.id : -1, x: pa ? pa.x : 0, y: pa ? pa.y : 0 });
    if (WW.Camps) WW.Camps.onPeace(sim, a, b);   // [industry] Kriegsgefangene gehen heim (Regime nur zum Teil)
    return true;
  }
  function makeAlliance(sim, a, b, type) {
    if (!setStatus(sim, a, b, 'alliance')) return false;
    const pa = capitalPt(sim, a);
    if (type !== 'silent') sim.event(type || 'alliance', { kingdom: a.name, other: b.name }, { kingdomId: a.id, cityId: pa ? pa.c.id : -1, x: pa ? pa.x : 0, y: pa ? pa.y : 0 });
    return true;
  }

  function onCasualty(sim, attK, vicK) {
    const a = sim._kingdoms.get(attK), b = sim._kingdoms.get(vicK);
    if (a && a.relations[vicK]) a.relations[vicK].losses++;
    if (b && b.relations[attK]) b.relations[attK].losses++;
  }

  // Heere aufstellen (alle 40 Ticks)
  function update(sim) {
    const st = sim.state;
    for (const k of st.kingdoms) {
      if (k.dead) continue;
      const g = WW.GOVERNMENTS[k.gov];
      if (g.neverWar && g.soldierShare === 0) continue;   // Anarchie verteidigt nur
      for (const oid in k.relations) {
        const r = k.relations[oid];
        if (r.status !== 'war') continue;
        const e = sim._kingdoms.get(+oid);
        if (!e || !e.cityIds.length || !k.cityIds.length) continue;
        // freie Soldaten sammeln
        const idle = [];
        let marching = 0;
        for (const u of st.units) {
          if (u.dead || u.kingdomId !== k.id || u.role !== 'soldier') continue;
          if (u.garrison != null) continue;   // Garnison bleibt in ihrer Stadt (9.10)
          if (u.parole && u.parole > st.tick) continue;   // [mil] hat die Waffen niedergelegt
          if (u.order) { if (u.order.k === e.id) marching++; continue; }
          idle.push(u);
        }
        const yrs = st.year - r.since;
        const minArmy = WW.GOVERNMENTS[k.gov].war === 'mass' ? 4 : (yrs >= 2 ? 1 : 2);
        if (idle.length < minArmy && !(idle.length >= 1 && marching > 0)) continue;
        // Ziel: nächste erreichbare Feindstadt
        const pair = nearestCities(sim, k, e);
        if (pair && WW.Naval && !sameLand(sim, pair.a, pair.b)) { WW.Naval.seaWar(sim, k, e, idle, marching); continue; }   // [see] Ziele über das Meer: Truppenlandung
        if (!pair || !sameLand(sim, pair.a, pair.b)) continue;
        const keep = marching > 0 ? 0 : Math.floor(idle.length * 0.25);
        const send = idle.length - keep;
        let n = 0;
        // nächstgelegene Soldaten zuerst
        idle.sort((u1, u2) => (Math.abs(u1.x - pair.b.cx) + Math.abs(u1.y - pair.b.cy)) - (Math.abs(u2.x - pair.b.cx) + Math.abs(u2.y - pair.b.cy)) || u1.id - u2.id);
        // Belagerungsgerät gegen ummauerte Städte: Rammbock ab Kaserne, Katapult mit eigener Steinmauer
        let rams = 0, cats = 0;
        if (send >= 4 && pair.b.wall.level >= 1 && pair.a.hasBarracks && marching === 0 && !sim._noSiegeEngines) {
          rams = 1 + Math.floor(send / 10);
          if (pair.a.wall.level >= 2 && pair.b.wall.level >= 2) cats = 1 + Math.floor(send / 14);
        }
        for (const u of idle) {
          if (n >= send) break;
          if (rams > 0) { WW.Units.setRole(sim, u, 'ram'); rams--; }
          else if (cats > 0) { WW.Units.setRole(sim, u, 'catapult'); cats--; }
          u.order = { kind: 'march', city: pair.b.id, k: e.id };
          u.path = null; u.wait = 0; u.breach = -1; u.fails = 0;
          n++;
        }
        if (n >= 4 && marching === 0 && pair.b.wall.level >= 1 && pair.a.hasBarracks) sim.event('siegeEngines', { kingdom: k.name, city: pair.a.name, otherCity: pair.b.name }, { kingdomId: k.id, cityId: pair.a.id, x: pair.a.cx + 0.5, y: pair.a.cy + 0.5 });
        if (n >= 3 && marching === 0) sim.event('armyMarch', { kingdom: k.name, other: e.name, city: pair.a.name, otherCity: pair.b.name, n: n },
          { kingdomId: k.id, cityId: pair.a.id, x: pair.a.cx + 0.5, y: pair.a.cy + 0.5 });
      }
    }
    // Bedrohung: Feinde in der Nähe der Stadt -> Wachen halten Ausschau (sonst sparen sie sich die Feindsuche)
    for (const c of st.cities) {
      const kk = sim._kingdoms.get(c.kingdomId);
      if (!kk || !(c.revolt || sim._hostileWorld)) continue;
      if (!c.revolt && !atWar(sim, kk.id)) {
        // ohne Krieg nur Räuber/Wahnsinnige als Bedrohung
        let any = false;
        WW.Units.forNear(sim, c.cx + 0.5, c.cy + 0.5, 18, false, (u) => { if (u.role === 'bandit' || (u.wMad && u.wMad > st.tick)) { any = true; return false; } });
        if (any) c.threat = st.tick + 60;
        continue;
      }
      if (c.revolt) { c.threat = st.tick + 60; continue; }
      let foes = 0;
      const r = Math.sqrt((c.wall.inside || 80) / 3.14) + 10;
      WW.Units.forNear(sim, c.cx + 0.5, c.cy + 0.5, r, false, (u) => { if (u.kingdomId !== c.kingdomId && WW.Path.hostileKingdoms(sim, u.kingdomId, c.kingdomId)) { foes++; return false; } });
      if (foes) c.threat = st.tick + 60;
    }
    // Belagerung: viele Feinde vor der Stadt -> niemand geht hinaus (Aushungern)
    for (const c of st.cities) {
      if (!c.wall.plan || c.wall.level < 1) continue;
      let foes = 0;
      const r = Math.sqrt((c.wall.inside || 50) / 3.14) + 6;
      WW.Units.forNear(sim, c.cx + 0.5, c.cy + 0.5, r, false, (u) => { if ((u.role === 'soldier' || WW.Units.isEngine(u.role)) && WW.Path.hostileKingdoms(sim, u.kingdomId, c.kingdomId)) foes++; });
      if (foes >= 4) {
        if (!(c.besieged > st.tick) && c.siegeYear !== st.year) { c.siegeYear = st.year; sim.event('siege', { city: c.name }, WW.Cities.atCity(c)); }
        c.besieged = st.tick + 80;
      }
    }
    // Aufstände beenden
    for (const c of st.cities) {
      if (!c.revolt) continue;
      if ((c._rebels || 0) === 0 && (c.jobs.rebel || 0) === 0) {
        c.revolt = false; c.unhappyYears = 0;
        sim.event('revoltCrushed', { city: c.name }, WW.Cities.atCity(c));
      } else if (c.happiness > 48) {
        c.revolt = false; c.unhappyYears = 0;
        sim.event('revoltCalm', { city: c.name }, WW.Cities.atCity(c));
      }
    }
  }

  // Hat q Krieg gegen p oder dessen Verbündete geführt bzw. Städte von p besetzt?
  function isAggressorAgainst(sim, q, p) {
    for (const oid in p.relations) {
      if (p.relations[oid].status !== 'alliance') continue;
      const rq = q.relations[oid];
      if (rq && rq.status === 'war') return true;
    }
    for (const id of q.cityIds) { const c = sim._cities.get(id); if (c && c.prevKingdomId === p.id) return true; }
    return false;
  }

  // Kriegsbeginn: Verbündete (vor allem Demokratien) stehen dem Angegriffenen bei
  function callAllies(sim, aggressor, victim) {
    for (const oid in victim.relations) {
      if (victim.relations[oid].status !== 'alliance') continue;
      const ally = sim._kingdoms.get(+oid);
      if (!ally || ally === aggressor || WW.GOVERNMENTS[ally.gov].neverWar) continue;
      const r = ally.relations[aggressor.id];
      if (!r || r.status === 'war') continue;
      if (ally.gov === 'democracy' || r.opinion < 20 || sim.rng.chance(0.5)) {
        setStatus(sim, ally, aggressor, 'war');
        const pa = capitalPt(sim, ally);
        sim.event('allyJoins', { kingdom: ally.name, other: aggressor.name, victim: victim.name }, { kingdomId: ally.id, cityId: pa ? pa.c.id : -1, x: pa ? pa.x : 0, y: pa ? pa.y : 0 });
      }
    }
  }

  // Raubzug (Stamm): Vorräte stehlen und heimziehen
  function plunder(sim, city, u) {
    const att = sim._kingdoms.get(u.kingdomId);
    const home = sim._cities.get(u.cityId);
    if (!att || !home) return;
    const vs = WW.Cities.stock(sim, city), hs = WW.Cities.stock(sim, home);
    let got = 0;
    for (const res of ['food', 'wood', 'gold']) {
      const v = Math.min(vs[res] * 0.12, 8);
      if (v <= 0) continue;
      vs[res] -= v; hs[res] += v; got += v;
    }
    const r = att.relations[city.kingdomId];
    if (r && r.lastRaid !== sim.state.year) {
      r.lastRaid = sim.state.year;
      sim.event('raid', { kingdom: att.name, city: city.name, other: (sim._kingdoms.get(city.kingdomId) || {}).name || '', n: Math.round(got) }, WW.Cities.atCity(city));
    }
    u.order = { kind: 'home' }; u.path = null; u.breach = -1;
    WW.Units.bubble(u, 'note', 40);
  }

  // Eroberung versuchen, wenn das Zentrum gefallen ist
  function tryCapture(sim, city, attK) {
    const st = sim.state;
    const att = sim._kingdoms.get(attK);
    const def = sim._kingdoms.get(city.kingdomId);
    if (!att || !def || att === def) return false;
    const ctr = sim._structs.get(city.centerId);
    if (ctr && ctr.built) return false;
    const px = city.cx + 0.5, py = city.cy + 0.5;
    let a = 0, d = 0;
    WW.Units.forNear(sim, px, py, 5, false, (u) => {
      if (u.kingdomId === attK && u.role === 'soldier') a++;
      else if (u.kingdomId === def.id && (u.role === 'soldier' || WW.GOVERNMENTS[def.gov].militia) && u.role !== 'child') d++;
    });
    if (a === 0 || d > a) return false;
    const oldName = def.name;
    def.lostYear = st.year;   // verlorene Stadt im Krieg (Faschismus kann danach stürzen, 9.10)
    const ag = WW.GOVERNMENTS[att.gov];
    // Demokratie befreit eroberte Städte und gibt sie dem früheren Besitzer zurück
    const prev = city.prevKingdomId != null ? sim._kingdoms.get(city.prevKingdomId) : null;
    let newOwner = att;
    if (ag.war === 'defend' && prev && prev !== att && prev !== def) newOwner = prev;
    city.prevKingdomId = def.id;
    // Flüchtlinge ziehen los und gründen anderswo einen Stamm
    if (st.laws.newRealms && city.pop >= 12 && sim.rng.chance(0.5)) WW.Growth.emigrate(sim, city, 3 + sim.rng.int(4), 'refugees');
    WW.Cities.transferCity(sim, city, newOwner.id);
    city.conqueredYear = st.year;
    city.loyalty = (city.race !== newOwner.race || !WW.RACES[city.race] || (WW.RACES[city.race].govPrefs[newOwner.gov] || 1) < 1) ? -10 : 15;
    if (newOwner !== att) {
      if (ctr && !ctr.built) { const rs = ctr.restyle; WW.Structs.complete(sim, ctr); ctr.restyle = rs; ctr.progress = rs ? 0 : 1; }
      for (const u of st.units) if (!u.dead && u.order && u.order.city === city.id) { u.order = null; u.path = null; u.breach = -1; }
      city.prevKingdomId = null; city.occupiedUntil = 0;
      sim.event('liberation', { city: city.name, kingdom: att.name, other: newOwner.name }, WW.Cities.atCity(city));
      if (!def.cityIds.length) WW.Gov.removeKingdom(sim, def, false);
      return true;
    }
    // Besatzung: Unruhe (Faschismus lange), Theokratie bekehrt
    if (ag.war === 'holy') { city.occupiedUntil = 0; city.happiness = Math.max(city.happiness, 50); sim.event('conversion', { city: city.name, kingdom: att.name, deity: att.deity || '' }, WW.Cities.atCity(city)); }
    else city.occupiedUntil = st.year + (ag.war === 'mass' ? 10 : 4);
    if (ag.war === 'mass') sim.event('occupation', { city: city.name, kingdom: att.name, leader: WW.Gov.leaderFull(att) }, WW.Cities.atCity(city));
    if (ctr && !ctr.built) { const rs = ctr.restyle; WW.Structs.complete(sim, ctr); ctr.restyle = rs; ctr.progress = rs ? 0 : 1; ctr.hp = Math.round(ctr.maxHp * 0.4); }
    // Die Eroberer bleiben als Besatzung in der Stadt
    for (const u of st.units) if (!u.dead && u.order && u.order.city === city.id) {
      u.order = null; u.path = null; u.breach = -1;
      if (u.kingdomId === att.id && Math.abs(u.x - px) + Math.abs(u.y - py) < 10) u.cityId = city.id;
    }
    WW.Garrison.onConquest(sim, city, att, def);   // Besatzung und Garnison (9.10)
    const r = att.relations[def.id];
    if (r) r.weariness += 15;
    sim.event('conquest', { city: city.name, kingdom: att.name, other: oldName }, WW.Cities.atCity(city));
    if (!def.cityIds.length) {
      // letzte Stadt verloren
      for (const u of st.units) if (!u.dead && u.kingdomId === def.id) { u.kingdomId = att.id; u.cityId = city.id; u.order = null; u.path = null; if (u.role === 'leader') WW.Units.setRole(sim, u, 'farmer'); }
      sim.event('fallen', { kingdom: oldName, other: att.name }, WW.Cities.atCity(city));
      WW.Gov.removeKingdom(sim, def, true);
    }
    return true;
  }

  // Stadt spaltet sich ab und wird eigenes Reich
  function secede(sim, city, gov, leaderName, silent) {
    const old = sim._kingdoms.get(city.kingdomId);
    if (!old || old.cityIds.length < 2) return null;
    const nk = WW.Gov.createKingdom(sim, { race: city.race, gov: gov, baseName: city.name, culture: city.culture });
    WW.Cities.transferCity(sim, city, nk.id);
    nk.capitalId = city.id;
    for (const r of [nk.relations[old.id], old.relations[nk.id]]) if (r) r.opinion = -45;
    WW.Gov.appointLeader(sim, nk, leaderName || undefined);
    if (!silent) sim.event('secede', { city: city.name, kingdom: nk.name, other: old.name, gov: WW.GOVERNMENTS[nk.gov].name }, WW.Cities.atCity(city));
    return nk;
  }

  function startRevolt(sim, city) {
    const k = sim._kingdoms.get(city.kingdomId);
    if (!k || !city._members) return;
    let n = 0;
    const want = Math.max(2, Math.round(city.adults * (k.gov === 'fascism' ? 0.35 : 0.25)));
    for (const u of city._members) {
      if (n >= want) break;
      if (u.role === 'soldier' || u.role === 'leader' || u.role === 'child' || u.role === 'settler' || u.merc || u.order || WW.Units.isEngine(u.role)) continue;
      WW.Units.setRole(sim, u, 'rebel');
      WW.Units.bubble(u, 'angry', 50);
      n++;
    }
    if (!n) return;
    city.revolt = true;
    sim.event(k.gov === 'fascism' ? 'resistance' : 'revolt', { city: city.name, kingdom: k.name, n: n, leader: WW.Gov.leaderFull(k) }, WW.Cities.atCity(city));
  }

  function revoltSuccess(sim, city) {
    const st = sim.state;
    if (!city.revolt) return;
    const k = sim._kingdoms.get(city.kingdomId);
    city.revolt = false; city.unhappyYears = 0; city.happiness = 55;
    for (const u of st.units) if (!u.dead && u.cityId === city.id && u.role === 'rebel') WW.Units.setRole(sim, u, 'farmer');
    const ctr = sim._structs.get(city.centerId);
    if (ctr && !ctr.built) { WW.Structs.complete(sim, ctr); ctr.hp = Math.round(ctr.maxHp * 0.5); }
    if (!k) return;
    // Besetzte Stadt befreit sich selbst
    const prev = city.prevKingdomId != null ? sim._kingdoms.get(city.prevKingdomId) : null;
    if (prev && prev !== k && city.occupiedUntil > st.year) {
      const oldName = k ? k.name : '';
      city.prevKingdomId = null; city.occupiedUntil = 0;
      WW.Cities.transferCity(sim, city, prev.id);
      sim.event('uprisingLiberation', { city: city.name, kingdom: prev.name, other: oldName }, WW.Cities.atCity(city));
      if (k && !k.cityIds.length) WW.Gov.removeKingdom(sim, k, false);
      return;
    }
    const agit = city.agitated && st.year - city.agitated <= 6;
    const newGov = sim.rng.weighted(agit ? { communism: 8, democracy: 1, anarchy: 1 } : { democracy: 3, anarchy: 2, republic: 1, communism: 2 });
    if (k.cityIds.length >= 2 && city.id !== k.capitalId) {
      secede(sim, city, newGov === k.gov ? 'anarchy' : newGov);
      return;
    }
    if (st.laws.govChanges && !k.govLocked) {
      WW.Gov.applyGov(sim, k, newGov === k.gov ? 'democracy' : newGov, { lock: false, reason: k.gov === 'fascism' ? 'regimeFall' : 'revolution' });
    } else {
      sim.event('revoltFizzle', { city: city.name, kingdom: k.name, leader: WW.Gov.leaderFull(k) }, WW.Cities.atCity(city));
    }
  }

  // jährlich: Meinungen, Kriegsmüdigkeit, Kriegserklärungen, Bündnisse, Söldner, Aufstände
  function yearly(sim) {
    const st = sim.state;
    const ks = st.kingdoms.filter(k => !k.dead && k.cityIds.length);
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i], b = ks[j];
      const ra = a.relations[b.id], rb = b.relations[a.id];
      if (!ra || !rb) continue;
      const pair = nearestCities(sim, a, b);
      const close = pair && pair.d < 40;
      let drift = WW.govCompat(a.gov, b.gov);
      if (a.gov === 'theocracy' && b.gov === 'theocracy') drift += (a.deity === b.deity ? 3 : -4);
      if (a.race === b.race) drift += 1;
      if (close) drift -= 2;
      if (a.race === 'orc' || b.race === 'orc') drift -= 1;
      if (ra.status === 'alliance') drift += 2;
      if (ra.status === 'war') drift -= 3;
      drift -= Math.min(3, (ra.wars || 0) * 0.5);
      drift += (sim.rng.next() - 0.5) * 6;
      const op = WW.SimUtil.clamp(ra.opinion + drift, -100, 100);
      ra.opinion = op; rb.opinion = op;

      if (ra.status === 'war') {
        // Kriegsmüdigkeit
        const years = st.year - ra.since;
        const forced = !!(ra.forced || rb.forced);   // vom Spieler erzwungen: kein Freikauf, keine Kriegsmüdigkeit
        const w = 9 + (ra.losses + rb.losses) * 1.2;
        ra.weariness += w; rb.weariness += w;
        ra.losses = 0; rb.losses = 0;
        // Handelsrepublik kauft sich frei
        for (const [p, q] of [[a, b], [b, a]]) {
          if (!WW.GOVERNMENTS[p.gov].buysPeace) continue;
          const cap = sim._cities.get(p.capitalId);
          if (!cap) continue;
          const sk = WW.Cities.stock(sim, cap);
          if (!forced && sk.gold >= 40 && years >= 1) { sk.gold -= 40; makePeace(sim, p, q, 'buyPeace', { gold: 40 }); break; }
        }
        if (ra.status !== 'war') continue;
        if (!forced && years >= 3 && ra.weariness > 80 + sim.rng.next() * 60) { makePeace(sim, a, b); continue; }
        if (!forced && years >= 14) { makePeace(sim, a, b); continue; }
        // Söldner
        for (const p of [a, b]) {
          const g = WW.GOVERNMENTS[p.gov];
          if (!g.mercenaries) continue;
          const cap = sim._cities.get(p.capitalId);
          if (!cap) continue;
          const sk = WW.Cities.stock(sim, cap);
          if (sk.gold >= 24) {
            sk.gold -= 20;
            const W = st.W;
            let n = 0;
            for (let m = 0; m < 3; m++) {
              const t = WW.Cities.centerTile(sim, cap, m);
              const u = WW.Units.create(sim, { x: (t % W) + 0.5, y: Math.floor(t / W) + 0.5, role: 'soldier', kingdomId: p.id, cityId: cap.id, race: sim.rng.pick(WW.RACE_KEYS) });
              if (u) { u.merc = true; u.life = u.age + 12; n++; }
            }
            if (n) sim.event('mercs', { kingdom: p.name, city: cap.name, n: n }, WW.Cities.atCity(cap));
          }
        }
        continue;
      }
      if (ra.status === 'alliance') {
        if (op < 5) { setStatus(sim, a, b, 'peace'); sim.event('allianceEnd', { kingdom: a.name, other: b.name }, { kingdomId: a.id, cityId: -1, x: pair ? pair.a.cx + 0.5 : 0, y: pair ? pair.a.cy + 0.5 : 0 }); }
        continue;
      }
      // Frieden: Krieg oder Bündnis?
      if (op > 55 + ((a.ruler && a.ruler.diplo) || 3) * -2 && sim.rng.chance(0.25)) { WW.Growth.planAlliance(sim, a, b); continue; }
      // Monarchien: Heiratsbündnis
      if (a.gov === 'monarchy' && b.gov === 'monarchy' && op > 15 && sim.rng.chance(0.12)) {
        if (setStatus(sim, a, b, 'alliance')) {
          const pa = capitalPt(sim, a);
          sim.event('royalWedding', { kingdom: a.name, other: b.name, leader: WW.Gov.leaderFull(a), otherLeader: WW.Gov.leaderFull(b) }, { kingdomId: a.id, cityId: pa ? pa.c.id : -1, x: pa ? pa.x : 0, y: pa ? pa.y : 0 });
        }
        continue;
      }
      if (!st.laws.wars || !close || !pair || (!sameLand(sim, pair.a, pair.b) && !(WW.Naval && WW.Naval.seaReach(sim, a, b)))) continue;   // [see] Nachbarn über das Meer (beide mit Hafen am selben Meer)
      if (st.year - ra.since < 3) continue;
      for (const [p, q] of [[a, b], [b, a]]) {
        const g = WW.GOVERNMENTS[p.gov];
        if (g.neverWar) continue;
        const race = WW.RACES[p.race] || WW.RACES.human;
        const sp = strength(sim, p), sq = strength(sim, q);
        let need = -40;
        let holy = false;
        if (p.gov === 'theocracy' && (q.gov !== 'theocracy' || q.deity !== p.deity)) { need = -20; holy = true; }
        if (p.gov === 'fascism' && sp > sq * 1.2) need = -10;   // aggressiv gegen Schwächere
        if (p.gov === 'tribe') need = -30;                       // Raubzüge
        // Demokratie greift nur Angreifer an (Krieg gegen Verbündete, eroberte eigene Städte)
        if (p.gov === 'democracy' && !isAggressorAgainst(sim, q, p)) continue;
        if (p.gov === 'democracy') need = 100;
        if (op > need) continue;
        if (sp < sq * 0.8 && p.gov !== 'democracy') continue;
        const ruler = p.ruler || { war: 3, diplo: 3 };
        const chance = WW.SimUtil.mod(sim, p, null, 'aggression', g.aggression + race.aggression) * 0.22 * (0.7 + ruler.war * 0.12) * (1.25 - ruler.diplo * 0.08);
        // Krieg kündigt sich als Vorhaben an (state.plots), Erklärung erst bei 100 %
        if (sim.rng.chance(chance)) { WW.Growth.planWar(sim, p, q, holy); break; }
      }
    }
    // Kommunismus schürt Aufstände beim Nachbarn
    for (const k of ks) {
      if (k.gov !== 'communism' || k.dead) continue;
      const cap = sim._cities.get(k.capitalId);
      if (!cap) continue;
      for (const c of st.cities) {
        if (c.kingdomId === k.id || c.revolt || c.pop < 8) continue;
        const ok = sim._kingdoms.get(c.kingdomId);
        if (!ok || ok.gov === 'communism') continue;
        const dx = c.cx - cap.cx, dy = c.cy - cap.cy;
        if (dx * dx + dy * dy > 55 * 55 || c.happiness > 55) continue;
        if (!sim.rng.chance(0.18)) continue;
        c.agitated = st.year;
        c.unhappyYears += 1;
        c.happiness = Math.max(0, c.happiness - 8);
        sim.event('agitation', { kingdom: k.name, city: c.name, other: ok.name }, WW.Cities.atCity(c));
        break;
      }
    }
    // Aufstände
    for (const c of st.cities) {
      if (c.revolt || c.pop < 6) continue;
      const k = sim._kingdoms.get(c.kingdomId);
      if (!k) continue;
      if (c.unhappyYears >= 2) {
        // Propagandaturm dämpft nur vorübergehend
        if (k.gov === 'fascism' && c.propaganda > 8 && sim.rng.chance(0.6)) continue;
        // Garnison schreckt ab (Faschismus: Angst)
        if ((c.garrisonWant | 0) > 0 && sim.rng.chance((c.garrisonRatio || 0) * (k.gov === 'fascism' ? 0.8 : 0.5))) continue;
        // Aufstand kündigt sich als Vorhaben an
        const pl = WW.Growth.addPlot(sim, 'revolt', k.id, c.id, c.id, c.cx + 0.5, c.cy + 0.5);
        if (!pl.announced) { pl.announced = true; sim.event('plotRevolt', { city: c.name, kingdom: k.name }, WW.Cities.atCity(c)); }
      }
    }
  }

  WW.Diplo = {
    atWar: atWar, strength: strength, setStatus: setStatus, declareWar: declareWar, makePeace: makePeace,
    makeAlliance: makeAlliance, onCasualty: onCasualty, update: update, yearly: yearly, tryCapture: tryCapture,
    secede: secede, startRevolt: startRevolt, revoltSuccess: revoltSuccess, nearestCities: nearestCities,
    plunder: plunder, callAllies: callAllies, isAggressorAgainst: isAggressorAgainst
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));

// ============================================================================
// Garnisonen (9.10): Soll, Zuteilen, Nachschicken, Besatzung und Eingliederung. Schnittstelle: Kopf von js/sim/sim.js.
// ============================================================================
(function (WW) { 'use strict';

  const OCC_BASE = 35;      // Besatzungsmalus auf die Loyalität zu Beginn
  const MISSING = 20;       // fehlende Garnison in besetzter Stadt

  function G(k) { return WW.GOVERNMENTS[(k && k.gov) || 'tribe'] || WW.GOVERNMENTS.tribe; }
  function hasBarr(sim, city) { return !!city.garrisonHall; }

  // Soll-Stärke einer Stadt
  function want(sim, city, k) {
    const g = G(k), gs = g.garrison;
    if (!gs || !gs.share) return 0;
    if (city.garrisonSet != null && city.garrisonSet >= 0) return city.garrisonSet | 0;
    let w = 0;
    if (city.occupied) w = Math.max(3, Math.ceil(city.pop * gs.share) + 1);
    else if (k && k.capitalId !== city.id && city.pop >= 30) w = Math.round(city.pop * gs.share / 3);
    if (city.happiness < 35 && city.pop >= 10) w += Math.ceil(city.pop * 0.04);
    if (w > 0 && hasBarr(sim, city)) w += 4;
    return Math.min(w, 60);
  }

  // Loyalitätswirkung (für Growth.loyaltyRaw): + Garnison, − Besatzung, − fehlende Garnison
  function loyalty(sim, city, k) {
    const g = G(k), gs = g.garrison || { cap: 0, integ: 8 };
    const st = sim.state;
    let l = 0;
    const w = city.garrisonWant | 0, n = city.garrison | 0;
    const ratio = w > 0 ? Math.min(1, n / w) : 0;
    if (w > 0) l += gs.cap * ratio * (hasBarr(sim, city) ? 1.5 : 1);
    if (city.occupied) {
      const yrs = st.year - city.occupied.since;
      l -= OCC_BASE * Math.max(0, 1 - yrs / Math.max(1, gs.integ));
      if (w > 0) l -= MISSING * (1 - ratio);
    }
    return l;
  }

  function soldierOk(u) { return !u.dead && u.role === 'soldier' && !u.merc && !u.vehicle && !(u.order && u.order.kind === 'march'); }

  function assign(sim, u, city, walk) {
    u.garrison = city.id; u.cityId = city.id;
    if (walk) { u.order = { kind: 'garrison', city: city.id }; u.path = null; u.fails = 0; }
    else if (u.order && u.order.kind !== 'garrison') u.order = null;
  }
  function release(u) { delete u.garrison; if (u.order && u.order.kind === 'garrison') u.order = null; }

  // alle 40 Ticks
  function update(sim) {
    const st = sim.state;
    const cnt = new Map();
    for (const u of st.units) {
      if (u.garrison == null) continue;
      const c = sim._cities.get(u.garrison);
      if (u.dead || !c || c.kingdomId !== u.kingdomId || (u.role !== 'soldier' && !u.vehicle)) { if (!u.dead) release(u); continue; }   // Fahrzeuge [mil] dürfen stationiert sein
      cnt.set(c.id, (cnt.get(c.id) || 0) + 1);
    }
    const halls = new Set();
    for (const s of st.structs) if (!s.dead && s.built && s.type === 'garrison') halls.add(s.cityId);
    for (const city of st.cities) {
      if (city.dead) continue;
      const k = sim._kingdoms.get(city.kingdomId);
      city.garrisonHall = halls.has(city.id);
      const w = want(sim, city, k);
      let n = cnt.get(city.id) || 0;
      city.garrisonWant = w; city.garrison = n;
      // Eingliederung
      if (city.occupied && k && st.year - city.occupied.since >= G(k).garrison.integ) {
        city.occupied = null;
        sim.event('integrated', { city: city.name, kingdom: k.name }, WW.Cities.atCity(city));
      }
      if (!k) continue;
      if (n < w && city._members) {
        // 1) eigene Soldaten der Stadt
        for (const u of city._members) { if (n >= w) break; if (u.garrison == null && soldierOk(u) && !u.order) { assign(sim, u, city, false); n++; } }
        // 2) Nachschub aus der Hauptstadt bzw. der größten anderen Stadt des Reichs (höchstens 3 je Runde)
        if (n < w) {
          let donor = sim._cities.get(k.capitalId);
          if (!donor || donor === city) { donor = null; for (const id of k.cityIds) { const c = sim._cities.get(id); if (c && c !== city && (!donor || c.pop > donor.pop)) donor = c; } }
          if (donor && donor._members) {
            let sent = 0;
            for (const u of donor._members) {
              if (n >= w || sent >= 3) break;
              if (u.garrison == null && soldierOk(u) && !u.order) { assign(sim, u, city, true); n++; sent++; }
            }
            if (sent && (city.garrisonSentYear | 0) !== st.year) { city.garrisonSentYear = st.year; sim.event('garrisonSent', { city: city.name, other: donor.name, kingdom: k.name, n: sent }, WW.Cities.atCity(city)); }
          }
        }
        city.garrison = n;
      } else if (n > w + (city.garrisonSet != null ? 0 : 2) && city._members) {
        // überzählige Garnison wird wieder normale Wache
        let drop = city.garrisonSet != null ? n - w : 1;
        for (const u of st.units) { if (drop <= 0) break; if (u.garrison === city.id && !u.dead && !u.vehicle) { release(u); n--; drop--; } }   // Fahrzeuge bleiben
        city.garrison = n;
      }
      city.garrisonRatio = w > 0 ? Math.min(1, n / w) : (n > 0 ? 1 : 0);
      if (city.occupied && w > 0 && city.garrisonRatio < 0.4 && (city.garrisonLowYear | 0) + 5 <= st.year) {
        city.garrisonLowYear = st.year;
        sim.event('garrisonLow', { city: city.name, kingdom: k.name }, WW.Cities.atCity(city));
      }
      // Garnisonskaserne in besetzten Städten mit großem Soll
      if (city.occupied && w >= 6 && !city.garrisonHall && city.centerOk && !(city.hallTry > st.tick)) {
        city.hallTry = st.tick + 600;
        let have = false;
        for (const id of city.sites) { const s = sim._structs.get(id); if (s && s.type === 'garrison') have = true; }
        const cost = WW.Structs.costFor(sim, 'garrison', 1, city.id);
        if (!have && WW.Cities.canPay(sim, city, cost)) {
          const i = WW.Cities.findCoreSpot(sim, city, 'garrison');
          if (i >= 0) { const s = WW.Cities.placeStruct(sim, city, 'garrison', i % st.W, Math.floor(i / st.W), { style: k.gov }); if (s) city.sites.push(s.id); }
        }
      }
    }
  }

  // Eroberung: Besatzung beginnt, Eroberer bleiben bis zum Soll als Garnison
  function onConquest(sim, city, att, def) {
    const st = sim.state;
    city.occupied = { since: st.year, prev: def ? def.id : -1 };
    const w = want(sim, city, att);
    city.garrisonWant = w;
    const px = city.cx + 0.5, py = city.cy + 0.5;
    const near = [];
    for (const u of st.units) if (!u.dead && u.kingdomId === att.id && u.role === 'soldier' && u.cityId === city.id && u.garrison == null) near.push(u);
    near.sort((a, b) => (Math.abs(a.x - px) + Math.abs(a.y - py)) - (Math.abs(b.x - px) + Math.abs(b.y - py)) || a.id - b.id);
    let n = 0;
    for (const u of near) { if (n >= w) break; assign(sim, u, city, false); n++; }
    city.garrison = n;
  }

  // Sandkasten: feste Stärke (n ≥ 0), null/-1 = wieder selbst
  function setGarrison(sim, cityId, n) {
    const city = sim._cities.get(cityId);
    if (!city) return false;
    if (n == null || !(typeof n === 'number' && isFinite(n)) || n < 0) { city.garrisonSet = null; update(sim); return true; }
    const before = city.garrison | 0;
    city.garrisonSet = Math.min(60, Math.floor(n));
    update(sim);
    const k = sim._kingdoms.get(city.kingdomId);
    if (k && city.garrisonSet < before) sim.event('garrisonWithdrawn', { city: city.name, kingdom: k.name, n: before - city.garrisonSet }, WW.Cities.atCity(city));
    return true;
  }

  // alte Spielstände: Besatzung aus conqueredYear ableiten
  function defaults(st) {
    for (const c of st.cities) {
      if (c.occupied === undefined) c.occupied = (c.conqueredYear != null && st.year - c.conqueredYear < 12) ? { since: c.conqueredYear, prev: c.prevKingdomId != null ? c.prevKingdomId : -1 } : null;
      if (c.garrisonSet === undefined) c.garrisonSet = null;
      if (c.garrison == null) c.garrison = 0;
      if (c.garrisonWant == null) c.garrisonWant = 0;
    }
  }

  WW.Garrison = { want: want, loyalty: loyalty, update: update, onConquest: onConquest, setGarrison: setGarrison, defaults: defaults, release: release, OCC_BASE: OCC_BASE };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
