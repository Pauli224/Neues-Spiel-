// =============================================================================
// Wuselwelt – Eisenbahn. DOM-frei, deterministisch (verbraucht KEINEN sim.rng; Hashes aus Seed/Tick).
// Daten: WW.RAIL in js/core/config-industry.js (Regierungen, Takte, Kosten), WW.STRUCT_INFO.station/.rail.
// Takt aus js/sim/industry.js (WW.Industry.tick ruft WW.Rail.tick). Lädt nach js/sim/industry.js, vor sim.js.
//
// STRECKEN verbinden Bahnhöfe verschiedener Städte (Abstand RAIL.MIN_DIST..MAX_DIST, Manhattan) desselben Reichs als
//   Spannbaum, dazu je verbündetes Bahn-Reich das nächste Bahnhofspaar (line.ally = Reichs-ID). Ein Reich mit nur einer
//   Stadt wartet auf die zweite. Bahnhöfe liegen auf der der Nachbarstadt zugewandten Seite.
// WER: Reiche mit Regierung in WW.RAIL.GOVS (Standard: Kommunismus, Faschismus) und mindestens zwei Städten ab
//   Stufe „Stadt" (tier ≥ WW.RAIL.MIN_TIER). Weltgesetz 'industry' aus = keine neuen Bahnen, Züge stehen.
//   Wechselt die Regierung weg von der Bahn, bleiben die Gleise liegen, Züge fahren nicht mehr.
// BAUWERKE
//   station  2×2, außerhalb des Mauerrings (Platzsuche wie Fabriken), je Stadt einer. Feld line? nein; style = Regierung.
//   rail     1×1, begehbar (sperrt nie), cityId = zuständige Stadt (baut und repariert), Felder:
//            mask  Bit0 N, Bit1 O, Bit2 S, Bit3 W: Nachbar ist Gleis oder Bahnhof (Kurven/Kreuzungen zeichnen)
//            bridge true = auf Fluss (Brücke zeichnen)
//            line  ID der Strecke (state.rail.lines[].id)
//            railGate true = Gleis liegt auf einem Mauerverlauf ohne Stück (Altbestand/Übergang).
//   Gleistor: wird ein Mauerring über ein Gleis geplant, macht js/sim/walls.js das Stück zum Tor mit Gleis (struct type
//   'gate', rail: true, line). Es zählt als Gleis (Masken, Fahrt, Trasse) und sperrt Feinde wie jedes Tor – keine Lücke.
//   Gleise entstehen Stück für Stück als Baustellen (höchstens RAIL.SITES je Strecke gleichzeitig) und werden von den
//   Baumeistern gebaut (Lager-Insassen helfen, siehe js/sim/camps.js). Wald auf der Trasse wird gerodet (state.cleared).
//   Zerstörtes Gleis (Krieg, Kräfte) = Lücke: Züge halten davor, die Stadt setzt eine neue Baustelle (Reparatur).
// ZUSTAND
//   state.rail = { lines: [{ id, kingdomId, a, b (Bahnhof-IDs), tiles [Kachel-Indizes von a nach b], done (ganz gebaut),
//                  opened (Eröffnung in der Chronik), broken (Lücke gemeldet) }], seq, fail { 'a-b': Jahr } }
//   state.trains[] = { id, kingdomId, kind 'freight'|'troop'|'prison', x, y (Kachelkoord., Fließkomma), dir 0 O | 1 S | 2 W | 3 N,
//                  cars (Wagen), cargo { food, wood, stone, gold }, from, to (Bahnhof-IDs), t ('load'|'run'|'blocked'),
//                  line (ID), pos (Index entlang line.tiles, Fließkomma), fw (+1 a->b | -1), wait (Ticks), troops [Einheiten-IDs], coal (fährt mit Kohle: schneller) }
//   Einheiten im Zug: u.ind = 'train', u.train = Zug-ID (laufen nicht selbst; js/sim/units.js überspringt sie, markierte Zeile)
// NUTZEN: Güterzug gleicht beim Abfahren Vorräte aus (Überschuss der Abfahrtsstadt -> Zielstadt; Kommunismus hat ohnehin ein
//   gemeinsames Lager). Truppenzug: im Krieg steigen marschierende Soldaten am Bahnhof zu, wenn der andere Bahnhof näher am
//   Ziel liegt, und steigen dort aus. Brennstoff je Abfahrt: stock.coal, wenn vorhanden, sonst Holz (RAIL.FUEL).
//   Ohne Kohle und Holz fährt der Zug im Notbetrieb (tr.slow = true, halbes Tempo).
//   Fahrende Züge stoßen Qualm aus (WW.Industry: RAIL.EMIT in die Zelle des Zugs).
// FX: trainsmoke { x, y } (alle 8 Ticks je fahrendem Zug), whistle { x, y } (Abfahrt)
// EREIGNISSE (group 'economy'|'war', mit effectText): railStation, railFirst, railBroken, railRepaired, railTroops
// LAGERSTADT (js/sim/camps.js, city.kind 'camp'): Reiche mit Bahn geben jeder Lagerstadt, sobald ihr Zaun steht, eine
//   Verladerampe (Bauwerk 'station' mit Feld campStation: true, 2×2, vor dem Lagertor außerhalb des Zauns; Sprite
//   's_camp_station') und ein Gleis zum Bahnhof der Mutterstadt (city.campHome; fehlt dort ein Bahnhof, wird einer gebaut).
//   Der Zaun bleibt dicht (das Gleis endet vor dem Tor). line.camp = ID der Lagerstadt; camp.station = Rampen-ID,
//   camp.railLine = Strecken-ID. Gebaut von Wachen und Insassen (Bautrupp der Lagerstadt) und dem Bautrupp der Strecke.
//   Güterzug (kind 'freight') pendelt: ab Lager lädt er alles Erarbeitete (Stein, Holz, Eisen, Kohle, Gold, Kristall)
//   und liefert es in der Mutterstadt ab; Brennstoff zahlt die Mutterstadt. Truppenzug (kind 'troop') bringt neue Wachen.
//   Gefangenenzug (kind 'prison'): Gefangene sammeln sich am Bahnhof der Mutterstadt und fahren zur Rampe; Felder
//   prisoners [Einheiten-IDs an Bord], guards (Zahl der mitfahrenden Wachen, nur Anzeige), camp (Lagerstadt-ID).
//   Die Insassen steigen an der Rampe aus und gehen bewacht durchs Tor. Bleibt ein Gefangenenzug liegen (Gleis zerstört,
//   Lager befreit oder erobert; liegengeblieben = über 8 Ticks vor einer Lücke), kommen die Insassen frei
//   (WW.Camps.trainFreed). Niemand stirbt im Zug. Im Zug tragen Gefangene das Reich des Zugs (u.kingdomId), sonst −1.
// SCHNITTSTELLE: WW.Rail.tick(sim), defaults(st), ride(sim, u), lineOf(sim, id), path(sim, a, b), emitters(sim),
//   campLineOf(sim, camp) -> fertige Strecke | null, prisonTrain(sim, camp, ids) -> Zug | null, guardTrain(sim, camp, u) -> bool
// =============================================================================
(function (WW) { 'use strict';

  const R = () => WW.RAIL;
  const TPY = () => WW.CONFIG.TPY;

  function defaults(st) {
    const r = st.rail && typeof st.rail === 'object' ? st.rail : {};
    r.lines = Array.isArray(r.lines) ? r.lines : [];
    r.seq = r.seq | 0;
    r.fail = r.fail && typeof r.fail === 'object' ? r.fail : {};
    st.rail = r;
    st.trains = Array.isArray(st.trains) ? st.trains : [];
  }
  function chron(sim, type, vars, city, group, eff) {
    const ev = sim.event(type, vars, city ? WW.Cities.atCity(city) : undefined);
    if (ev) { ev.group = group || 'economy'; ev.effectText = eff || ''; }
  }
  function govOk(sim, k) { return !!(k && R().GOVS[k.gov] && sim.state.laws.industry); }
  function lineOf(sim, id) { for (const l of sim.state.rail.lines) if (l.id === id) return l; return null; }
  function stationOf(sim, city) {
    for (const s of sim.state.structs) if (!s.dead && s.type === 'station' && s.cityId === city.id) return s;
    return null;
  }

  // ---------------------------------------------------------------------------
  // Trasse: A* auf dem Kachelraster (um Gebirge/Wasser herum, Flüsse als Brücke, keine Mauerringe)
  // ---------------------------------------------------------------------------
  function ringTiles(sim) {
    const set = new Set();
    for (const c of sim.state.cities) if (c.wall && c.wall.plan) for (const i of c.wall.plan) set.add(i);
    return set;
  }
  function stepCost(sim, i, kid, rings) {
    const st = sim.state, T = WW.T, LUT = WW.TERRAIN_LUT, t = st.terrain[i];
    const sid = st.structAt[i];
    if (sid !== -1) { const s0 = sim._structs.get(sid); if (s0 && s0.type === 'gate' && s0.rail) return 4; }   // vorhandenes Gleistor
    let c = 10;
    // Mauerringe des eigenen Reichs dürfen gequert werden (Mauerstück wird Gleistor, innen nur freie Kacheln), teuer
    const rc = st.inRing[i] !== -1 ? sim._cities.get(st.inRing[i]) : null;
    if (st.inRing[i] !== -1) { if (!rc || rc.kingdomId !== kid || rc.kind === 'camp') return -1; c += 30; }
    if (sid !== -1) {
      const s = sim._structs.get(sid);
      if (!s) return -1;
      if (s.type === 'rail') c = 4;
      else if (s.type === 'field' || s.type === 'ruin') c += 4;
      else if ((s.type === 'wall' || s.type === 'gate') && !s.device && sim._cities.get(s.cityId) && sim._cities.get(s.cityId).kingdomId === kid && sim._cities.get(s.cityId).kind !== 'camp') c += 60;
      else return -1;
    } else if (rings.has(i)) {
      const oc = sim._cities.get(st.owner[i]);
      if (!oc || oc.kingdomId !== kid) return -1;
      c += 60;
    }
    if (t === T.RIVER) return c + 30;
    if (LUT.walk[t] <= 0 || LUT.water[t]) return -1;
    if (LUT.wood[t]) c += 6;
    if (t === T.HILL) c += 8;
    if (t === T.SWAMP) c += 10;
    const o = st.owner[i];
    if (o >= 0) { const oc = sim._cities.get(o); if (oc && oc.kingdomId !== kid) c += 25; }
    return c;
  }
  function around(sim, s) {
    const st = sim.state, W = st.W, out = [];
    for (let dx = 0; dx < s.w; dx++) { if (s.y > 0) out.push((s.y - 1) * W + s.x + dx); if (s.y + s.h < st.H) out.push((s.y + s.h) * W + s.x + dx); }
    for (let dy = 0; dy < s.h; dy++) { if (s.x > 0) out.push((s.y + dy) * W + s.x - 1); if (s.x + s.w < W) out.push((s.y + dy) * W + s.x + s.w); }
    return out;
  }
  function path(sim, a, b, kid) {
    const st = sim.state, W = st.W, H = st.H, N = W * H;
    const rings = ringTiles(sim);
    const goal = new Set(around(sim, b));
    const gx = b.x + b.w / 2, gy = b.y + b.h / 2;
    let g = sim._railG, from = sim._railF, seen = sim._railS;
    if (!g || g.length !== N) { g = sim._railG = new Float64Array(N); from = sim._railF = new Int32Array(N); seen = sim._railS = new Uint32Array(N); }
    sim._railGen = (sim._railGen | 0) + 1;
    const gen = sim._railGen;
    const heap = [], hf = [];
    const push = (i, f) => {
      heap.push(i); hf.push(f);
      let k = heap.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; [hf[p], hf[k]] = [hf[k], hf[p]]; k = p; }
    };
    const pop = () => {
      const top = heap[0], li = heap.pop(), lf = hf.pop();
      if (heap.length) {
        heap[0] = li; hf[0] = lf;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1; let m = k;
          if (l < heap.length && hf[l] < hf[m]) m = l;
          if (r < heap.length && hf[r] < hf[m]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]]; [hf[m], hf[k]] = [hf[k], hf[m]]; k = m;
        }
      }
      return top;
    };
    const hcost = (i) => (Math.abs((i % W) + 0.5 - gx) + Math.abs(Math.floor(i / W) + 0.5 - gy)) * 9;
    for (const i of around(sim, a)) {
      const c = stepCost(sim, i, kid, rings);
      if (c < 0) continue;
      seen[i] = gen; g[i] = c; from[i] = -1; push(i, c + hcost(i));
    }
    let n = 0, end = -1;
    while (heap.length && n++ < R().PATH_NODES) {
      const i = pop();
      if (goal.has(i)) { end = i; break; }
      const x = i % W, y = (i - x) / W;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
      for (const j of nb) {
        if (j < 0) continue;
        const c = stepCost(sim, j, kid, rings);
        if (c < 0) continue;
        const ng = g[i] + c;
        if (seen[j] === gen && g[j] <= ng) continue;
        seen[j] = gen; g[j] = ng; from[j] = i; push(j, ng + hcost(j));
      }
    }
    if (end < 0) return null;
    const out = [];
    for (let i = end; i !== -1; i = from[i]) out.push(i);
    out.reverse();
    return out.length <= R().MAX_LEN ? out : null;
  }

  // ---------------------------------------------------------------------------
  // Bauen
  // ---------------------------------------------------------------------------
  const railish = (s) => !!(s && (s.type === 'rail' || (s.type === 'gate' && s.rail)));   // Gleistor (walls.js) zählt als Gleis
  function isTrack(sim, i) { const s = sim._structs.get(sim.state.structAt[i]); return !!(s && (railish(s) || s.type === 'station')); }
  function updateMask(sim, i) {
    const st = sim.state, W = st.W, s = sim._structs.get(st.structAt[i]);
    if (!s || s.type !== 'rail') return;
    const x = i % W, y = (i - x) / W;
    let m = 0;
    if (y > 0 && isTrack(sim, i - W)) m |= 1;
    if (x < W - 1 && isTrack(sim, i + 1)) m |= 2;
    if (y < st.H - 1 && isTrack(sim, i + W)) m |= 4;
    if (x > 0 && isTrack(sim, i - 1)) m |= 8;
    if (s.mask !== m) { s.mask = m; sim.markDirty(i); }
  }
  function masksAround(sim, i) {
    const W = sim.state.W;
    updateMask(sim, i); updateMask(sim, i - 1); updateMask(sim, i + 1); updateMask(sim, i - W); updateMask(sim, i + W);
  }

  function placeStation(sim, city, k, partner) {
    const i = WW.Industry.findSpot(sim, city, 2, 2, partner ? { toward: { x: partner.cx + 0.5, y: partner.cy + 0.5 } } : null);
    if (i < 0) return null;
    const st = sim.state, W = st.W, x = i % W, y = Math.floor(i / W);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const s = sim._structs.get(st.structAt[(y + dy) * W + x + dx]);
      if (s && (s.type === 'ruin' || s.type === 'field')) WW.Structs.remove(sim, s);
    }
    const s = WW.Structs.create(sim, 'station', x, y, city.id, { style: k.gov });
    if (!s) return null;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const j = (y + dy) * W + x + dx; if (st.owner[j] === -1) { st.owner[j] = city.id; sim.markDirty(j); } }
    city.sites.push(s.id);
    chron(sim, 'railStation', { city: city.name }, city, 'economy', 'Bahnhof im Bau');
    return s;
  }

  // nächste Baustelle(n) einer Strecke setzen; Rückgabe false, wenn die Trasse neu geplant werden muss
  function buildLine(sim, line) {
    const st = sim.state, W = st.W, T = WW.T;
    const A = sim._structs.get(line.a), B = sim._structs.get(line.b);
    if (!A || !B || A.dead || B.dead) return false;
    const ca = sim._cities.get(A.cityId), cb = sim._cities.get(B.cityId);
    if (!ca || !cb) return false;
    let open = 0, missing = 0;
    const need = [];
    for (let n = 0; n < line.tiles.length; n++) {
      const i = line.tiles[n];
      let s = sim._structs.get(st.structAt[i]);
      if (s && (s.type === 'wall' || (s.type === 'gate' && !s.rail)) && toRailGate(sim, s, line)) s = sim._structs.get(st.structAt[i]);
      if (s && s.type === 'gate' && s.rail) continue;   // Gleistor: bauen die Baumeister der Stadt
      if (s && s.type === 'rail') { if (!s.built) open++; continue; }
      if (s && s.type !== 'field' && s.type !== 'ruin') return false;   // etwas anderes steht im Weg
      missing++;
      need.push(n);
    }
    // Gleisbautrupp: von beiden Enden her je RAIL.CREW_TILES Baustellen direkt am fertigen Gleis/Bahnhof fertig
    // (zusätzlich zu den Baumeistern, die oft Mauern vorhaben)
    const L = line.tiles.length;
    for (const dir of [1, -1]) {
      let done = 0;
      for (let q = 0; q < L && done < R().CREW_TILES; q++) {
        const n = dir > 0 ? q : L - 1 - q, i = line.tiles[n];
        let s = sim._structs.get(st.structAt[i]);
        if (s && s.type === 'gate' && s.rail) { if (s.built) continue; break; }
        if (!s || s.type === 'field' || s.type === 'ruin') { if (placeSite(sim, line, n, ca, cb)) open++; break; }   // Trupp setzt die Baustelle, gebaut wird beim nächsten Mal
        if (s.type !== 'rail') break;          // etwas anderes im Weg: hier endet der Trupp
        if (s.built) continue;
        const x = i % W;
        const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
        if (!nb.some((j) => { const o = j >= 0 && sim._structs.get(st.structAt[j]); return o && o.built && (railish(o) || o.type === 'station'); })) break;
        const c = sim._cities.get(s.cityId);
        if (!s.paid && c && WW.Cities.pay(sim, c, WW.Structs.siteCost(sim, s, c.id))) s.paid = true;
        if (!s.paid) break;
        WW.Structs.complete(sim, s); open--; done++; masksAround(sim, i);
      }
    }
    line.done = missing === 0 && open === 0;
    if (!missing) return true;
    // von beiden Enden her nach innen
    need.sort((p, q) => Math.min(p, line.tiles.length - 1 - p) - Math.min(q, line.tiles.length - 1 - q) || p - q);
    for (const n of need) {
      if (open >= R().SITES) break;
      const i = line.tiles[n], o = sim._structs.get(st.structAt[i]);
      if (o && o.type === 'rail') continue;   // schon vom Trupp gesetzt
      if (placeSite(sim, line, n, ca, cb)) open++;
    }
    return true;
  }
  // Gleis-Baustelle auf Trassen-Kachel n (Feld/Ruine weicht, Wald wird gerodet)
  function placeSite(sim, line, n, ca, cb) {
    const st = sim.state, W = st.W, T = WW.T, i = line.tiles[n];
    const old = sim._structs.get(st.structAt[i]);
    if (old && old.type !== 'field' && old.type !== 'ruin') return null;
    if (old) WW.Structs.remove(sim, old);
    const t = st.terrain[i];
    if (WW.TERRAIN_LUT.wood[t] && WW.Walls && WW.Walls.deforested) {
      st.terrain[i] = WW.Walls.deforested(t);
      if (st.cleared) st.cleared[i] = WW.CONFIG.CLEARED_MAX || 240;
      sim.terrainChanged();
    }
    const city = n < line.tiles.length / 2 ? ca : cb;
    const s = WW.Structs.create(sim, 'rail', i % W, Math.floor(i / W), city.id, { style: (sim._kingdoms.get(city.kingdomId) || {}).gov });
    if (!s) return null;
    s.line = line.id; s.bridge = st.terrain[i] === T.RIVER; s.mask = 0;
    city.sites.push(s.id);
    masksAround(sim, i);
    return s;
  }

  // Mauerstück des eigenen Reichs auf der Trasse wird Gleistor (Tor mit Gleis): dicht für Feinde, Züge fahren durch
  function toRailGate(sim, s, line) {
    const c = sim._cities.get(s.cityId), k = sim._kingdoms.get(line.kingdomId);
    if (!c || !k || c.kingdomId !== k.id || c.kind === 'camp' || s.device) return false;
    const st = sim.state, W = st.W, i = s.y * W + s.x, plan = new Set((c.wall && c.wall.plan) || []);
    s.type = 'gate'; s.rail = true; s.line = line.id; s.towerSpot = false;
    s.orient = plan.has(i - 1) && plan.has(i + 1) ? 'h' : 'v';
    s.maxHp = WW.Structs.maxHpFor(sim, s); s.hp = Math.min(s.hp, s.maxHp);
    WW.Structs.setBlockAt(sim, s); WW.Structs.updateMasksAround(sim, s.x, s.y);
    if (c.wall && c.wall.gates && c.wall.gates.indexOf(i) < 0) c.wall.gates.push(i);
    sim.markDirty(i); st.pathVersion++;
    return true;
  }

  function plan(sim) {
    const st = sim.state;
    // Strecken ohne Bahnhöfe auflösen
    st.rail.lines = st.rail.lines.filter((l) => { const a = sim._structs.get(l.a), b = sim._structs.get(l.b); return a && b && !a.dead && !b.dead; });
    for (const k of st.kingdoms) {
      if (!govOk(sim, k)) continue;
      const cities = k.cityIds.map((id) => sim._cities.get(id)).filter((c) => c && c.tier >= R().MIN_TIER && c.centerOk);
      if (cities.length < 2) continue;
      const stations = [];
      for (const c of cities) {
        let s = stationOf(sim, c);
        const g = WW.GOVERNMENTS[k.gov];
        const ringReady = !(g && g.wallMax > 0) || (c.wall && c.wall.plan && c.wall.plan.length) || c.pop >= 60;   // sonst reißt die erste Mauer ihn ab
        // Bahnhof auf der Seite der nächsten anderen Stadt des Reichs
        let partner = null, pd = 1e9;
        for (const o of cities) { if (o === c) continue; const d = Math.abs(o.cx - c.cx) + Math.abs(o.cy - c.cy); if (d < pd) { pd = d; partner = o; } }
        if (!s && ringReady && (c.railNext | 0) <= st.tick) { s = placeStation(sim, c, k, partner); if (!s) c.railNext = st.tick + (TPY() >> 1); }
        if (s && !s.built) {   // Bautrupp hilft auch am Bahnhof
          if (!s.paid && WW.Cities.pay(sim, c, WW.Structs.siteCost(sim, s, c.id))) s.paid = true;
          if (s.paid) { s.progress = Math.min(1, (s.progress || 0) + 0.25); if (s.progress >= 1) { WW.Structs.complete(sim, s); WW.Cities.refreshLists(sim, c); } }
        }
        if (s) stations.push(s);
      }
      if (stations.length < 2) continue;
      // Spannbaum nach Entfernung (Prim)
      const inT = [stations[0]], rest = stations.slice(1);
      while (rest.length) {
        let bi = -1, bj = -1, bd = 1e9;
        for (let i = 0; i < inT.length; i++) for (let j = 0; j < rest.length; j++) {
          const d = Math.abs(inT[i].x - rest[j].x) + Math.abs(inT[i].y - rest[j].y);
          if (d < bd) { bd = d; bi = i; bj = j; }
        }
        const a = inT[bi], b = rest[bj];
        rest.splice(bj, 1); inT.push(b);
        if (bd > R().MAX_DIST || bd < R().MIN_DIST || a.cityId === b.cityId) continue;   // keine Mini-Strecken
        let line = st.rail.lines.find((l) => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id));
        const key = Math.min(a.id, b.id) + '-' + Math.max(a.id, b.id);
        if (!line) {
          if (st.rail.fail[key] != null && st.year - st.rail.fail[key] < 5) continue;
          const p = path(sim, a, b, k.id);
          if (!p || p.length < R().MIN_LEN) { st.rail.fail[key] = st.year; continue; }
          line = { id: ++st.rail.seq, kingdomId: k.id, a: a.id, b: b.id, tiles: p, done: false, opened: false, broken: false };
          st.rail.lines.push(line);
        }
        line.kingdomId = k.id;
        if (!buildLine(sim, line)) {
          const p = path(sim, a, b, k.id);
          if (p && p.length >= R().MIN_LEN) { line.tiles = p; buildLine(sim, line); } else st.rail.fail[key] = st.year;
        }
      }
    }
    // Verbündete mit Bahn: nächstes Bahnhofspaar verbinden (Zug gleicht dann auch zwischen den Reichen aus)
    for (const k of st.kingdoms) {
      if (!govOk(sim, k)) continue;
      for (const oid in k.relations) {
        const o = sim._kingdoms.get(+oid);
        if (!o || o.id < k.id || k.relations[oid].status !== 'alliance' || !govOk(sim, o)) continue;
        const mine = st.structs.filter((s) => !s.dead && s.type === 'station' && (sim._cities.get(s.cityId) || {}).kingdomId === k.id);
        const theirs = st.structs.filter((s) => !s.dead && s.type === 'station' && (sim._cities.get(s.cityId) || {}).kingdomId === o.id);
        let a = null, b = null, bd = 1e9;
        for (const p of mine) for (const q of theirs) { const d = Math.abs(p.x - q.x) + Math.abs(p.y - q.y); if (d < bd) { bd = d; a = p; b = q; } }
        if (!a || bd > R().MAX_DIST || bd < R().MIN_DIST) continue;
        let line = st.rail.lines.find((l) => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id));
        const key = Math.min(a.id, b.id) + '-' + Math.max(a.id, b.id);
        if (!line) {
          if (st.rail.fail[key] != null && st.year - st.rail.fail[key] < 5) continue;
          const p = path(sim, a, b, k.id);
          if (!p || p.length < R().MIN_LEN) { st.rail.fail[key] = st.year; continue; }
          line = { id: ++st.rail.seq, kingdomId: k.id, a: a.id, b: b.id, tiles: p, done: false, opened: false, broken: false, ally: o.id };
          st.rail.lines.push(line);
        }
        if (!buildLine(sim, line)) { const p = path(sim, a, b, k.id); if (p && p.length >= R().MIN_LEN) { line.tiles = p; buildLine(sim, line); } else st.rail.fail[key] = st.year; }
      }
    }
    campLines(sim);
    // Masken der Strecken frisch halten (zerstörte Gleise, neue Nachbarn)
    const rings = ringTiles(sim);
    for (const l of st.rail.lines) for (const i of l.tiles) {
      updateMask(sim, i);
      const r = sim._structs.get(st.structAt[i]);
      if (r && r.type === 'rail') { const g = rings.has(i); if (!!r.railGate !== g) { r.railGate = g; sim.markDirty(i); } }
    }
  }

  // ---------------------------------------------------------------------------
  // Lagerstadt: Verladerampe und Gleis zur Mutterstadt
  // ---------------------------------------------------------------------------
  function campTown(sim, camp, k) {
    const h = sim._cities.get(camp.campHome);
    if (h && !h.dead && h.kind !== 'camp' && h.kingdomId === k.id && h.centerOk) return h;
    let best = null, bd = 1e9;
    for (const id of k.cityIds) {
      const c = sim._cities.get(id);
      if (!c || c.dead || c.kind === 'camp' || !c.centerOk) continue;
      const d = Math.abs(c.cx - camp.cx) + Math.abs(c.cy - camp.cy);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  // Verladerampe direkt vor dem Lagertor (außerhalb des Zauns)
  function placeRamp(sim, camp, k) {
    const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
    const g = (camp.wall.gates || [])[0];
    if (g == null) return null;
    const gx = g % W, gy = Math.floor(g / W), plan = new Set(camp.wall.plan || []);
    let best = -1, bd = 1e9;
    for (let y = gy - 6; y <= gy + 5; y++) for (let x = gx - 6; x <= gx + 5; x++) {
      if (x < 1 || y < 1 || x + 2 >= W || y + 2 >= H) continue;
      let ok = true;
      for (let dy = -1; dy <= 2 && ok; dy++) for (let dx = -1; dx <= 2 && ok; dx++) {
        const i = (y + dy) * W + x + dx, inner = dx >= 0 && dy >= 0 && dx < 2 && dy < 2;
        if (st.inRing[i] !== -1 || plan.has(i)) { ok = false; break; }   // samt Rand: nicht am Zaun kleben
        if (!inner) continue;
        const t = st.terrain[i];
        if (!LUT.build[t] || LUT.water[t]) { ok = false; break; }
        const o = st.owner[i];
        if (o !== -1 && o !== camp.id) { const oc = sim._cities.get(o); if (!oc || oc.kingdomId !== k.id) { ok = false; break; } }
        const s = sim._structs.get(st.structAt[i]);
        if (s && s.type !== 'field' && s.type !== 'ruin') { ok = false; break; }
      }
      if (!ok) continue;
      const d = Math.abs(x + 0.5 - gx) + Math.abs(y + 0.5 - gy);
      if (d < bd) { bd = d; best = y * W + x; }
    }
    if (best < 0) return null;
    const x = best % W, y = Math.floor(best / W);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const o = sim._structs.get(st.structAt[(y + dy) * W + x + dx]);
      if (o) WW.Structs.remove(sim, o);
    }
    const s = WW.Structs.create(sim, 'station', x, y, camp.id, { style: k.gov });
    if (!s) return null;
    s.campStation = true;
    camp.sites.push(s.id);
    chron(sim, 'railStation', { city: camp.name }, camp, 'economy', 'Verladerampe im Bau');
    return s;
  }
  function selfBuild(sim, s, payer) {
    if (!s || s.built) return;
    if (!s.paid && WW.Cities.pay(sim, payer, WW.Structs.siteCost(sim, s, payer.id))) s.paid = true;
    if (s.paid) { s.progress = Math.min(1, (s.progress || 0) + 0.25); if (s.progress >= 1) { WW.Structs.complete(sim, s); WW.Cities.refreshLists(sim, sim._cities.get(s.cityId) || payer); } }
  }
  function campLines(sim) {
    const st = sim.state;
    for (const camp of st.cities) {
      if (camp.dead || camp.kind !== 'camp' || !camp.wall || camp.wall.state !== 'done') continue;
      const k = sim._kingdoms.get(camp.kingdomId);
      if (!govOk(sim, k)) continue;
      const town = campTown(sim, camp, k);
      if (!town) continue;
      let a = stationOf(sim, camp);
      if (!a && (camp.railNext | 0) <= st.tick) {
        a = placeRamp(sim, camp, k);
        if (!a) camp.railNext = st.tick + (TPY() >> 1);
      }
      let b = stationOf(sim, town);
      if (!b && (town.railNext | 0) <= st.tick) { b = placeStation(sim, town, k, camp); if (!b) town.railNext = st.tick + (TPY() >> 1); }
      selfBuild(sim, a, town); selfBuild(sim, b, town);
      if (!a || !b) continue;
      camp.station = a.id;
      let line = st.rail.lines.find((l) => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id));
      const key = Math.min(a.id, b.id) + '-' + Math.max(a.id, b.id);
      if (!line) {
        if (st.rail.fail[key] != null && st.year - st.rail.fail[key] < 3) continue;
        const p = path(sim, a, b, k.id);
        if (!p || p.length < 3) { st.rail.fail[key] = st.year; continue; }
        line = { id: ++st.rail.seq, kingdomId: k.id, a: a.id, b: b.id, tiles: p, done: false, opened: false, broken: false, camp: camp.id };
        st.rail.lines.push(line);
      }
      line.kingdomId = k.id; line.camp = camp.id; camp.railLine = line.id;
      if (!buildLine(sim, line)) { const p = path(sim, a, b, k.id); if (p && p.length >= 3) { line.tiles = p; buildLine(sim, line); } else st.rail.fail[key] = st.year; }
    }
  }
  function campLineOf(sim, camp) {
    const l = camp && camp.railLine != null ? lineOf(sim, camp.railLine) : null;
    if (!l || !l.done || l.camp !== camp.id) return null;
    const A = sim._structs.get(l.a), B = sim._structs.get(l.b);
    return A && B && A.built && B.built && !A.dead && !B.dead ? l : null;
  }
  // Bahnhof der Stadt am anderen Ende der Lagerstrecke
  function campTownStation(sim, camp) {
    const l = campLineOf(sim, camp);
    if (!l) return null;
    return sim._structs.get(l.a === camp.station ? l.b : l.a) || null;
  }
  // Gefangenenzug vom Bahnhof der Mutterstadt zur Rampe; ids = Einheiten (campState 'wait'). Rückgabe Zug | null
  function prisonTrain(sim, camp, ids) {
    const l = campLineOf(sim, camp), k = sim._kingdoms.get(camp.kingdomId);
    if (!l || !govOk(sim, k) || !ids.length) return null;
    if (sim.state.trains.some((t) => t.line === l.id && t.kind === 'prison')) return null;
    const tr = newTrain(sim, l, k, 'prison', l.a === camp.station ? -1 : 1);
    tr.cars = 2; tr.camp = camp.id; tr.prisoners = ids.slice(); tr.guards = 1 + Math.ceil(ids.length / 6);
    const from = cityOfStation(sim, tr.from), sf = from && WW.Cities.stock(sim, from);
    if (sf && typeof sf.coal === 'number' && sf.coal >= R().FUEL) { sf.coal -= R().FUEL; tr.coal = true; }
    else if (sf && sf.wood >= R().FUEL) sf.wood -= R().FUEL;
    tr.t = 'run';
    sim.fx({ type: 'whistle', x: tr.x, y: tr.y });
    return tr;
  }
  // Truppenzug bringt eine neue Wache zum Lager (nur wenn keiner unterwegs ist)
  function guardTrain(sim, camp, u) {
    const l = campLineOf(sim, camp), k = sim._kingdoms.get(camp.kingdomId);
    if (!l || !govOk(sim, k) || sim.state.trains.some((t) => t.line === l.id && t.kind === 'troop')) return false;
    const tr = newTrain(sim, l, k, 'troop', l.a === camp.station ? -1 : 1);
    tr.cars = 1;
    u.ind = 'train'; u.train = tr.id; u.moving = false; u.path = null; tr.troops.push(u.id);
    tr.t = 'run';
    sim.fx({ type: 'whistle', x: tr.x, y: tr.y });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Züge
  // ---------------------------------------------------------------------------
  function trackOk(sim, line, n) {
    const s = sim._structs.get(sim.state.structAt[line.tiles[n]]);
    return !!(s && railish(s) && (s.built || s.type === 'gate'));   // Gleistor im Bau: die Schienen liegen schon
  }
  function setPos(sim, tr, line) {
    const W = sim.state.W, L = line.tiles.length;
    const p = Math.max(0, Math.min(L - 1, tr.pos)), n0 = Math.floor(p), n1 = Math.min(L - 1, n0 + 1), f = p - n0;
    const i0 = line.tiles[n0], i1 = line.tiles[n1];
    const x0 = i0 % W + 0.5, y0 = Math.floor(i0 / W) + 0.5, x1 = i1 % W + 0.5, y1 = Math.floor(i1 / W) + 0.5;
    tr.x = x0 + (x1 - x0) * f; tr.y = y0 + (y1 - y0) * f;
    let dx = (x1 - x0) * tr.fw, dy = (y1 - y0) * tr.fw;
    if (dx || dy) tr.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
  }
  function endStation(sim, tr) { return sim._structs.get(tr.to); }
  function cityOfStation(sim, id) { const s = sim._structs.get(id); return s ? sim._cities.get(s.cityId) : null; }

  function depart(sim, tr, line) {
    const st = sim.state, C = R();
    const from = cityOfStation(sim, tr.from), to = cityOfStation(sim, tr.to);
    if (!from || !to) return false;
    const sf = WW.Cities.stock(sim, from);
    // Brennstoff: Kohle, sonst Holz (Lagerstrecke: zahlt die Mutterstadt)
    const fuelC = from.kind === 'camp' ? to : from, sfu = WW.Cities.stock(sim, fuelC);
    tr.slow = false;
    if (typeof sfu.coal === 'number' && sfu.coal >= C.FUEL) { sfu.coal -= C.FUEL; tr.coal = true; }
    else if (sfu.wood >= C.FUEL) { sfu.wood -= C.FUEL; tr.coal = false; }
    else { tr.coal = false; tr.slow = true; }   // ohne Brennstoff: Notbetrieb mit halbem Tempo (Reste, Gestrüpp)
    tr.cargo = { food: 0, wood: 0, stone: 0, gold: 0 };
    if (tr.kind === 'freight' && line.camp != null) {
      // ab Lager: alles Erarbeitete wird abgeholt (getrenntes Lager; im Kommunismus ist es ohnehin das Reichslager)
      const stt = WW.Cities.stock(sim, to);
      if (from.kind === 'camp' && sf !== stt) for (const r of ['wood', 'stone', 'iron', 'coal', 'gold', 'crystal']) {
        const v = Math.min(C.CAR_CAP * tr.cars, sf[r] || 0);
        if (v > 0.01) { sf[r] -= v; tr.cargo[r] = v; }
      }
      if (from.kind === 'camp') { let n = 0; for (const r in tr.cargo) n += tr.cargo[r]; from.campShipped = Math.round(((from.campShipped || 0) + n) * 10) / 10; }
    } else if (tr.kind === 'freight') {
      const stt = WW.Cities.stock(sim, to);
      if (sf !== stt) for (const r of ['food', 'wood', 'stone']) {
        const d = sf[r] - stt[r];
        if (d > C.BALANCE_MIN) { const amt = Math.min(C.CAR_CAP * tr.cars, d / 2); sf[r] -= amt; tr.cargo[r] = amt; }
      }
    }
    tr.t = 'run';
    sim.fx({ type: 'whistle', x: tr.x, y: tr.y });
    if (!line.opened) {
      line.opened = true;
      chron(sim, 'railFirst', { city: from.name, other: to.name }, from, 'economy', 'Vorräte werden zwischen den Städten ausgeglichen');
    }
    return true;
  }
  function arrive(sim, tr) {
    if (tr.kind === 'prison') { if (WW.Camps) WW.Camps.unload(sim, tr); tr.prisoners = []; tr.dead = true; return; }
    const to = cityOfStation(sim, tr.to);
    if (to) for (const r in tr.cargo) if (tr.cargo[r] > 0) WW.Cities.addStock(sim, to, r, tr.cargo[r]);
    tr.cargo = { food: 0, wood: 0, stone: 0, gold: 0 };
    // Soldaten steigen aus
    if (tr.troops && tr.troops.length) {
      const s = endStation(sim, tr);
      for (const id of tr.troops) {
        const u = sim._units.get(id);
        if (!u || u.dead) continue;
        u.ind = null; u.train = 0; u.path = null; u.moving = false;
        if (s) { u.x = tr.x; u.y = tr.y; }
      }
      tr.troops = [];
    }
    const f = tr.from; tr.from = tr.to; tr.to = f; tr.fw = -tr.fw;
    tr.t = 'load'; tr.wait = R().WAIT;
  }

  function boardTroops(sim, line, k) {
    const st = sim.state, C = R();
    if (!WW.Diplo.atWar(sim, k.id)) return;
    if (st.trains.some((t) => t.line === line.id && t.kind === 'troop')) return;
    const A = sim._structs.get(line.a), B = sim._structs.get(line.b);
    for (const [S, D, fw] of [[A, B, 1], [B, A, -1]]) {
      const sx = S.x + 1, sy = S.y + 1, dx = D.x + 1, dy = D.y + 1;
      const riders = [];
      for (const u of st.units) {
        if (u.dead || u.kingdomId !== k.id || u.role !== 'soldier' || u.ind || !u.order || u.order.kind !== 'march') continue;
        if ((u.x - sx) * (u.x - sx) + (u.y - sy) * (u.y - sy) > 36) continue;
        const tc = sim._cities.get(u.order.city);
        if (!tc) continue;
        const dS = Math.hypot(tc.cx - sx, tc.cy - sy), dD = Math.hypot(tc.cx - dx, tc.cy - dy);
        if (dD < dS - 15) riders.push(u);
        if (riders.length >= C.TROOPS) break;
      }
      if (riders.length < 3) continue;
      const tr = newTrain(sim, line, k, 'troop', fw);
      for (const u of riders) { u.ind = 'train'; u.train = tr.id; u.moving = false; u.path = null; tr.troops.push(u.id); }
      tr.t = 'run';
      sim.fx({ type: 'whistle', x: tr.x, y: tr.y });
      const c = sim._cities.get(S.cityId);
      chron(sim, 'railTroops', { city: c ? c.name : '', n: riders.length, kingdom: k.name }, c, 'war', riders.length + ' Soldaten fahren an die Front');
      return;
    }
  }

  function newTrain(sim, line, k, kind, fw) {
    const st = sim.state;
    const tr = { id: st.nextId++, kingdomId: k.id, kind: kind, x: 0, y: 0, dir: 0, cars: kind === 'troop' ? 2 : R().CARS,
      cargo: { food: 0, wood: 0, stone: 0, gold: 0 }, from: fw > 0 ? line.a : line.b, to: fw > 0 ? line.b : line.a,
      t: 'load', line: line.id, pos: fw > 0 ? 0 : line.tiles.length - 1, fw: fw, wait: R().WAIT, troops: [] };
    setPos(sim, tr, line);
    st.trains.push(tr);
    return tr;
  }

  function updateTrains(sim) {
    const st = sim.state, C = R();
    if (!st.trains.length) return;
    let gone = false;
    for (const tr of st.trains) {
      const line = lineOf(sim, tr.line), k = sim._kingdoms.get(tr.kingdomId);
      if (!line || !k) { gone = true; tr.dead = true; continue; }
      if (tr.kind === 'prison') {
        // Lager befreit/erobert, Strecke nicht mehr des Regimes oder Zug blockiert: die Insassen kommen frei
        const camp = sim._cities.get(tr.camp);
        if (!camp || camp.dead || camp.kind !== 'camp' || camp.kingdomId !== tr.kingdomId || !govOk(sim, k) || (tr.t === 'blocked' && (tr.blockedT = (tr.blockedT | 0) + 1) > 8)) {
          if (WW.Camps) WW.Camps.trainFreed(sim, tr);
          tr.prisoners = []; tr.dead = true; gone = true; continue;
        }
      }
      if (!govOk(sim, k)) continue;
      const L = line.tiles.length;
      if (tr.t === 'load') {
        if (--tr.wait <= 0 && !depart(sim, tr, line)) tr.wait = C.WAIT;
      } else {
        const np = tr.pos + tr.fw * C.SPEED * (tr.coal ? C.COAL_SPEED : 1) * (tr.slow ? 0.5 : 1);
        const n = tr.fw > 0 ? Math.min(L - 1, Math.ceil(np)) : Math.max(0, Math.floor(np));
        if (!trackOk(sim, line, n)) {
          if (tr.t !== 'blocked') {
            tr.t = 'blocked';
            if (!line.broken) {
              line.broken = true;
              const c = cityOfStation(sim, tr.from);
              chron(sim, 'railBroken', { city: c ? c.name : '' }, c, 'economy', 'Strecke unterbrochen, bis repariert');
            }
          }
        } else {
          if (tr.t === 'blocked') {
            tr.t = 'run';
            if (line.broken && line.tiles.every((i, q) => trackOk(sim, line, q))) {
              line.broken = false;
              const c = cityOfStation(sim, tr.from);
              chron(sim, 'railRepaired', { city: c ? c.name : '' }, c, 'economy', 'Strecke wieder frei');
            }
          }
          tr.pos = Math.max(0, Math.min(L - 1, np));
          setPos(sim, tr, line);
          if ((st.tick + tr.id) % 8 === 0) sim.fx({ type: 'trainsmoke', x: tr.x, y: tr.y });
          if ((tr.fw > 0 && tr.pos >= L - 1) || (tr.fw < 0 && tr.pos <= 0)) {
            arrive(sim, tr);
            if (tr.kind === 'troop' || tr.kind === 'prison') { tr.dead = true; gone = true; }
          }
        }
      }
      for (const id of tr.troops || []) {
        const u = sim._units.get(id);
        if (u && !u.dead) { u.x = tr.x; u.y = tr.y; }
      }
    }
    if (gone) {
      for (const tr of st.trains) if (tr.dead) for (const id of tr.troops || []) { const u = sim._units.get(id); if (u) { u.ind = null; u.train = 0; } }
      st.trains = st.trains.filter((t) => !t.dead);
    }
  }

  function spawnTrains(sim) {
    const st = sim.state;
    for (const line of st.rail.lines) {
      const k = sim._kingdoms.get(line.kingdomId);
      if (!govOk(sim, k) || !line.done) continue;
      const A = sim._structs.get(line.a), B = sim._structs.get(line.b);
      if (!A || !B || !A.built || !B.built) continue;
      if (!st.trains.some((t) => t.line === line.id && t.kind === 'freight')) newTrain(sim, line, k, 'freight', 1);
      boardTroops(sim, line, k);
    }
  }

  // Einheit im Zug (Haken aus units.js über WW.Industry.unit): true = nicht selbst bewegen
  function ride(sim, u) {
    const tr = sim.state.trains.find((t) => t.id === u.train);
    if (!tr) { u.ind = null; u.train = 0; return false; }
    u.x = tr.x; u.y = tr.y; u.moving = false;
    return true;
  }
  function emitters(sim) { return sim.state.trains.filter((t) => t.t === 'run'); }

  function tick(sim) {
    const st = sim.state;
    if (!st.rail || !st.trains) defaults(st);
    if (st.tick % R().PLAN_EVERY === 77) plan(sim);
    if (st.tick % 60 === 17) spawnTrains(sim);
    updateTrains(sim);
  }

  WW.Rail = { tick: tick, defaults: defaults, ride: ride, lineOf: lineOf, path: path, emitters: emitters, stationOf: stationOf, plan: plan,
    campLineOf: campLineOf, campTownStation: campTownStation, prisonTrain: prisonTrain, guardTrain: guardTrain };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
