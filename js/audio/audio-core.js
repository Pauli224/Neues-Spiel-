// =============================================================================
// Wuselwelt – Ton, Kern: Rauschpuffer, Hall (erzeugte Impulsantwort), Ausgangskette mit Kompressor und
// Begrenzer, Bausteine für Klangrezepte (Hüllkurven, Filter, Oszillatoren). Keine Audiodateien.
// Funktioniert mit AudioContext und OfflineAudioContext (Prüfung in tools/audio-preview.html).
// Ladereihenfolge: audio-core.js, audio-sfx.js, audio-ambient.js, audio-music.js, audio.js
// =============================================================================
(function (WW) { 'use strict';

  // ---------------------------------------------------------------------------
  // Zufall (Ton darf Math.random nutzen; für Messungen per Seed reproduzierbar)
  // ---------------------------------------------------------------------------
  let seed = 0;
  function rnd() {
    if (!seed) return Math.random();
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function setSeed(s) { seed = s | 0; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function pick(a) { return a[Math.floor(rnd() * a.length) % a.length]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function fin(v, d) { return (typeof v === 'number' && isFinite(v)) ? v : d; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // ---------------------------------------------------------------------------
  // Rauschpuffer je Kontext (weiß, rosa, braun; mono und stereo)
  // ---------------------------------------------------------------------------
  const CACHE = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function cache(ctx) {
    let c = CACHE && CACHE.get(ctx);
    if (!c) { c = {}; if (CACHE) CACHE.set(ctx, c); }
    return c;
  }
  function fillNoise(d, kind) {
    const n = d.length;
    if (kind === 'white') { for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return; }
    if (kind === 'pink') {   // Paul-Kellet-Filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856; b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
      return;
    }
    let last = 0;   // braun: integriertes Weiß
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
  }
  // nahtlose Schleife: Anfang und Ende überblenden
  function seamless(d, sr) {
    const n = d.length, f = Math.min(Math.floor(sr * 0.05), n >> 3);
    for (let i = 0; i < f; i++) {
      const a = i / f;
      d[i] = d[i] * a + d[n - f + i] * (1 - a);
    }
    return n - f;
  }
  function noiseBuffer(ctx, kind, stereo) {
    const c = cache(ctx), key = kind + (stereo ? '2' : '1');
    if (c[key]) return c[key];
    const sr = ctx.sampleRate, len = Math.floor(sr * 3);
    const tmp = [];
    const ch = stereo ? 2 : 1;
    let used = len;
    for (let k = 0; k < ch; k++) { const d = new Float32Array(len); fillNoise(d, kind); used = seamless(d, sr); tmp.push(d); }
    const buf = ctx.createBuffer(ch, used, sr);
    for (let k = 0; k < ch; k++) buf.getChannelData(k).set(tmp[k].subarray(0, used));
    c[key] = buf;
    return buf;
  }

  // Hall-Impulsantwort: frühe Reflexionen + abklingendes, dunkler werdendes Rauschen
  function impulse(ctx, secs, decay) {
    const c = cache(ctx), key = 'ir' + secs + '_' + decay;
    if (c[key]) return c[key];
    const sr = ctx.sampleRate, n = Math.floor(sr * secs);
    const buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const k = 0.65 - 0.6 * t;             // Tiefpass wird mit der Zeit dunkler
        lp += k * ((Math.random() * 2 - 1) - lp);
        d[i] = lp * Math.pow(1 - t, decay) * (t < 0.003 ? t / 0.003 : 1);
      }
      for (let r = 0; r < 7; r++) {           // frühe Reflexionen
        const at = Math.floor(sr * (0.007 + r * 0.011 + Math.random() * 0.006));
        if (at < n) d[at] += (Math.random() < 0.5 ? -1 : 1) * 0.5 * Math.pow(0.75, r);
      }
      // Energie auf 1 normieren: Rauschen kommt mit gleichem Effektivwert zurück
      let e = 0;
      for (let i = 0; i < n; i++) e += d[i] * d[i];
      const s = 1 / Math.sqrt(e || 1);
      for (let i = 0; i < n; i++) d[i] *= s;
    }
    c[key] = buf;
    return buf;
  }

  // Weiche Begrenzung: tanh, Spitze 0.95
  function clipCurve(ctx) {
    const c = cache(ctx);
    if (c.clip) return c.clip;
    const n = 2048, a = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; a[i] = 0.95 * Math.tanh(x * 1.25) / Math.tanh(1.25); }
    c.clip = a;
    return a;
  }
  function driveCurve(ctx, amt) {
    const c = cache(ctx), key = 'drv' + amt;
    if (c[key]) return c[key];
    const n = 1024, a = new Float32Array(n), k = amt;
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; a[i] = Math.tanh(x * k) / Math.tanh(k); }
    c[key] = a;
    return a;
  }

  // ---------------------------------------------------------------------------
  // Ausgangskette: Busse -> Master -> Kompressor -> weiche Begrenzung -> Ziel
  //   out = { master, comp, music, ambient, effects, ui, reverbIn, dest }
  // ---------------------------------------------------------------------------
  function makeOutput(ctx, dest) {
    dest = dest || ctx.destination;
    const master = ctx.createGain(); master.gain.value = 0.8;
    const pre = ctx.createGain(); pre.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.3;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.15;
    const clip = ctx.createWaveShaper(); clip.curve = clipCurve(ctx); clip.oversample = '2x';
    pre.connect(master); master.connect(comp); comp.connect(lim); lim.connect(clip); clip.connect(dest);
    const conv = ctx.createConvolver(); conv.normalize = false; conv.buffer = impulse(ctx, 2.6, 2.6);
    const reverbIn = ctx.createGain(); reverbIn.gain.value = 1;
    const rvHp = ctx.createBiquadFilter(); rvHp.type = 'highpass'; rvHp.frequency.value = 160;
    const reverbOut = ctx.createGain(); reverbOut.gain.value = 0.55;
    reverbIn.connect(rvHp); rvHp.connect(conv); conv.connect(reverbOut); reverbOut.connect(pre);
    function bus(v, send) {
      const g = ctx.createGain(); g.gain.value = v; g.connect(pre);
      if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(reverbIn); g._send = s; }
      return g;
    }
    const music = bus(0.35, 0.55), ambient = bus(0.7, 0.12), effects = bus(0.8, 0.14);
    const ui = ctx.createGain(); ui.gain.value = 0.9; ui.connect(effects);
    return { ctx, master, pre, comp, lim, music, ambient, effects, ui, reverbIn, dest };
  }

  // ---------------------------------------------------------------------------
  // Bausteine für Rezepte. R = makeR(ctx, voice): alle Quellen landen in voice.srcs (zum Abbrechen).
  // ---------------------------------------------------------------------------
  function makeR(ctx, voice) {
    voice = voice || { srcs: [] };
    const R = {
      ctx, voice, rnd, rr, pick, clamp, mtof,
      g(v) { const g = ctx.createGain(); g.gain.value = v == null ? 1 : v; return g; },
      f(type, freq, Q) {
        const b = ctx.createBiquadFilter(); b.type = type;
        b.frequency.value = clamp(fin(freq, 1000), 10, ctx.sampleRate * 0.45); if (Q != null) b.Q.value = Q; return b;
      },
      c() { for (let i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; },
      osc(type, freq, t0, t1) {
        const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = clamp(fin(freq, 440), 1, 20000);
        o.start(t0); if (t1 != null) o.stop(t1); voice.srcs.push(o); return o;
      },
      noise(kind, t0, t1, stereo, rate) {
        const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, kind || 'white', !!stereo); s.loop = true;
        if (rate) s.playbackRate.value = rate;
        s.start(t0, rnd() * (s.buffer.duration - 0.1)); if (t1 != null) s.stop(t1); voice.srcs.push(s); return s;
      },
      // Hüllkurve: linear auf peak in a, exponentiell auf -60 dB in d, dann linear auf 0. Rückgabe: Ende
      env(p, t, a, peak, d) {
        a = Math.max(0.002, a); d = Math.max(0.01, d); peak = Math.max(1e-4, peak);
        p.cancelScheduledValues(t); p.setValueAtTime(0, t);
        p.linearRampToValueAtTime(peak, t + a);
        p.exponentialRampToValueAtTime(peak * 0.001, t + a + d);
        p.linearRampToValueAtTime(0, t + a + d + 0.02);
        return t + a + d + 0.02;
      },
      // linear an, halten, exponentiell aus
      ahr(p, t, a, peak, h, r) {
        a = Math.max(0.003, a); r = Math.max(0.02, r); peak = Math.max(1e-4, peak);
        p.cancelScheduledValues(t); p.setValueAtTime(0, t);
        p.linearRampToValueAtTime(peak, t + a); p.setValueAtTime(peak, t + a + Math.max(0, h));
        p.exponentialRampToValueAtTime(peak * 0.001, t + a + h + r); p.linearRampToValueAtTime(0, t + a + h + r + 0.02);
        return t + a + h + r + 0.02;
      },
      // Punktfolge [[t, v], …] linear (erster Punkt setzt)
      pts(p, list) {
        p.cancelScheduledValues(list[0][0]); p.setValueAtTime(fin(list[0][1], 0), list[0][0]);
        for (let i = 1; i < list.length; i++) p.linearRampToValueAtTime(fin(list[i][1], 0), list[i][0]);
        return list[list.length - 1][0];
      },
      // exponentielle Punktfolge (Frequenzen, Werte > 0)
      xpts(p, list) {
        p.cancelScheduledValues(list[0][0]); p.setValueAtTime(Math.max(1e-3, list[0][1]), list[0][0]);
        for (let i = 1; i < list.length; i++) p.exponentialRampToValueAtTime(Math.max(1e-3, fin(list[i][1], 1)), list[i][0]);
        return list[list.length - 1][0];
      },
      drive(amt) { const w = ctx.createWaveShaper(); w.curve = driveCurve(ctx, amt || 2); return w; },
      pan(v) {
        if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(fin(v, 0), -1, 1); return p; }
        return ctx.createGain();
      },
      // LFO auf Parameter: osc -> gain(depth) -> param
      lfo(type, freq, depth, param, t0, t1) {
        const o = R.osc(type, freq, t0, t1); const g = R.g(depth); o.connect(g); g.connect(param); return { o, g };
      },
      // kurzer Rauschstoß mit Bandpass (Klicks, Tropfen, Knistern)
      tick(dest, t, freq, Q, peak, dec, kind) {
        const n = R.noise(kind || 'white', t, t + dec + 0.05);
        const bp = R.f('bandpass', freq, Q), g = R.g(0);
        R.c(n, bp, g, dest); R.env(g.gain, t, 0.001, peak, dec);
        return t + dec + 0.03;
      },
      // FM-Ton: Träger f, Modulator f*ratio, Index-Hüllkurve idx -> idx2
      fm(dest, t, f, ratio, idx, idx2, a, peak, d, ctype) {
        const car = R.osc(ctype || 'sine', f, t, t + a + d + 0.1);
        const mod = R.osc('sine', f * ratio, t, t + a + d + 0.1);
        const mg = R.g(0); mod.connect(mg); mg.connect(car.frequency);
        R.pts(mg.gain, [[t, f * idx], [t + a + d, f * (idx2 == null ? idx * 0.1 : idx2)]]);
        const g = R.g(0); car.connect(g); g.connect(dest);
        R.env(g.gain, t, a, peak, d);
        return { car, mod, g, end: t + a + d + 0.05 };
      }
    };
    return R;
  }

  // Quellen einer Stimme sauber beenden
  function stopVoice(ctx, v, fade) {
    const now = ctx.currentTime;
    fade = fade == null ? 0.05 : fade;
    try {
      if (v.out) { const g = v.out.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + fade); }
    } catch (e) { /* still */ }
    for (const s of v.srcs) { try { s.stop(now + fade + 0.02); } catch (e) { /* schon gestoppt */ } }
    v.end = Math.min(v.end || Infinity, now + fade + 0.05);
  }

  WW.AudioCore = { rnd, rr, pick, clamp, fin, mtof, setSeed, noiseBuffer, impulse, makeOutput, makeR, stopVoice };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
