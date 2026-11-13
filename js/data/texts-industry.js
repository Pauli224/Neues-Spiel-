// Chroniktexte der Industrie. Lädt nach js/data/texts.js und hängt sich an WW.Texts.EVENTS an.
// Platzhalter: {city}, {kingdom}, {kind} (Fabrikart), {kindA} (ein …), {kindD}/{KindD} (das/die …), {kindD_dat}
// (dem/der …), {other} (Nachbarreich), {n}.
(function (WW) { 'use strict';

  const E = {
    indFirst: [
      '{city} eröffnet {kindA}. Der erste Schornstein raucht feierlich, die Kapelle hustet im Takt.',
      'In {city} steht jetzt {kindA}. Die Bewohner sind stolz und ein bisschen grau im Gesicht.',
      '{city} hat {kindA}! Der Bürgermeister schneidet das Band durch, dann sieht er es nicht mehr – zu viel Qualm.'
    ],
    indMore: [
      '{city} baut {kind} Nummer {n}. Die Möwen ziehen vorsichtshalber um.',
      'Noch ein Schornstein in {city}. Man zählt jetzt {n} – oder man würde, wenn man etwas sähe.'
    ],
    indHaze: [
      '{city} meldet: Der Himmel ist jetzt planmäßig grau.',
      'Über {city} hängt eine Dunstglocke. Die Sonne lässt ausrichten, sie komme später wieder.',
      'In {city} sieht man die Hand vor Augen nicht mehr. Das Händeschütteln wird abgeschafft.'
    ],
    indTrees: [
      'Rund um {city} lassen die Bäume die Blätter hängen – und dann ganz fallen. Waldsterben.',
      'Die Wälder bei {city} sehen aus wie ein Kamm nach dem Waschgang. Kahle Stämme, wohin man schaut.',
      'Bei {city} stehen nur noch Baumgerippe. Die Eichhörnchen haben eine Beschwerde eingereicht.'
    ],
    indSick: [
      'In {city} husten alle. Der Arzt verschreibt frische Luft – leider ausverkauft.',
      '{city} ist krank: Die halbe Stadt niest im Chor. Der Chor hat sich trotzdem aufgelöst.',
      'Rauchhusten in {city}. Die Apotheke führt jetzt Nasenklammern in drei Größen.'
    ],
    indMurk: [
      'Der Fluss bei {city} ist jetzt braun. Die Fische tragen Schwimmbrillen und Protestschilder.',
      'Stromabwärts von {city} wird das Wasser trüb. Die Angler fangen vor allem Stiefel.'
    ],
    indAcid: [
      'Säureregen über {city}! Die Regenschirme lösen sich auf, der Humor auch.',
      'Über {city} regnet es sauer. Die Gurken im Garten sind jetzt eingelegt, ganz ohne Glas.',
      '{city} erlebt Säureregen. Die Dachrinnen gurgeln beleidigt.'
    ],
    indFilterVote: [
      'Das Parlament von {kingdom} stimmt ab: Filter in alle Schornsteine! Die Opposition hustet dagegen.',
      '{kingdom} beschließt das Gesetz „Saubere Luft für alle (außer Dienstag)". Filter werden bestellt.'
    ],
    indFilter: [
      '{city} baut einen Filter ein: Der Rauch aus {kindD_dat} ist jetzt nur noch halb so grau und doppelt so stolz.',
      'In {city} bekommt {kindD} einen Filter. Ein Vogel landet probeweise auf dem Schornstein – und bleibt.'
    ],
    indClose: [
      '{city} legt {kindD} still. Die Arbeiter bekommen eine Urkunde und einen Besen.',
      'Neue Regierung, neue Luft: {kindD} in {city} macht dicht. Der letzte Schornstein raucht noch einmal beleidigt.',
      'In {city} wird {kindD} geschlossen. Die Ratten übernehmen die Kantine.'
    ],
    indRuin: [
      '{KindD} in {city} ist nur noch eine Ruine. Moos ist der neue Werksleiter.'
    ],
    indComplaint: [
      '{other} beschwert sich über den Qualm aus {kingdom}: „Unsere Wäsche ist grau, unsere Laune auch!"',
      '{other} schickt {kingdom} einen Brief – in Rußschrift. Inhalt: „Hört auf zu qualmen!"',
      'Die Gesandten von {other} kommen mit Taschentüchern vor dem Mund zu {kingdom}. Die Stimmung ist frostig.'
    ],
    indBarren: [
      'Der Boden um {city} ist grau wie ein Montagmorgen. Die Rüben wachsen jetzt freiwillig nach unten weg.',
      'Bei {city} wächst nichts mehr außer der Ratlosigkeit der Bauern. {n} % der Felder sind ausgelaugt.',
      'Um {city} färbt sich die Wiese aschgrau. Die Schafe halten es für modern, die Bauern nicht.'
    ],
    indClean: [
      'Über {city} ist der Himmel wieder blau. Alte Leute erzählen den Kindern, was „Sonne" ist.'
    ]
  };

  if (WW.Texts && WW.Texts.EVENTS) {
    for (const k in E) if (!WW.Texts.EVENTS[k]) WW.Texts.EVENTS[k] = E[k];
  }
  WW.TEXTS_INDUSTRY = E;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
