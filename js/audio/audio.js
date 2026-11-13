// =============================================================================
// Wuselwelt – Ton: öffentliche Schnittstelle WW.Audio. Alles mit der Web Audio API erzeugt, keine Dateien.
// Ladereihenfolge (nach der Simulation, vor js/main.js; braucht kein anderes Modul):
//   js/audio/audio-core.js, js/audio/audio-sfx.js, js/audio/audio-ambient.js, js/audio/audio-music.js, js/audio/audio.js
//
// SCHNITTSTELLE (wirft nie; ohne Web Audio tut alles still nichts)
//   init()                  einmal beim Start. Legt den AudioContext erst bei der ersten Nutzeraktion an
//                           (pointerdown/keydown/touchend auf window) und pausiert bei verdecktem Fenster.
//   onFx(fx)                jeden Eintrag aus sim.drainFx() übergeben (gleiche Fx im selben Moment werden zusammengefasst)
//   onEvent(eintrag)        jeden NEUEN Eintrag aus sim.state.events (alle Typen; gefiltert und gedrosselt wird hier)
//   update(state, cam, dt)  jedes Bild: state = sim.state, cam = { x, y, dist } (Kachelkoordinaten der Bildmitte,
//                           dist = halbe Sichtbreite in Kacheln, z. B. cam.viewW / 2 / cam.zoom / 8), dt in s
//   ui(name)                'click' | 'select' | 'tool' | 'error' | 'open' | 'close'
//   setVolume({ master, music, ambient, effects })   je 0..1 (fehlende Felder bleiben)
//   mute(bool), suspend(), resume(), state() -> { available, started, running, muted, suspended, hidden,
//                           volume, voices, maxVoices, beds, loops, mood }
//   Zusätzlich (für Testseite/Einstellungen): setMood('peace'|'war'|'dark'|null), unlock() (in einer Nutzeraktion aufrufen)
// =============================================================================
(function (WW) { 'use strict';

  const C = WW.AudioCore, S = WW.AudioSfx, A = WW.AudioAmbient, M = WW.AudioMusic;
  const RC = S.RECIPES;
  const hasWin = typeof window !== 'undefined';
  const AC = hasWin ? (window.AudioContext || window.webkitAudioContext) : null;

  const MAX_VOICES = 24;
  const GROUP_CAP = { amb: 7, animal: 4, music: 3, loop: 5 };
  const REF = { detail: 6, mid: 16, loud: 40, huge: 400 };

  let ctx = null, out = null, beds = null, timer = null, inited = false;
  const vol = { master: 0.8, music: 0.3, ambient: 0.7, effects: 0.8 };
  let muted = false, userSusp = false, hidden = false;
  const cam = { x: 0, y: 0, dist: 20, now: 0 };
  let camSet = false;
  const voices = [];
  const queue = [];
  const lastPlay = {};
  const loops = new Map();
  let mix = null, mixOverride = null, lastAnalyze = -1, lastPump = 0, lastUpdate = 0;
  let moodForce = null, darkUntil = 0, warOn = false, nextBar = 0, nextWave = 0, stingAt = -10;
  let rainSpots = [];
  let flushPending = false;
  const stats = { played: 0, dropped: 0, stolen: 0, peakVoices: 0, errors: 0 };

  function now() { return ctx ? ctx.currentTime : 0; }
  function safe(fn) { return function () { try { return fn.apply(null, arguments); } catch (e) { stats.errors++; return undefined; } }; }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  function unlock() {
    if (!AC) return false;
    if (!ctx) {
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; return false; } }
      out = C.makeOutput(ctx);
      beds = A.Beds(ctx, out.ambient);
      applyVol(0);
      nextBar = ctx.currentTime + 1.5;
      if (!timer) timer = setInterval(safe(pump), 100);
    }
    if (ctx.state !== 'running' && !userSusp && !hidden) { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* still */ } }
    return true;
  }
  function onGesture() { unlock(); }
  function init() {
    if (inited || !hasWin) return;
    inited = true;
    if (!AC) return;
    const o = { capture: true, passive: true };
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) window.addEventListener(ev, onGesture, o);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', safe(() => {
      hidden = !!document.hidden;
      if (!ctx) return;
      if (hidden) ctx.suspend().catch(() => {});
      else if (!userSusp) ctx.resume().catch(() => {});
    }));
  }

  function applyVol(fade) {
    if (!out) return;
    const t = now(), k = fade == null ? 0.08 : fade;
    const set = (p, v) => { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(v, t + k + 0.001); };
    set(out.master.gain, muted ? 0 : vol.master * vol.master);   // quadratisch: Regler fühlt sich gleichmäßiger an
    set(out.music.gain, vol.music * vol.music * 0.9);
    set(out.ambient.gain, vol.ambient * vol.ambient);
    set(out.effects.gain, vol.effects * vol.effects);
  }

  // ---------------------------------------------------------------------------
  // Raum: Lautstärke, Stereo, Dumpfheit und Verzögerung nach Lage zur Bildmitte
  // ---------------------------------------------------------------------------
  function spatial(x, y, cls) {
    if (cls === 'global' || x == null || !isFinite(x) || !isFinite(y)) return { gain: 1, pan: 0, lp: 0, delay: 0, wet: 0, d: 0 };
    const D = C.clamp(C.fin(cam.dist, 20), 3, 400);
    const dx = x - cam.x, dy = y - cam.y, d = Math.sqrt(dx * dx + dy * dy);
    const h = Math.max(4, D * 0.6);
    const reff = Math.sqrt(d * d + h * h);
    const ref = REF[cls] || 16;
    let gain = Math.min(1, ref / reff);
    gain *= gain > 0.3 ? 1 : Math.sqrt(gain / 0.3);   // leiser Rand fällt weich ab
    const pan = C.clamp(dx / Math.max(D, 6), -1, 1) * 0.85;
    const lp = d > 12 ? C.clamp(18000 / (1 + Math.pow(d / 25, 1.5)), 300, 18000) : 0;
    const delay = (cls === 'loud' || cls === 'huge') ? C.clamp((d - D * 0.8) * 0.008, 0, 2.5) : 0;
    const wet = C.clamp(0.05 + d / 120, 0, 0.6);
    return { gain, pan, lp, delay, wet, d };
  }

  // ---------------------------------------------------------------------------
  // Stimmen
  // ---------------------------------------------------------------------------
  function prune() {
    const t = now();
    for (let i = voices.length - 1; i >= 0; i--) {
      const v = voices[i];
      if (v.end < t) {
        try { v.out.disconnect(); if (v.pan) v.pan.disconnect(); if (v.lp) v.lp.disconnect(); if (v.send) v.send.disconnect(); } catch (e) { /* still */ }
        voices.splice(i, 1);
      }
    }
  }
  function groupCount(g) { let n = 0; for (const v of voices) if (v.group === g && v.end > now()) n++; return n; }
  function makeRoom(prio, group) {
    prune();
    if (group && GROUP_CAP[group] && groupCount(group) >= GROUP_CAP[group]) {
      if (group !== 'loop') return false;
    }
    if (voices.length < MAX_VOICES) return true;
    let victim = null;
    for (const v of voices) {
      if (v.dying) continue;
      if (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.start < victim.start)) victim = v;
    }
    if (!victim || victim.prio >= prio) return false;
    kill(victim, 0.04);
    stats.stolen++;
    const i = voices.indexOf(victim);
    if (i >= 0) voices.splice(i, 1);
    return true;
  }
  function kill(v, fade) {
    v.dying = true;
    C.stopVoice(ctx, v, fade);
    const o = v;
    setTimeout(() => { try { o.out.disconnect(); if (o.pan) o.pan.disconnect(); if (o.lp) o.lp.disconnect(); if (o.send) o.send.disconnect(); } catch (e) { /* still */ } }, (fade + 0.2) * 1000);
  }

  // opts: { x, y, p, bus, prio, gain, group, fn (eigene Funktion statt Rezept), cls }
  function playVoice(name, opts) {
    if (!ctx || !out || ctx.state === 'closed') return null;
    opts = opts || {};
    const rc = RC[name] || {};
    if (!opts.fn && !RC[name]) return null;
    const cls = opts.cls || rc.cls || 'mid';
    const sp = spatial(opts.x, opts.y, cls);
    const level = C.clamp(sp.gain * (rc.vol != null ? rc.vol : 1) * C.fin(opts.gain, 1), 0, 1);
    if (level < 0.006) { stats.dropped++; return null; }
    const prio = opts.prio != null ? opts.prio : (rc.prio || 3);
    if (!makeRoom(prio, opts.group)) { stats.dropped++; return null; }
    const t = now();
    const v = { name, prio, group: opts.group || null, start: t, end: t + 1, srcs: [], loop: !!rc.loop };
    const g = ctx.createGain(); g.gain.value = rc.loop ? 0 : level; v.out = g; v.level = level;
    let node = g;
    if (ctx.createStereoPanner) { v.pan = ctx.createStereoPanner(); v.pan.pan.value = sp.pan; node.connect(v.pan); node = v.pan; }
    if (sp.lp || rc.loop) { v.lp = ctx.createBiquadFilter(); v.lp.type = 'lowpass'; v.lp.frequency.value = sp.lp || 18000; v.lp.Q.value = 0.5; node.connect(v.lp); node = v.lp; }
    node.connect(opts.bus || out.effects);
    if (sp.wet > 0.08) { v.send = ctx.createGain(); v.send.gain.value = sp.wet; node.connect(v.send); v.send.connect(out.reverbIn); }
    const at = t + 0.015 + sp.delay;
    let dur;
    if (opts.fn) { try { dur = opts.fn(C.makeR(ctx, v), g, at); } catch (e) { dur = 0; stats.errors++; } }
    else dur = S.play(ctx, g, name, at, Object.assign({ far: C.clamp(sp.d / 90, 0, 1) }, opts.p || {}), v);
    if (!dur) { try { g.disconnect(); } catch (e) { /* still */ } return null; }
    if (rc.loop) { v.end = Infinity; g.gain.setTargetAtTime(level, t, 0.3); }
    else v.end = at + dur + 0.15;
    voices.push(v);
    stats.played++;
    if (voices.length > stats.peakVoices) stats.peakVoices = voices.length;
    return v;
  }

  function moveVoice(v, x, y, rate) {
    if (!v || !ctx) return;
    const rc = RC[v.name] || {};
    const sp = spatial(x, y, rc.cls || 'loud'), t = now();
    const level = C.clamp(sp.gain * (rc.vol != null ? rc.vol : 1), 0, 1);
    v.out.gain.setTargetAtTime(level < 0.006 ? 0 : level, t, 0.2);
    if (v.pan) v.pan.pan.setTargetAtTime(sp.pan, t, 0.2);
    if (v.lp) v.lp.frequency.setTargetAtTime(sp.lp || 18000, t, 0.3);
    if (rate && v.ctl && v.ctl.set) v.ctl.set('rate', rate, t);
  }

  // ---------------------------------------------------------------------------
  // Fx -> Klang
  // ---------------------------------------------------------------------------
  const FX = {
    explosion(f) { const s = S.sizeFromR(f.r); return ['explosion', { size: s }, 'explosion' + Math.round(s * 10)]; },
    bang: () => ['bang'], mushroom: (f) => ['nuke', { big: !!f.big }],
    bolt: () => ['thunder'], spark: () => ['spark'], meteor: () => ['meteor'], bombfall: () => ['bombfall'],
    quake: () => ['quake'], eruption: () => ['eruption'], lava: () => ['lava'], steam: () => ['steam'],
    flood: () => ['flood'], rain: () => ['rainburst'], acidrain: () => ['acid'], laser: () => ['laser'],
    smoke: () => ['collapse'], hit: () => ['hit'], dust: () => ['build'], wreck: () => ['wreck'], roof: () => ['roof'],
    debris: () => ['debris'], fling: () => ['fling'],
    tracer: (f) => [f.heavy ? 'tracer' : 'tracer', { heavy: !!f.heavy }, f.heavy ? 'tracerH' : 'tracer'],
    arrow: () => ['arrow'], bolt_shot: () => ['ballista'], ram: () => ['ram'],
    rock: (f, b) => (b.muzzle(f) ? ['cannon'] : ['catapult']),
    ward: () => ['ward'], spikes: () => ['spikes'], dud: () => ['dud'], alarm: () => ['alarm'], napalm: () => ['napalm'],
    sparkle: (f) => (f.r ? ['bless'] : ['chime', {}, 'chime']), heal: () => ['heal'], hearts: () => ['hearts'], goldrain: () => ['goldrain'],
    seeds: () => ['seeds'], breeze: () => ['breeze'], frost: () => ['frost'], drought: () => ['drought'],
    raise: () => ['terrain', { up: true }, 'raise'], lower: () => ['terrain', { up: false }, 'lower'],
    plague: () => ['plague'], poof: () => ['poof'], splash: () => ['splash'], fishjump: () => ['fishjump'],
    grab: () => ['grab'], drop: () => ['drop'], scare: () => ['scare'], split: () => ['split'], sandburst: () => ['sandburst'],
    snowball: () => ['snowball'], firebreath: () => ['firebreath'], egg: () => ['egg'], zombify: () => ['zombie'],
    govchange: () => ['chime', { big: true }, 'chimeBig'], restyle: () => ['chime', {}, 'chime'], centerStage: () => ['chime', { big: true }, 'chimeBig']
  };
  const DARK_FX = { mushroom: 90, bang: 40, meteor: 30, quake: 40, eruption: 40, plague: 40 };

  function onFx(fx) {
    if (!fx || typeof fx.type !== 'string') return;
    if (queue.length > 500) queue.shift();
    queue.push(fx);
    if (!flushPending) {
      flushPending = true;
      const run = safe(flush);
      if (typeof queueMicrotask === 'function') queueMicrotask(run); else setTimeout(run, 0);
    }
  }

  function flush() {
    flushPending = false;
    if (!queue.length) return;
    const batch = queue.splice(0, queue.length);
    if (!ctx || ctx.state !== 'running') return;
    const t = now();
    const muz = [];
    for (const f of batch) if (f.type === 'muzzle') muz.push(f);
    const B = { muzzle: (f) => muz.some((m) => Math.abs(m.x - f.x) < 0.05 && Math.abs(m.y - f.y) < 0.05) };
    const groups = new Map();
    for (const f of batch) {
      const h = FX[f.type];
      if (DARK_FX[f.type]) darkUntil = Math.max(darkUntil, t + DARK_FX[f.type]);
      if ((f.type === 'rain' || f.type === 'acidrain') && isFinite(f.x)) { rainSpots.push({ x: f.x, y: f.y, until: t + 8 }); if (rainSpots.length > 12) rainSpots.shift(); }
      if (!h) continue;
      const r = h(f, B);
      if (!r || !RC[r[0]]) continue;
      const key = r[2] || r[0];
      let x = f.x, y = f.y;
      if (f.type === 'quake' && isFinite(f.x2)) { x = (f.x + f.x2) / 2; y = (f.y + f.y2) / 2; }
      let g = groups.get(key);
      if (!g) { g = { name: r[0], p: r[1] || {}, key, n: 0, x, y, best: Infinity }; groups.set(key, g); }
      g.n++;
      const dd = isFinite(x) ? (x - cam.x) * (x - cam.x) + (y - cam.y) * (y - cam.y) : 0;
      if (dd < g.best) { g.best = dd; g.x = x; g.y = y; if (r[1]) g.p = r[1]; }
    }
    const list = Array.from(groups.values()).sort((a, b) => (RC[b.name].prio || 0) - (RC[a.name].prio || 0));
    let played = 0;
    for (const g of list) {
      if (played >= 8) { stats.dropped++; continue; }
      const rc = RC[g.name];
      if (lastPlay[g.key] != null && t - lastPlay[g.key] < (rc.gap || 0.05)) { stats.dropped++; continue; }
      const p = Object.assign({}, g.p, { count: g.n });
      const v = playVoice(g.name, { x: camSet ? g.x : null, y: camSet ? g.y : null, p, gain: 1 + Math.min(0.4, Math.log(g.n) * 0.12) });
      if (v) { lastPlay[g.key] = t; played++; }
    }
  }

  // ---------------------------------------------------------------------------
  // Chronik
  // ---------------------------------------------------------------------------
  const STING = { war: 'st_war', holyWar: 'st_war', godWar: 'st_war', peace: 'st_peace', godPeace: 'st_peace', buyPeace: 'st_peace',
    alliance: 'st_alliance', godAlliance: 'st_alliance', royalWedding: 'st_alliance', succession: 'st_crown', seatDone: 'st_crown',
    revolution: 'st_revolt', regimeFall: 'st_revolt', coup: 'st_revolt', collapse: 'st_revolt', strongman: 'st_revolt',
    found: 'st_found', newRealm: 'st_found', kingdomGone: 'st_gone', fallen: 'st_gone' };
  const DARK_EV = { godNuke: 90, godNukeWild: 90, godTsar: 120, godTsarWild: 120, godBlackhole: 50, godBlackholeWild: 50, godMeteor: 30,
    godVolcano: 40, godVolcanoWild: 40, godQuake: 40, randomPlague: 50, godPlague: 50, zombieOutbreak: 50, kingdomGone: 40, fallen: 30, famine: 25 };
  let pendingSting = null;
  function onEvent(e) {
    if (!e || typeof e.type !== 'string') return;
    const t = now();
    if (DARK_EV[e.type]) darkUntil = Math.max(darkUntil, t + DARK_EV[e.type]);
    const s = STING[e.type];
    if (!s) return;
    if (!pendingSting || (RC[s].prio > RC[pendingSting].prio)) pendingSting = s;
    if (ctx && t - stingAt >= 5) playSting();
  }
  function playSting() {
    if (!pendingSting || !ctx || ctx.state !== 'running') return;
    const v = playVoice(pendingSting, { bus: out.effects, prio: RC[pendingSting].prio });
    if (v) stingAt = now();
    pendingSting = null;
  }

  // ---------------------------------------------------------------------------
  // Musik
  // ---------------------------------------------------------------------------
  function mood() {
    if (moodForce) return moodForce;
    if (now() < darkUntil) return 'dark';
    if (warOn) return 'war';
    return 'peace';
  }
  function scheduleMusic() {
    if (muted || vol.music < 0.01) { nextBar = Math.max(nextBar, now() + 1); return; }
    const t = now();
    if (t < nextBar - 1.2) return;
    if (nextBar < t) nextBar = t + 0.1;
    const b = M.bar(mood());
    const at = nextBar;
    playVoice('_music', { fn: (R, o, t0) => M.playBar(R, o, at, b) + (at - t0), bus: out.music, prio: 4, group: 'music', cls: 'global' });
    nextBar = at + b.dur;
  }

  // ---------------------------------------------------------------------------
  // Lage, Dauerklänge, Umgebung
  // ---------------------------------------------------------------------------
  const LOOP_OF = { tornado: 'tornado', blackhole: 'blackhole', volcano: 'volcano', flood: 'floodLoop' };
  function syncLoops(st, dt) {
    const want = new Map();
    const ac = st && Array.isArray(st.aircraft) ? st.aircraft : [];
    for (const p of ac) if (p && isFinite(p.x)) want.set('ac' + p.id, { name: 'engine', x: p.x, y: p.y, p: { kind: p.kind } });
    const ef = st && st.wild && Array.isArray(st.wild.effects) ? st.wild.effects : [];
    for (const e of ef) if (e && LOOP_OF[e.type] && isFinite(e.x)) want.set('ef' + e.id, { name: LOOP_OF[e.type], x: e.x, y: e.y, p: {} });
    // nur die nächsten 5
    let arr = Array.from(want.entries());
    if (arr.length > GROUP_CAP.loop) {
      arr.sort((a, b) => ((a[1].x - cam.x) ** 2 + (a[1].y - cam.y) ** 2) - ((b[1].x - cam.x) ** 2 + (b[1].y - cam.y) ** 2));
      arr = arr.slice(0, GROUP_CAP.loop);
    }
    const keep = new Set(arr.map((a) => a[0]));
    for (const [k, v] of loops) if (!keep.has(k)) { kill(v, 0.8); const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); loops.delete(k); }
    for (const [k, w] of arr) {
      let v = loops.get(k);
      if (v && v.dying) { loops.delete(k); v = null; }
      const d = Math.sqrt((w.x - cam.x) ** 2 + (w.y - cam.y) ** 2);
      if (!v) {
        v = playVoice(w.name, { x: w.x, y: w.y, p: w.p, group: 'loop' });
        if (v) { v.lastD = d; loops.set(k, v); }
        continue;
      }
      const rate = w.name === 'engine' && dt > 0 ? 1 + C.clamp(-(d - v.lastD) / dt / 80, -0.12, 0.12) : 0;
      v.lastD = d;
      moveVoice(v, w.x, w.y, rate);
    }
  }

  function ambientTick(dt) {
    const m = mixOverride || mix;
    if (!m || !beds) return;
    const t = now();
    cam.now = t;
    const evs = A.events(m, cam, dt, nextWave);
    for (const e of evs) {
      if (e.wave) nextWave = t + C.rr(3.5, 6.5);
      playVoice(e.name, { x: e.x, y: e.y, p: e.p, bus: e.animal ? out.effects : out.ambient, group: e.animal ? 'animal' : 'amb' });
    }
  }

  function pump() {
    if (!ctx || ctx.state !== 'running') return;
    const t = now();
    const dt = C.clamp(t - (lastPump || t), 0, 0.5);
    lastPump = t;
    if (queue.length) flush();
    if (pendingSting && t - stingAt >= 5) playSting();
    rainSpots = rainSpots.filter((r) => r.until > t);
    if (mixOverride && beds) beds.set(mixOverride, t);
    ambientTick(dt);
    scheduleMusic();
    prune();
  }

  function update(state, ci, dt) {
    if (!ctx) return;
    if (ci) {
      cam.x = C.fin(ci.x, cam.x); cam.y = C.fin(ci.y, cam.y); cam.dist = C.clamp(C.fin(ci.dist, cam.dist), 3, 400); camSet = true;
    }
    if (ctx.state !== 'running') return;
    const t = now();
    lastUpdate = t;
    if (queue.length) flush();
    if (state && t - lastAnalyze > 0.4) {
      lastAnalyze = t;
      mix = A.analyze(state, cam, { rainSpots, now: t });
      warOn = !!mix.war;
      if (!mixOverride) beds.set(mix, t);
    }
    if (state) syncLoops(state, C.clamp(C.fin(dt, 0.016), 0.001, 0.5));
  }

  // ---------------------------------------------------------------------------
  // Öffentliche Schnittstelle
  // ---------------------------------------------------------------------------
  const UI = { click: 1, select: 1, tool: 1, error: 1, open: 1, close: 1 };
  WW.Audio = {
    init: safe(init),
    unlock: safe(unlock),
    onFx: safe(onFx),
    onEvent: safe(onEvent),
    update: safe(update),
    ui: safe((name) => {
      if (!UI[name] || !ctx || ctx.state !== 'running') return;
      const k = 'ui_' + name, t = now();
      if (lastPlay[k] != null && t - lastPlay[k] < RC[k].gap) return;
      if (playVoice(k, { bus: out.ui })) lastPlay[k] = t;
    }),
    setVolume: safe((o) => {
      if (!o) return;
      for (const k of ['master', 'music', 'ambient', 'effects']) if (o[k] != null && isFinite(o[k])) vol[k] = C.clamp(+o[k], 0, 1);
      applyVol();
    }),
    mute: safe((b) => { muted = !!b; applyVol(); }),
    suspend: safe(() => { userSusp = true; if (ctx) ctx.suspend().catch(() => {}); }),
    resume: safe(() => { userSusp = false; if (ctx && !hidden) ctx.resume().catch(() => {}); }),
    setMood: safe((m) => { moodForce = (m === 'peace' || m === 'war' || m === 'dark') ? m : null; if (ctx) nextBar = Math.min(nextBar, now() + 0.5); }),
    state: safe(() => ({
      available: !!AC, started: !!ctx, running: !!ctx && ctx.state === 'running', muted, suspended: userSusp, hidden,
      volume: Object.assign({}, vol), voices: voices.length, maxVoices: MAX_VOICES, beds: beds ? beds.count() : 0,
      loops: loops.size, mood: ctx ? mood() : 'peace'
    })),
    // Für Testseite und Messungen
    debug: {
      setMix: safe((m) => { mixOverride = m ? Object.assign(A.analyze(null, null), m) : null; if (!m && beds) beds.set(A.analyze(null, null), now()); }),
      play: safe((name, x, y, p) => playVoice(name, { x, y, p })),
      voices: () => voices.map((v) => ({ name: v.name, prio: v.prio, group: v.group })),
      stats: () => Object.assign({ voices: voices.length }, stats),
      ctx: () => ctx, out: () => out
    }
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
