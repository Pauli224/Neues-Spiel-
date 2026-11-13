// Wildnis, Kreaturen, Orte und Kräfte: alle Tabellen und Werte (Stufe 3). Lädt nach config.js.
// Verhalten steht in js/sim/creatures.js (WW.CreatureAI), js/sim/wild.js (Orte, Räuber, Alarm) und
// js/sim/powers.js (Kräfte). Hier nur Daten; Werkzeugmenü und Grafik lesen diese Tabellen.
(function (WW) { 'use strict';

  // ---------------------------------------------------------------------------
  // Allgemeine Werte
  // ---------------------------------------------------------------------------
  const CFG = {
    ANIMALS_PER_TILE: 0.03,      // weltweite Obergrenze Tiere+Monster = Fläche * Wert (geklemmt)
    ANIMALS_MIN: 150, ANIMALS_MAX: 900,
    THINK: 8,                    // Tiere denken alle 8 Ticks (gestaffelt nach id)
    FOOD_DECAY: 3,               // Sättigung (0..100) sinkt je Denkschritt
    GRAZE_BITE: 90,              // so stark wird eine Kachel beim Fressen abgeweidet (0..255)
    GRAZE_REGROW: 6,             // so viel wächst je Besuch der Gras-Schleife nach
    GRAZE_SHOW: 128,             // ab hier gilt die Kachel als abgeweidet (Darstellung)
    SLICES: 16,                  // Natur-Schleife bearbeitet je Tick 1/16 der Karte
    ASH_STEP: 3,                 // Wachstum der Asche je Besuch (bis 255 -> Wiese)
    LAVA_STEP: 4,                // Abkühlen frischer Lava je Besuch (bis 255 -> Asche/Fels)
    FALLOUT_DECAY: 2,            // Abklingen des Fallouts je Besuch
    CRACK_DECAY: 2,              // Erdbebenrisse verblassen
    FLOWER_BIRTH: 0.0006, FLOWER_DEATH: 0.0004,
    BERRY_BIRTH: 0.00006, BERRY_DEATH: 0.004, BERRY_REGROW: 0.05,
    ALARM_TICKS: 120,            // so lange bleibt eine Stadt nach einer Sichtung in Alarm
    ALARM_SCAN: 40,              // Städte prüfen alle 20 Ticks auf Gefahren
    SORTIE_MAX: 6,               // so viele Soldaten rücken höchstens gegen eine Gefahr aus
    CLEAR_RANGE: 12,             // Lager bis Gebietsradius + so viele Kacheln werden ausgeräumt
    MAX_EFFECTS: 40,             // gleichzeitige Dauer-Effekte (Sturm, Flut, Frost …)
    MAX_AIRCRAFT: 12,
    CHRONICLE_GAP: 240           // gleiche Wildnis-Meldung je Stadt höchstens einmal pro Jahr
  };

  // ---------------------------------------------------------------------------
  // Kreaturen. Felder:
  //   name/plural/desc (deutsch), category 'animal'|'monster', spawnable (Werkzeugmenü), hp, speed (Kacheln/Tick),
  //   hostile (Türme schießen, Soldaten greifen an), ai (Schlüssel in WW.CreatureAI), move 'land'|'water'|'sand'|'air'|'ghost',
  //   flying, ghost, aquatic (für Darstellung/UI), habitat (Gelände-Schlüssel), area (Habitat-Kacheln je Tier, Obergrenze),
  //   max (absolute Obergrenze der Art), life (Jahre), breed (Vermehrungschance je Denkschritt bei vollem Bauch),
  //   group [min,max] Herdengröße beim Besiedeln, diet 'grass'|'meat'|'none', prey (Beute-Arten), dmg, sight, range,
  //   food (Fleisch für den Jäger), loot { Rohstoff: Menge } für die Stadt des Bezwingers, armor 0..1, boss (Chronik)
  // ---------------------------------------------------------------------------
  const GRASSY = ['grass', 'flowers', 'savanna', 'tundra'];
  const WOODS = ['forest', 'taiga', 'jungle', 'mushroom'];
  const C = {
    sheep: { name: 'Schaf', plural: 'Schafe', desc: 'Frisst Wiese, blökt, hält zusammen.', category: 'animal', hp: 12, speed: 0.035,
      ai: 'grazer', move: 'land', habitat: GRASSY, area: 60, max: 70, life: 12, breed: 0.05, group: [3, 6], diet: 'grass', food: 4, flock: true },
    cow: { name: 'Kuh', plural: 'Kühe', desc: 'Gemütlich. Sehr gemütlich. Frisst für drei.', category: 'animal', hp: 30, speed: 0.025,
      ai: 'grazer', move: 'land', habitat: ['grass', 'flowers', 'savanna'], area: 120, max: 40, life: 16, breed: 0.03, group: [2, 4], diet: 'grass', food: 8, flock: true },
    chicken: { name: 'Huhn', plural: 'Hühner', desc: 'Pickt, gackert, hat vor allem Angst.', category: 'animal', hp: 6, speed: 0.045,
      ai: 'grazer', move: 'land', habitat: ['grass', 'flowers', 'savanna'], area: 140, max: 40, life: 7, breed: 0.07, group: [2, 5], diet: 'grass', food: 2, flock: true },
    rabbit: { name: 'Hase', plural: 'Hasen', desc: 'Hoppelt schnell, vermehrt sich schneller.', category: 'animal', hp: 5, speed: 0.07,
      ai: 'grazer', move: 'land', habitat: ['grass', 'flowers', 'tundra', 'savanna', 'snowfield'], area: 55, max: 80, life: 5, breed: 0.10, group: [2, 4], diet: 'grass', food: 2 },
    deer: { name: 'Hirsch', plural: 'Hirsche', desc: 'Scheu, edel, nascht Beeren am Waldrand.', category: 'animal', hp: 22, speed: 0.06,
      ai: 'grazer', move: 'land', habitat: WOODS.concat(['grass']), area: 80, max: 50, life: 14, breed: 0.04, group: [2, 4], diet: 'grass', food: 6, berries: true, flock: true },
    wolf: { name: 'Wolf', plural: 'Wölfe', desc: 'Jagt im Rudel. Mag Schafe – leider zum Essen.', category: 'animal', hp: 26, speed: 0.07, hostile: true,
      ai: 'predator', move: 'land', habitat: ['forest', 'taiga', 'grass', 'tundra'], area: 320, max: 26, life: 12, breed: 0.03, group: [3, 4],
      diet: 'meat', dmg: 2.5, sight: 7, prey: ['sheep', 'rabbit', 'deer', 'chicken'], huntsUnits: true, pack: true, food: 3 },
    bear: { name: 'Bär', plural: 'Bären', desc: 'Liebt Beeren, Honig und seine Ruhe. Störe ihn nicht.', category: 'animal', hp: 70, speed: 0.045, hostile: true,
      ai: 'predator', move: 'land', habitat: ['forest', 'taiga', 'hill'], area: 600, max: 10, life: 20, breed: 0.015, group: [1, 1],
      diet: 'meat', dmg: 7, sight: 5, prey: ['deer', 'rabbit', 'sheep', 'cow'], huntsUnits: true, berries: true, food: 10 },
    crab: { name: 'Krabbe', plural: 'Krabben', desc: 'Läuft seitwärts über den Strand und zwickt aus Prinzip.', category: 'animal', hp: 6, speed: 0.03,
      ai: 'crab', move: 'land', habitat: ['sand'], area: 30, max: 40, life: 6, breed: 0.05, group: [2, 4], diet: 'none', food: 1, stay: true },
    fish: { name: 'Fisch', plural: 'Fische', desc: 'Schwimmt im Wasser und springt manchmal vor Freude.', category: 'animal', hp: 4, speed: 0.04,
      ai: 'fish', move: 'water', aquatic: true, habitat: ['shallow', 'water', 'river', 'deep'], area: 70, max: 70, life: 5, breed: 0.06, group: [3, 5], diet: 'none', food: 2 },

    dragon: { name: 'Drache', plural: 'Drachen', desc: 'Fliegt über alles hinweg, speit Feuer und hütet einen Goldhort.', category: 'monster', hp: 420, speed: 0.09, hostile: true,
      ai: 'dragon', move: 'air', flying: true, habitat: ['mountain', 'hill', 'snow'], max: 4, life: 300, dmg: 14, sight: 6, armor: 0.2, boss: true, loot: { gold: 60 } },
    zombie: { name: 'Zombie', plural: 'Zombies', desc: 'Schlurft, stöhnt und steckt alle an, die er erwischt.', category: 'monster', hp: 40, speed: 0.028, hostile: true,
      ai: 'zombie', move: 'land', habitat: ['swamp', 'ash'], max: 60, life: 5, dmg: 4, sight: 8, undead: true },
    skeleton: { name: 'Skelett', plural: 'Skelette', desc: 'Klappert, schießt mit Knochenpfeilen und bewacht alte Schätze.', category: 'monster', hp: 35, speed: 0.05, hostile: true,
      ai: 'skeleton', move: 'land', habitat: ['desert', 'ash', 'hill'], max: 30, life: 60, dmg: 4, sight: 7, range: 3.5, undead: true, loot: { stone: 2 } },
    slime: { name: 'Schleim', plural: 'Schleime', desc: 'Wabbelt. Wer ihn haut, hat danach zwei.', category: 'monster', hp: 16, speed: 0.025, hostile: true,
      ai: 'slime', move: 'land', habitat: ['swamp', 'mushroom'], max: 50, life: 20, dmg: 3, sight: 5 },
    ghost: { name: 'Geist', plural: 'Geister', desc: 'Schwebt durch Mauern und erschreckt alle zu Tode. Fast.', category: 'monster', hp: 50, speed: 0.04, hostile: true,
      ai: 'ghost', move: 'ghost', ghost: true, habitat: ['ash', 'swamp'], max: 20, life: 8, dmg: 0, sight: 3, armor: 0.5, undead: true },
    demon: { name: 'Dämon', plural: 'Dämonen', desc: 'Kommt aus der Lava, zündelt gern und hat schlechte Laune.', category: 'monster', hp: 120, speed: 0.055, hostile: true,
      ai: 'demon', move: 'land', habitat: ['ash', 'lava'], max: 10, life: 40, dmg: 8, sight: 6, boss: true, fireproof: true, loot: { gold: 15 } },
    giantchicken: { name: 'Riesenhuhn', plural: 'Riesenhühner', desc: 'Ein Huhn, nur sehr viel mehr davon. Trampelt Felder platt.', category: 'monster', hp: 90, speed: 0.06, hostile: true,
      ai: 'giantchicken', move: 'land', habitat: ['grass', 'flowers'], max: 6, life: 20, dmg: 1.5, sight: 8, boss: true, food: 30 },
    yeti: { name: 'Yeti', plural: 'Yetis', desc: 'Zottelig, scheu und wirft Schneebälle mit Wucht.', category: 'monster', hp: 160, speed: 0.05, hostile: true,
      ai: 'yeti', move: 'land', habitat: ['snowfield', 'tundra', 'taiga'], area: 500, max: 8, life: 80, dmg: 6, sight: 5, range: 3, boss: true, stay: true, food: 12 },
    sandworm: { name: 'Sandwurm', plural: 'Sandwürmer', desc: 'Taucht unter dem Sand auf, schnappt zu und ist wieder weg.', category: 'monster', hp: 200, speed: 0.07, hostile: true,
      ai: 'sandworm', move: 'sand', habitat: ['desert', 'sand'], area: 600, max: 6, life: 100, dmg: 25, sight: 6, boss: true, burrow: true },
    treant: { name: 'Baumhirte', plural: 'Baumhirten', desc: 'Ein wandelnder Baum. Pflanzt Wald und mag keine Holzfäller.', category: 'monster', hp: 220, speed: 0.025, hostile: true,
      ai: 'treant', move: 'land', habitat: WOODS, area: 900, max: 8, life: 300, dmg: 12, sight: 8, boss: true, stay: true, armor: 0.2, loot: { wood: 30 } },
    golem: { name: 'Kristallgolem', plural: 'Kristallgolems', desc: 'Ein glitzernder Fels mit Beinen. Bewacht das Kristallfeld.', category: 'monster', hp: 300, speed: 0.02, hostile: true,
      ai: 'golem', move: 'land', habitat: ['crystal'], area: 150, max: 8, life: 500, dmg: 15, sight: 4, boss: true, stay: true, armor: 0.6, loot: { stone: 40, gold: 10 } }
  };
  // natürliche Bewohner eines Bioms (Zielzahl = Habitat / area, geklemmt), die von selbst einwandern
  const NATIVES = ['yeti', 'sandworm', 'treant', 'golem', 'slime'];
  const NATIVE_AREA = { yeti: 500, sandworm: 600, treant: 1100, golem: 150, slime: 400 };
  const NATIVE_MAX = 3;

  // ---------------------------------------------------------------------------
  // Orte in der Wildnis (Bauwerkstyp 'lair', Feld kind). Sprite s_lair_<kind>.
  //   resident: Kreatur-Art oder 'bandit' (Einheit), max/respawn (Ticks) für Brutstätten, area (Kacheln je Ort beim
  //   Erzeugen), habitat, minDist (zu Städten/Startplätzen), hostile (Soldaten räumen aus), amount (Adern), hp
  // ---------------------------------------------------------------------------
  const LAIRS = {
    wolfden: { name: 'Wolfsbau', desc: 'Hier wohnt ein Rudel. Es wird immer wieder eins wohnen.', category: 'place', spawnable: true,
      resident: 'wolf', max: 4, respawn: 360, area: 3200, habitat: ['forest', 'taiga', 'tundra'], minDist: 20, hostile: true, hp: 120 },
    bearcave: { name: 'Bärenhöhle', desc: 'Dunkel, gemütlich, riecht nach Bär.', category: 'place', spawnable: true,
      resident: 'bear', max: 2, respawn: 720, area: 5500, habitat: ['hill', 'forest', 'taiga'], minDist: 20, hostile: true, hp: 200 },
    dragonhoard: { name: 'Drachenhort', desc: 'Ein Berg aus Gold, darauf ein schlafender Drache. Meistens schlafend.', category: 'place', spawnable: true,
      resident: 'dragon', max: 1, respawn: 2400, area: 14000, habitat: ['hill', 'mountain', 'snow'], minDist: 30, hostile: false, hp: 600, nearMountain: true, gold: 120 },
    banditcamp: { name: 'Räuberlager', desc: 'Lagerfeuer, Zelte, gestohlene Kochtöpfe. Die Bewohner überfallen Händler und Felder.', category: 'place', spawnable: true,
      resident: 'bandit', max: 4, respawn: 480, area: 7000, habitat: ['forest', 'grass', 'savanna', 'taiga', 'jungle'], minDist: 26, hostile: true, hp: 150 },
    treasure: { name: 'Ruine mit Schatz', desc: 'Alte Mauern, alte Knochen, alte Truhe. Wer sie findet, wird reich.', category: 'place', spawnable: true,
      resident: 'skeleton', max: 2, respawn: 960, area: 5000, habitat: ['grass', 'desert', 'savanna', 'hill', 'ash', 'tundra', 'forest'], minDist: 14, hostile: true, hp: 300, gold: 50 },
    ore: { name: 'Erzader', desc: 'Glänzender Stein im Hang. Eine Stadt in der Nähe bekommt jedes Jahr Stein.', category: 'place', spawnable: true,
      resident: null, area: 3000, habitat: ['hill'], minDist: 10, hostile: false, hp: 9999, amount: 240, yield: { stone: 12 } },
    goldvein: { name: 'Goldader', desc: 'Es funkelt! Eine Stadt in der Nähe bekommt jedes Jahr Gold.', category: 'place', spawnable: true,
      resident: null, area: 6500, habitat: ['hill', 'desert', 'mountain'], minDist: 10, hostile: false, hp: 9999, amount: 120, yield: { gold: 8 }, nearMountain: true }
  };

  // ---------------------------------------------------------------------------
  // Kräfte (Daten). Verhalten: WW.POWERS[key].apply in js/sim/powers.js.
  //   category, name, desc, radius (Kacheln, für Zeiger/Vorschau), duration (Ticks, 0 = sofort),
  //   brush (beim Ziehen wiederholt anwenden), dir (nimmt { dx, dy } aus der Ziehbewegung), aim (Ziel per aimAircraft nachführen)
  // ---------------------------------------------------------------------------
  const POWER_CATEGORIES = [
    { key: 'terrain', name: 'Land formen' },
    { key: 'nature', name: 'Naturgewalten' },
    { key: 'destruction', name: 'Zerstörung' },
    { key: 'life', name: 'Leben und Segen' },
    { key: 'meddle', name: 'Eingriffe' }
  ];
  const P = {
    lightning: { category: 'nature', name: 'Blitz', desc: 'Ein gezielter Blitz. Zündet, was brennt.', radius: 1.5, duration: 0 },
    fire: { category: 'nature', name: 'Feuer', desc: 'Ein kleines Feuer. Wird schnell ein großes.', radius: 1.5, duration: 0, brush: true },
    rain: { category: 'nature', name: 'Regen', desc: 'Löscht Brände, lässt Wald wachsen und Felder reifen.', radius: 5, duration: 0 },
    meteor: { category: 'nature', name: 'Meteor', desc: 'Ein Brocken aus dem All. Hinterlässt Krater und Fragen.', radius: 2.5, duration: 0 },
    plague: { category: 'life', name: 'Seuche', desc: 'Alle niesen. Manche hören nie wieder damit auf.', radius: 4, duration: 0 },
    bless: { category: 'life', name: 'Segen', desc: 'Heilt, macht glücklich und lässt die Ernte reifen.', radius: 5, duration: 0 },

    raise: { category: 'terrain', name: 'Land heben', desc: 'Drückt das Land nach oben: aus Meer wird Strand, aus Wiese Hügel, aus Hügel Berg.', radius: 3, duration: 0, brush: true },
    lower: { category: 'terrain', name: 'Land senken', desc: 'Drückt das Land hinunter, bis das Meer hereinschwappt.', radius: 3, duration: 0, brush: true },
    seeds: { category: 'terrain', name: 'Saat', desc: 'Streut Samen: Bäume, Blumen und Beerensträucher sprießen.', radius: 3, duration: 0, brush: true },

    earthquake: { category: 'nature', name: 'Erdbeben', desc: 'Die Erde reißt entlang einer Linie auf. Mauern bekommen Risse.', radius: 9, duration: 0, dir: true },
    volcano: { category: 'nature', name: 'Vulkan', desc: 'Ein Berg wächst, Lava fließt bergab und wird zu Asche.', radius: 4, duration: 160 },
    tornado: { category: 'nature', name: 'Wirbelsturm', desc: 'Wandert umher, wirbelt Leute durch die Luft und deckt Dächer ab.', radius: 1.6, duration: 200 },
    acidrain: { category: 'nature', name: 'Säureregen', desc: 'Ätzender Regen: Bäume welken, Holz zerfrisst, alle werden krank.', radius: 5, duration: 150 },
    flood: { category: 'nature', name: 'Flut', desc: 'Das Wasser steigt eine Weile über die Ufer und geht dann zurück.', radius: 7, duration: 380 },
    frost: { category: 'nature', name: 'Frost', desc: 'Alles friert zu Schneefeld, Seen werden begehbar, die Ernte erfriert.', radius: 5, duration: 480 },
    drought: { category: 'nature', name: 'Dürre', desc: 'Wiese wird Savanne, Savanne wird Wüste, Felder verdorren.', radius: 6, duration: 0 },
    breeze: { category: 'nature', name: 'Frische Brise', desc: 'Pustet Feuer aus, vertreibt Seuchen, Säure und Geister.', radius: 7, duration: 0 },

    bomb: { category: 'destruction', name: 'Bombe', desc: 'Rumms. Ein kleiner Krater und viel Staub.', radius: 2.5, duration: 0 },
    clusterbomb: { category: 'destruction', name: 'Splitterbombe', desc: 'Zerplatzt in viele kleine Rummse.', radius: 6, duration: 30 },
    napalm: { category: 'destruction', name: 'Napalm', desc: 'Ein Feuerteppich, der lange brennt – sogar auf Sand.', radius: 3.5, duration: 0, brush: true },
    rocket: { category: 'destruction', name: 'Rakete', desc: 'Pfeift vom Kartenrand heran und schlägt ein.', radius: 3, duration: 40 },
    bomber: { category: 'destruction', name: 'Bombenteppich', desc: 'Ein Flugzeug überfliegt das Ziel in Ziehrichtung und wirft eine Reihe Bomben.', radius: 10, duration: 0, dir: true },
    gunship: { category: 'destruction', name: 'Kanonenflieger', desc: 'Kreist zwölf Sekunden über dem Ziel und feuert Salven. Halten zum Nachführen.', radius: 7, duration: 120, aim: true },
    nuke: { category: 'destruction', name: 'Atombombe', desc: 'Blitz, Druckwelle, Pilzwolke, Krater. Danach ist dort lange nichts los.', radius: 10, duration: 0 },
    tsar: { category: 'destruction', name: 'Großer Rumms', desc: 'Die allergrößte Bombe. Verwüstet einen ganzen Landstrich.', radius: 20, duration: 0 },
    orbitallaser: { category: 'destruction', name: 'Laser aus dem All', desc: 'Ein Strahl von oben. Ziehen zieht eine Brand- und Schmelzspur.', radius: 1.2, duration: 0, brush: true },
    blackhole: { category: 'destruction', name: 'Schwarzes Loch', desc: 'Saugt eine Weile alles an und verschwindet mit einem Knall.', radius: 8, duration: 80 },

    madness: { category: 'life', name: 'Wahnsinn', desc: 'Eine Einheit oder ein Tier dreht durch und greift alle an.', radius: 2.5, duration: 720 },
    love: { category: 'life', name: 'Liebe', desc: 'Herzchen überall. Babyboom bei Leuten und Tieren.', radius: 5, duration: 0 },
    goldrain: { category: 'life', name: 'Goldregen', desc: 'Es regnet Münzen in die Stadtkasse.', radius: 4, duration: 0 },
    heal: { category: 'life', name: 'Heilung', desc: 'Heilt Leute, Tiere und Mauern. Untote mögen das gar nicht.', radius: 5, duration: 0 },

    wrecker: { category: 'meddle', name: 'Abrissbirne', desc: 'Reißt genau ein Bauwerk ab.', radius: 0.6, duration: 0 },
    wallbrush: { category: 'meddle', name: 'Mauer malen', desc: 'Setzt Mauerstücke, die keiner Stadt gehören.', radius: 0.6, duration: 0, brush: true },
    hand: { category: 'meddle', name: 'Göttliche Hand', desc: 'Hebt eine Einheit oder ein Tier hoch; nochmal tippen setzt es ab.', radius: 1.5, duration: 0 }
  };

  WW.WILD = {
    CFG: CFG, CREATURES: C, CREATURE_KEYS: Object.keys(C), NATIVES: NATIVES, NATIVE_AREA: NATIVE_AREA, NATIVE_MAX: NATIVE_MAX,
    LAIRS: LAIRS, LAIR_KEYS: Object.keys(LAIRS), POWER_DEFS: P, POWER_CATEGORIES: POWER_CATEGORIES,
    CREATURE_CATEGORIES: [{ key: 'animal', name: 'Tiere' }, { key: 'monster', name: 'Monster' }, { key: 'place', name: 'Orte' }]
  };
  WW.LAIRS = LAIRS;
  WW.LAIR_KEYS = WW.WILD.LAIR_KEYS;

  // Bauwerkstyp für Orte in der Wildnis (Grundfläche 1×1, begehbar, gehört keiner Stadt)
  if (WW.STRUCT_INFO && !WW.STRUCT_INFO.lair) {
    WW.STRUCT_INFO.lair = { name: 'Ort in der Wildnis', w: 1, h: 1, work: 1, hp: [150], cost: [{}], burn: 0.2 };
  }
  // Rolle Räuber (Einheit ohne Reich, kingdomId -1)
  if (WW.ROLE_NAMES && !WW.ROLE_NAMES.bandit) { WW.ROLE_NAMES.bandit = 'Räuber'; if (WW.ROLE_NAMES_F) WW.ROLE_NAMES_F.bandit = 'Räuberin'; }

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
