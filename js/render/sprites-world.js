// Wuselwelt – Pixelkunst: Boden (alle 22 Geländetypen) und Deko-Sprites (Bäume, Felsen, Gipfel …).
// Stil: klare, flache Pixelkarte mit Höhenstufen. Je Gelände eine ruhige Grundfarbe mit wenigen
// nah verwandten Detailpixeln. Höhe kommt aus WW.TERRAIN[id].rank: eine höhere Kachel zeigt zur
// tieferen Südnachbarin eine Kante aus Seitenmaterial, am Wasser mit heller Brandungslinie.
// Alles Aufragende (Bäume, Pilze, Kristalle, Gipfel …) sind eigene Sprites d_<art>_<n>.
(function (WW) { 'use strict';

  var S = WW.Sprites, L = S.lib, hash = L.hash, C = L.C, addColor = L.addColor, hexOf = L.hexOf;

  // ------------------------------------------------------------------ Farbhilfen
  function rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hex(r) { return '#' + ((1 << 24) | (r[0] << 16) | (r[1] << 8) | r[2]).toString(16).slice(1); }
  function mix(a, b, t) { var A = rgb(a), B = rgb(b); return hex([0, 1, 2].map(function (i) { return Math.round(A[i] + (B[i] - A[i]) * t); })); }

  // ------------------------------------------------------------------ Bodentabelle
  // b = Grundfarbe, d/l = nah verwandte Töne (dunkler/heller), face = Seitenmaterial [Haupt, dunkel],
  // lip = Kantenzeile oben an der Seitenwand, fh = Kantenhöhe in Pixeln, water = Wasserart.
  var SOIL = ['#a8743f', '#85572f'];
  var SANDST = ['#dcae6a', '#bd8c4c'];
  var ROCK = ['#76748b', '#55536a'];
  var ICE = ['#a2c3e0', '#7d9fc4'];
  var SPEC = {
    deep:      { b: '#2d5f9f', d: '#2a5895', l: '#3a6dab', water: 1, fh: 0 },
    water:     { b: '#3b80c6', d: '#3677ba', l: '#5795d2', water: 1, fh: 0 },
    shallow:   { b: '#5cb2e2', d: '#52a6d9', l: '#86c9ec', water: 1, fh: 0 },
    river:     { b: '#58afe3', d: '#4ea3d9', l: '#86caee', water: 1, fh: 0 },
    sand:      { b: '#f2dc9e', d: '#e8cc88', l: '#f9eabf', face: SANDST, fh: 2 },
    grass:     { b: '#7ec85a', d: '#71ba4f', l: '#8fd46a', face: SOIL, fh: 3 },
    forest:    { b: '#5aa54a', d: '#509843', l: '#66b053', face: SOIL, fh: 3 },
    hill:      { b: '#a9c468', d: '#9bb65d', l: '#bad37a', face: ['#93835c', '#6f6244'], fh: 3 },
    mountain:  { b: '#a9a8b5', d: '#9a99a8', l: '#c0bfca', face: ROCK, fh: 6 },
    snow:      { b: '#f2f6fb', d: '#e0e9f2', l: '#ffffff', face: ICE, fh: 3 },
    desert:    { b: '#f0c47c', d: '#e5b56d', l: '#f7d491', face: ['#cf9a5c', '#ae7b44'], fh: 3 },
    savanna:   { b: '#cdc66c', d: '#beb760', l: '#dbd57f', face: SOIL, fh: 3 },
    jungle:    { b: '#45a356', d: '#3c954d', l: '#52b062', face: SOIL, fh: 3 },
    swamp:     { b: '#76925f', d: '#688455', l: '#84a06b', face: ['#7e6a48', '#5f4f37'], fh: 2 },
    tundra:    { b: '#b6c19f', d: '#a7b392', l: '#c5cfb0', face: ['#968a72', '#766c58'], fh: 3 },
    snowfield: { b: '#e9f1f5', d: '#d8e4ec', l: '#f7fbfd', face: ICE, fh: 3 },
    taiga:     { b: '#5f9470', d: '#558866', l: '#6aa07b', face: SOIL, fh: 3 },
    mushroom:  { b: '#ad80b8', d: '#9e72aa', l: '#bc92c6', face: ['#8a6a7e', '#6b5062'], fh: 3 },
    crystal:   { b: '#9fc4cf', d: '#8fb5c2', l: '#b5d6de', face: ['#7f8ea6', '#647089'], fh: 3 },
    ash:       { b: '#615d6a', d: '#57535f', l: '#6f6b77', face: ['#4a4652', '#38353f'], fh: 3 },
    lava:      { b: '#f06a2c', d: '#dc5428', l: '#ffa33c', face: ['#8a3324', '#62231b'], fh: 3 },
    flowers:   { b: '#86cf5f', d: '#78c154', l: '#98da72', face: SOIL, fh: 3 }
  };
  var FOAM = '#eaf8fc';
  var TT = WW.TERRAIN || [];
  var N = TT.length;
  var GI = []; // je ID: Palettenindizes
  for (var id = 0; id < N; id++) {
    var key = TT[id].key, sp = SPEC[key] || SPEC.grass;
    var g = {
      key: key, rank: TT[id].rank, water: !!sp.water, fh: sp.fh,
      b: addColor(null, sp.b), d: addColor(null, sp.d), l: addColor(null, sp.l),
      sh: addColor(null, mix(sp.b, '#1c2440', sp.water ? 0.16 : 0.2)),   // Schlagschatten auf dieser Fläche
      shore: addColor(null, mix(sp.b, FOAM, 0.45))
    };
    if (sp.face) {
      g.f = addColor(null, sp.face[0]); g.fd = addColor(null, sp.face[1]);
      g.lip = addColor(null, sp.d);
    }
    GI[id] = g;
  }
  var FOAMI = addColor('foamW', FOAM);
  // Einzelne Detailfarben
  var DC = {
    white: addColor(null, '#ffffff'), yellow: addColor(null, '#ffe066'), pink: addColor(null, '#f7a1c4'),
    red: addColor(null, '#ee6a5a'), violet: addColor(null, '#b48ae6'), blue: addColor(null, '#8fc2ff'),
    pebble: addColor(null, '#c9c2b4'), pebbleD: addColor(null, '#a39c90'),
    glow: addColor(null, '#ffd45a'), crust: addColor(null, '#a8402a'), ember: addColor(null, '#f08a3c'),
    murk: addColor(null, '#5c7a66'), murkL: addColor(null, '#6c8b70'),
    crysL: addColor(null, '#e4fbff'), ice: addColor(null, '#d2e6f4'),
    snowDot: addColor(null, '#ffffff'), rockDot: addColor(null, '#8a8995'), shell: addColor(null, '#fbe9d6')
  };

  // ------------------------------------------------------------------ Rauschen fürs Aussehen
  function vnoise(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // ------------------------------------------------------------------ Grundfläche einer Kachel
  // buf: 64 Palettenindizes. X0, Y0 = Weltpixel der Kachel (für nahtlose, nicht wiederholte Details).
  function baseTile(buf, id, X0, Y0) {
    var gi = GI[id], k = gi.key, x, y, X, Y, r, i;
    var tx = X0 >> 3, ty = Y0 >> 3;
    for (i = 0; i < 64; i++) buf[i] = gi.b;
    // großflächige, sehr ruhige Tonflecken (gedithert), damit Flächen nicht tot wirken
    var pt = PATCH[k];
    if (pt) {
      for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
        X = X0 + x; Y = Y0 + y;
        var n = vnoise(X / pt[0], Y / pt[0], id * 31 + 5) + (hash(X, Y, 91) - 0.5) * 0.06;
        if (n > pt[1]) buf[y * 8 + x] = pt[2] ? gi.d : gi.l;
      }
    }
    // vereinzelte Detailpixel
    var nd = NOISE[k] || 0.02;
    for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
      r = hash(X0 + x, Y0 + y, id * 7 + 3);
      if (r < nd) buf[y * 8 + x] = gi.d;
      else if (r < nd * 1.5) buf[y * 8 + x] = gi.l;
    }
    var st = STAMP[k];
    if (st) st(buf, gi, tx, ty, function (x, y, c) { if (x >= 0 && y >= 0 && x < 8 && y < 8) buf[y * 8 + x] = c; });
  }
  // Fleckengröße (Pixel), Schwelle, dunkel(1)/hell(0)
  var PATCH = {
    grass: [44, 0.66, 0], forest: [36, 0.64, 1], sand: [40, 0.68, 0], desert: [48, 0.64, 0],
    savanna: [40, 0.64, 1], deep: [56, 0.62, 1], water: [52, 0.66, 1], tundra: [40, 0.66, 0],
    snowfield: [40, 0.66, 1], hill: [36, 0.66, 0], mountain: [32, 0.64, 1], jungle: [36, 0.64, 1],
    swamp: [30, 0.62, 1], taiga: [36, 0.64, 1], flowers: [40, 0.66, 0], mushroom: [36, 0.64, 1],
    ash: [36, 0.64, 1], snow: [40, 0.66, 1], crystal: [36, 0.66, 0]
  };
  var NOISE = { deep: 0.0, water: 0.0, shallow: 0.0, river: 0.0, lava: 0.04, flowers: 0.02, mountain: 0.025 };
  function rnd(tx, ty, s) { return hash(tx, ty, s); }
  function ri(tx, ty, s, n) { return Math.floor(hash(tx, ty, s) * n); }
  // kleine Motive je Gelände: höchstens wenige Pixel je Kachel
  var STAMP = {
    grass: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.35) { var x = ri(tx, ty, 2, 6), y = 2 + ri(tx, ty, 3, 5); put(x, y, g.d); put(x + 1, y - 1, g.d); put(x + 2, y, g.d); }
      if (rnd(tx, ty, 4) < 0.07) { put(ri(tx, ty, 5, 7), ri(tx, ty, 6, 7), rnd(tx, ty, 7) < 0.5 ? DC.white : DC.yellow); }
    },
    forest: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.3) { var x = ri(tx, ty, 2, 6), y = 2 + ri(tx, ty, 3, 5); put(x, y, g.d); put(x + 1, y - 1, g.d); put(x + 2, y, g.d); }
    },
    jungle: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.4) { var x = ri(tx, ty, 2, 6), y = 2 + ri(tx, ty, 3, 5); put(x, y, g.l); put(x + 1, y - 1, g.d); put(x + 2, y, g.d); }
    },
    taiga: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.25) { var x = ri(tx, ty, 2, 7), y = ri(tx, ty, 3, 7); put(x, y, g.l); put(x + 1, y, g.l); }
    },
    flowers: function (b, g, tx, ty, put) {
      var cols = [DC.white, DC.yellow, DC.pink, DC.red, DC.violet, DC.yellow];
      var n = 3 + ri(tx, ty, 9, 3);
      for (var k = 0; k < n; k++) put(ri(tx, ty, 10 + k, 8), ri(tx, ty, 20 + k, 8), cols[ri(tx, ty, 30 + k, cols.length)]);
    },
    sand: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.3) { var x = ri(tx, ty, 2, 6), y = 1 + ri(tx, ty, 3, 6); put(x, y, g.d); put(x + 1, y, g.d); }
      if (rnd(tx, ty, 4) < 0.05) put(ri(tx, ty, 5, 7), ri(tx, ty, 6, 7), DC.shell);
    },
    desert: function (b, g, tx, ty, put) {
      // Dünenrippel: kurzer heller Kamm über dunkler Flanke
      if (rnd(tx, ty, 1) < 0.5) {
        var x = ri(tx, ty, 2, 4), y = 1 + ri(tx, ty, 3, 5), len = 3 + ri(tx, ty, 4, 2);
        for (var i = 0; i < len; i++) { put(x + i, y - (i === 0 || i === len - 1 ? 0 : 1) + 1, g.d); }
        for (i = 1; i < len - 1; i++) put(x + i, y, g.l);
      }
    },
    savanna: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.45) { var x = ri(tx, ty, 2, 6), y = 2 + ri(tx, ty, 3, 5); put(x, y, g.d); put(x + 1, y - 1, g.l); put(x + 2, y, g.d); }
    },
    hill: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.25) { var x = ri(tx, ty, 2, 6), y = 1 + ri(tx, ty, 3, 6); put(x, y, DC.pebble); put(x + 1, y, DC.pebbleD); }
      else if (rnd(tx, ty, 4) < 0.3) { var x2 = ri(tx, ty, 5, 6), y2 = 2 + ri(tx, ty, 6, 5); put(x2, y2, g.d); put(x2 + 1, y2 - 1, g.d); put(x2 + 2, y2, g.d); }
    },
    mountain: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.45) { var x = ri(tx, ty, 2, 5), y = 1 + ri(tx, ty, 3, 6); put(x, y, g.d); put(x + 1, y, g.d); put(x + 2, y, g.d); put(x + 1, y - 1, g.l); }
    },
    snow: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.35) { var x = ri(tx, ty, 2, 6), y = 1 + ri(tx, ty, 3, 6); put(x, y, g.d); put(x + 1, y, g.d); }
    },
    snowfield: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.3) { var x = ri(tx, ty, 2, 5), y = 1 + ri(tx, ty, 3, 6); put(x, y, g.d); put(x + 1, y, g.d); put(x + 2, y, g.d); }
    },
    tundra: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.3) { var x = ri(tx, ty, 2, 6), y = 2 + ri(tx, ty, 3, 5); put(x, y, g.d); put(x + 1, y - 1, g.d); }
      if (rnd(tx, ty, 4) < 0.12) put(ri(tx, ty, 5, 7), ri(tx, ty, 6, 7), DC.ice);
    },
    swamp: function (b, g, tx, ty, put) {
      // trübe Pfütze
      if (rnd(tx, ty, 1) < 0.4) {
        var x = 1 + ri(tx, ty, 2, 3), y = 2 + ri(tx, ty, 3, 4), w = 3 + ri(tx, ty, 4, 2);
        for (var i = 0; i < w; i++) { put(x + i, y, DC.murk); if (i > 0 && i < w - 1) put(x + i, y + 1, DC.murk); }
        put(x + 1, y, DC.murkL);
      }
    },
    mushroom: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.3) { var x = ri(tx, ty, 2, 7), y = ri(tx, ty, 3, 7); put(x, y, g.l); put(x + 1, y + 1, g.l); }
      if (rnd(tx, ty, 4) < 0.1) put(ri(tx, ty, 5, 7), ri(tx, ty, 6, 7), DC.pink);
    },
    crystal: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.3) { var x = ri(tx, ty, 2, 7), y = ri(tx, ty, 3, 7); put(x, y, DC.crysL); }
      if (rnd(tx, ty, 4) < 0.3) { var x2 = ri(tx, ty, 5, 6), y2 = ri(tx, ty, 6, 7); put(x2, y2, g.d); put(x2 + 1, y2, g.d); }
    },
    ash: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.12) put(ri(tx, ty, 2, 7), ri(tx, ty, 3, 7), DC.ember);
      if (rnd(tx, ty, 4) < 0.3) { var x = ri(tx, ty, 5, 6), y = ri(tx, ty, 6, 7); put(x, y, g.l); put(x + 1, y, g.l); }
    },
    lava: function (b, g, tx, ty, put) {
      // dunkle Krustenschollen und helle Glut
      var x = ri(tx, ty, 2, 5), y = ri(tx, ty, 3, 5);
      put(x, y, DC.crust); put(x + 1, y, DC.crust); put(x + 2, y, DC.crust); put(x + 1, y + 1, DC.crust); put(x, y + 1, DC.crust);
      put(ri(tx, ty, 4, 8), ri(tx, ty, 5, 8), DC.glow);
      if (rnd(tx, ty, 6) < 0.5) put(ri(tx, ty, 7, 8), ri(tx, ty, 8, 8), g.l);
    },
    deep: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.18) { var x = ri(tx, ty, 2, 5), y = 1 + ri(tx, ty, 3, 6); put(x, y, g.l); put(x + 1, y, g.l); put(x + 2, y, g.l); }
    },
    water: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.25) { var x = ri(tx, ty, 2, 5), y = 1 + ri(tx, ty, 3, 6); put(x, y, g.l); put(x + 1, y, g.l); put(x + 2, y, g.l); }
    },
    shallow: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.3) { var x = ri(tx, ty, 2, 6), y = 1 + ri(tx, ty, 3, 6); put(x, y, g.l); put(x + 1, y, g.l); }
    },
    river: function (b, g, tx, ty, put) {
      if (rnd(tx, ty, 1) < 0.45) { var x = ri(tx, ty, 2, 6), y = 1 + ri(tx, ty, 3, 6); put(x, y, g.l); put(x + 1, y, g.l); }
    }
  };

  // ------------------------------------------------------------------ Kanten und Höhenstufen
  function rankOf(t) { return t < 0 || t >= N ? -1 : GI[t].rank; }
  // Höhe der Seitenwand, wenn obere Kachel u über untere Kachel lo liegt
  function faceH(u, lo) {
    var gu = GI[u], diff = gu.rank - GI[lo].rank;
    var h = gu.fh + (diff >= 2 ? 1 : 0);
    if (GI[lo].water && gu.fh) h = Math.max(2, h - (diff <= 1 ? 0 : 0));
    return Math.min(6, h);
  }
  // Kanten auf buf anwenden. X0/Y0 für Pixel-Zufall.
  function edges(buf, id, X0, Y0, n, e, s, w) {
    var me = GI[id], r = me.rank, x, y, i;
    if (n < 0 || n >= N) n = id; if (e < 0 || e >= N) e = id; if (s < 0 || s >= N) s = id; if (w < 0 || w >= N) w = id;
    var rn = GI[n].rank, re = GI[e].rank, rs = GI[s].rank, rw = GI[w].rank;
    var top = 0; // Zeilen, die oben von einer Wand belegt sind
    // --- gleiche Höhe, anderes Gelände: leicht verzahnte Grenze
    function jag(nb, side) {
      var gn = GI[nb], c = gn.b;
      for (var k = 0; k < 8; k++) {
        var px, py;
        if (side === 0) { px = k; py = 0; } else if (side === 1) { px = 7; py = k; } else if (side === 2) { px = k; py = 7; } else { px = 0; py = k; }
        var hv = hash(X0 + px * 1 + (side === 1 ? 1 : 0), Y0 + py + (side === 2 ? 1 : 0), 55);
        if (hv < 0.38) buf[py * 8 + px] = c;
      }
    }
    if (rn === r && n !== id) jag(n, 0);
    if (rs === r && s !== id) jag(s, 2);
    if (rw === r && w !== id) jag(w, 3);
    if (re === r && e !== id) jag(e, 1);

    // --- Wasser: Tiefenstufen weich gedithert, Ledge-Linie unter flacherem Nordnachbar
    if (me.water) {
      [[n, 0], [e, 1], [s, 2], [w, 3]].forEach(function (p) {
        var nb = p[0], gn = GI[nb];
        if (!gn.water || gn.rank <= r) return;
        for (var k = 0; k < 8; k++) {
          var px = p[1] === 1 ? 7 : (p[1] === 3 ? 0 : k), py = p[1] === 0 ? 0 : (p[1] === 2 ? 7 : k);
          if (hash(X0 + px, Y0 + py, 57) < 0.5) buf[py * 8 + px] = gn.b;
        }
        if (p[1] === 0) for (var k2 = 0; k2 < 8; k2++) if (hash(X0 + k2, Y0, 58) < 0.8) buf[8 + k2] = me.d;
      });
    }

    // --- tiefere Kachel: Wand der nördlichen höheren Kachel (am Fluss nur eine schmale Grasnarbe)
    var landN = rn > r && !GI[n].water;
    if (landN) {
      var gn = GI[n], fh = faceH(n, id);
      if (me.key === 'river') {
        fh = 2;
        for (x = 0; x < 8; x++) { buf[x] = gn.b; buf[8 + x] = me.sh; }
      } else {
        for (x = 0; x < 8; x++) {
          var streak = hash(X0 + x, Y0, 61) < 0.22;
          buf[x] = gn.lip;
          for (y = 1; y < fh; y++) buf[y * 8 + x] = (y === fh - 1) ? gn.fd : (streak ? gn.fd : gn.f);
          if (fh >= 4 && hash(X0 + x, Y0 + 2, 62) < 0.15) buf[2 * 8 + x] = gn.fd;
        }
      }
      top = fh;
      if (!me.water) { for (x = 0; x < 8; x++) buf[top * 8 + x] = me.sh; top += 1; }
    }
    if (me.water) {
      // Ufer: leicht gewelltes Land, Brandungslinie, hellerer Saum; Innenecken diagonal gerundet
      var lW = rw > r && !GI[w].water, lE = re > r && !GI[e].water, lS = rs > r && !GI[s].water;
      if (landN || lW || lE || lS) {
        var wob = function (a, k, sd) { return hash(a >> 1, k, sd) < 0.4 ? 1 : 0; };
        for (y = top; y < 8; y++) for (x = 0; x < 8; x++) {
          var d = 99, lc = 0, dd;
          if (landN) { dd = y - top; if (dd < d) { d = dd; lc = GI[n].b; } }
          if (lW) { dd = x - wob(Y0 + y, X0, 71); if (dd < d) { d = dd; lc = GI[w].b; } }
          if (lE) { dd = 7 - x - wob(Y0 + y, X0 + 8, 72); if (dd < d) { d = dd; lc = GI[e].b; } }
          if (lS) { dd = 7 - y - wob(X0 + x, Y0 + 8, 73); if (dd < d) { d = dd; lc = GI[s].b; } }
          if (lW && lS) { dd = x + (7 - y) - 2; if (dd < d) { d = dd; lc = GI[w].b; } }
          if (lE && lS) { dd = (7 - x) + (7 - y) - 2; if (dd < d) { d = dd; lc = GI[e].b; } }
          if (lW && landN) { dd = x + (y - top) - 2; if (dd < d) { d = dd; lc = GI[w].b; } }
          if (lE && landN) { dd = (7 - x) + (y - top) - 2; if (dd < d) { d = dd; lc = GI[e].b; } }
          if (d < 0) buf[y * 8 + x] = lc;
          else if (d < 1) buf[y * 8 + x] = FOAMI;
          else if (d < 2 && hash(X0 + x, Y0 + y, 74) < 0.6) buf[y * 8 + x] = me.shore;
        }
      }
    } else if (rw > r && !GI[w].water) {
      for (y = top; y < 8; y++) buf[y * 8] = me.sh;   // Schlagschatten der westlichen Stufe
    }

    // --- höhere Kachel: helle Oberkante nach Norden/Westen, leichte Schattenkante nach Osten
    if (!me.water) {
      var hiN = rn < r, hiW = rw < r, hiE = re < r;
      if (hiN) for (x = 0; x < 8; x++) buf[x] = me.l;
      if (hiW) for (y = 0; y < 8; y++) buf[y * 8] = me.l;
      if (hiE) for (y = 0; y < 8; y++) buf[y * 8 + 7] = me.d;
      // abgerundete Außenecken
      if (hiN && hiW) { buf[0] = GI[n].water ? FOAMI : GI[n].b; }
      if (hiN && hiE) { buf[7] = GI[n].water ? FOAMI : GI[n].b; }
    }
  }

  // ------------------------------------------------------------------ Zeichnen
  var BUF = new Uint16Array(64);
  var CSS = []; // Palettenindex -> CSS-Farbe
  function css(i) { return CSS[i] || (CSS[i] = hexOf(i)); }

  // Fertige Bodenkachel inkl. Kanten. px, py = Logik-Pixel (Vielfache von 8 empfohlen).
  // n/e/s/w = Gelände-IDs der Nachbarn (−1 = Kartenrand). variant wird für Details nicht gebraucht
  // (die kommen aus der Weltposition), bleibt aber Teil der Schnittstelle.
  function drawGround(ctx, px, py, id, variant, n, e, s, w) {
    if (!(id >= 0 && id < N)) id = 3;
    var X0 = px | 0, Y0 = py | 0;
    baseTile(BUF, id, X0, Y0);
    edges(BUF, id, X0, Y0, n == null ? -1 : n, e == null ? -1 : e, s == null ? -1 : s, w == null ? -1 : w);
    var b = GI[id].b;
    ctx.fillStyle = css(b); ctx.fillRect(px, py, 8, 8);
    for (var y = 0; y < 8; y++) {
      var row = y * 8, x = 0;
      while (x < 8) {
        var c = BUF[row + x];
        if (c === b) { x++; continue; }
        var x1 = x + 1; while (x1 < 8 && BUF[row + x1] === c) x1++;
        ctx.fillStyle = css(c); ctx.fillRect(px + x, py + y, x1 - x, 1);
        x = x1;
      }
    }
  }
  // Ganze Karte (oder Ausschnitt) in ein Canvas: terrain = Uint8Array(W*H)
  function drawGroundMap(ctx, terrain, variant, W, H, x0, y0, x1, y1) {
    x0 = x0 || 0; y0 = y0 || 0; x1 = x1 == null ? W : x1; y1 = y1 == null ? H : y1;
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++) {
      var i = y * W + x;
      drawGround(ctx, x * 8, y * 8, terrain[i], variant ? variant[i] : 0,
        y > 0 ? terrain[i - W] : -1, x < W - 1 ? terrain[i + 1] : -1, y < H - 1 ? terrain[i + W] : -1, x > 0 ? terrain[i - 1] : -1);
    }
  }
  // Mittlere Farbe je Gelände (Minikarte)
  function groundColor(id) { return css(GI[id] ? GI[id].b : GI[3].b); }

  // ------------------------------------------------------------------ Deko-Zuordnung
  // je Gelände: Wahrscheinlichkeit und gewichtete Liste von Deko-Arten
  var DECOR = {
    forest:    { p: 1.0,  list: [['tree', 4, 7], ['tree_s', 2, 2], ['bush', 2, 1]] },
    jungle:    { p: 1.0,  list: [['jtree', 3, 6], ['palm', 2, 2], ['fern', 2, 1]] },
    taiga:     { p: 0.95, list: [['pine', 3, 7], ['pine_s', 2, 3]] },
    mushroom:  { p: 0.7,  list: [['shroom', 3, 5], ['shroom_s', 2, 3]] },
    crystal:   { p: 0.55, list: [['crystal', 3, 5], ['rock', 3, 1]] },
    swamp:     { p: 0.4,  list: [['reed', 3, 6], ['mangrove', 1, 1]] },
    savanna:   { p: 0.12, list: [['acacia', 2, 3], ['bush_dry', 2, 2]] },
    desert:    { p: 0.07, list: [['cactus', 3, 3], ['rock_sand', 1, 1]] },
    hill:      { p: 0.16, list: [['rock', 3, 2], ['bush', 2, 1]] },
    mountain:  { p: 0.34, list: [['crag', 5, 5], ['rock_grey', 2, 2]] },
    shallow:   { p: 0.07, list: [['sandbar', 5, 3], ['rock_sea', 3, 1]] },
    snow:      { p: 0.3,  list: [['icecrag', 5, 1]] },
    tundra:    { p: 0.1,  list: [['shrub', 2, 3], ['rock', 3, 1]] },
    snowfield: { p: 0.06, list: [['pine_snow', 2, 2], ['rock_snow', 2, 1]] },
    grass:     { p: 0.014, list: [['bush', 2, 2], ['tree', 4, 1]] },
    flowers:   { p: 0.012, list: [['bush', 2, 1]] },
    ash:       { p: 0.1,  list: [['deadtree', 2, 2], ['stump', 1, 1]] },
    sand:      { p: 0.015, list: [['rock_sand', 1, 1]] },
    lava:      { p: 0.0,  list: [] }
  };
  var DTAB = [];
  function buildDecorTable() {
    for (var id = 0; id < N; id++) {
      var spec = DECOR[TT[id].key], row = DTAB[id] = new Array(256);
      for (var v = 0; v < 256; v++) {
        row[v] = null;
        if (!spec || !spec.list.length) continue;
        if (hash(v, 3, id * 17 + 1) >= spec.p) continue;
        var tot = 0, i; for (i = 0; i < spec.list.length; i++) tot += spec.list[i][2];
        var pick = hash(v, 5, id * 17 + 2) * tot, it = spec.list[0];
        for (i = 0; i < spec.list.length; i++) { pick -= spec.list[i][2]; if (pick < 0) { it = spec.list[i]; break; } }
        var nv = it[1], k = 'd_' + it[0] + '_' + Math.floor(hash(v, 7, id * 17 + 3) * nv);
        var big = /tree|pine|palm|jtree|shroom|peak|acacia|mangrove|crystal/.test(it[0]);
        var dx = Math.floor(hash(v, 9, id) * 3) - 1;
        var dy = big ? -Math.floor(hash(v, 11, id) * 3) : -Math.floor(hash(v, 11, id) * 4);
        row[v] = Object.freeze({ key: k, dx: dx, dy: dy });
      }
    }
  }
  function decorFor(id, variant) {
    if (!DTAB.length) buildDecorTable();
    var row = DTAB[id];
    if (!row) return null;
    return row[(variant | 0) & 255];
  }


  // ======================================================================
  // Etappe 3: Boden im feinen Raster (16×16 Pixel je Kachel), gerundete Ecken statt Treppen,
  // weiche Biom-Übergänge, Felswände mit Rissen, Geröll unter Klippen.
  var HB = new Uint16Array(256);
  var FACESET = {};
  for (var fi = 0; fi < N; fi++) if (GI[fi].f) { FACESET[GI[fi].f] = fi; FACESET[GI[fi].fd] = fi; }
  var PEB = [addColor(null, '#b8b4b0'), addColor(null, '#8c8890')];
  function surfaceColor(t) { var gi = GI[t]; return gi.water ? FOAMI : gi.b; }
  // hx, hy = Bildschirm-/Cachepixel der Kachel (Kachel = 16×16). Nachbarn wie drawGround, dazu Diagonalen (−1 = Rand).
  function drawGroundHi(ctx, hx, hy, id, variant, n, e, s, w, ne, se, sw, nw) {
    if (!(id >= 0 && id < N)) id = 3;
    function nb(t) { return t == null || t < 0 || t >= N ? id : t; }
    n = nb(n); e = nb(e); s = nb(s); w = nb(w); ne = nb(ne); se = nb(se); sw = nb(sw); nw = nb(nw);
    var X0 = hx >> 1, Y0 = hy >> 1, x, y, i;
    baseTile(BUF, id, X0, Y0);
    edges(BUF, id, X0, Y0, n, e, s, w);
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) HB[y * 16 + x] = BUF[(y >> 1) * 8 + (x >> 1)];
    var me = GI[id], r = me.rank;
    // feine Körnung auf der Grundfarbe
    for (i = 0; i < 256; i++) if (HB[i] === me.b) { var hv = hash(hx + (i & 15), hy + (i >> 4), 811); if (hv < 0.025) HB[i] = me.d; else if (hv > 0.985) HB[i] = me.l; }
    // Felswände: senkrechte Risse und Simse
    for (i = 0; i < 256; i++) { var ft = FACESET[HB[i]]; if (ft == null) continue; var gx = hx + (i & 15), gy = hy + (i >> 4); if (gx % 5 === 0 && hash(gx, 0, 812) < 0.7) HB[i] = GI[ft].fd; else if (hash(gx >> 1, gy, 813) < 0.08) HB[i] = GI[ft].lip; }
    // Schuttfächer unter Gebirgsklippen: kegelförmig auslaufendes Geröll
    if (GI[n].rank > r && /mountain|snow|hill/.test(GI[n].key) && !me.water) {
      var top = Math.min(14, faceH(n, id) * 2 + 2), fc = 3 + Math.floor(hash(hx, hy, 816) * 10), fl = 5 + Math.floor(hash(hx, hy, 817) * 4);
      for (var yy0 = 0; yy0 < fl; yy0++) for (var xx0 = -yy0; xx0 <= yy0; xx0++) {
        var px = fc + xx0, py = top + yy0; if (px < 0 || px > 15 || py > 15) continue;
        var pr = 0.75 - yy0 / fl * 0.6; if (hash(hx + px, hy + py, 818) < pr) HB[py * 16 + px] = (hash(hx + px, hy + py, 819) < 0.4) ? PEB[1] : PEB[0];
      }
    }
    // Gebirge und Schnee: Grate als Höhenlinien eines Rauschfelds, Licht auf der Nordwest-Seite
    if (me.key === 'mountain' || me.key === 'snow') {
      for (var gy0 = 0; gy0 < 16; gy0++) for (var gx0 = 0; gx0 < 16; gx0++) {
        var ii = gy0 * 16 + gx0; if (HB[ii] !== me.b && HB[ii] !== me.d && HB[ii] !== me.l) continue;
        var v = vnoise((hx + gx0) / 15, (hy + gy0) / 15, 830) * 5, fr = v - Math.floor(v);
        if (fr < 0.05) HB[ii] = me.d;
        else if (fr < 0.11 && me.key === 'mountain') HB[ii] = me.l;
      }
    }
    // weiche Übergänge zwischen Biomen gleicher Höhe (Streuung bis 5 Pixel tief)
    [[n, 0], [e, 1], [s, 2], [w, 3]].forEach(function (p) {
      var t = p[0]; if (t === id || GI[t].rank !== r || GI[t].water !== me.water) return;
      for (var yy = 0; yy < 16; yy++) for (var xx = 0; xx < 16; xx++) {
        var d = p[1] === 0 ? yy : (p[1] === 1 ? 15 - xx : (p[1] === 2 ? 15 - yy : xx));
        if (d > 5) continue;
        var pr = (1 - d / 6) * 0.7 * (0.6 + vnoise((hx + xx) / 3, (hy + yy) / 3, 820) * 0.8);
        if (hash(hx + xx, hy + yy, 821) < pr) HB[yy * 16 + xx] = hash(hx + xx, hy + yy, 822) < 0.15 ? GI[t].d : GI[t].b;
      }
    });
    // Linienführung brechen: Pixel nehmen das Gelände an einer verschobenen Stelle an (Verschiebung aus der
    // Weltposition, zwei Frequenzen bis ±7 px). Gilt an Ufern, zwischen Wassertiefen und an Schneerändern.
    if (!S._noDisplace) {
      var NB9 = [nw, n, ne, w, id, e, sw, s, se], anyD = false;
      function dispOK(a, b) { var ga = GI[a], gb = GI[b]; if (ga.key === 'river' || gb.key === 'river') return false; return a !== b && (ga.water || gb.water || (ga.key === 'snow') !== (gb.key === 'snow') && Math.abs(ga.rank - gb.rank) <= 1 || ga.key === 'sand' || gb.key === 'sand'); }
      for (var k9 = 0; k9 < 9; k9++) if (k9 !== 4 && dispOK(id, NB9[k9])) anyD = true;
      if (anyD) {
        function vtAt(px2, py2) {   // verschobenes Gelände an einem Pixel (auch knapp außerhalb der Kachel)
          var WX = hx + px2, WY = hy + py2;
          var ox2 = (vnoise(WX / 22, WY / 22, 841) - 0.5) * 26 + (vnoise(WX / 60, WY / 60, 842) - 0.5) * 22;
          var oy2 = (vnoise(WX / 22, WY / 22, 843) - 0.5) * 26 + (vnoise(WX / 60, WY / 60, 844) - 0.5) * 22;
          var qx = Math.max(-16, Math.min(31, Math.round(px2 + ox2))), qy = Math.max(-16, Math.min(31, Math.round(py2 + oy2)));
          var home = NB9[(py2 < 0 ? 0 : (py2 > 15 ? 2 : 1)) * 3 + (px2 < 0 ? 0 : (px2 > 15 ? 2 : 1))];
          var vt = NB9[(qy < 0 ? 0 : (qy > 15 ? 2 : 1)) * 3 + (qx < 0 ? 0 : (qx > 15 ? 2 : 1))];
          return dispOK(home, vt) ? vt : home;
        }
        var VT = new Int16Array(400);   // 20×20 mit 2 Pixeln Rand
        for (var py2 = -2; py2 < 18; py2++) for (var px2 = -2; px2 < 18; px2++) VT[(py2 + 2) * 20 + px2 + 2] = vtAt(px2, py2);
        function V(x, y) { return VT[(y + 2) * 20 + x + 2]; }
        for (py2 = 0; py2 < 16; py2++) for (px2 = 0; px2 < 16; px2++) {
          var t0 = V(px2, py2), g0 = GI[t0], hv2 = hash(hx + px2, hy + py2, 845), c0;
          if (t0 === id && !me.water && !GI[V(px2, py2 - 1)].water && !GI[V(px2, py2 + 1)].water && !GI[V(px2 - 1, py2)].water && !GI[V(px2 + 1, py2)].water) continue;   // Landinneres behält seine Zeichnung
          c0 = hv2 < 0.05 ? g0.d : (hv2 > 0.97 ? g0.l : g0.b);
          if (g0.water) {
            var up1 = GI[V(px2, py2 - 1)], up2 = GI[V(px2, py2 - 2)], landN = !up1.water ? up1 : (!up2.water ? up2 : null);
            var landAdj = !GI[V(px2 - 1, py2)].water || !GI[V(px2 + 1, py2)].water || !GI[V(px2, py2 + 1)].water || !up1.water;
            if (landN && landN.f && !up1.water) c0 = landN.lip;          // Uferkante (Seitenmaterial) unter Land
            else if (landN && landN.f) c0 = landN.fd;
            else if (landAdj) c0 = FOAMI;
            else { var dN = GI[V(px2, py2 - 1)], dW = GI[V(px2 - 1, py2)]; if ((dN.water && dN.rank > g0.rank) || (dW.water && dW.rank > g0.rank)) c0 = g0.shore; }
          } else if (GI[V(px2, py2 - 1)].water || GI[V(px2 - 1, py2)].water) c0 = g0.l;   // helle Oberkante zum Wasser
          HB[py2 * 16 + px2] = c0;
        }
        anyD = 'done';
      }
    }
    // Ecken runden: konvex (eigene Kachel höher als beide Nachbarn) und konkav (alle drei Nachbarn höher)
    var R = (typeof anyD !== 'undefined' && anyD === 'done') ? 0 : 8, corners = [[0, 0, n, w, nw], [16, 0, n, e, ne], [0, 16, s, w, sw], [16, 16, s, e, se]];
    if (R) corners.forEach(function (c) {
      var cx = c[0], cy = c[1], a = c[2], b = c[3], d = c[4], ra = GI[a].rank, rb = GI[b].rank, rd = GI[d].rank;
      var ox = cx ? -1 : 1, oy = cy ? -1 : 1;
      if (ra < r && rb < r) {   // konvex: Ecke abschneiden
        var lowC = surfaceColor(ra <= rb ? a : b), cX = cx + ox * R, cY = cy + oy * R;
        for (var yy = 0; yy < R; yy++) for (var xx = 0; xx < R; xx++) {
          var X = cx ? 15 - xx : xx, Y = cy ? 15 - yy : yy, dd = Math.hypot(X + 0.5 - cX, Y + 0.5 - cY);
          if (dd > R + 0.3) HB[Y * 16 + X] = lowC;
          else if (dd > R - 0.8 && !me.water) HB[Y * 16 + X] = cy ? me.d : me.l;
        }
      } else if (ra > r && rb > r && rd > r) {   // konkav: Innenecke auffüllen
        var hiC = GI[ra >= rb ? a : b].b;
        for (yy = 0; yy < R; yy++) for (xx = 0; xx < R; xx++) {
          var X2 = cx ? 15 - xx : xx, Y2 = cy ? 15 - yy : yy, d2 = Math.hypot(X2 + 0.5 - cx, Y2 + 0.5 - cy);
          if (d2 < R - 1.5) HB[Y2 * 16 + X2] = hiC;
          else if (d2 < R - 0.3) HB[Y2 * 16 + X2] = me.water ? FOAMI : me.sh;
        }
      }
    });
    var bc = me.b;
    ctx.fillStyle = css(bc); ctx.fillRect(hx, hy, 16, 16);
    for (y = 0; y < 16; y++) {
      x = 0;
      while (x < 16) {
        var c2 = HB[y * 16 + x];
        if (c2 === bc) { x++; continue; }
        var x1 = x + 1; while (x1 < 16 && HB[y * 16 + x1] === c2) x1++;
        ctx.fillStyle = css(c2); ctx.fillRect(hx + x, hy + y, x1 - x, 1);
        x = x1;
      }
    }
  }
  // ganze Karte in einen Cache mit 16 Pixeln je Kachel
  function drawGroundMapHi(ctx, terrain, variant, W, H, x0, y0, x1, y1) {
    x0 = x0 || 0; y0 = y0 || 0; x1 = x1 == null ? W : x1; y1 = y1 == null ? H : y1;
    function T(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? -1 : terrain[y * W + x]; }
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++)
      drawGroundHi(ctx, x * 16, y * 16, terrain[y * W + x], variant ? variant[y * W + x] : 0,
        T(x, y - 1), T(x + 1, y), T(x, y + 1), T(x - 1, y), T(x + 1, y - 1), T(x + 1, y + 1), T(x - 1, y + 1), T(x - 1, y - 1));
  }
  S.drawGroundHi = drawGroundHi;
  S.drawGroundMapHi = drawGroundMapHi;

  // ---------------------------------------------------------------- Wasser-Animation, Brandung (feine Überlagerungen, Maßstab 0,5)
  var WA = { hi: addColor(null, '#ffffff', 150), mid: addColor(null, '#d8f2ff', 110), lo: addColor(null, '#a8dcf4', 90), dk: addColor(null, '#1c3c78', 60) };
  var SF = [addColor(null, '#ffffff', 235), addColor(null, '#eaf8fc', 160), addColor(null, '#d4f0fa', 90)];
  function waterAnim(typ, f) {
    var g = new L0.Grid(16, 16), x, y;
    if (typ === 'river') {   // Strömungsstreifen, wandern pro Frame 4 Pixel nach unten
      for (var k = 0; k < 4; k++) { var bx = (k * 5 + 2) % 16, by = (k * 7 + f * 4) % 16; for (var j = 0; j < 4; j++) g.set(bx, (by + j) % 16, j === 0 ? WA.hi : WA.mid); g.set((bx + 8) % 16, (by + 9) % 16, WA.lo); }
      return g;
    }
    var rows = typ === 'deep' ? [3, 11] : (typ === 'water' ? [2, 7, 12] : [1, 5, 9, 13]);
    rows.forEach(function (ry, k) {
      var len = typ === 'shallow' ? 3 : 5, x0 = (k * 6 + f * 4 + (k & 1) * 2) % 16;
      for (var i = 0; i < len; i++) { var xx = (x0 + i) % 16; g.set(xx, ry, i === 1 ? WA.hi : WA.mid); if (typ !== 'shallow' && i > 0 && i < len - 1) g.set(xx, ry + 1, WA.dk); }
    });
    if (typ === 'shallow') for (var s2 = 0; s2 < 3; s2++) { var sx = (s2 * 5 + f * 3) % 16, sy = (s2 * 7 + 3) % 16; g.set(sx, sy, (f + s2) & 1 ? WA.hi : WA.lo); }
    return g;
  }
  function surf(mask, f) {   // Brandung: Gischtlinie pulsiert zum Land hin
    var g = new L0.Grid(16, 16), d0 = [0, 1, 2, 1][f];
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var d = 99;
      if (mask & 1) d = Math.min(d, y); if (mask & 4) d = Math.min(d, 15 - y); if (mask & 8) d = Math.min(d, x); if (mask & 2) d = Math.min(d, 15 - x);
      if (d === 99) continue;
      var wob = Math.round(Math.sin((x + y) * 0.7 + f) * 0.6);
      if (d === d0 + wob) g.set(x, y, SF[0]); else if (d === d0 + wob + 1) g.set(x, y, SF[1]); else if (d === d0 + 3 + wob && hash(x, y, f + 40) < 0.5) g.set(x, y, SF[2]);
    }
    return g;
  }
  var L0 = S.lib;
  L0.lazyDef('hw_', function (key) {
    var m;
    if ((m = /^hw_water_(deep|water|shallow|river)_(\d)$/.exec(key))) return { grid: waterAnim(m[1], +m[2] & 3), scale: 0.5, ox: 0, oy: 0 };
    if ((m = /^hw_surf_(\d+)_(\d)$/.exec(key))) return { grid: surf(+m[1] & 15, +m[2] & 3), scale: 0.5, ox: 0, oy: 0 };
    return null;
  });
  ['deep', 'water', 'shallow', 'river'].forEach(function (t) { for (var f = 0; f < 4; f++) L0.ALIAS['t_water_anim_' + t + '_' + f] = 'hw_water_' + t + '_' + f; });
  for (var sm = 0; sm < 16; sm++) for (var sf = 0; sf < 4; sf++) L0.ALIAS['fx_surf_' + sm + '_' + sf] = 'hw_surf_' + sm + '_' + sf;
  // Helfer: Wasser-Frame je Geländetyp (null bei Land), Brandungsmaske aus Nachbarn
  S.waterAnimKey = function (terrainId, frame) { var k = GI[terrainId] && GI[terrainId].water ? GI[terrainId].key : null; return k ? 't_water_anim_' + k + '_' + ((frame | 0) & 3) : null; };
  S.surfKey = function (n, e, s, w, frame) {
    function land(t) { return t >= 0 && t < N && !GI[t].water; }
    var m = (land(n) ? 1 : 0) | (land(e) ? 2 : 0) | (land(s) ? 4 : 0) | (land(w) ? 8 : 0);
    return m ? 'fx_surf_' + m + '_' + ((frame | 0) & 3) : null;
  };
  S.drawGround = drawGround;
  // Trampelpfad über den Boden legen (in die Bodenebene backen). mask: Bit0 N, Bit1 O, Bit2 S, Bit3 W.
  S.drawPath = function (ctx, px, py, mask) { S.draw(ctx, 't_path_' + (mask & 15), px, py); };
  // Gleis über den Boden legen (Bit0 N, Bit1 O, Bit2 S, Bit3 W = Nachbarkachel hat ebenfalls Gleis)
  S.drawRail = function (ctx, px, py, mask) { S.draw(ctx, 't_rail_' + (mask & 15), px, py); };
  // Weiche Überlagerung: base z. B. 't_barren_2', 't_smog_1', 't_soot', 't_cleared'; mask = Nachbarn mit mindestens derselben Stufe
  S.softKey = function (base, mask) { return base + '_' + (mask & 15); };
  S.drawGroundMap = drawGroundMap;
  S.decorFor = decorFor;
  S.groundColor = groundColor;
  S.GROUND = { mix: mix };

  // ---------------------------------------------------------------- Deko im feinen Raster: hd_<art>_<n>[_w0..2]
  // Je Art mindestens fünf Varianten mit Größenstreuung; Bäume und Büsche haben drei Wiege-Phasen (w0, w1, w2).
  var DG = S.lib.Grid, AK = function (h) { return addColor(null, h); };
  var LEAVES = [
    [AK('#c8ec7a'), AK('#8fd256'), AK('#5aa840'), AK('#3a7c34'), AK('#21492a')],
    [AK('#d8e88a'), AK('#a8c850'), AK('#78a03a'), AK('#52782e'), AK('#2e4822')],
    [AK('#a8e0a0'), AK('#6cbc74'), AK('#3f9458'), AK('#2a6a44'), AK('#173a2a')]
  ];
  var JUNGLE = [AK('#8ae08a'), AK('#46b25a'), AK('#2a8a48'), AK('#1a6038'), AK('#0e3a24')];
  var PINES = [AK('#8cc8a0'), AK('#4f9a70'), AK('#2f7254'), AK('#1f5040'), AK('#12302a')];
  var BARK = [AK('#b0804e'), AK('#86603a'), AK('#5e4026'), AK('#3a2618')];
  var ROCKS = [AK('#e0dee6'), AK('#b6b4c2'), AK('#8e8c9e'), AK('#686678'), AK('#3a3848')];
  var SNOWT = [AK('#ffffff'), AK('#e4eef8'), AK('#c0d2e6')];
  var CACT = [AK('#a8e08c'), AK('#68b85c'), AK('#3c8a48'), AK('#225834')];
  var SHADE = S.lib.C.shade;
  function rnd(n, k, s) { return hash(n, k, s); }
  function lobeFill(g, cx, cy, rx, ry, P, seed) {
    g.ellipse(cx, cy, rx, ry, function (x, y, nx, ny) {
      var lgt = nx * 0.7 + ny * 0.9 + (hash(x, y, seed) - 0.5) * 0.5;
      return lgt < -0.85 ? P[0] : (lgt < -0.2 ? P[1] : (lgt < 0.45 ? P[2] : P[3]));
    });
  }
  function shadowEll(g, cx, cy, rx, ry) { var t = new DG(g.w, g.h); t.ellipse(cx, cy, rx, ry, SHADE); for (var i = 0; i < g.d.length; i++) if (!g.d[i] && t.d[i]) g.d[i] = SHADE; }
  function trunk(g, x, top, bot, w) { for (var y = top; y <= bot; y++) for (var i = 0; i < w; i++) g.set(x + i, y, i === 0 ? BARK[0] : (i === w - 1 ? BARK[2] : (((y + i) % 4 === 0) ? BARK[2] : BARK[1]))); g.set(x - 1, bot, BARK[2]); g.set(x + w, bot, BARK[3]); }
  var GEN = {
    tree: function (n, big) {
      var sc = (big === false ? 0.7 : 1) * (0.85 + rnd(n, 1, 901) * 0.3), P = LEAVES[n % 3], W = Math.round(26 * sc) + 2, H = Math.round(30 * sc) + 4, g = new DG(W, H);
      var cx = W / 2, crownB = H - Math.round(9 * sc), cr = 10 * sc;
      trunk(g, Math.round(cx) - 2, crownB - 4, H - 3, 4);
      var lobes = 4 + (n % 3);
      for (var k = 0; k < lobes; k++) { var a = k / lobes * 6.28 + rnd(n, k, 902), rr = cr * (0.45 + rnd(n, k, 903) * 0.2); lobeFill(g, cx + Math.cos(a) * cr * 0.45, crownB - cr + Math.sin(a) * cr * 0.4, rr, rr * 0.9, P, 904 + k); }
      lobeFill(g, cx - 1, crownB - cr - 1, cr * 0.62, cr * 0.58, P, 910);
      for (k = 0; k < 6; k++) { var hx = Math.round(cx - cr * 0.5 + rnd(n, k, 911) * cr * 0.6), hy = Math.round(crownB - cr * 1.5 + rnd(n, k, 912) * cr); if (g.get(hx, hy)) g.set(hx, hy, P[0]); }
      return { g: g, crownB: crownB, edge: P[4], sh: [cx + 3, H - 3, W * 0.42, 2.2] };
    },
    pine: function (n, snow) {
      var sc = 0.85 + rnd(n, 1, 921) * 0.35, P = PINES, W = Math.round(18 * sc) + 2, H = Math.round(34 * sc) + 2, g = new DG(W, H), cx = (W - 1) / 2, bot = H - 6, tiers = 4 + (n % 2);
      for (var t = 0; t < tiers; t++) {
        var ty = Math.round(t * (bot - 2) / tiers), th = Math.round((bot - 2) / tiers) + 4, hw0 = 1 + t * (W / 2 - 2) / tiers;
        for (var j = 0; j < th; j++) { var hw = hw0 + j * 0.55; for (var x = 0; x < W; x++) { var dx = x - cx; if (Math.abs(dx) > hw) continue; var c = dx < -hw * 0.4 ? P[1] : (dx > hw * 0.45 ? P[3] : P[2]); if (j === th - 1) c = P[3]; if (j === 0 || (j < 2 && dx < 0)) c = P[0]; if (snow && j < 2 && dx < hw * 0.5) c = j === 0 ? SNOWT[0] : SNOWT[1]; g.set(x, ty + j, c); } }
      }
      trunk(g, Math.round(cx) - 1, bot, H - 3, 3);
      return { g: g, crownB: bot, edge: P[4], sh: [cx + 3, H - 3, W * 0.4, 2] };
    },
    jtree: function (n) {
      var r = GEN.tree(n, true), g = r.g;
      for (var i = 0; i < g.d.length; i++) { var c = g.d[i], k = LEAVES[n % 3].indexOf(c); if (k >= 0) g.d[i] = JUNGLE[k]; }
      for (var v = 0; v < 3; v++) { var vx = Math.round(4 + rnd(n, v, 931) * (g.w - 8)); for (var y = r.crownB - 2; y < r.crownB + 4 + v; y++) if (!g.get(vx, y) || g.get(vx, y) === SHADE) g.set(vx, y, JUNGLE[1]); }
      r.edge = JUNGLE[4]; return r;
    },
    palm: function (n) {
      var W = 26, H = 34, g = new DG(W, H), lean = (n % 2 ? 1 : -1) * (0.15 + rnd(n, 1, 941) * 0.15), tx, ty = 8;
      for (var y = ty; y < H - 3; y++) { var x = Math.round(13 + (y - (H - 3)) * lean); g.set(x, y, (y % 3) ? BARK[1] : BARK[2]); g.set(x + 1, y, BARK[2]); g.set(x - 1, y, BARK[0]); }
      tx = Math.round(13 + (ty - (H - 3)) * lean);
      for (var f = 0; f < 7; f++) {
        var a = -Math.PI + f / 6 * Math.PI + (rnd(n, f, 942) - 0.5) * 0.3, len = 9 + rnd(n, f, 943) * 3;
        for (var t = 0; t <= len; t++) { var px = Math.round(tx + Math.cos(a) * t), py = Math.round(ty + Math.sin(a) * t * 0.7 + t * t * 0.03); g.set(px, py, t < 3 ? JUNGLE[2] : JUNGLE[1]); if (t > 2 && t % 2 === 0) g.set(px, py + 1, JUNGLE[3]); }
      }
      g.set(tx, ty + 1, BARK[3]); g.set(tx + 1, ty + 1, BARK[3]);
      return { g: g, crownB: ty + 4, edge: JUNGLE[4], sh: [16, H - 3, 9, 2] };
    },
    bush: function (n) {
      var W = 16, H = 13, g = new DG(W, H), P = LEAVES[n % 3];
      lobeFill(g, 6, 7, 5, 4.2, P, 951 + n); lobeFill(g, 10, 7.5, 4.5, 3.8, P, 952 + n); lobeFill(g, 8, 5, 4, 3.5, P, 953 + n);
      if (n % 3 === 1) for (var k = 0; k < 4; k++) g.set(4 + k * 2, 4 + (k & 1) * 3, [AK('#ff8aa8'), AK('#ffffff')][k & 1]);
      return { g: g, crownB: H - 3, edge: P[4], sh: [9, H - 2, 6, 1.6] };
    },
    acacia: function (n) {
      var W = 28, H = 24, g = new DG(W, H), P = LEAVES[1];
      trunk(g, 13, 9, H - 3, 3); for (var t = 0; t < 6; t++) { g.set(13 - t, 10 - t, BARK[1]); g.set(16 + t, 10 - t, BARK[2]); }
      g.ellipse(14, 4.5, 12 - (n % 3), 3.6, function (x, y, nx, ny) { return ny < -0.35 ? P[0] : (ny > 0.4 ? P[3] : (hash(x, y, 961) < 0.2 ? P[2] : P[1])); });
      return { g: g, crownB: 9, edge: P[4], sh: [17, H - 3, 10, 2] };
    },
    cactus: function (n) {
      var W = 14, H = 24, g = new DG(W, H), h = 14 + (n % 3) * 3;
      function col(x, y0, y1) { for (var y = y0; y <= y1; y++) for (var i = 0; i < 4; i++) g.set(x + i, y, i === 0 ? CACT[0] : (i === 3 ? CACT[3] : ((y + i) % 3 ? CACT[1] : CACT[2]))); }
      col(5, H - 3 - h, H - 3);
      if (n % 2 === 0) { col(1, H - h + 1, H - h + 7); g.hline(2, H - h + 7, 4, CACT[1]); }
      if (n % 3 !== 1) { col(9, H - h + 4, H - h + 9); g.hline(8, H - h + 9, 3, CACT[2]); }
      if (n % 4 === 0) { g.set(6, H - 4 - h, AK('#ff8ab8')); g.set(7, H - 4 - h, AK('#ffd0e0')); }
      return { g: g, crownB: 0, edge: CACT[3], sh: [8, H - 2, 5, 1.4] };
    },
    shroom: function (n) {
      var W = 22, H = 24, g = new DG(W, H), caps = [[AK('#ff9a88'), AK('#ee5a48'), AK('#b0303a'), AK('#701e2a')], [AK('#e0b8ff'), AK('#a670dc'), AK('#7044a8'), AK('#432a70')], [AK('#ffd090'), AK('#f0963c'), AK('#b85e24'), AK('#703814')]][n % 3];
      var cw = 14 + (n % 2) * 4, ch = 7, sh = 9 + (n % 3) * 2;
      for (var y = H - 3 - sh; y < H - 2; y++) { g.hline(9, y, 4, AK('#f4ead2')); g.set(12, y, AK('#cfc0a0')); }
      g.ellipse(11, H - 3 - sh, cw / 2, ch, function (x, y, nx, ny) { return y > H - 3 - sh + 1 ? null : (nx + ny < -0.8 ? caps[0] : (ny > 0.1 ? caps[2] : caps[1])); });
      g.hline(11 - cw / 2 + 1, H - 2 - sh, cw - 2, caps[3]);
      for (var k = 0; k < 4; k++) g.set(Math.round(11 - cw / 3 + rnd(n, k, 971) * cw * 0.6), Math.round(H - 4 - sh - rnd(n, k, 972) * ch * 0.8), AK('#ffffff'));
      return { g: g, crownB: 0, edge: caps[3], sh: [13, H - 2, 7, 1.5] };
    },
    crystal: function (n) {
      var W = 18, H = 24, g = new DG(W, H), P = n % 2 ? [AK('#fbefff'), AK('#d6aaf6'), AK('#a072d8'), AK('#6a46a0')] : [AK('#f0feff'), AK('#9eecf2'), AK('#54b4d4'), AK('#2e6e9a')];
      var shards = 2 + (n % 3);
      for (var k = 0; k < shards; k++) {
        var sx = 2 + k * 4 + Math.round(rnd(n, k, 981) * 2), sh = 10 + Math.round(rnd(n, k, 982) * 10), sw = 4;
        for (var y = 0; y < sh; y++) for (var i = 0; i < sw; i++) { var dx = i - (sw - 1) / 2; if (y < Math.abs(dx) * 2.2) continue; g.set(sx + i, H - 3 - sh + y, i === 0 ? P[0] : (dx < 0 ? P[1] : (i === sw - 1 ? P[3] : P[2]))); }
        g.set(sx + 1, H - 1 - sh, AK('#ffffff'));
      }
      return { g: g, crownB: 0, edge: P[3], sh: [10, H - 2, 7, 1.4] };
    },
    rock: function (n, pal) {
      var W = 16, H = 12, g = new DG(W, H), P = pal || ROCKS;
      lobeFill(g, 7, 7, 6 + (n % 2), 4.2, P, 991 + n); lobeFill(g, 10, 8, 4, 3, P, 992 + n);
      g.line(5, 5, 7, 8, P[3]); if (n % 3 === 0) { g.set(4, 4, LEAVES[0][2]); g.set(5, 4, LEAVES[0][1]); g.set(6, 3, LEAVES[0][2]); }
      return { g: g, crownB: 0, edge: P[4] || P[3], sh: [9, H - 2, 6.5, 1.4] };
    },
    peak: function (n, snow) {
      var W = 26, H = 26, g = new DG(W, H), cx = 12 + (n % 3), cap = snow ? 26 : 6 + (n % 3) * 2;
      for (var y = 0; y < H - 3; y++) { var t = y / (H - 4), hw = 0.6 + Math.pow(t, 0.85) * 11, ridge = cx + t * 1.5; for (var x = 0; x < W; x++) { var xc = x + 0.5; if (xc < cx - hw || xc > cx + hw) continue; var right = xc > ridge, c = right ? ROCKS[3] : ROCKS[1]; if (!right && xc < cx - hw + 2) c = ROCKS[0]; if (y % 5 === 4 && hash(x, y, 995) < 0.6) c = ROCKS[right ? 4 : 2]; if (y < cap + (hash(x, 3, 996) < 0.5 ? 1 : 0)) c = right ? SNOWT[2] : SNOWT[0]; g.set(x, y, c); } }
      return { g: g, crownB: 0, edge: ROCKS[4], sh: [15, H - 2, 11, 2] };
    },
    reed: function (n) {
      var W = 14, H = 18, g = new DG(W, H), st = [AK('#9cc86a'), AK('#6e9a48'), AK('#4a6e34')], cat = AK('#7a4a2a');
      for (var k = 0; k < 4 + (n % 3); k++) { var x = 1 + Math.round(rnd(n, k, 1001) * 11), h = 8 + Math.round(rnd(n, k, 1002) * 7); for (var y = H - 2 - h; y < H - 2; y++) g.set(x, y, st[k % 3]); if (k % 2 === 0) { g.vline(x, H - 4 - h, 3, cat); } }
      return { g: g, crownB: H - 6, edge: st[2], sh: [8, H - 1, 5, 1] };
    },
    deadtree: function (n) {
      var W = 20, H = 26, g = new DG(W, H), wood = [AK('#a09088'), AK('#78685e'), AK('#544640')];
      for (var y = 6; y < H - 3; y++) { g.set(9, y, wood[0]); g.set(10, y, wood[1]); }
      for (var b = 0; b < 4; b++) { var y0 = 8 + b * 4, dir = b & 1 ? 1 : -1, len = 4 + (n + b) % 4; for (var t = 0; t < len; t++) g.set(9 + dir * t, y0 - Math.round(t * 0.8), wood[t % 2]); }
      return { g: g, crownB: 0, edge: wood[2], sh: [12, H - 2, 5, 1.2] };
    }
  };
  // Felsgrat: kantige Felsformation mit Licht-/Schattenflanke, Rissen, Schuttsaum; Schnee optional
  GEN.crag = function (n, snow) {
    var W = 28, H = 26, g = new DG(W, H), P = ROCKS, base = H - 4, peaks = 2 + (n % 3);
    for (var k = 0; k < peaks; k++) {
      var cx = 5 + k * (18 / peaks) + rnd(n, k, 1201) * 4, ht = 9 + rnd(n, k, 1202) * 11, hw = 4 + rnd(n, k, 1203) * 3;
      for (var y = 0; y < ht; y++) {
        var t = y / ht, w2 = hw * Math.pow(t, 0.7) + 0.8, top = base - ht + y;
        for (var x = Math.floor(cx - w2); x <= Math.ceil(cx + w2); x++) {
          var dx = x + 0.5 - cx; if (Math.abs(dx) > w2) continue;
          var face = dx > w2 * 0.15, c = face ? (t > 0.75 ? P[3] : P[2]) : (dx < -w2 * 0.6 ? P[0] : P[1]);
          if ((top + Math.floor(x * 0.3)) % 4 === 0 && hash(x, top, 1204) < 0.6) c = face ? P[4] : P[2];
          if (snow && t < 0.35 + rnd(n, k, 1205) * 0.15) c = face ? SNOWT[2] : SNOWT[0];
          g.set(x, top, c);
        }
      }
    }
    for (var x2 = 2; x2 < W - 2; x2++) if (hash(x2, n, 1206) < 0.5) g.set(x2, base + (x2 & 1), PEB[x2 & 1]);
    return { g: g, crownB: 0, edge: P[4], sh: [16, H - 3, 12, 2] };
  };
  GEN.sandbar = function (n) {
    var W = 22, H = 10, g = new DG(W, H), SB = [AK('#fbefc4'), AK('#efdc9e'), AK('#d8c080')];
    g.ellipse(11, 5, 9 - (n % 3), 3.2, function (x, y, nx, ny) { var d = nx * nx + ny * ny; return d > 0.75 ? FOAMI : (ny < -0.2 ? SB[0] : (ny > 0.4 ? SB[2] : SB[1])); });
    if (n % 2) { g.set(7, 4, AK('#e8a8a0')); g.set(14, 5, AK('#ffffff')); }
    return { g: g, crownB: 0, edge: null, sh: [0, 0, 0, 0] };
  };
  var KINDMAP = {   // Deko-Art -> Generator (+ Zusatz)
    tree: ['tree', true], tree_s: ['tree', false], jtree: ['jtree'], palm: ['palm'], bush: ['bush'], fern: ['bush'], bush_dry: ['bush'], mangrove: ['jtree'],
    pine: ['pine', false], pine_s: ['pine', false], pine_snow: ['pine', true], acacia: ['acacia'], cactus: ['cactus'], shroom: ['shroom'], shroom_s: ['shroom'],
    crystal: ['crystal'], reed: ['reed'], rock: ['rock'], rock_grey: ['rock'], rock_sand: ['rock', 'sand'], rock_snow: ['rock', 'snow'], peak: ['peak', false], icepeak: ['peak', true],
    shrub: ['bush'], deadtree: ['deadtree'], crag: ['crag', false], icecrag: ['crag', true], sandbar: ['sandbar'], rock_sea: ['rock']
  };
  var SANDR = [AK('#fff0c8'), AK('#e8d0a0'), AK('#c8a870'), AK('#9a7c4c'), AK('#5a4428')], SNOWR = [AK('#ffffff'), AK('#e8eef6'), AK('#c4d0e0'), AK('#9aa8c0'), AK('#5a6a80')];
  function decorHi(kind, n, phase) {
    var km = KINDMAP[kind]; if (!km) return null;
    var r = km[0] === 'rock' ? GEN.rock(n, km[1] === 'sand' ? SANDR : (km[1] === 'snow' ? SNOWR : null)) : GEN[km[0]](n, km[1]);
    var g = r.g;
    if (phase != null && r.crownB > 0) {   // Wiegen: Zeilen oberhalb der Kronenunterkante seitlich versetzen
      var amp = [-1, 0, 1][phase], o = new DG(g.w, g.h);
      for (var y = 0; y < g.h; y++) { var sh = y < r.crownB ? Math.round(amp * (1 - y / r.crownB) * 1.6) : 0; for (var x = 0; x < g.w; x++) { var c = g.d[y * g.w + x]; if (c) o.set(x + sh, y, c); } }
      g = o;
    }
    g = r.edge === null ? g.pad(1, 1, 1, 0) : g.pad(1, 1, 1, 0).outline(r.edge);
    if (r.sh[2] > 0) shadowEll(g, r.sh[0] + 1, r.sh[1], r.sh[2], r.sh[3]);
    return g;
  }
  // alle Farben der Generatoren vor dem Backen anmelden (Generatoren einmal je Zweig laufen lassen)
  Object.keys(GEN).forEach(function (k) { for (var n0 = 0; n0 < 4; n0++) { GEN[k](n0, true); GEN[k](n0, false); } });
  GEN.rock(0, SANDR); GEN.rock(0, SNOWR);
  S.lib.lazyDef('hd_', function (key) {
    var m = /^hd_([a-z_]+?)_(\d+)(?:_w(\d))?$/.exec(key); if (!m) return null;
    var g = decorHi(m[1], +m[2], m[3] != null ? +m[3] : null); if (!g) return null;
    return { grid: g, scale: 0.5, ox: Math.round(8 - g.w * 0.5) / 2, oy: 8 - g.h * 0.5 };
  });
  // Varianten je Art (mindestens fünf) und Umleitung der alten Schlüssel
  var VARCOUNT = { tree: 6, tree_s: 5, jtree: 5, palm: 5, bush: 5, fern: 3, bush_dry: 5, mangrove: 3, pine: 6, pine_s: 5, pine_snow: 5, acacia: 5, cactus: 5, shroom: 5, shroom_s: 5,
    crystal: 5, reed: 5, rock: 5, rock_grey: 5, rock_sand: 3, rock_snow: 3, peak: 5, icepeak: 5, shrub: 5, deadtree: 5, crag: 5, icecrag: 5, sandbar: 5, rock_sea: 3 };
  Object.keys(VARCOUNT).forEach(function (k) {
    for (var i = 0; i < VARCOUNT[k]; i++) {
      var seed = (k.length * 7 + i * 3) % 97 + i;
      S.lib.ALIAS['d_' + k + '_' + i] = 'hd_' + k + '_' + seed;
      for (var p = 0; p < 3; p++) S.lib.ALIAS['d_' + k + '_' + i + '_w' + p] = 'hd_' + k + '_' + seed + '_w' + p;
    }
  });
  Object.keys(DECOR).forEach(function (k) { DECOR[k].list.forEach(function (it) { if (VARCOUNT[it[0]]) it[1] = VARCOUNT[it[0]]; }); });
  // Wiege-Phase: key + phase 0..2 -> Schlüssel (für Arten ohne Wiegen kommt der Schlüssel unverändert zurück)
  S.swayKey = function (key, phase) { var k = key + '_w' + (((phase | 0) % 3) + 3) % 3; return S.lib.ALIAS[k] || /^s_field_[23]$/.test(key) ? k : key; };

  // ------------------------------------------------------------------ Sprites backen
  (WW._spriteBuilders = WW._spriteBuilders || []).push(function (L) {
    var Grid = L.Grid, def = L.def;
    var buf = new Uint16Array(64);

    // Boden als einfache Kacheln (ohne Kanten) für Vorschau, Icons und als Rückfall
    for (var id = 0; id < N; id++) {
      var key = TT[id].key, nv = key === 'grass' ? 4 : 3;
      for (var v = 0; v < nv; v++) {
        baseTile(buf, id, 8 * (v * 5 + 3), 8 * (id * 3 + 200));
        var g = new Grid(8, 8);
        for (var i = 0; i < 64; i++) g.d[i] = buf[i];
        def('t_' + key + '_' + v, g, { group: 'ground' });
      }
    }
    // Überlagerungen: verbrannter Boden, Krater (Rand durchsichtig, auf jedem Boden nutzbar)
    var ashD = addColor(null, '#4a4652'), ash = addColor(null, '#5f5a66'), ember = DC.ember;
    var g2 = new Grid(8, 8);
    // füllt die Kachel (nur Eckpixel ausgefranst), damit verbrannte Flächen nahtlos zusammenwachsen
    for (var sy = 0; sy < 8; sy++) for (var sx = 0; sx < 8; sx++) {
      var r = hash(sx, sy, 77), corner = (sx === 0 || sx === 7) && (sy === 0 || sy === 7);
      if (corner && r < 0.6) continue;
      g2.set(sx, sy, r < 0.05 ? ember : (r < 0.3 ? ashD : ash));
    }
    def('t_scorched', g2, { group: 'ground' });
    var soil = addColor(null, '#8a5a34'), soilD = addColor(null, '#5e3c24'), soilL = addColor(null, '#b07c4c');
    g2 = new Grid(8, 8);
    g2.ellipse(4, 4, 4, 3.8, function (x, y, nx, ny) { var s = nx + ny; return s < -0.8 ? soilL : (s > 0.9 ? soilL : soil); });
    g2.ellipse(4.2, 4.3, 2.6, 2.2, function (x, y, nx, ny) { return ny < -0.2 ? soilD : soil; });
    g2.set(4, 4, soilD); g2.set(3, 4, soilD);
    def('t_crater', g2, { group: 'ground' });

    // -------------------------------------------------------------- Trampelpfade t_path_<maske>
    // Erdweg als Überlagerung (Rand durchsichtig). Maske: Bit0 N, Bit1 O, Bit2 S, Bit3 W = Weg führt dorthin.
    var PTH = addColor(null, '#c9a26b'), PTHD = addColor(null, '#b08a56'), PTHL = addColor(null, '#dbb882');
    for (var pm = 0; pm < 16; pm++) {
      var pg = new Grid(8, 8);
      var inP = function (x, y) {
        if (x < 0 || y < 0 || x > 7 || y > 7) return false;
        var cx = x >= 2 && x <= 5, cy = y >= 2 && y <= 5;
        if (cx && cy) return !((x === 2 || x === 5) && (y === 2 || y === 5) && pm === 0);
        if (cx && y < 2 && (pm & 1)) return true;
        if (cx && y > 5 && (pm & 4)) return true;
        if (cy && x > 5 && (pm & 2)) return true;
        if (cy && x < 2 && (pm & 8)) return true;
        return false;
      };
      for (var py = 0; py < 8; py++) for (var px = 0; px < 8; px++) {
        if (!inP(px, py)) continue;
        var edge = !inP(px - 1, py) || !inP(px + 1, py) || !inP(px, py - 1) || !inP(px, py + 1);
        // offene Enden an der Kachelkante zählen nicht als Rand
        if (edge) {
          var openSide = (py === 0 && (pm & 1) && inP(px, py + 1) && (inP(px - 1, py) && inP(px + 1, py))) ||
                         (py === 7 && (pm & 4) && inP(px - 1, py) && inP(px + 1, py)) ||
                         (px === 7 && (pm & 2) && inP(px, py - 1) && inP(px, py + 1)) ||
                         (px === 0 && (pm & 8) && inP(px, py - 1) && inP(px, py + 1));
          if (openSide) edge = false;
        }
        var hv = hash(px, py, 300 + pm);
        if (edge && hv < 0.3) continue;              // ausgefranster Rand
        pg.set(px, py, edge ? PTHD : (hv < 0.12 ? PTHL : (hv > 0.93 ? PTHD : PTH)));
      }
      def('t_path_' + pm, pg, { group: 'ground' });
    }

    // -------------------------------------------------------------- Deko
    var K = function (h) { return addColor(null, h); };
    // runde Laubkrone aus mehreren Kreisen; Licht von links oben; dunkle Kontur; Schatten nach rechts unten
    function blob(w, h, circles, tones, outlineC, seed) {
      var o = new Grid(w, h);
      circles.forEach(function (c) {
        o.ellipse(c[0], c[1], c[2], c[3] || c[2], function (x, y, nx, ny) {
          var s = nx * 0.85 + ny + (hash(x, y, seed) - 0.5) * 0.35;
          if (s < -0.75) return tones[0];
          if (s > 0.55) return tones[2];
          return tones[1];
        });
      });
      return o;
    }
    function withShadow(o, sx, sy, rx, ry, col) {
      // Schatten nur in freie Pixel
      var sh = new Grid(o.w, o.h);
      sh.ellipse(sx, sy, rx, ry, col == null ? C.shade : col);
      for (var i = 0; i < o.d.length; i++) if (!o.d[i] && sh.d[i]) o.d[i] = sh.d[i];
      return o;
    }
    var LEAF = [K('#9ad65e'), K('#58a843'), K('#3a7f39')], LEAFO = K('#24502c');
    var LEAF2 = [K('#b4dc62'), K('#79b842'), K('#4f8a35')];           // hellere Variante
    var JUNG = [K('#5cc46c'), K('#2f8f4a'), K('#1d6a3c')], JUNGO = K('#123f2a');
    var PINE = [K('#6cae7c'), K('#3c7c58'), K('#2a5c45')], PINEO = K('#183a30');
    var TRUNK = K('#7a4a2a'), TRUNKL = K('#9c653a'), TRUNKD = K('#55331f');

    function tree(w, h, crown, tones, trunkH, seed) {
      var o = new Grid(w, h);
      var cx = Math.floor(w / 2);
      // Stamm
      o.rect(cx - 1, h - 2 - trunkH, 1, trunkH, TRUNKL); o.rect(cx, h - 2 - trunkH, 1, trunkH, TRUNK);
      o.set(cx - 1, h - 3, TRUNK); o.set(cx, h - 3, TRUNKD);
      var cr = blob(w, h, crown, tones, LEAFO, seed);
      o.blit(cr, 0, 0);
      return o;
    }
    function finishDecor(o, oc, sx, sy, rx, ry) {
      o = o.outline(oc);
      return withShadow(o, sx, sy, rx, ry);
    }
    // Laubbäume: 12 breit, Krone überragt die Kachel, damit Wald zu einem Kronendach verschmilzt
    var trees = [
      { w: 13, h: 15, c: [[6.5, 6, 5.2, 5], [4, 7.5, 3], [9, 7.5, 3]], t: 3 },
      { w: 13, h: 16, c: [[6.5, 6, 5.5, 5.4], [6.5, 3.5, 3.2]], t: 3 },
      { w: 12, h: 14, c: [[6, 6, 4.8, 4.6], [3.8, 7.8, 2.6], [8.4, 7, 2.8]], t: 3 },
      { w: 13, h: 15, c: [[6.5, 6.5, 5.3, 4.8], [4.5, 4.5, 3], [8.5, 5, 3]], t: 3 }
    ];
    trees.forEach(function (T, i) {
      var o = tree(T.w, T.h, T.c, i === 3 ? LEAF2 : LEAF, T.t, 300 + i);
      def('d_tree_' + i, finishDecor(o.pad(1, 1, 1, 0), LEAFO, T.w / 2 + 2.5, T.h - 0.5, T.w / 2 - 0.5, 1.6), { group: 'decor' });
    });
    [{ w: 9, h: 11, c: [[4.5, 4.5, 3.8, 3.6], [3, 5.5, 2.2]] }, { w: 9, h: 10, c: [[4.5, 4.2, 3.6, 3.4]] }].forEach(function (T, i) {
      var o = tree(T.w, T.h, T.c, i ? LEAF2 : LEAF, 2, 320 + i);
      def('d_tree_s_' + i, finishDecor(o.pad(1, 1, 1, 0), LEAFO, T.w / 2 + 2, T.h - 0.5, T.w / 2 - 0.5, 1.4), { group: 'decor' });
    });
    // Büsche
    [[8, 6], [7, 5]].forEach(function (s, i) {
      var o = blob(s[0], s[1], [[s[0] / 2, s[1] / 2 + 0.5, s[0] / 2, s[1] / 2 - 0.2], [2.5, s[1] / 2 + 1, 2]], i ? LEAF2 : LEAF, LEAFO, 340 + i);
      if (i === 0) { o.set(2, 2, K('#f7a1c4')); o.set(5, 3, K('#ffffff')); }
      def('d_bush_' + i, finishDecor(o.pad(1, 1, 1, 1), LEAFO, s[0] / 2 + 2, s[1] + 1, s[0] / 2, 1.2), { group: 'decor' });
    });
    // Dschungelbäume: groß, dunkel, breite Blattkrone mit Lianen
    [{ w: 14, h: 16, c: [[7, 6, 6, 4.8], [3.5, 8, 3.2], [10.5, 8, 3.2], [7, 3.5, 4, 3]] },
     { w: 13, h: 15, c: [[6.5, 6.5, 5.6, 5], [4, 4, 3.2], [9, 4.5, 3.2]] },
     { w: 12, h: 14, c: [[6, 6, 5, 4.6], [6, 8.5, 4.5, 2.5]] }].forEach(function (T, i) {
      var o = tree(T.w, T.h, T.c, JUNG, 3, 360 + i);
      // Lianen
      var vine = K('#4fb05a');
      o.set(3, 10, vine); o.set(3, 11, vine); o.set(T.w - 3, 10, vine); o.set(T.w - 3, 11, vine); o.set(T.w - 3, 12, vine);
      def('d_jtree_' + i, finishDecor(o.pad(1, 1, 1, 0), JUNGO, T.w / 2 + 2.5, T.h - 0.5, T.w / 2 - 0.5, 1.6), { group: 'decor' });
    });
    // Palmen
    [0, 1].forEach(function (i) {
      var o = new Grid(13, 16), fr = [K('#8ad870'), K('#45a656'), K('#2b7a42')];
      // gebogener Stamm
      for (var y = 5; y < 14; y++) { var x = 6 + Math.round((y - 14) * (i ? 0.25 : -0.2)); o.set(x, y, (y & 1) ? TRUNKL : TRUNK); o.set(x + 1, y, TRUNKD); }
      var top = i ? 4 : 6; var tx = i ? 4 : 8;
      // Wedel
      var fronds = [[-5, 1], [-3, -2], [0, -3], [3, -2], [5, 1], [-4, 3], [4, 3]];
      fronds.forEach(function (f, k) { o.line(tx, top, tx + f[0], top + f[1], fr[k < 3 ? 0 : (k < 5 ? 1 : 2)]); o.line(tx, top + 1, tx + f[0], top + f[1] + 1, fr[2]); });
      o.set(tx, top + 1, K('#a0662f')); o.set(tx + 1, top + 1, K('#a0662f'));
      def('d_palm_' + i, finishDecor(o.pad(1, 1, 1, 0), JUNGO, 8.5, 15.5, 4, 1.2), { group: 'decor' });
    });
    // Farn (Dschungelboden)
    [0].forEach(function (i) {
      var o = new Grid(9, 6), c = [K('#6dd07a'), K('#38a050'), K('#24773d')];
      o.line(4, 5, 0, 2, c[1]); o.line(4, 5, 8, 2, c[2]); o.line(4, 5, 2, 0, c[0]); o.line(4, 5, 6, 0, c[1]); o.line(4, 5, 4, 0, c[0]);
      def('d_fern_' + i, finishDecor(o.pad(1, 1, 1, 1), JUNGO, 5.5, 7, 4, 1), { group: 'decor' });
    });
    // Tannen: gestufte Dreiecke
    function pine(w, h, tones, snow, seed) {
      var o = new Grid(w, h);
      var cx = (w - 1) / 2, tiers = Math.floor((h - 3) / 3.2);
      var bottom = h - 3;
      for (var y = 0; y <= bottom; y++) {
        var t = y / bottom;
        var tierPos = (y % 4) / 3;
        var half = 0.5 + t * (w / 2 - 1.2) + tierPos * 0.9;
        half = Math.min(half, w / 2 - 0.2);
        for (var x = 0; x < w; x++) {
          var dx = x - cx;
          if (Math.abs(dx) > half) continue;
          var c = dx < -half * 0.35 ? tones[0] : (dx > half * 0.45 ? tones[2] : tones[1]);
          if ((y % 4) === 3 && Math.abs(dx) > half - 1.5) c = tones[2];
          if (snow && (y % 4) === 0 && dx < half * 0.5) c = dx < 0 ? SNOWW : SNOWD;
          o.set(x, y, c);
        }
      }
      o.set(Math.floor(cx), h - 2, TRUNK); o.set(Math.ceil(cx), h - 2, TRUNKD);
      if (Math.floor(cx) === Math.ceil(cx)) o.set(Math.floor(cx) - 1, h - 2, TRUNKL);
      return o;
    }
    var SNOWW = K('#ffffff'), SNOWD = K('#d8e6f2');
    [[9, 17], [9, 15], [8, 14]].forEach(function (s, i) {
      def('d_pine_' + i, finishDecor(pine(s[0], s[1], PINE, false, 380 + i).pad(1, 1, 1, 0), PINEO, s[0] / 2 + 2, s[1] - 0.5, s[0] / 2 - 0.3, 1.4), { group: 'decor' });
    });
    [[7, 12], [7, 11]].forEach(function (s, i) {
      def('d_pine_s_' + i, finishDecor(pine(s[0], s[1], PINE, false, 390 + i).pad(1, 1, 1, 0), PINEO, s[0] / 2 + 2, s[1] - 0.5, s[0] / 2 - 0.3, 1.2), { group: 'decor' });
    });
    [[9, 15], [7, 12]].forEach(function (s, i) {
      def('d_pine_snow_' + i, finishDecor(pine(s[0], s[1], PINE, true, 395 + i).pad(1, 1, 1, 0), PINEO, s[0] / 2 + 2, s[1] - 0.5, s[0] / 2 - 0.3, 1.2), { group: 'decor' });
    });
    // Akazie (Savanne): flacher Schirm
    [0, 1].forEach(function (i) {
      var o = new Grid(14, 12), t = [K('#b9d468'), K('#86a83e'), K('#5e7d30')];
      o.line(7, 11, 7, 5, TRUNK); o.line(7, 7, 4 - i, 4, TRUNK); o.line(7, 7, 10, 4 + i, TRUNKD); o.set(8, 10, TRUNKD); o.set(8, 9, TRUNKD);
      o.ellipse(7, 3, 6.5 - i, 2.2, function (x, y, nx, ny) { return ny < -0.3 ? t[0] : (ny > 0.4 ? t[2] : t[1]); });
      def('d_acacia_' + i, finishDecor(o.pad(1, 1, 1, 0), K('#3d5222'), 9, 12.5, 4, 1), { group: 'decor' });
    });
    // trockener Busch
    [0, 1].forEach(function (i) {
      var o = blob(7, 5, [[3.5, 3, 3.4, 2.3]], [K('#c8c46a'), K('#9d9a46'), K('#78752f')], 0, 410 + i);
      if (i) { o.set(1, 2, K('#e8834a')); }
      def('d_bush_dry_' + i, finishDecor(o.pad(1, 1, 1, 1), K('#4f4c22'), 5, 6, 3.5, 1), { group: 'decor' });
    });
    // Kakteen
    var CAC = [K('#8fd07a'), K('#4fa85a'), K('#2f7a44')], CACO = K('#1e4b2e');
    [0, 1, 2].forEach(function (i) {
      var o = new Grid(7, 11);
      var h = [10, 8, 6][i];
      o.rect(2, 11 - h, 3, h, CAC[1]); o.vline(2, 11 - h, h, CAC[0]); o.vline(4, 11 - h, h, CAC[2]);
      if (i < 2) { o.rect(0, 11 - h + 3, 1, 3, CAC[0]); o.set(1, 11 - h + 5, CAC[1]); }
      if (i === 0) { o.rect(6, 11 - h + 2, 1, 3, CAC[2]); o.set(5, 11 - h + 4, CAC[1]); o.set(3, 11 - h, K('#f7a1c4')); }
      def('d_cactus_' + i, finishDecor(o.pad(1, 1, 1, 0), CACO, 5, 11.5, 3, 1), { group: 'decor' });
    });
    // Pilze
    function shroom(capW, capH, stemH, cap, dots) {
      var o = new Grid(capW, capH + stemH);
      var sx = Math.floor(capW / 2) - 1;
      o.rect(sx, capH - 1, 2, stemH + 1, K('#f4ead2')); o.vline(sx + 1, capH - 1, stemH + 1, K('#d8c8a8'));
      o.ellipse(capW / 2, capH - 0.3, capW / 2, capH, function (x, y, nx, ny) { return ny > 0.15 ? cap[2] : (nx + ny < -0.7 ? cap[0] : cap[1]); });
      o.hline(1, capH - 1, capW - 2, cap[2]);
      if (dots) { o.set(Math.floor(capW / 2) - 1, 1, SNOWW); o.set(capW - 3, Math.max(1, capH - 2), SNOWW); o.set(2, capH - 2, SNOWW); }
      return o;
    }
    var RED = [K('#ff8b78'), K('#e2483f'), K('#a52c36')], VIO = [K('#d6a6f0'), K('#9b63cc'), K('#6a3c98')], ORA = [K('#ffc27a'), K('#ee8a3a'), K('#b05a28')];
    [[shroom(11, 5, 6, RED, true)], [shroom(9, 4, 7, VIO, true)], [shroom(10, 4, 5, ORA, false)]].forEach(function (a, i) {
      def('d_shroom_' + i, finishDecor(a[0].pad(1, 1, 1, 0), K('#3e2340'), a[0].w / 2 + 2, a[0].h - 0.5, a[0].w / 2 - 1, 1.2), { group: 'decor' });
    });
    [[shroom(6, 3, 3, RED, true)], [shroom(5, 3, 3, VIO, false)]].forEach(function (a, i) {
      def('d_shroom_s_' + i, finishDecor(a[0].pad(1, 1, 1, 0), K('#3e2340'), a[0].w / 2 + 2, a[0].h - 0.5, a[0].w / 2, 1), { group: 'decor' });
    });
    // Kristalle
    var CRY = [K('#e4fbff'), K('#86e0e6'), K('#4aa4c4')], CRY2 = [K('#f4e2ff'), K('#c39bf0'), K('#8a62c8')];
    function shard(o, x0, base, w, h, t) {
      var cx = x0 + (w - 1) / 2;
      for (var y = 0; y < h; y++) for (var x = x0; x < x0 + w; x++) {
        var dx = x - cx, topY = Math.abs(dx) * 1.7;
        if (y >= topY) o.set(x, base - h + 1 + y, dx < -0.2 ? t[0] : (dx < 0.6 ? t[1] : t[2]));
      }
    }
    [0, 1, 2].forEach(function (i) {
      var o = new Grid(10, 13), t = i === 1 ? CRY2 : CRY;
      if (i === 0) { shard(o, 3, 12, 3, 12, t); shard(o, 0, 12, 3, 7, t); shard(o, 6, 12, 3, 8, t); }
      if (i === 1) { shard(o, 2, 12, 3, 10, t); shard(o, 5, 12, 3, 7, CRY); }
      if (i === 2) { shard(o, 1, 12, 3, 6, t); shard(o, 4, 12, 3, 9, t); shard(o, 7, 12, 2, 5, t); }
      def('d_crystal_' + i, finishDecor(o.pad(1, 1, 1, 0), K('#2b3f63'), 6.5, 12.5, 4, 1), { group: 'decor' });
    });
    // Schilf
    [0, 1, 2].forEach(function (i) {
      var o = new Grid(7, 9), st = K('#5f8a44'), stL = K('#8cbc5c'), cat = K('#7a4a2a');
      var xs = [[1, 3, 5], [2, 4], [1, 2, 4, 5]][i];
      xs.forEach(function (x, k) { var h = 5 + ((k + i) % 3); o.vline(x, 9 - h, h, k & 1 ? st : stL); if (k % 2 === 0) { o.set(x, 9 - h - 1, cat); o.set(x, 9 - h, cat); } });
      def('d_reed_' + i, finishDecor(o.pad(1, 1, 1, 0), K('#2e4a2a'), 5, 9.5, 3, 0.8), { group: 'decor' });
    });
    // Mangrove (Sumpf)
    [0].forEach(function (i) {
      var o = tree(11, 13, [[5.5, 5, 4.6, 4], [3, 6, 2.6], [8, 6, 2.6]], [K('#8fbf6a'), K('#5b8a4a'), K('#3e6638')], 2, 430);
      o.set(3, 11, TRUNK); o.set(7, 11, TRUNK); o.set(2, 12, TRUNKD); o.set(8, 12, TRUNKD);
      def('d_mangrove_' + i, finishDecor(o.pad(1, 1, 1, 0), K('#26402a'), 7.5, 13.5, 4.5, 1.2), { group: 'decor' });
    });
    // Felsen
    function boulder(w, h, t, seed) {
      return blob(w, h, [[w / 2, h / 2 + 0.3, w / 2, h / 2], [w / 2 - 1, h / 2 - 0.5, w / 2 - 1.2, h / 2 - 0.6]], t, 0, seed);
    }
    var RK = [K('#d2d0d8'), K('#a5a3b0'), K('#7a7888')], RKO = K('#3f3d4e');
    var RKS = [K('#f4e2b8'), K('#d8b986'), K('#b0915e')];
    var RKW = [K('#ffffff'), K('#cfd9e4'), K('#9cadc0')];
    [[7, 5], [5, 4], [8, 6]].forEach(function (s, i) {
      def('d_rock_' + i, finishDecor(boulder(s[0], s[1], RK, 450 + i).pad(1, 1, 1, 1), RKO, s[0] / 2 + 2, s[1] + 1.2, s[0] / 2, 1), { group: 'decor' });
    });
    [[8, 6], [6, 5]].forEach(function (s, i) {
      def('d_rock_grey_' + i, finishDecor(boulder(s[0], s[1], [K('#c4c3cc'), K('#8f8e9b'), K('#6a6878')], 460 + i).pad(1, 1, 1, 1), RKO, s[0] / 2 + 2, s[1] + 1.2, s[0] / 2, 1), { group: 'decor' });
    });
    def('d_rock_sand_0', finishDecor(boulder(6, 4, RKS, 470).pad(1, 1, 1, 1), K('#6e5634'), 5, 5.2, 3, 0.9), { group: 'decor' });
    def('d_rock_snow_0', finishDecor(boulder(7, 5, RKW, 471).pad(1, 1, 1, 1), K('#5a6a80'), 5.5, 6.2, 3.5, 1), { group: 'decor' });
    // Gipfel (auf Gebirgsplateaus): Felsnadel mit Schneehaube
    function peak(w, h, cap, t, capT, seed) {
      var o = new Grid(w, h), cx = (w - 1) / 2 + 0.2;
      for (var y = 0; y < h; y++) {
        var tt = y / (h - 1);
        var half = 0.4 + Math.pow(tt, 0.85) * (w / 2 - 0.4);
        var ridge = cx + tt * 0.8;
        for (var x = 0; x < w; x++) {
          var xc = x + 0.5 - 0.5;
          if (xc < cx - half || xc > cx + half) continue;
          var right = xc > ridge;
          var c = right ? t[2] : t[1];
          if (!right && xc < cx - half + 1.4) c = t[0];
          if (y < cap + (hash(x, 1, seed) < 0.5 ? 1 : 0)) c = right ? capT[1] : capT[0];
          o.set(x, y, c);
        }
      }
      return o;
    }
    var PK = [K('#c7c6d0'), K('#9d9ba9'), K('#76748a')], CAP = [K('#ffffff'), K('#d5e2ef')];
    [[13, 13, 4], [11, 11, 3], [9, 9, 0]].forEach(function (s, i) {
      def('d_peak_' + i, finishDecor(peak(s[0], s[1], s[2], PK, CAP, 480 + i).pad(1, 1, 1, 0), RKO, s[0] / 2 + 2, s[1] - 0.2, s[0] / 2 - 0.5, 1.2), { group: 'decor' });
    });
    def('d_icepeak_0', finishDecor(peak(11, 12, 12, PK, [K('#ffffff'), K('#c8d9ea')], 490).pad(1, 1, 1, 0), K('#4a5f80'), 7.5, 11.8, 5, 1.1), { group: 'decor' });

    // -------------------------------------------------------------- Gleise t_rail_<maske> (Überlagerung, Bit0 N, Bit1 O, Bit2 S, Bit3 W)
    var GRV = [addColor(null, '#b4ada0'), addColor(null, '#958e82'), addColor(null, '#7a7468')];
    var TIE = [addColor(null, '#8a5a34'), addColor(null, '#6a4226')], RAIL = [addColor(null, '#dfe4ea'), addColor(null, '#8a92a0')];
    function railTile(mask) {
      var g = new Grid(8, 8), x, y;
      var n = mask & 1, e = mask & 2, s = mask & 4, w = mask & 8, cnt = (n ? 1 : 0) + (e ? 1 : 0) + (s ? 1 : 0) + (w ? 1 : 0);
      var curve = cnt === 2 && !((n && s) || (e && w));
      if (curve) {
        var cx = e ? 8 : 0, cy = n ? 0 : 8;
        for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
          var d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d > 0.8 && d < 7.2) g.set(x, y, hash(x, y, 31) < 0.3 ? GRV[1] : GRV[0]);
        }
        for (var a = 0; a <= 8; a++) {   // Schwellen radial
          var t = (a + 0.5) / 9 * Math.PI / 2, dx = Math.cos(t), dy = Math.sin(t);
          if (a % 2) continue;
          for (var r = 1.5; r <= 6.5; r += 0.5) { var px = Math.floor(cx + (cx ? -1 : 1) * dx * r), py = Math.floor(cy + (cy ? -1 : 1) * dy * r); g.set(px, py, r < 2 || r > 6 ? TIE[1] : TIE[0]); }
        }
        for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) {
          var d2 = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (Math.abs(d2 - 2.5) < 0.55 || Math.abs(d2 - 5.5) < 0.55) g.set(x, y, Math.abs(d2 - 5.5) < 0.55 ? RAIL[0] : RAIL[1]);
        }
        return g;
      }
      function vert(y0, y1) {
        for (y = y0; y <= y1; y++) { for (x = 1; x <= 6; x++) g.set(x, y, hash(x, y, 32) < 0.3 ? GRV[1] : GRV[0]); g.set(1, y, GRV[2]); }
        for (y = y0; y <= y1; y++) if ((y & 1) === 0) g.hline(1, y, 6, TIE[0]);
        for (y = y0; y <= y1; y++) { g.set(2, y, RAIL[0]); g.set(5, y, RAIL[1]); }
      }
      function horiz(x0, x1) {
        for (x = x0; x <= x1; x++) { for (y = 1; y <= 6; y++) g.set(x, y, hash(x, y, 33) < 0.3 ? GRV[1] : GRV[0]); g.set(x, 6, GRV[2]); }
        for (x = x0; x <= x1; x++) if ((x & 1) === 0) g.vline(x, 1, 6, TIE[0]);
        for (x = x0; x <= x1; x++) { g.set(x, 2, RAIL[0]); g.set(x, 5, RAIL[1]); }
      }
      if (cnt === 0) { horiz(1, 6); return g; }
      if (n || s) vert(n ? 0 : 3, s ? 7 : 4);
      if (e || w) horiz(w ? 0 : 3, e ? 7 : 4);
      if (cnt === 1) {   // Prellbock am offenen Ende
        if (n) g.hline(1, 5, 6, C.red); if (s) g.hline(1, 2, 6, C.red); if (e) g.vline(2, 1, 6, C.red); if (w) g.vline(5, 1, 6, C.red);
      }
      return g;
    }
    for (var rm = 0; rm < 16; rm++) def('t_rail_' + rm, railTile(rm), { group: 'ground' });
    // Brücken über Wasser: Holzdeck mit Geländer
    (function () {
      var DK = [addColor(null, '#b88a58'), addColor(null, '#8c643c'), addColor(null, '#5e4026')];
      var h = new Grid(8, 8);
      h.rect(0, 1, 8, 6, DK[0]); for (var x = 0; x < 8; x += 2) h.vline(x, 1, 6, DK[1]);
      h.hline(0, 0, 8, DK[2]); h.hline(0, 7, 8, DK[2]); h.set(0, 7, DK[1]); h.set(4, 7, DK[1]);
      h.hline(0, 2, 8, RAIL[0]); h.hline(0, 5, 8, RAIL[1]);
      def('t_rail_bridge_h', h, { group: 'ground' });
      var v = new Grid(8, 8);
      v.rect(1, 0, 6, 8, DK[0]); for (var y = 0; y < 8; y += 2) v.hline(1, y, 6, DK[1]);
      v.vline(0, 0, 8, DK[2]); v.vline(7, 0, 8, DK[2]);
      v.vline(2, 0, 8, RAIL[0]); v.vline(5, 0, 8, RAIL[1]);
      def('t_rail_bridge_v', v, { group: 'ground' });
    })();

    // -------------------------------------------------------------- Weiche Überlagerungen: Verödung, Ruß, Dunst
    // Je Stufe 16 Randvarianten: Maske = Nachbarn mit mindestens derselben Stufe (Bit0 N, Bit1 O, Bit2 S, Bit3 W).
    // Zur offenen Seite hin dünnt die Fläche unregelmäßig aus. Schlüssel <basis>_<maske>, <basis> allein = 15 (voll).
    function softSet(base, pal, seed, deco) {
      for (var m = 0; m < 16; m++) {
        var g = new Grid(8, 8);
        for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
          var d = 9;
          if (!(m & 1)) d = Math.min(d, y + 0.5); if (!(m & 4)) d = Math.min(d, 7.5 - y);
          if (!(m & 8)) d = Math.min(d, x + 0.5); if (!(m & 2)) d = Math.min(d, 7.5 - x);
          var keep = d >= 4 ? 1 : (d / 4) * 0.9 + (hash(x * 3, y * 5, seed + 7) - 0.5) * 0.35;
          if (hash(x, y, seed + m) > keep) continue;
          var hv = hash(x, y, seed);
          g.set(x, y, hv < pal[1][1] ? pal[1][0] : (hv > 1 - pal[2][1] ? pal[2][0] : pal[0]));
        }
        if (deco) deco(g, m);
        def(base + '_' + m, g, { group: 'ground' });
        if (m === 15) def(base, g, { group: 'ground' });
      }
    }
    var A = function (h, a) { return addColor(null, h, a); };
    softSet('t_barren_1', [A('#c8c0a0', 70), [A('#b8ae8a', 90), 0.2], [A('#d6d0b8', 70), 0.1]], 600);
    softSet('t_barren_2', [A('#a29c8c', 135), [A('#7e786a', 160), 0.22], [A('#bab4a4', 130), 0.1]], 610, function (g, m) { if (m === 15) { g.line(1, 2, 3, 4, A('#5e5850', 170)); g.line(3, 4, 6, 3, A('#5e5850', 170)); } });
    softSet('t_barren_3', [A('#6e6860', 185), [A('#4a4440', 205), 0.25], [A('#8a8478', 175), 0.08]], 620, function (g, m) { if (m === 15) { g.set(2, 5, A('#2a2628', 220)); g.set(3, 5, A('#2a2628', 220)); g.set(6, 2, A('#2a2628', 220)); } });
    softSet('t_soot', [A('#3a363a', 120), [A('#242024', 160), 0.25], [A('#5a565a', 100), 0.1]], 630);
    softSet('t_cleared', [A('#8a6a44', 200), [A('#6e5232', 220), 0.25], [A('#a8865a', 190), 0.15]], 640, function (g, m) { if (m === 15) { g.line(1, 1, 3, 2, A('#5a3e24', 230)); g.set(6, 5, A('#4f9a3c', 220)); g.set(5, 6, A('#4f9a3c', 220)); } });
    // Dunst mit weichen Rändern (ersetzt die harten Kacheln, Schlüssel t_smog_<n> bleiben = volle Fläche)
    softSet('t_smog_1', [A('#b8b08a', 70), [A('#a49c7a', 95), 0.25], [A('#c8c0a0', 60), 0.1]], 650);
    softSet('t_smog_2', [A('#b0a882', 115), [A('#9c9472', 140), 0.25], [A('#c0b896', 100), 0.1]], 660);
    softSet('t_smog_3', [A('#a8a07a', 160), [A('#948c6a', 185), 0.25], [A('#b8b08e', 145), 0.1]], 670);
    // gefällte Stämme
    var LOGC = [K('#b07a46'), K('#86582e'), K('#e6c890'), K('#5e3c22')];
    (function () {
      var a = new Grid(9, 4); a.rect(0, 0, 9, 3, LOGC[1]); a.hline(0, 0, 9, LOGC[0]); a.rect(8, 0, 1, 3, LOGC[2]); a.set(8, 1, LOGC[1]); a.set(3, 1, LOGC[3]);
      def('d_log_0', finishDecor(a.pad(1, 1, 1, 1), LOGC[3], 5.5, 4.5, 5, 0.9), { group: 'decor' });
      var b = new Grid(9, 6);
      [[0, 3], [4, 3], [2, 0]].forEach(function (p) { b.rect(p[0], p[1], 5, 3, LOGC[1]); b.hline(p[0], p[1], 5, LOGC[0]); b.vline(p[0] + 4, p[1], 3, LOGC[2]); b.set(p[0] + 4, p[1] + 1, LOGC[1]); });
      def('d_log_1', finishDecor(b.pad(1, 1, 1, 1), LOGC[3], 5.5, 6.5, 5, 0.9), { group: 'decor' });
    })();
    // Vorkommen: Brocken auf der Kachel
    [['iron', ['#c88a62', '#9a5a3a', '#6e3a26'], '#e0a070'], ['coal', ['#5a5660', '#38343c', '#201c22'], '#8a8a98'],
     ['gold', ['#c9c6cf', '#9d9aa8', '#77748a'], '#ffd84a'], ['crystal', ['#e4fbff', '#86e0e6', '#4aa4c4'], '#ffffff']].forEach(function (dp, di) {
      var P3 = dp[1].map(K), shine = K(dp[2]);
      [0, 1].forEach(function (v) {
        var o = new Grid(10, 7);
        (v ? [[3, 4, 3, 2.4], [7, 4.5, 2.4, 2], [5, 2.5, 2, 1.8]] : [[4, 4, 3.6, 2.6], [7.5, 5, 2, 1.6]]).forEach(function (c) {
          o.ellipse(c[0], c[1], c[2], c[3], function (x, y, nx, ny) { var s2 = nx * 0.8 + ny; return s2 < -0.6 ? P3[0] : (s2 > 0.5 ? P3[2] : P3[1]); });
        });
        if (dp[0] === 'crystal') { o.vline(4, 0, 4, P3[0]); o.vline(5, 1, 3, P3[2]); o.vline(7, 2, 3, P3[1]); }
        [[3, 3], [6, 4], [4, 5]].forEach(function (p, k) { if ((k + v) % 2 === 0 || dp[0] !== 'coal') o.set(p[0], p[1], shine); });
        def('d_deposit_' + dp[0] + '_' + v, finishDecor(o.pad(1, 1, 1, 1), K('#2a2430'), 6.5, 8, 5, 1), { group: 'decor' });
      });
    });
    // Beerensträucher und Blumenbüschel (Wachstum der Wildnis)
    [[K('#ee4a4a'), K('#ff9a8a')], [K('#5a5ad8'), K('#9a9af0')]].forEach(function (bc, i) {
      var o = blob(8, 6, [[4, 3.5, 4, 2.8], [2.5, 4, 2.2]], LEAF, LEAFO, 520 + i);
      [[1, 2], [4, 1], [6, 3], [3, 4], [5, 4]].forEach(function (p) { o.set(p[0], p[1], bc[0]); });
      o.set(4, 0, bc[1]); o.set(1, 1, bc[1]);
      def('d_berry_' + i, finishDecor(o.pad(1, 1, 1, 1), LEAFO, 6, 7, 4, 1), { group: 'decor' });
    });
    [[K('#ffe066'), K('#ffffff')], [K('#f7a1c4'), K('#ee6a5a')], [K('#b48ae6'), K('#8fc2ff')]].forEach(function (fc, i) {
      var o = new Grid(7, 5), st = K('#4f9a3c');
      [[1, 2], [3, 1], [5, 2], [2, 3], [4, 3]].forEach(function (p, k) { o.set(p[0], p[1] + 1, st); o.set(p[0], p[1], k & 1 ? fc[1] : fc[0]); });
      o.set(0, 4, st); o.set(6, 4, st);
      def('d_flower_' + i, o, { group: 'decor' });
    });
    // Strauch (Tundra), toter Baum und Stumpf (Asche)
    [0, 1].forEach(function (i) {
      var o = blob(6, 4, [[3, 2.4, 3, 1.8]], [K('#c4c9a0'), K('#8f9a72'), K('#6a7556')], 0, 500 + i);
      if (i) o.set(2, 1, K('#e86a5a'));
      def('d_shrub_' + i, finishDecor(o.pad(1, 1, 1, 1), K('#3f4734'), 4.5, 5.2, 3, 0.9), { group: 'decor' });
    });
    [0, 1].forEach(function (i) {
      var o = new Grid(9, 12), w = K('#5a4a44'), wl = K('#7a6a60');
      o.vline(4, 3, 9, wl); o.vline(5, 4, 8, w);
      o.line(4, 6, 1, 3 + i, wl); o.line(5, 5, 7, 2, w); o.line(1, 3 + i, 1, 2, wl); o.set(7, 1, w);
      def('d_deadtree_' + i, finishDecor(o.pad(1, 1, 1, 0), K('#26222a'), 6, 11.6, 3, 0.9), { group: 'decor' });
    });
    (function () {
      var o = new Grid(5, 4); o.rect(0, 1, 5, 3, K('#5a4a44')); o.hline(0, 0, 5, K('#9a8270')); o.set(2, 0, K('#7a6a60'));
      def('d_stump_0', finishDecor(o.pad(1, 1, 1, 1), K('#26222a'), 4, 5.2, 3, 0.8), { group: 'decor' });
    })();
  });

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
