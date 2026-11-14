// Werkzeuge und Kategorien – datengetrieben. Spätere Stufen ergänzen nur Einträge (WW.UI.addTool).
// Werkzeug: { id, cat, icon, name, hint, kind: 'look'|'paint'|'tap'|'pair'|'action', options?, ...
//             apply(game, x, y) | run(game) }  x, y = Kachelkoordinaten (Fließkomma)
(function (WW) { 'use strict';

  const CATEGORIES = [
    { id: 'look', name: 'Schauen', icon: 'i_inspect', direct: 'inspect', key: 'Escape' },
    { id: 'land', name: 'Land', icon: 'i_cat_land' },
    { id: 'life', name: 'Leben', icon: 'i_cat_life' },
    { id: 'rule', name: 'Herrschaft', short: 'Macht', icon: 'i_cat_rule' },
    { id: 'power', name: 'Kräfte', icon: 'i_cat_power' },
    { id: 'world', name: 'Welt', icon: 'i_cat_world' }
  ];
  const TOOLS = [];
  const BY_ID = {};

  function addTool(t) {
    if (BY_ID[t.id]) { Object.assign(BY_ID[t.id], t); return BY_ID[t.id]; }
    TOOLS.push(t); BY_ID[t.id] = t; return t;
  }
  // neue Kategorie, optional vor einer bestehenden einsortiert
  function addCategory(c, before) {
    if (CATEGORIES.some(x => x.id === c.id)) return;
    const i = before ? CATEGORIES.findIndex(x => x.id === before) : -1;
    if (i >= 0) CATEGORIES.splice(i, 0, c); else CATEGORIES.push(c);
  }
  const POWER_CATS = { nature: 'Natur', basic: 'Natur', weather: 'Wetter', blessing: 'Segen & Fluch', curse: 'Segen & Fluch', fate: 'Segen & Fluch',
    earth: 'Erde', life: 'Leben', misc: 'Sonstiges', other: 'Sonstiges', destruction: 'Zerstörung' };

  // Pinselgrößen (Durchmesser in Kacheln → Radius für paintTerrain)
  const BRUSHES = [
    { id: 1, r: 1, name: '1', icon: 'i_brush_s', label: 'Klein' },
    { id: 3, r: 2, name: '3', icon: 'i_brush_m', label: 'Mittel' },
    { id: 5, r: 3, name: '5', icon: 'i_brush_l', label: 'Groß' }
  ];

  function defaults() {
    const T = WW.T;
    addTool({ id: 'inspect', cat: 'look', icon: 'i_inspect', name: 'Schauen', kind: 'look',
      hint: 'Antippen zeigt Infos zu Reich, Stadt oder Bewohner. Ziehen verschiebt die Karte.' });

    // Land: Hauptgelände mit eigenen Icons, dann weitere Biome mit Bodenkachel als Icon
    const main = [['water', 'WATER', 'Wasser'], ['sand', 'SAND', 'Sand'], ['grass', 'GRASS', 'Wiese'], ['forest', 'FOREST', 'Wald'],
      ['hill', 'HILL', 'Hügel'], ['mountain', 'MOUNTAIN', 'Berg']];
    for (const m of main) addTool({ id: 'paint_' + m[0], cat: 'land', icon: 'i_' + m[0], name: m[2], kind: 'paint', options: 'brush', terrain: T[m[1]],
      hint: m[2] + ' malen: über die Karte ziehen.' });
    addTool({ id: 'sep_land', cat: 'land', kind: 'sep' });
    const extra = ['river', 'flowers', 'desert', 'savanna', 'jungle', 'swamp', 'taiga', 'tundra', 'snowfield', 'snow', 'mushroom', 'crystal', 'ash', 'lava', 'deep'];
    for (const k of extra) {
      const d = WW.TERRAIN_BY_KEY[k];
      if (!d) continue;
      addTool({ id: 'paint_' + k, cat: 'land', icon: pickIcon(['i_t_' + k, 't_' + k + '_0']), name: d.name, kind: 'paint', options: 'brush', terrain: d.id,
        hint: d.name + ' malen: über die Karte ziehen.' });
    }

    // Leben
    addTool({ id: 'settlers', cat: 'life', icon: 'i_settlers', name: 'Siedler', kind: 'tap', options: 'settler',
      hint: 'Auf freies Land tippen: Sechs Siedler gründen ein neues Reich. In einer Stadt schließen sie sich an.',
      apply(game, x, y) { return game.spawnSettlers(x, y); } });
    // Tiere, Monster, Orte aus WW.CREATURES / WW.LAIRS (gibt es ein Feld spawnable, nur diese), gruppiert nach category
    const WILD = WW.WILD || {};
    const ccatName = {};
    for (const c of (WILD.CREATURE_CATEGORIES || [])) ccatName[c.key] = c.name;
    const CR = WW.CREATURES || {};
    const ckeys = Object.keys(CR);
    const flagged = ckeys.some(k => 'spawnable' in CR[k]);
    const groupOf = (cr) => cr.category || cr.group || (cr.hostile ? 'wild' : 'animal');
    const groups = [];
    for (const kind of ckeys) { const cr = CR[kind]; if (flagged && !cr.spawnable) continue; const g = groupOf(cr); if (groups.indexOf(g) < 0) groups.push(g); }
    for (const g of groups) {
      addTool({ id: 'sep_life_' + g, cat: 'life', kind: 'sep', label: ccatName[g] || ({ animal: 'Tiere', monster: 'Monster', wild: 'Wild' })[g] || g });
      for (const kind of ckeys) {
        const cr = CR[kind];
        if ((flagged && !cr.spawnable) || groupOf(cr) !== g) continue;
        addTool({ id: 'animal_' + kind, cat: 'life', icon: pickIcon(['i_a_' + kind, 'i_' + kind, 'a_' + kind + '_0']), name: cr.name || kind, kind: 'tap',
          hint: (cr.name || kind) + ': ' + (cr.desc || 'auf Land tippen.'),
          apply(game, x, y) { return game.spawnAnimal(x, y, kind); } });
      }
    }
    const LA = WW.LAIRS || {};
    const lkeys = Object.keys(LA).filter(k => LA[k].spawnable !== false);
    if (lkeys.length) {
      addTool({ id: 'sep_life_place', cat: 'life', kind: 'sep', label: ccatName.place || 'Orte' });
      for (const k of lkeys) {
        const l = LA[k];
        addTool({ id: 'lair_' + k, cat: 'life', icon: pickIcon(['i_l_' + k, 'i_' + k, 's_lair_' + k]), name: l.name || k, kind: 'tap', requires: 'spawnLair',
          hint: (l.name || k) + ': ' + (l.desc || 'auf Land tippen.'),
          apply(game, x, y) { return game.spawnLair(x, y, k); } });
      }
    }
    // Göttliche Hand als eigenes Werkzeug nur, wenn die Simulation grab/drop kennt und keine Kraft „hand" hat
    if (!(WW.POWERS && WW.POWERS.hand)) addTool({ id: 'grab', cat: 'life', icon: pickIcon(['i_grab', 'i_hand', 'i_inspect']), name: 'Hand', kind: 'grab', requires: 'grab',
      hint: 'Göttliche Hand: Figur antippen und halten, ziehen, loslassen setzt sie ab.' });

    // Herrschaft: Regierungs-Stempel, Diplomatie
    for (const g of WW.GOV_KEYS) {
      const gv = WW.GOVERNMENTS[g];
      addTool({ id: 'gov_' + g, cat: 'rule', icon: 'i_gov_' + g, name: shortGov(gv.name), kind: 'tap', gov: g,
        hint: gv.name + ': auf ein Reich tippen, es wechselt sofort und bleibt so (fixiert).',
        apply(game, x, y) { return game.stampGov(x, y, g); } });
    }
    addTool({ id: 'sep_rule', cat: 'rule', kind: 'sep' });
    for (const r of [['war', 'Krieg', 'i_war'], ['peace', 'Frieden', 'i_peace'], ['alliance', 'Bündnis', 'i_alliance']]) {
      addTool({ id: 'rel_' + r[0], cat: 'rule', icon: r[2], name: r[1], kind: 'pair', relation: r[0],
        hint: r[1] + ': erst ein Reich antippen, dann das zweite.' });
    }

    // Kräfte aus WW.POWERS: Kategorien aus power.category; „destruction" bekommt einen eigenen Reiter
    const order = ['lightning', 'fire', 'rain', 'meteor', 'plague', 'bless'];
    const PH = { lightning: 'Blitz: tippen, wo es einschlagen soll.', fire: 'Feuer legen: Wald und Palisaden brennen gut.',
      rain: 'Regen löscht Brände und lässt Wald wachsen.', meteor: 'Meteor: Krater, zerstört auch Steinmauern.',
      plague: 'Seuche: macht Bewohner krank.', bless: 'Segen: heilt, macht glücklich, Felder reifen.' };
    const DRAG = { gunship: 'aim', bomber: 'direction', orbitallaser: 'trace', laser: 'trace' };
    const P = WW.POWERS || {};
    const PC = (WW.WILD && WW.WILD.POWER_CATEGORIES) || [];
    for (const c of PC) POWER_CATS[c.key] = c.name;
    const dragOf = (k, p) => p.drag || (p.aim ? 'aim' : p.dir ? 'direction' : p.brush ? 'trace' : DRAG[k] || null);
    const pkeys = (WW.POWER_KEYS || Object.keys(P)).slice().sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    const pcats = [];
    for (const c of PC) if (pkeys.some(k => P[k] && P[k].category === c.key)) pcats.push(c.key);
    for (const k of pkeys) { const c = (P[k] && P[k].category) || 'nature'; if (pcats.indexOf(c) < 0) pcats.push(c); }
    const tabOf = (c) => c === 'destruction' ? 'destruction' : (c === 'terrain' ? 'land' : 'power');
    if (pcats.indexOf('destruction') >= 0) addCategory({ id: 'destruction', name: 'Zerstörung', short: 'Bomben', icon: 'i_cat_destruction' }, 'world');
    const multi = pcats.filter(c => tabOf(c) === 'power').length > 1;
    for (const c of pcats) {
      const tab = tabOf(c);
      addTool({ id: 'sep_power_' + c, cat: tab, kind: 'sep', label: (tab === 'power' && multi) || tab === 'land' ? (POWER_CATS[c] || c) : null });
      for (const k of pkeys) {
        const p = P[k] || { name: k, radius: 2 };
        if (((p.category) || 'nature') !== c) continue;
        addTool({ id: 'power_' + k, cat: tab, icon: pickIcon([p.icon, 'i_' + k, ({ navHarbor: 'i_harbor', navShip: 'i_ship', milTank: 'i_tank', milGun: 'i_artillery', milBattle: 'i_battle' })[k]].filter(Boolean)), name: p.name || k, kind: 'tap', power: k,
          drag: dragOf(k, p), radius: p.radius || 2, hint: PH[k] || p.desc || ((p.name || k) + ': auf die Karte tippen.'),
          apply(game, x, y) { return game.strike(x, y, k); } });
      }
    }

    // Welt: Aktionen
    addTool({ id: 'w_new', cat: 'world', icon: 'i_newworld', name: 'Neue Welt', kind: 'action', run(game) { game.ui.openNewWorld(); } });
    addTool({ id: 'w_save', cat: 'world', icon: 'i_save', name: 'Speichern', kind: 'action', run(game) { game.saveGame(true); } });
    addTool({ id: 'w_load', cat: 'world', icon: 'i_load', name: 'Laden', kind: 'action', run(game) { game.ui.openLoad(); } });
    addTool({ id: 'w_laws', cat: 'world', icon: 'i_laws', name: 'Gesetze', kind: 'action', run(game) { game.ui.openLaws(); } });
    addTool({ id: 'w_chron', cat: 'world', icon: 'i_chronicle', name: 'Chronik', kind: 'action', run(game) { game.ui.openChronicle(); } });
    addTool({ id: 'w_air', cat: 'world', icon: pickIcon(['i_view_air', 'i_pollution', 'i_map']), name: 'Luft', kind: 'action', requires: 'pollution',
      run(game) { game.toggleAirView(); } });
    addTool({ id: 'w_map', cat: 'world', icon: 'i_map', name: 'Karte', kind: 'action', run(game) { game.ui.toggleMinimap(); } });
  }

  // erstes vorhandene Sprite; sonst Schlüssel (dom.icon zeichnet dann einen Platzhalter mit Anfangsbuchstaben)
  function pickIcon(list) { for (const k of list) if (WW.Sprites.has(k)) return k; return list[0]; }

  function shortGov(n) {
    return ({ 'Handelsrepublik': 'Republik', 'Stammesrat': 'Stamm' })[n] || n;
  }

  WW.UI = WW.UI || {};
  WW.UI.Tools = {
    CATEGORIES: CATEGORIES, TOOLS: TOOLS, BRUSHES: BRUSHES,
    get: (id) => BY_ID[id], addTool: addTool, reset() { TOOLS.length = 0; for (const k in BY_ID) delete BY_ID[k]; }, addCategory: addCategory, init: defaults,
    inCat: (cat) => TOOLS.filter(t => t.cat === cat)
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
