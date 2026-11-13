// =============================================================================
// Wuselwelt – 3D-Gelände (Agent 3D-A): Gelände-Blöcke aus dem Höhenfeld des Kerns, Wasser (Meer, Seen,
// Flüsse), Lava, Überlagerungen (Gebiete und Grenzen, Pinsel, Auswahl, Rodung, Brand, Krater, Fallout,
// trübe Flüsse, Verschmutzungs-Dunst). Ebene 'terrain' (order 0). Braucht js/render3d/core.js.
// =============================================================================
(function (WW) { 'use strict';

  const R3 = WW.R3;
  if (!R3 || typeof THREE === 'undefined') return;
  const U = R3.util, hash3 = U.hash3, vnoise = U.vnoise, fbm = U.fbm, clamp = U.clamp;
  const CH = 32;                 // Kacheln je Block
  const S = 2;                   // Feldpunkte je Kachel

  // Grundfarben je Gelände (sRGB). Wasserarten = Farbe des Grundes.
  const COL = {
    deep: '#5f6047', water: '#7d7a58', shallow: '#bfae80', river: '#8a7d5a',
    sand: '#dccb9c', grass: '#6b913f', forest: '#4b6e2d', hill: '#87894f', mountain: '#857a6c', snow: '#f2f5f7',
    desert: '#dab679', savanna: '#b3a259', jungle: '#3d7029', swamp: '#56603b', tundra: '#8e9273',
    snowfield: '#e9eef1', taiga: '#4c6440', mushroom: '#7a5e7d', crystal: '#9bbfbb', ash: '#4d4949',
    lava: '#2b1e19', flowers: '#78a146'
  };
  const SMOOTH = { sand: 1, desert: 1, snow: 1, snowfield: 1, ash: 0.6, crystal: 0.4, shallow: 1, river: 1, water: 1, deep: 1 };
  const GRASSY = { grass: 1, forest: 1, hill: 0.6, savanna: 1, jungle: 1, swamp: 1, tundra: 1, taiga: 1, flowers: 1, mushroom: 1 };

  function lin(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

  // ------------------------------------------------------------------ Shader-Bausteine
  const BRUSH_GLSL = [
    'uniform vec4 uBrush; uniform vec4 uBrush2; uniform vec4 uSel; uniform float uSelKind;',
    'float brInside(vec2 d, float r){ float l = (r-1.0)*(r-1.0) + (r-1.0); return (dot(d,d) <= l + 0.01 && abs(d.x) <= r-0.99 && abs(d.y) <= r-0.99) ? 1.0 : 0.0; }',
    'vec3 overlayGlow(vec3 wp, float t){',
    '  vec3 g = vec3(0.0); vec3 gold = vec3(1.0, 0.68, 0.18);',
    '  float k = uBrush.w;',
    '  if (k > 0.5) {',
    '    vec2 p = wp.xz;',
    '    if (k < 1.5) {',
    '      vec2 cell = floor(p), c = floor(uBrush.xy), d = cell - c; vec2 f = fract(p);',
    '      float r = max(1.0, uBrush.z);',
    '      float ins = brInside(d, r);',
    '      if (ins > 0.5) {',
    '        float e = 0.0, w = 0.06;',
    '        if (brInside(d + vec2(0.0,-1.0), r) < 0.5) e = max(e, step(f.y, w));',
    '        if (brInside(d + vec2(0.0, 1.0), r) < 0.5) e = max(e, step(1.0 - w, f.y));',
    '        if (brInside(d + vec2(-1.0,0.0), r) < 0.5) e = max(e, step(f.x, w));',
    '        if (brInside(d + vec2( 1.0,0.0), r) < 0.5) e = max(e, step(1.0 - w, f.x));',
    '        g += gold * (0.16 + e * 0.9);',
    '      }',
    '    } else if (k < 2.5) {',
    '      float dd = length(p - uBrush.xy), r = max(0.5, uBrush.z);',
    '      g += gold * (smoothstep(0.09, 0.0, abs(dd - r)) * 0.9 + step(dd, r) * 0.1 * (0.7 + 0.3 * sin(t * 4.0)));',
    '    } else if (k < 3.5) {',
    '      vec2 a = uBrush.xy, b = uBrush2.xy, ab = b - a; float h = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);',
    '      float dl = length(p - a - ab * h);',
    '      float dash = step(0.5, fract(h * length(ab) * 1.2 - t * 1.5));',
    '      g += gold * smoothstep(0.1, 0.03, dl) * (0.5 + 0.5 * dash);',
    '      g += gold * smoothstep(0.1, 0.0, abs(length(p - b) - 0.45));',
    '    }',
    '    if (k > 1.5 || k > 3.5) {',
    '      vec2 cell = floor(p), f = fract(p);',
    '      if (all(equal(cell, floor(uBrush.xy)))) { float e = step(f.x, 0.07) + step(0.93, f.x) + step(f.y, 0.07) + step(0.93, f.y); g += gold * min(e, 1.0) * 0.9; }',
    '    }',
    '  }',
    '  if (uSelKind > 0.5) {',
    '    float pulse = 0.65 + 0.35 * sin(t * 6.0);',
    '    vec2 p = wp.xz;',
    '    if (uSelKind < 1.5) {',
    '      vec2 lo = uSel.xy, hi = uSel.zw; float L = clamp(min(hi.x - lo.x, hi.y - lo.y) * 0.3, 0.25, 1.2), w = 0.07;',
    '      if (p.x > lo.x - w && p.x < hi.x + w && p.y > lo.y - w && p.y < hi.y + w) {',
    '        float nx = min(abs(p.x - lo.x), abs(p.x - hi.x)), ny = min(abs(p.y - lo.y), abs(p.y - hi.y));',
    '        float ex = step(nx, w) * step(ny, L), ey = step(ny, w) * step(nx, L);',
    '        g += gold * max(ex, ey) * 1.3 * pulse;',
    '      }',
    '    } else {',
    '      float dd = length(p - uSel.xy);',
    '      g += gold * smoothstep(0.07, 0.0, abs(dd - uSel.z)) * 1.3 * pulse;',
    '    }',
    '  }',
    '  return g;',
    '}'
  ].join('\n');

  // ------------------------------------------------------------------ Ebene
  const layer = {
    name: 'terrain', order: 0,
    init(ctx) { this.ctx = ctx; this.build(ctx); },
    onWorld(ctx) { this.dispose(ctx); this.build(ctx); },
    onQuality(ctx) { /* Schatten schalten die Materialien selbst um */ },
    dispose(ctx) {
      if (!this.root) return;
      ctx.scene.remove(this.root);
      this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      for (const m of [this.tMat, this.wMat, this.smogMat]) if (m) m.dispose();
      for (const t of [this.terrTex, this.effTex, this.polTex]) if (t) t.dispose();
      if (this.offT) this.offT(); if (this.offTiles) this.offTiles();
      this.root = null;
    },

    build(ctx) {
      const st = ctx.state, W = st.W, H = st.H;
      this.W = W; this.H = H;
      this.root = new THREE.Group(); this.root.name = 'terrain';
      ctx.scene.add(this.root);
      this.cw = Math.ceil(W / CH); this.chh = Math.ceil(H / CH);
      this.chunks = [];
      this.tileCols(ctx);
      this.makeTextures(ctx);
      this.makeMaterials(ctx);
      for (let cy = 0; cy < this.chh; cy++) for (let cx = 0; cx < this.cw; cx++) {
        const c = { cx, cy, land: null, water: null };
        this.chunks.push(c);
        this.buildChunk(ctx, c);
      }
      this.buildFrame(ctx);
      this.buildSmog(ctx);
      this.offT = ctx.onTerrainChanged((r) => this.onTerrain(ctx, r));
      this.offTiles = ctx.onTilesChanged(() => { this.effT = 0; });
      this.terrT = 0; this.effT = 0; this.polT = 0;
      this.updateTerritory(ctx, true);
      this.updateEffects(ctx);
      this.updatePollution(ctx);
    },

    // Farbe und Eigenschaften je Kachel
    tileCols(ctx) {
      const st = ctx.state, N = this.W * this.H;
      this.tc = new Float32Array(N * 3);
      this.tf = new Float32Array(N * 4);   // lava, flowers, smooth, grassy
      const base = WW.TERRAIN.map(t => lin(COL[t.key] || t.color));
      for (let i = 0; i < N; i++) this.setTile(st, i, base);
      this.base = base;
    },
    setTile(st, i, base) {
      const t = st.terrain[i], d = WW.TERRAIN[t], c = (base || this.base)[t];
      const x = i % this.W, y = (i / this.W) | 0;
      const v = 0.94 + hash3(x, y, 5) * 0.12;
      this.tc[i * 3] = c.r * v; this.tc[i * 3 + 1] = c.g * v; this.tc[i * 3 + 2] = c.b * v;
      this.tf[i * 4] = d.key === 'lava' ? 1 : 0;
      this.tf[i * 4 + 1] = d.key === 'flowers' ? 1 : 0;
      this.tf[i * 4 + 2] = SMOOTH[d.key] || 0;
      this.tf[i * 4 + 3] = GRASSY[d.key] || 0;
    },

    makeTextures(ctx) {
      const W = this.W, H = this.H;
      // Gebiete: Canvas mit P Pixeln je Kachel
      const P = this.P = clamp(Math.floor(1536 / Math.max(W, H)), 4, 8);
      const cv = this.terrCv = document.createElement('canvas');
      cv.width = W * P; cv.height = H * P;
      this.terrG = cv.getContext('2d');
      this.terrTex = new THREE.CanvasTexture(cv);
      this.terrTex.minFilter = THREE.LinearMipmapLinearFilter; this.terrTex.magFilter = THREE.LinearFilter;
      this.terrTex.encoding = THREE.sRGBEncoding;
      this.terrTex.anisotropy = 4;
      this.kt = new Int32Array(W * H).fill(-1);
      // Effekte: 2 Texel je Kachel, RGBA = verkohlt, Fallout, Krater, kahl (auf Wasser: Trübung)
      this.effData = new Uint8Array(W * 2 * H * 2 * 4);
      this.effTex = new THREE.DataTexture(this.effData, W * 2, H * 2, THREE.RGBAFormat);
      this.effTex.magFilter = THREE.LinearFilter; this.effTex.minFilter = THREE.LinearFilter;
      this.effTex.needsUpdate = true;
      // Verschmutzung: grobes Raster
      const cell = (WW.INDUSTRY && WW.INDUSTRY.CFG && WW.INDUSTRY.CFG.CELL) || 4;
      this.pCell = cell; this.pw = Math.ceil(W / cell); this.ph = Math.ceil(H / cell);
      this.polData = new Uint8Array(this.pw * this.ph * 4);
      this.polTex = new THREE.DataTexture(this.polData, this.pw, this.ph, THREE.RGBAFormat);
      this.polTex.magFilter = THREE.LinearFilter; this.polTex.minFilter = THREE.LinearFilter;
      this.polTex.needsUpdate = true;
    },

    makeMaterials(ctx) {
      const self = this;
      const un = this.un = {
        uDetail: { value: ctx.tex('detail') }, uTerr: { value: this.terrTex }, uEff: { value: this.effTex }, uPol: { value: this.polTex },
        uMap: { value: new THREE.Vector2(this.W, this.H) }, uPolMap: { value: new THREE.Vector2(this.pw * this.pCell, this.ph * this.pCell) },
        uTerrOn: { value: 1 }, uAir: { value: 0 }, uTime: ctx.uniforms.uTime,
        uBrush: { value: new THREE.Vector4(0, 0, 0, 0) }, uBrush2: { value: new THREE.Vector4() },
        uSel: { value: new THREE.Vector4() }, uSelKind: { value: 0 }
      };
      const m = this.tMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, un);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec4 aux;\nvarying vec4 vAux;\nvarying vec3 vWP;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAux = aux;\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', [
            '#include <common>',
            'varying vec4 vAux; varying vec3 vWP;',
            'uniform sampler2D uDetail, uTerr, uEff, uPol; uniform vec2 uMap, uPolMap; uniform float uTerrOn, uAir, uTime;',
            BRUSH_GLSL
          ].join('\n'))
          .replace('#include <color_fragment>', [
            '#include <color_fragment>',
            'vec4 d1 = texture2D(uDetail, vWP.xz * 0.43);',
            'vec4 d2 = texture2D(uDetail, vWP.xz * 0.083 + 0.37);',
            'vec4 d3 = texture2D(uDetail, vWP.xz * 1.7);',
            'float rockT = texture2D(uDetail, vec2(vWP.x * 0.7 + vWP.z * 0.7, vWP.y * 1.6) * 0.21).b * 0.6 + texture2D(uDetail, vWP.xz * 0.19).b * 0.4;',
            'float fGrass = 0.72 + 0.34 * d1.r + 0.22 * (d2.g - 0.5) + 0.16 * (d3.r - 0.5);',
            'float fRock = 0.62 + 0.62 * rockT + 0.1 * (d3.r - 0.5);',
            'float fSmooth = 0.92 + 0.10 * d1.r + 0.06 * (d2.g - 0.5);',
            'float grassW = clamp(1.0 - vAux.y - vAux.w, 0.0, 1.0);',
            'float detF = fGrass * grassW + fRock * vAux.y + fSmooth * vAux.w;',
            'diffuseColor.rgb *= detF;',
            // Blumen: bunte Tupfen
            'float sp = texture2D(uDetail, vWP.xz * 0.95 + 0.5).a;',
            'vec3 flc = d2.r > 0.55 ? vec3(0.95, 0.82, 0.18) : (d2.r > 0.42 ? vec3(0.92, 0.92, 0.95) : vec3(0.85, 0.25, 0.45));',
            'diffuseColor.rgb = mix(diffuseColor.rgb, flc, clamp(sp * vAux.z * 1.4, 0.0, 1.0));',
            // Effekte
            'vec2 muv = vWP.xz / uMap;',
            'vec4 ef = texture2D(uEff, muv);',
            'vec3 soil = vec3(0.21, 0.14, 0.08) * (0.75 + 0.5 * d1.r);',
            'diffuseColor.rgb = mix(diffuseColor.rgb, soil, ef.a * 0.75);',
            'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.022, 0.02) * (0.6 + 0.8 * d3.r), ef.r * 0.9);',
            'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.33, 0.07) * (0.7 + 0.6 * d1.r), ef.g * 0.7);',
            'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.05, 0.045), smoothstep(0.15, 0.7, ef.b) * 0.85);',
            'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.27, 0.2), smoothstep(0.05, 0.3, ef.b) * (1.0 - smoothstep(0.3, 0.6, ef.b)) * 0.5);',
            // Gebiete
            'vec4 tt = texture2D(uTerr, muv);',
            'diffuseColor.rgb = mix(diffuseColor.rgb, tt.rgb, tt.a * uTerrOn);',
            // Verschmutzung
            'float pol = texture2D(uPol, vWP.xz / uPolMap).r;',
            'float ph = smoothstep(0.22, 0.9, pol);',
            'diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.72, 0.62), ph * 0.8);',
            'if (uAir > 0.5) { vec3 ac = mix(vec3(0.2, 0.7, 0.25), mix(vec3(0.95, 0.85, 0.2), vec3(0.85, 0.15, 0.1), smoothstep(0.4, 0.85, pol)), smoothstep(0.08, 0.4, pol)); diffuseColor.rgb = mix(diffuseColor.rgb, ac, 0.5); }',
            // Lava: dunkle Kruste
            'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.02, 0.018) * (0.5 + d3.r), vAux.x);'
          ].join('\n'))
          .replace('#include <emissivemap_fragment>', [
            '#include <emissivemap_fragment>',
            'float lv = texture2D(uDetail, vWP.xz * 0.21 + vec2(uTime * 0.006, -uTime * 0.004)).g;',
            'float lc = texture2D(uDetail, vWP.xz * 0.47 - vec2(uTime * 0.004, uTime * 0.007)).r;',
            'float glow = smoothstep(0.35, 0.75, lv * 0.7 + lc * 0.5) ;',
            'totalEmissiveRadiance += vec3(1.0, 0.32, 0.04) * vAux.x * (0.25 + glow * 3.2);',
            'totalEmissiveRadiance += vec3(0.25, 0.32, 0.02) * ef.g * 0.15;',
            'totalEmissiveRadiance += overlayGlow(vWP, uTime);'
          ].join('\n'));
      };
      m.customProgramCacheKey = () => 'ww-terrain';

      // Wasser
      const wun = this.wun = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
        uTime: ctx.uniforms.uTime, uDetail: { value: ctx.tex('detail') }, uEff: { value: this.effTex }, uMap: un.uMap,
        uSun: { value: ctx.sunDir }, uSunCol: { value: ctx.sunColor },
        uZenith: { value: lin('#5d88bd') }, uHorizon: { value: lin('#e2d2bd') },
        uShallow: { value: lin('#3f9a98') }, uDeep: { value: lin('#0d3550') }, uRiver: { value: lin('#3a7d86') },
        uPol: { value: this.polTex }, uPolMap: un.uPolMap
      });
      this.wMat = new THREE.ShaderMaterial({
        uniforms: wun, transparent: true, fog: true, depthWrite: true,
        vertexShader: [
          'attribute vec3 wa;',
          'varying vec3 vW; varying vec3 vA;',
          'uniform float uTime;',
          '#include <fog_pars_vertex>',
          'void main(){',
          '  vec3 p = position;',
          '  float sea = 1.0 - wa.y; float wv = sea * smoothstep(0.2, 1.5, wa.x);',
          '  p.y += wv * (sin(p.x * 0.9 + uTime * 1.1) * 0.025 + sin(p.z * 1.3 - uTime * 0.8 + p.x * 0.3) * 0.02);',
          '  vW = (modelMatrix * vec4(p, 1.0)).xyz; vA = wa;',
          '  vec4 mvPosition = viewMatrix * vec4(vW, 1.0);',
          '  gl_Position = projectionMatrix * mvPosition;',
          '  #include <fog_vertex>',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform float uTime; uniform sampler2D uDetail, uEff, uPol; uniform vec2 uMap, uPolMap;',
          'uniform vec3 uSun, uSunCol, uZenith, uHorizon, uShallow, uDeep, uRiver;',
          'varying vec3 vW; varying vec3 vA;',
          '#include <common>',
          '#include <fog_pars_fragment>',
          'void main(){',
          '  float depth = max(vA.x, 0.0); float river = vA.y;',
          '  vec2 fl = river > 0.5 ? vec2(0.05, 0.03) : vec2(0.02, 0.012);',
          '  vec4 n1 = texture2D(uDetail, vW.xz * 0.19 + uTime * fl);',
          '  vec4 n2 = texture2D(uDetail, vW.xz * 0.31 - uTime * fl.yx * 1.3 + 0.5);',
          '  vec4 n3 = texture2D(uDetail, vW.xz * 0.9 + uTime * vec2(-0.03, 0.04));',
          '  vec3 n = normalize(vec3((n1.r - 0.5) * 0.5 + (n2.g - 0.5) * 0.4 + (n3.r - 0.5) * 0.25, 1.0, (n1.g - 0.5) * 0.5 + (n2.r - 0.5) * 0.4 + (n3.g - 0.5) * 0.25));',
          '  vec3 v = normalize(cameraPosition - vW);',
          '  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 5.0);',
          '  vec3 r = reflect(-v, n);',
          '  vec3 sky = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.6));',
          '  float dk = smoothstep(0.0, 2.6, depth);',
          '  vec3 body = mix(uShallow, uDeep, dk);',
          '  body = mix(body, uRiver, river * 0.6);',
          '  float murk = texture2D(uEff, vW.xz / uMap).a * river;',
          '  body = mix(body, vec3(0.22, 0.17, 0.08), murk * 0.85);',
          '  float pol = smoothstep(0.25, 0.9, texture2D(uPol, vW.xz / uPolMap).r);',
          '  body = mix(body, body * vec3(0.7, 0.68, 0.55), pol * 0.7);',
          '  float sunUp = clamp(uSun.y, 0.0, 1.0);',
          '  vec3 lit = body * (0.35 + 0.9 * sunUp) * mix(vec3(0.85, 0.9, 1.0), uSunCol, 0.5);',
          '  vec3 col = mix(lit, sky, fres * 0.75);',
          '  float sp = pow(max(dot(r, normalize(uSun)), 0.0), 220.0);',
          '  col += uSunCol * (sp * 5.0 + pow(max(dot(r, normalize(uSun)), 0.0), 24.0) * 0.12);',
          // Brandung
          '  float fn = n3.b * 0.6 + n1.g * 0.4;',
          '  float lap = 0.06 * sin(uTime * 1.6 + fn * 9.0 + vW.x * 0.4);',
          '  float foam = smoothstep(0.16, 0.0, depth + (fn - 0.5) * 0.14 + lap) * smoothstep(0.25, 0.55, fn + 0.25);',
          '  foam = max(foam, smoothstep(0.05, 0.0, depth) * 0.7);',
          '  foam *= (1.0 - river * 0.6);',
          '  col = mix(col, vec3(0.92, 0.93, 0.9) * (0.6 + 0.6 * sunUp), foam * 0.85);',
          '  float a = mix(0.42, 0.97, smoothstep(0.0, 1.8, depth));',
          '  a = mix(a, 0.9, river * 0.5);',
          '  a = clamp(a + fres * 0.25 + foam + murk * 0.5, 0.0, 1.0);',
          '  a *= smoothstep(-0.005, 0.03, vA.x);',
          '  gl_FragColor = vec4(col, a);',
          '  #include <tonemapping_fragment>',
          '  #include <encodings_fragment>',
          '  #include <fog_fragment>',
          '}'
        ].join('\n')
      });
      this.frameMat = this.wMat;
    },

    // ---------------------------------------------------------------- Block bauen
    buildChunk(ctx, c) {
      const f = ctx.field, st = ctx.state, W = this.W, H = this.H, GW = f.GW;
      const x0 = c.cx * CH, y0 = c.cy * CH, x1 = Math.min(W, x0 + CH), y1 = Math.min(H, y0 + CH);
      const gx0 = x0 * S, gz0 = y0 * S, nx = (x1 - x0) * S + 1, nz = (y1 - y0) * S + 1, nv = nx * nz;
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), aux = new Float32Array(nv * 4);
      const g = f.g, GH = f.GH;
      const tmp = { r: 0, g: 0, b: 0, lava: 0, fl: 0, sm: 0, gr: 0, rock: 0 };
      let minY = 1e9, maxY = -1e9;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const gx = gx0 + i, gz = gz0 + j, k = j * nx + i, gi = gz * GW + gx;
        const y = g[gi];
        pos[k * 3] = gx / S; pos[k * 3 + 1] = y; pos[k * 3 + 2] = gz / S;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        const xl = g[gz * GW + Math.max(0, gx - 1)], xr = g[gz * GW + Math.min(GW - 1, gx + 1)];
        const zu = g[Math.max(0, gz - 1) * GW + gx], zd = g[Math.min(GH - 1, gz + 1) * GW + gx];
        let nX = (xl - xr) * S / 2, nY = 1, nZ = (zu - zd) * S / 2;
        const l = Math.hypot(nX, nY, nZ); nX /= l; nY /= l; nZ /= l;
        nor[k * 3] = nX; nor[k * 3 + 1] = nY; nor[k * 3 + 2] = nZ;
        this.vertexColor(st, f, gx / S, gz / S, y, nY, f.wl[gi], tmp);
        col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
        aux[k * 4] = tmp.lava; aux[k * 4 + 1] = tmp.rock; aux[k * 4 + 2] = tmp.fl; aux[k * 4 + 3] = tmp.sm;
      }
      const idx = new (nv > 65535 ? Uint32Array : Uint16Array)((nx - 1) * (nz - 1) * 6);
      let p = 0;
      for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, cc = a + nx, d = cc + 1;
        idx[p++] = a; idx[p++] = d; idx[p++] = b; idx[p++] = a; idx[p++] = cc; idx[p++] = d;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('aux', new THREE.BufferAttribute(aux, 4));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      if (c.land) { c.land.geometry.dispose(); c.land.geometry = geo; }
      else {
        c.land = new THREE.Mesh(geo, this.tMat);
        c.land.castShadow = true; c.land.receiveShadow = true;
        c.land.matrixAutoUpdate = false;
        this.root.add(c.land);
      }
      this.buildWater(ctx, c, x0, y0, x1, y1);
    },

    vertexColor(st, f, px, pz, y, ny, wlv, out) {
      const W = this.W, H = this.H, tc = this.tc, tf = this.tf;
      // verwackelte Abtastung: keine geraden Kachelkanten
      const jx = px + (vnoise(px * 0.8, pz * 0.8, 3) - 0.5) * 0.95 + (vnoise(px * 2.3, pz * 2.3, 4) - 0.5) * 0.3;
      const jz = pz + (vnoise(px * 0.8, pz * 0.8, 9) - 0.5) * 0.95 + (vnoise(px * 2.3, pz * 2.3, 8) - 0.5) * 0.3;
      const cx = Math.floor(jx), cz = Math.floor(jz);
      let r = 0, g = 0, b = 0, lava = 0, fl = 0, sm = 0, gr = 0, ws = 0, sea = 0, riv = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const tx = clamp(cx + dx, 0, W - 1), tz = clamp(cz + dz, 0, H - 1);
        const ddx = jx - (cx + dx + 0.5), ddz = jz - (cz + dz + 0.5);
        let w = 1 - Math.sqrt(ddx * ddx + ddz * ddz) / 1.05;
        if (w <= 0) continue;
        w = w * w;
        const i = tz * W + tx;
        r += tc[i * 3] * w; g += tc[i * 3 + 1] * w; b += tc[i * 3 + 2] * w;
        lava += tf[i * 4] * w; fl += tf[i * 4 + 1] * w; sm += tf[i * 4 + 2] * w; gr += tf[i * 4 + 3] * w;
        const k = f.wkind[i];
        if (k === 1 || k === 2) sea += w; else if (k === 3) riv += w;
        ws += w;
      }
      if (ws > 0) { r /= ws; g /= ws; b /= ws; lava /= ws; fl /= ws; sm /= ws; gr /= ws; sea /= ws; riv /= ws; }
      // großflächige Fleckung und Farbschwankung
      const m1 = fbm(px * 0.11, pz * 0.11, 3, 41), m2 = fbm(px * 0.05 + 7, pz * 0.05, 2, 43);
      const bright = 0.86 + 0.28 * m1;
      r *= bright; g *= bright; b *= bright;
      if (gr > 0) {
        // trockene, gelbliche Flecken auf Grasland, sattere in Senken
        const dry = clamp((m2 - 0.45) * 2.2, 0, 1) * 0.45 * gr;
        r += (0.30 - r) * dry * 0.5; g += (0.26 - g) * dry * 0.35; b += (0.06 - b) * dry * 0.4;
      }
      // Fels an Steilhängen
      const slope = 1 - ny;
      let rock = clamp((slope - 0.3) / 0.3, 0, 1);
      if (y < 0.5) rock *= 0.3;
      rock = Math.min(1, rock + clamp((y - 3.2) / 3, 0, 0.55) * (1 - sm));
      if (rock > 0) {
        const rv = fbm(px * 0.35, pz * 0.35, 2, 61);
        const rr = 0.20 + rv * 0.07, rg = 0.18 + rv * 0.06, rb = 0.155 + rv * 0.05;
        r += (rr - r) * rock; g += (rg - g) * rock; b += (rb - b) * rock;
      }
      // Schnee oben, an steilen Flanken weniger
      const sn = fbm(px * 0.3, pz * 0.3, 3, 71);
      let snow = clamp((y + (sn - 0.5) * 2.2 - 6.6) / 1.1, 0, 1) * (1 - clamp((slope - 0.42) / 0.3, 0, 0.85));
      if (snow > 0) { r += (0.86 - r) * snow; g += (0.89 - g) * snow; b += (0.93 - b) * snow; rock *= (1 - snow); sm = Math.max(sm, snow); }
      // Ufer: Sand am Meer, feuchter Boden am Fluss, nass an der Wasserlinie, Grund unter Wasser
      if (wlv > -1e8) {
        const dh = y - wlv;
        if (dh >= 0) {
          const beach = (1 - clamp((dh - 0.1) / 0.32, 0, 1)) * clamp(sea * 3 + (riv > 0 ? 0 : 0.6), 0, 1);
          const sandN = 0.9 + 0.2 * vnoise(px * 1.3, pz * 1.3, 81);
          r += (0.70 * sandN - r) * beach * 0.85; g += (0.60 * sandN - g) * beach * 0.85; b += (0.40 * sandN - b) * beach * 0.85;
          sm = Math.max(sm, beach * 0.8);
          const bank = (1 - clamp(dh / 0.25, 0, 1)) * clamp(riv * 2, 0, 1) * (1 - beach);
          r *= 1 - bank * 0.35; g *= 1 - bank * 0.25; b *= 1 - bank * 0.35;
          const wet = 1 - clamp(dh / 0.07, 0, 1);
          r *= 1 - wet * 0.35; g *= 1 - wet * 0.3; b *= 1 - wet * 0.22;
          rock *= 1 - beach;
        } else {
          const dd = clamp(-dh / 1.4, 0, 1);
          r *= 1 - dd * 0.35; g *= 1 - dd * 0.25; b *= 1 - dd * 0.15;
          rock = 0; sm = 1;
        }
      }
      out.r = r; out.g = g; out.b = b;
      out.lava = clamp((lava - 0.3) / 0.5, 0, 1); out.fl = fl; out.sm = clamp(sm, 0, 1); out.rock = clamp(rock, 0, 1);
    },

    buildWater(ctx, c, x0, y0, x1, y1) {
      const f = ctx.field, W = this.W, H = this.H, GW = f.GW, wk = f.wkind;
      // Maske: Wasserkacheln + ein Rand Landkacheln
      const quads = [];
      for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) {
        let any = wk[ty * W + tx] > 0;
        if (!any) for (let dy = -1; dy <= 1 && !any; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = tx + dx, ny = ty + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (wk[ny * W + nx]) { any = true; break; }
        }
        if (any) quads.push(tx, ty);
      }
      if (c.water) { this.root.remove(c.water); c.water.geometry.dispose(); c.water = null; }
      if (!quads.length) return;
      const nx = (x1 - x0) * S + 1, nz = (y1 - y0) * S + 1;
      const map = new Int32Array(nx * nz).fill(-1);
      const pos = [], wa = [], idx = [];
      const vert = (gx, gz) => {
        const li = (gz - y0 * S) * nx + (gx - x0 * S);
        if (map[li] >= 0) return map[li];
        const gi = gz * GW + gx;
        let lvl = f.wl[gi];
        const tx = clamp(Math.floor(gx / S - 0.001), 0, W - 1), tz = clamp(Math.floor(gz / S - 0.001), 0, H - 1);
        if (!(lvl > -1e8)) { lvl = f.tileWL[tz * W + tx]; if (!(lvl === lvl)) lvl = f.g[gi] - 0.3; }
        // Fluss oder stehendes Wasser
        let rv = 0, n = 0;
        for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
          const ax = clamp(Math.floor(gx / S) + dx + (gx % S ? 1 : 0), 0, W - 1), az = clamp(Math.floor(gz / S) + dz + (gz % S ? 1 : 0), 0, H - 1);
          const k = wk[az * W + ax]; if (k) { n++; if (k === 3) rv++; }
        }
        map[li] = pos.length / 3;
        pos.push(gx / S, lvl, gz / S);
        wa.push(lvl - f.g[gi], n ? rv / n : 1, 0);
        return map[li];
      };
      for (let q = 0; q < quads.length; q += 2) {
        const tx = quads[q], ty = quads[q + 1];
        for (let sz = 0; sz < S; sz++) for (let sx = 0; sx < S; sx++) {
          const gx = tx * S + sx, gz = ty * S + sz;
          const a = vert(gx, gz), b = vert(gx + 1, gz), cc = vert(gx, gz + 1), d = vert(gx + 1, gz + 1);
          // Viereck ganz unter Land: weglassen
          if (wa[a * 3] < -0.05 && wa[b * 3] < -0.05 && wa[cc * 3] < -0.05 && wa[d * 3] < -0.05) continue;
          idx.push(a, d, b, a, cc, d);
        }
      }
      if (!idx.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('wa', new THREE.Float32BufferAttribute(wa, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      geo.boundingSphere.radius += 0.2;
      const m = c.water = new THREE.Mesh(geo, this.wMat);
      m.matrixAutoUpdate = false; m.renderOrder = 1;
      this.root.add(m);
    },

    // Meer rund um die Karte und Kanten der Karte
    buildFrame(ctx) {
      const W = this.W, H = this.H, f = ctx.field, E = 900;
      const pos = [], wa = [], idx = [];
      const quad = (ax, az, bx, bz) => {
        const o = pos.length / 3;
        pos.push(ax, 0, az, bx, 0, az, ax, 0, bz, bx, 0, bz);
        for (let i = 0; i < 4; i++) wa.push(6, 0, 0);
        idx.push(o, o + 3, o + 1, o, o + 2, o + 3);
      };
      quad(-E, -E, W + E, 0); quad(-E, H, W + E, H + E); quad(-E, 0, 0, H); quad(W, 0, W + E, H);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('wa', new THREE.Float32BufferAttribute(wa, 3));
      geo.setIndex(idx);
      const m = this.outer = new THREE.Mesh(geo, this.wMat);
      m.frustumCulled = false; m.renderOrder = 1;
      this.root.add(m);
      this.buildSkirt(ctx);
    },
    buildSkirt(ctx) {
      const f = ctx.field, GW = f.GW, GH = f.GH;
      if (this.skirt) { this.root.remove(this.skirt); this.skirt.geometry.dispose(); }
      const pos = [], col = [], idx = [], aux = [], nor = [];
      const edge = (pts, nx, nz) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
          const ay = f.heightAt(ax, az), by = f.heightAt(bx, bz), o = pos.length / 3;
          pos.push(ax, ay, az, bx, by, bz, ax, -6, az, bx, -6, bz);
          for (let k = 0; k < 4; k++) { col.push(0.16, 0.12, 0.09); aux.push(0, 1, 0, 0); nor.push(nx, 0, nz); }
          idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
        }
      };
      const top = [], bot = [], lft = [], rgt = [];
      for (let gx = 0; gx < GW; gx++) { top.push([gx / S, 0]); bot.push([gx / S, f.H]); }
      for (let gz = 0; gz < GH; gz++) { lft.push([0, gz / S]); rgt.push([f.W, gz / S]); }
      edge(top.slice().reverse(), 0, -1); edge(bot, 0, 1); edge(lft, -1, 0); edge(rgt.slice().reverse(), 1, 0);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setAttribute('aux', new THREE.Float32BufferAttribute(aux, 4));
      geo.setIndex(idx);
      const m = this.skirt = new THREE.Mesh(geo, this.tMat);
      m.frustumCulled = false;
      this.root.add(m);
    },

    // Dunst der Verschmutzung: weiche, bewegte Schicht über dem Land
    buildSmog(ctx) {
      const pw = this.pw, ph = this.ph, cell = this.pCell, f = ctx.field;
      const nx = pw + 1, nz = ph + 1;
      const pos = new Float32Array(nx * nz * 3);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const k = (j * nx + i) * 3, x = Math.min(i * cell, this.W), z = Math.min(j * cell, this.H);
        let m = 0;
        for (let dz = -cell; dz <= cell; dz += cell / 2) for (let dx = -cell; dx <= cell; dx += cell / 2) m = Math.max(m, ctx.surfaceAt(clamp(x + dx, 0, this.W), clamp(z + dz, 0, this.H)));
        pos[k] = x; pos[k + 1] = m + 1.6; pos[k + 2] = z;
      }
      const idx = [];
      for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; idx.push(a, a + nx + 1, a + 1, a, a + nx, a + nx + 1); }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(idx);
      this.smogMat = new THREE.ShaderMaterial({
        uniforms: Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), { uPol: { value: this.polTex }, uPolMap: this.un.uPolMap, uDetail: { value: ctx.tex('detail') }, uTime: ctx.uniforms.uTime, uAir: this.un.uAir }),
        transparent: true, depthWrite: false, fog: true,
        vertexShader: '#include <fog_pars_vertex>\nvarying vec3 vW;\nvoid main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; vec4 mvPosition = viewMatrix * vec4(vW,1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}',
        fragmentShader: [
          'uniform sampler2D uPol, uDetail; uniform vec2 uPolMap; uniform float uTime, uAir; varying vec3 vW;',
          '#include <common>',
          '#include <fog_pars_fragment>',
          'void main(){',
          '  float p = texture2D(uPol, vW.xz / uPolMap).r;',
          '  float n = texture2D(uDetail, vW.xz * 0.045 + vec2(uTime * 0.008, uTime * 0.005)).g * 0.6 + texture2D(uDetail, vW.xz * 0.11 - vec2(uTime * 0.01, 0.0)).r * 0.4;',
          '  float a = smoothstep(0.2, 0.85, p) * (0.35 + 0.65 * n) * 0.55;',
          '  if (uAir > 0.5) a *= 0.3;',
          '  if (a < 0.004) discard;',
          '  gl_FragColor = vec4(vec3(0.42, 0.37, 0.29) * (0.8 + 0.4 * n), a);',
          '  #include <tonemapping_fragment>',
          '  #include <encodings_fragment>',
          '  #include <fog_fragment>',
          '}'
        ].join('\n')
      });
      const m = this.smog = new THREE.Mesh(geo, this.smogMat);
      m.renderOrder = 5; m.frustumCulled = false; m.visible = false;
      this.root.add(m);
    },

    // ---------------------------------------------------------------- Änderungen
    onTerrain(ctx, r) {
      const st = ctx.state, W = this.W;
      for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) this.setTile(st, y * W + x);
      const cx0 = Math.floor(Math.max(0, r.x0 - 2) / CH), cx1 = Math.floor(Math.min(W - 1, r.x1 + 2) / CH);
      const cy0 = Math.floor(Math.max(0, r.y0 - 2) / CH), cy1 = Math.floor(Math.min(this.H - 1, r.y1 + 2) / CH);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.buildChunk(ctx, this.chunks[cy * this.cw + cx]);
      if (r.x0 <= 2 || r.y0 <= 2 || r.x1 >= W - 3 || r.y1 >= this.H - 3) this.buildSkirt(ctx);
      this.effT = 0;
      this.smogDirty = true;
    },

    // Gebietsfarben und Grenzen (Canvas, nur geänderte Bereiche neu)
    updateTerritory(ctx, full) {
      const st = ctx.state, W = this.W, H = this.H, N = W * H, kt = this.kt;
      if (!st.owner || !st.cities) return;
      const cityK = new Map(), kCol = new Map();
      for (const k of st.kingdoms || []) kCol.set(k.id, k.colorIndex | 0);
      for (const c of st.cities) if (kCol.has(c.kingdomId)) cityK.set(c.id, c.kingdomId);
      const sig = Array.from(kCol.entries()).join(';');
      if (sig !== this.kSig) { this.kSig = sig; full = true; }
      this.kCol = kCol;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let i = 0; i < N; i++) {
        const o = st.owner[i];
        const k = o >= 0 && cityK.has(o) ? cityK.get(o) : -1;
        if (kt[i] !== k || full) {
          kt[i] = k;
          const x = i % W, y = (i / W) | 0;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      if (x1 < 0) return;
      x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(W - 1, x1 + 1); y1 = Math.min(H - 1, y1 + 1);
      const g = this.terrG, P = this.P;
      g.clearRect(x0 * P, y0 * P, (x1 - x0 + 1) * P, (y1 - y0 + 1) * P);
      const lw = Math.max(1, Math.round(P * 0.16));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * W + x, k = kt[i];
        if (k < 0) continue;
        const main = ctx.teamColor(kCol.get(k) | 0).clone().convertLinearToSRGB().getStyle();
        const px = x * P, py = y * P;
        g.globalAlpha = 0.14; g.fillStyle = main; g.fillRect(px, py, P, P);
        const n = y > 0 ? kt[i - W] : -2, e = x < W - 1 ? kt[i + 1] : -2, s = y < H - 1 ? kt[i + W] : -2, w = x > 0 ? kt[i - 1] : -2;
        if (n !== k || e !== k || s !== k || w !== k) {
          g.globalAlpha = 0.95;
          if (n !== k) g.fillRect(px, py, P, lw);
          if (s !== k) g.fillRect(px, py + P - lw, P, lw);
          if (w !== k) g.fillRect(px, py, lw, P);
          if (e !== k) g.fillRect(px + P - lw, py, lw, P);
          g.globalAlpha = 0.35;
          if (n !== k) g.fillRect(px, py + lw, P, lw * 2);
          if (s !== k) g.fillRect(px, py + P - lw * 3, P, lw * 2);
          if (w !== k) g.fillRect(px + lw, py, lw * 2, P);
          if (e !== k) g.fillRect(px + P - lw * 3, py, lw * 2, P);
        }
      }
      g.globalAlpha = 1;
      this.terrTex.needsUpdate = true;
    },

    // Rodung, Brand, Krater, Fallout, Kahlheit, Trübung
    updateEffects(ctx) {
      const st = ctx.state, W = this.W, H = this.H, d = this.effData, TW = W * 2;
      const LUT = WW.TERRAIN_LUT, T = WW.T;
      d.fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, t = st.terrain[i];
        let charred = 0, fall = 0, crater = 0, bare = 0;
        const m = st.mark ? st.mark[i] : 0;
        if (m >= 100) crater = Math.min(1, (m - 100) / 40 + 0.5);
        else if (m > 0) charred = Math.min(1, m / 50 + 0.3);
        if (st.fire && st.fire[i]) charred = Math.max(charred, 0.7);
        if (st.fallout && st.fallout[i]) fall = Math.min(1, 0.3 + st.fallout[i] / 160);
        if (LUT.water[t]) { bare = t === T.RIVER && st.murk ? Math.min(1, st.murk[i] / 140) : 0; }
        else {
          if (st.cleared && st.cleared[i] > 0 && !LUT.wood[t]) bare = Math.max(bare, Math.min(0.55, st.cleared[i] / 400 + 0.15));
          if (st.graze && st.graze[i] >= 128 && LUT.fertile[t] > 0) bare = Math.max(bare, (st.graze[i] - 128) / 260);
          if (st.barren && st.barren[i] > 0) bare = Math.max(bare, 0.5);
          if (st.crack && st.crack[i]) charred = Math.max(charred, Math.min(0.8, st.crack[i] / 200));
        }
        if (!(charred || fall || crater || bare)) continue;
        const R = charred * 255, G = fall * 255, B = crater * 255, A = bare * 255;
        for (let sy = 0; sy < 2; sy++) for (let sx = 0; sx < 2; sx++) {
          const o = ((y * 2 + sy) * TW + x * 2 + sx) * 4;
          d[o] = R; d[o + 1] = G; d[o + 2] = B; d[o + 3] = A;
        }
      }
      // große Narben: Krater rund, mit hellem Rand; Risse als Linie
      if (st.scars) for (const sc of st.scars) {
        if (!sc) continue;
        const fade = sc.ttl != null ? clamp(sc.ttl / 600, 0, 1) : 1;
        if (sc.kind === 'crater_m' || sc.kind === 'crater_l') {
          const rad = (sc.kind === 'crater_l' ? 2.5 : 1.5) * 2, cx = (Math.floor(sc.x) + 0.5) * 2, cy = (Math.floor(sc.y) + 0.5) * 2;
          for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
            if (x < 0 || y < 0 || x >= TW || y >= H * 2) continue;
            const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad;
            const v = dd < 0.75 ? 1 : dd < 1.1 ? 0.25 : 0;
            const o = (y * TW + x) * 4;
            d[o + 2] = Math.max(d[o + 2], v * 255 * fade);
          }
        }
      }
      this.effTex.needsUpdate = true;
    },

    updatePollution(ctx) {
      const st = ctx.state, pol = st.pollution, d = this.polData;
      let any = false;
      if (pol && pol.length) {
        const mx = (pol instanceof Uint8Array || pol instanceof Uint8ClampedArray) ? 255 : 100;
        for (let i = 0; i < this.pw * this.ph && i < pol.length; i++) {
          const v = clamp(pol[i] / mx, 0, 1) * 255; d[i * 4] = v; if (v > 40) any = true;
        }
      }
      this.polTex.needsUpdate = true;
      this.smog.visible = any;
      if (any && this.smogDirty) { this.smogDirty = false; const old = this.smog; this.root.remove(old); old.geometry.dispose(); this.smogMat.dispose(); this.buildSmog(ctx); this.smog.visible = true; }
    },

    // ---------------------------------------------------------------- je Bild
    sync(ctx) {
      const dt = ctx.dt;
      this.terrT -= dt; this.effT -= dt; this.polT -= dt;
      if (this.terrT <= 0) { this.terrT = 0.4; this.updateTerritory(ctx, false); }
      if (this.effT <= 0) { this.effT = 0.6; this.updateEffects(ctx); }
      if (this.polT <= 0) { this.polT = 1.0; this.updatePollution(ctx); }
      const ov = ctx.overlay || {}, un = this.un;
      un.uTerrOn.value = ov.territory === false ? 0 : 1;
      un.uAir.value = ov.air ? 1 : 0;
      const b = ov.brush;
      if (b && b.x != null) {
        const kind = b.kind === 'tiles' ? 1 : b.kind === 'circle' ? 2 : b.kind === 'arrow' ? 3 : 4;
        un.uBrush.value.set(b.x, b.y, b.r || 1, kind);
        un.uBrush2.value.set(b.x2 != null ? b.x2 : b.x, b.y2 != null ? b.y2 : b.y, 0, 0);
      } else un.uBrush.value.w = 0;
      const sel = ov.selection;
      un.uSelKind.value = 0;
      if (sel) {
        const st = ctx.state;
        if (sel.kind === 'unit' && sel.obj && !sel.obj.dead) {
          const p = ctx.unitPos(sel.obj, this._p || (this._p = { x: 0, y: 0 }));
          un.uSel.value.set(p.x, p.y, 0.45, 0); un.uSelKind.value = 2;
        } else if (sel.kind === 'city' && sel.obj) {
          const c = sel.obj;
          const cs = st.structs && st.structs.find(s => s.type === 'center' && s.cityId === c.id && !s.dead);
          if (cs) un.uSel.value.set(cs.x - 0.15, cs.y - 0.15, cs.x + cs.w + 0.15, cs.y + cs.h + 0.15);
          else un.uSel.value.set(c.cx - 1, c.cy - 1, c.cx + 2, c.cy + 2);
          un.uSelKind.value = 1;
        } else if (sel.kind === 'struct' && sel.obj) {
          const s = sel.obj; un.uSel.value.set(s.x - 0.1, s.y - 0.1, s.x + (s.w || 1) + 0.1, s.y + (s.h || 1) + 0.1); un.uSelKind.value = 1;
        } else if (sel.x != null) {
          const x = Math.floor(sel.x), y = Math.floor(sel.y);
          un.uSel.value.set(x, y, x + 1, y + 1); un.uSelKind.value = 1;
        }
      }
    }
  };

  R3.registerLayer(layer);
  R3.terrainLayer = layer;

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
