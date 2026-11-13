// =============================================================================
// Wuselwelt 3D – Bauwerke, Teil 1: Baukasten (3D-B). Lädt nach js/render3d/core.js, vor structs-build.js.
// Ein Builder setzt Modelle aus Grundkörpern zusammen (Quader, Zylinder, Kegel, Kuppel, Dächer, Profile)
// und sammelt sie je Materialgruppe in flachen Listen (Position, Normale, Farbe). finish() macht daraus ein
// „Proto" (Float32Arrays je Gruppe), das die Ebene beliebig oft verschoben/gedreht in Blöcke zusammenführt.
// Farben stecken in den Ecken (Vertexfarben, inkl. Reichsfarbe), die Materialien sind wenige gemeinsame
// (Putz, Stein, Holz, Dach, Metall, Glas, Stoff, Glut) mit im Code gemalten Graustufen-Texturen.
// =============================================================================
(function (WW) { 'use strict';

  const R3 = WW.R3 = WW.R3 || {};
  const K = R3.SKit = R3.SKit || {};

  // Materialgruppen (Reihenfolge = Zeichenreihenfolge im Block)
  K.MATS = ['plaster', 'stone', 'wood', 'roof', 'metal', 'glass', 'cloth', 'glow'];
  // Texturmaßstab (UV je Welteinheit)
  const UVS = { plaster: 0.55, stone: 1.15, wood: 1.3, roof: 1.25, metal: 1, glass: 1, cloth: 1, glow: 1 };

  // ---------------------------------------------------------------------------
  // Farben: Hex -> [r, g, b] (0..1), optional in linear umgerechnet (wenn der Kern sRGB ausgibt)
  // ---------------------------------------------------------------------------
  K.linear = false;
  const cache = new Map();
  function rgb(h) {
    if (Array.isArray(h)) return h;
    let c = cache.get(h);
    if (c) return c;
    const n = typeof h === 'number' ? h : parseInt(String(h).replace('#', ''), 16);
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    cache.set(h, c);
    return c;
  }
  K.rgb = rgb;
  K.mix = function (a, b, t) { a = rgb(a); b = rgb(b); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  K.mul = function (a, f) { a = rgb(a); return [a[0] * f, a[1] * f, a[2] * f]; };
  // gedämpfte Reichsfarbe für Dächer und Putz (Pixel-Farben sind sehr gesättigt)
  K.tame = function (a, t) { a = rgb(a); const g = (a[0] + a[1] + a[2]) / 3; t = t == null ? 0.28 : t; return [a[0] + (g - a[0]) * t, a[1] + (g - a[1]) * t, a[2] + (g - a[2]) * t]; };

  function hash(n) { n = Math.imul(n ^ 0x27d4eb2d, 0x165667b1); n ^= n >>> 15; n = Math.imul(n, 0x85ebca6b); n ^= n >>> 13; return (n >>> 0) / 4294967296; }
  K.hash = hash;
  K.h2 = function (a, b) { return hash(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663)); };

  // ---------------------------------------------------------------------------
  // Builder
  // ---------------------------------------------------------------------------
  function Builder(seed) {
    this.G = {};
    for (const m of K.MATS) this.G[m] = { p: [], n: [], c: [] };
    this.M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    this.S = [];
    this.mt = 'plaster';
    this.col = [1, 1, 1];
    this.jit = 0.05;
    this.k = (seed | 0) * 7919 + 1;
    this.meta = { stacks: [], top: 0, glow: [] };
  }
  K.Builder = Builder;
  const BP = Builder.prototype;

  BP.mat = function (m, col) { this.mt = m; if (col != null) this.col = rgb(col); return this; };
  BP.c = function (col) { this.col = rgb(col); return this; };
  BP.push = function () { this.S.push(this.M.slice()); return this; };
  BP.pop = function () { this.M = this.S.pop(); return this; };
  BP.tr = function (x, y, z) {
    const m = this.M;
    m[3] += m[0] * x + m[1] * y + m[2] * z; m[7] += m[4] * x + m[5] * y + m[6] * z; m[11] += m[8] * x + m[9] * y + m[10] * z;
    return this;
  };
  BP.rotY = function (a) {
    const c = Math.cos(a), s = Math.sin(a), m = this.M;
    for (let r = 0; r < 12; r += 4) { const a0 = m[r], a2 = m[r + 2]; m[r] = a0 * c - a2 * s; m[r + 2] = a0 * s + a2 * c; }
    return this;
  };
  BP.rotX = function (a) {
    const c = Math.cos(a), s = Math.sin(a), m = this.M;
    for (let r = 0; r < 12; r += 4) { const a1 = m[r + 1], a2 = m[r + 2]; m[r + 1] = a1 * c + a2 * s; m[r + 2] = -a1 * s + a2 * c; }
    return this;
  };
  BP.rotZ = function (a) {
    const c = Math.cos(a), s = Math.sin(a), m = this.M;
    for (let r = 0; r < 12; r += 4) { const a0 = m[r], a1 = m[r + 1]; m[r] = a0 * c + a1 * s; m[r + 1] = -a0 * s + a1 * c; }
    return this;
  };
  BP.scale = function (x, y, z) {
    const m = this.M;
    if (y == null) { y = x; z = x; }
    for (let r = 0; r < 12; r += 4) { m[r] *= x; m[r + 1] *= y; m[r + 2] *= z; }
    return this;
  };
  // Seite k (0 = +z/Süden vorn, 1 = +x, 2 = −z, 3 = −x): danach liegt die Seite bei +z
  BP.side = function (k) { return this.rotY(k * Math.PI / 2); };

  // ---- Ecken ausgeben
  BP._v = function (g, x, y, z) {
    const m = this.M;
    g.p.push(m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]);
  };
  BP._nrm = function (g, x, y, z) {
    // Kofaktormatrix (∝ inverse Transponierte) – richtig auch bei ungleichmäßiger Skalierung
    const m = this.M;
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], gg = m[8], h = m[9], i = m[10];
    let nx = (e * i - f * h) * x + (f * gg - d * i) * y + (d * h - e * gg) * z;
    let ny = (c * h - b * i) * x + (a * i - c * gg) * y + (b * gg - a * h) * z;
    let nz = (b * f - c * e) * x + (c * d - a * f) * y + (a * e - b * d) * z;
    const l = Math.hypot(nx, ny, nz) || 1;
    g.n.push(nx / l, ny / l, nz / l);
  };
  BP._col = function (g, n, f) {
    const c = this.col;
    for (let i = 0; i < n; i++) g.c.push(c[0] * f, c[1] * f, c[2] * f);
  };
  BP._jf = function () { this.k++; return 1 + (hash(this.k) - 0.5) * 2 * this.jit; };
  // flaches Dreieck (Normale aus den transformierten Ecken)
  BP.tri = function (a, b, c) {
    const g = this.G[this.mt], s = g.p.length;
    this._v(g, a[0], a[1], a[2]); this._v(g, b[0], b[1], b[2]); this._v(g, c[0], c[1], c[2]);
    const P = g.p;
    const ux = P[s + 3] - P[s], uy = P[s + 4] - P[s + 1], uz = P[s + 5] - P[s + 2];
    const vx = P[s + 6] - P[s], vy = P[s + 7] - P[s + 1], vz = P[s + 8] - P[s + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    g.n.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this._col(g, 3, this._jf());
    return this;
  };
  BP.quad = function (a, b, c, d) {
    const f = this._jf(), j = this.jit; this.jit = 0;
    const g = this.G[this.mt], n0 = g.c.length;
    this.tri(a, b, c); this.tri(a, c, d);
    // beide Dreiecke gleich getönt
    const cc = this.col; for (let i = n0; i < g.c.length; i += 3) { g.c[i] = cc[0] * f; g.c[i + 1] = cc[1] * f; g.c[i + 2] = cc[2] * f; }
    this.jit = j;
    return this;
  };
  // Dreieck mit lokalen Normalen (glatt)
  BP.triN = function (a, b, c, na, nb, nc) {
    const g = this.G[this.mt];
    this._v(g, a[0], a[1], a[2]); this._v(g, b[0], b[1], b[2]); this._v(g, c[0], c[1], c[2]);
    this._nrm(g, na[0], na[1], na[2]); this._nrm(g, nb[0], nb[1], nb[2]); this._nrm(g, nc[0], nc[1], nc[2]);
    this._col(g, 3, 1);
    return this;
  };

  // ---- Quader: x0..x1, y0..y1, z0..z1; skip: Bitmaske 1 unten, 2 oben, 4 +z, 8 −z, 16 +x, 32 −x
  BP.box = function (x0, y0, z0, x1, y1, z1, skip) {
    skip = skip | 0;
    if (!(skip & 2)) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
    if (!(skip & 1)) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (!(skip & 4)) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
    if (!(skip & 8)) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]);
    if (!(skip & 16)) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    if (!(skip & 32)) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
    return this;
  };
  // Quader mittig in x/z, von y0 nach oben
  BP.blk = function (cx, y0, cz, sx, sy, sz, skip) {
    return this.box(cx - sx / 2, y0, cz - sz / 2, cx + sx / 2, y0 + sy, cz + sz / 2, skip == null ? 1 : skip);
  };

  // ---- Kegelstumpf / Zylinder / Kegel (glatt), Achse y
  BP.cyl = function (cx, y0, cz, r0, r1, h, seg, opt) {
    seg = seg || 8; opt = opt || {};
    const a0 = opt.a0 || 0, sl = (r0 - r1) / h, nl = Math.hypot(1, sl);
    for (let i = 0; i < seg; i++) {
      const a = a0 + i / seg * Math.PI * 2, b = a0 + (i + 1) / seg * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
      const na = [ca / nl, sl / nl, sa / nl], nb = [cb / nl, sl / nl, sb / nl];
      const p0 = [cx + ca * r0, y0, cz + sa * r0], p1 = [cx + cb * r0, y0, cz + sb * r0];
      const p2 = [cx + cb * r1, y0 + h, cz + sb * r1], p3 = [cx + ca * r1, y0 + h, cz + sa * r1];
      if (opt.flat) { this.quad(p1, p0, p3, p2); }
      else {
        this.triN(p1, p0, p3, nb, na, na);
        if (r1 > 1e-4) this.triN(p1, p3, p2, nb, na, nb);
      }
      if (opt.top !== false && r1 > 1e-4) this.tri([cx, y0 + h, cz], p2, p3);
      if (opt.bottom) this.tri([cx, y0, cz], p0, p1);
    }
    return this;
  };
  BP.cone = function (cx, y0, cz, r, h, seg, opt) { return this.cyl(cx, y0, cz, r, 0, h, seg, opt); };
  // waagerechter Zylinder entlang x (Stamm, Fass liegend, Rohr)
  BP.cylX = function (x0, x1, cy, cz, r, seg, opt) {
    this.push().tr(x0, cy, cz).rotZ(-Math.PI / 2);
    this.cyl(0, 0, 0, r, (opt && opt.r1 != null) ? opt.r1 : r, x1 - x0, seg, Object.assign({ bottom: true }, opt || {}));
    return this.pop();
  };
  BP.cylZ = function (z0, z1, cx, cy, r, seg, opt) {
    this.push().tr(cx, cy, z0).rotX(Math.PI / 2);
    this.cyl(0, 0, 0, r, (opt && opt.r1 != null) ? opt.r1 : r, z1 - z0, seg, Object.assign({ bottom: true }, opt || {}));
    return this.pop();
  };
  // Stab zwischen zwei Punkten (Querschnitt quadratisch, Kantenlänge t)
  BP.beam = function (a, b, t, seg) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz);
    if (L < 1e-5) return this;
    this.push().tr(a[0], a[1], a[2]);
    const yaw = Math.atan2(dx, dz), pitch = Math.acos(Math.max(-1, Math.min(1, dy / L)));
    this.rotY(yaw).rotX(pitch);
    if (seg) this.cyl(0, 0, 0, t / 2, t / 2, L, seg, { top: true, bottom: false });
    else this.box(-t / 2, 0, -t / 2, t / 2, L, t / 2, 0);
    return this.pop();
  };

  // ---- Kuppel (Halbkugel, in y gestreckt), glatt
  BP.dome = function (cx, y0, cz, r, hy, seg, rings, opt) {
    seg = seg || 10; rings = rings || 4; hy = hy == null ? r : hy;
    const full = opt && opt.full;
    const v0 = full ? -rings : 0;
    for (let j = v0; j < rings; j++) {
      const t0 = j / rings * Math.PI / 2, t1 = (j + 1) / rings * Math.PI / 2;
      const y0a = Math.sin(t0) * hy, y1a = Math.sin(t1) * hy, r0 = Math.cos(t0) * r, r1 = Math.cos(t1) * r;
      for (let i = 0; i < seg; i++) {
        const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
        const nf = (t) => [Math.cos(t) / r, Math.sin(t) / hy, 0];
        const n0 = nf(t0), n1 = nf(t1);
        const N = (n, c, s) => { const v = [n[0] * c, n[1], n[0] * s]; const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
        const p00 = [cx + ca * r0, y0 + y0a, cz + sa * r0], p01 = [cx + cb * r0, y0 + y0a, cz + sb * r0];
        const p10 = [cx + ca * r1, y0 + y1a, cz + sa * r1], p11 = [cx + cb * r1, y0 + y1a, cz + sb * r1];
        this.triN(p01, p00, p10, N(n0, cb, sb), N(n0, ca, sa), N(n1, ca, sa));
        if (r1 > 1e-4) this.triN(p01, p10, p11, N(n0, cb, sb), N(n1, ca, sa), N(n1, cb, sb));
      }
    }
    return this;
  };
  BP.ball = function (cx, cy, cz, r, seg) { return this.dome(cx, cy, cz, r, r, seg || 8, 3, { full: true }); };

  // ---- Profil (Punkte [a, b] in der Ebene) extrudieren
  // extrudeZ: Profil in (x, y), von z0 nach z1. extrudeX: Profil in (z, y), von x0 nach x1.
  function area(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function triangulate(pts) {
    const T = (typeof THREE !== 'undefined') ? THREE : null;
    if (T && T.ShapeUtils) {
      const v = pts.map(p => new T.Vector2(p[0], p[1]));
      return T.ShapeUtils.triangulateShape(v, []);
    }
    const out = []; for (let i = 1; i < pts.length - 1; i++) out.push([0, i, i + 1]); return out;
  }
  BP.extrudeZ = function (pts, z0, z1, caps) {
    if (area(pts) < 0) pts = pts.slice().reverse();
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      // Außenseite: Kante a->b gegen den Uhrzeigersinn, Normale zeigt nach außen
      this.quad([a[0], a[1], z1], [a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1]);
    }
    if (caps !== false) {
      const tr = triangulate(pts);
      for (const t of tr) {
        const A = pts[t[0]], Bq = pts[t[1]], C = pts[t[2]];
        // Vorderseite (+z): CCW in (x, y)
        const ccw = (Bq[0] - A[0]) * (C[1] - A[1]) - (Bq[1] - A[1]) * (C[0] - A[0]) > 0;
        if (ccw) { this.tri([A[0], A[1], z1], [Bq[0], Bq[1], z1], [C[0], C[1], z1]); this.tri([A[0], A[1], z0], [C[0], C[1], z0], [Bq[0], Bq[1], z0]); }
        else { this.tri([A[0], A[1], z1], [C[0], C[1], z1], [Bq[0], Bq[1], z1]); this.tri([A[0], A[1], z0], [Bq[0], Bq[1], z0], [C[0], C[1], z0]); }
      }
    }
    return this;
  };
  BP.extrudeX = function (pts, x0, x1, caps) {
    // Profil (z, y) -> lokal um y gedreht: lokale x' = z, z' = −x
    this.push().rotY(Math.PI / 2);
    this.extrudeZ(pts.map(p => [-p[0], p[1]]), -x1, -x0, caps);
    return this.pop();
  };
  // senkrechtes Prisma aus Grundriss (x, z), y0..y1
  BP.prismY = function (pts, y0, y1, skipBottom) {
    if (area(pts) > 0) pts = pts.slice().reverse();   // im Uhrzeigersinn in (x, z) = gegen den Uhrzeigersinn von oben
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      this.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]);
    }
    const tr = triangulate(pts);
    for (const t of tr) {
      const A = pts[t[0]], Bq = pts[t[1]], C = pts[t[2]];
      const up = (Bq[0] - A[0]) * (C[1] - A[1]) - (Bq[1] - A[1]) * (C[0] - A[0]) < 0;
      if (up) { this.tri([A[0], y1, A[1]], [Bq[0], y1, Bq[1]], [C[0], y1, C[1]]); if (!skipBottom) this.tri([A[0], y0, A[1]], [C[0], y0, C[1]], [Bq[0], y0, Bq[1]]); }
      else { this.tri([A[0], y1, A[1]], [C[0], y1, C[1]], [Bq[0], y1, Bq[1]]); if (!skipBottom) this.tri([A[0], y0, A[1]], [Bq[0], y0, Bq[1]], [C[0], y0, C[1]]); }
    }
    return this;
  };
  // regelmäßiges Vieleck als Grundriss
  K.ngon = function (cx, cz, r, n, a0) { const o = []; for (let i = 0; i < n; i++) { const a = (a0 || 0) + i / n * Math.PI * 2; o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return o; };

  // ---- Dächer
  // Satteldach, First entlang x, über einem Baukörper sx × sz mit Traufhöhe y (Oberkante Wand), Firsthöhe h darüber.
  // o: { over (Überstand), th (Dicke), ends: Giebelwände in welcher Farbe/Material ({ mat, col }) | false, roofCol }
  BP.gable = function (cx, y, cz, sx, sz, h, o) {
    o = o || {};
    const over = o.over == null ? 0.12 : o.over, th = o.th == null ? 0.06 : o.th;
    const hz = sz / 2 + over, k = h / (sz / 2), ye = y - k * over;
    const hx = sx / 2 + (o.overX == null ? over * 0.8 : o.overX);
    const mt = this.mt, col = this.col;
    if (o.ends !== false) {
      const e = o.ends || {};
      this.mat(e.mat || 'plaster', e.col || col);
      this.push().tr(cx, 0, cz).extrudeX([[-sz / 2, y], [sz / 2, y], [0, y + h]], -sx / 2, sx / 2, true).pop();
    }
    this.mat(o.mat || 'roof', o.roofCol || col);
    this.push().tr(cx, 0, cz);
    this.extrudeX([[-hz, ye], [0, y + h], [hz, ye], [hz, ye + th], [0, y + h + th * 1.3], [-hz, ye + th]], -hx, hx, true);
    this.pop();
    this.mt = mt; this.col = col;
    return this;
  };
  // Walmdach (ridge = Firstlänge-Anteil 0..1 der Längsseite; 0 = Zeltdach/Pyramide)
  BP.hip = function (cx, y, cz, sx, sz, h, o) {
    o = o || {};
    const over = o.over == null ? 0.1 : o.over, th = o.th == null ? 0.05 : o.th;
    const alongX = sx >= sz;
    const hx = sx / 2 + over, hz = sz / 2 + over;
    const short = Math.min(hx, hz);
    const rl = (o.ridge == null ? 1 : o.ridge) * Math.max(0, (alongX ? hx : hz) - short);
    const yt = y + h, ye = y - (h / (Math.min(sx, sz) / 2)) * over;
    const E = [[cx - hx, ye, cz + hz], [cx + hx, ye, cz + hz], [cx + hx, ye, cz - hz], [cx - hx, ye, cz - hz]];
    const R = alongX ? [[cx - rl, yt, cz], [cx + rl, yt, cz]] : [[cx, yt, cz + rl], [cx, yt, cz - rl]];
    if (o.roofCol) this.c(o.roofCol);
    const mt = this.mt; this.mt = o.mat || 'roof';
    if (alongX) {
      this.quad(E[0], E[1], R[1], R[0]);           // vorn
      this.quad(E[2], E[3], R[0], R[1]);           // hinten
      this.tri(E[1], E[2], R[1]);                  // rechts
      this.tri(E[3], E[0], R[0]);                  // links
    } else {
      this.quad(E[1], E[2], R[1], R[0]);
      this.quad(E[3], E[0], R[0], R[1]);
      this.tri(E[0], E[1], R[0]);
      this.tri(E[2], E[3], R[1]);
    }
    // Traufkante (Dicke) und Unterseite
    const D = E.map(p => [p[0], p[1] - th, p[2]]);
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.quad(D[i], D[j], E[j], E[i]); }
    this.quad(D[3], D[2], D[1], D[0]);
    this.mt = mt;
    return this;
  };
  // Flachdach mit Attika (Brüstung) auf Baukörper
  BP.parapet = function (cx, y, cz, sx, sz, h, t) {
    t = t || 0.05;
    this.box(cx - sx / 2, y, cz - sz / 2, cx + sx / 2, y + h, cz - sz / 2 + t, 1);
    this.box(cx - sx / 2, y, cz + sz / 2 - t, cx + sx / 2, y + h, cz + sz / 2, 1);
    this.box(cx - sx / 2, y, cz - sz / 2 + t, cx - sx / 2 + t, y + h, cz + sz / 2 - t, 1 | 4 | 8);
    this.box(cx + sx / 2 - t, y, cz - sz / 2 + t, cx + sx / 2, y + h, cz + sz / 2 - t, 1 | 4 | 8);
    return this;
  };

  // ---- Fassadenteile (in der Seitenebene z = d, Breitenkoordinate u)
  // Fenster: Glas, Sturz, Bank, optional Fensterläden (Farbe) oder Sprossenkreuz
  BP.window = function (u, y, d, w, h, o) {
    o = o || {};
    const mt = this.mt, col = this.col;
    const fr = o.frame || [0.92, 0.9, 0.86];
    this.mat('glass', o.glass || '#2e3a44');
    this.box(u - w / 2, y, d - 0.02, u + w / 2, y + h, d + 0.012, 1 | 2 | 8);
    this.mat(o.frameMat || 'plaster', fr);
    this.box(u - w / 2 - 0.03, y - 0.035, d - 0.01, u + w / 2 + 0.03, y, d + 0.045, 8);   // Bank
    this.box(u - w / 2 - 0.02, y + h, d - 0.01, u + w / 2 + 0.02, y + h + 0.03, d + 0.03, 8 | 1); // Sturz
    if (o.cross) {
      this.box(u - 0.008, y, d, u + 0.008, y + h, d + 0.022, 1 | 2 | 8);
      this.box(u - w / 2, y + h * 0.55 - 0.008, d, u + w / 2, y + h * 0.55 + 0.008, d + 0.022, 8);
    }
    if (o.shutters) {
      this.mat('wood', o.shutters);
      this.box(u - w / 2 - w * 0.45 - 0.02, y, d, u - w / 2 - 0.02, y + h, d + 0.02, 8);
      this.box(u + w / 2 + 0.02, y, d, u + w / 2 + w * 0.45 + 0.02, y + h, d + 0.02, 8);
    }
    this.mt = mt; this.col = col;
    return this;
  };
  BP.door = function (u, y, d, w, h, o) {
    o = o || {};
    const mt = this.mt, col = this.col;
    this.mat('wood', o.col || '#5a3d26');
    this.box(u - w / 2, y, d - 0.02, u + w / 2, y + h, d + 0.015, 1 | 8);
    this.mat(o.frameMat || 'plaster', o.frame || '#d8d0c0');
    this.box(u - w / 2 - 0.035, y, d - 0.01, u - w / 2, y + h + 0.035, d + 0.035, 1 | 8);
    this.box(u + w / 2, y, d - 0.01, u + w / 2 + 0.035, y + h + 0.035, d + 0.035, 1 | 8);
    this.box(u - w / 2, y + h, d - 0.01, u + w / 2, y + h + 0.035, d + 0.035, 1 | 8);
    if (o.step !== false) { this.mat('stone', '#9a958c'); this.box(u - w / 2 - 0.05, y - 0.06, d, u + w / 2 + 0.05, y, d + 0.12, 8); }
    this.mt = mt; this.col = col;
    return this;
  };
  // Fahne an Mast: Mast (Holz/Metall) bei (x, z) von y0, Höhe h; Tuch w × fh in Farbe col, flattert in +x
  BP.flag = function (x, y0, z, h, w, fh, col, o) {
    o = o || {};
    const mt = this.mt, cc = this.col;
    this.mat(o.poleMat || 'wood', o.pole || '#6b5038');
    this.cyl(x, y0, z, o.r || 0.025, (o.r || 0.025) * 0.7, h, 5);
    this.mat('metal', '#c9a640').ball(x, y0 + h + 0.02, z, (o.r || 0.025) * 1.3, 5);
    this.mat('cloth', col);
    const y1 = y0 + h - 0.03, y2 = y1 - fh, n = 4, dir = o.dir || 1;
    for (let i = 0; i < n; i++) {
      const u0 = i / n, u1 = (i + 1) / n;
      const z0 = Math.sin(u0 * 3.2) * 0.04 * u0, z1 = Math.sin(u1 * 3.2) * 0.04 * u1;
      const s0 = o.pennant ? 1 - u0 * 0.85 : 1, s1 = o.pennant ? 1 - u1 * 0.85 : 1;
      const ym0 = (y1 + y2) / 2, ym1 = ym0;
      this.quad([x + dir * u0 * w, ym0 - fh / 2 * s0, z + z0], [x + dir * u1 * w, ym1 - fh / 2 * s1, z + z1], [x + dir * u1 * w, ym1 + fh / 2 * s1, z + z1], [x + dir * u0 * w, ym0 + fh / 2 * s0, z + z0]);
    }
    if (o.stripe) {
      this.c(o.stripe);
      const u0 = 0.0, u1 = 1;
      void u0; void u1;
      const ym = (y1 + y2) / 2;
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n;
        const za = Math.sin(a * 3.2) * 0.04 * a + 0.004, zb = Math.sin(b * 3.2) * 0.04 * b + 0.004;
        this.quad([x + dir * a * w, ym - fh * 0.12, z + za], [x + dir * b * w, ym - fh * 0.12, z + zb], [x + dir * b * w, ym + fh * 0.12, z + zb], [x + dir * a * w, ym + fh * 0.12, z + za]);
      }
    }
    this.mt = mt; this.col = cc;
    return this;
  };
  // Zinnen entlang einer Strecke (x0..x1 bei z = zc, Dicke t), Oberkante y
  BP.merlons = function (x0, x1, y, zc, t, mh, mw, gap) {
    const L = x1 - x0, step = mw + gap, n = Math.max(1, Math.round((L + gap) / step));
    const w = (L - (n - 1) * gap) / n;
    for (let i = 0; i < n; i++) { const a = x0 + i * (w + gap); this.box(a, y, zc - t / 2, a + w, y + mh, zc + t / 2, 1); }
    return this;
  };
  BP.stack = function (x, y, z) { this.meta.stacks.push(this._wp(x, y, z)); return this; };
  BP._wp = function (x, y, z) { const m = this.M; return [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]]; };

  // ---------------------------------------------------------------------------
  // Abschluss: Arrays je Material, Schein-Umgebungsverdeckung (unten dunkler), UVs nach Hauptachse
  // opt: { clipY (Rohbau: alles darüber wird auf clipY gestaucht), raw (Rohbaufarbe beimischen) }
  // ---------------------------------------------------------------------------
  BP.finish = function (opt) {
    opt = opt || {};
    const out = { groups: [], meta: this.meta, verts: 0, top: 0, minY: 0 };
    let top = 0;
    for (const m of K.MATS) { const P = this.G[m].p; for (let i = 1; i < P.length; i += 3) if (P[i] > top) top = P[i]; }
    out.full = top;
    if (opt.clipFrac != null) opt.clipY = Math.max(0.02, top * opt.clipFrac);
    for (const m of K.MATS) {
      const g = this.G[m], n = g.p.length / 3;
      if (!n) continue;
      if (opt.drop && opt.drop.indexOf(m) >= 0) continue;
      const pos = new Float32Array(g.p), nrm = new Float32Array(g.n), col = new Float32Array(g.c), uv = new Float32Array(n * 2);
      const s = UVS[m] || 1;
      const ao = m !== 'glow';
      for (let i = 0; i < n; i++) {
        const y = pos[i * 3 + 1];
        if (opt.clipY != null && y > opt.clipY) pos[i * 3 + 1] = opt.clipY;
        if (ao) {
          const t = Math.max(0, Math.min(1, (y + 0.02) / 0.5));
          const f = 0.62 + 0.38 * Math.sqrt(t);
          col[i * 3] *= f; col[i * 3 + 1] *= f; col[i * 3 + 2] *= f;
        }
        if (opt.raw) {
          const r = opt.raw;
          col[i * 3] = col[i * 3] * (1 - r[3]) + r[0] * r[3]; col[i * 3 + 1] = col[i * 3 + 1] * (1 - r[3]) + r[1] * r[3]; col[i * 3 + 2] = col[i * 3 + 2] * (1 - r[3]) + r[2] * r[3];
        }
      }
      // UV je Dreieck nach Normale der Fläche
      for (let t = 0; t < n; t += 3) {
        const ax = Math.abs(nrm[t * 3]), ay = Math.abs(nrm[t * 3 + 1]), az = Math.abs(nrm[t * 3 + 2]);
        for (let k = 0; k < 3; k++) {
          const i = t + k, x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
          if (ay >= ax && ay >= az) { uv[i * 2] = x * s; uv[i * 2 + 1] = z * s; }
          else if (ax >= az) { uv[i * 2] = z * s; uv[i * 2 + 1] = y * s; }
          else { uv[i * 2] = x * s; uv[i * 2 + 1] = y * s; }
        }
      }
      if (K.linear) for (let i = 0; i < col.length; i++) col[i] = Math.pow(col[i], 2.2);
      out.groups.push({ mat: m, pos: pos, nrm: nrm, col: col, uv: uv, n: n });
      out.verts += n;
    }
    out.top = opt.clipY != null ? Math.min(top, opt.clipY) : top;
    return out;
  };

  // ---------------------------------------------------------------------------
  // Texturen (Graustufen, nahe Weiß; Farbe kommt aus den Ecken) – im Code gemalt
  // ---------------------------------------------------------------------------
  function canvasTex(T, size, paint) {
    if (typeof document === 'undefined') return null;
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const g = cv.getContext('2d');
    paint(g, size);
    const t = new T.CanvasTexture(cv);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }
  function noiseFill(g, S, base, amp, seed) {
    const img = g.getImageData(0, 0, S, S), d = img.data;
    for (let i = 0; i < S * S; i++) {
      const n = (hash(i * 31 + seed) - 0.5) * amp;
      d[i * 4] = Math.max(0, Math.min(255, d[i * 4] + n));
      d[i * 4 + 1] = Math.max(0, Math.min(255, d[i * 4 + 1] + n));
      d[i * 4 + 2] = Math.max(0, Math.min(255, d[i * 4 + 2] + n));
    }
    g.putImageData(img, 0, 0);
    void base;
  }
  K.textures = function (T) {
    if (K._tex) return K._tex;
    const tx = {};
    tx.plaster = canvasTex(T, 128, function (g, S) {
      g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 60; i++) {
        const x = hash(i * 3 + 1) * S, y = hash(i * 3 + 2) * S, r = 6 + hash(i * 3 + 3) * 20;
        const v = 225 + ((hash(i * 7) * 30) | 0);
        g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.35)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      noiseFill(g, S, 0, 16, 7);
    });
    tx.stone = canvasTex(T, 256, function (g, S) {
      g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, S, S);
      const rows = 8, rh = S / rows;
      for (let r = 0; r < rows; r++) {
        let x = -hash(r * 13) * 60;
        let k = 0;
        while (x < S) {
          const w = 34 + hash(r * 97 + k * 7) * 40;
          const v = 196 + ((hash(r * 31 + k * 17) * 50) | 0);
          g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
          const x0 = x + 1.5, y0 = r * rh + 1.5;
          g.fillRect(x0, y0, w - 3, rh - 3);
          if (x0 + w > S) g.fillRect(x0 - S, y0, w - 3, rh - 3);
          g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x0, y0, w - 3, 2);
          g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x0, y0 + rh - 5, w - 3, 2);
          x += w; k++;
        }
      }
      noiseFill(g, S, 0, 22, 3);
    });
    tx.wood = canvasTex(T, 256, function (g, S) {
      g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, S, S);
      const rows = 8, rh = S / rows;
      for (let r = 0; r < rows; r++) {
        const v = 200 + ((hash(r * 5) * 45) | 0);
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; g.fillRect(0, r * rh, S, rh);
        for (let l = 0; l < 7; l++) {
          const yy = r * rh + 3 + hash(r * 50 + l) * (rh - 6);
          g.strokeStyle = 'rgba(70,70,70,' + (0.08 + hash(l * 9 + r) * 0.12) + ')'; g.lineWidth = 1;
          g.beginPath(); g.moveTo(0, yy);
          for (let x = 0; x <= S; x += 16) g.lineTo(x, yy + Math.sin(x * 0.05 + l + r) * 1.4);
          g.stroke();
        }
        g.fillStyle = 'rgba(40,40,40,0.55)'; g.fillRect(0, r * rh, S, 2);
        const jx = hash(r * 77) * S; g.fillRect(jx, r * rh, 2, rh);
      }
      noiseFill(g, S, 0, 14, 5);
    });
    tx.roof = canvasTex(T, 256, function (g, S) {
      g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, S, S);
      const rows = 12, rh = S / rows, tw = S / 10;
      for (let r = 0; r < rows; r++) {
        const off = (r & 1) ? tw / 2 : 0;
        for (let i = -1; i < 11; i++) {
          const v = 190 + ((hash(r * 41 + i * 3) * 60) | 0);
          g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
          g.fillRect(i * tw + off + 1, r * rh, tw - 2, rh - 1);
        }
        const grd = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
        grd.addColorStop(0, 'rgba(0,0,0,0.0)'); grd.addColorStop(0.75, 'rgba(0,0,0,0.05)'); grd.addColorStop(1, 'rgba(0,0,0,0.38)');
        g.fillStyle = grd; g.fillRect(0, r * rh, S, rh);
      }
      noiseFill(g, S, 0, 14, 9);
    });
    K._tex = tx;
    return tx;
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
