// Füllraten-Probe: wie viele drawImage-Aufrufe und wie viele Zielpixel je Bild, getrennt nach großen (Block-Caches, Ebenen) und kleinen Quellen (Sprites)?
// Aufruf: node fill.js <scratchpad> <artifact.html> [dsf] [gfx-json]
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const S = process.argv[2], SRC = process.argv[3], DSF = +(process.argv[4] || 2), GFX = process.argv[5] ? JSON.parse(process.argv[5]) : null;
const frag = fs.readFileSync(SRC, 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + frag;
const tmp = path.join(S, 'qa/fill_' + path.basename(SRC));
fs.writeFileSync(tmp, html);
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: DSF })).newPage();
  await p.goto('file://' + tmp); await p.waitForTimeout(2500);
  for (const h of await p.$$('button')) { const t = await h.evaluate(el => el.offsetParent ? (el.textContent || '') : ''); if (/Los geht/.test(t)) { await h.click(); break; } }
  await p.evaluate((GFX) => {
    const g = window.WW.game, s = g.sim; const govs = ['monarchy', 'communism', 'democracy', 'fascism', 'republic', 'theocracy']; let n = 0;
    for (let i = 0; i < 9000 && n < 6; i++) { const x = (i * 37) % s.state.W, y = (i * 91) % s.state.H; if (s.actions.spawnSettlers(x, y, 8, govs[n])) n++; }
    for (let t = 0; t < 6000; t++) s.tick();
    if (GFX) { Object.assign(g.gfx, GFX); if (g.applyGfx) g.applyGfx(); }
    const main = g.renderer.canvas; const P = CanvasRenderingContext2D.prototype; const od = P.drawImage, of = P.fillRect;
    window.__f = { frames: 0, bigN: 0, bigPx: 0, smallN: 0, smallPx: 0, offN: 0, offPx: 0, fillN: 0, fillPx: 0 };
    P.drawImage = function (img, a, b2, c, d, e, f2, g2, h) {
      const dw = g2 !== undefined ? g2 : (c !== undefined ? c : img.width), dh = h !== undefined ? h : (d !== undefined ? d : img.height);
      const sw = g2 !== undefined ? c : img.width;
      const m = this.getTransform(); const dx0 = g2 !== undefined ? e : a, dy0 = g2 !== undefined ? f2 : b2; let X0 = m.e + dx0 * m.a, Y0 = m.f + dy0 * m.d, X1 = X0 + dw * m.a, Y1 = Y0 + dh * m.d; if (X1 < X0) { const t = X0; X0 = X1; X1 = t; } if (Y1 < Y0) { const t = Y0; Y0 = Y1; Y1 = t; } const cw = this.canvas.width, chh = this.canvas.height; const px = Math.max(0, Math.min(cw, X1) - Math.max(0, X0)) * Math.max(0, Math.min(chh, Y1) - Math.max(0, Y0)); const F = window.__f; if (this.canvas === main) { const L = window.__lab || 'rest'; const o = window.__by[L] || (window.__by[L] = { n: 0, px: 0 }); o.n++; o.px += px; }
      if (this.canvas !== main) { F.offN++; F.offPx += px; } else if (sw >= 100 || px > 40000) { F.bigN++; F.bigPx += px; } else { F.smallN++; F.smallPx += px; }
      return od.apply(this, arguments);
    };
    P.fillRect = function (x, y, w, h) { if (this.canvas === main) { const m = this.getTransform(); window.__f.fillN++; window.__f.fillPx += Math.abs(w * h * m.a * m.d); } return of.apply(this, arguments); };
    window.__by = {}; const r = g.renderer; for (const k of ['drawWaterLayer','drawObjects','drawDots','drawFlags','drawLife','updatePlumes','drawSmog','drawFx','drawEffects','drawTrains','drawAircraft','drawParticles','drawAtmosphere','drawSelection','drawScars','drawLabels','drawOverlay','drawPlots']) { if (typeof r[k] === 'function') { const f0 = r[k].bind(r); r[k] = function () { const p0 = window.__lab; window.__lab = k; try { return f0.apply(null, arguments); } finally { window.__lab = p0; } }; } } const orig = r.render.bind(r); r.render = function (a, b3) { window.__f.frames++; return orig(a, b3); };
  }, GFX);
  await p.keyboard.press('3');
  for (const z of ['min', 1, 2, 3]) {
    await p.evaluate((z) => { const g = window.WW.game, c = g.sim.state.cities[0]; g.cam.zoom = z === 'min' ? g.cam.minZoom : z; if (c) { g.cam.x = c.cx * 8; g.cam.y = c.cy * 8; } g.cam.clamp(); }, z);
    await p.waitForTimeout(1500);
    await p.evaluate(() => { const F = window.__f; for (const k in F) F[k] = 0; window.__by = {}; });
    await p.waitForTimeout(3000);
    const r = await p.evaluate(() => { const F = window.__f, n = Math.max(1, F.frames), cv = window.WW.game.renderer.canvas, scr = cv.width * cv.height; const q = (v) => +(v / n / scr).toFixed(2);
      return { frames: F.frames, gross: Math.round(F.bigN / n), grossFlaeche: q(F.bigPx), klein: Math.round(F.smallN / n), kleinFlaeche: q(F.smallPx), nebenbei: Math.round(F.offN / n), nebenbeiFlaeche: q(F.offPx), fill: Math.round(F.fillN / n), fillFlaeche: q(F.fillPx) }; });
    console.log('zoom', String(z).padEnd(4), JSON.stringify(r)); const by = await p.evaluate(() => { const n = Math.max(1, window.__f.frames), cv = window.WW.game.renderer.canvas, scr = cv.width * cv.height; const o = {}; for (const k in window.__by) o[k] = Math.round(window.__by[k].n / n) + ' / ' + (window.__by[k].px / n / scr).toFixed(2); return o; }); console.log('     je Ebene (Aufrufe / Bildschirmflaechen):', JSON.stringify(by));
  }
  await b.close();
})();
