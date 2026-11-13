// =============================================================================
// Wuselwelt – Ereignis-Motor und Reichsgesetze. DOM-frei, deterministisch (nur sim.rng).
// Katalog: js/data/events.js (WW.EVENT_DEFS), Gesetze: js/core/config-events.js (WW.REALM_LAWS).
//
// ERGÄNZUNGEN DER SIM-SCHNITTSTELLE (nur hinzugefügt)
//   Zustand
//     state.evt = { queue: [{ key, at (Tick), k, c, o, vars }], cd: { key: Jahr }, year, count }   Folgeereignisse, Welt-Abklingzeit,
//                 Zähler der Ereignisse im laufenden Jahr (Deckel)
//     kingdom.laws     { [Gesetz]: Jahr des Beschlusses }       geltende Reichsgesetze (WW.REALM_LAWS); FEHLT, solange nie ein Gesetz galt
//                      (ebenso lawLocks, mods, evcd, city.mods) -> immer über WW.Events.hasLaw bzw. mit Schutz lesen
//     kingdom.lawLocks { [Gesetz]: true|false }                 vom Spieler gesetzt (fixiert; true = an, false = aus)
//     kingdom.lawGov   Regierung, unter der die Gesetze zuletzt geprüft wurden (Wechsel -> Unzulässiges fällt weg)
//     kingdom.mods / city.mods   Modifikatoren (js/sim/mods.js)
//     kingdom.evcd     { [Ereignis]: Jahr, ab dem es wieder darf }
//   Chronik-Eintrag (state.events[]) zusätzlich: group (Schlüssel aus WW.EVENT_GROUPS), effectText (kurz, deutsch, z. B.
//     „Zufriedenheit +8 für 5 Jahre, −12 Nahrung“), evKey (Ereignis-Schlüssel). type = 'ev_' + evKey bzw. 'law' / 'lawRepeal'.
//   Aktion sim.actions.setRealmLaw(kingdomId, key, bool, { lock = true }) -> bool   (fixiert; unzulässig für die Regierung -> false)
//          sim.actions.setRealmLawLocked(kingdomId, key, bool) -> bool             (Fixierung lösen/setzen)
//   Weltgesetz 'events' (WW.LAW_INFO, Standard an): aus = keine Ereignisse, keine Gesetzesbeschlüsse der Reiche.
//   WW.Events.fire(sim, key, { kingdomId, cityId, otherId, vars }) -> Chronik-Eintrag | null   (erzwingen, ohne Bedingung)
//   WW.Events.situation(sim, kingdom) -> Lage L { pop, happy, foodPer, wood, gold, atWar, threat, bare, crowded, hungry, revolt, … }
//   WW.Events.hasLaw(kingdom, key) -> bool (sicher, auch ohne kingdom.laws), WW.Events.lawsOf(kingdom) -> [Gesetz], WW.Events.def(key), WW.Events.DEFS, WW.EVENT_GROUPS
// =============================================================================
(function (WW) { 'use strict';

  const CHECK_EVERY = 24;      // Prüfabstand in Ticks (10× im Jahr)
  const BASE_CHANCE = 0.075;   // je Reich und Prüfung -> etwa alle 1,3 Jahre ein Ereignis
  const TPY = () => WW.CONFIG.TPY;

  let DEFS = [], MAP = {};
  function index() {
    DEFS = WW.EVENT_DEFS || [];
    MAP = {};
    for (const d of DEFS) MAP[d.key] = d;
  }
  function def(key) { if (DEFS !== WW.EVENT_DEFS) index(); return MAP[key] || null; }

  // ---------------------------------------------------------------------------
  // Zustand
  // ---------------------------------------------------------------------------
  function defaults(st) {
    if (!st.evt || typeof st.evt !== 'object') st.evt = {};
    const e = st.evt;
    e.queue = Array.isArray(e.queue) ? e.queue : [];
    e.cd = e.cd || {};
    e.year = e.year | 0; e.count = e.count | 0;
    // Reichs-/Stadtfelder (laws, lawLocks, mods, evcd) entstehen erst beim ersten Schreiben -> Spielstand formstabil
    if (st.laws && !('events' in st.laws) && WW.LAW_DEFAULTS && 'events' in WW.LAW_DEFAULTS) st.laws.events = WW.LAW_DEFAULTS.events;
  }
  function ensureK(k) {
    if (!k.laws || typeof k.laws !== 'object') k.laws = {};
    if (!k.lawLocks || typeof k.lawLocks !== 'object') k.lawLocks = {};
    if (!Array.isArray(k.mods)) k.mods = [];
    if (!k.evcd || typeof k.evcd !== 'object') k.evcd = {};
    if (k.lawGov == null) k.lawGov = k.gov;
  }
  const EMPTY = Object.freeze({});

  // ---------------------------------------------------------------------------
  // Lage eines Reichs (für Bedingungen und Gesetzeswünsche)
  // ---------------------------------------------------------------------------
  function capitalOf(sim, k) { return sim._cities.get(k.capitalId) || sim._cities.get(k.cityIds[0]) || null; }
  function situation(sim, k) {
    const st = sim.state;
    if (k._sit && k._sit.t === st.tick) return k._sit;
    const cap = capitalOf(sim, k);
    let pop = 0, happy = 0, hungry = false, revolt = false, markets = 0, crowded = false, sick = 0, walls = 0, shrines = 0;
    for (const id of k.cityIds) {
      const c = sim._cities.get(id); if (!c) continue;
      pop += c.pop; happy += c.happiness * Math.max(1, c.pop);
      if (c.hungry) hungry = true; if (c.revolt) revolt = true;
      markets += c.markets | 0; sick += c.sick | 0;
      if (c.pop > c.housing) crowded = true;
      if (c.wall && c.wall.level > 0) walls++;
    }
    let wpop = 0; for (const id of k.cityIds) { const c = sim._cities.get(id); if (c) wpop += Math.max(1, c.pop); }
    const sk = cap ? WW.Cities.stock(sim, cap) : { food: 0, wood: 0, stone: 0, gold: 0 };
    let atWar = false, threat = false, allies = 0, enemies = 0;
    for (const oid in k.relations) {
      const r = k.relations[oid];
      if (r.status === 'war') { atWar = true; enemies++; }
      if (r.status === 'alliance') allies++;
      if (r.opinion < -40) threat = true;
    }
    // kahle Umgebung: Anteil der Nicht-Wald-Kacheln (ohne Wasser) um die Hauptstadt
    let bare = 0;
    if (cap) {
      const W = st.W, H = st.H, LUT = WW.TERRAIN_LUT;
      let land = 0, wood = 0;
      for (let y = Math.max(0, cap.cy - 7); y <= Math.min(H - 1, cap.cy + 7); y++) for (let x = Math.max(0, cap.cx - 7); x <= Math.min(W - 1, cap.cx + 7); x++) {
        const t = st.terrain[y * W + x];
        if (LUT.water[t] || LUT.walk[t] <= 0) continue;
        land++; if (LUT.wood[t]) wood++;
      }
      bare = land ? 1 - Math.min(1, wood / (land * 0.35)) : 0;
    }
    const L = {
      t: st.tick, pop: pop, cities: k.cityIds.length, happy: wpop ? happy / wpop : 50, hungry: hungry, revolt: revolt,
      foodPer: sk.food / Math.max(1, cap ? (WW.GOVERNMENTS[k.gov].sharedStock ? pop : cap.pop) : 1),
      food: sk.food, wood: sk.wood, stone: sk.stone, gold: sk.gold, markets: markets, crowded: crowded, sick: sick,
      atWar: atWar, threat: threat || atWar, allies: allies, enemies: enemies, bare: bare, walls: walls,
      race: k.race, gov: k.gov, trait: k.leaderTrait, laws: k.laws || {}, year: st.year, age: st.year - (k.founded | 0),
      govYears: st.year - (k.govSince | 0), leader: k.leaderId >= 0
    };
    k._sit = L;   // Laufzeit ('_' wird nicht gespeichert)
    return L;
  }

  // ---------------------------------------------------------------------------
  // Reichsgesetze
  // ---------------------------------------------------------------------------
  function lawAllowed(k, key) { const l = WW.REALM_LAW_MAP[key]; return !!l && l.allowed.indexOf(k.gov) >= 0; }
  function lawsOf(k) { const out = []; for (const key in (k.laws || {})) if (WW.REALM_LAW_MAP[key]) out.push(WW.REALM_LAW_MAP[key]); return out; }
  function applyLawMods(k, key) {
    const l = WW.REALM_LAW_MAP[key];
    WW.Mods.remove(k, 'law:' + key);
    for (const e of l.effects) WW.Mods.add(k, Object.assign({}, e, { until: 0, source: 'law:' + key, name: l.name }));
  }
  // Gesetz an/aus; Rückgabe: Liste der Änderungen (für effectText) oder null
  function setLawRaw(sim, k, key, on) {
    ensureK(k);
    const l = WW.REALM_LAW_MAP[key];
    if (!l) return null;
    const out = [];
    if (on) {
      if (!lawAllowed(k, key)) return null;
      if (k.laws[key] != null) return out;
      if (l.opposes && k.laws[l.opposes] != null) {
        delete k.laws[l.opposes]; WW.Mods.remove(k, 'law:' + l.opposes);
        out.push(WW.REALM_LAW_MAP[l.opposes].name + ' abgeschafft');
      }
      k.laws[key] = sim.state.year;
      applyLawMods(k, key);
      out.unshift(l.name + ' in Kraft');
    } else {
      if (k.laws[key] == null) return out;
      delete k.laws[key];
      WW.Mods.remove(k, 'law:' + key);
      out.push(l.name + ' abgeschafft');
    }
    return out;
  }
  function setRealmLaw(sim, kid, key, value, o) {
    const k = sim._kingdoms.get(kid);
    if (!k || !WW.REALM_LAW_MAP[key]) return false;
    ensureK(k);
    const on = !!value;
    if (on && !lawAllowed(k, key)) return false;
    const res = setLawRaw(sim, k, key, on);
    if (res == null) return false;
    if (!(o && o.lock === false)) {
      k.lawLocks[key] = on;
      const op = WW.REALM_LAW_MAP[key].opposes;
      if (on && op) k.lawLocks[op] = false;
    }
    const ln = WW.REALM_LAW_MAP[key].name;
    if (res.length) chronicle(sim, k, null, on ? 'lawGod' : 'lawGodRepeal', 'laws',
      'Göttlicher Erlass für ' + WW.Texts.withArticle(k.name, 'acc') + (on ? ': „' + ln + '“ gilt ab sofort. Widerspruch zwecklos.' : ': „' + ln + '“ ist aufgehoben. Die Gesetzestafel wird zum Frühstücksbrett.'),
      res.join(', '));
    return true;
  }
  function setRealmLawLocked(sim, kid, key, v) {
    const k = sim._kingdoms.get(kid);
    if (!k || !WW.REALM_LAW_MAP[key]) return false;
    ensureK(k);
    if (v) k.lawLocks[key] = k.laws[key] != null; else delete k.lawLocks[key];
    return true;
  }
  // Nach Regierungswechsel fallen unzulässige Gesetze weg
  function pruneLaws(sim, k) {
    if (!k.laws || k.lawGov === k.gov) return;
    const old = k.lawGov;
    k.lawGov = k.gov;
    const gone = [];
    for (const key in k.laws) if (!lawAllowed(k, key)) { setLawRaw(sim, k, key, false); delete k.lawLocks[key]; gone.push(WW.REALM_LAW_MAP[key] ? WW.REALM_LAW_MAP[key].name : key); }
    if (gone.length && old) chronicle(sim, k, null, 'lawPrune', 'laws',
      'Mit dem Regierungswechsel ' + WW.Texts.withArticle(k.name, 'in') + ' fällt weg: ' + gone.join(', ') + '. Die alten Gesetzbücher werden zu Brennholz.',
      gone.map(n => n + ' abgeschafft').join(', '));
  }
  // Welches Gesetz will das Reich jetzt am liebsten beschließen / abschaffen? -> { key, on } | null
  function wantedLaw(sim, k, L, rng) {
    const w = {};
    let any = false;
    const laws = k.laws || EMPTY, locks = k.lawLocks || EMPTY;
    for (const l of WW.REALM_LAWS) {
      if (locks[l.key] != null) continue;
      if (!lawAllowed(k, l.key)) continue;
      const v = Math.max(0, +l.want(L) || 0);
      if (laws[l.key] == null) { if (v > 1.2) { w['+' + l.key] = v; any = true; } }
      else if (v < 0.6 && L.year - laws[l.key] >= 6) { w['-' + l.key] = (0.9 - v) * 1.5; any = true; }
    }
    if (!any) return null;
    const p = rng.weighted(w);
    return p ? { key: p.slice(1), on: p[0] === '+' } : null;
  }

  // ---------------------------------------------------------------------------
  // Texte
  // ---------------------------------------------------------------------------
  const GOV_M = { Stammesrat: 1, Faschismus: 1, Kommunismus: 1 };
  function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function fmt(tpl, vars, rng, missing) {
    const P = WW.EVENT_POOLS || {};
    let s = tpl;
    for (let guard = 0; guard < 6 && s.indexOf('{@') >= 0; guard++) {
      s = s.replace(/\{@(\w+)\}/g, function (m, key) {
        const pool = P[key];
        if (!pool || !pool.length) { missing.push('@' + key); return ''; }
        return pool[rng.int(pool.length)];
      });
    }
    s = s.replace(/\{(\w+)\}/g, function (m, key) {
      const mm = /^([kK]ingdom|[oO]ther)_(nom|acc|dat|in)$/.exec(key);
      if (mm) {
        const base = mm[1].toLowerCase();
        if (vars[base] == null) { missing.push(key); return ''; }
        const r = WW.Texts.withArticle(vars[base], mm[2]);
        return mm[1][0] === mm[1][0].toUpperCase() ? capFirst(r) : r;
      }
      const gm = /^([gG]ov)_(a|d)$/.exec(key);
      if (gm) {
        const name = String(vars.gov || ''); const m2 = GOV_M[name] ? 'm' : 'f';
        const r = (gm[2] === 'a' ? (m2 === 'm' ? 'ein ' : 'eine ') : (m2 === 'm' ? 'der ' : 'die ')) + name;
        return gm[1][0] === 'G' ? capFirst(r) : r;
      }
      if (key === 'nWord' || key === 'NWord') return WW.SimUtil.numWord(vars.n | 0, key === 'NWord');
      let v = vars[key];
      if (v == null && /^[A-Z]/.test(key)) { const low = key.charAt(0).toLowerCase() + key.slice(1); if (vars[low] != null) v = capFirst(String(vars[low])); }
      if (v == null) { missing.push(key); return ''; }
      return String(v);
    }).replace(/\s+/g, ' ').trim();
    return capFirst(s).replace(/([.!?]) ([a-zäöü])/g, function (m, p, c) { return p + ' ' + c.toUpperCase(); });
  }

  // Chronik-Eintrag mit fertigem Text
  function chronicle(sim, k, c, type, group, text, effectText, evKey) {
    const st = sim.state;
    st.eventSeq++;
    const at = c || (k ? capitalOf(sim, k) : null);
    const ev = {
      id: st.eventSeq, year: st.year, tick: st.tick, type: type, text: text,
      kingdomId: k ? k.id : (at ? at.kingdomId : -1), cityId: at ? at.id : -1,
      x: at ? at.cx + 0.5 : -1, y: at ? at.cy + 0.5 : -1,
      group: group, effectText: effectText || ''
    };
    if (evKey) ev.evKey = evKey;
    st.events.push(ev);
    if (st.events.length > WW.CONFIG.MAX_EVENTS) st.events.splice(0, st.events.length - WW.CONFIG.MAX_EVENTS);
    return ev;
  }

  // ---------------------------------------------------------------------------
  // Wirkungs-Baukasten
  // ---------------------------------------------------------------------------
  const RES_NAMES = { food: 'Nahrung', wood: 'Holz', stone: 'Stein', gold: 'Gold' };
  function num(rng, v) { return Array.isArray(v) ? v[0] + rng.int(v[1] - v[0] + 1) : v; }
  function yearsTxt(y) { return y === 1 ? '1 Jahr' : y + ' Jahre'; }
  function signed(v) { return (v > 0 ? '+' : '−') + Math.abs(Math.round(v)); }
  function citiesOf(sim, k) { const out = []; if (k) for (const id of k.cityIds) { const c = sim._cities.get(id); if (c) out.push(c); } return out; }
  // Ziele: 'city' | 'kingdom' | 'other' | 'all' (alle Reiche)
  function targetsFor(sim, ctx, e, kind) {
    const on = e.on || (ctx.scope === 'city' ? 'city' : (ctx.scope === 'world' ? 'all' : 'kingdom'));
    if (kind === 'mod') {
      if (on === 'city') return ctx.c ? [ctx.c] : (ctx.k ? [ctx.k] : []);
      if (on === 'other') return ctx.o ? [ctx.o] : [];
      if (on === 'both') return [ctx.k, ctx.o].filter(Boolean);
      if (on === 'all') return sim.state.kingdoms.slice();
      return ctx.k ? [ctx.k] : [];
    }
    // Städte
    if (on === 'city') return ctx.c ? [ctx.c] : [];
    if (on === 'other') return citiesOf(sim, ctx.o);
    if (on === 'both') return citiesOf(sim, ctx.k).concat(citiesOf(sim, ctx.o));
    if (on === 'all') return sim.state.cities.slice();
    return citiesOf(sim, ctx.k);
  }
  function whoTxt(ctx, e) {
    if (e.on === 'other' && ctx.o) return ' in ' + ctx.vars.other;
    if (e.on === 'both') return ' beiderseits';
    if (e.on === 'all' || ctx.scope === 'world' && !e.on) return ' überall';
    return '';
  }

  function spawnPeople(sim, city, n) {
    const st = sim.state, W = st.W;
    let made = 0;
    for (let i = 0; i < n; i++) {
      if (st.units.length >= WW.CONFIG.MAX_UNITS) break;
      const t = WW.Path.nearestFree(sim, WW.Cities.centerTile(sim, city, i + 3), city.kingdomId, 6);
      if (t < 0) continue;
      const u = WW.Units.create(sim, { x: (t % W) + 0.5, y: Math.floor(t / W) + 0.5, role: 'farmer', kingdomId: city.kingdomId,
        cityId: city.id, race: city.race, age: WW.CONFIG.ADULT_AGE + 2 + sim.rng.int(20) });
      if (u) { made++; city.pop++; city.adults++; }
    }
    return made;
  }
  function removePeople(sim, city, n, cause) {
    const k = sim._kingdoms.get(city.kingdomId);
    const cand = [];
    for (const u of sim.state.units) if (!u.dead && u.cityId === city.id && u.role !== 'leader' && (!k || u.id !== k.leaderId) && u.role !== 'settler') cand.push(u);
    let gone = 0;
    n = Math.min(n, Math.max(0, cand.length - 3));   // eine Stadt stirbt nie an einem Ereignis
    for (let i = 0; i < n && cand.length; i++) {
      const j = sim.rng.int(cand.length);
      const u = cand[j]; cand[j] = cand[cand.length - 1]; cand.pop();
      WW.Units.kill(sim, u, cause || 'event');
      gone++;
    }
    city.pop = Math.max(0, city.pop - gone);
    return gone;
  }

  const FX = {
    mod: function (sim, ctx, e) {
      const years = num(sim.rng, e.years == null ? 5 : e.years);
      const until = years > 0 ? sim.state.tick + years * TPY() : 0;
      const add = e.add != null ? num(sim.rng, e.add) : undefined;
      const ts = targetsFor(sim, ctx, e, 'mod');
      if (!ts.length) return '';
      for (const t of ts) WW.Mods.add(t, { key: e.mod, add: add, mul: e.mul, until: until, source: 'ev:' + ctx.def.key + (e.tag ? '#' + e.tag : ''), name: ctx.def.title });
      if (e.as) ctx.vars[e.as] = add != null ? Math.abs(add) : Math.round(Math.abs(e.mul - 1) * 100);
      return WW.Mods.describe({ key: e.mod, add: add, mul: e.mul }) + whoTxt(ctx, e) + (years > 0 ? ' für ' + yearsTxt(years) : ' dauerhaft');
    },
    flag: function (sim, ctx, e) {
      const years = num(sim.rng, e.years == null ? 5 : e.years);
      for (const t of targetsFor(sim, ctx, Object.assign({}, e, { on: e.on || 'kingdom' }), 'mod'))
        WW.Mods.add(t, { key: e.flag, flag: e.value, until: years > 0 ? sim.state.tick + years * TPY() : 0, source: 'ev:' + ctx.def.key, name: ctx.def.title });
      return WW.Mods.describe({ key: e.flag, flag: e.value }) + (years > 0 ? ' für ' + yearsTxt(years) : '');
    },
    stock: function (sim, ctx, e) {
      const res = e.stock;
      let tgt = targetsFor(sim, ctx, e, 'city');
      if (!e.on && ctx.scope !== 'city' && ctx.c) tgt = [ctx.c];   // Reichsereignis: Hauptstadt-Lager
      if (!tgt.length) return '';
      let total = 0;
      const seen = new Set();
      for (const c of tgt) {
        const s = WW.Cities.stock(sim, c);
        if (seen.has(s)) continue; seen.add(s);
        const before = s[res];
        let d = e.pct != null ? before * e.pct : num(sim.rng, e.add);
        if (e.perPop) d *= Math.max(4, c.pop) / 10;
        if (d > 0) s[res] = before + d; else s[res] = Math.max(0, before + d);
        if (s !== c.stock) { c.stock[res] = s[res]; }
        total += s[res] - before;
        if (total === 0 && d < 0 && before === 0) total += 0;
      }
      if (e.as) ctx.vars[e.as] = Math.abs(Math.round(total));
      if (Math.round(total) === 0) return '';
      return signed(total) + ' ' + RES_NAMES[res] + whoTxt(ctx, e);
    },
    happy: function (sim, ctx, e) {
      const v = num(sim.rng, e.happy);
      const ts = targetsFor(sim, ctx, e, 'city');
      for (const c of ts) c.happiness = WW.SimUtil.clamp(c.happiness + v, 0, 100);
      if (!ts.length) return '';
      if (e.as) ctx.vars[e.as] = Math.abs(v);
      return 'Laune ' + signed(v) + ' sofort' + whoTxt(ctx, e);
    },
    loyal: function (sim, ctx, e) {
      const v = num(sim.rng, e.loyal);
      const ts = targetsFor(sim, ctx, e, 'city').filter(c => { const k = sim._kingdoms.get(c.kingdomId); return !k || k.capitalId !== c.id || ctx.scope === 'city'; });
      for (const c of ts) c.loyalty = WW.SimUtil.clamp((c.loyalty == null ? 60 : c.loyalty) + v, -100, 100);
      if (!ts.length) return '';
      return 'Loyalität ' + signed(v) + ' sofort';
    },
    pop: function (sim, ctx, e) {
      const city = ctx.c;
      if (!city) return '';
      const n = num(sim.rng, e.pop);
      const d = n > 0 ? spawnPeople(sim, city, n) : -removePeople(sim, city, -n, e.cause);
      ctx.vars.n = Math.abs(d) || Math.abs(n);
      if (!d) return '';
      return (d > 0 ? '+' + d + ' Einwohner' : '−' + (-d) + ' Einwohner');
    },
    law: function (sim, ctx, e) {
      const k = ctx.k; if (!k) return '';
      ensureK(k);
      let key = e.law, on = e.lawOn !== false;
      if (key === 'auto') {
        const w = ctx.wanted || wantedLaw(sim, k, situation(sim, k), sim.rng) || anyLawChange(sim, k);
        if (!w) return '';
        key = w.key; on = w.on;
      }
      if (k.lawLocks[key] != null && k.lawLocks[key] !== on) return '';
      const res = setLawRaw(sim, k, key, on);
      ctx.vars.law = WW.REALM_LAW_MAP[key].name;
      ctx.vars.lawDesc = WW.REALM_LAW_MAP[key].desc;
      ctx.lawOn = on;
      return res && res.length ? res.join(', ') : '';
    },
    opinion: function (sim, ctx, e) {
      if (!ctx.k || !ctx.o) return '';
      const v = num(sim.rng, e.opinion);
      const a = ctx.k.relations[ctx.o.id], b = ctx.o.relations[ctx.k.id];
      if (!a || !b) return '';
      const o0 = a.opinion;
      a.opinion = WW.SimUtil.clamp(a.opinion + v, -100, 100); b.opinion = WW.SimUtil.clamp(b.opinion + v, -100, 100);
      if (a.opinion === o0) return '';
      return 'Meinung zu ' + ctx.vars.other + ' ' + signed(v);
    },
    relation: function (sim, ctx, e) {
      const a = ctx.k, b = ctx.o;
      if (!a || !b || !a.relations[b.id]) return '';
      const st = sim.state, r = a.relations[b.id];
      if (r.status === e.relation) return '';
      if (e.relation === 'war') {
        if (!st.laws.wars || WW.GOVERNMENTS[a.gov].neverWar) return FX.opinion(sim, ctx, { opinion: -25 });
        WW.Diplo.setStatus(sim, a, b, 'war'); WW.Diplo.callAllies(sim, a, b);
        return 'Krieg mit ' + ctx.vars.other;
      }
      if (r.status === 'war' && r.forced) return FX.opinion(sim, ctx, { opinion: 5 });   // erzwungenen Krieg beendet kein Ereignis
      if (e.relation === 'alliance' && r.status === 'war') { WW.Diplo.setStatus(sim, a, b, 'peace'); return 'Frieden mit ' + ctx.vars.other; }
      if (e.relation === 'peace' && r.status !== 'war') return FX.opinion(sim, ctx, { opinion: 10 });
      WW.Diplo.setStatus(sim, a, b, e.relation);
      return (e.relation === 'peace' ? 'Frieden mit ' : 'Bündnis mit ') + ctx.vars.other;
    },
    gov: function (sim, ctx, e) {
      const k = ctx.k; if (!k) return '';
      let g = e.gov;
      if (Array.isArray(g)) g = g[sim.rng.int(g.length)];
      if (!WW.GOVERNMENTS[g] || g === k.gov || k.govLocked || !sim.state.laws.govChanges) {
        for (const c of citiesOf(sim, k)) c.happiness = WW.SimUtil.clamp(c.happiness - 5, 0, 100);
        return 'Umsturz bleibt aus, Laune −5';
      }
      const old = WW.GOVERNMENTS[k.gov].name;
      WW.Gov.applyGov(sim, k, g, { reason: 'silent' });
      pruneLaws(sim, k);
      ctx.vars.gov = WW.GOVERNMENTS[g].name; ctx.vars.oldGov = old; ctx.vars.kingdom = k.name; ctx.vars.leader = WW.Gov.leaderFull(k);
      return 'Neue Regierung: ' + WW.GOVERNMENTS[g].name;
    },
    power: function (sim, ctx, e) {
      const c = ctx.c; if (!c) return '';
      const x = c.cx + 0.5 + (e.off ? sim.rng.range(-3, 3) : 0), y = c.cy + 0.5 + (e.off ? sim.rng.range(-3, 3) : 0);
      WW.Powers.strike(sim, x, y, e.power, true);
      return { fire: 'Feuer in ' + c.name, plague: 'Seuche in ' + c.name, bless: 'Segen über ' + c.name, rain: 'Regen über ' + c.name, lightning: 'Blitzeinschlag' }[e.power] || e.power;
    },
    damage: function (sim, ctx, e) {
      const c = ctx.c; if (!c) return '';
      const types = e.types || null;
      const cand = [];
      for (const s of sim.state.structs) if (!s.dead && s.built && s.cityId === c.id && s.type !== 'field' && s.type !== 'ruin' && (!types || types.indexOf(s.type) >= 0)) cand.push(s);
      if (!cand.length) return '';
      const n = Math.min(cand.length, num(sim.rng, e.n || 1));
      let hit = 0;
      for (let i = 0; i < n; i++) {
        const s = cand.splice(sim.rng.int(cand.length), 1)[0];
        WW.Structs.damage(sim, s, Math.max(1, Math.round(s.maxHp * (e.damage || 0.5))), 'hit');
        hit++;
      }
      return hit === 1 ? 'ein Gebäude beschädigt' : hit + ' Gebäude beschädigt';
    },
    leader: function (sim, ctx, e) {
      const k = ctx.k;
      if (k) ctx.vars.oldLeader = WW.Gov.leaderFull(k);
      if (!k || WW.GOVERNMENTS[k.gov].noLeader) return '';
      const oldFull = WW.Gov.leaderFull(k);
      const old = sim._units.get(k.leaderId);
      if (old && !old.dead) WW.Units.setRole(sim, old, 'farmer');
      k.leaderId = -1;
      const nu = WW.Gov.appointLeader(sim, k);
      if (!nu) return '';
      ctx.vars.oldLeader = oldFull; ctx.vars.leader = WW.Gov.leaderFull(k);
      return 'Neue Führung: ' + ctx.vars.leader;
    },
    follow: function (sim, ctx, e) {
      if (e.chance != null && !(sim.rng.next() < e.chance)) return '';
      const y = num(sim.rng, e.years || [1, 2]);
      const q = sim.state.evt.queue;
      if (q.length < 80) q.push({ key: e.follow, at: sim.state.tick + Math.max(1, Math.round(y * TPY() * (0.6 + sim.rng.next() * 0.4))),
        k: ctx.k ? ctx.k.id : -1, c: ctx.c ? ctx.c.id : -1, o: ctx.o ? ctx.o.id : -1, vars: e.keep ? pickVars(ctx.vars, e.keep) : null });
      return '';
    },
    fn: function (sim, ctx, e) { return e.fn(ctx) || ''; }
  };
  const FX_KEYS = ['mod', 'flag', 'stock', 'happy', 'loyal', 'pop', 'law', 'opinion', 'relation', 'gov', 'power', 'damage', 'leader', 'follow', 'fn'];
  function pickVars(v, keys) { const o = {}; for (const k of keys) if (v[k] != null) o[k] = v[k]; return o; }
  function applyEffect(sim, ctx, e) {
    if (e.if && !e.if(ctx)) return '';
    for (const t of FX_KEYS) if (e[t] != null) return FX[t](sim, ctx, e) || '';
    return '';
  }
  // Ersatz, wenn kein Gesetz gewollt ist (erzwungenes Ereignis): erstes zulässiges, nicht fixiertes Gesetz umschalten
  function anyLawChange(sim, k) {
    const list = WW.REALM_LAWS.filter(l => lawAllowed(k, l.key) && k.lawLocks[l.key] == null);
    if (!list.length) return null;
    const off = list.filter(l => k.laws[l.key] == null);
    if (off.length) return { key: off[sim.rng.int(off.length)].key, on: true };
    return { key: list[sim.rng.int(list.length)].key, on: false };
  }

  // ---------------------------------------------------------------------------
  // Kontext und Auslösen
  // ---------------------------------------------------------------------------
  function baseVars(sim, ctx) {
    const k = ctx.k, c = ctx.c, o = ctx.o, rng = sim.rng;
    const v = {};
    if (k) {
      const g = WW.GOVERNMENTS[k.gov];
      v.kingdom = k.name; v.base = k.baseName; v.gov = g.name; v.realm = g.realm;
      v.leader = WW.Gov.leaderFull(k); v.leaderName = k.leaderName || 'Niemand'; v.title = k.leaderTitle || 'Plenum';
      v.deity = k.deity || 'der Große Knödel';
      const r = WW.RACES[k.race] || WW.RACES.human; v.race = r.name; v.raceSg = r.singular; v.raceAdj = r.adjective;
      const cap = capitalOf(sim, k); v.capital = cap ? cap.name : k.baseName;
    }
    v.city = c ? c.name : (v.capital || 'irgendwo');
    if (o) {
      v.other = o.name; v.otherBase = o.baseName; v.otherLeader = WW.Gov.leaderFull(o); v.otherGov = WW.GOVERNMENTS[o.gov].name;
      const oc = capitalOf(sim, o); v.otherCity = oc ? oc.name : o.baseName;
      v.otherRace = (WW.RACES[o.race] || WW.RACES.human).name;
    }
    const race = (c && c.race) || (k && k.race) || 'human';
    v.person = WW.Names.person(rng, race, rng.next() < 0.5);
    v.person2 = WW.Names.person(rng, race, rng.next() < 0.5);
    v.num = 3 + rng.int(40); v.big = 50 + rng.int(450); v.pct = 51 + rng.int(40); v.pctNo = 100 - v.pct;
    v.years = 2 + rng.int(6); v.n = 2 + rng.int(5); v.year = sim.state.year;
    return v;
  }

  function resolveCtx(sim, d, o) {
    const st = sim.state;
    o = o || {};
    let k = o.kingdomId != null ? sim._kingdoms.get(o.kingdomId) : null;
    let c = o.cityId != null ? sim._cities.get(o.cityId) : null;
    if (c && !k) k = sim._kingdoms.get(c.kingdomId);
    if (!k && d.scope !== 'world') k = st.kingdoms.length ? st.kingdoms[sim.rng.int(st.kingdoms.length)] : null;
    if (!k && st.kingdoms.length) k = st.kingdoms[sim.rng.int(st.kingdoms.length)];
    if (k && (!c || c.kingdomId !== k.id)) {
      if (d.scope === 'city' && k.cityIds.length) c = sim._cities.get(k.cityIds[sim.rng.int(k.cityIds.length)]);
      else c = capitalOf(sim, k);
    }
    let oth = o.otherId != null ? sim._kingdoms.get(o.otherId) : null;
    if (k && (!oth || oth === k || !k.relations[oth.id])) oth = pickOther(sim, k, d) || pickOther(sim, k, null);
    return { def: d, scope: d.scope, k: k || null, c: c || null, o: oth || null, sim: sim, rng: sim.rng };
  }
  // anderes Reich: bevorzugt nah und mit passender Beziehung
  function pickOther(sim, k, d) {
    let best = null, bs = -1;
    const cap = capitalOf(sim, k);
    for (const oid in k.relations) {
      const o = sim._kingdoms.get(+oid); if (!o || o === k || !o.cityIds.length) continue;
      const r = k.relations[oid];
      if (d && d.rel && d.rel.indexOf(r.status) < 0) continue;
      const oc = capitalOf(sim, o);
      const dist = cap && oc ? Math.hypot(cap.cx - oc.cx, cap.cy - oc.cy) : 50;
      const sc = 100 / (10 + dist) + sim.rng.next() * 2;
      if (sc > bs) { bs = sc; best = o; }
    }
    return best;
  }
  function decorate(ctx) {
    const sim = ctx.sim;
    ctx.L = ctx.k ? situation(sim, ctx.k) : null;
    ctx.gov = ctx.k ? ctx.k.gov : null;
    ctx.race = ctx.c ? ctx.c.race : (ctx.k ? ctx.k.race : null);
    ctx.law = key => !!(ctx.k && ctx.k.laws && ctx.k.laws[key] != null);
    ctx.rel = ctx.k && ctx.o ? ctx.k.relations[ctx.o.id] : null;
    return ctx;
  }

  // Erzwingen (Tests, Folgeereignisse). o = { kingdomId, cityId, otherId, vars }
  function fire(sim, key, o) {
    const d = def(key);
    if (!d) return null;
    const ctx = decorate(resolveCtx(sim, d, o));
    if (d.scope !== 'world' && !ctx.k) return null;
    if (d.scope === 'pair' && !ctx.o && !d.soloOk) return null;
    return run(sim, d, ctx, o && o.vars);
  }

  function run(sim, d, ctx, extraVars) {
    const st = sim.state;
    ctx.vars = Object.assign(baseVars(sim, ctx), extraVars || {});
    if (d.prep) d.prep(ctx);
    const parts = [];
    for (const e of d.effects) { const p = applyEffect(sim, ctx, e); if (p) parts.push(p); }
    if (d.after) d.after(ctx);
    // Texte: eigene Liste je Regierung/Ausgang möglich (textsBy: { schlüssel: [...] }, pickTexts(ctx) -> Schlüssel)
    let list = d.texts;
    if (d.textsBy) { const tk = d.pickTexts ? d.pickTexts(ctx) : ctx.gov; if (d.textsBy[tk]) list = d.textsBy[tk]; }
    const missing = [];
    const text = fmt(list[sim.rng.int(list.length)], ctx.vars, sim.rng, missing);
    if (missing.length) { sim._evMissing = sim._evMissing || []; sim._evMissing.push(d.key + ':' + missing.join(',')); }
    const effectText = parts.join(', ');
    const ev = chronicle(sim, ctx.k, ctx.c, d.type || ('ev_' + d.key), d.group, text, effectText, d.key);
    // Abklingzeit
    const cd = d.cooldown == null ? 8 : d.cooldown;
    if (d.scope === 'world') st.evt.cd[d.key] = st.year + cd;
    else if (ctx.k) { if (!ctx.k.evcd) ctx.k.evcd = {}; ctx.k.evcd[d.key] = st.year + cd; }
    if (ctx.k) ctx.k._sit = null;
    return ev;
  }

  // ---------------------------------------------------------------------------
  // Natürlicher Ablauf
  // ---------------------------------------------------------------------------
  function weightOf(d, ctx) {
    let w = d.weight == null ? 1 : d.weight;
    if (d.when) {
      let r;
      try { r = d.when(ctx); } catch (e) { r = false; }
      if (!r) return 0;
      if (typeof r === 'number') w *= r;
    }
    return w * (d.prio || 1);
  }
  function chooseFor(sim, k, importantOnly) {
    const st = sim.state;
    const rng = sim.rng;
    const cityC = sim._cities.get(k.cityIds[rng.int(k.cityIds.length)]);
    const cap = capitalOf(sim, k);
    const oth = pickOther(sim, k, null);
    const L = situation(sim, k);
    const wanted = wantedLaw(sim, k, L, rng);
    const cands = [], ws = [];
    let total = 0;
    for (const d of DEFS) {
      if (d.scope === 'world' || d.followOnly) continue;
      if (importantOnly && !(d.prio >= 2)) continue;
      if (k.evcd && k.evcd[d.key] != null && k.evcd[d.key] > st.year) continue;
      if (d.scope === 'pair' && !oth) continue;
      const ctx = decorate({ def: d, scope: d.scope, k: k, c: d.scope === 'city' ? cityC : cap, o: d.scope === 'pair' ? oth : null, sim: sim, rng: rng, wanted: wanted });
      if (d.scope === 'pair' && d.rel && d.rel.indexOf(ctx.rel ? ctx.rel.status : '') < 0) continue;
      const w = weightOf(d, ctx);
      if (w > 0) { cands.push(ctx); ws.push(w); total += w; }
    }
    if (!total) return null;
    let r = rng.next() * total;
    for (let i = 0; i < cands.length; i++) { r -= ws[i]; if (r <= 0) return cands[i]; }
    return cands[cands.length - 1];
  }

  function tick(sim) {
    const st = sim.state;
    if (st.tick % CHECK_EVERY !== 7) return;
    if (!st.evt) defaults(st);
    if (DEFS !== WW.EVENT_DEFS) index();
    const ev = st.evt;
    if (ev.year !== st.year) { ev.year = st.year; ev.count = 0; }
    for (const k of st.kingdoms) if (k.laws && k.lawGov !== k.gov) pruneLaws(sim, k);
    if (!st.laws.events) return;
    // Folgeereignisse (Ketten) – unabhängig vom Deckel
    if (ev.queue.length) {
      const due = [];
      ev.queue = ev.queue.filter(q => { if (q.at <= st.tick) { due.push(q); return false; } return true; });
      for (const q of due) {
        const d = def(q.key); if (!d) continue;
        const k = sim._kingdoms.get(q.k);
        if (d.scope !== 'world' && (!k || !k.cityIds.length)) continue;
        const res = fire(sim, q.key, { kingdomId: q.k, cityId: sim._cities.get(q.c) && sim._cities.get(q.c).kingdomId === q.k ? q.c : null, otherId: q.o >= 0 ? q.o : null, vars: q.vars });
        if (res) ev.count++;
      }
    }
    const nK = st.kingdoms.length;
    if (!nK) return;
    const cap = Math.min(18, 4 + nK);
    const hard = Math.ceil(cap * 1.35);
    if (ev.count >= hard) return;
    // weniger Reiche einzeln würfeln, wenn es viele gibt (Deckel)
    const chance = BASE_CHANCE * Math.min(1, 10 / Math.max(10, nK));
    for (const k of st.kingdoms) {
      if (!k.cityIds.length) continue;
      if (!(sim.rng.next() < chance)) continue;
      const ctx = chooseFor(sim, k, ev.count >= cap);
      if (!ctx) continue;
      run(sim, ctx.def, ctx, null);
      ev.count++;
      if (ev.count >= hard) break;
    }
    // Weltereignis: etwa alle 6 Jahre
    if (st.tick % TPY() === 7 + CHECK_EVERY * 3 && sim.rng.next() < 0.17 && ev.count < hard) {
      const ws = {}; let any = false;
      for (const d of DEFS) {
        if (d.scope !== 'world' || d.followOnly) continue;
        if (ev.cd[d.key] != null && ev.cd[d.key] > st.year) continue;
        const ctx = decorate({ def: d, scope: 'world', k: null, c: null, o: null, sim: sim, rng: sim.rng });
        const w = weightOf(d, ctx); if (w > 0) { ws[d.key] = w; any = true; }
      }
      if (any) { const key = sim.rng.weighted(ws); if (key && fire(sim, key, {})) ev.count++; }
    }
  }

  index();
  WW.Events = {
    hasLaw: function (k, key) { return !!(k && k.laws && k.laws[key] != null); },
    tick: tick, fire: fire, def: def, defaults: defaults, ensureKingdom: ensureK, situation: situation,
    setRealmLaw: setRealmLaw, setRealmLawLocked: setRealmLawLocked, lawAllowed: lawAllowed, lawsOf: lawsOf, pruneLaws: pruneLaws,
    wantedLaw: wantedLaw, format: fmt, chronicle: chronicle,
    get DEFS() { if (DEFS !== WW.EVENT_DEFS) index(); return DEFS; }
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
