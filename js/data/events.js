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
  const lawWhen = g => c => c.gov === g && c.wanted ? 3 : 0;
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
    effects: [{ gov: ['fascism', 'democracy', 'anarchy', 'monarchy'] }, { happy: -5 }],
    texts: ['Putsch {kingdom_in}! Eine Gruppe Unzufriedener stürmt den Palast. Ab heute herrscht {gov_d} – vorerst.',
      'Während {leader} beim Mittagsschlaf ist, wechselt {kingdom} die Regierungsform: {gov}. Das Kissen wird beschlagnahmt.',
      'In {capital} wird die Fahne ausgetauscht. Die neue gehört {gov_dat_dummy}', 'Ein Umsturz in {capital} bringt {gov_acc_dummy}'].slice(0, 2) });
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

  // @@MEHR@@

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
