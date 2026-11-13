// Wuselwelt – gestellte Beispielszene für die Sprite-Vorschau (nur Werkzeug, nicht im Spiel).
// Baut eine 60×40-Karte mit Küste, Fluss, Wald, Hügeln, Gebirge, Wüste, Nadelwald und einer
// ummauerten Stadt und zeichnet sie so, wie es der Renderer tun soll:
// Boden (drawGround) → Deko, Bauwerke, Figuren nach Fußlinie sortiert.
(function (WW) { 'use strict';
  var S = WW.Sprites, T = WW.T;
  var W = 60, H = 40;

  function h2(x, y, s) { return S.lib.hash(x, y, s); }
  function vn(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, s) { return vn(x, y, s) * 0.6 + vn(x * 2.1, y * 2.1, s + 1) * 0.3 + vn(x * 4.3, y * 4.3, s + 2) * 0.1; }

  function buildTerrain() {
    var ter = new Uint8Array(W * H), vari = new Uint8Array(W * H);
    var x, y, i;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = y * W + x;
      vari[i] = Math.floor(h2(x, y, 999) * 256);
      // Küste: Meer im Westen und Südwesten
      var coast = 11 + Math.sin(y * 0.22) * 2.5 + (fbm(x * 0.15, y * 0.15, 3) - 0.5) * 6 + Math.max(0, (y - 26)) * 0.55;
      var d = x - coast;
      var t;
      if (d < -7) t = T.DEEP; else if (d < -3) t = T.WATER; else if (d < -1) t = T.SHALLOW; else if (d < 1) t = T.SAND; else t = T.GRASS;
      if (t === T.GRASS) {
        // Gebirge im Nordosten
        var mx = (x - 51) / 13, my = (y - 7) / 10, m = 1 - Math.sqrt(mx * mx + my * my) + (fbm(x * 0.2, y * 0.2, 7) - 0.5) * 0.5;
        var mx2 = (x - 40) / 7, my2 = (y - 1) / 4; m = Math.max(m, 0.85 - Math.sqrt(mx2 * mx2 + my2 * my2) + (fbm(x * 0.2, y * 0.2, 8) - 0.5) * 0.4);
        if (m > 0.78) t = T.SNOW; else if (m > 0.45) t = T.MOUNTAIN; else if (m > 0.22) t = T.HILL;
        // Nadelwald im Norden, Mitte
        var tg = 1 - Math.hypot((x - 30) / 8, (y - 3) / 4) + (fbm(x * 0.3, y * 0.3, 9) - 0.5) * 0.6;
        if (t === T.GRASS && tg > 0.3) t = T.TAIGA;
        // Laubwald im Nordwesten
        var fo = 1 - Math.hypot((x - 21) / 6, (y - 9) / 5.5) + (fbm(x * 0.3, y * 0.3, 11) - 0.5) * 0.7;
        if (t === T.GRASS && fo > 0.25) t = T.FOREST;
        // Wüste im Südosten mit Savannensaum
        var de = 1 - Math.hypot((x - 55) / 9, (y - 36) / 7) + (fbm(x * 0.25, y * 0.25, 13) - 0.5) * 0.5;
        if (t === T.GRASS && de > 0.35) t = T.DESERT; else if (t === T.GRASS && de > 0.12) t = T.SAVANNA;
        // Blumenwiese
        var fl = 1 - Math.hypot((x - 24) / 3.5, (y - 31) / 2.5) + (fbm(x * 0.5, y * 0.5, 15) - 0.5) * 0.6;
        if (t === T.GRASS && fl > 0.3) t = T.FLOWERS;
        // kleines Wäldchen im Süden
        var f2 = 1 - Math.hypot((x - 47) / 3.2, (y - 27) / 2.6) + (fbm(x * 0.4, y * 0.4, 17) - 0.5) * 0.6;
        if (t === T.GRASS && f2 > 0.3) t = T.FOREST;
        // kleiner See im Osten
        var lk = Math.hypot((x - 53) / 3.6, (y - 22) / 2.6) + (fbm(x * 0.5, y * 0.5, 19) - 0.5) * 0.5;
        if (lk < 0.55) t = T.WATER; else if (lk < 0.95) t = T.SHALLOW; else if (lk < 1.25 && t === T.GRASS) t = T.SAND;
      }
      ter[i] = t;
    }
    // Fluss: vom Gebirge zum Meer, 4-zusammenhängend
    var pts = [[45, 11], [41, 12], [37, 11], [32, 12], [27, 14], [25, 18], [24, 22], [21, 25], [17, 26], [12, 26]];
    var px = pts[0][0], py = pts[0][1];
    for (var k = 1; k < pts.length; k++) {
      var tx = pts[k][0], ty = pts[k][1];
      while (px !== tx || py !== ty) {
        var dx = tx - px, dy = ty - py;
        if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) px += dx > 0 ? 1 : -1; else py += dy > 0 ? 1 : -1;
        i = py * W + px;
        var cur = ter[i];
        if (cur === T.DEEP || cur === T.WATER || cur === T.SHALLOW) { px = tx; py = ty; k = pts.length; break; }
        ter[i] = T.RIVER;
      }
    }
    i = 11 * W + 45; ter[i] = T.RIVER;
    // Stadtfläche frei machen (Wiese)
    for (y = 15; y <= 33; y++) for (x = 27; x <= 46; x++) { i = y * W + x; if (ter[i] !== T.RIVER) ter[i] = (ter[i] === T.FLOWERS ? T.FLOWERS : T.GRASS); }
    return { ter: ter, vari: vari };
  }

  // Stadt: Mauerring, Tore, Türme, Gebäude, Felder, Figuren
  function buildCity() {
    var items = [];
    var X0 = 28, Y0 = 15, X1 = 45, Y1 = 29; // Mauerring (Rand)
    var wall = {};
    function setW(x, y, c) { wall[x + ',' + y] = c; }
    for (var x = X0; x <= X1; x++) { setW(x, Y0, '#'); setW(x, Y1, '#'); }
    for (var y = Y0; y <= Y1; y++) { setW(X0, y, '#'); setW(X1, y, '#'); }
    [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1], [X0 + 5, Y0], [X1 - 5, Y0], [X0 + 5, Y1], [X1 - 5, Y1], [X0, Y0 + 4], [X1, Y0 + 4], [X0, Y1 - 4], [X1, Y1 - 4]]
      .forEach(function (p) { setW(p[0], p[1], 'T'); });
    setW(36, Y0, 'G'); setW(36, Y1, 'G'); setW(X0, 22, 'G'); setW(X1, 22, 'G');
    function isW(x, y) { return !!wall[x + ',' + y]; }
    Object.keys(wall).forEach(function (k) {
      var p = k.split(','), x = +p[0], y = +p[1], c = wall[k];
      var m = (isW(x, y - 1) ? 1 : 0) | (isW(x + 1, y) ? 2 : 0) | (isW(x, y + 1) ? 4 : 0) | (isW(x - 1, y) ? 8 : 0);
      var horiz = isW(x - 1, y) || isW(x + 1, y);
      var key = c === 'T' ? S.towerKey('monarchy', 2) : (c === 'G' ? S.gateKey('monarchy', 2, horiz ? 'h' : 'v') : S.wallKey('monarchy', 2, m));
      items.push({ key: key, x: x, y: y, team: 0, kind: 'wall' });
    });
    function b(key, x, y, opts) { var o = { key: key, x: x, y: y, team: 0 }; for (var k in opts) o[k] = opts[k]; items.push(o); }
    // Zentrum 3×3 am Hauptplatz
    b('s_center_monarchy', 35, 18);
    // Häuser 2×2 mit Gassen
    [[2, 29, 16, 0], [1, 32, 16, 3], [3, 39, 16, 0], [2, 42, 16, 3],
     [1, 29, 19, 3], [2, 32, 19, 0], [3, 42, 19, 3],
     [2, 29, 23, 3], [3, 39, 23, 0], [1, 42, 23, 0],
     [1, 29, 26, 3], [2, 32, 26, 0], [2, 39, 26, 3], [1, 42, 26, 3]
    ].forEach(function (h) { b(S.houseKey('monarchy', h[0], h[3]), h[1], h[2]); });
    b('s_market', 39, 19);
    b('s_barracks', 32, 23);
    b('s_monument_monarchy', 34, 23);
    // Felder vor dem Südtor
    for (var fx = 30; fx <= 34; fx++) for (var fy = 31; fy <= 33; fy++) b('s_field_' + (fy === 33 ? 2 : 3), fx, fy);
    for (fx = 38; fx <= 42; fx++) for (fy = 31; fy <= 32; fy++) b('s_field_' + (fx < 40 ? 1 : 0), fx, fy);
    b('s_lumber', 24, 14);
    b('s_quarry', 46, 14);
    b('s_site_2', 24, 18);
    // Figuren
    var U = [
      ['u_human_farmer_0', 31.2, 31.4], ['u_human_farmer_1', 33.6, 32.5], ['u_human_farmer_0', 40.3, 31.6, true],
      ['u_human_lumberjack_1', 22.4, 13.6], ['u_human_soldier_0', 37.1, 29.9], ['u_human_soldier_1', 36.6, 14.2, true],
      ['u_human_child_0', 35.2, 25.3], ['u_human_child_1', 36.4, 25.1, true], ['u_human_leader_monarchy_0', 38.2, 21.6],
      ['u_human_builder_0', 26.2, 20.3], ['u_human_miner_1', 48.4, 15.4], ['u_human_trader_0', 31.5, 22.2],
      ['u_human_settler_1', 25.2, 28.3], ['a_sheep_0', 20.5, 19.2], ['a_sheep_1', 21.6, 20.1, true], ['a_sheep_0', 19.4, 21.3],
      ['u_human_farmer_1', 37.4, 22.1, true], ['u_human_builder_1', 44.2, 21.8]
    ];
    U.forEach(function (u) { items.push({ key: u[0], x: u[1], y: u[2], team: 0, flip: !!u[3], unit: true }); });
    return { items: items, wall: wall };
  }

  // Trampelpfade als Kachelketten (4-zusammenhängend)
  var PATHS = [
    [[36, 30], [36, 35]], [[29, 30], [44, 30]],
    [[27, 22], [25, 22], [25, 16]],
    [[36, 14], [36, 13], [33, 13]],
    [[46, 22], [48, 22], [48, 16]],
    [[36, 16], [36, 17]], [[36, 21], [36, 28]], [[29, 22], [44, 22]], [[29, 25], [44, 25]], [[29, 18], [34, 18]], [[38, 18], [44, 18]]
  ];
  function pathSet() {
    var set = {};
    PATHS.forEach(function (pl) {
      for (var k = 1; k < pl.length; k++) {
        var x = pl[k - 1][0], y = pl[k - 1][1], tx = pl[k][0], ty = pl[k][1];
        set[x + ',' + y] = 1;
        while (x !== tx || y !== ty) { if (x !== tx) x += tx > x ? 1 : -1; else y += ty > y ? 1 : -1; set[x + ',' + y] = 1; }
      }
    });
    return set;
  }
  function drawPaths(ctx, set, extra) {
    function has(x, y) { return set[x + ',' + y] || (extra && extra[x + ',' + y]); }
    Object.keys(set).forEach(function (k) {
      var p = k.split(','), x = +p[0], y = +p[1];
      var m = (has(x, y - 1) ? 1 : 0) | (has(x + 1, y) ? 2 : 0) | (has(x, y + 1) ? 4 : 0) | (has(x - 1, y) ? 8 : 0);
      S.drawPath(ctx, x * 8, y * 8, m);
    });
  }

  function sortY(it) {
    if (it.unit) return (it.y + 1) * 8;
    var inf = S.info(it.key);
    return (it.y + (inf ? inf.fh : 1)) * 8 + (it.dy || 0);
  }

  // Szene in ein Canvas zeichnen (Logikpixel); scale = Bildschirmpixel je Logikpixel
  function render(canvas, scale) {
    S.init();
    var tr = buildTerrain(), ter = tr.ter, vari = tr.vari;
    var city = buildCity();
    canvas.width = W * 8 * scale; canvas.height = H * 8 * scale;
    var ctx = canvas.getContext('2d');
    // Bodenebene in eigenes Offscreen-Canvas (wie im Renderer), dann skaliert kopieren
    var ground = document.createElement('canvas'); ground.width = W * 8; ground.height = H * 8;
    var gx = ground.getContext('2d');
    S.drawGroundMap(gx, ter, vari, W, H);
    var gatesAt = {}; city.items.forEach(function (it) { if (/gate/.test(it.key)) gatesAt[it.x + ',' + it.y] = 1; });
    var ps = pathSet();
    drawPaths(gx, ps, gatesAt);
    var top = document.createElement('canvas'); top.width = W * 8; top.height = H * 8;
    var tx = top.getContext('2d');
    tx.drawImage(ground, 0, 0);
    // belegte Kacheln: keine Deko
    var occ = {};
    city.items.forEach(function (it) {
      if (it.unit) return;
      var inf = S.info(it.key); if (!inf) return;
      for (var j = 0; j < inf.fh; j++) for (var i = 0; i < inf.fw; i++) occ[(it.x + i) + ',' + (it.y + j)] = 1;
    });
    var items = city.items.slice();
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (occ[x + ',' + y] || ps[x + ',' + y]) continue;
      // Stadtinneres frei halten
      if (x >= 28 && x <= 45 && y >= 15 && y <= 29) continue;
      var d = S.decorFor(ter[y * W + x], vari[y * W + x]);
      if (d) items.push({ key: d.key, x: x, y: y, dx: d.dx, dy: d.dy, decor: true });
    }
    items.forEach(function (it) { it._s = sortY(it); });
    items.sort(function (a, b) { return a._s - b._s || a.x - b.x; });
    items.forEach(function (it) {
      if (!S.has(it.key)) { console.warn('fehlt', it.key); return; }
      S.draw(tx, it.key, Math.round(it.x * 8) + (it.dx || 0), Math.round(it.y * 8) + (it.dy || 0), { team: it.team || 0, flip: it.flip });
    });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(top, 0, 0, canvas.width, canvas.height);
    return { ter: ter, vari: vari };
  }


  // ------------------------------------------------------------------ Musterstädte je Regierung
  // Eine kleine ummauerte Stadt (18×16 Kacheln) im Stil der Regierung.
  var TOWN_EXTRA = {
    tribe:     { lvl: 1, towers: 'corners', special: ['s_house_rustic_2_a', 's_lumber'], fields: 2 },
    monarchy:  { lvl: 2, towers: 'corners+mid', special: ['s_barracks', 's_market'], fields: 1 },
    democracy: { lvl: 2, towers: 'corners', special: ['s_market', null], fields: 1 },
    fascism:   { lvl: 3, towers: 'many', special: ['s_barracks', 's_barracks'], fields: 1 },
    communism: { lvl: 2, towers: 'corners', special: [null, null], fields: 3 },
    theocracy: { lvl: 2, towers: 'corners+mid', special: ['s_monument_theocracy', 's_monument_theocracy'], fields: 1 },
    republic:  { lvl: 2, towers: 'corners+mid', special: ['s_market', 's_market'], fields: 1 },
    anarchy:   { lvl: 1, towers: 'none', special: [null, null], fields: 2 }
  };
  function townItems(gov, ox, oy, team) {
    var E = TOWN_EXTRA[gov], items = [], wall = {}, lvl = E.lvl;
    var X0 = 1, X1 = 16, Y0 = 2, Y1 = 12;
    function setW(x, y, c) { wall[x + ',' + y] = c; }
    for (var x = X0; x <= X1; x++) { setW(x, Y0, '#'); setW(x, Y1, '#'); }
    for (var y = Y0; y <= Y1; y++) { setW(X0, y, '#'); setW(X1, y, '#'); }
    var tw = [];
    if (E.towers !== 'none') tw = [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]];
    if (E.towers === 'corners+mid' || E.towers === 'many') tw = tw.concat([[X0, 7], [X1, 7], [5, Y0], [12, Y0], [5, Y1], [12, Y1]]);
    if (E.towers === 'many') tw = tw.concat([[X0, 4], [X1, 4], [X0, 10], [X1, 10], [3, Y0], [14, Y0], [3, Y1], [14, Y1]]);
    tw.forEach(function (p) { setW(p[0], p[1], 'T'); });
    var gates = [[8, Y0], [8, Y1], [X0, 7], [X1, 7]];
    gates.forEach(function (p) { setW(p[0], p[1], 'G'); });
    function isW(x, y) { return !!wall[x + ',' + y]; }
    Object.keys(wall).forEach(function (k) {
      var p = k.split(','), x = +p[0], y = +p[1], c = wall[k];
      var m = (isW(x, y - 1) ? 1 : 0) | (isW(x + 1, y) ? 2 : 0) | (isW(x, y + 1) ? 4 : 0) | (isW(x - 1, y) ? 8 : 0);
      var horiz = isW(x - 1, y) || isW(x + 1, y);
      var key;
      if (c === 'G') key = gov === 'anarchy' ? null : S.gateKey(gov, lvl, horiz ? 'h' : 'v');
      else if (c === 'T') key = S.towerKey(gov, lvl);
      else key = S.wallKey(gov, lvl, m);
      if (gov === 'tribe' && c === 'T') key = 's_tower_tribe';
      if (key) items.push({ key: key, x: ox + x, y: oy + y, team: team });
    });
    function b(key, x, y) { if (key) items.push({ key: key, x: ox + x, y: oy + y, team: team }); }
    b('s_center_' + gov, 7, 4);
    var hv = 0;
    [[2, 3, 2], [11, 3, 2], [14, 3, 3], [2, 9, 3], [5, 9, 2], [11, 9, 1], [14, 9, 2], [2, 6, 1]].forEach(function (h) { b(S.houseKey(gov, h[2], hv++), h[0], h[1]); });
    b(E.special[0], 11, 6);
    b(E.special[1] === 's_monument_theocracy' ? 's_monument_theocracy' : E.special[1], E.special[1] && /monument/.test(E.special[1]) ? 5 : 14, 6);
    b('s_monument_' + gov, 6, 8);
    // Felder vor dem Südtor
    for (var fx = 3; fx <= 6; fx++) for (var fy = 13; fy < 13 + E.fields && fy < 16; fy++) b('s_field_' + (fy === 13 ? 3 : 2), fx, fy);
    for (fx = 10; fx <= 14; fx++) for (fy = 13; fy < 13 + E.fields && fy < 16; fy++) b('s_field_' + (fx & 1 ? 1 : 3), fx, fy);
    // Anführer und ein paar Leute
    var lead = gov === 'anarchy' ? 'u_human_punk_0' : 'u_human_leader_' + gov + '_0';
    items.push({ key: lead, x: ox + 10.2, y: oy + 7.2, team: team, unit: true });
    items.push({ key: gov === 'fascism' || gov === 'monarchy' ? 'u_human_soldier_0' : 'u_human_farmer_0', x: ox + 8.1, y: oy + 13.4, team: team, unit: true });
    items.push({ key: 'u_human_child_1', x: ox + 4.4, y: oy + 7.6, team: team, unit: true });
    if (gov === 'fascism') for (var k = 0; k < 4; k++) items.push({ key: 'u_human_soldier_' + (k & 1), x: ox + 4 + k * 1.1, y: oy + 7.4, team: team, unit: true });
    if (gov === 'republic') items.push({ key: 'u_human_trader_0', x: ox + 12.5, y: oy + 13.5, team: team, unit: true });
    if (gov === 'democracy') items.push({ key: 'u_human_trader_1', x: ox + 9.5, y: oy + 2.6, team: team, unit: true });
    return items;
  }
  var GOVS8 = ['tribe', 'monarchy', 'democracy', 'fascism', 'communism', 'theocracy', 'republic', 'anarchy'];
  function renderTowns(canvas, scale) {
    S.init();
    var TW = 18, TH = 16, W2 = TW * 4, H2 = TH * 2;
    var ter = new Uint8Array(W2 * H2), vari = new Uint8Array(W2 * H2);
    for (var i = 0; i < ter.length; i++) { ter[i] = T.GRASS; vari[i] = Math.floor(h2(i % W2, Math.floor(i / W2), 77) * 256); }
    var ground = document.createElement('canvas'); ground.width = W2 * 8; ground.height = H2 * 8;
    var gx = ground.getContext('2d');
    S.drawGroundMap(gx, ter, vari, W2, H2);
    var items = [];
    GOVS8.forEach(function (gov, n) { items = items.concat(townItems(gov, (n % 4) * TW, Math.floor(n / 4) * TH, [9, 5, 4, 3, 0, 2, 1, 7][n])); });
    if (S.drawPath) GOVS8.forEach(function (gov, n) {
      var ox = (n % 4) * TW, oy = Math.floor(n / 4) * TH;
      for (var y = 0; y <= 1; y++) S.drawPath(gx, (ox + 8) * 8, (oy + y) * 8, 5);
      for (y = 13; y <= 15; y++) S.drawPath(gx, (ox + 8) * 8, (oy + y) * 8, 5);
      S.drawPath(gx, (ox + 0) * 8, (oy + 7) * 8, 10); S.drawPath(gx, (ox + 17) * 8, (oy + 7) * 8, 10);
    });
    var top = document.createElement('canvas'); top.width = W2 * 8; top.height = H2 * 8;
    var tx = top.getContext('2d'); tx.drawImage(ground, 0, 0);
    items.forEach(function (it) { it._s = sortY(it); });
    items.sort(function (a, b) { return a._s - b._s || a.x - b.x; });
    items.forEach(function (it) {
      if (!S.has(it.key)) { console.warn('fehlt', it.key); return; }
      S.draw(tx, it.key, Math.round(it.x * 8), Math.round(it.y * 8), { team: it.team || 0, flip: it.flip });
    });
    canvas.width = W2 * 8 * scale; canvas.height = H2 * 8 * scale;
    var ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(top, 0, 0, canvas.width, canvas.height);
  }

  WW.SpriteScene = { render: render, renderTowns: renderTowns, W: W, H: H, buildTerrain: buildTerrain };
})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
