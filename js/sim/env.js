// Umwelt: Felder reifen, Feuer, Wald wächst nach, Spuren verblassen, Türme schießen, Ruinen zerfallen,
// Zufallskatastrophen. [Stufe 3] Natur-Schleife (Gras wächst nach, Asche -> Wiese -> Wald, Blumen, Beeren,
// Lava kühlt ab und zündet, Fallout und Erdbebenrisse klingen ab), Waldbrand hinterlässt Asche.
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

  // [walls] Stein brennt nicht; Holzstufen (Stamm) und Barrikaden schon
  function stoneWall(s) { return s.level >= 2 && s.mat !== 'palisade' && s.mat !== 'barricade'; }
  function burnable(sim, i) {
    const st = sim.state;
    const t = st.terrain[i];
    let b = WW.TERRAIN_LUT.burn[t];
    const s = sim._structs.get(st.structAt[i]);
    if (s) {
      let sb = WW.Structs.info(s.type).burn || 0;
      if (WW.Structs.isWallish(s) && stoneWall(s)) sb = 0;
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
        if (WW.Structs.isWallish(s) && stoneWall(s)) sb = 0;
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
        if (WW.TERRAIN_LUT.wood[t] && st.structAt[i] === -1) {
          // Waldbrand: es bleibt Asche, darauf wächst erst Wiese, dann Wald
          st.terrain[i] = WW.T.ASH; st.flora[i] = FL_ASH; st.graze[i] = 1;
        } else {
          const nt = WW.Walls.deforested(t);
          if (nt !== t) st.terrain[i] = nt;
          if (st.flora[i] === FL_BERRY || st.flora[i] === FL_BUSH) st.flora[i] = 0;
        }
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

  // Feuer auch auf Nicht-Brennbarem (Napalm, Laser): brennt lange, breitet sich nur auf Brennbares aus
  function igniteForce(sim, i, strength) {
    const st = sim.state;
    if (i < 0 || i >= st.W * st.H || WW.TERRAIN_LUT.water[st.terrain[i]]) return false;
    if (st.fire[i] === 0) st.fireCount++;
    st.fire[i] = Math.max(st.fire[i], Math.min(255, strength || 30));
    sim.markDirty(i);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Natur-Schleife: je Tick 1/SLICES der Karte. Raster (siehe js/sim/wild.js):
  //   flora 0 nichts | 1 Beerenstrauch reif | 2 Beerenstrauch abgeerntet | 3 Asche wächst zu | 5 frische Lava kühlt ab
  //   graze 0..255: auf Wiese = abgeweidet (>= GRAZE_SHOW sichtbar); auf flora 3/5 = Fortschritt bis 255
  //   fallout 0..255 klingt ab; crack 0..255 (Erdbebenriss) verblasst
  // ---------------------------------------------------------------------------
  const FL_BERRY = 1, FL_BUSH = 2, FL_ASH = 3, FL_LAVA = 5;
  function hash2(i, t) {
    let h = Math.imul(i ^ 0x27d4eb2d, 0x85ebca6b) ^ Math.imul(t + 0x165667b1, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }
  const CFG_FALLBACK = { SLICES: 16, CRACK_DECAY: 2, FALLOUT_DECAY: 2, ASH_STEP: 3, LAVA_STEP: 4, GRAZE_REGROW: 6, GRAZE_SHOW: 128,
    BERRY_DEATH: 0.004, BERRY_REGROW: 0.05, BERRY_BIRTH: 0.00006, FLOWER_BIRTH: 0.0006, FLOWER_DEATH: 0.0004 };
  function natureSlice(sim) {
    const st = sim.state, W = st.W, H = st.H, N = W * H;
    const C = (WW.WILD && WW.WILD.CFG) || CFG_FALLBACK, T = WW.T, LUT = WW.TERRAIN_LUT;
    const per = Math.ceil(N / C.SLICES);
    const k = st.tick % C.SLICES;
    const i0 = k * per, i1 = Math.min(N, i0 + per);
    const ter = st.terrain, flora = st.flora, graze = st.graze, fall = st.fallout, crack = st.crack;
    const tk = st.tick;
    for (let i = i0; i < i1; i++) {
      const t = ter[i], fl = flora[i];
      if (crack[i]) { const v = crack[i] > C.CRACK_DECAY ? crack[i] - C.CRACK_DECAY : 0; crack[i] = v; if (!v) sim.markDirty(i); }
      if (fall[i]) { const v = fall[i] > C.FALLOUT_DECAY ? fall[i] - C.FALLOUT_DECAY : 0; fall[i] = v; if (!v) sim.markDirty(i); continue; }
      if (fl === FL_ASH) {
        if (t !== T.ASH) { flora[i] = 0; graze[i] = 0; continue; }
        const v = graze[i] + C.ASH_STEP;
        if (v >= 255) { ter[i] = T.GRASS; flora[i] = 0; graze[i] = 0; sim.markDirty(i); } else graze[i] = v;
        continue;
      }
      if (fl === FL_LAVA) {
        if (t !== T.LAVA) { flora[i] = 0; graze[i] = 0; continue; }
        const v = graze[i] + C.LAVA_STEP;
        igniteNear(sim, i, tk);
        if (v >= 255) { coolLava(sim, i); } else graze[i] = v;
        continue;
      }
      if (t === T.LAVA) { if (hash2(i, tk) < 0.004) igniteNear(sim, i, tk); continue; }
      if (graze[i]) {
        const v = graze[i] > C.GRAZE_REGROW ? graze[i] - C.GRAZE_REGROW : 0;
        if (graze[i] >= C.GRAZE_SHOW && v < C.GRAZE_SHOW) sim.markDirty(i);
        graze[i] = v;
      }
      if (st.structAt[i] !== -1) continue;
      const r = hash2(i, tk);
      if (fl === FL_BERRY || fl === FL_BUSH) {
        if (r < C.BERRY_DEATH || !(t === T.GRASS || t === T.FOREST || t === T.FLOWERS || t === T.TAIGA || t === T.JUNGLE)) { flora[i] = 0; sim.markDirty(i); }
        else if (fl === FL_BUSH && r > 1 - C.BERRY_REGROW) { flora[i] = FL_BERRY; sim.markDirty(i); }
        continue;
      }
      if (t === T.GRASS) {
        if (graze[i] === 0 && r < C.FLOWER_BIRTH) { ter[i] = T.FLOWERS; sim.markDirty(i); }
        else if (r > 1 - C.BERRY_BIRTH && st.owner[i] === -1) { flora[i] = FL_BERRY; sim.markDirty(i); }
      } else if (t === T.FLOWERS) {
        if (r < C.FLOWER_DEATH) { ter[i] = T.GRASS; sim.markDirty(i); }
      } else if (t === T.FOREST && r > 1 - C.BERRY_BIRTH * 0.7) {
        const x = i % W, y = (i - x) / W;
        // nur am Waldrand
        if ((x > 0 && ter[i - 1] === T.GRASS) || (x < W - 1 && ter[i + 1] === T.GRASS) || (y > 0 && ter[i - W] === T.GRASS) || (y < H - 1 && ter[i + W] === T.GRASS)) { flora[i] = FL_BERRY; sim.markDirty(i); }
      }
    }
  }
  function igniteNear(sim, i, tk) {
    const st = sim.state, W = st.W;
    const d = Math.floor(hash2(i, tk + 7) * 4);
    const x = (i % W) + DX4[d], y = Math.floor(i / W) + DY4[d];
    if (x < 0 || y < 0 || x >= W || y >= st.H) return;
    const n = y * W + x;
    if (burnable(sim, n) > 0.05 && !st.fire[n]) ignite(sim, x, y, 12);
    // Leute und Tiere auf Lava-Nachbarn verbrennen nicht sofort, aber Bauwerke auf Lava schon (siehe wild.js)
  }
  // frische Lava erstarrt: Asche (wächst zu) oder Fels je nach Höhe
  function coolLava(sim, i) {
    const st = sim.state;
    const band = WW.Wild ? WW.Wild.bandOf(st.height[i]) : 4;
    let t = WW.T.ASH;
    if (band >= 7) t = WW.T.SNOW; else if (band === 6) t = WW.T.MOUNTAIN; else if (band === 5) t = WW.T.HILL;
    st.terrain[i] = t;
    if (WW.Wild && WW.Wild.markRescue) WW.Wild.markRescue(sim, i);
    st.flora[i] = t === WW.T.ASH ? FL_ASH : 0; st.graze[i] = t === WW.T.ASH ? 1 : 0;
    sim.markDirty(i);
    sim.terrainChanged();
    if (sim.rng.chance(0.1)) sim.fx({ type: 'steam', x: (i % st.W) + 0.5, y: Math.floor(i / st.W) + 0.5 });
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
      if (st.structAt[i] !== -1 || st.inRing[i] !== -1 || st.fire[i] || st.fallout[i]) continue;
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
      if (to === undefined || st.structAt[i] !== -1 || st.inRing[i] !== -1 || st.fallout[i]) return;
      let nb = 0;
      for (let d = 0; d < 4; d++) {
        const nx = xx + DX4[d], ny = yy + DY4[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (st.terrain[ny * W + nx] === to) nb++;
      }
      if (sim.rng.next() < p * (nb ? 1 : 0.3)) ch.push(i, to);
    });
    for (let k = 0; k < ch.length; k += 2) { st.terrain[ch[k]] = ch[k + 1]; sim.markDirty(ch[k]); if (WW.Wild && WW.Wild.markRescue) WW.Wild.markRescue(sim, ch[k]); }
  }

  function updateFields(sim) {
    const st = sim.state;
    const inc = 10 / WW.CONFIG.FIELD_STAGE_TICKS;
    for (const s of st.structs) {
      if (s.dead || s.type !== 'field' || s.growth >= 3) continue;
      if (st.fallout[s.y * st.W + s.x] > 0) continue;   // im Fallout wächst nichts
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
          if (cr && (cr.hostile || a.mad > st.tick) && !(cr.burrow && a.buried) && d2 < bd) { bd = d2; target = a; }
        });
      }
      // Räuber und Wahnsinnige (Einheiten ohne Reich)
      if (!target) {
        WW.Units.forNear(sim, x, y, R, false, (u, d2) => {
          if ((u.role === 'bandit' || u.wMad > st.tick) && d2 < bd) { bd = d2; target = u; }
        });
      }
      if (!target) continue;
      sim.fx({ type: 'arrow', x: x, y: y - 0.6, x2: target.x, y2: target.y - 0.3 });
      const dmg = WW.CONFIG.TOWER_DMG * (s.level >= 3 ? 1.4 : 1);
      if (target.role !== undefined) WW.Units.hitUnit(sim, { id: -1, kingdomId: k.id }, target, dmg);
      else WW.Creatures.hit(sim, target, dmg, null);
    }
  }

  // ---------------------------------------------------------------------------
  // [walls] Verteidigungsgeräte auf Mauerstücken (WW.WALL_DEVICES). Nur bei Krieg, Aufstand oder Alarm.
  // ---------------------------------------------------------------------------
  function deviceTargets(sim, k, c, x, y, r) {
    const st = sim.state;
    const foes = [];
    WW.Units.forNear(sim, x, y, r, false, (u, d2) => {
      const enemy = (u.kingdomId !== k.id && WW.Path.hostileKingdoms(sim, k.id, u.kingdomId)) || (u.kingdomId === k.id && u.role === 'rebel') ||
        u.role === 'bandit' || u.wMad > st.tick;
      if (enemy && st.inRing[Math.floor(u.y) * st.W + Math.floor(u.x)] !== c.id) foes.push([u, d2]);
    });
    WW.Units.forNear(sim, x, y, r, true, (a, d2) => {
      const cr = WW.CREATURES[a.kind];
      if (cr && (cr.hostile || a.mad > st.tick) && !(cr.burrow && a.buried)) foes.push([a, d2]);
    });
    return foes;
  }
  function devHit(sim, k, t, dmg) {
    if (t.role !== undefined) WW.Units.hitUnit(sim, { id: -1, kingdomId: k.id }, t, dmg);
    else WW.Creatures.hit(sim, t, dmg, null);
  }
  function updateDevices(sim) {
    const st = sim.state;
    if (!WW.WALL_DEVICES) return;
    for (const c of st.cities) {
      const w = c.wall;
      if (!w || !w.devices || !w.devices.length) continue;
      const k = sim._kingdoms.get(c.kingdomId);
      if (!k) continue;
      let alert = c.revolt || c.wAlarm > st.tick;
      if (!alert) for (const oid in k.relations) if (k.relations[oid].status === 'war') { alert = true; break; }
      if (!alert) continue;
      for (const id of w.devices) {
        const s = sim._structs.get(id);
        if (!s || s.dead || !s.built || !s.device) continue;
        if (s.devCd > 0) { s.devCd -= 3; continue; }
        const D = WW.WALL_DEVICES[s.device];
        if (!D) continue;
        const x = s.x + 0.5, y = s.y + 0.5;
        let foes = deviceTargets(sim, k, c, x, y, D.range);
        if (D.minRange) foes = foes.filter((f) => f[1] >= D.minRange * D.minRange);
        if (!foes.length) continue;
        s.devCd = D.reload;
        sim.fx({ type: 'muzzle', x: x, y: y - 0.4 });
        if (s.device === 'spikes') { for (const f of foes) devHit(sim, k, f[0], D.dmg); sim.fx({ type: 'spikes', x: x, y: y }); continue; }
        if (s.device === 'ward') {
          for (const f of foes) { const t = f[0]; t.cd = Math.max(t.cd || 0, D.slow); devHit(sim, k, t, D.dmg); }
          sim.fx({ type: 'ward', x: x, y: y, r: D.range });
          continue;
        }
        // Ziel: nächstes (Balliste bevorzugt Belagerungsgerät)
        foes.sort((a, b) => a[1] - b[1]);
        let t = foes[0][0];
        if (s.device === 'ballista') { const e = foes.find((f) => f[0].role === 'ram' || f[0].role === 'catapult'); if (e) t = e[0]; }
        if (s.device === 'post') {
          // Bewohner in der Nähe schießen mit
          let people = 0;
          WW.Units.forNear(sim, x, y, 3, false, (u) => { if (u.cityId === c.id && u.role !== 'child' && u.role !== 'soldier') people++; });
          if (!people) { s.devCd = 6; continue; }
        }
        if (s.device === 'selfshot' && sim.rng.chance(D.stray)) {
          // trifft gelegentlich ein Schaf in der Nähe
          let sheep = null;
          WW.Units.forNear(sim, x, y, D.range + 1, true, (a) => { if (!sheep && (a.kind === 'sheep' || a.kind === 'cow' || a.kind === 'rabbit')) sheep = a; });
          if (sheep) {
            sim.fx({ type: 'tracer', x: x, y: y - 0.4, x2: sheep.x, y2: sheep.y });
            WW.Creatures.hit(sim, sheep, 999, null);
            if (WW.Wild) WW.Wild.chron(sim, 'selfshotSheep', { city: c.name }, WW.Cities.atCity(c), c.id, WW.CONFIG.TPY * 2);
            continue;
          }
        }
        if (s.device === 'trap') {
          const r = sim.rng.next();
          if (r < D.dud) { sim.fx({ type: 'dud', x: x, y: y }); continue; }
          if (r < D.dud + D.oops) {
            let own = null;
            WW.Units.forNear(sim, x, y, D.range, false, (u) => { if (!own && u.cityId === c.id) own = u; });
            if (own) {
              sim.fx({ type: 'tracer', x: x, y: y - 0.4, x2: own.x, y2: own.y });
              WW.Units.hitUnit(sim, { id: -1, kingdomId: -1 }, own, 5);
              if (WW.Wild) WW.Wild.chron(sim, 'trapOops', { city: c.name }, WW.Cities.atCity(c), c.id, WW.CONFIG.TPY * 2);
              continue;
            }
          }
        }
        const fxType = D.fx || 'tracer';
        sim.fx({ type: fxType, x: x, y: y - 0.4, x2: t.x, y2: t.y - 0.3 });
        if (D.area) {
          sim.fx({ type: 'explosion', x: t.x, y: t.y, r: D.area });
          for (const f of deviceTargets(sim, k, c, t.x, t.y, D.area)) devHit(sim, k, f[0], D.dmg);
        } else {
          const eng = t.role === 'ram' || t.role === 'catapult';
          devHit(sim, k, t, D.dmg * (eng && D.engineMul ? D.engineMul : 1));
        }
        s.devShots = (s.devShots || 0) + 1;
      }
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
        if (c) sim.event('randomLightning', { city: c.name }, { kingdomId: c.kingdomId, cityId: c.id, x: x, y: y });
      }
    } else if (r < 0.07 && st.cities.length) {
      const c = st.cities[sim.rng.int(st.cities.length)];
      WW.Powers.strike(sim, c.cx + 0.5, c.cy + 0.5, 'plague', true);
      sim.event('randomPlague', { city: c.name }, WW.Cities.atCity(c));
    }
  }

  // Wildnis-Raster nachrüsten (fehlende Felder dürfen nie werfen, auch ohne wild.js)
  const WILD_RASTERS = ['flora', 'graze', 'fallout', 'crack'];
  function ensureRasters(st) {
    const N = st.W * st.H;
    for (const r of WILD_RASTERS) if (!st[r] || st[r].length !== N) st[r] = new Uint8Array(N);
  }
  function update(sim) {
    const t = sim.state.tick;
    if (!sim.state.crack) ensureRasters(sim.state);
    if (t % 10 === 3) updateFields(sim);
    if (t % 5 === 1) updateFire(sim);
    if (t % 7 === 2) updateTowers(sim);
    if (t % 3 === 1) updateDevices(sim);   // [walls]
    if (t % 40 === 5) updateMarks(sim);
    regrow(sim, 2, false);
    natureSlice(sim);
    if (WW.Wild) WW.Wild.update(sim);
  }
  function yearly(sim) {
    yearlyRuins(sim);
    disasters(sim);
    if (WW.Wild) WW.Wild.yearly(sim);
    // im Jahreswechsel neu Erschaffene (Söldner, Zuwanderer, Kinder) stehen evtl. auf einer inzwischen überfluteten
    // Kachel (z. B. Zentrum nach Krater): sofort auf festen Boden
    const st = sim.state, W = st.W;
    for (const u of st.units) {
      if (u.dead || u.ind || u.seaS) continue;
      const i = Math.floor(u.y) * W + Math.floor(u.x);
      if (i >= 0 && i < st.terrain.length && WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0) WW.Units.rescue(sim, u);
    }
  }

  WW.Env = {
    ensureRasters: ensureRasters, update: update, updateDevices: updateDevices, yearly: yearly, ignite: ignite, igniteForce: igniteForce, extinguish: extinguish, setMark: setMark,
    regrow: regrow, regrowAt: regrowAt, burnable: burnable, coolLava: coolLava, FL_BERRY: FL_BERRY, FL_BUSH: FL_BUSH, FL_ASH: FL_ASH, FL_LAVA: FL_LAVA
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
