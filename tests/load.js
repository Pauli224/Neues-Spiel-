// Lädt die Simulations-Skripte in Node (gleiche Reihenfolge wie index.html).
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = [
  'js/core/terrain.js', 'js/core/rng.js', 'js/core/config.js',
  'js/data/names.js', 'js/data/texts.js',
  'js/sim/util.js', 'js/sim/world.js', 'js/sim/worldgen.js', 'js/sim/path.js', 'js/sim/structs.js',
  'js/sim/walls.js', 'js/sim/cities.js', 'js/sim/units.js', 'js/sim/gov.js', 'js/sim/diplo.js',
  'js/sim/creatures.js', 'js/sim/env.js', 'js/sim/powers.js', 'js/sim/sim.js'
];
function load(opts) {
  for (const f of FILES) {
    if (opts && opts.noWorldGen && f.endsWith('worldgen.js')) continue;
    require(path.join(ROOT, f));
  }
  return globalThis.WW;
}
module.exports = { load: load, FILES: FILES };
