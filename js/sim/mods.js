// =============================================================================
// Wuselwelt – Modifikatoren (Ereignisse, Reichsgesetze). DOM-frei, deterministisch.
//   Zustand: kingdom.mods / city.mods = [{ key, add?, mul?, flag?, until (Tick, 0 = dauerhaft), source, name? }]
//   WW.Mods.add(target, mod)                 Mod anhängen (gleiche source + key ersetzt den alten Eintrag)
//   WW.Mods.remove(target, source)           alle Mods einer Quelle entfernen -> Anzahl
//   WW.Mods.value(sim, kingdom, city, key, base) -> (base + Σadd) × Πmul über aktive Mods von Reich und Stadt
//   WW.Mods.flag(sim, kingdom, key)          Schalter (z. B. 'nature' -> 'care'|'use'|'exploit'), zuletzt gesetzter gewinnt
//   WW.Mods.tick(sim)                        Abgelaufenes entfernen (sim.js ruft es alle 10 Ticks)
//   WW.Mods.list(target, sim)                Anzeige: [{ source, name, effectText, until, yearsLeft, keys }]
// Schnell: je Ziel ein Laufzeit-Cache (_modc, nicht gespeichert) pro Schlüssel, verworfen bei Änderung/Ablauf.
// =============================================================================
(function (WW) { 'use strict';

  // Anzeigenamen der Schlüssel
  const KEY_NAMES = {
    happiness: 'Zufriedenheit', work: 'Arbeitstempo', build: 'Bautempo', wallSpeed: 'Mauerbau', food: 'Nahrungsertrag',
    wood: 'Holzertrag', stone: 'Steinertrag', gold: 'Goldeinkommen', growth: 'Wachstum', soldiers: 'Soldatenanteil',
    strength: 'Kampfkraft', aggression: 'Kriegslust', loyalty: 'Loyalität', taxes: 'Steuern', immigration: 'Zuzug',
    nature: 'Umgang mit der Natur'
  };
  const NATURE_NAMES = { care: 'Natur wird geschont', use: 'Natur wird genutzt', exploit: 'Kahlschlag erlaubt' };
  // additive Schlüssel mit kleinen Basiswerten (Anteile) -> Prozentpunkte anzeigen
  const SHARE = { soldiers: 1, taxes: 1, aggression: 1 };

  function fmtNum(v) { const r = Math.round(v * 10) / 10; return (r > 0 ? '+' : (r < 0 ? '−' : '±')) + String(Math.abs(r)).replace('.', ','); }
  // „Zufriedenheit +8“, „Holzertrag −30 %“
  function describe(m) {
    const name = KEY_NAMES[m.key] || m.key;
    if (m.flag != null) return NATURE_NAMES[m.flag] && m.key === 'nature' ? NATURE_NAMES[m.flag] : name + ': ' + m.flag;
    const parts = [];
    if (m.add) parts.push(SHARE[m.key] ? fmtNum(m.add * 100) + ' Pkt.' : fmtNum(m.add));
    if (m.mul != null && m.mul !== 1) parts.push(fmtNum((m.mul - 1) * 100) + ' %');
    return name + ' ' + (parts.join(', ') || '±0');
  }

  function ensure(target) {
    if (!target) return null;
    if (!Array.isArray(target.mods)) target.mods = [];
    return target.mods;
  }
  function invalidate(target) { if (target) target._modc = null; }

  function add(target, mod) {
    const list = ensure(target);
    if (!list || !mod || typeof mod.key !== 'string') return null;
    const m = { key: mod.key, until: mod.until > 0 ? Math.floor(mod.until) : 0, source: String(mod.source || 'misc') };
    if (typeof mod.add === 'number' && isFinite(mod.add) && mod.add !== 0) m.add = mod.add;
    if (typeof mod.mul === 'number' && isFinite(mod.mul) && mod.mul !== 1) m.mul = Math.max(0, mod.mul);
    if (mod.flag != null) m.flag = String(mod.flag);
    if (mod.name) m.name = String(mod.name);
    for (let i = list.length - 1; i >= 0; i--) if (list[i].source === m.source && list[i].key === m.key) list.splice(i, 1);
    list.push(m);
    if (list.length > 60) list.splice(0, list.length - 60);   // Notbremse
    invalidate(target);
    return m;
  }

  function remove(target, source) {
    if (!target || !Array.isArray(target.mods)) return 0;
    const before = target.mods.length;
    target.mods = target.mods.filter(m => m.source !== source);
    if (target.mods.length !== before) invalidate(target);
    return before - target.mods.length;
  }

  // Cache aufbauen: { exp (kleinstes until), v: { key: { add, mul, flag } } }
  function cacheOf(target, tick) {
    let c = target._modc;
    if (c && (c.exp === 0 || tick < c.exp)) return c;
    const list = target.mods;
    c = { exp: 0, v: {} };
    if (list) {
      for (const m of list) {
        if (m.until > 0 && m.until <= tick) continue;
        if (m.until > 0 && (c.exp === 0 || m.until < c.exp)) c.exp = m.until;
        let e = c.v[m.key];
        if (!e) e = c.v[m.key] = { add: 0, mul: 1, flag: undefined };
        if (m.add) e.add += m.add;
        if (m.mul != null) e.mul *= m.mul;
        if (m.flag != null) e.flag = m.flag;
      }
    }
    target._modc = c;
    return c;
  }

  function value(sim, kingdom, city, key, base) {
    const tick = sim ? sim.state.tick : 0;
    let a = 0, mu = 1;
    if (kingdom && kingdom.mods && kingdom.mods.length) { const e = cacheOf(kingdom, tick).v[key]; if (e) { a += e.add; mu *= e.mul; } }
    if (city && city.mods && city.mods.length) { const e = cacheOf(city, tick).v[key]; if (e) { a += e.add; mu *= e.mul; } }
    if (a === 0 && mu === 1) return base;
    return (base + a) * mu;
  }

  function flag(sim, kingdom, key) {
    if (!kingdom || !kingdom.mods || !kingdom.mods.length) return undefined;
    const e = cacheOf(kingdom, sim ? sim.state.tick : 0).v[key];
    return e ? e.flag : undefined;
  }

  function purge(target, tick) {
    const l = target.mods;
    if (!l || !l.length) return;
    let n = 0;
    for (let i = 0; i < l.length; i++) if (l[i].until > 0 && l[i].until <= tick) n++;
    if (n) { target.mods = l.filter(m => !(m.until > 0 && m.until <= tick)); invalidate(target); }
  }
  function tick(sim) {
    const st = sim.state, t = st.tick;
    for (const k of st.kingdoms) purge(k, t);
    for (const c of st.cities) purge(c, t);
  }

  // Für die Anzeige: je Quelle ein Eintrag
  function list(target, sim) {
    if (!target || !Array.isArray(target.mods)) return [];
    const tick = sim ? sim.state.tick : 0;
    const TPY = (WW.CONFIG && WW.CONFIG.TPY) || 240;
    const year = sim ? sim.state.year : 0;
    const by = new Map();
    for (const m of target.mods) {
      if (m.until > 0 && m.until <= tick) continue;
      let e = by.get(m.source);
      if (!e) { e = { source: m.source, name: m.name || sourceName(m.source), parts: [], keys: [], until: m.until }; by.set(m.source, e); }
      e.parts.push(describe(m)); e.keys.push(m.key);
      if (m.until === 0) e.until = 0; else if (e.until !== 0 && m.until > e.until) e.until = m.until;
    }
    const out = [];
    for (const e of by.values()) {
      const left = e.until > 0 ? (e.until - tick) / TPY : null;
      out.push({ source: e.source, key: e.keys[0], keys: e.keys, name: e.name, effectText: e.parts.join(', '),
        until: e.until > 0 ? year + left : null, yearsLeft: left, permanent: e.until === 0 });
    }
    return out;
  }
  function sourceName(src) {
    if (src.indexOf('law:') === 0) { const l = WW.REALM_LAW_MAP && WW.REALM_LAW_MAP[src.slice(4)]; return l ? l.name : 'Gesetz'; }
    if (src.indexOf('ev:') === 0) { const d = WW.Events && WW.Events.def(src.slice(3).split('#')[0]); return d && d.title ? d.title : 'Ereignis'; }
    return 'Wirkung';
  }

  WW.Mods = { add: add, remove: remove, value: value, flag: flag, tick: tick, list: list, describe: describe, KEY_NAMES: KEY_NAMES, fmtNum: fmtNum };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
