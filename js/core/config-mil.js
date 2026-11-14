// =============================================================================
// Wuselwelt – Daten des Militärs (Arsenal, Panzer, Artillerie, Schlachten). Lädt nach js/core/config.js
// (bei den anderen Konfig-Dateien). Verhalten: js/sim/military.js (Kopfkommentar = Schnittstelle).
//   WW.MIL.GOVS[gov]  Wer baut was (fehlt eine Regierung: nichts – Theokratie, Stamm, Anarchie)
//                     tank/artillery: { per (Einwohner je Fahrzeug), max (Obergrenze je Reich) } | fehlt = baut es nicht
//                     costMul (Kosten), speedMul (Bautempo), arsenals (je Reich), minPop (Stadt), focus (bevorzugt),
//                     simple (Panzer einfach: weniger Panzerung, billiger), defensive (Fahrzeuge bleiben daheim),
//                     noWorkshop (Arsenal auch ohne Fabrik/Schmiede, dann Bautempo × COST.noWorkshop)
//   WW.MIL.TANK / GUN Kampfwerte;  WW.MIL.COST Kosten je Fahrzeug;  WW.MIL.BATTLE, TRENCH Schlachten und Gräben
//   WW.STRUCT_INFO.arsenal (3×2)
// =============================================================================
(function (WW) { 'use strict';

  WW.MIL = {
    GOVS: {
      fascism:   { name: 'Panzer und Artillerie (Schwerpunkt)', tank: { per: 25, max: 8 }, artillery: { per: 50, max: 4 },
                   costMul: 0.8, speedMul: 1.25, arsenals: 2, minPop: 18, focus: 'tank', noWorkshop: true },
      communism: { name: 'viele einfache Panzer und Artillerie', tank: { per: 22, max: 10 }, artillery: { per: 55, max: 4 },
                   costMul: 0.65, speedMul: 1.1, arsenals: 2, minPop: 18, focus: 'tank', simple: true, noWorkshop: true },
      monarchy:  { name: 'Feldgeschütze (teuer)', artillery: { per: 55, max: 2 }, costMul: 1.4, speedMul: 0.8, arsenals: 1, minPop: 28 },
      republic:  { name: 'Feldgeschütze (teuer)', artillery: { per: 55, max: 2 }, costMul: 1.4, speedMul: 0.8, arsenals: 1, minPop: 28 },
      democracy: { name: 'Geschütze zur Verteidigung', artillery: { per: 45, max: 3 }, costMul: 1.2, speedMul: 0.9, arsenals: 1, minPop: 28, defensive: true }
    },
    ARSENAL_PAY: [{ wood: 22 }, { wood: 11, stone: 11 }, { stone: 22 }],   // Baukosten des Arsenals, Möglichkeiten der Reihe nach
    PEACE_SHARE: 0.6,   // Obergrenze im Frieden (Anteil; mindestens 1, wenn überhaupt erlaubt)

    // Panzer. armor: Faktor gegen Soldaten/Rebellen/Tiere; devLight/devHeavy: gegen leichte/schwere Mauergeräte
    // (Schuss ab devHeavyMin Schaden = Kanone, Balliste, Selbstschuss); gunMul: gegen Artillerie; tankMul: gegen Panzer
    TANK: { hp: 600, speed: 0.09, range: 3.6, sight: 6.5, dmg: 20, splash: 1.1, reload: 24, wallDmg: 42, wallCd: 14,
            centerDmg: 30, armor: 0.28, devLight: 0.3, devHeavy: 1.6, devHeavyMin: 15, gunMul: 1.9, tankMul: 1.0, heal: 2 },
    // Kommunismus: einfache Panzer
    SIMPLE: { hpMul: 0.68, dmgMul: 0.85, armorMul: 1.5, costMul: 0.7 },
    // Feldgeschütz (Artillerie). minRange: darunter wehrlos; area: Flächentreffer; scatter: Streuung beim Einschlag
    GUN:  { hp: 170, speed: 0.065, range: 9.5, minRange: 2.4, melee: 1.7, sight: 11, dmg: 24, area: 1.7, reload: 50,
            scatter: 0.9, wallDmg: 70, armor: 0.9, devLight: 1, devHeavy: 1.2, devHeavyMin: 15, gunMul: 1.0, tankMul: 1.2, heal: 1 },
    // Kosten je Fahrzeug (Eisen, Kohle; × GOVS.costMul). work: Bauzeit in Ticks bei voller Versorgung.
    // alt: Behelf ohne Rohstoffe (Möglichkeiten der Reihe nach: Gold, Holz + Stein, Holz; ohne Goldwirtschaft altNoGold), Tempo × altSpeed
    COST: { tank: { iron: 10, coal: 6, work: 260 }, artillery: { iron: 6, coal: 3, work: 200 },
            alt: [{ gold: 30 }, { wood: 30, stone: 20 }, { wood: 50 }], altNoGold: [{ wood: 25, stone: 25 }, { wood: 50 }, { stone: 50 }], altSpeed: 0.5, step: 40,
            waitSteps: 6, noWorkshop: 0.7 },   // waitSteps: Prüfungen, die ein Arsenal mit eigener Mine auf Eisen/Kohle wartet; noWorkshop: Tempo ohne Werkstatt

    // Feldschlacht: mindestens min Kämpfer (beide Seiten zusammen, je Seite sideMin) im Umkreis r außerhalb der Mauerringe
    BATTLE: { min: 12, sideMin: 3, r: 10, rMax: 15, check: 20, breakAt: 0.4, ratio: 2, surrenderRatio: 3, minTicks: 100,
              maxTicks: 720, quiet: 2, paroleTicks: 480, minLosses: 4, interceptR: 16, engageR: 12, sortieR: 30, sortieYears: 2 },
    // Gräben: dig je Prüfung und eingegrabenem Kämpfer, cover ab diesem Wert; Schaden × coverRanged (Fernkampf) bzw.
    // × coverMelee; decay: jährlicher Abbau nach Naturmodus des Gebiets (care wächst am schnellsten zu)
    TRENCH: { dig: 45, cover: 60, coverRanged: 0.55, coverMelee: 0.85, decay: { care: 40, use: 24, exploit: 12, none: 24 } },
    CRATER: [150, 199],    // state.mark-Wert eines Granattrichters (Zufall im Bereich; zählt wie alle Marken herunter)
    WRECK_YEARS: 30, MAX_WRECKS: 80, MAX_SITES: 40,
    SITE_NEAR_CITY: 26,    // Ortsname nach Stadt, wenn eine im Umkreis liegt; sonst nach Gelände

    // Kraft-Daten (Verhalten in js/sim/military.js)
    POWER_DEFS: {
      milTank: { category: 'destruction', icon: 'i_tank', name: 'Panzer setzen', desc: 'Stellt einen Panzer für das Reich an dieser Stelle hin. Laut, langsam, schwer zu stoppen – aber nicht unbesiegbar.', radius: 1, duration: 0 },
      milGun: { category: 'destruction', icon: 'i_artillery', name: 'Geschütz setzen', desc: 'Stellt ein Feldgeschütz auf. Schießt weit, trifft ungefähr und hasst Nahkampf.', radius: 1, duration: 0 },
      milBattle: { category: 'destruction', icon: 'i_battle', name: 'Schlacht befehlen', desc: 'Erst ein Reich antippen, dann ein zweites: Krieg, und beide Heere ziehen einander entgegen.', radius: 2, duration: 0 }
    }
  };

  if (WW.STRUCT_INFO && !WW.STRUCT_INFO.arsenal) {
    WW.STRUCT_INFO.arsenal = { name: 'Arsenal', w: 3, h: 2, work: 180, hp: [320], cost: [{ wood: 22 }], burn: 0.4 };
  }
  if (WW.ROLE_NAMES && !WW.ROLE_NAMES.tank) {
    WW.ROLE_NAMES.tank = 'Panzer'; WW.ROLE_NAMES.artillery = 'Feldgeschütz';
    if (WW.ROLE_NAMES_F) { WW.ROLE_NAMES_F.tank = 'Panzer'; WW.ROLE_NAMES_F.artillery = 'Feldgeschütz'; }
  }
  if (Array.isArray(WW.ROLE_KEYS) && WW.ROLE_KEYS.indexOf('tank') < 0) WW.ROLE_KEYS.push('tank', 'artillery');

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
