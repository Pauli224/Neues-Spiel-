// Namensgeneratoren: Orte und Personen (je Kultur bzw. Volk), Reichsnamen und Titel (je Regierung und Kultur),
// Beinamen, Parteien, Gottheiten, Planziele. Ortsnamen ernst und passend; Humor bleibt in den Chronik-Texten.
// Bewusst keine Vornamen realer Diktatoren.
(function (WW) { 'use strict';

  const TOWN = {
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
      m: ['Konrad', 'Albrecht', 'Heinrich', 'Friedrich', 'Otto', 'Gustav', 'Lothar', 'Ludwig', 'Bernhard', 'Gottfried',
        'Ulrich', 'Wolfram', 'Dietrich', 'Hartmut', 'Eberhard', 'Ottokar', 'Leopold', 'Rupert', 'Siegfried', 'Walther',
        'Arnold', 'Burkhard', 'Gerhard', 'Hermann', 'Kaspar', 'Matthias', 'Johann', 'Wilhelm', 'Theobald', 'Balduin',
        'Hubert', 'Reinhold', 'Anselm', 'Benedikt', 'Clemens', 'Egbert', 'Folkmar', 'Gunther', 'Hagen', 'Ingolf',
        'Jakob', 'Lorenz', 'Magnus', 'Notker', 'Oswin', 'Roland', 'Sebald', 'Tankred', 'Volkmar', 'Wendelin', 'Richard', 'Engelbert'],
      f: ['Adelheid', 'Mechthild', 'Hildegard', 'Gertrud', 'Kunigunde', 'Mathilde', 'Agnes', 'Elisabeth', 'Hedwig', 'Irmgard',
        'Gisela', 'Richardis', 'Walburga', 'Ottilie', 'Brigitta', 'Katharina', 'Margarethe', 'Sophia', 'Ida', 'Berta',
        'Frieda', 'Liutgard', 'Gerlinde', 'Rosamunde', 'Wiltrud', 'Imma', 'Judith', 'Klara', 'Luise', 'Theresa',
        'Ursula', 'Veronika', 'Regina', 'Juliane', 'Helene', 'Adela', 'Benedikta', 'Christiane', 'Dorothea', 'Elsbeth']
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
  const EPITHETS = ['Kühne', 'Gerechte', 'Weise', 'Strenge', 'Milde', 'Große', 'Fromme', 'Tapfere', 'Junge', 'Alte',
    'Stille', 'Kluge', 'Sparsame', 'Prächtige', 'Bescheidene', 'Unermüdliche', 'Wachsame', 'Gütige', 'Standhafte', 'Gelehrte',
    'Geduldige', 'Ruhmreiche', 'Beharrliche', 'Großzügige', 'Ernste', 'Heitere', 'Umsichtige', 'Unbeugsame', 'Treue',
    'Friedfertige', 'Ehrgeizige', 'Rastlose', 'Besonnene', 'Redliche', 'Furchtlose', 'Weitsichtige', 'Freigebige', 'Zornige',
    'Vorsichtige', 'Glückliche', 'Edle', 'Schweigsame', 'Aufrechte', 'Kundige'];

  // Parteien mit Bonus für die Amtszeit
  const PARTIES = {
    bread: ['Partei für mehr Brot', 'Bund der Brotfreunde', 'Krustenpartei', 'Liga der vollen Teller', 'Die Belegten Brötchen'],
    walls: ['Mauerfreunde e. V.', 'Partei der dicken Wände', 'Liga für hohe Zäune', 'Bund der Ziegelzähler'],
    nap: ['Partei für längeren Mittagsschlaf', 'Union der Gemütlichen', 'Die Kissenfraktion', 'Bund der Hängematte'],
    trade: ['Handelsliga', 'Partei des freien Kuchenmarkts', 'Bund der Feilscher', 'Die Kleingeld-Koalition'],
    safety: ['Partei für Ordnung im Vorgarten', 'Wachsame Bürger', 'Allianz gegen Wölfe', 'Bund der Laternenputzer'],
    green: ['Partei der Bäume', 'Bund der Baumumarmer', 'Die Moosgrünen', 'Liga für mehr Eichhörnchen']
  };
  const PARTY_BONUS_NAMES = {
    bread: 'mehr Nahrung', walls: 'schnellerer Mauerbau', nap: 'bessere Laune', trade: 'mehr Gold', safety: 'mehr Wachen', green: 'Naturschutz'
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


  // ---------------------------------------------------------------------------
  // Kulturen (Ausbau 9): ernsthafte, passende Namen. Wüstenkulturen erfunden und nur klanglich angelehnt
  // (Mande/Songhai/Hausa/Tamaschek bzw. Kusch/Altägypten), keine realen Herrscher, keine Verballhornung.
  // ---------------------------------------------------------------------------
  const PLACE = {
    mitte: {
      pre: ['Falken', 'Stein', 'Eichen', 'Linden', 'Birken', 'Erlen', 'Buchen', 'Wolfs', 'Hirsch', 'Adler', 'Raben', 'Kranich',
        'Otter', 'Biber', 'Dachs', 'Rosen', 'Heide', 'Mühl', 'Brunn', 'Kalten', 'Grün', 'Roten', 'Weißen', 'Schwarzen', 'Hohen',
        'Neu', 'Alten', 'Kreuz', 'Marien', 'Ulrichs', 'Wester', 'Oster', 'Ebers', 'Hasel', 'Tannen', 'Fichten', 'Weiden', 'Ahorn',
        'Ulmen', 'Espen', 'Bären', 'Fuchs', 'Löwen', 'Greifen', 'Schwanen', 'Lerchen', 'Finken', 'Habichts', 'Kronen', 'Lauen',
        'Sonnen', 'Mond', 'Kirch', 'Burg', 'Hallen', 'Lichten', 'Frauen', 'Herren', 'Königs', 'Dorn', 'Hagen', 'Wart', 'Schön'],
      suf: ['burg', 'au', 'furt', 'rode', 'berg', 'feld', 'hausen', 'heim', 'dorf', 'bach', 'stein', 'tal', 'hof', 'brück', 'wald',
        'hagen', 'stedt', 'ingen', 'born', 'brunn', 'hain', 'mark', 'beck', 'wedel', 'felde', 'see', 'eck', 'wiesen', 'grund', 'lohe'],
      biome: {
        hill: { pre: ['Berg', 'Fels', 'Hoh', 'Kling', 'Schroffen'], suf: ['berg', 'stein', 'fels', 'eck', 'kopf'] },
        forest: { pre: ['Tann', 'Holz', 'Moos', 'Forst'], suf: ['wald', 'rode', 'hain', 'hagen', 'holz'] },
        water: { pre: ['See', 'Wasser', 'Fischer', 'Ufer', 'Fähr'], suf: ['au', 'furt', 'brück', 'see', 'bach', 'werder'] }
      }
    },
    nord: {
      pre: ['Frost', 'Skjald', 'Hvit', 'Ulfs', 'Ravn', 'Is', 'Kald', 'Sten', 'Björn', 'Torv', 'Hald', 'Grim', 'Vind', 'Snö', 'Hav',
        'Ask', 'Eik', 'Fjell', 'Varg', 'Tors', 'Ragn', 'Sig', 'Hrafn', 'Ylv', 'Kol', 'Brim', 'Dyr', 'Lyng', 'Mjöd', 'Sval', 'Örn',
        'Elg', 'Bark', 'Tun', 'Hjal', 'Stor', 'Lang', 'Nord', 'Sol', 'Mån'],
      suf: ['vik', 'heim', 'fjord', 'holm', 'gard', 'berg', 'dal', 'nes', 'stad', 'by', 'havn', 'lund', 'rud', 'vang', 'sund',
        'strand', 'vall', 'borg', 'eid', 'skog', 'haug', 'fell', 'ö', 'mark'],
      biome: { water: { pre: ['Sjö', 'Bryg', 'Hav'], suf: ['vik', 'fjord', 'havn', 'sund', 'nes'] } }
    },
    sahel: {
      pre: ['Tom', 'Djen', 'Gao', 'Aga', 'Kan', 'Wala', 'Tim', 'Kou', 'Seg', 'Dia', 'Ban', 'San', 'Kir', 'Bou', 'Tad', 'Zin', 'Mar',
        'Tes', 'Yat', 'Ken', 'Sou', 'Mo', 'Kas', 'Bir', 'Dal', 'Gour', 'Ten', 'Tag', 'Inz', 'Taou', 'Ses', 'Kab', 'Nia', 'Dio',
        'Sar', 'Wag', 'Ham', 'Bil', 'Kat', 'Fa', 'Sik', 'Djou', 'Ka', 'Zara', 'Tel', 'Dou', 'Gan', 'Ar'],
      suf: ['bara', 'koro', 'mé', 'dem', 'kala', 'ssa', 'dougou', 'fara', 'wari', 'nkoro', 'sso', 'gué', 'bé', 'tenga', 'daga',
        'kaye', 'soni', 'kanda', 'tigui', 'masso', 'lé', 'bougou', 'ndé', 'oussa', 'zaf', 'ellen', 'amane', 'énès', 'ouma', 'ra'],
      biome: { desert: { pre: ['Tin', 'Ag', 'Tafa', 'In', 'Taz'], suf: ['ellen', 'amane', 'énès', 'zaf', 'rouft', 'adem'] } }
    },
    nil: {
      pre: ['Napa', 'Mero', 'Kerm', 'Nub', 'Sena', 'Djeb', 'Neb', 'Per', 'Shen', 'Wad', 'Sem', 'Hekat', 'Mer', 'Nekh', 'Keb', 'Tje',
        'Ka', 'Ama', 'Tan', 'Ase', 'Ari', 'Kas', 'Sab', 'Tef', 'Has', 'Men', 'Amar', 'Ikh', 'Ib', 'Ankh', 'Hor', 'Sat', 'Wer', 'Ta'],
      suf: ['kar', 'oeth', 'aat', 'ata', 'sut', 'uba', 'nef', 'ru', 'ab', 'et', 'em', 'khet', 'ira', 'ope', 'tep', 'esa', 'iru',
        'arit', 'ehet', 'asu', 'ime', 'oke', 'ennu', 'amet', 'ekh', 'anu'],
      biome: { river: { pre: ['Per', 'Iteru', 'Mer'], suf: ['ope', 'ennu', 'iru', 'uba'] } }
    }
  };
  // echte Ortsnamen, die der Baukasten zufällig treffen könnte: nicht vergeben
  const REAL_PLACES = new Set(['Djenné', 'Djenne', 'Gao', 'Timbuktu', 'Kano', 'Agadez', 'Niamey', 'Bamako', 'Ségou', 'Mopti', 'Kayes',
    'Sikasso', 'Tessalit', 'Kidal', 'Zinder', 'Katsina', 'Walata', 'Niani', 'Kangaba', 'Agadem', 'Kaya', 'Diafara', 'Kankan',
    'Napata', 'Meroe', 'Kerma', 'Kawa', 'Faras', 'Soba', 'Naqa', 'Dongola', 'Semna', 'Buhen', 'Nekhen', 'Amara', 'Sanam', 'Nuri',
    'Kurru', 'Tabo', 'Karnak', 'Theben', 'Abydos', 'Tanis', 'Saba', 'Merit', 'Hekataw',
    'Falkenau', 'Steinfurt', 'Lindenburg', 'Frostvik', 'Skjaldheim', 'Tombara', 'Djenkoro', 'Gaomé', 'Napakar', 'Meroeth', 'Kermaat']);
  // Die Beispiele aus dem Plan sind erlaubt (erfunden), echte Namen nicht:
  for (const ok of ['Falkenau', 'Steinfurt', 'Lindenburg', 'Frostvik', 'Skjaldheim', 'Tombara', 'Djenkoro', 'Gaomé', 'Napakar', 'Meroeth', 'Kermaat']) REAL_PLACES.delete(ok);

  const PERSON = {
    mitte: PEOPLE.human,
    nord: {
      m: ['Sigurd', 'Halvard', 'Torvald', 'Eirik', 'Bjarne', 'Leif', 'Gunnar', 'Ulfar', 'Sven', 'Arne', 'Halfdan', 'Ketil', 'Orm',
        'Steinar', 'Vidar', 'Einar', 'Hakon', 'Asger', 'Brand', 'Ivar', 'Kolbein', 'Sindre', 'Trygve', 'Yngvar', 'Ragnvald', 'Toke',
        'Grim', 'Hallstein', 'Ottar', 'Ulv'],
      f: ['Ingrid', 'Astrid', 'Sigrid', 'Gudrun', 'Ragnhild', 'Solveig', 'Thyra', 'Freydis', 'Helga', 'Hilde', 'Ylva', 'Runa',
        'Signe', 'Gunhild', 'Aslaug', 'Borghild', 'Eir', 'Ragna', 'Tove', 'Liv', 'Gyda', 'Sunniva', 'Torunn', 'Alfhild']
    },
    sahel: {
      m: ['Bakary', 'Seydou', 'Boubacar', 'Oumar', 'Issa', 'Amadou', 'Souleymane', 'Modibo', 'Daouda', 'Lassana', 'Fodé', 'Karamoko',
        'Tiémoko', 'Sidiki', 'Bourama', 'Yacouba', 'Alassane', 'Ibrahim', 'Moussa', 'Abdoulaye', 'Garba', 'Danladi', 'Ousmane',
        'Siaka', 'Dramane', 'Yero', 'Kandia', 'Akhamouk', 'Ghali', 'Intalla', 'Mahamane', 'Hamidou', 'Salif', 'Sékou'],
      f: ['Aminata', 'Fatoumata', 'Kadiatou', 'Mariam', 'Oumou', 'Awa', 'Sira', 'Nana', 'Hawa', 'Djeneba', 'Kankou', 'Sokona',
        'Assitan', 'Bintou', 'Tenin', 'Rokia', 'Salimata', 'Tafsut', 'Lalla', 'Zeinabou', 'Hadiza', 'Aïcha', 'Halima', 'Safiatou',
        'Tilla', 'Takama', 'Mariama', 'Korotoumou']
    },
    nil: {
      m: ['Arkenu', 'Nebsenu', 'Tanwekh', 'Merkhet', 'Ashakar', 'Senkamani', 'Kasaqo', 'Ibeshor', 'Wadjenu', 'Amaketh', 'Ariyen',
        'Tefnakh', 'Nasekhen', 'Atakhe', 'Bekenu', 'Djehen', 'Hekanef', 'Ikhmeru', 'Kawaset', 'Menkhar', 'Panehsi', 'Sabaku',
        'Tjemehu', 'Weshptah', 'Yenakar', 'Harkhuf', 'Sekhemka'],
      f: ['Nesatet', 'Amanikha', 'Tabiry', 'Henuttawy', 'Kheneret', 'Merytsen', 'Nasalsa', 'Pelekha', 'Shepenwet', 'Takahatenamun',
        'Tawosret', 'Ankhesen', 'Bekhetre', 'Iseret', 'Kasaqa', 'Merkha', 'Nebetah', 'Satnub', 'Tiye', 'Werethek', 'Abaleta']
    }
  };

  // Herrschertitel je Kultur (sonst aus WW.GOVERNMENTS[gov].titleM/F)
  const TITLES = {
    sahel: { monarchy: { m: 'Mansa', f: 'Mansa' }, tribe: { m: 'Ältester', f: 'Älteste' }, republic: { m: 'Handelsherr', f: 'Handelsherrin' } },
    nil: { monarchy: { m: 'Qore', f: 'Kandake' }, tribe: { m: 'Ältester', f: 'Älteste' } },
    nord: { monarchy: { m: 'Jarl', f: 'Jarlin' }, tribe: { m: 'Häuptling', f: 'Häuptlingin' } },
    dwarf: { monarchy: { m: 'Bergkönig', f: 'Bergkönigin' } },
    elf: { monarchy: { m: 'Hochkönig', f: 'Hochkönigin' } }
  };

  // Reichsformen je Regierung und Kultur; {X} = Stamm (Name der Hauptstadt bei der Gründung)
  const REALM = {
    tribe: { def: ['Stamm von {X}', 'Klan {X}'], nord: ['Sippe {X}', 'Klan {X}'], sahel: ['Volk von {X}', 'Ältestenrat von {X}'], nil: ['Stamm von {X}', 'Ältestenrat von {X}'] },
    monarchy: { def: ['Königreich {X}'], sahel: ['Mansa-Reich {X}'], nil: ['Reich von {X}'], nord: ['Jarltum {X}'], dwarf: ['Bergkönigreich {X}'], elf: ['Hochkönigreich {X}'] },
    democracy: { def: ['Republik {X}', 'Freistaat {X}'] },
    fascism: { def: ['Einheitsstaat {X}', 'Eisernes Reich {X}', 'Nationalstaat {X}'] },
    communism: { def: ['Volksrepublik {X}', 'Räteunion {X}', 'Arbeiterstaat {X}'] },
    theocracy: { def: ['Gottesstaat {X}', 'Heiliger Bund von {X}'] },
    republic: { def: ['Handelsbund {X}', 'Stadtrepublik {X}'], sahel: ['Handelsbund {X}', 'Karawanenbund {X}'] },
    anarchy: { def: ['Freie Kommune {X}'] }
  };
  // Vorsätze mit Geschlecht und gebeugten Formen (nach bestimmtem Artikel): für Chronik-Texte („im Eisernen Reich …“)
  const REALM_PRE = [
    ['Stamm von', 'm'], ['Klan', 'm'], ['Sippe', 'f'], ['Volk von', 'n'], ['Ältestenrat von', 'm'],
    ['Königreich', 'n'], ['Mansa-Reich', 'n'], ['Reich von', 'n'], ['Jarltum', 'n'], ['Bergkönigreich', 'n'], ['Hochkönigreich', 'n'],
    ['Republik', 'f'], ['Freistaat', 'm'], ['Einheitsstaat', 'm'], ['Eisernes Reich', 'n', 'Eiserne Reich', 'Eiserne Reich', 'Eisernen Reich'],
    ['Nationalstaat', 'm'], ['Volksrepublik', 'f'], ['Räteunion', 'f'], ['Arbeiterstaat', 'm'], ['Gottesstaat', 'm'],
    ['Heiliger Bund von', 'm', 'Heilige Bund von', 'Heiligen Bund von', 'Heiligen Bund von'], ['Handelsbund', 'm'], ['Stadtrepublik', 'f'],
    ['Karawanenbund', 'm'], ['Freie Kommune', 'f', 'Freie Kommune', 'Freie Kommune', 'Freien Kommune'],
    // ältere Spielstände
    ['Strammstaat', 'm'], ['Handelsrepublik', 'f']
  ].sort((a, b) => b[0].length - a[0].length);

  function hashPick(seed, salt, n) {
    let h = (Math.imul(seed | 0, 0x9e3779b1) + salt) | 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return n > 0 ? (h >>> 0) % n : 0;
  }
  function strSalt(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  function biomeGroup(b) {
    if (!b) return null;
    if (b === 'hill' || b === 'mountain' || b === 'snow') return 'hill';
    if (b === 'forest' || b === 'taiga' || b === 'jungle') return 'forest';
    if (b === 'river') return 'river';
    if (b === 'water' || b === 'shallow' || b === 'sand' || b === 'swamp') return 'water';
    if (b === 'desert') return 'desert';
    return b;
  }
  function isRng(o) { return o && typeof o === 'object' && typeof o.int === 'function'; }

  function pick(rng, arr) { return arr[rng.int(arr.length)]; }
  const U_ROM = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

  WW.Names = {
    EPITHETS: EPITHETS, PARTIES: PARTIES, PARTY_BONUS_NAMES: PARTY_BONUS_NAMES, DEITIES: DEITIES,
    PLAN_FOCUS: PLAN_FOCUS, PLAN_FOCUS_NAMES: PLAN_FOCUS_NAMES,

    // Ortsname alter Art (Volk); Menschen bekommen Namen der Kultur mitte. used = Set bereits vergebener Namen (optional)
    town: function (rng, race, used) {
      if (!TOWN[race]) return WW.Names.place('mitte', rng, null, used);
      const t = TOWN[race];
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
    // Ortsname je Kultur (Fantasievölker: deren eigener Stil); biomeKey = Geländeschlüssel am Ort (optional)
    place: function (culture, rng, biomeKey, used) {
      const t = PLACE[culture];
      if (!t) return WW.Names.town(rng, TOWN[culture] ? culture : 'gnome', used);
      const bg = biomeGroup(biomeKey);
      const bt = bg && t.biome ? (t.biome[bg] || (bg === 'river' ? t.biome.water : null)) : null;
      const usedPre = (pre) => { if (!used) return false; for (const n of used) if (n.indexOf(pre) === 0) return true; return false; };
      for (let i = 0; i < 40; i++) {
        const pp = bt && rng.next() < 0.35 ? bt.pre : t.pre;
        const ss = bt && rng.next() < 0.45 ? bt.suf : t.suf;
        const p = pick(rng, pp);
        let s = pick(rng, ss);
        const a = p[p.length - 1].toLowerCase(), b = s[0];
        if (a === b) continue;                                   // „Steinnfurt“
        if ('aeiouäöüé'.indexOf(a) >= 0 && 'aeiouäöüé'.indexOf(b) >= 0 && culture !== 'nil' && culture !== 'sahel') continue;
        if (culture === 'mitte' && p.endsWith('s') && s[0] === 's') continue;
        const n = p + s;
        if (REAL_PLACES.has(n)) continue;
        if (used && used.has(n)) continue;
        if (i < 24 && usedPre(p)) continue;                       // Abwechslung: Vorsilbe noch frei
        if (used) used.add(n);
        return n;
      }
      for (let k = 2; k < 40; k++) {
        const n = pick(rng, t.pre) + pick(rng, t.suf);
        const m = culture === 'mitte' ? (rng.next() < 0.5 ? 'Neu' : 'Ober') + n.toLowerCase() : n + ' ' + U_ROM[k % U_ROM.length];
        if (!used || !used.has(m)) { if (used) used.add(m); return m; }
      }
      return pick(rng, t.pre) + pick(rng, t.suf);
    },
    // Vorname: person(culture, rng, female) oder alt person(rng, race, female)
    person: function (a, b, female) {
      let culture, rng;
      if (isRng(a)) { rng = a; culture = b; } else { culture = a; rng = b; }
      const p = PERSON[culture] || PEOPLE[culture] || PEOPLE.human;
      return pick(rng, female ? p.f : p.m);
    },
    // Herrschertitel { m, f } je Regierung und Kultur
    title: function (govKey, culture) {
      const g = WW.GOVERNMENTS && (WW.GOVERNMENTS[govKey] || WW.GOVERNMENTS.tribe);
      const c = TITLES[culture] && TITLES[culture][govKey];
      if (c) return { m: c.m, f: c.f };
      return { m: g ? g.titleM : '', f: g ? g.titleF : '' };
    },
    epithet: function (rng) { return pick(rng, EPITHETS); },
    party: function (rng, bonus) { return pick(rng, PARTIES[bonus] || PARTIES.bread); },
    regimeParty: function (rng) { return pick(rng, REGIME_PARTIES); },
    deity: function (rng) { return pick(rng, DEITIES); },
    planGoal: function (rng, focus) { return pick(rng, PLAN_GOALS[focus] || PLAN_GOALS.food); },
    // Reichsname: realm(govKey, culture, stem, seed) – seed (Zahl, z. B. Reichs-ID) wählt die Form stabil.
    // Alt: realm(baseName, gov) -> erste Form der Regierung.
    realm: function (a, b, stem, seed) {
      let gov = a, culture = b;
      if (stem == null && WW.GOVERNMENTS && !WW.GOVERNMENTS[a] && WW.GOVERNMENTS[b]) { gov = b; culture = null; stem = a; seed = 0; }
      const R = REALM[gov] || REALM.tribe;
      const forms = (culture && R[culture]) || R.def || REALM.tribe.def;
      const sd = isRng(seed) ? seed.int(1 << 30) : (seed | 0);
      const f = forms[hashPick(sd, strSalt(gov), forms.length)];
      return f.replace('{X}', String(stem || 'Niemandsland'));
    },
    // Form eines Reichsnamens mit bestimmtem Artikel: cas 'nom'|'acc'|'dat'|'in' -> Text oder null (kein bekannter Vorsatz)
    realmArticle: function (name, cas) {
      name = String(name || '');
      for (const e of REALM_PRE) {
        if (name.indexOf(e[0] + ' ') !== 0) continue;
        const g = e[1], rest = name.slice(e[0].length);
        const form = cas === 'nom' ? (e[2] || e[0]) : cas === 'acc' ? (e[3] || e[0]) : (e[4] || e[0]);
        const art = cas === 'in' ? (g === 'f' ? 'in der' : 'im') : ({ nom: { m: 'der', n: 'das', f: 'die' }, acc: { m: 'den', n: 'das', f: 'die' }, dat: { m: 'dem', n: 'dem', f: 'der' } }[cas] || { m: 'der', n: 'das', f: 'die' })[g];
        return art + ' ' + form + rest;
      }
      return null;
    },
    REALM_FORMS: REALM, CULTURE_TITLES: TITLES
  };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
