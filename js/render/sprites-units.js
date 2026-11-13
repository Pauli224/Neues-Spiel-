// Wuselwelt – Pixelkunst: Einheiten (Völker × Berufe), Tiere, Effekte, Sprechblasen, Banner.
// Figuren blicken nach rechts; nach links per flip. Sie werden aus Körper (je Volk) und
// Beruf (Hut, Werkzeug, Kleidung) zusammengesetzt und danach automatisch umrandet.
(function (WW) { 'use strict';

  var RACES = ['human', 'elf', 'dwarf', 'orc', 'gnome', 'frog'];
  var ROLES = ['farmer', 'lumberjack', 'miner', 'builder', 'soldier', 'child', 'trader', 'rebel', 'settler'];
  var LEADER_GOVS = ['tribe', 'monarchy', 'democracy', 'fascism', 'communism', 'theocracy', 'republic'];

  (WW._spriteBuilders = WW._spriteBuilders || []).push(function (L) {
    var Grid = L.Grid, def = L.def;
    var UW = 9, UH = 14; // Innenmaß vor der Kontur

    // ------------------------------------------------------------------ Körper
    // Rückgabe: Grid + Anker (Kopf, Hände, Rumpf)
    var RACE = {
      human: { legs: 2, torsoH: 3, torsoX: 3, torsoW: 3, headX: 3, headW: 3, headH: 3, skin: ['skin', 'skinD'], hair: 'woodD' },
      elf:   { legs: 3, torsoH: 3, torsoX: 3, torsoW: 3, headX: 3, headW: 3, headH: 3, skin: ['skin', 'skinD'], hair: 'strawL' },
      dwarf: { legs: 1, torsoH: 3, torsoX: 2, torsoW: 5, headX: 3, headW: 3, headH: 3, skin: ['skin', 'skinD'], hair: 'woodD' },
      orc:   { legs: 2, torsoH: 4, torsoX: 2, torsoW: 5, headX: 4, headW: 3, headH: 3, skin: ['orc', 'orcD'], hair: 'plum' },
      gnome: { legs: 1, torsoH: 2, torsoX: 3, torsoW: 3, headX: 3, headW: 3, headH: 2, skin: ['skin', 'skinD'], hair: 'white' },
      frog:  { legs: 1, torsoH: 3, torsoX: 2, torsoW: 5, headX: 2, headW: 5, headH: 3, skin: ['leaf', 'leafD'], hair: null }
    };

    function body(race, frame, opt) {
      opt = opt || {};
      var R = RACE[race], g = new Grid(UW, UH);
      var ground = UH - 1;
      var legs = R.legs, tH = R.torsoH, hH = R.headH;
      if (opt.child) { legs = 1; tH = 2; hH = Math.min(hH, 3); }
      var tX = R.torsoX, tW = R.torsoW, hX = R.headX, hW = R.headW;
      if (opt.child && tW > 3) { tW = 3; tX = 3; }
      if (opt.child && race === 'frog') { hX = 2; hW = 5; }
      var torsoBot = ground - legs, torsoTop = torsoBot - tH + 1;
      var headBot = torsoTop - 1, headTop = headBot - hH + 1;
      var skin = R.skin[0], skinD = R.skin[1];
      var pants = race === 'frog' ? skin : (race === 'orc' ? 'woodD' : 'woodD');
      // Beine
      for (var i = 0; i < legs; i++) {
        var y = ground - i, spread = (frame === 0 && i === 0) ? 1 : 0;
        if (tW >= 5) { g.set(tX + 1 - spread, y, pants); g.set(tX + tW - 2 + spread, y, pants); }
        else { g.set(tX - spread, y, pants); g.set(tX + tW - 1 + spread, y, pants); }
      }
      if (race === 'frog') { // breite Froschfüße
        g.set(frame ? 1 : 2, ground, skin); g.set(frame ? 7 : 6, ground, skin);
      }
      // Rumpf (Teamfarbe, Licht von links)
      for (y = torsoTop; y <= torsoBot; y++) for (var x = tX; x < tX + tW; x++) {
        var c = x === tX + tW - 1 ? 'Td' : 'T';
        if (y === torsoTop && x === tX) c = 'Tl';
        if (y === torsoBot && legs > 0) c = 'Td';
        g.set(x, y, c);
      }
      if (race === 'frog') { g.set(tX + 2, torsoBot, 'cream'); g.set(tX + 3, torsoBot, 'cream'); }
      // Kopf
      for (y = headTop; y <= headBot; y++) for (x = hX; x < hX + hW; x++) g.set(x, y, (x === hX + hW - 1 && y === headBot) ? skinD : skin);
      var A = { g: g, headTop: headTop, headL: hX, headR: hX + hW - 1, headBot: headBot, torsoTop: torsoTop, torsoBot: torsoBot,
        tX: tX, tW: tW, ground: ground, race: race, frame: frame, child: !!opt.child };
      // Hände
      var hy = torsoTop + 1 + (frame === 1 ? 0 : 0);
      A.handF = { x: tX + tW, y: hy + (frame === 1 ? -1 : 0) };
      A.handB = { x: tX - 1, y: hy + (frame === 1 ? 1 : 0) };
      if (tH <= 2) { A.handF.y = torsoTop + (frame === 1 ? 0 : 1); A.handB.y = torsoTop + 1; }
      g.set(A.handF.x, A.handF.y, skin); g.set(A.handB.x, A.handB.y, skinD);
      // Volksmerkmale
      if (race === 'human') { g.hline(hX, headTop, hW, R.hair); g.set(hX, headTop + 1, R.hair); }
      if (race === 'elf') {
        g.hline(hX, headTop, hW, R.hair); g.vline(hX, headTop, 3, R.hair); if (!opt.child) g.set(hX - 1, headTop + 3, R.hair);
        g.set(hX - 1, headTop + 1, skin); g.set(hX - 2, headTop, skin); // spitzes Ohr
      }
      if (race === 'dwarf') {
        g.hline(hX, headTop, hW, R.hair);
        var bc = 'fireO';
        g.set(hX + hW, headTop + 1, 'skinD'); // Nase
        if (!opt.child) {
          g.hline(hX, headBot, hW + 1, bc); g.hline(hX + 1, headBot + 1, 3, bc); g.hline(hX + 1, headBot + 2, 3, bc); g.set(hX + 2, headBot + 3, bc);
          g.set(hX, headBot + 1, 'goldD'); g.set(hX + 3, headBot + 1, 'goldD');
        }
      }
      if (race === 'orc') {
        g.set(hX, headTop, 'orcD'); g.set(hX + hW, headTop + 1, skin); // Stirn, Schnauze
        g.set(hX + hW - 1, headBot, 'white'); g.set(hX + hW, headBot - 1, 'white'); // Hauer
        g.set(hX + hW - 1, headTop + 1, 'redD'); // Auge
        g.set(hX - 1, headTop + 1, 'orcD'); // Ohr
        g.hline(tX, torsoTop, tW, 'T'); g.set(tX - 1, torsoTop, 'Tl'); // breite Schultern
        if (!opt.child) { g.set(A.handF.x, A.handF.y + 1, skin); }
      }
      if (race === 'gnome') {
        g.hline(hX + 1, headBot, 3, 'white'); g.set(hX + 2, headBot + 1, 'white'); g.set(hX + hW, headTop + 1, 'skinD');
      }
      if (race === 'frog') {
        g.set(hX, headTop, 'leafL'); g.hline(hX + 1, headBot, hW - 1, 'leafD');
        // Glupschaugen oben auf dem Kopf
        A.eyes = function () {
          g.set(hX + 1, headTop - 1, 'white'); g.set(hX + 2, headTop - 1, 'ink');
          g.set(hX + 3, headTop - 1, 'white'); g.set(hX + 4, headTop - 1, 'ink');
        };
        A.eyes();
        A.headTop = headTop - 1; A.headL = hX + 1; A.headR = hX + 3;
      }
      return A;
    }

    // ------------------------------------------------------------------ Hüte
    function brimHat(A, crown, brim, light) {
      var g = A.g, t = A.headTop, l = A.headL, r = A.headR;
      g.hline(l - 1, t, r - l + 3, brim);
      g.hline(l, t - 1, r - l + 1, crown);
      if (light) g.set(l, t - 1, light);
    }
    var HATS = {
      farmer: function (A) { brimHat(A, 'strawL', 'straw', 'strawL'); A.g.set(A.headR + 1, A.headTop, 'strawD'); },
      lumberjack: function (A) { var g = A.g; g.hline(A.headL, A.headTop, A.headR - A.headL + 1, 'redD'); g.hline(A.headL, A.headTop - 1, A.headR - A.headL + 1, 'red'); g.set(A.headL, A.headTop - 2, 'white'); },
      miner: function (A) { var g = A.g; g.hline(A.headL - 1, A.headTop, A.headR - A.headL + 2, 'goldD'); g.hline(A.headL, A.headTop - 1, A.headR - A.headL + 1, 'gold'); g.set(A.headR + 1, A.headTop, 'goldL'); g.set(A.headR + 1, A.headTop - 1, 'fireY'); },
      builder: function (A) { var g = A.g; g.hline(A.headL, A.headTop, A.headR - A.headL + 2, 'woodL'); g.hline(A.headL, A.headTop - 1, A.headR - A.headL + 1, 'wood'); },
      soldier: function (A) { var g = A.g; g.hline(A.headL - 1, A.headTop, A.headR - A.headL + 3, 'metalD'); g.hline(A.headL, A.headTop - 1, A.headR - A.headL + 1, 'metal'); g.set(A.headL, A.headTop - 1, 'metalL'); },
      trader: function (A) { brimHat(A, 'purple', 'plum', null); A.g.set(A.headL, A.headTop - 1, 'pink'); },
      rebel: function (A) { var g = A.g; g.hline(A.headL, A.headTop, A.headR - A.headL + 1, 'plum'); g.vline(A.headL, A.headTop, 3, 'plum'); g.set(A.headL - 1, A.headTop + 1, 'plum'); g.hline(A.headL + 1, A.headTop + 2, A.headR - A.headL, 'red'); },
      settler: function (A) { var g = A.g; g.hline(A.headL, A.headTop, A.headR - A.headL + 1, 'cream'); g.vline(A.headL, A.headTop, 2, 'cream'); g.set(A.headL - 1, A.headTop + 1, 'sandD'); },
      child: null,
      punk: function (A) { var g = A.g, c = ['pink', 'fireY', 'purple', 'glass']; for (var i = 0; i < 3; i++) g.set(A.headL + i, A.headTop - 1 - (i === 1 ? 1 : 0), c[(i + A.frame) % 4]); g.set(A.headL + 1, A.headTop - 1, 'pink'); g.hline(A.headL, A.headTop, A.headR - A.headL + 1, 'purple'); }
    };
    // Kopfbedeckungen der Anführer (erkennbar an der Silhouette)
    var LHATS = {
      tribe: function (A) { // Hörnerhelm
        var g = A.g, t = A.headTop, l = A.headL, r = A.headR;
        g.hline(l, t, r - l + 1, 'metal'); g.set(l, t, 'metalL'); g.hline(l, t - 1, r - l + 1, 'metalD');
        g.set(l - 1, t - 1, 'cream'); g.set(l - 1, t - 2, 'cream'); g.set(l - 2, t - 3, 'cream');
        g.set(r + 1, t - 1, 'cream'); g.set(r + 1, t - 2, 'cream'); g.set(r + 2, t - 3, 'cream');
      },
      monarchy: function (A) { // Krone
        var g = A.g, t = A.headTop, l = A.headL, r = A.headR;
        g.hline(l - 1, t, r - l + 3, 'goldD'); g.hline(l - 1, t - 1, r - l + 3, 'gold');
        g.set(l - 1, t - 2, 'goldL'); g.set(r + 1, t - 2, 'gold'); g.set((l + r) >> 1, t - 2, 'goldL');
        g.set((l + r) >> 1, t - 1, 'red'); g.set(l - 1, t - 1, 'goldL');
      },
      democracy: function (A) { // Zylinder
        var g = A.g, t = A.headTop, l = A.headL, r = A.headR;
        g.hline(l - 1, t, r - l + 3, 'plum');
        g.rect(l, t - 4, r - l + 1, 4, 'plum'); g.vline(l, t - 4, 4, 'dusk'); g.hline(l, t - 1, r - l + 1, 'T');
      },
      fascism: function (A) { // Schirmmütze, schlicht, ohne Abzeichen
        var g = A.g, t = A.headTop, l = A.headL, r = A.headR;
        g.hline(l, t, r - l + 1, 'stoneD');
        g.hline(l - 1, t - 1, r - l + 3, 'stone'); g.set(l - 1, t - 1, 'stoneL');
        g.set(r + 1, t, 'ink'); g.set(r + 2, t, 'ink');
      },
      communism: function (A) { // Schiebermütze
        var g = A.g, t = A.headTop, l = A.headL, r = A.headR;
        g.hline(l, t, r - l + 1, 'wood'); g.hline(l - 1, t - 1, r - l + 2, 'woodL'); g.set(l - 1, t - 1, 'wood');
        g.set(r + 1, t, 'woodD');
      },
      theocracy: function (A) { // spitze Mitra
        var g = A.g, t = A.headTop, l = A.headL, r = A.headR, m = (l + r) >> 1;
        g.hline(l, t, r - l + 1, 'gold');
        g.hline(l, t - 1, r - l + 1, 'white'); g.hline(l, t - 2, r - l + 1, 'white');
        g.set(m, t - 1, 'gold'); g.set(m, t - 2, 'gold'); g.set(m, t - 3, 'white'); g.set(m, t - 4, 'goldL'); g.set(r, t - 2, 'stoneL'); g.set(r, t - 1, 'stoneL');
        g.set(l, t - 3, 'white');
      },
      republic: function (A) { // Federhut
        var g = A.g, t = A.headTop, l = A.headL, r = A.headR;
        g.hline(l - 1, t, r - l + 3, 'redD'); g.hline(l, t - 1, r - l + 1, 'red');
        g.set(l, t - 2, 'white'); g.set(l - 1, t - 3, 'white'); g.set(l - 2, t - 3, 'white'); g.set(l - 1, t - 2, 'white'); g.set(l + 1, t - 2, 'stoneL');
      }
    };
    // Zwerge tragen ihren Bart auch unter Hüten, Wichtel ihre Zipfelmütze, wenn der Beruf keine eigene Kopfbedeckung braucht
    function gnomeCap(A) {
      var g = A.g, t = A.headTop, l = A.headL, r = A.headR;
      g.hline(l - 1, t, r - l + 3, 'redD'); g.hline(l, t - 1, 3, 'red'); g.hline(l, t - 2, 2, 'red'); g.set(l - 1, t - 3, 'red'); g.set(l - 2, t - 3, 'red');
      g.set(l, t - 1, 'pink');
    }

    // ------------------------------------------------------------------ Werkzeuge
    var TOOLS = {
      farmer: function (A) { // Heugabel
        var g = A.g, x = A.handF.x + 1, y = A.handF.y;
        g.vline(x, y - 4, 6, 'wood'); g.set(x - 1, y - 5, 'metal'); g.set(x + 1, y - 5, 'metal'); g.set(x, y - 5, 'metalL'); g.set(x - 1, y - 6, 'metalL'); g.set(x + 1, y - 6, 'metalL');
      },
      lumberjack: function (A) { // Axt
        var g = A.g, x = A.handF.x + 1, y = A.handF.y;
        g.vline(x, y - 3, 5, 'wood'); g.set(x + 1, y - 3, 'metalL'); g.set(x + 1, y - 2, 'metal'); g.set(x - 1, y - 3, 'metalD');
      },
      miner: function (A) { // Spitzhacke
        var g = A.g, x = A.handF.x + 1, y = A.handF.y;
        g.vline(x, y - 3, 5, 'wood'); g.set(x - 1, y - 3, 'metal'); g.set(x + 1, y - 3, 'metal'); g.set(x - 2, y - 2, 'metalD'); g.set(x + 2, y - 2, 'metalL'); g.set(x, y - 4, 'metalL');
      },
      builder: function (A) { // Hammer
        var g = A.g, x = A.handF.x + 1, y = A.handF.y;
        g.vline(x, y - 2, 3, 'woodL'); g.hline(x - 1, y - 3, 3, 'metal'); g.set(x + 1, y - 3, 'metalL');
      },
      soldier: function (A) { // Speer und Schild in Teamfarbe
        var g = A.g, x = A.handF.x + 1, y = A.handF.y;
        g.vline(x, A.headTop - 2, A.ground - A.headTop + 1, 'woodD'); g.set(x, A.headTop - 3, 'metalL'); g.set(x, A.headTop - 2, 'metal');
        var sx = A.tX + A.tW - 2;
        g.rect(sx, A.torsoTop, 2, 3, 'T'); g.vline(sx, A.torsoTop, 3, 'Tl'); g.set(sx + 1, A.torsoTop + 1, 'gold'); g.set(sx + 1, A.torsoTop + 2, 'Td');
      },
      trader: function (A) { // Kiepe auf dem Rücken, Geldbeutel
        var g = A.g, x = A.tX - 2;
        g.rect(x, A.torsoTop - 1, 2, A.torsoBot - A.torsoTop + 2, 'woodL'); g.vline(x, A.torsoTop - 1, A.torsoBot - A.torsoTop + 2, 'wood'); g.hline(x, A.torsoTop - 1, 2, 'strawL'); g.set(x + 1, A.torsoTop + 1, 'woodD');
        g.set(A.handF.x, A.handF.y + 1, 'gold');
      },
      rebel: function (A) { // Fackel
        var g = A.g, x = A.handF.x + 1, y = A.handF.y;
        g.vline(x, y - 2, 4, 'woodD'); g.set(x, y - 3, 'fireO'); g.set(x, y - 4, 'fireY'); g.set(x + 1, y - 4, 'fireO'); g.set(x, y - 5, 'goldL');
      },
      settler: function (A) { // Bündel am Stock über der Schulter
        var g = A.g, x0 = A.handF.x, y0 = A.handF.y;
        g.line(x0, y0, A.headL - 1, A.headTop + 1, 'woodD');
        var bx = A.headL - 3, by = A.headTop;
        g.paint(bx, by, ['cc.', 'cYc', 'YYY']);
      },
      child: null
    };

    // Anführer: langes Gewand in Teamfarbe, Goldsaum, Umhang
    function robe(A) {
      var g = A.g;
      for (var y = A.torsoTop; y < A.ground; y++) for (var x = A.tX; x < A.tX + A.tW; x++) {
        if (y > A.torsoBot) g.set(x, y, x === A.tX ? 'T' : 'Td');
      }
      g.hline(A.tX, A.ground - 1, A.tW, 'gold');
      g.vline(A.tX - 1, A.torsoTop, A.ground - A.torsoTop, 'Td'); // Umhang
      g.set(A.tX + 1, A.torsoTop + 1, 'gold');
    }

    var STRONG_HAT = { miner: 1, soldier: 1, rebel: 1 };
    function unit(race, role, frame, gov) {
      var A = body(race, frame, { child: role === 'child' });
      if (A.eyes) A.headTop -= 1; // Frosch: Hut sitzt über den Augen
      if (role === 'leader') {
        robe(A);
        LHATS[gov](A);
      } else {
        if (TOOLS[role]) TOOLS[role](A);
        if (race === 'gnome' && !STRONG_HAT[role] && role !== 'punk') gnomeCap(A);
        else if (HATS[role]) HATS[role](A);
        if (role === 'child' && race === 'gnome') gnomeCap(A);
      }
      if (A.eyes) A.eyes();
      return A.g.pad(1, 1, 2, 1).outline().pad(0, 0, 0, 1).footShade();
    }

    RACES.forEach(function (race) {
      ROLES.concat(['punk']).forEach(function (role) {
        for (var f = 0; f < 2; f++) {
          var g = unit(race, role, f);
          def('u_' + race + '_' + role + '_' + f, g, { group: 'unit', anchor: 'unit', lift: 0 });
          if (race === 'human') def('u_' + role + '_' + f, g, { group: 'unit-alias', anchor: 'unit', lift: 0 });
        }
      });
      LEADER_GOVS.forEach(function (gov) {
        for (var f = 0; f < 2; f++) {
          var g = unit(race, 'leader', f, gov);
          def('u_' + race + '_leader_' + gov + '_' + f, g, { group: 'unit', anchor: 'unit', lift: 0 });
          if (race === 'human') def('u_leader_' + gov + '_' + f, g, { group: 'unit-alias', anchor: 'unit', lift: 0 });
        }
      });
    });

    // ------------------------------------------------------------------ Tiere
    function animal(rows) { var g = new Grid(rows[0].length, rows.length); g.paint(0, 0, rows); return g.pad(1, 1, 2, 1).outline().pad(0, 0, 0, 1).footShade(); }
    def('a_sheep_0', animal([
      '.lll....',
      'lllllcOO',
      'llllllOd',
      'clllllO.',
      '.ccccc..',
      '.O...O..']), { group: 'animal', anchor: 'unit', lift: 0 });
    def('a_sheep_1', animal([
      '........',
      '.lll..OO',
      'lllllcOd',
      'llllllO.',
      'cccccc..',
      '..O.O...']), { group: 'animal', anchor: 'unit', lift: 0 });
    def('a_wolf_0', animal([
      '......G.G',
      'G....GgGg',
      '.GgggggGqo',
      '..gggGGG..',
      '..GG..GG..',
      '..G....G..']), { group: 'animal', anchor: 'unit', lift: 0 });
    def('a_wolf_1', animal([
      '.......G.G',
      '.G....GgGg',
      '..GggggGqo',
      '..gggGGG..',
      '...GGGG...',
      '...G..G...']), { group: 'animal', anchor: 'unit', lift: 0 });

    // ------------------------------------------------------------------ Effekte
    function fx(rows, opts) { var g = new Grid(rows[0].length, rows.length); g.paint(0, 0, rows); return opts && opts.outline ? g.pad(1, 1, 1, 1).outline(opts.outline) : g; }
    def('fx_fire_0', fx([
      '...j...',
      '..jF...',
      '..FFj..',
      '.QFjFQ.',
      '.QFjFQ.',
      'RQFFFQR',
      '.RQQQR.'], { outline: 'redD' }), { group: 'fx', anchor: 'unit', lift: 0 });
    def('fx_fire_1', fx([
      '....j..',
      '...Fj..',
      '..jFF..',
      '.QFjFQ.',
      'QFjjFQ.',
      'RQFFFQR',
      '.RQQQR.'], { outline: 'redD' }), { group: 'fx', anchor: 'unit', lift: 0 });
    def('fx_fire_2', fx([
      '..j....',
      '..jF.j.',
      '.FFj.F.',
      '.QFjFQ.',
      'QFjFFQQ',
      'RQFFjQR',
      '.RQQQR.'], { outline: 'redD' }), { group: 'fx', anchor: 'unit', lift: 0 });
    def('fx_smoke_0', fx([
      '..gg..',
      '.gqqg.',
      'gqqqgg',
      '.ggqG.',
      '..GG..']), { group: 'fx', anchor: 'unit', lift: 0 });
    def('fx_smoke_1', fx([
      '...qq.',
      '.gqqqg',
      'gqqgg.',
      'gggG..',
      '.GG...']), { group: 'fx', anchor: 'unit', lift: 0 });
    // Blitz: 9×34, unten an der getroffenen Kachel verankert
    (function () {
      var g = new Grid(11, 36);
      var pts = [[6, 0], [4, 6], [7, 10], [3, 17], [6, 21], [3, 28], [5, 35]];
      for (var i = 0; i < pts.length - 1; i++) {
        g.line(pts[i][0] - 1, pts[i][1], pts[i + 1][0] - 1, pts[i + 1][1], 'glass');
        g.line(pts[i][0] + 1, pts[i][1], pts[i + 1][0] + 1, pts[i + 1][1], 'glass');
      }
      for (i = 0; i < pts.length - 1; i++) g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 'white');
      g.set(2, 30, 'goldL'); g.set(8, 33, 'goldL'); g.set(1, 34, 'white'); g.set(9, 35, 'white');
      def('fx_bolt', g, { group: 'fx', anchor: 'unit', lift: 0 });
    })();
    def('fx_meteor', fx([
      'j.........',
      '.jF.......',
      '..FQj.....',
      '...QQF....',
      '....RQoo..',
      '....QoGGo.',
      '.....oGgGo',
      '.....oGGGo',
      '......oGo.']), { group: 'fx', anchor: 'unit', lift: 0 });
    def('fx_sparkle_0', fx([
      '...j...',
      '...l...',
      '..jlj..',
      'jllllj.',
      '..jlj..',
      '...l...',
      '...j...']), { group: 'fx', anchor: 'center' });
    def('fx_sparkle_1', fx([
      'j.....j',
      '.l...l.',
      '..jlj..',
      '..lll..',
      '..jlj..',
      '.l...l.',
      'j.....j']), { group: 'fx', anchor: 'center' });
    def('fx_plague', fx([
      '..XXX..',
      '.XlXlX.',
      'XXlXlXX',
      '.XXXXX.',
      '..X.X..',
      '.X.X.X.'], { outline: 'leafDD' }), { group: 'fx', anchor: 'center' });
    def('fx_raindrop', fx(['b', 'b', 'l']), { group: 'fx', anchor: 'center' });
    def('fx_arrow', fx(['n....M.', 'WwwwwmM', 'n....M.']), { group: 'fx', anchor: 'center' });

    // ------------------------------------------------------------------ Sprechblasen
    var BUB = {
      heart: ['.r.r.', 'rrRrr', 'rrrrR', '.rrR.', '..R..'],
      bread: ['.....', '.vvv.', 'vwvwv', 'wwwwW', '.WWW.'],
      skull: ['.lll.', 'lllll', 'loloq', '.lql.', '.l.l.'],
      exclaim: ['..r..', '..r..', '..r..', '.....', '..r..'],
      zzz: ['..ddd', '...d.', 'ddd..', '.d...', 'ddd..'],
      ballot: ['.lll.', '.lol.', 'WllW.', 'TTTTt', 'TTTTt'],
      crown: ['k.k.k', 'kkrkk', 'kkkkk', 'KKKKK', '.....'],
      angry: ['R...R', '.R.R.', '.....', '.RRR.', 'R...R'],
      note: ['..oo.', '..o.o', '..o..', 'ooo..', 'oo...'],
      hammer: ['.mmm.', '.mnm.', '..w..', '..w..', '..W..'],
      question: ['.PPP.', 'P...P', '...P.', '..P..', '..P..']
    };
    function bubbleFrame() {
      var g = new Grid(9, 9);
      g.paint(0, 0, [
        '.ooooooo.',
        'ollllllco',
        'ollllllco',
        'ollllllco',
        'ollllllco',
        'ollllllco',
        '.occccco.',
        '..oco.oo.',
        '..oo.....']);
      return g;
    }
    def('b_frame', bubbleFrame(), { group: 'bubble', anchor: 'icon' });
    Object.keys(BUB).forEach(function (k) {
      var g = bubbleFrame(); g.paint(2, 1, BUB[k]); def('b_' + k, g, { group: 'bubble', anchor: 'icon' });
    });

    // ------------------------------------------------------------------ Banner (erfundene Heraldik)
    // Tuch 7×5 an einem Mast; Muster aus Teamfarben + Weiß
    var PAT = [
      function (x, y) { return y === 2 ? 'white' : (y < 2 ? 'T' : 'Td'); },                       // Streifen
      function (x, y) { return (x === 2 || y === 2) ? 'white' : 'T'; },                            // Kreuzbalken
      function (x, y) { return (Math.abs(x - 3) === 4 - y || Math.abs(x - 3) === 3 - y) && y < 4 ? 'white' : 'T'; }, // Sparren
      function (x, y) { return (x === 0 || y === 0 || x === 6 || y === 4) ? 'Td' : (x === 3 && y === 2 ? 'white' : 'T'); }, // Rand
      function (x, y) { return ((x >> 1) + y) & 1 ? 'white' : 'T'; },                              // Schach
      function (x, y) { var d = (x - 3) * (x - 3) + (y - 2) * (y - 2); return d <= 2 ? 'white' : 'T'; }, // Kreis
      function (x, y) { return x - y * 1.5 > 1 ? 'Td' : (x - y * 1.5 > -1 ? 'white' : 'T'); },    // Diagonale
      function (x, y) { return (x === 3 && y === 2) ? 'white' : (y === 4 ? 'Td' : 'T'); }          // Punkt
    ];
    PAT.forEach(function (fn, i) {
      var g = new Grid(9, 12);
      g.vline(0, 0, 12, 'woodD'); g.set(0, 0, 'gold');
      for (var y = 0; y < 5; y++) for (var x = 0; x < 7; x++) {
        var c = fn(x, y);
        if (x === 6 && (y === 0 || y === 4) && i !== 3) c = null; // Schwalbenschwanz
        if (x === 6 && y === 2 && i !== 3) c = null;
        if (c) g.set(1 + x, 1 + y, c);
      }
      g.set(1, 1, g.get(1, 1) === L.C.T ? 'Tl' : g.get(1, 1));
      def('banner_' + i, g.pad(1, 1, 1, 0).outline(), { group: 'banner', anchor: 'unit', lift: 0 });
    });
  });

  WW.SPRITE_RACES = RACES;
})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
