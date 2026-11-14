// =============================================================================
// Wuselwelt – Ton, Klangbank: lädt die Aufnahmen aus audio/ (CC0, Quellen in audio/QUELLEN.md) träge im
// Hintergrund und dekodiert sie einmal (Puffer werden wiederverwendet). Solange ein Klang lädt, bleibt er stumm.
// Quellen der Daten, in dieser Reihenfolge:
//   1. WW.AudioData[name] (Data-URI, MP3; von tools/audio-pack.js erzeugt, für die Einzeldatei/Artifact)
//   2. fetch(base + name + '.ogg' | '.mp3')  (Format je Browser: OGG Vorbis wenn sicher abspielbar, sonst MP3)
//   3. scheitert fetch (z. B. file:// in Chromium): js/audio/audio-data.js wird nachgeladen und Schritt 1 versucht
// Liste und Eckdaten: WW.AudioManifest (js/audio/audio-manifest.js)
// =============================================================================
(function (WW) { 'use strict';

  const buffers = {};      // name -> AudioBuffer
  const loops = {};        // name -> { start, end } (Schleifenbereich ohne Kodier-Stille)
  const state = { started: false, loaded: 0, failed: 0, total: 0, errors: [], format: null, source: null };
  let base = 'audio/';
  let dataScript = 'js/audio/audio-data.js';
  let dataPromise = null;

  function manifest() { return WW.AudioManifest || {}; }

  function pickFormat() {
    try {
      const a = document.createElement('audio');
      // Safari meldet OGG teils „maybe“ und scheitert dann; nur „probably“ zählt
      if (a.canPlayType && a.canPlayType('audio/ogg; codecs="vorbis"') === 'probably' && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) return 'ogg';
    } catch (e) { /* still */ }
    return 'mp3';
  }

  function b64ToBuf(uri) {
    const i = uri.indexOf(',');
    const s = atob(uri.slice(i + 1));
    const u = new Uint8Array(s.length);
    for (let k = 0; k < s.length; k++) u[k] = s.charCodeAt(k);
    return u.buffer;
  }

  function decode(ctx, ab) {
    return new Promise((res, rej) => {
      let done = false;
      try {
        const p = ctx.decodeAudioData(ab, (b) => { if (!done) { done = true; res(b); } }, (e) => { if (!done) { done = true; rej(e || new Error('decode')); } });
        if (p && p.then) p.then((b) => { if (!done) { done = true; res(b); } }, (e) => { if (!done) { done = true; rej(e); } });
      } catch (e) { rej(e); }
    });
  }

  function loadDataScript() {
    if (WW.AudioData) return Promise.resolve(true);
    if (dataPromise) return dataPromise;
    dataPromise = new Promise((res) => {
      try {
        const s = document.createElement('script');
        s.src = dataScript; s.async = true;
        s.onload = () => res(!!WW.AudioData); s.onerror = () => res(false);
        document.head.appendChild(s);
      } catch (e) { res(false); }
    });
    return dataPromise;
  }

  async function fetchBuf(name) {
    if (WW.AudioData && WW.AudioData[name]) { state.source = 'eingebettet'; state.format = 'mp3'; return b64ToBuf(WW.AudioData[name]); }
    // file:// erlaubt kein fetch: gleich die eingebetteten Daten nachladen
    if (typeof location !== 'undefined' && location.protocol === 'file:' && await loadDataScript() && WW.AudioData[name]) { state.source = 'eingebettet'; state.format = 'mp3'; return b64ToBuf(WW.AudioData[name]); }
    try {
      const r = await fetch(base + name + '.' + state.format);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      state.source = 'Dateien';
      return await r.arrayBuffer();
    } catch (e) {
      if (await loadDataScript() && WW.AudioData[name]) { state.source = 'eingebettet'; state.format = 'mp3'; return b64ToBuf(WW.AudioData[name]); }
      throw e;
    }
  }

  // Schleifenbereich: führende/folgende Stille (MP3-Kodierverzögerung) überspringen
  function loopRange(b) {
    const d = b.getChannelData(0), n = d.length;
    let s = 0, e = n - 1;
    while (s < Math.min(n, 4096) && Math.abs(d[s]) < 2e-4) s++;
    while (e > n - 4096 && e > s && Math.abs(d[e]) < 2e-4) e--;
    return { start: s / b.sampleRate, end: (e + 1) / b.sampleRate };
  }

  async function loadOne(ctx, name) {
    try {
      const ab = await fetchBuf(name);
      const b = await decode(ctx, ab);
      buffers[name] = b;
      const m = manifest()[name];
      if (m && (m.kind === 'loop')) loops[name] = loopRange(b);
      state.loaded++;
    } catch (e) {
      state.failed++;
      if (state.errors.length < 10) state.errors.push(name + ': ' + (e && e.message || e));
    }
  }

  // Ladereihenfolge: Umgebung, wichtige Effekte, Rest, Musik zuletzt; höchstens 3 gleichzeitig
  const FIRST = ['amb_wind', 'amb_birds', 'amb_surf', 'amb_river', 'amb_town', 'amb_rain', 'amb_fire', 'amb_night', 'expl_s', 'expl_m', 'expl_l',
    'thunder1', 'arrow', 'sword1', 'collapse', 'cannon', 'mg', 'build', 'sheep', 'bells', 'drums_war'];
  function start(ctx, opts) {
    if (state.started || !ctx) return;
    state.started = true;
    opts = opts || {};
    if (opts.base) base = opts.base;
    if (opts.dataScript) dataScript = opts.dataScript;
    state.format = opts.format || (WW.AudioData ? 'mp3' : pickFormat());
    const all = Object.keys(manifest());
    const order = FIRST.filter((n) => all.indexOf(n) >= 0);
    for (const n of all) if (order.indexOf(n) < 0 && manifest()[n].kind !== 'music') order.push(n);
    for (const n of all) if (order.indexOf(n) < 0) order.push(n);
    state.total = order.length;
    let i = 0;
    const worker = async () => { while (i < order.length) { const n = order[i++]; await loadOne(ctx, n); } };
    for (let k = 0; k < 3; k++) worker();
  }

  WW.AudioBank = {
    start,
    get: (n) => buffers[n] || null,
    loop: (n) => loops[n] || null,
    has: (n) => !!buffers[n],
    setBase: (b, d) => { base = b; if (d) dataScript = d; },
    state: () => Object.assign({}, state, { errors: state.errors.slice() })
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
