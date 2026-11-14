// Chroniktexte der Industrie. Lädt nach js/data/texts.js und hängt sich an WW.Texts.EVENTS an.
// Platzhalter: {city}, {kingdom}, {kind} (Fabrikart), {kindA} (ein …), {kindD}/{KindD} (das/die …), {kindD_dat}
// (dem/der …), {other} (Nachbarreich bzw. zweiter Ort), {n}, {m}, {gov}.
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
    railStation: [
      '{city} baut einen Bahnhof. Die Bahnhofsuhr geht schon vor, bevor das Dach drauf ist.',
      'In {city} entsteht ein Bahnhof. Der Wartesaal ist zuerst fertig – man ahnt, warum.'
    ],
    railFirst: [
      'Der erste Zug von {city} nach {other} fährt pünktlich ab. Ankunft: unklar.',
      'Mit viel Dampf und noch mehr Reden rollt der erste Zug von {city} nach {other}. Die Blaskapelle fährt schwarz mit.',
      'Zug frei zwischen {city} und {other}! Die Kühe an der Strecke haben dazu eine klare Meinung.'
    ],
    railBroken: [
      'Die Strecke bei {city} ist unterbrochen. Der Zug wartet geduldig, der Lokführer weniger.',
      'Gleise kaputt bei {city}! Der Fahrplan wird zur Kurzgeschichte.'
    ],
    railRepaired: [
      'Die Strecke bei {city} ist repariert. Der Zug hat in der Zwischenzeit Moos angesetzt.',
      'Bei {city} rollt es wieder. Die Verspätung wird offiziell „Pause" genannt.'
    ],
    railTroops: [
      '{n} Soldaten aus {city} steigen in den Zug an die Front. Die Fahrkarten zahlt der Staat, die Rechnung das Volk.',
      'Ein Truppenzug verlässt {city}. Die Lok pfeift, die Mütter nicht.'
    ],
    // Arbeitslager: bitter gegen das Regime, nie spöttisch über die Gefangenen
    campBuilt: [
      'Vor {city} entsteht ein umzäuntes Lager. Offiziell heißt es „Erholungsheim für Andersdenkende". Niemand lacht.',
      'Das Regime von {kingdom} baut bei {city} ein Arbeitslager. Wer fragt, wofür, steht schon auf einer Liste.'
    ],
    campPickup: [
      'In {city} werden nachts Leute abgeholt, die zu laut unzufrieden waren ({n}). Am Morgen sind alle sehr leise.',
      'Das Regime holt in {city} Kritiker ab ({n}) und bringt sie nach {other}. Die Zeitung meldet: „Keine besonderen Vorkommnisse."',
      'Aus {city} müssen Leute nach {other} ({n}). Ihr Vergehen: Sie haben gesagt, was alle denken.'
    ],
    campIntern: [
      'Besiegte Aufständische kommen ins Lager {city}. Das Regime nennt es Ordnung, das Land nennt es Angst.',
      'Wer in {kingdom} widersprochen hat, marschiert jetzt nach {city}. Die Regierung spricht von „Umerziehung", sonst spricht niemand.'
    ],
    campPow: [
      'Kriegsgefangene aus {other} werden ins Lager {city} geführt. Die Siegesparade fällt auffällig leise aus.',
      '{kingdom} lässt Gefangene aus {other} im Lager {city} schuften. Das Kriegsrecht hat das Regime gerade nicht zur Hand.'
    ],
    campFounded: [
      'Aus dem Lager vor {other} wird eine eigene Siedlung: {city}. Zaun, Baracken, Kommandantur – {kingdom} nennt das Aufbau.',
      '{kingdom} gründet die Lagerstadt {city}. Auf der Karte ist sie klein. Für die, die hin müssen, ist sie riesig.'
    ],
    campFence: [
      'Um {city} steht jetzt ein Zaun mit genau einem Tor. Es geht nur in eine Richtung auf.',
      'Der Zaun von {city} ist fertig. {kingdom} meldet stolz: „Niemand ist je unerlaubt hinausgegangen." Das ist der Punkt.'
    ],
    campBarrack: [
      'In {city} wird eine weitere Baracke gezimmert. Das Regime plant offenbar mit noch mehr Unzufriedenen.',
      '{city} bekommt mehr Pritschen. Fragen nach dem Warum stellt man besser leise.'
    ],
    campUprising: [
      'Aufstand in {city}! Die Gefangenen öffnen das Tor von innen, die Wachen laufen davon. {city} ist frei und gehört jetzt sich selbst: {kingdom}.',
      'In {city} übernehmen die Insassen. Kein Schuss, nur sehr viele Leute, die genug hatten. Aus dem Lager wird eine freie Stadt ({gov}).'
    ],
    campTrain: [
      'Ein Zug mit geschlossenen Wagen verlässt {other} Richtung {city}. An Bord: {n} Gefangene. Im Fahrplan steht „Sonderfahrt", in den Gesichtern am Bahnsteig etwas anderes.',
      '{kingdom} schickt {n} Gefangene per Bahn nach {city}. Die Regierung lobt die Pünktlichkeit. Sonst lobt niemand etwas.'
    ],
    campTrainFreed: [
      'Bei {city} bleibt ein Gefangenenzug liegen – die Türen gehen auf, {n} Menschen laufen in die Freiheit. Das Regime schickt einen Bericht, keinen Zug.',
      'Der Gefangenenzug kommt nicht an: {n} Insassen sind frei. Bei {city} winken die Leute vom Feldrand.'
    ],
    campEscortBeaten: [
      'Bei {city} wird eine Gefangenenkolonne überfallen. Die Wache liegt im Gras, die Gefangenen laufen nach Hause.',
      'Die Begleitwache eines Gefangenenzugs bei {city} ist geschlagen – und plötzlich hat niemand mehr Gefangene.'
    ],
    campMemorial: [
      'In {city} wird ein Mahnmal enthüllt. Darauf steht nur der Name des Lagers – und dass es nie wieder eines geben soll.'
    ],
    powTaken: [
      'Gefangene Soldaten aus {other} werden nach {city} geführt. Sie bekommen Suppe, Decken und die Zusage: Beim Frieden geht es heim.',
      '{kingdom} hält Kriegsgefangene aus {other} am Stadtrand von {city}. Man spielt abends Karten, über den Krieg redet keiner.'
    ],
    powReturn: [
      'Frieden: {kingdom} schickt {n} Kriegsgefangene nach {other} heim. An der Grenze wird gewunken, auf beiden Seiten.',
      '{n} Kriegsgefangene aus {other} dürfen heim. {kingdom} gibt ihnen sogar Proviant mit. Das wird man sich merken.'
    ],
    powKept: [
      'Frieden mit Haken: {kingdom} lässt nur {n} Gefangene aus {other} frei, {m} bleiben im Lager. „Vertragsdetails", sagt das Regime. {other} nennt es Geiselnahme.',
      '{kingdom} unterschreibt den Frieden und behält {m} Gefangene aus {other}. In {other} wird über eine Befreiung geredet, nicht mehr nur geflüstert.'
    ],
    powExchange: [
      'Mitten im Krieg tauschen {kingdom} und {other} je {n} Gefangene aus. Auf einer Brücke, sehr feierlich, sehr kurz.',
      'Gefangenenaustausch: {n} gegen {n}. Für einen Nachmittag sind {kingdom} und {other} sich einig.'
    ],
    powHome: [
      '{n} Kriegsgefangene kommen nach {city} heim. Die Glocken läuten, und jemand hat sehr viel Kuchen gebacken.',
      'Heimkehr in {city}: {n} Soldaten, abgemagert, aber zu Fuß. Die Stadt steht Spalier.'
    ],
    powEscape: [
      'Aus dem Gefangenenlager bei {city} ist jemand entwischt – unter einem Heukarren. Die Wachen zählen nach und hoffen, dass sie sich verzählt haben.'
    ],
    campBreakout: [
      'Ausbruch bei {city}! {n} Gefangene fliehen und schließen sich dem Widerstand an. Das Regime spricht von „Missverständnis".',
      '{n} Gefangene entkommen dem Lager bei {city}. In der Stadt wird heimlich gefeiert.'
    ],
    campRiot: [
      'Aufstand im Lager bei {city}: {n} Gefangene entkommen. Die Wachen erklären, sie hätten nur kurz weggeschaut – diesmal stimmt es.'
    ],
    campProtest: [
      '{other} verurteilt die Lager von {kingdom} scharf. Es ist von „Befreiung" die Rede.',
      'In {other} gehen Leute gegen die Lager von {kingdom} auf die Straße. Die Gesandten von {kingdom} reisen früher ab.'
    ],
    campLiberated: [
      'Das Lager bei {city} ist aufgelöst! {n} Befreite gehen nach Hause, die ganze Stadt steht Spalier. Wo der Zaun war, entsteht ein Mahnmal.',
      'Befreiung in {city}: Die Tore des Lagers stehen offen, {n} Menschen sind wieder frei. Nie wieder, sagt die Stadt, und meint es.',
      '{city} ist kein Lager mehr. Der Zaun fällt, die Baracken werden Wohnhäuser, und mitten im Ort steht jetzt ein Mahnmal.'
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
