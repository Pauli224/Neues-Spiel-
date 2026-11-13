// Wuselwelt – Pixelkunst: Bauwerke (Zentren, Häuser, Betriebe, Denkmäler, Mauern, Tore, Türme).
// Gebäude haben eine dunkle Kontur und ragen nach oben über ihre Grundfläche hinaus.
(function (WW) { 'use strict';

  (WW._spriteBuilders = WW._spriteBuilders || []).push(function (L) {
    var Grid = L.Grid, C = L.C, def = L.def, hash = L.hash;
    var GOVS = ['tribe', 'monarchy', 'democracy', 'fascism', 'communism', 'theocracy', 'republic', 'anarchy'];

    // ======================================================================
    // Mauern als kleine Voxel-Modelle: Bodenbelegung je Kachel-Pixel + Höhe,
    // senkrecht nach oben extrudiert (Draufsicht von schräg vorn).
    // Nachbararme werden über die Kachel hinaus mitmodelliert, damit die Kontur
    // an verbundenen Enden offen bleibt; gezeichnet wird nur, was zur eigenen Kachel gehört.
    var M = 3; // Rand der Modellierung

    // cells: Funktion (gx, gy) -> null | { h, base?, top, face(gx, row, gy, h) }
    function extrude(cellFn, Htot, own) {
      var W = 8 + 2 * M, Hh = Htot + 8 + 2 * M; // Modellraum: x in [-M, 8+M), Zeile wy in [-Htot-M, 8+M)
      var model = new Grid(W, Hh), ownG = new Grid(W, Hh);
      var oyOff = Htot + M;
      for (var gy = -M; gy < 8 + M; gy++) {
        for (var gx = -M; gx < 8 + M; gx++) {
          var c = cellFn(gx, gy);
          if (!c) continue;
          var isOwn = gx >= 0 && gx < 8 && gy >= 0 && gy < 8 && (!own || own(gx, gy));
          var topRow = gy - c.h, bot = gy - (c.base || 0);
          for (var wy = topRow; wy <= bot; wy++) {
            var col = wy === topRow ? c.top(gx, gy) : c.face(gx, wy - topRow - 1, gy, c.h);
            if (col == null) continue;
            var X = gx + M, Y = wy + oyOff;
            if (Y < 0 || Y >= Hh) continue;
            model.set(X, Y, col);
            if (isOwn) ownG.set(X, Y, col);
          }
        }
      }
      // Kontur: freie Modellpixel neben eigenen Pixeln
      var out = new Grid(8, Htot + 8);
      for (var Y = 0; Y < Hh; Y++) for (var X = 0; X < W; X++) {
        var ox = X - M, oy = Y - oyOff + Htot;
        if (ox < 0 || ox >= 8 || oy < 0 || oy >= Htot + 8) continue;
        var v = ownG.get(X, Y);
        if (v) { out.set(ox, oy, v); continue; }
        if (model.get(X, Y)) continue;
        if (ownG.get(X + 1, Y) || ownG.get(X - 1, Y) || ownG.get(X, Y + 1) || ownG.get(X, Y - 1)) out.set(ox, oy, 'ink');
      }
      return out;
    }

    // Mauerstufen: Dicke (Bodenpixel a..b), Höhe, Farben
    var WALL = {
      1: { a: 3, b: 4, h: 5 },
      2: { a: 2, b: 5, h: 6 },
      3: { a: 1, b: 6, h: 8 }
    };
    function occ(mask, a, b, gx, gy) {
      var inX = gx >= a && gx <= b, inY = gy >= a && gy <= b;
      if (inX && inY) return true;
      if (inX && gy < a && (mask & 1)) return true;
      if (inX && gy > b && (mask & 4)) return true;
      if (inY && gx > b && (mask & 2)) return true;
      if (inY && gx < a && (mask & 8)) return true;
      return false;
    }
    function rim(mask, a, b, gx, gy) {
      return !occ(mask, a, b, gx + 1, gy) || !occ(mask, a, b, gx - 1, gy) || !occ(mask, a, b, gx, gy + 1) || !occ(mask, a, b, gx, gy - 1);
    }
    // Zellen-Generator je Stufe
    function wallCells(level, mask) {
      var P = WALL[level], a = P.a, b = P.b;
      return function (gx, gy) {
        if (!occ(mask, a, b, gx, gy)) return null;
        var gxm = ((gx % 8) + 8) % 8, gym = ((gy % 8) + 8) % 8;
        var h = P.h, edge = rim(mask, a, b, gx, gy);
        if (level === 1) {
          // Palisade: Pfähle mit Spitzen, Querbalken
          var stake = ((gx + gy) & 1) === 0;
          if (stake) h += 1;
          return {
            h: h,
            top: function () { return stake ? 'woodL' : 'wood'; },
            face: function (x, row, y, hh) {
              if (row === 2 && hh > 4) return 'woodD';
              if (row >= hh - 1) return 'woodD';
              return ((x + y) & 1) === 0 ? 'wood' : 'woodD';
            }
          };
        }
        if (level === 2) {
          var merlon = edge && (((gxm >> 1) + (gym >> 1)) & 1) === 0;
          if (merlon) h += 1;
          return {
            h: h,
            top: function (x, y) { return edge ? 'stoneL' : 'stone'; },
            face: function (x, row, y, hh) {
              if (row >= hh - 1) return 'stoneD';
              var br = (row + (merlon ? 0 : 1));
              if (br % 3 === 0) return 'stoneD';
              var off = (Math.floor(br / 3) & 1) ? 2 : 0;
              if (((x + off) & 3) === 0) return 'stoneD';
              return x === 0 || (x === a && !(mask & 8)) ? 'stoneL' : 'stone';
            }
          };
        }
        // Stufe 3: Festungsmauer – mächtiger, dunkler, mit Sockel und großen Zinnen
        var m3 = edge && (((gxm >> 1) + (gym >> 1)) & 1) === 0;
        if (m3) h += 2;
        var walk = !edge;
        return {
          h: h,
          top: function () { return walk ? 'stoneD' : 'stone'; },
          face: function (x, row, y, hh) {
            if (row >= hh - 2) return 'plum';
            if (row >= hh - 3) return 'stoneD';
            var br = row + (m3 ? 0 : 2);
            if (br % 3 === 2) return 'plum';
            var off = (Math.floor(br / 3) & 1) ? 2 : 0;
            if (((x + off) & 3) === 0) return 'plum';
            return 'stoneD';
          }
        };
      };
    }
    function wallSprite(level, mask) {
      var P = WALL[level];
      return extrude(wallCells(level, mask), P.h + (level === 3 ? 2 : 1));
    }
    for (var lv = 1; lv <= 3; lv++) for (var mk = 0; mk < 16; mk++) def('s_wall_' + lv + '_' + mk, wallSprite(lv, mk), { group: 'wall' });

    // Wassertor (Mauer über Fluss): Bogen mit Gitter, Wasser fließt drunter durch.
    // _h: Mauer verläuft waagrecht (Arme O+W), _v: senkrecht (Arme N+S).
    function waterWall(level, vert) {
      var mask = vert ? 5 : 10, base = wallCells(level, mask), P = WALL[level];
      var g = extrude(function (gx, gy) {
        var c = base(gx, gy);
        if (!c) return null;
        var inTile = gx >= 0 && gx < 8 && gy >= 0 && gy < 8;
        if (!inTile) return c;
        if (!vert) {
          // Bogenöffnung in der Front
          var face0 = c.face;
          return { h: c.h, base: c.base, top: c.top, face: function (x, row, y, hh) {
            var fromBottom = hh - row; // 1 = unterste Zeile
            var arch = x >= 2 && x <= 5 && fromBottom <= (x === 2 || x === 5 ? 2 : 3);
            if (y === P.b && arch) return (x === 3 && fromBottom === 3) || (x === 4 && fromBottom === 3) ? 'ink' : (fromBottom === 1 ? 'river' : (x & 1 ? 'metalD' : 'ink'));
            return face0(x, row, y, hh);
          } };
        }
        // senkrecht: mittlerer Teil als Brücke über dem Wasser angehoben
        if (gy >= 2 && gy <= 5) return { h: c.h, base: 2, top: c.top, face: c.face };
        return c;
      }, P.h + (level === 3 ? 2 : 1));
      if (vert) {
        // Gitterstäbe unter der Brücke (Südkante)
        var bot = g.h - 1;
        for (var x = P.a; x <= P.b; x++) { if ((x & 1) === 0) { g.set(x, bot - 4, 'metalD'); g.set(x, bot - 3, 'metalD'); } }
      }
      return g;
    }
    for (lv = 1; lv <= 3; lv++) {
      def('s_wall_' + lv + '_water_h', waterWall(lv, false), { group: 'wall' });
      def('s_wall_' + lv + '_water_v', waterWall(lv, true), { group: 'wall' });
    }

    // Tore: _h = Mauer verläuft waagrecht (Durchgang Nord-Süd), _v = senkrecht (Durchgang West-Ost)
    function gateSprite(level, vert) {
      var P = WALL[level], mask = vert ? 5 : 10, base = wallCells(level, mask);
      var gh = P.h + 3;
      var Htot = gh + 3;
      var g;
      if (!vert) {
        g = extrude(function (gx, gy) {
          var inTile = gx >= 0 && gx < 8;
          if (inTile && gx >= 1 && gx <= 6 && gy >= P.a - (level === 3 ? 0 : 1) && gy <= P.b + (level === 1 ? 1 : 0)) {
            var tower = gx === 1 || gx === 6;
            var hh = gh + (tower ? 2 : 0);
            var front = P.b + (level === 1 ? 1 : 0);
            return {
              h: hh,
              top: function () { return level === 1 ? (tower ? 'woodL' : 'wood') : (tower ? 'stoneL' : 'stone'); },
              face: function (x, row, y, h2) {
                var fb = h2 - row; // 1 = unten
                if (y === front && x >= 2 && x <= 5 && fb <= 5 - (x === 2 || x === 5 ? 1 : 0)) {
                  // Torbogen mit Holztor
                  if (fb === 5 || (fb === 4 && (x === 2 || x === 5))) return 'ink';
                  return (x === 3 ? 'woodD' : (x === 4 ? 'wood' : 'woodD'));
                }
                if (y === front && x >= 2 && x <= 5 && fb === h2 - 1) return 'T';
                if (y === front && x >= 3 && x <= 4 && fb >= 6 && fb < h2 - 1) return 'Td';
                if (level === 1) return row === 1 ? 'woodD' : (((x + y) & 1) ? 'wood' : 'woodD');
                if (row >= h2 - 1) return level === 3 ? 'plum' : 'stoneD';
                if ((row + 1) % 3 === 0 || ((x + (Math.floor(row / 3) & 1) * 2) & 3) === 0) return level === 3 ? 'plum' : 'stoneD';
                return level === 3 ? 'stoneD' : (x === 1 ? 'stoneL' : 'stone');
              }
            };
          }
          return base(gx, gy);
        }, Htot);
      } else {
        // Senkrechte Mauer: Torhaus mit Satteldach in Teamfarbe (Durchgang West-Ost liegt darunter)
        g = extrude(function (gx, gy) {
          if (gy < 0 || gy > 7) return base(gx, gy);
          var a2 = Math.max(1, P.a - 1), b2 = Math.min(6, P.b + 1);
          if (gy >= 1 && gy <= 6 && gx >= a2 && gx <= b2) {
            var mid = (a2 + b2) / 2;
            return {
              h: gh,
              top: function (x) { return x < mid - 0.5 ? (x === a2 ? 'Tl' : 'T') : (x < mid + 0.5 ? 'T' : 'Td'); },
              face: function (x, row, y, h2) {
                if (row === 0) return x < mid ? 'T' : 'Td';
                if (row === 1) return 'Td';
                var fb = h2 - row;
                if (x >= 3 && x <= 4 && fb <= 3) return fb === 3 ? 'ink' : 'woodD';
                if (level === 1) return ((x + y) & 1) ? 'wood' : 'woodD';
                if (row >= h2 - 1) return level === 3 ? 'plum' : 'stoneD';
                if ((row + 1) % 3 === 0) return level === 3 ? 'plum' : 'stoneD';
                return level === 3 ? 'stoneD' : (x === a2 ? 'stoneL' : 'stone');
              }
            };
          }
          return base(gx, gy);
        }, Htot);
      }
      return g;
    }
    for (lv = 1; lv <= 3; lv++) {
      def('s_gate_' + lv + '_h', gateSprite(lv, false), { group: 'wall' });
      def('s_gate_' + lv + '_v', gateSprite(lv, true), { group: 'wall' });
    }

    // Türme: füllen die Kachel fast ganz, Mauern stoßen von allen Seiten an.
    function towerSprite(level) {
      var H = level === 2 ? 10 : 12;
      var extra = level === 2 ? 9 : 7;
      var d = level === 3;
      var g = extrude(function (gx, gy) {
        if (gx < 1 || gx > 6 || gy < 1 || gy > 6) return null;
        var edge = gx === 1 || gx === 6 || gy === 1 || gy === 6;
        var merlon = edge && ((gx + gy) & 1) === 0;
        var hh = H + (merlon ? (d ? 2 : 1) : 0);
        return {
          h: hh,
          top: function () { return d ? (edge ? 'stone' : 'stoneD') : (edge ? 'stoneL' : 'stone'); },
          face: function (x, row, y, h2) {
            var fb = h2 - row;
            if (fb <= 1) return d ? 'plum' : 'stoneD';
            if (y === 6 && (x === 3 || x === 4) && fb >= 5 && fb <= 6) return 'ink'; // Schießscharte
            if (d && y === 6 && (x === 2 || x === 5) && row >= 3 && row <= 6) return row === 6 ? 'Td' : 'T'; // Wimpel
            if ((row + 1) % 3 === 0 || ((x + (Math.floor(row / 3) & 1) * 2) & 3) === 0) return d ? 'plum' : 'stoneD';
            if (x === 1) return d ? 'stone' : 'stoneL';
            return d ? 'stoneD' : 'stone';
          }
        };
      }, H + extra);
      var top = g.h - 8 - H; // Zeile der Turmkrone (vorn)
      var out = new Grid(10, g.h); out.blit(g, 1, 0);
      if (level === 2) {
        // spitzes Kegeldach in Teamfarbe, breiter als der Turm
        var r = new Grid(10, 10);
        for (var y = 0; y < 8; y++) {
          var half = 0.6 + y * 0.6;
          for (var x = 0; x < 10; x++) {
            var dx = x + 0.5 - 5;
            if (Math.abs(dx) <= half) r.set(x, y + 1, dx < -1 ? 'Tl' : (dx < 1 ? 'T' : 'Td'));
          }
        }
        r.hline(0, 9, 10, 'Td');
        for (x = 1; x < 9; x += 2) r.set(x, 9, 'T');
        r = r.pad(0, 1, 0, 1).outline();
        out.blit(r, 0, top - 7);
        out.vline(5, top - 9, 3, 'woodD'); out.paint(6, top - 9, ['TT', 'Tt']);
      } else {
        out.vline(5, top - 6, 6, 'woodD');
        out.paint(6, top - 6, ['TTu', 'TTt', 'tt.']);
        out.set(4, top - 6, 'ink'); out.set(6, top - 7, 'ink'); out.set(7, top - 7, 'ink'); out.set(8, top - 7, 'ink');
        out.set(9, top - 6, 'ink'); out.set(9, top - 5, 'ink'); out.set(8, top - 4, 'ink');
        out.set(6, top - 3, 'ink'); out.set(7, top - 4, 'ink'); out.set(4, top - 5, 'ink');
      }
      return out;
    }
    def('s_tower_2', towerSprite(2), { group: 'wall' });
    def('s_tower_3', towerSprite(3), { group: 'wall' });

    // Barrikaden (Anarchie): niedriges Gerümpel mit Lücken entlang der Maskenarme
    function barricade(mask) {
      var g = new Grid(8, 13);
      var oy = 5; // Bodenzeile 0 = Zeile 5
      function crate(x, y) { g.paint(x, y, ['ovvo', 'vwWv', 'vWwv', 'oWWo']); }
      function barrel(x, y) { g.paint(x, y, ['.oo.', 'owWo', 'oMMo', 'owWo', '.oo.']); }
      function plank(x, y, len) { for (var i = 0; i < len; i++) { g.set(x + i, y - (i >> 1), 'woodL'); g.set(x + i, y - (i >> 1) + 1, 'woodD'); } }
      function wheel(x, y) { g.paint(x, y, ['.oo.', 'oWWo', 'oWvo', '.oo.']); }
      var items = [crate, barrel, wheel];
      var k = 0;
      function place(px, py) {
        var r = hash(px, py, mask + 17);
        items[Math.floor(r * 3)](px, py);
        k++;
      }
      // Mitte
      place(2, oy + 2);
      if (mask & 1) { plank(3, oy + 1, 3); g.set(5, oy - 2, 'red'); }
      if (mask & 8) place(-1, oy + 2);
      if (mask & 2) { plank(5, oy + 4, 3); g.paint(6, oy + 2, ['oo', 'Rr', 'rr']); }
      if (mask & 4) { place(3, oy + 4); }
      // bunter Lappen
      g.set(3, oy + 1, 'purple'); g.set(4, oy + 1, 'fireY');
      return g;
    }
    for (mk = 0; mk < 16; mk++) def('s_barricade_' + mk, barricade(mk), { group: 'wall' });

    // ======================================================================
    // Zeichenhelfer für Gebäude (Licht links oben, rechte Kante im Schatten)
    function box(g, x, y, w, h, M, D, Lc) {
      g.rect(x, y, w, h, M);
      if (Lc) g.vline(x, y, h, Lc);
      if (D) g.vline(x + w - 1, y, h, D);
      return g;
    }
    // Satteldach mit First quer (Südseite zum Betrachter)
    function roofRidge(g, x, y, w, h, cols) {
      g.rect(x, y, w, h, cols[1]);
      g.hline(x, y, w, cols[0]);
      for (var j = 1; j < h - 1; j++) for (var i = 0; i < w; i++) if (((i + (j & 1) * 2) & 3) === 0 && j % 2 === 0) g.set(x + i, y + j, cols[2]);
      g.hline(x, y + h - 1, w, cols[2]);
      g.set(x + w - 1, y + 1, cols[2]);
      return g;
    }
    // Giebeldach zum Betrachter (Dreieck); linke Hälfte hell, rechte dunkel
    function roofGable(g, x, y, w, h, cols) {
      var cx = x + w / 2;
      for (var j = 0; j < h; j++) {
        var half = (j + 1) / h * (w / 2) + 0.01;
        for (var i = 0; i < w; i++) {
          var px = x + i + 0.5;
          if (Math.abs(px - cx) <= half) g.set(x + i, y + j, px < cx - 0.5 ? (Math.abs(px - cx) > half - 1 ? cols[0] : cols[1]) : (px < cx + 0.5 ? cols[1] : cols[2]));
        }
      }
      g.hline(x, y + h - 1, w, cols[2]);
      return g;
    }
    function win(g, x, y, tall) { g.set(x, y, 'glass'); g.set(x, y + 1, tall ? 'glass' : 'plum'); if (tall) g.set(x, y + 2, 'plum'); }
    var TEAMROOF = ['Tl', 'T', 'Td'];
    var THATCH = ['strawL', 'straw', 'strawD'];
    function finish(g) { return g.outline(); }

    // ---------------------------------------------------------------- Häuser
    // 10 px breit (Dachtraufe steht 1 px über die Kachel), Grundfläche 8 px.
    function art(w, h, rows, y0) { var gg = new Grid(w, h); gg.paint(0, y0 || 0, rows); return gg.outline(); }
    var g;
    def('s_house_1_a', art(10, 13, [
      '..........',
      '..........',
      '....zY....',
      '...zyyY...',
      '...zyYY...',
      '..zzyyYY..',
      '..zyyYyY..',
      '.zzyyyyYY.',
      '.zyYyyyYY.',
      '.YYYYYYYY.',
      '..ccTTcA..',
      '..ccTtcA..',
      '..........']), { group: 'build' });
    def('s_house_1_b', art(10, 13, [
      '..........',
      '..........',
      '..W....W..',
      '...W..W...',
      '..zzzzzz..',
      '.zyyyyyyY.',
      '.yyYyyYyY.',
      '.yyyyyyyY.',
      '.YYYYYYYY.',
      '..vwvwvW..',
      '..vOvTTW..',
      '..vwvTtW..',
      '..........']), { group: 'build' });
    def('s_house_2_a', art(10, 13, [
      '..........',
      '......qG..',
      '......gG..',
      '.uuuuuuuu.',
      '.TTtTTTtT.',
      '.TTTTtTTt.',
      '.tTTTTTTt.',
      '.tttttttt.',
      '..WccccW..',
      '..WbcwwW..',
      '..WWWwwW..',
      '..WccwvW..',
      '..........']), { group: 'build' });
    def('s_house_2_b', art(10, 13, [
      '..........',
      '....uT....',
      '...uTTt...',
      '...uTTt...',
      '..uTbbTt..',
      '..uTWWTt..',
      '.uTTTTTtt.',
      '.tttttttt.',
      '..WccccW..',
      '..WbcwwW..',
      '..WWWwwW..',
      '..WccwvW..',
      '..........']), { group: 'build' });
    def('s_house_3_a', art(10, 15, [
      '......qG..',
      '....uTgG..',
      '...uTTTt..',
      '...uTbTt..',
      '..uTTWTTt.',
      '.uTTTTTTt.',
      '.tttttttt.',
      '..qggggG..',
      '..qbgbgG..',
      '..qOgOgG..',
      '..qGGGGG..',
      '..qbgwwG..',
      '..qOgwwG..',
      '..qggwvG..',
      '..........']), { group: 'build' });
    def('s_house_3_b', art(10, 15, [
      '..uT......',
      '..uT......',
      '.uTTt.....',
      '.uTTt.....',
      '.tttt.....',
      '.qggG.....',
      '.qbgG.....',
      '.qOgGuuuu.',
      '.qggGTTTt.',
      '.qggGTTTt.',
      '.qbgGtttt.',
      '.qOgGqbgG.',
      '.qggGqwwG.',
      '.qggGqwvG.',
      '..........']), { group: 'build' });
    // Fachwerk-Rest-Helfer (für Zentren)
    function fachwerk(g, x, y, w, h) {
      box(g, x, y, w, h, 'cream', 'sandD', null);
      g.vline(x, y, h, 'woodD'); g.vline(x + w - 1, y, h, 'woodD');
      g.hline(x, y + Math.floor(h / 2), w, 'woodD');
    }

    // ---------------------------------------------------------------- Regierungszentren (2×2 Kacheln)
    // 18 px breit (1 px Traufe je Seite), 26 px hoch: Grundfläche 16×16, Überhang 10 px.
    function cone(g, x, y, w, h, cols) {
      var cx = x + w / 2;
      for (var j = 0; j < h; j++) {
        var half = 0.5 + (j / Math.max(1, h - 1)) * (w / 2 - 0.5);
        for (var i = 0; i < w; i++) {
          var px = x + i + 0.5, dx = px - cx;
          if (Math.abs(dx) <= half + 0.01) g.set(x + i, y + j, dx < -0.6 ? cols[0] : (dx < 0.6 ? cols[1] : cols[2]));
        }
      }
    }
    function bricks(g, x, y, w, h, cols, phase) {
      // cols: [hell, mittel, dunkel, fuge]
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var row = j + (phase || 0), c = cols[1];
        if (row % 3 === 2) c = cols[3];
        else if (((i + (Math.floor(row / 3) & 1) * 2) & 3) === 3) c = cols[3];
        if (i === 0 && c !== cols[3]) c = cols[0];
        if (i === w - 1) c = cols[2];
        g.set(x + i, y + j, c);
      }
    }
    function crenel(g, x, y, w, col, top) {
      for (var i = 0; i < w; i++) { if ((i & 1) === 0) g.set(x + i, y, top || col); g.set(x + i, y + 1, col); }
    }
    function flag(g, x, y) { g.vline(x, y, 6, 'woodD'); g.paint(x + 1, y, ['TTu', 'TTT', 'tt.']); }
    var STONE = ['stoneL', 'stone', 'stoneD', 'stoneD'];
    var DSTONE = ['stone', 'stoneD', 'plum', 'plum'];
    var CONC = ['white', 'stoneL', 'stone', 'stone'];
    function center(fn) { var cg = new Grid(18, 26); fn(cg); return cg.outline(); }
    var CENTER = {};

    // Stammesrat: Langhaus mit gekreuzten Giebelstangen, Lagerfeuer, Stammesbanner
    CENTER.tribe = center(function (g) {
      g.vline(2, 3, 16, 'woodD'); g.paint(3, 3, ['TTTu', 'TTTT', 'tTTt', '.tt.']);
      g.set(2, 2, 'cream'); g.set(1, 2, 'cream'); g.set(3, 2, 'cream'); g.set(1, 1, 'cream'); g.set(3, 1, 'cream');
      // Dach
      var rows = [[8, 7, 15], [9, 6, 16], [10, 5, 16]];
      for (var y = 8; y <= 19; y++) {
        var x0 = y === 8 ? 7 : (y === 9 ? 6 : 5), x1 = y === 8 ? 15 : 16;
        for (var x = x0; x <= x1; x++) {
          var c = y === 8 ? 'strawL' : (y === 19 ? 'strawD' : ((x - y * 0) % 3 === 0 ? 'strawD' : (x <= x0 + 1 ? 'strawL' : 'straw')));
          if (y > 8 && y < 19 && x === x1) c = 'strawD';
          g.set(x, y, c);
        }
      }
      g.set(6, 6, 'woodD'); g.set(7, 7, 'woodD'); g.set(8, 6, 'woodD');
      g.set(14, 6, 'woodD'); g.set(15, 7, 'woodD'); g.set(16, 6, 'woodD');
      g.set(7, 6, 'cream'); g.set(15, 6, 'cream');
      // Wand aus Bohlen
      for (y = 20; y <= 23; y++) for (x = 6; x <= 15; x++) g.set(x, y, x === 15 ? 'woodD' : ((x & 1) ? 'wood' : 'woodL'));
      g.rect(10, 20, 2, 4, 'plum'); g.hline(10, 20, 2, 'T'); g.set(11, 21, 'Td');
      g.vline(7, 21, 2, 'plum'); g.vline(14, 21, 2, 'plum');
      // Schädel-freie Hörner-Zier am Giebel: zwei helle Bögen
      g.set(11, 7, 'cream'); g.set(12, 7, 'cream'); g.set(10, 6, 'cream'); g.set(13, 6, 'cream');
      // Lagerfeuer
      g.paint(1, 18, [
        '..j..',
        '.jF..',
        '.FQF.',
        'QFjFQ',
        'gWQWg',
        '.gWg.']);
    });

    // Monarchie: Burg mit zwei Kegeldach-Türmen, Bergfried mit Fahne, Tor
    CENTER.monarchy = center(function (g) {
      bricks(g, 6, 10, 6, 14, STONE, 1);
      crenel(g, 6, 8, 6, 'stone', 'stoneL');
      flag(g, 8, 2);
      bricks(g, 1, 8, 5, 16, STONE, 0);
      bricks(g, 12, 8, 5, 16, STONE, 0);
      cone(g, 1, 1, 5, 7, TEAMROOF); g.hline(1, 7, 5, 'Td');
      cone(g, 12, 1, 5, 7, TEAMROOF); g.hline(12, 7, 5, 'Td');
      g.set(3, 0, 'gold'); g.set(14, 0, 'gold');
      // Fenster
      g.vline(3, 10, 2, 'ink'); g.vline(14, 10, 2, 'ink'); g.vline(3, 15, 2, 'ink'); g.vline(14, 15, 2, 'ink');
      g.set(8, 12, 'ink'); g.set(9, 12, 'ink');
      // Banner am Bergfried
      g.vline(6, 11, 4, 'T'); g.vline(11, 11, 4, 'T'); g.set(6, 15, 'Td'); g.set(11, 15, 'Td');
      // Tor
      g.paint(7, 17, ['.oo.', 'oWWo', 'WMMW', 'WwMW', 'WMwW', 'WwMW', 'WMwW']);
    });

    // Demokratie: Rathaus mit Säulen, Dreiecksgiebel, Uhrtürmchen mit Kuppel
    CENTER.democracy = center(function (g) {
      // Kuppel und Uhr
      g.ellipse(9, 3.5, 2.5, 2.5, function (x, y, nx, ny) { return nx + ny < -0.5 ? 'goldL' : (nx > 0.3 ? 'goldD' : 'gold'); });
      g.rect(6, 4, 6, 1, 'goldD');
      g.set(9, 0, 'goldD'); g.set(8, 0, 'gold');
      box(g, 7, 5, 4, 4, 'white', 'stone', null);
      g.paint(7, 5, ['.ll.', 'lolo', 'lool', '.ll.']);
      // Giebel
      for (var j = 0; j < 5; j++) {
        var half = 2 + j * 1.6;
        for (var x = 1; x <= 16; x++) {
          var dx = x + 0.5 - 9;
          if (Math.abs(dx) <= half) g.set(x, 8 + j, Math.abs(dx) > half - 1.2 ? (dx < 0 ? 'white' : 'stoneL') : (j >= 1 && j <= 3 && Math.abs(dx) < half - 1.5 ? 'T' : 'stoneL'));
        }
      }
      g.hline(1, 13, 16, 'white'); g.hline(1, 14, 16, 'stone');
      // Säulengang
      g.rect(2, 15, 14, 6, 'plum');
      [2, 5, 8, 11, 14].forEach(function (cx) {
        for (var y = 15; y <= 20; y++) { g.set(cx, y, 'white'); g.set(cx + 1, y, 'stoneL'); }
      });
      g.rect(8, 17, 2, 4, 'woodD'); g.set(8, 17, 'wood');
      g.paint(4, 16, ['T']); g.paint(13, 16, ['T']);
      // Treppe
      g.hline(1, 21, 16, 'stoneL'); g.hline(1, 22, 16, 'stone'); g.hline(2, 23, 14, 'stoneL');
    });

    // Faschismus: wuchtiger Block, schmaler Mittelturm mit Scheinwerfer, schlichte lange Banner
    CENTER.fascism = center(function (g) {
      // Mittelturm
      g.rect(7, 2, 4, 9, 'stoneD'); g.vline(7, 2, 9, 'stone'); g.vline(10, 2, 9, 'plum');
      g.rect(6, 1, 6, 1, 'stone'); g.hline(6, 1, 6, 'stoneL');
      g.set(8, 0, 'fireY'); g.set(9, 0, 'goldL');
      g.vline(8, 4, 5, 'ink'); g.vline(9, 4, 5, 'ink');
      // Hauptblock
      g.rect(1, 10, 16, 2, 'stone'); g.hline(1, 10, 16, 'stoneL');
      g.rect(1, 12, 16, 12, 'dusk'); g.vline(1, 12, 12, 'stoneD'); g.vline(16, 12, 12, 'plum');
      for (var x = 3; x <= 14; x += 2) { if (x === 5 || x === 7 || x === 9 || x === 11 || x === 3 || x === 13) { g.vline(x, 13, 2, 'ink'); g.vline(x, 17, 2, 'ink'); } }
      // lange schlichte Banner
      g.rect(2, 12, 2, 8, 'T'); g.vline(3, 12, 8, 'Td'); g.set(2, 20, 'Td');
      g.rect(14, 12, 2, 8, 'T'); g.vline(15, 12, 8, 'Td'); g.set(14, 20, 'Td');
      // Tor und Stufen
      g.rect(7, 19, 4, 4, 'ink'); g.vline(8, 19, 4, 'metalD'); g.vline(9, 19, 4, 'metalD');
      g.hline(5, 23, 8, 'stoneD'); g.hline(1, 23, 4, 'plum'); g.hline(13, 23, 4, 'plum');
      g.hline(6, 22, 1, 'stone'); g.hline(11, 22, 1, 'stone');
    });

    // Kommunismus: breites Volkshaus mit Fensterbändern, gestufter Turm mit schlichter Kugel
    CENTER.communism = center(function (g) {
      g.ellipse(9, 1.2, 1.3, 1.3, function (x, y, nx, ny) { return nx + ny < -0.3 ? 'Tl' : 'T'; });
      g.vline(8, 2, 2, 'stoneD'); g.vline(9, 2, 2, 'stone');
      box(g, 7, 4, 4, 3, 'stoneL', 'stone', 'white');
      box(g, 6, 7, 6, 3, 'stoneL', 'stone', 'white');
      box(g, 5, 10, 8, 3, 'stoneL', 'stone', 'white');
      g.hline(7, 5, 4, 'glass'); g.hline(6, 8, 6, 'glass'); g.hline(5, 11, 8, 'glass');
      g.set(9, 5, 'plum'); g.set(8, 8, 'plum'); g.set(10, 8, 'plum'); g.set(7, 11, 'plum'); g.set(10, 11, 'plum');
      // breite Flügel
      box(g, 1, 13, 16, 11, 'stoneL', 'stone', 'white');
      g.rect(1, 13, 16, 2, 'T'); g.hline(1, 14, 16, 'Td'); g.hline(1, 13, 3, 'Tl');
      for (var x = 2; x <= 15; x++) { g.set(x, 16, (x % 3 === 1) ? 'plum' : 'glass'); g.set(x, 19, (x % 3 === 1) ? 'plum' : 'glass'); }
      g.rect(7, 20, 4, 4, 'woodD'); g.vline(8, 20, 4, 'wood'); g.hline(7, 20, 4, 'stoneD');
      g.hline(1, 23, 6, 'stone'); g.hline(11, 23, 6, 'stone');
    });

    // Theokratie: Tempel mit großer Knödelkuppel und goldener Kugel, zwei Spitztürmchen
    CENTER.theocracy = center(function (g) {
      // Seitentürmchen
      [[1, 'white'], [15, 'stoneL']].forEach(function (t) {
        var x = t[0];
        g.rect(x, 9, 2, 15, 'white'); g.vline(x + 1, 9, 15, 'stoneL');
        g.set(x, 8, 'gold'); g.set(x + 1, 8, 'goldD'); g.set(x, 7, 'goldL'); g.set(x, 6, 'gold');
        g.set(x, 12, 'ink'); g.set(x, 17, 'ink');
      });
      // Unterbau
      box(g, 3, 15, 12, 9, 'white', 'stoneL', null); g.vline(14, 15, 9, 'stone');
      g.hline(3, 15, 12, 'gold'); g.hline(3, 16, 12, 'goldD');
      g.paint(7, 18, ['.kk.', 'kWWk', 'kWWk', 'kWwk', 'kWWk', 'kWWk']);
      g.set(5, 19, 'T'); g.set(5, 20, 'T'); g.set(5, 21, 'Td'); g.set(12, 19, 'T'); g.set(12, 20, 'T'); g.set(12, 21, 'Td');
      // Knödelkuppel
      g.ellipse(9, 9.5, 6, 6, function (x, y, nx, ny) {
        if (ny > 0.55) return 'strawD';
        var s = nx * 0.8 + ny;
        return s < -0.75 ? 'white' : (s < 0.1 ? 'cream' : (s < 0.7 ? 'strawL' : 'straw'));
      });
      g.set(6, 8, 'strawL'); g.set(10, 6, 'strawL'); g.set(12, 10, 'straw'); g.set(7, 11, 'cream');
      g.set(8, 4, 'straw'); g.set(9, 4, 'strawD'); g.set(10, 4, 'straw');
      // goldene Kugel
      g.ellipse(9, 2, 1.5, 1.5, function (x, y, nx, ny) { return nx + ny < -0.2 ? 'goldL' : 'gold'; });
      g.set(9, 0, 'goldD');
    });

    // Handelsrepublik: zwei Kontorhäuser mit Treppengiebeln, Ladebaum mit Kiste, Waren
    CENTER.republic = center(function (g) {
      function gableHouse(x, top, w) {
        // Treppengiebel (Backstein) – Stufen alle 2 Zeilen
        for (var j = 0; top + j < 22; j++) {
          var inset = Math.max(0, Math.floor((8 - j) / 2));
          if (j > 7) inset = 0;
          for (var i = inset; i < w - inset; i++) {
            var c = (i === inset) ? 'red' : (i === w - inset - 1 ? 'redD' : 'red');
            if ((j % 3 === 2) && ((i + j) & 1)) c = 'redD';
            g.set(x + i, top + j, c);
          }
          if (inset > 0 && (j & 1) === 0) { g.set(x + inset, top + j, 'stoneL'); g.set(x + w - inset - 1, top + j, 'stoneL'); }
        }
        // Fenster
        for (var r = 0; r < 3; r++) for (var k = 0; k < 2; k++) {
          var wx = x + 1 + k * (w - 3), wy = top + 7 + r * 4;
          if (wy + 1 < 21) { g.set(wx, wy, 'glass'); g.set(wx + 1, wy, 'glass'); g.set(wx, wy + 1, 'plum'); g.set(wx + 1, wy + 1, 'plum'); }
        }
        g.rect(x + Math.floor(w / 2) - 1, top + 3, 2, 2, 'woodD');
      }
      gableHouse(1, 2, 8);
      gableHouse(9, 4, 8);
      // Ladebaum
      g.hline(13, 5, 4, 'woodD'); g.vline(16, 6, 3, 'stoneD'); g.paint(15, 9, ['vw', 'wW']);
      // Markise und Tür
      g.hline(2, 20, 6, 'T'); for (var x = 2; x < 8; x += 2) g.set(x, 20, 'white');
      g.rect(4, 21, 2, 3, 'woodD');
      g.rect(12, 20, 2, 4, 'woodD'); g.set(12, 20, 'wood');
      g.hline(1, 22, 16, 'redD');
      // Fässer und Kisten
      g.paint(1, 21, ['vw', 'wW', 'vW']);
      g.paint(14, 21, ['oo.', 'kWo', 'WWo']);
      g.paint(9, 22, ['vw', 'Ww']);
    });

    // Anarchie: zusammengeflickte Kommune, schiefes Dach, Zelt, Wimpelkette
    CENTER.anarchy = center(function (g) {
      // schiefer Schornstein mit Rauch
      g.paint(10, 0, ['.gq', 'qgg', '.G.']);
      g.vline(11, 3, 5, 'stoneD'); g.vline(10, 4, 4, 'stone');
      // schiefes Flickendach
      var patch = ['T', 'red', 'purple', 'straw', 'Tl', 'pink', 'woodL', 'fireY'];
      for (var y = 6; y <= 13; y++) {
        var x0 = 1 + Math.max(0, 6 - y), x1 = 12;
        for (var x = x0; x <= x1; x++) {
          var pi = (Math.floor(x / 3) + Math.floor((y + x * 0.3) / 3) * 3) % patch.length;
          var c = patch[pi];
          if (y === 13) c = 'woodD';
          g.set(x, y + Math.floor((x - 1) / 6), c);
        }
      }
      // Wände
      for (y = 15; y <= 23; y++) for (x = 2; x <= 11; x++) {
        var c2 = (x < 5) ? 'cream' : (x < 8 ? 'woodL' : 'sandL');
        if (y > 19 && x < 6) c2 = 'pink';
        if (x === 11) c2 = 'woodD';
        g.set(x, y, c2);
      }
      g.rect(4, 17, 2, 2, 'glass'); g.set(5, 18, 'plum');
      g.rect(8, 19, 2, 5, 'woodD'); g.set(8, 19, 'wood');
      g.set(3, 21, 'purple'); g.set(4, 22, 'fireY'); g.set(6, 16, 'red');
      // Zelt
      for (var j = 0; j < 8; j++) for (var i = 0; i <= j; i++) {
        var tx = 15 - Math.floor(j / 2) + i - Math.ceil(j / 2) + Math.floor(j / 2);
      }
      for (j = 0; j < 8; j++) {
        var half = j * 0.55;
        for (x = 11; x <= 16; x++) {
          var dx = x + 0.5 - 14.5;
          if (Math.abs(dx) <= half + 0.3) g.set(x, 16 + j, (x & 1) ? 'T' : (dx < 0 ? 'Tl' : 'Td'));
        }
      }
      g.set(14, 23, 'ink'); g.set(14, 22, 'ink'); g.set(14, 15, 'woodD');
      // Wimpelkette
      var bunt = ['red', 'fireY', 'T', 'purple', 'glass', 'pink', 'leafL', 'fireO'];
      for (x = 1; x <= 16; x++) {
        var yy = 4 + Math.round(Math.abs(x - 8.5) * -0.25 + 2);
        if ((x & 1) === 1) g.set(x, yy, bunt[(x >> 1) % bunt.length]);
      }
    });
    GOVS.forEach(function (gv) { def('s_center_' + gv, CENTER[gv], { group: 'center', fw: 2, fh: 2 }); });

    // ---------------------------------------------------------------- Denkmäler (1×1, hoch)
    function plinth(g, y) { g.rect(2, y, 6, 2, 'stoneL'); g.vline(7, y, 2, 'stone'); g.rect(1, y + 2, 8, 2, 'stone'); g.hline(1, y + 2, 8, 'stoneL'); g.vline(8, y + 2, 2, 'stoneD'); }
    function monument(fn) { var mg = new Grid(10, 20); fn(mg); return mg.outline(); }
    var MON = {};
    MON.tribe = monument(function (g) { // Totempfahl
      g.paint(2, 1, [
        'z....z',
        'yz..zy',
        '.vwwv.',
        '.Twwt.',
        '.vowo.',
        '.wwWw.',
        '.rrRr.',
        '.vwwW.',
        '.oowo.',
        '.wSSw.',
        '.TTTt.',
        '.vwwW.',
        '.wkkW.',
        '.wwwW.',
        '.wwwW.',
        '.WWWW.',
        'hhhhhh']);
    });
    MON.monarchy = monument(function (g) { // goldene Krone auf Sockel
      g.paint(1, 7, [
        'j..j..k.',
        'jk.jk.kK',
        'jkkjrkKK',
        'jkkkkkkK',
        'KKKKKKKK']);
      g.paint(2, 4, ['...r....']);
      plinth(g, 12); g.rect(3, 12, 4, 2, 'T'); g.hline(3, 13, 4, 'Td');
    });
    MON.democracy = monument(function (g) { // Wahlurne mit Stimmzettel
      g.paint(2, 3, [
        '..ll..',
        '..lc..',
        '.WllW.',
        'vvwwwW',
        'vTTTtW',
        'vTllTW',
        'vTTTtW',
        'vwwwwW']);
      plinth(g, 12);
    });
    MON.fascism = monument(function (g) { // Propagandaturm mit Lautsprechern
      g.vline(4, 3, 13, 'stone'); g.vline(5, 3, 13, 'stoneD');
      g.paint(1, 2, [
        'nm....mn',
        'Mnm..mnM',
        '.Mm..mM.',
        '...nM...',
        '...gG...']);
      g.paint(1, 8, ['nm....mn', 'Mm....mM']);
      g.set(4, 1, 'fireY'); g.set(5, 1, 'goldL'); g.set(4, 0, 'metal');
      g.rect(3, 10, 4, 3, 'T'); g.vline(6, 10, 3, 'Td');
      plinth(g, 15);
    });
    MON.communism = monument(function (g) { // Riesenrübe des Fünfjahresplans
      g.paint(1, 0, [
        '..f..f..',
        '.fe.fe..',
        '..eefe..',
        '...Ee...',
        '..PPPP..',
        '.PlPPPP.',
        '.lPPPPP.',
        '.PPPPPP.',
        '..PPPP..',
        '..PPP...',
        '...PP...',
        '...P....']);
      g.replace('P', 'purple');
      plinth(g, 13); g.hline(2, 13, 6, 'T');
    });
    MON.theocracy = monument(function (g) { // Schrein mit goldenem Knödel
      g.paint(1, 1, [
        '...TT...',
        '..TTTt..',
        '.TTTTtt.',
        'tttttttt',
        '.W....W.',
        '.W.jk.W.',
        '.WjkkKW.',
        '.WkkKKW.',
        '.W.KK.W.',
        '.W....W.']);
      plinth(g, 11);
    });
    MON.republic = monument(function (g) { // Brunnen mit goldener Münze
      g.paint(1, 0, [
        '...jk...',
        '..jkkK..',
        '..kKkK..',
        '...KK...',
        '...gG...',
        '.b.gG.b.',
        'b..gG..b',
        'b.qggG.b',
        '..qggG..',
        'qqqqqqqG',
        'qbbbbbbG',
        'gBBBBBBG',
        'gggggggG',
        '.GGGGGG.']);
    });
    MON.anarchy = monument(function (g) { // schiefe Stange mit Flickenfahne auf Kistenberg
      g.line(3, 1, 5, 13, 'woodD');
      g.paint(4, 1, ['rrPP', 'rkkP', 'TTbb', 'TT.b']);
      g.paint(1, 11, [
        '.vwwW...',
        '.wvwW.vW',
        'vwwWwvwW',
        'wWWWwWWW']);
      g.set(7, 10, 'red');
    });
    GOVS.forEach(function (gv) { def('s_monument_' + gv, MON[gv], { group: 'monument' }); });

    // ---------------------------------------------------------------- Felder (ohne Kontur)
    for (var fg = 0; fg < 4; fg++) {
      g = new Grid(8, 11);
      var oy = 3;
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
        var furrow = (y & 1) === 1;
        g.set(x, oy + y, furrow ? 'woodD' : 'soil');
        if (!furrow && hash(x, y, 50) < 0.15) g.set(x, oy + y, 'wood');
      }
      for (y = 0; y < 8; y += 2) for (x = 0; x < 8; x++) {
        var py = oy + y;
        if (fg === 0 && (x + y) % 3 === 0) g.set(x, py, 'strawD');
        if (fg === 1 && (x + y / 2) % 2 === 0) g.set(x, py, 'leafL');
        if (fg === 2 && (x % 2 === 0)) { g.set(x, py, 'leaf'); g.set(x, py - 1, (x + y) % 4 ? 'leafL' : 'leaf'); }
        if (fg === 2 && (x % 2 === 1)) g.set(x, py, 'leafD');
        if (fg === 3) {
          g.set(x, py, (x & 1) ? 'strawD' : 'straw');
          g.set(x, py - 1, (x & 1) ? 'straw' : 'strawL');
          if ((x + y) % 2 === 0) g.set(x, py - 2, 'gold');
        }
      }
      def('s_field_' + fg, g, { group: 'build' });
    }

    // ---------------------------------------------------------------- Betriebe
    // Holzfäller: Schuppen, Holzstapel, Hackklotz mit Axt
    def('s_lumber', art(10, 13, [
      '..........',
      '..........',
      '..........',
      '.vvvvvv...',
      '.wwwwwwW..',
      '.WWWWWWW..',
      '.WOOOOOW..',
      '.WOvWvOW..',
      '.WOWvWOW..',
      '.W..vwwwv.',
      '.nM.vwwwv.',
      '.Wv.WWWWv.',
      '..........']), { group: 'build' });
    // Steinbruch: gestapelte Quader, Hebebaum mit Seil, Hacke
    def('s_quarry', art(10, 13, [
      '..........',
      '..........',
      '.WWWWWW...',
      '.W....M...',
      '.W....M...',
      '.W...qqg..',
      '.W...gGG..',
      '.W........',
      '.qqgqqgW..',
      '.ggGggGw..',
      '.gGGgGGMn.',
      '..qg..W...',
      '..........']), { group: 'build' });
    // Kaserne: Langbau mit Teamdach, Schild, Speergestell
    g = new Grid(8, 14);
    g.vline(6, 0, 4, 'woodD'); g.paint(4, 0, ['TT', 'Tt']);
    roofRidge(g, 1, 4, 6, 4, TEAMROOF);
    box(g, 1, 8, 6, 4, 'stone', 'stoneD', 'stoneL');
    g.paint(2, 9, ['ul', 'Tt']); g.set(2, 10, 'T');
    g.rect(4, 10, 2, 2, 'plum');
    g.paint(5, 8, ['..']);
    g.set(6, 9, 'metalL'); g.set(6, 10, 'woodD'); g.set(6, 11, 'woodD');
    def('s_barracks', finish(g), { group: 'build' });

    // Markt: Stand mit gestreiftem Sonnendach und Waren
    g = new Grid(8, 13);
    for (x = 1; x < 7; x++) for (y = 3; y < 6; y++) g.set(x, y, (x & 1) ? 'white' : 'T');
    for (x = 1; x < 7; x++) g.set(x, 6, (x & 1) ? 'cream' : 'Td');
    g.vline(1, 7, 3, 'woodD'); g.vline(6, 7, 3, 'woodD');
    g.paint(1, 8, ['wrfkbw', 'vvvvvv', 'wWwWwW']);
    g.set(2, 7, 'red'); g.set(3, 7, 'leaf'); g.set(4, 7, 'gold');
    g.paint(1, 11, ['......']);
    def('s_market', finish(g), { group: 'build' });

    // ---------------------------------------------------------------- Baustellen, Ruine, Grab
    g = new Grid(8, 12);
    g.vline(1, 2, 9, 'woodD'); g.vline(6, 2, 9, 'woodD');
    g.hline(1, 3, 6, 'woodL'); g.hline(1, 7, 6, 'woodL');
    g.line(2, 4, 5, 6, 'wood'); g.line(2, 8, 5, 10, 'wood');
    g.paint(2, 9, ['qg..', 'gGqg']);
    def('s_site', finish(g), { group: 'build' });

    g = new Grid(16, 22);
    for (x = 1; x < 15; x += 4) g.vline(x, 4, 17, 'woodD');
    g.vline(14, 4, 17, 'woodD');
    g.hline(1, 5, 14, 'woodL'); g.hline(1, 11, 14, 'woodL'); g.hline(1, 16, 14, 'woodL');
    g.line(2, 6, 4, 10, 'wood'); g.line(10, 12, 13, 15, 'wood');
    box(g, 3, 13, 10, 8, 'stone', 'stoneD', 'stoneL');
    for (x = 3; x < 13; x++) if ((x & 1) === 0) g.set(x, 12, 'stone');
    g.hline(3, 16, 10, 'stoneD');
    g.vline(7, 0, 6, 'woodD'); g.hline(7, 0, 7, 'woodD'); g.vline(13, 1, 3, 'stoneD'); g.paint(12, 3, ['qg']);
    g.paint(1, 18, ['qg', 'gG']);
    def('s_site_big', finish(g), { group: 'build', fw: 2, fh: 2 });

    g = new Grid(8, 11);
    g.paint(0, 0, [
      '........',
      '........',
      '.q......',
      '.gq...q.',
      '.gg..qg.',
      '.gGq.gG.',
      '.gGgqgG.',
      '.GGgGGG.',
      '..e..e..',
      '.qG.Gq..',
      '........']);
    def('s_ruin', finish(g), { group: 'build' });

    g = new Grid(8, 10);
    g.paint(0, 0, [
      '........',
      '........',
      '...qq...',
      '..qgqg..',
      '..qggG..',
      '..qgGG..',
      '.hhgGGh.',
      '.WhhhhW.',
      '..rW.f..',
      '........']);
    def('s_grave', finish(g), { group: 'build' });
  });

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
