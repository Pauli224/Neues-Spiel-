// Wuselwelt – Pixelkunst: Bauwerke (Zentren, Häuser, Betriebe, Denkmäler, Mauern, Tore, Türme).
// Gebäude haben eine dunkle Kontur und ragen nach oben über ihre Grundfläche hinaus.
// Grundflächen: Zentrum 3×3, Haus/Kaserne/Markt/Holzfäller/Steinbruch 2×2, alles andere 1×1.
(function (WW) { 'use strict';

  (WW._spriteBuilders = WW._spriteBuilders || []).push(function (L) {
    var Grid = L.Grid, C = L.C, def = L.def, hash = L.hash, S = WW.Sprites;
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
    // Mauerstile je Regierung (ab Stufe 2): dieselbe Geometrie, anderes Material und andere Kappe.
    // Stufe 1 ist für alle die Palisade, Anarchie baut Barrikaden, der Stamm nur Palisaden.
    var AC = L.addColor;
    var MAT = {
      monarchy:  { top: 'stone', topL: 'stoneL', face: 'stone', faceL: 'stoneL', joint: 'stoneD', base: 'stoneD', pat: 'brick', merlon: 1 },
      democracy: { top: AC(null, '#ecdcae'), topL: AC(null, '#f8ecc8'), face: AC(null, '#e4cf98'), faceL: AC(null, '#f3e3b6'), joint: AC(null, '#c7aa70'), base: AC(null, '#b8975c'), pat: 'ashlar', merlon: 0, dh: -1, coping: AC(null, '#fbf3dc') },
      fascism:   { top: AC(null, '#8f8f91'), topL: AC(null, '#a7a7a8'), face: AC(null, '#86868a'), faceL: AC(null, '#9e9ea2'), joint: AC(null, '#6c6c72'), base: AC(null, '#58585f'), pat: 'smooth', merlon: 0, dh: 1, wire: 1 },
      communism: { top: AC(null, '#cbc6b6'), topL: AC(null, '#dcd8ca'), face: AC(null, '#c2bdac'), faceL: AC(null, '#d6d2c4'), joint: AC(null, '#99947f'), base: AC(null, '#86816e'), pat: 'panel', merlon: 0 },
      theocracy: { top: AC(null, '#f2eee2'), topL: 'white', face: AC(null, '#ebe5d4'), faceL: 'white', joint: AC(null, '#d2c9b2'), base: AC(null, '#bdb39a'), pat: 'ashlar', merlon: 1, cap: 'gold' },
      republic:  { top: 'red', topL: 'redL', face: 'red', faceL: 'redL', joint: AC(null, '#a5383a'), base: 'redD', pat: 'brick', merlon: 1, cap: 'stoneL' }
    };
    var STYLED = ['monarchy', 'democracy', 'fascism', 'communism', 'theocracy', 'republic'];
    function matFace(m, x, row, hh, merlon) {
      if (row >= hh - 1) return m.base;
      var r = row + (merlon ? 0 : 1);
      if (m.pat === 'brick') {
        if (r % 3 === 0) return m.joint;
        if (((x + ((Math.floor(r / 3) & 1) ? 2 : 0)) & 3) === 0) return m.joint;
      } else if (m.pat === 'ashlar') {
        if (r % 4 === 0) return m.joint;
        if (((x + ((Math.floor(r / 4) & 1) ? 3 : 0)) % 6) === 0) return m.joint;
      } else if (m.pat === 'panel') {
        if (r % 4 === 0 || x % 4 === 0) return m.joint;
      } else if (m.pat === 'smooth') {
        if (row === 1) return m.joint;
        if (x % 5 === 0) return m.joint;
      }
      return x === 0 ? m.faceL : m.face;
    }
    function wallCellsS(m, level, mask) {
      var P = WALL[level], a = P.a, b = P.b;
      return function (gx, gy) {
        if (!occ(mask, a, b, gx, gy)) return null;
        var gxm = ((gx % 8) + 8) % 8, gym = ((gy % 8) + 8) % 8;
        var edge = rim(mask, a, b, gx, gy);
        var h = P.h + (m.dh || 0) + (level === 3 ? 1 : 0);
        var merlon = m.merlon && edge && (((gxm >> 1) + (gym >> 1)) & 1) === 0;
        if (merlon) h += level === 3 ? 2 : 1;
        return {
          h: h,
          top: function () { return merlon && m.cap ? m.cap : (edge ? (m.coping || m.topL) : m.top); },
          face: function (x, row, y, hh) { if (row === 0 && m.coping) return m.coping; return matFace(m, x, row, hh, merlon); }
        };
      };
    }
    function wallHtot(m, level) { return WALL[level].h + (m.dh || 0) + (level === 3 ? 3 : 1) + 2; }
    // Stacheldraht (Faschismus): Pfosten und Drahtpixel über der Mauerkrone, ohne Kontur
    function addWire(g, m, level, mask, Htot) {
      var P = WALL[level], sp = Math.floor((P.a + P.b) / 2), h = P.h + (m.dh || 0) + (level === 3 ? 1 : 0);
      function put(x, y, k) {
        if (x < 0 || x > 7) return;
        var post = k % 3 === 0;
        g.set(x, y, (k & 1) ? 'metalL' : 'ink');
        g.set(x, y - 1, post ? 'ink' : ((k & 1) ? 'ink' : 'metalL'));
        if (post) g.set(x, y - 2, 'ink');
      }
      var horiz = (mask & 10) || !(mask & 5);
      if (horiz) for (var x = 0; x < 8; x++) if (occ(mask, P.a, P.b, x, sp)) put(x, sp - h - 1 + Htot, x);
      if (mask & 5) for (var gy = 0; gy < 8; gy++) if (occ(mask, P.a, P.b, sp, gy) && !(horiz && gy === sp)) {
        var yy = gy - h - 1 + Htot; g.set(sp, yy, (gy & 1) ? 'metalL' : 'ink'); g.set(sp + 1, yy, (gy & 1) ? 'ink' : 'metalL');
        if (gy % 3 === 0) g.set(sp, yy - 1, 'ink');
      }
    }
    function styledWall(st, level, mask) {
      var m = MAT[st], Htot = wallHtot(m, level);
      var g = extrude(wallCellsS(m, level, mask), Htot);
      if (m.wire) addWire(g, m, level, mask, Htot);
      return g;
    }
    STYLED.forEach(function (st) {
      for (var lv = 2; lv <= 3; lv++) for (var mk = 0; mk < 16; mk++) def('s_wall_' + st + '_' + lv + '_' + mk, styledWall(st, lv, mk), { group: 'wall' });
    });

    // Wassertor im Stil: Bogen über dem Fluss
    function styledWater(st, level, vert) {
      var m = MAT[st], P = WALL[level], mask = vert ? 5 : 10, base = wallCellsS(m, level, mask), Htot = wallHtot(m, level);
      var g = extrude(function (gx, gy) {
        var c = base(gx, gy);
        if (!c) return null;
        if (!(gx >= 0 && gx < 8 && gy >= 0 && gy < 8)) return c;
        if (!vert) {
          var face0 = c.face;
          return { h: c.h, top: c.top, face: function (x, row, y, hh) {
            var fb = hh - row;
            var arch = x >= 2 && x <= 5 && fb <= (x === 2 || x === 5 ? 2 : 3);
            if (y === P.b && arch) return fb === 1 ? 'river' : ((x === 3 || x === 4) && fb === 3 ? 'ink' : (x & 1 ? 'metalD' : 'ink'));
            return face0(x, row, y, hh);
          } };
        }
        if (gy >= 2 && gy <= 5) return { h: c.h, base: 2, top: c.top, face: c.face };
        return c;
      }, Htot);
      if (vert) { var bot = g.h - 1; for (var x = P.a; x <= P.b; x++) if ((x & 1) === 0) { g.set(x, bot - 4, 'metalD'); g.set(x, bot - 3, 'metalD'); } }
      if (m.wire) addWire(g, m, level, mask, Htot);
      return g;
    }
    STYLED.forEach(function (st) {
      for (var lv = 2; lv <= 3; lv++) {
        def('s_wall_' + st + '_' + lv + '_water_h', styledWater(st, lv, false), { group: 'wall' });
        def('s_wall_' + st + '_' + lv + '_water_v', styledWater(st, lv, true), { group: 'wall' });
      }
    });

    // ---------------------------------------------------------------- Tore mit deutlichem Torbogen
    // _h: Mauer verläuft waagrecht, Durchgang Nord–Süd (Bogen in der Front, offene Torflügel).
    // _v: Mauer verläuft senkrecht, Durchgang West–Ost (Torhaus als Brücke, unten frei).
    var PALI = { top: 'woodL', topL: 'woodL', face: 'wood', faceL: 'woodL', joint: 'woodD', base: 'woodD', pat: 'planks', merlon: 0 };
    function gateFace(m, x, row, hh) {
      if (m.pat === 'planks') return row >= hh - 1 ? 'woodD' : ((x & 1) ? 'wood' : 'woodL');
      return matFace(m, x, row, hh, false);
    }
    var PATHC = AC(null, '#c9a26b'), PATHD = AC(null, '#a9834f');
    function gateGeneric(m, st, level, vert) {
      var P = WALL[level], gh = P.h + (m.dh || 0) + 4 + (level === 3 ? 1 : 0), Htot = gh + 6;
      var baseCells = m === PALI ? wallCells(1, vert ? 5 : 10) : wallCellsS(m, level, vert ? 5 : 10);
      var g;
      if (!vert) {
        var front = Math.min(7, P.b + 1), back = Math.max(0, P.a - 1);
        g = extrude(function (gx, gy) {
          if (gx >= 0 && gx < 8 && gy >= back && gy <= front) {
            var pier = gx <= 1 || gx >= 6;
            var hh = gh + (pier ? 1 : 0);
            return {
              h: hh,
              top: function () { return pier ? m.topL : m.top; },
              face: function (x, row, y, h2) {
                var fb = h2 - row; // 1 = unterste Zeile
                if (y === front && x >= 2 && x <= 5) {
                  var archTop = (x === 2 || x === 5) ? 5 : 6;
                  if (fb <= archTop) {
                    if (fb === archTop) return 'ink';
                    if (fb === 1) return PATHC;
                    if (x === 2 || x === 5) return fb <= 4 ? 'woodL' : 'plum';   // offene Torflügel
                    return fb === 2 ? PATHD : (fb >= 5 ? 'ink' : 'plum');
                  }
                  if (fb === archTop + 1 && (x === 3 || x === 4)) return m.faceL;
                }
                if (y === front && x >= 3 && x <= 4 && fb === h2 - 1) return 'T';
                return gateFace(m, x, row, h2);
              }
            };
          }
          return baseCells(gx, gy);
        }, Htot);
      } else {
        var a2 = Math.max(1, P.a - 1), b2 = Math.min(6, P.b + 1);
        g = extrude(function (gx, gy) {
          if (gy >= 0 && gy <= 7 && gx >= a2 && gx <= b2) {
            var open = gy >= 2 && gy <= 5;
            return {
              h: gh, base: open ? 5 : 0,
              top: function (x) { return x === a2 ? m.topL : m.top; },
              face: function (x, row, y, h2) {
                if (open && row === h2 - 5 - 1) return 'ink';
                if (y === 7 && row === 1 && x > a2 && x < b2) return 'T';
                return gateFace(m, x, row, h2);
              }
            };
          }
          return baseCells(gx, gy);
        }, Htot);
        // Schatten und Weg unter der Brücke
        var floor = g.h - 1 - 1;
        for (var yy = 2; yy <= 5; yy++) for (var xx = a2; xx <= b2; xx++) {
          var Y = g.h - 8 + yy;
          if (!g.get(xx, Y)) g.set(xx, Y, yy === 2 ? 'shade' : 'shadeL');
        }
      }
      return g;
    }
    // Faschismus: Kontrollpunkt mit Schlagbaum und Wachhäuschen statt Torbogen
    var BOOM = AC(null, '#e8e4dc');
    function gateCheckpoint(level, vert) {
      var m = MAT.fascism, P = WALL[level], Htot = wallHtot(m, level) + 4;
      var base = wallCellsS(m, level, vert ? 5 : 10);
      var g = extrude(function (gx, gy) {
        var inT = gx >= 0 && gx < 8 && gy >= 0 && gy < 8;
        if (!inT) return base(gx, gy);
        var post = vert ? (gy <= 1 || gy >= 6) : (gx <= 1 || gx >= 6);
        if (post) { var c = base(gx, gy); if (c) c.h += 2; return c; }
        return null;
      }, Htot);
      var groundY = g.h - 8;
      if (!vert) {
        // Schlagbaum quer über den Durchgang, rot-weiß gestreift, 4 px über dem Boden
        var by = groundY + P.b - 4;
        for (var x = 1; x <= 6; x++) { g.set(x, by, (x & 1) ? 'red' : BOOM); g.set(x, by + 1, 'ink'); }
        g.set(1, by - 1, 'ink'); g.set(1, by + 2, 'metalD'); g.set(1, by + 3, 'metalD');
        // Wachhäuschen links hinten mit Lampe
        g.set(1, groundY + P.a - 9, 'fireY');
      } else {
        var bx = Math.floor((P.a + P.b) / 2);
        for (var y = 2; y <= 5; y++) { g.set(bx, groundY + y - 4, (y & 1) ? 'red' : BOOM); g.set(bx + 1, groundY + y - 4, 'ink'); }
        g.set(bx, groundY - 4 + 1, 'ink');
      }
      return g;
    }
    // Torhäuser von Hand komponiert (12 px breit, ragen 2 px über die Mauerarme):
    // _h: großer Rundbogen mit offenen Flügeln und Banner; _v: hoher Block im Norden, offener Weg, niedriger Pfosten im Süden.
    function gateTop(g, m, x0, w, y) {
      if (m === PALI) { for (var x = x0; x < x0 + w; x++) { g.set(x, y - 1, (x & 1) ? 'woodL' : 'wood'); if (!(x & 1)) g.set(x, y - 2, 'woodL'); } return; }
      if (m.merlon) { for (x = x0; x < x0 + w; x += 3) g.rect(x, y - 2, 2, 2, m.cap || m.topL); }
      else if (m.coping) g.hline(x0, y, w, m.coping);
    }
    function gateArt(m, level, vert) {
      var F = level === 1 ? 9 : WALL[level].h + (m.dh || 0) + 4 + (level === 3 ? 1 : 0);
      var g, x, y, fb;
      if (!vert) {
        var D = 6, ts = 3, fs = ts + D, H = fs + F + 1;
        g = new Grid(12, H);
        for (y = ts; y < fs; y++) for (x = 0; x < 12; x++) g.set(x, y, x === 0 ? m.topL : (x === 11 ? m.joint : m.top));
        gateTop(g, m, 0, 12, ts);
        for (y = 0; y < F; y++) for (x = 0; x < 12; x++) g.set(x, fs + y, gateFace(m, x, y, F));
        g.vline(0, fs, F, m.faceL); g.vline(2, fs, F, m.joint); g.vline(9, fs, F, m.joint); g.vline(11, fs, F, m.base);
        var bot = fs + F - 1, AH = { 3: 5, 4: 6, 5: 7, 6: 7, 7: 6, 8: 5 };
        for (x = 3; x <= 8; x++) for (fb = 1; fb <= AH[x]; fb++) {
          var c = fb === AH[x] ? 'ink' : (fb === 1 ? PATHC : (fb === 2 ? PATHD : (fb >= AH[x] - 1 ? 'ink' : 'plum')));
          if ((x === 3 || x === 8) && fb >= 2 && fb < AH[x]) c = x === 3 ? 'woodL' : 'wood';
          g.set(x, bot - fb + 1, c);
        }
        g.set(5, bot - 7, m.faceL); g.set(6, bot - 7, m.faceL);
        if (F >= 10) { g.rect(5, fs + 1, 2, Math.max(1, F - 9), 'T'); g.vline(6, fs + 1, Math.max(1, F - 9), 'Td'); }
        else { g.set(5, fs, 'T'); g.set(6, fs, 'Td'); }
      } else {
        var HV = F + 9;
        g = new Grid(12, HV);
        var G0 = HV - 8; // Bodenzeile von gy = 0
        // hoher Nordblock gy 0..1
        for (var gy = 0; gy <= 1; gy++) for (x = 2; x <= 9; x++) g.set(x, G0 + gy - F, x === 2 ? m.topL : m.top);
        gateTop(g, m, 2, 8, G0 - F);
        for (y = 0; y < F; y++) for (x = 2; x <= 9; x++) g.set(x, G0 + 1 - F + 1 + y, gateFace(m, x - 2, y, F));
        g.vline(2, G0 + 2 - F, F, m.faceL); g.vline(9, G0 + 2 - F, F, m.base);
        g.rect(5, G0 + 3 - F, 2, 3, 'T'); g.vline(6, G0 + 3 - F, 3, 'Td');
        // offener Durchgang gy 2..5: Schatten des Blocks, Weg, aufgeschlagene Flügel
        for (x = 2; x <= 9; x++) { g.set(x, G0 + 2, 'shade'); g.set(x, G0 + 3, PATHC); g.set(x, G0 + 4, PATHD); }
        g.rect(0, G0 - 1, 2, 6, 'woodL'); g.vline(1, G0 - 1, 6, 'wood'); g.set(0, G0, 'metalD'); g.set(0, G0 + 3, 'metalD');
        g.rect(10, G0 + 1, 2, 6, 'wood'); g.vline(11, G0 + 1, 6, 'woodD'); g.set(10, G0 + 2, 'metalD'); g.set(10, G0 + 5, 'metalD');
        for (x = 3; x <= 8; x += 2) g.set(x, G0 + 3, PATHD);
        // niedriger Südpfosten gy 7
        for (x = 2; x <= 9; x++) { g.set(x, G0 + 5, x === 2 ? m.topL : m.top); g.set(x, G0 + 6, gateFace(m, x - 2, 0, 2)); g.set(x, G0 + 7, m.base); }
      }
      return g.pad(1, 1, 1, 1).outline();
    }
    // Faschismus: Kontrollpunkt mit Wachhäuschen und Schlagbaum
    var BOOM = AC(null, '#f0ece4');
    function gateCheckpoint(level, vert) {
      var m = MAT.fascism, g, x, y;
      function block(x0, x1, gy0, gy1, h, G0, win) {
        for (var gy = gy0; gy <= gy1; gy++) for (var xx = x0; xx <= x1; xx++) g.set(xx, G0 + gy - h, xx === x0 ? m.topL : m.top);
        for (y = 0; y < h; y++) for (xx = x0; xx <= x1; xx++) g.set(xx, G0 + gy1 - h + 1 + y, y === h - 1 ? m.base : (xx === x0 ? m.faceL : (xx === x1 ? m.joint : m.face)));
        if (win) { g.hline(x0 + 1, G0 + gy1 - h + 3, x1 - x0 - 1, 'ink'); g.set(x1 - 1, G0 + gy1 - h + 3, 'fireY'); }
      }
      g = new Grid(12, 22);
      var G0 = 22 - 8;
      if (!vert) {
        block(0, 3, 1, 6, 9, G0, true);       // Wachhäuschen links
        block(9, 11, 2, 5, 6, G0, false);     // Pfeiler rechts
        for (x = 4; x <= 8; x++) { var c = (x >> 1) & 1 ? 'red' : BOOM; g.set(x, G0 + 5 - 4, c); g.set(x, G0 + 5 - 3, c); }
        g.hline(4, G0 + 5 - 2, 5, 'ink');
        g.set(2, G0 + 1 - 11, 'fireY'); g.set(1, G0 + 1 - 10, 'metalD'); g.set(2, G0 + 1 - 10, 'metalD');
      } else {
        block(2, 9, 0, 2, 9, G0, true);
        block(3, 8, 6, 7, 4, G0, false);
        for (y = 3; y <= 5; y++) { var c2 = y & 1 ? 'red' : BOOM; g.set(5, G0 + y - 4, c2); g.set(6, G0 + y - 4, c2); g.set(7, G0 + y - 4, 'ink'); }
        g.set(5, G0 + 3 - 5, 'red'); g.set(6, G0 + 3 - 5, 'red');
      }
      return g.pad(1, 1, 1, 1).outline();
    }
    def('s_gate_1_h', gateArt(PALI, 1, false), { group: 'wall' });
    def('s_gate_1_v', gateArt(PALI, 1, true), { group: 'wall' });
    STYLED.forEach(function (st) {
      for (var lv = 2; lv <= 3; lv++) ['h', 'v'].forEach(function (d) {
        var gg = st === 'fascism' ? gateCheckpoint(lv, d === 'v') : gateArt(MAT[st], lv, d === 'v');
        def('s_gate_' + st + '_' + lv + '_' + d, gg, { group: 'wall' });
      });
    });
    for (var glv = 2; glv <= 3; glv++) ['h', 'v'].forEach(function (d) { def('s_gate_' + glv + '_' + d, gateArt(MAT.monarchy, glv, d === 'v'), { group: 'wall' }); });

    // ---------------------------------------------------------------- Türme je Stil
    function towerShaft(m, H, w0, w1) {
      return extrude(function (gx, gy) {
        if (gx < w0 || gx > w1 || gy < w0 || gy > w1) return null;
        return { h: H, top: function () { return m.top; }, face: function (x, row, y, h2) {
          if (y === w1 && (x === 3 || x === 4) && row === 3) return 'ink';
          return matFace(m, x - w0, row, h2, false);
        } };
      }, H + 14);
    }
    function towerS(st, level) {
      var m = MAT[st], H = (level === 2 ? 10 : 13) + (st === 'democracy' ? -2 : 0) + (st === 'fascism' ? 3 : 0);
      var w0 = 1, w1 = 6;
      if (st === 'fascism') { w0 = 2; w1 = 5; }
      var g = towerShaft(m, H, w0, w1);
      var out = new Grid(12, g.h); out.blit(g, 2, 0);
      var top = g.h - 8 - H + w0; // Oberkante vorn (Zeile)
      var cx = 6; // Mitte in out
      function merlons(y, x0, x1, col, cap) { for (var x = x0; x <= x1; x++) { out.set(x, y, col); if (((x - x0) & 1) === 0) out.set(x, y - 1, cap || col); } }
      if (st === 'monarchy') {
        // Kegeldach in Teamfarbe mit Wimpel
        var r = new Grid(12, 12);
        for (var y = 0; y < 9; y++) { var half = 0.5 + y * 0.62; for (var x = 0; x < 12; x++) { var dx = x + 0.5 - 6; if (Math.abs(dx) <= half) r.set(x, y + 1, dx < -1 ? 'Tl' : (dx < 1 ? 'T' : 'Td')); } }
        r.hline(0, 10, 12, 'Td'); for (x = 1; x < 11; x += 2) r.set(x, 10, 'T');
        r = r.pad(0, 1, 0, 1).outline();
        var res = new Grid(12, out.h + 10); res.blit(out, 0, 10); res.blit(r.clone(), 0, top + 10 - 9);
        res.vline(6, top - 1, 3, 'woodD'); res.paint(7, top - 1, ['TT', 'Tt']);
        return res;
      }
      var res2 = new Grid(12, out.h + 8); res2.blit(out, 0, 8);
      var T0 = top + 8;
      if (st === 'democracy') {
        res2.hline(2, T0, 8, m.coping); res2.hline(1, T0 + 1, 10, m.coping); res2.set(1, T0 + 1, 'ink');
        res2.vline(6, T0 - 7, 7, 'woodD'); res2.set(6, T0 - 8, 'gold'); res2.paint(7, T0 - 7, ['TTTu', 'TTTT', 'tttt']);
      } else if (st === 'fascism') {
        // eckige Wachkanzel, breiter als der Schaft, mit Scheinwerfer
        var cab = new Grid(10, 6);
        cab.rect(0, 2, 10, 4, m.face); cab.hline(0, 2, 10, m.topL); cab.hline(1, 4, 8, 'ink'); cab.hline(0, 5, 10, m.base);
        cab.rect(0, 0, 10, 2, m.top); cab.hline(0, 0, 10, m.topL);
        cab.set(8, 3, 'fireY'); cab.set(9, 3, 'goldL');
        cab = cab.pad(1, 1, 1, 1).outline();
        res2.blit(cab, 0, T0 - 4);
        res2.set(11, T0 - 1, 'goldL');
      } else if (st === 'communism') {
        res2.hline(2, T0, 8, m.topL);
        res2.rect(3, T0 + 3, 6, 1, 'T');
        res2.rect(4, T0 - 2, 4, 2, m.face); res2.hline(4, T0 - 2, 4, m.topL);
        res2.set(3, T0 - 2, 'ink'); res2.set(8, T0 - 2, 'ink'); res2.hline(4, T0 - 3, 4, 'ink');
      } else if (st === 'theocracy') {
        var dome = new Grid(10, 7);
        dome.ellipse(5, 5, 4.6, 4.6, function (x, y, nx, ny) { return y > 5 ? null : (nx + ny < -0.4 ? 'goldL' : (nx > 0.3 ? 'goldD' : 'gold')); });
        dome.set(5, 0, 'goldL');
        dome = dome.pad(1, 1, 1, 0).outline();
        res2.blit(dome, 0, T0 - 6);
      } else if (st === 'republic') {
        merlons(T0, 2, 9, m.top, m.cap);
        res2.vline(6, T0 - 8, 8, 'woodD');
        res2.paint(7, T0 - 8, ['Tl', 'lT', 'Tl', 'lT']); res2.paint(9, T0 - 8, ['T', 'l', 'T']);
      }
      return res2;
    }
    STYLED.forEach(function (st) { for (var lv = 2; lv <= 3; lv++) def('s_tower_' + st + '_' + lv, towerS(st, lv), { group: 'wall', ox: -2 }); });
    // Holz-Ausguck des Stammes (zur Palisade)
    (function () {
      var g = new Grid(10, 22);
      g.vline(2, 8, 13, 'woodD'); g.vline(7, 8, 13, 'woodD'); g.line(2, 18, 7, 12, 'wood'); g.line(2, 12, 7, 18, 'wood');
      g.rect(0, 7, 10, 2, 'woodL'); g.hline(0, 8, 10, 'woodD');
      g.rect(1, 4, 8, 3, 'wood'); g.vline(1, 4, 3, 'woodL');
      for (var j = 0; j < 4; j++) g.hline(4 - j, j + 1, 2 + j * 2, j === 0 ? 'strawL' : 'straw');
      g.hline(0, 4, 10, 'strawD');
      g.vline(5, 0, 1, 'woodD'); g.paint(6, 0, ['T']);
      def('s_tower_tribe', g.pad(1, 1, 1, 0).outline(), { group: 'wall', ox: -2 });
    })();

    // Schlüssel-Helfer für den Renderer
    S.wallKey = function (gov, level, mask) {
      level = level | 0; mask = mask & 15;
      if (gov === 'anarchy') return 's_barricade_' + mask;
      if (level <= 1 || gov === 'tribe' || !MAT[gov]) return 's_wall_1_' + mask;
      return 's_wall_' + gov + '_' + Math.min(3, level) + '_' + mask;
    };
    S.waterWallKey = function (gov, level, dir) {
      dir = dir === 'v' ? 'v' : 'h';
      if (level <= 1 || !MAT[gov]) return 's_wall_1_water_' + dir;
      return 's_wall_' + gov + '_' + Math.min(3, level) + '_water_' + dir;
    };
    S.gateKey = function (gov, level, dir) {
      dir = dir === 'v' ? 'v' : 'h';
      if (level <= 1 || !MAT[gov]) return 's_gate_1_' + dir;
      return 's_gate_' + gov + '_' + Math.min(3, level) + '_' + dir;
    };
    S.towerKey = function (gov, level) {
      if (gov === 'anarchy') return null;
      if (gov === 'tribe' || !MAT[gov] || level <= 1) return 's_tower_tribe';
      return 's_tower_' + gov + '_' + Math.min(3, Math.max(2, level | 0));
    };

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
    function defB(key, gr, n, group) { var sg = shadowR(gr, n).pad(0, 0, 0, 1).footShade(); def(key, sg, { group: group || 'build', fw: n, fh: n, ox: 0, oy: n * 8 - sg.h + 1 }); }

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

    // ---------------------------------------------------------------- Hausfamilien je Regierung
    // rustic (Stamm a/b, Anarchie c/d), timber (Monarchie, Theokratie), town (Demokratie,
    // Handelsrepublik), block (Faschismus, Kommunismus); je Stufe 1..3. Alles 2×2.
    // Die alten Schlüssel s_house_<1..3>_<a|b> bleiben als Fachwerk-Häuser erhalten.
    function paint(gr, x, y, w, h, c, cd, cl) {
      gr.rect(x, y, w, h, c); if (cl) gr.vline(x, y, h, cl); if (cd) { gr.vline(x + w - 1, y, h, cd); gr.hline(x, y + h - 1, w, cd); }
    }
    function roofFlat(gr, x, y, w, h, top, edge, light) {
      gr.rect(x, y, w, h, top); gr.hline(x, y, w, light); gr.hline(x, y + h - 1, w, edge); gr.vline(x + w - 1, y, h, edge);
    }
    var PASTEL = [
      [AC(null, '#f6cfae'), AC(null, '#d9a984'), AC(null, '#fde4cc')],
      [AC(null, '#c4e4c9'), AC(null, '#97c29f'), AC(null, '#e0f4e2')],
      [AC(null, '#cad8f4'), AC(null, '#9eb0d8'), AC(null, '#e4ecfc')],
      [AC(null, '#f6e6a4'), AC(null, '#d6c27a'), AC(null, '#fff4c8')],
      [AC(null, '#efc6dc'), AC(null, '#cc9ab6'), AC(null, '#fadfee')]
    ];
    var CONC = [AC(null, '#9b9b9e'), AC(null, '#77777c'), AC(null, '#b2b2b4')];   // Faschismus-Block
    var PANEL = [AC(null, '#d4cfbf'), AC(null, '#a9a491'), AC(null, '#e4e0d4')];  // Plattenbau
    var RF = [AC(null, '#8c8c90'), AC(null, '#6a6a70'), AC(null, '#a6a6a8')];      // Flachdach
    function hname(fam, lv, v) { return 's_house_' + fam + '_' + lv + '_' + v; }

    // ---- rustic a/b: Stroh (Stamm)
    function strawHut(w, wallH, roofH, round) {
      var gr = new Grid(14, roofH + wallH + 3), x0 = Math.floor((14 - w) / 2);
      if (round) {
        for (var j = 0; j < roofH; j++) { var hw = 0.8 + j * (w / 2 + 1) / roofH; for (var i = 0; i < 14; i++) { var dx = i + 0.5 - 7; if (Math.abs(dx) <= hw) gr.set(i, j + 1, dx < -hw * 0.45 ? 'strawL' : (dx > hw * 0.5 ? 'strawD' : ((i * 5 + j * 2) % 7 === 0 ? 'strawD' : 'straw'))); } }
        gr.set(6, 0, 'woodD'); gr.set(7, 0, 'woodD');
      } else roofThatch(gr, x0 - 1, 2, w + 2, roofH);
      var wy = roofH + 2;
      wallPlanks(gr, x0, wy, w, wallH);
      eaveShadow(gr, x0, wy, w, 'woodD');
      return { g: gr, wy: wy, x0: x0 };
    }
    var r;
    r = strawHut(10, 6, 8, false); door(r.g, 6, r.wy + 2, 4, 'T'); win(r.g, 3, r.wy + 2); r.g.paint(11, r.wy + 3, ['.vw', 'vwW']);
    defB(hname('rustic', 1, 'a'), finishB(r.g), 2);
    r = strawHut(10, 6, 10, true); r.g.rect(6, r.wy + 2, 2, 4, 'plum'); r.g.rect(6, r.wy + 2, 2, 2, 'T'); r.g.paint(11, r.wy + 3, ['cY', 'YY']);
    defB(hname('rustic', 1, 'b'), finishB(r.g), 2);
    r = strawHut(12, 7, 10, false); door(r.g, 6, r.wy + 3, 4, 'T'); win(r.g, 2, r.wy + 2); win(r.g, 10, r.wy + 2);
    r.g.line(1, 0, 4, 3, 'woodD'); r.g.line(4, 0, 1, 3, 'woodD'); r.g.line(9, 0, 12, 3, 'woodD'); r.g.line(12, 0, 9, 3, 'woodD');
    defB(hname('rustic', 2, 'a'), finishB(r.g), 2);
    r = strawHut(12, 7, 12, true); r.g.rect(6, r.wy + 3, 2, 4, 'plum'); r.g.rect(6, r.wy + 3, 2, 2, 'T'); win(r.g, 3, r.wy + 2); win(r.g, 10, r.wy + 2);
    r.g.hline(1, r.wy + 6, 12, 'stone'); r.g.vline(1, r.wy, 7, 'stone');
    defB(hname('rustic', 2, 'b'), finishB(r.g), 2);
    // Stufe 3: Langhaus mit Steinsockel bzw. zwei Rundhütten
    g = new Grid(14, 22);
    roofThatch(g, 0, 3, 14, 11);
    g.line(0, 0, 4, 4, 'woodD'); g.line(4, 0, 0, 4, 'woodD'); g.line(9, 0, 13, 4, 'woodD'); g.line(13, 0, 9, 4, 'woodD');
    wallPlanks(g, 1, 14, 12, 8); eaveShadow(g, 1, 14, 12, 'woodD');
    g.hline(1, 20, 12, 'stone'); g.hline(1, 21, 12, 'stoneD');
    door(g, 6, 16, 5, 'T'); win(g, 2, 16); win(g, 10, 16); g.set(6, 13, 'cream'); g.set(7, 13, 'cream');
    defB(hname('rustic', 3, 'a'), finishB(g), 2);
    g = new Grid(14, 21);
    [[0, 4, 8, 9], [6, 0, 8, 12]].forEach(function (h) {
      var x0 = h[0], y0 = h[1], w = h[2], rh = h[3];
      for (var j = 0; j < rh; j++) { var hw = 0.6 + j * (w / 2 + 0.6) / rh; for (var i = 0; i < w + 2; i++) { var dx = i + 0.5 - (w + 2) / 2; if (Math.abs(dx) <= hw) g.set(x0 + i - 1, y0 + j, dx < -hw * 0.4 ? 'strawL' : (dx > hw * 0.5 ? 'strawD' : 'straw')); } }
      wallPlanks(g, x0, y0 + rh, w, 21 - y0 - rh); eaveShadow(g, x0, y0 + rh, w, 'woodD');
    });
    g.rect(2, 17, 2, 4, 'plum'); g.rect(9, 16, 2, 5, 'plum'); g.rect(9, 16, 2, 2, 'T'); win(g, 11, 14);
    defB(hname('rustic', 3, 'b'), finishB(g), 2);

    // ---- rustic c/d: Flickenhütten und Bauwagen (Anarchie)
    var PATCH = ['red', 'purple', 'straw', 'glass', 'pink', 'leafL', 'fireO', 'Tl', 'T'];
    function patchWall(gr, x, y, w, h, seed) {
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var pi = (Math.floor((i + seed) / 3) * 3 + Math.floor((j + (i > w / 2 ? 1 : 0)) / 3) + seed) % 5;
        gr.set(x + i, y + j, ['woodL', 'cream', 'sandL', 'wood', 'woodL'][pi]);
      }
      gr.vline(x + w - 1, y, h, 'woodD'); gr.hline(x, y + h - 1, w, 'woodD');
      gr.set(x + 1 + seed % 3, y + 1, PATCH[seed % PATCH.length]); gr.set(x + w - 3, y + h - 3, PATCH[(seed + 3) % PATCH.length]);
    }
    function patchRoof(gr, x, y, w, h, seed) {
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var c = PATCH[(Math.floor(i / 3) + Math.floor(j / 2) * 2 + seed) % PATCH.length];
        if (j === h - 1) c = 'woodD';
        gr.set(x + i, y + j + Math.floor(i / 6), c);
      }
    }
    function caravan(gr, x, y, w, col, colD, seed) {
      // runder Bauwagen auf Rädern
      gr.rect(x, y + 2, w, 7, col); gr.hline(x + 1, y + 1, w - 2, col); gr.hline(x + 2, y, w - 4, 'woodL');
      gr.hline(x + 1, y + 1, w - 2, 'woodL'); gr.vline(x + w - 1, y + 2, 7, colD); gr.hline(x, y + 8, w, colD);
      gr.rect(x + 2, y + 3, 2, 2, 'glass'); gr.set(x + 2, y + 3, 'white'); gr.rect(x + w - 4, y + 3, 2, 4, 'woodD');
      gr.set(x + 5, y + 6, 'fireY'); gr.set(x + 6, y + 5, 'pink');
      gr.paint(x + 1, y + 9, ['oWo']); gr.paint(x + w - 4, y + 9, ['oWo']);
      gr.vline(x + 3, y - 3, 3, 'metalD'); gr.set(x + 3, y - 4, 'stone');
    }
    g = new Grid(14, 17); patchRoof(g, 1, 4, 12, 5, 1); patchWall(g, 2, 9, 10, 7, 1); g.rect(6, 11, 2, 5, 'woodD'); g.set(3, 3, 'woodD'); g.vline(12, 1, 4, 'stoneD');
    defB(hname('rustic', 1, 'c'), finishB(g), 2);
    g = new Grid(14, 15); caravan(g, 1, 4, 12, 'leafL', 'leaf', 0);
    defB(hname('rustic', 1, 'd'), finishB(g), 2);
    g = new Grid(14, 20); patchRoof(g, 0, 4, 14, 7, 2); patchWall(g, 1, 11, 12, 9, 2); g.rect(6, 14, 2, 6, 'woodD'); win(g, 2, 13); win(g, 10, 13);
    g.paint(0, 1, ['..r.k.p.b.f.']); g.vline(11, 0, 5, 'stoneD');
    defB(hname('rustic', 2, 'c'), finishB(g), 2);
    g = new Grid(14, 17); caravan(g, 0, 6, 13, 'pink', 'redD', 1); g.paint(9, 2, ['.ff', 'fef', '.W.']);
    defB(hname('rustic', 2, 'd'), finishB(g), 2);
    g = new Grid(14, 25); patchRoof(g, 1, 2, 12, 5, 3); patchWall(g, 2, 7, 10, 7, 4); patchRoof(g, 0, 12, 14, 3, 5); patchWall(g, 1, 15, 12, 10, 3);
    win(g, 4, 9); g.rect(6, 19, 2, 6, 'woodD'); win(g, 2, 17); win(g, 10, 17); g.line(12, 15, 13, 24, 'woodD');
    defB(hname('rustic', 3, 'c'), finishB(g), 2);
    g = new Grid(14, 24); caravan(g, 0, 13, 13, 'glass', 'waterD', 2); caravan(g, 1, 2, 11, 'fireY', 'gold', 3); g.vline(12, 10, 3, 'woodD');
    defB(hname('rustic', 3, 'd'), finishB(g), 2);

    // ---- timber: Fachwerk mit Teamdach (Monarchie, Theokratie)
    g = new Grid(14, 19); roofSide(g, 1, 3, 12, 9, TR, 3); chimney(g, 9, 0, 4); roofSide(g, 1, 3, 12, 9, TR, 3);
    wallPlaster(g, 2, 12, 10, 7); eaveShadow(g, 2, 12, 10, 'woodD'); door(g, 6, 14, 5); win(g, 3, 14);
    defB(hname('timber', 1, 'a'), finishB(g), 2);
    g = new Grid(14, 19); roofFront(g, 2, 2, 10, 11, TR, 5, function (x, y) { return (x === 7 || y === 12) ? 'woodD' : 'cream'; });
    g.set(6, 10, 'glass'); g.set(7, 10, 'glass');
    wallPlaster(g, 2, 13, 10, 6); eaveShadow(g, 2, 13, 10, 'woodD'); door(g, 6, 14, 5); win(g, 3, 14); win(g, 9, 14);
    defB(hname('timber', 1, 'b'), finishB(g), 2);
    // Stufe 2 und 3 = die bisherigen Häuser
    ['2_a', '2_b', '3_a', '3_b'].forEach(function (k) { var d = L.DEFS['s_house_' + k]; def('s_house_timber_' + k, d.grid, { group: 'build', fw: 2, fh: 2, ox: 0, oy: d.oy }); });
    ['1_a', '1_b'].forEach(function (k) { var d = L.DEFS['s_house_timber_' + k]; def('s_house_' + k, d.grid, { group: 'build', fw: 2, fh: 2, ox: 0, oy: d.oy }); });

    // ---- town: bunte Bürgerhäuser (a) und Giebelhäuser (b) (Demokratie, Handelsrepublik)
    function townA(lv) {
      var P = PASTEL[[0, 1, 2][lv - 1]], stories = lv, wallH = 2 + stories * 5, gr = new Grid(14, 12 + wallH);
      roofSide(gr, 0, 2, 14, 10, TR, 3);
      if (lv >= 2) chimney(gr, 2, 0, 5);
      if (lv === 3) { gr.set(9, 4, 'glass'); gr.set(10, 4, 'glass'); gr.hline(8, 3, 4, 'Td'); }
      paint(gr, 1, 12, 12, wallH, P[0], P[1], P[2]);
      eaveShadow(gr, 1, 12, 12, P[1]);
      for (var s = 0; s < stories; s++) {
        var wy = 13 + s * 5;
        if (s === stories - 1) { door(gr, 6, wy + 1, 5, 'woodD'); win(gr, 2, wy + 1); win(gr, 10, wy + 1); gr.hline(5, wy, 4, 'T'); }
        else { win(gr, 2, wy + 1); win(gr, 6, wy + 1); win(gr, 10, wy + 1); gr.hline(1, wy + 4, 12, P[2]); }
      }
      return gr;
    }
    function townB(lv) {
      // schmales hohes Giebelhaus aus Backstein mit Treppengiebel
      var stories = lv + 1, bodyH = stories * 5, gr = new Grid(14, bodyH + 10);
      var cols = lv === 2 ? ['redL', 'red', 'redD', 'redD'] : [PASTEL[3][2], PASTEL[3][0], PASTEL[3][1], PASTEL[3][1]];
      if (lv === 3) cols = ['redL', 'red', 'redD', 'redD'];
      for (var j = 0; j < 10; j++) {
        var inset = Math.max(0, Math.floor((9 - j) / 2) * 1);
        for (var i = 1 + inset; i < 13 - inset; i++) gr.set(i, j, i === 1 + inset ? cols[0] : (i === 12 - inset ? cols[2] : cols[1]));
        if ((j & 1) === 0 && inset > 0) { gr.set(1 + inset, j, 'stoneL'); gr.set(12 - inset, j, 'stoneL'); }
      }
      gr.rect(6, 3, 2, 2, 'glass'); gr.set(6, 3, 'white'); gr.hline(5, 2, 4, 'T');
      wallBrick(gr, 1, 10, 12, bodyH, cols, 0);
      for (var s = 0; s < stories; s++) {
        var wy = 11 + s * 5;
        if (s === stories - 1) { door(gr, 6, wy, 5, 'T'); win(gr, 2, wy); win(gr, 10, wy); }
        else { win(gr, 2, wy, 2, 3); win(gr, 6, wy, 2, 3); win(gr, 10, wy, 2, 3); }
      }
      return gr;
    }
    // Stufe 1: kleine Varianten
    g = new Grid(14, 18); roofSide(g, 1, 2, 12, 9, TR, 3); paint(g, 2, 11, 10, 7, PASTEL[4][0], PASTEL[4][1], PASTEL[4][2]); eaveShadow(g, 2, 11, 10, PASTEL[4][1]);
    door(g, 6, 13, 5, 'woodD'); win(g, 3, 13); win(g, 9, 13); g.paint(12, 15, ['e', 'E']);
    defB(hname('town', 1, 'a'), finishB(g), 2);
    g = new Grid(14, 20);
    roofFront(g, 3, 1, 8, 11, TR, 6, function (x, y) { return PASTEL[3][0]; });
    g.set(6, 8, 'glass'); g.set(7, 8, 'glass');
    paint(g, 3, 12, 8, 8, PASTEL[3][0], PASTEL[3][1], PASTEL[3][2]); eaveShadow(g, 3, 12, 8, PASTEL[3][1]);
    door(g, 6, 15, 5, 'T'); win(g, 4, 13);
    defB(hname('town', 1, 'b'), finishB(g), 2);
    defB(hname('town', 2, 'a'), finishB(townA(2)), 2);
    defB(hname('town', 2, 'b'), finishB(townB(2)), 2);
    defB(hname('town', 3, 'a'), finishB(townA(3)), 2);
    defB(hname('town', 3, 'b'), finishB(townB(3)), 2);

    // ---- block: einheitliche Blöcke (a, Faschismus) und Plattenbauten (b, Kommunismus)
    function blockA(lv) {
      var stories = lv, wallH = 2 + stories * 5, gr = new Grid(14, 9 + wallH);
      roofFlat(gr, 0, 2, 14, 7, RF[0], RF[1], RF[2]);
      gr.rect(3, 4, 2, 2, RF[1]); gr.set(10, 5, RF[1]);
      paint(gr, 0, 9, 14, wallH, CONC[0], CONC[1], CONC[2]);
      gr.hline(0, 9, 14, CONC[1]);
      for (var s = 0; s < stories; s++) {
        var wy = 10 + s * 5;
        for (var x = 2; x < 12; x += 3) { gr.vline(x, wy + 1, 3, 'ink'); }
        if (s === stories - 1) { gr.rect(6, wy + 1, 2, 5, 'ink'); gr.vline(6, wy + 1, 5, 'metalD'); }
      }
      gr.rect(12, 10, 1, 4, 'T'); gr.set(12, 14, 'Td');
      return gr;
    }
    function blockB(lv) {
      var stories = lv + 1, wallH = 1 + stories * 4, gr = new Grid(14, 8 + wallH);
      roofFlat(gr, 0, 2, 14, 6, RF[2], RF[1], 'white');
      gr.rect(2, 3, 3, 2, RF[0]);
      paint(gr, 0, 8, 14, wallH, PANEL[0], PANEL[1], PANEL[2]);
      for (var s = 0; s < stories; s++) {
        var wy = 8 + s * 4;
        gr.hline(0, wy, 14, PANEL[1]);
        for (var x = 1; x < 13; x += 3) { gr.rect(x + 1, wy + 1, 2, 2, 'glass'); gr.set(x + 1, wy + 2, 'waterD'); }
        gr.vline(0, wy, 4, PANEL[2]);
      }
      gr.rect(6, 8 + wallH - 4, 2, 3, 'woodD');
      gr.rect(3, 8 + wallH - 4, 1, 3, 'T');
      return gr;
    }
    g = new Grid(14, 15); roofFlat(g, 1, 2, 12, 5, RF[0], RF[1], RF[2]); paint(g, 1, 7, 12, 8, CONC[0], CONC[1], CONC[2]); g.hline(1, 7, 12, CONC[1]);
    g.vline(3, 9, 3, 'ink'); g.vline(10, 9, 3, 'ink'); g.rect(6, 10, 2, 4, 'ink'); g.rect(1, 2, 12, 1, RF[2]); g.set(11, 8, 'T'); g.set(11, 9, 'T');
    defB(hname('block', 1, 'a'), finishB(g), 2);
    g = new Grid(14, 15); roofFlat(g, 1, 2, 12, 5, RF[2], RF[1], 'white'); paint(g, 1, 7, 12, 8, PANEL[0], PANEL[1], PANEL[2]); g.hline(1, 7, 12, PANEL[1]); g.hline(1, 11, 12, PANEL[1]);
    g.rect(3, 8, 2, 2, 'glass'); g.rect(9, 8, 2, 2, 'glass'); g.rect(6, 11, 2, 3, 'woodD'); g.rect(3, 12, 2, 1, 'T');
    defB(hname('block', 1, 'b'), finishB(g), 2);
    defB(hname('block', 2, 'a'), finishB(blockA(2)), 2);
    defB(hname('block', 2, 'b'), finishB(blockB(2)), 2);
    defB(hname('block', 3, 'a'), finishB(blockA(3)), 2);
    defB(hname('block', 3, 'b'), finishB(blockB(3)), 2);

    var HOUSE_FAM = { tribe: ['rustic', 'a', 'b'], anarchy: ['rustic', 'c', 'd'], monarchy: ['timber', 'a', 'b'], theocracy: ['timber', 'b', 'a'],
      democracy: ['town', 'a', 'b'], republic: ['town', 'b', 'a'], fascism: ['block', 'a', 'a'], communism: ['block', 'b', 'b'] };
    // gov + Stufe (1..3) + beliebige Ganzzahl -> Sprite-Schlüssel
    S.houseKey = function (gov, level, variant) {
      var f = HOUSE_FAM[gov] || HOUSE_FAM.monarchy, lv = Math.max(1, Math.min(3, level | 0));
      var v = ((variant | 0) & 3) === 3 ? f[2] : f[1];
      return 's_house_' + f[0] + '_' + lv + '_' + v;
    };


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
    // Faschismus: Kommandantur – breiter, symmetrischer Betonklotz, Mittelrisalit, riesige Banner
    // mit abstraktem Muster (Teamfarbe, heller Mittelstreifen, dunkle Querbalken), Scheinwerfer auf dem Dach.
    CENTER.fascism = center(32, function (g, H) {
      var Cc = [CONC[2], CONC[0], CONC[1]];
      roofFlat(g, 0, 4, 22, 5, RF[0], RF[1], RF[2]);
      roofFlat(g, 6, 1, 10, 4, RF[0], RF[1], RF[2]);           // erhöhter Mittelteil
      g.set(1, 3, 'fireY'); g.set(2, 3, 'metalD'); g.set(20, 3, 'fireY'); g.set(19, 3, 'metalD');
      paint(g, 0, 9, 22, 21, Cc[1], Cc[2], Cc[0]);
      paint(g, 6, 5, 10, 25, Cc[0], Cc[2], 'white');            // Mittelrisalit, heller
      g.hline(0, 9, 22, Cc[2]);
      for (var x = 2; x < 6; x += 2) for (var y = 11; y < 27; y += 5) g.vline(x, y, 3, 'ink');
      for (x = 17; x < 21; x += 2) for (y = 11; y < 27; y += 5) g.vline(x, y, 3, 'ink');
      // zwei riesige Banner am Risalit
      [7, 13].forEach(function (bx) {
        g.rect(bx, 6, 2, 17, 'T'); g.vline(bx + 1, 6, 17, 'Td');
        g.vline(bx, 8, 13, 'Tl');
        g.hline(bx, 10, 2, 'ink'); g.hline(bx, 18, 2, 'ink');
        g.set(bx, 23, 'T'); g.set(bx + 1, 22, 'Td');
      });
      // Portal mit Stufen
      g.rect(10, 22, 2, 8, 'ink'); g.hline(9, 21, 4, Cc[2]);
      g.hline(5, 30, 12, Cc[0]); g.hline(4, 31, 14, Cc[2]);
    });

    // Kommunismus: Volkshaus – breiter Saalbau mit Fensterbändern, hoher Schornstein, Fahne auf dem Dach
    CENTER.communism = center(36, function (g, H) {
      // Schornstein mit Rauch
      g.rect(1, 3, 3, 30, 'red'); g.vline(1, 3, 30, 'redL'); g.vline(3, 3, 30, 'redD');
      for (var y = 5; y < 33; y += 3) g.hline(1, y, 3, 'redD');
      g.hline(0, 3, 5, 'stoneD');
      g.paint(0, 0, ['.qq.', 'qggq', '.gq.']);
      // Saalbau
      roofSide(g, 4, 10, 18, 7, ['stoneL', 'stone', 'stoneD'], 2);
      paint(g, 4, 17, 18, 16, PANEL[0], PANEL[1], PANEL[2]);
      g.rect(4, 17, 18, 2, 'T'); g.hline(4, 18, 18, 'Td');
      for (var x = 5; x < 21; x++) {
        var c = (x % 4 === 0) ? PANEL[1] : 'glass';
        g.set(x, 21, c); g.set(x, 22, c === 'glass' ? 'waterD' : c);
        g.set(x, 26, c); g.set(x, 27, c === 'glass' ? 'waterD' : c);
      }
      g.rect(11, 29, 4, 4, 'woodD'); g.vline(12, 29, 4, 'wood'); g.hline(10, 28, 6, PANEL[1]);
      // Fahne auf dem Dachfirst
      g.vline(16, 1, 10, 'woodD'); g.set(16, 0, 'gold');
      g.paint(17, 1, ['TTTTu', 'TTTTT', 'TTTTt', 'tttt.']);
      g.hline(4, 33, 18, PANEL[1]); g.hline(4, 34, 18, 'stone');
    });

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
    MON.tribe = monument(function (g) { // Hinkelstein mit Ritzmuster
      g.paint(2, 3, [
        '..qqg.',
        '.qqggG',
        '.qgggG',
        'qqgrgG',
        'qggrgG',
        'qgrrrG',
        'qggrgG',
        'qgggGG',
        'qgggGG',
        'qggrGG',
        'qgrgGG',
        'qgggGG',
        'qggGGG',
        '.gGGG.']);
      g.paint(0, 16, ['.hhhhhhhh.', 'hhhhhhhhhh']);
      g.set(1, 15, 'leaf'); g.set(8, 15, 'leafL');
    });
    MON.monarchy = monument(function (g) { // Königsstatue mit Krone und Zepter auf Sockel
      g.paint(2, 0, [
        '.k.k.k',
        '.kkkkk',
        '..qqg.',
        '..qqG.',
        '.TqgTt',
        'qTTTTtk',
        'qTTTTtk',
        '.TTTTtK',
        '.TTTtt.',
        '.Tt.tt.']);
      plinth(g, 10); g.rect(1, 14, 8, 2, 'stone'); g.hline(1, 14, 8, 'stoneL'); g.vline(8, 14, 2, 'stoneD');
      g.hline(3, 12, 4, 'gold');
    });
    MON.democracy = monument(function (g) { // Rednerpult mit Wahlurne
      g.paint(0, 4, [
        '......lll.',
        '...vv.lcl.',
        '..vwwW.l..',
        '..wTTW.WW.',
        '..wTlW.TTt',
        '..wTTWvTlt',
        '..wwwWvTTt',
        '..wwwWvwwW',
        '..wwwWvwwW']);
      g.paint(1, 13, ['TtTtTtTt']);
      plinth(g, 14);
      g.vline(0, 0, 8, 'woodD'); g.paint(1, 0, ['TTu', 'TTT']);
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
    MON.republic = monument(function (g) { // Goldene Waage
      g.paint(0, 1, [
        '....jk....',
        '....kK....',
        'jkkkkkkkkK',
        '.j..kK..K.',
        '.j..kK..K.',
        'j.k.kK.K.K',
        'kkK.kK.kKK',
        '.KK.kK.KK.',
        '....kK....',
        '....kK....',
        '...kkKK...']);
      g.set(1, 7, 'gold'); g.set(8, 7, 'goldD');
      plinth(g, 12); g.rect(1, 16, 8, 2, 'stone'); g.hline(1, 16, 8, 'stoneL');
    });
    MON.anarchy = monument(function (g) { // bunt bemalte Wand
      var cols = ['pink', 'fireY', 'glass', 'leafL', 'purple', 'red', 'Tl', 'T'];
      g.rect(0, 5, 10, 13, 'cream'); g.vline(9, 5, 13, 'sandD'); g.hline(0, 17, 10, 'stoneD');
      for (var y = 6; y < 17; y++) for (var x = 0; x < 9; x++) {
        var k = Math.floor((x + Math.sin(y * 0.9) * 2 + 9) / 2.5) + Math.floor(y / 4);
        if ((x * 3 + y * 5) % 7 < 4) g.set(x, y, cols[k % cols.length]);
      }
      g.paint(2, 8, ['ll.', 'lol', 'lll']);
      g.paint(6, 12, ['oo', 'oo']);
      g.hline(0, 4, 10, 'stone'); g.set(3, 3, 'fireO'); g.set(7, 2, 'fireY');
      g.paint(0, 18, ['..W..W..W.']);
    });
    GOVS.forEach(function (gv) { var mg = MON[gv].pad(0, 0, 1, 1).footShade(); def('s_monument_' + gv, mg, { group: 'monument', oy: 8 - mg.h + 1 }); });

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
    // ======================================================================
    // Stufe 3: Orte in der Wildnis (ohne Stadt, ohne Teamfarbe), neutrale Spielermauer, Holz-Ausguck
    var RKT = [AC(null, '#c9c6cf'), AC(null, '#9d9aa8'), AC(null, '#77748a')];
    function rockMound(gr, cx, cy, rx, ry, t, seed) {
      gr.ellipse(cx, cy, rx, ry, function (x, y, nx, ny) {
        var s2 = nx * 0.8 + ny + (hash(x, y, seed) - 0.5) * 0.5;
        return s2 < -0.6 ? t[0] : (s2 > 0.5 ? t[2] : t[1]);
      });
    }
    function cave(gr, cx, by, w, h) {
      gr.ellipse(cx, by, w / 2, h, function (x, y, nx, ny) { return y >= by ? null : (ny < -0.6 ? 'ink' : 'plum'); });
      gr.hline(Math.round(cx - w / 2 + 1), by - 1, w - 2, 'ink');
    }
    function bones(gr, x, y) { gr.set(x, y, 'white'); gr.set(x + 1, y + 1, 'cream'); gr.set(x + 2, y, 'white'); }
    // Wolfsbau 2×2: niedriger Felshügel mit Höhle, Knochen
    g = new Grid(14, 13);
    rockMound(g, 7, 8, 6.8, 5, RKT, 501); g.set(3, 4, 'leaf'); g.set(4, 3, 'leafL'); g.set(10, 4, 'leaf');
    cave(g, 7, 12, 6, 4);
    bones(g, 1, 11); bones(g, 10, 11);
    defB('s_lair_wolfden', finishB(g), 2, 'lair');
    // Bärenhöhle 2×2: größerer Felsen mit Moos und dunkler Höhle
    g = new Grid(14, 18);
    rockMound(g, 7, 10, 7, 8, RKT, 502);
    g.paint(2, 2, ['.ff..', 'feeEf', '.EeE.']); g.paint(9, 4, ['fe', 'eE']);
    cave(g, 7, 17, 7, 6);
    g.paint(11, 15, ['wW', 'Ww']); bones(g, 2, 16);
    defB('s_lair_bearcave', finishB(g), 2, 'lair');
    // Drachenhort 3×3: Felsbogen, Goldhaufen, Knochen
    g = new Grid(22, 26);
    rockMound(g, 11, 12, 11, 11, RKT, 503);
    cave(g, 11, 22, 14, 11);
    g.ellipse(11, 22, 8, 4, function (x, y, nx, ny) { var h = hash(x, y, 504); return y > 23 ? null : (h < 0.2 ? 'goldL' : (h < 0.7 ? 'gold' : 'goldD')); });
    g.paint(4, 21, ['kjk', 'KkK']); g.paint(15, 21, ['jkk.', 'kKkK']);
    g.paint(6, 18, ['.r.', 'rbr', '.r.']);                                              // Edelstein
    g.paint(13, 17, ['kKkK', 'KoKo', 'kkkK']);                                          // Truhe
    bones(g, 1, 24); bones(g, 18, 24); g.paint(9, 23, ['lll', 'lol']);                   // Knochen, Schädel
    g.set(5, 4, 'ink'); g.set(16, 3, 'ink'); g.line(4, 2, 2, 0, 'stoneD'); g.line(17, 2, 19, 0, 'stoneD');
    defB('s_lair_dragonhoard', finishB(g), 3, 'lair');
    // Räuberlager 2×2: zwei Zelte, Lagerfeuer, Kiste
    g = new Grid(14, 15);
    function tent(x, y, w, h, a, b) { for (var j = 0; j < h; j++) { var hw = 0.5 + j * (w / 2) / h; for (var i = 0; i < w; i++) { var dx = i + 0.5 - w / 2; if (Math.abs(dx) <= hw) g.set(x + i, y + j, dx < 0 ? a : b); } } g.vline(x + Math.floor(w / 2), y + h - 3, 3, 'ink'); }
    tent(0, 1, 8, 8, 'dusk', 'plum'); tent(7, 3, 7, 7, 'wood', 'woodD');
    g.paint(4, 10, ['..j..', '.jFQ.', 'QFjFQ', 'gWQWg']);
    g.paint(10, 11, ['vwW', 'wWW']);
    defB('s_lair_banditcamp', finishB(g), 2, 'lair');
    // Verfallene Ruine mit Truhe 2×2
    g = new Grid(14, 18);
    g.rect(1, 3, 3, 13, 'stone'); g.vline(1, 3, 13, 'stoneL'); g.vline(3, 3, 13, 'stoneD'); g.hline(0, 2, 5, 'stoneL');
    g.rect(10, 7, 3, 9, 'stone'); g.vline(10, 7, 9, 'stoneL'); g.vline(12, 7, 9, 'stoneD'); g.set(10, 6, 'stone');
    g.hline(1, 15, 12, 'stoneD'); g.paint(4, 14, ['qg.qg', 'gGqgG']);
    g.paint(5, 10, ['.kkkk.', 'kKKKKk', 'kkokkk', 'KKKKKK']);
    g.paint(1, 6, ['e', 'E']); g.paint(11, 9, ['f', 'e', 'E']);
    defB('s_lair_treasure', finishB(g), 2, 'lair');
    // Erzbrocken und Goldader 1×1
    function oreRock(speck, speck2, key) {
      var o = new Grid(8, 8);
      rockMound(o, 4, 4.5, 3.8, 3.2, RKT, key.length);
      [[2, 3], [5, 4], [3, 6], [6, 2]].forEach(function (p, i) { o.set(p[0], p[1], i & 1 ? speck2 : speck); });
      def(key, o.pad(1, 1, 1, 0).outline().pad(0, 0, 0, 1).footShade(), { group: 'lair' });
    }
    oreRock(AC(null, '#b0603a'), AC(null, '#3a3040'), 's_lair_ore');
    oreRock('goldL', 'gold', 's_lair_goldvein');
    var gv2 = L.DEFS.s_lair_goldvein.grid; gv2.set(4, 3, 'gold'); gv2.set(5, 3, 'goldL'); gv2.set(3, 5, 'gold');

    // Holz-Ausguck (Stamm/Palisade) unter neuem Namen
    def('s_tower_1', L.DEFS.s_tower_tribe.grid, { group: 'wall', ox: -2 });
    // Neutrale Spielermauer (Werkzeug „Mauer malen"): schlichter heller Stein ohne Zinnen
    MAT.player = { top: AC(null, '#bdb8b0'), topL: AC(null, '#d6d2ca'), face: AC(null, '#aaa59c'), faceL: AC(null, '#c6c2ba'), joint: AC(null, '#8a857c'), base: AC(null, '#76716a'), pat: 'ashlar', merlon: 0 };
    for (var pmk = 0; pmk < 16; pmk++) def('s_wall_player_' + pmk, styledWall('player', 2, pmk), { group: 'wall' });
    // ======================================================================
    // Vom Lager zur Stadt: Lager, Dorfhalle, Zelte, Gerüste, viele Hausvarianten, Stadt-Deko
    function roofHip(gr, x, y, w, h, t, back) {
      roofSide(gr, x, y, w, h, t, back);
      var k = Math.min(Math.floor(w / 3), h - 2);
      for (var j = 0; j < k; j++) {
        var ins = k - j;
        for (var i = 0; i < ins; i++) { clr(gr, x + i, y + j); clr(gr, x + w - 1 - i, y + j); }
        gr.set(x + ins, y + j, t[0]); gr.set(x + w - 1 - ins, y + j, t[2]);
      }
    }
    function roofShed(gr, x, y, w, h, t) {   // Pultdach, hohe Seite links
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        if (j < Math.floor(i * (h - 3) / w)) continue;
        gr.set(x + i, y + j, j === h - 1 ? t[2] : ((j % 3 === 2) ? t[2] : (i === 0 ? t[0] : t[1])));
      }
    }
    function wallOf(kind, gr, x, y, w, h, col, seed) {
      if (kind === 'planks') wallPlanks(gr, x, y, w, h);
      else if (kind === 'plaster') wallPlaster(gr, x, y, w, h);
      else if (kind === 'brick') wallBrick(gr, x, y, w, h, col, 0);
      else if (kind === 'stone') wallBrick(gr, x, y, w, h, null, 1);
      else if (kind === 'patch') patchWall(gr, x, y, w, h, seed || 1);
      else paint(gr, x, y, w, h, col[0], col[1], col[2]);
    }
    // Generischer Hausbau: o = { x, w, stories, wall, col, roof, rt, roofH, chimney, annex, tower, shop, balcony, barn, dormer, seed }
    function genHouse(o) {
      var stories = o.stories || 1, sh = o.storyH || 5, wallH = 2 + stories * sh, roofH = o.roofH || 9;
      var x = o.x == null ? 1 : o.x, w = o.w || 12, top = o.tower ? 9 : 3;
      var H = top + roofH + wallH, gr = new Grid(14, H), wy = top + roofH, rt = o.rt || TR;
      if (o.chimney != null) chimney(gr, x + o.chimney, top - 3, 5);
      if (o.roof === 'side') roofSide(gr, x - 1, top, w + 2, roofH, rt, 3);
      else if (o.roof === 'hip') roofHip(gr, x - 1, top, w + 2, roofH, rt, 3);
      else if (o.roof === 'front') roofFront(gr, x - 1, top, w + 2, roofH, rt, Math.min(6, roofH - 2), function (px, py) { return o.wall === 'plaster' ? ((px === x + Math.floor(w / 2) || py % 3 === 0) ? 'woodD' : 'cream') : (o.wall === 'planks' ? 'woodL' : o.col[0]); });
      else if (o.roof === 'thatch') roofThatch(gr, x - 1, top, w + 2, roofH);
      else if (o.roof === 'shed') roofShed(gr, x - 1, top, w + 2, roofH, rt);
      else if (o.roof === 'flat') { roofFlat(gr, x, top + roofH - 5, w, 5, RF[0], RF[1], RF[2]); if (o.vent) gr.rect(x + 2, top + roofH - 4, 2, 2, RF[1]); }
      else if (o.roof === 'patch') patchRoof(gr, x - 1, top + 1, w + 2, roofH - 1, o.seed || 2);
      wallOf(o.wall, gr, x, wy, w, wallH, o.col, o.seed);
      eaveShadow(gr, x, wy, w, o.wall === 'planks' || o.wall === 'plaster' || o.wall === 'patch' ? 'woodD' : (o.col ? o.col[1] : 'stoneD'));
      // Fenster je Geschoss, Tür unten
      for (var s2 = 0; s2 < stories; s2++) {
        var yy = wy + 2 + s2 * sh;
        var last = s2 === stories - 1;
        for (var k = x + 1; k < x + w - 2; k += o.winStep || 4) {
          if (last && Math.abs(k - (x + Math.floor(w / 2) - 1)) < 2) continue;
          if (o.wall === 'concrete') gr.vline(k + 1, yy, 3, 'ink'); else win(gr, k, yy);
          if (o.balcony && !last) { gr.hline(k - 1, yy + 3, 4, 'metalD'); gr.set(k - 1, yy + 2, 'metalD'); }
        }
      }
      var dx = x + Math.floor(w / 2) - 1;
      if (o.barn) { gr.rect(dx - 1, wy + wallH - 6, 4, 6, 'woodD'); gr.line(dx - 1, wy + wallH - 6, dx + 2, wy + wallH - 1, 'wood'); gr.line(dx + 2, wy + wallH - 6, dx - 1, wy + wallH - 1, 'wood'); }
      else door(gr, dx, wy + wallH - 5, 5, o.doorCol);
      if (o.shop) { gr.hline(x, wy + wallH - 7, w, 'T'); for (var q = x; q < x + w; q += 2) gr.set(q, wy + wallH - 7, 'white'); gr.hline(x, wy + wallH - 6, w, 'Td'); }
      if (o.annex) {   // niedriger Anbau mit Pultdach auf der freien Seite
        var ax = o.annex > 0 ? x + w : 0, aw = o.annex > 0 ? 14 - (x + w) : x;
        if (aw >= 3) { roofShed(gr, ax, H - 9, aw, 4, o.annexRoof || WOODR); wallPlanks(gr, ax, H - 5, aw, 5); gr.set(ax + Math.floor(aw / 2), H - 3, 'plum'); gr.set(ax + Math.floor(aw / 2), H - 2, 'plum'); }
      }
      if (o.tower) {   // schmaler Turm mit Spitzdach am Rand
        var tx = o.tower > 0 ? 9 : 0;
        for (var j = 0; j < 8; j++) { var hw = 0.5 + j * 0.42; for (var i = 0; i < 5; i++) { var ddx = i - 2; if (Math.abs(ddx) <= hw) gr.set(tx + i, j, ddx < 0 ? rt[0] : (ddx === 0 ? rt[1] : rt[2])); } }
        gr.hline(tx, 8, 5, rt[2]);
        wallOf(o.wall === 'concrete' || o.wall === 'panel' ? 'stone' : (o.wall === 'paint' ? 'stone' : o.wall), gr, tx, 9, 5, H - 9, o.col, o.seed);
        gr.set(tx + 2, 11, 'glass'); gr.set(tx + 2, 12, 'waterD');
      }
      if (o.dormer) { var dd = x + Math.floor(w / 2) - 1; gr.rect(dd, top + 2, 3, 2, 'glass'); gr.hline(dd - 1, top + 1, 5, rt[2]); gr.set(dd, top + 2, 'white'); }
      return gr;
    }
    function P(i) { return PASTEL[i % PASTEL.length]; }
    var BRK = ['redL', 'red', 'redD', 'redD'];
    // Variantentabellen: je Familie Funktion(level) -> Liste von Hausbeschreibungen (Schlüssel ab a)
    var VAR = {
      rustic: function (lv) { var R = lv + 7; return [
        null, null, null, null,    // a/b Stroh, c/d Flicken (vorhanden)
        { roof: 'thatch', wall: 'planks', x: 1, w: 8, roofH: R, annex: 1, annexRoof: THATCH },                        // e: Hütte mit Anbau
        { roof: 'thatch', wall: 'stone', x: 2, w: 10, roofH: R + 1, chimney: 7, stories: lv >= 3 ? 2 : 1 },          // f: Steinkate
        { roof: 'patch', wall: 'patch', x: 3, w: 9, roofH: 6, annex: -1, seed: lv + 3 },                               // g: Flickenhaus mit Verschlag
        { roof: 'shed', wall: 'patch', x: 1, w: 12, roofH: 7, rt: ['pink', 'purple', 'plum'], seed: lv + 5, stories: lv >= 2 ? 2 : 1 } // h: Pultdach-Kommune
      ]; },
      timber: function (lv) { var st = lv >= 3 ? 2 : 1; return [
        null, null,
        { roof: 'hip', wall: 'plaster', x: 1, w: 12, roofH: 9, chimney: 9, stories: st },                             // c: Walmdach
        { roof: 'side', wall: 'plaster', x: 1, w: 9, roofH: 9, annex: 1, stories: st, dormer: lv >= 2 },              // d: mit Anbau
        { roof: 'front', wall: 'plaster', x: 3, w: 10, roofH: 10, tower: -1, stories: st },                           // e: Turmhaus
        { roof: 'side', wall: 'planks', x: 1, w: 12, roofH: 8, barn: true, rt: WOODR, chimney: 2, stories: 1 }        // f: Scheune/Werkstatt
      ]; },
      town: function (lv) { var st = lv; return [
        null, null,
        { roof: 'hip', wall: 'paint', col: P(1), x: 1, w: 12, roofH: 8, stories: st, dormer: lv >= 2 },              // c: Walmdach-Bürgerhaus
        { roof: 'front', wall: 'paint', col: P(4), x: 2, w: 10, roofH: 10, stories: st, shop: true },                // d: Giebelhaus mit Laden
        { roof: 'side', wall: 'brick', col: BRK, x: 1, w: 9, roofH: 8, stories: st, annex: 1, chimney: 2 },          // e: Backstein mit Anbau
        { roof: 'front', wall: 'paint', col: P(2), x: 4, w: 9, roofH: 10, stories: st, tower: -1 }                   // f: Eckturmhaus
      ]; },
      block: function (lv) { var st = lv + 1; return [
        null, null,
        { roof: 'flat', wall: 'concrete', col: CONC, x: 2, w: 10, roofH: 5, stories: st, storyH: 4, vent: 1 },        // c: schmaler Block (grau)
        { roof: 'flat', wall: 'panel', col: PANEL, x: 0, w: 14, roofH: 5, stories: st, storyH: 4, balcony: true, winStep: 3 }, // d: langer Plattenbau mit Balkonen
        { roof: 'flat', wall: 'concrete', col: CONC, x: 0, w: 14, roofH: 5, stories: Math.max(1, st - 1), storyH: 5, winStep: 3 }, // e: niedriger langer Block
        { roof: 'flat', wall: 'panel', col: PANEL, x: 3, w: 8, roofH: 5, stories: st + 1, storyH: 4, balcony: true },   // f: Punkthochhaus
        { roof: 'flat', wall: 'concrete', col: CONC, x: 1, w: 12, roofH: 5, stories: st, storyH: 5, shop: true },        // g: Block mit Laden
        { roof: 'side', wall: 'panel', col: PANEL, x: 1, w: 12, roofH: 7, rt: SLATE, stories: st, storyH: 4, winStep: 3 } // h: Plattenbau mit Satteldach
      ]; }
    };
    var LETTERS = 'abcdefgh';
    Object.keys(VAR).forEach(function (fam) {
      for (var lv = 1; lv <= 3; lv++) VAR[fam](lv).forEach(function (o, i) {
        if (!o) return;
        defB(hname(fam, lv, LETTERS[i]), finishB(genHouse(o)), 2);
      });
    });
    // Varianten je Regierung (Familie + Buchstaben)
    var HV = {
      tribe: ['rustic', 'abef'], anarchy: ['rustic', 'cdgh'], monarchy: ['timber', 'abcdef'], theocracy: ['timber', 'abcdef'],
      democracy: ['town', 'abcdef'], republic: ['town', 'bdefac'], fascism: ['block', 'aceg'], communism: ['block', 'bdfh']
    };
    S.houseVariantCount = function (gov, level) { return (HV[gov] || HV.monarchy)[1].length; };
    S.houseKey = function (gov, level, variant) {
      var f = HV[gov] || HV.monarchy, lv = Math.max(1, Math.min(3, level | 0));
      if ((level | 0) <= 0) return S.tentKey(variant);
      var v = f[1].charAt(((variant | 0) % f[1].length + f[1].length) % f[1].length);
      return 's_house_' + f[0] + '_' + lv + '_' + v;
    };

    // ---------------------------------------------------------------- Zelte (Haus-Stufe 0, 2×2)
    var HIDE = [AC(null, '#d8b88a'), AC(null, '#b08a5a'), AC(null, '#86643e')];
    var FELT = [AC(null, '#f2ead8'), AC(null, '#d8ccb0'), AC(null, '#b0a284')];
    g = new Grid(14, 16);   // a: Spitzzelt mit Stangen
    for (var j = 0; j < 13; j++) { var hw = 0.5 + j * 0.48; for (var i = 0; i < 14; i++) { var dx = i + 0.5 - 7; if (Math.abs(dx) <= hw) g.set(i, j + 3, dx < -hw * 0.3 ? HIDE[0] : (dx > hw * 0.4 ? HIDE[2] : HIDE[1])); } }
    g.hline(2, 10, 10, 'T'); g.hline(1, 11, 12, 'Td');
    g.line(7, 0, 7, 3, 'woodD'); g.line(5, 0, 6, 3, 'woodD'); g.line(9, 0, 8, 3, 'woodD');
    g.rect(6, 12, 2, 4, 'plum'); g.set(7, 12, 'ink');
    defB('s_tent_a', finishB(g), 2);
    g = new Grid(14, 13);   // b: Firstzelt
    roofSide(g, 0, 2, 14, 8, ['strawL', 'cream', 'sandD'], 3);
    fillTriB(g, 7, 3, 2, 12, 12, 12, 'cream'); g.rect(6, 7, 2, 5, 'plum'); g.set(5, 11, 'sandD'); g.set(8, 11, 'sandD');
    g.hline(0, 6, 14, 'T'); g.vline(7, 0, 3, 'woodD'); g.set(8, 0, 'T');
    defB('s_tent_b', finishB(g), 2);
    g = new Grid(14, 14);   // c: Jurte
    g.ellipse(7, 5, 7, 4.5, function (x, y, nx, ny) { return y > 5 ? null : (nx + ny < -0.6 ? FELT[0] : (nx > 0.4 ? FELT[2] : FELT[1])); });
    g.rect(1, 5, 12, 8, FELT[1]); g.vline(1, 5, 8, FELT[0]); g.vline(12, 5, 8, FELT[2]);
    g.hline(1, 6, 12, 'T'); g.hline(1, 7, 12, 'Td'); g.rect(6, 9, 2, 4, 'woodD'); g.set(7, 0, 'woodD'); g.hline(6, 1, 3, 'woodD');
    defB('s_tent_c', finishB(g), 2);
    g = new Grid(14, 12);   // d: Fellzelt, unregelmäßig
    g.ellipse(7, 7, 6.5, 5, function (x, y, nx, ny) { var h = hash(x, y, 77); return y > 10 ? null : (h < 0.15 ? HIDE[2] : (nx + ny < -0.4 ? HIDE[0] : HIDE[1])); });
    g.line(3, 1, 5, 4, 'woodD'); g.line(11, 1, 9, 4, 'woodD'); g.rect(5, 8, 3, 3, 'plum'); g.set(10, 6, 'cream'); g.set(3, 7, 'cream');
    g.vline(12, 2, 9, 'woodD'); g.paint(13, 2, ['T', 'T']);
    defB('s_tent_d', finishB(g), 2);
    function fillTriB(gr, ax, ay, bx, by, cx, cy, col) {
      for (var yy = 0; yy < gr.h; yy++) for (var xx = 0; xx < gr.w; xx++) {
        var px = xx + 0.5, py = yy + 0.5;
        var d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by), d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy), d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) gr.set(xx, yy, col);
      }
    }
    S.tentKey = function (v) { return 's_tent_' + 'abcd'.charAt(((v | 0) % 4 + 4) % 4); };

    // ---------------------------------------------------------------- Lager (Zentrum Stufe 0, 3×3, viel durchsichtiger Boden)
    function campBase(variant, frame) {
      var gr = new Grid(24, 30), G = 6;   // Zeile G = Oberkante der Grundfläche
      function shadowUnder(x0, x1, y) { for (var x = x0; x <= x1; x++) if (!gr.get(x, y)) gr.set(x, y, 'shade'); }
      // Feuerstelle in der Mitte
      gr.paint(9, G + 11, ['.gqgqg.', 'gWQFQWg', '.gGgGg.']);
      var fl = frame ? ['..j..', '.jFQ.', '.QFFj', 'QFjFQ'] : ['...j.', '.jF..', 'jFFQ.', 'QFjFQ'];
      gr.paint(10, G + 7, fl);
      // Sitzstämme
      [[3, G + 12, 5], [16, G + 12, 5], [9, G + 16, 6]].forEach(function (l) {
        gr.hline(l[0], l[1], l[2], 'wood'); gr.hline(l[0], l[1] + 1, l[2], 'woodD'); gr.set(l[0], l[1], 'woodL'); gr.set(l[0] + l[2] - 1, l[1], 'strawL'); shadowUnder(l[0], l[0] + l[2], l[1] + 2);
      });
      // Fahnenstange mit Banner
      var fx = variant ? 19 : 3;
      gr.vline(fx, 0, G + 8, 'woodD'); gr.set(fx, 0, 'gold'); gr.paint(fx + 1, 1, ['TTTu', 'TTTT', 'TtTT', 't..t']); shadowUnder(fx, fx + 1, G + 8);
      // Vorräte
      if (!variant) { gr.paint(16, G + 1, ['.vvw..', 'vwwWcY', 'wWWWYY', '.oo.Yy']); shadowUnder(16, 22, G + 5); gr.paint(5, G + 18, ['yY', 'YY']); }
      else {
        gr.paint(2, G + 2, ['cYcY..', 'YYYYvw', '.vwwWW', '.wWWW.']); shadowUnder(2, 8, G + 6);
        gr.line(16, G + 14, 18, G + 9, 'woodD'); gr.line(20, G + 14, 18, G + 9, 'woodD'); gr.paint(17, G + 11, ['MMM', 'MoM']);   // Kochtopf am Dreibein
      }
      return gr.outline();
    }
    ['a', 'b'].forEach(function (v, vi) {
      [0, 1].forEach(function (f) { def('s_camp_' + v + '_' + f, campBase(vi, f), { group: 'build', fw: 3, fh: 3, ox: 0 }); });
      def('s_camp_' + v, campBase(vi, 0), { group: 'build', fw: 3, fh: 3, ox: 0 });
    });
    S.campKey = function (v, frame) { return 's_camp_' + ((v | 0) & 1 ? 'b' : 'a') + (frame == null ? '' : '_' + ((frame | 0) & 1)); };

    // ---------------------------------------------------------------- Dorfhalle (Zentrum Stufe 1): bescheidene Holzhalle mit Vorplatz
    function hall(variant) {
      var gr = new Grid(22, 24);
      if (!variant) {
        roofSide(gr, 2, 3, 18, 10, TR, 3); chimney(gr, 15, 0, 5); roofSide(gr, 2, 3, 18, 10, TR, 3);
        wallPlanks(gr, 3, 13, 16, 7); eaveShadow(gr, 3, 13, 16, 'woodD');
        door(gr, 10, 15, 5, 'woodD'); win(gr, 5, 15); win(gr, 15, 15);
        gr.hline(3, 19, 16, 'woodD'); gr.paint(1, 20, ['vwwW']);   // Bank
      } else {
        roofFront(gr, 4, 1, 14, 13, TR, 7, function (x, y) { return (x === 10 || x === 11 || y === 13) ? 'woodD' : 'woodL'; });
        wallPlanks(gr, 5, 14, 12, 7); eaveShadow(gr, 5, 14, 12, 'woodD');
        gr.rect(9, 16, 4, 5, 'woodD'); gr.vline(10, 16, 5, 'wood'); win(gr, 6, 16); win(gr, 14, 16);
        gr.vline(4, 14, 7, 'woodD'); gr.vline(17, 14, 7, 'woodD');   // Vordach-Pfosten
        gr.paint(18, 18, ['vw', 'wW']);
      }
      return gr;
    }
    defB('s_hall_a', finishB(hall(0)), 3);
    defB('s_hall_b', finishB(hall(1)), 3);
    S.hallKey = function (v) { return 's_hall_' + ((v | 0) & 1 ? 'b' : 'a'); };

    // ---------------------------------------------------------------- Gerüste (Überlagerung, durchsichtig)
    function scaffold(n) {
      var w = n * 8, h = n * 8 + (n === 3 ? 16 : 12), gr = new Grid(w, h);
      for (var x = 1; x < w; x += 5) gr.vline(x, 3, h - 3, 'woodD');
      gr.vline(w - 1, 3, h - 3, 'woodD');
      for (var y = 5; y < h; y += 6) { gr.hline(0, y, w, 'woodL'); gr.hline(0, y + 1, w, 'woodD'); }
      for (x = 1; x + 5 < w; x += 10) { gr.line(x, h - 2, x + 5, h - 8, 'wood'); gr.line(x + 5, 10, x + 10 > w - 1 ? w - 1 : x + 10, 4, 'wood'); }
      gr.hline(w - 6, 0, 6, 'woodD'); gr.vline(w - 6, 0, 4, 'woodD'); gr.set(w - 1, 1, 'stoneD'); gr.paint(w - 2, 2, ['q', 'g']);
      return gr;
    }
    def('s_scaffold_2', scaffold(2), { group: 'build', fw: 2, fh: 2, ox: 0 });
    def('s_scaffold_3', scaffold(3), { group: 'build', fw: 3, fh: 3, ox: 0 });

    // ---------------------------------------------------------------- Kleine Stadt-Deko (1×1)
    function deco(key, rows, post) {
      var gr = new Grid(rows[0].length, rows.length); gr.paint(0, 0, rows); if (post) post(gr);
      def(key, gr.pad(1, 1, 1, 0).outline().pad(0, 0, 0, 1).footShade(), { group: 'deco' });
    }
    deco('s_deco_well', ['.WWWW.', '.W..W.', 'tTTTTt', '.W..W.', 'qgggqG', 'gBDDBG', 'qggggG']);
    deco('s_deco_stall', ['TlTlTl', 'tttttt', 'W....W', 'rkfbrW', 'vvvvvW', 'W....W']);
    deco('s_deco_hay', ['..zz..', '.zyyz.', 'zyzyyY', 'yzyyYY', 'YYYYYY']);
    deco('s_deco_cart', ['.......', 'vwwwwW.', 'wyzyyW.', 'WWWWWWW', '.oWo...', '.oo....']);
    ['f', 'r', 'P'].forEach(function (c, i) {
      var rows = ['w.w.w.w', 'heheheh', 'h' + c + 'h' + c + 'h' + c + 'h', 'heheheh', 'w.w.w.w'];
      deco('s_deco_garden_' + i, i === 2 ? ['w.w.w.w', 'hpheheh', 'hPhkhph', 'hehphPh', 'w.w.w.w'] : rows);
    });
    deco('s_deco_woodpile', ['.zyzyz', 'zyzyzy', 'yzyzyz', 'WWWWWW']);
    deco('s_deco_barrels', ['.oo.oo', 'owwowW', 'oMMoMM', 'owwowW', '.oo.oo']);
    deco('s_deco_laundry', ['W.....W', 'WWWWWWW', 'W.r.T.W', 'Wlrbutw', 'W.l.b.W', 'W.....W']);
    S.DECO_KEYS = ['s_deco_well', 's_deco_stall', 's_deco_hay', 's_deco_cart', 's_deco_garden_0', 's_deco_garden_1', 's_deco_garden_2', 's_deco_woodpile', 's_deco_barrels', 's_deco_laundry'];

    // ======================================================================
    // Mauerstufen 4–6 je Regierung (Stamm und Anarchie 2–4): gleiche Extrusion, höher und dicker,
    // dazu Aufbauten je Regierung und Stufe als Überlagerung. Geräte (s_walldev_*) sitzen obenauf.
    WALL[4] = { a: 1, b: 6, h: 10 }; WALL[5] = { a: 1, b: 6, h: 11 }; WALL[6] = { a: 0, b: 7, h: 12 };
    MAT.tribe2 = { top: 'woodL', topL: 'woodL', face: 'wood', faceL: 'woodL', joint: 'woodD', base: 'woodD', pat: 'stakes', merlon: 1, cap: 'woodL' };
    MAT.tribe3 = { top: AC(null, '#8fae5a'), topL: AC(null, '#a6c46a'), face: AC(null, '#9a6e44'), faceL: AC(null, '#b08250'), joint: AC(null, '#7a5232'), base: AC(null, '#5e3e24'), pat: 'earth', merlon: 0 };
    MAT.tribe4 = { top: 'wood', topL: 'woodL', face: 'wood', faceL: 'woodL', joint: 'woodD', base: 'woodD', pat: 'planksH', merlon: 1, cap: 'woodL' };
    MAT.anarchy2 = { top: 'woodL', topL: 'woodL', face: 'wood', faceL: 'woodL', joint: 'ink', base: 'ink', pat: 'junk', merlon: 0 };
    MAT.anarchy3 = { top: 'metal', topL: 'metalL', face: 'metal', faceL: 'metalL', joint: 'metalD', base: 'rockD' in C ? 'rockD' : 'metalD', pat: 'scrap', merlon: 0 };
    MAT.anarchy4 = { top: 'cream', topL: 'white', face: 'cream', faceL: 'white', joint: 'plum', base: 'plum', pat: 'art', merlon: 0 };
    var ARTC = ['pink', 'fireY', 'glass', 'leafL', 'purple', 'red', 'fireO', 'Tl'];
    var _matFace = matFace;
    matFace = function (m, x, row, hh, merlon) {
      if (row >= hh - 1) return m.base;
      if (m.pat === 'stakes') return (x % 2) ? m.face : m.faceL;
      if (m.pat === 'planksH') return row % 3 === 2 ? m.joint : (x === 0 ? m.faceL : m.face);
      if (m.pat === 'earth') return row < 2 ? m.top : (hash(x, row, 5) < 0.2 ? m.joint : m.face);
      if (m.pat === 'junk') { var hj = hash(x >> 1, row >> 1, 61); return hj < 0.35 ? ((x + row) % 3 === 0 ? 'dusk' : 'ink') : (hj < 0.7 ? (x & 1 ? 'wood' : 'woodL') : (hj < 0.85 ? 'red' : 'fireY')); }
      if (m.pat === 'scrap') { var hs = hash(x >> 1, (row + 1) >> 2, 62); return hs < 0.3 ? 'metalD' : (hs < 0.55 ? 'metal' : (hs < 0.75 ? 'stoneD' : (hs < 0.88 ? 'fireO' : 'metalL'))); }
      if (m.pat === 'art') return ARTC[(Math.floor((x + Math.sin(row * 0.8) * 2 + 8) / 2) + (row >> 2)) % ARTC.length];
      return _matFace(m, x, row, hh, merlon);
    };
    var LVMAX = { tribe: 4, anarchy: 4 };
    var DOUBLE = { monarchy5: 1, communism6: 1 };
    function matOf(st, lv) { if (st === 'tribe' || st === 'anarchy') return MAT[st + lv]; return MAT[st]; }
    function geom(st, lv) {   // Mauer-Geometrie: Stamm/Anarchie nutzen eigene Stärken
      if (st === 'tribe' || st === 'anarchy') return { 2: { a: 2, b: 5, h: 6 }, 3: { a: 1, b: 6, h: 7 }, 4: { a: 1, b: 6, h: 10 } }[lv];
      if (DOUBLE[st + lv]) return { a: 0, b: 3, h: WALL[lv].h };   // Doppelmauer: Hauptmauer hinten, Vormauer vorn, Gasse dazwischen
      return WALL[lv];
    }
    // Hilfen für Aufbauten: Kronenpunkte entlang der Mittellinie, Vorderfläche
    function crownPts(P, mask, h, Htot) {
      var sp = Math.floor((P.a + P.b) / 2), pts = [], horiz = (mask & 10) || !(mask & 5);
      if (horiz) for (var x = 0; x < 8; x++) { if (occ(mask, P.a, P.b, x, sp)) pts.push([x, sp - h + Htot]); }
      if (mask & 5) for (var gy = 0; gy < 8; gy++) if (occ(mask, P.a, P.b, sp, gy) && !(horiz && gy === sp)) pts.push([sp, gy - h + Htot]);
      return pts;
    }
    function facePts(P, mask, h, Htot) {   // Spalten der Vorderfläche (gy = b) und deren Zeilenbereich
      var out = [];
      for (var x = 0; x < 8; x++) if (occ(mask, P.a, P.b, x, P.b) && !occ(mask, P.a, P.b, x, P.b + 1)) out.push([x, P.b - h + 1 + Htot, P.b + Htot]);
      return out;
    }
    var GLOW = AC(null, '#9ff6ff', 210), GLOWG = AC(null, '#ffe98a', 160), LAMP = AC(null, '#fff2a0'), SANDS = AC(null, '#e8d9a8'), EARTH = AC(null, '#7c9a4a'), EARTHD = AC(null, '#5e7a38');
    var DECO = {
      monarchy: [null, function (g, c, f) { c.forEach(function (p, i) { g.set(p[0], p[1] - 3, 'T'); g.set(p[0], p[1] - 4, i & 1 ? 'Td' : 'Tl'); if (i % 3 === 0) { g.set(p[0], p[1] - 1, 'woodD'); g.set(p[0], p[1] - 2, 'woodD'); } }); },
        'outer',
        function (g, c, f) { f.forEach(function (q, i) { g.set(q[0], q[1] + 1, i & 1 ? 'ink' : 'stoneD'); g.set(q[0], q[1], 'stoneL'); }); c.forEach(function (p, i) { if (i % 4 === 1) { g.vline(p[0], p[1] - 6, 5, 'woodD'); g.paint(p[0] + 1, p[1] - 6, ['TT', 'Tt']); } }); }],
      democracy: [null, function (g, c, f) { f.forEach(function (q) { g.set(q[0], q[2] + 1, 'stoneD'); }); },
        'earth',
        function (g, c, f) { f.forEach(function (q) { g.set(q[0], q[2] + 1, 'stoneD'); g.set(q[0], q[2] + 2, 'shade'); }); c.forEach(function (p, i) { if (i % 4 === 2) { g.vline(p[0], p[1] - 5, 4, 'woodD'); g.paint(p[0] + 1, p[1] - 5, ['TTT', 'TTt']); } }); }],
      fascism: [null, function (g, c) { c.forEach(function (p, i) { var k = i % 3; g.set(p[0], p[1] - 1 - (k === 1 ? 1 : 0), 'metalL'); g.set(p[0], p[1] - 2 + (k === 1 ? 1 : 0), 'ink'); if (k === 0) g.set(p[0], p[1] - 3, 'metal'); }); },
        function (g, c, f) { f.forEach(function (q, i) { var y = q[1] + Math.floor((q[2] - q[1]) / 2); if (i % 4 < 3) g.set(q[0], y, 'ink'); }); },
        function (g, c, f) { var y = g.h - 2; [1, 5].forEach(function (x) { g.line(x - 1, y - 2, x + 1, y, 'metalD'); g.line(x + 1, y - 2, x - 1, y, 'metal'); }); }],
      communism: [null, function (g, c) { c.forEach(function (p) { g.set(p[0], p[1] - 1, 'stoneL'); g.set(p[0], p[1] - 2, 'white'); g.set(p[0], p[1], 'stone'); }); },
        function (g, c) { var y = g.h - 1; for (var x = 0; x < 8; x++) { g.set(x, y - 3, (x & 1) ? 'metalL' : 'metalD'); if (x % 3 === 0) { g.vline(x, y - 4, 5, 'metalD'); } } },
        function (g, c) { var y = g.h - 1; for (var x = 0; x < 8; x++) for (var yy = y - 4; yy <= y - 3; yy++) if (!g.get(x, yy)) g.set(x, yy, SANDS); c.forEach(function (p, i) { if (i === 3) { g.vline(p[0], p[1] - 8, 8, 'metalD'); g.hline(p[0], p[1] - 9, 3, 'metalD'); g.set(p[0] + 2, p[1] - 8, LAMP); g.set(p[0] + 2, p[1] - 7, GLOWG); } }); }],
      theocracy: [null, function (g, c, f) { f.forEach(function (q, i) { g.set(q[0], q[1] + 2, i & 1 ? 'gold' : 'goldL'); g.set(q[0], q[1] + 3, 'goldD'); }); },
        function (g, c, f) { f.forEach(function (q, i) { if (i % 4 === 1) { var y = q[1] + 4; g.set(q[0], y, GLOW); g.set(q[0] + 1, y, GLOW); g.set(q[0], y + 1, GLOW); g.set(q[0] + 1, y + 1, 'white'); } }); },
        function (g, c) { c.forEach(function (p, i) { if (i === 2 || i === 6) for (var y = 0; y < p[1] - 1; y++) if (!g.get(p[0], y)) { g.set(p[0], y, GLOWG); if (y > p[1] - 6) g.set(p[0] + 1, y, GLOWG); } }); }],
      republic: [null, function (g, c, f) { f.forEach(function (q, i) { if (i % 3 === 1) { g.set(q[0], q[1] + 3, 'ink'); g.set(q[0], q[1] + 4, 'ink'); } }); },
        function (g, c, f) { f.forEach(function (q, i) { if (i % 4 === 2) { var y = q[1] + 4; g.set(q[0] - 1, y, 'ink'); g.set(q[0], y, 'ink'); g.set(q[0] - 1, y + 1, 'ink'); g.set(q[0], y + 1, 'metalD'); g.set(q[0], y + 2, 'metal'); } }); },
        function (g, c) { c.forEach(function (p, i) { if (i === 1 || i === 6) { g.set(p[0], p[1] - 1, 'metalD'); g.set(p[0], p[1] - 2, 'fireO'); g.set(p[0], p[1] - 3, 'fireY'); g.set(p[0], p[1] - 4, 'goldL'); } }); }],
      tribe: [null, null, 'double', function (g, c) { c.forEach(function (p, i) { if (i % 2 === 0) { g.set(p[0], p[1] - 1, 'woodD'); g.set(p[0], p[1] - 2, 'woodL'); } }); },
        function (g, c) { c.forEach(function (p, i) { g.set(p[0], p[1] - 4, i & 1 ? 'straw' : 'strawL'); if (i % 3 === 0) { g.vline(p[0], p[1] - 3, 3, 'woodD'); } }); }],
      anarchy: [null, null, function (g, c) { c.forEach(function (p, i) { if (i % 3 === 0) { g.set(p[0], p[1] - 1, 'ink'); g.set(p[0], p[1] - 2, 'dusk'); } }); },
        function (g, c) { c.forEach(function (p, i) { if (i % 3 === 1) { g.set(p[0], p[1] - 1, 'metalD'); g.set(p[0], p[1] - 2, 'fireO'); } }); },
        function (g, c) { c.forEach(function (p, i) { g.set(p[0], p[1] - 1, ARTC[i % ARTC.length]); }); }]
    };
    function decoFor(st, lv) { var d = DECO[st]; if (!d) return null; return d[st === 'tribe' || st === 'anarchy' ? lv : lv - 3]; }
    // Zellen mit Zusatzgeometrie: 'outer' = niedrige Vormauer, 'double' = zweite Pfahlreihe, 'earth' = Erdwall davor
    function cellsFor(st, lv, mask) {
      var m = matOf(st, lv), P = geom(st, lv), dec = decoFor(st, lv);
      var saveW = WALL[lv]; WALL[lv] = P;
      var base = wallCellsS(m, lv, mask);
      WALL[lv] = saveW;
      if (DOUBLE[st + lv]) dec = 'outer';
      if (dec === 'outer' || dec === 'earth' || dec === 'double') {
        return function (gx, gy) {
          var c = base(gx, gy); if (c) return c;
          var line = 7;
          if (occ(mask, line, line, gx, gy) && !occ(mask, P.a, P.b, gx, gy)) {
            if (dec === 'earth') return { h: 3, top: function () { return EARTH; }, face: function (x, row, y, hh) { return row === hh - 1 ? EARTHD : EARTH; } };
            if (dec === 'double') return { h: 5 + ((gx + gy) & 1), top: function () { return 'woodL'; }, face: function (x) { return (x & 1) ? 'wood' : 'woodD'; } };
            var oh = 5, mer = st === 'monarchy' && ((gx >> 1) & 1) === 0;
            return { h: oh + (mer ? 1 : 0), top: function () { return m.topL; }, face: function (x, row, y, hh) { return matFace(m, x, row, hh, mer); } };
          }
          return null;
        };
      }
      return base;
    }
    function wallLv(st, lv, mask, water) {
      var m = matOf(st, lv), P = geom(st, lv), h = P.h + (m.dh || 0), Htot = h + 4 + 9;
      var cells = cellsFor(st, lv, mask);
      if (water) {
        var c0 = cells, vert = water === 'v';
        cells = function (gx, gy) {
          var c = c0(gx, gy); if (!c) return null;
          if (!(gx >= 0 && gx < 8 && gy >= 0 && gy < 8)) return c;
          if (vert && gy >= 2 && gy <= 5) return { h: c.h, base: 3, top: c.top, face: c.face };
          if (!vert) { var f0 = c.face; return { h: c.h, top: c.top, face: function (x, row, y, hh) { var fb = hh - row; if (y === P.b && x >= 2 && x <= 5 && fb <= 4) return fb === 1 ? 'river' : (fb === 4 ? 'ink' : (x & 1 ? 'metalD' : 'ink')); return f0(x, row, y, hh); } }; }
          return c;
        };
      }
      var g = extrude(cells, Htot);
      var dec = decoFor(st, lv);
      if (typeof dec === 'function') {
        var sv = WALL[lv]; WALL[lv] = P;
        dec(g, crownPts(P, mask, h, Htot), facePts(P, mask, h, Htot));
        WALL[lv] = sv;
      }
      return g;
    }
    var WGOVS = STYLED.concat(['tribe', 'anarchy']);
    WGOVS.forEach(function (st) {
      var from = (st === 'tribe' || st === 'anarchy') ? 2 : 4, to = LVMAX[st] || 6;
      for (var lv = from; lv <= to; lv++) {
        for (var mk = 0; mk < 16; mk++) def('s_wall_' + st + '_' + lv + '_' + mk, wallLv(st, lv, mk), { group: 'wall' });
        def('s_wall_' + st + '_' + lv + '_water_h', wallLv(st, lv, 10, 'h'), { group: 'wall' });
        def('s_wall_' + st + '_' + lv + '_water_v', wallLv(st, lv, 5, 'v'), { group: 'wall' });
        var mg = matOf(st, lv), sv = WALL[lv]; WALL[lv] = geom(st, lv);
        ['h', 'v'].forEach(function (d) {
          var gg = st === 'fascism' ? gateCheckpoint(Math.min(lv, 3), d === 'v') : gateArt(mg, lv, d === 'v');
          def('s_gate_' + st + '_' + lv + '_' + d, gg, { group: 'wall' });
        });
        WALL[lv] = sv;
        if (st !== 'anarchy' && st !== 'tribe') def('s_tower_' + st + '_' + lv, towerLv(st, lv), { group: 'wall', ox: -2 });
      }
    });
    // höhere Türme: Schaft wächst je Stufe, gleiche Kappen wie Stufe 3, ab 5 mit Zusatz
    function towerLv(st, lv) {
      var g = towerS(st, 3), extra = (lv - 3) * 3, out = new Grid(g.w, g.h + extra);
      // obere Hälfte (Kappe) nach oben versetzen, Schaft dazwischen strecken
      var cut = g.h - 10;
      for (var y = 0; y < g.h; y++) for (var x = 0; x < g.w; x++) {
        var c = g.d[y * g.w + x]; if (!c) continue;
        if (y < cut) out.set(x, y, c); else out.set(x, y + extra, c);
      }
      for (y = cut; y < cut + extra; y++) for (x = 0; x < g.w; x++) { var c2 = g.d[cut * g.w + x]; if (c2) out.set(x, y, c2); }
      if (lv >= 5) { out.set(5, cut + 2, 'ink'); out.set(6, cut + 2, 'ink'); }
      if (lv >= 6) { out.set(1, cut, 'T'); out.set(10, cut, 'T'); }
      return out;
    }
    // Stamm: Holz-Ausguck für alle Stufen; Anarchie: keine Türme
    // Rückfall-Logik: höchste vorhandene Stufe
    S.wallKey = function (gov, level, mask) {
      level = level | 0; mask = mask & 15;
      if (gov === 'anarchy') return level <= 1 ? 's_barricade_' + mask : 's_wall_anarchy_' + Math.min(4, level) + '_' + mask;
      if (gov === 'tribe') return level <= 1 ? 's_wall_1_' + mask : 's_wall_tribe_' + Math.min(4, level) + '_' + mask;
      if (level <= 1 || !MAT[gov]) return 's_wall_1_' + mask;
      return 's_wall_' + gov + '_' + Math.min(6, level) + '_' + mask;
    };
    S.waterWallKey = function (gov, level, dir) {
      dir = dir === 'v' ? 'v' : 'h';
      if ((gov === 'tribe' || gov === 'anarchy') && level >= 2) return 's_wall_' + gov + '_' + Math.min(4, level) + '_water_' + dir;
      if (level <= 1 || !MAT[gov] || gov === 'tribe' || gov === 'anarchy') return 's_wall_1_water_' + dir;
      return 's_wall_' + gov + '_' + Math.min(6, level) + '_water_' + dir;
    };
    S.gateKey = function (gov, level, dir) {
      dir = dir === 'v' ? 'v' : 'h';
      if ((gov === 'tribe' || gov === 'anarchy') && level >= 2) return 's_gate_' + gov + '_' + Math.min(4, level) + '_' + dir;
      if (level <= 1 || !MAT[gov] || gov === 'tribe' || gov === 'anarchy') return 's_gate_1_' + dir;
      return 's_gate_' + gov + '_' + Math.min(6, level) + '_' + dir;
    };
    S.towerKey = function (gov, level) {
      if (gov === 'anarchy') return null;
      if (gov === 'tribe' || !MAT[gov] || level <= 1) return 's_tower_tribe';
      return 's_tower_' + gov + '_' + Math.min(6, Math.max(2, level | 0));
    };
    S.wallMaxLevel = function (gov) { return LVMAX[gov] || 6; };

    // ---------------------------------------------------------------- Verteidigungsgeräte (Aufsatz auf der Mauerkrone)
    function dev(key, rows, post) {
      var gr = new Grid(rows[0].length, rows.length); gr.paint(0, 0, rows); if (post) post(gr);
      def(key, gr.pad(1, 1, 1, 1).outline(), { group: 'walldev' });
    }
    // Selbstschussanlage: Kasten mit Trichterrohr, löst selbst aus (_1 = Schuss)
    dev('s_walldev_selfshot_0', ['.GGGG..', 'GgggG..', 'GgqgGMM', 'GgggGMm', 'GGGGG..', '.M..M..']);
    dev('s_walldev_selfshot_1', ['.GGGG...', 'GgggG.j.', 'GgqgGMMF', 'GgggGMmj', 'GGGGG.j.', '.M..M...']);
    def('s_walldev_selfshot', L.DEFS.s_walldev_selfshot_0.grid, { group: 'walldev' });
    dev('s_walldev_mgnest_0', ['...MMM.', '.aaMaa.', 'aAaaaAa', 'AaAaAaA', '.AAAAA.']);
    dev('s_walldev_mgnest_1', ['...MMMjF', '.aaMaa.j', 'aAaaaAa.', 'AaAaAaA.', '.AAAAA..']);
    def('s_walldev_mgnest', L.DEFS.s_walldev_mgnest_0.grid, { group: 'walldev' });
    dev('s_walldev_ballista_0', ['w.....w', '.w...w.', '..wnw..', 'llwwwlnn', '..WwW..', '.W...W.']);
    dev('s_walldev_ballista_1', ['.w...w.', '..w.w..', '..www..', '..wwwW.', '..WwW..', '.W...W.']);
    def('s_walldev_ballista', L.DEFS.s_walldev_ballista_0.grid, { group: 'walldev' });
    dev('s_walldev_cannon_0', ['.......', '.oooooo', 'oMmmmmo', '.ooooo.', 'oWo.oWo', '.o...o.']);
    dev('s_walldev_cannon_1', ['......jF', '.oooooQj', 'oMmmmmoF', '.ooooo.j', 'oWo.oWo.', '.o...o..']);
    def('s_walldev_cannon', L.DEFS.s_walldev_cannon_0.grid, { group: 'walldev' });
    [0, 1].forEach(function (f) {
      var gr = new Grid(7, 7);
      gr.ellipse(3.5, 3.5, 3.4, 3.4, function (x, y, nx, ny) { var d = nx * nx + ny * ny; return d > 0.55 ? 'gold' : (d < 0.2 ? (f ? 'white' : GLOW) : (f ? GLOW : null)); });
      gr.set(3, 0, 'goldL');
      def('s_walldev_ward_' + f, gr.pad(1, 1, 1, 1).outline('goldD'), { group: 'walldev' });
    });
    def('s_walldev_ward', L.DEFS.s_walldev_ward_0.grid, { group: 'walldev' });
    dev('s_walldev_post', ['.uTTt.', 'uTTTTt', 'tttttt', '.wbbW.', '.wbbW.', '.wwwW.', '.wwwW.']);
    dev('s_walldev_spikes', ['l..l..l.', 'v.vv.vv.', 'wvwwvwwv', 'WwWWwWWw', 'hhhhhhhh']);
    dev('s_walldev_trap', ['n.n.n.n.', 'mnmnmnmn', 'MMMMMMMM', '..vw.oo.', '.vwWoWWo']);
    function fxg(rows) { var gg = new Grid(rows[0].length, rows.length); gg.paint(0, 0, rows); return gg; }
    def('fx_muzzle_0', fxg(['.j.', 'jlj', '.j.']), { group: 'fx', anchor: 'center' });
    def('fx_muzzle_1', fxg(['j.F.j', '.FlF.', 'FlllF', '.FlF.', 'j.F.j']), { group: 'fx', anchor: 'center' });
    def('fx_bolt_shot', fxg(['W......', 'wwwwwwn', 'W......']), { group: 'fx', anchor: 'center' });
    // Aufsatzhöhe: Logikpixel relativ zur Kachel-Oberkante, an denen die Unterkante des Geräts liegt
    S.wallDevOffset = function (gov, level, devKey) {
      if (/spikes|trap/.test(devKey || '')) return 0;          // stehen vor der Mauer am Boden
      var st = gov, lv = Math.max(1, level | 0), P, m;
      if (gov === 'tribe' || gov === 'anarchy') { lv = Math.min(4, lv); if (lv <= 1) return -1; P = geom(gov, lv); m = matOf(gov, lv); }
      else { lv = Math.min(6, lv); if (lv <= 1 || !MAT[gov]) return -1; P = WALL[lv]; m = MAT[gov]; }
      var sp = Math.floor((P.a + P.b) / 2);
      return (sp - (P.h + (m.dh || 0)) + 1) - 8;
    };
    // ======================================================================
    // Fabriken (Stufe 1 = 2×2, Stufe 2 = 3×3) je Art, stillgelegte Fabrik, Schornstein-Mündungen für den Rauch
    var FST = {};   // key -> [[x, y], ...] Mündungen im Innenraster
    var BRK2 = [AC(null, '#d9785a'), AC(null, '#b8553e'), AC(null, '#8a3a2e'), AC(null, '#7a3228')];
    var DCON = [AC(null, '#7c7c82'), AC(null, '#5c5c64'), AC(null, '#44444c'), AC(null, '#3a3a42')];
    var HALL = [AC(null, '#f2f0e8'), AC(null, '#dcd8cc'), AC(null, '#b8b4a6'), AC(null, '#a8a496')];
    var RUST = [AC(null, '#c07a4a'), AC(null, '#9a5a36'), AC(null, '#6e3e26'), AC(null, '#5a3220')];
    var FILT = [AC(null, '#9fe08a'), AC(null, '#5fb05a')];
    function stackAt(g, x, top, bot, w, cols, bands, list) {
      g.rect(x, top, w, bot - top + 1, cols[1]); g.vline(x, top, bot - top + 1, cols[0]); g.vline(x + w - 1, top, bot - top + 1, cols[2]);
      if (bands) for (var y = top + 3; y < bot; y += 5) g.hline(x, y, w, bands);
      g.hline(x - 1, top, w + 2, cols[2]); g.hline(x, top, w, 'ink');
      if (list) list.push([x + Math.floor(w / 2), top - 1]);
    }
    function sawRoof(g, x, y, w, h, c, glassC) {
      for (var t = 0; t * 5 < w; t++) for (var j = 0; j < h; j++) {
        var x0 = x + t * 5, hw = Math.round((j + 1) / h * 4);
        for (var i = 0; i < hw && x0 + i < x + w; i++) g.set(x0 + i, y + j, i === hw - 1 ? glassC : (i === 0 ? c[0] : c[1]));
        if (x0 + 4 < x + w) g.set(x0 + 4, y + j, c[2]);
      }
      g.hline(x, y + h, w, c[2]);
    }
    function factory(kind, lv, filtered) {
      var big = lv >= 2, W = big ? 22 : 14, st = [], g;
      if (kind === 'kombinat') {
        g = new Grid(W, big ? 34 : 28);
        var n = big ? 3 : 2;
        for (var k = 0; k < n; k++) stackAt(g, 2 + k * 6, 0 + k * 2, 18, 3, ['redL', 'red', 'redD'], C.white, st);
        roofSide(g, 0, 14, W, 7, ['stoneL', 'stone', 'stoneD'], 2);
        wallBrick(g, 0, 21, W, g.h - 21, BRK2, 0); eaveShadow(g, 0, 21, W, BRK2[2]);
        for (var x = 1; x < W - 2; x += 3) { g.rect(x, 23, 2, 3, 'glass'); g.set(x, 25, 'waterD'); }
        var bx = big ? 7 : 4; g.rect(bx, g.h - 7, big ? 8 : 6, 4, 'T'); g.hline(bx, g.h - 7, big ? 8 : 6, 'Tl');            // Planziel-Tafel
        for (var b = 0; b < (big ? 3 : 2); b++) g.hline(bx + 1, g.h - 6 + b, 2 + b * 2, C.white);
        g.rect(W - 4, g.h - 5, 3, 5, 'woodD');
      } else if (kind === 'ruestung') {
        g = new Grid(W, big ? 32 : 26);
        stackAt(g, W - (big ? 8 : 6), 0, 16, big ? 5 : 4, DCON, DCON[3], st);
        sawRoof(g, 0, 12, W, 5, DCON, AC(null, '#6a8090'));
        g.rect(0, 18, W, g.h - 18, DCON[1]); g.vline(0, 18, g.h - 18, DCON[0]); g.vline(W - 1, 18, g.h - 18, DCON[2]); g.hline(0, 18, W, DCON[3]);
        for (x = 2; x < W - 2; x += 4) g.vline(x, 20, 3, 'ink');
        g.rect(Math.floor(W / 2) - 2, g.h - 6, 5, 6, 'ink'); g.hline(Math.floor(W / 2) - 2, g.h - 6, 5, 'metalD');
        g.hline(0, g.h - 1, W, 'Td'); g.set(1, 19, 'fireY');
      } else if (kind === 'manufaktur') {
        g = new Grid(W, big ? 30 : 26);
        stackAt(g, W - 5, 0, 14, 3, BRK2, null, st);
        roofSide(g, 3, 10, W - 3, 8, ['stoneL', 'stone', 'stoneD'], 2);
        wallBrick(g, 3, 18, W - 3, g.h - 18, BRK2, 0); eaveShadow(g, 3, 18, W - 3, BRK2[2]);
        for (x = 5; x < W - 2; x += 4) win(g, x, 20);
        g.rect(Math.floor(W / 2) + 1, g.h - 6, 3, 6, 'woodD');
        // Wasserrad links
        g.ellipse(3, g.h - 6, 3.6, 3.6, function (px, py, nx, ny) { var d = nx * nx + ny * ny; return d > 0.6 ? 'woodD' : (d < 0.15 ? 'woodL' : ((px + py) & 1 ? 'wood' : null)); });
        g.hline(0, g.h - 1, 4, 'glass'); g.hline(0, g.h - 2, 3, 'water' in C ? 'water' : 'glass');
        // Kran rechts oben
        g.vline(W - 2, 6, 12, 'woodD'); g.hline(W - 8, 6, 7, 'woodD'); g.vline(W - 8, 7, 4, 'stoneD'); g.paint(W - 9, 11, ['vw', 'wW']);
      } else if (kind === 'fabrik') {
        g = new Grid(W, big ? 30 : 26);
        stackAt(g, 2, filtered ? 3 : 0, 14, 3, HALL, AC(null, '#d05a4a'), st);
        if (filtered) { g.rect(1, 0, 5, 3, FILT[0]); g.hline(1, 2, 5, FILT[1]); g.vline(5, 0, 3, FILT[1]); st[0][1] = -1; }
        sawRoof(g, 0, 11, W, 5, HALL, 'glass');
        paint(g, 0, 17, W, g.h - 17, HALL[0], HALL[2], C.white); g.hline(0, 17, W, HALL[2]);
        for (x = 1; x < W - 1; x += 3) { g.rect(x, 19, 2, 3, 'glass'); g.set(x, 21, 'waterD'); }
        g.rect(Math.floor(W / 2) - 1, g.h - 6, 4, 6, 'T'); g.hline(Math.floor(W / 2) - 1, g.h - 6, 4, 'Td'); for (var yy = g.h - 5; yy < g.h; yy += 2) g.hline(Math.floor(W / 2) - 1, yy, 4, 'Td');
        if (big) { g.rect(W - 6, 13, 5, 3, 'stoneD'); g.set(W - 4, 12, 'metalL'); }
      } else if (kind === 'schmiede') {
        g = new Grid(W, big ? 24 : 21);
        var bw = big ? 16 : 10;
        stackAt(g, bw - 3, 0, 12, 4, ['stoneL', 'stone', 'stoneD'], null, st);
        roofSide(g, 0, 7, bw + 1, 7, ['stoneL', 'stone', 'stoneD'], 2);
        wallBrick(g, 1, 14, bw - 1, g.h - 14, null, 1); eaveShadow(g, 1, 14, bw - 1, 'stoneD');
        g.rect(3, g.h - 5, 3, 4, 'ink'); g.set(4, g.h - 3, 'fireO'); g.set(4, g.h - 2, 'fireY'); g.set(5, g.h - 3, 'fireY');   // Glut im Tor
        g.paint(bw + 1, g.h - 4, ['mmm', '.M.', 'WWW']);          // Amboss
        if (big) { g.paint(bw + 1, g.h - 9, ['vw', 'wW']); win(g, 8, 16); }
      } else if (kind === 'ruin') {
        g = new Grid(W, big ? 28 : 24);
        g.rect(1, 6, 3, 8, RUST[1]); g.vline(1, 6, 8, RUST[0]); g.set(2, 5, RUST[1]); g.set(3, 4, RUST[2]);                     // abgebrochener Schlot
        for (x = 0; x < W; x++) { var hh = 6 + Math.floor(hash(x >> 1, lv, 77) * 6); for (yy = g.h - hh; yy < g.h; yy++) g.set(x, yy, ((x + yy) % 5 === 0) ? RUST[3] : (x === 0 ? RUST[0] : RUST[1])); }
        for (x = 2; x < W - 2; x += 4) { g.rect(x, g.h - 6, 2, 2, 'ink'); }
        g.paint(W - 6, g.h - 3, ['.gG..', 'GgGgG']); g.paint(3, g.h - 2, ['ee', 'E.']); g.set(W - 3, g.h - 8, 'leaf');
        g.line(6, g.h - 12, 10, g.h - 9, RUST[2]);
      }
      return { g: g, stacks: st };
    }
    var FKINDS = ['kombinat', 'ruestung', 'manufaktur', 'fabrik', 'schmiede', 'ruin'];
    var STACKS = {};
    FKINDS.forEach(function (kind) {
      [1, 2].forEach(function (lv) {
        [false, true].forEach(function (fl) {
          if (fl && kind !== 'fabrik') return;
          var r = factory(kind, lv, fl), n = lv >= 2 ? 3 : 2;
          var key = 's_factory_' + kind + '_' + lv + (fl ? '_filter' : '');
          defB(key, finishB(r.g), n);
          // Mündung in Logikpixeln relativ zur linken oberen Grundflächen-Kachel (Raster +1 Kontur, unten 1 Schatten)
          var H = r.g.h + 3, oy = n * 8 - H + 1;
          STACKS[key] = r.stacks.map(function (p) { var x = p[0] + 1, y = oy + p[1] + 1; return { x: x, y: y, dx: x - 6, dy: y - 14 }; });
        });
      });
    });
    S.factoryKey = function (kind, level, filtered) {
      var k = FKINDS.indexOf(kind) >= 0 ? kind : 'fabrik', lv = (level | 0) >= 2 ? 2 : 1;
      return 's_factory_' + k + '_' + lv + (filtered && k === 'fabrik' ? '_filter' : '');
    };
    // Liste der Mündungen: { x, y } = Mündung in Logikpixeln ab linker oberer Grundflächen-Ecke;
    // { dx, dy } = Zeichenversatz für fx_smokeplume_* (draw(ctx, 'fx_smokeplume_n', px + dx, py + dy)).
    S.factoryStacks = function (kind, level, filtered) { return (STACKS[S.factoryKey(kind, level, filtered)] || []).slice(); };
    // ---------------------------------------------------------------- Rauch, Dunst, krankes Land
    // Qualmwolke 12×14, Unterkante Mitte (6, 14) sitzt auf der Schornstein-Mündung (siehe factoryStacks)
    var SMK = [AC(null, '#5a5660', 235), AC(null, '#46424c', 225), AC(null, '#77727c', 210)];
    var SMC = [AC(null, '#f4f6f8', 200), AC(null, '#d8dee4', 190), AC(null, '#ffffff', 170)];
    function plume(f, P) {
      var g = new Grid(12, 14);
      for (var k = 0; k < 5; k++) {
        var t = k / 4, cy = 13 - (k * 3 + f * 0.8), r = 1.4 + t * 2.6 + f * 0.25, cx = 6 + Math.sin(k * 1.3 + f) * (0.5 + t * 1.5);
        if (cy - r < -1) continue;
        g.ellipse(cx, cy, r, r * 0.9, function (x, y, nx, ny) { return nx + ny < -0.5 ? P[2] : (ny > 0.3 ? P[1] : P[0]); });
      }
      return g;
    }
    for (var pf = 0; pf < 4; pf++) {
      def('fx_smokeplume_' + pf, plume(pf, SMK), { group: 'fx', anchor: 'icon' });
      def('fx_smokeplume_clean_' + pf, plume(pf, SMC), { group: 'fx', anchor: 'icon' });
    }
    // Dunst t_smog_1..3 (mit weichen Randvarianten) steht in sprites-world.js
    (function () {
      var g = new Grid(8, 8), m1 = AC(null, '#7a6a3e', 120), m2 = AC(null, '#5e5030', 150), m3 = AC(null, '#9a8a5a', 110);
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) { var h = hash(x, y, 410); g.set(x, y, h < 0.15 ? m2 : (h > 0.9 ? m3 : m1)); }
      def('t_murk', g, { group: 'ground' });
      var b = new Grid(8, 8), b1 = AC(null, '#9a9484', 150), b2 = AC(null, '#7c7666', 175), b3 = AC(null, '#b0aa98', 140);
      for (y = 0; y < 8; y++) for (x = 0; x < 8; x++) { var hb = hash(x, y, 420); b.set(x, y, hb < 0.12 ? b2 : (hb > 0.88 ? b3 : b1)); }
      b.line(1, 2, 3, 4, b2); b.line(3, 4, 6, 3, b2);
      def('t_barren', b, { group: 'ground' });
    })();
    // krankes Land: kahle Bäume, kranke Büsche, Stümpfe
    function deco2(key, rows, edge, sh) {
      var gr = new Grid(rows[0].length, rows.length); gr.paint(0, 0, rows);
      var o = gr.pad(1, 1, 1, 0).outline(edge).pad(0, 0, 0, 1).footShade();
      def(key, o, { group: 'decor' });
    }
    deco2('d_deadtree_1', [
      'G...G.g.',
      '.G.G.g..',
      '..GGg...',
      'g..Gg..G',
      '.g.GgGG.',
      '..gGg...',
      '...Gg...',
      '...Gg...',
      '...Gg...',
      '..GGgg..'], 'dusk');
    deco2('d_deadtree_2', [
      '.G.....',
      '..G..g.',
      '...GgG.',
      '.g.Gg..',
      '..gGg..',
      '...Gg..',
      '..GGgg.'], 'dusk');
    deco2('d_sickbush_0', ['.YyY..', 'YyHyYy', 'yHHyHY', '.YHHY.'], 'woodD');
    deco2('d_sickbush_1', ['..yY..', '.yHHy.', 'YHyyHY', 'HYHHYH'], 'woodD');
    deco2('d_stump_1', ['.wvw.', 'wWWWw', 'WwWwW'], 'ink');
    deco2('d_stump_2', ['vwv....', 'wWWw.vw', 'WwWW.WW'], 'ink');
    // ======================================================================
    // Bahnhöfe, Arbeitslager, Rohstoff-Betriebe, Fahnen
    // ---------------------------------------------------------------- Bahnhöfe (2×2)
    function platform(gr, y) { gr.rect(0, y, 14, 2, 'stoneL'); gr.hline(0, y + 1, 14, 'stoneD'); for (var x = 1; x < 14; x += 4) gr.set(x, y, 'stone'); }
    g = new Grid(14, 22);   // neutral: Holzbahnhof mit Bahnsteigdach
    roofSide(g, 0, 4, 14, 7, WOODR, 2);
    wallPlanks(g, 1, 11, 12, 7); eaveShadow(g, 1, 11, 12, 'woodD');
    door(g, 6, 13, 5); win(g, 2, 13); win(g, 10, 13);
    platform(g, 19); g.vline(0, 12, 7, 'woodD'); g.vline(13, 12, 7, 'woodD');
    defB('s_station', finishB(g), 2);
    g = new Grid(14, 25);   // Kommunismus: Ziegel mit Uhr und Fahne
    g.vline(11, 0, 9, 'woodD'); g.paint(12, 0, ['TT', 'TT', 'Tt']);
    roofSide(g, 0, 7, 14, 7, ['stoneL', 'stone', 'stoneD'], 2);
    g.ellipse(7, 7.5, 2.6, 2.6, function (x, y, nx, ny) { return nx * nx + ny * ny > 0.6 ? 'stoneD' : 'white'; }); g.set(7, 7, 'ink'); g.set(7, 6, 'ink'); g.set(8, 7, 'ink');
    wallBrick(g, 0, 14, 14, 9, BRK2, 0); eaveShadow(g, 0, 14, 14, BRK2[2]);
    g.hline(0, 14, 14, 'T'); door(g, 6, 17, 6); win(g, 2, 16); win(g, 10, 16);
    platform(g, 23);
    defB('s_station_communism', finishB(g), 2);
    g = new Grid(14, 24);   // Faschismus: grauer Block, Pfeiler, schmale Fenster
    roofFlat(g, 0, 4, 14, 5, RF[0], RF[1], RF[2]);
    g.rect(4, 0, 6, 5, DCON[1]); g.hline(4, 0, 6, DCON[0]); g.rect(6, 1, 2, 2, 'ink');
    g.rect(0, 9, 14, 13, DCON[1]); g.vline(0, 9, 13, DCON[0]); g.vline(13, 9, 13, DCON[2]); g.hline(0, 9, 14, DCON[3]);
    for (var px = 2; px < 13; px += 3) g.vline(px, 11, 6, 'ink');
    g.rect(5, 16, 4, 6, 'ink'); g.hline(5, 16, 4, DCON[3]);
    platform(g, 22);
    defB('s_station_fascism', finishB(g), 2);
    S.stationKey = function (gov) { return (gov === 'communism' || gov === 'fascism') ? 's_station_' + gov : 's_station'; };

    // ---------------------------------------------------------------- Arbeitslager (2×2): Zaun, zwei Baracken, Wachturm, kahler Boden
    var BARE = AC(null, '#9a9486', 210), BARED = AC(null, '#827c70', 220);
    function laborCamp(ruin) {
      var gr = new Grid(16, 22), G0 = 6;    // Zeile G0 = Oberkante der Grundfläche
      for (var y = G0; y < G0 + 16; y++) for (var x = 0; x < 16; x++) gr.set(x, y, hash(x, y, 91) < 0.2 ? BARED : BARE);
      function barrack(x, y, w) { gr.rect(x, y, w, 2, 'stoneD'); gr.hline(x, y, w, 'stone'); gr.rect(x, y + 2, w, 4, 'woodD'); for (var k = x + 1; k < x + w - 1; k += 3) gr.set(k, y + 3, ruin ? 'ink' : 'plum'); gr.hline(x, y + 5, w, 'ink'); }
      barrack(2, G0 + 2, 9); barrack(4, G0 + 9, 9);
      // Wachturm in der Ecke
      gr.vline(13, G0 - 6, 10, 'woodD'); gr.vline(15, G0 - 6, 10, 'woodD'); gr.line(13, G0 + 3, 15, G0 - 2, 'wood');
      gr.rect(12, G0 - 9, 5, 3, 'woodL'); gr.hline(12, G0 - 10, 5, 'stoneD'); gr.set(14, G0 - 8, ruin ? 'woodD' : 'fireY');
      // Zaun ringsum (bei der Ruine offen und umgefallen)
      for (var i = 0; i < 16; i++) {
        if (!ruin || i % 5 !== 2) { gr.set(i, G0, 'metalD'); gr.set(i, G0 + 15, 'metalD'); }
        if (i % 3 === 0) { gr.vline(i, G0 - 2, 3, 'woodD'); if (!ruin || i < 8) gr.vline(i, G0 + 13, 3, 'woodD'); }
      }
      for (y = G0; y < G0 + 16; y++) { if (!ruin || y % 4) gr.set(0, y, 'metalD'); gr.set(15, y, 'metalD'); }
      if (ruin) { gr.line(9, G0 + 15, 13, G0 + 13, 'woodD'); gr.set(7, G0 + 7, 'leaf'); gr.set(10, G0 + 14, 'leafL'); }
      // Tor: schlichte Lücke mit zwei Pfosten, keine Schrift, kein Bogen
      gr.d[(G0 + 15) * 16 + 7] = 0; gr.d[(G0 + 15) * 16 + 8] = 0; gr.vline(6, G0 + 12, 4, 'woodD'); gr.vline(9, G0 + 12, 4, 'woodD');
      return gr;
    }
    ['s_laborcamp', 's_laborcamp_communism', 's_laborcamp_fascism'].forEach(function (k) { def(k, laborCamp(false), { group: 'build', fw: 2, fh: 2, ox: 0, oy: 16 - 22 }); });
    def('s_laborcamp_ruin', laborCamp(true), { group: 'build', fw: 2, fh: 2, ox: 0, oy: 16 - 22 });
    S.laborcampKey = function (gov, ruin) { return ruin ? 's_laborcamp_ruin' : ((gov === 'communism' || gov === 'fascism') ? 's_laborcamp_' + gov : 's_laborcamp'); };

    // ---------------------------------------------------------------- Mine (2×2), Schmiede, Fischerei, Weide
    function mine(pile) {
      var gr = new Grid(14, 22);
      // Fördergerüst
      gr.line(2, 18, 5, 2, 'woodD'); gr.line(9, 18, 6, 2, 'woodD'); gr.hline(2, 10, 8, 'wood'); gr.hline(4, 2, 4, 'woodD');
      gr.ellipse(5.5, 3, 2.2, 2.2, function (x, y, nx, ny) { var d = nx * nx + ny * ny; return d > 0.55 ? 'metalD' : (d < 0.15 ? 'metal' : null); });
      gr.vline(5, 4, 9, 'stoneD');
      // Felshang mit Stolleneingang
      gr.ellipse(8, 18, 6.5, 5, function (x, y, nx, ny) { return y > 21 ? null : (nx + ny < -0.5 ? 'stoneL' : (nx > 0.4 ? 'stoneD' : 'stone')); });
      gr.rect(6, 16, 5, 6, 'ink'); gr.hline(5, 15, 7, 'woodD'); gr.vline(5, 15, 7, 'woodD'); gr.vline(11, 15, 7, 'woodD');
      gr.hline(6, 21, 5, 'metalD');
      // Lore
      gr.paint(0, 17, ['wwww', 'WwwW', '.oo.']);
      if (pile) gr.paint(10, 18, pile);
      return gr;
    }
    defB('s_mine', finishB(mine(null)), 2);
    defB('s_mine_iron', finishB(mine(['.hQ.', 'QhRQ', 'hQhR'])), 2);
    defB('s_mine_coal', finishB(mine(['.oO.', 'OoOo', 'oOdo'])), 2);
    defB('s_mine_gold', finishB(mine(['.kj.', 'kjKk', 'jKkK'])), 2);
    S.mineKey = function (ore) { return /^(iron|coal|gold)$/.test(ore) ? 's_mine_' + ore : 's_mine'; };
    def('s_smithy', L.DEFS.s_factory_schmiede_1.grid, { group: 'build', fw: 2, fh: 2, ox: 0, oy: L.DEFS.s_factory_schmiede_1.oy });
    // Fischerei am Ufer: Hütte oben, Steg nach unten ins Wasser, Netz, Boot (Wasser scheint durch)
    g = new Grid(14, 20);
    roofSide(g, 0, 2, 9, 6, WOODR, 2); wallPlanks(g, 1, 8, 7, 5); g.rect(3, 10, 2, 3, 'plum');
    g.rect(9, 9, 3, 11, 'woodL'); for (var sy = 9; sy < 20; sy += 2) g.hline(9, sy, 3, 'wood'); g.vline(9, 18, 2, 'woodD'); g.vline(11, 18, 2, 'woodD');
    for (var nx2 = 0; nx2 < 6; nx2++) for (var ny2 = 0; ny2 < 4; ny2++) if ((nx2 + ny2) & 1) g.set(1 + nx2, 14 + ny2, 'stoneL');
    g.vline(0, 13, 6, 'woodD'); g.vline(7, 13, 6, 'woodD');
    g.paint(1, 18, ['.wwwwW', 'wvvvvW', '.WWWW.']);
    defB('s_fishery', finishB(g), 2);
    // Weide: Holzzaun um 2×2, innen frei, Tränke
    g = new Grid(16, 18);
    for (var fx2 = 0; fx2 < 16; fx2++) { g.set(fx2, 3, 'woodL'); g.set(fx2, 17, 'woodL'); if (fx2 % 3 === 0) { g.vline(fx2, 2, 3, 'woodD'); g.vline(fx2, 15, 3, 'woodD'); } }
    for (var fy2 = 3; fy2 < 18; fy2++) { g.set(0, fy2, 'woodL'); g.set(15, fy2, 'woodL'); }
    g.rect(10, 12, 4, 2, 'woodD'); g.hline(11, 12, 2, 'glass');
    g.d[17 * 16 + 7] = 0; g.d[17 * 16 + 8] = 0;
    def('s_pasture', g, { group: 'build', fw: 2, fh: 2, ox: 0, oy: -2 });

    // ---------------------------------------------------------------- Fahnen in Reichsfarbe mit dem Muster des Reichs
    // Muster wie banner_<0..7>, hier als Funktion auf Tuchkoordinaten (u nach rechts, v nach unten, je 0..1)
    var FPAT = [
      function (u, v) { return v < 0.38 ? 'T' : (v < 0.62 ? 'white' : 'Td'); },                                   // Streifen
      function (u, v) { return (Math.abs(u - 0.36) < 0.1 || Math.abs(v - 0.5) < 0.13) ? 'white' : 'T'; },          // Kreuzbalken
      function (u, v) { var d = u - Math.abs(v - 0.5) * 0.9; return (d > 0.28 && d < 0.46) ? 'white' : 'T'; },      // Sparren
      function (u, v) { return (u < 0.12 || v < 0.16 || u > 0.88 || v > 0.84) ? 'Td' : 'T'; },                     // Rand
      function (u, v) { return ((Math.floor(u * 4) + Math.floor(v * 3)) & 1) ? 'white' : 'T'; },                  // Schach
      function (u, v) { var dx = u - 0.5, dy = (v - 0.5) * 0.7; return dx * dx + dy * dy < 0.045 ? 'white' : 'T'; }, // Kreis
      function (u, v) { var d = u - v; return d > 0.15 ? 'Td' : (d > -0.15 ? 'white' : 'T'); },                    // Diagonale
      function (u, v) { return (Math.abs(u - 0.5) < 0.1 && Math.abs(v - 0.5) < 0.14) ? 'white' : (v > 0.8 ? 'Td' : 'T'); } // Punkt
    ];
    // Sicherheitsregel: bei roter Reichsfarbe (Index 0) kein Kreis/Punkt (rot + heller Fleck) und kein Kreuz (Ähnlichkeit zu Landesflaggen)
    var SAFE = { 0: { 5: 2, 7: 4, 1: 6 } };
    S.safePattern = function (pattern, team) { pattern = ((pattern | 0) % 8 + 8) % 8; var r = SAFE[team | 0]; return r && r[pattern] != null ? r[pattern] : pattern; };
    function cloth(gr, x0, y0, w, h, p, wave, vertical) {
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var u = vertical ? j / h : i / w, v = vertical ? i / w : j / h;
        var c = FPAT[p](u, v);
        var dy = wave ? Math.round(Math.sin(i * 0.9 + wave * 1.6) * 0.8 * (i / w)) : 0;
        gr.set(x0 + i, y0 + j + dy, c);
      }
    }
    for (var fp = 0; fp < 8; fp++) {
      [0, 1].forEach(function (f) {
        var gr = new Grid(16, 24);
        gr.vline(1, 1, 22, 'metalD'); gr.vline(2, 1, 22, 'metal'); gr.set(1, 0, 'goldL'); gr.set(2, 0, 'gold');
        cloth(gr, 3, 2, 12, 8, fp, f + 1, false);
        if (f) { gr.set(14, 2, 0); gr.set(14, 9, 0); }
        gr.rect(0, 22, 4, 2, 'stone'); gr.hline(0, 22, 4, 'stoneL');
        def('s_flagpole_' + fp + '_' + f, gr.pad(1, 1, 1, 0).outline().pad(0, 0, 0, 1).footShade(), { group: 'flag', ox: -1, oy: 8 - 26 });
      });
      var hb = new Grid(6, 16);
      hb.hline(0, 0, 6, 'woodD'); cloth(hb, 0, 1, 6, 13, fp, 0, true);
      hb.set(0, 14, 'Td'); hb.set(5, 14, 'Td'); hb.hline(1, 14, 4, 'T'); hb.hline(2, 15, 2, 'Td');
      def('s_banner_hang_' + fp, hb.pad(1, 1, 1, 1).outline(), { group: 'flag', anchor: 'icon' });
      var rw = new Grid(8, 7);
      for (var x = 0; x < 8; x++) rw.set(x, Math.round(1 + Math.sin(x / 7 * Math.PI) * 1.5), 'woodD');
      [1, 4, 7].forEach(function (x0, k) { var yb = Math.round(1 + Math.sin(x0 / 7 * Math.PI) * 1.5) + 1, c = FPAT[fp](k / 3 + 0.1, 0.5); rw.set(x0 - 1, yb, c); rw.set(x0, yb, c); rw.set(x0 - 1, yb + 1, k & 1 ? 'Td' : 'T'); rw.set(x0 - 1, yb + 2, k & 1 ? 'Td' : 'T'); });
      def('s_banner_row_' + fp, rw, { group: 'flag', anchor: 'icon' });
    }
    // Helfer: kind = 'pole' | 'hang' | 'row' | 'center'; team optional für die Sicherheitsregel
    S.flagKey = function (kind, pattern, frame, team) {
      var p = team == null ? (((pattern | 0) % 8) + 8) % 8 : S.safePattern(pattern, team);
      if (kind === 'hang') return 's_banner_hang_' + p;
      if (kind === 'row') return 's_banner_row_' + p;
      if (kind === 'center') return 's_center_fascism_p' + p;
      return 's_flagpole_' + p + '_' + ((frame | 0) & 1);
    };
    // Kommandantur mit den Fassadenbannern im Muster des Reichs
    for (fp = 0; fp < 8; fp++) {
      var cg = new Grid(CW, 32), Cc = [CONC[2], CONC[0], CONC[1]];
      roofFlat(cg, 0, 4, 22, 5, RF[0], RF[1], RF[2]); roofFlat(cg, 6, 1, 10, 4, RF[0], RF[1], RF[2]);
      cg.set(1, 3, 'fireY'); cg.set(2, 3, 'metalD'); cg.set(20, 3, 'fireY'); cg.set(19, 3, 'metalD');
      paint(cg, 0, 9, 22, 21, Cc[1], Cc[2], Cc[0]); paint(cg, 6, 5, 10, 25, Cc[0], Cc[2], 'white'); cg.hline(0, 9, 22, Cc[2]);
      for (var bx2 = 2; bx2 < 6; bx2 += 2) for (var by2 = 11; by2 < 27; by2 += 5) { cg.vline(bx2, by2, 3, 'ink'); cg.vline(bx2 + 15, by2, 3, 'ink'); }
      [6, 13].forEach(function (bx) { cloth(cg, bx, 6, 3, 16, fp, 0, true); cg.set(bx + 1, 22, 'Td'); });
      cg.rect(10, 22, 2, 8, 'ink'); cg.hline(9, 21, 4, Cc[2]); cg.hline(5, 30, 12, Cc[0]); cg.hline(4, 31, 14, Cc[2]);
      defB('s_center_fascism_p' + fp, finishB(cg), 3, 'center');
    }
    // ======================================================================
    // Feine Gebäude (Maßstab 0,5, gleiche Schlüssel über Umleitung, träge erzeugt).
    // a) Häuser: eigener Generator im doppelt feinen Raster mit Dachziegeln, Fachwerk, Fensterkreuzen, Türen mit Schwelle,
    //    Dachrinne, Verwitterung, Schlagschatten. b) Übrige Gebäude: Verfeinerung des groben Sprites (2× vergrößern,
    //    Flächen nach Material neu texturieren, feine Kontur). Je Gebäude eine Nachtfassung mit leuchtenden Fenstern (_lit).
    var HCOL = function (h) { return AC(null, h); };
    var LITC = [HCOL('#fff2b0'), HCOL('#ffd060'), HCOL('#e09a38')];
    var GLC = [HCOL('#d8f2ff'), HCOL('#8ccbea'), HCOL('#4a86b4')];
    var MORT = HCOL('#cfc8bc'), MORTD = HCOL('#9c958a'), GUT = HCOL('#7a7e88');
    // Ton-Nachbarn je Material (für Fugen, Kanten, Verwitterung)
    var DARKER = {}, LIGHTER = {}, CLS = {};
    function ramp(names, cls) { var ids = names.map(function (n) { return typeof n === 'number' ? n : C[n]; }); for (var i = 0; i < ids.length; i++) { CLS[ids[i]] = cls; DARKER[ids[i]] = ids[Math.min(ids.length - 1, i + 1)]; LIGHTER[ids[i]] = ids[Math.max(0, i - 1)]; } }
    ramp(['white', 'stoneL', 'stone', 'stoneD', 'plum'], 'stone'); ramp(['redL', 'red', 'redD'], 'brick'); ramp(BRK2.slice(0, 3), 'brick');
    ramp(['woodL', 'wood', 'woodD'], 'wood'); ramp(['strawL', 'straw', 'strawD'], 'straw'); ramp(['Tl', 'T', 'Td'], 'tile');
    ramp(['cream', 'sandD'], 'plaster'); ramp(['glass', 'waterD'], 'glass'); ramp(['leafL', 'leaf', 'leafD'], 'leaf');
    ramp(DCON.slice(0, 3), 'concrete'); ramp(CONC, 'concrete'); ramp(RF, 'concrete'); ramp(PANEL, 'panel');
    ramp(['goldL', 'gold', 'goldD'], 'metal'); ramp(['metalL', 'metal', 'metalD'], 'metal');
    function texel(c, X, Y) {
      var cls = CLS[c], d = DARKER[c] || c, l = LIGHTER[c] || c, h = hash(X, Y, 701);
      switch (cls) {
        case 'stone': { var row = Math.floor(Y / 4), off = (row & 1) * 4; if (Y % 4 === 3 || (X + off) % 8 === 7) return d; return h < 0.03 ? l : c; }
        case 'brick': { var r2 = Math.floor(Y / 2), o2 = (r2 & 1) * 2; if (Y % 2 === 1 && (X + o2) % 4 !== 3) return h < 0.5 ? c : d; if ((X + o2) % 4 === 3) return MORTD; return h < 0.15 ? l : c; }
        case 'wood': return X % 3 === 2 ? d : (h < 0.04 ? d : c);
        case 'straw': return ((X * 3 + Y * 2) % 5 === 0) ? d : (((X + Y * 3) % 7 === 0) ? l : c);
        case 'tile': { var tr = Math.floor(Y / 3), to = (tr & 1) * 2; if (Y % 3 === 2) return d; if ((X + to) % 4 === 3) return d; return Y % 3 === 0 ? l : c; }
        case 'plaster': return h < 0.05 ? d : c;
        case 'leaf': return h < 0.2 ? l : (h > 0.85 ? d : c);
        case 'concrete': return (X % 8 === 7 || Y % 7 === 6) ? d : (h < 0.04 ? l : c);
        case 'panel': return (X % 6 === 5 || Y % 5 === 4) ? d : c;
        default: return c;
      }
    }
    // grobes Sprite -> feines Sprite
    function upscale(src, lit) {
      var w = src.w, h = src.h, o = new Grid(w * 2, h * 2);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var c = src.d[y * w + x];
        if (!c) continue;
        if (c === C.ink && (!src.get(x - 1, y) || !src.get(x + 1, y) || !src.get(x, y - 1) || !src.get(x, y + 1))) continue;   // Kontur weg, Innen-Dunkel (Bögen, Scharten) bleibt
        for (var j = 0; j < 2; j++) for (var i = 0; i < 2; i++) {
          var X = x * 2 + i, Y = y * 2 + j, v = c;
          if (c === C.shade || c === C.shadeL) v = c;
          else if (CLS[c] === 'glass') {
            var pal = lit ? LITC : GLC, up = src.get(x, y - 1), left = src.get(x - 1, y);
            v = (CLS[up] !== 'glass' && j === 0) || (CLS[left] !== 'glass' && i === 0) ? (lit ? pal[0] : C.woodL) : (c === C.waterD ? pal[2] : (i === 0 && j === 1 ? pal[0] : pal[1]));
          } else v = texel(c, X, Y);
          o.d[Y * o.w + X] = v;
        }
      }
      // feine Kontur und Lichtkante oben links
      var out = o.outline();
      for (y = 1; y < out.h; y++) for (x = 1; x < out.w; x++) {
        var cc = out.d[y * out.w + x];
        if (!cc || cc === C.ink || cc === C.shade || cc === C.shadeL) continue;
        if (out.d[(y - 1) * out.w + x] === C.ink && LIGHTER[cc] && hash(x, y, 702) < 0.7) out.d[y * out.w + x] = LIGHTER[cc];
      }
      return out;
    }

    // ---------------------------------------------------------------- Hausgenerator im feinen Raster
    function winH(g, x, y, lit, shutter, tall) {
      var hh = tall ? 7 : 5, P = lit ? LITC : GLC;
      g.rect(x - 1, y - 1, 6, hh + 2, C.woodD);                       // Rahmen
      g.rect(x, y, 4, hh, P[1]); g.set(x, y, P[0]); g.set(x + 1, y, P[0]); g.set(x, y + 1, P[0]);
      g.vline(x + 3, y, hh, P[2]); g.hline(x, y + hh - 1, 4, P[2]);
      g.vline(x + 1.5 | 0, y, hh, C.woodL); g.hline(x, y + (tall ? 3 : 2), 4, C.woodL);  // Fensterkreuz
      g.hline(x - 2, y + hh + 1, 8, C.stoneL); g.hline(x - 1, y + hh + 2, 6, C.stoneD); // Sims
      if (shutter) { g.rect(x - 3, y - 1, 2, hh + 2, shutter[1]); g.rect(x + 5, y - 1, 2, hh + 2, shutter[2]); g.set(x - 3, y, shutter[0]); }
    }
    function doorH(g, x, y, h, col, lit) {
      g.rect(x - 1, y - 1, 8, h + 1, C.woodD);
      g.rect(x, y, 6, h, col || C.wood); g.vline(x + 2, y, h, C.woodD); g.vline(x + 4, y + 1, h - 1, C.woodD); g.vline(x, y, h, C.woodL);
      g.set(x + 4, y + (h >> 1), C.goldL); g.set(x + 4, y + (h >> 1) + 1, C.gold);
      if (lit) { g.rect(x + 1, y + 1, 4, 2, LITC[1]); g.set(x + 1, y + 1, LITC[0]); }
      g.hline(x - 2, y + h, 10, C.stoneL); g.hline(x - 1, y + h + 1, 8, C.stone);            // Schwelle/Stufe
    }
    function chimneyH(g, x, top, h) {
      for (var y = top; y < top + h; y++) for (var i = 0; i < 4; i++) g.set(x + i, y, ((y + (i >> 1)) & 1) ? C.redD : (i === 0 ? C.redL : C.red));
      g.rect(x - 1, top - 2, 6, 2, C.stoneD); g.hline(x - 1, top - 2, 6, C.stone); g.set(x + 1, top - 2, C.ink); g.set(x + 2, top - 2, C.ink);
    }
    function roofTiles(g, x, y, w, h, t, back) {
      back = back == null ? Math.max(4, Math.round(h / 3.4)) : back;
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var c;
        if (j < back) c = (i === w - 1) ? t[1] : t[0];
        else if (j === back) c = t[0];
        else if (j >= h - 2) c = j === h - 1 ? C.ink : t[2];
        else {
          var jj = j - back - 1, row = Math.floor(jj / 3), off = (row & 1) * 2;
          c = (jj % 3 === 2) ? t[2] : ((i + off) % 4 === 3 ? t[2] : (jj % 3 === 0 ? t[0] : t[1]));
          if (i === 0) c = t[0]; if (i === w - 1) c = t[2];
        }
        g.set(x + i, y + j, c);
      }
      for (var k = 1; k < w - 1; k += 3) g.set(x + k, y + back, (k % 6 === 1) ? t[1] : t[0]);   // Firstziegel
      g.set(x, y, 0); g.set(x + w - 1, y, 0); g.set(x, y + 1, 0); g.set(x + w - 1, y + 1, 0);
      g.hline(x + 1, y + h, w - 2, GUT);                                                       // Dachrinne
    }
    function roofHipT(g, x, y, w, h, t) {
      roofTiles(g, x, y, w, h, t);
      var k = Math.min(Math.floor(w / 3), h - 4);
      for (var j = 0; j < k; j++) { var ins = k - j; for (var i = 0; i < ins; i++) { g.set(x + i, y + j, 0); g.set(x + w - 1 - i, y + j, 0); } g.set(x + ins, y + j, t[0]); g.set(x + w - 1 - ins, y + j, t[2]); }
    }
    function thatchT(g, x, y, w, h) {
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var ins = j === 0 ? 4 : (j === 1 ? 2 : (j === 2 ? 1 : 0));
        if (i < ins || i >= w - ins) continue;
        var c = ((i * 3 + j * 2) % 5 === 0) ? C.strawD : (j < 3 || i === ins ? C.strawL : C.straw);
        if (i >= w - ins - 2) c = C.strawD;
        g.set(x + i, y + j, c);
      }
      for (var k = 0; k < w; k++) { g.set(x + k, y + h, (k & 1) ? C.strawD : C.straw); if (k % 3 === 0) g.set(x + k, y + h + 1, C.strawD); }
      g.hline(x + 3, y + 3, w - 6, C.woodD); g.hline(x + 3, y + Math.floor(h * 0.6), w - 6, C.strawD);
    }
    function coneThatch(g, cx, y, w, h) {
      for (var j = 0; j < h; j++) { var hw = 1 + j * (w / 2) / h; for (var i = Math.floor(cx - hw); i <= Math.ceil(cx + hw); i++) { var dx = i - cx; if (Math.abs(dx) > hw) continue; g.set(i, y + j, dx < -hw * 0.4 ? C.strawL : (dx > hw * 0.45 ? C.strawD : (((i + j * 2) % 5 === 0) ? C.strawD : C.straw))); } }
      for (var k = Math.floor(cx - w / 2); k < cx + w / 2; k += 2) g.set(k, y + h, C.strawD);
      g.vline(Math.round(cx), y - 3, 3, C.woodD); g.set(Math.round(cx) - 1, y - 3, C.woodD); g.set(Math.round(cx) + 1, y - 3, C.woodD);
    }
    function frontT(g, x, y, w, h, t, gh, wallC) {
      var cx = x + (w - 1) / 2;
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) { var px = x + i; g.set(px, y + j, px < cx - 0.1 ? ((j % 3 === 2) ? t[2] : (i === 0 ? t[0] : t[1])) : (px > cx + 0.1 ? ((j % 3 === 2) ? C.ink : t[2]) : t[0])); }
      var top = y + h - gh;
      for (j = 0; j < gh; j++) { var half = (j + 1) / gh * (w / 2 - 2); for (i = 0; i < w; i++) { var dx = x + i - cx; if (Math.abs(dx) <= half - 0.5) g.set(x + i, top + j, wallC(x + i, top + j)); else if (Math.abs(dx) <= half + 1) g.set(x + i, top + j, dx < 0 ? C.woodL : C.woodD); } }
      g.set(Math.round(cx), top + Math.floor(gh * 0.55), GLC[1]); g.set(Math.round(cx) - 1, top + Math.floor(gh * 0.55), GLC[0]);
    }
    function flatT(g, x, y, w, h) {
      g.rect(x, y, w, h, RF[0]); g.hline(x, y, w, RF[2]); g.hline(x, y + h - 1, w, RF[1]); g.vline(x + w - 1, y, h, RF[1]);
      g.hline(x, y + h, w, C.ink); g.rect(x + 3, y + 2, 4, 3, RF[1]); g.hline(x + 3, y + 2, 4, RF[2]); g.rect(x + w - 7, y + 2, 3, 2, C.metalD);
    }
    function shedT(g, x, y, w, h, t) {
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) { if (j < Math.floor(i * (h - 5) / w)) continue; g.set(x + i, y + j, j >= h - 1 ? C.ink : ((j % 3 === 2) ? t[2] : (i === 0 ? t[0] : t[1]))); }
    }
    function wallFill(kind, g, x, y, w, h, col, seed) {
      var i, j;
      for (j = 0; j < h; j++) for (i = 0; i < w; i++) {
        var X = x + i, Y = y + j, c, hh = hash(X, Y, seed || 5);
        if (kind === 'planks') c = (i % 3 === 2) ? C.woodD : (hh < 0.05 ? C.woodD : (i % 6 === 0 ? C.woodL : C.wood));
        else if (kind === 'plaster') c = hh < 0.04 ? C.sandD : C.cream;
        else if (kind === 'brick') { var br = Math.floor(j / 2), bo = (br & 1) * 2; c = (j % 2 === 1 && (i + bo) % 4 !== 3) ? col[1] : ((i + bo) % 4 === 3 ? MORTD : (hh < 0.2 ? col[0] : col[1])); if (j % 2 === 1) c = MORT; if ((i + bo) % 4 === 3) c = MORT; if (c !== MORT && hh > 0.9) c = col[2]; }
        else if (kind === 'stone') { var sr = Math.floor(j / 3), so = (sr & 1) * 3 + (hash(sr, 0, 9) * 3 | 0); c = (j % 3 === 2 || (i + so) % 7 === 6) ? C.stoneD : (hh < 0.15 ? C.stoneL : C.stone); }
        else if (kind === 'concrete') c = (i % 8 === 7 || j % 9 === 8) ? col[2] : (hh < 0.05 ? col[2] : col[1]);
        else if (kind === 'panel') c = (i % 7 === 6 || j % 8 === 7) ? col[1] : col[0];
        else if (kind === 'patch') { var pi = (Math.floor((i + seed) / 5) + Math.floor(j / 4) * 3) % 5; c = [C.woodL, C.cream, C.sandL, C.wood, C.pink][pi]; if (i % 5 === 4) c = C.woodD; }
        else c = hh < 0.05 ? col[1] : col[0];   // Putz in Farbe
        g.set(X, Y, c);
      }
      // Lichtkante links, Schatten rechts, Sockel
      for (j = 0; j < h; j++) { g.set(x, y + j, LIGHTER[g.get(x, y + j)] || g.get(x, y + j)); g.set(x + w - 1, y + j, DARKER[g.get(x + w - 1, y + j)] || C.ink); }
      if (kind === 'plaster') {   // Fachwerk: Ständer, Riegel, Streben
        for (i = 0; i < w; i += 7) g.vline(x + Math.min(i, w - 2), y, h, C.woodD);
        g.vline(x + w - 2, y, h, C.woodD); g.hline(x, y, w, C.woodD); g.hline(x, y + (h >> 1), w, C.woodD); g.hline(x, y + h - 2, w, C.woodD);
        for (i = 0; i + 7 < w; i += 14) g.line(x + i + 1, y + (h >> 1) - 1, x + i + 6, y + 1, C.woodD);
      }
      if (kind === 'paint' || kind === 'plaster' || kind === 'brick') { g.hline(x, y + h - 2, w, C.stoneD); g.hline(x, y + h - 1, w, C.stone); }
      // Verwitterung unten
      for (i = 0; i < w; i++) if (hash(x + i, y, seed + 3) < 0.25) g.set(x + i, y + h - 3, DARKER[g.get(x + i, y + h - 3)] || g.get(x + i, y + h - 3));
    }
    function genHouseH(o, lit, n) {
      n = n || 2;
      var GW = n * 16 - 2, stories = o.stories || 1, sh = (o.storyH || 5) * 2, wallH = 4 + stories * sh, roofH = (o.roofH || 9) * 2;
      var x = (o.x == null ? 1 : o.x) * 2 + 1, w = (o.w || 12) * 2, top = o.tower ? 18 : 8, rt = o.rt || TR, col = o.col;
      if (n === 3 && o.w) { x = o.x * 2 + 1; }
      var H = top + roofH + wallH, g = new Grid(GW, H), wy = top + roofH;
      if (o.chimney != null) chimneyH(g, x + o.chimney * 2, top - 6, 10);
      var R = o.roof;
      if (R === 'side') roofTiles(g, x - 2, top, w + 4, roofH, rt);
      else if (R === 'hip') roofHipT(g, x - 2, top, w + 4, roofH, rt);
      else if (R === 'front') frontT(g, x - 2, top, w + 4, roofH, rt, Math.min(12, roofH - 4), function (px, py) { return o.wall === 'plaster' ? ((px - x) % 6 === 0 || (py % 5 === 0) ? C.woodD : C.cream) : (o.wall === 'planks' ? ((px % 3 === 2) ? C.woodD : C.woodL) : (col ? col[0] : C.cream)); });
      else if (R === 'thatch') thatchT(g, x - 2, top, w + 4, roofH);
      else if (R === 'cone') coneThatch(g, x + w / 2, top - 2, w + 6, roofH + 2);
      else if (R === 'shed') shedT(g, x - 2, top, w + 4, roofH, rt);
      else if (R === 'flat') flatT(g, x, top + roofH - 10, w, 10);
      else if (R === 'patch') { for (var j = 0; j < roofH; j++) for (var i = 0; i < w + 4; i++) g.set(x - 2 + i, top + j + Math.floor(i / 12), [C.red, C.purple, C.straw, C.glass, C.pink, C.leafL, C.fireO, 'Tl', 'T'][(Math.floor(i / 5) + Math.floor(j / 4) * 2 + (o.seed || 1)) % 9]); g.hline(x - 2, top + roofH, w + 4, C.woodD); }
      else if (R === 'step') {   // Treppengiebel
        for (j = 0; j < roofH; j++) { var ins = Math.max(0, Math.floor((roofH - 2 - j) / 4) * 2); for (i = ins; i < w - ins; i++) g.set(x + i, top + j, i === ins ? col[0] : (i === w - ins - 1 ? col[2] : col[1])); if (ins > 0 && (j % 4) === 0) { g.set(x + ins, top + j, C.stoneL); g.set(x + w - ins - 1, top + j, C.stoneL); } }
        winH(g, x + (w >> 1) - 2, top + roofH - 9, lit);
      }
      wallFill(o.wall, g, x, wy, w, wallH, col, o.seed || 7);
      for (i = x; i < x + w; i++) { if (g.get(i, wy)) g.set(i, wy, DARKER[DARKER[g.get(i, wy)]] || C.ink); }   // Schatten unter der Traufe
      // Fenster je Geschoss, Tür unten
      var step = (o.winStep || 4) * 2, dx = x + (w >> 1) - 3;
      for (var s2 = 0; s2 < stories; s2++) {
        var yy = wy + 3 + s2 * sh, last = s2 === stories - 1;
        for (var k = x + 3; k + 5 < x + w - 1; k += step) {
          if (last && Math.abs(k - dx) < 6) continue;
          if (o.wall === 'concrete' && !o.shop) { g.rect(k + 1, yy, 2, sh - 4, lit ? LITC[1] : C.ink); g.set(k + 1, yy, lit ? LITC[0] : C.dusk); }
          else winH(g, k, yy, lit && hash(k, s2, 31) < 0.8, (o.wall === 'plaster' || o.wall === 'paint') && o.shutters !== false ? ['Tl', 'T', 'Td'] : null, sh >= 10 && !last);
          if (o.balcony && !last) { g.hline(k - 2, yy + sh - 3, 9, C.metalD); for (var b2 = k - 2; b2 < k + 7; b2 += 2) g.set(b2, yy + sh - 4, C.metalD); }
        }
      }
      if (o.barn) { var bw = 10, bx = x + (w >> 1) - 5, by = wy + wallH - 12; g.rect(bx, by, bw, 12, C.woodD); g.rect(bx + 1, by + 1, bw - 2, 11, C.wood); g.line(bx + 1, by + 1, bx + bw - 2, by + 11, C.woodD); g.line(bx + bw - 2, by + 1, bx + 1, by + 11, C.woodD); }
      else doorH(g, dx, wy + wallH - 10, 9, o.doorCol, lit);
      if (o.shop) { var ay = wy + wallH - 14; for (i = x; i < x + w; i++) { g.set(i, ay, ((i >> 1) & 1) ? 'T' : C.white); g.set(i, ay + 1, ((i >> 1) & 1) ? 'Td' : C.cream); } for (i = x + 1; i < x + w; i += 2) g.set(i, ay + 2, ((i >> 1) & 1) ? 'Td' : C.cream); }
      if (o.annex) {
        var ax = o.annex > 0 ? x + w : 1, aw = o.annex > 0 ? GW - 1 - (x + w) : x - 1;
        if (aw >= 6) { shedT(g, ax, H - 18, aw, 8, o.annexRoof || WOODR); wallFill('planks', g, ax, H - 10, aw, 10, null, 3); g.rect(ax + (aw >> 1) - 1, H - 7, 3, 7, C.plum); }
      }
      if (o.tower) {
        var tx = o.tower > 0 ? GW - 10 : 0;
        for (j = 0; j < 16; j++) { var hw = 0.6 + j * 0.3; for (i = 0; i < 10; i++) { var ddx = i - 4.5; if (Math.abs(ddx) <= hw) g.set(tx + i, j, ddx < -1 ? rt[0] : (ddx < 1 ? rt[1] : rt[2])); } }
        g.hline(tx, 16, 10, C.ink); wallFill(o.wall === 'concrete' || o.wall === 'panel' || o.wall === 'paint' ? 'stone' : o.wall, g, tx, 17, 10, H - 17, col, 11);
        winH(g, tx + 3, 21, lit, null, true);
      }
      if (o.dormer) { var dd = x + (w >> 1) - 4; g.rect(dd - 1, top + 3, 10, 7, rt[2]); g.rect(dd, top + 5, 8, 5, C.cream); winH(g, dd + 2, top + 6, lit); }
      return g;
    }
    // Parameter der Varianten a/b (bisher handgezeichnet) für den feinen Generator
    var AB = {
      rustic: function (lv) { return [
        { roof: 'thatch', wall: 'planks', x: 2, w: 10, roofH: 7 + lv, stories: 1, seed: 1 },
        { roof: 'cone', wall: 'planks', x: 2, w: 10, roofH: 8 + lv, stories: 1, seed: 2 },
        { roof: 'patch', wall: 'patch', x: 1, w: 12, roofH: 6, stories: lv >= 3 ? 2 : 1, seed: lv },
        { roof: 'patch', wall: 'patch', x: 2, w: 11, roofH: 5, stories: 1, seed: lv + 4, annex: 1 }]; },
      timber: function (lv) { return [
        { roof: 'side', wall: 'plaster', x: 1, w: 12, roofH: 9, stories: lv >= 3 ? 2 : 1, chimney: 9 },
        { roof: 'front', wall: 'plaster', x: 1, w: 12, roofH: 10, stories: lv >= 2 ? 2 : 1, chimney: 2 }]; },
      town: function (lv) { return [
        { roof: 'side', wall: 'paint', col: PASTEL[lv % 5], x: 1, w: 12, roofH: 9, stories: lv, chimney: 2, dormer: lv >= 3 },
        { roof: 'step', wall: 'brick', col: lv === 2 ? ['redL', 'red', 'redD'].map(function (n2) { return C[n2]; }) : BRK2, x: 1, w: 12, roofH: 10, stories: lv + 1 }]; },
      block: function (lv) { return [
        { roof: 'flat', wall: 'concrete', col: CONC, x: 0, w: 14, roofH: 5, stories: lv, storyH: 5 },
        { roof: 'flat', wall: 'panel', col: PANEL, x: 0, w: 14, roofH: 5, stories: lv + 1, storyH: 4, winStep: 3 }]; }
    };
    function houseParams(fam, lv, v) {
      var idx = 'abcdefgh'.indexOf(v), ab = AB[fam] && AB[fam](lv);
      if (ab && ab[idx]) return ab[idx];
      var vv = VAR[fam] && VAR[fam](lv);
      return vv && vv[idx];
    }
    function finishH(g, n) {   // feine Kontur, Schlagschatten rechts (4 px) und Bodenschatten
      var o = g.pad(1, 1, 1, 1).outline(), H = o.h, W = o.w, out = o.pad(0, 0, 4, 1);
      for (var y = Math.max(0, H - n * 16 + 6); y < H - 1; y++) { var xr = -1; for (var x = W - 1; x >= 0; x--) if (o.get(x, y)) { xr = x; break; } if (xr < 0) continue; for (var k = 1; k <= 4; k++) if (!out.get(xr + k, y)) out.set(xr + k, y, k > 2 ? C.shadeL : C.shade); }
      return out.footShade();
    }
    L.lazyDef('hb_', function (key) {
      var lit = /_lit$/.test(key), k = key.replace(/_lit$/, ''), m, g, n = 2;
      if ((m = /^hb_house_(rustic|timber|town|block)_(\d)_([a-h])$/.exec(k))) {
        var o = houseParams(m[1], +m[2], m[3]); if (!o) return null;
        g = finishH(genHouseH(o, lit, 2), 2);
      } else if ((m = /^hb_hall_([ab])$/.exec(k))) {
        n = 3;
        g = finishH(genHouseH(m[1] === 'a' ? { roof: 'side', wall: 'planks', x: 2, w: 18, roofH: 9, stories: 1, chimney: 13, rt: TR } : { roof: 'front', wall: 'planks', x: 3, w: 16, roofH: 12, stories: 1, rt: TR }, lit, 3), 3);
      } else if ((m = /^hb_up_(.+)$/.exec(k))) {
        var d = L.DEFS[m[1]]; if (!d) return null;
        var gg = upscale(d.grid, lit);
        return { grid: gg, scale: 0.5, fw: d.fw, fh: d.fh, ox: d.ox, oy: d.oy };
      } else return null;
      return { grid: g, scale: 0.5, fw: n, fh: n, ox: 0, oy: n * 8 - g.h * 0.5 + 0.5 };
    });
    // Umleitungen: Häuser aller Familien, Halle, Zelte, Lager, Regierungssitze
    var LITMAP = {};
    Object.keys(L.DEFS).forEach(function (k) {
      var m = /^s_house_(rustic|timber|town|block)_(\d)_([a-h])$/.exec(k) || (/^s_house_(\d)_([ab])$/.test(k) ? ['', 'timber', k.split('_')[2], k.split('_')[3]] : null);
      var t = null;
      if (m) t = 'hb_house_' + m[1] + '_' + m[2] + '_' + m[3];
      else if (/^s_hall_[ab]$/.test(k)) t = 'hb_hall_' + k.slice(-1);
      else if (/^(s_tent_[a-d]|s_camp_[ab](_[01])?|s_center_[a-z]+(_p\d)?)$/.test(k)) t = 'hb_up_' + k;
      if (!t) return;
      L.ALIAS[k] = t; LITMAP[k] = t + '_lit'; LITMAP[t] = t + '_lit';
    });
    // Nachtfassung: leuchtende Fenster (Schlüssel bleibt gleich, Helfer liefert den passenden Nacht-Schlüssel)
    S.litKey = function (key) { return LITMAP[key] || key; };
    // ======================================================================
    // Etappe 2: Materialklassen der Mauerstile, Regierungssitze neu im feinen Raster, Umleitung aller Stadtgebäude
    ['monarchy', 'democracy', 'fascism', 'communism', 'theocracy', 'republic', 'player', 'tribe2', 'tribe3', 'tribe4'].forEach(function (k) {
      var m = MAT[k]; if (!m) return;
      var cls = { brick: 'brick', ashlar: 'stone', smooth: 'concrete', panel: 'panel', stakes: 'wood', planksH: 'wood', earth: 'plaster' }[m.pat];
      if (!cls) return;
      var ids = [m.topL, m.faceL, m.top, m.face, m.joint, m.base].map(function (n) { return typeof n === 'number' ? n : C[n]; });
      var uniq = []; ids.forEach(function (i) { if (uniq.indexOf(i) < 0 && !CLS[i]) uniq.push(i); });
      if (uniq.length) ramp(uniq, cls);
    });
    // --- Baukasten für feine Großbauten
    function blocks(g, x, y, w, h, t, bw, bh) {   // Quadermauerwerk mit Fugen und Tonvariation
      bw = bw || 6; bh = bh || 4;
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var row = Math.floor(j / bh), off = (row & 1) * (bw >> 1), bx = Math.floor((i + off) / bw), hv = hash(bx, row, 77 + x);
        var c = (j % bh === bh - 1 || (i + off) % bw === bw - 1) ? t[3] : (hv < 0.25 ? t[0] : (hv > 0.85 ? t[2] : t[1]));
        if (i === 0 && c !== t[3]) c = t[0]; if (i === w - 1) c = t[3];
        g.set(x + i, y + j, c);
      }
    }
    function merlons(g, x, y, w, t) { for (var i = 0; i < w; i++) { var on = (Math.floor(i / 3) & 1) === 0; if (on) { g.set(x + i, y, i % 3 === 0 ? t[0] : t[1]); g.set(x + i, y + 1, t[1]); } g.set(x + i, y + 2, t[2]); } }
    function coneRoof(g, cx, y, w, h) {
      for (var j = 0; j < h; j++) {
        var hw = 0.5 + (j / (h - 1)) * (w / 2);
        for (var i = Math.floor(cx - hw); i <= Math.ceil(cx + hw); i++) {
          var dx = i + 0.5 - cx; if (Math.abs(dx) > hw) continue;
          var c = dx < -hw * 0.35 ? 'Tl' : (dx > hw * 0.4 ? 'Td' : 'T');
          if (j % 3 === 2 && ((i + j) & 1)) c = 'Td';
          g.set(i, y + j, c);
        }
      }
      g.hline(Math.round(cx - w / 2), y + h, w + 1, C.ink);
    }
    function roundTower(g, x, y, w, h, t) {   // Zylinder: Licht links, Schatten rechts, Steinlagen
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var u = i / (w - 1), row = Math.floor(j / 4), off = (row & 1) * 3, seam = j % 4 === 3 || (i + off) % 6 === 5;
        var c = u < 0.2 ? t[0] : (u > 0.75 ? t[2] : t[1]);
        g.set(x + i, y + j, seam ? t[3] : c);
      }
    }
    function slit(g, x, y, lit) { g.vline(x, y, 4, lit ? LITC[1] : C.ink); g.vline(x + 1, y, 4, lit ? LITC[2] : C.plum); }
    function archDoor(g, x, y, w, h, lit) {   // Torbogen mit Tiefe: Laibung, Holztor mit Eisenbändern
      for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
        var dx = (i + 0.5 - w / 2) / (w / 2), arc = j < w / 2 ? (1 - dx * dx) * (w / 2) >= (w / 2 - j) : true;
        if (!arc) continue;
        var edge = i === 0 || i === w - 1 || (j < w / 2 && (1 - dx * dx) * (w / 2) < (w / 2 - j) + 1.4);
        g.set(x + i, y + j, edge ? C.stoneD : ((i % 3 === 1) ? C.woodD : C.wood));
      }
      for (j = 3; j < h; j += 4) g.hline(x + 1, y + j, w - 2, C.metalD);
      g.vline(x + (w >> 1), y + 2, h - 2, C.ink);
      if (lit) { g.rect(x + 2, y + h - 4, w - 4, 1, LITC[2]); }
      g.hline(x - 1, y + h, w + 2, C.stoneL);
    }
    function flagH(g, x, y, h) { g.vline(x, y, h, C.woodD); g.set(x, y - 1, C.goldL); for (var j = 0; j < 6; j++) for (var i = 0; i < 9; i++) if (i < 9 - (j === 0 || j === 5 ? 1 : 0)) g.set(x + 1 + i, y + j + (i > 5 ? 1 : 0), j < 2 ? 'Tl' : (j > 3 ? 'Td' : 'T')); }
    var STN = [C.stoneL, C.stone, C.stoneD, HCOL('#6e6a70')];
    var WHT = [C.white, HCOL('#ece6d8'), HCOL('#d2c8b2'), HCOL('#b4a88e')];
    var GLD = [C.goldL, C.gold, C.goldD, HCOL('#8a5a1a')];
    var CG = 46;   // Innenbreite 3×3
    function centerHi(gov, lit, pat) {
      var g, x, y, i, j;
      if (gov === 'monarchy') {
        g = new Grid(CG, 74);
        roundTower(g, 0, 22, 12, 48, STN); roundTower(g, 34, 22, 12, 48, STN);
        coneRoof(g, 6, 6, 14, 16); coneRoof(g, 40, 6, 14, 16); g.vline(6, 1, 5, C.woodD); g.vline(40, 1, 5, C.woodD); g.paint(7, 1, ['TTT', 'Tt.']); g.paint(41, 1, ['TTT', 'Tt.']);
        blocks(g, 13, 16, 20, 54, STN); merlons(g, 13, 13, 20, STN); flagH(g, 22, 0, 13);
        for (i = 0; i < 2; i++) { slit(g, 4 + i * 34, 32, lit); slit(g, 4 + i * 34, 46, lit); }
        winH(g, 17, 24, lit, null, true); winH(g, 25, 24, lit, null, true);
        blocks(g, 4, 46, 38, 24, STN, 8, 4); merlons(g, 4, 43, 38, STN);
        g.rect(9, 48, 4, 12, 'T'); g.vline(12, 48, 12, 'Td'); g.rect(33, 48, 4, 12, 'T'); g.vline(36, 48, 12, 'Td'); g.set(10, 60, 'Td'); g.set(34, 60, 'Td');
        archDoor(g, 17, 52, 12, 18, lit);
      } else if (gov === 'democracy') {
        g = new Grid(CG, 70);
        // Uhrturm mit Kuppel
        g.ellipse(23, 8, 6, 6, function (px, py, nx, ny) { return py > 9 ? null : (nx + ny < -0.6 ? GLD[0] : (nx > 0.35 ? GLD[2] : GLD[1])); }); g.vline(23, 0, 3, GLD[2]);
        blocks(g, 16, 10, 14, 16, WHT, 7, 4);
        g.ellipse(23, 16.5, 4.5, 4.5, function (px, py, nx, ny) { return nx * nx + ny * ny > 0.7 ? GLD[2] : C.white; }); g.line(23, 17, 23, 13, C.ink); g.line(23, 17, 26, 17, C.ink);
        // Giebel mit Tympanon in Teamfarbe
        for (j = 0; j < 12; j++) { var hw = 4 + j * 1.75; for (i = 0; i < CG; i++) { var dx = i + 0.5 - 23; if (Math.abs(dx) <= hw) g.set(i, 24 + j, Math.abs(dx) > hw - 2 ? (dx < 0 ? C.white : WHT[2]) : (j > 2 ? 'T' : WHT[1])); } }
        g.hline(1, 36, 44, C.white); g.hline(1, 37, 44, WHT[2]); g.hline(1, 38, 44, WHT[1]);
        g.rect(2, 39, 42, 22, C.plum);
        for (i = 0; i < 6; i++) { var cx = 3 + i * 8; for (y = 39; y < 61; y++) { g.set(cx, y, C.white); g.set(cx + 1, y, WHT[1]); g.set(cx + 2, y, WHT[2]); } g.hline(cx - 1, 39, 5, C.white); g.hline(cx - 1, 60, 5, WHT[2]); }
        winH(g, 7, 44, lit, null, true); winH(g, 35, 44, lit, null, true); archDoor(g, 19, 45, 8, 16, lit);
        for (j = 0; j < 3; j++) { g.hline(j, 61 + j * 2, CG - 2 * j, C.white); g.hline(j, 62 + j * 2, CG - 2 * j, WHT[2]); }
      } else if (gov === 'fascism') {
        g = new Grid(CG, 64);
        var Cc = [DCON[0], DCON[1], DCON[2], DCON[3]];
        flatT(g, 0, 6, 46, 12); flatT(g, 12, 0, 22, 8);
        g.set(2, 5, C.fireY); g.set(43, 5, C.fireY);
        for (j = 18; j < 60; j++) for (i = 0; i < CG; i++) { var seam = (i % 9 === 8) || (j % 8 === 7); g.set(i, j, seam ? Cc[3] : (i < 1 ? Cc[0] : (i > 44 ? Cc[2] : Cc[1]))); }
        for (j = 12; j < 60; j++) for (i = 12; i < 34; i++) g.set(i, j, (i === 12) ? C.white : (i === 33 ? Cc[2] : ((j % 8 === 7) ? Cc[2] : Cc[0])));
        for (i = 3; i < 11; i += 3) for (y = 22; y < 52; y += 10) { g.vline(i, y, 6, lit && hash(i, y, 5) < 0.6 ? LITC[1] : C.ink); g.vline(i + 33, y, 6, lit && hash(i + 33, y, 5) < 0.6 ? LITC[1] : C.ink); }
        [14, 27].forEach(function (bx) { cloth(g, bx, 14, 5, 34, pat == null ? 0 : pat, 0, true); g.set(bx + 2, 48, 'Td'); });
        archDoor(g, 20, 46, 6, 14, lit);
        g.hline(8, 60, 30, Cc[0]); g.hline(6, 61, 34, Cc[1]); g.hline(4, 62, 38, Cc[2]);
      } else if (gov === 'communism') {
        g = new Grid(CG, 70);
        for (y = 4; y < 66; y++) for (i = 0; i < 6; i++) g.set(1 + i, y, ((y >> 1) + (i >> 1)) & 1 ? C.redD : (i === 0 ? C.redL : C.red));
        g.rect(0, 2, 8, 3, C.stoneD); g.hline(0, 2, 8, C.stone); for (y = 12; y < 64; y += 10) g.hline(1, y, 6, C.white);
        roofTiles(g, 8, 22, 38, 12, [C.stoneL, C.stone, C.stoneD], 4);
        wallFill('panel', g, 8, 34, 38, 30, PANEL, 3);
        g.rect(8, 34, 38, 4, 'T'); g.hline(8, 37, 38, 'Td'); g.hline(8, 34, 38, 'Tl');
        for (i = 11; i < 44; i += 6) { winH(g, i, 41, lit && hash(i, 1, 3) < 0.8); winH(g, i, 51, lit && hash(i, 2, 3) < 0.8); }
        archDoor(g, 23, 52, 8, 12, lit);
        flagH(g, 36, 4, 18);
        g.hline(8, 64, 38, PANEL[1]); g.hline(8, 65, 38, C.stone);
      } else if (gov === 'theocracy') {
        g = new Grid(CG, 76);
        [0, 39].forEach(function (tx) { roundTower(g, tx, 18, 7, 54, WHT); for (j = 0; j < 10; j++) { var hw2 = 0.4 + j * 0.35; for (i = 0; i < 7; i++) if (Math.abs(i - 3) <= hw2) g.set(tx + i, 8 + j, i < 3 ? GLD[0] : (i === 3 ? GLD[1] : GLD[2])); } g.vline(tx + 3, 4, 4, GLD[1]); slit(g, tx + 2, 30, lit); slit(g, tx + 2, 48, lit); });
        blocks(g, 7, 42, 32, 30, WHT, 8, 5); g.hline(7, 42, 32, C.gold); g.hline(7, 43, 32, C.goldD);
        g.ellipse(23, 30, 15, 15, function (px, py, nx, ny) { if (py > 41) return null; var s2 = nx * 0.8 + ny; return s2 < -0.9 ? C.white : (s2 < -0.2 ? C.cream : (s2 < 0.5 ? C.strawL : (s2 < 0.9 ? C.straw : C.strawD))); });
        for (i = 10; i < 37; i += 4) g.set(i, 40, C.goldD);
        g.ellipse(23, 13, 3, 3, function (px, py, nx, ny) { return nx + ny < -0.3 ? C.goldL : C.gold; }); g.vline(23, 6, 5, C.goldD); g.set(23, 5, C.goldL);
        archDoor(g, 19, 54, 8, 18, lit); g.rect(10, 52, 5, 12, 'T'); g.vline(14, 52, 12, 'Td'); g.rect(31, 52, 5, 12, 'T'); g.vline(35, 52, 12, 'Td');
        winH(g, 11, 46, lit); winH(g, 31, 46, lit);
      } else if (gov === 'republic') {
        g = new Grid(CG, 70);
        [[0, 10, BRK2], [15, 2, ['Tl', 'T', 'Td']], [30, 12, ['redL', 'red', 'redD'].map(function (n2) { return C[n2]; })]].forEach(function (hs) {
          var hx = hs[0], top = hs[1], col = hs[2].concat([MORTD]);
          for (j = 0; j < 18; j++) { var ins = Math.max(0, Math.floor((16 - j) / 4) * 2); for (i = ins; i < 16 - ins; i++) g.set(hx + i, top + j, i === ins ? col[0] : (i === 15 - ins ? col[2] : col[1])); if (ins > 0 && j % 4 === 0) { g.set(hx + ins, top + j, C.stoneL); g.set(hx + 15 - ins, top + j, C.stoneL); } }
          wallFill('brick', g, hx, top + 18, 16, 62 - top - 18, col, hx + 1);
          for (y = top + 21; y < 52; y += 9) { winH(g, hx + 2, y, lit && hash(hx, y, 4) < 0.7); winH(g, hx + 9, y, lit && hash(hx + 9, y, 4) < 0.7); }
          g.rect(hx + 6, top + 6, 4, 4, C.woodD);
        });
        g.hline(24, 6, 12, C.woodD); g.vline(35, 7, 8, C.stoneD); g.paint(34, 15, ['vw', 'wW']);
        for (i = 1; i < 14; i++) { g.set(i, 54, ((i >> 1) & 1) ? 'T' : C.white); g.set(i, 55, ((i >> 1) & 1) ? 'Td' : C.cream); }
        doorH(g, 20, 53, 9, null, lit); doorH(g, 36, 53, 9, null, lit);
        g.paint(2, 58, ['.vw.', 'vwwW', 'wWWW']); g.paint(40, 59, ['oo..', 'kWo.', 'WWo.']);
        g.hline(0, 63, 46, C.stoneD); g.hline(0, 64, 46, C.stone);
      } else if (gov === 'tribe') {
        g = new Grid(CG, 58);
        thatchT(g, 6, 14, 36, 24);
        g.line(8, 6, 16, 16, C.woodD); g.line(18, 6, 10, 16, C.woodD); g.line(30, 6, 38, 16, C.woodD); g.line(40, 6, 32, 16, C.woodD);
        [8, 18, 30, 40].forEach(function (px2) { g.set(px2, 6, C.cream); g.set(px2, 5, C.cream); });
        wallFill('planks', g, 8, 39, 32, 14, null, 5);
        g.rect(20, 42, 8, 11, C.plum); g.rect(20, 42, 8, 6, 'T'); g.vline(27, 42, 6, 'Td'); g.set(20, 42, 'Tl');
        g.set(19, 38, C.cream); g.set(28, 38, C.cream); g.set(18, 37, C.cream); g.set(29, 37, C.cream);
        g.vline(2, 10, 44, C.woodD); g.vline(1, 10, 44, C.wood); g.paint(3, 12, ['TTTTu', 'TTTTT', 'TTtTT', 'tT.Tt', 't...t']);
        for (y = 22; y < 50; y += 7) { g.hline(0, y, 4, C.red); g.set(1, y + 2, C.ink); g.set(2, y + 2, C.ink); }
        g.paint(33, 44, ['....j...', '...jFQ..', '..QFjF..', '.QFjjFQ.', 'gWQFFQWg', '.gWWWWg.']);
      } else {   // anarchy
        g = new Grid(CG, 60);
        for (j = 0; j < 22; j++) for (i = 0; i < 32; i++) { var yy = 12 + j + Math.floor(i / 10); g.set(1 + i, yy, [C.red, C.purple, C.straw, C.glass, 'Tl', C.pink, C.leafL, C.fireO, 'T'][(Math.floor(i / 6) + Math.floor(j / 5) * 3) % 9]); if (j === 21) g.set(1 + i, yy, C.woodD); }
        wallFill('patch', g, 3, 37, 28, 19, null, 3); winH(g, 7, 41, lit); winH(g, 22, 41, lit); g.rect(15, 44, 6, 12, C.woodD); g.vline(16, 44, 12, C.wood);
        g.vline(24, 2, 12, C.stoneD); g.vline(25, 2, 12, C.stone); g.paint(22, 0, ['.qq.', 'qggq']);
        for (j = 0; j < 20; j++) { var hw3 = j * 0.55; for (i = 30; i < 46; i++) { var dx3 = i + 0.5 - 38; if (Math.abs(dx3) <= hw3 + 0.3) g.set(i, 36 + j, (i & 1) ? 'T' : (dx3 < 0 ? 'Tl' : 'Td')); } }
        g.vline(38, 50, 6, C.ink);
        var bunt = [C.red, C.fireY, 'T', C.purple, C.glass, C.pink, C.leafL, C.fireO];
        for (i = 0; i < CG; i++) { var by = 6 + Math.round(Math.abs(i - 23) * -0.12 + 3); if (i % 3 === 0) g.vline(i, by, 3, bunt[(i / 3 | 0) % bunt.length]); else g.set(i, by - 1, C.woodD); }
      }
      return g;
    }
    L.lazyDef('hc_', function (key) {
      var lit = /_lit$/.test(key), k = key.replace(/_lit$/, ''), m = /^hc_center_([a-z]+)(?:_p(\d))?$/.exec(k);
      if (!m) return null;
      var g = centerHi(m[1], lit, m[2] != null ? +m[2] : null);
      if (!g) return null;
      g = finishH(g, 3);
      return { grid: g, scale: 0.5, fw: 3, fh: 3, ox: 0, oy: 24 - g.h * 0.5 + 0.5 };
    });
    GOVS.forEach(function (gv) { L.ALIAS['s_center_' + gv] = 'hc_center_' + gv; LITMAP['s_center_' + gv] = 'hc_center_' + gv + '_lit'; LITMAP['hc_center_' + gv] = 'hc_center_' + gv + '_lit'; });
    for (var cp = 0; cp < 8; cp++) { L.ALIAS['s_center_fascism_p' + cp] = 'hc_center_fascism_p' + cp; LITMAP['s_center_fascism_p' + cp] = 'hc_center_fascism_p' + cp + '_lit'; }
    // alle übrigen Stadtgebäude und Mauern: Verfeinerung
    Object.keys(L.DEFS).forEach(function (k) {
      if (L.ALIAS[k]) return;
      if (/^(s_wall_|s_gate_|s_tower_|s_barricade_|s_walldev_|s_field_|s_barracks|s_market|s_monument_|s_factory_|s_lumber|s_quarry|s_mine|s_smithy|s_fishery|s_pasture|s_station|s_laborcamp|s_flagpole_|s_banner_hang_|s_banner_row_|s_deco_|s_lair_|s_site|s_ruin|s_grave|s_scaffold_|s_tent_|s_camp_)/.test(k)) {
        L.ALIAS[k] = 'hb_up_' + k; LITMAP[k] = 'hb_up_' + k + '_lit'; LITMAP['hb_up_' + k] = 'hb_up_' + k + '_lit';
      }
    });
    // Sicherheitsregel intern: Banner- und Fahnenmuster bei roter Reichsfarbe ersetzen (kein Aufrufer kann es vergessen)
    var SWAP0 = {};
    Object.keys(SAFE[0]).forEach(function (from) {
      var to = SAFE[0][from];
      SWAP0['banner_' + from] = 'banner_' + to; SWAP0['s_banner_hang_' + from] = 's_banner_hang_' + to; SWAP0['s_banner_row_' + from] = 's_banner_row_' + to;
      SWAP0['s_flagpole_' + from + '_0'] = 's_flagpole_' + to + '_0'; SWAP0['s_flagpole_' + from + '_1'] = 's_flagpole_' + to + '_1';
      SWAP0['s_center_fascism_p' + from] = 's_center_fascism_p' + to;
    });
    L.setTeamSwap(0, SWAP0);
    // Bodenschatten unter Mauern, Toren, Türmen, Barrikaden
    Object.keys(L.DEFS).forEach(function (k) { if (L.DEFS[k].group === 'wall') L.DEFS[k].grid.footShade(); });
  });

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
