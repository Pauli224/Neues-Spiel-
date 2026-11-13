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
      var g = new Grid(24, 18);
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
      // Flügel (Teamfarbe als Flughaut)
      if (f === 0) {
        for (var k = 0; k < 7; k++) { g.line(9, 9, 4 + k, 1 + (k > 3 ? k - 3 : 0), k & 1 ? 'Td' : 'T'); }
        g.line(9, 9, 3, 0, DRG[2]); g.line(9, 9, 11, 2, DRG[2]); g.set(3, 0, 'ink');
      } else {
        for (k = 0; k < 7; k++) { g.line(9, 10, 3 + k, 15 + (k > 3 ? 0 : 1), k & 1 ? 'Td' : 'T'); }
        g.line(9, 10, 2, 16, DRG[2]); g.line(9, 10, 11, 16, DRG[2]);
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
      '...fffef...',
      '..ffeeeeE..',
      '.feeeeeeEE.',
      '.eeeeeeeEE.',
      '..EEeeeEE..',
      '...wvwW....',
      '.w.lwlw.w..',
      '..wwoWw.w..',
      '...wwwWw...',
      '...wwwW....'], ['...W..W....', '...W..W....'], ['....WW.....', '...W...W...'], { edge: 'leafDD' });
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
  });

  WW.SPRITE_RACES = RACES;
})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
