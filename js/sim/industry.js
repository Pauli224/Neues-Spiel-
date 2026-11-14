// =============================================================================
// Wuselwelt – Industrie und Umweltverschmutzung. DOM-frei, deterministisch (verbraucht KEINEN sim.rng:
// Zufall nur über Hashes aus Seed, Tick und Index; Welten ohne Fabriken laufen exakt wie ohne dieses Modul).
// Daten: js/core/config-industry.js (WW.INDUSTRY, WW.STRUCT_INFO.factory, Weltgesetz 'industry'),
// Texte: js/data/texts-industry.js. Haken in js/sim/sim.js (markiert mit // [industry]): tick, defaults,
// save/load.
//
// LADEREIHENFOLGE: js/core/config-industry.js direkt nach js/core/config.js, js/data/texts-industry.js direkt
//   nach js/data/texts.js, dann js/sim/industry.js, js/sim/rail.js, js/sim/camps.js unmittelbar vor js/sim/sim.js
//   (nach powers.js/events.js). Bahn: Kopf von js/sim/rail.js, Arbeitslager: Kopf von js/sim/camps.js.
// HAKEN in js/sim/units.js (markiert // [industry]): updateAll überspringt Einheiten mit u.ind ('train'|'camp'|'escort') ->
//   WW.Industry.unit; hitUnit -> WW.Camps.capture; hostile: role 'prisoner' ist nie Ziel.
//
// WELTGESETZ 'industry' (WW.LAW_INFO, Standard an): aus = keine neuen Fabriken, alle vorhandenen ruhen (active
//   false, kein Rauch, kein Ertrag); sie verfallen aber nicht.
//
// BAUWERK type 'factory' (Fabrik)
//   w/h 2×2 (level 1) bzw. 3×3 (level 2, gebaut ab Großstadt; Monarchie-Schmiede immer 2×2)
//   kind     'kombinat' (Kommunismus) | 'ruestung' (Faschismus) | 'manufaktur' (Handelsrepublik) | 'fabrik' (Demokratie)
//            | 'schmiede' (Monarchie) – Namen in WW.INDUSTRY.KINDS[kind].name
//   style    Regierung (wie alle Bauwerke)
//   level    1 | 2
//   active   true = in Betrieb (raucht, wirkt). Nur wenn fertig, Regierung mit Industrie, Gesetz an, genug Einwohner
//   filtered true = Filter eingebaut (halber Ausstoß; Demokratie)
//   coal     true = läuft mit Kohle aus stock.coal (Ertrag ×1,5 je Fabrik, Ausstoß ×1,25; fehlt Kohle: Holz wie zuvor)
//   closed   0 | Tick der Stilllegung (Regierung ohne Industrie). Nach CFG.CLOSE_YEARS Jahren -> Ruinen.
//   opened   1, sobald die Eröffnung in der Chronik stand
//   Baustelle wie jedes Bauwerk (!built), die Baumeister der Stadt bauen sie. Lage: außerhalb des Mauerrings am
//   Stadtrand im eigenen Gebiet, bevorzugt am Fluss.
//   Wer baut: WW.INDUSTRY.GOVS (Kommunismus viele/früh, Faschismus, Handelsrepublik, Demokratie wenige,
//   Monarchie selten/klein); nie Stamm, Anarchie, Theokratie; nie Völker in WW.INDUSTRY.NO_RACES (elf, frog).
//   Ab Stadtstufe „Stadt" (tier ≥ 2) und minPop; Anzahl 1 + (pop − minPop) / perPop, höchstens max.
//
// RASTER
//   state.pollution  Uint8Array(pw * ph), Luftverschmutzung 0..255. Zellgröße CELL = 4 Kacheln
//                    (WW.INDUSTRY.CFG.CELL); pw = ceil(W / 4), ph = ceil(H / 4); Kachel (x, y) -> Zelle
//                    floor(y / 4) * pw + floor(x / 4). Hilfe: WW.Industry.dims(state) -> { pw, ph, cell },
//                    WW.Industry.at(state, x, y) -> 0..255. Ab ~60 Dunst sichtbar, ab 170 Säureregen-Gefahr.
//   state.murk       Uint8Array(W * H), Trübung von Wasserkacheln 0..255 (entsteht auf 'river' unter verschmutzter Luft,
//                    fließt stromabwärts – zu Wassernachbarn mit geringerer state.height, sonst gleich hoch – bis wenige
//                    Kacheln ins Meer; > 0 trüb, weniger Fisch). Dirty-Kacheln, wenn sich murk >> 3 ändert oder 0 <-> > 0.
//   state.barren     Uint8Array(W * H), ausgelaugter, grauer Boden 0..255 (Landkacheln). Steigt unter Luft ≥ TH_BARREN (45)
//                    und durch Ruß im Umkreis 3,5 aktiver Fabriken, heilt bei Luft < 30 um 4 je 60 Ticks.
//                    Stufen: ≥ 80 Feld trägt weniger, ≥ 95 Bäume sterben (Gelände deforested + state.cleared = tote
//                    Stämme), ≥ 230 Wiese/Blumen/Savanne/Tundra -> 'ash' (dauerhaft). Dirty-Kacheln bei barren >> 6.
//                    Darstellung: Stufen 0 / >0 / >85 / >170 (Kachel-Meldung nur beim Stufenwechsel, Hysterese ±BARREN_HYST).
//   state.soot       Uint8Array(W * H), Ruß 0..SOOT_MAX im Umkreis SOOT_R aktiver Fabriken (Landkacheln); steigt je
//                    Folgen-Durchlauf, klingt ohne Fabrik um SOOT_DECAY ab. Darstellung an/aus (> 0); Meldung nur dabei.
//                    Gespeichert als rasters.soot (nur wenn vorhanden; fehlt = leer).
//   state.wind       { dx, dy (Einheitsvektor aus 16 Richtungen), dir 0..15 (0 = Osten, im Uhrzeigersinn, 4 = Süden),
//                    str 0.6..1 } – dreht sich langsam (alle 120 Ticks evtl. um 1/16).
//   state.industry   { any (Summe der Verschmutzung beim letzten Schritt, 0 = alles sauber), murk (Anzahl trüber Kacheln),
//                    barren (Anzahl ausgelaugter Kacheln), soot (Anzahl berußter Kacheln),
//                    dc (1 = Folgen-Durchlauf nötig, 0 = alles sauber und abgeräumt) }
//
// KENNZAHLEN
//   city.pollution 0..100 (Luft über der Stadt), city.indActive (aktive Fabriken), city.indNext (Tick der nächsten
//   Bauprüfung), city.indHaze/indSick/indTreesY/indAcidY/indMurkY (Chronik-Merker)
//   kingdom.pollution 0..100 (nach Einwohnern gewichtetes Mittel der Städte), kingdom.indFilter (Jahr des
//   Filterbeschlusses | 0), kingdom.indComplY
//
// WIRKUNG (über WW.Mods, source 'industry' = Ertrag der Fabriken, source 'industry_pol' = Folgen der Luft)
//   Fabriken: je aktiver Fabrik die Mods aus WW.INDUSTRY.GOVS[gov].mods (z. B. gold ×1,25, strength ×1,12, soldiers +3 Pkt.)
//   Verschmutzung ab city.pollution ≥ 8: happiness −0,3 je Punkt, food × (1 − 0,005 je Punkt, min. 0,5), trübe Flüsse
//   in Stadtnähe food × 0,9, Felder auf ausgelaugtem Boden: food × (1 − Anteil/2). city.indBarren = Anteil 0..100.
//   city.pollution misst Stadt und Stadtrand (Ringradius + 8 Kacheln).
// FOLGEN (alle 60 Ticks): Bäume sterben ab Zelle ≥ 85 (Wald -> deforested-Gelände, state.cleared = CLEARED_MAX:
//   tote Stümpfe), Flüsse ab ≥ 70 trüb (breitet sich entlang des Flusses aus, Fische verschwinden), Bewohner ab
//   ≥ 105 krank (u.sick), Tiere (category 'animal', nicht vom Spieler gesetzt) wandern ab ≥ 95 ab, Säureregen
//   (Kraft 'acidrain') über Städten mit pollution ≥ 60 und Zelle ≥ 170 (höchstens alle 2 Jahre), Nachbarreiche (Hauptstadt ≤ 64 Kacheln)
//   verlieren jährlich Meinung (Elfen ×2,5).
// REINIGUNG: Abbau je Schritt, Wind trägt fort und verdünnt; Kraft 'rain' (r 5, ×0,35), 'breeze' (r 7, ×0,12),
//   'acidrain' (r 5, ×0,6) – angehängt über WW.POWERS[key].apply (Hülle, powers.js unverändert).
//
// FX: smokeplume { x, y, kind, filtered, big } alle 30 Ticks je aktiver Fabrik (Schornstein-Mitte, Kachelkoord.)
// EREIGNISSE (group 'nature', mit effectText): indFirst, indMore, indHaze, indClean, indTrees, indSick, indMurk, indBarren,
//   indAcid, indFilterVote, indFilter, indClose, indRuin, indComplaint
// SCHNITTSTELLE: WW.Industry.tick(sim), defaults(st), save(st, o), load(st, o), dims(st), at(st, x, y),
//   specFor(sim, city) -> Eintrag aus GOVS | null, tryBuild(sim, city, force) -> Bauwerk | null, clean(sim, x, y, r, keep),
//   factories(sim, city) -> [Bauwerk]
// =============================================================================
(function (WW) { 'use strict';

  const CF = () => WW.INDUSTRY.CFG;
  const TPY = () => WW.CONFIG.TPY;

  function hh(a, b) {
    let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }
  function seedOf(sim) { return sim._seedHash | 0; }

  // ---------------------------------------------------------------------------
  // Zustand
  // ---------------------------------------------------------------------------
  function dims(st) { const c = CF().CELL; return { pw: Math.ceil(st.W / c), ph: Math.ceil(st.H / c), cell: c }; }
  function defaults(st) {
    const d = dims(st);
    if (!(st.pollution instanceof Uint8Array) || st.pollution.length !== d.pw * d.ph) st.pollution = new Uint8Array(d.pw * d.ph);
    if (!(st.murk instanceof Uint8Array) || st.murk.length !== st.W * st.H) st.murk = new Uint8Array(st.W * st.H);
    if (!(st.barren instanceof Uint8Array) || st.barren.length !== st.W * st.H) st.barren = new Uint8Array(st.W * st.H);
    if (!(st.soot instanceof Uint8Array) || st.soot.length !== st.W * st.H) st.soot = new Uint8Array(st.W * st.H);
    const w = st.wind && typeof st.wind === 'object' ? st.wind : {};
    w.dir = (w.dir | 0) & 15; w.str = typeof w.str === 'number' && isFinite(w.str) ? w.str : 0.8;
    const D = WW.Cities.DIRS16[w.dir]; w.dx = D[0]; w.dy = D[1];
    st.wind = w;
    const s = st.industry && typeof st.industry === 'object' ? st.industry : {};
    s.any = +s.any || 0; s.murk = s.murk | 0; s.barren = s.barren | 0; s.soot = s.soot | 0; s.dc = s.dc === 0 ? 0 : 1;
    st.industry = s;
    if (st.laws && !('industry' in st.laws) && WW.LAW_DEFAULTS && 'industry' in WW.LAW_DEFAULTS) st.laws.industry = WW.LAW_DEFAULTS.industry;
    // city.pollution / kingdom.pollution ergänzt der Takt (plan); hier nichts an Städten ändern (Laden bleibt formstabil)
    if (WW.Rail) WW.Rail.defaults(st);
    if (WW.Camps) WW.Camps.defaults(st);
  }
  function save(st, o) {
    delete o.pollution;
    if (st.pollution) o.rasters.pollution = WW.SimUtil.encodeArray(st.pollution);
    delete o.soot;
    if (st.soot && st.industry && st.industry.soot > 0) o.rasters.soot = WW.SimUtil.encodeArray(st.soot);
  }
  function load(st, o) {
    if (o.rasters && o.rasters.pollution) { const d = dims(st); st.pollution = WW.SimUtil.decodeArray(o.rasters.pollution, Uint8Array, d.pw * d.ph); }
    if (o.rasters && o.rasters.soot) st.soot = WW.SimUtil.decodeArray(o.rasters.soot, Uint8Array, st.W * st.H);
  }
  function at(st, x, y) {
    if (!st.pollution) return 0;
    const c = CF().CELL, pw = Math.ceil(st.W / c);
    x = Math.floor(x / c); y = Math.floor(y / c);
    if (x < 0 || y < 0 || x >= pw || y * c >= st.H) return 0;
    return st.pollution[y * pw + x] | 0;
  }

  // ---------------------------------------------------------------------------
  // Wer baut was
  // ---------------------------------------------------------------------------
  function specFor(sim, city) {
    const k = sim._kingdoms.get(city.kingdomId);
    if (!k) return null;
    if (WW.INDUSTRY.NO_RACES[city.race] || WW.INDUSTRY.NO_RACES[k.race]) return null;
    return WW.INDUSTRY.GOVS[k.gov] || null;
  }
  function kindVars(kind) {
    const K = WW.INDUSTRY.KINDS[kind] || WW.INDUSTRY.KINDS.fabrik, n = K.g === 'n';
    return { kind: K.name, kindA: (n ? 'ein ' : 'eine ') + K.name, kindD: (n ? 'das ' : 'die ') + K.name,
      KindD: (n ? 'Das ' : 'Die ') + K.name, kindD_dat: (n ? 'dem ' : 'der ') + K.name };
  }
  function factories(sim, city) {
    const out = [];
    for (const s of sim.state.structs) if (!s.dead && s.type === 'factory' && s.cityId === city.id) out.push(s);
    return out;
  }
  function chron(sim, type, vars, city, k, effectText) {
    let where;
    if (city) where = WW.Cities.atCity(city);
    else if (k) { const cap = sim._cities.get(k.capitalId); where = cap ? WW.Cities.atCity(cap) : { kingdomId: k.id }; }
    const ev = sim.event(type, vars, where);
    if (ev) { ev.group = 'nature'; ev.effectText = effectText || ''; }
    return ev;
  }
  function pct(m) { const v = Math.round((m - 1) * 100); return (v >= 0 ? '+' : '−') + Math.abs(v) + ' %'; }
  function spec2text(spec) {
    const N = (WW.Mods && WW.Mods.KEY_NAMES) || {};
    return spec.mods.map((m) => (N[m.key] || m.key) + ' ' + (m.mul ? pct(m.mul) : '+' + Math.round(m.add * 100) + ' Pkt.')).join(', ');
  }

  // ---------------------------------------------------------------------------
  // Bauplatz: außerhalb des Mauerrings am Stadtrand, bevorzugt am Fluss
  // ---------------------------------------------------------------------------
  // opt: { toward: { x, y }, loose } – loose: Rückfall ohne freie Gasse (wird automatisch versucht). toward: Bauplatz auf der Seite, die diesem Punkt zugewandt ist (Bahnhof Richtung Nachbarstadt)
  function findSpot(sim, city, w, h, opt) {
    const st = sim.state, W = st.W, H = st.H, owner = st.owner, inRing = st.inRing, id = city.id;
    const T = WW.T;
    const plan = new Set((city.wall && city.wall.plan) || []);
    const px = city.cx + 0.5, py = city.cy + 0.5;
    // ohne Ring: Abstand ≥ 5 + Stufe; mit Ring: außerhalb (Fläche prüft inRing/plan), bevorzugt dicht am mittleren Ringradius
    let ringR = 5 + (city.tier | 0), minD = ringR;
    if (plan.size) {
      let sum = 0;
      for (const i of plan) { const dx = (i % W) + 0.5 - px, dy = Math.floor(i / W) + 0.5 - py; sum += Math.sqrt(dx * dx + dy * dy); }
      ringR = sum / plan.size; minD = 4;
    }
    const r = Math.min(28, Math.max(WW.Cities.territoryRadius(city, sim), ringR + 10));
    const ownOk = (o) => o === id || o === -1 || ((sim._cities.get(o) || {}).kingdomId === city.kingdomId);
    const area = (i) => {
      if (!ownOk(owner[i]) || inRing[i] !== -1 || plan.has(i)) return false;   // eigenes, reichseigenes oder freies Land
      const s = sim._structs.get(st.structAt[i]);
      return !(s && WW.Structs.isWallish(s));
    };
    const o = { area: area, fieldOk: true, race: city.race, cityId: id, needWalkBorder: true };
    // lockere Prüfung (Rückfall bei engen Lagen): nur die Grundfläche, ohne freie Gasse rundum
    const looseOk = (x, y) => {
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const i = (y + dy) * W + x + dx;
        if (!area(i)) return false;
        const s = sim._structs.get(st.structAt[i]);
        if (s && !(s.type === 'ruin' || (s.type === 'field' && s.cityId === id))) return false;
        if (!WW.Structs.terrainBuildable(sim, i, city.race)) return false;
      }
      return true;
    };
    const loose = !!(opt && opt.loose);
    let best = -1, bs = -1e9;
    const x0 = Math.max(1, Math.floor(px - r)), x1 = Math.min(W - 2 - w, Math.ceil(px + r));
    const y0 = Math.max(1, Math.floor(py - r)), y1 = Math.min(H - 2 - h, Math.ceil(py + r));
    const want = ringR + 6;   // etwas Abstand: wachsende Mauerringe reißen ab, was im Weg steht
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const own = owner[y * W + x];
      if (!ownOk(own)) continue;
      const mx = x + w / 2, my = y + h / 2;
      const d = Math.sqrt((mx - px) * (mx - px) + (my - py) * (my - py));
      if (d < minD || d > r - 1) continue;
      if (loose ? !looseOk(x, y) : WW.Cities.footprintOk(sim, x, y, w, h, o) < 0) continue;
      let river = 0, wood = 0;
      for (let yy = Math.max(0, y - 2); yy < Math.min(H, y + h + 2); yy++) for (let xx = Math.max(0, x - 2); xx < Math.min(W, x + w + 2); xx++) {
        const t = st.terrain[yy * W + xx];
        if (t === T.RIVER) river++;
        else if (WW.TERRAIN_LUT.wood[t]) wood++;
      }
      const tw = opt && opt.toward ? -Math.hypot(mx - opt.toward.x, my - opt.toward.y) * 0.6 : 0;
      const score = tw - Math.abs(d - want) - Math.max(0, d - want - 4) * 2 + (river ? 3 + Math.min(2, river * 0.2) : 0) - wood * 0.1 + hh(seedOf(sim) ^ id, y * W + x) * 0.8 - (own === id ? 0 : 2);
      if (score > bs) { bs = score; best = y * W + x; }
    }
    if (best < 0 && !loose) return findSpot(sim, city, w, h, Object.assign({}, opt || {}, { loose: true }));
    return best;
  }

  function place(sim, city, spec, i, big) {
    const st = sim.state, W = st.W;
    const w = big ? 3 : 2, x = i % W, y = Math.floor(i / W);
    for (let dy = -1; dy <= w; dy++) for (let dx = -1; dx <= w; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= st.H) continue;
      const s = sim._structs.get(st.structAt[yy * W + xx]);
      if (s && (s.type === 'ruin' || (s.type === 'field' && s.cityId === city.id))) WW.Structs.remove(sim, s);
    }
    for (let dy = 0; dy < w; dy++) for (let dx = 0; dx < w; dx++) if (st.structAt[(y + dy) * W + x + dx] !== -1) return null;
    const k = sim._kingdoms.get(city.kingdomId);
    const s = WW.Structs.create(sim, 'factory', x, y, city.id, { level: big ? 2 : 1, style: k && k.gov });
    if (!s) return null;
    if (big) {
      for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
        const j = (y + dy) * W + x + dx;
        if (st.structAt[j] === -1) { st.structAt[j] = s.id; sim.markDirty(j); }
      }
      s.w = 3; s.h = 3;
    }
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) { const j = (y + dy) * W + x + dx; if (st.owner[j] === -1) { st.owner[j] = city.id; sim.markDirty(j); } }
    s.kind = spec.kind; s.active = false; s.filtered = false; s.closed = 0; s.opened = 0;
    if (!city.sites) city.sites = [];
    city.sites.push(s.id);
    return s;
  }

  // Neue Fabrik planen. force = ohne Abklingzeit und Bedarf (Tests)
  function tryBuild(sim, city, force) {
    const st = sim.state;
    const spec = specFor(sim, city);
    if (!spec || !st.laws.industry) return null;
    if (!force) {
      if ((city.tier | 0) < 2 || city.pop < spec.minPop || !city.centerOk) return null;
      if ((city.indNext | 0) > st.tick) return null;
      // erst wenn der Mauerring geplant ist (sonst reißt ihn die erste Mauer gleich wieder ab)
      const g = WW.GOVERNMENTS[(sim._kingdoms.get(city.kingdomId) || {}).gov];
      if (g && g.wallMax > 0 && !(city.wall && city.wall.plan && city.wall.plan.length) && city.pop < 60) return null;
      const list = factories(sim, city);
      if (list.some((s) => !s.built)) return null;
      const want = Math.min(spec.max, 1 + Math.floor((city.pop - spec.minPop) / spec.perPop));
      if (list.length >= want) return null;
    }
    const big = (city.tier | 0) >= CF().LEVEL2_TIER && !(WW.INDUSTRY.KINDS[spec.kind] || {}).small;
    let i = findSpot(sim, city, big ? 3 : 2, big ? 3 : 2);
    let b = big;
    if (i < 0 && big) { i = findSpot(sim, city, 2, 2); b = false; }
    if (i < 0) { city.indNext = st.tick + TPY(); return null; }
    const s = place(sim, city, spec, i, b);
    city.indNext = st.tick + (s ? (TPY() >> 1) : TPY());
    return s;
  }

  // ---------------------------------------------------------------------------
  // Fabriken: Zustand, Stilllegung, Filter, Ertrag (alle PLAN_EVERY Ticks)
  // ---------------------------------------------------------------------------
  function plan(sim) {
    const st = sim.state;
    const byCity = new Map();
    const list = [];
    for (const s of st.structs) {
      if (s.dead || s.type !== 'factory') continue;
      let a = byCity.get(s.cityId); if (!a) { a = []; byCity.set(s.cityId, a); } a.push(s);
    }
    const law = !!st.laws.industry;
    for (const k of st.kingdoms) if (k.pollution == null) k.pollution = 0;
    for (const city of st.cities) {
      if (city.pollution == null) city.pollution = 0;
      if (city.indActive == null) city.indActive = 0;
      const k = sim._kingdoms.get(city.kingdomId);
      if (!k) continue;
      const spec = specFor(sim, city);
      const fs = byCity.get(city.id) || [];
      byCity.delete(city.id);
      let cap = Math.floor(city.pop / CF().WORKERS), n = 0, closedNow = null, refresh = false;
      for (const s of fs) {
        if (!spec) {
          if (!s.built) { WW.Structs.remove(sim, s); refresh = true; continue; }
          if (!s.closed) { s.closed = st.tick; closedNow = closedNow || s; }
          s.active = false;
          if (st.tick - s.closed >= CF().CLOSE_YEARS * TPY()) {
            const v = kindVars(s.kind);
            WW.Structs.destroy(sim, s); refresh = true;
            chron(sim, 'indRuin', Object.assign({ city: city.name }, v), city, k, 'Fabrik verfällt zur Ruine');
          }
          continue;
        }
        if (s.closed) s.closed = 0;
        if (s.kind !== spec.kind) { s.kind = spec.kind; s.style = k.gov; WW.Structs.forTiles(sim, s, (i) => sim.markDirty(i)); }
        const on = law && s.built && cap > 0;
        if (on) { cap--; n++; }
        if (on && !s.opened) {
          s.opened = 1;
          const cnt = fs.filter((f) => f.opened).length;
          chron(sim, cnt > 1 ? 'indMore' : 'indFirst', Object.assign({ city: city.name, n: cnt }, kindVars(s.kind)), city, k,
            spec2text(spec) + ' je Fabrik, dafür Qualm');
        }
        if (on !== !!s.active) { s.active = on; WW.Structs.forTiles(sim, s, (i) => sim.markDirty(i)); }
        if (on) list.push(s);
      }
      if (refresh) WW.Cities.refreshLists(sim, city);
      if (closedNow) chron(sim, 'indClose', Object.assign({ city: city.name }, kindVars(closedNow.kind)), city, k, 'Fabriken ruhen und verfallen; Luft wird besser');
      // Ertrag
      const gk = spec ? k.gov : '';
      // Kohle (stock.coal, falls die Simulation sie kennt): Fabriken laufen stärker (Ertrag ×COAL_BOOST je Fabrik),
      // qualmen aber mehr; ohne Kohle (fehlt oder 0) heizen sie mit Holz wie bisher
      const sk = n ? WW.Cities.stock(sim, city) : null;
      const coal = !!(sk && typeof sk.coal === 'number' && sk.coal >= n * CF().COAL_USE);
      if (coal) sk.coal = Math.max(0, sk.coal - n * CF().COAL_USE);
      for (const f of fs) if (!f.dead && f.coal !== (coal && !!f.active)) f.coal = coal && !!f.active;
      if (n !== (city.indActive | 0) || (n && city.indGov !== gk) || coal !== !!city.indCoal) {
        city.indCoal = coal;
        if (WW.Mods) {
          WW.Mods.remove(city, 'industry');
          const e = n * (coal ? CF().COAL_BOOST : 1);
          if (n && spec) for (const m of spec.mods) {
            const mod = { key: m.key, source: 'industry', name: (n > 1 ? n + ' Fabriken' : 'Fabrik') + (coal ? ' (Kohle)' : '') };
            if (m.mul) mod.mul = Math.pow(m.mul, e); if (m.add) mod.add = m.add * e;
            WW.Mods.add(city, mod);
          }
        }
        city.indActive = n;
      }
      city.indGov = gk;
      // abgerissene Fabrik (z. B. wachsender Mauerring): sofort Ersatz weiter draußen planen
      const have = fs.filter((f) => !f.dead).length;
      if (have < (city.indHave | 0) && spec) city.indNext = 0;
      city.indHave = have;
      // Neubau
      if (spec && law && !(city.indNext > st.tick)) WW.Industry.tryBuild(sim, city, false);
      // Filter (Demokratie)
      if (k.gov === 'democracy') filters(sim, k, city, fs);
    }
    // Fabriken ohne Stadt (Stadt zerstört): verfallen
    for (const [, fs] of byCity) for (const s of fs) {
      s.active = false;
      if (!s.closed) s.closed = st.tick;
      if (st.tick - s.closed >= CF().CLOSE_YEARS * TPY()) WW.Structs.destroy(sim, s);
    }
    sim._indList = null;   // neu aus state.structs (gleiche Reihenfolge nach dem Laden)
    void list;
  }

  function filters(sim, k, city, fs) {
    const st = sim.state;
    if (!k.indFilter) {
      const law = k.laws && k.laws.naturschutz != null;
      if (law || (k.pollution | 0) >= 30) {
        k.indFilter = st.year || 1;
        if (!law) chron(sim, 'indFilterVote', { kingdom: k.name }, null, k, 'Filter für alle Fabriken: Ausstoß −50 %');
      } else return;
    }
    if ((city.indFilterT | 0) > st.tick) return;
    for (const s of fs) {
      if (s.dead || !s.built || s.filtered) continue;
      s.filtered = true;
      city.indFilterT = st.tick + (TPY() >> 1);
      WW.Structs.forTiles(sim, s, (i) => sim.markDirty(i));
      sim.fx({ type: 'sparkle', x: s.x + s.w / 2, y: s.y + s.h / 2 });
      chron(sim, 'indFilter', Object.assign({ city: city.name }, kindVars(s.kind)), city, k, 'Ausstoß dieser Fabrik −50 %');
      break;
    }
  }

  function activeList(sim) {
    if (!sim._indList) sim._indList = sim.state.structs.filter((s) => !s.dead && s.type === 'factory' && s.active);
    return sim._indList;
  }

  // ---------------------------------------------------------------------------
  // Luft: Ausstoß, Wind, Verdünnung, Abbau (alle STEP Ticks)
  // ---------------------------------------------------------------------------
  function emission(s) {
    const K = WW.INDUSTRY.KINDS[s.kind] || WW.INDUSTRY.KINDS.fabrik;
    return K.emit * (s.level >= 2 ? 1.5 : 1) * (s.filtered ? 0.5 : 1) * (s.coal ? CF().COAL_EMIT : 1);
  }
  function step(sim) {
    const st = sim.state, C = CF(), d = dims(st), pw = d.pw, ph = d.ph, N = pw * ph;
    const pol = st.pollution;
    const fl = activeList(sim);
    const trains = WW.Rail ? WW.Rail.emitters(sim) : [];
    if (!fl.length && !trains.length && !(st.industry.any > 0)) return;
    let a = sim._indA, b = sim._indB;
    if (!a || a.length !== N) { a = sim._indA = new Float32Array(N); b = sim._indB = new Float32Array(N); }
    for (let i = 0; i < N; i++) a[i] = pol[i];
    for (const s of fl) {
      if (s.dead || !s.active) continue;
      const cx = Math.min(pw - 1, Math.floor((s.x + s.w - 1) / C.CELL)), cy = Math.min(ph - 1, Math.floor(s.y / C.CELL));
      a[cy * pw + cx] += emission(s);
    }
    for (const t of trains) {
      const cx = Math.min(pw - 1, Math.max(0, Math.floor(t.x / C.CELL))), cy = Math.min(ph - 1, Math.max(0, Math.floor(t.y / C.CELL)));
      a[cy * pw + cx] += WW.RAIL.EMIT;
    }
    const w = st.wind, sh = C.WIND_SHARE * w.str, ad = Math.abs(w.dx) + Math.abs(w.dy) || 1;
    const ax = sh * Math.abs(w.dx) / ad, ay = sh * Math.abs(w.dy) / ad, sx = w.dx > 0.01 ? 1 : (w.dx < -0.01 ? -1 : 0), sy = w.dy > 0.01 ? 1 : (w.dy < -0.01 ? -1 : 0);
    const D = C.DIFFUSE, keep = 1 - (sx ? ax : 0) - (sy ? ay : 0) - 4 * D;
    b.fill(0);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
      const i = y * pw + x, v = a[i];
      if (v <= 0) continue;
      b[i] += v * keep;
      if (sx) { const xx = x + sx; if (xx >= 0 && xx < pw) b[i + sx] += v * ax; }
      if (sy) { const yy = y + sy; if (yy >= 0 && yy < ph) b[i + sy * pw] += v * ay; }
      const dv = v * D;
      if (x > 0) b[i - 1] += dv; if (x < pw - 1) b[i + 1] += dv;
      if (y > 0) b[i - pw] += dv; if (y < ph - 1) b[i + pw] += dv;
    }
    let sum = 0;
    for (let i = 0; i < N; i++) {
      let v = Math.round(b[i] * C.DECAY - C.DECAY_SUB);
      if (v < 0) v = 0; else if (v > 255) v = 255;
      pol[i] = v; sum += v;
    }
    st.industry.any = sum;
  }

  function windTurn(sim) {
    const st = sim.state, w = st.wind, s = seedOf(sim);
    const r = hh(s ^ 0x51ed, st.tick);
    if (r < 0.3) w.dir = (w.dir + 1) & 15; else if (r < 0.6) w.dir = (w.dir + 15) & 15;
    w.str = Math.round((0.6 + 0.4 * hh(s ^ 0x77aa, st.tick)) * 100) / 100;
    const D = WW.Cities.DIRS16[w.dir]; w.dx = D[0]; w.dy = D[1];
  }

  // Reinigen um (x, y) im Radius r (Kacheln): Anteil keep bleibt
  function clean(sim, x, y, r, keep) {
    const st = sim.state;
    if (!st.pollution) return;
    const C = CF().CELL, d = dims(st);
    for (let cy = Math.max(0, Math.floor((y - r) / C)); cy <= Math.min(d.ph - 1, Math.floor((y + r) / C)); cy++) {
      for (let cx = Math.max(0, Math.floor((x - r) / C)); cx <= Math.min(d.pw - 1, Math.floor((x + r) / C)); cx++) {
        const nx = Math.max(cx * C, Math.min(x, cx * C + C)), ny = Math.max(cy * C, Math.min(y, cy * C + C));
        if ((nx - x) * (nx - x) + (ny - y) * (ny - y) > r * r) continue;
        const i = cy * d.pw + cx;
        st.pollution[i] = Math.floor(st.pollution[i] * keep);
      }
    }
  }
  function hookPowers() {
    if (!WW.POWERS) return false;
    const C = CF();
    const hook = (key, r, keep) => {
      const p = WW.POWERS[key];
      if (!p || typeof p.apply !== 'function' || p.apply._ind) return;
      const orig = p.apply;
      const f = function (sim, x, y) { const res = orig.apply(this, arguments); try { clean(sim, x, y, r, keep); } catch (e) { /* nie werfen */ } return res; };
      f._ind = true;
      p.apply = f;
    };
    hook('rain', 5, C.RAIN_CLEAN);
    hook('breeze', 7, C.BREEZE_CLEAN);
    hook('acidrain', 5, 0.6);
    return true;
  }
  let hooked = hookPowers();

  // ---------------------------------------------------------------------------
  // Folgen (alle EFFECT_EVERY Ticks)
  // ---------------------------------------------------------------------------
  // Luft über der Stadt samt Stadtrand (Ringradius + 8 Kacheln, mind. 7×7 Zellen): Mittel und Spitze gemischt
  function cityPollution(st, city, d) {
    const C = d.cell, ccx = Math.floor(city.cx / C), ccy = Math.floor(city.cy / C);
    const ins = (city.wall && city.wall.inside) | 0;
    const R = Math.max(3, Math.min(7, Math.ceil((Math.sqrt(ins / 3.14) + 8) / C)));
    let sum = 0, wsum = 0, mx = 0;
    for (let y = ccy - R; y <= ccy + R; y++) for (let x = ccx - R; x <= ccx + R; x++) {
      if (x < 0 || y < 0 || x >= d.pw || y >= d.ph) continue;
      const v = st.pollution[y * d.pw + x], wt = Math.max(Math.abs(x - ccx), Math.abs(y - ccy)) <= 1 ? 2 : 1;
      sum += v * wt; wsum += wt; if (v > mx) mx = v;
    }
    const avg = wsum ? sum / wsum : 0;
    return Math.max(0, Math.min(100, Math.round((avg * 0.45 + mx * 0.55) * 100 / 150)));
  }

  function effects(sim) {
    const st = sim.state, C = CF(), d = dims(st), W = st.W, H = st.H, pw = d.pw, pol = st.pollution;
    const any = st.industry.any > 0;
    const s0 = seedOf(sim), tk = st.tick;
    const T = WW.T, LUT = WW.TERRAIN_LUT;
    let changed = false;
    const treeDead = any ? new Map() : null;
    const murkPass = any || st.industry.murk > 0;
    if (murkPass) murkBegin(sim);
    if (any) {
      for (let cy = 0; cy < d.ph; cy++) for (let cx = 0; cx < pw; cx++) {
        const v = pol[cy * pw + cx];
        if (v < C.TH_MURK && v < C.TH_TREES) continue;
        // Bäume sterben
        if (v >= C.TH_TREES) {
          const tries = 1 + ((v - C.TH_TREES) >> 5), p = Math.min(0.85, (v - C.TH_TREES + 15) / 150);
          for (let t = 0; t < tries; t++) {
            const r = hh(s0 ^ (cy * pw + cx), tk * 7 + t);
            const x = cx * d.cell + Math.floor(r * 16) % d.cell, y = cy * d.cell + (Math.floor(r * 16) >> 2);
            if (x >= W || y >= H) continue;
            const i = y * W + x, ter = st.terrain[i];
            if (!LUT.wood[ter] || st.structAt[i] !== -1) continue;
            if (hh(s0 ^ 0x3131, i + tk) >= p) continue;
            const nt = WW.Walls && WW.Walls.deforested ? WW.Walls.deforested(ter) : T.GRASS;
            if (nt === ter) continue;
            st.terrain[i] = nt;
            if (st.cleared) st.cleared[i] = WW.CONFIG.CLEARED_MAX || 240;
            sim.markDirty(i); changed = true;
            const o = st.owner[i];
            if (o >= 0) treeDead.set(o, (treeDead.get(o) || 0) + 1);
          }
        }
        // Flüsse werden trüb
        if (v >= C.TH_MURK) {
          for (let y = cy * d.cell; y < Math.min(H, cy * d.cell + d.cell); y++) for (let x = cx * d.cell; x < Math.min(W, cx * d.cell + d.cell); x++) {
            const i = y * W + x;
            if (st.terrain[i] !== T.RIVER) continue;
            const m = st.murk[i], nm = Math.min(255, m + 10 + ((v - C.TH_MURK) >> 1));
            if (!m) st.industry.murk++;
            setMurk(sim, i, nm);
          }
        }
      }
      if (changed) sim.terrainChanged();
    }
    if (st.industry.murk > 0) spreadMurk(sim);
    if (murkPass) murkEnd(sim);
    const treeMap = treeDead || new Map();
    soil(sim, treeMap);
    // Städte: Kennzahl, Mods, Chronik
    for (const city of st.cities) {
      const k = sim._kingdoms.get(city.kingdomId);
      const p = any ? cityPollution(st, city, d) : 0;
      city.pollution = p;
      const murky = st.industry.murk > 0 && murkNear(st, city);
      const bf = st.industry.barren > 0 ? barrenFields(sim, city) : 0;
      if (WW.Mods && (p !== (city.indModP | 0) || murky !== !!city.indMurky || bf !== (city.indBarren | 0))) {
        if (p >= 8 || murky || bf) {
          const food = Math.max(0.5, 1 - (p >= 8 ? p * 0.005 : 0)) * (murky ? 0.9 : 1) * (1 - bf / 200);
          WW.Mods.add(city, { key: 'food', mul: food, source: 'industry_pol', name: 'Verschmutzung' });
          if (p >= 8) WW.Mods.add(city, { key: 'happiness', add: -Math.round(p * 0.3), source: 'industry_pol', name: 'Verschmutzung' });
          else WW.Mods.add(city, { key: 'happiness', add: 0, source: 'industry_pol' });
        } else WW.Mods.remove(city, 'industry_pol');
        city.indModP = p; city.indBarren = bf;
      }
      city.indMurky = murky;
      if (!k) continue;
      const eff = 'Zufriedenheit −' + Math.round(p * 0.3) + ', Ernte ' + pct(Math.max(0.5, 1 - p * 0.005));
      if (p >= 40 && !city.indHaze) { city.indHaze = st.year || 1; chron(sim, 'indHaze', { city: city.name }, city, k, eff); }
      else if (p < 12 && city.indHaze) { city.indHaze = 0; chron(sim, 'indClean', { city: city.name }, city, k, 'Luft wieder sauber'); }
      const dead = treeMap.get(city.id) | 0;
      if (dead) {
        city.indTreesN = (city.indTreesN | 0) + dead;
        if (city.indTreesN >= 8 && st.year - (city.indTreesY == null ? -99 : city.indTreesY) >= 6) {
          city.indTreesY = st.year; city.indTreesN = 0;
          chron(sim, 'indTrees', { city: city.name }, city, k, 'Wald stirbt ab, weniger Holz');
        }
      }
      if (murky && st.year - (city.indMurkY == null ? -99 : city.indMurkY) >= 8) {
        city.indMurkY = st.year; chron(sim, 'indMurk', { city: city.name }, city, k, 'Fluss trüb: Fischfang −10 %');
      }
      if (bf >= 30 && st.year - (city.indBarrenY == null ? -99 : city.indBarrenY) >= 10) {
        city.indBarrenY = st.year; chron(sim, 'indBarren', { city: city.name, n: bf }, city, k, 'Ausgelaugter Boden: ' + bf + ' % der Felder tragen die Hälfte');
      }
      // Säureregen
      if (p >= 60 && st.year - (city.indAcidY == null ? -99 : city.indAcidY) >= 2 && WW.Powers && WW.POWERS && WW.POWERS.acidrain) {
        const C4 = d.cell, ccx = Math.floor(city.cx / C4), ccy = Math.floor(city.cy / C4);
        let bi = -1, bv = 0;
        for (let y = Math.max(0, ccy - 2); y <= Math.min(d.ph - 1, ccy + 2); y++) for (let x = Math.max(0, ccx - 2); x <= Math.min(pw - 1, ccx + 2); x++) {
          const v = pol[y * pw + x]; if (v > bv) { bv = v; bi = y * pw + x; }
        }
        if (bi >= 0 && bv >= C.TH_ACID && hh(s0 ^ city.id, tk) < 0.35) {
          city.indAcidY = st.year;
          WW.Powers.strike(sim, (bi % pw) * C4 + C4 / 2, Math.floor(bi / pw) * C4 + C4 / 2, 'acidrain', true);
          chron(sim, 'indAcid', { city: city.name }, city, k, 'Säureregen: Verletzte, kranke Felder');
        }
      }
    }
    // Kranke, Tiere
    if (any) {
      let sickN = null;
      for (const u of st.units) {
        if (u.dead || u.sick) continue;
        const v = at(st, u.x, u.y);
        if (v < C.TH_SICK) continue;
        if (hh(s0 ^ u.id, tk) < (v - C.TH_SICK + 10) / 900) {
          u.sick = true;
          if (u.cityId >= 0) { sickN = sickN || new Map(); sickN.set(u.cityId, (sickN.get(u.cityId) || 0) + 1); }
        }
      }
      if (sickN) for (const [cid, n] of sickN) {
        const c = sim._cities.get(cid);
        if (!c || n < 2) continue;
        if (st.year - (c.indSickY == null ? -99 : c.indSickY) >= 5 && c.pop > 0 && (c.sick + n) / c.pop >= 0.2) {
          c.indSickY = st.year; chron(sim, 'indSick', { city: c.name }, c, sim._kingdoms.get(c.kingdomId), 'Viele Kranke: Arbeit langsamer, Zufriedenheit sinkt');
        }
      }
      for (const a of st.animals) {
        if (a.dead || a.byPlayer) continue;
        const cr = WW.CREATURES[a.kind];
        if (!cr || cr.category !== 'animal') continue;
        const v = at(st, a.x, a.y);
        if (v < C.TH_ANIMALS) continue;
        if (hh(s0 ^ a.id, tk ^ 0x5a5a) < 0.12) { a.dead = true; a.moving = false; sim._animalsDirty = true; }
      }
    }
    // Fische in trübem Wasser
    if (st.industry.murk > 0) {
      for (const a of st.animals) {
        if (a.dead || a.kind !== 'fish' || a.byPlayer) continue;
        const i = Math.floor(a.y) * W + Math.floor(a.x);
        if (st.murk[i] > 90 && hh(s0 ^ a.id, tk ^ 0x7e7e) < 0.25) { a.dead = true; a.moving = false; sim._animalsDirty = true; }
      }
    }
  }

  // Kachel-Meldungen nur bei sichtbarer Änderung (der Renderer zeichnet murk in 8er-Stufen, barren in den Stufen
  // 0 / >0 / >85 / >170, soot nur an/aus). barren mit kleiner Hysterese (BARREN_HYST) an den Grenzen 85 und 170.
  // murk wird während eines Durchlaufs mehrfach geschrieben (Zufluss, Ausbreitung, Abklingen): gemeldet wird erst am
  // Ende des Durchlaufs gegen den Stand davor (murkBegin/murkEnd), sonst meldeten Zwischenwerte Kacheln ohne Änderung.
  function setMurk(sim, i, v) {
    const m = sim.state.murk;
    if (m[i] === v) return;
    if (!sim._murkPre) { const o = m[i]; m[i] = v; if ((o >> 3) !== (v >> 3) || !o !== !v) sim.markDirty(i); return; }
    m[i] = v;
  }
  function murkBegin(sim) {
    const m = sim.state.murk;
    let pre = sim._murkPreBuf;
    if (!pre || pre.length !== m.length) pre = sim._murkPreBuf = new Uint8Array(m.length);
    pre.set(m); sim._murkPre = pre;
  }
  function murkEnd(sim) {
    const pre = sim._murkPre, m = sim.state.murk;
    sim._murkPre = null;
    if (!pre) return;
    for (let i = 0; i < m.length; i++) {
      const o = pre[i], v = m[i];
      if (o !== v && ((o >> 3) !== (v >> 3) || !o !== !v)) sim.markDirty(i);
    }
  }
  function barrenVisible(o, v) {
    if (!o !== !v) return true;
    const h = CF().BARREN_HYST | 0;
    if (v > o) return (o <= 85 + h && v > 85 + h) || (o <= 170 + h && v > 170 + h);
    return (o > 85 - h && v <= 85 - h) || (o > 170 - h && v <= 170 - h);
  }
  // Trübung fließt stromabwärts (Nachbar-Wasser mit geringerer Höhe, sonst gleich hoch) bis ein Stück ins Meer
  // und klingt ab. Arbeitet auf einer Kopie: Ergebnis hängt nur vom Raster ab, nicht von der Reihenfolge.
  function spreadMurk(sim) {
    const st = sim.state, W = st.W, N = W * st.H, m = st.murk, T = WW.T, LUT = WW.TERRAIN_LUT, hgt = st.height, ter = st.terrain;
    let snap = sim._murkTmp;
    if (!snap || snap.length !== N) snap = sim._murkTmp = new Uint8Array(N);
    const down = [0, 0, 0, 0];
    // vier Teilschritte je Durchlauf: die Trübung wandert bis zu 4 Kacheln weit, abgeklungen wird einmal
    for (let sub = 0; sub < 4; sub++) {
    snap.set(m);
    for (let i = 0; i < N; i++) {
      const v = snap[i];
      if (!v) continue;
      const t = ter[i];
      if (!LUT.water[t]) { setMurk(sim, i, 0); continue; }
      const loss = t === T.RIVER ? 3 : 30, nv = v - loss;
      if (nv > 0) {
        const x = i % W, h = hgt[i];
        let nl = 0, ne = 0;
        const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i >= W ? i - W : -1, i + W < N ? i + W : -1];
        for (const j of nb) if (j >= 0 && LUT.water[ter[j]] && hgt[j] < h) down[nl++] = j;
        if (!nl) for (const j of nb) if (j >= 0 && LUT.water[ter[j]] && hgt[j] === h && snap[j] < nv) { down[ne++] = j; }
        const k = nl || ne;
        for (let q = 0; q < k; q++) { const j = down[q]; if (m[j] < nv) setMurk(sim, j, nv); }
      }
      if (sub === 0) setMurk(sim, i, Math.max(0, m[i] - 8));
    }
    }
    let n = 0;
    for (let i = 0; i < N; i++) if (m[i]) n++;
    st.industry.murk = n;
  }
  // Boden: Verschmutzung und Ruß laugen ihn aus (state.barren), saubere Luft lässt ihn langsam heilen.
  // Stufen: ab BARREN_DEADTREES sterben Bäume (Gelände deforested + cleared = tote Stämme), ab BARREN_ASH wird
  // Wiese/Steppe zu Aschefeld (dauerhaft). Rückgabe: Map Stadt-ID -> abgestorbene Bäume
  function setBarren(sim, i, v) {
    const b = sim.state.barren, o = b[i];
    if (o === v) return;
    b[i] = v;
    if (barrenVisible(o, v)) sim.markDirty(i);
  }
  function setSoot(sim, i, v) {
    const so = sim.state.soot, o = so[i];
    if (o === v) return;
    so[i] = v;
    if (!o !== !v) sim.markDirty(i);
  }
  function soil(sim, treeDead) {
    const st = sim.state, C = CF(), d = dims(st), W = st.W, H = st.H, pw = d.pw, pol = st.pollution, b = st.barren;
    const T = WW.T, LUT = WW.TERRAIN_LUT, ind = st.industry, cell = d.cell;
    if (ind.any > 0) {
      for (let cy = 0; cy < d.ph; cy++) for (let cx = 0; cx < pw; cx++) {
        const v = pol[cy * pw + cx];
        if (v < C.TH_BARREN) continue;
        const add = 1 + ((v - C.TH_BARREN) >> 4);
        for (let y = cy * cell; y < Math.min(H, cy * cell + cell); y++) for (let x = cx * cell; x < Math.min(W, cx * cell + cell); x++) {
          const i = y * W + x;
          if (LUT.water[st.terrain[i]]) continue;
          setBarren(sim, i, Math.min(255, b[i] + add));
        }
      }
      // Ruß im Umkreis aktiver Fabriken (laugt den Boden aus und liegt als schwarze Schicht: state.soot)
      const R = C.SOOT_R, so = st.soot;
      if (so && ind.soot > 0) for (let i = 0; i < W * H; i++) if (so[i]) setSoot(sim, i, Math.max(0, so[i] - C.SOOT_DECAY));
      for (const s of activeList(sim)) {
        if (s.dead || !s.active) continue;
        const mx = s.x + s.w / 2, my = s.y + s.h / 2, add = s.filtered ? 1 : C.SOOT;
        for (let y = Math.max(0, Math.floor(my - R)); y <= Math.min(H - 1, Math.floor(my + R)); y++) for (let x = Math.max(0, Math.floor(mx - R)); x <= Math.min(W - 1, Math.floor(mx + R)); x++) {
          const dx = x + 0.5 - mx, dy = y + 0.5 - my;
          if (dx * dx + dy * dy > R * R) continue;
          const i = y * W + x;
          if (LUT.water[st.terrain[i]]) continue;
          setBarren(sim, i, Math.min(255, b[i] + add));
          if (so) setSoot(sim, i, Math.min(C.SOOT_MAX, so[i] + C.SOOT_DECAY + add));
        }
      }
      if (so) { let ns = 0; for (let i = 0; i < W * H; i++) if (so[i]) ns++; ind.soot = ns; }
    } else if (st.soot && ind.soot > 0) {
      const so = st.soot; let ns = 0;
      for (let i = 0; i < W * H; i++) if (so[i]) { setSoot(sim, i, Math.max(0, so[i] - C.SOOT_DECAY)); if (so[i]) ns++; }
      ind.soot = ns;
    }
    if (!(ind.barren > 0) && !(ind.any > 0)) return false;   // (Ruß ohne Luftverschmutzung klingt oben ab)
    let n = 0, changed = false, ash = 0;
    const ASHABLE = {}; ASHABLE[T.GRASS] = 1; ASHABLE[T.FLOWERS] = 1; ASHABLE[T.SAVANNA] = 1; ASHABLE[T.TUNDRA] = 1;
    for (let i = 0; i < W * H; i++) {
      let bv = b[i];
      if (!bv) continue;
      const x = i % W, y = (i - x) / W, v = pol[Math.floor(y / cell) * pw + Math.floor(x / cell)];
      if (v < C.TH_BARREN_HEAL) { bv = Math.max(0, bv - C.BARREN_HEAL); setBarren(sim, i, bv); }
      if (bv) n++;
      if (bv < C.BARREN_DEADTREES || st.structAt[i] !== -1) continue;
      const t = st.terrain[i];
      if (LUT.wood[t]) {
        const nt = WW.Walls && WW.Walls.deforested ? WW.Walls.deforested(t) : T.GRASS;
        if (nt === t) continue;
        st.terrain[i] = nt; if (st.cleared) st.cleared[i] = WW.CONFIG.CLEARED_MAX || 240;
        sim.markDirty(i); changed = true;
        const o = st.owner[i]; if (o >= 0) treeDead.set(o, (treeDead.get(o) || 0) + 1);
      } else if (bv >= C.BARREN_ASH && ASHABLE[t]) {
        st.terrain[i] = T.ASH; sim.markDirty(i); changed = true; ash++;
      }
    }
    ind.barren = n;
    if (changed) sim.terrainChanged();
    return ash;
  }
  // Anteil (0..100) der Felder der Stadt auf ausgelaugtem Boden
  function barrenFields(sim, city) {
    const st = sim.state, C = CF();
    let n = 0, bad = 0;
    for (const id of city.fields || []) {
      const f = sim._structs.get(id);
      if (!f || f.dead) continue;
      n++;
      if (st.barren[f.y * st.W + f.x] >= C.BARREN_FIELD) bad++;
    }
    return n ? Math.round(bad * 100 / n) : 0;
  }
  function murkNear(st, city) {
    const W = st.W, H = st.H;
    for (let y = Math.max(0, city.cy - 10); y <= Math.min(H - 1, city.cy + 10); y += 1) for (let x = Math.max(0, city.cx - 10); x <= Math.min(W - 1, city.cx + 10); x += 1) {
      if (st.murk[y * W + x] > 40) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Reich: Kennzahl, Nachbarn (jährlich)
  // ---------------------------------------------------------------------------
  function kingdomStats(sim) {
    for (const k of sim.state.kingdoms) {
      let s = 0, w = 0;
      for (const id of k.cityIds) { const c = sim._cities.get(id); if (!c) continue; const wt = Math.max(1, c.pop); s += (c.pollution | 0) * wt; w += wt; }
      k.pollution = w ? Math.round(s / w) : 0;
    }
  }
  function neighbours(sim) {
    const st = sim.state, s0 = seedOf(sim);
    for (const a of st.kingdoms) {
      if ((a.pollution | 0) < 20) continue;
      const ca = sim._cities.get(a.capitalId);
      if (!ca) continue;
      let worst = null;
      for (const b of st.kingdoms) {
        if (b === a) continue;
        const cb = sim._cities.get(b.capitalId);
        const rb = b.relations && b.relations[a.id], ra = a.relations && a.relations[b.id];
        if (!cb || !rb) continue;
        const dx = cb.cx - ca.cx, dy = cb.cy - ca.cy;
        if (dx * dx + dy * dy > 64 * 64) continue;
        const pen = (a.pollution - 10) / 10 * (b.race === 'elf' ? 2.5 : 1);
        rb.opinion = Math.max(-100, rb.opinion - pen);
        if (ra) ra.opinion = Math.max(-100, ra.opinion - pen * 0.3);
        if (!worst || pen > worst.pen) worst = { b: b, pen: pen };
      }
      if (worst && st.year - (a.indComplY == null ? -99 : a.indComplY) >= 3 && hh(s0 ^ a.id, st.tick) < 0.6) {
        a.indComplY = st.year;
        chron(sim, 'indComplaint', { kingdom: a.name, other: worst.b.name }, null, a, 'Meinung von ' + worst.b.name + ' −' + Math.round(worst.pen) + ' je Jahr');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Takt
  // ---------------------------------------------------------------------------
  function tick(sim) {
    const st = sim.state, C = CF(), t = st.tick;
    if (!st.pollution || !st.wind || !st.industry) defaults(st);
    if (!hooked) hooked = hookPowers();
    if (t % C.PLAN_EVERY === 33) plan(sim);
    if (t % C.STEP === 7) step(sim);
    if (t % 120 === 61) windTurn(sim);
    const ind = st.industry;
    if (t % C.EFFECT_EVERY === 41 && (ind.any > 0 || ind.murk > 0 || ind.barren > 0 || ind.soot > 0 || ind.dc !== 0)) {
      effects(sim); kingdomStats(sim);
      ind.dc = ind.any > 0 || ind.murk > 0 || ind.barren > 0 || ind.soot > 0 ? 1 : 0;   // gespeichert: nach dem Laden gleich weiter
    }
    if (t % TPY() === 131) neighbours(sim);
    if (WW.Rail) WW.Rail.tick(sim);
    if (WW.Camps) WW.Camps.tick(sim);
    if (t % 30 === 11) {
      for (const s of activeList(sim)) {
        if (s.dead || !s.active) continue;
        sim.fx({ type: 'smokeplume', x: s.x + s.w - 0.5, y: s.y + 0.3, kind: s.kind, filtered: !!s.filtered, big: s.level >= 2 });
      }
    }
  }

  WW.Industry = {
    tick: tick, defaults: defaults, save: save, load: load, dims: dims, at: at, specFor: specFor, tryBuild: tryBuild,
    clean: clean, factories: factories, emission: emission, kindVars: kindVars, hookPowers: hookPowers, findSpot: findSpot,
    // Haken aus js/sim/units.js (markiert): Einheiten mit u.ind ('train' | 'camp' | 'escort') bewegen Bahn bzw. Lager selbst
    unit: function (sim, u) {
      if (u.ind === 'train') return WW.Rail ? WW.Rail.ride(sim, u) : (u.ind = null, false);
      if (u.ind === 'camp') return WW.Camps ? WW.Camps.unit(sim, u) : (u.ind = null, false);
      if (u.ind === 'escort') return WW.Camps && WW.Camps.escort ? WW.Camps.escort(sim, u) : (u.ind = null, false);
      return false;
    }
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
