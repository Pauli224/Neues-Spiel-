// =============================================================================
// Wuselwelt – Militär: Arsenal, Panzer, Artillerie, Feldschlachten, Schlachtfelder. DOM-frei, deterministisch
// (nur sim.rng, kein Math.random/Date). Daten: WW.MIL in js/core/config-mil.js, Texte: js/data/texts-mil.js.
// LADEREIHENFOLGE: js/core/config-mil.js nach den anderen Konfig-Dateien, js/data/texts-mil.js nach den anderen
//   Textdateien, js/sim/military.js nach js/sim/camps.js, unmittelbar vor js/sim/sim.js (index.html, tests/load.js).
// HAKEN (markiert // [mil]):
//   sim.js    tick -> WW.Military.tick(sim); defaults/create -> WW.Military.defaults(st); RASTERS + 'trench';
//             actions -> WW.Military.actions(sim, safe)
//   units.js  updateAll: Fahrzeuge (u.vehicle) steuert WW.Military.unit(sim, u); hitUnit: WW.Military.armor (Panzerung,
//             Deckung im Graben); kill: WW.Military.onKill (Wrack, Verluste der Schlacht); isFighterRole kennt tank/artillery
//   diplo.js  strength zählt Fahrzeuge (WW.Military.strength)
//   powers.js nichts: die Kräfte hängt dieses Modul beim Laden an WW.POWERS / WW.POWER_KEYS an
//
// WER BAUT WAS: WW.MIL.GOVS[gov] (Tabelle, erweiterbar). Faschismus: Panzer + Artillerie (Schwerpunkt Panzer, günstig);
//   Kommunismus: viele einfache Panzer (u.simple) + Artillerie; Monarchie, Handelsrepublik: nur Feldgeschütze (teuer);
//   Demokratie: Geschütze zur Verteidigung (bleiben daheim); Theokratie, Stamm, Anarchie: nichts.
//
// BAUWERK type 'arsenal' (3×2, WW.STRUCT_INFO.arsenal; außerhalb des Mauerrings, Platz über WW.Industry.findSpot)
//   Voraussetzung: Stadt ab Stufe „Stadt" (tier ≥ 2), Einwohner ≥ GOVS[gov].minPop, fertige Fabrik ('factory') oder
//   Schmiede ('smithy') in der Stadt; höchstens GOVS[gov].arsenals je Reich. Gebaut von den Baumeistern (Baustelle).
//   Felder: style (Regierung, wie alle Bauwerke; Sprite s_arsenal_<gov>), prod ('tank'|'artillery'|null = ruht),
//   prog 0..1 (Baufortschritt des Fahrzeugs), pay ('res' = Eisen+Kohle | 'alt' = Behelf mit Gold/Holz+Stein, langsam),
//   made (gebaute Fahrzeuge), lastPay (Bezahlart des letzten Auftrags), opened (1 = Eröffnung stand in der Chronik), idle (true = Regierung ohne Militärtabelle).
//   Verbrauch aus WW.Cities.stock(sim, city): iron + coal (WW.MIL.COST, × GOVS.costMul); fehlt das, Behelf
//   (gold, ohne Goldwirtschaft wood + stone) mit Tempo × COST.altSpeed. Nichts davon da: wartet.
//
// FAHRZEUGE = Einheiten in state.units mit vehicle: true und role 'tank' (Panzer) | 'artillery' (Feldgeschütz)
//   Felder zusätzlich zu den üblichen Einheitenfeldern: vehicle true, homeC (Heimatstadt-ID; cityId ist immer -1,
//   Fahrzeuge zählen nicht zur Bevölkerung), vdir 0 Osten | 1 Süden | 2 Westen | 3 Norden (Fahrt-/Rohrrichtung, für
//   S.vehicleKey(kind, gov, dir, frame)), gov (Regierung beim Bau = Aussehen/Rumpfzeichen), simple (true = einfacher
//   Kommunismus-Panzer), aim (Ziel-ID | -1), moving (fährt = Kettenphase animieren), cd (Nachladen, Ticks),
//   order ({ kind:'march', city, k } | { kind:'home' } | null), breach (Mauerstück-ID, an dem der Panzer rüttelt | -1).
//   Panzer: stark gepanzert (Soldaten richten wenig aus), langsam in Wald/Hügel/Sumpf, fährt nicht durch Gebirge/
//   Wasser (Fluss nur sehr langsam als Furt), bricht Mauerstücke, überrollt Barrikaden sofort; Schwächen: Artillerie,
//   schwere Mauergeräte (Kanone, Balliste), anderer Panzer. Artillerie: Reichweite WW.MIL.GUN.range (≈ 9,5 Kacheln),
//   Mindestabstand, langsame Schussfolge, Flächentreffer, Krater (state.mark 100..199), trifft Mauern; im Nahkampf
//   wehrlos (schießt nicht, versucht abzurücken). Ausfall -> Wrack (state.wrecks), Fx 'wreck'.
//   Fahrzeuge schließen sich im Krieg dem Marsch des eigenen Heeres an (state.mil.march), sonst parken sie daheim.
//   u.parole (Tick): hat bei einer Aufgabe die Waffen niedergelegt; bis dahin weder Angreifer noch Ziel (units.js hostile),
//   wird nicht in neue Heere eingezogen (diplo.js). Darstellung: ohne Waffe / weiße Fahne.
//   GARNISON (u.garrison = Stadt-ID, Kern): solche Soldaten und Fahrzeuge zählen nicht zu Marschgruppen, Ausfällen, Abfangen
//   oder Feldschlachten (weder Teilnehmer noch Verluste-Seite), werden von „Schlacht befehlen" nicht losgeschickt; ein
//   stationiertes Fahrzeug folgt keinem Marsch, verteidigt aber seine Stadt.
//   Weltobergrenze WW.MIL.WORLD_MAX (48) Fahrzeuge; eigenes Wegsuche-Teilbudget WW.MIL.PATH_SHARE (nimmt den Heeren nichts weg).
//   Feldschlachten nie im Vorfeld einer Stadt (Ring bzw. Kernbebauung + BATTLE.siegeMargin): dort gilt die Belagerung.
//   Laufzeitschalter sim._noSiegeEngines (Tests der Belagerung): Arsenale bauen nichts von selbst.
//
// ZUSTAND
//   state.trench   Uint8Array(W*H): Schützengraben 0..255 (0 = keiner; ab WW.MIL.TRENCH.cover gibt er Deckung);
//                  wächst langsam zu (jährlich, nach Naturmodus des Gebiets). Dirty-Kacheln beim Entstehen und bei jedem
//                  Stufenwechsel (Wert >> 6). Darstellung: t_trench mit softKey-Masken; gehört in die Boden-Prüfsumme.
//   state.battles[] laufende Feldschlachten: { id, x, y (Mittelpunkt, Kacheln), r (Radius), a, b (Reichs-IDs; a = Angreifer),
//                  start (Tick), year, lossA, lossB, nA, nB (Kämpfer jetzt), peakA, peakB, vA, vB (höchstens gleichzeitig
//                  beteiligte Fahrzeuge), state ('fight'|'retreat'|'surrender'),
//                  breaker (Reich, das gewichen ist | -1), pows (Gefangene), gaveUp (Soldaten, die aufgegeben haben), quiet,
//                  dig (Reich, das sich eingräbt), name, base, place }
//                  Aufgabe: WW.Camps.surrender(sim, siegerId, einheiten, schlacht) -> Anzahl, falls vorhanden, sonst je Soldat
//                  WW.Camps.capture(sim, { id: -1, kingdomId: sieger }, u, { surrender: true }); wer nicht gefangen wird,
//                  legt die Waffen nieder und geht heim (order home). Fahrzeuge der Aufgebenden werden erbeutet.
//   state.sites[]  Schlachtfelder als Orte: { id, kind: 'battlefield', name (erste freie Angabe: 'Schlacht bei <Stadt>',
//                  'am Fluss bei <Stadt>', '<Gelände> vor <Stadt>', 'an der Furt von <Stadt>', 'bei <Stadt> im Jahr N';
//                  ohne Stadt '<Gelände>', 'am Fluss', '<Gelände> im Jahr N'; erst danach mit Zählwort), base,
//                  x, y, r, year, a, b, aName, bName, winner (Reichs-ID | -1 unentschieden), losses: { a, b }, pows, how
//                  ('win'|'retreat'|'surrender'|'draw'), vehicles: { a, b } (beteiligte Fahrzeuge) } – höchstens WW.MIL.MAX_SITES,
//                  älteste fallen weg.
//   state.wrecks[] { id, x, y, kind: 'tank'|'gun', year, gov, k (Reich), rust 0..3 (rostet jährlich weiter) } –
//                  verschwinden nach WW.MIL.WRECK_YEARS Jahren. Sprites d_wreck_tank, d_wreck_gun.
//   state.mil      { seq, trenchN (Kacheln mit Graben), march { [kid]: { city, k, n } }, count { [kid]: { tank, artillery } },
//                  pick (Kraft „Schlacht befehlen": erstes Reich | -1), pickT }
//
// FX (sim.drainFx), Koordinaten in Kacheln:
//   shell    { x, y, x0, y0, x1, y1, t (Flugzeit in Ticks) }  Granate fliegt von (x0,y0) nach (x1,y1); Einschlag zusätzlich
//            als 'explosion' { x, y, r } (vorhandener Effekt) – Granaten treffen sofort, t ist nur für die Flugbahn
//   muzzle   { x, y, kind: 'tank'|'artillery' }  Mündungsfeuer (Typ gibt es schon für Mauergeräte)
//   tankfire { x, y, x2, y2, dir }               Panzerschuss (kurz, flach)
//   wreck    { x, y, kind: 'tank'|'gun' }        Fahrzeug fällt aus (Typ 'wreck' gibt es schon: Abrissbirne)
//   dig      { x, y }                            Graben entsteht
//   battlepick { x, y, kingdomId }               Kraft „Schlacht befehlen": erstes Reich gewählt
//
// EREIGNISTYPEN (WW.Texts.EVENTS über js/data/texts-mil.js; ev.group 'war', ev.effectText):
//   battle (Ende einer Feldschlacht; wichtig -> Pop-up-Typ 'battle'; ev.popup = 'battle', ev.siteId),
//   battleStart, battleRetreat, battleSurrender, arsenal (Arsenal eröffnet), firstTank, firstGun, tankBreach,
//   godTank, godGun, godBattle
//
// KRÄFTE (WW.POWERS, Kategorie 'destruction'; Feld icon: milTank -> i_tank, milGun -> i_artillery, milBattle -> i_battle;
//   tools.js sucht bisher i_<key>, die Darstellung soll power.icon bevorzugen): milTank „Panzer setzen", milGun „Geschütz setzen" (gehört dem Reich an
//   der Stelle bzw. dem nächsten Reich ≤ 30 Kacheln), milBattle „Schlacht befehlen" (zweimal tippen: erstes Reich, dann
//   zweites -> Krieg erzwungen + beide Heere marschieren aufeinander zu).
// AKTIONEN (sim.actions.*, werfen nie): placeVehicle(x, y, kind ['tank'|'artillery'], kingdomId?) -> unitId | null,
//   orderBattle(kingdomA, kingdomB) -> bool
// SCHNITTSTELLE: WW.Military.tick(sim), defaults(st), unit(sim, u), armor(sim, att, t, dmg), onKill(sim, u, cause),
//   strength(sim, k), actions(sim, safe), tryArsenal(sim, city, force) -> Bauwerk | null, spawnVehicle(sim, kind, k, x, y,
//   homeC) -> Einheit | null, vehiclesOf(sim, kid) -> [Einheit], battleAt(sim, x, y) -> Schlacht | null,
//   siteAt(sim, x, y) -> Ort | null, govSpec(gov) -> Eintrag aus WW.MIL.GOVS | null
// =============================================================================
(function (WW) { 'use strict';

  const M = () => WW.MIL;
  const TPY = () => WW.CONFIG.TPY;
  const FIGHTER = { soldier: 1, tank: 1, artillery: 1, ram: 1, catapult: 1, rebel: 1 };
  const KINDS = ['tank', 'artillery'];

  function hh(a, b) {
    let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  }
  function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function fmt(tpl, v) { return tpl.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? String(v[k]) : '')); }
  function dist(u, x, y) { const dx = x - u.x, dy = y - u.y; return Math.sqrt(dx * dx + dy * dy); }
  function T_(u) { return u.role === 'tank' ? M().TANK : M().GUN; }
  function chron(sim, type, vars, at, eff) {
    const ev = sim.event(type, vars, at);
    if (ev) { ev.group = 'war'; ev.effectText = eff || ''; }
    return ev;
  }
  function hostileK(sim, a, b) { return WW.Path.hostileKingdoms(sim, a, b); }

  // ---------------------------------------------------------------------------
  // Zustand
  // ---------------------------------------------------------------------------
  function defaults(st) {
    const N = st.W * st.H;
    if (!(st.trench instanceof Uint8Array) || st.trench.length !== N) st.trench = new Uint8Array(N);
    st.battles = Array.isArray(st.battles) ? st.battles : [];
    st.sites = Array.isArray(st.sites) ? st.sites : [];
    st.wrecks = Array.isArray(st.wrecks) ? st.wrecks : [];
    const m = st.mil && typeof st.mil === 'object' ? st.mil : {};
    m.seq = m.seq | 0; m.trenchN = m.trenchN | 0;
    m.march = m.march && typeof m.march === 'object' ? m.march : {};
    m.count = m.count && typeof m.count === 'object' ? m.count : {};
    m.pick = typeof m.pick === 'number' ? m.pick : -1;
    m.pickT = m.pickT | 0;
    st.mil = m;
  }

  function govSpec(gov) { return (M().GOVS && M().GOVS[gov]) || null; }
  function kingdomPop(sim, k) { let p = 0; for (const id of k.cityIds) { const c = sim._cities.get(id); if (c) p += c.pop | 0; } return p; }
  function capOf(sim, k, kind, war) {
    const sp = govSpec(k.gov);
    if (!sp || !sp[kind]) return 0;
    const pop = kingdomPop(sim, k);
    let n = Math.min(sp[kind].max + (sp.maxPer ? Math.floor(pop / sp.maxPer) : 0), Math.floor(pop / sp[kind].per + 0.5));
    if (!war) n = n > 0 ? Math.max(1, Math.round(n * M().PEACE_SHARE)) : 0;
    return n;
  }
  function vehiclesOf(sim, kid) { return sim.state.units.filter((u) => !u.dead && u.vehicle && u.kingdomId === kid); }
  function strength(sim, k) {
    const c = sim.state.mil && sim.state.mil.count[k.id];
    return c ? (c.tank | 0) * 9 + (c.artillery | 0) * 5 : 0;
  }

  // Kostentabelle der Fahrzeuge (Laufzeit; aus dem Gelände ableitbar): langsam in Wald/Hügel/Sumpf, Furt durch Flüsse
  const SPEED_BY_KEY = { grass: 1, flowers: 1, savanna: 1, tundra: 0.9, sand: 0.8, desert: 0.8, ash: 0.85, crystal: 0.6,
    snowfield: 0.55, forest: 0.4, taiga: 0.4, mushroom: 0.4, jungle: 0.3, hill: 0.45, swamp: 0.25, river: 0.12 };
  function tables(sim) {
    if (sim._tables && sim._tables.tank) return sim._tables.tank;
    const n = WW.TERRAIN.length, cost = new Float32Array(n), speed = new Float32Array(n);
    for (let t = 0; t < n; t++) {
      const w = WW.TERRAIN_LUT.walk[t];
      const v = w > 0 ? (SPEED_BY_KEY[WW.TERRAIN[t].key] != null ? SPEED_BY_KEY[WW.TERRAIN[t].key] : Math.min(1, w)) : 0;
      speed[t] = v; cost[t] = v > 0 ? 1 / v : 0;
    }
    if (!sim._tables) sim._tables = {};
    sim._tables.tank = { cost: cost, speed: speed };
    return sim._tables.tank;
  }

  // ---------------------------------------------------------------------------
  // Arsenal
  // ---------------------------------------------------------------------------
  function hasWorkshop(sim, city) {
    for (const s of sim.state.structs) if (!s.dead && s.built && s.cityId === city.id && (s.type === 'factory' || s.type === 'smithy')) return true;
    return false;
  }
  function hasMine(sim, city) {
    for (const s of sim.state.structs) if (!s.dead && s.built && s.type === 'mine' && s.cityId === city.id && (s.res === 'iron' || s.res === 'coal')) return true;
    return false;
  }
  // Eisen, das die Schmiede für das Arsenal liegen lässt (Haken in growth.js, Resources.update)
  function reserve(sim, city) { return city && city.milRes > 0 ? city.milRes : 0; }
  function arsenalsOfKingdom(sim, kid) {
    const out = [];
    for (const s of sim.state.structs) {
      if (s.dead || s.type !== 'arsenal') continue;
      const c = sim._cities.get(s.cityId);
      if (c && c.kingdomId === kid) out.push(s);
    }
    return out;
  }
  // Neues Arsenal planen. force = ohne Voraussetzungen (Tests, Sandkasten)
  function tryArsenal(sim, city, force) {
    const st = sim.state;
    const k = city && sim._kingdoms.get(city.kingdomId);
    const sp = k && govSpec(k.gov);
    if (!sp || st.laws.industry === false || !WW.Industry || !WW.Industry.findSpot) return null;
    const own = arsenalsOfKingdom(sim, k.id);
    const inCity = own.filter((s) => s.cityId === city.id).length;
    if (inCity >= 1 + (sp.arsenalPer ? Math.floor(city.pop / sp.arsenalPer) : 0)) return null;
    if (!force) {
      if ((city.tier | 0) < 2 || city.pop < sp.minPop || !city.centerOk) return null;
      if ((city.milNext | 0) > st.tick) return null;
      if (own.length >= sp.arsenals + (sp.arsenalPer ? Math.floor(kingdomPop(sim, k) / sp.arsenalPer) : 0) || own.some((s) => !s.built)) return null;
      if (!sp.noWorkshop && !hasWorkshop(sim, city)) return null;   // Regime bauen auch ohne Werkstatt (dann langsamer)
    }
    const W = st.W;
    const i = WW.Industry.findSpot(sim, city, 3, 2);
    if (i < 0) { city.milNext = st.tick + TPY(); return null; }
    const x = i % W, y = Math.floor(i / W);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) {
      const s = sim._structs.get(st.structAt[(y + dy) * W + x + dx]);
      if (s && (s.type === 'ruin' || (s.type === 'field' && s.cityId === city.id))) WW.Structs.remove(sim, s);
    }
    const s = WW.Structs.create(sim, 'arsenal', x, y, city.id, { style: k.gov });
    if (!s) { city.milNext = st.tick + TPY(); return null; }
    for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) { const j = (y + dy) * W + x + dx; if (st.owner[j] === -1) { st.owner[j] = city.id; sim.markDirty(j); } }
    s.prod = null; s.prog = 0; s.pay = null; s.made = 0; s.opened = 0; s.idle = false;
    if (!city.sites) city.sites = [];
    city.sites.push(s.id);
    city.milNext = st.tick + TPY();
    return s;
  }

  // Kosten eines Fahrzeugs für Reich k (gerundet)
  // alt: Behelf (Zahl = Index der Möglichkeit in COST.alt bzw. COST.altNoGold; true = erste)
  function costOf(k, kind, alt) {
    const sp = govSpec(k.gov) || { costMul: 1 };
    const C = M().COST;
    const mul = sp.costMul * (kind === 'tank' && sp.simple ? M().SIMPLE.costMul : 1);
    const list = (WW.GOVERNMENTS[k.gov] || {}).goldMul > 0 ? C.alt : C.altNoGold;
    const src = alt ? list[Math.min(list.length - 1, alt === true ? 0 : alt | 0)] : { iron: C[kind].iron, coal: C[kind].coal };
    const out = {};
    for (const r in src) out[r] = Math.max(1, Math.round(src[r] * mul));
    return out;
  }
  function altCount(k) { const C = M().COST; return ((WW.GOVERNMENTS[k.gov] || {}).goldMul > 0 ? C.alt : C.altNoGold).length; }
  function canPay(sk, cost) { for (const r in cost) if (!((sk[r] || 0) >= cost[r])) return false; return true; }
  function pay(sk, cost) { for (const r in cost) sk[r] = (sk[r] || 0) - cost[r]; }

  function countVehicles(sim) {
    const st = sim.state, cnt = {};
    for (const u of st.units) {
      if (u.dead || !u.vehicle) continue;
      const c = cnt[u.kingdomId] || (cnt[u.kingdomId] = { tank: 0, artillery: 0 });
      if (u.role === 'tank') c.tank++; else c.artillery++;
    }
    st.mil.count = cnt;
    return cnt;
  }

  function production(sim) {
    const st = sim.state;
    const cnt = countVehicles(sim);
    let total = 0;
    for (const kid in cnt) total += cnt[kid].tank + cnt[kid].artillery;
    const ars = [];
    for (const s of st.structs) {
      if (s.dead || s.type !== 'arsenal') continue;
      if (s.built) { ars.push(s); continue; }
      // Baustelle selbst bezahlen, sobald eine der Möglichkeiten reicht (Holz, Holz + Stein, Stein) – sonst verhungert sie,
      // wo nur einer der beiden Baustoffe da ist
      if (!s.paid) {
        const c = sim._cities.get(s.cityId);
        if (!c) continue;
        const sk = WW.Cities.stock(sim, c);
        for (const opt of M().ARSENAL_PAY) if (canPay(sk, opt)) { pay(sk, opt); s.paid = true; break; }
      }
    }
    if (!ars.length) return;
    const pend = {};
    for (const s of ars) if (s.prod) {
      const c = sim._cities.get(s.cityId);
      if (!c) continue;
      const p = pend[c.kingdomId] || (pend[c.kingdomId] = { tank: 0, artillery: 0 });
      p[s.prod]++;
    }
    for (const s of ars) {
      const city = sim._cities.get(s.cityId);
      const k = city && sim._kingdoms.get(city.kingdomId);
      if (!k) continue;
      if (!s.opened) {
        s.opened = 1;
        chron(sim, 'arsenal', { city: city.name, kingdom: k.name }, WW.Cities.atCity(city), 'Baut Fahrzeuge aus Eisen und Kohle');
      }
      const sp = govSpec(k.gov);
      s.idle = !sp;
      if (!sp || st.laws.industry === false || sim._noSiegeEngines) continue;   // Testschalter: kein Kriegsgerät von selbst
      if (total >= M().WORLD_MAX && !s.prod) continue;   // Weltobergrenze (Leistung)
      if (!s.prod) {
        const war = WW.Diplo.atWar(sim, k.id);
        const have = cnt[k.id] || { tank: 0, artillery: 0 }, p = pend[k.id] || (pend[k.id] = { tank: 0, artillery: 0 });
        let pick = null, best = 0;
        for (const kind of KINDS) {
          if (!sp[kind]) continue;
          const need = capOf(sim, k, kind, war) - have[kind] - p[kind];
          if (need <= 0) continue;
          const sc = need + (sp.focus === kind ? 0.5 : 0);
          if (sc > best) { best = sc; pick = kind; }
        }
        if (!pick) continue;
        const sk = WW.Cities.stock(sim, city);
        let c = costOf(k, pick, false), how = 'res';
        if (!canPay(sk, c)) {
          // mit eigener Eisen-/Kohlemine eine Weile auf Rohstoffe warten (die Schmiede lässt die Reserve liegen), dann Behelf
          if (hasMine(sim, city) && (s.waitRes | 0) < M().COST.waitSteps) { s.waitRes = (s.waitRes | 0) + 1; city.milRes = c.iron; continue; }
          how = 'alt';
          let ok = false;
          for (let ai = 0; ai < altCount(k) && !ok; ai++) { c = costOf(k, pick, ai); ok = canPay(sk, c); }
          if (!ok) continue;
        }
        pay(sk, c);
        s.prod = pick; s.prog = 0; s.pay = how; s.lastPay = how; s.waitRes = 0; city.milRes = 0; p[pick]++;
      }
      const C = M().COST;
      const ws = hasWorkshop(sim, city);
      s.prog = Math.min(1, s.prog + C.step / C[s.prod].work * sp.speedMul * (s.pay === 'alt' ? C.altSpeed : 1) * (ws ? 1 : C.noWorkshop));
      if (s.prog >= 1) {
        const kind = s.prod;
        s.prod = null; s.prog = 0; s.pay = null;
        const u = spawnVehicle(sim, kind, k, s.x + 1.5, s.y + s.h + 0.5, city.id);
        if (!u) { s.prod = kind; s.prog = 0.95; continue; }
        s.made = (s.made | 0) + 1; total++;
        const have = cnt[k.id] || (cnt[k.id] = { tank: 0, artillery: 0 });
        have[kind]++;
        if (!k.milFirst) k.milFirst = {};
        if (!k.milFirst[kind]) {
          k.milFirst[kind] = st.year;
          chron(sim, kind === 'tank' ? 'firstTank' : 'firstGun', { city: city.name, kingdom: k.name }, WW.Cities.atCity(city), kind === 'tank' ? 'Panzer: stark gepanzert, langsam im Gelände' : 'Geschütz: schießt weit, im Nahkampf wehrlos');
        }
      }
    }
  }

  // Fahrzeug erzeugen (Arsenal oder Kraft)
  function spawnVehicle(sim, kind, k, x, y, homeC) {
    const st = sim.state, W = st.W, H = st.H;
    if (KINDS.indexOf(kind) < 0 || !k || !WW.SimUtil.isNum(x) || !WW.SimUtil.isNum(y)) return null;
    const tab = tables(sim);
    const fx0 = Math.max(0, Math.min(W - 1, Math.floor(x))), fy0 = Math.max(0, Math.min(H - 1, Math.floor(y)));
    let tile = -1;
    for (let r = 0; r <= 5 && tile < 0; r++) for (let dy = -r; dy <= r && tile < 0; dy++) for (let dx = -r; dx <= r && tile < 0; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const xx = fx0 + dx, yy = fy0 + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      if (tab.cost[st.terrain[i]] > 0 && tab.speed[st.terrain[i]] >= 0.3 && WW.Path.passable(sim, i, k.id)) tile = i;
    }
    if (tile < 0) return null;
    const city = sim._cities.get(homeC);
    const u = WW.Units.create(sim, { x: (tile % W) + 0.5, y: Math.floor(tile / W) + 0.5, role: kind, kingdomId: k.id, cityId: -1,
      race: (city && city.race) || k.race || 'human', age: 0, female: false, name: ' ' });
    if (!u) return null;
    const T = kind === 'tank' ? M().TANK : M().GUN;
    const sp = govSpec(k.gov);
    u.vehicle = true; u.homeC = city ? city.id : (k.capitalId != null ? k.capitalId : -1);
    u.gov = k.gov; u.simple = !!(kind === 'tank' && sp && sp.simple); u.vdir = 1; u.aim = -1;
    u.maxHp = Math.round(T.hp * (u.simple ? M().SIMPLE.hpMul : 1)); u.hp = u.maxHp;
    u.life = 100000;
    u.name = vehicleName(kind, k.gov, u.id);
    return u;
  }
  function vehicleName(kind, gov, id) {
    const TM = WW.TEXTS_MIL;
    const kn = (TM && TM.KIND_NAME[kind]) || kind;
    const tab = TM && TM.VEHICLE_NAMES[kind];
    const list = tab ? (tab[gov] || tab._) : null;
    if (!list || !list.length) return kn;
    return kn + ' „' + list[Math.floor(hh(id, 911) * list.length)] + '“';
  }

  // ---------------------------------------------------------------------------
  // Fahrzeuge: Bewegung
  // ---------------------------------------------------------------------------
  function face(u, x, y) {
    const dx = x - u.x, dy = y - u.y;
    if (Math.abs(dx) < 0.02 && Math.abs(dy) < 0.02) return;
    if (Math.abs(dx) > 0.02) u.dir = dx < 0 ? -1 : 1;
    u.vdir = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 0 : 2) : (dy >= 0 ? 1 : 3);
  }

  // Pfad anfordern (eigenes Teilbudget wie Heere). true = Pfad da, null = kein Weg, false = später
  function goV(sim, u, goal, breach, limit) {
    const st = sim.state, W = st.W;
    const cur = Math.floor(u.y) * W + Math.floor(u.x);
    if (cur === goal) { u.path = null; u.goal = goal; return true; }
    if (u.path && u.goal === goal && u.pi < u.path.length) return true;
    if (u.nextPath && u.nextPath > st.tick) return false;
    const C = WW.CONFIG;
    // eigenes Teilbudget je Tick (Fahrzeuge nehmen den Heeren nicht die Wegsuche weg)
    if (sim._milT !== st.tick) { sim._milT = st.tick; sim._milUsed = 0; }
    if (sim._milUsed >= C.PATH_BUDGET * M().PATH_SHARE || sim._pathBudget < C.PATH_BUDGET * 0.3) return false;
    tables(sim);
    const b0 = sim._pathBudget;
    const p = WW.Path.find(sim, cur, goal, { k: u.kingdomId, race: 'tank', breach: !!breach && u.role === 'tank', limit: limit || C.PATH_LIMIT_ARMY });
    sim._milUsed += Math.max(0, b0 - sim._pathBudget);
    if (p === false) { u.nextPath = st.tick + 8; return false; }
    if (p === null) {
      u.fails = (u.fails | 0) + 1; u.path = null;
      u.nextPath = st.tick + Math.min(480, 24 << Math.min(4, u.fails));
      return null;
    }
    u.path = p; u.pi = 0; u.goal = goal; u.fails = 0;
    return true;
  }

  function moveV(sim, u) {
    const st = sim.state, W = st.W;
    if (u.x < 0.5 || u.y < 0.5 || u.x > W - 0.5 || u.y > st.H - 0.5) { u.x = WW.SimUtil.clamp(u.x, 0.5, W - 0.5); u.y = WW.SimUtil.clamp(u.y, 0.5, st.H - 0.5); }
    const cur = Math.floor(u.y) * W + Math.floor(u.x);
    if (WW.TERRAIN_LUT.walk[st.terrain[cur]] <= 0 || sim.block[cur] === 1 || (sim.block[cur] === 2 && !WW.Path.passable(sim, cur, u.kingdomId))) {
      WW.Units.rescue(sim, u);
      if (u.dead) return;
    }
    if (!u.path || u.pi >= u.path.length || u.breach >= 0) { u.moving = false; if (u.path && u.pi >= u.path.length) u.path = null; return; }
    const tab = tables(sim);
    const n = u.path[u.pi];
    const nx = n % W, ny = (n - nx) / W;
    const c0 = Math.floor(u.y) * W + Math.floor(u.x);
    if (n !== c0) {
      let ok = WW.Path.passable(sim, n, u.kingdomId) && tab.cost[st.terrain[n]] > 0;
      const cx = c0 % W, cy = (c0 - cx) / W;
      if (ok && nx !== cx && ny !== cy) ok = WW.Path.passable(sim, cy * W + nx, u.kingdomId) && WW.Path.passable(sim, ny * W + cx, u.kingdomId);
      if (!ok) {
        const s = sim._structs.get(st.structAt[n]);
        if (u.role === 'tank' && s && WW.Structs.isWallish(s) && s.built) {
          const c = sim._cities.get(s.cityId);
          if (c && hostileK(sim, u.kingdomId, c.kingdomId)) { u.breach = s.id; u.moving = false; return; }
        }
        u.path = null; u.moving = false;
        return;
      }
    }
    const T = T_(u);
    const spd = T.speed * Math.max(0.1, tab.speed[st.terrain[c0]]);
    const tx = nx + 0.5, ty = ny + 0.5;
    const dx = tx - u.x, dy = ty - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    face(u, tx, ty);
    u.moving = true;
    if (d <= spd) {
      u.x = tx; u.y = ty; u.pi++;
      if (u.pi >= u.path.length) { u.path = null; u.moving = false; }
    } else { u.x += dx / d * spd; u.y += dy / d * spd; }
  }

  // ---------------------------------------------------------------------------
  // Fahrzeuge: Kampf
  // ---------------------------------------------------------------------------
  function isTarget(sim, u, v) {
    if (!WW.Units.hostile(sim, u, v)) return false;
    if (FIGHTER[v.role] || v.foe === u.id) return true;
    const k = sim._kingdoms.get(v.kingdomId);
    return !!(k && (WW.GOVERNMENTS[k.gov] || {}).militia && v.role !== 'child');
  }
  function nearestFoe(sim, u, r) {
    let best = null, bd = 1e9;
    WW.Units.forNear(sim, u.x, u.y, r, false, (v, d2) => {
      if (!isTarget(sim, u, v)) return;
      const w = d2 - (v.vehicle ? 3 : 0) + (FIGHTER[v.role] ? 0 : 6);
      if (w < bd) { bd = w; best = v; }
    });
    return best;
  }

  // Einschlag einer Granate oder eines Panzerschusses: Einheiten, Bauwerke, Krater
  function lvf(s) { return s.level >= 3 ? 0.45 : (s.level === 2 ? 0.6 : 1.3); }
  function impact(sim, att, x, y, dmg, area, wallDmg, crater, skip) {
    const st = sim.state, W = st.W;
    const hit = [];
    WW.Units.forNear(sim, x, y, area, false, (v, d2) => { if (v !== skip && WW.Units.hostile(sim, att, v)) hit.push([v, d2]); });
    for (const h of hit) if (!h[0].dead) WW.Units.hitUnit(sim, att, h[0], dmg * (1 - 0.5 * Math.sqrt(h[1]) / area));
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= W || ty >= st.H) return;
    const i = ty * W + tx;
    const s = sim._structs.get(st.structAt[i]);
    if (s && s.built && wallDmg > 0) {
      const c = sim._cities.get(s.cityId);
      if (c && hostileK(sim, att.kingdomId, c.kingdomId)) {
        const wall = WW.Structs.isWallish(s);
        if (WW.Structs.damage(sim, s, wallDmg * (wall ? lvf(s) : 0.4), null) && wall && c.lastBreach !== st.year) {
          const ak = sim._kingdoms.get(att.kingdomId);
          c.lastBreach = st.year;
          if (ak) sim.event('wallBreach', { city: c.name, other: ak.name }, WW.Cities.atCity(c));
        }
      }
    } else if (crater && !s && WW.TERRAIN_LUT.walk[st.terrain[i]] > 0 && !WW.TERRAIN_LUT.water[st.terrain[i]] && st.mark[i] < 100) {
      const cr = M().CRATER;
      WW.Env.setMark(sim, i, cr[0] + sim.rng.int(cr[1] - cr[0] + 1));
    }
  }

  function fireShell(sim, u, tx, ty, atStruct) {
    const G = M().GUN;
    const sc = G.scatter * (atStruct ? 0.5 : 1);
    const ix = tx + sim.rng.range(-sc, sc), iy = ty + sim.rng.range(-sc, sc);
    face(u, ix, iy);
    const d = dist(u, ix, iy);
    sim.fx({ type: 'muzzle', x: u.x, y: u.y - 0.3, kind: 'artillery' });
    sim.fx({ type: 'shell', x: u.x, y: u.y - 0.3, x0: u.x, y0: u.y - 0.3, x1: ix, y1: iy, t: Math.round(6 + d * 1.5) });
    sim.fx({ type: 'explosion', x: ix, y: iy, r: 1.2, shell: true });
    impact(sim, u, ix, iy, G.dmg, G.area, G.wallDmg, true);
    u.cd = G.reload;
  }

  function tankFight(sim, u) {
    const T = M().TANK, st = sim.state;
    let t = null;
    for (const id of [u.aim, u.foe]) {
      if (t || id == null || id < 0) continue;
      const v = sim._units.get(id);
      if (v && !v.dead && isTarget(sim, u, v) && dist(u, v.x, v.y) <= T.sight) t = v;
    }
    if (!t) t = nearestFoe(sim, u, T.sight);
    if (!t) { u.aim = -1; return false; }
    u.aim = t.id;
    const d = dist(u, t.x, t.y);
    if (d <= T.range) {
      u.path = null; u.moving = false;
      face(u, t.x, t.y);
      if (u.cd <= 0) {
        const dmg = T.dmg * (u.simple ? M().SIMPLE.dmgMul : 1);
        sim.fx({ type: 'tankfire', x: u.x, y: u.y - 0.25, x2: t.x, y2: t.y - 0.2, dir: u.vdir });
        sim.fx({ type: 'muzzle', x: u.x, y: u.y - 0.25, kind: 'tank' });
        WW.Units.hitUnit(sim, u, t, dmg);
        impact(sim, u, t.x, t.y, dmg * 0.5, T.splash, 0, false, t);
        u.cd = T.reload;
      }
      return true;
    }
    // hinter einem fremden Mauerring nicht nachsetzen (das macht der Marsch)
    const W = st.W, ti = Math.floor(t.y) * W + Math.floor(t.x);
    if (st.inRing[ti] !== -1 && st.inRing[ti] !== st.inRing[Math.floor(u.y) * W + Math.floor(u.x)]) { u.aim = -1; return false; }
    const r = goV(sim, u, ti, false, 400);
    if (r === null) { u.aim = -1; return false; }
    return true;
  }

  function gunFight(sim, u) {
    const G = M().GUN;
    // Nahkampf: wehrlos – abrücken
    let close = null, cd = 1e9;
    WW.Units.forNear(sim, u.x, u.y, G.melee, false, (v, d2) => { if (d2 < cd && FIGHTER[v.role] && WW.Units.hostile(sim, u, v)) { cd = d2; close = v; } });
    if (close) {
      u.aim = -1;
      const st = sim.state, W = st.W;
      const dx = u.x - close.x, dy = u.y - close.y, dd = Math.sqrt(dx * dx + dy * dy) || 1;
      const gx = Math.max(0, Math.min(W - 1, Math.floor(u.x + dx / dd * 4))), gy = Math.max(0, Math.min(st.H - 1, Math.floor(u.y + dy / dd * 4)));
      const g = WW.Path.nearestFree(sim, gy * W + gx, u.kingdomId, 3);
      if (g >= 0 && (!u.path || u.goal !== g)) { u.path = null; goV(sim, u, g, false, 200); }
      if (sim.rng.chance(0.15)) WW.Units.bubble(u, 'exclaim', 20);
      return true;
    }
    // Ziel: Gruppe in Reichweite bevorzugt
    const min2 = G.minRange * G.minRange;
    const cand = [];
    WW.Units.forNear(sim, u.x, u.y, G.range, false, (v, d2) => {
      if (d2 < min2 || cand.length >= 24 || !isTarget(sim, u, v)) return;
      cand.push([v, d2]);
    });
    if (!cand.length) { u.aim = -1; return false; }
    let best = null, bs = -1e9;
    const a2 = G.area * G.area;
    for (const c of cand) {
      let n = 0;
      for (const o of cand) { const dx = o[0].x - c[0].x, dy = o[0].y - c[0].y; if (dx * dx + dy * dy <= a2) n++; }
      const sc = n * 4 - c[1] * 0.02 + (c[0].vehicle ? 3 : 0);
      if (sc > bs) { bs = sc; best = c[0]; }
    }
    u.aim = best.id; u.path = null; u.moving = false;
    face(u, best.x, best.y);
    if (u.cd <= 0) fireShell(sim, u, best.x, best.y, false);
    return true;
  }

  function breachWall(sim, u) {
    const st = sim.state, T = M().TANK;
    const s = sim._structs.get(u.breach);
    const c = s && sim._cities.get(s.cityId);
    if (!s || s.dead || !s.built || !WW.Structs.isWallish(s) || !c || !hostileK(sim, u.kingdomId, c.kingdomId) || dist(u, s.x + 0.5, s.y + 0.5) > 1.9) {
      u.breach = -1; u.path = null; return false;
    }
    face(u, s.x + 0.5, s.y + 0.5);
    if (u.cd <= 0) {
      const dmg = s.mat === 'barricade' ? s.hp + 1 : T.wallDmg * lvf(s) * (u.simple ? M().SIMPLE.dmgMul : 1);   // Barrikaden werden überrollt
      sim.fx({ type: 'tankfire', x: u.x, y: u.y - 0.25, x2: s.x + 0.5, y2: s.y + 0.5, dir: u.vdir });
      if (WW.Structs.damage(sim, s, dmg, 'hit')) {
        const k = sim._kingdoms.get(u.kingdomId);
        if (k && c.milBreachY !== st.year) { c.milBreachY = st.year; chron(sim, 'tankBreach', { city: c.name, kingdom: k.name }, WW.Cities.atCity(c), 'Panzer brechen Mauerstücke'); }
        u.breach = -1; u.path = null;
      }
      u.cd = T.wallCd;
    }
    return true;
  }

  // Marsch auf eine feindliche Stadt
  function marchV(sim, u, o) {
    const st = sim.state;
    const tc = sim._cities.get(o.city);
    if (!tc || tc.kingdomId !== o.k || !hostileK(sim, u.kingdomId, o.k)) { u.order = null; u.path = null; u.breach = -1; return; }
    const d = dist(u, tc.cx + 0.5, tc.cy + 0.5);
    let r;
    if (u.role === 'artillery') {
      const G = M().GUN;
      let best = null, bd = 1e9;
      for (const t of (tc.wall && tc.wall.plan) || []) {
        const s = sim._structs.get(st.structAt[t]);
        if (!s || !s.built || !WW.Structs.isWallish(s) || s.cityId !== tc.id) continue;
        const dd = dist(u, s.x + 0.5, s.y + 0.5) + (s.type === 'tower' ? -1.5 : 0) + (s.type === 'gate' ? -0.5 : 0);
        if (dd < bd) { bd = dd; best = s; }
      }
      if (best && bd <= G.range) { u.path = null; u.moving = false; if (u.cd <= 0) fireShell(sim, u, best.x + 0.5, best.y + 0.5, true); return; }
      if (!best && d <= G.range - 1) {
        const ctr = sim._structs.get(tc.centerId);
        u.path = null; u.moving = false;
        if (ctr && ctr.built && u.cd <= 0) fireShell(sim, u, ctr.x + ctr.w / 2, ctr.y + ctr.h / 2, true);
        return;
      }
      r = goV(sim, u, WW.Cities.centerTile(sim, tc, u.id), false);
    } else {
      if (d <= 2.8) {
        u.path = null;
        const ctr = sim._structs.get(tc.centerId);
        if (ctr && ctr.built) { if (u.cd <= 0) { face(u, tc.cx + 0.5, tc.cy + 0.5); WW.Structs.damage(sim, ctr, M().TANK.centerDmg, 'hit'); u.cd = M().TANK.reload; } }
        if (!ctr || !ctr.built) WW.Diplo.tryCapture(sim, tc, u.kingdomId);
        return;
      }
      r = goV(sim, u, WW.Cities.centerTile(sim, tc, u.id), true);
    }
    if (r === null && u.fails > 3) { u.order = null; u.fails = 0; }
  }

  function think(sim, u) {
    const st = sim.state;
    if (u.bubble && --u.bubble.ttl <= 0) u.bubble = null;
    const k = sim._kingdoms.get(u.kingdomId);
    if (!k || !k.cityIds.length) { WW.Units.kill(sim, u, 'gone'); return; }
    if (u.cityId >= 0) { u.homeC = u.cityId; u.cityId = -1; }
    let home = sim._cities.get(u.homeC);
    if (!home || home.kingdomId !== k.id) { home = sim._cities.get(k.capitalId) || sim._cities.get(k.cityIds[0]); u.homeC = home ? home.id : -1; }
    if (!home) return;
    const tank = u.role === 'tank';
    if (sim._hostileWorld !== false) { if (tank ? tankFight(sim, u) : gunFight(sim, u)) return; }
    else u.aim = -1;
    if (u.breach >= 0) { if (tank && breachWall(sim, u)) return; u.breach = -1; }
    const o = u.order;
    if (o && o.kind === 'march') { marchV(sim, u, o); return; }
    const dh = dist(u, home.cx + 0.5, home.cy + 0.5);
    if (o && o.kind === 'home') {
      if (dh < 7) { u.order = null; u.path = null; return; }
      const r = goV(sim, u, WW.Cities.centerTile(sim, home, u.id), false, WW.CONFIG.PATH_LIMIT_LONG);
      if (r === null && u.fails > 3) { u.order = null; u.fails = 0; }
      return;
    }
    // im Krieg dem eigenen Heer folgen (Verteidiger und ein Teil der Geschütze bleiben daheim)
    const m = st.mil.march[k.id];
    if (m && m.n >= 3 && u.garrison == null) {
      const sp = govSpec(k.gov) || {};
      const stay = sp.defensive || (!tank && hh(u.id, 77) < 0.3);
      const tc = sim._cities.get(m.city);
      if (!stay && tc && tc.kingdomId === m.k && hostileK(sim, k.id, m.k)) {
        u.order = { kind: 'march', city: m.city, k: m.k }; u.path = null; u.fails = 0; u.breach = -1;
        return;
      }
    }
    // parken und langsam instand setzen
    if (dh > 9) { goV(sim, u, WW.Cities.centerTile(sim, home, u.id), false, WW.CONFIG.PATH_LIMIT_LONG); return; }
    if (u.hp < u.maxHp && !u.moving) u.hp = Math.min(u.maxHp, u.hp + T_(u).heal);
  }

  // Haken aus units.js updateAll: true = Einheit ist hier erledigt
  function unit(sim, u) {
    if (u.cd > 0) u.cd--;
    if (((sim.state.tick + u.id) & 7) === 0) { think(sim, u); if (u.dead) return true; }
    moveV(sim, u);
    return true;
  }

  // Haken aus units.js hitUnit: Panzerung der Fahrzeuge, Deckung im Graben
  function armor(sim, att, t, dmg) {
    const st = sim.state;
    if (t.vehicle) {
      const T = T_(t);
      let m;
      if (att && att.vehicle) m = att.role === 'artillery' ? T.gunMul : T.tankMul;
      else if (att && att.id === -1 && att.kingdomId >= 0) m = dmg >= T.devHeavyMin ? T.devHeavy : T.devLight;   // Mauergerät
      else m = T.armor * (t.simple ? M().SIMPLE.armorMul : 1);
      return dmg * m;
    }
    if (att && att.vehicle && (t.role === 'ram' || t.role === 'catapult')) dmg *= M().ENGINE_MUL;   // Belagerungsgerät ist zäh: Belagerungen bleiben möglich
    const mil = st.mil;
    if (mil && mil.trenchN > 0 && st.trench) {
      const tx = Math.floor(t.x), ty = Math.floor(t.y);
      if (tx >= 0 && ty >= 0 && tx < st.W && ty < st.H && st.trench[ty * st.W + tx] >= M().TRENCH.cover) {
        const ranged = !att || att.vehicle || att.id === -1 || (WW.SimUtil.isNum(att.x) && dist(t, att.x, att.y) > 2);
        return dmg * (ranged ? M().TRENCH.coverRanged : M().TRENCH.coverMelee);
      }
    }
    return dmg;
  }

  // Haken aus units.js kill: Wrack, Verluste der laufenden Schlacht
  function onKill(sim, u, cause) {
    const st = sim.state;
    if (!st.mil) return;
    if (u.vehicle) {
      const kind = u.role === 'tank' ? 'tank' : 'gun';
      st.wrecks.push({ id: ++st.mil.seq, x: Math.round(u.x * 10) / 10, y: Math.round(u.y * 10) / 10, kind: kind, year: st.year, gov: u.gov || null, k: u.kingdomId, rust: 0 });
      if (st.wrecks.length > M().MAX_WRECKS) st.wrecks.splice(0, st.wrecks.length - M().MAX_WRECKS);
      sim.fx({ type: 'wreck', x: u.x, y: u.y, kind: kind });
      if (cause === 'battle') sim.fx({ type: 'explosion', x: u.x, y: u.y, r: 1.6 });
    }
    if (st.battles.length && FIGHTER[u.role] && u.garrison == null) {
      for (const b of st.battles) {
        const dx = u.x - b.x, dy = u.y - b.y;
        if (dx * dx + dy * dy > (b.r + 3) * (b.r + 3)) continue;
        const sd = sideOf(sim, b, u.kingdomId);
        if (sd === 1) b.lossA++; else if (sd === 2) b.lossB++;
        if (sd) break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Schlachten
  // ---------------------------------------------------------------------------
  // Vorfeld einer Stadt (Ringradius bzw. Kernbebauung + BATTLE.siegeMargin): dort wird belagert/angegriffen, nicht im Feld geschlagen
  function siegeZone(sim, x, y) {
    const m = M().BATTLE.siegeMargin;
    for (const c of sim.state.cities) {
      // ummauert: Ringradius aus der Innenfläche; offene Stadt: Kernbebauung (6 + Stufe) – Angriff auf die Stadt ist keine Feldschlacht
      const r = (c.wall && c.wall.level >= 1 && c.wall.inside ? Math.sqrt(c.wall.inside / 3.14) : 6 + (c.tier | 0)) + m;
      const dx = x - c.cx - 0.5, dy = y - c.cy - 0.5;
      if (dx * dx + dy * dy <= r * r) return true;
    }
    return false;
  }
  function sideOf(sim, b, kid) {
    if (kid === b.a) return 1;
    if (kid === b.b) return 2;
    if (kid < 0) return 0;
    if (WW.Path.friendly(sim, kid, b.a) && hostileK(sim, kid, b.b)) return 1;
    if (WW.Path.friendly(sim, kid, b.b) && hostileK(sim, kid, b.a)) return 2;
    return 0;
  }
  function anyWar(st) {
    for (const k of st.kingdoms) for (const o in k.relations) if (k.relations[o].status === 'war') return true;
    return false;
  }
  function battleAt(sim, x, y) {
    for (const b of sim.state.battles) { const dx = x - b.x, dy = y - b.y; if (dx * dx + dy * dy <= b.r * b.r) return b; }
    return null;
  }
  function siteAt(sim, x, y) {
    let best = null, bd = 1e9;
    for (const s of sim.state.sites) { const dx = x - s.x, dy = y - s.y, d = dx * dx + dy * dy; if (d <= s.r * s.r && d < bd) { bd = d; best = s; } }
    return best;
  }

  // Ort für den Namen: nächste Stadt oder Gelände
  // Mögliche Ortsangaben für den Namen (der Reihe nach): Stadt, Fluss, Gelände vor der Stadt, Jahr
  function placeOptions(sim, x, y) {
    const st = sim.state, W = st.W, H = st.H;
    let best = null, bd = M().SITE_NEAR_CITY * M().SITE_NEAR_CITY;
    for (const c of st.cities) { const d = (c.cx - x) * (c.cx - x) + (c.cy - y) * (c.cy - y); if (d < bd) { bd = d; best = c; } }
    const tx = Math.max(0, Math.min(W - 1, Math.floor(x))), ty = Math.max(0, Math.min(H - 1, Math.floor(y)));
    const TM = WW.TEXTS_MIL || {}, TP = TM.TERRAIN_PHRASE || {};
    // häufigstes Gelände im Umkreis 4 (ein einzelner Baum macht noch keinen Wald), Fluss in der Nähe
    const cnt = {};
    let river = false;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const xx = tx + dx, yy = ty + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const t = st.terrain[yy * W + xx];
      if (t === WW.T.RIVER) river = true;
      const k = WW.TERRAIN[t].key;
      if (TP[k] && k !== 'river') cnt[k] = (cnt[k] || 0) + 1;
    }
    let key = null, kn = 0;
    for (const k in cnt) if (cnt[k] > kn) { kn = cnt[k]; key = k; }
    const terr = (key && TP[key]) || 'im Niemandsland';
    const out = [];
    if (best) {
      out.push('bei ' + best.name);
      if (river) out.push('am Fluss bei ' + best.name);
      out.push(terr + ' vor ' + best.name);
      if (river) out.push('an der Furt von ' + best.name);
      out.push('bei ' + best.name + ' im Jahr ' + st.year);
    } else {
      // die beiden nächsten Städte (bis 60 Kacheln) für „zwischen X und Y"
      const near = st.cities.map((c) => [c, (c.cx - x) * (c.cx - x) + (c.cy - y) * (c.cy - y)]).filter((p) => p[1] <= 3600)
        .sort((p, q) => p[1] - q[1] || p[0].id - q[0].id);
      const betw = near.length >= 2 ? 'zwischen ' + near[0][0].name + ' und ' + near[1][0].name : null;
      out.push(terr);
      if (betw) out.push(betw);
      if (river) out.push('am Fluss');
      if (betw) out.push(terr + ' ' + betw);
      out.push(terr + ' im Jahr ' + st.year);
    }
    return out;
  }
  function placeOf(sim, x, y) { return placeOptions(sim, x, y)[0]; }
  // Name einer neuen Schlacht: erste noch freie Ortsangabe; erst wenn alle vergeben sind, mit Zählwort
  function battleName(sim, x, y) {
    const used = new Set();
    for (const s of sim.state.sites) used.add(s.base);
    for (const b of sim.state.battles) used.add(b.base);
    const opts = placeOptions(sim, x, y);
    for (const p of opts) if (!used.has('Schlacht ' + p)) return { base: 'Schlacht ' + p, name: 'Schlacht ' + p, place: p };
    const p = opts[0], base = 'Schlacht ' + p;
    let n = 1;
    for (const s of sim.state.sites) if (s.base === base) n++;
    for (const b of sim.state.battles) if (b.base === base) n++;
    const O = (WW.TEXTS_MIL && WW.TEXTS_MIL.ORDINAL) || [];
    return { base: base, name: (O[n] || (n + '.')) + ' ' + base, place: p };
  }

  // Marschgruppen: Abfangen, Ausfall der Verteidiger, Marschziel für Fahrzeuge (alle 20 Ticks im Krieg)
  function armies(sim) {
    const st = sim.state, B = M().BATTLE;
    const groups = new Map(), idleByCity = new Map(), engaged = [];
    for (const u of st.units) {
      if (u.dead || !FIGHTER[u.role] || u.role === 'rebel' || u.garrison != null) continue;   // Garnison bleibt bei ihrer Stadt
      if ((u.foe >= 0 && !u.vehicle) || (u.vehicle && u.aim >= 0)) engaged.push(u);
      const o = u.order;
      if (o && o.kind === 'march') {
        const key = u.kingdomId + '>' + o.k;
        let g = groups.get(key);
        if (!g) { g = { kid: u.kingdomId, ek: o.k, n: 0, sx: 0, sy: 0, list: [], cities: new Map() }; groups.set(key, g); }
        g.n++; g.sx += u.x; g.sy += u.y; g.list.push(u);
        if (u.role === 'soldier') g.cities.set(o.city, (g.cities.get(o.city) || 0) + 1);
      } else if (u.role === 'soldier' && !o && !u.merc && u.cityId >= 0) {
        let l = idleByCity.get(u.cityId);
        if (!l) { l = []; idleByCity.set(u.cityId, l); }
        l.push(u);
      }
    }
    // Marschziel je Reich (größte Gruppe) für Fahrzeuge
    const march = {};
    const gl = [];
    for (const g of groups.values()) {
      g.x = g.sx / g.n; g.y = g.sy / g.n;
      let city = -1, cn = 0;
      for (const [cid, n] of g.cities) if (n > cn) { cn = n; city = cid; }
      g.city = city; g.soldiers = cn;
      if (city >= 0 && (!march[g.kid] || march[g.kid].n < cn)) march[g.kid] = { city: city, k: g.ek, n: cn };
      gl.push(g);
    }
    st.mil.march = march;
    const W = st.W;
    const outside = (x, y) => { const i = Math.floor(y) * W + Math.floor(x); return i >= 0 && i < st.inRing.length && st.inRing[i] === -1; };
    // Abfangen: verfeindete Marschgruppen in der Nähe binden einander
    let budget = 120;
    const engage = (list) => {
      for (const u of list) {
        if (budget <= 0) return;
        if (u.vehicle || u.foe >= 0 || u.role !== 'soldier') continue;
        budget--;
        let best = null, bd = B.engageR * B.engageR;
        WW.Units.forNear(sim, u.x, u.y, B.engageR, false, (v, d2) => { if (d2 < bd && FIGHTER[v.role] && outside(v.x, v.y) && WW.Units.hostile(sim, u, v)) { bd = d2; best = v; } });   // nie hinter eine Mauer locken
        if (best) { u.foe = best.id; u.path = null; }
      }
    };
    for (let i = 0; i < gl.length; i++) for (let j = i + 1; j < gl.length; j++) {
      const g1 = gl[i], g2 = gl[j];
      if (!hostileK(sim, g1.kid, g2.kid)) continue;
      const dx = g1.x - g2.x, dy = g1.y - g2.y;
      if (dx * dx + dy * dy > B.interceptR * B.interceptR) continue;
      if (!outside(g1.x, g1.y) || !outside(g2.x, g2.y) || siegeZone(sim, g1.x, g1.y) || siegeZone(sim, g2.x, g2.y)) continue;
      engage(g1.list); engage(g2.list);
    }
    // Ausfall: Heer nähert sich einer Stadt -> deren freie Soldaten ziehen ihm ins Feld entgegen
    for (const g of gl) {
      if (g.soldiers < 4 || !outside(g.x, g.y)) continue;
      const tc = sim._cities.get(g.city);
      if (!tc || tc.kingdomId !== g.ek) continue;
      const dx = g.x - tc.cx, dy = g.y - tc.cy;
      if (dx * dx + dy * dy > B.sortieR * B.sortieR) continue;
      if (tc.milSortie != null && st.year - tc.milSortie < B.sortieYears) continue;
      const dk = sim._kingdoms.get(tc.kingdomId), ak = sim._kingdoms.get(g.kid);
      if (!dk || !ak || !(WW.GOVERNMENTS[dk.gov].soldierShare > 0)) continue;
      const idle = idleByCity.get(tc.id) || [];
      if (idle.length < 3 || idle.length < g.soldiers * 0.5) continue;
      const pair = WW.Diplo.nearestCities(sim, dk, ak);
      if (!pair) continue;
      tc.milSortie = st.year;
      const send = Math.min(idle.length - Math.floor(idle.length / 4), Math.ceil(g.soldiers * 1.3));
      idle.sort((a, b) => (Math.abs(a.x - g.x) + Math.abs(a.y - g.y)) - (Math.abs(b.x - g.x) + Math.abs(b.y - g.y)) || a.id - b.id);
      for (let n = 0; n < send; n++) {
        const u = idle[n];
        u.order = { kind: 'march', city: pair.b.id, k: ak.id }; u.path = null; u.wait = 0; u.breach = -1; u.fails = 0;
      }
      idleByCity.set(tc.id, idle.slice(send));
    }
    return engaged;
  }

  // Feldschlacht erkennen (außerhalb der Ringe und ihres Vorfelds)
  function detect(sim, engaged) {
    const st = sim.state, B = M().BATTLE, W = st.W;
    let tries = 0;
    for (const u of engaged) {
      if (tries >= 40) break;
      if (u.dead) continue;
      const f = sim._units.get(u.vehicle ? u.aim : u.foe);
      if (!f || f.dead) continue;
      const cx = (u.x + f.x) / 2, cy = (u.y + f.y) / 2;
      if (battleAt(sim, cx, cy)) continue;
      let near = false;
      for (const b of st.battles) { const dx = cx - b.x, dy = cy - b.y; if (dx * dx + dy * dy <= (b.r + B.r) * (b.r + B.r) * 0.5) { near = true; break; } }
      if (near) continue;
      tries++;
      const i = Math.floor(cy) * W + Math.floor(cx);
      if (st.inRing[i] !== -1 || siegeZone(sim, cx, cy)) continue;   // Kampf an der Mauer ist Belagerung, keine Feldschlacht
      const tmp = { a: u.kingdomId, b: f.kingdomId };
      if (!hostileK(sim, tmp.a, tmp.b)) continue;
      let nA = 0, nB = 0, mA = 0, mB = 0;
      WW.Units.forNear(sim, cx, cy, B.r, false, (v) => {
        if (!FIGHTER[v.role] || v.role === 'rebel' || v.garrison != null) return;
        const sd = sideOf(sim, tmp, v.kingdomId);
        const m = v.order && v.order.kind === 'march' ? 1 : 0;
        if (sd === 1) { nA++; mA += m; } else if (sd === 2) { nB++; mB += m; }
      });
      if (nA < B.sideMin || nB < B.sideMin || nA + nB < B.min) continue;
      // Angreifer: wer marschiert; Verteidiger (gräbt sich ein): wem das Land gehört, sonst wer weniger marschiert
      let a = tmp.a, b = tmp.b, na = nA, nb = nB;
      const oc = sim._cities.get(st.owner[i]);
      const swap = oc ? oc.kingdomId === a : (mB > mA);
      if (swap) { a = tmp.b; b = tmp.a; na = nB; nb = nA; }
      const nm = battleName(sim, cx, cy);
      const place = nm.place;
      const bt = { id: ++st.mil.seq, x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10, r: B.r, a: a, b: b, start: st.tick, year: st.year,
        lossA: 0, lossB: 0, nA: na, nB: nb, peakA: na, peakB: nb, vA: 0, vB: 0, state: 'fight', breaker: -1, pows: 0, gaveUp: 0, quiet: 0, dig: b,
        name: nm.name, base: nm.base, place: place };
      st.battles.push(bt);
      const ka = sim._kingdoms.get(a), kb = sim._kingdoms.get(b);
      chron(sim, 'battleStart', { kingdom: ka ? ka.name : '', other: kb ? kb.name : '', name: bt.name, Name: capFirst(bt.name), place: place, Place: capFirst(place) },
        { kingdomId: a, cityId: oc ? oc.id : -1, x: bt.x, y: bt.y }, 'Feldschlacht: ' + (na + nb) + ' Kämpfer');
    }
  }

  function dig(sim, i) {
    const st = sim.state, TR = M().TRENCH;
    const v = st.trench[i], nv = Math.min(255, v + TR.dig);
    if (nv === v) return false;
    st.trench[i] = nv;
    if (v === 0) st.mil.trenchN++;
    if (v === 0 || (v >> 6) !== (nv >> 6)) sim.markDirty(i);
    return v === 0;
  }

  function updateBattle(sim, b) {
    const st = sim.state, B = M().BATTLE, W = st.W;
    const ka = sim._kingdoms.get(b.a), kb = sim._kingdoms.get(b.b);
    if (!ka || !kb || !hostileK(sim, b.a, b.b) || siegeZone(sim, b.x, b.y)) { finish(sim, b); return; }
    const memA = [], memB = [];
    let sx = 0, sy = 0;
    WW.Units.forNear(sim, b.x, b.y, b.r + 3, false, (v) => {
      if (!FIGHTER[v.role] || v.role === 'rebel' || v.garrison != null) return;
      const sd = sideOf(sim, b, v.kingdomId);
      if (sd === 1) memA.push(v); else if (sd === 2) memB.push(v); else return;
      sx += v.x; sy += v.y;
    });
    const nA = memA.length, nB = memB.length, n = nA + nB;
    b.nA = nA; b.nB = nB;
    let vA = 0, vB = 0;
    for (const v of memA) if (v.vehicle) vA++;
    for (const v of memB) if (v.vehicle) vB++;
    b.vA = Math.max(b.vA | 0, vA); b.vB = Math.max(b.vB | 0, vB);
    if (b.state === 'fight') { b.peakA = Math.max(b.peakA, nA); b.peakB = Math.max(b.peakB, nB); }
    if (n > 0) {
      b.x = Math.round((b.x * 0.6 + sx / n * 0.4) * 10) / 10; b.y = Math.round((b.y * 0.6 + sy / n * 0.4) * 10) / 10;
      b.r = Math.min(B.rMax, Math.round((B.r + n / 8) * 10) / 10);
    }
    if (b.state === 'fight' && nA && nB) {
      // Kämpfer binden: wer frei ist, sucht sich im Schlachtfeld einen Gegner
      let budget = 60;
      for (const list of [memA, memB]) for (const u of list) {
        if (budget <= 0 || u.vehicle || u.foe >= 0 || u.role !== 'soldier') continue;
        if (u.order && u.order.kind === 'home') continue;
        budget--;
        const other = list === memA ? memB : memA;
        let best = null, bd = 1e9;
        for (const v of other) { const dx = v.x - u.x, dy = v.y - u.y, d2 = dx * dx + dy * dy; if (d2 < bd && d2 <= 144) { bd = d2; best = v; } }
        if (best) { u.foe = best.id; u.path = null; }
      }
      // Verteidiger graben sich ein (wer steht, gräbt)
      const dl = b.dig === b.a ? memA : memB;
      let fx = false;
      for (const u of dl) {
        if (u.role !== 'soldier' || u.moving) continue;
        const i = Math.floor(u.y) * W + Math.floor(u.x);
        if (st.structAt[i] !== -1 || st.inRing[i] !== -1 || WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0 || WW.TERRAIN_LUT.water[st.terrain[i]]) continue;
        if (dig(sim, i) && !fx) { fx = true; sim.fx({ type: 'dig', x: u.x, y: u.y }); }
      }
      // Moral: wer deutlich verliert, weicht oder ergibt sich
      if (st.tick - b.start >= B.minTicks) {
        for (const sd of [1, 2]) {
          const my = sd === 1 ? nA : nB, op = sd === 1 ? nB : nA, peak = sd === 1 ? b.peakA : b.peakB;
          if (my > Math.max(1, peak * B.breakAt) || op < Math.max(2, my * B.ratio)) continue;
          const list = sd === 1 ? memA : memB;
          if (op >= my * B.surrenderRatio && sim.rng.chance(0.6)) surrender(sim, b, sd, list);
          else retreat(sim, b, sd, list);
          break;
        }
      }
    }
    if (nA === 0 || nB === 0) b.quiet++; else b.quiet = 0;
    if (b.quiet >= B.quiet || st.tick - b.start > B.maxTicks) finish(sim, b);
  }

  function sideK(b, sd) { return sd === 1 ? b.a : b.b; }
  function retreat(sim, b, sd, list) {
    b.state = 'retreat'; b.breaker = sideK(b, sd);
    for (const u of list) {
      u.order = { kind: 'home' }; u.foe = -1; u.path = null; u.breach = -1;
      if (u.vehicle) u.aim = -1;
      else if (sim.rng.chance(0.3)) WW.Units.bubble(u, 'exclaim', 30);
    }
    const lk = sim._kingdoms.get(b.breaker);
    chron(sim, 'battleRetreat', { loser: lk ? lk.name : '', name: b.name, Name: capFirst(b.name), place: b.place, Place: capFirst(b.place) }, { kingdomId: b.breaker, cityId: -1, x: b.x, y: b.y }, 'Rückzug');
  }
  function surrender(sim, b, sd, list) {
    const st = sim.state;
    b.state = 'surrender'; b.breaker = sideK(b, sd);
    const wk = sim._kingdoms.get(sideK(b, sd === 1 ? 2 : 1));
    if (!wk) { retreat(sim, b, sd, list); return; }
    const soldiers = list.filter((u) => !u.vehicle && !u.dead);
    if (soldiers.length < 2) { retreat(sim, b, sd, list); return; }
    let caught = 0;
    if (WW.Camps && typeof WW.Camps.surrender === 'function') caught = WW.Camps.surrender(sim, wk.id, soldiers, b) | 0;
    else if (WW.Camps && typeof WW.Camps.capture === 'function') {
      const att = { id: -1, kingdomId: wk.id };
      for (const u of soldiers) if (WW.Camps.capture(sim, att, u, { surrender: true })) caught++;   // ohne Zufall/Unterzahl-Prüfung
    }
    for (const u of soldiers) if (!u.dead && u.role !== 'prisoner') {
      // nicht gefangen genommen: legt die Waffen nieder und geht heim (greift nicht an, wird nicht angegriffen)
      u.order = { kind: 'home' }; u.foe = -1; u.path = null; u.breach = -1; u.parole = st.tick + M().BATTLE.paroleTicks;
      WW.Units.bubble(u, 'question', 40);
    }
    // Fahrzeuge werden erbeutet
    let near = null, nd = 1e9;
    for (const id of wk.cityIds) { const c = sim._cities.get(id); if (c) { const d = Math.abs(c.cx - b.x) + Math.abs(c.cy - b.y); if (d < nd) { nd = d; near = c; } } }
    for (const u of list) if (u.vehicle && !u.dead) {
      u.kingdomId = wk.id; u.homeC = near ? near.id : -1; u.order = null; u.aim = -1; u.path = null; u.breach = -1;
    }
    b.pows += caught; b.gaveUp += soldiers.length;
    const lk = sim._kingdoms.get(b.breaker);
    chron(sim, 'battleSurrender', { loser: lk ? lk.name : '', winner: wk.name, pows: soldiers.length, name: b.name, Name: capFirst(b.name), place: b.place, Place: capFirst(b.place) },
      { kingdomId: b.breaker, cityId: -1, x: b.x, y: b.y }, caught ? caught + ' Kriegsgefangene' : 'Waffen niedergelegt');
  }

  function finish(sim, b) {
    const st = sim.state, B = M().BATTLE;
    const ix = st.battles.indexOf(b);
    if (ix >= 0) st.battles.splice(ix, 1);
    let winner = -1;
    if (b.breaker >= 0) winner = b.breaker === b.a ? b.b : b.a;
    else if (b.nA > 0 && b.nB === 0) winner = b.a;
    else if (b.nB > 0 && b.nA === 0) winner = b.b;
    else if (b.nA >= b.nB * 1.5 && b.nA > 0) winner = b.a;
    else if (b.nB >= b.nA * 1.5 && b.nB > 0) winner = b.b;
    const how = b.state === 'surrender' ? 'surrender' : (b.breaker >= 0 ? 'retreat' : (winner >= 0 ? 'win' : 'draw'));
    if (b.lossA + b.lossB + b.pows + b.gaveUp < B.minLosses) return;   // Geplänkel: kein Schlachtfeld
    const ka = sim._kingdoms.get(b.a), kb = sim._kingdoms.get(b.b);
    const aName = ka ? ka.name : '?', bName = kb ? kb.name : '?';
    const site = { id: ++st.mil.seq, kind: 'battlefield', name: b.name, base: b.base, x: b.x, y: b.y, r: Math.round(b.r), year: st.year,
      a: b.a, b: b.b, aName: aName, bName: bName, winner: winner, losses: { a: b.lossA, b: b.lossB }, pows: b.pows, how: how,
      vehicles: { a: b.vA | 0, b: b.vB | 0 } };
    st.sites.push(site);
    if (st.sites.length > M().MAX_SITES) st.sites.splice(0, st.sites.length - M().MAX_SITES);
    // Kriegsmüdigkeit: Schlachten zehren
    const w = 6 + (b.lossA + b.lossB) * 0.6;
    if (ka && ka.relations[b.b]) ka.relations[b.b].weariness += w;
    if (kb && kb.relations[b.a]) kb.relations[b.a].weariness += w;
    const wA = winner === b.a || winner < 0;
    const v = { winner: wA ? aName : bName, loser: wA ? bName : aName, lossW: wA ? b.lossA : b.lossB, lossL: wA ? b.lossB : b.lossA, pows: b.pows, n: b.gaveUp };
    const OUT = (WW.TEXTS_MIL && WW.TEXTS_MIL.OUTCOME[how === 'surrender' && !b.pows ? 'parole' : how]) || ['{winner} gewinnt.'];
    const outcome = fmt(OUT[Math.floor(hh(site.id, st.tick) * OUT.length)], v);
    const ev = chron(sim, 'battle', Object.assign({ name: b.name, Name: capFirst(b.name), place: b.place, Place: capFirst(b.place), outcome: outcome,
      kingdom: aName, other: bName, loss: b.lossA + b.lossB }, v), { kingdomId: winner >= 0 ? winner : b.a, cityId: -1, x: b.x, y: b.y },
      'Schlachtfeld: ' + (b.lossA + b.lossB) + ' Ausfälle' + (b.pows ? ', ' + b.pows + ' Gefangene' : ''));
    if (ev) { ev.popup = 'battle'; ev.siteId = site.id; ev.important = true; }
  }

  function battles(sim) {
    const st = sim.state;
    const war = anyWar(st);
    if (!war) { if (Object.keys(st.mil.march).length) st.mil.march = {}; if (!st.battles.length) return; }
    if (war) detect(sim, armies(sim));
    for (const b of st.battles.slice()) updateBattle(sim, b);
    merge(sim);
  }
  // Überlappende Schlachten derselben Gegner werden eine (die ältere bleibt)
  function merge(sim) {
    const L = sim.state.battles;
    for (let i = 0; i < L.length; i++) for (let j = L.length - 1; j > i; j--) {
      const p = L[i], q = L[j];
      if (!((p.a === q.a && p.b === q.b) || (p.a === q.b && p.b === q.a))) continue;
      const dx = p.x - q.x, dy = p.y - q.y, rr = Math.max(p.r, q.r) + 4;
      if (dx * dx + dy * dy > rr * rr) continue;
      const same = p.a === q.a;
      p.lossA += same ? q.lossA : q.lossB; p.lossB += same ? q.lossB : q.lossA;
      p.pows += q.pows; p.gaveUp += q.gaveUp;
      if (p.breaker < 0 && q.breaker >= 0) { p.breaker = q.breaker; p.state = q.state; }
      L.splice(j, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Jährlich: Arsenale planen, Gräben wachsen zu, Wracks rosten
  // ---------------------------------------------------------------------------
  function yearly(sim) {
    const st = sim.state;
    for (const k of st.kingdoms) {
      const sp = govSpec(k.gov);
      if (!sp || !k.cityIds.length) continue;
      const cities = k.cityIds.map((id) => sim._cities.get(id)).filter((c) => c).sort((a, b) => b.pop - a.pop || a.id - b.id);
      for (const c of cities) if (tryArsenal(sim, c, false)) break;
    }
    if (st.mil.trenchN > 0) {
      const T = st.trench, N = T.length, D = M().TRENCH.decay, modeOf = new Map();
      let n = 0;
      for (let i = 0; i < N; i++) {
        const v = T[i];
        if (!v) continue;
        if (battleAt(sim, (i % st.W) + 0.5, Math.floor(i / st.W) + 0.5)) { n++; continue; }
        const cid = st.owner[i];
        let mode = modeOf.get(cid);
        if (mode === undefined) {
          const c = sim._cities.get(cid), k = c && sim._kingdoms.get(c.kingdomId);
          mode = k && WW.Growth && WW.Growth.natureMode ? WW.Growth.natureMode(sim, k, c.race) : 'none';
          modeOf.set(cid, mode);
        }
        const nv = Math.max(0, v - (D[mode] || D.none));
        T[i] = nv;
        if (nv === 0 || (nv >> 6) !== (v >> 6)) sim.markDirty(i);
        if (nv) n++;
      }
      st.mil.trenchN = n;
    }
    if (st.wrecks.length) {
      st.wrecks = st.wrecks.filter((w) => st.year - w.year < M().WRECK_YEARS);
      for (const w of st.wrecks) w.rust = Math.min(3, Math.floor((st.year - w.year) / 6));
    }
    if (st.mil.pick >= 0 && !sim._kingdoms.get(st.mil.pick)) st.mil.pick = -1;
  }

  function tick(sim) {
    const st = sim.state;
    if (!st.mil || !st.trench || !st.battles) defaults(st);
    const t = st.tick;
    if (t % M().COST.step === 29) production(sim);
    if (t % M().BATTLE.check === 13) battles(sim);
    if (t % TPY() === 17) yearly(sim);
  }

  // ---------------------------------------------------------------------------
  // Sandkasten: Aktionen und Kräfte
  // ---------------------------------------------------------------------------
  function realmAt(sim, x, y) {
    const c = sim.query.cityAt(x, y);
    if (c) return { k: sim._kingdoms.get(c.kingdomId), c: c };
    let best = null, bd = 30 * 30;
    for (const cc of sim.state.cities) { const d = (cc.cx - x) * (cc.cx - x) + (cc.cy - y) * (cc.cy - y); if (d < bd) { bd = d; best = cc; } }
    return best ? { k: sim._kingdoms.get(best.kingdomId), c: best } : null;
  }
  function placeVehicle(sim, x, y, kind, kid) {
    if (KINDS.indexOf(kind) < 0) return null;
    const st = sim.state;
    if (!WW.SimUtil.isNum(x) || !WW.SimUtil.isNum(y) || x < 0 || y < 0 || x >= st.W || y >= st.H) return null;
    let k = null, c = null;
    if (kid != null && sim._kingdoms.get(kid)) {
      k = sim._kingdoms.get(kid);
      c = sim._cities.get(k.capitalId) || sim._cities.get(k.cityIds[0]) || null;
    } else { const r = realmAt(sim, x, y); if (r) { k = r.k; c = r.c; } }
    if (!k || !c) return null;
    const u = spawnVehicle(sim, kind, k, x, y, c.id);
    if (!u) return null;
    sim.fx({ type: 'dust', x: u.x, y: u.y });
    if (!c.milGodT || st.tick - c.milGodT > 60) { c.milGodT = st.tick; chron(sim, kind === 'tank' ? 'godTank' : 'godGun', { city: c.name, kingdom: k.name }, WW.Cities.atCity(c)); }
    return u.id;
  }
  function orderBattle(sim, a, b) {
    const ka = sim._kingdoms.get(a), kb = sim._kingdoms.get(b);
    if (!ka || !kb || ka === kb || !ka.cityIds.length || !kb.cityIds.length) return false;
    if (!sim.actions.setRelation(a, b, 'war')) return false;
    const pair = WW.Diplo.nearestCities(sim, ka, kb);
    if (!pair) return false;
    const st = sim.state;
    for (const [k, target, ek] of [[ka, pair.b, kb], [kb, pair.a, ka]]) {
      const idle = st.units.filter((u) => !u.dead && u.kingdomId === k.id && (u.role === 'soldier' || u.vehicle) && !u.order && u.garrison == null);
      const send = Math.max(1, Math.ceil(idle.length * 0.75));
      for (let i = 0; i < idle.length && i < send; i++) {
        const u = idle[i];
        u.order = { kind: 'march', city: target.id, k: ek.id }; u.path = null; u.wait = 0; u.breach = -1; u.fails = 0;
      }
    }
    chron(sim, 'godBattle', { kingdom: ka.name, other: kb.name }, WW.Cities.atCity(pair.a));
    return true;
  }
  function actions(sim, safe) {
    return {
      placeVehicle: safe(function (x, y, kind, kid) { return placeVehicle(sim, x, y, kind, kid); }),
      orderBattle: safe(function (a, b) { return orderBattle(sim, a, b); })
    };
  }
  const APPLY = {
    milTank: function (sim, x, y) { return placeVehicle(sim, x, y, 'tank') != null; },
    milGun: function (sim, x, y) { return placeVehicle(sim, x, y, 'artillery') != null; },
    milBattle: function (sim, x, y) {
      const st = sim.state;
      const r = realmAt(sim, x, y);
      if (!r || !r.k) return false;
      const m = st.mil;
      if (m.pick >= 0 && m.pick !== r.k.id && sim._kingdoms.get(m.pick) && st.tick - m.pickT <= 1200) {
        const a = m.pick;
        m.pick = -1;
        return orderBattle(sim, a, r.k.id);
      }
      m.pick = r.k.id; m.pickT = st.tick;
      sim.fx({ type: 'battlepick', x: x, y: y, kingdomId: r.k.id });
      return true;
    }
  };
  if (WW.POWERS && WW.MIL && WW.MIL.POWER_DEFS) {
    for (const key in WW.MIL.POWER_DEFS) {
      if (WW.POWERS[key]) continue;
      WW.POWERS[key] = Object.assign({ key: key, brush: false, dir: false, aim: false }, WW.MIL.POWER_DEFS[key], { event: null, eventWild: null, apply: APPLY[key] });
      if (Array.isArray(WW.POWER_KEYS) && WW.POWER_KEYS.indexOf(key) < 0) WW.POWER_KEYS.push(key);
    }
  }

  WW.Military = {
    reserve: reserve, tick: tick, defaults: defaults, unit: unit, armor: armor, onKill: onKill, strength: strength, actions: actions,
    tryArsenal: tryArsenal, spawnVehicle: spawnVehicle, vehiclesOf: vehiclesOf, battleAt: battleAt, siteAt: siteAt, govSpec: govSpec,
    capOf: capOf, costOf: costOf, production: production, placeName: placeOf, battleName: battleName
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
