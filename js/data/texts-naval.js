// Chroniktexte der Seefahrt (Häfen, Schiffe, Handel, Überfahrt, Landungen, Seegefechte). Lädt nach js/data/texts.js
// und hängt sich an WW.Texts.EVENTS an. Ton: Witz in der Chronik, Ortsnamen bleiben ernst; Seegefechte comichaft,
// niemand ertrinkt – Schiffbrüchige schwimmen immer an Land.
// Platzhalter: {kingdom}, {other}, {city}, {otherCity}, {ship} (Schiffsname), {attacker} (Name des angreifenden Schiffs),
//   {kind} (Schiffsart), {n} (Anzahl), {terrain} (Gelände am Zielort)
(function (WW) { 'use strict';

  const E = {
    harborBuilt: [
      '{city} hat jetzt einen Hafen. Die Möwen haben die Eröffnung schon vor allen anderen gefeiert.',
      'In {city} steht der erste Steg im Wasser. Ab heute riecht die Stadt ein bisschen nach Fisch und Fernweh.',
      '{city} baut einen Hafen. Irgendwer muss jetzt lernen, was „backbord" heißt.'
    ],
    firstShip: [
      'Stapellauf in {city}: {ship}, das erste Schiff von {kingdom}, schwimmt. Alle sind erleichtert, am meisten der Zimmermann.',
      '{kingdom} hat ein Schiff! {ship} läuft in {city} vom Stapel und legt sich nur ganz kurz auf die Seite.',
      'In {city} wird {ship} zu Wasser gelassen. Die Flasche am Bug hat beim dritten Versuch nachgegeben.'
    ],
    seaTrade: [
      '{ship} aus {city} legt in {otherCity} an. Gewürze, Tuch und Neuigkeiten wechseln den Besitzer.',
      'Handelsschiff {ship} bringt Waren von {city} nach {otherCity}. Beide Seiten finden, sie hätten das bessere Geschäft gemacht.',
      'Im Hafen von {otherCity} wird {ship} entladen. Die Händler aus {city} feilschen, bis die Sonne untergeht.'
    ],
    bigCatch: [
      'Riesenfang in {city}: {ship} kommt so voll zurück, dass die Fische schon auf Deck sitzen.',
      'Die Fischer von {city} prahlen mit einem Fang „so groß wie ein Ruderboot". Gesehen hat ihn keiner, gegessen haben ihn alle.'
    ],
    seaColony: [
      '{n} Siedler aus {city} gehen an Bord von {ship}. Daheim ist kein Platz mehr – also eben über das Meer.',
      '{kingdom} schickt {n} Leute aus {city} übers Wasser. Sie haben Saatgut, Werkzeug und sehr viel Zwieback dabei.',
      'Von {city} legt {ship} mit {n} Siedlern ab. Am Kai wird gewunken, bis das Segel nur noch ein Punkt ist.'
    ],
    seaColonyLand: [
      'Land in Sicht! {n} Siedler von {kingdom} gehen an einer fremden Küste an Land ({terrain}). Der Boden schwankt noch eine Weile.',
      '{ship} setzt {n} Siedler aus {city} an einer neuen Küste ab. Erste Amtshandlung: Füße trocknen.',
      'Nach langer Fahrt betreten {n} Leute von {kingdom} neues Land. Jemand pflanzt feierlich eine Rübe.'
    ],
    seaInvasion: [
      '{kingdom} schifft {n} Soldaten in {city} ein. Ziel: {otherCity}. Die Seekrankheit kämpft schon jetzt mit.',
      'In {city} gehen {n} Soldaten von {kingdom} an Bord von {ship}. Über das Meer soll es nach {otherCity} gehen.',
      '{kingdom} plant eine Landung bei {otherCity}. {n} Soldaten üben vorher noch, nicht über Bord zu fallen.'
    ],
    seaLanding: [
      'Landung! {n} Soldaten von {kingdom} gehen nahe {otherCity} an Land. {other} hatte mit vielem gerechnet, nicht mit Booten.',
      '{ship} setzt {n} Soldaten bei {otherCity} ab. Die Strandkrabben räumen das Feld.',
      'An der Küste vor {otherCity} landen Truppen von {kingdom}. Erst die nassen Stiefel, dann der Krieg.'
    ],
    seaBattle: [
      'Seegefecht! {attacker} ({kingdom}) versenkt {ship} ({other}). Die {n} Leute an Bord paddeln laut schimpfend an die Küste.',
      '{ship} von {other} geht nach Treffern von {attacker} unter. Alle {n} an Bord schwimmen an Land – nass, aber unversehrt.',
      'Kanonendonner auf dem Meer: {attacker} schickt {ship} auf den Grund. Die Besatzung erreicht schwimmend das Ufer und will nie wieder Fisch essen.'
    ],
    shipwreck: [
      '{ship} von {kingdom} sinkt. Die {n} an Bord retten sich ans Ufer und streiten, wer das Leck übersehen hat.',
      'Schiffbruch: {ship} geht unter. Alle {n} kommen an Land, nur der Stolz bleibt im Wasser.'
    ],
    seaBombard: [
      '{ship} von {kingdom} beschießt die Mauern von {city} von See her. Die Fischer im Hafen ziehen die Köpfe ein.',
      'Von der See aus donnern die Geschütze von {ship} gegen {city}. Die Möwen ziehen in eine ruhigere Bucht.'
    ],
    godHarbor: [
      'Über Nacht steht an der Küste von {city} ein fertiger Hafen. Die Zimmerleute schwören, sie waren es nicht.',
      'Ein Hafen fällt {city} vom Himmel – mit Steg, Pollern und einem verwirrten Hafenmeister.'
    ],
    godShip: [
      'Aus dem Nichts schaukelt {ship} vor der Küste – ein {kind} für {kingdom}. Niemand weiß, wer es bestellt hat.',
      'Die Götter schenken {kingdom} ein Schiff: {ship}. Gebrauchsanweisung liegt nicht bei.'
    ]
  };

  // Schiffsnamen je Regierung (Chronik und Info-Fenster; Humor erlaubt, keine echten Personen oder Parolen)
  const SHIP_NAMES = {
    tribe: ['Treibholz', 'Flinker Otter', 'Großer Einbaum', 'Regenmacher', 'Lachender Hecht', 'Möwenfeder'],
    monarchy: ['Königin Wellenreich', 'Stolz der Krone', 'Prinz Rumpel', 'Hofnarr', 'Edle Makrele', 'Seine Hoheit'],
    democracy: ['Mehrheitsbeschluss', 'Freie Fahrt', 'Bürgerinitiative', 'Stimmzettel', 'Gute Laune', 'Tagesordnung'],
    fascism: ['Unbeugsam', 'Eiserne Pflicht', 'Strenger Blick', 'Gleichschritt', 'Kaltes Eisen', 'Stahlgrau'],
    communism: ['Planerfüllung', 'Genossin Möwe', 'Fünfjahresplan', 'Volksfischer', 'Rote Rübe', 'Kollektiv'],
    theocracy: ['Heilige Barke', 'Großer Knödel', 'Frommer Wind', 'Segensreich', 'Stilles Gebet', 'Erleuchtung'],
    republic: ['Goldene Waage', 'Zinseszins', 'Gute Bilanz', 'Kaufmannsglück', 'Pfeffersack', 'Fette Fracht'],
    anarchy: ['Kein Kapitän', 'Plenum auf See', 'Flickwerk', 'Freibeuterin', 'Basisdemokratie', 'Wilde Hummel'],
    _: ['Seekuh', 'Möwenschreck', 'Flinke Forelle', 'Salzbart', 'Wellenreiter']
  };

  if (WW.Texts && WW.Texts.EVENTS) {
    for (const k in E) if (!WW.Texts.EVENTS[k]) WW.Texts.EVENTS[k] = E[k];
  }
  WW.TEXTS_NAVAL = { EVENTS: E, SHIP_NAMES: SHIP_NAMES };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
