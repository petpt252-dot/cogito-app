// Renders public/icon.svg to build/icon.png (512×512, transparent corners) with Electron itself,
// so the Windows icon is the exact app logo. Run: npx electron electron/make-icon.cjs
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SRC = path.join(__dirname, '..', 'public', 'icon.svg');
const OUT = path.join(__dirname, '..', 'build', 'icon.png');

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  // Inline the SVG: a data: page cannot load file:// resources.
  const svg = fs.readFileSync(SRC, 'utf-8').replace('<svg ', '<svg width="512" height="512" ');
  const html = `<html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, img.resize({ width: 512, height: 512 }).toPNG());
  console.log('icon written', OUT, img.getSize());
  app.exit(0);
});
