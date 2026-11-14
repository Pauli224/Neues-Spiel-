// Mauerring: Planung (Abstandsfläche, morphologisches Schließen, Löcher füllen, Rand),
// Tore, Türme, Bau-Fortschritt, Ausbau auf Stein/Festung, Stadterweiterung.
//
// [walls] STUFEN 1–6 UND GERÄTE (Daten: js/core/config-walls.js, lädt nach config.js)
//   Mauerstücke (wall/gate/tower) haben level 1..6; wie weit eine Stadt ausbaut, steht in
//   WW.GOVERNMENTS[gov].wallMax (Stamm, Anarchie 4; sonst 6) und wallLevels[level-1] = { name, hpMul, cost, req, device, spacing }
//   (auch WW.WALL_LEVELS[gov]). Ausbau wie bisher Stück für Stück (upgradeTo), der Ring bleibt dabei dicht.
//   city.wall.level = fertige Stufe, city.wall.name = Name der Stufe (deutsch), wall.devices = IDs der Stücke mit Gerät.
//   mat bleibt 'palisade'|'stone'|'fortress'|'barricade' (Stamm immer 'palisade', Anarchie 'barricade', ab Stufe 3 'fortress').
//   Regierungswechsel: Stufe über dem neuen wallMax wird auf wallMax gesenkt, Geräte werden auf das Gerät der neuen
//   Regierung umgestellt (bzw. entfernt), Aussehen wie bisher über restyle.
//   Geräte: struct.device ∈ WW.WALL_DEVICE_KEYS (selfshot, mgnest, ballista, cannon, ward, post, spikes, trap) auf jedem
//   spacing-ten Mauerstück (keine Tore), ab der Stufe mit device; struct.devCd = Nachladezeit (Ticks). Sprite s_walldev_<device>.
//   Feuern: js/sim/env.js (nur bei Krieg, Aufstand oder Alarm der Stadt; alle 3 Ticks).
//   Fx: muzzle {x,y} (Kachel des Geräts), tracer {x,y,x2,y2}, bolt_shot {x,y,x2,y2} (Balliste), rock {x,y,x2,y2} +
//   explosion {x,y,r} (Kanone), arrow {x,y,x2,y2} (Bürgerposten), ward {x,y,r} (Bannkreis), spikes {x,y}, dud {x,y} (Falle).
//   Ereignisse: wallLevel / wallLevelDone { city, name } (Ausbau auf Stufe 4–6 bzw. Holzstufen von Stamm/Anarchie),
//   selfshotSheep { city } (Selbstschussanlage trifft ein Schaf), trapOops { city } (Falle trifft die eigenen Leute).
//
// [walls] GLEISTOR: liegt ein Gleis (eigenes Reich) auf dem geplanten Mauerverlauf, wird das Stück zum Tor mit Gleis
//   (struct type 'gate', rail: true, line = Strecken-ID; als Tor mit Schienen zeichnen). Gilt als Tor der Stadt
//   (city.wall.gates), sperrt Feinde wie jedes Tor; Züge fahren durch, sobald es fertig gebaut ist.
// [walls] LAGERZAUN (Lagerstadt city.kind 'camp', js/sim/camps.js): WW.Walls.planFence(sim, city, reserve, margin, toward)
//   plant einen Ring wie eine Mauer, aber mit genau EINEM Tor (das zur Richtung toward {x,y} nächste), ohne Türme und
//   Geräte; Stücke type 'wall'/'gate', mat 'fence', level 1; city.wall.style 'fence'. WW.Walls.fenceUpdate(sim, city)
//   ergänzt fehlende Stücke und meldet true, sobald der Zaun fertig ist. Haltbarkeit setzt camps.js (WW.CAMPS.FENCE_HP),
//   Bauen übernehmen die Wachen (camps.js). Kein Ausbau, keine Erweiterung, keine Geräte (Walls.update fasst ihn nicht an).
(function (WW) { 'use strict';

  // Kerngebäude kommen aus der Tabelle (STRUCT_INFO[type].core)
  const CORE = {};
  for (const k in WW.STRUCT_INFO) if (WW.STRUCT_INFO[k].core) CORE[k] = 1;
  const DX4 = [0, 1, 0, -1], DY4 = [-1, 0, 1, 0];
  // [walls] Bauwerke der Industrie weichen dem Ring nicht (Gleise bleiben passierbar, Fabriken/Bahnhöfe werden nicht abgerissen)
  const KEEP = { station: 1, rail: 1, laborcamp: 1, factory: 1 };

  function deforested(t) {
    const T = WW.T;
    if (t === T.FOREST) return T.GRASS;
    if (t === T.JUNGLE) return T.SAVANNA;
    if (t === T.TAIGA) return T.TUNDRA;
    if (t === T.MUSHROOM) return T.FLOWERS;
    return t;
  }

  // Berechnet den Ring. Rückgabe { tiles, gates, towers, inside, region } in Welt-Indizes oder null
  // reserve: Radius einer Wachstumsfläche um das Zentrum, die zum Kern zählt (Platz für neue Häuser)
  function computeRing(sim, city, margin, reserve) {
    const st = sim.state, W = st.W, H = st.H;
    const core = [];
    for (const s of st.structs) {
      if (s.dead || s.cityId !== city.id || !CORE[s.type]) continue;
      for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) core.push(s.x + dx, s.y + dy);
    }
    if (!core.length) return null;
    const rr = reserve || 0;
    if (rr > 0) {
      const walk0 = WW.TERRAIN_LUT.walk;
      for (let dy = -Math.ceil(rr); dy <= Math.ceil(rr); dy++) for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) {
        if (dx * dx + dy * dy > rr * rr) continue;
        const x = city.cx + dx, y = city.cy + dy;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const i = y * W + x;
        if (walk0[st.terrain[i]] <= 0) continue;
        if (st.owner[i] !== -1 && st.owner[i] !== city.id) continue;
        if (st.inRing[i] !== -1 && st.inRing[i] !== city.id) continue;
        core.push(x, y);
      }
    }
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
    }
    // [walls] Abstandsfläche: jede Kernkachel stempelt ihre Scheibe (r² ≤ m2) – O(Kern × Scheibe) statt O(Fläche × Kern),
    // gleiches Ergebnis; nötig für Megastädte (Tausende Kernkacheln)
    {
      const mr = Math.floor(Math.sqrt(m2)), disc = [];
      for (let dy = -mr; dy <= mr; dy++) for (let dx = -mr; dx <= mr; dx++) if (dx * dx + dy * dy <= m2) disc.push(dx, dy);
      const seenCore = new Uint8Array(BN);
      for (let i = 0; i < core.length; i += 2) {
        const cx0 = core[i] - bx0, cy0 = core[i + 1] - by0;
        if (cx0 < 0 || cy0 < 0 || cx0 >= bw || cy0 >= bh) continue;
        const ci = cy0 * bw + cx0;
        if (seenCore[ci]) continue;   // doppelte Kernkacheln (Gebäude + Reserve) nur einmal
        seenCore[ci] = 1;
        for (let k = 0; k < disc.length; k += 2) {
          const x = cx0 + disc[k], y = cy0 + disc[k + 1];
          if (x < 0 || y < 0 || x >= bw || y >= bh) continue;
          const j = y * bw + x;
          if (allowed[j]) R[j] = 1;
        }
      }
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
    const tiles = [], inside = [], all = [];
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
        all.push(wi);
        // begehbarer Rand braucht Mauer; Unbegehbares ist natürliche Barriere
        if (walk[st.terrain[wi]] > 0) tiles.push(wi);
      } else inside.push(wi);
    }
    if (!tiles.length) return { tiles: [], all: all, gates: [], gateDir: {}, towers: [], inside: inside };

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
    const offs = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5];
    for (let dir = 0; dir < 4; dir++) {
      let done = false;
      for (const off of offs) {
        if (done) break;
        // Strahl vom Zentrum nach außen, seitlich versetzt
        let x = ccx + (DY4[dir] !== 0 ? off : 0), y = ccy + (DX4[dir] !== 0 ? off : 0);
        for (let step = 0; step < 60; step++) {
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
    // Turmabstand je Regierung (Faschismus: viele Wachtürme, Anarchie: keine)
    const kk = sim._kingdoms.get(city.kingdomId);
    const spacing = WW.GOVERNMENTS[(kk && kk.gov) || 'tribe'].build.towerSpacing;
    if (spacing > 0) {
      for (const c of cand) {
        if (!c.corner) continue;
        if (farFrom(c.x, c.y, towers, Math.min(4, spacing)) && farFrom(c.x, c.y, gates, 2)) towers.push(c.t);
      }
      for (const c of cand) {
        if (farFrom(c.x, c.y, towers, spacing) && farFrom(c.x, c.y, gates, 2)) towers.push(c.t);
      }
    }
    return { tiles: tiles, all: all, gates: gates, gateDir: gateDir, towers: towers, inside: inside };
  }

  function wallStyle(gov, level) {
    if (gov.barricades) return 'barricade';
    if (gov.key === 'tribe') return 'palisade';   // [walls] Holzstufen
    return level >= 3 ? 'fortress' : (level === 2 ? 'stone' : 'palisade');
  }
  function levelInfo(gov, level) {
    const lv = gov.wallLevels || (WW.WALL_LEVELS && WW.WALL_LEVELS[gov.key]);
    return lv ? lv[Math.max(1, Math.min(lv.length, level)) - 1] : null;
  }
  function levelName(gov, level) { const i = levelInfo(gov, level); return i ? i.name : (WW.WALL_STYLE_NAMES[wallStyle(gov, level)] || 'Mauer'); }

  // Geräte auf die Mauerstücke verteilen (Gerät der höchsten erreichten Stufe mit Gerät)
  function assignDevices(sim, city, gov) {
    const st = sim.state, w = city.wall;
    let dev = null, sp = 0;
    for (let l = 1; l <= (w.level || 0); l++) { const i = levelInfo(gov, l); if (i && i.device) { dev = i.device; sp = i.spacing || 5; } }
    const ids = [];
    let idx = 0;
    for (const t of w.plan || []) {
      const p = sim._structs.get(st.structAt[t]);
      if (!p || p.cityId !== city.id || !WW.Structs.isWallish(p)) continue;
      if (p.type === 'gate') { if (p.device) { delete p.device; sim.markDirty(t); } continue; }
      idx++;
      const want = dev && idx % sp === 0 ? dev : null;
      if ((p.device || null) !== want) { if (want) p.device = want; else delete p.device; sim.markDirty(t); }
      if (want) ids.push(p.id);
    }
    w.devices = ids; w.devGov = gov.key; w.devLevel = w.level || 0;
  }
  // Stufe über dem Maximum der Regierung senken (Regierungswechsel)
  function clampLevel(sim, city, gov) {
    const st = sim.state, w = city.wall, max = gov.wallMax || 3;
    if ((w.level || 0) <= max && (w.target || 0) <= max) return;
    w.level = Math.min(w.level || 0, max); w.target = Math.min(w.target || 0, max);
    for (const t of w.plan || []) {
      const p = sim._structs.get(st.structAt[t]);
      if (!p || p.cityId !== city.id || !WW.Structs.isWallish(p)) continue;
      if (p.upgradeTo > max) p.upgradeTo = 0;
      if (p.level > max) { p.level = max; p.mat = wallStyle(gov, max); p.maxHp = WW.Structs.maxHpFor(sim, p); p.hp = Math.min(p.hp, p.maxHp); sim.markDirty(t); }
    }
    if (w.state === 'upgrading') w.state = 'done';
    w.style = wallStyle(gov, Math.max(1, w.level));
  }

  // Ring planen und Baustellen anlegen
  function plan(sim, city, margin, level, expanding) {
    const st = sim.state, W = st.W;
    const C = WW.CONFIG;
    const want = C.WALL_RESERVE + C.WALL_RESERVE_STEP * ((city.wall.expansions || 0) + (expanding ? 1 : 0));
    const lim = maxReserve(sim, city);
    if (expanding && want > lim + 0.5) return false;          // Nachbarstadt zu nah: nicht weiter wachsen
    const reserve = Math.max(3, Math.min(want, lim));
    const ring = computeRing(sim, city, margin, reserve);
    if (!ring) return false;
    // Land unter Ring und Innenfläche gehört der Stadt (Fluren)
    WW.Growth.claimTiles(sim, city, ring.all.concat(ring.inside));
    const k = sim._kingdoms.get(city.kingdomId);
    const gov = WW.GOVERNMENTS[k ? k.gov : 'tribe'];
    const w = city.wall;
    const style = wallStyle(gov, level);
    const gateSet = new Set(ring.gates), towerSet = new Set(ring.towers);
    const newSet = new Set(ring.all);
    // Innenfläche markieren
    for (let i = 0; i < st.inRing.length; i++) if (st.inRing[i] === city.id) st.inRing[i] = -1;
    for (const i of ring.inside) if (st.inRing[i] === -1) st.inRing[i] = city.id;
    // Felder gehören vor die Mauer
    for (const i of ring.inside) {
      const s = sim._structs.get(st.structAt[i]);
      if (s && s.type === 'field' && s.cityId === city.id) WW.Structs.remove(sim, s);
    }
    // alte Stücke, die nicht im neuen Ring liegen, werden später abgetragen
    const old = [];
    if (expanding && w.plan) for (const t of w.plan) if (!newSet.has(t)) old.push(t);
    const gaps = [];
    let idx = 0;
    for (const t of ring.tiles) {
      idx++;
      const isGate = gateSet.has(t);
      // Barrikaden haben Lücken
      if (gov.barricades && !isGate && idx % 7 === 0) { gaps.push(t); continue; }
      const x = t % W, y = (t - x) / W;
      let s = sim._structs.get(st.structAt[t]);
      const wantType = isGate ? 'gate' : ((level >= 2 && towerSet.has(t) && !gov.barricades) ? 'tower' : 'wall');
      if (s && s.cityId === city.id && WW.Structs.isWallish(s)) {
        if (s.type === wantType || (wantType === 'wall' && s.type === 'tower') || (s.type === 'gate' && s.rail)) continue;   // [walls] Gleistor bleibt
        WW.Structs.remove(sim, s); s = null;
      } else if (s) {
        if (railGate(sim, city, s, t, level, style, newSet)) { gateSet.add(t); continue; }   // [walls] Gleis im Ring -> Gleistor (dicht für Feinde)
        // Felder, Hütten, Ruinen weichen der Mauer (Kerngebäude kommen hier praktisch nie vor)
        if (s.cityId !== -1 && s.cityId !== city.id) continue;
        if ((CORE[s.type] && s.type !== 'house') || KEEP[s.type]) continue;   // [walls] Industrie bleibt stehen
        WW.Structs.remove(sim, s);
      }
      const tt = st.terrain[t];
      const nt = deforested(tt);
      if (nt !== tt) { st.terrain[t] = nt; sim.markDirty(t); }
      const ns = WW.Structs.create(sim, wantType, x, y, city.id, {
        level: level, built: false, mat: style, orient: ring.gateDir[t] || 'h'
      });
      if (ns && level < 2 && towerSet.has(t)) ns.towerSpot = true;
    }
    // Turmplätze merken (für den späteren Ausbau)
    for (const t of ring.tiles) {
      const s = sim._structs.get(st.structAt[t]);
      if (s && towerSet.has(t)) s.towerSpot = true;
    }
    w.plan = ring.all.slice();
    w.gaps = gaps;
    w.gates = ring.gates.slice();
    for (const t of ring.tiles) { const g = sim._structs.get(st.structAt[t]); if (g && g.type === 'gate' && g.rail && w.gates.indexOf(t) < 0) w.gates.push(t); }   // [walls] Gleistore
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

  // Größte Wachstumsfläche, ohne einer Nachbarstadt zu nahe zu kommen
  function maxReserve(sim, city) {
    let lim = 99;
    for (const c of sim.state.cities) {
      if (c === city || c.dead) continue;
      const d = Math.sqrt((c.cx - city.cx) * (c.cx - city.cx) + (c.cy - city.cy) * (c.cy - city.cy));
      lim = Math.min(lim, d / 2 - WW.CONFIG.WALL_MARGIN - 2);
    }
    return lim;
  }

  function pieceDone(s, target) {
    return s.built && !s.upgradeTo && s.level >= target;
  }

  function refreshCounts(sim, city) {
    const st = sim.state, w = city.wall;
    if (!w.plan) { w.total = 0; w.built = 0; return; }
    let total = 0, built = 0;
    const gaps = w.gaps && w.gaps.length ? new Set(w.gaps) : null;
    for (const t of w.plan) {
      if (gaps && gaps.has(t)) continue;
      const s = sim._structs.get(st.structAt[t]);
      if (!s || s.cityId !== city.id || !WW.Structs.isWallish(s)) {
        // fremde Bauwerke auf dem Ring (Nachbarmauer, fremdes Feld) zählen nicht: dort kann nicht gebaut werden
        if (s && s.cityId !== -1 && s.cityId !== city.id) continue;
        if (s && KEEP[s.type]) continue;   // [walls] Gleis/Bahnhof/Fabrik im Ring: dort bleibt ein Durchlass
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
    const gaps = w.gaps && w.gaps.length ? new Set(w.gaps) : null;
    for (const t of w.plan) {
      if (gaps && gaps.has(t)) continue;
      if (WW.TERRAIN_LUT.walk[st.terrain[t]] <= 0) continue;
      const s = sim._structs.get(st.structAt[t]);
      if (s && s.cityId === city.id && WW.Structs.isWallish(s)) continue;
      if (s) {
        const lv0 = w.state === 'upgrading' ? w.target : Math.max(1, w.level || w.target || 1);
        if (railGate(sim, city, s, t, lv0, w.style === 'fence' ? 'fence' : wallStyle(gov, lv0), new Set(w.plan))) { if (w.gates && w.gates.indexOf(t) < 0) w.gates.push(t); continue; }   // [walls] Gleistor
        if (s.cityId !== -1 && s.cityId !== city.id) continue;
        if ((CORE[s.type] && s.type !== 'house') || KEEP[s.type]) continue;   // [walls] Industrie bleibt stehen
        WW.Structs.remove(sim, s);
      }
      const x = t % W, y = (t - x) / W;
      const lv = w.state === 'upgrading' ? w.target : Math.max(1, w.level || w.target || 1);
      const tt = st.terrain[t], nt = deforested(tt);
      if (nt !== tt) { st.terrain[t] = nt; sim.markDirty(t); }
      WW.Structs.create(sim, gateSet.has(t) ? 'gate' : 'wall', x, y, city.id, { level: lv, built: false, mat: w.style === 'fence' ? 'fence' : wallStyle(gov, lv) });   // [walls] Lagerzaun bleibt Zaun
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
        s.level = level; s.mat = wallStyle(gov, level);
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

  // [walls] Gleis auf dem Mauerverlauf: das Gleisstück wird zum Gleistor (type 'gate', rail: true, line = Strecke).
  // Züge fahren hindurch (js/sim/rail.js zählt es als Gleis), Eigene/Verbündete gehen durch, Feinde nicht – keine Lücke.
  function railGate(sim, city, s, t, level, mat, ringSet) {
    if (!s || s.type !== 'rail') return false;
    const oc = sim._cities.get(s.cityId);
    if (s.cityId !== -1 && s.cityId !== city.id && !(oc && oc.kingdomId === city.kingdomId)) return false;
    const W = sim.state.W, x = t % W, y = (t - x) / W, line = s.line, bridge = !!s.bridge;
    WW.Structs.remove(sim, s);
    const orient = ringSet.has(t - 1) && ringSet.has(t + 1) ? 'h' : 'v';
    const g = WW.Structs.create(sim, 'gate', x, y, city.id, { level: level || 1, built: false, mat: mat, orient: orient });
    if (!g) return false;
    g.rail = true; g.line = line; if (bridge) g.bridge = true;
    return true;
  }

  // [walls] Lagerzaun: Ring mit genau einem Tor, ohne Türme/Geräte, mat 'fence', Stufe 1
  function planFence(sim, city, reserve, margin, toward) {
    const st = sim.state, W = st.W;
    const ring = computeRing(sim, city, margin == null ? 1.5 : margin, reserve == null ? 5 : reserve);
    if (!ring || !ring.tiles.length) return false;
    // ein Tor: das zur Richtung toward nächste (sonst das erste); fehlt eins, wird das Randstück zum Zentrum hin genommen
    let gate = -1, bd = 1e18;
    const tx = toward ? toward.x : city.cx, ty = toward ? toward.y : city.cy + 99;
    for (const g of ring.gates) {
      const o = sim._structs.get(st.structAt[g]);
      if (o && !WW.Structs.isWallish(o) && (CORE[o.type] || KEEP[o.type] || (o.cityId !== -1 && o.cityId !== city.id))) continue;   // Tor nicht auf ein Gebäude
      const gx = g % W, gy = (g - gx) / W, d = (gx - tx) * (gx - tx) + (gy - ty) * (gy - ty);
      if (d < bd) { bd = d; gate = g; }
    }
    if (gate < 0) return false;
    WW.Growth.claimTiles(sim, city, ring.all.concat(ring.inside));
    for (let i = 0; i < st.inRing.length; i++) if (st.inRing[i] === city.id) st.inRing[i] = -1;
    for (const i of ring.inside) if (st.inRing[i] === -1) st.inRing[i] = city.id;
    for (const i of ring.inside) {
      const s = sim._structs.get(st.structAt[i]);
      if (s && s.type === 'field' && s.cityId === city.id) WW.Structs.remove(sim, s);
    }
    for (const t of ring.tiles) {
      const x = t % W, y = (t - x) / W;
      let s = sim._structs.get(st.structAt[t]);
      const want = t === gate ? 'gate' : 'wall';
      if (s && s.cityId === city.id && WW.Structs.isWallish(s)) { if (s.type === want) continue; WW.Structs.remove(sim, s); s = null; }
      else if (s) {
        if (s.cityId !== -1 && s.cityId !== city.id) continue;
        if (CORE[s.type] || KEEP[s.type] || s.type === 'memorial') continue;
        WW.Structs.remove(sim, s);
      }
      const tt = st.terrain[t], nt = deforested(tt);
      if (nt !== tt) { st.terrain[t] = nt; sim.markDirty(t); }
      WW.Structs.create(sim, want, x, y, city.id, { level: 1, built: false, mat: 'fence', orient: ring.gateDir[t] || 'h' });
    }
    const w = city.wall;
    w.plan = ring.all.slice(); w.gaps = []; w.gates = [gate]; w.towers = []; w.old = [];
    w.target = 1; w.level = 0; w.style = 'fence'; w.state = 'building'; w.plannedYear = st.year; w.inside = ring.inside.length;
    w.expansions = 0; w.devices = []; w.name = WW.WALL_STYLE_NAMES.fence || 'Zaun';
    refreshCounts(sim, city);
    WW.Cities.refreshLists(sim, city);
    st.pathVersion++;
    return true;
  }
  // [walls] Lagerzaun pflegen; true = eben fertig geworden
  function fenceUpdate(sim, city) {
    const w = city.wall;
    if (!w || w.style !== 'fence' || !w.plan) return false;
    repairPlan(sim, city);
    refreshCounts(sim, city);
    if (w.state === 'building' && w.total > 0 && w.built >= w.total) { w.state = 'done'; w.level = 1; return true; }
    if (w.state === 'done' && w.built < w.total) w.level = 1;   // Bresche: bleibt Zaun, wird geflickt
    return false;
  }

  // Alle 3 s je Stadt
  function update(sim, city) {
    const st = sim.state, w = city.wall;
    if (w && w.style === 'fence') { fenceUpdate(sim, city); return; }   // [walls] Lagerzaun
    const k = sim._kingdoms.get(city.kingdomId);
    if (!k) return;
    const gov = WW.GOVERNMENTS[k.gov];
    const vars = { city: city.name, kingdom: k.name };
    const at = { kingdomId: k.id, cityId: city.id, x: city.cx + 0.5, y: city.cy + 0.5 };
    if (!w.state || w.state === 'none') {
      const ctr = sim._structs.get(city.centerId);
      // ein Zeltlager zieht noch keine Palisade: erst ab Dorfhalle
      if (city.pop >= gov.wallThreshold && city.centerOk && ctr && (ctr.stage || 0) >= 1 && (city.builtHouses || 0) >= 3) {
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
        // Geräte sofort auf den fertigen (auch erweiterten) Ring setzen, nicht erst beim nächsten Durchlauf
        assignDevices(sim, city, gov);
        w.devSig = gov.key + ':' + (w.level || 0) + ':' + (w.built || 0) + ':' + (w.plan ? w.plan.length : 0);
      }
      return;
    }
    // [walls] Regierungswechsel: Stufe begrenzen, Geräte umstellen
    clampLevel(sim, city, gov);
    // Geräte neu verteilen, sobald sich Regierung, Stufe oder die Menge fertiger Stücke ändert (Erweiterung, Umbau, Bresche)
    const sig = gov.key + ':' + (w.level || 0) + ':' + (w.built || 0) + ':' + (w.plan ? w.plan.length : 0);
    if (w.devSig !== sig) { assignDevices(sim, city, gov); w.devSig = sig; }
    w.name = levelName(gov, Math.max(1, w.level || 1));
    const classic = !gov.barricades && gov.key !== 'tribe';
    if (w.state === 'upgrading') {
      if (w.built >= w.total) {
        w.level = w.target; w.style = wallStyle(gov, w.level); w.state = 'done';
        w.name = levelName(gov, w.level);
        if (classic && w.level <= 3) sim.event(w.level >= 3 ? 'wallFortressDone' : 'wallStoneDone', vars, at);
        else sim.event('wallLevelDone', Object.assign({ name: w.name }, vars), at);
        assignDevices(sim, city, gov);
      }
      return;
    }
    // fertig: Ausbau oder Erweiterung?
    const stock = WW.Cities.stock(sim, city);
    const maxLv = gov.wallMax || 3;
    if (w.built >= w.total && w.level < maxLv && !sim._noWallUpgrade) {
      const next = w.level + 1;
      const info = levelInfo(gov, next);
      const req = (info && info.req) || {};
      const popReq = next === 2 && classic ? Math.max(15, gov.wallThreshold + 5) : (req.pop || 0);
      const goldOk = !req.gold || gov.goldMul <= 0 || stock.gold >= req.gold;
      if (city.pop >= popReq && city.tier >= (req.tier || 0) && stock.stone >= (req.stone || 0) && stock.wood >= (req.wood || 0) && goldOk) {
        startUpgrade(sim, city, next);
        w.style = wallStyle(gov, next);
        if (classic && next <= 3) sim.event(next === 2 ? 'wallStone' : 'wallFortress', vars, at);
        else sim.event('wallLevel', Object.assign({ name: levelName(gov, next) }, vars), at);
        return;
      }
    }
    if (city.noSpace && st.year - (w.plannedYear || 0) >= WW.CONFIG.WALL_EXPAND_YEARS && city.pop >= city.housing - 3) {
      const lv = Math.max(1, w.level);   // [walls]
      const before = w.plan ? w.plan.length : 0;
      if (!plan(sim, city, WW.CONFIG.WALL_MARGIN, lv, true)) { w.plannedYear = st.year; w.maxed = true; }
      else {
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
    return { level: 0, target: 0, total: 0, built: 0, style: 'none', state: 'none', plan: null, gates: [], towers: [], gaps: [], old: [], expansions: 0, plannedYear: 0, inside: 0 };
  }

  WW.Walls = {
    computeRing: computeRing, plan: plan, update: update, refreshCounts: refreshCounts,
    startUpgrade: startUpgrade, demolishAll: demolishAll, emptyWall: emptyWall, wallStyle: wallStyle,
    deforested: deforested, CORE: CORE, maxReserve: maxReserve,
    levelInfo: levelInfo, levelName: levelName, assignDevices: assignDevices, clampLevel: clampLevel,   // [walls]
    planFence: planFence, fenceUpdate: fenceUpdate   // [walls] Lagerzaun
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
