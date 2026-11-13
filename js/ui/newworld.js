// Bildschirm „Neue Welt": Live-Vorschau, Vorlagen mit Mini-Vorschau, Regler, Seed, Startreiche.
(function (WW) { 'use strict';
  const D = () => WW.UI.dom;

  const SL = {
    land: ['Landanteil', 'viel Meer', 'viel Land'], mountains: ['Gebirge', 'flach', 'zerklüftet'], forests: ['Wald', 'kahl', 'dicht'],
    rivers: ['Flüsse', 'trocken', 'viele'], temperature: ['Temperatur', 'kalt', 'heiß'], moisture: ['Feuchtigkeit', 'trocken', 'nass'],
    magic: ['Magie', 'keine', 'viel']
  };

  function randSeed() {
    const a = ['Quark', 'Knödel', 'Brösel', 'Gurke', 'Zipfel', 'Dackel', 'Wurst', 'Schnarch', 'Pudding', 'Rübe', 'Socke', 'Krümel'];
    const b = ['land', 'welt', 'tal', 'see', 'au', 'berg', 'reich', 'insel'];
    return a[(Math.random() * a.length) | 0] + b[(Math.random() * b.length) | 0] + ((Math.random() * 90 + 10) | 0);
  }

  // komplett zufällige Welt-Einstellungen (Vorlage, alle Regler); Größe bleibt
  function randomWorldOpts(seed, size) {
    const WG = WW.WorldGen;
    let r = null;
    if (typeof WG.randomOpts === 'function') { try { r = WG.randomOpts(seed); } catch (e) { r = null; } }
    if (!r) {
      const tpls = WG.TEMPLATES.filter(t => t.key !== 'random');
      r = { seed: seed, template: tpls[(Math.random() * tpls.length) | 0].key };
      for (const k of WG.SLIDERS) r[k] = Math.round(Math.random() * 100) / 100;
      if ('land' in r) r.land = Math.round((0.25 + Math.random() * 0.6) * 100) / 100;   // kaum Land macht keinen Spaß
    }
    const o = Object.assign({}, WG.DEFAULTS, r);
    o.seed = r.seed != null ? r.seed : seed;
    o.size = size || 'large';
    return o;
  }

  function NewWorld(game) {
    this.game = game;
    this.el = document.getElementById('newworld');
    this.o = randomWorldOpts(randSeed(), 'large');
    this.start = { count: 0, races: 'random', govs: 'mixed', animals: true };
    this.built = false;
    this.tplJob = 0;
  }

  NewWorld.prototype.open = function () {
    if (!this.built) this.build();
    this.rollAll();
    this.el.hidden = false;
    this.game.paused = true;
    this.redraw();
    this.queueTemplates();
  };
  // „Alles würfeln": neuer Seed, Vorlage und alle Regler; Größe bleibt
  NewWorld.prototype.rollAll = function () {
    const n = randomWorldOpts(randSeed(), this.o.size);
    for (const k in n) this.o[k] = n[k];
    this.applyUi();
    this.sync(true);
  };
  NewWorld.prototype.applyUi = function () {
    if (!this.built) return;
    this.seedIn.value = String(this.o.seed);
    for (const k in this.sliders) {
      const v = Math.round((this.o[k] == null ? 0.5 : this.o[k]) * 100);
      this.sliders[k].inp.value = String(v); this.sliders[k].val.textContent = v + ' %';
    }
  };
  NewWorld.prototype.close = function () { this.el.hidden = true; this.game.paused = false; };

  NewWorld.prototype.build = function () {
    const { h, icon } = D();
    const o = this.o, s = this.start;
    this.built = true;
    this.cv = h('canvas');
    this.nameEl = h('div.nw-name');
    this.tplBox = h('div.nw-tpls');
    this.tplBtns = {};
    for (const t of WW.WorldGen.TEMPLATES) {
      const c = h('canvas', { width: 72, height: 48 });
      const b = h('button.tpl', { type: 'button', title: t.desc, 'aria-pressed': o.template === t.key ? 'true' : 'false', on: { click: () => { o.template = t.key; o.themeName = null; this.sync(); } } }, [c, h('span', t.name)]);
      b._cv = c; this.tplBtns[t.key] = b;
      this.tplBox.appendChild(b);
    }
    const side = h('div.nw-side.panel');
    // Seed
    this.seedIn = h('input', { type: 'text', value: String(o.seed), 'aria-label': 'Seed', spellcheck: 'false', autocomplete: 'off',
      on: { input: () => { o.seed = this.seedIn.value.trim() || '1'; this.sync(true); } } });
    side.appendChild(h('button.btn.roll', { type: 'button', title: 'Neuer Seed, zufällige Landform und alle Regler neu',
      on: { click: () => this.rollAll() } }, [icon('i_newworld', 28), h('span', 'Alles würfeln')]));
    side.appendChild(h('h3', 'Seed'));
    side.appendChild(h('div.seed-row', [this.seedIn, h('button.btn', { type: 'button', title: 'Nur einen neuen Seed, Landform und Regler bleiben',
      on: { click: () => { o.seed = randSeed(); this.seedIn.value = o.seed; this.sync(true); } } }, h('span', 'Nur neuer Seed'))]));
    // Größe
    side.appendChild(h('h3', 'Größe'));
    this.sizeBtns = {};
    const sz = h('div.chips');
    for (const z of WW.WorldGen.SIZES) {
      const b = h('button.chip', { type: 'button', 'aria-pressed': o.size === z.key ? 'true' : 'false', title: z.w + ' × ' + z.h + ' Kacheln',
        on: { click: () => { o.size = z.key; this.sync(); } } }, h('span', z.name));
      this.sizeBtns[z.key] = b; sz.appendChild(b);
    }
    side.appendChild(sz);
    // Regler
    side.appendChild(h('h3', 'Landschaft'));
    this.sliders = {};
    for (const k of WW.WorldGen.SLIDERS) {
      const d = SL[k] || [k, '', ''];
      const val = h('em');
      const inp = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(o[k] * 100)), 'aria-label': d[0],
        on: { input: () => { o[k] = inp.value / 100; o.themeName = null; val.textContent = inp.value + ' %'; this.sync(false, true); } } });
      val.textContent = inp.value + ' %';
      this.sliders[k] = { inp: inp, val: val };
      side.appendChild(h('div.slider', [h('div.sl-top', [h('span', d[0]), val]), inp, h('div.sl-ends', [h('span', d[1]), h('span', d[2])])]));
    }
    // Startreiche
    side.appendChild(h('h3', 'Startreiche'));
    this.countEl = h('b');
    this.countTxt = h('span.count-txt');
    this.startOpts = h('div.start-opts');
    const upd = () => {
      this.countEl.textContent = s.count;
      this.countTxt.textContent = s.count ? (s.count === 1 ? 'Reich startet sofort' : 'Reiche starten sofort') : 'keine (leere Welt)';
      this.countTxt.classList.toggle('on', !s.count);
      this.startOpts.classList.toggle('dim', !s.count);
    };
    side.appendChild(h('div.stepper', [
      h('button.btn', { type: 'button', 'aria-label': 'Weniger', on: { click: () => { s.count = Math.max(0, s.count - 1); upd(); } } }, '–'),
      this.countEl,
      h('button.btn', { type: 'button', 'aria-label': 'Mehr', on: { click: () => { s.count = Math.min(8, s.count + 1); upd(); } } }, '+'),
      this.countTxt]));
    upd();
    const opts = (label, list, get, set) => {
      const box = h('div.chips');
      const render = () => {
        D().clear(box);
        for (const it of list) box.appendChild(h('button.chip', { type: 'button', 'aria-pressed': get() === it[0] ? 'true' : 'false',
          on: { click: () => { set(it[0]); render(); } } }, [it[2] ? icon(it[2], 22, 0) : null, h('span', it[1])]));
      };
      render();
      const tgt = label === 'Tiere' ? side : this.startOpts;
      tgt.appendChild(h('div.muted', { style: { margin: '10px 0 5px' } }, label));
      tgt.appendChild(box);
    };
    side.appendChild(this.startOpts);
    opts('Völker', [['random', 'Passend zum Land', 'i_settlers']].concat(WW.RACE_KEYS.map(r => [r, WW.RACES[r].name, 'u_' + r + '_settler_0'])),
      () => s.races, (v) => { s.races = v; });
    opts('Regierungen', [['mixed', 'Verschiedene'], ['tribe', 'Alle als Stamm']], () => s.govs, (v) => { s.govs = v; });
    side.appendChild(h('h3', 'Natur'));
    opts('Tiere', [[true, 'Mit Tieren'], [false, 'Keine Tiere']], () => s.animals, (v) => { s.animals = v; });

    const main = h('div.nw-main', [h('div.nw-prev', [h('div.nw-canvas-wrap.panel', [this.cv]), this.nameEl, this.tplBox]), side]);
    this.el.appendChild(h('div.nw-head', [h('h2', 'Neue Welt'), h('button.btn.icon', { type: 'button', 'aria-label': 'Schließen', on: { click: () => this.close() } }, icon('i_close', 28))]));
    this.el.appendChild(main);
    this.el.appendChild(h('div.nw-foot', [h('span.muted', 'Gleicher Seed und gleiche Regler ergeben immer dieselbe Welt.'),
      h('button.btn', { type: 'button', on: { click: () => this.close() } }, 'Abbrechen'),
      h('button.btn.primary', { type: 'button', on: { click: () => this.create() } }, [icon('i_newworld', 24), h('span', 'Welt erschaffen')])]));
  };

  // Regleränderungen: Vorschau sofort (gedrosselt auf ein Bild), Vorlagen-Kacheln verzögert
  NewWorld.prototype.sync = function (tpls, fromSlider) {
    const o = this.o;
    for (const k in this.tplBtns) this.tplBtns[k].setAttribute('aria-pressed', k === o.template ? 'true' : 'false');
    for (const k in this.sizeBtns) this.sizeBtns[k].setAttribute('aria-pressed', k === o.size ? 'true' : 'false');
    if (!this.raf) this.raf = requestAnimationFrame(() => { this.raf = 0; this.redraw(); });
    if (tpls || fromSlider) { clearTimeout(this.tplT); this.tplT = setTimeout(() => this.queueTemplates(), 350); }
  };

  NewWorld.prototype.redraw = function () {
    const wrap = this.cv.parentNode;
    const mw = Math.max(200, (wrap.clientWidth || 600) - 16), mh = Math.max(120, (wrap.clientHeight || 400) - 16);
    const size = WW.WorldGen.SIZES.find(z => z.key === this.o.size) || WW.WorldGen.SIZES[1];
    const sc = Math.max(1, Math.floor(Math.min(mw / size.w, mh / size.h)));
    const p = WW.WorldGen.preview(this.o, size.w, size.h, { shade: true, spots: false });
    this.cv.width = p.w; this.cv.height = p.h;
    this.cv.getContext('2d').putImageData(new ImageData(p.rgba, p.w, p.h), 0, 0);
    const fit = Math.min(mw / p.w, mh / p.h);
    const s2 = fit >= 1 ? Math.max(sc, Math.floor(fit)) : fit;
    this.cv.style.width = Math.floor(p.w * s2) + 'px'; this.cv.style.height = Math.floor(p.h * s2) + 'px';
    this.world = p.world;
    const tpl = WW.WorldGen.TEMPLATES.find(t => t.key === this.o.template);
    D().clear(this.nameEl);
    const theme = this.o.themeName;
    if (theme || tpl) this.nameEl.appendChild(D().h('span.nw-theme', (theme ? theme + ' · ' : '') + (tpl ? tpl.name : '')));
    this.nameEl.appendChild(document.createTextNode(p.world.name || 'Namenlose Welt'));
    this.nameEl.appendChild(D().h('small', (tpl ? tpl.desc : '') + ' · ' + p.world.W + '\u00a0×\u00a0' + p.world.H));
  };

  // Mini-Vorschau je Vorlage, eine pro Bild (kleine Welt, gleiche Regler)
  NewWorld.prototype.queueTemplates = function () {
    const job = ++this.tplJob;
    const list = WW.WorldGen.TEMPLATES.filter(t => t.key !== 'random');
    let i = 0;
    const step = () => {
      if (job !== this.tplJob || this.el.hidden || i >= list.length) return;
      const t = list[i++];
      const o = Object.assign({}, this.o, { template: t.key, size: 'small' });
      const w = WW.WorldGen.generate(o);
      const p = WW.WorldGen.render(w, 72, 48, { shade: true });
      const c = this.tplBtns[t.key]._cv;
      c.width = p.w; c.height = p.h;
      c.getContext('2d').putImageData(new ImageData(p.rgba, p.w, p.h), 0, 0);
      setTimeout(step, 16);
    };
    step();
    const rc = this.tplBtns.random && this.tplBtns.random._cv;
    if (rc) { const x = rc.getContext('2d'); x.fillStyle = '#1d4473'; x.fillRect(0, 0, 72, 48); x.fillStyle = '#f2b541'; x.font = 'bold 28px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 36, 25); }
  };

  NewWorld.prototype.create = function () {
    const world = this.world && this.world.opts && String(this.world.opts.seed) === String(this.o.seed) ? this.world : WW.WorldGen.generate(this.o);
    this.close();
    this.game.newWorld({ world: world, seed: this.o.seed, populate: this.start.count, races: this.start.races, govs: this.start.govs, animals: this.start.animals });
  };

  WW.UI = WW.UI || {};
  WW.UI.NewWorld = NewWorld;
  WW.UI.randSeed = randSeed;
  WW.UI.randomWorldOpts = randomWorldOpts;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
