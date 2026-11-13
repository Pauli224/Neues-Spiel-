#!/usr/bin/env node
// Bereitet die App vor: baut das Spiel (tools/build.js im Repo-Stamm),
// legt dist/wuselwelt.html als app/game/index.html ab und erzeugt die Icons in app/build/.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP = __dirname;
const ROOT = path.join(APP, '..');

execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.js')], { cwd: ROOT, stdio: 'inherit' });

const src = path.join(ROOT, 'dist', 'wuselwelt.html');
if (!fs.existsSync(src)) throw new Error('Build fehlgeschlagen: ' + src + ' fehlt');
const gameDir = path.join(APP, 'game');
fs.rmSync(gameDir, { recursive: true, force: true });
fs.mkdirSync(gameDir, { recursive: true });
fs.copyFileSync(src, path.join(gameDir, 'index.html'));
console.log('app/game/index.html', (fs.statSync(src).size / 1024).toFixed(0) + ' KB');

require('./make-icon.js');
