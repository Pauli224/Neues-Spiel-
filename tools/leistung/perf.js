// Leistungsprobe: Zeichenzeit (JS) und Bildrate je Zoomstufe, für eine fertige Artifact-Datei.
// Aufruf: node perf.js <scratchpad> <artifact.html> [dsf] [gfx-json]
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const S = process.argv[2], SRC = process.argv[3], DSF = +(process.argv[4] || 2), GFX = process.argv[5] ? JSON.parse(process.argv[5]) : null;
const frag = fs.readFileSync(SRC, 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + frag;
const tmp = path.join(S, 'qa/perf_' + path.basename(SRC));
fs.writeFileSync(tmp, html);
(async () => {
  const b = await chromium.launch({ args: process.env.UNCAP ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.goto('file://' + tmp); await p.waitForTimeout(2500);
  for (const h of await p.$$('button')) { const t = await h.evaluate(el => el.offsetParent ? (el.textContent || '') : ''); if (/Los geht/.test(t)) { await h.click(); break; } }
  await p.evaluate(() => window.WW.game.newWorld({ seed: 'perf-welt', size: 'large', populate: 0 })); await p.waitForTimeout(5000);
  const info = await p.evaluate((GFX) => {
    const g = window.WW.game, s = g.sim; const govs = ['monarchy', 'communism', 'democracy', 'fascism', 'republic', 'theocracy']; let n = 0;
    for (let i = 0; i < 9000 && n < 6; i++) { const x = (i * 37) % s.state.W, y = (i * 91) % s.state.H; if (s.actions.spawnSettlers(x, y, 8, govs[n])) n++; }
    for (let t = 0; t < 6000; t++) s.tick();
    if (GFX) { Object.assign(g.gfx, GFX); if (g.applyGfx) g.applyGfx(); }
    const r = g.renderer; const orig = r.render.bind(r); window.__rt = [];
    r.render = function (a, b2) { const t0 = performance.now(); const o = orig(a, b2); window.__rt.push(performance.now() - t0); return o; };
    return { W: s.state.W, H: s.state.H, units: s.state.units.length, cities: s.state.cities.length, year: s.state.year, gfx: g.gfx, minZoom: g.cam.minZoom, maxZoom: g.cam.maxZoom, canvas: [r.canvas.width, r.canvas.height] };
  }, GFX);
  console.log(path.basename(SRC), 'dsf', DSF, JSON.stringify(info));
  await p.keyboard.press('3');
  for (const z of ['min', 1, 2, 3, 4]) {
    await p.evaluate((z) => { const g = window.WW.game, c = g.sim.state.cities[0]; g.cam.zoom = z === 'min' ? g.cam.minZoom : z; if (c) { g.cam.x = c.cx * 8; g.cam.y = c.cy * 8; } g.cam.clamp(); }, z);
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => new Promise(res => {
      window.__rt = []; let n = 0; const t0 = performance.now(); let last = t0; const gaps = [];
      function f(now) { n++; gaps.push(now - last); last = now; if (now - t0 < 3000) requestAnimationFrame(f); else {
        const rt = window.__rt.slice().sort((a, b) => a - b); const gs = gaps.slice(1).sort((a, b) => a - b);
        res({ fps: Math.round(n / ((now - t0) / 1000)), drawAvg: +(rt.reduce((a, b) => a + b, 0) / Math.max(1, rt.length)).toFixed(1), drawP95: +(rt[Math.floor(rt.length * 0.95)] || 0).toFixed(1), drawMax: +(rt[rt.length - 1] || 0).toFixed(1), gapP95: +(gs[Math.floor(gs.length * 0.95)] || 0).toFixed(0), zoom: window.WW.game.cam.zoom, units: window.WW.game.sim.state.units.length }); } }
      requestAnimationFrame(f);
    }));
    console.log('  zoom', String(z).padEnd(4), JSON.stringify(r));
  }
  if (errs.length) console.log('errors:', errs.slice(0, 3));
  await b.close();
})();
