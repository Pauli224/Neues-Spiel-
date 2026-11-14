// Prüft nach den Leistungs-Umbauten: Gemaltes Gelände erscheint im Bild (ruhende Kamera, Standbild aktiv),
// auch nach Wegschwenken und Zurückkommen (aufgeschobene Kacheln), und Verschieben der Kamera zeigt kein altes Bild.
// Aufruf: node paintcheck.js <scratchpad> <artifact.html>
const fs = require('fs'); const path = require('path'); const { chromium } = require('playwright');
const S = process.argv[2], SRC = process.argv[3];
const frag = fs.readFileSync(SRC, 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + frag;
const tmp = path.join(S, 'qa/paint_page.html'); fs.writeFileSync(tmp, html);
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + tmp); await p.waitForTimeout(2500);
  for (const h of await p.$$('button')) { const t = await h.evaluate(el => el.offsetParent ? (el.textContent || '') : ''); if (/Los geht/.test(t)) { await h.click(); break; } }
  await p.evaluate(() => window.WW.game.newWorld({ seed: 'perf-welt', size: 'large', populate: 0 })); await p.waitForTimeout(5000);
  // Mitte einer großen Wiese/Landfläche suchen, Kamera dorthin, Zoom 3, Tempo 1
  const spot = await p.evaluate(() => { const g = window.WW.game, st = g.sim.state, W = st.W, H = st.H, T = window.WW.T; let best = null;
    for (let y = 12; y < H - 12 && !best; y += 3) for (let x = 12; x < W - 12 && !best; x += 3) { let ok = true; for (let dy = -6; dy <= 6 && ok; dy++) for (let dx = -6; dx <= 6; dx++) if (st.terrain[(y + dy) * W + x + dx] !== T.GRASS) { ok = false; break; } if (ok) best = { x, y }; }
    if (!best) best = { x: (W / 2) | 0, y: (H / 2) | 0 };
    g.cam.zoom = 3; g.cam.x = best.x * 8 + 4; g.cam.y = best.y * 8 + 4; g.cam.clamp(); return best; });
  const px = async () => p.evaluate(() => { const cv = window.WW.game.renderer.canvas; const d = cv.getContext('2d').getImageData((cv.width / 2) | 0, (cv.height / 2) | 0, 1, 1).data; return [d[0], d[1], d[2]]; });
  const isBlue = (c) => c[2] > c[0] + 25 && c[2] > 110; const isGreen = (c) => c[1] > c[2] + 20 && c[1] > c[0];
  let ok = true; const say = (name, cond, extra) => { console.log((cond ? '  ok      ' : '  FEHLER  ') + name + (extra ? '  ' + extra : '')); if (!cond) ok = false; };
  await p.waitForTimeout(1500);
  const c0 = await px(); say('Ausgangslage: Wiese in der Bildmitte', isGreen(c0), JSON.stringify(c0));
  // 1. Wasser malen bei ruhender Kamera
  await p.evaluate((s) => window.WW.game.sim.actions.paintTerrain(s.x, s.y, 3, window.WW.T.WATER), spot);
  await p.waitForTimeout(900);
  const c1 = await px(); say('gemaltes Wasser erscheint bei ruhender Kamera', isBlue(c1), JSON.stringify(c1));
  // 2. wegschwenken (Block aus dem Bild), dort Gras zurückmalen, zurückkommen
  await p.evaluate((s) => { const g = window.WW.game; g.cam.x = Math.max(200, s.x * 8 - 1400); g.cam.y = Math.max(200, s.y * 8 - 900); g.cam.clamp(); }, spot);
  await p.waitForTimeout(2600);
  await p.evaluate((s) => window.WW.game.sim.actions.paintTerrain(s.x, s.y, 3, window.WW.T.GRASS), spot);
  await p.waitForTimeout(800);
  await p.evaluate((s) => { const g = window.WW.game; g.cam.x = s.x * 8 + 4; g.cam.y = s.y * 8 + 4; g.cam.clamp(); }, spot);
  await p.waitForTimeout(1200);
  const c2 = await px(); say('außerhalb des Bildes gemalte Wiese ist nach dem Zurückschwenken da', isGreen(c2), JSON.stringify(c2));
  // 3. Kamera um eine halbe Bildbreite verschieben: Bildmitte muss sofort das neue Gelände zeigen (kein altes Standbild)
  await p.evaluate((s) => window.WW.game.sim.actions.paintTerrain(s.x + 25, s.y, 3, window.WW.T.WATER), spot);
  await p.waitForTimeout(700);
  await p.evaluate((s) => { const g = window.WW.game; g.cam.x = (s.x + 25) * 8 + 4; g.cam.clamp(); }, spot);
  await p.waitForTimeout(250);
  const c3 = await px(); say('nach dem Verschieben zeigt die Bildmitte das dort gemalte Wasser', isBlue(c3), JSON.stringify(c3));
  // 4. Siedler setzen: Figuren erscheinen über dem Standbild
  const n0 = await p.evaluate((s) => { const g = window.WW.game; g.cam.x = s.x * 8 + 4; g.cam.clamp(); const r = g.sim.actions.spawnSettlers(s.x, s.y + 3, 8, 'monarchy'); return { r: !!r, units: g.sim.state.units.length }; }, spot);
  await p.waitForTimeout(1500);
  say('Siedler gesetzt (' + n0.units + ' Figuren), keine Fehler', n0.units > 0 && errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.screenshot({ path: path.join(S, 'qa/paintcheck.png') });
  console.log(ok ? 'BESTANDEN' : 'FEHLGESCHLAGEN');
  await b.close();
})();
