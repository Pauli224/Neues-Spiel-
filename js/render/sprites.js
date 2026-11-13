// Wuselwelt – Pixelkunst, Kern: Palette, Teamfarben, Raster-Werkzeuge, Atlas-Backen, Zeichen-API.
// Die eigentlichen Motive stehen in sprites-world.js, sprites-units.js und sprites-icons.js.
// Ladereihenfolge: sprites.js, dann die drei sprites-*.js (beliebig), dann WW.Sprites.init().
(function (WW) { 'use strict';

  // ---------------------------------------------------------------------------
  // Palette: eine feste Palette, Licht von links oben.
  var PALETTE = {
    ink: '#231a2c', plum: '#3e3150', dusk: '#6a5d7b', white: '#fbf7ee', cream: '#eedfb8',
    skin: '#f2c097', skinD: '#cf8f6b',
    woodL: '#c98d4e', wood: '#9a6233', woodD: '#643b22',
    strawL: '#f6dc85', straw: '#dcb052', strawD: '#a67d2e',
    stoneL: '#d6cfc4', stone: '#a49d95', stoneD: '#716b6c',
    metalL: '#e2e8ef', metal: '#97a3b3', metalD: '#58637a',
    goldL: '#ffe68c', gold: '#f2b632', goldD: '#b2731d',
    red: '#d9483b', redD: '#962a30',
    leafL: '#93d15c', leaf: '#4c9c3f', leafD: '#2c6a38', leafDD: '#1d4630',
    grassL: '#8fcd5f', grass: '#6fb54a', grassD: '#589a3e',
    hillL: '#b7c46a', hill: '#94a450', hillD: '#6f7e3d',
    sandL: '#f5e3ae', sand: '#e7c887', sandD: '#cda863', soil: '#80532f',
    foam: '#d9f3f5', waterL: '#62b8e0', water: '#3b8dc5', waterD: '#2e74ad',
    deepL: '#2f66a0', deep: '#25558b', deepD: '#1d4473',
    rockL: '#bab3c0', rock: '#8a8296', rockD: '#625a71',
    snowD: '#cfdcec', snowDD: '#a5badb',
    fireY: '#ffd23f', fireO: '#ff8a2a',
    plague: '#9cc23a', purple: '#8a5cc0', pink: '#f29db6', glass: '#7ccbe9',
    // Biome
    shallowL: '#9adcf0', shallow: '#5bb4dc', riverL: '#b4e8f7', river: '#56aee8',
    desertL: '#f4cd80', desert: '#e3b062', desertD: '#c48a45',
    savL: '#d8d077', sav: '#bab456', savD: '#918d3e',
    jungleL: '#46b05e', jungle: '#23804a', jungleD: '#135332',
    swampL: '#839d68', swamp: '#5d7b52', swampD: '#405c44', murk: '#3e5f5a',
    tundraL: '#c5cdb4', tundra: '#a9b59a', tundraD: '#87927d',
    pineL: '#57a378', pine: '#2f7158', pineD: '#1d4a41',
    mushL: '#c690c8', mush: '#9f5ba6', mushD: '#683a78',
    crysL: '#cbf7f1', crys: '#7fd8d1', crysD: '#3c97a8',
    ashL: '#76717b', ash: '#524e58', ashD: '#37343d', lavaD: '#7c2a22',
    // Völker
    orcL: '#adbe68', orc: '#869a4a', orcD: '#5a6b31'
  };
  var NAMES = Object.keys(PALETTE);
  var C = {};
  NAMES.forEach(function (n, i) { C[n] = i + 1; });
  // Sonderindizes: Teamfarben (beim Backen ersetzt) und halbdurchsichtiger Schatten.
  C.T = 250; C.Td = 251; C.Tl = 252; C.shade = 253;

  // 12 gut unterscheidbare Reichsfarben (bewusst kein reines Grün: das ist die Wiese).
  var TEAM_COLORS = [
    { name: 'Rot',        main: '#d8403a', dark: '#8f2230', light: '#f47a62' },
    { name: 'Orange',     main: '#ee8a26', dark: '#a8521c', light: '#ffbb5c' },
    { name: 'Gelb',       main: '#efcb35', dark: '#a8831d', light: '#fff08a' },
    { name: 'Türkis',     main: '#22b0a4', dark: '#126b6c', light: '#6be0cf' },
    { name: 'Himmelblau', main: '#46a5ea', dark: '#236199', light: '#94d4ff' },
    { name: 'Königsblau', main: '#3d55c9', dark: '#232f7d', light: '#7891ee' },
    { name: 'Violett',    main: '#8c4fcb', dark: '#522a85', light: '#bd8af0' },
    { name: 'Magenta',    main: '#d03f9e', dark: '#84205f', light: '#f283c9' },
    { name: 'Rosa',       main: '#f58fb0', dark: '#bd5378', light: '#ffc6d8' },
    { name: 'Braun',      main: '#9c6235', dark: '#5e3519', light: '#cf9561' },
    { name: 'Elfenbein',  main: '#ece5d3', dark: '#a69b88', light: '#ffffff' },
    { name: 'Schiefer',   main: '#4d566b', dark: '#262c3b', light: '#7f8aa3' }
  ];

  // Zeichen-Legende für String-Pixelkunst.
  var LEGEND = {
    o: 'ink', O: 'plum', d: 'dusk', l: 'white', c: 'cream', s: 'skin', S: 'skinD',
    v: 'woodL', w: 'wood', W: 'woodD', z: 'strawL', y: 'straw', Y: 'strawD',
    q: 'stoneL', g: 'stone', G: 'stoneD', n: 'metalL', m: 'metal', M: 'metalD',
    j: 'goldL', k: 'gold', K: 'goldD', r: 'red', R: 'redD',
    f: 'leafL', e: 'leaf', E: 'leafD', x: 'leafDD', i: 'grassL', I: 'grass',
    a: 'sand', A: 'sandD', h: 'soil', b: 'glass', B: 'waterD', F: 'fireY', Q: 'fireO',
    p: 'pink', P: 'purple', X: 'plague', N: 'snowD', H: 'hillD',
    U: 'orc', V: 'orcD', Z: 'orcL'
  };
  var CHAR = {};
  Object.keys(LEGEND).forEach(function (ch) { CHAR[ch] = C[LEGEND[ch]]; });
  CHAR.T = C.T; CHAR.t = C.Td; CHAR.u = C.Tl; CHAR['#'] = C.shade;

  // ---------------------------------------------------------------------------
  // Raster: Uint8-Indexbild, 0 = durchsichtig.
  function Grid(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h); }
  Grid.prototype.get = function (x, y) {
    return (x < 0 || y < 0 || x >= this.w || y >= this.h) ? 0 : this.d[y * this.w + x];
  };
  Grid.prototype.set = function (x, y, c) {
    x |= 0; y |= 0;
    if (c == null || x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    this.d[y * this.w + x] = typeof c === 'string' ? C[c] : c;
    return this;
  };
  Grid.prototype.rect = function (x, y, w, h, c) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c);
    return this;
  };
  Grid.prototype.hline = function (x, y, len, c) { return this.rect(x, y, len, 1, c); };
  Grid.prototype.vline = function (x, y, len, c) { return this.rect(x, y, 1, len, c); };
  Grid.prototype.line = function (x0, y0, x1, y1, c) {
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
    return this;
  };
  // Ellipse mit Mittelpunkt (cx, cy) (halbe Werte erlaubt), fn(x, y, nx, ny) liefert Farbe.
  Grid.prototype.ellipse = function (cx, cy, rx, ry, c) {
    for (var y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (var x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        var nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1.0) this.set(x, y, typeof c === 'function' ? c(x, y, nx, ny) : c);
      }
    }
    return this;
  };
  // String-Kunst einsetzen; '.' und ' ' bleiben durchsichtig.
  Grid.prototype.paint = function (x, y, rows) {
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      for (var i = 0; i < r.length; i++) {
        var ch = r.charAt(i);
        if (ch === '.' || ch === ' ') continue;
        var c = CHAR[ch];
        if (c === undefined) throw new Error('Sprite-Zeichen unbekannt: ' + ch);
        this.set(x + i, y + j, c);
      }
    }
    return this;
  };
  Grid.prototype.blit = function (src, x, y) {
    for (var j = 0; j < src.h; j++) for (var i = 0; i < src.w; i++) {
      var c = src.d[j * src.w + i];
      if (c) this.set(x + i, y + j, c);
    }
    return this;
  };
  Grid.prototype.clone = function () { var g = new Grid(this.w, this.h); g.d.set(this.d); return g; };
  Grid.prototype.flipX = function () {
    var g = new Grid(this.w, this.h);
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) g.d[y * this.w + x] = this.d[y * this.w + (this.w - 1 - x)];
    return g;
  };
  Grid.prototype.replace = function (a, b) {
    a = typeof a === 'string' ? C[a] : a; b = typeof b === 'string' ? C[b] : b;
    for (var i = 0; i < this.d.length; i++) if (this.d[i] === a) this.d[i] = b;
    return this;
  };
  // Dunkle Kontur um alle deckenden Pixel (4er-Nachbarschaft, runde Ecken).
  // skip(x, y): optional, dort keine Kontur setzen.
  Grid.prototype.outline = function (c, diag, skip) {
    c = c == null ? C.ink : (typeof c === 'string' ? C[c] : c);
    var src = this.d, w = this.w, h = this.h, out = new Uint8Array(src);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (src[y * w + x]) continue;
      var hit = false;
      for (var k = 0; k < (diag ? 8 : 4) && !hit; k++) {
        var nx = x + NB[k][0], ny = y + NB[k][1];
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
          var v = src[ny * w + nx];
          if (v && v !== C.shade) hit = true;
        }
      }
      if (hit && !(skip && skip(x, y))) out[y * w + x] = c;
    }
    this.d = out;
    return this;
  };
  var NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  // Raster erweitern (Rand), z. B. für die automatische Kontur.
  Grid.prototype.pad = function (l, t, r, b) {
    var g = new Grid(this.w + l + r, this.h + t + b);
    g.blit(this, l, t);
    return g;
  };
  Grid.prototype.hasTeam = function () {
    for (var i = 0; i < this.d.length; i++) if (this.d[i] >= 250 && this.d[i] <= 252) return true;
    return false;
  };

  // Deterministisches Pixel-Rauschen fürs Aussehen (nur Grafik, nicht Simulation).
  function hash(x, y, s) {
    var h = (x * 374761393 + y * 668265263 + (s | 0) * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // ---------------------------------------------------------------------------
  // Register: Bausteine aus den sprites-*.js-Dateien melden sich hier an.
  var builders = WW._spriteBuilders = WW._spriteBuilders || [];
  var DEFS = {};      // key -> { grid, fw, fh, ox, oy, group }
  var ORDER = [];

  // def(key, grid, opts): opts.fw/fh = Grundfläche in Kacheln (Standard 1),
  // opts.anchor: 'tile' (Standard, unten an Grundfläche, links bündig),
  //   'unit' (waagrecht mittig, Füße 1 px über Kachelunterkante), 'center' (mittig in der Grundfläche),
  //   'icon' (links oben, keine Verankerung).
  function def(key, grid, opts) {
    opts = opts || {};
    var fw = opts.fw || 1, fh = opts.fh || 1, bw = fw * 8, bh = fh * 8, ox, oy;
    var anchor = opts.anchor || 'tile';
    if (anchor === 'unit') { ox = Math.floor((bw - grid.w) / 2); oy = bh - grid.h - (opts.lift == null ? 1 : opts.lift); }
    else if (anchor === 'center') { ox = Math.floor((bw - grid.w) / 2); oy = Math.floor((bh - grid.h) / 2); }
    else if (anchor === 'icon') { ox = 0; oy = 0; }
    else { ox = Math.floor((bw - grid.w) / 2); oy = bh - grid.h; }
    if (opts.ox != null) ox = opts.ox;
    if (opts.oy != null) oy = opts.oy;
    if (!DEFS[key]) ORDER.push(key);
    DEFS[key] = { key: key, grid: grid, fw: fw, fh: fh, ox: ox, oy: oy, group: opts.group || '' };
    return grid;
  }

  // ---------------------------------------------------------------------------
  // Backen
  var RGBA = new Uint32Array(256);  // Kleinendian ABGR
  function rgbaOf(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return (((a == null ? 255 : a) << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | ((n >> 16) & 255)) >>> 0;
  }
  NAMES.forEach(function (n, i) { RGBA[i + 1] = rgbaOf(PALETTE[n]); });
  RGBA[C.shade] = (((84) << 24) | (0x2a << 16) | (0x14 << 8) | 0x18) >>> 0; // rgba(24,20,42,.33)

  function teamTable(t) {
    var tab = new Uint32Array(RGBA);
    var tc = TEAM_COLORS[t];
    tab[C.T] = rgbaOf(tc.main); tab[C.Td] = rgbaOf(tc.dark); tab[C.Tl] = rgbaOf(tc.light);
    return tab;
  }
  var NEUTRAL = teamTable(10);

  // Einfache Regal-Packung; jedes Sprite liegt normal und gespiegelt im Atlas.
  function layout(keys) {
    var W = 512, x = 1, y = 1, rowH = 0, items = [];
    keys.forEach(function (k) { items.push(k); });
    items.sort(function (a, b) { return DEFS[b].grid.h - DEFS[a].grid.h; });
    var rects = {};
    function place(w, h) {
      if (x + w + 1 > W) { x = 1; y += rowH + 1; rowH = 0; }
      var r = { x: x, y: y };
      x += w + 1; if (h > rowH) rowH = h;
      return r;
    }
    items.forEach(function (k) {
      var g = DEFS[k].grid;
      var a = place(g.w, g.h), b = place(g.w, g.h);
      rects[k] = { x: a.x, y: a.y, fx: b.x, fy: b.y };
    });
    return { w: W, h: y + rowH + 1, rects: rects, keys: items };
  }

  function makeCanvas(w, h) {
    if (typeof document !== 'undefined') {
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv;
    }
    return null;
  }

  function bakeAtlas(lay, table) {
    var cv = makeCanvas(lay.w, lay.h);
    if (!cv) return null;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(lay.w, lay.h);
    var px = new Uint32Array(img.data.buffer);
    lay.keys.forEach(function (k) {
      var g = DEFS[k].grid, r = lay.rects[k];
      for (var y = 0; y < g.h; y++) for (var x = 0; x < g.w; x++) {
        var c = g.d[y * g.w + x];
        if (!c) continue;
        var v = table[c];
        px[(r.y + y) * lay.w + r.x + x] = v;
        px[(r.fy + y) * lay.w + r.fx + (g.w - 1 - x)] = v;
      }
    });
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  // ---------------------------------------------------------------------------
  // Öffentliche Schnittstelle
  var ENT = {};
  var baseLay = null, teamLay = null, baseCanvas = null, teamCanvas = [];
  var ready = false;

  function init() {
    if (ready) return S;
    ready = true;
    for (var i = 0; i < builders.length; i++) builders[i](S.lib);
    var baseKeys = [], teamKeys = [];
    ORDER.forEach(function (k) { (DEFS[k].grid.hasTeam() ? teamKeys : baseKeys).push(k); });
    baseLay = layout(baseKeys); teamLay = layout(teamKeys);
    baseCanvas = bakeAtlas(baseLay, NEUTRAL);
    ORDER.forEach(function (k) {
      var d = DEFS[k], isTeam = teamLay.rects[k] !== undefined, r = (isTeam ? teamLay : baseLay).rects[k];
      var w = d.grid.w, h = d.grid.h;
      ENT[k] = {
        team: isTeam, w: w, h: h, fw: d.fw, fh: d.fh,
        x: r.x, y: r.y, fx: r.fx, fy: r.fy,
        ox: d.ox, oy: d.oy, fox: d.fw * 8 - w - d.ox
      };
    });
    return S;
  }

  function teamAtlas(t) {
    var cv = teamCanvas[t];
    if (!cv) { cv = teamCanvas[t] = bakeAtlas(teamLay, teamTable(t)); }
    return cv;
  }

  function normTeam(t) { t = t | 0; return t >= 0 && t < 12 ? t : ((t % 12) + 12) % 12; }

  // Schnellweg ohne Optionsobjekt (für den Renderer).
  function drawFast(ctx, key, x, y, team, flip) {
    var e = ENT[key];
    if (!e) { if (!ready) { init(); e = ENT[key]; } if (!e) return; }
    var src = e.team ? (teamCanvas[team] || teamAtlas(normTeam(team))) : baseCanvas;
    if (flip) ctx.drawImage(src, e.fx, e.fy, e.w, e.h, x + e.fox, y + e.oy, e.w, e.h);
    else ctx.drawImage(src, e.x, e.y, e.w, e.h, x + e.ox, y + e.oy, e.w, e.h);
  }

  function draw(ctx, key, x, y, opts) {
    if (!opts) { drawFast(ctx, key, x, y, 0, false); return; }
    var a = opts.alpha;
    if (a != null && a < 1) {
      if (a <= 0) return;
      var old = ctx.globalAlpha; ctx.globalAlpha = old * a;
      drawFast(ctx, key, x, y, opts.team | 0, !!opts.flip);
      ctx.globalAlpha = old;
    } else drawFast(ctx, key, x, y, opts.team | 0, !!opts.flip);
  }

  function info(key) {
    if (!ready) init();
    var e = ENT[key];
    if (!e) return null;
    return { w: e.w, h: e.h, fw: e.fw, fh: e.fh, ox: e.ox, oy: e.oy, team: e.team };
  }

  function iconCanvas(key, scale, team) {
    if (!ready) init();
    scale = Math.max(1, scale | 0 || 1);
    var e = ENT[key];
    var cv = makeCanvas(e ? e.w * scale : scale, e ? e.h * scale : scale);
    if (!cv || !e) return cv;
    var ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var src = e.team ? teamAtlas(normTeam(team || 0)) : baseCanvas;
    ctx.drawImage(src, e.x, e.y, e.w, e.h, 0, 0, e.w * scale, e.h * scale);
    return cv;
  }

  var S = {
    init: init,
    draw: draw,
    drawFast: drawFast,
    info: info,
    has: function (k) { if (!ready) init(); return !!ENT[k]; },
    keys: function () { if (!ready) init(); return ORDER.slice(); },
    iconCanvas: iconCanvas,
    TEAM_COLORS: TEAM_COLORS,
    PALETTE: PALETTE,
    // Werkzeuge für die Motiv-Dateien
    lib: { Grid: Grid, C: C, CHAR: CHAR, PALETTE: PALETTE, def: def, hash: hash, DEFS: DEFS },
    // Hilfe für Werkzeuge/Vorschau
    _atlas: function () { return { base: baseCanvas, team: teamAtlas(0) }; }
  };
  WW.Sprites = S;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
