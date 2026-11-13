// =============================================================================
// Wuselwelt – Ton, Umgebung: Dauerschichten (Wind, Meer, Fluss, Regen, Feuer, Stadt, Fabrik, Schlacht,
// Grollen, Schneewind), Auswertung der Lage um die Bildmitte und Planung der Einzelklänge (Vögel, Grillen,
// Frösche, Wellen, Hämmern, Knistern, Kampflärm, Tierrufe).
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

  const MONSTERS = { dragon: 1, zombie: 1, skeleton: 1, slime: 1, ghost: 1, demon: 1, giantchicken: 1, yeti: 1, sandworm: 1, treant: 1, golem: 1 };
  // Rufe je Tierart: Rezept, Rate je Tier und Sekunde
  const CALLS = { sheep: ['sheep', 0.035], cow: ['cow', 0.025], chicken: ['chicken', 0.05], wolf: ['wolf', 0.012], bear: ['bear', 0.015],
    dragon: ['dragon', 0.04], zombie: ['zombie', 0.05], skeleton: ['skeleton', 0.04], slime: ['slime', 0.04], ghost: ['ghost', 0.03],
    demon: ['demon', 0.04], giantchicken: ['giantchicken', 0.05], yeti: ['yeti', 0.03], sandworm: ['sandworm', 0.02], treant: ['treant', 0.02],
    golem: ['golem', 0.02] };

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
  // Dauerschichten
  // ---------------------------------------------------------------------------
  const BEDS = {
    wind(R, out, t) {
      const a = R.noise('brown', t, null, true), lp = R.f('lowpass', 380, 0.5), ag = R.g(0.9); R.c(a, lp, ag, out);
      const b = R.noise('pink', t, null, true), bp = R.f('bandpass', 600, 0.9), bg = R.g(0.35); R.c(b, bp, bg, out);
      return { bp, bg, lp };
    },
    howl(R, out, t) {
      const a = R.noise('white', t), bp = R.f('bandpass', 900, 9), ag = R.g(0.55); R.c(a, bp, ag, out); R.lfo('sine', 0.09, 250, bp.frequency, t);
      const b = R.noise('white', t), bp2 = R.f('bandpass', 1500, 12), bg = R.g(0.35); R.c(b, bp2, bg, out); R.lfo('sine', 0.13, 400, bp2.frequency, t);
      const am = R.lfo('sine', 0.21, 0.25, ag.gain, t);
      return { am };
    },
    sea(R, out, t) {
      const a = R.noise('pink', t, null, true), lp = R.f('lowpass', 520, 0.6), ag = R.g(0.8); R.c(a, lp, ag, out);
      R.lfo('sine', 0.08, 0.25, ag.gain, t);
      return {};
    },
    river(R, out, t) {
      const a = R.noise('white', t, null, true), bp = R.f('bandpass', 1700, 0.6), lp = R.f('lowpass', 4500, 0.7), ag = R.g(0.35); R.c(a, bp, lp, ag, out);
      R.lfo('sine', 0.7, 300, bp.frequency, t);
      const b = R.noise('pink', t, null, true), lp2 = R.f('lowpass', 700, 0.7), bg = R.g(0.4); R.c(b, lp2, bg, out);
      return {};
    },
    rain(R, out, t) {
      const a = R.noise('white', t, null, true), hp = R.f('highpass', 1400, 0.6), lp = R.f('lowpass', 9000, 0.6), ag = R.g(0.45); R.c(a, hp, lp, ag, out);
      const b = R.noise('pink', t, null, true), lp2 = R.f('lowpass', 900, 0.6), bg = R.g(0.35); R.c(b, lp2, bg, out);
      return {};
    },
    fire(R, out, t) {
      const a = R.noise('brown', t, null, true), lp = R.f('lowpass', 320, 0.7), ag = R.g(0.8); R.c(a, lp, ag, out);
      const b = R.noise('pink', t), bp = R.f('bandpass', 1300, 0.6), bg = R.g(0.3); R.c(b, bp, bg, out); R.lfo('sine', 3.3, 0.15, bg.gain, t);
      return {};
    },
    city(R, out, t) {
      const a = R.noise('pink', t, null, true), lp = R.f('lowpass', 2600, 0.6), sum = R.g(1); R.c(sum, lp, out);
      for (const [f, q, r, g0] of [[380, 3, 0.7, 0.9], [820, 3.5, 1.3, 0.7], [1500, 4, 2.1, 0.45], [2400, 5, 2.9, 0.2]]) {
        const bp = R.f('bandpass', f, q), g = R.g(g0); R.c(a, bp, g, sum); R.lfo('sine', r, g0 * 0.5, g.gain, t); R.lfo('sine', r * 0.37, f * 0.08, bp.frequency, t);
      }
      return {};
    },
    factory(R, out, t) {
      const lp = R.f('lowpass', 320, 2), am = R.g(0.7); R.c(lp, am, out);
      for (const f of [50, 100.4, 150.9]) { const o = R.osc('sawtooth', f, t); o.connect(lp); }
      R.lfo('square', 1.8, 0.2, am.gain, t);
      const n = R.noise('brown', t), lp2 = R.f('lowpass', 220, 1), ng = R.g(0.6); R.c(n, lp2, ng, out);
      return {};
    },
    battle(R, out, t) {
      const lp = R.f('lowpass', 800, 0.7); lp.connect(out);
      const a = R.noise('brown', t, null, true), ag = R.g(0.8); R.c(a, ag, lp);
      const b = R.noise('pink', t, null, true), bp = R.f('bandpass', 900, 0.8), bg = R.g(0.5); R.c(b, bp, bg, lp); R.lfo('sine', 0.45, 0.25, bg.gain, t);
      return { lp };
    },
    rumble(R, out, t) {
      const a = R.noise('brown', t, null, true), lp = R.f('lowpass', 95, 1), ag = R.g(1); R.c(a, lp, ag, out); R.lfo('sine', 0.3, 0.3, ag.gain, t);
      return {};
    }
  };
  const BED_LEVEL = { wind: 0.5, howl: 0.7, sea: 0.45, river: 0.55, rain: 0.45, fire: 0.5, city: 1.0, factory: 0.14, battle: 0.45, rumble: 0.5 };

  // Zielpegel der Schichten aus der Lage
  function targets(m) {
    const n = m.near, f = m.far;
    return {
      wind: clamp(0.15 + 0.35 * f + 0.35 * m.cold + 0.12 * m.sea + 0.1 * m.windStr * f, 0, 0.85),
      howl: clamp(m.cold * (0.35 + 0.65 * f) * 1.2, 0, 0.8),
      sea: clamp(m.sea * 0.5 * (0.5 + 0.5 * f) + m.coast * 0.35, 0, 0.8),
      river: clamp(m.river * 4 * (0.3 + 0.7 * n), 0, 0.7),
      rain: clamp(m.rain, 0, 1),
      fire: clamp(m.fire * (0.5 + 0.5 * n) * 1.2, 0, 1),
      city: clamp(m.city * (0.25 + 0.75 * n) * 0.8, 0, 1),
      factory: clamp(m.factory * (0.4 + 0.6 * n), 0, 0.8),
      battle: clamp(m.battle * 0.9, 0, 1),
      rumble: clamp(m.hot * 1.5, 0, 0.8)
    };
  }

  // Schichten: starten bei Bedarf, ruhen bei 0 (sparsam), blenden weich (Zeitkonstante 1,2 s)
  function Beds(ctx, bus) {
    const live = {};
    function start(name, t) {
      const voice = { srcs: [] }, R = C.makeR(ctx, voice), g = ctx.createGain(); g.gain.value = 0; g.connect(bus);
      let ctl = {};
      try { ctl = BEDS[name](R, g, t) || {}; } catch (e) { /* still */ }
      return { voice, g, ctl, offT: 0 };
    }
    function stopBed(b) {
      for (const s of b.voice.srcs) { try { s.stop(); } catch (e) { /* still */ } }
      try { b.g.disconnect(); } catch (e) { /* still */ }
    }
    return {
      live,
      set(m, t) {
        const tg = targets(m);
        for (const name in BEDS) {
          const v = clamp(C.fin(tg[name], 0), 0, 1) * BED_LEVEL[name];
          let b = live[name];
          if (v > 0.003 && !b) b = live[name] = start(name, t);
          if (!b) continue;
          b.g.gain.setTargetAtTime(v, t, 1.2);
          if (v <= 0.003) { if (!b.offT) b.offT = t; else if (t - b.offT > 8) { stopBed(b); delete live[name]; } }
          else b.offT = 0;
          if (name === 'battle' && b.ctl.lp) b.ctl.lp.frequency.setTargetAtTime(clamp(m.battleLp, 200, 5000), t, 1);
          if (name === 'wind' && b.ctl.bp) {   // Böen
            b.ctl.bp.frequency.setTargetAtTime(C.rr(380, 900 + 500 * m.cold), t, 1.5);
            b.ctl.bg.gain.setTargetAtTime(C.rr(0.15, 0.6), t, 1.2);
          }
        }
        return tg;
      },
      count() { return Object.keys(live).length; },
      stop() { for (const k in live) { stopBed(live[k]); delete live[k]; } }
    };
  }

  // ---------------------------------------------------------------------------
  // Einzelklänge der Umgebung planen: liefert Liste { name, x, y, p } für dt Sekunden
  // ---------------------------------------------------------------------------
  function events(m, cam, dt, nextWave) {
    const out = [];
    const n = m.near, cx = cam.x, cy = cam.y, D = clamp(C.fin(cam.dist, 20), 3, 400);
    function chance(rate) { return Math.random() < 1 - Math.exp(-rate * dt); }
    function spot(sp) { return { x: cx + C.rr(-1, 1) * D * (sp || 0.8), y: cy + C.rr(-1, 1) * D * (sp || 0.6) }; }
    function add(name, rate, p, sp) { if (rate > 0 && chance(rate)) { const s = spot(sp); out.push({ name, x: s.x, y: s.y, p: p || {}, amb: true }); } }
    const woods = m.forest + m.taiga * 0.7 + m.jungle * 0.3;
    add('bird', woods * 1.4 * n + m.open * 0.25 * n, { variant: Math.random() * 5 | 0 });
    add('woodpecker', (m.taiga + m.forest * 0.5) * 0.06 * n);
    add('jungleBird', m.jungle * 1.2 * n);
    add('gull', m.coast * 0.12 * (0.4 + n));
    add('cricket', (m.dry * 1.2 + m.open * 0.15) * n);
    add('frog', m.swamp * 2 * n + m.river * 0.6 * n);
    add('hammer', (m.city * 0.4 + m.sites * 1.5) * n, { metal: Math.random() < 0.35 }, 0.4);
    add('crackle', m.fire * 4 * (0.4 + 0.6 * n), { amp: m.fire * 1.5 }, 0.4);
    add('clank', m.factory * 0.6 * n, null, 0.4);
    add('clang', m.battleNear * 4 * n, null, 0.4);
    add('shout', m.battle * 0.5, null, 0.5);
    add('drum', (m.war ? 0.04 : 0) + m.battle * 0.12);
    add('boomFar', m.battle * 0.08 * (1 - m.battleNear));
    // Wellen: gleichmäßiger Takt
    let wave = null;
    if (m.coast > 0.04 && cam.now >= nextWave) wave = { name: 'wave', x: cx + C.rr(-0.6, 0.6) * D, y: cy, p: { amp: clamp(m.coast * 1.6, 0.3, 1.3) }, amb: true, wave: true };
    if (wave) out.push(wave);
    // Tierrufe
    for (const a of m.calls) {
      const c = CALLS[a.kind];
      let rate = c[1];
      if (a.kind === 'dragon' && a.state) rate *= 2;
      if (a.kind === 'wolf' || a.kind === 'bear' || MONSTERS[a.kind]) rate *= (a.foe != null && a.foe >= 0) || a.mad ? 2 : 1;
      if (chance(rate)) out.push({ name: c[0], x: a.x, y: a.y, p: {}, animal: true });
    }
    return out;
  }

  WW.AudioAmbient = { analyze, Beds, targets, events, BEDS, BED_LEVEL, MONSTERS, CALLS };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
