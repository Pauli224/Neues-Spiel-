// Zerlegt die Bildzeit: Zeit je Renderer-Methode, schmutzige Kacheln je Sekunde, Simulationszeit je Bild.
// Aufruf: node parts.js <scratchpad> <artifact.html> <zoom>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const S = process.argv[2], SRC = process.argv[3], Z = process.argv[4] || '2';
const frag = fs.readFileSync(SRC, 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + frag;
const tmp = path.join(S, 'qa/parts_page.html'); fs.writeFileSync(tmp, html);
(async () => {
  const b = await chromium.launch({ args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  await p.goto('file://' + tmp); await p.waitForTimeout(2500);
  for (const h of await p.$$('button')) { const t = await h.evaluate(el => el.offsetParent ? (el.textContent || '') : ''); if (/Los geht/.test(t)) { await h.click(); break; } }
  await p.evaluate(() => window.WW.game.newWorld({ seed: 'perf-welt', size: 'large', populate: 0 })); await p.waitForTimeout(5000);
  await p.evaluate((z) => {
    const g = window.WW.game, s = g.sim; const govs = ['monarchy', 'communism', 'democracy', 'fascism', 'republic', 'theocracy']; let n = 0;
    for (let i = 0; i < 9000 && n < 6; i++) { const x = (i * 37) % s.state.W, y = (i * 91) % s.state.H; if (s.actions.spawnSettlers(x, y, 8, govs[n])) n++; }
    for (let t = 0; t < 6000; t++) s.tick();
    const c = s.state.cities[0]; g.cam.zoom = +z; g.cam.x = c.cx * 8; g.cam.y = c.cy * 8; g.cam.clamp();
    const r = g.renderer; window.__t = {}; window.__n = { frames: 0, dirty: 0, ticks: 0 };
    const names = []; for (const k in Object.getPrototypeOf(r)) if (typeof r[k] === 'function') names.push(k);
    for (const k of names) { if (k === 'render') continue; const f0 = r[k]; r[k] = function () { const t0 = performance.now(); try { return f0.apply(this, arguments); } finally { window.__t[k] = (window.__t[k] || 0) + performance.now() - t0; } }; }
    const rr = r.render; r.render = function () { window.__n.frames++; const t0 = performance.now(); try { return rr.apply(this, arguments); } finally { window.__t.RENDER = (window.__t.RENDER || 0) + performance.now() - t0; } };
    const mt = r.markTiles; r.markTiles = function (d) { window.__n.dirty += d ? d.length : 0; return mt.apply(this, arguments); };
    const tk = s.tick; s.tick = function () { window.__n.ticks++; const t0 = performance.now(); try { return tk.apply(this, arguments); } finally { window.__t.SIM = (window.__t.SIM || 0) + performance.now() - t0; } };
  }, Z);
  await p.keyboard.press('3'); await p.waitForTimeout(2000);
  await p.evaluate(() => { window.__t = {}; window.__n = { frames: 0, dirty: 0, ticks: 0 }; });
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => { const n = window.__n, o = {}; for (const k of Object.keys(window.__t).sort((a, b) => window.__t[b] - window.__t[a]).slice(0, 16)) o[k] = +(window.__t[k] / n.frames).toFixed(2); return { fps: Math.round(n.frames / 4), schmutzigeKachelnJeSek: Math.round(n.dirty / 4), ticksJeSek: Math.round(n.ticks / 4), msJeBild: o }; });
  console.log('zoom', Z, JSON.stringify(r, null, 0));
  await b.close();
})();
