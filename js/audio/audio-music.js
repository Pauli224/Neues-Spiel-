// =============================================================================
// Wuselwelt – Ton, erzeugte Musik: langsame Akkordflächen und sparsame Glockentupfer, Grundton D.
// Lagen: 'peace' (D-Dur, hell), 'war' (d-Moll/dorisch, leiser Pauken-Puls), 'dark' (phrygisch über D-Orgelpunkt,
// tief und sparsam). Jeder Takt ist EINE Stimme (Akkord + Melodie + Puls), Übergänge durch lange Ausklänge.
// WW.AudioMusic.bar(mood) -> Takt; playBar(R, out, t, bar) -> Dauer inkl. Ausklang
// =============================================================================
(function (WW) { 'use strict';

  const C = WW.AudioCore;

  const MOODS = {
    peace: {
      dur: 9, release: 4, cutoff: 1100, peak: 0.1, melN: [1, 3], melPeak: 0.14, pulse: false, drone: false,
      chords: [[50, 57, 61, 64, 66], [47, 54, 57, 62, 64], [43, 50, 54, 59, 61], [45, 52, 59, 61, 64], [52, 59, 62, 66, 67]],
      next: [[2, 1, 4], [2, 4], [0, 3], [0, 1], [3, 2]],
      scale: [62, 64, 66, 69, 71, 74, 76, 78, 81]
    },
    war: {
      dur: 7, release: 3, cutoff: 850, peak: 0.1, melN: [2, 4], melPeak: 0.12, pulse: true, drone: false,
      chords: [[50, 57, 60, 64, 65], [46, 53, 57, 62, 65], [43, 50, 53, 58, 62], [45, 52, 55, 60, 62], [48, 55, 62, 64, 67]],
      next: [[1, 2, 3], [4, 3], [3, 0], [0], [3, 1]],
      scale: [62, 65, 67, 69, 72, 74, 77]
    },
    dark: {
      dur: 11, release: 5, cutoff: 650, peak: 0.11, melN: [0, 2], melPeak: 0.1, pulse: false, drone: true,
      chords: [[38, 50, 53, 57], [38, 51, 55, 58, 62], [38, 49, 53, 58], [38, 50, 55, 57, 58]],
      next: [[1, 3], [0, 2], [0], [0, 1]],
      scale: [62, 63, 65, 69, 72, 74]
    }
  };

  const mem = { idx: 0, mood: 'peace', lastMel: 69 };

  function bar(mood) {
    const M = MOODS[mood] || MOODS.peace;
    if (mood !== mem.mood) { mem.idx = 0; mem.mood = mood; }
    const opts = M.next[mem.idx] || [0];
    const idx = opts[Math.floor(C.rnd() * opts.length) % opts.length];
    mem.idx = idx;
    const chord = M.chords[idx];
    const beats = 8, beat = M.dur / beats;
    const n = M.melN[0] + Math.floor(C.rnd() * (M.melN[1] - M.melN[0] + 1));
    const mel = [], used = {};
    for (let i = 0; i < n; i++) {
      let b = 1 + Math.floor(C.rnd() * (beats - 2));
      if (used[b]) continue;
      used[b] = 1;
      // Schrittweise Bewegung bevorzugt
      const sc = M.scale;
      let pos = sc.indexOf(mem.lastMel);
      if (pos < 0) pos = Math.floor(sc.length / 2);
      pos = C.clamp(pos + C.pick([-2, -1, -1, 1, 1, 2, 0]), 0, sc.length - 1);
      mem.lastMel = sc[pos];
      mel.push({ t: b * beat, m: sc[pos], v: C.rr(0.6, 1) });
    }
    mel.sort((a, b) => a.t - b.t);
    const pulse = M.pulse ? [0, 2, 4, 6].map((b) => ({ t: b * beat, v: b % 4 === 0 ? 1 : 0.6 })) : [];
    return { mood, chord, dur: M.dur, release: M.release, cutoff: M.cutoff, peak: M.peak, melPeak: M.melPeak, mel, pulse, drone: M.drone };
  }

  function playBar(R, out, t, b) {
    const end = t + b.dur + b.release;
    // Fläche
    const lp = R.f('lowpass', b.cutoff, 0.7), g = R.g(0);
    R.c(lp, g, out);
    R.lfo('sine', 0.07, b.cutoff * 0.25, lp.frequency, t, end);
    for (const m of b.chord) {
      const f = C.mtof(m);
      const o1 = R.osc('triangle', f, t, end); o1.detune.value = C.rr(-5, 5);
      const o2 = R.osc('sawtooth', f, t, end); o2.detune.value = C.rr(4, 9);
      const g2 = R.g(0.22); o1.connect(lp); o2.connect(g2); g2.connect(lp);
    }
    R.pts(g.gain, [[t, 0], [t + 2.6, b.peak], [t + b.dur, b.peak * 0.85], [end - 0.05, 0]]);
    // Grundton tief (weich)
    {
      const root = Math.min.apply(null, b.chord) - (b.drone ? 0 : 12);
      const o = R.osc('sine', C.mtof(root), t, end), bg = R.g(0); R.c(o, bg, out);
      R.pts(bg.gain, [[t, 0], [t + 3, b.peak * (b.drone ? 1.6 : 0.9)], [t + b.dur, b.peak * 0.7], [end - 0.05, 0]]);
    }
    // Dunkel: Luftrauschen
    if (b.drone) {
      const n = R.noise('pink', t, end), bp = R.f('bandpass', 400, 2), ng = R.g(0); R.c(n, bp, ng, out);
      R.lfo('sine', 0.05, 150, bp.frequency, t, end);
      R.pts(ng.gain, [[t, 0], [t + 4, 0.025], [end - 0.05, 0]]);
    }
    // Melodie: weiche FM-Glocke
    for (const e of b.mel) {
      const at = t + e.t, f = C.mtof(e.m);
      R.fm(out, at, f, 1, 1.6, 0.05, 0.01, b.melPeak * e.v, 2.4);
      const o = R.osc('sine', f * 2, at, at + 1.2), og = R.g(0); R.c(o, og, out); R.env(og.gain, at, 0.01, b.melPeak * 0.15 * e.v, 1);
    }
    // Puls (Krieg): leise tiefe Trommel
    for (const p of b.pulse) {
      const at = t + p.t, o = R.osc('sine', 70, at, at + 0.8), pg = R.g(0); R.c(o, pg, out);
      R.xpts(o.frequency, [[at, 78], [at + 0.5, 52]]); R.env(pg.gain, at, 0.005, 0.2 * p.v, 0.6);
      const n = R.noise('brown', at, at + 0.2), nl = R.f('lowpass', 300, 1), ng = R.g(0); R.c(n, nl, ng, out); R.env(ng.gain, at, 0.002, 0.05 * p.v, 0.1);
    }
    return b.dur + b.release;
  }

  WW.AudioMusic = { MOODS, bar, playBar };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
