// =============================================================================
// Wuselwelt – Ton, Musik: ruhige CC0-Instrumentalstücke (audio/music_*.mp3, Quellen in audio/QUELLEN.md) als
// Wiedergabeliste mit langen Überblendungen (die Stücke müssen dafür nicht nahtlos sein).
// Lage: 'peace' unverändert, 'war' etwas dunkler und leiser, 'dark' deutlich gedämpft (Tiefpass).
// WW.AudioMusic.Player(ctx, bus) -> { tick(mood, on), stop(), current() }
// =============================================================================
(function (WW) { 'use strict';

  const TRACKS = ['music_bard', 'music_lake', 'music_inn'];
  const FADE = 4;
  const MOOD = { peace: { lp: 18000, g: 1 }, war: { lp: 2600, g: 0.8 }, dark: { lp: 900, g: 0.6 } };

  function Player(ctx, bus) {
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 18000; lp.Q.value = 0.5;
    const mg = ctx.createGain(); mg.gain.value = 1;
    lp.connect(mg); mg.connect(bus);
    let cur = null, idx = Math.floor(Math.random() * TRACKS.length), mood = 'peace';
    function startTrack(t) {
      for (let k = 0; k < TRACKS.length; k++) {
        const name = TRACKS[(idx + k) % TRACKS.length], buf = WW.AudioBank && WW.AudioBank.get(name);
        if (!buf) continue;
        idx = (idx + k + 1) % TRACKS.length;
        const s = ctx.createBufferSource(); s.buffer = buf;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + FADE);
        s.connect(g); g.connect(lp);
        s.start(t);
        const end = t + buf.duration;
        g.gain.setValueAtTime(1, Math.max(t + FADE, end - FADE)); g.gain.linearRampToValueAtTime(0, end);
        s.stop(end + 0.05);
        return { s, g, name, end };
      }
      return null;
    }
    function fadeOut(c, t) { try { c.g.gain.cancelScheduledValues(t); c.g.gain.setValueAtTime(c.g.gain.value, t); c.g.gain.linearRampToValueAtTime(0, t + 2); c.s.stop(t + 2.1); } catch (e) { /* still */ } }
    return {
      tick(md, on) {
        const t = ctx.currentTime;
        if (md !== mood && MOOD[md]) {
          mood = md;
          lp.frequency.setTargetAtTime(MOOD[md].lp, t, 2);
          mg.gain.setTargetAtTime(MOOD[md].g, t, 2);
        }
        if (!on) { if (cur) { fadeOut(cur, t); cur = null; } return; }
        if (!cur || t > cur.end - FADE) { const n = startTrack(Math.max(t, cur ? cur.end - FADE : t) + 0.05); if (n) cur = n; else if (cur && t > cur.end) cur = null; }
      },
      stop() { if (cur) fadeOut(cur, ctx.currentTime); cur = null; },
      current() { return cur ? cur.name : null; }
    };
  }

  WW.AudioMusic = { Player, TRACKS };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
