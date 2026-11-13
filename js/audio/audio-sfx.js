// =============================================================================
// Wuselwelt – Ton, Klangrezepte (Effekte, Tiere, Monster, Bedienung, Chronik-Signale).
// Ein Rezept: RECIPES[name] = { fn(R, out, t, p) -> Dauer in s, prio 0..10, cls, gap, vol, loop? }
//   R = WW.AudioCore.makeR(ctx, voice), out = Eingang der Stimme (Gain), t = Startzeit, p = Parameter
//   cls (Reichweite): 'global' (nicht räumlich) | 'detail' | 'mid' | 'loud' | 'huge'
//   gap: Mindestabstand gleicher Klänge in s (Drosselung), loop: Dauerklang bis zum Stopp (fn liefert { set(k,v,t) })
// play(ctx, dest, name, t, p, voice) -> Dauer (Infinity bei Schleifen); never throws.
// =============================================================================
(function (WW) { 'use strict';

  const C = WW.AudioCore;
  const RECIPES = {};
  function def(name, o) { RECIPES[name] = o; }

  // ---------------------------------------------------------------------------
  // gemeinsame Bausteine
  // ---------------------------------------------------------------------------
  // Größe einer Explosion aus dem Radius (0.05 kleiner Knall … 0.55 Meteor; Atom 0.85, Zar 1)
  function sizeFromR(r) { return C.clamp(0.06 + (C.fin(r, 2) - 1.2) * 0.17, 0.05, 0.6); }
  function boomDur(s) { return 0.6 + 2.5 * s + 14 * s * s * s; }

  function boomCore(R, out, t, s) {
    const dur = boomDur(s);
    const o0 = R.g(0.55 + 0.8 * s); o0.connect(out); out = o0;   // größere Knalle lauter
    // 1) Knall: helles Rauschen, sehr kurz
    {
      const n = R.noise('white', t, t + 0.6), lp = R.f('lowpass', 9000 - 5000 * s, 0.7), g = R.g(0);
      R.c(n, lp, g, out); R.env(g.gain, t, 0.001, 0.6 - 0.3 * s, 0.05 + 0.25 * s);
    }
    // 2) Körper: braunes Rauschen, Tiefpass fällt
    {
      const n = R.noise('brown', t, t + dur + 0.2), lp = R.f('lowpass', 2000, 0.6), g = R.g(0);
      R.c(n, lp, g, out);
      R.xpts(lp.frequency, [[t, 3600 - 2200 * s], [t + 0.08 + 0.4 * s, 1100 - 700 * s], [t + dur * 0.7, 90 + 60 * (1 - s)]]);
      R.env(g.gain, t, 0.004 + 0.06 * s, 0.45 + 0.5 * s, dur * 0.55);
    }
    // 3) Mittenstoß (Textur, vor allem bei kleinen Knallen)
    {
      const n = R.noise('pink', t, t + 1), bp = R.f('bandpass', 900 - 500 * s, 0.8), g = R.g(0);
      R.c(n, bp, g, out); R.env(g.gain, t, 0.002, 0.75 * (1 - s * 0.8), 0.12 + 0.4 * s);
    }
    // 4) Tiefer Schlag: Sinus mit Tonhöhenabfall
    {
      const o = R.osc('sine', 100, t, t + dur + 0.2), g = R.g(0);
      R.c(o, g, out);
      R.xpts(o.frequency, [[t, 125 - 65 * s], [t + 0.25 + 1.4 * s, 34 - 12 * s]]);
      R.env(g.gain, t, 0.004 + 0.02 * s, Math.min(0.85, 0.15 + 1.1 * s), 0.2 + 2.6 * s);
    }
    // 5) Grollen (rollende Wellen), ab mittlerer Größe
    if (s > 0.2) {
      const n = R.noise('brown', t, t + dur + 0.3), lp = R.f('lowpass', 90 + 80 * (1 - s), 0.9), g = R.g(0);
      R.c(n, lp, g, out);
      const L = [[t, 0], [t + 0.15 + 0.4 * s, 1.3 * s + 0.1]];
      let tt = t + 0.15 + 0.4 * s, lvl = 1.3 * s + 0.1;
      const steps = 3 + Math.floor(s * 8);
      for (let i = 0; i < steps; i++) {
        tt += (dur * 0.85 - (tt - t)) / (steps - i) * R.rr(0.7, 1.3);
        lvl *= R.rr(0.6, 0.85);
        L.push([Math.min(tt, t + dur * 0.92), lvl * (i % 2 ? 0.7 : 1.15)]);
      }
      L.push([t + dur, 0]);
      R.pts(g.gain, L);
    }
    // 6) Trümmer: kurze Klicks im Nachhall
    if (s > 0.12 && s < 0.8) {
      const k = 4 + Math.floor(s * 18);
      for (let i = 0; i < k; i++) {
        const at = t + 0.08 + Math.pow(R.rnd(), 1.6) * dur * 0.5;
        R.tick(out, at, R.rr(500, 2600), R.rr(1, 4), R.rr(0.04, 0.12) * (1 - (at - t) / dur), R.rr(0.01, 0.05));
      }
    }
    return dur + 0.1;
  }

  function whoosh(R, out, t, f0, f1, dur, peak, Q, kind) {
    const n = R.noise(kind || 'white', t, t + dur + 0.1), bp = R.f('bandpass', f0, Q || 1.5), g = R.g(0);
    R.c(n, bp, g, out);
    R.xpts(bp.frequency, [[t, f0], [t + dur, f1]]);
    R.pts(g.gain, [[t, 0], [t + dur * 0.55, peak], [t + dur, 0]]);
    return t + dur + 0.05;
  }

  function thud(R, out, t, f0, f1, peak, dec) {
    const o = R.osc('sine', f0, t, t + dec + 0.1), g = R.g(0);
    R.c(o, g, out); R.xpts(o.frequency, [[t, f0], [t + dec, f1]]); R.env(g.gain, t, 0.003, peak, dec);
    return t + dec;
  }

  // Formant-Filterbank: src -> [bp, …] -> out; Rückgabe der Filter
  function formants(R, src, out, list) {
    const fs = [];
    for (const f of list) { const bp = R.f('bandpass', f[0], f[1]), g = R.g(f[2]); src.connect(bp); bp.connect(g); g.connect(out); fs.push(bp); }
    return fs;
  }

  function bell(R, out, t, f, peak, dec, ratio, idx) {
    R.fm(out, t, f, ratio || 1.4, idx || 3, 0.05, 0.002, peak, dec);
    const o = R.osc('sine', f * 2.01, t, t + dec * 0.4 + 0.1), g = R.g(0); R.c(o, g, out); R.env(g.gain, t, 0.002, peak * 0.3, dec * 0.3);
    return t + dec;
  }

  function brass(R, out, t, midi, dur, peak) {
    const f = C.mtof(midi), g = R.g(0), lp = R.f('lowpass', 400, 2);
    const end = t + dur + 0.6;
    for (const d of [-6, 5]) { const o = R.osc('sawtooth', f, t, end); o.detune.value = d; o.connect(lp); R.lfo('sine', 5, 4, o.detune, t + 0.25, end); }
    R.c(lp, g, out);
    R.pts(lp.frequency, [[t, 300], [t + 0.07, 2400], [t + 0.3, 1300], [t + dur, 1100], [t + dur + 0.5, 300]]);
    R.ahr(g.gain, t, 0.05, peak, dur, 0.45);
    return end;
  }

  function timpani(R, out, t, peak, f) {
    f = f || 95;
    thud(R, out, t, f * 1.1, f * 0.9, peak, 1.0);
    const n = R.noise('brown', t, t + 0.4), lp = R.f('lowpass', 400, 1), g = R.g(0); R.c(n, lp, g, out); R.env(g.gain, t, 0.002, peak * 0.6, 0.18);
    return t + 1.0;
  }

  function hammerHit(R, out, t, metal, peak) {
    if (metal) { R.fm(out, t, R.rr(1500, 2300), 2.41, 2.2, 0.1, 0.001, peak * 0.5, 0.22); R.tick(out, t, 3500, 2, peak * 0.4, 0.015); }
    else { R.tick(out, t, R.rr(900, 1400), 5, peak, 0.05); thud(R, out, t, R.rr(260, 340), 200, peak * 0.4, 0.05); }
  }

  // ---------------------------------------------------------------------------
  // Explosionen, Blitz, Naturgewalten
  // ---------------------------------------------------------------------------
  def('explosion', { prio: 7, cls: 'loud', gap: 0.06, vol: 1.6,
    fn(R, out, t, p) { const s = p.size != null ? p.size : sizeFromR(p.r); return boomCore(R, out, t, s); } });

  def('nuke', { prio: 10, cls: 'huge', gap: 1.5, vol: 1.15,
    fn(R, out, t, p) {
      const s = p.big ? 1 : 0.85, dur = boomDur(s);
      boomCore(R, out, t, s);
      // anhaltendes Tosen
      const n = R.noise('pink', t, t + dur + 0.2), lp = R.f('lowpass', 500, 0.7), g = R.g(0), dv = R.drive(1.8);
      R.c(n, lp, dv, g, out);
      R.xpts(lp.frequency, [[t, 1400], [t + 1.5, 500], [t + dur, 120]]);
      R.pts(g.gain, [[t, 0], [t + 0.4, 0.35], [t + 1.8, 0.55], [t + dur * 0.5, 0.25], [t + dur, 0]]);
      // Unterton
      const o = R.osc('sine', 32, t, t + dur + 0.2), o2 = R.osc('sine', 29, t, t + dur + 0.2), sg = R.g(0);
      o.connect(sg); o2.connect(sg); sg.connect(out);
      R.pts(sg.gain, [[t, 0], [t + 0.8, 0.45], [t + dur * 0.6, 0.2], [t + dur, 0]]);
      // Rücksog: aufsteigender Wind nach einigen Sekunden
      whoosh(R, out, t + dur * 0.3, 200, 1200, dur * 0.35, 0.12, 0.8, 'pink');
      return dur + 0.3;
    } });

  def('thunder', { prio: 8, cls: 'loud', gap: 0.25, vol: 1.27,
    fn(R, out, t, p) {
      // Knall
      for (const dt of [0, 0.025 + R.rr(0, 0.02), 0.07]) {
        const n = R.noise('white', t + dt, t + dt + 0.3), hp = R.f('highpass', 1000, 0.7), g = R.g(0);
        R.c(n, hp, g, out); R.env(g.gain, t + dt, 0.001, dt ? 0.35 : 0.6, 0.1 + dt);
      }
      thud(R, out, t, 90, 40, 0.5, 0.35);
      // Grollen (mit Entfernung später)
      const t2 = t + 0.12 + C.clamp(C.fin(p.far, 0), 0, 1) * 1.2, len = R.rr(3.5, 5.5);
      const n = R.noise('brown', t2, t2 + len + 0.2), lp = R.f('lowpass', 320, 0.8), g = R.g(0);
      R.c(n, lp, g, out);
      R.xpts(lp.frequency, [[t2, 600], [t2 + len, 150]]);
      const L = [[t2, 0], [t2 + 0.2, 0.75]];
      let tt = t2 + 0.2, v = 0.75;
      while (tt < t2 + len - 0.6) { tt += R.rr(0.35, 0.9); v *= R.rr(0.6, 0.95); L.push([tt, v * R.rr(0.5, 1.2)]); }
      L.push([t2 + len, 0]);
      R.pts(g.gain, L);
      return t2 - t + len + 0.1;
    } });

  def('spark', { prio: 4, cls: 'mid', gap: 0.1, vol: 2.0,
    fn(R, out, t) {
      for (let i = 0; i < 3; i++) R.tick(out, t + i * R.rr(0.02, 0.05), R.rr(3000, 6000), 0.8, 0.35, 0.03);
      const o = R.osc('sawtooth', 110, t, t + 0.3), bp = R.f('bandpass', 1800, 2), g = R.g(0);
      R.c(o, bp, g, out); R.lfo('square', 47, 40, o.frequency, t, t + 0.3); R.env(g.gain, t, 0.003, 0.2, 0.2);
      return 0.35;
    } });

  def('meteor', { prio: 8, cls: 'loud', gap: 0.3, vol: 1.57,
    fn(R, out, t) {
      const L = 0.55;
      const o = R.osc('sine', 2400, t, t + L + 0.05), g = R.g(0); R.c(o, g, out);
      R.xpts(o.frequency, [[t, 2600], [t + L, 400]]); R.pts(g.gain, [[t, 0], [t + L * 0.8, 0.12], [t + L, 0]]);
      whoosh(R, out, t, 4000, 600, L, 0.35, 0.7);
      return L + boomCore(R, out, t + L, 0.52);
    } });

  def('bombfall', { prio: 5, cls: 'mid', gap: 0.15, vol: 1.75,
    fn(R, out, t) {
      const L = 0.9, o = R.osc('sine', 1700, t, t + L + 0.05), g = R.g(0); R.c(o, g, out);
      R.xpts(o.frequency, [[t, 1700], [t + L, 520]]); R.pts(g.gain, [[t, 0], [t + 0.2, 0.12], [t + L * 0.9, 0.2], [t + L, 0]]);
      return L + 0.05;
    } });

  def('quake', { prio: 8, cls: 'loud', gap: 1, vol: 1.15,
    fn(R, out, t) {
      const L = 4.2;
      const n = R.noise('brown', t, t + L + 0.2), lp = R.f('lowpass', 120, 1.2), g = R.g(0), am = R.g(1);
      R.c(n, lp, am, g, out); R.lfo('sine', 7, 0.5, am.gain, t, t + L);
      R.pts(g.gain, [[t, 0], [t + 0.5, 0.9], [t + 1.6, 1], [t + 2.8, 0.6], [t + L, 0]]);
      const o = R.osc('sine', 30, t, t + L), og = R.g(0); R.c(o, og, out); R.lfo('sine', 0.7, 5, o.frequency, t, t + L);
      R.pts(og.gain, [[t, 0], [t + 0.8, 0.5], [t + 3, 0.3], [t + L, 0]]);
      for (let i = 0; i < 9; i++) { const at = t + 0.3 + R.rnd() * 3; R.tick(out, at, R.rr(300, 1500), 2, 0.15, R.rr(0.02, 0.08), 'pink'); }
      thud(R, out, t + 0.4, 70, 40, 0.5, 0.4); thud(R, out, t + 1.7, 65, 38, 0.4, 0.4);
      return L + 0.1;
    } });

  def('eruption', { prio: 8, cls: 'loud', gap: 1.2, vol: 1.65,
    fn(R, out, t) {
      boomCore(R, out, t, 0.33);
      const L = 4, n = R.noise('brown', t, t + L), lp = R.f('lowpass', 150, 1), g = R.g(0); R.c(n, lp, g, out);
      R.pts(g.gain, [[t, 0], [t + 0.4, 0.6], [t + L, 0]]);
      for (let i = 0; i < 7; i++) { const at = t + 0.5 + R.rnd() * 3; thud(R, out, at, R.rr(90, 160), 60, 0.12, 0.15); R.tick(out, at, 900, 1, 0.08, 0.05, 'pink'); }
      return L + 0.1;
    } });

  def('lava', { prio: 2, cls: 'detail', gap: 0.2, vol: 1.25,
    fn(R, out, t) {
      for (let i = 0; i < 2; i++) { const at = t + i * R.rr(0.1, 0.3); const o = R.osc('sine', 120, at, at + 0.2), g = R.g(0); R.c(o, g, out); R.xpts(o.frequency, [[at, R.rr(80, 140)], [at + 0.12, R.rr(260, 420)]]); R.env(g.gain, at, 0.01, 0.25, 0.1); }
      return 0.7;
    } });

  def('steam', { prio: 2, cls: 'detail', gap: 0.3, vol: 0.75,
    fn(R, out, t) {
      const n = R.noise('white', t, t + 1.2), hp = R.f('highpass', 2600, 0.7), g = R.g(0); R.c(n, hp, g, out);
      R.pts(g.gain, [[t, 0], [t + 0.06, 0.25], [t + 1.1, 0]]); return 1.15;
    } });

  def('flood', { prio: 6, cls: 'loud', gap: 1.5, vol: 1.6,
    fn(R, out, t) {
      const L = 3, n = R.noise('pink', t, t + L, true), lp = R.f('lowpass', 300, 0.8), g = R.g(0); R.c(n, lp, g, out);
      R.xpts(lp.frequency, [[t, 300], [t + 0.9, 2600], [t + L, 600]]); R.pts(g.gain, [[t, 0], [t + 0.8, 0.8], [t + L, 0]]);
      for (let i = 0; i < 10; i++) { const at = t + 0.4 + R.rnd() * 2; R.tick(out, at, R.rr(600, 1800), 6, 0.06, 0.04); }
      return L + 0.05;
    } });

  def('rainburst', { prio: 3, cls: 'mid', gap: 0.8, vol: 1.3,
    fn(R, out, t) {
      const L = 3.5, n = R.noise('white', t, t + L, true), bp = R.f('bandpass', 3500, 0.5), g = R.g(0); R.c(n, bp, g, out);
      R.pts(g.gain, [[t, 0], [t + 0.6, 0.35], [t + 2.2, 0.3], [t + L, 0]]);
      for (let i = 0; i < 20; i++) R.tick(out, t + R.rnd() * 3, R.rr(2000, 6000), 4, 0.06, 0.01);
      return L;
    } });

  def('acid', { prio: 3, cls: 'mid', gap: 1, vol: 1.0,
    fn(R, out, t) {
      RECIPES.rainburst.fn(R, out, t, {});
      const n = R.noise('white', t, t + 2.5), hp = R.f('highpass', 5000, 1), g = R.g(0), am = R.g(1); R.c(n, hp, am, g, out);
      R.lfo('square', 13, 0.6, am.gain, t, t + 2.5); R.pts(g.gain, [[t, 0], [t + 0.5, 0.15], [t + 2.4, 0]]);
      return 3.5;
    } });

  def('laser', { prio: 8, cls: 'loud', gap: 0.4, vol: 1.15,
    fn(R, out, t) {
      const L = 1.8;
      const f = R.fm(out, t, 1400, 0.5, 4, 1, 0.01, 0.22, L);
      R.xpts(f.car.frequency, [[t, 2400], [t + 0.25, 600], [t + L, 420]]);
      const o = R.osc('sawtooth', 90, t, t + L), lp = R.f('lowpass', 800, 4), g = R.g(0); R.c(o, lp, g, out);
      R.lfo('sine', 9, 300, lp.frequency, t, t + L); R.ahr(g.gain, t, 0.05, 0.3, L - 0.5, 0.4);
      const n = R.noise('white', t, t + L), hp = R.f('highpass', 4000, 1), ng = R.g(0); R.c(n, hp, ng, out); R.ahr(ng.gain, t, 0.02, 0.12, L - 0.4, 0.3);
      boomCore(R, out, t + 0.1, 0.18);
      return L + 0.1;
    } });

  def('bang', { prio: 9, cls: 'loud', gap: 0.5, vol: 1.75,
    fn(R, out, t) {   // Implosion: Sog, dann Knall
      const L = 0.8, n = R.noise('pink', t, t + L + 0.05), bp = R.f('bandpass', 300, 1), g = R.g(0); R.c(n, bp, g, out);
      R.xpts(bp.frequency, [[t, 200], [t + L, 3000]]); R.pts(g.gain, [[t, 0], [t + L - 0.02, 0.6], [t + L, 0]]);
      return L + boomCore(R, out, t + L, 0.38);
    } });

  def('collapse', { prio: 6, cls: 'mid', gap: 0.15, vol: 1.15,
    fn(R, out, t, p) {
      const big = C.clamp((C.fin(p.count, 1) - 1) / 4, 0, 1), L = 1.2 + big * 0.8;
      const n = R.noise('brown', t, t + L + 0.1), lp = R.f('lowpass', 700, 0.8), g = R.g(0); R.c(n, lp, g, out);
      R.xpts(lp.frequency, [[t, 1200], [t + L, 200]]); R.env(g.gain, t, 0.02, 0.8, L);
      thud(R, out, t, 85, 45, 0.6, 0.3);
      const k = 10 + Math.floor(big * 10);
      for (let i = 0; i < k; i++) { const at = t + Math.pow(R.rnd(), 1.4) * L; R.tick(out, at, R.rr(400, 2500), R.rr(2, 6), 0.15 * (1 - (at - t) / L) + 0.03, R.rr(0.015, 0.05)); }
      return L + 0.1;
    } });

  def('hit', { prio: 2, cls: 'detail', gap: 0.08, vol: 1.2,
    fn(R, out, t) { R.tick(out, t, R.rr(300, 700), 2, 0.4, 0.06, 'pink'); thud(R, out, t, 130, 70, 0.3, 0.07); return 0.15; } });

  def('build', { prio: 3, cls: 'detail', gap: 0.25, vol: 2.2,
    fn(R, out, t) {
      for (let i = 0; i < 3; i++) hammerHit(R, out, t + i * 0.16, false, 0.4);
      const n = R.noise('pink', t + 0.5, t + 1), lp = R.f('lowpass', 600, 0.7), g = R.g(0); R.c(n, lp, g, out); R.env(g.gain, t + 0.5, 0.02, 0.3, 0.3);
      return 0.95;
    } });

  def('tornadoFx', { prio: 6, cls: 'loud', gap: 1, vol: 4.6,
    fn(R, out, t) { whoosh(R, out, t, 200, 900, 1.6, 0.6, 1, 'pink'); return 1.7; } });

  def('debris', { prio: 3, cls: 'mid', gap: 0.12, vol: 2.5,
    fn(R, out, t) { whoosh(R, out, t, 500, 1500, 0.35, 0.3, 1.5); for (let i = 0; i < 4; i++) R.tick(out, t + 0.2 + R.rnd() * 0.3, R.rr(500, 2000), 4, 0.12, 0.03); return 0.6; } });

  def('fling', { prio: 2, cls: 'detail', gap: 0.12, vol: 2.1,
    fn(R, out, t) { whoosh(R, out, t, 400, 1800, 0.3, 0.35, 2); return 0.4; } });

  def('roof', { prio: 3, cls: 'detail', gap: 0.15, vol: 1.5,
    fn(R, out, t) { for (let i = 0; i < 6; i++) R.tick(out, t + R.rnd() * 0.3, R.rr(200, 900), 3, 0.25, 0.05); thud(R, out, t, 110, 60, 0.3, 0.12); return 0.5; } });

  def('wreck', { prio: 6, cls: 'mid', gap: 0.3, vol: 1.3,
    fn(R, out, t) { RECIPES.collapse.fn(R, out, t, { count: 3 }); for (let i = 0; i < 8; i++) R.tick(out, t + R.rnd() * 0.5, R.rr(1500, 4000), 6, 0.12, 0.02); return 2; } });

  // ---------------------------------------------------------------------------
  // Waffen und Belagerung
  // ---------------------------------------------------------------------------
  def('tracer', { prio: 4, cls: 'mid', gap: 0.07, vol: 1.65,
    fn(R, out, t, p) {
      const heavy = !!p.heavy, n = C.clamp(Math.round(2 + C.fin(p.count, 1) * 1.5), 3, 12), dt = heavy ? 0.11 : 0.075;
      for (let i = 0; i < n; i++) {
        const at = t + i * dt * R.rr(0.9, 1.1);
        R.tick(out, at, heavy ? 900 : 1700, 1, heavy ? 0.5 : 0.4, heavy ? 0.06 : 0.035);
        thud(R, out, at, heavy ? 120 : 180, 60, heavy ? 0.4 : 0.22, heavy ? 0.09 : 0.05);
      }
      return n * dt + 0.15;
    } });

  def('arrow', { prio: 3, cls: 'detail', gap: 0.05, vol: 3.0,
    fn(R, out, t, p) {
      const n = C.clamp(Math.round(C.fin(p.count, 1)), 1, 4);
      let end = 0;
      for (let i = 0; i < n; i++) {
        const at = t + i * R.rr(0.04, 0.09), L = R.rr(0.16, 0.22);
        whoosh(R, out, at, 2200, 700, L, 0.2, 2.5);
        R.tick(out, at + L, R.rr(800, 1100), 4, 0.25, 0.04); thud(R, out, at + L, 200, 120, 0.1, 0.04);
        end = Math.max(end, at - t + L + 0.1);
      }
      return end;
    } });

  def('ballista', { prio: 5, cls: 'mid', gap: 0.15, vol: 0.88,
    fn(R, out, t) {
      const o = R.osc('sawtooth', 115, t, t + 0.5), lp = R.f('lowpass', 1500, 3), g = R.g(0); R.c(o, lp, g, out);
      R.xpts(o.frequency, [[t, 125], [t + 0.4, 100]]); R.lfo('sine', 22, 0.3, g.gain, t, t + 0.4); R.env(g.gain, t, 0.002, 0.28, 0.35);
      R.tick(out, t, 450, 3, 0.5, 0.07);
      whoosh(R, out, t + 0.02, 1200, 400, 0.3, 0.2, 1.5);
      return 0.55;
    } });

  def('catapult', { prio: 5, cls: 'mid', gap: 0.2, vol: 1.0,
    fn(R, out, t) {
      const o = R.osc('sawtooth', 55, t, t + 0.35), bp = R.f('bandpass', 500, 8), g = R.g(0); R.c(o, bp, g, out);
      R.lfo('sine', 6, 12, o.frequency, t, t + 0.35); R.ahr(g.gain, t, 0.05, 0.25, 0.15, 0.1);
      thud(R, out, t + 0.3, 95, 50, 0.6, 0.2); R.tick(out, t + 0.3, 300, 1, 0.4, 0.08, 'pink');
      whoosh(R, out, t + 0.32, 600, 300, 0.4, 0.2, 1.2);
      return 0.8;
    } });

  def('cannon', { prio: 6, cls: 'loud', gap: 0.15, vol: 0.92,
    fn(R, out, t) {
      const n = R.noise('white', t, t + 0.3), lp = R.f('lowpass', 5000, 0.7), g = R.g(0); R.c(n, lp, g, out); R.env(g.gain, t, 0.001, 0.7, 0.08);
      thud(R, out, t, 140, 45, 0.85, 0.5);
      const b = R.noise('brown', t, t + 1.2), blp = R.f('lowpass', 500, 0.8), bg = R.g(0); R.c(b, blp, bg, out); R.env(bg.gain, t, 0.005, 0.7, 0.9);
      return 1.2;
    } });

  def('ram', { prio: 5, cls: 'mid', gap: 0.25, vol: 0.87,
    fn(R, out, t) {
      thud(R, out, t, 75, 40, 0.9, 0.3);
      const n = R.noise('pink', t, t + 0.4), lp = R.f('lowpass', 450, 1), g = R.g(0); R.c(n, lp, g, out); R.env(g.gain, t, 0.002, 0.6, 0.2);
      R.tick(out, t, 240, 6, 0.5, 0.12); R.tick(out, t + 0.01, 520, 8, 0.2, 0.1);
      for (let i = 0; i < 3; i++) R.tick(out, t + 0.05 + R.rnd() * 0.2, R.rr(800, 1600), 5, 0.06, 0.03);
      return 0.5;
    } });

  def('ward', { prio: 2, cls: 'detail', gap: 0.5, vol: 1.0,
    fn(R, out, t) {
      for (const f of [220, 330, 440.5]) { const o = R.osc('sine', f, t, t + 1.3), g = R.g(0); R.c(o, g, out); R.lfo('sine', 4.5, 0.03, g.gain, t, t + 1.3); R.ahr(g.gain, t, 0.3, 0.08, 0.4, 0.5); }
      return 1.3;
    } });

  def('spikes', { prio: 2, cls: 'detail', gap: 0.2, vol: 1.1,
    fn(R, out, t) { R.fm(out, t, 1900, 3.5, 2, 0.1, 0.001, 0.2, 0.15); R.tick(out, t, 3000, 3, 0.3, 0.02); return 0.25; } });

  def('dud', { prio: 2, cls: 'detail', gap: 0.3, vol: 1.9,
    fn(R, out, t) {
      const n = R.noise('pink', t, t + 0.6), lp = R.f('lowpass', 900, 3), g = R.g(0); R.c(n, lp, g, out);
      R.xpts(lp.frequency, [[t, 1200], [t + 0.5, 200]]); R.pts(g.gain, [[t, 0], [t + 0.03, 0.35], [t + 0.5, 0]]);
      return 0.6;
    } });

  def('alarm', { prio: 5, cls: 'mid', gap: 3, vol: 1.5,
    fn(R, out, t) { for (let i = 0; i < 4; i++) bell(R, out, t + i * 0.38, 880, 0.25, 0.9, 2.76, 2.5); return 2.1; } });

  def('napalm', { prio: 7, cls: 'loud', gap: 0.5, vol: 2.2,
    fn(R, out, t) {
      const L = 2.6, n = R.noise('pink', t, t + L), bp = R.f('bandpass', 500, 0.7), g = R.g(0); R.c(n, bp, g, out);
      R.xpts(bp.frequency, [[t, 300], [t + 0.4, 1200], [t + L, 300]]); R.env(g.gain, t, 0.08, 0.8, L - 0.1);
      boomCore(R, out, t, 0.15);
      for (let i = 0; i < 14; i++) R.tick(out, t + 0.2 + R.rnd() * 2, R.rr(1500, 5000), 1, 0.08, 0.01);
      return L + 0.05;
    } });

  // ---------------------------------------------------------------------------
  // Segen, Leben, Seuche, Gelände
  // ---------------------------------------------------------------------------
  const PENTA = [74, 76, 78, 81, 83, 86, 88, 90, 93];   // D-Dur pentatonisch, hoch
  def('bless', { prio: 5, cls: 'mid', gap: 0.6, vol: 1.6,
    fn(R, out, t) {
      const start = R.rnd() * 3 | 0;
      for (let i = 0; i < 6; i++) bell(R, out, t + i * 0.075, C.mtof(PENTA[start + i]), 0.12, 1.4, 2, 0.8);
      return 1.9;
    } });
  def('heal', { prio: 4, cls: 'mid', gap: 0.6, vol: 1.4,
    fn(R, out, t) {
      for (const [m, d] of [[62, 0], [66, 0.15], [69, 0.3], [74, 0.45]]) {
        const o = R.osc('sine', C.mtof(m), t + d, t + d + 2), g = R.g(0); R.c(o, g, out); R.ahr(g.gain, t + d, 0.12, 0.09, 0.5, 1.1);
      }
      return 2.1;
    } });
  def('hearts', { prio: 3, cls: 'mid', gap: 0.8, vol: 1.75,
    fn(R, out, t) {
      for (const [m, d] of [[69, 0], [73, 0.12], [76, 0.24]]) {
        const o = R.osc('triangle', C.mtof(m), t + d, t + d + 1.5), g = R.g(0); R.c(o, g, out); R.lfo('sine', 5.5, 6, o.detune, t + d, t + d + 1.5); R.ahr(g.gain, t + d, 0.08, 0.08, 0.5, 0.7);
      }
      return 1.8;
    } });
  def('goldrain', { prio: 4, cls: 'mid', gap: 0.8, vol: 2.5,
    fn(R, out, t) { for (let i = 0; i < 12; i++) R.fm(out, t + R.rnd() * 1.3, R.rr(2600, 4800), 3.1, 1.2, 0.1, 0.001, 0.08, 0.25); return 1.7; } });
  def('seeds', { prio: 2, cls: 'mid', gap: 0.6, vol: 2.5,
    fn(R, out, t) { for (let i = 0; i < 6; i++) { const at = t + R.rnd() * 0.8; const o = R.osc('sine', 300, at, at + 0.1), g = R.g(0); R.c(o, g, out); R.xpts(o.frequency, [[at, 300], [at + 0.05, 900]]); R.env(g.gain, at, 0.004, 0.12, 0.05); } return 1; } });
  def('breeze', { prio: 3, cls: 'mid', gap: 1, vol: 3.4,
    fn(R, out, t) { whoosh(R, out, t, 400, 900, 2.4, 0.45, 0.8, 'pink'); return 2.5; } });
  def('frost', { prio: 4, cls: 'mid', gap: 1, vol: 3.3,
    fn(R, out, t) {
      for (let i = 0; i < 10; i++) R.fm(out, t + R.rnd() * 1.2, R.rr(3000, 6500), 1.5, 0.6, 0.05, 0.002, 0.05, 0.5);
      whoosh(R, out, t, 1500, 3000, 1.8, 0.15, 3);
      return 2;
    } });
  def('drought', { prio: 3, cls: 'mid', gap: 1, vol: 2.1,
    fn(R, out, t) { whoosh(R, out, t, 2500, 1200, 2, 0.25, 0.7); for (let i = 0; i < 16; i++) R.tick(out, t + R.rnd() * 1.8, R.rr(2000, 6000), 2, 0.05, 0.008); return 2.1; } });
  def('terrain', { prio: 3, cls: 'mid', gap: 0.4, vol: 1.8,
    fn(R, out, t, p) {   // Heben/Senken: Mahlen mit Tonhöhe hoch bzw. runter
      const L = 0.9, n = R.noise('brown', t, t + L), bp = R.f('bandpass', 160, 2), g = R.g(0), am = R.g(1); R.c(n, bp, am, g, out);
      R.xpts(bp.frequency, p.up ? [[t, 110], [t + L, 260]] : [[t, 260], [t + L, 100]]); R.lfo('sine', 14, 0.5, am.gain, t, t + L);
      R.pts(g.gain, [[t, 0], [t + 0.15, 1], [t + L, 0]]);
      return L + 0.05;
    } });
  def('plague', { prio: 5, cls: 'mid', gap: 1.2, vol: 1.3,
    fn(R, out, t) {
      const L = 2.6, lp = R.f('lowpass', 420, 1), g = R.g(0); R.c(lp, g, out);
      for (const f of [73.4, 77.8, 103.8]) { const o = R.osc('sawtooth', f, t, t + L); o.connect(lp); }
      R.pts(g.gain, [[t, 0], [t + 0.8, 0.18], [t + 1.8, 0.14], [t + L, 0]]);
      for (const at of [t + 0.6, t + 0.8, t + 1.6, t + 1.75]) R.tick(out, at, R.rr(700, 1000), 3, 0.18, 0.09, 'pink');
      return L;
    } });
  def('chime', { prio: 3, cls: 'mid', gap: 0.5, vol: 1.9,
    fn(R, out, t, p) {
      const ms = p.big ? [62, 66, 69, 74] : [69, 74];
      ms.forEach((m, i) => bell(R, out, t + i * 0.11, C.mtof(m + 12), 0.12, 1.2, 2, 1));
      return 1.6;
    } });

  // ---------------------------------------------------------------------------
  // Kleinkram
  // ---------------------------------------------------------------------------
  def('poof', { prio: 1, cls: 'detail', gap: 0.1, vol: 1.5,
    fn(R, out, t) { const n = R.noise('pink', t, t + 0.3), lp = R.f('lowpass', 900, 0.7), g = R.g(0); R.c(n, lp, g, out); R.env(g.gain, t, 0.01, 0.3, 0.18); return 0.3; } });
  def('splash', { prio: 2, cls: 'detail', gap: 0.15, vol: 1.2,
    fn(R, out, t) {
      const n = R.noise('white', t, t + 0.5), bp = R.f('bandpass', 1500, 0.8), g = R.g(0); R.c(n, bp, g, out); R.env(g.gain, t, 0.005, 0.35, 0.3);
      thud(R, out, t, 400, 150, 0.15, 0.1);
      for (let i = 0; i < 4; i++) { const at = t + 0.1 + R.rnd() * 0.3; const o = R.osc('sine', 900, at, at + 0.06), og = R.g(0); R.c(o, og, out); R.xpts(o.frequency, [[at, 900], [at + 0.04, 1600]]); R.env(og.gain, at, 0.002, 0.05, 0.04); }
      return 0.55;
    } });
  def('fishjump', { prio: 1, cls: 'detail', gap: 0.3, vol: 1.4,
    fn(R, out, t) { const o = R.osc('sine', 800, t, t + 0.1), g = R.g(0); R.c(o, g, out); R.xpts(o.frequency, [[t, 700], [t + 0.05, 1400]]); R.env(g.gain, t, 0.002, 0.12, 0.06); R.tick(out, t, 2500, 1, 0.08, 0.05); return 0.15; } });
  def('grab', { prio: 3, cls: 'detail', gap: 0.2, vol: 2.6,
    fn(R, out, t) { whoosh(R, out, t, 500, 1600, 0.2, 0.25, 2); thud(R, out, t + 0.18, 500, 900, 0.1, 0.05); return 0.3; } });
  def('drop', { prio: 3, cls: 'detail', gap: 0.2, vol: 1.2,
    fn(R, out, t) { whoosh(R, out, t, 1400, 400, 0.22, 0.25, 2); thud(R, out, t + 0.22, 140, 80, 0.3, 0.1); return 0.4; } });
  def('scare', { prio: 3, cls: 'detail', gap: 0.4, vol: 2.0,
    fn(R, out, t) { const o = R.osc('triangle', 300, t, t + 0.6), g = R.g(0); R.c(o, g, out); R.lfo('sine', 11, 40, o.frequency, t, t + 0.6); R.xpts(o.frequency, [[t, 260], [t + 0.5, 520]]); R.env(g.gain, t, 0.02, 0.15, 0.5); return 0.6; } });
  def('split', { prio: 2, cls: 'detail', gap: 0.3, vol: 0.87,
    fn(R, out, t) { return RECIPES.slime.fn(R, out, t, {}); } });
  def('sandburst', { prio: 4, cls: 'mid', gap: 0.4, vol: 2.2,
    fn(R, out, t) {
      whoosh(R, out, t, 3000, 900, 0.7, 0.35, 0.8);
      const n = R.noise('brown', t, t + 1), lp = R.f('lowpass', 150, 1), g = R.g(0); R.c(n, lp, g, out); R.env(g.gain, t, 0.05, 0.7, 0.8);
      return 1.05;
    } });
  def('snowball', { prio: 2, cls: 'detail', gap: 0.2, vol: 1.9,
    fn(R, out, t) {
      whoosh(R, out, t, 900, 500, 0.3, 0.2, 1.5);
      const n = R.noise('pink', t + 0.3, t + 0.6), lp = R.f('lowpass', 1400, 0.7), g = R.g(0); R.c(n, lp, g, out); R.env(g.gain, t + 0.3, 0.003, 0.4, 0.15);
      return 0.55;
    } });
  def('firebreath', { prio: 7, cls: 'loud', gap: 0.6, vol: 1.8,
    fn(R, out, t) {
      RECIPES.dragon.fn(R, out, t, { short: true });
      const L = 1.4, n = R.noise('pink', t + 0.2, t + 0.2 + L), bp = R.f('bandpass', 700, 0.8), g = R.g(0); R.c(n, bp, g, out);
      R.xpts(bp.frequency, [[t + 0.2, 400], [t + 0.5, 1400], [t + 0.2 + L, 500]]); R.env(g.gain, t + 0.2, 0.1, 0.5, L - 0.1);
      for (let i = 0; i < 10; i++) R.tick(out, t + 0.4 + R.rnd() * L, R.rr(1500, 5000), 1, 0.07, 0.01);
      return 1.9;
    } });

  // ---------------------------------------------------------------------------
  // Tiere und Monster
  // ---------------------------------------------------------------------------
  def('sheep', { prio: 2, cls: 'detail', gap: 0.8, vol: 1.5,
    fn(R, out, t) {
      const f0 = R.rr(230, 320), L = R.rr(0.55, 0.8), o = R.osc('sawtooth', f0, t, t + L + 0.1), pre = R.g(1), g = R.g(0), lp = R.f('lowpass', 400, 0.7);
      R.xpts(o.frequency, [[t, f0], [t + L, f0 * 0.9]]); R.lfo('sine', R.rr(22, 28), f0 * 0.03, o.frequency, t, t + L);
      R.c(o, pre); R.lfo('sine', R.rr(22, 28), 0.45, pre.gain, t, t + L);
      R.c(pre, lp); R.xpts(lp.frequency, [[t, 400], [t + 0.09, 4000]]);
      formants(R, lp, g, [[750, 5, 1], [1700, 8, 0.6], [2600, 10, 0.35]]);
      g.connect(out); R.ahr(g.gain, t, 0.04, 0.6, L - 0.25, 0.2);
      return L + 0.1;
    } });
  def('cow', { prio: 2, cls: 'detail', gap: 1.2, vol: 1.0,
    fn(R, out, t) {
      const L = R.rr(1.1, 1.6), f0 = R.rr(95, 115), o = R.osc('sawtooth', f0, t, t + L + 0.1), lp = R.f('lowpass', 300, 4), g = R.g(0);
      R.xpts(o.frequency, [[t, f0], [t + L * 0.35, f0 * 1.18], [t + L, f0 * 0.88]]);
      R.c(o, lp); R.xpts(lp.frequency, [[t, 260], [t + L * 0.4, 1100], [t + L, 450]]);
      formants(R, lp, g, [[350, 4, 1], [800, 5, 0.5], [2200, 6, 0.1]]);
      const n = R.noise('pink', t, t + L), nf = R.f('bandpass', 1200, 1), ng = R.g(0.03); R.c(n, nf, ng, g);
      g.connect(out); R.ahr(g.gain, t, 0.15, 0.9, L - 0.5, 0.35);
      return L + 0.1;
    } });
  function cluck(R, out, t, f0, peak) {
    const n = 3 + (R.rnd() * 2 | 0);
    let at = t;
    for (let i = 0; i <= n; i++) {
      const last = i === n, L = last ? 0.24 : 0.055;
      const o = R.osc('square', f0, at, at + L + 0.05), g = R.g(0);
      if (last) R.xpts(o.frequency, [[at, f0], [at + 0.08, f0 * 1.6], [at + L, f0 * 1.2]]);
      else R.xpts(o.frequency, [[at, f0 * 1.1], [at + L, f0 * 0.9]]);
      formants(R, o, g, [[1100, 3, 1], [2400, 5, 0.4]]); g.connect(out);
      R.env(g.gain, at, 0.004, peak, L);
      at += last ? 0 : R.rr(0.12, 0.2);
    }
    return at - t + 0.3;
  }
  def('chicken', { prio: 2, cls: 'detail', gap: 0.6, vol: 2.2,
    fn(R, out, t) { return cluck(R, out, t, R.rr(420, 560), 0.4); } });
  def('egg', { prio: 1, cls: 'detail', gap: 0.5, vol: 2.1,
    fn(R, out, t) { const o = R.osc('square', 480, t, t + 0.1), g = R.g(0); formants(R, o, g, [[1100, 3, 1]]); g.connect(out); R.env(g.gain, t, 0.004, 0.35, 0.06); R.tick(out, t + 0.2, 1800, 5, 0.2, 0.02); return 0.3; } });
  def('giantchicken', { prio: 6, cls: 'mid', gap: 1, vol: 1.27,
    fn(R, out, t) { const g = R.g(1), d = R.drive(2); R.c(g, d, out); return cluck(R, g, t, R.rr(170, 220), 0.6); } });
  def('wolf', { prio: 3, cls: 'mid', gap: 2, vol: 1.2,
    fn(R, out, t) {
      const L = R.rr(2, 2.8), f = R.rr(320, 380), o = R.osc('triangle', f, t, t + L + 0.1), o2 = R.osc('sine', f * 2, t, t + L + 0.1), g = R.g(0), g2 = R.g(0.15), bp = R.f('bandpass', 900, 0.6);
      for (const x of [o, o2]) { R.xpts(x.frequency, [[t, f * (x === o2 ? 2 : 1)], [t + 0.6, f * 1.75 * (x === o2 ? 2 : 1)], [t + L * 0.75, f * 1.6 * (x === o2 ? 2 : 1)], [t + L, f * 1.2 * (x === o2 ? 2 : 1)]]); R.lfo('sine', 5.5, 10, x.detune, t + 0.5, t + L); }
      R.c(o, bp); R.c(o2, g2, bp); R.c(bp, g, out);
      R.ahr(g.gain, t, 0.4, 0.5, L - 1.2, 0.8);
      return L + 0.1;
    } });
  function growl(R, out, t, f0, L, peak, bright) {
    const lp = R.f('lowpass', bright || 600, 4), am = R.g(1), g = R.g(0), d = R.drive(2.5);
    for (const k of [1, 1.03, 1.5]) { const o = R.osc('sawtooth', f0 * k, t, t + L + 0.1); R.lfo('sine', R.rr(2, 4), f0 * 0.06, o.frequency, t, t + L); o.connect(lp); }
    const n = R.noise('brown', t, t + L), ng = R.g(0.6); R.c(n, ng, lp);
    R.c(lp, am, d, g, out); R.lfo('sine', R.rr(14, 20), 0.5, am.gain, t, t + L);
    R.ahr(g.gain, t, 0.12, peak, L - 0.5, 0.35);
    return lp;
  }
  def('bear', { prio: 3, cls: 'detail', gap: 1.5, vol: 1.1,
    fn(R, out, t) { const L = R.rr(1, 1.5); growl(R, out, t, R.rr(70, 90), L, 0.5); return L + 0.1; } });
  def('yeti', { prio: 5, cls: 'mid', gap: 1.5, vol: 1.1,
    fn(R, out, t) { const L = 1.8, lp = growl(R, out, t, 120, L, 0.55, 1100); R.xpts(lp.frequency, [[t, 500], [t + 0.5, 1500], [t + L, 600]]); return L + 0.1; } });
  def('dragon', { prio: 7, cls: 'loud', gap: 1.5, vol: 2.0,
    fn(R, out, t, p) {
      const L = p.short ? 1.2 : R.rr(2, 2.6), f0 = R.rr(85, 100);
      const src = R.g(1), am = R.g(1), d = R.drive(3), g = R.g(0);
      for (const k of [1, 1.49, 0.5, 1.01]) { const o = R.osc('sawtooth', f0 * k, t, t + L + 0.1); R.xpts(o.frequency, [[t, f0 * k * 1.15], [t + L * 0.3, f0 * k], [t + L, f0 * k * 0.65]]); o.connect(src); }
      const n = R.noise('white', t, t + L), nb = R.f('bandpass', 1800, 1), ng = R.g(0.25); R.c(n, nb, ng, src);
      const fs = formants(R, src, am, [[550, 3, 1], [1100, 4, 0.7], [2500, 5, 0.3]]);
      R.xpts(fs[0].frequency, [[t, 400], [t + L * 0.3, 800], [t + L, 450]]);
      R.xpts(fs[1].frequency, [[t, 900], [t + L * 0.3, 1400], [t + L, 800]]);
      R.lfo('sine', 31, 0.4, am.gain, t, t + L);
      R.c(am, d, g, out);
      R.ahr(g.gain, t, 0.15, 0.55, L - 0.6, 0.45);
      return L + 0.1;
    } });
  def('demon', { prio: 6, cls: 'mid', gap: 1.5, vol: 1.1,
    fn(R, out, t) { const L = 1.8; growl(R, out, t, 55, L, 0.55, 800); for (let i = 0; i < 8; i++) R.tick(out, t + R.rnd() * L, R.rr(1500, 4000), 1, 0.06, 0.01); return L + 0.1; } });
  def('zombie', { prio: 3, cls: 'detail', gap: 1.2, vol: 1.47,
    fn(R, out, t) {
      const L = R.rr(1.1, 1.6), f0 = R.rr(85, 110), o = R.osc('sawtooth', f0, t, t + L + 0.1), g = R.g(0), am = R.g(1);
      R.lfo('sine', 3, 7, o.frequency, t, t + L); R.xpts(o.frequency, [[t, f0], [t + L, f0 * 0.8]]);
      formants(R, o, am, [[420, 5, 1], [900, 6, 0.5]]); R.lfo('sine', 8, 0.35, am.gain, t, t + L);
      R.c(am, g, out); R.ahr(g.gain, t, 0.2, 0.7, L - 0.6, 0.4);
      return L + 0.1;
    } });
  def('skeleton', { prio: 2, cls: 'detail', gap: 1, vol: 5.4,
    fn(R, out, t) { const n = 10 + (R.rnd() * 6 | 0); let at = t; for (let i = 0; i < n; i++) { R.tick(out, at, R.rr(1700, 3200), 8, 0.25, 0.02); at += R.rr(0.03, 0.055); } return at - t + 0.1; } });
  def('slime', { prio: 2, cls: 'detail', gap: 0.8, vol: 1.0,
    fn(R, out, t) {
      const n = R.noise('brown', t, t + 0.45), lp = R.f('lowpass', 200, 9), g = R.g(0); R.c(n, lp, g, out);
      R.xpts(lp.frequency, [[t, 200], [t + 0.15, 1500], [t + 0.4, 300]]); R.env(g.gain, t, 0.03, 0.7, 0.35);
      thud(R, out, t + 0.05, 180, 80, 0.2, 0.12);
      return 0.5;
    } });
  def('ghost', { prio: 3, cls: 'detail', gap: 2, vol: 1.75,
    fn(R, out, t) {
      const L = 2.2;
      for (const k of [1, 1.5]) {
        const o = R.osc('sine', 420 * k, t, t + L + 0.1), g = R.g(0); R.c(o, g, out);
        R.xpts(o.frequency, [[t, 400 * k], [t + 0.8, 540 * k], [t + L, 360 * k]]); R.lfo('sine', 5, 18 * k, o.frequency, t, t + L);
        R.ahr(g.gain, t, 0.6, k === 1 ? 0.18 : 0.06, 0.6, 0.9);
      }
      return L + 0.1;
    } });
  def('sandworm', { prio: 5, cls: 'mid', gap: 2, vol: 1.33,
    fn(R, out, t) { RECIPES.sandburst.fn(R, out, t, {}); growl(R, out, t + 0.2, 45, 1.4, 0.4, 300); return 1.7; } });
  def('treant', { prio: 3, cls: 'detail', gap: 2, vol: 1.8,
    fn(R, out, t) {
      const L = 1.6, o = R.osc('sawtooth', 45, t, t + L + 0.1), g = R.g(0);
      R.xpts(o.frequency, [[t, 35], [t + L * 0.5, 70], [t + L, 40]]); R.lfo('sine', 3, 8, o.frequency, t, t + L);
      formants(R, o, g, [[700, 12, 1], [1400, 10, 0.5], [350, 6, 0.6]]); g.connect(out); R.ahr(g.gain, t, 0.2, 0.7, L - 0.6, 0.4);
      thud(R, out, t, 60, 45, 0.3, 0.8);
      return L + 0.1;
    } });
  def('golem', { prio: 3, cls: 'detail', gap: 2, vol: 0.98,
    fn(R, out, t) {
      const L = 1.2, n = R.noise('brown', t, t + L), bp = R.f('bandpass', 300, 2), am = R.g(1), g = R.g(0); R.c(n, bp, am, g, out);
      R.lfo('square', 12, 0.5, am.gain, t, t + L); R.ahr(g.gain, t, 0.1, 0.9, L - 0.4, 0.3);
      thud(R, out, t, 70, 40, 0.5, 0.25); thud(R, out, t + 0.6, 65, 40, 0.5, 0.25);
      return L + 0.1;
    } });

  // ---------------------------------------------------------------------------
  // Umgebung (Einzelklänge; von audio-ambient.js geplant)
  // ---------------------------------------------------------------------------
  def('bird', { prio: 1, cls: 'detail', gap: 0.15, vol: 1.8,
    fn(R, out, t, p) {
      const kind = p.variant != null ? p.variant : (R.rnd() * 5 | 0);
      if (kind === 0) {           // Zwitschern
        const n = 3 + (R.rnd() * 4 | 0), fa = R.rr(3000, 4200), up = R.rnd() < 0.5;
        let at = t;
        for (let i = 0; i < n; i++) { const f = R.fm(out, at, fa, 2, 0.3, 0.1, 0.008, 0.18, R.rr(0.05, 0.08)); R.xpts(f.car.frequency, [[at, fa], [at + 0.06, fa * (up ? 1.3 : 0.75)]]); at += R.rr(0.09, 0.13); }
        return at - t + 0.1;
      }
      if (kind === 1) {           // Flöten (Amsel-artig)
        const n = 6 + (R.rnd() * 5 | 0), o = R.osc('sine', 2000, t, t + n * 0.13 + 0.2), g = R.g(0); R.c(o, g, out);
        const fp = [[t, R.rr(1600, 2400)]], gp = [[t, 0]];
        let at = t;
        for (let i = 0; i < n; i++) { const d = R.rr(0.08, 0.14); fp.push([at + d * 0.5, R.rr(1600, 3200)]); gp.push([at + 0.015, R.rr(0.1, 0.2)], [at + d - 0.01, R.rr(0.04, 0.1)]); at += d; }
        gp.push([at + 0.04, 0]); R.xpts(o.frequency, fp); R.pts(g.gain, gp); R.lfo('sine', 28, 40, o.frequency, t, at);
        return at - t + 0.1;
      }
      if (kind === 2) {           // Kuckuck-artiger Zweiton
        const f1 = R.rr(650, 760), reps = 1 + (R.rnd() * 2 | 0);
        for (let r = 0; r < reps; r++) for (const [k, d] of [[1, 0], [0.8, 0.32]]) {
          const at = t + r * 0.9 + d, o = R.osc('sine', f1 * k, at, at + 0.35), o2 = R.osc('sine', f1 * k * 2, at, at + 0.35), g = R.g(0), g2 = R.g(0.08);
          R.c(o, g, out); R.c(o2, g2, g); R.ahr(g.gain, at, 0.03, 0.2, 0.12, 0.12);
        }
        return reps * 0.9 + 0.1;
      }
      if (kind === 3) {           // Triller
        const L = R.rr(0.5, 0.9), f = R.rr(4200, 5200), o = R.osc('sine', f, t, t + L + 0.05), am = R.g(1), g = R.g(0);
        R.c(o, am, g, out); R.lfo('square', R.rr(24, 34), 0.9, am.gain, t, t + L); R.xpts(o.frequency, [[t, f], [t + L, f * 0.82]]);
        R.ahr(g.gain, t, 0.03, 0.1, L - 0.1, 0.06);
        return L + 0.1;
      }
      // Tschilpen (Spatz)
      const n = 2 + (R.rnd() * 3 | 0);
      for (let i = 0; i < n; i++) { const at = t + i * R.rr(0.1, 0.18), o = R.osc('sine', 6000, at, at + 0.06), g = R.g(0); R.c(o, g, out); R.xpts(o.frequency, [[at, R.rr(5000, 6500)], [at + 0.035, R.rr(2200, 3000)]]); R.env(g.gain, at, 0.003, 0.16, 0.04); }
      return n * 0.18 + 0.1;
    } });
  def('jungleBird', { prio: 1, cls: 'detail', gap: 0.3, vol: 2.5,
    fn(R, out, t) {
      if (R.rnd() < 0.5) {
        for (let i = 0; i < 3; i++) { const at = t + i * 0.28, o = R.osc('sine', 800, at, at + 0.25), g = R.g(0); R.c(o, g, out); R.xpts(o.frequency, [[at, R.rr(700, 900)], [at + 0.2, R.rr(1400, 1900)]]); R.ahr(g.gain, at, 0.02, 0.18, 0.08, 0.1); }
        return 1;
      }
      const o = R.osc('sawtooth', 900, t, t + 0.4), g = R.g(0); R.xpts(o.frequency, [[t, 1100], [t + 0.3, 800]]);
      formants(R, o, g, [[1500, 4, 1], [3000, 6, 0.4]]); g.connect(out); R.ahr(g.gain, t, 0.01, 0.2, 0.15, 0.12);
      return 0.45;
    } });
  def('gull', { prio: 1, cls: 'detail', gap: 0.5, vol: 3.5,
    fn(R, out, t) {
      const n = 2 + (R.rnd() * 2 | 0);
      for (let i = 0; i < n; i++) {
        const at = t + i * 0.42, f = R.rr(1200, 1450), o = R.osc('sawtooth', f, at, at + 0.4), g = R.g(0);
        R.xpts(o.frequency, [[at, f], [at + 0.08, f * 1.1], [at + 0.35, f * 0.7]]);
        formants(R, o, g, [[1600, 4, 1], [3200, 6, 0.3]]); g.connect(out); R.ahr(g.gain, at, 0.02, 0.16, 0.18, 0.12);
      }
      return n * 0.42 + 0.1;
    } });
  def('woodpecker', { prio: 1, cls: 'detail', gap: 1, vol: 10,
    fn(R, out, t) { const n = 12 + (R.rnd() * 8 | 0), f = R.rr(1000, 1400); for (let i = 0; i < n; i++) R.tick(out, t + i * 0.05, f, 8, 0.25 * (1 - i / n * 0.5), 0.02); return n * 0.05 + 0.1; } });
  def('cricket', { prio: 1, cls: 'detail', gap: 0.1, vol: 1.8,
    fn(R, out, t) {
      const f = R.rr(4200, 5200), L = R.rr(1.6, 2.6), o = R.osc('sine', f, t, t + L + 0.1), g = R.g(0); R.c(o, g, out);
      const pts = [[t, 0]], per = R.rr(0.35, 0.55), pk = R.rr(0.07, 0.12);
      for (let c = t + 0.02; c < t + L - 0.15; c += per * R.rr(0.9, 1.1)) for (let k = 0; k < 3; k++) { const a = c + k * 0.032; pts.push([a, 0], [a + 0.006, pk], [a + 0.016, pk], [a + 0.022, 0]); }
      pts.push([t + L, 0]);
      R.pts(g.gain, pts);
      return L + 0.1;
    } });
  def('frog', { prio: 1, cls: 'detail', gap: 0.2, vol: 1.4,
    fn(R, out, t) {
      const n = 1 + (R.rnd() * 3 | 0), f0 = R.rr(100, 180);
      for (let i = 0; i < n; i++) {
        const at = t + i * R.rr(0.3, 0.45), L = R.rr(0.18, 0.3), o = R.osc('sawtooth', f0, at, at + L + 0.05), bp = R.f('bandpass', R.rr(450, 700), 4), am = R.g(1), g = R.g(0);
        R.xpts(o.frequency, [[at, f0 * 0.9], [at + L, f0 * 1.15]]);
        R.c(o, bp, am, g, out); R.lfo('square', R.rr(25, 35), 0.8, am.gain, at, at + L); R.ahr(g.gain, at, 0.015, 0.35, L - 0.08, 0.05);
      }
      return n * 0.45 + 0.1;
    } });
  def('wave', { prio: 2, cls: 'mid', gap: 1.2, vol: 1.6,
    fn(R, out, t, p) {
      const L = R.rr(4.5, 6.5), pk = R.rr(0.5, 0.8) * C.clamp(C.fin(p.amp, 1), 0, 1.5);
      const n = R.noise('pink', t, t + L + 0.1, true), lp = R.f('lowpass', 300, 0.7), g = R.g(0); R.c(n, lp, g, out);
      R.xpts(lp.frequency, [[t, 250], [t + L * 0.28, R.rr(1500, 2400)], [t + L, 350]]);
      R.pts(g.gain, [[t, 0], [t + L * 0.28, pk], [t + L * 0.45, pk * 0.7], [t + L, 0]]);
      const f = R.noise('white', t + L * 0.25, t + L + 0.1, true), hp = R.f('highpass', 2500, 0.5), fg = R.g(0); R.c(f, hp, fg, out);
      R.pts(fg.gain, [[t + L * 0.25, 0], [t + L * 0.33, pk * 0.25], [t + L, 0]]);
      return L + 0.1;
    } });
  def('hammer', { prio: 1, cls: 'detail', gap: 0.15, vol: 2.2,
    fn(R, out, t, p) { const n = 1 + (R.rnd() * 3 | 0), metal = !!p.metal; for (let i = 0; i < n; i++) hammerHit(R, out, t + i * R.rr(0.3, 0.42), metal, 0.35); return n * 0.42 + 0.3; } });
  def('crackle', { prio: 1, cls: 'detail', gap: 0.05, vol: 2.5,
    fn(R, out, t, p) {
      const n = 3 + Math.floor(R.rnd() * 6 * C.clamp(C.fin(p.amp, 1), 0.3, 2));
      for (let i = 0; i < n; i++) R.tick(out, t + R.rnd() * 0.7, R.rr(1200, 5000), R.rr(0.7, 2), R.rr(0.1, 0.35), R.rr(0.004, 0.02));
      if (R.rnd() < 0.4) thud(R, out, t + R.rnd() * 0.5, R.rr(150, 300), 100, 0.12, 0.04);
      return 0.8;
    } });
  def('clang', { prio: 2, cls: 'detail', gap: 0.08, vol: 1.6,
    fn(R, out, t) { R.fm(out, t, R.rr(1300, 2300), 2.76, 3, 0.1, 0.001, 0.2, 0.3); R.tick(out, t, 4000, 2, 0.25, 0.015); return 0.4; } });
  def('shout', { prio: 1, cls: 'mid', gap: 0.4, vol: 1.5,
    fn(R, out, t) {
      const L = R.rr(0.6, 1), lp = R.f('lowpass', 2000, 0.7), g = R.g(0);
      for (let i = 0; i < 4; i++) { const f = R.rr(150, 260), o = R.osc('sawtooth', f, t, t + L + 0.1); R.xpts(o.frequency, [[t, f], [t + L * 0.4, f * 1.15], [t + L, f * 0.9]]); R.lfo('sine', R.rr(4, 7), 8, o.frequency, t, t + L); formants(R, o, lp, [[750, 5, 0.25], [1250, 6, 0.15]]); }
      R.c(lp, g, out); R.ahr(g.gain, t, 0.15, 0.8, L - 0.4, 0.3);
      return L + 0.1;
    } });
  def('drum', { prio: 2, cls: 'mid', gap: 0.5, vol: 1.0,
    fn(R, out, t) { const n = 2 + (R.rnd() * 3 | 0); for (let i = 0; i < n; i++) timpani(R, out, t + i * 0.42, 0.45 - i * 0.05, 75); return n * 0.42 + 0.9; } });
  def('boomFar', { prio: 2, cls: 'mid', gap: 0.3, vol: 1.05,
    fn(R, out, t) { return boomCore(R, out, t, R.rr(0.15, 0.3)); } });
  def('clank', { prio: 1, cls: 'detail', gap: 0.3, vol: 1.9,
    fn(R, out, t) { R.tick(out, t, 600, 10, 0.3, 0.08); R.fm(out, t, R.rr(260, 340), 1.41, 4, 0.2, 0.002, 0.18, 0.25); return 0.4; } });

  // ---------------------------------------------------------------------------
  // Dauerklänge (Flugzeuge, Wirbelsturm, Schwarzes Loch, Vulkan, Flut)
  // ---------------------------------------------------------------------------
  function loopCtl(list) {
    return { set(k, v, t) { if (k === 'rate') for (const x of list) { try { if (x.detune) x.detune.setTargetAtTime(1200 * Math.log2(C.clamp(v, 0.5, 2)), t, 0.15); else if (x.playbackRate) x.playbackRate.setTargetAtTime(C.clamp(v, 0.5, 2), t, 0.15); } catch (e) { /* still */ } } } };
  }
  def('engine', { prio: 6, cls: 'loud', loop: true, vol: 0.3,
    fn(R, out, t, p) {
      const kind = p.kind || 'bomber', g = R.g(0), list = [];
      R.c(g, out); R.pts(g.gain, [[t, 0], [t + 0.8, 1]]);
      if (kind === 'rocket') {
        const n = R.noise('white', t), bp = R.f('bandpass', 1500, 0.8), a = R.g(0.35); R.c(n, bp, a, g);
        const b = R.noise('brown', t), lp = R.f('lowpass', 300, 0.7), bg = R.g(0.6); R.c(b, lp, bg, g);
        list.push(n, b);
      } else {
        const base = kind === 'gunship' ? 85 : 62, lp = R.f('lowpass', kind === 'gunship' ? 900 : 550, 1), am = R.g(0.7);
        for (const k of kind === 'gunship' ? [1, 2.01] : [1, 1.024, 1.5]) { const o = R.osc('sawtooth', base * k, t); o.connect(lp); list.push(o); }
        R.c(lp, am, g); R.lfo('sine', kind === 'gunship' ? 18 : 11, 0.25, am.gain, t);
        const n = R.noise('pink', t), bp = R.f('bandpass', 400, 0.8), ng = R.g(0.3); R.c(n, bp, ng, g); list.push(n);
      }
      return loopCtl(list);
    } });
  def('tornado', { prio: 7, cls: 'loud', loop: true, vol: 0.6,
    fn(R, out, t) {
      const g = R.g(0); R.c(g, out); R.pts(g.gain, [[t, 0], [t + 1.2, 1]]);
      const a = R.noise('pink', t, null, true), bp = R.f('bandpass', 450, 1.5), ag = R.g(0.8); R.c(a, bp, ag, g); R.lfo('sine', 0.3, 220, bp.frequency, t);
      const b = R.noise('white', t), bp2 = R.f('bandpass', 1200, 5), bg = R.g(0.35); R.c(b, bp2, bg, g); R.lfo('sine', 0.17, 400, bp2.frequency, t);
      const c = R.noise('brown', t), lp = R.f('lowpass', 150, 1), cg = R.g(0.7); R.c(c, lp, cg, g);
      return loopCtl([]);
    } });
  def('blackhole', { prio: 8, cls: 'loud', loop: true, vol: 0.5,
    fn(R, out, t) {
      const g = R.g(0); R.c(g, out); R.pts(g.gain, [[t, 0], [t + 1.5, 1]]);
      for (const f of [38, 41]) { const o = R.osc('sine', f, t), og = R.g(0.4); R.c(o, og, g); }
      const s = R.osc('sawtooth', 55, t), lp = R.f('lowpass', 200, 6), sg = R.g(0.25); R.c(s, lp, sg, g); R.lfo('sine', 0.2, 120, lp.frequency, t);
      const n = R.noise('pink', t), bp = R.f('bandpass', 900, 3), ng = R.g(0.4); R.c(n, bp, ng, g); R.lfo('sawtooth', 0.35, -500, bp.frequency, t);
      return loopCtl([]);
    } });
  def('volcano', { prio: 6, cls: 'loud', loop: true, vol: 0.7,
    fn(R, out, t) {
      const g = R.g(0); R.c(g, out); R.pts(g.gain, [[t, 0], [t + 1.5, 1]]);
      const n = R.noise('brown', t), lp = R.f('lowpass', 110, 1), am = R.g(0.9); R.c(n, lp, am, g); R.lfo('sine', 0.4, 0.3, am.gain, t);
      const p = R.noise('pink', t), lp2 = R.f('lowpass', 350, 1), pg = R.g(0.25); R.c(p, lp2, pg, g);
      return loopCtl([]);
    } });
  def('floodLoop', { prio: 5, cls: 'loud', loop: true, vol: 0.6,
    fn(R, out, t) {
      const g = R.g(0); R.c(g, out); R.pts(g.gain, [[t, 0], [t + 1.5, 1]]);
      const n = R.noise('pink', t, null, true), lp = R.f('lowpass', 1100, 0.7), am = R.g(0.7); R.c(n, lp, am, g); R.lfo('sine', 0.18, 0.3, am.gain, t); R.lfo('sine', 0.11, 400, lp.frequency, t);
      return loopCtl([]);
    } });

  // ---------------------------------------------------------------------------
  // Bedienung
  // ---------------------------------------------------------------------------
  def('ui_click', { prio: 9, cls: 'global', gap: 0.03, vol: 1.9,
    fn(R, out, t) { const o = R.osc('sine', 1700, t, t + 0.06), g = R.g(0); R.c(o, g, out); R.env(g.gain, t, 0.001, 0.2, 0.035); R.tick(out, t, 3500, 1, 0.08, 0.006); return 0.08; } });
  def('ui_select', { prio: 9, cls: 'global', gap: 0.05, vol: 2.5,
    fn(R, out, t) { R.fm(out, t, 1174.7, 4, 0.8, 0.05, 0.002, 0.16, 0.18); R.fm(out, t + 0.06, 1760, 4, 0.8, 0.05, 0.002, 0.14, 0.22); return 0.32; } });
  def('ui_tool', { prio: 9, cls: 'global', gap: 0.05, vol: 2.0,
    fn(R, out, t) { thud(R, out, t, 950, 700, 0.2, 0.06); R.tick(out, t, 1800, 3, 0.12, 0.02); return 0.1; } });
  def('ui_error', { prio: 9, cls: 'global', gap: 0.2, vol: 1.2,
    fn(R, out, t) {
      for (const [f, d] of [[330, 0], [311, 0.13]]) { const o = R.osc('triangle', f, t + d, t + d + 0.2), lp = R.f('lowpass', 1200, 0.7), g = R.g(0); R.c(o, lp, g, out); R.ahr(g.gain, t + d, 0.008, 0.2, 0.06, 0.06); }
      return 0.32;
    } });
  def('ui_open', { prio: 9, cls: 'global', gap: 0.08, vol: 2.5,
    fn(R, out, t) { whoosh(R, out, t, 500, 2000, 0.16, 0.1, 1.5); R.fm(out, t + 0.1, 880, 3, 0.6, 0.05, 0.002, 0.1, 0.2); return 0.35; } });
  def('ui_close', { prio: 9, cls: 'global', gap: 0.08, vol: 3.6,
    fn(R, out, t) { whoosh(R, out, t, 1800, 500, 0.16, 0.1, 1.5); R.fm(out, t + 0.08, 660, 3, 0.6, 0.05, 0.002, 0.08, 0.18); return 0.3; } });

  // ---------------------------------------------------------------------------
  // Chronik-Signale (nicht räumlich)
  // ---------------------------------------------------------------------------
  def('st_war', { prio: 8, cls: 'global', gap: 3, vol: 0.78,
    fn(R, out, t) {
      for (let i = 0; i < 6; i++) timpani(R, out, t + i * (0.14 - i * 0.012), 0.25 + i * 0.05, 82);
      brass(R, out, t + 0.75, 50, 0.6, 0.12); brass(R, out, t + 0.75, 57, 0.6, 0.1);
      brass(R, out, t + 1.55, 53, 1.0, 0.12); brass(R, out, t + 1.55, 60, 1.0, 0.1);
      timpani(R, out, t + 1.55, 0.5, 70);
      return 3.2;
    } });
  def('st_peace', { prio: 7, cls: 'global', gap: 3, vol: 3.1,
    fn(R, out, t) {
      [74, 78, 81, 86].forEach((m, i) => bell(R, out, t + i * 0.18, C.mtof(m), 0.12, 2.2, 2, 1));
      for (const m of [50, 57, 62, 66]) { const o = R.osc('triangle', C.mtof(m), t, t + 3.2), g = R.g(0); R.c(o, g, out); R.ahr(g.gain, t, 0.5, 0.05, 1.2, 1.4); }
      return 3.3;
    } });
  def('st_alliance', { prio: 7, cls: 'global', gap: 3, vol: 2.9,
    fn(R, out, t) {
      for (const m of [55, 62, 71]) brass(R, out, t, m, 0.6, 0.07);
      for (const m of [57, 64, 73]) brass(R, out, t + 0.75, m, 0.5, 0.07);
      for (const m of [50, 62, 66, 69]) brass(R, out, t + 1.4, m, 1.0, 0.07);
      return 3;
    } });
  def('st_crown', { prio: 7, cls: 'global', gap: 3, vol: 1.3,
    fn(R, out, t) {
      timpani(R, out, t, 0.4, 98);
      brass(R, out, t, 62, 0.12, 0.13); brass(R, out, t + 0.18, 62, 0.12, 0.13); brass(R, out, t + 0.36, 69, 0.28, 0.13);
      brass(R, out, t + 0.72, 74, 1.0, 0.14); brass(R, out, t + 0.72, 66, 1.0, 0.08); brass(R, out, t + 0.72, 62, 1.0, 0.07);
      timpani(R, out, t + 0.72, 0.45, 73);
      bell(R, out, t + 0.72, C.mtof(86), 0.06, 2, 2, 1);
      return 2.8;
    } });
  def('st_revolt', { prio: 7, cls: 'global', gap: 3, vol: 1.4,
    fn(R, out, t) {
      for (let i = 0; i < 22; i++) R.tick(out, t + i * 0.045, 1800, 0.8, 0.05 + i * 0.006, 0.05, 'white');
      for (const m of [50, 56, 61]) brass(R, out, t + 1.0, m, 0.35, 0.1);
      timpani(R, out, t + 1.0, 0.5, 70);
      return 2.2;
    } });
  def('st_found', { prio: 6, cls: 'global', gap: 3, vol: 4.4,
    fn(R, out, t) { [69, 71, 74, 81].forEach((m, i) => R.fm(out, t + i * 0.12, C.mtof(m), 4, 1, 0.05, 0.002, 0.13, 0.6)); return 1.2; } });
  def('st_gone', { prio: 8, cls: 'global', gap: 3, vol: 2.6,
    fn(R, out, t) {
      bell(R, out, t, C.mtof(50), 0.22, 4, 1.4, 4); bell(R, out, t + 1.7, C.mtof(50), 0.18, 4, 1.4, 4);
      const o = R.osc('sine', C.mtof(38), t, t + 5.5), g = R.g(0); R.c(o, g, out); R.ahr(g.gain, t, 1, 0.12, 2.5, 1.8);
      return 5.6;
    } });

  // ---------------------------------------------------------------------------
  // Abspielen (für audio.js und Messungen)
  // ---------------------------------------------------------------------------
  function play(ctx, dest, name, t, p, voice) {
    const rc = RECIPES[name];
    if (!rc) return 0;
    voice = voice || { srcs: [] };
    const R = C.makeR(ctx, voice);
    try {
      const r = rc.fn(R, dest, t, p || {});
      if (rc.loop) { voice.ctl = r; return Infinity; }
      return C.fin(r, 1);
    } catch (e) {
      for (const s of voice.srcs) { try { s.stop(); } catch (e2) { /* still */ } }
      return 0;
    }
  }

  WW.AudioSfx = { RECIPES, play, sizeFromR, boomDur };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
