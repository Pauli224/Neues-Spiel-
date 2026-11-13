// Chroniktexte der Wildnis und der neuen Kräfte (Stufe 3). Lädt nach js/data/texts.js und hängt sich an
// WW.Texts.EVENTS an. Platzhalter: {city}, {foe} (Kreatur), {name} (Person), {n}, {place} (Ort), {terrain}.
(function (WW) { 'use strict';

  const E = {
    // ------------------------------------------------------------- Wildnis
    wolvesSheep: [
      'Wölfe reißen bei {city} ein {foe}. Der Hirte schwört, er habe nur kurz geblinzelt.',
      'Bei {city} fehlt ein {foe}. Die Wölfe sehen auffällig zufrieden aus.',
      'Ein Rudel Wölfe besucht die Weiden von {city}. Die Schafe halten eine Krisensitzung ab.'
    ],
    beastAttack: [
      'Ein {foe} überfällt {name} vor den Toren von {city}. Allein spazieren gehen ist jetzt offiziell verpönt.',
      '{name} aus {city} trifft draußen einen {foe}. Das Treffen verläuft einseitig.'
    ],
    alarmBeasts: [
      'Alarm in {city}: Ein {foe} schleicht ums Dorf! Alle tun so, als hätten sie es zuerst gesehen.',
      '{city} läutet die Glocke: {foe} in Sicht. Die Kinder finden es aufregend, die Eltern weniger.'
    ],
    alarmMonster: [
      'Alarm in {city}! Ein {foe} nähert sich. Alle rennen, nur der Bürgermeister rennt schneller.',
      'In {city} schreit jemand „Ein {foe}!" und diesmal ist es leider kein Scherz.',
      'Ein {foe} vor {city}! Die Soldaten rücken aus, mit sehr tapferen Gesichtern.'
    ],
    alarmBandits: [
      'Räuber vor {city}! Alle verstecken ihre Kochtöpfe.',
      'In {city} wird Alarm geschlagen: {foe} und Bande lungern vor dem Tor herum.',
      'Verdächtige Gestalten mit Augenklappe nähern sich {city}. Die Wache greift zum Spieß.'
    ],
    alarmMad: [
      '{foe} ist völlig durchgedreht und tobt bei {city}. Niemand weiß, was in sie oder ihn gefahren ist.',
      'Alarm in {city}: {foe} haut auf alles, was sich bewegt. Und auf einiges, was sich nicht bewegt.'
    ],
    banditRaid: [
      'Räuber plündern ein Feld bei {city}. Zurück bleiben nur ein Stiefel und viel Ärger.',
      'Eine Räuberbande erntet die Felder von {city} – leider ohne zu fragen.',
      'Bei {city} verschwindet über Nacht ein ganzes Feld Rüben. Die Spuren führen in den Wald.'
    ],
    banditTheft: [
      'Räuber stürmen das unbefestigte {city} und stehlen {n} Vorräte. Jetzt redet man ernsthaft über eine Mauer.',
      '{city} wird ausgeraubt! Die Bande nimmt {n} Vorräte mit und lässt einen Zettel da: „Danke!"'
    ],
    banditTrader: [
      'Räuber überfallen {name}, eine Händlerseele aus {city}. Die Ware ist weg, die Laune auch.',
      'Auf dem Weg nach {city} wird {name} um die Geldkatze erleichtert. Die Räuber nennen es „Wegezoll".'
    ],
    campCleared: [
      'Soldaten aus {city} räumen ein Räuberlager aus. Die Beute geht zurück in die Stadtkasse.',
      '{city} hebt ein Räuberlager aus. Die Räuber beteuern, sie hätten nur gezeltet.'
    ],
    lairCleared: [
      'Die Wache von {city} räumt den {place} in der Nähe aus. Ab heute schläft man ruhiger.',
      '{city} hat genug vom {place} vor der Haustür und schickt die Soldaten. Erfolgreich.'
    ],
    treasureFound: [
      '{name} aus {city} findet in einer alten Ruine eine Schatztruhe mit {n} Gold!',
      'Glück für {city}: {name} stolpert in einer Ruine über {n} Gold. Und über ein Skelett, das sich beschwert.',
      'Ein uralter Schatz! {name} bringt {n} Gold nach {city} und darf jetzt immer zuerst vom Kuchen.'
    ],
    veinFound: [
      '{city} entdeckt eine {place} in der Nähe. Die Steinmetze bekommen glänzende Augen.',
      'Bei {city} glitzert es im Hang: eine {place}! Ab jetzt wird jedes Jahr fleißig geklopft.'
    ],
    veinEmpty: [
      'Die {place} bei {city} ist erschöpft. Die Bergleute auch.',
      'Bei {city} ist die {place} leer. Man klopft trotzdem noch ein bisschen, aus Gewohnheit.'
    ],
    dragonRaid: [
      'Ein Drache fliegt auf {city} zu! Die Feuerwehr putzt schnell noch ihre Eimer.',
      'Über {city} kreist ein Drache. Er sieht hungrig aus. Oder gelangweilt. Beides ist schlecht.',
      'Ein Schatten über {city}: der Drache ist aufgewacht und hat schlechte Laune.'
    ],
    dragonSlain: [
      'Der Drache ist besiegt! {name} aus {city} wird als Held gefeiert. Der Hort ist jetzt eine Schatzruine.',
      'In {city} wird gefeiert: Der Drache ist tot. {name} erzählt die Geschichte schon zum zwölften Mal.'
    ],
    dragonHatch: [
      'Im Drachenhort bei {city} knackt ein Ei. Es ist wieder ein Drache. Natürlich.',
      'Bei {city} ist ein neuer Drache geschlüpft. Klein, niedlich, feuerspeiend.'
    ],
    zombieBite: [
      'In {city} wird jemand von einem Zombie gebissen und hat plötzlich großen Appetit auf Gehirn.',
      'Ein Zombie schlurft durch {city} und macht neue Freunde. Unfreiwillig.'
    ],
    zombieOutbreak: [
      'Zombieplage bei {city}! Schon {n} Untote schlurfen umher und stöhnen im Chor.',
      'Bei {city} sind es jetzt {n} Zombies. Die Heiler raten zu Abstand und Knoblauch. Hilft nicht, riecht aber gut.'
    ],
    ghostHaunt: [
      'In {city} spukt es! Ein Geist schwebt durch die Mauer und ruft „Huuu". Niemand schläft.',
      'Ein Geist erschreckt die Leute von {city}. Er selbst findet es wahnsinnig lustig.',
      '{city} meldet Spuk. Der Geist schwebt einfach durch die Stadtmauer – unhöflich.'
    ],
    demonFire: [
      'Ein Dämon zündelt bei {city}. Er hält es für Kunst.',
      'Bei {city} brennt es: Ein Dämon hat Langeweile und Streichhölzer.'
    ],
    giantChickenField: [
      'Ein Riesenhuhn trampelt über die Felder von {city}. Es gackert dabei sehr zufrieden.',
      'Bei {city} pickt ein Riesenhuhn das halbe Feld leer. Die Vogelscheuche hat gekündigt.',
      'Ein Huhn so groß wie eine Scheune verwüstet die Ernte von {city}. Die Eier wären aber riesig.'
    ],
    monsterAttack: [
      'Ein {foe} greift Leute aus {city} an! Man rät allen, nicht mehr alleine spazieren zu gehen.',
      'Bei {city} sorgt ein {foe} für Angst und Schrecken. Vor allem für Schrecken.'
    ],
    monsterSlain: [
      'Sieg für {city}: Ein {foe} ist besiegt! {name} erzählt die Geschichte schon größer, als sie war.',
      'Ein {foe} fällt vor {city}. {name} bekommt einen Orden aus Pappe.'
    ],
    treantAngry: [
      'Ein Baumhirte verjagt die Holzfäller von {city}. Er hat den Wald sehr gern.',
      'Bei {city} wehrt sich der Wald: Ein Baumhirte stapft wütend auf die Holzfäller zu.'
    ],
    falloutSick: [
      'In {city} werden Leute krank. Der Staub von der großen Explosion ist nicht gesund, sagt der Heiler.',
      '{city} hustet. Seit dem großen Rumms schmeckt sogar das Brot nach Asche.'
    ],
    godHand: [
      'Eine riesige Hand trägt {name} durch die Luft und setzt die arme Seele in {city} ab. Niemand glaubt die Geschichte.',
      '{name} landet aus heiterem Himmel in {city}. Die Frisur ist hin.'
    ],

    // ------------------------------------------------------------- Kräfte
    godRaise: ['Bei {city} hebt sich das Land. Die Bauern müssen jetzt bergauf ernten.', 'Der Boden unter {city} wölbt sich nach oben. Gute Aussicht, schlechte Knie.'],
    godLower: ['Das Land bei {city} sinkt. Die Frösche freuen sich schon.', 'Bei {city} gibt der Boden nach. Die Uferpromenade kommt näher.'],
    godSeeds: ['Über {city} regnet es Samen. Überall sprießt es grün.', 'Bei {city} wachsen über Nacht Bäume und Blumen. Der Gärtner fühlt sich überflüssig.'],
    godQuake: ['Die Erde bebt bei {city}! Die Mauer hat jetzt Risse und der Bürgermeister weiche Knie.', 'Ein Erdbeben schüttelt {city} durch. Alle Teller sind jetzt Puzzles.', 'Bei {city} reißt die Erde auf. Ein Riss, wo vorher keiner war, und jetzt ein ziemlich großer.'],
    godVolcano: ['Bei {city} wächst ein Vulkan aus dem Boden! Die Lava hat es eilig.', 'Ein Berg spuckt Feuer neben {city}. Der Sommer wird heiß.'],
    godVolcanoWild: ['In der Wildnis ({terrain}) bricht ein Vulkan aus. Die Tiere sind empört.', 'Ein neuer Vulkan raucht über dem Land ({terrain}). Noch hat ihm niemand einen Namen gegeben.'],
    godTornado: ['Ein Wirbelsturm fegt durch {city}! Dächer fliegen, Hüte auch.', 'Bei {city} tanzt ein Wirbelsturm. Er nimmt sich Leute als Tanzpartner.', '{city} wird ordentlich durchgepustet. Die Wäsche ist jetzt im Nachbardorf.'],
    godAcid: ['Säureregen über {city}. Die Regenschirme haben jetzt Löcher.', 'Bei {city} regnet es etwas, das nicht wie Wasser riecht. Die Blumen lassen die Köpfe hängen.'],
    godFlood: ['Das Wasser steigt bei {city}! Alle holen ihre Gummistiefel aus dem Keller. Der Keller ist schon nass.', 'Flut in {city}. Die Froschlinge finden es herrlich.'],
    godFrost: ['Eisiger Frost über {city}! Die Ernte erfriert, der See wird zur Eisbahn.', 'Bei {city} friert alles zu. Die Kinder rodeln, die Bauern weinen.'],
    godDrought: ['Dürre bei {city}. Die Wiese wird gelb, die Felder verdorren, die Laune auch.', 'In {city} hat es ewig nicht geregnet. Die Brunnen geben nur noch Staub.'],
    godBreeze: ['Eine frische Brise weht durch {city}. Plötzlich riecht alles nach Frühling.', 'Ein kühler Wind pustet {city} sauber. Sogar die Gespenster sind weg.'],
    godBomb: ['Rumms! Eine Bombe schlägt bei {city} ein. Der Bäcker hat jetzt ein Oberlicht.', 'Eine Bombe trifft {city}. Danach ist es dort sehr still und sehr staubig.'],
    godCluster: ['Viele kleine Rummse über {city}! Die Splitterbombe verteilt sich gerecht.', 'Bei {city} knallt es zwölfmal hintereinander. Niemand zählt mit, alle laufen.'],
    godNapalm: ['Ein Feuerteppich legt sich über {city}. Selbst der Sand brennt.', 'Bei {city} brennt es lichterloh. Die Feuerwehr bestellt Verstärkung.'],
    godRocket: ['Eine Rakete pfeift auf {city} zu! Alle schauen hoch, dann alle schnell weg.', 'Vom Horizont her zischt eine Rakete nach {city}. Sie trifft. Leider.'],
    godBomber: ['Ein Flugzeug überfliegt {city} und wirft eine ganze Reihe Bomben. Die Straße hat jetzt Löcher in Reih und Glied.', 'Über {city} brummt ein Bomber. Der Teppich, den er auslegt, ist kein gemütlicher.'],
    godGunship: ['Ein Kanonenflieger kreist über {city} und rattert los. Alle spielen Verstecken.', 'Über {city} dreht ein Flugzeug Runden und schießt. Die Tauben sind empört.'],
    godNuke: ['Eine Atombombe trifft {city}! Ein Blitz, eine Pilzwolke, dann lange Stille.', 'Über {city} steigt ein riesiger Pilz auf. Es ist kein Speisepilz.', '{city} wird von einer Atombombe getroffen. Die Chronik weigert sich, mehr dazu zu schreiben.'],
    godNukeWild: ['In der Wildnis ({terrain}) explodiert eine Atombombe. Die Tiere gründen eine Beschwerdestelle.', 'Eine Pilzwolke über dem Land ({terrain}). Zum Glück wohnte da niemand. Fast niemand.'],
    godTsar: ['Der Große Rumms trifft {city}! Wo vorher Landschaft war, ist jetzt Erinnerung.', 'Die allergrößte Bombe fällt auf {city}. Man hört den Knall noch drei Täler weiter.'],
    godTsarWild: ['Der Große Rumms verwüstet einen ganzen Landstrich ({terrain}). Die Karte muss neu gezeichnet werden.', 'Ein unvorstellbarer Knall über dem Land ({terrain}). Danach ist da ein Krater, so groß wie ein Königreich.'],
    godLaser: ['Ein Laser aus dem All brennt eine Spur durch {city}. Sehr präzise, sehr unhöflich.', 'Bei {city} zischt ein Strahl vom Himmel. Die Pflastersteine glühen noch.'],
    godBlackhole: ['Ein Schwarzes Loch öffnet sich bei {city} und saugt Dachziegel, Hühner und einen Bürgermeisterhut an.', 'Bei {city} verschwindet einiges in einem Schwarzen Loch. Die Steuerunterlagen zum Beispiel.'],
    godBlackholeWild: ['In der Wildnis ({terrain}) öffnet sich ein Schwarzes Loch. Es schmatzt.', 'Ein Schwarzes Loch saugt ein Stück Land ({terrain}) auf und rülpst.'],
    godMadness: ['{name} aus {city} dreht plötzlich völlig durch und haut alle um.', 'In {city} wird {name} vom Wahnsinn gepackt. Die Nachbarn verriegeln die Türen.'],
    godLove: ['Liebe liegt in der Luft über {city}. Neun Monate später: sehr viele Wiegen.', 'In {city} regnet es Herzchen. Die Hebamme bucht Überstunden.'],
    godGold: ['Goldregen über {city}! Alle laufen mit offenen Taschen herum.', 'Bei {city} fallen Münzen vom Himmel. Der Schatzmeister weint vor Glück.'],
    godHeal: ['Ein warmes Licht über {city}: Wunden heilen, Mauern flicken sich, alle fühlen sich wie neu.', 'Heilung für {city}. Sogar der alte Rücken des Schmieds knackt nicht mehr.'],
    godWreck: ['Eine riesige Abrissbirne schwingt durch {city}. Ein Gebäude weniger, eine Staubwolke mehr.', 'Bumm! In {city} ist ein Bauwerk einfach weg. Die Bauaufsicht ist ratlos.']
  };

  if (WW.Texts && WW.Texts.EVENTS) {
    for (const k in E) if (!WW.Texts.EVENTS[k]) WW.Texts.EVENTS[k] = E[k];
  }
  WW.TEXTS_WILD = E;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
