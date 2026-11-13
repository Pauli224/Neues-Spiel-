// Lädt die Simulations-Skripte in Node (gleiche Reihenfolge wie index.html).
// Dateien des Wildnis-Teils werden mitgeladen, sofern vorhanden.
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const FILES = [
  'js/core/terrain.js', 'js/core/rng.js', 'js/core/config.js', 'js/core/config-events.js', 'js/core/config-wild.js',
  'js/data/names.js', 'js/data/texts.js', 'js/data/events.js', 'js/data/texts-wild.js',
  'js/sim/util.js', 'js/sim/world.js', 'js/sim/worldgen.js', 'js/sim/path.js', 'js/sim/structs.js',
  'js/sim/walls.js', 'js/sim/mods.js', 'js/sim/cities.js', 'js/sim/units.js', 'js/sim/gov.js', 'js/sim/diplo.js',
  'js/sim/growth.js', 'js/sim/creatures.js', 'js/sim/wild.js', 'js/sim/env.js', 'js/sim/powers.js', 'js/sim/events.js', 'js/sim/sim.js'
];
const OPTIONAL = { 'js/core/config-events.js': 1, 'js/data/events.js': 1, 'js/sim/mods.js': 1, 'js/sim/events.js': 1, 'js/core/config-wild.js': 1, 'js/data/texts-wild.js': 1, 'js/sim/wild.js': 1, 'js/sim/worldgen.js': 1 };
function load(opts) {
  for (const f of FILES) {
    if (opts && opts.noWorldGen && f.endsWith('worldgen.js')) continue;
    const p = path.join(ROOT, f);
    if (OPTIONAL[f] && !fs.existsSync(p)) continue;
    require(p);
  }
  return globalThis.WW;
}
module.exports = { load: load, FILES: FILES };
