// =============================================================================
// Wuselwelt – Simulation (Teil A). DOM-frei, deterministisch (nur WW.RNG, kein Math.random/Date).
// Schnittstelle ist EINGEFROREN: ab hier nur noch Ergänzungen, keine Umbenennungen.
// =============================================================================
//
// LADEREIHENFOLGE (klassische Skripte, alle mit dem WW-Wrapper):
//   js/core/terrain.js, js/core/rng.js, js/core/config.js, js/data/names.js, js/data/texts.js,
//   js/sim/util.js, js/sim/world.js, js/sim/worldgen.js (Agent D, optional), js/sim/path.js,
//   js/sim/structs.js, js/sim/walls.js, js/sim/cities.js, js/sim/units.js, js/sim/gov.js,
//   js/sim/diplo.js, js/sim/growth.js, js/sim/creatures.js, js/sim/env.js, js/sim/powers.js, js/sim/sim.js
//   (Wildnis-Teil, eigener Agent: js/core/config-wild.js nach config.js, js/data/texts-wild.js nach texts.js,
//    js/sim/wild.js vor env.js – siehe tests/load.js)
//   (Industrie: js/core/config-industry.js nach config.js, js/data/texts-industry.js nach texts.js, js/sim/industry.js,
//    js/sim/rail.js, js/sim/camps.js vor sim.js; Doku in deren Kopfkommentaren)   // [industry]
//   (Militär: js/core/config-mil.js, js/data/texts-mil.js, js/sim/military.js nach camps.js; Doku im Kopf von military.js)   // [mil]
//   (Seefahrt: js/core/config-naval.js, js/data/texts-naval.js, js/sim/naval.js nach military.js; state.ships, Häfen – Doku im Kopf von naval.js)   // [see]
//
// ERZEUGEN
//   const sim = WW.Sim.create(opts)          opts (alle optional):
//     seed        Zahl oder Text (Standard 1)
//     world       fertige Welt { W, H, terrain, variant?, height?, startSpots?, name? } (z. B. WW.WorldGen.generate)
//     size        'small'|'medium'|'large'|'huge'  (nur ohne world; an WW.WorldGen weitergereicht)
//     width,height  feste Größe (nur ohne world)
//     worldOpts   weitere Optionen für WW.WorldGen.generate (template, land, …)
//     populate    Anzahl Startreiche 0..8 (true = 3, false = 0, Standard 3)
//     races       Liste von Volks-Schlüsseln (zyklisch) – sonst passend zum Gelände gewürfelt
//     govs        Liste von Regierungs-Schlüsseln (zyklisch) | 'mixed' (verschiedene, nach Volk gewichtet)
//                 | weglassen = alle starten als 'tribe' und wählen ab Dorfgröße selbst   [ABWEICHUNG Plan 2.1]
//     animals     false = keine Schafe/Wölfe
//     laws        { key: bool } Startwerte der Weltgesetze
//   Ohne world: WW.WorldGen.generate({ seed, size | w,h, ...worldOpts }) falls geladen, sonst WW.SimWorld.generate.
//   WW.Sim.load(string) -> sim | null (null bei kaputtem/fremdem Spielstand)
//
// LAUFEN
//   sim.tick()            ein fester Schritt; 10 Ticks = 1 s bei 1×; WW.CONFIG.TPY = 240 Ticks = 1 Jahr
//   sim.serialize()       -> JSON-Text (Felder version, game:'wuselwelt'; Raster Base64)
//   sim.hash()            -> Hash des Spielstands (Determinismus-Prüfung)            [Ergänzung]
//   sim.drainDirtyTiles() -> Int32Array Kachel-Indizes (Gelände, Bauwerk, Feuer, Marke, Stil geändert)
//   sim.drainFx()         -> Array von Effekten (siehe FX), danach leer (max. 600 gepuffert)
//
// GOTTESHANDLUNGEN (sim.actions.*; prüfen Eingaben selbst, werfen nie, Rückgabe false/null bei Unsinn)
//   paintTerrain(x, y, radius, terrainId) -> bool   radius 1 = 1 Kachel, 2 = 3×3, 3 = Ø5 (UI-Pinsel 1/3/5 -> 1/2/3)
//        Bauwerke auf unpassendem Gelände werden zerstört (Mauer nur, wenn unbegehbar); Leute auf Wasser retten sich/ertrinken
//   spawnSettlers(x, y, count, govKeyOrNull, raceKey?, cultureKey?) -> { kingdomId, cityId } | null   (Kultur: siehe AUSBAU 9)
//        im Gebiet einer Stadt: schließen sich ihr an; sonst neues Reich (Abstand ≥ 12 zu Städten, Suche r ≤ 5),
//        zu nah: nächste Stadt (≤ 18). govKeyOrNull = null -> 'tribe', wählt selbst; Schlüssel ≠ 'tribe' -> govLocked.
//        raceKey fehlt -> 'human'.
//   spawnAnimal(x, y, kind) -> animalId | null      kind aus WW.CREATURES ('sheep', 'wolf')
//   setGovernment(kingdomId, govKey, { lock: true }) -> bool   (lock Standard true; startet Umbau, siehe unten)
//   setGovLocked(kingdomId, bool) -> bool
//   setRelation(kingdomA, kingdomB, 'war'|'peace'|'alliance') -> bool   (Chronik: godWar/godPeace/godAlliance)
//   strike(x, y, kind) -> bool    kind aus WW.POWERS: lightning, fire, rain, meteor, plague, bless
//   setLaw(key, bool) -> bool     Schlüssel aus WW.LAW_INFO: govChanges, wars, hunger, aging, newRealms, disasters (alle Standard an)
//
// ABFRAGEN (sim.query.*; null bei nichts)
//   cityAt(x,y) (Mauerinneres, Gebiet oder Bauwerk), kingdomAt(x,y), unitNear(x,y,r=1.5), animalNear(x,y,r=1.5),
//   structAt(x,y), city(id), kingdom(id), unit(id), animal(id), struct(id),
//   kingdomStats(id) -> { pop, cities, soldiers, happiness, atWar }, worldStats() -> { pop, kingdoms, cities, animals, year }
//
// ZUSTAND sim.state (reine Daten; Felder mit '_' sind Laufzeit und werden nicht gespeichert)
//   seed, W, H, tick, year, nextId (gemeinsamer ID-Zähler), worldName, laws{}, pathVersion (zählt bei Sperr-/Geländeänderung),
//   eventSeq, fireCount, markCount
//   Raster (Länge W*H, Index y*W+x): terrain Uint8 (WW.TERRAIN-ID), variant Uint8, height Uint8 (0..255),
//     owner Int32 (Stadt-ID | -1, Gebiet), structAt Int32 (Bauwerk-ID | -1), fire Uint8 (0 = kein Feuer, sonst Restdauer),
//     inRing Int32 (Stadt-ID, deren Mauer-Innenfläche die Kachel ist | -1), mark Uint8 (1..99 verkohlt, 100..199 Krater; zählt herunter)
//   structs[]: { id, type, x, y, w, h (aus WW.STRUCT_INFO), cityId (-1 = niemand), level, hp, maxHp, built, progress 0..1,
//     style (Regierungsschlüssel des Aussehens), restyle (Ziel-Regierung eines laufenden Umbaus | null),
//     mask (Mauer/Tor/Turm: Nachbarn Bit0 N, Bit1 O, Bit2 S, Bit3 W), mat (Mauer/Tor/Turm: 'palisade'|'stone'|'fortress'|'barricade'),
//     orient (Tor: 'h' Mauer waagerecht | 'v'), growth 0..3 + gprog (Feld), upgradeTo (Ausbau auf Stufe | 0), paid, workers,
//     ruinOf (Ruine: Typ des Vorgängers), age (Ruine), towerSpot, skipUntil, siegeT/siegeN, siteYear }
//     Baustelle = !built; Ausbau = built && upgradeTo; Umbau = built && restyle (Gerüst zeigen). Gebäude sind begehbar,
//     nur fertige wall/tower sperren, fertige gate sperren Feinde. Ruinen sind 1×1 (große Gebäude hinterlassen mehrere).
//     [ABWEICHUNG] center hat kein Feld gov mehr: Aussehen über style (gilt für alle Bauwerke).
//   units[]: { id, x, y (Kachelkoord., Fließkomma; Kachel = floor), dir (-1 links | 1 rechts), role, race, kingdomId, cityId,
//     age (Jahre), life, hp, maxHp, moving, carrying ('food'|'wood'|'stone'|null), carryAmt, female, name,
//     bubble { icon, ttl } | null, sick, merc (Söldner), order ({ kind:'march', city, k } | { kind:'home' } | null),
//     foe, breach, group, site, Pfad-/KI-Felder path, pi, goal, task, phase, tt, target, fails, cd, wait, wtry }
//   animals[]: { id, kind, x, y, dir, hp, maxHp, moving, tx, wait, foe, cd, age }
//   cities[]: { id, name, kingdomId, race, cx, cy (MITTLERE Kachel des 3×3-Zentrums; Zentrum liegt bei cx-1, cy-1),
//     centerId, centerOk, tier (Index in WW.CITY_TIERS), pop, adults, children, housing, stock { food, wood, stone, gold }
//     (Kommunismus: Kopie des Reichslagers), happiness 0..100, jobs { role: n }, houses, builtHouses, markets,
//     hasBarracks, hasMarket, hasMonument, hungry, revolt, sick, noSpace, founded, occupiedUntil, prevKingdomId, agitated,
//     wall { level 0..3 (fertige Stufe), target, total, built, style ('none'|'palisade'|'stone'|'fortress'|'barricade'),
//            state 'none'|'building'|'done'|'upgrading'|'expanding', plan [Kachel-Indizes des Rings inkl. natürlicher Barrieren],
//            gates [Indizes], towers [Indizes], gaps [Barrikaden-Lücken], old [abzutragender alter Ring], expansions,
//            plannedYear, inside (Anzahl Innenkacheln), maxed }, sites[], fields[], drops[] (IDs), … }
//   kingdoms[]: { id, name, baseName, race, colorIndex 0..11, bannerPattern 0..7, gov, govLocked, leaderId, leaderName,
//     leaderTitle, leaderTrait ('pious'|'greedy'|'bossy'|'gentle'|'dreamy'|'stern'), cityIds[], capitalId,
//     relations { [id]: { opinion -100..100, status 'peace'|'war'|'alliance', since, weariness, losses, wars } },
//     policy { bonus ('bread'|'walls'|'nap'|'trade'|'safety'|null), party, until, plan { focus, goal, until } | null, unrest },
//     deity (Theokratie), stock (nur Kommunismus: gemeinsames Lager), nextElection, nextPlan, govSince, founded }
//   events[] (letzte 400): { id (= eventSeq), year, tick, type, text (deutsch), kingdomId, cityId, x, y (-1 = ohne Ort) }
//
// EREIGNISTYPEN (WW.Texts.EVENTS hat je Typ mehrere Varianten)
//   Städte: found, joinCity, firstHouse, tier, famine, settlersLeave, daughter, cityAbandoned, monument, shrine, barracks,
//     market, repurpose
//   Mauern: wallPlan, barricadePlan, wallDone, barricadeDone, wallStone, wallStoneDone, wallFortress, wallFortressDone,
//     wallExpand, wallExpandDone, wallBreach
//   Regierung: gov, govSet (Spieler), govChoice (selbst gewählt, mit Begründung), evolve, revolution, regimeFall, coup,
//     strongman, reform, collapse, plenumVote, succession, leaderDeath, throneFeud, election, shamElection, fiveYearPlan,
//     planResult, miracleHarvest, miracleHeal, sermon, plenum, royalDecree, council, tribeCouncil, propaganda, paranoia
//   Diplomatie/Krieg: war, holyWar, godWar, peace, godPeace, buyPeace, alliance, godAlliance, allianceEnd, allyJoins,
//     royalWedding, mobilize, armyMarch, raid, conquest, occupation, conversion, liberation, uprisingLiberation, fallen,
//     kingdomGone, mercs, revolt, resistance, revoltCrushed, revoltCalm, revoltFizzle, secede, agitation
//   Kräfte: randomLightning, randomPlague, godLightning, godFire, godRain, godMeteor, godPlague, godBless
//
// FX (sim.drainFx): { type, x, y, … }  – Koordinaten in Kacheln (Fließkomma)
//   arrow {x2,y2}, bolt, meteor, rain {r}, plague {r}, sparkle {r?}, smoke, dust (Bau fertig), hit (Treffer an Bauwerk),
//   spark (Blitz trifft Bauwerk), poof (Tod), splash (ertrunken), govchange {gov}, restyle {gov} (Umbau eines Bauwerks fertig)
//
// REGIERUNGEN (Daten in WW.GOVERNMENTS[key]): Werte wie wallThreshold, wallMax, soldierShare …, dazu
//   war ('raid'|'knights'|'defend'|'mass'|'agitate'|'holy'|'mercs'|'militia'), build { barracks|market|monument:
//   { first, per, max }, towerSpacing }, looks { center, wall, house, monument } (Text für UI). WW.govBuildCount(gov, type, pop).
//   Regierungswechsel = Umbau: Zentrum sofort restyle (Baumeister-Vorrang), danach Mauern/Häuser/Denkmal; unbekannte
//   Gebäude werden zu Häusern umgewidmet (Markt/Kaserne), Türme ohne Turmrecht zu Mauern. Mauern bleiben dabei dicht.
// VÖLKER: WW.RACES[key] (speed, hp, strength, lifespan, fertility, yields, wallMul, housingBonus, favTerrain, govPrefs, …)
// KREATUREN: WW.CREATURES[kind] + Verhalten WW.CreatureAI[ai]; KRÄFTE: WW.POWERS[kind].apply(sim, x, y)
//
// ERGÄNZUNGEN STUFE 3a (Wachstum, Belagerung) – nur hinzugefügt, nichts umbenannt
//   Fluren: Gebiet besteht aus 6×6-Blöcken. state.flur Int32Array(fw*fh), fw = ceil(W/6), fh = ceil(H/6),
//     Index fy*fw+fx = Stadt-ID | -1. owner-Raster folgt den Fluren (offenes Meer bleibt -1) und bleibt die Wahrheit
//     für die Darstellung. Hilfen: WW.Growth.dims(state), flurAt(state,x,y), flurCenter(state,fi), countFlurs(sim,city),
//     reach(sim,city) (Reichweite der Landnahme in Kacheln), cityLimit(sim,kingdom), loyaltyTarget(sim,city,kingdom).
//   state.plots[] Vorhaben: { id, type 'war'|'alliance'|'revolt'|'secession', kingdomId, targetId (Reich bzw. Stadt),
//     cityId, progress 0..1, x, y, since, announced, holy? }. 'war' -> Kriegserklärung bei 1, sinkt bei besserer Meinung/
//     Gesetz aus/Frieden durch Spieler; 'revolt' -> Aufstand; 'secession' -> Abspaltung (Loyalität < 10).
//   city: loyalty -100..100 (Hauptstadt 100; < 0 -> Abspaltung als eigenes Reich, Nachbarn mit Loyalität ≤ 22 gehen mit),
//     flurs (Anzahl Fluren), needLand, landFull, joinedYear, conqueredYear, besieged (Tick bis wann belagert; Bauern
//     bleiben drinnen = Aushungern), siegeYear, lastClaim,
//     governor { name, female, war 1..5, diplo 1..5, admin 1..5, quirk (Text), since } (Statthalter, keine Einheit)
//   kingdom: ruler { leaderId, war, diplo, admin, quirk } (Werte des Herrschers; Heergröße/Kriegslust/Stadtlimit)
//   units: neue Rollen 'ram' (Rammbock, stark gegen Tore) und 'catapult' (schießt aus 6,5 Kacheln auf Mauern/Türme);
//     beide nur mit order march, ohne Auftrag werden sie wieder 'soldier'. Felder homeK, homeC (Auswanderer), noFishUntil.
//   Häuser je Stadt: höchstens 2 + Fluren × WW.CONFIG.HOUSES_PER_FLUR; mehr Land holt sich die Stadt selbst.
//   Tochterstadt: ≥ WW.CONFIG.DAUGHTER_ADULTS (30) Erwachsene, Reich im Frieden, Anführer lebt, 6–10 Siedler,
//     Abstand ≥ DAUGHTER_MIN_DIST (18) zu jeder Stadt, dieselbe Landmasse, Reich unter Stadtlimit + 2.
//   Zuzug: Dörfer < 30 Einw. mit Nahrung bekommen jährlich 1–3 Zuwanderer. MAX_UNITS jetzt 2200.
//   Neue Reiche von selbst (Gesetz newRealms): Auswanderer (exodus), Verbannte (exiles), Flüchtlinge (refugees) ziehen
//     als Siedler eines neuen Stammes los und gründen ihn (newRealm).
//   Neues Gesetz: newRealms (Standard an).
//   Neue Ereignisse: flurLost, migrants, secedeLoyalty, plotWar, plotWarOff, plotAlliance, plotRevolt, plotSecession,
//     exodus, exiles, refugees, newRealm, siegeEngines, siege.
//   Neue Fx: claim { x, y, cityId } (Flur genommen), rock { x2, y2 } (Katapultstein), ram (Rammstoß am Tor).
//   Neue Werte: WW.GOVERNMENTS[k].cityLimit, .landReach; WW.RACES[r].cityLimit, .landReach; CONFIG FLUR_*, RAM_*, CATAPULT_*.
//
// ERGÄNZUNG 1.2a „Vom Lager zur Stadt"
//   center: stage 0 Lager (bei Gründung sofort fertig) | 1 Dorfhalle | 2 Regierungssitz; upgrading true während des Ausbaus
//     (Gebäude bleibt built und nutzbar, progress 0..1, Baumeister arbeiten daran). Ausbau startet ab Stadtstufe
//     STRUCT_INFO.center.stageTier[stage] und Mindestalter stageMinYears[stage]; Kosten stageCost, Arbeit stageWork.
//     Fertig: stage++, Dirty-Kacheln, Fx centerStage { x, y, stage }, Ereignis hallDone bzw. seatDone (Beginn: hallStart,
//     seatStart). style (Regierung) wirkt optisch erst bei stage 2; Regierungswechsel baut nur stage 2 um.
//     Alte Spielstände ohne stage: stage = 2. Mauerplanung erst ab stage ≥ 1.
//   house: level 0 = Zelt (STRUCT_INFO.house.tent: billig, 2 Plätze), gebaut solange das Zentrum auf stage 0 ist; ab Dorfhalle
//     werden Zelte nach und nach zu level 1 aufgewertet (upgradeTo 1), neue Häuser gleich level 1.
//     variant 0..255 (Zufall beim Bau; Formenvielfalt in der Darstellung; alte Spielstände: aus der ID abgeleitet).
//
// GEBIETSWACHSTUM (Ergänzung)
//   WW.CITY_TIERS hat jetzt 6 Stufen: Lager, Dorf (8), Stadt (20), Großstadt (40), Metropole (110), Weltstadt (220); city.tier 0..5.
//   Lager starten mit 3×3 Fluren. Städte nehmen stetig Land bis zur Ziel-Flurenzahl WW.Growth.flurTarget(sim, city)
//     (FLUR_TARGET_BASE + Einwohner × FLUR_TARGET_POP + 3 × Stufe), alle FLUR_GROW_TICKS / gov.landSpeed Ticks eine angrenzende
//     Flur in Reichweite (FLUR_REACH + Stufe × FLUR_REACH_TIER + …). gov.landSpeed: Faschismus 1,6, Monarchie 1,4, Stamm/Anarchie 0,6.
//   Felder dürfen auf freiem Land direkt am Rand entstehen und nehmen die Flur dann in Besitz (WW.Growth.claimableAt).
//   Tochterstädte erst ab Stadtstufe Stadt und wenn das Land ausgeschöpft ist; Abstand DAUGHTER_MIN_DIST (34).
//   Neue Felder: city.flurMark (für Meilensteine), relations[id].borderMet. Ereignisse: territoryDoubled { city, n }, borderContact.
//
// MODIFIKATOREN (für js/sim/mods.js eines anderen Agenten; fehlt die Datei, gilt der Basiswert)
//   Aufruf über WW.SimUtil.mod(sim, kingdom, city, key, base) -> WW.Mods.value(...) bzw. base, und
//   WW.SimUtil.modFlag(sim, kingdom, key) -> WW.Mods.flag(...) bzw. undefined. Schlüssel und Aufrufstellen:
//     happiness  Cities.happinessTarget (Zielwert der Zufriedenheit, vor dem Begrenzen auf 0..100)
//     work       Units.workMul (Arbeitstempo jeder Einheit)
//     build      thinkBuilder (Bautempo, Basis gov.buildMul)       wallSpeed  thinkBuilder (Mauerstücke, Basis gov.wallSpeedMul)
//     food       thinkFarmer (Ernte- und Fischertrag, Basis race.yields.food)
//     wood/stone thinkGatherer (Ertrag je Gang, Basis race.yields.wood/stone)
//     gold       Cities.economy (Goldeinkommen je Sekunde)       taxes      Cities.economy (Steuersatz, Basis gov.taxes)
//     growth     Cities.economy (Geburtenfaktor, Basis gov.growthMul) und Growth.yearly (Zuzug)
//     soldiers   Cities.assignJobs (Soldatenanteil, Basis gov.soldierShare)
//     strength   Units.damageOf (Kampfkraft)                     aggression Diplo.yearly (Kriegslust des Reichs, vor Wahrscheinlichkeit)
//     loyalty    Growth.loyaltyTarget (Zielwert der Loyalität)   immigration Growth.yearly (Anzahl Zuwanderer)
//   Flag 'nature' ('care'|'use'|'exploit') überschreibt den Umgang mit der Natur (siehe NATUR).
//
// NATUR (Kahlschlag / Naturschutz)
//   WW.GOVERNMENTS[g].nature 'exploit' (Faschismus, Kommunismus, Handelsrepublik mit natureMul 0.6) | 'use' (Stamm,
//     Monarchie, Demokratie) | 'care' (Theokratie, Anarchie); WW.RACES[r].nature 'care' (Elfen, Froschlinge) hat Vorrang,
//     WW.RACES.orc.natureMul 1.4 verstärkt. Demokratie mit Wahlsieg der Partei 'green' (policy.bonus) -> care.
//     Auswahl: WW.Growth.natureMode(sim, kingdom, race?) (Mods-Flag zuerst).
//   exploit: Holzfäller roden fast jede gefällte Kachel und gehen bis 20 Kacheln weit; Steinmetze tragen Hügel ab (-> Wiese);
//     Felder sind nach CONFIG.FIELD_EXHAUST Ernten ausgelaugt (-> Tundra); gerodetes Land im eigenen Gebiet bleibt kahl.
//   care: kein Roden, Holz erst ab 9 Kacheln Abstand (Hain bleibt), jährliches Nachpflanzen im eigenen Gebiet.
//   state.cleared Uint8 (W*H): > 0 = hier wurde gerodet (Baumstümpfe zeichnen), sinkt jährlich um 24, außer im Gebiet eines
//     exploit-Reichs. Alte Spielstände ohne Raster: 0.
//   city.nature / kingdom.nature 0..100: Anteil intakter Natur im Gebiet (ohne Mauerinneres), jährlich. Unter 30 sinkt die
//     Zufriedenheit (care-Völker stärker). care-Reiche verlieren Meinung über exploit-Reiche mit kahlem Land.
//   Ereignisse: clearcut, natureComplaint. Feld field.uses (Ernten unter exploit).
// SONSTIGE ERGÄNZUNGEN: Rolle 'bandit' und u.wMad > tick gelten als feindlich (Wildnis); declareWar/makePeace/makeAlliance mit
//   type 'silent' schreiben keine Chronik; nach jedem Regierungswechsel WW.Events.onGovChange(sim, kingdom), falls vorhanden.
//   Heere: Wegsuche gedeckelt (CONFIG.PATH_LIMIT_ARMY, ARMY_PATH_SHARE des Budgets je Tick, u.nextPath = Wartezeit).
//   Farmer sammeln bei knappen Vorräten Beeren im Wald (task 'forage', CONFIG.FORAGE). city.resCache = Rohstoff-Zwischenspeicher.
//
// AUSBAU 9 – ROHSTOFFE, KULTUREN, NAMEN, KACHEL-MELDUNGEN (Simulation Kern; verbindlich für Grafik, Darstellung, Militär,
//   Industrie. Nur Ergänzungen, alte Felder und Aufrufe bleiben gültig.)
// ROHSTOFFE
//   Lager: city.stock (Kommunismus: kingdom.stock) hat immer alle Schlüssel aus WW.RESOURCE_KEYS:
//     food, wood, stone, gold, iron, coal, fish, crystal, wool (WW.RESOURCES[]: { key, name, icon 'i_<key>', base, from, use }).
//     Zugriff immer über WW.Cities.stock(sim, city) (liefert bei geteiltem Lager das Reichslager).
//     WW.Resources.has(sim, city, { iron: 2, coal: 1 }) -> bool, WW.Resources.take(sim, city, { iron: 2, coal: 1 }) -> bool
//     (alles oder nichts; für Arsenal/Panzer, Fabriken, Züge).
//   Vorkommen: state.deposit Uint8 (W*H), Code -> Art über WW.DEPOSITS = [null,'iron','coal','gold','crystal','fish'],
//     WW.DEPOSIT_CODE. Gespeichert; alte Spielstände: deterministisch aus dem Weltsamen erzeugt. Erschöpfte Kacheln -> 0.
//   Bauwerke (alle 2×2; vor der Mauer, Minen auch innerhalb, Schmiede bevorzugt innen): mine { res 'iron'|'coal'|'gold'|'crystal', left (Restvorrat;
//     0 -> Ruine, Ereignis mineDepleted) }, smithy, fishery (am Flachwasser mit Fisch), pasture (Weide). Ereignis mineOpened.
//   Wirkung: city.armed 0|1|2 (Schmiede mit Eisen | Eisen + Kohle): Soldaten Kampfkraft ×1,25/×1,35, Leben ×1,15
//     (WW.Resources.armMul/armorMul). Fisch wird zuerst gegessen. Wolle: Zufriedenheit (+8 in Kälte, sonst +3), city.cold 0|1;
//     Kälte ohne Wolle -4 (nicht für Kultur nord). Kristall: über Markt/Handelsrepublik zu Gold. Kohle: Schmiede, Fabriken, Züge.
// KULTUREN (WW.CULTURES[key], WW.CULTURE_KEYS)
//   Schlüssel: mitte (gemäßigt, Standard für Menschen), nord (Schnee, Tundra, Nadelwald), sahel (Wüste, Savanne; Vorbild
//     Sahel-Reiche und Sahara-Nomaden), nil (Wüste/Savanne mit Fluss im Umkreis 6; Vorbild Kusch/Nubien), dazu je Fantasievolk
//     eine Kultur mit dem Volksschlüssel: elf, dwarf, orc, gnome, frog.
//   Eintrag: { key, name, adj, people, note (Vorbild), biomes [Geländeschlüssel], race (nur Fantasievölker), style (Baustil-Schlüssel
//     für Sprites, = key), bonus { Mod-Schlüssel: Faktor }, bonusText [lesbar], special ('caravanserai'|'pyramid'|null),
//     desertWalk, irrigation, riverFields, coldProof }.
//   Felder: city.culture, kingdom.culture (Kultur der Hauptstadt, folgt ihr), unit.culture (Geburtsstadt; Kinder erben).
//     Gespeichert; alte Spielstände: Menschen 'mitte', sonst Volksschlüssel.
//   WW.Culture.pick(sim, x, y, race) -> Schlüssel (Volk + Gelände im Umkreis), WW.Culture.of(obj) -> Schlüssel,
//     WW.Culture.info(key) -> Eintrag (Rückfall mitte).
//   Boni: dauerhafte Mods an der Stadt (city.mods, source 'culture', über WW.Mods; ohne mods.js direkt in WW.SimUtil.mod):
//     mitte wood ×1,1, build ×1,05 · nord fish ×1,3, keine Kältenachteile · sahel gold ×1,25, kein Tempoabzug in Wüste/Sand,
//     Karawanen · nil Felder an Flüssen ×1,5 (food), Pyramide (Zufriedenheit). sahel/nil: Bewässerungsfelder auf Wüste/Sand
//     im Umkreis 3 um Wasser (field.irrigated = true; Darstellung: Gräben).
//   Sonderbauten: 'caravanserai' (2×2, sahel, je Stadt 1, in der Stadt oder vor dem Tor; schickt Karawanen) und 'pyramid'
//     (1×1, nil, je Stadt 1; level 1..3, dazu s.stage 0..2 = level − 1 für das Sprite s_monument_<stage> laut PLAN-9 – der Typ
//     'monument' bleibt das Regierungsdenkmal). city.pyramidLv 0..3 (fertige Stufe, Zufriedenheit +3/+5/+7). Ereignisse
//     caravanserai, pyramid, pyramidStage, irrigation (einmal je Stadt, city.irrigated), caravanArrives (selten).
//   Lehmbau (sahel, nil; CULTURES[k].loam): Steinmetze holen Lehm aus der Wüste (zählt als stone), Holzfäller Akazienholz aus der
//     Savanne (Kachel bleibt, 60 % Ertrag); Bauwerke (außer Mauern) brauchen 60 % des Holzes als Lehm statt Holz.
//     WW.Culture.resTab(city, 'wood'|'stone') = Gelände-Tabelle dieser Kultur.
//   Karawane: Einheit role 'caravan' (Name „Karawanenführer"), u.camel = true (Kamel daneben zeichnen), läuft zwischen ihrer Stadt
//     und einer befreundeten Stadt (eigenes Reich, Bündnis oder Frieden mit Meinung ≥ 0); Ankunft: Gold für beide Städte,
//     Fx caravan { x, y }. Tier 'camel' (WW.CREATURES.camel, Lasttier, friedlich, Wüste/Savanne).
//   spawnSettlers(x, y, count, govKeyOrNull, raceKey?, cultureKey?) – 6. Parameter optional; ohne Angabe nach Volk + Gelände.
//   create-Option cultures: Liste von Kulturschlüsseln (zyklisch) für die Startreiche.
// NAMEN (js/data/names.js)
//   WW.Names.place(culture, rng, biomeKey?, used?) -> Ortsname (ernst, je Kultur; used = Set gegen Dopplungen in der Welt)
//   WW.Names.realm(govKey, culture, stem, seed) -> „Königreich Falkenau", „Mansa-Reich Tombara", „Volksrepublik Frostvik" …
//     (seed: Zahl, z. B. Reichs-ID, wählt die Form stabil). Stamm = kingdom.baseName (Name der Hauptstadt bei Gründung).
//   WW.Names.person(culture, rng, female) -> Vorname; WW.Names.title(govKey, culture) -> { m, f } (Mansa, Qore/Kandake, Jarl …).
//   kingdom.name wechselt bei Regierungswechsel die Form, baseName bleibt; Ereignis realmRenamed { old, kingdom }.
//   Alte Aufrufe bleiben: town(rng, race, used), person(rng, race, female), realm(baseName, gov).
//   WW.Names.realmArticle(name, cas) -> „dem Eisernen Reich X“ (cas nom|acc|dat|in); WW.Texts.withArticle nutzt es.
//   Beinamen der Herrscher jetzt würdig („der Weise“, „die Standhafte“); Humor bleibt in Chronik, Parteien, Gottheiten.
// KACHEL-MELDUNGEN
//   drainDirtyTiles meldet nur noch Kacheln mit sichtbarer Änderung (Prüfsumme sim._visSig: Gelände, Variante, Höhe, Bauwerk-ID,
//     -Art, -Maske, Brücke, Feuer, Marke, Rodung, grazed, Verödung 3 Stufen, Ruß, murk/crack/fallout in 8er-Stufen, trench (>0 und
//     in 32er-Stufen), flora, Vorkommen,
//     Gebiet, Ring). NICHT gemeldet: Stufe/Stil/Fertigstellung von Bauwerken, Feldwachstum, Baufortschritt, Lebenspunkte
//     (Bauwerke werden in 2D und 3D ohnehin je Bild aus dem Zustand gezeichnet; Neubau/Abriss ändert die ID und wird gemeldet).
//   state.grazed Uint8 (W*H, gespeichert): 1 = sichtbar abgeweidet, mit Hysterese (an ab CONFIG.GRAZED_ON 170, aus unter
//     GRAZED_OFF 90; nur fruchtbares Gelände). Darstellung bitte st.grazed[i] statt graze[i] >= 128 lesen (auch in groundSig),
//     sonst passen gezeichnete Beweidung und Meldungen nicht zusammen.
//
// AUSBAU 9.10 – FASCHISMUS STÄRKER, MEGASTÄDTE, GARNISONEN (verbindlich für Darstellung, Militär, Seefahrt, Mauern)
// KEINE SIEDLUNGSGRÜNDUNG
//   WW.GOVERNMENTS[g].build.noSettle === true (Faschismus): keine Tochterstädte/Siedlertrupps, auch nicht über See (Seefahrt
//     bitte diese Marke lesen). Vom Spieler gesetzte Siedler und Lagerstädte bleiben erlaubt. Hilfe: WW.govNoSettle(govKey).
// MEGASTADT
//   WW.CITY_TIERS[6] = { key 'megacity', name 'Megastadt', minPop 350, govs ['fascism'] }, [7] = { key 'gigacity', 'Riesenstadt',
//     minPop 550, govs ['fascism'] }. Stufen mit govs gelten nur für diese Regierungen (WW.tierAllowed(tier, govKey)); city.tier 0..7.
//     Fällt die Regierung, sinkt die Stufe auf höchstens 5.
//   Wohnblöcke: house.level 4 und 5 (nur Regierungen mit megaHousing, also Faschismus; ab Stufe Großstadt bzw. Metropole),
//     Plätze je Haus WW.Cities.HOUSE_CAP = [3, 5, 8, 16, 28]. Sprites: s_house_<gov>_4/5 (bis dahin zeigt die Grafik Stufe 3).
//     Bis zu 3 Ausbauten gleichzeitig; zuerst aufstocken, dann neu bauen.
//   Vorstädte: Ist der Ring voll (city.noSpace) und die Stadt mindestens Großstadt, baut eine megaHousing-Stadt Häuser auch vor
//     der Mauer (an der Mauer bzw. am Bestand entlang, nicht auf Feldern). [walls] Bitte: Ringplanung/Erweiterung bei dieser
//     Größe (Ring mit 200+ Innenkacheln, Vorstadt davor) prüfen; bisher erweitert sich der Ring der Megastadt kaum (expansions 0).
//   Faschismus: gov.megaGrowth (Geburten ×1,4 ab Großstadt), gov.housesPerFlur 2,6, Ernte ×1,5 ab Großstadt (Zwangsbewirtschaftung).
//   Weltobergrenze Einwohner WW.CONFIG.MAX_UNITS (2200); je Stadt keine Geburten ab WW.CONFIG.CITY_POP_MAX (700).
// GARNISONEN (alle Regierungen außer Anarchie; Werte WW.GOVERNMENTS[g].garrison { cap (Loyalität max.), integ (Jahre bis zur
//   Eingliederung), share (Soll-Anteil besetzt) })
//   u.garrison = Stadt-ID | undefined: Soldat dieser Stadt fest zugeteilt; bleibt in/bei der Stadt, besetzt Mauer/Tore, wird nie
//     zum Marsch, zu Feldschlachten oder Zügen eingeteilt (Militär/Seefahrt: Einheiten mit u.garrison überspringen).
//     Unterwegs zur Stadt: u.order = { kind: 'garrison', city }.
//   city.garrison (Anzahl, alle 40 Ticks gezählt), city.garrisonWant (Soll aus Einwohnern, Unruhe, Besatzung, Kaserne),
//     city.garrisonSet (Spieler-Vorgabe | null = selbst), city.garrisonRatio 0..1 (Ist/Soll, für die Anzeige).
//   city.occupied = { since: Jahr, prev: früheres Reich } | null: eroberte Stadt. Besatzungsmalus auf die Loyalität
//     (-35 × (1 − Jahre/integ)), klingt je Regierung ab (Demokratie 4 J., Handelsrepublik 5, Stamm 8, Theokratie 8, Monarchie 10,
//     Kommunismus 15, Faschismus 60 = praktisch nie). Danach city.occupied = null (Ereignis integrated).
//   Wirkung: Loyalität + cap × Ist/Soll (Faschismus 45, Kommunismus 35, Monarchie 30, Theokratie 25, Handelsrepublik 20, Stamm 15,
//     Demokratie 12, Anarchie 0); fehlende Garnison in besetzter Stadt -20 × Fehlanteil; Aufstands- und Abspaltungs-Vorhaben
//     wachsen mit Garnison langsamer (Abspaltung nur in besetzten Städten: × (1 − Ist/Soll × 0,6), Faschismus × 0,95).
//   Bauwerk 'garrison' („Garnisonskaserne“, 2×2, core): +50 % Wirkung, Soll +4. Wird in besetzten Städten mit Soll ≥ 6 gebaut.
//   Eroberung: bis zum Soll bleiben Eroberer als Garnison; danach schickt die Hauptstadt (bzw. nächste eigene Stadt) Soldaten nach.
//   sim.actions.setGarrison(cityId, n) -> bool   n ≥ 0 feste Stärke (0 = abziehen), n = null/-1 -> wieder selbst
//   Ereignisse: garrisonSent, garrisonWithdrawn, integrated, garrisonLow.
// FASCHISMUS STÄRKER: soldierShare 0,36, unitDmgMul/unitHpMul 1,2 (Ausbildung), Wehrpflicht im Krieg (wie bisher 'mass').
//   Sturz des Regimes: nach 3 schlechten Jahren nur noch mit 20 % je Jahr, sicher nach einer im Krieg verlorenen Stadt
//   (kingdom.lostYear, 3 Jahre); Zusammenbruch in Anarchie seltener. Schwächen bleiben (Zufriedenheit, Garnisonsbedarf).
// =============================================================================
(function (WW) { 'use strict';

  const VERSION = 2;
  const U = () => WW.SimUtil;

  // ---------------------------------------------------------------------------
  // Hilfen
  // ---------------------------------------------------------------------------
  function mix(a, b) {
    let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
    return (h ^ (h >>> 15)) >>> 0;
  }
  // Kleiner Würfel aus einem Hash: Chronik-Varianten verbrauchen keinen Sim-Zufall
  function picker(seed) {
    let s = seed >>> 0;
    return { int: function (n) { s = mix(s, 0x51ed270b); return n > 0 ? s % n : 0; } };
  }
  function strHash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
    return h;
  }

  // Höhe 0..255 aus dem Gelände (für gemalte Kacheln)
  function heightFor(t) {
    const sea = (WW.WorldGen && WW.WorldGen.SEA_LEVEL) || 100;
    const rank = WW.TERRAIN_LUT.rank[t];
    if (rank <= 0) return Math.max(0, sea - 50);
    if (rank === 1) return sea - 20;
    if (rank === 2) return sea - 3;
    if (rank === 3) return sea + 2;
    if (rank === 4) return sea + 30;
    if (rank === 5) return sea + 80;
    if (rank === 6) return Math.min(255, sea + 120);
    return 250;
  }

  // ---------------------------------------------------------------------------
  // Laufzeit (nicht gespeichert, aus dem Zustand ableitbar)
  // ---------------------------------------------------------------------------
  function Sim(state, rngState) {
    this.state = state;
    this.rng = rngState ? WW.RNG.fromState(rngState) : WW.RNG.create(state.seed);
    const N = state.W * state.H;
    this._units = new Map(); this._animals = new Map(); this._structs = new Map();
    this._cities = new Map(); this._kingdoms = new Map();
    for (const u of state.units) this._units.set(u.id, u);
    for (const a of state.animals) this._animals.set(a.id, a);
    for (const s of state.structs) this._structs.set(s.id, s);
    for (const c of state.cities) this._cities.set(c.id, c);
    for (const k of state.kingdoms) this._kingdoms.set(k.id, k);
    this._usedNames = new Set(state.usedNames || []);
    delete state.usedNames;
    this.block = new Uint8Array(N);
    this._dirtyFlag = new Uint8Array(N);
    this._dirty = [];
    this._allDirty = false;
    this._fx = [];
    this._pathBudget = WW.CONFIG.PATH_BUDGET;
    this._animalCount = {};
    this._seedHash = WW.RNG.hashSeed(state.seed);
    WW.Path.init(this);
    WW.Structs.rebuildBlock(this);
    if (!state.grazed || state.grazed.length !== N) state.grazed = new Uint8Array(N);
    this._vsig = new Int32Array(N);
    for (let i = 0; i < N; i++) this._vsig[i] = this._visSig(i);
    this._unitsDirty = this._animalsDirty = this._structsDirty = false;
    const sim = this;
    this.actions = makeActions(sim);
    this.query = makeQuery(sim);
    if (WW.Naval) Object.assign(this.query, WW.Naval.queries(sim));   // [see] ship, shipNear, ships, harborOf, navalStats
  }

  Sim.prototype.markDirty = function (i) {
    if (this._dirtyFlag[i]) return;
    this._dirtyFlag[i] = 1;
    if (this._dirty.length < this.state.W * this.state.H) this._dirty.push(i); else this._allDirty = true;
  };
  // Sichtbare Prüfsumme einer Kachel: alles, was die Darstellung je Kachel aus dem Zustand liest (Gelände, Höhe,
  // Variante, Bauwerk-ID/Art/Maske – nicht Stufe, Stil, Wachstum, Baufortschritt, Leben –, Feuer, Marke, Rodung, Beweidung mit
  // Hysterese (state.grazed), Trübung/Risse/Fallout in 8er-Stufen, Verödung in 3 Stufen, Ruß, Vorkommen, Gebiet, Ring).
  // drainDirtyTiles meldet nur Kacheln, deren Prüfsumme sich seit der letzten Meldung geändert hat.
  Sim.prototype._visSig = function (i) {
    const st = this.state;
    let h = Math.imul(2166136261 ^ (st.terrain[i] | (st.variant[i] << 8) | (st.height[i] << 16)), 16777619);
    const sid = st.structAt[i];
    if (sid >= 0) {
      const s = this._structs.get(sid);
      h = Math.imul(h ^ sid, 16777619);
      // Bauwerke zeichnen 2D und 3D je Bild aus dem Zustand; je Kachel zählen nur Art, Maske (Gleis/Mauer) und Brücke
      if (s) h = Math.imul(h ^ (strHash(s.type) + ((s.mask | 0) << 12) + (s.bridge ? 1 << 18 : 0)), 16777619);
    }
    const b = st.barren ? st.barren[i] : 0;
    h = Math.imul(h ^ ((st.fire[i] ? 1 : 0) | (st.mark[i] << 1) | ((st.cleared[i] ? 1 : 0) << 9) | ((st.grazed && st.grazed[i] ? 1 : 0) << 10) |
      ((b ? (b > 170 ? 3 : b > 85 ? 2 : 1) : 0) << 11) | ((st.soot && st.soot[i] ? 1 : 0) << 13) | (st.deposit[i] << 14) |
      ((st.flora ? st.flora[i] & 15 : 0) << 18) | ((st.murk ? st.murk[i] >> 3 : 0) << 22)), 16777619);
    const tr = st.trench ? st.trench[i] : 0;   // [mil] Schützengräben (Militär), 8 Stufen
    h = Math.imul(h ^ ((st.crack ? st.crack[i] >> 3 : 0) | ((st.fallout ? st.fallout[i] >> 3 : 0) << 5) | ((st.fire[i] >> 4) << 10) | ((tr ? 1 + (tr >> 5) : 0) << 14)), 16777619);
    h = Math.imul(h ^ st.owner[i], 16777619);
    h = Math.imul(h ^ st.inRing[i], 16777619);
    return h | 0;
  };
  Sim.prototype.drainDirtyTiles = function () {
    const d = this._dirty, sig = this._vsig, all = this._allDirty;
    let n = 0;
    for (let k = 0; k < d.length; k++) {
      const i = d[k];
      this._dirtyFlag[i] = 0;
      const v = this._visSig(i);
      if (v !== sig[i] || all) { sig[i] = v; d[n++] = i; }
    }
    const out = Int32Array.from(n === d.length ? d : d.slice(0, n));
    d.length = 0;
    this._allDirty = false;
    return out;
  };
  // Beweidung sichtbar mit Hysterese (an ab GRAZED_ON, aus unter GRAZED_OFF); je Tick ein Streifen der Karte
  Sim.prototype._sweepGrazed = function () {
    const st = this.state, gz = st.graze, gd = st.grazed;
    if (!gz || !gd) return;
    const N = gz.length, step = Math.ceil(N / 40);
    const C = WW.CONFIG, on = C.GRAZED_ON, off = C.GRAZED_OFF;
    let i = st.grazePos | 0;
    const end = Math.min(N, i + step);
    for (; i < end; i++) {
      const v = gz[i];
      if (gd[i]) { if (v < off) { gd[i] = 0; this.markDirty(i); } }
      else if (v >= on && WW.TERRAIN_LUT.fertile[st.terrain[i]] > 0) { gd[i] = 1; this.markDirty(i); }
    }
    st.grazePos = i >= N ? 0 : i;
  };
  Sim.prototype.fx = function (f) {
    if (this._fx.length < 600) this._fx.push(f);
  };
  Sim.prototype.drainFx = function () { const f = this._fx; this._fx = []; return f; };
  Sim.prototype.terrainChanged = function () { this._compDirty = true; this.state.pathVersion++; };
  Sim.prototype._hashNoise = function (i) { return mix(i, this._seedHash) / 4294967296; };

  // Chronik-Eintrag. at = { kingdomId, cityId, x, y }
  Sim.prototype.event = function (type, vars, at) {
    const st = this.state;
    st.eventSeq++;
    const p = picker(mix(this._seedHash ^ strHash(type), st.eventSeq));
    let text = '';
    try { text = WW.Texts ? WW.Texts.format(type, vars || {}, p) : type; } catch (e) { text = type; }
    at = at || {};
    const ev = {
      id: st.eventSeq, year: st.year, tick: st.tick, type: type, text: text,
      kingdomId: at.kingdomId == null ? -1 : at.kingdomId, cityId: at.cityId == null ? -1 : at.cityId,
      x: U().isNum(at.x) ? at.x : -1, y: U().isNum(at.y) ? at.y : -1
    };
    st.events.push(ev);
    if (st.events.length > WW.CONFIG.MAX_EVENTS) st.events.splice(0, st.events.length - WW.CONFIG.MAX_EVENTS);
    return ev;
  };

  function compact(sim) {
    const st = sim.state;
    if (sim._unitsDirty) {
      // in place verdichten (keine neuen Arrays je Tick)
      const a = st.units;
      let j = 0;
      for (let i = 0; i < a.length; i++) { const u = a[i]; if (u.dead) sim._units.delete(u.id); else a[j++] = u; }
      a.length = j;
      sim._unitsDirty = false;
    }
    if (sim._animalsDirty) {
      st.animals = st.animals.filter(a => { if (a.dead) { sim._animals.delete(a.id); return false; } return true; });
      sim._animalsDirty = false;
    }
    if (sim._structsDirty) {
      st.structs = st.structs.filter(s => !s.dead);
      sim._structsDirty = false;
    }
  }

  // Ein fester Schritt
  Sim.prototype.tick = function () {
    const st = this.state;
    const TPY = WW.CONFIG.TPY;
    st.tick++;
    this._pathBudget = WW.CONFIG.PATH_BUDGET;
    this._armyUsed = 0;
    compact(this);
    // Statistik (pop, jobs, _members) wird von den Verbrauchern selbst erneuert (alle 10/40 Ticks, jährlich)
    WW.Units.buildBuckets(this);
    this._sweepGrazed();
    WW.Units.updateAll(this);
    WW.Creatures.updateAll(this);
    WW.Env.update(this);
    if (WW.Mods && st.tick % 10 === 3) WW.Mods.tick(this);   // [events]
    if (WW.Events) WW.Events.tick(this);   // [events]
    if (WW.Industry) WW.Industry.tick(this);   // [industry]
    if (WW.Military) WW.Military.tick(this);   // [mil] Arsenale, Schlachten, Gräben (js/sim/military.js)
    if (WW.Naval) WW.Naval.tick(this);   // [see] Häfen, Schiffe, Seegefechte (js/sim/naval.js)
    if (st.tick % 10 === 0) WW.Cities.updateAll(this);
    if (st.tick % 20 === 5) WW.Gov.update(this);
    if (st.tick % 40 === 15) { WW.Cities.stats(this); WW.Diplo.update(this); }
    if (st.tick % 30 === 20) WW.Growth.update(this);
    if (st.tick % 10 === 7) WW.Resources.update(this);
    if (st.tick % 40 === 25) { WW.Cities.stats(this); WW.Growth.updatePlots(this); }
    if (st.tick % 40 === 35) WW.Culture.update(this);
    if (st.tick % 40 === 5) WW.Garrison.update(this);   // Garnisonen (9.10)   // Kultur: Sonderbauten, Karawanen, Reichskultur
    if (st.tick % TPY === 0) {
      st.year++;
      WW.Units.yearly(this);
      WW.Creatures.yearly(this);
      WW.Cities.stats(this);
      WW.Cities.yearly(this);
      WW.Gov.yearly(this);
      WW.Diplo.yearly(this);
      WW.Growth.yearly(this);
      WW.Env.yearly(this);
    }
    compact(this);
  };

  // ---------------------------------------------------------------------------
  // Speichern / Laden
  // ---------------------------------------------------------------------------
  const RASTERS = [['terrain', Uint8Array], ['variant', Uint8Array], ['height', Uint8Array], ['owner', Int32Array],
    ['structAt', Int32Array], ['fire', Uint8Array], ['inRing', Int32Array], ['mark', Uint8Array], ['cleared', Uint8Array], ['chops', Uint8Array], ['deposit', Uint8Array],
    ['flora', Uint8Array], ['graze', Uint8Array], ['fallout', Uint8Array], ['crack', Uint8Array],   // [wild] Raster der Wildnis
    ['grazed', Uint8Array]];
  if (WW.Industry) RASTERS.push(['murk', Uint8Array], ['barren', Uint8Array]);   // [industry] Flusstrübung (pollution hat eigene Größe: WW.Industry.save/load)
  if (WW.Military) RASTERS.push(['trench', Uint8Array]);   // [mil] Schützengräben

  function replacer(key, value) {
    if (key && key.charCodeAt(0) === 95) return undefined;   // '_' = Laufzeit
    return value;
  }
  Sim.prototype.serialize = function () {
    const st = this.state;
    const o = {};
    for (const k in st) {
      if (k.charCodeAt(0) === 95 || k === 'version' || k === 'game' || k === 'rng' || k === 'usedNames' || k === 'flur') continue;
      let isR = false;
      for (const r of RASTERS) if (r[0] === k) isR = true;
      if (isR) continue;
      o[k] = st[k];
    }
    o.units = st.units.filter(u => !u.dead);
    o.animals = st.animals.filter(a => !a.dead);
    o.structs = st.structs.filter(s => !s.dead);
    o.usedNames = Array.from(this._usedNames);
    o.rng = this.rng.getState();
    o.version = VERSION;
    o.game = 'wuselwelt';
    o.rasters = {};
    for (const r of RASTERS) o.rasters[r[0]] = U().encodeArray(st[r[0]]);
    if (st.flur) o.rasters.flur = U().encodeArray(st.flur);
    if (WW.Industry) WW.Industry.save(st, o);   // [industry]
    return JSON.stringify(o, replacer);
  };
  Sim.prototype.hash = function () { return U().hashString(this.serialize()); };

  function load(str) {
    let o;
    try { o = typeof str === 'string' ? JSON.parse(str) : str; } catch (e) { return null; }
    if (!o || o.game !== 'wuselwelt' || !o.rasters || !(o.W > 0) || !(o.H > 0)) return null;
    if ((o.version | 0) > VERSION) return null;
    const N = o.W * o.H;
    const st = {};
    for (const k in o) if (k !== 'rasters' && k !== 'rng' && k !== 'game' && k !== 'version') st[k] = o[k];
    for (const r of RASTERS) st[r[0]] = U().decodeArray(o.rasters[r[0]] || '', r[1], N);
    if (o.rasters.flur) st.flur = U().decodeArray(o.rasters.flur, Int32Array, Math.ceil(o.W / 6) * Math.ceil(o.H / 6));
    if (WW.Industry) WW.Industry.load(st, o);   // [industry]
    if (!o.rasters.owner) st.owner.fill(-1);
    if (!o.rasters.structAt) st.structAt.fill(-1);
    if (!o.rasters.inRing) st.inRing.fill(-1);
    if (!o.rasters.grazed && st.graze) for (let i = 0; i < N; i++) st.grazed[i] = st.graze[i] >= 128 && WW.TERRAIN_LUT.fertile[st.terrain[i]] > 0 ? 1 : 0;
    defaults(st);
    const sim = new Sim(st, o.rng);
    WW.Growth.ensure(sim);
    // ältere Spielstände: Vorkommen deterministisch nachrüsten, Lager um neue Rohstoffe ergänzen
    if (!o.rasters.deposit) WW.Resources.generate(sim);
    for (const c of st.cities) WW.Cities.fillStock(c.stock);
    for (const k of st.kingdoms) if (k.stock) WW.Cities.fillStock(k.stock);
    return sim;
  }

  // fehlende Felder (ältere Spielstände) ergänzen
  function defaults(st) {
    st.units = st.units || []; st.animals = st.animals || []; st.structs = st.structs || [];
    st.cities = st.cities || []; st.kingdoms = st.kingdoms || []; st.events = st.events || [];
    st.laws = Object.assign({}, WW.LAW_DEFAULTS, st.laws || {});
    st.tick = st.tick | 0; st.year = st.year | 0; st.nextId = st.nextId || 1;
    st.pathVersion = st.pathVersion | 0; st.fireCount = st.fireCount | 0; st.markCount = st.markCount | 0;
    st.eventSeq = st.eventSeq | 0;
    st.plots = st.plots || [];
    // ältere Spielstände: Zentrum ohne Ausbaustufe = Regierungssitz, Häuser ohne Formvariante
    for (const s of st.structs) {
      if (s.type === 'center' && s.stage == null) { s.stage = 2; s.upgrading = false; }
      if (s.type === 'house' && s.variant == null) s.variant = (s.id * 2654435761 >>> 24) & 255;
    }
    st.worldName = st.worldName || 'Wuselwelt';
    if (WW.Wild) WW.Wild.defaults(st);   // [wild]
    if (WW.Industry) WW.Industry.defaults(st);   // [industry]
    if (WW.Military) WW.Military.defaults(st);   // [mil]
    if (WW.Naval) WW.Naval.defaults(st);   // [see] Schiffe, Häfen (alte Spielstände: leer)
    if (WW.Events) WW.Events.defaults(st);   // [events] mods, laws, Ereignis-Zustand
    WW.Culture.defaults(st);   // Kulturen nachrüsten (nach den Mods)
    WW.Garrison.defaults(st);   // Besatzung/Garnison nachrüsten (9.10)
  }

  // ---------------------------------------------------------------------------
  // Erzeugen
  // ---------------------------------------------------------------------------
  function makeWorld(opts) {
    if (opts.world && opts.world.terrain && opts.world.W > 0 && opts.world.H > 0) return opts.world;
    const wopts = Object.assign({}, opts.worldOpts || {}, { seed: opts.seed });
    if (opts.width > 0 && opts.height > 0) { wopts.w = opts.width | 0; wopts.h = opts.height | 0; }
    else if (opts.size) wopts.size = opts.size;
    if (WW.WorldGen && typeof WW.WorldGen.generate === 'function') {
      try { return WW.WorldGen.generate(wopts); } catch (e) { /* Rückfall unten */ }
    }
    return WW.SimWorld.generate({ seed: opts.seed, width: wopts.w || 144, height: wopts.h || 96 });
  }

  function create(opts) {
    opts = opts || {};
    const seed = opts.seed == null ? 1 : opts.seed;
    const world = makeWorld(Object.assign({}, opts, { seed: seed }));
    const W = world.W, H = world.H, N = W * H;
    const st = {
      seed: seed, W: W, H: H, tick: 0, year: 0, nextId: 1, worldName: world.name || 'Wuselwelt',
      terrain: new Uint8Array(N), variant: new Uint8Array(N), height: new Uint8Array(N),
      owner: new Int32Array(N).fill(-1), structAt: new Int32Array(N).fill(-1), fire: new Uint8Array(N),
      inRing: new Int32Array(N).fill(-1), mark: new Uint8Array(N), cleared: new Uint8Array(N), chops: new Uint8Array(N), deposit: new Uint8Array(N),
      structs: [], units: [], animals: [], cities: [], kingdoms: [], events: [],
      laws: Object.assign({}, WW.LAW_DEFAULTS, opts.laws || {}),
      pathVersion: 0, fireCount: 0, markCount: 0, eventSeq: 0, plots: []
    };
    const nT = WW.TERRAIN.length;
    for (let i = 0; i < N; i++) {
      const t = world.terrain[i];
      st.terrain[i] = t < nT ? t : WW.T.GRASS;
      st.variant[i] = world.variant ? world.variant[i] : (mix(i, 7) & 255);
      st.height[i] = world.height ? world.height[i] : heightFor(st.terrain[i]);
    }
    for (const k in st.laws) if (!(k in WW.LAW_DEFAULTS)) delete st.laws[k];
    if (WW.Wild) WW.Wild.defaults(st);   // [wild]
    if (WW.Industry) WW.Industry.defaults(st);   // [industry]
    if (WW.Military) WW.Military.defaults(st);   // [mil]
    if (WW.Naval) WW.Naval.defaults(st);   // [see]
    const sim = new Sim(st, null);
    WW.Growth.ensure(sim);
    WW.Resources.generate(sim);
    sim._startSpots = (world.startSpots || []).slice();

    // Startreiche
    let n = (opts.populate === true || opts.populate == null) ? 3 : (opts.populate === false ? 0 : (opts.populate | 0));
    n = Math.max(0, Math.min(8, n));
    if (n > 0) populate(sim, n, opts);
    if (opts.animals === false && st.wild) st.wild.off = true;   // [wild] keine Tierwelt: auch kein Einwandern
    if (opts.animals !== false) {
      const area = W * H;
      WW.Creatures.populate(sim, Math.round(area / 260), Math.round(area / 2600));
    }
    // ein Schritt Statistik, damit Abfragen sofort stimmen
    WW.Cities.stats(sim);
    WW.Cities.refreshAllLists(sim);
    if (WW.Events) WW.Events.defaults(st);   // [events]
    return sim;
  }

  // Startplätze: Weltgenerator-Plätze, Mindestabstand, sonst eigene Suche
  function pickStarts(sim, n) {
    const st = sim.state;
    const cand = sim._startSpots.slice();
    for (const c of WW.SimWorld.findStartSpots(st.terrain, st.W, st.H, 16)) cand.push(c);
    const out = [];
    const md = WW.CONFIG.CITY_MIN_DIST + 4;
    for (const pass of [md, WW.CONFIG.CITY_MIN_DIST, 14]) {
      for (const c of cand) {
        if (out.length >= n) break;
        let ok = true;
        for (const o of out) { const dx = o.x - c.x, dy = o.y - c.y; if (dx * dx + dy * dy < pass * pass) { ok = false; break; } }
        if (!ok) continue;
        // Platz suchen, an dem das Zentrum wirklich passt
        let spot = null;
        for (let r = 0; r <= 4 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (WW.Cities.canFoundAt(sim, c.x + dx, c.y + dy, 'human', 0)) spot = { x: c.x + dx, y: c.y + dy };
        }
        if (!spot) continue;
        for (const o of out) { const dx = o.x - spot.x, dy = o.y - spot.y; if (dx * dx + dy * dy < pass * pass) { ok = false; break; } }
        if (ok) out.push(spot);
      }
      if (out.length >= n) break;
    }
    return out;
  }

  function populate(sim, n, opts) {
    const spots = pickStarts(sim, n);
    const races = Array.isArray(opts.races) ? opts.races : null;
    const govs = Array.isArray(opts.govs) ? opts.govs : null;
    const usedGov = {};
    for (let i = 0; i < spots.length; i++) {
      let race = races && WW.RACES[races[i % races.length]] ? races[i % races.length] : null;
      if (!race) {
        // Volk passend zum Gelände
        const t = WW.TERRAIN[sim.state.terrain[spots[i].y * sim.state.W + spots[i].x]].key;
        const w = {};
        for (const rk of WW.RACE_KEYS) w[rk] = (rk === 'human' ? 2.2 : 1) + (WW.RACES[rk].favTerrain.indexOf(t) >= 0 ? 2 : 0);
        race = sim.rng.weighted(w);
      }
      let gov = govs && WW.GOVERNMENTS[govs[i % govs.length]] ? govs[i % govs.length] : null;
      if (!gov && opts.govs === 'mixed') {
        // verschiedene Regierungen, nach Volks-Vorlieben gewichtet
        const pref = Object.assign({}, WW.RACES[race].govPrefs);
        for (const g in usedGov) if (Object.keys(usedGov).length < 8) pref[g] = 0;
        gov = sim.rng.weighted(pref);
      }
      if (!gov) gov = 'tribe';   // Standard: Stamm, wählt ab Dorfgröße selbst
      usedGov[gov] = 1;
      const cul = Array.isArray(opts.cultures) && opts.cultures.length ? opts.cultures[i % opts.cultures.length] : null;
      foundKingdom(sim, spots[i].x, spots[i].y, 6, gov, race, false, cul);
    }
  }

  // Neues Reich mit Stadt und Siedlern
  function foundKingdom(sim, x, y, count, gov, race, locked, culture) {
    const st = sim.state;
    const cul = WW.Culture.valid(culture) ? culture : WW.Culture.pick(sim, x, y, race);
    const name = WW.Names.place(cul, sim.rng, WW.TERRAIN[st.terrain[y * st.W + x]].key, sim._usedNames);
    const k = WW.Gov.createKingdom(sim, { race: race, gov: gov, baseName: name, locked: locked, culture: cul });
    const city = WW.Cities.found(sim, x, y, k.id, race, name, cul);
    if (!city) { WW.Gov.removeKingdom(sim, k, true); return null; }
    const ss = WW.CONFIG.START_STOCK;
    city.stock = WW.Cities.fillStock({ food: ss.food, wood: ss.wood, stone: ss.stone, gold: ss.gold });
    if (WW.GOVERNMENTS[k.gov].sharedStock) k.stock = WW.Cities.fillStock({ food: ss.food, wood: ss.wood, stone: ss.stone, gold: 0 });
    spawnPeople(sim, city, x + 0.5, y + 0.5, count, race, cul);
    WW.Cities.stats(sim);
    WW.Gov.appointLeader(sim, k);
    sim.event('found', { city: city.name, kingdom: k.name, n: count, gov: WW.GOVERNMENTS[k.gov].name }, WW.Cities.atCity(city));
    return { kingdomId: k.id, cityId: city.id };
  }

  function spawnPeople(sim, city, x, y, count, race, culture) {
    const st = sim.state, W = st.W;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const fx = Math.floor(x + sim.rng.range(-1.5, 1.5)), fy = Math.floor(y + sim.rng.range(-1.5, 1.5));
      let t = fy * W + fx;
      if (fx < 0 || fy < 0 || fx >= W || fy >= st.H || !WW.Path.passable(sim, t, city.kingdomId)) t = WW.Path.nearestFree(sim, WW.Cities.centerTile(sim, city, i), city.kingdomId, 6);
      if (t < 0) continue;
      const u = WW.Units.create(sim, {
        x: (t % W) + 0.5, y: Math.floor(t / W) + 0.5, role: 'farmer', kingdomId: city.kingdomId, cityId: city.id,
        race: race || city.race, culture: culture, age: WW.CONFIG.ADULT_AGE + 4 + sim.rng.int(16)
      });
      if (u) n++;
    }
    return n;
  }

  // ---------------------------------------------------------------------------
  // Gotteshandlungen
  // ---------------------------------------------------------------------------
  function makeActions(sim) {
    const isNum = (v) => U().isNum(v);
    const inMap = (x, y) => isNum(x) && isNum(y) && x >= 0 && y >= 0 && x < sim.state.W && y < sim.state.H;
    function safe(fn) {
      return function () {
        try { return fn.apply(null, arguments); } catch (e) {
          if (sim._throwErrors) throw e;
          sim._lastError = e;
          return null;
        }
      };
    }

    function paintTerrain(x, y, radius, terrainId) {
      if (!inMap(x, y)) return false;
      terrainId = terrainId | 0;
      if (!(terrainId >= 0 && terrainId < WW.TERRAIN.length)) return false;
      const st = sim.state, W = st.W, H = st.H;
      let r = isNum(radius) ? Math.max(1, Math.min(12, Math.floor(radius))) : 1;
      const cx = Math.floor(x), cy = Math.floor(y);
      const lim = (r - 1) * (r - 1) + (r - 1);
      const LUT = WW.TERRAIN_LUT;
      let changed = 0;
      for (let dy = -r + 1; dy <= r - 1; dy++) for (let dx = -r + 1; dx <= r - 1; dx++) {
        if (dx * dx + dy * dy > lim) continue;
        const xx = cx + dx, yy = cy + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const i = yy * W + xx;
        if (st.terrain[i] === terrainId) continue;
        st.terrain[i] = terrainId;
        st.height[i] = heightFor(terrainId);
        changed++;
        sim.markDirty(i);
        if (LUT.water[terrainId]) WW.Env.extinguish(sim, i);
        const s = sim._structs.get(st.structAt[i]);
        if (s) {
          const c = sim._cities.get(s.cityId);
          const race = c ? c.race : 'human';
          if (WW.Structs.isWallish(s)) { if (LUT.walk[terrainId] <= 0) WW.Structs.remove(sim, s); }
          else if (s.type === 'field') { if (LUT.fertile[terrainId] <= 0 || !WW.Structs.terrainBuildable(sim, i, race)) WW.Structs.remove(sim, s); }
          else if (s.type === 'ruin') { if (LUT.walk[terrainId] <= 0) WW.Structs.remove(sim, s); }
          else if (!WW.Structs.terrainBuildable(sim, i, race)) {
            if (s.type === 'center') WW.Structs.remove(sim, s); else WW.Structs.destroy(sim, s);
          }
        }
        if (st.mark[i] && LUT.water[terrainId]) WW.Env.setMark(sim, i, 0);
      }
      if (changed) { sim.terrainChanged(); WW.Cities.refreshAllLists(sim); }
      if (changed && WW.Wild && WW.Wild.rescueArea) WW.Wild.rescueArea(sim, cx, cy, r);   // [mil] Leute/Tiere auf frisch gemaltem Wasser/Lava sofort retten
      return changed > 0;
    }

    function spawnSettlers(x, y, count, govKey, raceKey, cultureKey) {
      if (!inMap(x, y)) return null;
      const st = sim.state, W = st.W;
      count = isNum(count) ? Math.max(1, Math.min(30, Math.floor(count))) : 6;
      const gov = WW.GOVERNMENTS[govKey] ? govKey : null;
      const race = WW.RACES[raceKey] ? raceKey : 'human';
      const cul = WW.Culture.valid(cultureKey) ? cultureKey : null;   // ohne Angabe: nach Volk + Gelände
      const tx = Math.floor(x), ty = Math.floor(y), i = ty * W + tx;
      // in bestehendem Gebiet: der Stadt anschließen
      let city = sim._cities.get(st.inRing[i]) || sim._cities.get(st.owner[i]);
      if (!city) {
        const md = WW.CONFIG.PLAYER_CITY_MIN_DIST;
        let spot = null;
        for (let r = 0; r <= 5 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (WW.Cities.canFoundAt(sim, tx + dx, ty + dy, race, md)) spot = { x: tx + dx, y: ty + dy };
        }
        if (spot) {
          if (sim._compDirty) WW.Path.updateComponents(sim);
          const res = foundKingdom(sim, spot.x, spot.y, count, gov, race, !!(gov && gov !== 'tribe'), cul);
          if (res) WW.Cities.refreshAllLists(sim);
          return res;
        }
        // zu nah an einer Stadt: dort anschließen
        let bd = 18 * 18;
        for (const c of st.cities) { const d = (c.cx - tx) * (c.cx - tx) + (c.cy - ty) * (c.cy - ty); if (d < bd) { bd = d; city = c; } }
        if (!city) return null;
      }
      if (WW.TERRAIN_LUT.walk[st.terrain[i]] <= 0) { x = city.cx + 0.5; y = city.cy + 0.5; }
      const n = spawnPeople(sim, city, x, y, count, race, cul);
      if (!n) return null;
      sim.event('joinCity', { city: city.name, n: n }, WW.Cities.atCity(city));
      return { kingdomId: city.kingdomId, cityId: city.id };
    }

    function spawnAnimal(x, y, kind) {
      if (!inMap(x, y) || !WW.CREATURES[kind]) return null;
      const a = WW.Creatures.spawn(sim, kind, x, y, { byPlayer: true });   // [wild] vom Spieler gesetzt: ohne Schonregeln
      return a ? a.id : null;
    }

    function setGovernment(kingdomId, govKey, o) {
      const k = sim._kingdoms.get(kingdomId);
      if (!k || !WW.GOVERNMENTS[govKey]) return false;
      const lock = !(o && o.lock === false);
      if (k.gov === govKey) { k.govLocked = lock; return true; }
      return WW.Gov.applyGov(sim, k, govKey, { lock: lock, reason: 'govSet' });
    }

    function setGovLocked(kingdomId, v) {
      const k = sim._kingdoms.get(kingdomId);
      if (!k) return false;
      k.govLocked = !!v;
      return true;
    }

    function setRelation(a, b, status) {
      const ka = sim._kingdoms.get(a), kb = sim._kingdoms.get(b);
      if (!ka || !kb || ka === kb) return false;
      if (status !== 'war' && status !== 'peace' && status !== 'alliance') return false;
      const r = ka.relations[kb.id];
      if (!r) return false;
      // Vom Spieler erzwungener Krieg bleibt, bis ein Reich besiegt ist oder der Spieler Frieden stiftet.
      const force = () => { r.forced = true; const rb = kb.relations[ka.id]; if (rb) rb.forced = true; };
      if (status === 'war' && r.status === 'war') { force(); return true; }
      if (r.status === status) return true;
      if (status === 'war') { const ok = WW.Diplo.declareWar(sim, ka, kb, 'godWar'); if (ok) force(); return ok; }
      if (status === 'peace') return WW.Diplo.makePeace(sim, ka, kb, 'godPeace');
      return WW.Diplo.makeAlliance(sim, ka, kb, 'godAlliance');
    }

    function strike(x, y, kind, o) {   // [wild] o = { dx, dy } Ziehrichtung
      if (!inMap(x, y)) return false;
      return WW.Powers.strike(sim, x, y, kind, false, o);   // [wild]
    }

    function setLaw(key, value) {
      if (!(key in WW.LAW_DEFAULTS)) return false;
      sim.state.laws[key] = !!value;
      return true;
    }

    const acts = {   // [wild]
      paintTerrain: safe(paintTerrain), spawnSettlers: safe(spawnSettlers), spawnAnimal: safe(spawnAnimal),
      setGovernment: safe(setGovernment), setGovLocked: safe(setGovLocked), setRelation: safe(setRelation),
      strike: safe(strike), setLaw: safe(setLaw),
      setGarrison: safe(function (cityId, n) { return WW.Garrison.setGarrison(sim, cityId, n); })   // 9.10
    };
    if (WW.Events) {   // [events] Reichsgesetze
      acts.setRealmLaw = safe(function (kid, key, v, o) { return WW.Events.setRealmLaw(sim, kid, key, v, o); });   // [events]
      acts.setRealmLawLocked = safe(function (kid, key, v) { return WW.Events.setRealmLawLocked(sim, kid, key, v); });   // [events]
    }   // [events]
    if (WW.Wild) Object.assign(acts, WW.Wild.actions(sim, safe));   // [wild] grab, drop, held, aimAircraft, placeLair, spawnBandits
    if (WW.Military) Object.assign(acts, WW.Military.actions(sim, safe));   // [mil] placeVehicle, orderBattle
    if (WW.Naval) Object.assign(acts, WW.Naval.actions(sim, safe));   // [see] placeHarbor, placeShip
    return acts;   // [wild]
  }

  // ---------------------------------------------------------------------------
  // Abfragen
  // ---------------------------------------------------------------------------
  function makeQuery(sim) {
    const tile = (x, y) => {
      const st = sim.state;
      if (!U().isNum(x) || !U().isNum(y)) return -1;
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= st.W || y >= st.H) return -1;
      return y * st.W + x;
    };
    function cityAt(x, y) {
      const i = tile(x, y);
      if (i < 0) return null;
      const st = sim.state;
      return sim._cities.get(st.inRing[i]) || sim._cities.get(st.owner[i]) ||
        (function () { const s = sim._structs.get(st.structAt[i]); return s ? sim._cities.get(s.cityId) || null : null; })();
    }
    function kingdomAt(x, y) { const c = cityAt(x, y); return c ? sim._kingdoms.get(c.kingdomId) || null : null; }
    function unitNear(x, y, r) {
      if (!U().isNum(x) || !U().isNum(y)) return null;
      r = U().isNum(r) ? r : 1.5;
      let best = null, bd = r * r;
      for (const u of sim.state.units) {
        if (u.dead) continue;
        const dx = u.x - x, dy = u.y - y, d = dx * dx + dy * dy;
        if (d <= bd) { bd = d; best = u; }
      }
      return best;
    }
    function animalNear(x, y, r) {
      if (!U().isNum(x) || !U().isNum(y)) return null;
      r = U().isNum(r) ? r : 1.5;
      let best = null, bd = r * r;
      for (const a of sim.state.animals) {
        if (a.dead) continue;
        const dx = a.x - x, dy = a.y - y, d = dx * dx + dy * dy;
        if (d <= bd) { bd = d; best = a; }
      }
      return best;
    }
    function structAt(x, y) { const i = tile(x, y); return i < 0 ? null : sim._structs.get(sim.state.structAt[i]) || null; }
    function kingdomStats(id) {
      const k = sim._kingdoms.get(id);
      if (!k) return null;
      let pop = 0, soldiers = 0, happy = 0;
      for (const cid of k.cityIds) { const c = sim._cities.get(cid); if (c) { pop += c.pop; soldiers += (c.jobs.soldier || 0); happy += c.happiness * c.pop; } }
      return { pop: pop, cities: k.cityIds.length, soldiers: soldiers, happiness: pop ? happy / pop : 0, atWar: WW.Diplo.atWar(sim, id) };
    }
    function worldStats() {
      const st = sim.state;
      let pop = 0;
      for (const u of st.units) if (!u.dead) pop++;
      return { pop: pop, kingdoms: st.kingdoms.length, cities: st.cities.length, animals: st.animals.length, year: st.year };
    }
    return {
      cityAt: cityAt, kingdomAt: kingdomAt, unitNear: unitNear, animalNear: animalNear, structAt: structAt,
      city: (id) => sim._cities.get(id) || null, kingdom: (id) => sim._kingdoms.get(id) || null,
      unit: (id) => sim._units.get(id) || null, animal: (id) => sim._animals.get(id) || null,
      struct: (id) => sim._structs.get(id) || null, kingdomStats: kingdomStats, worldStats: worldStats
    };
  }

  WW.Sim = { create: create, load: load, VERSION: VERSION, heightFor: heightFor };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
