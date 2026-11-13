// Kamera: Ausschnitt der Welt in Logikpixeln (8 je Kachel), Zoom 0,5–8, Trägheit, Einrasten auf scharfe Stufen.
(function (WW) { 'use strict';

  const MIN_ZOOM = 0.5, MAX_ZOOM = 8;

  function Camera() {
    this.x = 0; this.y = 0;          // Weltpunkt (Logikpixel) in der Bildmitte
    this.zoom = 2;                   // CSS-Pixel je Logikpixel
    this.viewW = 1; this.viewH = 1;  // Sichtfläche in CSS-Pixeln
    this.dpr = 1;
    this.worldW = 8; this.worldH = 8;
    this.vx = 0; this.vy = 0;        // Trägheit (Logikpixel/s)
    this.anim = null;                // laufende Zoom-/Flugbewegung
    this.minZoom = MIN_ZOOM; this.maxZoom = MAX_ZOOM;
    this.insetTop = 0; this.insetBottom = 0; this.insetRight = 0;   // von der Oberfläche verdeckte Ränder (CSS-Pixel)
  }

  Camera.prototype.setView = function (w, h, dpr) { this.viewW = w; this.viewH = h; this.dpr = dpr || 1; this.clamp(); };
  Camera.prototype.setWorld = function (tilesW, tilesH) { this.worldW = tilesW * 8; this.worldH = tilesH * 8; this.clamp(); };

  // Gerätepixel je Logikpixel
  Camera.prototype.scale = function () { return this.zoom * this.dpr; };

  Camera.prototype.screenToWorld = function (sx, sy) {
    return { x: this.x + (sx - this.viewW / 2) / this.zoom, y: this.y + (sy - this.viewH / 2) / this.zoom };
  };
  Camera.prototype.worldToScreen = function (wx, wy) {
    return { x: (wx - this.x) * this.zoom + this.viewW / 2, y: (wy - this.y) * this.zoom + this.viewH / 2 };
  };

  // Versatz in Gerätepixeln, ganzzahlig gerundet (kein Flimmern beim Verschieben)
  Camera.prototype.offset = function () {
    const s = this.scale();
    return { ox: Math.round(this.viewW * this.dpr / 2 - this.x * s), oy: Math.round(this.viewH * this.dpr / 2 - this.y * s), s: s };
  };

  // Sichtbares Kachelrechteck (mit Rand für überragende Sprites)
  Camera.prototype.visibleTiles = function (W, H, pad) {
    pad = pad == null ? 1 : pad;
    const hw = this.viewW / 2 / this.zoom, hh = this.viewH / 2 / this.zoom;
    return {
      x0: Math.max(0, Math.floor((this.x - hw) / 8) - pad), y0: Math.max(0, Math.floor((this.y - hh) / 8) - pad),
      x1: Math.min(W - 1, Math.floor((this.x + hw) / 8) + pad), y1: Math.min(H - 1, Math.floor((this.y + hh) / 8) + pad + 3)
    };
  };

  Camera.prototype.clamp = function () {
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom));
    // Mitte darf bis an den Kartenrand, aber nicht darüber hinaus (kleine Welten: zentriert)
    const hw = this.viewW / 2 / this.zoom, hh = this.viewH / 2 / this.zoom;
    const mx = Math.min(hw * 0.5, 72 / this.zoom + 24), my = Math.min(hh * 0.5, 72 / this.zoom + 24);
    const lx = this.worldW - 2 * hw;
    if (lx < 0) this.x = Math.max(this.worldW / 2 - mx * 0.2, Math.min(this.worldW / 2 + mx * 0.2, this.x));
    else this.x = Math.max(hw - mx, Math.min(this.worldW - hw + mx, this.x));
    const ly = this.worldH - 2 * hh;
    if (ly < 0) this.y = Math.max(this.worldH / 2 - my * 0.2, Math.min(this.worldH / 2 + my * 0.2, this.y));
    else this.y = Math.max(hh - my, Math.min(this.worldH - hh + my, this.y));
  };

  Camera.prototype.panBy = function (dxScreen, dyScreen) {
    this.x -= dxScreen / this.zoom; this.y -= dyScreen / this.zoom;
    this.anim = null;
    this.clamp();
  };

  // Zoom um Faktor, Bildschirmpunkt (sx, sy) bleibt fest
  Camera.prototype.zoomAt = function (factor, sx, sy) {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x; this.y += before.y - after.y;
    this.anim = null;
    this.clamp();
  };

  // nächste scharfe Stufe: ganzzahlige Gerätepixel je Logikpixel (unterhalb 1: 0,5)
  Camera.prototype.crispZoom = function (z) {
    const s = z * this.dpr;
    let t;
    if (s >= 5) return z;                       // groß genug, Ungleichmäßigkeit unsichtbar
    if (s < 0.75) t = 0.5; else t = Math.max(1, Math.round(s));
    return Math.max(this.minZoom, Math.min(this.maxZoom, t / this.dpr));
  };

  // weich zu Zoom/Position gleiten; sx, sy = Fixpunkt am Bildschirm (optional)
  Camera.prototype.animateZoom = function (z, sx, sy, ms) {
    z = Math.max(this.minZoom, Math.min(this.maxZoom, z));
    if (sx == null) { sx = this.viewW / 2; sy = this.viewH / 2; }
    this.anim = { kind: 'zoom', z0: this.zoom, z1: z, sx: sx, sy: sy, t: 0, d: (ms || 160) / 1000 };
    this.vx = this.vy = 0;
  };
  Camera.prototype.flyTo = function (wx, wy, z, ms) {
    this.anim = { kind: 'fly', x0: this.x, y0: this.y, x1: wx, y1: wy, z0: this.zoom, z1: z == null ? this.zoom : z, t: 0, d: (ms || 450) / 1000 };
    this.vx = this.vy = 0;
  };

  // pro Bild: Animation und Trägheit; true = Kamera hat sich bewegt
  Camera.prototype.update = function (dt, reduced) {
    let moved = false;
    const a = this.anim;
    if (a) {
      a.t += dt;
      let k = a.d > 0 && !reduced ? Math.min(1, a.t / a.d) : 1;
      const e = 1 - Math.pow(1 - k, 3);
      if (a.kind === 'zoom') {
        const before = this.screenToWorld(a.sx, a.sy);
        this.zoom = a.z0 + (a.z1 - a.z0) * e;
        const after = this.screenToWorld(a.sx, a.sy);
        this.x += before.x - after.x; this.y += before.y - after.y;
      } else {
        this.x = a.x0 + (a.x1 - a.x0) * e; this.y = a.y0 + (a.y1 - a.y0) * e;
        this.zoom = a.z0 + (a.z1 - a.z0) * e;
      }
      if (k >= 1) this.anim = null;
      this.clamp();
      moved = true;
    }
    if (this.vx || this.vy) {
      this.x += this.vx * dt; this.y += this.vy * dt;
      const f = Math.pow(0.004, dt);
      this.vx *= f; this.vy *= f;
      if (Math.abs(this.vx) < 2 && Math.abs(this.vy) < 2) this.vx = this.vy = 0;
      this.clamp();
      moved = true;
    }
    return moved;
  };

  WW.Camera = Camera;
  WW.Camera.MIN_ZOOM = MIN_ZOOM; WW.Camera.MAX_ZOOM = MAX_ZOOM;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
