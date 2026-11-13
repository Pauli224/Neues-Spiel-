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
    const pa = capitalPt(sim, a), pb = capitalPt(sim, b);
    sim.event(type || 'war', {
      kingdom: a.name, other: b.name, city: pa ? pa.c.name : a.name, otherCity: pb ? pb.c.name : b.name,
      deity: a.deity || '', otherDeity: b.deity || ''
    }, { kingdomId: a.id, cityId: pa ? pa.c.id : -1, x: pa ? pa.x : 0, y: pa ? pa.y : 0 });
    return true;
  }
  function makePeace(sim, a, b, type, extra) {
    if (!setStatus(sim, a, b, 'peace')) return false;
    const pa = capitalPt(sim, a);
    sim.event(type || 'peace', Object.assign({ kingdom: a.name, other: b.name }, extra || {}), { kingdomId: a.id, cityId: pa ? pa.c.id : -1, x: pa ? pa.x : 0, y: pa ? pa.y : 0 });
    return true;
  }
  function makeAlliance(sim, a, b, type) {
    if (!setStatus(sim, a, b, 'alliance')) return false;
    const pa = capitalPt(sim, a);
    sim.event(type || 'alliance', { kingdom: a.name, other: b.name }, { kingdomId: a.id, cityId: pa ? pa.c.id : -1, x: pa ? pa.x : 0, y: pa ? pa.y : 0 });
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
          if (u.order) { if (u.order.k === e.id) marching++; continue; }
          idle.push(u);
        }
        if (idle.length < 3 && !(idle.length >= 1 && marching > 0)) continue;
        // Ziel: nächste erreichbare Feindstadt
        const pair = nearestCities(sim, k, e);
        if (!pair || !sameLand(sim, pair.a, pair.b)) continue;
        const keep = marching > 0 ? 0 : Math.floor(idle.length * 0.25);
        const send = idle.length - keep;
        let n = 0;
        // nächstgelegene Soldaten zuerst
        idle.sort((u1, u2) => (Math.abs(u1.x - pair.b.cx) + Math.abs(u1.y - pair.b.cy)) - (Math.abs(u2.x - pair.b.cx) + Math.abs(u2.y - pair.b.cy)) || u1.id - u2.id);
        for (const u of idle) {
          if (n >= send) break;
          u.order = { kind: 'march', city: pair.b.id, k: e.id };
          u.path = null; u.wait = 0; u.breach = -1; u.fails = 0;
          n++;
        }
        if (n >= 3 && marching === 0) sim.event('armyMarch', { kingdom: k.name, other: e.name, city: pair.a.name, otherCity: pair.b.name, n: n },
          { kingdomId: k.id, cityId: pair.a.id, x: pair.a.cx + 0.5, y: pair.a.cy + 0.5 });
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
    WW.Cities.transferCity(sim, city, att.id);
    if (ctr) { WW.Structs.complete(sim, ctr); ctr.hp = Math.round(ctr.maxHp * 0.4); ctr.gov = att.gov; }
    for (const u of st.units) if (!u.dead && u.order && u.order.city === city.id) { u.order = null; u.path = null; u.breach = -1; }
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
  function secede(sim, city, gov, leaderName) {
    const old = sim._kingdoms.get(city.kingdomId);
    if (!old || old.cityIds.length < 2) return null;
    const nk = WW.Gov.createKingdom(sim, { race: city.race, gov: gov, baseName: city.name });
    WW.Cities.transferCity(sim, city, nk.id);
    nk.capitalId = city.id;
    for (const r of [nk.relations[old.id], old.relations[nk.id]]) if (r) r.opinion = -45;
    WW.Gov.appointLeader(sim, nk, leaderName);
    sim.event('secede', { city: city.name, kingdom: nk.name, other: old.name, gov: WW.GOVERNMENTS[nk.gov].name }, WW.Cities.atCity(city));
    return nk;
  }

  function startRevolt(sim, city) {
    const k = sim._kingdoms.get(city.kingdomId);
    if (!k || !city._members) return;
    let n = 0;
    const want = Math.max(2, Math.round(city.adults * (k.gov === 'fascism' ? 0.35 : 0.25)));
    for (const u of city._members) {
      if (n >= want) break;
      if (u.role === 'soldier' || u.role === 'leader' || u.role === 'child' || u.role === 'settler' || u.merc) continue;
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
    const newGov = sim.rng.weighted({ democracy: 3, anarchy: 2, republic: 1, communism: 2 });
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
        const w = 9 + (ra.losses + rb.losses) * 1.2;
        ra.weariness += w; rb.weariness += w;
        ra.losses = 0; rb.losses = 0;
        // Handelsrepublik kauft sich frei
        for (const [p, q] of [[a, b], [b, a]]) {
          if (!WW.GOVERNMENTS[p.gov].buysPeace) continue;
          const cap = sim._cities.get(p.capitalId);
          if (!cap) continue;
          const sk = WW.Cities.stock(sim, cap);
          if (sk.gold >= 40 && years >= 1) { sk.gold -= 40; makePeace(sim, p, q, 'buyPeace', { gold: 40 }); break; }
        }
        if (ra.status !== 'war') continue;
        if (years >= 2 && ra.weariness > 55 + sim.rng.next() * 45) { makePeace(sim, a, b); continue; }
        if (years >= 14) { makePeace(sim, a, b); continue; }
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
      if (op > 60 && sim.rng.chance(0.15)) { makeAlliance(sim, a, b); continue; }
      if (!st.laws.wars || !close || !pair || !sameLand(sim, pair.a, pair.b)) continue;
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
        if (op > need) continue;
        if (sp < sq * 0.8) continue;
        const chance = (g.aggression + race.aggression) * 0.22;
        if (sim.rng.chance(chance)) { declareWar(sim, p, q, holy ? 'holyWar' : 'war'); break; }
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
        startRevolt(sim, c);
      }
    }
  }

  WW.Diplo = {
    atWar: atWar, strength: strength, setStatus: setStatus, declareWar: declareWar, makePeace: makePeace,
    makeAlliance: makeAlliance, onCasualty: onCasualty, update: update, yearly: yearly, tryCapture: tryCapture,
    secede: secede, startRevolt: startRevolt, revoltSuccess: revoltSuccess, nearestCities: nearestCities
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
