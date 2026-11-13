// =============================================================================
// Wuselwelt – Reichsgesetze und Ereignis-Gruppen (Daten). Lädt nach config.js.
//   WW.REALM_LAWS[]     { key, name, desc, effects: [{ key, add?, mul?, flag? }], allowed: [Regierungen], opposes, want(L) }
//                       want(L) -> Gewicht, wie sehr ein Reich in Lage L das Gesetz will (siehe WW.Events.situation)
//   WW.REALM_LAW_MAP    key -> Gesetz
//   WW.EVENT_GROUPS     Gruppen-Schlüssel -> deutscher Name
//   Weltgesetz 'events' (Ereignisse an/aus) wird an WW.LAW_INFO angehängt.
// =============================================================================
(function (WW) { 'use strict';

  const ALL = ['tribe', 'monarchy', 'democracy', 'fascism', 'communism', 'theocracy', 'republic', 'anarchy'];
  const but = (...ex) => ALL.filter(g => ex.indexOf(g) < 0);

  WW.REALM_LAWS = [
    { key: 'naturschutz', name: 'Naturschutzgesetz', desc: 'Bäume sind Mitbürger. Gefällt wird nur, was schon umfällt.',
      effects: [{ key: 'nature', flag: 'care' }, { key: 'wood', mul: 0.7 }, { key: 'happiness', add: 5 }],
      allowed: but('fascism'), opposes: 'kahlschlagplan',
      want: L => (L.bare > 0.5 ? 4 : 0.5) + (L.race === 'elf' ? 4 : 0) + (L.gov === 'anarchy' || L.gov === 'democracy' ? 1 : 0) + (L.wood > 150 ? 1 : 0) },
    { key: 'kahlschlagplan', name: 'Kahlschlagplan', desc: 'Jeder Baum ist ein Brett, das nur noch nicht weiß, dass es eins ist.',
      effects: [{ key: 'nature', flag: 'exploit' }, { key: 'wood', mul: 1.4 }, { key: 'happiness', add: -4 }],
      allowed: but('anarchy'), opposes: 'naturschutz',
      want: L => (L.race === 'elf' ? 0 : 1) * ((L.wood < 40 ? 3 : 0.4) + (L.gov === 'communism' || L.gov === 'fascism' ? 1.5 : 0) + (L.bare < 0.3 ? 1 : 0)) },
    { key: 'wehrpflicht', name: 'Wehrpflicht', desc: 'Wer zwei Beine hat, marschiert. Wer drei hat, marschiert vorneweg.',
      effects: [{ key: 'soldiers', add: 0.08 }, { key: 'strength', mul: 1.1 }, { key: 'happiness', add: -4 }],
      allowed: but('anarchy'), opposes: null,
      want: L => (L.atWar ? 4 : 0.3) + (L.threat ? 2 : 0) + (L.gov === 'fascism' ? 2 : 0) + (L.race === 'orc' ? 1 : 0) },
    { key: 'mauerpflicht', name: 'Mauerpflicht', desc: 'Jeder Haushalt trägt jede Woche einen Stein zur Mauer. Oder zwei.',
      effects: [{ key: 'wallSpeed', mul: 1.4 }, { key: 'work', mul: 0.96 }],
      allowed: but('anarchy'), opposes: null,
      want: L => (L.threat || L.atWar ? 3 : 0.4) + (L.race === 'dwarf' ? 1.5 : 0) + (L.gov === 'monarchy' ? 1 : 0) },
    { key: 'sonntagsruhe', name: 'Sonntagsruhe', desc: 'Einmal die Woche wird nur gegessen, geschlafen und über die Nachbarn geredet.',
      effects: [{ key: 'work', mul: 0.9 }, { key: 'happiness', add: 7 }],
      allowed: but('fascism', 'communism'), opposes: null,
      want: L => (L.happy < 45 ? 3 : 0.5) + (L.gov === 'theocracy' ? 2 : 0) + (L.atWar ? -0.4 : 0) },
    { key: 'hohe_steuern', name: 'Hohe Steuern', desc: 'Der Staat nimmt, was er kriegt, und ein bisschen mehr.',
      effects: [{ key: 'taxes', add: 0.03 }, { key: 'gold', mul: 1.3 }, { key: 'happiness', add: -7 }],
      allowed: ['tribe', 'monarchy', 'democracy', 'fascism', 'theocracy', 'republic'], opposes: 'niedrige_steuern',
      want: L => (L.gold < 20 ? 3 : 0.3) + (L.atWar ? 1.5 : 0) + (L.gov === 'monarchy' ? 1 : 0) + (L.happy > 65 ? 1 : 0) },
    { key: 'niedrige_steuern', name: 'Niedrige Steuern', desc: 'Der Steuereintreiber bekommt mehr Urlaub als Arbeit.',
      effects: [{ key: 'taxes', add: -0.015 }, { key: 'gold', mul: 0.85 }, { key: 'happiness', add: 5 }, { key: 'immigration', mul: 1.3 }],
      allowed: ['tribe', 'monarchy', 'democracy', 'theocracy', 'republic', 'anarchy'], opposes: 'hohe_steuern',
      want: L => (L.happy < 40 ? 3 : 0.4) + (L.gold > 200 ? 2 : 0) + (L.gov === 'republic' || L.gov === 'democracy' ? 0.8 : 0) },
    { key: 'handelsfreiheit', name: 'Handelsfreiheit', desc: 'Jeder darf alles verkaufen, sogar Dinge, die es gar nicht gibt.',
      effects: [{ key: 'gold', mul: 1.4 }, { key: 'immigration', mul: 1.2 }, { key: 'loyalty', add: -4 }],
      allowed: ['tribe', 'monarchy', 'democracy', 'theocracy', 'republic', 'anarchy'], opposes: null,
      want: L => (L.gov === 'republic' ? 4 : 0.6) + (L.markets ? 1.5 : 0) + (L.race === 'gnome' || L.race === 'dwarf' ? 0.8 : 0) },
    { key: 'jagdverbot', name: 'Jagdverbot', desc: 'Hasen dürfen ab sofort frei hoppeln. Die Hasen bedanken sich nicht.',
      effects: [{ key: 'food', mul: 0.9 }, { key: 'happiness', add: 3 }, { key: 'nature', flag: 'care' }],
      allowed: ALL, opposes: null,
      want: L => (L.race === 'elf' ? 3 : 0.3) + (L.foodPer > 6 ? 1.5 : 0) + (L.gov === 'theocracy' ? 0.8 : 0) },
    { key: 'zuzugsstopp', name: 'Zuzugsstopp', desc: 'Am Ortseingang steht jetzt ein Schild: „Voll. Bitte später wiederkommen.“',
      effects: [{ key: 'immigration', mul: 0.2 }, { key: 'loyalty', add: 8 }],
      allowed: ALL, opposes: 'offene_tore',
      want: L => (L.crowded ? 3 : 0.3) + (L.foodPer < 1.5 ? 2 : 0) + (L.gov === 'fascism' ? 2 : 0) },
    { key: 'offene_tore', name: 'Offene Tore', desc: 'Jeder ist willkommen, solange er beim Abwasch hilft.',
      effects: [{ key: 'immigration', mul: 1.8 }, { key: 'growth', mul: 1.1 }, { key: 'loyalty', add: -4 }],
      allowed: but('fascism'), opposes: 'zuzugsstopp',
      want: L => (L.pop < 20 ? 3 : 0.4) + (L.gov === 'democracy' || L.gov === 'anarchy' ? 1.5 : 0) + (L.foodPer > 4 ? 1 : 0) },
    { key: 'ausgangssperre', name: 'Ausgangssperre', desc: 'Nach Sonnenuntergang darf nur noch der Mond draußen sein.',
      effects: [{ key: 'happiness', add: -10 }, { key: 'loyalty', add: 10 }, { key: 'work', mul: 1.05 }],
      allowed: ['monarchy', 'fascism', 'communism'], opposes: null,
      want: L => (L.revolt ? 5 : 0) + (L.happy < 35 ? 2 : 0.2) + (L.gov === 'fascism' ? 1.5 : 0) },
    { key: 'schulpflicht', name: 'Schulpflicht', desc: 'Alle Kinder lernen Lesen, Rechnen und das Lied vom fleißigen Maurer.',
      effects: [{ key: 'build', mul: 1.15 }, { key: 'growth', mul: 1.05 }, { key: 'work', mul: 0.97 }],
      allowed: but('tribe'), opposes: null,
      want: L => (L.pop > 25 ? 2.5 : 0.5) + (L.gov === 'democracy' || L.gov === 'communism' ? 1.5 : 0) + (L.race === 'gnome' ? 1 : 0) },
    { key: 'brotpreisbremse', name: 'Brotpreisbremse', desc: 'Ein Brot kostet höchstens einen Kupferling. Die Bäcker backen kleinere Brote.',
      effects: [{ key: 'happiness', add: 6 }, { key: 'gold', mul: 0.85 }, { key: 'food', mul: 1.05 }],
      allowed: but('republic'), opposes: null,
      want: L => (L.foodPer < 2 ? 4 : 0.4) + (L.hungry ? 2 : 0) + (L.gov === 'communism' || L.gov === 'democracy' ? 1 : 0) }
  ];
  WW.REALM_LAW_MAP = {};
  for (const l of WW.REALM_LAWS) WW.REALM_LAW_MAP[l.key] = l;

  // Ereignis-Gruppen
  WW.EVENT_GROUPS = {
    politics: 'Politik', laws: 'Gesetze', economy: 'Wirtschaft', nature: 'Natur und Umwelt', daily: 'Alltag und Kurioses',
    faith: 'Glaube', war: 'Krieg und Diplomatie', people: 'Persönlichkeiten', race: 'Volkseigenes', gov: 'Regierungseigenes',
    world: 'Weltgeschehen'
  };

  // Weltgesetz „Ereignisse“ (an/aus) – an das vorhandene Gesetzes-System angehängt
  if (Array.isArray(WW.LAW_INFO) && WW.LAW_DEFAULTS && !('events' in WW.LAW_DEFAULTS)) {
    WW.LAW_INFO.push({ key: 'events', name: 'Ereignisse und Reichsgesetze', desc: 'Missernten, Feste, Skandale und Gesetze – mit echten Folgen.', def: true });
    WW.LAW_DEFAULTS.events = true;
  }

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
