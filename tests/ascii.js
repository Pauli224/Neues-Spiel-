// ASCII-Ansicht eines Kartenausschnitts (für Tests und zum Ansehen).
'use strict';
const CH = { center: 'C', house: 'h', field: ',', lumber: 'L', quarry: 'Q', barracks: 'B', market: 'M', monument: 'D', wall: '#', gate: 'G', tower: 'T', ruin: 'x' };
function render(sim, x0, y0, w, h, opts) {
  const WW = globalThis.WW, st = sim.state, W = st.W;
  const lines = [];
  for (let y = Math.max(0, y0); y < Math.min(st.H, y0 + h); y++) {
    let line = '';
    for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
      const i = y * W + x;
      const s = sim._structs.get(st.structAt[i]);
      let c;
      if (s) {
        c = CH[s.type] || '?';
        if (!s.built && s.type !== 'field') c = (s.type === 'wall' || s.type === 'gate' || s.type === 'tower') ? (s.type === 'gate' ? 'g' : '+') : c.toLowerCase() === c ? '~' : c.toLowerCase();
        if (s.type === 'house' && s.built) c = s.level >= 2 ? 'H' : 'h';
        if (s.type === 'house' && !s.built) c = 'o';
      } else {
        const t = st.terrain[i], LUT = WW.TERRAIN_LUT;
        if (LUT.water[t]) c = t === WW.T.RIVER ? '=' : '~';
        else if (LUT.walk[t] <= 0) c = '^';
        else if (LUT.wood[t]) c = '"';
        else if (st.inRing[i] !== -1) c = ' ';
        else c = '.';
      }
      line += c;
    }
    lines.push(line);
  }
  return lines.join('\n');
}
function cityView(sim, city, pad) {
  pad = pad || 12;
  let minX = city.cx, maxX = city.cx, minY = city.cy, maxY = city.cy;
  for (const s of sim.state.structs) {
    if (s.dead || s.cityId !== city.id) continue;
    minX = Math.min(minX, s.x); minY = Math.min(minY, s.y); maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h);
  }
  const x0 = Math.max(minX - 2, city.cx - pad - 8), y0 = Math.max(minY - 2, city.cy - pad - 6);
  const x1 = Math.min(maxX + 2, city.cx + pad + 8), y1 = Math.min(maxY + 2, city.cy + pad + 6);
  return render(sim, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}
module.exports = { render: render, cityView: cityView, LEGEND: 'C Zentrum, h/H Haus, o Hausbaustelle, , Feld, L Holzfäller, Q Steinbruch, B Kaserne, M Markt, D Denkmal, # Mauer, + Mauerbaustelle, T Turm, G/g Tor, x Ruine, ~ Wasser, = Fluss, ^ Berg, " Wald, Leerzeichen = innen' };
