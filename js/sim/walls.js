// Mauerring: Planung (Abstandsfläche, morphologisches Schließen, Löcher füllen, Rand),
// Tore, Türme, Bau-Fortschritt, Ausbau auf Stein/Festung, Stadterweiterung.
(function (WW) { 'use strict';

  const CORE = { center: 1, house: 1, barracks: 1, market: 1, monument: 1 };
  const DX4 = [0, 1, 0, -1], DY4 = [-1, 0, 1, 0];

  function deforested(t) {
    const T = WW.T;
    if (t === T.FOREST) return T.GRASS;
    if (t === T.JUNGLE) return T.SAVANNA;
    if (t === T.TAIGA) return T.TUNDRA;
    if (t === T.MUSHROOM) return T.FLOWERS;
    return t;
  }

  // Berechnet den Ring. Rückgabe { tiles, gates, towers, inside, region } in Welt-Indizes oder null
  function computeRing(sim, city, margin) {
    const st = sim.state, W = st.W, H = st.H;
    const core = [];
    for (const s of st.structs) {
      if (s.dead || s.cityId !== city.id || !CORE[s.type]) continue;
      for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) core.push(s.x + dx, s.y + dy);
    }
    if (!core.length) return null;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let i = 0; i < core.length; i += 2) {
      if (core[i] < minX) minX = core[i]; if (core[i] > maxX) maxX = core[i];
      if (core[i + 1] < minY) minY = core[i + 1]; if (core[i + 1] > maxY) maxY = core[i + 1];
    }
    const pad = Math.ceil(margin) + 4;
    const bx0 = Math.max(0, minX - pad), by0 = Math.max(0, minY - pad);
    const bx1 = Math.min(W - 1, maxX + pad), by1 = Math.min(H - 1, maxY + pad);
    const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
    const BN = bw * bh;
    const m2 = margin * margin;
    const allowed = new Uint8Array(BN);
    let R = new Uint8Array(BN);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const wx = x + bx0, wy = y + by0, wi = wy * W + wx;
      const own = st.owner[wi];
      const ring = st.inRing[wi];
      let ok = (own === -1 || own === city.id) && (ring === -1 || ring === city.id);
      if (ok) {
        const sid = st.structAt[wi];
        if (sid !== -1) { const s = sim._structs.get(sid); if (s && s.cityId !== -1 && s.cityId !== city.id) ok = false; }
      }
      allowed[y * bw + x] = ok ? 1 : 0;
      if (!ok) continue;
      let best = 1e9;
      for (let i = 0; i < core.length; i += 2) {
        const ddx = core[i] - wx, ddy = core[i + 1] - wy;
        const d = ddx * ddx + ddy * ddy;
        if (d < best) { best = d; if (d === 0) break; }
      }
      if (best <= m2) R[y * bw + x] = 1;
    }
    // morphologisches Schließen (Scheibe r² ≤ 5)
    const K = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) K.push(dx, dy);
    const D = new Uint8Array(BN);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (!R[y * bw + x]) continue;
      for (let k = 0; k < K.length; k += 2) {
        const nx = x + K[k], ny = y + K[k + 1];
        if (nx >= 0 && ny >= 0 && nx < bw && ny < bh) D[ny * bw + nx] = 1;
      }
    }
    const E = new Uint8Array(BN);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (!D[y * bw + x]) continue;
      let keep = 1;
      for (let k = 0; k < K.length; k += 2) {
        const nx = x + K[k], ny = y + K[k + 1];
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh || !D[ny * bw + nx]) {
          // Kartenrand zählt nicht als Außen (sonst schrumpft die Fläche am Rand)
          const wx = nx + bx0, wy = ny + by0;
          if (wx < 0 || wy < 0 || wx >= W || wy >= H) continue;
          keep = 0; break;
        }
      }
      if (keep || R[y * bw + x]) E[y * bw + x] = 1;
    }
    for (let i = 0; i < BN; i++) E[i] = E[i] && allowed[i] ? 1 : 0;
    // nur die Komponente mit dem Zentrum (4er-Nachbarschaft)
    const cxl = city.cx - bx0, cyl = city.cy - by0;
    const start = cyl * bw + cxl;
    if (start < 0 || start >= BN || !E[start]) return null;
    R = new Uint8Array(BN);
    const q = new Int32Array(BN);
    let qh = 0, qt = 0;
    q[qt++] = start; R[start] = 1;
    while (qh < qt) {
      const i = q[qh++], x = i % bw, y = (i - x) / bw;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX4[d], ny = y + DY4[d];
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const n = ny * bw + nx;
        if (E[n] && !R[n]) { R[n] = 1; q[qt++] = n; }
      }
    }
    // Löcher füllen: Außen vom Kastenrand aus fluten
    const out = new Uint8Array(BN);
    qh = 0; qt = 0;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (x !== 0 && y !== 0 && x !== bw - 1 && y !== bh - 1) continue;
      const i = y * bw + x;
      if (!R[i] && !out[i]) { out[i] = 1; q[qt++] = i; }
    }
    while (qh < qt) {
      const i = q[qh++], x = i % bw, y = (i - x) / bw;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX4[d], ny = y + DY4[d];
        if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
        const n = ny * bw + nx;
        if (!R[n] && !out[n]) { out[n] = 1; q[qt++] = n; }
      }
    }
    for (let i = 0; i < BN; i++) if (!out[i]) R[i] = 1;

    // Rand = Kacheln der Fläche mit einem 8er-Nachbarn außerhalb (oder Kartenrand)
    const inR = (x, y) => {
      if (x < 0 || y < 0 || x >= bw || y >= bh) {
        return false;
      }
      return R[y * bw + x] === 1;
    };
    const boundary = new Uint8Array(BN);
    const tiles = [], inside = [];
    const walk = WW.TERRAIN_LUT.walk;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      if (!R[y * bw + x]) continue;
      const wx = x + bx0, wy = y + by0;
      let edge = (wx === 0 || wy === 0 || wx === W - 1 || wy === H - 1);
      if (!edge) {
        for (let d = 0; d < 8; d++) if (!inR(x + WW.Path.DX[d], y + WW.Path.DY[d])) { edge = true; break; }
      }
      const wi = wy * W + wx;
      if (edge) {
        boundary[y * bw + x] = 1;
        // begehbarer Rand braucht Mauer; Unbegehbares ist natürliche Barriere
        if (walk[st.terrain[wi]] > 0) tiles.push(wi);
      } else inside.push(wi);
    }
    if (!tiles.length) return { tiles: [], gates: [], towers: [], inside: inside, box: null };

    const isB = (wx, wy) => {
      const x = wx - bx0, y = wy - by0;
      if (x < 0 || y < 0 || x >= bw || y >= bh) return false;
      return boundary[y * bw + x] === 1;
    };
    const isR = (wx, wy) => inR(wx - bx0, wy - by0);
    const isBWalk = (wx, wy) => isB(wx, wy) && wx >= 0 && wy >= 0 && wx < W && wy < H && walk[st.terrain[wy * W + wx]] > 0;

    // Tore: N/O/S/W vom Zentrum
    const gates = [];
    const gateSet = new Set();
    function validGate(wx, wy, dir) {
      // dir: 0 N, 1 O, 2 S, 3 W; Mauer verläuft quer zur Richtung
      if (!isBWalk(wx, wy)) return false;
      const ix = wx - DX4[dir], iy = wy - DY4[dir];   // innen
      const ox = wx + DX4[dir], oy = wy + DY4[dir];   // außen
      if (ox < 0 || oy < 0 || ox >= W || oy >= H) return false;
      if (!isR(ix, iy) || isB(ix, iy)) return false;
      if (isR(ox, oy)) return false;
      const ii = iy * W + ix, oi = oy * W + ox;
      if (walk[st.terrain[ii]] <= 0 || walk[st.terrain[oi]] <= 0) return false;
      if (WW.TERRAIN[st.terrain[wy * W + wx]].water) return false;   // kein Tor im Fluss
      const os = sim._structs.get(st.structAt[oi]);
      if (os && WW.Structs.isWallish(os)) return false;
      // seitliche Nachbarn müssen Rand sein (gerades Mauerstück)
      const px = DY4[dir] !== 0 ? 1 : 0, py = DX4[dir] !== 0 ? 1 : 0;
      if (!isB(wx + px, wy + py) || !isB(wx - px, wy - py)) return false;
      // nicht direkt neben einem anderen Tor
      for (const g of gates) { const gx = g % W, gy = (g - gx) / W; if (Math.abs(gx - wx) + Math.abs(gy - wy) < 4) return false; }
      // dahinter ein Stück freies Land (keine Sackgasse)
      let cnt = 0;
      const seen = new Set([oi]);
      const qq = [oi];
      while (qq.length && cnt < 14) {
        const c = qq.shift(); cnt++;
        const cx = c % W, cy = (c - cx) / W;
        for (let d = 0; d < 4; d++) {
          const nx = cx + DX4[d], ny = cy + DY4[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (seen.has(n) || isR(nx, ny) || walk[st.terrain[n]] <= 0) continue;
          seen.add(n); qq.push(n);
        }
      }
      return cnt >= 14;
    }
    const ccx = city.cx, ccy = city.cy;
    for (let dir = 0; dir < 4; dir++) {
      let done = false;
      const offs = [0, 1, -1, 2, -2, 3, -3, 4, -4];
      for (const off of offs) {
        if (done) break;
        // Startspalte/-zeile am 2×2-Zentrum
        let sx, sy;
        if (dir === 0) { sx = ccx + (off >= 0 ? off : off + 1) ; sy = ccy; }
        else if (dir === 2) { sx = ccx + (off >= 0 ? off : off + 1); sy = ccy + 1; }
        else if (dir === 1) { sx = ccx + 1; sy = ccy + (off >= 0 ? off : off + 1); }
        else { sx = ccx; sy = ccy + (off >= 0 ? off : off + 1); }
        let x = sx, y = sy;
        for (let step = 0; step < 40; step++) {
          x += DX4[dir]; y += DY4[dir];
          if (!isR(x, y)) break;
          if (isB(x, y)) {
            if (validGate(x, y, dir)) { const gi = y * W + x; gates.push(gi); gateSet.add(gi); done = true; }
            break;
          }
        }
      }
    }
    if (!gates.length) {
      // Rückfall: irgendein gerades Randstück mit Land dahinter, nahe am Zentrum
      let best = -1, bd = 1e9, bdir = 0;
      for (const t of tiles) {
        const x = t % W, y = (t - x) / W;
        for (let dir = 0; dir < 4; dir++) {
          if (!validGate(x, y, dir)) continue;
          const d = (x - ccx) * (x - ccx) + (y - ccy) * (y - ccy);
          if (d < bd) { bd = d; best = t; bdir = dir; }
        }
      }
      if (best >= 0) { gates.push(best); gateSet.add(best); }
    }
    const gateDir = {};
    for (const g of gates) {
      const x = g % W, y = (g - x) / W;
      // Ausrichtung: Mauer waagerecht (h), wenn links/rechts Rand ist
      gateDir[g] = (isB(x - 1, y) && isB(x + 1, y)) ? 'h' : 'v';
    }

    // Türme: konvexe Ecken zuerst, dann Lücken füllen; Abstand ≥ 4, nicht neben Toren
    const towers = [];
    const cand = [];
    for (const t of tiles) {
      if (gateSet.has(t)) continue;
      const x = t % W, y = (t - x) / W;
      const n = isB(x, y - 1), e = isB(x + 1, y), s = isB(x, y + 1), w = isB(x - 1, y);
      const corner = (n && e && !s && !w) || (e && s && !n && !w) || (s && w && !n && !e) || (w && n && !e && !s);
      let insideCnt = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isR(x + dx, y + dy)) insideCnt++;
      const score = (corner ? 10 : 0) + (9 - insideCnt) * 2;
      cand.push({ t: t, x: x, y: y, score: score, corner: corner });
    }
    cand.sort((a, b) => b.score - a.score || a.t - b.t);
    const farFrom = (x, y, list, dmin) => {
      for (const o of list) { const ox = o % W, oy = (o - ox) / W; if (Math.max(Math.abs(ox - x), Math.abs(oy - y)) < dmin) return false; }
      return true;
    };
    for (const c of cand) {
      if (!c.corner) continue;
      if (farFrom(c.x, c.y, towers, 4) && farFrom(c.x, c.y, gates, 2)) towers.push(c.t);
    }
    for (const c of cand) {
      if (farFrom(c.x, c.y, towers, 6) && farFrom(c.x, c.y, gates, 2)) towers.push(c.t);
    }
    return { tiles: tiles, gates: gates, gateDir: gateDir, towers: towers, inside: inside };
  }

  function wallStyle(gov, level) {
    if (gov.barricades) return 'barricade';
    return level >= 3 ? 'fortress' : (level === 2 ? 'stone' : 'palisade');
  }

  // Ring planen und Baustellen anlegen
  function plan(sim, city, margin, level, expanding) {
    const st = sim.state, W = st.W;
    const ring = computeRing(sim, city, margin);
    if (!ring) return false;
    const k = sim._kingdoms.get(city.kingdomId);
    const gov = WW.GOVERNMENTS[k ? k.gov : 'tribe'];
    const w = city.wall;
    const style = wallStyle(gov, level);
    const gateSet = new Set(ring.gates), towerSet = new Set(ring.towers);
    const newSet = new Set(ring.tiles);
    // Innenfläche markieren
    for (let i = 0; i < st.inRing.length; i++) if (st.inRing[i] === city.id) st.inRing[i] = -1;
    for (const i of ring.inside) if (st.inRing[i] === -1) st.inRing[i] = city.id;
    // alte Stücke, die nicht im neuen Ring liegen, werden später abgetragen
    const old = [];
    if (expanding && w.plan) for (const t of w.plan) if (!newSet.has(t)) old.push(t);
    const planTiles = [];
    let idx = 0;
    for (const t of ring.tiles) {
      idx++;
      const isGate = gateSet.has(t);
      // Barrikaden haben Lücken
      if (gov.barricades && !isGate && idx % 6 === 0) continue;
      planTiles.push(t);
      const x = t % W, y = (t - x) / W;
      let s = sim._structs.get(st.structAt[t]);
      const wantType = isGate ? 'gate' : ((level >= 2 && towerSet.has(t) && !gov.barricades) ? 'tower' : 'wall');
      if (s && s.cityId === city.id && WW.Structs.isWallish(s)) {
        if (s.type === wantType || (wantType === 'wall' && s.type === 'tower')) continue;
        WW.Structs.remove(sim, s); s = null;
      } else if (s) {
        // Felder, Hütten, Ruinen weichen der Mauer (Kerngebäude kommen hier praktisch nie vor)
        if (s.cityId !== -1 && s.cityId !== city.id) continue;
        if (CORE[s.type] && s.type !== 'house') continue;
        WW.Structs.remove(sim, s);
      }
      const tt = st.terrain[t];
      const nt = deforested(tt);
      if (nt !== tt) { st.terrain[t] = nt; sim.markDirty(t); }
      const ns = WW.Structs.create(sim, wantType, x, y, city.id, {
        level: level, built: false, style: style, orient: ring.gateDir[t] || 'h'
      });
      if (ns && level < 2 && towerSet.has(t)) ns.towerSpot = true;
    }
    // Turmplätze merken (für den späteren Ausbau)
    for (const t of planTiles) {
      const s = sim._structs.get(st.structAt[t]);
      if (s && towerSet.has(t)) s.towerSpot = true;
    }
    w.plan = planTiles;
    w.gates = ring.gates.slice();
    w.towers = ring.towers.filter(t => newSet.has(t));
    w.old = old;
    w.target = level;
    w.style = style;
    w.state = expanding ? 'expanding' : 'building';
    w.plannedYear = st.year;
    w.inside = ring.inside.length;
    if (expanding) w.expansions = (w.expansions || 0) + 1;
    refreshCounts(sim, city);
    WW.Cities.refreshLists(sim, city);
    st.pathVersion++;
    return true;
  }

  function pieceDone(s, target) {
    return s.built && !s.upgradeTo && s.level >= target;
  }

  function refreshCounts(sim, city) {
    const st = sim.state, w = city.wall;
    if (!w.plan) { w.total = 0; w.built = 0; return; }
    let total = 0, built = 0;
    for (const t of w.plan) {
      const s = sim._structs.get(st.structAt[t]);
      if (!s || s.cityId !== city.id || !WW.Structs.isWallish(s)) {
        if (WW.TERRAIN_LUT.walk[st.terrain[t]] > 0) total++;
        continue;
      }
      total++;
      if (pieceDone(s, w.target || 1)) built++;
    }
    w.total = total; w.built = built;
  }

  // Fehlende Stücke ergänzen (z. B. nach Geländeänderung)
  function repairPlan(sim, city) {
    const st = sim.state, W = st.W, w = city.wall;
    if (!w.plan) return;
    const k = sim._kingdoms.get(city.kingdomId);
    const gov = WW.GOVERNMENTS[k ? k.gov : 'tribe'];
    const gateSet = new Set(w.gates || []);
    for (const t of w.plan) {
      if (WW.TERRAIN_LUT.walk[st.terrain[t]] <= 0) continue;
      const s = sim._structs.get(st.structAt[t]);
      if (s && s.cityId === city.id && WW.Structs.isWallish(s)) continue;
      if (s) {
        if (s.cityId !== -1 && s.cityId !== city.id) continue;
        if (CORE[s.type] && s.type !== 'house') continue;
        WW.Structs.remove(sim, s);
      }
      const x = t % W, y = (t - x) / W;
      const lv = w.state === 'upgrading' ? w.target : Math.max(1, w.level || w.target || 1);
      WW.Structs.create(sim, gateSet.has(t) ? 'gate' : 'wall', x, y, city.id, { level: lv, built: false, style: wallStyle(gov, lv) });
    }
  }

  function startUpgrade(sim, city, level) {
    const st = sim.state, w = city.wall;
    const towerSet = new Set(w.towers || []);
    const k = sim._kingdoms.get(city.kingdomId);
    const gov = WW.GOVERNMENTS[k ? k.gov : 'tribe'];
    for (const t of w.plan) {
      const s = sim._structs.get(st.structAt[t]);
      if (!s || s.cityId !== city.id || !WW.Structs.isWallish(s)) continue;
      if (s.built) {
        s.upgradeTo = level; s.progress = 0; s.paid = false;
        if (towerSet.has(t) && s.type === 'wall') s.towerOnUpgrade = true;
      } else {
        s.level = level; s.style = wallStyle(gov, level);
        if (towerSet.has(t) && s.type === 'wall') s.type = 'tower';
        s.maxHp = WW.Structs.maxHpFor(sim, s);
        s.paid = false;
      }
    }
    w.target = level;
    w.state = 'upgrading';
    WW.Cities.refreshLists(sim, city);
  }

  // Alte Mauer nach Erweiterung abtragen
  function tearDownOld(sim, city) {
    const st = sim.state, w = city.wall;
    const planSet = new Set(w.plan);
    let n = 0;
    for (const t of (w.old || [])) {
      if (planSet.has(t)) continue;
      const s = sim._structs.get(st.structAt[t]);
      if (s && s.cityId === city.id && WW.Structs.isWallish(s)) { WW.Structs.remove(sim, s); n++; }
    }
    w.old = [];
    return n;
  }

  // Alle 3 s je Stadt
  function update(sim, city) {
    const st = sim.state, w = city.wall;
    const k = sim._kingdoms.get(city.kingdomId);
    if (!k) return;
    const gov = WW.GOVERNMENTS[k.gov];
    const vars = { city: city.name, kingdom: k.name };
    const at = { kingdomId: k.id, cityId: city.id, x: city.cx + 1, y: city.cy + 1 };
    if (!w.state || w.state === 'none') {
      if (city.pop >= gov.wallThreshold && city.centerOk) {
        if (plan(sim, city, WW.CONFIG.WALL_MARGIN, 1, false)) {
          sim.event(gov.barricades ? 'barricadePlan' : 'wallPlan', vars, at);
        }
      }
      return;
    }
    repairPlan(sim, city);
    refreshCounts(sim, city);
    if (w.state === 'building' || w.state === 'expanding') {
      if (w.total > 0 && w.built >= w.total) {
        w.level = Math.max(w.level || 0, w.target);
        if (w.state === 'expanding') {
          tearDownOld(sim, city);
          sim.event('wallExpandDone', vars, at);
        } else sim.event(gov.barricades ? 'barricadeDone' : 'wallDone', vars, at);
        w.state = 'done';
        city.noSpace = false;
      }
      return;
    }
    if (w.state === 'upgrading') {
      if (w.built >= w.total) {
        w.level = w.target; w.style = wallStyle(gov, w.level); w.state = 'done';
        sim.event(w.level >= 3 ? 'wallFortressDone' : 'wallStoneDone', vars, at);
      }
      return;
    }
    // fertig: Ausbau oder Erweiterung?
    const stock = WW.Cities.stock(sim, city);
    const maxLv = Math.min(gov.wallMax, 3);
    if (w.built >= w.total && !gov.barricades && w.level < maxLv) {
      if (w.level === 1 && city.pop >= Math.max(15, gov.wallThreshold + 5) && stock.stone >= 12) {
        startUpgrade(sim, city, 2); w.style = 'stone';
        sim.event('wallStone', vars, at);
        return;
      }
      if (w.level === 2 && city.pop >= 32 && city.tier >= 2 && stock.stone >= 30) {
        startUpgrade(sim, city, 3);
        sim.event('wallFortress', vars, at);
        return;
      }
    }
    if (city.noSpace && st.year - (w.plannedYear || 0) >= WW.CONFIG.WALL_EXPAND_YEARS && city.pop >= city.housing - 3) {
      const lv = gov.barricades ? 1 : Math.max(1, w.level);
      const before = w.plan ? w.plan.length : 0;
      if (plan(sim, city, WW.CONFIG.WALL_EXPAND_MARGIN, lv, true)) {
        if (w.plan.length <= before * 0.9) {
          // Ring wurde nicht größer (Platz verbaut) – alte Pläne behalten
          w.state = 'expanding';
        }
        sim.event('wallExpand', vars, at);
      }
    }
  }

  // Beim Untergang/Wechsel: Mauern einer Stadt zu Ruinen
  function demolishAll(sim, city) {
    const st = sim.state;
    for (const s of st.structs.slice()) {
      if (s.dead || s.cityId !== city.id || !WW.Structs.isWallish(s)) continue;
      WW.Structs.remove(sim, s);
    }
    for (let i = 0; i < st.inRing.length; i++) if (st.inRing[i] === city.id) st.inRing[i] = -1;
    city.wall = emptyWall();
  }

  function emptyWall() {
    return { level: 0, target: 0, total: 0, built: 0, style: 'none', state: 'none', plan: null, gates: [], towers: [], old: [], expansions: 0, plannedYear: 0, inside: 0 };
  }

  WW.Walls = {
    computeRing: computeRing, plan: plan, update: update, refreshCounts: refreshCounts,
    startUpgrade: startUpgrade, demolishAll: demolishAll, emptyWall: emptyWall, wallStyle: wallStyle,
    deforested: deforested, CORE: CORE
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
