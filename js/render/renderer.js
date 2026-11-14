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
    this.gfx = { daynight: false, weather: false, clouds: false, water: true, quality: 'mid' };
    this.autoOff = {};   // automatische Qualitätsregelung: abgeschaltete Teile
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
    this.gsig = new Int32Array(W * H);   // Prüfsumme des zuletzt gezeichneten Bodens je Kachel
    this.waterSig = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) this.waterSig[i] = waterKind(st.terrain[i]);
    for (let i = 0; i < W * H; i++) this.decorSig[i] = st.structAt && st.structAt[i] >= 0 ? -2 : st.terrain[i];
    this.groundDirty.clear();
    this.fx.length = 0;
    this._ancH = null; this._rc = null; this._dk = null; this._objCount = 0; this._shownP = null; this._opT = null; this._bKey = this._aKey = ''; this.muzzleT = null;
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

  // Prüfsumme über alles, was drawGroundTile für diese Kachel liest: Gelände, Pfad und weiche Überlagerungen der Kachel
  // und ihrer 8 Nachbarn, dazu Variante, Beweidung, Trübung, Risse, Fallout, Krater und Gleis.
  Renderer.prototype.groundSig = function (x, y) {
    const st = this.st, W = st.W, H = st.H, i = y * W + x, t = st.terrain, path = this.path;
    const cl = st.cleared, ba = st.barren, so = st.soot, tr = st.trench;
    let h = 2166136261 | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      let v = -1;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) {
        const j = yy * W + xx;
        v = t[j] | (path[j] ? 256 : 0) | (cl && cl[j] > 0 ? 512 : 0) | (so && so[j] > 0 ? 1024 : 0) | (ba && ba[j] > 0 ? (ba[j] > 170 ? 3 : ba[j] > 85 ? 2 : 1) << 11 : 0) | (tr && tr[j] >> 6 ? 1 << 13 : 0);
      }
      h = Math.imul(h ^ v, 16777619);
    }
    h = Math.imul(h ^ (st.variant ? st.variant[i] : 0), 16777619);
    h = Math.imul(h ^ ((st.grazed ? (st.grazed[i] ? 1 : 0) : st.graze && st.graze[i] >= 128 ? 1 : 0) | (st.murk ? (st.murk[i] >> 3) << 1 : 0)), 16777619);
    h = Math.imul(h ^ ((st.crack ? st.crack[i] >> 3 : 0) | (st.fallout ? (st.fallout[i] >> 3) << 8 : 0) | (st.mark ? st.mark[i] << 16 : 0)), 16777619);
    if (st.structAt && st.structAt[i] >= 0 && this.structById) {
      const rs = this.structById(st.structAt[i]);
      if (rs && rs.type === 'rail') h = Math.imul(h ^ (64 + ((rs.mask | 0) & 15) * 2 + (rs.bridge ? 1 : 0)), 16777619);
      else if (rs && rs.type === 'gate' && rs.rail) h = Math.imul(h ^ (128 + this.railMaskAt(x, y)), 16777619);
    }
    return h | 0;
  };

  Renderer.prototype.drawGroundTile = function (g, x, y, hi) {
    const st = this.st, W = st.W, H = st.H, i = y * W + x, t = st.terrain;
    const T = (xx, yy) => xx < 0 || yy < 0 || xx >= W || yy >= H ? -1 : t[yy * W + xx];
    if (hi) {
      // feine Kachel in Cache-Pixeln zeichnen (Kontext kurz unskaliert), Überlagerungen danach in Logikpixeln
      g.save(); g.setTransform(1, 0, 0, 1, g.getTransform().e, g.getTransform().f);
      this.S.drawGroundHi(g, x * 16, y * 16, t[i], st.variant ? st.variant[i] : 0, T(x, y - 1), T(x + 1, y), T(x, y + 1), T(x - 1, y), T(x + 1, y - 1), T(x + 1, y + 1), T(x - 1, y + 1), T(x - 1, y - 1));
      g.restore();
    } else {
      this.S.drawGround(g, x * 8, y * 8, t[i], st.variant ? st.variant[i] : 0, T(x, y - 1), T(x + 1, y), T(x, y + 1), T(x - 1, y));
      this.blendEdges(g, x, y);
    }
    if (this.path[i]) this.S.drawPath(g, x * 8, y * 8, this.pathMask(x, y));
    if ((st.grazed ? st.grazed[i] : st.graze && st.graze[i] >= 128) && this.S.has('t_grazed') && (WW.TERRAIN[st.terrain[i]] || {}).fertile > 0) this.S.drawFast(g, 't_grazed', x * 8, y * 8, 0, false);
    if (st.murk && st.murk[i] > 0 && this.S.has('t_murk')) { g.globalAlpha = Math.min(1, 0.4 + st.murk[i] / 200); this.S.drawFast(g, 't_murk', x * 8, y * 8, 0, false); g.globalAlpha = 1; }
    // Rodung, Verödung, Ruß mit weichen Rändern (softKey + Nachbarmaske), sonst einfache Kachel
    if (st.cleared && st.cleared[i] > 0) this.softOverlay(g, x, y, st.cleared, 't_cleared', null);
    if (st.barren && st.barren[i] > 0) this.softOverlay(g, x, y, st.barren, 't_barren', (v) => v > 170 ? 3 : v > 85 ? 2 : 1);
    if (st.soot && st.soot[i] > 0) this.softOverlay(g, x, y, st.soot, 't_soot', null);
    // Schützengraben (sichtbar ab Wert >> 6), weiche Ränder über softKey
    if (st.trench && st.trench[i] >> 6) this.softOverlay(g, x, y, st.trench, 't_trench', null, (v) => v >> 6 ? 1 : 0);
    // Schienen liegen im Boden wie Pfade
    if (st.structAt && st.structAt[i] >= 0 && this.structById) {
      const rs = this.structById(st.structAt[i]);
      if (rs && rs.type === 'rail') this.drawRailTile(g, rs, x, y);
      else if (rs && rs.type === 'gate' && rs.rail) this.drawRailTile(g, { mask: this.railMaskAt(x, y) }, x, y);
    }
    if (st.crack && st.crack[i]) { const ck = this.S.has('t_crack') ? 't_crack' : (this.S.has('fx_crack') ? 'fx_crack' : null); if (ck) { g.globalAlpha = Math.min(1, st.crack[i] / 120); this.S.drawFast(g, ck, x * 8, y * 8, 0, false); g.globalAlpha = 1; } }
    if (st.fallout && st.fallout[i] && this.S.has('t_fallout')) { g.globalAlpha = Math.min(1, 0.35 + st.fallout[i] / 160); this.S.drawFast(g, 't_fallout', x * 8, y * 8, 0, false); g.globalAlpha = 1; }
    const m = st.mark ? st.mark[i] : 0;
    if (m) this.S.drawFast(g, m >= 100 ? 't_crater' : 't_scorched', x * 8, y * 8, 0, false);
  };

  // weiche Biom-Übergänge (gestreute Pixel des Nachbarn auf gleicher Höhe) und Schlagschatten von höherem Land im Westen
  const LUT_RANK = () => WW.TERRAIN_LUT.rank;
  Renderer.prototype.blendEdges = function (g, x, y) {
    if (this.gfx && this.gfx.blend === false) return;
    const st = this.st, W = st.W, H = st.H, t = st.terrain, i = y * W + x, id = t[i], R = LUT_RANK();
    const r0 = R[id], wk0 = waterKind(id);
    const nb = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let d = 0; d < 4; d++) {
      const nx = x + nb[d][0], ny = y + nb[d][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nid = t[ny * W + nx];
      if (nid === id || R[nid] !== r0 || waterKind(nid) || wk0) continue;
      g.fillStyle = this.S.groundColor(nid);
      for (let k = 0; k < 8; k++) for (let depth = 0; depth < 3; depth++) {
        if (hash2(x * 8 + k, y * 8 + depth * 3 + d, 77 + id * 31 + nid) > [0.55, 0.3, 0.12][depth]) continue;
        const px = d === 1 ? 7 - depth : d === 3 ? depth : k, py = d === 0 ? depth : d === 2 ? 7 - depth : k;
        g.fillRect(x * 8 + px, y * 8 + py, 1, 1);
      }
    }
    // Schatten: Land im Westen liegt höher -> weicher dunkler Streifen am linken Rand
    if (x > 0) {
      const wr = R[t[i - 1]];
      if (wr > r0 && r0 >= 1) {
        const k = Math.min(3, wr - r0);
        g.fillStyle = 'rgba(14,24,44,' + (0.16 + 0.05 * k) + ')'; g.fillRect(x * 8, y * 8, 1, 8);
        g.fillStyle = 'rgba(14,24,44,' + (0.08 + 0.03 * k) + ')'; g.fillRect(x * 8 + 1, y * 8, 1 + (k > 1 ? 1 : 0), 8);
      }
    }
  };

  // Überlagerung mit weichen Rändern: Stufe L der Kachel, Maske = Nachbarn mit Stufe >= L
  Renderer.prototype.softOverlay = function (g, x, y, ras, base, levelOf, present) {
    const S = this.S, st = this.st, W = st.W, H = st.H, i = y * W + x;
    const lv = present ? present : (v) => v > 0 ? (levelOf ? levelOf(v) : 1) : 0;
    const L = lv(ras[i]);
    const key0 = levelOf ? base + '_' + L : base;
    const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= W || yy >= H) ? L : lv(ras[yy * W + xx]);
    const m = (at(x, y - 1) >= L ? 1 : 0) | (at(x + 1, y) >= L ? 2 : 0) | (at(x, y + 1) >= L ? 4 : 0) | (at(x - 1, y) >= L ? 8 : 0);
    let k = typeof S.softKey === 'function' ? S.softKey(key0, m) : null;
    if (!k || !S.has(k)) k = S.has(key0) ? key0 : (S.has(base) ? base : null);
    if (k) S.drawFast(g, k, x * 8, y * 8, 0, false);
  };

  Renderer.prototype.drawRailTile = function (g, s, x, y) {
    const S = this.S, m = (s.mask | 0) & 15;
    if (s.bridge) { const bk = 't_rail_bridge_' + ((m & 10) ? 'h' : 'v'); if (S.has(bk)) { S.drawFast(g, bk, x * 8, y * 8, 0, false); return; } }
    if (typeof S.drawRail === 'function') { try { S.drawRail(g, x * 8, y * 8, m); return; } catch (e) { /* Rückfall */ } }
    const k = 't_rail_' + m;
    if (S.has(k)) S.drawFast(g, k, x * 8, y * 8, 0, false);
    else { g.fillStyle = '#5b4a3a'; g.fillRect(x * 8 + 1, y * 8 + 3, 6, 2); }
  };

  // Gleismaske einer Kachel aus den Nachbarn (Gleis oder Gleistor)
  Renderer.prototype.railMaskAt = function (x, y) {
    const st = this.st, W = st.W, H = st.H;
    const r = (xx, yy) => { if (xx < 0 || yy < 0 || xx >= W || yy >= H || !this.structById) return false; const o = this.structById(st.structAt[yy * W + xx]); return !!(o && (o.type === 'rail' || (o.type === 'gate' && o.rail) || o.type === 'station')); };
    return (r(x, y - 1) ? 1 : 0) | (r(x + 1, y) ? 2 : 0) | (r(x, y + 1) ? 4 : 0) | (r(x - 1, y) ? 8 : 0);
  };
  Renderer.prototype.pathMask = function (x, y) {
    const W = this.st.W, H = this.st.H, p = this.path, i = y * W + x;
    return (y > 0 && p[i - W] ? 1 : 0) | (x < W - 1 && p[i + 1] ? 2 : 0) | (y < H - 1 && p[i + W] ? 4 : 0) | (x > 0 && p[i - 1] ? 8 : 0);
  };

  // feiner Boden (16 px je Kachel), außer bei Qualität „niedrig" oder ohne Helfer
  Renderer.prototype.useHi = function () { return typeof this.S.drawGroundHi === 'function' && this.gfx.quality !== 'low' && !this.autoOff.fine; };
  Renderer.prototype.buildChunk = function (c) {
    const st = this.st, hi = this.useHi(), k = hi ? 2 : 1;
    if (!c.ground || c.hi !== hi) { c.ground = document.createElement('canvas'); c.ground.width = CPX * k; c.ground.height = CPX * k; c.hi = hi; }
    const g = c.ground.getContext('2d');
    g.setTransform(k, 0, 0, k, -c.cx * CPX * k, -c.cy * CPX * k);
    const x1 = Math.min(st.W, (c.cx + 1) * CH), y1 = Math.min(st.H, (c.cy + 1) * CH);
    for (let y = c.cy * CH; y < y1; y++) for (let x = c.cx * CH; x < x1; x++) this.drawGroundTile(g, x, y, hi);
    c.usedT = this.time;
    this.trimChunks();
    c.built = true;
    c.late = null;
    this._gver = (this._gver | 0) + 1;
    this.objForget(c.cx * CH, c.cy * CH, c.cx * CH + CH - 1, c.cy * CH + CH - 1);
    c.decorDirty = true;
    c.waterDirty = true;
  };

  // Speicher: höchstens ~28 feine Blöcke behalten; lange unbenutzte geben Boden und Wasserbilder frei
  Renderer.prototype.trimChunks = function () {
    const hiC = this.chunks.filter(c => c.built && (c.hi || c.wGl));
    if (hiC.length <= 28) return;
    hiC.sort((a, b) => (a.usedT || 0) - (b.usedT || 0));
    for (let i = 0; i < hiC.length - 28; i++) {
      const c = hiC[i];
      if (this.time - (c.usedT || 0) < 2) break;
      c.ground = null; c.built = false; c.wGl = null; c.hi = false;
      if (this.buildQueue.indexOf(c) < 0) this.buildQueue.push(c);
    }
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
        if (s.dead || s.type === 'rail') continue;
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
      if (ls) { ls.sort((p, q) => p.x - q.x); for (const s of ls) { this.drawStruct(g, s, this._cityKTmp, false, bars); if (s.device === 'spikes' || s.device === 'trap') this.drawDevice(g, s); } }
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

  Renderer.prototype.decorAt = function (i, noTime) {
    const st = this.st;
    if (st.structAt && st.structAt[i] >= 0) return null;
    if (this.path[i]) return null;
    // gerodet: Baumstumpf statt Wald
    if (st.cleared && st.cleared[i] > 0 && !(WW.TERRAIN_LUT.wood[st.terrain[i]])) {
      const h = (Math.imul(i, 2654435761) >>> 24);
      const fresh = st.cleared[i] > 200 && this.S.has('d_log_0');
      const k = fresh ? 'd_log_' + (h & 1) : h % 5 === 0 && this.S.has('d_deadtree_0') ? 'd_deadtree_0' : 'd_stump_' + (this.S.has('d_stump_1') ? h % 3 : 0);
      return this.S.has(k) ? { key: k, dx: (h & 3) - 1, dy: -((h >> 2) & 1) } : (this.S.has('d_stump_0') ? { key: 'd_stump_0', dx: 0, dy: 0 } : null);
    }
    if (st.deposit && st.deposit[i] > 0) { const d = this.depositDecor(i, noTime); if (d) return d; }
    if (st.owner && st.owner[i] >= 0) {
      // Ergebnis je Kachel eine Sekunde zwischenspeichern (Nachbarsuche ist teuer)
      const N = st.W * st.H;
      if (!this._decoC || this._decoC.length !== N || this.time - this._decoT > 1) { this._decoC = this._decoC && this._decoC.length === N ? this._decoC.fill(-1) : new Int16Array(N).fill(-1); this._decoT = this.time; this._decoObj = this._decoObj || []; }
      let c = this._decoC[i];
      if (c === -1) { const d = this.cityDeco(i); if (d) { c = this._decoObj.indexOf(d.key); if (c < 0) { this._decoObj.push(d.key); c = this._decoObj.length - 1; } } else c = -2; this._decoC[i] = c; }
      if (c >= 0) return { key: this._decoObj[c], dx: 0, dy: 0 };
    }
    return this.S.decorFor(st.terrain[i], st.variant ? st.variant[i] : 0);
  };

  const SWAY_RE = /^(d|hd)_(tree|pine|jtree|palm|acacia|mangrove|shroom|reed|deadtree|bush|fern|grass)/;

  // Fahnen je Regierung (rein optisch, deterministisch); Liste alle 2 s neu
  Renderer.prototype.flagList = function () {
    const st = this.st, W = st.W;
    if (this._flags && this.time - this._flagsT < 2) return this._flags;
    this._flagsT = this.time;
    const out = [];
    const kings = new Map(); for (const k of st.kingdoms) kings.set(k.id, k);
    const cityK = new Map(); for (const c of st.cities) cityK.set(c.id, kings.get(c.kingdomId));
    const hash = (a, b) => (Math.imul(a * 73856093 ^ b * 19349663, 2654435761) >>> 0) / 4294967296;
    const free = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= st.H) return false;
      const i = y * W + x;
      return st.structAt[i] < 0 && !this.path[i] && WW.TERRAIN_LUT.build[st.terrain[i]];
    };
    const add = (kind, px, py, k, seed) => out.push({ kind: kind, px: px, py: py, pat: k.bannerPattern | 0, team: k.colorIndex | 0, seed: seed, gov: k.gov });
    for (const s of st.structs) {
      if (s.dead || !s.built || s.cityId < 0) continue;
      const k = cityK.get(s.cityId);
      if (!k) continue;
      const g = k.gov, h = hash(s.id, 7);
      const px = s.x * 8, py = s.y * 8;
      switch (s.type) {
        case 'gate':
          if (g === 'fascism' || g === 'monarchy') add('pole', px + 6, py, k, s.id);
          break;
        case 'tower':
          if ((g === 'fascism' && h < 0.5) || g === 'monarchy') add('pole', px + 3, py - 4, k, s.id);
          break;
        case 'center':
          if (s.stage != null && s.stage < 2) { if (g !== 'anarchy') add('pole', px + s.w * 8 - 4, py + 2, k, s.id); break; }
          if (g === 'fascism') add('center', px, py + s.h * 8 - 8, k, s.id);
          if (g === 'fascism' || g === 'communism') { add('hang', px + 3, py + s.h * 8 - 10, k, s.id); add('hang', px + s.w * 8 - 9, py + s.h * 8 - 10, k, s.id + 1); }
          else if (g === 'democracy') { add('pole', px - 2, py + 4, k, s.id); add('pole', px + s.w * 8 - 2, py + 4, k, s.id + 1); }
          else if (g === 'theocracy' || g === 'tribe') add('pole', px + s.w * 8 - 3, py + 4, k, s.id);
          else if (g === 'anarchy') add('row', px, py + 4, k, s.id);
          // Faschismus: Mastreihe entlang der Achse Zentrum–Tor
          if (g === 'fascism') {
            const c = st.cities.find(cc => cc.id === s.cityId), gates = c && c.wall && c.wall.gates;
            if (Array.isArray(gates)) for (const gid of gates) {
              const gs = this.structById ? this.structById(gid) : null;
              if (!gs) continue;
              const cx = s.x + 1, cy = s.y + 1, n = Math.max(Math.abs(gs.x - cx), Math.abs(gs.y - cy));
              for (let t = 2; t < n - 1; t += 2) {
                const x = Math.round(cx + (gs.x - cx) * t / n), y = Math.round(cy + (gs.y - cy) * t / n);
                if (free(x + 1, y)) add('pole', (x + 1) * 8 + 2, y * 8, k, x * 31 + y);
                if (free(x - 1, y)) add('pole', (x - 1) * 8 + 2, y * 8, k, x * 37 + y);
              }
            }
          }
          break;
        case 'barracks':
          if (g === 'fascism') add('hang', px + 4, py + s.h * 8 - 10, k, s.id);
          break;
        case 'factory':
          if (g === 'communism') add('pole', px + s.w * 8 - 3, py + 2, k, s.id);
          break;
        case 'market':
          if (g === 'republic') add('row', px, py, k, s.id);
          break;
        case 'monument':
          if (g === 'theocracy' && h < 0.6) add('pole', px + 6, py + 2, k, s.id);
          break;
        case 'house':
          if (g === 'anarchy' && h < 0.12) add('row', px, py + 2, k, s.id);
          break;
      }
    }
    return (this._flags = out);
  };
  Renderer.prototype.drawFlags = function (g, vt) {
    const S = this.S, list = this.flagList();
    for (const f of list) {
      if (f.px < (vt.x0 - 2) * 8 || f.px > (vt.x1 + 2) * 8 || f.py < (vt.y0 - 2) * 8 || f.py > (vt.y1 + 3) * 8) continue;
      const fr = ((this.time * 3 + (f.seed & 7) * 0.4) | 0) & 1;
      let k = null;
      try { k = S.flagKey(f.kind, f.pat, f.kind === 'center' ? 0 : fr, f.team, f.gov); } catch (e) { k = null; }
      if (!k || !S.has(k)) { try { k = S.flagKey(f.kind, f.pat, f.kind === 'center' ? 0 : fr, f.team); } catch (e) { k = null; } }
      if (k && S.has(k)) S.drawFast(g, k, f.px, f.py, f.team, false);
    }
  };

  // Vorkommen: Deko d_deposit_<art>_<n>; Art aus state.depositKinds / WW.DEPOSIT_KEYS / WW.DEPOSITS
  Renderer.prototype.depositDecor = function (i, noTime) {
    const st = this.st, v = st.deposit[i], S = this.S;
    const kinds = st.depositKinds || WW.DEPOSIT_KEYS || (WW.DEPOSITS ? (Array.isArray(WW.DEPOSITS) ? WW.DEPOSITS.map(d => d && (d.key || d)) : Object.keys(WW.DEPOSITS)) : null);
    const kind = typeof v === 'string' ? v : kinds ? (kinds[v] || kinds[v - 1]) : ['iron', 'coal', 'gold', 'crystal'][v - 1];
    if (!kind) return null;
    const n = (Math.imul(i, 2654435761) >>> 28) % 3;
    if (kind === 'fish' && S.has('d_fish_0')) return noTime ? { key: 'd_fish_0', dx: 0, dy: 0, fish: true } : { key: 'd_fish_' + (((this.time * 2) | 0) & 1), dx: 0, dy: 0 };
    for (const k of ['d_ore_' + kind + '_' + (n & 1), 'd_' + kind, 'd_deposit_' + kind + '_' + n, 'd_deposit_' + kind + '_0', 'd_deposit_' + kind]) if (S.has(k)) return { key: k, dx: 0, dy: 0 };
    return null;
  };

  // Stadt-Deko (rein optisch): auf freien, bebaubaren Kacheln neben Häusern, deterministisch nach Kachel-Hash
  const CITY_DECO = ['s_deco_well', 's_deco_stall', 's_deco_hay', 's_deco_cart', 's_deco_garden_0', 's_deco_garden_1', 's_deco_garden_2',
    's_deco_woodpile', 's_deco_barrels', 's_deco_laundry'];
  Renderer.prototype.cityDeco = function (i) {
    const S = this.S;
    let list = this._cityDecoList;
    if (!list) list = this._cityDecoList = (Array.isArray(S.DECO_KEYS) && S.DECO_KEYS.length ? S.DECO_KEYS : CITY_DECO).filter(k => S.has(k));
    if (!list.length) return null;
    const st = this.st, W = st.W, H = st.H, x = i % W, y = (i / W) | 0;
    if (!WW.TERRAIN_LUT.build[st.terrain[i]]) return null;
    const h = Math.imul(i ^ 0x5bd1e995, 2654435761) >>> 0;
    const c = this._cityById ? this._cityById.get(st.owner[i]) : null;
    const tier = c ? c.tier | 0 : 0;
    const every = tier <= 0 ? 24 : tier === 1 ? 9 : 6;
    if (h % every) return null;
    let house = false;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const s = this.structById ? this.structById(st.structAt[yy * W + xx]) : null;
      if (!s) continue;
      if (s.type === 'gate' || s.type === 'wall' || s.type === 'tower' || !s.built) { if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) return null; continue; }
      if (s.type === 'house' && Math.abs(dx) <= 1 && Math.abs(dy) <= 1) house = true;
    }
    if (!house) return null;
    return { key: list[(h >>> 8) % list.length], dx: 0, dy: 0 };
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
        if (this._dk) this.objForget(x, y, x, y);
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
    this._gver = (this._gver | 0) + 1;
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
      if (y > 0 && x > 0) this.groundDirty.add(i - W - 1);
      if (y > 0 && x < W - 1) this.groundDirty.add(i - W + 1);
      if (y < H - 1 && x > 0) this.groundDirty.add(i + W - 1);
      if (y < H - 1 && x < W - 1) this.groundDirty.add(i + W + 1);
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
    // Zeitbudget: feine Kacheln sind teuer, Rest im nächsten Bild
    const t0 = performance.now(), lim = this.useHi() ? 1.5 : 4;
    let n = 0;
    for (const i of this.groundDirty) {
      if ((++n & 1) === 0 && performance.now() - t0 > lim) break;
      this.groundDirty.delete(i);
      const x = i % W, y = (i / W) | 0;
      const c = this.chunkAt(x, y);
      this.updateMiniTile(i);
      if (!c.built) { this.gsig[i] = 0x7fffffff; continue; }   // Block wird später ganz neu gebaut: Prüfsumme verwerfen
      if (this.time - (c.usedT || 0) > 1.5) { (c.late || (c.late = new Set())).add(i); continue; }   // Block nicht im Bild: merken, später zeichnen
      // Boden nur neu zeichnen, wenn sich an dieser Kachel oder ihren Nachbarn sichtbar etwas geändert hat
      const sg = this.groundSig(x, y);
      if (this.gsig[i] !== sg) {
        this.gsig[i] = sg; this._gver = (this._gver | 0) + 1;
        const g = c.ground.getContext('2d'), k = c.hi ? 2 : 1;
        g.setTransform(k, 0, 0, k, -c.cx * CPX * k, -c.cy * CPX * k);
        this.drawGroundTile(g, x, y, c.hi);
      }
      touched.add(c);
      // Wasser-Masken nur neu, wenn sich an Wasser/Land dieser Kachel etwas geändert hat
      const wk = waterKind(st.terrain[i]);
      if (this.waterSig[i] !== wk) { this.waterSig[i] = wk; c.waterDirty = true; const c2 = this.chunkAt(Math.min(st.W - 1, x + 1), y), c3 = this.chunkAt(Math.max(0, x - 1), y), c4 = this.chunkAt(x, Math.min(st.H - 1, y + 1)), c5 = this.chunkAt(x, Math.max(0, y - 1)); c2.waterDirty = c3.waterDirty = c4.waterDirty = c5.waterDirty = true; }
      // Deko-Block nur neu, wenn sich die Deko dieser Kachel ändern kann
      const sig = st.structAt && st.structAt[i] >= 0 ? -2 : (this.path[i] ? -3 : st.terrain[i]);
      if (this.decorSig[i] !== sig) { this.decorSig[i] = sig; c._decorTouched = true; this.objForget(x - 2, y - 2, x + 2, y + 2); }
    }
    for (const c of touched) c.decorDirty = c.decorDirty || c._decorTouched;
    for (const c of touched) c._decorTouched = false;
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
  const FX_DUR = { treeFall: 1.1, whistle: 0.8, explosion: 0.9, mushroom: 3.6, rock: 0.5, ward: 0.8, dud: 0.6, smokeplume: 0.01, muzzle: 0.18, bolt_shot: 0.3, flash: 0.5, shockwave: 1.0, mushroom: 3.2, tracer: 0.18, laser: 0.6, orbitallaser: 0.6, blackhole: 4, spark: 0.4, explosion: 0.8, tornado: 2, crack: 1.2, lavaglow: 1.5, rock: 0.8, breath: 0.8, arrow: 0.35, bolt: 0.45, meteor: 0.9, smoke: 1.4, rain: 1.8, plague: 1.6, sparkle: 1.2, restyle: 1.4,
    govchange: 1.8, dust: 0.9, hit: 0.3, splash: 0.6, poof: 0.6,
    tankfire: 0.4, wake: 0.9, shipsmoke: 1.3, shipfire: 0.45, shipsink: 1.6, dig: 0.8, battlepick: 1.2, campgate: 1.0, freed: 2.0, memorial: 2.0, caravan: 1.2, horn: 0.8, sail: 0.6, swim: 0.05, wreck: 1.4 };
  Renderer.prototype.addFx = function (list) {
    for (const f of list) {
      if (this.fx.length > 500) break;
      const o = Object.assign({}, f);
      if (f.type === 'shell') o.ft = f.t;
      o.t = 0; o.d = (typeof f.dur === 'number' && f.dur > 0) ? f.dur : f.type === 'shell' ? Math.max(0.35, Math.min(1.4, (f.t || 12) / 16)) : (FX_DUR[f.type] || 0.8);
      o.seed = (Math.random() * 1e6) | 0;
      this.fx.push(o);
      if (f.type === 'bolt' || f.type === 'meteor') this.flash = Math.max(this.flash || 0, f.type === 'bolt' ? 0.35 : 0.25);
      this.burst(f);
      if (f.type === 'trainsmoke') { if (typeof this.S.trainKey !== 'function') this.addPlume(f.x * 8, f.y * 8 - 6, false, -6, -14, false); continue; }
      if (f.type === 'smokeplume') { if (typeof this.S.factoryStacks !== 'function') this.addPlume(f.x * 8, f.y * 8, !!(f.filtered || f.clean), -6, -14, f.big); continue; }
      if (f.type === 'muzzle' && this.st) { (this.muzzleT || (this.muzzleT = new Map())).set((f.y | 0) * this.st.W + (f.x | 0), this.time); }
      if (f.type === 'flash') this.flash = Math.max(this.flash || 0, 0.9);
      let sh = f.type === 'meteor' ? 0.35 : 0;
      if (f.type === 'mushroom' || f.type === 'shockwave') sh = 0.8;
      if (f.type === 'explosion') sh = Math.min(0.6, 0.12 * (f.r || 1));
      if (sh && !this.reduced) this.shake = Math.max(this.shake || 0, sh);
    }
  };

  // ---------------------------------------------------------------- Industrie: Rauch und Dunst
  Renderer.prototype.wind = function () {
    const w = this.st.wind;
    if (w == null) return { x: 0.6, y: -0.2 };
    if (typeof w === 'number') return { x: Math.cos(w), y: Math.sin(w) };
    const x = w.x != null ? w.x : (w.dx != null ? w.dx : 0), y = w.y != null ? w.y : (w.dy != null ? w.dy : 0);
    if (w.angle != null) { const s = w.speed != null ? w.speed : 1; return { x: Math.cos(w.angle) * s, y: Math.sin(w.angle) * s }; }
    return { x: x, y: y };
  };
  // Qualmwolke: (px, py) = Schornstein-Mündung, (ox, oy) = Zeichenversatz des Sprites zur Mündung
  Renderer.prototype.addPlume = function (px, py, clean, ox, oy, big, scale) {
    const P = this.plumes || (this.plumes = []);
    if (P.length >= 70) return;
    P.push({ x: px, y: py, ox: ox == null ? -6 : ox, oy: oy == null ? -14 : oy, t: 0, life: (scale ? 3 : big ? 5 : 4) + Math.random() * 1.5, clean: clean, f: (Math.random() * 4) | 0, sc: scale || 1 });
  };
  Renderer.prototype.updatePlumes = function (g, vt, dt) {
    const S = this.S, st = this.st;
    this._plumeT = (this._plumeT || 0) + dt;
    // Schornsteine aktiver Fabriken im Bild speisen Wolken nach
    if (this._plumeT > 0.35) {
      this._plumeT = 0;
      for (const s of st.structs) {
        if (s.type !== 'factory' || !s.active || s.closed || s.dead || !s.built) continue;
        if (s.x + s.w < vt.x0 - 2 || s.x > vt.x1 + 2 || s.y + s.h < vt.y0 || s.y > vt.y1 + 4) continue;
        const lv = Math.max(1, Math.min(2, s.level | 0 || 1));
        let stacks = null;
        if (typeof S.factoryStacks === 'function') { try { stacks = S.factoryStacks(s.kind, lv, !!s.filtered); } catch (e) { stacks = null; } }
        if (!Array.isArray(stacks) || !stacks.length) stacks = [{ x: s.w * 8 - 5, y: -10, dx: s.w * 8 - 11, dy: -24 }];
        for (const m of stacks) this.addPlume(s.x * 8 + m.x, s.y * 8 + m.y, !!s.filtered, m.dx != null ? m.dx - m.x : -6, m.dy != null ? m.dy - m.y : -14, s.level >= 2);
      }
    }
    const P = this.plumes;
    if (!P || !P.length) return;
    const w = this.wind(), out = [];
    for (const p of P) {
      p.t += dt;
      if (p.t >= p.life) continue;
      out.push(p);
      const k = p.t / p.life;
      p.y -= dt * 7 * (1 - k * 0.5);
      p.x += dt * w.x * 6 * (0.3 + k); p.y += dt * w.y * 6 * k;
      const base = p.clean ? 'fx_smokeplume_clean_' : 'fx_smokeplume_';
      const key = S.has(base + '0') ? base + Math.min(3, (k * 4) | 0) : 'fx_smoke_' + (p.f & 1);
      g.globalAlpha = (p.clean ? 0.6 : 0.85) * (k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88);
      const sc = (1 + k * 1.2) * p.sc;   // Wolke wächst beim Aufsteigen
      g.save(); g.translate(p.x, p.y); g.scale(sc, sc);
      S.drawFast(g, key, Math.round(p.ox), Math.round(p.oy), 0, false);
      g.restore();
    }
    g.globalAlpha = 1;
    this.plumes = out;
  };
  // Untergrund eines Bildes (in Gerätepixeln): Boden-Blöcke, Wasser, Gebietstönung, in der weiten Ansicht die Deko-Blöcke,
  // dann Narben. Wird ins Standbild gezeichnet oder (bewegte Kamera) direkt; im Ausschnitt der Figuren auch ein zweites Mal.
  Renderer.prototype.drawBase = function (g) {
    const F = this._F, st = this.st, S = this.S, cv = this.canvas, rx = F.rx, ry = F.ry, opts = F.opts;
    const cx0 = F.cx0, cx1 = F.cx1, cy0 = F.cy0, cy1 = F.cy1, vt = F.vt, low = F.low;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = this.bg || (this.bg = S.groundColor(0));
    g.fillRect(0, 0, cv.width, cv.height);
    if (F.missing) {
      // Platzhalter: Kleinbild hochskaliert, sichtbare Blöcke zuerst bauen
      g.drawImage(this.mini, 0, 0, st.W, st.H, F.ox, F.oy, Math.round(st.W * 8 * F.s), Math.round(st.H * 8 * F.s));
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks[cy * this.cw + cx];
        if (!c.built && performance.now() - F.tb < F.budget + 6) this.buildChunk(c);
      }
    }
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = this.chunks[cy * this.cw + cx];
      if (!c.built) continue;
      const X = cx * CPX, Y = cy * CPX;
      const w = Math.min(CPX, st.W * 8 - X), h = Math.min(CPX, st.H * 8 - Y);
      const dx = rx(X), dy = ry(Y), k = c.hi ? 2 : 1;
      c.usedT = this.time;
      if (c.late) { for (const li of c.late) this.groundDirty.add(li); c.late = null; }   // aufgeschobene Kacheln jetzt nachholen
      g.drawImage(c.ground, 0, 0, w * k, h * k, dx, dy, rx(X + w) - dx, ry(Y + h) - dy);
    }
    // lebendiges Wasser: Glitzern, Strömung, Brandung (über dem Boden-Cache)
    if (this.gfx.water !== false && !this.autoOff.glints) this.drawWaterLayer(g, cx0, cx1, cy0, cy1, rx, ry, low);
    // (2) Gebietstönung
    if (st.owner && opts.territory !== false) {
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const c = this.chunks[cy * this.cw + cx];
        if (c.terrDirty) this.buildTerr(c);
        if (c.terrEmpty) continue;
        const X = cx * CPX, Y = cy * CPX;
        const w = Math.min(CPX, st.W * 8 - X), h = Math.min(CPX, st.H * 8 - Y);
        const dx = rx(X), dy = ry(Y);
        g.drawImage(c.terr, 0, 0, w, h, dx, dy, rx(X + w) - dx, ry(Y + h) - dy);
      }
    }
    // weite Ansicht: Deko-Blöcke (veraltete höchstens einer je Bild neu, damit es keine Spitzen gibt)
    if (low) {
      let builds = 1, refreshed = false;
      const dcy1 = Math.min(this.chh - 1, ((vt.y1 + 5) / CH) | 0);
      const dcx0 = Math.max(0, ((vt.x0 - 3) / CH) | 0);
      for (let cy = cy0; cy <= dcy1; cy++) for (let cx = dcx0; cx <= cx1; cx++) {
        const c = this.chunks[cy * this.cw + cx];
        if (!c.built) continue;
        if (c.decorT == null) this.buildDecor(c);
        else if (c.decorDirty && builds > 0) { this.buildDecor(c); builds--; }
        else if (!refreshed && builds > 0 && this.time - c.decorT > 8 && this.time - (this._decorRefT || 0) > 0.5) { this.buildDecor(c); refreshed = true; builds--; this._decorRefT = this.time; }
        const X = cx * CPX - DL, Y = cy * CPX - DECOR_TOP;
        const dx = rx(X), dy = ry(Y);
        g.drawImage(c.decor, dx, dy, rx(X + CPX + DL + DR) - dx, ry(Y + CPX + DECOR_TOP) - dy);
      }
    }
    if (st.scars && st.scars.length) { g.setTransform(F.s, 0, 0, F.s, F.ox, F.oy); this.drawScars(g, vt); g.setTransform(1, 0, 0, 1, 0, 0); }
  };

  // Dunst: grobes Raster jede Sekunde neu, weich auf 4 Pixel je Kachel vergrößert (einmal), dann je Bild nur kopiert
  Renderer.prototype.smogUpdate = function (airView) {
    const st = this.st, pol = st.pollution;
    let cell = st.pollutionCell || (WW.INDUSTRY && WW.INDUSTRY.CFG && WW.INDUSTRY.CFG.CELL);
    if (!(cell > 0)) cell = Math.max(1, Math.round(Math.sqrt((st.W * st.H) / pol.length)));
    const cw = Math.ceil(st.W / cell), chh = Math.ceil(st.H / cell);
    if (this.time - (this._smogT == null ? -9 : this._smogT) > 1 || !this._smog || this._smogAir !== airView) {
      this._smogT = this.time; this._smogAir = airView;
      const cv = this._smog || (this._smog = document.createElement('canvas'));
      if (cv.width !== cw || cv.height !== chh) { cv.width = cw; cv.height = chh; }
      const c = cv.getContext('2d'), img = c.createImageData(cw, chh), d = img.data;
      const mx = st.pollutionMax || (pol instanceof Uint8Array || pol instanceof Uint8ClampedArray ? 255 : 100);
      for (let i = 0; i < cw * chh && i < pol.length; i++) {
        const v = Math.max(0, Math.min(1, pol[i] / mx)), o = i * 4;
        if (airView) { d[o] = 90 + v * 70; d[o + 1] = 200 - v * 140; d[o + 2] = 90 - v * 50; d[o + 3] = 150; }
        else { const h = v < 0.1 ? 0 : 0.06 + (v - 0.1) / 0.9 * 0.6; d[o] = 96; d[o + 1] = 86; d[o + 2] = 70; d[o + 3] = Math.round(Math.min(0.62, h) * 255); }   // ab ~25 ein Hauch
      }
      let any = false; for (let i = 3; i < d.length; i += 4) if (d[i] > 6) { any = true; break; }
      this._smogAny = any;
      const A = this._smogAlpha && this._smogAlpha.length === cw * chh ? this._smogAlpha : (this._smogAlpha = new Float32Array(cw * chh));
      for (let i = 0; i < cw * chh; i++) A[i] = d[i * 4 + 3] / 255;
      this._smogCell = cell; this._smogCW = cw; this._smogCH = chh;
      c.putImageData(img, 0, 0);
      if (any) {
        const q = Math.max(1, Math.min(4, Math.floor(1536 / (cw * cell))));
        const M = this._smogM || (this._smogM = document.createElement('canvas'));
        if (M.width !== cw * cell * q || M.height !== chh * cell * q) { M.width = cw * cell * q; M.height = chh * cell * q; }
        const mg = M.getContext('2d');
        mg.clearRect(0, 0, M.width, M.height);
        mg.imageSmoothingEnabled = true;
        mg.drawImage(cv, 0, 0, M.width, M.height);
        this._smogWW = cw * cell * 8; this._smogWH = chh * cell * 8;
      }
    }
    return !!this._smogAny;
  };
  // Dunststärke an einer Stelle (Kacheln), weich zwischen den Zellmitten wie die vergrößerte Ebene
  Renderer.prototype.smogAt = function (tx, ty) {
    const A = this._smogAlpha, c = this._smogCell, cw = this._smogCW, ch = this._smogCH;
    if (!A || !c) return 0;
    const fx = Math.max(0, Math.min(cw - 1, tx / c - 0.5)), fy = Math.max(0, Math.min(ch - 1, ty / c - 0.5));
    const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(cw - 1, x0 + 1), y1 = Math.min(ch - 1, y0 + 1), ax = fx - x0, ay = fy - y0;
    return (A[y0 * cw + x0] * (1 - ax) + A[y0 * cw + x1] * ax) * (1 - ay) + (A[y1 * cw + x0] * (1 - ax) + A[y1 * cw + x1] * ax) * ay;
  };
  // Umriss eines Sprites in Dunstfarbe (zwischengespeichert) mit Stärke a über das Sprite legen
  Renderer.prototype.drawHaze = function (g, key, px, py, flip, a) {
    const m = this._hazeC || (this._hazeC = new Map()), id = flip ? key + '|f' : key;
    let e = m.get(id);
    if (e === undefined) {
      e = null;
      const inf = this.S.info(key);
      if (inf && inf.w > 0 && inf.h > 0) {
        const cv = document.createElement('canvas'); cv.width = inf.w; cv.height = inf.h;
        const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
        const fox = inf.fw * 8 - inf.dw - inf.ox, ox = flip ? fox : inf.ox;
        c.setTransform(inf.w / inf.dw, 0, 0, inf.h / inf.dh, -ox * inf.w / inf.dw, -inf.oy * inf.h / inf.dh);
        this.S.drawFast(c, key, 0, 0, 0, flip);
        c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-in'; c.fillStyle = 'rgb(96,86,70)'; c.fillRect(0, 0, inf.w, inf.h);
        e = { cv: cv, x: ox, y: inf.oy, w: inf.dw, h: inf.dh };
      }
      m.set(id, e);
    }
    if (!e) return;
    g.globalAlpha = Math.min(0.62, a);
    g.drawImage(e.cv, px + e.x, py + e.y, e.w, e.h);
    g.globalAlpha = 1;
  };
  // Dunst-Ebene in Weltkoordinaten (Transformation ist gesetzt), pixelgenau (kein Weichzeichnen je Bild)
  Renderer.prototype.drawSmogLayer = function (g) {
    if (!this._smogAny || !this._smogM) return;
    const w = this.wind(), sh = this._smogAir ? 0 : (this._smogSh || 0);
    g.drawImage(this._smogM, sh * w.x, sh * w.y, this._smogWW, this._smogWH);
  };

  Renderer.prototype.drawWindArrow = function (g, cam) {
    const d = cam.dpr, w = this.wind(), a = Math.atan2(w.y, w.x);
    const cx = (cam.viewW - 56) * d, cy = (cam.insetTop || 150) * d;
    g.fillStyle = 'rgba(10,26,33,0.85)'; g.fillRect(cx - 26 * d, cy - 26 * d, 52 * d, 52 * d);
    g.save(); g.translate(cx, cy); g.rotate(a);
    g.fillStyle = '#f3ead2'; g.fillRect(-14 * d, -2 * d, 20 * d, 4 * d);
    g.beginPath(); g.moveTo(14 * d, 0); g.lineTo(4 * d, -8 * d); g.lineTo(4 * d, 8 * d); g.fill();
    g.restore();
    g.fillStyle = '#b9c4b8'; g.font = '600 ' + Math.round(10 * d) + 'px ' + FONT_PIXEL; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.fillText('Wind', cx, cy + 22 * d);
    g.textAlign = 'start';
  };

  // große Narben (Krater 3×3/5×5, Risse), verblassen mit ttl
  Renderer.prototype.drawScars = function (g, vt) {
    const S = this.S;
    for (const sc of this.st.scars) {
      if (!sc || sc.x < vt.x0 - 3 || sc.x > vt.x1 + 3 || sc.y < vt.y0 - 3 || sc.y > vt.y1 + 3) continue;
      const key = sc.kind === 'crack' ? (S.has('fx_crack') ? 'fx_crack' : 't_crack') : 't_' + sc.kind;
      if (!S.has(key)) continue;
      const half = sc.kind === 'crater_l' ? 2 : sc.kind === 'crater_m' ? 1 : 0;
      g.globalAlpha = sc.ttl != null ? Math.max(0, Math.min(1, sc.ttl / 600)) : 1;
      S.drawFast(g, key, (Math.floor(sc.x) - half) * 8, (Math.floor(sc.y) - half) * 8, 0, false);
    }
    g.globalAlpha = 1;
  };

  // laufende Kräfte (Wirbelsturm, Flut, Frost, Säureregen, Vulkan, Schwarzes Loch …)
  Renderer.prototype.drawEffects = function (g, list, vt) {
    const S = this.S, t = this.time;
    for (const e of list) {
      if (!e || !(e.x >= 0)) continue;
      const r = (e.r || 3) * 8, px = e.x * 8, py = e.y * 8;
      if (e.x < vt.x0 - 12 || e.x > vt.x1 + 12 || e.y < vt.y0 - 12 || e.y > vt.y1 + 12) continue;
      const fr = this.fxFrames(e.type);
      if (fr.length) {
        const key = fr[((t * 8) | 0) % fr.length], inf = S.info(key);
        S.drawFast(g, key, px - (inf ? (inf.w / 2 | 0) + inf.ox : 4), py - (inf ? inf.h + inf.oy : 8) + 4, 0, false);
        continue;
      }
      switch (e.type) {
        case 'flood': g.fillStyle = 'rgba(79,159,230,0.28)'; g.beginPath(); g.ellipse(px, py, r, r * 0.8, 0, 0, Math.PI * 2); g.fill(); break;
        case 'frost': g.fillStyle = 'rgba(230,244,252,0.3)'; g.beginPath(); g.ellipse(px, py, r, r * 0.8, 0, 0, Math.PI * 2); g.fill(); break;
        case 'acidrain':
          for (let j = 0; j < 30; j++) { const ox = (rnd(e.id | 0, j) - 0.5) * 2 * r, ph = (rnd(e.id | 0, j + 50) + t * 2) % 1; g.fillStyle = 'rgba(156,194,58,0.8)'; g.fillRect(px + ox, py + (rnd(e.id | 0, j + 9) - 0.5) * r - 24 + ph * 24, 1, 3); }
          break;
        case 'tornado':
          g.fillStyle = 'rgba(200,205,215,0.75)';
          for (let j = 0; j < 9; j++) { const w = 3 + j * 1.6, yy = py - j * 3, xo = Math.sin(t * 8 + j) * 2; g.fillRect(px - w / 2 + xo, yy, w, 2); }
          break;
        case 'blackhole':
          g.fillStyle = 'rgba(20,8,32,0.9)'; g.beginPath(); g.arc(px, py, r * 0.4, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(189,138,240,0.8)'; g.lineWidth = 2;
          for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(px, py, r * (0.5 + j * 0.15), t * (3 - j) + j, t * (3 - j) + j + 2.2); g.stroke(); }
          break;
        case 'volcano': g.fillStyle = 'rgba(240,100,42,' + (0.25 + 0.15 * Math.sin(t * 5)) + ')'; g.beginPath(); g.arc(px, py, r * 0.5, 0, Math.PI * 2); g.fill(); break;
      }
    }
  };

  // Züge: Lok und Wagen (fein, unten mittig verankert). Wagen ohne eigene Position reihen sich hinter der Lok
  // (seitlich 2 Kacheln, nord/süd 1 Kachel Abstand); Rauch 3 px vor der Lokmitte, 16 px darüber
  const TRAIN_DIR = { e: [1, 0], w: [-1, 0], n: [0, -1], s: [0, 1], 0: [1, 0], 1: [0, 1], 2: [-1, 0], 3: [0, -1] };
  Renderer.prototype.drawTrains = function (g, list, vt) {
    const S = this.S;
    this._trainSmoke = (this._trainSmoke || 0) - (this._lastDt || 0.016);
    const puff = this._trainSmoke <= 0;
    if (puff) this._trainSmoke = 0.35;
    for (const t of list) {
      if (!t || !(t.x >= -2)) continue;
      const dirOf = (d) => (typeof d === 'string' && /^[ewns]$/.test(d)) ? d : (['e', 's', 'w', 'n'][((d | 0) % 4 + 4) % 4] || 'e');
      const dir = dirOf(t.dir), v = TRAIN_DIR[dir];
      const cars = Array.isArray(t.cars) ? t.cars : (t.cars | 0) > 0 ? new Array(t.cars | 0).fill(null) : [];
      const gap = v[0] ? 2 : 1;
      const parts = [{ part: 'loco', x: t.x, y: t.y, dir: dir }];
      cars.forEach((c, i) => {
        const cc = c && typeof c === 'object' ? c : {};
        parts.push({ part: 'car', kind: cc.kind || t.kind || 'freight', dir: cc.dir != null ? dirOf(cc.dir) : dir,
          x: cc.x != null ? cc.x : t.x - v[0] * gap * (i + 1), y: cc.y != null ? cc.y : t.y - v[1] * gap * (i + 1) });
      });
      // hinten zuerst zeichnen, damit die Lok vorne liegt (bei Fahrt nach Süden umgekehrt)
      const order = v[1] < 0 ? parts : parts.slice().reverse();
      for (const p of order) {
        if (p.x < vt.x0 - 3 || p.x > vt.x1 + 3 || p.y < vt.y0 - 3 || p.y > vt.y1 + 3) continue;
        let key = null;
        if (typeof S.trainKey === 'function') { try { key = S.trainKey(p.part, p.kind || 'freight', p.dir); } catch (e) { key = null; } }
        const px = Math.round(p.x * 8), py = Math.round(p.y * 8);
        if (key && S.has(key)) {
          const inf = S.info(key), sc = (inf && inf.scale) || 1, w = inf ? inf.w * sc : 8, fw = inf ? inf.fw : 1;
          S.drawFast(g, key, px - fw * 4, py - (inf ? inf.fh * 8 : 8), t.colorIndex != null ? t.colorIndex : 10, false);
          void w;
        } else { g.fillStyle = '#0a1a21'; g.fillRect(px - 4, py - 6, 8, 5); g.fillStyle = p.part === 'loco' ? '#3e3150' : '#9a6233'; g.fillRect(px - 3, py - 5, 6, 3); }
        if (p.part === 'loco' && puff) this.addPlume(px + v[0] * 3, py - 16, false, -6, -14, false, 0.6);
      }
    }
  };

  // Flugzeuge über allem: Schatten am Boden, Rumpf um angle gedreht (oder Richtungs-Frame)
  Renderer.prototype.drawAircraft = function (g, list) {
    const S = this.S;
    for (const a of list) {
      if (!a || !(a.x >= 0)) continue;
      const kind = a.kind || 'bomber', px = a.x * 8, py = a.y * 8, alt = a.alt != null ? a.alt * 8 : 22;
      const ang = +a.angle || 0;
      const sk = S.has('a_' + kind + '_shadow') ? 'a_' + kind + '_shadow' : 'fx_' + kind + '_shadow';
      const draw = (key, x, y) => {
        const inf = S.info(key);
        if (!inf) return false;
        g.save(); g.translate(x, y); g.rotate(ang);
        S.drawFast(g, key, -Math.round(inf.w / 2) - inf.ox, -Math.round(inf.h / 2) - inf.oy, 0, false);
        g.restore(); return true;
      };
      if (!draw(sk, px + 4, py + 4)) { g.fillStyle = 'rgba(10,26,33,0.3)'; g.beginPath(); g.ellipse(px + 4, py + 4, 6, 3, ang, 0, Math.PI * 2); g.fill(); }
      const frames = this.fxFrames(kind);
      const af = 'a_' + kind + '_' + (((this.time * 10) | 0) & 1);
      const key = S.has(af) ? af : S.has('fx_' + kind) ? 'fx_' + kind : (frames.length ? frames[((this.time * 10) | 0) % frames.length] : null);
      if (!key || !draw(key, px, py - alt)) { g.fillStyle = '#58637a'; g.save(); g.translate(px, py - alt); g.rotate(ang); g.fillRect(-6, -2, 12, 4); g.fillRect(-2, -7, 4, 14); g.restore(); }
    }
  };

  Renderer.prototype.fxFrames = function (type) {
    const c = this._fxF || (this._fxF = {});
    if (c[type]) return c[type];
    const out = [];
    // feine Phasen der Grafik: Explosion -> blast_*, Pilzwolke -> nuke
    const alias = { mushroom: this.S.has('fx_nuke_l_0') ? 'nuke_l' : 'nuke', explosion: 'blast_m', explosion_big: 'blast_l', explosion_small: 'blast_s' }[type];
    if (alias && typeof this.S.fxFrames === 'function' && this.S.has('fx_' + alias + '_0')) {
      const n = this.S.fxFrames(alias);
      for (let i = 0; i < n; i++) out.push('fx_' + alias + '_' + i);
      return (c[type] = out);
    }
    for (let n = 0; n < 12 && this.S.has('fx_' + type + '_' + n); n++) out.push('fx_' + type + '_' + n);
    if (!out.length && this.S.has('fx_' + type)) out.push('fx_' + type);
    return (c[type] = out);
  };

  // Bauwerks-Variante 0..255 (alte Welten ohne Feld: aus der ID)
  function varOf(s) { return s.variant != null ? s.variant & 255 : (Math.imul(s.id | 0, 2654435761) >>> 24) & 255; }

  function k2(t) { return ((t * 20) | 0) & 1; }

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
        case 'muzzle': {
          const k = S.has('fx_muzzle_' + (k2(f.t) ? 1 : 0)) ? 'fx_muzzle_' + (k2(f.t) ? 1 : 0) : 'fx_sparkle_0';
          S.drawFast(g, k, px - 4, py - 8, 0, false);
          break;
        }
        case 'bolt_shot': case 'rock':
        case 'arrow': {
          if (f.x2 == null) break;
          const ak = f.type !== 'arrow' && S.has('fx_' + f.type) ? 'fx_' + f.type : (f.type === 'rock' && S.has('fx_rock_0') ? 'fx_rock_0' : 'fx_arrow');
          const x = px + ((f.x2 * 8) - px) * k, y = py + ((f.y2 * 8) - py) * k - Math.sin(k * Math.PI) * 6;
          const ang = Math.atan2((f.y2 - f.y) * 8, (f.x2 - f.x) * 8);
          g.save(); g.translate(x, y); g.rotate(ang); S.drawFast(g, ak, -4, -4, 0, false); g.restore();
          break;
        }
        case 'bolt':
          g.globalAlpha = k < 0.5 ? 1 : (1 - k) * 2;
          S.drawFast(g, S.has('fx_bolt_0') ? 'fx_bolt_' + (((f.t * 20) | 0) & 1) : 'fx_bolt', px - 4, py - 4, 0, (f.seed & 1) === 1);
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
        case 'smoke': case 'dust': case 'poof': case 'dud': {
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
        case 'sparkle': case 'restyle': case 'govchange': case 'hit': case 'spark': case 'ward': {
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
        case 'treeFall': {
          if (S.has('fx_treefall_0')) {
            const n = typeof S.fxFrames === 'function' ? S.fxFrames('treefall') : 5;
            g.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
            S.drawFast(g, 'fx_treefall_' + Math.min(n - 1, (k / 0.75 * n) | 0), Math.round(px - 4), Math.round(py - 4), 0, (f.seed & 1) === 1);
            g.globalAlpha = 1;
            break;
          }
          // Baum kippt um seinen Fuß, schlägt auf und verblasst
          const key = S.has('d_tree_0') ? 'd_tree_' + ((f.seed & 3) % (S.has('d_tree_3') ? 4 : 1)) : null;
          if (!key) break;
          const dir = (f.seed & 1) ? 1 : -1, fall = Math.min(1, k / 0.55);
          const ang = dir * (fall * fall) * Math.PI * 0.48 + (k > 0.55 && k < 0.65 ? dir * Math.sin((k - 0.55) * 60) * 0.03 : 0);
          g.save(); g.translate(px, py + 3); g.rotate(ang);
          g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
          S.drawFast(g, key, -4, -11, 0, dir < 0);
          g.restore();
          if (k > 0.5 && k < 0.8) { g.globalAlpha = (0.8 - k) * 3; S.drawFast(g, 'fx_smoke_0', px - 4 + dir * 8, py - 4, 0, false); }
          g.globalAlpha = 1;
          break;
        }
        case 'whistle': {
          // kleines Dampfwölkchen über der Lok
          g.globalAlpha = 1 - k; g.fillStyle = '#fbf7ee';
          g.fillRect(px - 1, py - 18 - k * 6, 3, 2); g.fillRect(px + 1, py - 21 - k * 8, 2, 2);
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
        case 'flash': case 'swim': case 'sail':
          break;
        case 'shell': {
          // Granate fliegt im Bogen von (x0,y0) nach (x1,y1)
          if (f.x0 == null || f.x1 == null) break;
          const x = (f.x0 + (f.x1 - f.x0) * k) * 8, y = (f.y0 + (f.y1 - f.y0) * k) * 8 - Math.sin(k * Math.PI) * Math.min(40, 6 + Math.hypot(f.x1 - f.x0, f.y1 - f.y0) * 2.2);
          const fk = 'fx_shell_' + (((f.t * 12) | 0) % 3);
          if (S.has(fk)) S.drawFast(g, fk, Math.round(x) - 4, Math.round(y) - 4, 0, false); else { g.fillStyle = '#2b2533'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); }
          break;
        }
        case 'tankfire': case 'wake': {
          // Mündungsfeuer des Panzers / Kielwasser: Bilder zeigen nach rechts, für links gespiegelt
          const fr = this.fxFrames(f.type);
          if (!fr.length) break;
          const left = f.type === 'wake' ? ((f.dir | 0) & 3) === 2 : (f.x2 != null ? f.x2 < f.x : ((f.dir | 0) & 3) === 2);
          const key = fr[Math.min(fr.length - 1, (k * fr.length) | 0)];
          g.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
          S.drawFast(g, key, px - 4, py - (f.type === 'wake' ? 2 : 6), 0, left);
          g.globalAlpha = 1;
          break;
        }
        case 'shipfire': {
          // Breitseite: kurzer Feuerstrich zum Ziel, Rauch an der Bordwand
          if (f.x2 != null) { g.strokeStyle = 'rgba(255,220,120,' + (1 - k) + ')'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py - 3); g.lineTo(f.x2 * 8, f.y2 * 8 - 2); g.stroke(); }
          g.globalAlpha = 1 - k; S.drawFast(g, 'fx_smoke_' + (f.seed & 1), px - 4, py - 8 - k * 6, 0, false); g.globalAlpha = 1;
          break;
        }
        case 'shipsink': case 'dig': case 'wreck': {
          g.globalAlpha = (1 - k) * 0.8;
          for (let j = 0; j < 3; j++) S.drawFast(g, f.type !== 'shipsink' ? 'fx_smoke_' + (j & 1) : (S.has('fx_splash_0') ? 'fx_splash_' + Math.min(3, (k * 4) | 0) : 'fx_smoke_0'), px - 4 + (rnd(f.seed, j) - 0.5) * 8, py - 4 - k * (f.type === 'dig' ? 6 : 2), 0, false);
          g.globalAlpha = 1;
          break;
        }
        case 'battlepick': case 'campgate': case 'freed': case 'memorial': case 'caravan': case 'horn': {
          // freundliche Funken (Befreiung, Enthüllung, Ankunft der Karawane, Wahl der Kraft)
          const n = f.type === 'freed' ? 22 : f.type === 'horn' ? 3 : 10, r = (f.type === 'freed' ? 3 : 1.4) * 8;
          for (let j = 0; j < n; j++) {
            const ph = (k * 2 + rnd(f.seed, j)) % 1;
            g.globalAlpha = Math.sin(Math.min(1, k * 1.2) * Math.PI);
            S.drawFast(g, 'fx_sparkle_' + (ph < 0.5 ? 0 : 1), px - 4 + (rnd(f.seed, j) - 0.5) * 2 * r, py - 8 + (rnd(f.seed, j + 3) - 0.5) * r - k * 8, 0, false);
          }
          g.globalAlpha = 1;
          break;
        }
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
          let fr = this.fxFrames(f.type === 'explosion' ? ((f.r || 1) >= 3 ? 'explosion_big' : (f.r || 1) < 1.5 && this.S.has('fx_blast_s_0') ? 'explosion_small' : 'explosion') : f.type);
          const fine = this.S.has('fx_blast_m_0');
          const sc = fine ? (f.type === 'explosion' ? Math.max(1, Math.min(2.5, (f.r || 1) / 4)) : (this.S.has('fx_nuke_l_0') ? Math.max(1, (f.r || 10) / 12) : Math.max(1.6, (f.r || 10) / 6))) :
            f.type === 'explosion' ? Math.max(1, Math.min(4, (f.r || 1) / (this.fxFrames('explosion_big').length && (f.r || 1) >= 3 ? 3 : 1.2))) : Math.max(1, (f.r || 1) / 4);
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
          const iw = inf ? (inf.dw || inf.w) : 8, ih = inf ? (inf.dh || inf.h) : 8;
          S.drawFast(g, key, -Math.round(iw / 2) - (inf ? inf.ox : 0), -ih - (inf ? inf.oy : 0) + 4, 0, false);
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
  // Kultur eines Bauwerks (eigene Angabe, sonst Stadt); nur Kulturen mit eigener Grafik (sahel, nil, nord …)
  Renderer.prototype.cultureOf = function (s) {
    let cu = s.culture;
    if (!cu) { const c = this._cityById ? this._cityById.get(s.cityId) : null; cu = c && c.culture; }
    return cu && cu !== 'mitte' ? cu : null;
  };
  Renderer.prototype.structKey = function (s, gov) {
    const S = this.S;
    const style = s.style || gov || 'tribe';
    if (!s.built) return s.w >= 3 ? 's_site_3' : (s.w >= 2 ? 's_site_2' : 's_site');
    switch (s.type) {
      case 'center': {
        // Kultur (sahel, nil, nord): eigene Zentren je Ausbaustufe
        const cu = this.cultureOf(s);
        if (cu && typeof S.centerKey === 'function') { let k = null; try { k = S.centerKey(style, s.stage == null ? 2 : s.stage, cu, varOf(s)); } catch (e) { k = null; } if (k && S.has(k) && k.indexOf('_' + cu) > 0) return k; }
        // Ausbaustufen: 0 Lager, 1 Dorfhalle, 2 (oder fehlend) Regierungssitz
        if (s.stage === 0) { const k = this.pickVar(S.campKey, ['s_camp_a', 's_camp_b'], s); if (k) return k; }
        if (s.stage === 1) { const k = this.pickVar(S.hallKey, ['s_hall_a', 's_hall_b'], s); if (k) return k; }
        return 's_center_' + style;
      }
      case 'house': {
        const cu = this.cultureOf(s);
        if (cu) { let k = null; try { k = S.houseKey(style, s.level | 0, varOf(s), cu); } catch (e) { k = null; } if (k && S.has(k) && k.indexOf('_' + cu + '_') > 0) return k; }
        if (s.level === 0) { const k = this.pickVar(S.tentKey, ['s_tent_a', 's_tent_b', 's_tent_c', 's_tent_d'], s); if (k) return k; }
        return S.houseKey(style, Math.max(1, s.level | 0), varOf(s));
      }
      case 'field': return 's_field_' + Math.max(0, Math.min(3, s.growth | 0));
      case 'monument': return 's_monument_' + style;
      case 'pyramid': { const k = 's_monument_' + Math.max(0, Math.min(2, s.stage != null ? s.stage | 0 : (s.level | 0) - 1)); return S.has(k) ? k : 's_monument_' + style; }
      case 'market': { const cu = this.cultureOf(s); if (cu && typeof S.marketKey === 'function') { const k = S.marketKey(cu); if (k && S.has(k)) return k; } return 's_market'; }
      case 'temple': { const cu = this.cultureOf(s); if (cu && typeof S.templeKey === 'function') { const k = S.templeKey(cu); if (k && S.has(k)) return k; } return S.has('s_temple') ? 's_temple' : 's_monument_' + style; }
      case 'arsenal': { const k = typeof S.arsenalKey === 'function' ? S.arsenalKey(style) : 's_arsenal_' + style; return S.has(k) ? k : (S.has('s_barracks') ? 's_barracks' : 's_ruin_2'); }
      case 'camphq': case 'barrack': { const k = typeof S.campBuildKey === 'function' ? S.campBuildKey(s.type, style) : 's_' + s.type; return S.has(k) ? k : (S.has('s_' + s.type) ? 's_' + s.type : 's_barracks'); }
      case 'harbor': {
        const side = s.side || ['e', 's', 'w', 'n'][(s.dockDir | 0) & 3] || 's';
        let k = null;
        if (typeof S.harborKey === 'function') { try { k = S.harborKey(style, this.cultureOf(s), side); } catch (e) { k = null; } }
        return k && S.has(k) ? k : (S.has('s_harbor') ? 's_harbor' : 's_market');
      }
      case 'memorial': return S.has('s_memorial') ? 's_memorial' : 's_ruin';
      case 'wall': case 'gate': case 'tower': return this.wallishKey(s, style);
      case 'factory': {
        const lv = Math.max(1, Math.min(2, s.level | 0 || (s.w >= 3 ? 2 : 1)));
        if (s.closed && S.has('s_factory_ruin_' + lv)) return 's_factory_ruin_' + lv;
        let k = null;
        if (typeof S.factoryKey === 'function') { try { k = S.factoryKey(s.kind, lv, !!s.filtered); } catch (e) { k = null; } }
        if (k && S.has(k)) return k;
        k = 's_factory_' + s.kind + '_' + lv + (s.filtered ? '_filter' : '');
        if (S.has(k)) return k;
        if (S.has('s_factory_' + s.kind + '_' + lv)) return 's_factory_' + s.kind + '_' + lv;
        return s.w >= 3 ? 's_center_communism' : 's_barracks';   // Platzhalter, bis die Grafik da ist
      }
      case 'station': if (s.campStation && S.has('s_camp_station')) return 's_camp_station';
        return typeof S.stationKey === 'function' && S.has(S.stationKey(style)) ? S.stationKey(style) : (S.has('s_station') ? 's_station' : 's_market');
      case 'laborcamp': { const k = typeof S.laborcampKey === 'function' ? S.laborcampKey(style, !!s.ruin || !!s.closed) : 's_laborcamp'; return S.has(k) ? k : 's_barracks'; }
      case 'mine': { const k = typeof S.mineKey === 'function' ? S.mineKey(s.res || s.ore || s.kind) : 's_mine'; return S.has(k) ? k : 's_quarry'; }
      case 'lair': return this.S.has('s_lair_' + s.kind) ? 's_lair_' + s.kind : 's_ruin';
      case 'ruin':
        if (s.ruinOf === 'laborcamp') {
          // Mahnmal: großes Ruinenbild nur auf der linken oberen Ruinen-Kachel, die übrigen leer lassen
          const st2 = this.st, W2 = st2.W;
          const isCampRuin = (x, y) => { const o = this.structById ? this.structById(st2.structAt[y * W2 + x]) : null; return o && o.type === 'ruin' && o.ruinOf === 'laborcamp'; };
          const ck = S.has('s_memorial') ? 's_memorial' : typeof S.laborcampKey === 'function' ? S.laborcampKey(style, true) : 's_laborcamp_ruin';
          if (S.has(ck)) return (s.x > 0 && isCampRuin(s.x - 1, s.y)) || (s.y > 0 && isCampRuin(s.x, s.y - 1)) ? null : ck;
        }
        return s.w >= 3 ? 's_ruin_3' : (s.w >= 2 ? 's_ruin_2' : 's_ruin');
      default: return this.S.has('s_' + s.type) ? 's_' + s.type : (s.w >= 2 ? 's_ruin_2' : 's_ruin');
    }
  };

  // Figuren-Schlüssel: u_<volk>_<rolle>, sonst u_<rolle> (Banditen, Rammen …), sonst Mensch, sonst Bauer
  // Regierungswechsel je Reich merken (Zeitpunkt in Ticks), Tracht pro Einheit zeitversetzt
  const COSTUME_TICKS = 360;   // 1,5 Spieljahre
  Renderer.prototype.trackGovs = function () {
    const st = this.st, h = this._govHist || (this._govHist = new Map());
    if (!st.kingdoms) return;
    for (const k of st.kingdoms) {
      const e = h.get(k.id);
      if (!e) h.set(k.id, { cur: k.gov, prev: k.gov, t: -1e9 });
      else if (e.cur !== k.gov) { e.prev = e.cur; e.cur = k.gov; e.t = st.tick || 0; }
    }
  };
  Renderer.prototype.costumeGov = function (u, gov) {
    const e = this._govHist && this._govHist.get(u.kingdomId);
    if (!e || e.cur !== gov) return gov;
    const age = (this.st.tick || 0) - e.t;
    if (age >= COSTUME_TICKS) return gov;
    const r = (Math.imul((u.id | 0) ^ 0x2c1b3c6d, 2654435761) >>> 16) / 65536;
    return r < age / COSTUME_TICKS ? gov : e.prev;
  };
  // Lauf-Frame: Anzahl aus unitFrames(role) (Zahl oder { walk, stand }), sonst 2
  Renderer.prototype.unitFrame = function (u) {
    const S = this.S;
    let walk = 2, stand = 0;
    if (typeof S.unitFrames === 'function') {
      let f = null;
      try { f = S.unitFrames(u.role || 'farmer'); } catch (e) { f = null; }
      if (typeof f === 'number' && f > 0) walk = f;
      else if (f && typeof f === 'object') { walk = f.walk || f.frames || 2; if (f.stand != null) stand = f.stand; else if (f.idle != null) stand = f.idle; }
    }
    if (!u.moving) {
      // Kampf-Pose im Wechsel mit dem Steh-Frame
      if (this._hasAttack == null) { let f = null; try { f = typeof S.unitFrames === 'function' ? S.unitFrames('soldier') : null; } catch (e) { f = null; } this._hasAttack = !!(f && f.attack); }
      if (this._hasAttack && u.foe != null && u.foe >= 0 && ((this.time * 4 + (u.id & 3)) | 0) & 1) return 'attack';
      return stand;
    }
    return ((this.time * (walk > 2 ? 9 : 5) + (u.id & 7) * 0.37) | 0) % walk;
  };

  // Mauer, Tor, Turm: Stufe bis 6 durchreichen; fehlt das Sprite, nächstniedrigere Stufe
  Renderer.prototype.wallishKey = function (s, style) {
    const S = this.S, st = this.st;
    if (s.mat === 'fence') {
      // Lagerzaun: Pfosten und Draht, Tor (mit Gleis: breit offen), Wachturm
      let k = null;
      try { k = s.type === 'wall' ? S.wallKey('fence', 1, s.mask) : s.type === 'gate' ? S.gateKey('fence', 1, s.orient === 'v' ? 'v' : 'h', !!s.rail) : S.towerKey('fence', 1); } catch (e) { k = null; }
      if (k && S.has(k)) return k;
    }
    if (s.type === 'gate' && s.rail) { let k = null; try { k = S.gateKey(style, Math.max(1, s.level | 0), s.orient === 'v' ? 'v' : 'h', true); } catch (e) { k = null; } if (k && S.has(k) && k !== S.gateKey(style, Math.max(1, s.level | 0), s.orient === 'v' ? 'v' : 'h')) return k; }
    const river = st.terrain[s.y * st.W + s.x] === WW.T.RIVER;
    for (let lv = Math.max(1, s.level | 0); lv >= 1; lv--) {
      let k = null;
      if (s.type === 'wall') k = river && style !== 'anarchy' ? S.waterWallKey(style, lv, (s.mask & 10) ? 'h' : 'v') : S.wallKey(style, lv, s.mask);
      else if (s.type === 'gate') k = style === 'anarchy' ? S.wallKey(style, lv, s.mask) : S.gateKey(style, lv, s.orient === 'v' ? 'v' : 'h');
      else k = S.towerKey(style, lv) || S.wallKey(style, lv, s.mask);
      if (k && S.has(k)) return k;
    }
    return s.type === 'gate' ? 's_gate_1_h' : 's_wall_1_' + (s.mask & 15);
  };

  // Sprite über Helfer (Schlüssel-Funktion) oder Liste, gewählt nach variant; null wenn nichts existiert
  Renderer.prototype.pickVar = function (fn, list, s) {
    const S = this.S, v = varOf(s);
    if (typeof fn === 'function') { try { const k = fn(v); if (k && S.has(k)) return k; } catch (e) { /* weiter */ } }
    const ok = list.filter(k => S.has(k));
    return ok.length ? ok[v % ok.length] : null;
  };

  const VDIR = ['e', 's', 'w', 'n'];
  Renderer.prototype.unitKey = function (u, gov, frame) {
    const S = this.S, race = u.race || 'human';
    let role = u.role || 'farmer';
    // Fahrzeuge (Panzer, Geschütz): eigene Bilder je Richtung
    if (u.vehicle && typeof S.vehicleKey === 'function') {
      let k = null;
      const vf = role === 'tank' ? (u.moving ? ((this.time * 6 + (u.id & 3)) | 0) & 1 : 0) : (this.muzzleT && this.time - (this.muzzleT.get(Math.floor(u.y) * this.st.W + Math.floor(u.x)) || -9) < 0.3 ? 1 : 0);
      try { k = S.vehicleKey(role === 'artillery' ? 'artillery' : 'tank', u.gov || gov || 'tribe', VDIR[(u.vdir | 0) & 3], vf); } catch (e) { k = null; }
      if (k && S.has(k)) return k;
    }
    // Kriegsgefangene in der abgetragenen Uniform ihres Reichs
    if (role === 'prisoner' && u.pow >= 0) role = 'pow';
    if (typeof S.unitKey === 'function') {
      // Tracht je Regierung; nach einem Wechsel ziehen sich die Leute zeitversetzt um
      const g = this.costumeGov(u, gov || 'tribe');
      let k = null;
      const cu = u.culture && u.culture !== 'mitte' ? u.culture : null;
      if (cu) { try { k = S.unitKey(race, role, g, frame, cu); } catch (e) { k = null; } if (k && S.has(k)) return k; }
      try { k = S.unitKey(race, role, g, frame); } catch (e) { k = null; }
      if (k && S.has(k)) return k;
      if (role === 'pow') { role = 'prisoner'; try { k = S.unitKey(race, role, g, frame); } catch (e) { k = null; } if (k && S.has(k)) return k; }
      if (k && S.has(k)) return k;
      if (typeof frame !== 'number') { try { k = S.unitKey(race, role, g, 0); } catch (e) { k = null; } if (k && S.has(k)) return k; }
    }
    if (typeof frame !== 'number') frame = 0;
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
    const hiNow = this.useHi();
    if (this._hiWas !== undefined && this._hiWas !== hiNow) this.markAll();
    this._hiWas = hiNow;
    this.flushDirty();
    const budget = opts.firstFrames ? 40 : 7;
    const tb = performance.now();
    while (this.buildQueue.length && performance.now() - tb < budget) {
      const c = this.buildQueue.shift();
      if (!c.built) this.buildChunk(c);
    }
    this.trackGovs();
    if (st.cities) { const m = this._cityById || (this._cityById = new Map()); m.clear(); for (const c of st.cities) m.set(c.id, c); }
    this.terrScanT -= dt;
    if (st.owner && this.terrScanT <= 0) { this.scanTerritory(); this.terrScanT = 0.3; }

    const off = cam.offset();
    let s = off.s, ox = off.ox, oy = off.oy;
    if (this.shake > 0) { this.shake -= dt; const a = this.shake * 10 * cam.dpr; ox += Math.round((Math.random() - 0.5) * a); oy += Math.round((Math.random() - 0.5) * a); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const vt = cam.visibleTiles(st.W, st.H, 1);
    const ntiles = (vt.x1 - vt.x0 + 1) * (vt.y1 - vt.y0 + 1);
    const low = ntiles > LOW_DETAIL_TILES;

    // (1) Boden
    const cx0 = Math.max(0, (vt.x0 / CH) | 0), cx1 = Math.min(this.cw - 1, (vt.x1 / CH) | 0);
    const cy0 = Math.max(0, (vt.y0 / CH) | 0), cy1 = Math.min(this.chh - 1, ((vt.y1) / CH) | 0);
    let missing = false;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) if (!this.chunks[cy * this.cw + cx].built) missing = true;
    const rx = (wx) => Math.round(ox + wx * s), ry = (wy) => Math.round(oy + wy * s);
    this._F = { s: s, ox: ox, oy: oy, rx: rx, ry: ry, cx0: cx0, cx1: cx1, cy0: cy0, cy1: cy1, vt: vt, low: low, missing: missing, tb: tb, budget: budget, opts: opts };
    // nahe Ansicht: ruhende Objekte aus vorgebackenen Block-Bildern, Bewegtes darüber (siehe Objekt-Ebene)
    const near = !low && this.gfx.objcache !== false;
    const urgent = !!(opts.brush || opts.held);
    const smogOn = !!(st.pollution && st.pollution.length) && this.smogUpdate(opts.view === 'air');
    let P = 0;
    if (st.structs) this.objPass();   // auch in der weiten Ansicht: geänderte Bauwerke erneuern dort die Deko-Blöcke
    if (near) P = this.objPrepare(cx0, cx1, cy0, cy1, s, urgent);
    // Standbild: ruht die Kamera, wird der Boden (Gelände, Wasser, Gebiete, Narben, Deko der weiten Ansicht) nur 5-mal je
    // Sekunde neu zusammengesetzt, mit Werkzeug in der Hand sofort bei jeder Bodenänderung. Darüber liegt ein zweites Bild mit
    // den ruhenden Objekten und dem Dunst; je Bild wird nur dieses kopiert und Bewegtes darübergelegt.
    const SK = s + '|' + ox + '|' + oy + '|' + cv.width + '|' + cv.height + '|' + (low ? 1 : 0);
    const wf = (this.time * 5) | 0;
    this._patchBase = null; this._patchA0 = null;
    const camStill = SK === this._camKey && !(this.shake > 0);
    if (camStill && !missing && !opts.firstFrames && this.gfx.still !== false) {
      const mk = (c) => { if (!c) c = document.createElement('canvas'); if (c.width !== cv.width || c.height !== cv.height) { c.width = cv.width; c.height = cv.height; } return c; };
      const bc = this._stBase = mk(this._stBase);
      const bkey = SK + '|' + wf;
      let baseNew = false;
      if (this._bKey !== bkey || (urgent && this._bG !== this._gver)) {
        this.drawBase(bc.getContext('2d', { alpha: false }));
        this._bKey = bkey; this._bG = this._gver; baseNew = true;
      }
      // A0 = Boden + ruhende Objekte; A = A0 + Dunst
      let a0 = bc;
      const akey = P + '|' + (near ? 1 : 0) + '|' + (smogOn ? 1 : 0);
      const aNew = baseNew || this._aKey !== akey || (urgent && this._aO !== this._over);
      if (near) {
        const oc = this._stO = mk(this._stO);
        if (aNew) { const g = oc.getContext('2d', { alpha: false }); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(bc, 0, 0); this.drawRegions(g, P); }
        a0 = oc;
      }
      let top = a0;
      if (smogOn) {
        const ac = this._stA = mk(this._stA);
        if (aNew) { const g = ac.getContext('2d', { alpha: false }); g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false; g.drawImage(a0, 0, 0); this._smogSh = 4 * Math.sin(this.time * 0.2); g.setTransform(s, 0, 0, s, ox, oy); this.drawSmogLayer(g); }
        top = ac;
      }
      if (aNew) { this._aKey = akey; this._aO = this._over; }
      ctx.drawImage(top, 0, 0);
      this._patchBase = bc; this._patchA0 = a0;
      this._camKey = SK;
    } else {
      this._bKey = ''; this._aKey = '';
      this._camKey = SK;
      this.drawBase(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (near) this.drawRegions(ctx, P);
      if (smogOn) { this._smogSh = 4 * Math.sin(this.time * 0.2); ctx.setTransform(s, 0, 0, s, ox, oy); this.drawSmogLayer(ctx); }
    }
    ctx.setTransform(s, 0, 0, s, ox, oy);
    let drawn;
    if (low && (opts.scale || 1) < 0.9) drawn = this.drawDots(ctx, vt, opts);
    else if (near || low) drawn = this.drawDynamic(ctx, vt, opts, near, P, smogOn);
    else drawn = this.drawObjects(ctx, vt, low, opts);
    if (!low && typeof S.flagKey === 'function') this.drawFlags(ctx, vt);

    // Feuer auf Kacheln
    if (st.fire && st.fireCount > 0) {
      const nf = typeof S.fxFrames === 'function' ? S.fxFrames('fire') : 3;
      const fr = ((this.time * 10) | 0) % nf;
      for (let y = vt.y0; y <= vt.y1; y++) for (let x = vt.x0; x <= vt.x1; x++) {
        const f = st.fire[y * st.W + x];
        if (f) S.drawFast(ctx, 'fx_fire_' + ((fr + x + y) % nf), x * 8, y * 8 - 2, 0, ((x + y) & 1) === 1);
      }
    }

    // Leben: Vögel, Schmetterlinge, springende Fische, Schornsteinrauch
    if (!low) this.drawLife(ctx, vt, dt, opts);
    // Rauch aus Fabriken, Dunst
    if (st.structs) this.updatePlumes(ctx, vt, dt);
    // (4) Effekte, Flugzeuge
    this._lastDt = dt;
    this.drawFx(ctx, dt);
    if (st.wild && st.wild.effects && st.wild.effects.length) this.drawEffects(ctx, st.wild.effects, vt);
    if (st.trains && st.trains.length) this.drawTrains(ctx, st.trains, vt);
    if (st.aircraft && st.aircraft.length) this.drawAircraft(ctx, st.aircraft);

    this.drawParticles(ctx, dt);
    // Wolkenschatten, Wetter, Tageszeit (Nacht und Wolken in einer Ebene niedriger Auflösung)
    this._dayPhase = opts.dayPhase; this._dpr = cam.dpr;
    this.drawAtmosphere(ctx, cam, vt, dt, opts, s, ox, oy);
    ctx.setTransform(s, 0, 0, s, ox, oy);

    // (5) Auswahl und Pinsel
    if (opts.select) this.drawSelection(ctx, opts.select, opts);
    if (opts.brush) this.drawBrush(ctx, opts.brush);
    if (opts.held) this.drawHeld(ctx, opts.held);
    if (st.plots && st.plots.length) this.drawPlots(ctx, vt);

    // Stadtnamen in Bildschirmpixeln
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (st.cities && opts.showNames !== false) this.drawCityLabels(ctx, cam, opts);
    if (opts.view === 'air') this.drawWindArrow(ctx, cam);
    if (this.flash > 0) {
      ctx.fillStyle = 'rgba(255,250,230,' + Math.min(0.6, this.flash) + ')';
      ctx.fillRect(0, 0, cv.width, cv.height);
      this.flash -= dt;
    }
    this.stats.drawn = drawn;
    this.stats.low = low;
    this.stats.frameMs = this.stats.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  };

  // ===========================================================================
  // Objekt-Ebene der nahen Ansicht (Leistung): ruhende Deko und Bauwerke liegen vorgebacken je Block in einem
  // Bild (genau die Pixelfläche des Blocks, alle hineinragenden Objekte in Malreihenfolge, drei Wiege-Phasen).
  // Bewegtes (Figuren, Tiere, Lagerfeuer, feuernde Mauergeräte, Fischschwärme) wird je Bild darübergelegt:
  // In den Rechtecken der bewegten Dinge wird der Boden neu kopiert und alles, was dort liegt, in der richtigen
  // Reihenfolge neu gezeichnet (Ausschnitt). So stehen Figuren richtig vor oder hinter Häusern und Bäumen.
  // ===========================================================================
  const OBJ_L = 5, OBJ_R = 1;      // Ankerspalten links/rechts außerhalb eines Blocks, die hineinragen können
  const OBJ_MAXC = 54;             // höchstens so viele vorgebackene Block-Bilder behalten
  function mixH(h, v) { return Math.imul(h ^ (v | 0), 16777619); }
  Renderer.prototype.strId = function (v) {
    if (v == null || v === false) return 0;
    if (v === true) return 1;
    if (typeof v === 'number') return v | 0;
    const m = this._strIds || (this._strIds = new Map());
    let n = m.get(v);
    if (n === undefined) { n = m.size + 7; m.set(v, n); }
    return n;
  };
  // sichtbare Merkmale eines Bauwerks als Zahl (ändert sich eine davon, wird der Block neu gebacken)
  Renderer.prototype.structHash = function (s, k) {
    let h = 2166136261 | 0;
    h = mixH(h, this.strId(s.type)); h = mixH(h, s.x); h = mixH(h, s.y); h = mixH(h, s.w); h = mixH(h, s.h);
    h = mixH(h, (s.built === false ? 1 : 0) | (s.closed ? 2 : 0) | (s.filtered ? 4 : 0) | (s.ruin ? 8 : 0) | (s.upgrading ? 16 : 0) | (s.active ? 32 : 0));
    h = mixH(h, s.level | 0); h = mixH(h, s.growth | 0); h = mixH(h, s.stage == null ? -1 : s.stage | 0); h = mixH(h, s.variant | 0); h = mixH(h, s.mask | 0);
    h = mixH(h, this.strId(s.style)); h = mixH(h, this.strId(s.kind)); h = mixH(h, this.strId(s.orient)); h = mixH(h, this.strId(s.ruinOf));
    h = mixH(h, this.strId(s.device)); h = mixH(h, this.strId(s.res || s.ore)); h = mixH(h, this.strId(s.culture)); h = mixH(h, this.strId(s.gov));
    h = mixH(h, s.cityId | 0);
    if (k) { h = mixH(h, k.colorIndex | 0); h = mixH(h, this.strId(k.gov)); h = mixH(h, this.strId(k.culture)); }
    const c = this._cityById ? this._cityById.get(s.cityId) : null;
    if (c) { h = mixH(h, this.strId(c.kind)); h = mixH(h, this.strId(c.culture)); h = mixH(h, c.tier | 0); }
    return h | 0;
  };
  // Pixelrechteck (Logikpixel) eines Sprites an (px, py)
  Renderer.prototype.keyBox = function (key) {
    const m = this._kb || (this._kb = new Map());
    let b = m.get(key);
    if (b === undefined) {
      const inf = this.S.info(key);
      b = inf ? [inf.ox, inf.oy, inf.dw, inf.dh, inf.fw * 8 - inf.dw - inf.ox] : null;
      m.set(key, b);
    }
    return b;
  };
  // Rechteck eines Bauwerks samt Gerüst, Gerät und Lagerfeuer; dyn = wird je Bild gezeichnet (Lagerfeuer)
  Renderer.prototype.structRect = function (s, k, vh) {
    const S = this.S, key = this.structKey(s, k ? k.gov : 'tribe');
    const rc = { h: vh, x: s.x, y: s.y, w: s.w, hh: s.h, x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, dyn: false, spike: false, dx0: 0, dy0: 0, dx1: 0, dy1: 0, seen: 0 };
    const add = (bx, x, y) => { if (!bx) return; rc.x0 = Math.min(rc.x0, x + bx[0]); rc.y0 = Math.min(rc.y0, y + bx[1]); rc.x1 = Math.max(rc.x1, x + bx[0] + bx[2]); rc.y1 = Math.max(rc.y1, y + bx[1] + bx[3]); };
    if (key !== null) {
      const bx = this.keyBox(key), inf = bx ? S.info(key) : null, fh = inf ? inf.fh : s.h;
      const px = s.x * 8 - (inf && inf.fw > s.w ? (inf.fw - s.w) * 4 : 0), py = (s.type === 'ruin' && fh > s.h ? s.y : s.y + s.h - fh) * 8;
      add(bx, px, py);
      if (s.upgrading && s.built !== false) {
        const sk = s.w >= 3 ? 's_scaffold_3' : (s.w >= 2 ? 's_scaffold_2' : 's_scaffold');
        const sc = S.has(sk) ? sk : (s.w >= 3 ? 's_site_3' : s.w >= 2 ? 's_site_2' : 's_site'), si = S.info(sc);
        add(this.keyBox(sc), px, (s.y + s.h - (si ? si.fh : s.h)) * 8);
      }
      if (s.type === 'center' && s.stage === 0 && s.built !== false && key.indexOf('s_camp') === 0) { rc.dyn = true; rc.x0 -= 2; rc.y0 -= 8; rc.x1 += 2; }
      // schlichte Bauwerke direkt aus dem gemerkten Schlüssel zeichnen
      rc.key = key; rc.px = px; rc.py = py; rc.team = k ? k.colorIndex | 0 : 10;
      rc.simple = !s.upgrading && !s.device && !rc.dyn && !(s.type === 'field' && (key === 's_field_2' || key === 's_field_3'));
    }
    if (s.device && s.built !== false) {
      const base = 's_walldev_' + s.device, dk = S.has(base + '_0') ? base + '_0' : (S.has(base) ? base : null), db = dk ? this.keyBox(dk) : null;
      if (db) {
        if (s.device === 'spikes' || s.device === 'trap') { rc.spike = true; rc.dx0 = s.x * 8 + db[0]; rc.dy0 = s.y * 8 + 8 + db[1]; rc.dx1 = rc.dx0 + db[2]; rc.dy1 = rc.dy0 + db[3]; }
        else { let off = 0; if (typeof S.wallDevOffset === 'function') { try { const o = S.wallDevOffset(s.style || (k && k.gov) || 'tribe', s.level, s.device); if (typeof o === 'number') off = o; } catch (e) { /* egal */ } } add(db, s.x * 8, s.y * 8 + off); rc.x0 -= 1; rc.x1 += 1; rc.y0 -= 1; }
      }
    }
    if (rc.x0 > rc.x1) { rc.x0 = rc.x1 = s.x * 8; rc.y0 = rc.y1 = s.y * 8; }
    // höchste Ausdehnung über die Ankerzeile (bestimmt, wie weit unterhalb eines Blocks noch gesucht wird)
    const up = Math.ceil(((s.y + s.h) * 8 - rc.y0) / 8);
    if (up + 1 > (this._objExt || 0)) { this._objExt = Math.min(14, up + 1); this._objExtGrew = true; }
    return rc;
  };

  // Deko einer Kachel, zwischengespeichert als Zahl: 0 = noch nicht berechnet, 1 = keine, sonst Schlüssel + Versatz (+ Fischschwarm-Bit)
  Renderer.prototype.encDeco = function (d) {
    if (!d) return 1;
    const m = this._dkIdx || (this._dkIdx = new Map()), keys = this._dkKeys || (this._dkKeys = []);
    let ki = m.get(d.key);
    if (ki === undefined) { ki = keys.length; keys.push(d.key); m.set(d.key, ki); }
    return (ki + 2) | (((d.dx + 8) & 31) << 20) | (((d.dy + 8) & 15) << 25) | (d.fish ? 1 << 29 : 0);
  };
  Renderer.prototype.decoCode = function (i) {
    let v = this._dk[i];
    if (v === 0) v = this._dk[i] = this.encDeco(this.decorAt(i, true));
    return v;
  };
  // Schlüssel einer Deko in Wiege-Phase p (Zwischenspeicher je Schlüssel und Phase)
  Renderer.prototype.decoKey = function (ki, x, y, p, sway) {
    const base = this._dkKeys[ki];
    if (!sway || typeof this.S.swayKey !== 'function') return base;
    const ph = (x + y + p) % 3, sk = this._dkSw || (this._dkSw = []);
    let k = sk[ki * 3 + ph];
    if (k === undefined) {
      k = base;
      if (SWAY_RE.test(base)) { const k2 = this.S.swayKey(base, ph); if (k2 !== base && this.S.has(k2)) k = k2; }
      sk[ki * 3 + ph] = k;
    }
    return k;
  };

  // Änderungen als schmutzige Rechtecke (Logikpixel) je Block merken; jedes Phasenbild holt sie später nach
  Renderer.prototype.objDirty = function (x0, y0, x1, y1) {
    if (!this.chunks.length || !(x1 > x0) || !(y1 > y0)) return;
    const seq = this._oseq = (this._oseq | 0) + 1;
    const ca = Math.max(0, Math.floor(x0 / CPX)), cb = Math.min(this.cw - 1, Math.floor((x1 - 1) / CPX));
    const ra = Math.max(0, Math.floor(y0 / CPX)), rb = Math.min(this.chh - 1, Math.floor((y1 - 1) / CPX));
    for (let cy = ra; cy <= rb; cy++) for (let cx = ca; cx <= cb; cx++) {
      const c = this.chunks[cy * this.cw + cx];
      c.objV = seq;
      if (!c.ob) continue;
      const dl = c.dl || (c.dl = []);
      if (dl.length >= 5 * 48) { c.fullV = seq; dl.length = 0; } else dl.push(x0, y0, x1, y1, seq);
    }
  };
  // Deko eines Kachelrechtecks hat sich (vielleicht) geändert: Pixelfläche samt Überstand der Deko markieren
  Renderer.prototype.objTouch = function (tx0, ty0, tx1, ty1) { this.objDirty((tx0 - 1) * 8, (ty0 - 4) * 8, (tx1 + 2) * 8, (ty1 + 2) * 8); };
  // Deko-Zwischenspeicher eines Kachelrechtecks verwerfen (und Fläche markieren)
  Renderer.prototype.objForget = function (tx0, ty0, tx1, ty1) {
    const st = this.st; if (!st || !this._dk) return;
    const W = st.W, H = st.H;
    tx0 = Math.max(0, tx0); ty0 = Math.max(0, ty0); tx1 = Math.min(W - 1, tx1); ty1 = Math.min(H - 1, ty1);
    if (tx1 < tx0 || ty1 < ty0) return;
    for (let y = ty0; y <= ty1; y++) this._dk.fill(0, y * W + tx0, y * W + tx1 + 1);
    this.objTouch(tx0, ty0, tx1, ty1);
  };
  Renderer.prototype.objDirtyRc = function (rc) {
    this.objDirty(rc.x0 - 1, rc.y0 - 1, rc.x1 + 1, rc.y1 + 1);
    if (rc.spike) this.objDirty(rc.dx0 - 1, rc.dy0 - 1, rc.dx1 + 1, rc.dy1 + 1);
  };
  const DECO_NEAR = { house: 1, wall: 1, gate: 1, tower: 1 };   // Bauwerke, deren Änderung die Stadtdeko ringsum beeinflusst

  // Bauwerke einsammeln (alle 0,2 s): Anker-Index je Kachel, geänderte Bauwerke als schmutzige Rechtecke, Lagerfeuer, Balken-Kandidaten
  Renderer.prototype.objPass = function (force) {
    const st = this.st;
    if (!force && this._ancH && this.time - (this._opT == null ? -9 : this._opT) < 0.2) return;
    this._opT = this.time;
    const W = st.W, H = st.H, N = W * H;
    if (!this._ancH || this._ancH.length !== N) { this._ancH = new Int32Array(N); this._rc = new Map(); this._dk = new Int32Array(N); this._cov = new Int32Array(N); this._scan = new Int32Array(N); this._objExt = this._objExt || 6; }
    const head = this._ancH; head.fill(-1);
    const list = this._anc || (this._anc = []); list.length = 0;
    const structs = st.structs || [];
    if (!this._ancN || this._ancN.length < structs.length) { this._ancN = new Int32Array(structs.length + 512); this._stS = new Int32Array(structs.length + 512); }
    const next = this._ancN;
    const cityK = this._objCityK = this.cityKingdoms();
    const fires = this._campfires || (this._campfires = []); fires.length = 0;
    const barC = this._barCand || (this._barCand = []); barC.length = 0;
    const pass = this._passN = (this._passN | 0) + 1;
    const rcm = this._rc;
    for (const s of structs) {
      if (s.dead || s.type === 'rail') continue;
      const by = s.y + s.h - 1;
      if (s.x < 0 || by < 0 || s.x >= W || by >= H) continue;
      const ai = by * W + s.x, idx = list.length;
      list.push(s); next[idx] = head[ai]; head[ai] = idx;
      const k = cityK.get(s.cityId);
      const vh = this.structHash(s, k);
      let rc = rcm.get(s.id);
      if (!rc || rc.h !== vh) {
        const old = rc;
        // Deko-Block der weiten Ansicht (enthält Bauwerke nach Anker) neu
        const dc = this.chunkAt(s.x, by); if (dc) dc.decorDirty = true;
        if (old) { const oc = this.chunkAt(old.x, Math.min(H - 1, old.y + old.hh - 1)); if (oc) oc.decorDirty = true; }
        if (old) this.objDirtyRc(old);
        rc = this.structRect(s, k, vh); rc.built = s.built !== false; rcm.set(s.id, rc);
        this.objDirtyRc(rc);
        if (!old || DECO_NEAR[s.type] || old.built !== rc.built || old.x !== rc.x || old.y !== rc.y) {
          if (old) this.objForget(old.x - 2, old.y - 2, old.x + old.w + 1, old.y + old.hh + 1);
          this.objForget(s.x - 2, s.y - 2, s.x + s.w + 1, s.y + s.h + 1);
        }
      }
      rc.seen = pass;
      if (rc.dyn) fires.push(s);
      if ((s.built === false && s.progress > 0) || s.upgrading || (s.built && s.hp < s.maxHp * 0.98 && s.type !== 'field' && s.type !== 'ruin')) barC.push(s);
    }
    // verschwundene Bauwerke
    if ((pass & 3) === 0 || rcm.size > list.length) for (const [id, rc] of rcm) if (rc.seen !== pass) { this.objDirtyRc(rc); { const oc = this.chunkAt(Math.min(W - 1, rc.x), Math.min(H - 1, rc.y + rc.hh - 1)); if (oc) oc.decorDirty = true; } this.objForget(rc.x - 2, rc.y - 2, rc.x + rc.w + 1, rc.y + rc.hh + 1); rcm.delete(id); }
    if (this._objExtGrew) { this._objExtGrew = false; const seq = this._oseq = (this._oseq | 0) + 1; for (const c of this.chunks) { c.objV = seq; c.fullV = seq; if (c.dl) c.dl.length = 0; } }
  };

  // geordnete Objekte einer Kachelzeile (Felder, Deko, Bauwerke, Stacheln der Zeile darüber) in out schreiben
  Renderer.prototype.objRow = function (y, tx0, tx1, out, fish) {
    const st = this.st, W = st.W, head = this._ancH, next = this._ancN, list = this._anc, rcm = this._rc;
    const row = y * W;
    for (let x = tx0; x <= tx1; x++) for (let a = head[row + x]; a >= 0; a = next[a]) { const s = list[a]; if (s.type === 'field' && !s.dead) out.push(0, a); }
    for (let x = tx0; x <= tx1; x++) {
      const v = this.decoCode(row + x);
      if (v <= 1) continue;
      if (v & (1 << 29)) { if (fish) fish.push(row + x); continue; }
      out.push(2, row + x);
    }
    for (let x = tx0; x <= tx1; x++) for (let a = head[row + x]; a >= 0; a = next[a]) { const s = list[a]; if (s.type !== 'field' && !s.dead) { const rc = rcm.get(s.id); if (!rc || !rc.dyn) out.push(3, a); } }
    if (y > 0) for (let x = tx0; x <= tx1; x++) for (let a = head[row - W + x]; a >= 0; a = next[a]) { const rc = rcm.get(list[a].id); if (rc && rc.spike && !list[a].dead) out.push(4, a); }
  };
  // ein ruhendes Objekt zeichnen (Art, Index aus objRow)
  Renderer.prototype.objDraw = function (g, kind, v, p, sway) {
    const S = this.S;
    if (kind === 2) {
      const code = this._dk[v], W = this.st.W, x = v % W, y = (v / W) | 0;
      const key = this.decoKey((code & 0xfffff) - 2, x, y, p, sway);
      S.drawFast(g, key, x * 8 + ((code >> 20) & 31) - 8, y * 8 + ((code >> 25) & 15) - 8, 0, false);
    } else if (kind === 4) this.drawDevice(g, this._anc[v]);
    else {
      const s = this._anc[v], rc = this._rc.get(s.id);
      if (rc && rc.simple) S.drawFast(g, rc.key, rc.px, rc.py, rc.team, false);
      else this.drawStruct(g, s, this._objCityK, false, OBJ_NOBARS, p);
    }
  };
  const OBJ_NOBARS = { push: function () {} };
  // Rechteck (Logikpixel) eines ruhenden Objekts in r[0..3] (x0, y0, x1, y1); false = unbekannt
  Renderer.prototype.objRect = function (kind, v, p, sway, r) {
    if (kind === 2) {
      const code = this._dk[v], W = this.st.W, x = v % W, y = (v / W) | 0;
      const bx = this.keyBox(this.decoKey((code & 0xfffff) - 2, x, y, p, sway));
      if (!bx) return false;
      const px = x * 8 + ((code >> 20) & 31) - 8 + bx[0], py = y * 8 + ((code >> 25) & 15) - 8 + bx[1];
      r[0] = px - 1; r[1] = py - 1; r[2] = px + bx[2] + 1; r[3] = py + bx[3] + 1;
      return true;
    }
    const rc = this._rc.get(this._anc[v].id);
    if (!rc) return false;
    if (kind === 4) { r[0] = rc.dx0 - 1; r[1] = rc.dy0 - 1; r[2] = rc.dx1 + 1; r[3] = rc.dy1 + 1; }
    else { r[0] = rc.x0 - 1; r[1] = rc.y0 - 1; r[2] = rc.x1 + 1; r[3] = rc.y1 + 1; }
    return true;
  };

  // Objekte, die das Pixelrechteck [X0,X1)×[Y0,Y1) berühren, in Malreihenfolge zeichnen (Kontext ist gesetzt)
  Renderer.prototype.objPaint = function (g, X0, Y0, X1, Y1, p, sway, fish) {
    const st = this.st, W = st.W, H = st.H, ext = this._objExt || 6;
    const tx0 = Math.max(0, Math.floor(X0 / 8) - OBJ_L), tx1 = Math.min(W - 1, Math.floor((X1 - 1) / 8) + OBJ_R);
    const ty0 = Math.max(0, Math.floor(Y0 / 8) - 1), ty1 = Math.min(H - 1, Math.floor((Y1 - 1) / 8) + ext);
    const out = this._objOut || (this._objOut = []), r = this._objR || (this._objR = [0, 0, 0, 0]);
    this._bakeNoShot = true;
    for (let y = ty0; y <= ty1; y++) {
      out.length = 0;
      this.objRow(y, tx0, tx1, out, fish);
      for (let j = 0; j < out.length; j += 2) {
        if (!this.objRect(out[j], out[j + 1], p, sway, r)) continue;
        if (r[2] <= X0 || r[0] >= X1 || r[3] <= Y0 || r[1] >= Y1) continue;
        this.objDraw(g, out[j], out[j + 1], p, sway);
      }
    }
    this._bakeNoShot = false;
  };
  // Block-Bild für Phase p ganz backen (genau die Pixelfläche des Blocks)
  Renderer.prototype.bakeRegion = function (c, p) {
    const st = this.st, W = st.W, ob = c.ob, k = ob.k, size = CPX * k;
    let cv = ob.cv[p];
    if (!cv) { cv = ob.cv[p] = document.createElement('canvas'); cv.width = cv.height = size; this._objCount = (this._objCount | 0) + 1; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, size, size); g.imageSmoothingEnabled = false;
    const X0 = c.cx * CPX, Y0 = c.cy * CPX;
    g.setTransform(k, 0, 0, k, -X0 * k, -Y0 * k);
    const fish = [];
    this.objPaint(g, X0, Y0, X0 + CPX, Y0 + CPX, p, ob.sway, fish);
    // Fischschwärme dieses Blocks (werden je Bild gezeichnet)
    const x0 = c.cx * CH, y0 = c.cy * CH;
    ob.fish = fish.filter(i => { const x = i % W, y = (i / W) | 0; return x >= x0 && x < x0 + CH && y >= y0 && y < y0 + CH; });
    ob.v[p] = c.objV | 0;
  };
  // Phasenbild auf den neuesten Stand bringen: schmutzige Rechtecke ausschneiden und neu malen, bei vielen ganz backen
  Renderer.prototype.objUpdate = function (c, p) {
    const ob = c.ob, v = ob.v[p];
    if (!ob.cv[p] || v == null || (c.fullV | 0) > v) { this.bakeRegion(c, p); return 2; }
    const dl = c.dl || [], X0 = c.cx * CPX, Y0 = c.cy * CPX, k = ob.k;
    const rs = [];
    let area = 0;
    for (let j = 0; j < dl.length; j += 5) {
      if (dl[j + 4] <= v) continue;
      const x0 = Math.max(X0, dl[j]), y0 = Math.max(Y0, dl[j + 1]), x1 = Math.min(X0 + CPX, dl[j + 2]), y1 = Math.min(Y0 + CPX, dl[j + 3]);
      if (x1 <= x0 || y1 <= y0) continue;
      const a0 = Math.floor(x0), b0 = Math.floor(y0), a1 = Math.ceil(x1), b1 = Math.ceil(y1);
      let dup = false;
      for (let t = 0; t < rs.length; t += 4) if (rs[t] <= a0 && rs[t + 1] <= b0 && rs[t + 2] >= a1 && rs[t + 3] >= b1) { dup = true; break; }
      if (dup) continue;
      rs.push(a0, b0, a1, b1); area += (a1 - a0) * (b1 - b0);
    }
    if (rs.length > 4 * 40 || area > CPX * CPX) { this.bakeRegion(c, p); return 2; }
    if (rs.length) {
      const g = ob.cv[p].getContext('2d'), W = this.st.W;
      g.imageSmoothingEnabled = false;
      const fish = [];
      for (let j = 0; j < rs.length; j += 4) {
        g.save();
        g.setTransform(k, 0, 0, k, -X0 * k, -Y0 * k);
        g.beginPath(); g.rect(rs[j], rs[j + 1], rs[j + 2] - rs[j], rs[j + 3] - rs[j + 1]); g.clip();
        g.clearRect(rs[j], rs[j + 1], rs[j + 2] - rs[j], rs[j + 3] - rs[j + 1]);
        this.objPaint(g, rs[j], rs[j + 1], rs[j + 2], rs[j + 3], p, ob.sway, fish);
        g.restore();
      }
      const x0 = c.cx * CH, y0 = c.cy * CH;
      for (const i of fish) { const x = i % W, y = (i / W) | 0; if (x >= x0 && x < x0 + CH && y >= y0 && y < y0 + CH && ob.fish.indexOf(i) < 0) ob.fish.push(i); }
    }
    ob.v[p] = c.objV | 0;
    // Protokoll kürzen: was alle vorhandenen Phasenbilder schon haben, fällt weg
    let minV = Infinity;
    for (let q = 0; q < 3; q++) if (ob.cv[q] && ob.v[q] != null) minV = Math.min(minV, ob.v[q]);
    if (dl.length && minV !== Infinity) { let w = 0; for (let j = 0; j < dl.length; j += 5) if (dl[j + 4] > minV) { for (let t = 0; t < 5; t++) dl[w + t] = dl[j + t]; w += 5; } dl.length = w; }
    return rs.length ? 1 : 0;
  };

  // Vor dem Zeichnen: Block-Bilder der sichtbaren Blöcke bereitstellen; liefert die anzuzeigende Wiege-Phase
  Renderer.prototype.objPrepare = function (cx0, cx1, cy0, cy1, devS, urgent) {
    const S = this.S;
    // Auflösung der Block-Bilder: feines Raster (2 je Logikpixel), bei einfacher Vergrößerung 1
    const k = devS >= 1.25 ? 2 : 1;
    const sway = devS >= 2 && this.gfx.quality !== 'low' && !this.autoOff.sway;
    const cfg = k + (sway ? 's' : 'n');
    const nph = typeof S.swayKey === 'function' ? 3 : 1;
    const want = nph === 3 ? ((this.time * 2) | 0) % 3 : 0;
    const vis = this._objVis || (this._objVis = []); vis.length = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = this.chunks[cy * this.cw + cx];
      if (!c.ob || c.ob.cfg !== cfg) { if (c.ob) this._objCount = (this._objCount | 0) - c.ob.cv.filter(Boolean).length; c.ob = { cfg: cfg, k: k, sway: sway, cv: [], v: [], fish: [] }; if (c.dl) c.dl.length = 0; }
      c.obT = this.time;
      vis.push(c);
    }
    const fresh = (c, p) => c.ob.cv[p] && c.ob.v[p] === (c.objV | 0);
    // Phase: die gewünschte, sobald jeder sichtbare Block sie hat; sonst die zuletzt gezeigte; sonst sofort backen
    let P = want;
    if (!vis.every(c => c.ob.cv[want])) {
      const prev = this._shownP;
      if (prev != null && prev !== want && vis.every(c => c.ob.cv[prev])) P = prev;
      else for (const c of vis) if (!c.ob.cv[want]) { this.bakeRegion(c, want); this._over = (this._over | 0) + 1; }
    }
    // gezeigte Phase immer aktuell halten (meist nur kleine Ausschnitte), dann vorbacken im Zeitbudget
    for (const c of vis) if (!fresh(c, P) && this.objUpdate(c, P)) this._over = (this._over | 0) + 1;
    const t0 = performance.now(), lim = urgent ? 4 : 1.5;
    for (let d = 0; d < nph; d++) {
      const q = (want + d) % nph;
      if (q === P) continue;
      for (const c of vis) { if (performance.now() - t0 > lim) break; if (!fresh(c, q)) this.objUpdate(c, q); }
    }
    // Deko-Prüfung als Sicherheitsnetz (Stümpfe, Stadtdeko …): alle 0,4 s ein sichtbarer Block
    if (this.time - (this._odT || 0) > 0.4 && vis.length) { this._odT = this.time; this._odI = ((this._odI | 0) + 1) % vis.length; this.objCheckDeco(vis[this._odI]); }
    this._shownP = P; this._regSway = sway;
    this.objTrim();
    return P;
  };
  // Deko eines Blocks frisch berechnen und mit dem Zwischenspeicher vergleichen
  Renderer.prototype.objCheckDeco = function (c) {
    const st = this.st, W = st.W, H = st.H, dk = this._dk, ext = this._objExt || 6;
    const tx0 = Math.max(0, c.cx * CH - OBJ_L), tx1 = Math.min(W - 1, c.cx * CH + CH - 1 + OBJ_R);
    const ty0 = Math.max(0, c.cy * CH - 1), ty1 = Math.min(H - 1, c.cy * CH + CH - 1 + ext);
    let changed = false;
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) {
      const i = y * W + x;
      if (dk[i] === 0) continue;
      const v = this.encDeco(this.decorAt(i, true));
      if (v !== dk[i]) { dk[i] = v; changed = true; this.objTouch(x, y, x, y); }
    }
    return changed;
  };
  // Speicher: lange unbenutzte Block-Bilder freigeben
  Renderer.prototype.objTrim = function () {
    if ((this._objCount | 0) <= OBJ_MAXC) return;
    const cand = this.chunks.filter(c => c.ob && c.ob.cv.length && this.time - (c.obT || 0) > 1.5).sort((a, b) => (a.obT || 0) - (b.obT || 0));
    for (const c of cand) { if ((this._objCount | 0) <= OBJ_MAXC * 0.75) break; this._objCount -= c.ob.cv.filter(Boolean).length; c.ob = null; }
  };
  // Block-Bilder der Phase P zeichnen
  Renderer.prototype.drawRegions = function (g, P) {
    const F = this._F;
    for (let cy = F.cy0; cy <= F.cy1; cy++) for (let cx = F.cx0; cx <= F.cx1; cx++) {
      const c = this.chunks[cy * this.cw + cx], ob = c.ob, cv = ob && ob.cv[P];
      if (!cv) continue;
      const X = cx * CPX, Y = cy * CPX, dx = F.rx(X), dy = F.ry(Y);
      g.drawImage(cv, 0, 0, cv.width, cv.height, dx, dy, F.rx(X + CPX) - dx, F.ry(Y + CPX) - dy);
    }
  };

  // Bewegtes über das Standbild legen. near: mit ruhenden Objekten im Ausschnitt (sonst nur Figuren);
  // clip: Ausschnitt nötig (nahe Ansicht oder Dunst über den Figuren)
  Renderer.prototype.drawDynamic = function (ctx, vt, opts, near, P, smogOn) {
    const st = this.st, S = this.S, W = st.W, H = st.H, F = this._F;
    const kings = this._kings || (this._kings = new Map());
    kings.clear();
    if (st.kingdoms) for (const k of st.kingdoms) kings.set(k.id, k);
    const cityK = this._cityK || (this._cityK = new Map());
    cityK.clear();
    if (st.cities) for (const c of st.cities) cityK.set(c.id, kings.get(c.kingdomId));
    const time = this.time, sway = near && this._regSway;
    const zoomBig = opts.scale >= 2.5;
    const pool = this._dynPool || (this._dynPool = []);
    let np = 0;
    const item = () => { let o = pool[np]; if (!o) o = pool[np] = { cls: 0, row: 0, sub: 0, t: 0, x0: 0, y0: 0, x1: 0, y1: 0, key: null, px: 0, py: 0, team: 0, flip: false, u: null, v: 0, sick: false, alpha: null }; else { o.alpha = null; o.flip = false; o.team = 0; } np++; return o; };
    const dyn = this._dynList || (this._dynList = []); dyn.length = 0;
    const bubbles = [], bars = [], flyers = [];
    const prev = opts.prev, a = opts.alpha == null ? 1 : opts.alpha;
    const y0 = vt.y0, y1 = vt.y1;
    const addU = (u, isAnimal) => {
      let x = u.x, y = u.y;
      if (!isAnimal && u.sea && u.seaS === 'aboard') return;   // an Bord: das Schiff zeigt sie
      if (!isAnimal && u.campState === 'train') return;         // im Gefangenenzug
      if (!isAnimal && u.seaS === 'swim' && u.swim && u.swim.t1 > u.swim.t0) {
        // Schiffbrüchige schwimmen zur Küste
        const q = Math.max(0, Math.min(1, ((st.tick || 0) + a - u.swim.t0) / (u.swim.t1 - u.swim.t0)));
        if (q < 1) { x = u.swim.x0 + (u.x - u.swim.x0) * q; y = u.swim.y0 + (u.y - u.swim.y0) * q; }
      } else if (prev) { const pp = prev.get(isAnimal ? -u.id : u.id); if (pp) { const dx = x - pp[0], dy = y - pp[1]; if (dx * dx + dy * dy < 4) { x = pp[0] + dx * a; y = pp[1] + dy * a; } } }
      if (x < vt.x0 - 1 || x > vt.x1 + 2 || y < y0 || y >= y1 + 1) return;
      if (isAnimal && u.flying) { flyers.push({ u: u, x: x, y: y }); return; }
      const o = item();
      o.cls = 1; o.row = y | 0; o.sub = y; o.u = u; o.flip = u.dir < 0; o.sick = false;
      o.px = Math.round(x * 8 - 4); o.py = Math.round(y * 8 - 6);
      if (isAnimal) {
        o.t = 2; o.v = u.moving ? (((time * 5 + (u.id & 7) * 0.37) | 0) & 1) : 0;
        o.key = 'a_' + u.kind + '_' + o.v; if (!S.has(o.key)) o.key = 'a_' + u.kind + '_0';
        o.team = 0;
      } else {
        o.t = 1;
        const k = kings.get(u.role === 'prisoner' ? (u.pow >= 0 ? u.pow : u.kingdomId) : u.kingdomId);
        o.team = k ? k.colorIndex | 0 : 10;
        o.key = this.unitKey(u, k ? k.gov : 'tribe', u.vehicle ? 0 : this.unitFrame(u));
        if (u.vehicle) o.flip = false;
        if (u.camel && typeof S.camelKey === 'function') {
          // Kamel der Karawane läuft neben dem Führer (etwas dahinter)
          const c = item(); c.t = 3; c.cls = 1; c.row = o.row; c.sub = y - 0.01; c.team = o.team; c.flip = u.dir < 0; c.sick = false;
          c.key = S.camelKey(true, u.moving ? ((time * 6 + (u.id & 3)) | 0) & 3 : 0);
          c.px = o.px + (u.dir < 0 ? 7 : -7); c.py = o.py - 1;
          const cb = S.has(c.key) ? this.keyBox(c.key) : null;
          if (cb) { const ox = c.flip ? cb[4] : cb[0]; c.x0 = c.px + ox - 1; c.y0 = c.py + cb[1] - 1; c.x1 = c.px + ox + cb[2] + 1; c.y1 = c.py + cb[1] + cb[3] + 1; dyn.push(c); }
        }
        o.sick = !!(u.sick && (((time * 2) | 0) + u.id) & 1);
        if (u.bubble && u.bubble.icon) bubbles.push({ x: o.px, y: o.py, icon: u.bubble.icon });
        if (zoomBig && u.hp < u.maxHp * 0.95 && u.maxHp > 0) bars.push({ x: o.px + 1, y: o.py - 11, w: 6, v: u.hp / u.maxHp, col: '#7ecb5a' });
      }
      const bx = S.has(o.key) ? this.keyBox(o.key) : null;
      if (bx) { const ox = o.flip ? bx[4] : bx[0]; o.x0 = o.px + ox - 1; o.y0 = o.py + bx[1] - 1; o.x1 = o.px + ox + bx[2] + 1; o.y1 = o.py + bx[1] + bx[3] + 1; }
      else { o.x0 = o.px - 1; o.y0 = o.py - 1; o.x1 = o.px + 9; o.y1 = o.py + 9; }
      if (o.sick) o.y0 = Math.min(o.y0, o.py - 11);
      dyn.push(o);
    };
    if (st.units) for (const u of st.units) if (!u.dead && u.ind !== 'train') addU(u, false);
    if (st.animals) for (const an of st.animals) if (!an.dead && !an.buried) addU(an, true);
    // Schiffe: wie Figuren, mit weicher Bewegung zwischen den Schritten
    const box = (o) => { const bx = S.has(o.key) ? this.keyBox(o.key) : null; if (!bx) return false; const ox = o.flip ? bx[4] : bx[0]; o.x0 = o.px + ox - 1; o.y0 = o.py + bx[1] - 1; o.x1 = o.px + ox + bx[2] + 1; o.y1 = o.py + bx[1] + bx[3] + 1; return true; };
    if (st.ships && st.ships.length && typeof S.shipKey === 'function') for (const sh of st.ships) {
      if (!sh || sh.dead || !(sh.x >= 0)) continue;
      let x = sh.x, y = sh.y;
      const pp = prev && prev.get(1e9 + sh.id);
      if (pp) { const dx = x - pp[0], dy = y - pp[1]; if (dx * dx + dy * dy < 4) { x = pp[0] + dx * a; y = pp[1] + dy * a; } }
      if (x < vt.x0 - 2 || x > vt.x1 + 3 || y < y0 - 1 || y >= y1 + 2) continue;
      const k = kings.get(sh.kingdomId);
      let key = null;
      try { key = S.shipKey(sh.kind || 'trader', sh.gov || (k ? k.gov : 'tribe'), VDIR[(sh.dir | 0) & 3], ((time * 2 + (sh.id & 3) * 0.5) | 0) & 1, sh.culture); } catch (e) { key = null; }
      if (!key) continue;
      const o = item(); o.t = 3; o.cls = 1; o.row = Math.floor(y); o.sub = y; o.key = key; o.team = k ? k.colorIndex | 0 : 10;
      o.px = Math.round(x * 8 - 4); o.py = Math.round(y * 8 - 4);
      if (sh.t === 'sink') { const q = Math.max(0, Math.min(1, 1 - (sh.sinkT | 0) / 40)); o.alpha = 1 - q * 0.8; o.py += Math.round(q * 3); }
      o.u = sh;
      if (box(o)) dyn.push(o);
    }
    // Wracks (Panzer, Geschütz, Schiff): ruhen, wenige – wie Bewegtes gezeichnet
    if (st.wrecks && st.wrecks.length) for (const w of st.wrecks) {
      if (!w || !(w.x >= 0)) continue;
      const tx = Math.floor(w.x), ty = Math.floor(w.y);
      if (tx < vt.x0 - 2 || tx > vt.x1 + 2 || ty < y0 || ty > y1 + 1) continue;
      let key = w.kind === 'ship' ? 'd_wreck_ship' : null;
      if (!key) { try { key = typeof S.wreckKey === 'function' ? S.wreckKey(w.kind, (st.year | 0) - (w.year | 0) + ((w.rust | 0) >= 2 ? 4 : 0)) : 'd_wreck_' + w.kind; } catch (e) { key = null; } }
      if (!key || !S.has(key)) continue;
      const o = item(); o.t = 3; o.cls = 2; o.row = ty; o.sub = tx; o.key = key; o.px = tx * 8; o.py = ty * 8; o.flip = ((w.id | 0) & 1) === 1;
      if (box(o)) dyn.push(o);
    }
    if (near) {
      // Fischschwärme, Lagerfeuer, feuernde Mauergeräte
      for (let cy = F.cy0; cy <= F.cy1; cy++) for (let cx = F.cx0; cx <= F.cx1; cx++) {
        const ob = this.chunks[cy * this.cw + cx].ob;
        if (!ob || !ob.fish.length) continue;
        for (const i of ob.fish) {
          const code = this._dk[i]; if (!(code & (1 << 29))) continue;
          const x = i % W, y = (i / W) | 0;
          if (x < vt.x0 || x > vt.x1 || y < vt.y0 || y > vt.y1) continue;
          const o = item(); o.cls = 2; o.row = y; o.sub = x; o.t = 3; o.team = 0; o.flip = false;
          o.key = 'd_fish_' + (((time * 2) | 0) & 1); o.px = x * 8 + ((code >> 20) & 31) - 8; o.py = y * 8 + ((code >> 25) & 15) - 8;
          const bx = this.keyBox(o.key) || [0, 0, 8, 8, 0];
          o.x0 = o.px + bx[0] - 1; o.y0 = o.py + bx[1] - 1; o.x1 = o.px + bx[0] + bx[2] + 1; o.y1 = o.py + bx[1] + bx[3] + 1;
          dyn.push(o);
        }
      }
      const addS = (s) => {
        const rc = this._rc.get(s.id); if (!rc) return;
        if (rc.x1 < vt.x0 * 8 - 8 || rc.x0 > vt.x1 * 8 + 16 || rc.y1 < vt.y0 * 8 || rc.y0 > vt.y1 * 8 + 16) return;
        const o = item(); o.cls = s.type === 'field' ? 0 : 3; o.row = s.y + s.h - 1; o.sub = s.x; o.t = 4; o.u = s;
        o.x0 = rc.x0 - 1; o.y0 = rc.y0 - 1; o.x1 = rc.x1 + 1; o.y1 = rc.y1 + 1;
        dyn.push(o);
      };
      for (const s of this._campfires || []) if (!s.dead) addS(s);
      if (this.muzzleT && this.muzzleT.size) for (const [ti, t] of this.muzzleT) {
        if (time - t > 0.3) { this.muzzleT.delete(ti); continue; }
        const sid = st.structAt ? st.structAt[ti] : -1, s = sid >= 0 && this.structById ? this.structById(sid) : null;
        if (s && s.device && s.device !== 'spikes' && s.device !== 'trap' && !s.dead) addS(s);
      }
    }
    let drawn = dyn.length;
    if (dyn.length) {
      const ext = this._objExt || 6;
      const fr = this._stampN = ((this._stampN | 0) + 1) & 0x3fffffff;
      const drawIt = (it) => {
        if (it.t === 1) {
          S.drawFast(ctx, it.key, it.px, it.py, it.team, it.flip);
          if (it.sick) { ctx.globalAlpha = 0.6; S.drawFast(ctx, 'fx_plague', it.px, it.py - 10, 0, false); ctx.globalAlpha = 1; }
        } else if (it.t === 2) this.drawAnimal(ctx, it.u, it.px, it.py, it.v);
        else if (it.t === 3) { if (it.alpha != null && it.alpha < 1) { ctx.globalAlpha = it.alpha; S.drawFast(ctx, it.key, it.px, it.py, it.team | 0, !!it.flip); ctx.globalAlpha = 1; } else S.drawFast(ctx, it.key, it.px, it.py, it.team | 0, !!it.flip); }
        else if (it.t === 4) this.drawStruct(ctx, it.u, cityK, false, OBJ_NOBARS, P);
        else { this.objDraw(ctx, it.cls, it.v, P, sway); drawn++; }
      };
      const order = (p, q) => p.row - q.row || p.cls - q.cls || p.sub - q.sub;
      const clipTo = (list) => { ctx.save(); ctx.beginPath(); for (const o of list) ctx.rect(o.x0, o.y0, o.x1 - o.x0, o.y1 - o.y0); ctx.clip(); };
      const simple = this._dynS || (this._dynS = []), complex = this._dynC || (this._dynC = []);
      simple.length = 0; complex.length = 0;
      if (near) {
        const cov = this._cov, stX = this._stX && this._stX.length >= this._stS.length ? this._stX : (this._stX = new Int32Array(this._stS.length)), stS = this._stS, stD = this._stD && this._stD.length >= stS.length ? this._stD : (this._stD = new Int32Array(stS.length)), stamp = this._scan;
        const r = this._objR2 || (this._objR2 = [0, 0, 0, 0]);
        const head = this._ancH, next = this._ancN, list = this._anc, rcm = this._rc, dk = this._dk;
        const ov = (x0, y0, x1, y1, o) => x1 > o.x0 && x0 < o.x1 && y1 > o.y0 && y0 < o.y1;
        // ruhende Objekte im Suchfenster eines bewegten Dings, die sein Rechteck berühren; fn liefert true = abbrechen
        const scanWin = (o, ra, rb, fn) => {
          const ta = Math.max(0, Math.floor(o.x0 / 8) - OBJ_L), tb = Math.min(W - 1, Math.floor((o.x1 - 1) / 8) + OBJ_R);
          ra = Math.max(0, ra); rb = Math.min(H - 1, rb);
          for (let y = ra; y <= rb; y++) for (let x = ta; x <= tb; x++) {
            const i = y * W + x;
            for (let q = head[i]; q >= 0; q = next[q]) {
              const s = list[q];
              if (s.dead || stX[q] === fr) continue;
              const rc = rcm.get(s.id);
              if (!rc || rc.dyn) continue;
              if (ov(rc.x0 - 1, rc.y0 - 1, rc.x1 + 1, rc.y1 + 1, o) && fn(s.type === 'field' ? 0 : 3, q, y, x)) return true;
              if (rc.spike && ov(rc.dx0 - 1, rc.dy0 - 1, rc.dx1 + 1, rc.dy1 + 1, o) && fn(4, q, y + 1, x)) return true;
            }
            const v = dk[i] === 0 ? this.decoCode(i) : dk[i];
            if (v > 1 && !(v & (1 << 29)) && this.objRect(2, i, P, sway, r) && ov(r[0], r[1], r[2], r[3], o) && fn(2, i, y, x)) return true;
          }
          return false;
        };
        // bewegte Bauwerke (Lagerfeuer, feuerndes Gerät) nicht zusätzlich als ruhend zeichnen
        for (const o of dyn) if (o.t === 4) { const s = o.u; for (let q = head[(s.y + s.h - 1) * W + s.x]; q >= 0; q = next[q]) if (list[q] === s) stX[q] = fr; }
        // einfach = nichts Ruhendes liegt davor (Figur auf freier Fläche); sonst wird der Ausschnitt ganz neu gemalt
        let cur = null;
        const inFront = (kind, v, row, sub) => {
          if (!(row > cur.row || (row === cur.row && (kind > cur.cls || (kind === cur.cls && sub > cur.sub))))) return false;
          // genau (ohne Sicherheitsrand) prüfen, ob das Ruhende die Figur wirklich überdeckt
          if (!this.objRect(kind, v, P, sway, r)) return true;
          return r[2] - 1 > tight.x0 && r[0] + 1 < tight.x1 && r[3] - 1 > tight.y0 && r[1] + 1 < tight.y1;
        };
        const tight = { x0: 0, y0: 0, x1: 0, y1: 0 };
        for (const o of dyn) { cur = o; tight.x0 = o.x0 + 1; tight.y0 = o.y0 + 1; tight.x1 = o.x1 - 1; tight.y1 = o.y1 - 1; (scanWin(o, o.row - 1, Math.floor((o.y1 - 1) / 8) + ext, inFront) ? complex : simple).push(o); }
        if (complex.length) {
          const items = this._dynItems || (this._dynItems = []); items.length = 0;
          const push = (kind, v, row, sub) => {
            const arr = kind === 2 ? stamp : kind === 4 ? stD : stS;
            if (arr[v] === fr) return false;
            arr[v] = fr;
            const it = item(); it.t = 5; it.cls = kind; it.v = v; it.row = row; it.sub = sub; items.push(it);
            return false;
          };
          for (const o of complex) { items.push(o); scanWin(o, Math.floor(o.y0 / 8) - 1, Math.floor((o.y1 - 1) / 8) + ext, push); }
          // einfache Dinge, die in einen Ausschnitt hineinragen, dort mitmalen
          for (const o of complex) { const a = Math.max(0, Math.floor(o.x0 / 8)), b = Math.min(W - 1, Math.floor((o.x1 - 1) / 8)), c0 = Math.max(0, Math.floor(o.y0 / 8)), c1 = Math.min(H - 1, Math.floor((o.y1 - 1) / 8)); for (let yy = c0; yy <= c1; yy++) for (let xx = a; xx <= b; xx++) cov[yy * W + xx] = fr; }
          for (const o of simple) {
            const a = Math.max(0, Math.floor(o.x0 / 8)), b = Math.min(W - 1, Math.floor((o.x1 - 1) / 8)), c0 = Math.max(0, Math.floor(o.y0 / 8)), c1 = Math.min(H - 1, Math.floor((o.y1 - 1) / 8));
            let hit = false;
            for (let yy = c0; yy <= c1 && !hit; yy++) for (let xx = a; xx <= b; xx++) if (cov[yy * W + xx] === fr) { hit = true; break; }
            if (hit) items.push(o);
          }
          this._cItems = items;
        }
      } else for (const o of dyn) simple.push(o);
      // (a) einfache Dinge: direkt aufs Standbild, bei Dunst im Ausschnitt über dem Bild ohne Dunst
      simple.sort(order);
      // bewegte Kamera (keine Zwischenbilder): Verdecktes ohne Bodenkopie (nur ruhend genau)
      const exact = !!this._patchBase;
      const haze = smogOn && !this._smogAir && this._smogAlpha;
      for (const it of simple) {
        drawIt(it);
        // Dunst über der Figur: gleich gefärbter Umriss mit der Dunststärke an dieser Stelle (kein Ausschnitt nötig)
        if (haze && it.t <= 3) { const a = this.smogAt(it.px / 8 + 0.5, it.py / 8 + 0.75); if (a > 0.02) this.drawHaze(ctx, it.key, it.px, it.py, it.flip, a); }
      }
      // (b) verdeckte Dinge: Ausschnitt vom Boden an neu malen (Ruhendes davor und dahinter in Malreihenfolge)
      if (complex.length) {
        const items = this._cItems;
        items.sort(order);
        clipTo(complex);
        if (exact) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(this._patchBase, 0, 0); ctx.setTransform(F.s, 0, 0, F.s, F.ox, F.oy); }
        for (const it of items) drawIt(it);
        if (smogOn && exact) this.drawSmogLayer(ctx);
        ctx.restore(); ctx.setTransform(F.s, 0, 0, F.s, F.ox, F.oy);
      }
      this.stats.dynS = simple.length; this.stats.dynC = complex.length;
    }
    // Fliegende Wesen über allem, mit Schatten am Boden
    for (const it of flyers) {
      const u = it.u, px = Math.round(it.x * 8 - 4), py = Math.round(it.y * 8 - 6);
      const frame = (((time * 5 + (u.id & 7) * 0.37) | 0) & 1);
      if (S.has('a_' + u.kind + '_shadow')) S.drawFast(ctx, 'a_' + u.kind + '_shadow', px, py, 0, u.dir < 0);
      else { ctx.fillStyle = 'rgba(10,26,33,0.3)'; ctx.fillRect(px + 1, py + 6, 6, 2); }
      this.drawAnimal(ctx, u, px, py - 14 - Math.round(Math.sin(time * 3 + u.id) * 2), frame);
    }
    if (near) {
      if (bubbles.length > 1) bubbles.sort((p, q) => p.y - q.y);
      for (const b of bubbles) {
        if (!S.has('b_' + b.icon)) continue;
        S.drawFast(ctx, 'b_frame', b.x, b.y - 19, 0, false);
        S.drawFast(ctx, 'b_' + b.icon, b.x, b.y - 19, 0, false);
      }
      if (zoomBig) for (const s of this._barCand || []) {
        if (s.dead || s.x + s.w < vt.x0 || s.x > vt.x1 || s.y + s.h < vt.y0 || s.y > vt.y1) continue;
        const px = s.x * 8;
        if (s.upgrading && s.built !== false) bars.push({ x: px, y: (s.y + s.h) * 8 - 2, w: s.w * 8, v: s.progress || 0, col: '#f2b541' });
        else if (!s.built && s.progress > 0) bars.push({ x: px, y: (s.y + s.h) * 8 - 2, w: s.w * 8, v: s.progress, col: '#f2b541' });
        else if (s.built && s.hp < s.maxHp * 0.98 && s.type !== 'field' && s.type !== 'ruin') bars.push({ x: px, y: (s.y + s.h) * 8 - 2, w: s.w * 8, v: s.hp / s.maxHp, col: '#e2543d' });
      }
      for (const b of bars) {
        ctx.fillStyle = '#0a1a21'; ctx.fillRect(b.x, b.y, b.w, 2);
        ctx.fillStyle = b.col; ctx.fillRect(b.x, b.y, Math.max(1, Math.round(b.w * Math.max(0, Math.min(1, b.v)))), 1);
      }
    }
    return drawn;
  };

  // Deko, Bauwerke und Figuren zeilenweise von oben nach unten (ohne Objekt-Ebene)
  Renderer.prototype.drawObjects = function (ctx, vt, low, opts) {
    const st = this.st, S = this.S, W = st.W;
    const y0 = vt.y0, y1 = vt.y1, nrows = y1 - y0 + 1;
    const rowU = this.rowU, rowS = this.rowS;
    if (this._spikes) this._spikes.length = 0;
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
        if (s.type === 'rail') continue;
        if (by < y0 || by > y1 || s.x + s.w - 1 < sx0 || s.x > sx1) continue;
        rowS[by - y0].push(s);
        if ((s.device === 'spikes' || s.device === 'trap') && by + 1 - y0 < nrows) (this._spikes || (this._spikes = [])).push(s);
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
    if (st.units) for (const u of st.units) if (!u.dead && u.ind !== 'train') addU(u, false);
    if (st.animals) for (const an of st.animals) if (!an.dead && !an.buried) addU(an, true);

    const time = this.time;
    const devS = ctx.getTransform ? ctx.getTransform().a : 1;
    const sway = devS >= 2 && this.gfx.quality !== 'low' && !this.autoOff.sway;
    const swayFn = typeof S.swayKey === 'function', swayStep = (time * 2) | 0;
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
          const frame = it.animal ? (u.moving ? (((time * 5 + (u.id & 7) * 0.37) | 0) & 1) : 0) : this.unitFrame(u);
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
          if (d) {
            let key = d.key, sw = 0;
            if (sway && SWAY_RE.test(key)) {
              if (swayFn) { const k2 = S.swayKey(key, (x + y + swayStep) % 3); if (k2 !== key && S.has(k2)) key = k2; }
              else { sw = Math.sin(time * 1.6 + x * 0.42 + y * 0.27) + 0.5 * Math.sin(time * 0.6 + x * 0.11); sw = Math.round(sw * 0.45 * devS) / devS; }
            }
            S.drawFast(ctx, key, x * 8 + d.dx + sw, y * 8 + d.dy, 0, false); drawn++;
          }
        }
      }
      for (const s of ls) if (s.type !== 'field') { this.drawStruct(ctx, s, cityK, zoomBig, bars); drawn++; }
      if (this._spikes && this._spikes.length) for (const sp of this._spikes) if (sp.y + sp.h === y) this.drawDevice(ctx, sp);
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

  Renderer.prototype.drawStruct = function (ctx, s, cityK, zoomBig, bars, phase) {
    const S = this.S;
    const k = cityK.get(s.cityId);
    const gov = k ? k.gov : 'tribe';
    const team = k ? k.colorIndex | 0 : 10;
    let key = this.structKey(s, gov);
    if (key === null) return;
    if (s.type === 'field' && typeof S.swayKey === 'function' && (key === 's_field_3' || key === 's_field_2')) {
      const k2 = S.swayKey(key, (s.x + s.y + (phase != null ? phase : ((this.time * 2) | 0))) % 3); if (k2 && S.has(k2)) key = k2;
    }
    const inf = S.info(key);
    const fh = inf ? inf.fh : s.h;
    const px = s.x * 8 - (inf && inf.fw > s.w ? (inf.fw - s.w) * 4 : 0), py = (s.type === 'ruin' && fh > s.h ? s.y : s.y + s.h - fh) * 8;
    S.drawFast(ctx, key, px, py, team, false);
    // Kornwogen auf reifenden Feldern: helle Welle läuft über das Feld
    if (s.type === 'field' && s.built !== false && (s.growth | 0) >= 2 && zoomBig && typeof S.swayKey !== 'function') {
      const row = ((this.time * 7 + s.x * 2.3 + s.y * 1.7) | 0) % 12;
      if (row < 8) { ctx.fillStyle = 'rgba(255,240,170,0.28)'; ctx.fillRect(px, py + row, 8, 1); }
    }
    // Verteidigungsgerät auf dem Mauerstück (Stacheln stehen davor und werden eine Zeile tiefer gezeichnet)
    if (s.device && s.device !== 'spikes' && s.device !== 'trap' && s.built !== false) this.drawDevice(ctx, s);
    // Lagerfeuer: Feuer-Frames der Lager-Sprites, sonst fx_fire in der Mitte
    if (s.type === 'center' && s.stage === 0 && s.built !== false && key.indexOf('s_camp') === 0) {
      const fr = ((this.time * 6) | 0) % 3;
      let fk = null;
      if (typeof S.campKey === 'function') { try { fk = S.campKey(varOf(s), fr); } catch (e) { fk = null; } }
      if (fk && fk !== key && S.has(fk)) S.drawFast(ctx, fk, px, py, team, false);
      else if (fk && fk === key) { /* Helfer liefert dasselbe Bild: Feuer steckt schon drin */ }
      else if (S.has(key + '_1')) S.drawFast(ctx, key + '_' + fr % 2, px, py, team, false);
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

  Renderer.prototype.drawDevice = function (ctx, s) {
    const S = this.S, base = 's_walldev_' + s.device;
    const shot = !this._bakeNoShot && this.muzzleT && this.time - (this.muzzleT.get(s.y * this.st.W + s.x) || -9) < 0.25;
    const k = S.has(base + '_' + (shot ? 1 : 0)) ? base + '_' + (shot ? 1 : 0) : (S.has(base) ? base : null);
    let off = s.device === 'spikes' || s.device === 'trap' ? 8 : 0;
    if (typeof S.wallDevOffset === 'function' && off === 0) {
      const c = this._cityById && this._cityById.get(s.cityId), k2 = c && this._kings ? this._kings.get(c.kingdomId) : null;
      try { const o = S.wallDevOffset(s.style || (k2 && k2.gov) || 'tribe', s.level, s.device); if (typeof o === 'number') off = o; } catch (e) { /* egal */ }
    }
    if (k) S.drawFast(ctx, k, s.x * 8, s.y * 8 + off, 0, false);
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


  // ===========================================================================
  // Lebendige Pixelwelt: Wasser, Leben, Licht, Wetter, Partikel (rein optisch, deterministisch genug)
  // ===========================================================================
  const WATER_IDS = {}; // Gelände-ID -> 1 Meer/See, 2 Fluss
  function waterKind(id) {
    if (!WATER_IDS._init) { WATER_IDS._init = 1; const T = WW.T; WATER_IDS[T.DEEP] = 1; WATER_IDS[T.WATER] = 1; WATER_IDS[T.SHALLOW] = 1; WATER_IDS[T.RIVER] = 2; }
    return WATER_IDS[id] || 0;
  }
  function hash2(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  }

  // Glitzer-Muster: 6 Bilder, 64×64, kurze helle Striche, die auf- und abblenden
  Renderer.prototype.glintFrames = function () {
    if (this._glint) return this._glint;
    const N = 8, S = 64, out = [];
    const dashes = [];
    for (let i = 0; i < 46; i++) dashes.push({ x: (hash2(i, 1, 9) * S) | 0, y: (hash2(i, 2, 9) * S) | 0, l: 1 + ((hash2(i, 3, 9) * 3) | 0), ph: (hash2(i, 4, 9) * N) | 0, c: hash2(i, 5, 9) });
    for (let f = 0; f < N; f++) {
      const cv = document.createElement('canvas'); cv.width = S; cv.height = S;
      const g = cv.getContext('2d');
      for (const d of dashes) {
        const age = (f - d.ph + N) % N;
        if (age > 3) continue;
        const a = age === 0 || age === 3 ? 0.25 : 0.55;
        g.fillStyle = d.c < 0.3 ? 'rgba(255,255,255,' + a + ')' : 'rgba(196,236,250,' + a + ')';
        g.fillRect(d.x, d.y, d.l + (age === 1 || age === 2 ? 1 : 0), 1);
      }
      out.push(cv);
    }
    return (this._glint = out);
  };

  // je Block: Masken für Meer/See, Fluss und zwei Brandungsringe
  Renderer.prototype.buildWater = function (c) {
    const st = this.st, W = st.W, H = st.H, t = st.terrain;
    const x0 = c.cx * CH, y0 = c.cy * CH, x1 = Math.min(W, x0 + CH), y1 = Math.min(H, y0 + CH);
    let any = false;
    for (let y = y0; y < y1 && !any; y++) for (let x = x0; x < x1; x++) if (waterKind(t[y * W + x])) { any = true; break; }
    c.waterDirty = false;
    c.hasWater = any;
    if (!any) return;
    const mk = (k) => { if (!c[k]) { c[k] = document.createElement('canvas'); c[k].width = CPX; c[k].height = CPX; } const g = c[k].getContext('2d'); g.clearRect(0, 0, CPX, CPX); return g; };
    const gs = mk('wSea'), gr = mk('wRiv'), f1 = mk('wFoam1'), f2 = mk('wFoam2');
    gs.fillStyle = gr.fillStyle = '#fff';
    f1.fillStyle = 'rgba(232,248,250,1)'; f2.fillStyle = 'rgba(232,248,250,0.85)';
    const land = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !waterKind(t[y * W + x]);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const k = waterKind(t[y * W + x]);
      if (!k) continue;
      const px = (x - x0) * 8, py = (y - y0) * 8;
      (k === 2 ? gr : gs).fillRect(px, py, 8, 8);
      if (k === 2) continue;
      // Brandung: Ring 1 direkt am Ufer, Ring 2 zwei Pixel weiter draußen, gestrichelt nach Kachel-Hash
      const n = land(x, y - 1), e = land(x + 1, y), so = land(x, y + 1), w = land(x - 1, y);
      if (!(n || e || so || w)) continue;
      for (let i = 0; i < 8; i++) {
        const on1 = hash2(x * 8 + i, y, 3) > 0.25, on2 = hash2(x * 8 + i, y, 4) > 0.45;
        if (n) { if (on1) f1.fillRect(px + i, py, 1, 1); if (on2) f2.fillRect(px + i, py + 2, 1, 1); }
        if (so) { if (on1) f1.fillRect(px + i, py + 7, 1, 1); if (on2) f2.fillRect(px + i, py + 5, 1, 1); }
        if (w) { if (on1) f1.fillRect(px, py + i, 1, 1); if (on2) f2.fillRect(px + 2, py + i, 1, 1); }
        if (e) { if (on1) f1.fillRect(px + 7, py + i, 1, 1); if (on2) f2.fillRect(px + 5, py + i, 1, 1); }
      }
    }
  };

  // Glitzer je Block einmal vorberechnen (4 Bilder, Meer und Fluss mit versetzten Mustern), dann nur noch wechseln
  const WFR = 6;
  Renderer.prototype.buildWaterGlints = function (c) {
    if (typeof this.S.waterAnimKey === 'function') return this.buildWaterAnim(c);
    const frames = this.glintFrames();
    c.wGl = [];
    for (let f = 0; f < WFR; f++) {
      const cv = document.createElement('canvas'); cv.width = CPX; cv.height = CPX;
      const g = cv.getContext('2d');
      g.fillStyle = g.createPattern(frames[(f * 2) % frames.length], 'repeat');
      g.fillRect(0, 0, CPX, CPX);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(c.wSea, 0, 0);
      const tmp = document.createElement('canvas'); tmp.width = CPX; tmp.height = CPX;
      const tg = tmp.getContext('2d');
      tg.save(); tg.translate(f * 5, f * 5); tg.fillStyle = tg.createPattern(frames[(f * 2 + 3) % frames.length], 'repeat'); tg.fillRect(-64, -64, CPX + 128, CPX + 128); tg.restore();
      tg.globalCompositeOperation = 'destination-in'; tg.drawImage(c.wRiv, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.drawImage(tmp, 0, 0);
      // Brandung in dieses Bild einbacken: zwei Ringe, die gegeneinander an- und ablaufen
      const ph = f / WFR * Math.PI * 2;
      g.globalAlpha = Math.max(0, 0.5 + 0.45 * Math.sin(ph)) * 0.95; g.drawImage(c.wFoam1, 0, 0);
      g.globalAlpha = Math.max(0, 0.5 + 0.45 * Math.sin(ph - 2.1)) * 0.7; g.drawImage(c.wFoam2, 0, 0);
      g.globalAlpha = 1;
      c.wGl.push(cv);
    }
  };
  // Wasser aus den Animationsbildern der Grafik: je Block 4 Phasen in 16 px je Kachel, mit Brandung
  Renderer.prototype.buildWaterAnim = function (c) {
    const S = this.S, st = this.st, W = st.W, H = st.H, t = st.terrain;
    const x0 = c.cx * CH, y0 = c.cy * CH, x1 = Math.min(W, x0 + CH), y1 = Math.min(H, y0 + CH);
    const T = (x, y) => x < 0 || y < 0 || x >= W || y >= H ? -1 : t[y * W + x];
    c.wGl = []; c.wHi = true;
    for (let f = 0; f < 4; f++) {
      const cv = document.createElement('canvas'); cv.width = cv.height = CPX * 2;
      const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
      g.setTransform(2, 0, 0, 2, -x0 * 16, -y0 * 16);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const id = t[y * W + x];
        if (!waterKind(id)) continue;
        const k = S.waterAnimKey(id, f);
        if (k && S.has(k)) S.drawFast(g, k, x * 8, y * 8, 0, false);
        const sk = typeof S.surfKey === 'function' ? S.surfKey(T(x, y - 1), T(x + 1, y), T(x, y + 1), T(x - 1, y), f) : null;
        if (sk && S.has(sk)) S.drawFast(g, sk, x * 8, y * 8, 0, false);
      }
      c.wGl.push(cv);
    }
  };

  Renderer.prototype.drawWaterLayer = function (ctx, cx0, cx1, cy0, cy1, rx, ry, low) {
    const st = this.st, t = this.time;
    const fr = ((t * 3.5) | 0) % WFR;
    const a1 = 0.5 + 0.45 * Math.sin(t * 1.7), a2 = 0.5 + 0.45 * Math.sin(t * 1.7 - 2.1);
    let builds = 2;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const c = this.chunks[cy * this.cw + cx];
      if (!c.built) continue;
      if (c.waterDirty || c.hasWater == null) { this.buildWater(c); c.wGl = null; c.wHi = false; }
      if (!c.hasWater) continue;
      const X = cx * CPX, Y = cy * CPX, w = Math.min(CPX, st.W * 8 - X), h = Math.min(CPX, st.H * 8 - Y);
      const dx = rx(X), dy = ry(Y), dw = rx(X + w) - dx, dh = ry(Y + h) - dy;
      if (!low && !c.wGl && builds-- > 0) { this.buildWaterGlints(c); this.trimChunks(); }
      if (!low && c.wGl) { c.usedT = t; ctx.globalAlpha = 1 - (this._night || 0) * 0.55; const k = c.wHi ? 2 : 1; ctx.drawImage(c.wGl[c.wHi ? ((t * 4) | 0) & 3 : fr], 0, 0, w * k, h * k, dx, dy, dw, dh); ctx.globalAlpha = 1; continue; }
      // weite Ansicht oder noch nicht gebaut: nur die Brandung
      ctx.globalAlpha = Math.max(0, a1) * 0.9; ctx.drawImage(c.wFoam1, 0, 0, w, h, dx, dy, dw, dh);
      ctx.globalAlpha = Math.max(0, a2) * 0.6; ctx.drawImage(c.wFoam2, 0, 0, w, h, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    }
  };

  // Vögel, Schmetterlinge, Fische, Schornsteinrauch
  Renderer.prototype.drawLife = function (g, vt, dt, opts) {
    const st = this.st, t = this.time, W = st.W, q = this.gfx.quality;
    const night = this._night || 0;
    // Vogelschwärme ziehen über das Bild
    const fl = this.flocks || (this.flocks = []);
    this._flockT = (this._flockT || 0) - dt;
    if (this._flockT <= 0 && fl.length < (q === 'low' ? 1 : 3) && night < 0.6) {
      this._flockT = 6 + Math.random() * 8;
      const fromLeft = Math.random() < 0.5, y = (vt.y0 + Math.random() * (vt.y1 - vt.y0)) * 8;
      const n = 4 + ((Math.random() * 7) | 0), birds = [];
      for (let i = 0; i < n; i++) birds.push({ ox: -i * 5 + Math.random() * 3, oy: (i % 2 ? 1 : -1) * i * 2.4 + Math.random() * 2, ph: Math.random() * 6 });
      fl.push({ x: fromLeft ? (vt.x0 - 2) * 8 : (vt.x1 + 2) * 8, y: y, vx: (fromLeft ? 1 : -1) * (14 + Math.random() * 8), vy: (Math.random() - 0.5) * 4, birds: birds, life: 40 });
    }
    g.fillStyle = '#2b2533';
    for (let k = fl.length - 1; k >= 0; k--) {
      const f = fl[k];
      f.x += f.vx * dt; f.y += f.vy * dt + Math.sin(t * 0.7 + k) * 2 * dt; f.life -= dt;
      if (f.life <= 0) { fl.splice(k, 1); continue; }
      for (const b of f.birds) {
        const bx = Math.round(f.x + b.ox * Math.sign(f.vx)), by = Math.round(f.y + b.oy - 18);
        const up = Math.sin(t * 9 + b.ph) > 0;
        g.fillRect(bx, by, 1, 1);
        if (up) { g.fillRect(bx - 1, by - 1, 1, 1); g.fillRect(bx + 1, by - 1, 1, 1); } else { g.fillRect(bx - 1, by, 1, 1); g.fillRect(bx + 1, by, 1, 1); }
      }
    }
    // Schmetterlinge über Blumenwiesen (nur nah)
    if ((opts.scale || 1) >= 2.5 && night < 0.4) {
      const T = WW.T, cols = ['#f29db6', '#ffe68c', '#fbf7ee', '#bd8af0'];
      let n = 0;
      for (let y = vt.y0; y <= vt.y1 && n < 14; y++) for (let x = vt.x0; x <= vt.x1 && n < 14; x++) {
        const id = st.terrain[y * W + x];
        if (id !== T.FLOWERS && id !== T.GRASS) continue;
        const h = hash2(x, y, 21);
        if (h > (id === T.FLOWERS ? 0.06 : 0.008)) continue;
        n++;
        const px = x * 8 + 4 + Math.sin(t * 1.3 + h * 40) * 6, py = y * 8 + 2 + Math.sin(t * 2.1 + h * 70) * 3 - 3;
        g.fillStyle = cols[(h * 1000 | 0) % cols.length];
        const open = Math.sin(t * 14 + h * 9) > 0;
        g.fillRect(Math.round(px) - (open ? 1 : 0), Math.round(py), open ? 3 : 1, 1);
      }
    }
    // springende Fische
    this._fishT = (this._fishT || 0) - dt;
    const fish = this.fishes || (this.fishes = []);
    if (this._fishT <= 0) {
      this._fishT = 0.8 + Math.random() * 1.8;
      for (let tries = 0; tries < 12; tries++) {
        const x = (vt.x0 + Math.random() * (vt.x1 - vt.x0)) | 0, y = (vt.y0 + Math.random() * (vt.y1 - vt.y0)) | 0;
        const id = st.terrain[y * W + x];
        if (id === WW.T.WATER || id === WW.T.SHALLOW || id === WW.T.RIVER) { fish.push({ x: x * 8 + 4, y: y * 8 + 5, t: 0, d: Math.random() < 0.5 ? -1 : 1 }); break; }
      }
    }
    for (let k = fish.length - 1; k >= 0; k--) {
      const f = fish[k]; f.t += dt;
      if (f.t > 0.9) { fish.splice(k, 1); continue; }
      const p = f.t / 0.6;
      if (p < 1) {
        const fx = f.x + f.d * p * 5, fy = f.y - Math.sin(p * Math.PI) * 5;
        g.fillStyle = '#d6e2ea'; g.fillRect(Math.round(fx), Math.round(fy), 2, 1);
        g.fillStyle = '#7f8aa3'; g.fillRect(Math.round(fx) + (f.d > 0 ? -1 : 2), Math.round(fy), 1, 1);
      }
      if (p < 0.25 || p > 0.85) { g.fillStyle = 'rgba(232,248,250,0.8)'; const sx = p < 0.25 ? f.x : f.x + f.d * 5; g.fillRect(Math.round(sx) - 1, Math.round(f.y) + 1, 3, 1); }
    }
    // Schornsteinrauch aus Wohnhäusern: feine Rauchfahne der Grafik, sonst Wölkchen
    if (this.S.has('fx_chimney_0') && st.structs) {
      const nc = typeof this.S.fxFrames === 'function' ? this.S.fxFrames('chimney') : 4;
      let n = 0;
      for (const s of st.structs) {
        if (n > 40) break;
        if (s.type !== 'house' || !s.built || s.dead || (s.level | 0) < 1) continue;
        if (s.x < vt.x0 - 1 || s.x > vt.x1 || s.y < vt.y0 || s.y > vt.y1 + 1) continue;
        if (hash2(s.id, 3, 17) > 0.45) continue;
        n++;
        this.S.drawFast(g, 'fx_chimney_' + (((t * 6 + s.id) | 0) % nc), s.x * 8 + 10, s.y * 8 - 12, 0, false);
      }
    } else
    this._chimT = (this._chimT || 0) - dt;
    if (!this.S.has('fx_chimney_0') && this._chimT <= 0 && st.structs) {
      this._chimT = q === 'low' ? 1.2 : 0.45;
      const cands = [];
      for (const s of st.structs) {
        if (s.type !== 'house' || !s.built || s.dead || (s.level | 0) < 1) continue;
        if (s.x < vt.x0 || s.x > vt.x1 || s.y < vt.y0 || s.y > vt.y1 + 1) continue;
        cands.push(s);
        if (cands.length > 60) break;
      }
      if (cands.length) {
        const s = cands[(Math.random() * cands.length) | 0];
        this.addPlume(s.x * 8 + s.w * 8 - 5, s.y * 8 - 6, true, -6, -14, false, 0.45);
      }
    }
  };

  // Partikel: Funken und Trümmer bei Explosionen, Einschlägen, Blitzen
  Renderer.prototype.burst = function (f) {
    const P = this.parts || (this.parts = []);
    const kind = f.type;
    let n = 0, sparks = 0, big = 1;
    if (kind === 'explosion') { n = 10 + Math.min(30, (f.r || 1) * 6); sparks = n; big = Math.min(4, f.r || 1); }
    else if (kind === 'meteor') { n = 24; sparks = 18; big = 2.5; }
    else if (kind === 'bolt') { sparks = 10; }
    else if (kind === 'hit' || kind === 'muzzle') { sparks = 3; }
    else if (kind === 'mushroom') { n = 40; sparks = 30; big = 5; }
    else return;
    if (this.gfx.quality === 'low') { n = n >> 1; sparks = sparks >> 1; }
    if (P.length > 400) return;
    const x = f.x * 8, y = f.y * 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (10 + Math.random() * 30) * big;
      P.push({ x: x, y: y, z: 0, vx: Math.cos(a) * v * 0.6, vy: Math.sin(a) * v * 0.35, vz: 20 + Math.random() * 40 * big, life: 0.8 + Math.random() * 0.8, t: 0,
        col: Math.random() < 0.5 ? '#625a71' : '#80532f', size: Math.random() < 0.3 ? 2 : 1 });
    }
    for (let i = 0; i < sparks; i++) {
      const a = Math.random() * Math.PI * 2, v = (15 + Math.random() * 40) * big;
      P.push({ x: x, y: y, z: 2, vx: Math.cos(a) * v * 0.7, vy: Math.sin(a) * v * 0.4, vz: 10 + Math.random() * 30 * big, life: 0.4 + Math.random() * 0.5, t: 0,
        col: Math.random() < 0.5 ? '#ffd23f' : '#ff8a2a', size: 1, glow: true });
    }
    // Druckwelle als sichtbarer Ring bei großen Explosionen
    if (big >= 2 && this.fx.length < 500) this.fx.push({ type: 'shockwave', x: f.x, y: f.y, r: big * 2.5, t: 0, d: 0.7, seed: 1 });
  };
  Renderer.prototype.drawParticles = function (g, dt) {
    const P = this.parts;
    if (!P || !P.length) return;
    let w = 0;
    for (let i = 0; i < P.length; i++) {
      const p = P[i];
      p.t += dt;
      if (p.t >= p.life) continue;
      p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= 90 * dt; p.z += p.vz * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.5; p.vy *= 0.5; }
      P[w++] = p;
      const k = p.t / p.life;
      g.globalAlpha = p.glow ? 1 - k : Math.min(1, 1.5 - k);
      g.fillStyle = p.col;
      g.fillRect(Math.round(p.x), Math.round(p.y - p.z), p.size, p.size);
    }
    P.length = w;
    g.globalAlpha = 1;
  };

  // Wolkenschatten: weiche Flecken, ziehen mit dem Wind
  Renderer.prototype.drawCloudShadows = function (g, vt) {
    if (!this._clouds) {
      const N = 48, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
      const c = cv.getContext('2d'), img = c.createImageData(N, N), d = img.data;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        // weiches, kachelbares Rauschen aus Sinuswellen
        let v = 0;
        for (let o = 0; o < 4; o++) { const f = (o + 1) * 2 * Math.PI / N; v += Math.sin(x * f * (o + 1) * 0.5 + o * 1.7 + Math.sin(y * f * 0.7 + o)) * Math.cos(y * f * (o % 2 ? 1 : 0.5) * (o + 1) * 0.5 + o * 2.3) / (o + 1); }
        const a = Math.min(1, Math.max(0, v - 0.35) * 1.3) * 0.28;
        const i = (y * N + x) * 4; d[i] = Math.round(255 - a * 233); d[i + 1] = Math.round(255 - a * 225); d[i + 2] = Math.round(255 - a * 203); d[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      this._clouds = cv;
    }
    const w = this.wind(), t = this.time;
    const size = 8 * 64;                 // eine Wolkenkachel deckt 64×64 Spielkacheln
    const ox = ((t * 3 * (w.x || 0.6)) % size + size) % size, oy = ((t * 3 * (w.y || 0.2)) % size + size) % size;
    const x0 = Math.floor((vt.x0 * 8 - ox) / size) * size + ox, y0 = Math.floor((vt.y0 * 8 - oy) / size) * size + oy;
    g.save(); g.imageSmoothingEnabled = true;
    for (let y = y0; y < (vt.y1 + 2) * 8; y += size) for (let x = x0; x < (vt.x1 + 2) * 8; x += size) g.drawImage(this._clouds, x, y, size, size);
    g.restore();
  };

  // Tageszeit und Wetter. dayPhase 0..1 (0 = Mitternacht); ein Tag je Spieljahr
  const NIGHT = [52, 64, 120], DUSK = [255, 150, 90];
  Renderer.prototype.drawAtmosphere = function (ctx, cam, vt, dt, opts, s, ox, oy) {
    const st = this.st, cv = this.canvas, W = cv.width, H = cv.height;
    const ph = opts.dayPhase == null ? 0.5 : opts.dayPhase;
    const sun = this.gfx.daynight ? Math.sin((ph - 0.25) * Math.PI * 2) : 1;  // −1 Nacht … 1 Mittag
    const night = this.gfx.daynight ? Math.max(0, Math.min(1, (-sun + 0.05) / 0.45)) : 0;
    const dusk = this.gfx.daynight ? Math.max(0, 1 - Math.abs(sun) / 0.32) : 0;
    this._night = night;
    // Wetter (rein optisch): Schauer nach Jahr und Ort, über der Kamera
    const wx = this.weatherState(cam, dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Nacht (bläulich abdunkeln) und Wolkenschatten: eine Schattierungs-Ebene in 1/8 Auflösung, ein Multiplizier-Durchgang
    const clouds = this.gfx.clouds !== false && this.gfx.quality !== 'low' && !this.autoOff.clouds;
    const k = Math.min(0.78, night * 0.72 + wx.dark * 0.35);
    if (k > 0.01 || clouds) {
      const sw = Math.ceil(W / 8), sh = Math.ceil(H / 8);
      const L = this._shade || (this._shade = document.createElement('canvas'));
      if (L.width !== sw || L.height !== sh) { L.width = sw; L.height = sh; }
      const lg = L.getContext('2d');
      const r = Math.round(255 - (255 - NIGHT[0]) * k), gg = Math.round(255 - (255 - NIGHT[1]) * k), b = Math.round(255 - (255 - NIGHT[2]) * k);
      lg.globalCompositeOperation = 'source-over';
      lg.fillStyle = 'rgb(' + r + ',' + gg + ',' + b + ')';
      lg.fillRect(0, 0, sw, sh);
      if (clouds) {
        // Wolken in Weltkoordinaten, auf die kleine Ebene abgebildet
        lg.save(); lg.globalCompositeOperation = 'multiply';
        lg.setTransform(s / 8, 0, 0, s / 8, ox / 8, oy / 8);
        this.drawCloudShadows(lg, vt);
        lg.restore();
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(L, 0, 0, sw * 8, sh * 8);
      ctx.restore();
    }
    // Morgen- und Abendrot
    if (dusk > 0.02) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = 'rgba(' + DUSK[0] + ',' + DUSK[1] + ',' + DUSK[2] + ',' + (dusk * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    // Lichter in der Dämmerung und Nacht: Fenster, Feuer (additiv)
    const lights = Math.max(night, dusk * 0.5);
    if (lights > 0.05) {
      ctx.setTransform(s, 0, 0, s, ox, oy);
      this.drawLights(ctx, vt, lights);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // Niederschlag in Bildschirmpixeln
    if ((wx.rain > 0.02 || wx.snow > 0.02) && !this.autoOff.precip) {
      const nt = (vt.x1 - vt.x0 + 1) * (vt.y1 - vt.y0 + 1);
      if (typeof this.S.weatherKey === 'function' && nt < 1200) {
        ctx.setTransform(s, 0, 0, s, ox, oy);
        this.drawWeatherTiles(ctx, vt, wx);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else this.drawPrecip(ctx, wx, dt);
    }
    if (wx.fog > 0.02) {
      ctx.fillStyle = 'rgba(225,232,236,' + (wx.fog * 0.28).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (wx.flash > 0) { ctx.fillStyle = 'rgba(240,244,255,' + Math.min(0.55, wx.flash) + ')'; ctx.fillRect(0, 0, W, H); }
  };

  // Wetter: Schauer kommen und gehen (nach Spieljahr und Zufall), Schnee in kalten Gegenden, Nebel am Morgen
  Renderer.prototype.weatherState = function (cam, dt) {
    const w = this._wx || (this._wx = { rain: 0, snow: 0, fog: 0, dark: 0, flash: 0, tRain: 0, target: 0, storm: false, next: 8 });
    if (!this.gfx.weather) { w.rain = w.snow = w.fog = w.dark = w.flash = 0; return w; }
    const st = this.st;
    w.next -= dt;
    if (w.next <= 0) {
      // neuer Wetterabschnitt
      const r = Math.random();
      w.target = r < 0.62 ? 0 : r < 0.9 ? 0.6 : 1;
      w.storm = w.target >= 1 && Math.random() < 0.6;
      w.next = w.target ? 14 + Math.random() * 16 : 25 + Math.random() * 35;
    }
    // Regen der Simulation (Kraft) zählt auch
    w.rain += ((w.target) - w.rain) * Math.min(1, dt * 0.4);
    // kalt? Gelände unter der Kamera
    const tx = Math.max(0, Math.min(st.W - 1, (cam.x / 8) | 0)), ty = Math.max(0, Math.min(st.H - 1, (cam.y / 8) | 0));
    const tk = (WW.TERRAIN[st.terrain[ty * st.W + tx]] || {}).key;
    const cold = tk === 'snow' || tk === 'snowfield' || tk === 'tundra' || tk === 'taiga';
    w.snowMode = cold;
    w.snow = cold ? w.rain : 0;
    const rainOnly = cold ? 0 : w.rain;
    w.dark = Math.max(rainOnly, w.snow * 0.6) * 0.7;
    // Morgennebel in Tälern: nur bei wenig Wind und kurz nach Sonnenaufgang (über dayPhase gesteuert)
    const ph = this._dayPhase || 0.5;
    w.fog = Math.max(0, 1 - Math.abs(ph - 0.3) / 0.06) * 0.6;
    if (w.flash > 0) w.flash -= dt * 2;
    if (w.storm && rainOnly > 0.6 && Math.random() < dt * 0.25) { w.flash = 0.55; }
    w.rainOnly = rainOnly;
    return w;
  };
  // Regen/Schnee aus den kachelbaren Sprites der Grafik; die Muster laufen über die Kacheln nach unten
  Renderer.prototype.drawWeatherTiles = function (g, vt, wx) {
    const S = this.S, snow = wx.snow > (wx.rainOnly || 0);
    const kind = snow ? 'snow' : 'rain', amt = Math.min(1, Math.max(wx.snow, wx.rainOnly || 0));
    const fr = ((this.time * (snow ? 3 : 8)) | 0) & 1;
    const shift = ((this.time * (snow ? 10 : 60)) | 0) % 8;
    g.globalAlpha = Math.min(0.9, 0.3 + amt * 0.6);
    for (let y = vt.y0 - 1; y <= vt.y1; y++) for (let x = vt.x0; x <= vt.x1; x++) {
      const k = S.weatherKey(kind, fr, x, y);
      if (k && S.has(k)) S.drawFast(g, k, x * 8, y * 8 + shift, 0, false);
    }
    g.globalAlpha = 1;
  };

  Renderer.prototype.drawPrecip = function (ctx, wx, dt) {
    const cv = this.canvas, W = cv.width, H = cv.height, dpr = Math.max(1, this._dpr || 1);
    const P = this.drops || (this.drops = []);
    const want = Math.round((this.gfx.quality === 'low' ? 90 : 220) * Math.max(wx.rainOnly || 0, wx.snow));
    while (P.length < want) P.push({ x: Math.random() * W, y: Math.random() * H, v: 0.7 + Math.random() * 0.6 });
    if (P.length > want) P.length = want;
    const snow = wx.snow > (wx.rainOnly || 0);
    const wind = this.wind();
    ctx.fillStyle = snow ? 'rgba(250,252,255,0.9)' : 'rgba(190,215,235,0.55)';
    for (const p of P) {
      if (snow) { p.y += (40 * p.v) * dt * dpr; p.x += (Math.sin(this.time * 1.5 + p.v * 9) * 12 + wind.x * 10) * dt * dpr; }
      else { p.y += 520 * p.v * dt * dpr; p.x += (wind.x * 60 + 40) * dt * dpr; }
      if (p.y > H) { p.y -= H; p.x = Math.random() * W; }
      if (p.x > W) p.x -= W; else if (p.x < 0) p.x += W;
      if (snow) ctx.fillRect(Math.round(p.x), Math.round(p.y), 2 * dpr, 2 * dpr);
      else ctx.fillRect(Math.round(p.x), Math.round(p.y), dpr, 7 * dpr);
    }
  };

  // warmes Licht: vorberechneter Lichtfleck, additiv an Häusern, Zentren, Lagerfeuern, Bränden
  Renderer.prototype.glowSprite = function () {
    if (this._glow) return this._glow;
    if (this.S.has('fx_glow_warm')) { const inf = this.S.info('fx_glow_warm'); this._glow = this.S.iconCanvas('fx_glow_warm', inf && inf.scale ? Math.round(1 / inf.scale) : 1); if (this._glow) return this._glow; }
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const c = cv.getContext('2d'), gr = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,200,110,0.85)'); gr.addColorStop(0.35, 'rgba(255,160,70,0.35)'); gr.addColorStop(1, 'rgba(255,140,60,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 32, 32);
    return (this._glow = cv);
  };
  Renderer.prototype.drawLights = function (g, vt, k) {
    const st = this.st, glow = this.glowSprite(), S = this.S;
    // erleuchtete Fenster: litKey liefert das Nachtbild des Gebäudes
    if (typeof S.litKey === 'function') {
      const cityK = this._cityK && this._cityK.size ? this._cityK : this.cityKingdoms();
      g.globalAlpha = Math.min(1, k * 1.1);
      for (const s of st.structs) {
        if (!s.built || s.dead || (s.type !== 'house' && s.type !== 'center' && s.type !== 'barracks' && s.type !== 'market' && s.type !== 'station')) continue;
        if (s.x + s.w < vt.x0 - 1 || s.x > vt.x1 + 1 || s.y + s.h < vt.y0 || s.y > vt.y1 + 3) continue;
        if (s.type === 'house' && hash2(s.id, 1, 33) > 0.35 + k * 0.6) continue;
        const kk = cityK.get(s.cityId), key = this.structKey(s, kk ? kk.gov : 'tribe'), lk = S.litKey(key);
        if (!lk || lk === key || !S.has(lk)) continue;
        const inf = S.info(lk), fh = inf ? inf.fh : s.h;
        S.drawFast(g, lk, s.x * 8, (s.y + s.h - fh) * 8, kk ? kk.colorIndex | 0 : 10, false);
      }
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = true;
    let n = 0;
    const max = this.gfx.quality === 'low' ? 60 : 180;
    for (const s of st.structs) {
      if (n >= max) break;
      if (!s.built || s.dead) continue;
      if (s.x + s.w < vt.x0 || s.x > vt.x1 || s.y + s.h < vt.y0 || s.y > vt.y1 + 1) continue;
      let r = 0, fl = 1;
      if (s.type === 'house' && (s.level | 0) >= 1) r = 10;
      else if (s.type === 'center') { r = s.stage === 0 ? 22 : 18; if (s.stage === 0) fl = 0.85 + Math.sin(this.time * 9 + s.id) * 0.15; }
      else if (s.type === 'barracks' || s.type === 'market' || s.type === 'factory' || s.type === 'tower' || s.type === 'gate') r = 8;
      if (!r) continue;
      // Fenster nicht alle gleichzeitig an
      if (s.type === 'house' && hash2(s.id, 1, 33) > 0.35 + k * 0.6) continue;
      n++;
      g.globalAlpha = Math.min(1, k * 0.8 * fl);
      const cx = (s.x + s.w / 2) * 8, cy = (s.y + s.h / 2) * 8 - 2;
      g.drawImage(glow, cx - r, cy - r, r * 2, r * 2);
    }
    if (st.fire && st.fireCount > 0) {
      for (let y = vt.y0; y <= vt.y1 && n < max + 80; y++) for (let x = vt.x0; x <= vt.x1; x++) {
        if (!st.fire[y * st.W + x]) continue;
        n++;
        g.globalAlpha = Math.min(1, k * (0.8 + Math.sin(this.time * 11 + x * 3 + y) * 0.2));
        g.drawImage(glow, x * 8 - 10, y * 8 - 12, 28, 28);
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.imageSmoothingEnabled = false;
  };

  WW.Renderer = Renderer;
  WW.Renderer.FONT_PIXEL = FONT_PIXEL;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
