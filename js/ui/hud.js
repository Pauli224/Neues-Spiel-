// Kopfleiste, Werkzeugleiste mit Kategorien und Optionen, Meldungen.
(function (WW) { 'use strict';
  const D = () => WW.UI.dom;

  const SPEEDS = [
    { v: 0, icon: 'i_pause', label: 'Pause', key: '0' },
    { v: 1, icon: 'i_play', label: '1×', key: '1' },
    { v: 2, label: '2×', key: '2' },
    { v: 4, label: '4×', key: '3' },
    { v: 5, label: '5×', key: '4' },
    { v: 10, label: '10×', key: '5' }
  ];

  function Hud(game) {
    this.game = game;
    this.cat = 'look';
    this.$ = (id) => document.getElementById(id);
    this.toastQueue = [];
    this.toastLast = 0;
    this.hintTimer = 0;
  }

  Hud.prototype.build = function () {
    const { h, icon, fillIcons } = D();
    const game = this.game;
    fillIcons(document);
    // Tempo
    const seg = this.$('speedSeg');
    // Desktop: alle Stufen; Handy: Pause + ein Knopf mit der aktuellen Stufe, der eine Leiste aufklappt
    this.speedBtns = SPEEDS.map(s => {
      const b = h('button.btn' + (s.v ? '.sp-lvl' : '.sp-pause'), { type: 'button', title: s.label + ' (Taste ' + s.key + ')', 'aria-label': s.label, 'aria-pressed': 'false',
        on: { click: () => game.setSpeed(s.v) } }, s.v ? h('span.lbl', s.label) : icon(s.icon, 22));
      seg.appendChild(b);
      return b;
    });
    this.spCur = h('button.btn.sp-cur', { type: 'button', 'aria-label': 'Tempo wählen', 'aria-expanded': 'false',
      on: { click: () => this.toggleSpeedPop() } }, h('span.lbl', '1×'));
    seg.appendChild(this.spCur);
    this.spPop = h('div.sp-pop.panel', { hidden: true, role: 'group', 'aria-label': 'Tempo' });
    this.popBtns = SPEEDS.filter(s => s.v).map(s => {
      const b = h('button.btn', { type: 'button', 'aria-pressed': 'false', on: { click: () => { game.setSpeed(s.v); this.toggleSpeedPop(false); } } }, h('span.lbl', s.label));
      this.spPop.appendChild(b);
      return { v: s.v, b: b };
    });
    seg.appendChild(this.spPop);
    document.addEventListener('pointerdown', (e) => { if (!this.spPop.hidden && !seg.contains(e.target)) this.toggleSpeedPop(false); });
    this.$('btnChron').addEventListener('click', () => game.ui.openChronicle());
    this.$('btnMenu').addEventListener('click', () => game.ui.openMenu());
    this.$('btnMap').addEventListener('click', () => game.ui.toggleMinimap());
    this.buildCats();
    this.pickCat('look', false);
    // Höhe der Werkzeugleiste für das Info-Fenster merken
    const tb = this.$('toolbar');
    const upd = () => document.documentElement.style.setProperty('--toolbar-h', tb.offsetHeight + 'px');
    if (window.ResizeObserver) new ResizeObserver(upd).observe(tb); else setInterval(upd, 500);
    upd();
  };

  // Kategorieleiste (neu aufbaubar, falls Werkzeuge nachgeladen werden)
  Hud.prototype.buildCats = function () {
    const { h, icon } = D();
    D().clear(this.$('catRow'));
    const cr = this.$('catRow');
    this.catBtns = {};
    for (const c of WW.UI.Tools.CATEGORIES) {
      const b = h('button.cat', { type: 'button', role: 'tab', 'aria-selected': 'false', title: c.name,
        on: { click: () => this.pickCat(c.id, true) } }, [icon(c.icon, 32), h('span.long', c.name), h('span.short', c.short || c.name)]);
      cr.appendChild(b);
      this.catBtns[c.id] = b;
    }
  };

  // Kategorie wählen; user = Klick (bei „Schauen" sofort Werkzeug)
  Hud.prototype.pickCat = function (id, user) {
    const c = WW.UI.Tools.CATEGORIES.find(x => x.id === id);
    if (!c) return;
    // erneutes Antippen der offenen Kategorie klappt die Werkzeugreihe zu
    if (user && this.cat === id && id !== 'look' && !this.$('toolRow').hidden) {
      this.$('toolRow').hidden = true; this.$('toolOpts').hidden = true;
      this.catBtns[id].setAttribute('aria-selected', 'false');
      if (this.game.tool.cat === id) this.game.setTool('inspect');
      this.cat = 'look'; this.catBtns.look.setAttribute('aria-selected', 'true');
      return;
    }
    this.cat = id;
    for (const k in this.catBtns) this.catBtns[k].setAttribute('aria-selected', k === id ? 'true' : 'false');
    if (c.direct) { this.game.setTool(c.direct); this.$('toolRow').hidden = true; this.renderOpts(); return; }
    this.renderTools();
    // erstes Werkzeug der Kategorie vorwählen, wenn noch keines aus ihr aktiv ist
    if (user && this.game.tool.cat !== id) {
      const first = WW.UI.Tools.inCat(id).find(t => t.kind !== 'sep' && t.kind !== 'action');
      if (first) this.game.setTool(first.id);
    }
  };

  Hud.prototype.renderTools = function () {
    const { h, icon, clear } = D();
    const row = this.$('toolRow');
    clear(row);
    this.toolBtns = {};
    let prevSep = true;
    for (const t of WW.UI.Tools.inCat(this.cat)) {
      if (t.requires && !(this.game.sim && this.game.sim.actions && this.game.sim.actions[t.requires])) continue;
      if (t.kind === 'sep') { if (t.label) row.appendChild(h('span.tool-group', t.label)); else if (!prevSep) row.appendChild(h('span.tool-sep')); prevSep = true; continue; }
      prevSep = false;
      const b = h('button.tool', { type: 'button', title: t.name, 'aria-pressed': this.game.toolId === t.id ? 'true' : 'false',
        on: { click: () => { if (t.kind === 'action') t.run(this.game); else this.game.setTool(t.id); } } },
      [icon(t.icon, 32, null, t.name), h('span', t.name)]);
      row.appendChild(b);
      this.toolBtns[t.id] = b;
    }
    row.hidden = false;
    row.scrollLeft = 0;
    this.renderOpts();
  };

  Hud.prototype.toolChanged = function () {
    const tool = this.game.tool;
    if (tool.cat !== this.cat) {
      this.cat = tool.cat;
      for (const k in this.catBtns) this.catBtns[k].setAttribute('aria-selected', k === tool.cat ? 'true' : 'false');
      if (tool.cat === 'look') this.$('toolRow').hidden = true; else this.renderTools();
    }
    if (this.toolBtns) for (const id in this.toolBtns) this.toolBtns[id].setAttribute('aria-pressed', id === tool.id ? 'true' : 'false');
    const btn = this.toolBtns && this.toolBtns[tool.id];
    if (btn && !this.$('toolRow').hidden) {
      const row = this.$('toolRow'), r = btn.getBoundingClientRect(), rr = row.getBoundingClientRect();
      if (rr.width > 0) {
        if (r.left < rr.left) row.scrollLeft -= rr.left - r.left + 24;
        else if (r.right > rr.right) row.scrollLeft += r.right - rr.right + 24;
      }
    }
    this.renderOpts();
    this.hint(tool.hint || '');
    this.game.canvas.classList.toggle('look', tool.kind === 'look');
  };

  // Unterzeile: Pinselgröße bzw. Volk und Startregierung
  Hud.prototype.renderOpts = function () {
    const { h, icon, clear } = D();
    const box = this.$('toolOpts');
    const tool = this.game.tool, o = this.game.opts;
    clear(box);
    box.classList.remove('lines');
    const chip = (label, ic, on, fn, title, team) => h('button.chip', { type: 'button', 'aria-pressed': on ? 'true' : 'false', title: title || label, on: { click: fn } },
      [ic ? icon(ic, /^u_/.test(ic) ? 30 : 24, team) : null, label ? h('span', label) : null]);
    if (tool.options === 'brush') {
      box.appendChild(h('span.opt-label', 'Pinsel'));
      const g = h('div.opt-group');
      for (const b of WW.UI.Tools.BRUSHES) g.appendChild(chip(b.label, b.icon, o.brush === b.id, () => { o.brush = b.id; this.renderOpts(); }, b.label + ' (' + b.name + ' Kacheln)'));
      box.appendChild(g);
    } else if (tool.options === 'settler') {
      const l1 = h('div.opt-line', [h('span.opt-label', 'Volk')]);
      l1.appendChild(chip('Passend', 'i_settlers', o.race === 'random', () => { o.race = 'random'; this.renderOpts(); }, 'Volk passend zum Gelände'));
      for (const rk of WW.RACE_KEYS) {
        const r = WW.RACES[rk];
        l1.appendChild(chip(r.name, 'u_' + rk + '_settler_0', o.race === rk, () => { o.race = rk; this.renderOpts(); }, r.name + ': ' + r.desc, 0));
      }
      const l2 = h('div.opt-line', [h('span.opt-label', 'Regierung')]);
      l2.appendChild(chip('Selbst wählen', 'b_question', !o.gov, () => { o.gov = null; this.renderOpts(); }, 'Startet als Stamm und wählt später selbst'));
      for (const gk of WW.GOV_KEYS) l2.appendChild(chip(WW.UI.Tools.get('gov_' + gk).name, 'i_gov_' + gk, o.gov === gk, () => { o.gov = gk; this.renderOpts(); }, WW.GOVERNMENTS[gk].name + ': ' + WW.GOVERNMENTS[gk].desc));
      box.appendChild(l1); box.appendChild(l2);
      box.classList.add('lines');
    } else if (tool.kind === 'pair') {
      const first = this.game.pairFirst != null ? this.game.sim.query.kingdom(this.game.pairFirst) : null;
      box.appendChild(h('span.opt-label', first ? 'Erstes Reich:' : 'Schritt 1: erstes Reich antippen'));
      if (first) {
        box.appendChild(h('span.chip', { 'aria-pressed': 'true' }, [icon('banner_' + (first.bannerPattern % 8), 22, first.colorIndex), h('span', first.name)]));
        box.appendChild(chip('Abbrechen', 'i_close', false, () => { this.game.pairFirst = null; this.renderOpts(); }));
      }
    }
    box.hidden = !box.firstChild;
  };

  Hud.prototype.hint = function (text, keep) {
    const el = this.$('toolHint');
    el.textContent = text || '';
    el.classList.remove('fade');
    clearTimeout(this.hintTimer);
    if (text && !keep) this.hintTimer = setTimeout(() => el.classList.add('fade'), 4200);
  };

  Hud.prototype.toggleSpeedPop = function (show) {
    if (show == null) show = this.spPop.hidden;
    this.spPop.hidden = !show;
    this.spCur.setAttribute('aria-expanded', show ? 'true' : 'false');
  };
  Hud.prototype.speedChanged = function (v) {
    SPEEDS.forEach((s, i) => this.speedBtns[i].setAttribute('aria-pressed', s.v === v ? 'true' : 'false'));
    this.lastSpeed = v || this.lastSpeed || 1;
    const cur = SPEEDS.find(s => s.v === this.lastSpeed) || SPEEDS[1];
    this.spCur.firstChild.textContent = cur.label;
    this.spCur.setAttribute('aria-pressed', v ? 'true' : 'false');
    for (const p of this.popBtns) p.b.setAttribute('aria-pressed', p.v === v ? 'true' : 'false');
  };

  // leere Welt: dezenter Hinweis, antippen wählt das Siedler-Werkzeug
  Hud.prototype.updateEmpty = function () {
    const sim = this.game.sim, el = this.$('emptyHint');
    const empty = sim && sim.state.cities.length === 0 && this.game.tool.id !== 'settlers' && !this.game.ui.modalOpen();
    if (empty && !el.firstChild) {
      const { h, icon } = D();
      el.appendChild(icon('i_settlers', 36));
      el.appendChild(h('span', [h('b', 'Noch wohnt hier niemand.'), 'Unter „Leben" Siedler aussetzen – hier tippen.']));
      el.addEventListener('click', () => { this.pickCat('life', true); this.game.setTool('settlers'); });
    }
    if (el.hidden === empty) el.hidden = !empty;
  };

  Hud.prototype.updateStats = function () {
    const sim = this.game.sim;
    if (!sim) return;
    const ws = sim.query.worldStats ? sim.query.worldStats() : { pop: sim.state.units.length, kingdoms: sim.state.kingdoms.length, year: sim.state.year };
    const set = (id, v) => { const el = this.$(id); const s = String(v); if (el.textContent !== s) el.textContent = s; };
    set('stYear', ws.year);
    set('stPop', D().fmt(ws.pop));
    set('stKing', ws.kingdoms);
    set('tbWorld', sim.state.worldName || '');
    this.updateEmpty();
  };

  // Meldung (Chronik-Eintrag oder Hinweis); ev mit x/y → antippen springt hin
  Hud.prototype.toast = function (text, opt) {
    const { h } = D();
    opt = opt || {};
    const box = this.$('toasts');
    const el = h('div.toast' + (opt.warn ? '.warn' : ''), { role: 'status' }, [opt.year != null ? h('span.yr', 'Jahr ' + opt.year) : null, h('span', text)]);
    el.addEventListener('click', () => { if (opt.onClick) opt.onClick(); el.remove(); });
    box.insertBefore(el, box.firstChild);
    while (box.children.length > (window.innerWidth < 760 ? 1 : 2)) box.lastChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, opt.ms || 5200);
  };

  WW.UI = WW.UI || {};
  WW.UI.Hud = Hud;
  WW.UI.SPEEDS = SPEEDS;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
