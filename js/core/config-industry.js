// =============================================================================
// Wuselwelt – Daten der Industrie (Fabriken, Verschmutzung). Lädt direkt nach js/core/config.js.
//   WW.INDUSTRY.GOVS[gov]   Regierungen MIT Industrie: { kind, minPop, perPop, max, mods[] }
//                           (fehlt eine Regierung hier: nie Fabriken – Stamm, Anarchie, Theokratie)
//   WW.INDUSTRY.KINDS[kind] { name, desc, g ('n'|'f' Genus für Artikel), emit (Ausstoß je Schritt), small (immer 2×2) }
//   WW.INDUSTRY.NO_RACES    Völker ohne Fabriken (Elfen, Froschlinge)
//   WW.INDUSTRY.CFG         Zellgröße, Schwellen, Takte
//   WW.STRUCT_INFO.factory  Bauwerkstyp (2×2; level 2 = 3×3 bei Großstädten)
//   Weltgesetze 'industry' und 'camps' (Standard an) werden an WW.LAW_INFO angehängt.
//   WW.RAIL (Eisenbahn, js/sim/rail.js), WW.CAMPS (Arbeitslager, js/sim/camps.js), STRUCT_INFO station/rail/laborcamp/camphq/barrack/watchtower/stockade/memorial.
// =============================================================================
(function (WW) { 'use strict';

  WW.INDUSTRY = {
    // mods: über WW.Mods auf die Stadt (je aktiver Fabrik; mul wird potenziert, add vervielfacht)
    GOVS: {
      communism: { kind: 'kombinat',   minPop: 20, perPop: 12, max: 4, mods: [{ key: 'work', mul: 1.06 }, { key: 'build', mul: 1.08 }, { key: 'stone', mul: 1.1 }] },
      fascism:   { kind: 'ruestung',   minPop: 22, perPop: 16, max: 3, mods: [{ key: 'strength', mul: 1.12 }, { key: 'soldiers', add: 0.03 }, { key: 'work', mul: 1.03 }] },
      republic:  { kind: 'manufaktur', minPop: 24, perPop: 18, max: 3, mods: [{ key: 'gold', mul: 1.25 }, { key: 'work', mul: 1.03 }] },
      democracy: { kind: 'fabrik',     minPop: 30, perPop: 40, max: 2, mods: [{ key: 'gold', mul: 1.12 }, { key: 'work', mul: 1.05 }] },
      monarchy:  { kind: 'schmiede',   minPop: 34, perPop: 60, max: 1, mods: [{ key: 'strength', mul: 1.08 }, { key: 'gold', mul: 1.05 }] }
    },
    KINDS: {
      kombinat:   { name: 'Kombinat',          desc: 'Erfüllt den Plan. Welchen, weiß keiner, aber er wird erfüllt.', g: 'n', emit: 52 },
      ruestung:   { name: 'Rüstungswerk',      desc: 'Macht Helme, Schilde und sehr viel grauen Rauch.', g: 'n', emit: 60 },
      manufaktur: { name: 'Manufaktur',        desc: 'Hier werden Knöpfe gemacht. Und Gold. Und Husten.', g: 'f', emit: 44 },
      fabrik:     { name: 'Fabrik',            desc: 'Hat einen Betriebsrat, eine Kantine und irgendwann einen Filter.', g: 'f', emit: 40 },
      schmiede:   { name: 'Königliche Schmiede', desc: 'Klein, laut, königlich. Der Ruß trägt eine Krone.', g: 'f', emit: 18, small: true }
    },
    NO_RACES: { elf: 1, frog: 1 },
    CFG: {
      CELL: 4,              // Zellgröße des Verschmutzungsrasters in Kacheln (state.pollution: Uint8, pw × ph)
      STEP: 20,             // Ticks je Verschmutzungsschritt (Ausstoß, Wind, Verdünnung, Abbau)
      EFFECT_EVERY: 60,     // Ticks je Folgen-Durchlauf (Bäume, Flüsse, Kranke, Tiere)
      PLAN_EVERY: 40,       // Ticks je Bauplanung/Zustand der Fabriken
      WORKERS: 9,           // Einwohner je aktiver Fabrik
      LEVEL2_TIER: 3,       // ab Großstadt: 3×3
      WIND_SHARE: 0.2,     // Anteil, den der Wind je Schritt weiterträgt
      DIFFUSE: 0.04,        // Anteil, der in die vier Nachbarzellen verläuft
      DECAY: 0.955,         // Abbau je Schritt (Faktor) …
      DECAY_SUB: 0.35,      // … und Abzug
      TH_HAZE: 60, TH_TREES: 75, TH_MURK: 70, TH_SICK: 105, TH_ANIMALS: 95, TH_ACID: 170,
      TH_BARREN: 45,        // ab dieser Luftverschmutzung laugt der Boden aus (state.barren steigt) …
      TH_BARREN_HEAL: 30,   // … unter dieser heilt er (BARREN_HEAL je Folgen-Durchlauf)
      BARREN_HEAL: 4, SOOT: 3, SOOT_R: 3.5,   // Ruß im Umkreis aktiver Fabriken
      BARREN_HYST: 3,       // Hysterese der Kachel-Meldung an den Stufen 85/170
      SOOT_MAX: 120, SOOT_DECAY: 3,   // Rußschicht state.soot: Höchstwert, Abklingen je Folgen-Durchlauf
      BARREN_DEADTREES: 95, BARREN_ASH: 230, BARREN_FIELD: 80,   // Stufen: tote Bäume, Aschefeld, Feld trägt weniger
      COAL_USE: 0.5, COAL_BOOST: 1.5, COAL_EMIT: 1.25,   // Kohle je aktiver Fabrik und Planung; Ertrags-Exponent; Ausstoß
      CLOSE_YEARS: 1,       // stillgelegt -> nach so vielen Jahren Ruine
      RAIN_CLEAN: 0.35,     // Regen: übrig bleibender Anteil
      BREEZE_CLEAN: 0.12    // Frische Brise: übrig bleibender Anteil
    }
  };

  if (WW.STRUCT_INFO && !WW.STRUCT_INFO.factory) {
    WW.STRUCT_INFO.factory = { name: 'Fabrik', w: 2, h: 2, work: 190, hp: [220, 340], cost: [{ wood: 14, stone: 10 }, { wood: 20, stone: 18 }], burn: 0.5,
      bigW: 3, bigH: 3 };
  }

  // Eisenbahn (js/sim/rail.js). GOVS: Regierungen mit Bahn (weitere einfach ergänzen)
  WW.RAIL = {
    GOVS: { communism: { name: 'Volksbahn' }, fascism: { name: 'Gleichschrittbahn' } },
    MIN_TIER: 2,        // Städte ab „Stadt"
    MIN_DIST: 22,       // näher beieinander liegende Bahnhöfe bekommen keine (Mini-)Strecke
    MIN_LEN: 18,        // kürzere Trassen werden nicht gebaut
    MAX_DIST: 64,       // Bahnhöfe weiter auseinander (Kacheln, Manhattan) werden nicht verbunden
    MAX_LEN: 160,       // längste Trasse
    PATH_NODES: 40000,  // Grenze der Wegsuche
    SITES: 6,           // gleichzeitige Gleis-Baustellen je Strecke
    CREW_TILES: 2,      // Gleisbautrupp: je Ende und Planung so viele Gleisstücke am fertigen Gleis fertig
    PLAN_EVERY: 120,    // Ticks je Planung
    SPEED: 0.3,         // Kacheln je Tick
    WAIT: 40,           // Ticks Aufenthalt am Bahnhof
    CARS: 4, CAR_CAP: 25, BALANCE_MIN: 30,   // Güterwagen, Ladung je Wagen, ab diesem Unterschied wird ausgeglichen
    FUEL: 2,            // Holz (oder Kohle) je Abfahrt
    COAL_SPEED: 1.4,    // mit Kohle fährt der Zug schneller
    TROOPS: 12,         // Soldaten je Truppenzug
    EMIT: 4             // Qualm je Verschmutzungsschritt in der Zelle eines fahrenden Zugs
  };

  if (WW.STRUCT_INFO && !WW.STRUCT_INFO.station) {
    WW.STRUCT_INFO.station = { name: 'Bahnhof', w: 2, h: 2, work: 140, hp: [200], cost: [{ wood: 12, stone: 8 }], burn: 0.5 };
    WW.STRUCT_INFO.rail = { name: 'Gleis', w: 1, h: 1, work: 7, hp: [60], cost: [{ wood: 2 }], burn: 0.2 };   // Schwellen und Schienen: Holz (Stein fehlt Bahn-Städten oft)
  }

  // Lagerstädte und Kriegsgefangene (js/sim/camps.js) – kritisch dargestellt; Insassen nur Kriegsgefangene und
  // politische Gefangene, nie nach Volk oder Kultur. Schnittstelle: Kopfkommentar von js/sim/camps.js.
  WW.CAMPS = {
    // Regime mit Lagerstädten (Tabelle, erweiterbar). eager: baut die Lagerstadt ohne Anlass, sobald Stufe, Platz und
    // Vorräte reichen (Wunsch des Spielers, PLAN-9 9.10 E); sonst nur bei Anlass (Gefangene, Rebellen, Unzufriedenheit)
    GOVS: { fascism: { eager: true }, communism: {} },
    EAGER_PICKUP: 50,   // eager-Regime holen schon unter dieser Zufriedenheit Unzufriedene ab (ein Regime findet stets welche)
    MIN_TIER: 2,        // Anlass „Unzufriedene/Rebellen" erst, wenn das Regime eine Stadt dieser Stufe hat
    PLAN_EVERY: 120,    // Ticks je Planung (Gründung, Ausbau, Wachen, Haftorte)
    BUILD_EVERY: 40,    // Ticks je Bauschritt der Lagerstadt
    BUILD_WORK: 30,     // Arbeit je Bauschritt und Kopf der Bautrupps (Wachen + Insassen)
    UNHAPPY: 35,        // darunter: Anlass für ein Lager, Unzufriedene werden abgeholt
    PICKUP: 0.5,        // Wahrscheinlichkeit einer Abholung je Jahr und Lagerstadt
    CAPTURE: 0.6,       // Anteil Unterlegener, die sich ergeben (statt zu fallen)
    SURRENDER_R: 4,     // Unterzahl wird in diesem Umkreis gezählt
    UNHAPPY_MOD: 10, LOYALTY_MOD: 12, FEAR: 6,   // Folgen in der Mutterstadt (andere Städte des Regimes halb)
    CONDEMN: 4,         // Meinungsverlust der Nachbarn je Jahr (Demokratien ×2,5)
    BREAKOUT: 0.05,     // Ausbruch je Jahr (ab 4 Insassen)
    RIOT: 0.3,          // Aufstand (ein Teil entkommt) je Jahr, wenn Wachen unter Soll
    UPRISE: 0.6, UPRISE_MIN: 6,   // Lageraufstand (Übernahme) je Jahr, wenn Wachen unter der Hälfte des Solls
    WORK_R: 16, RAIL_WORK: 0.12, YIELD: 0.6,
    SELF_BUILD: 0.1,    // Baufortschritt der Keimzelle (laborcamp) je Planung
    CAP: 12,            // Plätze eines Gefangenenlagers (stockade)
    BARRACK_CAP: 8, BARRACKS_START: 2, BARRACKS_MAX: 6,
    GUARD_PER: 6, GUARD_MIN: 2,   // Sollstärke der Wachen: 1 je 6 Insassen, mindestens 2
    FENCE_HP: 70,       // Haltbarkeit eines Zaunstücks (Palisade ~200)
    RESERVE: 5.7, MARGIN: 1.5,    // Innenfläche des Zauns (Radius um die Kommandantur) und Abstand
    MIN_CAP_DIST: 14, SITE_MIN: 15, SITE_MAX: 30, CITY_DIST: 12,   // Lage abseits der Hauptstadt
    MAX_CAMPS: 1,       // Lagerstädte je Regime (+1 ab 5 Städten)
    RETURN_SHARE: 0.34, KEEP_YEARS: 5,   // Regime geben beim Frieden nur ein Drittel zurück, den Rest nach Jahren
    EXCHANGE: 0.3,      // Gefangenenaustausch je Jahr und Kriegspaar
    ESCAPE: 0.04,       // Flucht aus einem Gefangenenlager je Jahr und Lager
    HOME_JOY: 6, FREE_JOY: 15,   // Freude der Heimat bei Heimkehr (3 Jahre), der befreiten Stadt (6 Jahre)
    MARCH_MAX: 1200     // Ticks, nach denen ein festgefahrener Marsch am Ziel ankommt (Notausgang)
  };
  const SI = WW.STRUCT_INFO;
  if (SI && !SI.laborcamp) {
    SI.laborcamp = { name: 'Arbeitslager', w: 2, h: 2, work: 110, hp: [180], cost: [{ wood: 10, stone: 6 }], burn: 0.6 };
  }
  if (SI && !SI.camphq) {
    SI.camphq = { name: 'Kommandantur', w: 2, h: 2, core: true, work: 120, hp: [260], cost: [{ wood: 10, stone: 6 }], burn: 0.4 };
    SI.barrack = { name: 'Baracke', w: 2, h: 2, core: true, work: 90, hp: [140], cost: [{ wood: 8, stone: 2 }], burn: 0.8 };
    SI.watchtower = { name: 'Wachturm', w: 1, h: 1, core: true, work: 50, hp: [120], cost: [{ wood: 4 }], burn: 0.8 };
    SI.stockade = { name: 'Gefangenenlager', w: 2, h: 2, work: 60, hp: [120], cost: [{ wood: 8 }], burn: 0.8 };
    SI.memorial = { name: 'Mahnmal', w: 1, h: 1, work: 60, hp: [500], cost: [{ stone: 4 }], burn: 0 };
  }
  if (Array.isArray(WW.LAW_INFO) && WW.LAW_DEFAULTS && !('camps' in WW.LAW_DEFAULTS)) {
    WW.LAW_INFO.push({ key: 'camps', name: 'Arbeitslager', desc: 'Autoritäre Regime sperren politische Gegner ein. Aus = gibt es in dieser Welt nicht.', def: true });
    WW.LAW_DEFAULTS.camps = true;
  }

  // Weltgesetz „Industrie" (an/aus)
  if (Array.isArray(WW.LAW_INFO) && WW.LAW_DEFAULTS && !('industry' in WW.LAW_DEFAULTS)) {
    WW.LAW_INFO.push({ key: 'industry', name: 'Industrie', desc: 'Manche Regierungen bauen Fabriken. Die qualmen.', def: true });
    WW.LAW_DEFAULTS.industry = true;
  }

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
