// Kreaturen datengetrieben: WW.CREATURES[kind] = Werte (aus WW.WILD.CREATURES, js/core/config-wild.js) + Verhalten
// (ai-Schlüssel in WW.CreatureAI). Tiere fressen, vermehren sich, altern, jagen; Monster haben eigenes Verhalten.
// Gestaffelte KI: jedes Tier denkt alle 8 Ticks, bewegt sich jeden Tick (gierig, Kachel für Kachel).
(function (WW) { 'use strict';

  const DEFS = (WW.WILD && WW.WILD.CREATURES) || {
    sheep: { name: 'Schaf', plural: 'Schafe', category: 'animal', hp: 12, speed: 0.035, ai: 'grazer', move: 'land', habitat: ['grass', 'flowers', 'savanna', 'tundra'], area: 60, max: 70, life: 12, breed: 0.05, group: [3, 6], diet: 'grass', food: 4, flock: true },
    wolf: { name: 'Wolf', plural: 'Wölfe', category: 'animal', hp: 26, speed: 0.07, hostile: true, ai: 'predator', move: 'land', habitat: ['forest', 'taiga', 'grass', 'tundra'], area: 320, max: 26, life: 12, breed: 0.03, group: [3, 4], diet: 'meat', dmg: 2.5, sight: 7, prey: ['sheep'], huntsUnits: true, pack: true, food: 3 }
  };
  WW.CREATURES = {};
  const MOVE = { land: 0, water: 1, sand: 2, air: 3, ghost: 3 };
  for (const k in DEFS) {
    const d = Object.assign({ key: k, spawnable: true, hostile: false, flying: false, ghost: false, aquatic: false,
      dmg: 0, sight: 5, prey: [], area: 200, max: 30, life: 15, breed: 0, group: [1, 1], diet: 'none', food: 0 }, DEFS[k]);
    d._mv = MOVE[d.move] == null ? 0 : MOVE[d.move];
    WW.CREATURES[k] = d;
  }
  WW.CREATURE_KEYS = Object.keys(WW.CREATURES);

  const DX = [0, 1, 0, -1, 1, 1, -1, -1];
  const DY = [-1, 0, 1, 0, -1, 1, 1, -1];
  const THINK = 8;

  const CFG0 = { ANIMALS_PER_TILE: 0.03, ANIMALS_MIN: 150, ANIMALS_MAX: 900, FOOD_DECAY: 3, GRAZE_BITE: 90, GRAZE_SHOW: 128 };
  function CFG() { return (WW.WILD && WW.WILD.CFG) || CFG0; }
  function maxAnimals(sim) {
    const c = CFG(), N = sim.state.W * sim.state.H;
    return Math.max(c.ANIMALS_MIN, Math.min(c.ANIMALS_MAX, Math.round(N * c.ANIMALS_PER_TILE)));
  }

  // Darf eine Kreatur mit Bewegungsart mv auf Kachel i stehen?
  function canEnterMv(sim, mv, i) {
    const st = sim.state, t = st.terrain[i];
    if (mv === 3) return true;
    if (sim.block[i] !== 0) return false;
    if (mv === 1) return WW.TERRAIN_LUT.water[t] === 1;
    if (mv === 2) return t === WW.T.SAND || t === WW.T.DESERT;
    return WW.TERRAIN_LUT.walk[t] > 0;
  }
  function canEnter(sim, cr, i) { return canEnterMv(sim, cr._mv, i); }
  function canStand(sim, i) { return canEnterMv(sim, 0, i); }

  // nächste passende Kachel im Umkreis r (Ringe), -1 = keine
  function nearestFor(sim, cr, i, r) {
    const st = sim.state, W = st.W, H = st.H;
    if (canEnter(sim, cr, i)) return i;
    const x0 = i % W, y0 = (i - x0) / W;
    for (let d = 1; d <= r; d++) {
      for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
        const x = x0 + dx, y = y0 + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (canEnter(sim, cr, y * W + x)) return y * W + x;
      }
    }
    return -1;
  }

  function counts(sim) { return sim._animalCount || (sim._animalCount = {}); }

  // Neues Tier/Monster. o = { home, size, food, age, force } (force: ohne Weltobergrenze, z. B. Schleim-Teilung)
  function spawn(sim, kind, x, y, o) {
    const st = sim.state;
    const cr = WW.CREATURES[kind];
    if (!cr) return null;
    o = o || {};
    if (!WW.SimUtil.isNum(x) || !WW.SimUtil.isNum(y)) return null;
    if (st.animals.length >= maxAnimals(sim) + (o.force ? 40 : 0)) return null;
    const fx = Math.floor(x), fy = Math.floor(y);
    if (fx < 0 || fy < 0 || fx >= st.W || fy >= st.H) return null;
    let i = fy * st.W + fx;
    if (!canEnter(sim, cr, i)) { i = nearestFor(sim, cr, i, 3); if (i < 0) return null; }
    const size = kind === 'slime' ? Math.max(1, Math.min(3, (o.size | 0) || 3)) : 1;
    const hp = Math.round(cr.hp * (kind === 'slime' ? size : 1));
    const a = {
      id: st.nextId++, kind: kind, x: (i % st.W) + 0.5, y: Math.floor(i / st.W) + 0.5, dir: 1,
      hp: hp, maxHp: hp, moving: false, tx: -1, wait: 0, foe: -1, cd: 0, age: o.age | 0,
      food: o.food == null ? 70 : o.food, home: o.home == null ? -1 : o.home, size: size, state: 0, t: 0, mad: 0
    };
    if (cr.burrow) a.buried = true;
    st.animals.push(a);
    sim._animals.set(a.id, a);
    const c = counts(sim); c[kind] = (c[kind] || 0) + 1;
    return a;
  }

  function addLoot(sim, cityId, res, amt) {
    const c = sim._cities.get(cityId);
    if (c && amt > 0) WW.Cities.addStock(sim, c, res, amt);
  }

  function kill(sim, a, killer) {
    if (!a || a.dead) return;
    a.dead = true; a.hp = 0; a.moving = false;
    sim._animalsDirty = true;
    const c = counts(sim); if (c[a.kind]) c[a.kind]--;
    const cr = WW.CREATURES[a.kind];
    sim.fx({ type: 'poof', x: a.x, y: a.y });
    if (!cr) return;
    // Schleim teilt sich
    if (a.kind === 'slime' && a.size > 1 && !a.noSplit) {
      for (let k = 0; k < 2; k++) {
        const b = spawn(sim, 'slime', a.x + (k ? 0.6 : -0.6), a.y, { size: a.size - 1, force: true });
        if (b) b.wait = 8;
      }
      sim.fx({ type: 'split', x: a.x, y: a.y });
    }
    if (killer && killer.role !== undefined && killer.cityId >= 0) {
      if (cr.food) addLoot(sim, killer.cityId, 'food', cr.food);
      if (cr.loot) for (const r in cr.loot) addLoot(sim, killer.cityId, r, cr.loot[r]);
    }
    if (WW.Wild) WW.Wild.onCreatureDeath(sim, a, cr, killer);
  }

  function hit(sim, a, dmg, attacker) {
    if (!a || a.dead || !(dmg > 0)) return;
    const cr = WW.CREATURES[a.kind];
    if (cr && cr.burrow && a.buried) return;          // unter dem Sand unverwundbar
    if (cr && cr.armor) dmg *= (1 - cr.armor);
    a.hp -= dmg;
    if (attacker && attacker.id != null && attacker.id >= 0 && attacker.id !== a.id) a.foe = attacker.id;
    if (!(a.hp > 0)) kill(sim, a, attacker || null);
  }

  // Angriff einer Kreatur auf Einheit oder Tier
  function attack(sim, a, t, dmg) {
    if (!t || t.dead) return;
    // Einheiten verfolgen angreifende Tiere nicht selbst (spart Wegsuche); Soldaten finden Monster über die Einheiten-KI
    if (t.role !== undefined) WW.Units.hitUnit(sim, { id: t.role === 'soldier' ? a.id : -1, kingdomId: -1 }, t, dmg);
    else hit(sim, t, dmg, a);
  }

  // Ein Schritt Richtung Zielkachel. Flieger/Geister direkt, sonst gierig über erlaubte Kacheln.
  function stepToward(sim, a, cr, tx, ty, spd) {
    const st = sim.state, W = st.W;
    if (cr._mv === 3) {
      const gx = tx + 0.5, gy = ty + 0.5, dx = gx - a.x, dy = gy - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(dx) > 0.02) a.dir = dx < 0 ? -1 : 1;
      if (d <= spd) { a.x = gx; a.y = gy; } else { a.x += dx / d * spd; a.y += dy / d * spd; }
      a.moving = d > 0.01;
      return true;
    }
    const cx = Math.floor(a.x), cy = Math.floor(a.y);
    let nx = cx, ny = cy;
    if (cx !== tx || cy !== ty) {
      let best = -1, bd = (cx - tx) * (cx - tx) + (cy - ty) * (cy - ty);
      for (let d = 0; d < 8; d++) {
        const x = cx + DX[d], y = cy + DY[d];
        if (x < 0 || y < 0 || x >= W || y >= st.H) continue;
        if (!canEnter(sim, cr, y * W + x)) continue;
        if (d >= 4 && (!canEnter(sim, cr, cy * W + x) || !canEnter(sim, cr, y * W + cx))) continue;
        const dd = (x - tx) * (x - tx) + (y - ty) * (y - ty);
        if (dd < bd) { bd = dd; best = d; }
      }
      if (best < 0) { a.tx = -1; a.moving = false; return false; }
      nx = cx + DX[best]; ny = cy + DY[best];
    }
    if (cr._mv === 0) spd *= Math.max(0.4, WW.TERRAIN_LUT.walk[st.terrain[ny * W + nx]]);
    const gx = nx + 0.5, gy = ny + 0.5;
    const dx = gx - a.x, dy = gy - a.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(dx) > 0.02) a.dir = dx < 0 ? -1 : 1;
    if (d <= spd) { a.x = gx; a.y = gy; } else { a.x += dx / d * spd; a.y += dy / d * spd; }
    a.moving = true;
    return true;
  }

  // Bewegung zum Ziel a.tx; true = angekommen oder festgefahren
  function moveOn(sim, a, cr, mul) {
    if (a.tx < 0) { a.moving = false; return true; }
    const W = sim.state.W;
    const tx = a.tx % W, ty = Math.floor(a.tx / W);
    if (Math.floor(a.x) === tx && Math.floor(a.y) === ty && (cr._mv !== 3 || Math.abs(a.x - tx - 0.5) + Math.abs(a.y - ty - 0.5) < 0.1)) {
      a.tx = -1; a.moving = false; return true;
    }
    if (!stepToward(sim, a, cr, tx, ty, cr.speed * (mul || 1))) { a.tx = -1; return true; }
    return false;
  }

  function habitatOk(sim, cr, i) {
    const hs = cr._habSet || (cr._habSet = (function () { const s = new Uint8Array(WW.TERRAIN.length); for (const k of cr.habitat || []) if (WW.TERRAIN_BY_KEY[k]) s[WW.TERRAIN_BY_KEY[k].id] = 1; return s; })());
    return hs[sim.state.terrain[i]] === 1;
  }

  // Zufälliges Wanderziel im Umkreis r. stay = nur im Habitat; around = {x,y} statt eigener Position
  function wanderTarget(sim, a, cr, r, stay, around) {
    const st = sim.state;
    const px = around ? around.x : a.x, py = around ? around.y : a.y;
    for (let n = 0; n < 3; n++) {
      const x = Math.floor(px + sim.rng.range(-r, r)), y = Math.floor(py + sim.rng.range(-r, r));
      if (x < 0 || y < 0 || x >= st.W || y >= st.H) continue;
      const i = y * st.W + x;
      if (!canEnter(sim, cr, i)) continue;
      if (stay && !habitatOk(sim, cr, i)) continue;
      a.tx = i; return true;
    }
    return false;
  }
  function targetAt(sim, a, t) {
    const st = sim.state;
    const x = Math.max(0, Math.min(st.W - 1, Math.floor(t.x))), y = Math.max(0, Math.min(st.H - 1, Math.floor(t.y)));
    a.tx = y * st.W + x;
  }
  function fleeFrom(sim, a, cr, fx, fy, r) {
    const st = sim.state;
    const dx = a.x - fx, dy = a.y - fy, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const x = Math.floor(a.x + dx / d * r + sim.rng.range(-1, 1)), y = Math.floor(a.y + dy / d * r + sim.rng.range(-1, 1));
    if (x < 0 || y < 0 || x >= st.W || y >= st.H) return false;
    const i = nearestFor(sim, cr, y * st.W + x, 2);
    if (i < 0) return false;
    a.tx = i; return true;
  }
  function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

  // Leute in der Nähe (ohne Siedler), optional nur außerhalb von Mauern
  function nearestUnit(sim, a, r, outsideOnly, filter) {
    const st = sim.state;
    let best = null, bd = r * r;
    WW.Units.forNear(sim, a.x, a.y, r, false, (u, d2) => {
      if (d2 >= bd || u.role === 'settler') return;
      if (outsideOnly && st.inRing[Math.floor(u.y) * st.W + Math.floor(u.x)] !== -1) return;
      if (filter && !filter(u)) return;
      bd = d2; best = u;
    });
    return best;
  }
  function nearestAnimal(sim, a, r, filter) {
    let best = null, bd = r * r;
    WW.Units.forNear(sim, a.x, a.y, r, true, (b, d2) => {
      if (b === a || d2 >= bd || b.held) return;
      if (filter && !filter(b)) return;
      bd = d2; best = b;
    });
    return best;
  }
  const notMonster = (b) => { const c = WW.CREATURES[b.kind]; return c && c.category !== 'monster'; };

  // Vermehrung mit weicher Obergrenze je Art und Habitat
  function tryBreed(sim, a, cr, p) {
    const n = counts(sim)[a.kind] || 0;
    const cap = WW.Wild ? WW.Wild.capOf(sim, a.kind) : cr.max;
    if (n >= cap || a.age < 1) return;
    if (sim.rng.next() < p * (1 - n / cap)) {
      const b = spawn(sim, a.kind, a.x + sim.rng.range(-1, 1), a.y + sim.rng.range(-1, 1), { home: a.home, food: 55 });
      if (b) { a.food -= 25; b.age = 0; }
    }
  }

  // Wahnsinn: greift alles in der Nähe an
  function berserk(sim, a, cr) {
    let t = nearestUnit(sim, a, 6, false) || nearestAnimal(sim, a, 6);
    if (!t) { if (a.tx < 0) wanderTarget(sim, a, cr, 5); return; }
    if (dist2(a, t) <= 1.6) { if (a.cd <= 0) { attack(sim, a, t, Math.max(3, cr.dmg || 3) * 1.5); a.cd = 10; } }
    else targetAt(sim, a, t);
  }

  // Jagd-/Angriffsschritt gegen Ziel t (Nahkampf oder Fernkampf)
  function engage(sim, a, cr, t, dmg, range, fxType) {
    const d2 = dist2(a, t);
    range = range || 1.25;
    if (d2 <= range * range) {
      a.tx = -1;
      if (Math.abs(t.x - a.x) > 0.05) a.dir = t.x < a.x ? -1 : 1;
      if (a.cd <= 0) {
        if (fxType) sim.fx({ type: fxType, x: a.x, y: a.y - 0.3, x2: t.x, y2: t.y - 0.3 });
        attack(sim, a, t, dmg); a.cd = 10;
        return t.dead ? 'kill' : 'hit';
      }
      return 'wait';
    }
    targetAt(sim, a, t);
    return 'chase';
  }

  // Grasfresser fressen auf ihrer Kachel
  function graze(sim, a, cr) {
    const st = sim.state, i = Math.floor(a.y) * st.W + Math.floor(a.x);
    if (cr.berries && st.flora[i] === 1) { st.flora[i] = 2; a.food = Math.min(100, a.food + 40); sim.markDirty(i); return true; }
    if (cr.diet !== 'grass') return false;
    const t = st.terrain[i];
    if (WW.TERRAIN_LUT.fertile[t] <= 0 || WW.TERRAIN_LUT.water[t] || st.fallout[i] > 0) return false;
    if (st.graze[i] >= 160) return false;
    const before = st.graze[i];
    st.graze[i] = Math.min(255, before + CFG().GRAZE_BITE);
    if (before < CFG().GRAZE_SHOW && st.graze[i] >= CFG().GRAZE_SHOW) sim.markDirty(i);
    a.food = Math.min(100, a.food + 22 * WW.TERRAIN_LUT.fertile[t] + 8);
    return true;
  }
  // frisches Futter in der Nähe suchen
  function findPasture(sim, a, cr) {
    const st = sim.state;
    let best = -1, bs = 999;
    for (let n = 0; n < 5; n++) {
      const x = Math.floor(a.x + sim.rng.range(-5, 5)), y = Math.floor(a.y + sim.rng.range(-5, 5));
      if (x < 0 || y < 0 || x >= st.W || y >= st.H) continue;
      const i = y * st.W + x;
      if (!canEnter(sim, cr, i) || st.owner[i] !== -1 && sim.rng.chance(0.7)) continue;
      let s = st.graze[i] + (habitatOk(sim, cr, i) ? 0 : 80) + (WW.TERRAIN_LUT.fertile[st.terrain[i]] > 0 ? 0 : 200);
      if (cr.berries && st.flora[i] === 1) s -= 150;
      if (s < bs) { bs = s; best = i; }
    }
    if (best >= 0) a.tx = best;
  }

  // ---------------------------------------------------------------------------
  // Verhalten
  // ---------------------------------------------------------------------------
  WW.CreatureAI = {
    grazer: function (sim, a, cr, think) {
      if (think) {
        a.food -= CFG().FOOD_DECAY * (a.kind === 'cow' ? 1.3 : 1);
        if (a.wait > 0) a.wait -= THINK;
        // Raubtiere in Sicht? fliehen
        let danger = null;
        if (sim.rng.chance(0.5)) danger = nearestAnimal(sim, a, 4, (b) => { const c = WW.CREATURES[b.kind]; return c && (c.prey.indexOf(a.kind) >= 0 || c.category === 'monster'); });
        if (danger) { fleeFrom(sim, a, cr, danger.x, danger.y, 5); a.wait = 0; a.fleeing = 1; }
        else {
          a.fleeing = 0;
          const ate = a.food < 85 && graze(sim, a, cr);
          if (!ate && a.food < 60 && a.tx < 0) findPasture(sim, a, cr);
          else if (a.tx < 0 && a.wait <= 0 && sim.rng.chance(0.25)) {
            let mate = null;
            if (cr.flock && sim.rng.chance(0.6)) mate = nearestAnimal(sim, a, 7, (b) => b.kind === a.kind);
            if (mate && dist2(a, mate) > 4) wanderTarget(sim, a, cr, 2, false, mate);
            else wanderTarget(sim, a, cr, 4, sim.rng.chance(0.7));
          }
          if (a.food > 60) tryBreed(sim, a, cr, cr.breed);
        }
        if (a.food <= 0) { a.food = 0; a.hp -= 2; if (a.hp <= 0) { kill(sim, a, null); return; } }
      }
      if (moveOn(sim, a, cr, a.fleeing ? 1.6 : 1) && a.tx < 0 && think) a.wait = Math.max(a.wait, 16 + sim.rng.int(40));
    },

    predator: function (sim, a, cr, think) {
      if (think) {
        a.food -= CFG().FOOD_DECAY * 0.8;
        if (a.wait > 0) a.wait -= THINK;
        let prey = a.foe >= 0 ? WW.Units.entity(sim, a.foe) : null;
        if (prey && (prey.dead || prey.held || dist2(a, prey) > 100)) prey = null;
        if (!prey && a.food < 70) {
          prey = nearestAnimal(sim, a, cr.sight, (b) => cr.prey.indexOf(b.kind) >= 0);
          // Bewohner nur, wenn allein draußen und hungrig (hinter Mauern ist man sicher)
          // nur Einzelne weit draußen (≥ 14 Kacheln von jeder Stadtmitte), nie Kinder, nicht in Gruppen
          if (!prey && cr.huntsUnits && a.food < 25 && WW.Wild && WW.Wild.cityDist2(sim, a.x, a.y) > 14 * 14) prey = nearestUnit(sim, a, cr.sight * 0.6, true, (u) => {
            if (u.role === 'child' || WW.Wild.cityDist2(sim, u.x, u.y) < 14 * 14) return false;
            let company = 0;
            WW.Units.forNear(sim, u.x, u.y, 2.5, false, (v) => { if (v !== u) company++; });
            return company < 2;
          });
          if (prey && cr.pack) WW.Units.forNear(sim, a.x, a.y, 8, true, (b) => { if (b !== a && b.kind === a.kind && b.foe < 0) b.foe = prey.id; });
        }
        if (!prey && cr.berries && a.food < 80) graze(sim, a, cr);
        a.foe = prey ? prey.id : -1;
        if (prey) {
          const r = engage(sim, a, cr, prey, cr.dmg, 1.25);
          if (r === 'kill') {
            a.food = 100; a.foe = -1; a.wait = 60;
            if (WW.Wild) WW.Wild.onPreyKilled(sim, a, prey);
          }
        } else if (a.tx < 0 && a.wait <= 0 && sim.rng.chance(0.3)) {
          // Rudel bleibt zusammen und in der Nähe des Baus
          const home = a.home >= 0 ? sim._structs.get(a.home) : null;
          let mate = null;
          if (cr.pack && sim.rng.chance(0.5)) mate = nearestAnimal(sim, a, 10, (b) => b.kind === a.kind);
          if (home && dist2(a, { x: home.x + 0.5, y: home.y + 0.5 }) > 14 * 14) wanderTarget(sim, a, cr, 3, false, { x: home.x + 0.5, y: home.y + 0.5 });
          else if (mate && dist2(a, mate) > 6) wanderTarget(sim, a, cr, 2, false, mate);
          else wanderTarget(sim, a, cr, 6, true);
        }
        if (a.food > 65) tryBreed(sim, a, cr, cr.breed);
        if (a.food <= 0) { a.food = 0; a.hp -= 1.5; if (a.hp <= 0) { kill(sim, a, null); return; } }
      }
      moveOn(sim, a, cr, a.foe >= 0 ? 1.25 : 0.6);
    },

    crab: function (sim, a, cr, think) {
      if (think) {
        if (a.wait > 0) a.wait -= THINK;
        else if (a.tx < 0 && sim.rng.chance(0.3)) wanderTarget(sim, a, cr, 3, true);
        if (sim.rng.chance(0.02)) { const u = nearestUnit(sim, a, 1.2, false); if (u) { WW.Units.bubble(u, 'exclaim', 20); a.cd = 20; } }
        tryBreed(sim, a, cr, cr.breed);
      }
      if (moveOn(sim, a, cr, 1) && think) a.wait = 20 + sim.rng.int(40);
    },

    fish: function (sim, a, cr, think) {
      if (think) {
        if (a.tx < 0 && sim.rng.chance(0.4)) wanderTarget(sim, a, cr, 4, false);
        if (sim.rng.chance(0.015)) sim.fx({ type: 'fishjump', x: a.x, y: a.y });
        tryBreed(sim, a, cr, cr.breed);
        if (sim.state.fallout[Math.floor(a.y) * sim.state.W + Math.floor(a.x)] > 0) a.hp -= 1;
        if (a.hp <= 0) { kill(sim, a, null); return; }
      }
      moveOn(sim, a, cr, 1);
    },

    dragon: function (sim, a, cr, think) {
      const st = sim.state;
      if (think) {
        if (a.cd > 0) a.cd -= THINK;
        const home = a.home >= 0 ? sim._structs.get(a.home) : null;
        // angegriffen: zurückfauchen
        const foe = a.foe >= 0 ? WW.Units.entity(sim, a.foe) : null;
        if (foe && !foe.dead && dist2(a, foe) < 16 && a.cd <= 0) breathe(sim, a, foe.x, foe.y);
        else if (foe && (foe.dead || dist2(a, foe) >= 16)) a.foe = -1;
        if (a.state === 0) {                       // ruht
          a.t -= THINK;
          if (home && dist2(a, { x: home.x + 0.5, y: home.y + 0.5 }) > 4) a.tx = home.y * st.W + home.x;
          if (a.t <= 0) {
            a.t = 0;
            const tgt = WW.Wild ? WW.Wild.dragonTarget(sim, a) : null;
            if (tgt) { a.tx = tgt.i; a.state = 1; a.raidCity = tgt.cityId; } else a.t = 400;
          }
        } else if (a.state === 1) {                // fliegt hin
          if (a.tx < 0) { a.state = 2; a.t = 4; }
        } else if (a.state === 2) {                // speit Feuer
          if (a.cd <= 0) breathe(sim, a, a.x + sim.rng.range(-3, 3), a.y + sim.rng.range(-3, 3));
          if (--a.t <= 0) {
            a.state = 3;
            if (home) a.tx = home.y * st.W + home.x; else wanderTarget(sim, a, cr, 20);
          }
        } else if (a.tx < 0) {                     // zurück
          a.state = 0; a.t = home ? 900 + sim.rng.int(1500) : 300 + sim.rng.int(400);
        }
      }
      moveOn(sim, a, cr, a.state === 0 ? 0.5 : 1);
    },

    zombie: function (sim, a, cr, think) {
      if (think) {
        if (a.cd > 0) a.cd -= THINK;
        let t = a.foe >= 0 ? WW.Units.entity(sim, a.foe) : null;
        if (t && (t.dead || t.held || dist2(a, t) > 100 || (t.kind && t.kind === 'zombie'))) t = null;
        if (!t) t = nearestUnit(sim, a, cr.sight, false) || nearestAnimal(sim, a, 5, notMonster);
        a.foe = t ? t.id : -1;
        if (t) {
          const tx = t.x, ty = t.y, isUnit = t.role !== undefined, race = t.race;
          if (engage(sim, a, cr, t, cr.dmg) === 'kill' && t.kind !== 'fish' && (counts(sim).zombie || 0) < cr.max) {
            const z = spawn(sim, 'zombie', tx, ty, { force: true });
            if (z) { z.wait = 16; sim.fx({ type: 'zombify', x: tx, y: ty }); if (isUnit) z.race = race; }
            if (WW.Wild) WW.Wild.onZombieBite(sim, a, tx, ty, isUnit);
          }
        } else if (a.tx < 0 && sim.rng.chance(0.3)) wanderTarget(sim, a, cr, 5);
      }
      moveOn(sim, a, cr, 1);
    },

    skeleton: function (sim, a, cr, think) {
      if (think) {
        if (a.cd > 0) a.cd -= THINK;
        const home = a.home >= 0 ? sim._structs.get(a.home) : null;
        const t = nearestUnit(sim, a, home ? 4 : cr.sight, false, (u) => u.role !== 'bandit' && (!home || (u.x - home.x) * (u.x - home.x) + (u.y - home.y) * (u.y - home.y) < 49));
        if (t) {
          const d = Math.sqrt(dist2(a, t));
          if (d <= cr.range) { a.tx = -1; if (a.cd <= 0) { sim.fx({ type: 'arrow', x: a.x, y: a.y - 0.4, x2: t.x, y2: t.y - 0.3 }); attack(sim, a, t, cr.dmg); a.cd = 14; } }
          else targetAt(sim, a, t);
        } else if (a.tx < 0 && sim.rng.chance(0.25)) {
          if (home) wanderTarget(sim, a, cr, 4, false, { x: home.x + 0.5, y: home.y + 0.5 }); else wanderTarget(sim, a, cr, 5);
        }
      }
      moveOn(sim, a, cr, 1);
    },

    slime: function (sim, a, cr, think) {
      if (think) {
        if (a.cd > 0) a.cd -= THINK;
        const t = nearestUnit(sim, a, cr.sight, false) || nearestAnimal(sim, a, 3, notMonster);
        if (t) engage(sim, a, cr, t, cr.dmg * a.size);
        else if (a.tx < 0 && sim.rng.chance(0.3)) wanderTarget(sim, a, cr, 3, sim.rng.chance(0.6));
      }
      // hüpft: bewegt sich nur in jedem zweiten Viertel
      if (((sim.state.tick + a.id) & 15) < 8) moveOn(sim, a, cr, 1.6); else a.moving = false;
    },

    ghost: function (sim, a, cr, think) {
      if (think) {
        if (a.wait > 0) a.wait -= THINK;
        // erschrecken
        let scared = 0;
        WW.Units.forNear(sim, a.x, a.y, cr.sight, false, (u) => {
          if (scared >= 4 || u.role === 'soldier') return;
          scared++;
          if (WW.Wild) WW.Wild.scare(sim, u, a.x, a.y, true);
        });
        if (scared && WW.Wild) WW.Wild.onHaunt(sim, a);
        if (a.tx < 0 && a.wait <= 0) {
          const tgt = WW.Wild ? WW.Wild.hauntTarget(sim, a) : null;
          if (tgt >= 0 && sim.rng.chance(0.5)) a.tx = tgt; else wanderTarget(sim, a, cr, 8);
          a.wait = 20;
        }
      }
      moveOn(sim, a, cr, 1);
    },

    demon: function (sim, a, cr, think) {
      if (think) {
        if (a.cd > 0) a.cd -= THINK;
        const st = sim.state;
        if (sim.rng.chance(0.25)) {
          const x = Math.floor(a.x + sim.rng.range(-1.5, 1.5)), y = Math.floor(a.y + sim.rng.range(-1.5, 1.5));
          if (WW.Env.ignite(sim, x, y, 14) && WW.Wild) WW.Wild.onDemonFire(sim, a, x, y);
        }
        const t = nearestUnit(sim, a, cr.sight, false);
        if (t) engage(sim, a, cr, t, cr.dmg);
        else if (a.tx < 0 && sim.rng.chance(0.3)) wanderTarget(sim, a, cr, 6);
        if (st.fire[Math.floor(a.y) * st.W + Math.floor(a.x)]) a.hp = Math.min(a.maxHp, a.hp + 2);
      }
      moveOn(sim, a, cr, 1);
    },

    giantchicken: function (sim, a, cr, think) {
      const st = sim.state;
      if (think) {
        if (a.cd > 0) a.cd -= THINK;
        const i = Math.floor(a.y) * st.W + Math.floor(a.x);
        const s = sim._structs.get(st.structAt[i]);
        if (s && s.type === 'field') {
          if (s.growth > 0 || s.gprog > 0) { s.growth = 0; s.gprog = 0; sim.markDirty(i); sim.fx({ type: 'dust', x: a.x, y: a.y }); if (WW.Wild) WW.Wild.onTrample(sim, a, s); }
        }
        if (sim.rng.chance(0.006)) { const b = spawn(sim, 'chicken', a.x, a.y); if (b) sim.fx({ type: 'egg', x: a.x, y: a.y }); }
        const u = nearestUnit(sim, a, 1.4, false);
        if (u && a.cd <= 0) { attack(sim, a, u, cr.dmg); WW.Units.bubble(u, 'question', 25); a.cd = 16; }
        if (a.tx < 0 && sim.rng.chance(0.4)) {
          // Felder anlocken: zufällige Kacheln absuchen
          let f = -1;
          for (let n = 0; n < 8 && f < 0; n++) {
            const x = Math.floor(a.x + sim.rng.range(-cr.sight, cr.sight)), y = Math.floor(a.y + sim.rng.range(-cr.sight, cr.sight));
            if (x < 0 || y < 0 || x >= st.W || y >= st.H) continue;
            const g = sim._structs.get(st.structAt[y * st.W + x]);
            if (g && g.type === 'field' && canEnter(sim, cr, y * st.W + x)) f = y * st.W + x;
          }
          if (f >= 0) a.tx = f; else wanderTarget(sim, a, cr, 6);
        }
      }
      moveOn(sim, a, cr, 1);
    },

    yeti: function (sim, a, cr, think) {
      if (think) {
        if (a.cd > 0) a.cd -= THINK;
        const t = nearestUnit(sim, a, cr.sight, false);
        if (t) {
          const d = Math.sqrt(dist2(a, t));
          if (d <= cr.range) { a.tx = -1; if (a.cd <= 0) { sim.fx({ type: 'snowball', x: a.x, y: a.y - 0.6, x2: t.x, y2: t.y - 0.3 }); attack(sim, a, t, cr.dmg); a.cd = 16; if (WW.Wild) WW.Wild.onBossAttack(sim, a); } }
          else targetAt(sim, a, t);
        } else if (a.tx < 0 && sim.rng.chance(0.25)) wanderTarget(sim, a, cr, 6, true);
      }
      moveOn(sim, a, cr, 1);
    },

    sandworm: function (sim, a, cr, think) {
      if (think) {
        if (a.cd > 0) a.cd -= THINK;
        if (!a.buried) { a.t -= THINK; if (a.t <= 0) { a.buried = true; sim.fx({ type: 'sandburst', x: a.x, y: a.y }); } }
        const t = nearestUnit(sim, a, cr.sight, false) || nearestAnimal(sim, a, cr.sight, notMonster);
        if (t) {
          if (dist2(a, t) <= 1.8) {
            if (a.cd <= 0) {
              a.buried = false; a.t = 40; a.tx = -1;
              sim.fx({ type: 'sandburst', x: a.x, y: a.y });
              attack(sim, a, t, cr.dmg); a.cd = 30;
              if (WW.Wild) WW.Wild.onBossAttack(sim, a);
            }
          } else targetAt(sim, a, t);
        } else if (a.tx < 0 && sim.rng.chance(0.3)) wanderTarget(sim, a, cr, 8);
      }
      moveOn(sim, a, cr, a.buried ? 1.2 : 0.3);
    },

    treant: function (sim, a, cr, think) {
      const st = sim.state;
      if (think) {
        if (a.cd > 0) a.cd -= THINK;
        const t = nearestUnit(sim, a, cr.sight, false, (u) => u.role === 'lumberjack' || (u.foe === a.id));
        if (t) { if (engage(sim, a, cr, t, cr.dmg) !== 'chase' && WW.Wild) WW.Wild.onTreantAngry(sim, a, t); }
        else {
          if (sim.rng.chance(0.15) && WW.Wild) WW.Wild.plantTree(sim, Math.floor(a.x + sim.rng.range(-2, 2)), Math.floor(a.y + sim.rng.range(-2, 2)));
          if (a.tx < 0 && sim.rng.chance(0.2)) wanderTarget(sim, a, cr, 5, true);
        }
      }
      moveOn(sim, a, cr, 1);
    },

    golem: function (sim, a, cr, think) {
      if (think) {
        if (a.cd > 0) a.cd -= THINK;
        const t = nearestUnit(sim, a, cr.sight, false);
        if (t) engage(sim, a, cr, t, cr.dmg);
        else if (a.tx < 0 && sim.rng.chance(0.15)) wanderTarget(sim, a, cr, 4, true);
      }
      moveOn(sim, a, cr, 1);
    }
  };

  // Feueratem des Drachen
  function breathe(sim, a, x, y) {
    const st = sim.state;
    x = Math.max(0, Math.min(st.W - 0.01, x)); y = Math.max(0, Math.min(st.H - 0.01, y));
    sim.fx({ type: 'firebreath', x: a.x, y: a.y - 0.6, x2: x, y2: y });
    a.cd = 24;
    WW.Powers.forDisc(sim, x, y, 1.6, (i, xx, yy) => { if (sim.rng.chance(0.6)) WW.Env.ignite(sim, xx, yy, 16); });
    WW.Units.forNear(sim, x, y, 1.8, false, (u) => WW.Units.hitUnit(sim, { id: a.id, kingdomId: -1 }, u, 14));
    WW.Units.forNear(sim, x, y, 1.6, true, (b) => { if (b !== a) hit(sim, b, 14, a); });
    for (const s of WW.Powers.structsIn(sim, x, y, 1.2)) if (s.type !== 'lair' && s.type !== 'ruin') WW.Structs.damage(sim, s, 30, null);
  }

  function updateAll(sim) {
    const st = sim.state, W = st.W;
    if (!st.fallout || !st.flora) WW.Env.ensureRasters(st);
    const cnt = sim._animalCount = {};
    for (const a of st.animals) if (!a.dead) cnt[a.kind] = (cnt[a.kind] || 0) + 1;
    const tick = st.tick;
    for (let n = 0; n < st.animals.length; n++) {
      const a = st.animals[n];
      if (a.dead) continue;
      const cr = WW.CREATURES[a.kind];
      if (!cr) { kill(sim, a, null); continue; }
      if (!(a.x >= 0 && a.y >= 0 && a.x < W && a.y < st.H)) { a.x = Math.max(0.5, Math.min(W - 0.5, a.x || 0.5)); a.y = Math.max(0.5, Math.min(st.H - 0.5, a.y || 0.5)); }
      // auf verbotener Kachel? (gemaltes Wasser, neue Mauer, Flut, Frost)
      const i = Math.floor(a.y) * W + Math.floor(a.x);
      if (!canEnter(sim, cr, i)) {
        const f = nearestFor(sim, cr, i, 3);
        if (f >= 0) { a.x = (f % W) + 0.5; a.y = Math.floor(f / W) + 0.5; a.tx = -1; }
        else { kill(sim, a, null); sim.fx({ type: 'splash', x: a.x, y: a.y }); continue; }
      }
      const think = ((tick + a.id) & 7) === 0;
      if (think && st.fallout[i] > 40 && cr.category === 'animal') { a.hp -= 1; if (a.hp <= 0) { kill(sim, a, null); continue; } }
      if (a.mad > tick) { if (think) { if (a.cd > 0) a.cd -= THINK; berserk(sim, a, cr); } moveOn(sim, a, cr, 1.3); continue; }
      const ai = WW.CreatureAI[cr.ai];
      if (ai) ai(sim, a, cr, think);
    }
  }

  function yearly(sim) {
    for (const a of sim.state.animals) {
      if (a.dead) continue;
      a.age++;
      const cr = WW.CREATURES[a.kind];
      const life = cr ? cr.life : 14;
      if (a.age > life && sim.rng.chance(0.4)) { a.noSplit = true; kill(sim, a, null); }
    }
  }

  // Anfangsbestand: alles übernimmt WW.Wild.populate (Tiere nach Biom, Orte, Biom-Monster)
  function populate(sim) {
    if (WW.Wild) WW.Wild.populate(sim);
  }

  WW.Creatures = {
    spawn: spawn, kill: kill, hit: hit, attack: attack, updateAll: updateAll, yearly: yearly, populate: populate,
    canEnter: canEnter, canEnterMv: canEnterMv, canStand: canStand, nearestFor: nearestFor, maxAnimals: maxAnimals,
    habitatOk: habitatOk, breathe: breathe
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
