// Gotteskräfte datengetrieben: WW.POWERS[kind] = { key, name, radius, apply(sim, x, y, ctx) }.
// Spätere Stufen ergänzen nur Einträge. WW.Powers.strike prüft Eingaben und wirft nie.
(function (WW) { 'use strict';

  // Ruft fn(i, x, y, d2) für alle Kacheln im Kreis auf
  function forDisc(sim, x, y, r, fn) {
    const st = sim.state, W = st.W, H = st.H;
    const r2 = r * r;
    for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(H - 1, Math.floor(y + r)); yy++) {
      for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.floor(x + r)); xx++) {
        const dx = xx + 0.5 - x, dy = yy + 0.5 - y, d2 = dx * dx + dy * dy;
        if (d2 <= r2) fn(yy * W + xx, xx, yy, d2);
      }
    }
  }
  function unitsIn(sim, x, y, r, fn) {
    for (const u of sim.state.units) {
      if (u.dead) continue;
      const dx = u.x - x, dy = u.y - y;
      if (dx * dx + dy * dy <= r * r) fn(u);
    }
  }
  function animalsIn(sim, x, y, r, fn) {
    for (const a of sim.state.animals) {
      if (a.dead) continue;
      const dx = a.x - x, dy = a.y - y;
      if (dx * dx + dy * dy <= r * r) fn(a);
    }
  }
  function structsIn(sim, x, y, r) {
    const seen = new Set(), out = [];
    forDisc(sim, x, y, r, (i) => {
      const id = sim.state.structAt[i];
      if (id < 0 || seen.has(id)) return;
      seen.add(id);
      const s = sim._structs.get(id);
      if (s) out.push(s);
    });
    return out;
  }

  WW.POWERS = {
    lightning: {
      key: 'lightning', name: 'Blitz', radius: 1.5, event: 'godLightning',
      apply: function (sim, x, y) {
        sim.fx({ type: 'bolt', x: x, y: y });
        unitsIn(sim, x, y, 1.6, (u) => { u.hp -= 45; if (u.hp <= 0) WW.Units.kill(sim, u, 'lightning'); });
        animalsIn(sim, x, y, 1.6, (a) => WW.Creatures.hit(sim, a, 45, null));
        for (const s of structsIn(sim, x, y, 1.2)) if (s.type !== 'ruin') WW.Structs.damage(sim, s, 70, 'spark');
        WW.Env.ignite(sim, Math.floor(x), Math.floor(y), 16);
      }
    },
    fire: {
      key: 'fire', name: 'Feuer', radius: 1.5, event: 'godFire',
      apply: function (sim, x, y) {
        forDisc(sim, x, y, 1.6, (i, xx, yy) => WW.Env.ignite(sim, xx, yy, 18));
        sim.fx({ type: 'smoke', x: x, y: y });
      }
    },
    rain: {
      key: 'rain', name: 'Regen', radius: 5, event: 'godRain',
      apply: function (sim, x, y) {
        const st = sim.state;
        sim.fx({ type: 'rain', x: x, y: y, r: 5 });
        forDisc(sim, x, y, 5, (i) => { WW.Env.extinguish(sim, i); });
        // Wald wächst, Felder reifen ein Stück
        WW.Env.regrowAt(sim, x, y, 5, 0.35);
        for (const s of structsIn(sim, x, y, 5)) {
          if (s.type === 'field' && s.growth < 3) { s.growth++; s.gprog = 0; sim.markDirty(s.y * st.W + s.x); }
        }
      }
    },
    meteor: {
      key: 'meteor', name: 'Meteor', radius: 2.5, event: 'godMeteor',
      apply: function (sim, x, y) {
        const st = sim.state;
        sim.fx({ type: 'meteor', x: x, y: y });
        unitsIn(sim, x, y, 3, (u) => { u.hp -= 80; if (u.hp <= 0) WW.Units.kill(sim, u, 'meteor'); });
        animalsIn(sim, x, y, 3, (a) => WW.Creatures.hit(sim, a, 80, null));
        // Bauwerke im Kern zerstört (Mauern werden zur Bresche), am Rand beschädigt
        for (const s of structsIn(sim, x, y, 2.6)) {
          if (s.dead) continue;
          if (WW.Structs.isWallish(s) || s.type === 'center') { if (s.built) WW.Structs.destroy(sim, s); else s.progress = 0; }
          else WW.Structs.damage(sim, s, 9999, null);
        }
        forDisc(sim, x, y, 2.6, (i, xx, yy, d2) => {
          const t = st.terrain[i];
          if (WW.TERRAIN_LUT.water[t]) return;
          // Wald und Gras werden zu Asche-Krater
          const nt = WW.Walls.deforested(t);
          if (nt !== t) st.terrain[i] = nt;
          WW.Env.setMark(sim, i, d2 < 2.5 ? 190 : 150);
          if (d2 > 2 && sim.rng.chance(0.4)) WW.Env.ignite(sim, xx, yy, 12);
        });
        sim.terrainChanged();
      }
    },
    plague: {
      key: 'plague', name: 'Seuche', radius: 4, event: 'godPlague',
      apply: function (sim, x, y) {
        sim.fx({ type: 'plague', x: x, y: y, r: 4 });
        unitsIn(sim, x, y, 4, (u) => { if (sim.rng.chance(0.8)) u.sick = true; });
      }
    },
    bless: {
      key: 'bless', name: 'Segen', radius: 5, event: 'godBless',
      apply: function (sim, x, y) {
        const st = sim.state;
        sim.fx({ type: 'sparkle', x: x, y: y, r: 5 });
        unitsIn(sim, x, y, 5, (u) => { u.hp = u.maxHp; u.sick = false; WW.Units.bubble(u, 'heart', 40); });
        for (const s of structsIn(sim, x, y, 5)) {
          if (s.type === 'field') { s.growth = 3; s.gprog = 0; sim.markDirty(s.y * st.W + s.x); }
        }
        const seen = new Set();
        forDisc(sim, x, y, 5, (i) => {
          const cid = st.owner[i];
          if (cid < 0 || seen.has(cid)) return;
          seen.add(cid);
          const c = sim._cities.get(cid);
          if (c) { c.blessUntil = st.tick + WW.CONFIG.TPY * 2; c.happiness = Math.min(100, c.happiness + 15); }
        });
      }
    }
  };
  WW.POWER_KEYS = Object.keys(WW.POWERS);

  // Kraft auslösen. silent = keine Chronik (Zufallskatastrophen schreiben ihre eigene)
  function strike(sim, x, y, kind, silent) {
    const p = WW.POWERS[kind];
    if (!p) return false;
    if (!WW.SimUtil.isNum(x) || !WW.SimUtil.isNum(y)) return false;
    const st = sim.state;
    if (x < 0 || y < 0 || x >= st.W || y >= st.H) return false;
    p.apply(sim, x, y);
    if (!silent && p.event) {
      const i = Math.floor(y) * st.W + Math.floor(x);
      let c = sim._cities.get(st.owner[i]) || sim._cities.get(st.inRing[i]);
      // Chronik nur, wenn eine Stadt betroffen ist (sonst würde jeder Klick die Chronik fluten)
      if (c && (!c.lastGod || st.tick - c.lastGod > 60 || c.lastGodKind !== kind)) {
        c.lastGod = st.tick; c.lastGodKind = kind;
        sim.event(p.event, { city: c.name }, WW.Cities.atCity(c));
      }
    }
    return true;
  }

  WW.Powers = { strike: strike, forDisc: forDisc, structsIn: structsIn };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
