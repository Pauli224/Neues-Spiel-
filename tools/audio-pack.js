#!/usr/bin/env node
// Wuselwelt – Klänge packen.
//   node tools/audio-pack.js            schreibt js/audio/audio-manifest.js (klein, immer laden) und
//                                       js/audio/audio-data.js (alle MP3 als Base64-Data-URI, für die Einzeldatei)
//   require('./audio-pack').build()     -> { manifestJs, dataJs, bytes, files }  (für tools/build.js; schreibt nichts)
// audio/manifest.json kommt aus der Aufbereitung (Quellen und Lizenzen: audio/QUELLEN.md).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUDIO = path.join(ROOT, 'audio');
const WRAP_A = "(function (WW) { 'use strict';\n";
const WRAP_B = "\n})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));\n";

function readManifest() {
  const m = JSON.parse(fs.readFileSync(path.join(AUDIO, 'manifest.json'), 'utf8'));
  const out = {};
  for (const k of Object.keys(m).sort()) out[k] = { kind: m[k].kind, dur: m[k].dur, ch: m[k].ch };
  return out;
}

function build(opts) {
  opts = opts || {};
  const man = readManifest();
  const manifestJs = '// Erzeugt von tools/audio-pack.js – nicht von Hand ändern.\n' + WRAP_A +
    '  WW.AudioManifest = ' + JSON.stringify(man, null, 0).replace(/\},"/g, '},\n    "') + ';' + WRAP_B;
  const parts = [];
  let bytes = 0;
  const files = [];
  for (const name of Object.keys(man)) {
    if (opts.skipMusic && man[name].kind === 'music') continue;
    const f = path.join(AUDIO, name + '.mp3');
    if (!fs.existsSync(f)) continue;
    const b = fs.readFileSync(f);
    bytes += b.length;
    files.push(name);
    parts.push('  D[' + JSON.stringify(name) + '] = "data:audio/mpeg;base64,' + b.toString('base64') + '";');
  }
  const dataJs = '// Erzeugt von tools/audio-pack.js – nicht von Hand ändern. Klänge: CC0, siehe audio/QUELLEN.md\n' + WRAP_A +
    '  const D = WW.AudioData = WW.AudioData || {};\n' + parts.join('\n') + WRAP_B;
  return { manifestJs, dataJs, bytes, files };
}

if (require.main === module) {
  const r = build({ skipMusic: process.argv.includes('--no-music') });
  fs.writeFileSync(path.join(ROOT, 'js/audio/audio-manifest.js'), r.manifestJs);
  fs.writeFileSync(path.join(ROOT, 'js/audio/audio-data.js'), r.dataJs);
  console.log('audio-manifest.js: ' + r.manifestJs.length + ' B, audio-data.js: ' + (r.dataJs.length / 1048576).toFixed(2) +
    ' MB (' + r.files.length + ' Klänge, MP3 ' + (r.bytes / 1048576).toFixed(2) + ' MB)');
}

module.exports = { build };
