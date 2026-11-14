// Info-Fenster (Reich, Stadt, Bewohner, Tier) und Dialoge (Menü, Chronik, Gesetze, Laden, Bestätigen, Willkommen).
(function (WW) { 'use strict';
  const D = () => WW.UI.dom;

  function Panels(game) {
    this.game = game;
    this.sel = null;
    this.$ = (id) => document.getElementById(id);
    this.ptrInInfo = false;
    this.lastSig = '';
  }

  Panels.prototype.build = function () {
    const info = this.$('info');
    this.$('infoClose').addEventListener('click', () => this.closeInfo());
    info.addEventListener('pointerdown', () => { this.ptrInInfo = true; });
    window.addEventListener('pointerup', () => { setTimeout(() => { this.ptrInInfo = false; }, 0); });
    // Blatt am Handy nach unten wischen schließt
    const grip = this.$('infoGrip');
    let gy = null;
    grip.addEventListener('pointerdown', (e) => { gy = e.clientY; try { grip.setPointerCapture(e.pointerId); } catch (er) { /* egal */ } });
    grip.addEventListener('pointermove', (e) => { if (gy != null) info.style.transform = 'translateY(' + Math.max(0, e.clientY - gy) + 'px)'; });
    const end = (e) => { if (gy == null) return; const d = e.clientY - gy; gy = null; info.style.transform = ''; if (d > 60) this.closeInfo(); };
    grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
    // Dialog
    this.$('modalClose').addEventListener('click', () => this.closeModal());
    this.$('modal').addEventListener('pointerdown', (e) => { if (e.target === this.$('modal')) this.closeModal(); });
  };

  // ------------------------------------------------------------------ Info-Fenster
  Panels.prototype.showInfo = function (sel) {
    if (!this.sel || this.sel.kind !== sel.kind || this.sel.id !== sel.id) this.game.uiSound('select');
    this.sel = sel;
    this.lastSig = '';
    this.$('info').hidden = false;
    this.$('infoBody').scrollTop = 0;
    this.refreshInfo(true);
  };
  Panels.prototype.closeInfo = function () {
    this.sel = null;
    this.$('info').hidden = true;
    this.game.select = null;
  };

  // neu zeichnen, wenn sich etwas Sichtbares geändert hat (nicht während eines Tipps ins Fenster)
  Panels.prototype.refreshInfo = function (force) {
    if (!this.sel || this.$('info').hidden) return;
    if (this.ptrInInfo && !force) return;
    const sim = this.game.sim, q = sim.query, s = this.sel;
    let obj = null;
    if (s.kind === 'kingdom') obj = q.kingdom(s.id);
    else if (s.kind === 'city') obj = q.city(s.id);
    else if (s.kind === 'unit') obj = q.unit(s.id);
    else if (s.kind === 'animal') obj = q.animal ? q.animal(s.id) : null;
    else obj = this.thingOf(s);
    if (!obj || obj.dead) {
      this.renderGone(s);
      return;
    }
    const thing = ['battle', 'site', 'ship', 'train', 'struct'].indexOf(s.kind) >= 0;
    const sig = thing ? this.thingSig(s, obj) : this.signature(s.kind, obj);
    if (!force && sig === this.lastSig) return;
    this.lastSig = sig;
    const body = this.$('infoBody'), top = body.scrollTop;
    D().clear(body); D().clear(this.$('infoTitle'));
    if (s.kind === 'kingdom') this.renderKingdom(obj);
    else if (s.kind === 'city') this.renderCity(obj);
    else if (s.kind === 'unit') this.renderUnit(obj);
    else if (thing) this.renderThing(s, obj);
    else this.renderAnimal(obj);
    body.scrollTop = top;
  };

  Panels.prototype.signature = function (kind, o) {
    if (kind === 'kingdom') {
      const st = this.game.sim.query.kingdomStats(o.id) || {};
      const rel = Object.keys(o.relations).map(k => k + ':' + o.relations[k].status + ':' + Math.round(o.relations[k].opinion / 5)).join(',');
      return [o.name, o.gov, o.govLocked, o.leaderName, o.cityIds.join(','), st.pop, st.soldiers, Math.round(st.happiness), rel, this.game.sim.state.kingdoms.length, Math.round(o.nature || 0), Math.round(o.pollution || 0), JSON.stringify(o.laws || null), modSig(o, this.game.sim), JSON.stringify(o.ruler || null), plotSig(this.game.sim)].join('|');
    }
    if (kind === 'city') {
      const w = o.wall || {};
      if (o.kind === 'camp') return ['camp', o.name, o.kingdomId, o.inmates, o.pows, o.guards, o.guardsWant, o.cap, Math.round(o.campUnrest || 0), JSON.stringify(o.powFrom || {}), JSON.stringify(o.campOut || {}), o.station, o.railLine].join('|');
      return [o.name, o.kingdomId, o.tier, o.pop, o.housing, o.culture, o.garrison, o.garrisonWant, o.garrisonSet, JSON.stringify(o.occupied || null), Math.floor(o.stock.food), Math.floor(o.stock.wood), Math.floor(o.stock.stone), Math.floor(o.stock.gold),
        Math.round(o.happiness), w.level, w.built, w.total, w.state, o.hungry, o.revolt, Math.round((o.loyalty || 0) * 100), Math.round(o.nature || 0), Math.round(o.pollution || 0), modSig(o, this.game.sim), (function (cs) { return cs ? [cs.stage, cs.upgrading, Math.round((cs.progress || 0) * 50)].join(',') : ''; })(this.game.sim.query.struct ? this.game.sim.query.struct(o.centerId) : null), JSON.stringify(o.governor || null), plotSig(this.game.sim)].join('|');
    }
    if (kind === 'unit') return [o.role, o.age, Math.round(o.hp), o.carrying, o.sick, o.cityId, o.kingdomId, o.task, o.name, o.campState, o.camp, o.pow, o.garrison, o.ind, o.escortN].join('|');
    return [o.kind, Math.round(o.hp)].join('|');
  };

  Panels.prototype.title = function (iconEl, text, sub) {
    const { h } = D();
    const t = this.$('infoTitle');
    D().clear(t);
    if (iconEl) t.appendChild(iconEl);
    t.appendChild(h('div', { style: { minWidth: '0' } }, [h('div.t', text), sub ? h('span.sub', sub) : null]));
  };

  Panels.prototype.renderGone = function (s) {
    const { h } = D();
    const body = this.$('infoBody');
    if (this.lastSig === 'gone') return;
    this.lastSig = 'gone';
    D().clear(body);
    if (s.kind === 'battle') {
      // Schlacht vorbei: Schlachtfeld-Ort zeigen, falls es ihn gibt
      const st = this.game.sim.state, site = Array.isArray(st.sites) ? st.sites.slice().reverse().find(o => o && Math.abs(o.x - (s.x || 0)) < 4 && Math.abs(o.y - (s.y || 0)) < 4) : null;
      if (site) { this.sel = { kind: 'site', id: site.id }; this.lastSig = ''; this.refreshInfo(true); return; }
      this.title(null, 'Die Schlacht ist vorbei');
      body.appendChild(h('p.muted', 'Die Heere haben sich getrennt. Die Chronik nennt Sieger und Verluste.'));
      return;
    }
    this.title(null, s.kind === 'kingdom' ? 'Reich untergegangen' : s.kind === 'city' ? 'Stadt verschwunden' : s.kind === 'ship' ? 'Schiff verschwunden' : 'Nicht mehr da');
    body.appendChild(h('p.muted', s.kind === 'unit' ? 'Diese Figur weilt nicht mehr unter uns. Die Chronik weiß vielleicht mehr.' : s.kind === 'ship' ? 'Gesunken oder abgewrackt. Die Chronik weiß mehr.' : 'Davon ist nur noch eine Erinnerung übrig.'));
  };

  function modSig(o, sim) {
    if (!WW.Mods || typeof WW.Mods.list !== 'function') return '';
    try { const l = WW.Mods.list(o, sim); return Array.isArray(l) ? l.map(m => (m.key || m.name) + ':' + (m.until || m.yearsLeft || '')).join(',') : ''; } catch (e) { return ''; }
  }
  function stageName(cs, k) {
    if (cs.stage === 0) return 'Lager';
    if (cs.stage === 1) return 'Dorfhalle';
    const g = k ? WW.GOVERNMENTS[k.gov] : null;
    return (g && g.centerName) || 'Regierungssitz';
  }
  function natureBlock(v) {
    const { h } = D();
    if (typeof v !== 'number') return null;
    const p = Math.max(0, Math.min(100, v));
    return h('div.sec', [h('h3', 'Natur'), h('div.barline', [h('span', p >= 70 ? 'unberührt' : p >= 40 ? 'genutzt' : p >= 20 ? 'gerupft' : 'kahl geschlagen'), h('b', Math.round(p) + ' %')]), happyBar(p)]);
  }
  function airBlock(v) {
    const { h, icon } = D();
    if (typeof v !== 'number') return null;
    const p = Math.max(0, Math.min(100, v));
    return h('div.sec', [h('h3', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [WW.Sprites.has('i_pollution') ? icon('i_pollution', 18) : null, 'Luft']),
      h('div.barline', [h('span', p < 15 ? 'frisch' : p < 40 ? 'etwas dunstig' : p < 70 ? 'dicke Luft' : 'man sieht die Hand nicht'), h('b', Math.round(p) + ' % verschmutzt')]),
      h('div.bar' + (p >= 60 ? '.bad' : p >= 30 ? '.warn' : ''), [h('b', { style: { width: Math.max(2, p) + '%' } })])]);
  }
  function factoryList(sim, pred) {
    const { h } = D();
    const by = {};
    let n = 0, filt = 0;
    for (const s of sim.state.structs) {
      if (s.type !== 'factory' || s.dead || !pred(s)) continue;
      n++; if (s.filtered) filt++;
      by[s.kind || '?'] = (by[s.kind || '?'] || 0) + 1;
    }
    if (!n) return null;
    const FN = (WW.INDUSTRY && WW.INDUSTRY.KINDS) || WW.FACTORY_KINDS || {};
    const nm = (k) => { const v = FN[k]; return (v && (v.name || v)) || k; };
    return h('div.sec', [h('h3', 'Fabriken'), h('div', Object.keys(by).map(k => nm(k) + ' ×' + by[k]).join(' · ')),
      h('div.muted', { style: { marginTop: '4px' } }, filt === n ? 'Alle mit Filter' : filt ? filt + ' von ' + n + ' mit Filter' : 'Ohne Filter')]);
  }
  const NATURE_WAY = { exploit: 'rücksichtslos', use: 'nutzt sie', care: 'schont sie' };
  function plotSig(sim) { const p = sim.state.plots; return Array.isArray(p) ? p.map(x => x && Math.round((x.progress || 0) * 20)).join(',') : ''; }
  function happyBar(v) {
    const { h } = D();
    const p = Math.max(0, Math.min(100, v));
    return h('div.bar' + (p < 30 ? '.bad' : p < 55 ? '.warn' : ''), [h('b', { style: { width: p + '%' } })]);
  }
  function cultureBlock(key) {
    const { h, icon } = D();
    const C = WW.CULTURES && key ? WW.CULTURES[key] : null;
    if (!C) return null;
    return h('div.sec', [h('h3', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [WW.Sprites.has('i_culture') ? icon('i_culture', 18) : null, 'Kultur: ' + C.name]),
      C.note ? h('div.muted', C.note) : null,
      Array.isArray(C.bonusText) && C.bonusText.length ? h('ul.pc', C.bonusText.map(t => h('li.p', t))) : null]);
  }
  function moodWord(v) { return v >= 75 ? 'glücklich' : v >= 55 ? 'zufrieden' : v >= 35 ? 'grantig' : v >= 18 ? 'wütend' : 'kurz vorm Aufstand'; }
  function opinionWord(v) { return v >= 50 ? 'herzlich' : v >= 20 ? 'freundlich' : v > -20 ? 'neutral' : v > -50 ? 'frostig' : 'feindselig'; }
  const STATUS = { war: 'Krieg', peace: 'Frieden', alliance: 'Bündnis' };

  // Werte einer Person (Statthalter, Herrscher): Zahlen 1–5 als Punkte, Eigenart als Text
  const STAT_NAMES = { war: 'Kriegskunst', diplo: 'Diplomatie', admin: 'Verwaltung', skill: 'Geschick', loyalty: 'Treue', ambition: 'Ehrgeiz', charisma: 'Ausstrahlung' };
  const SKIP = { id: 1, since: 1, female: 1 };
  function pips(v) {
    const { h } = D();
    const n = Math.max(0, Math.min(5, Math.round(v)));
    return h('span', { style: { letterSpacing: '1px', fontFamily: 'var(--font-pixel)' }, title: n + ' von 5' }, [h('span', { style: { color: 'var(--bernstein)' } }, '■'.repeat(n)), h('span', { style: { color: 'var(--pult-hell)' } }, '■'.repeat(5 - n))]);
  }
  function personBlock(title, p, name) {
    const { h } = D();
    if (!p || typeof p !== 'object') return null;
    const kv = h('dl.kv');
    for (const k in p) {
      const v = p[k];
      if (SKIP[k] || /Id$/.test(k) || k.charAt(0) === '_' || typeof v !== 'number') continue;
      kv.appendChild(h('dt', STAT_NAMES[k] || (k.charAt(0).toUpperCase() + k.slice(1))));
      kv.appendChild(h('dd', v >= 0 && v <= 5 ? pips(v) : String(Math.round(v))));
    }
    const nm = name || p.name || '';
    const quirk = typeof p.quirk === 'string' ? p.quirk : (p.quirk && p.quirk.name) || '';
    return h('div.sec', [h('h3', title), nm ? h('div', { style: { fontWeight: '700', marginBottom: '4px' } }, nm) : null,
      quirk ? h('div.muted', { style: { marginBottom: '4px' } }, 'Eigenart: ' + quirk) : null, kv.firstChild ? kv : null]);
  }
  function plotsFor(sim, pred) {
    const pl = sim.state.plots;
    if (!Array.isArray(pl)) return [];
    return pl.filter(p => p && pred(p));
  }
  function plotText(sim, p) {
    const k = sim.query.kingdom(p.targetId), c = sim.query.city(p.cityId) || sim.query.city(p.targetId);
    switch (p.type) {
      case 'war': return 'Rüstet zum Krieg' + (k ? ' gegen ' + k.name : '');
      case 'alliance': return 'Bündnis' + (k ? ' mit ' + k.name : '') + ' in Arbeit';
      case 'revolt': return 'Aufstand' + (c ? ' in ' + c.name : '') + ' gärt';
      case 'secession': return (c ? c.name : 'Eine Stadt') + ' will sich abspalten';
      default: return p.text || p.name || 'Vorhaben';
    }
  }
  function plotList(sim, list) {
    const { h } = D();
    return h('div', list.map(p => {
      const v = Math.round(100 * Math.max(0, Math.min(1, +p.progress || 0)));
      return h('div', { style: { marginBottom: '6px' } }, [h('div.barline', [h('span', plotText(sim, p)), h('b', v + ' %')]),
        h('div.bar' + (p.type === 'alliance' ? '' : '.warn'), [h('b', { style: { width: v + '%' } })])]);
    }));
  }
  Panels.prototype.renderKingdom = function (k) {
    const { h, icon } = D();
    const game = this.game, sim = game.sim, body = this.$('infoBody');
    const g = WW.GOVERNMENTS[k.gov];
    const race = WW.RACES[k.race];
    this.title(icon('banner_' + (k.bannerPattern % 8), 30, k.colorIndex), k.name, (race ? race.name : '') + ' · gegründet Jahr ' + (k.founded | 0));
    { const em = emblem(k.gov, 18); if (em) { const t = this.$('infoTitle').querySelector('.sub'); if (t) { em.style.verticalAlign = 'middle'; em.style.marginRight = '4px'; t.insertBefore(em, t.firstChild); } } }
    const ks = sim.query.kingdomStats(k.id) || { pop: 0, cities: 0, soldiers: 0, happiness: 0 };
    // Anführer
    const leader = k.leaderId >= 0 ? sim.query.unit(k.leaderId) : null;
    body.appendChild(h('div.sec', [
      h('h3', 'Anführung'),
      g.noLeader ? h('div.muted', 'Kein Anführer: Das Plenum tagt. Und tagt. Und tagt.')
        : h('div', [leader ? h('button.link', { type: 'button', on: { click: () => game.selectUnit(leader.id, true) } }, (k.leaderTitle ? k.leaderTitle + ' ' : '') + k.leaderName)
          : h('span.muted', 'Thron gerade leer')]),
      k.deity ? h('div.muted', { style: { marginTop: '4px' } }, 'Gottheit: ' + k.deity) : null,
      k.policy && k.policy.party ? h('div.muted', { style: { marginTop: '4px' } }, 'Regierungspartei: ' + k.policy.party) : null,
      k.policy && k.policy.plan ? h('div.muted', { style: { marginTop: '4px' } }, 'Fünfjahresplan: ' + (k.policy.plan.goal || k.policy.plan.focus)) : null
    ]));
    const rs = k.ruler && (k.ruler.leaderId == null || k.ruler.leaderId === k.leaderId) ? k.ruler : null;
    if (rs && !g.noLeader) { const b = personBlock('Herrscherwerte', rs, ''); if (b) body.appendChild(b); }
    const kp = plotsFor(sim, p => p.kingdomId === k.id || ((p.type === 'war' || p.type === 'alliance') && p.targetId === k.id));
    if (kp.length) body.appendChild(h('div.sec', [h('h3', 'Vorhaben'), plotList(sim, kp)]));
    const veh = (WW.Military && typeof WW.Military.vehiclesOf === 'function') ? (function () { try { return WW.Military.vehiclesOf(sim, k.id) || []; } catch (e) { return []; } })() : [];
    const nTank = veh.filter(u => u.role === 'tank').length, nGun = veh.length - nTank;
    const ns = sim.query.navalStats ? (function () { try { return sim.query.navalStats(k.id); } catch (e) { return null; } })() : null;
    const nShips = ns && ns.ships ? Object.keys(ns.ships).reduce((a, x) => a + (ns.ships[x] | 0), 0) : 0;
    body.appendChild(h('div.sec', [
      h('dl.kv', [h('dt', 'Einwohner'), h('dd', String(ks.pop)), h('dt', 'Städte'), h('dd', String(ks.cities)), h('dt', 'Soldaten'), h('dd', String(ks.soldiers)),
        veh.length ? h('dt', 'Fahrzeuge') : null, veh.length ? h('dd', [nTank ? nTank + ' Panzer' : '', nGun ? nGun + ' Geschütze' : ''].filter(Boolean).join(', ')) : null,
        nShips ? h('dt', 'Schiffe') : null, nShips ? h('dd', String(nShips)) : null,
        k.powsHeld ? h('dt', 'hält gefangen') : null, k.powsHeld ? h('dd', k.powsHeld + ' Soldaten') : null,
        k.powsLost ? h('dt', 'in fremder Haft') : null, k.powsLost ? h('dd', k.powsLost + ' eigene Soldaten') : null,
        h('dt', 'Stimmung'), h('dd', moodWord(ks.happiness))]),
      happyBar(ks.happiness)
    ]));
    { const cb = cultureBlock(k.culture); if (cb) body.appendChild(cb); }
    // Regierungs-Karte
    const card = h('div.govcard', [
      h('div.gh', [icon('i_gov_' + k.gov, 44), h('div', [h('div.gn', g.name), h('div.gt', (g.titleM ? g.titleM + ' / ' + g.titleF : 'ohne Anführer') + ' · ' + (g.centerName || ''))])]),
      h('p', '„' + g.desc + '"'),
      h('ul.pc', (g.pros || []).map(t => h('li.p', t)).concat((g.cons || []).map(t => h('li.c', t)))),
      g.nature && NATURE_WAY[g.nature] ? h('div.muted', { style: { marginTop: '6px' } }, 'Umgang mit der Natur: ' + NATURE_WAY[g.nature]) : null
    ]);
    const grid = h('div.govgrid');
    for (const gk of WW.GOV_KEYS) {
      const gg = WW.GOVERNMENTS[gk];
      grid.appendChild(h('button.btn', { type: 'button', title: gg.name + ': ' + gg.desc, 'aria-pressed': gk === k.gov ? 'true' : 'false',
        on: { click: () => game.setGov(k.id, gk) } }, [icon('i_gov_' + gk, 26), h('span', WW.UI.Tools.get('gov_' + gk) ? WW.UI.Tools.get('gov_' + gk).name : gg.name)]));
    }
    const lock = h('div.lockrow', [
      h('button.btn' + (k.govLocked ? '.on' : ''), { type: 'button', 'aria-pressed': k.govLocked ? 'true' : 'false',
        on: { click: () => { sim.actions.setGovLocked(k.id, !k.govLocked); this.refreshInfo(true); } } },
      [icon(k.govLocked ? 'i_lock' : 'i_unlock', 22), h('span', k.govLocked ? 'Fixiert' : 'Frei')]),
      h('span', k.govLocked ? 'Bleibt so, bis du es änderst.' : (sim.state.laws.govChanges ? 'Darf sich von selbst ändern.' : 'Ändert sich nicht (Weltgesetz aus).'))
    ]);
    body.appendChild(h('div.sec', [h('h3', 'Regierung'), card, grid, lock]));
    { const nb = natureBlock(k.nature); if (nb) body.appendChild(nb); }
    { const lb = this.realmLaws(k); if (lb) body.appendChild(lb); }
    { const ab = airBlock(k.pollution); if (ab) body.appendChild(ab); }
    { const fb = factoryList(sim, s => k.cityIds.indexOf(s.cityId) >= 0); if (fb) body.appendChild(fb); }
    { const mb = this.modsBlock(k); if (mb) body.appendChild(mb); }
    // Städte
    const cl = h('div.citylist');
    for (const cid of k.cityIds) {
      const c = sim.query.city(cid);
      if (!c) continue;
      cl.appendChild(h('button.btn', { type: 'button', on: { click: () => game.selectCity(c.id, true) } },
        [h('span', c.name + (cid === k.capitalId ? ' ★' : '')), h('span.muted', (WW.CITY_TIERS[c.tier] || {}).name + ' · ' + c.pop)]));
    }
    body.appendChild(h('div.sec', [h('h3', 'Städte'), cl]));
    // Beziehungen
    const rel = h('div.rel');
    const others = sim.state.kingdoms.filter(o => o.id !== k.id);
    for (const o of others) {
      const r = k.relations[o.id];
      if (!r) continue;
      const row = h('div.relrow', [
        h('div.rt', [icon('banner_' + (o.bannerPattern % 8), 22, o.colorIndex),
          h('button.link.nm', { type: 'button', on: { click: () => game.selectKingdom(o.id, true) } }, o.name),
          r.forced ? h('span', { title: 'Von dir erzwungen: endet nicht von selbst', style: { display: 'inline-flex' } }, icon('i_lock', 18)) : null,
          h('span.badge.' + r.status, STATUS[r.status] || r.status)]),
        r.forced ? h('div.op', 'Von dir erzwungen – endet nicht von selbst.') : null,
        h('div.op', 'Meinung ' + (r.opinion > 0 ? '+' : '') + Math.round(r.opinion) + ' (' + opinionWord(r.opinion) + ') · ' + WW.GOVERNMENTS[o.gov].name),
        h('div.rbtns', [['war', 'Krieg', 'i_war', '.danger'], ['peace', 'Frieden', 'i_peace', ''], ['alliance', 'Bündnis', 'i_alliance', '.good']].map(b =>
          h('button.btn' + (r.status === b[0] ? '' : b[3]), { type: 'button', 'aria-pressed': r.status === b[0] ? 'true' : 'false', disabled: r.status === b[0],
            on: { click: () => game.setRelation(k.id, o.id, b[0]) } }, [icon(b[2], 20), h('span', b[1])])))
      ]);
      rel.appendChild(row);
    }
    if (!others.length) rel.appendChild(h('div.muted', 'Noch allein auf der Welt. Setze Siedler aus, um Nachbarn zu bekommen.'));
    body.appendChild(h('div.sec', [h('h3', 'Beziehungen'), rel]));
  };

  // Reichsgesetze: geltende als Liste, alle als Schalter (unzulässige ausgegraut)
  Panels.prototype.realmLaws = function (k) {
    const { h } = D();
    const L = WW.REALM_LAWS, sim = this.game.sim;
    if (!L || !k.laws) return null;
    const list = Array.isArray(L) ? L : Object.keys(L).map(key => Object.assign({ key: key }, L[key]));
    const isOn = (key) => Array.isArray(k.laws) ? k.laws.indexOf(key) >= 0 : !!k.laws[key];
    const on = list.filter(l => isOn(l.key));
    const sec = h('div.sec', [h('h3', 'Gesetze')]);
    if (on.length) sec.appendChild(h('ul.pc', on.map(l => h('li.p', [h('b', l.name), l.desc ? ' – ' + l.desc : '']))));
    else sec.appendChild(h('div.muted', 'Keine besonderen Gesetze.'));
    if (!sim.actions.setRealmLaw) return sec;
    const box = h('div', { style: { marginTop: '8px' } });
    for (const l of list) {
      const allowed = !l.allowed || l.allowed.indexOf(k.gov) >= 0;
      const v = isOn(l.key);
      box.appendChild(h('div.law', [h('div.lt', [h('b', l.name), h('span', allowed ? (l.desc || '') : 'Unter ' + WW.GOVERNMENTS[k.gov].name + ' nicht üblich' + (l.allowed ? ' (nur ' + l.allowed.map(g => WW.GOVERNMENTS[g] ? WW.GOVERNMENTS[g].name : g).join(', ') + ')' : ''))]),
        h('button.btn.switch' + (v ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': v ? 'true' : 'false', 'aria-label': l.name,
          style: allowed ? null : { opacity: '0.55' },
          on: { click: () => { try { sim.actions.setRealmLaw(k.id, l.key, !v); } catch (e) { /* egal */ } this.refreshInfo(true); } } }, v ? 'An' : 'Aus')]));
    }
    sec.appendChild(box);
    return sec;
  };

  // aktive Modifikatoren (WW.Mods.list), falls vorhanden
  Panels.prototype.modsBlock = function (obj) {
    const { h } = D();
    if (!WW.Mods || typeof WW.Mods.list !== 'function') return null;
    let list = null;
    try { list = WW.Mods.list(obj, this.game.sim); } catch (e) { list = null; }
    if (!Array.isArray(list) || !list.length) return null;
    const year = this.game.sim.state.year;
    return h('div.sec', [h('h3', 'Wirkt gerade'), h('div', list.map(m => {
      const left = m.yearsLeft != null ? m.yearsLeft : (m.until != null ? m.until - year : (m.years != null ? m.years : null));
      return h('div', { style: { marginBottom: '6px' } }, [h('div', { style: { fontWeight: '700' } }, m.name || m.key || 'Wirkung'),
        h('span.fx-line', [m.effectText || m.text || m.desc || '', left != null && left > 0 ? ' · noch ' + Math.ceil(left) + (Math.ceil(left) === 1 ? ' Jahr' : ' Jahre') : ''].join(''))]);
    }))]);
  };

  Panels.prototype.renderCity = function (c) {
    if (c.kind === 'camp') { this.renderCamp(c); return; }
    const { h, icon } = D();
    const game = this.game, sim = game.sim, body = this.$('infoBody');
    const k = sim.query.kingdom(c.kingdomId);
    const cs = sim.query.struct ? sim.query.struct(c.centerId) : null;
    const tier = WW.CITY_TIERS[c.tier] || WW.CITY_TIERS[0];
    const race = WW.RACES[c.race];
    this.title(k ? icon('banner_' + (k.bannerPattern % 8), 30, k.colorIndex) : null, c.name, tier.name + (race ? ' · ' + race.name : '') + (k && k.capitalId === c.id ? ' · Hauptstadt' : ''));
    if (k) body.appendChild(h('div.sec', [h('div.row', [h('span.muted', 'Gehört zu'), h('button.link', { type: 'button', on: { click: () => game.selectKingdom(k.id, true) } }, k.name),
      icon('i_gov_' + k.gov, 20), h('span.muted', WW.GOVERNMENTS[k.gov].name)])]));
    { const cb = cultureBlock(c.culture); if (cb) body.appendChild(cb); }
    { const gb = this.garrisonBlock(c, k); if (gb) body.appendChild(gb); }
    if (c.campFree) body.appendChild(h('div.sec', h('div.muted', 'War bis zum Jahr ' + c.campFree + ' eine Lagerstadt. Ein Mahnmal erinnert daran.')));
    if (c.revolt) body.appendChild(h('div.sec', h('div.hint-box', 'Aufruhr! Rebellen ziehen durch die Gassen.')));
    else if (c.hungry) body.appendChild(h('div.sec', h('div.hint-box', 'Hunger: Die Vorräte sind leer.')));
    body.appendChild(h('div.sec', [
      h('dl.kv', [h('dt', 'Einwohner'), h('dd', c.pop + ' / ' + c.housing + ' Plätze'), h('dt', 'Kinder'), h('dd', String(c.children | 0)), h('dt', 'Gegründet'), h('dd', 'Jahr ' + (c.founded | 0)),
        cs && cs.stage != null ? h('dt', 'Mittelpunkt') : null, cs && cs.stage != null ? h('dd', stageName(cs, k)) : null]),
      cs && cs.upgrading ? h('div', [h('div.barline', [h('span', 'Ausbau zu: ' + stageName({ stage: (cs.stage | 0) + 1 }, k)), h('b', Math.round(100 * (cs.progress || 0)) + ' %')]),
        h('div.bar.warn', [h('b', { style: { width: Math.round(100 * (cs.progress || 0)) + '%' } })])]) : null
    ]));
    // Lager (bei Kommunismus gemeinsames Lager)
    const stock = (k && k.stock && WW.GOVERNMENTS[k.gov].sharedStock) ? k.stock : c.stock;
    // Rohstoffe aus WW.RESOURCES (sonst die vier Grundstoffe); kompakt als Icon-Raster
    let res = [['food', 'Essen', 'i_food'], ['wood', 'Holz', 'i_wood'], ['stone', 'Stein', 'i_stone'], ['gold', 'Gold', 'i_gold']];
    for (const r of [['iron', 'Eisen'], ['coal', 'Kohle'], ['fish', 'Fisch'], ['crystal', 'Kristall'], ['wool', 'Wolle']]) if (stock[r[0]] != null) res.push([r[0], r[1], 'i_' + r[0]]);
    if (WW.RESOURCES) {
      const L = Array.isArray(WW.RESOURCES) ? WW.RESOURCES : Object.keys(WW.RESOURCES).map(k => Object.assign({ key: k }, WW.RESOURCES[k]));
      res = L.filter(r => r && r.key && (stock[r.key] != null || ['food', 'wood', 'stone', 'gold'].indexOf(r.key) >= 0)).map(r => [r.key, r.name || r.key, r.icon || 'i_' + r.key]);
    }
    body.appendChild(h('div.sec', [h('h3', stock === c.stock ? 'Lager' : 'Gemeinsames Lager'),
      h('div.stock', res.map(r => h('div', { title: r[1] }, [icon(WW.Sprites.has(r[2]) ? r[2] : 'i_' + r[0], 22, null, r[1]), h('span', String(Math.floor(stock[r[0]] || 0)))])))]));
    if (typeof c.loyalty === 'number') {
      const lv = Math.max(0, Math.min(100, c.loyalty));
      body.appendChild(h('div.sec', [h('h3', 'Loyalität'), h('div.barline', [h('span', lv >= 60 ? 'treu' : lv >= 35 ? 'wankelmütig' : 'abtrünnig'), h('b', Math.round(lv) + ' %')]), happyBar(lv)]));
    }
    if (c.governor && !(k && k.capitalId === c.id)) { const b = personBlock(c.governor.female ? 'Statthalterin' : 'Statthalter', c.governor); if (b) body.appendChild(b); }
    const cp = plotsFor(sim, p => (p.type === 'revolt' || p.type === 'secession') && (p.cityId === c.id || p.targetId === c.id));
    if (cp.length) body.appendChild(h('div.sec', [h('h3', 'Vorhaben'), plotList(sim, cp)]));
    body.appendChild(h('div.sec', [h('h3', 'Stimmung'), h('div.barline', [h('span', moodWord(c.happiness)), h('b', Math.round(c.happiness) + ' %')]), happyBar(c.happiness)]));
    { const nb = natureBlock(c.nature); if (nb) body.appendChild(nb); }
    { const ab = airBlock(c.pollution); if (ab) body.appendChild(ab); }
    {
      const stock = sim.state.structs.filter(s => s.type === 'stockade' && s.cityId === c.id && !s.dead);
      if (stock.length) {
        let inm = 0, cap = 0; for (const s of stock) { inm += s.inmates | 0; cap += s.cap | 0; }
        body.appendChild(h('div.sec', [h('h3', 'Gefangenenlager'), h('dl.kv', [h('dt', 'Kriegsgefangene'), h('dd', inm + (cap ? ' von ' + cap + ' Plätzen' : ''))]),
          h('div.muted', { style: { marginTop: '4px' } }, 'Gefangene Soldaten warten hier auf den Frieden. Sie arbeiten nicht.')]));
      }
      const camps = sim.state.structs.filter(s => s.type === 'laborcamp' && s.cityId === c.id && !s.dead);
      if (camps.length) {
        let inm = 0, cap = 0;
        for (const s of camps) { inm += s.inmates | 0; cap += s.cap | 0; }
        body.appendChild(h('div.sec', [h('h3', 'Arbeitslager'),
          h('dl.kv', [h('dt', 'Lager'), h('dd', String(camps.length)), h('dt', 'Insassen'), h('dd', inm + (cap ? ' von ' + cap + ' Plätzen' : ''))]),
          h('div.muted', { style: { marginTop: '4px' } }, 'Politische Gefangene arbeiten unter Zwang. Die Stadt lebt in Angst: Zufriedenheit und Loyalität sinken, solange das Lager steht; Nachbarn verurteilen es.')]));
      }
    }
    { const fb = factoryList(sim, s => s.cityId === c.id); if (fb) body.appendChild(fb); }
    { const mb = this.modsBlock(c); if (mb) body.appendChild(mb); }
    // Mauer
    const w = c.wall || {};
    const gl = k && WW.GOVERNMENTS[k.gov] && WW.GOVERNMENTS[k.gov].wallLevels;
    const lvName = w.name || (gl && w.level > 0 && gl[w.level - 1] ? (gl[w.level - 1].name || gl[w.level - 1]) : null);
    const wName = w.level > 0 || w.total > 0 ? (lvName || WW.WALL_STYLE_NAMES[w.style] || 'Mauer') : 'keine';
    const wsec = h('div.sec', [h('h3', 'Mauer')]);
    if (w.total > 0) {
      const p = Math.round(100 * (w.built || 0) / Math.max(1, w.total));
      wsec.appendChild(h('div.barline', [h('span', wName + (w.level ? ' · Stufe ' + w.level : '')), h('b', (w.built | 0) + ' / ' + (w.total | 0))]));
      wsec.appendChild(h('div.bar' + (p < 100 ? '.warn' : ''), [h('b', { style: { width: p + '%' } })]));
      wsec.appendChild(h('div.muted', { style: { marginTop: '4px' } }, (w.gates && w.gates.length ? w.gates.length + ' Tor' + (w.gates.length > 1 ? 'e' : '') : '') +
        (w.towers && w.towers.length ? ' · ' + w.towers.length + ' Türme' : '')));
      // Verteidigungsgeräte auf der Mauer
      const dev = {};
      for (const s of sim.state.structs) if (s.cityId === c.id && s.device && !s.dead) dev[s.device] = (dev[s.device] || 0) + 1;
      const DN = WW.WALL_DEVICES || {};
      const dl = Object.keys(dev).map(d => ((DN[d] && (DN[d].name || DN[d])) || d) + ' ×' + dev[d]);
      void dl;
      if (dl.length) wsec.appendChild(h('div.muted', { style: { marginTop: '4px' } }, 'Verteidigung: ' + dl.join(', ')));
    } else {
      const g = k ? WW.GOVERNMENTS[k.gov] : null;
      wsec.appendChild(h('div.muted', g ? 'Noch keine. Diese Regierung plant ab ' + g.wallThreshold + ' Einwohnern einen Mauerring.' : 'Noch keine.'));
    }
    body.appendChild(wsec);
    // Berufe
    const jobs = c.jobs || {};
    const jl = Object.keys(jobs).filter(j => jobs[j] > 0).map(j => (WW.ROLE_NAMES[j] || j) + ' ' + jobs[j]);
    if (jl.length) body.appendChild(h('div.sec', [h('h3', 'Bewohner'), h('div.muted', jl.join(' · '))]));
  };

  Panels.prototype.renderUnit = function (u) {
    const { h, icon } = D();
    const game = this.game, sim = game.sim, body = this.$('infoBody');
    const k = sim.query.kingdom(u.kingdomId), c = sim.query.city(u.cityId);
    const race = WW.RACES[u.race];
    const role = (u.female ? WW.ROLE_NAMES_F : WW.ROLE_NAMES)[u.role] || ({ prisoner: u.female ? 'Gefangene' : 'Gefangener', caravan: 'Karawane' })[u.role] || u.role;
    const key = game.renderer.unitKey(u, k ? k.gov : 'tribe', 0);
    const isLeader = k && k.leaderId === u.id;
    this.title(icon(key, 40, k ? k.colorIndex : 10), (isLeader && k.leaderName) ? (k.leaderTitle + ' ' + k.leaderName) : u.name, role + (race ? ' · ' + race.singular : ''));
    const age = Math.floor(u.age);
    // großes Porträt mit der Tracht der Regierung
    body.appendChild(h('div.sec.portrait', [icon(key, 96, k ? k.colorIndex : 10)]));
    body.appendChild(h('div.sec', [
      h('dl.kv', [h('dt', 'Alter'), h('dd', age + (age === 1 ? ' Jahr' : ' Jahre')), h('dt', 'Zustand'), h('dd', u.sick ? 'krank' : (u.hp < u.maxHp * 0.5 ? 'verletzt' : 'munter')),
        u.carrying ? h('dt', 'Trägt') : null, u.carrying ? h('dd', ({ food: 'Essen', wood: 'Holz', stone: 'Stein', gold: 'Gold' })[u.carrying] || u.carrying) : null]),
      h('div.barline', [h('span', 'Lebenskraft'), h('b', Math.round(u.hp) + ' / ' + Math.round(u.maxHp))]),
      h('div.bar' + (u.hp < u.maxHp * 0.35 ? '.bad' : ''), [h('b', { style: { width: Math.round(100 * u.hp / Math.max(1, u.maxHp)) + '%' } })])
    ]));
    const links = [];
    if (u.role === 'prisoner') {
      const hold = WW.Camps && typeof WW.Camps.holdOf === 'function' ? (function () { try { return WW.Camps.holdOf(sim, u); } catch (e) { return null; } })() : null;
      const CS = { march: 'wird ins Lager geführt', wait: 'wartet am Bahnhof', train: 'im Gefangenenzug', held: 'in Haft', home: 'auf dem Heimweg' };
      links.push(h('div', { style: { marginBottom: '6px' } }, (u.pow >= 0 ? 'Kriegsgefangener aus ' + kname(sim, u.pow) : 'Politischer Gefangener') + (CS[u.campState] ? ' · ' + CS[u.campState] : '')));
      if (hold && hold.name) links.push(h('div.row', [h('span.muted', 'Haftort'), h('button.link', { type: 'button', on: { click: () => game.selectCity(hold.id, true) } }, hold.name)]));
    }
    if (u.garrison != null && u.garrison >= 0) { const gc = sim.query.city(u.garrison); links.push(h('div.row', [h('span.muted', 'Garnison von'), gc ? h('button.link', { type: 'button', on: { click: () => game.selectCity(gc.id, true) } }, gc.name) : h('span', '—')])); }
    else if (u.order && u.order.kind === 'garrison') { const gc = sim.query.city(u.order.city); if (gc) links.push(h('div.muted', 'Unterwegs zur Garnison von ' + gc.name)); }
    if (u.ind === 'escort') { const to = sim.query.city(u.escortTo); links.push(h('div.muted', { style: { marginBottom: '6px' } }, 'Begleitwache eines Gefangenenmarschs' + (to ? ' nach ' + to.name : '') + (u.escortN ? ' (' + (u.escortN === 1 ? 'ein Gefangener' : u.escortN + ' Gefangene') + ')' : ''))); }
    if (u.vehicle) links.push(h('div.muted', { style: { marginBottom: '6px' } }, (u.role === 'tank' ? 'Panzer' : 'Feldgeschütz') + (u.simple ? ' (einfache Bauart)' : '') + (u.parole ? ' · hat die Waffen niedergelegt' : '')));
    if (c) links.push(h('div.row', [h('span.muted', 'Wohnt in'), h('button.link', { type: 'button', on: { click: () => game.selectCity(c.id, true) } }, c.name)]));
    if (k) links.push(h('div.row', [h('span.muted', 'Reich'), h('button.link', { type: 'button', on: { click: () => game.selectKingdom(k.id, true) } }, k.name)]));
    if (!c && !k) links.push(h('div.muted', 'Heimatlos unterwegs.'));
    body.appendChild(h('div.sec', links));
    body.appendChild(h('div.sec', h('button.btn', { type: 'button', on: { click: () => game.follow(u.id) } }, [icon('i_inspect', 22), h('span', game.followId === u.id ? 'Folge ich' : 'Kamera folgt')])));
  };

  // Garnison und Besatzung (9.10): Ist/Soll, Wirkung, Knöpfe; besetzte Städte mit Herkunft und Eingliederung
  Panels.prototype.garrisonBlock = function (c, k) {
    const { h, icon } = D();
    const sim = this.game.sim, S = WW.Sprites;
    if (c.garrison == null && c.garrisonWant == null && !c.occupied) return null;
    const g = k ? WW.GOVERNMENTS[k.gov] : null, gi = g && g.garrison;
    const sec = h('div.sec', [h('h3', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [S.has('i_garrison') ? icon('i_garrison', 18) : null, 'Garnison'])]);
    if (c.occupied) {
      const yrs = Math.max(0, (sim.state.year | 0) - (c.occupied.since | 0)), left = gi && gi.integ ? Math.ceil(gi.integ - yrs) : null;
      sec.appendChild(h('div.hint-box', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [S.has('i_occupied') ? icon('i_occupied', 18) : null,
        h('span', 'Besetzt seit Jahr ' + (c.occupied.since | 0) + (c.occupied.prev >= 0 ? ', früher ' + kname(sim, c.occupied.prev) : '') + '. ' +
          (left != null ? (left > 40 ? 'Eingliederung kaum absehbar.' : left > 0 ? 'Eingliederung in etwa ' + left + (left === 1 ? ' Jahr.' : ' Jahren.') : 'Eingliederung steht bevor.') : ''))]));
    }
    const have = c.garrison | 0, want = c.garrisonWant | 0;
    const ratio = typeof c.garrisonRatio === 'number' ? c.garrisonRatio : (want ? Math.min(1, have / want) : 1);
    sec.appendChild(h('div.barline', [h('span', have + ' Soldaten · Soll ' + want + (c.garrisonSet != null ? ' (von dir festgelegt)' : '')), h('b', Math.round(ratio * 100) + ' %')]));
    sec.appendChild(h('div.bar' + (ratio < 0.5 ? '.bad' : ratio < 0.9 ? '.warn' : ''), [h('b', { style: { width: Math.max(2, Math.round(ratio * 100)) + '%' } })]));
    if (gi && gi.cap) sec.appendChild(h('div.muted', { style: { marginTop: '4px' } }, 'Volle Garnison stärkt die Loyalität um bis zu ' + gi.cap + ' Punkte' + (c.occupied ? '; fehlt sie in der besetzten Stadt, sinkt sie.' : '.')));
    const has = sim.state.structs.some(s => s.type === 'garrison' && s.cityId === c.id && !s.dead && s.built);
    if (has) sec.appendChild(h('div.muted', 'Garnisonskaserne: Wirkung +50 %.'));
    if (sim.actions.setGarrison) {
      const base = c.garrisonSet != null ? c.garrisonSet : want;
      const act = (n) => { try { sim.actions.setGarrison(c.id, n); } catch (e) { /* egal */ } this.refreshInfo(true); };
      sec.appendChild(h('div.rbtns', { style: { marginTop: '6px' } }, [
        h('button.btn.good', { type: 'button', on: { click: () => act(Math.max(have, base) + 2) } }, [S.has('i_garrison') ? icon('i_garrison', 20) : null, h('span', 'Verstärken')]),
        h('button.btn.danger', { type: 'button', disabled: have === 0 && c.garrisonSet === 0, on: { click: () => act(0) } }, h('span', 'Abziehen')),
        h('button.btn', { type: 'button', 'aria-pressed': c.garrisonSet == null ? 'true' : 'false', disabled: c.garrisonSet == null, on: { click: () => act(null) } }, h('span', 'Selbst verwalten'))]));
    }
    return sec;
  };
  // ------------------------------------------------------------------ Ausbau 9: Schlacht, Schlachtfeld, Schiff, Zug, Bauwerke, Lagerstadt
  const byId = (list, id) => Array.isArray(list) ? list.find(o => o && o.id === id) || null : null;
  function kname(sim, id) { const k = id >= 0 ? sim.query.kingdom(id) : null; return k ? k.name : 'ein vergangenes Reich'; }
  function kIcon(sim, id, px) { const { icon } = D(); const k = id >= 0 ? sim.query.kingdom(id) : null; return k ? icon('banner_' + (k.bannerPattern % 8), px || 22, k.colorIndex) : null; }
  function emblem(gov, px) { const { icon } = D(); const S = WW.Sprites; const k = typeof S.emblemKey === 'function' ? S.emblemKey(gov) : null; return k && S.has(k) ? icon(k, px || 20) : null; }
  Panels.prototype.thingOf = function (s) {
    const sim = this.game.sim, st = sim.state, q = sim.query;
    switch (s.kind) {
      case 'battle': return byId(st.battles, s.id);
      case 'site': return byId(st.sites, s.id);
      case 'ship': return (q.ship ? q.ship(s.id) : null) || byId(st.ships, s.id);
      case 'train': return byId(st.trains, s.id);
      case 'struct': return q.struct ? q.struct(s.id) : null;
    }
    return null;
  };
  Panels.prototype.thingSig = function (s, o) {
    const pick = ['state', 'nA', 'nB', 'lossA', 'lossB', 'vA', 'vB', 'pows', 'hp', 't', 'kind', 'prod', 'made', 'inmates', 'cap', 'built', 'level', 'stage', 'campState', 'guards'];
    const v = pick.map(k => typeof o[k] === 'number' ? Math.round(o[k] * 10) : o[k]);
    if (o.cargo) v.push(JSON.stringify(o.cargo));
    if (o.passengers) v.push(o.passengers.length);
    if (o.prisoners) v.push(o.prisoners.length);
    if (o.prog != null) v.push(Math.round(o.prog * 20));
    return s.kind + '|' + v.join('|');
  };
  Panels.prototype.renderThing = function (s, o) {
    if (s.kind === 'battle') this.renderBattle(o);
    else if (s.kind === 'site') this.renderSite(o);
    else if (s.kind === 'ship') this.renderShip(o);
    else if (s.kind === 'train') this.renderTrain(o);
    else this.renderStruct(o);
  };
  // laufende Feldschlacht: Stärken und Verluste beider Seiten
  Panels.prototype.renderBattle = function (b) {
    const { h, icon } = D();
    const sim = this.game.sim, body = this.$('infoBody');
    this.title(WW.Sprites.has('i_battle') ? icon('i_battle', 30) : null, b.name || 'Feldschlacht', b.state === 'retreat' ? 'eine Seite weicht' : b.state === 'surrender' ? 'eine Seite gibt auf' : 'tobt seit Jahr ' + (b.year | 0));
    const side = (id, n, loss, v, role) => h('div.relrow', [h('div.rt', [kIcon(sim, id), h('button.link.nm', { type: 'button', on: { click: () => id >= 0 && this.game.selectKingdom(id, false) } }, kname(sim, id)), h('span.badge.war', role)]),
      h('div.op', (n | 0) + ' Kämpfer im Feld' + (v ? ' · ' + v + (v === 1 ? ' Fahrzeug' : ' Fahrzeuge') : '') + ' · ' + (loss | 0) + ' gefallen')]);
    body.appendChild(h('div.sec', [h('h3', 'Seiten'), side(b.a, b.nA, b.lossA, b.vA, 'greift an'), side(b.b, b.nB, b.lossB, b.vB, 'verteidigt')]));
    const tot = Math.max(1, (b.nA | 0) + (b.nB | 0)), pa = Math.round(100 * (b.nA | 0) / tot);
    body.appendChild(h('div.sec', [h('div.barline', [h('span', 'Kräfteverhältnis'), h('b', pa + ' : ' + (100 - pa))]), h('div.bar.warn', [h('b', { style: { width: pa + '%' } })])]));
    if (b.pows) body.appendChild(h('div.sec', h('div.muted', (b.pows | 0) + ' Soldaten sind bisher in Gefangenschaft geraten.')));
    if (b.dig >= 0 && b.dig != null) body.appendChild(h('div.sec', h('div.muted', kname(sim, b.dig) + ' gräbt sich ein.')));
    body.appendChild(h('div.sec', h('button.btn', { type: 'button', on: { click: () => this.game.flyTo(b.x + 0.5, b.y + 0.5) } }, [icon('i_inspect', 22), h('span', 'Zum Schlachtfeld')])));
  };
  // Schlachtfeld als Ort (nach der Schlacht)
  Panels.prototype.renderSite = function (o) {
    const { h, icon } = D();
    const sim = this.game.sim, body = this.$('infoBody');
    this.title(WW.Sprites.has('i_battle') ? icon('i_battle', 30) : null, o.name || 'Schlachtfeld', 'Schlachtfeld · Jahr ' + (o.year | 0));
    const how = { win: 'gewann die Schlacht', retreat: 'behielt das Feld, der Gegner zog sich zurück', surrender: 'gewann, der Gegner gab auf', draw: '' }[o.how] || 'gewann';
    const L = o.losses || {};
    body.appendChild(h('div.sec', [h('dl.kv', [
      h('dt', 'Angreifer'), h('dd', o.aName || kname(sim, o.a)), h('dt', 'Verteidiger'), h('dd', o.bName || kname(sim, o.b)),
      h('dt', 'Ausgang'), h('dd', o.winner >= 0 ? (o.winner === o.a ? (o.aName || kname(sim, o.a)) : (o.bName || kname(sim, o.b))) + ' ' + how : 'unentschieden'),
      h('dt', 'Gefallen'), h('dd', (L.a | 0) + ' und ' + (L.b | 0)),
      o.pows ? h('dt', 'Gefangene') : null, o.pows ? h('dd', String(o.pows | 0)) : null,
      o.vehicles && (o.vehicles.a || o.vehicles.b) ? h('dt', 'Fahrzeuge') : null, o.vehicles && (o.vehicles.a || o.vehicles.b) ? h('dd', ((o.vehicles.a | 0) + (o.vehicles.b | 0)) + ' beteiligt') : null])]));
    body.appendChild(h('div.sec', h('div.muted', 'Gräben und Trichter wachsen langsam zu, die Wracks rosten noch jahrelang.')));
  };
  Panels.prototype.renderShip = function (sh) {
    const { h, icon } = D();
    const sim = this.game.sim, body = this.$('infoBody'), S = WW.Sprites;
    const k = sim.query.kingdom(sh.kingdomId), kind = (WW.NAVAL && WW.NAVAL.KINDS && WW.NAVAL.KINDS[sh.kind]) || {};
    let key = null; try { key = S.shipKey(sh.kind, sh.gov || (k ? k.gov : 'tribe'), 'e', 0, sh.culture); } catch (e) { key = null; }
    this.title(key && S.has(key) ? icon(key, 40, k ? k.colorIndex : 10) : (S.has('i_ship') ? icon('i_ship', 30) : null), sh.name || kind.name || 'Schiff', (kind.name || sh.kind) + (k ? ' · ' + k.name : ''));
    const T = { dock: 'liegt im Hafen', load: 'wartet auf Passagiere', out: 'fährt hinaus', work: sh.kind === 'fishboat' ? 'fischt' : sh.kind === 'warship' ? 'hält Wache' : 'ankert', back: 'fährt heim', sink: 'sinkt' };
    const cargo = sh.cargo ? Object.keys(sh.cargo).filter(c => sh.cargo[c] > 0).map(c => ({ fish: 'Fisch', gold: 'Gold', goods: 'Waren' })[c] + ' ' + Math.floor(sh.cargo[c])) : [];
    body.appendChild(h('div.sec', [h('dl.kv', [h('dt', 'Lage'), h('dd', T[sh.t] || 'unterwegs'),
      h('dt', 'Rumpf'), h('dd', Math.round(sh.hp) + ' / ' + Math.round(sh.maxHp || sh.hp)),
      cargo.length ? h('dt', 'Ladung') : null, cargo.length ? h('dd', cargo.join(', ')) : null,
      sh.passengers && sh.passengers.length ? h('dt', 'An Bord') : null, sh.passengers && sh.passengers.length ? h('dd', sh.passengers.length + ' Personen') : null,
      sh.trips ? h('dt', 'Fahrten') : null, sh.trips ? h('dd', String(sh.trips)) : null])]));
    const c = sim.query.city(sh.cityId);
    if (c) body.appendChild(h('div.sec', h('div.row', [h('span.muted', 'Heimathafen'), h('button.link', { type: 'button', on: { click: () => this.game.selectCity(c.id, true) } }, c.name)])));
  };
  // Zug; beim Gefangenenzug: Zahl und Herkunft der Insassen an Bord
  Panels.prototype.renderTrain = function (t) {
    const { h, icon } = D();
    const sim = this.game.sim, body = this.$('infoBody');
    const k = sim.query.kingdom(t.kingdomId);
    const kindName = { freight: 'Güterzug', troop: 'Truppenzug', prison: 'Gefangenenzug' }[t.kind] || 'Zug';
    this.title(WW.Sprites.has('i_train') ? icon('i_train', 30) : null, kindName, k ? k.name : '');
    const rows = [h('dt', 'Lage'), h('dd', t.t === 'load' ? 'hält am Bahnhof' : t.t === 'blocked' ? 'steht vor einem Hindernis' : 'fährt'), h('dt', 'Wagen'), h('dd', String(Array.isArray(t.cars) ? t.cars.length : t.cars | 0))];
    if (t.cargo) { const cg = Object.keys(t.cargo).filter(c => t.cargo[c] > 0).map(c => Math.floor(t.cargo[c]) + ' ' + (((WW.RESOURCES || []).find(r => r && r.key === c) || {}).name || c)); if (cg.length) rows.push(h('dt', 'Ladung'), h('dd', cg.join(', '))); }
    body.appendChild(h('div.sec', h('dl.kv', rows)));
    if (t.kind === 'prison') {
      const ids = Array.isArray(t.prisoners) ? t.prisoners : [];
      const from = {}; let pol = 0;
      for (const id of ids) { const u = sim.query.unit(id); if (!u) continue; if (u.pow >= 0) from[u.pow] = (from[u.pow] || 0) + 1; else pol++; }
      const lines = Object.keys(from).map(kid => from[kid] + ' Kriegsgefangene aus ' + kname(sim, +kid));
      if (pol) lines.push(pol + ' politische Gefangene');
      const camp = sim.query.city(t.camp);
      body.appendChild(h('div.sec', [h('h3', 'An Bord'), h('div', ids.length + ' Gefangene' + (t.guards ? ', bewacht von ' + t.guards + ' Wachen' : '')),
        lines.length ? h('ul.pc', lines.map(l => h('li.c', l))) : null,
        camp ? h('div.row', [h('span.muted', 'Ziel'), h('button.link', { type: 'button', on: { click: () => this.game.selectCity(camp.id, true) } }, camp.name)]) : null,
        h('div.muted', { style: { marginTop: '6px' } }, 'Das Regime schafft seine Gefangenen per Bahn ins Lager. Wird der Zug aufgehalten oder das Lager befreit, kommen sie frei.')]));
    }
  };
  // einzelne Bauwerke mit eigener Bedeutung (Hafen, Arsenal, Gefangenenlager, Mahnmal, Rampe, Karawanserei, Pyramide)
  Panels.prototype.renderStruct = function (s) {
    const { h, icon } = D();
    const game = this.game, sim = game.sim, body = this.$('infoBody'), S = WW.Sprites;
    const info = (WW.STRUCT_INFO && WW.STRUCT_INFO[s.type]) || {};
    const c = sim.query.city(s.cityId), k = c ? sim.query.kingdom(c.kingdomId) : null;
    let key = null; try { key = game.renderer.structKey(s, k ? k.gov : 'tribe'); } catch (e) { key = null; }
    const name = s.type === 'station' && s.campStation ? 'Verladerampe' : (info.name || s.type);
    this.title(key && S.has(key) ? icon(key, 40, k ? k.colorIndex : 10) : null, name, c ? c.name : (s.type === 'memorial' ? 'gehört allen' : ''));
    const rows = [];
    if (!s.built) rows.push(h('dt', 'Bau'), h('dd', Math.round(100 * (s.progress || 0)) + ' %'));
    if (s.type === 'arsenal') {
      const P = { tank: 'Panzer', artillery: 'Feldgeschütz' };
      rows.push(h('dt', 'Fertigung'), h('dd', s.prod ? P[s.prod] + ' · ' + Math.round(100 * (s.prog || 0)) + ' %' : 'ruht'), h('dt', 'Gebaut'), h('dd', String(s.made | 0)),
        h('dt', 'Bezahlt mit'), h('dd', s.pay === 'alt' || s.lastPay === 'alt' ? 'Behelf (Gold, langsam)' : 'Eisen und Kohle'));
    } else if (s.type === 'harbor') {
      const ships = (sim.state.ships || []).filter(o => o && o.harborId === s.id);
      rows.push(h('dt', 'Schiffe'), h('dd', String(ships.length)), h('dt', 'Werft'), h('dd', s.prod ? (((WW.NAVAL && WW.NAVAL.KINDS[s.prod]) || {}).name || s.prod) + ' · ' + Math.round(100 * (s.prog || 0)) + ' %' : 'ruht'));
      const led = sim.state.naval && sim.state.naval.ledger && c ? sim.state.naval.ledger[c.id] : 0;
      if (led) rows.push(h('dt', 'Seehandel'), h('dd', Math.floor(led) + ' Gold'));
      const NS = sim.state.naval && sim.state.naval.stats;
      if (NS && (NS.invasions || NS.landings)) rows.push(h('dt', 'Landungen (Welt)'), h('dd', (NS.landings | 0) + ' von ' + (NS.invasions | 0) + ' Einschiffungen · ' + (NS.troopsLanded | 0) + ' von ' + (NS.troopsSent | 0) + ' Soldaten an Land'));
    } else if (s.type === 'stockade') {
      rows.push(h('dt', 'Kriegsgefangene'), h('dd', (s.inmates | 0) + ' von ' + (s.cap | 0)));
    } else if (s.type === 'barrack') {
      rows.push(h('dt', 'Belegung'), h('dd', (s.inmates | 0) + ' von ' + (s.cap | 0)));
    } else if (s.type === 'pyramid') {
      rows.push(h('dt', 'Baustufe'), h('dd', ((s.stage != null ? s.stage : (s.level | 0) - 1) + 1) + ' von 3'));
    }
    if (rows.length) body.appendChild(h('div.sec', h('dl.kv', rows)));
    const TXT = {
      stockade: 'Hier sitzen gefangene Soldaten bis zum Frieden. Sie arbeiten nicht und gehen beim Friedensschluss heim.',
      memorial: 'Ein Mahnmal' + (s.campName ? ' für das Lager ' + s.campName : '') + (s.year ? ', errichtet im Jahr ' + s.year : '') + '. Damit niemand vergisst, was hier geschah.',
      arsenal: 'Hier entstehen Panzer und Geschütze. Eisen und Kohle aus dem Stadtlager werden dafür verbraucht.',
      harbor: 'Von hier fahren Fischer, Händler und – wenn es sein muss – Kriegsschiffe aus.',
      caravanserai: 'Rastplatz für Karawanen: Kamele, Wasser, Handel. Bringt beiden Städten Gold.',
      pyramid: 'Ein steiles Grabmal nach Art der Könige von Kusch. Die Stadt ist stolz darauf.',
      station: s.campStation ? 'Hier laden Güterzüge ab, was die Gefangenen erarbeiten, und hier kommen neue Gefangene an.' : ''
    };
    if (s.ruinOf === 'laborcamp') TXT.ruin = 'Ein Mahnmal am Ort eines früheren Lagers.';
    if (TXT[s.type]) body.appendChild(h('div.sec', h('div.muted', TXT[s.type])));
    if (c) body.appendChild(h('div.sec', h('div.row', [h('span.muted', 'Stadt'), h('button.link', { type: 'button', on: { click: () => game.selectCity(c.id, true) } }, c.name)])));
  };
  // Lagerstadt: Insassen, Wachen, Herkunft der Kriegsgefangenen, Folgen – sachlich
  Panels.prototype.renderCamp = function (c) {
    const { h, icon } = D();
    const game = this.game, sim = game.sim, body = this.$('infoBody');
    const k = sim.query.kingdom(c.kingdomId);
    this.title(k ? icon('banner_' + (k.bannerPattern % 8), 30, k.colorIndex) : null, c.name, 'Lagerstadt' + (k ? ' · ' + WW.GOVERNMENTS[k.gov].name : ''));
    if (k) body.appendChild(h('div.sec', [h('div.row', [h('span.muted', 'Betrieben von'), h('button.link', { type: 'button', on: { click: () => game.selectKingdom(k.id, true) } }, k.name), emblem(k.gov, 20)])]));
    const inm = c.inmates | 0, pows = c.pows | 0;
    body.appendChild(h('div.sec', [h('dl.kv', [
      h('dt', 'Insassen'), h('dd', inm + (c.cap ? ' bei ' + (c.cap | 0) + ' Plätzen' : '')),
      h('dt', 'davon Kriegsgefangene'), h('dd', String(pows)), h('dt', 'politische Gefangene'), h('dd', String(Math.max(0, inm - pows))),
      h('dt', 'Wachen'), h('dd', (c.guards | 0) + (c.guardsWant ? ' (Soll ' + (c.guardsWant | 0) + ')' : '')),
      h('dt', 'Anschluss'), h('dd', c.railLine != null && c.railLine >= 0 || c.station ? 'Bahn' : 'zu Fuß'),
      c.campFounded ? h('dt', 'Gegründet') : null, c.campFounded ? h('dd', 'Jahr ' + c.campFounded) : null])]));
    const from = c.powFrom || {}, fk = Object.keys(from).filter(id => from[id] > 0);
    if (fk.length) body.appendChild(h('div.sec', [h('h3', 'Herkunft der Kriegsgefangenen'), h('div', fk.map(id => h('div.row', [kIcon(sim, +id, 18), h('span', from[id] + ' aus ' + kname(sim, +id))])))]));
    if (typeof c.campUnrest === 'number') body.appendChild(h('div.sec', [h('h3', 'Spannung im Lager'), h('div.barline', [h('span', c.campUnrest >= 75 ? 'kurz vor dem Aufstand' : c.campUnrest >= 40 ? 'gereizt' : 'gedrückt'), h('b', Math.round(c.campUnrest) + ' %')]),
      h('div.bar' + (c.campUnrest >= 75 ? '.bad' : '.warn'), [h('b', { style: { width: Math.max(2, Math.min(100, c.campUnrest)) + '%' } })])]));
    const out = c.campOut || {}, home = sim.query.city(c.campHome);
    const ol = Object.keys(out).filter(x => out[x] > 0).map(x => x === 'rail' ? out[x] + ' Gleisstücke' : Math.floor(out[x]) + ' ' + ((((WW.RESOURCES || []).find(r => r && r.key === x) || {}).name) || x));
    body.appendChild(h('div.sec', [h('h3', 'Wofür das alles'), h('div.muted', (ol.length ? 'Erarbeitet seit der Gründung: ' + ol.join(', ') + '. ' : '') + (home ? 'Der Ertrag geht nach ' + home.name + '.' : ''))]));
    body.appendChild(h('div.sec', [h('h3', 'Folgen'), h('div.muted', 'Die Menschen im Reich leben in Angst: Zufriedenheit und Loyalität sinken, solange das Lager besteht. Nachbarn verurteilen es, Demokratien besonders. Befreien lässt es sich durch Eroberung, einen Regierungswechsel oder das Weltgesetz „Lager".')]));
  };
  Panels.prototype.renderAnimal = function (a) {
    const { h, icon } = D();
    const cr = (WW.CREATURES && WW.CREATURES[a.kind]) || { name: a.kind };
    this.title(icon('a_' + a.kind + '_0', 28), cr.name || a.kind, cr.hostile ? 'Raubtier' : 'Tier');
    const body = this.$('infoBody');
    body.appendChild(h('div.sec', [h('div.barline', [h('span', 'Lebenskraft'), h('b', Math.round(a.hp) + ' / ' + Math.round(a.maxHp || cr.hp || a.hp))]),
      h('div.bar', [h('b', { style: { width: Math.round(100 * a.hp / Math.max(1, a.maxHp || cr.hp || a.hp)) + '%' } })])]));
    body.appendChild(h('div.sec', h('div.muted', cr.hostile ? 'Hält sich für den Chef im Wald. Die Schafe sehen das ähnlich.' : 'Kaut, guckt, kaut weiter.')));
  };

  // ------------------------------------------------------------------ Dialoge
  Panels.prototype.modalOpen = function () { return !this.$('modal').hidden || !this.$('newworld').hidden; };
  Panels.prototype.openModal = function (title, content, opt) {
    const { h, icon } = D();
    const t = this.$('modalTitle');
    D().clear(t);
    if (opt && opt.icon) t.appendChild(icon(opt.icon, 28));
    t.appendChild(h('span', title));
    const b = this.$('modalBody');
    D().clear(b);
    D().add(b, content);
    b.scrollTop = 0;
    this.$('modal').hidden = false;
    this.game.uiSound('open');
    this.modalKind = opt && opt.kind;
    this.$('modalClose').hidden = !!(opt && opt.noClose);
    const f = b.querySelector('.btn.primary') || this.$('modalClose');
    if (f && !('ontouchstart' in window)) setTimeout(() => f.focus({ preventScroll: true }), 30);
  };
  Panels.prototype.closeModal = function () {
    if (this.$('modal').hidden) return;
    this.$('modal').hidden = true;
    this.game.uiSound('close');
    const k = this.modalKind; this.modalKind = null;
    if (k === 'welcome') this.game.welcomeDone();
  };

  Panels.prototype.openMenu = function () {
    const { h, icon } = D();
    const game = this.game;
    const item = (ic, title, sub, fn, cls) => h('button.btn' + (cls || ''), { type: 'button', on: { click: fn } }, [icon(ic, 30), h('span', [title, h('small', sub)])]);
    const grid = h('div.menu-grid', [
      item('i_newworld', 'Neue Welt', 'Größe, Landform, Völker', () => { this.closeModal(); this.openNewWorld(); }),
      item('i_save', 'Speichern', 'Auf den Speicherplatz', () => { game.saveGame(true); this.closeModal(); }),
      item('i_load', 'Laden', 'Speicherplatz oder Autosave', () => this.openLoad()),
      item('i_laws', 'Weltgesetze', 'Kriege, Hunger, Altern …', () => this.openLaws()),
      item('i_chronicle', 'Chronik', 'Alles, was geschah', () => this.openChronicle()),
      item('i_map', 'Minikarte', 'Ein- oder ausblenden', () => { this.toggleMinimap(); this.closeModal(); }),
      game.sim && game.sim.state.pollution ? item(WW.Sprites.has('i_view_air') ? 'i_view_air' : 'i_map', 'Luftkarte', 'Verschmutzung und Wind zeigen', () => { game.toggleAirView(); this.closeModal(); }) : null,
      game.v3 && game.v3.available() ? item('i_map', 'Ansicht: ' + (game.mode === '3d' ? '3D' : 'Pixel'), 'Umschalten auf ' + (game.mode === '3d' ? 'Pixel' : '3D') + ' (Taste V)', () => { game.toggleMode(); this.closeModal(); }) : null,
      item(WW.Sprites.has('i_night') ? 'i_night' : 'i_newworld', 'Grafik', 'Tag/Nacht, Wetter, Qualität', () => this.openGraphics()),
      WW.Audio ? item(WW.Sprites.has('i_music') ? 'i_music' : 'i_chronicle', 'Ton', game.audioSet.on ? 'An · Lautstärken einstellen' : 'Aus', () => this.openSound()) : null,
      item('i_inspect', 'Kurzanleitung', 'Die drei wichtigsten Tipps', () => this.showWelcome())
    ]);
    const keys = h('p.muted', { style: { marginTop: '12px', marginBottom: '0' } },
      'Tasten: WASD/Pfeile verschieben · Mausrad zoomt · Leertaste+Ziehen oder rechte Maustaste verschiebt · 0 Pause, 1–5 Tempo, Leertaste Pause · Esc = Schauen · C Chronik · M Minikarte');
    this.openModal('Menü', [grid, window.matchMedia('(pointer: fine)').matches ? keys : null], { icon: 'i_menu' });
  };

  // Chronik: neueste zuerst; Filter nach Gruppe (WW.EVENT_GROUPS) und Reich, Wirkung als zweite Zeile
  // Ton: an/aus, Regler (gespeichert)
  Panels.prototype.openSound = function () {
    const { h } = D();
    const game = this.game, a = game.audioSet;
    const box = h('div');
    const render = () => {
      D().clear(box);
      box.appendChild(h('div.law', [h('div.lt', [h('b', 'Ton'), h('span', 'Neuer Ton aus echten Aufnahmen: Musik, Umgebung und Effekte. Beim ersten Start aus.')]),
        h('button.btn.switch' + (a.on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': a.on ? 'true' : 'false', on: { click: () => { a.on = !a.on; game.audioApply(); render(); } } }, a.on ? 'An' : 'Aus')]));
      for (const r of [['master', 'Gesamt'], ['music', 'Musik'], ['ambient', 'Umgebung'], ['effects', 'Effekte']]) {
        const val = h('em', Math.round(a[r[0]] * 100) + ' %');
        const inp = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(a[r[0]] * 100)), 'aria-label': r[1],
          on: { input: () => { a[r[0]] = inp.value / 100; val.textContent = inp.value + ' %'; game.audioApply(); } } });
        box.appendChild(h('div.snd-row', [h('span', r[1]), inp, val]));
      }
    };
    render();
    this.openModal('Ton', [box], { icon: WW.Sprites.has('i_music') ? 'i_music' : 'i_menu' });
  };
  // Grafik der Pixel-Ansicht: Tag/Nacht, Wetter, Wolkenschatten, Wasser, Qualität
  Panels.prototype.openGraphics = function () {
    const { h } = D();
    const game = this.game, gx = game.gfx;
    const box = h('div');
    const render = () => {
      D().clear(box);
      for (const r of [['daynight', 'Tag und Nacht', 'Ein Tag je Spieljahr: Morgenrot, Mittag, Abendlicht, Nacht mit Lichtern.'],
        ['weather', 'Wetter', 'Regenschauer, Schnee in kalten Gegenden, Morgennebel, Gewitter.'],
        ['clouds', 'Wolkenschatten', 'Weiche Schatten ziehen mit dem Wind über das Land.'],
        ['water', 'Lebendiges Wasser', 'Glitzern, Strömung und Brandung.'],
        ['sharp', 'Volle Auflösung', 'Zeichnet in der vollen Auflösung des Bildschirms. Schärfer, aber deutlich langsamer – nur für starke Geräte.'],
        ['fps', 'Bildrate anzeigen', 'Zeigt oben die Bilder pro Sekunde. Mehr als die Bildwiederholrate des Bildschirms (meist 60 oder 120) kann kein Spiel im Browser zeigen.']]) {
        const on = gx[r[0]] !== false;
        box.appendChild(h('div.law', [h('div.lt', [h('b', r[1]), h('span', r[2])]),
          h('button.btn.switch' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', on: { click: () => { gx[r[0]] = !on; game.applyGfx(); render(); } } }, on ? 'An' : 'Aus')]));
      }
      box.appendChild(h('div.muted', { style: { margin: '12px 0 6px' } }, 'Qualität (niedrig läuft am schnellsten: einfacher Boden, weniger Partikel). Ruckelt es, schaltet das Spiel von selbst Effekte ab.'));
      const chips = h('div.chips');
      for (const q of [['low', 'Niedrig'], ['mid', 'Mittel'], ['high', 'Hoch']]) chips.appendChild(h('button.chip', { type: 'button', 'aria-pressed': gx.quality === q[0] ? 'true' : 'false',
        on: { click: () => { gx.quality = q[0]; game.applyGfx(); render(); } } }, h('span', q[1])));
      box.appendChild(chips);
      if (game.v3) box.appendChild(h('div.law', { style: { marginTop: '10px' } }, [h('div.lt', [h('b', 'Ansicht'), h('span', game.mode === '3d' ? 'Gerade: 3D' : 'Gerade: Pixel')]),
        h('button.btn', { type: 'button', on: { click: () => { game.toggleMode(); render(); } } }, game.mode === '3d' ? 'Pixel' : '3D')]));
    };
    render();
    this.openModal('Grafik', [box], { icon: WW.Sprites.has('i_weather') ? 'i_weather' : 'i_newworld' });
  };

  Panels.prototype.openChronicle = function () {
    const { h, icon } = D();
    const game = this.game, sim = game.sim;
    const f = this.chronFilter || (this.chronFilter = { group: null, kingdom: null });
    const all = sim.state.events.slice().reverse();
    const box = h('div');
    const render = () => {
      D().clear(box);
      // Gruppen-Chips (nur wenn Ereignisse Gruppen tragen)
      const groups = [];
      for (const e of all) if (e.group && groups.indexOf(e.group) < 0) groups.push(e.group);
      if (groups.length) {
        const names = WW.EVENT_GROUPS || {};
        const nm = (g) => { const v = Array.isArray(names) ? (names.find(x => x.key === g) || {}).name : names[g]; return (v && (v.name || v)) || g; };
        const chips = h('div.chips', { style: { marginBottom: '8px' } });
        chips.appendChild(h('button.chip', { type: 'button', 'aria-pressed': !f.group ? 'true' : 'false', on: { click: () => { f.group = null; render(); } } }, h('span', 'Alle')));
        for (const g of groups) chips.appendChild(h('button.chip', { type: 'button', 'aria-pressed': f.group === g ? 'true' : 'false', on: { click: () => { f.group = g; render(); } } }, h('span', nm(g))));
        box.appendChild(chips);
      }
      if (f.kingdom != null) {
        const k = sim.query.kingdom(f.kingdom);
        box.appendChild(h('div.row', { style: { marginBottom: '8px' } }, [h('span.muted', 'Nur:'), h('span.badge', k ? k.name : 'vergangenes Reich'),
          h('button.chip', { type: 'button', on: { click: () => { f.kingdom = null; render(); } } }, [icon('i_close', 18), h('span', 'Alle Reiche')])]));
      }
      const list = h('div.evlist');
      let n = 0;
      for (const e of all) {
        if (f.group && e.group !== f.group) continue;
        if (f.kingdom != null && e.kingdomId !== f.kingdom) continue;
        if (n++ >= 300) break;
        const can = e.x >= 0 && e.y >= 0;
        const k = e.kingdomId >= 0 ? sim.query.kingdom(e.kingdomId) : null;
        list.appendChild(h('div.ev' + (can ? '' : '.nojump'), { role: 'button', tabindex: '0', on: { keydown: (ev) => { if (ev.key === 'Enter') ev.currentTarget.click(); }, click: (ev) => { if (ev.target.closest('.kfil')) return; if (!can) return; this.closeModal(); game.jumpToEvent(e); } } },
          [h('span.yr', 'Jahr ' + e.year), h('span', [e.text, e.effectText ? h('span.fx-line', e.effectText) : null,
            k && f.kingdom == null ? h('button.link.kfil', { type: 'button', style: { fontSize: '12px', display: 'block', marginTop: '2px' }, on: { click: () => { f.kingdom = k.id; render(); } } }, k.name) : null])]));
      }
      if (!n) list.appendChild(h('p.muted', all.length ? 'Nichts in diesem Filter.' : 'Noch ist nichts geschehen. Das ändert sich gleich.'));
      box.appendChild(list);
    };
    render();
    this.openModal('Chronik', [h('p.muted', 'Antippen springt zur Stelle auf der Karte, ein Reichsname filtert.'), box], { icon: 'i_chronicle', kind: 'chronicle' });
  };

  Panels.prototype.openLaws = function () {
    const { h, icon } = D();
    const sim = this.game.sim;
    const box = h('div');
    const render = () => {
      D().clear(box);
      for (const l of WW.LAW_INFO) {
        const on = !!sim.state.laws[l.key];
        box.appendChild(h('div.law', [h('div.lt', [h('b', l.name), h('span', l.desc)]),
          h('button.btn.switch' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': l.name,
            on: { click: () => { sim.actions.setLaw(l.key, !on); render(); this.game.autosaveSoon(); } } }, on ? 'An' : 'Aus')]));
      }
    };
    render();
    this.openModal('Weltgesetze', [box], { icon: 'i_laws' });
    void icon;
  };

  Panels.prototype.openLoad = function () {
    const { h, icon } = D();
    const game = this.game;
    const slots = game.listSaves();
    const box = h('div.evlist');
    for (const s of slots) {
      box.appendChild(h('button.ev', { type: 'button', on: { click: () => { this.closeModal(); game.loadSlot(s.key); } } },
        [icon(s.auto ? 'i_load' : 'i_save', 28), h('span', [h('b', (s.auto ? 'Autosave: ' : 'Speicherplatz: ') + (s.name || 'Welt')), h('br'),
          h('span.muted', 'Jahr ' + s.year + ' · ' + s.when)])]));
    }
    if (!slots.length) box.appendChild(h('p.muted', 'Noch nichts gespeichert. Über „Speichern" legst du einen Spielstand an; zusätzlich speichert das Spiel jede Minute automatisch.'));
    this.openModal('Laden', [box], { icon: 'i_load' });
  };

  Panels.prototype.confirm = function (title, text, yes, fn) {
    const { h } = D();
    this.openModal(title, [h('p', text), h('div.confirm-row', [
      h('button.btn', { type: 'button', on: { click: () => this.closeModal() } }, 'Abbrechen'),
      h('button.btn.primary', { type: 'button', on: { click: () => { this.closeModal(); fn(); } } }, yes)])]);
  };

  Panels.prototype.showWelcome = function () {
    const { h, icon } = D();
    const tips = h('ul.tips', [
      h('li', [icon('i_settlers', 32), h('div', [h('b', 'Siedler aussetzen. '), 'Unter „Leben" auf freies Land tippen: Ein neues Volk gründet eine Stadt und baut bald selbst eine Mauer.'])]),
      h('li', [icon('i_gov_monarchy', 32), h('div', [h('b', 'Regierung bestimmen. '), 'Unter „Herrschaft" einen Stempel wählen und auf ein Reich tippen. Oder ein Reich antippen und im Fenster umschalten.'])]),
      h('li', [icon('i_lightning', 32), h('div', [h('b', 'Gott spielen. '), 'Land malen, Blitze werfen, segnen. Ziehen verschiebt die Karte, zwei Finger oder das Mausrad zoomen.'])])
    ]);
    this.openModal('Willkommen in Wuselwelt', [h('p.welcome-lead', 'Kleine Völker wuseln, bauen Städte und Mauern und regieren sich selbst – mal klug, mal albern. Du bist der Gott mit dem großen Zeigefinger.'), tips,
      h('div.confirm-row', [h('button.btn.primary', { type: 'button', on: { click: () => this.closeModal() } }, 'Los geht\'s')])], { kind: 'welcome' });
  };

  Panels.prototype.openNewWorld = function () { this.game.newWorldScreen.open(); };
  Panels.prototype.toggleMinimap = function () { this.game.minimap.toggle(); };

  WW.UI = WW.UI || {};
  WW.UI.Panels = Panels;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
