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

    // --- tiefere Kachel: Wand der nördlichen höheren Kachel, Schatten, Brandung
    if (rn > r && !GI[n].water) {
      var gn = GI[n], fh = faceH(n, id);
      for (x = 0; x < 8; x++) {
        var streak = hash(X0 + x, Y0, 61) < 0.22;
        buf[x] = gn.lip;
        for (y = 1; y < fh; y++) buf[y * 8 + x] = (y === fh - 1) ? gn.fd : (streak ? gn.fd : gn.f);
        if (fh >= 4 && hash(X0 + x, Y0 + 2, 62) < 0.15) buf[2 * 8 + x] = gn.fd;
      }
      top = fh;
      if (me.water) {
        for (x = 0; x < 8; x++) {
          buf[top * 8 + x] = FOAMI;
          if (top + 1 < 8 && hash(X0 + x, Y0, 63) < 0.55) buf[(top + 1) * 8 + x] = me.shore;
        }
        top += 1;
      } else {
        for (x = 0; x < 8; x++) buf[top * 8 + x] = me.sh;
        top += 1;
      }
    } else if (rn > r && GI[n].water && me.water) {
      // flacheres Wasser im Norden: schon oben behandelt
    }
    // Westen höher: Schlagschatten bzw. Brandung
    if (rw > r && !GI[w].water) {
      for (y = top; y < 8; y++) {
        if (me.water) { buf[y * 8] = FOAMI; if (hash(X0 + 1, Y0 + y, 64) < 0.55) buf[y * 8 + 1] = me.shore; }
        else buf[y * 8] = me.sh;
      }
    }
    if (me.water) {
      if (re > r && !GI[e].water) for (y = top; y < 8; y++) { buf[y * 8 + 7] = FOAMI; if (hash(X0 + 6, Y0 + y, 65) < 0.55) buf[y * 8 + 6] = me.shore; }
      if (rs > r && !GI[s].water) for (x = 0; x < 8; x++) { buf[56 + x] = FOAMI; if (hash(X0 + x, Y0 + 6, 66) < 0.55) buf[48 + x] = me.shore; }
    }

    // --- höhere Kachel: helle Oberkante nach Norden/Westen, leichte Schattenkante nach Osten
    if (!me.water) {
      var hiN = rn < r, hiW = rw < r, hiE = re < r;
      if (hiN) for (x = 0; x < 8; x++) buf[x] = me.l;
      if (hiW) for (y = 0; y < 8; y++) buf[y * 8] = me.l;
      if (hiE) for (y = 0; y < 8; y++) buf[y * 8 + 7] = me.d;
      // abgerundete Außenecken
      if (hiN && hiW) buf[0] = GI[n].water ? GI[n].shore : GI[n].b;
      if (hiN && hiE) buf[7] = GI[n].water ? GI[n].shore : GI[n].b;
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
    mountain:  { p: 0.32, list: [['peak', 3, 5], ['rock_grey', 2, 1]] },
    snow:      { p: 0.35, list: [['icepeak', 1, 1]] },
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

  S.drawGround = drawGround;
  S.drawGroundMap = drawGroundMap;
  S.decorFor = decorFor;
  S.groundColor = groundColor;
  S.GROUND = { mix: mix };

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
    g2.ellipse(4, 4, 4.2, 3.9, function (x, y, nx, ny) {
      var r = hash(x, y, 77);
      if (nx * nx + ny * ny > 0.6 && r < 0.45) return null;
      return r < 0.06 ? ember : (r < 0.35 ? ashD : ash);
    });
    def('t_scorched', g2, { group: 'ground' });
    var soil = addColor(null, '#8a5a34'), soilD = addColor(null, '#5e3c24'), soilL = addColor(null, '#b07c4c');
    g2 = new Grid(8, 8);
    g2.ellipse(4, 4, 4, 3.8, function (x, y, nx, ny) { var s = nx + ny; return s < -0.8 ? soilL : (s > 0.9 ? soilL : soil); });
    g2.ellipse(4.2, 4.3, 2.6, 2.2, function (x, y, nx, ny) { return ny < -0.2 ? soilD : soil; });
    g2.set(4, 4, soilD); g2.set(3, 4, soilD);
    def('t_crater', g2, { group: 'ground' });

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
