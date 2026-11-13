// Datengetriebene Spielwerte: Tempo, Regierungen, Völker, Bauwerke, Rollen, Gesetze.
// Gelände steht ausschließlich in js/core/terrain.js (WW.TERRAIN, WW.T, WW.TERRAIN_LUT).
(function (WW) { 'use strict';

  // ---------------------------------------------------------------------------
  // Allgemeine Tempo- und Balancewerte
  // ---------------------------------------------------------------------------
  WW.CONFIG = {
    VERSION: 1,
    TPS: 10,                  // Ticks pro Sekunde bei 1×
    TPY: 240,                 // Ticks pro Jahr (24 s bei 1×)
    MAX_UNITS: 1500,
    MAX_ANIMALS: 240,
    MAX_EVENTS: 400,
    UNIT_SPEED: 0.1,         // Kacheln pro Tick bei walk = 1
    ADULT_AGE: 6,             // Jahre
    LIFESPAN: 62,             // Jahre (± 14, mal Volksfaktor)
    FOOD_PER_YEAR: 2.2,       // Nahrung je Kopf und Jahr
    BIRTH_RATE: 0.0075,       // Geburtschance je Erwachsenem und Sekunde (bei Platz + Essen)
    START_STOCK: { food: 36, wood: 26, stone: 4, gold: 0 },
    HARVEST: 14,               // Nahrung je reifem Feld (mal Fruchtbarkeit)
    CHOP: 7, MINE: 5,         // Holz/Stein je Gang
    FISH: 3,
    FIELD_STAGE_TICKS: 60,    // Ticks je Wachstumsstufe (3 Stufen bis reif)
    BASE_HP: 30, CHILD_HP: 16, SOLDIER_HP: 55, LEADER_HP: 40,
    BASE_DMG: 4, SOLDIER_DMG: 9,
    WALL_MARGIN: 2.6,         // Abstand Ring zu Kerngebäuden
    WALL_RESERVE: 6.5,        // Wachstumsfläche (Radius um das Zentrum), die der erste Ring einschließt
    WALL_RESERVE_STEP: 4,     // je Stadterweiterung so viel größer
    WALL_EXPAND_YEARS: 5,     // frühestens alle n Jahre erweitern
    TOWER_RANGE: 5.5, TOWER_DMG: 7, TOWER_COOLDOWN: 14,
    PATH_BUDGET: 14000,       // A*-Knoten pro Tick weltweit
    PATH_LIMIT: 2500,         // Knotenlimit je Suche (normal)
    PATH_LIMIT_LONG: 14000,   // Siedler, Heere, Händler
    TERRITORY_BASE: 9,
    SETTLER_DIST_MIN: 24, SETTLER_DIST_MAX: 40,
    CITY_MIN_DIST: 22,        // Mindestabstand Tochterstadt / Startstadt zu anderen Städten (Mitte zu Mitte)
    PLAYER_CITY_MIN_DIST: 12  // Siedler vom Spieler dürfen näher heran
  };

  // ---------------------------------------------------------------------------
  // Stadtstufen
  // ---------------------------------------------------------------------------
  WW.CITY_TIERS = [
    { key: 'camp', name: 'Lager', nameA: 'ein Lager', minPop: 0 },
    { key: 'village', name: 'Dorf', nameA: 'ein Dorf', minPop: 8 },
    { key: 'town', name: 'Stadt', nameA: 'eine Stadt', minPop: 20 },
    { key: 'city', name: 'Großstadt', nameA: 'eine Großstadt', minPop: 40 }
  ];

  // ---------------------------------------------------------------------------
  // Regierungen
  // ---------------------------------------------------------------------------
  WW.GOV_KEYS = ['tribe', 'monarchy', 'democracy', 'fascism', 'communism', 'theocracy', 'republic', 'anarchy'];

  // Standardwerte, die jede Regierung überschreiben kann
  const GOV_BASE = {
    wallThreshold: 10, wallMax: 3, wallHpMul: 1, wallSpeedMul: 1, buildMul: 1, workMul: 1,
    happiness: 0, growthMul: 1, soldierShare: 0.1, goldMul: 1, taxes: 0, aggression: 0.35,
    militia: false, noLeader: false, sharedStock: false, noMarket: false, barricades: false,
    neverWar: false, traders: false, mercenaries: false, buysPeace: false,
    // Kriegsführung: raid | knights | defend | mass | agitate | holy | mercs | militia
    war: 'raid', soldierMul: 1, unitHpMul: 1, unitDmgMul: 1,
    // Bauprogramm: je Typ { first: ab Einwohnern, per: je weitere n Einwohner, max }; towerSpacing 0 = keine Türme
    build: {
      barracks: { first: 16, per: 30, max: 1 }, market: { first: 18, per: 30, max: 1 },
      monument: { first: 22, per: 40, max: 1 }, towerSpacing: 6
    }
  };

  const G = {
    tribe: {
      name: 'Stammesrat', titleM: 'Häuptling', titleF: 'Häuptlingin', realm: 'Stamm',
      centerName: 'Langhaus mit Lagerfeuer', monumentName: 'Hinkelstein',
      desc: 'Man sitzt ums Feuer, bis jemand eine Entscheidung trifft oder das Holz ausgeht.',
      pros: ['Zufriedenheit +5', 'Entwickelt sich ab Stadtgröße weiter'],
      cons: ['Nur Palisaden (Stufe 1)', 'Mauer erst ab 14 Einwohnern'],
      wallThreshold: 14, wallMax: 1, happiness: 5, soldierShare: 0.08, aggression: 0.35,
      war: 'raid', build: { barracks: { first: 99, per: 99, max: 0 }, market: { first: 99, per: 99, max: 0 }, monument: { first: 12, per: 99, max: 1 }, towerSpacing: 0 },
      looks: { center: 'Langhaus mit Lagerfeuer', wall: 'Palisade, hölzerner Ausguck', house: 'Strohhütte', monument: 'Hinkelstein' }
    },
    monarchy: {
      name: 'Monarchie', titleM: 'König', titleF: 'Königin', realm: 'Königreich',
      centerName: 'Burg', monumentName: 'Königsstatue',
      desc: 'Einer trägt die Krone, alle anderen tragen die Steuern.',
      pros: ['Mauern früh (ab 8 Einw.)', 'Mauern +30 % stabiler', 'Steuern bringen Gold'],
      cons: ['Erbfolge mit Thronstreit-Gefahr', 'Steuern drücken die Laune'],
      wallThreshold: 8, wallHpMul: 1.3, taxes: 0.02, happiness: -3, soldierShare: 0.13, aggression: 0.5,
      war: 'knights', unitHpMul: 1.3, unitDmgMul: 1.2, build: { barracks: { first: 14, per: 25, max: 2 }, market: { first: 18, per: 40, max: 1 }, monument: { first: 22, per: 60, max: 1 }, towerSpacing: 5 },
      looks: { center: 'Burg', wall: 'grauer Stein, runde Türme mit Kegeldach und Wimpel', house: 'Fachwerkhaus', monument: 'Königsstatue' }
    },
    democracy: {
      name: 'Demokratie', titleM: 'Kanzler', titleF: 'Kanzlerin', realm: 'Freistaat',
      centerName: 'Rathaus', monumentName: 'Rednerpult mit Wahlurne',
      desc: 'Alle sechs Jahre darf jeder mitreden, dazwischen redet jeder trotzdem mit.',
      pros: ['Zufriedenheit +15', 'Wachstum +15 %', 'Wahlen mit Bonus der Siegerpartei'],
      cons: ['Wenige Soldaten', 'Erklärt selten Krieg'],
      happiness: 15, growthMul: 1.15, soldierShare: 0.05, aggression: 0.12,
      war: 'defend', build: { barracks: { first: 35, per: 60, max: 1 }, market: { first: 14, per: 25, max: 2 }, monument: { first: 20, per: 60, max: 1 }, towerSpacing: 8 },
      looks: { center: 'Rathaus mit Uhrturm und Säulen', wall: 'heller Sandstein, Türme mit Fahne', house: 'buntes Bürgerhaus', monument: 'Rednerpult mit Wahlurne' }
    },
    fascism: {
      name: 'Faschismus', titleM: 'Diktator', titleF: 'Diktatorin', realm: 'Strammstaat',
      centerName: 'Kommandantur', monumentName: 'Propagandaturm',
      desc: 'Alles ist geregelt, sogar die Freude, und die ist leider gestrichen.',
      pros: ['Sehr viele Soldaten', 'Mauern ab 6 Einw. und +50 % schneller', 'Arbeit +15 % (Zwang)'],
      cons: ['Zufriedenheit −25', 'Widerstand und Aufstände', 'Keiner mag das Regime'],
      wallThreshold: 6, wallSpeedMul: 1.5, workMul: 1.15, happiness: -25, soldierShare: 0.3, aggression: 0.9,
      war: 'mass', soldierMul: 1, build: { barracks: { first: 9, per: 12, max: 4 }, market: { first: 99, per: 99, max: 0 }, monument: { first: 12, per: 25, max: 2 }, towerSpacing: 3 },
      looks: { center: 'Kommandantur (grauer Betonklotz mit Bannern)', wall: 'Beton mit Stacheldraht, eckige Wachtürme, Schlagbaum', house: 'graue Einheitsblöcke', monument: 'Propagandaturm mit Lautsprechern' }
    },
    communism: {
      name: 'Kommunismus', titleM: 'Generalsekretär', titleF: 'Generalsekretärin', realm: 'Volksrepublik',
      centerName: 'Volkshaus', monumentName: 'Denkmal der Planübererfüllung',
      desc: 'Alles gehört allen, nur der Schlüssel zum Lager gehört dem Ausschuss.',
      pros: ['Gemeinsames Lager aller Städte', 'Bauen +25 %', 'Fünfjahresplan +50 % auf Schwerpunkt'],
      cons: ['Arbeitstempo −10 % (Schlendrian)', 'Kein Markt, kein Gold'],
      buildMul: 1.25, workMul: 0.9, sharedStock: true, noMarket: true, goldMul: 0, soldierShare: 0.12, aggression: 0.45,
      war: 'agitate', build: { barracks: { first: 22, per: 50, max: 1 }, market: { first: 99, per: 99, max: 0 }, monument: { first: 18, per: 60, max: 1 }, towerSpacing: 7 },
      looks: { center: 'Volkshaus mit Fahne und Schornstein', wall: 'Betonplatten, schlichte Blocktürme', house: 'Plattenbau', monument: 'Denkmal der Planübererfüllung (Riesenrübe)' }
    },
    theocracy: {
      name: 'Theokratie', titleM: 'Hohepriester', titleF: 'Hohepriesterin', realm: 'Gottesstaat',
      centerName: 'Tempel', monumentName: 'Schrein',
      desc: 'Die Gottheit hat zu allem eine Meinung, ausgerichtet von der Priesterschaft.',
      pros: ['Schrein hebt die Laune', 'Gelegentliche Wunder', 'Zufriedenheit +5'],
      cons: ['Arbeit −10 % (Beten)', 'Heilige Kriege gegen Andersgläubige'],
      happiness: 5, workMul: 0.9, soldierShare: 0.1, aggression: 0.55,
      war: 'holy', build: { barracks: { first: 24, per: 60, max: 1 }, market: { first: 22, per: 60, max: 1 }, monument: { first: 10, per: 12, max: 3 }, towerSpacing: 6 },
      looks: { center: 'Tempel mit Kuppel und goldener Spitze', wall: 'weißer Stein mit goldenen Kappen, Kuppeltürme', house: 'Fachwerk mit Türmchen', monument: 'Schrein der Gottheit' }
    },
    republic: {
      name: 'Handelsrepublik', titleM: 'Doge', titleF: 'Dogin', realm: 'Handelsrepublik',
      centerName: 'Kontor', monumentName: 'Goldene Waage',
      desc: 'Jedes Problem hat einen Preis, und der Rat kennt ihn auswendig.',
      pros: ['Gold ×2', 'Händler zwischen den Städten', 'Söldner und Freikauf aus Kriegen'],
      cons: ['Kaum eigene Soldaten', 'Abhängig vom Geldbeutel'],
      goldMul: 2, taxes: 0.01, happiness: 3, soldierShare: 0.04, aggression: 0.2, traders: true, mercenaries: true, buysPeace: true,
      war: 'mercs', build: { barracks: { first: 30, per: 60, max: 1 }, market: { first: 10, per: 14, max: 3 }, monument: { first: 22, per: 60, max: 1 }, towerSpacing: 7 },
      looks: { center: 'Kontor mit Treppengiebel und Kran', wall: 'roter Backstein, Türme mit Handelsflaggen', house: 'Giebelhaus', monument: 'Goldene Waage' }
    },
    anarchy: {
      name: 'Anarchie', titleM: '', titleF: '', realm: 'Freie Kommune',
      centerName: 'Kommune', monumentName: 'Bemalte Wand',
      desc: 'Niemand hat das Sagen, dafür sagen alle sehr viel.',
      pros: ['Zufriedenheit +10', 'Alle verteidigen als Miliz', 'Erklärt nie Krieg'],
      cons: ['Kein Anführer, keine Armee', 'Nur Barrikaden mit Lücken'],
      wallThreshold: 12, wallMax: 1, wallHpMul: 0.55, happiness: 10, soldierShare: 0, aggression: 0,
      militia: true, noLeader: true, barricades: true, neverWar: true,
      war: 'militia', build: { barracks: { first: 99, per: 99, max: 0 }, market: { first: 99, per: 99, max: 0 }, monument: { first: 16, per: 99, max: 1 }, towerSpacing: 0 },
      looks: { center: 'Kommune (bunter Flickenbau)', wall: 'Barrikaden aus Gerümpel', house: 'Bauwagen und Flickenhütten', monument: 'bemalte Wand' }
    }
  };
  WW.GOVERNMENTS = {};
  for (const k of WW.GOV_KEYS) {
    const g = Object.assign({ key: k }, GOV_BASE, G[k]);
    g.build = Object.assign({}, GOV_BASE.build, G[k].build || {});
    WW.GOVERNMENTS[k] = Object.freeze(g);
  }
  // Wie viele Gebäude eines Typs erlaubt diese Regierung bei pop Einwohnern?
  WW.govBuildCount = function (govKey, type, pop) {
    const b = (WW.GOVERNMENTS[govKey] || WW.GOVERNMENTS.tribe).build[type];
    if (!b || !b.max || pop < b.first) return 0;
    return Math.min(b.max, 1 + Math.floor((pop - b.first) / b.per));
  };

  // Meinungsdrift pro Jahr zwischen zwei Regierungsformen
  const COMPAT = {
    'democracy|democracy': 5, 'democracy|republic': 3, 'democracy|fascism': -6, 'democracy|anarchy': 1,
    'democracy|monarchy': 0, 'democracy|communism': -1,
    'fascism|fascism': -2, 'fascism|communism': -6, 'fascism|anarchy': -7, 'fascism|monarchy': -2,
    'fascism|theocracy': -3, 'fascism|republic': -4, 'fascism|tribe': -3,
    'communism|communism': 4, 'communism|republic': -5, 'communism|monarchy': -3, 'communism|anarchy': 1,
    'theocracy|theocracy': 1, 'theocracy|anarchy': -2,
    'monarchy|monarchy': 1, 'monarchy|anarchy': -3, 'monarchy|republic': 1,
    'republic|republic': 3, 'anarchy|anarchy': 4, 'tribe|tribe': 0
  };
  WW.govCompat = function (a, b) {
    const k1 = a + '|' + b, k2 = b + '|' + a;
    if (k1 in COMPAT) return COMPAT[k1];
    if (k2 in COMPAT) return COMPAT[k2];
    return -0.5;
  };

  // ---------------------------------------------------------------------------
  // Völker
  // ---------------------------------------------------------------------------
  WW.RACE_KEYS = ['human', 'elf', 'dwarf', 'orc', 'gnome', 'frog'];
  const RACE_BASE = {
    speed: 1, hp: 1, strength: 1, lifespan: 1, fertility: 1,
    yields: { food: 1, wood: 1, stone: 1 }, wallMul: 1, housingBonus: 0, aggression: 0,
    favTerrain: ['grass'], walkOverride: null, buildOn: null, noDeforest: false, ranged: false, fishing: false
  };
  const R = {
    human: {
      name: 'Menschen', singular: 'Mensch', adjective: 'menschlich',
      desc: 'Können alles ein bisschen und nichts so richtig, sind damit aber sehr zufrieden.',
      favTerrain: ['grass', 'flowers', 'savanna'],
      govPrefs: { tribe: 3, monarchy: 3, democracy: 2, fascism: 0.8, communism: 1, theocracy: 1, republic: 2, anarchy: 0.8 }
    },
    elf: {
      name: 'Elfen', singular: 'Elf', adjective: 'elfisch',
      desc: 'Schlank, schnell, uralt und ein wenig hochnäsig gegenüber Bäumefällern.',
      speed: 1.15, hp: 0.9, strength: 0.95, lifespan: 2.2, fertility: 0.5,
      yields: { food: 0.9, wood: 1.1, stone: 0.8 }, noDeforest: true, ranged: true,
      favTerrain: ['forest', 'jungle', 'mushroom', 'taiga'],
      govPrefs: { tribe: 1, monarchy: 2, democracy: 2, fascism: 0.2, communism: 0.5, theocracy: 3, republic: 2, anarchy: 1 }
    },
    dwarf: {
      name: 'Zwerge', singular: 'Zwerg', adjective: 'zwergisch',
      desc: 'Klein, zäh, langsam, und sie hören das Gestein flüstern. Meistens sagt es „Stein".',
      speed: 0.85, hp: 1.3, strength: 1.2, lifespan: 1.5, fertility: 0.8,
      yields: { food: 0.9, wood: 0.9, stone: 2 }, wallMul: 1.3,
      favTerrain: ['hill', 'tundra', 'crystal'],
      govPrefs: { tribe: 2, monarchy: 4, democracy: 1, fascism: 0.5, communism: 1, theocracy: 1, republic: 3, anarchy: 0.4 }
    },
    orc: {
      name: 'Orks', singular: 'Ork', adjective: 'orkisch',
      desc: 'Stark, laut, kinderreich und überzeugt, dass jeder Streit eine Einladung ist.',
      hp: 1.5, strength: 1.4, lifespan: 0.8, fertility: 1.4, aggression: 0.3,
      yields: { food: 0.7, wood: 1, stone: 1.1 },
      favTerrain: ['savanna', 'desert', 'ash'],
      govPrefs: { tribe: 4, monarchy: 2, democracy: 0.4, fascism: 1.6, communism: 1, theocracy: 1, republic: 0.5, anarchy: 1 }
    },
    gnome: {
      name: 'Wichtel', singular: 'Wichtel', adjective: 'wichtelig',
      desc: 'Winzig, flink und so zahlreich, dass keiner sie je vollständig gezählt hat.',
      speed: 1.15, hp: 0.6, strength: 0.6, lifespan: 0.9, fertility: 1.9, housingBonus: 2,
      favTerrain: ['flowers', 'mushroom', 'grass'],
      govPrefs: { tribe: 1, monarchy: 0.5, democracy: 3, fascism: 0.2, communism: 2, theocracy: 1, republic: 1, anarchy: 4 }
    },
    frog: {
      name: 'Froschlinge', singular: 'Froschling', adjective: 'froschig',
      desc: 'Quakfreudige Sumpfbewohner, die in jedem Fluss eine Abkürzung sehen.',
      walkOverride: { river: 1.1, swamp: 1.1 }, buildOn: ['swamp'], fishing: true,
      favTerrain: ['swamp', 'grass', 'jungle'],
      govPrefs: { tribe: 2, monarchy: 1, democracy: 2, fascism: 0.3, communism: 1, theocracy: 3, republic: 1, anarchy: 2 }
    }
  };
  WW.RACES = {};
  for (const k of WW.RACE_KEYS) WW.RACES[k] = Object.freeze(Object.assign({ key: k }, RACE_BASE, R[k]));

  // ---------------------------------------------------------------------------
  // Bauwerke
  // ---------------------------------------------------------------------------
  // work: Arbeitsmenge in Baumeister-Ticks; hp/cost je Stufe (Index 0 = Stufe 1)
  // w/h: Grundfläche in Kacheln (einzige Quelle; Platzsuche, Belegung, Abriss, Feuer lesen nur diese Werte)
  // core: zählt als Kerngebäude für den Mauerring; inside: wird innerhalb der Mauer gebaut
  WW.STRUCT_INFO = {
    center:   { name: 'Zentrum', w: 3, h: 3, core: true, inside: true, work: 200, hp: [360, 360, 360], cost: [{ wood: 12 }], burn: 0.3 },
    house:    { name: 'Haus', w: 2, h: 2, core: true, inside: true, work: 70, hp: [50, 90, 140], cost: [{ wood: 5 }, { wood: 4, stone: 5 }, { wood: 4, stone: 8 }], burn: 1 },
    field:    { name: 'Feld', w: 1, h: 1, work: 22, hp: [20], cost: [{}], burn: 1 },
    lumber:   { name: 'Holzfällerhütte', w: 2, h: 2, work: 60, hp: [60], cost: [{ wood: 4 }], burn: 1 },
    quarry:   { name: 'Steinbruch', w: 2, h: 2, work: 60, hp: [80], cost: [{ wood: 4 }], burn: 0.4 },
    barracks: { name: 'Kaserne', w: 2, h: 2, core: true, inside: true, work: 130, hp: [180], cost: [{ wood: 8, stone: 4 }], burn: 0.6 },
    market:   { name: 'Markt', w: 2, h: 2, core: true, inside: true, work: 120, hp: [120], cost: [{ wood: 8, stone: 2 }], burn: 1 },
    monument: { name: 'Denkmal', w: 1, h: 1, core: true, inside: true, work: 160, hp: [160], cost: [{ wood: 2, stone: 8 }], burn: 0 },
    wall:     { name: 'Mauer', w: 1, h: 1, work: 16, hp: [200, 600, 1100], cost: [{ wood: 1 }, { stone: 1 }, { stone: 2 }], burn: 1 },
    gate:     { name: 'Tor', w: 1, h: 1, work: 40, hp: [180, 520, 950], cost: [{ wood: 2 }, { stone: 3 }, { stone: 4 }], burn: 1 },
    tower:    { name: 'Turm', w: 1, h: 1, work: 50, hp: [240, 750, 1300], cost: [{ wood: 2 }, { stone: 3 }, { stone: 5 }], burn: 0.5 },
    ruin:     { name: 'Ruine', w: 1, h: 1, work: 1, hp: [1], cost: [{}], burn: 0 }
  };
  WW.WALL_STYLES = ['palisade', 'stone', 'fortress'];
  WW.WALL_STYLE_NAMES = { palisade: 'Palisade', stone: 'Steinmauer', fortress: 'Festungsmauer', barricade: 'Barrikade' };

  // ---------------------------------------------------------------------------
  // Rollen, Sprechblasen, Tiere
  // ---------------------------------------------------------------------------
  WW.ROLE_KEYS = ['farmer', 'lumberjack', 'miner', 'builder', 'soldier', 'leader', 'child', 'trader', 'rebel', 'settler'];
  WW.ROLE_NAMES = {
    farmer: 'Bauer', lumberjack: 'Holzfäller', miner: 'Steinmetz', builder: 'Baumeister', soldier: 'Soldat',
    leader: 'Anführer', child: 'Kind', trader: 'Händler', rebel: 'Rebell', settler: 'Siedler'
  };
  WW.ROLE_NAMES_F = {
    farmer: 'Bäuerin', lumberjack: 'Holzfällerin', miner: 'Steinmetzin', builder: 'Baumeisterin', soldier: 'Soldatin',
    leader: 'Anführerin', child: 'Kind', trader: 'Händlerin', rebel: 'Rebellin', settler: 'Siedlerin'
  };
  WW.BUBBLES = ['heart', 'bread', 'skull', 'exclaim', 'zzz', 'ballot', 'crown', 'angry', 'note', 'hammer', 'question'];

  // ---------------------------------------------------------------------------
  // Weltgesetze
  // ---------------------------------------------------------------------------
  WW.LAW_INFO = [
    { key: 'govChanges', name: 'Regierungen ändern sich von selbst', desc: 'Revolutionen, Putsche und Stämme, die erwachsen werden.', def: true },
    { key: 'wars', name: 'Kriege erlaubt', desc: 'Reiche dürfen sich von selbst den Krieg erklären.', def: true },
    { key: 'hunger', name: 'Hunger', desc: 'Ohne Essen wird man grantig und irgendwann gar nichts mehr.', def: true },
    { key: 'aging', name: 'Altern', desc: 'Bewohner werden alt und sterben irgendwann friedlich.', def: true },
    { key: 'disasters', name: 'Zufallskatastrophen', desc: 'Ab und zu schlägt ein Blitz ein oder eine Seuche geht um.', def: true }
  ];
  WW.LAW_DEFAULTS = {};
  for (const l of WW.LAW_INFO) WW.LAW_DEFAULTS[l.key] = l.def;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
