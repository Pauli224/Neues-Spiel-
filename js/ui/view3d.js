// 3D-Ansicht einbinden: WW.R3 (js/render3d/*) starten, füttern, Beschriftungen als HTML über der Szene,
// Kompass. Alles defensiv: fehlt WW.R3 oder scheitert etwas, meldet frame() false und main.js fällt auf Pixel zurück.
(function (WW) { 'use strict';
  const D = () => WW.UI.dom;
  const MAX_LABELS = 40;

  function View3D(game) {
    this.game = game;
    this.canvas = document.getElementById('world3d');
    this.labels = document.getElementById('labels3d');
    this.compass = document.getElementById('btnCompass');
    this.r3 = null;
    this.pool = [];
    this.plotPool = [];
    this.overlayKey = '';
    this.compass.addEventListener('click', () => { this.north(); game.uiSound('click'); });
    const self = this;
    // Schnittstelle für die Eingabe (siehe js/ui/input.js)
    this.api = {
      is3d: true,
      pan(dx, dy) { self.call('pan', dx, dy); },
      zoomAt(f, sx, sy) { self.call('zoomAt', f, sx, sy); },
      orbit(dy, dt) { self.call('orbit', dy, dt); },
      tile(sx, sy) { return self.tileAt(sx, sy); },
      stop() { /* Trägheit macht die 3D-Kamera selbst */ },
      fling() { /* dito */ },
      snap() { /* keine Pixelstufen */ }
    };
  }

  View3D.prototype.available = function () {
    try { return !!(WW.R3 && typeof WW.R3.create === 'function' && (!WW.R3.supported || WW.R3.supported())); } catch (e) { return false; }
  };

  // Aufruf mit Schutz: Fehler -> 3D aus
  View3D.prototype.call = function (fn) {
    const r = this.r3;
    if (!r || typeof r[fn] !== 'function') return undefined;
    try { return r[fn].apply(r, Array.prototype.slice.call(arguments, 1)); } catch (e) { this.fail(e); return undefined; }
  };
  View3D.prototype.fail = function (e) {
    if (!this.failed) console.error('Wuselwelt 3D:', e);
    this.failed = true;
  };

  View3D.prototype.start = function () {
    if (this.r3) return true;
    if (!this.available()) return false;
    this.failed = false;
    try {
      this.r3 = WW.R3.create(this.canvas, { quality: this.game.quality });
      const g = this.game;
      if (this.r3.setInterpolator) this.r3.setInterpolator((u, alpha, out) => {
        out = out || {};
        const p = g.prev.get(u.kind && !u.role ? -u.id : u.id);
        let x = u.x, y = u.y;
        if (p) { const dx = x - p[0], dy = y - p[1]; if (dx * dx + dy * dy < 4) { x = p[0] + dx * alpha; y = p[1] + dy * alpha; } }
        out.x = x; out.y = y;
        return out;
      });
      if (g.sim) this.r3.attach(g.sim);
      this.resize();
      return true;
    } catch (e) {
      this.fail(e);
      try { if (this.r3 && this.r3.dispose) this.r3.dispose(); } catch (er) { /* egal */ }
      this.r3 = null;
      return false;
    }
  };
  View3D.prototype.stop = function () {
    try { if (this.r3 && this.r3.dispose) this.r3.dispose(); } catch (e) { /* egal */ }
    this.r3 = null;
    this.show(false);
  };
  // Qualität ändern = neu aufbauen
  View3D.prototype.rebuild = function () {
    if (!this.r3) return;
    const ci = this.cameraInfo();
    this.stop();
    if (this.start()) { this.show(this.game.mode === '3d'); if (ci) this.focus(ci.x, ci.y, true); }
  };

  View3D.prototype.show = function (on) {
    this.canvas.hidden = !on;
    this.labels.hidden = !on;
    this.compass.hidden = !on;
    if (on) this.resize();
  };
  View3D.prototype.resize = function () { if (this.r3 && !this.canvas.hidden) this.call('resize'); };

  View3D.prototype.attach = function (sim, focus) {
    if (!this.r3) return;
    this.call('attach', sim);
    this.overlayKey = '';
    if (focus) this.focus(focus.x, focus.y, true);
  };
  View3D.prototype.markDirty = function (list) { if (this.r3 && this.r3.markDirty) this.call('markDirty', list); };
  View3D.prototype.pushFx = function (list) {
    if (!WW.R3 || !WW.R3.Fx || typeof WW.R3.Fx.push !== 'function') return;
    for (const f of list) { try { WW.R3.Fx.push(f); } catch (e) { /* einzelner Effekt darf nicht stören */ } }
  };
  View3D.prototype.focus = function (x, y, instant) { this.call('focus', x, y, { instant: !!instant }); };
  View3D.prototype.tileAt = function (sx, sy) {
    const r = this.canvas.getBoundingClientRect();
    const t = this.call('tileAt', sx + r.left, sy + r.top);
    return t && isFinite(t.x) && isFinite(t.y) ? t : null;
  };
  View3D.prototype.cameraInfo = function () { return this.call('cameraInfo') || null; };
  View3D.prototype.viewQuad = function () { return this.call('viewQuad') || null; };
  View3D.prototype.north = function () {
    const ci = this.cameraInfo();
    if (ci && ci.yaw) this.call('orbit', -ci.yaw, 0);
  };

  // ein Bild; false = 3D ist ausgefallen
  View3D.prototype.frame = function (alpha, dt, o) {
    if (!this.r3 || this.failed) return false;
    // Überlagerungen nur bei Änderung weitergeben
    const sel = o.select ? { kind: o.select.kind, id: o.select.obj && o.select.obj.id, x: o.select.x, y: o.select.y } : null;
    const ov = { territory: true, air: !!o.air, brush: o.brush || null, selection: sel };
    const key = JSON.stringify(ov);
    if (key !== this.overlayKey) { this.overlayKey = key; this.call('setOverlay', ov); }
    this.call('frame', alpha, dt);
    if (this.failed) return false;
    this.updateLabels();
    this.updateCompass();
    return true;
  };

  View3D.prototype.updateCompass = function () {
    const ci = this.cameraInfo();
    if (!ci) return;
    const n = this.compass.firstChild;
    const deg = Math.round(-(ci.yaw || 0) * 180 / Math.PI);
    if (this._deg !== deg) { this._deg = deg; n.style.transform = 'rotate(' + deg + 'deg)'; }
  };

  // Stadtnamen (Banner, Name, Einwohner) und Vorhaben-Marker als HTML über der Szene
  View3D.prototype.updateLabels = function () {
    const st = this.game.sim && this.game.sim.state;
    if (!st || !this.r3 || !this.r3.project) return;
    const ci = this.cameraInfo() || { x: 0, y: 0, dist: 30 };
    const far = (ci.dist || 30) > 140;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const cand = [];
    if (!far) for (const c of st.cities) {
      const d = Math.hypot(c.cx - ci.x, c.cy - ci.y);
      cand.push({ c: c, d: d });
    }
    cand.sort((a, b) => a.d - b.d);
    let n = 0;
    const kings = new Map();
    for (const k of st.kingdoms) kings.set(k.id, k);
    for (const it of cand) {
      if (n >= MAX_LABELS) break;
      const c = it.c, k = kings.get(c.kingdomId);
      if (!k) continue;
      let p = null;
      try { p = this.r3.project(c.cx + 0.5, c.cy + 0.5, 4.2); } catch (e) { p = null; }
      if (!p || !p.visible || p.sx < -80 || p.sx > W + 80 || p.sy < -20 || p.sy > H + 20) continue;
      const el = this.labelEl(n++);
      const sig = c.id + '|' + c.name + '|' + (c.pop | 0) + '|' + k.colorIndex + '|' + k.bannerPattern;
      if (el._sig !== sig) {
        el._sig = sig; el._city = c.id;
        D().clear(el);
        el.appendChild(D().icon('banner_' + ((k.bannerPattern | 0) % 8), 18, k.colorIndex));
        el.appendChild(D().h('span.n', c.name));
        el.appendChild(D().h('span.p', String(c.pop | 0)));
        el.style.borderBottomColor = (WW.Sprites.TEAM_COLORS[k.colorIndex | 0] || {}).main || '#f2b541';
      }
      el.style.transform = 'translate(' + Math.round(p.sx) + 'px,' + Math.round(p.sy) + 'px) translate(-50%,-100%)';
      if (el.hidden) el.hidden = false;
    }
    for (let i = n; i < this.pool.length; i++) if (!this.pool[i].hidden) this.pool[i].hidden = true;
    // Vorhaben
    let m = 0;
    if (!far && Array.isArray(st.plots)) for (const pl of st.plots) {
      if (m >= 12 || !pl || !(pl.x >= 0)) continue;
      let p = null;
      try { p = this.r3.project(pl.x, pl.y, 5.5); } catch (e) { p = null; }
      if (!p || !p.visible || p.sx < 0 || p.sx > W || p.sy < 0 || p.sy > H) continue;
      const el = this.plotEl(m++);
      const v = Math.round(100 * Math.max(0, Math.min(1, +pl.progress || 0)));
      el.firstChild.style.height = v + '%';
      el.title = (pl.type === 'war' ? 'Rüstet zum Krieg' : pl.type === 'alliance' ? 'Bündnis in Arbeit' : pl.type === 'secession' ? 'Abspaltung droht' : 'Vorhaben') + ' · ' + v + ' %';
      el.style.transform = 'translate(' + Math.round(p.sx + 46) + 'px,' + Math.round(p.sy) + 'px) translate(-50%,-100%)';
      if (el.hidden) el.hidden = false;
    }
    for (let i = m; i < this.plotPool.length; i++) if (!this.plotPool[i].hidden) this.plotPool[i].hidden = true;
  };
  View3D.prototype.labelEl = function (i) {
    let el = this.pool[i];
    if (!el) {
      el = D().h('button.lbl3d', { type: 'button' });
      el.addEventListener('click', () => { if (el._city != null) this.game.selectCity(el._city, false); });
      this.labels.appendChild(el);
      this.pool[i] = el;
    }
    return el;
  };
  View3D.prototype.plotEl = function (i) {
    let el = this.plotPool[i];
    if (!el) { el = D().h('div.plot3d', [D().h('b')]); this.labels.appendChild(el); this.plotPool[i] = el; }
    return el;
  };

  WW.UI = WW.UI || {};
  WW.UI.View3D = View3D;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
