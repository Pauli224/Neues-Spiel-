// Bauwerke: anlegen, entfernen, fertigstellen, beschädigen, Mauer-Masken, Sperr-Raster.
(function (WW) { 'use strict';

  const WALLISH = { wall: 1, gate: 1, tower: 1 };

  function info(type) { return WW.STRUCT_INFO[type] || WW.STRUCT_INFO.ruin; }

  function blockValue(s) {
    if (!s.built) return 0;
    if (s.type === 'wall' || s.type === 'tower') return 1;
    if (s.type === 'gate') return 2;
    return 0;
  }

  function cityGov(sim, cityId) {
    const c = sim._cities.get(cityId);
    const k = c && sim._kingdoms.get(c.kingdomId);
    return WW.GOVERNMENTS[(k && k.gov) || 'tribe'];
  }
  function cityRace(sim, cityId) {
    const c = sim._cities.get(cityId);
    return WW.RACES[(c && c.race) || 'human'];
  }

  function maxHpFor(sim, s, level) {
    const inf = info(s.type);
    const lv = Math.max(1, Math.min(inf.hp.length, level || s.level || 1));
    let hp = inf.hp[lv - 1];
    if (WALLISH[s.type]) {
      const g = cityGov(sim, s.cityId);
      hp *= g.wallHpMul * cityRace(sim, s.cityId).wallMul;
      if (s.style === 'barricade') hp *= 0.7;
    }
    return Math.max(1, Math.round(hp));
  }

  function costFor(sim, type, level, cityId) {
    const inf = info(type);
    const c = inf.cost[Math.max(0, Math.min(inf.cost.length - 1, (level || 1) - 1))] || {};
    const out = { food: 0, wood: c.wood || 0, stone: c.stone || 0, gold: c.gold || 0 };
    // ohne Goldwirtschaft wird Gold durch Stein ersetzt
    if (out.gold && cityGov(sim, cityId).goldMul <= 0) { out.stone += out.gold; out.gold = 0; }
    return out;
  }

  function setBlockAt(sim, s) {
    const st = sim.state, W = st.W;
    const v = blockValue(s);
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) {
      const i = (s.y + dy) * W + s.x + dx;
      if (sim.block[i] !== v) { sim.block[i] = v; st.pathVersion++; }
    }
  }

  // Einheiten von einer frisch gesperrten Kachel schieben
  function pushUnitsOff(sim, s) {
    const st = sim.state, W = st.W;
    for (const u of st.units) {
      if (u.dead) continue;
      const tx = Math.floor(u.x), ty = Math.floor(u.y);
      if (tx < s.x || ty < s.y || tx >= s.x + s.w || ty >= s.y + s.h) continue;
      const i = ty * W + tx;
      if (WW.Path.passable(sim, i, u.kingdomId)) continue;
      const n = WW.Path.nearestFree(sim, i, u.kingdomId, 6);
      if (n >= 0) { u.x = (n % W) + 0.5; u.y = Math.floor(n / W) + 0.5; }
      u.path = null; u.pi = 0;
    }
  }

  function updateMaskAt(sim, x, y) {
    const st = sim.state, W = st.W, H = st.H;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const s = sim._structs.get(st.structAt[y * W + x]);
    if (!s || !WALLISH[s.type]) return;
    let m = 0;
    const nb = (xx, yy) => {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) return false;
      const o = sim._structs.get(st.structAt[yy * W + xx]);
      return !!(o && WALLISH[o.type]);
    };
    if (nb(x, y - 1)) m |= 1;
    if (nb(x + 1, y)) m |= 2;
    if (nb(x, y + 1)) m |= 4;
    if (nb(x - 1, y)) m |= 8;
    if (s.mask !== m) { s.mask = m; sim.markDirty(y * W + x); }
  }
  function updateMasksAround(sim, x, y) {
    updateMaskAt(sim, x, y); updateMaskAt(sim, x + 1, y); updateMaskAt(sim, x - 1, y);
    updateMaskAt(sim, x, y + 1); updateMaskAt(sim, x, y - 1);
  }

  // Neues Bauwerk. o = { level, built, gov, style, orient }
  function create(sim, type, x, y, cityId, o) {
    o = o || {};
    const st = sim.state, W = st.W, H = st.H;
    const inf = info(type);
    const w = inf.w || 1, h = inf.h || 1;
    if (x < 0 || y < 0 || x + w > W || y + h > H) return null;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      if (st.structAt[(y + dy) * W + x + dx] !== -1) return null;
    }
    const s = {
      id: st.nextId++, type: type, x: x, y: y, w: w, h: h, cityId: cityId == null ? -1 : cityId,
      level: o.level || 1, hp: 1, maxHp: 1, built: !!o.built, progress: o.built ? 1 : 0,
      mask: 0, paid: !!o.built, workers: 0, upgradeTo: 0
    };
    if (type === 'field') { s.growth = 0; s.gprog = 0; }
    if (type === 'center' || type === 'monument') s.gov = o.gov || 'tribe';
    if (WALLISH[type]) s.style = o.style || 'palisade';
    if (type === 'gate') s.orient = o.orient || 'h';
    if (o.ruinOf) s.ruinOf = o.ruinOf;
    s.maxHp = maxHpFor(sim, s);
    s.hp = s.built ? s.maxHp : Math.max(1, Math.round(s.maxHp * 0.1));
    st.structs.push(s);
    sim._structs.set(s.id, s);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const i = (y + dy) * W + x + dx;
      st.structAt[i] = s.id;
      sim.markDirty(i);
    }
    if (s.built) { setBlockAt(sim, s); if (blockValue(s)) pushUnitsOff(sim, s); }
    if (WALLISH[type]) updateMasksAround(sim, x, y);
    return s;
  }

  function remove(sim, s) {
    if (!s || s.dead) return;
    const st = sim.state, W = st.W;
    s.dead = true;
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) {
      const i = (s.y + dy) * W + s.x + dx;
      if (st.structAt[i] === s.id) st.structAt[i] = -1;
      if (sim.block[i]) { sim.block[i] = 0; st.pathVersion++; }
      sim.markDirty(i);
    }
    sim._structs.delete(s.id);
    sim._structsDirty = true;
    if (WALLISH[s.type]) updateMasksAround(sim, s.x, s.y);
  }

  // Bau abgeschlossen (oder Ausbau)
  function complete(sim, s) {
    if (s.upgradeTo) {
      s.level = s.upgradeTo;
      s.upgradeTo = 0;
      if (s.towerOnUpgrade) { s.type = 'tower'; s.towerOnUpgrade = false; }
      if (WALLISH[s.type]) s.style = s.level >= 3 ? 'fortress' : (s.level === 2 ? 'stone' : s.style);
    }
    s.built = true; s.progress = 1; s.paid = true;
    s.maxHp = maxHpFor(sim, s);
    s.hp = s.maxHp;
    const st = sim.state;
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) sim.markDirty((s.y + dy) * st.W + s.x + dx);
    setBlockAt(sim, s);
    if (blockValue(s)) pushUnitsOff(sim, s);
    if (WALLISH[s.type]) updateMasksAround(sim, s.x, s.y);
    sim.fx({ type: 'dust', x: s.x + s.w / 2, y: s.y + s.h / 2 });
    if (s.type === 'house') {
      const c = sim._cities.get(s.cityId);
      if (c && !c.firstHouseDone) { c.firstHouseDone = true; sim.event('firstHouse', { city: c.name }, WW.Cities.atCity(c)); }
    }
  }

  // Schaden; Rückgabe true, wenn das Bauwerk fällt
  function damage(sim, s, amount, fxType) {
    if (!s || s.dead || amount <= 0) return false;
    s.hp -= amount;
    if (fxType !== null) sim.fx({ type: fxType || 'hit', x: s.x + s.w / 2, y: s.y + s.h / 2 });
    if (s.hp > 0) return false;
    destroy(sim, s);
    return true;
  }

  function destroy(sim, s) {
    const st = sim.state;
    sim.fx({ type: 'smoke', x: s.x + s.w / 2, y: s.y + s.h / 2 });
    if (WALLISH[s.type] || s.type === 'center') {
      // wird wieder Baustelle (Bresche), Baumeister reparieren
      s.built = false; s.progress = 0; s.paid = false; s.hp = 1; s.upgradeTo = 0; s.towerOnUpgrade = false;
      if (s.type === 'tower' && s.level < 2) s.type = 'wall';
      for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) sim.markDirty((s.y + dy) * st.W + s.x + dx);
      setBlockAt(sim, s);
      if (s.type === 'center') {
        const c = sim._cities.get(s.cityId);
        if (c) c.centerLost = (c.centerLost || 0) + 1;
      }
      return;
    }
    const type = s.type;
    remove(sim, s);
    if (type !== 'field' && type !== 'ruin') ruinize(sim, s);
  }

  // Ruinen auf der ganzen Grundfläche (Ruine selbst ist 1×1 laut Tabelle)
  function ruinize(sim, s) {
    const st = sim.state, W = st.W;
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) {
      const x = s.x + dx, y = s.y + dy;
      if (st.structAt[y * W + x] !== -1) continue;
      if (WW.TERRAIN_LUT.walk[st.terrain[y * W + x]] <= 0) continue;
      const r = create(sim, 'ruin', x, y, -1, { built: true, ruinOf: s.type });
      if (r) r.age = 0;
    }
  }

  // Ruft fn(i, x, y) für jede Kachel der Grundfläche auf
  function forTiles(sim, s, fn) {
    const W = sim.state.W;
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) fn((s.y + dy) * W + s.x + dx, s.x + dx, s.y + dy);
  }

  function isWallish(s) { return !!(s && WALLISH[s.type]); }

  // Sperr-Raster nach dem Laden neu aufbauen
  function rebuildBlock(sim) {
    sim.block.fill(0);
    for (const s of sim.state.structs) if (!s.dead) {
      const v = blockValue(s);
      if (!v) continue;
      for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) sim.block[(s.y + dy) * sim.state.W + s.x + dx] = v;
    }
  }

  // Gelände bebaubar? (Volk bestimmt Sonderflächen wie Sumpf)
  function terrainBuildable(sim, i, race) {
    const t = sim.state.terrain[i];
    if (WW.TERRAIN_LUT.walk[t] <= 0) return false;
    if (WW.TERRAIN_LUT.build[t]) return true;
    const r = WW.RACES[race];
    return !!(r && r.buildOn && r.buildOn.indexOf(WW.TERRAIN[t].key) >= 0);
  }
  // Freie Baufläche?
  function canBuildTile(sim, i, race) {
    if (sim.state.structAt[i] !== -1) return false;
    return terrainBuildable(sim, i, race);
  }

  WW.Structs = {
    create: create, remove: remove, complete: complete, damage: damage, destroy: destroy,
    maxHpFor: maxHpFor, costFor: costFor, isWallish: isWallish, rebuildBlock: rebuildBlock,
    updateMasksAround: updateMasksAround, updateMaskAt: updateMaskAt, pushUnitsOff: pushUnitsOff,
    canBuildTile: canBuildTile, blockValue: blockValue, info: info, setBlockAt: setBlockAt,
    ruinize: ruinize, terrainBuildable: terrainBuildable, forTiles: forTiles, WALLISH: WALLISH
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
