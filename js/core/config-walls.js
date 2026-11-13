// Mauerstufen 1–6 je Regierung und Verteidigungsgeräte. Lädt direkt nach js/core/config.js.
// Erweitert WW.GOVERNMENTS[gov] um wallMax (Stamm/Anarchie 4, sonst 6) und wallLevels, WW.STRUCT_INFO
// (wall/gate/tower) um Lebenspunkte und Kosten der Stufen 4–6; neu WW.WALL_LEVELS, WW.WALL_DEVICES.
// Verhalten: js/sim/walls.js (Ausbau, Geräte verteilen), js/sim/env.js (Geräte feuern).
(function (WW) { 'use strict';

  // ---------------------------------------------------------------------------
  // Grundwerte der Bauwerke für Stufe 1–6 (Stufe 1–3 unverändert)
  // ---------------------------------------------------------------------------
  const SI = WW.STRUCT_INFO;
  if (SI && SI.wall && SI.wall.hp.length < 6) {
    SI.wall.hp = [200, 600, 1100, 1500, 1950, 2500];
    SI.wall.cost = [{ wood: 1 }, { stone: 1 }, { stone: 2 }, { stone: 3 }, { stone: 3, gold: 1 }, { stone: 4, gold: 1 }];
    SI.gate.hp = [180, 520, 950, 1300, 1700, 2200];
    SI.gate.cost = [{ wood: 2 }, { stone: 3 }, { stone: 4 }, { stone: 5 }, { stone: 5, gold: 2 }, { stone: 6, gold: 2 }];
    SI.tower.hp = [240, 750, 1300, 1750, 2300, 2900];
    SI.tower.cost = [{ wood: 2 }, { stone: 3 }, { stone: 5 }, { stone: 6 }, { stone: 6, gold: 2 }, { stone: 8, gold: 3 }];
  }

  // Voraussetzungen für den Ausbau auf eine Stufe (Stadt muss die vorige Stufe fertig haben)
  const REQ_STONE = {
    2: { pop: 15, stone: 12 }, 3: { pop: 32, tier: 2, stone: 30 },
    4: { pop: 45, tier: 3, stone: 45 }, 5: { pop: 60, tier: 3, stone: 60, gold: 20 }, 6: { pop: 80, tier: 3, stone: 80, gold: 40 }
  };
  const REQ_WOOD = { 2: { pop: 18, wood: 20 }, 3: { pop: 26, wood: 30 }, 4: { pop: 36, tier: 2, wood: 45 } };
  const WOOD_COST = { 2: { wood: 2 }, 3: { wood: 3 }, 4: { wood: 4, stone: 1 } };

  // ---------------------------------------------------------------------------
  // Stufen je Regierung: name, hpMul (auf die Grund-Lebenspunkte), cost (je Mauerstück, null = Grundkosten),
  // req (Voraussetzung), device + spacing (jedes n-te Mauerstück bekommt das Gerät, ab dieser Stufe)
  // ---------------------------------------------------------------------------
  const L = (name, o) => Object.assign({ name: name, hpMul: 1, cost: null, req: null, device: null, spacing: 0 }, o || {});
  const std = (names, dev, devLv, sp) => names.map((n, i) => {
    const lv = i + 1;
    const o = { req: REQ_STONE[lv] || null };
    if (dev && lv === devLv) { o.device = dev; o.spacing = sp; }
    return L(n, o);
  });
  const LEVELS = {
    monarchy: std(['Palisade', 'Steinmauer', 'Festungsmauer', 'Wehrgangmauer', 'Zwingermauer', 'Königsfestung'], 'ballista', 4, 5),
    democracy: std(['Palisade', 'Steinmauer', 'Festungsmauer', 'Bastionsmauer', 'Schanze', 'Sternfestung'], 'post', 4, 4),
    fascism: std(['Palisade', 'Steinmauer', 'Festungsmauer', 'Betonwall', 'Bunkerlinie', 'Festungswall'], 'mgnest', 4, 5),
    communism: std(['Palisade', 'Steinmauer', 'Festungsmauer', 'Plattenwall', 'Grenzanlage', 'Doppelmauer mit Kontrollstreifen'], 'selfshot', 5, 4),
    theocracy: std(['Palisade', 'Steinmauer', 'Festungsmauer', 'Tempelwall', 'Geweihte Mauer', 'Himmelswall'], 'ward', 4, 5),
    republic: std(['Palisade', 'Steinmauer', 'Festungsmauer', 'Zollmauer', 'Kanonenbastion', 'Hafenfestung'], 'cannon', 5, 6),
    tribe: [L('Palisade'), L('Doppelpalisade', { hpMul: 0.55, cost: WOOD_COST[2], req: REQ_WOOD[2] }),
      L('Erdwall mit Pfählen', { hpMul: 0.6, cost: WOOD_COST[3], req: REQ_WOOD[3], device: 'spikes', spacing: 3 }),
      L('Holzfestung', { hpMul: 0.7, cost: WOOD_COST[4], req: REQ_WOOD[4] })],
    anarchy: [L('Barrikade'), L('Reifenwall', { hpMul: 0.5, cost: WOOD_COST[2], req: REQ_WOOD[2] }),
      L('Schrottburg', { hpMul: 0.55, cost: WOOD_COST[3], req: REQ_WOOD[3], device: 'trap', spacing: 4 }),
      L('Kunst-Barrikade', { hpMul: 0.65, cost: WOOD_COST[4], req: REQ_WOOD[4] })]
  };
  // Stufen 4–6 kosten je Regierung die Grundkosten (null) – außer den Holzstufen oben
  WW.WALL_LEVELS = LEVELS;

  // ---------------------------------------------------------------------------
  // Verteidigungsgeräte (Eigenschaft struct.device einzelner Mauerstücke). Sprite s_walldev_<key>.
  //   range (Kacheln), dmg, reload (Ticks), minRange, area (Flächenschaden-Radius), engineMul (gegen ram/catapult),
  //   fx: Effekt des Schusses
  // ---------------------------------------------------------------------------
  WW.WALL_DEVICES = {
    selfshot: { name: 'Selbstschussanlage', desc: 'Löst von selbst aus, wenn jemand 2–3 Kacheln vor der Mauer steht. Fragt nicht, wer.', range: 3, dmg: 45, reload: 70, fx: 'tracer', stray: 0.12 },
    mgnest: { name: 'MG-Nest', desc: 'Schnelle, schwache Salven über große Entfernung.', range: 7.5, dmg: 4, reload: 6, fx: 'tracer' },
    ballista: { name: 'Balliste', desc: 'Riesige Armbrust. Durchbohrt Rammböcke und Katapulte.', range: 8, dmg: 22, reload: 30, engineMul: 4, fx: 'bolt_shot' },
    cannon: { name: 'Kanone', desc: 'Langsam, laut und mit Flächenschaden.', range: 9, minRange: 2, dmg: 26, area: 1.6, reload: 50, fx: 'rock' },
    ward: { name: 'Bannkreis', desc: 'Geweihte Zeichen: Feinde in der Nähe werden langsam und zögerlich.', range: 4, dmg: 1, reload: 12, slow: 14, fx: 'ward' },
    post: { name: 'Bürgerposten', desc: 'Bei Alarm schießen die Bewohner von der Mauer mit.', range: 5, dmg: 6, reload: 12, needsPeople: true, fx: 'arrow' },
    spikes: { name: 'Spitze Pfähle', desc: 'Wer an der Mauer rüttelt, sticht sich.', range: 1.6, dmg: 4, reload: 10, all: true, fx: null },
    trap: { name: 'Falle', desc: 'Selbstgebastelt. Wirkt. Meistens. Manchmal auf die Falschen.', range: 3, dmg: 20, reload: 30, oops: 0.15, dud: 0.25, fx: 'tracer' }
  };
  WW.WALL_DEVICE_KEYS = Object.keys(WW.WALL_DEVICES);

  // Regierungen ergänzen (Einträge sind eingefroren: neu zusammensetzen)
  if (WW.GOVERNMENTS) for (const k in WW.GOVERNMENTS) {
    const g = WW.GOVERNMENTS[k];
    const lv = LEVELS[k] || LEVELS.monarchy;
    if (g.wallLevels) continue;
    WW.GOVERNMENTS[k] = Object.freeze(Object.assign({}, g, { wallMax: lv.length, wallLevels: lv }));
  }

  // Hilfen für structs.js (Lebenspunkte/Kosten je Regierung und Stufe)
  WW.wallLevelInfo = function (govKey, level) {
    const lv = LEVELS[govKey] || LEVELS.monarchy;
    return lv[Math.max(1, Math.min(lv.length, level | 0)) - 1];
  };
  WW.wallLevelHpMul = function (govKey, level) { const i = WW.wallLevelInfo(govKey, level); return i ? i.hpMul : 1; };
  WW.wallLevelCost = function (govKey, type, level) {
    const i = WW.wallLevelInfo(govKey, level);
    if (!i || !i.cost) return null;
    const m = type === 'wall' ? 1 : 2;
    const out = {};
    for (const r in i.cost) out[r] = i.cost[r] * m;
    return out;
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
