// Wuselwelt als Desktop-Programm: ein Fenster, das die gebündelte Einzeldatei game/index.html lädt.
'use strict';
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const GAME = path.join(__dirname, 'game', 'index.html');
const GAME_URL = pathToFileURL(GAME).href;
// Einzige Adressen außerhalb der Datei: Google Fonts (ohne Netz greift die Ersatzschrift)
const ALLOWED_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

let win = null;

// Nur eine Instanz: ein zweiter Start holt das vorhandene Fenster nach vorn
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
  app.whenReady().then(start);
}

function start() {
  Menu.setApplicationMenu(null);
  const ses = session.defaultSession;

  // Netz: nur lokale Dateien und Google Fonts
  ses.webRequest.onBeforeRequest((details, cb) => {
    let ok = false;
    try {
      const u = new URL(details.url);
      ok = ['file:', 'data:', 'blob:', 'devtools:'].includes(u.protocol) ||
        (u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname));
    } catch (e) { ok = false; }
    cb({ cancel: !ok });
  });
  // Keine Kamera, kein Mikrofon usw.; nur Vollbild ist erlaubt
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(permission === 'fullscreen'));
  ses.setPermissionCheckHandler((wc, permission) => permission === 'fullscreen');

  win = new BrowserWindow({
    title: 'Wuselwelt',
    width: 1280,
    height: 800,
    minWidth: 640,
    minHeight: 420,
    show: false,
    backgroundColor: '#0f2a35',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required' // Ton ohne vorherigen Klick
    }
  });
  win.removeMenu();

  // Titel bleibt „Wuselwelt"
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle('Wuselwelt'); });

  // F11 = Vollbild an/aus
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11' && !input.alt && !input.control && !input.meta) {
      e.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  // Keine fremden Seiten im Fenster; http(s)-Links öffnen im normalen Browser
  const openOutside = (url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.split('#')[0] !== GAME_URL) { e.preventDefault(); openOutside(url); }
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());

  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.on('closed', () => { win = null; });

  if (fs.existsSync(GAME)) {
    win.loadFile(GAME);
  } else {
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
      '<meta charset="utf-8"><title>Wuselwelt</title><body style="font:16px sans-serif;background:#0f2a35;color:#fff;padding:2em">' +
      'Spieldatei fehlt: game/index.html. Bitte zuerst <code>node app/prepare.js</code> ausführen.</body>'));
    win.show();
  }
}

// Spielstände (localStorage) vor dem Beenden sicher auf die Platte schreiben
app.on('before-quit', () => { try { session.defaultSession.flushStorageData(); } catch (e) { /* egal */ } });
app.on('window-all-closed', () => app.quit());
