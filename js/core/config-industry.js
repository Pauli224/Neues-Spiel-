// =============================================================================
// Wuselwelt – Daten der Industrie (Fabriken, Verschmutzung). Lädt direkt nach js/core/config.js.
//   WW.INDUSTRY.GOVS[gov]   Regierungen MIT Industrie: { kind, minPop, perPop, max, mods[] }
//                           (fehlt eine Regierung hier: nie Fabriken – Stamm, Anarchie, Theokratie)
//   WW.INDUSTRY.KINDS[kind] { name, desc, g ('n'|'f' Genus für Artikel), emit (Ausstoß je Schritt), small (immer 2×2) }
//   WW.INDUSTRY.NO_RACES    Völker ohne Fabriken (Elfen, Froschlinge)
//   WW.INDUSTRY.CFG         Zellgröße, Schwellen, Takte
//   WW.STRUCT_INFO.factory  Bauwerkstyp (2×2; level 2 = 3×3 bei Großstädten)
//   Weltgesetz 'industry' (Standard an) wird an WW.LAW_INFO angehängt.
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
      BARREN_DEADTREES: 95, BARREN_ASH: 230, BARREN_FIELD: 80,   // Stufen: tote Bäume, Aschefeld, Feld trägt weniger
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
    MAX_DIST: 90,       // Bahnhöfe weiter auseinander (Kacheln, Manhattan) werden nicht verbunden
    MAX_LEN: 160,       // längste Trasse
    PATH_NODES: 40000,  // Grenze der Wegsuche
    SITES: 5,           // gleichzeitige Gleis-Baustellen je Strecke
    PLAN_EVERY: 120,    // Ticks je Planung
    SPEED: 0.3,         // Kacheln je Tick
    WAIT: 40,           // Ticks Aufenthalt am Bahnhof
    CARS: 4, CAR_CAP: 25, BALANCE_MIN: 30,   // Güterwagen, Ladung je Wagen, ab diesem Unterschied wird ausgeglichen
    FUEL: 2,            // Holz (oder Kohle) je Abfahrt
    TROOPS: 12,         // Soldaten je Truppenzug
    EMIT: 4             // Qualm je Verschmutzungsschritt in der Zelle eines fahrenden Zugs
  };

  if (WW.STRUCT_INFO && !WW.STRUCT_INFO.station) {
    WW.STRUCT_INFO.station = { name: 'Bahnhof', w: 2, h: 2, work: 140, hp: [200], cost: [{ wood: 12, stone: 8 }], burn: 0.5 };
    WW.STRUCT_INFO.rail = { name: 'Gleis', w: 1, h: 1, work: 7, hp: [60], cost: [{ wood: 1, stone: 1 }], burn: 0.2 };
  }

  // Weltgesetz „Industrie" (an/aus)
  if (Array.isArray(WW.LAW_INFO) && WW.LAW_DEFAULTS && !('industry' in WW.LAW_DEFAULTS)) {
    WW.LAW_INFO.push({ key: 'industry', name: 'Industrie', desc: 'Manche Regierungen bauen Fabriken. Die qualmen.', def: true });
    WW.LAW_DEFAULTS.industry = true;
  }

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
