// Minikarte: Gelände (Kleinbild des Renderers) + Gebiete + Sichtrahmen; antippen/ziehen springt.
(function (WW) { 'use strict';

  function Minimap(game) {
    this.game = game;
    this.box = document.getElementById('minimap');
    this.cv = document.getElementById('miniCanvas');
    this.ctx = this.cv.getContext('2d');
    this.t = 0;
    this.user = null;   // vom Spieler gewählter Zustand (null = automatisch)
    const go = (e) => {
      const r = this.cv.getBoundingClientRect(), st = this.game.sim && this.game.sim.state;
      if (!st) return;
      const x = (e.clientX - r.left) / r.width * st.W * 8, y = (e.clientY - r.top) / r.height * st.H * 8;
      this.game.cam.x = x; this.game.cam.y = y; this.game.cam.vx = this.game.cam.vy = 0; this.game.cam.anim = null; this.game.cam.clamp();
      this.game.followId = null;
    };
    let down = false;
    this.cv.addEventListener('pointerdown', (e) => { down = true; try { this.cv.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } go(e); e.preventDefault(); });
    this.cv.addEventListener('pointermove', (e) => { if (down) go(e); });
    this.cv.addEventListener('pointerup', () => { down = false; });
    this.cv.addEventListener('pointercancel', () => { down = false; });
  }

  Minimap.prototype.wanted = function () {
    if (this.user != null) return this.user;
    return window.innerWidth >= 900 && window.innerHeight >= 560;
  };
  Minimap.prototype.toggle = function () {
    this.user = !(!this.box.hidden);
    this.user = this.box.hidden;
    this.box.hidden = !this.user;
    this.t = 0;
  };
  Minimap.prototype.setWorld = function () {
    const st = this.game.sim.state;
    const maxW = window.innerWidth < 760 ? 150 : 200;
    const sc = Math.max(1, Math.floor(maxW / st.W * 2) / 2);
    this.cv.width = st.W * 2; this.cv.height = st.H * 2;
    this.cv.style.width = Math.round(Math.min(maxW, st.W * sc)) + 'px';
    this.cv.style.height = Math.round(Math.min(maxW, st.W * sc) * st.H / st.W) + 'px';
    this.t = 0;
  };

  Minimap.prototype.update = function (dt) {
    const want = this.wanted();
    if (this.box.hidden === want) this.box.hidden = !want;
    if (this.box.hidden) return;
    const g = this.game, st = g.sim && g.sim.state, R = g.renderer;
    if (!st || !R.mini) return;
    this.t -= dt;
    const c = this.ctx;
    if (this.t <= 0) {
      this.t = 0.5;
      c.imageSmoothingEnabled = false;
      c.drawImage(R.mini, 0, 0, st.W * 2, st.H * 2);
      // Gebiete
      const kt = R.kingTile, kc = R.kingColor;
      if (kt && kc) {
        for (let y = 0; y < st.H; y++) for (let x = 0; x < st.W; x++) {
          const k = kt[y * st.W + x];
          if (k < 0) continue;
          const tc = R.teamCss[kc.get(k) | 0];
          c.fillStyle = tc.main; c.globalAlpha = 0.55;
          c.fillRect(x * 2, y * 2, 2, 2);
        }
        c.globalAlpha = 1;
      }
      for (const city of st.cities) {
        c.fillStyle = '#0a1a21'; c.fillRect(city.cx * 2 - 2, city.cy * 2 - 2, 6, 6);
        c.fillStyle = '#f3ead2'; c.fillRect(city.cx * 2 - 1, city.cy * 2 - 1, 4, 4);
      }
      this.base = c.getImageData(0, 0, this.cv.width, this.cv.height);
    } else if (this.base) c.putImageData(this.base, 0, 0);
    // Sichtrahmen
    const cam = g.cam;
    const hw = cam.viewW / 2 / cam.zoom, hh = cam.viewH / 2 / cam.zoom;
    const x0 = (cam.x - hw) / 4, y0 = (cam.y - hh) / 4;
    c.strokeStyle = '#f2b541'; c.lineWidth = 2;
    c.strokeRect(Math.round(x0) + 1, Math.round(y0) + 1, Math.round(hw / 2), Math.round(hh / 2));
  };

  WW.UI = WW.UI || {};
  WW.UI.Minimap = Minimap;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
