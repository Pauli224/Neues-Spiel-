// Kleine DOM-Helfer für die Oberfläche: Elemente bauen, Pixel-Icons aus den Sprites.
(function (WW) { 'use strict';

  // h('div.klasse#id', { attr }, [kinder]) – Kinder: Knoten, Text, Arrays, null
  function h(sel, attrs, kids) {
    if (Array.isArray(attrs) || typeof attrs === 'string' || (attrs && attrs.nodeType)) { kids = attrs; attrs = null; }
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
    const el = document.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, n) => { if (t === '.') el.classList.add(n); else el.id = n; });
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'on') { for (const ev in v) el.addEventListener(ev, v[ev]); }
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    add(el, kids);
    return el;
  }
  function add(el, kids) {
    if (kids == null || kids === false) return;
    if (Array.isArray(kids)) { for (const k of kids) add(el, k); return; }
    el.appendChild(kids.nodeType ? kids : document.createTextNode(String(kids)));
  }

  // Pixel-Icon als Canvas (CSS-Größe px), gecacht je Schlüssel/Team/Maßstab
  const cache = new Map();
  function icon(key, px, team, label) {
    const S = WW.Sprites;
    px = px || 32;
    if (!S.has(key)) return placeholder(label || key.replace(/^(i_a_|i_t_|i_|a_|t_|s_|u_)/, ''), px);
    const inf = S.info(key);
    const dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    const big = inf ? Math.max(inf.w, inf.h) : 16;
    const scale = Math.max(1, Math.round(px * dpr / big));
    const trim = /^(u_|a_)/.test(key);   // Figuren: auf das Motiv zuschneiden, damit sie nicht klein wirken
    const ck = key + '|' + scale + '|' + (team == null ? '' : team) + (trim ? '|t' : '');
    let src = cache.get(ck);
    if (!src) {
      src = S.iconCanvas(key, trim ? Math.max(1, Math.round(scale * 2)) : scale, team);
      if (trim && src) src = trimCanvas(src);
      cache.set(ck, src);
    }
    if (trim && src) {
      const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
      cv.getContext('2d').drawImage(src, 0, 0);
      cv.className = 'ico'; cv.setAttribute('aria-hidden', 'true');
      const m = Math.max(src.width, src.height);
      cv.style.width = Math.round(px * src.width / m) + 'px'; cv.style.height = Math.round(px * src.height / m) + 'px';
      return cv;
    }
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    cv.getContext('2d').drawImage(src, 0, 0);
    cv.className = 'ico';
    // Seitenverhältnis wahren
    const w = inf ? inf.w : 16, hh = inf ? inf.h : 16, m = Math.max(w, hh);
    cv.style.width = Math.round(px * w / m) + 'px';
    cv.style.height = Math.round(px * hh / m) + 'px';
    cv.setAttribute('aria-hidden', 'true');
    return cv;
  }
  // durchsichtigen Rand abschneiden (1 px Luft bleibt)
  function trimCanvas(src) {
    const w = src.width, hh = src.height;
    if (!w || !hh) return src;
    const d = src.getContext('2d').getImageData(0, 0, w, hh).data;
    let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return src;
    const out = document.createElement('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext('2d').drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  // neutrales Platzhalter-Icon: Pixel-Kachel mit Anfangsbuchstaben
  function placeholder(label, px) {
    const dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    const n = 16, sc = Math.max(1, Math.round(px * dpr / n));
    const cv = document.createElement('canvas'); cv.width = n * sc; cv.height = n * sc;
    const g = cv.getContext('2d');
    g.fillStyle = '#0a1a21'; g.fillRect(sc, sc, 14 * sc, 14 * sc);
    g.fillStyle = '#2a5261'; g.fillRect(2 * sc, 2 * sc, 12 * sc, 12 * sc);
    g.fillStyle = '#f2b541'; g.font = '700 ' + (10 * sc) + 'px ' + (WW.Renderer ? WW.Renderer.FONT_PIXEL : 'monospace');
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(label || '?').charAt(0).toUpperCase(), 8 * sc, 8.6 * sc);
    cv.className = 'ico'; cv.style.width = px + 'px'; cv.style.height = px + 'px';
    cv.setAttribute('aria-hidden', 'true');
    return cv;
  }

  // Icon in quadratischem Rahmen zentriert (gleich große Knöpfe)
  function iconBox(key, px, team) {
    const c = icon(key, px, team);
    const box = h('span', { style: { width: px + 'px', height: px + 'px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' } }, c);
    box.className = 'ico';
    return box;
  }

  // alle <i data-icon="..."> im Dokument füllen
  function fillIcons(root) {
    for (const el of (root || document).querySelectorAll('i[data-icon]')) {
      if (el.firstChild) continue;
      const px = +(el.getAttribute('data-size') || 0) || (el.closest('.stat') ? 20 : 30);
      el.appendChild(icon(el.getAttribute('data-icon'), px));
    }
  }

  function fmt(n) {
    n = Math.round(n || 0);
    return n >= 10000 ? (n / 1000).toFixed(0) + 'k' : String(n);
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  // localStorage nur geschützt
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { window.localStorage.removeItem(k); } catch (e) { /* egal */ } }
  };

  WW.UI = WW.UI || {};
  WW.UI.dom = { h: h, add: add, icon: icon, iconBox: iconBox, fillIcons: fillIcons, fmt: fmt, clear: clear, store: store };

})(typeof window !== 'undefined' ? (window.WW = window.WW || {}) : (globalThis.WW = globalThis.WW || {}));
