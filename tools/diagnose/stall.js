// Diagnose: Warum hören Siedlungen auf zu bauen oder sterben aus?
// Wie beim Spielen: leere Welt, Siedler gesetzt (verschiedene Regierungen), dann laufen lassen.
// Aufruf: node stall.js [welten] [jahre]
process.chdir('/home/user/Neues-Spiel-');
const WW = require('/home/user/Neues-Spiel-/tests/load.js').load();
const NW = +(process.argv[2] || 8), YEARS = +(process.argv[3] || 70);
const GOVS = ['tribe', 'monarchy', 'democracy', 'fascism', 'communism', 'theocracy', 'republic', 'anarchy'];
const sum = { gesetzt: 0, lebt: 0, weg: 0, stockt: 0, wegGrund: {}, stocktGrund: {}, tod: {} };
const tname = (i) => (WW.TERRAIN[i] || {}).key;
for (let w = 0; w < NW; w++) {
  const sim = WW.Sim.create({ seed: 'stall-' + w, size: 'large', populate: 0, animals: true });
  const st = sim.state; const mine = [];
  for (let i = 0; i < 40000 && mine.length < 6; i++) {
    const x = (i * 37 + w * 11) % st.W, y = (i * 91 + w * 7) % st.H;
    if (mine.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 34)) continue;
    const gov = GOVS[(mine.length + w) % GOVS.length];
    const n0 = st.cities.length;
    if (sim.actions.spawnSettlers(x, y, 8, gov) && st.cities.length > n0) { const c = st.cities[st.cities.length - 1]; mine.push({ x, y, id: c.id, name: c.name, gov, biome: tname(st.terrain[y * st.W + x]), log: [], lastBuilt: 0, lastBuiltYear: 0, stall: null, gone: null }); }
  }
  sum.gesetzt += mine.length;
  const built = (id) => { let n = 0; for (const s of st.structs) if (!s.dead && s.built && s.cityId === id && s.type !== 'field' && !WW.Structs.isWallish(s)) n++; return n; };
  const info = (c) => {
    const sk = WW.Cities.stock(sim, c), k = sim._kingdoms.get(c.kingdomId); const roles = {};
    for (const u of st.units) if (!u.dead && u.cityId === c.id) roles[u.role] = (roles[u.role] || 0) + 1;
    let sitesOpen = 0, housesCap = 0; for (const s of st.structs) if (!s.dead && s.cityId === c.id) { if (!s.built) sitesOpen++; }
    return { pop: c.pop, tier: c.tier, gov: k ? k.gov : '?', food: Math.round(sk.food), wood: Math.round(sk.wood), stone: Math.round(sk.stone), gold: Math.round(sk.gold || 0), happy: Math.round(c.happiness), roles, sitesOpen, noSpace: !!c.noSpace, wall: (c.wall && c.wall.state) || '-', atWar: !!(k && WW.Diplo.atWar(sim, k.id)) };
  };
  let evSeen = st.events.length; const lastEv = {};
  for (let y = 1; y <= YEARS; y++) {
    const d0 = Object.assign({}, sim._deaths || {});
    for (let t = 0; t < 240; t++) sim.tick();
    for (let i = evSeen; i < st.events.length; i++) { const e = st.events[i]; if (e && e.cityId != null) (lastEv[e.cityId] || (lastEv[e.cityId] = [])).push(st.year + ':' + e.type); }
    evSeen = st.events.length;
    for (const m of mine) {
      if (m.gone) continue;
      const c = st.cities.find((c) => c.id === m.id);
      if (!c) { m.gone = { year: y, ev: (lastEv[m.id] || []).slice(-6).join(' '), before: m.last }; continue; }
      const b = built(m.id), inf = info(c);
      if (b > m.lastBuilt) { m.lastBuilt = b; m.lastBuiltYear = y; if (m.stall && !m.stall.until) m.stall.until = y; }
      // „stockt": seit 12 Jahren kein neues Bauwerk, obwohl die Stadt lebt, klein ist und nicht belagert wird
      if (!m.stall && y - m.lastBuiltYear >= 12 && inf.pop >= 4 && inf.pop < 60) m.stall = { from: m.lastBuiltYear, at: y, info: inf, builtN: b };
      m.last = Object.assign({ year: y, builtN: b }, inf);
      if (y === 5 || y === 15 || y === 30 || y === 50 || y === YEARS) m.log.push('J' + y + ':' + inf.pop);
    }
    const d1 = sim._deaths || {}; for (const k2 in d1) { const dn = d1[k2] - (d0[k2] || 0); if (dn > 0) sum.tod[k2] = (sum.tod[k2] || 0) + dn; }
  }
  console.log('=== Welt ' + w + ' (' + st.W + '×' + st.H + '), Jahr ' + st.year + ': Städte ' + st.cities.length + ', Einwohner ' + st.units.length);
  for (const m of mine) {
    let line = '  ' + m.name.padEnd(13) + m.gov.padEnd(10) + m.biome.padEnd(9) + m.log.join(' ').padEnd(34);
    if (m.gone) {
      sum.weg++; const b = m.gone.before || {};
      const why = /conquest|conquer|fallen/.test(m.gone.ev) ? 'erobert' : /cityAbandoned/.test(m.gone.ev) ? 'verlassen' : /join|merge/.test(m.gone.ev) ? 'aufgegangen' : 'unklar';
      sum.wegGrund[why] = (sum.wegGrund[why] || 0) + 1;
      line += ' WEG Jahr ' + m.gone.year + ' (' + why + ') zuletzt: Einw ' + b.pop + ' Nahrung ' + b.food + ' Holz ' + b.wood + ' Stein ' + b.stone + ' Laune ' + b.happy + ' Krieg ' + b.atWar + ' | ' + m.gone.ev;
    } else {
      sum.lebt++;
      if (m.stall) {
        sum.stockt++; const i2 = m.stall.info;
        const why = i2.sitesOpen > 0 && !(i2.roles.builder > 0) ? 'kein Baumeister' : i2.sitesOpen > 0 && i2.wood < 5 && i2.stone < 5 ? 'Baustelle ohne Material' : i2.sitesOpen > 0 ? 'Baustelle bleibt liegen' : i2.noSpace ? 'kein Platz' : i2.food < 10 ? 'Hunger' : 'plant nichts';
        sum.stocktGrund[why] = (sum.stocktGrund[why] || 0) + 1;
        line += ' STOCKT ab Jahr ' + m.stall.from + (m.stall.until ? ' bis ' + m.stall.until : ' bis heute') + ' (' + why + '): Einw ' + i2.pop + ' Bauten ' + m.stall.builtN + ' Baustellen ' + i2.sitesOpen + ' Nahrung ' + i2.food + ' Holz ' + i2.wood + ' Stein ' + i2.stone + ' Rollen ' + JSON.stringify(i2.roles) + ' Mauer ' + i2.wall + (i2.noSpace ? ' KEIN PLATZ' : '');
      }
    }
    console.log(line);
  }
}
console.log('\nSUMME: gesetzt ' + sum.gesetzt + ', leben ' + sum.lebt + ', weg ' + sum.weg + ' ' + JSON.stringify(sum.wegGrund) + ', stocken (12 Jahre kein Bau) ' + sum.stockt + ' ' + JSON.stringify(sum.stocktGrund));
console.log('Todesursachen gesamt: ' + JSON.stringify(sum.tod));
