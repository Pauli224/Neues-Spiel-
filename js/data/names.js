// Namensgeneratoren: Orte, Personen (je Volk), Beinamen, Parteien, Gottheiten, Planziele.
// Bewusst keine Vornamen realer Diktatoren.
(function (WW) { 'use strict';

  const TOWN = {
    human: {
      pre: ['Brösel', 'Quark', 'Wurst', 'Knödel', 'Schnarch', 'Gurken', 'Zipfel', 'Dackel', 'Rüben', 'Pudding',
        'Kringel', 'Mops', 'Strudel', 'Krümel', 'Brezel', 'Zwiebel', 'Senf', 'Kohl', 'Lauch', 'Hummel',
        'Socken', 'Wackel', 'Plunder', 'Bummel', 'Schmalz', 'Grummel', 'Klecks', 'Pantoffel', 'Schnitzel', 'Kuchen'],
      suf: ['burg', 'hausen', 'ingen', 'heim', 'dorf', 'furt', 'bach', 'au', 'stedt', 'rode', 'berg', 'feld',
        'hofen', 'brück', 'kirchen', 'winkel', 'büttel', 'lingen']
    },
    elf: {
      pre: ['Silber', 'Mond', 'Tau', 'Farn', 'Glimmer', 'Blüten', 'Morgen', 'Nebel', 'Sternen', 'Moos', 'Flüster',
        'Schimmer', 'Lichter', 'Laub', 'Harfen', 'Perlen'],
      suf: ['hain', 'tal', 'glanz', 'wipfel', 'lichtung', 'quell', 'au', 'wald', 'schimmer', 'grund']
    },
    dwarf: {
      pre: ['Granit', 'Bart', 'Hammer', 'Amboss', 'Kiesel', 'Eisen', 'Knorr', 'Grummel', 'Stollen', 'Schotter',
        'Klotz', 'Brumm', 'Basalt', 'Meißel', 'Zinn'],
      suf: ['grube', 'stollen', 'fels', 'berg', 'halle', 'schacht', 'horst', 'zinne', 'eck', 'tiefen']
    },
    orc: {
      pre: ['Krach', 'Grunz', 'Knorz', 'Matsch', 'Rumpel', 'Schlag', 'Brüll', 'Stampf', 'Wumms', 'Knack', 'Zack',
        'Rabatz', 'Krawall', 'Knüppel'],
      suf: ['lager', 'hort', 'grube', 'nest', 'kral', 'schlucht', 'bruch', 'gart', 'feste']
    },
    gnome: {
      pre: ['Wusel', 'Pimpel', 'Fitzel', 'Kribbel', 'Huschel', 'Krümel', 'Puschel', 'Zwitscher', 'Bimmel',
        'Kuller', 'Flitz', 'Wichtel', 'Knopf', 'Fingerhut'],
      suf: ['winkel', 'nest', 'hügelchen', 'stübchen', 'eck', 'kämmerchen', 'häuschen', 'ritze', 'loch', 'hausen']
    },
    frog: {
      pre: ['Quak', 'Glibber', 'Matsch', 'Platsch', 'Schilf', 'Tümpel', 'Seerosen', 'Hüpf', 'Moder', 'Pfützen',
        'Blubber', 'Kaulquapp', 'Entengrütz'],
      suf: ['pfuhl', 'tümpel', 'moor', 'ried', 'teich', 'sumpf', 'ufer', 'see', 'graben', 'au']
    }
  };

  const PEOPLE = {
    human: {
      m: ['Otto', 'Horst', 'Kunibert', 'Detlef', 'Heinz', 'Egon', 'Gustav', 'Ewald', 'Bodo', 'Waldemar', 'Fritz',
        'Erwin', 'Rüdiger', 'Herbert', 'Wilfried', 'Gerd', 'Klaus', 'Dieter', 'Hartmut', 'Eberhard', 'Ottokar',
        'Lothar', 'Manfred', 'Knut', 'Alfons', 'Theobald', 'Balduin', 'Hubert', 'Winfried', 'Ingo', 'Guido',
        'Willi', 'Norbert', 'Reinhold', 'Volker', 'Jürgen', 'Achim', 'Udo', 'Günther', 'Kurt', 'Helmut'],
      f: ['Uschi', 'Gudrun', 'Brunhilde', 'Waltraud', 'Gisela', 'Hildegard', 'Erna', 'Irmgard', 'Helga', 'Ilse',
        'Gertrud', 'Elfriede', 'Roswitha', 'Lieselotte', 'Hannelore', 'Dörte', 'Edeltraud', 'Ottilie', 'Mechthild',
        'Adelheid', 'Wilhelmine', 'Frieda', 'Berta', 'Kunigunde', 'Rosi', 'Heidi', 'Marlies', 'Trude', 'Annegret',
        'Inge', 'Hertha', 'Erika', 'Margot', 'Renate', 'Gabi', 'Sieglinde', 'Rotraut']
    },
    elf: {
      m: ['Silvanus', 'Florian', 'Ambrosius', 'Lindor', 'Thaliel', 'Elwin', 'Faramund', 'Aurelius', 'Celestin',
        'Mirandel', 'Ilvar', 'Cassian', 'Fenwir', 'Lysander'],
      f: ['Lindwen', 'Aurelie', 'Sylvana', 'Mirabell', 'Elowen', 'Isadora', 'Thalia', 'Liliane', 'Eleonora',
        'Celestine', 'Florentine', 'Ariane', 'Melisande']
    },
    dwarf: {
      m: ['Brumbart', 'Gorrim', 'Thorbald', 'Krummbart', 'Bodrik', 'Grimbold', 'Hjalmar', 'Barnabas', 'Rumpold',
        'Kasimir', 'Ottfried', 'Gottlob', 'Balthasar', 'Rasmus'],
      f: ['Bertrun', 'Hilde', 'Grimhild', 'Brunna', 'Thora', 'Dagmar', 'Gunhild', 'Ragnhild', 'Kriemhild',
        'Walburga', 'Hedwig']
    },
    orc: {
      m: ['Grunzbert', 'Krakko', 'Ugbert', 'Brakk', 'Murr', 'Gorbo', 'Skrapp', 'Knurz', 'Zogg', 'Hrumpf', 'Bulk', 'Gnarzl'],
      f: ['Grunhilde', 'Krakka', 'Ugga', 'Morga', 'Zagga', 'Brumma', 'Snarla', 'Hurtza', 'Rumpa']
    },
    gnome: {
      m: ['Pips', 'Tüddel', 'Fitzli', 'Knöpfchen', 'Wuschel', 'Pimpi', 'Schnuffi', 'Bommel', 'Zippo', 'Fipsi', 'Tobbel'],
      f: ['Pippa', 'Tilli', 'Fussel', 'Kitzel', 'Mimi', 'Lotti', 'Bibi', 'Pünktchen', 'Zuzu', 'Hummelchen', 'Flocke']
    },
    frog: {
      m: ['Quakbert', 'Hüpfried', 'Glibbo', 'Platschke', 'Schlabbo', 'Kwakus', 'Froschbert', 'Tümpelhard', 'Lurchwig'],
      f: ['Quakline', 'Hüpfrieda', 'Glibberine', 'Seerosa', 'Platschina', 'Kwaka', 'Lurchilde', 'Teichtraud']
    }
  };

  // schwache Adjektivform, passt hinter „der“ und „die“
  const EPITHETS = ['Verschlafene', 'Ungeduldige', 'Gemütliche', 'Zerstreute', 'Pünktliche', 'Kühne', 'Brummige',
    'Vergessliche', 'Schnarchende', 'Unbeirrbare', 'Wackere', 'Hungrige', 'Sparsame', 'Großzügige', 'Laute',
    'Leise', 'Rastlose', 'Kitzlige', 'Neugierige', 'Schusselige', 'Gründliche', 'Prächtige', 'Mittelmäßige',
    'Bescheidene', 'Erstaunliche', 'Pingelige', 'Sanftmütige', 'Übereifrige', 'Umständliche', 'Zögerliche',
    'Wankelmütige', 'Unermüdliche', 'Gutgelaunte', 'Missmutige', 'Tollkühne', 'Ahnungslose', 'Kurzsichtige',
    'Weitsichtige', 'Unpünktliche', 'Fröhliche', 'Kleinliche', 'Bärtige', 'Gestiefelte', 'Ewig Müde',
    'Schlecht Gelaunte', 'Überraschend Kompetente', 'Wohlgenährte', 'Gähnende', 'Geschwätzige'];

  // Parteien mit Bonus für die Amtszeit
  const PARTIES = {
    bread: ['Partei für mehr Brot', 'Bund der Brotfreunde', 'Krustenpartei', 'Liga der vollen Teller', 'Die Belegten Brötchen'],
    walls: ['Mauerfreunde e. V.', 'Partei der dicken Wände', 'Liga für hohe Zäune', 'Bund der Ziegelzähler'],
    nap: ['Partei für längeren Mittagsschlaf', 'Union der Gemütlichen', 'Die Kissenfraktion', 'Bund der Hängematte'],
    trade: ['Handelsliga', 'Partei des freien Kuchenmarkts', 'Bund der Feilscher', 'Die Kleingeld-Koalition'],
    safety: ['Partei für Ordnung im Vorgarten', 'Wachsame Bürger', 'Allianz gegen Wölfe', 'Bund der Laternenputzer']
  };
  const PARTY_BONUS_NAMES = {
    bread: 'mehr Nahrung', walls: 'schnellerer Mauerbau', nap: 'bessere Laune', trade: 'mehr Gold', safety: 'mehr Wachen'
  };
  const REGIME_PARTIES = ['Partei der Strammen Ordnung', 'Bund für Pünktlichkeit und Gehorsam', 'Allianz der Stillstehenden',
    'Vereinigung der Gleichgekämmten', 'Ordnungsfreunde des Vaterhauses'];

  const DEITIES = ['Der Große Knödel', 'Die Heilige Brezel', 'Der Ewige Kohlkopf', 'Die Allwissende Gans',
    'Der Gütige Pudding', 'Die Erhabene Socke', 'Der Donnernde Dackel', 'Die Himmlische Rübe',
    'Der Schweigende Kürbis', 'Die Gesegnete Teekanne', 'Der Allmächtige Pfannkuchen', 'Die Leuchtende Gurke'];

  // Fünfjahresplan: Schwerpunkt -> absurde Planziele
  const PLAN_FOCUS = ['food', 'wood', 'stone', 'build'];
  const PLAN_FOCUS_NAMES = { food: 'Nahrung', wood: 'Holz', stone: 'Stein', build: 'Bauwesen' };
  const PLAN_GOALS = {
    food: ['300 % mehr Rüben', 'eine Kartoffel pro Kopf und Stunde', 'Brot in vier genormten Längen',
      'genug Kohl für drei Winter und einen Sommer', 'Suppe, die aus der Ferne sichtbar dampft'],
    wood: ['Bretter für die nächsten 400 Jahre', 'einen Holzstapel bis zum Mond', 'doppelt so viele Zahnstocher wie Einwohner',
      'einen Baumstamm pro Bürger und Feiertag'],
    stone: ['Steine in Herzform', 'einen Kieselberg, den man vom Nachbarreich aus sieht',
      'Pflastersteine für eine Straße, die noch niemand geplant hat', '12 % rundere Steine'],
    build: ['eine Million Dachziegel', 'ein Haus für jede Katze', 'Gerüste, die schneller wachsen als der Wald',
      'Türen in Einheitsgröße für alle Häuser, auch die zu kleinen']
  };

  function pick(rng, arr) { return arr[rng.int(arr.length)]; }

  WW.Names = {
    EPITHETS: EPITHETS, PARTIES: PARTIES, PARTY_BONUS_NAMES: PARTY_BONUS_NAMES, DEITIES: DEITIES,
    PLAN_FOCUS: PLAN_FOCUS, PLAN_FOCUS_NAMES: PLAN_FOCUS_NAMES,

    // Ortsname; used = Set bereits vergebener Namen (optional)
    town: function (rng, race, used) {
      const t = TOWN[race] || TOWN.human;
      for (let i = 0; i < 30; i++) {
        let p = pick(rng, t.pre), s = pick(rng, t.suf);
        // doppelte Buchstaben am Übergang vermeiden (Senfffurt)
        if (p[p.length - 1] === s[0]) s = pick(rng, t.suf);
        const n = p + s;
        if (!used || !used.has(n)) { if (used) used.add(n); return n; }
      }
      const n = pick(rng, t.pre) + pick(rng, t.suf) + ' ' + (2 + rng.int(8));
      if (used) used.add(n);
      return n;
    },
    person: function (rng, race, female) {
      const p = PEOPLE[race] || PEOPLE.human;
      return pick(rng, female ? p.f : p.m);
    },
    epithet: function (rng) { return pick(rng, EPITHETS); },
    party: function (rng, bonus) { return pick(rng, PARTIES[bonus] || PARTIES.bread); },
    regimeParty: function (rng) { return pick(rng, REGIME_PARTIES); },
    deity: function (rng) { return pick(rng, DEITIES); },
    planGoal: function (rng, focus) { return pick(rng, PLAN_GOALS[focus] || PLAN_GOALS.food); },
    // Reichsname aus Grundname und Regierung („Königreich Quarkhausen“)
    realm: function (baseName, gov) {
      const g = WW.GOVERNMENTS && WW.GOVERNMENTS[gov];
      return (g ? g.realm + ' ' : '') + baseName;
    }
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
