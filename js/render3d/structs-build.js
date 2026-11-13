// =============================================================================
// Wuselwelt 3D – Bauwerke, Teil 2: Gebäude-Modelle (3D-B). Lädt nach structs-kit.js.
// Jede Funktion baut in einen Builder (Ursprung = Mitte der Grundfläche auf Sockelhöhe, +z = Vorderseite).
// P = { T: { main, dark, light } (Reichsfarbe als rgb), style, level, v (variant 0..255), w, h, … }
// =============================================================================
(function (WW) { 'use strict';

  const R3 = WW.R3 = WW.R3 || {};
  const K = R3.SKit;
  const M = R3.SModels = R3.SModels || {};
  const PI = Math.PI;

  const C = M.C = {
    wood: '#8b6b4a', woodD: '#5a4230', woodL: '#a88b66', log: '#7d5d3f', bark: '#5d4535', beam: '#4a3426',
    thatch: '#c2a05e', thatchD: '#a3854c', reed: '#b59a5f',
    stone: '#a29e96', stoneD: '#86827b', stoneL: '#c0bbb1', cobble: '#8f8a82',
    sand: '#d8c49a', sandL: '#e8dbbb', sandD: '#bfa77c',
    white: '#ece8de', marble: '#f2eee6',
    conc: '#9c9e9d', concD: '#7c7f80', concL: '#b8b8b3', concW: '#c9c6bc',
    brick: '#9c4a35', brickD: '#7a3829', brickL: '#b5634a',
    plaster: '#e6ddc9', cream: '#efe4c4',
    gold: '#d9ac3e', iron: '#4b4e54', steel: '#7d8389', rust: '#8b4e2e',
    soil: '#6e5139', soilD: '#584029', dirt: '#806a4e', grass: '#6c8c3c', hay: '#d5b55c',
    tile: '#a7553b', slate: '#58616c', dark: '#26282c', glass: '#2c3943', glassL: '#4d6474'
  };
  const PASTEL = ['#e9d8a6', '#d9a98b', '#b9cfa0', '#a9c4d3', '#e7c1b5', '#d8d0e3', '#f0e2c0', '#c8b49a', '#e2b880', '#b8c7b0'];
  const BRIGHT = ['#e05a4a', '#f0a43a', '#f2d24b', '#5bb36a', '#3e9bd6', '#8a5ac9', '#e46fa5', '#3fc1b0'];
  M.PASTEL = PASTEL; M.BRIGHT = BRIGHT;

  function rnd(P, k) { return K.h2((P.v | 0) * 131 + (P.seed | 0), k); }
  M.rnd = rnd;

  // Sockel (versenkt, gleicht Hänge aus)
  function plinth(b, sx, sz, col, h) {
    b.mat('stone', col || C.stoneD);
    b.box(-sx / 2, -1.2, -sz / 2, sx / 2, h == null ? 0.06 : h, sz / 2, 1);
  }
  M.plinth = plinth;

  // Fenster rundum: Baukörper (cx, cz, w, d), Geschosse ab y0 mit Höhe sh
  // o: { n (Geschosse), win: { w, h, …window-Optionen }, door: Seite (0..3) | -1, doorU, spacing, sides: [0,1,2,3], skipGround }
  function facade(b, cx, cz, w, d, y0, sh, o) {
    o = o || {};
    const sides = o.sides || [0, 1, 2, 3], n = o.n || 1;
    const ww = (o.win && o.win.w) || 0.16, wh = (o.win && o.win.h) || 0.22;
    for (const k of sides) {
      const len = (k & 1) ? d : w, dep = (k & 1) ? w / 2 : d / 2;
      b.push().tr(cx, 0, cz).side(k);
      const sp = o.spacing || 0.36;
      const cnt = Math.max(1, Math.floor((len - 0.12) / sp));
      for (let f = 0; f < n; f++) {
        const y = y0 + f * sh + sh * 0.38;
        for (let i = 0; i < cnt; i++) {
          const u = -len / 2 + (i + 0.5) * len / cnt;
          if (f === 0 && k === (o.door == null ? 0 : o.door)) {
            const du = o.doorU != null ? o.doorU : 0;
            if (Math.abs(u - du) < (cnt > 2 ? len / cnt * 0.6 : 0.2)) continue;
          }
          if (f === 0 && o.skipGround) continue;
          b.window(u, y, dep, ww, wh, o.win);
        }
      }
      if (k === (o.door == null ? 0 : o.door) && o.door !== -1) b.door(o.doorU || 0, y0, dep, o.doorW || 0.2, o.doorH || 0.36, o.doorO);
      b.pop();
    }
  }
  M.facade = facade;

  // Fachwerk auf einer Wand (Seite k): Pfosten, Riegel, Streben
  function timberFrame(b, cx, cz, w, d, y0, sh, n, col) {
    b.mat('wood', col || C.beam);
    for (let k = 0; k < 4; k++) {
      const len = (k & 1) ? d : w, dep = ((k & 1) ? w : d) / 2 + 0.012;
      b.push().tr(cx, 0, cz).side(k);
      const t = 0.035;
      for (let f = 0; f < n; f++) {
        const ya = y0 + f * sh, yb = ya + sh;
        b.box(-len / 2, yb - t, dep - 0.02, len / 2, yb, dep + 0.01, 8);
        b.box(-len / 2, ya, dep - 0.02, len / 2, ya + t, dep + 0.01, 8);
        const np = Math.max(2, Math.round(len / 0.32));
        for (let i = 0; i <= np; i++) {
          const u = -len / 2 + i * len / np;
          b.box(u - t / 2, ya, dep - 0.02, u + t / 2, yb, dep + 0.01, 8 | 1);
        }
        // Streben an den Ecken
        const su = len / np;
        b.beam([-len / 2 + 0.02, ya + 0.03, dep], [-len / 2 + su, yb - 0.04, dep], 0.025);
        b.beam([len / 2 - 0.02, ya + 0.03, dep], [len / 2 - su, yb - 0.04, dep], 0.025);
      }
      b.pop();
    }
  }

  function chimney(b, x, z, y0, h, col) {
    b.mat('stone', col || C.brick);
    b.blk(x, y0, z, 0.14, h, 0.14, 1);
    b.blk(x, y0 + h, z, 0.18, 0.04, 0.18, 0);
  }

  // ---------------------------------------------------------------------------
  // ZENTRUM Stufe 0: Lager
  // ---------------------------------------------------------------------------
  M.campfire = function (b, x, z, big) {
    const r = big ? 0.3 : 0.22;
    b.mat('plaster', '#4a4038').cyl(x, 0, z, r * 1.05, r * 1.05, 0.015, 10, { top: true });
    b.mat('stone', C.stoneD);
    for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2; b.ball(x + Math.cos(a) * r, 0.04, z + Math.sin(a) * r, 0.055 + (i % 3) * 0.008, 5); }
    b.mat('wood', '#3a2a20');
    for (let i = 0; i < 4; i++) { b.push().tr(x, 0.06, z).rotY(i * PI / 4 + 0.3).rotZ(0.25); b.cylX(-r * 0.8, r * 0.8, 0, 0, 0.03, 5); b.pop(); }
    // Glut und Schein (Material „glow" flackert)
    b.mat('glow', '#ff8a2a').cyl(x, 0.02, z, r * 3.2, r * 3.2, 0.004, 14, { top: true });
    b.mat('glow', '#ffb347').cone(x, 0.05, z, r * 0.55, 0.32, 6);
    b.mat('glow', '#ffe08a').cone(x, 0.05, z, r * 0.3, 0.2, 5);
    b.meta.glow.push(b._wp(x, 0.2, z));
  };
  function sitLog(b, x, z, a, len) {
    b.push().tr(x, 0.07, z).rotY(a);
    b.mat('wood', C.log).cylX(-len / 2, len / 2, 0, 0, 0.07, 7);
    b.pop();
  }
  function sack(b, x, z, s, col) { b.mat('cloth', col || '#c8b48a'); b.push().tr(x, 0, z).scale(1, 0.8, 1); b.dome(0, 0, 0, s, s * 1.4, 7, 3); b.pop(); }
  function crate(b, x, z, s, a, y) {
    b.push().tr(x, y || 0, z).rotY(a || 0);
    b.mat('wood', C.woodL).blk(0, 0, 0, s, s, s, 1);
    b.mat('wood', C.woodD);
    b.box(-s / 2 - 0.006, s * 0.42, -s / 2 - 0.006, s / 2 + 0.006, s * 0.58, s / 2 + 0.006, 1 | 2);
    b.pop();
  }
  function barrel(b, x, z, r, y) {
    b.mat('wood', C.wood).cyl(x, y || 0, z, r * 0.9, r, r * 1.2, 8, { top: false });
    b.mat('wood', C.wood).cyl(x, (y || 0) + r * 1.2, z, r, r * 0.9, r * 1.2, 8);
    b.mat('metal', C.iron).cyl(x, (y || 0) + r * 0.35, z, r * 0.98, r * 1.0, 0.03, 8, { top: false }).cyl(x, (y || 0) + r * 1.95, z, r * 0.95, r * 0.94, 0.03, 8, { top: false });
  }
  function logPile(b, x, z, a, n, len) {
    b.push().tr(x, 0, z).rotY(a || 0);
    b.mat('wood', C.log);
    let k = 0;
    for (let row = 0; row < 3 && k < n; row++) {
      for (let i = 0; i < 4 - row && k < n; i++, k++) {
        const zz = -0.18 + i * 0.12 + row * 0.06;
        b.cylX(-len / 2, len / 2, 0.055 + row * 0.1, zz, 0.055, 6);
      }
    }
    b.pop();
  }
  M.crate = crate; M.barrel = barrel; M.sack = sack; M.logPile = logPile;

  M.camp = function (b, P) {
    b.mat('plaster', '#86705a').cyl(0, 0, 0, 1.3, 1.3, 0.012, 16, { top: true });
    M.campfire(b, 0, 0.05, true);
    sitLog(b, -0.62, 0.3, 0.4, 0.5); sitLog(b, 0.55, 0.42, -0.6, 0.45); sitLog(b, 0.05, -0.62, 1.55, 0.5);
    // Fahnenmast
    b.flag(-0.95, 0, -0.85, 1.7, 0.42, 0.28, P.T.main, { r: 0.03 });
    // Vorräte
    sack(b, 0.85, -0.7, 0.13); sack(b, 1.02, -0.58, 0.11, '#b59d74'); sack(b, 0.95, -0.88, 0.12);
    crate(b, 0.7, -0.98, 0.2, 0.3); crate(b, 1.05, -1.05, 0.18, -0.2); crate(b, 0.85, -1.0, 0.16, 0.6, 0.2);
    logPile(b, -0.9, 0.85, 0.3, 7, 0.6);
    if (P.v & 1) {
      // Trockengestell mit Fellen
      b.mat('wood', C.woodD);
      b.beam([0.7, 0, 0.75], [0.75, 0.55, 0.78], 0.03); b.beam([1.2, 0, 0.6], [1.15, 0.55, 0.62], 0.03);
      b.beam([0.72, 0.52, 0.76], [1.16, 0.52, 0.62], 0.03);
      b.mat('cloth', '#9b7a52').quad([0.78, 0.15, 0.76], [1.12, 0.15, 0.65], [1.12, 0.5, 0.63], [0.78, 0.5, 0.74]);
    } else {
      // Kochstelle mit Kessel
      b.mat('wood', C.woodD);
      b.beam([-0.22, 0, 0.05], [0, 0.55, 0.05], 0.025); b.beam([0.22, 0, 0.05], [0, 0.55, 0.05], 0.025);
      b.mat('metal', C.iron).push().tr(0, 0.22, 0.05).dome(0, 0, 0, 0.09, -0.1, 7, 2).pop();
    }
  };

  // ---------------------------------------------------------------------------
  // ZENTRUM Stufe 1: Dorfhalle
  // ---------------------------------------------------------------------------
  M.hall = function (b, P) {
    const alt = P.v & 1;
    plinth(b, 2.3, 1.5, C.stoneD, 0.08);
    const w = alt ? 2.0 : 2.2, d = 1.3, h = 0.72;
    b.mat('wood', C.log).blk(0, 0.08, -0.1, w, h, d, 1);
    // Eckbalken
    b.mat('wood', C.woodD);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.blk(sx * w / 2, 0.08, -0.1 + sz * d / 2, 0.09, h + 0.02, 0.09, 1);
    b.mat('roof', alt ? C.thatch : '#6e5a45');
    b.gable(0, 0.08 + h, -0.1, w, d, 0.62, { over: 0.16, th: alt ? 0.12 : 0.06, ends: { mat: 'wood', col: C.wood } });
    // Vordach mit Pfosten
    b.mat('wood', C.woodD);
    for (const x of [-0.6, 0, 0.6]) b.cyl(x, 0.08, 0.83, 0.035, 0.035, 0.55, 6);
    b.mat('roof', '#6a5543');
    b.push().tr(0, 0.63, 0.55).rotX(0.32); b.box(-0.8, 0, -0.06, 0.8, 0.04, 0.42, 0); b.pop();
    b.mat('wood', C.woodL).box(-0.9, 0.0, 0.55, 0.9, 0.08, 0.95, 1);
    facade(b, 0, -0.1, w, d, 0.08, h, { n: 1, win: { w: 0.15, h: 0.18, shutters: C.woodD, frameMat: 'wood', frame: C.woodD }, door: 0, doorW: 0.26, doorH: 0.42, sides: [0, 1, 3], doorO: { frameMat: 'wood', frame: C.woodD, step: false } });
    // Wappenbrett über der Tür in Reichsfarbe
    b.mat('cloth', P.T.main).box(-0.18, 0.62, 0.56, 0.18, 0.66, 0.57, 0);
    b.push().tr(0, 0.08 + h + 0.15, -0.1 + d / 2 + 0.17);
    b.mat('cloth', P.T.main).box(-0.12, 0, 0, 0.12, 0.3, 0.02, 0);
    b.mat('cloth', P.T.dark).box(-0.12, 0.12, 0.004, 0.12, 0.18, 0.024, 0);
    b.pop();
    chimney(b, alt ? -0.7 : 0.75, -0.35, 0.6, 0.85, C.stoneD);
    b.stack(alt ? -0.7 : 0.75, 1.5, -0.35);
    logPile(b, -1.25, -0.6, PI / 2, 6, 0.55);
    if (alt) { barrel(b, 1.2, 0.5, 0.11); barrel(b, 1.25, 0.25, 0.1); }
    else { crate(b, 1.2, 0.6, 0.2, 0.2); sack(b, 1.25, 0.3, 0.11); }
  };

  // ---------------------------------------------------------------------------
  // ZENTRUM Stufe 2: Regierungssitze
  // ---------------------------------------------------------------------------
  const SEAT = M.SEAT = {};

  // Burg: Ringmauer, runde Ecktürme mit Kegeldach und Wimpel, Bergfried, Torhaus
  SEAT.monarchy = function (b, P) {
    plinth(b, 2.9, 2.9, C.stoneD, 0.05);
    const S = 1.25, wh = 0.95, t = 0.2;
    b.mat('stone', C.stone);
    b.box(-S, 0, -S, S, wh, -S + t, 1); b.box(-S, 0, S - t, S, wh, S, 1);
    b.box(-S, 0, -S + t, -S + t, wh, S - t, 1); b.box(S - t, 0, -S + t, S, wh, S - t, 1);
    b.mat('stone', C.stoneL);
    b.merlons(-S, S, wh, -S + t / 2, t, 0.12, 0.12, 0.08); b.merlons(-S, S, wh, S - t / 2, t, 0.12, 0.12, 0.08);
    b.push().rotY(PI / 2); b.merlons(-S, S, wh, -S + t / 2, t, 0.12, 0.12, 0.08); b.merlons(-S, S, wh, S - t / 2, t, 0.12, 0.12, 0.08); b.pop();
    // Hof
    b.mat('plaster', C.cobble).box(-S + t, 0, -S + t, S - t, 0.04, S - t, 1);
    // Ecktürme
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (S - 0.05), z = sz * (S - 0.05);
      b.mat('stone', C.stone).cyl(x, 0, z, 0.34, 0.3, 1.55, 10);
      b.mat('stone', C.stoneD).cyl(x, 1.55, z, 0.36, 0.36, 0.1, 10);
      b.mat('roof', K.tame(P.T.main, 0.15)).cone(x, 1.65, z, 0.38, 0.7, 10);
      b.flag(x, 2.3, z, 0.35, 0.28, 0.14, P.T.light, { pennant: true, poleMat: 'metal', pole: C.iron, r: 0.015 });
      // Schießscharten
      b.mat('glass', C.dark);
      b.push().tr(x, 0, z).rotY(sx * sz > 0 ? PI / 4 : -PI / 4);
      b.box(-0.025, 0.9, 0.3, 0.025, 1.12, 0.335, 1 | 2 | 8); b.pop();
    }
    // Bergfried
    const kx = -0.15, kz = -0.25;
    b.mat('stone', C.stone).blk(kx, 0, kz, 1.05, 2.45, 1.05, 1);
    b.mat('stone', C.stoneL).blk(kx, 2.45, kz, 1.15, 0.08, 1.15, 1);
    b.push().tr(kx, 0, kz);
    b.merlons(-0.57, 0.57, 2.53, -0.53, 0.08, 0.14, 0.11, 0.08); b.merlons(-0.57, 0.57, 2.53, 0.53, 0.08, 0.14, 0.11, 0.08);
    b.push().rotY(PI / 2); b.merlons(-0.49, 0.49, 2.53, -0.53, 0.08, 0.14, 0.11, 0.08); b.merlons(-0.49, 0.49, 2.53, 0.53, 0.08, 0.14, 0.11, 0.08); b.pop();
    // Turm auf dem Bergfried
    b.mat('stone', C.stone).cyl(0.3, 2.45, -0.3, 0.2, 0.2, 0.75, 8);
    b.mat('roof', K.tame(P.T.main, 0.15)).cone(0.3, 3.2, -0.3, 0.24, 0.55, 8);
    b.flag(0.3, 3.7, -0.3, 0.5, 0.5, 0.3, P.T.main, { poleMat: 'metal', pole: C.iron });
    // Fenster
    for (let k = 0; k < 4; k++) {
      b.push().side(k);
      for (const y of [1.2, 1.75]) for (const u of [-0.22, 0.22]) b.window(u, y, 0.525, 0.1, 0.2, { cross: true, frameMat: 'stone', frame: C.stoneL });
      b.pop();
    }
    b.pop();
    // Torhaus vorn
    b.mat('stone', C.stone).blk(0.35, 0, S - 0.05, 0.75, 1.3, 0.42, 1);
    b.mat('stone', C.stoneL).push().tr(0.35, 0, S - 0.05).merlons(-0.4, 0.4, 1.3, 0.18, 0.06, 0.1, 0.1, 0.07).pop();
    b.mat('glass', C.dark).push().tr(0.35, 0, S + 0.17).extrudeZ([[-0.17, 0], [0.17, 0], [0.17, 0.42], [0.1, 0.52], [0, 0.55], [-0.1, 0.52], [-0.17, 0.42]], -0.02, 0.02).pop();
    b.mat('wood', C.woodD).push().tr(0.35, 0, S + 0.19).box(-0.15, 0.0, -0.01, 0.15, 0.36, 0.012, 0).pop();
    // Banner am Torhaus
    b.mat('cloth', P.T.main).box(0.2, 0.62, S + 0.17, 0.5, 1.15, S + 0.19, 0);
    b.mat('cloth', P.T.light).box(0.32, 0.7, S + 0.19, 0.38, 1.1, S + 0.2, 0);
  };

  // Rathaus: Säulenvorhalle mit Giebel, Uhrturm mit Kuppel, heller Sandstein
  SEAT.democracy = function (b, P) {
    plinth(b, 2.8, 2.6, C.sandD, 0.06);
    const w = 2.5, d = 1.6, z0 = -0.3, h = 1.35;
    // Treppe
    b.mat('stone', C.sandL);
    for (let i = 0; i < 4; i++) b.box(-0.85 + i * 0.03, 0, 0.5 + i * 0.07, 0.85 - i * 0.03, 0.06 + i * 0.05, 1.35, 1);
    b.mat('stone', C.sand).blk(0, 0.06, z0, w, h, d, 1);
    b.mat('stone', C.sandL).blk(0, 0.06 + h, z0, w + 0.08, 0.08, d + 0.08, 1);
    b.mat('roof', C.slate).hip(0, 0.14 + h, z0, w + 0.02, d + 0.02, 0.45, { over: 0.05, ridge: 1 });
    facade(b, 0, z0, w, d, 0.06, 0.62, { n: 2, win: { w: 0.15, h: 0.3, cross: true, frameMat: 'stone', frame: C.white }, door: -1, spacing: 0.32, sides: [1, 2, 3] });
    // Vorderfront: Fenster neben der Vorhalle
    b.push().tr(0, 0, z0).side(0);
    for (const u of [-1.05, -0.8, 0.8, 1.05]) for (let f = 0; f < 2; f++) b.window(u, 0.28 + f * 0.62, d / 2, 0.14, 0.3, { cross: true, frameMat: 'stone', frame: C.white });
    b.door(0, 0.26, d / 2, 0.26, 0.48, { col: '#4a3626', frameMat: 'stone', frame: C.white, step: false });
    b.pop();
    // Vorhalle: Podest, Säulen, Gebälk, Dreiecksgiebel
    const pz = 0.75, ph = 1.0;
    b.mat('stone', C.white).box(-0.75, 0.0, z0 + d / 2, 0.75, 0.26, pz + 0.18, 1);
    for (let i = 0; i < 6; i++) {
      const x = -0.62 + i * 0.248;
      b.mat('stone', C.marble).cyl(x, 0.26, pz, 0.065, 0.055, ph, 10);
      b.blk(x, 0.26 + ph - 0.03, pz, 0.15, 0.05, 0.15, 1); b.blk(x, 0.26, pz, 0.15, 0.04, 0.15, 1);
    }
    b.mat('stone', C.white).box(-0.78, 0.26 + ph, z0 + d / 2 - 0.05, 0.78, 0.26 + ph + 0.14, pz + 0.14, 1);
    b.push().tr(0, 0.26 + ph + 0.14, 0);
    b.extrudeZ([[-0.8, 0], [0.8, 0], [0, 0.38]], z0 + d / 2 - 0.05, pz + 0.16);
    b.mat('roof', C.slate);
    b.pop();
    // Uhrturm
    const tz = z0 - 0.05, tb = 0.14 + h;
    b.mat('stone', C.sand).blk(0, tb, tz, 0.62, 1.0, 0.62, 1);
    b.mat('stone', C.sandL).blk(0, tb + 1.0, tz, 0.7, 0.07, 0.7, 1);
    for (let k = 0; k < 4; k++) {
      b.push().tr(0, 0, tz).side(k);
      b.mat('plaster', '#f6f2e6').cylZ(0.31, 0.335, 0, tb + 0.68, 0.17, 14);
      b.mat('metal', C.dark);
      b.box(-0.012, tb + 0.68, 0.335, 0.012, tb + 0.8, 0.345, 0);
      b.push().tr(0, tb + 0.68, 0.335).rotZ(-1.1); b.box(-0.01, 0, 0, 0.01, 0.13, 0.012, 0); b.pop();
      b.window(0, tb + 0.18, 0.31, 0.12, 0.28, { cross: true, frameMat: 'stone', frame: C.white });
      b.pop();
    }
    b.mat('stone', C.white).cyl(0, tb + 1.07, tz, 0.26, 0.26, 0.25, 12);
    b.mat('roof', K.tame(P.T.main, 0.2)).dome(0, tb + 1.32, tz, 0.28, 0.3, 12, 4);
    b.mat('metal', C.gold).cone(0, tb + 1.6, tz, 0.04, 0.3, 6);
    b.flag(0.0, tb + 1.85, tz, 0.0001, 0.0, 0.0, P.T.main);
    // Fahnen an der Fassade
    b.flag(-1.15, 0.0, 0.62, 1.9, 0.38, 0.24, P.T.main, { poleMat: 'metal', pole: C.steel });
    b.flag(1.15, 0.0, 0.62, 1.9, 0.38, 0.24, P.T.main, { poleMat: 'metal', pole: C.steel, dir: -1 });
    // Wahlurne vor der Treppe? zu klein – Blumenkübel
    b.mat('stone', C.stoneL).cyl(-0.95, 0, 1.15, 0.1, 0.12, 0.14, 8);
    b.mat('plaster', C.grass).ball(-0.95, 0.18, 1.15, 0.1, 6);
    b.mat('stone', C.stoneL).cyl(0.95, 0, 1.15, 0.1, 0.12, 0.14, 8);
    b.mat('plaster', C.grass).ball(0.95, 0.18, 1.15, 0.1, 6);
  };

  // Kommandantur: breiter Betonklotz, Stufenbau, riesige Banner (abstrakt), Scheinwerfermasten
  SEAT.fascism = function (b, P) {
    plinth(b, 2.95, 2.8, C.concD, 0.08);
    const z0 = -0.2;
    b.mat('stone', C.concD).box(-1.4, 0.0, z0 - 0.85, 1.4, 0.18, z0 + 0.95, 1);
    b.mat('plaster', C.conc).blk(0, 0.18, z0, 2.7, 1.25, 1.5, 1);
    b.mat('plaster', C.concL).blk(0, 1.43, z0, 2.78, 0.1, 1.58, 1);
    b.mat('plaster', C.conc).blk(0, 1.53, z0 - 0.1, 1.5, 0.95, 1.1, 1);
    b.mat('plaster', C.concL).blk(0, 2.48, z0 - 0.1, 1.58, 0.08, 1.18, 1);
    b.mat('plaster', C.concD).blk(0, 2.56, z0 - 0.2, 0.7, 0.5, 0.6, 1);
    // Schlitzfenster
    b.mat('glass', '#1d2328');
    for (let k = 0; k < 4; k++) {
      const len = (k & 1) ? 1.5 : 2.7, dep = ((k & 1) ? 2.7 : 1.5) / 2;
      b.push().tr(0, 0, z0).side(k);
      for (const y of [0.55, 1.0]) for (let i = 0; i < Math.floor(len / 0.32); i++) {
        const u = -len / 2 + 0.2 + i * 0.32;
        if (k === 0 && Math.abs(u) < 0.35) continue;
        b.box(u - 0.05, y, dep - 0.01, u + 0.05, y + 0.22, dep + 0.008, 1 | 2 | 8);
      }
      b.pop();
    }
    b.push().tr(0, 0, z0 - 0.1);
    for (const u of [-0.5, -0.2, 0.2, 0.5]) b.box(u - 0.04, 1.75, 0.54, u + 0.04, 2.3, 0.558, 1 | 2 | 8);
    b.pop();
    // Säulenportal
    b.mat('plaster', C.concL);
    for (const x of [-0.3, -0.1, 0.1, 0.3]) b.blk(x, 0.18, z0 + 0.86, 0.09, 1.05, 0.09, 1);
    b.blk(0, 1.23, z0 + 0.82, 0.8, 0.12, 0.26, 1);
    b.mat('wood', '#2a2a2c').box(-0.16, 0.18, z0 + 0.74, 0.16, 0.7, z0 + 0.76, 1);
    // Riesige Banner (Reichsfarbe, abstraktes Muster: Rand, Mittelstreifen, Raute)
    for (const x of [-0.95, -0.55, 0.55, 0.95]) {
      const zf = z0 + 0.76, y1 = 1.4, y0 = 0.3, hw = 0.13;
      b.mat('cloth', P.T.dark).box(x - hw, y0, zf, x + hw, y1, zf + 0.015, 8);
      b.mat('cloth', P.T.main).box(x - hw + 0.025, y0 + 0.03, zf + 0.015, x + hw - 0.025, y1 - 0.03, zf + 0.022, 8);
      b.mat('cloth', '#e8e4da').box(x - 0.02, y0 + 0.05, zf + 0.022, x + 0.02, y1 - 0.05, zf + 0.027, 8);
      b.push().tr(x, 0.95, zf + 0.027).rotZ(PI / 4);
      b.mat('cloth', P.T.dark).box(-0.05, -0.05, 0, 0.05, 0.05, 0.006, 8);
      b.pop();
      b.mat('cloth', P.T.dark).push().tr(x, y0, zf).extrudeZ([[-hw, 0], [hw, 0], [hw, -0.12], [0, -0.04], [-hw, -0.12]], 0, 0.015).pop();
      b.mat('metal', C.iron).box(x - hw - 0.02, y1, zf - 0.02, x + hw + 0.02, y1 + 0.03, zf + 0.03, 0);
    }
    // Banner am Hochbau
    b.push().tr(0, 0, z0 - 0.1 + 0.555);
    b.mat('cloth', P.T.main).box(-0.12, 1.6, 0, 0.12, 2.45, 0.015, 8);
    b.mat('cloth', P.T.dark).box(-0.04, 1.62, 0.015, 0.04, 2.43, 0.02, 8);
    b.pop();
    // Scheinwerfermasten an den Ecken
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 1.25, z = z0 + sz * 0.65;
      b.mat('metal', C.iron).cyl(x, 1.53, z, 0.025, 0.02, 0.5, 5);
      b.push().tr(x, 2.03, z).rotY(sx * sz > 0 ? 0.6 : -0.6).rotX(0.4);
      b.mat('metal', C.iron).box(-0.07, -0.05, -0.05, 0.07, 0.05, 0.06, 0);
      b.mat('glow', '#fff4c8').box(-0.055, -0.04, 0.06, 0.055, 0.04, 0.07, 0);
      b.pop();
    }
    // Antenne
    b.mat('metal', C.steel).cyl(0.2, 3.06, z0 - 0.2, 0.02, 0.01, 0.7, 5);
    b.box(0.08, 3.5, z0 - 0.21, 0.32, 3.52, z0 - 0.19, 0);
    b.flag(-0.2, 3.06, z0 - 0.2, 0.75, 0.42, 0.26, P.T.main, { poleMat: 'metal', pole: C.steel });
  };

  // Volkshaus: breiter Bau, Fahne, Schornstein, Fensterreihen
  SEAT.communism = function (b, P) {
    plinth(b, 2.9, 2.6, C.concD, 0.06);
    const z0 = -0.15, wallC = '#c9c2b2';
    b.mat('plaster', wallC).blk(0, 0.06, z0, 2.7, 1.0, 1.4, 1);
    b.mat('plaster', '#b0a998').blk(0, 1.06, z0, 2.76, 0.07, 1.46, 1);
    b.mat('plaster', wallC).blk(0, 1.13, z0, 1.1, 0.75, 1.2, 1);
    b.mat('plaster', '#b0a998').blk(0, 1.88, z0, 1.16, 0.06, 1.26, 1);
    facade(b, 0, z0, 2.7, 1.4, 0.06, 0.5, { n: 2, win: { w: 0.15, h: 0.22, frameMat: 'plaster', frame: '#e6e0d2' }, door: 0, doorW: 0.34, doorH: 0.4, spacing: 0.27, doorO: { col: '#6b4a32' } });
    facade(b, 0, z0, 1.1, 1.2, 1.13, 0.37, { n: 2, win: { w: 0.13, h: 0.2, frameMat: 'plaster', frame: '#e6e0d2' }, door: -1, spacing: 0.27 });
    // Vordach
    b.mat('plaster', '#a59e8d').box(-0.45, 0.5, z0 + 0.7, 0.45, 0.56, z0 + 1.05, 0);
    b.mat('metal', C.steel);
    for (const x of [-0.4, 0.4]) b.cyl(x, 0.06, z0 + 1.0, 0.02, 0.02, 0.45, 5);
    // großes Tuch über dem Eingang (Reichsfarbe, schlicht)
    b.mat('cloth', P.T.main).box(-0.5, 0.62, z0 + 0.706, 0.5, 0.9, z0 + 0.72, 8);
    b.mat('cloth', P.T.light).box(-0.42, 0.74, z0 + 0.72, 0.42, 0.78, z0 + 0.726, 8);
    // Fahne auf dem Dach
    b.flag(0, 1.94, z0, 1.0, 0.55, 0.34, P.T.main, { poleMat: 'metal', pole: C.steel });
    // Schornstein
    const cx = 1.05, cz = z0 - 0.95;
    b.mat('stone', C.brick).cyl(cx, 0, cz, 0.17, 0.12, 2.9, 10);
    b.mat('plaster', '#d8d2c4').cyl(cx, 2.3, cz, 0.135, 0.13, 0.12, 10, { top: false });
    b.mat('stone', C.brickD).cyl(cx, 2.9, cz, 0.15, 0.15, 0.08, 10);
    b.stack(cx, 2.98, cz);
    // Wandzeitung / Tafel
    b.mat('plaster', '#d3c8a8').box(-1.35, 0.15, z0 + 0.71, -1.0, 0.45, z0 + 0.73, 8);
  };

  // Tempel: Podium, Würfel, Tambour, Kuppel, goldene Spitze, schlanke Ecktürme mit Goldkappen
  SEAT.theocracy = function (b, P) {
    plinth(b, 2.9, 2.9, C.stoneL, 0.04);
    b.mat('stone', C.white);
    b.blk(0, 0.0, 0, 2.7, 0.12, 2.7, 1); b.blk(0, 0.12, 0, 2.5, 0.12, 2.5, 1);
    b.mat('stone', C.marble).blk(0, 0.24, 0, 1.75, 1.15, 1.75, 1);
    b.mat('metal', C.gold).blk(0, 1.39, 0, 1.82, 0.05, 1.82, 1);
    b.mat('stone', C.white).blk(0, 1.44, 0, 1.75, 0.1, 1.75, 1);
    b.mat('stone', C.marble).cyl(0, 1.54, 0, 0.72, 0.72, 0.32, 16);
    b.mat('metal', C.gold).cyl(0, 1.86, 0, 0.74, 0.74, 0.03, 16, { top: false });
    b.mat('roof', '#f3efe4').dome(0, 1.89, 0, 0.72, 0.8, 16, 6);
    b.mat('metal', C.gold).ball(0, 2.72, 0, 0.08, 8);
    b.mat('metal', C.gold).cyl(0, 2.78, 0, 0.035, 0.0, 0.55, 6);
    b.mat('metal', C.gold).ball(0, 3.0, 0, 0.045, 6);
    // Bogenfenster im Tambour
    b.mat('glass', '#5a4a2a');
    for (let i = 0; i < 8; i++) { b.push().rotY(i * PI / 4).box(-0.05, 1.6, 0.7, 0.05, 1.8, 0.725, 1 | 8).pop(); }
    // Portale mit Bogen
    for (let k = 0; k < 4; k++) {
      b.push().side(k);
      b.mat('stone', C.white).box(-0.38, 0.24, 0.875, 0.38, 1.25, 0.96, 1);
      b.mat('glass', '#4a3a26').push().tr(0, 0.24, 0.96).extrudeZ([[-0.17, 0], [0.17, 0], [0.17, 0.5], [0.12, 0.62], [0, 0.68], [-0.12, 0.62], [-0.17, 0.5]], -0.02, 0.006).pop();
      b.mat('metal', C.gold).push().tr(0, 0.24, 0.962).extrudeZ([[-0.21, 0.5], [-0.17, 0.5], [-0.12, 0.62], [0, 0.68], [0.12, 0.62], [0.17, 0.5], [0.21, 0.5], [0.15, 0.66], [0, 0.73], [-0.15, 0.66]], 0, 0.01).pop();
      b.mat('cloth', P.T.main).box(-0.62, 0.45, 0.875, -0.46, 1.15, 0.89, 8);
      b.mat('cloth', P.T.main).box(0.46, 0.45, 0.875, 0.62, 1.15, 0.89, 8);
      b.mat('metal', C.gold).box(-0.6, 0.7, 0.89, -0.48, 0.74, 0.895, 8).box(0.48, 0.7, 0.89, 0.6, 0.74, 0.895, 8);
      b.pop();
    }
    // Ecktürmchen
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * 1.12, z = sz * 1.12;
      b.mat('stone', C.marble).cyl(x, 0.24, z, 0.13, 0.11, 1.75, 10);
      b.mat('metal', C.gold).cyl(x, 1.99, z, 0.13, 0.13, 0.04, 10);
      b.mat('stone', C.white).cyl(x, 2.03, z, 0.1, 0.1, 0.16, 8);
      b.mat('metal', C.gold).dome(x, 2.19, z, 0.11, 0.16, 8, 3);
      b.mat('metal', C.gold).cone(x, 2.34, z, 0.02, 0.18, 5);
    }
  };

  // Kontor: hohes Backstein-Kaufmannshaus mit Treppengiebel, Lagerhaus, Holzkran
  SEAT.republic = function (b, P) {
    plinth(b, 2.9, 2.8, C.stoneD, 0.06);
    const w = 1.3, d = 1.6, h = 2.0, x0 = -0.55, z0 = -0.2;
    b.mat('stone', C.brick).blk(x0, 0.06, z0, w, h, d, 1);
    // Treppengiebel vorn und hinten (First entlang z)
    const steps = [[-w / 2, 0], [w / 2, 0], [w / 2, 0.18], [0.5, 0.18], [0.5, 0.42], [0.34, 0.42], [0.34, 0.66], [0.18, 0.66], [0.18, 0.9], [-0.18, 0.9], [-0.18, 0.66], [-0.34, 0.66], [-0.34, 0.42], [-0.5, 0.42], [-0.5, 0.18], [-w / 2, 0.18]];
    for (const zz of [z0 + d / 2, z0 - d / 2 + 0.12]) {
      b.mat('stone', C.brick).push().tr(x0, 0.06 + h, 0).extrudeZ(steps, zz - 0.12, zz).pop();
      b.mat('stone', C.white).push().tr(x0, 0.06 + h, 0);
      for (const st of [[-0.5, 0.18], [0.5, 0.18], [-0.34, 0.42], [0.34, 0.42], [-0.18, 0.66], [0.18, 0.66], [0, 0.9]]) b.blk(st[0] + (st[0] < 0 ? 0.06 : st[0] > 0 ? -0.06 : 0), st[1], zz - 0.06, 0.16, 0.04, 0.16, 0);
      b.pop();
    }
    b.mat('roof', '#5a3a2e');
    b.push().tr(x0, 0, z0).rotY(PI / 2).gable(0, 0.06 + h, 0, d - 0.24, w - 0.04, 0.82, { over: 0.03, th: 0.05, ends: false }).pop();
    facade(b, x0, z0, w, d, 0.06, 0.5, { n: 4, win: { w: 0.14, h: 0.28, cross: true, frameMat: 'plaster', frame: '#efe8dc' }, door: 0, doorW: 0.24, doorH: 0.42, spacing: 0.3, sides: [0, 1, 3] });
    // Giebelfenster und Ladeluke mit Kranbalken
    b.push().tr(x0, 0.06 + h, z0 + d / 2);
    b.window(-0.2, 0.25, 0, 0.12, 0.22, { cross: true, frame: '#efe8dc' }); b.window(0.2, 0.25, 0, 0.12, 0.22, { cross: true, frame: '#efe8dc' });
    b.mat('wood', C.woodD).box(-0.1, 0.52, 0, 0.1, 0.78, 0.02, 1);
    b.mat('wood', C.beam).box(-0.03, 0.8, -0.1, 0.03, 0.86, 0.35, 0);
    b.mat('metal', C.iron).box(-0.004, 0.45, 0.31, 0.004, 0.8, 0.318, 0);
    b.pop();
    // Lagerhaus rechts
    const wx = 0.75, ww = 1.1, wd = 1.5;
    b.mat('stone', C.brickL).blk(wx, 0.06, z0, ww, 1.05, wd, 1);
    b.mat('roof', K.tame(P.T.main, 0.3)).push().tr(wx, 0, z0).rotY(PI / 2).gable(0, 1.11, 0, wd, ww, 0.5, { over: 0.08, ends: { mat: 'stone', col: C.brickL } }).pop();
    facade(b, wx, z0, ww, wd, 0.06, 0.5, { n: 2, win: { w: 0.12, h: 0.22, frame: '#efe8dc' }, door: 0, doorW: 0.32, doorH: 0.42, spacing: 0.35, sides: [0, 1] });
    // Holzkran
    const kx = 1.2, kz = 0.95;
    b.mat('wood', C.woodD);
    b.blk(kx, 0.06, kz, 0.4, 0.12, 0.4, 1);
    b.cyl(kx, 0.18, kz, 0.06, 0.05, 1.6, 6);
    b.beam([kx, 1.6, kz], [kx - 0.9, 1.95, kz + 0.25], 0.06);
    b.beam([kx, 1.0, kz], [kx - 0.5, 1.75, kz + 0.14], 0.035);
    b.mat('metal', C.iron).box(kx - 0.86, 1.15, kz + 0.23, kx - 0.85, 1.93, kz + 0.24, 0);
    crate(b, kx - 0.855, kz + 0.235, 0.16, 0.2, 1.0);
    // Ware vor dem Haus
    crate(b, -1.2, 0.95, 0.2, 0.1); crate(b, -1.0, 1.05, 0.18, -0.3); barrel(b, -1.25, 0.65, 0.1); barrel(b, 0.1, 1.15, 0.1); sack(b, 0.32, 1.1, 0.1);
    b.flag(-1.25, 0.06, -1.1, 1.9, 0.4, 0.26, P.T.main, { stripe: '#f2ece0' });
  };

  // Kommune: bunter Flickenbau, Wellblech, Windrad, Wimpelkette
  SEAT.anarchy = function (b, P) {
    plinth(b, 2.8, 2.8, C.stoneD, 0.04);
    const r = (k) => rnd(P, k);
    const parts = [[-0.6, -0.4, 1.2, 0.9, 1.0], [0.55, -0.55, 1.0, 0.85, 0.75], [0.35, 0.45, 1.0, 0.8, 0.55], [-0.75, 0.55, 0.75, 0.7, 0.62]];
    parts.forEach(function (p, i) {
      const col = BRIGHT[(i * 3 + (P.v | 0)) % BRIGHT.length];
      b.mat(i & 1 ? 'wood' : 'plaster', K.tame(col, 0.25)).blk(p[0], 0.04, p[1], p[2], p[4], p[3], 1);
      // Flicken
      for (let j = 0; j < 3; j++) {
        const pc = BRIGHT[(i + j * 2 + 1) % BRIGHT.length];
        b.push().tr(p[0], 0, p[1]).side(j);
        const len = (j & 1) ? p[3] : p[2], dep = ((j & 1) ? p[2] : p[3]) / 2;
        const u = (r(i * 7 + j) - 0.5) * (len - 0.3), y = 0.15 + r(i * 11 + j) * (p[4] - 0.4);
        b.mat('wood', K.tame(pc, 0.15)).box(u - 0.12, y, dep, u + 0.12, y + 0.2, dep + 0.015, 8);
        b.window(-u * 0.6, 0.12 + p[4] * 0.45, dep, 0.13, 0.15, { frameMat: 'wood', frame: K.tame(BRIGHT[(i + j) % 8], 0.2) });
        b.pop();
      }
      // Wellblech schräg
      b.push().tr(p[0], 0.04 + p[4], p[1]).rotX(i & 1 ? 0.18 : -0.15).rotZ(i & 2 ? 0.1 : -0.08);
      b.mat('metal', i === 2 ? C.rust : '#8d949a').box(-p[2] / 2 - 0.08, 0, -p[3] / 2 - 0.08, p[2] / 2 + 0.08, 0.03, p[3] / 2 + 0.08, 0);
      b.pop();
    });
    // Aufbau oben: Kuppel aus Planen
    b.mat('cloth', K.tame(P.T.main, 0.1)).dome(-0.6, 1.08, -0.4, 0.38, 0.42, 8, 3);
    b.mat('cloth', '#f2d24b').dome(-0.6, 1.08, -0.4, 0.385, 0.2, 8, 1);
    b.door(-0.6, 0.04, 0.05, 0.22, 0.4, { col: '#3e9bd6', frameMat: 'wood', frame: '#f0a43a' });
    // Windrad
    const wx = 0.7, wz = -0.75;
    b.mat('metal', C.steel).cyl(wx, 0.79, wz, 0.03, 0.02, 1.4, 5);
    b.push().tr(wx, 2.2, wz + 0.05);
    for (let i = 0; i < 3; i++) { b.push().rotZ(i * PI * 2 / 3 + 0.3); b.mat('wood', BRIGHT[i * 2]).box(-0.03, 0, -0.01, 0.03, 0.42, 0.01, 0); b.pop(); }
    b.mat('metal', C.iron).ball(0, 0, 0, 0.04, 5);
    b.pop();
    // Wimpelkette
    b.mat('wood', C.woodD).cyl(1.25, 0, 1.2, 0.025, 0.025, 1.0, 5).cyl(-1.25, 0, 1.15, 0.025, 0.025, 1.0, 5);
    b.mat('cloth', '#fff');
    for (let i = 0; i < 9; i++) {
      const t = i / 8, x = -1.25 + t * 2.5, y = 0.97 - Math.sin(t * PI) * 0.18, z = 1.15 + t * 0.05;
      b.c(BRIGHT[i % 8]).tri([x - 0.07, y, z], [x + 0.07, y, z], [x, y - 0.13, z]).tri([x + 0.07, y, z], [x - 0.07, y, z], [x, y - 0.13, z]);
    }
    // Leiter, Fässer, Topfpflanzen
    b.mat('wood', C.woodL);
    b.beam([0.05, 0.04, 0.88], [0.0, 1.0, 0.86], 0.025); b.beam([0.25, 0.04, 0.88], [0.2, 1.0, 0.86], 0.025);
    for (let i = 1; i < 6; i++) b.beam([0.04 - i * 0.008, 0.04 + i * 0.16, 0.875], [0.24 - i * 0.008, 0.04 + i * 0.16, 0.875], 0.018);
    barrel(b, 1.15, 0.05, 0.1); barrel(b, 1.15, -0.2, 0.1);
    b.mat('plaster', '#5bb36a').ball(-1.15, 0.12, -0.2, 0.13, 6).ball(-1.2, 0.1, 0.05, 0.1, 6);
    b.mat('glow', '#ffb347'); M.campfire(b, 0.0, 1.12, false);
  };

  // Langhaus mit Feuer
  SEAT.tribe = function (b, P) {
    b.mat('plaster', '#86705a').cyl(0, 0, 0, 1.45, 1.45, 0.012, 16, { top: true });
    const w = 2.5, d = 1.15, z0 = -0.3;
    b.mat('wood', C.log).blk(0, 0, z0, w, 0.5, d, 1);
    b.mat('roof', C.thatch).gable(0, 0.5, z0, w - 0.1, d, 1.0, { over: 0.25, th: 0.14, overX: 0.18, ends: { mat: 'wood', col: C.wood } });
    // gekreuzte Giebelbalken
    b.mat('wood', C.woodD);
    for (const x of [-(w / 2 + 0.1), w / 2 + 0.1]) {
      b.beam([x, 1.2, z0 - 0.4], [x, 1.75, z0 + 0.2], 0.05); b.beam([x, 1.2, z0 + 0.4], [x, 1.75, z0 - 0.2], 0.05);
    }
    b.push().tr(0, 0, z0).side(0); b.door(0, 0, d / 2, 0.3, 0.42, { col: '#3b2a1e', frameMat: 'wood', frame: C.woodD, step: false }); b.pop();
    // Feuerstelle vorn
    M.campfire(b, 0, 0.75, true);
    sitLog(b, -0.6, 0.85, 0.5, 0.45); sitLog(b, 0.6, 0.9, -0.4, 0.45);
    // Totempfahl in Reichsfarbe
    const tx = 1.15, tz = 0.95;
    b.mat('wood', C.wood).cyl(tx, 0, tz, 0.08, 0.07, 1.3, 7);
    b.mat('cloth', P.T.main).cyl(tx, 0.55, tz, 0.085, 0.085, 0.18, 7).cyl(tx, 0.95, tz, 0.08, 0.08, 0.12, 7);
    b.mat('wood', C.woodD).box(tx - 0.25, 1.05, tz - 0.03, tx + 0.25, 1.11, tz + 0.03, 0);
    b.mat('cloth', P.T.dark).cone(tx, 1.3, tz, 0.09, 0.15, 6);
    b.flag(-1.25, 0, 0.9, 1.5, 0.38, 0.26, P.T.main, { r: 0.03 });
    logPile(b, -1.3, -0.9, 0.2, 7, 0.5);
  };

  // ---------------------------------------------------------------------------
  // HÄUSER (2×2) – Familien rustic, timber, town, block × Stufe 1..3 × Form (variant)
  // ---------------------------------------------------------------------------
  const FAM = M.FAM = { tribe: 'rustic', anarchy: 'rustic', monarchy: 'timber', theocracy: 'timber', democracy: 'town', republic: 'town', fascism: 'block', communism: 'block' };
  M.houseShapes = 6;
  const HOUSE = M.HOUSE = {};

  // Fachwerkhaus: Steinsockel, Fachwerk darüber, steiles Dach in Reichsfarbe
  HOUSE.timber = function (b, P) {
    const lv = P.level, sh = P.v % 6, theo = P.style === 'theocracy';
    const r = (k) => rnd(P, k);
    plinth(b, 1.7, 1.7, C.stoneD, 0.05);
    const n = lv, st = 0.55;
    let w = 1.25 + (sh === 4 ? 0.2 : 0) - (lv === 3 ? 0.05 : 0), d = 0.95;
    if (sh === 1) { w = 1.0; d = 1.2; }
    const cx = sh === 2 ? -0.15 : 0, cz = -0.1;
    const roofC = theo ? K.mix(K.tame(P.T.main, 0.3), '#7a5a4a', 0.25) : K.mix(K.tame(P.T.main, 0.35), C.tile, 0.35);
    const plast = K.mix(C.plaster, PASTEL[(P.v >> 3) % PASTEL.length], 0.25);
    // Erdgeschoss Stein, darüber Putz mit Fachwerk
    b.mat('stone', C.stone).blk(cx, 0.05, cz, w, st, d, 1);
    let y = 0.05 + st, jet = 0;
    for (let f = 1; f < n; f++) {
      jet = (sh === 5 || sh === 3) ? 0.06 : 0;
      b.mat('plaster', plast).blk(cx, y, cz, w + jet * 2, st, d + jet * 2, 0);
      y += st;
    }
    if (n === 1) { b.mat('plaster', plast).blk(cx, y, cz, w, 0.2, d, 1); y += 0.2; }
    const tw = w + jet * 2, td = d + jet * 2;
    if (n > 1) timberFrame(b, cx, cz, tw, td, 0.05 + st, st, n - 1, C.beam);
    else timberFrame(b, cx, cz, w, d, 0.05 + st, 0.2, 1, C.beam);
    facade(b, cx, cz, w, d, 0.05, st, { n: 1, win: { w: 0.15, h: 0.2, cross: true, shutters: K.tame(P.T.dark, 0.3), frameMat: 'wood', frame: C.beam }, door: 0, doorW: 0.2, doorH: 0.36, spacing: 0.42 });
    if (n > 1) facade(b, cx, cz, tw, td, 0.05 + st, st, { n: n - 1, win: { w: 0.14, h: 0.22, cross: true, frameMat: 'wood', frame: C.beam }, door: -1, spacing: 0.32 });
    const rh = (sh === 1 ? 0.55 : 0.7) + lv * 0.05;
    if (sh === 3) b.mat('roof', roofC).hip(cx, y, cz, tw, td, rh * 0.85, { over: 0.1, ridge: 0.6 });
    else if (sh === 1) { b.mat('roof', roofC); b.push().tr(cx, 0, cz).rotY(PI / 2).gable(0, y, 0, td, tw, rh, { over: 0.12, ends: { col: plast } }).pop(); }
    else b.mat('roof', roofC).gable(cx, y, cz, tw, td, rh, { over: 0.12, ends: { col: plast } });
    // Giebelfachwerk
    if (sh !== 3) {
      b.mat('wood', C.beam);
      const ex = sh === 1 ? 0 : tw / 2 + 0.012;
      if (sh !== 1) for (const sx of [-1, 1]) { b.push().tr(cx + sx * ex, y, cz); b.box(-0.015, 0, -0.015, 0.015, rh * 0.85, 0.015, 1); b.pop(); }
    }
    // Formen: Anbau, Gaube, Erker
    if (sh === 2) {
      b.mat('wood', C.woodL).blk(cx + w / 2 + 0.25, 0.05, cz + 0.05, 0.5, 0.42, 0.7, 1);
      b.mat('roof', roofC).push().tr(cx + w / 2 + 0.25, 0.47, cz + 0.05).rotX(0).pop();
      b.push().tr(cx + w / 2 + 0.25, 0.47, cz + 0.05).rotZ(-0.35).mat('roof', roofC).box(-0.32, 0, -0.42, 0.3, 0.04, 0.42, 0).pop();
    }
    if (sh === 5 && lv >= 2) {
      b.mat('roof', roofC).push().tr(cx, y, cz + td / 2 - 0.1).rotY(PI / 2).gable(0, 0, 0, 0.35, 0.3, 0.22, { over: 0.04, ends: { col: plast } }).pop();
      b.window(cx, y + 0.02, cz + td / 2 + 0.07, 0.11, 0.14, { cross: true, frameMat: 'wood', frame: C.beam });
    }
    if (sh === 4) { b.mat('plaster', plast).blk(cx + 0.35, 0.05 + st, cz + d / 2 + 0.12, 0.35, st * 0.9, 0.24, 1); b.window(cx + 0.35, 0.05 + st * 1.3, cz + d / 2 + 0.24, 0.16, 0.2, { cross: true }); b.mat('roof', roofC).hip(cx + 0.35, 0.05 + st * 1.9, cz + d / 2 + 0.12, 0.4, 0.28, 0.15, { over: 0.03 }); }
    if (sh !== 1 && sh !== 3) chimney(b, cx + (r(3) < 0.5 ? -1 : 1) * tw * 0.28, cz - 0.15, y + rh * 0.3, rh * 0.75, C.brick);
    else chimney(b, cx + 0.2, cz - 0.2, y + rh * 0.35, rh * 0.75, C.brick);
    b.stack(cx + 0.2, y + rh, cz);
    // Theokratie: Türmchen
    if (theo && (P.v & 2)) {
      const tx = cx - tw / 2 + 0.05, tz = cz + td / 2 - 0.05;
      b.mat('plaster', plast).cyl(tx, 0.05, tz, 0.16, 0.16, y + 0.35, 8);
      b.mat('roof', roofC).cone(tx, y + 0.4, tz, 0.2, 0.55, 8);
      b.mat('metal', C.gold).ball(tx, y + 0.97, tz, 0.035, 5);
      b.window(tx, y - 0.05, tz + 0.16, 0.08, 0.14, { cross: true });
    }
    // Garten/Zaun
    if (lv < 3) { b.mat('wood', C.woodL); for (let i = 0; i < 5; i++) b.blk(-0.85 + i * 0.12, 0, 0.82, 0.03, 0.18, 0.03, 1); b.box(-0.86, 0.1, 0.81, -0.35, 0.13, 0.83, 0); }
  };

  // Bürgerhaus: Putzfarben, Giebel zur Straße, Mansarde, Erker
  HOUSE.town = function (b, P) {
    const lv = P.level, sh = P.v % 6, rep = P.style === 'republic';
    plinth(b, 1.7, 1.7, C.stoneD, 0.05);
    const n = lv + (lv === 3 ? 1 : 0), st = 0.5;
    let w = rep ? 0.9 : 1.15, d = rep ? 1.25 : 1.0;
    if (sh === 4) w += 0.25;
    const col = rep ? K.mix(C.brick, ['#9c4a35', '#7a4a3a', '#a86a4a', '#8a3e30', '#6e4a3c', '#b0583e'][(P.v >> 2) % 6], 0.6) : PASTEL[(P.v >> 2) % PASTEL.length];
    const roofC = rep ? K.mix('#5a3a2e', K.tame(P.T.main, 0.4), 0.35) : K.mix(K.tame(P.T.main, 0.3), C.slate, sh === 3 ? 0.5 : 0.25);
    const cz = -0.05, cx = sh === 5 ? 0.12 : 0;
    const matW = rep ? 'stone' : 'plaster';
    b.mat(matW, col).blk(cx, 0.05, cz, w, n * st, d, 1);
    // Gesims
    b.mat('stone', C.white);
    for (let f = 1; f <= n; f++) b.blk(cx, 0.05 + f * st - 0.025, cz, w + 0.04, 0.03, d + 0.04, 0);
    b.mat('stone', C.stoneL).blk(cx, 0.05, cz, w + 0.03, 0.12, d + 0.03, 1);
    const y = 0.05 + n * st;
    facade(b, cx, cz, w, d, 0.05, st, { n: n, win: { w: 0.14, h: 0.24, cross: true, frameMat: 'stone', frame: '#f4f0e6', shutters: (!rep && (P.v & 4)) ? K.tame(P.T.main, 0.4) : null }, door: 0, doorW: 0.2, doorH: 0.36, spacing: 0.3, doorO: { col: K.mix('#4a3a2a', P.T.dark, 0.4) } });
    const rh = 0.55 + lv * 0.04;
    if (rep || sh === 0 || sh === 2) {
      // Giebel zur Straße (First entlang z); Republik: geschwungener/abgetreppter Giebel
      if (rep && (P.v & 1)) {
        const hw = w / 2;
        const prof = [[-hw, 0], [hw, 0], [hw, 0.15], [hw * 0.6, 0.2], [hw * 0.6, 0.4], [hw * 0.3, 0.45], [hw * 0.3, rh], [-hw * 0.3, rh], [-hw * 0.3, 0.45], [-hw * 0.6, 0.4], [-hw * 0.6, 0.2], [-hw, 0.15]];
        b.mat(matW, col).push().tr(cx, y, 0).extrudeZ(prof, cz + d / 2 - 0.08, cz + d / 2).pop();
        b.mat('stone', C.white).push().tr(cx, y, 0).blk(0, rh, cz + d / 2 - 0.04, w * 0.66, 0.04, 0.1, 0).pop();
      }
      b.mat('roof', roofC).push().tr(cx, 0, cz).rotY(PI / 2).gable(0, y, 0, d, w, rh, { over: rep ? 0.03 : 0.1, ends: { mat: matW, col: col } }).pop();
      b.window(cx, y + 0.12, cz + d / 2 + (rep ? 0 : 0), 0.12, 0.18, { cross: true, frameMat: 'stone', frame: '#f4f0e6' });
    } else if (sh === 3) {
      // Mansarddach
      b.mat('roof', roofC);
      b.push().tr(cx, y, cz);
      b.extrudeX([[-d / 2 - 0.04, 0], [d / 2 + 0.04, 0], [d / 2 - 0.08, 0.35], [-d / 2 + 0.08, 0.35]], -w / 2 - 0.04, w / 2 + 0.04);
      b.pop();
      b.hip(cx, y + 0.35, cz, w - 0.08, d - 0.16, 0.2, { over: 0.0 });
      for (const u of [-w * 0.25, w * 0.25]) { b.mat('plaster', C.white).blk(cx + u, y + 0.08, cz + d / 2 - 0.06, 0.16, 0.22, 0.12, 1); b.window(cx + u, y + 0.1, cz + d / 2, 0.1, 0.16, { cross: true }); }
    } else {
      b.mat('roof', roofC).gable(cx, y, cz, w, d, rh * 0.85, { over: 0.1, ends: { mat: matW, col: col } });
    }
    // Erker (Form 4) bzw. Eckturm (Form 5)
    if (sh === 4 && n >= 2) {
      b.mat(matW, col).blk(cx + w * 0.25, 0.05 + st, cz + d / 2 + 0.1, 0.36, st * (n - 1), 0.2, 1);
      b.mat('roof', roofC).hip(cx + w * 0.25, 0.05 + st * n, cz + d / 2 + 0.1, 0.4, 0.24, 0.12, { over: 0.02 });
      for (let f = 1; f < n; f++) b.window(cx + w * 0.25, 0.05 + f * st + 0.14, cz + d / 2 + 0.2, 0.18, 0.24, { cross: true, frame: '#f4f0e6' });
    }
    if (sh === 5) {
      const tx = cx - w / 2, tz = cz + d / 2;
      b.mat(matW, K.mix(col, '#ffffff', 0.15)).cyl(tx, 0.05, tz, 0.2, 0.2, y + 0.15, 10);
      b.mat('roof', roofC).cone(tx, y + 0.2, tz, 0.25, 0.5, 10);
      b.window(tx, y - 0.35, tz + 0.2, 0.1, 0.2, { cross: true });
    }
    if (sh === 1) { b.mat('wood', C.woodD).blk(cx, 0.05 + st, cz + d / 2 + 0.12, w * 0.6, 0.03, 0.22, 0); b.mat('metal', C.iron).box(cx - w * 0.3, 0.05 + st, cz + d / 2 + 0.22, cx + w * 0.3, 0.05 + st + 0.18, cz + d / 2 + 0.23, 0); }
    chimney(b, cx + w * 0.3, cz - d * 0.25, y + 0.1, rh * 0.85, rep ? C.brickD : C.brick);
    b.stack(cx + w * 0.3, y + rh, cz - d * 0.25);
    if (!rep && lv === 1) { b.mat('plaster', C.grass).ball(-0.7, 0.1, 0.7, 0.14, 6).ball(0.72, 0.08, 0.68, 0.11, 6); }
  };

  // Block: einheitliche graue Blöcke (Faschismus) bzw. Plattenbau mit Fugen (Kommunismus)
  HOUSE.block = function (b, P) {
    const lv = P.level, sh = P.v % 6, com = P.style === 'communism';
    plinth(b, 1.75, 1.75, C.concD, 0.05);
    const n = lv + 1, st = 0.45;
    let w = com ? 1.45 : 1.25, d = com ? 0.95 : 1.1;
    if (sh === 2 || sh === 5) { const t = w; w = d; d = t; }
    if (sh === 3) w *= 0.8;
    const col = com ? K.mix('#c5c0b2', '#b9b7ae', (P.v >> 3 & 1) * 0.5) : K.mix(C.conc, C.concD, ((P.v >> 3) & 3) / 6);
    b.mat('plaster', col).blk(0, 0.05, -0.05, w, n * st, d, 1);
    const y = 0.05 + n * st;
    b.mat('plaster', K.mul(col, 0.9)).parapet(0, y, -0.05, w + 0.02, d + 0.02, 0.07, 0.05);
    b.mat('plaster', K.mul(col, 0.85)).blk(0, y, -0.05, w - 0.04, 0.012, d - 0.04, 1);
    if (com) {
      // Plattenfugen
      b.mat('plaster', K.mul(col, 0.78));
      for (let k = 0; k < 4; k++) {
        const len = (k & 1) ? d : w, dep = ((k & 1) ? w : d) / 2 + 0.004;
        b.push().tr(0, 0, -0.05).side(k);
        for (let f = 1; f < n; f++) b.box(-len / 2, 0.05 + f * st - 0.008, dep - 0.01, len / 2, 0.05 + f * st + 0.008, dep, 8);
        const np = Math.max(2, Math.round(len / 0.36));
        for (let i = 1; i < np; i++) { const u = -len / 2 + i * len / np; b.box(u - 0.007, 0.05, dep - 0.01, u + 0.007, y, dep, 8 | 1); }
        b.pop();
      }
    }
    facade(b, 0, -0.05, w, d, 0.05, st, { n: n, win: { w: com ? 0.2 : 0.12, h: com ? 0.18 : 0.24, frameMat: 'plaster', frame: com ? '#e8e4d8' : '#8a8c8c', glass: com ? '#34424c' : '#252b30' }, door: 0, doorW: 0.22, doorH: 0.34, spacing: com ? 0.36 : 0.26, doorO: { col: com ? '#6a5a48' : '#2c2e30', frameMat: 'plaster', frame: K.mul(col, 0.85) } });
    // Treppenhaus-Aufsatz, Balkone, Vordach
    if (sh === 1 || sh === 4) { b.mat('plaster', K.mul(col, 0.92)).blk(w * 0.25, y, -0.15, 0.32, 0.25, 0.3, 1); b.mat('metal', C.iron).cyl(-w * 0.25, y, -0.2, 0.012, 0.012, 0.35, 4); }
    if (com && (sh === 0 || sh === 3)) {
      b.mat('plaster', K.mul(col, 0.95));
      for (let f = 1; f < n; f++) for (const u of [-w * 0.25, w * 0.25]) b.box(u - 0.16, 0.05 + f * st, d / 2 - 0.05, u + 0.16, 0.05 + f * st + 0.035, d / 2 + 0.13, 0);
      b.mat('metal', '#6d7276');
      for (let f = 1; f < n; f++) for (const u of [-w * 0.25, w * 0.25]) b.box(u - 0.16, 0.085 + f * st, d / 2 + 0.11, u + 0.16, 0.2 + f * st, d / 2 + 0.13, 1);
    }
    b.mat('plaster', K.mul(col, 0.8)).box(-0.18, 0.42, d / 2 - 0.05, 0.18, 0.45, d / 2 + 0.15, 0);
    if (!com && (P.v & 4)) {
      // schmales Tuch in Reichsfarbe an der Fassade (abstrakt)
      b.mat('cloth', P.T.main).box(w / 2 - 0.2, y - 0.6, d / 2 - 0.04, w / 2 - 0.08, y - 0.08, d / 2 - 0.035 + 0.012, 8);
    }
    if (com && (P.v & 4)) b.mat('cloth', K.tame(P.T.main, 0.2)).box(-w / 2 + 0.1, y - 0.12, d / 2 - 0.04, w / 2 - 0.1, y - 0.04, d / 2 - 0.04 + 0.012, 8);
    // Lüftungsrohr / Antenne
    b.mat('metal', C.steel).cyl(-w * 0.3, y, -0.25, 0.03, 0.03, 0.15, 6);
    b.stack(-w * 0.3, y + 0.15, -0.25);
    if (sh === 5) b.mat('metal', C.steel).cyl(w * 0.2, y, 0.0, 0.01, 0.006, 0.4, 4).box(w * 0.2 - 0.12, y + 0.3, -0.005, w * 0.2 + 0.12, y + 0.31, 0.005, 0);
  };

  // Hütten: Stamm (Strohhütten rund/eckig), Anarchie (Flickenhütten, Bauwagen)
  HOUSE.rustic = function (b, P) {
    const lv = P.level, an = P.style === 'anarchy', sh = P.v % 6;
    const r = (k) => rnd(P, k);
    if (!an) {
      b.mat('plaster', '#86705a').cyl(0, 0, 0, 0.85, 0.85, 0.01, 12, { top: true });
      if (sh % 3 === 0) {
        // Rundhütte
        const R = 0.48 + lv * 0.06, wh = 0.42 + lv * 0.06;
        b.mat('plaster', '#b39a78').cyl(0, 0, -0.05, R, R * 0.97, wh, 12);
        b.mat('roof', C.thatch).cone(0, wh - 0.06, -0.05, R + 0.16, 0.6 + lv * 0.12, 12);
        b.mat('roof', C.thatchD).cyl(0, wh - 0.1, -0.05, R + 0.17, R + 0.15, 0.06, 12, { top: false });
        if (lv >= 2) { b.mat('wood', C.woodD).cyl(0, wh + 0.5 + lv * 0.12, -0.05, 0.03, 0.02, 0.18, 4); }
        b.push().tr(0, 0, -0.05).door(0, 0, R - 0.02, 0.2, 0.32, { col: '#3b2a1e', frameMat: 'wood', frame: C.woodD, step: false }).pop();
        if (lv === 3) { b.mat('plaster', '#b39a78').cyl(0.55, 0, -0.35, 0.28, 0.27, 0.35, 10); b.mat('roof', C.thatch).cone(0.55, 0.3, -0.35, 0.36, 0.42, 10); }
      } else if (sh % 3 === 1) {
        // Spitzhütte (hoch, Stangen oben heraus)
        const R = 0.42 + lv * 0.05;
        b.mat('wood', C.wood).cyl(0, 0, 0, R, R, 0.25, 10);
        b.mat('roof', C.reed).cone(0, 0.2, 0, R + 0.12, 0.95 + lv * 0.15, 10);
        b.mat('wood', C.woodD);
        for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.4; b.beam([Math.cos(a) * 0.02, 1.05 + lv * 0.13, Math.sin(a) * 0.02], [Math.cos(a) * 0.12, 1.35 + lv * 0.15, Math.sin(a) * 0.12], 0.025); }
        b.door(0, 0, R, 0.18, 0.3, { col: '#3b2a1e', frameMat: 'wood', frame: C.woodD, step: false });
      } else {
        // eckige Hütte mit Walmdach aus Stroh
        const w = 0.85 + lv * 0.12, d = 0.7 + lv * 0.08, wh = 0.4 + lv * 0.08;
        b.mat('wood', C.log).blk(0, 0, -0.05, w, wh, d, 1);
        b.mat('roof', C.thatch).hip(0, wh, -0.05, w, d, 0.55 + lv * 0.06, { over: 0.16, th: 0.1, ridge: 0.5 });
        b.push().tr(0, 0, -0.05).side(0).door(0, 0, d / 2, 0.2, 0.32, { col: '#3b2a1e', frameMat: 'wood', frame: C.woodD, step: false }).window(0.28, 0.18, d / 2, 0.1, 0.1, { frameMat: 'wood', frame: C.woodD }).pop();
      }
      // Hörner/Schädelstange, Feuerholz, Topf
      if (lv >= 2 && (P.v & 8)) { b.mat('wood', C.woodD).cyl(0.62, 0, 0.5, 0.025, 0.02, 0.6, 5); b.mat('cloth', P.T.main).box(0.6, 0.45, 0.48, 0.8, 0.58, 0.49, 0); }
      logPile(b, -0.62, 0.55, 0.6, 4, 0.35);
      if (P.v & 16) { b.mat('plaster', '#7c5a3c').cyl(0.6, 0, 0.6, 0.08, 0.1, 0.12, 7); }
      return;
    }
    // Anarchie
    const pc = (k) => BRIGHT[(Math.floor(r(k) * 8) + k) % 8];
    if (sh % 3 === 1) {
      // Bauwagen
      const len = 1.1 + lv * 0.1;
      b.push().tr(0, 0, -0.05).rotY((P.v & 32) ? 0.15 : -0.1);
      b.mat('metal', C.iron);
      for (const x of [-len * 0.32, len * 0.32]) for (const z of [-0.3, 0.3]) b.cylZ(z - 0.03, z + 0.03, x, 0.13, 0.13, 10);
      b.mat('wood', K.tame(pc(1), 0.2)).blk(0, 0.2, 0, len, 0.55, 0.62, 1);
      b.mat('metal', '#8d949a');
      b.push().tr(0, 0.75, 0).extrudeX([[-0.36, 0], [0.36, 0], [0.3, 0.1], [0, 0.15], [-0.3, 0.1]], -len / 2 - 0.04, len / 2 + 0.04).pop();
      b.window(-len * 0.2, 0.42, 0.31, 0.16, 0.16, { frameMat: 'wood', frame: K.tame(pc(2), 0.2) });
      b.window(len * 0.25, 0.42, 0.31, 0.16, 0.16, { frameMat: 'wood', frame: K.tame(pc(3), 0.2) });
      b.mat('wood', K.tame(pc(4), 0.2)).box(-len * 0.1, 0.25, 0.31, len * 0.1, 0.45, 0.325, 8);
      b.mat('wood', C.woodD).box(len / 2, 0.15, -0.04, len / 2 + 0.35, 0.18, 0.04, 0);
      b.mat('metal', C.steel).cyl(-len * 0.3, 0.9, -0.1, 0.025, 0.025, 0.2, 5);
      b.pop();
      b.stack(-len * 0.3, 1.1, -0.15);
      if (lv >= 2) { b.mat('cloth', pc(5)).box(-0.6, 0, 0.45, -0.1, 0.02, 0.8, 1); b.mat('cloth', pc(6)).push().tr(0.5, 0.6, 0.6).rotX(0.3).box(-0.3, 0, -0.25, 0.3, 0.012, 0.25, 0).pop(); b.mat('wood', C.woodD).cyl(0.75, 0, 0.8, 0.015, 0.015, 0.62, 4); }
      if (lv === 3) { b.mat('wood', K.tame(pc(7), 0.2)).blk(0.0, 0.0, -0.65, 0.7, 0.45, 0.35, 1); b.mat('metal', C.rust).push().tr(0, 0.45, -0.65).rotX(-0.15).box(-0.4, 0, -0.22, 0.4, 0.025, 0.22, 0).pop(); }
      return;
    }
    // Flickenhütte: gestapelte Kisten aus Brettern unterschiedlicher Farbe
    const w = 0.85 + lv * 0.12, d = 0.75, wh = 0.42 + lv * 0.08;
    b.mat('wood', K.tame(pc(1), 0.25)).blk(0, 0.0, -0.05, w, wh, d, 1);
    for (let j = 0; j < 4; j++) {
      b.push().tr(0, 0, -0.05).side(j);
      const len = (j & 1) ? d : w, dep = ((j & 1) ? w : d) / 2;
      for (let q = 0; q < 2; q++) {
        const u = (r(j * 5 + q) - 0.5) * (len - 0.25), y = 0.05 + r(j * 9 + q) * (wh - 0.22);
        b.mat(q ? 'metal' : 'wood', K.tame(q ? '#9aa0a4' : pc(j + q + 2), 0.2)).box(u - 0.11, y, dep, u + 0.11, y + 0.18, dep + 0.012, 8);
      }
      if (j === 0) b.door(-w * 0.2, 0, dep, 0.2, 0.32, { col: pc(8), frameMat: 'wood', frame: C.woodD, step: false }).window(w * 0.22, 0.22, dep, 0.13, 0.12, { frameMat: 'wood', frame: pc(9) });
      b.pop();
    }
    if (lv >= 2) {
      b.mat('wood', K.tame(pc(3), 0.25)).blk(sh % 3 === 2 ? 0.15 : -0.12, wh, -0.1, w * 0.62, 0.36, d * 0.75, 1);
      b.window(sh % 3 === 2 ? 0.15 : -0.12, wh + 0.12, -0.1 + d * 0.375, 0.12, 0.12, { frameMat: 'wood', frame: pc(4) });
    }
    const top = wh + (lv >= 2 ? 0.36 : 0);
    b.push().tr(0, top, -0.05).rotX(0.12).rotZ(sh & 1 ? 0.1 : -0.1);
    b.mat('metal', r(77) < 0.5 ? C.rust : '#8d949a').box(-w / 2 - 0.08, 0, -d / 2 - 0.08, w / 2 + 0.08, 0.025, d / 2 + 0.08, 0);
    b.pop();
    if (lv === 3) { b.mat('cloth', pc(6)).push().tr(0, top + 0.06, -0.05).dome(0, 0, 0, 0.25, 0.26, 7, 2).pop(); }
    b.mat('metal', C.steel).cyl(w * 0.3, top, -0.3, 0.025, 0.025, 0.25, 5);
    b.stack(w * 0.3, top + 0.25, -0.3);
    b.mat('plaster', '#5bb36a').ball(0.65, 0.08, 0.6, 0.11, 6); b.mat('plaster', pc(10)).ball(0.65, 0.18, 0.6, 0.05, 5);
  };

  // Zelte (Haus-Stufe 0): a Spitzzelt, b Firstzelt, c Jurte, d Fellkuppel
  M.tent = function (b, P) {
    const k = (P.v | 0) & 3;
    b.mat('plaster', '#86705a').cyl(0, 0, 0, 0.7, 0.7, 0.01, 12, { top: true });
    if (k === 0) {
      b.mat('cloth', '#c9ad84').cone(0, 0, 0, 0.5, 1.05, 9);
      b.mat('cloth', P.T.main).cyl(0, 0.28, 0, 0.375, 0.35, 0.06, 9, { top: false });
      b.mat('wood', C.woodD);
      for (let i = 0; i < 4; i++) { const a = i * PI / 2 + 0.3; b.beam([Math.cos(a) * 0.03, 0.95, Math.sin(a) * 0.03], [Math.cos(a) * 0.12, 1.3, Math.sin(a) * 0.12], 0.02); }
      b.mat('glass', '#3a2a1e').push().tr(0, 0, 0).rotY(0).extrudeZ([[-0.1, 0], [0.1, 0], [0, 0.32]], 0.42, 0.47).pop();
    } else if (k === 1) {
      b.mat('cloth', '#e6dcc2');
      b.push().tr(0, 0, 0).extrudeX([[-0.42, 0], [0.42, 0], [0, 0.62]], -0.5, 0.5, false).pop();
      b.mat('cloth', '#d8ccae').extrudeZ([[-0.42, 0], [0.42, 0], [0, 0.62]], -0.5, -0.48);
      b.mat('cloth', '#d8ccae').extrudeZ([[-0.42, 0], [-0.06, 0], [0, 0.62]], 0.48, 0.5).extrudeZ([[0.06, 0], [0.42, 0], [0, 0.62]], 0.48, 0.5);
      b.mat('glass', '#3a2a1e').extrudeZ([[-0.06, 0], [0.06, 0], [0, 0.5]], 0.47, 0.475);
      b.mat('cloth', P.T.main).box(-0.5, 0.6, -0.03, 0.5, 0.64, 0.03, 0);
      b.mat('wood', C.woodD).cyl(0, 0, 0.52, 0.015, 0.015, 0.7, 4).cyl(0, 0, -0.52, 0.015, 0.015, 0.7, 4);
    } else if (k === 2) {
      b.mat('cloth', '#efe7d6').cyl(0, 0, 0, 0.52, 0.52, 0.38, 12, { top: false });
      b.mat('cloth', '#e2d8c2').cone(0, 0.38, 0, 0.55, 0.32, 12);
      b.mat('cloth', P.T.main).cyl(0, 0.24, 0, 0.53, 0.53, 0.05, 12, { top: false });
      b.mat('wood', C.woodD).cyl(0, 0.68, 0, 0.06, 0.05, 0.05, 6);
      b.door(0, 0, 0.51, 0.18, 0.28, { col: '#a0522d', frameMat: 'wood', frame: C.woodD, step: false });
    } else {
      b.mat('cloth', '#9a7a56').push().scale(1, 0.9, 1.15).dome(0, 0, 0, 0.5, 0.55, 9, 4).pop();
      b.mat('cloth', '#7d6044').box(-0.25, 0.25, -0.2, 0.15, 0.45, 0.3, 0);
      b.mat('wood', C.woodD).beam([-0.4, 0, 0.3], [0.1, 0.58, 0], 0.03).beam([0.4, 0, 0.3], [-0.1, 0.58, 0], 0.03);
      b.mat('glass', '#2e2018').box(-0.1, 0, 0.5, 0.1, 0.25, 0.56, 1 | 8);
      b.mat('cloth', P.T.main).box(-0.2, 0.42, 0.42, 0.2, 0.46, 0.5, 0);
    }
    if (P.v & 4) { sack(b, -0.55, 0.45, 0.09); }
    if (P.v & 8) { b.mat('wood', C.log).push().tr(0.55, 0.06, 0.45).rotY(0.5).cylX(-0.2, 0.2, 0, 0, 0.06, 6).pop(); }
  };

  M.house = function (b, P) {
    if ((P.level | 0) <= 0) return M.tent(b, P);
    const fam = FAM[P.style] || 'timber';
    HOUSE[fam](b, P);
  };

  // ---------------------------------------------------------------------------
  // Felder (1×1): growth 0 Furchen, 1 Keimlinge, 2 grüne Halme, 3 goldenes Korn
  // ---------------------------------------------------------------------------
  M.field = function (b, P) {
    const g = Math.max(0, Math.min(3, P.growth | 0)), rows = 5;
    const ex = (P.exhaust | 0) ? 0.85 : 1;
    b.mat('plaster', K.mul(g === 0 ? '#6a4c33' : '#5e4630', ex)).box(-0.49, -0.04, -0.49, 0.49, 0.015, 0.49, 1);
    b.mat('wood', K.mul('#6e5038', ex));
    const along = (P.v & 1);
    b.push(); if (along) b.rotY(PI / 2);
    for (let i = 0; i < rows; i++) {
      const z = -0.4 + i * 0.2;
      b.push().tr(0, 0.015, z).extrudeX([[-0.06, 0], [0.06, 0], [0.02, 0.04], [-0.02, 0.04]], -0.47, 0.47).pop();
      if (g === 0) continue;
      const hgt = g === 1 ? 0.06 : (g === 2 ? 0.2 : 0.26);
      const col = g === 1 ? '#7fae4a' : (g === 2 ? '#7aa344' : '#d7b450');
      const col2 = g === 1 ? '#6a9a3c' : (g === 2 ? '#65903a' : '#c39a3a');
      const n = g === 1 ? 7 : 9;
      for (let j = 0; j < n; j++) {
        const x = -0.43 + (j + 0.5) * 0.86 / n + (K.h2(i * 31 + j, P.v) - 0.5) * 0.04;
        const hh = hgt * (0.8 + K.h2(j * 7 + i, P.v + 3) * 0.4);
        b.mat('cloth', j & 1 ? col : col2);
        if (g === 1) { b.cone(x, 0.05, z, 0.035, hh, 4); continue; }
        // Halmbüschel: zwei gekreuzte Karten + Ähren
        b.quad([x - 0.05, 0.05, z - 0.02], [x + 0.05, 0.05, z + 0.02], [x + 0.06, 0.05 + hh, z + 0.03], [x - 0.06, 0.05 + hh, z - 0.03]);
        b.quad([x - 0.02, 0.05, z + 0.05], [x + 0.02, 0.05, z - 0.05], [x + 0.03, 0.05 + hh, z - 0.06], [x - 0.03, 0.05 + hh, z + 0.06]);
        if (g === 3) { b.mat('cloth', '#e8c868'); b.blk(x, 0.05 + hh - 0.06, z, 0.07, 0.08, 0.07, 1); }
      }
    }
    b.pop();
    if (g === 3 && (P.v & 6) === 6) { b.mat('roof', C.hay).cyl(0.3, 0, 0.3, 0.12, 0.05, 0.25, 7); }
  };

  // ---------------------------------------------------------------------------
  // Holzfäller, Steinbruch, Kaserne, Markt
  // ---------------------------------------------------------------------------
  M.lumber = function (b, P) {
    b.mat('plaster', '#7d6649').cyl(0, 0, 0, 0.95, 0.95, 0.01, 12, { top: true });
    const x = -0.3, z = -0.35;
    b.mat('wood', C.log).blk(x, 0, z, 0.95, 0.5, 0.75, 1);
    b.push().tr(x, 0.5, z).rotX(-0.28).mat('roof', '#6e5a45').box(-0.58, 0, -0.5, 0.58, 0.05, 0.48, 0).pop();
    b.mat('wood', C.log).push().tr(x, 0.5, z).extrudeX([[-0.375, 0], [0.375, 0], [-0.375, 0.21]], -0.475, 0.475).pop();
    b.push().tr(x, 0, z).side(0).door(-0.15, 0, 0.375, 0.2, 0.36, { col: '#3b2a1e', frameMat: 'wood', frame: C.woodD, step: false }).window(0.22, 0.2, 0.375, 0.12, 0.12, { frameMat: 'wood', frame: C.woodD, shutters: C.woodD }).pop();
    logPile(b, 0.45, -0.35, PI / 2, 9, 0.6);
    // Hackklotz mit Axt, Sägebock, Spaltholz
    b.mat('wood', C.woodL).cyl(0.35, 0, 0.45, 0.13, 0.13, 0.18, 9);
    b.push().tr(0.35, 0.18, 0.45).rotZ(0.6).mat('wood', C.woodD).box(-0.012, 0, -0.012, 0.012, 0.3, 0.012, 0).mat('metal', C.steel).box(-0.06, 0.24, -0.008, 0.02, 0.3, 0.008, 0).pop();
    b.mat('wood', C.woodD);
    for (const zz of [0.2, 0.55]) { b.beam([-0.55, 0, zz - 0.1], [-0.35, 0.3, zz], 0.025); b.beam([-0.15, 0, zz - 0.1], [-0.35, 0.3, zz], 0.025); }
    b.mat('wood', C.log).push().tr(-0.35, 0.33, 0.37).rotY(PI / 2).cylX(-0.3, 0.3, 0, 0, 0.05, 6).pop();
    b.mat('wood', C.woodL);
    for (let i = 0; i < 6; i++) b.push().tr(0.65 + (i % 3) * 0.08, 0.04 + Math.floor(i / 3) * 0.07, 0.45).rotX(PI / 2).cyl(0, -0.15, 0, 0.035, 0.035, 0.3, 3).pop();
    b.mat('wood', C.woodL).cyl(-0.75, 0, 0.7, 0.1, 0.1, 0.08, 8).cyl(0.75, 0, -0.85, 0.12, 0.12, 0.06, 8);
  };

  M.quarry = function (b, P) {
    // Grube mit Stufen, Blöcke, Ladebaum
    b.mat('stone', '#8f8a80').box(-0.95, -0.02, -0.95, 0.95, 0.02, 0.95, 1);
    b.mat('stone', '#a29c90');
    b.box(-0.8, 0.02, -0.85, 0.5, 0.35, -0.45, 1);
    b.box(-0.8, 0.02, -0.45, 0.1, 0.18, -0.05, 1);
    b.mat('stone', '#bab3a6');
    b.box(-0.8, 0.35, -0.9, 0.55, 0.55, -0.7, 1);
    for (let i = 0; i < 5; i++) {
      const xx = 0.25 + (i % 3) * 0.22, zz = 0.25 + Math.floor(i / 3) * 0.25;
      b.push().tr(xx, 0.02, zz).rotY(i * 0.4).mat('stone', i & 1 ? '#c2bbad' : '#aea798').blk(0, 0, 0, 0.18, 0.14, 0.13, 1).pop();
    }
    b.push().tr(0.36, 0.16, 0.25).mat('stone', '#b8b1a3').blk(0, 0, 0, 0.17, 0.12, 0.12, 1).pop();
    b.mat('stone', '#9d978c');
    for (let i = 0; i < 9; i++) b.ball(-0.5 + K.h2(i, 5) * 0.6, 0.03, 0.4 + K.h2(i, 9) * 0.4, 0.04 + K.h2(i, 3) * 0.04, 4);
    // Ladebaum
    b.mat('wood', C.woodD);
    b.beam([0.65, 0, -0.55], [0.65, 1.1, -0.55], 0.06);
    b.beam([0.65, 1.0, -0.55], [0.05, 1.15, -0.4], 0.045);
    b.beam([0.65, 0.4, -0.55], [0.3, 0.95, -0.45], 0.03);
    b.mat('metal', C.iron).box(0.06, 0.55, -0.405, 0.07, 1.14, -0.395, 0);
    b.mat('stone', '#c2bbad').blk(0.065, 0.42, -0.4, 0.14, 0.12, 0.12, 0);
    // Werkzeug, Karren
    M.cart(b, -0.3, 0.55, 0.4, '#8a7a62');
  };

  M.cart = function (b, x, z, a, load) {
    b.push().tr(x, 0, z).rotY(a || 0);
    b.mat('wood', C.woodD);
    for (const zz of [-0.17, 0.17]) { b.cylZ(zz - 0.02, zz + 0.02, 0, 0.13, 0.12, 10); }
    b.mat('wood', C.wood).box(-0.25, 0.15, -0.15, 0.25, 0.3, 0.15, 0);
    b.mat('wood', C.woodD).beam([0.25, 0.2, -0.06], [0.6, 0.06, -0.08], 0.025).beam([0.25, 0.2, 0.06], [0.6, 0.06, 0.08], 0.025);
    if (load) { b.mat('plaster', load).push().tr(0, 0.3, 0).scale(1, 0.5, 0.65).dome(0, 0, 0, 0.22, 0.22, 7, 2).pop(); }
    b.pop();
  };

  M.barracks = function (b, P) {
    const s = P.style;
    const wood = s === 'tribe' || s === 'anarchy';
    const conc = s === 'fascism' || s === 'communism';
    const wallM = wood ? 'wood' : (conc ? 'plaster' : 'stone');
    const wallC = wood ? C.log : (conc ? (s === 'fascism' ? C.conc : '#bdb6a6') : (s === 'democracy' ? C.sand : s === 'republic' ? C.brick : s === 'theocracy' ? C.white : C.stone));
    plinth(b, 1.8, 1.8, C.stoneD, 0.04);
    const w = 1.6, d = 0.75, z = -0.45, h = 0.9;
    b.mat(wallM, wallC).blk(0, 0.04, z, w, h, d, 1);
    if (conc) {
      b.mat('plaster', K.mul(wallC, 0.88)).parapet(0, 0.94, z, w + 0.02, d + 0.02, 0.06, 0.04);
      b.mat('plaster', K.mul(wallC, 0.82)).blk(0, 0.94, z, w, 0.01, d, 1);
    } else {
      b.mat('roof', wood ? C.thatch : K.mix(K.tame(P.T.main, 0.4), C.slate, 0.5)).gable(0, 0.94, z, w, d, 0.4, { over: 0.1, ends: { mat: wallM, col: wallC } });
    }
    if (!wood && !conc) {
      b.mat('stone', C.stoneL).push().tr(0, 0, z).merlons(-w / 2, w / 2, 0.94, d / 2 - 0.03, 0.06, 0.0, 0.1, 0.1).pop();
    }
    facade(b, 0, z, w, d, 0.04, 0.45, { n: 2, win: { w: 0.1, h: 0.16, frameMat: wallM, frame: K.mul(wallC, 1.1), glass: '#222a30' }, door: 0, doorW: 0.24, doorH: 0.36, spacing: 0.3, sides: [0, 1, 3] });
    // Exerzierplatz mit Zaun
    b.mat('plaster', '#9a8a6e').box(-0.85, 0, -0.05, 0.85, 0.012, 0.85, 1);
    b.mat('wood', C.woodD);
    for (let i = 0; i <= 8; i++) b.blk(-0.85 + i * 0.2125, 0, 0.85, 0.035, 0.22, 0.035, 1);
    b.box(-0.85, 0.15, 0.84, 0.85, 0.18, 0.86, 0);
    // Strohpuppe, Waffenständer
    b.mat('wood', C.woodD).cyl(-0.4, 0, 0.35, 0.02, 0.02, 0.45, 4).box(-0.55, 0.32, 0.34, -0.25, 0.35, 0.36, 0);
    b.mat('roof', C.hay).cyl(-0.4, 0.22, 0.35, 0.07, 0.06, 0.18, 6).ball(-0.4, 0.45, 0.35, 0.06, 5);
    b.mat('wood', C.woodD).box(0.35, 0.0, 0.25, 0.39, 0.4, 0.29, 0).box(0.75, 0.0, 0.25, 0.79, 0.4, 0.29, 0).box(0.35, 0.36, 0.25, 0.79, 0.39, 0.29, 0);
    b.mat('metal', C.steel);
    for (let i = 0; i < 5; i++) b.beam([0.42 + i * 0.08, 0.02, 0.33], [0.42 + i * 0.08, 0.5, 0.27], 0.015);
    b.flag(0.0, 0.0, 0.55, 1.4, 0.36, 0.24, P.T.main, { poleMat: conc ? 'metal' : 'wood', pole: conc ? C.steel : C.woodD });
    if (conc) { b.mat('cloth', P.T.main).box(-0.6, 0.35, z + d / 2, -0.4, 0.85, z + d / 2 + 0.012, 8).box(0.4, 0.35, z + d / 2, 0.6, 0.85, z + d / 2 + 0.012, 8); }
  };

  M.market = function (b, P) {
    b.mat('stone', '#a49c8c').box(-0.95, -0.03, -0.95, 0.95, 0.03, 0.95, 1);
    const stalls = [[-0.48, -0.45, 0], [0.48, -0.45, 0], [-0.48, 0.42, PI], [0.5, 0.4, PI]];
    const goods = ['#c0392b', '#e6a33a', '#7aa344', '#d9c58a', '#8e5a3c', '#d36a8a'];
    stalls.forEach(function (st, i) {
      b.push().tr(st[0], 0.03, st[1]).rotY(st[2]);
      b.mat('wood', C.woodD);
      for (const x of [-0.3, 0.3]) for (const z of [-0.18, 0.18]) b.cyl(x, 0, z, 0.018, 0.018, z < 0 ? 0.62 : 0.5, 4);
      b.mat('wood', C.woodL).box(-0.32, 0.25, -0.12, 0.32, 0.3, 0.2, 0);
      // Waren
      for (let j = 0; j < 5; j++) { b.mat('plaster', goods[(i * 2 + j) % goods.length]); b.ball(-0.24 + j * 0.12, 0.33, 0.04 + (j & 1) * 0.06, 0.04, 5); }
      // gestreifte Markise
      const n = 6;
      for (let j = 0; j < n; j++) {
        b.mat('cloth', j & 1 ? '#f1ebdd' : P.T.main);
        const x0 = -0.36 + j * 0.72 / n, x1 = x0 + 0.72 / n;
        b.quad([x0, 0.5, 0.24], [x1, 0.5, 0.24], [x1, 0.64, -0.22], [x0, 0.64, -0.22]);
        b.quad([x1, 0.5, 0.24], [x0, 0.5, 0.24], [x0, 0.64, -0.22], [x1, 0.64, -0.22]);
        b.quad([x0, 0.43, 0.25], [x1, 0.43, 0.25], [x1, 0.5, 0.24], [x0, 0.5, 0.24]);
      }
      b.pop();
    });
    crate(b, 0.0, 0.0, 0.18, 0.4, 0.03); barrel(b, 0.15, 0.1, 0.09, 0.03); sack(b, -0.15, 0.05, 0.09);
    crate(b, -0.85, 0.0, 0.16, 0.2, 0.03); barrel(b, 0.85, -0.05, 0.09, 0.03);
  };

  // ---------------------------------------------------------------------------
  // Denkmäler (1×1) je Regierung
  // ---------------------------------------------------------------------------
  const MON = M.MON = {};
  function pedestal(b, w, h, col) { b.mat('stone', col || C.stoneL).blk(0, 0, 0, w + 0.12, 0.08, w + 0.12, 1).blk(0, 0.08, 0, w, h, w, 1).blk(0, 0.08 + h, 0, w + 0.06, 0.05, w + 0.06, 1); return 0.13 + h; }
  function figure(b, y, s, col, o) {
    o = o || {};
    b.mat(o.mat || 'metal', col);
    b.push().tr(0, y, 0).scale(s);
    b.cyl(0, 0, 0, 0.14, 0.1, 0.42, 8);
    b.cyl(0, 0.42, 0, 0.1, 0.12, 0.28, 8);
    b.ball(0, 0.8, 0, 0.085, 7);
    b.beam([0.11, 0.66, 0], [0.2, 0.45, 0.05], 0.06, 5);
    b.beam([-0.11, 0.66, 0], [-0.2, o.armUp ? 0.95 : 0.45, 0.05], 0.06, 5);
    if (o.crown) { b.mat('metal', C.gold).cyl(0, 0.86, 0, 0.07, 0.08, 0.06, 7, { top: false }); }
    b.pop();
  }
  MON.tribe = function (b) {
    b.mat('stone', '#8d8a82').push().rotY(0.3).scale(1, 1, 0.65).cyl(0, 0, 0, 0.2, 0.12, 1.15, 7).pop();
    b.mat('stone', '#8d8a82').ball(0, 1.12, 0, 0.11, 5);
    b.mat('stone', '#76736c').ball(0.25, 0.05, 0.2, 0.08, 4).ball(-0.22, 0.04, 0.25, 0.06, 4);
    b.mat('cloth', '#b33a2a').cyl(0, 0.55, 0, 0.17, 0.165, 0.05, 7, { top: false });
  };
  MON.monarchy = function (b, P) { const y = pedestal(b, 0.4, 0.45); figure(b, y, 0.95, '#8e9aa0', { crown: true }); b.mat('cloth', P.T.main).push().tr(0, y + 0.3, -0.08).box(-0.14, -0.28, 0, 0.14, 0.32, 0.03, 0).pop(); };
  MON.democracy = function (b, P) {
    b.mat('stone', C.sandL).blk(0, 0, 0, 0.8, 0.1, 0.8, 1);
    b.mat('wood', C.wood).push().tr(0, 0.1, -0.1).extrudeZ([[-0.18, 0], [0.18, 0], [0.22, 0.5], [-0.22, 0.5]], -0.15, 0.15).pop();
    b.mat('wood', C.woodD).push().tr(0, 0.6, -0.1).rotX(-0.25).box(-0.24, 0, -0.17, 0.24, 0.03, 0.17, 0).pop();
    b.mat('cloth', P.T.main).box(-0.17, 0.2, 0.05, 0.17, 0.48, 0.055, 0);
    b.mat('plaster', '#f3efe6').blk(0.22, 0.1, 0.22, 0.2, 0.2, 0.2, 1);
    b.mat('glass', C.dark).box(0.17, 0.3, 0.2, 0.27, 0.302, 0.24, 1);
    b.flag(-0.32, 0.1, 0.25, 0.9, 0.25, 0.16, P.T.main, { poleMat: 'metal', pole: C.steel });
  };
  MON.fascism = function (b, P) {
    b.mat('plaster', C.concD).blk(0, 0, 0, 0.6, 0.25, 0.6, 1);
    b.mat('plaster', C.conc).cyl(0, 0.25, 0, 0.14, 0.09, 1.6, 6);
    b.mat('plaster', C.concL).blk(0, 1.85, 0, 0.36, 0.08, 0.36, 1);
    b.mat('metal', C.iron);
    for (let i = 0; i < 4; i++) { b.push().tr(0, 1.68, 0).rotY(i * PI / 2 + PI / 4).rotX(-0.25); b.cyl(0, 0, 0.12, 0.03, 0.09, 0.18, 7, { top: true }); b.pop(); }
    for (let i = 0; i < 3; i++) { b.push().tr(0, 1.3, 0).rotY(i * PI * 2 / 3).rotX(-1.35); b.cyl(0, 0.09, 0, 0.025, 0.07, 0.14, 7); b.pop(); }
    b.mat('cloth', P.T.main).box(-0.1, 0.45, 0.13, 0.1, 1.15, 0.145, 8);
    b.mat('cloth', P.T.dark).box(-0.03, 0.47, 0.145, 0.03, 1.13, 0.15, 8);
    b.mat('metal', C.steel).cyl(0, 1.93, 0, 0.012, 0.008, 0.45, 4);
  };
  MON.communism = function (b, P) {
    const y = pedestal(b, 0.5, 0.35, '#c5c0b2');
    b.mat('plaster', '#c9a1c6').push().tr(0, y, 0).scale(1, 1.15, 1).dome(0, 0.2, 0, 0.3, 0.32, 10, 4, { full: true }).pop();
    b.mat('plaster', '#d8c6dc').push().tr(0, y, 0).cone(0, -0.0, 0, 0.12, 0.12, 6).pop();
    b.mat('plaster', '#7aa344');
    for (let i = 0; i < 5; i++) { b.push().tr(0, y + 0.55, 0).rotY(i * PI * 2 / 5).rotZ(0.4); b.box(-0.03, 0, -0.01, 0.03, 0.42, 0.01, 0); b.pop(); }
    b.mat('cloth', P.T.main).box(-0.2, 0.2, 0.31, 0.2, 0.33, 0.32, 0);
  };
  MON.theocracy = function (b, P) {
    b.mat('stone', C.white).blk(0, 0, 0, 0.75, 0.1, 0.75, 1);
    b.mat('stone', C.marble);
    for (const x of [-0.25, 0.25]) for (const z of [-0.25, 0.25]) b.cyl(x, 0.1, z, 0.05, 0.045, 0.6, 8);
    b.blk(0, 0.7, 0, 0.66, 0.06, 0.66, 1);
    b.mat('metal', C.gold).dome(0, 0.76, 0, 0.3, 0.28, 10, 4).cone(0, 1.02, 0, 0.03, 0.22, 5);
    b.mat('stone', C.white).blk(0, 0.1, 0, 0.22, 0.24, 0.22, 1);
    b.mat('metal', C.gold).ball(0, 0.42, 0, 0.08, 7);
    b.mat('glow', '#ffe9a0').ball(0, 0.42, 0, 0.12, 6);
    b.mat('cloth', P.T.main).box(-0.11, 0.12, 0.111, 0.11, 0.3, 0.115, 0);
  };
  MON.republic = function (b, P) {
    const y = pedestal(b, 0.4, 0.3);
    b.mat('metal', C.gold);
    b.cyl(0, y, 0, 0.12, 0.08, 0.05, 8);
    b.cyl(0, y + 0.05, 0, 0.025, 0.02, 0.6, 6);
    b.push().tr(0, y + 0.62, 0).rotZ(0.15);
    b.box(-0.32, -0.015, -0.015, 0.32, 0.015, 0.015, 0);
    for (const sx of [-1, 1]) {
      b.beam([sx * 0.3, 0, 0], [sx * 0.3 - 0.08, -0.25, 0], 0.008).beam([sx * 0.3, 0, 0], [sx * 0.3 + 0.08, -0.25, 0], 0.008);
      b.push().tr(sx * 0.3, -0.28, 0).dome(0, 0, 0, 0.11, -0.05, 9, 2).pop();
    }
    b.pop();
    b.mat('metal', C.gold).ball(0, y + 0.68, 0, 0.04, 5);
    b.mat('cloth', P.T.main).box(-0.21, 0.15, 0.211, 0.21, 0.38, 0.215, 0);
  };
  MON.anarchy = function (b) {
    b.mat('plaster', '#d8d2c4').box(-0.45, 0, -0.08, 0.45, 0.85, 0.08, 1);
    b.mat('plaster', '#fff');
    const cols = ['#e05a4a', '#f0a43a', '#f2d24b', '#5bb36a', '#3e9bd6', '#8a5ac9', '#e46fa5'];
    for (let i = 0; i < 12; i++) {
      const x = -0.4 + K.h2(i, 3) * 0.7, y = 0.05 + K.h2(i, 7) * 0.62, w = 0.08 + K.h2(i, 11) * 0.15, h = 0.06 + K.h2(i, 13) * 0.16;
      b.c(cols[i % cols.length]);
      b.box(x, y, 0.08, Math.min(0.45, x + w), Math.min(0.85, y + h), 0.088, 1 | 2 | 8);
      b.box(x, y, -0.088, Math.min(0.45, x + w), Math.min(0.85, y + h), -0.08, 1 | 2 | 4);
    }
    b.mat('wood', C.woodD).box(-0.5, 0, -0.15, -0.44, 0.9, 0.15, 1).box(0.44, 0, -0.15, 0.5, 0.9, 0.15, 1);
    b.mat('metal', C.steel).cyl(0.3, 0, 0.25, 0.04, 0.04, 0.16, 6).cyl(0.4, 0, 0.3, 0.035, 0.035, 0.12, 6);
  };
  M.monument = function (b, P) { b.mat('stone', C.stoneD).box(-0.45, -0.6, -0.45, 0.45, 0.02, 0.45, 1); (MON[P.style] || MON.tribe)(b, P); };

  // ---------------------------------------------------------------------------
  // Fabriken: kind × level × filtered; Ruine bei closed
  // ---------------------------------------------------------------------------
  function sawRoof(b, x0, x1, z0, z1, y, n, col, glassCol) {
    const L = (x1 - x0) / n, h = 0.28;
    for (let i = 0; i < n; i++) {
      const a = x0 + i * L;
      b.mat('roof', col).push().tr(0, y, 0).extrudeZ([[a, 0], [a + L, 0], [a + L, 0.02], [a + 0.02, h], [a, h]], z0, z1).pop();
      b.mat('glass', glassCol || C.glassL).push().tr(0, y, 0).quad([a + 0.005, h, z1], [a + 0.005, h, z0], [a + 0.005, 0.03, z0], [a + 0.005, 0.03, z1]).pop();
    }
  }
  function smokestack(b, x, z, y0, h, r, col, band, top) {
    b.mat('stone', col).cyl(x, y0, z, r, r * 0.75, h, 10);
    if (band) { b.mat('plaster', band).cyl(x, y0 + h * 0.72, z, r * 0.81, r * 0.79, h * 0.08, 10, { top: false }).cyl(x, y0 + h * 0.86, z, r * 0.79, r * 0.77, h * 0.07, 10, { top: false }); }
    b.mat('metal', top || C.iron).cyl(x, y0 + h, z, r * 0.85, r * 0.85, 0.05, 10, { top: false });
    b.stack(x, y0 + h + 0.05, z);
  }
  M.factory = function (b, P) {
    const big = P.level >= 2, S = big ? 1.42 : 0.95, kind = P.kind || 'fabrik';
    if (P.closed && P.closed !== 0) return M.factoryRuin(b, P);
    plinth(b, S * 2, S * 2, C.concD, 0.04);
    b.mat('plaster', '#6e675e').box(-S + 0.03, 0.04, -S + 0.03, S - 0.03, 0.05, S - 0.03, 1);
    if (kind === 'kombinat') {
      const w = S * 1.8, d = S * 1.2, h = big ? 0.95 : 0.7;
      b.mat('stone', C.brick).blk(0, 0.04, 0.1, w, h, d, 1);
      sawRoof(b, -w / 2, w / 2, 0.1 - d / 2, 0.1 + d / 2, 0.04 + h, big ? 5 : 4, '#6a6e72');
      facade(b, 0, 0.1, w, d, 0.04, h, { n: 1, win: { w: 0.22, h: 0.3, frameMat: 'plaster', frame: '#e8e2d4', glass: C.glassL }, door: 0, doorW: 0.4, doorH: 0.45, spacing: 0.34, sides: [0, 1, 3], doorO: { col: '#4b5560' } });
      b.mat('cloth', P.T.main).box(-0.5, 0.04 + h - 0.18, 0.1 + d / 2, 0.5, 0.04 + h - 0.05, 0.1 + d / 2 + 0.012, 8);
      const n = big ? 3 : 2;
      for (let i = 0; i < n; i++) smokestack(b, -w / 2 + 0.25 + i * 0.35, 0.1 - d / 2 - 0.2, 0.04, big ? 2.6 : 2.0, 0.13, C.brick, '#efe8dc');
      b.mat('metal', C.steel).cylX(-w / 2, w / 2, 0.55, -S + 0.25, 0.08, 8);
    } else if (kind === 'ruestung') {
      const w = S * 1.85, d = S * 1.4, h = big ? 1.0 : 0.75;
      b.mat('plaster', '#5d6064').blk(0, 0.04, 0.05, w, h, d, 1);
      sawRoof(b, -w / 2, w / 2, 0.05 - d / 2, 0.05 + d / 2, 0.04 + h, big ? 6 : 4, '#3e4044', '#5a6a72');
      b.mat('glass', '#20262a');
      for (let i = 0; i < (big ? 8 : 5); i++) b.box(-w / 2 + 0.15 + i * (w - 0.3) / ((big ? 8 : 5) - 1) - 0.06, 0.45, 0.05 + d / 2 - 0.01, -w / 2 + 0.15 + i * (w - 0.3) / ((big ? 8 : 5) - 1) + 0.06, 0.58, 0.05 + d / 2 + 0.008, 1 | 2 | 8);
      b.mat('metal', '#3a3d40').box(-0.25, 0.04, 0.05 + d / 2 - 0.01, 0.25, 0.5, 0.05 + d / 2 + 0.015, 1 | 8);
      for (let i = 0; i < 2 + (big ? 1 : 0); i++) smokestack(b, w / 2 - 0.25 - i * 0.4, 0.05 - d / 2 + 0.25, 0.04, big ? 2.8 : 2.2, 0.12, '#55585c', null, '#2c2e30');
      b.mat('cloth', P.T.dark).box(-w / 2 + 0.2, 0.25, 0.05 + d / 2, -w / 2 + 0.4, 0.04 + h - 0.05, 0.05 + d / 2 + 0.012, 8);
      b.mat('metal', C.iron);
      for (let i = 0; i < 6; i++) b.cyl(-S + 0.1 + i * 0.35, 0.04, S - 0.08, 0.02, 0.02, 0.4, 4);
      b.box(-S + 0.1, 0.36, S - 0.09, S - 0.15, 0.38, S - 0.07, 0);
    } else if (kind === 'manufaktur') {
      const w = S * 1.7, d = S * 1.15, h = big ? 1.15 : 0.85;
      b.mat('stone', C.brickL).blk(-0.05, 0.04, 0.05, w, h, d, 1);
      b.mat('roof', '#5a3a2e').gable(-0.05, 0.04 + h, 0.05, w, d, 0.45, { over: 0.06, ends: { mat: 'stone', col: C.brickL } });
      facade(b, -0.05, 0.05, w, d, 0.04, h / 2, { n: 2, win: { w: 0.12, h: 0.18, cross: true, frameMat: 'plaster', frame: '#efe8dc' }, door: 0, doorW: 0.3, doorH: 0.36, spacing: 0.26, sides: [0, 1, 3] });
      smokestack(b, w / 2 - 0.15, 0.05 - d / 2 - 0.12, 0.04, big ? 2.3 : 1.8, 0.12, C.brickD);
      if (big) smokestack(b, -w / 2 + 0.2, 0.05 - d / 2 - 0.12, 0.04, 2.0, 0.1, C.brickD);
      crate(b, S - 0.2, S - 0.2, 0.18, 0.2, 0.04); barrel(b, S - 0.45, S - 0.18, 0.09, 0.04);
      b.flag(-S + 0.15, 0.04, S - 0.15, 1.3, 0.3, 0.2, P.T.main);
    } else if (kind === 'fabrik') {
      const w = S * 1.8, d = S * 1.25, h = big ? 0.85 : 0.65;
      b.mat('plaster', '#ece8de').blk(0, 0.04, 0.05, w, h, d, 1);
      sawRoof(b, -w / 2, w / 2, 0.05 - d / 2, 0.05 + d / 2, 0.04 + h, big ? 5 : 4, '#c8ccd0', '#7b9cb0');
      b.mat('glass', '#5d7d92').box(-w / 2 + 0.1, 0.25, 0.05 + d / 2 - 0.01, w / 2 - 0.1, 0.04 + h - 0.12, 0.05 + d / 2 + 0.006, 1 | 2 | 8);
      b.mat('plaster', '#ece8de');
      for (let i = 0; i <= 6; i++) b.box(-w / 2 + 0.1 + i * (w - 0.2) / 6 - 0.02, 0.25, 0.05 + d / 2, -w / 2 + 0.1 + i * (w - 0.2) / 6 + 0.02, 0.04 + h - 0.12, 0.05 + d / 2 + 0.02, 1 | 8);
      b.mat('cloth', P.T.main).box(-w / 2, 0.04 + h - 0.1, 0.05 + d / 2, w / 2, 0.04 + h - 0.03, 0.05 + d / 2 + 0.012, 8);
      const sx = w / 2 - 0.25, sz = 0.05 - d / 2 - 0.15;
      smokestack(b, sx, sz, 0.04, big ? 2.2 : 1.8, 0.11, '#e6e2d8', '#c84a3a');
      if (P.filtered) {
        // Filteranlage: grüner Aufsatz und Kasten
        const top = 0.04 + (big ? 2.2 : 1.8);
        b.meta.stacks.pop();
        b.mat('metal', '#4f8a5a').cyl(sx, top, sz, 0.15, 0.15, 0.18, 10).cyl(sx, top + 0.18, sz, 0.15, 0.09, 0.08, 10);
        b.stack(sx, top + 0.26, sz);
        b.mat('metal', '#5f9a6a').blk(sx - 0.35, 0.04, sz, 0.35, 0.45, 0.3, 1);
        b.mat('metal', C.steel).beam([sx - 0.2, 0.45, sz], [sx - 0.08, 0.9, sz], 0.05, 6);
        b.mat('plaster', '#5bb36a').ball(-S + 0.25, 0.12, S - 0.25, 0.13, 6).ball(-S + 0.5, 0.1, S - 0.2, 0.1, 6);
      }
      if (big) { b.mat('plaster', '#ece8de').blk(-w / 2 + 0.35, 0.04 + h, 0.05 + d / 2 - 0.3, 0.5, 0.35, 0.45, 1); b.window(-w / 2 + 0.35, 0.04 + h + 0.1, 0.05 + d / 2 - 0.075, 0.3, 0.15, {}); }
    } else {
      // Königliche Schmiede (immer klein)
      const w = 1.1, d = 0.85;
      b.mat('stone', C.stone).blk(-0.2, 0.04, -0.15, w, 0.65, d, 1);
      b.mat('roof', K.mix(K.tame(P.T.main, 0.3), C.slate, 0.45)).gable(-0.2, 0.69, -0.15, w, d, 0.45, { over: 0.1, ends: { mat: 'stone', col: C.stone } });
      b.push().tr(-0.2, 0, -0.15).side(0).door(-0.2, 0.04, d / 2, 0.3, 0.42, { col: '#2a201a', frameMat: 'stone', frame: C.stoneL }).pop();
      b.mat('glow', '#ff7a2a').box(-0.5, 0.06, -0.15 + d / 2 + 0.01, -0.3, 0.3, -0.15 + d / 2 + 0.02, 0);
      b.meta.glow.push(b._wp(-0.4, 0.2, -0.15 + d / 2 + 0.05));
      smokestack(b, 0.2, -0.45, 0.04, 1.65, 0.13, C.stoneD);
      // Amboss, Vordach
      b.mat('metal', C.iron).blk(0.45, 0.04, 0.5, 0.12, 0.14, 0.08, 1).blk(0.45, 0.18, 0.5, 0.26, 0.06, 0.1, 1);
      b.mat('wood', C.woodL).cyl(0.45, 0.04, 0.5, 0.0, 0.0, 0.01, 4);
      b.mat('wood', C.woodD).cyl(0.2, 0.04, 0.55, 0.02, 0.02, 0.5, 4).cyl(0.7, 0.04, 0.55, 0.02, 0.02, 0.5, 4);
      b.mat('roof', '#6e5a45').push().tr(0.45, 0.55, 0.38).rotX(0.25).box(-0.32, 0, -0.25, 0.32, 0.03, 0.22, 0).pop();
      b.mat('metal', C.gold).cone(-0.2, 1.14 + 0.02, -0.15, 0.06, 0.1, 5);
      logPile(b, -0.75, 0.55, 0, 5, 0.35);
    }
  };
  M.factoryRuin = function (b, P) {
    const big = P.level >= 2, S = big ? 1.42 : 0.95;
    plinth(b, S * 2, S * 2, C.concD, 0.03);
    b.mat('plaster', '#5c544a').box(-S + 0.03, 0.03, -S + 0.03, S - 0.03, 0.04, S - 0.03, 1);
    const w = S * 1.7, d = S * 1.1;
    b.mat('stone', '#7d5a48');
    b.box(-w / 2, 0.04, -d / 2, w / 2, 0.55, -d / 2 + 0.1, 1);
    b.push().tr(0, 0.04, 0).extrudeZ([[-w / 2, 0], [-w / 2 + 0.12, 0], [-w / 2 + 0.12, 0.62], [-w / 2, 0.45]], -d / 2, d / 2).pop();
    b.box(w / 2 - 0.1, 0.04, -d / 2, w / 2, 0.3, d / 2, 1);
    b.box(-w / 2, 0.04, d / 2 - 0.1, -w / 2 + 0.6, 0.38, d / 2, 1);
    b.mat('stone', '#6e4c3c').cyl(-w / 2 + 0.25, 0.04, -d / 2 - 0.2, 0.13, 0.11, 1.1, 9);
    b.mat('stone', '#7a6656');
    for (let i = 0; i < 14; i++) b.ball(-w / 2 + K.h2(i, 1) * w, 0.05, -d / 2 + K.h2(i, 2) * d, 0.05 + K.h2(i, 3) * 0.06, 4);
    b.mat('metal', C.rust);
    for (let i = 0; i < 4; i++) b.beam([-0.4 + i * 0.3, 0.06, -0.2], [-0.3 + i * 0.3, 0.45 + K.h2(i, 7) * 0.2, 0.15], 0.03);
    b.mat('wood', '#3a2e26').beam([0.2, 0.05, 0.3], [0.7, 0.3, 0.1], 0.06);
  };

  // ---------------------------------------------------------------------------
  // Orte der Wildnis (1×1)
  // ---------------------------------------------------------------------------
  function rock(b, x, z, r, col, k) {
    b.mat('stone', col || '#8a857c');
    b.push().tr(x, 0, z).rotY(k * 1.7).scale(1, 0.75 + K.h2(k, 9) * 0.4, 0.85 + K.h2(k, 4) * 0.3);
    b.dome(0, -r * 0.2, 0, r, r * 1.1, 6, 3);
    b.pop();
  }
  M.rock = rock;
  const LAIR = M.LAIR = {};
  LAIR.wolfden = function (b) {
    rock(b, -0.1, -0.15, 0.42, '#7d786e', 1); rock(b, 0.28, -0.05, 0.28, '#868176', 2); rock(b, -0.32, 0.12, 0.22, '#8d887d', 3);
    b.mat('glass', '#141210').push().tr(0.0, 0.0, 0.18).extrudeZ([[-0.14, 0], [0.14, 0], [0.1, 0.16], [0, 0.2], [-0.1, 0.16]], -0.04, 0.02).pop();
    b.mat('plaster', '#e8e0cc');
    b.beam([0.2, 0.02, 0.35], [0.38, 0.03, 0.3], 0.025).beam([0.25, 0.02, 0.4], [0.2, 0.03, 0.25], 0.02).ball(0.38, 0.04, 0.42, 0.035, 5);
    b.mat('plaster', '#5c4a36').box(-0.15, 0, 0.2, 0.2, 0.01, 0.45, 1);
  };
  LAIR.bearcave = function (b) {
    rock(b, 0, -0.1, 0.55, '#6f6a62', 4); rock(b, 0.35, 0.05, 0.25, '#7a756b', 5); rock(b, -0.35, 0.1, 0.25, '#7a756b', 6);
    b.mat('glass', '#0e0d0c').push().tr(0, 0, 0.32).extrudeZ([[-0.2, 0], [0.2, 0], [0.16, 0.24], [0, 0.32], [-0.16, 0.24]], -0.06, 0.02).pop();
    b.mat('plaster', '#4a6a2a').ball(-0.3, 0.05, 0.38, 0.1, 5).ball(0.33, 0.04, 0.36, 0.08, 5);
    b.mat('plaster', '#c43a3a').ball(0.36, 0.1, 0.38, 0.02, 4).ball(0.3, 0.09, 0.33, 0.02, 4);
  };
  LAIR.dragonhoard = function (b) {
    rock(b, -0.25, -0.25, 0.4, '#5c5650', 7); rock(b, 0.3, -0.3, 0.3, '#625b54', 8); rock(b, 0.38, 0.25, 0.2, '#625b54', 9);
    b.mat('metal', C.gold).push().tr(0, 0, 0.08).dome(0, -0.02, 0, 0.35, 0.22, 10, 3).pop();
    for (let i = 0; i < 10; i++) b.mat('metal', i & 1 ? '#e8c050' : '#c8962c').cyl(-0.3 + K.h2(i, 1) * 0.6, 0, 0.0 + K.h2(i, 2) * 0.35, 0.035, 0.035, 0.012, 7).push().pop();
    b.mat('glow', '#ffd860').cyl(0, 0.01, 0.08, 0.45, 0.45, 0.003, 12);
    b.mat('plaster', '#e8e0cc');
    b.push().tr(-0.32, 0.05, 0.3).rotY(0.4);
    for (let i = 0; i < 4; i++) b.push().tr(i * 0.06, 0, 0).rotZ(0.3).dome(0, 0, 0, 0.012, 0.1, 4, 2).pop();
    b.ball(-0.05, 0.04, 0, 0.07, 6);
    b.pop();
    b.mat('wood', '#5a3d26').blk(0.12, 0.0, 0.32, 0.18, 0.11, 0.12, 1);
    b.mat('metal', C.gold).box(0.03, 0.06, 0.255, 0.21, 0.08, 0.385, 0);
  };
  LAIR.banditcamp = function (b, P) {
    b.mat('plaster', '#6e5a44').cyl(0, 0, 0, 0.48, 0.48, 0.01, 10, { top: true });
    b.mat('cloth', '#5d5446');
    b.push().tr(-0.15, 0, -0.15).rotY(0.4).extrudeX([[-0.22, 0], [0.22, 0], [0, 0.36]], -0.25, 0.25, false).pop();
    b.mat('cloth', '#4a443a').push().tr(-0.15, 0, -0.15).rotY(0.4).extrudeZ([[-0.22, 0], [0.22, 0], [0, 0.36]], -0.26, -0.25).pop();
    M.campfire(b, 0.2, 0.15, false);
    crate(b, 0.3, -0.25, 0.14, 0.4); crate(b, 0.36, -0.1, 0.1, 0.1, 0.0);
    b.mat('wood', C.woodD);
    for (let i = 0; i < 5; i++) { const a = PI * 0.6 + i * 0.3; b.beam([Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45], [Math.cos(a) * 0.52, 0.32, Math.sin(a) * 0.52], 0.035); }
    b.flag(-0.4, 0, 0.3, 0.7, 0.2, 0.14, '#2a2420', { pole: C.woodD });
    void P;
  };
  LAIR.treasure = function (b) {
    b.mat('stone', '#c4bba8').box(-0.42, 0, -0.42, 0.42, 0.06, 0.42, 1);
    b.mat('stone', '#d6cdb8').cyl(-0.28, 0.06, -0.25, 0.07, 0.065, 0.7, 8).cyl(0.28, 0.06, -0.25, 0.07, 0.065, 0.42, 8);
    b.mat('stone', '#d6cdb8').push().tr(-0.05, 0.06, 0.25).rotZ(1.4).cyl(0, 0, 0, 0.065, 0.06, 0.45, 8).pop();
    b.mat('stone', '#cfc6b0').box(-0.36, 0.76, -0.32, -0.05, 0.84, -0.18, 0);
    b.mat('wood', '#6a4626').blk(0.1, 0.06, 0.12, 0.22, 0.12, 0.15, 1);
    b.mat('wood', '#6a4626').push().tr(0.1, 0.18, 0.12).extrudeX([[-0.075, 0], [0.075, 0], [0.05, 0.05], [-0.05, 0.05]], -0.11, 0.11).pop();
    b.mat('metal', C.gold).box(-0.015, 0.11, 0.195, 0.235, 0.14, 0.2, 0).box(0.08, 0.13, 0.198, 0.12, 0.17, 0.205, 0);
    b.mat('plaster', '#4a6a2a').ball(0.35, 0.05, 0.3, 0.09, 5).ball(-0.3, 0.06, 0.32, 0.07, 5);
  };
  LAIR.ore = function (b, P) {
    const amt = P.amount == null ? 1 : Math.max(0.3, Math.min(1, P.amount / 40));
    rock(b, 0, 0, 0.38 * (0.6 + amt * 0.4), '#7e7a72', 10); rock(b, 0.28, 0.2, 0.2, '#86827a', 11); rock(b, -0.25, 0.22, 0.17, '#8a857c', 12);
    b.mat('metal', '#a6542e');
    for (let i = 0; i < 6; i++) { const a = i * 1.1; b.push().tr(Math.cos(a) * 0.2, 0.12 + (i % 3) * 0.08, Math.sin(a) * 0.2).rotY(a).rotX(0.5).box(-0.035, -0.02, -0.02, 0.035, 0.03, 0.025, 0).pop(); }
    b.mat('metal', '#3d4044').ball(0.1, 0.32, 0.08, 0.05, 4).ball(-0.12, 0.25, 0.15, 0.04, 4);
  };
  LAIR.goldvein = function (b, P) {
    const amt = P.amount == null ? 1 : Math.max(0.3, Math.min(1, P.amount / 40));
    rock(b, 0, -0.05, 0.36 * (0.6 + amt * 0.4), '#8a8478', 13); rock(b, -0.3, 0.2, 0.18, '#958f82', 14);
    b.mat('metal', C.gold);
    for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; b.push().tr(Math.cos(a) * 0.22, 0.08 + (i % 3) * 0.1, Math.sin(a) * 0.2 - 0.03).rotY(a).rotZ(0.3).cyl(0, 0, 0, 0.035, 0.0, 0.12, 5).pop(); }
    b.mat('glow', '#ffe08a').cyl(0, 0.01, 0, 0.42, 0.42, 0.003, 10);
  };
  M.lair = function (b, P) { (LAIR[P.kind] || LAIR.wolfden)(b, P); };

  // ---------------------------------------------------------------------------
  // Ruine (1×1): Schutt und Mauerreste, nach dem Vorgänger gefärbt
  // ---------------------------------------------------------------------------
  M.ruin = function (b, P) {
    const of = P.ruinOf || 'house', k = P.v | 0;
    const stone = of === 'wall' || of === 'tower' || of === 'gate' || of === 'monument' || of === 'barracks' || of === 'center';
    const col = stone ? '#8f8a80' : (of === 'factory' ? '#7a5a48' : '#6e5a48');
    b.mat('plaster', '#4e443a').box(-0.48, -0.02, -0.48, 0.48, 0.012, 0.48, 1);
    b.mat(stone ? 'stone' : 'wood', col);
    const a = (k & 3) * PI / 2;
    b.push().rotY(a);
    b.push().tr(0, 0, -0.32).extrudeZ([[-0.42, 0], [0.42, 0], [0.42, 0.18], [0.15, 0.32 + (k & 4 ? 0.15 : 0)], [-0.1, 0.22], [-0.42, 0.42]], -0.08, 0.06).pop();
    b.push().tr(-0.32, 0, 0).rotY(PI / 2).extrudeZ([[-0.32, 0], [0.4, 0], [0.4, 0.1], [0.0, 0.25], [-0.32, 0.38]], -0.08, 0.06).pop();
    b.pop();
    b.mat('stone', stone ? '#9a958a' : '#5e5046');
    for (let i = 0; i < 9; i++) b.ball(-0.3 + K.h2(i, k) * 0.65, 0.02, -0.25 + K.h2(i + 9, k) * 0.6, 0.04 + K.h2(i, k + 3) * 0.06, 4);
    if (!stone) { b.mat('wood', '#2e2622').beam([-0.2, 0.02, 0.2], [0.25, 0.25, -0.15], 0.05).beam([0.3, 0.02, 0.25], [0.0, 0.18, -0.1], 0.045); }
    b.mat('plaster', '#5d7a3a').ball(0.32, 0.03, 0.32, 0.07, 5);
  };

  // ---------------------------------------------------------------------------
  // Stadt-Deko (1×1, auf freien Kacheln neben Häusern)
  // ---------------------------------------------------------------------------
  const DECO = M.DECO = {};
  DECO.well = function (b) {
    b.mat('stone', C.stone).cyl(0, 0, 0, 0.2, 0.2, 0.22, 10);
    b.mat('glass', '#24343c').cyl(0, 0.2, 0, 0.15, 0.15, 0.021, 10);
    b.mat('wood', C.woodD).box(-0.2, 0.2, -0.02, -0.17, 0.62, 0.02, 0).box(0.17, 0.2, -0.02, 0.2, 0.62, 0.02, 0);
    b.mat('roof', C.tile).gable(0, 0.6, 0, 0.42, 0.32, 0.14, { over: 0.04, ends: false });
    b.mat('wood', C.wood).cylX(-0.17, 0.17, 0.48, 0, 0.025, 6);
  };
  DECO.stall = function (b, P) {
    b.mat('wood', C.woodD).cyl(-0.25, 0, -0.15, 0.015, 0.015, 0.5, 4).cyl(0.25, 0, -0.15, 0.015, 0.015, 0.5, 4).cyl(-0.25, 0, 0.15, 0.015, 0.015, 0.42, 4).cyl(0.25, 0, 0.15, 0.015, 0.015, 0.42, 4);
    b.mat('wood', C.woodL).box(-0.28, 0.22, -0.1, 0.28, 0.26, 0.18, 0);
    b.mat('cloth', P.T.main).quad([-0.3, 0.42, 0.2], [0.3, 0.42, 0.2], [0.3, 0.52, -0.18], [-0.3, 0.52, -0.18]).quad([0.3, 0.42, 0.2], [-0.3, 0.42, 0.2], [-0.3, 0.52, -0.18], [0.3, 0.52, -0.18]);
    for (let j = 0; j < 4; j++) { b.mat('plaster', ['#c0392b', '#e6a33a', '#7aa344', '#d9c58a'][j]); b.ball(-0.18 + j * 0.12, 0.29, 0.05, 0.035, 5); }
  };
  DECO.hay = function (b) { b.mat('roof', C.hay).push().scale(1, 0.8, 1).dome(0, 0, 0, 0.26, 0.4, 9, 3).pop(); b.mat('roof', '#c9a64e').cyl(0.25, 0, 0.2, 0.08, 0.08, 0.12, 7); };
  DECO.cart = function (b) { M.cart(b, 0, 0, 0.6, C.hay); };
  DECO.garden = function (b, P) {
    b.mat('plaster', '#5e4630').box(-0.38, 0, -0.38, 0.38, 0.03, 0.38, 1);
    const k = P.dv | 0, cols = [['#7aa344', '#5f8a35'], ['#d0473a', '#7aa344'], ['#e9c840', '#b36ac9']][k % 3];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { b.mat('plaster', (i + j) & 1 ? cols[0] : cols[1]); b.ball(-0.25 + j * 0.17, 0.06, -0.22 + i * 0.22, 0.055 + K.h2(i, j) * 0.02, 5); }
    b.mat('wood', C.woodL);
    for (let i = 0; i < 5; i++) { b.blk(-0.4 + i * 0.2, 0, 0.42, 0.025, 0.14, 0.025, 1); b.blk(-0.4 + i * 0.2, 0, -0.42, 0.025, 0.14, 0.025, 1); }
    b.box(-0.41, 0.1, 0.41, 0.41, 0.12, 0.43, 0).box(-0.41, 0.1, -0.43, 0.41, 0.12, -0.41, 0);
  };
  DECO.woodpile = function (b) { logPile(b, 0, 0, 0.3, 9, 0.5); };
  DECO.barrels = function (b) { barrel(b, -0.12, -0.05, 0.1); barrel(b, 0.12, -0.08, 0.1); barrel(b, 0.0, 0.15, 0.1); crate(b, 0.25, 0.22, 0.16, 0.3); };
  DECO.laundry = function (b) {
    b.mat('wood', C.woodD).cyl(-0.35, 0, 0, 0.015, 0.015, 0.5, 4).cyl(0.35, 0, 0, 0.015, 0.015, 0.5, 4);
    b.mat('metal', '#ddd').box(-0.35, 0.47, -0.003, 0.35, 0.474, 0.003, 0);
    const cs = ['#f1ece0', '#7fa6c9', '#d98b7a', '#e8d27a'];
    for (let i = 0; i < 4; i++) { b.mat('cloth', cs[i]); const x = -0.28 + i * 0.16; b.quad([x - 0.06, 0.28 - (i & 1) * 0.05, 0], [x + 0.06, 0.28 - (i & 1) * 0.05, 0], [x + 0.06, 0.47, 0], [x - 0.06, 0.47, 0]).quad([x + 0.06, 0.28 - (i & 1) * 0.05, 0], [x - 0.06, 0.28 - (i & 1) * 0.05, 0], [x - 0.06, 0.47, 0], [x + 0.06, 0.47, 0]); }
  };
  M.DECO_KEYS = ['well', 'stall', 'hay', 'cart', 'garden', 'garden', 'garden', 'woodpile', 'barrels', 'laundry'];
  M.deco = function (b, P) { (DECO[P.deco] || DECO.hay)(b, P); };

  // ---------------------------------------------------------------------------
  // Baustelle: Gerüst (Stangen, Bohlen, Leitern) um eine Grundfläche w × w bis Höhe H, Material-Stapel
  // ---------------------------------------------------------------------------
  M.scaffold = function (b, P) {
    const w = P.w, H = Math.max(0.35, P.H), hw = w / 2 - 0.08, light = P.light;
    b.mat('wood', '#a08560');
    const n = Math.max(2, Math.round(w / 0.55));
    const pts = [];
    for (let i = 0; i <= n; i++) { const u = -hw + i * 2 * hw / n; pts.push([u, -hw], [u, hw]); if (i > 0 && i < n) { pts.push([-hw, u], [hw, u]); } }
    for (const p of pts) b.box(p[0] - 0.018, 0, p[1] - 0.018, p[0] + 0.018, H + 0.08, p[1] + 0.018, 1);
    const lv = Math.max(1, Math.round(H / 0.45));
    b.mat('wood', '#b89c72');
    for (let l = 1; l <= lv; l++) {
      const y = l * H / lv;
      b.box(-hw - 0.02, y - 0.025, -hw - 0.1, hw + 0.02, y, -hw + 0.04, 0);
      b.box(-hw - 0.02, y - 0.025, hw - 0.04, hw + 0.02, y, hw + 0.1, 0);
      if (!light) { b.box(-hw - 0.1, y - 0.025, -hw, -hw + 0.04, y, hw, 0); b.box(hw - 0.04, y - 0.025, -hw, hw + 0.1, y, hw, 0); }
    }
    b.mat('wood', '#8a6e4c');
    if (!light) {
      for (const sz of [-1, 1]) b.beam([-hw, 0.05, sz * (hw + 0.02)], [hw * 0.2, H, sz * (hw + 0.02)], 0.025);
      for (const sx of [-1, 1]) b.beam([sx * (hw + 0.02), 0.05, -hw], [sx * (hw + 0.02), H, hw * 0.2], 0.025);
    }
    if (P.pile && w >= 1.5) {
      logPile(b, -w / 2 + 0.3, w / 2 + 0.05, 0, 5, 0.4);
      b.mat('stone', '#b3ad9f').blk(w / 2 - 0.25, 0, w / 2 - 0.05, 0.22, 0.12, 0.16, 1).blk(w / 2 - 0.27, 0.12, w / 2 - 0.05, 0.18, 0.1, 0.14, 1);
    }
    if (P.crane && w >= 2.5) {
      b.mat('wood', C.woodD).box(hw + 0.15, 0, -0.05, hw + 0.23, H + 0.6, 0.03, 1);
      b.beam([hw + 0.19, H + 0.55, -0.01], [-0.2, H + 0.75, -0.01], 0.05);
      b.mat('metal', C.iron).box(-0.12, H * 0.4, -0.015, -0.11, H + 0.73, -0.005, 0);
    }
  };
  // Baugrube (Fundament) für sehr frühe Baustellen
  M.site = function (b, P) {
    const w = P.w;
    b.mat('plaster', '#7a6248').box(-w / 2 + 0.06, -0.03, -w / 2 + 0.06, w / 2 - 0.06, 0.02, w / 2 - 0.06, 1);
    b.mat('wood', C.woodL);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.blk(sx * (w / 2 - 0.1), 0, sz * (w / 2 - 0.1), 0.04, 0.22, 0.04, 1);
    b.mat('cloth', '#e8dcc0').box(-w / 2 + 0.1, 0.15, w / 2 - 0.105, w / 2 - 0.1, 0.16, w / 2 - 0.095, 0).box(-w / 2 + 0.1, 0.15, -w / 2 + 0.095, w / 2 - 0.1, 0.16, -w / 2 + 0.105, 0);
    if (w >= 1.5) { logPile(b, 0, 0.1, 0.2, 5, 0.45); b.mat('stone', '#b3ad9f').blk(-0.3 * w / 2, 0, -0.3 * w / 2, 0.2, 0.12, 0.16, 1); }
    else { b.mat('wood', C.log).cylX(-0.2, 0.2, 0.05, 0, 0.04, 5); }
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
