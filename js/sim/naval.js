// =============================================================================
// Wuselwelt – Seefahrt: Häfen, Schiffe, Fischerei, Seehandel, Überfahrt von Siedlern, Truppenlandungen, Seegefechte.
// DOM-frei, deterministisch: verbraucht KEINEN sim.rng (Zufall aus Hashes von Seed/Tick/ID), kein Math.random/Date.
// Daten: WW.NAVAL in js/core/config-naval.js, Texte: js/data/texts-naval.js.
// LADEREIHENFOLGE: js/core/config-naval.js bei den Konfig-Dateien, js/data/texts-naval.js bei den Textdateien,
//   js/sim/naval.js nach js/sim/military.js (bzw. camps.js), unmittelbar vor js/sim/sim.js (index.html, tests/load.js).
// HAKEN (markiert // [see]):
//   sim.js    tick -> WW.Naval.tick(sim); defaults/create -> WW.Naval.defaults(st); actions -> WW.Naval.actions(sim, safe);
//             Konstruktor -> Object.assign(sim.query, WW.Naval.queries(sim)). Speichern/Laden braucht keinen Haken:
//             state.ships / state.naval sind reine Daten (keine Typed Arrays) und laufen über das normale JSON.
//   units.js  updateAll: Einheiten mit u.sea steuert WW.Naval.unit(sim, u) (zum Hafen gehen, an Bord, schwimmen).
//             buildBuckets: Einheiten an Bord (u.seaS === 'aboard') kommen nicht in die Nachbarschafts-Raster, sind also
//             weder Ziel noch Nachbar (billiger als eine Prüfung in hostile).
//   diplo.js  update: liegt die nächste Feindstadt auf einer anderen Landmasse -> WW.Naval.seaWar (Truppenlandung);
//             yearly: Kriegsgefahr auch zwischen Nachbarn über das Meer, wenn beide einen Hafen am selben Meer haben (seaReach)
//   powers.js nichts: die Kräfte hängt dieses Modul beim Laden an WW.POWERS / WW.POWER_KEYS an (wie military.js)
//   audio.js  Fx shipfire, shipsink, horn auf vorhandene Klänge
//
// HAFEN = Bauwerk type 'harbor' (2×2, WW.STRUCT_INFO.harbor), auf Land direkt an Meer/Flachwasser/Tiefsee
//   Felder zusätzlich zu den üblichen: dock (Kachel-Index der Anlegestelle IM WASSER, 4-Nachbar der Grundfläche),
//   dockDir 0 O | 1 S | 2 W | 3 N (Richtung Grundfläche -> Wasser; Steg zeigt dorthin), side 'e'|'s'|'w'|'n' (dasselbe als
//   Buchstabe = 3. Parameter von S.harborKey(gov, culture, dir)), style (Regierung, wie alle
//   Bauwerke), culture (Kultur der Stadt beim Bau), prod (Schiffsart im Bau | null), prog 0..1, made (gebaute Schiffe).
//   Sprite: S.harborKey(style, culture, side) -> 's_harbor_<stil>_<side>' (2×2 mit Steg zum dock). Baustelle wie jedes Bauwerk (!built).
//   Wer: Städte mit Küste ab Stufe „Dorf" (tier ≥ NAVAL.GOVS[gov].minTier, pop ≥ minPop; Handelsrepublik schon im Lager
//   ab 6 Einw.), je Stadt einer. Platz: außerhalb des Mauerrings (mit Gasse, nie auf Ring-Kacheln, ohne Ring mit Abstand
//   für den künftigen Ring) oder ganz innerhalb des Rings – der Ring wird nie angetastet und bleibt dicht. Wird der Hafen
//   bei einer Stadterweiterung überbaut, plant die Stadt später einen neuen.
//
// SCHIFFE state.ships[] (bewegliche Objekte wie Züge, KEINE Kachel-Meldungen; je Bild aus dem Zustand zeichnen):
//   { id, kingdomId, cityId (Heimatstadt), harborId (Heimathafen-ID | -1), kind, look, gov, culture,
//     x, y (Kachelkoord., Fließkomma; Mitte der Kachel = .5), dir 0 O | 1 S | 2 W | 3 N, moving (fährt gerade),
//     hp, maxHp, cargo { fish, gold, goods } (Ladung, für das Info-Fenster), passengers [Einheiten-IDs an Bord],
//     route [Kachel-Indizes der laufenden Fahrt] (NICHT dauerhaft zeichnen), ri (nächster Routenpunkt),
//     t ('dock' liegt im Hafen | 'load' wartet auf Passagiere | 'out' fährt hin | 'work' fischt / ankert / bewacht |
//        'back' fährt heim | 'sink' sinkt gerade, sinkT zählt herunter),
//     mission ({ kind 'fish'|'trade'|'settle'|'invade'|'escort'|'patrol'|'chase'|'home', … } | null), home (dock-Kachel),
//     wait (Ticks), coal (Dampfer mit Kohle: schneller, Rauch), cd (Nachladen), target (Ziel-Schiff | -1), trips, name, born }
//   kind:  'fishboat' (Fischerboot) | 'trader' (Handelsschiff) | 'transport' (Transporter) | 'warship' (Kriegsschiff)
//   look:  'canoe' (Stamm: alles sind Kanus) | 'sail' (Segelschiff) | 'steam' (Faschismus, Kommunismus: Dampfschiff)
//   Sprite: S.shipKey(kind, gov, dir, frame, culture) (4 Richtungen, 2 Phasen; look folgt aus gov, steht aber auch am
//   Schiff). Kultur: sahel/nil Dau- bzw. Nilbarke, nord Langschiff. Sinkend (t 'sink'): kippen/absacken über sinkT Ticks.
//   Fahren nur auf Meer/Flachwasser/Tiefsee (nie Fluss), eigene Wegsuche über Wasser (A*, Knotenlimit NAVAL.PATH_NODES,
//   Routen zwischengespeichert, Zwischenspeicher wird bei Änderung des Wassers verworfen).
//   Dampfer nehmen je Ausfahrt NAVAL.COAL_TRIP aus stock.coal (fehlt Kohle: langsamer als Segler, kein Rauch).
//
// AUFGABEN
//   fishboat  fährt zu einem Fischgrund (Vorkommen 'fish' in state.deposit bevorzugt, sonst freies Wasser 3–11 Kacheln
//             vor dem Hafen), fischt, bringt Fisch heim (stock.fish, ohne Fisch-Schlüssel: food).
//   trader    pendelt zwischen dem Heimathafen und einem Hafen des eigenen Reichs oder eines befreundeten Reichs (Bündnis
//             oder Frieden mit Meinung ≥ 0, beide Seiten); Ankunft: Gold für beide Städte (ohne Goldwirtschaft Waren:
//             Nahrung + Holz), Meinung +. Mehr Handelsschiffe bei der Handelsrepublik.
//   transport Siedler über das Meer (Reich ohne freies Land auf der eigenen Landmasse, Stadt ab Stufe „Stadt"): Siedler
//             gehen zum Hafen, gehen an Bord, landen an der fremden Küste und gründen dort eine Stadt (Rolle settler).
//             Krieg: Soldaten steigen ein, Landung nahe einer feindlichen Küstenstadt (außerhalb ihres Rings), danach
//             marschieren sie wie gewohnt (order march). Je Reich höchstens eine Landung zugleich, Abstand INVADE.every Jahre.
//   warship   Wache vor dem Hafen (patrol), Geleit für Transporter (escort), Seegefecht mit feindlichen Schiffen in
//             Reichweite, Verfolgung (chase); Regierungen mit Geschützen (WW.MIL.GOVS[gov].artillery bzw. NAVAL.GUN_GOVS)
//             beschießen Küstenmauern, -tore und -türme des Feindes.
//
// EINHEITEN auf See (Haken in units.js): u.sea = Schiff-ID (0 = an Land), u.seaS = 'board' (geht zum Hafen) |
//   'aboard' (an Bord: NICHT zeichnen, nicht anwählbar; x/y bleiben auf der Einstiegskachel an Land) |
//   'swim' (Schiffbrüchige: x/y ist schon die rettende Küstenkachel; Darstellung schwimmt von u.swim { x0, y0 } dorthin,
//   bis Tick u.swim.t1, Beginn u.swim.t0). Niemand ertrinkt: Schiffbrüchige kommen immer an Land.
//
// WRACKS: gesunkene Schiffe in Flachwasser (oder an seichter Stelle daneben) hinterlassen in state.wrecks (gemeinsam
//   mit dem Militär) { id, x, y, kind: 'ship', ship (Schiffsart), look, year, gov, k (Reich), rust 0..3 } – Sprite
//   d_wreck_ship. Ohne js/sim/military.js altert dieses Modul die Schiffswracks selbst (NAVAL.WRECK_YEARS).
//
// ZUSTAND state.naval = { seq, harbors [Hafen-IDs], colony { [kid]: Jahr }, invade { [kid]: Jahr }, noHarbor { [cityId]: Jahr },
//   first { [kid]: 1 }, ledger { [cityId]: Gold aus Seehandel insgesamt (Info-Fenster) },
//   mask (Base64-Bitmaske der Wasserkacheln, alle 60 Ticks erneuert; Grundlage von Zusammenhang und Routen-Zwischenspeicher),
//   maskVer (zählt bei Änderung),
//   stats { built, sunk, fish, trades, colonies, landings, wrecks } }
//
// FX (sim.drainFx), Koordinaten in Kacheln:
//   wake      { x, y, dir, kind }        Kielwasser hinter einem fahrenden Schiff (alle 8 Ticks)
//   sail      { x, y, dir, kind, look }  Ausfahrt: Segel/Kanu legt ab
//   splash    { x, y }                   (vorhanden) Einschlag im Wasser, Ausladen, Untergang
//   shipsmoke { x, y }                   Rauch eines Dampfers mit Kohle (alle 8 Ticks)
//   shipfire  { x, y, x2, y2, hit }      Breitseite eines Kriegsschiffs (auf Schiff oder Küste)
//   shipsink  { x, y, kind, look }       ein Schiff geht unter
//   swim      { x, y, x2, y2, n, t }     n Schiffbrüchige schwimmen in t Ticks an die Küste (comichaft, keiner ertrinkt)
//   horn      { x, y }                   Dampfer legt ab (Signalhorn)
//   explosion { x, y, r }                (vorhanden) Treffer an der Küste
//
// EREIGNISTYPEN (WW.Texts.EVENTS über js/data/texts-naval.js; ev.group 'economy'|'war', ev.effectText):
//   harborBuilt (erster Hafen der Stadt fertig), firstShip, seaTrade (gelegentlich), bigCatch (gelegentlich),
//   seaColony (Siedler legen ab), seaColonyLand (Siedler landen), seaInvasion (Truppen legen ab), seaLanding (Truppen
//   landen), seaBattle (Schiff versenkt, wichtig: ev.popup = 'battle'), shipwreck (sonstiger Untergang), seaBombard,
//   godHarbor, godShip
//
// KRÄFTE (WW.POWERS, Kategorie 'meddle'): navHarbor „Hafen setzen" (nächste Stadt ≤ 30 Kacheln, fertig gebaut),
//   navShip „Schiff setzen" (Kriegsschiff im Krieg, sonst Handelsschiff; Stamm: Kanu)
// AKTIONEN (sim.actions.*, werfen nie): placeHarbor(x, y, cityId?) -> Hafen-ID | null,
//   placeShip(x, y, kind?, kingdomId?) -> Schiff-ID | null
// ABFRAGEN (sim.query.*): ship(id), shipNear(x, y, r = 1.5), ships(kingdomId?) -> [Schiff], harborOf(cityId) -> Bauwerk | null,
//   navalStats(kingdomId) -> { ships { kind: n }, harbors, atSea }
// SCHNITTSTELLE WW.Naval: tick(sim), defaults(st), unit(sim, u), seaWar(sim, k, e, idle, marching) -> bool, seaReach(sim, a, b), actions, queries,
//   isSea(t), route(sim, from, to) -> [Kachel] | null, findHarborSpot(sim, city, near?) -> { x, y, dock, dockDir } | null,
//   spawnShip(sim, harborOrNull, kind, kingdomId, cityId, tile?) -> Schiff | null, sink(sim, ship, by), govSpec(gov),
//   speedOf(sim, ship), quota(sim, city, k, kind)
// =============================================================================
(function (WW) { 'use strict';

  const NV = () => WW.NAVAL;
  const CF = () => WW.CONFIG;
  const DX8 = [0, 1, 0, -1, 1, 1, -1, -1], DY8 = [-1, 0, 1, 0, -1, 1, 1, -1];
  const SQ2 = Math.SQRT2;
  const CREW = { fishboat: 2, trader: 3, transport: 4, warship: 6 };

  let SEA = null;
  function seaLut() {
    if (!SEA) { SEA = new Uint8Array(WW.TERRAIN.length); SEA[WW.T.DEEP] = 1; SEA[WW.T.WATER] = 1; SEA[WW.T.SHALLOW] = 1; }
    return SEA;
  }
  function isSea(t) { return seaLut()[t] === 1; }

  // Zufall aus Hashes (verbraucht keinen sim.rng)
  function mix(a, b) {
    let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return (h ^ (h >>> 15)) >>> 0;
  }
  function hr(sim, a, b) { return mix(mix((sim._seedHash | 0) ^ 0x5eaf00d, a | 0), b | 0) / 4294967296; }

  // Regierung gründet keine Siedlungen (WW.GOVERNMENTS[g].build.noSettle, PLAN-9 9.10: Faschismus); fehlt die Marke: false
  function noSettle(gov) { const g = WW.GOVERNMENTS && WW.GOVERNMENTS[gov]; return !!(g && g.build && g.build.noSettle); }
  function govSpec(gov) { return NV().GOVS[gov] || NV().GOVS.tribe; }
  function hasGuns(gov) {
    if (WW.MIL && WW.MIL.GOVS) return !!(WW.MIL.GOVS[gov] && WW.MIL.GOVS[gov].artillery);
    return !!NV().GUN_GOVS[gov];
  }
  function chron(sim, type, vars, at, group, eff) {
    const ev = sim.event(type, vars, at);
    if (ev) { ev.group = group || 'economy'; ev.effectText = eff || ''; }
    return ev;
  }
  function tileOf(sim, s) { const W = sim.state.W; return Math.floor(s.y) * W + Math.floor(s.x); }
  function stockOf(sim, city) { return WW.Cities.stock(sim, city); }
  function comps(sim) { if (sim._compDirty) WW.Path.updateComponents(sim); return sim.comp; }

  // ---------------------------------------------------------------------------
  // Zustand
  // ---------------------------------------------------------------------------
  function defaults(st) {
    st.ships = Array.isArray(st.ships) ? st.ships : [];
    const n = st.naval && typeof st.naval === 'object' ? st.naval : {};
    n.seq = n.seq | 0;
    n.harbors = Array.isArray(n.harbors) ? n.harbors : [];
    n.colony = n.colony && typeof n.colony === 'object' ? n.colony : {};
    n.invade = n.invade && typeof n.invade === 'object' ? n.invade : {};
    n.noHarbor = n.noHarbor && typeof n.noHarbor === 'object' ? n.noHarbor : {};
    n.first = n.first && typeof n.first === 'object' ? n.first : {};
    n.ledger = n.ledger && typeof n.ledger === 'object' ? n.ledger : {};
    n.mask = typeof n.mask === 'string' ? n.mask : '';   // Wasser-Schnappschuss (siehe seaInfo); leer = beim ersten Bedarf
    n.maskVer = n.maskVer | 0;
    const S = n.stats && typeof n.stats === 'object' ? n.stats : {};
    for (const k of ['built', 'sunk', 'fish', 'trades', 'colonies', 'landings', 'wrecks', 'invasions', 'troopsSent', 'troopsLanded']) S[k] = +S[k] || 0;
    n.stats = S;
    st.naval = n;
    if (!Array.isArray(st.wrecks)) st.wrecks = [];
    if (!n.harbors.length && Array.isArray(st.structs)) for (const s of st.structs) if (s && !s.dead && s.type === 'harbor') n.harbors.push(s.id);
    for (const s of st.ships) {
      if (!s.cargo || typeof s.cargo !== 'object') s.cargo = { fish: 0, gold: 0, goods: 0 };
      if (!Array.isArray(s.passengers)) s.passengers = [];
      if (!Array.isArray(s.route)) s.route = [];
      s.ri = s.ri | 0; s.wait = s.wait | 0; s.cd = s.cd | 0; s.trips = s.trips | 0;
      if (s.target == null) s.target = -1;
      if (s.mission === undefined) s.mission = null;
    }
  }
  function shipMap(sim) {
    const st = sim.state;
    let m = sim._shipMap;
    if (!m || sim._shipMapN !== st.ships.length || sim._shipMapDirty) {
      m = sim._shipMap = new Map();
      for (const s of st.ships) if (!s.dead) m.set(s.id, s);
      sim._shipMapN = st.ships.length; sim._shipMapDirty = false;
    }
    return m;
  }
  function shipById(sim, id) { return shipMap(sim).get(id) || null; }

  // ---------------------------------------------------------------------------
  // Wasser: Zusammenhang, Wegsuche (A*), begrenzte Breitensuche. Zwischenspeicher hängt nur am Wasser-Gelände.
  // ---------------------------------------------------------------------------
  // Wasser-Schnappschuss: state.naval.mask = Bitmaske (Base64) der Wasserkacheln, maskVer zählt bei Änderung.
  // Zusammenhang und Routen-Zwischenspeicher hängen NUR an diesem gespeicherten Schnappschuss (deterministisch auch nach
  // dem Laden); erneuert wird er alle 60 Ticks aus dem Gelände. Fahrende Schiffe prüfen jede Kachel am echten Gelände.
  function maskBytes(st) {
    const N = st.W * st.H, ter = st.terrain, L = seaLut(), out = new Uint8Array((N + 7) >> 3);
    for (let i = 0; i < N; i++) if (L[ter[i]]) out[i >> 3] |= 1 << (i & 7);
    return out;
  }
  function refreshMask(sim, force) {
    const st = sim.state, n = st.naval;
    const m = maskBytes(st);
    const old = sim._navMask && sim._navMaskVer === n.maskVer ? sim._navMask : (n.mask ? WW.SimUtil.decodeArray(n.mask, Uint8Array, m.length) : null);
    let same = !!old && old.length === m.length && !force;
    if (same) for (let i = 0; i < m.length; i++) if (old[i] !== m[i]) { same = false; break; }
    if (same) { sim._navMask = old; sim._navMaskVer = n.maskVer; return; }
    n.mask = WW.SimUtil.encodeArray(m); n.maskVer = (n.maskVer | 0) + 1;
    sim._navMask = m; sim._navMaskVer = n.maskVer;
  }
  function seaInfo(sim) {
    const st = sim.state, n = st.naval;
    if (!n.mask) refreshMask(sim, true);
    if (sim._navInfo && sim._navInfo.ver === n.maskVer) return sim._navInfo;
    const W = st.W, H = st.H, N = W * H;
    const mb = sim._navMask && sim._navMaskVer === n.maskVer ? sim._navMask : WW.SimUtil.decodeArray(n.mask, Uint8Array, (N + 7) >> 3);
    sim._navMask = mb; sim._navMaskVer = n.maskVer;
    const sea = new Uint8Array(N);
    for (let i = 0; i < N; i++) sea[i] = (mb[i >> 3] >> (i & 7)) & 1;
    const comp = new Int32Array(N).fill(-1), size = [];
    const q = new Int32Array(N);
    let label = 0;
    for (let s0 = 0; s0 < N; s0++) {
      if (comp[s0] !== -1 || !sea[s0]) continue;
      let qh = 0, qt = 0, cnt = 0;
      q[qt++] = s0; comp[s0] = label;
      while (qh < qt) {
        const i = q[qh++], x = i % W, y = (i - x) / W;
        cnt++;
        for (let d = 0; d < 8; d++) {
          const nx = x + DX8[d], ny = y + DY8[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (comp[j] !== -1 || !sea[j]) continue;
          if (d >= 4 && (!sea[y * W + nx] || !sea[ny * W + x])) continue;
          comp[j] = label; q[qt++] = j;
        }
      }
      size.push(cnt); label++;
    }
    sim._navInfo = { ver: n.maskVer, sea: sea, comp: comp, size: size, cache: new Map() };
    return sim._navInfo;
  }
  function scratch(sim) {
    const N = sim.state.W * sim.state.H;
    let A = sim._navA;
    if (!A || A.N !== N) {
      A = sim._navA = { N: N, g: new Float64Array(N), came: new Int32Array(N), seen: new Uint32Array(N), closed: new Uint32Array(N),
        heap: new Int32Array(N * 2 + 16), hf: new Float64Array(N * 2 + 16), q: new Int32Array(N), stamp: 0 };
    }
    A.stamp = (A.stamp + 1) >>> 0;
    if (A.stamp === 0) { A.seen.fill(0); A.closed.fill(0); A.stamp = 1; }
    return A;
  }
  // A* über Wasser (8 Richtungen, keine Abkürzung über Landecken). Rückgabe: Kacheln ohne Start, mit Ziel | null
  function astar(sim, from, to, limit) {
    const st = sim.state, W = st.W, H = st.H, sea = seaInfo(sim).sea;
    const A = scratch(sim), stamp = A.stamp, g = A.g, came = A.came, seen = A.seen, closed = A.closed, heap = A.heap, hf = A.hf;
    const tx = to % W, ty = (to - tx) / W;
    const hfun = (i) => { const x = i % W, y = (i - x) / W, dx = Math.abs(x - tx), dy = Math.abs(y - ty); return dx > dy ? dx + 0.41421356 * dy : dy + 0.41421356 * dx; };
    let n = 0;
    const cap = heap.length;
    function push(i, f) {
      if (n >= cap) return;
      let k = n++;
      heap[k] = i; hf[k] = f;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (hf[p] <= hf[k]) break;
        const ti = heap[p]; heap[p] = heap[k]; heap[k] = ti;
        const tf = hf[p]; hf[p] = hf[k]; hf[k] = tf;
        k = p;
      }
    }
    function pop() {
      const top = heap[0];
      n--;
      if (n > 0) {
        heap[0] = heap[n]; hf[0] = hf[n];
        let k = 0;
        for (;;) {
          const l = 2 * k + 1, r = l + 1;
          let m = k;
          if (l < n && hf[l] < hf[m]) m = l;
          if (r < n && hf[r] < hf[m]) m = r;
          if (m === k) break;
          const ti = heap[m]; heap[m] = heap[k]; heap[k] = ti;
          const tf = hf[m]; hf[m] = hf[k]; hf[k] = tf;
          k = m;
        }
      }
      return top;
    }
    seen[from] = stamp; g[from] = 0; came[from] = -1;
    push(from, hfun(from));
    let exp = 0, found = false;
    while (n > 0) {
      const i = pop();
      if (closed[i] === stamp) continue;
      closed[i] = stamp;
      if (i === to) { found = true; break; }
      if (++exp > limit) break;
      const x = i % W, y = (i - x) / W;
      for (let d = 0; d < 8; d++) {
        const nx = x + DX8[d], ny = y + DY8[d];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!sea[j] || closed[j] === stamp) continue;
        if (d >= 4 && (!sea[y * W + nx] || !sea[ny * W + x])) continue;
        const ng = g[i] + (d >= 4 ? SQ2 : 1);
        if (seen[j] !== stamp || ng < g[j]) { seen[j] = stamp; g[j] = ng; came[j] = i; push(j, ng + hfun(j)); }
      }
    }
    if (!found) return null;
    const out = [];
    for (let c = to; c !== from; c = came[c]) out.push(c);
    out.reverse();
    return out;
  }
  // Route zwischen zwei Wasserkacheln (zwischengespeichert; Ergebnis hängt nur am Gelände -> deterministisch)
  function route(sim, from, to, limit) {
    const st = sim.state, N = st.W * st.H;
    if (!(from >= 0 && from < N && to >= 0 && to < N)) return null;
    const nav = seaInfo(sim);
    if (nav.comp[from] < 0 || nav.comp[from] !== nav.comp[to]) return null;
    if (from === to) return [];
    if (limit > 0) return astar(sim, from, to, limit);   // kurze Suche (Verfolgung), nicht zwischengespeichert
    const key = from * N + to;
    if (nav.cache.has(key)) { const r = nav.cache.get(key); return r ? r.slice() : null; }
    const r = astar(sim, from, to, NV().PATH_NODES);
    nav.cache.set(key, r);
    if (nav.cache.size > NV().ROUTE_CACHE) nav.cache.delete(nav.cache.keys().next().value);
    return r ? r.slice() : null;
  }
  // Breitensuche über Wasser ab start (höchstens maxD Schritte); fn(i, d) für jede erreichte Kachel.
  // Danach liefert pathTo(i) den Weg dorthin (bis zur nächsten Suche).
  function seaBfs(sim, start, maxD, fn) {
    const st = sim.state, W = st.W, H = st.H, ter = st.terrain, L = seaLut();
    const A = scratch(sim), stamp = A.stamp, seen = A.seen, came = A.came, g = A.g, q = A.q;
    let qh = 0, qt = 0;
    q[qt++] = start; seen[start] = stamp; came[start] = -1; g[start] = 0;
    while (qh < qt) {
      const i = q[qh++], d = g[i];
      if (fn(i, d) === false) break;
      if (d >= maxD) continue;
      const x = i % W, y = (i - x) / W;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX8[k], ny = y + DY8[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (seen[j] === stamp || !L[ter[j]]) continue;
        if (k >= 4 && (!L[ter[y * W + nx]] || !L[ter[ny * W + x]])) continue;
        seen[j] = stamp; came[j] = i; g[j] = d + 1; q[qt++] = j;
      }
    }
    return function pathTo(i) {
      const out = [];
      for (let c = i; c !== start && c >= 0; c = came[c]) out.push(c);
      out.reverse();
      return out;
    };
  }
  // Nächste begehbare Landkachel (Schiffbrüchige, Ausladen): Suche über Wasser, erste freie Küstenkachel
  function nearestLand(sim, from, kid) {
    const st = sim.state, W = st.W, H = st.H, ter = st.terrain, L = seaLut(), walk = WW.TERRAIN_LUT.walk;
    const A = scratch(sim), stamp = A.stamp, seen = A.seen, q = A.q;
    let qh = 0, qt = 0, found = -1;
    q[qt++] = from; seen[from] = stamp;
    while (qh < qt && qt < 6000) {
      const i = q[qh++], x = i % W, y = (i - x) / W;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX8[k], ny = y + DY8[k];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (seen[j] === stamp) continue;
        seen[j] = stamp;
        if (L[ter[j]]) { q[qt++] = j; continue; }
        if (walk[ter[j]] > 0 && WW.Path.passable(sim, j, kid)) { found = j; break; }
      }
      if (found >= 0) break;
    }
    if (found < 0) found = WW.Path.nearestFree(sim, from, kid, 30);
    return found;
  }
  // Landestelle: Landkachel (Landmasse landComp, außerhalb jedes Rings, frei) mit Wassernachbar im Meer seaComp
  function landingNear(sim, x0, y0, rMin, rMax, landComp, seaComp, kid, avoid) {
    const st = sim.state, W = st.W, H = st.H, ter = st.terrain, L = seaLut(), walk = WW.TERRAIN_LUT.walk;
    const nav = seaInfo(sim), comp = comps(sim);
    let best = -1, bestA = -1, bs = 1e9;
    const r0 = rMin * rMin, r1 = rMax * rMax;
    for (let dy = -rMax; dy <= rMax; dy++) for (let dx = -rMax; dx <= rMax; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r1 || d2 < r0) continue;
      const x = x0 + dx, y = y0 + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const i = y * W + x;
      if (walk[ter[i]] <= 0 || L[ter[i]] || sim.block[i] !== 0 || st.inRing[i] !== -1 || comp[i] !== landComp) continue;
      if (kid != null && !WW.Path.passable(sim, i, kid)) continue;
      let a = -1;
      for (let k = 0; k < 4; k++) {
        const j = (y + DY8[k]) * W + x + DX8[k];
        if (L[ter[j]] && nav.comp[j] === seaComp) { a = j; break; }
      }
      if (a < 0) continue;
      if (avoid) { const ax = (a % W) + 0.5 - avoid.x, ay = Math.floor(a / W) + 0.5 - avoid.y; if (ax * ax + ay * ay < avoid.r * avoid.r) continue; }
      const sc = d2 + hr(sim, i, 77) * 2;
      if (sc < bs) { bs = sc; best = i; bestA = a; }
    }
    return best < 0 ? null : { land: best, anchor: bestA };
  }

  // ---------------------------------------------------------------------------
  // Hafen
  // ---------------------------------------------------------------------------
  function harborOf(sim, cityId, builtOnly) {
    for (const id of sim.state.naval.harbors) {
      const s = sim._structs.get(id);
      if (s && !s.dead && s.cityId === cityId && (!builtOnly || s.built)) return s;
    }
    return null;
  }
  // Platz für einen Hafen (2×2 an der Küste). near = { x, y } (Kraft: dort suchen, ohne Ring-Abstand) | undefined
  function findHarborSpot(sim, city, near) {
    const st = sim.state, W = st.W, H = st.H, ter = st.terrain, L = seaLut();
    const nav = seaInfo(sim), comp = comps(sim);
    const id = city.id, owner = st.owner, inRing = st.inRing;
    const cityComp = comp[city.cy * W + city.cx];
    const px = near ? near.x : city.cx + 0.5, py = near ? near.y : city.cy + 0.5;
    const r = near ? 7 : Math.min(NV().HARBOR.r, WW.Cities.territoryRadius(city, sim) + 2);
    const minD = near ? 0 : (city.wall && city.wall.plan ? 0 : CF().WALL_RESERVE + CF().WALL_MARGIN + 4);
    const plan = city.wall && city.wall.plan ? new Set(city.wall.plan) : null;
    const minSea = NV().HARBOR.minSea;
    const o = {
      area: function (i, inner) {
        const ow = owner[i];
        if (inner) return (ow === id || ow === -1) && (inRing[i] === -1 || inRing[i] === id) && !(plan && plan.has(i));
        if (plan && plan.has(i) && !L[ter[i]]) return false;
        return (ow === id || ow === -1 || L[ter[i]] === 1) && (inRing[i] === -1 || inRing[i] === id);
      },
      fieldOk: true, race: city.race, cityId: id, needWalkBorder: false
    };
    let best = null, bs = -1e9;
    const x0 = Math.max(1, Math.floor(px - r)), x1 = Math.min(W - 3, Math.ceil(px + r));
    const y0 = Math.max(1, Math.floor(py - r)), y1 = Math.min(H - 3, Math.ceil(py + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const d = Math.sqrt((x + 1 - px) * (x + 1 - px) + (y + 1 - py) * (y + 1 - py));
      if (d > r || d < minD) continue;
      // Anlegestelle: Wasser direkt neben der Grundfläche (je Seite zwei Kacheln)
      let dock = -1, dockDir = 0, open = -1;
      for (let side = 0; side < 4; side++) for (let k = 0; k < 2; k++) {
        const ax = side === 0 ? x + 2 : side === 2 ? x - 1 : x + k;
        const ay = side === 1 ? y + 2 : side === 3 ? y - 1 : y + k;
        if (ax < 0 || ay < 0 || ax >= W || ay >= H) continue;
        const a = ay * W + ax;
        if (!L[ter[a]] || nav.size[nav.comp[a]] < minSea) continue;
        let n = 0;
        for (let e = 0; e < 8; e++) { const bx = ax + DX8[e], by = ay + DY8[e]; if (bx >= 0 && by >= 0 && bx < W && by < H && L[ter[by * W + bx]]) n++; }
        if (n > open) { open = n; dock = a; dockDir = side; }
      }
      if (dock < 0 || open < 3) continue;
      const i0 = y * W + x;
      // Grundfläche: Land derselben Landmasse wie die Stadt (Baumeister und Passagiere kommen zu Fuß hin)
      let same = true;
      for (let dy = 0; dy < 2 && same; dy++) for (let dx = 0; dx < 2; dx++) if (comp[i0 + dy * W + dx] !== cityComp) { same = false; break; }
      if (!same) continue;
      // ganz innerhalb oder ganz außerhalb des Rings (nie halb drin)
      const r0 = inRing[i0];
      if (inRing[i0 + 1] !== r0 || inRing[i0 + W] !== r0 || inRing[i0 + W + 1] !== r0) continue;
      if (WW.Cities.footprintOk(sim, x, y, 2, 2, o) < 0) continue;
      let fish = 0;
      if (st.deposit) for (let dy = -3; dy <= 4; dy++) for (let dx = -3; dx <= 4; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && st.deposit[yy * W + xx] === 5) fish++;
      }
      const score = -d * 0.4 + open * 0.25 + Math.min(fish, 6) * 0.3 + hr(sim, i0, 11) * 0.4;
      if (score > bs) { bs = score; best = { x: x, y: y, dock: dock, dockDir: dockDir }; }
    }
    return best;
  }
  function placeHarbor(sim, city, spot, built) {
    const k = sim._kingdoms.get(city.kingdomId);
    const s = WW.Cities.placeStruct(sim, city, 'harbor', spot.x, spot.y, { style: k ? k.gov : 'tribe', built: !!built });
    if (!s) return null;
    s.dock = spot.dock; s.dockDir = spot.dockDir; s.side = 'eswn'[spot.dockDir]; s.culture = city.culture || 'mitte';
    s.prod = null; s.prog = 0; s.made = 0; s.opened = built ? 1 : 0;
    sim.state.naval.harbors.push(s.id);
    if (!built) city.sites.push(s.id);
    return s;
  }
  function planHarbor(sim, city, k) {
    const st = sim.state, n = st.naval;
    const spec = govSpec(k.gov);
    if (city.kind === 'camp' || !city.centerOk || city.tier < spec.minTier || city.pop < spec.minPop) return;
    if ((n.noHarbor[city.id] | 0) > st.year) return;
    if (harborOf(sim, city.id, false)) return;
    const open = WW.Cities.countSites(sim, city, true);
    if (open >= 2 + city.tier) return;
    // ohne Vorrat nur, wenn sonst kaum gebaut wird (die Baustelle zieht dann Holzfäller nach sich)
    const cost = WW.Structs.costFor(sim, 'harbor', 1, city.id);
    if (!WW.Cities.canPay(sim, city, cost) && open > 1) return;
    // schnelle Vorprüfung: Meer in Reichweite?
    const W = st.W, H = st.H, L = seaLut(), r = Math.min(NV().HARBOR.r, WW.Cities.territoryRadius(city, sim) + 2);
    let any = false;
    for (let y = Math.max(0, city.cy - r); y <= Math.min(H - 1, city.cy + r) && !any; y += 2) for (let x = Math.max(0, city.cx - r); x <= Math.min(W - 1, city.cx + r); x += 2) if (L[st.terrain[y * W + x]]) { any = true; break; }
    if (!any) { n.noHarbor[city.id] = st.year + NV().HARBOR.retryYears * 2; return; }
    const spot = findHarborSpot(sim, city);
    if (!spot) { n.noHarbor[city.id] = st.year + NV().HARBOR.retryYears; return; }
    placeHarbor(sim, city, spot, false);
  }

  // ---------------------------------------------------------------------------
  // Schiffe: Bau, Bestand, Bewegung
  // ---------------------------------------------------------------------------
  function quota(sim, city, k, kind) {
    const spec = govSpec(k.gov), t = city.tier | 0;
    const war = WW.Diplo.atWar(sim, k.id);
    if (kind === 'fishboat') {
      const cu = NV().CULTURE[city.culture];
      return Math.min(spec.fish, 1 + (t >= 2 ? 1 : 0) + (t >= 4 ? 1 : 0)) + (cu && cu.fish ? cu.fish : 0);
    }
    if (kind === 'trader') return spec.trade >= 3 ? Math.min(spec.trade, t) : Math.min(spec.trade, Math.max(0, t - 1));
    if (kind === 'transport') return t >= (k.gov === 'tribe' ? 1 : NV().SETTLE.minTier) ? Math.min(spec.transport, war ? 2 : 1) : 0;
    if (kind === 'warship') return spec.war > 0 && t >= 2 ? Math.min(spec.war, t - 1 + (war ? 1 : 0)) : 0;
    return 0;
  }
  function shipCost(sim, k, kind) {
    const K = NV().KINDS[kind], g = WW.GOVERNMENTS[k.gov] || {};
    const c = { food: 0, wood: K.cost.wood || 0, stone: K.cost.stone || 0, gold: K.cost.gold || 0 };
    if (c.gold && !(g.goldMul > 0)) { c.wood += c.gold; c.gold = 0; }
    return c;
  }
  function shipName(sim, k, kind, id) {
    const T = WW.TEXTS_NAVAL && WW.TEXTS_NAVAL.SHIP_NAMES;
    if (!T) return NV().KINDS[kind].name;
    const list = T[k.gov] || T._;
    return list[mix(id, 0x5417) % list.length];
  }
  function spawnShip(sim, h, kind, kid, cityId, tile) {
    const st = sim.state, W = st.W;
    const K = NV().KINDS[kind];
    const k = sim._kingdoms.get(kid);
    if (!K || !k) return null;
    if (st.ships.length >= NV().MAX_SHIPS) return null;
    const home = h ? h.dock : tile;
    if (!(home >= 0) || !isSea(st.terrain[home])) return null;
    const spec = govSpec(k.gov), look = spec.look, Lk = NV().LOOK[look] || NV().LOOK.sail;
    const city = sim._cities.get(cityId);
    const hp = Math.round(K.hp * Lk.hpMul);
    const at = tile != null && tile >= 0 && isSea(st.terrain[tile]) ? tile : home;
    const s = {
      id: st.nextId++, kingdomId: kid, cityId: cityId, harborId: h ? h.id : -1, kind: kind, look: look, gov: k.gov,
      culture: (city && city.culture) || k.culture || 'mitte',
      x: (at % W) + 0.5, y: Math.floor(at / W) + 0.5, dir: h ? (h.dockDir | 0) : 0, moving: false,
      hp: hp, maxHp: hp, cargo: { fish: 0, gold: 0, goods: 0 }, passengers: [], route: [], ri: 0, t: 'dock',
      mission: null, home: home, wait: 20 + Math.floor(hr(sim, st.nextId, st.tick) * 40), coal: false, cd: 0, target: -1,
      trips: 0, name: '', born: st.year, sinkT: 0
    };
    s.name = shipName(sim, k, kind, s.id);
    st.ships.push(s);
    sim._shipMapDirty = true;
    st.naval.stats.built++;
    return s;
  }
  function capOf(s) {
    const K = NV().KINDS[s.kind], Lk = NV().LOOK[s.look] || NV().LOOK.sail;
    return Math.max(1, Math.round((K.cap || 0) * Lk.capMul));
  }
  function speedOf(sim, s) {
    const Lk = NV().LOOK[s.look] || NV().LOOK.sail;
    let v = s.look === 'steam' && s.coal ? Lk.coalSpeed : Lk.speed;
    if (s.mission && s.mission.spd > 0) v = Math.min(v, s.mission.spd);
    return v;
  }
  function takeCoal(sim, s) {
    s.coal = false;
    if (s.look !== 'steam') return;
    const c = sim._cities.get(s.cityId);
    if (!c) return;
    const sk = stockOf(sim, c);
    if (sk && typeof sk.coal === 'number' && sk.coal >= NV().COAL_TRIP + (NV().COAL_RESERVE || 0)) { sk.coal -= NV().COAL_TRIP; s.coal = true; }   // Reserve bleibt für Arsenal und Fabriken
  }
  function depart(sim, s, r, mission, fromDock) {
    if (mission && fromDock) mission.from = tileOf(sim, s);   // Rückweg = Hinweg rückwärts (spart die Wegsuche)
    s.route = r; s.ri = 0; s.t = 'out'; s.mission = mission; s.moving = r.length > 0; s.wait = 0;
    if (fromDock) {
      takeCoal(sim, s);
      sim.fx({ type: 'sail', x: s.x, y: s.y, dir: s.dir, kind: s.kind, look: s.look });
      if (s.look === 'steam') sim.fx({ type: 'horn', x: s.x, y: s.y });
    }
  }
  function goHome(sim, s) {
    const cur = tileOf(sim, s);
    if (cur === s.home) { arriveHome(sim, s); return; }
    const m = s.mission;
    let r = null;
    if (m && m.ret && m.at === cur) {
      r = m.ret; m.ret = null;
      for (const i of r) if (!isSea(sim.state.terrain[i])) { r = null; break; }
    }
    if (!r) r = route(sim, cur, s.home);
    if (!r) {
      s.fails = (s.fails | 0) + 1;
      if (s.fails > 3) scrap(sim, s); else s.wait = 120;
      return;
    }
    s.fails = 0;
    s.route = r; s.ri = 0; s.t = 'back'; s.moving = r.length > 0; s.wait = 0;
    if (s.mission && s.mission.kind !== 'escort') s.mission.spd = 0;
  }
  function move(sim, s) {
    const st = sim.state, W = st.W, ter = st.terrain, L = seaLut();
    let rem = speedOf(sim, s);
    const route0 = s.route;
    while (rem > 1e-9 && s.ri < route0.length) {
      const ti = route0[s.ri];
      if (!L[ter[ti]]) { s.route = []; s.ri = 0; s.moving = false; s.t = 'work'; s.wait = 5; return false; }
      const tx = (ti % W) + 0.5, ty = Math.floor(ti / W) + 0.5;
      const dx = tx - s.x, dy = ty - s.y, d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1e-9) s.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 0 : 2) : (dy > 0 ? 1 : 3);
      if (d <= rem) { s.x = tx; s.y = ty; rem -= d; s.ri++; }
      else { s.x += dx / d * rem; s.y += dy / d * rem; rem = 0; }
    }
    if (((st.tick + s.id) & 7) === 0) {
      sim.fx({ type: 'wake', x: s.x, y: s.y, dir: s.dir, kind: s.kind });
      if (s.look === 'steam' && s.coal) sim.fx({ type: 'shipsmoke', x: s.x, y: s.y });
    }
    return s.ri >= s.route.length;
  }

  // ---------------------------------------------------------------------------
  // Aufgaben
  // ---------------------------------------------------------------------------
  function startFish(sim, s) {
    const st = sim.state, F = NV().FISH, dep = st.deposit;
    let best = -1, bs = -1e9;
    const pathTo = seaBfs(sim, s.home, F.rMax, (i, d) => {
      if (d < F.rMin) return;
      const sc = (dep && dep[i] === 5 ? 3 : 0) - Math.abs(d - 7) * 0.2 + hr(sim, i, s.trips * 31 + s.id) * 2.5;
      if (sc > bs) { bs = sc; best = i; }
    });
    if (best < 0) { s.wait = 400; return; }
    const cur = tileOf(sim, s);
    const r = cur === s.home ? pathTo(best) : route(sim, cur, best);
    if (!r) { s.wait = 200; return; }
    depart(sim, s, r, { kind: 'fish', spot: best, rich: !!(dep && dep[best] === 5) }, true);
  }
  function friendlyKingdoms(sim, a, b) {
    if (a === b) return true;
    const ka = sim._kingdoms.get(a), kb = sim._kingdoms.get(b);
    const ra = ka && ka.relations[b], rb = kb && kb.relations[a];
    if (!ra || !rb) return false;
    if (ra.status === 'alliance') return true;
    return ra.status === 'peace' && ra.opinion >= 0 && rb.opinion >= 0;
  }
  function startTrade(sim, s) {
    const st = sim.state, nav = seaInfo(sim);
    const mc = nav.comp[s.home];
    const hx = s.home % st.W, hy = Math.floor(s.home / st.W);
    const cand = [];
    for (const id of st.naval.harbors) {
      if (id === s.harborId) continue;
      const h = sim._structs.get(id);
      if (!h || h.dead || !h.built || h.cityId === s.cityId || h.dock == null) continue;
      const c = sim._cities.get(h.cityId);
      if (!c || !friendlyKingdoms(sim, s.kingdomId, c.kingdomId) || nav.comp[h.dock] !== mc) continue;
      cand.push({ h: h, d: Math.abs(h.dock % st.W - hx) + Math.abs(Math.floor(h.dock / st.W) - hy) });
    }
    if (!cand.length) { s.wait = 480; return; }
    cand.sort((a, b) => a.d - b.d || a.h.id - b.h.id);
    const n = Math.min(3, cand.length);
    const range = govSpec(s.gov).range;
    for (let t = 0; t < n; t++) {
      const c = cand[(s.trips + t) % n];
      const r = route(sim, tileOf(sim, s), c.h.dock);
      if (!r || r.length > range) continue;
      depart(sim, s, r, { kind: 'trade', to: c.h.id, len: r.length }, true);
      return;
    }
    s.wait = 480;
  }
  function startPatrol(sim, s) {
    const st = sim.state, P = NV().PATROL;
    let best = -1, bs = -1e9;
    const pathTo = seaBfs(sim, s.home, P.r, (i, d) => {
      const sc = d + hr(sim, i, s.trips * 17 + s.id) * 6;
      if (sc > bs) { bs = sc; best = i; }
    });
    if (best < 0 || best === s.home) { s.wait = 300; return; }
    const cur = tileOf(sim, s);
    const r = cur === s.home ? pathTo(best) : route(sim, cur, best);
    if (!r) { s.wait = 300; return; }
    depart(sim, s, r, { kind: 'patrol' }, true);
  }
  function arriveHome(sim, s) {
    const st = sim.state, W = st.W;
    s.t = 'dock'; s.route = []; s.ri = 0; s.moving = false; s.fails = 0;
    s.x = (s.home % W) + 0.5; s.y = Math.floor(s.home / W) + 0.5;
    const city = sim._cities.get(s.cityId);
    if (s.cargo.fish > 0 && city) {
      const sk = stockOf(sim, city);
      const v = s.cargo.fish;
      WW.Cities.addStock(sim, city, sk && typeof sk.fish === 'number' ? 'fish' : 'food', v);
      st.naval.stats.fish += v;
      if (hr(sim, s.id, st.tick) < 0.025) chron(sim, 'bigCatch', { city: city.name, ship: s.name }, WW.Cities.atCity(city), 'economy', '+' + Math.round(v) + ' Fisch');
    }
    s.cargo.fish = 0; s.cargo.gold = 0; s.cargo.goods = 0;
    // wer noch an Bord ist (abgebrochene Fahrt), steigt im Hafen aus
    if (s.passengers.length) unload(sim, s, null);
    const kind = s.mission ? s.mission.kind : null;
    s.mission = null;
    s.trips++;
    const F = NV().FISH;
    s.wait = kind === 'fish' ? F.dockWait : kind === 'trade' ? NV().TRADE.wait : s.kind === 'warship' ? NV().PATROL.wait : 60;
    s.wait += Math.floor(hr(sim, s.id, s.trips) * 30);
  }
  function payTrade(sim, s) {
    const st = sim.state, T = NV().TRADE;
    const h = sim._structs.get(s.mission.to);
    const ca = sim._cities.get(s.cityId), cb = h && sim._cities.get(h.cityId);
    if (!ca || !cb) return;
    const amt = Math.min(T.max, T.gold * (1 + (s.mission.len || 0) * T.perTile));
    let shown = 0;
    for (const c of [ca, cb]) {
      const kk = sim._kingdoms.get(c.kingdomId);
      if (!kk) continue;
      const g = WW.GOVERNMENTS[kk.gov] || {};
      if (g.goldMul > 0) {
        const v = WW.SimUtil.mod(sim, kk, c, 'gold', amt);
        WW.Cities.addStock(sim, c, 'gold', v);
        st.naval.ledger[c.id] = Math.round(((st.naval.ledger[c.id] || 0) + v) * 100) / 100;
        if (c === ca) shown = v;
      }
      else { WW.Cities.addStock(sim, c, 'food', T.goods); WW.Cities.addStock(sim, c, 'wood', T.goods); if (c === ca) s.cargo.goods = T.goods; }
    }
    s.cargo.gold = shown;
    if (ca.kingdomId !== cb.kingdomId) {
      const ka = sim._kingdoms.get(ca.kingdomId), kb = sim._kingdoms.get(cb.kingdomId);
      const ra = ka && ka.relations[cb.kingdomId], rb = kb && kb.relations[ca.kingdomId];
      if (ra) ra.opinion = Math.min(100, ra.opinion + T.opinion);
      if (rb) rb.opinion = Math.min(100, rb.opinion + T.opinion);
    }
    st.naval.stats.trades++;
    if (hr(sim, s.id, st.tick + 3) < 0.06) chron(sim, 'seaTrade', { city: ca.name, otherCity: cb.name, ship: s.name }, WW.Cities.atCity(cb), 'economy', shown ? '+' + Math.round(shown) + ' Gold' : 'Waren');
  }
  function arrive(sim, s) {
    const m0 = s.mission, r0 = s.route;
    if (s.t === 'out' && m0 && m0.from === s.home && r0.length) { const ret = r0.slice(0, -1).reverse(); ret.push(m0.from); m0.ret = ret; m0.at = r0[r0.length - 1]; }
    s.moving = false; s.route = []; s.ri = 0;
    if (s.t === 'back') { arriveHome(sim, s); return; }
    const m = s.mission;
    const kind = m ? m.kind : 'home';
    if (kind === 'fish') {
      const F = NV().FISH, city = sim._cities.get(s.cityId), k = sim._kingdoms.get(s.kingdomId);
      s.t = 'work'; s.wait = F.time;
      const base = F.catch * (m.rich ? F.deposit : 1) * (s.look === 'canoe' ? 0.7 : 1);
      s.cargo.fish = city ? WW.SimUtil.mod(sim, k, city, 'fish', base) : base;
    } else if (kind === 'trade') { payTrade(sim, s); s.t = 'work'; s.wait = NV().TRADE.wait; }
    else if (kind === 'patrol') { s.t = 'work'; s.wait = NV().PATROL.out; }
    else if (kind === 'settle' || kind === 'invade') { unload(sim, s, m); s.t = 'work'; s.wait = 40; }
    else if (kind === 'escort') { s.t = 'work'; s.wait = NV().INVADE.guard; m.spd = 0; }
    else if (kind === 'chase') { s.t = 'work'; s.wait = 10; }
    else arriveHome(sim, s);
  }

  // ---------------------------------------------------------------------------
  // Passagiere
  // ---------------------------------------------------------------------------
  function release(sim, u) {
    u.sea = 0; u.seaS = null; u.swim = null; u.path = null; u.moving = false;
    if (u.role === 'settler') {
      u.site = -1; u.group = -1;
      if (sim._cities.get(u.cityId)) WW.Units.setRole(sim, u, 'farmer');
    } else if (u.order && u.order.sea) u.order = null;
  }
  // An Land setzen: m = Auftrag (Landestelle, Ziel) | null = am Heimathafen aussteigen
  function unload(sim, s, m) {
    const st = sim.state, W = st.W;
    let land = m ? m.land : (m === null && s.mission && s.mission.board >= 0 ? s.mission.board : -1);
    if (!(land >= 0) || WW.TERRAIN_LUT.walk[st.terrain[land]] <= 0) land = nearestLand(sim, tileOf(sim, s), s.kingdomId);
    if (!(land >= 0)) land = -1;
    const lx = land >= 0 ? (land % W) + 0.5 : s.x, ly = land >= 0 ? Math.floor(land / W) + 0.5 : s.y;
    let n = 0, firstC = null;
    for (const id of s.passengers) {
      const u = sim._units.get(id);
      if (!u || u.dead || u.sea !== s.id) continue;
      if (land >= 0) { u.x = lx + (hr(sim, u.id, 1) - 0.5) * 0.5; u.y = ly + (hr(sim, u.id, 2) - 0.5) * 0.5; }
      u.sea = 0; u.seaS = null; u.path = null; u.moving = false; u.wait = 0; u.fails = 0;
      if (m && m.kind === 'settle' && u.role === 'settler') { u.site = m.site; u.group = m.group; }
      else if (!m || m.kind !== 'invade') release(sim, u);
      n++;
      if (!firstC) firstC = u;
    }
    s.passengers = [];
    if (land >= 0 && n) sim.fx({ type: 'splash', x: lx, y: ly });
    if (!m || !n) return;
    const k = sim._kingdoms.get(s.kingdomId), home = sim._cities.get(s.cityId);
    if (m.kind === 'settle') {
      st.naval.stats.colonies++;
      chron(sim, 'seaColonyLand', { kingdom: k ? k.name : '', city: home ? home.name : '', n: n, ship: s.name, terrain: WW.TERRAIN[st.terrain[m.site]].name },
        { kingdomId: s.kingdomId, cityId: home ? home.id : -1, x: lx, y: ly }, 'economy', n + ' Siedler an Land');
    } else if (m.kind === 'invade') {
      st.naval.stats.landings++; st.naval.stats.troopsLanded += n;
      const tc = sim._cities.get(m.city), ek = sim._kingdoms.get(m.k);
      chron(sim, 'seaLanding', { kingdom: k ? k.name : '', other: ek ? ek.name : '', otherCity: tc ? tc.name : '', n: n, ship: s.name },
        { kingdomId: s.kingdomId, cityId: tc ? tc.id : -1, x: lx, y: ly }, 'war', n + ' Soldaten gelandet');
    }
  }
  // Haken aus units.js: Einheiten mit u.sea bewegt dieses Modul (true = KI überspringen)
  function unit(sim, u) {
    if (!u.sea) return false;
    const st = sim.state, W = st.W;
    if (u.seaS === 'swim') {
      if (!u.swim || st.tick >= u.swim.t1) { u.sea = 0; u.seaS = null; u.swim = null; return false; }
      u.moving = false;
      return true;
    }
    const s = shipById(sim, u.sea);
    if (!s || s.dead || s.passengers.indexOf(u.id) < 0) { release(sim, u); return false; }
    if (u.seaS === 'aboard') { u.moving = false; return true; }
    // zum Hafen gehen
    if (s.t !== 'load' || !s.mission || !(s.mission.board >= 0)) { release(sim, u); return false; }
    const goal = s.mission.board, gx = (goal % W) + 0.5, gy = Math.floor(goal / W) + 0.5;
    const dx = u.x - gx, dy = u.y - gy;
    if (dx * dx + dy * dy <= 2.3) {
      u.seaS = 'aboard'; u.path = null; u.moving = false; u.x = gx; u.y = gy;
      return true;
    }
    if (((st.tick + u.id) & 7) === 0) {   // Weg höchstens alle 8 Ticks suchen (spart Wegsuche, wenn das Budget knapp ist)
      const r = WW.Units.goTo(sim, u, goal, { limit: CF().PATH_LIMIT_LONG });
      if (r === null && u.fails > 3) { s.passengers.splice(s.passengers.indexOf(u.id), 1); release(sim, u); return false; }
    }
    WW.Units.move(sim, u);
    return true;
  }
  // Einstiegskachel: Hafenkachel direkt an der Anlegestelle
  function boardTile(sim, h) {
    const W = sim.state.W, dx = h.dock % W, dy = Math.floor(h.dock / W);
    let best = h.y * W + h.x, bd = 1e9;
    for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) {
      const d = Math.abs(x - dx) + Math.abs(y - dy);
      if (d < bd) { bd = d; best = y * W + x; }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Siedler über das Meer
  // ---------------------------------------------------------------------------
  function homeFull(sim, city, k) {
    const st = sim.state, W = st.W, H = st.H, comp = comps(sim), build = WW.TERRAIN_LUT.build;
    const mc = comp[city.cy * W + city.cx];
    const R = 44;
    for (let y = Math.max(4, city.cy - R); y <= Math.min(H - 5, city.cy + R); y += 4) for (let x = Math.max(4, city.cx - R); x <= Math.min(W - 5, city.cx + R); x += 4) {
      const i = y * W + x;
      if (comp[i] !== mc || !build[st.terrain[i]]) continue;
      if (!WW.Cities.canFoundAt(sim, x, y, city.race, CF().DAUGHTER_MIN_DIST, k.id)) continue;
      let free = 0;
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && build[st.terrain[yy * W + xx]] && st.owner[yy * W + xx] === -1) free++;
      }
      if (free >= 60) return false;
    }
    return true;
  }
  function overseasSite(sim, city, k, ship) {
    const st = sim.state, W = st.W, H = st.H, comp = comps(sim), nav = seaInfo(sim), build = WW.TERRAIN_LUT.build;
    const S = NV().SETTLE, spec = govSpec(k.gov);
    const mc = comp[city.cy * W + city.cx], sc = nav.comp[ship.home];
    const hx = ship.home % W, hy = Math.floor(ship.home / W);
    const cands = [];
    for (let y = 4; y < H - 4; y += 3) for (let x = 4; x < W - 4; x += 3) {
      const i = y * W + x;
      if (!build[st.terrain[i]] || comp[i] < 0 || comp[i] === mc || st.owner[i] !== -1) continue;
      const d = Math.abs(x - hx) + Math.abs(y - hy);
      if (d > spec.range * 1.2) continue;
      if (!WW.Cities.canFoundAt(sim, x, y, city.race, S.minDist, k.id)) continue;
      let free = 0;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && build[st.terrain[yy * W + xx]] && st.owner[yy * W + xx] === -1) free++;
      }
      if (free < S.free) continue;
      cands.push({ x: x, y: y, i: i, sc: free * 0.5 - d * 0.6 + hr(sim, i, st.year) * 4 });
    }
    cands.sort((a, b) => b.sc - a.sc || a.i - b.i);
    for (let n = 0; n < Math.min(4, cands.length); n++) {
      const c = cands[n];
      const land = landingNear(sim, c.x, c.y, 0, S.landR, comp[c.i], sc, k.id);
      if (!land) continue;
      const r = route(sim, ship.home, land.anchor);
      if (!r || r.length > spec.range) continue;
      return { site: c.i, land: land.land, anchor: land.anchor };
    }
    return null;
  }
  function colonize(sim) {
    const st = sim.state, n = st.naval, S = NV().SETTLE;
    for (const k of st.kingdoms) {
      if (k.dead || !k.cityIds.length) continue;
      const spec = govSpec(k.gov);
      if ((k.id + st.year) % 3 !== 0) continue;   // jedes Reich nur jedes dritte Jahr prüfen (Platzsuche ist teuer)
      if (!spec.colonize || noSettle(k.gov) || WW.Diplo.atWar(sim, k.id)) continue;
      if (n.colony[k.id] != null && n.colony[k.id] + S.every > st.year) continue;
      if (k.cityIds.length >= WW.Growth.cityLimit(sim, k) + 2) continue;
      if (st.units.length >= CF().MAX_UNITS - 50) continue;
      let pick = null, ship = null;
      for (const cid of k.cityIds) {
        const c = sim._cities.get(cid);
        if (!c || c.kind === 'camp' || !c.centerOk || c.tier < (k.gov === 'tribe' ? 1 : S.minTier) || c.adults < S.minAdults) continue;
        const h = harborOf(sim, c.id, true);
        if (!h) continue;
        let t = null;
        for (const s of st.ships) if (!s.dead && s.kind === 'transport' && s.cityId === c.id && s.kingdomId === k.id && s.t === 'dock' && !s.mission) { t = s; break; }
        if (!t) continue;
        if (!pick || c.adults > pick.adults) { pick = c; ship = t; }
      }
      if (!pick) continue;
      if (!homeFull(sim, pick, k)) continue;
      const site = overseasSite(sim, pick, k, ship);
      if (!site) { n.colony[k.id] = st.year - S.every + 2; continue; }
      const h = sim._structs.get(ship.harborId);
      if (!h) continue;
      const board = boardTile(sim, h);
      const comp = comps(sim), hc = comp[board];
      const want = Math.min(capOf(ship), S.n[0] + Math.floor(hr(sim, k.id, st.year) * (S.n[1] - S.n[0] + 1)));
      const cand = [];
      for (const u of st.units) {
        if (u.dead || u.cityId !== pick.id || u.role === 'leader' || u.role === 'child' || u.role === 'rebel' || u.role === 'soldier' || u.role === 'prisoner' || u.merc || u.order || u.sea || u.ind || u.vehicle) continue;
        if (comp[Math.floor(u.y) * st.W + Math.floor(u.x)] !== hc) continue;
        cand.push(u);
      }
      if (cand.length < 3) continue;
      const bx = board % st.W, by = Math.floor(board / st.W);
      cand.sort((a, b) => (Math.abs(a.x - bx) + Math.abs(a.y - by)) - (Math.abs(b.x - bx) + Math.abs(b.y - by)) || a.id - b.id);
      const group = st.nextId++;
      let m = 0;
      for (const u of cand) {
        if (m >= want) break;
        WW.Units.setRole(sim, u, 'settler');
        u.group = group; u.site = -1; u.sea = ship.id; u.seaS = 'board'; u.swim = null; u.fails = 0;
        ship.passengers.push(u.id);
        m++;
      }
      ship.t = 'load'; ship.wait = S.wait;
      ship.mission = { kind: 'settle', site: site.site, land: site.land, anchor: site.anchor, board: board, group: group, spd: 0 };
      n.colony[k.id] = st.year;
      chron(sim, 'seaColony', { kingdom: k.name, city: pick.name, n: m, ship: ship.name }, WW.Cities.atCity(pick), 'economy', m + ' Siedler stechen in See');
    }
  }

  // Gestrandete (gescheiterte Gründung, Schiffbruch): Leute auf einer anderen Landmasse als ihre Stadt schließen sich einer
  // Stadt dort an (eigenes Reich zuerst, sonst friedliche Nachbarn) oder gründen ab drei Leuten selbst einen Ort.
  function stranded(sim) {
    const st = sim.state, W = st.W, comp = comps(sim);
    const groups = new Map();
    for (const u of st.units) {
      if (u.dead || u.sea || u.ind || u.vehicle || u.order || u.merc) continue;
      if (u.role === 'settler' || u.role === 'soldier' || u.role === 'leader' || u.role === 'prisoner' || u.role === 'rebel' || u.role === 'bandit') continue;
      const c = sim._cities.get(u.cityId);
      if (!c) continue;
      const uc = comp[Math.floor(u.y) * W + Math.floor(u.x)];
      if (uc < 0 || uc === comp[c.cy * W + c.cx]) continue;
      const key = uc * 100000 + u.kingdomId;
      let g = groups.get(key);
      if (!g) { g = { comp: uc, k: u.kingdomId, list: [] }; groups.set(key, g); }
      g.list.push(u);
    }
    for (const g of groups.values()) {
      const u0 = g.list[0];
      let join = null, jd = 1e9;
      for (const c of st.cities) {
        if (c.dead || c.kind === 'camp' || comp[c.cy * W + c.cx] !== g.comp) continue;
        if (c.kingdomId !== g.k && WW.Path.hostileKingdoms(sim, g.k, c.kingdomId)) continue;
        const d = Math.abs(c.cx - u0.x) + Math.abs(c.cy - u0.y) + (c.kingdomId === g.k ? 0 : 1000);
        if (d < jd) { jd = d; join = c; }
      }
      if (join) { for (const u of g.list) { u.cityId = join.id; u.kingdomId = join.kingdomId; u.path = null; } continue; }
      const gk = sim._kingdoms.get(g.k);
      if (g.list.length < 3 || !gk || noSettle(gk.gov)) continue;
      // eigener Ort in der Nähe
      let site = -1, bd = 1e9;
      const x0 = Math.floor(u0.x), y0 = Math.floor(u0.y), md = CF().CITY_MIN_DIST - 4;
      for (let dy = -12; dy <= 12; dy += 2) for (let dx = -12; dx <= 12; dx += 2) {
        const x = x0 + dx, y = y0 + dy;
        if (x < 3 || y < 3 || x >= W - 4 || y >= st.H - 4 || comp[y * W + x] !== g.comp) continue;
        if (!WW.Cities.canFoundAt(sim, x, y, u0.race, md, g.k)) continue;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; site = y * W + x; }
      }
      if (site < 0) continue;
      const grp = st.nextId++;
      for (const u of g.list) { WW.Units.setRole(sim, u, 'settler'); u.group = grp; u.site = site; u.fails = 0; }
    }
  }

  // ---------------------------------------------------------------------------
  // Krieg über das Meer (Haken aus diplo.js): Truppenlandung nahe einer feindlichen Küstenstadt
  // ---------------------------------------------------------------------------
  function seaWar(sim, k, e, idle, marching) {
    const st = sim.state, n = st.naval, I = NV().INVADE, W = st.W;
    if (!st.ships || !n) return false;
    const spec = govSpec(k.gov);
    if (!spec.invade) return false;
    if (n.invade[k.id] != null && n.invade[k.id] + I.every > st.year) return false;
    for (const s of st.ships) if (!s.dead && s.kingdomId === k.id && s.mission && s.mission.kind === 'invade') return false;
    if (!idle || idle.length < I.min) return false;
    const comp = comps(sim), nav = seaInfo(sim);
    let best = null;
    for (const s of st.ships) {
      if (s.dead || s.kingdomId !== k.id || s.kind !== 'transport' || s.t !== 'dock' || s.mission) continue;
      const h = sim._structs.get(s.harborId);
      if (!h || h.dead || !h.built) continue;
      const sc = nav.comp[s.home];
      const targets = [];
      for (const cid of e.cityIds) { const c = sim._cities.get(cid); if (c) targets.push(c); }
      const hx = s.home % W, hy = Math.floor(s.home / W);
      targets.sort((a, b) => (Math.abs(a.cx - hx) + Math.abs(a.cy - hy)) - (Math.abs(b.cx - hx) + Math.abs(b.cy - hy)) || a.id - b.id);
      for (let t = 0; t < Math.min(4, targets.length); t++) {
        const c = targets[t];
        const lc = comp[c.cy * W + c.cx];
        if (lc === comp[boardTile(sim, h)]) continue;   // gleiche Landmasse: zu Fuß (diplo.js)
        const land = landingNear(sim, c.cx, c.cy, I.landMin, I.landMax, lc, sc, k.id);
        if (!land) continue;
        const r = route(sim, s.home, land.anchor);
        if (!r || r.length > spec.range) continue;
        best = { s: s, h: h, c: c, land: land };
        break;
      }
      if (best) break;
    }
    if (!best) { n.invade[k.id] = st.year - I.every + 1; return false; }   // nächstes Jahr wieder versuchen
    const s = best.s, board = boardTile(sim, best.h), hc = comp[board];
    const bx = board % W, by = Math.floor(board / W);
    const list = idle.filter((u) => !u.dead && !u.order && !u.sea && !u.ind && !(u.garrison != null && u.garrison >= 0) && comp[Math.floor(u.y) * W + Math.floor(u.x)] === hc);   // Garnison bleibt
    if (list.length < I.min) return false;
    list.sort((a, b) => (Math.abs(a.x - bx) + Math.abs(a.y - by)) - (Math.abs(b.x - bx) + Math.abs(b.y - by)) || a.id - b.id);
    // erreichen die Soldaten den Hafen überhaupt? (Ufer kann durch Wasser oder Mauern abgeschnitten sein)
    const tryP = WW.Path.find(sim, Math.floor(list[0].y) * W + Math.floor(list[0].x), board, { k: k.id, race: list[0].race, limit: CF().PATH_LIMIT_LONG });
    if (tryP === false) return false;   // Wegsuch-Budget dieses Ticks verbraucht: später nochmal
    if (tryP === null) { n.invade[k.id] = st.year - I.every + 1; return false; }
    const keep = marching > 0 ? 0 : Math.floor(list.length * 0.25);
    const send = Math.min(capOf(s), list.length - keep);
    if (send < I.min) return false;
    for (let i = 0; i < send; i++) {
      const u = list[i];
      u.order = { kind: 'march', city: best.c.id, k: e.id, sea: 1 };
      u.sea = s.id; u.seaS = 'board'; u.swim = null; u.path = null; u.wait = 0; u.breach = -1; u.fails = 0;
      s.passengers.push(u.id);
    }
    s.t = 'load'; s.wait = I.wait;
    s.mission = { kind: 'invade', city: best.c.id, k: e.id, land: best.land.land, anchor: best.land.anchor, board: board, spd: 0, escort: -1 };
    n.invade[k.id] = st.year;
    n.stats.invasions++; n.stats.troopsSent += send;
    const home = sim._cities.get(s.cityId);
    chron(sim, 'seaInvasion', { kingdom: k.name, other: e.name, city: home ? home.name : '', otherCity: best.c.name, n: send, ship: s.name },
      home ? WW.Cities.atCity(home) : undefined, 'war', send + ' Soldaten an Bord');
    return true;
  }

  // Können sich zwei Reiche über das Meer erreichen? (beide mit fertigem Hafen am selben Meer; für diplo.js)
  function seaReach(sim, a, b) {
    const st = sim.state;
    if (!st.naval || !st.naval.harbors.length) return false;
    const nav = seaInfo(sim), ca = new Set(), cb = new Set();
    for (const id of st.naval.harbors) {
      const h = sim._structs.get(id);
      if (!h || h.dead || !h.built || h.dock == null) continue;
      const c = sim._cities.get(h.cityId);
      if (!c) continue;
      if (c.kingdomId === a.id) ca.add(nav.comp[h.dock]); else if (c.kingdomId === b.id) cb.add(nav.comp[h.dock]);
    }
    for (const v of ca) if (cb.has(v)) return true;
    return false;
  }

  // Transporter legt ab (alle an Bord oder Wartezeit vorbei)
  function departLoaded(sim, s) {
    const st = sim.state, m = s.mission;
    let aboard = 0, walking = 0;
    for (const id of s.passengers) { const u = sim._units.get(id); if (!u || u.dead || u.sea !== s.id) continue; if (u.seaS === 'aboard') aboard++; else walking++; }
    if (walking > 0 && s.wait > 0) return;
    // wer nicht da ist, bleibt daheim
    const keep = [];
    for (const id of s.passengers) {
      const u = sim._units.get(id);
      if (!u || u.dead || u.sea !== s.id) continue;
      if (u.seaS === 'aboard') keep.push(id); else release(sim, u);
    }
    s.passengers = keep;
    const okWar = m.kind !== 'invade' || WW.Path.hostileKingdoms(sim, s.kingdomId, m.k);
    if (!aboard || !okWar) { unload(sim, s, null); s.t = 'dock'; s.mission = null; s.wait = 120; return; }
    const r = route(sim, s.home, m.anchor);
    if (!r) { unload(sim, s, null); s.t = 'dock'; s.mission = null; s.wait = 240; return; }
    // Geleitschutz: freies Kriegsschiff des Reichs nahe dem Hafen (bevorzugt derselbe Hafen); hat das Reich Kriegsschiffe,
    // aber gerade keins frei, wartet der Transporter einmal bis zu INVADE.escortWait Ticks darauf
    let esc = null;
    if (m.kind === 'invade') {
      const nav = seaInfo(sim), sc = nav.comp[s.home], hx = s.home % st.W, hy = Math.floor(s.home / st.W);
      let any = false, bd = 1e9;
      for (const w of st.ships) {
        if (w.dead || w.kind !== 'warship' || w.kingdomId !== s.kingdomId || w.t === 'sink') continue;
        any = true;
        if (w.mission && w.mission.kind !== 'patrol') continue;
        if (nav.comp[tileOf(sim, w)] !== sc) continue;
        const d = Math.abs(w.x - hx) + Math.abs(w.y - hy) + (w.harborId === s.harborId ? 0 : 10);
        if (d <= NV().INVADE.escortR && d < bd) { bd = d; esc = w; }
      }
      if (!esc && any && !m.escWait) { m.escWait = 1; s.wait = NV().INVADE.escortWait; return; }
    }
    depart(sim, s, r, m, true);
    if (esc) {
      const wr = route(sim, tileOf(sim, esc), m.anchor);
      if (wr) { depart(sim, esc, wr, { kind: 'escort', ship: s.id, k: m.k, spd: speedOf(sim, s) }, esc.t === 'dock'); m.escort = esc.id; }
    }
  }
  // Transporter auf dem Weg zur Landung: feindliches Kriegsschiff nah und kein Geleit in der Nähe -> einmal an eine andere
  // Landestelle ausweichen; schwer getroffen -> umkehren (die Truppen steigen daheim aus)
  function evade(sim, s, foe) {
    const st = sim.state, m = s.mission, I = NV().INVADE;
    const e = m.escort >= 0 ? shipById(sim, m.escort) : null;
    if (e && !e.dead && e.t !== 'sink') { const dx = e.x - s.x, dy = e.y - s.y; if (dx * dx + dy * dy <= 36) return; }
    if (s.hp < s.maxHp * 0.5) { goHome(sim, s); return; }
    if (m.diverted) return;
    m.diverted = 1;
    const tc = sim._cities.get(m.city);
    if (!tc) return;
    const comp = comps(sim), nav = seaInfo(sim), W = st.W;
    const land = landingNear(sim, tc.cx, tc.cy, I.landMin, I.landMax + 6, comp[tc.cy * W + tc.cx], nav.comp[s.home], s.kingdomId, { x: foe.x, y: foe.y, r: 9 });
    if (!land) return;
    const r = route(sim, tileOf(sim, s), land.anchor);
    if (!r) return;
    m.land = land.land; m.anchor = land.anchor;
    s.route = r; s.ri = 0; s.moving = r.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Seegefecht, Küstenbeschuss, Untergang
  // ---------------------------------------------------------------------------
  function hostileShips(sim, a, b) { return a.kingdomId !== b.kingdomId && WW.Path.hostileKingdoms(sim, a.kingdomId, b.kingdomId); }
  function sink(sim, s, by) {
    const st = sim.state;
    if (s.t === 'sink' || s.dead) return;
    s.t = 'sink'; s.sinkT = NV().SINK_TICKS; s.moving = false; s.route = []; s.ri = 0; s.hp = 0;
    sim.fx({ type: 'shipsink', x: s.x, y: s.y, kind: s.kind, look: s.look });
    sim.fx({ type: 'splash', x: s.x, y: s.y });
    // Besatzung und Passagiere schwimmen an die nächste Küste
    const shore = nearestLand(sim, tileOf(sim, s), s.kingdomId);
    const W = st.W;
    const sx = shore >= 0 ? (shore % W) + 0.5 : s.x, sy = shore >= 0 ? Math.floor(shore / W) + 0.5 : s.y;
    const dist = Math.sqrt((sx - s.x) * (sx - s.x) + (sy - s.y) * (sy - s.y));
    const T = Math.max(20, Math.min(400, Math.round(dist / NV().SWIM_SPEED)));
    let n = CREW[s.kind] || 2;
    const comp = comps(sim);
    const m = s.mission;
    for (const id of s.passengers) {
      const u = sim._units.get(id);
      if (!u || u.dead || u.sea !== s.id) continue;
      n++;
      if (u.seaS !== 'aboard') { release(sim, u); continue; }
      if (shore >= 0) { u.x = sx + (hr(sim, u.id, 5) - 0.5) * 0.5; u.y = sy + (hr(sim, u.id, 6) - 0.5) * 0.5; }
      u.seaS = 'swim'; u.swim = { x0: s.x, y0: s.y, t0: st.tick, t1: st.tick + T }; u.path = null; u.moving = false;
      const sc = shore >= 0 ? comp[shore] : -1;
      if (u.role === 'settler' && m && m.kind === 'settle') {
        if (sc >= 0 && sc === comp[m.site]) { u.site = m.site; u.group = m.group; }
        else { u.site = -1; u.group = -1; if (sim._cities.get(u.cityId)) WW.Units.setRole(sim, u, 'farmer'); }
      } else if (u.order && u.order.sea) {
        const tc = sim._cities.get(u.order.city);
        if (!tc || sc !== comp[tc.cy * W + tc.cx]) u.order = null;
      }
    }
    s.passengers = [];
    if (shore >= 0) sim.fx({ type: 'swim', x: s.x, y: s.y, x2: sx, y2: sy, n: n, t: T });
    st.naval.stats.sunk++;
    const k = sim._kingdoms.get(s.kingdomId), home = sim._cities.get(s.cityId);
    const at = { kingdomId: s.kingdomId, cityId: home ? home.id : -1, x: s.x, y: s.y };
    if (by) {
      const bk = sim._kingdoms.get(by.kingdomId);
      const ev = chron(sim, 'seaBattle', { kingdom: bk ? bk.name : '', other: k ? k.name : '', ship: s.name, attacker: by.name, kind: NV().KINDS[s.kind].name, n: n }, at, 'war', n + ' Schiffbrüchige gerettet');
      if (ev) { ev.popup = 'battle'; ev.important = true; }
    } else chron(sim, 'shipwreck', { kingdom: k ? k.name : '', ship: s.name, kind: NV().KINDS[s.kind].name, n: n }, at, 'war', n + ' Schiffbrüchige gerettet');
  }
  function finishSink(sim, s) {
    const st = sim.state, W = st.W, H = st.H, ter = st.terrain;
    s.dead = true; sim._shipMapDirty = true; sim._shipsDead = true;
    const i = tileOf(sim, s);
    let w = -1;
    if (ter[i] === WW.T.SHALLOW) w = i;
    else {
      const x = i % W, y = (i - x) / W;
      for (let d = 0; d < 8 && w < 0; d++) { const nx = x + DX8[d], ny = y + DY8[d]; if (nx >= 0 && ny >= 0 && nx < W && ny < H && ter[ny * W + nx] === WW.T.SHALLOW) w = ny * W + nx; }
    }
    if (w < 0) return;
    const wx = w === i ? s.x : (w % W) + 0.5, wy = w === i ? s.y : Math.floor(w / W) + 0.5;
    const id = st.mil && typeof st.mil.seq === 'number' ? ++st.mil.seq : ++st.naval.seq;
    st.wrecks.push({ id: id, x: Math.round(wx * 10) / 10, y: Math.round(wy * 10) / 10, kind: 'ship', ship: s.kind, look: s.look, year: st.year, gov: s.gov, k: s.kingdomId, rust: 0 });
    const max = (WW.MIL && WW.MIL.MAX_WRECKS) || 80;
    if (st.wrecks.length > max) st.wrecks.splice(0, st.wrecks.length - max);
    st.naval.stats.wrecks++;
  }
  // Schiff außer Dienst (ohne Untergang): wer an Bord ist, kommt an Land
  function scrap(sim, s) {
    if (s.dead) return;
    if (s.passengers.length) unload(sim, s, null);
    s.dead = true; sim._shipMapDirty = true; sim._shipsDead = true;
    sim.fx({ type: 'splash', x: s.x, y: s.y });
  }
  function fireAt(sim, w, x2, y2, hit) {
    sim.fx({ type: 'shipfire', x: w.x, y: w.y, x2: x2, y2: y2, hit: !!hit });
    w.cd = NV().KINDS.warship.reload;
  }
  function combat(sim) {
    const st = sim.state, K = NV().KINDS.warship;
    const ships = st.ships;
    let warK = null;
    for (const w of ships) {
      if (w.dead || w.kind !== 'warship' || w.t === 'sink') continue;
      if (w.cd > 0) { w.cd -= 10; continue; }
      if (!warK) warK = new Map();
      let aw = warK.get(w.kingdomId);
      if (aw === undefined) { aw = WW.Diplo.atWar(sim, w.kingdomId); warK.set(w.kingdomId, aw); }
      if (!aw) { w.cd = 20; continue; }
      // nächstes feindliches Schiff
      let foe = null, fd = 1e9, near = null, nd = 1e9;
      for (const o of ships) {
        if (o === w || o.dead || o.t === 'sink' || !hostileShips(sim, w, o)) continue;
        const dx = o.x - w.x, dy = o.y - w.y, d = dx * dx + dy * dy;
        // Transporter zuerst, dann Kriegsschiffe
        const pd = d * (o.kind === 'warship' ? 0.6 : o.kind === 'transport' ? 0.8 : 1);   // erst das Geleit, dann der Transporter
        if (d <= K.range * K.range && pd < fd) { fd = pd; foe = o; }
        if (d <= K.sight * K.sight && d < nd) { nd = d; near = o; }
        // bedrohter Transporter auf Landungsfahrt weicht aus
        if (o.kind === 'transport' && o.t === 'out' && o.mission && o.mission.kind === 'invade' && d <= 36) evade(sim, o, w);
      }
      if (foe) {
        const hit = hr(sim, w.id, st.tick) < K.hit;
        const tx = foe.x + (hit ? 0 : (hr(sim, w.id, st.tick + 1) - 0.5) * 2), ty = foe.y + (hit ? 0 : (hr(sim, w.id, st.tick + 2) - 0.5) * 2);
        fireAt(sim, w, tx, ty, hit);
        sim.fx({ type: 'splash', x: tx, y: ty });
        if (hit) {
          foe.hp -= K.dmg * (w.look === 'steam' ? 1.15 : 1) * (w.look === 'canoe' ? 0.5 : 1);
          if (foe.hp <= 0) sink(sim, foe, w);
        }
        continue;
      }
      // Verfolgung: feindliches Schiff in Sicht, Kriegsschiff frei
      const free = w.t === 'dock' || (w.t === 'work' && (!w.mission || w.mission.kind !== 'escort')) || (w.t === 'out' && w.mission && w.mission.kind === 'patrol');
      const chasing = w.t === 'out' && w.mission && w.mission.kind === 'chase';
      if (near && (free || (chasing && ((st.tick + w.id) % 80) < 10))) {
        const r = route(sim, tileOf(sim, w), tileOf(sim, near), 700);
        if (r && r.length <= 3 * K.sight) {
          const was = w.t === 'dock';
          if (r.length > 2) r.length = r.length - 2;   // nicht rammen: auf Schussweite heran
          depart(sim, w, r, { kind: 'chase', target: near.id, spd: 0 }, was);
          w.target = near.id;
          continue;
        }
      }
      // Küstenbeschuss (Regierungen mit Geschützen)
      if (w.t === 'work' || w.t === 'out') { const wk = sim._kingdoms.get(w.kingdomId); if (hasGuns(wk ? wk.gov : w.gov)) bombard(sim, w); }
      if (w.cd <= 0) w.cd = 10;   // nichts zu tun: etwas seltener prüfen
    }
  }
  // Küstenabwehr: fertige Türme des Feindes in Reichweite beschießen Transporter auf Landungsfahrt (je 30 Ticks)
  function coastGuns(sim) {
    const st = sim.state, W = st.W, H = st.H, R = NV().INVADE.towerR, dmg = NV().INVADE.towerDmg;
    for (const s of st.ships) {
      if (s.dead || s.kind !== 'transport' || s.t !== 'out' || !s.mission || s.mission.kind !== 'invade') continue;
      if (((st.tick + s.id) % 30) >= 10) continue;
      const x0 = Math.floor(s.x), y0 = Math.floor(s.y);
      let hit = null;
      for (let dy = -R; dy <= R && !hit; dy++) for (let dx = -R; dx <= R; dx++) {
        const x = x0 + dx, y = y0 + dy;
        if (x < 0 || y < 0 || x >= W || y >= H || dx * dx + dy * dy > R * R) continue;
        const t = sim._structs.get(st.structAt[y * W + x]);
        if (!t || !t.built || t.type !== 'tower') continue;
        const c = sim._cities.get(t.cityId);
        if (c && WW.Path.hostileKingdoms(sim, s.kingdomId, c.kingdomId)) { hit = t; break; }
      }
      if (!hit) continue;
      const hx = hit.x + 0.5, hy = hit.y + 0.5, ok = hr(sim, s.id, st.tick + 9) < 0.6;
      sim.fx({ type: 'shipfire', x: hx, y: hy, x2: s.x, y2: s.y, hit: ok });
      sim.fx({ type: 'splash', x: s.x, y: s.y });
      if (ok) { s.hp -= dmg; if (s.hp <= 0) sink(sim, s, null); else evade(sim, s, { x: hx, y: hy }); }
    }
  }
  function bombard(sim, w) {
    const st = sim.state, W = st.W, H = st.H, K = NV().KINDS.warship;
    const R = Math.ceil(K.shoreRange), x0 = Math.floor(w.x), y0 = Math.floor(w.y);
    let best = null, bd = 1e9;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const sid = st.structAt[y * W + x];
      if (sid < 0) continue;
      const s = sim._structs.get(sid);
      if (!s || s.dead || !s.built || !(WW.Structs.isWallish(s) || s.type === 'harbor')) continue;
      const c = sim._cities.get(s.cityId);
      if (!c || !WW.Path.hostileKingdoms(sim, w.kingdomId, c.kingdomId)) continue;
      const ddx = x + 0.5 - w.x, ddy = y + 0.5 - w.y, d = ddx * ddx + ddy * ddy;
      if (d <= K.shoreRange * K.shoreRange && d < bd) { bd = d; best = s; }
    }
    if (!best) return;
    const tx = best.x + best.w / 2, ty = best.y + best.h / 2;
    fireAt(sim, w, tx, ty, true);
    sim.fx({ type: 'explosion', x: tx, y: ty, r: 0.8 });
    WW.Structs.damage(sim, best, K.wallDmg, null);
    const m = w.mission;
    if (m && !m.bombarded) {
      m.bombarded = 1;
      const c = sim._cities.get(best.cityId), k = sim._kingdoms.get(w.kingdomId);
      if (c) chron(sim, 'seaBombard', { kingdom: k ? k.name : '', city: c.name, ship: w.name }, WW.Cities.atCity(c), 'war', 'Mauer unter Beschuss');
    }
  }

  // ---------------------------------------------------------------------------
  // Häfen: Schiffbau (je Hafen alle 40 Ticks)
  // ---------------------------------------------------------------------------
  function harborTick(sim, h) {
    const st = sim.state;
    const city = sim._cities.get(h.cityId);
    if (!city || !h.built) return;
    const k = sim._kingdoms.get(city.kingdomId);
    if (!k) return;
    if (!h.opened) {
      h.opened = 1;
      chron(sim, 'harborBuilt', { city: city.name, kingdom: k.name }, WW.Cities.atCity(city), 'economy', 'Fischerboote und Schiffe');
    }
    if (h.dock == null || !isSea(st.terrain[h.dock])) return;
    const spec = govSpec(k.gov);
    if (h.prod) {
      h.prog += 40 / NV().KINDS[h.prod].work * spec.build;
      if (h.prog >= 1) {
        const s = spawnShip(sim, h, h.prod, k.id, city.id, h.dock);
        h.prod = null; h.prog = 0;
        if (s) {
          h.made = (h.made | 0) + 1;
          if (!st.naval.first[k.id]) {
            st.naval.first[k.id] = 1;
            chron(sim, 'firstShip', { city: city.name, kingdom: k.name, ship: s.name, kind: NV().KINDS[s.kind].name }, WW.Cities.atCity(city), 'economy', NV().KINDS[s.kind].name);
          }
        }
      }
      return;
    }
    if (st.ships.length >= NV().MAX_SHIPS) return;
    const have = { fishboat: 0, trader: 0, transport: 0, warship: 0 };
    let mine = 0, warK = 0;
    for (const s of st.ships) {
      if (s.dead || s.kingdomId !== k.id) continue;
      mine++;
      if (s.kind === 'warship') warK++;
      if (s.cityId === city.id && have[s.kind] != null) have[s.kind]++;
    }
    if (mine >= NV().MAX_PER_KINGDOM) return;
    const war = WW.Diplo.atWar(sim, k.id);
    const order = war ? ['warship', 'transport', 'fishboat', 'trader'] : ['fishboat', 'trader', 'transport', 'warship'];
    for (const kind of order) {
      if (have[kind] >= quota(sim, city, k, kind)) continue;
      if (kind === 'warship' && warK >= 2 + k.cityIds.length) continue;
      if (kind === 'trader' && !tradePartnerExists(sim, h, city)) continue;
      const cost = shipCost(sim, k, kind);
      if (!WW.Cities.canPay(sim, city, cost)) continue;
      // Reserve: der Bau von Häusern geht vor
      const sk = stockOf(sim, city);
      if (!war && sk.wood - cost.wood < 10 && kind !== 'fishboat') continue;
      WW.Cities.pay(sim, city, cost);
      h.prod = kind; h.prog = 0;
      return;
    }
  }
  function tradePartnerExists(sim, h, city) {
    const nav = seaInfo(sim);
    for (const id of sim.state.naval.harbors) {
      if (id === h.id) continue;
      const o = sim._structs.get(id);
      if (!o || o.dead || !o.built || o.dock == null || o.cityId === city.id) continue;
      const c = sim._cities.get(o.cityId);
      if (c && friendlyKingdoms(sim, city.kingdomId, c.kingdomId) && nav.comp[o.dock] === nav.comp[h.dock]) return true;
    }
    return false;
  }

  // Heimathafen prüfen (Eroberung, Abriss, Untergang des Reichs)
  function checkHome(sim, s) {
    const st = sim.state;
    const k = sim._kingdoms.get(s.kingdomId);
    if (!k) { if (s.t === 'dock' || s.t === 'work') scrap(sim, s); return; }
    const h = sim._structs.get(s.harborId), c = sim._cities.get(s.cityId);
    if (h && !h.dead && c && c.kingdomId === s.kingdomId && h.cityId === c.id) return;
    const homeless = s.harborId < 0 && c && c.kingdomId === s.kingdomId;   // gesetztes Schiff ohne Hafen: Heimat = Wasserkachel
    // anderer Hafen desselben Reichs im selben Meer
    const nav = seaInfo(sim);
    let best = null, bd = 1e9;
    for (const id of st.naval.harbors) {
      const o = sim._structs.get(id);
      if (!o || o.dead || !o.built || o.dock == null) continue;
      const oc = sim._cities.get(o.cityId);
      if (!oc || oc.kingdomId !== s.kingdomId || nav.comp[o.dock] !== nav.comp[tileOf(sim, s)]) continue;
      const d = Math.abs(o.x - s.x) + Math.abs(o.y - s.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) {
      s.harborId = best.id; s.cityId = best.cityId; s.home = best.dock;
      if (s.t === 'dock') { s.t = 'work'; s.wait = 1; }
      return;
    }
    if (homeless) return;
    // Hafenstadt erobert: Schiffe im Hafen wechseln die Flagge
    if (h && !h.dead && c && s.t === 'dock' && c.kingdomId !== s.kingdomId && sim._kingdoms.get(c.kingdomId)) {
      for (const id of s.passengers) { const u = sim._units.get(id); if (u) release(sim, u); }
      s.passengers = [];
      s.kingdomId = c.kingdomId; s.mission = null;
      return;
    }
    if (s.t === 'dock' || s.t === 'work') scrap(sim, s);
  }

  // ---------------------------------------------------------------------------
  // Takt
  // ---------------------------------------------------------------------------
  function tick(sim) {
    const st = sim.state;
    if (!st.naval || !st.ships) defaults(st);
    const n = st.naval, t = st.tick;
    if (t % 60 === 9 || !n.mask) refreshMask(sim, !n.mask);
    // Hafenplanung: jede Stadt alle HARBOR.plan Ticks
    if (t % 10 === 4) {
      const slot = (t / 10) | 0, every = Math.max(1, Math.round(NV().HARBOR.plan / 10));
      for (const c of st.cities) {
        if (c.dead || (c.id + slot) % every !== 0) continue;
        const k = sim._kingdoms.get(c.kingdomId);
        if (k) planHarbor(sim, c, k);
      }
    }
    // Häfen (Bau von Schiffen), Liste aufräumen
    if (n.harbors.length && t % 10 === 0) {
      const slot = (t / 10) | 0;
      let j = 0;
      for (let q = 0; q < n.harbors.length; q++) {
        const id = n.harbors[q];
        const h = sim._structs.get(id);
        if (!h || h.dead || h.type !== 'harbor') continue;
        n.harbors[j++] = id;
        if ((slot + id) % 4 === 0) harborTick(sim, h);
      }
      n.harbors.length = j;
    }
    // Schiffe
    const ships = st.ships;
    if (ships.length) {
      for (const s of ships) {
        if (s.dead) continue;
        if (s.t === 'sink') { if (--s.sinkT <= 0) finishSink(sim, s); continue; }
        if ((t + s.id) % 40 === 13) { checkHome(sim, s); if (s.dead) continue; }
        if (s.t === 'out' || s.t === 'back') {
          if (s.ri >= s.route.length || move(sim, s)) { if (s.t === 'out' || s.t === 'back') arrive(sim, s); }
          continue;
        }
        s.moving = false;
        if (s.wait > 0) { s.wait--; if (s.t !== 'load') continue; }
        decide(sim, s);
      }
      if (t % 10 === 2 && sim._hostileWorld) { combat(sim); coastGuns(sim); }
      if (t % 40 === 21) smoke(sim);
      // Aufräumen
      if (sim._shipsDead) {
        sim._shipsDead = false; sim._shipMapDirty = true;
        let j = 0;
        for (let q = 0; q < ships.length; q++) if (!ships[q].dead) ships[j++] = ships[q];
        ships.length = j;
      }
    }
    // jährlich: Siedler über das Meer, Wracks ohne Militär altern lassen
    if (t % CF().TPY === 120) {
      colonize(sim);
      if (st.naval.stats.colonies || st.naval.stats.sunk) stranded(sim);
      if (!WW.Military && st.wrecks.length) {
        st.wrecks = st.wrecks.filter((w) => w.kind !== 'ship' || st.year - w.year < NV().WRECK_YEARS);
        for (const w of st.wrecks) if (w.kind === 'ship') w.rust = Math.min(3, Math.floor((st.year - w.year) / 6));
      }
    }
  }
  function decide(sim, s) {
    if (s.t === 'load') { departLoaded(sim, s); return; }
    if (s.t === 'dock') {
      const h = sim._structs.get(s.harborId);
      if (!h || h.dead) { s.wait = 40; return; }
      if (s.kind === 'fishboat') startFish(sim, s);
      else if (s.kind === 'trader') startTrade(sim, s);
      else if (s.kind === 'warship') startPatrol(sim, s);
      else s.wait = 120;
      return;
    }
    // 'work' vorbei, Fahrt blockiert: heim
    goHome(sim, s);
  }
  function smoke(sim) {
    const st = sim.state;
    if (!st.pollution || !WW.Industry || !WW.Industry.dims || !(NV().SMOKE_EMIT > 0)) return;
    const d = WW.Industry.dims(st);
    let any = false;
    for (const s of st.ships) {
      if (s.dead || s.look !== 'steam' || !s.coal || !s.moving) continue;
      const cx = Math.min(d.pw - 1, Math.max(0, Math.floor(s.x / d.cell))), cy = Math.min(d.ph - 1, Math.max(0, Math.floor(s.y / d.cell)));
      const i = cy * d.pw + cx;
      st.pollution[i] = Math.min(255, st.pollution[i] + NV().SMOKE_EMIT);
      any = true;
    }
    if (any && st.industry && !(st.industry.any > 0)) st.industry.any = 1;
  }

  // ---------------------------------------------------------------------------
  // Aktionen, Kräfte, Abfragen
  // ---------------------------------------------------------------------------
  function nearestCity(sim, x, y, maxD, kid) {
    let best = null, bd = maxD * maxD;
    for (const c of sim.state.cities) {
      if (c.dead || (kid != null && c.kingdomId !== kid)) continue;
      const dx = c.cx + 0.5 - x, dy = c.cy + 0.5 - y, d = dx * dx + dy * dy;
      if (d <= bd) { bd = d; best = c; }
    }
    return best;
  }
  function doPlaceHarbor(sim, x, y, cityId) {
    const st = sim.state;
    if (!WW.SimUtil.isNum(x) || !WW.SimUtil.isNum(y) || x < 0 || y < 0 || x >= st.W || y >= st.H) return null;
    let city = cityId != null ? sim._cities.get(cityId) : null;
    if (!city) city = sim.query.cityAt(x, y) || nearestCity(sim, x, y, 30);
    if (!city) return null;
    const spot = findHarborSpot(sim, city, { x: x, y: y });
    if (!spot) return null;
    const h = placeHarbor(sim, city, spot, true);
    if (!h) return null;
    const k = sim._kingdoms.get(city.kingdomId);
    chron(sim, 'godHarbor', { city: city.name, kingdom: k ? k.name : '' }, WW.Cities.atCity(city), 'economy', 'Hafen');
    return h.id;
  }
  function doPlaceShip(sim, x, y, kind, kid) {
    const st = sim.state, W = st.W, H = st.H;
    if (!WW.SimUtil.isNum(x) || !WW.SimUtil.isNum(y) || x < 0 || y < 0 || x >= W || y >= H) return null;
    // Wasserkachel bei (x, y)
    let tile = -1, bd = 1e9;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const xx = x0 + dx, yy = y0 + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || !isSea(st.terrain[yy * W + xx])) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; tile = yy * W + xx; }
    }
    if (tile < 0) return null;
    const nav = seaInfo(sim);
    let k = kid != null ? sim._kingdoms.get(kid) : null;
    // Reich: Hafen im selben Meer in der Nähe, sonst nächste Stadt
    let h = null, hd = 1e9;
    for (const id of st.naval.harbors) {
      const o = sim._structs.get(id);
      if (!o || o.dead || !o.built || o.dock == null || nav.comp[o.dock] !== nav.comp[tile]) continue;
      const c = sim._cities.get(o.cityId);
      if (!c || (k && c.kingdomId !== k.id)) continue;
      const d = Math.abs(o.x - x) + Math.abs(o.y - y);
      if (d < hd && d <= 60) { hd = d; h = o; }
    }
    let city = h ? sim._cities.get(h.cityId) : nearestCity(sim, x, y, k ? 1e5 : 40, k ? k.id : null);
    if (!city) return null;
    if (!k) k = sim._kingdoms.get(city.kingdomId);
    if (!k) return null;
    if (NV().KIND_KEYS.indexOf(kind) < 0) kind = WW.Diplo.atWar(sim, k.id) ? 'warship' : (k.gov === 'tribe' ? 'fishboat' : 'trader');
    const s = spawnShip(sim, h, kind, k.id, city.id, tile);
    if (!s) return null;
    if (!h) { s.home = tile; }
    s.t = 'work'; s.wait = 30;
    sim.fx({ type: 'splash', x: s.x, y: s.y });
    chron(sim, 'godShip', { city: city.name, kingdom: k.name, ship: s.name, kind: NV().KINDS[kind].name }, { kingdomId: k.id, cityId: city.id, x: s.x, y: s.y }, 'economy', NV().KINDS[kind].name);
    return s.id;
  }
  function actions(sim, safe) {
    return {
      placeHarbor: safe(function (x, y, cityId) { return doPlaceHarbor(sim, x, y, cityId); }),
      placeShip: safe(function (x, y, kind, kid) { return doPlaceShip(sim, x, y, kind, kid); })
    };
  }
  function queries(sim) {
    return {
      ship: (id) => shipById(sim, id),
      shipNear: function (x, y, r) {
        if (!WW.SimUtil.isNum(x) || !WW.SimUtil.isNum(y)) return null;
        r = WW.SimUtil.isNum(r) ? r : 1.5;
        let best = null, bd = r * r;
        for (const s of sim.state.ships) {
          if (s.dead) continue;
          const dx = s.x - x, dy = s.y - y, d = dx * dx + dy * dy;
          if (d <= bd) { bd = d; best = s; }
        }
        return best;
      },
      ships: (kid) => sim.state.ships.filter((s) => !s.dead && (kid == null || s.kingdomId === kid)),
      harborOf: (cid) => harborOf(sim, cid, false),
      navalStats: function (kid) {
        const out = { ships: { fishboat: 0, trader: 0, transport: 0, warship: 0 }, harbors: 0, atSea: 0 };
        for (const s of sim.state.ships) if (!s.dead && s.kingdomId === kid) { out.ships[s.kind]++; if (s.t !== 'dock') out.atSea++; }
        for (const id of sim.state.naval.harbors) { const h = sim._structs.get(id); const c = h && sim._cities.get(h.cityId); if (c && c.kingdomId === kid) out.harbors++; }
        return out;
      }
    };
  }
  const APPLY = {
    navHarbor: function (sim, x, y) { return doPlaceHarbor(sim, x, y) != null; },
    navShip: function (sim, x, y) { return doPlaceShip(sim, x, y) != null; }
  };
  if (WW.POWERS && WW.NAVAL && WW.NAVAL.POWER_DEFS) {
    for (const key in WW.NAVAL.POWER_DEFS) {
      if (WW.POWERS[key]) continue;
      WW.POWERS[key] = Object.assign({ key: key, brush: false, dir: false, aim: false }, WW.NAVAL.POWER_DEFS[key], { event: null, eventWild: null, apply: APPLY[key] });
      if (Array.isArray(WW.POWER_KEYS) && WW.POWER_KEYS.indexOf(key) < 0) WW.POWER_KEYS.push(key);
    }
  }

  WW.Naval = {
    tick: tick, defaults: defaults, unit: unit, seaWar: seaWar, seaReach: seaReach, actions: actions, queries: queries,
    isSea: isSea, route: route, findHarborSpot: findHarborSpot, placeHarbor: placeHarbor, spawnShip: spawnShip, sink: sink,
    govSpec: govSpec, speedOf: speedOf, quota: quota, capOf: capOf, hasGuns: hasGuns, seaInfo: seaInfo, harborOf: harborOf,
    landingNear: landingNear, homeFull: homeFull, overseasSite: overseasSite, colonize: colonize, boardTile: boardTile
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
