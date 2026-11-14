// =============================================================================
// Wuselwelt – Daten der Seefahrt (Häfen, Schiffe, Seegefechte). Lädt nach js/core/config.js (bei den anderen
// Konfig-Dateien). Verhalten: js/sim/naval.js (Kopfkommentar = Schnittstelle), Texte: js/data/texts-naval.js.
//   WW.NAVAL.GOVS[gov]   Flotte je Regierung: look ('canoe'|'sail'|'steam' = Aussehen und Antrieb), Obergrenzen je Hafen
//                        (fish, trade, transport, war), minTier/minPop (ab wann der Hafen kommt), build (Bautempo),
//                        invade (Truppenlandungen erlaubt), colonize (Siedler über das Meer), range (größte Fahrt in Kacheln)
//   WW.NAVAL.KINDS[kind] Schiffsarten: name, hp, cost, work (Bauzeit in Ticks), cap (Plätze), Kampfwerte beim Kriegsschiff
//   WW.NAVAL.LOOK[look]  Antrieb: speed (Kacheln je Tick), coalSpeed (Dampfer mit Kohle), hpMul, capMul
//   WW.STRUCT_INFO.harbor (2×2)
// =============================================================================
(function (WW) { 'use strict';

  WW.NAVAL = {
    // Obergrenzen je Hafen (fish/trade/war wachsen mit der Stadtstufe bis zu diesem Wert; transport: 1 genügt meist)
    GOVS: {
      tribe:     { look: 'canoe', fish: 2, trade: 0, transport: 1, war: 0, minTier: 1, minPop: 8, build: 0.8, invade: true, colonize: true, range: 46 },
      monarchy:  { look: 'sail',  fish: 2, trade: 1, transport: 1, war: 2, minTier: 1, minPop: 8, build: 1, invade: true, colonize: true, range: 999 },
      democracy: { look: 'sail',  fish: 2, trade: 2, transport: 1, war: 1, minTier: 1, minPop: 8, build: 1, invade: true, colonize: true, range: 999, defensive: true },
      fascism:   { look: 'steam', fish: 1, trade: 1, transport: 2, war: 3, minTier: 1, minPop: 8, build: 1.2, invade: true, colonize: true, range: 999 },
      communism: { look: 'steam', fish: 3, trade: 1, transport: 1, war: 2, minTier: 1, minPop: 8, build: 1.1, invade: true, colonize: true, range: 999 },
      theocracy: { look: 'sail',  fish: 2, trade: 1, transport: 1, war: 1, minTier: 1, minPop: 8, build: 0.9, invade: true, colonize: true, range: 999 },
      republic:  { look: 'sail',  fish: 2, trade: 3, transport: 1, war: 1, minTier: 0, minPop: 6, build: 1.3, invade: true, colonize: true, range: 999 },
      anarchy:   { look: 'sail',  fish: 2, trade: 1, transport: 1, war: 0, minTier: 1, minPop: 8, build: 0.9, invade: false, colonize: true, range: 999 }
    },
    // Regierungen mit Schiffsgeschützen (Küstenbeschuss), falls WW.MIL fehlt; sonst: WW.MIL.GOVS[gov].artillery
    GUN_GOVS: { fascism: 1, communism: 1, monarchy: 1, republic: 1, democracy: 1 },
    CULTURE: { nord: { fish: 1 } },   // Kultur nord: ein Fischerboot mehr je Hafen (der Fangertrag +30 % kommt über die Kultur-Mods)

    KINDS: {
      fishboat:  { name: 'Fischerboot',   hp: 40,  cost: { wood: 6 },             work: 240, cap: 0 },
      trader:    { name: 'Handelsschiff', hp: 70,  cost: { wood: 12, gold: 8 },   work: 380, cap: 0 },
      transport: { name: 'Transporter',   hp: 90,   cost: { wood: 14, stone: 4 },  work: 420, cap: 10 },
      warship:   { name: 'Kriegsschiff',  hp: 150, cost: { wood: 16, stone: 8 },  work: 600, cap: 0,
                   dmg: 13, range: 4.5, reload: 30, sight: 9, hit: 0.75, wallDmg: 36, shoreRange: 6.5 }
    },
    KIND_KEYS: ['fishboat', 'trader', 'transport', 'warship'],
    LOOK: {
      canoe: { name: 'Kanu',        speed: 0.085, hpMul: 0.6, capMul: 0.5 },
      sail:  { name: 'Segelschiff', speed: 0.12,  hpMul: 1,   capMul: 1 },
      steam: { name: 'Dampfschiff', speed: 0.11,  coalSpeed: 0.18, hpMul: 1.2, capMul: 1.2 }
    },
    COAL_RESERVE: 6,      // so viel Kohle bleibt im Lager (Arsenal, Fabriken, Züge gehen vor)
    COAL_TRIP: 1,         // Kohle je Ausfahrt eines Dampfers (stock.coal); ohne Kohle fährt er langsamer und raucht nicht
    SMOKE_EMIT: 2,        // Qualm je 40 Ticks in die Verschmutzungszelle eines fahrenden Dampfers (state.pollution, falls vorhanden)

    HARBOR: { r: 22, minSea: 40, plan: 200, retryYears: 4, maxSites: 1 },   // Suchradius, kleinste Meeresfläche, Prüftakt
    FISH: { catch: 8, time: 120, rMin: 3, rMax: 11, deposit: 1.6, dockWait: 40 },
    TRADE: { gold: 5, perTile: 1 / 40, max: 14, opinion: 2, wait: 60, goods: 4 },
    SETTLE: { minAdults: 18, minTier: 2, every: 5, n: [6, 9], free: 30, minDist: 20, landR: 8, wait: 360 },
    INVADE: { min: 4, every: 4, landMin: 4, landMax: 22, wait: 200, guard: 600, escortR: 30, escortWait: 400, towerR: 6, towerDmg: 22 },   // Türme an der Küste beschießen anlandende Transporter
    PATROL: { r: 8, wait: 100, out: 60 },
    PATH_NODES: 9000,     // Knotenlimit der Wegsuche über Wasser
    ROUTE_CACHE: 160,     // zwischengespeicherte Routen (Laufzeit)
    MAX_SHIPS: 140, MAX_PER_KINGDOM: 24,
    SINK_TICKS: 40, SWIM_SPEED: 0.05, WRECK_YEARS: 30,

    POWER_DEFS: {
      navHarbor: { category: 'meddle', name: 'Hafen setzen', desc: 'Baut der nächsten Küstenstadt sofort einen Hafen an diese Küste. Möwen inklusive.', radius: 1, duration: 0 },
      navShip: { category: 'meddle', name: 'Schiff setzen', desc: 'Setzt ein Schiff ins Wasser: Kriegsschiff, wenn das Reich Krieg führt, sonst ein Handelsschiff (beim Stamm ein Kanu).', radius: 1, duration: 0 }
    }
  };

  if (WW.STRUCT_INFO && !WW.STRUCT_INFO.harbor) {
    WW.STRUCT_INFO.harbor = { name: 'Hafen', w: 2, h: 2, work: 150, hp: [180], cost: [{ wood: 14, stone: 4 }], burn: 0.6 };
  }

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
