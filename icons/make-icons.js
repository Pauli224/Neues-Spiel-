// Erzeugt icons/*.png aus den Pixel-Sprites. Aufruf: node icons/make-icons.js (braucht Playwright + Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + require('path').join(__dirname, '..', 'index.html'));
  await p.waitForFunction(() => window.WW && WW.Sprites);
  const out = await p.evaluate(() => {
    const S = WW.Sprites; S.init();
    // Szene 40×40 Logikpixel: Wiese mit Wasserrand, Burg, Fähnchen
    const L = 40, c = document.createElement('canvas'); c.width = L; c.height = L;
    const g = c.getContext('2d');
    const T = WW.T, ter = [];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) ter.push((y === 4) ? T.SHALLOW : T.GRASS);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      const at = (xx, yy) => (xx < 0 || yy < 0 || xx > 4 || yy > 4) ? -1 : ter[yy * 5 + xx];
      S.drawGround(g, x * 8, y * 8, at(x, y), 0, at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y));
    }
    S.draw(g, 's_center_monarchy', 8, 13, { team: 0 });
    S.draw(g, 'd_tree_0', 0, 22); S.draw(g, 'd_tree_1', 33, 20);
    S.draw(g, 'u_human_farmer_0', 4, 26, { team: 0 });
    const res = {};
    for (const [name, size, pad] of [['icon-512', 512, 0], ['icon-192', 192, 0], ['apple-touch-icon', 180, 0], ['icon-maskable-512', 512, 0.1]]) {
      const o = document.createElement('canvas'); o.width = size; o.height = size;
      const x = o.getContext('2d'); x.imageSmoothingEnabled = false;
      x.fillStyle = '#4fb3d9'; x.fillRect(0, 0, size, size);
      const inner = Math.round(size * (1 - pad * 2));
      x.drawImage(c, 0, 0, L, L, Math.round(size * pad), Math.round(size * pad), inner, inner);
      res[name] = o.toDataURL('image/png').split(',')[1];
    }
    return res;
  });
  for (const k in out) fs.writeFileSync(require('path').join(__dirname, k) + '.png', Buffer.from(out[k], 'base64'));
  await b.close();
})();
