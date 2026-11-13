// Wuselwelt – Pixelkunst: Bauwerke (Zentren, Häuser, Betriebe, Denkmäler, Mauern, Tore, Türme).
// Gebäude haben eine dunkle Kontur und ragen nach oben über ihre Grundfläche hinaus.
// Grundflächen: Zentrum 3×3, Haus/Kaserne/Markt/Holzfäller/Steinbruch 2×2, alles andere 1×1.
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
    // Gebäude. Maße nach Grundfläche: Haus/Kaserne/Markt/Holzfäller/Steinbruch 2×2 (16×16 px),
    // Zentrum 3×3 (24×24 px). Jedes Gebäude wird innen (Grundfläche − 2 px) gezeichnet und bekommt
    // danach 1 px dunkle Kontur, steht also bündig auf der Grundfläche und ragt nach oben hinaus.
    // Licht von links oben: linke Kanten hell, rechte dunkel, Zeile unter der Traufe im Schatten.
    var g;
    function clr(gr, x, y) { if (x >= 0 && y >= 0 && x < gr.w && y < gr.h) gr.d[y * gr.w + x] = 0; }
    function box(gr, x, y, w, h, M, D, Lc) {
      gr.rect(x, y, w, h, M);
      if (Lc) gr.vline(x, y, h, Lc);
      if (D) gr.vline(x + w - 1, y, h, D);
      return gr;
    }
    var TR = ['Tl', 'T', 'Td'];
    var THATCH = ['strawL', 'straw', 'strawD'];
    var SLATE = ['stoneL', 'stone', 'stoneD'];
    var WOODR = ['woodL', 'wood', 'woodD'];

    // Satteldach, First waagrecht: oben schmale Rückseite (hell), vorn die große Dachfläche
    function roofSide(gr, x, y, w, h, t, back) {
      back = back == null ? Math.max(2, Math.round(h / 3.5)) : back;
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var c;
        if (j < back) c = i === w - 1 ? t[1] : t[0];
        else if (j === h - 1) c = t[2];
        else {
          c = t[1];
          var jj = j - back;
          if (jj % 3 === 2 && ((i + Math.floor(jj / 3) * 2) % 4) !== 0) c = t[2];
          if (i === 0) c = t[0];
          if (i === w - 1) c = t[2];
        }
        gr.set(x + i, y + j, c);
      }
      gr.hline(x + 1, y + back, w - 2, t[0] === 'Tl' ? 'Tl' : t[0]);
      clr(gr, x, y); clr(gr, x + w - 1, y);
    }
    // Reetdach: gerundet, senkrechte Halme, ausgefranste Traufe
    function roofThatch(gr, x, y, w, h) {
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var inset = j === 0 ? 2 : (j === 1 ? 1 : 0);
        if (i < inset || i >= w - inset) continue;
        var c = 'straw';
        if (j < 2 || i === inset) c = 'strawL';
        if ((i * 7 + j * 3) % 5 === 0 && j > 1) c = 'strawD';
        if (i === w - 1 - inset || i === w - 1) c = 'strawD';
        if (j === h - 1) c = (i & 1) ? 'strawD' : 'woodL';
        gr.set(x + i, y + j, c);
      }
      for (var k = 1; k < w - 1; k += 2) gr.set(x + k, y + h, 'strawD');
    }
    // Giebeldach zum Betrachter: zwei Dachflächen nach hinten, vorn ein Giebeldreieck (wand)
    function roofFront(gr, x, y, w, h, t, gableH, wallFn) {
      var cx = x + (w - 1) / 2;
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var px = x + i;
        var c = px < cx - 0.1 ? (i === 0 ? t[0] : t[1]) : (px > cx + 0.1 ? t[2] : t[0]);
        if (px < cx && (j % 3 === 2) && i % 2) c = t[0];
        gr.set(px, y + j, c);
      }
      clr(gr, x, y); clr(gr, x + w - 1, y);
      // Giebeldreieck
      var top = y + h - gableH;
      for (j = 0; j < gableH; j++) {
        var half = (j + 1) / gableH * (w / 2 - 1);
        for (i = 0; i < w; i++) {
          var dx = x + i - cx;
          if (Math.abs(dx) <= half - 0.5) gr.set(x + i, top + j, wallFn(x + i, top + j));
          else if (Math.abs(dx) <= half + 0.6) gr.set(x + i, top + j, dx < 0 ? t[0] : t[2]);
        }
      }
    }
    // Wände
    function wallPlaster(gr, x, y, w, h) { // Fachwerk
      box(gr, x, y, w, h, 'cream', 'sandD', 'white');
      gr.hline(x, y, w, 'woodD'); gr.hline(x, y + h - 1, w, 'woodD');
      gr.vline(x, y, h, 'woodD'); gr.vline(x + w - 1, y, h, 'woodD');
      gr.hline(x, y + Math.floor(h / 2), w, 'woodD');
      for (var i = 3; i < w - 2; i += 4) gr.vline(x + i, y, h, 'woodD');
    }
    function wallPlanks(gr, x, y, w, h) {
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) gr.set(x + i, y + j, i === w - 1 ? 'woodD' : (i % 3 === 0 ? 'woodL' : 'wood'));
      gr.hline(x, y + h - 1, w, 'woodD');
    }
    function wallBrick(gr, x, y, w, h, cols, phase) {
      cols = cols || ['stoneL', 'stone', 'stoneD', 'stoneD'];
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var row = j + (phase || 0), c = cols[1];
        if (row % 3 === 2 && ((i + (Math.floor(row / 3) & 1) * 2) % 4) !== 0) c = cols[3];
        else if (row % 3 !== 2 && ((i + (Math.floor(row / 3) & 1) * 2) % 4) === 3) c = cols[3];
        if (i === 0) c = cols[0];
        if (i === w - 1) c = cols[2];
        gr.set(x + i, y + j, c);
      }
    }
    function eaveShadow(gr, x, y, w, c) { for (var i = 0; i < w; i++) if (gr.get(x + i, y)) gr.set(x + i, y, c || 'shade'); }
    function win(gr, x, y, w, h) {
      w = w || 2; h = h || 2;
      gr.rect(x, y, w, h, 'glass'); gr.set(x, y, 'white');
      gr.hline(x, y + h - 1, w, 'waterD'); gr.set(x, y + h - 1, 'glass');
      gr.hline(x, y + h, w, 'woodL');
    }
    function door(gr, x, y, h, col) {
      gr.rect(x, y, 2, h, col || 'woodD'); gr.vline(x, y, h, 'wood'); gr.set(x + 1, y + Math.floor(h / 2), 'gold');
    }
    function chimney(gr, x, y, h) { gr.rect(x, y, 2, h, 'stone'); gr.vline(x, y, h, 'stoneL'); gr.hline(x, y, 2, 'stoneD'); gr.set(x + 1, y + h - 1, 'stoneD'); }
    function flagPole(gr, x, y, h) { gr.vline(x, y, h, 'woodD'); gr.set(x, y - 1, 'gold'); gr.paint(x + 1, y, ['TTu', 'TTT', 'tt.']); }
    function finishB(gr) { return gr.pad(1, 1, 1, 1).outline(); }
    // Schlagschatten nach rechts (Licht von links oben): nur in den Zeilen der Grundfläche,
    // 2 px rechts neben der Silhouette. Das Sprite wird dafür 2 px breiter (Anker bleibt links).
    function shadowR(gr, n) {
      var o = gr.pad(0, 0, 2, 0), H = o.h, W = gr.w;
      for (var y = Math.max(0, H - n * 8 + 3); y < H - 1; y++) {
        var xr = -1;
        for (var x = W - 1; x >= 0; x--) if (o.get(x, y) && o.get(x, y) !== C.shade) { xr = x; break; }
        if (xr < 0) continue;
        for (var k = 1; k <= 2; k++) if (!o.get(xr + k, y)) o.set(xr + k, y, C.shade);
      }
      return o;
    }
    function defB(key, gr, n, group) { def(key, shadowR(gr, n), { group: group || 'build', fw: n, fh: n, ox: 0 }); }

    // ---------------------------------------------------------------- Häuser (2×2)
    // Stufe 1: Hütte mit Reetdach (neutral, Teamfarbe nur an Tür/Tuch)
    g = new Grid(14, 18);
    roofThatch(g, 1, 3, 12, 8);
    wallPlanks(g, 2, 11, 10, 6);
    eaveShadow(g, 2, 12, 10, 'woodD');
    door(g, 6, 13, 4, 'T'); g.set(6, 13, 'Tl'); g.set(7, 15, 'Td');
    win(g, 3, 13); g.vline(10, 13, 2, 'plum');
    g.paint(11, 15, ['.vw', 'vwW']); // Holzstapel
    g.set(9, 1, 'stone'); g.set(9, 2, 'stoneD'); g.set(10, 2, 'stone');
    defB('s_house_1_a', finishB(g), 2);

    // Rundhütte mit Kegeldach aus Reet
    g = new Grid(14, 19);
    for (var j0 = 0; j0 < 11; j0++) {
      var hw = 0.8 + j0 * 0.62;
      for (var i0 = 0; i0 < 14; i0++) {
        var dx0 = i0 + 0.5 - 7;
        if (Math.abs(dx0) > hw) continue;
        var c0 = dx0 < -hw * 0.45 ? 'strawL' : (dx0 > hw * 0.5 ? 'strawD' : 'straw');
        if (j0 > 2 && (i0 * 5 + j0 * 2) % 7 === 0) c0 = 'strawD';
        g.set(i0, j0 + 1, c0);
      }
    }
    for (i0 = 0; i0 < 14; i0 += 2) g.set(i0, 12, 'strawD');
    g.set(6, 0, 'woodD'); g.set(7, 0, 'woodD'); g.set(5, 0, 'woodD'); g.set(8, 0, 'woodD');
    wallPlanks(g, 2, 12, 10, 6);
    eaveShadow(g, 2, 12, 10, 'woodD'); eaveShadow(g, 2, 13, 10, 'wood');
    g.rect(6, 14, 2, 4, 'plum'); g.rect(6, 14, 2, 2, 'T'); g.set(7, 15, 'Td');
    g.set(4, 14, 'glass'); g.set(4, 15, 'waterD');
    g.paint(11, 15, ['cY', 'YY']); // Säcke
    defB('s_house_1_b', finishB(g), 2);

    // Stufe 2: Fachwerkhaus mit Ziegeldach in Teamfarbe
    g = new Grid(14, 21);
    chimney(g, 9, 1, 5);
    roofSide(g, 0, 4, 14, 10, TR, 3);
    wallPlaster(g, 1, 14, 12, 7);
    eaveShadow(g, 1, 14, 12, 'woodD');
    door(g, 6, 16, 5);
    win(g, 3, 16); win(g, 9, 16);
    defB('s_house_2_a', finishB(g), 2);

    // Winkelhaus: Hauptdach quer, vorn links ein Giebelflügel
    g = new Grid(14, 22);
    chimney(g, 10, 0, 5);
    roofSide(g, 3, 3, 11, 9, TR, 3);
    wallPlaster(g, 6, 12, 7, 8);
    eaveShadow(g, 6, 12, 7, 'woodD');
    win(g, 9, 14); door(g, 8, 15, 5); clr(g, 8, 14);
    roofFront(g, 0, 5, 8, 11, TR, 5, function (x, y) { return (x === 4 || y === 15) ? 'woodD' : 'cream'; });
    g.set(3, 13, 'glass'); g.set(4, 13, 'glass'); g.set(3, 12, 'white');
    wallPlaster(g, 0, 16, 7, 6);
    eaveShadow(g, 0, 16, 7, 'woodD');
    win(g, 2, 17);
    defB('s_house_2_b', finishB(g), 2);

    // Stufe 3: Steinhaus, zwei Geschosse
    g = new Grid(14, 25);
    chimney(g, 10, 0, 6);
    roofSide(g, 0, 4, 14, 10, TR, 3);
    g.set(4, 5, 'glass'); g.set(5, 5, 'glass'); g.set(4, 4, 'Td'); g.set(5, 4, 'Td'); g.set(3, 5, 'Td'); g.set(6, 5, 'Td'); // Gaube
    wallBrick(g, 1, 14, 12, 11);
    eaveShadow(g, 1, 14, 12, 'stoneD');
    win(g, 3, 15); win(g, 9, 15); win(g, 6, 15);
    g.hline(1, 18, 12, 'stoneL');
    door(g, 6, 20, 5); g.hline(5, 19, 4, 'stoneD');
    win(g, 2, 20); win(g, 10, 20);
    defB('s_house_3_a', finishB(g), 2);

    g = new Grid(14, 27);
    // Haupthaus rechts, schmaler Turm links
    roofSide(g, 5, 9, 9, 8, TR, 2);
    wallBrick(g, 6, 17, 7, 10, null, 1);
    eaveShadow(g, 6, 17, 7, 'stoneD');
    win(g, 8, 18); door(g, 9, 22, 5); win(g, 11, 22);
    // Turm
    for (var j = 0; j < 9; j++) {
      var half = 0.6 + j * 0.5;
      for (var i = 0; i < 7; i++) { var dx = i - 3; if (Math.abs(dx) <= half) g.set(i, j, dx < -0.5 ? 'Tl' : (dx < 0.5 ? 'T' : 'Td')); }
    }
    g.hline(0, 8, 7, 'Td');
    wallBrick(g, 1, 9, 5, 18, ['stoneL', 'stone', 'stoneD', 'stoneD'], 0);
    eaveShadow(g, 1, 9, 5, 'stoneD');
    g.set(3, 11, 'glass'); g.set(3, 12, 'waterD'); g.set(3, 17, 'glass'); g.set(3, 18, 'waterD');
    win(g, 2, 22);
    g.set(3, 0, 'gold');
    defB('s_house_3_b', finishB(g), 2);

    // ---------------------------------------------------------------- Regierungszentren (3×3)
    // Innen 22 px breit; jede Regierung hat eine eigene Silhouette.
    var CW = 22;
    function center(h, fn) { var cg = new Grid(CW, h); fn(cg, h); return finishB(cg); }
    function cone(gr, x, y, w, h, t) {
      var cx = x + (w - 1) / 2;
      for (var j = 0; j < h; j++) {
        var half = 0.3 + (j / Math.max(1, h - 1)) * (w / 2);
        for (var i = 0; i < w; i++) {
          var dx = x + i - cx;
          if (Math.abs(dx) <= half) gr.set(x + i, y + j, dx < -0.6 ? t[0] : (dx < 0.6 ? t[1] : t[2]));
        }
      }
      gr.hline(x, y + h - 1, w, t[2]);
    }
    function crenel(gr, x, y, w, col, top) {
      for (var i = 0; i < w; i++) { if ((i & 1) === 0) gr.set(x + i, y, top || col); gr.set(x + i, y + 1, col); }
    }
    var CENTER = {};

    // Stammesrat: Langhaus mit großem Reetdach, gekreuzten Giebelstangen, Lagerfeuer und Stammespfahl
    CENTER.tribe = center(28, function (g, H) {
      roofThatch(g, 3, 7, 18, 12);
      // gekreuzte Giebelstangen
      g.line(4, 3, 8, 8, 'woodD'); g.line(9, 3, 5, 8, 'woodD');
      g.line(15, 3, 19, 8, 'woodD'); g.line(20, 3, 16, 8, 'woodD');
      g.set(4, 3, 'cream'); g.set(9, 3, 'cream'); g.set(15, 3, 'cream'); g.set(20, 3, 'cream');
      wallPlanks(g, 4, 19, 16, 7);
      eaveShadow(g, 4, 20, 16, 'woodD');
      // Eingang mit Fellvorhang in Teamfarbe
      g.rect(10, 21, 4, 5, 'plum'); g.rect(10, 21, 4, 3, 'T'); g.vline(13, 21, 3, 'Td'); g.set(10, 21, 'Tl');
      g.hline(9, 20, 6, 'woodD');
      // Hörnerschmuck über dem Eingang
      g.set(10, 18, 'cream'); g.set(13, 18, 'cream'); g.set(9, 17, 'cream'); g.set(14, 17, 'cream');
      // Stammespfahl mit Banner
      g.vline(1, 6, 21, 'woodD'); g.vline(0, 6, 21, 'wood');
      g.paint(2, 7, ['TTu', 'TTT', 'tTt', 't.t']);
      g.set(0, 5, 'cream'); g.set(1, 5, 'cream'); g.set(0, 4, 'cream'); g.set(2, 4, 'cream');
      // Lagerfeuer vorn rechts
      g.paint(16, 21, [
        '...j..',
        '..jF..',
        '..FQF.',
        '.QFjFQ',
        'gWQQWg',
        '.gWWg.']);
    });

    // Monarchie: Burg – Bergfried mit Fahne, zwei Rundtürme mit Kegeldach, Tor mit Fallgatter
    CENTER.monarchy = center(36, function (g, H) {
      // Bergfried
      wallBrick(g, 7, 10, 8, 24, null, 0);
      crenel(g, 7, 8, 8, 'stone', 'stoneL');
      flagPole(g, 11, 1, 7);
      g.vline(9, 13, 2, 'ink'); g.vline(12, 13, 2, 'ink');
      // Wehrmauer vorn
      wallBrick(g, 2, 22, 18, 12, null, 1);
      crenel(g, 2, 20, 18, 'stone', 'stoneL');
      // Rundtürme
      [[0, 'stoneL'], [16, 'stone']].forEach(function (t) {
        var x = t[0];
        wallBrick(g, x, 12, 6, 22, null, 2);
        cone(g, x - 1, 3, 8, 9, TR);
        g.set(x + 2, 2, 'gold');
        g.vline(x + 2, 16, 2, 'ink'); g.vline(x + 2, 25, 2, 'ink');
      });
      // Banner an der Mauer
      g.rect(6, 23, 2, 5, 'T'); g.set(7, 27, 'Td'); g.vline(7, 23, 4, 'Td');
      g.rect(14, 23, 2, 5, 'T'); g.set(15, 27, 'Td'); g.vline(15, 23, 4, 'Td');
      // Tor
      g.paint(9, 26, [
        '.oooo.',
        'oWWWWo',
        'oMWMWo',
        'oMwMwo',
        'oMwMwo',
        'oMwMwo',
        'oMwMwo',
        'oMwMwo']);
    });

    // Demokratie: Rathaus – Säulen, Dreiecksgiebel in Teamfarbe, Uhrturm mit Kuppel
    CENTER.democracy = center(34, function (g, H) {
      // Uhrturm
      g.ellipse(11, 4, 3, 3, function (x, y, nx, ny) { return nx + ny < -0.5 ? 'goldL' : (nx > 0.3 ? 'goldD' : 'gold'); });
      g.set(11, 0, 'goldD'); g.set(11, 1, 'gold');
      box(g, 8, 6, 7, 7, 'white', 'stone', null); g.vline(8, 6, 7, 'white');
      g.hline(8, 6, 7, 'stoneL');
      g.paint(9, 7, ['.lll.', 'lldll', 'lddll', '.lll.']); g.set(11, 8, 'ink'); g.set(11, 9, 'ink'); g.set(12, 9, 'ink');
      // Giebel
      for (var j = 0; j < 6; j++) {
        var half = 2.5 + j * 1.75;
        for (var x = 0; x < CW; x++) {
          var dx = x + 0.5 - 11;
          if (Math.abs(dx) <= half) g.set(x, 12 + j, Math.abs(dx) > half - 1.3 ? (dx < 0 ? 'white' : 'stoneL') : (j >= 1 && Math.abs(dx) < half - 1.5 ? 'T' : 'stoneL'));
        }
      }
      g.hline(1, 18, 20, 'white'); g.hline(1, 19, 20, 'stone');
      // Säulengang
      g.rect(2, 20, 18, 10, 'plum');
      [2, 6, 10, 14, 18].forEach(function (cx) {
        for (var y = 20; y <= 29; y++) { g.set(cx, y, 'white'); g.set(cx + 1, y, 'stoneL'); }
      });
      g.rect(10, 23, 2, 7, 'woodD'); g.set(10, 23, 'wood'); g.vline(12, 24, 3, 'glass'); g.vline(9, 24, 3, 'glass');
      g.rect(4, 22, 2, 4, 'glass'); g.rect(16, 22, 2, 4, 'glass');
      g.set(4, 21, 'T'); g.set(5, 21, 'T'); g.set(16, 21, 'T'); g.set(17, 21, 'T');
      // Treppe
      g.hline(0, 30, 22, 'stoneL'); g.hline(0, 31, 22, 'stone'); g.hline(1, 32, 20, 'stoneL'); g.hline(1, 33, 20, 'stoneD');
    });

    // Faschismus: Kommandantur – wuchtiger Block, schmaler hoher Mittelturm, schlichte lange Banner
    CENTER.fascism = center(40, function (g, H) {
      var DK = ['stone', 'dusk', 'plum', 'plum'];
      // Mittelturm
      wallBrick(g, 8, 4, 6, 18, DK, 0);
      g.rect(7, 2, 8, 2, 'stoneD'); g.hline(7, 2, 8, 'stone');
      g.set(10, 1, 'fireY'); g.set(11, 1, 'goldL'); g.set(10, 0, 'fireY');
      g.vline(10, 7, 9, 'ink'); g.vline(11, 7, 9, 'ink');
      // Hauptblock, stufenförmig
      g.rect(0, 19, 22, 2, 'stone'); g.hline(0, 19, 22, 'stoneL');
      wallBrick(g, 0, 21, 22, 17, DK, 1);
      g.rect(3, 15, 16, 4, 'dusk'); g.hline(3, 15, 16, 'stone'); g.vline(3, 15, 4, 'stone'); g.vline(18, 15, 4, 'plum');
      for (var x = 4; x <= 17; x += 3) { g.vline(x + 1, 24, 3, 'ink'); g.vline(x + 1, 30, 3, 'ink'); }
      // lange schlichte Banner
      [1, 5, 15, 19].forEach(function (bx) { g.rect(bx, 21, 2, 12, 'T'); g.vline(bx + 1, 21, 12, 'Td'); g.set(bx, 33, 'Td'); });
      // Tor und Stufen
      g.rect(9, 31, 4, 7, 'ink'); g.vline(10, 31, 7, 'metalD'); g.vline(11, 31, 7, 'metalD'); g.hline(9, 31, 4, 'stoneD');
      g.hline(6, 38, 10, 'stoneD'); g.hline(7, 39, 8, 'stone');
    });

    // Kommunismus: Volkshaus – breiter Riegel mit Fensterbändern, gestufter Turm mit Kugel
    CENTER.communism = center(38, function (g, H) {
      g.ellipse(11, 2, 2, 2, function (x, y, nx, ny) { return nx + ny < -0.3 ? 'Tl' : (nx > 0.4 ? 'Td' : 'T'); });
      g.vline(10, 4, 2, 'stone'); g.vline(11, 4, 2, 'stoneD');
      box(g, 8, 6, 6, 4, 'stoneL', 'stone', 'white');
      box(g, 6, 10, 10, 4, 'stoneL', 'stone', 'white');
      box(g, 4, 14, 14, 5, 'stoneL', 'stone', 'white');
      g.hline(9, 7, 4, 'glass'); g.hline(7, 11, 8, 'glass'); g.hline(5, 15, 12, 'glass'); g.hline(5, 16, 12, 'waterD');
      for (var x = 6; x < 18; x += 3) { g.set(x, 15, 'stone'); g.set(x, 16, 'stone'); }
      // breiter Riegel
      box(g, 0, 19, 22, 17, 'stoneL', 'stone', 'white');
      g.rect(0, 19, 22, 3, 'T'); g.hline(0, 21, 22, 'Td'); g.hline(0, 19, 6, 'Tl');
      for (x = 1; x <= 20; x++) {
        var c = (x % 4 === 0) ? 'stone' : 'glass';
        g.set(x, 24, c); g.set(x, 25, c === 'glass' ? 'waterD' : c);
        g.set(x, 28, c); g.set(x, 29, c === 'glass' ? 'waterD' : c);
      }
      g.rect(8, 31, 6, 5, 'woodD'); g.vline(9, 31, 5, 'wood'); g.vline(11, 31, 5, 'wood'); g.hline(7, 30, 8, 'stoneD');
      g.hline(0, 36, 22, 'stone'); g.hline(0, 37, 22, 'stoneD');
    });

    // Theokratie: Tempel mit großer Knödelkuppel, zwei schlanken Türmchen mit Goldspitzen
    CENTER.theocracy = center(38, function (g, H) {
      [[0, 'white'], [19, 'stoneL']].forEach(function (t) {
        var x = t[0];
        g.rect(x, 10, 3, 26, 'white'); g.vline(x + 2, 10, 26, 'stoneL');
        g.set(x + 1, 9, 'gold'); g.set(x + 1, 8, 'gold'); g.set(x + 1, 7, 'goldL'); g.set(x + 1, 6, 'gold'); g.set(x, 9, 'goldD'); g.set(x + 2, 9, 'goldD');
        g.set(x + 1, 14, 'ink'); g.set(x + 1, 20, 'ink'); g.set(x + 1, 26, 'ink');
      });
      box(g, 3, 21, 16, 15, 'white', 'stoneL', null); g.vline(18, 21, 15, 'stone');
      g.hline(3, 21, 16, 'gold'); g.hline(3, 22, 16, 'goldD');
      g.paint(8, 27, ['.kkkk.', 'kWWWWk', 'kWWWWk', 'kWwWwk', 'kWwWwk', 'kWWWWk', 'kWWWWk', 'kWWWWk', 'kWWWWk']);
      g.rect(5, 25, 2, 4, 'T'); g.set(6, 28, 'Td'); g.rect(15, 25, 2, 4, 'T'); g.set(16, 28, 'Td');
      // Knödelkuppel
      g.ellipse(11, 14, 8, 8, function (x, y, nx, ny) {
        if (ny > 0.6) return 'strawD';
        var s = nx * 0.8 + ny;
        return s < -0.8 ? 'white' : (s < 0.0 ? 'cream' : (s < 0.6 ? 'strawL' : 'straw'));
      });
      g.set(7, 12, 'strawL'); g.set(13, 9, 'strawL'); g.set(15, 15, 'straw'); g.set(9, 16, 'cream'); g.set(12, 17, 'straw');
      g.hline(5, 20, 13, 'goldD');
      g.ellipse(11, 4, 2, 2, function (x, y, nx, ny) { return nx + ny < -0.2 ? 'goldL' : 'gold'; });
      g.set(11, 1, 'goldD'); g.set(11, 0, 'gold');
    });

    // Handelsrepublik: Kontor – drei Kaufmannshäuser mit Treppengiebeln, Ladebaum, Waren
    CENTER.republic = center(34, function (g, H) {
      function gableHouse(x, top, w, col, colD) {
        for (var j = 0; top + j < 32; j++) {
          var inset = j < 8 ? Math.max(0, Math.floor((8 - j) / 2)) : 0;
          for (var i = inset; i < w - inset; i++) {
            var c = i === inset ? 'redL' : (i === w - inset - 1 ? colD : col);
            if ((j % 3 === 2) && ((i + j) & 1) && j > 7) c = colD;
            g.set(x + i, top + j, c);
          }
          if (inset > 0 && (j & 1) === 0) { g.set(x + inset, top + j, 'stoneL'); g.set(x + w - inset - 1, top + j, 'stoneL'); }
        }
        for (var r = 0; r < 4; r++) for (var k = 0; k < 2; k++) {
          var wx = x + 1 + k * (w - 4), wy = top + 9 + r * 5;
          if (wy + 2 < 30) win(g, wx, wy, 2, 2);
        }
        g.rect(x + Math.floor(w / 2) - 1, top + 3, 2, 2, 'woodD');
      }
      gableHouse(0, 4, 8, 'red', 'redD');
      gableHouse(7, 1, 8, 'T', 'Td');
      gableHouse(14, 5, 8, 'red', 'redD');
      // Ladebaum
      g.hline(11, 3, 5, 'woodD'); g.vline(15, 4, 4, 'stoneD'); g.paint(14, 8, ['vw', 'wW']);
      // Markise, Türen
      g.hline(1, 28, 6, 'T'); for (var x = 1; x < 7; x += 2) g.set(x, 28, 'white');
      g.rect(10, 28, 2, 4, 'woodD'); g.set(10, 28, 'wood');
      g.rect(17, 28, 2, 4, 'woodD');
      g.hline(0, 32, 22, 'stoneD'); g.hline(0, 33, 22, 'stone');
      // Fässer und Kisten
      g.paint(1, 29, ['vw', 'wW', 'vW']);
      g.paint(19, 29, ['oo.', 'kWo', 'WWo']);
      g.paint(13, 30, ['vw', 'Ww']);
    });

    // Anarchie: Kommune – zusammengeflicktes Haus mit schiefem Flickendach, Zelt, Wimpelkette
    CENTER.anarchy = center(30, function (g, H) {
      g.paint(12, 1, ['.gq', 'qgg', '.G.']);
      g.vline(13, 4, 6, 'stoneD'); g.vline(12, 5, 5, 'stone');
      var patch = ['T', 'red', 'purple', 'straw', 'Tl', 'pink', 'woodL', 'fireY', 'glass'];
      for (var y = 8; y <= 17; y++) {
        var x0 = 1 + Math.max(0, 9 - y), x1 = 15;
        for (var x = x0; x <= x1; x++) {
          var pi = (Math.floor(x / 3) + Math.floor((y + x * 0.3) / 3) * 3) % patch.length;
          var c = patch[pi];
          if (y === 17) c = 'woodD';
          g.set(x, y + Math.floor((x - 1) / 7), c);
        }
      }
      for (y = 19; y <= 28; y++) for (x = 2; x <= 14; x++) {
        var c2 = (x < 6) ? 'cream' : (x < 10 ? 'woodL' : 'sandL');
        if (y > 24 && x < 7) c2 = 'pink';
        if (x === 14) c2 = 'woodD';
        g.set(x, y, c2);
      }
      eaveShadow(g, 2, 19, 13, 'woodD');
      win(g, 4, 21); win(g, 11, 21);
      g.rect(8, 23, 2, 6, 'woodD'); g.set(8, 23, 'wood');
      g.set(3, 26, 'purple'); g.set(5, 27, 'fireY'); g.set(7, 20, 'red');
      // Zelt
      for (var j = 0; j < 10; j++) {
        var half = j * 0.55;
        for (x = 13; x <= 21; x++) {
          var dx = x + 0.5 - 18.5;
          if (Math.abs(dx) <= half + 0.3) g.set(x, 19 + j, (x & 1) ? 'T' : (dx < 0 ? 'Tl' : 'Td'));
        }
      }
      g.vline(18, 26, 3, 'ink'); g.set(18, 18, 'woodD'); g.set(18, 17, 'fireY');
      var bunt = ['red', 'fireY', 'T', 'purple', 'glass', 'pink', 'leafL', 'fireO'];
      for (x = 0; x <= 21; x++) {
        var yy = 5 + Math.round(Math.abs(x - 10.5) * -0.2 + 2);
        if ((x & 1) === 1) g.set(x, yy, bunt[(x >> 1) % bunt.length]); else g.set(x, yy - 1, 'woodD');
      }
    });
    GOVS.forEach(function (gv) { defB('s_center_' + gv, CENTER[gv], 3, 'center'); });

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
    // Ackerboden mit waagrechten Furchen; Pflanzen stehen in den Reihen und wachsen 0..3
    var FSOIL = L.addColor(null, '#b07a46'), FSOILD = L.addColor(null, '#8c5d34'), FSOILL = L.addColor(null, '#c48d55');
    for (var fg = 0; fg < 4; fg++) {
      g = new Grid(8, 11);
      var oy = 3;
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) {
        var r2 = y % 3;
        g.set(x, oy + y, r2 === 2 ? FSOILD : (r2 === 0 ? FSOILL : FSOIL));
      }
      g.hline(0, oy, 8, FSOILL);
      for (var row = 0; row < 3; row++) {
        var py = oy + row * 3 + 1;
        for (x = 0; x < 8; x++) {
          var off = (x + row) & 1;
          if (fg === 1 && off === 0) g.set(x, py, 'leafL');
          if (fg === 2) { g.set(x, py, off ? 'leaf' : 'leafL'); if (!off) g.set(x, py - 1, 'leafL'); g.set(x, py + 1, 'leafD'); }
          if (fg === 3) {
            g.set(x, py + 1, 'strawD'); g.set(x, py, off ? 'straw' : 'strawL');
            g.set(x, py - 1, off ? 'straw' : 'goldL');
            if (!off) g.set(x, py - 2, 'gold');
          }
        }
      }
      def('s_field_' + fg, g, { group: 'build' });
    }

    // ---------------------------------------------------------------- Betriebe (2×2)
    // Holzfäller: offener Schuppen, Stammstapel, Hackklotz mit Axt
    g = new Grid(14, 18);
    roofSide(g, 0, 3, 10, 6, WOODR, 2);
    g.vline(1, 9, 8, 'woodD'); g.vline(8, 9, 8, 'woodD');
    g.rect(2, 9, 6, 8, 'plum'); g.hline(2, 9, 6, 'woodD');
    // Stammstapel im Schuppen
    g.paint(2, 12, ['vovovo', 'owowow', 'vovovo', 'owowow', 'vovovo']);
    g.replace('ink', 'woodD');
    // Holzstapel draußen (Stirnseiten)
    g.paint(9, 11, ['.zz.', 'zyyz', 'zyzy', 'yzzy', 'zyyz', 'YYYY']);
    // Hackklotz mit Axt
    g.paint(10, 7, ['.m', 'nm', '.w', '.w']);
    g.paint(11, 6, ['..']);
    defB('s_lumber', finishB(g), 2);

    // Steinbruch: Quaderstapel, Hebekran mit Seil, Grube
    g = new Grid(14, 20);
    g.vline(2, 1, 17, 'woodD'); g.vline(3, 1, 17, 'wood'); g.hline(2, 1, 10, 'woodD'); g.line(3, 6, 7, 1, 'woodD');
    g.vline(10, 2, 6, 'stoneD'); g.paint(9, 8, ['qgG', 'gGG']);
    // Grube
    g.ellipse(9, 15, 4.5, 2.6, function (x, y, nx, ny) { return ny < -0.2 ? 'stoneD' : 'plum'; });
    g.hline(6, 13, 7, 'stone');
    // Quaderstapel
    g.paint(0, 13, ['qqgqg.', 'gGgGG.', 'qqgqqg', 'gGGgGG']);
    g.paint(11, 16, ['qg', 'GG']);
    // Spitzhacke
    g.paint(5, 15, ['nM.', '.w.', '..w']);
    defB('s_quarry', finishB(g), 2);

    // Kaserne: Langbau mit Teamdach, Fahne, Waffenständer, Übungspuppe
    g = new Grid(14, 21);
    flagPole(g, 12, 1, 9);
    roofSide(g, 0, 6, 12, 8, TR, 2);
    wallBrick(g, 1, 14, 10, 7);
    eaveShadow(g, 1, 14, 10, 'stoneD');
    g.rect(5, 16, 3, 5, 'plum'); g.hline(5, 16, 3, 'stoneD');
    g.set(2, 16, 'ink'); g.set(2, 17, 'ink'); g.set(9, 16, 'ink'); g.set(9, 17, 'ink');
    g.rect(6, 17, 1, 2, 'T');
    // Waffenständer rechts
    g.vline(12, 13, 8, 'woodD'); g.set(12, 12, 'metalL'); g.vline(13, 14, 7, 'woodD'); g.set(13, 13, 'metalL');
    defB('s_barracks', finishB(g), 2);

    // Markt: zwei Stände mit gestreiften Sonnendächern (Teamfarbe/Weiß) und Waren
    g = new Grid(14, 17);
    function stall(x, y, w, a, b) {
      for (var i = 0; i < w; i++) for (var j = 0; j < 4; j++) g.set(x + i, y + j, (Math.floor(i / 2) & 1) ? a : b);
      for (i = 0; i < w; i += 2) g.set(x + i, y + 4, a);
      g.vline(x, y + 4, 5, 'woodD'); g.vline(x + w - 1, y + 4, 5, 'woodD');
      g.rect(x, y + 7, w, 2, 'wood'); g.hline(x, y + 7, w, 'woodL');
    }
    stall(0, 3, 7, 'T', 'white');
    g.paint(1, 9, ['rkfr.']);
    stall(7, 6, 7, 'white', 'Td');
    g.paint(8, 12, ['bvkv.']);
    g.paint(0, 14, ['vw.', 'wW.']);
    g.paint(11, 15, ['YY', 'YY']);
    defB('s_market', finishB(g), 2);

    // ---------------------------------------------------------------- Baustellen
    // 1×1: Gerüst mit Steinen
    g = new Grid(8, 12);
    g.vline(1, 2, 9, 'woodD'); g.vline(6, 2, 9, 'woodD');
    g.hline(1, 3, 6, 'woodL'); g.hline(1, 7, 6, 'woodL');
    g.line(2, 4, 5, 6, 'wood'); g.line(2, 8, 5, 10, 'wood');
    g.paint(2, 9, ['qg..', 'gGqg']);
    def('s_site', g.outline(), { group: 'build' });
    // n×n: Fundament, halbe Wände, Gerüst, Kran
    function bigSite(n) {
      var w = n * 8 - 2, h = n * 8 + 4;
      var s = new Grid(w, h);
      var bot = h - 1;
      // Fundament
      s.rect(1, bot - 3, w - 2, 3, 'stone'); s.hline(1, bot - 3, w - 2, 'stoneL'); s.vline(w - 2, bot - 3, 3, 'stoneD');
      // halbe Mauern
      wallBrick(s, 2, bot - 9, w - 4, 6, null, 0);
      for (var x = 2; x < w - 2; x++) if (hash(x, n, 9) < 0.5) clr(s, x, bot - 9);
      // Gerüst
      for (x = 1; x < w; x += 5) s.vline(x, bot - 15 - n, 13 + n, 'woodD');
      s.hline(1, bot - 13, w - 2, 'woodL'); s.hline(1, bot - 8 - n, w - 2, 'woodL');
      s.line(2, bot - 12, 5, bot - 9 - n, 'wood');
      // Kran
      s.vline(w - 3, 0, bot - 2, 'woodD'); s.hline(w - 11, 1, 10, 'woodD'); s.vline(w - 9, 2, 4, 'stoneD'); s.paint(w - 10, 6, ['qg', 'gG']);
      // Steine und Bretter
      s.paint(0, bot - 2, ['qg', 'gG']);
      s.paint(w - 6, bot - 1, ['vvvv']);
      return finishB(s);
    }
    defB('s_site_2', bigSite(2), 2);
    defB('s_site_big', bigSite(2), 2);
    defB('s_site_3', bigSite(3), 3);

    // ---------------------------------------------------------------- Ruinen
    function ruin(n) {
      var w = n * 8 - 2, h = n * 8 + 2;
      var r = new Grid(w, h), bot = h - 1;
      r.rect(1, bot - 2, w - 2, 3, 'stoneD');
      for (var x = 1; x < w - 1; x++) {
        var hh = Math.floor(hash(x >> 1, n, 31) * (n * 4 + 2));
        if (x === 1 || x === w - 2) hh = n * 4 + 2;
        for (var y = 0; y < hh; y++) r.set(x, bot - 3 - y, ((x + y) % 4 === 0) ? 'stoneD' : (x === 1 ? 'stoneL' : 'stone'));
      }
      r.paint(2, bot - 1, ['ee.', '.qg']);
      r.set(w - 4, bot - 1, 'leaf');
      return finishB(r);
    }
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
    def('s_ruin', g.outline(), { group: 'build' });
    defB('s_ruin_2', ruin(2), 2);
    defB('s_ruin_3', ruin(3), 3);

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
    def('s_grave', g.outline(), { group: 'build' });
  });

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
