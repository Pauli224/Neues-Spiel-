// =============================================================================
// Wuselwelt – 3D-Kern (Agent 3D-A): Szene, Renderer, Licht, Himmel, Dunst, Kamera, Schleife,
// Ebenen-Verwaltung, Höhenfeld des Geländes, Auswahlstrahl. Braucht das globale THREE (r128).
// =============================================================================
//
// LADEREIHENFOLGE: js/vendor/three.min.js, js/render3d/core.js, danach die Ebenen
//   (js/render3d/terrain.js, flora.js, structs*.js, units.js, fx.js – Reihenfolge egal, Ebenen tragen `order`).
//   Für die Dekozuordnung liest flora.js WW.Sprites.decorFor, falls geladen (sonst eigene Tabelle).
//
// VERTRAG (Plan 6.3) – plus Ergänzungen, mit [+] markiert
//   WW.R3.registerLayer({ name, order, init(ctx), sync(ctx, alpha), dispose(ctx), onWorld?(ctx), onQuality?(ctx) [+] })
//     init(ctx) wird beim ERSTEN attach(sim) gerufen (ctx.sim ist dann gesetzt); bei jedem weiteren attach
//     onWorld(ctx) (fehlt es: dispose + init). sync(ctx, alpha) jedes Bild vor dem Zeichnen, order aufsteigend.
//     Später angemeldete Ebenen werden im nächsten frame() nachgeholt.
//   ctx: THREE, scene, camera, renderer, sim, state (Getter), seaY (= 0), heightAt(x, z), tileHeight(tx, ty),
//     flatHeight(tx, ty, w, h), teamColor(ci) (THREE.Color, schon LINEAR), teamColors(ci) -> { main, dark, light },
//     rand(tx, ty, salt), unitPos(unit, out), visibleRect(), quality, time, dt, sunDir, mat(key, opts),
//     onTerrainChanged(fn(rect {x0,y0,x1,y1})), addShadowCaster(mesh), noShadow(mesh)
//   [+] ctx.W, ctx.H                      Kartengröße in Kacheln
//   [+] ctx.surfaceAt(x, z)               Wasseroberfläche, wo Wasser ist, sonst Gelände (für Schwimmendes, Treffer)
//   [+] ctx.waterLevel(tx, ty)            Wasserspiegel einer Wasserkachel (Meer = seaY, See/Fluss eigene Höhe) | NaN
//   [+] ctx.onTilesChanged(fn(Int32Array)) alle schmutzigen Kacheln (Gelände, Bauwerk, Feuer, Marke …), je Bild gebündelt
//   [+] ctx.tex(key)                      gemeinsame Texturen: 'detail' (256², RGBA-Rauschen, wiederholend)
//   [+] ctx.uniforms                      gemeinsame Shader-Uniforms { uTime: { value } } (Wind, Wellen)
//   [+] ctx.camDist, ctx.camTarget (THREE.Vector3), ctx.overlay (letztes setOverlay-Objekt), ctx.sunColor, ctx.alpha
//   [+] ctx.field                         Höhenfeld (siehe unten), nur lesen
//   mat(key, opts): key ∈ stone, wood, plaster, roof, thatch, metal, gold, cloth, leaf, dirt, straw, water, glow, plain
//     opts { color: '#hex' (sRGB) | THREE.Color (linear), roughness, metalness, emissive '#hex', emissiveIntensity,
//            vertexColors, flatShading, side, transparent, opacity, depthWrite } – gleiche Angaben -> dasselbe Objekt.
//   Farben in Geometrie-Vertexfarben bitte linear (WW.R3.util.lin(hex) hilft).
//
// FÜR main.js
//   const r3 = WW.R3.create(canvas, { quality: 'low'|'mid'|'high', pixelRatio? })
//   r3.attach(sim), r3.frame(alpha, dtReal), r3.resize(), r3.dispose()
//   r3.markDirty(indices)        [+] sim.drainDirtyTiles() weiterreichen (dieselbe Liste, die auch die 2D-Ansicht bekommt)
//   r3.setQuality(q)             [+] Qualität zur Laufzeit wechseln
//   r3.tileAt(clientX, clientY) -> { x, y } | null    (Kachel, ganzzahlig; dazu fx, fy Fließkomma-Treffer [+])
//   r3.project(x, y, lift?) -> { sx, sy, visible }    sx/sy in CSS-Pixeln RELATIV ZUR CANVAS (links oben)
//   r3.focus(x, y, { dist, yaw, tilt, instant })      x/y Kachelkoordinaten (Fließkomma)
//   r3.pan(dxPx, dyPx)           Ziehen: der Boden folgt dem Zeiger
//   r3.zoomAt(factor, cx, cy)    factor > 1 = heran (Abstand / factor), Punkt unter dem Zeiger bleibt stehen
//   r3.orbit(dYaw, dTilt)        Bogenmaß; tilt = Neigung über dem Horizont (0,52 … 1,45)
//   r3.cameraInfo() -> { x, y, dist, yaw, tilt }, r3.viewQuad() -> [{x,y}×4] (Bildecken auf dem Boden,
//     Reihenfolge links-oben, rechts-oben, rechts-unten, links-unten)
//   r3.setInterpolator(fn(unit, alpha, out))
//   r3.setOverlay({ territory, air, brush: { x, y, r, kind: 'tiles'|'circle'|'arrow'|'point', x2, y2 } | null,
//                   selection: { kind: 'tile'|'unit'|'city', x, y, obj, animal } | null })
//   r3.stats() -> { calls, tris, fps, ms }  [+]   r3.ctx [+] (für Testseiten)
//   WW.R3.supported() -> bool
//
// HÖHENFELD ctx.field: Raster mit 2 Punkten je Kachel (GW = 2W+1, GH = 2H+1), Punkt (gx, gz) liegt bei
//   x = gx/2, z = gz/2. g (Float32, Bodenhöhe), wl (Float32, Wasserspiegel am Punkt, -1e9 = kein Wasser),
//   tileY (Float32 W*H, Höhe in Kachelmitte), tileWL (Float32 W*H, Wasserspiegel | NaN), wkind (Uint8 W*H:
//   0 Land, 1 Meer, 2 See, 3 Fluss), near (Uint8 W*H: Abstand zum Wasser 0..3).
// =============================================================================
(function (WW) { 'use strict';

  const R3 = WW.R3 = WW.R3 || {};
  const LAYERS = R3._layers = R3._layers || [];
  let layerSeq = 0;

  // ------------------------------------------------------------------ Hilfen (auch für die Ebenen)
  function hash3(x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2246822519)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  // Wertrauschen 2D, glatt
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
    const a = hash3(xi, yi, s), b = hash3(xi + 1, yi, s), c = hash3(xi, yi + 1, s), d = hash3(xi + 1, yi + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, oct, s) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { sum += amp * vnoise(x * f, y * f, s + o * 31); norm += amp; amp *= 0.5; f *= 2.03; }
    return sum / norm;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lin(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
  R3.util = { hash3, vnoise, fbm, clamp, smooth, lin };

  const TEAM_FALLBACK = [
    ['#d8403a', '#8f2230', '#f47a62'], ['#ee8a26', '#a8521c', '#ffbb5c'], ['#efcb35', '#a8831d', '#fff08a'],
    ['#22b0a4', '#126b6c', '#6be0cf'], ['#46a5ea', '#236199', '#94d4ff'], ['#3d55c9', '#232f7d', '#7891ee'],
    ['#8c4fcb', '#522a85', '#bd8af0'], ['#d03f9e', '#84205f', '#f283c9'], ['#f58fb0', '#bd5378', '#ffc6d8'],
    ['#9c6235', '#5e3519', '#cf9561'], ['#eadfc4', '#a8977a', '#fffaec'], ['#5d6984', '#3a4259', '#94a1c0']
  ];
  function teamHex(ci) {
    const T = WW.Sprites && WW.Sprites.TEAM_COLORS;
    const i = ((ci | 0) % 12 + 12) % 12;
    if (T && T[i]) return [T[i].main, T[i].dark, T[i].light];
    return TEAM_FALLBACK[i];
  }

  R3.supported = function () {
    try {
      if (typeof THREE === 'undefined') return false;
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  };

  R3.registerLayer = function (layer) {
    if (!layer || !layer.name) return;
    for (let i = LAYERS.length - 1; i >= 0; i--) if (LAYERS[i].name === layer.name) LAYERS.splice(i, 1);
    layer._seq = layerSeq++;
    LAYERS.push(layer);
    LAYERS.sort((a, b) => ((a.order || 0) - (b.order || 0)) || (a._seq - b._seq));
    for (const inst of R3._instances || []) inst._layersChanged = true;
  };

  // ------------------------------------------------------------------ Qualitätsstufen
  const QUALITY = {
    low:  { pr: 1,   shadows: false, shadowSize: 0,    density: 0.45, aniso: 1 },
    mid:  { pr: 1.5, shadows: true,  shadowSize: 1024, density: 0.75, aniso: 4 },
    high: { pr: 2,   shadows: true,  shadowSize: 2048, density: 1,    aniso: 8 }
  };
  R3.QUALITY = QUALITY;

  // ------------------------------------------------------------------ Höhenmodell
  // Höhe 0..255 (Meeresspiegel 100) -> Welteinheiten. Flachland flach, Hügel und Gebirge deutlich überhöht.
  const SEA = 100;
  function baseElev(h) {
    if (h < SEA) return -0.22 - (SEA - h) / SEA * 4.2;
    if (h <= 175) return 0.12 + (h - SEA) / 75 * 1.05;
    if (h <= 205) return 1.17 + (h - 175) / 30 * 1.3;
    return 2.47 + Math.pow((h - 205) / 50, 0.9) * 7.5;
  }
  R3.baseElev = baseElev;

  function Field(W, H) {
    this.W = W; this.H = H; this.GW = 2 * W + 1; this.GH = 2 * H + 1;
    const NG = this.GW * this.GH, N = W * H;
    this.g = new Float32Array(NG);
    this.wl = new Float32Array(NG).fill(-1e9);
    this.tileY = new Float32Array(N);
    this.tileWL = new Float32Array(N).fill(NaN);
    this.wkind = new Uint8Array(N);
    this.near = new Uint8Array(N);
    this.elev = new Float32Array(N);       // Kachelhöhe vor dem Glätten
    this.comp = new Int32Array(N);
    this.version = 0;
  }

  // ganze Kachelhöhen neu (schnell); liefert geänderte Kacheln als Rechteck oder null
  Field.prototype.computeTiles = function (st) {
    const W = this.W, H = this.H, N = W * H, T = WW.T, ter = st.terrain, hg = st.height;
    const LUTw = WW.TERRAIN_LUT.water;
    const elev = new Float32Array(N), wk = new Uint8Array(N), wlT = new Float32Array(N).fill(NaN);
    // Abstand zum Rand von Gebirge/Hügel (Schachbrett-Abstand, 2 Durchgänge) für Massiv-Formen
    const dM = new Float32Array(N), dH = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = ter[i];
      dM[i] = (t === T.MOUNTAIN || t === T.SNOW) ? 99 : 0;
      dH[i] = (t === T.HILL || t === T.MOUNTAIN || t === T.SNOW) ? 99 : 0;
    }
    chamfer(dM, W, H); chamfer(dH, W, H);
    for (let i = 0; i < N; i++) {
      const t = ter[i], h = hg ? hg[i] : (LUTw[t] ? 90 : 130), x = i % W, y = (i / W) | 0;
      let e = baseElev(h);
      const r = hash3(x, y, 77);
      if (t === T.MOUNTAIN || t === T.SNOW) {
        e = Math.max(e, 2.6 + Math.min(dM[i], 5) * 1.45 + r * 0.9 + (t === T.SNOW ? 1.2 : 0));
        e = Math.min(e, 11.8);
      } else if (t === T.HILL) {
        e = Math.max(e, 1.25 + Math.min(dH[i], 3) * 0.35 + r * 0.35);
        e = Math.min(e, 2.9);
      } else if (t === T.SAND) {
        e = Math.min(Math.max(e, 0.1), 0.42);
      } else if (!LUTw[t]) {
        e = Math.max(e, 0.14);
        if (t !== T.RIVER) e = Math.min(e, 2.0);
      }
      if (t === T.SHALLOW) e = Math.min(e, -0.28);
      else if (t === T.WATER) e = Math.min(e, -0.7);
      else if (t === T.DEEP) e = Math.min(e, -1.8);
      elev[i] = e;
    }
    // Wasserkörper: Meer (berührt den Rand oder größter Körper), Seen, Flüsse
    const comp = this.comp; comp.fill(-1);
    const isW = (t) => t === T.DEEP || t === T.WATER || t === T.SHALLOW;
    const comps = [];
    const stack = new Int32Array(N);
    for (let i = 0; i < N; i++) {
      if (comp[i] >= 0 || !isW(ter[i])) continue;
      const id = comps.length; let sp = 0, size = 0, edge = false, shoreMin = 1e9;
      stack[sp++] = i; comp[i] = id;
      while (sp) {
        const j = stack[--sp]; size++;
        const x = j % W, y = (j / W) | 0;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
        for (let k = 0; k < 4; k++) {
          const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (isW(ter[n])) { if (comp[n] < 0) { comp[n] = id; stack[sp++] = n; } }
          else if (ter[n] !== T.RIVER) shoreMin = Math.min(shoreMin, elev[n]);
        }
      }
      comps.push({ size, edge, shoreMin });
    }
    let biggest = -1; for (let c = 0; c < comps.length; c++) if (biggest < 0 || comps[c].size > comps[biggest].size) biggest = c;
    for (let i = 0; i < N; i++) {
      const c = comp[i];
      if (c >= 0) {
        const cp = comps[c];
        if (cp.edge || c === biggest || cp.size > 400 || !(cp.shoreMin < 1e8)) { wk[i] = 1; wlT[i] = 0; }
        else {
          // See: Spiegel knapp unter dem niedrigsten Ufer, Boden darunter um die Meerestiefe
          const lvl = Math.max(0.05, cp.shoreMin - 0.08);
          wk[i] = 2; wlT[i] = lvl; elev[i] = lvl + Math.min(elev[i], -0.25) * 0.6;
        }
      } else if (ter[i] === T.RIVER) wk[i] = 3;
    }
    // Flüsse: Spiegel unter den Ufern; entlang des Laufs leicht geglättet
    for (let i = 0; i < N; i++) {
      if (wk[i] !== 3) continue;
      const x = i % W, y = (i / W) | 0;
      let lv = elev[i], adjSea = false;
      for (let k = 0; k < 8; k++) {
        const dx = [1, -1, 0, 0, 1, 1, -1, -1][k], dy = [0, 0, 1, -1, 1, -1, 1, -1][k];
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (wk[n] === 0) lv = Math.min(lv, elev[n]);
        else if (wk[n] === 1 || wk[n] === 2) { adjSea = true; lv = Math.min(lv, wlT[n] + 0.06); }
      }
      wlT[i] = Math.max(adjSea ? 0.02 : 0.06, lv - 0.1);
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < N; i++) {
        if (wk[i] !== 3) continue;
        const x = i % W, y = (i / W) | 0;
        let s = wlT[i], n = 1;
        if (x > 0 && wk[i - 1] === 3) { s += wlT[i - 1]; n++; }
        if (x < W - 1 && wk[i + 1] === 3) { s += wlT[i + 1]; n++; }
        if (y > 0 && wk[i - W] === 3) { s += wlT[i - W]; n++; }
        if (y < H - 1 && wk[i + W] === 3) { s += wlT[i + W]; n++; }
        wlT[i] = Math.min(wlT[i], s / n + 0.03);
      }
    }
    for (let i = 0; i < N; i++) if (wk[i] === 3) elev[i] = wlT[i] - 0.22;
    // Wassernähe (für Sand/Ufer)
    const near = new Uint8Array(N).fill(3);
    for (let i = 0; i < N; i++) if (wk[i]) near[i] = 0;
    for (let pass = 1; pass <= 3; pass++) {
      for (let i = 0; i < N; i++) {
        if (near[i] !== pass - 1) continue;
        const x = i % W, y = (i / W) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx; if (near[n] > pass) near[n] = pass;
        }
      }
    }
    // Vergleich mit vorher
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    const old = this.elev, oldWL = this.tileWL, oldK = this.wkind, first = this.version === 0;
    for (let i = 0; i < N; i++) {
      const owl = oldWL[i], nwl = wlT[i];
      if (first || old[i] !== elev[i] || oldK[i] !== wk[i] || !((owl === nwl) || (owl !== owl && nwl !== nwl)) || this.near[i] !== near[i]) {
        const x = i % W, y = (i / W) | 0;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    this.elev = elev; this.wkind = wk; this.tileWL = wlT; this.near = near;
    if (x1 < 0) return null;
    return { x0, y0, x1, y1 };
  };

  function chamfer(d, W, H) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1); else v = Math.min(v, 1);
      if (y > 0) v = Math.min(v, d[i - W] + 1); else v = Math.min(v, 1);
      if (x > 0 && y > 0) v = Math.min(v, d[i - W - 1] + 1.4);
      if (x < W - 1 && y > 0) v = Math.min(v, d[i - W + 1] + 1.4);
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!d[i]) continue;
      let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + 1); else v = Math.min(v, 1);
      if (y < H - 1) v = Math.min(v, d[i + W] + 1); else v = Math.min(v, 1);
      if (x < W - 1 && y < H - 1) v = Math.min(v, d[i + W + 1] + 1.4);
      if (x > 0 && y < H - 1) v = Math.min(v, d[i + W - 1] + 1.4);
      d[i] = v;
    }
  }

  // Punkthöhen im Rechteck (Kacheln, inklusive) neu
  Field.prototype.computePoints = function (r) {
    const W = this.W, H = this.H, GW = this.GW, GH = this.GH, elev = this.elev, wk = this.wkind, wlT = this.tileWL;
    const gx0 = Math.max(0, r.x0 * 2 - 3), gz0 = Math.max(0, r.y0 * 2 - 3);
    const gx1 = Math.min(GW - 1, r.x1 * 2 + 5), gz1 = Math.min(GH - 1, r.y1 * 2 + 5);
    const tw = gx1 - gx0 + 1, th = gz1 - gz0 + 1;
    const tmp = new Float32Array(tw * th);
    const te = (x, y) => elev[clamp(y, 0, H - 1) * W + clamp(x, 0, W - 1)];
    // bilinear über die Kachelmitten
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const px = gx / 2 - 0.5, pz = gz / 2 - 0.5, ix = Math.floor(px), iz = Math.floor(pz), fx = px - ix, fz = pz - iz;
      const a = te(ix, iz), b = te(ix + 1, iz), c = te(ix, iz + 1), d = te(ix + 1, iz + 1);
      tmp[(gz - gz0) * tw + (gx - gx0)] = (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
    }
    // ein Glättungsschritt (Rand des Fensters bleibt)
    const sm = new Float32Array(tmp);
    for (let z = 1; z < th - 1; z++) for (let x = 1; x < tw - 1; x++) {
      const i = z * tw + x;
      sm[i] = tmp[i] * 0.5 + (tmp[i - 1] + tmp[i + 1] + tmp[i - tw] + tmp[i + tw]) * 0.125;
    }
    const g = this.g, wl = this.wl;
    // nur das innere Fenster schreiben (ohne Fensterrand)
    const ix0 = Math.max(0, r.x0 * 2 - 2), iz0 = Math.max(0, r.y0 * 2 - 2), ix1 = Math.min(GW - 1, r.x1 * 2 + 4), iz1 = Math.min(GH - 1, r.y1 * 2 + 4);
    for (let gz = iz0; gz <= iz1; gz++) for (let gx = ix0; gx <= ix1; gx++) {
      const lx = gx - gx0, lz = gz - gz0;
      let v = (lx > 0 && lz > 0 && lx < tw - 1 && lz < th - 1) ? sm[lz * tw + lx] : tmp[lz * tw + lx];
      const px = gx / 2, pz = gz / 2;
      // Kacheln, die den Punkt berühren
      const odx = gx & 1, odz = gz & 1;
      const txa = odx ? (gx - 1) / 2 : gx / 2 - 1, txb = odx ? txa : txa + 1;
      const tza = odz ? (gz - 1) / 2 : gz / 2 - 1, tzb = odz ? tza : tza + 1;
      let nW = 0, nL = 0, nR = 0, wSum = 0, wN = 0, lvMax = -1e9, rvl = 1e9, landMin = 1e9;
      for (let tz = tza; tz <= tzb; tz++) for (let tx = txa; tx <= txb; tx++) {
        const cx = clamp(tx, 0, W - 1), cz = clamp(tz, 0, H - 1), i = cz * W + cx, k = wk[i];
        if (k === 0) { nL++; landMin = Math.min(landMin, elev[i]); }
        else { nW++; wSum += wlT[i]; wN++; if (wlT[i] > lvMax) lvMax = wlT[i]; if (k === 3) { nR++; rvl = Math.min(rvl, wlT[i]); } }
      }
      // Rauschen: Flachland sanft, Gebirge zerklüftet
      const hAmt = clamp(v / 1.6, 0, 1), mAmt = clamp((v - 2.4) / 5, 0, 1);
      let n = (fbm(px * 0.35, pz * 0.35, 4, 11) - 0.5) * (0.10 + 0.25 * hAmt);
      if (mAmt > 0) {
        const rdg = 1 - Math.abs(fbm(px * 0.22, pz * 0.22, 4, 23) * 2 - 1);
        n += (rdg * rdg - 0.35) * 2.6 * mAmt + (fbm(px * 0.9, pz * 0.9, 3, 5) - 0.5) * 0.9 * mAmt;
      }
      if (nW) n *= 0.25;
      v += n;
      if (nW && !nL) {
        // reines Wasser
        if (nR === nW) v = Math.min(v, rvl - (odx && odz ? 0.22 : 0.18));
        else v = Math.min(v, wSum / wN - 0.12);
        wl[gz * GW + gx] = wSum / wN;
      } else if (nW && nL) {
        // Ufer: Fluss knapp über dem Spiegel, Meer/See am Spiegel
        const lvl = wSum / wN;
        if (nR) v = Math.min(Math.max(v, lvl + 0.03), lvl + 0.09);
        else v = clamp(v, lvl - 0.12, lvl + 0.05);
        wl[gz * GW + gx] = lvl;
      } else {
        // reines Land: über dem Spiegel der Nachbarn halten
        let near = -1e9;
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const cx = clamp(Math.floor(px - 0.25) + dx, 0, W - 1), cz = clamp(Math.floor(pz - 0.25) + dz, 0, H - 1), j = cz * W + cx;
          if (wk[j]) near = Math.max(near, wlT[j]);
        }
        if (near > -1e8) { v = Math.max(v, near + 0.05); wl[gz * GW + gx] = near; }
        else wl[gz * GW + gx] = -1e9;
        if (v < 0.05) v = 0.05;
      }
      g[gz * GW + gx] = v;
    }
    for (let ty = Math.max(0, r.y0 - 1); ty <= Math.min(H - 1, r.y1 + 2); ty++)
      for (let tx = Math.max(0, r.x0 - 1); tx <= Math.min(W - 1, r.x1 + 2); tx++)
        this.tileY[ty * W + tx] = g[(ty * 2 + 1) * GW + tx * 2 + 1];
    this.version++;
  };

  Field.prototype.heightAt = function (x, z) {
    const GW = this.GW, GH = this.GH;
    let gx = x * 2, gz = z * 2;
    if (gx < 0) gx = 0; else if (gx > GW - 1.001) gx = GW - 1.001;
    if (gz < 0) gz = 0; else if (gz > GH - 1.001) gz = GH - 1.001;
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, g = this.g, i = iz * GW + ix;
    // gleiche Dreiecksteilung wie das Gitter (Diagonale von links oben nach rechts unten)
    const a = g[i], b = g[i + 1], c = g[i + GW], d = g[i + GW + 1];
    if (fx >= fz) return a + (b - a) * fx + (d - b) * fz;
    return a + (d - c) * fx + (c - a) * fz;
  };
  Field.prototype.waterAt = function (x, z) {
    const W = this.W, H = this.H, tx = Math.floor(x), tz = Math.floor(z);
    if (tx < 0 || tz < 0 || tx >= W || tz >= H) return 0;
    const i = tz * W + tx;
    if (!this.wkind[i]) return -1e9;
    if (this.wkind[i] === 1) return 0;
    const GW = this.GW, gx = clamp(x * 2, 0, this.GW - 1.001), gz = clamp(z * 2, 0, this.GH - 1.001);
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz, w = this.wl, j = iz * GW + ix;
    const s = (k) => (w[k] > -1e8 ? w[k] : this.tileWL[i]);
    return (s(j) * (1 - fx) + s(j + 1) * fx) * (1 - fz) + (s(j + GW) * (1 - fx) + s(j + GW + 1) * fx) * fz;
  };
  R3.Field = Field;

  // ------------------------------------------------------------------ Detailtextur (Canvas, keine Datei)
  function makeDetailTexture(size) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), img = g.createImageData(size, size), d = img.data;
    // kachelbares Rauschen: Gitter mit Periode
    function tn(x, y, p, s) {
      const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
      const m = (v) => ((v % p) + p) % p;
      const a = hash3(m(xi), m(yi), s), b = hash3(m(xi + 1), m(yi), s), cc = hash3(m(xi), m(yi + 1), s), dd = hash3(m(xi + 1), m(yi + 1), s);
      return a + (b - a) * fx + (cc - a) * fy + (a - b - cc + dd) * fx * fy;
    }
    function tf(x, y, base, oct, s) {
      let sum = 0, amp = 0.5, n = 0, p = base;
      for (let o = 0; o < oct; o++) { sum += amp * tn(x * p / size, y * p / size, p, s + o); n += amp; amp *= 0.55; p *= 2; }
      return sum / n;
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      const fine = tf(x, y, 16, 4, 1);
      const blot = tf(x, y, 4, 3, 7);
      // Fels: gestreckte Schichten + Risse
      const st = tf(x, y * 0.25, 8, 4, 13);
      const crack = Math.abs(tf(x, y, 8, 3, 19) * 2 - 1);
      const rock = clamp(st * 0.8 + Math.min(1, crack * 4) * 0.25, 0, 1);
      const sp = hash3(x, y, 99);
      d[o] = Math.round(clamp(fine, 0, 1) * 255);
      d[o + 1] = Math.round(clamp(blot, 0, 1) * 255);
      d[o + 2] = Math.round(rock * 255);
      d[o + 3] = Math.round((sp > 0.985 ? 255 : sp > 0.97 ? 140 : 0) * 1);
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    // Kanäle sind Daten, keine Farben
    t.encoding = THREE.LinearEncoding;
    t.premultiplyAlpha = false;
    return t;
  }

  // ------------------------------------------------------------------ Himmel
  // Dunstfarbe wirkt in three r128 NACH Tonemapping/Kodierung: daher als Ausgabefarbe (sRGB) angegeben,
  // der Himmel blendet am Horizont genau auf diese Farbe.
  const FOG_HEX = '#cdbfae';
  R3.FOG_HEX = FOG_HEX;
  function makeSky(sunDir) {
    const geo = new THREE.SphereGeometry(1, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSun: { value: sunDir.clone() },
        uZenith: { value: lin('#4f7fb8') },
        uHorizon: { value: lin('#e9d3b4') },
        uGround: { value: lin('#b7a998') },
        uSunCol: { value: lin('#ffd9a0') },
        uFog: { value: new THREE.Color(FOG_HEX) }
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uSun, uZenith, uHorizon, uGround, uSunCol, uFog; varying vec3 vDir;',
        '#include <common>',
        'void main(){',
        '  vec3 d = normalize(vDir); float y = d.y;',
        '  float t = pow(clamp(y, 0.0, 1.0), 0.45);',
        '  vec3 col = mix(uHorizon, uZenith, t);',
        '  col = mix(col, uGround, smoothstep(0.0, -0.25, y));',
        '  float s = max(dot(d, normalize(uSun)), 0.0);',
        '  col += uSunCol * (pow(s, 6.0) * 0.35 + pow(s, 64.0) * 0.6 + smoothstep(0.9993, 0.9997, s) * 6.0);',
        '  col += uSunCol * 0.12 * pow(1.0 - abs(y), 6.0) * (0.5 + 0.5 * s);',
        '  gl_FragColor = vec4(col, 1.0);',
        '  #include <tonemapping_fragment>',
        '  #include <encodings_fragment>',
        '  gl_FragColor.rgb = mix(gl_FragColor.rgb, uFog, smoothstep(0.16, -0.02, y) * (1.0 - 0.5 * pow(s, 8.0)));',
        '}'
      ].join('\n'),
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false
    });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -1000; m.frustumCulled = false;
    return m;
  }

  // ------------------------------------------------------------------ Instanz
  function Inst(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.qualityKey = QUALITY[opts.quality] ? opts.quality : 'mid';
    this.prOverride = opts.pixelRatio;
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.qualityKey !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserveDrawingBuffer });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;
    const scene = this.scene = new THREE.Scene();
    const camera = this.camera = new THREE.PerspectiveCamera(38, 1, 0.3, 1200);
    scene.add(camera);
    // Sonne: tief, warm, aus Nordwesten (Relief liest sich „von links oben")
    this.sunDir = new THREE.Vector3(-0.62, 0.52, -0.58).normalize();
    this.sunColor = lin('#ffd2a1');
    const sun = this.sun = new THREE.DirectionalLight(this.sunColor, 2.7);
    sun.castShadow = false;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    scene.add(sun); scene.add(sun.target);
    const hemi = this.hemi = new THREE.HemisphereLight(lin('#a9c4e8'), lin('#6b5a44'), 0.9);
    scene.add(hemi);
    this.sky = makeSky(this.sunDir);
    scene.add(this.sky);
    this.fogColor = new THREE.Color(FOG_HEX);
    scene.fog = new THREE.Fog(this.fogColor.clone(), 60, 400);
    scene.background = null;
    this.detailTex = makeDetailTexture(256);
    this.detailTex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), QUALITY[this.qualityKey].aniso);
    this.uniforms = { uTime: { value: 0 } };

    // Kamera-Zustand: aktuell (cur) und Ziel (goal)
    this.cam = { x: 0, z: 0, dist: 40, yaw: 0, tilt: 0.95 };
    this.goal = { x: 0, z: 0, dist: 40, yaw: 0, tilt: 0.95 };
    this.time = 0; this.dt = 0; this.alpha = 1;
    this.overlay = { territory: true, air: false, brush: null, selection: null };
    this.interp = null;
    this.matCache = new Map();
    this.terrainListeners = [];
    this.tileListeners = [];
    this.pendingDirty = [];
    this.inited = new Set();
    this.sim = null; this.field = null;
    this._layersChanged = true;
    this._stats = { calls: 0, tris: 0, fps: 0, ms: 0 };
    this._fpsAcc = 0; this._fpsN = 0;
    this._pollT = 0;
    this.ctx = this.makeCtx();
    (R3._instances || (R3._instances = [])).push(this);
    this.applyQuality();
    this.resize();
  }

  Inst.prototype.makeCtx = function () {
    const self = this;
    const ctx = {
      THREE, scene: this.scene, camera: this.camera, renderer: this.renderer,
      seaY: 0, quality: this.qualityKey, time: 0, dt: 0, alpha: 1,
      sunDir: this.sunDir, sunColor: this.sunColor, uniforms: this.uniforms,
      camDist: this.cam.dist, camTarget: new THREE.Vector3(),
      overlay: this.overlay,
      W: 0, H: 0, field: null,
      heightAt(x, z) { return self.field ? self.field.heightAt(x, z) : 0; },
      surfaceAt(x, z) { if (!self.field) return 0; const g = self.field.heightAt(x, z), w = self.field.waterAt(x, z); return w > g ? w : g; },
      waterLevel(tx, ty) { const f = self.field; if (!f || tx < 0 || ty < 0 || tx >= f.W || ty >= f.H) return NaN; return f.tileWL[ty * f.W + tx]; },
      tileHeight(tx, ty) { return self.field ? self.field.heightAt(tx + 0.5, ty + 0.5) : 0; },
      flatHeight(tx, ty, w, h) {
        if (!self.field) return 0;
        w = w || 1; h = h || 1; let m = -1e9;
        for (let z = 0; z <= h * 2; z++) for (let x = 0; x <= w * 2; x++) {
          const y = self.field.heightAt(tx + x / 2, ty + z / 2); if (y > m) m = y;
        }
        return m;
      },
      teamColor(ci) { return self.teamCols(ci).main; },
      teamColors(ci) { return self.teamCols(ci); },
      rand(tx, ty, salt) { return hash3(tx, ty, (salt | 0) + 1013); },
      unitPos(u, out) {
        out = out || { x: 0, y: 0 };
        if (self.interp) { self.interp(u, self.alpha, out); return out; }
        out.x = u.x; out.y = u.y; return out;
      },
      visibleRect() { return self.visibleRect(); },
      mat(key, opts) { return self.mat(key, opts); },
      tex(key) { return key === 'detail' ? self.detailTex : null; },
      onTerrainChanged(fn) { self.terrainListeners.push(fn); return () => { const i = self.terrainListeners.indexOf(fn); if (i >= 0) self.terrainListeners.splice(i, 1); }; },
      onTilesChanged(fn) { self.tileListeners.push(fn); return () => { const i = self.tileListeners.indexOf(fn); if (i >= 0) self.tileListeners.splice(i, 1); }; },
      addShadowCaster(mesh) { mesh.traverse ? mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }) : (mesh.castShadow = true); return mesh; },
      noShadow(mesh) { mesh.traverse ? mesh.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }) : (mesh.castShadow = false); return mesh; }
    };
    Object.defineProperty(ctx, 'sim', { get() { return self.sim; }, enumerable: true });
    Object.defineProperty(ctx, 'state', { get() { return self.sim ? self.sim.state : null; }, enumerable: true });
    return ctx;
  };

  Inst.prototype.teamCols = function (ci) {
    const k = ((ci | 0) % 12 + 12) % 12;
    this._team = this._team || [];
    if (!this._team[k]) { const h = teamHex(k); this._team[k] = { main: lin(h[0]), dark: lin(h[1]), light: lin(h[2]) }; }
    return this._team[k];
  };

  const MAT_BASE = {
    stone:   { color: '#9a958a', roughness: 0.92 },
    wood:    { color: '#7a5634', roughness: 0.85 },
    plaster: { color: '#e4dac4', roughness: 0.9 },
    roof:    { color: '#9c4a32', roughness: 0.8 },
    thatch:  { color: '#b8995a', roughness: 1.0 },
    straw:   { color: '#d6bd6e', roughness: 1.0 },
    metal:   { color: '#8f949a', roughness: 0.4, metalness: 0.7 },
    gold:    { color: '#d9a83c', roughness: 0.35, metalness: 0.9 },
    cloth:   { color: '#c9b9a0', roughness: 0.95 },
    leaf:    { color: '#4f7a33', roughness: 0.9 },
    dirt:    { color: '#7d6448', roughness: 1.0 },
    water:   { color: '#3d6f8f', roughness: 0.15, metalness: 0.1 },
    glow:    { color: '#ffb347', roughness: 1.0, emissive: '#ff8a30', emissiveIntensity: 1.5 },
    plain:   { color: '#ffffff', roughness: 0.85 }
  };
  Inst.prototype.mat = function (key, opts) {
    opts = opts || {};
    const id = key + '|' + JSON.stringify(opts, (k, v) => (v && v.isColor ? 'c' + v.getHexString() + (v.r.toFixed(4)) : v));
    let m = this.matCache.get(id);
    if (m) return m;
    const base = MAT_BASE[key] || MAT_BASE.plain;
    const p = {};
    const col = opts.color != null ? opts.color : base.color;
    p.color = col && col.isColor ? col.clone() : lin(col);
    p.roughness = opts.roughness != null ? opts.roughness : base.roughness;
    p.metalness = opts.metalness != null ? opts.metalness : (base.metalness || 0);
    const em = opts.emissive != null ? opts.emissive : base.emissive;
    if (em) { p.emissive = em.isColor ? em.clone() : lin(em); p.emissiveIntensity = opts.emissiveIntensity != null ? opts.emissiveIntensity : (base.emissiveIntensity || 1); }
    if (opts.vertexColors) p.vertexColors = true;
    if (opts.flatShading) p.flatShading = true;
    if (opts.side != null) p.side = opts.side;
    if (opts.transparent) { p.transparent = true; p.opacity = opts.opacity != null ? opts.opacity : 1; }
    if (opts.depthWrite != null) p.depthWrite = opts.depthWrite;
    m = new THREE.MeshStandardMaterial(p);
    this.matCache.set(id, m);
    return m;
  };

  Inst.prototype.applyQuality = function () {
    const q = QUALITY[this.qualityKey];
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.renderer.setPixelRatio(this.prOverride || Math.min(dpr, q.pr));
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.ctx.quality = this.qualityKey;
    this.ctx.density = q.density;
    // Materialien müssen neu übersetzt werden (Schatten an/aus)
    this.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
  };
  Inst.prototype.setQuality = function (q) {
    if (!QUALITY[q] || q === this.qualityKey) return;
    this.qualityKey = q;
    this.applyQuality();
    if (this.sim) for (const L of LAYERS) if (this.inited.has(L) && L.onQuality) { try { L.onQuality(this.ctx); } catch (e) { console.error('R3', L.name, e); } }
    this.resize();
  };

  Inst.prototype.resize = function () {
    const c = this.canvas;
    const w = Math.max(1, c.clientWidth || c.width || 1), h = Math.max(1, c.clientHeight || c.height || 1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vw = w; this.vh = h;
  };

  // ------------------------------------------------------------------ Welt
  Inst.prototype.attach = function (sim) {
    const first = !this.sim;
    this.sim = sim;
    const st = sim.state;
    this.field = new Field(st.W, st.H);
    const r = this.field.computeTiles(st);
    this.field.computePoints(r || { x0: 0, y0: 0, x1: st.W - 1, y1: st.H - 1 });
    this.snapT = new Uint8Array(st.terrain); this.snapH = st.height ? new Uint8Array(st.height) : null;
    this.ctx.field = this.field; this.ctx.W = st.W; this.ctx.H = st.H;
    this.pendingDirty.length = 0;
    // Kamera auf die Mitte, ganze Karte grob im Blick
    const d = Math.max(st.W, st.H) * 0.55;
    this.focus(st.W / 2, st.H / 2, { dist: Math.min(d, this.maxDist()), instant: true });
    this.ensurePlaceholder();
    for (const L of LAYERS) {
      try {
        if (!this.inited.has(L)) { if (L.init) L.init(this.ctx); this.inited.add(L); }
        else if (L.onWorld) L.onWorld(this.ctx);
        else { if (L.dispose) L.dispose(this.ctx); if (L.init) L.init(this.ctx); }
      } catch (e) { console.error('R3 Ebene', L.name, e); }
    }
    this._layersChanged = false;
    return first;
  };

  // Platzhalter-Boden, solange keine Ebene 'terrain' angemeldet ist
  Inst.prototype.ensurePlaceholder = function () {
    const hasTerrain = LAYERS.some(L => L.name === 'terrain');
    if (this.placeholder) { this.scene.remove(this.placeholder); this.placeholder.geometry.dispose(); this.placeholder.material.dispose(); this.placeholder = null; }
    if (hasTerrain || !this.field) return;
    const f = this.field, st = this.sim.state, GW = f.GW, GH = f.GH;
    const step = Math.max(1, Math.ceil(Math.max(GW, GH) / 400));
    const nx = Math.floor((GW - 1) / step) + 1, nz = Math.floor((GH - 1) / step) + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), c = new THREE.Color();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const gx = i * step, gz = j * step, k = (j * nx + i) * 3;
      pos[k] = gx / 2; pos[k + 2] = gz / 2; pos[k + 1] = Math.max(f.g[gz * GW + gx], f.wl[gz * GW + gx] > -1e8 ? f.wl[gz * GW + gx] : -9);
      const tx = clamp(Math.floor(gx / 2), 0, f.W - 1), tz = clamp(Math.floor(gz / 2), 0, f.H - 1);
      c.set(WW.TERRAIN[st.terrain[tz * f.W + tx]].color).convertSRGBToLinear();
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = this.placeholder = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    m.receiveShadow = true; m.castShadow = true;
    this.scene.add(m);
  };

  Inst.prototype.markDirty = function (list) {
    if (!list || !list.length) return;
    for (let i = 0; i < list.length; i++) this.pendingDirty.push(list[i]);
  };

  // Gelände- und Höhenänderungen erkennen, Feld nachführen, Ebenen benachrichtigen
  Inst.prototype.processDirty = function () {
    const st = this.sim.state, N = st.W * st.H;
    this._pollT -= this.dt;
    const dirty = this.pendingDirty;
    let terrainHit = false;
    if (dirty.length) {
      const arr = new Int32Array(dirty); dirty.length = 0;
      for (let k = 0; k < arr.length; k++) {
        const i = arr[k]; if (i < 0 || i >= N) continue;
        if (st.terrain[i] !== this.snapT[i] || (this.snapH && st.height[i] !== this.snapH[i])) { terrainHit = true; break; }
      }
      for (const fn of this.tileListeners) { try { fn(arr); } catch (e) { console.error(e); } }
    }
    // Sicherheitsnetz: regelmäßig vollständig vergleichen (Kräfte, die keine Marke setzen)
    if (!terrainHit && this._pollT <= 0) {
      this._pollT = 1.0;
      const t = st.terrain, h = st.height, sT = this.snapT, sH = this.snapH;
      for (let i = 0; i < N; i++) if (t[i] !== sT[i] || (sH && h[i] !== sH[i])) { terrainHit = true; break; }
    }
    if (!terrainHit) return;
    this.snapT.set(st.terrain); if (this.snapH && st.height) this.snapH.set(st.height);
    const r = this.field.computeTiles(st);
    if (!r) return;
    this.field.computePoints(r);
    const rect = { x0: Math.max(0, r.x0 - 3), y0: Math.max(0, r.y0 - 3), x1: Math.min(st.W - 1, r.x1 + 3), y1: Math.min(st.H - 1, r.y1 + 3) };
    if (this.placeholder) this.ensurePlaceholder();
    for (const fn of this.terrainListeners) { try { fn(rect); } catch (e) { console.error(e); } }
  };

  // ------------------------------------------------------------------ Kamera
  Inst.prototype.maxDist = function () { return this.field ? Math.max(30, Math.max(this.field.W, this.field.H) * 0.95) : 200; };
  Inst.prototype.clampGoal = function () {
    const g = this.goal, f = this.field;
    g.dist = clamp(g.dist, 4.5, this.maxDist());
    g.tilt = clamp(g.tilt, 0.52, 1.45);
    if (f) { g.x = clamp(g.x, 0, f.W); g.z = clamp(g.z, 0, f.H); }
  };
  Inst.prototype.camPos = function (c, out) {
    const ty = this.field ? Math.max(0, this.field.heightAt(c.x, c.z)) : 0;
    const hor = Math.cos(c.tilt) * c.dist, up = Math.sin(c.tilt) * c.dist;
    out.set(c.x + Math.sin(c.yaw) * hor, ty + up, c.z + Math.cos(c.yaw) * hor);
    return ty;
  };
  Inst.prototype.updateCamera = function (dt) {
    const c = this.cam, g = this.goal;
    const k = 1 - Math.exp(-dt * 9), kr = 1 - Math.exp(-dt * 10);
    c.x += (g.x - c.x) * k; c.z += (g.z - c.z) * k;
    c.dist *= Math.pow(g.dist / c.dist, k);
    c.yaw += (g.yaw - c.yaw) * kr; c.tilt += (g.tilt - c.tilt) * kr;
    // Ziel-Höhe weich nachführen (keine Sprünge über Bergen)
    const p = this.camera.position;
    const groundY = this.field ? Math.max(0, this.field.heightAt(c.x, c.z)) : 0;
    this._ty = this._ty == null ? groundY : this._ty + (groundY - this._ty) * (1 - Math.exp(-dt * 4));
    const hor = Math.cos(c.tilt) * c.dist, up = Math.sin(c.tilt) * c.dist;
    p.set(c.x + Math.sin(c.yaw) * hor, this._ty + up, c.z + Math.cos(c.yaw) * hor);
    // nicht unter das Gelände
    if (this.field) {
      const fx = clamp(p.x, 0, this.field.W), fz = clamp(p.z, 0, this.field.H);
      const gy = Math.max(this.field.heightAt(fx, fz), 0) + 1.2;
      if (p.y < gy) p.y = gy;
    }
    this.camera.lookAt(c.x, this._ty, c.z);
    this.camera.updateMatrixWorld();
    this.ctx.camDist = c.dist;
    this.ctx.camTarget.set(c.x, this._ty, c.z);
    // Dunst: wächst mit dem Abstand
    const fog = this.scene.fog;
    fog.near = c.dist * 1.1 + 10;
    fog.far = c.dist * 4.2 + 90;
    this.camera.far = Math.max(400, fog.far * 1.6);
    this.camera.near = clamp(c.dist * 0.02, 0.2, 3);
    this.camera.updateProjectionMatrix();
    this.sky.position.copy(p);
    this.sky.scale.setScalar(this.camera.far * 0.9);
    // Sonne: Schattenkamera folgt dem Blickpunkt, nur Nahbereich
    const s = this.sun, q = QUALITY[this.qualityKey];
    const span = clamp(c.dist * 0.9, 10, 70);
    if (q.shadows) {
      const sc = s.shadow.camera;
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
      sc.near = 1; sc.far = 160; sc.updateProjectionMatrix();
      // auf Texel einrasten gegen Flimmern
      const texel = (2 * span) / (q.shadowSize || 1024);
      const tx = Math.round(c.x / texel) * texel, tz = Math.round(c.z / texel) * texel;
      s.target.position.set(tx, this._ty, tz);
      s.position.set(tx + this.sunDir.x * 80, this._ty + this.sunDir.y * 80, tz + this.sunDir.z * 80);
      s.shadow.bias = -0.0004 - span * 0.00002;
    } else {
      s.target.position.set(c.x, 0, c.z);
      s.position.set(c.x + this.sunDir.x * 80, this.sunDir.y * 80, c.z + this.sunDir.z * 80);
    }
    s.target.updateMatrixWorld();
  };

  Inst.prototype.focus = function (x, y, o) {
    o = o || {};
    const g = this.goal;
    g.x = x; g.z = y;
    if (o.dist != null) g.dist = o.dist;
    if (o.yaw != null) g.yaw = o.yaw;
    if (o.tilt != null) g.tilt = o.tilt;
    this.clampGoal();
    if (o.instant) { Object.assign(this.cam, g); this._ty = null; }
  };
  Inst.prototype.pan = function (dx, dy) {
    const c = this.goal;
    const wpp = (2 * this.cam.dist * Math.tan(this.camera.fov * Math.PI / 360)) / Math.max(1, this.vh);
    const sy = Math.sin(c.yaw), cy = Math.cos(c.yaw);
    // rechts = (cos, -sin), vorne (weg von der Kamera) = (-sin, -cos)
    const fwdScale = 1 / Math.max(0.35, Math.sin(this.cam.tilt));
    const mx = -dx * wpp, my = dy * wpp * fwdScale;
    c.x += mx * cy + my * -sy; c.z += mx * -sy + my * -cy;
    this.clampGoal();
    this.cam.x = c.x; this.cam.z = c.z;
  };
  Inst.prototype.zoomAt = function (factor, clientX, clientY) {
    if (!(factor > 0)) return;
    const g = this.goal, old = g.dist;
    g.dist = clamp(g.dist / factor, 4.5, this.maxDist());
    if (clientX != null && this.field) {
      const hit = this.tileAt(clientX, clientY);
      if (hit) {
        const f = 1 - g.dist / old;
        g.x += (hit.fx - g.x) * f; g.z += (hit.fy - g.z) * f;
      }
    }
    this.clampGoal();
  };
  Inst.prototype.orbit = function (dYaw, dTilt) {
    this.goal.yaw += dYaw || 0; this.goal.tilt += dTilt || 0; this.clampGoal();
  };
  Inst.prototype.cameraInfo = function () {
    const c = this.cam;
    return { x: c.x, y: c.z, dist: c.dist, yaw: c.yaw, tilt: c.tilt };
  };

  // Strahl durch den Bildpunkt (CSS-Pixel relativ zur Canvas)
  const _v = new THREE.Vector3(), _d = new THREE.Vector3();
  Inst.prototype.rayAt = function (lx, ly, outO, outD) {
    const nx = (lx / this.vw) * 2 - 1, ny = -(ly / this.vh) * 2 + 1;
    outO.copy(this.camera.position);
    outD.set(nx, ny, 0.5).unproject(this.camera).sub(outO).normalize();
  };
  Inst.prototype.tileAt = function (clientX, clientY) {
    if (!this.field) return null;
    const rc = this.canvas.getBoundingClientRect();
    const hit = this.pick(clientX - rc.left, clientY - rc.top);
    if (!hit) return null;
    const x = Math.floor(hit.x), y = Math.floor(hit.z);
    if (x < 0 || y < 0 || x >= this.field.W || y >= this.field.H) return null;
    return { x, y, fx: hit.x, fy: hit.z };
  };
  Inst.prototype.pick = function (lx, ly) {
    const f = this.field; if (!f) return null;
    this.rayAt(lx, ly, _v, _d);
    if (_d.y >= -1e-4) return null;
    // vom Kameraort bis zur Ebene y = -1 schreiten, Gelände bzw. Wasseroberfläche treffen
    const top = 13;
    let t0 = _v.y > top ? (_v.y - top) / -_d.y : 0;
    const tEnd = (_v.y + 5) / -_d.y;
    const step = 0.2;
    const surf = (x, z) => { const g = f.heightAt(x, z), w = f.waterAt(x, z); return w > g ? w : g; };
    let prevT = t0;
    for (let t = t0; t < tEnd; t += step) {
      const x = _v.x + _d.x * t, y = _v.y + _d.y * t, z = _v.z + _d.z * t;
      if (x < -2 || z < -2 || x > f.W + 2 || z > f.H + 2) { if ((_d.x > 0 && x > f.W + 2) || (_d.x < 0 && x < -2) || (_d.z > 0 && z > f.H + 2) || (_d.z < 0 && z < -2)) break; prevT = t; continue; }
      if (y <= surf(x, z)) {
        let a = prevT, b = t;
        for (let i = 0; i < 10; i++) {
          const m = (a + b) / 2, mx = _v.x + _d.x * m, mz = _v.z + _d.z * m;
          if (_v.y + _d.y * m <= surf(mx, mz)) b = m; else a = m;
        }
        return { x: _v.x + _d.x * b, y: _v.y + _d.y * b, z: _v.z + _d.z * b };
      }
      prevT = t;
    }
    // Ersatz: Meeresspiegel
    const tp = -_v.y / _d.y;
    return { x: _v.x + _d.x * tp, y: 0, z: _v.z + _d.z * tp };
  };
  Inst.prototype.project = function (x, y, lift) {
    const gy = this.field ? this.ctx.surfaceAt(x, y) : 0;
    _v.set(x, gy + (lift || 0), y);
    const camSpace = _v.clone().applyMatrix4(this.camera.matrixWorldInverse);
    _v.project(this.camera);
    const sx = (_v.x + 1) / 2 * this.vw, sy = (1 - _v.y) / 2 * this.vh;
    const visible = camSpace.z < 0 && _v.x >= -1.05 && _v.x <= 1.05 && _v.y >= -1.05 && _v.y <= 1.05;
    return { sx, sy, visible };
  };
  Inst.prototype.groundPoint = function (lx, ly, planeY) {
    this.rayAt(lx, ly, _v, _d);
    let t;
    if (_d.y < -0.02) t = (planeY - _v.y) / _d.y; else t = 1e9;
    const maxT = this.camera.far * 0.6;
    if (!(t > 0) || t > maxT) {
      // über dem Horizont: in Blickrichtung weit draußen
      const hx = _d.x, hz = _d.z, l = Math.hypot(hx, hz) || 1;
      const far = Math.max(this.cam.dist * 4, 60);
      return { x: this.cam.x + hx / l * far, y: this.cam.z + hz / l * far };
    }
    return { x: _v.x + _d.x * t, y: _v.z + _d.z * t };
  };
  Inst.prototype.viewQuad = function () {
    const py = this._ty || 0, w = this.vw, h = this.vh;
    return [this.groundPoint(0, 0, py), this.groundPoint(w, 0, py), this.groundPoint(w, h, py), this.groundPoint(0, h, py)];
  };
  Inst.prototype.visibleRect = function () {
    if (this._vrT === this.frameNo && this._vr) return this._vr;
    const f = this.field; if (!f) return { x0: 0, y0: 0, x1: 0, y1: 0 };
    const q = this.viewQuad().concat(this.viewQuadAt(12));
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of q) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const m = 4;
    this._vr = { x0: clamp(Math.floor(x0) - m, 0, f.W - 1), y0: clamp(Math.floor(y0) - m, 0, f.H - 1), x1: clamp(Math.ceil(x1) + m, 0, f.W - 1), y1: clamp(Math.ceil(y1) + m, 0, f.H - 1) };
    this._vrT = this.frameNo;
    return this._vr;
  };
  Inst.prototype.viewQuadAt = function (py) {
    const w = this.vw, h = this.vh;
    return [this.groundPoint(0, 0, py), this.groundPoint(w, 0, py), this.groundPoint(w, h, py), this.groundPoint(0, h, py)];
  };

  Inst.prototype.setInterpolator = function (fn) { this.interp = typeof fn === 'function' ? fn : null; };
  Inst.prototype.setOverlay = function (o) {
    if (!o) return;
    for (const k in o) this.overlay[k] = o[k];
    this.ctx.overlay = this.overlay;
  };

  // ------------------------------------------------------------------ Bild
  Inst.prototype.frame = function (alpha, dtReal) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    const dt = clamp(dtReal == null ? 1 / 60 : dtReal, 0, 0.25);
    this.dt = dt; this.time += dt; this.alpha = alpha == null ? 1 : alpha;
    this.frameNo = (this.frameNo || 0) + 1;
    const ctx = this.ctx;
    ctx.time = this.time; ctx.dt = dt; ctx.alpha = this.alpha;
    this.uniforms.uTime.value = this.time;
    if (this.sim) {
      if (this._layersChanged) {
        this._layersChanged = false;
        for (const L of LAYERS) if (!this.inited.has(L)) { try { if (L.init) L.init(ctx); } catch (e) { console.error('R3 Ebene', L.name, e); } this.inited.add(L); }
        if (this.placeholder || !LAYERS.some(L => L.name === 'terrain')) this.ensurePlaceholder();
      }
      this.processDirty();
    }
    this.updateCamera(dt);
    if (this.sim) for (const L of LAYERS) {
      if (!this.inited.has(L) || !L.sync) continue;
      try { L.sync(ctx, this.alpha); } catch (e) { if (!L._err) { L._err = 1; console.error('R3 Ebene', L.name, e); } }
    }
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    const inf = this.renderer.info.render;
    this._stats.calls = inf.calls; this._stats.tris = inf.triangles;
    const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
    this._fpsAcc += dt; this._fpsN++; this._msAcc = (this._msAcc || 0) + ms;
    if (this._fpsAcc >= 0.5) { this._stats.fps = this._fpsN / this._fpsAcc; this._stats.ms = this._msAcc / this._fpsN; this._fpsAcc = 0; this._fpsN = 0; this._msAcc = 0; }
  };
  Inst.prototype.stats = function () { return Object.assign({}, this._stats); };

  Inst.prototype.dispose = function () {
    for (const L of LAYERS) if (this.inited.has(L) && L.dispose) { try { L.dispose(this.ctx); } catch (e) { console.error(e); } }
    this.inited.clear();
    if (this.placeholder) { this.placeholder.geometry.dispose(); this.placeholder.material.dispose(); }
    this.sky.geometry.dispose(); this.sky.material.dispose();
    this.detailTex.dispose();
    for (const m of this.matCache.values()) m.dispose();
    this.matCache.clear();
    if (this.sun.shadow.map) this.sun.shadow.map.dispose();
    this.renderer.dispose();
    const i = R3._instances.indexOf(this); if (i >= 0) R3._instances.splice(i, 1);
    this.sim = null; this.field = null;
  };

  R3.create = function (canvas, opts) {
    const inst = new Inst(canvas, opts);
    return {
      attach: (sim) => inst.attach(sim),
      frame: (a, dt) => inst.frame(a, dt),
      resize: () => inst.resize(),
      markDirty: (l) => inst.markDirty(l),
      setQuality: (q) => inst.setQuality(q),
      tileAt: (x, y) => inst.tileAt(x, y),
      project: (x, y, l) => inst.project(x, y, l),
      focus: (x, y, o) => inst.focus(x, y, o),
      pan: (dx, dy) => inst.pan(dx, dy),
      zoomAt: (f, x, y) => inst.zoomAt(f, x, y),
      orbit: (a, b) => inst.orbit(a, b),
      cameraInfo: () => inst.cameraInfo(),
      viewQuad: () => inst.viewQuad(),
      setInterpolator: (fn) => inst.setInterpolator(fn),
      setOverlay: (o) => inst.setOverlay(o),
      stats: () => inst.stats(),
      dispose: () => inst.dispose(),
      get quality() { return inst.qualityKey; },
      get ctx() { return inst.ctx; },
      _inst: inst
    };
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
