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
      hunter: function (A) { var g = A.g; g.hline(A.headL, A.headTop, A.headR - A.headL + 1, 'leafD'); g.hline(A.headL, A.headTop - 1, A.headR - A.headL + 1, 'leaf'); g.set(A.headR + 1, A.headTop - 1, 'red'); g.set(A.headR + 2, A.headTop - 2, 'red'); },
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
      child: null,
      hunter: function (A) { // Bogen (Holz, helle Sehne) und Köcher auf dem Rücken
        var g = A.g, x = A.handF.x + 1, y = A.handF.y;
        g.set(x, y - 3, 'woodD'); g.set(x + 1, y - 2, 'wood'); g.set(x + 1, y - 1, 'wood'); g.set(x + 1, y, 'wood'); g.set(x + 1, y + 1, 'wood'); g.set(x, y + 2, 'woodD');
        g.vline(x, y - 2, 4, 'cream');
        g.vline(A.tX - 1, A.torsoTop - 1, 3, 'woodD'); g.set(A.tX - 1, A.torsoTop - 2, 'white');
      }
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
      ROLES.concat(['punk', 'hunter']).forEach(function (role) {
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

    // ------------------------------------------------------------------ Räuber (Kapuze, kein Teamhemd)
    for (var bf = 0; bf < 2; bf++) {
      var BA = body('human', bf);
      var bg = BA.g;
      for (var bi = 0; bi < bg.d.length; bi++) {
        if (bg.d[bi] === L.C.T || bg.d[bi] === L.C.Tl) bg.d[bi] = L.C.dusk;
        else if (bg.d[bi] === L.C.Td) bg.d[bi] = L.C.plum;
      }
      bg.hline(BA.headL - 1, BA.headTop - 1, BA.headR - BA.headL + 2, 'woodD'); bg.vline(BA.headL - 1, BA.headTop - 1, 4, 'woodD');
      bg.hline(BA.headL, BA.headTop, BA.headR - BA.headL + 1, 'woodD'); bg.set(BA.headR, BA.headTop + 1, 'ink');
      bg.hline(BA.headL, BA.headBot, BA.headR - BA.headL + 1, 'wood');                                  // Halstuch
      var hx = BA.handF.x + 1, hy = BA.handF.y; bg.vline(hx, hy - 2, 2, 'metalL'); bg.set(hx, hy, 'woodD');  // Dolch
      bg.paint(BA.tX - 2, BA.torsoTop, ['cY', 'YY']);                                                     // Beutesack
      def('u_bandit_' + bf, bg.pad(1, 1, 2, 1).outline().pad(0, 0, 0, 1).footShade(), { group: 'unit', anchor: 'unit', lift: 0 });
    }

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

    // ================================================================== Stufe 3: Wildnis
    var AC = L.addColor, C = L.C;
    // Kreatur aus zwei Teilen: Körper (für beide Frames gleich) + Beine je Frame
    function crit(key, body, legs0, legs1, opts) {
      opts = opts || {};
      [legs0, legs1].forEach(function (legs, f) {
        var rows = (typeof body === 'function' ? body(f) : body).concat(legs || []);
        var w = 0; rows.forEach(function (r) { w = Math.max(w, r.length); });
        var g = new Grid(w, rows.length); g.paint(0, 0, rows);
        if (opts.post) opts.post(g, f);
        g = g.pad(1, 1, 2, 1).outline(opts.edge || null);
        if (!opts.noShadow) g = g.pad(0, 0, 0, 1).footShade();
        def(key + '_' + f, g, { group: 'animal', anchor: 'unit', lift: opts.lift || 0 });
      });
    }
    // ---------------------------------------------------------------- Tiere
    crit('a_cow', [
      '..........c.c',
      '.........llll',
      'O.lOOllllllol',
      'OlOOOlllOOlll',
      '.llllllOOOlpp',
      '.lllllllllll.',
      '..llllllll...'], ['..W.W..W.W...', '..W..W.W..W..'], ['...WW...WW...', '...WW...WW...']);
    crit('a_chicken', [
      '...r..',
      '..rll.',
      '..lloF',
      'llll..',
      '.lll..'], ['..Y.Y.'], ['.Y..Y.']);
    crit('a_rabbit', [
      '...c.c',
      '...ccc',
      '.ccccc',
      'cccccoc',
      'lcccccp',
      '.cccc..'], ['.S..S.'], ['S....S']);
    crit('a_deer', [
      '.......W..W',
      '........WW.',
      '........wW.',
      '........wwo',
      'c.......ww.',
      'cvvvvvvww..',
      'wwvwwwwww..',
      '.wwwwwww...'], ['.W.W..W.W..', '.W.W..W.W..'], ['..WW...WW..', '.W..W.W..W.']);
    crit('a_bear', [
      '.........W.W.',
      '..wwwwwwwwww.',
      '.wvvwwwwwwwoW',
      'wwvwwwwwwwwwwc',
      'wwwwwwwwwwwww.',
      '.wwwwwwwwwW...'], ['.WW..WW.WW....', '.WW..WW.WW....'], ['..WW.WW..WW...', '..WW.WW..WW...']);
    crit('a_crab', [
      'r......r',
      'rr.oo.rr',
      '.rrrrrr.',
      'rRrrrrRr'], ['R.R..R.R'], ['.R.RR.R.']);
    // Fisch: _0 Rücken in der Welle, _1 Sprung
    (function () {
      var a = new Grid(10, 5); a.paint(0, 0, ['....b.....', '...bbB....', '.JlJJJlJ..', 'JJJJJJJJJ.', '..........']);
      def('a_fish_0', a.pad(1, 1, 1, 1).outline('waterD'), { group: 'animal', anchor: 'unit', lift: 0 });
      var b = new Grid(10, 9); b.paint(0, 0, ['......bb..', '...bbbbob.', '..bbllbb..', '.b.bb.....', 'b.........', '..........', '.l......l.', 'JlJ....JlJ', '..........']);
      var o = b.pad(1, 1, 1, 1);
      var oo = new Grid(o.w, o.h); oo.blit(o, 0, 0);
      var fish = new Grid(10, 5); fish.paint(0, 0, ['......bb..', '...bbbbob.', '..bbllbb..', '.b.bb.....', 'b.........']);
      oo.blit(fish.pad(1, 1, 1, 1).outline(), 0, 0);
      def('a_fish_1', oo, { group: 'animal', anchor: 'unit', lift: 0 });
    })();

    // ---------------------------------------------------------------- Monster
    // Drache: ca. 20×16, fliegt (lift 10), Flügelschlag in zwei Frames, eigener Schatten
    var DR = ['Tl', 'T', 'Td'];
    var DRG = [AC(null, '#9fd46a'), AC(null, '#5fa646'), AC(null, '#3a7238')], DRB = AC(null, '#f2e09a');
    [0, 1].forEach(function (f) {
      var g = new Grid(24, 19);
      // Schwanz
      g.line(0, 9, 5, 11, DRG[2]); g.line(0, 10, 5, 12, DRG[1]); g.set(0, 8, DRG[0]); g.set(1, 8, DRG[1]);
      // Körper
      g.ellipse(10, 11.5, 6, 3.4, function (x, y, nx, ny) { return ny > 0.35 ? DRB : (nx + ny < -0.7 ? DRG[0] : (ny > 0 ? DRG[2] : DRG[1])); });
      // Hals und Kopf
      g.line(14, 10, 17, 6, DRG[1]); g.line(15, 10, 18, 6, DRG[1]); g.line(15, 11, 18, 7, DRB);
      g.paint(16, 3, ['.ll...', 'eEe...', 'eeoeee', 'eeeeeQ', '.eEEE.']);
      g.replace('leaf', DRG[1]); g.replace('leafD', DRG[2]);
      // Beine
      g.paint(7, 14, ['E..E', 'E..E']); g.replace('leafD', DRG[2]);
      // Flügel: gefüllte Flughaut (Teamfarbe) mit Knochenstreben
      function tri(ax, ay, bx, by, cx, cy) {
        for (var yy = 0; yy < g.h; yy++) for (var xx = 0; xx < g.w; xx++) {
          var px = xx + 0.5, py = yy + 0.5;
          var d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by), d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy), d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
          var neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
          if (!(neg && pos)) g.set(xx, yy, ((xx + yy) % 4 === 0) ? 'Td' : (py < ay - 3 ? 'Tl' : 'T'));
        }
      }
      if (f === 0) {
        tri(12, 9, 2, 0, 15, 2); tri(12, 9, 6, 0, 15, 2);
        g.line(12, 9, 2, 0, DRG[2]); g.line(12, 9, 8, 1, DRG[2]); g.line(2, 0, 15, 2, DRG[2]);
      } else {
        tri(12, 10, 2, 17, 14, 16);
        g.line(12, 10, 2, 17, DRG[2]); g.line(12, 10, 8, 17, DRG[2]); g.line(2, 17, 14, 16, DRG[2]);
      }
      def('a_dragon_' + f, g.pad(1, 1, 1, 1).outline(), { group: 'animal', anchor: 'unit', lift: 10 });
    });
    (function () { var s = new Grid(18, 5); s.ellipse(9, 2.5, 8.5, 2.2, C.shade); def('a_dragon_shadow', s, { group: 'animal', anchor: 'unit', lift: 0 }); })();

    crit('a_zombie', [
      '..ZZZ...',
      '.ZZoZ...',
      '.ZZZV...',
      '.ddddZZZ',
      '.dOddZ..',
      '.dddd...',
      '.dOdd...',
      '..dd....'], ['..W.W...'], ['..WW....']);
    crit('a_skeleton', [
      '..lll..',
      '..lol..',
      '..lll..',
      '...q...',
      '.qlllqq',
      '..lql..',
      '..lll..'], ['..l.l..', '..l.l..'], ['...ll..', '..l..l.']);
    function slime(key, w, h, f) {
      var g = new Grid(w, h + 1);
      var ry = f ? h / 2 - 0.4 : h / 2, cy = f ? h / 2 + 0.9 : h / 2 + 0.5, rx = f ? w / 2 : w / 2 - 0.5;
      g.ellipse(w / 2, cy, rx, ry, function (x, y, nx, ny) { return nx + ny < -0.7 ? 'white' : (ny > 0.4 ? 'leaf' : 'leafL'); });
      var ey = Math.round(cy - ry * 0.2);
      g.set(Math.floor(w / 2) + 1, ey, 'ink'); g.set(Math.floor(w / 2) + Math.max(2, Math.floor(w / 4)), ey, 'ink');
      return g;
    }
    [['a_slime_l', 14, 10], ['a_slime', 10, 7], ['a_slime_s', 6, 4]].forEach(function (sz) {
      for (var f = 0; f < 2; f++) def(sz[0] + '_' + f, slime(sz[0], sz[1], sz[2], f).pad(1, 1, 2, 1).outline('leafDD').pad(0, 0, 0, 1).footShade(), { group: 'animal', anchor: 'unit', lift: 0 });
    });
    // Geist: halbdurchsichtig, schwebt
    var GW = AC(null, '#f4f8ff', 190), GB = AC(null, '#b8c8f0', 170), GO = AC(null, '#5a6aa0', 210);
    [0, 1].forEach(function (f) {
      var g = new Grid(9, 11);
      g.ellipse(4.5, 4, 4, 4, GW); g.rect(0.5, 4, 8, 5, GW);
      for (var x = 0; x < 9; x++) { var wv = ((x + f) % 3 === 0) ? 1 : 0; g.set(x, 9 + wv, GW); if (wv === 0) g.set(x, 10, 0); }
      g.d[10 * 9 + 0] = 0; g.vline(8, 4, 6, GB); g.hline(1, 9, 7, GB);
      g.set(5, 3, 'ink'); g.set(7, 3, 'ink'); g.set(6, 5, GO);
      g.set(0, 5 + f, GW); g.set(-1 + 0, 6, GW);
      var o = g.pad(1, 1, 1, 1).outline(GO);
      def('a_ghost_' + f, o, { group: 'animal', anchor: 'unit', lift: 3 });
    });
    crit('a_demon', function (f) { return [
      '.r....r.',
      '.rr..rr.',
      '..rrrr..',
      '..rFrF..',
      '..rrrrQ.',
      'R.RrrR..',
      'RRrrrrRm',
      'R.rrrr.m',
      '...rr..m'.replace(/m/g, f ? 'm' : 'm')]; }, ['..R..R.r', '..R..R..'], ['...RR..r', '..R..R..'],
      { post: function (g, f) { g.set(7, 3 + f, 'metal'); g.set(6, 2 + f, 'metalL'); } });
    crit('a_giantchicken', [
      '........rr...',
      '.......rrr...',
      '......lllll..',
      '......llolF..',
      '......lllFFF.',
      '.lll..llll...',
      'lllllllll....',
      'llllclllll...',
      'llclllllll...',
      '.llllllll....',
      '..llllll.....',
      '...llll......'], ['...Y..Y......', '...Y..Y......', '..YY.YY......'], ['....YY.......', '...Y..Y......', '..YY..YY.....']);
    crit('a_yeti', [
      '..llll...',
      '.llllll..',
      '.lbbbbl..',
      '.lbobol..',
      '.lbbbbl..',
      'lllllllll',
      'lNlllllNl',
      'lNlllllNl',
      'blllllllb',
      '.lllllll.',
      '.llNNll..'], ['.ll..ll..', '.bb..bb..'], ['..ll.ll..', '..bb.bb..']);
    // Sandwurm: _0 aufgetaucht, _1 nur Erdhügel
    (function () {
      var SW = [AC(null, '#e8b880'), AC(null, '#c98c5a'), AC(null, '#9c6a40')];
      var g = new Grid(12, 16);
      for (var y = 2; y < 13; y++) { var x0 = 4 + Math.round(Math.sin(y * 0.5) * 1.5); g.hline(x0, y, 4, (y % 3 === 0) ? SW[2] : SW[0]); g.set(x0 + 3, y, SW[1]); }
      g.paint(2, 0, ['.ppppp..', 'pRRRRRp.', 'pRlRlRp.', '.pjojp..']);
      g.paint(0, 12, ['..AaaaaaA...', '.AaaAaaaaaA.', 'AAAAAAAAAAAA']);
      def('a_sandworm_0', g.pad(1, 1, 1, 0).outline().pad(0, 0, 0, 1).footShade(), { group: 'animal', anchor: 'unit', lift: 0 });
      var m = new Grid(12, 5); m.paint(0, 0, ['....aaa.....', '..AaaaaaA...', '.AaaAaaaaA..', 'AAAAAAAAAAA.', '............']);
      def('a_sandworm_1', m.pad(1, 1, 1, 0).outline('sandD').pad(0, 0, 0, 1).footShade(), { group: 'animal', anchor: 'unit', lift: 0 });
    })();
    // Baumhirte: wandelnder Baum mit Gesicht
    crit('a_treant', [
      '....ffeff....',
      '..ffeeeeeeE..',
      '.feeeefeeeEE.',
      'feeeeeeeeeeEE',
      'eeeefeeeeeeEE',
      '.eeeeeeeeeEE.',
      '..EEeeeeEEE..',
      '.e..wvwwW..e.',
      '.ee.wlwlW.ee.',
      '..wwwwwwWww..',
      '....wwoWw....',
      '....wwwwW....',
      '....vwwwW....',
      '....wwwWW....'], ['...WW..WW....', '...W....W....'], ['....WWWW.....', '...W....W....'], { edge: 'leafDD' });
    // Kristallgolem
    crit('a_golem', [
      '...bbb...',
      '..blbbB..',
      '..bobob..',
      '.bbbbbbB.',
      'bblbbbbBB',
      'bbbbbbbbB',
      'B.bbbbB.B',
      '..bbbbB..'], ['..bB.bB..', '..BB.BB..'], ['..bB..bB.', '.BB...BB.'], { edge: 'deep' });

    // ---------------------------------------------------------------- Belagerungsgerät
    [0, 1].forEach(function (f) {
      var g = new Grid(14, 9);
      g.rect(1, 2, 11, 3, 'wood'); g.hline(1, 2, 11, 'woodL'); g.hline(1, 4, 11, 'woodD');      // Dach/Gestell
      g.rect(2 + f, 5, 10, 1, 'woodD'); g.rect(11 + f, 5, 3, 2, 'metal'); g.set(13, 5, 'metalL');   // Rammbalken mit Kopf
      g.line(2, 2, 5, 0, 'woodD'); g.line(11, 2, 8, 0, 'woodD'); g.hline(5, 0, 4, 'T');
      g.paint(1, 6, ['.oo......oo.', 'oWWo....oWWo', '.oo......oo.']);
      if (f) { g.set(2, 7, 'woodL'); g.set(10, 7, 'woodL'); } else { g.set(3, 7, 'woodL'); g.set(11, 7, 'woodL'); }
      def('u_ram_' + f, g.pad(1, 1, 1, 0).outline().pad(0, 0, 0, 1).footShade(), { group: 'unit', anchor: 'unit', lift: 0 });
    });
    [0, 1].forEach(function (f) {
      var g = new Grid(14, 13);
      g.rect(1, 9, 11, 2, 'wood'); g.hline(1, 9, 11, 'woodL');
      g.line(3, 9, 6, 5, 'woodD'); g.line(9, 9, 6, 5, 'woodD');
      if (!f) { g.line(6, 6, 0, 8, 'woodL'); g.paint(0, 7, ['gg', 'Gg']); }      // Arm unten, Stein in der Schale
      else { g.line(6, 6, 10, 0, 'woodL'); g.set(11, 0, 'woodD'); g.set(10, 1, 'woodD'); }
      g.rect(5, 5, 2, 2, 'T');
      g.paint(1, 10, ['.oo.....oo..', 'oWWo...oWWo.', '.oo.....oo..']);
      def('u_catapult_' + f, g.pad(1, 1, 1, 0).outline().pad(0, 0, 0, 1).footShade(), { group: 'unit', anchor: 'unit', lift: 0 });
    });
    def('fx_rock', fx(['.qg.', 'qggG', 'gGGG', '.GG.'], { outline: 'ink' }), { group: 'fx', anchor: 'center' });

    // ---------------------------------------------------------------- Effekte
    [[3, 'F'], [5, 'Q'], [7, 'Q'], [7, 'g']].forEach(function (p, i) {
      var r = p[0], g = new Grid(17, 17);
      g.ellipse(8.5, 8.5, r + 0.5, r + 0.5, function (x, y, nx, ny) {
        var d = Math.sqrt(nx * nx + ny * ny), h = hash2(x, y, i);
        if (i === 3) return d > 0.55 && h > 0.35 ? (h > 0.8 ? 'stoneL' : 'stone') : null;
        if (i === 2 && d < 0.45) return null;
        return d < 0.35 ? 'goldL' : (d < 0.65 ? 'fireY' : (h > 0.5 ? 'fireO' : 'red'));
      });
      def('fx_explosion_' + i, g, { group: 'fx', anchor: 'center' });
    });
    function hash2(x, y, s) { return L.hash(x, y, s + 900); }
    [0, 1, 2].forEach(function (f) {
      var g = new Grid(14, 26);
      for (var y = 0; y < 24; y++) {
        var t = y / 23, half = 6.5 - t * 5, cx = 7 + Math.sin(y * 0.45 + f * 2) * (1 + t * 1.5);
        for (var x = 0; x < 14; x++) {
          var dx = x + 0.5 - cx;
          if (Math.abs(dx) > half) continue;
          var band = ((y + f * 2 + Math.floor(dx)) % 4);
          g.set(x, y, band === 0 ? 'stoneD' : (band === 1 ? 'stoneL' : (dx < 0 ? 'snowD' : 'stone')));
        }
      }
      g.set(2 + f, 22, 'woodD'); g.set(11 - f, 18, 'leaf'); g.set(4, 12 + f, 'woodD');
      def('fx_tornado_' + f, g.pad(1, 1, 1, 0).outline('dusk'), { group: 'fx', anchor: 'unit', lift: 0 });
    });
    (function () {
      var g = new Grid(8, 8);
      g.line(0, 2, 3, 4, 'ink'); g.line(3, 4, 5, 3, 'ink'); g.line(5, 3, 7, 6, 'ink'); g.line(3, 4, 2, 7, 'ink');
      g.set(1, 3, 'plum'); g.set(4, 4, 'plum'); g.set(6, 5, 'plum'); g.set(2, 6, 'plum');
      def('fx_crack', g, { group: 'fx', anchor: 'tile' });
      var GL = AC(null, '#ffb040', 120), GL2 = AC(null, '#ffd870', 150);
      [0, 1].forEach(function (f) {
        var o = new Grid(8, 8);
        o.ellipse(4, 4, 4 - f * 0.5, 4 - f * 0.5, function (x, y, nx, ny) { return nx * nx + ny * ny < 0.3 ? GL2 : GL; });
        def('fx_lavaglow_' + f, o, { group: 'fx', anchor: 'tile' });
      });
    })();
    def('fx_acid', fx(['.X.', '.X.', 'XfX', 'XXX', '.X.'], { outline: 'leafDD' }), { group: 'fx', anchor: 'center' });
    def('fx_snowflake', fx(['..l..', 'l.l.l', '.lNl.', 'l.l.l', '..l..']), { group: 'fx', anchor: 'center' });
    def('fx_heart', fx(['.r.r.', 'rprrr', 'rrrrR', '.rrR.', '..R..'], { outline: 'ink' }), { group: 'fx', anchor: 'center' });
    def('fx_coin', fx(['.jk.', 'jkkK', 'jKkK', '.KK.'], { outline: 'goldD' }), { group: 'fx', anchor: 'center' });
    [0, 1].forEach(function (f) {
      var g = new Grid(18, 9);
      for (var x = 0; x < 18; x++) {
        var half = 0.6 + x * 0.22 + (f ? Math.sin(x * 0.9) * 0.6 : Math.cos(x * 0.8) * 0.6), cy = 4;
        for (var y = 0; y < 9; y++) { var dy = Math.abs(y + 0.5 - cy - 0.5); if (dy <= half) g.set(x, y, dy < half * 0.35 ? 'goldL' : (dy < half * 0.7 ? 'fireY' : (x > 12 && L.hash(x, y, f) > 0.5 ? 'stone' : 'fireO'))); }
      }
      def('fx_breath_' + f, g, { group: 'fx', anchor: 'center', ox: 0 });
    });
    def('fx_wave', fx(['....llll....', '..llJJJJl...', '.lJJDDDJJl..', 'lJDDDDDDDJll', 'DDDDDDDDDDDD'], { outline: 'waterD' }), { group: 'fx', anchor: 'unit', lift: 0 });
    def('fx_madness', fx(['.PPPP.', 'P....P', 'P.PP.P', 'P.P..P', 'P.PPPP', 'P.....', '.PPPP.'], { outline: 'plum' }), { group: 'fx', anchor: 'center' });
    // Göttliche Hand, groß: 20×22, offen und geschlossen (Fingerspitzen nach unten zum Greifen)
    var SK = ['skin', 'skin', 'skinD'];
    (function () {
      var o = new Grid(20, 22);
      o.rect(6, 0, 9, 7, 'skin'); o.vline(14, 0, 7, 'skinD'); o.vline(6, 0, 7, 'skin');
      o.hline(6, 0, 9, 'T'); o.hline(6, 1, 9, 'Td');                               // Ärmelsaum
      o.ellipse(10.5, 10, 7, 5.5, function (x, y, nx, ny) { return nx > 0.5 ? 'skinD' : 'skin'; });
      [[4, 13, 7], [7, 14, 8], [10, 14, 8], [13, 14, 7]].forEach(function (fg) { o.rect(fg[0], fg[1], 2, fg[2], 'skin'); o.vline(fg[0] + 1, fg[1], fg[2], 'skinD'); o.set(fg[0], fg[1] + fg[2] - 1, 'pink'); });
      o.line(3, 9, 0, 13, 'skin'); o.line(4, 10, 1, 14, 'skinD'); o.set(0, 14, 'pink');   // Daumen
      def('fx_hand_open', o.pad(1, 1, 1, 1).outline(), { group: 'fx', anchor: 'unit', lift: 0 });
      var c = new Grid(20, 18);
      c.rect(6, 0, 9, 6, 'skin'); c.vline(14, 0, 6, 'skinD'); c.hline(6, 0, 9, 'T'); c.hline(6, 1, 9, 'Td');
      c.ellipse(10.5, 10, 7, 6, function (x, y, nx, ny) { return nx > 0.5 ? 'skinD' : (ny > 0.5 ? 'skinD' : 'skin'); });
      for (var x = 5; x < 16; x += 3) c.vline(x, 12, 4, 'skinD');
      c.line(3, 8, 6, 13, 'skin'); c.line(4, 8, 7, 13, 'skinD');
      def('fx_hand_closed', c.pad(1, 1, 1, 1).outline(), { group: 'fx', anchor: 'unit', lift: 0 });
    })();

    // ================================================================== Zerstörung
    // Flugzeuge von oben, Nase nach rechts (Osten). Der Renderer dreht sie per ctx.rotate um die Mitte
    // (Pixel bleiben scharf, am saubersten in 45°-Schritten). Schatten = gleiche Silhouette, eigener Schlüssel.
    function fillTri(g, ax, ay, bx, by, cx, cy, colFn) {
      for (var yy = 0; yy < g.h; yy++) for (var xx = 0; xx < g.w; xx++) {
        var px = xx + 0.5, py = yy + 0.5;
        var d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by), d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy), d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) g.set(xx, yy, colFn(xx, yy));
      }
    }
    function shadowOf(g) {
      var s = new Grid(g.w, g.h);
      for (var i = 0; i < g.d.length; i++) if (g.d[i]) s.d[i] = L.C.shade;
      return s;
    }
    var PL = [AC(null, '#b9c0b4'), AC(null, '#8e978a'), AC(null, '#646c62')];   // Kanonenflugzeug: olivgrau
    var BM = [AC(null, '#e4e6ea'), AC(null, '#b4b8c2'), AC(null, '#82889a')];   // Bomber: hellgrau
    (function () {
      var g = new Grid(28, 22), cy = 11;
      // Tragflächen quer (Spannweite 22), Licht von oben links
      g.rect(11, 0, 5, 22, PL[1]); g.vline(11, 0, 22, PL[0]); g.vline(15, 0, 22, PL[2]);
      g.rect(11, 0, 5, 2, 'T'); g.rect(11, 20, 5, 2, 'T'); g.hline(11, 1, 5, 'Td'); g.hline(11, 21, 5, 'Td');   // Flügelspitzen in Teamfarbe
      // Rumpf, bullig
      g.rect(1, cy - 2, 25, 5, PL[1]); g.hline(1, cy - 2, 25, PL[0]); g.hline(1, cy + 2, 25, PL[2]);
      g.rect(24, cy - 1, 3, 3, PL[1]); g.set(27, cy, PL[2]); g.set(26, cy - 2, PL[1]); g.set(26, cy + 2, PL[2]);
      g.rect(21, cy - 1, 3, 2, 'glass'); g.set(21, cy - 1, 'white');                     // Cockpit
      // Leitwerk
      g.rect(0, cy - 6, 4, 13, PL[1]); g.vline(0, cy - 6, 13, PL[0]); g.vline(3, cy - 6, 13, PL[2]);
      // vier Motoren mit Propellerscheiben
      [3, 7, 14, 18].forEach(function (y) { g.rect(15, y, 3, 2, PL[2]); g.vline(18, y - 1, 4, 'stoneL'); g.set(18, y - 2, 'snowD'); g.set(18, y + 2, 'snowD'); });
      // Seitenkanonen nach Süden
      g.set(8, cy + 3, 'ink'); g.set(8, cy + 4, 'ink'); g.set(6, cy + 3, 'ink'); g.set(17, cy + 3, 'ink');
      var o = g.pad(1, 1, 1, 1).outline();
      def('fx_gunship', o, { group: 'fx', anchor: 'center' });
      def('fx_gunship_shadow', shadowOf(o), { group: 'fx', anchor: 'center' });
    })();
    (function () {
      var g = new Grid(26, 20), cy = 10;
      fillTri(g, 15, cy - 1, 8, 0, 11, 0, function () { return BM[1]; }); fillTri(g, 15, cy - 1, 8, 0, 15, cy, function () { return BM[1]; });
      fillTri(g, 15, cy + 1, 8, 19, 11, 19, function () { return BM[2]; }); fillTri(g, 15, cy + 1, 8, 19, 15, cy, function () { return BM[2]; });
      g.line(15, cy - 1, 8, 0, BM[0]);
      g.rect(1, cy - 1, 23, 3, BM[1]); g.hline(1, cy - 1, 23, BM[0]); g.hline(1, cy + 1, 23, BM[2]);
      g.set(24, cy, BM[1]); g.set(25, cy, BM[2]); g.rect(20, cy - 1, 2, 2, 'glass');
      fillTri(g, 4, cy, 0, cy - 5, 2, cy - 5, function () { return BM[1]; }); fillTri(g, 4, cy, 0, cy + 5, 2, cy + 5, function () { return BM[2]; });
      [4, 15].forEach(function (y) { g.rect(10, y, 4, 2, BM[2]); g.set(10, y, 'ink'); });   // Triebwerke
      g.set(9, 2, 'T'); g.set(9, 17, 'T'); g.set(1, cy, 'T');
      var o = g.pad(1, 1, 1, 1).outline();
      def('fx_bomber', o, { group: 'fx', anchor: 'center' });
      def('fx_bomber_shadow', shadowOf(o), { group: 'fx', anchor: 'center' });
    })();
    def('fx_rocket', fx(['.W....', 'WmmmnrR', 'WmmmmrR', '.W....'], { outline: 'ink' }), { group: 'fx', anchor: 'center' });
    def('fx_trail_0', fx(['.gq.', 'qqqg', '.qg.']), { group: 'fx', anchor: 'center' });
    def('fx_trail_1', fx(['..q..', '.q.g.', 'g...q', '.g.q.']), { group: 'fx', anchor: 'center' });
    def('fx_bombdrop', fx(['.M.M.', '..M..', '.oOo.', '.OdO.', '.OdO.', '..O..'], { outline: 'ink' }), { group: 'fx', anchor: 'center' });
    def('fx_tracer', fx(['jFFFFFQ', '.QQQQ..']), { group: 'fx', anchor: 'center' });
    // große Explosion (zweite Größe)
    [[5, 0], [9, 1], [12, 2], [12, 3]].forEach(function (p, i) {
      var r = p[0], g = new Grid(31, 31);
      g.ellipse(15.5, 15.5, r + 0.5, r + 0.5, function (x, y, nx, ny) {
        var d = Math.sqrt(nx * nx + ny * ny), h = L.hash(x >> 1, y >> 1, i + 950);
        if (i === 3) return d > 0.5 && h > 0.3 ? (h > 0.8 ? 'stoneL' : (h > 0.55 ? 'stone' : 'stoneD')) : null;
        if (i === 2 && d < 0.4) return h > 0.6 ? 'stone' : null;
        return d < 0.3 ? 'white' : (d < 0.55 ? 'goldL' : (d < 0.78 ? 'fireY' : (h > 0.5 ? 'fireO' : 'red')));
      });
      def('fx_explosion_l_' + i, g, { group: 'fx', anchor: 'center' });
    });
    // Blitz und Druckwelle (werden skaliert)
    var FW1 = AC(null, '#ffffff', 230), FW2 = AC(null, '#fff6d8', 150), FW3 = AC(null, '#fff0c0', 70);
    (function () {
      var g = new Grid(16, 16);
      g.ellipse(8, 8, 8, 8, function (x, y, nx, ny) { var d = nx * nx + ny * ny; return d < 0.25 ? FW1 : (d < 0.6 ? FW2 : FW3); });
      def('fx_flash', g, { group: 'fx', anchor: 'center' });
      var r = new Grid(32, 32), RW = AC(null, '#ffffff', 200), RB = AC(null, '#bfe6ff', 140);
      r.ellipse(16, 16, 16, 16, function (x, y, nx, ny) { var d = Math.sqrt(nx * nx + ny * ny); return d > 0.9 ? RW : (d > 0.8 ? RB : null); });
      def('fx_shockwave', r, { group: 'fx', anchor: 'center' });
    })();
    // Pilzwolke: 6 Phasen, 40×48, unten mittig an der Einschlagkachel verankert
    var MC = {
      hot: ['white', 'goldL', 'fireY', 'fireO'], warm: ['fireY', 'fireO', 'red', 'redD'],
      cool: [AC(null, '#f2c08a'), AC(null, '#c98a6a'), AC(null, '#8e6a62'), AC(null, '#5e4a52')],
      grey: ['stoneL', 'stone', 'stoneD', AC(null, '#5a5660')], pale: [AC(null, '#e4e0e4', 200), AC(null, '#c8c4cc', 170), AC(null, '#a8a4ae', 140), AC(null, '#8c8894', 110)]
    };
    function puff(g, cx, cy, r, pal, seed) {
      g.ellipse(cx, cy, r, r * 0.9, function (x, y, nx, ny) {
        var s2 = nx * 0.7 + ny + (L.hash(x, y, seed) - 0.5) * 0.3;
        return s2 < -0.7 ? pal[0] : (s2 < 0 ? pal[1] : (s2 < 0.6 ? pal[2] : pal[3]));
      });
    }
    var STAGES = [
      { cap: [20, 38, 7], stem: 0, pal: 'hot', ring: 0 },
      { cap: [20, 26, 8], stem: 1, pal: 'hot', ring: 1 },
      { cap: [20, 14, 11], stem: 1, pal: 'warm', ring: 1 },
      { cap: [20, 11, 13], stem: 1, pal: 'cool', ring: 1 },
      { cap: [20, 10, 14], stem: 1, pal: 'grey', ring: 1, frayed: 0.15 },
      { cap: [20, 9, 15], stem: 1, pal: 'pale', ring: 0, frayed: 0.45 }
    ];
    STAGES.forEach(function (st, i) {
      var g = new Grid(40, 48), pal = MC[st.pal];
      var cx = st.cap[0], cy = st.cap[1], r = st.cap[2];
      if (st.ring) { g.ellipse(20, 44, 18, 3.5, function (x, y, nx, ny) { return ny < 0 ? pal[1] : pal[2]; }); }
      if (st.stem) for (var y = cy + r - 2; y < 45; y++) { var w2 = 2.5 + (y > 40 ? (y - 40) * 1.2 : 0); for (var x = Math.floor(20 - w2); x <= Math.ceil(20 + w2); x++) g.set(x, y, x < 19 ? pal[1] : (x < 21 ? pal[0] : pal[2])); }
      // Hut aus mehreren Wolkenbällen
      puff(g, cx - r * 0.6, cy + r * 0.25, r * 0.6, pal, i * 7 + 1);
      puff(g, cx + r * 0.6, cy + r * 0.25, r * 0.6, pal, i * 7 + 2);
      puff(g, cx, cy, r * 0.75, pal, i * 7 + 3);
      puff(g, cx - r * 0.25, cy - r * 0.35, r * 0.45, pal, i * 7 + 4);
      if (i >= 2 && i <= 3) g.hline(Math.round(cx - r * 0.5), Math.round(cy + r * 0.55), Math.round(r), pal[3]);   // Kragen
      if (st.frayed) for (var k = 0; k < g.d.length; k++) if (g.d[k] && L.hash(k % 40, Math.floor(k / 40), i + 40) < st.frayed) g.d[k] = 0;
      def('fx_mushroom_' + i, i < 4 ? g.pad(1, 1, 1, 0).outline(i < 2 ? 'fireO' : 'redD') : g, { group: 'fx', anchor: 'unit', lift: 0 });
    });
    // Fallout: schwebende Partikel (kachelbar) und Bodenschimmer
    var FA = AC(null, '#8a9480', 200), FB = AC(null, '#b8c4a0', 170);
    (function () {
      var g = new Grid(8, 8); [[1, 1, FA], [5, 2, FB], [3, 5, FA], [7, 6, FB], [0, 7, FB]].forEach(function (p) { g.set(p[0], p[1], p[2]); });
      def('fx_fallout', g, { group: 'fx', anchor: 'tile' });
      var t = new Grid(8, 8), TF = AC(null, '#a8b890', 70), TF2 = AC(null, '#c8dca0', 110);
      for (var y = 0; y < 8; y++) for (var x = 0; x < 8; x++) t.set(x, y, L.hash(x, y, 990) < 0.12 ? TF2 : TF);
      def('t_fallout', t, { group: 'ground' });
    })();
    // Orbitallaser: senkrechter Strahl (8 px hohe Kachel, beliebig oft untereinander) und Einschlag
    (function () {
      var LA = AC(null, '#7fe8ff', 130), LB = AC(null, '#c8f8ff', 220);
      var g = new Grid(7, 8);
      for (var y = 0; y < 8; y++) { g.set(0, y, LA); g.set(6, y, LA); g.set(1, y, LB); g.set(5, y, LB); g.vline(2, y, 1, 'white'); g.set(3, y, 'white'); g.set(4, y, 'white'); }
      def('fx_laser', g, { group: 'fx', anchor: 'tile' });
      [0, 1].forEach(function (f) {
        var h = new Grid(18, 10);
        h.ellipse(9, 7, 8 - f, 3, function (x, y, nx, ny) { var d = nx * nx + ny * ny; return d < 0.3 ? 'white' : (d < 0.7 ? LB : LA); });
        [[2, 2], [15, 3], [5, 0], [12, 1]].forEach(function (p, k) { if ((k + f) & 1) h.set(p[0], p[1], 'white'); });
        def('fx_laser_hit_' + f, h, { group: 'fx', anchor: 'unit', lift: 0 });
      });
    })();
    // Schwarzes Loch: dunkler Wirbel mit hellem Rand, 4 Drehphasen
    [0, 1, 2, 3].forEach(function (f) {
      var g = new Grid(24, 24), BH = AC(null, '#1a1028'), BV = AC(null, '#5a2a8a'), BL = AC(null, '#c89cff');
      for (var y = 0; y < 24; y++) for (var x = 0; x < 24; x++) {
        var dx = x + 0.5 - 12, dy = y + 0.5 - 12, d = Math.sqrt(dx * dx + dy * dy);
        if (d > 11.5) continue;
        var ang = Math.atan2(dy, dx) + d * 0.35 + f * Math.PI / 2, arm = Math.cos(ang * 2);
        var c = d < 4 ? BH : (arm > 0.55 ? (d > 8.5 ? 'white' : BL) : (arm > 0 ? BV : (d > 9 ? null : BH)));
        if (d > 10.5 && arm < 0.3) c = null;
        if (c) g.set(x, y, c);
      }
      def('fx_blackhole_' + f, g, { group: 'fx', anchor: 'center' });
    });
    // Krater in zwei weiteren Größen (Überlagerung mit durchsichtigem Rand)
    function crater(n) {
      var S2 = n * 8, g = new Grid(S2, S2), c = S2 / 2;
      var SO = [AC(null, '#b07c4c'), AC(null, '#8a5a34'), AC(null, '#5e3c24'), AC(null, '#2e2026')];
      g.ellipse(c, c, c, c * 0.92, function (x, y, nx, ny) {
        var d = Math.sqrt(nx * nx + ny * ny), h = L.hash(x, y, n * 31);
        if (d > 0.9 && h < 0.4) return null;
        if (d > 0.78) return (nx + ny < 0) ? SO[1] : SO[0];                     // aufgeworfener Rand
        if (d < 0.35) return n >= 5 ? SO[3] : SO[2];                           // dunkles Zentrum
        return (nx + ny < -0.2) ? SO[2] : SO[1];                               // Innenhang, Schatten oben links
      });
      for (var k = 0; k < n * 3; k++) { var a = L.hash(k, n, 7) * 6.28, rr = c * (0.95 + L.hash(k, n, 8) * 0.25); g.set(Math.round(c + Math.cos(a) * rr), Math.round(c + Math.sin(a) * rr * 0.92), SO[1]); }
      return g;
    }
    def('t_crater_m', crater(3), { group: 'ground', fw: 3, fh: 3 });
    def('t_crater_l', crater(5), { group: 'ground', fw: 5, fh: 5 });

    // alte Figuren im groben Raster unter eigenem Namen behalten (nur für den Vorher-nachher-Vergleich)
    ['u_human_farmer_0', 'u_human_soldier_0', 'u_elf_lumberjack_0', 'u_dwarf_miner_0', 'u_orc_soldier_0', 'u_gnome_builder_0', 'u_frog_farmer_0', 'u_human_leader_monarchy_0']
      .forEach(function (k) { var d = L.DEFS[k]; if (d) def('lo_' + k, d.grid, { group: 'old', anchor: 'unit', lift: 0 }); });
    var S = WW.Sprites;
    // ================================================================== Figuren im feinen Raster (Maßstab 0,5)
    // Schlüssel h_<race>_<role>_<gov>_<frame>, frame 0..3 = Laufen, 4 = Stehen. Zusammengesetzt aus
    // Körper (Volk) + Tracht (Regierung × Rollenklasse) + Kopfbedeckung + Werkzeug/Waffe, dann Kontur
    // und Bodenschatten. Erzeugt erst beim ersten Zeichnen (WW.Sprites.lib.lazyDef), danach gecacht.
    var HC = function (h) { return AC(null, h); };
    var K2 = {
      skinL: HC('#ffd9b8'), skin: C.skin, skinD: C.skinD, blush: HC('#f0a090'),
      orcL: C.orcL, orc: C.orc, orcD: C.orcD,
      frogL: HC('#a8e070'), frog: HC('#6cbc4a'), frogD: HC('#3f8a3a'), frogB: HC('#f2f0c8'),
      denimL: HC('#8aa6c8'), denim: HC('#5f7ea6'), denimD: HC('#3f5a80'),
      blueL: HC('#7d9ad8'), blue: HC('#4a68b8'), blueD: HC('#2e4482'),
      oliveL: HC('#a8a070'), olive: HC('#7f7a4e'), oliveD: HC('#585436'),
      greyL: HC('#a8aab0'), grey: HC('#80838c'), greyD: HC('#575a63'),
      robeL: HC('#f6f0e0'), robe: HC('#e4d8bc'), robeD: HC('#bcae8c'),
      brownL: HC('#b88a5a'), brown: HC('#8c5f38'), brownD: HC('#5f3d22'),
      furL: HC('#f0e2c4'), fur: HC('#d2bc92'), furD: HC('#a68c62'),
      hairBl: HC('#f6dc7a'), hairBr: C.woodD, hairDk: HC('#3a2a2a'), hairWh: C.white, hairRd: HC('#e0702a'),
      eye: C.ink, eyeW: C.white
    };
    function col3(a) { return a; }
    // Rasse: Körpermaße im feinen Raster
    var BODY = {
      human: { skin: [K2.skinL, K2.skin, K2.skinD], tw: 7, th: 7, leg: 6, hr: 3.8, hair: K2.hairBr },
      elf:   { skin: [K2.skinL, K2.skin, K2.skinD], tw: 5, th: 7, leg: 7, hr: 3.5, hair: K2.hairBl, ear: 1, longHair: 1 },
      dwarf: { skin: [K2.skinL, K2.skin, K2.skinD], tw: 9, th: 6, leg: 3, hr: 3.8, hair: K2.hairRd, beard: K2.hairRd },
      orc:   { skin: [K2.orcL, K2.orc, K2.orcD], tw: 9, th: 8, leg: 5, hr: 4.0, hair: K2.hairDk, tusk: 1, ear: 2 },
      gnome: { skin: [K2.skinL, K2.skin, K2.skinD], tw: 5, th: 4, leg: 3, hr: 3.6, hair: K2.hairWh, beard: K2.hairWh, small: 1 },
      frog:  { skin: [K2.frogL, K2.frog, K2.frogD], tw: 8, th: 5, leg: 3, hr: 3.4, frog: 1 }
    };
    var GW2 = 24, GH2 = 32, FY = GH2 - 1;
    // Werkzeuge: Zeichnung relativ zur vorderen Hand (hx, hy)
    var TOOL2 = {
      farmer: function (g, hx, hy) { g.vline(hx + 1, hy - 9, 13, C.wood); g.vline(hx + 2, hy - 9, 13, C.woodD); g.hline(hx - 1, hy - 10, 6, C.metal); [hx - 1, hx + 1, hx + 3].forEach(function (x) { g.vline(x, hy - 13, 3, C.metalL); }); },
      lumberjack: function (g, hx, hy) { g.line(hx + 1, hy + 1, hx + 4, hy - 8, C.wood); g.line(hx + 2, hy + 1, hx + 5, hy - 8, C.woodD); g.paint(hx + 3, hy - 10, ['nnm', 'nmmM', 'mMM', '.M']); },
      miner: function (g, hx, hy) { g.line(hx + 1, hy + 1, hx + 3, hy - 8, C.wood); g.line(hx + 2, hy + 1, hx + 4, hy - 8, C.woodD); g.line(hx - 1, hy - 7, hx + 3, hy - 9, C.metalL); g.line(hx + 4, hy - 9, hx + 7, hy - 6, C.metal); },
      builder: function (g, hx, hy) { g.vline(hx + 1, hy - 5, 7, C.woodL); g.vline(hx + 2, hy - 5, 7, C.wood); g.rect(hx - 1, hy - 7, 6, 3, C.metal); g.hline(hx - 1, hy - 7, 6, C.metalL); },
      trader: function (g, hx, hy, A) { g.rect(A.tx0 - 3, A.ty0, 3, A.th + 1, C.woodL); g.vline(A.tx0 - 3, A.ty0, A.th + 1, C.wood); g.hline(A.tx0 - 3, A.ty0, 3, C.strawL); g.paint(hx, hy + 1, ['kj', 'Kk']); },
      settler: function (g, hx, hy, A) { g.line(hx, hy, A.hx0 - 2, A.hy0 + 1, C.woodD); g.paint(A.hx0 - 6, A.hy0 - 2, ['.cc.', 'cyyc', 'cYyY', '.YY.']); },
      hunter: function (g, hx, hy, A) { for (var y = -7; y <= 6; y++) g.set(hx + 3 - Math.round(Math.abs(y) * Math.abs(y) / 18), hy + y, Math.abs(y) > 5 ? C.woodD : C.wood); g.vline(hx + 1, hy - 6, 13, C.cream); g.rect(A.tx0 - 2, A.ty0 - 2, 2, 6, C.woodD); g.set(A.tx0 - 2, A.ty0 - 3, C.white); g.set(A.tx0 - 1, A.ty0 - 3, C.red); },
      rebel: function (g, hx, hy) { g.vline(hx + 1, hy - 6, 8, C.woodD); g.paint(hx - 1, hy - 11, ['..j..', '.jFQ.', '.QFFj', 'QFjFQ', '.QQQ.']); },
      bandit: function (g, hx, hy) { g.line(hx + 1, hy, hx + 4, hy - 4, C.metalL); g.set(hx + 1, hy + 1, C.woodD); },
      child: null
    };
    // Waffen der Soldaten je Regierung
    var WEAP = {
      tribe: function (g, hx, hy, A) { g.vline(hx + 1, A.top - 4, FY - A.top + 1, C.woodD); g.paint(hx, A.top - 7, ['.n.', 'nnm', 'nmM', '.M.']); g.set(hx + 1, A.top - 3, C.red);
        g.ellipse(A.tx0 + 1, A.ty0 + 4, 3.2, 3.6, function (x, y, nx, ny) { return nx * nx + ny * ny > 0.6 ? 'T' : (nx + ny < -0.3 ? K2.furL : K2.fur); }); },
      monarchy: function (g, hx, hy, A) { g.line(hx + 1, hy, hx + 1, hy - 11, C.metalL); g.vline(hx + 2, hy - 11, 11, C.metal); g.hline(hx - 1, hy - 1, 5, C.gold);
        var sx = A.tx0 - 3, sy = A.ty0; g.rect(sx, sy, 5, 6, 'T'); g.rect(sx + 1, sy + 6, 3, 1, 'T'); g.set(sx + 2, sy + 7, 'Td'); g.vline(sx, sy, 6, 'Tl'); g.line(sx, sy, sx + 4, sy + 5, C.white); g.vline(sx + 4, sy, 6, 'Td'); },
      democracy: function (g, hx, hy, A) { g.vline(hx + 1, A.top - 4, FY - A.top + 1, C.woodD); g.paint(hx - 1, A.top - 8, ['..n..', '.nnm.', 'nnmMM', 'nm...', 'n....']); },
      fascism: function (g, hx, hy, A) { g.vline(hx + 1, hy - 6, 9, C.woodD); g.rect(hx, hy - 8, 3, 2, C.metal);
        var sx = A.tx0 - 3, sy = A.ty0 - 1; g.rect(sx, sy, 5, 9, K2.greyD); g.vline(sx, sy, 9, K2.grey); g.hline(sx, sy, 5, K2.greyL); g.hline(sx, sy + 8, 5, 'Td'); },
      communism: function (g, hx, hy, A) { g.vline(hx + 1, A.top - 7, FY - A.top + 2, C.woodD); g.paint(hx, A.top - 10, ['.n.', 'nnM', '.n.', '.M.']); },
      theocracy: function (g, hx, hy) { g.line(hx + 1, hy, hx + 2, hy - 4, C.metalL); g.line(hx + 2, hy - 4, hx + 5, hy - 8, C.metalL); g.line(hx + 3, hy - 4, hx + 6, hy - 8, C.metal); g.hline(hx - 1, hy, 4, C.gold); },
      republic: function (g, hx, hy, A) { g.line(hx, hy + 1, A.hx0 - 3, A.top - 2, C.metalL); g.line(hx + 1, hy + 1, A.hx0 - 2, A.top - 2, C.metal); g.hline(hx - 2, hy, 5, C.gold); },
      anarchy: function (g, hx, hy, A) { TOOL2.farmer(g, hx, hy); }
    };
    // Kopfbedeckungen: A.hx0..hx1 Kopfbreite, A.hy0 Oberkante
    function brim(g, A, crown, brimC, h, ext) {
      g.rect(A.hx0, A.hy0 - h, A.hx1 - A.hx0 + 1, h + 1, crown); g.hline(A.hx0 - (ext || 1), A.hy0 + 1, A.hx1 - A.hx0 + 1 + 2 * (ext || 1), brimC);
    }
    var HAT = {
      feather: function (g, A) { g.hline(A.hx0, A.hy0 + 1, A.hx1 - A.hx0 + 1, 'T'); g.vline(A.hx0, A.hy0 - 4, 5, C.white); g.vline(A.hx0 - 1, A.hy0 - 3, 3, C.cream); },
      hood: function (g, A) { g.rect(A.hx0 - 1, A.hy0, A.hx1 - A.hx0 + 2, 3, K2.robeL); g.vline(A.hx0 - 1, A.hy0, 6, K2.robe); g.hline(A.hx0, A.hy0 - 1, A.hx1 - A.hx0, K2.robeL); },
      bowler: function (g, A) { brim(g, A, K2.brownD, K2.brownD, 3); g.hline(A.hx0, A.hy0 - 1, A.hx1 - A.hx0 + 1, K2.brown); g.hline(A.hx0, A.hy0, A.hx1 - A.hx0 + 1, 'T'); },
      peakcap: function (g, A) { g.rect(A.hx0, A.hy0 - 1, A.hx1 - A.hx0 + 1, 3, K2.grey); g.hline(A.hx0 - 1, A.hy0 - 2, A.hx1 - A.hx0 + 3, K2.greyL); g.hline(A.hx1 - 1, A.hy0 + 2, 4, C.ink); },
      flatcap: function (g, A) { g.rect(A.hx0, A.hy0 - 1, A.hx1 - A.hx0 + 1, 3, K2.brown); g.hline(A.hx0, A.hy0 - 1, A.hx1 - A.hx0 + 2, K2.brownL); g.hline(A.hx1 - 1, A.hy0 + 1, 4, K2.brownD); },
      cowl: function (g, A) { g.rect(A.hx0 - 1, A.hy0 - 1, A.hx1 - A.hx0 + 2, 4, K2.robeD); g.vline(A.hx0 - 1, A.hy0, 7, K2.robeD); g.hline(A.hx0, A.hy0 - 1, A.hx1 - A.hx0, K2.robe); },
      beret: function (g, A) { g.ellipse((A.hx0 + A.hx1) / 2 + 0.5, A.hy0, (A.hx1 - A.hx0) / 2 + 2, 2, 'Td'); g.hline(A.hx0, A.hy0 + 1, A.hx1 - A.hx0 + 1, 'T'); g.line(A.hx0, A.hy0 - 1, A.hx0 - 3, A.hy0 - 4, C.white); g.line(A.hx0 + 1, A.hy0 - 1, A.hx0 - 2, A.hy0 - 4, C.cream); },
      mohawk: function (g, A) { var c = [C.pink, C.fireY, C.purple, C.glass, C.leafL]; for (var x = A.hx0; x <= A.hx1 - 1; x++) { g.vline(x, A.hy0 - 3, 4, c[x % c.length]); } },
      // Soldaten
      furhelm: function (g, A) { g.rect(A.hx0, A.hy0 - 1, A.hx1 - A.hx0 + 1, 3, K2.fur); g.hline(A.hx0, A.hy0 - 1, A.hx1 - A.hx0 + 1, K2.furL); g.set(A.hx0 - 1, A.hy0 - 2, C.cream); g.set(A.hx0 - 2, A.hy0 - 3, C.cream); g.set(A.hx1 + 1, A.hy0 - 2, C.cream); g.set(A.hx1 + 2, A.hy0 - 3, C.cream); },
      knight: function (g, A) { g.rect(A.hx0 - 1, A.hy0 - 1, A.hx1 - A.hx0 + 3, 7, C.metal); g.vline(A.hx0 - 1, A.hy0 - 1, 7, C.metalL); g.vline(A.hx1 + 1, A.hy0 - 1, 7, C.metalD); g.hline(A.hx0 + 2, A.hy0 + 3, A.hx1 - A.hx0, C.ink); g.vline(A.hx0 + 2, A.hy0 - 5, 4, 'T'); g.vline(A.hx0 + 1, A.hy0 - 4, 3, 'Td'); g.set(A.hx0 + 3, A.hy0 - 4, 'Tl'); },
      shako: function (g, A) { g.rect(A.hx0, A.hy0 - 3, A.hx1 - A.hx0 + 1, 5, K2.blueD); g.hline(A.hx0, A.hy0 - 3, A.hx1 - A.hx0 + 1, K2.blue); g.hline(A.hx1 - 1, A.hy0 + 2, 3, C.ink); g.set(A.hx0 + 2, A.hy0 - 4, 'T'); },
      pothelm: function (g, A) { g.ellipse((A.hx0 + A.hx1) / 2 + 0.5, A.hy0 + 1.5, (A.hx1 - A.hx0) / 2 + 1.5, 3, function (x, y, nx, ny) { return y > A.hy0 + 2 ? null : (nx + ny < -0.5 ? K2.greyL : K2.greyD); }); g.hline(A.hx0 - 1, A.hy0 + 2, A.hx1 - A.hx0 + 3, K2.greyD); },
      furhat: function (g, A) { g.rect(A.hx0 - 1, A.hy0 - 2, A.hx1 - A.hx0 + 3, 4, K2.brown); for (var x = A.hx0 - 1; x <= A.hx1 + 1; x += 2) g.set(x, A.hy0 - 2, K2.brownL); g.hline(A.hx0 - 1, A.hy0 + 1, A.hx1 - A.hx0 + 3, K2.brownD); },
      templehelm: function (g, A) { g.rect(A.hx0, A.hy0 - 1, A.hx1 - A.hx0 + 1, 3, C.white); g.hline(A.hx0, A.hy0 + 1, A.hx1 - A.hx0 + 1, C.gold); g.vline((A.hx0 + A.hx1) >> 1, A.hy0 - 4, 3, C.gold); g.set((A.hx0 + A.hx1) >> 1, A.hy0 - 5, C.goldL); },
      landsknecht: function (g, A) { g.ellipse((A.hx0 + A.hx1) / 2 + 0.5, A.hy0, (A.hx1 - A.hx0) / 2 + 3, 2, 'T'); g.hline(A.hx0 - 2, A.hy0 + 1, A.hx1 - A.hx0 + 5, 'Td'); g.line(A.hx0, A.hy0 - 1, A.hx0 - 4, A.hy0 - 5, C.white); g.line(A.hx0 + 1, A.hy0 - 1, A.hx0 - 2, A.hy0 - 6, C.white); g.line(A.hx0 + 2, A.hy0 - 1, A.hx0, A.hy0 - 6, C.red); },
      pot: function (g, A) { g.rect(A.hx0 - 1, A.hy0 - 1, A.hx1 - A.hx0 + 3, 3, C.metalD); g.hline(A.hx0 - 1, A.hy0 - 1, A.hx1 - A.hx0 + 3, C.metal); g.set(A.hx1 + 2, A.hy0, C.metalD); g.set(A.hx1 + 3, A.hy0, C.metalD); },
      // Anführer
      horns: function (g, A) { HAT.furhelm(g, A); g.set(A.hx0 - 3, A.hy0 - 4, C.cream); g.set(A.hx1 + 3, A.hy0 - 4, C.cream); },
      crown: function (g, A) { g.rect(A.hx0 - 1, A.hy0 - 1, A.hx1 - A.hx0 + 3, 3, C.gold); for (var x = A.hx0 - 1; x <= A.hx1 + 1; x += 2) g.set(x, A.hy0 - 2, C.goldL); g.set((A.hx0 + A.hx1) >> 1, A.hy0, C.red); },
      tophat: function (g, A) { brim(g, A, C.plum, C.plum, 6); g.vline(A.hx0, A.hy0 - 6, 6, C.dusk); g.hline(A.hx0, A.hy0 - 1, A.hx1 - A.hx0 + 1, 'T'); },
      leadercap: function (g, A) { HAT.peakcap(g, A); g.hline(A.hx0 - 1, A.hy0 - 3, A.hx1 - A.hx0 + 3, K2.greyL); },
      mitre: function (g, A) { var m = (A.hx0 + A.hx1) >> 1; for (var j = 0; j < 7; j++) { var hw = Math.max(0, 3 - Math.floor(j / 2)); g.hline(m - hw, A.hy0 - j, hw * 2 + 1, C.white); } g.vline(m, A.hy0 - 6, 7, C.gold); g.hline(A.hx0, A.hy0 + 1, A.hx1 - A.hx0 + 1, C.gold); },
      featherhat: function (g, A) { brim(g, A, C.red, C.redD, 2, 2); g.line(A.hx0, A.hy0 - 2, A.hx0 - 3, A.hy0 - 6, C.white); g.line(A.hx0 + 1, A.hy0 - 2, A.hx0 - 2, A.hy0 - 6, C.white); },
      gnomecap: function (g, A, cols) { var c = cols || [C.red, C.redD]; for (var j = 0; j < 6; j++) g.hline(A.hx0 + Math.floor(j / 2), A.hy0 - j + 1, Math.max(1, A.hx1 - A.hx0 + 1 - j), j & 1 ? c[1] : c[0]); g.set(A.hx0 - 1, A.hy0 - 5, c[0]); g.set(A.hx0 - 2, A.hy0 - 6, c[0]); }
    };
    // Trachten: Farben für Hemd/Rumpf (top), Ärmel, Hose, Schuhe, Extras
    function T3(a, b, c) { return [a, b, c]; }
    var TEAM3 = ['Tl', 'T', 'Td'];
    var COST = {
      neutral:   { top: TEAM3, sleeve: TEAM3, pants: T3(K2.brownL, K2.brown, K2.brownD), shoes: C.woodD, belt: C.woodD },
      tribe:     { top: T3(K2.brownL, K2.brown, K2.brownD), sleeve: null, pants: T3(K2.furL, K2.fur, K2.furD), shoes: K2.brownD, belt: 'T', collar: K2.furL, short: 1, hat: 'feather' },
      monarchy:  { top: TEAM3, sleeve: T3(K2.robeL, K2.robe, K2.robeD), pants: T3(K2.brownL, K2.brown, K2.brownD), shoes: C.woodD, belt: C.woodD, apron: K2.robeL, hat: 'hood' },
      democracy: { top: T3(C.white, K2.robeL, K2.robe), vest: TEAM3, sleeve: T3(C.white, K2.robeL, K2.robe), pants: T3(K2.denimL, K2.denim, K2.denimD), shoes: C.ink, hat: 'bowler' },
      fascism:   { top: T3(K2.greyL, K2.grey, K2.greyD), sleeve: T3(K2.greyL, K2.grey, K2.greyD), pants: T3(K2.grey, K2.greyD, K2.greyD), shoes: C.ink, highCollar: K2.greyD, hem: 'T', hat: 'peakcap' },
      communism: { top: T3(K2.denimL, K2.denim, K2.denimD), sleeve: T3(K2.denimL, K2.denim, K2.denimD), pants: T3(K2.denimL, K2.denim, K2.denimD), shoes: C.woodD, scarf: 'T', straps: K2.denimD, hat: 'flatcap' },
      theocracy: { top: T3(K2.robeL, K2.robe, K2.robeD), sleeve: T3(K2.robeL, K2.robe, K2.robeD), pants: null, robe: T3(K2.robeL, K2.robe, K2.robeD), shoes: K2.brownD, cord: C.gold, stole: 'T', hat: 'cowl' },
      republic:  { top: TEAM3, sleeve: T3(C.white, 'T', 'Td'), slashed: 1, pants: T3(C.white, 'T', 'Td'), puffy: 1, shoes: C.ink, trim: C.gold, hat: 'beret' },
      anarchy:   { top: T3(C.pink, C.purple, C.plum), sleeve: T3(C.leafL, C.leaf, C.leafD), pants: T3(K2.denimL, K2.denim, K2.denimD), shoes: C.red, patches: 1, hat: 'mohawk' }
    };
    var SOLD = {
      tribe:     { top: null, warpaint: 'T', sleeve: null, pants: T3(K2.furL, K2.fur, K2.furD), shoes: K2.brownD, belt: K2.brownD, short: 1, hat: 'furhelm' },
      monarchy:  { top: T3(C.metalL, C.metal, C.metalD), sleeve: T3(C.metalL, C.metal, C.metalD), pants: T3(C.metalL, C.metal, C.metalD), shoes: C.metalD, tabard: TEAM3, hat: 'knight' },
      democracy: { top: T3(K2.blueL, K2.blue, K2.blueD), sleeve: T3(K2.blueL, K2.blue, K2.blueD), pants: T3(K2.blueD, K2.blueD, C.ink), shoes: C.ink, sash: 'T', belt: C.white, hat: 'shako' },
      fascism:   { top: T3(K2.greyL, K2.grey, K2.greyD), sleeve: T3(K2.greyL, K2.grey, K2.greyD), pants: T3(K2.greyD, K2.greyD, C.ink), shoes: C.ink, highCollar: K2.greyD, hat: 'pothelm' },
      communism: { top: T3(K2.oliveL, K2.olive, K2.oliveD), quilted: 1, sleeve: T3(K2.oliveL, K2.olive, K2.oliveD), pants: T3(K2.oliveD, K2.oliveD, C.ink), shoes: C.ink, scarf: 'T', hat: 'furhat' },
      theocracy: { top: T3(C.white, K2.robeL, K2.robe), sleeve: T3(C.white, K2.robeL, K2.robe), pants: null, robe: T3(C.white, K2.robeL, K2.robe), shoes: C.goldD, sash: C.gold, stole: 'T', hat: 'templehelm' },
      republic:  { top: TEAM3, sleeve: T3(C.white, 'T', 'Td'), slashed: 1, pants: T3(C.white, 'T', 'Td'), puffy: 1, shoes: C.ink, trim: C.gold, hat: 'landsknecht' },
      anarchy:   { top: T3(C.pink, C.purple, C.plum), sleeve: T3(C.leafL, C.leaf, C.leafD), pants: T3(K2.denimL, K2.denim, K2.denimD), shoes: C.red, patches: 1, hat: 'pot' }
    };
    var LEAD = {
      tribe:     { base: 'tribe', cape: T3(K2.furL, K2.fur, K2.furD), hat: 'horns' },
      monarchy:  { base: 'monarchy', robe: TEAM3, cape: TEAM3, ermine: 1, hat: 'crown', apron: null },
      democracy: { base: 'democracy', top: T3(C.dusk, C.plum, C.ink), sleeve: T3(C.dusk, C.plum, C.ink), pants: T3(C.dusk, C.plum, C.ink), vest: null, chain: C.gold, hat: 'tophat' },
      fascism:   { base: 'fascism', coat: T3(K2.greyL, K2.grey, K2.greyD), hat: 'leadercap' },
      communism: { base: 'communism', top: T3(K2.brownL, K2.brown, K2.brownD), sleeve: T3(K2.brownL, K2.brown, K2.brownD), pants: T3(K2.greyD, K2.greyD, C.ink), straps: null, coat: T3(K2.brownL, K2.brown, K2.brownD), hat: 'flatcap' },
      theocracy: { base: 'theocracy', robe: T3(C.white, K2.robeL, K2.robe), stole: C.gold, cord: 'T', hat: 'mitre' },
      republic:  { base: 'republic', coat: TEAM3, furTrim: 1, hat: 'featherhat' },
      anarchy:   { base: 'anarchy' }
    };
    function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }
    var REBEL = { top: T3(C.dusk, C.plum, C.ink), sleeve: T3(C.dusk, C.plum, C.ink), pants: T3(K2.brown, K2.brownD, K2.brownD), shoes: C.ink, mask: C.red, hat: null };
    var BANDIT = { top: T3(K2.brownL, K2.brown, K2.brownD), sleeve: T3(K2.brownL, K2.brown, K2.brownD), pants: T3(C.dusk, C.plum, C.plum), shoes: C.ink, hoodC: K2.oliveD, hat: 'banditHood' };
    HAT.banditHood = function (g, A) { g.rect(A.hx0 - 1, A.hy0 - 1, A.hx1 - A.hx0 + 2, 4, K2.oliveD); g.vline(A.hx0 - 1, A.hy0, 8, K2.oliveD); g.hline(A.hx0, A.hy0 - 1, A.hx1 - A.hx0, K2.olive); g.hline(A.hx0 + 2, A.hy0 + 6, A.hx1 - A.hx0, K2.brownD); };

    function shade3(c, x, x0, x1) { return x === x0 ? c[0] : (x === x1 ? c[2] : c[1]); }
    function figure(race, role, gov, frame) {
      var B = BODY[race] || BODY.human, child = role === 'child';
      var g = new Grid(GW2, GH2);
      var cls = role === 'soldier' ? 'soldier' : (role === 'leader' ? 'leader' : 'citizen');
      var cs;
      if (role === 'rebel') cs = REBEL;
      else if (role === 'bandit') cs = BANDIT;
      else if (cls === 'soldier') cs = SOLD[gov] || SOLD.tribe;
      else if (cls === 'leader') { var Ld = LEAD[gov] || LEAD.tribe; cs = merge(COST[Ld.base], Ld); }
      else cs = COST[gov] || COST.neutral;
      var walk = frame < 4, bob = (frame === 0 || frame === 2) ? 1 : 0;
      var leg = child ? Math.max(2, B.leg - 2) : B.leg, th = child ? Math.max(3, B.th - 2) : B.th, tw = child ? Math.max(5, B.tw - 2) : B.tw;
      var hr = child ? B.hr - 0.3 : B.hr;
      var hipY = FY - leg + 1 + bob - (walk ? 0 : 0);
      var ty1 = hipY - 1, ty0 = ty1 - th + 1;
      var cx = 11.5, tx0 = Math.round(cx - tw / 2), tx1 = tx0 + tw - 1;
      var hcy = ty0 - hr + 0.6, hcx = cx + 0.5;
      var A = { tx0: tx0, tx1: tx1, ty0: ty0, ty1: ty1, th: th, hx0: Math.round(hcx - hr), hx1: Math.round(hcx + hr) - 1, hy0: Math.round(hcy - hr), hcx: hcx, hcy: hcy, top: Math.round(hcy - hr) };
      var skin = B.skin, pants = cs.pants || skin, shoes = cs.shoes || C.woodD;
      // --- Beine (2 px breit), Lauf in 4 Phasen
      var st = walk ? [[-2, 2], [0, 0], [2, -2], [0, 0]][frame] : [[0, 0]][0];
      var lx = [Math.round(cx) - 2, Math.round(cx) + 1];
      [0, 1].forEach(function (i) {
        var x0 = lx[i], dxF = i === 0 ? st[1] : st[0];
        var colL = i === 0 ? (cs.short ? skin : pants) : (cs.short ? skin : pants);
        for (var y = hipY; y <= FY; y++) {
          var t = (y - hipY) / Math.max(1, FY - hipY), x = Math.round(x0 + dxF * t);
          var shortC = cs.short && y > hipY + 1;
          var c = shortC ? (i === 0 ? skin[2] : skin[1]) : (i === 0 ? colL[2] : colL[1]);
          if (cs.puffy && y <= hipY + 2) { g.hline(x - 1, y, 4, (y & 1) ? pants[1] : pants[0]); continue; }
          g.set(x, y, c); g.set(x + 1, y, i === 0 ? c : (shortC ? skin[0] : colL[0]));
          if (y === FY) { g.hline(x, y, 3, shoes); }
        }
      });
      // --- Umhang hinten
      if (cs.cape) { var cp = cs.cape; g.rect(tx0 - 2, ty0, 3, FY - ty0, cp[2]); g.vline(tx0 - 2, ty0 + 1, FY - ty0 - 1, cp[1]); }
      // --- hinterer Arm
      var sl = cs.sleeve || skin;
      var ba = walk ? [[-1, 0], [0, 0], [1, 0], [0, 0]][frame][0] : 0;
      g.rect(tx0 - 1 + ba, ty0 + 1, 2, th - 2, sl[2]); g.set(tx0 - 1 + ba, ty0 + th - 1, skin[2]); g.set(tx0 + ba, ty0 + th - 1, skin[2]);
      // --- Rumpf
      var top = cs.top || skin;
      for (var y = ty0; y <= ty1; y++) for (var x = tx0; x <= tx1; x++) g.set(x, y, shade3(top, x, tx0, tx1));
      if (!cs.top && cs.warpaint) { g.line(tx0 + 1, ty0 + 1, tx1 - 1, ty0 + 3, cs.warpaint); g.line(tx0 + 1, ty0 + 3, tx1 - 1, ty0 + 5, cs.warpaint); }
      if (cs.quilted) for (y = ty0 + 1; y <= ty1; y += 2) g.hline(tx0 + 1, y, tw - 2, top[2]);
      if (cs.vest) { g.vline(tx0, ty0, th, cs.vest[0]); g.vline(tx0 + 1, ty0, th, cs.vest[1]); g.vline(tx1, ty0, th, cs.vest[2]); g.vline(tx1 - 1, ty0, th, cs.vest[1]); }
      if (cs.tabard) { var m0 = Math.round(cx) - 2; g.rect(m0, ty0, 4, th + 2, cs.tabard[1]); g.vline(m0, ty0, th + 2, cs.tabard[0]); g.line(m0, ty0 + 1, m0 + 3, ty0 + 4, C.white); }
      if (cs.apron) { g.rect(tx0 + 1, ty0 + 2, tw - 2, th - 1, cs.apron); g.hline(tx0 + 1, ty0 + 2, tw - 2, K2.robe); }
      if (cs.straps) { g.vline(tx0 + 1, ty0, 3, cs.straps); g.vline(tx1 - 1, ty0, 3, cs.straps); g.hline(tx0 + 1, ty0 + 3, tw - 2, cs.straps); }
      if (cs.belt) g.hline(tx0, ty1, tw, cs.belt);
      if (cs.sash) g.line(tx0, ty0, tx1, ty1 - 1, cs.sash);
      if (cs.collar) g.hline(tx0, ty0, tw, cs.collar);
      if (cs.highCollar) { g.hline(tx0 + 1, ty0, tw - 2, cs.highCollar); for (y = ty0 + 1; y < ty1; y += 2) g.set(Math.round(cx), y, cs.highCollar); }
      if (cs.hem) { g.hline(tx0, ty1, tw, cs.hem); }
      if (cs.scarf) { g.hline(tx0 + 1, ty0, tw - 2, cs.scarf); g.set(Math.round(cx) + 1, ty0 + 1, cs.scarf); g.set(Math.round(cx) + 1, ty0 + 2, 'Td'); }
      if (cs.trim) { g.hline(tx0, ty0, tw, cs.trim); g.vline(Math.round(cx), ty0, th, cs.trim); }
      if (cs.patches) { g.rect(tx0 + 1, ty0 + 2, 2, 2, 'T'); g.set(tx1 - 1, ty1 - 2, C.fireY); g.set(tx1 - 2, ty0 + 1, C.glass); }
      if (cs.ribs) { g.vline(Math.round(cx), ty0, th, skin[2]); for (y = ty0 + 1; y < ty1; y += 2) { g.hline(tx0, y, tw, skin[2]); g.set(Math.round(cx), y, skin[1]); } }
      if (cs.ragged) for (x = tx0; x <= tx1; x += 2) { g.set(x, ty1, skin[1]); g.set(x + 1, ty1 + 1, top[2]); }
      // --- Robe / Mantel bis zu den Füßen
      var robe = cs.robe || cs.coat;
      if (robe) {
        var r0 = cs.coat ? ty0 : ty0, bottom = cs.coat ? FY - 2 : FY - 1;
        for (y = r0; y <= bottom; y++) { var spread = Math.floor((y - ty0) / 4); for (x = tx0 - spread; x <= tx1 + spread; x++) g.set(x, y, shade3(robe, x, tx0 - spread, tx1 + spread)); }
        if (cs.coat) g.vline(Math.round(cx), ty0, bottom - ty0, robe[2]);
        if (cs.ermine) { for (x = tx0 - 3; x <= tx1 + 3; x++) if (g.get(x, bottom)) g.set(x, bottom, (x & 1) ? C.white : C.ink); g.hline(tx0, ty0, tw, C.white); }
        if (cs.furTrim) { g.vline(Math.round(cx) - 1, ty0, bottom - ty0, K2.furL); g.hline(tx0, ty0, tw, K2.fur); }
        if (cs.cord) { g.hline(tx0, ty1, tw, cs.cord); g.vline(Math.round(cx) + 1, ty1, 4, cs.cord); }
        if (cs.stole) { g.vline(tx0 + 1, ty0, th + 3, cs.stole); g.vline(tx1 - 1, ty0, th + 3, cs.stole); }
        if (cs.sash) g.line(tx0, ty0, tx1, ty1 - 1, cs.sash);
        if (cs.chain) { g.line(tx0 + 1, ty0, Math.round(cx), ty0 + 3, cs.chain); g.line(tx1 - 1, ty0, Math.round(cx), ty0 + 3, cs.chain); }
      }
      if (cs.chain && !robe) { g.line(tx0 + 1, ty0, Math.round(cx), ty0 + 3, cs.chain); g.line(tx1 - 1, ty0, Math.round(cx), ty0 + 3, cs.chain); g.set(Math.round(cx), ty0 + 4, C.goldL); }
      // --- Kopf
      var hairC = B.hair;
      g.ellipse(hcx, hcy, B.frog ? hr + 1.4 : hr, B.frog ? hr - 0.6 : hr, function (px, py, nx, ny) { return nx + ny < -0.9 ? skin[0] : (nx > 0.55 || ny > 0.6 ? skin[2] : skin[1]); });
      var eyY = Math.round(hcy) - (B.frog ? 1 : 0), ex = Math.round(hcx + hr * 0.25);
      if (B.frog) {
        g.ellipse(ex - 2, eyY - 2.5, 1.6, 1.6, K2.frogB); g.ellipse(ex + 1.5, eyY - 2.5, 1.6, 1.6, K2.frogB);
        g.set(ex - 1, eyY - 2, C.ink); g.set(ex + 2, eyY - 2, C.ink);
        g.hline(ex - 2, eyY + 1, 5, skin[2]);
      } else {
        g.set(ex, eyY, C.ink); g.set(ex + 2, eyY, C.ink);
        g.set(Math.round(hcx + hr) - 0, eyY + 1, skin[2]);                 // Nase
        if (!child) g.set(ex + 1, eyY + 2, skin[2]); else g.set(ex + 1, eyY + 2, K2.blush);
        // Haare: oben und hinten
        if (hairC) {
          for (x = A.hx0; x <= A.hx1; x++) { g.set(x, A.hy0, hairC); if (x < hcx) g.set(x, A.hy0 + 1, hairC); }
          g.vline(A.hx0, A.hy0, Math.round(hr * (B.longHair ? 2.2 : 1.2)), hairC);
          if (B.longHair) g.vline(A.hx0 + 1, A.hy0 + 2, Math.round(hr * 1.6), hairC);
        }
        if (B.ear === 1) { g.set(A.hx0 - 1, eyY, skin[1]); g.set(A.hx0 - 2, eyY - 1, skin[1]); g.set(A.hx0 - 3, eyY - 2, skin[2]); }
        if (B.ear === 2) { g.set(A.hx0 - 1, eyY, skin[1]); g.set(A.hx0 - 2, eyY - 1, skin[2]); }
        if (B.tusk) { g.set(ex + 1, eyY + 2, C.white); g.set(ex + 3, eyY + 2, C.white); g.hline(ex - 1, eyY - 1, 4, skin[2]); }
        if (B.beard && !child) { for (var j = 0; j < 5; j++) g.hline(Math.round(hcx) - 2 + Math.floor(j / 2), eyY + 2 + j, 6 - j, B.beard); }
      }
      // --- Kopfbedeckung
      var hat = cs.hat;
      if (role === 'miner' && cls === 'citizen') hat = 'minerhelm';
      if (child && cls === 'citizen' && hat !== 'mohawk') hat = null;
      if (race === 'gnome' && cls === 'citizen' && hat !== 'mohawk') HAT.gnomecap(g, A, cs.top ? [cs.top[1], cs.top[2]] : null);
      else if (hat === 'minerhelm') { g.rect(A.hx0, A.hy0 - 1, A.hx1 - A.hx0 + 1, 3, C.gold); g.hline(A.hx0 - 1, A.hy0 + 1, A.hx1 - A.hx0 + 3, C.goldD); g.set(A.hx1 + 1, A.hy0, C.fireY); g.set(A.hx1 + 2, A.hy0, C.goldL); }
      else if (hat && HAT[hat]) HAT[hat](g, A);
      if (cs.mask) g.hline(A.hx0 + 1, eyY + 2, A.hx1 - A.hx0, cs.mask);
      // --- Soldaten: Schulterstücke in Teamfarbe, Glanzlicht am Helm
      if (cls === 'soldier') {
        g.hline(tx0 - 1, ty0, tw + 2, 'T'); g.set(tx0 - 1, ty0, 'Tl'); g.set(tx0, ty0, 'Tl'); g.set(tx0 - 1, ty0 + 1, 'Td'); g.set(tx1 + 1, ty0 + 1, 'Td');
        if (hat && hat !== 'pot') { g.set(A.hx0 + 1, A.hy0, C.white); g.set(A.hx0 + 2, A.hy0, C.white); }
      }
      var attack = frame === 5;
      // --- vorderer Arm und Hand, Werkzeug
      if (cs.ragged) { g.rect(tx1 - 1, ty0 + 1, 6, 2, sl[1]); g.rect(tx1 + 5, ty0 + 1, 2, 2, skin[1]); g.rect(tx0 - 1, ty0 + 2, 2, 1, sl[2]); }
      var tool = cls === 'soldier' ? WEAP[gov] || WEAP.tribe : (cls === 'leader' ? null : TOOL2[role]);
      var hold = !!tool || cls === 'leader';
      var fa = walk && !hold ? [[1, 0], [0, 0], [-1, 0], [0, 0]][frame][0] : 0;
      var ax = tx1 - 1 + fa, ay = ty0 + 1, hx = hold ? Math.max(tx1 + 2, Math.ceil(hcx + hr) + 1) : ax, hy = ty0 + th - 2;
      if (hold) { g.rect(tx1 - 1, ay, 2, 3, sl[1]); g.rect(tx1, ay + 2, hx - tx1 + 1, 2, sl[1]); g.set(tx1 + 1, ay + 2, sl[0]); g.rect(hx, hy - 1, 2, 2, skin[1]); hy = hy - 1; }
      else { g.rect(ax, ay, 2, th - 2, sl[1]); g.vline(ax, ay, th - 2, sl[0]); g.rect(ax, ty0 + th - 1, 2, 1, skin[1]); }
      if (attack && hold) { g.rect(tx1, ty0 - 3, 2, 5, sl[1]); g.rect(hx, ty0 - 4, 2, 2, skin[1]); hy = ty0 - 4; hx = hx + 1; }
      if (tool) tool(g, hx, hy, A);
      if (cls === 'soldier' && /tribe|democracy|communism|theocracy|anarchy/.test(gov)) {   // Wimpel an der Waffe
        var py = Math.max(0, (attack ? hy - 12 : A.top - 2)); g.paint(hx + 2, py, ['TTu', 'TTT', 'tT.', 't..']);
      }
      if (cls === 'leader' && gov === 'monarchy') { g.vline(hx + 1, hy - 6, 8, C.gold); g.set(hx + 1, hy - 7, C.red); }
      var out = g.pad(1, 1, 1, 0).outline();
      // leere Zeilen oben abschneiden
      var y0 = 0; while (y0 < out.h - 1) { var any = false; for (x = 0; x < out.w; x++) if (out.d[y0 * out.w + x]) { any = true; break; } if (any) break; y0++; }
      var cut = new Grid(out.w, out.h - y0); for (var k = 0; k < cut.d.length; k++) cut.d[k] = out.d[k + y0 * out.w];
      return cut.pad(0, 0, 0, 2).footShade();
    }
    var RACES2 = ['human', 'elf', 'dwarf', 'orc', 'gnome', 'frog'];
    var GOVS2 = ['tribe', 'monarchy', 'democracy', 'fascism', 'communism', 'theocracy', 'republic', 'anarchy', 'neutral'];
    L.lazyDef('h_', function (key) {
      var p = key.split('_');   // h, race, role, gov, frame
      if (p.length !== 5 || RACES2.indexOf(p[1]) < 0 || GOVS2.indexOf(p[3]) < 0) return null;
      var fr = +p[4]; if (!(fr >= 0 && fr <= 5)) return null;
      var g = figure(p[1], p[2], p[3], fr);
      // Füße 1 Logikpixel über der Kachelunterkante wie bisher, Bodenschatten liegt darunter
      return { grid: g, scale: 0.5, ox: Math.floor((8 - g.w * 0.5) / 2), oy: 8 - g.h * 0.5 };
    });
    var ROLES2 = ['farmer', 'lumberjack', 'miner', 'builder', 'soldier', 'child', 'trader', 'rebel', 'settler', 'hunter', 'leader', 'bandit'];
    S.unitKey = function (race, role, gov, frame) {
      if (RACES2.indexOf(race) < 0) race = 'human';
      if (ROLES2.indexOf(role) < 0) role = 'farmer';
      if (GOVS2.indexOf(gov) < 0) gov = 'neutral';
      if (role === 'leader' && (gov === 'anarchy' || gov === 'neutral')) { role = 'farmer'; gov = gov === 'neutral' ? 'tribe' : 'anarchy'; }
      frame = frame === 'attack' ? 5 : (frame | 0); if (frame < 0 || frame > 5) frame = ((frame % 4) + 4) % 4;
      return 'h_' + race + '_' + role + '_' + gov + '_' + frame;
    };
    S.unitFrames = function (role) { return { walk: 4, stand: 4, attack: 5, total: 6 }; };
    // alte Schlüssel auf das feine Raster umleiten (neutrale Tracht; Anführer in ihrer Regierung)
    RACES2.forEach(function (race) {
      ['farmer', 'lumberjack', 'miner', 'builder', 'soldier', 'child', 'trader', 'rebel', 'settler', 'hunter'].forEach(function (role) {
        [0, 1].forEach(function (f) {
          var nk = 'h_' + race + '_' + role + '_' + (role === 'soldier' ? 'tribe' : 'neutral') + '_' + (f ? 2 : 0);
          L.ALIAS['u_' + race + '_' + role + '_' + f] = nk;
          if (race === 'human') L.ALIAS['u_' + role + '_' + f] = nk;
        });
      });
      [0, 1].forEach(function (f) { L.ALIAS['u_' + race + '_punk_' + f] = 'h_' + race + '_farmer_anarchy_' + (f ? 2 : 0); if (race === 'human') L.ALIAS['u_punk_' + f] = 'h_human_farmer_anarchy_' + (f ? 2 : 0); });
      ['tribe', 'monarchy', 'democracy', 'fascism', 'communism', 'theocracy', 'republic'].forEach(function (gv) {
        [0, 1].forEach(function (f) { var nk = 'h_' + race + '_leader_' + gv + '_' + (f ? 2 : 0); L.ALIAS['u_' + race + '_leader_' + gv + '_' + f] = nk; if (race === 'human') L.ALIAS['u_leader_' + gv + '_' + f] = nk; });
      });
    });
    [0, 1].forEach(function (f) { L.ALIAS['u_bandit_' + f] = 'h_human_bandit_neutral_' + (f ? 2 : 0); });

    // ================================================================== Tiere und Monster im feinen Raster (Maßstab 0,5)
    // Gleiche Schlüssel wie bisher (a_<kind>_<frame>, u_ram_*, u_catapult_*); sie werden auf c_<kind>_<frame> umgeleitet.
    var CP = {
      wool: [HC('#ffffff'), HC('#eceae4'), HC('#c8c4bc')], face: [HC('#5a4a4a'), HC('#3e3232'), HC('#2a2222')],
      cowW: [HC('#ffffff'), HC('#efece6'), HC('#cfcac0')], cowB: [HC('#4a3a3a'), HC('#33282a'), HC('#221a1c')], pinkN: [HC('#ffc8c8'), HC('#f4a0a8'), HC('#d07880')],
      hen: [HC('#fffaf0'), HC('#f2e8d6'), HC('#d8c8a8')], comb: HC('#e8413a'), beak: HC('#f6b23a'),
      hare: [HC('#e8d2b0'), HC('#c9a77c'), HC('#9c7a52')],
      deer: [HC('#d8a46a'), HC('#b47c46'), HC('#86582e')], antler: [HC('#f0e0c0'), HC('#d4bc90'), HC('#a88c60')],
      wolf: [HC('#b8bcc8'), HC('#8c92a2'), HC('#626878')], bear: [HC('#a8784a'), HC('#7c5230'), HC('#55361e')],
      crab: [HC('#ff8a6a'), HC('#e85a40'), HC('#b0382c')], fishC: [HC('#c8eef8'), HC('#7cc8e8'), HC('#4a8cc0')],
      drg: [HC('#a8e070'), HC('#64b04a'), HC('#3a7838')], drgB: HC('#f8e8a8'),
      zomb: [HC('#b8d49a'), HC('#8cb070'), HC('#64884e')], bone: [HC('#ffffff'), HC('#ecebe2'), HC('#c4c2b4')],
      slime: [HC('#c8f4a0'), HC('#86d862'), HC('#4ea440')], demon: [HC('#ff7a5a'), HC('#e0443a'), HC('#a02a30')],
      yeti: [HC('#ffffff'), HC('#e6eef6'), HC('#b8c8da')], yetiF: [HC('#a8d0f0'), HC('#7aaad8'), HC('#5582b0')],
      worm: [HC('#f0c890'), HC('#d49a62'), HC('#a06c3e')], wormM: HC('#8a2a3a'),
      bark: [HC('#b08458'), HC('#86603a'), HC('#5a3e24')], leaf: [HC('#a8e070'), HC('#5aa848'), HC('#357a3a')],
      gem: [HC('#e8fcff'), HC('#8ee0f0'), HC('#4a9ec8')], gemD: HC('#2e6a96')
    };
    var GHW = AC(null, '#f6faff', 205), GHB = AC(null, '#c4d4f6', 190), GHO = AC(null, '#4a5a98', 230), GHE = AC(null, '#2a3060', 240);
    function blobS(g, cx, cy, rx, ry, p, seedN) {
      g.ellipse(cx, cy, rx, ry, function (x, y, nx, ny) { var s2 = nx * 0.8 + ny + (seedN ? (L.hash(x, y, seedN) - 0.5) * 0.4 : 0); return s2 < -0.75 ? p[0] : (s2 > 0.55 ? p[2] : p[1]); });
    }
    function eyeAt(g, x, y, big) { g.set(x, y, C.ink); if (big) { g.set(x, y + 1, C.ink); g.set(x + 1, y, C.white); } }
    // vier Beine (Diagonalgang): xs = [hintenA, hintenB, vornA, vornB], f = Frame 0..3
    var GAIT = [[1, -1], [0, 0], [-1, 1], [0, 0]];
    function legs4(g, xs, y0, y1, f, col, colD, hoof) {
      var o = GAIT[f];
      xs.forEach(function (x, i) {
        var d = (i === 0 || i === 3) ? o[0] : o[1], far = (i === 1 || i === 3);
        g.line(x, y0, x + d, y1, far ? colD : col); g.line(x + 1, y0, x + 1 + d, y1, far ? colD : col);
        if (hoof) g.hline(x + d, y1, 2, hoof);
      });
    }
    var CRIT = {};
    CRIT.sheep = function (g, f) {
      legs4(g, [6, 9, 15, 18], 11, 15, f, CP.face[1], CP.face[2], C.ink);
      blobS(g, 12, 8.5, 9, 5.2, CP.wool, 0);
      [[5, 6], [9, 4], [14, 4], [18, 6], [7, 11], [16, 11]].forEach(function (p) { g.ellipse(p[0], p[1], 2.2, 2, function (x, y, nx, ny) { return nx + ny < -0.3 ? CP.wool[0] : CP.wool[1]; }); });
      blobS(g, 21, 7, 3, 2.6, CP.face, 0); g.set(18, 5, CP.face[1]); g.set(19, 4, CP.face[1]);
      eyeAt(g, 22, 6); g.set(21, 6, C.white);
    };
    CRIT.cow = function (g, f) {
      legs4(g, [6, 9, 20, 23], 14, 19, f, CP.cowW[1], CP.cowW[2], CP.cowB[2]);
      blobS(g, 15, 10, 11, 5.5, CP.cowW, 0);
      [[9, 8, 3, 2.2], [17, 11, 3.5, 2.5], [12, 13, 2, 1.3], [21, 7, 2, 1.6]].forEach(function (p) { g.ellipse(p[0], p[1], p[2], p[3], CP.cowB[1]); });
      g.line(4, 7, 2, 12, CP.cowW[2]); g.set(2, 13, CP.cowB[1]);                         // Schwanz
      g.ellipse(14, 15.5, 2, 1.2, CP.pinkN[1]);                                           // Euter
      blobS(g, 27, 7, 3.5, 3.4, CP.cowW, 0); g.ellipse(29, 9, 2.4, 1.6, CP.pinkN[1]); g.set(29, 9, CP.pinkN[2]); g.set(30, 9, CP.pinkN[2]);
      g.set(25, 3, CP.antler[0]); g.set(26, 3, CP.antler[1]); g.set(29, 3, CP.antler[1]); g.set(24, 5, CP.cowB[1]); g.set(23, 5, CP.cowB[1]);
      eyeAt(g, 28, 6, true);
    };
    CRIT.chicken = function (g, f) {
      var o = GAIT[f];
      g.line(6, 11, 6 + o[0], 14, CP.beak); g.line(9, 11, 9 + o[1], 14, CP.beak); g.hline(5 + o[0], 14, 3, CP.beak); g.hline(8 + o[1], 14, 3, CP.beak);
      blobS(g, 7.5, 8, 5.5, 4, CP.hen, 0); g.ellipse(2.5, 5.5, 2, 2.5, CP.hen[1]);
      g.line(5, 8, 9, 9, CP.hen[2]);
      blobS(g, 11, 4, 2.6, 2.8, CP.hen, 0); g.paint(10, 0, ['.r.', 'rrr']); g.replace(C.red, CP.comb);
      g.hline(13, 4, 2, CP.beak); g.set(13, 5, CP.beak); g.set(11, 6, CP.comb); eyeAt(g, 11, 3);
    };
    CRIT.rabbit = function (g, f) {
      var hop = f === 1 || f === 3 ? -1 : 0, o = GAIT[f];
      blobS(g, 6.5, 8 + hop, 5, 3.5, CP.hare, 0); g.ellipse(1.5, 7 + hop, 1.6, 1.6, C.white);
      blobS(g, 11, 5 + hop, 2.8, 2.6, CP.hare, 0);
      g.vline(9, 0 + hop, 4, CP.hare[1]); g.vline(10, 0 + hop, 4, CP.hare[0]); g.vline(11, 1 + hop, 3, CP.hare[2]); g.set(10, 1 + hop, CP.pinkN[1]);
      eyeAt(g, 12, 4 + hop); g.set(13, 6 + hop, CP.pinkN[1]);
      g.hline(3 + o[0], 11, 3, CP.hare[2]); g.hline(9 + o[1], 11, 2, CP.hare[1]);
    };
    CRIT.deer = function (g, f) {
      legs4(g, [6, 9, 17, 20], 15, 22, f, CP.deer[1], CP.deer[2], C.ink);
      blobS(g, 13, 12, 9, 4.5, CP.deer, 0); g.ellipse(5, 11, 1.6, 1.4, C.white);
      [[9, 11], [12, 10], [15, 12], [11, 13]].forEach(function (p) { g.set(p[0], p[1], CP.deer[0]); });
      g.line(19, 10, 21, 5, CP.deer[1]); g.line(20, 10, 22, 5, CP.deer[1]); g.line(21, 10, 23, 5, CP.deer[2]);
      blobS(g, 23.5, 4.5, 3, 2.4, CP.deer, 0); g.set(26, 5, C.ink); eyeAt(g, 24, 3);
      g.set(21, 2, CP.deer[2]);
      g.line(22, 2, 20, -0, CP.antler[1]); g.line(22, 2, 24, -0, CP.antler[1]); g.set(19, 0, CP.antler[0]); g.set(25, 0, CP.antler[0]); g.set(21, 0, CP.antler[2]); g.set(23, 1, CP.antler[1]);
    };
    CRIT.wolf = function (g, f) {
      legs4(g, [5, 8, 16, 19], 10, 14, f, CP.wolf[1], CP.wolf[2], CP.wolf[2]);
      blobS(g, 12, 8, 8.5, 3.6, CP.wolf, 0); g.hline(7, 10, 10, CP.wolf[0]);
      g.line(3, 6, 0, 10, CP.wolf[1]); g.line(3, 7, 0, 11, CP.wolf[2]); g.set(0, 11, CP.wolf[0]);
      blobS(g, 20.5, 6, 3, 2.6, CP.wolf, 0); g.hline(22, 7, 3, CP.wolf[1]); g.set(25, 7, C.ink); g.hline(22, 8, 3, CP.wolf[0]);
      g.set(19, 2, CP.wolf[1]); g.set(19, 3, CP.wolf[2]); g.set(21, 2, CP.wolf[1]); g.set(21, 3, CP.wolf[2]);
      eyeAt(g, 21, 5); g.set(22, 5, CP.fishC[0]);
    };
    CRIT.bear = function (g, f) {
      legs4(g, [6, 9, 19, 22], 13, 18, f, CP.bear[1], CP.bear[2], CP.bear[2]);
      g.rect(5, 12, 4, 3, CP.bear[1]); g.rect(18, 12, 6, 3, CP.bear[1]);
      blobS(g, 14, 9, 10, 5.5, CP.bear, 3);
      blobS(g, 25, 7, 4, 3.6, CP.bear, 0); g.ellipse(28, 8.5, 2, 1.5, CP.hare[0]); g.set(29, 8, C.ink);
      g.ellipse(23, 3.5, 1.4, 1.4, CP.bear[1]); g.set(23, 3, CP.bear[2]); eyeAt(g, 26, 6);
    };
    CRIT.crab = function (g, f) {
      var o = f & 1;
      for (var i = 0; i < 3; i++) { g.line(5 + i * 2, 7, 2 + i * 2 - o, 10, CP.crab[2]); g.line(13 - i * 2, 7, 16 - i * 2 + o, 10, CP.crab[2]); }
      blobS(g, 9, 5.5, 6, 3.2, CP.crab, 0);
      g.ellipse(2, 3 - o, 2, 1.8, CP.crab[1]); g.ellipse(16, 3 - (1 - o), 2, 1.8, CP.crab[1]); g.set(1, 2 - o, C.white);
      g.vline(7, 0, 3, CP.crab[2]); g.vline(11, 0, 3, CP.crab[2]); g.set(7, 0, C.ink); g.set(11, 0, C.ink);
    };
    CRIT.fish = function (g, f) {
      if (f === 0) {   // Rücken in der Welle
        g.paint(6, 6, ['...b..', '..bbB.', '.bbbBB']); g.replace(C.glass, CP.fishC[1]); g.replace(C.waterD, CP.fishC[2]);
        for (var x = 0; x < 20; x++) { g.set(x, 9 + ((x >> 2) & 1), C.white); g.set(x, 10 + ((x >> 2) & 1), CP.fishC[0]); }
      } else {
        g.ellipse(10, 5, 6, 2.6, function (x, y, nx, ny) { return ny < -0.3 ? CP.fishC[0] : (ny > 0.4 ? CP.fishC[2] : CP.fishC[1]); });
        g.paint(1, 2, ['b...', 'bb..', 'bbb.', 'bb..', 'b...']); g.replace(C.glass, CP.fishC[1]);
        eyeAt(g, 14, 4); g.set(16, 6, C.ink); g.set(9, 2, CP.fishC[2]); g.set(10, 2, CP.fishC[2]);
        g.paint(2, 11, ['l.l....l.l', '.J......J.']);
      }
    };
    CRIT.dragon = function (g, f) {
      var up = f === 0 || f === 3, mid = f === 1;
      // Schwanz
      g.line(0, 15, 8, 19, CP.drg[2]); g.line(0, 16, 8, 20, CP.drg[1]); g.paint(0, 13, ['r.', 'rr']); g.replace(C.red, 'T');
      blobS(g, 17, 20, 10, 5.5, CP.drg, 0); g.hline(10, 23, 14, CP.drgB); g.hline(12, 24, 10, CP.drgB);
      for (var x = 9; x < 25; x += 3) g.set(x, 15, CP.drg[0]);
      // Hals und Kopf
      g.line(24, 18, 30, 10, CP.drg[1]); g.line(25, 19, 31, 11, CP.drg[1]); g.line(26, 19, 32, 12, CP.drgB);
      blobS(g, 33, 9, 5, 3.6, CP.drg, 0); g.hline(34, 11, 5, CP.drg[2]); g.set(38, 10, C.ink); g.set(37, 12, C.white); g.set(35, 12, C.white);
      g.line(31, 6, 29, 2, CP.antler[1]); g.line(33, 6, 32, 2, CP.antler[1]);
      eyeAt(g, 34, 7, true);
      // Beine
      g.rect(12, 24, 3, 3, CP.drg[2]); g.rect(20, 24, 3, 3, CP.drg[2]); g.hline(12, 27, 4, C.ink); g.hline(20, 27, 4, C.ink);
      // kräftige Flügel: Flughaut in Teamfarbe zwischen drei Fingerknochen
      var root = [16, 16], tips = up ? [[0, 5], [7, 0], [23, 1]] : (mid ? [[0, 13], [5, 6], [22, 8]] : [[0, 30], [9, 35], [23, 31]]);
      for (var k = 0; k < tips.length - 1; k++) fillT(g, root, tips[k], tips[k + 1], k & 1 ? 'Td' : 'T');
      fillT(g, root, tips[2], [root[0] + 4, root[1]], 'Tl');
      tips.forEach(function (t) { g.line(root[0], root[1], t[0], t[1], CP.drg[2]); });
      g.line(tips[0][0], tips[0][1], tips[1][0], tips[1][1], CP.drg[2]);
    };
    function fillT(g, a, b, c, col) {
      for (var yy = 0; yy < g.h; yy++) for (var xx = 0; xx < g.w; xx++) {
        var px = xx + 0.5, py = yy + 0.5;
        var d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]), d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]), d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) g.set(xx, yy, col);
      }
    }
    CRIT.slime = function (g, f, sz) {
      var w = sz === 's' ? 12 : (sz === 'l' ? 28 : 20), h = sz === 's' ? 8 : (sz === 'l' ? 18 : 13);
      var sq = [0, 1, 0, -1][f], rx = w / 2 + sq * 0.8, ry = h / 2 - sq * 0.8, cy = g.h - 1 - ry;
      g.ellipse(w / 2 + 1, cy, rx, ry, function (x, y, nx, ny) { return y > g.h - 1 ? null : (nx + ny < -0.9 ? C.white : (nx + ny < -0.3 ? CP.slime[0] : (ny > 0.45 ? CP.slime[2] : CP.slime[1]))); });
      var ex = Math.round(w / 2 + 2), ey = Math.round(cy - ry * 0.15);
      eyeAt(g, ex, ey, sz !== 's'); eyeAt(g, ex + Math.max(2, Math.round(w / 6)), ey, sz !== 's');
      if (sz !== 's') g.hline(ex, ey + 3, Math.max(2, Math.round(w / 6)) + 1, CP.slime[2]);
      if (sz === 'l') { g.ellipse(6, cy + 2, 1.5, 1.5, CP.slime[0]); g.set(5, cy - 3, C.white); }
    };
    CRIT.ghost = function (g, f) {
      var bob = [0, -1, 0, 1][f];
      g.ellipse(9, 7 + bob, 7, 7, GHW); g.rect(2, 7 + bob, 14, 8, GHW);
      for (var x = 2; x < 16; x++) { var wv = ((x + f) >> 1) & 1; g.set(x, 15 + bob + wv, GHW); }
      g.vline(15, 6 + bob, 9, GHB); g.hline(3, 14 + bob, 12, GHB);
      g.ellipse(10, 6 + bob, 1.3, 1.8, GHE); g.ellipse(14, 6 + bob, 1.3, 1.8, GHE); g.set(10, 5 + bob, C.white); g.set(14, 5 + bob, C.white);
      g.ellipse(12, 10 + bob, 1.6, 1.3, GHE);
      g.line(2, 8 + bob, 0, 11 + bob - (f & 1), GHW); g.line(16, 8 + bob, 18, 6 + bob + (f & 1), GHW);
    };
    CRIT.demon = function (g, f) {
      var o = GAIT[f];
      g.line(7, 15, 6 + o[0], 20, CP.demon[2]); g.line(8, 15, 7 + o[0], 20, CP.demon[2]); g.line(11, 15, 11 + o[1], 20, CP.demon[1]); g.line(12, 15, 12 + o[1], 20, CP.demon[1]);
      g.line(5, 14, 1, 16, CP.demon[2]); g.line(1, 16, 0, 13, CP.demon[2]); g.paint(0, 11, ['.R', 'RR']);   // Schwanz mit Spitze
      blobS(g, 10, 12, 4.5, 4, CP.demon, 0); g.hline(8, 14, 5, C.ink);
      fillT(g, [8, 10], [1, 4], [5, 12], C.redD); fillT(g, [8, 10], [3, 2], [1, 4], C.plum);   // Flügelchen
      blobS(g, 11, 6, 4, 3.6, CP.demon, 0);
      g.set(8, 2, C.cream); g.set(7, 1, C.cream); g.set(14, 2, C.cream); g.set(15, 1, C.cream);
      g.set(12, 5, C.fireY); g.set(14, 5, C.fireY); g.hline(12, 8, 3, C.ink); g.set(13, 9, C.white);
      g.vline(16, 3, 13, C.woodD); g.paint(15, 0, ['n.n', 'nnn', '.m.']); g.rect(14, 10, 2, 2, CP.demon[1]);
    };
    CRIT.giantchicken = function (g, f) {
      var o = GAIT[f];
      g.line(10, 21, 9 + o[0] * 2, 27, CP.beak); g.line(11, 21, 10 + o[0] * 2, 27, CP.beak); g.line(15, 21, 15 + o[1] * 2, 27, CP.beak); g.line(16, 21, 16 + o[1] * 2, 27, CP.beak);
      g.hline(7 + o[0] * 2, 27, 5, CP.beak); g.hline(14 + o[1] * 2, 27, 5, CP.beak);
      blobS(g, 12, 15, 10, 7, CP.hen, 5); g.ellipse(3, 10, 3.5, 5, CP.hen[1]); g.ellipse(2, 7, 2, 3, CP.hen[0]);
      g.line(8, 15, 16, 17, CP.hen[2]); g.line(9, 13, 15, 15, CP.hen[2]);
      blobS(g, 20, 6, 5, 5, CP.hen, 0);
      g.paint(17, 0, ['.r.r.', 'rrrrr']); g.replace(C.red, CP.comb);
      g.rect(24, 6, 4, 2, CP.beak); g.hline(24, 8, 3, CP.beak); g.set(22, 9, CP.comb); g.set(22, 10, CP.comb);
      g.ellipse(21, 5, 2, 2, C.white); g.set(22, 5, C.ink); g.set(21, 4, C.ink);   // großes verdutztes Auge
    };
    CRIT.yeti = function (g, f) {
      var o = GAIT[f];
      g.rect(7 + o[0], 21, 4, 5, CP.yeti[2]); g.rect(13 + o[1], 21, 4, 5, CP.yeti[1]); g.hline(6 + o[0], 26, 6, CP.yetiF[2]); g.hline(12 + o[1], 26, 6, CP.yetiF[1]);
      blobS(g, 12, 15, 8, 8, CP.yeti, 9);
      g.rect(2, 12 + o[1], 4, 9, CP.yeti[2]); g.rect(18, 12 + o[0], 4, 9, CP.yeti[1]); g.rect(2, 20 + o[1], 4, 2, CP.yetiF[1]); g.rect(18, 20 + o[0], 4, 2, CP.yetiF[1]);
      blobS(g, 13, 6, 5, 5, CP.yeti, 9);
      g.ellipse(14, 7, 3.4, 2.6, CP.yetiF[1]); g.set(13, 6, C.ink); g.set(16, 6, C.ink); g.hline(13, 9, 4, CP.yetiF[2]); g.set(14, 10, C.white);
    };
    CRIT.sandworm = function (g, f) {
      if (f === 1 || f === 3) {   // Erdhügel
        g.ellipse(12, 26, 11, 4, function (x, y, nx, ny) { return y > 27 ? null : (ny < -0.4 ? C.strawL : (nx > 0.3 ? C.sandD : C.sand)); });
        for (var x = 3; x < 22; x += 4) g.set(x, 25, C.sandD);
        return;
      }
      g.ellipse(12, 26, 11, 4, function (x, y, nx, ny) { return y > 27 ? null : (ny < -0.4 ? C.strawL : (nx > 0.3 ? C.sandD : C.sand)); });
      for (var y = 6; y < 26; y++) { var cx = 12 + Math.round(Math.sin(y * 0.28 + 1) * 3), w = 7 - Math.floor((26 - y) / 10); for (var xx = 0; xx < w; xx++) g.set(cx - (w >> 1) + xx, y, xx === 0 ? CP.worm[0] : (xx === w - 1 ? CP.worm[2] : CP.worm[1])); if (y % 3 === 0) g.hline(cx - (w >> 1), y, w, CP.worm[2]); }
      // großes Maul mit Zahnkranz
      g.ellipse(12, 4, 7, 4.5, CP.worm[1]); g.ellipse(13, 4, 5, 3.2, CP.wormM); g.ellipse(13.5, 4.5, 2.6, 1.6, C.ink);
      for (var a = 0; a < 10; a++) { var t = a / 10 * Math.PI * 2; g.set(Math.round(13 + Math.cos(t) * 4.2), Math.round(4 + Math.sin(t) * 2.8), C.white); }
      g.set(6, 6, C.fireY); g.set(7, 5, C.ink);
    };
    CRIT.treant = function (g, f) {
      var o = GAIT[f];
      g.rect(8 + o[0], 24, 3, 6, CP.bark[2]); g.rect(14 + o[1], 24, 3, 6, CP.bark[1]); g.hline(7 + o[0], 29, 5, CP.bark[2]); g.hline(13 + o[1], 29, 5, CP.bark[2]);
      g.rect(7, 13, 11, 12, CP.bark[1]); g.vline(7, 13, 12, CP.bark[0]); g.vline(17, 13, 12, CP.bark[2]);
      for (var y = 15; y < 25; y += 3) g.set(9 + (y & 1), y, CP.bark[2]);
      g.line(7, 15, 2, 11 + o[1], CP.bark[1]); g.line(18, 15, 23, 12 + o[0], CP.bark[1]); g.set(1, 10 + o[1], CP.leaf[1]); g.set(23, 11 + o[0], CP.leaf[1]);
      [[12, 7, 9, 6], [6, 9, 5, 4], [19, 9, 5, 4], [12, 3, 5, 3.5]].forEach(function (b, i) { blobS(g, b[0], b[1], b[2], b[3], CP.leaf, 20 + i); });
      g.ellipse(10.5, 17, 1.4, 1.8, C.ink); g.ellipse(14.5, 17, 1.4, 1.8, C.ink); g.set(11, 16, C.fireY); g.set(15, 16, C.fireY);
      g.hline(10, 21, 6, CP.bark[2]); g.set(16, 20, CP.bark[2]);
      g.set(5, 6, C.pink); g.set(18, 4, C.pink);
    };
    CRIT.golem = function (g, f) {
      var o = GAIT[f];
      g.rect(6 + o[0], 19, 4, 5, CP.gem[2]); g.rect(13 + o[1], 19, 4, 5, CP.gem[1]);
      function shardBlock(x, y, w, h) { g.rect(x, y, w, h, CP.gem[1]); g.vline(x, y, h, CP.gem[0]); g.vline(x + w - 1, y, h, CP.gem[2]); g.hline(x, y, w, CP.gem[0]); g.line(x + 1, y + h - 1, x + w - 2, y + 1, CP.gem[2]); }
      shardBlock(5, 9, 13, 11);
      shardBlock(1, 10 + o[1], 4, 9); shardBlock(18, 10 + o[0], 4, 9);
      shardBlock(8, 2, 8, 7);
      g.set(9, 1, CP.gem[0]); g.set(13, 0, CP.gem[0]); g.set(14, 1, CP.gem[1]); g.set(4, 8, CP.gem[0]); g.set(19, 8, CP.gem[0]);
      g.set(11, 5, C.fireY); g.set(14, 5, C.fireY); g.hline(11, 7, 3, CP.gemD);
      g.ellipse(11.5, 14, 1.6, 1.6, C.purple); g.set(11, 13, C.white);
    };
    // Belagerungsgerät
    CRIT.ram = function (g, f) {
      var push = [0, 1, 2, 1][f];
      g.rect(3, 8, 20, 3, C.wood); g.hline(3, 8, 20, C.woodL); g.hline(3, 10, 20, C.woodD);                  // Gestell
      g.line(4, 8, 10, 1, C.woodD); g.line(21, 8, 15, 1, C.woodD); g.line(5, 8, 11, 1, C.wood); g.line(20, 8, 14, 1, C.wood);
      g.rect(9, 0, 8, 2, 'T'); g.hline(9, 0, 8, 'Tl'); g.hline(9, 1, 8, 'Td');                                   // Dach mit Teamtuch
      g.rect(2 + push, 11, 22, 3, C.woodL); g.hline(2 + push, 13, 22, C.woodD); for (var x = 4 + push; x < 22 + push; x += 5) g.vline(x, 11, 3, C.metalD);   // Rammbalken
      g.paint(23 + push, 10, ['mn.', 'mnn', 'mMn', 'MM.']);                                                  // Widderkopf aus Eisen
      [[5, 17], [18, 17]].forEach(function (w, i) { g.ellipse(w[0], w[1], 3, 3, function (x, y, nx, ny) { var d = nx * nx + ny * ny; return d < 0.25 ? C.metal : (d > 0.6 ? C.ink : C.woodD); }); var a = (f + i) * 0.8; g.set(Math.round(w[0] + Math.cos(a) * 2), Math.round(w[1] + Math.sin(a) * 2), C.woodL); });
    };
    CRIT.catapult = function (g, f) {
      var fire = f === 1;
      g.rect(2, 16, 22, 3, C.wood); g.hline(2, 16, 22, C.woodL); g.hline(2, 18, 22, C.woodD);
      g.line(6, 16, 12, 8, C.woodD); g.line(18, 16, 12, 8, C.woodD); g.line(7, 16, 13, 8, C.wood);
      g.rect(10, 7, 5, 3, C.woodD); g.rect(11, 8, 3, 1, 'T');
      if (!fire) { g.line(12, 8, 1, 13, C.woodL); g.line(12, 9, 1, 14, C.wood); g.paint(0, 10, ['.WW.', 'WggW', 'WGgW']); }
      else { g.line(12, 8, 21, 0, C.woodL); g.line(13, 8, 22, 0, C.wood); g.paint(20, 0, ['WW.', 'W.W']); }
      g.rect(18, 12, 4, 4, C.stone); g.hline(18, 12, 4, C.stoneL);   // Gegengewicht/Steine
      [[6, 21], [19, 21]].forEach(function (w) { g.ellipse(w[0], w[1], 3, 3, function (x, y, nx, ny) { var d = nx * nx + ny * ny; return d < 0.25 ? C.metal : (d > 0.6 ? C.ink : C.woodD); }); });
    };
    var CSIZE = { sheep: [26, 17], cow: [33, 21], chicken: [16, 16], rabbit: [15, 13], deer: [28, 24], wolf: [27, 16], bear: [31, 20], crab: [19, 12],
      fish: [21, 14], dragon: [42, 36], ghost: [20, 19], demon: [19, 22], giantchicken: [30, 29], yeti: [24, 28], sandworm: [25, 29], treant: [26, 31],
      golem: [23, 25], ram: [28, 21], catapult: [26, 25], slime_s: [14, 9], slime: [22, 14], slime_l: [30, 19] };
    var FRAMES = { fish: 2, sandworm: 2, catapult: 2 };
    function creatureGrid(kind, f) {
      var sz = CSIZE[kind]; if (!sz) return null;
      var g = new Grid(sz[0], sz[1]);
      if (/^slime/.test(kind)) CRIT.slime(g, f, kind === 'slime_s' ? 's' : (kind === 'slime_l' ? 'l' : 'm'));
      else CRIT[kind](g, f);
      var edge = kind === 'ghost' ? GHO : (/^slime/.test(kind) ? C.leafDD : null);
      var o = g.pad(1, 1, 1, 0).outline(edge);
      if (kind === 'dragon' || kind === 'ghost') return o;     // schweben: eigener Schatten
      return o.pad(0, 0, 0, 2).footShade();
    }
    S._creatureGrid = creatureGrid;
    var LIFT = { dragon: 10, ghost: 3 };
    L.lazyDef('c_', function (key) {
      var p = key.slice(2).split('_'), f = +p.pop(), kind = p.join('_');
      if (kind === 'dragon_shadow') { var s2 = new Grid(36, 10); s2.ellipse(18, 5, 17, 4.5, C.shade); return { grid: s2, scale: 0.5, ox: Math.floor((8 - 18) / 2), oy: 8 - 5 }; }
      var g = creatureGrid(kind, f); if (!g) return null;
      var dw = g.w * 0.5, dh = g.h * 0.5;
      return { grid: g, scale: 0.5, ox: Math.floor((8 - dw) / 2), oy: 8 - dh - (LIFT[kind] || 0) };
    });
    Object.keys(CSIZE).forEach(function (kind) {
      var n = FRAMES[kind] || 4, base = (kind === 'ram' || kind === 'catapult') ? 'u_' + kind : 'a_' + kind;
      for (var f = 0; f < 4; f++) L.ALIAS[base + '_' + f] = 'c_' + kind + '_' + (n === 2 ? (f & 1) : f);
      // alte zwei Frames: _1 entspricht der Gegenphase (Frame 2), außer bei zweiphasigen Arten
      if (n === 4) L.ALIAS[base + '_1'] = 'c_' + kind + '_2';
    });
    L.ALIAS.a_dragon_shadow = 'c_dragon_shadow_0';
    S.creatureFrames = function (kind) { return FRAMES[kind] || 4; };
    // alte Sprites für den Vergleich behalten
    ['sheep', 'cow', 'chicken', 'rabbit', 'deer', 'wolf', 'bear', 'crab', 'fish', 'dragon', 'zombie', 'skeleton', 'slime', 'ghost', 'demon', 'giantchicken', 'yeti', 'sandworm', 'treant', 'golem']
      .forEach(function (k) { var d = L.DEFS['a_' + k + '_0']; if (d) def('lo_a_' + k + '_0', d.grid, { group: 'old', ox: d.ox, oy: d.oy }); });
    ['u_ram_0', 'u_catapult_0'].forEach(function (k) { var d = L.DEFS[k]; if (d) def('lo_' + k, d.grid, { group: 'old', ox: d.ox, oy: d.oy }); });
    // Zombie und Skelett als Figuren im feinen Raster (eigene Körper und Trachten)
    BODY.zombie = { skin: CP.zomb, tw: 7, th: 7, leg: 6, hr: 3.8, hair: K2.hairDk };
    BODY.skeleton = { skin: CP.bone, tw: 5, th: 7, leg: 6, hr: 3.6, hair: null };
    RACES2.push('zombie', 'skeleton');
    COST.zombie = { top: T3(C.dusk, C.plum, C.ink), sleeve: T3(C.dusk, C.plum, C.ink), pants: T3(K2.brown, K2.brownD, K2.brownD), shoes: C.ink, patches: 0, hat: null, ragged: 1 };
    COST.skeleton = { top: null, sleeve: null, pants: null, shoes: CP.bone[2], ribs: 1, hat: null };
    GOVS2.push('zombie', 'skeleton');
    ['zombie', 'skeleton'].forEach(function (k) {
      for (var f = 0; f < 4; f++) L.ALIAS['a_' + k + '_' + f] = 'h_' + k + '_monster_' + k + '_' + f;
      L.ALIAS['a_' + k + '_1'] = 'h_' + k + '_monster_' + k + '_2';
    });
  });

  WW.SPRITE_RACES = RACES;
})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
