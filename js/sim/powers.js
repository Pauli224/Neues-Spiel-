// Gotteskräfte datengetrieben: WW.POWERS[kind] = { key, name, desc, category, radius, duration, brush, dir, aim,
// event, eventWild, apply(sim, x, y, o) }. Daten (Namen, Texte, Radien) in js/core/config-wild.js (WW.WILD.POWER_DEFS).
// Dauerkräfte laufen als Effekte in state.wild.effects, Flugzeuge/Raketen in state.aircraft (WW.Powers.update).
// WW.Powers.strike prüft Eingaben und wirft nie.
(function (WW) { 'use strict';

  const DX4 = [0, 1, 0, -1], DY4 = [-1, 0, 1, 0];
  // 16 feste Richtungen (Tabelle statt sin/cos, bitgenau auf allen Engines)
  const G16 = [1, 0, 0.92388, 0.38268, 0.70711, 0.70711, 0.38268, 0.92388, 0, 1, -0.38268, 0.92388,
    -0.70711, 0.70711, -0.92388, 0.38268, -1, 0, -0.92388, -0.38268, -0.70711, -0.70711, -0.38268, -0.92388,
    0, -1, 0.38268, -0.92388, 0.70711, -0.70711, 0.92388, -0.38268];
  const PI = 3.141592653589793;

  // Ruft fn(i, x, y, d2) für alle Kacheln im Kreis auf
  function forDisc(sim, x, y, r, fn) {
    const st = sim.state, W = st.W, H = st.H;
    const r2 = r * r;
    for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.floor(y + r)); yy++) {
      for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.floor(x + r)); xx++) {
        const dx = xx + 0.5 - x, dy = yy + 0.5 - y, d2 = dx * dx + dy * dy;
        if (d2 <= r2) fn(yy * W + xx, xx, yy, d2);
      }
    }
  }
  function unitsIn(sim, x, y, r, fn) {
    const list = [];
    for (const u of sim.state.units) {
      if (u.dead) continue;
      const dx = u.x - x, dy = u.y - y, d2 = dx * dx + dy * dy;
      if (d2 <= r * r) list.push([u, d2]);
    }
    for (const p of list) if (!p[0].dead) fn(p[0], p[1]);
  }
  function animalsIn(sim, x, y, r, fn) {
    const list = [];
    for (const a of sim.state.animals) {
      if (a.dead) continue;
      const dx = a.x - x, dy = a.y - y, d2 = dx * dx + dy * dy;
      if (d2 <= r * r) list.push([a, d2]);
    }
    for (const p of list) if (!p[0].dead) fn(p[0], p[1]);
  }
  function structsIn(sim, x, y, r) {
    const seen = new Set(), out = [];
    forDisc(sim, x, y, r, (i) => {
      const id = sim.state.structAt[i];
      if (id < 0 || seen.has(id)) return;
      seen.add(id);
      const s = sim._structs.get(id);
      if (s) out.push(s);
    });
    return out;
  }
  function hurt(sim, u, dmg, cause) { if (u.dead) return; u.hp -= dmg; if (!(u.hp > 0)) WW.Units.kill(sim, u, cause); }
  function W_() { return WW.Wild; }
  function cityAtTile(sim, i) { const st = sim.state; return sim._cities.get(st.inRing[i]) || sim._cities.get(st.owner[i]) || null; }
  function clampX(sim, x) { return Math.max(0, Math.min(sim.state.W - 0.01, x)); }
  function clampY(sim, y) { return Math.max(0, Math.min(sim.state.H - 0.01, y)); }

  // Einheit/Tier wegschleudern (nur auf erlaubte Kacheln)
  function fling(sim, e, x0, y0, dist) {
    const st = sim.state, W = st.W;
    let dx = e.x - x0, dy = e.y - y0;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 0.2) { const k = sim.rng.int(16); dx = G16[k * 2]; dy = G16[k * 2 + 1]; } else { dx /= d; dy /= d; }
    const tx = Math.floor(clampX(sim, e.x + dx * dist)), ty = Math.floor(clampY(sim, e.y + dy * dist));
    let t;
    if (e.role !== undefined) t = WW.Path.nearestFree(sim, ty * W + tx, e.kingdomId, 2);
    else { const cr = WW.CREATURES[e.kind]; t = cr ? WW.Creatures.nearestFor(sim, cr, ty * W + tx, 2) : -1; }
    if (t < 0) return false;
    const nx = (t % W) + 0.5, ny = Math.floor(t / W) + 0.5;
    sim.fx({ type: 'fling', x: e.x, y: e.y, x2: nx, y2: ny });
    e.x = nx; e.y = ny;
    if (e.role !== undefined) { e.path = null; e.moving = false; } else e.tx = -1;
    return true;
  }

  // Explosion: Schaden mit Abfall, Bauwerke, Krater (senkt height), Brände, Fallout. o = { depth, fire, fallout, cause, fx }
  function boom(sim, x, y, r, power, o) {
    o = o || {};
    const st = sim.state;
    x = clampX(sim, x); y = clampY(sim, y);
    if (o.fx !== false) sim.fx({ type: 'explosion', x: x, y: y, r: r });
    unitsIn(sim, x, y, r, (u, d2) => hurt(sim, u, power * (1 - 0.6 * Math.sqrt(d2) / r), o.cause || 'bomb'));
    animalsIn(sim, x, y, r, (a, d2) => WW.Creatures.hit(sim, a, power * (1 - 0.6 * Math.sqrt(d2) / r), null));
    for (const s of structsIn(sim, x, y, r)) {
      if (s.dead) continue;
      const dx = s.x + s.w / 2 - x, dy = s.y + s.h / 2 - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < r * 0.45 + 0.3) {
        if (WW.Structs.isWallish(s) || s.type === 'center') { if (s.built) WW.Structs.destroy(sim, s); else s.progress = 0; }
        else if (s.type === 'ruin') WW.Structs.remove(sim, s);
        else WW.Structs.damage(sim, s, power * 4, null);
      } else WW.Structs.damage(sim, s, power * 1.5 * (1 - d / (r + 1)), null);
    }
    let changed = false;
    const rc = r * 0.7;
    forDisc(sim, x, y, r, (i, xx, yy, d2) => {
      const t = st.terrain[i];
      if (WW.TERRAIN_LUT.water[t]) return;
      const d = Math.sqrt(d2);
      if (d <= rc) {
        const nt = WW.Walls.deforested(t);
        if (nt !== t) { st.terrain[i] = nt; sim.markDirty(i); changed = true; }
        if (st.flora[i] === 1 || st.flora[i] === 2) st.flora[i] = 0;
        WW.Env.setMark(sim, i, d < rc * 0.6 ? 190 : 160);
        if (o.depth && W_().setHeight(sim, i, st.height[i] - o.depth * (1 - d / (rc + 0.5)))) changed = true;
      } else if (sim.rng.chance(o.fire == null ? 0.3 : o.fire)) WW.Env.ignite(sim, xx, yy, 12);
    });
    if (o.fallout) forDisc(sim, x, y, r * 1.3, (i, xx, yy, d2) => {
      const v = Math.round(o.fallout * (1 - 0.7 * Math.sqrt(d2) / (r * 1.3)));
      if (v > st.fallout[i]) { st.fallout[i] = v; sim.markDirty(i); }
    });
    if (changed) W_().finishTerrain(sim);
    else sim.terrainChanged();
  }

  // Atombombe (big = Großer Rumms)
  function nuke(sim, x, y, big) {
    const st = sim.state;
    const core = big ? 10 : 5, outer = big ? 20 : 10, depth = big ? 75 : 30;
    sim.fx({ type: 'flash', x: x, y: y, r: outer * 1.5 });
    sim.fx({ type: 'shockwave', x: x, y: y, r: outer * 1.4 });
    sim.fx({ type: 'mushroom', x: x, y: y, big: !!big });
    unitsIn(sim, x, y, outer, (u, d2) => {
      const d = Math.sqrt(d2);
      if (d < core) { WW.Units.kill(sim, u, 'nuke'); return; }
      hurt(sim, u, 90 * (1 - d / outer) + 10, 'nuke');
      if (!u.dead) fling(sim, u, x, y, 2 + 3 * (1 - d / outer));
    });
    animalsIn(sim, x, y, outer, (a, d2) => {
      const d = Math.sqrt(d2);
      if (d < core) { a.noSplit = true; WW.Creatures.kill(sim, a, null); return; }
      WW.Creatures.hit(sim, a, 90 * (1 - d / outer) + 10, null);
      if (!a.dead && !WW.CREATURES[a.kind].flying) fling(sim, a, x, y, 2);
    });
    for (const s of structsIn(sim, x, y, outer)) {
      if (s.dead) continue;
      const dx = s.x + s.w / 2 - x, dy = s.y + s.h / 2 - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < core) {
        if (WW.Structs.isWallish(s) || s.type === 'center') { if (s.built) WW.Structs.destroy(sim, s); s.progress = 0; }
        else if (s.type === 'ruin' || s.type === 'lair' || s.type === 'field') WW.Structs.remove(sim, s);
        else WW.Structs.damage(sim, s, 99999, null);
      } else WW.Structs.damage(sim, s, 420 * (1 - d / outer) + 20, null);
    }
    forDisc(sim, x, y, outer, (i, xx, yy, d2) => {
      const d = Math.sqrt(d2), t = st.terrain[i];
      if (d <= core * 1.1) {
        if (!WW.TERRAIN_LUT.water[t]) {
          W_().setHeight(sim, i, st.height[i] - depth * (1 - d / (core * 1.1 + 0.5)));
          const t2 = st.terrain[i];
          if (WW.TERRAIN_LUT.rank[t2] === 4 && t2 !== WW.T.RIVER) W_().setTerrain(sim, i, WW.T.ASH);
          if (!WW.TERRAIN_LUT.water[st.terrain[i]]) WW.Env.setMark(sim, i, 190);
        }
      } else if (!WW.TERRAIN_LUT.water[t]) {
        if (WW.TERRAIN_LUT.wood[t] && d < outer * 0.75 && sim.rng.chance(0.5)) { st.terrain[i] = WW.Walls.deforested(t); sim.markDirty(i); }
        if (sim.rng.chance(0.3)) WW.Env.ignite(sim, xx, yy, 14);
      }
      const v = Math.round(255 * (1 - 0.75 * d / outer));
      if (v > st.fallout[i]) { st.fallout[i] = v; sim.markDirty(i); }
      st.graze[i] = st.flora[i] === 3 || st.flora[i] === 5 ? st.graze[i] : 0;
      if (st.flora[i] === 1 || st.flora[i] === 2) st.flora[i] = 0;
    });
    W_().finishTerrain(sim);
  }

  // ---------------------------------------------------------------------------
  // Dauer-Effekte
  // ---------------------------------------------------------------------------
  function addEffect(sim, e) {
    const st = sim.state, E = st.wild.effects;
    const max = WW.WILD.CFG.MAX_EFFECTS;
    while (E.length >= max) { const old = E.shift(); endEffect(sim, old); }
    e.id = st.nextId++;
    E.push(e);
    return e;
  }
  function restoreSaved(sim, e, test) {
    const st = sim.state;
    const keep = [];
    let ch = false;
    for (let k = 0; k < e.saved.length; k += 2) {
      const i = e.saved[k], t = e.saved[k + 1];
      if (test && !test(i)) { keep.push(i, t); continue; }
      if (st.terrain[i] === e.into && st.structAt[i] === -1) { st.terrain[i] = t; sim.markDirty(i); ch = true; }
    }
    e.saved = keep;
    if (ch) sim.terrainChanged();
  }
  function endEffect(sim, e) {
    if (e.type === 'flood' || e.type === 'frost') restoreSaved(sim, e, null);
    else if (e.type === 'blackhole') { sim.fx({ type: 'bang', x: e.x, y: e.y, r: 3 }); boom(sim, e.x, e.y, 3, 60, { depth: 10, fx: false }); }
    else if (e.type === 'volcano') {
      const st = sim.state;
      if (e.i >= 0 && st.terrain[e.i] === WW.T.LAVA) { st.flora[e.i] = 5; st.graze[e.i] = 0; }
    }
  }

  const EFFECTS = {
    tornado: function (sim, e) {
      const st = sim.state;
      e.vx = Math.max(-0.09, Math.min(0.09, e.vx + sim.rng.range(-0.012, 0.012)));
      e.vy = Math.max(-0.09, Math.min(0.09, e.vy + sim.rng.range(-0.012, 0.012)));
      e.x += e.vx; e.y += e.vy;
      if (e.x < 1 || e.x > st.W - 1) { e.vx = -e.vx; e.x = clampX(sim, e.x); }
      if (e.y < 1 || e.y > st.H - 1) { e.vy = -e.vy; e.y = clampY(sim, e.y); }
      if (e.t % 3 !== 0) return;
      let n = 0;
      unitsIn(sim, e.x, e.y, 1.6, (u) => { if (n++ < 5 && fling(sim, u, e.x, e.y, 2 + sim.rng.int(3))) { hurt(sim, u, 6, 'tornado'); if (!u.dead) WW.Units.bubble(u, 'exclaim', 30); } });
      animalsIn(sim, e.x, e.y, 1.6, (a) => { const cr = WW.CREATURES[a.kind]; if (cr && !cr.flying && !cr.aquatic && !a.buried && n++ < 8) { fling(sim, a, e.x, e.y, 2 + sim.rng.int(3)); WW.Creatures.hit(sim, a, 4, null); } });
      for (const s of structsIn(sim, e.x, e.y, 1.2)) {
        if (s.dead) continue;
        if (s.type === 'house' || s.type === 'market' || s.type === 'barracks' || s.type === 'lumber' || s.type === 'quarry') {
          if (sim.rng.chance(0.5)) { sim.fx({ type: 'roof', x: s.x + s.w / 2, y: s.y }); WW.Structs.damage(sim, s, s.maxHp * 0.2, null); }
        } else if (s.type === 'field') { if (s.growth) { s.growth = 0; s.gprog = 0; sim.markDirty(s.y * st.W + s.x); } }
        else if (WW.Structs.isWallish(s) && s.level <= 1 && s.built) WW.Structs.damage(sim, s, 40, 'hit');
      }
      forDisc(sim, e.x, e.y, 1.2, (i) => {
        const t = st.terrain[i];
        if (WW.TERRAIN_LUT.wood[t] && st.structAt[i] === -1 && sim.rng.chance(0.15)) { st.terrain[i] = WW.Walls.deforested(t); sim.markDirty(i); }
      });
    },
    acidrain: function (sim, e) {
      const st = sim.state;
      if (e.t % 10 !== 0) return;
      sim.fx({ type: 'acidrain', x: e.x, y: e.y, r: e.r });
      unitsIn(sim, e.x, e.y, e.r, (u) => { hurt(sim, u, 2, 'acid'); if (!u.dead && sim.rng.chance(0.08)) u.sick = true; });
      animalsIn(sim, e.x, e.y, e.r, (a) => WW.Creatures.hit(sim, a, 2, null));
      forDisc(sim, e.x, e.y, e.r, (i) => {
        const t = st.terrain[i];
        if (WW.TERRAIN_LUT.wood[t] && st.structAt[i] === -1 && sim.rng.chance(0.04)) { st.terrain[i] = WW.Walls.deforested(t); sim.markDirty(i); }
        else if (t === WW.T.FLOWERS && sim.rng.chance(0.1)) { st.terrain[i] = WW.T.GRASS; sim.markDirty(i); }
        if (st.flora[i] === 1 && sim.rng.chance(0.2)) { st.flora[i] = 2; sim.markDirty(i); }
      });
      for (const s of structsIn(sim, e.x, e.y, e.r)) {
        if (s.dead) continue;
        if (s.type === 'field') { if (s.growth > 0 && sim.rng.chance(0.3)) { s.growth--; sim.markDirty(s.y * st.W + s.x); } }
        else if (!(WW.Structs.isWallish(s) && s.level >= 2) && s.type !== 'lair' && s.type !== 'ruin' && s.built) WW.Structs.damage(sim, s, 3, null);
      }
    },
    flood: function (sim, e) {
      const st = sim.state, W = st.W, H = st.H;
      if (e.t % 5 !== 0) return;
      const total = e.total, el = total - e.t;
      const top = 24;
      e.level = el < 80 ? top * el / 80 : (e.t < 120 ? top * e.t / 120 : top);
      const lim = e.base + e.level;
      if (e.t % 30 === 0) sim.fx({ type: 'flood', x: e.x, y: e.y, r: e.r });
      if (e.t < 120) { restoreSaved(sim, e, (i) => st.height[i] > lim); return; }
      const add = [];
      forDisc(sim, e.x, e.y, e.r, (i, xx, yy) => {
        const t = st.terrain[i];
        if (WW.TERRAIN_LUT.water[t] || t === WW.T.LAVA || st.height[i] > lim) return;
        const s = sim._structs.get(st.structAt[i]);
        if (s) { if (s.type === 'field' && s.growth) { s.growth = 0; s.gprog = 0; sim.markDirty(i); } return; }
        let wet = false;
        for (let d = 0; d < 4 && !wet; d++) {
          const nx = xx + DX4[d], ny = yy + DY4[d];
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && WW.TERRAIN_LUT.water[st.terrain[ny * W + nx]]) wet = true;
        }
        if (wet) add.push(i);
      });
      for (const i of add) {
        e.saved.push(i, st.terrain[i]);
        st.terrain[i] = WW.T.SHALLOW; sim.markDirty(i);
        WW.Env.extinguish(sim, i);
      }
      if (add.length) sim.terrainChanged();
    },
    frost: function () {},
    volcano: function (sim, e) {
      const st = sim.state, W = st.W, H = st.H;
      if (e.t > 20 && e.t % 8 === 0 && e.heads.length < 6) { e.heads.push([e.i, 8 + sim.rng.int(10)]); sim.fx({ type: 'eruption', x: e.x, y: e.y }); }
      if (e.t % 3 !== 0 || !e.heads.length) return;
      let ch = false;
      const keep = [];
      for (const h of e.heads) {
        const i = h[0], x = i % W, y = (i - x) / W;
        let best = -1, bh = st.height[i] + 3;
        for (let d = 0; d < 8; d++) {
          const nx = x + WW.Path.DX[d], ny = y + WW.Path.DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx, t = st.terrain[n];
          if (t === WW.T.LAVA) continue;
          const hh = st.height[n] + sim.rng.next() * 2;
          if (hh < bh) { bh = hh; best = n; }
        }
        if (best < 0) continue;
        if (WW.TERRAIN_LUT.water[st.terrain[best]]) { sim.fx({ type: 'steam', x: (best % W) + 0.5, y: Math.floor(best / W) + 0.5 }); continue; }
        W_().setTerrain(sim, best, WW.T.LAVA);
        st.flora[best] = 5; st.graze[best] = sim.rng.int(60);
        ch = true;
        if (sim.rng.chance(0.3)) sim.fx({ type: 'lava', x: (best % W) + 0.5, y: Math.floor(best / W) + 0.5 });
        if (h[1] > 1) keep.push([best, h[1] - 1]);
      }
      e.heads = keep;
      if (ch) W_().finishTerrain(sim);
    },
    blackhole: function (sim, e) {
      const st = sim.state;
      const pull = (o, isUnit) => {
        const dx = e.x - o.x, dy = e.y - o.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.8) {
          if (isUnit) WW.Units.kill(sim, o, 'blackhole'); else { o.noSplit = true; WW.Creatures.kill(sim, o, null); }
          return;
        }
        const s = Math.min(d, 0.06 + 0.18 * (1 - d / e.r));
        const nx = o.x + dx / d * s, ny = o.y + dy / d * s;
        const i = Math.floor(ny) * st.W + Math.floor(nx);
        const ok = isUnit ? WW.Path.passable(sim, i, o.kingdomId) : WW.Creatures.canEnter(sim, WW.CREATURES[o.kind], i);
        if (ok) { o.x = nx; o.y = ny; if (isUnit) o.path = null; else o.tx = -1; }
      };
      unitsIn(sim, e.x, e.y, e.r, (u) => pull(u, true));
      animalsIn(sim, e.x, e.y, e.r, (a) => pull(a, false));
      if (e.t % 8 === 0) {
        const ss = structsIn(sim, e.x, e.y, 3.5).filter((s) => !s.dead && s.type !== 'center');
        if (ss.length) {
          const s = ss[sim.rng.int(ss.length)];
          sim.fx({ type: 'debris', x: s.x + s.w / 2, y: s.y + s.h / 2, x2: e.x, y2: e.y });
          WW.Structs.damage(sim, s, 30, null);
        }
      }
    },
    cluster: function (sim, e) {
      if (e.t % 2 !== 0 || !e.pts.length) return;
      const p = e.pts.shift();
      boom(sim, p[0], p[1], 1.4, 38, { depth: 1, fire: 0.2 });
    }
  };

  // ---------------------------------------------------------------------------
  // Flugzeuge und Raketen (state.aircraft)
  // ---------------------------------------------------------------------------
  function addAircraft(sim, p) {
    const st = sim.state;
    if (st.aircraft.length >= WW.WILD.CFG.MAX_AIRCRAFT) return null;
    p.id = st.nextId++;
    st.aircraft.push(p);
    return p;
  }
  const PLANES = {
    rocket: function (sim, p) {
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy);
      const sp = 0.9;
      if (d <= sp) { p.x = p.tx; p.y = p.ty; boom(sim, p.tx, p.ty, 3, 120, { depth: 6 }); p.ttl = 0; return; }
      p.x += dx / d * sp; p.y += dy / d * sp;
    },
    bomber: function (sim, p) {
      const st = sim.state;
      p.x += p.vx; p.y += p.vy;
      const along = (p.x - p.tx) * p.dx + (p.y - p.ty) * p.dy;
      if (along >= -9 && along <= 9 && along - p.last >= 2.2) {
        p.last = along;
        if (p.x >= 0 && p.y >= 0 && p.x < st.W && p.y < st.H) {
          sim.fx({ type: 'bombfall', x: p.x, y: p.y });
          boom(sim, p.x, p.y, 1.9, 60, { depth: 2, fire: 0.25 });
        }
      }
      if (p.x < -8 || p.y < -8 || p.x > st.W + 8 || p.y > st.H + 8) p.ttl = 0;
    },
    gunship: function (sim, p) {
      const st = sim.state;
      p.k = (p.k + 0.07) % 16;
      const k0 = Math.floor(p.k), k1 = (k0 + 1) % 16, f = p.k - k0;
      const cx = G16[k0 * 2] * (1 - f) + G16[k1 * 2] * f, cy = G16[k0 * 2 + 1] * (1 - f) + G16[k1 * 2 + 1] * f;
      p.x = p.tx + cx * 9; p.y = p.ty + cy * 6;
      p.angle = p.k * PI / 8 + PI / 2;
      if (p.ttl % 4 === 0) {
        // Salve: zufälliges Ziel im Umkreis
        const cand = [];
        WW.Units.forNear(sim, p.tx, p.ty, 6, false, (u) => { cand.push(u); });
        WW.Units.forNear(sim, p.tx, p.ty, 6, true, (a) => { if (!a.buried) cand.push(a); });
        let gx, gy;
        if (cand.length) {
          const t = cand[sim.rng.int(cand.length)];
          gx = t.x; gy = t.y;
          if (t.role !== undefined) hurt(sim, t, 9, 'gunship'); else WW.Creatures.hit(sim, t, 9, null);
        } else { gx = clampX(sim, p.tx + sim.rng.range(-5, 5)); gy = clampY(sim, p.ty + sim.rng.range(-5, 5)); if (sim.rng.chance(0.15)) WW.Env.ignite(sim, Math.floor(gx), Math.floor(gy), 10); }
        sim.fx({ type: 'tracer', x: p.x, y: p.y, x2: gx, y2: gy });
      }
      if (p.ttl % 24 === 12) {
        const ss = structsIn(sim, clampX(sim, p.tx), clampY(sim, p.ty), 6).filter((s) => !s.dead && s.type !== 'ruin');
        let gx = clampX(sim, p.tx + sim.rng.range(-4, 4)), gy = clampY(sim, p.ty + sim.rng.range(-4, 4));
        if (ss.length) { const s = ss[sim.rng.int(ss.length)]; gx = s.x + s.w / 2; gy = s.y + s.h / 2; WW.Structs.damage(sim, s, 150, null); }
        sim.fx({ type: 'tracer', x: p.x, y: p.y, x2: gx, y2: gy, heavy: true });
        boom(sim, gx, gy, 1.4, 30, { depth: 1, fire: 0.2 });
      }
      if (p.ttl <= 1) { p.x = p.tx; p.y = p.ty; }
    }
  };

  function update(sim) {
    const st = sim.state;
    const E = st.wild.effects;
    if (E.length) {
      let any = false;
      for (const e of E.slice()) {
        const fn = EFFECTS[e.type];
        if (fn) fn(sim, e);
        e.t--;
        if (!(e.t > 0) || !fn) { endEffect(sim, e); e.done = true; any = true; }
      }
      if (any) st.wild.effects = st.wild.effects.filter((e) => !e.done);
    }
    const A = st.aircraft;
    if (A.length) {
      for (const p of A) { const fn = PLANES[p.kind]; if (fn && p.ttl > 0) fn(sim, p); p.ttl--; }
      if (A.some((p) => !(p.ttl > 0))) st.aircraft = A.filter((p) => p.ttl > 0);
    }
  }

  // ---------------------------------------------------------------------------
  // Kräfte
  // ---------------------------------------------------------------------------
  const APPLY = {
    lightning: function (sim, x, y) {
      sim.fx({ type: 'bolt', x: x, y: y });
      unitsIn(sim, x, y, 1.6, (u) => hurt(sim, u, 45, 'lightning'));
      animalsIn(sim, x, y, 1.6, (a) => WW.Creatures.hit(sim, a, 45, null));
      for (const s of structsIn(sim, x, y, 1.2)) if (s.type !== 'ruin' && !s.dead) WW.Structs.damage(sim, s, 70, 'spark');
      WW.Env.ignite(sim, Math.floor(x), Math.floor(y), 16);
    },
    fire: function (sim, x, y) {
      forDisc(sim, x, y, 1.6, (i, xx, yy) => WW.Env.ignite(sim, xx, yy, 18));
      sim.fx({ type: 'smoke', x: x, y: y });
    },
    rain: function (sim, x, y) {
      const st = sim.state;
      sim.fx({ type: 'rain', x: x, y: y, r: 5 });
      forDisc(sim, x, y, 5, (i) => { WW.Env.extinguish(sim, i); });
      WW.Env.regrowAt(sim, x, y, 5, 0.35);
      for (const s of structsIn(sim, x, y, 5)) {
        if (s.type === 'field' && s.growth < 3) { s.growth++; s.gprog = 0; sim.markDirty(s.y * st.W + s.x); }
      }
    },
    meteor: function (sim, x, y) {
      const st = sim.state;
      sim.fx({ type: 'meteor', x: x, y: y });
      unitsIn(sim, x, y, 3, (u) => hurt(sim, u, 80, 'meteor'));
      animalsIn(sim, x, y, 3, (a) => WW.Creatures.hit(sim, a, 80, null));
      for (const s of structsIn(sim, x, y, 2.6)) {
        if (s.dead) continue;
        if (WW.Structs.isWallish(s) || s.type === 'center') { if (s.built) WW.Structs.destroy(sim, s); else s.progress = 0; }
        else WW.Structs.damage(sim, s, 9999, null);
      }
      forDisc(sim, x, y, 2.6, (i, xx, yy, d2) => {
        const t = st.terrain[i];
        if (WW.TERRAIN_LUT.water[t]) return;
        const nt = WW.Walls.deforested(t);
        if (nt !== t) st.terrain[i] = nt;
        WW.Env.setMark(sim, i, d2 < 2.5 ? 190 : 150);
        if (d2 < 2.5) W_().setHeight(sim, i, st.height[i] - 6);
        if (d2 > 2 && sim.rng.chance(0.4)) WW.Env.ignite(sim, xx, yy, 12);
      });
      W_().finishTerrain(sim);
    },
    plague: function (sim, x, y) {
      sim.fx({ type: 'plague', x: x, y: y, r: 4 });
      unitsIn(sim, x, y, 4, (u) => { if (sim.rng.chance(0.8)) u.sick = true; });
    },
    bless: function (sim, x, y) {
      const st = sim.state;
      sim.fx({ type: 'sparkle', x: x, y: y, r: 5 });
      unitsIn(sim, x, y, 5, (u) => { u.hp = u.maxHp; u.sick = false; WW.Units.bubble(u, 'heart', 40); });
      for (const s of structsIn(sim, x, y, 5)) {
        if (s.type === 'field') { s.growth = 3; s.gprog = 0; sim.markDirty(s.y * st.W + s.x); }
      }
      const seen = new Set();
      forDisc(sim, x, y, 5, (i) => {
        const cid = st.owner[i];
        if (cid < 0 || seen.has(cid)) return;
        seen.add(cid);
        const c = sim._cities.get(cid);
        if (c) { c.blessUntil = st.tick + WW.CONFIG.TPY * 2; c.happiness = Math.min(100, c.happiness + 15); }
      });
    },

    raise: function (sim, x, y) { shape(sim, x, y, 3, 14); sim.fx({ type: 'raise', x: x, y: y, r: 3 }); },
    lower: function (sim, x, y) { shape(sim, x, y, 3, -14); sim.fx({ type: 'lower', x: x, y: y, r: 3 }); },
    seeds: function (sim, x, y) {
      const st = sim.state, T = WW.T;
      sim.fx({ type: 'seeds', x: x, y: y, r: 3 });
      forDisc(sim, x, y, 3, (i, xx, yy) => {
        if (st.structAt[i] !== -1 || st.inRing[i] !== -1 || st.fallout[i] || st.fire[i]) return;
        const t = st.terrain[i], r = sim.rng.next();
        if (r < 0.35) W_().plantTree(sim, xx, yy);
        else if (r < 0.6 && t === T.GRASS) { st.terrain[i] = T.FLOWERS; sim.markDirty(i); }
        else if (r < 0.7 && (t === T.GRASS || t === T.FOREST || t === T.FLOWERS) && !st.flora[i]) { st.flora[i] = 1; sim.markDirty(i); }
      });
    },

    earthquake: function (sim, x, y, o) {
      const st = sim.state;
      let dx, dy;
      if (o && WW.SimUtil.isNum(o.dx) && WW.SimUtil.isNum(o.dy) && (o.dx || o.dy)) { const l = Math.sqrt(o.dx * o.dx + o.dy * o.dy); dx = o.dx / l; dy = o.dy / l; }
      else { const k = sim.rng.int(16); dx = G16[k * 2]; dy = G16[k * 2 + 1]; }
      const L = 18;
      sim.fx({ type: 'quake', x: x - dx * L / 2, y: y - dy * L / 2, x2: x + dx * L / 2, y2: y + dy * L / 2 });
      const hitS = new Set(), hitU = new Set();
      for (let s = -L / 2; s <= L / 2; s += 0.5) {
        const wob = sim.rng.range(-0.6, 0.6);
        const px = x + dx * s - dy * wob, py = y + dy * s + dx * wob;
        if (px < 0 || py < 0 || px >= st.W || py >= st.H) continue;
        const i = Math.floor(py) * st.W + Math.floor(px);
        if (!WW.TERRAIN_LUT.water[st.terrain[i]]) { st.crack[i] = 230; sim.markDirty(i); }
        for (const b of structsIn(sim, px, py, 1.1)) {
          if (hitS.has(b.id) || b.dead) continue;
          hitS.add(b.id);
          if (b.type === 'field') { b.growth = 0; b.gprog = 0; sim.markDirty(b.y * st.W + b.x); }
          else if (b.type !== 'ruin') WW.Structs.damage(sim, b, WW.Structs.isWallish(b) ? 260 : 140, 'hit');
        }
        WW.Units.forNear(sim, px, py, 1.2, false, (u) => { if (hitU.has(u.id)) return; hitU.add(u.id); hurt(sim, u, 8, 'quake'); if (!u.dead) WW.Units.bubble(u, 'exclaim', 30); });
      }
    },
    volcano: function (sim, x, y) {
      const st = sim.state;
      const cx = Math.floor(x), cy = Math.floor(y), ci = cy * st.W + cx;
      forDisc(sim, x, y, 3.6, (i, xx, yy, d2) => {
        const d = Math.sqrt(d2);
        const h = 222 - d * 16;
        if (st.height[i] < h) W_().setHeight(sim, i, h);
      });
      W_().setTerrain(sim, ci, WW.T.LAVA);
      st.flora[ci] = 0;
      W_().finishTerrain(sim);
      sim.fx({ type: 'eruption', x: cx + 0.5, y: cy + 0.5 });
      addEffect(sim, { type: 'volcano', x: cx + 0.5, y: cy + 0.5, r: 4, t: 160, i: ci, heads: [] });
    },
    tornado: function (sim, x, y) {
      const k = sim.rng.int(16);
      addEffect(sim, { type: 'tornado', x: x, y: y, r: 1.6, t: 200, vx: G16[k * 2] * 0.06, vy: G16[k * 2 + 1] * 0.06 });
    },
    acidrain: function (sim, x, y) { addEffect(sim, { type: 'acidrain', x: x, y: y, r: 5, t: 150 }); sim.fx({ type: 'acidrain', x: x, y: y, r: 5 }); },
    flood: function (sim, x, y) {
      const st = sim.state;
      let base = 255;
      forDisc(sim, x, y, 7, (i) => { if (!WW.TERRAIN_LUT.water[st.terrain[i]] && st.height[i] < base) base = st.height[i]; });
      if (base === 255) base = st.height[Math.floor(y) * st.W + Math.floor(x)];
      addEffect(sim, { type: 'flood', x: x, y: y, r: 7, t: 380, total: 380, base: base, level: 0, saved: [], into: WW.T.SHALLOW });
      sim.fx({ type: 'flood', x: x, y: y, r: 7 });
    },
    frost: function (sim, x, y) {
      const st = sim.state, T = WW.T;
      const e = addEffect(sim, { type: 'frost', x: x, y: y, r: 5, t: 480, saved: [], into: T.SNOWFIELD });
      sim.fx({ type: 'frost', x: x, y: y, r: 5 });
      forDisc(sim, x, y, 5, (i) => {
        const t = st.terrain[i];
        WW.Env.extinguish(sim, i);
        const s = sim._structs.get(st.structAt[i]);
        if (s && s.type === 'field') { s.growth = 0; s.gprog = 0; sim.markDirty(i); }
        if (t === T.SNOWFIELD || t === T.DEEP || t === T.LAVA || WW.TERRAIN_LUT.rank[t] >= 5) return;
        if (s) return;
        e.saved.push(i, t);
        st.terrain[i] = T.SNOWFIELD; sim.markDirty(i);
        if (st.flora[i] === 1 || st.flora[i] === 2) st.flora[i] = 0;
      });
      unitsIn(sim, x, y, 5, (u) => WW.Units.bubble(u, 'question', 30));
      W_().finishTerrain(sim);
    },
    drought: function (sim, x, y) {
      const st = sim.state, T = WW.T;
      sim.fx({ type: 'drought', x: x, y: y, r: 6 });
      forDisc(sim, x, y, 6, (i) => {
        const t = st.terrain[i], s = sim._structs.get(st.structAt[i]);
        if (s && s.type === 'field') { s.growth = 0; s.gprog = 0; sim.markDirty(i); }
        const r = sim.rng.next();
        let nt = t;
        if ((t === T.GRASS || t === T.FLOWERS) && r < 0.6) nt = T.SAVANNA;
        else if (t === T.SAVANNA && r < 0.4) nt = T.DESERT;
        else if (t === T.SWAMP && r < 0.5) nt = T.GRASS;
        else if ((t === T.FOREST || t === T.JUNGLE) && r < 0.15) nt = T.SAVANNA;
        if (nt !== t) { if (s && s.type !== 'field') return; W_().setTerrain(sim, i, nt); }
        if (st.flora[i] === 1) st.flora[i] = 2;
      });
      W_().finishTerrain(sim);
    },
    breeze: function (sim, x, y) {
      const st = sim.state;
      sim.fx({ type: 'breeze', x: x, y: y, r: 7 });
      forDisc(sim, x, y, 7, (i) => { WW.Env.extinguish(sim, i); if (st.fallout[i]) { st.fallout[i] = Math.floor(st.fallout[i] * 0.6); sim.markDirty(i); } });
      unitsIn(sim, x, y, 7, (u) => { u.sick = false; });
      animalsIn(sim, x, y, 7, (a) => { if (a.kind === 'ghost') WW.Creatures.hit(sim, a, 90, null); });
      for (const e of st.wild.effects) {
        if (e.type !== 'acidrain') continue;
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy < 144) e.t = 1;
      }
    },

    bomb: function (sim, x, y) { boom(sim, x, y, 2.5, 70, { depth: 4 }); },
    clusterbomb: function (sim, x, y) {
      const pts = [];
      for (let k = 0; k < 12; k++) pts.push([clampX(sim, x + sim.rng.range(-5, 5)), clampY(sim, y + sim.rng.range(-5, 5))]);
      sim.fx({ type: 'bombfall', x: x, y: y });
      addEffect(sim, { type: 'cluster', x: x, y: y, r: 6, t: 26, pts: pts });
    },
    napalm: function (sim, x, y) {
      const st = sim.state;
      sim.fx({ type: 'napalm', x: x, y: y, r: 3.5 });
      forDisc(sim, x, y, 3.5, (i) => {
        if (!sim.rng.chance(0.85)) return;
        if (WW.Env.igniteForce(sim, i, 40 + sim.rng.int(16)) && !WW.TERRAIN_LUT.burn[st.terrain[i]]) WW.Env.setMark(sim, i, 70);
      });
    },
    rocket: function (sim, x, y) {
      const st = sim.state;
      const sx = x < st.W / 2 ? -3 : st.W + 3, sy = Math.max(-3, Math.min(st.H + 3, y - 14));
      addAircraft(sim, { kind: 'rocket', x: sx, y: sy, tx: x, ty: y, angle: Math.atan2(y - sy, x - sx), ttl: 200 });
    },
    bomber: function (sim, x, y, o) {
      const st = sim.state;
      let dx = 1, dy = 0;
      if (o && WW.SimUtil.isNum(o.dx) && WW.SimUtil.isNum(o.dy) && (o.dx || o.dy)) { const l = Math.sqrt(o.dx * o.dx + o.dy * o.dy); dx = o.dx / l; dy = o.dy / l; }
      // Start am Kartenrand entlang der Linie durch das Ziel
      const back = Math.max(st.W, st.H) + 10;
      let sx = x - dx * back, sy = y - dy * back;
      // auf den Rand ziehen
      for (let n = 0; n < 400 && (sx < -6 || sy < -6 || sx > st.W + 6 || sy > st.H + 6); n++) { sx += dx; sy += dy; }
      addAircraft(sim, { kind: 'bomber', x: sx, y: sy, tx: x, ty: y, dx: dx, dy: dy, vx: dx * 0.45, vy: dy * 0.45, angle: Math.atan2(dy, dx), last: -99, ttl: 1200 });
    },
    gunship: function (sim, x, y) {
      addAircraft(sim, { kind: 'gunship', x: x + 9, y: y, tx: x, ty: y, angle: PI / 2, k: 0, ttl: 120 });
    },
    nuke: function (sim, x, y) { nuke(sim, x, y, false); },
    tsar: function (sim, x, y) { nuke(sim, x, y, true); },
    orbitallaser: function (sim, x, y) {
      const st = sim.state, T = WW.T;
      sim.fx({ type: 'laser', x: x, y: y });
      let ch = false;
      forDisc(sim, x, y, 1.2, (i, xx, yy, d2) => {
        const t = st.terrain[i];
        if (WW.TERRAIN_LUT.water[t]) { if (sim.rng.chance(0.3)) sim.fx({ type: 'steam', x: xx + 0.5, y: yy + 0.5 }); return; }
        if (t === T.SNOWFIELD) { st.terrain[i] = T.TUNDRA; sim.markDirty(i); ch = true; }
        else if (WW.TERRAIN_LUT.wood[t]) { st.terrain[i] = T.ASH; st.flora[i] = 3; st.graze[i] = 1; sim.markDirty(i); }
        WW.Env.igniteForce(sim, i, 25);
        WW.Env.setMark(sim, i, 85);
        if (d2 < 0.6 && W_().setHeight(sim, i, st.height[i] - 2)) ch = true;
      });
      unitsIn(sim, x, y, 1.3, (u) => hurt(sim, u, 40, 'laser'));
      animalsIn(sim, x, y, 1.3, (a) => WW.Creatures.hit(sim, a, 40, null));
      for (const s of structsIn(sim, x, y, 1)) if (!s.dead) WW.Structs.damage(sim, s, 90, null);
      if (ch) W_().finishTerrain(sim);
    },
    blackhole: function (sim, x, y) { addEffect(sim, { type: 'blackhole', x: x, y: y, r: 8, t: 80 }); },

    madness: function (sim, x, y) {
      const st = sim.state;
      let best = null, bd = 2.5 * 2.5;
      for (const u of st.units) { if (u.dead) continue; const dx = u.x - x, dy = u.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = u; } }
      if (best) { W_().makeMad(sim, best, WW.POWERS.madness.duration); sim.fx({ type: 'scare', x: best.x, y: best.y }); sim._lastMad = best; return; }
      for (const a of st.animals) { if (a.dead) continue; const dx = a.x - x, dy = a.y - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = a; } }
      if (best) { best.mad = st.tick + WW.POWERS.madness.duration; best.foe = -1; sim.fx({ type: 'scare', x: best.x, y: best.y }); }
    },
    love: function (sim, x, y) {
      const st = sim.state, W = st.W;
      sim.fx({ type: 'hearts', x: x, y: y, r: 5 });
      const seen = new Set();
      forDisc(sim, x, y, 5, (i) => { const c = cityAtTile(sim, i); if (c) seen.add(c.id); });
      for (const id of seen) {
        const c = sim._cities.get(id);
        if (!c) continue;
        const n = Math.max(1, Math.min(6, Math.round((c.adults || 0) * 0.3)));
        for (let k = 0; k < n; k++) {
          const t = WW.Path.nearestFree(sim, WW.Cities.centerTile(sim, c, k + st.tick), c.kingdomId, 4);
          if (t < 0) break;
          WW.Units.create(sim, { x: (t % W) + 0.5, y: Math.floor(t / W) + 0.5, role: 'child', age: 0, kingdomId: c.kingdomId, cityId: c.id, race: c.race });
        }
        c.happiness = Math.min(100, c.happiness + 8);
      }
      unitsIn(sim, x, y, 5, (u) => WW.Units.bubble(u, 'heart', 50));
      let m = 0;
      animalsIn(sim, x, y, 5, (a) => {
        const cr = WW.CREATURES[a.kind];
        if (!cr || cr.category !== 'animal' || m >= 10) return;
        if (WW.Creatures.spawn(sim, a.kind, a.x, a.y, { home: a.home, food: 70 })) m++;
      });
    },
    goldrain: function (sim, x, y) {
      const seen = new Set();
      sim.fx({ type: 'goldrain', x: x, y: y, r: 4 });
      forDisc(sim, x, y, 4, (i) => { const c = cityAtTile(sim, i); if (c && !seen.has(c.id)) { seen.add(c.id); WW.Cities.addStock(sim, c, 'gold', 45); } });
      unitsIn(sim, x, y, 4, (u) => WW.Units.bubble(u, 'note', 40));
    },
    heal: function (sim, x, y) {
      const st = sim.state;
      sim.fx({ type: 'heal', x: x, y: y, r: 5 });
      unitsIn(sim, x, y, 5, (u) => { u.hp = u.maxHp; u.sick = false; if (u.wMad > st.tick) u.wMad = st.tick; });
      animalsIn(sim, x, y, 5, (a) => {
        const cr = WW.CREATURES[a.kind];
        if (cr && cr.undead) { WW.Creatures.hit(sim, a, 150, null); return; }
        a.hp = a.maxHp; a.mad = 0;
      });
      for (const s of structsIn(sim, x, y, 5)) if (s.built && !s.dead && s.type !== 'ruin') s.hp = s.maxHp;
      forDisc(sim, x, y, 5, (i) => { if (st.fallout[i]) { st.fallout[i] = st.fallout[i] >> 1; sim.markDirty(i); } });
    },

    wrecker: function (sim, x, y) {
      const st = sim.state;
      const s = sim._structs.get(st.structAt[Math.floor(y) * st.W + Math.floor(x)]);
      if (!s || s.dead) return false;
      sim.fx({ type: 'wreck', x: s.x + s.w / 2, y: s.y + s.h / 2 });
      sim._lastWreck = s;
      if (s.type === 'center') { if (s.built) WW.Structs.destroy(sim, s); }
      else if (WW.Structs.isWallish(s) || s.type === 'lair' || s.type === 'ruin' || s.type === 'field') WW.Structs.remove(sim, s);
      else WW.Structs.destroy(sim, s);
      WW.Cities.refreshAllLists(sim);
      return true;
    },
    wallbrush: function (sim, x, y) {
      const st = sim.state;
      const fx = Math.floor(x), fy = Math.floor(y), i = fy * st.W + fx;
      const t = st.terrain[i];
      if (WW.TERRAIN_LUT.walk[t] <= 0 || !WW.TERRAIN_LUT.wall[t] || st.structAt[i] !== -1) return false;
      const s = WW.Structs.create(sim, 'wall', fx, fy, -1, { built: true, level: 2, mat: 'stone', style: 'tribe' });
      if (!s) return false;
      sim.fx({ type: 'dust', x: fx + 0.5, y: fy + 0.5 });
      return true;
    },
    hand: function (sim, x, y) {
      const st = sim.state;
      if (st.wild.held) return W_().drop(sim, x, y) != null;
      const u = sim.query.unitNear(x, y, 1.5);
      const a = sim.query.animalNear(x, y, 1.5);
      const pick = (u && a) ? ((u.x - x) ** 2 + (u.y - y) ** 2 <= (a.x - x) ** 2 + (a.y - y) ** 2 ? u : a) : (u || a);
      return pick ? W_().grab(sim, pick.id) : false;
    }
  };

  // Land heben/senken: Höhe mit Abfall, Gelände folgt dem Höhenband
  function shape(sim, x, y, r, amount) {
    const st = sim.state;
    let ch = false;
    forDisc(sim, x, y, r, (i, xx, yy, d2) => {
      const f = 1 - Math.sqrt(d2) / (r + 0.5);
      if (W_().setHeight(sim, i, st.height[i] + amount * f)) ch = true;
    });
    if (ch) W_().finishTerrain(sim);
  }

  // Tabelle zusammenbauen: Daten aus config-wild + Verhalten
  const EVENTS = {
    lightning: ['godLightning'], fire: ['godFire'], rain: ['godRain'], meteor: ['godMeteor'], plague: ['godPlague'], bless: ['godBless'],
    raise: ['godRaise'], lower: ['godLower'], seeds: ['godSeeds'], earthquake: ['godQuake'], volcano: ['godVolcano', 'godVolcanoWild'],
    tornado: ['godTornado'], acidrain: ['godAcid'], flood: ['godFlood'], frost: ['godFrost'], drought: ['godDrought'], breeze: ['godBreeze'],
    bomb: ['godBomb'], clusterbomb: ['godCluster'], napalm: ['godNapalm'], rocket: ['godRocket'], bomber: ['godBomber'], gunship: ['godGunship'],
    nuke: ['godNuke', 'godNukeWild'], tsar: ['godTsar', 'godTsarWild'], orbitallaser: ['godLaser'], blackhole: ['godBlackhole', 'godBlackholeWild'],
    madness: ['godMadness'], love: ['godLove'], goldrain: ['godGold'], heal: ['godHeal'], wrecker: ['godWreck'], wallbrush: [null], hand: [null]
  };
  WW.POWERS = {};
  const DEFS = (WW.WILD && WW.WILD.POWER_DEFS) || {};
  for (const k in APPLY) {
    const d = DEFS[k] || { name: k, desc: '', category: 'nature', radius: 1, duration: 0 };
    const ev = EVENTS[k] || [];
    WW.POWERS[k] = Object.assign({ key: k, brush: false, dir: false, aim: false }, d, { event: ev[0] || null, eventWild: ev[1] || null, apply: APPLY[k] });
  }
  WW.POWER_KEYS = Object.keys(WW.POWERS);

  // Kraft auslösen. silent = keine Chronik (Zufallskatastrophen schreiben ihre eigene). o = { dx, dy } (Ziehrichtung)
  function strike(sim, x, y, kind, silent, o) {
    const p = WW.POWERS[kind];
    if (!p || !Object.prototype.hasOwnProperty.call(WW.POWERS, kind)) return false;
    if (!WW.SimUtil.isNum(x) || !WW.SimUtil.isNum(y)) return false;
    const st = sim.state;
    if (x < 0 || y < 0 || x >= st.W || y >= st.H) return false;
    if (o != null && typeof o !== 'object') o = null;
    const res = p.apply(sim, x, y, o || null);
    if (!silent && p.event) {
      const i = Math.floor(y) * st.W + Math.floor(x);
      let c = sim._cities.get(st.owner[i]) || sim._cities.get(st.inRing[i]);
      if (!c && p.radius >= 4 && W_()) { const n = W_().cityNear(sim, x, y, p.radius); if (n && (n.cx - x) * (n.cx - x) + (n.cy - y) * (n.cy - y) <= p.radius * p.radius) c = n; }
      // Chronik nur, wenn eine Stadt betroffen ist (sonst würde jeder Klick die Chronik fluten)
      if (c && (!c.lastGod || st.tick - c.lastGod > 60 || c.lastGodKind !== kind)) {
        c.lastGod = st.tick; c.lastGodKind = kind;
        const vars = { city: c.name };
        if (kind === 'madness' && sim._lastMad) vars.name = sim._lastMad.name;
        sim.event(p.event, vars, WW.Cities.atCity(c));
      } else if (!c && p.eventWild && W_()) {
        W_().chron(sim, p.eventWild, { terrain: WW.TERRAIN[st.terrain[i]].name }, { x: x, y: y }, kind, 120);
      }
    }
    sim._lastMad = null;
    return res === false ? false : true;
  }

  WW.Powers = {
    strike: strike, forDisc: forDisc, structsIn: structsIn, unitsIn: unitsIn, animalsIn: animalsIn, update: update,
    boom: boom, nuke: nuke, fling: fling, addEffect: addEffect, addAircraft: addAircraft, G16: G16
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
