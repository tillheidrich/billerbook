// Billerbook for macOS: Electron shell around the local server.
// Updates come from GitHub Releases (electron-updater), signed and notarized.
const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

app.setName('Billerbook');
process.env.BILLERBOOK_DATA ||= app.getPath('userData');

let win = null;
let base = null;

async function startServer() {
  // Reuse a Billerbook server that is already running (e.g. started by an MCP client).
  try {
    const info = JSON.parse(fs.readFileSync(path.join(process.env.BILLERBOOK_DATA, 'server.json'), 'utf8'));
    const r = await fetch(`http://127.0.0.1:${info.port}/api/system`);
    if (r.ok && (await r.json()).app === 'Billerbook') return `http://localhost:${info.port}`;
  } catch {}
  const { start } = await import(pathToFileURL(path.join(__dirname, '..', 'server.mjs')).href);
  let srv;
  try { srv = await start({ port: 4580 }); } catch { srv = await start({ port: 0 }); }
  return `http://localhost:${srv.address().port}`;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500, height: 960, minWidth: 1100, minHeight: 700,
    title: 'Billerbook', backgroundColor: '#1c1c1c',
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 16 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: false },
  });
  win.loadURL(base);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(base)) { e.preventDefault(); shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
}

ipcMain.handle('pick', async (_e, { kind, prompt }) => {
  const r = await dialog.showOpenDialog(win, { message: prompt || '', properties: kind === 'file' ? ['openFile'] : ['openDirectory', 'createDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle('reveal', (_e, p) => shell.showItemInFolder(p));

// ---------- updates ----------
let updater = null;
function setupUpdates() {
  if (!app.isPackaged) return;
  try { updater = require('electron-updater').autoUpdater; } catch { return; }
  updater.autoDownload = true;
  updater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, cancelId: 1,
      message: `Billerbook ${info.version} is ready`, detail: 'Restart to finish the update. Your projects stay where they are.',
    });
    if (response === 0) updater.quitAndInstall();
  });
  updater.checkForUpdatesAndNotify().catch(() => {});
  setInterval(() => updater.checkForUpdates().catch(() => {}), 6 * 3600e3);
}
async function checkNow() {
  if (!updater) { dialog.showMessageBox(win, { message: 'Updates are available in the installed app only.' }); return; }
  try {
    const r = await updater.checkForUpdates();
    if (!r || r.updateInfo.version === app.getVersion()) dialog.showMessageBox(win, { message: `You are up to date (${app.getVersion()}).` });
  } catch (e) { dialog.showMessageBox(win, { type: 'warning', message: 'Update check failed', detail: String(e.message || e) }); }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ label: 'Billerbook', submenu: [
      { role: 'about' }, { label: 'Check for Updates…', click: checkNow }, { type: 'separator' },
      { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' },
    ] }] : []),
    { label: 'File', submenu: [
      { label: 'Show Data Folder', click: () => shell.openPath(process.env.BILLERBOOK_DATA) },
      { label: 'Show Exports', click: () => shell.openPath(path.join(app.getPath('desktop'), 'Billerbook-Export')) },
      { type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [
      { label: 'Billerbook Website', click: () => shell.openExternal('https://billerbook.heidrich-digital.de') },
      { label: 'Source Code on GitHub', click: () => shell.openExternal('https://github.com/tillheidrich/billerbook') },
      { label: 'Report an Issue', click: () => shell.openExternal('https://github.com/tillheidrich/billerbook/issues/new/choose') },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const single = app.requestSingleInstanceLock();
if (!single) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(async () => {
  app.setAboutPanelOptions({ applicationName: 'Billerbook', applicationVersion: app.getVersion(), copyright: '© 2026 Till Heidrich · AGPL-3.0', website: 'https://billerbook.heidrich-digital.de' });
  buildMenu();
  try { base = await startServer(); } catch (e) { dialog.showErrorBox('Billerbook could not start', String(e.stack || e)); app.quit(); return; }
  createWindow();
  setupUpdates();
});
app.on('activate', () => { if (!win && base) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
