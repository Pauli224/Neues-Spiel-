// Wachstum (Stufe 3a): Landnahme in Fluren, Zuzug, Statthalter und Herrscherwerte, Loyalität und
// Abspaltung, neue Reiche von selbst, Vorhaben mit Fortschritt (state.plots).
(function (WW) { 'use strict';

  const F = 6;   // Flur = 6×6 Kacheln

  function C() { return WW.CONFIG; }
  function dims(st) { return { fw: Math.ceil(st.W / F), fh: Math.ceil(st.H / F) }; }

  // Flur-Raster anlegen (auch für alte Spielstände: aus owner ableiten)
  function ensure(sim) {
    const st = sim.state, d = dims(st);
    if (st.flur && st.flur.length === d.fw * d.fh) return;
    st.flur = new Int32Array(d.fw * d.fh).fill(-1);
    for (let i = 0; i < st.W * st.H; i++) {
      const o = st.owner[i];
      if (o < 0) continue;
      const x = i % st.W, y = (i - x) / st.W;
      const fi = Math.floor(y / F) * d.fw + Math.floor(x / F);
      if (st.flur[fi] === -1) st.flur[fi] = o;
    }
  }
  function flurAt(st, x, y) { const d = dims(st); return Math.floor(y / F) * d.fw + Math.floor(x / F); }
  function flurCenter(st, fi) { const d = dims(st); const fx = fi % d.fw, fy = (fi - fx) / d.fw; return { x: fx * F + F / 2, y: fy * F + F / 2, fx: fx, fy: fy }; }

  // Flur setzen; Besitz-Raster folgt (offenes Meer bleibt herrenlos)
  function setFlur(sim, fi, cid) {
    const st = sim.state, d = dims(st);
    const old = st.flur[fi];
    if (old === cid) return;
    st.flur[fi] = cid;
    const fx = fi % d.fw, fy = (fi - fx) / d.fw;
    const T = WW.T;
    for (let y = fy * F; y < Math.min(st.H, fy * F + F); y++) for (let x = fx * F; x < Math.min(st.W, fx * F + F); x++) {
      const i = y * st.W + x;
      const t = st.terrain[i];
      const nv = (cid >= 0 && t !== T.DEEP && t !== T.WATER) ? cid : -1;
      if (st.owner[i] === nv) continue;
      if (nv >= 0 || st.owner[i] === old) { st.owner[i] = nv; sim.markDirty(i); }
    }
  }
  function clearOwner(sim, fi, cid) {
    const st = sim.state, d = dims(st);
    const fx = fi % d.fw, fy = (fi - fx) / d.fw;
    for (let y = fy * F; y < Math.min(st.H, fy * F + F); y++) for (let x = fx * F; x < Math.min(st.W, fx * F + F); x++) {
      const i = y * st.W + x;
      if (st.owner[i] === cid) { st.owner[i] = -1; sim.markDirty(i); }
    }
  }
  function countFlurs(sim, city) {
    const st = sim.state;
    let n = 0;
    for (let i = 0; i < st.flur.length; i++) if (st.flur[i] === city.id) n++;
    return n;
  }

  // Reichweite der Landnahme ums Zentrum (Kacheln)
  function reach(sim, city) {
    const k = sim._kingdoms.get(city.kingdomId);
    const g = WW.GOVERNMENTS[(k && k.gov) || 'tribe'];
    const race = WW.RACES[city.race] || WW.RACES.human;
    const gv = city.governor;
    return C().FLUR_REACH + city.tier * C().FLUR_REACH_TIER + Math.min(12, city.pop * 0.04) + (g.landReach || 0) + (race.landReach || 0) + (gv ? (gv.admin - 3) * 1.5 : 0);
  }
  // Ziel-Flurenzahl: wächst mit Einwohnern (Lager ~9, Dorf ~16–25, Stadt ~36–60, Großstadt 80+)
  function flurTarget(sim, city) {
    return Math.round(C().FLUR_TARGET_BASE + city.pop * C().FLUR_TARGET_POP + city.tier * 3);
  }

  // Land einer Flur bewerten (begehbar, bebaubar, fruchtbar)
  function flurLand(sim, fi, race) {
    const st = sim.state, d = dims(st), LUT = WW.TERRAIN_LUT;
    const fx = fi % d.fw, fy = (fi - fx) / d.fw;
    let walk = 0, fert = 0, res = 0;
    for (let y = fy * F; y < Math.min(st.H, fy * F + F); y++) for (let x = fx * F; x < Math.min(st.W, fx * F + F); x++) {
      const t = st.terrain[y * st.W + x];
      if (LUT.walk[t] > 0) walk++;
      fert += LUT.fertile[t];
      if (LUT.wood[t] || LUT.stone[t]) res++;
    }
    return { walk: walk, fert: fert, res: res };
  }

  // Erstes Gebiet: Flur des Zentrums und die umliegenden, soweit frei und nah
  function claimInitial(sim, city) {
    ensure(sim);
    const st = sim.state, d = dims(st);
    const cf = flurAt(st, city.cx, city.cy);
    const cfx = cf % d.fw, cfy = (cf - cfx) / d.fw;
    // Anfangsgebiet groß genug für Felder vor der künftigen Mauer
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const fx = cfx + dx, fy = cfy + dy;
      if (fx < 0 || fy < 0 || fx >= d.fw || fy >= d.fh) continue;
      const fi = fy * d.fw + fx;
      if (st.flur[fi] !== -1 && st.flur[fi] !== city.id) {
        // Tochterstadt auf Reichsland: Fluren der Schwesterstädte ohne deren Kerngebäude übernehmen
        const oc = sim._cities.get(st.flur[fi]);
        if (!oc || oc.kingdomId !== city.kingdomId || flurHasCore(sim, oc, fi)) continue;
        removeFieldsIn(sim, oc, fi);
        st.flur[fi] = -1;
        clearOwner(sim, fi, oc.id);
        oc.flurs = Math.max(0, (oc.flurs || 1) - 1);
      }
      const c = flurCenter(st, fi);
      const dd = Math.hypot(c.x - city.cx - 0.5, c.y - city.cy - 0.5);
      if (dd > C().FLUR_START_RADIUS && !(dx === 0 && dy === 0)) continue;
      if (flurLand(sim, fi, city.race).walk < 4 && !(dx === 0 && dy === 0)) continue;
      setFlur(sim, fi, city.id);
    }
    city.flurs = countFlurs(sim, city);
  }

  // Nächste Flur nehmen (angrenzend, frei, in Reichweite). true = genommen
  function claimNext(sim, city) {
    ensure(sim);
    const st = sim.state, d = dims(st);
    const R = reach(sim, city);
    let best = -1, bs = -1e9;
    for (let fi = 0; fi < st.flur.length; fi++) {
      if (st.flur[fi] !== -1) continue;
      const fx = fi % d.fw, fy = (fi - fx) / d.fw;
      let adj = 0;
      if (fx > 0 && st.flur[fi - 1] === city.id) adj++;
      else if (fx > 0) noteBorder(sim, city, st.flur[fi - 1]);
      if (fx < d.fw - 1 && st.flur[fi + 1] === city.id) adj++;
      if (fy > 0 && st.flur[fi - d.fw] === city.id) adj++;
      if (fy < d.fh - 1 && st.flur[fi + d.fw] === city.id) adj++;
      if (!adj) continue;
      const c = flurCenter(st, fi);
      const dist = Math.hypot(c.x - city.cx - 0.5, c.y - city.cy - 0.5);
      if (dist > R) continue;
      const land = flurLand(sim, fi, city.race);
      if (land.walk < 6) continue;
      const score = land.walk * 0.08 + land.fert * 0.06 + land.res * 0.04 + adj * 0.8 - dist * 0.35 + sim._hashNoise(fi * 7 + city.id) * 0.5;
      if (score > bs) { bs = score; best = fi; }
    }
    if (best < 0) return false;
    setFlur(sim, best, city.id);
    city.flurs = (city.flurs || 0) + 1;
    const c = flurCenter(st, best);
    sim.fx({ type: 'claim', x: c.x, y: c.y, cityId: city.id });
    return true;
  }

  // Liegt die Kachel in einer freien Flur direkt am eigenen Gebiet und in Reichweite?
  function claimableAt(sim, city, x, y) {
    const st = sim.state, d = dims(st);
    const fi = flurAt(st, x, y);
    if (st.flur[fi] !== -1) return false;
    const fx = fi % d.fw, fy = (fi - fx) / d.fw;
    const adj = (fx > 0 && st.flur[fi - 1] === city.id) || (fx < d.fw - 1 && st.flur[fi + 1] === city.id) ||
      (fy > 0 && st.flur[fi - d.fw] === city.id) || (fy < d.fh - 1 && st.flur[fi + d.fw] === city.id);
    if (!adj) return false;
    const c = flurCenter(st, fi);
    return Math.hypot(c.x - city.cx - 0.5, c.y - city.cy - 0.5) <= reach(sim, city);
  }

  // Grenzberührung zweier Reiche (einmal je Paar in der Chronik)
  function noteBorder(sim, city, otherCityId) {
    if (otherCityId == null || otherCityId < 0 || otherCityId === city.id) return;
    const oc = sim._cities.get(otherCityId);
    if (!oc || oc.kingdomId === city.kingdomId) return;
    const k = sim._kingdoms.get(city.kingdomId), o = sim._kingdoms.get(oc.kingdomId);
    const r = k && k.relations[o ? o.id : -1];
    if (!r || r.borderMet) return;
    r.borderMet = true;
    if (o.relations[k.id]) o.relations[k.id].borderMet = true;
    sim.event('borderContact', { kingdom: k.name, other: o.name, city: city.name, otherCity: oc.name }, WW.Cities.atCity(city));
  }

  // Alle Fluren (und Tile-Besitz) einer Stadt freigeben
  function releaseCity(sim, city) {
    ensure(sim);
    const st = sim.state;
    for (let fi = 0; fi < st.flur.length; fi++) if (st.flur[fi] === city.id) setFlur(sim, fi, -1);
    for (let i = 0; i < st.owner.length; i++) if (st.owner[i] === city.id) { st.owner[i] = -1; sim.markDirty(i); }
  }

  // Fluren unter einem Mauerring dazunehmen (soweit frei)
  function claimTiles(sim, city, tiles) {
    ensure(sim);
    const st = sim.state;
    const seen = new Set();
    for (const t of tiles) {
      const x = t % st.W, y = (t - x) / st.W;
      const fi = flurAt(st, x, y);
      if (seen.has(fi)) continue;
      seen.add(fi);
      if (st.flur[fi] === -1) setFlur(sim, fi, city.id);
    }
    city.flurs = countFlurs(sim, city);
  }

  // Abgeschnittene Fluren verfallen (nicht mehr über eigene Fluren mit dem Zentrum verbunden)
  function cutOff(sim, city) {
    const st = sim.state, d = dims(st);
    const start = flurAt(st, city.cx, city.cy);
    if (st.flur[start] === -1) setFlur(sim, start, city.id);
    if (st.flur[start] !== city.id) return 0;
    const seen = new Uint8Array(st.flur.length);
    const q = [start]; seen[start] = 1;
    while (q.length) {
      const fi = q.pop();
      const fx = fi % d.fw, fy = (fi - fx) / d.fw;
      const nb = [fx > 0 ? fi - 1 : -1, fx < d.fw - 1 ? fi + 1 : -1, fy > 0 ? fi - d.fw : -1, fy < d.fh - 1 ? fi + d.fw : -1];
      for (const n of nb) if (n >= 0 && !seen[n] && st.flur[n] === city.id) { seen[n] = 1; q.push(n); }
    }
    let lost = 0;
    for (let fi = 0; fi < st.flur.length; fi++) {
      if (st.flur[fi] !== city.id || seen[fi]) continue;
      // Felder dort verwildern
      removeFieldsIn(sim, city, fi);
      setFlur(sim, fi, -1);
      lost++;
    }
    if (lost) city.flurs = countFlurs(sim, city);
    return lost;
  }
  function removeFieldsIn(sim, city, fi) {
    const st = sim.state, d = dims(st);
    const fx = fi % d.fw, fy = (fi - fx) / d.fw;
    for (let y = fy * F; y < Math.min(st.H, fy * F + F); y++) for (let x = fx * F; x < Math.min(st.W, fx * F + F); x++) {
      const s = sim._structs.get(st.structAt[y * st.W + x]);
      if (s && s.type === 'field' && s.cityId === city.id) WW.Structs.remove(sim, s);
    }
  }
  // Hat die Flur wichtige Bauwerke der Stadt (Kern, Mauer)?
  function flurHasCore(sim, city, fi) {
    const st = sim.state, d = dims(st);
    const fx = fi % d.fw, fy = (fi - fx) / d.fw;
    for (let y = fy * F; y < Math.min(st.H, fy * F + F); y++) for (let x = fx * F; x < Math.min(st.W, fx * F + F); x++) {
      const i = y * st.W + x;
      if (st.inRing[i] === city.id) return true;
      const s = sim._structs.get(st.structAt[i]);
      if (s && s.cityId === city.id && (WW.STRUCT_INFO[s.type].core || WW.Structs.isWallish(s))) return true;
    }
    return false;
  }

  // Krieg: Grenzfluren wechseln, wo nur noch feindliche Soldaten stehen
  function warFlips(sim) {
    const st = sim.state;
    const sold = new Map();   // flur -> { kingdomId: n }
    for (const u of st.units) {
      if (u.dead || (u.role !== 'soldier' && u.role !== 'rebel')) continue;
      const fi = flurAt(st, Math.floor(u.x), Math.floor(u.y));
      let m = sold.get(fi);
      if (!m) { m = {}; sold.set(fi, m); }
      m[u.kingdomId] = (m[u.kingdomId] || 0) + 1;
    }
    const d = dims(st);
    for (const [fi, m] of sold) {
      const cid = st.flur[fi];
      if (cid < 0) continue;
      const city = sim._cities.get(cid);
      if (!city) continue;
      const own = m[city.kingdomId] || 0;
      if (own > 0) continue;
      let bestK = -1, bn = 1;
      for (const k in m) {
        if (+k === city.kingdomId || !WW.Path.hostileKingdoms(sim, +k, city.kingdomId)) continue;
        if (m[k] > bn) { bn = m[k]; bestK = +k; }
      }
      if (bestK < 0 || flurHasCore(sim, city, fi)) continue;
      // angrenzende Stadt des Siegers übernimmt die Flur
      const fx = fi % d.fw, fy = (fi - fx) / d.fw;
      let taker = null;
      for (const n of [fx > 0 ? fi - 1 : -1, fx < d.fw - 1 ? fi + 1 : -1, fy > 0 ? fi - d.fw : -1, fy < d.fh - 1 ? fi + d.fw : -1]) {
        if (n < 0) continue;
        const oc = sim._cities.get(st.flur[n]);
        if (oc && oc.kingdomId === bestK) { taker = oc; break; }
      }
      removeFieldsIn(sim, city, fi);
      setFlur(sim, fi, taker ? taker.id : -1);
      city.flurs = countFlurs(sim, city);
      if (taker) taker.flurs = countFlurs(sim, taker);
      if (city.lastFlurLoss !== st.year) {
        city.lastFlurLoss = st.year;
        const k = sim._kingdoms.get(bestK);
        sim.event('flurLost', { city: city.name, other: k ? k.name : '' }, WW.Cities.atCity(city));
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Herrscher und Statthalter
  // ---------------------------------------------------------------------------
  const QUIRKS = ['sammelt Löffel', 'hat Angst vor Schafen', 'redet mit Hühnern', 'zählt ständig Steine', 'trägt zwei Hüte übereinander',
    'schläft im Stehen', 'liebt Kohlsuppe über alles', 'pfeift beim Regieren', 'hält Tauben für Spione', 'schreibt Gedichte über Rüben',
    'verliert dauernd den Schlüssel', 'misstraut runden Dingen', 'badet nur montags', 'sammelt Kriegsgeschichten', 'kann nicht Nein sagen',
    'grüßt jeden Baum', 'hortet Senf', 'hält lange Reden', 'ist ein begeisterter Gärtner', 'erfindet ständig Feiertage'];
  function rollStats(sim) {
    const r = () => 1 + sim.rng.int(5);
    return { war: r(), diplo: r(), admin: r(), quirk: QUIRKS[sim.rng.int(QUIRKS.length)] };
  }
  function makeGovernor(sim, city) {
    const female = sim.rng.chance(0.5);
    const s = rollStats(sim);
    city.governor = { name: WW.Names.person(sim.rng, city.race, female), female: female, war: s.war, diplo: s.diplo, admin: s.admin, quirk: s.quirk, since: sim.state.year };
    return city.governor;
  }
  function ensureRuler(sim, k) {
    if (k.ruler && k.ruler.leaderId === k.leaderId) return k.ruler;
    const s = rollStats(sim);
    k.ruler = { leaderId: k.leaderId, war: s.war, diplo: s.diplo, admin: s.admin, quirk: s.quirk };
    return k.ruler;
  }

  // ---------------------------------------------------------------------------
  // Weiches Stadtlimit und Loyalität
  // ---------------------------------------------------------------------------
  function cityLimit(sim, k) {
    const g = WW.GOVERNMENTS[k.gov] || WW.GOVERNMENTS.tribe;
    const race = WW.RACES[k.race] || WW.RACES.human;
    const r = k.ruler || { admin: 3 };
    return Math.max(1, (g.cityLimit || 3) + (race.cityLimit || 0) + Math.round((r.admin - 3) * 0.7));
  }

  function loyaltyTarget(sim, city, k) {
    if (k.capitalId === city.id) return 100;
    return WW.SimUtil.clamp(loyaltyRaw(sim, city, k), -100, 100);
  }
  // Loyalität ohne Begrenzung (für Vergleiche)
  function loyaltyRaw(sim, city, k) {
    const st = sim.state;
    const cap = sim._cities.get(k.capitalId);
    let l = 55;
    l += (city.happiness - 50) * 0.5;
    if (cap) { const dd = Math.hypot(cap.cx - city.cx, cap.cy - city.cy); if (dd > 30) l -= (dd - 30) * 0.6; }
    if (city.race !== k.race) l -= 18;
    const prefs = (WW.RACES[city.race] || WW.RACES.human).govPrefs;
    const pv = prefs[k.gov] || 1;
    if (pv < 1) l -= 12; else if (pv >= 3) l += 6;
    const over = k.cityIds.length - cityLimit(sim, k);
    if (over > 0) l -= over * 14;
    const years = st.year - (city.joinedYear == null ? city.founded : city.joinedYear);
    l += Math.min(20, years * 0.8);
    if (city.occupied !== undefined && WW.Garrison) l += WW.Garrison.loyalty(sim, city, k);   // Garnison, Besatzung (9.10)
    else {   // ältere Stände ohne Besatzungsfeld
      if (city.conqueredYear != null && st.year - city.conqueredYear < 12) l -= 30 * (1 - (st.year - city.conqueredYear) / 12);
      if (city.occupiedUntil && st.year < city.occupiedUntil) l -= 15;
    }
    if (city.governor) l += (city.governor.diplo - 3) * 4;
    if (k.ruler) l += (k.ruler.admin - 3) * 3;
    if (city.hungry) l -= 10;
    if (k.policy && k.policy.unrest && st.year < k.policy.unrest) l -= 20;
    if (city.agitated && st.year - city.agitated < 4) l -= 10;
    return WW.SimUtil.mod(sim, k, city, 'loyalty', l);
  }

  // Stadt spaltet sich ab; Nachbarn mit schwacher Bindung gehen mit
  function secedeByLoyalty(sim, city) {
    const old = sim._kingdoms.get(city.kingdomId);
    if (!old || old.cityIds.length < 2 || old.capitalId === city.id) return null;
    const nk = WW.Diplo.secede(sim, city, 'tribe', null, true);
    if (!nk) return null;
    const ch = WW.Gov.chooseGov(sim, nk);
    WW.Gov.applyGov(sim, nk, ch.gov, { lock: false, reason: 'silent' });
    city.loyalty = 60; city.joinedYear = sim.state.year; city.conqueredYear = null;
    let followers = 0;
    for (const id of old.cityIds.slice()) {
      const c = sim._cities.get(id);
      if (!c || c.id === old.capitalId) continue;
      if (Math.hypot(c.cx - city.cx, c.cy - city.cy) > 34 || (c.loyalty == null ? 50 : c.loyalty) > 22) continue;
      WW.Cities.transferCity(sim, c, nk.id);
      c.loyalty = 50; c.joinedYear = sim.state.year;
      followers++;
    }
    sim.event('secedeLoyalty', { city: city.name, kingdom: nk.name, other: old.name, gov: WW.GOVERNMENTS[nk.gov].name, n: followers, why: ch.why }, WW.Cities.atCity(city));
    return nk;
  }

  // ---------------------------------------------------------------------------
  // Vorhaben (state.plots): { id, type, kingdomId, targetId, cityId, progress 0..1, x, y, since }
  // type: 'war' (rüstet zum Krieg gegen targetId), 'alliance', 'revolt' (Stadt cityId), 'secession' (Stadt cityId)
  // ---------------------------------------------------------------------------
  function findPlot(sim, type, a, b) {
    for (const p of sim.state.plots) if (p.type === type && p.kingdomId === a && p.targetId === b) return p;
    return null;
  }
  function addPlot(sim, type, kingdomId, targetId, cityId, x, y) {
    const st = sim.state;
    let p = findPlot(sim, type, kingdomId, targetId);
    if (p) return p;
    p = { id: st.nextId++, type: type, kingdomId: kingdomId, targetId: targetId, cityId: cityId == null ? -1 : cityId, progress: 0, x: x, y: y, since: st.year };
    st.plots.push(p);
    return p;
  }
  function removePlot(sim, p) { const st = sim.state; const i = st.plots.indexOf(p); if (i >= 0) st.plots.splice(i, 1); }

  // Kriegsvorhaben eines Reichs gegen ein anderes beginnen (statt sofortiger Erklärung)
  function planWar(sim, a, b, holy) {
    const pa = WW.Gov.capital(sim, a);
    const p = addPlot(sim, 'war', a.id, b.id, pa ? pa.id : -1, pa ? pa.cx + 0.5 : -1, pa ? pa.cy + 0.5 : -1);
    if (p.progress === 0 && !p.announced) {
      p.announced = true; p.holy = !!holy;
      sim.event('plotWar', { kingdom: a.name, other: b.name, city: pa ? pa.name : a.name }, { kingdomId: a.id, cityId: pa ? pa.id : -1, x: p.x, y: p.y });
    }
    return p;
  }
  function planAlliance(sim, a, b) {
    const pa = WW.Gov.capital(sim, a);
    const p = addPlot(sim, 'alliance', a.id, b.id, pa ? pa.id : -1, pa ? pa.cx + 0.5 : -1, pa ? pa.cy + 0.5 : -1);
    if (!p.announced) { p.announced = true; sim.event('plotAlliance', { kingdom: a.name, other: b.name }, { kingdomId: a.id, cityId: pa ? pa.id : -1, x: p.x, y: p.y }); }
    return p;
  }

  // alle 40 Ticks
  function updatePlots(sim) {
    const st = sim.state;
    for (const p of st.plots.slice()) {
      const a = sim._kingdoms.get(p.kingdomId);
      if (!a) { removePlot(sim, p); continue; }
      if (p.type === 'war' || p.type === 'alliance') {
        const b = sim._kingdoms.get(p.targetId);
        const r = b && a.relations[b.id];
        if (!b || !r || r.status !== 'peace') { removePlot(sim, p); continue; }
        const ruler = a.ruler || { war: 3, diplo: 3 };
        if (p.type === 'war') {
          const fasPush = a.gov === 'fascism' && WW.Diplo.strength(sim, a) > WW.Diplo.strength(sim, b) * 1.1;   // 9.10: Regime rüstet ohne Groll
          if (!st.laws.wars || WW.GOVERNMENTS[a.gov].neverWar || (r.opinion > -5 && !fasPush)) { p.progress -= 0.08; if (p.progress <= 0) { removePlot(sim, p); sim.event('plotWarOff', { kingdom: a.name, other: b.name }, { kingdomId: a.id, cityId: p.cityId, x: p.x, y: p.y }); } continue; }
          p.progress += (0.04 + ruler.war * 0.012) * (WW.GOVERNMENTS[a.gov].war === 'mass' ? 1.5 : 1);
          if (p.progress >= 1) { removePlot(sim, p); WW.Diplo.declareWar(sim, a, b, p.holy ? 'holyWar' : 'war'); }
        } else {
          if (r.opinion < 30) { p.progress -= 0.1; if (p.progress <= 0) removePlot(sim, p); continue; }
          p.progress += 0.04 + ruler.diplo * 0.012;
          if (p.progress >= 1) { removePlot(sim, p); WW.Diplo.makeAlliance(sim, a, b); }
        }
      } else if (p.type === 'revolt' || p.type === 'secession') {
        const c = sim._cities.get(p.cityId);
        if (!c || c.kingdomId !== p.kingdomId || c.revolt) { removePlot(sim, p); continue; }
        if (p.type === 'revolt') {
          const limit = a.gov === 'fascism' ? 28 : 22;
          if (c.happiness > limit + 6) { p.progress -= 0.12; if (p.progress <= 0) removePlot(sim, p); continue; }
          p.progress += 0.05 * (1 - 0.7 * ((c.garrisonWant | 0) > 0 ? (c.garrisonRatio || 0) : 0));   // Garnison bremst
          if (p.progress >= 1) { removePlot(sim, p); WW.Diplo.startRevolt(sim, c); }
        } else {
          if ((c.loyalty == null ? 50 : c.loyalty) > 10 || a.capitalId === c.id || a.cityIds.length < 2) { p.progress -= 0.1; if (p.progress <= 0) removePlot(sim, p); continue; }
          // Garnison hält die Stadt (9.10): volle Garnison bremst die Abspaltung stark (Faschismus fast ganz)
          const gr = c.occupied && (c.garrisonWant | 0) > 0 ? (c.garrisonRatio || 0) : 0;   // nur besetzte Städte
          p.progress += 0.05 * (1 - gr * (a.gov === 'fascism' ? 0.95 : 0.6));
          if (p.progress >= 1) { removePlot(sim, p); if (st.laws.govChanges || true) secedeByLoyalty(sim, c); }
        }
      }
      p.progress = Math.min(1, Math.max(0, p.progress));
    }
  }

  // ---------------------------------------------------------------------------
  // Neue Reiche von selbst: Auswanderer, Verbannte, Flüchtlinge
  // ---------------------------------------------------------------------------
  function freeSite(sim, x0, y0, race, minD, maxD) {
    const st = sim.state, W = st.W, H = st.H;
    if (sim._compDirty) WW.Path.updateComponents(sim);
    const comp = sim.comp[Math.floor(y0) * W + Math.floor(x0)];
    let best = null, bs = -1e9;
    for (let n = 0; n < 60; n++) {
      const dir = WW.Cities.DIRS16[sim.rng.int(16)];
      const dist = minD + sim.rng.next() * (maxD - minD);
      const x = Math.round(x0 + dir[0] * dist), y = Math.round(y0 + dir[1] * dist);
      if (x < 4 || y < 4 || x >= W - 4 || y >= H - 4) continue;
      if (!WW.Cities.canFoundAt(sim, x, y, race, C().NEW_REALM_MIN_DIST)) continue;
      const sameLand = sim.comp[y * W + x] === comp;
      let free = 0, owned = 0;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = yy * W + xx;
        if (st.owner[i] !== -1) owned++;
        if (WW.TERRAIN_LUT.build[st.terrain[i]]) free++;
      }
      if (free < 50 || owned > 20) continue;
      const score = free - owned * 3 + (sameLand ? 40 : -200);
      if (score > bs) { bs = score; best = { x: x, y: y, sameLand: sameLand }; }
    }
    return best && best.sameLand ? best : null;
  }

  // n Leute verlassen city und ziehen als neuer Stamm los. type = 'exodus' | 'exiles' | 'refugees'
  function emigrate(sim, city, n, type) {
    const st = sim.state;
    if (!st.laws.newRealms || !city._members) return null;
    const old = sim._kingdoms.get(city.kingdomId);
    // Megastadt (9.10): Auswanderer siedeln weit weg, damit der Ring der Großstadt wachsen kann
    const far = old && WW.GOVERNMENTS[old.gov] && WW.GOVERNMENTS[old.gov].megaHousing && city.tier >= 2;
    const site = freeSite(sim, city.cx + 0.5, city.cy + 0.5, city.race, far ? 45 : 14, far ? 70 : 38);
    if (!site) return null;
    const cul = WW.Culture.pick(sim, site.x, site.y, city.race);   // neues Land, neue Kultur nach dem Gelände
    const k = WW.Gov.createKingdom(sim, { race: city.race, gov: 'tribe', culture: cul, baseName: WW.Names.place(cul, sim.rng, WW.TERRAIN[sim.state.terrain[site.y * sim.state.W + site.x]].key, sim._usedNames) });
    const group = st.nextId++;
    let m = 0;
    for (const u of city._members) {
      if (m >= n) break;
      if (u.dead || u.role === 'leader' || u.role === 'child' || u.role === 'soldier' || u.role === 'settler' || u.merc || u.order) continue;
      WW.Units.setRole(sim, u, 'settler');
      u.kingdomId = k.id; u.cityId = -1; u.group = group; u.site = site.y * st.W + site.x; u.fails = 0; u.homeK = city.kingdomId; u.homeC = city.id;
      m++;
    }
    if (!m) { WW.Gov.removeKingdom(sim, k, true); return null; }
    // Meinung: Flüchtlinge/Verbannte nehmen es übel
    if (old && k.relations[old.id]) { const op = type === 'exodus' ? -5 : -35; k.relations[old.id].opinion = op; old.relations[k.id].opinion = op; }
    sim.event(type, { city: city.name, kingdom: k.name, other: old ? old.name : '', n: m }, WW.Cities.atCity(city));
    return k;
  }

  // ---------------------------------------------------------------------------
  // Natur: Umgang je Regierung/Volk (care | use | exploit), Rodungsmarken, Kennzahl nature 0..100
  // ---------------------------------------------------------------------------
  function natureMode(sim, k, race) {
    const f = WW.SimUtil.modFlag(sim, k, 'nature');
    if (f === 'care' || f === 'use' || f === 'exploit') return f;
    const r = race ? (typeof race === 'string' ? WW.RACES[race] : race) : (k && WW.RACES[k.race]);
    if (r && r.nature) return r.nature;
    if (!k) return 'use';
    if (k.policy && k.policy.bonus === 'green') return 'care';
    return (WW.GOVERNMENTS[k.gov] || WW.GOVERNMENTS.tribe).nature || 'use';
  }
  function natureMul(sim, k, race) {
    const g = WW.GOVERNMENTS[(k && k.gov) || 'tribe'];
    const r = race ? (typeof race === 'string' ? WW.RACES[race] : race) : null;
    return (g.natureMul || 1) * ((r && r.natureMul) || 1);
  }

  // jährlich: Rodungsmarken altern, Kahlschlag hält das Land kahl, Pflanzen, Kennzahlen, Meinungen
  function natureYearly(sim) {
    const st = sim.state, W = st.W, N = W * st.H;
    const LUT = WW.TERRAIN_LUT;
    const modeOf = new Map();
    for (const c of st.cities) {
      const k = sim._kingdoms.get(c.kingdomId);
      modeOf.set(c.id, natureMode(sim, k, c.race));
    }
    const land = new Map(), intact = new Map();
    for (let i = 0; i < N; i++) {
      const o = st.owner[i];
      const m = o >= 0 ? modeOf.get(o) : null;
      if (st.cleared[i]) {
        // unter Kahlschlag bleibt gerodetes Land kahl (Stümpfe, nachgewachsener Wald wird wieder abgeräumt),
        // sonst verblassen die Spuren
        // eine Lichtung bleibt Lichtung, bis ihre Marke abgelaufen ist (auch wenn ringsum Wald nachwächst)
        if (st.cleared[i] && LUT.wood[st.terrain[i]] && m !== 'exploit') { const t0 = st.terrain[i], nt = WW.Walls.deforested(t0); if (nt !== t0 && st.cleared[i] > (C().REGROW_RATE[m || 'use'] || 10)) { st.terrain[i] = nt; sim.markDirty(i); } }
        if (m !== 'exploit') {
          // Nachwuchs je Umgang mit der Natur: care forstet nach wenigen Jahren auf, use nach längerer Zeit
          const rate = C().REGROW_RATE[m || 'use'] || 10;
          const v = Math.max(0, st.cleared[i] - rate);
          st.cleared[i] = v;
          if (v === 0 && st.structAt[i] === -1 && st.inRing[i] === -1 && !st.fire[i]) {
            const to = REGROW_TO[st.terrain[i]];
            if (to !== undefined) { st.terrain[i] = to; sim.markDirty(i); if (st.chops) st.chops[i] = 0; }
          }
        }
        else if (LUT.wood[st.terrain[i]]) { const t0 = st.terrain[i], nt = WW.Walls.deforested(t0); if (nt !== t0) { st.terrain[i] = nt; sim.markDirty(i); } }
      }
      if (o < 0) continue;
      const t = st.terrain[i];
      if (LUT.walk[t] <= 0 || LUT.water[t] || st.inRing[i] !== -1) continue;
      land.set(o, (land.get(o) || 0) + 1);
      if (st.structAt[i] === -1 && !st.cleared[i]) intact.set(o, (intact.get(o) || 0) + (LUT.wood[t] ? 1 : 0.8));
    }
    for (const c of st.cities) {
      const l = land.get(c.id) || 1;
      const prev = c.nature == null ? 100 : c.nature;
      c.nature = Math.round(Math.min(100, (intact.get(c.id) || 0) / l * 100));
      const k = sim._kingdoms.get(c.kingdomId);
      if (prev >= 25 && c.nature < 25 && k && modeOf.get(c.id) === 'exploit' && c.natureMsgYear == null) {
        c.natureMsgYear = st.year;
        sim.event('clearcut', { city: c.name, kingdom: k.name, leader: WW.Gov.leaderFull(k) }, WW.Cities.atCity(c));
      }
      // Schonende pflanzen nach: Wiese neben Wald im eigenen Gebiet wird wieder Wald
      if (modeOf.get(c.id) === 'care') plantTrees(sim, c, 6);
      // Bau- und Brennholz: jedes Jahr fallen um die Stadt Bäume (Lichtungen wachsen mit der Stadt)
      fellForFirewood(sim, c, modeOf.get(c.id));
    }
    for (const k of st.kingdoms) {
      let s = 0, n = 0;
      for (const id of k.cityIds) { const c = sim._cities.get(id); if (c && c.nature != null) { s += c.nature; n++; } }
      k.nature = n ? Math.round(s / n) : 100;
    }
    // Schonende Nachbarn nehmen Kahlschlag übel
    for (const a of st.kingdoms) {
      if (natureMode(sim, a) !== 'care') continue;
      for (const b of st.kingdoms) {
        if (a === b || natureMode(sim, b) !== 'exploit' || (b.nature == null ? 100 : b.nature) > 45) continue;
        const ra = a.relations[b.id], rb = b.relations[a.id];
        if (!ra || !rb) continue;
        const pen = a.race === 'elf' ? 6 : 3;
        ra.opinion = Math.max(-100, ra.opinion - pen); rb.opinion = Math.max(-100, rb.opinion - pen * 0.5);
        if (sim.rng.chance(0.15)) sim.event('natureComplaint', { kingdom: a.name, other: b.name }, { kingdomId: a.id, cityId: a.capitalId, x: -1, y: -1 });
      }
    }
  }
  function fellForFirewood(sim, c, mode) {
    const race = WW.RACES[c.race];
    if (race && race.noDeforest) return;
    const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
    let n = Math.round(c.pop / 8 * (mode === 'exploit' ? 2 : (mode === 'care' ? 0.4 : 1)));
    for (let r = 4; r <= 22 && n > 0; r++) {
      const test = (x, y) => {
        if (n <= 0 || x < 0 || y < 0 || x >= W || y >= H) return;
        const i = y * W + x;
        if (!LUT.wood[st.terrain[i]] || st.structAt[i] !== -1 || st.inRing[i] !== -1) return;
        const o = st.owner[i];
        if (o !== -1 && o !== c.id) return;
        if (((i * 2654435761) >>> 28) & 1) return;   // nicht jeder Baum: Lichtungen statt Kahlfläche
        const nt = WW.Walls.deforested(st.terrain[i]);
        if (nt === st.terrain[i]) return;
        st.terrain[i] = nt; st.cleared[i] = C().CLEARED_MAX; sim.markDirty(i); n--;
      };
      for (let d = -r; d <= r; d++) { test(c.cx + d, c.cy - r); test(c.cx + d, c.cy + r); }
      for (let d = -r + 1; d <= r - 1; d++) { test(c.cx - r, c.cy + d); test(c.cx + r, c.cy + d); }
    }
  }

  const REGROW_TO = (function () { const T = WW.T, m = {}; m[T.GRASS] = T.FOREST; m[T.SAVANNA] = T.JUNGLE; m[T.TUNDRA] = T.TAIGA; m[T.FLOWERS] = T.MUSHROOM; return m; })();
  function plantTrees(sim, city, n) {
    const st = sim.state, W = st.W, H = st.H, T = WW.T;
    const map = {}; map[T.GRASS] = T.FOREST; map[T.SAVANNA] = T.JUNGLE; map[T.TUNDRA] = T.TAIGA; map[T.FLOWERS] = T.FOREST;
    for (let m = 0; m < n * 6 && n > 0; m++) {
      const x = city.cx + sim.rng.irange(-18, 18), y = city.cy + sim.rng.irange(-18, 18);
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const i = y * W + x;
      if (st.owner[i] !== city.id || st.inRing[i] !== -1 || st.structAt[i] !== -1) continue;
      const to = map[st.terrain[i]];
      if (to === undefined) continue;
      if (Math.abs(x - city.cx) + Math.abs(y - city.cy) < 9) continue;
      if (st.terrain[i - 1] !== to && st.terrain[i + 1] !== to && st.terrain[i - W] !== to && st.terrain[i + W] !== to) continue;
      st.terrain[i] = to; st.cleared[i] = 0; sim.markDirty(i); n--;
    }
  }

  // ---------------------------------------------------------------------------
  // Aktualisierung
  // ---------------------------------------------------------------------------
  // alle 30 Ticks je Stadt: Land nehmen, wenn gebraucht
  function update(sim) {
    ensure(sim);
    const st = sim.state;
    for (const city of st.cities) {
      if (city.dead) continue;
      if (!city.governor) makeGovernor(sim, city);
      if (city.flurs == null) city.flurs = countFlurs(sim, city);
      // stetige Landnahme: bei Bedarf sofort, sonst alle paar Monate bis zur Ziel-Flurenzahl
      const k = sim._kingdoms.get(city.kingdomId);
      const sp = (WW.GOVERNMENTS[(k && k.gov) || 'tribe'].landSpeed || 1);
      const since = st.tick - (city.lastClaim || 0);
      const grow = city.flurs < flurTarget(sim, city) && since >= C().FLUR_GROW_TICKS / sp;
      if ((city.needLand && since >= C().FLUR_CLAIM_TICKS) || grow) {
        city.lastClaim = st.tick;
        if (!claimNext(sim, city)) city.landFull = true;
        else {
          city.landFull = false;
          if (city.flurMark == null) city.flurMark = Math.max(1, city.flurs - 1);
          if (city.flurs >= city.flurMark * 2 && city.flurs >= 18) {
            sim.event('territoryDoubled', { city: city.name, n: city.flurs }, WW.Cities.atCity(city));
            city.flurMark = city.flurs;
          }
        }
        city.needLand = false;
      }
    }
    for (const k of st.kingdoms) if (k.leaderId >= 0 || WW.GOVERNMENTS[k.gov].noLeader) ensureRuler(sim, k);
  }

  function yearly(sim) {
    ensure(sim);
    const st = sim.state;
    if (!st.cleared || st.cleared.length !== st.W * st.H) st.cleared = new Uint8Array(st.W * st.H);
    if (!st.chops || st.chops.length !== st.W * st.H) st.chops = new Uint8Array(st.W * st.H);
    natureYearly(sim);
    // abgeschnittene Fluren, Grenzfluren im Krieg
    for (const city of st.cities) if (!city.dead) cutOff(sim, city);
    let anyWar = false;
    for (const k of st.kingdoms) for (const o in k.relations) if (k.relations[o].status === 'war') anyWar = true;
    if (anyWar) warFlips(sim);
    for (const city of st.cities.slice()) {
      if (city.dead) continue;
      const k = sim._kingdoms.get(city.kingdomId);
      if (!k) continue;
      // Loyalität nähert sich dem Ziel
      const target = loyaltyTarget(sim, city, k);
      if (city.loyalty == null) city.loyalty = target;
      city.loyalty += (target - city.loyalty) * 0.3;
      city.loyalty = WW.SimUtil.clamp(city.loyalty, -100, 100);
      if (city.loyalty < 8 && k.capitalId !== city.id && k.cityIds.length >= 2 && st.laws.govChanges) {
        const p = addPlot(sim, 'secession', k.id, city.id, city.id, city.cx + 0.5, city.cy + 0.5);
        if (!p.announced) { p.announced = true; sim.event('plotSecession', { city: city.name, kingdom: k.name }, WW.Cities.atCity(city)); }
      }
      // Zuzug in kleine Dörfer mit Nahrung
      const sk = WW.Cities.stock(sim, city);
      if (city.pop < 30 && city.pop > 0 && city.centerOk && sk.food > city.pop * 2 + 10 && city.housing > city.pop && st.units.length < C().MAX_UNITS - 50) {
        const n = Math.max(0, Math.round(WW.SimUtil.mod(sim, k, city, 'immigration', WW.SimUtil.mod(sim, k, city, 'growth', 1) * (1 + sim.rng.int(3)))));
        let made = 0;
        for (let m = 0; m < n && city.housing > city.pop + made; m++) {
          const t = WW.Path.nearestFree(sim, WW.Cities.centerTile(sim, city, sim.rng.int(9)), city.kingdomId, 6);
          if (t < 0) break;
          const u = WW.Units.create(sim, { x: (t % st.W) + 0.5, y: Math.floor(t / st.W) + 0.5, role: 'farmer', kingdomId: city.kingdomId, cityId: city.id, race: sim.rng.chance(0.85) ? city.race : sim.rng.pick(WW.RACE_KEYS), age: WW.CONFIG.ADULT_AGE + 2 + sim.rng.int(14) });
          if (u) { made++; WW.Units.bubble(u, 'question', 40); }
        }
        if (made && sim.rng.chance(0.25)) sim.event('migrants', { city: city.name, n: made }, WW.Cities.atCity(city));
      }
      // Neue Reiche von selbst
      if (st.laws.newRealms && city.pop >= 18 && st.units.length < C().MAX_UNITS - 100) {
        const g = WW.GOVERNMENTS[k.gov];
        if ((city.pop > city.housing + 2 || city.happiness < 32) && sim.rng.chance(0.08)) emigrate(sim, city, 4 + sim.rng.int(4), 'exodus');
        else if ((g.key === 'fascism' || g.key === 'monarchy' || g.key === 'theocracy') && city.happiness < 45 && sim.rng.chance(0.04)) emigrate(sim, city, 3 + sim.rng.int(3), 'exiles');
      }
    }
  }

  WW.Growth = {
    FLUR: F, dims: dims, ensure: ensure, flurAt: flurAt, flurCenter: flurCenter, setFlur: setFlur, countFlurs: countFlurs,
    reach: reach, claimInitial: claimInitial, claimNext: claimNext, claimTiles: claimTiles, releaseCity: releaseCity,
    cutOff: cutOff, warFlips: warFlips, makeGovernor: makeGovernor, ensureRuler: ensureRuler, cityLimit: cityLimit,
    loyaltyTarget: loyaltyTarget, loyaltyRaw: loyaltyRaw, secedeByLoyalty: secedeByLoyalty, planWar: planWar, planAlliance: planAlliance,
    addPlot: addPlot, removePlot: removePlot, updatePlots: updatePlots, emigrate: emigrate, freeSite: freeSite,
    update: update, yearly: yearly, QUIRKS: QUIRKS, flurTarget: flurTarget, claimableAt: claimableAt, natureMode: natureMode, natureMul: natureMul, natureYearly: natureYearly
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));

// ============================================================================
// Rohstoffe (Stufe 3b): Vorkommen (state.deposit), Minen, Schmiede, Fischerei, Weide
// ============================================================================
(function (WW) { 'use strict';

  const RES_NAME = { iron: 'Eisen', coal: 'Kohle', gold: 'Gold', crystal: 'Kristall', fish: 'Fisch' };
  const YPS = () => WW.CONFIG.TPY / WW.CONFIG.TPS;   // Aufrufe (je 1 s) pro Jahr
  // Erträge je Jahr (gebaut, voll besetzt)
  const Y = { mine: 6, fish: 14, wool: 4, woolFood: 3, crystalGold: 5 };
  const MINE_LEFT_PER_TILE = 70;      // Vorrat je Vorkommens-Kachel; eine Mine mit 4 Kacheln hält etwa 45 Jahre
  const COLD = {};                    // kalte Gegenden: Wolle wärmt
  for (const k of ['taiga', 'tundra', 'snowfield', 'snow']) if (WW.TERRAIN_BY_KEY && WW.TERRAIN_BY_KEY[k]) COLD[WW.TERRAIN_BY_KEY[k].id] = 1;

  // ---------------------------------------------------------------- Vorkommen erzeugen
  // Eigener Zufall aus dem Weltsamen (sim.rng bleibt unberührt): gleicher Samen + gleiches Gelände = gleiche Vorkommen.
  function generate(sim) {
    const st = sim.state, W = st.W, H = st.H, T = WW.T;
    if (!st.deposit || st.deposit.length !== W * H) st.deposit = new Uint8Array(W * H);
    const dep = st.deposit; dep.fill(0);
    const rng = WW.RNG.create('deposit/' + String(st.seed));
    const CS = 10, cw = Math.ceil(W / CS), ch = Math.ceil(H / CS);
    const metal = new Uint8Array(cw * ch), rich = new Float32Array(cw * ch), fishR = new Float32Array(cw * ch);
    for (let c = 0; c < cw * ch; c++) {
      const r = rng.next();
      metal[c] = r < 0.45 ? 1 : (r < 0.85 ? 2 : 3);         // Eisen / Kohle / Gold je Gegend
      rich[c] = rng.next(); fishR[c] = rng.next();
    }
    const ter = st.terrain;
    const isMt = (t) => t === T.MOUNTAIN || t === T.SNOW;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, t = ter[i];
      const c = Math.floor(y / CS) * cw + Math.floor(x / CS);
      const r1 = rng.next(), r2 = rng.next();               // immer zwei Züge je Kachel: stabil bei Geländeänderung
      if (t === T.HILL) {
        let m = 0;
        if (isMt(ter[i - 1])) m++; if (isMt(ter[i + 1])) m++; if (isMt(ter[i - W])) m++; if (isMt(ter[i + W])) m++;
        if (r1 < (m ? 0.42 : 0.09) * (0.25 + rich[c])) dep[i] = metal[c];
      } else if (t === T.MOUNTAIN) {
        const edge = WW.TERRAIN_LUT.walk[ter[i - 1]] > 0 || WW.TERRAIN_LUT.walk[ter[i + 1]] > 0 || WW.TERRAIN_LUT.walk[ter[i - W]] > 0 || WW.TERRAIN_LUT.walk[ter[i + W]] > 0;
        if (edge && r1 < 0.3 * (0.25 + rich[c])) dep[i] = metal[c];
        else if (edge && r2 < 0.025) dep[i] = 4;           // selten: Kristall im Gebirge
      } else if (t === T.CRYSTAL) {
        if (r1 < 0.55) dep[i] = 4;
      } else if (t === T.SHALLOW) {
        if (r1 < 0.3 * (0.15 + fishR[c])) dep[i] = 5;
      }
    }
    return dep;
  }

  function depAt(st, i) { return WW.DEPOSITS[st.deposit ? st.deposit[i] : 0] || null; }

  // ---------------------------------------------------------------- Planung
  // Regierungen gewichten: wer zuerst was baut. tribe: Weide + Fischerei, keine Mine.
  function wishList(sim, city, k) {
    const gk = (k && k.gov) || 'tribe';
    const race = city.race;
    let list;
    if (gk === 'fascism' || gk === 'communism') list = ['mine:coal', 'mine:iron', 'smithy', 'fishery', 'pasture', 'mine:gold', 'mine:crystal'];
    else if (gk === 'republic') list = ['mine:crystal', 'mine:gold', 'fishery', 'pasture', 'mine:iron', 'smithy', 'mine:coal'];
    else if (gk === 'tribe') list = ['pasture', 'fishery'];
    else if (gk === 'monarchy' || gk === 'theocracy') list = ['mine:iron', 'fishery', 'smithy', 'pasture', 'mine:gold', 'mine:crystal', 'mine:coal'];
    else list = ['fishery', 'pasture', 'mine:iron', 'mine:crystal', 'smithy', 'mine:gold', 'mine:coal'];
    if (race === 'elf') list = list.filter(w => w.indexOf('mine') !== 0 && w !== 'smithy');   // Elfen graben nicht
    const g = WW.GOVERNMENTS[gk];
    if (g && g.goldMul <= 0) list = list.filter(w => w !== 'mine:gold');
    return list;
  }

  // freie 2×2-Fläche nahe einem Vorkommen (oder Weideland) suchen
  function findSpot(sim, city, kind, res) {
    const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
    const r = Math.min(24, WW.Cities.territoryRadius(city, sim) + 3);
    const px = city.cx + 0.5, py = city.cy + 0.5;
    const owner = st.owner, inRing = st.inRing, id = city.id, dep = st.deposit, ter = st.terrain;
    const code = res ? WW.DEPOSIT_CODE[res] : 0;
    const o = {
      // Minen dürfen auch innerhalb der eigenen Mauer liegen (Vorkommen im Stadtgebiet), alles andere davor
      area: (i, inner) => (owner[i] === id || (!inner && owner[i] === -1)) && (inRing[i] === -1 || (kind === 'mine' && inRing[i] === id)),
      fieldOk: kind === 'pasture', race: city.race, cityId: id, needWalkBorder: false
    };
    const minD = (city.wall.plan ? 0 : WW.CONFIG.WALL_RESERVE) + WW.CONFIG.WALL_MARGIN + 2;
    let best = -1, bs = -1e9, bestN = 0;
    for (let y = Math.max(1, Math.floor(py - r)); y <= Math.min(H - 4, Math.ceil(py + r)); y++) {
      for (let x = Math.max(1, Math.floor(px - r)); x <= Math.min(W - 4, Math.ceil(px + r)); x++) {
        const d = Math.sqrt((x + 1 - px) * (x + 1 - px) + (y + 1 - py) * (y + 1 - py));
        if (d < minD || d > r) continue;
        const i0 = y * W + x;
        if (owner[i0] !== id) continue;
        let n = 0;
        if (kind === 'pasture') {
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const t = ter[i0 + dy * W + dx]; if (LUT.fertile[t] >= 0.3 && !LUT.wood[t]) n++; }
          if (n < 4) continue;
        } else if (kind === 'smithy') {
          n = 1;   // Schmiede vor der Mauer: kein Vorkommen nötig, möglichst nah am Zentrum
        } else {
          for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) if (dep[i0 + dy * W + dx] === code) n++;
          if (n < (kind === 'fishery' ? 3 : 2)) continue;
        }
        let near = false;
        for (let dy = -2; dy <= 3 && !near; dy++) for (let dx = -2; dx <= 3; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const s = sim._structs.get(st.structAt[yy * W + xx]);
          if (s && (WW.Structs.isWallish(s) || (s.cityId === id && WW.STRUCT_INFO[s.type] && WW.STRUCT_INFO[s.type].core))) { near = true; break; }
        }
        if (near) continue;
        if (WW.Cities.footprintOk(sim, x, y, 2, 2, o) < 0) continue;
        const score = n * 0.8 - d * 0.4 + sim._hashNoise(i0) * 0.3;
        if (score > bs) { bs = score; best = i0; bestN = n; }
      }
    }
    return best < 0 ? null : { i: best, n: bestN };
  }

  function plan(sim, city, k, have) {
    const st = sim.state, W = st.W;
    if (city.pop < 12 || !city.centerOk) return;
    let open = 0;
    for (const id of city.sites) { const s = sim._structs.get(id); if (s && !WW.Structs.isWallish(s) && !s.built) open++; }
    if (open >= 1 + city.tier) return;
    const sk = WW.Cities.stock(sim, city);
    for (const wish of wishList(sim, city, k)) {
      const p = wish.split(':'), type = p[0], res = p[1] || null;
      if (type === 'mine') { if (have['mine:' + res] || city.pop < 16 || have.mine >= 1 + (city.tier >= 2 ? 1 : 0)) continue; }
      else if (have[type]) continue;
      if (type === 'smithy' && (city.pop < 20 || (!have['mine:iron'] && sk.iron < 3))) continue;
      if (type === 'fishery' && city.noFish && st.year < city.noFish) continue;
      if (type === 'smithy' && city.noSmithy && st.year < city.noSmithy) continue;
      if (type === 'mine' && city.noDep && city.noDep[res] && st.year < city.noDep[res]) continue;
      const cost = WW.Structs.costFor(sim, type, 1, city.id);
      if (!WW.Cities.canPay(sim, city, cost)) continue;
      let at = null;
      if (type === 'smithy') {
        // zuerst in der Stadt, sonst (Stadt voll) vor der Mauer wie Minen
        const i = WW.Cities.findCoreSpot(sim, city, 'smithy');
        at = i >= 0 ? { i: i, n: 0 } : findSpot(sim, city, 'smithy', null);
      }
      else at = findSpot(sim, city, type, type === 'fishery' ? 'fish' : res);
      if (!at) {
        // nichts in Reichweite: für ein paar Jahre nicht mehr suchen
        if (type === 'fishery') city.noFish = st.year + 4;
        else if (type === 'mine') { city.noDep = city.noDep || {}; city.noDep[res] = st.year + 4; }
        else if (type === 'smithy') city.noSmithy = st.year + 2;
        continue;
      }
      const opt = { style: k ? k.gov : 'tribe' };
      const s = WW.Cities.placeStruct(sim, city, type, at.i % W, Math.floor(at.i / W), opt);
      if (!s) continue;
      if (type === 'mine') { s.res = res; s.left = Math.min(600, at.n * MINE_LEFT_PER_TILE); }
      city.sites.push(s.id);
      if (type === 'mine') sim.event('mineOpened', { city: city.name, res: RES_NAME[res] }, WW.Cities.atCity(city));
      return;
    }
  }

  // ---------------------------------------------------------------- Abbau / Erträge / Wirkung (jede Sekunde)
  function depleteMine(sim, s, city) {
    const st = sim.state, W = st.W, code = WW.DEPOSIT_CODE[s.res];
    for (let dy = -1; dy <= s.h; dy++) for (let dx = -1; dx <= s.w; dx++) {
      const x = s.x + dx, y = s.y + dy;
      if (x < 0 || y < 0 || x >= W || y >= st.H) continue;
      const i = y * W + x;
      if (st.deposit[i] === code) { st.deposit[i] = 0; sim.markDirty(i); }
    }
    if (city) sim.event('mineDepleted', { city: city.name, res: RES_NAME[s.res] }, WW.Cities.atCity(city));
    WW.Structs.remove(sim, s);
    WW.Structs.ruinize(sim, s);
  }

  function update(sim) {
    const st = sim.state;
    if (!st.deposit) generate(sim);
    const yps = YPS();
    // Rohstoff-Bauwerke je Stadt sammeln
    const by = new Map();
    for (const s of st.structs) {
      if (s.dead || s.cityId < 0) continue;
      const t = s.type;
      if (t !== 'mine' && t !== 'smithy' && t !== 'fishery' && t !== 'pasture') continue;
      let e = by.get(s.cityId);
      if (!e) { e = []; by.set(s.cityId, e); }
      e.push(s);
    }
    const slot = (st.tick / 10) | 0;
    for (const city of st.cities) {
      if (city.dead) continue;
      const k = sim._kingdoms.get(city.kingdomId);
      const list = by.get(city.id) || [];
      const have = { mine: 0 };
      for (const s of list) { if (s.type === 'mine') { have.mine++; have['mine:' + s.res] = 1; } else have[s.type] = 1; }
      if ((slot + city.id) % 25 === 0) plan(sim, city, k, have);
      const sk = WW.Cities.stock(sim, city);
      const crew = 0.5 + 0.5 * Math.min(1, city.pop / 24);
      let smithy = false;
      for (const s of list) {
        if (!s.built || s.dead) continue;
        if (s.type === 'mine') {
          const res = s.res;
          if (!res || !(res in sk)) continue;
          let a = WW.SimUtil.mod(sim, k, city, res, Y.mine * crew) / yps;
          if (s.left != null) { a = Math.min(a, s.left); s.left -= a; }
          WW.Cities.addStock(sim, city, res, a);
          if (s.left != null && s.left <= 0.001) depleteMine(sim, s, city);
        } else if (s.type === 'fishery') {
          WW.Cities.addStock(sim, city, 'fish', WW.SimUtil.mod(sim, k, city, 'fish', Y.fish * crew) / yps);
        } else if (s.type === 'pasture') {
          WW.Cities.addStock(sim, city, 'wool', WW.SimUtil.mod(sim, k, city, 'wool', Y.wool) / yps);
          WW.Cities.addStock(sim, city, 'food', Y.woolFood / yps);
        } else if (s.type === 'smithy') smithy = true;
      }
      // Schmiede: Eisen (+ Kohle) -> Waffen und Rüstung für die Soldaten
      let armed = 0;
      const milRes = WW.Military ? WW.Military.reserve(sim, city) : 0;   // [mil] Eisen fürs Arsenal liegen lassen
      if (smithy && sk.iron >= 0.2 + milRes) {
        const use = (1 + city.pop * 0.03) / yps;
        sk.iron = Math.max(0, sk.iron - use);
        armed = 1;
        if (sk.coal >= 0.2) { sk.coal = Math.max(0, sk.coal - use * 0.5); armed = 2; }
      }
      if (armed !== (city.armed || 0)) city.armed = armed;
      // Wolle wird getragen (in der Kälte mehr gebraucht), Kristall wird an Märkten zu Gold
      if (sk.wool > 0) sk.wool = Math.max(0, sk.wool - city.pop * (city.cold ? 0.08 : 0.04) / yps);
      if (sk.crystal > 0 && k) {
        const g = WW.GOVERNMENTS[k.gov];
        if (g && g.goldMul > 0 && (city.markets || g.key === 'republic')) {
          const c = Math.min(sk.crystal, (1 + (city.markets || 0)) * 1.5 / yps);
          sk.crystal -= c;
          let gold = c * Y.crystalGold * (g.key === 'republic' || g.key === 'democracy' ? 1.5 : 1);
          if (k.policy && k.policy.bonus === 'trade') gold *= 1.5;
          sk.gold = Math.min(9999, sk.gold + WW.SimUtil.mod(sim, k, city, 'crystal', gold));
        }
      }
      if (city.cold == null || (slot + city.id) % 240 === 0) city.cold = isCold(sim, city) ? 1 : 0;
    }
  }

  function isCold(sim, city) {
    const st = sim.state, W = st.W;
    let n = 0, all = 0;
    for (let dy = -6; dy <= 6; dy += 3) for (let dx = -6; dx <= 6; dx += 3) {
      const x = city.cx + dx, y = city.cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= st.H) continue;
      all++; if (COLD[st.terrain[y * W + x]]) n++;
    }
    return all > 0 && n * 3 >= all;
  }

  // Zufriedenheit aus Wolle und Kristall (für happinessTarget); Kälte ohne Wolle drückt (nicht bei Kultur nord)
  function happiness(sim, city, sk) {
    let h = 0;
    const cp = WW.Culture && WW.Culture.info(city.culture).coldProof;
    if (sk.wool >= 1) h += city.cold ? 8 : 3;
    else if (city.cold && !cp) h -= 4;
    if (city.cold && cp && sk.wool < 1) h += 2;
    if (sk.crystal >= 1) h += 3;
    return h;
  }

  // Rohstoffe prüfen / entnehmen (alles oder nichts), z. B. für Arsenal und Panzer: take(sim, city, { iron: 2, coal: 1 })
  function has(sim, city, need) {
    if (!city || !need) return false;
    const sk = WW.Cities.stock(sim, city);
    for (const r in need) if (!(typeof sk[r] === 'number' && sk[r] >= need[r])) return false;
    return true;
  }
  function take(sim, city, need) {
    if (!has(sim, city, need)) return false;
    const sk = WW.Cities.stock(sim, city);
    for (const r in need) sk[r] = Math.max(0, sk[r] - need[r]);
    return true;
  }

  // Kampfkraft/Rüstung der Soldaten einer Stadt mit Schmiede
  function armMul(sim, cityId) { const c = sim._cities.get(cityId); return c && c.armed ? (c.armed >= 2 ? 1.35 : 1.25) : 1; }
  function armorMul(sim, cityId) { const c = sim._cities.get(cityId); return c && c.armed ? 1.15 : 1; }

  WW.Resources = { has: has, take: take, generate: generate, depAt: depAt, update: update, plan: plan, findSpot: findSpot, wishList: wishList, happiness: happiness, armMul: armMul, armorMul: armorMul, isCold: isCold, YIELD: Y, RES_NAME: RES_NAME };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
