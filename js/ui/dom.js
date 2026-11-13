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
  function icon(key, px, team) {
    const S = WW.Sprites;
    px = px || 32;
    if (!S.has(key)) key = 'b_question';
    const inf = S.info(key);
    const dpr = Math.min(3, Math.max(1, Math.round(window.devicePixelRatio || 1)));
    const big = inf ? Math.max(inf.w, inf.h) : 16;
    const scale = Math.max(1, Math.round(px * dpr / big));
    const ck = key + '|' + scale + '|' + (team == null ? '' : team);
    let src = cache.get(ck);
    if (!src) { src = S.iconCanvas(key, scale, team); cache.set(ck, src); }
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
