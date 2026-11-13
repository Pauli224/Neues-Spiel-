// Einheiten: Anlegen, Bewegung entlang von Pfaden, gestaffelte KI je Beruf, Kampf, Tod.
(function (WW) { 'use strict';

  const CELL = 8;
  const THINK = 8;   // jede Einheit denkt alle 8 Ticks

  function C() { return WW.CONFIG; }

  // --------------------------------------------------------------------------
  // Anlegen, Rolle, Tod
  // --------------------------------------------------------------------------
  function baseHp(role, race) {
    const cfg = C();
    let hp = role === 'child' ? cfg.CHILD_HP : (role === 'soldier' ? cfg.SOLDIER_HP : (role === 'leader' ? cfg.LEADER_HP : cfg.BASE_HP));
    return Math.round(hp * race.hp);
  }

  function create(sim, o) {
    const st = sim.state;
    if (st.units.length >= C().MAX_UNITS) return null;
    if (!WW.SimUtil.isNum(o.x) || !WW.SimUtil.isNum(o.y)) return null;
    const race = WW.RACES[o.race] || WW.RACES.human;
    const female = o.female != null ? !!o.female : sim.rng.chance(0.5);
    const role = o.role || 'farmer';
    const hp = baseHp(role, race);
    const u = {
      id: st.nextId++, x: o.x, y: o.y, dir: sim.rng.chance(0.5) ? 1 : -1, role: role,
      kingdomId: o.kingdomId == null ? -1 : o.kingdomId, cityId: o.cityId == null ? -1 : o.cityId,
      race: race.key, age: o.age != null ? o.age : C().ADULT_AGE + sim.rng.int(20),
      life: Math.round((C().LIFESPAN + sim.rng.range(-14, 14)) * race.lifespan),
      hp: hp, maxHp: hp, moving: false, carrying: null, carryAmt: 0, female: female, bubble: null, sick: false,
      name: o.name || WW.Names.person(sim.rng, race.key, female),
      path: null, pi: 0, goal: -1, task: null, phase: 0, tt: 0, target: -1, fails: 0, cd: 0,
      foe: -1, order: null, breach: -1, merc: false, group: -1, site: -1, wait: 0, wtry: 0
    };
    st.units.push(u);
    sim._units.set(u.id, u);
    return u;
  }

  function resetTask(u) {
    u.path = null; u.pi = 0; u.goal = -1; u.task = null; u.phase = 0; u.tt = 0; u.target = -1; u.fails = 0;
    u.breach = -1; u.wait = 0;
  }

  function setRole(sim, u, role) {
    if (!u || u.dead) return;
    const race = WW.RACES[u.race] || WW.RACES.human;
    const frac = u.maxHp > 0 ? u.hp / u.maxHp : 1;
    u.role = role;
    u.maxHp = baseHp(role, race);
    if (role === 'soldier') u.maxHp = Math.round(u.maxHp * gov(sim, u).unitHpMul);
    u.hp = Math.max(1, Math.round(u.maxHp * frac));
    if (u.carrying && u.cityId >= 0) {
      const c = sim._cities.get(u.cityId);
      if (c) WW.Cities.addStock(sim, c, u.carrying, u.carryAmt * 0.5);
    }
    u.carrying = null; u.carryAmt = 0; u.order = null; u.foe = -1;
    resetTask(u);
  }

  function kill(sim, u, cause) {
    if (!u || u.dead) return;
    u.dead = true; u.hp = 0; u.moving = false;
    sim._unitsDirty = true;
    const dc = sim._deaths || (sim._deaths = {});
    dc[cause] = (dc[cause] || 0) + 1;
    sim.fx({ type: cause === 'drown' ? 'splash' : 'poof', x: u.x, y: u.y });
    const k = sim._kingdoms.get(u.kingdomId);
    if (k && k.leaderId === u.id) WW.Gov.onLeaderDeath(sim, k, u, cause);
  }

  // --------------------------------------------------------------------------
  // Raster-Buckets für die Nachbarschaftssuche
  // --------------------------------------------------------------------------
  function buildBuckets(sim) {
    const st = sim.state;
    const bw = Math.ceil(st.W / CELL), bh = Math.ceil(st.H / CELL);
    if (!sim._buckets || sim._bw !== bw || sim._bh !== bh) {
      sim._bw = bw; sim._bh = bh;
      sim._buckets = []; sim._abuckets = [];
      for (let i = 0; i < bw * bh; i++) { sim._buckets.push([]); sim._abuckets.push([]); }
    }
    const B = sim._buckets, A = sim._abuckets;
    for (let i = 0; i < B.length; i++) { B[i].length = 0; A[i].length = 0; }
    for (const u of st.units) {
      if (u.dead) continue;
      const cx = Math.min(bw - 1, Math.max(0, (u.x / CELL) | 0)), cy = Math.min(bh - 1, Math.max(0, (u.y / CELL) | 0));
      B[cy * bw + cx].push(u);
    }
    for (const a of st.animals) {
      if (a.dead) continue;
      const cx = Math.min(bw - 1, Math.max(0, (a.x / CELL) | 0)), cy = Math.min(bh - 1, Math.max(0, (a.y / CELL) | 0));
      A[cy * bw + cx].push(a);
    }
  }

  // Ruft fn(v) für Einheiten (oder Tiere) im Umkreis r auf
  function forNear(sim, x, y, r, animals, fn) {
    const bw = sim._bw, bh = sim._bh;
    const B = animals ? sim._abuckets : sim._buckets;
    const x0 = Math.max(0, ((x - r) / CELL) | 0), x1 = Math.min(bw - 1, ((x + r) / CELL) | 0);
    const y0 = Math.max(0, ((y - r) / CELL) | 0), y1 = Math.min(bh - 1, ((y + r) / CELL) | 0);
    const r2 = r * r;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const arr = B[cy * bw + cx];
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v.dead) continue;
        const dx = v.x - x, dy = v.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) { if (fn(v, d2) === false) return; }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Feindschaft und Kampf
  // --------------------------------------------------------------------------
  function isFighterRole(r) { return r === 'soldier' || r === 'rebel' || r === 'leader'; }

  function hostile(sim, a, b) {
    if (a === b || a.dead || b.dead) return false;
    if (a.kingdomId === b.kingdomId) {
      const ar = a.role === 'rebel', br = b.role === 'rebel';
      if (ar === br) return false;
      if (ar) return b.role === 'soldier' || b.role === 'leader';
      return a.role === 'soldier' || a.role === 'leader';
    }
    if (a.role === 'settler' || b.role === 'settler') return false;
    return WW.Path.hostileKingdoms(sim, a.kingdomId, b.kingdomId);
  }

  function gov(sim, u) {
    const k = sim._kingdoms.get(u.kingdomId);
    return WW.GOVERNMENTS[(k && k.gov) || 'tribe'];
  }

  function damageOf(sim, u) {
    const race = WW.RACES[u.race] || WW.RACES.human;
    let d = u.role === 'soldier' ? C().SOLDIER_DMG : (u.role === 'rebel' ? 6 : C().BASE_DMG);
    if (u.merc) d *= 1.2;
    if (u.role === 'soldier') d *= gov(sim, u).unitDmgMul;
    if (u.role === 'child') d = 1;
    return d * race.strength;
  }

  function hitUnit(sim, att, t, dmg) {
    t.hp -= dmg;
    if (t.foe < 0 && att.id != null) t.foe = att.id;
    if (t.hp <= 0) {
      WW.Diplo.onCasualty(sim, att.kingdomId, t.kingdomId);
      kill(sim, t, 'battle');
    }
  }

  function findFoe(sim, u, r) {
    let best = null, bd = 1e9;
    forNear(sim, u.x, u.y, r, false, (v, d2) => {
      if (!hostile(sim, u, v)) return;
      const w = d2 + (isFighterRole(v.role) ? 0 : 6);
      if (w < bd) { bd = w; best = v; }
    });
    forNear(sim, u.x, u.y, Math.min(r, 6), true, (a, d2) => {
      const cr = WW.CREATURES[a.kind];
      if (!cr || !cr.hostile) return;
      if (d2 + 2 < bd) { bd = d2 + 2; best = a; }
    });
    return best;
  }

  function entity(sim, id) { return sim._units.get(id) || sim._animals.get(id) || null; }

  // Kampf-Schritt; true = Einheit ist beschäftigt
  function combat(sim, u, searchR) {
    let t = u.foe >= 0 ? entity(sim, u.foe) : null;
    if (t && (t.dead || (t.role !== undefined && !hostile(sim, u, t)))) t = null;
    if (t) { const dx = t.x - u.x, dy = t.y - u.y; if (dx * dx + dy * dy > 144) t = null; }
    if (!t && searchR > 0) t = findFoe(sim, u, searchR);
    if (!t) { u.foe = -1; return false; }
    if (u.foe !== t.id) { u.foe = t.id; if (sim.rng.chance(0.3)) bubble(u, 'exclaim', 25); }
    const race = WW.RACES[u.race] || WW.RACES.human;
    const ranged = race.ranged && u.role === 'soldier';
    const range = ranged ? 3.4 : 1.3;
    const dx = t.x - u.x, dy = t.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(dx) > 0.05) u.dir = dx < 0 ? -1 : 1;
    if (d <= range) {
      u.path = null; u.moving = false;
      if (u.cd <= 0) {
        const dmg = damageOf(sim, u);
        if (ranged) sim.fx({ type: 'arrow', x: u.x, y: u.y - 0.3, x2: t.x, y2: t.y - 0.3 });
        if (t.role !== undefined) hitUnit(sim, u, t, dmg);
        else WW.Creatures.hit(sim, t, dmg, u);
        u.cd = 8;
      }
      return true;
    }
    const W = sim.state.W;
    const goal = Math.floor(t.y) * W + Math.floor(t.x);
    if (!u.path || Math.abs((u.goal % W) - Math.floor(t.x)) + Math.abs(Math.floor(u.goal / W) - Math.floor(t.y)) > 2) {
      const r = goTo(sim, u, goal, { limit: 500 });
      if (r === null) { u.foe = -1; return false; }
    }
    return true;
  }

  // --------------------------------------------------------------------------
  // Bewegung
  // --------------------------------------------------------------------------
  // Pfad zu Kachel goal anfordern. true = Pfad gesetzt/angekommen, null = kein Weg, false = später nochmal
  function goTo(sim, u, goal, o) {
    const W = sim.state.W;
    const cur = Math.floor(u.y) * W + Math.floor(u.x);
    if (cur === goal) { u.path = null; u.goal = goal; return true; }
    if (u.path && u.goal === goal && u.pi < u.path.length) return true;
    const p = WW.Path.find(sim, cur, goal, {
      k: u.kingdomId, race: u.race, breach: !!(o && o.breach), limit: (o && o.limit) || C().PATH_LIMIT
    });
    if (p === false) return false;
    if (p === null) {
      u.fails++; u.path = null;
      if (u.fails >= 2 && sim.rng.chance(0.3)) bubble(u, 'question', 30);
      return null;
    }
    u.path = p; u.pi = 0; u.goal = goal; u.fails = 0;
    return true;
  }

  function arrived(sim, u, goal) {
    const W = sim.state.W;
    if (u.path) return false;
    return Math.floor(u.y) * W + Math.floor(u.x) === goal;
  }
  function nearRect(u, s, r) {
    const dx = Math.max(s.x - u.x, 0, u.x - (s.x + s.w)), dy = Math.max(s.y - u.y, 0, u.y - (s.y + s.h));
    return dx * dx + dy * dy <= r * r;
  }
  function distTo(u, x, y) { const dx = x - u.x, dy = y - u.y; return Math.sqrt(dx * dx + dy * dy); }

  function rescue(sim, u) {
    const st = sim.state, W = st.W;
    const i = Math.floor(u.y) * W + Math.floor(u.x);
    const n = WW.Path.nearestFree(sim, i, u.kingdomId, 4);
    if (n >= 0) { u.x = (n % W) + 0.5; u.y = Math.floor(n / W) + 0.5; u.path = null; return; }
    if (WW.TERRAIN[st.terrain[i]].water || WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0) { kill(sim, u, 'drown'); return; }
    const m = WW.Path.nearestFree(sim, i, u.kingdomId, 16);
    if (m >= 0) { u.x = (m % W) + 0.5; u.y = Math.floor(m / W) + 0.5; u.path = null; }
    else kill(sim, u, 'stuck');
  }

  function move(sim, u) {
    const st = sim.state, W = st.W;
    const tx0 = Math.floor(u.x), ty0 = Math.floor(u.y);
    if (tx0 < 0 || ty0 < 0 || tx0 >= W || ty0 >= st.H) { u.x = WW.SimUtil.clamp(u.x, 0.5, W - 0.5); u.y = WW.SimUtil.clamp(u.y, 0.5, st.H - 0.5); }
    const cur = Math.floor(u.y) * W + Math.floor(u.x);
    const t = st.terrain[cur];
    if (WW.TERRAIN_LUT.walk[t] <= 0 || sim.block[cur] === 1 || (sim.block[cur] === 2 && !WW.Path.passable(sim, cur, u.kingdomId))) {
      rescue(sim, u);
      if (u.dead) return;
    }
    if (!u.path || u.pi >= u.path.length || u.breach >= 0) { u.moving = false; if (u.path && u.pi >= u.path.length) u.path = null; return; }
    const n = u.path[u.pi];
    const nx = n % W, ny = (n - nx) / W;
    if (n !== cur) {
      let ok = WW.Path.passable(sim, n, u.kingdomId);
      const cx = cur % W, cy = (cur - cx) / W;
      if (ok && nx !== cx && ny !== cy) {
        // Diagonale: kein Durchschlüpfen zwischen Sperrkacheln
        ok = WW.Path.passable(sim, cy * W + nx, u.kingdomId) && WW.Path.passable(sim, ny * W + cx, u.kingdomId);
        if (!ok && u.order && u.order.kind === 'march') { u.path = null; u.moving = false; return; }
      }
      if (!ok) {
        if (u.order && u.order.kind === 'march') {
          const s = sim._structs.get(st.structAt[n]);
          if (s && WW.Structs.isWallish(s) && s.built) {
            const c = sim._cities.get(s.cityId);
            if (c && WW.Path.hostileKingdoms(sim, u.kingdomId, c.kingdomId)) { u.breach = s.id; u.moving = false; return; }
          }
        }
        u.path = null; u.moving = false;
        return;
      }
    }
    const race = WW.RACES[u.race] || WW.RACES.human;
    const tab = sim._tables[race.key] || sim._tables.human;
    let spd = C().UNIT_SPEED * race.speed * Math.max(0.3, tab.speed[t]);
    if (u.role === 'child') spd *= 0.85;
    else if (u.role === 'soldier' || u.role === 'settler' || u.role === 'trader') spd *= 1.1;
    if (u.sick) spd *= 0.7;
    const tx = nx + 0.5, ty = ny + 0.5;
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(dx) > 0.02) u.dir = dx < 0 ? -1 : 1;
    u.moving = true;
    if (d <= spd) {
      u.x = tx; u.y = ty; u.pi++;
      if (u.pi >= u.path.length) { u.path = null; u.moving = false; }
    } else {
      u.x += dx / d * spd; u.y += dy / d * spd;
    }
  }

  // --------------------------------------------------------------------------
  // Hilfen für die Berufe
  // --------------------------------------------------------------------------
  function bubble(u, icon, ttl) { u.bubble = { icon: icon, ttl: ttl || 30 }; }

  function homeCity(sim, u) { return sim._cities.get(u.cityId) || null; }

  function workMul(sim, u) {
    const g = gov(sim, u);
    const k = sim._kingdoms.get(u.kingdomId);
    let m = g.workMul;
    if (k && k.policy && k.policy.bonus === 'nap') m *= 0.95;
    if (u.sick) m *= 0.6;
    return m;
  }

  // zufällige begehbare Kachel nahe dem Zentrum (innerhalb der Mauer, wenn vorhanden)
  function wanderTile(sim, u, city, r) {
    const st = sim.state, W = st.W, H = st.H;
    const px = city ? city.cx + 0.5 : Math.floor(u.x), py = city ? city.cy + 0.5 : Math.floor(u.y);
    for (let n = 0; n < 8; n++) {
      const x = Math.floor(px + sim.rng.range(-r, r)), y = Math.floor(py + sim.rng.range(-r, r));
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (!WW.Path.passable(sim, i, u.kingdomId)) continue;
      if (city && city.wall.plan && city.wall.state !== 'none' && st.inRing[i] !== city.id) continue;
      return i;
    }
    return -1;
  }

  function moodBubble(sim, u, city) {
    if (!sim.rng.chance(0.06)) return;
    let icon;
    const k = sim._kingdoms.get(u.kingdomId);
    if (u.sick) icon = 'skull';
    else if (city && city.hungry) icon = 'bread';
    else if (city && city.happiness < 25) icon = 'angry';
    else if (u.role === 'leader') icon = 'crown';
    else if (k && k.policy && k.policy.bonus === 'nap' && sim.rng.chance(0.5)) icon = 'zzz';
    else if (k && k.gov === 'democracy' && k.nextElection - sim.state.year <= 1 && sim.rng.chance(0.5)) icon = 'ballot';
    else if (city && city.happiness > 70) icon = sim.rng.chance(0.5) ? 'heart' : 'note';
    else icon = sim.rng.pick(['note', 'zzz', 'question', 'heart']);
    bubble(u, icon, 35);
  }

  function wander(sim, u, city, r) {
    if (u.path) return;
    if (u.wait > 0) return;
    const i = wanderTile(sim, u, city, r || 4);
    if (i >= 0) goTo(sim, u, i, { limit: 300 });
    u.wait = 10 + sim.rng.int(50);
    moodBubble(sim, u, city);
  }

  function deliver(sim, u, city) {
    // Abladestelle: Hütte/Steinbruch der Stadt, sonst Zentrum
    const W = sim.state.W;
    let goal = WW.Cities.centerTile(sim, city, u.id);
    let bd = distTo(u, city.cx + 0.5, city.cy + 0.5);
    const want = u.carrying === 'wood' ? 'lumber' : (u.carrying === 'stone' ? 'quarry' : null);
    if (want) for (const id of city.drops) {
      const s = sim._structs.get(id);
      if (!s || s.type !== want) continue;
      const d = distTo(u, s.x + 0.5, s.y + 0.5);
      if (d < bd) { bd = d; goal = s.y * W + s.x; }
    }
    // Ernte wird am Stadttor angenommen (Karren bringen sie hinein)
    if (u.carrying === 'food' && city.wall.level >= 1 && city.wall.gates) for (const t of city.wall.gates) {
      const s = sim._structs.get(sim.state.structAt[t]);
      if (!s || s.type !== 'gate' || !s.built || s.cityId !== city.id) continue;
      const d = distTo(u, s.x + 0.5, s.y + 0.5) + 1.5;
      if (d < bd) { bd = d; goal = t; }
    }
    if (arrived(sim, u, goal) || (bd < 1.2 && !u.path)) {
      WW.Cities.addStock(sim, city, u.carrying, u.carryAmt);
      if (u.carrying === 'food' && sim.rng.chance(0.25)) bubble(u, 'bread', 25);
      u.carrying = null; u.carryAmt = 0; u.phase = 0; u.target = -1;
      return;
    }
    const r = goTo(sim, u, goal, { limit: 1500 });
    if (r === null && u.fails > 3) {
      // Weg versperrt: Ware gilt als abgeliefert, um Festhängen zu vermeiden
      WW.Cities.addStock(sim, city, u.carrying, u.carryAmt * 0.5);
      u.carrying = null; u.carryAmt = 0; u.phase = 0; u.fails = 0;
    }
  }

  // Rohstoffkachel nahe der Stadt suchen (Holz, Stein, Wasser)
  function findResource(sim, u, city, res, maxR) {
    const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
    const px = city.cx, py = city.cy;
    const cand = [];
    for (let r = 2; r <= maxR && cand.length < 6; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = px + dx, y = py + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = y * W + x;
        const t = st.terrain[i];
        if (!LUT[res][t]) continue;
        const ring = st.inRing[i];
        if (ring !== -1 && ring !== city.id) continue;
        const o = st.owner[i];
        if (o !== -1 && o !== city.id) { const oc = sim._cities.get(o); if (oc && oc.kingdomId !== city.kingdomId) continue; }
        cand.push(i);
      }
    }
    if (!cand.length) return -1;
    return cand[sim.rng.int(cand.length)];
  }

  // --------------------------------------------------------------------------
  // Berufe
  // --------------------------------------------------------------------------
  function thinkFarmer(sim, u, city) {
    const st = sim.state, W = st.W;
    if (u.carrying && u.phase !== 1 && u.phase !== 2) { deliver(sim, u, city); return; }
    const race = WW.RACES[u.race] || WW.RACES.human;
    if (u.phase === 0) {
      // reifes Feld mit wenigen Helfern, sonst pflegen
      let best = null, bs = 1e9;
      for (const id of city.fields) {
        const f = sim._structs.get(id);
        if (!f || f.dead) continue;
        const d = distTo(u, f.x + 0.5, f.y + 0.5) + (f.growth >= 3 ? 0 : 12 + f.growth * 2) + f.workers * 6;
        if (d < bs) { bs = d; best = f; }
      }
      if (race.fishing && city.hasWater && (!best || best.growth < 3) && sim.rng.chance(0.6)) {
        const i = findResource(sim, u, city, 'water', 9);
        if (i >= 0) {
          const g = WW.Path.approachTile(sim, i, u.kingdomId, Math.floor(u.y) * W + Math.floor(u.x));
          if (g >= 0) { u.task = 'fish'; u.target = -1; u.goal = -1; u.tt = g; u.phase = 1; return; }
        }
      }
      if (!best) { wander(sim, u, city, 4); return; }
      u.task = 'farm'; u.target = best.id; u.phase = 1; best.workers++;
      return;
    }
    if (u.phase === 1) {
      let goal;
      if (u.task === 'fish') goal = u.tt;
      else {
        const f = sim._structs.get(u.target);
        if (!f || f.dead) { u.phase = 0; u.target = -1; return; }
        goal = f.y * W + f.x;
      }
      if (arrived(sim, u, goal)) { u.phase = 2; u.tt = u.carrying ? 16 : 28; return; }
      const r = goTo(sim, u, goal, { limit: 1200 });
      if (r === null && u.fails > 2) { u.phase = 0; u.target = -1; u.fails = 0; u.wait = 20; }
      return;
    }
    if (u.phase === 2) {
      u.tt -= THINK * workMul(sim, u);
      if (u.tt > 0) return;
      const k = sim._kingdoms.get(u.kingdomId);
      let mul = race.yields.food;
      if (k && k.policy && k.policy.bonus === 'bread') mul *= 1.25;
      if (k && k.policy && k.policy.plan && k.policy.plan.focus === 'food') mul *= 1.5;
      if (u.task === 'fish') {
        u.carrying = 'food'; u.carryAmt = C().FISH * mul; u.phase = 3;
        return;
      }
      const f = sim._structs.get(u.target);
      if (!f || f.dead) { u.phase = 0; return; }
      if (f.growth >= 3) {
        const fert = Math.max(0.2, WW.TERRAIN_LUT.fertile[st.terrain[f.y * W + f.x]]);
        u.carrying = 'food'; u.carryAmt = (u.carryAmt || 0) + C().HARVEST * fert * mul;
        f.growth = 0; f.gprog = 0; sim.markDirty(f.y * W + f.x);
        u.phase = 3;
        // Nachbarfeld gleich mit abernten (bis zu drei Felder pro Gang)
        if (u.carryAmt < C().HARVEST * 2.5) {
          let nf = null, nd = 7;
          for (const id of city.fields) {
            const g = sim._structs.get(id);
            if (!g || g.dead || g === f || g.growth < 3 || g.workers > 0) continue;
            const d = (g.x - f.x) * (g.x - f.x) + (g.y - f.y) * (g.y - f.y);
            if (d < nd) { nd = d; nf = g; }
          }
          if (nf) { u.target = nf.id; u.phase = 1; nf.workers++; }
        }
      } else {
        f.gprog += 0.5;
        u.phase = 0; u.target = -1;
      }
    }
  }

  function thinkGatherer(sim, u, city, res) {
    const st = sim.state, W = st.W;
    if (u.carrying) { deliver(sim, u, city); return; }
    const race = WW.RACES[u.race] || WW.RACES.human;
    if (u.phase === 0) {
      const i = findResource(sim, u, city, res, 13);
      if (i < 0) { wander(sim, u, city, 4); return; }
      const g = WW.Path.approachTile(sim, i, u.kingdomId, Math.floor(u.y) * W + Math.floor(u.x));
      if (g < 0) { wander(sim, u, city, 4); return; }
      u.target = i; u.tt = g; u.phase = 1; u.task = res;
      return;
    }
    if (u.phase === 1) {
      if (!WW.TERRAIN_LUT[res][st.terrain[u.target]]) { u.phase = 0; return; }
      if (arrived(sim, u, u.tt)) { u.phase = 2; u.tt = res === 'wood' ? 40 : 52; return; }
      const r = goTo(sim, u, u.tt, { limit: 1500 });
      if (r === null && u.fails > 2) {
        u.phase = 0; u.fails = 0; u.wait = 16;
      }
      return;
    }
    if (u.phase === 2) {
      u.tt -= THINK * workMul(sim, u);
      if (u.tt > 0) return;
      const k = sim._kingdoms.get(u.kingdomId);
      const plan = k && k.policy && k.policy.plan;
      if (res === 'wood') {
        u.carrying = 'wood'; u.carryAmt = C().CHOP * race.yields.wood * (plan && plan.focus === 'wood' ? 1.5 : 1);
        if (!race.noDeforest && sim.rng.chance(0.2)) {
          const t = st.terrain[u.target], nt = WW.Walls.deforested(t);
          if (nt !== t) { st.terrain[u.target] = nt; sim.markDirty(u.target); }
        }
      } else {
        u.carrying = 'stone'; u.carryAmt = C().MINE * race.yields.stone * (plan && plan.focus === 'stone' ? 1.5 : 1);
      }
      if (sim.rng.chance(0.15)) bubble(u, 'hammer', 20);
      u.phase = 3;
    }
  }

  function siteScore(sim, u, s) {
    let pr = 0;
    if (s.type === 'center') pr = -40;
    else if (s.built && s.restyle && !s.upgradeTo) pr = 6;
    else if (s.type === 'house') pr = -6;
    else if (WW.Structs.isWallish(s)) pr = s.built ? 4 : 0;
    else pr = -2;
    return distTo(u, s.x + 0.5, s.y + 0.5) + s.workers * 5 + pr;
  }

  function thinkBuilder(sim, u, city) {
    const st = sim.state, W = st.W;
    if (u.carrying) { deliver(sim, u, city); return; }
    let s = u.target >= 0 ? sim._structs.get(u.target) : null;
    if (s && (s.dead || s.cityId !== city.id || !WW.Structs.needsWork(s))) { s = null; u.target = -1; u.phase = 0; }
    if (!s) {
      let best = null, bs = 1e9;
      const sk = WW.Cities.stock(sim, city);
      for (const id of city.sites) {
        const c = sim._structs.get(id);
        if (!c || c.dead || !WW.Structs.needsWork(c)) continue;
        if (c.skipUntil && c.skipUntil > st.tick) continue;
        if (!c.paid) {
          const cost = WW.Structs.costFor(sim, c.type, c.upgradeTo || c.level, city.id);
          if (sk.wood < cost.wood || sk.stone < cost.stone || sk.gold < cost.gold) continue;
        }
        const sc = siteScore(sim, u, c);
        if (sc < bs) { bs = sc; best = c; }
      }
      if (!best) {
        // nichts zu bauen: Holz holen hilft immer
        if (city.hasWood) { u.task = 'helpwood'; thinkGatherer(sim, u, city, 'wood'); }
        else wander(sim, u, city, 4);
        return;
      }
      if (!best.paid) {
        const cost = WW.Structs.costFor(sim, best.type, best.upgradeTo || best.level, city.id);
        if (!WW.Cities.pay(sim, city, cost)) return;
        best.paid = true;
      }
      if (u.task === 'helpwood') { u.phase = 0; }
      s = best; u.target = s.id; u.task = 'build'; u.phase = 1; u.wtry = 0; s.workers++;
    }
    if (!nearRect(u, s, 1.0)) {
      if (!u.path) {
        const cur = Math.floor(u.y) * W + Math.floor(u.x);
        // Arbeitspunkte: Grundfläche und alle Nachbarkacheln (auch diagonal), nach Entfernung
        const cand = [];
        for (let dy = -1; dy <= s.h; dy++) for (let dx = -1; dx <= s.w; dx++) {
          const x = s.x + dx, y = s.y + dy;
          if (x < 0 || y < 0 || x >= W || y >= st.H) continue;
          const i = y * W + x;
          if (!WW.Path.passable(sim, i, u.kingdomId)) continue;
          const inner = dx >= 0 && dy >= 0 && dx < s.w && dy < s.h;
          const dd = (x + 0.5 - u.x) * (x + 0.5 - u.x) + (y + 0.5 - u.y) * (y + 0.5 - u.y) + (inner ? 0 : 2) + ((i + u.id) % 3) * 0.3;
          cand.push([dd, i]);
        }
        cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const drop = (skip) => { if (skip) s.skipUntil = st.tick + 400; u.target = -1; u.phase = 0; u.fails = 0; u.wtry = 0; u.wait = 24; };
        if (!cand.length) { drop(true); return; }
        const tries = u.wtry || 0;
        if (tries >= Math.min(cand.length, 5)) { drop(true); return; }
        const goal = cand[tries][1];
        const r = goTo(sim, u, goal, { limit: 1500 });
        if (r === null) u.wtry = tries + 1;
        else if (r === true && !u.path) u.wtry = tries + 1;
      }
      return;
    }
    u.path = null; u.tt = 0;
    const k = sim._kingdoms.get(u.kingdomId);
    const g = gov(sim, u);
    let rate = workMul(sim, u) * g.buildMul;
    if (WW.Structs.isWallish(s)) { rate *= g.wallSpeedMul; if (k && k.policy && k.policy.bonus === 'walls') rate *= 1.3; }
    if (k && k.policy && k.policy.plan && k.policy.plan.focus === 'build') rate *= 1.5;
    const work = WW.Structs.info(s.type).work * (s.upgradeTo ? 1.2 : (s.built && s.restyle ? 0.5 : 1));
    s.progress = Math.min(1, s.progress + THINK * rate / work);
    if (!s.built) s.hp = Math.max(s.hp, Math.round(s.maxHp * s.progress));
    if (sim.rng.chance(0.08)) bubble(u, 'hammer', 18);
    if (s.progress >= 1) {
      WW.Structs.complete(sim, s);
      u.target = -1; u.phase = 0;
    }
  }

  function thinkSoldier(sim, u, city) {
    if (u.order && u.order.kind === 'march') { march(sim, u); return; }
    if (u.order && u.order.kind === 'home') {
      if (distTo(u, city.cx + 0.5, city.cy + 0.5) < 7) { u.order = null; u.path = null; return; }
      const r = goTo(sim, u, WW.Cities.centerTile(sim, city, u.id), { limit: C().PATH_LIMIT_LONG });
      if (r === null && u.fails > 3) { u.order = null; u.fails = 0; }
      return;
    }
    // Patrouille: Mauer, Tore oder Zentrum
    if (u.path || u.wait > 0) return;
    const st = sim.state, W = st.W;
    let goal = -1;
    if (city.wall.plan && city.wall.plan.length && sim.rng.chance(0.6)) {
      const t = city.wall.plan[sim.rng.int(city.wall.plan.length)];
      goal = WW.Path.approachTile(sim, t, u.kingdomId, city.cy * W + city.cx);
      if (goal >= 0 && st.inRing[goal] !== city.id) goal = -1;
    }
    if (goal < 0) goal = wanderTile(sim, u, city, 5);
    if (goal >= 0) goTo(sim, u, goal, { limit: 600 });
    u.wait = 30 + sim.rng.int(60);
    moodBubble(sim, u, city);
  }

  function march(sim, u) {
    const st = sim.state, W = st.W;
    const o = u.order;
    const city = sim._cities.get(o.city);
    if (!city || city.kingdomId !== o.k || !WW.Path.hostileKingdoms(sim, u.kingdomId, o.k)) { u.order = null; u.path = null; u.breach = -1; return; }
    if (u.breach >= 0) {
      const s = sim._structs.get(u.breach);
      if (s && !s.dead && s.built && WW.Structs.isWallish(s)) {
        if (distTo(u, s.x + 0.5, s.y + 0.5) <= 1.7) {
          // höchstens drei Angreifer schlagen gleichzeitig auf ein Mauerstück ein
          const win = sim.state.tick >> 3;
          if (s.siegeT !== win) { s.siegeT = win; s.siegeN = 0; }
          if (u.cd <= 0 && s.siegeN < 3) {
            s.siegeN++;
            if (WW.Structs.damage(sim, s, damageOf(sim, u) * (s.level >= 3 ? 0.22 : (s.level === 2 ? 0.4 : 0.8)), 'hit')) {
              const wc = sim._cities.get(s.cityId), ak = sim._kingdoms.get(u.kingdomId);
              if (wc && ak && wc.lastBreach !== sim.state.year) { wc.lastBreach = sim.state.year; sim.event('wallBreach', { city: wc.name, other: ak.name }, WW.Cities.atCity(wc)); }
            }
            u.cd = 6; if (sim.rng.chance(0.1)) bubble(u, 'angry', 20);
          }
          if (s.built) return;
        }
      }
      u.breach = -1; u.path = null;
    }
    const ctr = sim._structs.get(city.centerId);
    const d = distTo(u, city.cx + 0.5, city.cy + 0.5);
    // Stamm: Raubzug statt Eroberung (erobert nur selten)
    const ag = gov(sim, u);
    if (ag.war === 'raid' && d <= 3.5 && !(ctr && !ctr.built && sim.rng.chance(0.25))) { WW.Diplo.plunder(sim, city, u); return; }
    if (d <= 2.8) {
      if (ctr && ctr.built) {
        if (u.cd <= 0) { WW.Structs.damage(sim, ctr, damageOf(sim, u), 'hit'); u.cd = 6; }
        if (!ctr.built) WW.Diplo.tryCapture(sim, city, u.kingdomId);
      } else WW.Diplo.tryCapture(sim, city, u.kingdomId);
      return;
    }
    const goal = WW.Cities.centerTile(sim, city, u.id);
    const r = goTo(sim, u, goal, { breach: true, limit: C().PATH_LIMIT_LONG });
    if (r === null && u.fails > 3) { u.order = null; u.fails = 0; }
  }

  function thinkRebel(sim, u, city) {
    if (!city.revolt) { setRole(sim, u, 'farmer'); return; }
    const st = sim.state, W = st.W;
    const ctr = sim._structs.get(city.centerId);
    if (!ctr) { WW.Diplo.revoltSuccess(sim, city); return; }
    const d = distTo(u, city.cx + 0.5, city.cy + 0.5);
    if (d <= 2.8) {
      if (ctr.built && u.cd <= 0) { WW.Structs.damage(sim, ctr, damageOf(sim, u) * 0.6, 'hit'); u.cd = 8; }
      if (sim.rng.chance(0.03)) {
        // zündeln
        const x = city.cx + sim.rng.irange(-4, 4), y = city.cy + sim.rng.irange(-4, 4);
        WW.Env.ignite(sim, x, y);
      }
      if (!ctr.built) WW.Diplo.revoltSuccess(sim, city);
      return;
    }
    goTo(sim, u, WW.Cities.centerTile(sim, city, u.id), { limit: 1500 });
    if (sim.rng.chance(0.1)) bubble(u, 'angry', 25);
  }

  function thinkTrader(sim, u, city) {
    const st = sim.state;
    const k = sim._kingdoms.get(u.kingdomId);
    if (!k) return;
    if (u.target < 0 || !sim._cities.get(u.target)) {
      const others = [];
      for (const id of k.cityIds) if (id !== city.id) others.push(id);
      for (const oid in k.relations) {
        if (k.relations[oid].status !== 'alliance') continue;
        const ok = sim._kingdoms.get(+oid);
        if (ok) for (const id of ok.cityIds) others.push(id);
      }
      if (!others.length) { wander(sim, u, city, 6); return; }
      u.target = others[sim.rng.int(others.length)]; u.phase = 0;
    }
    const dest = u.phase === 0 ? sim._cities.get(u.target) : city;
    if (!dest) { u.target = -1; return; }
    const goal = WW.Cities.centerTile(sim, dest, u.id);
    if (arrived(sim, u, goal) || distTo(u, dest.cx + 0.5, dest.cy + 0.5) < 1.5) {
      const g = WW.GOVERNMENTS[k.gov];
      const amt = 2.5 * Math.max(0.5, g.goldMul);
      WW.Cities.addStock(sim, dest, 'gold', amt);
      bubble(u, 'note', 30);
      if (u.phase === 0) u.phase = 1; else { u.phase = 0; u.target = -1; }
      u.wait = 20;
      return;
    }
    const r = goTo(sim, u, goal, { limit: C().PATH_LIMIT_LONG });
    if (r === null && u.fails > 2) { u.target = -1; u.fails = 0; u.wait = 60; }
  }

  function thinkSettler(sim, u) {
    const st = sim.state, W = st.W;
    const k = sim._kingdoms.get(u.kingdomId);
    const home = homeCity(sim, u);
    const giveUp = () => {
      const grp = u.group;
      for (const v of st.units) if (!v.dead && grp >= 0 && v.group === grp && v.role === 'settler') {
        v.group = -1; v.site = -1;
        if (sim._cities.get(v.cityId)) setRole(sim, v, 'farmer');
      }
    };
    if (u.site < 0 || !k) { if (home) setRole(sim, u, 'farmer'); return; }
    const sx = u.site % W, sy = Math.floor(u.site / W);
    if (distTo(u, sx + 0.5, sy + 0.5) <= 2) {
      const md = WW.CONFIG.CITY_MIN_DIST - 4;
      let x = sx, y = sy, ok = WW.Cities.canFoundAt(sim, x, y, u.race, md);
      for (let r = 1; r <= 3 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) {
        if (WW.Cities.canFoundAt(sim, sx + dx, sy + dy, u.race, md)) { x = sx + dx; y = sy + dy; ok = true; }
      }
      if (!ok) { giveUp(); return; }
      const c = WW.Cities.found(sim, x, y, k.id, u.race);
      if (!c) { giveUp(); return; }
      const sk = home ? WW.Cities.stock(sim, home) : null;
      // Startvorrat aus der Mutterstadt
      if (sk && sk !== WW.Cities.stock(sim, c)) {
        for (const r of ['food', 'wood']) { const v = Math.min(sk[r] * 0.25, 30); sk[r] -= v; c.stock[r] += v; }
      }
      let n = 0;
      const grp = u.group;
      for (const v of st.units) if (!v.dead && grp >= 0 && v.group === grp && v.kingdomId === k.id) {
        v.cityId = c.id; v.group = -1; v.site = -1; setRole(sim, v, 'farmer'); n++;
      }
      sim.event('daughter', { city: c.name, mother: home ? home.name : '?', kingdom: k.name, n: n }, WW.Cities.atCity(c));
      return;
    }
    const r = goTo(sim, u, u.site, { limit: C().PATH_LIMIT_LONG });
    if (r === null && u.fails > 3) giveUp();
  }

  // --------------------------------------------------------------------------
  // Denken
  // --------------------------------------------------------------------------
  function think(sim, u) {
    const city = homeCity(sim, u);
    if (u.bubble && --u.bubble.ttl <= 0) u.bubble = null;
    if (u.wait > 0) u.wait -= THINK;
    if (u.sick) {
      u.hp -= 0.5;
      if (sim.rng.chance(0.03)) u.sick = false;
      else if (sim.rng.chance(0.08)) {
        forNear(sim, u.x, u.y, 1.5, false, (v) => { if (!v.sick && sim.rng.chance(0.3)) v.sick = true; return false; });
      }
      if (u.hp <= 0) { kill(sim, u, 'plague'); return; }
    } else if (u.hp < u.maxHp && sim.rng.chance(0.15)) u.hp = Math.min(u.maxHp, u.hp + 1);

    // Kampf
    const g = gov(sim, u);
    let searchR = 0;
    if (u.role === 'soldier') searchR = 7;
    else if (u.role === 'rebel') searchR = 4;
    else if (g.militia && u.role !== 'child' && u.role !== 'settler') searchR = 5;
    if ((searchR > 0 || u.foe >= 0) && u.role !== 'child') {
      if (combat(sim, u, searchR)) return;
    }
    if (!city) {
      // heimatlos: nächste Stadt des Reiches suchen, sonst umherziehen
      const k = sim._kingdoms.get(u.kingdomId);
      if (k && k.cityIds.length) { u.cityId = k.cityIds[0]; return; }
      if (u.role !== 'settler') { wander(sim, u, null, 5); return; }
    }
    switch (u.role) {
      case 'farmer': thinkFarmer(sim, u, city); break;
      case 'lumberjack': thinkGatherer(sim, u, city, 'wood'); break;
      case 'miner': thinkGatherer(sim, u, city, 'stone'); break;
      case 'builder': thinkBuilder(sim, u, city); break;
      case 'soldier': thinkSoldier(sim, u, city); break;
      case 'trader': thinkTrader(sim, u, city); break;
      case 'rebel': thinkRebel(sim, u, city); break;
      case 'settler': thinkSettler(sim, u); break;
      case 'leader': wander(sim, u, city, 3); if (sim.rng.chance(0.05)) bubble(u, 'crown', 30); break;
      default: wander(sim, u, city, 3); break;
    }
  }

  function updateAll(sim) {
    const st = sim.state;
    const tick = st.tick;
    const units = st.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.dead) continue;
      if (u.cd > 0) u.cd--;
      if (((tick + u.id) & 7) === 0) { think(sim, u); if (u.dead) continue; }
      move(sim, u);
    }
  }

  // Jährlich: Altern, Erwachsenwerden
  function yearly(sim) {
    const st = sim.state;
    for (const u of st.units) {
      if (u.dead) continue;
      u.age++;
      if (u.role === 'child' && u.age >= C().ADULT_AGE) setRole(sim, u, 'farmer');
      if (st.laws.aging && u.age >= u.life) kill(sim, u, 'age');
    }
  }

  WW.Units = {
    create: create, setRole: setRole, kill: kill, buildBuckets: buildBuckets, forNear: forNear,
    hostile: hostile, updateAll: updateAll, yearly: yearly, goTo: goTo, bubble: bubble, move: move,
    rescue: rescue, resetTask: resetTask, damageOf: damageOf, hitUnit: hitUnit, entity: entity
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
