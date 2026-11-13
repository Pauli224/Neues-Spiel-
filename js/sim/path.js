// Wegfindung: A* auf dem Kachelraster, 8 Richtungen, kein Durchschlüpfen an Ecken,
// Durchbruchskosten für Feinde, Knotenlimit und Budget pro Tick, Zusammenhangskomponenten.
(function (WW) { 'use strict';

  const DX = [0, 1, 0, -1, 1, 1, -1, -1];
  const DY = [-1, 0, 1, 0, -1, 1, 1, -1];
  const SQ2 = Math.SQRT2;
  const BREACH_WALL = 26, BREACH_GATE = 14;

  // Kostentabellen je Volk (1 / walk, 0 = unbegehbar)
  function buildCostTables() {
    const tables = {};
    const n = WW.TERRAIN.length;
    for (const rk of WW.RACE_KEYS) {
      const race = WW.RACES[rk];
      const c = new Float32Array(n);
      const sp = new Float32Array(n);
      for (let t = 0; t < n; t++) {
        let w = WW.TERRAIN_LUT.walk[t];
        const key = WW.TERRAIN[t].key;
        if (w > 0 && race.walkOverride && race.walkOverride[key]) w = race.walkOverride[key];
        sp[t] = w;
        c[t] = w > 0 ? 1 / w : 0;
      }
      tables[rk] = { cost: c, speed: sp };
    }
    return tables;
  }

  function init(sim) {
    const N = sim.state.W * sim.state.H;
    sim._tables = buildCostTables();
    sim._g = new Float32Array(N);
    sim._came = new Int32Array(N);
    sim._seen = new Uint32Array(N);
    sim._closed = new Uint32Array(N);
    sim._stamp = 1;
    sim._heap = new Int32Array(N + 8);
    sim._heapF = new Float32Array(N + 8);
    sim.comp = new Int32Array(N);
    sim._compDirty = true;
  }

  // Bündnis oder gleiches Reich
  function friendly(sim, ka, kb) {
    if (ka === kb) return true;
    if (ka < 0 || kb < 0) return false;
    const k = sim._kingdoms.get(ka);
    const r = k && k.relations[kb];
    return !!(r && r.status === 'alliance');
  }
  function hostileKingdoms(sim, ka, kb) {
    if (ka === kb || ka < 0 || kb < 0) return false;
    const k = sim._kingdoms.get(ka);
    const r = k && k.relations[kb];
    return !!(r && r.status === 'war');
  }

  // Gehört das Tor auf Kachel i einem Freund von Reich k?
  function gateFriendly(sim, i, k) {
    const s = sim._structs.get(sim.state.structAt[i]);
    if (!s) return true;
    const c = sim._cities.get(s.cityId);
    if (!c) return true;
    return friendly(sim, k, c.kingdomId);
  }

  // Kann eine Einheit (Reich k) die Kachel betreten?
  function passable(sim, i, k) {
    const st = sim.state;
    if (i < 0 || i >= st.W * st.H) return false;
    if (WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0) return false;
    const b = sim.block[i];
    if (b === 0) return true;
    if (b === 1) return false;
    return gateFriendly(sim, i, k);
  }
  function walkable(sim, i) {
    return WW.TERRAIN_LUT.walk[sim.state.terrain[i]] > 0;
  }

  // Zusammenhangskomponenten des begehbaren Geländes (Bauwerke ignoriert)
  function updateComponents(sim) {
    const st = sim.state, W = st.W, H = st.H, N = W * H;
    const comp = sim.comp, walk = WW.TERRAIN_LUT.walk, ter = st.terrain;
    comp.fill(-1);
    const q = new Int32Array(N);
    let label = 0;
    for (let s = 0; s < N; s++) {
      if (comp[s] !== -1 || walk[ter[s]] <= 0) continue;
      let qh = 0, qt = 0;
      q[qt++] = s; comp[s] = label;
      while (qh < qt) {
        const i = q[qh++], x = i % W, y = (i - x) / W;
        for (let d = 0; d < 8; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (comp[n] !== -1 || walk[ter[n]] <= 0) continue;
          if (d >= 4 && walk[ter[y * W + nx]] <= 0 && walk[ter[ny * W + x]] <= 0) continue;
          comp[n] = label; q[qt++] = n;
        }
      }
      label++;
    }
    sim._compDirty = false;
  }

  // A*. o = { k, race, breach, limit, maxCost }
  // Rückgabe: Array von Kachel-Indizes (ohne Start, mit Ziel), null = kein Weg, false = Budget leer
  function find(sim, from, goal, o) {
    const st = sim.state, W = st.W, H = st.H, N = W * H;
    if (from < 0 || from >= N || goal < 0 || goal >= N) return null;
    if (from === goal) return [];
    if (sim._compDirty) updateComponents(sim);
    if (sim.comp[from] < 0 || sim.comp[from] !== sim.comp[goal]) return null;
    if (sim._pathBudget <= 0) return false;
    const k = o.k, breach = !!o.breach;
    const tab = sim._tables[o.race] || sim._tables.human;
    const cost = tab.cost, ter = st.terrain, block = sim.block;
    const want = o.limit || WW.CONFIG.PATH_LIMIT;
    const limit = Math.min(want, sim._pathBudget + 200);
    let stamp = ++sim._stamp;
    if (stamp >= 0xfffffff0) { sim._seen.fill(0); sim._closed.fill(0); sim._stamp = stamp = 1; }
    const g = sim._g, came = sim._came, seen = sim._seen, closed = sim._closed;
    const heap = sim._heap, hf = sim._heapF;
    let size = 0;
    const gx = goal % W, gy = (goal - gx) / W;
    const hmul = 0.9;

    // Zustand einer Kachel: 0 frei, 1 gesperrt, 2 Durchbruch nötig (Kosten addiert)
    const gateCache = sim._gateCache || (sim._gateCache = new Map());
    gateCache.clear();
    function blockState(n) {
      const b = block[n];
      if (b === 0) return 0;
      if (b === 2) {
        let f = gateCache.get(n);
        if (f === undefined) { f = gateFriendly(sim, n, k); gateCache.set(n, f); }
        if (f) return 0;
        return breach ? 3 : 1;
      }
      return breach ? 2 : 1;
    }

    g[from] = 0; seen[from] = stamp; came[from] = -1;
    heap[0] = from; hf[0] = 0; size = 1;
    let expanded = 0, found = false;
    while (size > 0) {
      // pop
      const cur = heap[0];
      const lastI = heap[--size], lastF = hf[size];
      if (size > 0) {
        let p = 0;
        for (;;) {
          let c = 2 * p + 1;
          if (c >= size) break;
          if (c + 1 < size && hf[c + 1] < hf[c]) c++;
          if (hf[c] >= lastF) break;
          heap[p] = heap[c]; hf[p] = hf[c]; p = c;
        }
        heap[p] = lastI; hf[p] = lastF;
      }
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp;
      if (cur === goal) { found = true; break; }
      if (++expanded > limit) break;
      const cx = cur % W, cy = (cur - cx) / W;
      const gc = g[cur];
      for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d], ny = cy + DY[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (closed[n] === stamp) continue;
        let c = cost[ter[n]];
        if (c === 0) continue;
        const bs = blockState(n);
        if (bs === 1) continue;
        if (d >= 4) {
          // Diagonale nur, wenn beide Nachbarn wirklich frei sind (kein Durchschlüpfen)
          const a = cy * W + nx, b = ny * W + cx;
          if (cost[ter[a]] === 0 || blockState(a) !== 0) continue;
          if (cost[ter[b]] === 0 || blockState(b) !== 0) continue;
          c *= SQ2;
        }
        if (bs === 2) c += BREACH_WALL; else if (bs === 3) c += BREACH_GATE;
        const ng = gc + c;
        if (seen[n] === stamp && ng >= g[n]) continue;
        seen[n] = stamp; g[n] = ng; came[n] = cur;
        const ddx = Math.abs(nx - gx), ddy = Math.abs(ny - gy);
        const h = (ddx > ddy ? ddx + 0.414 * ddy : ddy + 0.414 * ddx) * hmul;
        // push
        let p = size++;
        const f = ng + h;
        while (p > 0) {
          const par = (p - 1) >> 1;
          if (hf[par] <= f) break;
          heap[p] = heap[par]; hf[p] = hf[par]; p = par;
        }
        heap[p] = n; hf[p] = f;
      }
    }
    sim._pathBudget -= expanded + 1;
    // Abbruch nur wegen leerem Budget: später nochmal versuchen (kein „kein Weg“)
    if (!found) return (expanded > limit && limit < want) ? false : null;
    const path = [];
    let c = goal;
    while (c !== from && c >= 0) { path.push(c); c = came[c]; }
    path.reverse();
    return path;
  }

  // Nächste begehbare (für Reich k) Kachel ab i, spiralförmig bis Radius maxR
  function nearestFree(sim, i, k, maxR) {
    const st = sim.state, W = st.W, H = st.H;
    if (passable(sim, i, k)) return i;
    const x0 = i % W, y0 = (i - x0) / W;
    for (let r = 1; r <= (maxR || 8); r++) {
      let best = -1, bd = 1e9;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = x0 + dx, y = y0 + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const n = y * W + x;
        if (!passable(sim, n, k)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = n; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // Begehbare Nachbarkachel von i (oder i selbst), am nächsten zu Kachel 'near'
  function approachTile(sim, i, k, near) {
    const st = sim.state, W = st.W, H = st.H;
    if (passable(sim, i, k)) return i;
    const x0 = i % W, y0 = (i - x0) / W;
    const nx0 = near % W, ny0 = (near - nx0) / W;
    let best = -1, bd = 1e9;
    for (let d = 0; d < 8; d++) {
      const x = x0 + DX[d], y = y0 + DY[d];
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const n = y * W + x;
      if (!passable(sim, n, k)) continue;
      const dd = (x - nx0) * (x - nx0) + (y - ny0) * (y - ny0) + (d >= 4 ? 0.5 : 0);
      if (dd < bd) { bd = dd; best = n; }
    }
    return best;
  }

  WW.Path = {
    init: init, find: find, passable: passable, walkable: walkable, nearestFree: nearestFree,
    approachTile: approachTile, updateComponents: updateComponents, friendly: friendly,
    hostileKingdoms: hostileKingdoms, DX: DX, DY: DY
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
