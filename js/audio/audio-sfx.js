// =============================================================================
// Wuselwelt – Ton, Bedienklänge: kurze, leise, im Code erzeugte Klicks (Rückfallebene ohne Datei).
// Alles, was im Spiel zu hören ist, sind sonst Aufnahmen (WW.AudioBank).
// RECIPES[name] = { fn(R, out, t, p) -> Dauer, prio, cls, gap, vol }; play(ctx, dest, name, t, p, voice) -> Dauer
// =============================================================================
(function (WW) { 'use strict';

  const C = WW.AudioCore;
  const RECIPES = {};
  function def(name, o) { RECIPES[name] = o; }

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

  WW.AudioSfx = { RECIPES, play };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
