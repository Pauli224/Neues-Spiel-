#!/usr/bin/env node
// Baut aus index.html zwei eigenständige Dateien (ohne Abhängigkeiten):
//   dist/wuselwelt.html  – vollständiges Dokument, alles inline (nur Google Fonts extern)
//   dist/artifact.html   – Fragment für ein Claude-Artifact (ohne doctype/html/head/body)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

// Zusatz-Skripte späterer Stufen: sobald die Datei existiert, in index.html nach ihrem Vorgänger eintragen
const OPTIONAL = [
  ['js/core/config-wild.js', 'js/core/config.js'],
  ['js/data/texts-wild.js', 'js/data/texts.js'],
  ['js/sim/growth.js', 'js/sim/diplo.js'],
  ['js/sim/wild.js', 'js/sim/creatures.js'],
  ['js/core/config-events.js', 'js/core/config.js'],
  ['js/data/events.js', 'js/data/texts.js'],
  ['js/sim/mods.js', 'js/sim/walls.js'],        // direkt vor cities.js
  ['js/sim/events.js', 'js/sim/powers.js']       // direkt vor sim.js
];
let html = read('index.html');
for (const [file, after] of OPTIONAL) {
  const tag = '<script src="' + file + '"></script>';
  if (!fs.existsSync(path.join(ROOT, file)) || html.includes(tag)) continue;
  const prev = '<script src="' + after + '"></script>';
  if (!html.includes(prev)) { console.warn('Vorgänger fehlt in index.html:', after); continue; }
  html = html.replace(prev, prev + '\n' + tag);
  fs.writeFileSync(path.join(ROOT, 'index.html'), html);
  console.log('index.html: ' + file + ' eingetragen');
}
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b, i + a.length); if (i < 0 || j < 0) throw new Error('Marke fehlt: ' + a); return s.slice(i + a.length, j); };

const fonts = between(html, '<!--FONTS-->', '<!--/FONTS-->').trim();
const scriptBlock = between(html, '<!--SCRIPTS-->', '<!--/SCRIPTS-->');
const srcs = Array.from(scriptBlock.matchAll(/<script src="([^"]+)"><\/script>/g)).map(m => m[1]);
if (!srcs.length) throw new Error('keine Skripte gefunden');
const css = read('css/style.css');
const bodyInner = between(html, '<body>', '</body>');
const markup = bodyInner.slice(0, bodyInner.indexOf('<!--SCRIPTS-->')).trim();
const title = (/<title>([^<]*)<\/title>/.exec(html) || [])[1] || 'Wuselwelt';

// Skripte inline; '</script' darf im Text nicht vorkommen
const js = srcs.map(f => '/* ' + f + ' */\n' + read(f).replace(/<\/script/gi, '<\\/script')).join('\n');
const scripts = '<script>\n' + js + '\n</script>';
const style = '<style>\n' + css + '\n</style>';

// Kopf-Metas des Originals ohne Verweise auf Dateien (Manifest, Icons, Stylesheet)
const head = between(html, '<head>', '</head>')
  .replace(/<!--FONTS-->[\s\S]*?<!--\/FONTS-->/, '')
  .split('\n')
  .filter(l => !/rel="(manifest|apple-touch-icon|icon|stylesheet)"/.test(l) && l.trim())
  .join('\n');

const single = '<!doctype html>\n<html lang="de">\n<head>\n' + head + '\n' + fonts + '\n' + style + '\n</head>\n<body>\n' + markup + '\n' + scripts + '\n</body>\n</html>\n';

const artifact = '<title>' + title + '</title>\n' +
  '<meta name="claude:viewport-fit-sides" content="cover">\n' +
  fonts + '\n' + style + '\n' + markup + '\n' + scripts + '\n';

// sw.js: Dateiliste und Version aus index.html nachführen (offline spielbar)
const swFiles = ['./', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'].concat(srcs);
const swPath = path.join(ROOT, 'sw.js');
if (fs.existsSync(swPath)) {
  let h = 2166136261 >>> 0;
  const all = html + css + js;
  for (let i = 0; i < all.length; i++) h = Math.imul(h ^ all.charCodeAt(i), 16777619) >>> 0;
  let sw = fs.readFileSync(swPath, 'utf8');
  sw = sw.replace(/const VERSION = '[^']*';/, "const VERSION = 'wuselwelt-" + h.toString(36) + "';")
    .replace(/const FILES = \[[\s\S]*?\];/, 'const FILES = [\n  ' + swFiles.map(f => "'" + f + "'").join(',\n  ') + '\n];');
  fs.writeFileSync(swPath, sw);
}

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'wuselwelt.html'), single);
fs.writeFileSync(path.join(DIST, 'artifact.html'), artifact);
const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(0) + ' KB';
console.log('dist/wuselwelt.html', kb(single));
console.log('dist/artifact.html ', kb(artifact), '(' + srcs.length + ' Skripte)');
