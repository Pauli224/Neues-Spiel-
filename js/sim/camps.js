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
//     city.campOut    Ertrag seit Gründung { stone, wood } (für das Info-Fenster: „wofür das alles")
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
//     u.kingdomId = Reich des Haftorts (Insassen zählen NICHT zur Bevölkerung: u.cityId = -1), u.origK/u.origC (Herkunft),
//     u.work (ID der Arbeitsstätte | -1), u.tx/u.ty (Ziel), u.powUntil (Jahr der vertraglichen Freilassung | 0).
//     Heimweg ('home'): u.role bleibt 'prisoner' (ohne Waffe), kingdomId = Heimatreich; bei Ankunft wieder Soldat.
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
  function defaults(st) { /* alles liegt in structs/units; nichts zu ergänzen */ void st; }
  function chron(sim, type, vars, city, eff) {
    const ev = sim.event(type, vars, city ? WW.Cities.atCity(city) : undefined);
    if (ev) { ev.group = 'politics'; ev.effectText = eff || ''; }
  }
  function regimeOk(sim, k) { return !!(k && C().GOVS[k.gov] && sim.state.laws.camps); }
  function campsOf(sim, k) {
    const out = [];
    for (const s of sim.state.structs) {
      if (s.dead || s.type !== 'laborcamp') continue;
      const c = sim._cities.get(s.cityId);
      if (c && c.kingdomId === k.id) out.push(s);
    }
    return out;
  }
  function campFor(sim, kid) {
    const k = sim._kingdoms.get(kid);
    if (!regimeOk(sim, k)) return null;
    for (const s of campsOf(sim, k)) if (s.built && (s.inmates | 0) < (s.cap || C().CAP)) return s;
    return null;
  }

  // Einheit wird interniert (nie nach Volk – nur nach dem, was sie getan hat oder wo sie stand)
  function intern(sim, u, s) {
    const c = sim._cities.get(s.cityId);
    u.origK = u.kingdomId; u.origC = u.cityId;
    u.role = 'prisoner'; u.ind = 'camp'; u.camp = s.id;
    u.kingdomId = c ? c.kingdomId : u.kingdomId; u.cityId = -1;
    u.order = null; u.foe = -1; u.path = null; u.moving = false; u.carrying = null; u.carryAmt = 0; u.merc = false;
    u.hp = Math.max(4, Math.round(u.maxHp * 0.5));
    u.x = s.x + 1; u.y = s.y + 1; u.campT = 0;
    s.inmates = (s.inmates | 0) + 1;
    if (c) fear(sim, c);
  }
  function fear(sim, c) {
    if (WW.Mods) WW.Mods.add(c, { key: 'happiness', add: C().FEAR, until: sim.state.tick + 2 * TPY(), source: 'campfear', name: 'Angst (Aufstände unterdrückt)' });
  }

  // Haken aus units.js hitUnit: true = nicht getötet, sondern interniert
  function capture(sim, att, t) {
    if (!t || t.dead || t.role === 'prisoner' || t.role === 'leader' || t.role === 'child') return false;
    const ak = att && sim._kingdoms.get(att.kingdomId);
    if (!ak) return false;
    const isRebel = t.role === 'rebel' && t.kingdomId === ak.id;
    const isPow = t.role === 'soldier' && t.kingdomId !== ak.id && WW.Diplo.atWar(sim, ak.id);
    if (!isRebel && !isPow) return false;
    if (hh(sim._seedHash ^ t.id, sim.state.tick) >= C().CAPTURE) return false;
    const s = campFor(sim, ak.id);
    if (!s) return false;
    intern(sim, t, s);
    const c = sim._cities.get(s.cityId);
    if (c && sim.state.year - (c.campInternY == null ? -99 : c.campInternY) >= 3) {
      c.campInternY = sim.state.year;
      chron(sim, isRebel ? 'campIntern' : 'campPow', { city: c.name }, c, 'Gefangene statt Gefallene; die Angst wächst, die Zustimmung nicht');
    }
    return true;
  }

  // Bewegung und Zwangsarbeit der Insassen (Haken über WW.Industry.unit)
  function unit(sim, u) {
    const st = sim.state;
    const s = sim._structs.get(u.camp);
    if (!s || s.dead || s.type !== 'laborcamp') { free(sim, u, null); return false; }
    if (!u.campT || u.campT <= st.tick) {
      u.campT = st.tick + 40 + (u.id % 20);
      // Arbeitsplatz: nächste Gleisbaustelle im Umkreis, sonst Fels/Wald, sonst im Lager
      let best = null, bd = C().WORK_R * C().WORK_R;
      for (const id of (sim._cities.get(s.cityId) || {}).sites || []) {
        const r = sim._structs.get(id);
        if (!r || r.type !== 'rail' || r.built) continue;
        const d = (r.x - s.x) * (r.x - s.x) + (r.y - s.y) * (r.y - s.y);
        if (d < bd) { bd = d; best = r; }
      }
      if (best) { u.tx = best.x + 0.5; u.ty = best.y + 0.5; u.work = best.id; }
      else {
        const a = hh(u.id, st.tick) * 6.283, rr = 1 + hh(u.id ^ 77, st.tick) * 4;
        u.tx = s.x + 1 + Math.cos(a) * rr; u.ty = s.y + 1 + Math.sin(a) * rr; u.work = -1;
      }
    }
    const dx = u.tx - u.x, dy = u.ty - u.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.3) {
      const sp = 0.03, nx = u.x + dx / d * sp, ny = u.y + dy / d * sp;
      const i = Math.floor(ny) * st.W + Math.floor(nx);
      if (nx >= 0 && ny >= 0 && nx < st.W && ny < st.H && WW.TERRAIN_LUT.walk[st.terrain[i]] > 0 && !sim.block[i]) { u.x = nx; u.y = ny; u.dir = dx < 0 ? -1 : 1; }
      u.moving = true;
    } else {
      u.moving = false;
      if ((st.tick + u.id) % 60 === 0) labor(sim, u, s);
    }
    return true;
  }
  function labor(sim, u, s) {
    const c = sim._cities.get(s.cityId);
    if (!c) return;
    const r = u.work >= 0 ? sim._structs.get(u.work) : null;
    if (r && !r.dead && r.type === 'rail' && !r.built) {
      r.paid = true;
      r.progress = Math.min(1, (r.progress || 0) + C().RAIL_WORK);
      if (r.progress >= 1) WW.Structs.complete(sim, r);
      return;
    }
    WW.Cities.addStock(sim, c, hh(u.id, sim.state.tick) < 0.5 ? 'stone' : 'wood', C().YIELD);
  }

  // Insasse wird frei (Befreiung) bzw. bricht aus (rebel)
  function free(sim, u, city, rebel) {
    u.ind = null; u.camp = 0; u.work = -1; u.moving = false; u.path = null;
    const c = city || sim._cities.get(u.origC);
    if (c) { u.cityId = c.id; u.kingdomId = c.kingdomId; }
    if (rebel) WW.Units.setRole(sim, u, 'rebel');
    else WW.Units.setRole(sim, u, 'farmer');
  }
  function inmatesOf(sim, s) { return sim.state.units.filter((u) => !u.dead && u.role === 'prisoner' && u.camp === s.id); }

  function liberate(sim, s, why) {
    const c = sim._cities.get(s.cityId);
    const list = inmatesOf(sim, s);
    for (const u of list) free(sim, u, c, false);
    if (c) {
      if (WW.Mods) { WW.Mods.remove(c, 'camp'); WW.Mods.remove(c, 'campfear');
        WW.Mods.add(c, { key: 'happiness', add: 15, until: sim.state.tick + 6 * TPY(), source: 'campfree', name: 'Befreiung' }); }
      chron(sim, 'campLiberated', { city: c.name, n: list.length, why: why || '' }, c, list.length + ' Befreite sind wieder Bürger; Zufriedenheit +15 für 6 Jahre');
    }
    s.inmates = 0;
    WW.Structs.destroy(sim, s);   // Ruinen (ruinOf 'laborcamp') = Mahnmal
    if (c) WW.Cities.refreshLists(sim, c);
  }

  function plan(sim) {
    const st = sim.state, cfg = C();
    for (const s of st.structs.slice()) {
      if (s.dead || s.type !== 'laborcamp') continue;
      const c = sim._cities.get(s.cityId), k = c && sim._kingdoms.get(c.kingdomId);
      if (!c || !regimeOk(sim, k) || (s.campK != null && s.campK !== c.kingdomId && !regimeOk(sim, k))) {
        liberate(sim, s, !c ? '' : (!st.laws.camps ? 'law' : 'gov'));
        continue;
      }
      if (s.campK != null && s.campK !== c.kingdomId) {
        // von einem anderen (ebenfalls autoritären) Regime übernommen: bleibt Lager – ändert nichts am Unrecht
        s.campK = c.kingdomId;
      }
      s.campK = c.kingdomId;
      s.inmates = inmatesOf(sim, s).length;
      // Baustelle: das Regime lässt auch Soldaten am Zaun arbeiten (Baumeister haben oft Mauern vor)
      if (!s.built) {
        if (!s.paid) { const cost = WW.Structs.siteCost(sim, s, c.id); if (WW.Cities.pay(sim, c, cost)) s.paid = true; }
        if (s.paid) { s.progress = Math.min(1, (s.progress || 0) + cfg.SELF_BUILD); if (s.progress >= 1) { WW.Structs.complete(sim, s); WW.Cities.refreshLists(sim, c); } }
      }
      if (WW.Mods && s.built) {
        WW.Mods.add(c, { key: 'happiness', add: -cfg.UNHAPPY_MOD, source: 'camp', name: 'Arbeitslager' });
        WW.Mods.add(c, { key: 'loyalty', add: -cfg.LOYALTY_MOD, source: 'camp', name: 'Arbeitslager' });
      }
    }
    if (!st.laws.camps) return;
    for (const c of st.cities) {
      const k = sim._kingdoms.get(c.kingdomId);
      if (!regimeOk(sim, k) || c.tier < cfg.MIN_TIER || !c.centerOk) continue;
      if (st.structs.some((s) => !s.dead && s.type === 'laborcamp' && s.cityId === c.id)) continue;
      const g = WW.GOVERNMENTS[k.gov];
      if (g && g.wallMax > 0 && !(c.wall && c.wall.plan && c.wall.plan.length) && c.pop < 60) continue;
      const reason = c.revolt || (c.jobs && c.jobs.rebel > 0) || WW.Diplo.atWar(sim, k.id) || c.happiness < cfg.UNHAPPY;
      if (!reason || (c.campNext | 0) > st.tick) continue;
      const i = WW.Industry.findSpot(sim, c, 2, 2);
      if (i < 0) { c.campNext = st.tick + TPY(); continue; }
      const W = st.W, x = i % W, y = Math.floor(i / W);
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const o = sim._structs.get(st.structAt[(y + dy) * W + x + dx]);
        if (o && (o.type === 'ruin' || o.type === 'field')) WW.Structs.remove(sim, o);
      }
      const s = WW.Structs.create(sim, 'laborcamp', x, y, c.id, { style: k.gov });
      if (!s) continue;
      s.inmates = 0; s.cap = cfg.CAP; s.campK = k.id;
      c.sites.push(s.id);
      chron(sim, 'campBuilt', { city: c.name, kingdom: k.name }, c, 'Zufriedenheit −' + cfg.UNHAPPY_MOD + ', Loyalität −' + cfg.LOYALTY_MOD + ' solange es steht');
    }
  }

  function yearly(sim) {
    const st = sim.state, cfg = C(), s0 = sim._seedHash | 0;
    for (const s of st.structs.slice()) {
      if (s.dead || s.type !== 'laborcamp' || !s.built) continue;
      const c = sim._cities.get(s.cityId), k = c && sim._kingdoms.get(c.kingdomId);
      if (!c || !regimeOk(sim, k)) continue;
      // Abholung Unzufriedener (Auswahl nur nach Lage, nie nach Volk)
      if (c.happiness < cfg.UNHAPPY && (s.inmates | 0) < (s.cap || cfg.CAP) && hh(s0 ^ s.id, st.year) < cfg.PICKUP) {
        const cand = st.units.filter((u) => !u.dead && u.cityId === c.id && (u.role === 'farmer' || u.role === 'lumberjack' || u.role === 'miner') && !u.ind);
        const n = Math.min(cand.length, 1 + Math.floor(hh(s0 ^ c.id, st.year) * 3), (s.cap || cfg.CAP) - (s.inmates | 0));
        cand.sort((a, b) => hh(a.id, st.year) - hh(b.id, st.year));
        for (let q = 0; q < n; q++) intern(sim, cand[q], s);
        if (n > 0) chron(sim, 'campPickup', { city: c.name, n: n }, c, n + ' Unzufriedene abgeholt; Zufriedenheit dauerhaft −' + cfg.UNHAPPY_MOD);
      }
      // Ausbruch / Lageraufstand
      const inm = inmatesOf(sim, s);
      if (inm.length >= 4) {
        const r = hh(s0 ^ (s.id * 7), st.year);
        if (r < cfg.BREAKOUT) {
          for (const u of inm) free(sim, u, c, true);
          s.inmates = 0;
          chron(sim, 'campBreakout', { city: c.name, n: inm.length }, c, inm.length + ' Ausbrecher schließen sich dem Widerstand an');
        } else if (r < cfg.BREAKOUT + cfg.RIOT) {
          const m = Math.ceil(inm.length / 3);
          for (let q = 0; q < m; q++) free(sim, inm[q], c, true);
          s.inmates = inm.length - m;
          chron(sim, 'campRiot', { city: c.name, n: m }, c, m + ' Insassen entkommen beim Aufstand');
        }
      }
    }
    // Verurteilung durch Nachbarn
    for (const a of st.kingdoms) {
      const camps = campsOf(sim, a).filter((s) => s.built);
      if (!camps.length) continue;
      let worst = null;
      for (const b of st.kingdoms) {
        if (b === a || !b.relations || !b.relations[a.id]) continue;
        const r = b.relations[a.id];
        const pen = cfg.CONDEMN * (b.gov === 'democracy' ? 2.5 : 1);
        r.opinion = Math.max(-100, r.opinion - pen);
        if (!C().GOVS[b.gov]) r.grievance = 'liberation';
        if (!worst || pen > worst.pen) worst = { b: b, pen: pen };
      }
      if (worst && st.year - (a.campProtY == null ? -99 : a.campProtY) >= 4) {
        a.campProtY = st.year;
        const c = sim._cities.get(camps[0].cityId);
        chron(sim, 'campProtest', { kingdom: a.name, other: worst.b.name, city: c ? c.name : '' }, c, 'Meinung von ' + worst.b.name + ' −' + Math.round(worst.pen) + ' je Jahr; Kriegsgrund „Befreiung"');
      }
    }
  }

  function tick(sim) {
    const st = sim.state;
    if (st.tick % C().PLAN_EVERY === 97) plan(sim);
    if (st.tick % TPY() === 151) yearly(sim);
  }

  WW.Camps = { tick: tick, defaults: defaults, unit: unit, capture: capture, campsOf: campsOf, liberate: liberate, intern: intern };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
