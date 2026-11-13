// =============================================================================
// Wuselwelt 3D – Ebene „units": Bewohner aller Völker, Berufe und Trachten, Tiere, Monster,
// Belagerungsgerät, Auswahlring, Lebensbalken, Sprechblasen, Göttliche Hand.
// Liest nur den Zustand. Alles instanziert: Körperteile sind Instanzen weniger InstancedMeshes
// (Würfel, Kugel, Kegel, Zylinder, Kegelstumpf) mit Farbe je Instanz; je Figur ein „Gerüst"
// (Knochen + Teile), das je Aussehen einmal gebaut und gecacht wird.
//
// Schnittstelle (zusätzlich zum Ebenen-Vertrag WW.R3.registerLayer):
//   WW.R3.Units.setSelection(sel)   sel = { kind: 'unit', obj, animal? } | null  (falls ctx.overlay fehlt)
//   WW.R3.Units.setHeld(h)          h = { obj, animal, x, y } | null              (Göttliche Hand; falls ctx.overlay fehlt)
//   WW.R3.Units.stats               { units, animals, parts, ms }
//   WW.R3.Units.headPos(id) -> {x,y,z} | null   (Kopfposition einer gezeichneten Einheit, für Effekte)
// Ladereihenfolge: nach js/render3d/core.js (registriert sich sonst in WW.R3._pending).
// =============================================================================
(function (WW) { 'use strict';

  const R3 = WW.R3 = WW.R3 || {};
  const PI = Math.PI, TAU = PI * 2;
  const sin = Math.sin, cos = Math.cos, abs = Math.abs;

  // ---------------------------------------------------------------- Matrizen (Float32Array, spaltenweise wie three)
  // o = T(p) * Ry * Rx * Rz * S
  function compose(o, oo, px, py, pz, rx, ry, rz, sx, sy, sz) {
    const cx = cos(rx), snx = sin(rx), cy = cos(ry), sny = sin(ry), cz = cos(rz), snz = sin(rz);
    o[oo] = (cy * cz + sny * snx * snz) * sx; o[oo + 1] = cx * snz * sx; o[oo + 2] = (-sny * cz + cy * snx * snz) * sx; o[oo + 3] = 0;
    o[oo + 4] = (-cy * snz + sny * snx * cz) * sy; o[oo + 5] = cx * cz * sy; o[oo + 6] = (sny * snz + cy * snx * cz) * sy; o[oo + 7] = 0;
    o[oo + 8] = sny * cx * sz; o[oo + 9] = -snx * sz; o[oo + 10] = cy * cx * sz; o[oo + 11] = 0;
    o[oo + 12] = px; o[oo + 13] = py; o[oo + 14] = pz; o[oo + 15] = 1;
  }
  // out = a * b (affin)
  function mul(a, ao, b, bo, o, oo) {
    const a0 = a[ao], a1 = a[ao + 1], a2 = a[ao + 2], a4 = a[ao + 4], a5 = a[ao + 5], a6 = a[ao + 6],
      a8 = a[ao + 8], a9 = a[ao + 9], a10 = a[ao + 10], a12 = a[ao + 12], a13 = a[ao + 13], a14 = a[ao + 14];
    for (let j = 0; j < 3; j++) {
      const b0 = b[bo + j * 4], b1 = b[bo + j * 4 + 1], b2 = b[bo + j * 4 + 2];
      o[oo + j * 4] = a0 * b0 + a4 * b1 + a8 * b2;
      o[oo + j * 4 + 1] = a1 * b0 + a5 * b1 + a9 * b2;
      o[oo + j * 4 + 2] = a2 * b0 + a6 * b1 + a10 * b2;
      o[oo + j * 4 + 3] = 0;
    }
    const b12 = b[bo + 12], b13 = b[bo + 13], b14 = b[bo + 14];
    o[oo + 12] = a0 * b12 + a4 * b13 + a8 * b14 + a12;
    o[oo + 13] = a1 * b12 + a5 * b13 + a9 * b14 + a13;
    o[oo + 14] = a2 * b12 + a6 * b13 + a10 * b14 + a14;
    o[oo + 15] = 1;
  }
  function hash(n, k) { let h = Math.imul((n | 0) ^ 0x2c1b3c6d, 2654435761) ^ Math.imul((k | 0) + 0x632be5ab, 0x85ebca6b); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; }
  function angLerp(a, b, k) { let d = b - a; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return a + d * k; }

  // ---------------------------------------------------------------- Farben
  let THREE = null, LINEAR = false;
  const colCache = new Map();
  function C(hex) {
    let c = colCache.get(hex);
    if (c) return c;
    const t = new THREE.Color(hex);
    if (LINEAR) t.convertSRGBToLinear();
    c = [t.r, t.g, t.b];
    colCache.set(hex, c);
    return c;
  }
  function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function shade(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  const PAL = {
    wood: '#7a5532', woodD: '#4e3520', woodL: '#a07447', metal: '#9aa0a8', metalD: '#5d636c', metalL: '#cdd2d8', gold: '#d6a12a', goldL: '#f2cf6a',
    white: '#ece8df', cream: '#e4d8bc', robe: '#ddd0b0', robeD: '#b9a983', denim: '#5a7aa3', denimD: '#3d5679', blue: '#3c5aa3', blueD: '#283c70',
    olive: '#6f6a44', oliveD: '#4d4a2f', grey: '#7a7d86', greyD: '#53565e', greyL: '#a4a7ad', brown: '#7d5534', brownD: '#55381f', brownL: '#a57a4e',
    fur: '#c4ad84', furD: '#94795a', furL: '#e3d3b0', ink: '#232428', red: '#b4302a', redD: '#7a1f1c', plum: '#3e2a40', pink: '#d9608f', purple: '#744aa0',
    leaf: '#4e8a36', leafL: '#7fb653', straw: '#d6bd6a', black: '#1c1b20', bone: '#e7e0cc', boneD: '#b8ae93', sand: '#d8c08a', yellow: '#e6c13a',
    teal: '#3aa39a', orange: '#d9772b', stone: '#8c8a85', stoneD: '#64625e'
  };
  const SKIN = {
    human: ['#f1c7a0', '#e0ab83', '#c68a62', '#9a6644', '#f6d6bd', '#d9a07a'],
    elf: ['#f4dcc6', '#ecd2b8', '#e4c7a9', '#f7e5d3'],
    dwarf: ['#e8b48f', '#dca07c', '#c98f6c', '#efc19f'],
    orc: ['#6f9a45', '#7fa64c', '#5d8a3e', '#86a356'],
    gnome: ['#f3c6a2', '#eab590', '#f7d4b6'],
    frog: ['#6cbc4a', '#5aa83e', '#7cc456', '#4f9a44']
  };
  const HAIR = {
    human: ['#4a3020', '#2a211c', '#c9a04e', '#8a4a26', '#9a9a98', '#6a4a2c'],
    elf: ['#f0dc9a', '#e6e6ea', '#2a211c', '#a65a2c', '#d7c07a'],
    dwarf: ['#b0502a', '#6a4a2c', '#2a211c', '#a8a8a6', '#c87038'],
    orc: ['#1f1c1a', '#2e2620', '#3b3028'],
    gnome: ['#f2f2ee', '#e6e2da', '#d9d4c8'],
    frog: ['#3f8a3a']
  };

  // ---------------------------------------------------------------- Gerüst (Knochen + Teile)
  // Geometrien: 0 Würfel, 1 Kugel, 2 Kegel, 3 Zylinder, 4 Kegelstumpf
  // Klassen: 0 fest (beleuchtet, Schatten), 1 leuchtend (unbeleuchtet), 2 Geist (durchsichtig), 3 Gallert (halb durchsichtig)
  const NG = 5, NCLS = 4;
  const G_BOX = 0, G_SPH = 1, G_CONE = 2, G_CYL = 3, G_FRU = 4;
  const SOLID = 0, GLOW = 1, GHOST = 2, JELLY = 3;

  function Rig() { this.bones = []; this.parts = []; this.anim = null; this.top = 0.5; }
  Rig.prototype.bone = function (parent, x, y, z) { this.bones.push({ p: parent, x: x, y: y, z: z }); return this.bones.length - 1; };
  // Teil: Knochen, Geometrie, Farbe [r,g,b], Mitte, Größe, Drehung (rx, ry, rz), Klasse, Detail (nur nah)
  Rig.prototype.add = function (b, g, col, x, y, z, sx, sy, sz, rx, ry, rz, cls, detail) {
    this.parts.push({ b: b, g: g, c: col, x: x, y: y, z: z, sx: sx, sy: sy, sz: sz, rx: rx || 0, ry: ry || 0, rz: rz || 0, cls: cls || 0, d: !!detail });
    return this;
  };
  Rig.prototype.done = function () {
    const ps = this.parts.slice().sort((a, b) => (a.d - b.d));
    const n = ps.length;
    this.n = n; this.nCore = ps.filter(p => !p.d).length;
    this.pb = new Int8Array(n); this.pp = new Int8Array(n);
    this.pl = new Float32Array(n * 16); this.pc = new Float32Array(n * 3);
    ps.forEach((p, i) => {
      this.pb[i] = p.b; this.pp[i] = p.cls * NG + p.g;
      compose(this.pl, i * 16, p.x, p.y, p.z, p.rx, p.ry, p.rz, p.sx, p.sy, p.sz);
      this.pc[i * 3] = p.c[0]; this.pc[i * 3 + 1] = p.c[1]; this.pc[i * 3 + 2] = p.c[2];
    });
    const nb = this.bones.length;
    this.nb = nb;
    this.bp = new Int8Array(nb); this.bx = new Float32Array(nb * 3);
    this.bones.forEach((b, i) => { this.bp[i] = b.p; this.bx[i * 3] = b.x; this.bx[i * 3 + 1] = b.y; this.bx[i * 3 + 2] = b.z; });
    this.parts = null;
    return this;
  };

  // ---------------------------------------------------------------- Menschliche Gestalten
  // Maße in Welteinheiten (Mensch ≈ 0,5 hoch)
  const RACE = {
    human: { LL: 0.19, TL: 0.16, TW: 0.15, TD: 0.09, HR: 0.062, AL: 0.16, AT: 0.042, LT: 0.05, hw: 1, lean: 0 },
    elf:   { LL: 0.22, TL: 0.17, TW: 0.122, TD: 0.078, HR: 0.057, AL: 0.175, AT: 0.035, LT: 0.042, hw: 0.94, lean: 0 },
    dwarf: { LL: 0.115, TL: 0.155, TW: 0.2, TD: 0.13, HR: 0.068, AL: 0.14, AT: 0.054, LT: 0.066, hw: 1.08, lean: 0.04 },
    orc:   { LL: 0.2, TL: 0.185, TW: 0.21, TD: 0.13, HR: 0.064, AL: 0.19, AT: 0.058, LT: 0.066, hw: 1.08, lean: 0.2 },
    gnome: { LL: 0.085, TL: 0.1, TW: 0.1, TD: 0.072, HR: 0.06, AL: 0.09, AT: 0.032, LT: 0.038, hw: 1.05, lean: 0 },
    frog:  { LL: 0.12, TL: 0.15, TW: 0.17, TD: 0.12, HR: 0.072, AL: 0.14, AT: 0.04, LT: 0.05, hw: 1.35, lean: 0.06 }
  };
  // Knochen
  const B_BODY = 0, B_HEAD = 1, B_ARML = 2, B_ARMR = 3, B_LEGL = 4, B_LEGR = 5, B_TOOL = 6;

  // Trachten. Farbtoken: PAL-Schlüssel, 'T' (Reichsfarbe), 'Td', 'Tl', 'skin', null (nackt bzw. weglassen)
  const COST = {
    tribe:     { top: 'brown', sleeve: null, pants: 'fur', shoes: 'brownD', belt: 'T', collar: 'furL', hat: 'feather', skirtF: 1 },
    monarchy:  { top: 'T', sleeve: 'cream', pants: 'brown', shoes: 'woodD', belt: 'woodD', apron: 'cream', hat: 'hood', skirtF: 1 },
    democracy: { top: 'white', vest: 'T', sleeve: 'white', pants: 'denim', shoes: 'ink', belt: 'brownD', hat: 'bowler', skirtF: 1 },
    fascism:   { top: 'grey', sleeve: 'grey', pants: 'greyD', shoes: 'ink', belt: 'greyD', collar: 'greyD', hat: 'peakcap' },
    communism: { top: 'denim', sleeve: 'denim', pants: 'denim', shoes: 'woodD', belt: 'denimD', straps: 'denimD', scarf: 'T', hat: 'flatcap' },
    theocracy: { top: 'robe', sleeve: 'robe', pants: 'robe', robe: 'robe', shoes: 'brownD', belt: 'gold', stole: 'T', hat: 'cowl' },
    republic:  { top: 'T', sleeve: 'white', slash: 'T', pants: 'Td', puffy: 1, shoes: 'ink', belt: 'gold', hat: 'beret', skirtF: 1 },
    anarchy:   { top: 'pink', sleeve: 'leaf', pants: 'denim', shoes: 'red', belt: 'ink', patches: 1, hat: 'mohawk' }
  };
  const SOLD = {
    tribe:     { top: 'skin', paint: 'T', sleeve: null, pants: 'fur', shoes: 'brownD', belt: 'brownD', hat: 'furhelm', weapon: 'spear', shield: 'round', pennant: 1 },
    monarchy:  { top: 'metal', sleeve: 'metal', pants: 'metalD', shoes: 'metalD', belt: 'woodD', tabard: 'T', hat: 'knight', weapon: 'sword', shield: 'kite', pauldron: 'metalL' },
    democracy: { top: 'blue', sleeve: 'blue', pants: 'blueD', shoes: 'ink', belt: 'white', cross: 'white', sash: 'T', hat: 'shako', weapon: 'halberd', pennant: 1 },
    fascism:   { top: 'grey', sleeve: 'grey', pants: 'greyD', shoes: 'ink', belt: 'ink', collar: 'greyD', armband: 'T', hat: 'pothelm', weapon: 'baton', shield: 'riot' },
    communism: { top: 'olive', sleeve: 'olive', pants: 'oliveD', shoes: 'ink', belt: 'oliveD', scarf: 'T', quilt: 1, hat: 'furhat', weapon: 'pike', pennant: 1 },
    theocracy: { top: 'white', sleeve: 'white', pants: 'white', robe: 'white', shoes: 'gold', belt: 'gold', stole: 'T', hat: 'templehelm', weapon: 'glaive', pennant: 1 },
    republic:  { top: 'T', sleeve: 'white', slash: 'T', pants: 'Td', puffy: 1, shoes: 'ink', belt: 'gold', hat: 'landsknecht', weapon: 'halberd' },
    anarchy:   { top: 'pink', sleeve: 'leaf', pants: 'denim', shoes: 'red', belt: 'ink', patches: 1, hat: 'pot', weapon: 'fork', pennant: 1 }
  };
  const LEAD = {
    tribe:     { base: 'tribe', cape: 'fur', hat: 'horns', staff: 'bone' },
    monarchy:  { base: 'monarchy', top: 'T', sleeve: 'T', robe: 'T', cape: 'Td', ermine: 1, apron: null, hat: 'crown', staff: 'scepter' },
    democracy: { base: 'democracy', top: 'plum', sleeve: 'plum', pants: 'plum', vest: null, chain: 'gold', tie: 'T', hat: 'tophat' },
    fascism:   { base: 'fascism', coat: 'grey', armband: 'T', armbandBig: 1, hat: 'leadercap' },
    communism: { base: 'communism', top: 'brown', sleeve: 'brown', pants: 'greyD', straps: null, coat: 'brown', hat: 'flatcap' },
    theocracy: { base: 'theocracy', top: 'white', sleeve: 'white', robe: 'white', stole: 'gold', belt: 'T', hat: 'mitre', staff: 'crook' },
    republic:  { base: 'republic', coat: 'T', fur: 1, hat: 'featherhat', chain: 'gold' }
  };
  const PRISONER = { top: 'greyL', sleeve: 'greyL', pants: 'greyL', shoes: 'greyD', belt: 'grey', hat: null };
  const BANDIT = { top: 'brownD', sleeve: 'brownD', pants: 'ink', shoes: 'ink', belt: 'woodD', hat: 'banditHood', mask: 1 };
  const TOOL_OF = { farmer: 'fork', lumberjack: 'axe', miner: 'pick', builder: 'hammer', trader: 'stick', settler: 'bundle', rebel: 'torch', bandit: 'dagger', hunter: 'bow', prisoner: 'pick' };

  function costumeFor(role, gov) {
    if (role === 'soldier' || role === 'ram' || role === 'catapult') return SOLD[gov] || SOLD.tribe;
    if (role === 'bandit') return BANDIT;
    if (role === 'prisoner') return PRISONER;
    if (role === 'leader') {
      if (gov === 'anarchy') return Object.assign({}, COST.anarchy, { hat: 'mohawk', megaphone: 1 });
      const L = LEAD[gov] || LEAD.tribe;
      return Object.assign({}, COST[L.base] || COST.tribe, L);
    }
    return COST[gov] || COST.tribe;
  }

  // Farbe aus Token
  function tok(t, S) {
    if (t == null) return null;
    if (t === 'T') return S.team.main; if (t === 'Td') return S.team.dark; if (t === 'Tl') return S.team.light;
    if (t === 'skin') return S.skin;
    return C(PAL[t] || t);
  }

  // Figur bauen. S = { race, role, gov, team {main,dark,light}, female, child, sick, carry, hair, skin, mad }
  function buildHuman(S) {
    const R = RACE[S.race] || RACE.human;
    const rig = new Rig();
    const role = S.role, child = S.child;
    const cs = costumeFor(child ? 'child' : role, S.gov);
    const soldier = role === 'soldier';
    const LL = R.LL, TL = R.TL, TW = R.TW, TD = R.TD, HR = R.HR * (child ? 1.12 : 1), AL = R.AL, AT = R.AT, LT = R.LT;
    const SX = TW / 2 + AT * 0.55;
    const skinC = S.skin, hairC = S.hair;
    // Knochen
    rig.bone(-1, 0, LL, 0);                  // 0 Rumpf (Hüfte)
    rig.bone(B_BODY, 0, TL + 0.012, 0);      // 1 Kopf
    rig.bone(B_BODY, SX, TL - 0.012, 0);     // 2 Arm links
    rig.bone(B_BODY, -SX, TL - 0.012, 0);    // 3 Arm rechts
    rig.bone(-1, TW * 0.25, LL, 0);          // 4 Bein links
    rig.bone(-1, -TW * 0.25, LL, 0);         // 5 Bein rechts
    rig.bone(B_ARMR, 0, -AL, 0);             // 6 Werkzeug (Hand)
    rig.top = LL + TL + HR * 2.1;
    rig.handR = 1;

    const top = tok(cs.top, S) || skinC, sleeve = cs.sleeve === null ? skinC : (tok(cs.sleeve, S) || top);
    const pants = tok(cs.pants, S) || C(PAL.brown), shoes = tok(cs.shoes, S) || C(PAL.brownD);
    const robe = tok(cs.robe, S);
    const female = S.female && !soldier;
    const skirt = robe || (female && cs.skirtF && !child ? pants : null);
    // Beine
    for (const b of [B_LEGL, B_LEGR]) {
      if (cs.puffy && !skirt) {
        rig.add(b, G_SPH, pants, 0, -LL * 0.28, 0, LT * 1.7, LL * 0.62, LT * 1.7);
        rig.add(b, G_BOX, C(PAL.white), 0, -LL * 0.72, 0, LT * 0.8, LL * 0.5, LT * 0.85);
      } else rig.add(b, G_BOX, skirt ? shade(pants, 0.7) : pants, 0, -LL / 2, 0, LT, LL, LT * 1.1);
      rig.add(b, G_BOX, shoes, 0, -LL + 0.014, 0.012, LT * 1.08, 0.028, LT * 1.6);
    }
    // Rumpf
    if (S.race === 'frog') {
      rig.add(B_BODY, G_SPH, top, 0, TL * 0.45, 0, TW * 1.15, TL * 1.15, TD * 1.25);
      rig.add(B_BODY, G_SPH, C('#f2f0c8'), 0, TL * 0.4, TD * 0.18, TW * 0.8, TL * 0.9, TD * 0.95, 0, 0, 0, 0, 1);
      if (cs.top === 'skin') { /* nackter Froschbauch */ }
    } else if (S.race === 'dwarf' || S.race === 'orc') {
      rig.add(B_BODY, G_BOX, top, 0, TL * 0.5, 0, TW, TL, TD);
      rig.add(B_BODY, G_SPH, top, 0, TL * 0.62, TD * 0.05, TW * 1.08, TL * 0.9, TD * 1.2);
    } else {
      rig.add(B_BODY, G_BOX, top, 0, TL * 0.52, 0, TW, TL * 0.96, TD);
      rig.add(B_BODY, G_BOX, top, 0, TL * 0.9, 0, TW * 1.06, TL * 0.2, TD * 1.04);   // Schultern
    }
    if (skirt) rig.add(B_BODY, G_FRU, skirt, 0, -LL * 0.44, 0, TW * 1.35, LL * 0.95, TD * 1.8);
    if (cs.belt) rig.add(B_BODY, G_BOX, tok(cs.belt, S), 0, 0.012, 0, TW * 1.04, 0.022, TD * 1.06);
    if (cs.vest) { const v = tok(cs.vest, S); rig.add(B_BODY, G_BOX, v, TW * 0.27, TL * 0.55, TD * 0.03, TW * 0.4, TL * 0.86, TD * 1.02); rig.add(B_BODY, G_BOX, v, -TW * 0.27, TL * 0.55, TD * 0.03, TW * 0.4, TL * 0.86, TD * 1.02); }
    if (cs.apron) rig.add(B_BODY, G_BOX, tok(cs.apron, S), 0, TL * 0.1, TD * 0.52, TW * 0.8, TL * 0.9, 0.012);
    if (cs.coat) { const c = tok(cs.coat, S); rig.add(B_BODY, G_BOX, c, 0, TL * 0.35, 0, TW * 1.1, TL * 1.25, TD * 1.12); rig.add(B_BODY, G_FRU, c, 0, -LL * 0.28, 0, TW * 1.3, LL * 0.62, TD * 1.6); if (cs.fur) rig.add(B_BODY, G_BOX, C(PAL.furL), 0, TL * 0.92, 0, TW * 1.2, TL * 0.16, TD * 1.25); }
    if (cs.tabard) { const t = tok(cs.tabard, S); rig.add(B_BODY, G_BOX, t, 0, TL * 0.35, 0, TW * 0.78, TL * 1.25, TD * 1.12); rig.add(B_BODY, G_BOX, C(PAL.gold), 0, TL * 0.55, TD * 0.57, TW * 0.12, TL * 0.5, 0.01, 0, 0, 0, 0, 1); }
    if (cs.pauldron) for (const s of [1, -1]) rig.add(B_BODY, G_SPH, tok(cs.pauldron, S), s * TW * 0.5, TL * 0.92, 0, AT * 2.2, AT * 1.4, AT * 2.2);
    if (cs.cross) { const w = tok(cs.cross, S); rig.add(B_BODY, G_BOX, w, 0, TL * 0.5, TD * 0.51, 0.014, TL * 1.25, 0.008, 0, 0, 0.62, 0, 1); rig.add(B_BODY, G_BOX, w, 0, TL * 0.5, TD * 0.51, 0.014, TL * 1.25, 0.008, 0, 0, -0.62, 0, 1); }
    if (cs.sash) rig.add(B_BODY, G_BOX, tok(cs.sash, S), 0, TL * 0.5, TD * 0.52, 0.026, TL * 1.3, 0.01, 0, 0, 0.75);
    if (cs.straps) { const s = tok(cs.straps, S); rig.add(B_BODY, G_BOX, s, TW * 0.25, TL * 0.6, TD * 0.52, 0.018, TL * 0.85, 0.008, 0, 0, 0, 0, 1); rig.add(B_BODY, G_BOX, s, -TW * 0.25, TL * 0.6, TD * 0.52, 0.018, TL * 0.85, 0.008, 0, 0, 0, 0, 1); rig.add(B_BODY, G_BOX, s, 0, TL * 0.3, TD * 0.52, TW * 0.6, TL * 0.35, 0.008); }
    if (cs.stole) { const s = tok(cs.stole, S); rig.add(B_BODY, G_BOX, s, TW * 0.2, TL * 0.35, TD * 0.53, 0.026, TL * 1.3, 0.008); rig.add(B_BODY, G_BOX, s, -TW * 0.2, TL * 0.35, TD * 0.53, 0.026, TL * 1.3, 0.008); }
    if (cs.collar) rig.add(B_BODY, G_CYL, tok(cs.collar, S), 0, TL + 0.004, 0, TW * 0.55, 0.028, TD * 0.8);
    if (cs.scarf) { const s = tok(cs.scarf, S); rig.add(B_BODY, G_CYL, s, 0, TL - 0.002, 0, TW * 0.62, 0.03, TD * 0.92); rig.add(B_BODY, G_BOX, s, TW * 0.12, TL * 0.72, TD * 0.5, 0.03, TL * 0.4, 0.012, 0.15, 0, 0.2); }
    // Armbinde (nur Faschismus: Soldaten, Anführer): Reichsfarbe mit zwei schmalen hellen Querstreifen, sonst nichts darauf
    if (cs.armband) {
      const h = AT * (cs.armbandBig ? 1.25 : 0.95), y = -AL * 0.3, wd = AT * (cs.armbandBig ? 1.22 : 1.16);
      rig.add(B_ARML, G_CYL, tok(cs.armband, S), 0, y, 0, wd, h, wd);
      for (const s of [1, -1]) rig.add(B_ARML, G_CYL, C('#f1ece0'), 0, y + s * h * 0.26, 0, wd * 1.02, h * 0.13, wd * 1.02);
    }
    if (cs.paint) { const p = tok(cs.paint, S); rig.add(B_BODY, G_BOX, p, TW * 0.22, TL * 0.62, TD * 0.51, TW * 0.12, TL * 0.55, 0.006, 0, 0, 0.3, 0, 1); rig.add(B_BODY, G_BOX, p, -TW * 0.22, TL * 0.62, TD * 0.51, TW * 0.12, TL * 0.55, 0.006, 0, 0, -0.3, 0, 1); rig.add(B_BODY, G_BOX, C(PAL.fur), 0, TL * 0.05, 0, TW * 1.1, TL * 0.3, TD * 1.15); }
    if (cs.quilt) for (let k = 0; k < 3; k++) rig.add(B_BODY, G_BOX, C(PAL.oliveD), 0, TL * (0.25 + k * 0.27), TD * 0.51, TW * 1.01, 0.008, 0.006, 0, 0, 0, 0, 1);
    if (cs.patches) { rig.add(B_BODY, G_BOX, C(PAL.yellow), TW * 0.22, TL * 0.35, TD * 0.51, 0.04, 0.04, 0.008, 0, 0, 0.3, 0, 1); rig.add(B_BODY, G_BOX, C(PAL.teal), -TW * 0.18, TL * 0.7, TD * 0.51, 0.035, 0.03, 0.008, 0, 0, -0.2, 0, 1); }
    if (cs.chain) rig.add(B_BODY, G_BOX, tok(cs.chain, S), 0, TL * 0.78, TD * 0.54, TW * 0.6, 0.016, 0.01, 0, 0, 0, 0, 1);
    if (cs.tie) rig.add(B_BODY, G_BOX, tok(cs.tie, S), 0, TL * 0.6, TD * 0.53, 0.018, TL * 0.55, 0.008);
    if (cs.cape) { const c = tok(cs.cape, S), h = TL + LL * 0.82; rig.add(B_BODY, G_BOX, c, 0, TL - h / 2, -TD / 2 - 0.012, TW * 1.15, h, 0.018, -0.06, 0, 0); if (cs.ermine) rig.add(B_BODY, G_BOX, C('#f4f1ea'), 0, TL - 0.008, -TD * 0.2, TW * 1.22, 0.03, TD * 1.1); }
    if (cs.mask) rig.add(B_HEAD, G_BOX, C(PAL.ink), 0, HR * 1.05, HR * 0.75, HR * 1.9, HR * 0.32, HR * 0.6);
    // Arme
    for (const b of [B_ARML, B_ARMR]) {
      if (cs.puffy || cs.slash) rig.add(b, G_SPH, sleeve, 0, -AL * 0.22, 0, AT * 1.5, AL * 0.5, AT * 1.5);
      rig.add(b, G_BOX, sleeve, 0, -AL * 0.42, 0, AT, AL * 0.84, AT);
      if (cs.slash) rig.add(b, G_BOX, tok(cs.slash, S), 0, -AL * 0.22, 0, AT * 1.55, AL * 0.08, AT * 1.55, 0, 0, 0, 0, 1);
      rig.add(b, G_SPH, cs.sleeve === 'metal' ? C(PAL.metalD) : skinC, 0, -AL * 0.93, 0, AT * 1.15, AT * 1.25, AT * 1.15);
    }
    // Kopf
    const frog = S.race === 'frog';
    if (frog) {
      rig.add(B_HEAD, G_SPH, skinC, 0, HR * 0.8, HR * 0.1, HR * 2.5, HR * 1.6, HR * 2.2);
      for (const s of [1, -1]) {
        rig.add(B_HEAD, G_SPH, skinC, s * HR * 0.62, HR * 1.55, HR * 0.35, HR * 0.95, HR * 0.95, HR * 0.95);
        rig.add(B_HEAD, G_SPH, C('#f4f1e2'), s * HR * 0.68, HR * 1.62, HR * 0.62, HR * 0.68, HR * 0.68, HR * 0.6);
        rig.add(B_HEAD, G_SPH, C(PAL.ink), s * HR * 0.7, HR * 1.64, HR * 0.86, HR * 0.34, HR * 0.4, HR * 0.25);
      }
      rig.add(B_HEAD, G_BOX, shade(skinC, 0.55), 0, HR * 0.55, HR * 1.18, HR * 1.6, 0.006, 0.01, 0, 0, 0, 0, 1);
    } else {
      rig.add(B_BODY, G_CYL, skinC, 0, TL + 0.006, 0, AT * 0.9, 0.03, AT * 0.9, 0, 0, 0, 0, 1);    // Hals
      const jaw = S.race === 'orc' ? 1.12 : 1;
      rig.add(B_HEAD, G_SPH, skinC, 0, HR, 0, HR * 2 * R.hw * jaw, HR * 2.12, HR * 2);
      // Augen und Nase
      for (const s of [1, -1]) rig.add(B_HEAD, G_SPH, S.mad ? C('#e8302a') : C(PAL.ink), s * HR * 0.36, HR * 1.12, HR * 0.9, HR * 0.24, HR * 0.28, HR * 0.16, 0, 0, 0, S.mad ? GLOW : SOLID, 1);
      rig.add(B_HEAD, G_BOX, shade(skinC, 0.9), 0, HR * 0.9, HR * 1.0, HR * 0.3, HR * 0.4, HR * 0.35, 0, 0, 0, 0, 1);
      if (S.race === 'elf') for (const s of [1, -1]) rig.add(B_HEAD, G_CONE, skinC, s * HR * 1.05, HR * 1.25, -HR * 0.05, HR * 0.38, HR * 1.4, HR * 0.24, 0, 0, -s * 1.05);
      if (S.race === 'orc') {
        for (const s of [1, -1]) {
          rig.add(B_HEAD, G_CONE, C(PAL.bone), s * HR * 0.48, HR * 0.55, HR * 0.95, HR * 0.24, HR * 0.55, HR * 0.24, 0, 0, s * 0.15);
          rig.add(B_HEAD, G_CONE, skinC, s * HR * 1.12, HR * 1.2, -HR * 0.05, HR * 0.3, HR * 0.8, HR * 0.24, 0, 0, -s * 1.35, 0, 1);
        }
        rig.add(B_HEAD, G_BOX, shade(skinC, 0.8), 0, HR * 1.42, HR * 0.78, HR * 1.6, HR * 0.22, HR * 0.4, 0, 0, 0, 0, 1);   // Brauenwulst
      }
      if (S.race === 'dwarf' || S.race === 'gnome') {
        const beard = S.race === 'gnome' ? C('#f2f2ee') : hairC;
        rig.add(B_HEAD, G_CONE, beard, 0, HR * 0.1, HR * 0.72, HR * 1.75, HR * (S.race === 'gnome' ? 1.6 : 2.0), HR * 0.9, PI, 0, 0);
        rig.add(B_HEAD, G_BOX, beard, 0, HR * 0.8, HR * 1.0, HR * 1.1, HR * 0.22, HR * 0.3, 0, 0, 0, 0, 1);   // Schnurrbart
        if (S.race === 'gnome') rig.add(B_HEAD, G_SPH, C('#e88a78'), 0, HR * 0.95, HR * 1.05, HR * 0.42, HR * 0.4, HR * 0.4);   // Knollennase
      }
    }
    // Haare
    const hat = (S.race === 'gnome' && !soldier && role !== 'leader' && role !== 'bandit') ? 'gnomecap' : (child ? (S.race === 'gnome' ? 'gnomecap' : null) : cs.hat);
    const longHair = !frog && (S.race === 'elf' || (S.female && !soldier));
    if (!frog && S.race !== 'gnome') {
      const capped = hat && !/feather|mohawk|crown|horns/.test(hat);
      if (!capped || longHair) rig.add(B_HEAD, G_SPH, hairC, 0, HR * 1.22, -HR * 0.14, HR * 2.12 * R.hw, HR * 1.85, HR * 2.06);
      if (hat === 'mohawk') { /* Irokese ersetzt Haar oben */ }
      if (longHair) rig.add(B_HEAD, G_BOX, hairC, 0, HR * 0.55, -HR * 0.62, HR * 1.75, HR * 2.1, HR * 0.6);
    }
    addHat(rig, hat, HR, S, R);
    // Völker-Extras am Kopf nach dem Hut (Ohren ragen durch)
    // Werkzeug / Waffe / Last
    const carry = S.carry;
    if (carry) addCarry(rig, carry, R);
    else if (soldier) addWeapon(rig, cs, S, R);
    else if (role === 'leader' && cs.staff) addTool(rig, cs.staff, S, R);
    else if (role === 'leader' && cs.megaphone) addTool(rig, 'megaphone', S, R);
    else if (role === 'prisoner') addTool(rig, S.alt ? 'shovel' : 'pick', S, R);
    else if (!child && TOOL_OF[role]) addTool(rig, TOOL_OF[role], S, R);
    if (role === 'trader') { rig.add(B_BODY, G_BOX, C(PAL.straw), 0, TL * 0.6, -TD * 0.5 - 0.06, TW * 1.05, TL * 1.3, 0.11); rig.add(B_BODY, G_BOX, C(PAL.brownL), 0, TL * 1.3, -TD * 0.5 - 0.06, TW * 0.9, 0.05, 0.1); rig.add(B_BODY, G_CYL, C(PAL.red), 0, TL * 1.25 + 0.04, -TD * 0.5 - 0.06, 0.05, TW * 1.0, 0.05, 0, 0, PI / 2); }
    if (role === 'settler') { rig.add(B_BODY, G_CYL, C('#8a6a4a'), 0, TL * 0.95, -TD * 0.5 - 0.035, 0.065, TW * 1.2, 0.065, 0, 0, PI / 2); rig.add(B_BODY, G_BOX, C(PAL.cream), 0, TL * 0.45, -TD * 0.5 - 0.035, TW * 0.8, TL * 0.7, 0.07); }
    if (role === 'rebel') rig.add(B_HEAD, G_BOX, C(PAL.red), 0, HR * 1.5, 0, HR * 2.15, HR * 0.35, HR * 2.1);
    if (cs.shield && !carry) addShield(rig, cs.shield, S, R);
    // Kranke: grünlicher Schimmer übers Gesicht kommt aus der Hautfarbe
    rig.anim = animHuman;
    rig.kind = 'human';
    rig.lean = R.lean;
    return rig.done();
  }

  function addHat(rig, hat, HR, S, R) {
    if (!hat) return;
    const H = B_HEAD, w = R.hw;
    const T = S.team, top = HR * 2.05;
    switch (hat) {
      case 'feather':
        rig.add(H, G_CYL, T.main, 0, HR * 1.45, 0, HR * 2.1 * w, HR * 0.28, HR * 2.1);
        rig.add(H, G_BOX, C(PAL.white), -HR * 0.6, HR * 2.1, -HR * 0.7, HR * 0.18, HR * 1.4, HR * 0.4, -0.3, 0, 0.25);
        rig.add(H, G_BOX, C(PAL.red), -HR * 0.62, HR * 2.6, -HR * 0.86, HR * 0.14, HR * 0.4, HR * 0.3, -0.3, 0, 0.25, 0, 1);
        break;
      case 'hood':
        rig.add(H, G_SPH, C(PAL.cream), 0, HR * 1.18, -HR * 0.12, HR * 2.35 * w, HR * 2.2, HR * 2.3);
        rig.add(H, G_BOX, C(PAL.cream), 0, HR * 0.3, -HR * 0.85, HR * 1.9, HR * 1.4, HR * 0.5);
        break;
      case 'bowler':
        rig.add(H, G_CYL, C(PAL.brownD), 0, HR * 1.75, 0, HR * 2.9 * w, HR * 0.12, HR * 2.9);
        rig.add(H, G_SPH, C(PAL.brownD), 0, HR * 1.9, 0, HR * 2.05 * w, HR * 1.5, HR * 2.05);
        rig.add(H, G_CYL, T.main, 0, HR * 1.85, 0, HR * 2.1 * w, HR * 0.22, HR * 2.1);
        break;
      case 'peakcap': case 'leadercap': {
        const tall = hat === 'leadercap' ? 1.5 : 1;
        rig.add(H, G_CYL, C(PAL.grey), 0, HR * (1.8 + 0.12 * tall), 0, HR * 2.25 * w, HR * 0.5 * tall, HR * 2.2);
        rig.add(H, G_CYL, C(PAL.greyD), 0, HR * 1.72, 0, HR * 2.12 * w, HR * 0.3, HR * 2.12);
        rig.add(H, G_BOX, C(PAL.ink), 0, HR * 1.66, HR * 1.05, HR * 1.6, HR * 0.08, HR * 0.8, 0.25, 0, 0);
        break;
      }
      case 'flatcap':
        rig.add(H, G_SPH, C(PAL.brown), 0, HR * 1.8, HR * 0.12, HR * 2.3 * w, HR * 0.8, HR * 2.4);
        rig.add(H, G_BOX, C(PAL.brownD), 0, HR * 1.6, HR * 1.1, HR * 1.5, HR * 0.1, HR * 0.6, 0.2, 0, 0);
        break;
      case 'cowl':
        rig.add(H, G_SPH, C(PAL.robeD), 0, HR * 1.15, -HR * 0.18, HR * 2.4 * w, HR * 2.35, HR * 2.4);
        rig.add(H, G_BOX, C(PAL.robeD), 0, HR * 0.2, -HR * 0.9, HR * 2.2, HR * 1.6, HR * 0.6);
        break;
      case 'beret':
        rig.add(H, G_CYL, T.dark, HR * 0.15, HR * 2.0, 0, HR * 2.6 * w, HR * 0.35, HR * 2.6, 0, 0, 0.18);
        rig.add(H, G_BOX, C(PAL.white), -HR * 0.9, HR * 2.5, -HR * 0.2, HR * 0.14, HR * 1.4, HR * 0.4, 0, 0, 0.6);
        break;
      case 'mohawk': {
        const cols = [PAL.pink, '#f2b541', PAL.purple, '#6be0cf', PAL.leafL];
        for (let k = 0; k < 5; k++) rig.add(H, G_BOX, C(cols[k]), 0, HR * 2.15, HR * (0.75 - k * 0.38), HR * 0.32, HR * (1.1 - abs(k - 2) * 0.12), HR * 0.36);
        break;
      }
      // Soldaten
      case 'furhelm': case 'horns': {
        rig.add(H, G_SPH, C(PAL.fur), 0, HR * 1.5, 0, HR * 2.25 * w, HR * 1.5, HR * 2.2);
        const big = hat === 'horns' ? 1.5 : 1;
        for (const s of [1, -1]) {
          rig.add(H, G_CONE, C(PAL.bone), s * HR * 1.25, HR * 1.95, 0, HR * 0.4 * big, HR * 1.2 * big, HR * 0.4 * big, 0, 0, -s * 0.9);
          rig.add(H, G_CONE, C(PAL.bone), s * HR * 1.65 * (0.8 + big * 0.2), HR * (2.55 + (big - 1) * 0.6), 0, HR * 0.24 * big, HR * 0.8 * big, HR * 0.24 * big, 0, 0, -s * 0.2, 0, 1);
        }
        break;
      }
      case 'knight':
        rig.add(H, G_CYL, C(PAL.metal), 0, HR * 1.1, 0, HR * 2.35 * w, HR * 2.3, HR * 2.35);
        rig.add(H, G_SPH, C(PAL.metalL), 0, HR * 2.2, 0, HR * 2.35 * w, HR * 0.8, HR * 2.35);
        rig.add(H, G_BOX, C(PAL.ink), 0, HR * 1.2, HR * 1.12, HR * 1.6, HR * 0.16, HR * 0.1);
        rig.add(H, G_CONE, T.main, 0, HR * 3.0, -HR * 0.3, HR * 0.5, HR * 1.4, HR * 1.4, -0.4, 0, 0);
        break;
      case 'shako':
        rig.add(H, G_CYL, C(PAL.blueD), 0, HR * 2.2, 0, HR * 2.15 * w, HR * 1.6, HR * 2.15);
        rig.add(H, G_BOX, C(PAL.ink), 0, HR * 1.48, HR * 1.0, HR * 1.6, HR * 0.08, HR * 0.6, 0.25, 0, 0);
        rig.add(H, G_SPH, T.main, 0, HR * 3.15, HR * 0.55, HR * 0.6, HR * 0.6, HR * 0.6);
        rig.add(H, G_CYL, C(PAL.white), 0, HR * 2.95, 0, HR * 2.18 * w, HR * 0.12, HR * 2.18, 0, 0, 0, 0, 1);
        break;
      case 'pothelm':
        rig.add(H, G_SPH, C(PAL.greyD), 0, HR * 1.55, 0, HR * 2.55 * w, HR * 1.9, HR * 2.55);
        rig.add(H, G_CYL, C(PAL.greyD), 0, HR * 1.35, 0, HR * 2.6 * w, HR * 0.12, HR * 2.6);
        break;
      case 'furhat':
        rig.add(H, G_CYL, C(PAL.brown), 0, HR * 1.95, 0, HR * 2.4 * w, HR * 1.1, HR * 2.4);
        rig.add(H, G_CYL, C(PAL.brownL), 0, HR * 2.5, 0, HR * 2.2 * w, HR * 0.1, HR * 2.2, 0, 0, 0, 0, 1);
        break;
      case 'templehelm':
        rig.add(H, G_SPH, C(PAL.white), 0, HR * 1.55, 0, HR * 2.35 * w, HR * 1.8, HR * 2.35);
        rig.add(H, G_CYL, C(PAL.gold), 0, HR * 1.4, 0, HR * 2.4 * w, HR * 0.2, HR * 2.4);
        rig.add(H, G_CONE, C(PAL.gold), 0, HR * 2.75, 0, HR * 0.38, HR * 1.2, HR * 0.38);
        break;
      case 'landsknecht':
        rig.add(H, G_CYL, T.main, HR * 0.1, HR * 1.95, 0, HR * 3.4 * w, HR * 0.4, HR * 3.3, 0, 0, 0.15);
        rig.add(H, G_BOX, C(PAL.white), -HR * 1.0, HR * 2.6, -HR * 0.3, HR * 0.16, HR * 1.8, HR * 0.5, 0, 0, 0.7);
        rig.add(H, G_BOX, C(PAL.red), -HR * 0.6, HR * 2.7, -HR * 0.5, HR * 0.16, HR * 1.6, HR * 0.5, 0, 0, 0.35);
        break;
      case 'pot':
        rig.add(H, G_CYL, C(PAL.metalD), 0, HR * 1.9, 0, HR * 2.3 * w, HR * 1.0, HR * 2.3);
        rig.add(H, G_BOX, C(PAL.metalD), HR * 1.4, HR * 2.1, 0, HR * 0.8, HR * 0.14, HR * 0.24);
        break;
      // Anführer
      case 'crown':
        rig.add(H, G_CYL, C(PAL.gold), 0, HR * 2.05, 0, HR * 2.05 * w, HR * 0.5, HR * 2.05);
        for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; rig.add(H, G_CONE, C(PAL.goldL), sin(a) * HR * 0.95, HR * 2.5, cos(a) * HR * 0.95, HR * 0.32, HR * 0.55, HR * 0.32); }
        rig.add(H, G_SPH, C(PAL.red), 0, HR * 2.05, HR * 1.04, HR * 0.3, HR * 0.3, HR * 0.2, 0, 0, 0, GLOW, 1);
        break;
      case 'tophat':
        rig.add(H, G_CYL, C(PAL.plum), 0, HR * 1.72, 0, HR * 3.0 * w, HR * 0.12, HR * 3.0);
        rig.add(H, G_CYL, C(PAL.plum), 0, HR * 2.65, 0, HR * 1.95 * w, HR * 1.9, HR * 1.95);
        rig.add(H, G_CYL, T.main, 0, HR * 1.95, 0, HR * 2.0 * w, HR * 0.3, HR * 2.0);
        break;
      case 'mitre':
        rig.add(H, G_CONE, C(PAL.white), 0, HR * 2.75, 0, HR * 2.0 * w, HR * 2.6, HR * 1.4);
        rig.add(H, G_BOX, C(PAL.gold), 0, HR * 2.6, HR * 0.5, HR * 0.24, HR * 2.0, HR * 0.1, -0.24, 0, 0);
        rig.add(H, G_CYL, C(PAL.gold), 0, HR * 1.55, 0, HR * 2.1 * w, HR * 0.24, HR * 2.1);
        break;
      case 'featherhat':
        rig.add(H, G_CYL, C(PAL.red), 0, HR * 1.75, 0, HR * 3.4 * w, HR * 0.14, HR * 3.4);
        rig.add(H, G_CYL, C(PAL.redD), 0, HR * 2.05, 0, HR * 2.1 * w, HR * 0.6, HR * 2.1);
        rig.add(H, G_BOX, C(PAL.white), -HR * 0.9, HR * 2.5, -HR * 0.3, HR * 0.2, HR * 2.0, HR * 0.6, -0.3, 0, 0.6);
        break;
      case 'gnomecap': {
        const g = S.gov, c = g === 'fascism' ? C(PAL.grey) : g === 'communism' ? C(PAL.denim) : g === 'theocracy' ? C(PAL.robe) : g === 'democracy' ? C(PAL.brownD) : g === 'anarchy' ? C(PAL.purple) : g === 'republic' ? S.team.dark : C(PAL.red);
        rig.add(H, G_CONE, c, 0, HR * 2.75, -HR * 0.25, HR * 2.15 * w, HR * 2.6, HR * 2.15, -0.28, 0, 0);
        rig.add(H, G_CYL, shade(c, 0.8), 0, HR * 1.55, 0, HR * 2.2 * w, HR * 0.28, HR * 2.2);
        break;
      }
      case 'banditHood':
        rig.add(H, G_SPH, C(PAL.brownD), 0, HR * 1.18, -HR * 0.15, HR * 2.35 * w, HR * 2.25, HR * 2.35);
        rig.add(H, G_CONE, C(PAL.brownD), 0, HR * 1.9, -HR * 1.0, HR * 1.2, HR * 1.4, HR * 1.0, -1.2, 0, 0);
        break;
    }
  }

  // Werkzeug in der rechten Hand. Lokal: Stiel entlang +Y, Kopf oben, vorn = +Z
  function addTool(rig, kind, S, R) {
    const T = B_TOOL, k = S.race === 'gnome' ? 0.6 : S.race === 'dwarf' ? 0.85 : 1;
    const wood = C(PAL.wood), metal = C(PAL.metalL);
    switch (kind) {
      case 'fork':
        rig.add(T, G_CYL, wood, 0, 0.08 * k, 0, 0.014, 0.34 * k, 0.014);
        rig.add(T, G_BOX, metal, 0, 0.25 * k, 0, 0.07 * k, 0.012, 0.012);
        for (const x of [-0.03, 0, 0.03]) rig.add(T, G_BOX, metal, x * k, 0.29 * k, 0, 0.008, 0.07 * k, 0.008);
        break;
      case 'axe':
        rig.add(T, G_CYL, wood, 0, 0.06 * k, 0, 0.016, 0.26 * k, 0.016);
        rig.add(T, G_BOX, metal, 0, 0.17 * k, 0.035 * k, 0.012, 0.06 * k, 0.07 * k);
        break;
      case 'pick':
        rig.add(T, G_CYL, wood, 0, 0.06 * k, 0, 0.016, 0.26 * k, 0.016);
        rig.add(T, G_BOX, C(PAL.metal), 0, 0.18 * k, 0, 0.014, 0.018, 0.18 * k, 0.15, 0, 0);
        break;
      case 'hammer':
        rig.add(T, G_CYL, C(PAL.woodL), 0, 0.04 * k, 0, 0.016, 0.16 * k, 0.016);
        rig.add(T, G_BOX, C(PAL.metal), 0, 0.12 * k, 0.01, 0.04 * k, 0.04 * k, 0.08 * k);
        break;
      case 'shovel':
        rig.add(T, G_CYL, wood, 0, 0.07 * k, 0, 0.014, 0.3 * k, 0.014);
        rig.add(T, G_BOX, C(PAL.metal), 0, 0.24 * k, 0.0, 0.06 * k, 0.07 * k, 0.01, 0.2, 0, 0);
        break;
      case 'stick':
        rig.add(T, G_CYL, C(PAL.woodL), 0, 0.05, 0, 0.014, 0.42 * k, 0.014);
        break;
      case 'bundle':
        rig.add(T, G_CYL, C(PAL.woodL), 0, 0.12, -0.04, 0.012, 0.34 * k, 0.012, -0.9, 0, 0);
        rig.add(T, G_SPH, C('#c9a46a'), 0, 0.22 * k, -0.17 * k, 0.09 * k, 0.09 * k, 0.09 * k);
        break;
      case 'torch':
        rig.add(T, G_CYL, C(PAL.woodD), 0, 0.06, 0, 0.016, 0.22, 0.016);
        rig.add(T, G_CONE, C('#ffb347'), 0, 0.21, 0, 0.05, 0.1, 0.05, 0, 0, 0, GLOW);
        rig.add(T, G_CONE, C('#fff2b0'), 0, 0.2, 0, 0.025, 0.06, 0.025, 0, 0, 0, GLOW, 1);
        break;
      case 'dagger':
        rig.add(T, G_BOX, C(PAL.metalL), 0, 0.06, 0, 0.012, 0.09, 0.022);
        rig.add(T, G_BOX, C(PAL.woodD), 0, 0.01, 0, 0.03, 0.012, 0.012);
        break;
      case 'bow':
        rig.add(T, G_BOX, C(PAL.woodD), 0, 0.05, 0.02, 0.012, 0.3, 0.012);
        break;
      case 'scepter':
        rig.add(T, G_CYL, C(PAL.gold), 0, 0.06, 0, 0.014, 0.22, 0.014);
        rig.add(T, G_SPH, C(PAL.goldL), 0, 0.18, 0, 0.045, 0.045, 0.045);
        break;
      case 'crook':
        rig.add(T, G_CYL, C(PAL.gold), 0, 0.12, 0, 0.012, 0.42, 0.012);
        rig.add(T, G_CYL, C(PAL.gold), 0, 0.34, 0.03, 0.012, 0.07, 0.012, 1.2, 0, 0);
        break;
      case 'bone':
        rig.add(T, G_CYL, C(PAL.woodD), 0, 0.1, 0, 0.016, 0.38, 0.016);
        rig.add(T, G_SPH, C(PAL.bone), 0, 0.3, 0, 0.06, 0.06, 0.06);
        break;
      case 'megaphone':
        rig.add(T, G_CONE, C(PAL.red), 0, 0.04, 0.06, 0.06, 0.12, 0.06, -PI / 2, 0, 0);
        break;
    }
  }

  function addWeapon(rig, cs, S, R) {
    const T = B_TOOL, k = S.race === 'gnome' ? 0.6 : S.race === 'dwarf' ? 0.85 : 1;
    const wood = C(PAL.woodD), metal = C(PAL.metalL);
    const pole = (len, col) => rig.add(T, G_CYL, col || wood, 0, len * 0.35 * k, 0, 0.015, len * k, 0.015);
    switch (cs.weapon) {
      case 'spear': pole(0.55); rig.add(T, G_CONE, C(PAL.stone), 0, 0.47 * k, 0, 0.035, 0.09, 0.02); break;
      case 'sword':
        rig.add(T, G_BOX, metal, 0, 0.13 * k, 0, 0.014, 0.22 * k, 0.03);
        rig.add(T, G_BOX, C(PAL.gold), 0, 0.02, 0, 0.012, 0.012, 0.08);
        rig.add(T, G_BOX, C(PAL.woodD), 0, -0.02, 0, 0.016, 0.05, 0.016);
        break;
      case 'halberd': pole(0.6); rig.add(T, G_BOX, metal, 0, 0.47 * k, 0.03, 0.01, 0.07, 0.07); rig.add(T, G_CONE, metal, 0, 0.54 * k, 0, 0.022, 0.08, 0.022); break;
      case 'pike': pole(0.68); rig.add(T, G_CONE, metal, 0, 0.56 * k, 0, 0.02, 0.08, 0.02); break;
      case 'glaive': pole(0.55); rig.add(T, G_BOX, C(PAL.gold), 0, 0.5 * k, 0.015, 0.01, 0.12, 0.04, 0.25, 0, 0); break;
      case 'baton': rig.add(T, G_CYL, C(PAL.ink), 0, 0.07, 0, 0.018, 0.16, 0.018); break;
      case 'fork': addTool(rig, 'fork', S, R); break;
    }
    if (cs.pennant) rig.add(T, G_BOX, S.team.main, 0, (cs.weapon === 'pike' ? 0.48 : 0.4) * k, -0.045, 0.006, 0.06, 0.08);
  }

  function addShield(rig, kind, S, R) {
    const A = B_ARML, AL = R.AL, k = S.race === 'gnome' ? 0.6 : 1;
    const t = S.team;
    if (kind === 'round') { rig.add(A, G_CYL, t.main, 0.02, -AL * 0.62, 0.035, 0.15 * k, 0.018, 0.15 * k, PI / 2, 0, 0); rig.add(A, G_SPH, C(PAL.fur), 0.02, -AL * 0.62, 0.046, 0.04, 0.04, 0.02, 0, 0, 0, 0, 1); }
    else if (kind === 'kite') {
      rig.add(A, G_BOX, t.main, 0.02, -AL * 0.6, 0.04, 0.13 * k, 0.16 * k, 0.016);
      rig.add(A, G_CONE, t.main, 0.02, -AL * 0.6 - 0.11 * k, 0.04, 0.13 * k, 0.07 * k, 0.016, PI, 0, 0);
      rig.add(A, G_BOX, C(PAL.white), 0.02, -AL * 0.6, 0.05, 0.022, 0.15 * k, 0.006, 0, 0, 0.6, 0, 1);
    } else if (kind === 'riot') {
      rig.add(A, G_BOX, C(PAL.greyD), 0.02, -AL * 0.55, 0.045, 0.15 * k, 0.24 * k, 0.014);
      rig.add(A, G_BOX, t.main, 0.02, -AL * 0.4, 0.054, 0.15 * k, 0.025, 0.006, 0, 0, 0, 0, 1);
    }
  }

  function addCarry(rig, kind, R) {
    const B = B_BODY, TL = R.TL, TD = R.TD;
    if (kind === 'wood') {
      for (const y of [0, 1]) rig.add(B, G_CYL, C(PAL.wood), 0.02 * y, TL * 1.08 + y * 0.035, -0.01, 0.04, 0.3, 0.04, 0, 0.35, PI / 2);
    } else if (kind === 'stone') {
      rig.add(B, G_BOX, C(PAL.stone), 0, TL * 0.62, TD * 0.5 + 0.06, 0.1, 0.08, 0.08, 0.2, 0.3, 0);
    } else if (kind === 'gold') {
      rig.add(B, G_SPH, C('#8a6a3a'), 0, TL * 0.6, TD * 0.5 + 0.06, 0.1, 0.11, 0.09);
      rig.add(B, G_SPH, C(PAL.goldL), 0, TL * 0.6 + 0.05, TD * 0.5 + 0.06, 0.05, 0.03, 0.05, 0, 0, 0, GLOW);
    } else {   // food: Korb
      rig.add(B, G_FRU, C(PAL.straw), 0, TL * 0.55, TD * 0.5 + 0.06, 0.13, 0.07, 0.1, PI, 0, 0);
      rig.add(B, G_SPH, C('#c0392b'), -0.02, TL * 0.62, TD * 0.5 + 0.06, 0.04, 0.04, 0.04);
      rig.add(B, G_SPH, C('#e2b33a'), 0.025, TL * 0.63, TD * 0.5 + 0.05, 0.04, 0.04, 0.04);
    }
  }

  // Ferne Figur: wenige Teile
  function buildHumanFar(S) {
    const R = RACE[S.race] || RACE.human;
    const cs = costumeFor(S.child ? 'child' : S.role, S.gov);
    const rig = new Rig();
    rig.bone(-1, 0, 0, 0);
    const top = tok(cs.top, S) || S.skin, pants = tok(cs.pants, S) || C(PAL.brown);
    const LL = R.LL, TL = R.TL;
    rig.add(0, G_BOX, pants, 0, LL / 2, 0, R.TW * 0.8, LL, R.TD);
    rig.add(0, G_BOX, top, 0, LL + TL / 2, 0, R.TW, TL, R.TD);
    rig.add(0, G_SPH, S.skin, 0, LL + TL + R.HR, 0, R.HR * 2.2, R.HR * 2.2, R.HR * 2.2);
    if (S.role === 'soldier') rig.add(0, G_BOX, S.team.main, 0, LL + TL + R.HR * 2.1, 0, R.HR * 2.2, R.HR * 0.8, R.HR * 2.2);
    rig.top = LL + TL + R.HR * 2.1;
    rig.anim = null;
    return rig.done();
  }

  // ---------------------------------------------------------------- Bewegung Mensch
  // A: je Knochen 9 Werte (rx, ry, rz, ox, oy, oz, sx, sy, sz). o: Laufzeitdaten der Figur
  function animHuman(o, t, A, rig) {
    const ph = o.ph, mode = o.mode;
    const lean = rig.lean || 0;
    if (mode === 1 || mode === 5) {   // gehen (5 = gehen mit Last)
      const s = sin(ph), k = o.run ? 0.95 : 0.7;
      A[B_LEGL * 9] = s * k; A[B_LEGR * 9] = -s * k;
      if (mode === 5) { A[B_ARML * 9] = -1.1; A[B_ARMR * 9] = -1.1; A[B_ARML * 9 + 2] = 0.2; A[B_ARMR * 9 + 2] = -0.2; }
      else { A[B_ARML * 9] = -s * k * 0.85; A[B_ARMR * 9] = s * k * 0.85; }
      A[B_BODY * 9] = lean + 0.06; A[B_BODY * 9 + 1] = s * 0.12;
      A[B_HEAD * 9 + 1] = -s * 0.1;
      o.bob = abs(cos(ph)) * 0.014;
      A[B_TOOL * 9] = -A[B_ARMR * 9] + 0.25;
    } else if (mode === 2 || mode === 3) {   // arbeiten / kämpfen
      const sp = mode === 3 ? 11 : 6.5 + (o.id % 5) * 0.4;
      const c = (t * sp + o.id) % TAU;
      // schneller Abschlag, langsames Ausholen
      const u = c < 1.7 ? c / 1.7 : 1 - (c - 1.7) / (TAU - 1.7);
      const arm = -2.8 + (1 - u) * 2.2;
      A[B_ARMR * 9] = arm; A[B_ARML * 9] = mode === 3 ? -0.7 : arm * 0.75; A[B_ARML * 9 + 2] = mode === 3 ? 0.1 : -0.25;
      A[B_TOOL * 9] = o.tool === 'stick' || o.tool === 'torch' ? 0.6 : 2.0;
      A[B_BODY * 9] = lean + 0.12 + (1 - u) * 0.18;
      A[B_HEAD * 9] = 0.1;
      if (mode === 3) { A[B_LEGL * 9] = -0.35; A[B_LEGR * 9] = 0.3; }
      o.bob = 0;
    } else if (mode === 4) {   // zappeln (an der Hand)
      const s = sin(t * 16 + o.id);
      A[B_LEGL * 9] = s * 0.8; A[B_LEGR * 9] = -s * 0.8;
      A[B_ARML * 9] = -2.6 + s * 0.4; A[B_ARMR * 9] = -2.6 - s * 0.4;
      A[B_ARML * 9 + 2] = 0.4; A[B_ARMR * 9 + 2] = -0.4;
      A[B_TOOL * 9] = 0.3;
      o.bob = 0;
    } else {   // stehen
      const b = sin(t * 1.7 + o.id) ;
      A[B_ARML * 9] = b * 0.04; A[B_ARMR * 9] = -b * 0.04;
      A[B_ARML * 9 + 2] = 0.06; A[B_ARMR * 9 + 2] = -0.06;
      A[B_BODY * 9] = lean;
      A[B_HEAD * 9 + 1] = sin(t * 0.37 + o.id * 1.3) * 0.5 * (sin(t * 0.23 + o.id) > 0.3 ? 1 : 0.2);
      A[B_TOOL * 9] = 0.15;
      o.bob = 0;
      if (o.carry) { A[B_ARML * 9] = -1.0; A[B_ARMR * 9] = -1.0; A[B_ARML * 9 + 2] = 0.2; A[B_ARMR * 9 + 2] = -0.2; }
    }
  }

  // ---------------------------------------------------------------- Belagerungsgerät
  function buildSiege(kind, team) {
    const rig = new Rig();
    const wood = C(PAL.wood), woodD = C(PAL.woodD), woodL = C(PAL.woodL);
    rig.bone(-1, 0, 0.09, 0);                // 0 Wagen
    rig.bone(0, 0, 0.0, 0);                  // 1 Ramme / Wurfarm
    for (const [x, z] of [[0.17, 0.2], [-0.17, 0.2], [0.17, -0.2], [-0.17, -0.2]]) rig.bone(0, x, -0.0, z);   // 2..5 Räder
    for (let w = 2; w <= 5; w++) { rig.add(w, G_CYL, woodD, 0, 0, 0, 0.18, 0.04, 0.18, 0, 0, PI / 2); rig.add(w, G_BOX, woodL, 0, 0, 0, 0.045, 0.16, 0.02, 0, 0, 0, 0, 1); }
    if (kind === 'ram') {
      rig.add(0, G_BOX, wood, 0, 0.03, 0, 0.3, 0.05, 0.56);
      for (const x of [0.13, -0.13]) for (const z of [0.22, -0.22]) rig.add(0, G_BOX, woodD, x, 0.17, z, 0.035, 0.28, 0.035);
      rig.add(0, G_BOX, C('#6b5a3a'), 0.085, 0.33, 0, 0.2, 0.025, 0.6, 0, 0, -0.65);
      rig.add(0, G_BOX, C('#6b5a3a'), -0.085, 0.33, 0, 0.2, 0.025, 0.6, 0, 0, 0.65);
      rig.add(0, G_BOX, team.main, 0, 0.3, -0.31, 0.24, 0.12, 0.012);
      rig.add(1, G_CYL, C('#5a4028'), 0, 0.14, 0.06, 0.08, 0.7, 0.08, PI / 2, 0, 0);
      rig.add(1, G_CYL, C(PAL.metalD), 0, 0.14, 0.43, 0.1, 0.08, 0.1, PI / 2, 0, 0);
    } else {
      rig.add(0, G_BOX, wood, 0.13, 0.03, 0, 0.04, 0.05, 0.56); rig.add(0, G_BOX, wood, -0.13, 0.03, 0, 0.04, 0.05, 0.56);
      rig.add(0, G_BOX, wood, 0, 0.03, 0.2, 0.3, 0.04, 0.04); rig.add(0, G_BOX, wood, 0, 0.03, -0.2, 0.3, 0.04, 0.04);
      for (const x of [0.11, -0.11]) rig.add(0, G_BOX, woodD, x, 0.15, 0.05, 0.035, 0.26, 0.035, -0.15, 0, 0);
      rig.add(0, G_BOX, woodD, 0, 0.26, 0.07, 0.26, 0.035, 0.035);
      rig.add(0, G_BOX, team.main, 0.15, 0.2, -0.2, 0.012, 0.1, 0.14);
      // Wurfarm am Drehpunkt
      rig.bones[1].y = 0.07; rig.bones[1].z = -0.05;
      rig.add(1, G_BOX, woodL, 0, 0.18, 0, 0.035, 0.38, 0.035);
      rig.add(1, G_FRU, woodD, 0, 0.38, 0, 0.09, 0.05, 0.09, PI, 0, 0);
      rig.add(1, G_SPH, C(PAL.stone), 0, 0.4, 0, 0.07, 0.07, 0.07, 0, 0, 0, 0, 1);
    }
    rig.top = 0.45;
    rig.kind = kind;
    rig.anim = function (o, t, A) {
      for (let w = 2; w <= 5; w++) A[w * 9] = o.ph * 0.6;
      if (kind === 'ram') A[1 * 9 + 5] = o.mode === 2 || o.mode === 3 ? -0.06 + 0.1 * Math.max(0, sin(t * 4 + o.id)) : 0;
      else A[1 * 9] = (o.mode === 2 || o.mode === 3) ? -0.5 + 1.6 * Math.pow(Math.max(0, sin(t * 1.6 + o.id)), 6) : -0.6;
      o.bob = 0;
    };
    return rig.done();
  }

  // ---------------------------------------------------------------- Tiere und Monster
  // Vierbeiner: Knochen 0 Rumpf, 1 Kopf, 2..5 Beine (vl, vr, hl, hr), 6 Schwanz
  function quad(rig, o) {
    const { len, h, w, legH, legW } = o;
    rig.bone(-1, 0, legH, 0);                                   // 0
    rig.bone(0, 0, o.neckY || h * 0.35, len * 0.48);            // 1 Kopf
    rig.bone(-1, w * 0.32, legH, len * 0.34); rig.bone(-1, -w * 0.32, legH, len * 0.34);
    rig.bone(-1, w * 0.32, legH, -len * 0.34); rig.bone(-1, -w * 0.32, legH, -len * 0.34);
    rig.bone(0, 0, h * 0.2, -len * 0.5);                        // 6 Schwanz
    for (let b = 2; b <= 5; b++) {
      rig.add(b, G_BOX, o.legC, 0, -legH / 2, 0, legW, legH, legW);
      if (o.hoof) rig.add(b, G_BOX, o.hoof, 0, -legH + 0.012, 0.004, legW * 1.1, 0.024, legW * 1.2, 0, 0, 0, 0, 1);
    }
    rig.top = legH + h;
  }
  function animQuad(o, t, A, rig) {
    const g = rig.gait || 0.6;
    if (o.mode === 1) {
      const s = sin(o.ph) * g;
      A[2 * 9] = s; A[5 * 9] = s; A[3 * 9] = -s; A[4 * 9] = -s;
      A[0 * 9 + 2] = sin(o.ph) * 0.04;
      A[1 * 9] = sin(o.ph * 2) * 0.06;
      o.bob = abs(cos(o.ph)) * 0.012 * (rig.bobK || 1);
      if (rig.hop) { o.bob = abs(sin(o.ph * 0.5)) * 0.07; A[2 * 9] = A[3 * 9] = -0.6 * abs(sin(o.ph * 0.5)); A[4 * 9] = A[5 * 9] = 0.8 * abs(sin(o.ph * 0.5)); }
    } else if (o.mode === 3) {
      const s = Math.max(0, sin(t * 9 + o.id));
      A[1 * 9] = -0.3 + s * 0.5; A[0 * 9] = -s * 0.12; o.bob = s * 0.02;
      A[2 * 9] = A[3 * 9] = -s * 0.4;
    } else {
      // grasen: Kopf zum Boden
      const g2 = rig.graze ? Math.max(0, sin(t * 0.4 + o.id * 1.7)) : 0;
      A[1 * 9] = g2 > 0.3 ? 0.9 * Math.min(1, (g2 - 0.3) * 4) : sin(t * 0.8 + o.id) * 0.08;
      A[1 * 9 + 1] = g2 > 0.3 ? 0 : sin(t * 0.5 + o.id) * 0.4;
      o.bob = 0;
    }
    A[6 * 9 + 1] = sin(t * (o.mode === 1 ? 10 : 3) + o.id) * 0.4;
  }

  function buildAnimal(kind, a) {
    const rig = new Rig();
    rig.kind = kind;
    rig.anim = animQuad;
    const v = hash(a.id, 7);
    switch (kind) {
      case 'sheep': {
        const wool = C(v < 0.12 ? '#4a4440' : '#ece6d8'), face = C('#2f2a28');
        quad(rig, { len: 0.34, h: 0.2, w: 0.2, legH: 0.12, legW: 0.032, legC: face });
        rig.add(0, G_SPH, wool, 0, 0.09, 0, 0.26, 0.21, 0.38);
        rig.add(0, G_SPH, wool, 0, 0.14, 0.05, 0.22, 0.16, 0.26, 0, 0, 0, 0, 1);
        rig.add(1, G_SPH, wool, 0, 0.03, -0.01, 0.12, 0.1, 0.11);
        rig.add(1, G_BOX, face, 0, 0.0, 0.05, 0.075, 0.08, 0.11);
        for (const s of [1, -1]) rig.add(1, G_BOX, face, s * 0.06, 0.02, 0.02, 0.06, 0.02, 0.03, 0, 0, s * 0.4, 0, 1);
        rig.add(6, G_SPH, wool, 0, 0, -0.02, 0.06, 0.06, 0.06, 0, 0, 0, 0, 1);
        rig.graze = 1;
        break;
      }
      case 'cow': {
        const base = C(v < 0.5 ? '#efeae0' : '#8a5a36'), spot = C(v < 0.5 ? '#2a2422' : '#efeae0');
        quad(rig, { len: 0.56, h: 0.28, w: 0.28, legH: 0.18, legW: 0.05, legC: base, hoof: C('#2a2422') });
        rig.add(0, G_BOX, base, 0, 0.12, 0, 0.26, 0.24, 0.56);
        rig.add(0, G_BOX, spot, 0.131, 0.15, 0.06, 0.004, 0.11, 0.16, 0, 0, 0, 0, 1);
        rig.add(0, G_BOX, spot, -0.131, 0.1, -0.12, 0.004, 0.12, 0.14, 0, 0, 0, 0, 1);
        rig.add(0, G_BOX, spot, 0, 0.243, -0.05, 0.14, 0.004, 0.16, 0, 0, 0, 0, 1);
        rig.add(0, G_SPH, C('#e9a0a0'), 0, -0.01, -0.14, 0.09, 0.06, 0.1, 0, 0, 0, 0, 1);
        rig.add(1, G_BOX, base, 0, 0.0, 0.05, 0.15, 0.15, 0.16);
        rig.add(1, G_BOX, C('#d9a090'), 0, -0.04, 0.13, 0.12, 0.08, 0.06);
        for (const s of [1, -1]) { rig.add(1, G_CONE, C(PAL.bone), s * 0.08, 0.09, 0.02, 0.025, 0.08, 0.025, 0, 0, -s * 0.9); rig.add(1, G_BOX, base, s * 0.09, 0.04, 0.0, 0.06, 0.025, 0.04, 0, 0, 0, 0, 1); }
        rig.add(6, G_CYL, base, 0, -0.1, -0.01, 0.015, 0.2, 0.015, 0.2, 0, 0);
        rig.graze = 1; rig.gait = 0.45;
        break;
      }
      case 'chicken': case 'giantchicken': {
        const k = kind === 'giantchicken' ? 5 : 1;
        rig.bone(-1, 0, 0.07 * k, 0);                    // 0 Rumpf
        rig.bone(0, 0, 0.05 * k, 0.04 * k);              // 1 Kopf
        rig.bone(-1, 0.025 * k, 0.07 * k, 0); rig.bone(-1, -0.025 * k, 0.07 * k, 0);   // 2,3 Beine
        rig.bone(0, 0, 0.02 * k, -0.06 * k);             // 4 Schwanz
        rig.bone(0, 0.05 * k, 0.02 * k, 0); rig.bone(0, -0.05 * k, 0.02 * k, 0);      // 5,6 Flügel
        const body = C(kind === 'giantchicken' ? '#f2ede2' : (v < 0.3 ? '#a8673a' : '#f2ede2'));
        rig.add(0, G_SPH, body, 0, 0.02 * k, 0, 0.1 * k, 0.09 * k, 0.13 * k);
        rig.add(1, G_SPH, body, 0, 0.03 * k, 0, 0.06 * k, 0.065 * k, 0.06 * k);
        rig.add(1, G_CONE, C('#e8a628'), 0, 0.025 * k, 0.045 * k, 0.018 * k, 0.035 * k, 0.018 * k, PI / 2, 0, 0);
        rig.add(1, G_BOX, C('#d8342a'), 0, 0.07 * k, 0.005 * k, 0.012 * k, 0.03 * k, 0.04 * k);
        rig.add(1, G_BOX, C('#d8342a'), 0, 0.0, 0.035 * k, 0.01 * k, 0.025 * k, 0.012 * k, 0, 0, 0, 0, 1);
        for (const s of [1, -1]) rig.add(1, G_SPH, C(PAL.ink), s * 0.026 * k, 0.04 * k, 0.02 * k, 0.012 * k, 0.012 * k, 0.012 * k, 0, 0, 0, 0, 1);
        for (const b of [2, 3]) { rig.add(b, G_CYL, C('#e8a628'), 0, -0.035 * k, 0, 0.008 * k, 0.07 * k, 0.008 * k); rig.add(b, G_BOX, C('#e8a628'), 0, -0.068 * k, 0.012 * k, 0.03 * k, 0.006 * k, 0.04 * k, 0, 0, 0, 0, 1); }
        rig.add(4, G_CONE, shade(body, 0.85), 0, 0.03 * k, 0, 0.05 * k, 0.07 * k, 0.03 * k, -0.6, 0, 0);
        for (const b of [5, 6]) rig.add(b, G_SPH, shade(body, 0.92), 0, 0, 0, 0.03 * k, 0.06 * k, 0.1 * k);
        rig.top = 0.19 * k;
        rig.anim = function (o, t, A) {
          if (o.mode === 1) { const s = sin(o.ph * 1.6); A[2 * 9] = s * 0.8; A[3 * 9] = -s * 0.8; A[1 * 9 + 5] = sin(o.ph * 3.2) * 0.012 * k; o.bob = abs(s) * 0.008 * k; }
          else { const p = Math.max(0, sin(t * 3 + o.id * 2.1)); A[1 * 9] = p > 0.7 ? 1.0 : 0; A[0 * 9] = p > 0.7 ? 0.35 : 0; o.bob = 0; }
          const f = o.mode === 3 || kind === 'giantchicken' && o.mode === 1 ? sin(t * 20) * 0.6 : 0;
          A[5 * 9 + 2] = -0.1 - abs(f); A[6 * 9 + 2] = 0.1 + abs(f);
        };
        break;
      }
      case 'rabbit': {
        const fur = C(v < 0.5 ? '#9a8064' : '#c9b9a0');
        quad(rig, { len: 0.14, h: 0.1, w: 0.1, legH: 0.04, legW: 0.025, legC: fur });
        rig.add(0, G_SPH, fur, 0, 0.04, -0.01, 0.1, 0.1, 0.16);
        rig.add(1, G_SPH, fur, 0, 0.03, 0.0, 0.075, 0.07, 0.08);
        for (const s of [1, -1]) rig.add(1, G_BOX, fur, s * 0.018, 0.1, -0.01, 0.018, 0.09, 0.03, -0.2, 0, s * 0.15);
        for (const s of [1, -1]) rig.add(1, G_SPH, C(PAL.ink), s * 0.028, 0.04, 0.025, 0.012, 0.012, 0.012, 0, 0, 0, 0, 1);
        rig.add(6, G_SPH, C('#f2efe8'), 0, 0, -0.01, 0.04, 0.04, 0.04);
        rig.hop = 1; rig.graze = 1;
        break;
      }
      case 'deer': {
        const fur = C('#9a6a3e'), dark = C('#5a3c22');
        quad(rig, { len: 0.42, h: 0.2, w: 0.18, legH: 0.26, legW: 0.03, legC: fur, hoof: dark, neckY: 0.2 });
        rig.add(0, G_SPH, fur, 0, 0.08, 0, 0.18, 0.18, 0.46);
        rig.add(0, G_BOX, fur, 0, 0.16, 0.18, 0.07, 0.2, 0.08, 0.5, 0, 0);
        rig.add(1, G_BOX, fur, 0, 0.03, 0.04, 0.07, 0.07, 0.14, 0.15, 0, 0);
        rig.add(1, G_BOX, dark, 0, 0.015, 0.11, 0.04, 0.03, 0.03, 0, 0, 0, 0, 1);
        if (v < 0.6) for (const s of [1, -1]) {
          rig.add(1, G_CYL, C('#d8c8a8'), s * 0.03, 0.12, 0.0, 0.012, 0.14, 0.012, -0.2, 0, -s * 0.35);
          rig.add(1, G_CYL, C('#d8c8a8'), s * 0.06, 0.16, 0.02, 0.01, 0.07, 0.01, 0.5, 0, -s * 0.9, 0, 1);
          rig.add(1, G_CYL, C('#d8c8a8'), s * 0.045, 0.19, -0.02, 0.01, 0.06, 0.01, -0.6, 0, -s * 0.3, 0, 1);
        }
        for (const s of [1, -1]) rig.add(1, G_BOX, fur, s * 0.045, 0.06, -0.01, 0.05, 0.02, 0.025, 0, 0, s * 0.3, 0, 1);
        rig.add(6, G_SPH, C('#efe8dc'), 0, 0, -0.01, 0.05, 0.06, 0.04);
        rig.graze = 1; rig.gait = 0.7;
        break;
      }
      case 'wolf': {
        const fur = C(v < 0.2 ? '#3a3836' : '#77736e'), lite = C('#b5afa6');
        quad(rig, { len: 0.36, h: 0.15, w: 0.14, legH: 0.15, legW: 0.032, legC: fur });
        rig.add(0, G_BOX, fur, 0, 0.07, 0, 0.13, 0.13, 0.38);
        rig.add(0, G_BOX, lite, 0, 0.02, 0.05, 0.1, 0.04, 0.24, 0, 0, 0, 0, 1);
        rig.add(1, G_BOX, fur, 0, 0.03, 0.02, 0.1, 0.1, 0.1);
        rig.add(1, G_BOX, lite, 0, 0.0, 0.09, 0.055, 0.05, 0.1);
        rig.add(1, G_BOX, C(PAL.ink), 0, 0.015, 0.14, 0.025, 0.02, 0.012, 0, 0, 0, 0, 1);
        for (const s of [1, -1]) { rig.add(1, G_CONE, fur, s * 0.035, 0.1, -0.0, 0.03, 0.06, 0.02); rig.add(1, G_SPH, C('#e8c84a'), s * 0.03, 0.05, 0.072, 0.014, 0.012, 0.01, 0, 0, 0, GLOW, 1); }
        rig.add(6, G_CYL, fur, 0, -0.06, -0.06, 0.035, 0.18, 0.035, -0.7, 0, 0);
        rig.gait = 0.8;
        break;
      }
      case 'bear': {
        const fur = C(v < 0.25 ? '#2c2622' : '#5e3e26'), snout = C('#9a7a58');
        quad(rig, { len: 0.46, h: 0.3, w: 0.3, legH: 0.15, legW: 0.08, legC: fur });
        rig.add(0, G_SPH, fur, 0, 0.13, 0, 0.32, 0.3, 0.52);
        rig.add(0, G_SPH, fur, 0, 0.2, 0.12, 0.28, 0.24, 0.24, 0, 0, 0, 0, 1);
        rig.add(1, G_SPH, fur, 0, 0.04, 0.04, 0.18, 0.17, 0.17);
        rig.add(1, G_BOX, snout, 0, 0.0, 0.12, 0.08, 0.07, 0.08);
        rig.add(1, G_SPH, C(PAL.ink), 0, 0.02, 0.165, 0.03, 0.025, 0.02, 0, 0, 0, 0, 1);
        for (const s of [1, -1]) { rig.add(1, G_SPH, fur, s * 0.07, 0.12, 0.0, 0.05, 0.05, 0.03); rig.add(1, G_SPH, C(PAL.ink), s * 0.04, 0.07, 0.1, 0.015, 0.015, 0.01, 0, 0, 0, 0, 1); }
        rig.gait = 0.45; rig.bobK = 1.5;
        break;
      }
      case 'crab': {
        const sh = C('#d0502e'), dk = C('#8e2e1a');
        rig.bone(-1, 0, 0.05, 0);
        rig.bone(0, 0.07, 0.0, 0.06); rig.bone(0, -0.07, 0.0, 0.06);           // 1,2 Scheren
        for (let k = 0; k < 6; k++) rig.bone(0, (k < 3 ? 1 : -1) * 0.06, 0, -0.04 + (k % 3) * 0.04);   // 3..8 Beine
        rig.add(0, G_SPH, sh, 0, 0.0, 0, 0.16, 0.06, 0.12);
        for (const s of [1, -1]) rig.add(0, G_CYL, C(PAL.ink), s * 0.025, 0.04, 0.05, 0.008, 0.04, 0.008, 0, 0, 0, 0, 1);
        for (const b of [1, 2]) { rig.add(b, G_SPH, sh, 0, 0, 0.03, 0.05, 0.035, 0.07); rig.add(b, G_BOX, dk, 0, 0.0, 0.07, 0.03, 0.015, 0.04, 0, 0, 0, 0, 1); }
        for (let b = 3; b <= 8; b++) rig.add(b, G_BOX, dk, (b < 6 ? 1 : -1) * 0.035, -0.02, 0, 0.07, 0.012, 0.012, 0, 0, (b < 6 ? -1 : 1) * 0.5);
        rig.top = 0.09; rig.side = 1;
        rig.anim = function (o, t, A) {
          for (let b = 3; b <= 8; b++) A[b * 9 + 2] = sin(o.ph * 2 + b * 1.7) * 0.3;
          const c = o.mode === 3 ? sin(t * 14) : sin(t * 2 + o.id) * 0.3;
          A[1 * 9 + 1] = c * 0.4; A[2 * 9 + 1] = -c * 0.4;
          o.bob = 0;
        };
        break;
      }
      case 'fish': {
        const sc = C(v < 0.5 ? '#6f8ea8' : '#c48a3a');
        rig.bone(-1, 0, 0, 0); rig.bone(0, 0, 0, -0.06);
        rig.add(0, G_SPH, sc, 0, 0, 0, 0.05, 0.07, 0.15);
        rig.add(0, G_BOX, shade(sc, 0.8), 0, 0.04, -0.01, 0.006, 0.04, 0.05, 0, 0, 0, 0, 1);
        rig.add(1, G_CONE, shade(sc, 0.85), 0, 0, -0.03, 0.01, 0.06, 0.07, -PI / 2, 0, 0);
        rig.top = 0.05; rig.water = 1;
        rig.anim = function (o, t, A) { A[1 * 9 + 1] = sin(t * 8 + o.id) * 0.5; A[0 * 9 + 1] = sin(t * 8 + o.id) * 0.12; o.bob = 0; };
        break;
      }
      case 'dragon': {
        const sc = C(v < 0.5 ? '#9e2c22' : '#2e6a3a'), belly = C('#d8b060'), wing = C(v < 0.5 ? '#6a1e1a' : '#1e4a2a'), horn = C(PAL.bone);
        rig.bone(-1, 0, 0.5, 0);                         // 0 Rumpf
        rig.bone(0, 0, 0.12, 0.5);                        // 1 Hals/Kopf
        rig.bone(0, 0.16, 0.15, 0.1); rig.bone(0, -0.16, 0.15, 0.1);   // 2,3 Flügel innen
        rig.bone(2, 0.62, 0, 0); rig.bone(3, -0.62, 0, 0);             // 4,5 Flügel außen
        rig.bone(0, 0, 0.02, -0.45);                      // 6 Schwanz 1
        rig.bone(6, 0, 0, -0.4);                          // 7 Schwanz 2
        for (const [x, z] of [[0.14, 0.22], [-0.14, 0.22], [0.15, -0.2], [-0.15, -0.2]]) rig.bone(0, x, -0.05, z);   // 8..11 Beine
        rig.add(0, G_SPH, sc, 0, 0, 0, 0.42, 0.36, 0.95);
        rig.add(0, G_SPH, belly, 0, -0.07, 0.03, 0.34, 0.24, 0.8, 0, 0, 0, 0, 1);
        for (let k = 0; k < 5; k++) rig.add(0, G_CONE, horn, 0, 0.18, 0.3 - k * 0.15, 0.04, 0.09, 0.06, 0, 0, 0, 0, 1);
        rig.add(1, G_CYL, sc, 0, 0.12, 0.08, 0.16, 0.45, 0.16, 0.9, 0, 0);
        rig.add(1, G_BOX, sc, 0, 0.3, 0.3, 0.2, 0.15, 0.32);
        rig.add(1, G_BOX, belly, 0, 0.24, 0.36, 0.15, 0.05, 0.24, 0, 0, 0, 0, 1);
        for (const s of [1, -1]) { rig.add(1, G_CONE, horn, s * 0.07, 0.42, 0.18, 0.04, 0.2, 0.04, -0.9, 0, -s * 0.2); rig.add(1, G_SPH, C('#ffd23a'), s * 0.08, 0.34, 0.38, 0.04, 0.03, 0.04, 0, 0, 0, GLOW); }
        for (const [b, s] of [[2, 1], [3, -1]]) {
          rig.add(b, G_BOX, wing, s * 0.32, 0, 0, 0.64, 0.025, 0.42);
          rig.add(b, G_CYL, sc, s * 0.32, 0.02, 0.2, 0.04, 0.66, 0.04, 0, 0, PI / 2);
        }
        for (const [b, s] of [[4, 1], [5, -1]]) {
          rig.add(b, G_BOX, wing, s * 0.3, 0, -0.05, 0.6, 0.02, 0.36, 0, s * 0.25, 0);
          rig.add(b, G_CONE, wing, s * 0.55, 0, -0.25, 0.25, 0.3, 0.02, PI / 2, 0, 0);
        }
        rig.add(6, G_CONE, sc, 0, 0, -0.2, 0.22, 0.45, 0.22, -PI / 2, 0, 0);
        rig.add(7, G_CONE, sc, 0, 0, -0.18, 0.12, 0.4, 0.12, -PI / 2, 0, 0);
        rig.add(7, G_CONE, horn, 0, 0, -0.4, 0.1, 0.12, 0.02, -PI / 2, 0, 0, 0, 1);
        for (let b = 8; b <= 11; b++) rig.add(b, G_BOX, sc, 0, -0.12, 0, 0.08, 0.24, 0.1);
        rig.top = 1.0; rig.fly = 1; rig.big = 1;
        rig.anim = function (o, t, A) {
          const air = o.alt > 0.3;
          const f = air ? sin(t * 5 + o.id) : 0;
          A[2 * 9 + 2] = air ? f * 0.65 : 1.2; A[3 * 9 + 2] = air ? -f * 0.65 : -1.2;
          A[4 * 9 + 2] = air ? f * 0.45 + 0.1 : 1.6; A[5 * 9 + 2] = air ? -f * 0.45 - 0.1 : -1.6;
          A[6 * 9 + 1] = sin(t * 2 + o.id) * 0.25; A[7 * 9 + 1] = sin(t * 2 + o.id - 0.8) * 0.35;
          A[6 * 9] = air ? 0.08 : 0.15;
          A[1 * 9] = o.mode === 3 ? 0.3 : sin(t * 1.3) * 0.08;
          for (let b = 8; b <= 11; b++) A[b * 9] = air ? -0.9 : (o.mode === 1 ? sin(o.ph + b * PI / 2) * 0.5 : 0);
          o.bob = air ? -f * 0.08 : 0;
        };
        break;
      }
      case 'zombie': case 'skeleton': {
        const S = { race: 'human', role: 'farmer', gov: 'tribe', team: { main: C('#5a5048'), dark: C('#3a342e'), light: C('#7a7066') }, female: false, child: false };
        if (kind === 'zombie') { S.skin = C(v < 0.5 ? '#8fa47a' : '#9aa486'); S.hair = C('#3a3a2e'); }
        else { S.skin = C(PAL.bone); S.hair = C(PAL.bone); }
        return buildUndead(kind, S);
      }
      case 'slime': {
        const k = a.size === 3 ? 1.7 : a.size === 2 ? 1.25 : 0.85;
        const g = C(v < 0.5 ? '#58c048' : '#4aa8c8');
        rig.bone(-1, 0, 0.09 * k, 0);
        rig.add(0, G_SPH, g, 0, 0, 0, 0.26 * k, 0.2 * k, 0.26 * k, 0, 0, 0, JELLY);
        rig.add(0, G_SPH, shade(g, 0.6), 0, -0.02 * k, 0, 0.12 * k, 0.09 * k, 0.12 * k, 0, 0, 0, SOLID);
        for (const s of [1, -1]) { rig.add(0, G_SPH, C('#f4f8f0'), s * 0.045 * k, 0.04 * k, 0.1 * k, 0.05 * k, 0.06 * k, 0.03 * k); rig.add(0, G_SPH, C(PAL.ink), s * 0.045 * k, 0.04 * k, 0.115 * k, 0.025 * k, 0.03 * k, 0.012 * k); }
        rig.top = 0.2 * k;
        rig.anim = function (o, t, A) {
          const w = sin(t * (o.mode === 1 ? 9 : 3) + o.id);
          A[6] = 1 + w * 0.12; A[7] = 1 - w * 0.15; A[8] = 1 + w * 0.12;
          A[4] = -w * 0.015 * k;
          o.bob = o.mode === 1 ? abs(sin(o.ph * 0.7)) * 0.05 * k : 0;
        };
        break;
      }
      case 'ghost': {
        const g = C('#e8f0ff');
        rig.bone(-1, 0, 0.3, 0); rig.bone(0, 0.12, 0.05, 0.02); rig.bone(0, -0.12, 0.05, 0.02);
        rig.add(0, G_SPH, g, 0, 0.08, 0, 0.26, 0.26, 0.24, 0, 0, 0, GHOST);
        rig.add(0, G_CONE, g, 0, -0.1, 0, 0.3, 0.36, 0.28, PI, 0, 0, GHOST);
        for (const s of [1, -1]) rig.add(0, G_SPH, C('#1a1a2a'), s * 0.05, 0.1, 0.11, 0.05, 0.07, 0.03);
        rig.add(0, G_SPH, C('#1a1a2a'), 0, 0.02, 0.115, 0.04, 0.05, 0.02);
        rig.add(1, G_CONE, g, 0, -0.06, 0.03, 0.06, 0.16, 0.06, 0.4, 0, 0.4, GHOST);
        rig.add(2, G_CONE, g, 0, -0.06, 0.03, 0.06, 0.16, 0.06, 0.4, 0, -0.4, GHOST);
        rig.top = 0.5; rig.ghost = 1;
        rig.anim = function (o, t, A) { o.bob = 0.12 + sin(t * 2.2 + o.id) * 0.06; A[1] = sin(t * 1.3 + o.id) * 0.2; A[2] = sin(t * 3) * 0.06; A[9] = A[18] = -0.8 + sin(t * 3 + o.id) * 0.3; };
        break;
      }
      case 'demon': {
        const S = { race: 'orc', role: 'farmer', gov: 'tribe', team: { main: C('#5a1a14'), dark: C('#3a0e0a'), light: C('#8a2a20') }, skin: C('#b0301e'), hair: C('#2a0a08') };
        return buildDemonLike('demon', S);
      }
      case 'yeti': {
        const S = { race: 'orc', role: 'farmer', gov: 'tribe', team: { main: C('#e8eef2'), dark: C('#c8d2da'), light: C('#ffffff') }, skin: C('#8aa0b4'), hair: C('#eef3f6') };
        return buildDemonLike('yeti', S);
      }
      case 'sandworm': {
        const sk = C('#b89a6a'), dk = C('#8a7048'), maw = C('#5a1e1a');
        rig.bone(-1, 0, 0, 0);
        const N = 7;
        for (let k = 0; k < N; k++) rig.bone(k === 0 ? 0 : k, 0, 0, 0);    // Glieder 1..7 (Kette)
        for (let k = 1; k <= N; k++) { const r = 0.42 - k * 0.025; rig.add(k, G_CYL, k & 1 ? sk : dk, 0, 0, 0, r, 0.22, r); rig.add(k, G_CYL, dk, 0, 0.1, 0, r * 1.06, 0.03, r * 1.06, 0, 0, 0, 0, 1); }
        rig.add(N, G_CYL, maw, 0, 0.12, 0, 0.26, 0.02, 0.26);
        for (let k = 0; k < 6; k++) { const a2 = k / 6 * TAU; rig.add(N, G_CONE, C(PAL.bone), sin(a2) * 0.13, 0.15, cos(a2) * 0.13, 0.04, 0.09, 0.04, 0, 0, 0, 0, 1); }
        rig.add(0, G_SPH, C(PAL.sand), 0, 0.0, 0, 0.9, 0.14, 0.9);
        rig.top = 1.4; rig.worm = N;
        rig.anim = function (o, t, A) {
          const em = o.em || 0, sw = sin(t * 2 + o.id) * 0.15;
          // Bogen aus dem Sand: jedes Glied 0,2 höher und etwas gekrümmt
          for (let k = 1; k <= N; k++) {
            const off = k * 9;
            A[off + 4] = (k === 1 ? -1.3 + em * 1.25 : 0.2 * em);
            A[off] = (k > 3 ? 0.22 : 0.05) * em + (k === N ? 0.3 : 0);
            A[off + 2] = sw * (k / N);
            A[off + 6] = A[off + 7] = A[off + 8] = em < 0.05 ? 0.001 : 1;
          }
          A[6] = A[8] = 0.6 + em * 0.6; A[7] = em > 0.02 || o.moving ? 1 : 0.001;
          o.bob = 0;
        };
        break;
      }
      case 'treant': {
        const bark = C('#5a432c'), barkD = C('#3e2e1e'), leaf = C(v < 0.5 ? '#3f7a32' : '#5a8a2e');
        rig.bone(-1, 0, 0.35, 0);
        rig.bone(0, 0, 0.75, 0);                               // 1 Krone
        rig.bone(0, 0.2, 0.55, 0); rig.bone(0, -0.2, 0.55, 0); // 2,3 Äste (Arme)
        rig.bone(-1, 0.1, 0.35, 0); rig.bone(-1, -0.1, 0.35, 0); // 4,5 Wurzelbeine
        rig.add(0, G_FRU, bark, 0, 0.35, 0, 0.32, 0.8, 0.3);
        rig.add(0, G_BOX, barkD, 0, 0.4, 0.15, 0.2, 0.04, 0.02, 0, 0, 0, 0, 1);
        for (const s of [1, -1]) rig.add(0, G_SPH, C('#ffe27a'), s * 0.06, 0.5, 0.14, 0.04, 0.03, 0.02, 0, 0, 0, GLOW);
        rig.add(1, G_SPH, leaf, 0, 0.12, 0, 0.7, 0.5, 0.6);
        rig.add(1, G_SPH, shade(leaf, 0.85), 0.2, 0.25, -0.05, 0.4, 0.34, 0.4);
        rig.add(1, G_SPH, shade(leaf, 1.12), -0.18, 0.28, 0.1, 0.38, 0.32, 0.36, 0, 0, 0, 0, 1);
        for (const [b, s] of [[2, 1], [3, -1]]) { rig.add(b, G_CYL, bark, 0, -0.18, 0, 0.07, 0.38, 0.07, 0, 0, s * 0.2); rig.add(b, G_SPH, leaf, s * 0.04, -0.38, 0.02, 0.14, 0.12, 0.14, 0, 0, 0, 0, 1); }
        for (const b of [4, 5]) { rig.add(b, G_CYL, barkD, 0, -0.17, 0, 0.11, 0.36, 0.11); rig.add(b, G_BOX, barkD, 0, -0.33, 0.05, 0.14, 0.04, 0.2, 0, 0, 0, 0, 1); }
        rig.top = 1.35;
        rig.anim = function (o, t, A) {
          const s = o.mode === 1 ? sin(o.ph * 0.6) : 0;
          A[4 * 9] = s * 0.35; A[5 * 9] = -s * 0.35;
          A[2 * 9] = o.mode === 3 ? -1.8 + sin(t * 5) * 0.6 : -s * 0.3 + sin(t * 0.7) * 0.05; A[3 * 9] = o.mode === 3 ? -1.4 : s * 0.3;
          A[0 * 9 + 2] = s * 0.05; A[1 * 9 + 2] = sin(t * 0.9 + o.id) * 0.05;
          o.bob = abs(s) * 0.02;
        };
        break;
      }
      case 'golem': {
        const rock = C('#7a7486'), rockD = C('#56506a'), cry = C('#7fe8ff');
        rig.bone(-1, 0, 0.32, 0); rig.bone(0, 0, 0.42, 0.04);
        rig.bone(0, 0.27, 0.36, 0); rig.bone(0, -0.27, 0.36, 0);
        rig.bone(-1, 0.12, 0.32, 0); rig.bone(-1, -0.12, 0.32, 0);
        rig.add(0, G_BOX, rock, 0, 0.2, 0, 0.44, 0.42, 0.3, 0.05, 0.1, 0);
        rig.add(0, G_BOX, rockD, 0, 0.02, 0, 0.32, 0.1, 0.24);
        rig.add(0, G_CONE, cry, 0.12, 0.44, -0.05, 0.08, 0.2, 0.08, -0.3, 0, -0.3, GLOW);
        rig.add(0, G_CONE, cry, -0.08, 0.46, -0.08, 0.06, 0.16, 0.06, -0.2, 0, 0.4, GLOW);
        rig.add(0, G_CONE, cry, 0.0, 0.25, 0.16, 0.06, 0.1, 0.06, 1.2, 0, 0, GLOW, 1);
        rig.add(1, G_BOX, rockD, 0, 0.07, 0, 0.18, 0.14, 0.16, 0, 0.2, 0);
        for (const s of [1, -1]) rig.add(1, G_BOX, cry, s * 0.04, 0.08, 0.085, 0.035, 0.02, 0.01, 0, 0, 0, GLOW);
        for (const b of [2, 3]) { rig.add(b, G_BOX, rock, 0, -0.15, 0, 0.14, 0.3, 0.14, 0, 0.3, 0); rig.add(b, G_BOX, rockD, 0, -0.33, 0.02, 0.17, 0.12, 0.17); }
        for (const b of [4, 5]) rig.add(b, G_BOX, rockD, 0, -0.16, 0, 0.14, 0.32, 0.15);
        rig.top = 0.95;
        rig.anim = function (o, t, A) {
          const s = o.mode === 1 ? sin(o.ph * 0.7) : 0;
          A[4 * 9] = s * 0.4; A[5 * 9] = -s * 0.4; A[2 * 9] = -s * 0.3; A[3 * 9] = s * 0.3;
          if (o.mode === 3) { const p = Math.max(0, sin(t * 4)); A[2 * 9] = A[3 * 9] = -2.2 + p * 1.6; }
          A[0 * 9 + 2] = s * 0.06; o.bob = abs(s) * 0.02;
        };
        break;
      }
      default: {
        // unbekannt: Fellkugel
        const c = C('#8a7a6a');
        quad(rig, { len: 0.25, h: 0.15, w: 0.15, legH: 0.1, legW: 0.03, legC: c });
        rig.add(0, G_SPH, c, 0, 0.06, 0, 0.18, 0.15, 0.26);
        rig.add(1, G_SPH, c, 0, 0.03, 0.03, 0.1, 0.1, 0.1);
      }
    }
    return rig.done();
  }

  // Zombie / Skelett: menschliche Gestalt, eigene Bewegung
  function buildUndead(kind, S) {
    let rig;
    if (kind === 'zombie') {
      rig = buildHumanRaw(Object.assign({}, S, { costume: { top: '#5a6a58', sleeve: '#5a6a58', pants: '#4a3e32', shoes: '#2a2420', belt: '#2a2420', rags: 1 } }));
    } else {
      rig = new Rig();
      const R = RACE.human, B = C(PAL.bone), D = C(PAL.boneD);
      rig.bone(-1, 0, R.LL, 0); rig.bone(0, 0, R.TL + 0.012, 0);
      rig.bone(0, 0.09, R.TL - 0.01, 0); rig.bone(0, -0.09, R.TL - 0.01, 0);
      rig.bone(-1, 0.035, R.LL, 0); rig.bone(-1, -0.035, R.LL, 0); rig.bone(B_ARMR, 0, -R.AL, 0);
      for (const b of [B_LEGL, B_LEGR]) { rig.add(b, G_CYL, B, 0, -R.LL / 2, 0, 0.022, R.LL, 0.022); rig.add(b, G_BOX, D, 0, -R.LL + 0.01, 0.01, 0.03, 0.02, 0.05); }
      rig.add(0, G_CYL, D, 0, R.TL * 0.45, 0, 0.022, R.TL, 0.022);
      for (let k = 0; k < 3; k++) rig.add(0, G_BOX, B, 0, R.TL * (0.45 + k * 0.17), 0.005, 0.12 - k * 0.0, 0.016, 0.07);
      rig.add(0, G_BOX, D, 0, 0.0, 0, 0.11, 0.035, 0.06);
      for (const b of [B_ARML, B_ARMR]) rig.add(b, G_CYL, B, 0, -R.AL / 2, 0, 0.02, R.AL, 0.02);
      rig.add(1, G_SPH, B, 0, R.HR, 0, R.HR * 2, R.HR * 2, R.HR * 2);
      rig.add(1, G_BOX, B, 0, R.HR * 0.3, R.HR * 0.3, R.HR * 1.3, R.HR * 0.5, R.HR * 1.2);
      for (const s of [1, -1]) rig.add(1, G_SPH, C('#1c1a20'), s * R.HR * 0.38, R.HR * 1.05, R.HR * 0.82, R.HR * 0.5, R.HR * 0.55, R.HR * 0.3);
      rig.add(B_TOOL, G_BOX, C('#cfc6ac'), 0, 0.05, 0.03, 0.012, 0.3, 0.012);
      rig.top = 0.5;
      rig.lean = 0;
    }
    rig.kind = kind;
    rig.anim = function (o, t, A, r) {
      animHuman(o, t, A, r);
      if (kind === 'zombie') {
        A[B_ARML * 9] = -1.45 + sin(t * 2 + o.id) * 0.1; A[B_ARMR * 9] = -1.5 + sin(t * 2.3 + o.id) * 0.1;
        A[B_HEAD * 9 + 2] = 0.35; A[B_BODY * 9] = 0.18; A[B_BODY * 9 + 2] = sin(o.ph * 0.5) * 0.12;
        if (o.mode === 1) { A[B_LEGL * 9] *= 0.5; A[B_LEGR * 9] *= 0.5; }
      } else if (o.mode !== 3) A[B_HEAD * 9 + 2] = sin(t * 9 + o.id) * 0.05;   // Klappern
    };
    return kind === 'zombie' ? rig : rig.done();
  }

  // menschliche Gestalt mit freier Kleidung (Monster) – liefert ungeschlossenes Gerüst
  function buildHumanRaw(S) {
    const R = RACE.human, rig = new Rig(), cs = S.costume;
    const LL = R.LL, TL = R.TL, TW = R.TW, TD = R.TD, HR = R.HR, AL = R.AL, AT = R.AT, LT = R.LT, SX = TW / 2 + AT * 0.55;
    rig.bone(-1, 0, LL, 0); rig.bone(0, 0, TL + 0.012, 0); rig.bone(0, SX, TL - 0.012, 0); rig.bone(0, -SX, TL - 0.012, 0);
    rig.bone(-1, TW * 0.25, LL, 0); rig.bone(-1, -TW * 0.25, LL, 0); rig.bone(B_ARMR, 0, -AL, 0);
    for (const b of [B_LEGL, B_LEGR]) { rig.add(b, G_BOX, C(cs.pants), 0, -LL / 2, 0, LT, LL, LT * 1.1); rig.add(b, G_BOX, C(cs.shoes), 0, -LL + 0.014, 0.012, LT * 1.08, 0.028, LT * 1.6); }
    rig.add(0, G_BOX, C(cs.top), 0, TL * 0.52, 0, TW, TL * 0.96, TD);
    rig.add(0, G_BOX, C(cs.top), 0, TL * 0.9, 0, TW * 1.06, TL * 0.2, TD * 1.04);
    if (cs.rags) { rig.add(0, G_BOX, shade(C(cs.top), 0.7), TW * 0.2, TL * 0.1, TD * 0.52, 0.04, 0.06, 0.01, 0, 0, 0.3, 0, 1); rig.add(0, G_BOX, S.skin, -TW * 0.2, TL * 0.5, TD * 0.51, 0.05, 0.04, 0.008, 0, 0, 0, 0, 1); }
    for (const b of [B_ARML, B_ARMR]) { rig.add(b, G_BOX, C(cs.sleeve), 0, -AL * 0.3, 0, AT, AL * 0.6, AT); rig.add(b, G_BOX, S.skin, 0, -AL * 0.75, 0, AT * 0.9, AL * 0.5, AT * 0.9); }
    rig.add(1, G_SPH, S.skin, 0, HR, 0, HR * 2, HR * 2.1, HR * 2);
    rig.add(1, G_SPH, S.hair, 0, HR * 1.4, -HR * 0.2, HR * 1.9, HR * 1.3, HR * 1.9);
    for (const s of [1, -1]) rig.add(1, G_SPH, C('#e8e0a0'), s * HR * 0.36, HR * 1.12, HR * 0.9, HR * 0.28, HR * 0.28, HR * 0.16, 0, 0, 0, GLOW, 1);
    rig.add(1, G_BOX, C('#3a2a20'), 0, HR * 0.55, HR * 0.95, HR * 0.8, HR * 0.2, HR * 0.1, 0, 0, 0, 0, 1);
    rig.top = 0.5; rig.lean = 0.1;
    return rig.done();
  }

  // Dämon und Yeti: große Gestalt
  function buildDemonLike(kind, S) {
    const rig = new Rig();
    const k = kind === 'demon' ? 1.7 : 1.9;
    const LL = 0.2 * k, TL = 0.19 * k, TW = 0.22 * k, TD = 0.15 * k, HR = 0.065 * k, AL = 0.22 * k, AT = 0.065 * k;
    rig.bone(-1, 0, LL, 0); rig.bone(0, 0, TL + 0.01, 0.02); rig.bone(0, TW / 2 + AT * 0.5, TL - 0.02, 0); rig.bone(0, -TW / 2 - AT * 0.5, TL - 0.02, 0);
    rig.bone(-1, TW * 0.25, LL, 0); rig.bone(-1, -TW * 0.25, LL, 0); rig.bone(B_ARMR, 0, -AL, 0);
    rig.bone(0, 0, TL * 0.2, -TD * 0.5);   // 7 Schwanz
    rig.bone(0, TW * 0.3, TL * 0.85, -TD * 0.45); rig.bone(0, -TW * 0.3, TL * 0.85, -TD * 0.45);   // 8,9 Flügel
    const fur = S.team.main, skin = S.skin;
    if (kind === 'yeti') {
      for (const b of [B_LEGL, B_LEGR]) { rig.add(b, G_BOX, fur, 0, -LL / 2, 0, 0.09 * k, LL, 0.1 * k); rig.add(b, G_BOX, skin, 0, -LL + 0.02, 0.02, 0.09 * k, 0.04, 0.13 * k); }
      rig.add(0, G_SPH, fur, 0, TL * 0.5, 0, TW * 1.35, TL * 1.5, TD * 1.5);
      rig.add(0, G_SPH, S.team.dark, 0, TL * 0.45, TD * 0.4, TW * 0.8, TL * 0.9, TD * 0.6, 0, 0, 0, 0, 1);
      for (const b of [B_ARML, B_ARMR]) { rig.add(b, G_BOX, fur, 0, -AL * 0.45, 0, AT * 1.3, AL * 0.95, AT * 1.3); rig.add(b, G_SPH, skin, 0, -AL * 0.98, 0, AT * 1.3, AT * 1.3, AT * 1.3); }
      rig.add(1, G_SPH, fur, 0, HR * 1.1, 0, HR * 2.6, HR * 2.5, HR * 2.4);
      rig.add(1, G_BOX, skin, 0, HR * 0.9, HR * 0.95, HR * 1.6, HR * 1.3, HR * 0.4);
      for (const s of [1, -1]) rig.add(1, G_SPH, C(PAL.ink), s * HR * 0.35, HR * 1.2, HR * 1.18, HR * 0.3, HR * 0.3, HR * 0.15);
      rig.add(1, G_BOX, C('#3a3a48'), 0, HR * 0.55, HR * 1.18, HR * 0.9, HR * 0.2, HR * 0.1, 0, 0, 0, 0, 1);
      rig.add(B_TOOL, G_SPH, C('#f6fbff'), 0, 0.0, 0.06, 0.08, 0.08, 0.08);
    } else {
      for (const b of [B_LEGL, B_LEGR]) { rig.add(b, G_BOX, skin, 0, -LL / 2, 0, 0.08 * k, LL, 0.08 * k); rig.add(b, G_BOX, C('#2a0a08'), 0, -LL + 0.02, 0.03, 0.08 * k, 0.04, 0.12 * k); }
      rig.add(0, G_BOX, skin, 0, TL * 0.5, 0, TW, TL, TD);
      rig.add(0, G_SPH, skin, 0, TL * 0.75, 0.02, TW * 1.2, TL * 0.7, TD * 1.25);
      rig.add(0, G_BOX, C('#2a0a08'), 0, 0.01, 0, TW * 1.05, 0.06, TD * 1.05);
      for (let i = 0; i < 3; i++) rig.add(0, G_BOX, C('#ff8a2a'), (i - 1) * 0.04, TL * 0.5 + i * 0.02, TD * 0.51, 0.012, 0.08, 0.006, 0, 0, 0.4 * (i - 1), GLOW, 1);
      for (const b of [B_ARML, B_ARMR]) { rig.add(b, G_BOX, skin, 0, -AL * 0.45, 0, AT, AL * 0.95, AT); rig.add(b, G_CONE, C('#2a0a08'), 0, -AL * 1.0, 0.02, AT * 0.9, AT * 1.4, AT * 0.9, PI, 0, 0); }
      rig.add(1, G_SPH, skin, 0, HR, 0.01, HR * 2.1, HR * 2.1, HR * 2.1);
      rig.add(1, G_BOX, skin, 0, HR * 0.45, HR * 0.6, HR * 1.4, HR * 0.6, HR * 1.0);
      for (const s of [1, -1]) {
        rig.add(1, G_CONE, C('#2a1810'), s * HR * 0.75, HR * 2.2, 0, HR * 0.5, HR * 1.6, HR * 0.5, 0, 0, -s * 0.5);
        rig.add(1, G_SPH, C('#ffe23a'), s * HR * 0.38, HR * 1.18, HR * 0.9, HR * 0.38, HR * 0.24, HR * 0.2, 0, 0, s * 0.2, GLOW);
      }
      rig.add(7, G_CYL, skin, 0, -0.04, -0.12, 0.03, 0.3, 0.03, -1.1, 0, 0);
      rig.add(7, G_CONE, C('#2a0a08'), 0, -0.1, -0.27, 0.07, 0.08, 0.02, -1.1, 0, 0, 0, 1);
      for (const [b, s] of [[8, 1], [9, -1]]) rig.add(b, G_BOX, C('#4a1210'), s * 0.15, 0.05, 0, 0.3, 0.2, 0.012, 0, 0, s * 0.3);
      rig.add(B_TOOL, G_CONE, C('#ffb347'), 0, 0.03, 0.03, 0.05, 0.1, 0.05, 0, 0, 0, GLOW);
    }
    rig.top = LL + TL + HR * 2.4;
    rig.lean = 0.12;
    rig.kind = kind;
    rig.anim = function (o, t, A, r) {
      animHuman(o, t, A, r);
      A[7 * 9 + 1] = sin(t * 2.5 + o.id) * 0.4;
      const f = sin(t * 4 + o.id) * 0.25;
      A[8 * 9 + 1] = -0.5 + f; A[9 * 9 + 1] = 0.5 - f;
      A[B_TOOL * 9] = 0.1;
    };
    return rig.done();
  }

  // ---------------------------------------------------------------- Pools (InstancedMesh je Klasse × Geometrie)
  function Pools(ctx) {
    const T = THREE;
    this.geoms = [new T.BoxGeometry(1, 1, 1), new T.SphereGeometry(0.5, 12, 9), new T.ConeGeometry(0.5, 1, 9), new T.CylinderGeometry(0.5, 0.5, 1, 10), new T.CylinderGeometry(0.33, 0.5, 1, 10)];
    this.mats = [
      new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0.0 }),
      new T.MeshBasicMaterial({ color: 0xffffff }),
      new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.42, depthWrite: false, emissive: 0x6a7a99 }),
      new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.0, transparent: true, opacity: 0.72 })
    ];
    this.list = [];
    this.ctx = ctx;
    for (let c = 0; c < NCLS; c++) for (let g = 0; g < NG; g++) this.list.push(this.make(c, g, c === SOLID ? 2048 : 128));
  }
  Pools.prototype.make = function (c, g, cap) {
    const T = THREE;
    const m = new T.InstancedMesh(this.geoms[g], this.mats[c], cap);
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    m.instanceColor = new T.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    m.instanceColor.setUsage(T.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    m.castShadow = c === SOLID || c === JELLY;
    m.receiveShadow = c === SOLID;
    if (c === GHOST) m.renderOrder = 5;
    m.name = 'units_' + c + '_' + g;
    const p = { mesh: m, cap: cap, n: 0, M: m.instanceMatrix.array, Cc: m.instanceColor.array, cls: c, g: g };
    this.ctx.scene.add(m);
    if (m.castShadow && this.ctx.addShadowCaster) { try { this.ctx.addShadowCaster(m); } catch (e) { /* egal */ } }
    return p;
  };
  Pools.prototype.grow = function (i) {
    const p = this.list[i], np = this.make(p.cls, p.g, p.cap * 2);
    np.M.set(p.M); np.Cc.set(p.Cc); np.n = p.n;
    this.ctx.scene.remove(p.mesh); p.mesh.dispose();
    this.list[i] = np;
    return np;
  };
  Pools.prototype.begin = function () { for (const p of this.list) p.n = 0; };
  Pools.prototype.end = function () {
    for (const p of this.list) {
      const m = p.mesh;
      m.count = p.n; m.visible = p.n > 0;
      if (p.n) {
        m.instanceMatrix.updateRange.offset = 0; m.instanceMatrix.updateRange.count = p.n * 16; m.instanceMatrix.needsUpdate = true;
        m.instanceColor.updateRange.offset = 0; m.instanceColor.updateRange.count = p.n * 3; m.instanceColor.needsUpdate = true;
      }
    }
  };
  Pools.prototype.dispose = function () {
    for (const p of this.list) { this.ctx.scene.remove(p.mesh); p.mesh.dispose(); }
    for (const g of this.geoms) g.dispose();
    for (const m of this.mats) m.dispose();
  };

  // ---------------------------------------------------------------- Zeichnen eines Gerüsts
  const W = new Float32Array(16 * 24), L = new Float32Array(16), ROOT = new Float32Array(16);
  const A = new Float32Array(9 * 24);
  let partsDrawn = 0;
  function drawRig(pools, rig, o, t, x, y, z, heading, scale, nParts, tint) {
    const nb = rig.nb;
    for (let b = 0; b < nb; b++) { const q = b * 9; A[q] = A[q + 1] = A[q + 2] = A[q + 3] = A[q + 4] = A[q + 5] = 0; A[q + 6] = A[q + 7] = A[q + 8] = 1; }
    o.bob = 0;
    if (rig.anim) rig.anim(o, t, A, rig);
    compose(ROOT, 0, x, y + (o.bob || 0), z, o.tilt || 0, heading, o.roll || 0, scale, scale, scale);
    const bp = rig.bp, bx = rig.bx;
    for (let b = 0; b < nb; b++) {
      const q = b * 9;
      compose(L, 0, bx[b * 3] + A[q + 3], bx[b * 3 + 1] + A[q + 4], bx[b * 3 + 2] + A[q + 5], A[q], A[q + 1], A[q + 2], A[q + 6], A[q + 7], A[q + 8]);
      const p = bp[b];
      if (p < 0) mul(ROOT, 0, L, 0, W, b * 16); else mul(W, p * 16, L, 0, W, b * 16);
    }
    const n = Math.min(nParts, rig.n), pb = rig.pb, pp = rig.pp, pl = rig.pl, pc = rig.pc, list = pools.list;
    for (let i = 0; i < n; i++) {
      let pool = list[pp[i]];
      if (pool.n >= pool.cap) pool = pools.grow(pp[i]);
      const k = pool.n++;
      mul(W, pb[i] * 16, pl, i * 16, pool.M, k * 16);
      const c3 = i * 3, d = pool.Cc, kk = k * 3;
      if (tint) { d[kk] = pc[c3] * tint[0]; d[kk + 1] = pc[c3 + 1] * tint[1]; d[kk + 2] = pc[c3 + 2] * tint[2]; }
      else { d[kk] = pc[c3]; d[kk + 1] = pc[c3 + 1]; d[kk + 2] = pc[c3 + 2]; }
    }
    partsDrawn += n;
  }

  // ---------------------------------------------------------------- Billboards (Balken, Sprechblasen)
  function makeBillboards(ctx) {
    const T = THREE;
    const bars = new T.InstancedMesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, transparent: true, opacity: 0.95 }), 600);
    bars.instanceColor = new T.InstancedBufferAttribute(new Float32Array(600 * 3), 3);
    bars.frustumCulled = false; bars.renderOrder = 20; bars.count = 0;
    ctx.scene.add(bars);
    const icons = {};
    const keys = ['heart', 'bread', 'skull', 'exclaim', 'zzz', 'ballot', 'crown', 'angry', 'note', 'hammer', 'question'];
    const geo = new T.PlaneGeometry(1, 1);
    for (const k of keys) {
      const cv = bubbleCanvas(k);
      const tex = new T.CanvasTexture(cv);
      tex.magFilter = T.NearestFilter; tex.minFilter = T.LinearMipmapLinearFilter;
      if (LINEAR) tex.encoding = T.sRGBEncoding;
      const m = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, depthWrite: false }), 64);
      m.frustumCulled = false; m.renderOrder = 21; m.count = 0; m.visible = false;
      ctx.scene.add(m);
      icons[k] = { mesh: m, n: 0, tex: tex };
    }
    return { bars: bars, nb: 0, icons: icons, geo: geo };
  }
  function bubbleCanvas(k) {
    const S = WW.Sprites;
    if (S && typeof S.iconCanvas === 'function' && S.has && S.has('b_' + k)) {
      try {
        const src = S.iconCanvas('b_' + k, 4);
        if (src && src.width) {
          const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
          const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
          const s = Math.min(64 / src.width, 64 / src.height);
          g.drawImage(src, (64 - src.width * s) / 2, (64 - src.height * s) / 2, src.width * s, src.height * s);
          return cv;
        }
      } catch (e) { /* Ersatz unten */ }
    }
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = '#fbf7ee'; g.strokeStyle = '#0a1a21'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(10, 6); g.lineTo(54, 6); g.quadraticCurveTo(60, 6, 60, 12); g.lineTo(60, 40); g.quadraticCurveTo(60, 46, 54, 46); g.lineTo(36, 46); g.lineTo(28, 58); g.lineTo(26, 46); g.lineTo(10, 46); g.quadraticCurveTo(4, 46, 4, 40); g.lineTo(4, 12); g.quadraticCurveTo(4, 6, 10, 6); g.fill(); g.stroke();
    const sym = { heart: '♥', bread: '◒', skull: '☠', exclaim: '!', zzz: 'z', ballot: '✉', crown: '♛', angry: '✖', note: '♪', hammer: '⚒', question: '?' }[k] || '?';
    g.fillStyle = k === 'heart' || k === 'angry' ? '#d8403a' : '#0a1a21'; g.font = 'bold 32px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sym, 32, 27);
    return cv;
  }

  // ---------------------------------------------------------------- Ebene
  const layer = {
    name: 'units', order: 40,
    init: function (ctx) {
      THREE = ctx.THREE || window.THREE;
      const r = ctx.renderer;
      LINEAR = !!(r && THREE.sRGBEncoding && r.outputEncoding === THREE.sRGBEncoding);
      colCache.clear();
      this.ctx = ctx;
      this.pools = new Pools(ctx);
      this.bb = makeBillboards(ctx);
      this.rigs = new Map();         // Aussehen -> Gerüst
      this.objs = new Map();         // id -> Laufzeitdaten
      this.govHist = new Map();
      this.t = 0; this.sweepT = 0;
      const T = THREE;
      // Auswahlring
      const ring = new T.Mesh(new T.RingGeometry(0.2, 0.27, 40), new T.MeshBasicMaterial({ color: 0xf2b541, transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide }));
      ring.rotation.x = -PI / 2; ring.renderOrder = 15; ring.visible = false;
      ctx.scene.add(ring); this.ring = ring;
      // Schatten-Kleckse für Flieger
      const blobTex = (function () { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(cv); })();
      const blob = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-PI / 2), new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), 128);
      blob.frustumCulled = false; blob.count = 0; blob.renderOrder = 2;
      ctx.scene.add(blob); this.blob = blob; this.blobTex = blobTex;
      this.tmpPos = { x: 0, y: 0 };
      this.selection = null; this.held = null;
      R3.Units = R3.Units || {};
      Object.assign(R3.Units, api);
      api._layer = this;
    },
    sync: function (ctx, alpha) { try { this.draw(ctx, alpha); } catch (e) { if (!this._err) { this._err = 1; console.error('units3d', e); } } },
    draw: function (ctx) {
      const t0 = performance.now();
      const st = ctx.state || (ctx.sim && ctx.sim.state);
      const dt = Math.min(0.1, ctx.dt || 0.016);
      this.t += dt;
      const t = this.t;
      const pools = this.pools;
      pools.begin();
      partsDrawn = 0;
      this.bb.nb = 0;
      for (const k in this.bb.icons) this.bb.icons[k].n = 0;
      this.blobN = 0;
      if (!st) { pools.end(); this.finishBB(); return; }
      const cam = ctx.camera, cp = cam.position;
      const q = ctx.quality || 'high';
      const NEAR = q === 'low' ? 14 : q === 'mid' ? 22 : 30, MID = q === 'low' ? 34 : q === 'mid' ? 52 : 70;
      const NEAR2 = NEAR * NEAR, MID2 = MID * MID;
      const vr = ctx.visibleRect ? ctx.visibleRect() : { x0: 0, y0: 0, x1: st.W, y1: st.H };
      const x0 = vr.x0 - 2, x1 = vr.x1 + 2, y0 = vr.y0 - 2, y1 = vr.y1 + 2;
      const seaY = ctx.seaY || 0;
      const kmap = this.kmap || (this.kmap = new Map());
      kmap.clear();
      if (st.kingdoms) for (const k of st.kingdoms) kmap.set(k.id, k);
      this.trackGovs(st);
      const sel = this.curSelection(ctx);
      const pos = this.tmpPos;
      // Kamera-Ausrichtung für Billboards
      this.camQ = cam.quaternion;
      let nu = 0, na = 0;
      const self = this;
      const place = (obj, isAnimal) => {
        let x = obj.x, y = obj.y;
        if (ctx.unitPos) { const r = ctx.unitPos(obj, pos); if (r && isFinite(r.x)) { x = r.x; y = r.y; } }
        return [x, y];
      };
      // Bewohner
      if (st.units) for (const u of st.units) {
        if (u.dead || u.x < x0 || u.x > x1 || u.y < y0 || u.y > y1) continue;
        const p = place(u, false), x = p[0], z = p[1];
        let gy = ctx.heightAt(x, z);
        if (gy < seaY - 0.12) gy = seaY - 0.12;
        const dx = x - cp.x, dy = gy - cp.y, dz = z - cp.z, d2 = dx * dx + dy * dy + dz * dz;
        const o = this.objFor(u.id, x, z, u.dir, dt);
        const k = kmap.get(u.kingdomId);
        this.unitMode(o, u, dt);
        const lod = d2 < NEAR2 ? 0 : d2 < MID2 ? 1 : 2;
        const rig = this.rigForUnit(u, k, lod === 2);
        const sc = (u.role === 'child' ? 1 : 1);
        drawRig(pools, rig, o, t, x, gy, z, o.head, sc, lod === 0 ? rig.n : rig.nCore, null);
        o.top = gy + rig.top;
        nu++;
        if (lod === 0) this.overlays(u, o, x, gy + rig.top, z, d2, NEAR2);
        if (sel && !sel.animal && sel.obj === u) this.placeRing(x, gy, z, 0.9, t);
        if (o.mode === 2 && u.role === 'builder' && lod === 0 && R3.Fx && R3.Fx.buildDust) { o.dustT = (o.dustT || 0) - dt; if (o.dustT <= 0) { o.dustT = 0.35 + hash(u.id, t | 0) * 0.3; R3.Fx.buildDust(x + sin(o.head) * 0.25, gy + 0.05, z + cos(o.head) * 0.25); } }
      }
      // Tiere und Monster
      if (st.animals) for (const a of st.animals) {
        if (a.dead || a.x < x0 || a.x > x1 || a.y < y0 || a.y > y1) continue;
        const p = place(a, true), x = p[0], z = p[1];
        const rig = this.rigForAnimal(a);
        let gy = ctx.heightAt(x, z);
        const o = this.objFor(-a.id - 1, x, z, a.dir, dt);
        o.mode = a.moving ? 1 : (a.foe != null && a.foe >= 0 ? 3 : 0);
        o.moving = !!a.moving;
        if (rig.water) gy = Math.max(gy, seaY) - 0.02;
        else if (gy < seaY - 0.15 && !rig.fly && !rig.ghost) gy = seaY - 0.15;
        if (rig.fly) {
          const want = (a.state === 0 && !a.moving) ? 0 : 2.6;
          o.alt = (o.alt == null ? want : o.alt) + (want - (o.alt || 0)) * Math.min(1, dt * 1.5);
        } else o.alt = 0;
        if (rig.worm) { const want = a.buried ? 0 : 1; o.em = (o.em == null ? want : o.em) + Math.sign(want - (o.em || 0)) * Math.min(Math.abs(want - (o.em || 0)), dt * 1.6); if (a.buried && o.em <= 0.001 && !a.moving) continue; }
        else if (a.buried) continue;
        const dx = x - cp.x, dy = gy - cp.y, dz = z - cp.z, d2 = dx * dx + dy * dy + dz * dz;
        const lod = d2 < NEAR2 ? 0 : 1;
        if (rig.side) o.headOff = PI / 2; else o.headOff = 0;
        const madTint = a.mad && a.mad > (st.tick || 0) ? MAD : null;
        drawRig(pools, rig, o, t, x, gy + o.alt, z, o.head + (o.headOff || 0), 1, lod === 0 ? rig.n : rig.nCore, madTint);
        o.top = gy + o.alt + rig.top;
        if (rig.fly && o.alt > 0.2) this.addBlob(x, gy + 0.03, z, rig.big ? 1.6 : 0.6, Math.max(0.25, 1 - o.alt / 8));
        na++;
        if (lod === 0 && a.maxHp > 0 && (a.hp < a.maxHp * 0.95) && (a.foe != null && a.foe >= 0 || a.hp < a.maxHp * 0.7)) this.addBar(x, o.top + 0.12, z, a.hp / a.maxHp, BAR_RED);
        if (sel && sel.animal && sel.obj === a) this.placeRing(x, gy, z, rig.big ? 2.4 : rig.top > 0.6 ? 1.6 : 1, t);
      }
      // Göttliche Hand
      this.drawHeld(ctx, st, t, kmap);
      if (!sel) this.ring.visible = false;
      pools.end();
      this.finishBB();
      this.sweepT += dt;
      if (this.sweepT > 3) { this.sweepT = 0; const lim = this.t - 3; for (const [id, o] of this.objs) if (o.seen < lim) this.objs.delete(id); if (this.rigs.size > 3000) this.rigs.clear(); }
      api.stats.units = nu; api.stats.animals = na; api.stats.parts = partsDrawn; api.stats.ms = performance.now() - t0;
    },
    dispose: function (ctx) {
      this.pools.dispose();
      const bb = this.bb;
      ctx.scene.remove(bb.bars); bb.bars.geometry.dispose(); bb.bars.material.dispose(); bb.bars.dispose();
      for (const k in bb.icons) { const i = bb.icons[k]; ctx.scene.remove(i.mesh); i.mesh.material.dispose(); i.tex.dispose(); i.mesh.dispose(); }
      bb.geo.dispose();
      ctx.scene.remove(this.ring); this.ring.geometry.dispose(); this.ring.material.dispose();
      ctx.scene.remove(this.blob); this.blob.geometry.dispose(); this.blob.material.dispose(); this.blobTex.dispose();
      this.rigs.clear(); this.objs.clear();
    },
    onWorld: function () { this.objs.clear(); this.govHist.clear(); }
  };
  const MAD = [1.35, 0.75, 0.75];
  const BAR_RED = [0.89, 0.33, 0.24], BAR_GREEN = [0.49, 0.8, 0.35];

  layer.objFor = function (id, x, z, dir, dt) {
    let o = this.objs.get(id);
    if (!o) {
      o = { id: id < 0 ? -id : id, lx: x, lz: z, head: (dir < 0 ? -PI / 2 : PI / 2) + (hash(id, 3) - 0.5) * 1.2, want: 0, ph: hash(id, 5) * TAU, mode: 0, seen: this.t, top: 0 };
      o.want = o.head;
      this.objs.set(id, o);
    }
    const dx = x - o.lx, dz = z - o.lz, d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.0015 && d < 2) { o.want = Math.atan2(dx, dz); o.ph += d * 17; o.spd = d / Math.max(dt, 0.001); }
    else { o.spd = (o.spd || 0) * 0.8; if (d >= 2) o.head = o.want = Math.atan2(dx, dz); }
    o.head = angLerp(o.head, o.want, Math.min(1, dt * 10));
    o.lx = x; o.lz = z; o.seen = this.t;
    return o;
  };
  layer.unitMode = function (o, u, dt) {
    o.carry = !!u.carrying;
    const fight = u.foe != null && u.foe >= 0;
    const work = !u.moving && ((u.phase === 2 && (u.role === 'farmer' || u.role === 'lumberjack' || u.role === 'miner' || u.role === 'prisoner') && u.task !== 'fish') || (u.role === 'builder' && u.task === 'build' && u.target >= 0 && !u.path));
    if (u.moving) { o.mode = u.carrying && (u.carrying === 'food' || u.carrying === 'stone' || u.carrying === 'gold') ? 5 : 1; if ((o.spd || 0) < 0.05) o.ph += dt * 7; }
    else if (fight) o.mode = 3;
    else if (work) o.mode = 2;
    else o.mode = 0;
    o.run = fight || u.role === 'soldier' && u.order;
    o.tool = TOOL_OF[u.role];
  };
  // Tracht nach Regierungswechsel zeitversetzt (wie 2D)
  layer.trackGovs = function (st) {
    const h = this.govHist;
    if (!st.kingdoms) return;
    for (const k of st.kingdoms) {
      const e = h.get(k.id);
      if (!e) h.set(k.id, { cur: k.gov, prev: k.gov, t: -1e9 });
      else if (e.cur !== k.gov) { e.prev = e.cur; e.cur = k.gov; e.t = st.tick || 0; }
    }
    this.tick = st.tick || 0;
  };
  layer.costumeGov = function (u, gov) {
    const e = this.govHist.get(u.kingdomId);
    if (!e || e.cur !== gov) return gov;
    const age = this.tick - e.t;
    if (age >= 360) return gov;
    return hash(u.id, 11) < age / 360 ? gov : e.prev;
  };
  layer.teamOf = function (ci) {
    const c = this.ctx;
    let tc = null;
    if (c.teamColors) { try { tc = c.teamColors(ci); } catch (e) { tc = null; } }
    const key = 'team' + ci;
    let r = colCache.get(key);
    if (r) return r;
    const conv = (col) => { if (!col) return null; const t = col.isColor ? col.clone() : new THREE.Color(col); return [t.r, t.g, t.b]; };
    if (tc && tc.main) r = { main: conv(tc.main), dark: conv(tc.dark || tc.main), light: conv(tc.light || tc.main) };
    else {
      const T = (WW.Sprites && WW.Sprites.TEAM_COLORS && WW.Sprites.TEAM_COLORS[ci]) || { main: '#9a9a9a', dark: '#5a5a5a', light: '#cacaca' };
      r = { main: C(T.main), dark: C(T.dark), light: C(T.light) };
    }
    colCache.set(key, r);
    return r;
  };
  layer.rigForUnit = function (u, k, far) {
    const race = RACE[u.race] ? u.race : 'human';
    let role = u.role || 'farmer';
    const banditish = role === 'bandit' || (u.kingdomId < 0 && role !== 'settler');
    let gov = k ? this.costumeGov(u, k.gov || 'tribe') : 'tribe';
    const ci = k ? (k.colorIndex | 0) : 10;
    if (role === 'ram' || role === 'catapult') {
      const key = role + '|' + ci;
      let r = this.rigs.get(key);
      if (!r) { r = buildSiege(role, this.teamOf(ci)); this.rigs.set(key, r); }
      return r;
    }
    if (banditish && role !== 'soldier') role = 'bandit';
    const child = role === 'child';
    const skinI = (hash(u.id, 1) * SKIN[race].length) | 0, hairI = (hash(u.id, 2) * HAIR[race].length) | 0;
    const sick = !!u.sick, mad = u.wMad > (this.tick || 0);
    const carry = u.carrying || null;
    if (role === 'prisoner') gov = 'none';
    const key = (far ? 'F' : 'N') + race + '|' + role + (role === 'prisoner' ? (hash(u.id, 9) < 0.5 ? 'a' : 'b') : '') + '|' + gov + '|' + ci + '|' + (u.female ? 1 : 0) + '|' + skinI + '|' + hairI + '|' + (sick ? 1 : 0) + (mad ? 1 : 0) + '|' + (far ? '' : carry);
    let r = this.rigs.get(key);
    if (r) return r;
    let skin = C(SKIN[race][skinI]);
    if (sick) skin = mix(skin, C('#c7d8a8'), 0.55);
    const S = { race: race, role: role, gov: gov, team: this.teamOf(ci), female: !!u.female, child: child, sick: sick, mad: mad, carry: carry, skin: skin, hair: C(HAIR[race][hairI]), alt: hash(u.id, 9) < 0.5 };
    r = far ? buildHumanFar(S) : buildHuman(S);
    if (child) { r = scaleRig(r, 0.66); }
    this.rigs.set(key, r);
    return r;
  };
  layer.rigForAnimal = function (a) {
    const v = (hash(a.id, 7) * 4) | 0;
    const key = 'A' + a.kind + '|' + (a.kind === 'slime' ? (a.size || 1) : 0) + '|' + v;
    let r = this.rigs.get(key);
    if (!r) { r = buildAnimal(a.kind, a); this.rigs.set(key, r); }
    return r;
  };

  // Gerüst verkleinern (Kinder)
  function scaleRig(r, s) {
    const o = Object.create(Object.getPrototypeOf(r));
    Object.assign(o, r);
    o.bx = r.bx.map(v => v * s);
    o.pl = r.pl.slice();
    for (let i = 0; i < r.n; i++) { const b = i * 16; for (let j = 0; j < 12; j++) if (j % 4 !== 3) o.pl[b + j] *= s; o.pl[b + 12] *= s; o.pl[b + 13] *= s; o.pl[b + 14] *= s; }
    o.top = r.top * s;
    return o;
  }

  // Lebensbalken und Sprechblasen
  layer.overlays = function (u, o, x, top, z, d2, NEAR2) {
    if (u.maxHp > 0 && u.hp < u.maxHp * 0.95 && (u.foe != null && u.foe >= 0 || u.hp < u.maxHp * 0.6)) this.addBar(x, top + 0.1, z, u.hp / u.maxHp, u.role === 'soldier' ? BAR_GREEN : BAR_GREEN);
    if (u.bubble && u.bubble.icon && this.bb.icons[u.bubble.icon]) this.addIcon(u.bubble.icon, x, top + 0.2, z);
  };
  const _v = { x: 0, y: 0, z: 0 };
  layer.addBar = function (x, y, z, v, col) {
    const bb = this.bb, m = bb.bars, cap = m.instanceMatrix.count;
    if (bb.nb + 2 > cap) return;
    const q = this.camQ, T = THREE;
    const M = this._bm || (this._bm = new T.Matrix4()), P = this._bp || (this._bp = new T.Vector3()), Sv = this._bs || (this._bs = new T.Vector3()), right = this._br || (this._br = new T.Vector3());
    right.set(1, 0, 0).applyQuaternion(q);
    const w = 0.26, h = 0.035;
    v = Math.max(0, Math.min(1, v));
    P.set(x, y, z); Sv.set(w + 0.02, h + 0.02, 1); M.compose(P, q, Sv); m.setMatrixAt(bb.nb, M); m.instanceColor.setXYZ(bb.nb, 0.04, 0.1, 0.13); bb.nb++;
    P.set(x - right.x * w * (1 - v) / 2, y - right.y * w * (1 - v) / 2, z - right.z * w * (1 - v) / 2);
    P.addScaledVector(this._fwd || (this._fwd = new T.Vector3()), 0);
    Sv.set(Math.max(0.005, w * v), h, 1); M.compose(P, q, Sv);
    // etwas zur Kamera hin, damit der Balken vor dem Hintergrund liegt
    const toCam = this._tc || (this._tc = new T.Vector3());
    toCam.set(0, 0, 1).applyQuaternion(q).multiplyScalar(0.004);
    M.elements[12] += toCam.x; M.elements[13] += toCam.y; M.elements[14] += toCam.z;
    m.setMatrixAt(bb.nb, M); m.instanceColor.setXYZ(bb.nb, col[0], col[1], col[2]); bb.nb++;
  };
  layer.addIcon = function (icon, x, y, z) {
    const ic = this.bb.icons[icon];
    if (!ic || ic.n >= 64) return;
    const T = THREE, M = this._im || (this._im = new T.Matrix4()), P = this._ip || (this._ip = new T.Vector3()), Sv = this._is || (this._is = new T.Vector3(0.24, 0.24, 1));
    P.set(x, y + 0.04 * Math.sin(this.t * 3 + x), z);
    M.compose(P, this.camQ, Sv);
    ic.mesh.setMatrixAt(ic.n++, M);
  };
  layer.addBlob = function (x, y, z, s, a) {
    const m = this.blob;
    if (this.blobN >= 128) return;
    const M = this._blm || (this._blm = new THREE.Matrix4());
    M.makeScale(s * (0.6 + a * 0.4), 1, s * (0.6 + a * 0.4)); M.setPosition(x, y, z);
    m.setMatrixAt(this.blobN++, M);
  };
  layer.finishBB = function () {
    const bb = this.bb;
    bb.bars.count = bb.nb; bb.bars.visible = bb.nb > 0;
    if (bb.nb) { bb.bars.instanceMatrix.needsUpdate = true; bb.bars.instanceColor.needsUpdate = true; }
    for (const k in bb.icons) { const i = bb.icons[k]; i.mesh.count = i.n; i.mesh.visible = i.n > 0; if (i.n) i.mesh.instanceMatrix.needsUpdate = true; }
    this.blob.count = this.blobN || 0; this.blob.visible = this.blob.count > 0;
    if (this.blob.count) this.blob.instanceMatrix.needsUpdate = true;
  };
  layer.placeRing = function (x, y, z, s, t) {
    const r = this.ring;
    r.visible = true;
    r.position.set(x, y + 0.03, z);
    const k = s * (1 + 0.08 * sin(t * 6));
    r.scale.set(k, k, k);
    r.material.opacity = 0.65 + 0.3 * sin(t * 6);
  };
  layer.curSelection = function (ctx) {
    const ov = ctx.overlay || ctx.overlays || null;
    let sel = ov && ov.selection !== undefined ? ov.selection : (ctx.selection !== undefined ? ctx.selection : this.selection);
    if (sel && sel.kind === 'unit' && sel.obj && !sel.obj.dead) return sel;
    return null;
  };

  // Göttliche Hand: gehaltene Einheit schwebt unter einer großen Hand über dem Zeiger
  layer.drawHeld = function (ctx, st, t, kmap) {
    const ov = ctx.overlay || null;
    let h = ov && ov.held !== undefined ? ov.held : this.held;
    if (!h && st.wild && st.wild.held && this.lastHeldPos) h = { obj: st.wild.held.data, animal: st.wild.held.what === 'animal', x: this.lastHeldPos.x, y: this.lastHeldPos.y };
    if (!h || !h.obj) return;
    this.lastHeldPos = { x: h.x, y: h.y };
    const x = h.x, z = h.y;
    const gy = Math.max(ctx.heightAt(x, z), ctx.seaY || 0);
    const lift = 1.25 + Math.sin(t * 2.5) * 0.06;
    const o = this.objFor(h.animal ? -9e6 : 9e6, x, z, 1, ctx.dt || 0.016);
    o.mode = h.animal ? 1 : 4; o.ph += (ctx.dt || 0.016) * 14;
    o.roll = Math.sin(t * 3.1) * 0.25; o.tilt = Math.sin(t * 2.3) * 0.15;
    let rig;
    if (h.animal) rig = this.rigForAnimal(h.obj);
    else rig = this.rigForUnit(h.obj, kmap.get(h.obj.kingdomId), false);
    const top = gy + lift + rig.top;
    drawRig(this.pools, rig, o, t, x, gy + lift, z, o.head, 1, rig.n, null);
    o.roll = 0; o.tilt = 0;
    this.addBlob(x, gy + 0.03, z, 0.5, 0.6);
    // Hand
    const hr = this.handRig || (this.handRig = buildHand());
    const ho = this.handO || (this.handO = { id: 1, ph: 0, mode: 0, bob: 0 });
    drawRig(this.pools, hr, ho, t, x, top + 0.05, z, this.ctx.camera ? Math.atan2(this.ctx.camera.position.x - x, this.ctx.camera.position.z - z) : 0, 1, hr.n, null);
    this.addBlob(x, gy + 0.03, z, 1.4, 0.4);
  };
  function buildHand() {
    const rig = new Rig();
    const sk = C('#f1c7a0'), skD = C('#d9a580'), sleeve = C('#f4f1ea');
    rig.bone(-1, 0, 0, 0);
    for (let k = 0; k < 4; k++) rig.bone(0, -0.21 + k * 0.14, 0.02, 0.2);       // 1..4 Finger
    rig.bone(0, 0.32, 0.06, 0.0);                                                // 5 Daumen
    rig.add(0, G_BOX, sk, 0, 0.12, 0, 0.62, 0.2, 0.55);
    rig.add(0, G_SPH, sk, 0, 0.18, -0.05, 0.62, 0.3, 0.6, 0, 0, 0, 0, 1);
    rig.add(0, G_CYL, sleeve, 0, 0.75, -0.25, 0.5, 1.1, 0.5, -0.45, 0, 0);
    rig.add(0, G_CYL, C('#e8dcc4'), 0, 0.33, -0.05, 0.56, 0.14, 0.56, -0.45, 0, 0);
    for (let b = 1; b <= 4; b++) { rig.add(b, G_CYL, sk, 0, -0.14, 0.03, 0.12, 0.3, 0.12, 0.35, 0, 0); rig.add(b, G_SPH, skD, 0, -0.29, 0.1, 0.12, 0.08, 0.12, 0, 0, 0, 0, 1); }
    rig.add(5, G_CYL, sk, 0.05, -0.12, 0.05, 0.13, 0.28, 0.13, 0.3, 0, 0.5);
    rig.top = 0.4;
    rig.anim = function (o, t, A) { const w = Math.sin(t * 3) * 0.12; for (let b = 1; b <= 4; b++) A[b * 9] = 0.55 + w + b * 0.03; A[5 * 9 + 2] = -0.5; A[0] = -0.15; };
    return rig.done();
  }

  const api = {
    stats: { units: 0, animals: 0, parts: 0, ms: 0 },
    setSelection: function (sel) { if (api._layer) api._layer.selection = sel; },
    setHeld: function (h) { if (api._layer) api._layer.held = h; },
    headPos: function (id, animal) { const L = api._layer; if (!L) return null; const o = L.objs.get(animal ? -id - 1 : id); return o ? { x: o.lx, y: o.top, z: o.lz } : null; },
    // Für die Testseite: Gerüst-Bauer
    _build: { human: function (S) { return buildHuman(S); } },
    layer: layer
  };
  R3.Units = Object.assign(R3.Units || {}, api);

  if (typeof R3.registerLayer === 'function') R3.registerLayer(layer);
  else (R3._pending = R3._pending || []).push(layer);

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
