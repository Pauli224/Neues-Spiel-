// Wuselwelt – Pixelkunst: Boden (alle Biome aus js/core/terrain.js).
// Boden hat keine Kontur, nur 2–3 Töne Struktur. Bäume, Berge, Pilze, Kristalle ragen nach oben über.
(function (WW) { 'use strict';

  (WW._spriteBuilders = WW._spriteBuilders || []).push(function (L) {
    var Grid = L.Grid, C = L.C, def = L.def, hash = L.hash;

    function tile(over) { return new Grid(8, 8 + (over || 0)); }
    // Fläche füllen und mit Sprenkeln versehen: tones = [[farbe, anteil], ...]
    function speckle(g, oy, base, tones, seed) {
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
        var r = hash(x, y, seed), acc = 0, c = base;
        for (var k = 0; k < tones.length; k++) { acc += tones[k][1]; if (r < acc) { c = tones[k][0]; break; } }
        g.set(x, oy + y, c);
      }
    }
    function rnd(seed, i) { return hash(i, 77, seed); }
    function ri(seed, i, n) { return Math.floor(rnd(seed, i) * n); }
    // kurze Wellenstriche
    function dashes(g, oy, seed, n, col, len, under) {
      for (var k = 0; k < n; k++) {
        var x = ri(seed, k * 3, 8 - len + 1), y = 1 + ri(seed, k * 3 + 1, 6);
        g.hline(x, oy + y, len, col);
        if (under) g.hline(x + 1, oy + y + 1, len - 1, under);
      }
    }
    function tuft(g, x, y, dark, light) { g.set(x, y, dark); g.set(x + 1, y - 1, dark); g.set(x + 2, y, dark); if (light) g.set(x + 1, y - 2, light); }

    var K = function (n) { return C[n]; };

    // ---------------- Wasser
    for (var v = 0; v < 3; v++) {
      var g = tile();
      speckle(g, 0, 'deep', [['deepD', 0.14], ['deepL', 0.04]], 10 + v);
      dashes(g, 0, 20 + v, 1, 'deepL', 3);
      def('t_deep_' + v, g, { group: 'ground' });

      g = tile();
      speckle(g, 0, 'water', [['waterD', 0.10], ['waterL', 0.03]], 30 + v);
      dashes(g, 0, 40 + v, v === 1 ? 2 : 1, 'waterL', 3, null);
      if (v === 2) g.set(ri(41, 9, 6) + 1, 2 + ri(41, 8, 4), 'foam');
      def('t_water_' + v, g, { group: 'ground' });

      g = tile();
      speckle(g, 0, 'shallow', [['water', 0.06], ['shallowL', 0.07], ['sandL', 0.02]], 50 + v);
      dashes(g, 0, 60 + v, 2, 'shallowL', 2);
      def('t_shallow_' + v, g, { group: 'ground' });

      // Fluss: hell, klar, mit Strömungsstrichen (schräg) und Schaumpunkten
      g = tile();
      speckle(g, 0, 'river', [['water', 0.08], ['shallowL', 0.06]], 70 + v);
      for (var k = 0; k < 2; k++) {
        var sx = ri(80 + v, k, 6), sy = 1 + k * 4 + ri(81 + v, k, 2);
        g.set(sx, sy, 'riverL'); g.set(sx + 1, sy, 'riverL'); g.set(sx + 2, sy + 1, 'shallowL');
      }
      g.set(ri(82 + v, 1, 8), ri(82 + v, 2, 8), 'foam');
      def('t_river_' + v, g, { group: 'ground' });
    }

    // ---------------- Sand, Wüste, Savanne
    for (v = 0; v < 3; v++) {
      g = tile();
      speckle(g, 0, 'sand', [['sandD', 0.09], ['sandL', 0.10]], 100 + v);
      if (v === 2) { g.set(2 + ri(101, 1, 4), 2 + ri(101, 2, 4), 'pink'); }
      if (v === 1) { g.set(1 + ri(102, 1, 5), 5, 'stone'); g.set(2 + ri(102, 1, 5), 5, 'sandD'); }
      def('t_sand_' + v, g, { group: 'ground' });

      // Wüste: wärmer, Dünenrippen (heller Kamm über dunkler Flanke)
      g = tile();
      speckle(g, 0, 'desert', [['desertD', 0.05], ['desertL', 0.05]], 110 + v);
      var oyy = ri(111 + v, 0, 3);
      for (var x = 0; x < 8; x++) {
        var yy = 1 + oyy + Math.round(Math.sin((x + v * 2) * 0.8) * 1);
        g.set(x, yy, 'desertL'); g.set(x, yy + 1, 'desertD');
        var y2 = yy + 4; if (y2 < 8) { g.set(x, y2, 'desertL'); if (y2 + 1 < 8) g.set(x, y2 + 1, 'desertD'); }
      }
      if (v === 2) { // kleiner Kaktus
        g.paint(4, 2, ['.f..', 'ef.f', 'eEef', '.Ee.', '.Ee.', '.AA.']);
      }
      def('t_desert_' + v, g, { group: 'ground' });

      // Savanne: gelbes Gras, Büschel, ab und zu ein kleiner Dornbusch
      g = tile();
      speckle(g, 0, 'sav', [['savD', 0.10], ['savL', 0.12], ['desertL', 0.03]], 120 + v);
      tuft(g, ri(121 + v, 0, 5), 3 + ri(121 + v, 1, 4), K('savD'), K('savL'));
      if (v === 1) tuft(g, ri(122, 0, 5), 2 + ri(122, 1, 3), K('savD'), K('desertL'));
      if (v === 2) g.paint(2, 3, ['.EE.E', 'EeEEe', '.EeE.', '..W..']);
      def('t_savanna_' + v, g, { group: 'ground' });
    }

    // ---------------- Wiese, Blumenwiese
    for (v = 0; v < 4; v++) {
      g = tile();
      speckle(g, 0, 'grass', [['grassD', 0.08], ['grassL', 0.07]], 200 + v);
      tuft(g, ri(201 + v, 0, 5), 3 + ri(201 + v, 1, 4), K('grassD'), K('grassL'));
      if (v === 1 || v === 2) tuft(g, ri(202 + v, 0, 5), 2 + ri(202 + v, 1, 3), K('grassD'), null);
      if (v === 3) { var fx = 1 + ri(203, 0, 6), fy = 1 + ri(203, 1, 6); g.set(fx, fy, 'white'); g.set(fx + 1, fy + 1 > 7 ? fy : fy + 1, 'fireY'); }
      def('t_grass_' + v, g, { group: 'ground' });
    }
    var FLOWER = ['red', 'fireY', 'white', 'pink', 'purple', 'fireO'];
    for (v = 0; v < 3; v++) {
      g = tile();
      speckle(g, 0, 'grassL', [['grass', 0.22], ['grassD', 0.05]], 220 + v);
      for (k = 0; k < 6; k++) {
        var px = ri(221 + v, k * 2, 8), py = ri(221 + v, k * 2 + 1, 8);
        var col = FLOWER[(k + v * 2) % FLOWER.length];
        g.set(px, py, col);
        if (k < 2 && py + 1 < 8) g.set(px, py + 1, 'grassD');
      }
      def('t_flowers_' + v, g, { group: 'ground' });
    }

    // ---------------- Hügel
    for (v = 0; v < 3; v++) {
      g = tile(2);
      speckle(g, 2, 'hill', [['hillD', 0.06], ['hillL', 0.06]], 300 + v);
      // Hügelbuckel: Licht von links oben
      var bumps = v === 1 ? [[2.5, 6.5, 2.6, 2.4], [6, 4.8, 2.2, 2]] : (v === 2 ? [[4, 6, 3.6, 3]] : [[3.5, 5.6, 3.2, 2.8], [6.7, 8.6, 1.6, 1.3]]);
      bumps.forEach(function (b) {
        g.ellipse(b[0], b[1], b[2], b[3], function (x, y, nx, ny) {
          var s = nx * 0.8 + ny;
          if (s < -0.55) return 'hillL';
          if (s > 0.55) return 'hillD';
          return 'hill';
        });
      });
      if (v !== 1) { g.set(5, 8, 'stone'); g.set(6, 8, 'stoneD'); }
      def('t_hill_' + v, g, { group: 'ground' });
    }

    // ---------------- Bäume
    // Laubbaum mit runder Krone (Licht links oben)
    function leafTree(g, cx, baseY, r, cols, seed) {
      var cy = baseY - 2 - r;
      g.rect(Math.round(cx) - 1, cy + r, 1, Math.max(2, baseY - (cy + r) + 1), 'woodD');
      g.rect(Math.round(cx), cy + r, 1, Math.max(2, baseY - (cy + r) + 1), 'wood');
      g.ellipse(cx, cy + 0.5, r, r * 0.95, function (x, y, nx, ny) {
        var s = nx + ny * 1.1 + (hash(x, y, seed) - 0.5) * 0.6;
        if (s < -0.9) return cols[0];
        if (s > 0.75) return cols[2];
        return cols[1];
      });
      // Kontur der Krone
      var tmp = new Grid(g.w, g.h);
      tmp.ellipse(cx, cy + 0.5, r, r * 0.95, 1);
      return tmp;
    }
    function contour(g, maskFn, col) {
      // dunkle Kante um eine Maske (Grid mit 1en), nur wo g frei oder Boden
      var out = [];
      for (var y = 0; y < g.h; y++) for (var x = 0; x < g.w; x++) {
        if (maskFn.get(x, y)) continue;
        if (maskFn.get(x + 1, y) || maskFn.get(x - 1, y) || maskFn.get(x, y + 1) || maskFn.get(x, y - 1)) out.push(x, y);
      }
      for (var i = 0; i < out.length; i += 2) g.set(out[i], out[i + 1], col);
    }
    // Objekt mit eigener Kontur auf Boden-Kachel legen
    function stamp(g, obj, x, y, edge) {
      var o = obj.clone().pad(1, 1, 1, 1).outline(edge || 'ink');
      g.blit(o, x - 1, y - 1);
    }

    function crown(w, h, cols, seed, shape) {
      var o = new Grid(w, h);
      o.ellipse(w / 2, h / 2, w / 2, h / 2, function (x, y, nx, ny) {
        var s = nx + ny * 1.1 + (hash(x, y, seed) - 0.5) * 0.7;
        if (s < -0.85) return cols[0];
        if (s > 0.7) return cols[2];
        return cols[1];
      });
      return o;
    }
    function trunk(h) { var o = new Grid(2, h); o.rect(0, 0, 1, h, 'woodD'); o.rect(1, 0, 1, h, 'wood'); return o; }
    function treeObj(w, h, th, cols, seed) {
      var o = new Grid(w, h + th - 1);
      o.blit(trunk(th), Math.floor(w / 2) - 1, h - 1);
      o.blit(crown(w, h, cols, seed), 0, 0);
      return o;
    }
    function pineObj(w, h, cols, snow) {
      var o = new Grid(w, h + 1);
      var cx = (w - 1) / 2;
      for (var y = 0; y < h; y++) {
        var tier = y % 3, half = Math.min(cx, (y * 0.42) + tier * 0.45);
        for (var x = 0; x < w; x++) {
          var dx = x - cx;
          if (Math.abs(dx) <= half + 0.01) {
            var c = dx < -0.3 ? cols[0] : (dx > 0.6 ? cols[2] : cols[1]);
            if (tier === 2 && Math.abs(dx) > half - 1) c = cols[2];
            if (snow && tier === 0 && dx < 0.6 && y > 0) c = dx < -0.3 ? 'white' : 'snowD';
            o.set(x, y, c);
          }
        }
      }
      o.set(Math.floor(cx), h, 'woodD'); o.set(Math.ceil(cx), h, 'woodD');
      return o;
    }
    var LEAF = ['leafL', 'leaf', 'leafD'];
    var JUNG = ['jungleL', 'jungle', 'jungleD'];
    var PINE = ['pineL', 'pine', 'pineD'];

    // Wald: dunkler Waldboden + Laubbäume
    for (v = 0; v < 3; v++) {
      g = tile(5);
      speckle(g, 5, 'grassD', [['leafD', 0.18], ['grass', 0.06]], 400 + v);
      if (v === 0) stamp(g, treeObj(6, 6, 4, LEAF, 401), 1, 1);
      if (v === 1) { stamp(g, treeObj(4, 4, 3, LEAF, 402), 0, 1); stamp(g, treeObj(5, 5, 3, LEAF, 403), 3, 3); }
      if (v === 2) { stamp(g, treeObj(5, 5, 3, LEAF, 404), 3, 0); stamp(g, pineObj(5, 7, PINE), 0, 3); }
      def('t_forest_' + v, g, { group: 'ground' });
    }
    // Dschungel: dicht, sattes Grün, Lianen, große Blätter
    for (v = 0; v < 3; v++) {
      g = tile(5);
      speckle(g, 5, 'jungleD', [['jungle', 0.2], ['leafDD', 0.12]], 420 + v);
      if (v === 0) { stamp(g, treeObj(6, 5, 4, JUNG, 421), 1, 0); }
      if (v === 1) { stamp(g, treeObj(4, 4, 3, JUNG, 422), 3, 0); stamp(g, treeObj(5, 4, 3, JUNG, 423), 0, 3); }
      if (v === 2) { // Palme
        var p = new Grid(7, 9);
        p.paint(0, 0, ['.ff.ff.', 'feffeef', 'e.EeE.e', '..Wv...', '...Wv..', '...Wv..', '...Wv..', '...Wv..', '...Wv..']);
        stamp(g, p, 1, 2);
      }
      // Lianen und Blattfächer
      g.set(1 + v * 2, 5 + 3, 'jungleL'); g.set(1 + v * 2, 5 + 4, 'jungleL');
      g.set(6 - v, 5 + 6, 'leafL'); g.set(5 - v, 5 + 7, 'jungleL');
      def('t_jungle_' + v, g, { group: 'ground' });
    }
    // Nadelwald: Tannen auf kühlem Boden
    for (v = 0; v < 3; v++) {
      g = tile(6);
      speckle(g, 6, 'pineD', [['tundraD', 0.16], ['pine', 0.12], ['snowD', v === 2 ? 0.08 : 0.0]], 440 + v);
      if (v === 0) stamp(g, pineObj(6, 10, PINE), 1, 1);
      if (v === 1) { stamp(g, pineObj(5, 7, PINE), 0, 2); stamp(g, pineObj(5, 8, PINE), 3, 4); }
      if (v === 2) stamp(g, pineObj(6, 10, PINE, true), 1, 1);
      def('t_taiga_' + v, g, { group: 'ground' });
    }
    // Pilzwald: violetter Moosboden + Riesenpilze
    function shroom(capW, capH, stem, cap, capD, dots) {
      var o = new Grid(capW, capH + stem);
      var sx = Math.floor(capW / 2) - 1;
      o.rect(sx, capH, 2, stem, 'cream'); o.rect(sx + 1, capH, 1, stem, 'sandD');
      o.ellipse(capW / 2, capH - 0.2, capW / 2, capH, function (x, y, nx, ny) { return ny > 0.0 ? capD : (nx + ny < -0.9 ? 'pink' : cap); });
      for (var y = capH; y < capH + 1; y++) o.hline(1, capH - 1, capW - 2, capD);
      if (dots) { o.set(Math.floor(capW / 2) - 1, 1, 'white'); o.set(capW - 2, Math.max(1, capH - 2), 'white'); o.set(1, capH - 2, 'white'); }
      return o;
    }
    for (v = 0; v < 3; v++) {
      g = tile(5);
      speckle(g, 5, 'mush', [['mushD', 0.16], ['mushL', 0.08]], 460 + v);
      if (v === 0) stamp(g, shroom(6, 4, 5, 'red', 'redD', true), 1, 1);
      if (v === 1) { stamp(g, shroom(4, 3, 3, 'purple', 'mushD', false), 0, 4); stamp(g, shroom(5, 3, 4, 'red', 'redD', true), 3, 2); }
      if (v === 2) { stamp(g, shroom(6, 3, 6, 'mushL', 'purple', true), 1, 0); g.set(1, 12, 'glass'); g.set(6, 11, 'crysL'); }
      def('t_mushroom_' + v, g, { group: 'ground' });
    }
    // Kristallfeld: kühler Steinboden + leuchtende Kristallsplitter
    function shard(w, h) {
      var o = new Grid(w, h);
      var cx = (w - 1) / 2;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var dx = x - cx, top = Math.abs(dx) * 1.6;
        if (y >= top) o.set(x, y, dx < 0 ? 'crysL' : (dx < 0.6 ? 'crys' : 'crysD'));
      }
      o.set(Math.floor(cx), Math.min(h - 1, 2), 'white');
      return o;
    }
    for (v = 0; v < 3; v++) {
      g = tile(5);
      speckle(g, 5, 'rockD', [['ashL', 0.14], ['crysD', 0.1], ['rock', 0.05]], 480 + v);
      if (v === 0) { stamp(g, shard(3, 9), 2, 2, 'plum'); stamp(g, shard(3, 5), 5, 7, 'plum'); }
      if (v === 1) { stamp(g, shard(3, 6), 0, 5, 'plum'); stamp(g, shard(3, 8), 3, 2, 'plum'); }
      if (v === 2) { stamp(g, shard(3, 4), 1, 8, 'plum'); stamp(g, shard(3, 7), 4, 4, 'plum'); g.set(1, 7, 'crys'); }
      def('t_crystal_' + v, g, { group: 'ground' });
    }

    // ---------------- Gebirge und Schneegipfel
    function peak(g, cx, top, base, halfBase, cols, capRows) {
      for (var y = top; y <= base; y++) {
        var t = (y - top) / (base - top + 0.001), half = Math.sqrt(t) * halfBase * (0.75 + 0.25 * t) + (hash(y, 3, cx * 10) < 0.3 ? 0.5 : 0);
        for (var x = 0; x < g.w; x++) {
          var dx = x + 0.5 - cx;
          if (Math.abs(dx) > half + 0.35) continue;
          var c = dx < -0.6 ? cols[0] : (dx > 0.6 ? cols[2] : cols[1]);
          if (dx > 0.6 && ((x + y) % 4 === 0)) c = cols[3] || cols[2];
          if (y - top < capRows + (hash(x, y, 7) < 0.4 ? 1 : 0)) c = dx > 0.6 ? 'snowD' : 'white';
          g.set(x, y, c);
        }
      }
    }
    var ROCK = ['rockL', 'rock', 'rockD', 'plum'];
    for (v = 0; v < 3; v++) {
      g = tile(7);
      speckle(g, 7, 'rock', [['rockD', 0.2], ['rockL', 0.06]], 500 + v);
      var m = new Grid(8, 15);
      if (v === 0) peak(m, 4, 2, 13, 4.4, ROCK, 2);
      if (v === 1) { peak(m, 2.5, 5, 13, 3, ROCK, 1); peak(m, 5.2, 2, 13, 3.6, ROCK, 2); }
      if (v === 2) { peak(m, 3.5, 3, 13, 4.2, ROCK, 1); peak(m, 6.5, 7, 13, 2.2, ROCK, 0); }
      // Kontur nur entlang der Silhouette (Gipfellinie)
      var mask = new Grid(8, 15); for (var i = 0; i < m.d.length; i++) mask.d[i] = m.d[i] ? 1 : 0;
      g.blit(m, 0, 0);
      for (var yy2 = 0; yy2 < 15; yy2++) for (var xx = 0; xx < 8; xx++) {
        if (mask.get(xx, yy2)) continue;
        if (mask.get(xx, yy2 + 1) || mask.get(xx + 1, yy2) || mask.get(xx - 1, yy2)) { if (yy2 < 13) g.set(xx, yy2, 'plum'); }
      }
      def('t_mountain_' + v, g, { group: 'ground' });

      g = tile(7);
      speckle(g, 7, 'snowD', [['white', 0.3], ['snowDD', 0.1]], 520 + v);
      m = new Grid(8, 15);
      var SN = ['white', 'snowD', 'snowDD', 'rockD'];
      if (v === 0) peak(m, 4, 1, 13, 4.4, SN, 0);
      if (v === 1) { peak(m, 2.5, 4, 13, 3, SN, 0); peak(m, 5.2, 1, 13, 3.6, SN, 0); }
      if (v === 2) { peak(m, 4.5, 2, 13, 4.2, SN, 0); }
      mask = new Grid(8, 15); for (i = 0; i < m.d.length; i++) mask.d[i] = m.d[i] ? 1 : 0;
      g.blit(m, 0, 0);
      for (yy2 = 0; yy2 < 15; yy2++) for (xx = 0; xx < 8; xx++) {
        if (mask.get(xx, yy2)) continue;
        if (mask.get(xx, yy2 + 1) || mask.get(xx + 1, yy2) || mask.get(xx - 1, yy2)) { if (yy2 < 13) g.set(xx, yy2, 'snowDD'); }
      }
      def('t_snow_' + v, g, { group: 'ground' });
    }

    // ---------------- Kalte und trübe Böden
    for (v = 0; v < 3; v++) {
      g = tile();
      speckle(g, 0, 'tundra', [['tundraD', 0.12], ['tundraL', 0.12], ['savD', 0.03]], 600 + v);
      if (v === 1) { g.set(2 + ri(601, 0, 4), 3 + ri(601, 1, 3), 'stone'); g.set(3 + ri(601, 0, 4), 3 + ri(601, 1, 3), 'stoneD'); }
      if (v === 2) { var sx2 = ri(602, 0, 4), sy2 = 1 + ri(602, 1, 4); g.hline(sx2, sy2, 3, 'white'); g.hline(sx2 + 1, sy2 + 1, 3, 'snowD'); }
      tuft(g, ri(603 + v, 0, 5), 4 + ri(603 + v, 1, 3), K('tundraD'), null);
      def('t_tundra_' + v, g, { group: 'ground' });

      g = tile();
      speckle(g, 0, 'white', [['snowD', 0.16], ['snowDD', 0.03]], 620 + v);
      if (v === 1) { var dx2 = ri(621, 0, 3); g.hline(dx2, 3, 4, 'snowD'); g.hline(dx2 + 1, 4, 4, 'snowDD'); }
      if (v === 2) { g.set(2, 2, 'snowDD'); g.set(4, 3, 'snowDD'); g.set(3, 5, 'snowDD'); g.set(5, 6, 'snowDD'); }
      def('t_snowfield_' + v, g, { group: 'ground' });

      // Sumpf: trüber Boden, dunkle Pfützen, Schilf
      g = tile(2);
      speckle(g, 2, 'swamp', [['swampD', 0.16], ['swampL', 0.08]], 640 + v);
      var pw = v === 1 ? [[2, 4.5, 2.4, 1.4], [6, 7.5, 1.8, 1]] : [[4 + v, 5.5, 2.6, 1.6]];
      pw.forEach(function (q) { g.ellipse(q[0], q[1] + 2 - 2, q[2], q[3], function (x, y, nx, ny) { return ny < -0.4 ? 'swampD' : 'murk'; }); });
      for (k = 0; k < 2; k++) {
        var rx = ri(650 + v, k, 7), ry = 5 + ri(651 + v, k, 4);
        g.set(rx, ry, 'leafD'); g.set(rx, ry - 1, 'leafD'); g.set(rx, ry - 2, 'woodD');
        if (k === 0) { g.set(rx + 1, ry, 'swampL'); g.set(rx + 1, ry - 1, 'leafD'); }
      }
      def('t_swamp_' + v, g, { group: 'ground' });
    }

    // ---------------- Asche, Lava, Brand, Krater
    for (v = 0; v < 3; v++) {
      g = tile();
      speckle(g, 0, 'ash', [['ashD', 0.16], ['ashL', 0.10]], 700 + v);
      if (v === 1) { g.set(ri(701, 0, 8), ri(701, 1, 8), 'fireO'); }
      if (v === 2) { g.paint(2, 3, ['.WW.', 'WOOW', '.OO.']); }
      def('t_ash_' + v, g, { group: 'ground' });

      // Lava: leuchtend, mit dunkler Kruste
      g = tile();
      speckle(g, 0, 'fireO', [['fireY', 0.18], ['red', 0.06]], 720 + v);
      for (k = 0; k < 2; k++) {
        var cx2 = 1 + ri(721 + v, k, 6), cy2 = 1 + ri(722 + v, k, 6);
        g.ellipse(cx2 + 0.5 + k, cy2 + 0.3, 2.3 - k * 0.6, 1.4, function (x, y, nx, ny) { return (ny < -0.3 && nx < 0.4) ? 'ashD' : 'lavaD'; });
      }
      g.set(ri(723 + v, 0, 8), ri(723 + v, 1, 8), 'goldL');
      def('t_lava_' + v, g, { group: 'ground' });
    }
    g = tile();
    speckle(g, 0, 'ashD', [['ash', 0.2], ['woodD', 0.12], ['plum', 0.1]], 760);
    g.set(2, 5, 'fireO'); g.set(6, 2, 'red'); g.set(4, 7, 'fireO');
    def('t_scorched', g, { group: 'ground' });
    g = tile();
    speckle(g, 0, 'soil', [['woodD', 0.12], ['sandD', 0.06]], 770);
    g.ellipse(4, 4, 3.6, 3.2, function (x, y, nx, ny) { var s = nx + ny; return s < -0.7 ? 'woodD' : (s > 0.8 ? 'sandD' : 'plum'); });
    g.ellipse(4.4, 4.4, 2.2, 1.8, function (x, y, nx, ny) { return nx + ny > 0.6 ? 'woodD' : 'ink'; });
    def('t_crater', g, { group: 'ground' });

    // ---------------- Uferschaum-Überlagerung (zusätzlich): auf Wasserkacheln, Bit = Land-Nachbar N/O/S/W
    for (var mm = 0; mm < 16; mm++) {
      g = tile();
      for (i = 0; i < 8; i++) {
        var on = hash(i, mm, 900) < 0.8;
        if (mm & 1) { if (on) g.set(i, 0, 'foam'); if (i % 3 !== 1) g.set(i, 1, 'shallowL'); }
        if (mm & 4) { if (on) g.set(i, 7, 'foam'); if (i % 3 !== 1) g.set(i, 6, 'shallowL'); }
        if (mm & 2) { if (on) g.set(7, i, 'foam'); if (i % 3 !== 1) g.set(6, i, 'shallowL'); }
        if (mm & 8) { if (on) g.set(0, i, 'foam'); if (i % 3 !== 1) g.set(1, i, 'shallowL'); }
      }
      def('t_foam_' + mm, g, { group: 'ground' });
    }
  });

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
