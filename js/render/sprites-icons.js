// Wuselwelt – Pixelkunst: UI-Icons (16×16, mit dunkler Kontur, für helle wie dunkle Tafeln).
// Inhalt wird auf 14×14 gezeichnet und danach umrandet. Abruf über WW.Sprites.iconCanvas(key, scale).
// Ausbau 9: i_tank, i_artillery, i_battle, i_pow, i_culture und die Zeichen e_<gov> (siehe Kopf von sprites.js).
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

    // ================================================================== Stufe 3: Kräfte-Icons
    function arrow(g, x, y, up, c, cd) {
      if (up) { g.hline(x + 2, y, 1, c); g.hline(x + 1, y + 1, 3, c); g.hline(x, y + 2, 5, c); g.rect(x + 1, y + 3, 3, 3, c); g.vline(x + 3, y + 3, 3, cd); }
      else { g.rect(x + 1, y, 3, 3, c); g.vline(x + 3, y, 3, cd); g.hline(x, y + 3, 5, c); g.hline(x + 1, y + 4, 3, c); g.hline(x + 2, y + 5, 1, cd); }
    }
    function landBlock(g, y) { g.rect(0, y, 14, 14 - y, 'soil'); g.hline(0, y, 14, 'grassL'); g.hline(0, y + 1, 14, 'grass'); }
    icon('i_raise', function (g) { landBlock(g, 9); g.ellipse(7, 9, 4, 3, function (x, y, nx, ny) { return ny < 0 ? (nx < 0 ? 'grassL' : 'grass') : null; }); arrow(g, 5, 0, true, 'goldL', 'gold'); });
    icon('i_lower', function (g) { landBlock(g, 8); g.ellipse(7, 9, 4, 2, function (x, y, nx, ny) { return ny > -0.2 ? 'soil' : null; }); g.hline(4, 9, 7, 'woodD'); arrow(g, 5, 0, false, 'glass', 'waterD'); });
    icon('i_seeds', [
      '..............',
      '....vwwwv.....',
      '...vwwwwwW....',
      '..vwwvwwwwW...',
      '..wwwwwwwwW...',
      '..wwwwwwwWW...',
      '...WWWWWWW....',
      '..........f...',
      '...y.....fe...',
      '..y.y...f.e...',
      '.....y....e...',
      '.hhhhhhhhhhhh.',
      '.WWWWWWWWWWWW.']);
    function bomb(g, r, cx, cy) {
      g.ellipse(cx, cy, r, r, function (x, y, nx, ny) { return nx + ny < -0.8 ? 'dusk' : (nx + ny > 0.6 ? 'ink' : 'plum'); });
      g.set(Math.round(cx - r * 0.4), Math.round(cy - r * 0.4), 'stoneL');
    }
    icon('i_bomb', function (g) { bomb(g, 4.5, 6, 8.5); g.rect(8, 3, 2, 2, 'stoneD'); g.line(10, 3, 12, 1, 'woodL'); g.set(12, 0, 'fireY'); g.set(13, 1, 'fireO'); g.set(11, 0, 'goldL'); });
    icon('i_earthquake', function (g) { landBlock(g, 5); g.line(7, 5, 5, 8, 'ink'); g.line(5, 8, 8, 10, 'ink'); g.line(8, 10, 6, 13, 'ink'); g.line(8, 5, 6, 8, 'plum'); g.line(1, 2, 3, 0, 'white'); g.line(10, 0, 12, 2, 'white'); g.line(0, 3, 1, 3, 'white'); });
    icon('i_volcano', [
      '....F..Q......',
      '...QFFQ.......',
      '....QQ........',
      '.....rQ.......',
      '....GrrG......',
      '...gGQrGG.....',
      '...ggrQGGG....',
      '..qgggQrGGG...',
      '..qggggrGGG...',
      '.qgggggQGGGG..',
      '.qggggggGGGG..',
      'qggggggggGGGG.',
      'GGGGGGGGGGGGG.']);
    icon('i_tornado', function (g) {
      for (var y = 0; y < 14; y++) { var half = 6.5 - y * 0.42, cx = 7 + Math.sin(y * 0.6) * 1.2; for (var x = 0; x < 14; x++) { var dx = x + 0.5 - cx; if (Math.abs(dx) <= half) g.set(x, y, ((y + Math.floor(dx)) & 3) === 0 ? 'stoneD' : (dx < 0 ? 'stoneL' : 'stone')); } }
    });
    icon('i_acidrain', [
      '.....XXX......',
      '...XXXXXfX....',
      '..XXXXXXXXX...',
      '.XXXXXXXXXXX..',
      'XXXXXXXXXXXXX.',
      'EEEEEEEEEEEEE.',
      '..............',
      '..f...f...f...',
      '.f...f...f....',
      '..............',
      '...f...f...f..',
      '..f...f...f...']);
    icon('i_flood', function (g) {
      g.rect(0, 6, 14, 8, 'water'); for (var x = 0; x < 14; x++) { var y = 6 + Math.round(Math.sin(x * 0.9) * 1.2); g.set(x, y - 1, 'white'); g.set(x, y, 'waterL'); for (var yy = 0; yy < y - 1; yy++) g.set(x, yy, 0); }
      g.paint(2, 0, ['.vw.', 'vwwW', 'WccW']);
    });
    icon('i_frost', function (g) {
      g.line(7, 0, 7, 13, 'white'); g.line(0, 7, 13, 7, 'white'); g.line(2, 2, 12, 12, 'snowD'); g.line(12, 2, 2, 12, 'snowD');
      [[7, 2], [7, 11], [2, 7], [11, 7]].forEach(function (p) { g.set(p[0] - 1, p[1], 'glass'); g.set(p[0] + 1, p[1], 'glass'); g.set(p[0], p[1] - 1, 'glass'); g.set(p[0], p[1] + 1, 'glass'); });
      g.set(7, 7, 'glass');
    });
    icon('i_drought', function (g) {
      g.ellipse(9, 4, 3.5, 3.5, function (x, y, nx, ny) { return nx + ny < -0.4 ? 'goldL' : 'fireY'; });
      g.set(9, 0, 'fireO'); g.set(13, 4, 'fireO'); g.set(5, 4, 'fireO');
      g.rect(0, 9, 14, 5, 'sand'); g.hline(0, 9, 14, 'strawL');
      g.line(2, 10, 4, 12, 'sandD'); g.line(4, 12, 7, 11, 'sandD'); g.line(7, 11, 9, 13, 'sandD'); g.line(9, 10, 12, 12, 'sandD');
      g.paint(1, 6, ['.W.', 'WWW', '.W.']);
    });
    icon('i_madness', function (g) {
      g.ellipse(7, 7, 6.5, 6.5, 'pink');
      for (var a = 0; a < 26; a++) { var r = a * 0.24, t = a * 0.55; g.set(Math.round(7 + Math.cos(t) * r), Math.round(7 + Math.sin(t) * r), 'purple'); }
    });
    icon('i_love', [
      '..............',
      '..rrr...rrr...',
      '.rpprr.rrrrR..',
      '.rprrrrrrrrR..',
      '.rrrrrrrrrrR..',
      '..rrrrrrrrR...',
      '...rrrrrrR....',
      '....rrrrR.....',
      '.....rrR......',
      '......R.......']);
    icon('i_goldrain', [
      '.....lll......',
      '...lllllNl....',
      '..llllllllN...',
      '.lllllllllNN..',
      'NNNNNNNNNNNN..',
      '..............',
      '..jk...jk.....',
      '..kK...kK..jk.',
      '.....jk....kK.',
      '.....kK.......',
      '..jk.....jk...',
      '..kK.....kK...']);
    icon('i_heal', function (g) {
      g.ellipse(7, 7, 6.5, 6.5, shade('white', 'white', 'snowD'));
      g.rect(5, 2, 4, 10, 'leafL'); g.rect(2, 5, 10, 4, 'leafL'); g.vline(8, 2, 10, 'leaf'); g.hline(2, 8, 10, 'leaf');
    });
    icon('i_wrecker', function (g) {
      g.line(1, 0, 8, 6, 'metalD'); g.set(0, 0, 'woodD');
      g.ellipse(9.5, 9.5, 4, 4, function (x, y, nx, ny) { return nx + ny < -0.6 ? 'stone' : (nx + ny > 0.5 ? 'ink' : 'stoneD'); });
      g.set(8, 8, 'stoneL'); g.line(0, 10, 2, 12, 'red'); g.line(1, 13, 3, 11, 'red');
    });
    icon('i_wallbrush', function (g) {
      g.rect(0, 7, 9, 6, 'stone'); g.hline(0, 7, 9, 'stoneL'); for (var x = 0; x < 9; x += 3) g.vline(x + 2, 8, 5, 'stoneD'); g.hline(0, 10, 9, 'stoneD');
      g.set(0, 6, 'stoneL'); g.set(4, 6, 'stoneL'); g.set(8, 6, 'stoneL');
      g.line(13, 0, 9, 6, 'woodL'); g.line(12, 0, 8, 6, 'wood'); g.rect(7, 6, 3, 2, 'metal'); g.set(7, 8, 'white'); g.set(8, 8, 'white');
    });
    icon('i_hand', function (g) {
      g.paint(1, 0, [
        '....ss......',
        '....sS.ss...',
        '.ss.sS.sS...',
        '.sS.sS.sS.ss',
        '.sS.sS.sS.sS',
        '.sSssSssSssS',
        '.ssssssssssS',
        '.sssssssssS.',
        'ssssssssssS.',
        '.ssssssssS..',
        '..sssssssS..',
        '..TTTTTTTt..',
        '..tttttttt..']);
    });
    icon('i_breeze', function (g) {
      g.line(0, 3, 9, 3, 'white'); g.line(9, 3, 11, 1, 'white'); g.set(10, 0, 'white');
      g.line(0, 7, 12, 7, 'snowD'); g.line(12, 7, 13, 5, 'snowD');
      g.line(2, 11, 8, 11, 'white'); g.line(8, 11, 10, 13, 'white');
      g.set(4, 5, 'leafL'); g.set(5, 5, 'leaf'); g.set(11, 9, 'pink');
    });

    // Klarere Neufassungen: Holz, Kommunismus (Planrübe), Faschismus (Lautsprecher)
    icon('i_wood', [
      '..............',
      '..............',
      '.....zyz......',
      '....zyYyz.....',
      '....yYoYy.....',
      '..zyzyYyzyz...',
      '.zyYyz.zyYyz..',
      '.yYoYy.yYoYy..',
      '.zyYyzwzyYyz..',
      '..zyz.w.zyz...',
      '..wwwwwwwwwW..',
      '..WWWWWWWWWW..']);
    icon('i_gov_communism', [
      '....f..f......',
      '...fe.fe......',
      '....eefe......',
      '.....Ee.......',
      '...PPPPPP.....',
      '..PlPPPPPP....',
      '..lPPPPPPP....',
      '..PPPPPPPP....',
      '...PPPPPP.....',
      '....PPPP......',
      '.....PP.......',
      '.....P........']);
    icon('i_gov_fascism', [
      '..............',
      '..........mn..',
      '.........mnn..',
      '.....MmmmnnnM.',
      '..ggMmmnnnnnM.',
      '..ggMmmnnnnnM.',
      '..ggMmmnnnnnM.',
      '.....MmmmnnnM.',
      '...W.....mnn..',
      '...W......mn..',
      '...W..........',
      '..WWW.........']);

    // Geländeproben zum Malen: i_t_<key> (Kachelprobe 14×14 mit Rahmen, Aufragendes als Mini-Deko)
    var TT = WW.TERRAIN || [];
    var DECO = { forest: 'd_tree_s_0', jungle: 'd_jtree_2', taiga: 'd_pine_s_0', mushroom: 'd_shroom_s_0', crystal: 'd_crystal_2', mountain: 'd_peak_2',
      snow: 'd_icepeak_0', swamp: 'd_reed_0', desert: 'd_cactus_1', savanna: 'd_bush_dry_0', hill: 'd_rock_1', ash: 'd_stump_0', tundra: 'd_shrub_0' };
    TT.forEach(function (t) {
      var src = L.DEFS['t_' + t.key + '_0'];
      var g = new Grid(14, 14);
      for (var y = 0; y < 14; y++) for (var x = 0; x < 14; x++) g.d[y * 14 + x] = src.grid.d[(y % 8) * 8 + (x % 8)];
      var dk = DECO[t.key] && L.DEFS[DECO[t.key]];
      if (dk) { var dg = dk.grid, ox = Math.floor((14 - dg.w) / 2), oy = 14 - dg.h; for (var yy = 0; yy < dg.h; yy++) for (var xx = 0; xx < dg.w; xx++) { var c = dg.d[yy * dg.w + xx]; if (c && c !== L.C.shade && c !== L.C.shadeL) g.set(ox + xx, oy + yy, c); } }
      g.hline(0, 0, 14, 'white'); g.vline(0, 0, 14, 'white');
      def('i_t_' + t.key, g.pad(1, 1, 1, 1).outline(), { group: 'icon', anchor: 'icon' });
    });
    // Kreatur-Icons i_a_<kind>: Sprite (Frame 0) mittig, große Sprites halb so groß
    ['sheep', 'wolf', 'cow', 'chicken', 'rabbit', 'deer', 'bear', 'crab', 'fish', 'dragon', 'zombie', 'skeleton', 'slime', 'ghost', 'demon', 'giantchicken', 'yeti', 'sandworm', 'treant', 'golem']
      .forEach(function (k) {
        var d = L.DEFS['a_' + k + '_0']; if (!d) return;
        var hi = WW.Sprites._creatureGrid && WW.Sprites._creatureGrid(k === 'slime' ? 'slime' : k, k === 'fish' ? 1 : 0);
        var src = hi || d.grid, sc = hi ? 2 : ((src.w > 21 || src.h > 21) ? 2 : 1);
        if (hi && (src.w > 36 || src.h > 36)) sc = 3;
        var w = Math.ceil(src.w / sc), h = Math.ceil(src.h / sc), g = new Grid(16, 16);
        var ox = Math.floor((16 - w) / 2), oy = Math.floor((16 - h) / 2);
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
          var c = src.get(x * sc, y * sc);
          if (sc >= 2 && (!c || c === L.C.shade)) c = src.get(x * sc + 1, y * sc + 1) || src.get(x * sc + 1, y * sc) || c;
          if (c && c !== L.C.shade && c !== L.C.shadeL) g.set(ox + x, oy + y, c);   // außerhalb 16×16 wird abgeschnitten
        }
        if (sc >= 2) g = (function (o) { var t = new Grid(16, 16); for (var i = 0; i < o.d.length; i++) t.d[i] = (o.d[i] === L.C.ink) ? 0 : o.d[i]; return t.outline(); })(g);
        def('i_a_' + k, g, { group: 'icon', anchor: 'icon' });
      });

    // ================================================================== Zerstörung: Icons
    function mushroomIcon(g, big) {
      if (big) g.rect(0, 0, 14, 14, 'redD');
      var pal = big ? ['white', 'goldL', 'fireY', 'fireO'] : ['goldL', 'fireY', 'fireO', 'red'];
      var r = big ? 5.5 : 4.2, cy = big ? 4.5 : 4;
      g.rect(6, cy + 2, 2, 12 - cy - 2, pal[2]); g.vline(7, cy + 2, 12 - cy - 2, pal[3]);
      g.ellipse(7, 12.5, big ? 7 : 5.5, 1.5, pal[3]);
      g.ellipse(7, cy, r + 1.5, r * 0.75, function (x, y, nx, ny) { var s2 = nx * 0.6 + ny; return s2 < -0.6 ? pal[0] : (s2 < 0.1 ? pal[1] : (s2 < 0.6 ? pal[2] : pal[3])); });
      g.hline(Math.round(7 - r * 0.6), Math.round(cy + r * 0.55), Math.round(r * 1.2), pal[3]);
    }
    icon('i_clusterbomb', function (g) {
      [[3, 3], [10, 3], [3, 10], [10, 10], [6.5, 6.5]].forEach(function (p) { bomb(g, 2.4, p[0], p[1]); });
      g.set(4, 0, 'fireY'); g.set(11, 0, 'fireY');
    });
    icon('i_napalm', [
      '..........j...',
      '...j.....jF...',
      '..jF..j..FQ...',
      '..FQ.jF.jFQ...',
      '.jFQjFQjFQQj..',
      '.FFQFFQFFQQF..',
      'QFjFQFjFQFjFQ.',
      'QFjjFQjjFQjjFQ',
      'RQFFQQFFQQFFQR',
      'RRQQQQQQQQQQRR',
      '.RRRRRRRRRRRR.']);
    icon('i_rocket', function (g) {
      g.line(1, 12, 9, 4, 'metal'); g.line(2, 12, 10, 4, 'metalL'); g.line(1, 11, 9, 3, 'metalD');
      g.paint(9, 1, ['..r', '.rr', 'rR.']); g.set(10, 3, 'red');
      g.paint(0, 11, ['M..', 'MM.', '.QF']); g.set(0, 13, 'fireY'); g.set(3, 12, 'metalD');
    });
    icon('i_bomber', function (g) {
      g.rect(1, 6, 12, 2, 'stoneL'); g.hline(1, 7, 12, 'stone'); g.set(13, 6, 'stone'); g.set(13, 7, 'stoneD');
      g.line(8, 6, 4, 0, 'stoneL'); g.line(9, 6, 5, 0, 'stone'); g.line(8, 7, 4, 13, 'stone'); g.line(9, 7, 5, 13, 'stoneD');
      g.line(2, 6, 0, 4, 'stone'); g.line(2, 7, 0, 9, 'stoneD'); g.set(11, 6, 'glass');
    });
    icon('i_gunship', function (g) {
      g.rect(6, 0, 3, 14, 'stone'); g.vline(6, 0, 14, 'stoneL'); g.vline(8, 0, 14, 'stoneD');
      g.rect(0, 5, 14, 4, 'stone'); g.hline(0, 5, 14, 'stoneL'); g.hline(0, 8, 14, 'stoneD');
      g.rect(0, 3, 2, 8, 'stone'); g.set(12, 6, 'glass'); g.set(13, 7, 'stoneD');
      [1, 3, 10, 12].forEach(function (y) { g.set(9, y, 'stoneD'); g.set(10, y, 'snowD'); });
      g.set(4, 9, 'ink'); g.set(4, 10, 'fireY');
    });
    icon('i_nuke', function (g) { mushroomIcon(g, false); });
    icon('i_tsar', function (g) { mushroomIcon(g, true); });
    icon('i_orbitallaser', function (g) {
      g.rect(5, 0, 4, 3, 'metal'); g.hline(5, 0, 4, 'metalL'); g.rect(0, 1, 4, 1, 'glass'); g.rect(10, 1, 4, 1, 'glass');
      g.rect(6, 3, 2, 9, 'glass'); g.vline(6, 3, 9, 'white');
      g.ellipse(7, 12.5, 5, 1.5, function (x, y, nx, ny) { return nx * nx + ny * ny < 0.3 ? 'white' : 'glass'; });
    });
    icon('i_blackhole', function (g) {
      for (var y = 0; y < 14; y++) for (var x = 0; x < 14; x++) {
        var dx = x + 0.5 - 7, dy = y + 0.5 - 7, d = Math.sqrt(dx * dx + dy * dy); if (d > 6.8) continue;
        var arm = Math.cos((Math.atan2(dy, dx) + d * 0.5) * 2);
        g.set(x, y, d < 2.5 ? 'ink' : (arm > 0.5 ? (d > 5 ? 'white' : 'pink') : (arm > -0.2 ? 'purple' : 'plum')));
      }
    });
    icon('i_cat_destruction', function (g) {
      for (var y = 0; y < 14; y++) for (var x = 0; x < 14; x++) {
        var dx = x + 0.5 - 7, dy = y + 0.5 - 7, d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
        var rr = 4.5 + Math.abs(Math.cos(a * 4)) * 2.3;
        if (d <= rr) g.set(x, y, d < 2.2 ? 'white' : (d < 3.6 ? 'goldL' : (d < rr - 1 ? 'fireY' : 'fireO')));
      }
    });
    // ================================================================== Industrie-Icons
    icon('i_pollution', [
      '....ddd.......',
      '..dddOdd.dd...',
      '.dOddddddddd..',
      '..ddOdddOdd...',
      '....GG..dd....',
      '....GG........',
      '....GG...GG...',
      '..gggggg.GG...',
      '..gGgGgggggg..',
      '..gggggggggg..',
      '..gbgbgbgbgg..',
      '..gggggggggg..',
      '..GGGGGGGGGG..']);
    icon('i_nature', function (g) {
      g.ellipse(7, 6, 6, 5.5, function (x, y, nx, ny) { return nx + ny < -0.6 ? 'leafL' : (nx + ny > 0.5 ? 'leafD' : 'leaf'); });
      g.line(3, 10, 10, 3, 'leafD'); g.line(6, 7, 6, 4, 'leafD'); g.line(8, 5, 10, 6, 'leafD');
      g.line(2, 11, 0, 13, 'woodD');
    });
    icon('i_view_air', function (g) {
      g.rect(0, 2, 14, 11, 'leaf'); g.rect(0, 9, 14, 4, 'leafD'); g.hline(0, 2, 14, 'leafL');
      g.ellipse(4, 4, 4, 2.5, 'stone'); g.ellipse(10, 5, 4, 2.5, 'stoneL'); g.ellipse(7, 8, 5, 2.4, 'sandD');
      g.set(3, 4, 'stoneD'); g.set(11, 5, 'white');
    });
    icon('i_filter', [
      '.ffffffffffff.',
      '.feeeeeeeeeeE.',
      '..eEeEeEeEeE..',
      '...eeeeeeee...',
      '....eEeEeE....',
      '.....eeee.....',
      '.....gggG.....',
      '.....gggG.....',
      '.....gggG.....',
      '.....gggG.....',
      '....qggggG....',
      '....GGGGGG....']);
    // ================================================================== Rohstoff-, Zug- und Gefangenen-Icons
    icon('i_iron', ['..............', '..............', '....hQQh......', '...hQRQRh.....', '..hQRhQRQh....', '..QRQQRhRQ....', '...hRQRQh.QQh.', '....hhhh.QRQRh', '.........hQRQh', '..........hhh.']);
    icon('i_coal', ['..............', '..............', '....oOOo......', '...oOdOOo.....', '..oOOOdOOo....', '..OdOOOOdO....', '...oOOdOo.OOo.', '....oooo.OdOOo', '.........oOOOo', '..........ooo.']);
    icon('i_fish', function (g) {
      g.ellipse(6, 7, 5, 3, function (x, y, nx, ny) { return ny < -0.3 ? 'white' : (ny > 0.4 ? 'waterD' : 'glass'); });
      g.paint(10, 3, ['..b', '.bb', 'bbb', 'bbb', '.bb', '..b']); g.set(3, 6, 'ink'); g.line(5, 5, 7, 9, 'waterD');
    });
    icon('i_crystal', function (g) {
      [[2, 4, 3, 9], [5, 1, 4, 12], [9, 5, 3, 8]].forEach(function (s) {
        for (var y = 0; y < s[3]; y++) for (var x = 0; x < s[2]; x++) { var dx = x - (s[2] - 1) / 2; if (y >= Math.abs(dx) * 1.6) g.set(s[0] + x, s[1] + y, dx < 0 ? 'white' : (dx < 0.6 ? 'glass' : 'waterD')); }
      });
    });
    icon('i_wool', function (g) {
      [[4, 7, 3.4], [9, 6, 3.6], [6, 4, 3], [7, 9, 3.4]].forEach(function (c) { g.ellipse(c[0], c[1], c[2], c[2] * 0.9, function (x, y, nx, ny) { return nx + ny < -0.5 ? 'white' : (ny > 0.5 ? 'snowD' : 'cream'); }); });
    });
    icon('i_train', [
      '...GG.........',
      '...GG.........',
      '..GGGG..dddd..',
      '.ddddddddbbd..',
      '.dTTTTTTdbbd..',
      '.dddddddddddd.',
      'MMMMMMMMMMMMMM',
      '.oMo.oMo.oMo..',
      '..o...o...o...',
      '..............',
      'nnnnnnnnnnnnnn',
      'WW.WW.WW.WW.WW']);
    icon('i_prisoner', [
      '.....ggg......',
      '....gsssG.....',
      '....ssssS.....',
      '.....sSS......',
      '...ggggggG....',
      '..gggggggGG...',
      '..sgggggGs....',
      '...ggggggW....',
      '...GG..GGW....',
      '...GG..GGW....',
      '.........mm...',
      '.........mm...']);

    // ================================================================== Ausbau 9: Panzer, Geschütz, Schlacht, Kriegsgefangene, Kultur
    icon('i_tank', [
      '..............',
      '..............',
      '....HHHH......',
      '...HhhhhHMMMMM',
      '...HhhhhH.....',
      '.HHHHHHHHHHH..',
      'HhhhhhhhhhhhH.',
      'HHHHHHHHHHHHH.',
      'oGoGoGoGoGoGo.',
      'oogoogoogoogoo',
      '.oGoGoGoGoGo..',
      '..............',
      '..............',
      '..............']);
    icon('i_artillery', [
      '............MM',
      '..........MMM.',
      '........MMm...',
      '......MMm.....',
      '....wMMm......',
      '...wwwm.......',
      '..wwWWW.......',
      '.ww.oooo......',
      'ww.oWvWWo.....',
      'w..oWWWvo.....',
      '...oWvWWo.....',
      '....oooo......',
      '..............',
      '..............']);
    icon('i_battle', function (g) {
      g.ellipse(7, 9, 5, 3.5, function (x, y, nx, ny) { return ny < -0.2 ? 'fireY' : (nx * nx + ny * ny < 0.4 ? 'fireO' : 'stone'); });
      g.line(1, 1, 11, 11, 'metalL'); g.line(2, 1, 12, 11, 'metal'); g.line(12, 1, 2, 11, 'metalL'); g.line(13, 1, 3, 11, 'metal');
      g.paint(0, 10, ['wW', 'Ww']); g.paint(12, 10, ['wW', 'Ww']); g.set(4, 9, 'goldD'); g.set(9, 9, 'goldD');
    });
    icon('i_pow', [
      '....HHHH......',
      '...HhhhhH.....',
      '....ssss......',
      '....sSSs......',
      '...HhhhhH.....',
      '..HhHhhHhH....',
      '..s.hhhh.s....',
      '....hHhh......',
      '....HH.HH.....',
      'w..w..w..w..w.',
      'mmmmmmmmmmmmmm',
      'w..w..w..w..w.',
      'mmmmmmmmmmmmmm',
      'w..w..w..w..w.']);
    icon('i_culture', function (g) {
      // drei Bauweisen: Lehmturm mit Zinnen, kleine Pyramide, Giebelhaus mit Torfdach
      g.rect(0, 4, 5, 10, 'sand'); g.vline(0, 4, 10, 'strawL'); g.vline(4, 4, 10, 'sandD'); g.set(1, 3, 'sand'); g.set(3, 3, 'sand'); g.vline(2, 1, 3, 'sand'); g.set(2, 0, 'white'); g.set(1, 7, 'woodD'); g.set(3, 7, 'woodD'); g.set(2, 10, 'woodD'); g.rect(2, 11, 1, 3, 'plum');
      for (var j = 0; j < 9; j++) { var hw = Math.floor(j / 2); g.hline(7 - hw, 5 + j, 1 + hw * 2, 'gold'); g.set(7 + hw, 5 + j, 'goldD'); g.set(7 - hw, 5 + j, 'goldL'); }
      g.paint(8, 7, ['..eee.', '.eeeee', 'eEEEEE', '.wwWw.', '.wWWw.', '.wOOw.', '.wOOw.']);
    });
    icon('i_ship', [
      '......o.......',
      '......o.TTu...',
      '...lllo.......',
      '..lccco.......',
      '.lccccoccl....',
      '.lccccoccl....',
      '..lcccocl.....',
      '......o.......',
      'w.....o......v',
      'wvvvvvvvvvvvvw',
      '.wvvvvvvvvvvw.',
      '..WWWWWWWWWW..',
      'J..JJ...JJ..JJ',
      '.JJ..JJJ..JJ..']);
    icon('i_harbor', [
      '..rrrrrr......',
      '.rrRRRRrr.....',
      '.qqqqqqqq.....',
      '.qWWqqWWq.....',
      '.qWWqqWWq..o..',
      '.qqqqqqqq..o..',
      'ggggggggggvv..',
      'GGGGGGGGGGvv..',
      'JJJJJJJJJJvvJJ',
      'DDDDDDDDDDWWDD',
      'DDJJDDDDDDvvDD',
      'DDDDDDJJDDvvDD',
      'JDDDDDDDDDWWDD',
      'DDDDJJDDDDDDDJ']);
    icon('i_garrison', [
      '......oTTu....',
      '......oTTTT...',
      '......oTt.....',
      '..g.g.og.g.g..',
      '..ggggoggggg..',
      '..gqqqqqqqqG..',
      '..gqoqqqqoqG..',
      '..gqqqqqqqqG..',
      '..gqqqooqqqG..',
      '..gqqqooqqqG..',
      '..GGGGooGGGG..',
      'MMMMMMMMMMMMMM',
      '.n.n.n.n.n.n..',
      '..............']);
    icon('i_occupied', [
      '.o............',
      '.oTTTTTu......',
      '.oTTTTTTTu....',
      '.oTTTTTTTT....',
      '.oTtTTTTt.....',
      '.ot..tt.......',
      '.o............',
      '.o............',
      '.o.......lll..',
      '.o......lglgl.',
      '.o......lgggl.',
      'gGgg....lllll.',
      'GGGG..........',
      '..............']);
    // ================================================================== Menü-Icons: Ton, Musik, Nacht, Wetter
    function speaker(g) { g.rect(1, 5, 3, 5, 'stoneL'); g.vline(3, 5, 5, 'stone'); for (var j = 0; j < 4; j++) g.vline(4 + j, 4 - j, 7 + j * 2, j === 3 ? 'stoneD' : 'stone'); g.set(4, 4, 'white'); }
    icon('i_sound_on', function (g) { speaker(g); g.vline(9, 5, 5, 'white'); g.set(10, 4, 'white'); g.set(10, 10, 'white'); g.vline(11, 3, 9, 'snowD'); g.set(12, 2, 'snowD'); g.set(12, 12, 'snowD'); g.vline(13, 3, 9, 'snowD'); });
    icon('i_sound_off', function (g) { speaker(g); g.line(9, 4, 13, 10, 'red'); g.line(13, 4, 9, 10, 'red'); g.line(10, 4, 13, 9, 'redD'); });
    icon('i_music', ['......llllll..', '......lccccl..', '......l.....l.', '......l.....l.', '......l.....l.', '......l.....l.', '......l.....l.', '......l.....l.', '...llcl..llcl.', '..lcccl.lcccl.', '..lcccl.lcccl.', '...lll...lll..']);
    icon('i_night', function (g) {
      g.ellipse(7, 7, 6, 6, function (x, y, nx, ny) { return nx + ny < -0.4 ? 'goldL' : 'gold'; });
      g.ellipse(10, 5, 5, 5, function () { return null; });
      for (var y = 0; y < 14; y++) for (var x = 0; x < 14; x++) if (Math.hypot(x + 0.5 - 10, y + 0.5 - 5) < 5) g.d[y * 14 + x] = 0;
      g.paint(9, 9, ['.j.', 'jlj', '.j.']); g.set(12, 2, 'goldL');
    });
    icon('i_weather', function (g) {
      g.ellipse(4, 4, 3.5, 3.5, function (x, y, nx, ny) { return nx + ny < -0.3 ? 'goldL' : 'gold'; });
      [[6, 7, 4, 2.6], [10, 7, 3.6, 2.6], [8, 5.5, 3, 2.4]].forEach(function (c) { g.ellipse(c[0], c[1], c[2], c[3], function (x, y, nx, ny) { return ny > 0.4 ? 'snowD' : 'white'; }); });
      g.set(5, 11, 'glass'); g.set(4, 12, 'glass'); g.set(9, 11, 'glass'); g.set(8, 12, 'glass'); g.set(12, 11, 'glass');
    });
  });

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
