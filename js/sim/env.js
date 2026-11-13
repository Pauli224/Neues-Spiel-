// Umwelt: Felder reifen, Feuer, Wald wächst nach, Spuren verblassen, Türme schießen, Ruinen zerfallen,
// Zufallskatastrophen.
(function (WW) { 'use strict';

  const DX4 = [0, 1, 0, -1], DY4 = [-1, 0, 1, 0];

  // Brandmarke: 1..99 verkohlt, 100..199 Krater (zählen herunter)
  function setMark(sim, i, v) {
    const st = sim.state;
    if (st.mark[i] === 0 && v > 0) st.markCount++;
    if (st.mark[i] !== 0 && v === 0) st.markCount = Math.max(0, st.markCount - 1);
    st.mark[i] = v;
    sim.markDirty(i);
  }

  function burnable(sim, i) {
    const st = sim.state;
    const t = st.terrain[i];
    let b = WW.TERRAIN_LUT.burn[t];
    const s = sim._structs.get(st.structAt[i]);
    if (s) {
      let sb = WW.Structs.info(s.type).burn || 0;
      if (WW.Structs.isWallish(s) && s.level >= 2) sb = 0;
      b = Math.max(b, sb);
    }
    return b;
  }

  function ignite(sim, x, y, strength) {
    const st = sim.state;
    if (x < 0 || y < 0 || x >= st.W || y >= st.H) return false;
    x |= 0; y |= 0;
    const i = y * st.W + x;
    if (WW.TERRAIN_LUT.water[st.terrain[i]]) return false;
    if (burnable(sim, i) <= 0.05) return false;
    if (st.fire[i] === 0) st.fireCount++;
    st.fire[i] = Math.max(st.fire[i], strength || 14);
    sim.markDirty(i);
    return true;
  }

  function extinguish(sim, i) {
    const st = sim.state;
    if (st.fire[i] > 0) { st.fire[i] = 0; st.fireCount = Math.max(0, st.fireCount - 1); sim.markDirty(i); }
  }

  function updateFire(sim) {
    const st = sim.state, W = st.W, H = st.H, N = W * H;
    if (st.fireCount <= 0) { st.fireCount = 0; return; }
    let count = 0;
    const newFires = [];
    for (let i = 0; i < N; i++) {
      const f = st.fire[i];
      if (!f) continue;
      const x = i % W, y = (i - x) / W;
      // Bauwerk brennt
      const s = sim._structs.get(st.structAt[i]);
      if (s) {
        let sb = WW.Structs.info(s.type).burn || 0;
        if (WW.Structs.isWallish(s) && s.level >= 2) sb = 0;
        if (sb > 0 && (s.built || s.progress > 0)) WW.Structs.damage(sim, s, 5 * sb, null);
      }
      // Einheiten auf der Kachel
      WW.Units.forNear(sim, x + 0.5, y + 0.5, 0.8, false, (u) => { u.hp -= 1.5; if (u.hp <= 0) WW.Units.kill(sim, u, 'fire'); });
      // Ausbreitung
      for (let d = 0; d < 4; d++) {
        const nx = x + DX4[d], ny = y + DY4[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (st.fire[n]) continue;
        const b = burnable(sim, n);
        if (b > 0.05 && sim.rng.next() < b * 0.07) newFires.push(n);
      }
      const nf = f - 1;
      st.fire[i] = nf;
      if (nf === 0) {
        const t = st.terrain[i];
        const nt = WW.Walls.deforested(t);
        if (nt !== t) st.terrain[i] = nt;
        if (WW.TERRAIN_LUT.burn[t] > 0) setMark(sim, i, 60 + sim.rng.int(30));
        sim.markDirty(i);
      } else count++;
    }
    for (const n of newFires) {
      if (st.fire[n]) continue;
      st.fire[n] = 10 + sim.rng.int(6); count++;
      sim.markDirty(n);
    }
    st.fireCount = count;
  }

  function updateMarks(sim) {
    const st = sim.state;
    if (st.markCount <= 0) return;
    let c = 0;
    for (let i = 0; i < st.mark.length; i++) {
      const m = st.mark[i];
      if (!m) continue;
      const nm = (m === 1 || m === 100) ? 0 : m - 1;
      st.mark[i] = nm;
      if (nm === 0) sim.markDirty(i); else c++;
    }
    st.markCount = c;
  }

  // Wald wächst nach: zufällige Kacheln neben Wald
  const REGROW = {};
  function regrowMap() {
    if (REGROW.done) return REGROW;
    const T = WW.T;
    REGROW[T.GRASS] = T.FOREST; REGROW[T.SAVANNA] = T.JUNGLE; REGROW[T.TUNDRA] = T.TAIGA; REGROW[T.FLOWERS] = T.MUSHROOM;
    REGROW.done = true;
    return REGROW;
  }
  function regrow(sim, tries, bonus) {
    const st = sim.state, W = st.W, H = st.H;
    const map = regrowMap();
    for (let n = 0; n < tries; n++) {
      const i = sim.rng.int(W * H);
      const t = st.terrain[i];
      const to = map[t];
      if (to === undefined) continue;
      if (st.structAt[i] !== -1 || st.inRing[i] !== -1 || st.fire[i]) continue;
      const x = i % W, y = (i - x) / W;
      let nb = 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX4[d], ny = y + DY4[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (st.terrain[ny * W + nx] === to) nb++;
      }
      if (nb >= 2 || (nb === 1 && (bonus || sim.rng.chance(0.3)))) {
        // nicht direkt neben Häusern/Zentren zuwachsen
        if (st.owner[i] !== -1 && !bonus && sim.rng.chance(0.7)) continue;
        st.terrain[i] = to; sim.markDirty(i);
      }
    }
  }

  // Regen: Wald wächst im Umkreis (bevorzugt neben Wald)
  function regrowAt(sim, x, y, r, p) {
    const st = sim.state, W = st.W, H = st.H;
    const map = regrowMap();
    const ch = [];
    WW.Powers.forDisc(sim, x, y, r, (i, xx, yy) => {
      const to = map[st.terrain[i]];
      if (to === undefined || st.structAt[i] !== -1 || st.inRing[i] !== -1) return;
      let nb = 0;
      for (let d = 0; d < 4; d++) {
        const nx = xx + DX4[d], ny = yy + DY4[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (st.terrain[ny * W + nx] === to) nb++;
      }
      if (sim.rng.next() < p * (nb ? 1 : 0.3)) ch.push(i, to);
    });
    for (let k = 0; k < ch.length; k += 2) { st.terrain[ch[k]] = ch[k + 1]; sim.markDirty(ch[k]); }
  }

  function updateFields(sim) {
    const st = sim.state;
    const inc = 10 / WW.CONFIG.FIELD_STAGE_TICKS;
    for (const s of st.structs) {
      if (s.dead || s.type !== 'field' || s.growth >= 3) continue;
      const fert = Math.max(0.25, WW.TERRAIN_LUT.fertile[st.terrain[s.y * st.W + s.x]]);
      s.gprog += inc * (0.5 + fert * 0.5);
      if (s.gprog >= 1) { s.growth++; s.gprog = 0; sim.markDirty(s.y * st.W + s.x); }
    }
  }

  // Türme schießen auf Feinde
  function updateTowers(sim) {
    const st = sim.state;
    const R = WW.CONFIG.TOWER_RANGE;
    for (const s of st.structs) {
      if (s.dead || s.type !== 'tower' || !s.built) continue;
      const c = sim._cities.get(s.cityId);
      if (!c) continue;
      const k = sim._kingdoms.get(c.kingdomId);
      if (!k) continue;
      let warring = false;
      for (const oid in k.relations) if (k.relations[oid].status === 'war') { warring = true; break; }
      const x = s.x + 0.5, y = s.y + 0.3;
      let target = null, bd = 1e9;
      if (warring || c.revolt) {
        WW.Units.forNear(sim, x, y, R, false, (u, d2) => {
          const enemy = (u.kingdomId !== k.id && WW.Path.hostileKingdoms(sim, k.id, u.kingdomId)) || (u.kingdomId === k.id && u.role === 'rebel');
          if (enemy && d2 < bd) { bd = d2; target = u; }
        });
      }
      if (!target) {
        WW.Units.forNear(sim, x, y, R, true, (a, d2) => {
          const cr = WW.CREATURES[a.kind];
          if (cr && cr.hostile && d2 < bd) { bd = d2; target = a; }
        });
      }
      if (!target) continue;
      sim.fx({ type: 'arrow', x: x, y: y - 0.6, x2: target.x, y2: target.y - 0.3 });
      const dmg = WW.CONFIG.TOWER_DMG * (s.level >= 3 ? 1.4 : 1);
      if (target.role !== undefined) WW.Units.hitUnit(sim, { id: -1, kingdomId: k.id }, target, dmg);
      else WW.Creatures.hit(sim, target, dmg, null);
    }
  }

  function yearlyRuins(sim) {
    for (const s of sim.state.structs.slice()) {
      if (s.dead || s.type !== 'ruin') continue;
      s.age = (s.age || 0) + 1;
      if (s.age >= 10) WW.Structs.remove(sim, s);
    }
  }

  // Zufallskatastrophen (Weltgesetz)
  function disasters(sim) {
    const st = sim.state;
    if (!st.laws.disasters) return;
    const r = sim.rng.next();
    if (r < 0.05) {
      const x = sim.rng.int(st.W), y = sim.rng.int(st.H);
      if (WW.TERRAIN_LUT.walk[st.terrain[y * st.W + x]] > 0) {
        WW.Powers.strike(sim, x, y, 'lightning', true);
        const c = sim._cities.get(st.owner[y * st.W + x]);
        sim.event('randomLightning', { city: c ? c.name : 'der Wildnis' }, { kingdomId: c ? c.kingdomId : -1, cityId: c ? c.id : -1, x: x, y: y });
      }
    } else if (r < 0.07 && st.cities.length) {
      const c = st.cities[sim.rng.int(st.cities.length)];
      WW.Powers.strike(sim, c.cx + 0.5, c.cy + 0.5, 'plague', true);
      sim.event('randomPlague', { city: c.name }, WW.Cities.atCity(c));
    }
  }

  function update(sim) {
    const t = sim.state.tick;
    if (t % 10 === 3) updateFields(sim);
    if (t % 5 === 1) updateFire(sim);
    if (t % 7 === 2) updateTowers(sim);
    if (t % 40 === 5) updateMarks(sim);
    regrow(sim, 2, false);
  }
  function yearly(sim) {
    yearlyRuins(sim);
    disasters(sim);
  }

  WW.Env = { update: update, yearly: yearly, ignite: ignite, extinguish: extinguish, setMark: setMark, regrow: regrow, regrowAt: regrowAt, burnable: burnable };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
