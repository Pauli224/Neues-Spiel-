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
//   units.js  updateAll: Einheiten mit u.sea steuert WW.Naval.unit(sim, u) (zum Hafen gehen, an Bord, schwimmen);
//             hostile: Einheiten an Bord (u.seaS === 'aboard') sind nie Ziel
//   diplo.js  update: liegt die nächste Feindstadt auf einer anderen Landmasse -> WW.Naval.seaWar (Truppenlandung)
//   powers.js nichts: die Kräfte hängt dieses Modul beim Laden an WW.POWERS / WW.POWER_KEYS an (wie military.js)
//   audio.js  Fx shipfire, shipsink, horn auf vorhandene Klänge
//
// HAFEN = Bauwerk type 'harbor' (2×2, WW.STRUCT_INFO.harbor), auf Land direkt an Meer/Flachwasser/Tiefsee
//   Felder zusätzlich zu den üblichen: dock (Kachel-Index der Anlegestelle IM WASSER, 4-Nachbar der Grundfläche),
//   dockDir 0 O | 1 S | 2 W | 3 N (Richtung Grundfläche -> Wasser; Steg zeigt dorthin), style (Regierung, wie alle
//   Bauwerke), culture (Kultur der Stadt beim Bau), prod (Schiffsart im Bau | null), prog 0..1, made (gebaute Schiffe).
//   Sprite: S.harborKey(gov, culture) -> 's_harbor_*' (2×2 mit Steg zum dock). Baustelle wie jedes Bauwerk (!built).
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
// ZUSTAND state.naval = { seq, harbors [Hafen-IDs], colony { [kid]: Jahr }, invade { [kid]: Jahr },
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
// SCHNITTSTELLE WW.Naval: tick(sim), defaults(st), unit(sim, u), seaWar(sim, k, e, idle, marching) -> bool, actions, queries,
//   isSea(t), route(sim, from, to) -> [Kachel] | null, findHarborSpot(sim, city, near?) -> { x, y, dock, dockDir } | null,
//   spawnShip(sim, harborOrNull, kind, kingdomId, cityId, tile?) -> Schiff | null, sink(sim, ship, by), govSpec(gov),
//   speedOf(sim, ship), quota(sim, city, k, kind)
// =============================================================================
(function (WW) { 'use strict';
  // (Logik folgt)
})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
