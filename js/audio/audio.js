// =============================================================================
// Wuselwelt – Ton: öffentliche Schnittstelle WW.Audio. Spielt CC0-Aufnahmen (audio/, Quellen in audio/QUELLEN.md)
// über die Web Audio API; nur die Bedienklicks sind im Code erzeugt.
// Ladereihenfolge (nach der Simulation, vor js/main.js):
//   js/audio/audio-core.js, js/audio/audio-manifest.js, js/audio/audio-bank.js, js/audio/audio-sfx.js,
//   js/audio/audio-ambient.js, js/audio/audio-music.js, js/audio/audio.js
//   (Einzeldatei/Artifact zusätzlich js/audio/audio-data.js vor audio-bank.js; erzeugt von tools/audio-pack.js)
//
// SCHNITTSTELLE (wirft nie; ohne Web Audio tut alles still nichts)
//   init(opts?)             einmal beim Start; opts.base = Ordner der Klangdateien (Standard 'audio/').
//                           AudioContext und Laden erst bei der ersten Nutzeraktion; pausiert bei verdecktem Fenster.
//   onFx(fx)                jeden Eintrag aus sim.drainFx() (gleiche Fx im selben Moment werden zusammengefasst, gedrosselt)
//   onEvent(eintrag)        jeden NEUEN Eintrag aus sim.state.events (alle Typen; gefiltert/gedrosselt wird hier)
//   update(state, cam, dt)  jedes Bild: cam = { x, y, dist } (Kachelkoordinaten der Bildmitte, dist = halbe Sichtbreite
//                           in Kacheln, z. B. cam.viewW / 2 / cam.zoom / 8), dt in s
//   ui(name)                'click' | 'select' | 'tool' | 'error' | 'open' | 'close'
//   setVolume({ master, music, ambient, effects })   je 0..1 (Standard 0.8 / 0.25 / 0.7 / 0.8)
//   mute(bool), suspend(), resume(), state(), setMood('peace'|'war'|'dark'|null), unlock()
// =============================================================================
(function (WW) { 'use strict';

  const C = WW.AudioCore, S = WW.AudioSfx, A = WW.AudioAmbient, M = WW.AudioMusic, BANK = WW.AudioBank;
  const hasWin = typeof window !== 'undefined';
  const AC = hasWin ? (window.AudioContext || window.webkitAudioContext) : null;

  const MAX_VOICES = 24;
  const GROUP_CAP = { amb: 4, animal: 3, loop: 5 };
  const REF = { detail: 6, mid: 16, loud: 40, huge: 400, global: 1 };

  // ---------------------------------------------------------------------------
  // Klänge: Aufnahme(n), Pegel, Vorrang, Reichweite, Mindestabstand (s) gleicher Klänge
  // ---------------------------------------------------------------------------
  const SND = {
    expl_s: { f: ['expl_s'], vol: 0.6, prio: 7, cls: 'loud', gap: 0.12 },
    expl_m: { f: ['expl_m'], vol: 0.7, prio: 7, cls: 'loud', gap: 0.25 },
    expl_l: { f: ['expl_l'], vol: 0.8, prio: 8, cls: 'loud', gap: 0.4 },
    nuke: { f: ['expl_nuke'], vol: 1, prio: 10, cls: 'huge', gap: 2, fixed: true },
    water: { f: ['expl_water'], vol: 0.6, prio: 6, cls: 'loud', gap: 0.5 },
    thunder: { f: ['thunder1', 'thunder2'], vol: 0.75, prio: 8, cls: 'loud', gap: 1.2 },
    quake: { f: ['quake'], vol: 0.85, prio: 8, cls: 'loud', gap: 2 },
    cannon: { f: ['cannon'], vol: 0.6, prio: 6, cls: 'loud', gap: 0.3 },
    mg: { f: ['mg'], vol: 0.4, prio: 4, cls: 'mid', gap: 0.45 },
    shot: { f: ['shot'], vol: 0.35, prio: 4, cls: 'mid', gap: 0.25 },
    arrow: { f: ['arrow'], vol: 0.4, prio: 3, cls: 'detail', gap: 0.15 },
    sword: { f: ['sword1', 'sword2'], vol: 0.3, prio: 2, cls: 'detail', gap: 0.25 },
    collapse: { f: ['collapse'], vol: 0.6, prio: 6, cls: 'mid', gap: 0.5 },
    wood: { f: ['wood_break'], vol: 0.4, prio: 3, cls: 'detail', gap: 0.4 },
    hammer: { f: ['hammer'], vol: 0.3, prio: 2, cls: 'detail', gap: 0.5 },
    chop: { f: ['chop'], vol: 0.35, prio: 2, cls: 'detail', gap: 0.6 },
    build: { f: ['build'], vol: 0.4, prio: 3, cls: 'detail', gap: 0.8 },
    rocket: { f: ['rocket_launch'], vol: 0.55, prio: 6, cls: 'loud', gap: 1.5 },
    whistle: { f: ['whistle'], vol: 0.3, prio: 3, cls: 'mid', gap: 8 },
    sheep: { f: ['sheep'], vol: 0.4, prio: 2, cls: 'detail', gap: 2 },
    cow: { f: ['cow'], vol: 0.45, prio: 2, cls: 'detail', gap: 2.5 },
    wolf: { f: ['wolf'], vol: 0.4, prio: 3, cls: 'mid', gap: 4 },
    bear: { f: ['bear', 'bear2'], vol: 0.5, prio: 3, cls: 'detail', gap: 3 },
    dragon: { f: ['dragon'], vol: 0.7, prio: 7, cls: 'loud', gap: 2.5 },
    monster: { f: ['monster'], vol: 0.5, prio: 5, cls: 'mid', gap: 3 },
    snarl: { f: ['snarl'], vol: 0.4, prio: 3, cls: 'detail', gap: 2 },
    crow: { f: ['crow'], vol: 0.25, prio: 1, cls: 'detail', gap: 6 },
    gull: { f: ['gull'], vol: 0.25, prio: 1, cls: 'detail', gap: 5 },
    bell: { f: ['bell'], vol: 0.35, prio: 4, cls: 'mid', gap: 1.5 },
    bells: { f: ['bells'], vol: 0.4, prio: 5, cls: 'mid', gap: 3 },
    magic: { f: ['magic'], vol: 0.45, prio: 4, cls: 'mid', gap: 1 },
    magic2: { f: ['magic2'], vol: 0.4, prio: 4, cls: 'mid', gap: 1 },
    splash: { f: ['splash'], vol: 0.35, prio: 2, cls: 'detail', gap: 0.6 },
    steam: { f: ['steam'], vol: 0.25, prio: 2, cls: 'detail', gap: 1.5 },
    // Chronik-Signale (nicht räumlich)
    st_war: { f: ['drums_war'], vol: 0.5, prio: 8, cls: 'global', gap: 4, fixed: true },
    st_peace: { f: ['bells'], vol: 0.45, prio: 7, cls: 'global', gap: 4, fixed: true },
    st_alliance: { f: ['bells'], vol: 0.4, prio: 7, cls: 'global', gap: 4, rate: 1.12, fixed: true },
    st_crown: { f: ['fanfare'], vol: 0.45, prio: 7, cls: 'global', gap: 4, fixed: true },
    st_revolt: { f: ['cheer'], vol: 0.45, prio: 7, cls: 'global', gap: 4, fixed: true },
    st_found: { f: ['bell'], vol: 0.4, prio: 6, cls: 'global', gap: 4, fixed: true },
    st_gone: { f: ['bell'], vol: 0.5, prio: 8, cls: 'global', gap: 4, rate: 0.6, fixed: true },
    // Dauerklänge
    engine_gunship: { f: ['engine_prop'], vol: 0.9, prio: 6, cls: 'loud', loop: true },
    engine_bomber: { f: ['engine_plane'], vol: 1.0, prio: 6, cls: 'loud', loop: true },
    engine_rocket: { f: ['rocket_loop'], vol: 0.9, prio: 6, cls: 'loud', loop: true },
    tornado: { f: ['amb_wind'], vol: 1.6, prio: 7, cls: 'loud', loop: true, rate: 1.35 },
    blackhole: { f: ['rocket_loop'], vol: 1.3, prio: 8, cls: 'loud', loop: true, rate: 0.5 },
    volcano: { f: ['amb_fire'], vol: 1.4, prio: 6, cls: 'loud', loop: true, rate: 0.55 },
    floodLoop: { f: ['amb_river'], vol: 1.3, prio: 5, cls: 'loud', loop: true, rate: 0.8 },
    train: { f: ['loco'], vol: 0.7, prio: 4, cls: 'mid', loop: true }
  };

  let ctx = null, out = null, beds = null, music = null, timer = null, inited = false, base = 'audio/';
  const vol = { master: 0.8, music: 0.25, ambient: 0.7, effects: 0.8 };
  let muted = false, userSusp = false, hidden = false;
  const cam = { x: 0, y: 0, dist: 20, now: 0 };
  let camSet = false;
  const voices = [];
  const queue = [];
  const lastPlay = {};
  const loops = new Map();
  const launched = new Set();
  let mix = null, mixOverride = null, lastAnalyze = -1, lastPump = 0;
  let moodForce = null, darkUntil = 0, warOn = false, stingAt = -10;
  let rainSpots = [];
  let flushPending = false;
  const TOK_RATE = 4, TOK_MAX = 4, AMB_RATE = 1, AMB_MAX = 2;
  let tokens = TOK_MAX, tokT = 0, ambTok = AMB_MAX, ambT = 0;
  let speed = 1, spTick = -1, spT = 0;   // geschätztes Spieltempo (Ticks je s / 10)
  const stats = { names: {}, fx: 0, amb: 0, played: 0, dropped: 0, stolen: 0, silent: 0, peakVoices: 0, errors: 0 };

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
      out.effects._send.gain.value = 0.05; out.ambient._send.gain.value = 0; out.music._send.gain.value = 0;
      beds = A.Beds(ctx, out.ambient);
      music = M.Player(ctx, out.music);
      applyVol(0);
      if (BANK) BANK.start(ctx, { base });
      if (!timer) timer = setInterval(safe(pump), 100);
    }
    if (ctx.state !== 'running' && !userSusp && !hidden) { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* still */ } }
    return true;
  }
  function init(opts) {
    if (opts && opts.base) base = opts.base;
    if (inited || !hasWin) return;
    inited = true;
    if (!AC) return;
    const o = { capture: true, passive: true };
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'mousedown']) window.addEventListener(ev, safe(unlock), o);
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
    set(out.master.gain, muted ? 0 : vol.master);
    set(out.music.gain, vol.music * 0.5);
    set(out.ambient.gain, vol.ambient * 0.9);
    set(out.effects.gain, vol.effects * 0.8);
  }

  // ---------------------------------------------------------------------------
  // Raum: Lautstärke, Stereo, Dumpfheit und Verzögerung nach Lage zur Bildmitte
  // ---------------------------------------------------------------------------
  function spatial(x, y, cls) {
    if (cls === 'global' || x == null || !isFinite(x) || !isFinite(y) || !camSet) return { gain: 1, pan: 0, lp: 0, delay: 0, wet: 0, d: 0 };
    const D = C.clamp(C.fin(cam.dist, 20), 3, 400);
    const dx = x - cam.x, dy = y - cam.y, d = Math.sqrt(dx * dx + dy * dy);
    const h = Math.max(4, D * 0.6);
    const reff = Math.sqrt(d * d + h * h);
    let gain = Math.min(1, (REF[cls] || 16) / reff);
    gain *= gain > 0.3 ? 1 : Math.sqrt(gain / 0.3);
    // Kleines außerhalb des Bildes fällt schnell ab: ohne nahe Stadt hört man fast nur Natur
    if (cls !== 'loud' && cls !== 'huge' && d > D * 1.1) gain *= Math.pow(D * 1.1 / d, 2);
    const pan = C.clamp(dx / Math.max(D, 6), -1, 1) * 0.8;
    const lp = d > 12 ? C.clamp(18000 / (1 + Math.pow(d / 25, 1.5)), 400, 18000) : 0;
    const delay = (cls === 'loud' || cls === 'huge') ? C.clamp((d - D * 0.8) * 0.008, 0, 2.5) : 0;
    const wet = C.clamp(d / 150, 0, 0.5);
    return { gain, pan, lp, delay, wet, d };
  }

  // ---------------------------------------------------------------------------
  // Stimmen
  // ---------------------------------------------------------------------------
  function disc(v) { try { v.out.disconnect(); if (v.pan) v.pan.disconnect(); if (v.lp) v.lp.disconnect(); if (v.send) v.send.disconnect(); } catch (e) { /* still */ } }
  function prune() {
    const t = now();
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < t) { disc(voices[i]); voices.splice(i, 1); }
  }
  function groupCount(g) { let n = 0; for (const v of voices) if (v.group === g) n++; return n; }
  function kill(v, fade) {
    v.dying = true;
    C.stopVoice(ctx, v, fade);
    setTimeout(() => disc(v), (fade + 0.2) * 1000);
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
  }
  function makeRoom(prio, group) {
    prune();
    if (group && GROUP_CAP[group] && groupCount(group) >= GROUP_CAP[group]) return false;
    if (voices.length < MAX_VOICES) return true;
    let victim = null;
    for (const v of voices) if (!v.dying && (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.start < victim.start))) victim = v;
    if (!victim || victim.prio >= prio) return false;
    kill(victim, 0.05);
    stats.stolen++;
    return true;
  }

  // name: Eintrag in SND oder 'ui_*' (erzeugt). opts: { x, y, bus, gain, group, rate, prio }
  function playVoice(name, opts) {
    if (!ctx || !out || ctx.state === 'closed') return null;
    opts = opts || {};
    const sd = SND[name], rc = S.RECIPES[name];
    if (!sd && !rc) return null;
    let buf = null, file = null;
    if (sd) {
      file = sd.f[Math.floor(Math.random() * sd.f.length) % sd.f.length];
      buf = BANK && BANK.get(file);
      if (!buf) { for (const f of sd.f) { buf = BANK && BANK.get(f); if (buf) { file = f; break; } } }
      if (!buf) { stats.silent++; return null; }   // lädt noch: stumm
    }
    const cls = (sd || rc).cls || 'mid';
    const sp = spatial(opts.x, opts.y, cls);
    const level = C.clamp(sp.gain * ((sd || rc).vol != null ? (sd || rc).vol : 1) * C.fin(opts.gain, 1), 0, 2);
    if (level < 0.006) { stats.dropped++; return null; }
    const prio = opts.prio != null ? opts.prio : ((sd || rc).prio || 3);
    if (!makeRoom(prio, opts.group)) { stats.dropped++; return null; }
    const t = now();
    const loop = !!(sd && sd.loop);
    const v = { name, prio, group: opts.group || (loop ? 'loop' : null), start: t, end: t + 1, srcs: [], loop };
    const g = ctx.createGain(); g.gain.value = loop ? 0 : level; v.out = g; v.level = level;
    let node = g;
    if (ctx.createStereoPanner && sp.pan) { v.pan = ctx.createStereoPanner(); v.pan.pan.value = sp.pan; node.connect(v.pan); node = v.pan; }
    if (sp.lp || loop) { v.lp = ctx.createBiquadFilter(); v.lp.type = 'lowpass'; v.lp.frequency.value = sp.lp || 18000; v.lp.Q.value = 0.5; node.connect(v.lp); node = v.lp; }
    node.connect(opts.bus || out.effects);
    if (sp.wet > 0.05) { v.send = ctx.createGain(); v.send.gain.value = sp.wet; node.connect(v.send); v.send.connect(out.reverbIn); }
    const at = t + 0.01 + sp.delay;
    let dur = 0;
    if (buf) {
      const s = ctx.createBufferSource(); s.buffer = buf;
      // Tonhöhe leicht streuen gegen Wiederholung (Signale und Musik fest)
      const rate = C.fin(opts.rate, 1) * (sd.rate || 1) * (sd.fixed || loop ? 1 : C.rr(0.93, 1.07));
      s.playbackRate.value = rate;
      if (loop) {
        s.loop = true;
        const lr = BANK.loop(file);
        if (lr) { s.loopStart = lr.start; s.loopEnd = lr.end; }
        s.start(at, (lr ? lr.start : 0) + Math.random() * buf.duration * 0.7);
        g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(level, t, 0.4);
        dur = Infinity;
      } else {
        s.start(at);
        dur = buf.duration / rate;
      }
      s.connect(g);
      v.srcs.push(s);
    } else {
      try { dur = S.play(ctx, g, name, at, opts.p || {}, v); } catch (e) { dur = 0; }
    }
    if (!dur) { disc(v); return null; }
    v.end = loop ? Infinity : at + dur + 0.1;
    voices.push(v);
    stats.played++;
    if (voices.length > stats.peakVoices) stats.peakVoices = voices.length;
    return v;
  }

  function moveVoice(v, x, y, rate) {
    if (!v || !ctx) return;
    const sd = SND[v.name] || {};
    const sp = spatial(x, y, sd.cls || 'loud'), t = now();
    const level = C.clamp(sp.gain * (sd.vol || 1), 0, 2);
    v.out.gain.setTargetAtTime(level < 0.006 ? 0 : level, t, 0.25);
    if (v.pan) v.pan.pan.setTargetAtTime(sp.pan, t, 0.25);
    if (v.lp) v.lp.frequency.setTargetAtTime(sp.lp || 18000, t, 0.3);
    if (rate && v.srcs[0]) try { v.srcs[0].playbackRate.setTargetAtTime(rate * (sd.rate || 1), t, 0.2); } catch (e) { /* still */ }
  }

  // ---------------------------------------------------------------------------
  // Fx -> Klang: [Klang, Tonhöhe, Schlüssel für Zusammenfassung]
  // ---------------------------------------------------------------------------
  function explo(r) { r = C.fin(r, 2); return r < 1.8 ? 'expl_s' : r < 2.8 ? 'expl_m' : 'expl_l'; }
  const FX = {
    explosion: (f) => [explo(f.r)],
    bang: () => ['expl_l', 0.8], mushroom: (f) => ['nuke', f.big ? 0.82 : 1, 'nuke'],
    bolt: () => ['thunder'], meteor: () => ['expl_l', 0.9], quake: () => ['quake'],
    eruption: () => ['expl_l', 0.7, 'eruption'], lava: () => ['steam', 0.7], steam: () => ['steam'],
    flood: () => ['water', 0.6, 'flood'], acidrain: () => ['steam', 1.2, 'acid'], laser: () => ['expl_m', 1.25, 'laser'],
    napalm: () => ['expl_m', 0.85, 'napalm'], sandburst: () => ['quake', 1.5, 'sandburst'],
    smoke: () => ['collapse'], wreck: () => ['collapse', 0.9, 'wreck'], hit: () => ['wood', 1.1, 'hit'], roof: () => ['wood'],
    debris: () => ['wood', 0.9, 'debris'], dust: () => ['build'],
    tracer: (f) => ['mg', f.heavy ? 0.8 : 1, f.heavy ? 'mgH' : 'mg'], arrow: () => ['arrow'], bolt_shot: () => ['arrow', 0.7, 'ballista'],
    rock: (f, b) => (b.muzzle(f) ? ['cannon'] : ['chop', 0.6, 'catapult']), ram: () => ['chop', 0.5, 'ram'],
    ward: () => ['magic2', 0.8, 'ward'], spikes: () => ['sword', 1.2, 'spikes'], alarm: () => ['bell', 1.15, 'alarm'],
    sparkle: (f) => (f.r ? ['magic'] : ['bell', 1.3, 'chime']), heal: () => ['magic', 1.08, 'heal'], hearts: () => ['magic2', 1.2, 'hearts'],
    goldrain: () => ['bell', 1.5, 'gold'], frost: () => ['magic2', 0.8, 'frost'], raise: () => ['quake', 1.4, 'terrain'], lower: () => ['quake', 1.25, 'terrain'],
    splash: () => ['splash'], fishjump: () => ['splash', 1.6, 'fish'], firebreath: () => ['dragon'], zombify: () => ['snarl', 0.8, 'zombify'],
    govchange: () => ['bells', 1, 'gov'], restyle: () => ['bell', 1, 'restyle'], centerStage: () => ['bells', 1, 'center'],
    whistle: () => ['whistle'],
    // Baumfällen: leises Holzknacken, höchstens eins alle 2 s
    treeFall: () => ['chop', 0.8, 'treeFall', 2, 0.5]
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
      if (DARK_FX[f.type]) darkUntil = Math.max(darkUntil, t + DARK_FX[f.type]);
      if ((f.type === 'rain' || f.type === 'acidrain') && isFinite(f.x)) { rainSpots.push({ x: f.x, y: f.y, until: t + 10 }); if (rainSpots.length > 12) rainSpots.shift(); }
      const h = FX[f.type];
      if (!h) continue;
      const r = h(f, B);
      if (!r || !SND[r[0]]) continue;
      const key = r[2] || r[0];
      let x = f.x, y = f.y;
      if (f.type === 'quake' && isFinite(f.x2)) { x = (f.x + f.x2) / 2; y = (f.y + f.y2) / 2; }
      let g = groups.get(key);
      if (!g) { g = { name: r[0], rate: r[1] || 1, key, gap: r[3], gain: r[4] || 1, n: 0, x, y, best: Infinity }; groups.set(key, g); }
      g.n++;
      const dd = isFinite(x) ? (x - cam.x) * (x - cam.x) + (y - cam.y) * (y - cam.y) : 0;
      if (dd < g.best) { g.best = dd; g.x = x; g.y = y; }
    }
    const list = Array.from(groups.values()).sort((a, b) => SND[b.name].prio - SND[a.name].prio);
    let played = 0;
    // Gesamtdrossel: höchstens ~4 neue Effekte je Sekunde bei 1×, bei hohem Tempo weniger (4 / √Tempo); Großes (Vorrang ≥ 8) immer
    tokens = Math.min(TOK_MAX, tokens + (t - tokT) * TOK_RATE / Math.sqrt(Math.max(1, speed))); tokT = t;
    for (const g of list) {
      if (played >= 6) { stats.dropped++; continue; }
      if (SND[g.name].prio < 8 && tokens < 1) { stats.dropped++; continue; }
      const sd = SND[g.name];
      const gap = g.gap || sd.gap || 0.1;
      if (lastPlay[g.key] != null && t - lastPlay[g.key] < gap) { stats.dropped++; continue; }
      if (lastPlay['@' + g.name] != null && t - lastPlay['@' + g.name] < (sd.gap || 0.1) * 0.5) { stats.dropped++; continue; }
      const v = playVoice(g.name, { x: g.x, y: g.y, rate: g.rate, gain: g.gain * (1 + Math.min(0.3, Math.log(g.n) * 0.1)) });
      if (v) { lastPlay[g.key] = t; lastPlay['@' + g.name] = t; played++; stats.fx++; stats.names[g.key] = (stats.names[g.key] || 0) + 1; if (SND[g.name].prio < 8) tokens -= 1; }
    }
  }

  // ---------------------------------------------------------------------------
  // Chronik
  // ---------------------------------------------------------------------------
  const STING = { war: 'st_war', holyWar: 'st_war', godWar: 'st_war', peace: 'st_peace', godPeace: 'st_peace', buyPeace: 'st_peace',
    alliance: 'st_alliance', godAlliance: 'st_alliance', royalWedding: 'st_alliance', succession: 'st_crown', seatDone: 'st_crown',
    revolution: 'st_revolt', regimeFall: 'st_revolt', coup: 'st_revolt', collapse: 'st_revolt', strongman: 'st_revolt',
    found: 'st_found', newRealm: 'st_found', kingdomGone: 'st_gone', fallen: 'st_gone' };
  // Lager-Ereignisse (js/sim/camps.js: campBuilt, campPickup, campIntern, campBreakout, campRiot, campProtest, campLiberated)
  // bekommen bewusst kein Signal.
  const DARK_EV = { godNuke: 90, godNukeWild: 90, godTsar: 120, godTsarWild: 120, godBlackhole: 50, godBlackholeWild: 50, godMeteor: 30,
    godVolcano: 40, godVolcanoWild: 40, godQuake: 40, randomPlague: 50, godPlague: 50, zombieOutbreak: 50, kingdomGone: 40, fallen: 20 };
  let pendingSting = null;
  function onEvent(e) {
    if (!e || typeof e.type !== 'string') return;
    const t = now();
    if (DARK_EV[e.type]) darkUntil = Math.max(darkUntil, t + DARK_EV[e.type]);
    const s = STING[e.type];
    if (!s) return;
    if (!pendingSting || SND[s].prio > SND[pendingSting].prio) pendingSting = s;
    if (ctx && t - stingAt >= 6) playSting();
  }
  function playSting() {
    if (!pendingSting || !ctx || ctx.state !== 'running') return;
    const v = playVoice(pendingSting, {});
    if (v) { stingAt = now(); pendingSting = null; }
    else if (BANK && !BANK.has(SND[pendingSting].f[0])) pendingSting = null;   // noch nicht geladen: verwerfen
  }

  function mood() {
    if (moodForce) return moodForce;
    if (now() < darkUntil) return 'dark';
    if (warOn) return 'war';
    return 'peace';
  }

  // ---------------------------------------------------------------------------
  // Dauerklänge (Flugzeuge, Wirbelsturm, Schwarzes Loch, Vulkan, Flut)
  // ---------------------------------------------------------------------------
  const LOOP_OF = { tornado: 'tornado', blackhole: 'blackhole', volcano: 'volcano', flood: 'floodLoop' };
  function syncLoops(st, dt) {
    const want = new Map();
    const ac = st && Array.isArray(st.aircraft) ? st.aircraft : [];
    for (const p of ac) if (p && isFinite(p.x)) want.set('ac' + p.id, { name: 'engine_' + (SND['engine_' + p.kind] ? p.kind : 'bomber'), x: p.x, y: p.y, rocket: p.kind === 'rocket' });
    const ef = st && st.wild && Array.isArray(st.wild.effects) ? st.wild.effects : [];
    for (const e of ef) if (e && LOOP_OF[e.type] && isFinite(e.x)) want.set('ef' + e.id, { name: LOOP_OF[e.type], x: e.x, y: e.y });
    // fahrende Züge in Kameranähe
    const tr = st && Array.isArray(st.trains) ? st.trains : [], near = cam.dist * 1.3 + 12;
    for (const z of tr) if (z && z.t === 'run' && !z.dead && isFinite(z.x) && Math.abs(z.x - cam.x) < near && Math.abs(z.y - cam.y) < near) want.set('tr' + z.id, { name: 'train', x: z.x, y: z.y });
    let arr = Array.from(want.entries());
    if (arr.length > GROUP_CAP.loop) {
      arr.sort((a, b) => ((a[1].x - cam.x) ** 2 + (a[1].y - cam.y) ** 2) - ((b[1].x - cam.x) ** 2 + (b[1].y - cam.y) ** 2));
      arr = arr.slice(0, GROUP_CAP.loop);
    }
    const keep = new Set(arr.map((a) => a[0]));
    for (const [k, v] of loops) if (!keep.has(k)) { kill(v, 0.8); loops.delete(k); }
    for (const [k, w] of arr) {
      let v = loops.get(k);
      if (v && v.dying) { loops.delete(k); v = null; }
      const d = Math.sqrt((w.x - cam.x) ** 2 + (w.y - cam.y) ** 2);
      if (!v) {
        if (w.rocket && !launched.has(k)) { playVoice('rocket', { x: w.x, y: w.y }); launched.add(k); }
        v = playVoice(w.name, { x: w.x, y: w.y, group: 'loop' });
        if (v) { v.lastD = d; loops.set(k, v); }
        continue;
      }
      // Doppler angedeutet
      const rate = (w.name.indexOf('engine_') === 0 || w.name === 'train') && dt > 0 ? 1 + C.clamp(-(d - v.lastD) / dt / 80, -0.1, 0.1) : 0;
      v.lastD = d;
      moveVoice(v, w.x, w.y, rate);
    }
    for (const k of Array.from(launched)) if (!want.has(k)) launched.delete(k);
  }

  function ambientTick(dt) {
    const m = mixOverride || mix;
    if (!m || !beds) return;
    cam.now = now();
    ambTok = Math.min(AMB_MAX, ambTok + dt * AMB_RATE / Math.sqrt(Math.max(1, speed)));
    for (const e of A.events(m, cam, dt)) {
      if (!SND[e.name] || ambTok < 1) continue;
      const t = now();
      if (lastPlay['@' + e.name] != null && t - lastPlay['@' + e.name] < SND[e.name].gap) continue;
      const v = playVoice(e.name, { x: e.x, y: e.y, rate: e.rate, bus: e.animal ? out.effects : out.ambient, group: e.animal ? 'animal' : 'amb' });
      if (v) { lastPlay['@' + e.name] = t; ambTok -= 1; stats.amb++; }
    }
  }

  function pump() {
    if (!ctx || ctx.state !== 'running') return;
    const t = now();
    const dt = C.clamp(t - (lastPump || t), 0, 0.5);
    lastPump = t;
    if (queue.length) flush();
    if (pendingSting && t - stingAt >= 6) playSting();
    rainSpots = rainSpots.filter((r) => r.until > t);
    if (mixOverride && beds) beds.set(mixOverride, t);
    else if (mix && beds && t - lastAnalyze > 0.5) beds.set(mix, t);   // Schichten, die inzwischen geladen sind
    ambientTick(dt);
    if (music) music.tick(mood(), !muted && vol.music > 0.01);
    prune();
  }

  function update(state, ci, dt) {
    if (ci) { cam.x = C.fin(ci.x, cam.x); cam.y = C.fin(ci.y, cam.y); cam.dist = C.clamp(C.fin(ci.dist, cam.dist), 3, 400); camSet = true; }
    if (!ctx || ctx.state !== 'running') return;
    const t = now();
    if (state && isFinite(state.tick)) {
      if (spTick < 0 || state.tick < spTick) { spTick = state.tick; spT = t; }
      else if (t - spT >= 1) { speed = speed * 0.5 + 0.5 * C.clamp((state.tick - spTick) / (t - spT) / 10, 0, 50); spTick = state.tick; spT = t; }
    }
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
      if (lastPlay[k] != null && t - lastPlay[k] < S.RECIPES[k].gap) return;
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
    setMood: safe((m) => { moodForce = (m === 'peace' || m === 'war' || m === 'dark') ? m : null; }),
    state: safe(() => ({
      available: !!AC, started: !!ctx, running: !!ctx && ctx.state === 'running', muted, suspended: userSusp, hidden,
      volume: Object.assign({}, vol), voices: voices.length, maxVoices: MAX_VOICES, beds: beds ? beds.count() : 0,
      loops: Array.from(loops.values()).filter((v) => !v.dying).length, mood: ctx ? mood() : 'peace', speed: Math.round(speed * 10) / 10,
      music: music ? music.current() : null, loading: BANK ? BANK.state() : null
    })),
    // Für Testseite und Messungen
    debug: {
      setMix: safe((m) => { mixOverride = m ? Object.assign(A.analyze(null, null), m) : null; if (!m && beds) beds.set(A.analyze(null, null), now()); }),
      play: safe((name, x, y, rate) => playVoice(name, { x, y, rate })),
      voices: () => voices.map((v) => ({ name: v.name, prio: v.prio, group: v.group })),
      stats: () => Object.assign({ voices: voices.length }, stats, { names: Object.assign({}, stats.names) }),
      sounds: () => Object.keys(SND),
      ctx: () => ctx, out: () => out
    }
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
