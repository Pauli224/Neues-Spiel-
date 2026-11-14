// Dauerprobe im Browser: vier Regierungen, 10× Tempo, zwischendurch Kräfte. Meldet Fehler und ob die Welt weiterläuft.
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const S = process.argv[2], SRC = process.argv[3], SECS = +(process.argv[4] || 60);
const frag = fs.readFileSync(SRC, 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + frag;
fs.writeFileSync(path.join(S, 'qa/soak.html'), html);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 400)); });
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.goto('file://' + path.join(S, 'qa/soak.html')); await p.waitForTimeout(2500);
  for (const h of await p.$$('button')) { const t = await h.evaluate(el => el.offsetParent ? (el.textContent || '') : ''); if (/Los geht/.test(t)) { await h.click(); break; } }
  const setup = await p.evaluate(() => {
    const g = window.WW.game; const s = g.sim; const govs = ['monarchy', 'communism', 'democracy', 'fascism', 'republic', 'theocracy']; const out = [];
    for (let i = 0; i < 9000 && out.length < 6; i++) { const x = (i * 37) % s.state.W, y = (i * 91) % s.state.H; const r = s.actions.spawnSettlers(x, y, 8, govs[out.length]); if (r) out.push(govs[out.length]); }
    return { placed: out, powers: Object.keys(window.WW.POWERS || {}).length, creatures: Object.keys(window.WW.CREATURES || {}).length, events: window.WW.Events ? 'ja' : 'nein', laws: Object.keys(window.WW.REALM_LAWS || {}).length, industry: window.WW.Industry ? 'ja' : 'nein' };
  });
  console.log('aufbau:', JSON.stringify(setup));
  await p.keyboard.press('5');
  const t0 = Date.now(); let last = null; let stuck = 0; let n = 0;
  while (Date.now() - t0 < SECS * 1000) {
    await p.waitForTimeout(5000); n++;
    const st = await p.evaluate((n) => {
      const g = window.WW.game; const s = g.sim; const st = s.state; const c = st.cities[n % Math.max(1, st.cities.length)];
      const ks = Object.keys(window.WW.POWERS || {}); const k = ks[(n * 5) % Math.max(1, ks.length)];
      let fired = '';
      if (c && n % 2 === 0 && k) { try { s.actions.strike(c.cx + 9, c.cy + 4, k, { dx: 1, dy: 0 }); fired = k; } catch (e) { fired = 'WURF ' + k + ': ' + e.message; } }
      const stages = {}; for (const ci of st.cities) { const z = st.structs && (st.structs.get ? null : null); }
      return { tick: st.tick, year: st.year, units: st.units.length, cities: st.cities.length, kingdoms: st.kingdoms.length, animals: (st.animals || []).length, fired, walls: st.cities.map(c => (c.wall && c.wall.level) || 0).join(''), tiers: st.cities.map(c => c.tier).join(''), events: st.events.length, last: (st.events[st.events.length - 1] || {}).text };
    }, n);
    if (last && st.tick === last.tick) stuck++; else stuck = 0;
    last = st;
    console.log(`+${Math.round((Date.now() - t0) / 1000)}s tick ${st.tick} jahr ${st.year} einw ${st.units} städte ${st.cities} reiche ${st.kingdoms} tiere ${st.animals} mauern ${st.walls} stufen ${st.tiers} ${st.fired ? '| kraft ' + st.fired : ''}`);
    if (stuck >= 2) { console.log('WELT STEHT'); break; }
  }
  console.log('letzter chronik-eintrag:', last && last.last);
  await p.screenshot({ path: path.join(S, 'qa/soak_end.png') });
  console.log('errors:', errs.length, errs.slice(0, 5));
  await b.close();
})();
