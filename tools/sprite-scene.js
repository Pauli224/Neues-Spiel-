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


  // ------------------------------------------------------------------ Zerstörung: Flugzeuge über einer Stadt, Pilzwolke, Krater, Icons
  function renderDestruction(canvas, scale) {
    S.init();
    var W2 = 58, H2 = 26;
    var ter = new Uint8Array(W2 * H2), vari = new Uint8Array(W2 * H2);
    for (var i = 0; i < ter.length; i++) { var x = i % W2; ter[i] = x >= 18 && x < 20 ? T.SAND : (x >= 20 ? T.ASH : T.GRASS); vari[i] = Math.floor(h2(x, Math.floor(i / W2), 78) * 256); }
    for (var yy = 0; yy < H2; yy++) for (var xx = 46; xx < W2; xx++) ter[yy * W2 + xx] = T.GRASS;
    var top = document.createElement('canvas'); top.width = W2 * 8; top.height = H2 * 8;
    var tx = top.getContext('2d');
    S.drawGroundMap(tx, ter, vari, W2, H2);
    // Krater (Bodenüberlagerungen)
    S.draw(tx, 't_crater_l', 47 * 8, 1 * 8); S.draw(tx, 't_crater_m', 53 * 8, 2 * 8); S.draw(tx, 't_crater', 53 * 8, 6 * 8);
    for (var fy = 8; fy < 12; fy++) for (var fx2 = 47; fx2 < 52; fx2++) { S.draw(tx, 't_scorched', fx2 * 8, fy * 8); S.draw(tx, 't_fallout', fx2 * 8, fy * 8); S.draw(tx, 'fx_fallout', fx2 * 8, fy * 8); }
    // Stadt
    var items = townItems('monarchy', 0, 2, 5);
    items.push({ key: 's_ruin_2', x: 11, y: 11, team: 0 });
    items.forEach(function (it) { it._s = sortY(it); });
    items.sort(function (a, b) { return a._s - b._s || a.x - b.x; });
    items.forEach(function (it) { if (S.has(it.key)) S.draw(tx, it.key, Math.round(it.x * 8), Math.round(it.y * 8), { team: it.team || 0, flip: it.flip }); });
    // Einschläge in der Stadt
    S.draw(tx, 't_crater', 4 * 8, 11 * 8);
    S.draw(tx, 'fx_explosion_l_1', 5 * 8, 10 * 8); S.draw(tx, 'fx_explosion_2', 13 * 8, 6 * 8); S.draw(tx, 'fx_fire_0', 12 * 8, 11 * 8);
    // Kanonenflugzeug mit Schatten, Leuchtspur nach unten links
    S.draw(tx, 'fx_gunship_shadow', 11 * 8, 5 * 8 + 4); S.draw(tx, 'fx_gunship', 8 * 8, 1 * 8);
    for (var k = 0; k < 4; k++) S.draw(tx, 'fx_tracer', 7 * 8 - k * 5, 3 * 8 + k * 6);
    // Bomber mit fallenden Bomben
    S.draw(tx, 'fx_bomber_shadow', 4 * 8, 19 * 8); S.draw(tx, 'fx_bomber', 1 * 8, 15 * 8);
    S.draw(tx, 'fx_bombdrop', 2 * 8, 18 * 8); S.draw(tx, 'fx_bombdrop', 4 * 8, 20 * 8);
    // Rakete mit Rauchspur
    S.draw(tx, 'fx_rocket', 14 * 8, 20 * 8); S.draw(tx, 'fx_trail_0', 13 * 8, 20 * 8); S.draw(tx, 'fx_trail_1', 12 * 8, 20 * 8);
    // Pilzwolken-Abfolge auf dem Aschefeld
    for (var m = 0; m < 6; m++) S.draw(tx, 'fx_mushroom_' + m, (21 + m * 4) * 8 - 8, 11 * 8);
    // Laser, schwarzes Loch, Blitz, Druckwelle, große Explosionen
    for (var ly = 0; ly < 7; ly++) S.draw(tx, 'fx_laser', 22 * 8, (13 + ly) * 8);
    S.draw(tx, 'fx_laser_hit_0', 22 * 8, 20 * 8);
    S.draw(tx, 'fx_blackhole_0', 27 * 8, 17 * 8); S.draw(tx, 'fx_blackhole_2', 31 * 8, 17 * 8);
    S.draw(tx, 'fx_shockwave', 36 * 8, 17 * 8); S.draw(tx, 'fx_flash', 36 * 8, 17 * 8);
    for (var e = 0; e < 4; e++) S.draw(tx, 'fx_explosion_l_' + e, (40 + e * 4) * 8 - 8, 22 * 8);
    for (e = 0; e < 4; e++) S.draw(tx, 'fx_explosion_' + e, (27 + e * 3) * 8, 22 * 8);
    // Icons der Kategorie als Leiste
    var keys = ['i_cat_destruction', 'i_bomb', 'i_clusterbomb', 'i_napalm', 'i_rocket', 'i_bomber', 'i_gunship', 'i_nuke', 'i_tsar', 'i_orbitallaser', 'i_blackhole'];
    canvas.width = W2 * 8 * scale; canvas.height = H2 * 8 * scale + 64;
    var ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1d3b47'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    keys.forEach(function (k, n) { ctx.drawImage(S.iconCanvas(k, 3), 8 + n * 56, 8); });
    ctx.drawImage(top, 0, 64, W2 * 8 * scale, H2 * 8 * scale);
  }


  // ------------------------------------------------------------------ Vom Lager zur Stadt: drei Siedlungen nebeneinander
  function renderStages(canvas, scale) {
    S.init();
    var TW = 16, TH = 14, W2 = TW * 3, H2 = TH;
    var ter = new Uint8Array(W2 * H2), vari = new Uint8Array(W2 * H2);
    for (var i = 0; i < ter.length; i++) { ter[i] = T.GRASS; vari[i] = Math.floor(h2(i % W2, Math.floor(i / W2), 79) * 256); }
    var top = document.createElement('canvas'); top.width = W2 * 8; top.height = H2 * 8;
    var tx = top.getContext('2d');
    S.drawGroundMap(tx, ter, vari, W2, H2);
    var items = [], team = 5;
    function b(key, x, y) { items.push({ key: key, x: x, y: y, team: team }); }
    function u(key, x, y, f) { items.push({ key: key, x: x, y: y, team: team, unit: true, flip: f }); }
    // 1) Zeltlager
    b(S.campKey(0, 0), 6, 5);
    [[2, 2, 0], [10, 2, 1], [2, 9, 2], [10, 9, 3], [6, 10, 1]].forEach(function (t) { b(S.tentKey(t[2]), t[0], t[1]); });
    b('s_deco_woodpile', 13, 6); b('s_deco_hay', 1, 6);
    u('u_human_settler_0', 7.2, 8.6); u('u_human_settler_1', 9.4, 8.4, true); u('u_human_child_0', 5.2, 9.0); u('u_human_builder_0', 12.3, 7.5, true);
    // 2) Dorf mit Halle, Hütten, Feldern
    var ox = TW;
    b(S.hallKey(0), ox + 6, 4);
    [[ox + 2, 2, 0], [ox + 11, 2, 1], [ox + 2, 7, 2], [ox + 11, 7, 3], [ox + 2, 10, 5]].forEach(function (h, k) { b(S.houseKey('tribe', 1, h[2]), h[0], h[1]); });
    b(S.tentKey(2), ox + 11, 10);
    for (var fx = ox + 6; fx <= ox + 9; fx++) for (var fy = 10; fy <= 12; fy++) b('s_field_' + (fy === 12 ? 2 : 3), fx, fy);
    b('s_deco_well', ox + 8, 8); b('s_deco_garden_0', ox + 5, 9); b('s_deco_cart', ox + 14, 5);
    u('u_human_farmer_0', ox + 7.3, 11.2); u('u_human_lumberjack_1', ox + 13.4, 9.3); u('u_human_child_1', ox + 9.4, 8.6, true);
    // 3) Stadt mit Regierungssitz, gemischten Häusern, Deko
    ox = TW * 2;
    b('s_center_monarchy', ox + 6, 4);
    var hv = 0;
    [[ox + 1, 1, 2], [ox + 4, 1, 3], [ox + 10, 1, 2], [ox + 13, 1, 3], [ox + 1, 4, 3], [ox + 13, 4, 2], [ox + 1, 8, 2], [ox + 4, 8, 1], [ox + 10, 8, 3], [ox + 13, 8, 2], [ox + 1, 11, 1], [ox + 13, 11, 3]]
      .forEach(function (h) { b(S.houseKey('monarchy', h[2], hv++), h[0], h[1]); });
    b('s_market', ox + 10, 4); b('s_deco_well', ox + 8, 9); b('s_deco_stall', ox + 6, 9); b('s_deco_barrels', ox + 4, 11); b('s_deco_laundry', ox + 5, 12);
    b('s_deco_garden_1', ox + 10, 11); b('s_deco_garden_2', ox + 11, 11); b('s_deco_hay', ox + 4, 5); b('s_deco_cart', ox + 7, 11);
    u('u_human_leader_monarchy_0', ox + 8.2, 7.6); u('u_human_trader_0', ox + 6.3, 10.6); u('u_human_child_0', ox + 9.2, 10.4, true); u('u_human_soldier_1', ox + 12.4, 7.4);
    items.forEach(function (it) { it._s = sortY(it); });
    items.sort(function (a, c) { return a._s - c._s || a.x - c.x; });
    items.forEach(function (it) { if (S.has(it.key)) S.draw(tx, it.key, Math.round(it.x * 8), Math.round(it.y * 8), { team: it.team, flip: it.flip }); else console.warn('fehlt', it.key); });
    // Ausbau-Gerüst als Beispiel über der Halle im Dorf
    S.draw(tx, 's_scaffold_3', (TW + 6) * 8, 4 * 8);
    canvas.width = W2 * 8 * scale; canvas.height = H2 * 8 * scale;
    var ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(top, 0, 0, canvas.width, canvas.height);
  }


  // ------------------------------------------------------------------ Industrie: verschmutzte und saubere Stadt nebeneinander
  function renderIndustry(canvas, scale) {
    S.init();
    var TW = 22, TH = 16, W2 = TW * 2, H2 = TH;
    var ter = new Uint8Array(W2 * H2), vari = new Uint8Array(W2 * H2);
    for (var i = 0; i < ter.length; i++) { var x = i % W2, y = Math.floor(i / W2); ter[i] = T.GRASS; vari[i] = Math.floor(h2(x, y, 81) * 256);
      if (x % TW === 17) ter[i] = T.RIVER; if (x % TW >= 18 && y < 7) ter[i] = T.FOREST; }
    var top = document.createElement('canvas'); top.width = W2 * 8; top.height = H2 * 8;
    var tx = top.getContext('2d');
    S.drawGroundMap(tx, ter, vari, W2, H2);
    // links: ausgelaugter Boden, trüber Fluss
    for (var yy = 0; yy < H2; yy++) for (var xx = 0; xx < TW; xx++) {
      var d = Math.hypot(xx - 7, yy - 6);
      if (ter[yy * W2 + xx] === T.RIVER) S.draw(tx, 't_murk', xx * 8, yy * 8);
      else if (d < 9 || xx >= 18) S.draw(tx, 't_barren', xx * 8, yy * 8);
    }
    var items = [], team = 0;
    function b(key, x, y, t) { items.push({ key: key, x: x, y: y, team: t == null ? team : t }); }
    // linke Stadt: Kombinat, Rüstung, Fabrik, Plattenbauten
    b(S.factoryKey('kombinat', 2), 2, 3); b(S.factoryKey('ruestung', 1), 7, 3); b(S.factoryKey('fabrik', 1), 10, 7); b(S.factoryKey('ruin', 1), 13, 3);
    [[2, 9, 1], [5, 9, 3], [2, 12, 2], [5, 12, 1], [13, 11, 2]].forEach(function (h) { b(S.houseKey('communism', h[2], h[0] + h[1]), h[0], h[1]); });
    for (var fy = 13; fy < 16; fy++) for (var fx = 9; fx < 12; fx++) b('s_field_0', fx, fy);
    // toter Wald am Fluss
    for (var ty = 0; ty < 7; ty++) for (var tx2 = 18; tx2 < 22; tx2++) items.push({ key: ['d_deadtree_0', 'd_deadtree_1', 'd_deadtree_2', 'd_stump_1', 'd_sickbush_0', 'd_stump_2', 'd_sickbush_1'][(tx2 * 3 + ty * 5) % 7], x: tx2, y: ty, decor: true });
    // rechte Stadt: Fabrik mit Filter, Fachwerk, Hain
    var o = TW; team = 4;
    b(S.factoryKey('fabrik', 2, true), o + 2, 3); b(S.factoryKey('schmiede', 1), o + 7, 4); b(S.factoryKey('manufaktur', 1), o + 11, 3);
    [[2, 9, 2], [5, 9, 1], [2, 12, 3], [5, 12, 2], [11, 8, 2], [13, 11, 1]].forEach(function (h) { b(S.houseKey('democracy', h[2], h[0] + h[1]), o + h[0], h[1]); });
    for (fy = 13; fy < 16; fy++) for (fx = 9; fx < 12; fx++) b('s_field_3', o + fx, fy);
    for (ty = 0; ty < 7; ty++) for (tx2 = 18; tx2 < 22; tx2++) items.push({ key: 'd_tree_' + ((tx2 + ty) % 4), x: o + tx2, y: ty, decor: true });
    items.forEach(function (it) { it._s = sortY(it); });
    items.sort(function (a, c) { return a._s - c._s || a.x - c.x; });
    items.forEach(function (it) { if (S.has(it.key)) S.draw(tx, it.key, it.x * 8, it.y * 8, { team: it.team || 0 }); else console.warn('fehlt', it.key); });
    // Rauch aus allen Schloten
    items.forEach(function (it) {
      var m = /^s_factory_([a-z]+)_(\d)(_filter)?$/.exec(it.key); if (!m || m[1] === 'ruin') return;
      S.factoryStacks(m[1], +m[2], !!m[3]).forEach(function (st, k) { S.draw(tx, (m[3] ? 'fx_smokeplume_clean_' : 'fx_smokeplume_') + ((k + it.x) % 4), it.x * 8 + st.dx, it.y * 8 + st.dy); });
    });
    // Dunstglocke über der linken Stadt
    for (yy = 0; yy < H2; yy++) for (xx = 0; xx < TW; xx++) { var dd = Math.hypot(xx - 7, (yy - 6) * 1.3); if (dd < 11) S.draw(tx, 't_smog_' + (dd < 4 ? 3 : (dd < 7.5 ? 2 : 1)), xx * 8, yy * 8); }
    canvas.width = W2 * 8 * scale; canvas.height = H2 * 8 * scale;
    var ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(top, 0, 0, canvas.width, canvas.height);
  }


  // ------------------------------------------------------------------ Hilfen: weiche Überlagerungen nach Stufenraster, Gleisnetz
  function softLayer(ctx, lev, W2, H2, base) {
    for (var y = 0; y < H2; y++) for (var x = 0; x < W2; x++) {
      var L0 = lev[y * W2 + x]; if (!L0) continue;
      function at(xx, yy) { return xx < 0 || yy < 0 || xx >= W2 || yy >= H2 ? L0 : lev[yy * W2 + xx]; }
      var m = (at(x, y - 1) >= L0 ? 1 : 0) | (at(x + 1, y) >= L0 ? 2 : 0) | (at(x, y + 1) >= L0 ? 4 : 0) | (at(x - 1, y) >= L0 ? 8 : 0);
      S.draw(ctx, S.softKey(base + (base === 't_soot' || base === 't_cleared' ? '' : '_' + L0), m), x * 8, y * 8);
    }
  }
  function railLine(set, pts) {
    for (var k = 1; k < pts.length; k++) { var x = pts[k - 1][0], y = pts[k - 1][1]; set[x + ',' + y] = 1; while (x !== pts[k][0] || y !== pts[k][1]) { if (x !== pts[k][0]) x += pts[k][0] > x ? 1 : -1; else y += pts[k][1] > y ? 1 : -1; set[x + ',' + y] = 1; } }
  }
  function drawRails(ctx, set, ter, W2) {
    Object.keys(set).forEach(function (k) {
      var p = k.split(','), x = +p[0], y = +p[1];
      var m = (set[x + ',' + (y - 1)] ? 1 : 0) | (set[(x + 1) + ',' + y] ? 2 : 0) | (set[x + ',' + (y + 1)] ? 4 : 0) | (set[(x - 1) + ',' + y] ? 8 : 0);
      var t = ter[y * W2 + x];
      if (t === T.RIVER || t === T.WATER || t === T.SHALLOW) S.draw(ctx, (m & 10) ? 't_rail_bridge_h' : 't_rail_bridge_v', x * 8, y * 8);
      else S.drawRail(ctx, x * 8, y * 8, m);
    });
  }
  function finishItems(tx, items) {
    items.forEach(function (it) { it._s = sortY(it); });
    items.sort(function (a, c) { return a._s - c._s || a.x - c.x; });
    items.forEach(function (it) { if (S.has(it.key)) S.draw(tx, it.key, Math.round(it.x * 8) + (it.dx || 0), Math.round(it.y * 8) + (it.dy || 0), { team: it.team || 0, flip: it.flip }); else console.warn('fehlt', it.key); });
  }
  function blit(canvas, top, scale) { canvas.width = top.width * scale; canvas.height = top.height * scale; var c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(top, 0, 0, canvas.width, canvas.height); }

  // ------------------------------------------------------------------ Eisenbahn: zwei Städte, Strecke mit Kurven und Brücke, Zug, Lager, Rohstoffe
  function renderRailway(canvas, scale) {
    S.init();
    var W2 = 40, H2 = 20, ter = new Uint8Array(W2 * H2), vari = new Uint8Array(W2 * H2), i;
    for (i = 0; i < ter.length; i++) { var x = i % W2, y = Math.floor(i / W2); vari[i] = Math.floor(h2(x, y, 83) * 256);
      ter[i] = x === 20 ? T.RIVER : (y < 5 && (x < 16 || x > 31) ? T.HILL : T.GRASS); if (x >= 21 && x <= 23 && y >= 15) ter[i] = T.SHALLOW; }
    var top = document.createElement('canvas'); top.width = W2 * 8; top.height = H2 * 8;
    var tx = top.getContext('2d'); S.drawGroundMap(tx, ter, vari, W2, H2);
    var rails = {}; railLine(rails, [[1, 11], [16, 11], [16, 6], [25, 6], [25, 11], [38, 11]]); railLine(rails, [[13, 11], [13, 5]]);
    drawRails(tx, rails, ter, W2);
    var items = [];
    function b(key, x, y, t) { items.push({ key: key, x: x, y: y, team: t }); }
    function u(key, x, y, t, f) { items.push({ key: key, x: x, y: y, team: t, unit: true, flip: f }); }
    // links: Kommunismus
    b(S.stationKey('communism'), 6, 9, 0); [[2, 13], [5, 14], [9, 14], [2, 6]].forEach(function (h, k) { b(S.houseKey('communism', 2, k), h[0], h[1], 0); });
    b(S.mineKey('coal'), 12, 3, 0); b('d_deposit_coal_0', 15, 2); b('d_deposit_iron_1', 10, 1); b('d_deposit_iron_0', 8, 2);
    b('s_pasture', 2, 16, 0); u('a_sheep_0', 2.6, 16.6, 0); u('a_sheep_2', 3.6, 17.2, 0, true); u('a_cow_0', 2.5, 17.4, 0);
    b(S.laborcampKey('communism'), 9, 16, 0); u(S.unitKey('human', 'prisoner', 'communism', 0), 12.2, 16.8, 0); u(S.unitKey('dwarf', 'prisoner', 'communism', 2), 12.6, 15.2, 0, true); u(S.unitKey('human', 'soldier', 'communism', 4), 11.2, 18.6, 0);
    // rechts: Faschismus
    b(S.stationKey('fascism'), 30, 9, 3); [[34, 13], [37, 13], [30, 14], [37, 6]].forEach(function (h, k) { b(S.houseKey('fascism', 2, k), h[0], h[1], 3); });
    b(S.mineKey('gold'), 33, 2, 3); b('d_deposit_gold_0', 36, 1); b('d_deposit_crystal_0', 37, 3); b('d_deposit_crystal_1', 30, 1);
    b(S.laborcampKey('fascism'), 27, 15, 3); u(S.unitKey('human', 'prisoner', 'fascism', 1), 29.4, 17.4, 3); u(S.unitKey('orc', 'soldier', 'fascism', 4), 26.4, 17.6, 3);
    b('s_fishery', 21, 13, 3); b(S.factoryKey('ruestung', 1), 34, 16, 3);
    finishItems(tx, items);
    // Züge: waagrecht nach Osten (Lok + drei Wagen), senkrecht nach Norden auf dem Abzweig
    var tr = [[S.trainKey('car', 'troop', 'e'), 3], [S.trainKey('car', 'coal', 'e'), 5], [S.trainKey('car', 'freight', 'e'), 7], [S.trainKey('loco', null, 'e'), 9]];
    tr.forEach(function (t) { S.draw(tx, t[0], t[1] * 8 + 4, 11 * 8, { team: 0 }); });
    S.draw(tx, 'fx_smokeplume_3', 9 * 8 + 4 + 3, 11 * 8 - 16);
    S.draw(tx, S.trainKey('car', 'coal', 'n'), 13 * 8, 8 * 8, { team: 0 }); S.draw(tx, S.trainKey('loco', null, 'n'), 13 * 8, 7 * 8 - 2, { team: 0 });
    S.draw(tx, S.trainKey('loco', null, 'w'), 34 * 8, 11 * 8, { team: 3 }); S.draw(tx, S.trainKey('car', 'troop', 'w'), 36 * 8, 11 * 8, { team: 3 });
    S.draw(tx, S.trainKey('loco', null, 's'), 25 * 8, 9 * 8, { team: 3 });
    blit(canvas, top, scale);
  }

  // ------------------------------------------------------------------ Verschmutzungsstufen: dieselbe Landschaft sauber, belastet, verödet
  function renderPollutionStages(canvas, scale) {
    S.init();
    var PW = 16, PH = 13, W2 = PW * 3, H2 = PH, ter = new Uint8Array(W2 * H2), vari = new Uint8Array(W2 * H2), i;
    for (i = 0; i < ter.length; i++) { var x = i % W2, y = Math.floor(i / W2), lx = x % PW; vari[i] = Math.floor(h2(lx, y, 85) * 256); ter[i] = lx === 12 ? T.RIVER : (lx >= 13 || (lx < 4 && y < 5) ? T.FOREST : T.GRASS); }
    var top = document.createElement('canvas'); top.width = W2 * 8; top.height = H2 * 8;
    var tx = top.getContext('2d'); S.drawGroundMap(tx, ter, vari, W2, H2);
    var bar = new Uint8Array(W2 * H2), smog = new Uint8Array(W2 * H2), soot = new Uint8Array(W2 * H2), cleared = new Uint8Array(W2 * H2);
    for (var st = 1; st <= 2; st++) for (y = 0; y < H2; y++) for (lx = 0; lx < PW; lx++) {
      x = st * PW + lx;
      var d = Math.hypot(lx - 7, (y - 5) * 1.2) + (h2(lx, y, 86) - 0.5) * 2.2;
      if (st === 1) { bar[y * W2 + x] = d < 3.5 ? 2 : (d < 6.5 ? 1 : 0); smog[y * W2 + x] = d < 3 ? 2 : (d < 6 ? 1 : 0); soot[y * W2 + x] = d < 2.2 ? 1 : 0; }
      else { bar[y * W2 + x] = d < 5 ? 3 : (d < 8.5 ? 2 : (d < 11 ? 1 : 0)); smog[y * W2 + x] = d < 4.5 ? 3 : (d < 8 ? 2 : (d < 10.5 ? 1 : 0)); soot[y * W2 + x] = d < 3.5 ? 1 : 0; }
      if ((lx < 4 && y < 5) && (st === 2 || lx < 2)) cleared[y * W2 + x] = 1;
    }
    softLayer(tx, cleared, W2, H2, 't_cleared'); softLayer(tx, bar, W2, H2, 't_barren'); softLayer(tx, soot, W2, H2, 't_soot');
    for (y = 0; y < H2; y++) for (st = 1; st <= 2; st++) S.draw(tx, 't_murk', (st * PW + 12) * 8, y * 8);
    var items = [];
    for (st = 0; st < 3; st++) {
      var o = st * PW;
      items.push({ key: S.factoryKey('kombinat', 1), x: o + 6, y: 3, team: 0 });
      [[2, 8], [5, 9], [8, 9]].forEach(function (h, k) { items.push({ key: S.houseKey('communism', 1 + (k % 2), k), x: o + h[0], y: h[1], team: 0 }); });
      for (y = 0; y < H2; y++) for (lx = 0; lx < PW; lx++) {
        var tt = ter[y * W2 + o + lx]; if (tt !== T.FOREST) continue;
        var dec;
        if (cleared[y * W2 + o + lx]) dec = ((lx + y) % 3 === 0) ? 'd_log_' + ((lx + y) & 1) : 'd_stump_' + ((lx * 2 + y) % 3);
        else if (st === 0) dec = 'd_tree_' + ((lx + y) % 4);
        else if (st === 1) dec = ((lx + y) % 2 === 0) ? 'd_deadtree_' + ((lx + y) % 3) : (((lx * 3 + y) % 5 === 0) ? 'd_sickbush_0' : 'd_tree_' + ((lx + y) % 4));
        else dec = ((lx + y) % 4 === 0) ? 'd_sickbush_' + ((lx + y) & 1) : 'd_deadtree_' + ((lx * 3 + y) % 3);
        items.push({ key: dec, x: o + lx, y: y, decor: true });
      }
    }
    finishItems(tx, items);
    for (st = 0; st < 3; st++) S.factoryStacks('kombinat', 1).forEach(function (sp, k) { S.draw(tx, (st === 0 ? 'fx_smokeplume_clean_' : 'fx_smokeplume_') + ((k + st) % 4), (st * PW + 6) * 8 + sp.dx, 3 * 8 + sp.dy); });
    softLayer(tx, smog, W2, H2, 't_smog');
    blit(canvas, top, scale);
  }

  // ------------------------------------------------------------------ Fahnen: faschistische Musterstadt in drei Reichsfarben
  function renderFlags(canvas, scale) {
    S.init();
    var TW = 18, TH = 16, W2 = TW * 3, H2 = TH, ter = new Uint8Array(W2 * H2), vari = new Uint8Array(W2 * H2);
    for (var i = 0; i < ter.length; i++) { ter[i] = T.GRASS; vari[i] = Math.floor(h2(i % W2, Math.floor(i / W2), 87) * 256); }
    var top = document.createElement('canvas'); top.width = W2 * 8; top.height = H2 * 8;
    var tx = top.getContext('2d'); S.drawGroundMap(tx, ter, vari, W2, H2);
    var all = [], conf = [[0, 5], [3, 2], [11, 6]];   // [Teamfarbe, Banner-Muster]; Rot mit Kreis wird durch die Sicherheitsregel ersetzt
    conf.forEach(function (c, n) {
      var ox = n * TW, team = c[0], pat = c[1];
      for (var y = 0; y <= 15; y++) S.drawPath(tx, (ox + 8) * 8, y * 8, 5);
      var items = townItems('fascism', ox, 0, team).map(function (it) { if (it.key === 's_center_fascism') it.key = S.flagKey('center', pat, 0, team); return it; });
      // Fahnenmasten entlang der Hauptstraße, hängende Banner an Türmen und Toren, Wimpelketten
      [2.6, 5.6, 9.6, 12.6].forEach(function (yy, k) { items.push({ key: S.flagKey('pole', pat, k & 1, team), x: ox + 7, y: Math.floor(yy) + 0, team: team }); items.push({ key: S.flagKey('pole', pat, (k + 1) & 1, team), x: ox + 9, y: Math.floor(yy) + 1, team: team }); });
      all = all.concat(items);
      all.push({ late: 1, key: S.flagKey('row', pat, 0, team), x: ox + 3, y: 7.3, team: team }, { late: 1, key: S.flagKey('row', pat, 0, team), x: ox + 13, y: 7.3, team: team });
      [[1, 2], [16, 2], [1, 12], [16, 12], [8, 2], [8, 12]].forEach(function (p) { all.push({ late: 2, key: S.flagKey('hang', pat, 0, team), x: ox + p[0], y: p[1], team: team }); });
    });
    finishItems(tx, all.filter(function (it) { return !it.late; }));
    all.filter(function (it) { return it.late; }).forEach(function (it) { S.draw(tx, it.key, Math.round(it.x * 8) + 1, Math.round(it.y * 8) - (it.late === 2 ? 16 : 0), { team: it.team }); });
    blit(canvas, top, scale);
  }


  // ------------------------------------------------------------------ Vergleich alt/neu: Musterstadt mit groben bzw. feinen Gebäuden
  function renderTownCompare(canvas, scale, old, gov) {
    S.init();
    var TW = 18, TH = 16, ter = new Uint8Array(TW * TH), vari = new Uint8Array(TW * TH);
    for (var i = 0; i < ter.length; i++) { ter[i] = T.GRASS; vari[i] = Math.floor(h2(i % TW, Math.floor(i / TW), 89) * 256); }
    // direkt im Zielmaßstab zeichnen, damit feine Sprites (Maßstab 0,5) ihre Details behalten
    canvas.width = TW * 8 * scale; canvas.height = TH * 8 * scale;
    var tx = canvas.getContext('2d'); tx.imageSmoothingEnabled = false; tx.scale(scale, scale);
    S.drawGroundMap(tx, ter, vari, TW, TH);
    for (var y = 0; y < TH; y++) S.drawPath(tx, 8 * 8, y * 8, 5);
    var items = townItems(gov || 'monarchy', 0, 0, 5);
    items.forEach(function (it) { it._s = sortY(it); });
    items.sort(function (a, c) { return a._s - c._s || a.x - c.x; });
    items.forEach(function (it) { var fn = old ? S.drawOrig : S.draw; fn(tx, it.key, Math.round(it.x * 8), Math.round(it.y * 8), { team: it.team || 0, flip: it.flip }); });
  }


  // ------------------------------------------------------------------ Etappe 3: Landschaft im feinen Raster (Boden 16 px je Kachel, Wasser-Frames, Brandung, feine Deko)
  function renderLandscapeHi(canvas, scale, frame) {
    S.init();
    var tr = buildTerrain(), ter = tr.ter, vari = tr.vari;
    // Stadtfläche wieder zu Wiese/Wald machen, damit die reine Landschaft zu sehen ist
    var hi = document.createElement('canvas'); hi.width = W * 16; hi.height = H * 16;
    var hx = hi.getContext('2d'); hx.imageSmoothingEnabled = false;
    S.drawGroundMapHi(hx, ter, vari, W, H);
    hx.save(); hx.scale(2, 2);
    function T(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? -1 : ter[y * W + x]; }
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var t = ter[y * W + x], wk = S.waterAnimKey(t, frame || 0);
      if (!wk) continue;
      S.draw(hx, wk, x * 8, y * 8);
      var sk = S.surfKey(T(x, y - 1), T(x + 1, y), T(x, y + 1), T(x - 1, y), frame || 0);
      if (sk) S.draw(hx, sk, x * 8, y * 8);
    }
    var items = [];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var d = S.decorFor(ter[y * W + x], vari[y * W + x]);
      if (d) items.push({ key: S.swayKey(d.key, (x + y + (frame || 0)) % 3), x: x, y: y, dx: d.dx, dy: d.dy, decor: true });
    }
    items.forEach(function (it) { it._s = (it.y + 1) * 8 + it.dy; });
    items.sort(function (a, c) { return a._s - c._s || a.x - c.x; });
    items.forEach(function (it) { S.draw(hx, it.key, it.x * 8 + it.dx, it.y * 8 + it.dy); });
    hx.restore();
    canvas.width = W * 8 * scale; canvas.height = H * 8 * scale;
    var c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(hi, 0, 0, canvas.width, canvas.height);
  }


  // ------------------------------------------------------------------ Etappe 4: Effekte und Licht (direkt im Zielmaßstab gezeichnet)
  function renderEffects(canvas, scale) {
    S.init();
    var TW = 48, TH = 30, ter = new Uint8Array(TW * TH), vari = new Uint8Array(TW * TH);
    for (var i = 0; i < ter.length; i++) { var x = i % TW, y = Math.floor(i / TW); ter[i] = x >= 30 ? T.GRASS : (y >= 20 ? T.ASH : T.GRASS); vari[i] = Math.floor(h2(x, y, 91) * 256); }
    canvas.width = TW * 8 * scale; canvas.height = TH * 8 * scale;
    var c = canvas.getContext('2d'); c.imageSmoothingEnabled = false; c.scale(scale, scale);
    S.drawGroundMap(c, ter, vari, TW, TH);
    var f;
    for (f = 0; f < 6; f++) S.draw(c, 'fx_fire_' + f, 8 + f * 12, 8);
    for (f = 0; f < 4; f++) S.draw(c, 'fx_smoke_' + f, 84 + f * 12, 8);
    for (f = 0; f < 2; f++) S.draw(c, 'fx_bolt_' + f, 140 + f * 16, 20);
    ['s', 'm', 'l'].forEach(function (sz, j) { for (var k = 0; k < 8; k++) S.draw(c, 'fx_blast_' + sz + '_' + k, 6 + k * [14, 22, 30][j], [44, 62, 92][j] - 8); });
    for (f = 0; f < 10; f++) S.draw(c, 'fx_nuke_' + f, 6 + f * 23, 24 * 8 + 6);
    // Regen- und Schneefelder
    for (var yy = 0; yy < 4; yy++) for (var xx = 0; xx < 4; xx++) { S.draw(c, 'fx_rain_' + (xx & 1), 196 + xx * 8, 8 + yy * 8); S.draw(c, 'fx_snow_' + (yy & 1), 196 + xx * 8, 48 + yy * 8); }
    // Nachtstadt: Dunkelung, leuchtende Fenster, Lichtschein, Schornsteinrauch
    c.fillStyle = 'rgba(16,20,48,0.62)'; c.fillRect(30 * 8, 10 * 8, 18 * 8, 20 * 8);
    var houses = [[31, 12, 2, 'monarchy'], [34, 12, 3, 'monarchy'], [38, 12, 2, 'democracy'], [42, 12, 1, 'democracy'], [31, 16, 3, 'democracy'], [36, 16, 2, 'monarchy'], [40, 17, 2, 'theocracy']];
    houses.forEach(function (h, k) { var key = S.litKey(S.houseKey(h[3], h[2], k)); S.draw(c, key, h[0] * 8, h[1] * 8, { team: 4 }); });
    S.draw(c, S.litKey('s_center_monarchy'), 34 * 8, 21 * 8, { team: 4 });
    [[33, 14], [37, 14], [41, 14], [33, 18], [38, 18], [35, 24], [44, 20]].forEach(function (p, k) { S.draw(c, k % 3 === 2 ? 'fx_glow_cold' : 'fx_glow_warm', p[0] * 8, p[1] * 8); });
    houses.forEach(function (h, k) { S.draw(c, 'fx_chimney_' + (k % 4), h[0] * 8 + 10, h[1] * 8 - 12); });
    S.draw(c, 'fx_fire_2', 45 * 8, 27 * 8); S.draw(c, 'fx_glow_warm', 45 * 8, 26 * 8);
  }

  // ------------------------------------------------------------------ Ausbau 9: Abnahmebilder (?ausbau=<name>)
  var AGOVS = ['tribe', 'monarchy', 'democracy', 'fascism', 'communism', 'theocracy', 'republic', 'anarchy'];
  var AUS = {};
  function dsort(c, items) { items.sort(function (a, b) { return a[2] - b[2] || a[1] - b[1]; }); items.forEach(function (it) { if (S.has(it[0])) S.draw(c, it[0], it[1], it[2], it[3] || null); }); }
  AUS.zeichen = { size: [64, 30], draw: function (c, P) {
    P.groundRect(c, P.fill(T.GRASS, 64, 30), 0, 0);
    c.fillStyle = '#1d3b47'; c.fillRect(0, 0, 64 * 8, 22);
    AGOVS.forEach(function (gv, i) {
      var x0 = i * 64 + 4, team = [9, 2, 4, 0, 1, 3, 7, 6][i];
      S.draw(c, S.emblemKey(gv), x0 + 22, 3);
      var it = [];
      it.push([S.flagKey('pole', i, 0, team, gv), x0 + 2, 48, { team: team }]);
      it.push([S.flagKey('pole', i, 1, team, gv), x0 + 22, 48, { team: team }]);
      it.push([S.unitKey('human', 'soldier', gv, 4), x0 + 2, 72, { team: team }]);
      it.push([S.unitKey('human', 'soldier', gv, 1), x0 + 14, 72, { team: team }]);
      it.push([S.unitKey('human', 'soldier', gv, 5), x0 + 26, 72, { team: team }]);
      if (gv !== 'anarchy') it.push([S.unitKey('human', 'leader', gv, 4), x0 + 40, 72, { team: team }]);
      dsort(c, it);
      S.draw(c, S.flagKey('hang', i, 0, team, gv), x0 + 44, 26, { team: team });
    });
    var it2 = [];
    it2.push(['s_center_fascism', 8, 216, { team: 5 }]); it2.push(['s_center_communism', 40, 216, { team: 0 }]);
    it2.push(['s_center_fascism', 72, 216, { team: 0 }]);
    for (var t = 0; t < 12; t++) { it2.push([S.flagKey('pole', 1, t & 1, t, t % 2 ? 'fascism' : 'communism'), 120 + t * 14, 144, { team: t }]); }
    dsort(c, it2);
    AGOVS.forEach(function (gv, i) { var cv = S.iconCanvas(S.emblemKey(gv), 2); c.drawImage(cv, 300 + (i % 4) * 36, 160 + Math.floor(i / 4) * 36, 32, 32); });
  } };
  AUS.figuren = { size: [60, 20], draw: function (c, P) {
    P.groundRect(c, P.fill(T.DESERT, 60, 20), 0, 0);
    var roles = ['farmer', 'lumberjack', 'miner', 'builder', 'trader', 'settler', 'child', 'caravan', 'soldier', 'leader', 'pow'];
    var it = [];
    ['sahel', 'nil', 'nord', null].forEach(function (cu, j) {
      roles.forEach(function (ro, i) { it.push([S.unitKey('human', ro, ro === 'pow' ? 'fascism' : 'monarchy', 4, cu), 6 + i * 13, 22 + j * 30, { team: 3 }]); it.push([S.unitKey('human', ro, ro === 'pow' ? 'communism' : 'fascism', 1, cu), 6 + i * 13 + 160, 22 + j * 30, { team: 0 }]); });
      ['tribe', 'theocracy', 'republic', 'democracy', 'communism'].forEach(function (gv, i) { it.push([S.unitKey('human', 'leader', gv, 4, cu), 320 + i * 13, 22 + j * 30, { team: 5 }]); it.push([S.unitKey('human', 'soldier', gv, 0, cu), 390 + i * 13, 22 + j * 30, { team: 5 }]); });
    });
    for (var f = 0; f < 4; f++) { it.push(['a_camel_' + f, 20 + f * 24, 150, null]); it.push(['a_camel_load_' + f, 130 + f * 24, 150, { team: 1 }]); }
    dsort(c, it);
  } };
  AUS.fahrzeuge = { size: [60, 24], draw: function (c, P) {
    P.groundRect(c, P.fill(T.GRASS, 60, 24), 0, 0);
    var it = [];
    ['fascism', 'communism', 'monarchy'].forEach(function (gv, j) {
      ['e', 'w', 'n', 's'].forEach(function (d, i) { it.push([S.vehicleKey('tank', gv, d, 0), 16 + i * 28, 24 + j * 30, { team: j * 4 }]); it.push([S.vehicleKey('artillery', gv, d, i & 1), 140 + i * 30, 24 + j * 30, { team: j * 4 }]); });
    });
    ['d_wreck_tank', 'd_wreck_tank_old', 'd_wreck_gun', 'd_wreck_gun_old'].forEach(function (k, i) { it.push([k, 280 + i * 28, 40, null]); });
    for (var f = 0; f < 4; f++) { it.push(['fx_shell_' + f, 280 + f * 20, 90, null]); it.push(['fx_tankfire_' + f, 280 + f * 20, 120, null]); }
    dsort(c, it);
  } };
  AUS.kulturen = { size: [72, 33], draw: function (c, P) {
    var rows = []; for (var y = 0; y < 33; y++) { rows.push([]); for (var x = 0; x < 72; x++) { var t = x < 40 ? [T.DESERT, T.SAVANNA, T.TUNDRA][Math.min(2, Math.floor(y / 11))] : T.DESERT; if (x >= 40 && (x === 58 || x === 59) ) t = T.RIVER; if (x >= 40 && (x === 57 || x === 60) && y % 5 !== 0) t = T.SAVANNA; rows[y].push(t); } }
    P.groundRect(c, rows, 0, 0);
    ['sahel', 'nil', 'nord'].forEach(function (cu, j) {
      var y0 = j * 88, it = [], team = [1, 3, 5][j], gov = ['monarchy', 'theocracy', 'monarchy'][j];
      it.push([S.houseKey(gov, 0, 0, cu), 4, y0 + 24, { team: team }]); it.push([S.houseKey(gov, 0, 1, cu), 24, y0 + 24, { team: team }]);
      it.push([S.houseKey(gov, 1, 0, cu), 4, y0 + 56, { team: team }]); it.push([S.houseKey(gov, 2, 1, cu), 24, y0 + 56, { team: team }]); it.push([S.houseKey(gov, 3, 0, cu), 44, y0 + 56, { team: team }]); it.push([S.houseKey(gov, 3, 1, cu), 64, y0 + 56, { team: team }]);
      it.push([S.marketKey(cu), 48, y0 + 24, { team: team }]); it.push([S.templeKey(cu), 70, y0 + 24, { team: team }]);
      it.push([S.centerKey(gov, 0, cu, 0), 90, y0 + 56, { team: team }]); it.push([S.centerKey(gov, 1, cu), 120, y0 + 56, { team: team }]); it.push([S.centerKey(gov, 2, cu), 150, y0 + 56, { team: team }]);
      it.push([S.centerKey('fascism', 2, cu), 182, y0 + 56, { team: 0 }]); it.push([S.centerKey('communism', 2, cu), 214, y0 + 56, { team: 7 }]);
      if (cu === 'sahel') it.push(['s_caravanserai', 246, y0 + 56, { team: team }]);
      if (cu === 'nil') { it.push(['s_monument_0', 246, y0 + 64, null]); it.push(['s_monument_1', 266, y0 + 64, null]); it.push(['s_monument_2', 286, y0 + 64, null]); }
      if (cu === 'nord') it.push(['s_longhall', 246, y0 + 64, { team: team }]);
      ['farmer', 'trader', 'caravan', 'child', 'soldier', 'leader'].forEach(function (ro, i) { it.push([S.unitKey('human', ro, gov, 4, cu), 92 + i * 11, y0 + 80, { team: team }]); });
      ['monarchy', 'fascism', 'communism'].forEach(function (gv, i) { it.push([S.unitKey('human', 'soldier', gv, 0, cu), 160 + i * 11, y0 + 80, { team: 0 }]); it.push([S.unitKey('human', 'leader', gv, 4, cu), 196 + i * 11, y0 + 80, { team: 0 }]); });
      if (cu === 'sahel') { it.push(['a_camel_load_0', 240, y0 + 80, { team: team }]); it.push(['a_camel_2', 262, y0 + 80, null]); }
      dsort(c, it);
    });
    // kleine Wüstenstadt am Fluss: Sahel-Lehmstadt links, Niltal-Ort mit Pyramiden rechts vom Fluss
    var it2 = [], tm = 1;
    it2.push(['s_center_sahel_monarchy', 46 * 8, 9 * 8, { team: tm }]);
    [[42, 4, 1, 0], [45, 4, 2, 1], [48, 4, 3, 0], [51, 4, 1, 1], [42, 7, 2, 1], [51, 7, 3, 1], [42, 13, 1, 0], [45, 13, 2, 0], [51, 13, 2, 1], [54, 6, 1, 0]].forEach(function (h) { it2.push([S.houseKey('monarchy', h[2], h[3], 'sahel'), h[0] * 8, h[1] * 8, { team: tm }]); });
    it2.push(['s_market_sahel', 48 * 8, 13 * 8, { team: tm }]); it2.push(['s_temple_sahel', 54 * 8, 10 * 8, { team: tm }]);
    it2.push(['s_caravanserai', 43 * 8, 19 * 8, { team: tm }]); it2.push([S.houseKey('monarchy', 0, 0, 'sahel'), 48 * 8, 19 * 8, { team: tm }]); it2.push([S.houseKey('monarchy', 0, 1, 'sahel'), 51 * 8, 18 * 8, { team: tm }]);
    it2.push(['s_monument_2', 64 * 8, 6 * 8, null]); it2.push(['s_monument_2', 67 * 8, 5 * 8, null]); it2.push(['s_monument_1', 69 * 8, 8 * 8, null]);
    it2.push(['s_temple_nil', 62 * 8, 12 * 8, { team: 3 }]); it2.push([S.houseKey('theocracy', 1, 0, 'nil'), 65 * 8, 12 * 8, { team: 3 }]); it2.push([S.houseKey('theocracy', 2, 1, 'nil'), 68 * 8, 12 * 8, { team: 3 }]);
    it2.push([S.houseKey('theocracy', 0, 0, 'nil'), 62 * 8, 16 * 8, { team: 3 }]); it2.push(['s_field_3', 61 * 8, 19 * 8, null]); it2.push(['s_field_2', 62 * 8, 19 * 8, null]); it2.push(['s_field_3', 61 * 8, 20 * 8, null]);
    [[44, 23], [46, 24], [49, 22], [55, 16], [53, 23], [63, 22], [66, 18]].forEach(function (p, k) { it2.push(['d_palm_' + (k % 2), p[0] * 8, p[1] * 8, null]); });
    [[50, 26, 0], [52, 26, 1], [54, 26, 2], [56, 25, 3]].forEach(function (p) { it2.push(['a_camel_load_' + p[2], p[0] * 8, p[1] * 8, { team: tm }]); });
    it2.push([S.unitKey('human', 'caravan', 'monarchy', 1, 'sahel'), 58 * 8 - 2, 25 * 8, { team: tm }]);
    [[47, 12, 'farmer'], [50, 11, 'trader'], [44, 17, 'child'], [53, 17, 'soldier'], [49, 17, 'builder']].forEach(function (u, k) { it2.push([S.unitKey('human', u[2], 'monarchy', k % 4, 'sahel'), u[0] * 8, u[1] * 8, { team: tm }]); });
    [[64, 15, 'farmer'], [67, 16, 'trader'], [63, 20, 'farmer']].forEach(function (u, k) { it2.push([S.unitKey('human', u[2], 'theocracy', k, 'nil'), u[0] * 8, u[1] * 8, { team: 3 }]); });
    dsort(c, it2);
  } };
  AUS.militaer = { size: [72, 34], draw: function (c, P) {
    P.groundRect(c, P.fill(T.GRASS, 72, 34), 0, 0);
    var it = [], GV = ['fascism', 'communism', 'monarchy', 'republic', 'democracy'];
    c.fillStyle = 'rgba(29,59,71,0.85)'; c.font = '6px sans-serif';
    GV.forEach(function (gv, j) {
      var y = 14 + j * 22, team = [0, 4, 1, 7, 5][j];
      if (gv === 'fascism' || gv === 'communism') ['e', 'w', 'n', 's'].forEach(function (d, i) { it.push([S.vehicleKey('tank', gv, d, i & 1), 10 + i * 22, y, { team: team }]); });
      ['e', 'w', 'n', 's'].forEach(function (d, i) { it.push([S.vehicleKey('artillery', gv, d, (i === 0) ? 1 : 0), 108 + i * 26, y, { team: team }]); });
      it.push([S.unitKey('human', 'soldier', gv, 4), 214, y, { team: team }]); it.push([S.unitKey('human', 'soldier', gv, 5), 224, y, { team: team }]);
    });
    ['e', 'w', 'n', 's'].forEach(function (d, i) { it.push([S.vehicleKey('tank', 'monarchy', d, 0), 10 + i * 22, 14 + 3 * 22, { team: 1 }]); });
    it.push(['s_arsenal_fascism', 240, 40, { team: 0 }]); it.push(['s_arsenal_communism', 272, 40, { team: 4 }]); it.push(['s_arsenal_monarchy', 304, 40, { team: 1 }]);
    it.push(['s_arsenal_democracy', 336, 40, { team: 5 }]); it.push(['s_arsenal_republic', 368, 40, { team: 7 }]);
    dsort(c, it);
    // Schlachtfeld: Grabennetz, Trichter, Wracks, Feuer
    var TR = {}, list = [[32, 8], [33, 8], [34, 8], [35, 8], [36, 8], [36, 9], [37, 9], [38, 9], [39, 9], [40, 9], [40, 8], [41, 8], [42, 8], [43, 8], [44, 8], [38, 10], [38, 11], [30, 8], [31, 8], [47, 9]];
    list.forEach(function (p) { TR[p[0] + ',' + p[1]] = 1; });
    function has(x, y) { return !!TR[x + ',' + y]; }
    var ox = 0, oy = 8;
    c.save(); c.translate(ox, oy * 8);
    [[33, 11], [35, 12], [37, 12], [40, 11], [43, 12], [45, 10]].forEach(function (p) { for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) S.draw(c, S.softKey('t_barren_2', (dy ? 1 : 4) | (dx ? 8 : 2)), (p[0] + dx) * 8, (p[1] + dy) * 8); });
    list.forEach(function (p) { var m = (has(p[0], p[1] - 1) ? 1 : 0) | (has(p[0] + 1, p[1]) ? 2 : 0) | (has(p[0], p[1] + 1) ? 4 : 0) | (has(p[0] - 1, p[1]) ? 8 : 0); S.draw(c, S.softKey('t_trench', m), p[0] * 8, p[1] * 8); });
    [[34, 12], [42, 13], [46, 11], [31, 14]].forEach(function (p) { if (S.has('t_crater')) S.draw(c, 't_crater', p[0] * 8, p[1] * 8); });
    var it3 = [];
    it3.push([S.wreckKey('tank', 0), 36 * 8, 13 * 8, null]); it3.push([S.wreckKey('gun', 0), 44 * 8, 14 * 8, null]); it3.push([S.wreckKey('tank', 9), 30 * 8, 12 * 8, null]); it3.push([S.wreckKey('gun', 9), 48 * 8, 12 * 8, null]);
    [[33, 8], [35, 8], [41, 8], [43, 8]].forEach(function (p, k) { it3.push([S.unitKey('human', 'soldier', 'communism', 4), p[0] * 8, p[1] * 8 + 2, { team: 4 }]); });
    it3.push([S.vehicleKey('tank', 'fascism', 'n', 0), 39 * 8, 16 * 8, { team: 0 }]); it3.push([S.vehicleKey('artillery', 'communism', 'e', 1), 45 * 8, 6 * 8, { team: 4 }]);
    it3.push(['fx_tankfire_1', 39 * 8, 15 * 8 - 4, null]); it3.push(['fx_shell_1', 41 * 8, 12 * 8, null]); it3.push(['fx_shell_3', 37 * 8, 10 * 8, null]); it3.push(['fx_fire_2', 36 * 8 + 4, 13 * 8 - 4, null]);
    dsort(c, it3);
    c.restore();
    for (var f = 0; f < 4; f++) { S.draw(c, 'fx_shell_' + f, 420 + f * 16, 24); S.draw(c, 'fx_tankfire_' + f, 420 + f * 20, 50); }
    for (var m = 0; m < 16; m++) S.draw(c, 't_trench_' + m, 420 + (m % 8) * 10, 70 + Math.floor(m / 8) * 10);
    ['i_tank', 'i_artillery', 'i_battle', 'i_pow', 'i_culture'].forEach(function (k, i) { c.fillStyle = '#1d3b47'; c.fillRect(420 + i * 20, 100, 18, 18); S.draw(c, k, 421 + i * 20, 101); });
  } };
  AUS.lager = { size: [44, 26], draw: function (c, P) {
    var rows = []; for (var y = 0; y < 26; y++) { rows.push([]); for (var x = 0; x < 44; x++) rows[y].push(x > 30 && y < 6 ? T.HILL : (x < 2 && y > 18 ? T.FOREST : T.GRASS)); }
    P.groundRect(c, rows, 0, 0);
    // kahler Boden im Lager
    for (y = 3; y < 18; y++) for (x = 3; x < 24; x++) S.draw(c, S.softKey('t_cleared', ((y > 3) ? 1 : 0) | ((x < 23) ? 2 : 0) | ((y < 17) ? 4 : 0) | ((x > 3) ? 8 : 0)), x * 8, y * 8);
    var it = [], F = {};
    for (x = 2; x <= 24; x++) { F[x + ',2'] = 1; F[x + ',18'] = 1; } for (y = 2; y <= 18; y++) { F['2,' + y] = 1; F['24,' + y] = 1; }
    function has(x, y) { return !!F[x + ',' + y]; }
    Object.keys(F).forEach(function (k) { var p = k.split(',').map(Number), m = (has(p[0], p[1] - 1) ? 1 : 0) | (has(p[0] + 1, p[1]) ? 2 : 0) | (has(p[0], p[1] + 1) ? 4 : 0) | (has(p[0] - 1, p[1]) ? 8 : 0);
      var key = (p[1] === 18 && p[0] === 13) ? S.gateKey('fence', 1, 'h') : (p[0] === 24 && p[1] === 10 ? S.gateKey('fence', 1, 'v') : S.wallKey('fence', 1, m)); it.push([key, p[0] * 8, p[1] * 8, null]); });
    it.push([S.towerKey('fence', 1), 3 * 8, 3 * 8, null]); it.push(['s_watchtower', 23 * 8, 3 * 8, null]); it.push(['s_watchtower', 3 * 8, 17 * 8, null]); it.push(['s_watchtower', 23 * 8, 17 * 8, null]);
    it.push([S.campBuildKey('camphq', 'fascism'), 12 * 8, 8 * 8, { team: 0 }]);
    [[5, 5], [9, 5], [16, 5], [20, 5], [5, 12], [17, 12], [20, 12]].forEach(function (p) { it.push(['s_barrack', p[0] * 8, p[1] * 8, null]); });
    it.push([S.flagKey('pole', 0, 0, 0, 'fascism'), 15 * 8, 10 * 8, { team: 0 }]);
    it.push([S.mineKey('iron'), 33 * 8, 5 * 8, { team: 0 }]); it.push([S.mineKey('coal'), 37 * 8, 3 * 8, { team: 0 }]);
    // Insassen und Wachen
    [[9, 15], [10, 15], [11, 16], [8, 16], [28, 7], [29, 7], [30, 8]].forEach(function (p, k) { it.push([S.unitKey(['human', 'elf', 'dwarf', 'human', 'orc'][k % 5], 'prisoner', 'fascism', k % 4), p[0] * 8, p[1] * 8, null]); });
    [[19, 15, 'communism'], [20, 15, 'communism'], [21, 16, 'monarchy'], [26, 9, 'democracy']].forEach(function (p, k) { it.push([S.unitKey('human', 'pow', p[2], k), p[0] * 8, p[1] * 8, { team: [4, 4, 1, 5][k] }]); });
    [[13, 20], [27, 8], [7, 17], [22, 9]].forEach(function (p, k) { it.push([S.unitKey('human', 'soldier', 'fascism', 4 + (k & 1)), p[0] * 8, p[1] * 8, { team: 0 }]); });
    it.push([S.unitKey('human', 'leader', 'fascism', 4), 13 * 8, 11 * 8, { team: 0 }]);
    // Gefangenenlager einer Demokratie (ohne Arbeit) rechts unten
    it.push(['s_stockade', 33 * 8, 18 * 8, { team: 5 }]); it.push(['s_stockade', 37 * 8, 18 * 8, { team: 5 }]);
    [[34, 17], [35, 18], [38, 17]].forEach(function (p, k) { it.push([S.unitKey('human', 'pow', 'fascism', 4), p[0] * 8, p[1] * 8, { team: 0 }]); });
    [[36, 21], [40, 21]].forEach(function (p) { it.push([S.unitKey('human', 'soldier', 'democracy', 4), p[0] * 8, p[1] * 8, { team: 5 }]); });
    it.push([S.flagKey('pole', 3, 1, 5, 'democracy'), 41 * 8, 18 * 8, { team: 5 }]);
    it.push(['s_camphq', 28 * 8, 22 * 8, { team: 5 }]); it.push(['s_camphq_communism', 4 * 8, 22 * 8, { team: 4 }]); it.push(['s_watchtower', 8 * 8, 23 * 8, null]);
    dsort(c, it);
  } };
  AUS.see = { size: [72, 44], draw: function (c, P) {
    var rows = []; for (var y = 0; y < 44; y++) { rows.push([]); for (var x = 0; x < 72; x++) { var t = y < 24 ? T.WATER : (y < 30 ? (y === 29 && x > 30 ? T.SAND : T.GRASS) : (y === 30 ? T.SHALLOW : (y < 34 ? T.WATER : T.DEEP))); if (x >= 34 && y >= 24) { t = y < 28 ? T.GRASS : (y < 29 ? T.SAND : (y < 31 ? T.SHALLOW : (y < 38 ? T.WATER : T.DEEP))); } rows[y].push(t); } }
    P.groundRect(c, rows, 0, 0);
    var it = [], ST = [['tribe', null], ['monarchy', null], ['fascism', null], ['communism', null], ['monarchy', 'nord'], ['monarchy', 'sahel'], ['monarchy', 'nil']];
    ST.forEach(function (s, j) {
      ['fishboat', 'trader', 'transport', 'warship'].forEach(function (k, i) { ['e', 'w', 'n', 's'].forEach(function (d, q) {
        it.push([S.shipKey(k, s[0], d, q & 1, s[1]), 10 + (i * 4 + q) * 22 + i * 16, 18 + j * 25, { team: (j * 3 + 1) % 12 }]); }); });
    });
    dsort(c, it);
    var it2 = [];
    ['mitte', 'republic', 'nord', 'sahel', 'nil', 'steam', 'tribe'].forEach(function (st, i) { it2.push(['s_harbor_' + st + '_s', 2 * 8 + i * 4 * 8, 27 * 8, { team: i + 2 }]); });
    // Küstenszene rechts: Hafen einer Handelsrepublik, Fischerboot, Handelssegler, Dampfer, Kielwasser, Wrack
    it2.push(['s_harbor_republic_s', 40 * 8, 26 * 8, { team: 7 }]); it2.push([S.houseKey('republic', 2, 1), 37 * 8, 26 * 8, { team: 7 }]); it2.push([S.houseKey('republic', 1, 3), 44 * 8, 26 * 8, { team: 7 }]);
    it2.push(['s_harbor_steam_s', 56 * 8, 26 * 8, { team: 0 }]); it2.push([S.houseKey('fascism', 2, 0), 60 * 8, 26 * 8, { team: 0 }]);
    it2.push(['fx_wake_1', 47 * 8 - 10, 34 * 8, null, false]); it2.push([S.shipKey('trader', 'republic', 'e', 0), 47 * 8, 34 * 8, { team: 7 }]);
    it2.push([S.shipKey('fishboat', 'republic', 'w', 1), 39 * 8, 32 * 8, { team: 7 }]);
    it2.push(['fx_wake_2', 61 * 8 + 4, 36 * 8, { flip: true }]); it2.push([S.shipKey('trader', 'fascism', 'w', 0), 59 * 8, 36 * 8, { team: 0 }]); it2.push(['fx_shipsmoke_1', 59 * 8 + 1, 36 * 8 - 17, null]);
    it2.push([S.shipKey('warship', 'communism', 's', 1), 68 * 8, 41 * 8, { team: 4 }]);
    it2.push(['d_wreck_ship', 52 * 8, 31 * 8, null]); it2.push(['fx_splash_1', 66 * 8, 39 * 8, null]);
    for (var f = 0; f < 4; f++) { it2.push(['fx_wake_' + f, 2 * 8 + f * 16, 33 * 8, null]); it2.push(['fx_splash_' + f, 2 * 8 + f * 12, 36 * 8, null]); }
    dsort(c, it2);
    ['i_ship', 'i_harbor'].forEach(function (k, i) { c.fillStyle = '#1d3b47'; c.fillRect(2 + i * 20, 41 * 8, 18, 18); S.draw(c, k, 3 + i * 20, 41 * 8 + 1); });
  } };
  AUS.lagerbahn = { size: [48, 28], draw: function (c, P) {
    var rows = []; for (var y = 0; y < 28; y++) { rows.push([]); for (var x = 0; x < 48; x++) rows[y].push(x > 36 && y < 7 ? T.HILL : T.GRASS); }
    P.groundRect(c, rows, 0, 0);
    for (y = 3; y < 23; y++) for (x = 3; x < 32; x++) S.draw(c, S.softKey('t_cleared', ((y > 3) ? 1 : 0) | ((x < 31) ? 2 : 0) | ((y < 22) ? 4 : 0) | ((x > 3) ? 8 : 0)), x * 8, y * 8);
    var RL = {}; [19, 21].forEach(function (ry) { for (var rx = 0; rx < 31; rx++) RL[rx + ',' + ry] = 1; });
    function rail(x, y) { return !!RL[x + ',' + y]; }
    Object.keys(RL).forEach(function (k) { var p = k.split(',').map(Number), m = (rail(p[0], p[1] - 1) ? 1 : 0) | (rail(p[0] + 1, p[1]) ? 2 : 0) | (rail(p[0], p[1] + 1) ? 4 : 0) | (rail(p[0] - 1, p[1]) ? 8 : 0); if (p[0] === 30) m &= ~2; if (p[0] === 0) m |= 8; S.drawRail(c, p[0] * 8, p[1] * 8, m); });
    var it = [], F = {};
    for (x = 2; x <= 32; x++) { F[x + ',2'] = 1; F[x + ',23'] = 1; } for (y = 2; y <= 23; y++) { F['2,' + y] = 1; F['32,' + y] = 1; }
    function has(x, y) { return !!F[x + ',' + y]; }
    Object.keys(F).forEach(function (k) { var p = k.split(',').map(Number), m = (has(p[0], p[1] - 1) ? 1 : 0) | (has(p[0] + 1, p[1]) ? 2 : 0) | (has(p[0], p[1] + 1) ? 4 : 0) | (has(p[0] - 1, p[1]) ? 8 : 0);
      var key = (p[0] === 2 && (p[1] === 19 || p[1] === 21)) ? S.gateKey('fence', 1, 'v', true) : (p[1] === 23 && p[0] === 17 ? S.gateKey('fence', 1, 'h') : S.wallKey('fence', 1, m)); it.push([key, p[0] * 8, p[1] * 8, null]); });
    [[3, 3], [31, 3], [3, 22], [31, 22]].forEach(function (p) { it.push(['s_watchtower', p[0] * 8, p[1] * 8, null]); });
    it.push([S.campBuildKey('camphq', 'fascism'), 16 * 8, 7 * 8, { team: 0 }]); it.push([S.flagKey('pole', 0, 1, 0, 'fascism'), 19 * 8, 9 * 8, { team: 0 }]);
    [[5, 5], [9, 5], [23, 5], [27, 5], [5, 11], [9, 11], [23, 11], [27, 11]].forEach(function (p) { it.push(['s_barrack', p[0] * 8, p[1] * 8, null]); });
    it.push(['s_camp_station', 12 * 8, 17 * 8, null]); it.push(['s_camp_station', 22 * 8, 17 * 8, null]);
    it.push([S.mineKey('iron'), 38 * 8, 5 * 8, { team: 0 }]); it.push(['s_quarry', 42 * 8, 4 * 8, { team: 0 }]);
    // Güterzug am oberen Gleis (Abholung), Gefangenenzug am unteren Gleis (Ankunft)
    var fr = [S.trainKey('loco', null, 'e'), S.trainKey('car', 'ore', 'e'), S.trainKey('car', 'stone', 'e'), S.trainKey('car', 'timber', 'e'), S.trainKey('car', 'crates', 'e'), S.trainKey('car', 'coal', 'e')];
    fr.forEach(function (k, i) { it.push([k, (28 - i * 2) * 8, 19 * 8, { team: 0 }]); });
    var pr = [S.trainKey('loco', null, 'e'), S.trainKey('car', 'guard', 'e', 'fascism'), S.trainKey('car', 'prison', 'e', 'fascism'), S.trainKey('car', 'prison', 'e', 'fascism'), S.trainKey('car', 'guard', 'e', 'fascism')];
    pr.forEach(function (k, i) { it.push([k, (22 - i * 2) * 8, 21 * 8, { team: 0 }]); });
    // Ankunft: Gefangene steigen aus und gehen bewacht zur Baracke
    [[17, 20, 'human', 'prisoner'], [16, 18, 'elf', 'prisoner'], [15, 16, 'human', 'pow'], [15, 14, 'dwarf', 'prisoner'], [14, 15, 'human', 'pow'], [13, 13, 'human', 'prisoner'], [12, 14, 'orc', 'pow'], [11, 15, 'human', 'pow']].forEach(function (u, k) { it.push([S.unitKey(u[2], u[3], u[3] === 'pow' ? 'communism' : 'fascism', k % 4), u[0] * 8 + (k & 1) * 3, u[1] * 8, { team: 4, flip: true }]); });
    [[18, 17], [10, 13], [16, 12]].forEach(function (p, k) { it.push([S.unitKey('human', 'soldier', 'fascism', 4), p[0] * 8, p[1] * 8, { team: 0 }]); });
    it.push([S.unitKey('human', 'soldier', 'fascism', 1), 25 * 8, 19 * 8 - 6, { team: 0 }]);
    // Arbeiter an der Rampe verladen Steine
    [[23, 17], [25, 17]].forEach(function (p, k) { it.push([S.unitKey('human', 'prisoner', 'fascism', 2 + k), p[0] * 8, p[1] * 8, null]); });
    dsort(c, it);
    it = []; ['tr_car_prison_fascism_e', 'tr_car_prison_communism_e', 'tr_car_prison_plain_e', 'tr_car_guard_communism_e', 'tr_car_guard_plain_e', 'tr_car_prison_fascism_s', 'tr_car_guard_fascism_s', 'tr_car_ore_n', 'tr_car_timber_s', 'tr_car_stone_e'].forEach(function (k, i) { it.push([k, 36 * 8 + (i % 5) * 18, (14 + Math.floor(i / 5) * 5) * 8, { team: [0, 4, 6][i % 3] }]); });
    dsort(c, it);
  } };
  AUS.nachbesserung = { size: [60, 24], draw: function (c, P) {
    var rows = []; for (var y = 0; y < 24; y++) { rows.push([]); for (var x = 0; x < 60; x++) rows[y].push(x >= 30 ? T.DESERT : T.GRASS); }
    P.groundRect(c, rows, 0, 0);
    var it = [];
    ['fascism', 'communism', 'monarchy', 'democracy', 'republic', 'theocracy', 'anarchy'].forEach(function (gv, i) { it.push([S.unitKey('human', 'soldier', gv, 4), 6 + i * 13, 22, { team: [5, 3, 1, 4, 7, 9, 6][i] }]); it.push([S.unitKey('human', 'soldier', gv, 1), 6 + i * 13, 44, { team: 0 }]); });
    it.push([S.unitKey('human', 'leader', 'fascism', 4), 100, 22, { team: 2 }]); it.push([S.unitKey('human', 'leader', 'communism', 4), 112, 22, { team: 2 }]);
    ['tribe', 'monarchy', 'democracy', 'theocracy', 'republic', 'anarchy'].forEach(function (gv, i) { it.push([S.flagKey('pole', i + 1, 0, i + 2, gv), 6 + i * 20, 90, { team: i + 2 }]); });
    ['fascism', 'communism', 'monarchy'].forEach(function (gv, j) { ['n', 's'].forEach(function (d, i) { it.push([S.vehicleKey('tank', gv, d, i), 140 + (j * 2 + i) * 16, 30, { team: j * 4 }]); }); });
    for (var f = 0; f < 4; f++) it.push(['fx_shell_' + f, 140 + f * 18, 62, null]);
    it.push(['s_monument_0', 32 * 8, 10 * 8, null]); it.push(['s_monument_1', 35 * 8, 10 * 8, null]); it.push(['s_monument_2', 38 * 8, 10 * 8, null]);
    it.push(['s_caravanserai', 44 * 8, 13 * 8, { team: 1 }]);
    it.push(['s_caravanserai', 50 * 8, 22 * 8, { team: 3 }]);
    dsort(c, it);
  } };
  AUS.kasernen = { size: [56, 22], draw: function (c, P) {
    var rows = []; for (var y = 0; y < 22; y++) { rows.push([]); for (var x = 0; x < 56; x++) rows[y].push(y >= 11 && x >= 28 ? (x < 40 ? T.DESERT : (x < 48 ? T.SAVANNA : T.TUNDRA)) : T.GRASS); }
    P.groundRect(c, rows, 0, 0);
    var it = [], L1 = [['fascism', null, 0], ['communism', null, 4], ['monarchy', null, 1], ['democracy', null, 5], ['republic', null, 7], ['theocracy', null, 9], ['tribe', null, 3]];
    L1.forEach(function (s, i) { it.push([S.garrisonKey(s[0], s[1]), 2 * 8 + i * 4 * 8, 8 * 8, { team: s[2] }]); it.push([S.unitKey('human', 'soldier', s[0], 4), 2 * 8 + i * 32 + 18, 9 * 8, { team: s[2] }]); });
    [['monarchy', 'sahel', 1], ['theocracy', 'nil', 3], ['monarchy', 'nord', 5], ['fascism', 'sahel', 0], ['communism', 'nord', 4]].forEach(function (s, i) { it.push([S.garrisonKey(s[0], s[1]), 29 * 8 + i * 5 * 8, 19 * 8, { team: s[2] }]); it.push([S.unitKey('human', 'soldier', s[0], 4, s[1]), 29 * 8 + i * 40 + 18, 20 * 8, { team: s[2] }]); });
    // Nachtfassungen
    ['fascism', 'monarchy', 'theocracy'].forEach(function (g, i) { it.push([S.litKey(S.garrisonKey(g)), 2 * 8 + i * 4 * 8, 19 * 8, { team: [0, 1, 9][i] }]); });
    dsort(c, it);
    c.fillStyle = 'rgba(16,20,48,0.45)'; c.fillRect(0, 11 * 8, 13 * 8, 11 * 8);
    it = []; ['fascism', 'monarchy', 'theocracy'].forEach(function (g, i) { it.push([S.litKey(S.garrisonKey(g)), 2 * 8 + i * 4 * 8, 19 * 8, { team: [0, 1, 9][i] }]); }); dsort(c, it);
    // Besetzte Stadt: Marke über einem Haus, Icons
    S.draw(c, S.houseKey('monarchy', 2, 0), 16 * 8, 19 * 8, { team: 1 }); S.draw(c, 'i_occupied', 16 * 8 + 1, 15 * 8 - 6, { team: 0 });
    ['i_garrison', 'i_occupied'].forEach(function (k, i) { c.fillStyle = '#1d3b47'; c.fillRect(22 * 8 + i * 20, 13 * 8, 18, 18); S.draw(c, k, 22 * 8 + 1 + i * 20, 13 * 8 + 1, { team: 0 }); });
  } };
  AUS.megastadt = { size: [64, 50], draw: function (c, P) {
    var W = 64, H = 50, rows = [], x, y;
    for (y = 0; y < H; y++) { rows.push([]); for (x = 0; x < W; x++) rows[y].push(T.GRASS); }
    P.groundRect(c, rows, 0, 0);
    var X0 = 2, Y0 = 3, X1 = 61, Y1 = 47, team = 0, it = [], occ = {};
    for (y = Y0 + 1; y < Y1; y++) for (x = X0 + 1; x < X1; x++) S.draw(c, S.softKey('t_barren_1', 15), x * 8, y * 8);
    // Prachtstraße und Aufmarschplatz
    var PG = {}; for (y = 12; y < Y1; y++) for (x = 30; x <= 33; x++) PG[x + ',' + y] = 1; for (y = 12; y <= 18; y++) for (x = 22; x <= 41; x++) PG[x + ',' + y] = 1;
    function pg(x, y) { return !!PG[x + ',' + y]; }
    Object.keys(PG).forEach(function (k) { var p = k.split(',').map(Number), m = (pg(p[0], p[1] - 1) ? 1 : 0) | (pg(p[0] + 1, p[1]) ? 2 : 0) | (pg(p[0], p[1] + 1) ? 4 : 0) | (pg(p[0] - 1, p[1]) ? 8 : 0); S.draw(c, 's_deco_parade_ground_' + m, p[0] * 8, p[1] * 8); occ[k] = 1; });
    function mark(x, y, w, h) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) occ[(x + i) + ',' + (y + j)] = 1; }
    function free(x, y, w, h) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) if (occ[(x + i) + ',' + (y + j)] || x + i <= X0 || x + i >= X1 || y + j <= Y0 || y + j >= Y1) return false; return true; }
    function put(k, x, y, w, h) { it.push([k, x * 8, (y + h - 1) * 8 - (h - 1) * 8, { team: team }]); mark(x, y, w, h); }
    put('s_center_fascism_4', 30, 9, 3, 3); mark(29, 8, 5, 4);
    put('s_deco_parade_tribune', 30, 18, 2, 1);
    for (y = 20; y < Y1 - 1; y += 2) { it.push([y % 4 ? 's_deco_parade_lamp' : 's_deco_parade_mast', 29 * 8, y * 8, { team: team }]); it.push([y % 4 ? 's_deco_parade_lamp' : 's_deco_parade_mast', 34 * 8, y * 8, { team: team }]); mark(29, y, 1, 1); mark(34, y, 1, 1); }
    [[22, 12], [41, 12], [22, 18], [41, 18]].forEach(function (p) { it.push(['s_deco_parade_column', p[0] * 8, p[1] * 8, null]); });
    for (x = 23; x < 41; x += 3) { it.push(['s_deco_parade_mast', x * 8, 11 * 8, { team: team }]); mark(x, 11, 1, 1); }
    put('s_warworks', 50, 6, 3, 3); put('s_warworks', 54, 6, 3, 3); put('s_arsenal_fascism', 50, 10, 3, 2); put('s_arsenal_fascism', 54, 10, 3, 2);
    put(S.garrisonKey('fascism'), 4, 5, 2, 2); put(S.garrisonKey('fascism'), 57, 42, 2, 2); put(S.garrisonKey('fascism'), 4, 42, 2, 2); put(S.garrisonKey('fascism'), 36, 21, 2, 2); put(S.garrisonKey('fascism'), 26, 21, 2, 2);
    put(S.stationKey('fascism'), 44, 6, 2, 2);
    mark(24, 4, 16, 7);
    for (y = Y0 + 2; y < Y1 - 1; y += 4) for (x = X0 + 2; x < X1 - 1; x += 3) if (free(x, y, 2, 2)) { var d = Math.abs(x - 31) + Math.abs(y - 10); put(S.houseKey('fascism', y < 12 ? 3 : (d < 24 ? 5 : (d < 36 ? 4 : 3)), x + y), x, y, 2, 2); }
    [[25, 6], [37, 6]].forEach(function (p) { it.push(['s_deco_parade_column', p[0] * 8, p[1] * 8, null]); });
    // Mauerring Stufe 6, Tore an jeder Seite
    var R = {}; for (x = X0; x <= X1; x++) { R[x + ',' + Y0] = 1; R[x + ',' + Y1] = 1; } for (y = Y0; y <= Y1; y++) { R[X0 + ',' + y] = 1; R[X1 + ',' + y] = 1; }
    function wr(x, y) { return !!R[x + ',' + y]; }
    Object.keys(R).forEach(function (k) { var p = k.split(',').map(Number), m = (wr(p[0], p[1] - 1) ? 1 : 0) | (wr(p[0] + 1, p[1]) ? 2 : 0) | (wr(p[0], p[1] + 1) ? 4 : 0) | (wr(p[0] - 1, p[1]) ? 8 : 0), key;
      if ((p[1] === Y1 || p[1] === Y0) && (p[0] === 31 || p[0] === 32)) key = S.gateKey('fascism', 6, 'h'); else if ((p[0] === X0 || p[0] === X1) && p[1] === 25) key = S.gateKey('fascism', 6, 'v');
      else if ((m === 6 || m === 12 || m === 3 || m === 9) || (p[0] - X0) % 12 === 0 && (p[1] === Y0 || p[1] === Y1)) key = S.towerKey('fascism', 6) || S.wallKey('fascism', 6, m); else key = S.wallKey('fascism', 6, m);
      it.push([key, p[0] * 8, p[1] * 8, { team: team }]); });
    // Aufmarsch: Soldatenblöcke auf dem Platz und der Straße, Panzer vor der Tribüne
    for (y = 13; y <= 16; y++) for (x = 24; x <= 28; x++) it.push([S.unitKey('human', 'soldier', 'fascism', 4), x * 8, y * 8, { team: team }]);
    for (y = 13; y <= 16; y++) for (x = 35; x <= 39; x++) it.push([S.unitKey('human', 'soldier', 'fascism', 4), x * 8, y * 8, { team: team, flip: true }]);
    for (y = 22; y < 40; y += 3) { it.push([S.vehicleKey('tank', 'fascism', 'n', y & 1), 31 * 8, y * 8, { team: team }]); it.push([S.unitKey('human', 'soldier', 'fascism', (y >> 1) & 3), 32 * 8 + 4, y * 8 + 8, { team: team }]); }
    it.push([S.unitKey('human', 'leader', 'fascism', 4), 31 * 8, 18 * 8 - 6, { team: team }]);
    dsort(c, it);
  } };
  WW.SpriteScene_AUS = AUS;

  WW.SpriteScene = { renderEffects: renderEffects, renderLandscapeHi: renderLandscapeHi, renderTownCompare: renderTownCompare, renderRailway: renderRailway, renderPollutionStages: renderPollutionStages, renderFlags: renderFlags, renderIndustry: renderIndustry, renderStages: renderStages, render: render, renderTowns: renderTowns, renderDestruction: renderDestruction, W: W, H: H, buildTerrain: buildTerrain, ausbau: AUS };
})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
