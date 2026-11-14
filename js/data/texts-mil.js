// Chroniktexte des Militärs (Panzer, Artillerie, Feldschlachten). Lädt nach js/data/texts.js und hängt sich an
// WW.Texts.EVENTS an. Ton: comichaft, kein Blut, Krieg wird nicht verherrlicht – Sieger wirken eher erschöpft als stolz.
// Platzhalter: {kingdom}, {other}, {city}, {name}/{Name} (Schlacht), {place}/{Place} („bei Falkenau", „auf den Wiesen"), {winner}, {loser}, {lossW}, {lossL}, {loss} (gesamt),
//   {pows}, {n}, {outcome} (fertiger Satz zum Ausgang), {kind} (Panzer/Feldgeschütz)
(function (WW) { 'use strict';

  const E = {
    battleStart: [
      '{Place} prallen die Heere von {kingdom} und {other} aufeinander. Die Feldmäuse ziehen vorsorglich um.',
      'Feldschlacht {place}: {kingdom} gegen {other}. Auf beiden Seiten wünscht sich jemand, er wäre Bäcker geworden.',
      '{kingdom} und {other} treffen sich {place} – leider nicht zum Picknick.'
    ],
    battle: [
      '{Name} ist vorbei. {outcome} Zurück bleiben Gräben, Trichter und sehr viel Stille.',
      '{Name}: {outcome} Ein Denkmal wird es nicht geben, nur ein Feld, auf dem lange nichts wächst.',
      '{Name} – danach wird gezählt. {outcome} Gewonnen hat vor allem der Matsch.'
    ],
    battleRetreat: [
      '{Place} weichen die Truppen von {loser}. Der Rückzug heißt offiziell „Neuaufstellung nach hinten".',
      '{loser} zieht sich {place} zurück. Die Generäle sprechen von Strategie, die Soldaten von Glück.'
    ],
    battleSurrender: [
      '{Place} ergeben sich {pows} Soldaten von {loser}. Sie legen die Waffen ab und sind sichtlich erleichtert.',
      '{Name}: {pows} Kämpfer von {loser} strecken die Waffen. Ab hier zählt nur noch, wer wann nach Hause darf.'
    ],
    arsenal: [
      '{city} eröffnet ein Arsenal. {kingdom} nennt es „Friedenswerk", die Nachbarn nennen es anders.',
      'In {city} steht jetzt ein Arsenal. Es riecht nach Öl, Eisen und schlechten Absichten.',
      '{kingdom} baut in {city} ein Arsenal. Die Kinder dürfen nicht mehr in der Nähe spielen.'
    ],
    firstTank: [
      'In {city} rollt der erste Panzer von {kingdom} aus der Halle. Er ist laut, langsam und frisst Kohle wie Kekse.',
      '{kingdom} hat einen Panzer! Die Straße vor dem Arsenal in {city} hat jetzt Risse – und die Nachbarn Sorgen.'
    ],
    firstGun: [
      'Das erste Feldgeschütz von {kingdom} steht in {city}. Es schießt weit und trifft ungefähr.',
      '{kingdom} stellt in {city} ein Geschütz auf. Die Tauben auf dem Marktplatz sind nicht begeistert.'
    ],
    tankBreach: [
      'Ein Panzer von {kingdom} drückt ein Stück der Mauer von {city} einfach um. Die Maurer sind beleidigt.',
      'Bei {city} rollt ein Panzer durch die Mauer, als wäre sie Pappe. Für die Palisade war sie das auch.'
    ],
    godTank: [
      'Ein Panzer fällt vom Himmel und landet vor {city}. Die Götter haben offenbar Langeweile.',
      'Vor {city} steht plötzlich ein Panzer. Niemand hat ihn bestellt, alle haben Angst vor der Rechnung.'
    ],
    godGun: [
      'Vor {city} steht auf einmal ein Feldgeschütz. Die Götter zielen nicht – das überlassen sie anderen.',
      'Ein Geschütz taucht bei {city} auf. Es schaut neugierig in Richtung der Nachbarn.'
    ],
    godBattle: [
      'Die Götter wollen eine Schlacht: {kingdom} und {other} schicken ihre Heere los. Freiwillig ist hier niemand.',
      'Von oben kommt der Befehl: Schlacht! {kingdom} und {other} marschieren einander entgegen, mit sehr langen Gesichtern.'
    ]
  };

  // Ausgang (wird in {outcome} eingesetzt; Auswahl über Hash, kein Sim-Zufall)
  const OUTCOME = {
    win: [
      '{winner} behält das Feld. Verluste: {lossW} bei {winner}, {lossL} bei {loser}.',
      'Das Feld gehört {winner} – {lossW} eigene und {lossL} gegnerische Kämpfer fehlen am Abend.'
    ],
    retreat: [
      '{loser} hat sich zurückgezogen, {winner} bleibt stehen. Verluste: {lossW} zu {lossL}.',
      'Erst weicht {loser}, dann wird es still. {winner} zählt {lossW} Ausfälle, {loser} {lossL}.'
    ],
    surrender: [
      '{loser} hat sich ergeben, {pows} gehen in Gefangenschaft. Verluste: {lossW} bei {winner}, {lossL} bei {loser}.',
      '{pows} Kämpfer von {loser} ergeben sich {winner}. Ausfälle: {lossW} und {lossL} – zu viele, sagen alle.'
    ],
    parole: [
      '{loser} legt die Waffen nieder; {n} Soldaten dürfen ohne Waffen heimgehen. Verluste: {lossW} bei {winner}, {lossL} bei {loser}.',
      '{n} Kämpfer von {loser} geben auf und trotten nach Hause. {winner} zählt {lossW} Ausfälle, {loser} {lossL}.'
    ],
    draw: [
      'Niemand hat gewonnen. {lossW} und {lossL} Kämpfer fehlen, und keiner weiß mehr, worum es ging.',
      'Unentschieden: Beide Heere sind zu müde zum Weitermachen. Verluste: {lossW} und {lossL}.'
    ]
  };

  // Schlachtname nach Gelände (ohne Stadt in der Nähe): „Schlacht <Phrase>"
  const TERRAIN_PHRASE = {
    grass: 'auf den Wiesen', forest: 'im Wald', hill: 'an den Hügeln', sand: 'am Strand', river: 'am Fluss',
    desert: 'in der Wüste', savanna: 'in der Savanne', jungle: 'im Dschungel', swamp: 'im Sumpf', tundra: 'in der Tundra',
    snowfield: 'im Schnee', taiga: 'im Nadelwald', mushroom: 'im Pilzwald', crystal: 'am Kristallfeld', ash: 'auf dem Aschefeld',
    flowers: 'auf der Blumenwiese'
  };
  const ORDINAL = ['', '', 'Zweite', 'Dritte', 'Vierte', 'Fünfte', 'Sechste', 'Siebte', 'Achte', 'Neunte', 'Zehnte'];

  // Namen der Fahrzeuge je Regierung (Spitznamen der Mannschaft; satirisch, keine realen Bezeichnungen)
  const VEHICLE_NAMES = {
    tank: {
      fascism: ['Unbeugsam', 'Eisenwille', 'Ordnung', 'Gehorsam', 'Großer Schatten', 'Stiefel'],
      communism: ['Plansoll', 'Traktor Nr. 7', 'Übererfüllung', 'Genosse Kessel', 'Fünfjahresplan', 'Volkstrecker'],
      _: ['Rumpel', 'Kessel', 'Brummer', 'Schildkröte']
    },
    artillery: {
      fascism: ['Donnerwort', 'Weitblick', 'Lautsprecher'],
      communism: ['Plankanone', 'Rote Zipfelmütze', 'Normerfüllerin'],
      monarchy: ['Königin Rumms', 'Hofdonner', 'Seine Lautheit'],
      republic: ['Teure Grete', 'Zinseszins', 'Bilanzkanone'],
      democracy: ['Mehrheit', 'Vetorecht', 'Zweite Lesung'],
      _: ['Krachmacherin', 'Rohrspatz', 'Dicke Rumsel']
    }
  };
  const KIND_NAME = { tank: 'Panzer', artillery: 'Feldgeschütz' };

  if (WW.Texts && WW.Texts.EVENTS) {
    for (const k in E) if (!WW.Texts.EVENTS[k]) WW.Texts.EVENTS[k] = E[k];
  }
  WW.TEXTS_MIL = { EVENTS: E, OUTCOME: OUTCOME, TERRAIN_PHRASE: TERRAIN_PHRASE, ORDINAL: ORDINAL, VEHICLE_NAMES: VEHICLE_NAMES, KIND_NAME: KIND_NAME };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
