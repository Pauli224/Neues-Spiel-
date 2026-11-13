// Wuselwelt – Start, Spielschleife (fester Zeitschritt), Werkzeuge anwenden, Speichern/Laden.
(function (WW) { 'use strict';
  const D = () => WW.UI.dom;
  const SAVE_KEY = 'wuselwelt.save', AUTO_KEY = 'wuselwelt.auto', WELCOME_KEY = 'wuselwelt.welcomed', SPEED_KEY = 'wuselwelt.speed';
  const TICK = 1 / 10;   // Sekunden je Sim-Schritt bei 1×

  const game = {
    sim: null, cam: null, renderer: null, input: null, canvas: null,
    hud: null, ui: null, minimap: null, newWorldScreen: null,
    tool: null, toolId: 'inspect', opts: { brush: 3, race: 'random', gov: null },
    speed: 1, paused: false, acc: 0, select: null, followId: null, pairFirst: null,
    prev: new Map(), lastEventId: 0, perf: { tickMs: 0, ticks: 0 }
  };
  WW.game = game;

  // ------------------------------------------------------------------ Werkzeuge
  game.setTool = function (id) {
    const t = WW.UI.Tools.get(id);
    if (!t || t.kind === 'sep' || t.kind === 'action') return;
    game.tool = t; game.toolId = id;
    game.pairFirst = null;
    game.hud.toolChanged();
  };

  game.setSpeed = function (v) {
    game.speed = v;
    game.hud.speedChanged(v);
    D().store.set(SPEED_KEY, String(v));
  };

  function tileOf(sx, sy) { const w = game.cam.screenToWorld(sx, sy); return { x: w.x / 8, y: w.y / 8 }; }
  function inMap(x, y) { const st = game.sim.state; return x >= 0 && y >= 0 && x < st.W && y < st.H; }

  // Malen (Kacheln, Fließkomma); first = Strichbeginn
  game.paintAt = function (x, y, first) {
    const t = game.tool;
    if (t.kind !== 'paint' || !inMap(x, y)) return;
    const key = (x | 0) + ',' + (y | 0);
    if (!first && game._lastDab === key) return;
    game._lastDab = key;
    const b = WW.UI.Tools.BRUSHES.find(z => z.id === game.opts.brush) || WW.UI.Tools.BRUSHES[1];
    game.sim.actions.paintTerrain(x, y, b.r, t.terrain);
  };
  game.endStroke = function () { game._lastDab = null; game.input.lastPaint = null; game.autosaveSoon(); };

  // Tippen auf die Karte (Bildschirmkoordinaten)
  game.tapAt = function (sx, sy) {
    const t = game.tool, p = tileOf(sx, sy), sim = game.sim;
    if (t.kind === 'look') return game.inspectAt(sx, sy, p);
    if (!inMap(p.x, p.y)) return;
    if (t.kind === 'tap') { t.apply(game, p.x, p.y); game.autosaveSoon(); return; }
    if (t.kind === 'pair') {
      const k = sim.query.kingdomAt(p.x, p.y);
      if (!k) { game.hud.hint('Dort ist kein Reich. Tippe auf eine Stadt oder ihr Gebiet.'); return; }
      if (game.pairFirst == null || !sim.query.kingdom(game.pairFirst)) {
        game.pairFirst = k.id;
        game.hud.renderOpts();
        game.hud.hint(k.name + ' gewählt. Jetzt das zweite Reich antippen.', true);
        return;
      }
      if (k.id === game.pairFirst) { game.hud.hint('Das ist dasselbe Reich. Tippe ein anderes an.'); return; }
      const a = game.pairFirst;
      game.pairFirst = null;
      game.hud.renderOpts();
      game.setRelation(a, k.id, t.relation);
    }
  };

  // Göttliche Hand: aufnehmen, tragen, absetzen
  game.grabAt = function (sx, sy) {
    const sim = game.sim, a = sim.actions, p = tileOf(sx, sy);
    if (!a.grab) return false;
    const u = sim.query.unitNear(p.x, p.y - 0.3, Math.max(0.8, 12 / (game.cam.zoom * 8)));
    const an = !u && sim.query.animalNear ? sim.query.animalNear(p.x, p.y - 0.2, Math.max(0.8, 12 / (game.cam.zoom * 8))) : null;
    const obj = u || an;
    if (!obj) return false;
    let ok = false;
    try { ok = a.grab(obj.id) !== false; } catch (e) { ok = false; }
    if (!ok) return false;
    game.held = { obj: obj, animal: !u, x: p.x, y: p.y };
    return true;
  };
  game.grabMove = function (sx, sy) { if (game.held) { const p = tileOf(sx, sy); game.held.x = p.x; game.held.y = p.y; } };
  game.dropAt = function (sx, sy) {
    if (!game.held) return;
    const p = tileOf(sx, sy);
    try { game.sim.actions.drop(Math.max(0, Math.min(game.sim.state.W - 0.5, p.x)), Math.max(0, Math.min(game.sim.state.H - 0.5, p.y + 0.4))); } catch (e) { /* egal */ }
    game.held = null;
    game.afterAction();
  };

  game.inspectAt = function (sx, sy, p) {
    const sim = game.sim, q = sim.query;
    const lc = game.renderer.labelAt(sx, sy);
    if (lc) return game.selectCity(lc.id, false);
    const r = Math.max(0.7, 10 / (game.cam.zoom * 8));
    // genau getroffene Figur zuerst, dann Gebäude (Stadt), dann Figuren in der Nähe
    const s = q.structAt(p.x, p.y);
    const near = s ? null : q.unitNear(p.x, p.y - 0.3, Math.min(r, 0.45));
    if (near) return game.selectUnit(near.id, false);
    if (s && s.cityId >= 0 && s.type !== 'field' && q.city(s.cityId)) {
      if (game.ui.sel && game.ui.sel.kind === 'city' && game.ui.sel.id === s.cityId) return game.selectKingdom(q.city(s.cityId).kingdomId, false);
      return game.selectCity(s.cityId, false);
    }
    const u = q.unitNear(p.x, p.y - 0.3, r);
    if (u) return game.selectUnit(u.id, false);
    const a = q.animalNear ? q.animalNear(p.x, p.y - 0.2, r) : null;
    if (a) { game.select = { kind: 'unit', obj: a, animal: true }; game.ui.showInfo({ kind: 'animal', id: a.id }); return; }
    const c = q.cityAt(p.x, p.y);
    if (c) {
      // zweites Antippen derselben Stadt zeigt das Reich
      if (game.ui.sel && game.ui.sel.kind === 'city' && game.ui.sel.id === c.id) return game.selectKingdom(c.kingdomId, false);
      return game.selectCity(c.id, false);
    }
    game.followId = null;
    game.ui.closeInfo();
  };

  game.selectUnit = function (id, fly) {
    const u = game.sim.query.unit(id);
    if (!u) return;
    game.select = { kind: 'unit', obj: u };
    game.ui.showInfo({ kind: 'unit', id: id });
    if (fly) game.flyTo(u.x, u.y);
  };
  game.selectCity = function (id, fly) {
    const c = game.sim.query.city(id);
    if (!c) return;
    game.select = { kind: 'city', obj: c };
    game.ui.showInfo({ kind: 'city', id: id });
    if (fly) game.flyTo(c.cx + 0.5, c.cy + 0.5);
  };
  game.selectKingdom = function (id, fly) {
    const k = game.sim.query.kingdom(id);
    if (!k) return;
    const cap = game.sim.query.city(k.capitalId) || game.sim.query.city(k.cityIds[0]);
    game.select = cap ? { kind: 'city', obj: cap } : null;
    game.ui.showInfo({ kind: 'kingdom', id: id });
    if (fly && cap) game.flyTo(cap.cx + 0.5, cap.cy + 0.5);
  };
  game.follow = function (id) { game.followId = game.followId === id ? null : id; game.ui.refreshInfo(true); };

  // Kamera zu Kachel; auf dem Handy etwas über die Mitte (Blatt verdeckt unten)
  game.flyTo = function (tx, ty, zoom) {
    const cam = game.cam;
    let wy = ty * 8;
    const z = zoom || Math.max(cam.zoom, cam.crispZoom(2.5));
    if (window.innerWidth < 760 && !document.getElementById('info').hidden) wy += cam.viewH * 0.22 / z;
    cam.flyTo(tx * 8, wy, z, 450);
    game.followId = null;
  };
  game.jumpToEvent = function (e) {
    if (e.cityId >= 0 && game.sim.query.city(e.cityId)) { game.selectCity(e.cityId, true); return; }
    game.flyTo(e.x + 0.5, e.y + 0.5);
  };

  // ------------------------------------------------------------------ Gotteshandlungen mit Rückmeldung
  game.spawnSettlers = function (x, y) {
    const o = game.opts, sim = game.sim;
    let race = o.race;
    if (race === 'random') {
      const t = WW.TERRAIN[sim.state.terrain[(y | 0) * sim.state.W + (x | 0)]];
      const fit = WW.RACE_KEYS.filter(r => WW.RACES[r].favTerrain.indexOf(t.key) >= 0);
      const pool = fit.length ? fit : ['human'];
      race = pool[(Math.random() * pool.length) | 0];
    }
    if (!WW.TERRAIN_LUT.walk[sim.state.terrain[(y | 0) * sim.state.W + (x | 0)]] && !sim.query.cityAt(x, y)) { game.hud.hint('Siedler brauchen festen Boden unter den Füßen.'); return null; }
    const res = sim.actions.spawnSettlers(x, y, 6, o.gov, race);
    if (!res) game.hud.hint('Hier können keine Siedler leben. Versuch es auf freier Wiese.');
    return res;
  };
  game.spawnAnimal = function (x, y, kind) {
    const r = game.sim.actions.spawnAnimal(x, y, kind);
    if (r == null) game.hud.hint('Hier mag das Tier nicht stehen.');
    return r;
  };
  game.spawnLair = function (x, y, kind) {
    const a = game.sim.actions;
    const r = a.spawnLair ? a.spawnLair(x, y, kind) : null;
    if (r == null || r === false) game.hud.hint('Hier passt dieser Ort nicht hin.');
    return r;
  };
  game.stampGov = function (x, y, gov) {
    const sim = game.sim, k = sim.query.kingdomAt(x, y);
    if (!k) { game.hud.hint('Tippe auf eine Stadt oder ihr Gebiet.'); return false; }
    if (k.gov === gov && k.govLocked) { game.hud.hint(k.name + ' ist schon ' + WW.GOVERNMENTS[gov].name + '.'); return false; }
    return game.setGov(k.id, gov);
  };
  game.setGov = function (kid, gov) {
    const ok = game.sim.actions.setGovernment(kid, gov, { lock: true });
    game.afterAction();
    return ok;
  };
  game.setRelation = function (a, b, rel) {
    const sim = game.sim, ka = sim.query.kingdom(a), kb = sim.query.kingdom(b);
    const ok = sim.actions.setRelation(a, b, rel);
    if (!ok && ka && kb) {
      if (rel === 'war' && (WW.GOVERNMENTS[ka.gov].neverWar)) game.hud.toast(ka.name + ' weigert sich: Anarchisten erklären keine Kriege.', { warn: true });
      else game.hud.toast('Das hat nicht geklappt.', { warn: true });
    }
    game.afterAction();
    return ok;
  };
  game.strike = function (x, y, kind, opt) { const r = opt ? game.sim.actions.strike(x, y, kind, opt) : game.sim.actions.strike(x, y, kind); game.afterAction(); return r; };

  // Kräfte mit Halten/Ziehen: Ziel nachführen (aim), Richtung ziehen (direction), Spur zeichnen (trace)
  game.dragStart = function (sx, sy) {
    const t = game.tool, p = tileOf(sx, sy), sim = game.sim;
    if (!inMap(p.x, p.y)) { game.drag = null; return; }
    game.drag = { mode: t.drag, power: t.power, x0: p.x, y0: p.y, x: p.x, y: p.y, last: null, id: null };
    if (t.drag === 'aim') {
      const before = new Set((sim.state.aircraft || []).map(a => a.id));
      const r = game.strike(p.x, p.y, t.power);
      let id = typeof r === 'number' ? r : (r && r.id != null ? r.id : null);
      if (id == null) for (const a of (sim.state.aircraft || [])) if (!before.has(a.id) && (!a.kind || a.kind === t.power)) id = a.id;
      game.drag.id = id;
    } else if (t.drag === 'trace') { game.strike(p.x, p.y, t.power); game.drag.last = p; }
  };
  game.dragMove = function (sx, sy) {
    const d = game.drag, sim = game.sim;
    if (!d) return;
    const p = tileOf(sx, sy);
    d.x = p.x; d.y = p.y;
    if (d.mode === 'aim' && d.id != null && sim.actions.aimAircraft) { try { sim.actions.aimAircraft(d.id, p.x, p.y); } catch (e) { /* egal */ } }
    else if (d.mode === 'trace' && inMap(p.x, p.y) && (!d.last || Math.hypot(p.x - d.last.x, p.y - d.last.y) >= 1.2)) { game.strike(p.x, p.y, d.power); d.last = p; }
  };
  game.dragEnd = function (sx, sy, cancel) {
    const d = game.drag;
    game.drag = null;
    if (!d || cancel) return;
    if (d.mode === 'direction') {
      const p = tileOf(sx, sy);
      let dx = p.x - d.x0, dy = p.y - d.y0;
      const l = Math.hypot(dx, dy);
      if (l < 0.8) { dx = 1; dy = 0; } else { dx /= l; dy /= l; }
      game.strike(d.x0, d.y0, d.power, { dx: dx, dy: dy });
    }
  };
  game.afterAction = function () { game.pollEvents(); game.ui.refreshInfo(true); game.autosaveSoon(); };

  // ------------------------------------------------------------------ Tastatur
  game.onKey = function (k, e) {
    if (game.ui.modalOpen()) { if (k === 'Escape') { if (!document.getElementById('newworld').hidden) game.newWorldScreen.close(); else game.ui.closeModal(); } return; }
    if (k === 'Escape') { if (game.toolId !== 'inspect') game.hud.pickCat('look'); else game.ui.closeInfo(); return; }
    const sp = { 0: 0, 1: 1, 2: 3, 3: 8 };
    if (k in sp) { game.setSpeed(sp[k]); return; }
    if (k === 'p' || k === 'P') { game.setSpeed(game.speed ? 0 : 1); return; }
    if (k === 'c' || k === 'C') { game.ui.openChronicle(); return; }
    if (k === 'm' || k === 'M') { game.ui.toggleMinimap(); return; }
    if (k === '+' || k === '=') { game.cam.animateZoom(game.cam.crispZoom(game.cam.zoom * 1.6)); return; }
    if (k === '-' || k === '_') { game.cam.animateZoom(game.cam.crispZoom(game.cam.zoom / 1.6)); return; }
    void e;
  };
  game.onUserActivity = function () { game.followId = null; };

  // ------------------------------------------------------------------ Chronik-Meldungen
  game.pollEvents = function () {
    const ev = game.sim.state.events;
    if (!ev.length) return;
    const last = ev[ev.length - 1];
    if (last.id <= game.lastEventId) return;
    const fresh = ev.filter(e => e.id > game.lastEventId);
    game.lastEventId = last.id;
    // höchstens zwei neue zeigen, die neuesten
    for (const e of fresh.slice(-2)) {
      game.hud.toast(e.text, { year: e.year, warn: /war|revolt|gone|fall|conquer|plague|coup|fire/i.test(e.type),
        onClick: (e.x >= 0 ? () => game.jumpToEvent(e) : null) });
    }
  };

  // ------------------------------------------------------------------ Welt starten
  function attachSim(sim) {
    game.sim = sim;
    game.prev.clear();
    game.acc = 0;
    game.select = null; game.followId = null; game.pairFirst = null;
    game.ui.closeInfo();
    game.cam.setWorld(sim.state.W, sim.state.H);
    game.renderer.setWorld(sim.state, game.cam);
    sim.drainDirtyTiles(); sim.drainFx();
    const ev = sim.state.events;
    game.lastEventId = ev.length ? ev[ev.length - 1].id : 0;
    game.minimap.setWorld();
    game.hud.updateStats();
    // Kamera auf die größte Stadt
    let best = null;
    for (const c of sim.state.cities) if (!best || c.pop > best.pop) best = c;
    const z = game.cam.crispZoom(window.innerWidth < 760 ? 2 : 3);
    game.cam.zoom = z;
    if (best) { game.cam.x = (best.cx + 0.5) * 8; game.cam.y = (best.cy + 1.5) * 8; }
    else {
      // leere Welt: auf den besten Siedlungsplatz schauen
      const sp = sim._startSpots && sim._startSpots[0];
      game.cam.zoom = game.cam.crispZoom(window.innerWidth < 760 ? 1.5 : 2);
      if (sp) { game.cam.x = (sp.x + 0.5) * 8; game.cam.y = (sp.y + 0.5) * 8; } else { game.cam.x = sim.state.W * 4; game.cam.y = sim.state.H * 4; }
    }
    game.cam.clamp();
    game.renderer.queueAll(game.cam);
  }

  // einige hundert Schritte vorspulen, in Häppchen (Seite bleibt bedienbar)
  function prewarm(sim, n, done) {
    let left = n;
    const step = () => {
      const t0 = performance.now();
      while (left > 0 && performance.now() - t0 < 30) { sim.tick(); left--; }
      if (left > 0) setTimeout(step, 0); else done();
    };
    step();
  }

  game.newWorld = function (o) {
    showBoot('Die Welt wird geknetet …');
    setTimeout(() => {
      o = o || {};
      if (!o.world) { const wo = WW.UI.randomWorldOpts(o.seed || WW.UI.randSeed(), o.size || 'large'); o.seed = wo.seed; o.world = WW.WorldGen.generate(wo); }
      const races = o.races && o.races !== 'random' ? [o.races] : null;
      const sim = WW.Sim.create({ seed: o.seed, world: o.world, populate: o.populate == null ? 0 : o.populate, races: races,
        govs: o.govs === 'tribe' ? null : 'mixed', animals: o.animals !== false });
      prewarm(sim, sim.state.cities.length ? 1200 : 0, () => {
        attachSim(sim);
        hideBoot();
        game.hud.toast('Eine neue Welt: ' + (sim.state.worldName || 'Wuselwelt') + '.', { ms: 4000 });
        game.saveAuto();
      });
    }, 30);
  };

  function showBoot(msg) { const b = document.getElementById('boot'); document.getElementById('bootMsg').textContent = msg; b.hidden = false; b.classList.remove('done'); }
  function hideBoot() { const b = document.getElementById('boot'); b.classList.add('done'); setTimeout(() => { b.hidden = true; }, 320); }

  // ------------------------------------------------------------------ Speichern / Laden
  function stamp() { const d = new Date(); return d.toLocaleDateString('de-DE') + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
  function writeSlot(key) {
    const sim = game.sim;
    if (!sim) return false;
    let data;
    try { data = sim.serialize(); } catch (e) { return false; }
    const meta = JSON.stringify({ name: sim.state.worldName, year: sim.state.year, when: stamp() });
    return D().store.set(key, data) && D().store.set(key + '.meta', meta);
  }
  game.saveGame = function (manual) {
    const ok = writeSlot(SAVE_KEY);
    if (manual) game.hud.toast(ok ? 'Gespeichert. Die Welt ist sicher verstaut.' : 'Speichern ging nicht (Speicher voll oder gesperrt).', { warn: !ok, ms: 3000 });
    return ok;
  };
  game.saveAuto = function () { game._autoT = 0; return writeSlot(AUTO_KEY); };
  game.autosaveSoon = function () { game._autoDirty = true; };
  game.listSaves = function () {
    const out = [];
    for (const [key, auto] of [[SAVE_KEY, false], [AUTO_KEY, true]]) {
      const m = D().store.get(key + '.meta');
      if (!m || !D().store.get(key)) continue;
      try { const o = JSON.parse(m); out.push({ key: key, auto: auto, name: o.name, year: o.year, when: o.when }); } catch (e) { /* kaputt */ }
    }
    return out;
  };
  game.loadSlot = function (key) {
    const s = D().store.get(key);
    const sim = s ? WW.Sim.load(s) : null;
    if (!sim) { game.hud.toast('Dieser Spielstand ließ sich nicht laden.', { warn: true }); return false; }
    attachSim(sim);
    game.hud.toast('Geladen: ' + (sim.state.worldName || 'Welt') + ', Jahr ' + sim.state.year + '.', { ms: 3000 });
    return true;
  };
  game.welcomeDone = function () { D().store.set(WELCOME_KEY, '1'); };

  // ------------------------------------------------------------------ Schleife
  let last = 0, statT = 0, infoT = 0, decayT = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    last = now;
    resize();
    const sim = game.sim;
    if (!sim) return;
    game.input.update(dt);
    // Kamera folgt einer Figur
    if (game.followId != null) {
      const u = sim.query.unit(game.followId);
      if (u) { game.cam.x += (u.x * 8 - game.cam.x) * Math.min(1, dt * 6); game.cam.y += (u.y * 8 - game.cam.y) * Math.min(1, dt * 6); game.cam.clamp(); }
      else game.followId = null;
    }
    game.cam.update(dt, reducedMotion);

    // feste Schritte
    const running = game.speed > 0 && !game.paused && !document.hidden;
    if (running) {
      game.acc += dt * game.speed / TICK;
      const maxN = Math.ceil(game.speed * 2) + 2;
      let n = 0;
      const t0 = performance.now();
      while (game.acc >= 1 && n < maxN) {
        storePrev(sim);
        sim.tick();
        n++; game.acc -= 1;
        if ((sim.state.tick & 1) === 0) game.renderer.trample(sim.state.units);
        if (performance.now() - t0 > 14) { game.acc = Math.min(game.acc, 1); break; }
      }
      if (game.acc > 4) game.acc = 1;   // nicht hinterherhetzen
      if (n) {
        const ms = (performance.now() - t0) / n;
        game.perf.tickMs = game.perf.tickMs * 0.95 + ms * 0.05;
        game.perf.ticks += n;
        game.pollEvents();
      }
    }
    game.renderer.markTiles(sim.drainDirtyTiles());
    const fx = sim.drainFx();
    if (fx.length) game.renderer.addFx(fx);
    decayT += dt * (running ? game.speed : 0);
    if (decayT > 40) { decayT = 0; game.renderer.decayPaths(); }

    // Pinselvorschau
    let brush = null;
    const t = game.tool, hp = game.input.hover || (game.drag ? { x: 0, y: 0 } : null);
    if (game.drag && game.drag.mode === 'direction') brush = { x: game.drag.x0, y: game.drag.y0, x2: game.drag.x, y2: game.drag.y, kind: 'arrow' };
    else if (hp && t.kind !== 'look' && game.input.hover) {
      const p = tileOf(hp.x, hp.y);
      if (t.kind === 'paint') { const b = WW.UI.Tools.BRUSHES.find(z => z.id === game.opts.brush) || WW.UI.Tools.BRUSHES[1]; brush = { x: p.x, y: p.y, r: b.r, kind: 'tiles' }; }
      else if (game.drag && game.drag.mode === 'direction') brush = { x: game.drag.x0, y: game.drag.y0, x2: game.drag.x, y2: game.drag.y, kind: 'arrow' };
      else if (t.power) brush = { x: p.x, y: p.y, r: t.radius, kind: 'circle' };
      else brush = { x: p.x, y: p.y, kind: 'tile' };
    }
    const sel = game.select && game.select.obj && !game.select.obj.dead ? game.select : null;
    game.renderer.render(game.cam, { dt: dt, alpha: running ? Math.min(1, game.acc) : 1, prev: game.prev, select: sel, brush: brush, held: game.held, scale: game.cam.scale() / game.cam.dpr, firstFrames: game._first-- > 0 });

    statT -= dt; infoT -= dt;
    if (statT <= 0) { statT = 0.25; game.hud.updateStats(); }
    if (infoT <= 0) { infoT = 0.5; game.ui.refreshInfo(false); }
    game.minimap.update(dt);
    game._autoT = (game._autoT || 0) + dt;
    if (game._autoT > 60 || (game._autoDirty && game._autoT > 10)) { game._autoDirty = false; game.saveAuto(); }
  }

  // vorige Positionen für weiche Bewegung zwischen den Schritten
  function storePrev(sim) {
    const pv = game.prev;
    if (sim.state.tick % 300 === 0) pv.clear();
    for (const u of sim.state.units) { let p = pv.get(u.id); if (!p) pv.set(u.id, p = [0, 0]); p[0] = u.x; p[1] = u.y; }
    for (const a of sim.state.animals) { let p = pv.get(-a.id); if (!p) pv.set(-a.id, p = [0, 0]); p[0] = a.x; p[1] = a.y; }
  }

  // Leinwand an Größe und Gerätepixel anpassen
  let lastW = 0, lastH = 0, lastDpr = 0;
  function resize() {
    const cv = game.canvas;
    const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(3, window.devicePixelRatio || 1);
    if (w === lastW && h === lastH && dpr === lastDpr) return;
    lastW = w; lastH = h; lastDpr = dpr;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    game.cam.setView(w, h, dpr);
  }

  let reducedMotion = false;

  // ------------------------------------------------------------------ Start
  function start(save) {
    WW.Sprites.init();
    WW.UI.Tools.init();
    game.canvas = document.getElementById('world');
    game.cam = new WW.Camera();
    game.renderer = new WW.Renderer(game.canvas);
    game.renderer.structById = (id) => game.sim ? game.sim.query.struct(id) : null;
    game.ui = new WW.UI.Panels(game);
    game.hud = new WW.UI.Hud(game);
    game.minimap = new WW.UI.Minimap(game);
    game.newWorldScreen = new WW.UI.NewWorld(game);
    game.input = new WW.UI.Input(game.canvas, game.cam, game);
    try { reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* egal */ }
    game.renderer.reduced = reducedMotion;
    game.tool = WW.UI.Tools.get('inspect');
    game.ui.build();
    game.hud.build();
    resize();
    const sp = +D().store.get(SPEED_KEY);
    game.setSpeed([0, 1, 3, 8].indexOf(sp) >= 0 && sp > 0 ? sp : 1);
    game.setTool('inspect');
    game._first = 3;

    let sim = null;
    if (save) sim = WW.Sim.load(save);
    if (!sim) { const a = D().store.get(AUTO_KEY); if (a) sim = WW.Sim.load(a); }
    const firstVisit = !D().store.get(WELCOME_KEY);
    const go = (s) => {
      attachSim(s);
      hideBoot();
      requestAnimationFrame(frame);
      if (firstVisit) game.ui.showWelcome();
    };
    if (sim) go(sim);
    else {
      const seed = WW.UI.randSeed();
      setTimeout(() => {
        // erster Start: komplett zufällige, leere Welt (Größe Groß)
        const wo = WW.UI.randomWorldOpts(seed, 'large');
        const s = WW.Sim.create({ seed: wo.seed, world: WW.WorldGen.generate(wo), populate: 0 });
        prewarm(s, s.state.cities.length ? 1200 : 0, () => { go(s); game.saveAuto(); });
      }, 20);
    }
    // beim Verlassen sichern
    document.addEventListener('visibilitychange', () => { if (document.hidden && game.sim) game.saveAuto(); });
    window.addEventListener('pagehide', () => { if (game.sim) game.saveAuto(); });
    // Web-App: Service Worker nur bei http(s) und nicht im Artifact-Rahmen
    try {
      if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !window.claude && window.top === window.self) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
      }
    } catch (e) { /* egal */ }
  }

  // Live-Update-Haken (Claude-Artifact)
  function boot() {
    const hot = window.claude && window.claude.hot;
    if (hot && hot.snapshot) hot.snapshot(() => ({ save: game.sim ? game.sim.serialize() : null }));
    const run = (data) => start(data && data.save);
    if (hot && hot.ready) hot.ready(run); else run((hot && hot.data) || {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
