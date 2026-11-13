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
      for (var x = 0; x < 8; x++) if (occ(mask, P.a, P.b, x, sp) && !(x >= P.a && x <= P.b && !(mask & 10))) {
        var y = sp - h - 2 + Htot;
        g.set(x, y, (x & 1) ? 'metal' : 'metalD'); if (x % 3 === 0) g.set(x, y + 1, 'metalD');
      }
      for (var gy = 0; gy < 8; gy++) if (occ(mask, P.a, P.b, sp, gy) && (mask & 5 || !(mask & 10))) {
        var yy = gy - h - 2 + Htot;
        if (!g.get(sp, yy) || g.get(sp, yy) === C.ink) g.set(sp, yy, (gy & 1) ? 'metal' : 'metalD');
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
        g.rect(0, G0 + 2, 2, 3, 'woodL'); g.vline(1, G0 + 2, 3, 'woodD');
        g.rect(10, G0 + 4, 2, 3, 'wood'); g.vline(11, G0 + 4, 3, 'woodD');
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
    // Bodenschatten unter Mauern, Toren, Türmen, Barrikaden
    Object.keys(L.DEFS).forEach(function (k) { if (L.DEFS[k].group === 'wall') L.DEFS[k].grid.footShade(); });
  });

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
