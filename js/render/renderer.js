// Renderer: Boden-Cache in Blöcken, Gebietstönung, Deko/Bauwerke/Figuren nach Fußlinie, Effekte,
// Stadtnamen, Auswahl und Pinselvorschau. Liest nur den Zustand (sim.state bzw. eine nackte Welt).
(function (WW) { 'use strict';

  const CH = 32;            // Kacheln je Block-Kante
  const CPX = CH * 8;       // Logikpixel je Block-Kante
  const DECOR_TOP = 16;     // Deko-Block: Rand oben für überragende Bäume
  const LOW_DETAIL_TILES = 6500;   // ab so vielen sichtbaren Kacheln: Deko vorgebacken

  const FONT_PIXEL = '"Pixelify Sans", "Silkscreen", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.S = WW.Sprites;
    this.st = null;
    this.chunks = [];
    this.buildQueue = [];
    this.groundDirty = new Set();
    this.fx = [];
    this.time = 0;
    this.stats = { frameMs: 0, drawn: 0 };
    this.path = null;          // Trampelpfade (nur Darstellung)
    this.traffic = null;
    this.kingTile = null;      // Reich je Kachel (für Tönung)
    this.terrScanT = 0;
    this.teamCss = this.S.TEAM_COLORS.map(c => ({ main: c.main, dark: c.dark, light: c.light, rgb: hexRgb(c.main) }));
    this.rowU = []; this.rowS = [];
    this.labelCache = new Map();
  }

  // ------------------------------------------------------------------ Welt setzen
  // st: { W, H, terrain, variant, [owner, structAt, mark, fire, structs, units, animals, cities, kingdoms] }
  Renderer.prototype.setWorld = function (st, cam) {
    this.st = st;
    const W = st.W, H = st.H;
    this.cw = Math.ceil(W / CH); this.chh = Math.ceil(H / CH);
    this.chunks = [];
    for (let cy = 0; cy < this.chh; cy++) for (let cx = 0; cx < this.cw; cx++) {
      this.chunks.push({ cx: cx, cy: cy, ground: null, decor: null, terr: null, built: false, decorDirty: true, terrDirty: true, terrEmpty: true });
    }
    this.path = new Uint8Array(W * H);
    this.traffic = new Uint16Array(W * H);
    this.kingTile = new Int16Array(W * H).fill(-1);
    this.decorSig = new Int16Array(W * H);
    for (let i = 0; i < W * H; i++) this.decorSig[i] = st.structAt && st.structAt[i] >= 0 ? -2 : st.terrain[i];
    this.groundDirty.clear();
    this.fx.length = 0;
    this.labelCache.clear();
    this.buildMini();
    this.queueAll(cam);
  };

  // Kleinbild 1 px je Kachel (Platzhalter, solange Blöcke fehlen; auch für die Minikarte)
  Renderer.prototype.buildMini = function () {
    const st = this.st, W = st.W, H = st.H;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const img = c.createImageData(W, H), d = img.data;
    const cols = WW.TERRAIN.map(t => hexRgb(this.S.groundColor(t.id)));
    for (let i = 0; i < W * H; i++) { const col = cols[st.terrain[i]] || cols[3]; d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255; }
    c.putImageData(img, 0, 0);
    this.mini = cv; this.miniCtx = c; this.miniCols = cols;
  };
  Renderer.prototype.updateMiniTile = function (i) {
    const st = this.st, col = this.miniCols[st.terrain[i]] || this.miniCols[3];
    this.miniCtx.fillStyle = 'rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')';
    this.miniCtx.fillRect(i % st.W, (i / st.W) | 0, 1, 1);
  };

  Renderer.prototype.queueAll = function (cam) {
    const self = this;
    this.buildQueue = this.chunks.filter(c => !c.built);
    if (cam) {
      const fx = cam.x / CPX, fy = cam.y / CPX;
      this.buildQueue.sort((a, b) => Math.hypot(a.cx + 0.5 - fx, a.cy + 0.5 - fy) - Math.hypot(b.cx + 0.5 - fx, b.cy + 0.5 - fy));
    }
    void self;
  };

  // ------------------------------------------------------------------ Boden-Blöcke
  Renderer.prototype.chunkAt = function (tx, ty) { return this.chunks[((ty / CH) | 0) * this.cw + ((tx / CH) | 0)]; };

  Renderer.prototype.drawGroundTile = function (g, x, y) {
    const st = this.st, W = st.W, H = st.H, i = y * W + x, t = st.terrain;
    this.S.drawGround(g, x * 8, y * 8, t[i], st.variant ? st.variant[i] : 0,
      y > 0 ? t[i - W] : -1, x < W - 1 ? t[i + 1] : -1, y < H - 1 ? t[i + W] : -1, x > 0 ? t[i - 1] : -1);
    if (this.path[i]) this.S.drawPath(g, x * 8, y * 8, this.pathMask(x, y));
    if (st.fallout && st.fallout[i] && this.S.has('t_fallout')) this.S.drawFast(g, 't_fallout', x * 8, y * 8, 0, false);
    const m = st.mark ? st.mark[i] : 0;
    if (m) this.S.drawFast(g, m >= 100 ? 't_crater' : 't_scorched', x * 8, y * 8, 0, false);
  };

  Renderer.prototype.pathMask = function (x, y) {
    const W = this.st.W, H = this.st.H, p = this.path, i = y * W + x;
    return (y > 0 && p[i - W] ? 1 : 0) | (x < W - 1 && p[i + 1] ? 2 : 0) | (y < H - 1 && p[i + W] ? 4 : 0) | (x > 0 && p[i - 1] ? 8 : 0);
  };

  Renderer.prototype.buildChunk = function (c) {
    const st = this.st;
    if (!c.ground) { c.ground = document.createElement('canvas'); c.ground.width = CPX; c.ground.height = CPX; }
    const g = c.ground.getContext('2d');
    g.setTransform(1, 0, 0, 1, -c.cx * CPX, -c.cy * CPX);
    const x1 = Math.min(st.W, (c.cx + 1) * CH), y1 = Math.min(st.H, (c.cy + 1) * CH);
    for (let y = c.cy * CH; y < y1; y++) for (let x = c.cx * CH; x < x1; x++) this.drawGroundTile(g, x, y);
    c.built = true;
    c.decorDirty = true;
  };

  // Deko-Block für die weite Ansicht: Deko und Bauwerke des Blocks, zeilenweise, in ein Canvas
  const DL = 8, DR = 24;
  Renderer.prototype.buildDecor = function (c) {
    const st = this.st, W = st.W, S = this.S;
    if (!c.decor) { c.decor = document.createElement('canvas'); c.decor.width = CPX + DL + DR; c.decor.height = CPX + DECOR_TOP; }
    const g = c.decor.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.decor.width, c.decor.height);
    g.setTransform(1, 0, 0, 1, -c.cx * CPX + DL, -c.cy * CPX + DECOR_TOP);
    const x0 = c.cx * CH, y0 = c.cy * CH;
    const x1 = Math.min(st.W, x0 + CH), y1 = Math.min(st.H, y0 + CH);
    // Bauwerke, deren Anker (links, unterste Zeile) im Block liegt
    const rows = [];
    if (st.structs) {
      const cityK = this.cityKingdoms();
      for (const s of st.structs) {
        if (s.dead) continue;
        const by = s.y + s.h - 1;
        if (s.x < x0 || s.x >= x1 || by < y0 || by >= y1) continue;
        (rows[by - y0] || (rows[by - y0] = [])).push(s);
      }
      this._cityKTmp = cityK;
    }
    const bars = [];
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const d = this.decorAt(y * W + x);
        if (d) S.drawFast(g, d.key, x * 8 + d.dx, y * 8 + d.dy, 0, false);
      }
      const ls = rows[y - y0];
      if (ls) { ls.sort((p, q) => p.x - q.x); for (const s of ls) this.drawStruct(g, s, this._cityKTmp, false, bars); }
    }
    c.decorDirty = false;
    c.decorT = this.time;
  };

  // Stadt-ID -> Reich (für Teamfarben)
  Renderer.prototype.cityKingdoms = function () {
    const st = this.st, kings = new Map(), m = new Map();
    if (st.kingdoms) for (const k of st.kingdoms) kings.set(k.id, k);
    if (st.cities) for (const c of st.cities) m.set(c.id, kings.get(c.kingdomId));
    return m;
  };

  Renderer.prototype.decorAt = function (i) {
    const st = this.st;
    if (st.structAt && st.structAt[i] >= 0) return null;
    if (this.path[i]) return null;
    return this.S.decorFor(st.terrain[i], st.variant ? st.variant[i] : 0);
  };

  // Gebietstönung: Reich je Kachel aus owner → Stadt → Reich
  Renderer.prototype.scanTerritory = function () {
    const st = this.st;
    if (!st.owner || !st.cities) return;
    const W = st.W, H = st.H, N = W * H;
    const cityKing = new Map();
    const kingColor = new Map();
    for (const k of st.kingdoms) kingColor.set(k.id, k.colorIndex | 0);
    for (const c of st.cities) cityKing.set(c.id, kingColor.has(c.kingdomId) ? c.kingdomId : -1);
    this.kingColor = kingColor;
    const kt = this.kingTile;
    const dirtyChunks = new Set();
    for (let i = 0; i < N; i++) {
      const o = st.owner[i];
      const k = o >= 0 ? (cityKing.has(o) ? cityKing.get(o) : -1) : -1;
      if (kt[i] !== k) {
        kt[i] = k;
        const x = i % W, y = (i / W) | 0;
        dirtyChunks.add(this.chunkAt(x, y));
        if (x % CH === 0 && x > 0) dirtyChunks.add(this.chunkAt(x - 1, y));
        if (x % CH === CH - 1 && x < W - 1) dirtyChunks.add(this.chunkAt(x + 1, y));
        if (y % CH === 0 && y > 0) dirtyChunks.add(this.chunkAt(x, y - 1));
        if (y % CH === CH - 1 && y < H - 1) dirtyChunks.add(this.chunkAt(x, y + 1));
      }
    }
    // Farbwechsel eines Reiches (z. B. neue Farbe) ebenfalls erkennen
    const sig = Array.from(kingColor.entries()).join(';');
    if (sig !== this.kingSig) { this.kingSig = sig; for (const c of this.chunks) c.terrDirty = true; }
    for (const c of dirtyChunks) if (c) c.terrDirty = true;
  };

  Renderer.prototype.buildTerr = function (c) {
    const st = this.st, W = st.W, H = st.H, kt = this.kingTile;
    const x0 = c.cx * CH, y0 = c.cy * CH, x1 = Math.min(W, x0 + CH), y1 = Math.min(H, y0 + CH);
    let any = false;
    for (let y = y0; y < y1 && !any; y++) for (let x = x0; x < x1; x++) if (kt[y * W + x] >= 0) { any = true; break; }
    c.terrDirty = false;
    c.terrEmpty = !any;
    if (!any) return;
    if (!c.terr) { c.terr = document.createElement('canvas'); c.terr.width = CPX; c.terr.height = CPX; }
    const g = c.terr.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, CPX, CPX);
    const kc = this.kingColor || new Map();
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = y * W + x, k = kt[i];
      if (k < 0) continue;
      const tc = this.teamCss[kc.get(k) | 0] || this.teamCss[0];
      const px = (x - x0) * 8, py = (y - y0) * 8;
      g.fillStyle = 'rgba(' + tc.rgb[0] + ',' + tc.rgb[1] + ',' + tc.rgb[2] + ',0.16)';
      g.fillRect(px, py, 8, 8);
      // Grenzlinie innen an Kanten zu fremdem Gebiet
      const n = y > 0 ? kt[i - W] : -2, e = x < W - 1 ? kt[i + 1] : -2, s = y < H - 1 ? kt[i + W] : -2, w = x > 0 ? kt[i - 1] : -2;
      if (n !== k || e !== k || s !== k || w !== k) {
        g.fillStyle = tc.main;
        if (n !== k) g.fillRect(px, py, 8, 1);
        if (s !== k) g.fillRect(px, py + 7, 8, 1);
        if (w !== k) g.fillRect(px, py, 1, 8);
        if (e !== k) g.fillRect(px + 7, py, 1, 8);
        g.fillStyle = 'rgba(' + tc.rgb[0] + ',' + tc.rgb[1] + ',' + tc.rgb[2] + ',0.35)';
        if (n !== k) g.fillRect(px, py + 1, 8, 1);
        if (s !== k) g.fillRect(px, py + 6, 8, 1);
        if (w !== k) g.fillRect(px + 1, py, 1, 8);
        if (e !== k) g.fillRect(px + 6, py, 1, 8);
      }
    }
  };

  // schmutzige Kacheln (Gelände/Bauwerk/Brand): Kachel + vier Nachbarn neu
  Renderer.prototype.markTiles = function (list) {
    if (!this.st || !list) return;
    const W = this.st.W, H = this.st.H, N = W * H;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      if (!(i >= 0 && i < N)) continue;
      const x = i % W, y = (i / W) | 0;
      this.groundDirty.add(i);
      if (y > 0) this.groundDirty.add(i - W);
      if (y < H - 1) this.groundDirty.add(i + W);
      if (x > 0) this.groundDirty.add(i - 1);
      if (x < W - 1) this.groundDirty.add(i + 1);
    }
  };
  Renderer.prototype.markAll = function () {
    for (const c of this.chunks) { c.built = false; c.decorDirty = true; c.terrDirty = true; }
    this.buildMini();
    this.queueAll(this._lastCam);
  };

  Renderer.prototype.flushDirty = function () {
    if (!this.groundDirty.size) return;
    const st = this.st, W = st.W;
    const touched = new Set();
    for (const i of this.groundDirty) {
      const x = i % W, y = (i / W) | 0;
      const c = this.chunkAt(x, y);
      this.updateMiniTile(i);
      if (!c.built) continue;
      const g = c.ground.getContext('2d');
      g.setTransform(1, 0, 0, 1, -c.cx * CPX, -c.cy * CPX);
      this.drawGroundTile(g, x, y);
      touched.add(c);
      // Deko-Block nur neu, wenn sich die Deko dieser Kachel ändern kann
      const sig = st.structAt && st.structAt[i] >= 0 ? -2 : (this.path[i] ? -3 : st.terrain[i]);
      if (this.decorSig[i] !== sig) { this.decorSig[i] = sig; c._decorTouched = true; }
    }
    for (const c of touched) c.decorDirty = c.decorDirty || c._decorTouched;
    for (const c of touched) c._decorTouched = false;
    this.groundDirty.clear();
  };

  // ------------------------------------------------------------------ Trampelpfade (nur Darstellung)
  // pro Sim-Schritt aufrufen: laufende Einheiten treten Pfade aus
  Renderer.prototype.trample = function (units) {
    const st = this.st;
    if (!st || !st.structAt) return;
    const W = st.W, H = st.H, tr = this.traffic, LUT = WW.TERRAIN_LUT;
    for (let k = 0; k < units.length; k++) {
      const u = units[k];
      if (!u.moving) continue;
      const x = u.x | 0, y = u.y | 0;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (this.path[i]) continue;
      if (++tr[i] > 260) {
        const t = st.terrain[i];
        if (LUT.water[t] || !LUT.build[t] || st.structAt[i] >= 0) { tr[i] = 0; continue; }
        this.path[i] = 1;
        this.markTiles([i]);
      }
    }
  };
  // Pfade wachsen zu, wenn keiner mehr läuft; Bauwerke löschen Pfade darunter
  Renderer.prototype.decayPaths = function () {
    const st = this.st;
    if (!st || !st.structAt) return;
    const tr = this.traffic, p = this.path, N = tr.length, dirty = [];
    for (let i = 0; i < N; i++) {
      if (tr[i]) tr[i] = tr[i] > 40 ? tr[i] - 40 : 0;
      if (p[i] && (st.structAt[i] >= 0 || WW.TERRAIN_LUT.water[st.terrain[i]] || (!tr[i] && ((i * 2654435761) >>> 28) === 0))) { p[i] = 0; dirty.push(i); }
    }
    if (dirty.length) this.markTiles(dirty);
  };

  // ------------------------------------------------------------------ Effekte
  const FX_DUR = { flash: 0.5, shockwave: 1.0, mushroom: 3.2, tracer: 0.18, laser: 0.6, orbitallaser: 0.6, blackhole: 4, spark: 0.4, explosion: 0.8, tornado: 2, crack: 1.2, lavaglow: 1.5, rock: 0.8, breath: 0.8, arrow: 0.35, bolt: 0.45, meteor: 0.9, smoke: 1.4, rain: 1.8, plague: 1.6, sparkle: 1.2, restyle: 1.4,
    govchange: 1.8, dust: 0.9, hit: 0.3, splash: 0.6, poof: 0.6 };
  Renderer.prototype.addFx = function (list) {
    for (const f of list) {
      if (this.fx.length > 500) break;
      const o = Object.assign({}, f);
      o.t = 0; o.d = (typeof f.dur === 'number' && f.dur > 0) ? f.dur : (FX_DUR[f.type] || 0.8);
      o.seed = (Math.random() * 1e6) | 0;
      this.fx.push(o);
      if (f.type === 'bolt' || f.type === 'meteor') this.flash = Math.max(this.flash || 0, f.type === 'bolt' ? 0.35 : 0.25);
      if (f.type === 'flash') this.flash = Math.max(this.flash || 0, 0.9);
      let sh = f.type === 'meteor' ? 0.35 : 0;
      if (f.type === 'mushroom' || f.type === 'shockwave') sh = 0.8;
      if (f.type === 'explosion') sh = Math.min(0.6, 0.12 * (f.r || 1));
      if (sh && !this.reduced) this.shake = Math.max(this.shake || 0, sh);
    }
  };

  // Flugzeuge über allem: Schatten am Boden, Rumpf um angle gedreht (oder Richtungs-Frame)
  Renderer.prototype.drawAircraft = function (g, list) {
    const S = this.S;
    for (const a of list) {
      if (!a || !(a.x >= 0)) continue;
      const kind = a.kind || 'bomber', px = a.x * 8, py = a.y * 8, alt = a.alt != null ? a.alt * 8 : 22;
      const ang = +a.angle || 0;
      const sk = 'fx_' + kind + '_shadow';
      const draw = (key, x, y) => {
        const inf = S.info(key);
        if (!inf) return false;
        g.save(); g.translate(x, y); g.rotate(ang);
        S.drawFast(g, key, -Math.round(inf.w / 2) - inf.ox, -Math.round(inf.h / 2) - inf.oy, 0, false);
        g.restore(); return true;
      };
      if (!draw(sk, px + 4, py + 4)) { g.fillStyle = 'rgba(10,26,33,0.3)'; g.beginPath(); g.ellipse(px + 4, py + 4, 6, 3, ang, 0, Math.PI * 2); g.fill(); }
      const frames = this.fxFrames(kind);
      const key = S.has('fx_' + kind) ? 'fx_' + kind : (frames.length ? frames[((this.time * 10) | 0) % frames.length] : null);
      if (!key || !draw(key, px, py - alt)) { g.fillStyle = '#58637a'; g.save(); g.translate(px, py - alt); g.rotate(ang); g.fillRect(-6, -2, 12, 4); g.fillRect(-2, -7, 4, 14); g.restore(); }
    }
  };

  Renderer.prototype.fxFrames = function (type) {
    const c = this._fxF || (this._fxF = {});
    if (c[type]) return c[type];
    const out = [];
    for (let n = 0; n < 12 && this.S.has('fx_' + type + '_' + n); n++) out.push('fx_' + type + '_' + n);
    if (!out.length && this.S.has('fx_' + type)) out.push('fx_' + type);
    return (c[type] = out);
  };

  // Bauwerks-Variante 0..255 (alte Welten ohne Feld: aus der ID)
  function varOf(s) { return s.variant != null ? s.variant & 255 : (Math.imul(s.id | 0, 2654435761) >>> 24) & 255; }

  function rnd(seed, k) { let h = (seed * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  Renderer.prototype.drawFx = function (g, dt) {
    const S = this.S;
    const out = [];
    for (const f of this.fx) {
      f.t += dt;
      if (f.t >= f.d) continue;
      out.push(f);
      const k = f.t / f.d, px = f.x * 8, py = f.y * 8;
      switch (f.type) {
        case 'arrow': {
          const x = px + ((f.x2 * 8) - px) * k, y = py + ((f.y2 * 8) - py) * k - Math.sin(k * Math.PI) * 6;
          const ang = Math.atan2((f.y2 - f.y) * 8, (f.x2 - f.x) * 8);
          g.save(); g.translate(x, y); g.rotate(ang); S.drawFast(g, 'fx_arrow', -4, -4, 0, false); g.restore();
          break;
        }
        case 'bolt':
          g.globalAlpha = k < 0.5 ? 1 : (1 - k) * 2;
          S.drawFast(g, 'fx_bolt', px - 4, py - 4, 0, (f.seed & 1) === 1);
          g.globalAlpha = 1;
          break;
        case 'meteor': {
          if (k < 0.45) {
            const q = k / 0.45;
            S.drawFast(g, 'fx_meteor', px - 4 + (1 - q) * 60, py - 4 - (1 - q) * 90, 0, false);
          } else {
            const q = (k - 0.45) / 0.55;
            for (let j = 0; j < 7; j++) {
              const a = j / 7 * Math.PI * 2, r = 4 + q * 14;
              g.globalAlpha = 1 - q;
              S.drawFast(g, j & 1 ? 'fx_smoke_0' : 'fx_fire_' + (j % 3), px - 4 + Math.cos(a) * r, py - 4 + Math.sin(a) * r * 0.7 - q * 6, 0, false);
            }
            g.globalAlpha = 1;
          }
          break;
        }
        case 'smoke': case 'dust': case 'poof': {
          const n = f.type === 'smoke' ? 3 : 2;
          for (let j = 0; j < n; j++) {
            const kk = Math.min(1, k + j * 0.15);
            g.globalAlpha = (1 - kk) * (f.type === 'dust' ? 0.7 : 0.9);
            S.drawFast(g, 'fx_smoke_' + (j & 1), px - 4 + (rnd(f.seed, j) - 0.5) * 8, py - 6 - kk * 14, 0, false);
          }
          g.globalAlpha = 1;
          break;
        }
        case 'splash':
          g.fillStyle = '#c4ecfa';
          for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2; g.fillRect(px + Math.cos(a) * k * 6, py - 2 + Math.sin(a) * k * 3 - Math.sin(k * Math.PI) * 4, 1, 1); }
          break;
        case 'rain': {
          const r = (f.r || 5) * 8, n = 40;
          for (let j = 0; j < n; j++) {
            const ox = (rnd(f.seed, j) - 0.5) * 2 * r, ph = (rnd(f.seed, j + 99) + k * 3) % 1;
            const oy = (rnd(f.seed, j + 7) - 0.5) * 1.2 * r;
            g.globalAlpha = 1 - k * 0.7;
            S.drawFast(g, 'fx_raindrop', px + ox - 4, py + oy - 30 + ph * 30, 0, false);
          }
          g.globalAlpha = 1;
          break;
        }
        case 'plague': {
          const r = (f.r || 4) * 8;
          for (let j = 0; j < 10; j++) {
            g.globalAlpha = Math.sin(k * Math.PI) * 0.8;
            S.drawFast(g, 'fx_plague', px + (rnd(f.seed, j) - 0.5) * 2 * r - 4, py + (rnd(f.seed, j + 5) - 0.5) * 1.4 * r - 4 - k * 6, 0, false);
          }
          g.globalAlpha = 1;
          break;
        }
        case 'sparkle': case 'restyle': case 'govchange': case 'hit': case 'spark': {
          const r = (f.r || (f.type === 'hit' ? 0.4 : 2.2)) * 8, n = f.type === 'hit' ? 2 : (f.type === 'sparkle' ? 14 : 18);
          for (let j = 0; j < n; j++) {
            const ph = (k * 2 + rnd(f.seed, j)) % 1;
            g.globalAlpha = Math.sin(Math.min(1, k * 1.2) * Math.PI);
            const rr = f.type === 'govchange' ? r * (0.3 + k) : r;
            S.drawFast(g, 'fx_sparkle_' + (ph < 0.5 ? 0 : 1), px - 4 + (rnd(f.seed, j) - 0.5) * 2 * rr, py - 6 + (rnd(f.seed, j + 3) - 0.5) * 1.4 * rr - k * 4, 0, false);
          }
          g.globalAlpha = 1;
          break;
        }
        case 'shockwave': {
          const r = (f.r || 6) * 8 * (0.15 + 0.85 * k);
          g.strokeStyle = 'rgba(255,250,230,' + (0.9 * (1 - k)) + ')'; g.lineWidth = 3;
          g.beginPath(); g.ellipse(px, py, r, r * 0.75, 0, 0, Math.PI * 2); g.stroke();
          g.strokeStyle = 'rgba(242,181,65,' + (0.6 * (1 - k)) + ')'; g.lineWidth = 1;
          g.beginPath(); g.ellipse(px, py, r * 0.9, r * 0.68, 0, 0, Math.PI * 2); g.stroke();
          break;
        }
        case 'flash':
          break;
        case 'tracer': {
          g.strokeStyle = 'rgba(255,230,120,' + (1 - k) + ')'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(px, py); g.lineTo(f.x2 * 8, f.y2 * 8); g.stroke();
          break;
        }
        case 'laser': case 'orbitallaser': {
          const w = 3 + Math.sin(k * Math.PI) * 3;
          g.globalAlpha = 1 - k * 0.8;
          g.fillStyle = '#ff7ad9'; g.fillRect(px - w, py - 400, w * 2, 400);
          g.fillStyle = '#fff4fb'; g.fillRect(px - w / 3, py - 400, w * 2 / 3, 400);
          g.beginPath(); g.ellipse(px, py, w * 2.2, w * 1.4, 0, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
          break;
        }
        case 'blackhole': {
          const r = (f.r || 3) * 8 * Math.sin(Math.min(1, k * 1.3) * Math.PI * 0.5) * (k > 0.85 ? (1 - k) / 0.15 : 1);
          g.fillStyle = 'rgba(20,8,32,0.92)'; g.beginPath(); g.arc(px, py, r * 0.6, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(189,138,240,0.8)'; g.lineWidth = 2;
          for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(px, py, r * (0.7 + j * 0.15), this.time * (3 - j) + j, this.time * (3 - j) + j + 2.2); g.stroke(); }
          break;
        }
        case 'mushroom': case 'explosion': {
          let fr = this.fxFrames(f.type === 'explosion' && (f.r || 1) >= 3 && this.fxFrames('explosion_big').length ? 'explosion_big' : f.type);
          const sc = f.type === 'explosion' ? Math.max(1, Math.min(4, (f.r || 1) / (this.fxFrames('explosion_big').length && (f.r || 1) >= 3 ? 3 : 1.2))) : Math.max(1, (f.r || 1) / 4);
          if (!fr.length) {   // Ersatz: Feuerball aus vorhandenen Sprites
            const r = (f.r || 1.5) * 8 * (0.4 + k);
            g.globalAlpha = 1 - k;
            for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2; S.drawFast(g, 'fx_fire_' + (j % 3), px - 4 + Math.cos(a) * r * 0.6, py - 4 + Math.sin(a) * r * 0.45 - k * 6, 0, false); }
            g.globalAlpha = 1;
            break;
          }
          const key = fr[Math.min(fr.length - 1, (k * fr.length) | 0)], inf = S.info(key);
          g.save(); g.translate(px, py); g.scale(sc, sc);
          g.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
          S.drawFast(g, key, -Math.round((inf ? inf.w : 8) / 2) - (inf ? inf.ox : 0), -(inf ? inf.h : 8) - (inf ? inf.oy : 0) + 4, 0, false);
          g.restore();
          break;
        }
        default: {
          // unbekannte Effekte: Sprites fx_<typ>_<n> der Reihe nach, sonst nichts
          const fr = this.fxFrames(f.type);
          if (!fr.length) break;
          g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          S.drawFast(g, fr[Math.min(fr.length - 1, (k * fr.length) | 0)], px - 4, py - 4, 0, false);
          g.globalAlpha = 1;
        }
      }
    }
    this.fx = out;
  };

  // ------------------------------------------------------------------ Schlüssel
  Renderer.prototype.structKey = function (s, gov) {
    const S = this.S;
    const style = s.style || gov || 'tribe';
    if (!s.built) return s.w >= 3 ? 's_site_3' : (s.w >= 2 ? 's_site_2' : 's_site');
    switch (s.type) {
      case 'center': {
        // Ausbaustufen: 0 Lager, 1 Dorfhalle, 2 (oder fehlend) Regierungssitz
        if (s.stage === 0) { const k = this.pickVar(S.campKey, ['s_camp_a', 's_camp_b'], s); if (k) return k; }
        if (s.stage === 1) { const k = this.pickVar(S.hallKey, ['s_hall_a', 's_hall_b'], s); if (k) return k; }
        return 's_center_' + style;
      }
      case 'house': {
        if (s.level === 0) { const k = this.pickVar(S.tentKey, ['s_tent_a', 's_tent_b', 's_tent_c', 's_tent_d'], s); if (k) return k; }
        return S.houseKey(style, Math.max(1, s.level | 0), varOf(s));
      }
      case 'field': return 's_field_' + Math.max(0, Math.min(3, s.growth | 0));
      case 'monument': return 's_monument_' + style;
      case 'wall': {
        const st = this.st;
        if (st.terrain[s.y * st.W + s.x] === WW.T.RIVER && style !== 'anarchy') return S.waterWallKey(style, s.level, (s.mask & 10) ? 'h' : 'v');
        return S.wallKey(style, s.level, s.mask);
      }
      case 'gate':
        if (style === 'anarchy') return S.wallKey(style, s.level, s.mask);
        return S.gateKey(style, s.level, s.orient === 'v' ? 'v' : 'h');
      case 'tower': return S.towerKey(style, s.level) || S.wallKey(style, s.level, s.mask);
      case 'lair': return this.S.has('s_lair_' + s.kind) ? 's_lair_' + s.kind : 's_ruin';
      case 'ruin': return s.w >= 3 ? 's_ruin_3' : (s.w >= 2 ? 's_ruin_2' : 's_ruin');
      default: return this.S.has('s_' + s.type) ? 's_' + s.type : (s.w >= 2 ? 's_ruin_2' : 's_ruin');
    }
  };

  // Figuren-Schlüssel: u_<volk>_<rolle>, sonst u_<rolle> (Banditen, Rammen …), sonst Mensch, sonst Bauer
  // Sprite über Helfer (Schlüssel-Funktion) oder Liste, gewählt nach variant; null wenn nichts existiert
  Renderer.prototype.pickVar = function (fn, list, s) {
    const S = this.S, v = varOf(s);
    if (typeof fn === 'function') { try { const k = fn(v); if (k && S.has(k)) return k; } catch (e) { /* weiter */ } }
    const ok = list.filter(k => S.has(k));
    return ok.length ? ok[v % ok.length] : null;
  };

  Renderer.prototype.unitKey = function (u, gov, frame) {
    const S = this.S, race = u.race || 'human', role = u.role || 'farmer';
    const ck = this._ukCache || (this._ukCache = new Map());
    const id = race + '|' + role + '|' + gov + '|' + frame;
    let k = ck.get(id);
    if (k) return k;
    const cands = role === 'leader'
      ? (gov === 'anarchy' ? ['u_' + race + '_punk_' + frame, 'u_human_punk_' + frame] : ['u_' + race + '_leader_' + (gov || 'tribe') + '_' + frame, 'u_human_leader_' + (gov || 'tribe') + '_' + frame, 'u_human_leader_tribe_' + frame])
      : ['u_' + race + '_' + role + '_' + frame, 'u_' + role + '_' + frame, 'u_human_' + role + '_' + frame];
    k = cands.find(c => S.has(c)) || 'u_human_farmer_' + frame;
    ck.set(id, k);
    return k;
  };

  // ------------------------------------------------------------------ Bild zeichnen
  // opts: { alpha, prev (Map id->[x,y]), select, brush:{x,y,r,kind}, showNames, dt }
  Renderer.prototype.render = function (cam, opts) {
    const t0 = performance.now();
    const ctx = this.ctx, st = this.st, S = this.S;
    const cv = this.canvas;
    this._lastCam = cam;
    opts = opts || {};
    const dt = opts.dt || 0.016;
    this.time += dt;
    if (!st) { ctx.fillStyle = '#0f2a35'; ctx.fillRect(0, 0, cv.width, cv.height); return; }

    // Blöcke bauen (Zeitbudget), schmutzige Kacheln
    this.flushDirty();
    const budget = opts.firstFrames ? 40 : 7;
    const tb = performance.now();
    while (this.buildQueue.length && performance.now() - tb < budget) {
      const c = this.buildQueue.shift();
      if (!c.built) this.buildChunk(c);
    }
    this.terrScanT -= dt;
    if (st.owner && this.terrScanT <= 0) { this.scanTerritory(); this.terrScanT = 0.3; }

    const off = cam.offset();
    let s = off.s, ox = off.ox, oy = off.oy;
    if (this.shake > 0) { this.shake -= dt; const a = this.shake * 10 * cam.dpr; ox += Math.round((Math.random() - 0.5) * a); oy += Math.round((Math.random() - 0.5) * a); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.bg || (this.bg = S.groundColor(0));
    ctx.fillRect(0, 0, cv.width, cv.height);

    const vt = cam.visibleTiles(st.W, st.H, 1);
    const ntiles = (vt.x1 - vt.x0 + 1) * (vt.y1 - vt.y0 + 1);
    const low = ntiles > LOW_DETAIL_TILES;

    // (1) Boden
    const cx0 = Math.max(0, (vt.x0 / CH) | 0), cx1 = Math.min(this.cw - 1, (vt.x1 / CH) | 0);
    const cy0 = Math.max(0, (vt.y0 / CH) | 0), cy1 = Math.min(this.chh - 1, ((vt.y1) / CH) | 0);
    let missing = false;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (!this.chunks[cy * this.cw + cx].built) missing = true;
    if (missing) {
      // Platzhalter: Kleinbild hochskaliert, sichtbare Blöcke zuerst bauen
      ctx.drawImage(this.mini, 0, 0, st.W, st.H, ox, oy, Math.round(st.W * 8 * s), Math.round(st.H * 8 * s));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks[cy * this.cw + cx];
        if (!c.built && performance.now() - tb < budget + 6) this.buildChunk(c);
      }
    }
    const rx = (wx) => Math.round(ox + wx * s), ry = (wy) => Math.round(oy + wy * s);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = this.chunks[cy * this.cw + cx];
      if (!c.built) continue;
      const X = cx * CPX, Y = cy * CPX;
      const w = Math.min(CPX, st.W * 8 - X), h = Math.min(CPX, st.H * 8 - Y);
      const dx = rx(X), dy = ry(Y);
      ctx.drawImage(c.ground, 0, 0, w, h, dx, dy, rx(X + w) - dx, ry(Y + h) - dy);
    }
    // (2) Gebietstönung
    if (st.owner && opts.territory !== false) {
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks[cy * this.cw + cx];
        if (c.terrDirty) this.buildTerr(c);
        if (c.terrEmpty) continue;
        const X = cx * CPX, Y = cy * CPX;
        const w = Math.min(CPX, st.W * 8 - X), h = Math.min(CPX, st.H * 8 - Y);
        const dx = rx(X), dy = ry(Y);
        ctx.drawImage(c.terr, 0, 0, w, h, dx, dy, rx(X + w) - dx, ry(Y + h) - dy);
      }
    }

    // (3) Deko, Bauwerke, Figuren
    let refreshed = false;
    if (low) {
      const dcy1 = Math.min(this.chh - 1, ((vt.y1 + 5) / CH) | 0);
      const dcx0 = Math.max(0, ((vt.x0 - 3) / CH) | 0);
      for (let cy = cy0; cy <= dcy1; cy++) for (let cx = dcx0; cx <= cx1; cx++) {
        const c = this.chunks[cy * this.cw + cx];
        if (!c.built) continue;
        if (c.decorDirty || c.decorT == null) this.buildDecor(c);
        else if (!refreshed && this.time - c.decorT > 0.8) { this.buildDecor(c); refreshed = true; }
        const X = cx * CPX - DL, Y = cy * CPX - DECOR_TOP;
        const dx = rx(X), dy = ry(Y);
        ctx.drawImage(c.decor, dx, dy, rx(X + CPX + DL + DR) - dx, ry(Y + CPX + DECOR_TOP) - dy);
      }
    }
    ctx.setTransform(s, 0, 0, s, ox, oy);
    let drawn = low && (opts.scale || 1) < 0.9 ? this.drawDots(ctx, vt, opts) : this.drawObjects(ctx, vt, low, opts);

    // Feuer auf Kacheln
    if (st.fire && st.fireCount > 0) {
      const fr = ((this.time * 8) | 0) % 3;
      for (let y = vt.y0; y <= vt.y1; y++) for (let x = vt.x0; x <= vt.x1; x++) {
        const f = st.fire[y * st.W + x];
        if (f) S.drawFast(ctx, 'fx_fire_' + ((fr + x + y) % 3), x * 8, y * 8 - 2, 0, ((x + y) & 1) === 1);
      }
    }

    // (4) Effekte, Flugzeuge
    this.drawFx(ctx, dt);
    if (st.aircraft && st.aircraft.length) this.drawAircraft(ctx, st.aircraft);

    // (5) Auswahl und Pinsel
    if (opts.select) this.drawSelection(ctx, opts.select, opts);
    if (opts.brush) this.drawBrush(ctx, opts.brush);
    if (opts.held) this.drawHeld(ctx, opts.held);
    if (st.plots && st.plots.length) this.drawPlots(ctx, vt);

    // Stadtnamen in Bildschirmpixeln
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (st.cities && opts.showNames !== false) this.drawCityLabels(ctx, cam, opts);
    if (this.flash > 0) {
      ctx.fillStyle = 'rgba(255,250,230,' + Math.min(0.6, this.flash) + ')';
      ctx.fillRect(0, 0, cv.width, cv.height);
      this.flash -= dt;
    }
    this.stats.drawn = drawn;
    this.stats.low = low;
    this.stats.frameMs = this.stats.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  };

  // Deko, Bauwerke und Figuren zeilenweise von oben nach unten
  Renderer.prototype.drawObjects = function (ctx, vt, low, opts) {
    const st = this.st, S = this.S, W = st.W;
    const y0 = vt.y0, y1 = vt.y1, nrows = y1 - y0 + 1;
    const rowU = this.rowU, rowS = this.rowS;
    for (let r = 0; r < nrows; r++) { (rowU[r] || (rowU[r] = [])).length = 0; (rowS[r] || (rowS[r] = [])).length = 0; }
    let drawn = 0;
    const kings = this._kings || (this._kings = new Map());
    kings.clear();
    if (st.kingdoms) for (const k of st.kingdoms) kings.set(k.id, k);
    const cityK = this._cityK || (this._cityK = new Map());
    cityK.clear();
    if (st.cities) for (const c of st.cities) cityK.set(c.id, kings.get(c.kingdomId));

    // Bauwerke nach unterster Zeile einsortieren (weite Ansicht: stecken im Deko-Block)
    if (st.structs && !low) {
      const sx0 = vt.x0 - 3, sx1 = vt.x1 + 1;
      for (const s of st.structs) {
        if (s.dead) continue;
        const by = s.y + s.h - 1;
        if (by < y0 || by > y1 || s.x + s.w - 1 < sx0 || s.x > sx1) continue;
        rowS[by - y0].push(s);
      }
    }
    // Figuren und Tiere
    const prev = opts.prev, a = opts.alpha == null ? 1 : opts.alpha;
    const addU = (u, isAnimal) => {
      let x = u.x, y = u.y;
      if (prev) {
        const p = prev.get(isAnimal ? -u.id : u.id);
        if (p) { const dx = x - p[0], dy = y - p[1]; if (dx * dx + dy * dy < 4) { x = p[0] + dx * a; y = p[1] + dy * a; } }
      }
      if (x < vt.x0 - 1 || x > vt.x1 + 2 || y < y0 || y >= y1 + 1) return;
      const r = (y | 0) - y0;
      if (r < 0 || r >= nrows) return;
      rowU[r].push({ u: u, x: x, y: y, animal: isAnimal });
    };
    if (st.units) for (const u of st.units) if (!u.dead) addU(u, false);
    if (st.animals) for (const an of st.animals) if (!an.dead) addU(an, true);

    const time = this.time;
    const bubbles = [];
    const bars = [];
    const flyers = [];
    const zoomBig = opts.scale >= 2.5;
    for (let r = 0; r < nrows; r++) {
      const y = y0 + r;
      const ls = rowS[r];
      if (ls.length > 1) ls.sort((p, q) => p.x - q.x);
      // flache Bauwerke (Felder) zuerst, dann Figuren, dann Deko und hohe Bauwerke
      for (const s of ls) if (s.type === 'field') { this.drawStruct(ctx, s, cityK, zoomBig, bars); drawn++; }
      const lu = rowU[r];
      if (lu.length) {
        if (lu.length > 1) lu.sort((p, q) => p.y - q.y);
        for (const it of lu) {
          const u = it.u;
          const frame = u.moving ? (((time * 5 + (u.id & 7) * 0.37) | 0) & 1) : 0;
          const px = Math.round(it.x * 8 - 4), py = Math.round(it.y * 8 - 6);
          if (it.animal) {
            if (u.flying) { flyers.push(it); continue; }
            this.drawAnimal(ctx, u, px, py, frame);
          } else {
            const k = kings.get(u.kingdomId);
            const team = k ? k.colorIndex | 0 : 10;
            const key = this.unitKey(u, k ? k.gov : 'tribe', frame);
            S.drawFast(ctx, key, px, py, team, u.dir < 0);
            if (u.sick && (((time * 2) | 0) + u.id) & 1) { ctx.globalAlpha = 0.6; S.drawFast(ctx, 'fx_plague', px, py - 10, 0, false); ctx.globalAlpha = 1; }
            if (u.bubble && u.bubble.icon) bubbles.push({ x: px, y: py, icon: u.bubble.icon });
            if (zoomBig && u.hp < u.maxHp * 0.95 && u.maxHp > 0) bars.push({ x: px + 1, y: py - 11, w: 6, v: u.hp / u.maxHp, col: '#7ecb5a' });
          }
          drawn++;
        }
      }
      if (!low) {
        for (let x = vt.x0; x <= vt.x1; x++) {
          const d = this.decorAt(y * W + x);
          if (d) { S.drawFast(ctx, d.key, x * 8 + d.dx, y * 8 + d.dy, 0, false); drawn++; }
        }
      }
      for (const s of ls) if (s.type !== 'field') { this.drawStruct(ctx, s, cityK, zoomBig, bars); drawn++; }
    }
    // Fliegende Wesen über allem, mit Schatten am Boden
    for (const it of flyers) {
      const u = it.u, px = Math.round(it.x * 8 - 4), py = Math.round(it.y * 8 - 6);
      const frame = (((time * 5 + (u.id & 7) * 0.37) | 0) & 1);
      if (S.has('a_' + u.kind + '_shadow')) S.drawFast(ctx, 'a_' + u.kind + '_shadow', px, py, 0, u.dir < 0);
      else { ctx.fillStyle = 'rgba(10,26,33,0.3)'; ctx.fillRect(px + 1, py + 6, 6, 2); }
      this.drawAnimal(ctx, u, px, py - 14 - Math.round(Math.sin(time * 3 + u.id) * 2), frame);
    }
    // Sprechblasen über allem
    if (low) bubbles.length = 0;
    for (const b of bubbles) {
      if (!S.has('b_' + b.icon)) continue;
      S.drawFast(ctx, 'b_frame', b.x, b.y - 19, 0, false);
      S.drawFast(ctx, 'b_' + b.icon, b.x, b.y - 19, 0, false);
    }
    for (const b of bars) {
      ctx.fillStyle = '#0a1a21'; ctx.fillRect(b.x, b.y, b.w, 2);
      ctx.fillStyle = b.col; ctx.fillRect(b.x, b.y, Math.max(1, Math.round(b.w * Math.max(0, Math.min(1, b.v)))), 1);
    }
    return drawn;
  };

  // weite Ansicht: Figuren als kleine Punkte in Reichsfarbe (Tiere hell/dunkel)
  Renderer.prototype.drawDots = function (ctx, vt, opts) {
    const st = this.st;
    const kings = this._kings || (this._kings = new Map());
    kings.clear();
    if (st.kingdoms) for (const k of st.kingdoms) kings.set(k.id, k);
    const sz = Math.max(2, Math.min(4, 1.6 / (opts.scale || 1)));
    const x0 = vt.x0 - 1, x1 = vt.x1 + 2, y0 = vt.y0 - 1, y1 = vt.y1 + 2;
    const groups = this._dotGroups || (this._dotGroups = new Map());
    for (const arr of groups.values()) arr.length = 0;
    let n = 0;
    const push = (col, x, y) => { let a = groups.get(col); if (!a) groups.set(col, a = []); a.push(x, y); n++; };
    if (st.units) for (const u of st.units) {
      if (u.dead || u.x < x0 || u.x > x1 || u.y < y0 || u.y > y1) continue;
      const k = kings.get(u.kingdomId);
      push(k ? this.teamCss[k.colorIndex | 0].main : '#f3ead2', u.x, u.y);
    }
    if (st.animals) for (const a of st.animals) {
      if (a.dead || a.x < x0 || a.x > x1 || a.y < y0 || a.y > y1) continue;
      const cr = WW.CREATURES && WW.CREATURES[a.kind];
      push(cr && cr.hostile ? '#3e3150' : '#fbf7ee', a.x, a.y);
    }
    // dunkle Unterlage, dann Farbe
    ctx.fillStyle = 'rgba(10,26,33,0.85)';
    for (const arr of groups.values()) for (let i = 0; i < arr.length; i += 2) ctx.fillRect(arr[i] * 8 - sz / 2 - 0.5, arr[i + 1] * 8 - sz / 2 - 0.5, sz + 1, sz + 1);
    for (const [col, arr] of groups) {
      if (!arr.length) continue;
      ctx.fillStyle = col;
      for (let i = 0; i < arr.length; i += 2) ctx.fillRect(arr[i] * 8 - sz / 2, arr[i + 1] * 8 - sz / 2, sz, sz);
    }
    return n;
  };

  Renderer.prototype.drawAnimal = function (ctx, a, px, py, frame) {
    const S = this.S, key = 'a_' + a.kind + '_' + frame;
    if (a.ghost) ctx.globalAlpha = 0.55;
    if (S.has(key)) S.drawFast(ctx, key, px, py, 0, a.dir < 0);
    else if (S.has('a_' + a.kind + '_0')) S.drawFast(ctx, 'a_' + a.kind + '_0', px, py, 0, a.dir < 0);
    else { ctx.fillStyle = '#0a1a21'; ctx.fillRect(px + 1, py + 2, 6, 5); ctx.fillStyle = '#fbf7ee'; ctx.fillRect(px + 2, py + 3, 4, 3); }
    ctx.globalAlpha = 1;
  };

  Renderer.prototype.drawStruct = function (ctx, s, cityK, zoomBig, bars) {
    const S = this.S;
    const k = cityK.get(s.cityId);
    const gov = k ? k.gov : 'tribe';
    const team = k ? k.colorIndex | 0 : 10;
    const key = this.structKey(s, gov);
    const inf = S.info(key);
    const fh = inf ? inf.fh : s.h;
    const px = s.x * 8, py = (s.y + s.h - fh) * 8;
    S.drawFast(ctx, key, px, py, team, false);
    // Lagerfeuer: Feuer-Frames der Lager-Sprites, sonst fx_fire in der Mitte
    if (s.type === 'center' && s.stage === 0 && s.built !== false && key.indexOf('s_camp') === 0) {
      const fr = ((this.time * 6) | 0) % 3;
      if (S.has(key + '_1')) S.drawFast(ctx, key + '_' + fr % 2, px, py, team, false);
      else S.drawFast(ctx, 'fx_fire_' + fr, (s.x + s.w / 2) * 8 - 4, (s.y + s.h / 2) * 8 - 6, 0, false);
    }
    // laufender Ausbau: Gerüst über dem bestehenden Gebäude
    if (s.upgrading && s.built !== false) {
      const sk = s.w >= 3 ? 's_scaffold_3' : (s.w >= 2 ? 's_scaffold_2' : 's_scaffold');
      const sc = S.has(sk) ? sk : (s.w >= 3 ? 's_site_3' : s.w >= 2 ? 's_site_2' : 's_site');
      const si = S.info(sc);
      ctx.globalAlpha = S.has(sk) ? 1 : 0.85;
      S.drawFast(ctx, sc, px, (s.y + s.h - (si ? si.fh : s.h)) * 8, 0, false);
      ctx.globalAlpha = 1;
      if (zoomBig) bars.push({ x: px, y: (s.y + s.h) * 8 - 2, w: s.w * 8, v: s.progress || 0, col: '#f2b541' });
    }
    if (!zoomBig) return;
    if (s.upgrading) return;
    if (!s.built && s.progress > 0) bars.push({ x: px, y: (s.y + s.h) * 8 - 2, w: s.w * 8, v: s.progress, col: '#f2b541' });
    else if (s.built && s.hp < s.maxHp * 0.98 && s.type !== 'field' && s.type !== 'ruin') bars.push({ x: px, y: (s.y + s.h) * 8 - 2, w: s.w * 8, v: s.hp / s.maxHp, col: '#e2543d' });
  };

  // Figur an der Göttlichen Hand: hängt am Zeiger, zappelt
  Renderer.prototype.drawHeld = function (ctx, h) {
    const u = h.obj, px = Math.round(h.x * 8 - 4), py = Math.round(h.y * 8 - 16);
    ctx.fillStyle = 'rgba(10,26,33,0.3)'; ctx.fillRect(px + 1, py + 18, 6, 2);
    const frame = ((this.time * 8) | 0) & 1;
    if (h.animal) this.drawAnimal(ctx, u, px, py, frame);
    else {
      const k = this._kings && this._kings.get(u.kingdomId);
      this.S.drawFast(ctx, this.unitKey(u, k ? k.gov : 'tribe', frame), px, py, k ? k.colorIndex | 0 : 10, frame === 1);
    }
  };

  // Vorhaben (state.plots) als Marker mit Fortschritt
  Renderer.prototype.drawPlots = function (ctx, vt) {
    for (const p of this.st.plots) {
      if (!p || !(p.x >= 0) || !(p.y >= 0)) continue;
      if (p.x < vt.x0 - 1 || p.x > vt.x1 + 1 || p.y < vt.y0 - 1 || p.y > vt.y1 + 1) continue;
      const x = Math.round(p.x * 8) + 18, y = Math.round(p.y * 8) + 6, v = Math.max(0, Math.min(1, +p.progress || 0));
      ctx.fillStyle = '#0a1a21'; ctx.fillRect(x - 6, y - 6, 12, 12);
      ctx.fillStyle = '#2a5261'; ctx.fillRect(x - 5, y - 5, 10, 10);
      ctx.fillStyle = '#f2b541'; ctx.fillRect(x - 5, y + 5 - Math.round(10 * v), 10, Math.round(10 * v));
      ctx.fillStyle = '#f3ead2'; ctx.fillRect(x - 1, y - 3, 2, 4); ctx.fillRect(x - 1, y + 2, 2, 2);
    }
  };

  Renderer.prototype.drawSelection = function (ctx, sel, opts) {
    const st = this.st;
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 6);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#f2b541';
    if (sel.kind === 'unit' && sel.obj && !sel.obj.dead) {
      let x = sel.obj.x, y = sel.obj.y;
      const p = opts.prev && opts.prev.get(sel.animal ? -sel.obj.id : sel.obj.id), a = opts.alpha == null ? 1 : opts.alpha;
      if (p) { const dx = x - p[0], dy = y - p[1]; if (dx * dx + dy * dy < 4) { x = p[0] + dx * a; y = p[1] + dy * a; } }
      const px = Math.round(x * 8), py = Math.round(y * 8);
      corners(ctx, px - 6, py - 13, 12, 15);
    } else if (sel.kind === 'city' && sel.obj) {
      const c = sel.obj;
      const cs = st.structs && st.structs.find(s => s.type === 'center' && s.cityId === c.id && !s.dead);
      if (cs) corners(ctx, cs.x * 8 - 3, cs.y * 8 - 18, cs.w * 8 + 6, cs.h * 8 + 21);
      else corners(ctx, c.cx * 8 - 4, c.cy * 8 - 4, 16, 16);
    } else if (sel.kind === 'tile') {
      corners(ctx, sel.x * 8 - 1, sel.y * 8 - 1, 10, 10);
    }
    ctx.globalAlpha = 1;
  };
  function corners(ctx, x, y, w, h) {
    const l = Math.max(3, Math.min(6, Math.floor(Math.min(w, h) / 3)));
    ctx.fillRect(x, y, l, 1); ctx.fillRect(x, y, 1, l);
    ctx.fillRect(x + w - l, y, l, 1); ctx.fillRect(x + w - 1, y, 1, l);
    ctx.fillRect(x, y + h - 1, l, 1); ctx.fillRect(x, y + h - l, 1, l);
    ctx.fillRect(x + w - l, y + h - 1, l, 1); ctx.fillRect(x + w - 1, y + h - l, 1, l);
  }

  // Pinselvorschau: Kacheln (Malen) oder Wirkungskreis (Kräfte)
  Renderer.prototype.drawBrush = function (ctx, b) {
    const W = this.st.W, H = this.st.H;
    const cx = Math.floor(b.x), cy = Math.floor(b.y);
    if (b.kind === 'tiles') {
      const r = Math.max(1, b.r | 0), lim = (r - 1) * (r - 1) + (r - 1);
      ctx.fillStyle = 'rgba(242,181,65,0.28)';
      for (let dy = -r + 1; dy <= r - 1; dy++) for (let dx = -r + 1; dx <= r - 1; dx++) {
        if (dx * dx + dy * dy > lim) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
      ctx.fillStyle = '#f2b541';
      // Umriss
      for (let dy = -r + 1; dy <= r - 1; dy++) for (let dx = -r + 1; dx <= r - 1; dx++) {
        if (dx * dx + dy * dy > lim) continue;
        const x = (cx + dx) * 8, y = (cy + dy) * 8;
        const inside = (ddx, ddy) => (dx + ddx) * (dx + ddx) + (dy + ddy) * (dy + ddy) <= lim && Math.abs(dx + ddx) <= r - 1 && Math.abs(dy + ddy) <= r - 1;
        if (!inside(0, -1)) ctx.fillRect(x, y, 8, 1);
        if (!inside(0, 1)) ctx.fillRect(x, y + 7, 8, 1);
        if (!inside(-1, 0)) ctx.fillRect(x, y, 1, 8);
        if (!inside(1, 0)) ctx.fillRect(x + 7, y, 1, 8);
      }
    } else if (b.kind === 'arrow') {
      const x0 = b.x * 8, y0 = b.y * 8, x1 = b.x2 * 8, y1 = b.y2 * 8, a = Math.atan2(y1 - y0, x1 - x0);
      ctx.strokeStyle = '#f2b541'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#f2b541'; ctx.beginPath(); ctx.moveTo(x1 + Math.cos(a) * 5, y1 + Math.sin(a) * 5);
      ctx.lineTo(x1 + Math.cos(a + 2.4) * 6, y1 + Math.sin(a + 2.4) * 6); ctx.lineTo(x1 + Math.cos(a - 2.4) * 6, y1 + Math.sin(a - 2.4) * 6); ctx.fill();
      corners(ctx, Math.floor(b.x) * 8 - 1, Math.floor(b.y) * 8 - 1, 10, 10);
    } else if (b.kind === 'circle') {
      const r = (b.r || 2) * 8;
      ctx.strokeStyle = '#f2b541'; ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.arc(b.x * 8, b.y * 8, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(242,181,65,0.15)'; ctx.fill();
      corners(ctx, cx * 8 - 1, cy * 8 - 1, 10, 10);
    } else {
      corners(ctx, cx * 8 - 1, cy * 8 - 1, 10, 10);
    }
  };

  // Stadtnamen: Banner + Name auf dunkler Tafel, Größe nach Stadtstufe
  Renderer.prototype.drawCityLabels = function (ctx, cam, opts) {
    const st = this.st;
    if (cam.zoom < 0.45) return;
    const dpr = cam.dpr;
    const kings = this._kings;
    const small = cam.zoom < 1.4;
    const S = this.S;
    const labels = [];
    for (const c of st.cities) {
      const k = kings.get(c.kingdomId);
      if (!k) continue;
      const cs = this.structById ? this.structById(c.centerId) : null;
      let top = cs ? cs.y * 8 - 16 : (c.cy - 1.2) * 8 - 14;
      if (cs) { const inf = S.info(this.structKey(cs, k.gov)); if (inf) top = (cs.y + cs.h - inf.fh) * 8 + inf.oy - 3; }
      const tx = cs ? (cs.x + cs.w / 2) * 8 - 4 : (c.cx + 0.5) * 8, ty = top;
      const p = cam.worldToScreen(tx + 4, ty);
      if (p.x < -120 || p.x > cam.viewW + 120 || p.y < -40 || p.y > cam.viewH + 60) continue;
      labels.push({ c: c, k: k, x: p.x, y: p.y });
      void cs;
    }
    const fs = (small ? 11 : 13);
    for (const L of labels) {
      const c = L.c, k = L.k;
      const team = this.teamCss[k.colorIndex | 0] || this.teamCss[0];
      const name = c.name + (small ? '' : '  ' + (c.pop | 0));
      ctx.font = '600 ' + Math.round(fs * dpr) + 'px ' + FONT_PIXEL;
      const tw = Math.ceil(ctx.measureText(name).width);
      const bw = Math.round(11 * dpr * (small ? 1 : 1.5)), pad = Math.round(4 * dpr);
      const h = Math.round((fs + 7) * dpr);
      const w = tw + pad * 3 + bw;
      const x = Math.round(L.x * dpr - w / 2), y = Math.round(L.y * dpr - h);
      // Tafel: Kante, Fläche, harte Schattenkante
      ctx.fillStyle = 'rgba(10,26,33,0.92)';
      ctx.fillRect(x - dpr, y - dpr, w + 2 * dpr, h + 2 * dpr);
      ctx.fillStyle = 'rgba(29,59,71,0.92)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = team.main;
      ctx.fillRect(x, y + h - Math.round(2 * dpr), w, Math.round(2 * dpr));
      // Banner
      const bk = 'banner_' + ((k.bannerPattern | 0) % 8);
      const bi = S.info(bk);
      if (bi) {
        const sc = bw / bi.w;
        ctx.save(); ctx.imageSmoothingEnabled = false;
        ctx.setTransform(sc, 0, 0, sc, x + pad - bi.ox * sc, y + Math.round((h - bi.h * sc) / 2) - Math.round(dpr) - bi.oy * sc);
        S.drawFast(ctx, bk, 0, 0, k.colorIndex | 0, false);
        ctx.restore();
      }
      ctx.fillStyle = '#f3ead2';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.split('  ')[0], x + pad * 2 + bw, y + h / 2 - dpr);
      if (!small) {
        const nw = ctx.measureText(c.name + '  ').width;
        ctx.fillStyle = '#b9c4b8';
        ctx.fillText(String(c.pop | 0), x + pad * 2 + bw + nw, y + h / 2 - dpr);
      }
      L.box = { x: x / dpr, y: y / dpr, w: w / dpr, h: h / dpr };
    }
    this.labelBoxes = labels;
  };

  // Stadtname unter dem Zeiger? (Bildschirmkoordinaten)
  Renderer.prototype.labelAt = function (sx, sy) {
    if (!this.labelBoxes) return null;
    for (const L of this.labelBoxes) { const b = L.box; if (b && sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return L.c; }
    return null;
  };

  WW.Renderer = Renderer;
  WW.Renderer.FONT_PIXEL = FONT_PIXEL;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
