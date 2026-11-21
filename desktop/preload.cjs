const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('billerbook', {
  desktop: true,
  pathFor: (file) => { try { return webUtils.getPathForFile(file); } catch { return null; } },
  pick: (kind, prompt) => ipcRenderer.invoke('pick', { kind, prompt }),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
});
window.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('desktop'));
