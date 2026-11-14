// =============================================================================
// Wuselwelt – Lagerstädte und Kriegsgefangene. Teil des Bildes autoritärer Regime, bewusst KRITISCH dargestellt:
// Angst statt Ordnung, dauerhaft unzufriedene Städte, Verurteilung durch Nachbarn, Befreiung als Freudentag.
// DOM-frei, deterministisch: eigener Zufall nur über Hashes aus Seed/Tick/ID; sim.rng nur indirekt, wenn eine Stadt
// gegründet/abgespalten wird (WW.Cities.found, WW.Diplo.secede). Daten: WW.CAMPS in js/core/config-industry.js,
// Texte: js/data/texts-industry.js. Takt aus js/sim/industry.js (WW.Camps.tick).
//
// LEITPLANKEN (fest im Code, Test prüft sie): Insassen sind ausschließlich KRIEGSGEFANGENE (gegnerische Soldaten) und
//   POLITISCHE GEFANGENE (besiegte Rebellen, abgeholte Unzufriedene). Die Auswahl fragt NIE nach Volk, Kultur oder
//   Herkunft (diese Datei liest weder Volk noch Kultur einer Einheit/Stadt). Keine Tötungen: Insassen sind nie
//   Angriffsziel (units.js hostile) und sterben nur wie alle (Alter/Seuche); Arbeit tötet nicht. Keine Bezüge zu realen
//   Lagern (keine Torsprüche, Streifen, Nummern, Öfen, Züge für Zivilisten). Gefangene marschieren zu Fuß.
// WELTGESETZ 'camps' (WW.LAW_INFO, Standard an): aus = keine Lagerstädte; bestehende lösen sich auf (Befreiung).
//   Kriegsgefangene gibt es auch ohne das Gesetz – sie sitzen dann wie bei allen anderen im Gefangenenlager (stockade).
//
// -----------------------------------------------------------------------------
// SCHNITTSTELLE FÜR GRAFIK UND DARSTELLUNG (verbindlich)
// -----------------------------------------------------------------------------
// STADT
//   city.kind        'town' (normale Stadt; fehlt bei ganz alten Ständen = 'town', wird nachgerüstet) | 'camp' (Lagerstadt)
//   Lagerstadt (kind 'camp'): gehört dem Regime (kingdomId), steht abseits der Hauptstadt (≥ CAMPS.MIN_CAP_DIST), bevorzugt
//   bei Wald/Fels/Rohstoff/Gleis. Kein Zentrum (centerId -1, centerOk false), keine Häuser/Felder/Familien, kein
//   natürliches Wachstum, keine Wahl/Abspaltung. cx, cy = rechte untere Kachel der Kommandantur (die 3×3-Fläche
//   cx-1..cx+1 × cy-1..cy+1 bleibt frei für das spätere Zentrum nach der Befreiung). Eigenes kleines Gebiet (Fluren).
//   Felder an der Lagerstadt (alle Laufzeit-gepflegt, gespeichert):
//     city.inmates    Anzahl Insassen (Kriegsgefangene + politische)       city.pows     davon Kriegsgefangene
//     city.guards     Anzahl Wachen (Soldaten des Regimes mit cityId = Lager)  city.guardsWant  Sollstärke (1 je 6, ≥ 2)
//     city.cap        Plätze (8 je fertiger Baracke)                        city.campHome Stadt-ID, die den Ertrag bekommt
//     city.powFrom    { [Reich-ID]: Anzahl } Herkunft der Kriegsgefangenen  city.campFounded Jahr der Gründung
//     city.campUnrest 0..100 Spannung im Lager (Wachen zu wenige, Lager voll) – über 100 droht der Aufstand
//     city.campOut    Ertrag seit Gründung { stone, wood, rail (gebaute Gleisstücke) } (Info-Fenster: „wofür das alles")
//   Normale Städte: city.campFree (Jahr der Befreiung, falls die Stadt früher Lagerstadt war), city.memorialId.
// BAUWERKE (WW.STRUCT_INFO in config-industry.js; style = Regierung wie überall)
//   laborcamp   2×2  Keimzelle: das Regime setzt sie als Baustelle (cityId = Mutterstadt); fertig -> wird zur
//                    Kommandantur der neuen Lagerstadt (type wechselt auf 'camphq', cityId = Lagerstadt).
//   camphq      2×2  Kommandantur (Mittelpunkt), Banner des Regimes. Sprite S.campBuildKey('camphq', gov).
//   barrack     2×2  Baracke, Felder inmates (Belegung), cap (8).          S.campBuildKey('barrack', gov)
//   watchtower  1×1  Wachturm (hoch, Scheinwerfer erlaubt), 2 je Lager an den Ecken innen.
//   Zaun        Mauerstücke type 'wall'/'gate' mit mat 'fence', level 1 (S.wallKey('fence', 1, mask), S.gateKey('fence', 1, orient)),
//               city.wall.style 'fence'. Ring über js/sim/walls.js (WW.Walls.planFence): genau EIN Tor, keine Türme, keine
//               Geräte, niedrige Haltbarkeit (WW.CAMPS.FENCE_HP), wird nie zu Stein ausgebaut. Gebaut von den Wachen.
//   stockade    2×2  Gefangenenlager für Kriegsgefangene am Stadtrand einer NORMALEN Stadt (alle Regierungen; Regime
//                    nur, bis ihre Lagerstadt steht). Felder inmates, cap (12). Keine Arbeit. cityId = Stadt.
//   memorial    1×1  Mahnmal (cityId -1: gehört niemandem, bleibt stehen), Felder campName (Name des Lagers), year.
//                    Sprite 's_memorial'. Alte Stände: Ruinen mit ruinOf 'laborcamp' bleiben ebenfalls Mahnmal.
//   Arbeitsstätten der Lagerstadt: 'quarry' bzw. 'lumber' im Zaun (cityId = Lager); Minen legt js/sim/growth.js
//   (WW.Resources) bei Vorkommen von selbst an; Gleisanschluss über js/sim/rail.js.
// EINHEITEN
//   role 'prisoner' (graue Kleidung, ohne Waffe; Kriegsgefangene in der abgetragenen Uniform ihres Reichs):
//     u.ind 'camp' (Bewegung macht diese Datei, nicht die KI), u.camp = ID des Haftorts (Lagerstadt-ID ODER stockade-ID),
//     u.pow = Heimatreich (Kriegsgefangener) | -1 (politischer Gefangener), u.powC = Heimatstadt | -1,
//     u.campState 'march' (wird hingeführt) | 'held' (im Lager) | 'home' (Heimweg nach Befreiung/Freilassung),
//     u.kingdomId = -1 und u.cityId = -1 (gehören keinem Reich, zählen nirgends mit, sind nie Ziel; Reich des Haftorts
//     über WW.Camps.holdOf), u.origK/u.origC (Herkunft),
//     u.work (ID der Arbeitsstätte | -1), u.tx/u.ty (Ziel), u.powUntil (Jahr der vertraglichen Freilassung | 0).
//     Heimweg ('home'): u.role bleibt 'prisoner' (ohne Waffe, Uniform nach u.pow); bei Ankunft wieder Soldat der Heimat.
//   Wachen: normale Soldaten des Regimes mit cityId = Lagerstadt.
// REICH
//   kingdom.powsHeld  Anzahl Kriegsgefangener, die dieses Reich hält     kingdom.powsLost  eigene Soldaten in fremder Haft
//   relations[id].grievance = 'liberation' (Kriegsgrund gegen Lager-Regime; js/sim/diplo.js wertet ihn aus)
// EREIGNISTYPEN (alle mit group 'politics' und effectText)
//   campBuilt (Keimzelle gesetzt), campFounded (Lagerstadt steht), campFence (Zaun fertig), campBarrack (neue Baracke),
//   campPickup, campIntern (Rebellen), campPow (Kriegsgefangene eingeliefert), campBreakout, campRiot (Teil entkommt),
//   campUprising (Insassen übernehmen: freie Stadt, eigenes Reich), campProtest, campLiberated (Befreiung, why:
//   'conquest'|'gov'|'law'|'uprising'|'fall'), campMemorial, powTaken (Kriegsgefangene, stockade), powReturn (Rückgabe
//   beim Frieden), powKept (Regime behält einen Teil), powExchange (Gefangenenaustausch), powHome (Heimkehr), powEscape.
// FX
//   campgate { x, y } (Tor öffnet sich für einen Zug Gefangener), freed { x, y } (Befreiung: Konfetti/Freude),
//   memorial { x, y } (Mahnmal enthüllt). Bewegung der Gefangenen ist normale Einheiten-Bewegung (moving, dir).
// FUNKTIONEN (WW.Camps)
//   tick(sim), defaults(st), unit(sim, u) (Haken über WW.Industry.unit), capture(sim, att, t, opts?) -> bool
//     (Haken in units.js hitUnit und für js/sim/military.js bei Aufgabe; opts.surrender = true: ohne Zufall/Unterzahl-
//     Prüfung), onPeace(sim, a, b) (Haken in diplo.js makePeace), cityUpdate(sim, city) (Haken in cities.js updateAll),
//   campsOf(sim, k) -> [Lagerstädte], stockadesOf(sim, k) -> [stockade], inmatesOf(sim, place) -> [Einheiten],
//   holdOf(sim, u) -> Lagerstadt | stockade | null, liberate(sim, camp, why), intern(sim, u, place) (place = Lagerstadt
//   oder stockade; alte Signatur mit laborcamp-Bauwerk geht weiter), found(sim, k, mother, force) -> Lagerstadt | null,
//   uprising(sim, camp), isRegime(sim, k).
// HAKEN IN FREMDEN DATEIEN (markiert // [industry]): cities.js found (kind 'town'), updateAll (kind 'camp' ->
//   WW.Camps.cityUpdate statt Wirtschaft/Berufe/Bauplanung), yearly (Lagerstadt überspringen); diplo.js makePeace
//   (WW.Camps.onPeace); units.js hostile/hitUnit/updateAll (wie bisher).
// =============================================================================
(function (WW) { 'use strict';

  const C = () => WW.CAMPS;
  const TPY = () => WW.CONFIG.TPY;
  function hh(a, b) {
    let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }
  const seed = (sim) => sim._seedHash | 0;
  const isCamp = (c) => !!(c && !c.dead && c.kind === 'camp');
  // Baracken-Plätze (linke obere Ecke relativ zu cx, cy); die 3×3-Fläche um cx, cy bleibt frei (Zentrum nach der Befreiung)
  const SLOTS = [[3, -1], [-4, -1], [-1, 3], [-1, -4], [3, 3], [-4, 3], [3, -4], [-4, -4]];

  // ---------------------------------------------------------------------------
  // Zustand, Hilfen
  // ---------------------------------------------------------------------------
  function defaults(st) {
    for (const c of st.cities || []) if (!c.kind) c.kind = 'town';
  }
  function chron(sim, type, vars, city, eff) {
    const ev = sim.event(type, vars, city ? WW.Cities.atCity(city) : undefined);
    if (ev) { ev.group = 'politics'; ev.effectText = eff || ''; }
    return ev;
  }
  function isRegime(sim, k) { return !!(k && !k.dead && C().GOVS[k.gov] && sim.state.laws.camps); }
  function campsOf(sim, k) { return sim.state.cities.filter((c) => isCamp(c) && c.kingdomId === k.id); }
  function townsOf(sim, k) {
    const out = [];
    for (const id of k.cityIds) { const c = sim._cities.get(id); if (c && !c.dead && c.kind !== 'camp') out.push(c); }
    return out;
  }
  function stockadesOf(sim, k) {
    const out = [];
    for (const s of sim.state.structs) {
      if (s.dead || s.type !== 'stockade') continue;
      const c = sim._cities.get(s.cityId);
      if (c && c.kingdomId === k.id) out.push(s);
    }
    return out;
  }
  function holdById(sim, id) {
    const c = sim._cities.get(id);
    if (isCamp(c)) return c;
    const s = sim._structs.get(id);
    if (s && !s.dead && (s.type === 'stockade' || s.type === 'laborcamp')) return s;
    return null;
  }
  function holdOf(sim, u) { return u && u.role === 'prisoner' ? holdById(sim, u.camp) : null; }
  function holdKingdom(sim, h) {
    if (!h) return null;
    if (h.kind === 'camp') return sim._kingdoms.get(h.kingdomId) || null;
    const c = sim._cities.get(h.cityId);
    return c ? sim._kingdoms.get(c.kingdomId) || null : null;
  }
  function inmatesOf(sim, h) { const id = h && h.id; return sim.state.units.filter((u) => !u.dead && u.role === 'prisoner' && u.camp === id && u.campState !== 'home'); }
  function capOf(h) { return h.kind === 'camp' ? (h.cap | 0) : (h.cap || C().CAP); }
  function atWarWith(k, o) { const r = k && k.relations && k.relations[o]; return !!(r && r.status === 'war'); }
  function fear(sim, k) {
    if (!WW.Mods || !k) return;
    for (const c of townsOf(sim, k)) WW.Mods.add(c, { key: 'happiness', add: C().FEAR, until: sim.state.tick + 2 * TPY(), source: 'campfear', name: 'Angst (Aufstände unterdrückt)' });
  }
  function centerXY(h) { return h.kind === 'camp' ? { x: h.cx + 0.5, y: h.cy + 0.5 } : { x: h.x + h.w / 2, y: h.y + h.h / 2 }; }
  function dist2(ax, ay, bx, by) { return (ax - bx) * (ax - bx) + (ay - by) * (ay - by); }
  function homeOf(sim, c) { return sim._cities.get(c.campHome) || null; }
  // Zahler für Bauten der Lagerstadt: die Mutterstadt (Kommunismus: Reichslager)
  function payer(sim, camp) {
    const h = homeOf(sim, camp);
    if (h && !h.dead && h.kingdomId === camp.kingdomId) return h;
    const k = sim._kingdoms.get(camp.kingdomId);
    const cap = k && sim._cities.get(k.capitalId);
    return cap && cap.kind !== 'camp' ? cap : camp;
  }

  // ---------------------------------------------------------------------------
  // Einliefern
  // ---------------------------------------------------------------------------
  // Einheit wird Gefangene(r) in place (Lagerstadt oder stockade). o.pow: Kriegsgefangener; o.march: läuft selbst hin
  function intern(sim, u, place, o) {
    o = o || {};
    if (!u || u.dead || !place) return false;
    if (place.type === 'laborcamp' || place.type === 'camphq') { const c = sim._cities.get(place.cityId); if (isCamp(c)) place = c; }
    const hk = holdKingdom(sim, place);
    const pow = o.pow != null ? !!o.pow : (u.role === 'soldier' && hk && u.kingdomId !== hk.id);
    const ok = u.kingdomId, oc = u.cityId;
    WW.Units.setRole(sim, u, 'prisoner');
    u.origK = ok; u.origC = oc;
    u.pow = pow ? ok : -1; u.powC = pow ? oc : -1; u.powUntil = 0;
    u.ind = 'camp'; u.camp = place.id; u.campState = o.march ? 'march' : 'held'; u.campT = 0; u.marchT = sim.state.tick;
    u.kingdomId = -1; u.cityId = -1;   // gehört keinem Reich (nie Ziel, zählt nirgends mit); Haftort-Reich über holdOf
    u.merc = false; u.work = -1; u.moving = false;
    u.hp = Math.max(4, Math.round(u.maxHp * 0.5));
    if (!o.march) { const p = centerXY(place); u.x = p.x; u.y = p.y; }
    if (place.kind === 'camp') { place.inmates = (place.inmates | 0) + 1; if (pow) place.pows = (place.pows | 0) + 1; }
    else place.inmates = (place.inmates | 0) + 1;
    if (place.kind === 'camp' && hk) fear(sim, hk);
    return true;
  }
  // Belegung inkl. Gefangener auf dem Weg
  function load(sim, h) {
    let n = 0;
    for (const u of sim.state.units) if (!u.dead && u.role === 'prisoner' && u.camp === h.id && u.campState !== 'home') n++;
    return n;
  }
  function campWithSpace(sim, k, x, y) {
    let best = null, bd = 1e18;
    for (const c of campsOf(sim, k)) {
      if (!(c.cap > 0) || load(sim, c) >= c.cap + 2) continue;   // +2: die nächste Baracke ist schon geplant
      const d = dist2(c.cx, c.cy, x, y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  function stockadeFor(sim, k, x, y) {
    let best = null, bd = 1e18;
    for (const s of stockadesOf(sim, k)) {
      if (load(sim, s) >= (s.cap || C().CAP)) continue;
      const d = dist2(s.x, s.y, x, y);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) return best;
    // neues Gefangenenlager am Rand der nächsten Stadt (höchstens zwei je Stadt)
    let city = null; bd = 1e18;
    for (const c of townsOf(sim, k)) {
      if (!c.centerOk) continue;
      const d = dist2(c.cx, c.cy, x, y);
      if (d < bd) { bd = d; city = c; }
    }
    if (!city || stockadesOf(sim, k).filter((s) => s.cityId === city.id).length >= 2) return null;
    const i = WW.Industry.findSpot(sim, city, 2, 2) >= 0 ? WW.Industry.findSpot(sim, city, 2, 2) : WW.Industry.findSpot(sim, city, 2, 2, { loose: true });
    if (i < 0) return null;
    const st = sim.state, W = st.W, sx = i % W, sy = Math.floor(i / W);
    clearRect(sim, sx, sy, 2, 2);
    const s = WW.Structs.create(sim, 'stockade', sx, sy, city.id, { style: k.gov });
    if (!s) return null;
    s.inmates = 0; s.cap = C().CAP;
    WW.Cities.refreshLists(sim, city);
    return s;
  }

  // Haken aus units.js hitUnit (und js/sim/military.js bei Aufgabe): true = nicht gefallen, sondern gefangen.
  // Auswahl nur nach dem, was die Einheit gerade tut (Soldat im Krieg, Rebell gegen das Regime) – nie nach Herkunft.
  function capture(sim, att, t, opts) {
    opts = opts || {};
    if (!t || t.dead || t.role === 'prisoner' || t.vehicle || (t.role !== 'soldier' && t.role !== 'rebel')) return false;
    const ak = att && sim._kingdoms.get(att.kingdomId);
    if (!ak || ak.dead) return false;
    const isRebel = t.role === 'rebel' && t.kingdomId === ak.id;
    const isPow = t.role === 'soldier' && t.kingdomId !== ak.id && atWarWith(ak, t.kingdomId);
    if (!isRebel && !isPow) return false;
    if (!opts.surrender) {
      if (hh(seed(sim) ^ t.id, sim.state.tick) >= C().CAPTURE) return false;
      // Unterzahl: ergibt sich nur, wer in der Nähe weniger Kämpfer hat als die Gegenseite
      let own = 0, foe = 0;
      WW.Units.forNear(sim, t.x, t.y, C().SURRENDER_R, false, (v) => {
        if (v === t || v.dead || (v.role !== 'soldier' && v.role !== 'rebel' && v.role !== 'leader')) return;
        if (v.kingdomId === t.kingdomId && v.role === t.role) own++;
        else if (v.kingdomId === ak.id && v.role !== 'rebel') foe++;
      });
      if (own >= foe) return false;
    }
    let place = isRegime(sim, ak) ? campWithSpace(sim, ak, t.x, t.y) : null;
    if (!place && isPow) place = stockadeFor(sim, ak, t.x, t.y);
    if (!place) return false;
    t.hp = 1;
    intern(sim, t, place, { pow: isPow, march: true });
    WW.Units.bubble(t, 'question', 40);
    const city = place.kind === 'camp' ? place : sim._cities.get(place.cityId);
    const key = isRebel ? 'campInternY' : (place.kind === 'camp' ? 'campPowY' : 'powTakenY');
    if (city && sim.state.year - (city[key] == null ? -99 : city[key]) >= 3) {
      city[key] = sim.state.year;
      const other = sim._kingdoms.get(t.origK);
      if (isRebel) chron(sim, 'campIntern', { city: city.name, kingdom: ak.name }, city, 'Gefangene statt Gefallene; die Angst wächst, die Zustimmung nicht');
      else if (place.kind === 'camp') chron(sim, 'campPow', { city: city.name, kingdom: ak.name, other: other ? other.name : '' }, city, 'Zwangsarbeit im Lager; ' + (other ? other.name : 'die Heimat') + ' vergisst das nicht');
      else chron(sim, 'powTaken', { city: city.name, kingdom: ak.name, other: other ? other.name : '' }, city, 'Kriegsgefangene im Gefangenenlager; beim Frieden gehen sie heim');
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Bewegung der Gefangenen (Haken über WW.Industry.unit)
  // ---------------------------------------------------------------------------
  function unit(sim, u) {
    if (u.role !== 'prisoner') { u.ind = null; return false; }
    if (u.kingdomId !== -1) u.kingdomId = -1;   // alte Stände: Insassen trugen das Reich des Regimes
    if (u.hp < u.maxHp && ((sim.state.tick + u.id) & 63) === 0) u.hp++;   // Gefangene werden versorgt und erholen sich
    if (u.campState === 'home') { goHome(sim, u); return true; }
    const h = holdOf(sim, u);
    if (!h) { release(sim, u, null); return false; }
    if (h.type === 'laborcamp') { u.moving = false; return true; }   // alter Stand: Keimzelle wird gleich zur Lagerstadt
    if (u.campState === 'march') { marchTo(sim, u, h); return true; }
    held(sim, u, h);
    return true;
  }
  function targetTile(sim, u, h) {
    const W = sim.state.W;
    if (h.kind === 'camp') return WW.Cities.centerTile(sim, h, u.id);
    return (h.y + ((u.id >> 1) & 1)) * W + h.x + (u.id & 1);
  }
  // Marsch zu Fuß (Haftort oder Heimat), bewacht: Tore werden für den Zug geöffnet (auch fremde), Mauern nicht.
  // Eigene Wegsuche (A* mit Durchbruch-Kosten, damit Wege durch Tore führen) und eigener Schritt (kein Rettungs-Sprung).
  // true = angekommen
  function walk(sim, u, goal, gx, gy) {
    const st = sim.state, W = st.W;
    if (dist2(u.x, u.y, gx, gy) < 2.2) { u.path = null; u.moving = false; return true; }
    if (st.tick - (u.marchT || st.tick) > C().MARCH_MAX) { u.x = gx; u.y = gy; u.path = null; u.moving = false; return true; }   // Notausgang
    const cur = Math.floor(u.y) * W + Math.floor(u.x);
    if (!u.path && ((st.tick + u.id) & 15) === 0) {
      const p = WW.Path.find(sim, cur, goal, { k: u.kingdomId, breach: true, limit: WW.CONFIG.PATH_LIMIT_LONG || 4000 });
      if (p === null) {
        u.fails = (u.fails | 0) + 1;
        // anderes Ufer (kein Landweg): werden übergesetzt
        if (u.fails >= 3 && sim.comp && sim.comp[cur] !== sim.comp[goal]) { u.x = gx; u.y = gy; u.path = null; u.moving = false; return true; }
      }
      else if (p) { u.path = p; u.pi = 0; u.goal = goal; }
    }
    const LUT = WW.TERRAIN_LUT, blk = sim.block;
    const ok = (i) => i >= 0 && i < W * st.H && LUT.walk[st.terrain[i]] > 0 && blk[i] !== 1;
    let tx = gx, ty = gy;
    if (u.path) {
      if (u.pi >= u.path.length) { u.path = null; u.moving = false; return false; }
      const n = u.path[u.pi], nx = n % W, ny = (n - nx) / W, cx = cur % W, cy = (cur - cx) / W;
      if (!ok(n) || (nx !== cx && ny !== cy && (!ok(cy * W + nx) || !ok(ny * W + cx)))) { u.path = null; u.fails = (u.fails | 0) + 1; u.moving = false; return false; }
      tx = nx + 0.5; ty = ny + 0.5;
    } else if ((u.fails | 0) < 3) { u.moving = false; return false; }
    const dx = tx - u.x, dy = ty - u.y, d = Math.sqrt(dx * dx + dy * dy), sp = 0.07;
    if (Math.abs(dx) > 0.02) u.dir = dx < 0 ? -1 : 1;
    u.moving = true;
    if (u.path && d <= sp) { u.x = tx; u.y = ty; u.pi++; return false; }
    const nx = u.x + dx / d * sp, ny = u.y + dy / d * sp, i = Math.floor(ny) * W + Math.floor(nx);
    if (u.path || ok(i)) { u.x = nx; u.y = ny; } else u.moving = false;
    return false;
  }
  function marchTo(sim, u, h) {
    const W = sim.state.W, t = targetTile(sim, u, h);
    if (walk(sim, u, t, (t % W) + 0.5, Math.floor(t / W) + 0.5)) {
      u.campState = 'held'; u.fails = 0; u.campT = 0;
      if (h.kind === 'camp') sim.fx({ type: 'campgate', x: u.x, y: u.y });
    }
  }
  // Im Haftort: Lagerstadt = Zwangsarbeit im Zaun; Gefangenenlager = warten
  function held(sim, u, h) {
    const st = sim.state, W = st.W;
    if (!u.campT || u.campT <= st.tick) {
      u.campT = st.tick + 150 + (u.id % 40);
      u.work = -1;
      const p = centerXY(h);
      let tx = p.x, ty = p.y;
      if (h.kind === 'camp') {
        // Arbeitsplatz: Gleisbaustelle in Reichweite, sonst Arbeitsstätte/Baustelle im Lager, sonst irgendwo im Zaun
        let best = null, bd = C().WORK_R * C().WORK_R;
        const home = homeOf(sim, h);
        for (const c of [h, home]) for (const id of (c && c.sites) || []) {
          const r = sim._structs.get(id);
          if (!r || r.type !== 'rail' || r.built) continue;
          const d = dist2(r.x, r.y, h.cx, h.cy);
          if (d < bd) { bd = d; best = r; }
        }
        if (best) { tx = best.x + 0.5; ty = best.y + 0.5; u.work = best.id; }
        else {
          for (let n = 0; n < 6; n++) {
            const a = hh(u.id + n, st.tick) * 6.283, rr = 1 + hh(u.id ^ 77, st.tick + n) * 5;
            const x = Math.floor(h.cx + 0.5 + Math.cos(a) * rr), y = Math.floor(h.cy + 0.5 + Math.sin(a) * rr);
            if (x < 0 || y < 0 || x >= W || y >= st.H) continue;
            const i = y * W + x;
            if (h.wall && h.wall.plan && st.inRing[i] !== h.id) continue;
            if (WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0 || sim.block[i]) continue;
            tx = x + 0.5; ty = y + 0.5; break;
          }
        }
      } else {
        const a = hh(u.id, st.tick) * 6.283;
        tx = p.x + Math.cos(a) * 0.9; ty = p.y + Math.sin(a) * 0.9;
      }
      u.tx = tx; u.ty = ty;
    }
    const dx = u.tx - u.x, dy = u.ty - u.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.3) {
      // Schienen-Baustellen liegen auch außerhalb des Zauns: dorthin geht es bewacht durchs Tor (eigener Weg)
      if (u.work >= 0) { walk(sim, u, Math.floor(u.ty) * W + Math.floor(u.tx), u.tx, u.ty); return; }
      const sp = 0.05, nx = u.x + dx / d * sp, ny = u.y + dy / d * sp;
      const i = Math.floor(ny) * W + Math.floor(nx);
      if (nx >= 0 && ny >= 0 && nx < W && ny < st.H && WW.TERRAIN_LUT.walk[st.terrain[i]] > 0 && !sim.block[i]) { u.x = nx; u.y = ny; u.dir = dx < 0 ? -1 : 1; }
      u.moving = true;
    } else {
      u.moving = false; u.path = null;
      if (h.kind === 'camp' && (u.workT = (u.workT | 0) + 1) >= 60) { u.workT = 0; labor(sim, u, h); }
    }
  }
  // Zwangsarbeit: Gleisbau, sonst Stein/Holz für das Regime (Arbeit tötet nicht und macht nicht krank)
  function labor(sim, u, camp) {
    const r = u.work >= 0 ? sim._structs.get(u.work) : null;
    if (r && !r.dead && r.type === 'rail' && !r.built) {
      r.paid = true;
      r.progress = Math.min(1, (r.progress || 0) + C().RAIL_WORK);
      if (r.progress >= 1) WW.Structs.complete(sim, r);
      const o = camp.campOut || (camp.campOut = { stone: 0, wood: 0 });
      o.rail = Math.round(((o.rail || 0) + C().RAIL_WORK) * 100) / 100;   // Gleisbau (Anteile eines Gleisstücks)
      return;
    }
    const res = camp.campRes || (hh(u.id, sim.state.tick) < 0.5 ? 'stone' : 'wood');
    WW.Cities.addStock(sim, camp, res, C().YIELD);
    const o = camp.campOut || (camp.campOut = { stone: 0, wood: 0 });
    o[res] = Math.round(((o[res] || 0) + C().YIELD) * 10) / 10;
  }
  // Heimweg nach Befreiung/Freilassung: zu Fuß zur Heimatstadt
  function goHome(sim, u) {
    let c = sim._cities.get(u.powC);
    const k = sim._kingdoms.get(u.pow);
    if (!c || c.dead || c.kind === 'camp' || c.kingdomId !== u.pow) {
      c = null;
      if (k && !k.dead) { let bd = 1e18; for (const t of townsOf(sim, k)) { const d = dist2(t.cx, t.cy, u.x, u.y); if (d < bd) { bd = d; c = t; } } }
      if (!c) { settle(sim, u, null); return; }
      u.powC = c.id;
    }
    if (!walk(sim, u, WW.Cities.centerTile(sim, c, u.id), c.cx + 0.5, c.cy + 0.5)) return;
    // daheim: wieder Soldat der Heimat, die Stadt freut sich
    u.ind = null; u.campState = null; u.camp = 0; u.work = -1;
    u.kingdomId = c.kingdomId; u.cityId = c.id; u.pow = -1; u.powC = -1;
    WW.Units.setRole(sim, u, 'soldier');
    WW.Units.bubble(u, 'heart', 60);
    if (WW.Mods) WW.Mods.add(c, { key: 'happiness', add: C().HOME_JOY, until: sim.state.tick + 3 * TPY(), source: 'powhome', name: 'Heimkehr der Kriegsgefangenen' });
    c.powHomeN = (c.powHomeN | 0) + 1;
  }
  // wird freier Bürger der nächsten Stadt (Heimat verloren) bzw. von city
  function settle(sim, u, city) {
    let c = city;
    if (!c) {
      let bd = 1e18;
      for (const t of sim.state.cities) { if (t.dead || t.kind === 'camp') continue; const d = dist2(t.cx, t.cy, u.x, u.y); if (d < bd) { bd = d; c = t; } }
    }
    u.ind = null; u.campState = null; u.camp = 0; u.work = -1; u.pow = -1; u.powC = -1; u.powUntil = 0;
    u.cityId = c ? c.id : -1; u.kingdomId = c ? c.kingdomId : -1;
    WW.Units.setRole(sim, u, 'farmer');
  }
  // Freilassung: Kriegsgefangene gehen heim, politische werden Bürger von city (bzw. ihrer Herkunft)
  function release(sim, u, city, rebel) {
    u.path = null; u.moving = false; u.fails = 0; u.marchT = sim.state.tick;
    const k = sim._kingdoms.get(u.pow);
    if (u.pow >= 0 && k && !k.dead && (!city || city.kingdomId !== u.pow)) {
      u.campState = 'home'; u.kingdomId = -1; u.work = -1;
      WW.Units.bubble(u, 'heart', 50);
      return 'home';
    }
    if (rebel) {
      const c = sim._cities.get(u.origC);
      settle(sim, u, c && !c.dead && c.kind !== 'camp' ? c : city);
      WW.Units.setRole(sim, u, 'rebel');
      return 'rebel';
    }
    settle(sim, u, city || (sim._cities.get(u.origC) && !sim._cities.get(u.origC).dead ? sim._cities.get(u.origC) : null));
    return 'free';
  }

  // ---------------------------------------------------------------------------
  // Gründung und Aufbau der Lagerstadt
  // ---------------------------------------------------------------------------
  function clearRect(sim, x, y, w, h) {
    const st = sim.state, W = st.W;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const o = sim._structs.get(st.structAt[(y + dy) * W + x + dx]);
      if (o && (o.type === 'ruin' || o.type === 'field')) WW.Structs.remove(sim, o);
    }
  }
  // Rechteck frei und bebaubar? (Felder/Ruinen zählen als frei)
  function rectFree(sim, x, y, w, h, campId) {
    const st = sim.state, W = st.W, LUT = WW.TERRAIN_LUT;
    if (x < 1 || y < 1 || x + w >= W || y + h >= st.H) return false;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const i = (y + dy) * W + x + dx;
      if (!LUT.build[st.terrain[i]] || LUT.water[st.terrain[i]]) return false;
      if (st.inRing[i] !== -1 && st.inRing[i] !== campId) return false;
      if (campId >= 0 && st.owner[i] !== -1 && st.owner[i] !== campId) return false;
      const o = sim._structs.get(st.structAt[i]);
      if (o && o.type !== 'ruin' && o.type !== 'field') return false;
    }
    return true;
  }
  // Lage für eine Lagerstadt: abseits der Hauptstadt, bevorzugt bei Wald, Fels, Rohstoff, Gleis
  function findSite(sim, k, mother) {
    const st = sim.state, W = st.W, H = st.H, LUT = WW.TERRAIN_LUT, cfg = C();
    const cap = sim._cities.get(k.capitalId);
    let best = null, bs = -1e9;
    for (let r = cfg.SITE_MIN; r <= cfg.SITE_MAX; r += 3) for (let d = 0; d < 16; d++) {
      const D = WW.Cities.DIRS16[d];
      const x = Math.round(mother.cx + D[0] * r), y = Math.round(mother.cy + D[1] * r);
      if (x < 9 || y < 9 || x >= W - 9 || y >= H - 9) continue;
      if (cap && dist2(cap.cx, cap.cy, x, y) < cfg.MIN_CAP_DIST * cfg.MIN_CAP_DIST) continue;
      if (!WW.Cities.canFoundAt(sim, x, y, undefined, cfg.CITY_DIST, k.id)) continue;
      let walk = 0, wood = 0, stone = 0, dep = 0, rail = 0, foreign = 0;
      for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
        const i = (y + dy) * W + x + dx, t = st.terrain[i];
        if (LUT.walk[t] > 0 && !LUT.water[t]) walk++;
        if (LUT.wood[t]) wood++;
        if (LUT.stone[t]) stone++;
        if (st.deposit && st.deposit[i]) dep++;
        const o = st.owner[i];
        if (o !== -1) { const oc = sim._cities.get(o); if (!oc || oc.kingdomId !== k.id) foreign++; }
        if (st.inRing[i] !== -1) foreign += 3;
        const s = sim._structs.get(st.structAt[i]);
        if (s && s.type === 'rail') rail++;
        else if (s && s.cityId >= 0 && s.type !== 'field' && s.type !== 'ruin') foreign++;
      }
      if (walk < 170 || foreign > 0) continue;
      // Kommandantur + Baracken-Plätze bebaubar?
      if (!rectFree(sim, x - 1, y - 1, 3, 3, -1)) continue;
      let slots = 0;
      for (const sl of SLOTS) if (rectFree(sim, x + sl[0], y + sl[1], 2, 2, -1)) slots++;
      if (slots < 4) continue;
      const score = Math.min(25, wood) * 0.4 + Math.min(25, stone) * 0.6 + Math.min(6, dep) * 3 + Math.min(4, rail) * 6 + slots * 2
        - Math.abs(r - 20) * 0.4 - foreign * 4 + hh(seed(sim) ^ k.id, x * 977 + y) * 2;
      if (score > bs) { bs = score; best = { x: x, y: y }; }
    }
    return best;
  }
  // Mutterstädte in Reihenfolge der Eignung (lieber nicht die Hauptstadt, lieber groß)
  function mothersOf(sim, k) {
    return townsOf(sim, k).filter((c) => c.centerOk)
      .sort((a, b) => ((b.pop | 0) - (b.id === k.capitalId ? 1000 : 0)) - ((a.pop | 0) - (a.id === k.capitalId ? 1000 : 0)) || a.id - b.id);
  }
  // Keimzelle setzen (Baustelle laborcamp). force: ohne Anlass (Tests, Sandbox)
  function found(sim, k, mother, force) {
    const st = sim.state;
    if (!isRegime(sim, k)) return null;
    let site = null;
    for (const m of mother ? [mother] : mothersOf(sim, k)) { site = findSite(sim, k, m); if (site) { mother = m; break; } }
    if (!site) return null;
    clearRect(sim, site.x - 1, site.y - 1, 3, 3);
    const s = WW.Structs.create(sim, 'laborcamp', site.x - 1, site.y - 1, mother.id, { style: k.gov });
    if (!s) return null;
    s.campK = k.id; s.seed = 1;
    mother.sites.push(s.id);
    chron(sim, 'campBuilt', { city: mother.name, kingdom: k.name }, mother, 'Hier soll eine Lagerstadt entstehen; Zufriedenheit −' + C().UNHAPPY_MOD + ', Loyalität −' + C().LOYALTY_MOD + ' solange sie steht');
    void force;
    return s;
  }
  // Keimzelle fertig -> Lagerstadt mit Kommandantur
  function grow(sim, seedS) {
    const st = sim.state;
    const mother = sim._cities.get(seedS.cityId);
    const k = mother && sim._kingdoms.get(mother.kingdomId);
    if (!k) return null;
    const x = seedS.x + 1, y = seedS.y + 1;
    const legacy = inmatesOf(sim, seedS);
    WW.Structs.remove(sim, seedS);
    const camp = WW.Cities.found(sim, x, y, k.id);
    if (!camp) {
      // kein Platz (alter Spielstand dicht an der Stadt): das alte Lager löst sich auf, Mahnmal bleibt
      for (const u of legacy) release(sim, u, mother);
      memorial(sim, x - 1, y - 1, mother ? mother.name : '', mother);
      return null;
    }
    // Zentrum der Stadtgründung weicht der Kommandantur
    const ctr = sim._structs.get(camp.centerId);
    if (ctr) WW.Structs.remove(sim, ctr);
    camp.kind = 'camp'; camp.centerId = -1; camp.centerOk = false;
    camp.campHome = mother.id; camp.campFounded = st.year;
    camp.inmates = 0; camp.pows = 0; camp.guards = 0; camp.guardsWant = C().GUARD_MIN; camp.cap = 0; camp.powFrom = {};
    camp.campUnrest = 0; camp.campOut = { stone: 0, wood: 0 };
    camp.happiness = 50; camp.loyalty = 100;
    if (k.capitalId === camp.id) { const t = townsOf(sim, k)[0]; if (t) k.capitalId = t.id; }
    const hq = WW.Structs.create(sim, 'camphq', x - 1, y - 1, camp.id, { style: k.gov, built: true });
    claimArea(sim, camp, k);
    for (let n = 0, placed = 0; n < SLOTS.length && placed < C().BARRACKS_START; n++) {
      const sl = SLOTS[n];
      if (!rectFree(sim, x + sl[0], y + sl[1], 2, 2, camp.id)) continue;
      clearRect(sim, x + sl[0], y + sl[1], 2, 2);
      const b = WW.Structs.create(sim, 'barrack', x + sl[0], y + sl[1], camp.id, { style: k.gov });
      if (b) { b.inmates = 0; b.cap = C().BARRACK_CAP; placed++; }
    }
    if (WW.Mods) WW.Mods.add(camp, { key: 'loyalty', add: 200, source: 'campguard', name: 'Bewacht' });
    for (const u of legacy) { u.camp = camp.id; u.campState = 'held'; }
    WW.Cities.refreshLists(sim, camp);
    chron(sim, 'campFounded', { city: camp.name, kingdom: k.name, other: mother.name }, camp, 'Lagerstadt mit Kommandantur, Baracken und Zaun; Ertrag geht an ' + mother.name);
    void hq;
    return camp;
  }

  // Eigenes kleines Gebiet: Fluren um die Kommandantur (frei oder von Schwesterstädten ohne deren Kerngebäude)
  function claimArea(sim, camp, k) {
    const st = sim.state, G = WW.Growth, F = G.FLUR, d = G.dims(st), W = st.W;
    G.ensure(sim);
    const R = C().RESERVE + C().MARGIN + 3;
    for (let fy = 0; fy < d.fh; fy++) for (let fx = 0; fx < d.fw; fx++) {
      const x0 = fx * F, y0 = fy * F;
      // Flur berührt den Kreis um das Lager?
      const nx = Math.max(x0, Math.min(camp.cx + 0.5, x0 + F)), ny = Math.max(y0, Math.min(camp.cy + 0.5, y0 + F));
      if (dist2(nx, ny, camp.cx + 0.5, camp.cy + 0.5) > R * R) continue;
      const fi = fy * d.fw + fx, o = st.flur[fi];
      if (o === camp.id) continue;
      if (o !== -1) {
        const oc = sim._cities.get(o);
        if (!oc || oc.kingdomId !== k.id) continue;
        let core = false;
        for (let y = y0; y < Math.min(st.H, y0 + F) && !core; y++) for (let x = x0; x < Math.min(W, x0 + F); x++) {
          const i = y * W + x;
          if (st.inRing[i] !== -1) { core = true; break; }
          const s = sim._structs.get(st.structAt[i]);
          if (s && s.cityId === oc.id && s.type !== 'field' && s.type !== 'rail') { core = true; break; }
        }
        if (core) continue;
        for (let y = y0; y < Math.min(st.H, y0 + F); y++) for (let x = x0; x < Math.min(W, x0 + F); x++) {
          const s = sim._structs.get(st.structAt[y * W + x]);
          if (s && s.type === 'field' && s.cityId === oc.id) WW.Structs.remove(sim, s);
        }
        G.setFlur(sim, fi, -1);
        oc.flurs = Math.max(0, (oc.flurs || 1) - 1);
      }
      G.setFlur(sim, fi, camp.id);
    }
    camp.flurs = G.countFlurs(sim, camp);
  }

  // Bauschritt: Wachen und Insassen bauen (kein Baumeister-Zug in die Lagerstadt)
  function buildStep(sim, camp) {
    const cfg = C(), st = sim.state;
    let crew = 2 + (camp.guards | 0) + Math.floor((camp.inmates | 0) / 2);
    for (const id of camp.sites || []) {
      if (crew <= 0) break;
      const s = sim._structs.get(id);
      if (!s || s.dead || !WW.Structs.needsWork(s) || s.cityId !== camp.id) continue;
      if (!s.paid) {
        const cost = WW.Structs.siteCost(sim, s, camp.id), p = payer(sim, camp);
        if (!WW.Cities.pay(sim, p, cost)) continue;
        s.paid = true;
      }
      const work = Math.max(1, WW.Structs.siteWork(s));
      s.progress = Math.min(1, (s.progress || 0) + cfg.BUILD_WORK / work);
      crew--;
      if (s.progress >= 1) {
        WW.Structs.complete(sim, s);
        if (WW.Structs.isWallish(s) && s.mat === 'fence') fenceHp(sim, s);
        if (s.type === 'barrack') { s.inmates = s.inmates | 0; s.cap = cfg.BARRACK_CAP; if (st.year - (camp.campBarrackY == null ? -99 : camp.campBarrackY) >= 2 && camp.cap > 0) { camp.campBarrackY = st.year; chron(sim, 'campBarrack', { city: camp.name }, camp, 'Mehr Plätze im Lager: ' + (camp.cap + cfg.BARRACK_CAP)); } }
      }
    }
  }
  function fenceHp(sim, s) {
    const hp = C().FENCE_HP;
    if (s.maxHp !== hp) { s.hp = Math.max(1, Math.round(s.built ? hp * (s.hp / Math.max(1, s.maxHp)) : 1)); if (s.built && s.hp > hp) s.hp = hp; s.maxHp = hp; }
    if (s.built && s.hp <= 0) s.hp = 1;
  }
  // Planung je Lagerstadt
  function campStep(sim, camp, k) {
    const st = sim.state, cfg = C(), W = st.W;
    const list = [];
    for (const s of st.structs) if (!s.dead && s.cityId === camp.id) list.push(s);
    let hq = null, barracks = 0, builtB = 0, towers = 0, work = null;
    for (const s of list) {
      if (s.type === 'camphq') hq = s;
      else if (s.type === 'barrack') { barracks++; if (s.built) builtB++; }
      else if (s.type === 'watchtower') towers++;
      else if (s.type === 'quarry' || s.type === 'lumber') work = s;
      else if (WW.Structs.isWallish(s) && s.mat === 'fence') fenceHp(sim, s);
    }
    camp.cap = builtB * cfg.BARRACK_CAP;
    if (!hq) { clearRect(sim, camp.cx - 1, camp.cy - 1, 2, 2); WW.Structs.create(sim, 'camphq', camp.cx - 1, camp.cy - 1, camp.id, { style: k.gov }); }
    // mehr Baracken, wenn es eng wird
    const want = Math.max(cfg.BARRACKS_START, Math.min(cfg.BARRACKS_MAX, Math.ceil((load(sim, camp) + 3) / cfg.BARRACK_CAP)));
    if (barracks < want) for (const sl of SLOTS) {
      const x = camp.cx + sl[0], y = camp.cy + sl[1];
      if (!rectFree(sim, x, y, 2, 2, camp.id)) continue;
      if (camp.wall.plan && (st.inRing[y * W + x] !== camp.id || st.inRing[(y + 1) * W + x + 1] !== camp.id)) continue;
      clearRect(sim, x, y, 2, 2);
      const b = WW.Structs.create(sim, 'barrack', x, y, camp.id, { style: k.gov });
      if (b) { b.inmates = 0; b.cap = cfg.BARRACK_CAP; }
      break;
    }
    // Zaun (ein Tor Richtung Mutterstadt), danach Wachtürme und eine Arbeitsstätte
    const home = homeOf(sim, camp);
    if (!camp.wall.plan || camp.wall.style !== 'fence') {
      if (WW.Walls.planFence(sim, camp, cfg.RESERVE, cfg.MARGIN, home ? { x: home.cx, y: home.cy } : null)) {
        // ein eigenes Gebäude auf der Zaunlinie würde eine Lücke lassen: es weicht (wird innen neu gebaut)
        for (const t of camp.wall.plan) {
          const o = sim._structs.get(st.structAt[t]);
          if (o && o.cityId === camp.id && !WW.Structs.isWallish(o) && o.type !== 'camphq') WW.Structs.remove(sim, o);
        }
      }
    } else {
      if (towers < 2) placeTower(sim, camp, k, towers);
      if (!work) placeWork(sim, camp, k);
    }
    if (camp.wall.style === 'fence' && WW.Walls.fenceUpdate(sim, camp)) chron(sim, 'campFence', { city: camp.name, kingdom: k.name }, camp, 'Ein Zaun, ein Tor, zwei Wachtürme');
    WW.Cities.refreshLists(sim, camp);
    // Wachen: Soll 1 je 6 Insassen; kommen aus der Mutterstadt (zur Not eingezogen)
    camp.guardsWant = Math.max(cfg.GUARD_MIN, Math.ceil((camp.inmates | 0) / cfg.GUARD_PER));
    if ((camp.guards | 0) < camp.guardsWant) recruitGuard(sim, camp, k);
    // Ertrag geht in die Mutterstadt (Träger; mit Gleisanschluss gleicht zusätzlich der Zug aus)
    const p = payer(sim, camp);
    if (p !== camp) {
      const a = WW.Cities.stock(sim, camp), b = WW.Cities.stock(sim, p);
      if (a !== b) for (const r of ['wood', 'stone', 'iron', 'coal', 'gold', 'crystal']) {
        const v = a[r] || 0;
        if (v > 0.5) { a[r] = 0; WW.Cities.addStock(sim, p, r, v); }
      }
    }
    // Folgen über Mods: Mutterstadt voll, die übrigen Städte des Regimes halb
    if (WW.Mods) for (const c of townsOf(sim, k)) {
      const f = c.id === camp.campHome ? 1 : 0.5;
      setMod(c, 'happiness', -cfg.UNHAPPY_MOD * f, 'camp', 'Lagerstadt ' + camp.name);
      setMod(c, 'loyalty', -cfg.LOYALTY_MOD * f, 'camp', 'Lagerstadt ' + camp.name);
    }
    // Spannung: zu wenige Wachen, volles Lager
    const ratio = (camp.inmates | 0) / Math.max(1, (camp.guards | 0) * cfg.GUARD_PER);
    camp.campUnrest = Math.max(0, Math.min(150, Math.round((ratio - 0.5) * 100 + (camp.cap && camp.inmates >= camp.cap ? 15 : 0))));
  }
  function setMod(c, key, add, source, name) {
    const l = c.mods || [];
    for (const m of l) if (m.source === source && m.key === key && m.add === add && !m.until) return;
    WW.Mods.add(c, { key: key, add: add, source: source, name: name });
  }
  function placeTower(sim, camp, k, have) {
    const st = sim.state, W = st.W;
    const sx = have === 0 ? 1 : -1, sy = have === 0 ? -1 : 1;   // erst Nordost, dann Südwest
    let best = -1, bd = -1;
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
      if (dx * sx <= 0 || dy * sy <= 0) continue;
      const x = camp.cx + dx, y = camp.cy + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= st.H - 1) continue;
      const i = y * W + x;
      if (st.inRing[i] !== camp.id || !rectFree(sim, x, y, 1, 1, camp.id)) continue;
      const d = dx * dx + dy * dy;
      if (d > bd) { bd = d; best = i; }
    }
    if (best < 0) return;
    clearRect(sim, best % W, Math.floor(best / W), 1, 1);
    WW.Structs.create(sim, 'watchtower', best % W, Math.floor(best / W), camp.id, { style: k.gov });
  }
  function placeWork(sim, camp, k) {
    const st = sim.state, W = st.W, LUT = WW.TERRAIN_LUT;
    let wood = 0, stone = 0;
    for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
      const x = camp.cx + dx, y = camp.cy + dy;
      if (x < 0 || y < 0 || x >= W || y >= st.H) continue;
      const t = st.terrain[y * W + x];
      if (LUT.wood[t]) wood++; if (LUT.stone[t]) stone++;
    }
    const type = stone >= 6 || stone >= wood ? 'quarry' : 'lumber';
    camp.campRes = type === 'quarry' ? 'stone' : 'wood';
    for (let n = SLOTS.length - 1; n >= 0; n--) {
      const x = camp.cx + SLOTS[n][0], y = camp.cy + SLOTS[n][1];
      if (!rectFree(sim, x, y, 2, 2, camp.id) || st.inRing[y * W + x] !== camp.id || st.inRing[(y + 1) * W + x + 1] !== camp.id) continue;
      clearRect(sim, x, y, 2, 2);
      if (WW.Structs.create(sim, type, x, y, camp.id, { style: k.gov })) return;
    }
  }
  function recruitGuard(sim, camp, k) {
    const st = sim.state;
    const home = homeOf(sim, camp);
    const from = [home].concat(townsOf(sim, k).filter((c) => c !== home)).filter((c) => c && !c.dead && c.kingdomId === k.id);
    for (const c of from) {
      let pick = null;
      for (const u of st.units) {
        if (u.dead || u.cityId !== c.id || u.order || u.merc || u.ind) continue;
        if (u.role === 'soldier') { pick = u; break; }
      }
      if (!pick && c === from[0] && (c.adults | 0) >= 8) {
        for (const u of st.units) if (!u.dead && u.cityId === c.id && !u.order && !u.ind && (u.role === 'farmer' || u.role === 'lumberjack' || u.role === 'miner')) { pick = u; WW.Units.setRole(sim, u, 'soldier'); break; }
      }
      if (pick) { pick.cityId = camp.id; pick.order = { kind: 'home' }; pick.path = null; camp.guards = (camp.guards | 0) + 1; return pick; }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Befreiung, Aufstand, Mahnmal
  // ---------------------------------------------------------------------------
  function memorial(sim, x0, y0, campName, city) {
    const st = sim.state, W = st.W;
    for (let r = 0; r <= 3; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx, y = y0 + dy;
      if (!rectFree(sim, x, y, 1, 1, city ? city.id : -1)) continue;
      clearRect(sim, x, y, 1, 1);
      const m = WW.Structs.create(sim, 'memorial', x, y, -1, { built: true });
      if (!m) continue;
      m.campName = campName; m.year = st.year;
      if (city) city.memorialId = m.id;
      sim.fx({ type: 'memorial', x: x + 0.5, y: y + 0.5 });
      void W;
      return m;
    }
    return null;
  }
  // Lagerstadt wird normale Stadt: Zaun fällt, Baracken werden Wohnhäuser, Kommandantur weicht dem Zentrum, Mahnmal
  function toTown(sim, camp) {
    const st = sim.state;
    const k = sim._kingdoms.get(camp.kingdomId);
    WW.Walls.demolishAll(sim, camp);
    for (const s of st.structs.slice()) {
      if (s.dead || s.cityId !== camp.id) continue;
      if (s.type === 'camphq' || s.type === 'watchtower') WW.Structs.remove(sim, s);
      else if (s.type === 'barrack') {
        WW.Structs.remove(sim, s);
        const h = WW.Structs.create(sim, 'house', s.x, s.y, camp.id, { level: 1, built: true, style: k ? k.gov : s.style });
        void h;
      }
    }
    const o = WW.Cities.centerOff();
    clearRect(sim, camp.cx - o.ox, camp.cy - o.oy, o.w, o.h);
    const ctr = WW.Structs.create(sim, 'center', camp.cx - o.ox, camp.cy - o.oy, camp.id, { built: true, style: k ? k.gov : 'tribe', stage: 0 });
    camp.centerId = ctr ? ctr.id : -1;
    camp.kind = 'town'; camp.campFree = st.year;
    for (const f of ['inmates', 'pows', 'guards', 'guardsWant', 'cap', 'powFrom', 'campUnrest', 'campHome', 'campRes']) delete camp[f];
    if (WW.Mods) WW.Mods.remove(camp, 'campguard');
    camp.happiness = Math.max(camp.happiness, 55); camp.unhappyYears = 0; camp.revolt = false;
    if (memorial(sim, camp.cx + 2, camp.cy + 2, camp.name, camp)) chron(sim, 'campMemorial', { city: camp.name }, camp, 'Mahnmal; es gehört niemandem und bleibt stehen');
    WW.Cities.refreshLists(sim, camp);
    st.pathVersion++;
  }
  function clearRegimeMods(sim, k) {
    if (!WW.Mods || !k) return;
    if (campsOf(sim, k).length) return;
    for (const id of k.cityIds) { const c = sim._cities.get(id); if (c) { WW.Mods.remove(c, 'camp'); WW.Mods.remove(c, 'campfear'); } }
  }
  // why: 'conquest' | 'gov' | 'law' | 'fall' | 'uprising'
  function liberate(sim, camp, why) {
    const st = sim.state;
    if (!camp) return;
    if (camp.type === 'laborcamp' || camp.type === 'camphq') {   // alte Signatur (Bauwerk)
      const c = sim._cities.get(camp.cityId);
      if (isCamp(c)) camp = c;
      else {
        const list = inmatesOf(sim, camp);
        for (const u of list) release(sim, u, c);
        WW.Structs.remove(sim, camp);
        memorial(sim, camp.x, camp.y, c ? c.name : '', c);
        if (c) { if (WW.Mods) WW.Mods.add(c, { key: 'happiness', add: C().FREE_JOY, until: st.tick + 6 * TPY(), source: 'campfree', name: 'Befreiung' }); chron(sim, 'campLiberated', { city: c.name, n: list.length, why: why || '' }, c, list.length + ' Befreite sind wieder frei'); clearRegimeMods(sim, sim._kingdoms.get(c.kingdomId)); }
        return;
      }
    }
    if (!isCamp(camp)) return;
    const list = inmatesOf(sim, camp);
    const oldHome = homeOf(sim, camp);
    toTown(sim, camp);
    let home = 0, free = 0;
    for (const u of list) { if (release(sim, u, camp) === 'home') home++; else free++; }
    if (WW.Mods) WW.Mods.add(camp, { key: 'happiness', add: C().FREE_JOY, until: st.tick + 6 * TPY(), source: 'campfree', name: 'Befreiung' });
    if (WW.Mods && oldHome && !oldHome.dead) WW.Mods.add(oldHome, { key: 'happiness', add: Math.round(C().FREE_JOY / 2), until: st.tick + 6 * TPY(), source: 'campfree', name: 'Lager aufgelöst' });
    const k = sim._kingdoms.get(camp.kingdomId);
    const n = list.length;
    sim.fx({ type: 'freed', x: camp.cx + 0.5, y: camp.cy + 0.5 });
    chron(sim, 'campLiberated', { city: camp.name, n: n, why: why || '', kingdom: k ? k.name : '' }, camp,
      n + ' Befreite: ' + home + ' Kriegsgefangene gehen heim, ' + free + ' bleiben als freie Bürger; Mahnmal, Zufriedenheit +' + C().FREE_JOY + ' für 6 Jahre');
    // Regime: Folgen weg, sobald es kein Lager mehr gibt
    for (const kk of st.kingdoms) clearRegimeMods(sim, kk);
  }
  // Lageraufstand: die Insassen übernehmen – freie Stadt mit eigenem Reich (Demokratie oder Anarchie)
  function uprising(sim, camp) {
    const st = sim.state;
    const k = sim._kingdoms.get(camp.kingdomId);
    if (!k) return null;
    const inm = inmatesOf(sim, camp);
    const home = homeOf(sim, camp) || townsOf(sim, k)[0] || null;
    // Wachen fliehen (niemand wird getötet)
    for (const u of st.units) if (!u.dead && u.cityId === camp.id && u.role === 'soldier') { if (home) { u.cityId = home.id; u.order = { kind: 'home' }; u.path = null; } }
    const oldName = k.name;
    toTown(sim, camp);
    for (const u of inm) settle(sim, u, camp);   // alle bleiben: wer sich selbst befreit, gründet etwas Eigenes
    const gov = hh(seed(sim) ^ camp.id, st.year) < 0.5 ? 'democracy' : 'anarchy';
    const nk = k.cityIds.length >= 2 ? WW.Diplo.secede(sim, camp, gov, null, true) : null;
    if (nk && WW.Gov.applyGov) { if (nk.gov !== gov) WW.Gov.applyGov(sim, nk, gov, { lock: false, reason: 'silent' }); }
    if (nk) for (const r of [nk.relations[k.id], k.relations[nk.id]]) if (r) r.opinion = -70;
    if (WW.Mods) WW.Mods.add(camp, { key: 'happiness', add: C().FREE_JOY, until: st.tick + 6 * TPY(), source: 'campfree', name: 'Selbstbefreiung' });
    sim.fx({ type: 'freed', x: camp.cx + 0.5, y: camp.cy + 0.5 });
    chron(sim, 'campUprising', { city: camp.name, n: inm.length, kingdom: nk ? nk.name : '', other: oldName, gov: WW.GOVERNMENTS[gov].name }, camp,
      inm.length + ' Insassen übernehmen das Lager; ' + camp.name + ' ist frei' + (nk ? ' (' + nk.name + ')' : ''));
    for (const kk of st.kingdoms) clearRegimeMods(sim, kk);
    return nk;
  }

  // ---------------------------------------------------------------------------
  // Frieden, Austausch, Freilassung nach Vertrag
  // ---------------------------------------------------------------------------
  function powsBetween(sim, holder, home) {
    const out = [];
    for (const u of sim.state.units) {
      if (u.dead || u.role !== 'prisoner' || u.pow !== home.id || u.campState === 'home') continue;
      const hk = holdKingdom(sim, holdOf(sim, u));
      if (hk && hk.id === holder.id) out.push(u);
    }
    return out;
  }
  // Haken aus diplo.js makePeace: Rückgabe der Kriegsgefangenen (Regime nur zum Teil)
  function onPeace(sim, a, b) {
    if (!a || !b) return;
    peaceFor(sim, a, b); peaceFor(sim, b, a);
  }
  function peaceFor(sim, holder, home) {
    const st = sim.state;
    {
      const list = powsBetween(sim, holder, home).filter((u) => !(u.powUntil > 0));
      if (!list.length) return;
      list.sort((x, y) => x.id - y.id);
      const regime = isRegime(sim, holder);
      const n = regime ? Math.ceil(list.length * C().RETURN_SHARE) : list.length;
      for (let q = 0; q < list.length; q++) {
        if (q < n) release(sim, list[q], null);
        else list[q].powUntil = st.year + C().KEEP_YEARS;
      }
      const r = home.relations && home.relations[holder.id];
      const at = sim._cities.get(home.capitalId);
      if (regime && n < list.length) {
        if (r) { r.grievance = 'liberation'; r.opinion = Math.max(-100, r.opinion - 10); }
        chron(sim, 'powKept', { kingdom: holder.name, other: home.name, n: n, m: list.length - n, city: at ? at.name : '' }, at,
          n + ' Kriegsgefangene kommen frei, ' + (list.length - n) + ' behält das Regime noch ' + C().KEEP_YEARS + ' Jahre; Kriegsgrund „Befreiung"');
      } else {
        if (r) r.opinion = Math.min(100, r.opinion + 6);
        chron(sim, 'powReturn', { kingdom: holder.name, other: home.name, n: n, city: at ? at.name : '' }, at, n + ' Kriegsgefangene gehen heim; Meinung +6');
      }
    }
  }
  function yearlyPows(sim) {
    const st = sim.state, s0 = seed(sim);
    // vertragliche Freilassung
    for (const u of st.units) {
      if (u.dead || u.role !== 'prisoner' || !(u.powUntil > 0) || st.year < u.powUntil || u.campState === 'home') continue;
      const hk = holdKingdom(sim, holdOf(sim, u));
      if (hk && atWarWith(hk, u.pow)) continue;
      release(sim, u, null);
    }
    // Gefangenenaustausch im Krieg
    for (const a of st.kingdoms) for (const oid in a.relations) {
      const b = sim._kingdoms.get(+oid);
      if (!b || b.id < a.id || a.relations[oid].status !== 'war') continue;
      if (hh(s0 ^ (a.id * 31 + b.id), st.year) >= C().EXCHANGE) continue;
      const la = powsBetween(sim, a, b), lb = powsBetween(sim, b, a);
      const n = Math.min(la.length, lb.length, 6);
      if (n < 1) continue;
      for (let q = 0; q < n; q++) { release(sim, la[q], null); release(sim, lb[q], null); }
      const at = sim._cities.get(a.capitalId);
      chron(sim, 'powExchange', { kingdom: a.name, other: b.name, n: n, city: at ? at.name : '' }, at, 'Je ' + n + ' Kriegsgefangene gehen heim');
    }
    // Flucht aus Gefangenenlagern
    for (const s of st.structs) {
      if (s.dead || s.type !== 'stockade') continue;
      const list = inmatesOf(sim, s).filter((u) => u.campState === 'held' && u.pow >= 0);
      if (list.length < 2 || hh(s0 ^ s.id, st.year * 3) >= C().ESCAPE) continue;
      const u = list[0];
      release(sim, u, null);
      const c = sim._cities.get(s.cityId);
      if (c) chron(sim, 'powEscape', { city: c.name, n: 1 }, c, 'Ein Kriegsgefangener ist auf dem Heimweg');
    }
    // Heimkehr in der Chronik (höchstens alle 3 Jahre je Stadt)
    for (const c of st.cities) {
      if (!(c.powHomeN > 0)) continue;
      if (st.year - (c.powHomeY == null ? -99 : c.powHomeY) >= 3) {
        c.powHomeY = st.year;
        chron(sim, 'powHome', { city: c.name, n: c.powHomeN }, c, c.powHomeN + ' Heimkehrer; Zufriedenheit +' + C().HOME_JOY + ' für 3 Jahre');
      }
      c.powHomeN = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Takt
  // ---------------------------------------------------------------------------
  // Haken aus cities.js updateAll (alle 10 Ticks): Lagerstadt statt Wirtschaft/Berufe/Bauplanung
  function cityUpdate(sim, city) {
    if (!isCamp(city)) return;
    city.guards = (city.jobs && city.jobs.soldier) | 0;
    city.happiness = 50; city.unhappyYears = 0; city.revolt = false; city.hungry = false;
    if (city.tier !== 0) city.tier = 0;
  }

  // Zählung: Insassen je Haftort, Herkunft, Reichs-Kennzahlen
  function count(sim) {
    const st = sim.state;
    for (const c of st.cities) if (isCamp(c)) { c.inmates = 0; c.pows = 0; c.powFrom = {}; }
    for (const s of st.structs) if (!s.dead && (s.type === 'stockade' || s.type === 'barrack')) s.inmates = 0;
    for (const k of st.kingdoms) { k.powsHeld = 0; k.powsLost = 0; }
    const bar = new Map();
    for (const u of st.units) {
      if (u.dead || u.role !== 'prisoner' || u.campState === 'home') continue;
      const h = holdOf(sim, u);
      if (!h) continue;
      if (u.campState === 'held') {
        if (h.kind === 'camp') {
          h.inmates++;
          if (u.pow >= 0) { h.pows++; h.powFrom[u.pow] = (h.powFrom[u.pow] | 0) + 1; }
          bar.set(h.id, (bar.get(h.id) | 0) + 1);
        } else h.inmates = (h.inmates | 0) + 1;
      }
      if (u.pow >= 0) {
        const hk = holdKingdom(sim, h), pk = sim._kingdoms.get(u.pow);
        if (hk) hk.powsHeld++;
        if (pk) pk.powsLost++;
      }
    }
    // Belegung der Baracken (für die Darstellung)
    if (bar.size) for (const s of st.structs) {
      if (s.dead || s.type !== 'barrack' || !s.built) continue;
      const left = bar.get(s.cityId) | 0;
      if (!left) continue;
      const n = Math.min(s.cap || C().BARRACK_CAP, left);
      s.inmates = n; bar.set(s.cityId, left - n);
    }
  }

  function plan(sim) {
    const st = sim.state, cfg = C();
    count(sim);
    // Frieden ohne Haken (Bündnis aus dem Krieg heraus, Reich untergegangen): wie beim Friedensschluss behandeln
    let orphan = null;
    for (const u of st.units) {
      if (u.dead || u.role !== 'prisoner' || !(u.pow >= 0) || u.campState === 'home' || u.powUntil > 0) continue;
      const hk = holdKingdom(sim, holdOf(sim, u));
      if (!hk || atWarWith(hk, u.pow)) continue;
      (orphan || (orphan = new Map())).set(hk.id + ':' + u.pow, [hk, u.pow]);
    }
    if (orphan) for (const p of orphan.values()) {
      const home = sim._kingdoms.get(p[1]);
      if (home && !home.dead) peaceFor(sim, p[0], home);
      else for (const u of st.units) if (!u.dead && u.role === 'prisoner' && u.pow === p[1] && u.campState !== 'home') release(sim, u, null);
    }
    // Keimzellen
    for (const s of st.structs.slice()) {
      if (s.dead || s.type !== 'laborcamp') continue;
      const c = sim._cities.get(s.cityId), k = c && sim._kingdoms.get(c.kingdomId);
      if (!c || !isRegime(sim, k)) { liberate(sim, s, !c ? 'fall' : (!st.laws.camps ? 'law' : 'gov')); continue; }
      if (!s.built) {
        if (!s.paid) { const cost = WW.Structs.siteCost(sim, s, c.id); if (WW.Cities.pay(sim, c, cost)) s.paid = true; }
        if (s.paid) { s.progress = Math.min(1, (s.progress || 0) + cfg.SELF_BUILD); if (s.progress >= 1) WW.Structs.complete(sim, s); }
      }
      if (s.built) grow(sim, s);
    }
    // Lagerstädte
    for (const camp of st.cities.slice()) {
      if (!isCamp(camp)) continue;
      const k = sim._kingdoms.get(camp.kingdomId);
      if (!k || k.dead || !townsOf(sim, k).length) { liberate(sim, camp, 'fall'); continue; }
      if (!isRegime(sim, k)) { liberate(sim, camp, !st.laws.camps ? 'law' : (camp.campK != null && camp.campK !== k.id ? 'conquest' : 'gov')); continue; }
      if (camp.campK != null && camp.campK !== k.id) {
        // von einem anderen Regime erobert: bleibt Lager (das Unrecht wechselt nur den Besitzer); dessen eigene Leute sind frei
        for (const u of inmatesOf(sim, camp)) if (u.pow === k.id) release(sim, u, camp);
        const t = townsOf(sim, k)[0]; if (t) camp.campHome = t.id;
      }
      camp.campK = k.id;
      if (k.capitalId === camp.id) { const t = townsOf(sim, k)[0]; if (t) k.capitalId = t.id; }
      campStep(sim, camp, k);
    }
    // Gefangenenlager (stockade): Regime mit Lagerstadt bringen ihre Gefangenen dorthin; leere verschwinden im Frieden
    for (const s of st.structs.slice()) {
      if (s.dead || s.type !== 'stockade') continue;
      const c = sim._cities.get(s.cityId), k = c && sim._kingdoms.get(c.kingdomId);
      const list = inmatesOf(sim, s);
      if (!c || !k) { for (const u of list) release(sim, u, null); WW.Structs.remove(sim, s); continue; }
      if (!s.built) { s.progress = Math.min(1, (s.progress || 0) + 0.25); if (s.progress >= 1) { s.paid = true; WW.Structs.complete(sim, s); } }
      for (const u of list) if (u.pow === k.id) release(sim, u, c);   // Stadt wurde von der Heimat erobert
      if (isRegime(sim, k)) for (const u of list) {
        if (u.campState !== 'held') continue;
        const camp = campWithSpace(sim, k, s.x, s.y);
        if (!camp) break;
        u.camp = camp.id; u.campState = 'march'; u.marchT = st.tick; u.fails = 0;
      }
      if (!list.length && !WW.Diplo.atWar(sim, k.id)) {
        s.idleY = s.idleY == null ? st.year : s.idleY;
        if (st.year - s.idleY >= 2) { WW.Structs.remove(sim, s); WW.Cities.refreshLists(sim, c); }
      } else s.idleY = null;
    }
    if (!st.laws.camps) return;
    // Gründung: Regime mit Anlass (Kriegsgefangene, Rebellen, Unzufriedenheit), höchstens MAX_CAMPS
    for (const k of st.kingdoms) {
      if (!isRegime(sim, k) || (k.campNext | 0) > st.tick) continue;
      const towns = townsOf(sim, k);
      if (!towns.length) continue;
      const max = cfg.MAX_CAMPS + (towns.length >= 5 ? 1 : 0);
      const have = campsOf(sim, k).length + st.structs.filter((s) => !s.dead && s.type === 'laborcamp' && (s.campK === k.id || (sim._cities.get(s.cityId) || {}).kingdomId === k.id)).length;
      if (have >= max) continue;
      const big = towns.some((c) => c.tier >= cfg.MIN_TIER && c.centerOk);
      const pows = stockadesOf(sim, k).some((s) => inmatesOf(sim, s).length > 0);
      const unrest = big && towns.some((c) => c.revolt || (c.jobs && c.jobs.rebel > 0) || c.happiness < cfg.UNHAPPY);
      if (!pows && !unrest) continue;
      if (!found(sim, k, null)) k.campNext = st.tick + TPY();
    }
  }

  function yearly(sim) {
    const st = sim.state, cfg = C(), s0 = seed(sim);
    for (const camp of st.cities.slice()) {
      if (!isCamp(camp)) continue;
      const k = sim._kingdoms.get(camp.kingdomId);
      if (!isRegime(sim, k)) continue;
      // Abholung Unzufriedener (Auswahl nur nach Lage und Beruf, nie nach Herkunft)
      if (camp.cap > 0 && load(sim, camp) < camp.cap && hh(s0 ^ camp.id, st.year) < cfg.PICKUP) {
        let total = 0;
        for (const c of townsOf(sim, k)) {
          if (c.happiness >= cfg.UNHAPPY) continue;
          const cand = st.units.filter((u) => !u.dead && u.cityId === c.id && !u.ind && !u.order && (u.role === 'farmer' || u.role === 'lumberjack' || u.role === 'miner'));
          const n = Math.min(cand.length, 1 + Math.floor(hh(s0 ^ c.id, st.year) * 3), camp.cap - load(sim, camp));
          cand.sort((a, b) => hh(a.id, st.year) - hh(b.id, st.year));
          for (let q = 0; q < n; q++) intern(sim, cand[q], camp, { pow: false, march: true });
          if (n > 0) { total += n; chron(sim, 'campPickup', { city: c.name, n: n, other: camp.name }, c, n + ' Unzufriedene ins Lager ' + camp.name + ' gebracht; Angst statt Zustimmung'); }
          if (load(sim, camp) >= camp.cap) break;
        }
        void total;
      }
      // Ausbruch, Aufstand (zu wenige Wachen), Übernahme (weniger als die Hälfte des Solls)
      const inm = inmatesOf(sim, camp).filter((u) => u.campState === 'held');
      if (inm.length < 4) continue;
      const want = Math.max(cfg.GUARD_MIN, Math.ceil(inm.length / cfg.GUARD_PER));
      const g = camp.guards | 0;
      const r = hh(s0 ^ (camp.id * 7), st.year);
      if (inm.length >= cfg.UPRISE_MIN && g * 2 < want && r < cfg.UPRISE) { uprising(sim, camp); continue; }
      if (g < want && r < cfg.RIOT) {
        const m = Math.ceil(inm.length / 3);
        for (let q = 0; q < m; q++) release(sim, inm[q], null, true);
        chron(sim, 'campRiot', { city: camp.name, n: m }, camp, m + ' Insassen entkommen beim Aufstand; Wachen fehlen');
      } else if (r > 1 - cfg.BREAKOUT) {
        const m = Math.min(inm.length, 2 + Math.floor(hh(s0 ^ camp.id, st.year * 5) * 4));
        for (let q = 0; q < m; q++) release(sim, inm[q], null, true);
        chron(sim, 'campBreakout', { city: camp.name, n: m }, camp, m + ' Ausbrecher: Kriegsgefangene laufen heim, die anderen schließen sich dem Widerstand an');
      }
    }
    // Verurteilung durch Nachbarn
    for (const a of st.kingdoms) {
      const camps = campsOf(sim, a);
      if (!camps.length) continue;
      let worst = null;
      for (const b of st.kingdoms) {
        if (b === a || !b.relations || !b.relations[a.id]) continue;
        const r = b.relations[a.id];
        const pen = cfg.CONDEMN * (b.gov === 'democracy' ? 2.5 : 1);
        r.opinion = Math.max(-100, r.opinion - pen);
        if (!cfg.GOVS[b.gov]) r.grievance = 'liberation';
        if (!worst || pen > worst.pen) worst = { b: b, pen: pen };
      }
      if (worst && st.year - (a.campProtY == null ? -99 : a.campProtY) >= 4) {
        a.campProtY = st.year;
        chron(sim, 'campProtest', { kingdom: a.name, other: worst.b.name, city: camps[0].name }, camps[0], 'Meinung von ' + worst.b.name + ' −' + Math.round(worst.pen) + ' je Jahr; Kriegsgrund „Befreiung"');
      }
    }
    yearlyPows(sim);
  }

  function tick(sim) {
    const st = sim.state, cfg = C();
    if (st.tick % cfg.PLAN_EVERY === 97) plan(sim);
    if (st.tick % cfg.BUILD_EVERY === 17) for (const c of st.cities) if (isCamp(c)) buildStep(sim, c);
    if (st.tick % TPY() === 151) yearly(sim);
  }

  WW.Camps = {
    tick: tick, defaults: defaults, unit: unit, capture: capture, onPeace: onPeace, cityUpdate: cityUpdate,
    campsOf: campsOf, stockadesOf: stockadesOf, inmatesOf: inmatesOf, holdOf: holdOf, liberate: liberate, intern: intern,
    found: found, grow: grow, uprising: uprising, isRegime: isRegime, count: count
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
