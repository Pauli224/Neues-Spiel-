// Gemeinsame Gelände-Tabelle für Weltgenerator, Simulation und Darstellung.
// Einzige Quelle der Wahrheit: IDs sind stabil (stehen in Spielständen), nur hinten anfügen.
(function (WW) { 'use strict';

  // rank:   Höhenstufe (0 Tiefsee … 7 Schneegipfel); höhere Kacheln zeigen zur tieferen hin eine Kante
  // walk:   Laufgeschwindigkeit (0 = nicht begehbar)
  // build:  Gebäude dürfen hier stehen
  // wall:   Mauern dürfen hier stehen (Fluss = Wassertor)
  // fertile: Ertrag von Feldern (0 = keine Felder)
  // wood / stone: Rohstoff, den Sammler hier holen
  // water:  zählt als Wasser (natürliche Barriere, Fischfang, löscht Feuer)
  // burn:   Brennbarkeit 0..1
  // color:  Farbe für Minikarte und Generator-Vorschau
  const defs = [
    { key: 'deep',      name: 'Tiefsee',       rank: 0, walk: 0,    build: false, wall: false, fertile: 0,   wood: 0, stone: 0, water: true,  burn: 0,   color: '#1f4e8c' },
    { key: 'water',     name: 'Meer',          rank: 1, walk: 0,    build: false, wall: false, fertile: 0,   wood: 0, stone: 0, water: true,  burn: 0,   color: '#2f72b8' },
    { key: 'sand',      name: 'Strand',        rank: 3, walk: 0.9,  build: true,  wall: true,  fertile: 0,   wood: 0, stone: 0, water: false, burn: 0,   color: '#ead9a0' },
    { key: 'grass',     name: 'Wiese',         rank: 4, walk: 1,    build: true,  wall: true,  fertile: 1,   wood: 0, stone: 0, water: false, burn: 0.3, color: '#6fbf4a' },
    { key: 'forest',    name: 'Wald',          rank: 4, walk: 0.7,  build: true,  wall: true,  fertile: 0.6, wood: 1, stone: 0, water: false, burn: 0.8, color: '#2f8a3c' },
    { key: 'hill',      name: 'Hügel',         rank: 5, walk: 0.6,  build: true,  wall: true,  fertile: 0.3, wood: 0, stone: 1, water: false, burn: 0.1, color: '#9aa56a' },
    { key: 'mountain',  name: 'Gebirge',       rank: 6, walk: 0,    build: false, wall: false, fertile: 0,   wood: 0, stone: 1, water: false, burn: 0,   color: '#7d7f88' },
    { key: 'snow',      name: 'Schneegipfel',  rank: 7, walk: 0,    build: false, wall: false, fertile: 0,   wood: 0, stone: 1, water: false, burn: 0,   color: '#eef3f7' },
    { key: 'shallow',   name: 'Flachwasser',   rank: 2, walk: 0,    build: false, wall: false, fertile: 0,   wood: 0, stone: 0, water: true,  burn: 0,   color: '#55a8d6' },
    { key: 'river',     name: 'Fluss',         rank: 2, walk: 0.4,  build: false, wall: true,  fertile: 0,   wood: 0, stone: 0, water: true,  burn: 0,   color: '#4d9fe0' },
    { key: 'desert',    name: 'Wüste',         rank: 4, walk: 0.8,  build: true,  wall: true,  fertile: 0,   wood: 0, stone: 0, water: false, burn: 0,   color: '#e3b866' },
    { key: 'savanna',   name: 'Savanne',       rank: 4, walk: 1,    build: true,  wall: true,  fertile: 0.6, wood: 0, stone: 0, water: false, burn: 0.6, color: '#b9b556' },
    { key: 'jungle',    name: 'Dschungel',     rank: 4, walk: 0.55, build: true,  wall: true,  fertile: 0.7, wood: 1, stone: 0, water: false, burn: 0.5, color: '#1f7a45' },
    { key: 'swamp',     name: 'Sumpf',         rank: 4, walk: 0.5,  build: false, wall: true,  fertile: 0.2, wood: 0, stone: 0, water: false, burn: 0.1, color: '#5a7a52' },
    { key: 'tundra',    name: 'Tundra',        rank: 4, walk: 0.9,  build: true,  wall: true,  fertile: 0.3, wood: 0, stone: 0, water: false, burn: 0.1, color: '#a9b59a' },
    { key: 'snowfield', name: 'Schneefeld',    rank: 4, walk: 0.7,  build: true,  wall: true,  fertile: 0,   wood: 0, stone: 0, water: false, burn: 0,   color: '#dfe9ee' },
    { key: 'taiga',     name: 'Nadelwald',     rank: 4, walk: 0.7,  build: true,  wall: true,  fertile: 0.4, wood: 1, stone: 0, water: false, burn: 0.7, color: '#3b7a5e' },
    { key: 'mushroom',  name: 'Pilzwald',      rank: 4, walk: 0.7,  build: true,  wall: true,  fertile: 0.8, wood: 1, stone: 0, water: false, burn: 0.3, color: '#a35aa8' },
    { key: 'crystal',   name: 'Kristallfeld',  rank: 4, walk: 0.7,  build: true,  wall: true,  fertile: 0,   wood: 0, stone: 1, water: false, burn: 0,   color: '#7fd6d0' },
    { key: 'ash',       name: 'Aschefeld',     rank: 4, walk: 0.9,  build: true,  wall: true,  fertile: 0.1, wood: 0, stone: 0, water: false, burn: 0,   color: '#4d4a52' },
    { key: 'lava',      name: 'Lava',          rank: 4, walk: 0,    build: false, wall: false, fertile: 0,   wood: 0, stone: 0, water: false, burn: 0,   color: '#f0642a' },
    { key: 'flowers',   name: 'Blumenwiese',   rank: 4, walk: 1,    build: true,  wall: true,  fertile: 1,   wood: 0, stone: 0, water: false, burn: 0.3, color: '#8fcf5a' }
  ];

  const TERRAIN = defs.map((d, id) => Object.freeze(Object.assign({ id }, d)));
  const T = {};           // WW.T.GRASS === 3
  const BY_KEY = {};      // WW.TERRAIN_BY_KEY.grass.id === 3
  for (const d of TERRAIN) { T[d.key.toUpperCase()] = d.id; BY_KEY[d.key] = d; }

  // Schnelle Nachschlage-Arrays, indexiert nach Gelände-ID.
  const n = TERRAIN.length;
  const LUT = {
    walk: new Float32Array(n), fertile: new Float32Array(n), burn: new Float32Array(n),
    build: new Uint8Array(n), wall: new Uint8Array(n), water: new Uint8Array(n),
    wood: new Uint8Array(n), stone: new Uint8Array(n), rank: new Uint8Array(n)
  };
  for (const d of TERRAIN) {
    LUT.walk[d.id] = d.walk; LUT.fertile[d.id] = d.fertile; LUT.burn[d.id] = d.burn;
    LUT.build[d.id] = d.build ? 1 : 0; LUT.wall[d.id] = d.wall ? 1 : 0; LUT.water[d.id] = d.water ? 1 : 0;
    LUT.wood[d.id] = d.wood; LUT.stone[d.id] = d.stone; LUT.rank[d.id] = d.rank;
  }

  WW.TERRAIN = Object.freeze(TERRAIN);
  WW.T = Object.freeze(T);
  WW.TERRAIN_BY_KEY = Object.freeze(BY_KEY);
  WW.TERRAIN_LUT = LUT;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
