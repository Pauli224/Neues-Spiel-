// Werkzeuge und Kategorien – datengetrieben. Spätere Stufen ergänzen nur Einträge (WW.UI.addTool).
// Werkzeug: { id, cat, icon, name, hint, kind: 'look'|'paint'|'tap'|'pair'|'action', options?, ...
//             apply(game, x, y) | run(game) }  x, y = Kachelkoordinaten (Fließkomma)
(function (WW) { 'use strict';

  const CATEGORIES = [
    { id: 'look', name: 'Schauen', icon: 'i_inspect', direct: 'inspect', key: 'Escape' },
    { id: 'land', name: 'Land', icon: 'i_cat_land' },
    { id: 'life', name: 'Leben', icon: 'i_cat_life' },
    { id: 'rule', name: 'Herrschaft', icon: 'i_cat_rule' },
    { id: 'power', name: 'Kräfte', icon: 'i_cat_power' },
    { id: 'world', name: 'Welt', icon: 'i_cat_world' }
  ];
  const TOOLS = [];
  const BY_ID = {};

  function addTool(t) {
    if (BY_ID[t.id]) { Object.assign(BY_ID[t.id], t); return BY_ID[t.id]; }
    TOOLS.push(t); BY_ID[t.id] = t; return t;
  }
  function addCategory(c) { if (!CATEGORIES.some(x => x.id === c.id)) CATEGORIES.push(c); }

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
      addTool({ id: 'paint_' + k, cat: 'land', icon: 't_' + k + '_0', iconBig: true, name: d.name, kind: 'paint', options: 'brush', terrain: d.id,
        hint: d.name + ' malen: über die Karte ziehen.' });
    }

    // Leben
    addTool({ id: 'settlers', cat: 'life', icon: 'i_settlers', name: 'Siedler', kind: 'tap', options: 'settler',
      hint: 'Auf freies Land tippen: Sechs Siedler gründen ein neues Reich. In einer Stadt schließen sie sich an.',
      apply(game, x, y) { return game.spawnSettlers(x, y); } });
    for (const kind of Object.keys(WW.CREATURES || { sheep: 1, wolf: 1 })) {
      const cr = WW.CREATURES ? WW.CREATURES[kind] : { name: kind };
      addTool({ id: 'animal_' + kind, cat: 'life', icon: WW.Sprites.has('i_' + kind) ? 'i_' + kind : 'a_' + kind + '_0', name: cr.name || kind, kind: 'tap',
        hint: (cr.name || kind) + ' aussetzen: auf Land tippen.', repeat: true,
        apply(game, x, y) { return game.spawnAnimal(x, y, kind); } });
    }

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

    // Kräfte (aus WW.POWERS, Reihenfolge wie im Plan)
    const order = ['lightning', 'fire', 'rain', 'meteor', 'plague', 'bless'];
    const keys = (WW.POWER_KEYS || order).slice().sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    const PH = { lightning: 'Blitz: tippen, wo es einschlagen soll.', fire: 'Feuer legen: Wald und Palisaden brennen gut.',
      rain: 'Regen löscht Brände und lässt Wald wachsen.', meteor: 'Meteor: Krater, zerstört auch Steinmauern.',
      plague: 'Seuche: macht Bewohner krank.', bless: 'Segen: heilt, macht glücklich, Felder reifen.' };
    for (const k of keys) {
      const p = WW.POWERS ? WW.POWERS[k] : { name: k, radius: 2 };
      addTool({ id: 'power_' + k, cat: 'power', icon: WW.Sprites.has('i_' + k) ? 'i_' + k : 'i_cat_power', name: p.name || k, kind: 'tap', power: k,
        radius: p.radius || 2, repeat: true, hint: PH[k] || (p.name + ': auf die Karte tippen.'),
        apply(game, x, y) { return game.strike(x, y, k); } });
    }

    // Welt: Aktionen
    addTool({ id: 'w_new', cat: 'world', icon: 'i_newworld', name: 'Neue Welt', kind: 'action', run(game) { game.ui.openNewWorld(); } });
    addTool({ id: 'w_save', cat: 'world', icon: 'i_save', name: 'Speichern', kind: 'action', run(game) { game.saveGame(true); } });
    addTool({ id: 'w_load', cat: 'world', icon: 'i_load', name: 'Laden', kind: 'action', run(game) { game.ui.openLoad(); } });
    addTool({ id: 'w_laws', cat: 'world', icon: 'i_laws', name: 'Gesetze', kind: 'action', run(game) { game.ui.openLaws(); } });
    addTool({ id: 'w_chron', cat: 'world', icon: 'i_chronicle', name: 'Chronik', kind: 'action', run(game) { game.ui.openChronicle(); } });
    addTool({ id: 'w_map', cat: 'world', icon: 'i_map', name: 'Karte', kind: 'action', run(game) { game.ui.toggleMinimap(); } });
  }

  function shortGov(n) {
    return ({ 'Handelsrepublik': 'Republik', 'Stammesrat': 'Stamm' })[n] || n;
  }

  WW.UI = WW.UI || {};
  WW.UI.Tools = {
    CATEGORIES: CATEGORIES, TOOLS: TOOLS, BRUSHES: BRUSHES,
    get: (id) => BY_ID[id], addTool: addTool, addCategory: addCategory, init: defaults,
    inCat: (cat) => TOOLS.filter(t => t.cat === cat)
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
