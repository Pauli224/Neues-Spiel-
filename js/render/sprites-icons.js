// Wuselwelt – Pixelkunst: UI-Icons (16×16, mit dunkler Kontur, für helle wie dunkle Tafeln).
// Inhalt wird auf 14×14 gezeichnet und danach umrandet. Abruf über WW.Sprites.iconCanvas(key, scale).
(function (WW) { 'use strict';

  (WW._spriteBuilders = WW._spriteBuilders || []).push(function (L) {
    var Grid = L.Grid, def = L.def;

    function icon(key, fn) {
      var g = new Grid(14, 14);
      if (typeof fn === 'function') fn(g); else g.paint(0, 0, fn);
      def(key, g.pad(1, 1, 1, 1).outline(), { group: 'icon', anchor: 'icon' });
    }
    function ring(g, cx, cy, r, w, c) {
      g.ellipse(cx, cy, r, r, function (x, y, nx, ny) { return (nx * nx + ny * ny) > Math.pow(1 - w / r, 2) ? c : null; });
    }
    function shade(fnL, fnM, fnD) { return function (x, y, nx, ny) { var s = nx + ny; return s < -0.6 ? fnL : (s > 0.6 ? fnD : fnM); }; }
    function plus(g, cx, cy, c) { g.hline(cx - 1, cy, 3, c); g.vline(cx, cy - 1, 3, c); }

    // ------------------------------------------------------------ Werkzeuge: Schauen, Land
    icon('i_inspect', function (g) {
      g.ellipse(5.5, 5.5, 4.6, 4.6, shade('white', 'glass', 'waterD'));
      ring(g, 5.5, 5.5, 5.2, 1.4, 'stoneL');
      g.set(4, 3, 'white'); g.set(3, 4, 'white');
      g.line(9, 9, 12, 12, 'woodD'); g.line(10, 9, 13, 12, 'wood'); g.line(9, 10, 12, 13, 'woodD');
    });
    icon('i_water', [
      '......D.......',
      '......D.......',
      '.....DDD......',
      '.....DDD......',
      '....DDDDD.....',
      '....JDDDD.....',
      '...JJDDDDD....',
      '...JDDDDDD....',
      '..JlDDDDDDD...',
      '..JlDDDDDDB...',
      '..JJDDDDDDB...',
      '...JDDDDDB....',
      '....DDDDB.....',
      '.....BBB......']);
    icon('i_sand', [
      '..............',
      '..............',
      '..............',
      '..............',
      '......za......',
      '....zzaaaA....',
      '...zaaaaaAA...',
      '..zaaaaaaaAA..',
      '.zaaaAaaaaaA..',
      '.zaaaaaaaaaAA.',
      'zaaaaaAaaaaaAA',
      'zaaaaaaaaaaaAA',
      'AAAAAAAAAAAAAA']);
    icon('i_grass', [
      '..............',
      '..............',
      '.....f....f...',
      '..f..f...fe...',
      '..fe.fe..e....',
      '...efee.ee..f.',
      '...eeEe.eE.fe.',
      '.f.eEeE.eE.e..',
      '.fe.EeEeEEee..',
      '..eeEEEEEEEe..',
      '..EEEEEEEEEE..',
      '.hhhhhhhhhhhh.',
      '.WWWWWWWWWWWW.']);
    icon('i_forest', [
      '.....efee.....',
      '...effffeee...',
      '..efffeeeeee..',
      '.effeeeeeeeEE.',
      '.efeeeeeeeeEE.',
      '.eeeeeeeeeEEE.',
      '.eeeeeeeeEEEE.',
      '..eeeeeeEEEE..',
      '...EEEEEEEE...',
      '.....EwWE.....',
      '......wW......',
      '......wW......',
      '.....wwWW.....']);
    icon('i_hill', [
      '..............',
      '..............',
      '..............',
      '..............',
      '.....ffff.....',
      '...ffiiiiee...',
      '..fiiiiiiieE..',
      '.fiiiIiiiIeEE.',
      '.iiiiiiiiieeE.',
      'fiiIiiiiIiieEE',
      'iiiiiiiiiiiieE',
      'hhhhhhhhhhhhhh',
      'WWWWWWWWWWWWWW']);
    icon('i_mountain', [
      '..............',
      '......l.......',
      '.....llN......',
      '....lllNN.....',
      '....lqlNG.....',
      '...qqgNGGG....',
      '...qgggGGG....',
      '..qggggGGGG...',
      '..qgggggGGG...',
      '.qggggggGGGG..',
      '.qgggGgggGGGG.',
      'qgggggggggGGGG',
      'qggggggggGGGGG']);

    // ------------------------------------------------------------ Leben
    icon('i_settlers', [
      '..............',
      '..WWW.........',
      '.WssS....WWW..',
      '.ssoS...WssS..',
      '..sS....ssoS..',
      '.uTTt....sS...',
      'sTTTts..uTTt..',
      '.TTTt..sTTTts.',
      '.TTTt...TTTt..',
      '.W.W....TTTt..',
      '.W.W....W.W...',
      '........W.W...']);
    icon('i_sheep', [
      '..............',
      '..............',
      '...lll........',
      '..llllll.OO...',
      '.lllllllcOOd..',
      'llllllllllOd..',
      'lllllllllO....',
      '.lllllllll....',
      '.cccccccc.....',
      '..O.O..O.O....',
      '..O.O..O.O....']);
    icon('i_wolf', [
      '..............',
      '.........G.G..',
      '........GgGg..',
      '.G.....Gggggq.',
      '..G....GgggggO',
      '..GgggggggGG..',
      '..ggggggggg...',
      '..gGGggggGG...',
      '..G.G...G.G...',
      '..G.G...G.G...']);

    // ------------------------------------------------------------ Regierungen (Kopfbedeckung des Anführers)
    icon('i_gov_tribe', [
      '..............',
      'c............c',
      'cc..........cc',
      '.cc........cc.',
      '..cc.mmmm.cc..',
      '...cmnmmmmc...',
      '...mnmmmmmM...',
      '..mnmmmmmmMM..',
      '..mmmmmmmmMM..',
      '..MMMMMMMMMM..',
      '..kKkKkKkKkK..']);
    icon('i_gov_monarchy', [
      '..............',
      '..j....j....j.',
      '..jk..jkk..jk.',
      '..kk..kkk..kk.',
      '..kkjkkkkjkkK.',
      '..kkkkkrkkkkK.',
      '..kkkkrRrkkkK.',
      '..kkkkkrkkkkK.',
      '..KKKKKKKKKKK.',
      '..jkjkjkjkjkK.',
      '..KKKKKKKKKKK.']);
    icon('i_gov_democracy', [
      '.....lllc.....',
      '.....lddc.....',
      '.....lccc.....',
      '...WWWWWWWW...',
      '..vvvvvvvvvW..',
      '..vTTTTTTTtW..',
      '..vTlllllTtW..',
      '..vTTTTTTTtW..',
      '..vwwwwwwwwW..',
      '..vwwwwwwwwW..',
      '..vwwwwwwwwW..',
      '..WWWWWWWWWW..']);
    icon('i_gov_fascism', [
      '..............',
      '..............',
      '..............',
      '...qqqqqqqq...',
      '..qqggggggggG.',
      '..qgggggggggG.',
      '..GggggggggGG.',
      '...GGGGGGGGG..',
      '...MMMMMMMM...',
      '...OOOOOOOOOO.',
      '.......OOOOOO.']);
    icon('i_gov_communism', [
      '..............',
      '..............',
      '..............',
      '....vvvvvv....',
      '...vwwvwwwW...',
      '..vwwwwwwwwW..',
      '..wwwwwwwwwwW.',
      '..wWwwwwwwwwW.',
      '..WWWWWWWWWWWW',
      '...WWWWWWWWWWW',
      '..............']);
    icon('i_gov_theocracy', [
      '......l.......',
      '.....llN......',
      '....lllNN.....',
      '....llkNN.....',
      '...lllkNNN....',
      '...llkkkNN....',
      '...lllkNNN....',
      '...lllkNNN....',
      '...lllkNNN....',
      '...kkkkkkK....',
      '...lllkNNN....',
      '...lllkNNN....']);
    icon('i_gov_republic', [
      '.ll...........',
      'lllc..........',
      '.llcc.........',
      '..lcc.........',
      '...cc.........',
      '....rrrrrr....',
      '...rrrrrrrR...',
      '...rrrrrrrRR..',
      '.RRRRRRRRRRRRR',
      '..RRRRRRRRRRR.']);
    icon('i_gov_anarchy', [
      '.W............',
      '.WrrPPkkk.....',
      '.WrrPPkkkb....',
      '.WTTyyppbbb...',
      '.WTTyyppbb....',
      '.Wffrrbbb.....',
      '.W............',
      '.W............',
      '.W............',
      '.W............',
      '.W............',
      'WWW...........']);
    icon('i_war', function (g) {
      g.line(1, 1, 10, 10, 'metalL'); g.line(2, 1, 11, 10, 'metal'); g.line(1, 2, 10, 11, 'metalD');
      g.line(12, 1, 3, 10, 'metalL'); g.line(11, 1, 2, 10, 'metal'); g.line(12, 2, 3, 11, 'metalD');
      g.line(8, 11, 11, 8, 'gold'); g.line(5, 11, 2, 8, 'gold');
      g.rect(11, 11, 2, 2, 'woodD'); g.rect(1, 11, 2, 2, 'woodD');
      g.set(12, 13, 'gold'); g.set(1, 13, 'gold');
    });
    icon('i_peace', [
      '.W............',
      '.Wlllllll.....',
      '.Wllllllllc...',
      '.Wlllllllcc...',
      '.Wllllllcc....',
      '.Wllllllc.....',
      '.Wccc.........',
      '.W............',
      '.W............',
      '.W............',
      '.W............',
      'WWW...........']);
    icon('i_alliance', function (g) {
      ring(g, 4.8, 7, 4.2, 1.6, 'gold'); ring(g, 9.2, 7, 4.2, 1.6, 'T');
      // Verschränkung: oben links liegt der goldene Ring vorn
      g.set(7, 4, 'gold'); g.set(7, 5, 'gold'); g.set(6, 4, 'gold');
      g.set(1, 6, 'goldL'); g.set(2, 4, 'goldL'); g.set(9, 3, 'Tl'); g.set(11, 4, 'Tl');
    });

    // ------------------------------------------------------------ Kräfte
    icon('i_lightning', [
      '.......jjjj...',
      '......jFFQ....',
      '.....jFFQ.....',
      '....jFFQ......',
      '...jFFFFFFF...',
      '...QQQFFFQ....',
      '.....jFFQ.....',
      '....jFFQ......',
      '...jFQ........',
      '..jFQ.........',
      '..FQ..........',
      '.F............']);
    icon('i_fire', [
      '......j.......',
      '.....jF.......',
      '.....FF...j...',
      '....jFFQ..F...',
      '...jFFFQ.FF...',
      '...FFjFFQFQ...',
      '..QFFjjFFFQQ..',
      '..QFjjjjFFQQ..',
      '.QQFjjjjjFFQR.',
      '.QQFFjjjFFQQR.',
      '.RQQFFFFFQQRR.',
      '..RQQQQQQQRR..',
      '...RRRRRRRR...']);
    icon('i_rain', [
      '.....lll......',
      '...lllllNl....',
      '..llllllllN...',
      '.lllllllllNN..',
      'lllllllllllNN.',
      'NNNNNNNNNNNNN.',
      '..............',
      '..b...b...b...',
      '.b...b...b....',
      '..............',
      '...b...b...b..',
      '..b...b...b...']);
    icon('i_meteor', [
      'j.............',
      '.jF...........',
      '..FQ..........',
      '..QFQj........',
      '...QQFF.......',
      '....RQQgGG....',
      '.....QgqgGG...',
      '.....ggggGGG..',
      '.....gGggGGG..',
      '......GGgGG...',
      '.......GGG....']);
    icon('i_plague', [
      '..............',
      '....XXXXX.....',
      '...XXXXXXX....',
      '..XXllXllXX...',
      '..XXloXloXX...',
      '..XXXXXXXXX...',
      '...XXXlXXX....',
      '....XXXXX.....',
      '....X.X.X.....',
      '..X.......X...',
      '.X..X...X..X..',
      '....X...X.....']);
    icon('i_bless', function (g) {
      g.line(7, 0, 7, 13, 'goldL'); g.line(0, 7, 13, 7, 'goldL');
      g.line(3, 3, 10, 10, 'gold'); g.line(10, 3, 3, 10, 'gold');
      g.ellipse(7, 7, 3, 3, shade('white', 'goldL', 'gold'));
      g.set(7, 7, 'white');
    });

    // ------------------------------------------------------------ Tempo
    icon('i_pause', function (g) { g.rect(3, 2, 3, 10, 'white'); g.rect(8, 2, 3, 10, 'white'); g.vline(5, 2, 10, 'snowD'); g.vline(10, 2, 10, 'snowD'); });
    function tri(g, x, y, h, c, cd) { for (var j = 0; j < h; j++) { var w = Math.min(j, h - 1 - j) + 1; g.hline(x, y + j, w, c); g.set(x + w - 1, y + j, cd); } }
    icon('i_play', function (g) { tri(g, 4, 1, 12, 'white', 'snowD'); });
    icon('i_fast', function (g) { tri(g, 1, 2, 10, 'white', 'snowD'); tri(g, 7, 2, 10, 'white', 'snowD'); });
    icon('i_faster', function (g) { tri(g, 0, 3, 8, 'goldL', 'gold'); tri(g, 5, 3, 8, 'goldL', 'gold'); tri(g, 10, 3, 8, 'goldL', 'gold'); });

    // ------------------------------------------------------------ Menü und Welt
    icon('i_menu', function (g) { [2, 6, 10].forEach(function (y) { g.rect(1, y, 12, 2, 'white'); g.hline(1, y + 1, 12, 'snowD'); }); });
    icon('i_close', function (g) {
      g.line(2, 2, 11, 11, 'red'); g.line(3, 2, 12, 11, 'red'); g.line(2, 3, 11, 12, 'redD');
      g.line(11, 2, 2, 11, 'red'); g.line(12, 2, 3, 11, 'red'); g.line(12, 3, 3, 12, 'redD');
    });
    icon('i_chronicle', [
      '..............',
      '.cccccc.cccccc',
      'cllllllcllllll',
      'cldddllcldddlA',
      'cllllllclllllA',
      'clddddlcldddlA',
      'cllllllclllllA',
      'clddlllcldddlA',
      'cllllllclllllA',
      'clddddlclddllA',
      'cllllllclllllA',
      'WWWWWWWWWWWWWW',
      '.....WrRW.....',
      '......rR......']);
    icon('i_laws', [
      '..cccccccccc..',
      '.clllllllllcA.',
      '..cldddddlcA..',
      '..clllllllcA..',
      '..cldddddlcA..',
      '..clllllllcA..',
      '..cldddlllcA..',
      '..clllllllcA..',
      '..clddddrrrA..',
      '..clllllrRrr..',
      '.ccccccccrRr..',
      '..AAAAAA.rr...']);
    function chest(g) {
      g.rect(1, 6, 12, 7, 'wood'); g.hline(1, 6, 12, 'woodL'); g.vline(12, 6, 7, 'woodD');
      g.rect(1, 4, 12, 3, 'woodL'); g.hline(1, 4, 12, 'strawL'); g.hline(1, 7, 12, 'goldD');
      g.vline(1, 4, 9, 'goldD'); g.vline(12, 4, 9, 'goldD');
      g.rect(6, 7, 2, 3, 'gold'); g.set(6, 8, 'ink');
    }
    icon('i_save', function (g) {
      chest(g);
      g.rect(6, 0, 2, 3, 'leafL'); g.hline(4, 2, 6, 'leafL'); g.hline(5, 3, 4, 'leaf');
    });
    icon('i_load', function (g) {
      chest(g);
      g.hline(5, 0, 4, 'glass'); g.hline(4, 1, 6, 'glass'); g.rect(6, 2, 2, 2, 'glass');
    });
    function globe(g) {
      g.ellipse(7, 7, 6.5, 6.5, shade('waterL', 'water', 'waterD'));
      g.paint(2, 3, ['.ee....', 'efee..e', '.eeE.ee', '..eE.e.', '...E...']);
      g.paint(6, 8, ['..ee.', '.eeeE', '..eE.']);
      g.set(4, 3, 'white'); g.set(3, 4, 'waterL');
    }
    icon('i_newworld', function (g) { globe(g); g.paint(10, 0, ['..j.', '.jlj', '..j.']); });
    icon('i_cat_world', function (g) { globe(g); });
    icon('i_map', [
      '..............',
      '.ccc..aaa.ccc.',
      '.ccaaaaeaaccA.',
      '.caeeaaeeacAA.',
      '.caeeeaaeacAA.',
      '.caaebbbaacAA.',
      '.caabbbbbacAA.',
      '.cabbbbaaacAA.',
      '.caaabaarracA.',
      '.caaaaaaRracA.',
      '.cccaaaccccAA.',
      '..AAA..AAA.A..']);

    // ------------------------------------------------------------ Rohstoffe und Werte
    icon('i_food', [
      '..............',
      '..............',
      '....vvvvvv....',
      '..vvzvvzvvvw..',
      '.vzzvvzvvvzvw.',
      '.vvvvvvvvvvvw.',
      'vwvvvvvvvvvvww',
      'vwwvvwvvvwvvww',
      '.wwwwwwwwwwwW.',
      '..WWWWWWWWWW..']);
    icon('i_wood', [
      '..............',
      '..............',
      '.....wwwwwwww.',
      '....zyzwwwwwwW',
      '....yzywwwwwwW',
      '..wwzyzwwwwwW.',
      '.zyzwwwwwwwW..',
      '.yzywwwwwwwW..',
      '.zyzwwwwwwW...',
      '..wwwwwwwW....']);
    icon('i_stone', [
      '..............',
      '..............',
      '....qqqqq.....',
      '...qgggggG....',
      '...qggggGG....',
      '..qqqGGGqqqq..',
      '.qggggGqgggggG',
      '.qgggGGqggggGG',
      '.qggGGGqgggGGG',
      '.GGGGGGGGGGGG.']);
    icon('i_gold', [
      '..............',
      '......jjjj....',
      '.....jkkkkK...',
      '.....jkjkkK...',
      '..jjjjkkkKK...',
      '.jkkkkKKKK....',
      '.jkjkkK.jjjj..',
      '.jkkkkKjkkkkK.',
      '..KKKKjkjkkkK.',
      '......jkkkkKK.',
      '.......KKKKK..']);
    icon('i_pop', [
      '.....WWWW.....',
      '....WsssSW....',
      '....ssssSS....',
      '....ssssSS....',
      '.....sSSS.....',
      '...uTTTTTt....',
      '..uTTTTTTTt...',
      '..TTTTTTTTt...',
      '..sTTTTTTts...',
      '...TTTTTTt....',
      '...WW...WW....',
      '...WW...WW....']);
    icon('i_happy', function (g) {
      g.ellipse(7, 7, 6.5, 6.5, shade('goldL', 'gold', 'goldD'));
      g.rect(4, 4, 2, 2, 'ink'); g.rect(8, 4, 2, 2, 'ink');
      g.hline(4, 9, 6, 'ink'); g.set(3, 8, 'ink'); g.set(10, 8, 'ink'); g.hline(5, 10, 4, 'redD');
    });
    function padlock(g, open) {
      g.rect(2, 6, 10, 8, 'gold'); g.hline(2, 6, 10, 'goldL'); g.vline(11, 6, 8, 'goldD'); g.hline(2, 13, 10, 'goldD');
      g.rect(6, 8, 2, 3, 'ink'); g.set(6, 11, 'ink');
      var ox = open ? 4 : 0;
      ring(g, 7 + ox, 4.5, 3.5, 1.4, 'metal');
      if (open) for (var x = 0; x < 14; x++) for (var y = 5; y < 7; y++) if (x < 8 && g.get(x, y) === L.C.metal) g.d[y * 14 + x] = 0;
      for (x = 0; x < 14; x++) for (y = 6; y < 14; y++) if (g.get(x, y) === L.C.metal) g.set(x, y, 'gold');
      g.set(4 + ox, 2, 'metalL');
    }
    icon('i_lock', function (g) { padlock(g, false); });
    icon('i_unlock', function (g) { padlock(g, true); });
    icon('i_brush_s', function (g) { g.ellipse(7, 7, 1.6, 1.6, 'white'); });
    icon('i_brush_m', function (g) { g.ellipse(7, 7, 3.6, 3.6, shade('white', 'white', 'snowD')); });
    icon('i_brush_l', function (g) { g.ellipse(7, 7, 6.2, 6.2, shade('white', 'white', 'snowD')); });
    function lens(g) {
      g.ellipse(5.5, 5.5, 4.6, 4.6, 'glass'); ring(g, 5.5, 5.5, 5.2, 1.4, 'stoneL');
      g.line(9, 9, 12, 12, 'woodD'); g.line(10, 9, 13, 12, 'wood'); g.line(9, 10, 12, 13, 'woodD');
    }
    icon('i_zoom_in', function (g) { lens(g); g.hline(3, 5, 5, 'white'); g.vline(5, 3, 5, 'white'); });
    icon('i_zoom_out', function (g) { lens(g); g.hline(3, 5, 5, 'white'); });

    // ------------------------------------------------------------ Kategorien
    icon('i_cat_land', function (g) { // Schaufel im Erdhaufen
      g.paint(0, 9, ['...hhhhhh.....', '.hhwhhhhhhh...', 'hhhhhhwhhhhhW.', 'WWWWWWWWWWWWW.']);
      g.line(11, 0, 6, 8, 'woodL'); g.line(12, 1, 7, 8, 'wood');
      g.paint(3, 6, ['.nm', 'nmM', 'mMM', '.M.']);
      g.paint(11, 0, ['vw', 'wW']);
    });
    icon('i_cat_life', function (g) { // Herz mit Blatt
      g.paint(1, 2, [
        '.rrr...rrr..',
        'rpprr.rrrrR.',
        'rprrrrrrrrR.',
        'rrrrrrrrrrR.',
        '.rrrrrrrrR..',
        '..rrrrrrR...',
        '...rrrrR....',
        '....rrR.....',
        '.....R......']);
      g.paint(8, 0, ['..fe', '.feE', 'W...']);
    });
    icon('i_cat_rule', function (g) { // Banner in Teamfarbe mit Krönchen
      g.vline(2, 1, 13, 'woodD'); g.set(2, 0, 'gold');
      g.paint(3, 2, ['uTTTTTTTt', 'TTTkTkTTt', 'TTTkkkTTt', 'TTTTTTTTt', 'TTTTTTTTt', 'tTTt.tTTt', 'tt.....tt']);
    });
    icon('i_cat_power', function (g) { // Zauberstab mit Funken
      g.line(1, 12, 8, 5, 'woodD'); g.line(2, 12, 9, 5, 'wood');
      g.paint(7, 0, ['..j....', '.jlj.j.', 'jlllj..', '.jlj...', '..j..j.', '......j']);
      g.set(12, 9, 'purple'); g.set(11, 10, 'pink'); g.set(4, 2, 'purple');
    });
  });

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
