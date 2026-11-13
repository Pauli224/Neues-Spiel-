// Eingabe über Pointer Events: Maus, Touch, Stift, Rad, Tastatur – für Pixel- und 3D-Ansicht.
// Ein Finger = Werkzeug (bei „Schauen": verschieben, Tippen = auswählen), zwei Finger = zoomen/verschieben
// (in 3D zusätzlich drehen durch Verdrehen und kippen durch gemeinsames Hoch/Runter).
// Maus: links = Werkzeug, rechts/Leertaste = verschieben; in 3D Mitte oder Alt+links = drehen/kippen.
(function (WW) { 'use strict';

  const TAP_MOVE = 9;        // CSS-Pixel: darunter gilt eine Berührung als Tippen
  const PAINT_DELAY = 110;   // ms: so lange wartet Touch-Malen auf einen zweiten Finger

  // canvases: alle Leinwände, auf denen Eingaben ankommen; game.viewApi() liefert die aktive Ansicht:
  // { is3d, pan(dx,dy), zoomAt(f,sx,sy), orbit(dYaw,dTilt), tile(sx,sy) -> {x,y}|null, stop(), fling(vx,vy), snap(sx,sy) }
  function Input(canvases, game) {
    this.cvs = canvases; this.game = game;
    this.cv = canvases[0];
    this.ptrs = new Map();
    this.mode = null;
    this.keys = new Set();
    this.space = false;
    this.hover = null;          // Mausposition (Bildschirm)
    this.samples = [];
    this.lastPaint = null;
    this.snapTimer = 0;
    this.bind();
  }

  Input.prototype.v = function () { return this.game.viewApi(); };

  Input.prototype.bind = function () {
    for (const cv of this.cvs) {
      cv.addEventListener('pointerdown', (e) => { this.cv = cv; this.down(e); });
      cv.addEventListener('pointermove', (e) => this.move(e));
      cv.addEventListener('pointerup', (e) => this.up(e, false));
      cv.addEventListener('pointercancel', (e) => this.up(e, true));
      cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.hover = null; } });
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      cv.addEventListener('wheel', (e) => { this.cv = cv; this.wheel(e); }, { passive: false });
    }
    // Safari-Gesten (Pinch auf dem Trackpad) nicht als Seitenzoom
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.space = false; });
  };

  Input.prototype.pos = function (e) {
    const r = this.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  Input.prototype.down = function (e) {
    const p = this.pos(e), v = this.v();
    try { this.cv.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    this.ptrs.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t0: performance.now(), type: e.pointerType, button: e.button });
    this.game.onUserActivity();
    if (this.ptrs.size === 1) {
      v.stop();
      this.samples = [{ t: performance.now(), x: p.x, y: p.y }];
      const tool = this.game.tool;
      const mouse = e.pointerType === 'mouse';
      if (mouse && v.is3d && (e.button === 1 || (e.button === 0 && e.altKey))) this.mode = 'orbit';
      else if (mouse && (e.button === 1 || e.button === 2 || this.space)) { this.mode = 'pan'; if (this.space) this.spaceUsed = true; }
      else if (mouse && e.button !== 0) { this.mode = 'ignore'; }
      else if (tool.kind === 'tap' && tool.drag) { this.mode = 'drag'; this.game.dragStart(p.x, p.y); }
      else if (tool.kind === 'grab') { this.mode = this.game.grabAt(p.x, p.y) ? 'grab' : 'pendTap'; }
      else if (tool.kind === 'paint') {
        if (mouse) { this.mode = 'paint'; this.paintTo(p, true); }
        else this.mode = 'pendPaint';
      } else this.mode = 'pendTap';
      this.cv.classList.toggle('panning', this.mode === 'pan' || this.mode === 'orbit');
    } else if (this.ptrs.size === 2) {
      // zweiter Finger: immer Kamera
      if (this.mode === 'paint') this.game.endStroke();
      if (this.mode === 'drag') this.game.dragEnd(0, 0, true);
      if (this.mode === 'grab') { const q0 = Array.from(this.ptrs.values())[0]; this.game.dropAt(q0.x, q0.y, false); }
      this.mode = 'pinch';
      this.pinchStart();
    }
    e.preventDefault();
  };

  Input.prototype.pinchStart = function () {
    const a = Array.from(this.ptrs.values());
    this.pinch = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1, mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2,
      ang: Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x) };
  };

  Input.prototype.move = function (e) {
    const p = this.pos(e), v = this.v();
    if (e.pointerType === 'mouse') this.hover = p;
    const q = this.ptrs.get(e.pointerId);
    if (!q) return;
    const dx = p.x - q.x, dy = p.y - q.y;
    q.x = p.x; q.y = p.y;
    const moved = Math.hypot(p.x - q.sx, p.y - q.sy);
    const now = performance.now();
    switch (this.mode) {
      case 'pan':
        v.pan(dx, dy);
        this.sample(p, now);
        break;
      case 'orbit':
        v.orbit(-dx * 0.008, dy * 0.006);
        break;
      case 'pendTap':
        if (moved > TAP_MOVE) { this.mode = 'pan'; this.cv.classList.add('panning'); v.pan(p.x - q.sx, p.y - q.sy); this.sample(p, now); }
        break;
      case 'pendPaint':
        if (moved > TAP_MOVE || now - q.t0 > PAINT_DELAY) { this.mode = 'paint'; this.paintTo({ x: q.sx, y: q.sy }, true); this.paintTo(p, false); }
        break;
      case 'paint':
        this.paintTo(p, false);
        break;
      case 'grab':
        this.game.grabMove(p.x, p.y);
        break;
      case 'drag':
        this.game.dragMove(p.x, p.y);
        break;
      case 'pinchRest':
        v.pan(dx, dy);
        break;
      case 'pinch': {
        const a = Array.from(this.ptrs.values());
        if (a.length < 2) break;
        const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1;
        const mx = (a[0].x + a[1].x) / 2, my = (a[0].y + a[1].y) / 2;
        const ang = Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x);
        if (v.is3d) {
          // Verdrehen = drehen, gemeinsam hoch/runter = kippen, Spreizen = zoomen
          let da = ang - this.pinch.ang;
          if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
          const dmy = my - this.pinch.my;
          if (Math.abs(da) > 0.002) v.orbit(-da, 0);
          if (Math.abs(dmy) > 0.5 && Math.abs(d / this.pinch.d - 1) < 0.02) v.orbit(0, dmy * 0.006);
          else v.pan(mx - this.pinch.mx, 0);
          v.zoomAt(d / this.pinch.d, mx, my);
        } else {
          v.pan(mx - this.pinch.mx, my - this.pinch.my);
          v.zoomAt(d / this.pinch.d, mx, my);
        }
        this.pinch.d = d; this.pinch.mx = mx; this.pinch.my = my; this.pinch.ang = ang;
        break;
      }
    }
  };

  Input.prototype.sample = function (p, t) {
    this.samples.push({ t: t, x: p.x, y: p.y });
    while (this.samples.length > 2 && t - this.samples[0].t > 90) this.samples.shift();
  };

  Input.prototype.up = function (e, cancel) {
    const q = this.ptrs.get(e.pointerId);
    if (!q) return;
    const p = this.pos(e), v = this.v();
    this.ptrs.delete(e.pointerId);
    try { this.cv.releasePointerCapture(e.pointerId); } catch (err) { /* egal */ }
    const mode = this.mode;
    if (this.ptrs.size === 0) {
      this.mode = null;
      this.cv.classList.remove('panning');
      if (mode === 'grab') { this.game.dropAt(p.x, p.y, cancel); return; }
      if (mode === 'drag') { this.game.dragEnd(p.x, p.y, cancel); return; }
      if (cancel) { if (mode === 'paint') this.game.endStroke(); return; }
      if (mode === 'pendTap') this.game.tapAt(p.x, p.y);
      else if (mode === 'pendPaint') { this.paintTo(p, true); this.game.endStroke(); }
      else if (mode === 'paint') this.game.endStroke();
      else if (mode === 'pan') {
        // Trägheit aus den letzten Bewegungen
        const s = this.samples, n = s.length;
        if (n >= 2 && performance.now() - s[n - 1].t < 60) {
          const dt = (s[n - 1].t - s[0].t) / 1000;
          if (dt > 0.008) v.fling((s[n - 1].x - s[0].x) / dt, (s[n - 1].y - s[0].y) / dt);
        }
      } else if (mode === 'pinch' || mode === 'pinchRest') this.snapSoon(0);
    } else if (mode === 'pinch') {
      // ein Finger bleibt: nur noch verschieben, kein Werkzeug
      this.mode = 'pinchRest';
      const rest = Array.from(this.ptrs.values())[0];
      rest.sx = rest.x; rest.sy = rest.y;
    }
  };

  // Malen: Linie von der letzten Kachel zur aktuellen (keine Lücken)
  Input.prototype.paintTo = function (p, first) {
    const w = this.v().tile(p.x, p.y);
    if (!w) return;
    const tx = w.x, ty = w.y;
    if (first || !this.lastPaint) { this.game.paintAt(tx, ty, true); this.lastPaint = { x: tx, y: ty }; return; }
    const lx = this.lastPaint.x, ly = this.lastPaint.y;
    const dist = Math.hypot(tx - lx, ty - ly);
    const steps = Math.min(200, Math.ceil(dist / 0.5));
    for (let k = 1; k <= steps; k++) this.game.paintAt(lx + (tx - lx) * k / steps, ly + (ty - ly) * k / steps, false);
    this.lastPaint = { x: tx, y: ty };
  };

  Input.prototype.wheel = function (e) {
    e.preventDefault();
    const p = this.pos(e);
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= 400;
    const k = e.ctrlKey ? 0.01 : 0.0018;
    this.v().zoomAt(Math.exp(-dy * k), p.x, p.y);
    this.hover = p;
    this.snapSoon(240, p);
    this.game.onUserActivity();
  };

  // nach der Geste auf eine scharfe Zoomstufe gleiten (nur Pixel-Ansicht)
  Input.prototype.snapSoon = function (ms, p) {
    clearTimeout(this.snapTimer);
    this.snapTimer = setTimeout(() => { if (!this.ptrs.size) this.v().snap(p ? p.x : null, p ? p.y : null); }, ms);
  };

  Input.prototype.key = function (e, down) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = e.key;
    // Leertaste: gehalten + Ziehen = verschieben; kurz getippt = Pause an/aus
    if (k === ' ') {
      e.preventDefault();
      if (down) { if (!this.space) { this.space = true; this.spaceUsed = false; } return; }
      this.space = false;
      if (!this.spaceUsed && !this.game.ui.modalOpen()) this.game.togglePause();
      return;
    }
    const camKeys = { w: 1, a: 1, s: 1, d: 1, W: 1, A: 1, S: 1, D: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, q: 1, Q: 1, e: 1, E: 1 };
    if (camKeys[k]) {
      if (this.game.ui.modalOpen() && k.startsWith('Arrow')) return;
      const lk = k.toLowerCase();
      if ((lk === 'q' || lk === 'e') && !this.v().is3d) { if (down && !e.ctrlKey && !e.metaKey && !e.altKey) this.game.onKey(k, e); return; }
      if (down) this.keys.add(lk); else this.keys.delete(lk);
      if (down && k.startsWith('Arrow')) e.preventDefault();
      return;
    }
    if (!down) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    this.game.onKey(k, e);
  };

  // pro Bild: Tastatur-Verschieben und -Drehen
  Input.prototype.update = function (dt) {
    if (this.mode === 'pendPaint' && this.ptrs.size === 1) {
      const q = Array.from(this.ptrs.values())[0];
      if (performance.now() - q.t0 > PAINT_DELAY) { this.mode = 'paint'; this.paintTo({ x: q.sx, y: q.sy }, true); this.paintTo(q, false); }
    }
    if (!this.keys.size) return;
    let x = 0, y = 0, r = 0;
    const K = this.keys;
    if (K.has('a') || K.has('arrowleft')) x -= 1;
    if (K.has('d') || K.has('arrowright')) x += 1;
    if (K.has('w') || K.has('arrowup')) y -= 1;
    if (K.has('s') || K.has('arrowdown')) y += 1;
    if (K.has('q')) r += 1;
    if (K.has('e')) r -= 1;
    const v = this.v(), sp = 700 * dt;
    if (x || y) v.pan(-x * sp, -y * sp);
    if (r && v.is3d) v.orbit(r * 1.6 * dt, 0);
  };

  WW.UI = WW.UI || {};
  WW.UI.Input = Input;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
