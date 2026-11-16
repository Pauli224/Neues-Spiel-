#!/usr/bin/env node
// Verkleinert den JavaScript-Teil einer fertigen Einzeldatei (dist/artifact.html oder dist/wuselwelt.html).
// Aufruf: node tools/minify.js <eingabe.html> <ausgabe.html> [ordner-mit-node_modules]
// Braucht das Werkzeug „terser" (nur zum Bauen, nicht zum Spielen): z. B. in einem beliebigen Ordner
// `npm install terser` und diesen Ordner als drittes Argument angeben. Ohne terser bleibt der normale Bau gültig.
// Jede Quelldatei wird einzeln verkleinert (lokale Namen kürzen, Kommentare und Leerraum entfernen);
// Eigenschaftsnamen und alles am globalen Namensraum WW bleiben unverändert. Die eingebetteten Tonaufnahmen
// (audio-data.js) werden nicht angefasst.
'use strict';
const fs = require('fs');
const path = require('path');

const IN = process.argv[2], OUT = process.argv[3], MODS = process.argv[4];
if (!IN || !OUT) { console.error('Aufruf: node tools/minify.js <eingabe.html> <ausgabe.html> [ordner-mit-node_modules]'); process.exit(2); }
let terser;
try { terser = require(MODS ? require.resolve('terser', { paths: [path.resolve(MODS)] }) : 'terser'); }
catch (e) { console.error('terser nicht gefunden – bitte installieren und den Ordner als drittes Argument angeben.'); process.exit(2); }

(async () => {
  const html = fs.readFileSync(IN, 'utf8');
  // der letzte Inline-Skriptblock enthält alle Quelldateien, getrennt durch „/* pfad */"-Zeilen
  const open = html.lastIndexOf('<script>\n'), close = html.lastIndexOf('\n</script>');
  if (open < 0 || close < open) throw new Error('Skriptblock nicht gefunden');
  const js = html.slice(open + 9, close);
  const marks = []; const re = /^\/\* (js\/[^ ]+\.js) \*\/$/gm; let m;
  while ((m = re.exec(js))) marks.push({ file: m[1], at: m.index, end: m.index + m[0].length + 1 });
  if (!marks.length) throw new Error('keine Dateimarken gefunden');
  const out = []; let before = 0, after = 0, n = 0;
  for (let i = 0; i < marks.length; i++) {
    const src = js.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].at : js.length);
    before += src.length;
    if (/audio-data\.js$/.test(marks[i].file)) { out.push(src.trim()); after += src.length; continue; }   // Aufnahmen: nichts zu holen
    const r = await terser.minify(src, { compress: { passes: 1 }, mangle: true, format: { comments: false, inline_script: true } });
    if (r.error || typeof r.code !== 'string') throw new Error(marks[i].file + ': ' + (r.error || 'kein Ergebnis'));
    out.push(r.code); after += r.code.length; n++;
  }
  const res = html.slice(0, open + 9) + out.join('\n') + html.slice(close);
  fs.writeFileSync(OUT, res);
  console.log(path.basename(OUT) + ': ' + n + ' Dateien verkleinert, Skript ' + (before / 1024).toFixed(0) + ' KB -> ' + (after / 1024).toFixed(0) + ' KB, Datei ' +
    (html.length / 1024).toFixed(0) + ' KB -> ' + (res.length / 1024).toFixed(0) + ' KB');
})().catch((e) => { console.error('Verkleinern fehlgeschlagen: ' + e.message); process.exit(1); });
