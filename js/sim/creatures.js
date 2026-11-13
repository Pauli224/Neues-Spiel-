// Kreaturen datengetrieben: WW.CREATURES[kind] = Werte + Verhalten (ai-Schlüssel in WW.CreatureAI).
// Spätere Stufen ergänzen nur Einträge (und bei Bedarf neue Verhaltensfunktionen).
(function (WW) { 'use strict';

  WW.CREATURES = {
    sheep: {
      key: 'sheep', name: 'Schaf', plural: 'Schafe', hp: 12, speed: 0.035, hostile: false, ai: 'grazer',
      breed: 0.0012, max: 120, flock: true, habitat: ['grass', 'flowers', 'savanna', 'tundra'], food: 4
    },
    wolf: {
      key: 'wolf', name: 'Wolf', plural: 'Wölfe', hp: 26, speed: 0.07, hostile: true, ai: 'predator',
      dmg: 2.5, breed: 0.0004, max: 30, sight: 6, prey: ['sheep'], huntsUnits: true, habitat: ['forest', 'taiga', 'grass', 'tundra']
    }
  };

  const DX = [0, 1, 0, -1, 1, 1, -1, -1];
  const DY = [-1, 0, 1, 0, -1, 1, 1, -1];

  function canStand(sim, i) {
    const st = sim.state;
    return WW.TERRAIN_LUT.walk[st.terrain[i]] > 0 && sim.block[i] === 0;
  }

  function spawn(sim, kind, x, y) {
    const st = sim.state;
    const cr = WW.CREATURES[kind];
    if (!cr) return null;
    if (st.animals.length >= WW.CONFIG.MAX_ANIMALS) return null;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= st.W || y >= st.H) return null;
    let i = y * st.W + x;
    if (!canStand(sim, i)) {
      i = WW.Path.nearestFree(sim, i, -1, 3);
      if (i < 0 || sim.block[i] !== 0) return null;
    }
    const a = {
      id: st.nextId++, kind: kind, x: (i % st.W) + 0.5, y: Math.floor(i / st.W) + 0.5, dir: 1,
      hp: cr.hp, maxHp: cr.hp, moving: false, tx: -1, wait: 0, foe: -1, cd: 0, age: 0
    };
    st.animals.push(a);
    sim._animals.set(a.id, a);
    return a;
  }

  function kill(sim, a) {
    if (a.dead) return;
    a.dead = true; a.hp = 0;
    sim._animalsDirty = true;
    sim.fx({ type: 'poof', x: a.x, y: a.y });
  }

  function hit(sim, a, dmg, attacker) {
    if (!a || a.dead) return;
    a.hp -= dmg;
    if (attacker && attacker.id != null && attacker.id >= 0) a.foe = attacker.id;
    if (a.hp <= 0) {
      kill(sim, a);
      // Jäger bringt Fleisch heim
      if (attacker && attacker.cityId >= 0) {
        const c = sim._cities.get(attacker.cityId);
        const cr = WW.CREATURES[a.kind];
        if (c && cr && cr.food) WW.Cities.addStock(sim, c, 'food', cr.food);
      }
    }
  }

  // Ein Schritt Richtung Zielkachel (gierig, keine Mauern durchqueren)
  function stepToward(sim, a, tx, ty, spd) {
    const st = sim.state, W = st.W;
    const cx = Math.floor(a.x), cy = Math.floor(a.y);
    let nx = cx, ny = cy;
    if (cx !== tx || cy !== ty) {
      let best = -1, bd = (cx - tx) * (cx - tx) + (cy - ty) * (cy - ty);
      for (let d = 0; d < 8; d++) {
        const x = cx + DX[d], y = cy + DY[d];
        if (x < 0 || y < 0 || x >= W || y >= st.H) continue;
        if (!canStand(sim, y * W + x)) continue;
        if (d >= 4 && (!canStand(sim, cy * W + x) || !canStand(sim, y * W + cx))) continue;
        const dd = (x - tx) * (x - tx) + (y - ty) * (y - ty);
        if (dd < bd) { bd = dd; best = d; }
      }
      if (best < 0) { a.tx = -1; a.moving = false; return false; }
      nx = cx + DX[best]; ny = cy + DY[best];
    }
    const gx = nx + 0.5, gy = ny + 0.5;
    const dx = gx - a.x, dy = gy - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(dx) > 0.02) a.dir = dx < 0 ? -1 : 1;
    if (d <= spd) { a.x = gx; a.y = gy; } else { a.x += dx / d * spd; a.y += dy / d * spd; }
    a.moving = true;
    return true;
  }

  function wanderTarget(sim, a, r) {
    const st = sim.state;
    const x = Math.floor(a.x + sim.rng.range(-r, r)), y = Math.floor(a.y + sim.rng.range(-r, r));
    if (x < 0 || y < 0 || x >= st.W || y >= st.H) return;
    if (!canStand(sim, y * st.W + x)) return;
    a.tx = y * st.W + x;
  }

  WW.CreatureAI = {
    grazer: function (sim, a, cr, thinkNow) {
      const st = sim.state;
      if (thinkNow) {
        if (a.wait > 0) a.wait -= 8;
        else if (a.tx < 0 && sim.rng.chance(0.3)) wanderTarget(sim, a, 4);
        // Vermehrung
        if (sim.rng.next() < cr.breed * 8 && sim._animalCount[a.kind] < cr.max) {
          const b = spawn(sim, a.kind, a.x, a.y);
          if (b) sim._animalCount[a.kind]++;
        }
      }
      if (a.tx >= 0) {
        const tx = a.tx % st.W, ty = Math.floor(a.tx / st.W);
        if (!stepToward(sim, a, tx, ty, cr.speed) || (Math.floor(a.x) === tx && Math.floor(a.y) === ty)) { a.tx = -1; a.moving = false; a.wait = 20 + sim.rng.int(60); }
      } else a.moving = false;
    },
    predator: function (sim, a, cr, thinkNow) {
      const st = sim.state;
      if (thinkNow) {
        if (a.cd > 0) a.cd -= 8;
        let prey = a.foe >= 0 ? (sim._units.get(a.foe) || sim._animals.get(a.foe)) : null;
        if (prey && prey.dead) prey = null;
        if (prey) { const dx = prey.x - a.x, dy = prey.y - a.y; if (dx * dx + dy * dy > 100) prey = null; }
        if (!prey) {
          let bd = 1e9;
          WW.Units.forNear(sim, a.x, a.y, cr.sight, true, (b, d2) => {
            if (cr.prey.indexOf(b.kind) >= 0 && d2 < bd) { bd = d2; prey = b; }
          });
          // Bewohner nur angreifen, wenn sie allein draußen sind (hinter Mauern ist man sicher)
          if (cr.huntsUnits && !prey) WW.Units.forNear(sim, a.x, a.y, cr.sight * 0.6, false, (u, d2) => {
            if (u.role === 'settler' || d2 + 3 >= bd) return;
            const i = Math.floor(u.y) * st.W + Math.floor(u.x);
            if (st.inRing[i] !== -1) return;
            let company = 0;
            WW.Units.forNear(sim, u.x, u.y, 2.5, false, (v) => { if (v !== u) company++; });
            if (company >= 2) return;
            bd = d2 + 3; prey = u;
          });
        }
        a.foe = prey ? prey.id : -1;
        if (prey) {
          const dx = prey.x - a.x, dy = prey.y - a.y;
          if (dx * dx + dy * dy <= 1.4 && a.cd <= 0) {
            a.cd = 10;
            if (prey.role !== undefined) WW.Units.hitUnit(sim, { id: a.id, kingdomId: -1 }, prey, cr.dmg);
            else hit(sim, prey, cr.dmg, null);
          }
          a.tx = Math.floor(prey.y) * st.W + Math.floor(prey.x);
        } else if (a.tx < 0 && sim.rng.chance(0.3)) wanderTarget(sim, a, 6);
        if (sim.rng.next() < cr.breed * 8 && sim._animalCount[a.kind] < cr.max && (sim._animalCount.sheep || 0) > 10) {
          const b = spawn(sim, a.kind, a.x, a.y);
          if (b) sim._animalCount[a.kind]++;
        }
      }
      if (a.tx >= 0) {
        const tx = a.tx % st.W, ty = Math.floor(a.tx / st.W);
        const near = Math.floor(a.x) === tx && Math.floor(a.y) === ty;
        if (near || !stepToward(sim, a, tx, ty, cr.speed * (a.foe >= 0 ? 1.2 : 0.6))) { a.tx = -1; a.moving = false; }
      } else a.moving = false;
    }
  };

  function updateAll(sim) {
    const st = sim.state, W = st.W;
    const cnt = sim._animalCount = {};
    for (const a of st.animals) if (!a.dead) cnt[a.kind] = (cnt[a.kind] || 0) + 1;
    for (let n = 0; n < st.animals.length; n++) {
      const a = st.animals[n];
      if (a.dead) continue;
      const cr = WW.CREATURES[a.kind];
      if (!cr) { kill(sim, a); continue; }
      // auf Sperrkachel? (gemaltes Wasser, neue Mauer)
      const i = Math.floor(a.y) * W + Math.floor(a.x);
      if (!canStand(sim, i)) {
        const f = WW.Path.nearestFree(sim, i, -1, 3);
        if (f >= 0 && sim.block[f] === 0) { a.x = (f % W) + 0.5; a.y = Math.floor(f / W) + 0.5; a.tx = -1; }
        else { kill(sim, a); continue; }
      }
      const ai = WW.CreatureAI[cr.ai];
      if (ai) ai(sim, a, cr, ((st.tick + a.id) & 7) === 0);
    }
  }

  function yearly(sim) {
    for (const a of sim.state.animals) {
      if (a.dead) continue;
      a.age++;
      if (a.age > 14 && sim.rng.chance(0.3)) kill(sim, a);
    }
  }

  // Anfangsbestand
  function populate(sim, sheep, wolves) {
    const st = sim.state, W = st.W, H = st.H;
    const place = (kind, n, keys) => {
      let tries = 0;
      while (n > 0 && tries++ < n * 60) {
        const i = sim.rng.int(W * H);
        if (st.owner[i] !== -1) continue;
        if (keys.indexOf(WW.TERRAIN[st.terrain[i]].key) < 0) continue;
        const groupN = Math.min(n, 1 + sim.rng.int(kind === 'sheep' ? 4 : 2));
        for (let g = 0; g < groupN; g++) { if (spawn(sim, kind, (i % W) + sim.rng.int(3) - 1, Math.floor(i / W) + sim.rng.int(3) - 1)) n--; }
      }
    };
    place('sheep', sheep, WW.CREATURES.sheep.habitat);
    place('wolf', wolves, WW.CREATURES.wolf.habitat);
  }

  WW.Creatures = { spawn: spawn, kill: kill, hit: hit, updateAll: updateAll, yearly: yearly, populate: populate };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
