// =============================================================================
// Wuselwelt – Ereignis-Katalog (Daten für js/sim/events.js). Lädt nach texts.js.
//   WW.EVENT_DEFS[]: { key, group, scope 'city'|'kingdom'|'pair'|'world', title, weight, cooldown (Jahre), prio (≥ 2 = wichtig),
//     when(ctx) -> bool | Gewicht, texts [Varianten], textsBy? { schlüssel: [...] } + pickTexts(ctx), effects [...],
//     rel? (pair: erlaubte Beziehungen), followOnly? (nur als Folgeereignis) }
//   ctx: { k, c, o, L (Lage), gov, race, law(key), rel, vars }
//   Platzhalter: {city} {kingdom} {kingdom_nom|acc|dat|in} {other…} {leader} {title} {gov} {gov_a} {deity} {race} {person} {person2}
//     {num} {big} {pct} {pctNo} {years} {n} {nWord} {law} {otherCity} {capital}; Bausteine {@pool} aus WW.EVENT_POOLS.
//   Wirkungen: { mod, add|mul, years, on } { flag, value, years } { stock, add|pct } { happy } { loyal } { pop } { law, lawOn }
//     { opinion } { relation } { gov } { power } { damage, n, types } { leader } { follow, years, chance } { fn }; je mit if(ctx).
// Ton: familienfreundlich, albern, trocken; alles erfunden.
// =============================================================================
(function (WW) { 'use strict';

  WW.EVENT_POOLS = {
    anlass: ['einen verlorenen Wetterhahn', 'den Geburtstag einer Ziege', 'die längste Nacht des Jahres', 'einen besonders runden Kürbis',
      'das Jubiläum des Dorfbrunnens', 'eine Wette, die niemand verstanden hat', 'den ersten Schnee', 'eine neue Sorte Senf',
      'den Abschied eines beliebten Esels', 'einen Regenbogen mit acht Farben', 'den Tag des schiefen Zauns', 'die Rückkehr der Störche'],
    ding: ['ein goldener Löffel', 'die Glocke vom Marktplatz', 'ein Fass Rübensaft', 'der Hut des Bürgermeisters', 'ein sehr alter Käse',
      'die Stadtfahne', 'das Rezeptbuch der Großmutter', 'ein Schubkarren voller Knöpfe', 'die einzige Landkarte', 'ein Tanzbär aus Holz',
      'der Schlüssel zum Kornspeicher', 'ein Kristall, der summt'],
    schuldiger: ['eine Elster', 'der Nachtwächter', 'ein übereifriger Lehrling', 'die Nachbarn (angeblich)', 'ein Ziegenbock namens Herbert',
      'niemand, sagt jeder', 'ein Schwarm Spatzen', 'der Wind', 'ein Mann mit falschem Bart', 'die Katze des Schmieds', 'ein verirrter Dachs'],
    essen: ['Rübeneintopf', 'Knödel', 'Kohlsuppe', 'Pflaumenkuchen', 'Zwiebelbrot', 'Pilzpfanne', 'Bratäpfel', 'Grießbrei', 'Kartoffelpuffer', 'Bohnenauflauf'],
    tier: ['Gänse', 'Ziegen', 'Hasen', 'Maulwürfe', 'Wildschweine', 'Frösche', 'Elstern', 'Schnecken', 'Igel', 'Eichhörnchen'],
    ort: ['auf dem Marktplatz', 'am Brunnen', 'vor dem Rathaus', 'im Kornspeicher', 'hinter der Mühle', 'auf der Stadtmauer', 'im Badehaus', 'unter der alten Linde'],
    beruf: ['Bäcker', 'Schmied', 'Zimmermann', 'Schäfer', 'Seiler', 'Töpfer', 'Brauer', 'Gerber', 'Korbflechter', 'Laternenanzünder'],
    wetter: ['drei Wochen Nieselregen', 'ein Hagel aus Erbsengröße', 'ein ungewöhnlich warmer Winter', 'ein Sommer ohne Wolke', 'Nebel, so dick wie Grießbrei'],
    spitz: ['der Gründliche', 'die Fleißige', 'der Zerstreute', 'die Laute', 'der Sparsame', 'die Unerschrockene', 'der Verschnupfte', 'die Pünktliche'],
    fest: ['Rübenfest', 'Laternenlauf', 'Kürbisrollen', 'Großes Pfannkuchenwerfen', 'Nacht der tausend Kerzen', 'Ziegenparade', 'Schnarchwettbewerb', 'Heuballenrennen']
  };

  const E = WW.EVENT_DEFS = [];
  function ev(key, group, scope, title, o) { o.key = key; o.group = group; o.scope = scope; o.title = title; E.push(o); return o; }
  const AUTH = { fascism: 1, monarchy: 1, communism: 1 };
  const isAuth = c => !!AUTH[c.gov];
  const canGov = c => c.k && !c.k.govLocked && c.sim.state.laws.govChanges;
  const lawOnOff = c => (c.lawOn === false ? 'off' : 'on');

  // ===========================================================================
  // GESETZE – jede Regierung beschließt auf ihre Art (wichtig: prio 2)
  // ===========================================================================
  const lawWhen = g => c => c.gov === g && c.wanted ? 1.3 : 0;
  ev('law_democracy', 'laws', 'kingdom', 'Volksabstimmung', { weight: 1, prio: 2, cooldown: 2, when: lawWhen('democracy'),
    effects: [{ law: 'auto' }, { happy: 2 }], pickTexts: lawOnOff, texts: [''],
    textsBy: {
      on: ['Volksabstimmung {kingdom_in}: „{law}“ wird mit {pct} % angenommen. {pctNo} % hatten den Stimmzettel falsch herum gehalten.',
        'Nach einer hitzigen Debatte mit {@essen} beschließt das Parlament {kingdom_dat} das Gesetz „{law}“ ({pct} % Ja-Stimmen).',
        'Wahlurnen {kingdom_in} quellen über: „{law}“ ist mit {pct} % beschlossen. {person} hat zweimal abgestimmt, aus Begeisterung.',
        '{Kingdom_nom} stimmt ab: {pct} % für „{law}“. {LeaderName} hält eine Rede, die zwei Kerzen lang dauert.'],
      off: ['Volksabstimmung {kingdom_in}: „{law}“ wird mit {pct} % abgeschafft. Niemand will es gewesen sein.',
        'Das Parlament {kingdom_dat} kippt „{law}“ mit {pct} % der Stimmen. Die Opposition jubelt, dann merkt sie, dass sie die Regierung ist.',
        '{Kingdom_nom} hat genug von „{law}“: {pct} % stimmen für die Abschaffung.']
    } });
  ev('law_monarchy', 'laws', 'kingdom', 'Königlicher Erlass', { weight: 1, prio: 2, cooldown: 2, when: lawWhen('monarchy'),
    effects: [{ law: 'auto' }, { loyal: 3 }], pickTexts: lawOnOff, texts: [''],
    textsBy: {
      on: ['{Leader} erlässt „{law}“. Begründung: „Weil ich es kann.“',
        'Ein Herold verliest auf dem Marktplatz von {capital}: „{law}“ gilt ab sofort. Er muss es dreimal wiederholen, weil ein Esel schreit.',
        'Per königlichem Siegel tritt {kingdom_in} „{law}“ in Kraft. Das Siegel war noch warm vom Frühstücksei.',
        '{Leader} hat schlecht geschlafen und erlässt deshalb „{law}“. Der Hof nickt sehr schnell.'],
      off: ['{Leader} streicht „{law}“ mit einer goldenen Feder. Die Feder wird danach ausgestellt.',
        'Gnädig hebt {leader} „{law}“ auf. Das Volk jubelt, bevor es weiß, was das bedeutet.',
        'Ein königliches Dekret beendet „{law}“. Grund laut Hof: „Hat nicht zur Krone gepasst.“']
    } });
  ev('law_fascism', 'laws', 'kingdom', 'Verordnung', { weight: 1, prio: 2, cooldown: 2, when: lawWhen('fascism'),
    effects: [{ law: 'auto' }, { happy: -2 }], pickTexts: lawOnOff, texts: [''],
    textsBy: {
      on: ['{Leader} verordnet „{law}“. Die Lautsprecher wiederholen es so oft, bis die Spatzen mitsingen.',
        'Neue Verordnung {kingdom_in}: „{law}“. Wer fragt, warum, muss Formulare in dreifacher Ausfertigung ausfüllen.',
        '„{law}“ gilt ab sofort, meldet die Kommandantur von {capital}. Applaus ist Pflicht, Lächeln wird empfohlen.',
        '{Leader} hält eine dreistündige Rede und verkündet am Ende „{law}“. Die Hälfte des Publikums ist eingeschlafen, wird aber als Zustimmung gezählt.'],
      off: ['{Leader} schafft „{law}“ ab und behauptet, es habe dieses Gesetz nie gegeben. Die Archive werden umgeschrieben.',
        'Die Kommandantur streicht „{law}“. Grund: Es war zu beliebt.',
        '„{law}“ ist aufgehoben. Das alte Plakat wird überklebt, das neue ist gleich grau.']
    } });
  ev('law_communism', 'laws', 'kingdom', 'Planbeschluss', { weight: 1, prio: 2, cooldown: 2, when: lawWhen('communism'),
    effects: [{ law: 'auto' }, { mod: 'work', mul: 1.03, years: 2 }], pickTexts: lawOnOff, texts: [''],
    textsBy: {
      on: ['Das Zentralkomitee {kingdom_dat} beschließt „{law}“ einstimmig. Die Gegenstimme wurde als Husten gewertet.',
        'Laut Plan tritt „{law}“ in Kraft. Die Erfüllung ist für nächstes Jahr bereits zu 140 % gemeldet.',
        '{Leader} unterschreibt „{law}“ im Volkshaus von {capital}. Danach gibt es für alle die gleiche Suppe.',
        'Ein neues Planziel {kingdom_dat}: „{law}“. Das Formular dazu ist {num} Seiten lang und rot.'],
      off: ['Das Zentralkomitee streicht „{law}“ aus dem Plan. Es sei „historisch überholt“, also seit Dienstag.',
        '„{law}“ wird abgeschafft. Die Plakate werden umgedreht und als Notizzettel weiterverwendet.',
        'Planrevision {kingdom_in}: „{law}“ entfällt. Der Plan wird dafür um eine Seite länger.']
    } });
  ev('law_theocracy', 'laws', 'kingdom', 'Offenbarung', { weight: 1, prio: 2, cooldown: 2, when: lawWhen('theocracy'),
    effects: [{ law: 'auto' }, { mod: 'happiness', add: 2, years: 2 }], pickTexts: lawOnOff, texts: [''],
    textsBy: {
      on: ['{Deity} erscheint {leader} im Traum und verlangt „{law}“. Es wird sofort umgesetzt.',
        'Im Tempel von {capital} fällt eine Steintafel vom Regal. Darauf steht: „{law}“. Diskussion beendet.',
        '{Leader} liest „{law}“ aus den heiligen Teeblättern. {Kingdom_nom} gehorcht.',
        'Ein Wunder {kingdom_in}: Die Tauben formen am Himmel die Worte „{law}“. Seither gilt es.'],
      off: ['{Deity} hat es sich anders überlegt: „{law}“ ist aufgehoben, verkündet {leader}.',
        'Ein neuer Blick in die heiligen Schriften zeigt: „{law}“ war ein Druckfehler. Es wird gestrichen.',
        '{Leader} verkündet, {deity} sei „{law}“ leid. Alle tun so, als hätten sie es geahnt.']
    } });
  ev('law_republic', 'laws', 'kingdom', 'Ratsbeschluss', { weight: 1, prio: 2, cooldown: 2, when: lawWhen('republic'),
    effects: [{ law: 'auto' }, { stock: 'gold', add: -12 }], pickTexts: lawOnOff, texts: [''],
    textsBy: {
      on: ['Der Große Rat {kingdom_dat} beschließt „{law}“ – gegen eine Bearbeitungsgebühr, versteht sich.',
        'Nach zähen Verhandlungen kauft die Händlergilde „{law}“. Quittung liegt bei.',
        '{Leader} lässt „{law}“ beschließen. Jeder Ratsherr bekommt dafür eine Münze und ein Stück Kuchen.',
        'Im Kontor von {capital} wird „{law}“ beschlossen und sofort mit Gewinn weiterverkauft.'],
      off: ['Der Rat {kingdom_dat} hebt „{law}“ auf. Die Gebühr für die Aufhebung ist höher als die für den Beschluss.',
        '„{law}“ rechnet sich nicht mehr, befindet der Rat. Weg damit.',
        '{Leader} streicht „{law}“, nachdem die Buchhalter dreimal geseufzt haben.']
    } });
  ev('law_anarchy', 'laws', 'kingdom', 'Plenumsbeschluss', { weight: 1, prio: 2, cooldown: 3, when: lawWhen('anarchy'),
    effects: [{ law: 'auto' }, { mod: 'work', mul: 0.97, years: 1 }], pickTexts: lawOnOff, texts: [''],
    textsBy: {
      on: ['Nach {years} Jahren Diskussion einigt sich das Plenum {kingdom_dat} auf „{law}“. Niemand weiß mehr, wer es vorgeschlagen hat.',
        'Das Plenum beschließt „{law}“ im Konsens. {person} war dagegen, ist aber eingeschlafen.',
        'Im Stuhlkreis von {capital} wird „{law}“ beschlossen. Vorher wurde zwei Tage über die Form der Stühle gestritten.',
        '„{law}“ gilt jetzt {kingdom_in} – freiwillig, aber alle machen mit, weil es sonst so unangenehm still wird.'],
      off: ['Das Plenum schafft „{law}“ wieder ab. Begründung: „Fühlte sich zu sehr nach Gesetz an.“',
        'Nach einer Nacht mit Tee und Gitarre ist „{law}“ Geschichte.',
        '„{law}“ wird abgeschafft, weil das Protokoll davon verloren gegangen ist.']
    } });
  ev('law_tribe', 'laws', 'kingdom', 'Ältestenrat', { weight: 1, prio: 2, cooldown: 2, when: lawWhen('tribe'),
    effects: [{ law: 'auto' }, { happy: 2 }], pickTexts: lawOnOff, texts: [''],
    textsBy: {
      on: ['Der Ältestenrat am Feuer von {capital} beschließt „{law}“. Der älteste Älteste nickt, oder schläft. Gilt beides.',
        '{Leader} schlägt mit dem Stock auf den Boden: „{law}“! Der Stamm brummt zustimmend.',
        'Nach einer Nacht voller Geschichten beschließt der Rat {kingdom_dat} „{law}“.',
        'Die Ältesten {kingdom_dat} werfen Knochen. Die Knochen sagen: „{law}“.'],
      off: ['Der Ältestenrat beendet „{law}“. Die Jungen hatten zu laut gemurrt.',
        '„{law}“ wird am Lagerfeuer feierlich verbrannt, zumindest das Rindenstück, auf dem es stand.',
        '{Leader} vergisst „{law}“, und weil niemand daran erinnert, gilt es nicht mehr.']
    } });

  // Folgen geltender Gesetze
  ev('lx_naturschutz_baum', 'laws', 'city', 'Baumpatenschaften', { weight: 1.2, cooldown: 6, when: c => c.law('naturschutz'),
    effects: [{ mod: 'happiness', add: 4, years: 3 }, { stock: 'wood', add: -10 }],
    texts: ['In {city} adoptiert jede Familie einen Baum. {person} hat seinem schon einen Namen gegeben: {Person2}.',
      'Naturschutz in {city}: Die Holzfäller umarmen jetzt Bäume statt sie zu fällen. Die Bäume wirken überrascht.',
      'Eine alte Eiche in {city} wird zum Ehrenbürger ernannt. Sie hält eine sehr schweigsame Rede.',
      'In {city} werden Bäume gezählt statt gefällt. Ergebnis: {big}. Plus ein sehr kleiner.'] });
  ev('lx_kahlschlag_erosion', 'laws', 'city', 'Bodenabtrag', { weight: 1.3, cooldown: 6, when: c => c.law('kahlschlagplan'),
    effects: [{ mod: 'food', mul: 0.85, years: 4 }, { stock: 'wood', add: [15, 30] }],
    texts: ['Rund um {city} steht kein Baum mehr. Der Wind bläst den Acker in die Nachbarschaft.',
      'Der Kahlschlagplan von {city} wird übererfüllt. Die Felder darunter leider auch: Der Boden rutscht weg.',
      '{city} hat Holz für zehn Winter, aber die Rüben wachsen nur noch im Liegen.',
      'Ohne Bäume trocknen die Felder bei {city} aus. {person} versucht es mit Gießkanne und Geduld.'] });
  ev('lx_wehrpflicht_flucht', 'laws', 'city', 'Drückeberger', { weight: 1, cooldown: 6, when: c => c.law('wehrpflicht'),
    effects: [{ pop: [-3, -1], cause: 'leave' }, { loyal: -6 }],
    texts: ['In {city} verstecken sich {nWord} junge Leute vor der Musterung im Heuschober und kommen nie wieder heraus.',
      'Wegen der Wehrpflicht wandern {nWord} Leute aus {city} aus. Sie hinterlassen einen Zettel: „Bin Kühe melken.“',
      '{nWord} Wehrpflichtige aus {city} melden sich krank. Mit derselben Krankheit. Dann verschwinden sie.'] });
  ev('lx_mauerpflicht_spende', 'laws', 'city', 'Steinspende', { weight: 1.2, cooldown: 5, when: c => c.law('mauerpflicht'),
    effects: [{ stock: 'stone', add: [15, 30] }, { mod: 'wallSpeed', mul: 1.2, years: 2 }],
    texts: ['Mauerpflicht in {city}: Jede Familie bringt einen Stein. {person} bringt einen sehr großen, aus Ehrgeiz.',
      'In {city} wird ein Steintag gefeiert. Am Abend ist ein Haufen da, und alle haben Rückenschmerzen.',
      'Die Leute von {city} sammeln Steine für die Mauer. Ein Kind bringt einen, der wie eine Kartoffel aussieht. Es ist eine Kartoffel.'] });
  ev('lx_sonntagsruhe_hammer', 'laws', 'city', 'Ruhestörung', { weight: 1, cooldown: 5, when: c => c.law('sonntagsruhe'),
    effects: [{ stock: 'gold', add: [4, 10] }, { mod: 'happiness', add: 2, years: 2 }],
    texts: ['In {city} hämmert der {@beruf} am Ruhetag. Er muss Strafe zahlen und den Nachbarn Kuchen backen.',
      'Ruhetag in {city}: Selbst die Hühner legen nur halbherzig. Die Stadtkasse kassiert Bußgeld von einem Pfeifer.',
      'Die Sonntagsruhe in {city} ist so ruhig, dass man das Gras wachsen hört. {person} beschwert sich über den Lärm.'] });
  ev('lx_hohe_steuern_protest', 'laws', 'city', 'Steuerprotest', { weight: 1.3, cooldown: 4, prio: 1.5, when: c => c.law('hohe_steuern') && (c.L.happy < 55 ? 2 : 0.6),
    effects: [{ happy: -6 }, { stock: 'gold', add: -8 }, { follow: 'steuerrevolte', chance: 0.4, years: [1, 2] }],
    texts: ['In {city} wird gegen die hohen Steuern protestiert. Die Leute werfen {@essen} auf das Steueramt.',
      'Der Steuereintreiber von {city} wird mit einem Lied verabschiedet, das sehr viele Strophen und kein freundliches Wort hat.',
      'In {city} nageln Bürger leere Geldbeutel an das Stadttor. Botschaft verstanden, Steuern bleiben.',
      'Steuerstreik in {city}: Alle zahlen in Erbsen. Einzeln.'] });
  ev('steuerrevolte', 'politics', 'city', 'Steuerrevolte', { weight: 0.3, prio: 2, cooldown: 8, when: c => c.law('hohe_steuern') && c.L.happy < 30,
    effects: [{ law: 'hohe_steuern', lawOn: false }, { happy: -8 }, { damage: 0.4 }],
    texts: ['Steuerrevolte in {city}! Das Steueramt wird mit Mistgabeln umstellt. Die hohen Steuern fallen.',
      'Die Leute von {city} haben genug: Sie stürmen die Schatzkammer und finden nur Quittungen. Die Steuern werden gesenkt.',
      'In {city} brennt ein Steuerbuch, und dann noch ein Schuppen. Die Regierung lenkt ein.'] });
  ev('lx_handel_markt', 'laws', 'city', 'Großmarkt', { weight: 1.2, cooldown: 4, when: c => c.law('handelsfreiheit'),
    effects: [{ stock: 'gold', add: [20, 45] }, { mod: 'gold', mul: 1.15, years: 2 }],
    texts: ['Dank Handelsfreiheit wird {city} von Händlern überrannt. Einer verkauft Luft in Gläsern, und zwar gut.',
      'Großmarkt in {city}: Es gibt alles, sogar Dinge, die es nicht gibt. Die Kasse klingelt.',
      'Ein fremder Händler bietet in {city} „echte Drachenschuppen“ an. Es sind Fischschuppen. Er wird trotzdem reich, und die Stadt auch.'] });
  ev('lx_jagdverbot_hasen', 'laws', 'city', 'Hasenplage', { weight: 1.2, cooldown: 5, when: c => c.law('jagdverbot'),
    effects: [{ stock: 'food', add: [-25, -12] }, { mod: 'happiness', add: 2, years: 2 }],
    texts: ['Seit dem Jagdverbot vermehren sich die {@tier} um {city} prächtig. Sie fressen das Gemüse und sehen dabei sehr zufrieden aus.',
      'In {city} gibt es mehr Hasen als Einwohner. Die Hasen fordern Wahlrecht.',
      'Das Jagdverbot zeigt Wirkung: Um {city} hoppeln {big} Hasen durch die Felder. Die Ernte schrumpft, die Kinder sind begeistert.'] });
  ev('lx_zuzugsstopp_schmuggel', 'laws', 'city', 'Heimliche Zuwanderung', { weight: 1, cooldown: 6, when: c => c.law('zuzugsstopp'),
    effects: [{ pop: [1, 3] }, { loyal: -3 }],
    texts: ['Trotz Zuzugsstopp schmuggeln sich {nWord} Leute in einem Heuwagen nach {city}. Der Wachposten tut so, als wäre er Heu.',
      '{NWord} Fremde verkleiden sich als Kühe und gelangen so nach {city}. Sie bleiben, die Kühe sind beleidigt.',
      'An der Grenze von {city} wird ein Schild „Voll“ aufgestellt. {NWord} Neue lesen es falsch herum und ziehen ein.'] });
  ev('lx_offene_tore_fest', 'laws', 'city', 'Willkommensfest', { weight: 1.2, cooldown: 5, when: c => c.law('offene_tore'),
    effects: [{ pop: [2, 4] }, { happy: 4 }],
    texts: ['{city} feiert ein Willkommensfest. {NWord} Reisende bleiben gleich da, wegen des Kuchens.',
      'Die offenen Tore von {city} locken {nWord} Neue an. Einer kann jonglieren, das wird sehr geschätzt.',
      'In {city} kommen {nWord} Wanderer an und fragen nur: „Ist hier noch frei?“ Ja, ist es.'] });
  ev('lx_ausgangssperre_mond', 'laws', 'city', 'Nächtliche Kontrollen', { weight: 1, cooldown: 4, when: c => c.law('ausgangssperre'),
    effects: [{ mod: 'happiness', add: -4, years: 2 }, { loyal: 5 }],
    texts: ['In {city} wird ein Mann verhaftet, weil er nachts den Mond angeschaut hat. Er sagt, der Mond habe angefangen.',
      'Die Ausgangssperre in {city} wird strenger. Selbst die Katzen brauchen jetzt einen Passierschein.',
      'Nachts ist es in {city} so still, dass die Wachen sich gegenseitig verhaften, um etwas zu tun zu haben.'] });
  ev('lx_schulpflicht_abschluss', 'laws', 'city', 'Erster Schuljahrgang', { weight: 1, cooldown: 6, when: c => c.law('schulpflicht'),
    effects: [{ mod: 'build', mul: 1.12, years: 4 }, { mod: 'work', mul: 1.04, years: 4 }],
    texts: ['Der erste Schuljahrgang von {city} ist fertig. Alle können jetzt bis {big} zählen und streiten darüber, was danach kommt.',
      'In {city} rechnen die Kinder den Baumeistern ihre Fehler vor. Die Häuser werden gerader.',
      'Die Schulpflicht zahlt sich aus: {person} aus {city} erfindet eine Schubkarre mit zwei Rädern. Revolution!'] });
  ev('lx_brotpreis_streik', 'laws', 'city', 'Bäckerstreik', { weight: 1.1, cooldown: 5, when: c => c.law('brotpreisbremse'),
    effects: [{ stock: 'food', add: [-20, -10] }, { mod: 'happiness', add: -3, years: 1 }],
    texts: ['Die Bäcker von {city} streiken gegen die Brotpreisbremse. Es gibt nur noch Brötchen in Erbsengröße.',
      'In {city} backen die Bäcker aus Protest Brote mit Loch. Das Loch ist größer als das Brot.',
      'Wegen der Brotpreisbremse verkauft {city} Brot unter Preis. Halb {kingdom} reist zum Einkaufen an, die Vorräte schmelzen.'] });

  // ===========================================================================
  // KETTE: Missernte -> Brotaufstand -> Zugeständnis oder Ausgangssperre
  // ===========================================================================
  ev('missernte', 'nature', 'city', 'Missernte', { weight: 1, prio: 2, cooldown: 10, when: c => (c.L.foodPer < 3 ? 2 : 0.5),
    effects: [{ stock: 'food', pct: -0.4 }, { mod: 'food', mul: 0.8, years: 2 }, { follow: 'brotaufstand', chance: 0.6, years: [1, 1] }],
    texts: ['Missernte in {city}: {@wetter} haben die Felder ruiniert. Die Rüben sind so klein wie Murmeln.',
      'Die Ernte von {city} fällt aus. {person} findet nur drei Kartoffeln und einen Stiefel.',
      'In {city} wächst dieses Jahr fast nichts. Schuld sind laut Gerücht {@schuldiger}.',
      'Die Felder um {city} geben kaum etwas her. Der Kornspeicher hallt beim Hineinrufen.'] });
  ev('brotaufstand', 'politics', 'city', 'Brotaufstand', { weight: 0.4, prio: 2, cooldown: 10, when: c => c.c && c.c.hungry,
    effects: [{ happy: -12 }, { damage: 0.35 }, { follow: 'brot_ausgangssperre', if: isAuth, years: [0.3, 0.6] }, { follow: 'brot_zugestaendnis', if: c => !isAuth(c), years: [0.3, 0.6] }],
    texts: ['Brotaufstand in {city}! Die Leute ziehen mit leeren Körben zum Regierungssitz und klopfen sehr laut.',
      'In {city} wird der Kornspeicher gestürmt. Darin finden sich nur Mäuse, die sehr satt aussehen.',
      'Hungrige Bürger blockieren die Straßen von {city} mit Schubkarren. Auf jedem steht: „Brot!“',
      'In {city} fliegen leere Teller. Die Regierung von {kingdom} muss reagieren.'] });
  ev('brot_zugestaendnis', 'politics', 'city', 'Zugeständnis', { weight: 0, followOnly: true, prio: 2, cooldown: 4,
    effects: [{ law: 'brotpreisbremse' }, { stock: 'food', add: [25, 45] }, { happy: 8 }],
    texts: ['{Kingdom_nom} lenkt ein: Getreide wird aus fernen Landen gekauft, die Brotpreisbremse beschlossen. {city} atmet auf.',
      '{Leader} verteilt in {city} eigenhändig Brot. Danach gilt die Brotpreisbremse.',
      'Nach dem Aufstand in {city} gibt es Brot für alle und ein Gesetz gegen teure Brötchen.'] });
  ev('brot_ausgangssperre', 'politics', 'city', 'Harte Hand', { weight: 0, followOnly: true, prio: 2, cooldown: 4,
    effects: [{ law: 'ausgangssperre' }, { loyal: 8 }, { mod: 'happiness', add: -6, years: 3 }],
    texts: ['{Leader} antwortet auf den Brotaufstand in {city} mit einer Ausgangssperre. Brot gibt es trotzdem keins.',
      'In {city} patrouillieren Wachen. Die Ausgangssperre gilt, der Hunger auch.',
      'Die Regierung {kingdom_dat} verhängt nach den Unruhen in {city} eine Ausgangssperre. Die Laune sinkt in den Keller, wo auch keine Vorräte mehr sind.'] });

  // ===========================================================================
  // POLITIK
  // ===========================================================================
  ev('skandal_kasse', 'politics', 'kingdom', 'Kassenskandal', { weight: 1, cooldown: 8, when: c => !c.L.leader ? 0 : (c.L.gold > 40 ? 1.5 : 0.6),
    effects: [{ stock: 'gold', pct: -0.3 }, { mod: 'happiness', add: -5, years: 3 }, { loyal: -5 }],
    texts: ['Skandal {kingdom_in}: In der Staatskasse fehlt Gold. {Leader} behauptet, es sei „in der Wäsche gewesen“.',
      'Ein Buchhalter {kingdom_dat} entdeckt, dass {@schuldiger} die Kasse geplündert hat. Das Gold bleibt verschwunden.',
      'Die Staatskasse von {capital} ist leichter als gedacht. Man findet nur einen Zettel: „Danke! – {person}“.',
      '{Kingdom_nom} erschüttert: Mit dem Steuergold wurde ein goldener Nachttopf für {leader} gekauft.'] });
  ev('reformer', 'politics', 'kingdom', 'Reformer', { weight: 0.8, cooldown: 10, when: c => c.L.happy < 50 && c.gov !== 'anarchy',
    effects: [{ mod: 'happiness', add: 6, years: 4 }, { mod: 'work', mul: 1.05, years: 4 }],
    texts: ['{Person} legt {leader} eine Liste mit {num} Reformvorschlägen vor. Drei davon werden umgesetzt, die Laune steigt.',
      'Ein junger Reformer {kingdom_dat} schlägt vor, die Brunnen zu reinigen. Revolutionär! Alle sind begeistert.',
      '{Kingdom_nom} wagt eine Reform: Ab sofort haben Arbeitstage Mittagspausen. Die Arbeit läuft trotzdem besser.'] });
  ev('rat_streit', 'politics', 'kingdom', 'Hofstreit', { weight: 1, cooldown: 6, when: c => c.L.cities >= 2,
    effects: [{ loyal: -8 }, { mod: 'build', mul: 0.9, years: 2 }],
    texts: ['Am Hof {kingdom_dat} streiten zwei Berater darüber, wer den Stuhl mit Kissen bekommt. Die Provinzen schauen kopfschüttelnd zu.',
      'Ein Streit über die richtige Reihenfolge beim Händeschütteln lähmt {kingdom_acc}. Die Städte fühlen sich vergessen.',
      'Die Statthalter {kingdom_dat} zanken um {@ding}. Die Bauarbeiten ruhen derweil.'] });
  ev('putsch_versuch', 'politics', 'kingdom', 'Putschversuch', { weight: 0.5, prio: 2, cooldown: 12,
    when: c => c.L.happy < 35 && c.gov !== 'anarchy' && c.gov !== 'democracy' && canGov(c) ? 2 : 0,
    effects: [{ gov: ['fascism', 'democracy', 'anarchy', 'monarchy'] }, { happy: -5 }], texts: [''],
    pickTexts: c => (c.vars.oldGov ? 'ok' : 'fail'), textsBy: {
      ok: ['Putsch {kingdom_in}! Eine Gruppe Unzufriedener stürmt den Palast. Ab heute herrscht {gov_d}, vorerst.',
        'Während des Mittagsschlafs wechselt die Regierung: Aus {oldGov} wird {gov}. {Kingdom_nom} reibt sich die Augen.',
        'In {capital} wird über Nacht die Fahne ausgetauscht. {Gov_d} übernimmt, die alte Fahne wird zum Putzlappen.'],
      fail: ['Ein Putschversuch in {capital} scheitert, weil die Verschwörer sich in der Uhrzeit geirrt haben. Die Stimmung ist trotzdem mies.',
        'Verschwörer wollen {leader} stürzen, verlaufen sich aber im Palast. Man findet sie hungrig in der Speisekammer.',
        'Ein Umsturz {kingdom_in} bleibt im Ansatz stecken: Der Anführer der Verschwörung hat verschlafen.']
    } });
  ev('volksfest_politik', 'politics', 'city', 'Bürgerfest', { weight: 1, cooldown: 5, when: c => c.L.happy > 55,
    effects: [{ mod: 'happiness', add: 5, years: 2 }, { stock: 'food', add: -10 }],
    texts: ['{city} feiert das {@fest}. Der Anlass: {@anlass}. Es wird so viel gegessen, dass die Vorräte schrumpfen.',
      'Großes {@fest} in {city}! {Person} gewinnt den ersten Preis und weint vor Freude in den {@essen}.',
      'Die Stadt {city} feiert {@anlass} mit einem {@fest}. Am Ende tanzt sogar der Nachtwächter.'] });

  // ===========================================================================
  // WIRTSCHAFT
  // ===========================================================================
  ev('goldader', 'economy', 'city', 'Goldader', { weight: 0.8, cooldown: 12,
    effects: [{ stock: 'gold', add: [40, 90] }, { mod: 'gold', mul: 1.2, years: 3 }],
    texts: ['Bei {city} stößt {person} beim Brunnenbau auf eine Goldader. Der Brunnen wird nie fertig.',
      'Goldfund bei {city}! Ein Hund hat ihn ausgebuddelt und verlangt nun einen Anteil.',
      'In einem Maulwurfshügel bei {city} glitzert es. Es ist Gold. Der Maulwurf zieht beleidigt um.'] });
  ev('holzwurm', 'economy', 'city', 'Holzwürmer', { weight: 1, cooldown: 8, when: c => (c.L.wood > 30 ? 1.2 : 0.4),
    effects: [{ stock: 'wood', pct: -0.35 }, { damage: 0.3, types: ['house', 'market', 'barracks'] }],
    texts: ['Holzwürmer in {city}! Das Brennholz und ein Dachbalken werden zu Sägemehl.',
      'In {city} knistert es nachts in allen Balken. {@schuldiger} wird verdächtigt, aber es waren Holzwürmer.',
      'Die Holzlager von {city} sind durchlöchert wie Käse. Ein Haus ist plötzlich luftiger als geplant.'] });
  ev('handelskarawane', 'economy', 'city', 'Karawane', { weight: 1, cooldown: 6, when: c => c.gov !== 'communism',
    effects: [{ stock: 'gold', add: [15, 35] }, { stock: 'food', add: [10, 25] }],
    texts: ['Eine Karawane aus fernen Ländern hält in {city}. Sie tauscht Gewürze gegen {@essen} und zieht zufrieden weiter.',
      'Händler mit {num} Kamelen erreichen {city}. Die Kamele bleiben unbeeindruckt, die Kasse nicht.',
      'In {city} rastet eine Karawane. Ein Händler kauft alle Socken der Stadt, niemand fragt warum.'] });
  ev('ernte_rekord', 'economy', 'city', 'Rekordernte', { weight: 1, cooldown: 6,
    effects: [{ stock: 'food', add: [30, 60] }, { mod: 'happiness', add: 3, years: 2 }],
    texts: ['Rekordernte in {city}! Ein Kürbis ist so groß, dass man darin wohnen könnte. {person} zieht ein.',
      'Die Felder von {city} tragen wie nie. Die Scheunen platzen, die Bauern grinsen.',
      'In {city} wächst das Getreide so hoch, dass sich darin eine Kuh verirrt. Sie wird nach drei Tagen gefunden, sehr satt.'] });
  ev('steinbruch', 'economy', 'city', 'Neuer Steinbruch', { weight: 1, cooldown: 8,
    effects: [{ stock: 'stone', add: [20, 40] }, { mod: 'stone', mul: 1.25, years: 4 }],
    texts: ['Bei {city} wird ein neuer Steinbruch eröffnet. Die Steine sind besonders eckig, sagen Kenner.',
      '{Person} aus {city} stolpert über einen Felsen und entdeckt so einen Steinbruch. Der Zeh erholt sich.',
      'In {city} beginnt das Steinzeitalter. Schon wieder, aber diesmal mit Plan.'] });

  // ===========================================================================
  // NATUR UND UMWELT
  // ===========================================================================
  ev('waldsterben_klage', 'nature', 'kingdom', 'Kahle Hügel', { weight: 1, prio: 1.5, cooldown: 8, when: c => c.L.bare > 0.6 ? 2 : 0,
    effects: [{ mod: 'happiness', add: -5, years: 3 }, { law: 'naturschutz', if: c => !c.law('naturschutz') && c.gov !== 'fascism' && !c.k.lawLocks.naturschutz }],
    texts: ['Um {capital} steht kein Baum mehr. Die Leute vermissen den Schatten, die Vögel vermissen alles. Bald gilt der Naturschutz.',
      'In {capital} wird ein Baum gefunden. Ein einziger. Er bekommt eine Wache und ein Gesetz.',
      'Kinder in {capital} malen Bäume aus der Erinnerung. Die Erwachsenen schämen sich und beschließen Naturschutz.'] });
  ev('wolkenbruch', 'nature', 'city', 'Wolkenbruch', { weight: 1, cooldown: 6,
    effects: [{ power: 'rain' }, { mod: 'food', mul: 1.15, years: 1 }],
    texts: ['Ein Wolkenbruch über {city}! Die Felder trinken sich satt, die Wäsche leider auch.',
      'Es regnet in {city} drei Tage lang. {Person} baut eine Arche, nur zur Sicherheit.',
      'Über {city} öffnet sich der Himmel. Die Frösche feiern, die Rüben wachsen.'] });
  ev('blitz_scheune', 'nature', 'city', 'Scheunenbrand', { weight: 0.8, cooldown: 10, when: c => c.sim.state.laws.disasters,
    effects: [{ power: 'fire', off: true }, { stock: 'food', pct: -0.15 }],
    texts: ['Ein Blitz trifft eine Scheune bei {city}. Es riecht tagelang nach geröstetem Getreide.',
      'In {city} fängt eine Scheune Feuer. Schuld sind {@schuldiger}, behauptet {person}.',
      'Feuer bei {city}! Eine Laterne, ein Heuhaufen, ein Missverständnis.'] });
  ev('bienenschwarm', 'nature', 'city', 'Bienenschwarm', { weight: 1, cooldown: 6,
    effects: [{ mod: 'food', mul: 1.12, years: 3 }, { happy: 3 }],
    texts: ['Ein riesiger Bienenschwarm lässt sich in {city} nieder. Die Obstbäume tragen doppelt, der Honig fließt.',
      'In {city} ziehen Bienen ins alte Rathausdach. Niemand traut sich mehr hinein, aber die Ernte ist großartig.',
      'Die Bienen von {city} summen ein Lied. {Person} behauptet, es sei die Stadthymne.'] });
  ev('heuschrecken', 'nature', 'city', 'Heuschrecken', { weight: 0.7, cooldown: 10, when: c => c.sim.state.laws.disasters,
    effects: [{ stock: 'food', pct: -0.3 }, { mod: 'food', mul: 0.85, years: 1 }],
    texts: ['Heuschrecken über {city}! Sie fressen alles, sogar den Hut von {person}.',
      'Eine grüne Wolke frisst sich durch die Felder von {city}. Die Heuschrecken bedanken sich nicht.',
      'In {city} hüpft es überall. Die Ernte ist weg, die Hühner sind dick.'] });

  // ===========================================================================
  // ALLTAG UND KURIOSES
  // ===========================================================================
  ev('verschwundenes_ding', 'daily', 'city', 'Verschwunden', { weight: 1.3, cooldown: 4,
    effects: [{ mod: 'happiness', add: -3, years: 1 }, { stock: 'gold', add: [-12, -5] }],
    texts: ['In {city} ist {@ding} verschwunden. Hauptverdächtig: {@schuldiger}. Ein Finderlohn wird ausgesetzt.',
      'Große Aufregung in {city}: {@ding} ist weg. Man durchsucht {@ort} und findet nur Krümel.',
      '{Person} aus {city} meldet: {@ding} ist gestohlen! Verdächtigt wird {@schuldiger}. Die Belohnung zahlt die Stadt.'] });
  ev('riesenkuerbis', 'daily', 'city', 'Riesenkürbis', { weight: 1, cooldown: 5,
    effects: [{ happy: 5 }, { stock: 'food', add: [8, 20] }],
    texts: ['{Person} aus {city} züchtet einen Kürbis, so groß wie ein Ochse. Das ganze Dorf isst eine Woche davon.',
      'In {city} wird der größte Kürbis aller Zeiten geerntet. Man rollt ihn {@ort} und feiert.',
      'Ein Riesenkürbis rollt durch {city} und hält erst am Brunnen. Er wird zu Suppe verarbeitet, sehr viel Suppe.'] });
  ev('wettstreit', 'daily', 'city', 'Wettstreit', { weight: 1.2, cooldown: 4,
    effects: [{ mod: 'happiness', add: 3, years: 2 }, { mod: 'work', mul: 1.05, years: 1 }],
    texts: ['In {city} findet ein Wettrennen mit Schubkarren statt. {Person} gewinnt, obwohl die Schubkarre ein Rad verliert.',
      'Der große Schnarchwettbewerb von {city} ist entschieden: {person} schnarcht {num} Minuten am Stück.',
      '{city} veranstaltet ein Wetthacken. Die Felder sind danach so gut umgegraben wie nie.'] });
  ev('falscher_prophet', 'daily', 'city', 'Wahrsager', { weight: 1, cooldown: 6,
    effects: [{ stock: 'gold', add: [-15, -6] }, { mod: 'work', mul: 0.95, years: 1 }],
    texts: ['Ein Wahrsager in {city} sagt für Dienstag das Ende der Welt voraus. Am Mittwoch ist er mit der Kasse weg.',
      'In {city} verkauft ein Fremder Glücksbringer aus Kieselsteinen. Alle kaufen, keiner hat Glück.',
      'Ein Wanderprediger überzeugt {city}, dass Arbeit am Donnerstag Unglück bringt. Es ist Donnerstag. Lange.'] });
  ev('hochzeit', 'daily', 'city', 'Große Hochzeit', { weight: 1.2, cooldown: 4,
    effects: [{ happy: 6 }, { stock: 'food', add: [-15, -6] }, { mod: 'growth', mul: 1.15, years: 2 }],
    texts: ['{Person} und {person2} heiraten in {city}. Die Feier dauert drei Tage, die Torte hat {num} Stockwerke.',
      'Hochzeit in {city}! Die Braut kommt auf einem Esel, der Bräutigam zu spät, die Gäste zu zahlreich.',
      'In {city} wird eine Hochzeit gefeiert, zu der das ganze Dorf kommt. Danach gibt es auffällig viele Verlobungen.'] });

  // ===========================================================================
  // GLAUBE
  // ===========================================================================
  ev('wunderquelle', 'faith', 'city', 'Wunderquelle', { weight: 0.8, cooldown: 10,
    effects: [{ power: 'bless' }, { mod: 'happiness', add: 4, years: 3 }],
    texts: ['Bei {city} sprudelt eine Quelle, deren Wasser nach Himbeeren schmeckt. Pilger strömen herbei.',
      '{Person} aus {city} badet in einem Tümpel und fühlt sich zehn Jahre jünger. Das ganze Dorf badet hinterher.',
      'In {city} wird eine heilige Quelle entdeckt. Sie heilt Schnupfen und schlechte Laune.'] });
  ev('pilger', 'faith', 'city', 'Pilgerzug', { weight: 1, cooldown: 6, when: c => (c.gov === 'theocracy' ? 2.5 : 0.5),
    effects: [{ stock: 'gold', add: [15, 30] }, { pop: [1, 2] }],
    texts: ['Ein Pilgerzug erreicht {city}, um {deity} zu ehren. Einige bleiben, die anderen lassen Spenden da.',
      '{Num} Pilger wandern singend nach {city}. Die Wirtshäuser sind ausgebucht.',
      'Pilger knien vor dem Schrein in {city}. Ein paar finden die Stadt so schön, dass sie bleiben.'] });
  ev('ketzer', 'faith', 'kingdom', 'Ketzerei', { weight: 1, cooldown: 8, when: c => c.gov === 'theocracy' ? 2 : 0,
    effects: [{ loyal: -7 }, { mod: 'happiness', add: -3, years: 2 }],
    texts: ['{Person} behauptet öffentlich, {deity} sei eigentlich nur ein großer Kloß. Die Priester sind empört, das Volk kichert.',
      'Eine Sekte {kingdom_in} verehrt statt {deity} eine sehr alte Socke. Die Provinzen sind verunsichert.',
      'Ketzerei in {capital}: Jemand hat an den Tempel geschrieben „{deity} schnarcht“. Die Ermittlungen laufen.'] });

  // ===========================================================================
  // KRIEG UND DIPLOMATIE
  // ===========================================================================
  ev('grenzstreit', 'war', 'pair', 'Grenzstreit', { weight: 1.2, cooldown: 6, rel: ['peace'],
    effects: [{ opinion: [-25, -12] }, { mod: 'aggression', add: 0.05, years: 3 }],
    texts: ['Grenzstreit zwischen {kingdom} und {other}: Ein Grenzstein ist über Nacht drei Schritte gewandert.',
      '{Kingdom_nom} beschuldigt {other_acc}, {@ding} gestohlen zu haben. {Other_nom} bestreitet alles und behält es.',
      'Ein Schaf aus {otherCity} frisst die Wiese von {capital}. Die Diplomaten {kingdom_dat} sind entsetzt.'] });
  ev('freundschaftsbesuch', 'war', 'pair', 'Staatsbesuch', { weight: 1.2, cooldown: 6, rel: ['peace', 'alliance'],
    effects: [{ opinion: [12, 25] }, { mod: 'happiness', add: 2, years: 2, on: 'both' }],
    texts: ['{Leader} besucht {otherCity}. Es gibt Kuchen, Händeschütteln und einen gemeinsamen Spaziergang.',
      'Freundschaftsbesuch: {otherLeader} reist nach {capital} und bringt {@essen} mit. {Kingdom_nom} ist gerührt.',
      '{Kingdom_nom} und {other} feiern gemeinsam {@anlass}. Die Beziehungen sind herzlich.'] });
  ev('beleidigung', 'war', 'pair', 'Diplomatischer Eklat', { weight: 1, prio: 1.5, cooldown: 8, rel: ['peace'],
    effects: [{ opinion: [-35, -20] }, { relation: 'war', if: c => c.rel && c.rel.opinion < -60 && c.sim.rng.next() < 0.5 }],
    texts: ['Eklat: Der Gesandte {kingdom_dat} nennt die Suppe {other_dat} „gewöhnungsbedürftig“. Die Stimmung ist eisig.',
      '{OtherLeader} schickt {leader} zum Geburtstag {@ding}. Das wird als tödliche Beleidigung aufgefasst.',
      'Beim Treffen mit {other} niest {leader} auf die Landkarte. Seither herrscht Grabesstille zwischen den Reichen.'] });
  ev('kriegsheld', 'war', 'kingdom', 'Kriegsheld', { weight: 1.3, prio: 1.5, cooldown: 6, when: c => c.L.atWar,
    effects: [{ mod: 'strength', mul: 1.15, years: 3 }, { mod: 'happiness', add: 3, years: 2 }],
    texts: ['{Person} {@spitz} hält allein eine Brücke gegen den Feind. {Kingdom_nom} schöpft neuen Mut.',
      'Ein Kriegsheld wird geboren: {person} erschreckt den Feind mit einem Topf auf dem Kopf und einem Kampfschrei.',
      'In {capital} wird {person} gefeiert, der angeblich {num} Feinde mit einem Kochlöffel vertrieben hat.'] });
  ev('kriegsmuede', 'war', 'kingdom', 'Kriegsmüdigkeit', { weight: 1.2, prio: 1.5, cooldown: 6, when: c => c.L.atWar && c.L.happy < 50,
    effects: [{ mod: 'happiness', add: -6, years: 2 }, { mod: 'aggression', add: -0.1, years: 4 }, { mod: 'work', mul: 0.95, years: 2 }],
    texts: ['Die Leute {kingdom_dat} sind kriegsmüde. Sie stricken Socken für die Front, aber nur noch einen Strumpf je Paar.',
      'In {capital} hängen Bettlaken aus den Fenstern. Darauf steht: „Wir wollen nach Hause.“',
      '{Kingdom_nom} hat genug vom Krieg. Selbst die Generäle wollen lieber angeln.'] });

  // ===========================================================================
  // PERSÖNLICHKEITEN
  // ===========================================================================
  ev('erfinder', 'people', 'city', 'Erfindung', { weight: 1.2, cooldown: 5,
    effects: [{ mod: 'work', mul: 1.08, years: 5 }],
    texts: ['{Person} aus {city} erfindet die Schubkarre mit Bremse. Die Arbeit geht schneller, und seltener ins Tal.',
      'In {city} erfindet {person} {@ding} mit Kurbel. Niemand weiß wozu, aber es spart Zeit.',
      '{Person} {@spitz} aus {city} erfindet eine Mühle, die auch bei Windstille dreht. Wie, bleibt ein Geheimnis.',
      '{Person} aus {city} baut eine Maschine, die Rüben schält. Sie schält auch Schuhe, aber man gewöhnt sich daran.'] });
  ev('anfuehrer_krank', 'people', 'kingdom', 'Kranke Führung', { weight: 0.8, cooldown: 10, when: c => c.L.leader,
    effects: [{ mod: 'build', mul: 0.9, years: 2 }, { loyal: -4 }],
    texts: ['{Leader} liegt mit einem Schnupfen im Bett und regiert per Taschentuch-Signal. Es gibt Missverständnisse.',
      '{Leader} hat sich beim Picknick den Magen verdorben. {Kingdom_nom} wird zwei Wochen von einem Hofhund regiert.',
      '{Leader} verstaucht sich beim Tanzen den Knöchel. Die Statthalter tun derweil, was sie wollen.'] });
  ev('neuer_berater', 'people', 'kingdom', 'Kluger Berater', { weight: 1, cooldown: 8, when: c => c.L.leader,
    effects: [{ mod: 'gold', mul: 1.15, years: 5 }, { mod: 'loyalty', add: 4, years: 5 }],
    texts: ['{Person} wird Berater von {leader}. Erste Tat: Die Kasse wird gezählt, und siehe da, es ist mehr da als gedacht.',
      '{Leader} holt {person} {@spitz} an den Hof. Seitdem läuft {kingdom} wie ein gut geöltes Butterfass.',
      'Ein neuer Kanzlist am Hof {kingdom_dat} sortiert die Akten alphabetisch. Plötzlich findet man alles.'] });
  ev('anfuehrer_abgesetzt', 'people', 'kingdom', 'Abgesetzt', { weight: 0.5, prio: 2, cooldown: 12,
    when: c => c.L.leader && c.L.happy < 30 && c.gov !== 'anarchy' ? 2 : 0,
    effects: [{ leader: true }, { mod: 'happiness', add: 5, years: 2 }],
    texts: ['{OldLeader} wird vom eigenen Hof abgesetzt. Neu an der Spitze {kingdom_dat}: {leader}.',
      'Die Unzufriedenheit {kingdom_in} ist zu groß: {oldLeader} muss gehen. {Leader} verspricht alles besser zu machen.',
      'Während einer Rede wird {oldLeader} ausgebuht und tritt zurück. {Leader} übernimmt und bringt Kekse mit.'] });

  // ===========================================================================
  // VOLKSEIGENES
  // ===========================================================================
  const race = r => c => c.race === r ? 2.2 : 0;
  ev('elf_baumgesang', 'race', 'city', 'Baumgesang', { weight: 1, cooldown: 6, when: race('elf'),
    effects: [{ mod: 'wood', mul: 1.2, years: 3 }, { mod: 'happiness', add: 4, years: 3 }],
    texts: ['Die Elfen von {city} singen drei Nächte lang für die Bäume. Die Bäume schenken ihnen herabgefallene Äste, ganz freiwillig.',
      'In {city} wird das Fest des Ersten Blattes gefeiert. {Person} trägt dabei eine Krone aus Moos und weint vor Rührung.',
      'Ein uralter Elf in {city} erzählt die Geschichte jeder einzelnen Eiche. Es dauert ein Jahr, aber alle sind entspannt.',
      'Die Elfen von {city} bitten die Wälder um Holz. Die Wälder sagen ja, sagt zumindest {person}.'] });
  ev('elf_hochmut', 'race', 'pair', 'Elfischer Hochmut', { weight: 1, cooldown: 8, when: c => c.race === 'elf' ? 2 : 0,
    effects: [{ opinion: [-20, -10] }, { mod: 'happiness', add: 2, years: 2 }],
    texts: ['Ein elfischer Gesandter {kingdom_dat} lobt die Hütten {other_dat} als „rustikal“. Es ist nicht als Lob angekommen.',
      'Die Elfen {kingdom_dat} schicken {other_dat} ein Buch über gutes Benehmen. Mit Unterstreichungen.',
      '{Kingdom_nom} rümpft die elfische Nase über die Esskultur {other_dat}. Man isst dort Suppe mit Gabeln, sagt man.'] });
  ev('elf_mondfest', 'race', 'kingdom', 'Mondfest', { weight: 1, cooldown: 7, when: race('elf'),
    effects: [{ mod: 'growth', mul: 1.25, years: 3 }, { stock: 'food', add: -12 }],
    texts: ['Die Elfen {kingdom_dat} feiern das Mondfest, das nur alle {num} Jahre stattfindet. Danach gibt es auffällig viele Elfenkinder.',
      'Unter dem Vollmond tanzen die Elfen von {capital} bis zum Morgengrauen. Die Speisekammer leert sich, die Herzen füllen sich.',
      'Mondfest {kingdom_in}: Die Elfen singen so schön, dass selbst die Eulen zuhören.'] });
  ev('zwerg_tiefe', 'race', 'city', 'Zu tief gegraben', { weight: 1, cooldown: 7, when: race('dwarf'),
    effects: [{ stock: 'stone', add: [30, 60] }, { damage: 0.4 }],
    texts: ['Die Zwerge von {city} graben zu tief. Sie finden viel Stein und einen Hohlraum unter einem Haus. Das Haus findet ihn auch.',
      'In {city} graben Zwerge einen neuen Stollen. Der Boden bebt, ein Dach wackelt, der Steinhaufen wächst.',
      '{Person} aus {city} hört den Berg flüstern: „Hier graben!“ Man gräbt. Es kracht. Aber Stein gibt es reichlich.'] });
  ev('zwerg_bart', 'race', 'city', 'Bartwettbewerb', { weight: 1, cooldown: 5, when: race('dwarf'),
    effects: [{ happy: 6 }, { mod: 'work', mul: 1.04, years: 2 }],
    texts: ['Der große Bartwettbewerb von {city} ist entschieden: {person} gewinnt mit einem Bart, der dreimal geflochten ist.',
      'In {city} misst man Bärte. Der längste reicht vom Kinn bis zur Werkbank. Alle arbeiten voller Stolz weiter.',
      'Ein Zwerg aus {city} rasiert sich aus Versehen. Die ganze Stadt trägt aus Solidarität falsche Bärte.'] });
  ev('zwerg_bier', 'race', 'kingdom', 'Braurecht', { weight: 1, cooldown: 6, when: race('dwarf'),
    effects: [{ stock: 'food', add: [-20, -8] }, { mod: 'happiness', add: 6, years: 3 }],
    texts: ['Die Zwerge {kingdom_dat} brauen ein Gerstenbier, so stark, dass die Kessel sich verbiegen. Die Laune ist prächtig.',
      'In {capital} wird das Reinheitsgebot für Malzbier ausgerufen: Malz, Wasser und Gebrummel.',
      'Braufest {kingdom_in}: {NWord} Fässer werden geleert. Die Vorräte schrumpfen, das Singen wird lauter.'] });
  ev('ork_kraftprobe', 'race', 'city', 'Kraftprobe', { weight: 1, cooldown: 5, when: race('orc'),
    effects: [{ mod: 'strength', mul: 1.12, years: 3 }, { pop: -1, cause: 'event' }],
    texts: ['Die Orks von {city} veranstalten eine Kraftprobe: Wer hebt den Ochsen? {Person} schafft es. Ein anderer übernimmt sich gründlich.',
      'In {city} wird Steineweitwurf gespielt. Ein Stein fliegt bis ins Nachbardorf. Ein Zuschauer kehrt nicht zurück.',
      'Ringkampf in {city}! {Person} gewinnt, die anderen trainieren seitdem noch härter.'] });
  ev('ork_bruellen', 'race', 'pair', 'Grenzbrüllen', { weight: 1, cooldown: 6, when: c => c.race === 'orc' ? 2 : 0, rel: ['peace', 'war'],
    effects: [{ opinion: [-18, -8] }, { mod: 'aggression', add: 0.08, years: 3 }],
    texts: ['Die Orks {kingdom_dat} brüllen an der Grenze so laut, dass in {otherCity} die Milch sauer wird.',
      '{Kingdom_nom} schickt {other_dat} eine Herausforderung: ein Wettbrüllen. {Other_nom} lehnt höflich ab, was als Feigheit gilt.',
      'Ein orkischer Trupp aus {capital} hüpft brüllend vor den Toren von {otherCity} herum. Diplomatie auf Orkisch.'] });
  ev('ork_festmahl', 'race', 'kingdom', 'Großes Fressen', { weight: 1, cooldown: 6, when: race('orc'),
    effects: [{ stock: 'food', pct: -0.25 }, { mod: 'happiness', add: 7, years: 2 }],
    texts: ['Die Orks {kingdom_dat} feiern das Große Fressen. Am Ende sind {num} Ochsen weg und alle sehr zufrieden.',
      'Festmahl in {capital}: Ein Ork isst einen ganzen {@essen}-Kessel. Er bekommt einen Orden aus Knochen.',
      'Beim orkischen Erntefest wird alles gegessen, was nicht wegläuft. Und einiges, was es versucht.'] });
  ev('wichtel_zaehlung', 'race', 'city', 'Wichtelzählung', { weight: 1, cooldown: 6, when: race('gnome'),
    effects: [{ pop: [2, 4] }, { stock: 'gold', add: [-8, -3] }],
    texts: ['In {city} werden die Wichtel gezählt. Man findet {nWord} mehr als gedacht, die sich im Schrank versteckt hatten.',
      'Die Volkszählung von {city} ergibt: Es gibt zu viele Wichtel, um sie zu zählen. Drei Zähler werden zusätzlich eingestellt, die gleich mitwohnen.',
      '{NWord} Wichtel tauchen in {city} aus einem Maulwurfshügel auf und behaupten, schon immer hier gewohnt zu haben.'] });
  ev('wichtel_streich', 'race', 'city', 'Wichtelstreich', { weight: 1.1, cooldown: 4, when: race('gnome'),
    effects: [{ mod: 'happiness', add: 4, years: 2 }, { mod: 'work', mul: 0.95, years: 1 }],
    texts: ['Die Wichtel von {city} binden allen Kühen Schleifen um die Hörner. Niemand arbeitet, alle lachen.',
      'In {city} sind über Nacht alle Türen bunt angemalt. Die Wichtel tun unschuldig, haben aber Farbe an den Mützen.',
      'Ein Wichtel aus {city} versteckt die Werkzeuge der {@beruf}e. Die Suche dauert eine Woche und ist sehr lustig.'] });
  ev('wichtel_tunnel', 'race', 'kingdom', 'Wichtelpost', { weight: 1, cooldown: 6, when: race('gnome'),
    effects: [{ mod: 'loyalty', add: 6, years: 4 }, { mod: 'immigration', mul: 1.3, years: 4 }],
    texts: ['Die Wichtel {kingdom_dat} graben Tunnel zwischen allen Städten. Briefe kommen jetzt in einer Stunde an, Nachbarn auch.',
      '{Kingdom_nom} eröffnet die Wichtelpost. Jede Nachricht wird von einem Wichtel persönlich vorgesungen.',
      'Ein Netz aus Wichtelgängen verbindet {kingdom_acc}. Man fühlt sich näher, besonders wenn ein Wichtel aus dem Boden ploppt.'] });
  ev('frosch_regen', 'race', 'city', 'Froschregen', { weight: 1, cooldown: 6, when: race('frog'),
    effects: [{ power: 'rain' }, { mod: 'food', mul: 1.15, years: 2 }, { happy: 3 }],
    texts: ['Die Froschlinge von {city} quaken drei Tage lang um Regen. Es regnet. Sie quaken weiter, aus Dankbarkeit.',
      'In {city} wird der große Regentanz aufgeführt. Die Wolken kommen, die Fliegen auch, beides gut.',
      '{Person} aus {city} quakt so schön, dass eine Wolke stehen bleibt und sich ausweint.'] });
  ev('frosch_laich', 'race', 'city', 'Laichzeit', { weight: 1, cooldown: 5, when: race('frog'),
    effects: [{ mod: 'growth', mul: 1.35, years: 2 }, { mod: 'work', mul: 0.92, years: 1 }],
    texts: ['Laichzeit in {city}! Alle Froschlinge sitzen im Teich und sind beschäftigt. Die Arbeit ruht, die Kinderstube füllt sich.',
      'In {city} ist der Teich voller Laich. Die Kinderzimmer werden knapp.',
      'Die Froschlinge von {city} feiern die Laichzeit mit Gesang. Niemand schläft, aber alle sind glücklich.'] });
  ev('frosch_fliegen', 'race', 'kingdom', 'Fliegenschwemme', { weight: 1, cooldown: 6, when: race('frog'),
    effects: [{ stock: 'food', add: [20, 40] }, { mod: 'happiness', add: 3, years: 2 }],
    texts: ['Ein warmer Sommer bringt Fliegen über {kingdom_acc}. Die Froschlinge essen sich rund und satt.',
      'Über {capital} schwirren Wolken von Mücken. Für die Froschlinge ist es ein Festbankett.',
      'Die Fliegenernte {kingdom_dat} ist ein Rekord. Man trocknet sie für den Winter, guten Appetit.'] });
  ev('mensch_buergerverein', 'race', 'city', 'Bürgerverein', { weight: 1, cooldown: 6, when: race('human'),
    effects: [{ mod: 'build', mul: 1.1, years: 3 }, { loyal: 4 }],
    texts: ['In {city} gründet sich der Verein der Freunde des geraden Zauns. Erste Amtshandlung: Zäune gerade machen.',
      'Der Bürgerverein von {city} beschließt, die Stadt zu verschönern. {Person} bringt Blumenkästen, alle packen mit an.',
      'In {city} gibt es jetzt {num} Vereine. Jeder hat eine Fahne, keiner hat Zeit, aber gebaut wird trotzdem fleißig.'] });
  ev('mensch_kompromiss', 'race', 'kingdom', 'Kompromiss', { weight: 1, cooldown: 6, when: race('human'),
    effects: [{ mod: 'happiness', add: 3, years: 3 }, { mod: 'gold', mul: 1.08, years: 3 }],
    texts: ['Nach langem Streit über {@ding} einigt man sich {kingdom_in} auf einen Kompromiss: Alle sind ein bisschen unzufrieden, also zufrieden.',
      'In {capital} wird ein Streit mit einem Handschlag beigelegt. Anschließend gibt es Würstchen.',
      '{Kingdom_nom} entdeckt das Mittelmaß: Nicht zu viel, nicht zu wenig. Die Leute fühlen sich wohl dabei.'] });
  ev('mensch_jahrmarkt', 'race', 'city', 'Jahrmarkt', { weight: 1, cooldown: 5, when: race('human'),
    effects: [{ stock: 'gold', add: [12, 28] }, { happy: 4 }],
    texts: ['Jahrmarkt in {city}! Es gibt Zuckerwatte, einen Flohzirkus und einen Mann, der behauptet, der stärkste der Welt zu sein.',
      'Auf dem Jahrmarkt von {city} wird {person} zur Rübenkönigin gekrönt. Die Händler machen gute Geschäfte.',
      'Der Jahrmarkt in {city} lockt Besucher aus dem ganzen Land. Das Karussell wird von einem sehr geduldigen Ochsen gezogen.'] });

  // ===========================================================================
  // REGIERUNGSEIGENES
  // ===========================================================================
  const gv = g => c => c.gov === g ? 2.2 : 0;
  ev('tribe_trommel', 'gov', 'kingdom', 'Trommelnacht', { weight: 1, cooldown: 5, when: gv('tribe'),
    effects: [{ mod: 'loyalty', add: 6, years: 3 }, { happy: 3 }],
    texts: ['Der Stamm {kingdom_dat} trommelt eine ganze Nacht. Die Nachbarn können nicht schlafen, der Stamm fühlt sich verbunden.',
      'Ums Feuer von {capital} erzählt {leader} von den Ahnen. Jeder bekommt eine Geschichte und ein Stück Brot.',
      'Trommelnacht {kingdom_in}: Man trommelt so laut, dass sich ein Gewitter beschwert.'] });
  ev('tribe_jagd', 'gov', 'city', 'Große Jagd', { weight: 1, cooldown: 5, when: c => c.gov === 'tribe' && !c.law('jagdverbot') ? 2 : 0,
    effects: [{ stock: 'food', add: [20, 40] }, { mod: 'strength', mul: 1.05, years: 2 }],
    texts: ['Die große Jagd von {city} bringt ein Wildschwein so groß wie eine Hütte. Es wird tagelang gefeiert.',
      'Die Jäger von {city} kehren zurück: mit Beute, Kratzern und einer sehr übertriebenen Geschichte.',
      '{Person} aus {city} erlegt einen Hirsch mit bloßen Händen. Zumindest erzählt {person} das so.'] });
  ev('tribe_totem', 'gov', 'city', 'Neuer Totempfahl', { weight: 1, cooldown: 6, when: gv('tribe'),
    effects: [{ stock: 'wood', add: -12 }, { mod: 'happiness', add: 5, years: 4 }],
    texts: ['In {city} wird ein Totempfahl geschnitzt. Ganz oben thront ein Dachs mit sehr strengem Blick.',
      'Der neue Totempfahl von {city} zeigt alle Ahnen des Stammes. Bei einem ist man sich nicht sicher, ob es eine Kartoffel ist.',
      'Die Schnitzer von {city} erschaffen einen Totem, so hoch wie drei Bäume. Er wackelt, aber er wacht.'] });
  ev('monarchy_ball', 'gov', 'kingdom', 'Hofball', { weight: 1, cooldown: 5, when: gv('monarchy'),
    effects: [{ stock: 'gold', add: [-35, -15] }, { mod: 'loyalty', add: 8, years: 3 }],
    texts: ['{Leader} gibt einen Hofball. Die Statthalter tanzen Polonaise und versprechen ewige Treue.',
      'Großer Ball am Hof {kingdom_dat}! Die Perücken sind höher als je zuvor, die Kasse ist leerer als je zuvor.',
      'Beim Hofball in {capital} tritt {leader} {person} auf den Fuß. Man spricht noch Jahre davon, mit Stolz.'] });
  ev('monarchy_hofnarr', 'gov', 'kingdom', 'Hofnarr', { weight: 1, cooldown: 6, when: gv('monarchy'),
    effects: [{ mod: 'happiness', add: 5, years: 3 }, { mod: 'taxes', add: -0.005, years: 3 }],
    texts: ['Ein neuer Hofnarr {kingdom_dat} macht Witze über die Steuern. {Leader} lacht so sehr, dass die Steuern gesenkt werden.',
      '{Person}, der Hofnarr von {capital}, jongliert mit der Krone. {Leader} ist amüsiert, das Volk auch.',
      'Der Hofnarr {kingdom_dat} imitiert {leader} so gut, dass er einen Tag regieren darf. Er senkt die Steuern.'] });
  ev('monarchy_prinz', 'gov', 'kingdom', 'Königliches Kind', { weight: 0.8, prio: 1.5, cooldown: 10, when: gv('monarchy'),
    effects: [{ happy: 8 }, { mod: 'loyalty', add: 5, years: 6 }, { stock: 'food', add: -10 }],
    texts: ['Am Hof {kingdom_dat} wird ein Thronfolger geboren. Er schreit lauter als alle Herolde zusammen.',
      'Glocken läuten in {capital}: {leader} ist Elternteil geworden. Das Kind bekommt {num} Vornamen.',
      'Ein Prinzesschen wird {kingdom_in} geboren. Das ganze Reich bekommt einen Tag frei und Kuchen.'] });
  ev('democracy_buergerhaushalt', 'gov', 'kingdom', 'Bürgerhaushalt', { weight: 1, cooldown: 6, when: gv('democracy'),
    effects: [{ mod: 'build', mul: 1.12, years: 3 }, { mod: 'happiness', add: 3, years: 3 }],
    texts: ['{Kingdom_nom} lässt die Bürger über den Haushalt abstimmen. Gewinner: mehr Bänke, mehr Brunnen, eine Rutsche.',
      'Bürgerhaushalt {kingdom_in}: {pct} % stimmen für neue Dächer, {pctNo} % für einen Brunnen mit Limonade.',
      'In {capital} entscheidet das Volk über die Bauprojekte. Es wird gebaut, als gäbe es kein Morgen.'] });
  ev('democracy_ausschuss', 'gov', 'kingdom', 'Ausschuss', { weight: 1, cooldown: 5, when: gv('democracy'),
    effects: [{ mod: 'build', mul: 0.9, years: 2 }, { mod: 'loyalty', add: 4, years: 3 }],
    texts: ['Ein Ausschuss {kingdom_dat} prüft, ob man einen Ausschuss für Ausschüsse braucht. Ergebnis in {years} Jahren.',
      'Das Parlament von {capital} gründet einen Unterausschuss für Zaunhöhen. Alles verzögert sich, aber gründlich.',
      '{Kingdom_nom} lässt {@ding} von {num} Gutachtern prüfen. Alle sind sich einig: Es ist {@ding}.'] });
  ev('democracy_skandal', 'gov', 'kingdom', 'Ministerrücktritt', { weight: 1, cooldown: 6, when: gv('democracy'),
    effects: [{ mod: 'happiness', add: -3, years: 1 }, { mod: 'loyalty', add: 3, years: 3 }],
    texts: ['Ein Minister {kingdom_dat} tritt zurück, weil er {@ding} privat benutzt hat. Die Presse jubelt, das Volk vertraut wieder.',
      'Rücktritt in {capital}: Die Ministerin für Brunnen hat in den Brunnen gespuckt. Ein Nachfolger schwört Besserung.',
      'Die Zeitung {kingdom_dat} enthüllt: Der Bauminister wohnt im Zelt. Er tritt zurück und baut sich ein Haus.'] });
  ev('fascism_parade', 'gov', 'kingdom', 'Pflichtparade', { weight: 1.1, cooldown: 4, when: gv('fascism'),
    effects: [{ mod: 'work', mul: 0.94, years: 1 }, { mod: 'strength', mul: 1.08, years: 2 }, { happy: -4 }],
    texts: ['{Leader} lässt eine Parade abhalten. Alle müssen jubeln, die Kinder bekommen dafür Holzfähnchen. Niemand arbeitet.',
      'Die Pflichtparade in {capital} dauert {num} Stunden. Ein Soldat marschiert im Kreis, weil keiner ihm „Halt“ sagt.',
      'Militärparade {kingdom_in}: Die Stiefel glänzen, die Gesichter nicht.'] });
  ev('fascism_spitzel', 'gov', 'city', 'Spitzelwesen', { weight: 1.1, cooldown: 4, when: gv('fascism'),
    effects: [{ mod: 'happiness', add: -6, years: 3 }, { loyal: 6 }],
    texts: ['In {city} beobachten sich alle gegenseitig. {Person} meldet den Nachbarn, weil er zu fröhlich gepfiffen hat.',
      'Die Spitzel von {city} schreiben so viele Berichte, dass das Papier knapp wird. Die Leute flüstern nur noch.',
      'In {city} wird ein Briefkasten für Anzeigen aufgestellt. Er quillt über, meist mit Beschwerden über den Briefkasten.'] });
  ev('fascism_widerstand', 'gov', 'city', 'Flugblätter', { weight: 1, prio: 1.5, cooldown: 5, when: c => c.gov === 'fascism' && c.L.happy < 40 ? 2.5 : 0,
    effects: [{ loyal: -10 }, { mod: 'happiness', add: 3, years: 2 }],
    texts: ['In {city} tauchen nachts Flugblätter auf: „Wir wollen Kuchen statt Kommandos!“ Die Leute lesen sie heimlich und lächeln.',
      'Unbekannte malen in {city} Blumen auf die grauen Mauern. Die Wache wischt, die Blumen kommen wieder.',
      'Der Widerstand in {city} wächst: Beim Pflichtjubel jubelt jemand absichtlich falsch. Alle machen mit.'] });
  ev('communism_soll', 'gov', 'city', 'Planübererfüllung', { weight: 1.1, cooldown: 4, when: gv('communism'),
    effects: [{ stock: 'food', add: [15, 30] }, { mod: 'work', mul: 0.95, years: 2 }],
    texts: ['{city} meldet 300 % Planerfüllung bei Rüben. Niemand weiß, wohin damit, und vor lauter Stolz arbeitet keiner mehr.',
      'Die Brigade „Morgenrot“ aus {city} übererfüllt das Soll. Sie wird ausgezeichnet und schläft danach eine Woche.',
      'In {city} werden {big} Rüben geerntet und {big} Formulare ausgefüllt. Beides wird gestapelt.'] });
  ev('communism_schlange', 'gov', 'city', 'Warteschlange', { weight: 1.1, cooldown: 4, when: gv('communism'),
    effects: [{ mod: 'work', mul: 0.93, years: 1 }, { mod: 'happiness', add: -3, years: 1 }],
    texts: ['In {city} bildet sich eine Schlange vor dem Laden. Niemand weiß, wofür, aber alle stellen sich an.',
      'Die Warteschlange in {city} ist so lang, dass sie bis ins Nachbardorf reicht. Ganz vorne gibt es Knöpfe.',
      '{Person} aus {city} steht seit drei Wochen an. Es gibt Socken, aber nur linke.'] });
  ev('communism_held', 'gov', 'kingdom', 'Held der Arbeit', { weight: 1, cooldown: 5, when: gv('communism'),
    effects: [{ mod: 'work', mul: 1.1, years: 3 }, { mod: 'build', mul: 1.05, years: 3 }],
    texts: ['{Person} wird zum Helden der Arbeit {kingdom_dat} ernannt, weil {person} {big} Ziegel an einem Tag gestapelt hat. Alle eifern nach.',
      'Das Volkshaus von {capital} ehrt {person} mit einer Blechmedaille. Seitdem schuften alle für eine eigene.',
      'Plakate in ganz {kingdom} zeigen {person} mit Schaufel. Das spornt an, sagen die Plakate.'] });
  ev('theocracy_fasten', 'gov', 'kingdom', 'Fastenzeit', { weight: 1, cooldown: 5, when: gv('theocracy'),
    effects: [{ stock: 'food', add: [15, 30] }, { mod: 'happiness', add: -3, years: 1 }, { mod: 'loyalty', add: 5, years: 3 }],
    texts: ['{Leader} ruft eine Fastenzeit zu Ehren von {deity} aus. Die Vorräte wachsen, die Mägen knurren.',
      'Fastenzeit {kingdom_in}: Erlaubt sind nur Wasser und Gebete. {Person} betet um ein Würstchen.',
      'Die Priester {kingdom_dat} verkünden: {deity} mag keine vollen Teller. Die Speisekammern füllen sich.'] });
  ev('theocracy_reliquie', 'gov', 'city', 'Reliquie', { weight: 1, cooldown: 6, when: gv('theocracy'),
    effects: [{ stock: 'gold', add: [20, 40] }, { mod: 'happiness', add: 4, years: 3 }],
    texts: ['In {city} wird eine Reliquie gefunden: die Lieblingsgabel von {deity}. Pilger zahlen gern fürs Anschauen.',
      'Ein heiliger Knochen taucht in {city} auf. Er gehörte einem Huhn, aber einem sehr frommen.',
      'Die Reliquie von {city} – ein Stein mit der Form eines Knödels – lockt Gläubige und Gold an.'] });
  ev('theocracy_zehnt', 'gov', 'kingdom', 'Zehnt', { weight: 1, cooldown: 5, when: gv('theocracy'),
    effects: [{ stock: 'gold', add: [15, 35] }, { mod: 'happiness', add: -4, years: 2 }],
    texts: ['Der Tempel {kingdom_dat} verlangt den Zehnten. {Deity} braucht angeblich einen neuen Mantel.',
      'Die Priester sammeln den Zehnten ein. In {capital} zahlt man in Hühnern, die Priester sind nicht glücklich.',
      'Für einen größeren Schrein erhebt {leader} eine Abgabe. Die Gläubigen murren leise und fromm.'] });
  ev('republic_bank', 'gov', 'kingdom', 'Bankgründung', { weight: 1, cooldown: 6, when: gv('republic'),
    effects: [{ mod: 'gold', mul: 1.25, years: 5 }, { stock: 'gold', add: -20 }],
    texts: ['{Kingdom_nom} gründet die erste Bank. Man legt Gold hinein, und am Ende des Jahres ist mehr da. Magie!',
      'In {capital} eröffnet das Bankhaus {person} & Söhne. Zinsen werden in Kuchen ausgezahlt.',
      'Die Händler {kingdom_dat} erfinden den Schuldschein. Plötzlich sind alle reich, auf dem Papier.'] });
  ev('republic_zoll', 'gov', 'pair', 'Zollstreit', { weight: 1, cooldown: 6, when: gv('republic'), rel: ['peace', 'alliance'],
    effects: [{ stock: 'gold', add: [15, 30] }, { opinion: [-15, -8] }],
    texts: ['{Kingdom_nom} erhebt Zoll auf Waren aus {other_dat}. Die Kasse klingelt, die Nachbarn murren.',
      'Ein Zollstreit zwischen {kingdom} und {other}: Es geht um Gurken, Prinzipien und sehr viel Gold.',
      'Die Zöllner von {capital} verlangen für jede Kuh aus {otherCity} eine Münze. Die Kühe sind empört.'] });
  ev('republic_luxus', 'gov', 'city', 'Luxusmode', { weight: 1, cooldown: 5, when: gv('republic'),
    effects: [{ stock: 'gold', add: [-25, -10] }, { mod: 'happiness', add: 5, years: 2 }, { mod: 'immigration', mul: 1.3, years: 2 }],
    texts: ['In {city} tragen jetzt alle Hüte mit Federn. Je höher die Feder, desto wichtiger der Kaufmann.',
      'Eine Mode aus Seide erobert {city}. Die Kasse leert sich, die Stadt glänzt und zieht Besucher an.',
      '{Person} aus {city} trägt Schuhe mit goldenen Schnallen. Bald trägt die ganze Stadt welche.'] });
  ev('anarchy_kommune', 'gov', 'city', 'Gemeinschaftsgarten', { weight: 1, cooldown: 5, when: gv('anarchy'),
    effects: [{ mod: 'food', mul: 1.15, years: 3 }, { happy: 4 }],
    texts: ['Die Kommune von {city} legt einen Gemeinschaftsgarten an. Jeder pflanzt, was er will. Es wächst erstaunlich viel.',
      'In {city} gehört der Garten allen. Auch die Schnecken halten sich daran.',
      'Ein bunter Garten wächst mitten in {city}. {Person} hat Kürbisse und Sonnenblumen gesät, alle ernten.'] });
  ev('anarchy_streit', 'gov', 'kingdom', 'Dauerplenum', { weight: 1, cooldown: 4, when: gv('anarchy'),
    effects: [{ mod: 'work', mul: 0.9, years: 2 }, { mod: 'happiness', add: 2, years: 2 }],
    texts: ['Das Plenum {kingdom_dat} diskutiert im {years}. Jahr, ob ein Tor Herrschaft ist. Die Tür bleibt vorerst angelehnt.',
      'Im Plenum von {capital} wird über die Farbe des Protokollbuchs abgestimmt. Ergebnis: alle Farben.',
      'Das Plenum {kingdom_dat} hat eine Rednerliste mit {big} Namen. Gearbeitet wird zwischen den Beiträgen.'] });
  ev('anarchy_tausch', 'gov', 'city', 'Tauschring', { weight: 1, cooldown: 5, when: gv('anarchy'),
    effects: [{ stock: 'wood', add: [10, 20] }, { stock: 'food', add: [10, 20] }, { loyal: 4 }],
    texts: ['In {city} entsteht ein Tauschring: eine Stunde Holzhacken gegen eine Stunde Vorlesen. Alle haben mehr.',
      'Der Tauschmarkt von {city} läuft ohne Geld. {Person} tauscht {@ding} gegen drei Säcke Mehl.',
      'In {city} tauscht man jetzt alles gegen alles. Am Ende des Tages hat jeder etwas, das er braucht.'] });

  // ===========================================================================
  // WELTGESCHEHEN (alle Reiche)
  // ===========================================================================
  ev('komet', 'world', 'world', 'Komet', { weight: 1, cooldown: 25,
    effects: [{ mod: 'happiness', add: 3, years: 2, on: 'all' }, { mod: 'aggression', add: -0.05, years: 2, on: 'all' }],
    texts: ['Ein Komet zieht über die ganze Welt. Alle Reiche schauen nach oben und vergessen kurz ihren Streit.',
      'Ein Schweif aus Licht am Himmel! Die Gelehrten streiten, ob es ein Omen ist. Die Kinder wünschen sich etwas.',
      'Ein Komet erhellt die Nächte. Selbst die Generäle sitzen im Gras und staunen.'] });
  ev('weltkaese', 'world', 'world', 'Käsemangel', { weight: 1, cooldown: 25,
    effects: [{ mod: 'happiness', add: -3, years: 2, on: 'all' }, { mod: 'food', mul: 0.95, years: 2, on: 'all' }],
    texts: ['Weltweiter Käsemangel! Niemand weiß, wohin der Käse verschwunden ist. Die Mäuse schweigen.',
      'Auf der ganzen Welt wird der Käse knapp. Selbst die Könige essen Brot ohne Belag.',
      'Eine Käsekrise erschüttert alle Reiche. In den Chroniken spricht man vom „Jahr des trockenen Brotes“.'] });
  ev('goldenes_jahr', 'world', 'world', 'Goldenes Jahr', { weight: 1, cooldown: 25,
    effects: [{ mod: 'food', mul: 1.15, years: 2, on: 'all' }, { mod: 'growth', mul: 1.1, years: 2, on: 'all' }],
    texts: ['Ein goldenes Jahr bricht an: Überall wächst das Korn, und alle Kühe geben doppelt Milch.',
      'Die ganze Welt erlebt einen Sommer wie aus dem Bilderbuch. Die Chronisten haben nichts zu meckern.',
      'Sonne und Regen im besten Takt: In allen Reichen quellen die Scheunen über.'] });
  ev('grosser_winter', 'world', 'world', 'Großer Winter', { weight: 1, cooldown: 25,
    effects: [{ mod: 'food', mul: 0.85, years: 1, on: 'all' }, { mod: 'work', mul: 0.92, years: 1, on: 'all' }],
    texts: ['Ein großer Winter legt sich über die Welt. Selbst die Wölfe tragen Schals.',
      'Schnee bis zum Dach in allen Reichen. Man arbeitet langsam und isst schnell.',
      'Der kälteste Winter seit Menschengedenken: Die Brunnen frieren, die Nasen auch.'] });
  ev('friedensfest', 'world', 'world', 'Weltfriedenstag', { weight: 1, cooldown: 30,
    effects: [{ mod: 'aggression', add: -0.15, years: 3, on: 'all' }, { mod: 'happiness', add: 2, years: 3, on: 'all' }],
    texts: ['Ein Weltfriedenstag wird ausgerufen. Alle Reiche schicken Kuchen über die Grenzen.',
      'Wanderbarden singen in allen Reichen dasselbe Lied über Frieden. Es ist sehr eingängig.',
      'Die Völker der Welt beschließen, einen Tag lang nett zueinander zu sein. Es gefällt ihnen so, dass sie es verlängern.'] });
  ev('wanderzirkus', 'world', 'world', 'Wanderzirkus', { weight: 1, cooldown: 20,
    effects: [{ mod: 'happiness', add: 4, years: 1, on: 'all' }, { mod: 'immigration', mul: 1.2, years: 2, on: 'all' }],
    texts: ['Ein Wanderzirkus zieht durch alle Reiche. Ein Bär fährt Einrad, ein Huhn rechnet.',
      'Der große Zirkus Kunterbunt tourt um die Welt. Überall laufen ihm Leute hinterher und bleiben irgendwo hängen.',
      'Akrobaten, Gaukler und ein singender Esel besuchen jedes Reich der Welt. Die Laune steigt überall.'] });

  // ===========================================================================
  // MEHR POLITIK
  // ===========================================================================
  ev('volkszorn_steuern', 'politics', 'kingdom', 'Steuersenkung', { weight: 0.9, prio: 1.5, cooldown: 8, when: c => c.L.happy < 40 && !c.law('niedrige_steuern') ? 1.5 : 0,
    effects: [{ law: 'niedrige_steuern' }, { mod: 'happiness', add: 3, years: 2 }],
    texts: ['Um den Volkszorn zu dämpfen, senkt {kingdom} die Steuern. Der Steuereintreiber geht in Kurzarbeit.',
      '{Leader} verkündet Steuersenkungen. Die Leute jubeln, die Schatzmeister weinen leise ins Kassenbuch.',
      'Weil {capital} murrt, gibt es Steuererleichterungen. {Person} rechnet nach und ist sehr zufrieden.'] });
  ev('rekrutierung', 'politics', 'kingdom', 'Mobilmachung', { weight: 1, prio: 1.5, cooldown: 8, when: c => c.L.atWar && !c.law('wehrpflicht') && c.gov !== 'anarchy' ? 2 : 0,
    effects: [{ law: 'wehrpflicht' }, { mod: 'soldiers', add: 0.04, years: 3 }],
    texts: ['Der Krieg verlangt Opfer: {kingdom} führt die Wehrpflicht ein. Die Schneider nähen Uniformen im Akkord.',
      '{Leader} ruft alle Waffenfähigen zu den Fahnen. Auch {person}, der eigentlich nur Brot holen wollte.',
      'In {capital} hängen Plakate: „Das Reich braucht dich!“ Darunter hat jemand geschrieben: „Wofür?“'] });
  ev('mauerbeschluss', 'politics', 'kingdom', 'Mauerbeschluss', { weight: 0.9, prio: 1.5, cooldown: 8, when: c => c.L.threat && !c.law('mauerpflicht') && c.gov !== 'anarchy' ? 1.5 : 0,
    effects: [{ law: 'mauerpflicht' }, { stock: 'stone', add: [10, 20] }],
    texts: ['Die Nachbarn sind unheimlich geworden: {kingdom} beschließt die Mauerpflicht. Jeder bringt Steine mit.',
      '{Leader} lässt verkünden: Mauern schützen, Mauern verbinden, Mauern sind schön. Die Mauerpflicht ist da.',
      'In {capital} wird über Nacht ein Mauergesetz beschlossen. Morgens stehen alle mit Kellen bereit.'] });
  ev('amnestie', 'politics', 'kingdom', 'Amnestie', { weight: 0.9, cooldown: 10, when: c => c.L.happy < 50 ? 1.5 : 0.4,
    effects: [{ mod: 'happiness', add: 4, years: 3 }, { loyal: 5 }],
    texts: ['{Leader} verkündet eine Amnestie. Alle Diebe von Kuchen werden begnadigt, sogar die Wiederholungstäter.',
      'In {capital} werden die Kerker geöffnet. Heraus kommen drei Hühnerdiebe und ein verwirrter Dachs.',
      'Zur Feier von {@anlass} vergibt {kingdom} allen kleinen Sündern. Die Stimmung hellt sich auf.'] });
  ev('provinz_privileg', 'politics', 'city', 'Stadtrecht', { weight: 1, cooldown: 8, when: c => c.k && c.c && c.c.id !== c.k.capitalId ? 1.5 : 0.2,
    effects: [{ loyal: 12 }, { mod: 'gold', mul: 1.1, years: 5 }],
    texts: ['{city} erhält das Marktrecht. Der Bürgermeister trägt ab jetzt eine Kette aus Blech, aber mit Stolz.',
      '{Leader} verleiht {city} ein eigenes Wappen: eine {@essen}-Schüssel auf grünem Grund. Die Bürger sind gerührt.',
      '{city} darf jetzt eigene Feiertage beschließen. Erste Amtshandlung: der Tag des freien Nachmittags.'] });
  ev('provinz_aufbegehren', 'politics', 'city', 'Eigensinn', { weight: 1, cooldown: 7, when: c => c.k && c.c && c.c.id !== c.k.capitalId && (c.c.loyalty == null ? 50 : c.c.loyalty) < 40 ? 2 : 0,
    effects: [{ loyal: -10 }, { stock: 'gold', add: [8, 18], on: 'city' }],
    texts: ['{city} weigert sich, Abgaben nach {capital} zu schicken. „Wir brauchen das Gold selbst, für Blumenkübel.“',
      'Die Leute von {city} hissen eine eigene Fahne neben der des Reichs. Sie ist größer.',
      'In {city} wird über Unabhängigkeit gemurmelt. Das Gold bleibt vorerst im eigenen Keller.'] });
  ev('rathausuhr', 'politics', 'city', 'Rathausuhr', { weight: 0.9, cooldown: 8, when: c => c.c && c.c.pop >= 20 ? 1.2 : 0,
    effects: [{ stock: 'gold', add: [-20, -10] }, { mod: 'work', mul: 1.06, years: 4 }],
    texts: ['{city} bekommt eine Rathausuhr. Seitdem kommt niemand mehr zu spät, außer der Uhrmacher.',
      'Die neue Turmuhr von {city} schlägt dreizehn. Alle arbeiten trotzdem pünktlicher.',
      'In {city} wird die erste Uhr aufgestellt. {Person} glaubt, sie mache die Zeit.'] });

  // ===========================================================================
  // MEHR WIRTSCHAFT
  // ===========================================================================
  ev('muenzfaelscher', 'economy', 'kingdom', 'Falschgeld', { weight: 0.9, cooldown: 8, when: c => c.L.gold > 30 ? 1.2 : 0.3,
    effects: [{ stock: 'gold', pct: -0.2 }, { mod: 'gold', mul: 0.9, years: 2 }],
    texts: ['Falschmünzer {kingdom_in}! Die Münzen sind aus angemaltem Holz. Sie schwimmen.',
      'In {capital} tauchen Münzen mit dem Gesicht eines Esels auf. Das Original zeigt {leader}. Man merkt den Unterschied kaum.',
      '{@schuldiger} hat Falschgeld in Umlauf gebracht. Die Händler {kingdom_dat} beißen jetzt in jede Münze.'] });
  ev('salzfund', 'economy', 'city', 'Salzquelle', { weight: 1, cooldown: 10,
    effects: [{ mod: 'food', mul: 1.1, years: 5 }, { stock: 'gold', add: [10, 25] }],
    texts: ['Bei {city} wird eine Salzquelle entdeckt. Endlich schmeckt der {@essen} nach etwas.',
      '{Person} leckt in {city} an einem Felsen und ruft „Salz!“. Eine Saline entsteht.',
      'Salz aus {city} wird zum Exportschlager. Die Vorräte halten länger, die Kasse klingelt.'] });
  ev('muehle', 'economy', 'city', 'Neue Mühle', { weight: 1, cooldown: 8,
    effects: [{ stock: 'wood', add: -15 }, { mod: 'food', mul: 1.12, years: 6 }],
    texts: ['In {city} dreht sich eine neue Windmühle. Sie quietscht im Takt eines Volksliedes.',
      'Die neue Wassermühle von {city} mahlt so fein, dass das Mehl beim Niesen davonfliegt.',
      '{city} baut eine Mühle. Der Müller {person} ist sofort die wichtigste Person im Ort.'] });
  ev('preisverfall', 'economy', 'kingdom', 'Rübenschwemme', { weight: 1, cooldown: 8, when: c => c.L.foodPer > 5 ? 1.5 : 0.4,
    effects: [{ stock: 'gold', add: [-20, -8] }, { stock: 'food', add: [10, 20] }],
    texts: ['Es gibt zu viele Rüben {kingdom_in}. Der Preis fällt so tief, dass man Rüben mit Rüben bezahlt.',
      'Rübenschwemme in {capital}! Die Bauern verschenken Rüben an Fremde, die Fremden flüchten.',
      'Die Märkte {kingdom_dat} sind überflutet mit {@essen}. Die Händler verlieren Gold, die Speisekammern quellen.'] });
  ev('werkzeugmangel', 'economy', 'city', 'Werkzeugmangel', { weight: 1, cooldown: 6,
    effects: [{ mod: 'build', mul: 0.85, years: 2 }, { mod: 'work', mul: 0.95, years: 2 }],
    texts: ['In {city} sind alle Hämmer verschwunden. Man nagelt jetzt mit Kartoffeln.',
      'Der Schmied von {city} ist im Urlaub. Die Werkzeuge werden stumpf, die Laune auch.',
      'Ein Hammerstiel bricht in {city}, dann noch einer. Es entsteht eine Werkzeugkrise.'] });
  ev('handwerkermeister', 'economy', 'city', 'Wandernder Meister', { weight: 1, cooldown: 6,
    effects: [{ mod: 'build', mul: 1.2, years: 3 }, { pop: 1 }],
    texts: ['Ein wandernder Baumeister lässt sich in {city} nieder. Die Häuser werden plötzlich gerade.',
      'In {city} zieht ein {@beruf} aus der Fremde ein und bringt neue Kniffe mit.',
      'Meister {person} kommt nach {city} und zeigt allen, wie man ein Dach deckt, ohne vom Dach zu fallen.'] });
  ev('lagerbrand', 'economy', 'city', 'Lagerbrand', { weight: 0.7, cooldown: 10, when: c => c.sim.state.laws.disasters,
    effects: [{ stock: 'wood', pct: -0.4 }, { power: 'fire' }],
    texts: ['Das Holzlager von {city} geht in Flammen auf. Schuld war ein Funke und {@schuldiger}.',
      'Feuer im Lager von {city}! Die Löschkette reicht bis zum Brunnen, aber nicht ganz.',
      'In {city} brennt das Brennholz – nur leider zu früh und auf einmal.'] });

  // ===========================================================================
  // MEHR NATUR
  // ===========================================================================
  ev('wolfsrudel', 'nature', 'city', 'Wolfsheulen', { weight: 1, cooldown: 6,
    effects: [{ mod: 'happiness', add: -3, years: 1 }, { stock: 'food', add: [-15, -6] }],
    texts: ['Wölfe heulen nachts um {city}. Die Schafe zählen sich vor Angst ständig selbst.',
      'Ein Wolfsrudel holt sich Vorräte aus {city}. Es war offenbar ein sehr gut organisiertes Rudel.',
      'In {city} verschwinden Würste. Die Spuren führen zu den Wölfen, die Würste nicht wieder zurück.'] });
  ev('aufforstung', 'nature', 'kingdom', 'Aufforstung', { weight: 1, prio: 1.5, cooldown: 10, when: c => c.L.bare > 0.5 && c.law('naturschutz') ? 3 : (c.L.bare > 0.7 ? 0.8 : 0),
    effects: [{ flag: 'nature', value: 'care', years: 8 }, { mod: 'happiness', add: 3, years: 4 }, { stock: 'wood', add: -8 }],
    texts: ['{Kingdom_nom} pflanzt Bäume rund um {capital}. Jedes Kind bekommt einen Setzling und eine Gießkanne.',
      'Ein Aufforstungsplan grünt {kingdom_acc} ein. Die Holzfäller bekommen Urlaub, die Spechte Arbeit.',
      '{Leader} pflanzt eigenhändig die erste Eiche. Sie ist noch klein, aber sehr feierlich.'] });
  ev('ueberschwemmung', 'nature', 'city', 'Hochwasser', { weight: 0.8, cooldown: 10, when: c => c.sim.state.laws.disasters,
    effects: [{ stock: 'food', pct: -0.2 }, { damage: 0.4, n: [1, 2] }, { power: 'rain' }],
    texts: ['Hochwasser in {city}! Die Keller laufen voll, die Frösche ziehen ein.',
      'Der Fluss bei {city} tritt über die Ufer. {Person} rudert in einer Badewanne zur Arbeit.',
      'Nach {@wetter} steht {city} knietief im Wasser. Zwei Hütten schwimmen ein Stück.'] });
  ev('pilzschwemme', 'nature', 'city', 'Pilzjahr', { weight: 1, cooldown: 6,
    effects: [{ stock: 'food', add: [15, 30] }, { happy: 2 }],
    texts: ['Ein Pilzjahr bei {city}! Die Körbe sind voll, und nur ein einziger Pilz war verdächtig blau.',
      'Im Wald bei {city} sprießen Pilze, groß wie Regenschirme. Man benutzt sie auch so.',
      'Die Leute von {city} sammeln Pilze, bis die Pfannen glühen.'] });
  ev('duerre', 'nature', 'kingdom', 'Dürre', { weight: 0.8, prio: 1.5, cooldown: 12, when: c => c.sim.state.laws.disasters,
    effects: [{ mod: 'food', mul: 0.75, years: 2 }, { mod: 'happiness', add: -4, years: 2 }, { follow: 'missernte', chance: 0.4, years: [1, 1] }],
    texts: ['Dürre {kingdom_in}! Der Fluss ist so flach, dass die Fische zu Fuß gehen.',
      'Kein Tropfen Regen über {kingdom_dat} seit Monaten. Die Brunnen seufzen, die Felder vertrocknen.',
      '{Kingdom_nom} leidet unter Dürre. {Leader} betet, tanzt und droht den Wolken – erfolglos.'] });
  ev('vogelzug', 'nature', 'city', 'Störche', { weight: 1, cooldown: 5,
    effects: [{ mod: 'growth', mul: 1.15, years: 2 }, { happy: 3 }],
    texts: ['Störche nisten auf allen Dächern von {city}. Die Leute halten das für ein gutes Zeichen, und siehe da: Kinder!',
      'Ein Schwarm Zugvögel rastet in {city}. Alle schauen zu, und irgendwie wird es gemütlich.',
      'Der erste Storch des Jahres landet auf dem Rathaus von {city}. Es wird gefeiert.'] });
  ev('bergrutsch', 'nature', 'city', 'Steinschlag', { weight: 0.7, cooldown: 12, when: c => c.sim.state.laws.disasters,
    effects: [{ stock: 'stone', add: [20, 40] }, { damage: 0.5 }],
    texts: ['Ein Steinschlag trifft {city}. Ein Haus wird getroffen, aber jetzt gibt es Steine im Überfluss.',
      'Bei {city} rutscht ein Hang ab. Die Steinmetze freuen sich, die Hausbesitzer nicht.',
      'Ein Felsbrocken rollt nach {city} und bleibt vor dem Brunnen liegen. Er wird zerlegt und verbaut, nachdem er eine Scheune gestreift hat.'] });

  // ===========================================================================
  // MEHR ALLTAG UND KURIOSES
  // ===========================================================================
  ev('entlaufene_ziege', 'daily', 'city', 'Entlaufene Ziege', { weight: 1.2, cooldown: 4,
    effects: [{ mod: 'work', mul: 0.96, years: 1 }, { happy: 2 }],
    texts: ['Eine Ziege entkommt in {city} und frisst die Wäsche von {num} Haushalten. Die ganze Stadt jagt sie lachend.',
      'In {city} wird eine Ziege zur Stadträtin gewählt. Es war ein Scherz, aber sie bleibt im Amt.',
      'Die Ziege von {person} steigt auf das Dach des Rathauses von {city}. Niemand arbeitet, alle schauen zu.'] });
  ev('kuchenwettbewerb', 'daily', 'city', 'Backwettbewerb', { weight: 1.1, cooldown: 4,
    effects: [{ stock: 'food', add: [-12, -5] }, { mod: 'happiness', add: 4, years: 2 }],
    texts: ['Backwettbewerb in {city}! {Person} gewinnt mit einem Kuchen, der wie das Rathaus aussieht. Das Rathaus ist neidisch.',
      'In {city} wird der längste Streuselkuchen der Welt gebacken. Er reicht vom Markt bis {@ort}.',
      'Der Backwettbewerb von {city} endet unentschieden, weil die Jury alles aufgegessen hat.'] });
  ev('nachtwaechter', 'daily', 'city', 'Verschlafener Wächter', { weight: 1, cooldown: 5,
    effects: [{ stock: 'gold', add: [-10, -4] }, { mod: 'loyalty', add: -2, years: 1 }],
    texts: ['Der Nachtwächter von {city} verschläft die ganze Nacht. Am Morgen fehlen {@ding} und etwas Gold.',
      'In {city} ruft der Nachtwächter jede Stunde „Alles ruhig!“ – auch als jemand die Stadtkasse wegträgt.',
      'Der Nachtwächter von {city} schnarcht so laut, dass Diebe sich ungestört fühlen.'] });
  ev('liebesbrief', 'daily', 'city', 'Liebesbrief', { weight: 1.1, cooldown: 4,
    effects: [{ happy: 5 }, { mod: 'growth', mul: 1.1, years: 2 }],
    texts: ['Ein Liebesbrief wird {@ort} von {city} vorgelesen, versehentlich. Seitdem flirtet die ganze Stadt.',
      '{Person} singt {person2} ein Ständchen unter dem Fenster in {city}. Die Nachbarn singen mit.',
      'In {city} verliebt sich {person} in den {@beruf}. Die Stadt spricht von nichts anderem, sehr romantisch.'] });
  ev('spukhaus', 'daily', 'city', 'Spukhaus', { weight: 1, cooldown: 6,
    effects: [{ mod: 'happiness', add: -2, years: 2 }, { stock: 'gold', add: [5, 15] }],
    texts: ['In einem Haus in {city} spukt es. Es stellt sich heraus: eine Eule mit Schluckauf. Die Besichtigungen kosten trotzdem Eintritt.',
      'Ein Geist geht in {city} um. Er ist sehr höflich und bittet nur um Ruhe. Touristen kommen trotzdem.',
      'Nachts klappert es in {city}. {Person} schwört, es sei ein Gespenst, der Rest vermutet einen Waschbären.'] });
  ev('schulfest', 'daily', 'city', 'Kinderfest', { weight: 1.1, cooldown: 4,
    effects: [{ mod: 'happiness', add: 3, years: 2 }, { mod: 'growth', mul: 1.05, years: 2 }],
    texts: ['Kinderfest in {city}: Sackhüpfen, Eierlaufen und ein sehr ernst geführtes Murmelturnier.',
      'Die Kinder von {city} bauen eine Burg aus Heu. Die Erwachsenen dürfen nur mit Erlaubnis hinein.',
      'In {city} wird ein Drachensteigfest gefeiert. Ein Drachen fliegt bis ins Nachbarreich.'] });
  ev('erbsenzaehler', 'daily', 'kingdom', 'Volkszählung', { weight: 1, cooldown: 8,
    effects: [{ mod: 'taxes', add: 0.005, years: 4 }, { mod: 'happiness', add: -2, years: 1 }],
    texts: ['{Kingdom_nom} zählt seine Bewohner. Ergebnis: {big}, plus Hühner. Die Steuerlisten werden länger.',
      'Volkszählung {kingdom_in}: Jeder muss sich in eine Liste eintragen. {Person} trägt sich dreimal ein, weil es so schön war.',
      'Die Beamten {kingdom_dat} zählen alles: Menschen, Kühe, Löffel. Die Steuer folgt der Zählung.'] });

  // ===========================================================================
  // MEHR GLAUBE
  // ===========================================================================
  ev('prophezeiung', 'faith', 'kingdom', 'Prophezeiung', { weight: 1, cooldown: 8,
    effects: [{ mod: 'happiness', add: 2, years: 3 }, { mod: 'loyalty', add: 4, years: 3 }],
    texts: ['Eine Seherin {kingdom_dat} prophezeit: „Wer viel isst, wird satt.“ Das Volk ist tief beeindruckt.',
      'Eine alte Prophezeiung wird in {capital} gefunden. Sie handelt von einem goldenen Kürbis. Alle sind hoffnungsvoll.',
      '{Person} hat eine Vision: {kingdom} wird groß und schön. Die Leute glauben es gern.'] });
  ev('tempelbau', 'faith', 'city', 'Neuer Schrein', { weight: 1, cooldown: 8, when: c => (c.gov === 'theocracy' ? 2 : 0.6),
    effects: [{ stock: 'stone', add: [-25, -10] }, { mod: 'happiness', add: 6, years: 5 }],
    texts: ['In {city} wird ein Schrein für {deity} errichtet. Er ist klein, aber er glänzt.',
      'Die Leute von {city} bauen einen Tempel aus Feldsteinen. Er wackelt bei Wind, aber das gilt als heilig.',
      '{city} ehrt die Götter mit einem neuen Schrein. {Person} stiftet eine Glocke, die nur „pling“ macht.'] });
  ev('glaubensstreit', 'faith', 'pair', 'Glaubensstreit', { weight: 1, cooldown: 8, when: c => c.gov === 'theocracy' || (c.o && c.o.gov === 'theocracy') ? 2 : 0, rel: ['peace'],
    effects: [{ opinion: [-30, -15] }, { mod: 'aggression', add: 0.08, years: 3 }],
    texts: ['{Kingdom_nom} und {other} streiten, ob die Welt eine Scheibe oder ein Pfannkuchen ist.',
      'Die Priester {kingdom_dat} bezeichnen die Götter {other_dat} als „überbewertet“. Die Stimmung kippt.',
      'Ein theologischer Disput: Darf man {deity} mit Senf essen? {Other_nom} sagt ja. Skandal!'] });
  ev('segensjahr', 'faith', 'city', 'Gesegnetes Jahr', { weight: 0.8, cooldown: 8,
    effects: [{ power: 'bless' }, { stock: 'food', add: [10, 25] }],
    texts: ['Ein goldenes Leuchten liegt über {city}. Die Kranken werden gesund, die Ernte reift.',
      'Die Gebete von {city} werden erhört: Es regnet genau richtig, und alle sind gesund.',
      '{Person} findet in {city} ein vierblättriges Kleeblatt. Danach geht alles gut, für ein ganzes Jahr.'] });
  ev('wunderheiler', 'faith', 'city', 'Wunderheiler', { weight: 1, cooldown: 6, when: c => c.c && c.c.sick > 0 ? 2.5 : 0.4,
    effects: [{ power: 'bless' }, { stock: 'gold', add: [-15, -5] }],
    texts: ['Ein Wunderheiler kommt nach {city} und heilt mit Kräutertee und sehr viel Zuversicht.',
      'In {city} verteilt eine Kräuterfrau Salben. Sie riechen fürchterlich, helfen aber.',
      'Ein Heiler aus der Fremde legt in {city} Hände auf. Die Kranken stehen auf, er nimmt ein paar Münzen.'] });

  // ===========================================================================
  // MEHR KRIEG UND DIPLOMATIE
  // ===========================================================================
  ev('heiratsangebot', 'war', 'pair', 'Heiratsangebot', { weight: 0.9, prio: 1.5, cooldown: 12, rel: ['peace'],
    when: c => c.gov === 'monarchy' && c.rel && c.rel.opinion > 20 ? 2.5 : (c.rel && c.rel.opinion > 40 ? 0.6 : 0),
    effects: [{ relation: 'alliance' }, { mod: 'happiness', add: 3, years: 3, on: 'both' }],
    texts: ['Eine Hochzeit vereint die Herrscherhäuser von {kingdom} und {other}. Das Bündnis ist besiegelt, der Kuchen war riesig.',
      '{Leader} und {otherLeader} besiegeln ein Bündnis mit einer Heirat ihrer Nichten. Die Nichten sind sich einig, nur nicht über die Musik.',
      'Ein Bündnis aus Liebe und Kalkül: {kingdom} und {other} feiern gemeinsam.'] });
  ev('handelsvertrag', 'war', 'pair', 'Handelsvertrag', { weight: 1.1, cooldown: 8, rel: ['peace', 'alliance'], when: c => c.rel && c.rel.opinion > 0 ? 1.5 : 0.3,
    effects: [{ opinion: [10, 20] }, { mod: 'gold', mul: 1.15, years: 5, on: 'both' }],
    texts: ['{Kingdom_nom} und {other} schließen einen Handelsvertrag: Rüben gegen Ritterrüstungen.',
      'Händler aus {capital} und {otherCity} dürfen jetzt zollfrei handeln. Die Märkte blühen.',
      'Ein Vertrag regelt den Austausch von {@essen} zwischen {kingdom} und {other}. Beide Seiten fühlen sich übervorteilt, also fair.'] });
  ev('spion_erwischt', 'war', 'pair', 'Spion erwischt', { weight: 1, prio: 1.5, cooldown: 8, rel: ['peace', 'war'],
    effects: [{ opinion: [-25, -12] }, { mod: 'loyalty', add: 3, years: 2 }],
    texts: ['In {capital} wird ein Spion {other_dat} erwischt. Er trug einen falschen Bart und eine Karte, auf der „Geheim“ stand.',
      'Ein Kundschafter aus {otherCity} wird beim Abzeichnen der Stadtmauer von {capital} ertappt. Er hatte nicht mal einen Bleistift.',
      '{Kingdom_nom} entlarvt eine Spionin {other_dat}. Sie arbeitete drei Jahre als Köchin, und die Suppe war hervorragend.'] });
  ev('friedensangebot', 'war', 'pair', 'Friedensangebot', { weight: 1.2, prio: 2, cooldown: 4, rel: ['war'],
    when: c => c.rel && c.rel.status === 'war' && (c.L.happy < 45 || (c.rel.weariness || 0) > 3) ? 2 : 0.4,
    effects: [{ relation: 'peace' }, { mod: 'happiness', add: 4, years: 2, on: 'both' }],
    texts: ['{Kingdom_nom} schickt {other_dat} einen Friedenskuchen. {Other_nom} probiert und unterschreibt.',
      'Nach langem Krieg reichen sich {leader} und {otherLeader} die Hände. Die Soldaten gehen nach Hause und kochen.',
      'Ein weißes Bettlaken über {capital}: {kingdom} bietet Frieden an. {Other_nom} nimmt an, erleichtert.'] });
  ev('soeldner_kommen', 'war', 'kingdom', 'Söldnertrupp', { weight: 1, cooldown: 6, when: c => c.L.atWar && c.L.gold > 30 ? 2 : 0,
    effects: [{ stock: 'gold', add: [-40, -20] }, { mod: 'strength', mul: 1.15, years: 2 }, { pop: [2, 3] }],
    texts: ['Ein Söldnertrupp bietet {kingdom_dat} seine Dienste an. Sie kämpfen für Gold und warmes Essen.',
      '{Leader} heuert die „Eisernen Löffel“ an, eine Söldnertruppe mit beeindruckenden Schnurrbärten.',
      'Söldner ziehen nach {capital}. Sie sind teuer, laut und erstaunlich gute Sänger.'] });
  ev('grenzfest', 'war', 'pair', 'Grenzfest', { weight: 1, cooldown: 8, rel: ['peace', 'alliance'], when: c => c.rel && c.rel.opinion > -10 ? 1 : 0,
    effects: [{ opinion: [8, 16] }, { stock: 'food', add: -10 }],
    texts: ['An der Grenze zwischen {kingdom} und {other} wird ein Fest gefeiert. Man tauscht {@essen} und Lieder.',
      'Ein Tauziehen über die Grenze: {kingdom} gegen {other}. Das Seil reißt, alle fallen um und lachen.',
      'Bauern aus {capital} und {otherCity} feiern gemeinsam {@anlass}. Die Diplomaten sind überflüssig.'] });

  // ===========================================================================
  // MEHR PERSÖNLICHKEITEN
  // ===========================================================================
  ev('dichter', 'people', 'city', 'Hofdichter', { weight: 1, cooldown: 5,
    effects: [{ mod: 'happiness', add: 4, years: 3 }, { mod: 'loyalty', add: 3, years: 3 }],
    texts: ['{Person} aus {city} dichtet ein Lied über die Stadt. Jeder kann es mitsingen, keiner bekommt es mehr aus dem Kopf.',
      'Die Gedichte von {person} machen {city} berühmt. Reimwort auf {city}: keins, aber das stört niemanden.',
      'Ein Dichter in {city} schreibt ein Epos über {@ding}. Es hat {big} Strophen und alle lieben es.'] });
  ev('held_rettung', 'people', 'city', 'Lebensretter', { weight: 1, cooldown: 5,
    effects: [{ happy: 6 }, { loyal: 4 }],
    texts: ['{Person} rettet in {city} ein Kind aus dem Brunnen. Das Kind war nur zum Wasserholen drin, aber egal: Held!',
      'Bei einem Brand in {city} trägt {person} {num} Hühner aus dem Stall. Die Hühner gründen einen Fanklub.',
      '{Person} {@spitz} hält in {city} einen durchgehenden Ochsen auf. Die Stadt feiert.'] });
  ev('gelehrte', 'people', 'kingdom', 'Akademie', { weight: 0.9, cooldown: 10, when: c => c.L.pop > 30 ? 1.5 : 0.3,
    effects: [{ mod: 'build', mul: 1.1, years: 6 }, { mod: 'food', mul: 1.05, years: 6 }, { stock: 'gold', add: -15 }],
    texts: ['{Kingdom_nom} gründet eine Akademie. Erste Erkenntnis: Rüben wachsen besser, wenn man sie pflanzt.',
      'Die Gelehrten von {capital} erfinden das Fruchtwechselsystem. Die Felder bedanken sich.',
      '{Person} schreibt ein Buch über Ackerbau, das alle lesen. Danach ackert {kingdom} schlauer.'] });
  ev('querulant', 'people', 'city', 'Querulant', { weight: 1, cooldown: 5,
    effects: [{ loyal: -5 }, { mod: 'build', mul: 0.93, years: 1 }],
    texts: ['{Person} aus {city} beschwert sich über alles: das Wetter, die Mauer, die Zahl der Wolken. Die Arbeiten stocken.',
      'Ein Querulant in {city} reicht {num} Beschwerden an einem Tag ein. Die Beamten tun nichts anderes mehr.',
      '{Person} stellt sich in {city} auf eine Kiste und schimpft über {leader}. Einige hören zu, andere bauen langsamer.'] });
  ev('alter_weiser', 'people', 'city', 'Alter Weiser', { weight: 1, cooldown: 6,
    effects: [{ mod: 'happiness', add: 3, years: 4 }, { mod: 'work', mul: 1.03, years: 4 }],
    texts: ['Der älteste Bewohner von {city} feiert seinen {big}. Geburtstag. Sein Rat: „Immer warm frühstücken.“ Alle folgen.',
      'Eine weise Frau in {city} schlichtet jeden Streit mit einer Geschichte. Die Stadt wird friedlich.',
      '{Person} aus {city} hat auf jede Frage eine Antwort, meistens „Schlaf erst mal drüber“. Es hilft.'] });
  ev('abenteurer', 'people', 'city', 'Abenteurer', { weight: 1, cooldown: 6,
    effects: [{ stock: 'gold', add: [15, 40] }, { mod: 'immigration', mul: 1.2, years: 3 }],
    texts: ['{Person} kehrt nach Jahren der Reise nach {city} zurück, mit einem Sack Gold und unglaublichen Geschichten.',
      'Eine Abenteurerin aus {city} bringt einen Schatz aus fernen Höhlen. Ihre Erzählungen locken Neugierige an.',
      '{Person} {@spitz} hat angeblich das Ende der Welt gesehen. Es war ein Zaun. Aber das Gold ist echt.'] });

  // @@MEHR@@

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
