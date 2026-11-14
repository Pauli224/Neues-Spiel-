// =============================================================================
// Wuselwelt – Ton, Umgebung: Dauerschleifen aus Aufnahmen (Wind, Brandung, Fluss, Waldvögel, Grillen, Regen,
// Feuer, Stadt, Schmiede, Fabrik, Schlacht), Auswertung der Lage um die Bildmitte und Planung der
// Einzelklänge (Möwen, Krähen, Hämmern, Holzhacken, Schwertklirren, Tierrufe).
// WW.AudioAmbient.analyze(state, cam) -> mix; Beds(ctx, bus) -> { set(mix, t), stop() }
// =============================================================================
(function (WW) { 'use strict';

  const C = WW.AudioCore;
  const clamp = C.clamp;

  // ---------------------------------------------------------------------------
  // Gelände-Klassen (aus WW.TERRAIN, nicht hart kodiert, falls IDs fehlen)
  // ---------------------------------------------------------------------------
  let CLS = null;
  function classes() {
    if (CLS) return CLS;
    const map = { deep: 'sea', water: 'sea', shallow: 'sea', river: 'river', forest: 'forest', taiga: 'taiga', jungle: 'jungle',
      mushroom: 'forest', grass: 'open', flowers: 'open', hill: 'open', savanna: 'dry', desert: 'dry', swamp: 'swamp',
      mountain: 'cold', snow: 'cold', snowfield: 'cold', tundra: 'cold', lava: 'hot', ash: 'hot', crystal: 'open', sand: 'beach' };
    const n = (WW.TERRAIN && WW.TERRAIN.length) || 22;
    CLS = new Array(n).fill('open');
    if (WW.TERRAIN) for (const d of WW.TERRAIN) CLS[d.id] = map[d.key] || 'open';
    return CLS;
  }

  // Rufe je Tierart: [Klang, Rate je Tier und Sekunde, Tonhöhe]; fehlt die Art, bleibt sie stumm (z. B. Huhn: keine CC0-Aufnahme)
  const CALLS = { sheep: ['sheep', 0.03], cow: ['cow', 0.02], wolf: ['wolf', 0.012], bear: ['bear', 0.012],
    dragon: ['dragon', 0.03], zombie: ['snarl', 0.03, 0.8], demon: ['monster', 0.03, 0.9], yeti: ['monster', 0.025, 1.15],
    sandworm: ['monster', 0.02, 0.7], golem: ['monster', 0.015, 0.6], treant: ['snarl', 0.015, 0.6], ghost: ['snarl', 0.02, 1.4] };

  // ---------------------------------------------------------------------------
  // Lage um die Bildmitte. cam = { x, y, dist } (Kacheln; dist = halbe Sichtbreite in Kacheln)
  // extra = { rainSpots: [{x,y,until}], now } (von audio.js)
  // ---------------------------------------------------------------------------
  function analyze(st, cam, extra) {
    const m = { near: 0, far: 1, sea: 0, coast: 0, river: 0, forest: 0, taiga: 0, jungle: 0, open: 0, dry: 0, swamp: 0, cold: 0, hot: 0,
      fire: 0, city: 0, sites: 0, factory: 0, battle: 0, battleNear: 0, battleLp: 800, rain: 0, war: false, windStr: 0.8,
      calls: [], effects: [], aircraft: [], pop: 0 };
    if (!st || !st.terrain || !cam) return m;
    const W = st.W, H = st.H, cx = C.fin(cam.x, W / 2), cy = C.fin(cam.y, H / 2), D = clamp(C.fin(cam.dist, 20), 3, 400);
    m.near = clamp((70 - D) / 55, 0, 1); m.far = 1 - m.near;
    const R = clamp(D * 1.1, 8, 70);
    const cls = classes(), ter = st.terrain;
    // Gelände: 13×13 Stichproben, zur Mitte gewichtet
    const N = 13, acc = {};
    let wsum = 0, coastW = 0, landW = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const ox = (i / (N - 1) * 2 - 1) * R, oy = (j / (N - 1) * 2 - 1) * R;
      const x = Math.floor(cx + ox), y = Math.floor(cy + oy);
      const d = Math.sqrt(ox * ox + oy * oy) / R;
      const w = 1 / (1 + 4 * d * d);
      wsum += w;
      if (x < 0 || y < 0 || x >= W || y >= H) { acc.sea = (acc.sea || 0) + w * 0.5; continue; }
      const k = cls[ter[y * W + x]] || 'open';
      acc[k] = (acc[k] || 0) + w;
      if (k !== 'sea') {
        landW += w;
        const st2 = Math.max(1, Math.round(R / 20));
        for (const [dx, dy] of [[st2, 0], [-st2, 0], [0, st2], [0, -st2]]) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && cls[ter[yy * W + xx]] === 'sea') { coastW += w; break; }
        }
      }
    }
    for (const k in acc) if (k in m) m[k] = acc[k] / wsum;
    m.beach = (acc.beach || 0) / wsum;
    m.coast = clamp(Math.max(coastW / wsum * 2.5, Math.min(m.sea, landW / wsum) * 1.2, m.beach * 2), 0, 1);
    // Feuer: grobes Raster im Umkreis
    if (st.fire) {
      const step = Math.max(1, Math.floor(R / 25));
      let n = 0;
      const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(W - 1, Math.floor(cx + R));
      const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(H - 1, Math.floor(cy + R));
      for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) if (st.fire[y * W + x] > 0) n += step * step;
      m.fire = clamp(n / (25 + R), 0, 1);
    }
    // Städte und Baustellen
    if (Array.isArray(st.cities)) for (const c of st.cities) {
      if (!c || c.dead) continue;
      const dx = c.cx - cx, dy = c.cy - cy, d = Math.sqrt(dx * dx + dy * dy);
      const w = clamp(1 - d / (R * 0.9 + 8), 0, 1);
      if (w <= 0) continue;
      m.city += w * clamp((c.pop || 0) / 45, 0.12, 1.6);
      m.pop += w * (c.pop || 0);
    }
    m.city = clamp(m.city, 0, 1.5);
    if (Array.isArray(st.structs)) for (const s of st.structs) {
      if (!s || s.dead) continue;
      const isF = s.type === 'factory' && s.active, isSite = !s.built || s.upgradeTo || s.upgrading || s.restyle;
      if (!isF && !isSite) continue;
      const dx = s.x - cx, dy = s.y - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > R + 4) continue;
      const w = 1 - d / (R + 4);
      if (isF) m.factory += w * (s.level >= 2 ? 0.6 : 0.4);
      else m.sites += w;
    }
    m.factory = clamp(m.factory, 0, 1); m.sites = clamp(m.sites / 6, 0, 1);
    // Krieg und Kampf
    if (Array.isArray(st.kingdoms)) for (const k of st.kingdoms) {
      if (!k || k.dead || !k.relations) continue;
      for (const id in k.relations) if (k.relations[id] && k.relations[id].status === 'war') { m.war = true; break; }
      if (m.war) break;
    }
    if (Array.isArray(st.units)) {
      let s = 0, sn = 0, dsum = 0;
      for (const u of st.units) {
        if (!u || u.dead) continue;
        const fighting = (u.foe != null && u.foe >= 0) || u.role === 'ram' || u.role === 'catapult' || u.role === 'bandit' && u.task === 'raid';
        if (!fighting) continue;
        const dx = u.x - cx, dy = u.y - cy, d = Math.sqrt(dx * dx + dy * dy);
        if (d > R * 3 + 20) continue;
        const w = 1 / (1 + (d / R) * (d / R) * 2);
        s += w; dsum += w * d;
        if (d < D * 0.9) sn++;
      }
      m.battle = clamp(s / 14, 0, 1); m.battleNear = clamp(sn / 8, 0, 1);
      const md = s > 0 ? dsum / s : R * 3;
      m.battleLp = 500 + 3500 * clamp(1 - md / (R * 2.5), 0, 1);
    }
    // Regen: Dauerkräfte und kürzliche Regengüsse
    const eff = st.wild && Array.isArray(st.wild.effects) ? st.wild.effects : [];
    for (const e of eff) {
      if (!e) continue;
      const dx = e.x - cx, dy = e.y - cy, d = Math.sqrt(dx * dx + dy * dy);
      if ((e.type === 'acidrain' || e.type === 'flood') && d < R + (e.r || 5)) m.rain = Math.max(m.rain, clamp(1 - d / (R + (e.r || 5)), 0.2, 1) * (e.type === 'acidrain' ? 1 : 0.6));
      m.effects.push(e);
    }
    if (extra && extra.rainSpots) for (const r of extra.rainSpots) {
      const dx = r.x - cx, dy = r.y - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < R + 6) m.rain = Math.max(m.rain, clamp(1 - d / (R + 6), 0.2, 1) * clamp((r.until - extra.now) / 3, 0, 1));
    }
    if (st.wind && isFinite(st.wind.str)) m.windStr = clamp(st.wind.str, 0, 1.5);
    // Tiere und Monster in Rufweite
    if (Array.isArray(st.animals)) {
      const RC = Math.min(D * 1.2, 40) + 4;
      for (const a of st.animals) {
        if (!a || a.dead || a.buried || !CALLS[a.kind]) continue;
        const dx = a.x - cx, dy = a.y - cy;
        if (dx * dx + dy * dy > RC * RC && !(a.kind === 'dragon' && a.state)) continue;
        m.calls.push(a);
      }
    }
    if (Array.isArray(st.aircraft)) m.aircraft = st.aircraft;
    return m;
  }

  // ---------------------------------------------------------------------------
  // Dauerschichten: Schleifen aus Aufnahmen (WW.AudioBank), weich überblendet, ruhen bei 0
  // ---------------------------------------------------------------------------
  // Schicht -> Aufnahme, Grundpegel (Aufnahmen sind auf −24 LUFS angeglichen), Tiefpass
  const BEDS = {
    wind: { file: 'amb_wind', level: 0.55 },
    sea: { file: 'amb_surf', level: 0.8 },
    river: { file: 'amb_river', level: 0.6 },
    birds: { file: 'amb_birds', level: 0.55 },
    night: { file: 'amb_night', level: 0.4 },
    rain: { file: 'amb_rain', level: 0.7 },
    fire: { file: 'amb_fire', level: 0.7 },
    city: { file: 'amb_town', level: 0.35, lp: 1400 },
    forge: { file: 'amb_forge', level: 0.45 },
    factory: { file: 'amb_factory', level: 0.35 },
    battle: { file: 'amb_battle', level: 0.6 },
    rumble: { file: 'amb_fire', level: 0.5, rate: 0.55, lp: 400 }
  };
  const BED_LEVEL = {};
  for (const k in BEDS) BED_LEVEL[k] = BEDS[k].level;

  // Zielpegel der Schichten (0..1) aus der Lage
  function targets(m) {
    const n = m.near, f = m.far;
    const woods = m.forest + m.taiga * 0.8 + m.jungle;
    return {
      wind: clamp(0.25 + 0.4 * f + 0.45 * m.cold + 0.1 * m.sea + 0.1 * m.windStr * f, 0, 1),
      sea: clamp(m.sea * 0.45 * (0.5 + 0.5 * f) + m.coast * 0.8, 0, 1),
      river: clamp(m.river * 4 * (0.3 + 0.7 * n), 0, 0.9),
      birds: clamp((woods * 1.3 + m.open * 0.25) * (0.15 + 0.85 * n), 0, 1),
      night: clamp((m.dry * 1.1 + m.swamp * 0.8 + m.open * 0.15) * (0.2 + 0.8 * n), 0, 0.9),
      rain: clamp(m.rain, 0, 1),
      fire: clamp(m.fire * (0.5 + 0.5 * n) * 1.2, 0, 1),
      city: clamp(m.city * (0.2 + 0.8 * n) * 0.9, 0, 1),
      forge: clamp((m.sites * 0.9 + m.city * 0.2) * n, 0, 0.9),
      factory: clamp(m.factory * (0.4 + 0.6 * n), 0, 0.9),
      battle: clamp(m.battle * 0.9, 0, 1),
      rumble: clamp(m.hot * 1.5, 0, 0.8)
    };
  }

  function Beds(ctx, bus) {
    const live = {};
    function start(name, t) {
      const B = BEDS[name], buf = WW.AudioBank && WW.AudioBank.get(B.file);
      if (!buf) return null;
      const g = ctx.createGain(); g.gain.value = 0;
      let node = g;
      if (B.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = B.lp; g.connect(f); node = f; }
      node.connect(bus);
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const lr = WW.AudioBank.loop(B.file);
      if (lr) { s.loopStart = lr.start; s.loopEnd = lr.end; }
      if (B.rate) s.playbackRate.value = B.rate;
      s.connect(g);
      // zufälliger Einstieg, damit Schichten mit gleicher Datei nicht gleichzeitig „atmen“
      s.start(t, (lr ? lr.start : 0) + C.rnd() * buf.duration * 0.8);
      return { s, g, node, offT: 0 };
    }
    function stopBed(b) { try { b.s.stop(); } catch (e) { /* still */ } try { b.g.disconnect(); b.node.disconnect(); } catch (e) { /* still */ } }
    return {
      live,
      set(m, t) {
        const tg = targets(m);
        for (const name in BEDS) {
          const v = clamp(C.fin(tg[name], 0), 0, 1) * BEDS[name].level;
          let b = live[name];
          if (v > 0.004 && !b) { b = start(name, t); if (b) live[name] = b; }
          if (!b) continue;
          b.g.gain.setTargetAtTime(v, t, 1.5);
          if (v <= 0.004) { if (!b.offT) b.offT = t; else if (t - b.offT > 10) { stopBed(b); delete live[name]; } }
          else b.offT = 0;
        }
        return tg;
      },
      count() { return Object.keys(live).length; },
      stop() { for (const k in live) { stopBed(live[k]); delete live[k]; } }
    };
  }

  // ---------------------------------------------------------------------------
  // Einzelklänge der Umgebung planen (Aufnahmen): Liste { name, x, y, p } für dt Sekunden
  // ---------------------------------------------------------------------------
  function events(m, cam, dt) {
    const out = [];
    const n = m.near, cx = cam.x, cy = cam.y, D = clamp(C.fin(cam.dist, 20), 3, 400);
    function chance(rate) { return Math.random() < 1 - Math.exp(-rate * dt); }
    function add(name, rate, sp) { if (rate > 0 && chance(rate)) out.push({ name, x: cx + C.rr(-1, 1) * D * (sp || 0.8), y: cy + C.rr(-1, 1) * D * (sp || 0.6), amb: true }); }
    add('gull', m.coast * 0.06 * (0.4 + n));
    add('crow', (m.open * 0.3 + m.forest * 0.3 + m.cold * 0.2) * 0.03 * n);
    add('hammer', m.sites * 0.25 * n, 0.4);
    add('chop', (m.forest + m.taiga) * m.city * 0.15 * n, 0.5);
    add('sword', m.battleNear * 0.8 * n, 0.4);
    add('whistle', m.factory * 0.01 * n, 0.4);
    // Tierrufe
    for (const a of m.calls) {
      const c = CALLS[a.kind];
      if (!c) continue;
      let rate = c[1];
      if (a.kind === 'dragon' && a.state) rate *= 2;
      if ((a.foe != null && a.foe >= 0) || a.mad) rate *= 2;
      if (chance(rate)) out.push({ name: c[0], x: a.x, y: a.y, animal: true, rate: c[2] || 1 });
    }
    return out;
  }

  WW.AudioAmbient = { analyze, Beds, targets, events, BEDS, BED_LEVEL, CALLS };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
