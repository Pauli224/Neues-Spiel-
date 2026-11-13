// Chronik-Texte: je Ereignistyp mehrere Varianten mit Platzhaltern {city}, {kingdom}, {other} …
// {nWord} = Zahlwort zu {n}, {NWord} = großgeschrieben. {reason} = zufälliger Kriegsanlass.
// Familienfreundlich, liebevoll-albern; keine realen Personen, Symbole oder Parolen.
(function (WW) { 'use strict';

  const T = {
    // ---------------------------------------------------------------- Städte
    hallStart: [
      'In {city} wird eine Dorfhalle gezimmert. Das Lagerfeuer bekommt endlich ein Dach.',
      '{city} hat genug vom Zelten: Eine richtige Halle soll her.',
      'Die Leute von {city} stapeln Balken. Wer zuletzt kommt, muss den Dachfirst festhalten.'
    ],
    hallDone: [
      'Die Dorfhalle von {city} steht! Zum ersten Mal regnet es nicht ins Abendessen.',
      '{city} feiert seine neue Dorfhalle mit einem Tanz, der drei Bänke kostet.',
      'Aus dem Lager {city} wird ein Dorf mit Halle. Die Zelte schauen neidisch.'
    ],
    seatStart: [
      '{city} beginnt mit dem Bau eines Regierungssitzes. Der Architekt verspricht „etwas Großes“.',
      'In {city} wird der Grundstein für ein prächtiges Regierungsgebäude gelegt. Die Kasse seufzt.',
      '{city} will repräsentieren: Ein richtiger Regierungssitz muss her.'
    ],
    seatDone: [
      'Der Regierungssitz von {city} ist fertig: {center}. Man sieht ihn schon von Weitem.',
      '{city} hat jetzt ein richtiges Zentrum ({center}). Die alte Halle wird zum Lagerraum.',
      'Feierliche Eröffnung in {city}: {center}! Die Fahne klemmt, alle klatschen trotzdem.'
    ],
    found: [
      '{NWord} mutige Siedler gründen {city}. Der erste Streit um den besten Zeltplatz folgt sofort.',
      'Ein Lager wird aufgeschlagen: {city}. Lagerfeuer, Fahnenstange, ein Haufen Vorräte. Mehr braucht es vorerst nicht.',
      '{NWord} Siedler schlagen ihr Lager auf und nennen es {city}. Das Zelt des Anführers ist das schiefste.',
      '{city} wird gegründet. Die Gründer sind sich einig: Hier ist es schön. Über alles andere wird noch gestritten.',
      'Auf einer Wiese rammt jemand einen Pflock in den Boden und ruft „{city}!“. So entstehen Städte.',
      '{NWord} Siedler packen aus und nennen den Ort {city}. Der Name war ein Missverständnis, bleibt aber.',
      '{Kingdom_nom} entsteht. Erste Amtshandlung: ein Lagerfeuer. Zweite Amtshandlung: Würstchen.',
      '{city} ist gegründet. Ein Schaf schaut skeptisch zu.'
    ],
    joinCity: [
      '{NWord} Neuankömmlinge ziehen nach {city} und fragen als Erstes nach dem Bäcker.',
      '{city} bekommt Zuwachs: {nWord} Siedler mit sehr viel Gepäck.',
      'In {city} treffen {nWord} Neue ein. Die Alteingesessenen tun so, als hätten sie Platz.'
    ],
    firstHouse: [
      'In {city} steht das erste Haus. Alle wollen das Zimmer mit Fenster.',
      '{city} baut sein erstes Haus. Die Tür klemmt, aber das gehört dazu.',
      'Das erste Dach von {city} ist dicht. Zumindest bis zum nächsten Regen.',
      'In {city} wird das erste Haus eingeweiht. Es gibt Kuchen und einen Streit über die Hausnummer.'
    ],
    tier: [
      '{city} ist jetzt {tierA}! Auf dem Ortsschild ist kaum noch Platz.',
      '{city} wächst und darf sich {tier} nennen. Die Ältesten erinnern sich noch an die Zeit mit drei Zelten.',
      'Herzlichen Glückwunsch: {city} ist jetzt {tierA}. Die Stadtkasse kauft ein größeres Schild.',
      '{city} wird {tierA}. Der erste Stau vor dem Brunnen wird gemeldet.'
    ],
    famine: [
      'In {city} sind die Vorratskammern leer. Man isst Suppe aus Steinen und beschwert sich.',
      'Hunger in {city}! Selbst die Mäuse ziehen aus.',
      '{city} hungert. Der Koch schwört, das sei Diät.',
      'In {city} gibt es nichts mehr zu essen. Die Laune sinkt schneller als der Teig.'
    ],
    settlersLeave: [
      '{NWord} Abenteuerlustige verlassen {city}, um anderswo alles besser zu machen.',
      'Aus {city} zieht ein Siedlertrupp los. Proviant: genug. Orientierungssinn: fraglich.',
      '{city} wird zu eng. {NWord} Siedler packen ihre Bündel und winken.',
      'Ein Trupp aus {city} macht sich auf. „Wir schreiben!“, rufen sie. Niemand kann schreiben.'
    ],
    daughter: [
      'Siedler aus {mother} gründen {city}. Die Mutterstadt schickt einen Kuchen und gute Ratschläge.',
      '{city} entsteht als Tochterstadt von {mother}. Alles ist genauso, nur ganz anders.',
      '{Kingdom_nom} wächst: {city} wird gegründet. Erster Beschluss: Man ist nicht wie {mother}.',
      'In {city} rammen {nWord} Siedler aus {mother} den ersten Pflock ein. Er steht schief.'
    ],
    cityAbandoned: [
      '{city} ist verlassen. Nur ein vergessener Hut erinnert an bessere Zeiten.',
      'Der letzte Bewohner von {city} macht das Licht aus. Es gab gar kein Licht.',
      '{city} wird aufgegeben. Die Schafe übernehmen.',
      'Von {city} bleiben nur Ruinen und eine sehr lange Liste unerledigter Aufgaben.'
    ],
    centerLost: [
      'Das Zentrum von {city} liegt in Trümmern. Die Leute stehen ratlos davor und halten Hämmer.',
      'In {city} fällt das Zentrum. „Wir bauen es wieder auf“, sagt jemand. „Schöner!“'
    ],
    monument: [
      '{city} bekommt ein Wahrzeichen: {monument}. Tauben aus dem ganzen Land reisen an.',
      'In {city} wird gebaut: {monument}. Größer als nötig und genau richtig.',
      'Neues Wahrzeichen für {city}: {monument}. Die Stadtführer üben schon ihre Witze.'
    ],
    shrine: [
      '{city} baut noch einen Schrein für {deity}. Man kann nie genug Schreine haben, sagt die Priesterschaft.',
      'Ein weiterer Schrein in {city}. {deity} soll sich überall zu Hause fühlen.'
    ],
    barracks: [
      '{city} baut schon die {n}. Kaserne. Die Stiefel stehen in Reih und Glied.',
      'Noch eine Kaserne in {city}. Die Trompeter üben morgens um fünf.'
    ],
    market: [
      '{city} eröffnet den {n}. Markt. Die Händler überbieten sich im Lautsein.',
      'Neuer Markt in {city}! Ab sofort gibt es dreierlei Senf.'
    ],
    repurpose: [
      'In {city} werden Gebäude umgewidmet, die zu {gov_dat} nicht passen. Aus der Kaserne wird eine Wohngemeinschaft.',
      '{city} baut um: Was {gov_d} nicht braucht, wird zu Wohnungen. Die Möbelpacker haben viel zu tun.'
    ],

    // ---------------------------------------------------------------- Mauern
    wallPlan: [
      '{city} beginnt eine Palisade. Offizieller Grund: Wölfe. Inoffizieller Grund: die Nachbarn.',
      'In {city} werden Pflöcke eingeschlagen. Eine Mauer! Man fühlt sich gleich wichtiger.',
      '{city} plant einen Mauerring. Die Baumeister rollen eine sehr große Karte aus.',
      'Der Rat von {city} beschließt: Ein Zaun muss her, und zwar einer, über den man nicht klettern kann.',
      '{city} vermisst seinen Mauerverlauf mit einer Schnur. Die Schnur reicht nicht ganz.'
    ],
    barricadePlan: [
      'Das Plenum von {city} einigt sich nach langer Debatte auf Barrikaden. Aus Gerümpel. Mit Lücken. Aus Prinzip.',
      '{city} stapelt alte Fässer, Stühle und eine Badewanne zu einer Barrikade.',
      'In {city} entsteht eine Barrikade. Jeder bringt etwas mit, meistens Sofas.'
    ],
    wallDone: [
      'Die Palisade von {city} ist geschlossen. Die Wölfe sind beleidigt.',
      '{city} ist rundherum ummauert. Endlich kann man das Tor zuschlagen.',
      'Der Mauerring von {city} ist fertig. Der Baumeister legt sich drei Tage hin.',
      'In {city} wird das letzte Mauerstück gesetzt. Großes Fest mit Pfahl-Weitwurf.'
    ],
    barricadeDone: [
      'Die Barrikade von {city} ist fertig. Die Lücken sind Absicht, betont das Plenum.',
      '{city} hat jetzt eine Barrikade. Sie hält, solange niemand dagegen lehnt.'
    ],
    wallStone: [
      '{city} ersetzt die Palisade durch Stein. Die Holzfäller sind erleichtert, die Steinmetze nicht.',
      'In {city} beginnt der Bau einer Steinmauer mit Türmen. Holz ist ja so letzte Saison.',
      '{city} rüstet auf: Stein statt Holz. Die Termiten ziehen enttäuscht weiter.'
    ],
    wallStoneDone: [
      'Die Steinmauer von {city} steht. Auf den Türmen wird schon gewinkt.',
      '{city} hat jetzt eine richtige Steinmauer. Die Nachbarn tun so, als wäre ihnen das egal.',
      'Der letzte Stein der Mauer von {city} sitzt. Ein Steinmetz weint vor Glück.'
    ],
    wallFortress: [
      '{city} baut seine Mauer zur Festung aus. Man munkelt von Zinnen, Pechnasen und einem Burggraben ohne Wasser.',
      'In {city} wird die Mauer noch dicker. Niemand weiß genau, wovor man sich fürchtet.'
    ],
    wallFortressDone: [
      '{city} ist jetzt eine Festung. Sogar das Wetter klopft vorher an.',
      'Die Festungsmauer von {city} ist fertig. Man könnte jetzt in Ruhe belagert werden.'
    ],
    wallExpand: [
      '{city} platzt aus allen Nähten und plant einen größeren Mauerring.',
      'In {city} ist kein Platz mehr. Die Mauer muss weiter raus, beschließt der Rat.',
      '{city} wächst über die eigene Mauer hinaus. Die Schnur wird verlängert.'
    ],
    wallExpandDone: [
      'Der neue Ring von {city} steht, die alte Mauer wird abgetragen. Die Steine bekommen ein zweites Leben.',
      '{city} hat seine Stadterweiterung abgeschlossen. Die alte Mauer wird zu Gartenzäunen.'
    ],
    wallBreach: [
      'Bresche in der Mauer von {city}! Truppen aus {other_dat} drängen herein.',
      'Die Mauer von {city} bekommt ein Loch. Es war nicht für die Katze gedacht.',
      'Ein Mauerstück von {city} fällt unter den Hieben von {other_dat}.'
    ],

    // ---------------------------------------------------------------- Regierungen
    gov: [
      'Das Reich heißt jetzt {kingdom} und wird als {gov} regiert. Die alten Schilder werden übermalt.',
      'Aus {oldGov_dat} wird {gov_a}. Die Leute nicken höflich und machen weiter.',
      '{kingdom_nom}: Neue Regierungsform {gov}! Neue Hüte für alle Wichtigen.'
    ],
    govSet: [
      'Ein Blitz aus heiterem Himmel, und schon regiert {gov_d}: {kingdom}. Die Untertanen sind verwirrt, aber anpassungsfähig.',
      'Von oben wird verfügt: {Kingdom_in} regiert ab sofort {gov_d}. Die Druckerei arbeitet Überstunden.',
      'Göttlicher Erlass: {Kingdom_in} regiert nun {gov_d}. {leader} probiert vor dem Spiegel den neuen Hut an.',
      'Über Nacht wird aus {oldGov_dat} {gov_a}. Beim Frühstück fragen sich alle, wer jetzt bestimmt, wer abräumt.'
    ],
    govChoice: [
      '{kingdom_nom} hat sich entschieden: Ab jetzt regiert {gov_d}. Begründung: {why}.',
      'Großer Rat am Feuer: Man wählt {gov_acc}. Es heißt jetzt {kingdom}, denn {why}.',
      'Nach langem Palaver wird aus dem Stamm {gov_a}. Der Grund: {why}.',
      'Neue Ordnung im Reich: {gov}! Offizieller Grund: {why}. Inoffizieller Grund: neue Hüte.'
    ],
    reform: [
      'Reform! {Kingdom_in} regiert nun {gov_d}. Die Krone kommt ins Museum, der Thron wird Parkbank.',
      'Die Monarchie dankt freiwillig ab. Es lebe {gov_d}! Der Ex-Monarch eröffnet eine Bäckerei.'
    ],
    strongman: [
      'In der Krise wählt das Volk einen „starken Mann“. {Kingdom_in} regiert jetzt {gov_d}. Bald bereuen es alle.',
      'Aus Angst wird gewählt, was laut ist: {Kingdom_in} regiert nun {gov_d}. Die nächste Wahl fällt leider aus.'
    ],
    collapse: [
      'Zusammenbruch! Niemand will mehr regieren. {Kingdom_in} herrscht jetzt Anarchie, das Plenum tagt ab sofort.',
      'Die Ordnung zerfällt: {Kingdom_in} entscheidet nun das Plenum. Oder niemand. Oder alle.'
    ],
    evolve: [
      'Der Stamm ist erwachsen geworden: {Kingdom_in} regiert jetzt {gov_d}. Das Lagerfeuer bekommt einen Kamin.',
      'Aus dem Stammesrat wird {gov_a}. {leader} hält eine erste Rede und verhaspelt sich nur zweimal.',
      '{kingdom_nom}: Nach langem Palaver am Feuer entscheidet man sich für {gov_acc}.'
    ],
    revolution: [
      'Revolution! {OldGov_d} ist gestürzt. Grund: {why}. Es lebe {gov_d}!',
      'Revolution! {OldGov_d} ist gestürzt, es lebe {gov_d}. {Kingdom_nom} sortiert seine Möbel neu.',
      'Das Volk hat genug: Aus {oldGov_dat} wird {gov_a}. Die alten Hüte landen im Fluss.',
      'Umsturz im Reich! {Kingdom_in} herrscht jetzt {gov_d}. Der Hofstaat sucht neue Arbeit.'
    ],
    regimeFall: [
      'Das Regime ist gestürzt! Das Volk feiert auf den Straßen, die Paradeuniformen werden zu Putzlappen. Es lebe {gov_d}.',
      'Die Kommandantur ist leer, der Diktator ist weg, und plötzlich lachen alle wieder. {kingdom_in} regiert nun {gov_d}.',
      'Aus Angst wurde Mut: Die Strammen sind gestürzt. {Kingdom_nom} atmet auf.'
    ],
    coup: [
      'Putsch! In Kriegszeiten reißt eine strenge Clique die Macht an sich. {Kingdom_in} regiert nun {gov_d}. Niemand hat danach gefragt.',
      'Während alle nach draußen schauen, übernimmt drinnen jemand das Kommando. {Kingdom_in} herrscht jetzt {gov_d}. Die Laune sinkt sofort.'
    ],
    plenumVote: [
      'Das Plenum stimmt nach zehn Jahren Debatte dafür, Abstimmungen künftig zu zählen. {Kingdom_in} regiert nun {gov_d}.',
      'Die Kommune hat sich selbst abgeschafft, demokratisch natürlich. Willkommen, {kingdom}.'
    ],
    succession: [
      '{old} ist tot. Lang lebe {leader}!',
      'Trauer {kingdom_in}: {old} ist verstorben. Die Krone rutscht auf den Kopf von {leader}.',
      '{old} hat das Zeitliche gesegnet. {leader} besteigt den Thron und stößt sich den Kopf.',
      'Die Glocken läuten für {old}. Kaum verklungen, läuten sie schon für {leader}.'
    ],
    leaderDeath: [
      '{old} ist gestorben. Neu im Amt: {leader}.',
      '{Kingdom_nom} trauert um {old}. {leader} übernimmt und findet den Schreibtisch unaufgeräumt vor.',
      '{old} ist nicht mehr. {leader} tritt die Nachfolge an und ändert als Erstes die Sitzordnung.'
    ],
    throneFeud: [
      'Thronstreit {kingdom_in}! {claimant} behauptet, die Krone passe ihr oder ihm viel besser.',
      '{claimant} zweifelt öffentlich an der Erbfolge. {leader} zweifelt öffentlich an {claimant}. Unruhe im Reich.',
      '{Kingdom_in} ziehen zwei an derselben Krone: {leader} und {claimant}.'
    ],
    election: [
      'Wahl in {city}: {winner} ({party}) gewinnt mit {pct} %.',
      '{Kingdom_nom} hat gewählt! {winner} von der {party} siegt mit {pct} %. {loser} ({loserParty}) gratuliert zähneknirschend.',
      'Wahlabend in {city}: {results}. Versprochen wird {bonus}.',
      'Mit {pct} % gewinnt {winner} ({party}) die Wahl. Erste Amtshandlung: {bonus}.',
      'Die Urnen sind ausgezählt: {winner} gewinnt knapp vor {loser}. Die {party} feiert mit Kuchen.'
    ],
    shamElection: [
      'Wahl {kingdom_in}: {leader} erhält {pct} % der Stimmen. Die Zählkommission ist sehr stolz.',
      'Die {party} gewinnt mit {pct} %. Die Opposition war leider verhindert. Für immer.',
      'Bei der Wahl in {city} stimmen {pct} % für {leader}. Rechnen ist {kingdom_in} nicht erlaubt.',
      'Wahlergebnis {kingdom_in}: {pct} %. Niemand traut sich zu fragen, wovon.'
    ],
    fiveYearPlan: [
      'Der neue Fünfjahresplan von {city} sieht {goal} vor. Niemand weiß, wohin damit.',
      'Fünfjahresplan {kingdom_in}: Schwerpunkt {focus}, Ziel: {goal}. Der Ausschuss applaudiert sich selbst.',
      'Der Plan ist da! {goal}. Wer zweifelt, muss das Protokoll schreiben.',
      'Neuer Plan {kingdom_in}: {goal}. Die Formulare dafür füllen ein ganzes Lagerhaus.'
    ],
    planResult: [
      'Der alte Plan („{goal}“) wurde laut Ausschuss zu {pct} % erfüllt. Die Rüben sehen das anders.',
      'Planerfüllung {kingdom_in}: {pct} %! Gezählt hat ein sehr optimistischer Beamter.',
      'Bilanz des Plans „{goal}“: {pct} %. Eine Medaille für alle, Kartoffeln für wenige.'
    ],
    miracleHarvest: [
      '{deity} lässt in {city} über Nacht alle Felder reifen. Die Priesterschaft tut so, als hätte sie es angekündigt.',
      'Wunder {kingdom_in}! Die Ähren biegen sich. {deity} sei gepriesen, sagt man, und erntet.',
      'Ein Erntewunder in {city}: {deity} hat offenbar gute Laune.'
    ],
    miracleHeal: [
      'Wunderheilung {kingdom_in}! {deity} kuriert alle Wehwehchen. Der Bader ist arbeitslos.',
      'In {city} sind plötzlich alle gesund. Die Priester verweisen auf {deity}, der Arzt auf den Frühling.'
    ],
    sermon: [
      'In {city} predigt {leader} drei Stunden über {deity}. Die Kinder zählen die Fliegen.',
      '{leader} verkündet: {deity} wünscht sich mehr Gemüse. Die Bauern seufzen.',
      'Predigt {kingdom_in}: {deity} mag keine Unordnung. Alle räumen hastig auf.',
      '{leader} erklärt, {deity} habe im Traum gesprochen. Es ging um Pünktlichkeit.'
    ],
    plenum: [
      'Das Plenum von {city} diskutiert im {n} Jahr, ob ein Tor Herrschaft ist.',
      'Das Plenum von {city} tagt. Tagesordnungspunkt 1: die Tagesordnung.',
      'In {city} wird abgestimmt, ob man abstimmen soll. Ergebnis: Vertagung.',
      'Das Plenum von {city} beschließt einstimmig, nichts einstimmig zu beschließen.',
      'Im {n} Anlauf einigt sich das Plenum von {city} auf eine gemeinsame Teekanne.'
    ],
    royalDecree: [
      '{leader} erlässt ein Dekret: Ab sofort wird sonntags gelächelt.',
      'Königlicher Erlass {kingdom_in}: Hüte sind künftig höher zu tragen.',
      '{leader} verfügt, dass alle Brote rund sein müssen. Die Bäcker sind empört.',
      '{leader} lädt zum Bankett. Die Steuern laden sich selbst ein.'
    ],
    council: [
      'Der Rat der Handelsrepublik tagt. Ergebnis: Alles hat einen Preis, auch die Sitzung.',
      '{Kingdom_in} wird über den Preis von Luft verhandelt. Man ist kurz vor einem Abschluss.',
      '{leader} lässt die Goldmünzen nachzählen. Es sind genauso viele wie gestern. Erleichterung.'
    ],
    tribeCouncil: [
      'Am Lagerfeuer von {city} wird lange geschwiegen. Dann sagt {leader}: „Mehr Holz.“ Alle nicken.',
      'Der Stammesrat von {city} beschließt, morgen etwas zu beschließen.',
      '{leader} erzählt am Feuer die Geschichte vom großen Schaf. Schon wieder.'
    ],
    propaganda: [
      'Der Propagandaturm von {city} verkündet, alle seien sehr glücklich. Die Leute nicken vorsichtig.',
      'Aus dem Turm von {city} schallt: „Alles läuft nach Plan!“ Welcher Plan, verrät er nicht.',
      'In {city} hängen neue Plakate von {leader}. Sie sind größer als die Häuser.'
    ],
    paranoia: [
      '{leader} lässt die Hecken in {city} verhören. Sie schweigen verdächtig.',
      '{Kingdom_in} werden Schafe auf staatsfeindliche Gesinnung überprüft.',
      '{leader} vermutet Verschwörer im Brotteig. Der Bäcker wird verwarnt.',
      '{leader} verbietet das Flüstern. Die Leute schreien sich jetzt Geheimnisse zu.',
      '{Kingdom_in} müssen alle im Gleichschritt einkaufen. Der Markt ist sehr ordentlich und sehr leer.'
    ],

    // ---------------------------------------------------------------- Diplomatie und Krieg
    war: [
      '{kingdom_nom} erklärt {other_dat} den Krieg. Anlass: {reason}.',
      'Krieg! {city} schickt eine Kriegserklärung nach {otherCity}. Grund: {reason}.',
      '{Kingdom_nom} greift zu den Waffen gegen {other_acc}. Niemand erinnert sich mehr genau, warum. Angeblich: {reason}.',
      '{kingdom_nom} und {other_nom} liegen im Krieg. Auslöser war {reason}.'
    ],
    holyWar: [
      'Heiliger Krieg! {deity} verlangt, dass {other_nom} endlich bekehrt wird.',
      '{Kingdom_nom} zieht im Namen von {deity} gegen {other_acc}. Die Ungläubigen beten zu etwas anderem.',
      '{deity} ist beleidigt. {Kingdom_nom} erklärt {other_dat} den heiligen Krieg.'
    ],
    godWar: [
      'Eine Stimme von oben befiehlt Krieg: {kingdom_nom} gegen {other_nom}. Beide Seiten sind überrascht, aber gehorsam.',
      'Göttliche Fügung: {Kingdom_nom} und {other_nom} sind ab sofort verfeindet. Die Schmiede jubeln.'
    ],
    peace: [
      'Frieden zwischen {kingdom_dat} und {other_dat}. Man tauscht Kuchen statt Pfeile.',
      '{kingdom_nom} und {other_nom} schließen Frieden. Der geliehene Hammer wird feierlich zurückgegeben.',
      'Der Krieg ist aus! {kingdom_nom} und {other_nom} sind beide sehr müde und ein bisschen verlegen.',
      'Waffenstillstand zwischen {kingdom_dat} und {other_dat}. Die Soldaten gehen heim und erzählen Heldengeschichten.'
    ],
    godPeace: [
      'Von oben wird Ruhe verordnet: {kingdom_nom} und {other_nom} schließen Frieden. Die Generäle schmollen.',
      'Ein himmlischer Fingerzeig beendet den Streit zwischen {kingdom_dat} und {other_dat}.'
    ],
    buyPeace: [
      '{Kingdom_nom} kauft sich für {gold} Goldstücke aus dem Krieg mit {other_dat} frei. Quittung inklusive.',
      'Für {gold} Gold ist der Krieg mit {other_dat} vorbei. Der Rat von {kingdom_dat} nennt das eine gute Investition.'
    ],
    alliance: [
      '{kingdom_nom} und {other_nom} schließen ein Bündnis. Man schwört ewige Freundschaft, mindestens bis zum nächsten Streit.',
      'Bündnis! {kingdom_nom} und {other_nom} tauschen Fahnen und Kochrezepte.',
      '{kingdom_nom} und {other_nom} sind jetzt Verbündete. Die Grenzwachen winken sich zu.'
    ],
    godAlliance: [
      'Auf höheren Wunsch verbünden sich {kingdom_nom} und {other_nom}. Sie schauen sich lange und misstrauisch an.',
      'Göttlich verordnete Freundschaft: {kingdom_nom} und {other_nom} sind verbündet.'
    ],
    allianceEnd: [
      'Das Bündnis zwischen {kingdom_dat} und {other_dat} zerbricht. Die Kochrezepte werden zurückverlangt.',
      '{kingdom_nom} und {other_nom} sind keine Verbündeten mehr. Grund: ein Streit um das letzte Stück Kuchen.'
    ],
    allyJoins: [
      '{kingdom_nom} steht dem Verbündeten bei und erklärt {other_dat} den Krieg.',
      'Bündnispflicht! {kingdom_nom} zieht gegen {other_acc}, um {victim} zu helfen.'
    ],
    royalWedding: [
      'Hochzeit! {leader} und das Herrscherhaus von {other_dat} heiraten sich ins Bündnis. Die Torte hat neun Stockwerke.',
      'Königliche Hochzeit zwischen {kingdom_dat} und {other_dat}. Ab jetzt ist man verschwägert und verbündet.'
    ],
    mobilize: [
      'Generalmobilmachung {kingdom_in}! Jeder, der laufen kann, bekommt einen Helm. {leader} hält eine sehr lange Rede.',
      '{leader} ruft alle zu den Waffen. Die Felder bleiben leer, die Kasernen sind voll.'
    ],
    raid: [
      'Raubzug! Krieger von {kingdom_dat} plündern {city} und schleppen {n} Säcke Beute davon.',
      '{city} wird überfallen. Die Räuber nehmen Würste, Holz und den guten Kochtopf mit.',
      'Ein Trupp von {kingdom_dat} stürmt in {city}, rafft zusammen, was er tragen kann, und zieht johlend ab.'
    ],
    liberation: [
      '{city} ist befreit! {kingdom_nom} gibt die Stadt an {other_acc} zurück. Freudentänze auf dem Marktplatz.',
      'Befreiung: Truppen von {kingdom_dat} vertreiben die Besatzer aus {city}. Die Stadt gehört wieder {other_dat}.'
    ],
    uprisingLiberation: [
      'Das Volk von {city} wirft die Besatzer hinaus und kehrt zu {kingdom_dat} zurück.',
      'Aufstand in {city} erfolgreich: Die Besatzung ist vorbei, {city} gehört wieder zu {kingdom_dat}.'
    ],
    occupation: [
      '{kingdom_nom} besetzt {city}. Ausgangssperre, Passierscheine, schlechte Laune.',
      '{city} steht unter Besatzung. {leader} lässt überall Schlagbäume aufstellen.'
    ],
    conversion: [
      'Die Bewohner von {city} werden zu {deity} bekehrt. Die meisten nicken freundlich und singen mit.',
      '{city} erhält neue Gebete und einen neuen Feiertag zu Ehren von {deity}.'
    ],
    agitation: [
      'Agitatoren aus {kingdom_dat} verteilen in {city} Flugblätter. Thema: Wem gehört eigentlich das Brot?',
      'In {city} tauchen Plakate auf: „Arbeiter aller Dörfer, vereinigt euch!“ {other_nom} ist nervös.'
    ],
    clearcut: [
      '{kingdom_nom} meldet: Der Wald rund um {city} wurde erfolgreich besiegt.',
      'Rund um {city} stehen nur noch Baumstümpfe. {leader} nennt das „Aussicht“.',
      'In {city} wird der letzte Baum feierlich zu Brettern verarbeitet. Die Eichhörnchen ziehen aus.'
    ],
    natureComplaint: [
      '{kingdom_nom} beschwert sich über den Kahlschlag in {other_dat}. Die Bäume weinen, sagt man dort.',
      'Gesandte aus {kingdom_dat} bringen {other_dat} einen Setzling als Mahnung. Er wird sofort zu Brennholz.',
      '{kingdom_nom} ist empört: In {other_dat} gibt es kaum noch Wald. Man legt Trauerflor an die Grenzbäume.'
    ],
    siegeEngines: [
      '{city} zimmert Belagerungsgerät: Rammböcke und Katapulte rollen Richtung {otherCity}.',
      'In {city} wird gesägt und gehämmert: Das Heer von {kingdom_dat} nimmt Rammböcke mit nach {otherCity}.'
    ],
    siege: [
      '{city} wird belagert! Keiner traut sich mehr aufs Feld, die Vorräte schrumpfen.',
      'Feinde vor den Toren von {city}. Die Bauern bleiben drinnen und zählen Rüben.'
    ],
    flurLost: [
      'Grenzland von {city} fällt an {other_acc}. Die Grenzsteine werden über Nacht versetzt.',
      '{city} verliert eine Flur an {other_acc}. Die Kühe dort muhen jetzt mit fremdem Akzent.'
    ],
    migrants: [
      '{NWord} Zuwanderer ziehen nach {city}. Sie haben gehört, hier gibt es gute Suppe.',
      '{city} wächst: {nWord} Neue klopfen an und fragen nach einem freien Bett.',
      'Zuzug in {city}! {NWord} Leute mit Bündeln und Hoffnung kommen an.'
    ],
    secedeLoyalty: [
      '{city} hat genug von {other_dat} und erklärt sich unabhängig: {kingdom}. Grund: {why}.',
      'Abspaltung! {city} geht eigene Wege und wird {kingdom}. In {other_dat} ist man beleidigt.',
      '{city} kündigt die Treue zu {other_dat}. Ab jetzt heißt es {kingdom}, und das Wappen ist schon gemalt.'
    ],
    plotWar: [
      '{kingdom_nom} rüstet zum Krieg gegen {other_acc}. In {city} werden Speere gezählt.',
      'Gerüchte aus {city}: {kingdom_nom} schmiedet Pläne gegen {other_acc}.',
      '{Kingdom_in} wird mobil gemacht. Ziel der Übungen: {other_nom}, sagt jeder, nur nicht laut.'
    ],
    plotWarOff: [
      '{kingdom_nom} legt die Kriegspläne gegen {other_acc} wieder in die Schublade.',
      'Entwarnung: {kingdom_nom} rüstet doch nicht gegen {other_acc}. Die Schmiede sind enttäuscht.'
    ],
    plotAlliance: [
      'Gesandte aus {kingdom_dat} reisen zu {other_dat}. Man spricht über ein Bündnis und sehr viel Kuchen.',
      '{kingdom_nom} und {other_nom} verhandeln über ein Bündnis.'
    ],
    plotRevolt: [
      'In {city} brodelt es. Hinter vorgehaltener Hand wird ein Aufstand geplant.',
      'In den Gassen von {city} werden Mistgabeln geschärft. Noch ist es ruhig.'
    ],
    plotSecession: [
      '{city} murrt über {kingdom_acc}. Man spricht offen über Unabhängigkeit.',
      'In {city} hängen erste Fahnen eines eigenen Wappens. {kingdom_nom} schaut besorgt.'
    ],
    exodus: [
      '{NWord} Unzufriedene verlassen {city} und suchen sich eigenes Land. Sie nennen sich {kingdom}.',
      'Auswanderung! Aus {city} ziehen {nWord} Leute fort, um anderswo alles besser zu machen: {kingdom}.'
    ],
    exiles: [
      '{other_nom} verbannt {nWord} Querköpfe aus {city}. Sie ziehen los und gründen {kingdom_acc}.',
      'Verbannt! {NWord} Leute aus {city} müssen gehen. Trotzig nennen sie sich {kingdom}.'
    ],
    refugees: [
      '{NWord} Flüchtlinge aus {city} fliehen vor dem Krieg. Irgendwo wollen sie neu anfangen: {kingdom}.',
      'Aus dem eroberten {city} fliehen {nWord} Leute ins Ungewisse und nennen sich {kingdom}.'
    ],
    newRealm: [
      '{NWord} Auswanderer gründen {city}. Ein neues Reich ist geboren: {kingdom}.',
      'Auf freiem Land entsteht {city}. {kingdom_nom} hat zwar noch keine Geschichte, aber schon einen Streit.'
    ],
    armyMarch: [
      'Ein Heer von {n} Soldaten zieht von {city} nach {otherCity}. Es wird gesungen, schief.',
      '{NWord} Soldaten von {kingdom_dat} marschieren auf {otherCity}. Die Schafe am Wegrand sind beunruhigt.',
      'Aus {city} rückt ein Heer aus. Ziel: {otherCity}. Proviant: drei Brote pro Kopf.'
    ],
    conquest: [
      '{city} fällt an {kingdom_acc}! Die Fahnen werden umgenäht.',
      '{Kingdom_nom} erobert {city}. Die Bewohner gewöhnen sich an neue Hüte.',
      '{city} gehört jetzt zu {kingdom_dat}. {Other_nom} ist darüber sehr verstimmt.'
    ],
    fallen: [
      '{Kingdom_nom} ist untergegangen. {Other_nom} übernimmt den Rest und die Schulden.',
      'Mit seiner letzten Stadt verliert {kingdom_nom} alles. Die Geschichtsbücher bekommen ein neues Kapitel.'
    ],
    kingdomGone: [
      '{Kingdom_nom} ist Geschichte. Niemand ist mehr da, der sich erinnert.',
      'Von {kingdom_dat} bleibt nur ein Name auf alten Landkarten.'
    ],
    mercs: [
      '{city} heuert {nWord} Söldner an. Sie sind teuer, laut und erstaunlich pünktlich.',
      '{Kingdom_nom} kauft sich Hilfe: {nWord} Söldner mit sehr glänzenden Helmen.'
    ],
    revolt: [
      'Aufstand in {city}! {NWord} wütende Bürger marschieren mit Mistgabeln zum Zentrum.',
      'In {city} brodelt es: {nWord} Aufständische fordern Brot, Ruhe und weniger Ansprachen.',
      '{city} rebelliert gegen {leader}. Die Rebellen haben Plakate, die Plakate haben Rechtschreibfehler.'
    ],
    resistance: [
      'In {city} formiert sich der Widerstand. {NWord} Mutige haben genug von Gleichschritt und Ansprachen.',
      'Untergrund in {city}: {nWord} Bürger flüstern verbotene Witze über {leader}. Dann greifen sie zu den Mistgabeln.',
      'Der Widerstand von {city} erhebt sich. Die Propaganda verstummt kurz vor Schreck.'
    ],
    revoltCrushed: [
      'Der Aufstand in {city} ist niedergeschlagen. Die Stimmung bleibt im Keller.',
      'In {city} kehrt Ruhe ein. Eine sehr angespannte Ruhe.'
    ],
    revoltCalm: [
      'In {city} beruhigt sich die Lage. Man hat geredet und dabei Kuchen gegessen.',
      'Die Aufständischen von {city} gehen nach Hause. Es gab endlich genug zu essen.'
    ],
    revoltFizzle: [
      'Die Rebellen von {city} stürmen das Zentrum, finden aber keinen Stift, um eine neue Verfassung zu schreiben. Alles bleibt beim Alten.',
      'Der Aufstand in {city} hat gesiegt, aber die Regierung bleibt, wie sie ist. {leader} verspricht Besserung.'
    ],
    secede: [
      '{city} sagt sich von {other_dat} los und gründet {kingdom_nom}. Die Grenzpfähle werden noch in der Nacht versetzt.',
      'Abspaltung! {city} ist jetzt {kingdom_nom} ({gov}). Die alte Hauptstadt schreibt einen wütenden Brief.'
    ],

    // ---------------------------------------------------------------- Kräfte und Katastrophen
    randomLightning: [
      'Ein Blitz schlägt bei {city} ein. Ein Baum ist sehr überrascht.',
      'Gewitter über {city}! Die Haare stehen allen zu Berge.'
    ],
    randomPlague: [
      'In {city} geht ein Schnupfen um, der sich gewaschen hat.',
      'Eine Seuche erreicht {city}. Alle niesen im Takt.'
    ],
    godLightning: [
      'Ein Blitz aus heiterem Himmel trifft {city}. Jemand hat wohl gelästert.',
      'Zack! Ein göttlicher Blitz schlägt bei {city} ein.'
    ],
    godFire: [
      'In {city} brennt es! Eimerketten werden gebildet, die Eimer sind leider undicht.',
      'Feuer bei {city}. Die Feuerwehr wird noch erfunden.'
    ],
    godRain: [
      'Ein sanfter Regen fällt auf {city}. Die Bauern tanzen, die Katzen nicht.',
      'Regen über {city}. Die Pilze freuen sich schon.'
    ],
    godMeteor: [
      'Ein Meteor schlägt bei {city} ein! Es bleibt ein Krater und sehr viele Fragen.',
      'Vom Himmel fällt ein glühender Brocken auf {city}. Der Astronom hatte es geahnt, aber nicht gesagt.',
      'Rumms! Ein Meteor bei {city}. Die Mauer hat jetzt ein Fenster.'
    ],
    godPlague: [
      'Eine Seuche befällt {city}. Die Leute sehen grün aus, sogar die, die es nicht sind.',
      'In {city} grassiert das große Niesen.'
    ],
    godBless: [
      'Segen über {city}! Die Felder reifen, die Wunden heilen, die Laune steigt.',
      '{city} wird gesegnet. Plötzlich mögen sich sogar die Nachbarn.',
      'Ein goldenes Funkeln liegt über {city}. Alle fühlen sich, als hätten sie ausgeschlafen.'
    ]
  };

  // Kriegsanlässe für {reason}
  const REASONS = [
    'ein geliehener, nie zurückgegebener Hammer', 'ein Grenzstein, der nachts gewandert sein soll',
    'eine Beleidigung über den Käse', 'ein entlaufenes Schaf mit unklarer Staatsangehörigkeit',
    'ein zu laut geschnarchtes Wiegenlied', 'ein Missverständnis bei der Begrüßung',
    'die Frage, wem der Mond gehört', 'ein Kuchenrezept, das angeblich gestohlen wurde',
    'ein schiefer Zaun', 'eine Wette über das Wetter', 'ein verschwundener Wetterhahn',
    'ein Brief mit zu vielen Ausrufezeichen', 'die richtige Art, Rüben zu schälen',
    'ein Fußabdruck im frischen Beet', 'die Farbe der Nachbarfahne', 'ein Dudelsack an der Grenze'
  ];

  // Grammatisches Geschlecht des Reichsnamens aus dem Vorsatz („Königreich …“ = n)
  const GENDER = { tribe: 'm', monarchy: 'n', democracy: 'm', fascism: 'm', communism: 'f', theocracy: 'm', republic: 'f', anarchy: 'f' };
  const ART = { nom: { m: 'der', n: 'das', f: 'die' }, acc: { m: 'den', n: 'das', f: 'die' }, dat: { m: 'dem', n: 'dem', f: 'der' } };
  function genderOf(name) {
    const G = WW.GOVERNMENTS || {};
    let best = null, bl = 0;
    for (const k in GENDER) {
      const g = G[k];
      if (g && g.realm && name.indexOf(g.realm + ' ') === 0 && g.realm.length > bl) { best = GENDER[k]; bl = g.realm.length; }
    }
    return best;
  }
  function withArticle(name, cas) {
    name = String(name || '');
    const g = genderOf(name);
    if (!g) return name;
    if (cas === 'in') return (g === 'f' ? 'in der ' : 'im ') + name;
    return ART[cas][g] + ' ' + name;
  }
  // Regierungsnamen mit Artikel (Faschismus/Kommunismus/Stammesrat männlich, Rest weiblich)
  const GOV_M = { Stammesrat: 1, Faschismus: 1, Kommunismus: 1 };
  const GART = { a: { m: 'ein', f: 'eine' }, d: { m: 'der', f: 'die' }, acc: { m: 'den', f: 'die' }, dat: { m: 'dem', f: 'der' } };
  function govArticle(name, cas) { const g = GOV_M[name] ? 'm' : 'f'; return GART[cas][g] + ' ' + name; }
  function capFirst(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function format(type, vars, rng) {
    const list = T[type];
    let tpl;
    if (!list || !list.length) tpl = '{city}{kingdom}: ' + type;
    else tpl = list[rng ? rng.int(list.length) : 0];
    vars = vars || {};
    const n = vars.n;
    let out = tpl.replace(/\{(\w+)\}/g, function (m, key) {
      const mm = /^([kK]ingdom|[oO]ther)_(nom|acc|dat|in)$/.exec(key);
      if (mm) {
        const base = mm[1].toLowerCase();
        const r = withArticle(vars[base], mm[2]);
        return mm[1][0] === mm[1][0].toUpperCase() ? capFirst(r) : r;
      }
      const gm = /^([gG]ov|[oO]ldGov)_(a|d|acc|dat)$/.exec(key);
      if (gm) {
        const base = gm[1].charAt(0).toLowerCase() + gm[1].slice(1);
        const r = govArticle(String(vars[base] || ''), gm[2]);
        return gm[1][0] === gm[1][0].toUpperCase() ? capFirst(r) : r;
      }
      if (key === 'nWord') return WW.SimUtil ? WW.SimUtil.numWord(n | 0, false) : String(n);
      if (key === 'NWord') return WW.SimUtil ? WW.SimUtil.numWord(n | 0, true) : String(n);
      if (key === 'reason') return vars.reason || (rng ? REASONS[rng.int(REASONS.length)] : REASONS[0]);
      const v = vars[key];
      return v == null ? '' : String(v);
    }).replace(/\s+/g, ' ').trim();
    // Satzanfänge groß
    out = capFirst(out).replace(/([.!?]) ([a-zäöü])/g, function (m, p, c) { return p + ' ' + c.toUpperCase(); });
    return out;
  }

  WW.Texts = { EVENTS: T, REASONS: REASONS, format: format, withArticle: withArticle };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
