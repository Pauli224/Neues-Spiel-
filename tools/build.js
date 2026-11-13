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
  ['js/sim/events.js', 'js/sim/powers.js'],      // direkt vor sim.js
  ['js/core/config-walls.js', 'js/core/config.js'],
  ['js/core/config-industry.js', 'js/core/config.js'],
  ['js/data/texts-industry.js', 'js/data/texts.js'],
  ['js/sim/industry.js', 'js/sim/cities.js']
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

// 3D und Ton: Block <!--R3--> … <!--/R3--> in index.html aus den vorhandenen Dateien neu aufbauen
// (three.js zuerst, dann render3d in fester Reihenfolge, dann audio). Fehlende Dateien: Block bleibt leer.
function listDir(dir) { try { return fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.js')).sort(); } catch (e) { return []; } }
// 3D-Ansicht ist gestoppt (Wunsch des Spielers): three.js und js/render3d werden nicht geladen.
const ENABLE_3D = false;
function r3Files() {
  const out = [];
  if (ENABLE_3D && fs.existsSync(path.join(ROOT, 'js/vendor/three.min.js')) && fs.existsSync(path.join(ROOT, 'js/render3d/core.js'))) {
    out.push('js/vendor/three.min.js');
    const r3 = listDir('js/render3d');
    const ORDER = ['core.js', 'terrain.js', 'flora.js'];
    for (const f of ORDER) if (r3.includes(f)) out.push('js/render3d/' + f);
    for (const f of r3) if (/^structs(-.*)?\.js$/.test(f) && f === 'structs.js') out.push('js/render3d/' + f);
    for (const f of r3) if (/^structs-.*\.js$/.test(f)) out.push('js/render3d/' + f);
    for (const f of ['units.js', 'fx.js']) if (r3.includes(f)) out.push('js/render3d/' + f);
    for (const f of r3) if (!out.includes('js/render3d/' + f)) out.push('js/render3d/' + f);
  }
  // Ton: Kern zuerst, dann Effekte, Umgebung, Musik, sonstige, die Schnittstelle (audio.js) zuletzt
  const au = listDir('js/audio');
  const rank = (f) => /core/.test(f) ? 0 : /sfx/.test(f) ? 1 : /ambient/.test(f) ? 2 : /music/.test(f) ? 3 : f === 'audio.js' ? 9 : 5;
  au.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  for (const f of au) out.push('js/audio/' + f);
  return out;
}
{
  const blk = '<!--R3-->\n' + r3Files().map(f => '<script src="' + f + '"></script>\n').join('') + '<!--/R3-->';
  const nh = html.replace(/<!--R3-->[\s\S]*?<!--\/R3-->/, blk);
  if (nh !== html) { html = nh; fs.writeFileSync(path.join(ROOT, 'index.html'), html); console.log('index.html: 3D/Ton-Block aktualisiert'); }
}

const fonts = between(html, '<!--FONTS-->', '<!--/FONTS-->').trim();
const scriptBlock = between(html, '<!--SCRIPTS-->', '<!--/SCRIPTS-->');
const srcs = Array.from(scriptBlock.matchAll(/<script src="([^"]+)"><\/script>/g)).map(m => m[1]);
if (!srcs.length) throw new Error('keine Skripte gefunden');
const css = read('css/style.css');
const bodyInner = between(html, '<body>', '</body>');
const markup = bodyInner.slice(0, bodyInner.indexOf('<!--SCRIPTS-->')).trim();
const title = (/<title>([^<]*)<\/title>/.exec(html) || [])[1] || 'Wuselwelt';

// Skripte inline; '</script' darf im Text nicht vorkommen
const inline = (list) => list.map(f => '/* ' + f + ' */\n' + read(f).replace(/<\/script/gi, '<\\/script')).join('\n');
const js = inline(srcs);
const scripts = '<script>\n' + js + '\n</script>';
// Artifact: three.js vom CDN (Artifact-Regel), Rest inline
const THREE_LOCAL = 'js/vendor/three.min.js';
const THREE_CDN = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>';
const artScripts = srcs.includes(THREE_LOCAL) ? THREE_CDN + '\n<script>\n' + inline(srcs.filter(f => f !== THREE_LOCAL)) + '\n</script>' : scripts;
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
  fonts + '\n' + style + '\n' + markup + '\n' + artScripts + '\n';

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
