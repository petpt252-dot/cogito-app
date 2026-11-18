// COGITO desktop shell (Windows). Serves the built web app from dist/ over a private app:// scheme,
// so IndexedDB data lives in a stable origin under %APPDATA%\COGITO. No network access is needed.
'use strict';
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');

const DIST = path.join(__dirname, '..', 'dist');
const SMOKE = process.argv.includes('--smoke-test');

// Smoke tests never touch the real profile.
if (SMOKE) app.setPath('userData', path.join(os.tmpdir(), `cogito-smoke-${process.pid}`));

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

const SECOND_INSTANCE = !SMOKE && !app.requestSingleInstanceLock();
if (SECOND_INSTANCE) app.quit(); // the running instance is focused via 'second-instance'

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#090B16',
    title: 'COGITO',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });

  // External links (e.g. the Discord invite) open in the user's browser; the app window never leaves app://.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  win.once('ready-to-show', () => !SMOKE && win.show());
  win.loadURL('app://cogito/index.html');

  if (SMOKE) {
    win.webContents.once('did-finish-load', async () => {
      try {
        // Wait for React to render the dashboard, then report what is on screen.
        const result = await win.webContents.executeJavaScript(`new Promise((resolve) => {
          const t0 = Date.now();
          (function poll() {
            const h1 = document.querySelector('main h1');
            if (h1 || Date.now() - t0 > 8000) resolve({ title: document.title, h1: h1 && h1.textContent, idb: typeof indexedDB });
            else setTimeout(poll, 100);
          })();
        })`);
        console.log('SMOKE ' + JSON.stringify(result));
        app.exit(result.h1 ? 0 : 1);
      } catch (err) {
        console.error('SMOKE FAILED', err);
        app.exit(1);
      }
    });
  }
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  if (SECOND_INSTANCE) return;
  protocol.handle('app', (request) => {
    let p = decodeURIComponent(new URL(request.url).pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(DIST, p));
    if (!file.startsWith(DIST)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
